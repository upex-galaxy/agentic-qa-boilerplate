import type { SentinelConfig, SentinelDeps, SentinelState } from './sentinel.ts';
/**
 * The real-world side of `board sentinel`: files, the port probe, the detached board server
 * and the exit. The decisions and the loop live in sentinel.ts (injected deps, tested there).
 */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { printable, printableJson } from './model.ts';
import {
  additions,
  cycle,
  freshBaseline,
  fromBaselineFile,
  inHours,
  parseClock,
  parseDays,
  parseHours,
  quickCheck,
  SENTINEL_DEFAULTS,
  signatureOf,
  syncStale,
  toBaselineFile,
  wakeLines,
  watchUntilWake,
} from './sentinel.ts';
import { appendEvent, BOARD_DIR, readEvents, readSprint, readTracker, REPO_ROOT, sprintDir, writeAtomic } from './store.ts';
import { markWatcherExit, registerWatcher } from './watchers.ts';

export interface SentinelFlags {
  every?: string
  hours?: string
  days?: string
  stopAt?: string
  recheckEvery?: string
  staleAfter?: string
  port?: string
  baseline?: string
  once: boolean
  dryRun: boolean
  /** The arguments after `sentinel`, echoed back as the re-arm command. */
  argv: string[]
}

function positiveInt(raw: string | undefined, fallback: number, field: string): number {
  if (raw === undefined) { return fallback; }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) { throw new Error(`${field} must be a whole number above 0 (got "${raw}")`); }
  return n;
}

export function configFrom(f: SentinelFlags): SentinelConfig {
  const d = SENTINEL_DEFAULTS;
  const cfg: SentinelConfig = {
    everyMin: positiveInt(f.every, d.everyMin, '--every'),
    hours: f.hours ? parseHours(f.hours) : d.hours,
    days: f.days ? parseDays(f.days) : d.days,
    stopAt: f.stopAt ? parseClock(f.stopAt, '--stop-at') : d.stopAt,
    recheckEveryMin: positiveInt(f.recheckEvery, d.recheckEveryMin, '--recheck-every'),
    staleAfterMin: positiveInt(f.staleAfter, d.staleAfterMin, '--stale-after'),
    port: positiveInt(f.port, d.port, '--port'),
    dryRun: f.dryRun,
  };
  if (cfg.stopAt < cfg.hours.end) { throw new Error('--stop-at must not fall inside --hours (it would stop the board the sentinel restarts on its next tick)'); }
  return cfg;
}

/** pids listening on the port. lsof exits 1 with no output when nothing listens. */
function listeningPids(port: number): number[] {
  const r = Bun.spawnSync(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  const out = r.stdout.toString().trim();
  if (r.exitCode !== 0 && r.exitCode !== 1) { throw new Error(`lsof failed (exit ${r.exitCode}): ${r.stderr.toString().trim()}`); }
  return out ? [...new Set(out.split('\n').map(Number).filter(Number.isInteger))] : [];
}

/** The command line `board:up` runs (package.json). Only a listener running it is ours to stop. */
const BOARD_SERVER_CMD = 'cli/sprint-board/index.ts serve';

/** The subset of `pids` that are the board server, by command line: another tool on the port is never stopped. */
function boardServerPids(pids: number[]): number[] {
  return pids.filter((pid) => {
    const r = Bun.spawnSync(['ps', '-o', 'command=', '-p', String(pid)]);
    return r.exitCode === 0 && r.stdout.toString().includes(BOARD_SERVER_CMD);
  });
}

const SERVER_LOG = join(BOARD_DIR, 'board-server.log');
const START_WAIT_MS = 30_000;

// Polled, not fs.watch: FSEvents reports real paths, which miss a log reached through a symlink.
function statKey(path: string): string {
  try {
    const s = statSync(path);
    return `${s.size}:${s.mtimeMs}`;
  }
  catch { return '-'; }
}

export async function runSentinel(slug: string, f: SentinelFlags): Promise<void> {
  const cfg = configFrom(f);
  const sprint = readSprint(slug);
  if (sprint.closedAt) { throw new Error(`${slug} is closed (${sprint.closedAt}); a sentinel watches an open board only`); }
  const baselinePath = f.baseline ? (isAbsolute(f.baseline) ? f.baseline : resolve(process.cwd(), f.baseline)) : undefined;
  const rearm = `bun run board sentinel ${f.argv.filter(x => x !== '--once' && x !== '--dry-run').join(' ')}`.trim();
  const log = (line: string) => console.error(printable(`${new Date().toISOString()} ${line}`));
  const read = () => ({ events: readEvents(slug).events, tracker: readTracker(slug) });

  if (f.once) {
    // Read-only: no lifecycle, no heartbeat, no baseline write.
    const now = new Date();
    const { events, tracker } = read();
    if (!tracker) { throw new Error(`source.json is missing on ${slug}: the board has never synced`); }
    const signature = signatureOf(events, tracker);
    const base = baselinePath && existsSync(baselinePath) ? fromBaselineFile(readFileSync(baselinePath, 'utf8'), slug, baselinePath) : null;
    const added = base?.baseline ? additions(base.baseline, signature) : null;
    const pids = listeningPids(cfg.port);
    const stale = syncStale(tracker.syncedAt, now, cfg);
    console.log(printableJson({
      slug,
      at: now.toISOString(),
      inHours: inHours(now, cfg),
      board: { port: cfg.port, pids },
      tracker: { syncedAt: tracker.syncedAt, ageMin: stale.ageMin, stale: stale.stale, discoverAt: tracker.discover?.at ?? null },
      baseline: baselinePath ? { path: relative(REPO_ROOT, baselinePath), found: Boolean(base) } : null,
      wouldWake: added ? `change (${added.parts.join(', ')})` : null,
      additions: added,
      signature,
    }, 2));
    return;
  }

  const deps: SentinelDeps = {
    now: () => new Date(),
    read,
    listening: async () => listeningPids(cfg.port),
    async startServer() {
      if (cfg.dryRun) { log(`dry-run: would start the board server (bun run board:up) on ${cfg.port}`); return true; }
      mkdirSync(dirname(SERVER_LOG), { recursive: true });
      const fd = openSync(SERVER_LOG, 'a');
      try {
        // detached = setsid: the server outlives this sentinel and the Claude session that started it.
        const child = spawn(process.execPath, ['run', 'board:up'], { cwd: REPO_ROOT, detached: true, stdio: ['ignore', fd, fd] });
        child.unref();
        log(`started the board server (pid ${child.pid}), log ${relative(REPO_ROOT, SERVER_LOG)}`);
      }
      finally { closeSync(fd); }
      for (let waited = 0; waited < START_WAIT_MS; waited += 1000) {
        await Bun.sleep(1000);
        if (listeningPids(cfg.port).length) { return true; }
      }
      log(`the board server did not listen on ${cfg.port} within ${START_WAIT_MS / 1000} s`);
      return false;
    },
    stopServer(pids) {
      if (cfg.dryRun) { log(`dry-run: would stop pid ${pids.join(', ')} (listening on ${cfg.port})`); return; }
      const ours = boardServerPids(pids);
      for (const pid of pids.filter(p => !ours.includes(p))) { log(`left pid ${pid} running: it listens on ${cfg.port} but is not the board server`); }
      for (const pid of ours) {
        try { process.kill(pid, 'SIGTERM'); log(`stopped the board server (pid ${pid}) at the end of working hours`); }
        catch (err) { log(`could not stop pid ${pid}: ${(err as Error).message}`); }
      }
    },
    heartbeat(note, counts) {
      if (cfg.dryRun) { return; }
      appendEvent(slug, { kind: 'watch.pass', by: 'sentinel', text: `Watch pass: ${note}`, data: counts });
    },
    log,
  };

  const st: SentinelState = { baseline: null, sweptAt: Date.now(), failures: 0, startFailures: 0 };
  if (baselinePath && existsSync(baselinePath)) {
    Object.assign(st, fromBaselineFile(readFileSync(baselinePath, 'utf8'), slug, baselinePath));
  }
  else {
    try {
      const { events, tracker } = read();
      if (tracker) { st.baseline = freshBaseline(events, signatureOf(events, tracker)); }
    }
    catch (err) { log(`no baseline yet, the first readable cycle sets it: ${(err as Error).message}`); }
  }

  let saved = '';
  const persist = () => {
    if (!baselinePath) { return; }
    const file = toBaselineFile(st, slug, new Date());
    if (!file) { return; }
    const key = JSON.stringify({ ...file, savedAt: '' });
    if (key === saved) { return; }
    saved = key;
    writeAtomic(baselinePath, `${JSON.stringify(file, null, 2)}\n`);
  };
  persist();
  if (!cfg.dryRun) { registerWatcher(slug, { name: 'sentinel', pid: process.pid, match: 'sentinel' }); }

  const eventsFile = join(sprintDir(slug), 'events.ndjson');
  const w = await watchUntilWake(cfg, {
    async tick() {
      const ticked = await cycle(cfg, deps, st);
      persist();
      return ticked;
    },
    statKey: () => statKey(eventsFile),
    sleep: async ms => Bun.sleep(ms),
    now: () => Date.now(),
    check: () => quickCheck(st, read(), new Date()),
    log,
  });
  persist();
  if (!cfg.dryRun) {
    // The wake below must reach the conductor even when the exit mark cannot be written.
    try { markWatcherExit(slug, 'sentinel', process.pid); }
    catch (err) { log(`could not record the clean exit: ${(err as Error).message}`); }
  }
  // Written and flushed before exiting: this text IS the wake the harness hands the conductor.
  await Bun.write(Bun.stdout, `${wakeLines(w, { at: new Date(), slug, rearm }).join('\n')}\n`);
  process.exit(0);
}
