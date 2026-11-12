#!/usr/bin/env bun
/**
 * One full, read-only reading of git, GitHub, Orca and the board's tracker read. Writes the fact
 * documents the Sprint Board's Merge Line view renders (.session/gitflow-master/docs/). The board
 * server runs it every 90 s (`serve --merge-every`). Never writes to GitHub, never touches an
 * index or a working tree. The TypeScript port of the source repo's gitflow-collect.sh and
 * gitflow-lib.sh: no bash, jq, perl or BSD tools.
 *
 *   bun cli/sprint-board/merge-collect.ts --preflight
 *   bun cli/sprint-board/merge-collect.ts [--boot|--close] --reason <poll|boot|owner|...>
 *   bun cli/sprint-board/merge-collect.ts --record <dir> ...    also save the raw reading into <dir>
 *   MERGE_FIXTURE_DIR=<dir> ...                                  build from a recorded reading, no network
 *
 * Last stdout line: COLLECT ok | COLLECT degraded <source> | COLLECT fail <reason>
 * Exit: 0 ok, 3 degraded, 2 fail.
 */
import type { BuildParams, GitReading, PrReading, Reading, TrackerRow } from './merge-build.ts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { buildDocuments, planOf, stableJson } from './merge-build.ts';
import { currentSlug, readTracker, REPO_ROOT } from './store.ts';
import { boardConfig, CODE_ROOT } from './sync.ts';

const ROOT = process.env.MERGE_ROOT ?? REPO_ROOT;
const STATE = process.env.MERGE_STATE_DIR ?? join(REPO_ROOT, '.session', 'gitflow-master');
const WIN_OPEN = process.env.MERGE_OPEN ?? '09:00';
const WIN_CLOSE = process.env.MERGE_CLOSE ?? '21:00';
const DAYS = process.env.MERGE_DAYS ?? '1 2 3 4 5';
const HEARTBEAT_S = Number(process.env.MERGE_HEARTBEAT_S ?? 3000);

type Json = Record<string, any>; // eslint-disable-line ts/no-explicit-any -- raw GitHub and Orca JSON

// --- process helpers (the source's gfm_to / ghx / orcax) -----------------------------------

interface Ran { code: number, out: string, err: string }
/** Runs a command with a timeout; a kill on timeout reads as exit 142, like the source's perl alarm. */
async function sh(cmd: string[], timeoutMs: number, cwd = ROOT): Promise<Ran> {
  try {
    const p = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    let killed = false;
    const t = setTimeout(() => { killed = true; p.kill(); }, timeoutMs);
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    await p.exited;
    clearTimeout(t);
    return { code: killed ? 142 : (p.exitCode ?? 1), out, err };
  }
  catch (e) {
    return { code: 127, out: '', err: (e as Error).message };
  }
}
const git = async (args: string[], timeoutMs = 20_000) => sh(['git', '-C', ROOT, ...args], timeoutMs);
const parse = <T>(s: string, fallback: T): T => {
  try { return JSON.parse(s) as T; }
  catch { return fallback; }
};

/**
 * Conditional GET with an on-disk ETag cache. Returns the body (the cached one on a 304), or null.
 * A 304 does not consume REST quota (measured on the source repo).
 */
async function ghx(key: string, path: string): Promise<string | null> {
  const etagf = join(STATE, 'cache', `${key}.etag`);
  const bodyf = join(STATE, 'cache', `${key}.json`);
  const hdr = existsSync(etagf) && existsSync(bodyf) ? ['-H', `If-None-Match: ${readFileSync(etagf, 'utf8').trim()}`] : [];
  const r = await sh(['gh', 'api', '-i', ...hdr, path], 30_000);
  const text = r.out.replace(/\r/g, '');
  const code = /^HTTP\/[\d.]+ (\d{3})/.exec(text)?.[1];
  if (code === '304') { return readFileSync(bodyf, 'utf8'); }
  if (code !== '200') { return null; }
  const split = text.indexOf('\n\n');
  const head = split >= 0 ? text.slice(0, split) : text;
  const body = split >= 0 ? text.slice(split + 2) : '';
  const etag = /^etag:[ \t]*(\S.*)$/im.exec(head)?.[1]?.trim();
  if (etag) { writeFileSync(etagf, `${etag}\n`); }
  writeFileSync(bodyf, body);
  return body;
}

/** Unconditional paginated GET, every page's array joined into one. */
async function ghxPages(path: string): Promise<Json[]> {
  const r = await sh(['gh', 'api', '--paginate', '--slurp', path], 60_000);
  const pages = parse<unknown[]>(r.out, []);
  return pages.flatMap(p => (Array.isArray(p) ? p : [])) as Json[];
}

/** The orchestrator's CLI, named in `orchestration.orchestrator_cli`; empty = no owner join. */
function orchestratorCli(): string {
  try {
    const y = parseYaml(readFileSync(join(CODE_ROOT, '.agents', 'project.yaml'), 'utf8')) as Json;
    return String(y?.orchestration?.orchestrator_cli ?? '').trim();
  }
  catch { return ''; }
}
async function orcax(...args: string[]): Promise<Json> {
  const cli = orchestratorCli();
  if (!cli) { return {}; }
  const r = await sh([cli, ...args, '--json'], 20_000);
  return r.code === 0 ? parse<Json>(r.out, {}) : {};
}

/** `owner/name` of the GitHub repository behind `origin`, or null for another host. */
export function githubRepo(url: string): string | null {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

// --- time (the source's gfm_now / gfm_iso / gfm_next_open), in board.timezone --------------

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoS = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
function atLocal(d: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const x = new Date(d);
  x.setHours(h, m ?? 0, 0, 0);
  return x;
}
/** The next scheduled open, skipping days outside the window's days (1 = Monday ... 7 = Sunday). */
function nextOpen(now: Date): string {
  const days = DAYS.split(' ').map(Number);
  for (let i = 0; i <= 7; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    const wd = day.getDay() === 0 ? 7 : day.getDay();
    if (!days.includes(wd)) { continue; }
    const at = atLocal(day, WIN_OPEN);
    if (at > now) { return isoS(at); }
  }
  return '';
}

const log = (line: string) => {
  try { writeFileSync(join(STATE, 'collect.log'), `${new Date().toISOString()} ${line}\n`, { flag: 'a' }); }
  catch { /* the log never stops a run */ }
};
const hash12 = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const touch = (f: string) => {
  try {
    if (existsSync(f)) { const t = new Date(); utimesSync(f, t, t); }
    else { writeFileSync(f, ''); }
  }
  catch { /* liveness only */ }
};

// --- the board's side: config and the tracker read ------------------------------------------

interface BoardSide { mainBranch: string, requiredApprovals: number, timezone: string, ticketKey: string, tracker: Record<string, TrackerRow>, warn?: string }
function boardSide(): BoardSide {
  const tzNow = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  let mainBranch = 'main';
  let requiredApprovals = 1;
  let timezone = tzNow;
  let ticketKey = '[A-Z][A-Z0-9]+-\\d+';
  let warn: string | undefined;
  try {
    const c = boardConfig();
    mainBranch = c.mainline ?? mainBranch;
    requiredApprovals = c.requiredApprovals ?? requiredApprovals;
    timezone = c.timezone ?? timezone;
    ticketKey = c.ticketKeyPattern.source.replace(/^\^/, '').replace(/\$$/, '');
  }
  catch (e) { warn = `board config: ${(e as Error).message.split('\n')[0]}`; }
  // Tracker parity reads what the board's own sync stored: no tracker call every 90 s.
  const tracker: Record<string, TrackerRow> = {};
  try {
    const t = readTracker(currentSlug());
    for (const [id, row] of Object.entries(t?.tickets ?? {})) { if (row.status) { tracker[id] = { status: row.status, bucket: row.bucket }; } }
  }
  catch { /* no board yet: parity is unknown, never wrong */ }
  return { mainBranch, requiredApprovals, timezone, ticketKey, tracker, warn };
}

// --- 1. gather -------------------------------------------------------------------------------

async function gather(mainBranch: string): Promise<{ reading: Reading, degraded: string }> {
  let degraded = '';
  const reading: Reading = { pulls: [], closed: [], prs: {}, git: { pr: {}, pairs: [], mainSha: '' }, refs: [], refCounts: [], worktrees: [], orcaWorktrees: {}, orcaTerminals: {}, lsRemote: [], viewer: '', tracker: {} };
  const origin = (await git(['remote', 'get-url', 'origin'])).out.trim();
  const repo = githubRepo(origin);

  // git: ls-remote first; fetch only when the refs the board cares about moved.
  const ls = await git(['ls-remote', '--heads', 'origin']);
  if (ls.code === 0 && ls.out.trim()) {
    reading.lsRemote = ls.out.trim().split('\n').map(l => l.split('\t'));
    const want = hash12(ls.out);
    const mark = join(STATE, 'cache', 'last-fetch.lsremote');
    if ((existsSync(mark) ? readFileSync(mark, 'utf8').trim() : '') !== want) {
      if ((await git(['fetch', 'origin', '--prune', '--no-tags', '--quiet'], 60_000)).code === 0) { writeFileSync(mark, `${want}\n`); }
    }
  }
  else {
    degraded = 'git';
  }

  // who the page is for: the account gh reads as (cached a day)
  const vf = join(STATE, 'cache', 'viewer.txt');
  if (!existsSync(vf) || Date.now() - statSync(vf).mtimeMs >= 86_400_000) {
    const v = await sh(['gh', 'api', 'user', '--jq', '.login'], 20_000);
    if (v.code === 0 && v.out.trim()) { writeFileSync(vf, v.out.trim()); }
  }
  reading.viewer = existsSync(vf) ? readFileSync(vf, 'utf8').trim() : '';

  // GitHub
  const R = repo ? `repos/${repo}` : '';
  const pulls = !degraded && R ? await ghx('pulls', `${R}/pulls?state=open&per_page=100`) : null;
  const pullList = pulls === null ? null : parse<unknown>(pulls, null);
  if (!degraded && Array.isArray(pullList)) {
    reading.pulls = pullList as Json[];
    reading.closed = parse<Json[]>(await ghx('closed', `${R}/pulls?state=closed&sort=updated&direction=desc&per_page=30`) ?? '[]', []);
    for (const p of reading.pulls) {
      const n = String(p.number);
      const pr = await ghx(`pr-${n}`, `${R}/pulls/${n}`);
      if (pr === null) { degraded = 'github'; break; }
      const prJ = parse<Json>(pr, {});
      const sha = String(prJ.head?.sha ?? '');
      const get = async (key: string, path: string, fb: string) => parse(await ghx(key, path) ?? fb, JSON.parse(fb));
      const [owner, name] = repo!.split('/');
      const th = await sh(['gh', 'api', 'graphql', '-F', `n=${n}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-f', 'query=query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved comments(first:1){nodes{author{login}}}}}}}}'], 30_000);
      const nodes = parse<Json>(th.out, {})?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
      // gh pr view --json files stops at 100 files; the REST list paginates. Cached by head SHA.
      const fc = join(STATE, 'cache', `files-${n}-${sha}.json`);
      if (!existsSync(fc)) { writeFileSync(fc, JSON.stringify((await ghxPages(`${R}/pulls/${n}/files?per_page=100`)).map(f => f.filename))); }
      const pr0: PrReading = {
        pr: prJ,
        reviews: await get(`reviews-${n}`, `${R}/pulls/${n}/reviews?per_page=100`, '[]'),
        rcomments: await get(`rcomments-${n}`, `${R}/pulls/${n}/comments?per_page=100`, '[]'),
        icomments: await get(`icomments-${n}`, `${R}/issues/${n}/comments?per_page=100`, '[]'),
        events: await get(`events-${n}`, `${R}/issues/${n}/events?per_page=100`, '[]'),
        checks: await get(`checks-${sha}`, `${R}/commits/${sha}/check-runs?per_page=100`, '{}'),
        status: await get(`status-${sha}`, `${R}/commits/${sha}/status`, '{}'),
        threads: (nodes as Json[]).map(x => ({ resolved: Boolean(x.isResolved), author: String(x.comments?.nodes?.[0]?.author?.login ?? '') })),
        files: parse<string[]>(readFileSync(fc, 'utf8'), []),
      };
      reading.prs[n] = pr0;
    }
  }
  else if (!degraded) {
    degraded = 'github';
  }

  if (!degraded) {
    // git facts per PR and per pair. merge-tree writes tree objects only, never an index.
    const g: GitReading = { pr: {}, pairs: [], mainSha: '' };
    const main = mainBranch;
    for (const p of reading.pulls) {
      const n = String(p.number);
      const head = String(reading.prs[n]?.pr.head?.ref ?? p.head?.ref);
      const base = String(reading.prs[n]?.pr.base?.ref ?? p.base?.ref);
      let behind: number | null = null;
      let ahead: number | null = null;
      let mainFiles: string[] = [];
      if (base === main) {
        const b = await git(['rev-list', '--count', `origin/${head}..origin/${main}`]);
        const a = await git(['rev-list', '--count', `origin/${main}..origin/${head}`]);
        behind = b.code === 0 ? Number(b.out.trim()) : null;
        ahead = a.code === 0 ? Number(a.out.trim()) : null;
        const mb = (await git(['merge-base', `origin/${main}`, `origin/${head}`])).out.trim();
        if (mb) { mainFiles = (await git(['diff', '--name-only', mb, `origin/${main}`])).out.split('\n').filter(Boolean); }
      }
      const mt = await git(['merge-tree', '--write-tree', `origin/${base}`, `origin/${head}`]);
      g.pr[n] = { behind, ahead, merge: mt.code === 0 ? 'clean' : mt.code === 1 ? 'conflict' : 'unknown', mainFiles };
    }
    const nums = reading.pulls.map(p => String(p.number));
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const ha = reading.prs[nums[i]]?.pr.head?.ref;
        const hb = reading.prs[nums[j]]?.pr.head?.ref;
        const mt = await git(['merge-tree', '--write-tree', `origin/${ha}`, `origin/${hb}`]);
        g.pairs.push({ a: Number(nums[i]), b: Number(nums[j]), conflict: mt.code !== 0 });
      }
    }
    g.mainSha = (await git(['rev-parse', `origin/${main}`])).out.trim();
    reading.git = g;
  }

  // local refs and worktrees
  reading.refs = (await git(['for-each-ref', '--format=%(refname:short)%09%(upstream:short)%09%(upstream:track)%09%(committerdate:iso-strict)', 'refs/heads'])).out.split('\n').filter(Boolean).map(l => l.split('\t'));
  const wt = (await git(['worktree', 'list', '--porcelain'])).out;
  let path = '';
  for (const l of wt.split('\n')) {
    if (l.startsWith('worktree ')) { path = l.slice('worktree '.length); }
    else if (l.startsWith('branch ')) { reading.worktrees.push([path, l.slice('branch '.length).replace(/^refs\/heads\//, '')]); path = ''; }
    else if (l.startsWith('detached')) { reading.worktrees.push([path, '']); path = ''; }
  }
  const hasMain = (await git(['rev-parse', '-q', '--verify', `refs/remotes/origin/${mainBranch}`])).code === 0;
  for (const [name] of reading.refs) {
    if (!name || !hasMain) { continue; }
    const b = await git(['rev-list', '--count', `${name}..origin/${mainBranch}`]);
    const a = await git(['rev-list', '--count', `origin/${mainBranch}..${name}`]);
    reading.refCounts.push([name, b.code === 0 ? b.out.trim() : '', a.code === 0 ? a.out.trim() : '']);
  }
  reading.orcaWorktrees = await orcax('worktree', 'list');
  reading.orcaTerminals = await orcax('terminal', 'list');
  return { reading, degraded };
}

// --- preflight -------------------------------------------------------------------------------

async function preflight(): Promise<number> {
  let bad = false;
  const accounts = (await sh(['gh', 'auth', 'status'], 20_000));
  const n = (`${accounts.out}${accounts.err}`.match(/Logged in to/g) ?? []).length;
  if (n === 0) { console.log('FAIL gh: not logged in (gh auth login)'); bad = true; }
  else if (n > 1) { console.log(`WARN gh: ${n} accounts visible; the active one must read this repository (set GH_CONFIG_DIR to pin one)`); }
  else { console.log('OK   gh: one account'); }
  const repo = githubRepo((await git(['remote', 'get-url', 'origin'])).out);
  if (!repo) { console.log('FAIL git: origin is not a GitHub repository (Merge Line reads GitHub only)'); bad = true; }
  else {
    const r = await sh(['gh', 'api', `repos/${repo}`, '--jq', '.full_name'], 20_000);
    if (r.out.trim().toLowerCase() === repo.toLowerCase()) { console.log(`OK   repo: ${repo}`); }
    else { console.log(`FAIL repo: cannot read ${repo}`); bad = true; }
  }
  const cli = orchestratorCli();
  if (!cli) { console.log('INFO orchestrator: none configured (orchestration.orchestrator_cli), PR owners come from worktrees and authors only'); }
  else if ((await sh([cli, 'status', '--json'], 20_000)).code === 0) { console.log(`OK   ${cli}: runtime reachable`); }
  else { console.log(`WARN ${cli}: runtime not reachable (owners will be stale)`); }
  const side = boardSide();
  console.log(side.warn ? `WARN ${side.warn} (tracker parity off)` : `OK   board: mainline ${side.mainBranch}, ${side.requiredApprovals} approval(s), ${Object.keys(side.tracker).length} tracked ticket(s) for parity`);
  try { mkdirSync(join(STATE, 'cache'), { recursive: true }); writeFileSync(join(STATE, '.w'), ''); rmSync(join(STATE, '.w')); console.log(`OK   state: ${STATE} writable`); }
  catch { console.log(`FAIL state: ${STATE} not writable`); bad = true; }
  console.log(`INFO root: ${ROOT} on ${(await git(['branch', '--show-current'])).out.trim() || 'detached'}`);
  console.log(bad ? 'PREFLIGHT fail' : 'PREFLIGHT ok');
  return bad ? 2 : 0;
}

// --- main ------------------------------------------------------------------------------------

export async function collect(argv: string[]): Promise<number> {
  let mode: BuildParams['mode'] = 'wake';
  let reason = 'change';
  let record = '';
  let pre = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preflight') { pre = true; }
    else if (a === '--boot') { mode = 'boot'; }
    else if (a === '--close') { mode = 'close'; }
    else if (a === '--reason') { reason = argv[++i] ?? reason; }
    else if (a === '--record') { record = argv[++i] ?? ''; }
    else { console.log(`COLLECT fail unknown-arg:${a}`); return 2; }
  }
  mkdirSync(join(STATE, 'cache'), { recursive: true });
  if (pre) { return preflight(); }

  const side = boardSide();
  if (side.timezone) { process.env.TZ = side.timezone; }
  touch(join(STATE, 'alive'));
  const nowD = new Date();
  const now = isoS(nowD);
  const snap = `${localDate(nowD).replace(/-/g, '')}T${pad(nowD.getHours())}${pad(nowD.getMinutes())}${pad(nowD.getSeconds())}-${hash12(`${now}${process.pid}`).slice(0, 4)}`;

  let reading: Reading;
  let degraded = '';
  const fixture = process.env.MERGE_FIXTURE_DIR;
  if (fixture) {
    reading = JSON.parse(readFileSync(join(fixture, 'reading.json'), 'utf8')) as Reading;
    degraded = process.env.MERGE_FIXTURE_DEGRADED ?? ''; // selftest only: replay a reading as if one source had failed
  }
  else {
    const g = await gather(side.mainBranch);
    reading = g.reading;
    degraded = g.degraded;
  }
  reading.tracker = Object.keys(reading.tracker ?? {}).length ? reading.tracker : side.tracker;
  const raw = join(STATE, 'raw');
  mkdirSync(raw, { recursive: true });
  writeFileSync(join(raw, 'reading.json'), JSON.stringify(reading));
  if (record) { mkdirSync(record, { recursive: true }); writeFileSync(join(record, 'reading.json'), JSON.stringify(reading, null, 2)); }

  // --- 2. build the documents (pure, merge-build.ts) -----------------------------------------
  const prevFile = join(STATE, 'snapshot.json');
  const prev = existsSync(prevFile) ? parse<Json | null>(readFileSync(prevFile, 'utf8'), null) : null;
  const usageFile = join(STATE, `usage-${localDate(nowD)}.json`);
  const repo = githubRepo((await git(['remote', 'get-url', 'origin'])).out) ?? '';
  let out;
  try {
    out = buildDocuments(reading, {
      now,
      snap,
      reason,
      mode,
      degraded,
      todayStart: isoS(atLocal(nowD, '00:00')),
      today: localDate(nowD),
      nextOpen: nextOpen(nowD),
      mainBranch: side.mainBranch,
      repo,
      timezone: side.timezone,
      winOpen: WIN_OPEN,
      winClose: WIN_CLOSE,
      days: DAYS,
      heartbeatSec: HEARTBEAT_S,
      requiredApprovals: side.requiredApprovals,
      ticketKey: side.ticketKey,
      handle: process.env.ORCA_TERMINAL_HANDLE ?? '',
      mailbox: existsSync(join(STATE, 'address.json')) ? 'on' : 'off',
      usage: existsSync(usageFile) ? parse<Json | null>(readFileSync(usageFile, 'utf8'), null) : null,
    }, prev);
  }
  catch (e) {
    console.log(`COLLECT fail build (${String((e as Error).message).slice(0, 300)})`);
    return 2;
  }

  // --- 3. documents and plan ------------------------------------------------------------------
  const docsDir = join(STATE, 'docs');
  // A degraded build emits only meta/state: keep the last good documents and snapshot, or the
  // board shows an empty Merge Line and the next healthy run reports every open PR as new.
  if (!degraded) { rmSync(docsDir, { recursive: true, force: true }); }
  mkdirSync(join(docsDir, 'meta'), { recursive: true });
  mkdirSync(join(docsDir, 'prs'), { recursive: true });
  for (const [key, doc] of Object.entries(out.docs)) {
    const f = join(docsDir, `${key}.json`);
    writeFileSync(`${f}.tmp`, `${JSON.stringify(doc, null, 2)}\n`);
    renameSync(`${f}.tmp`, f);
  }
  const ledgerFile = join(STATE, 'ledger.json');
  const ledger = existsSync(ledgerFile) ? parse<Record<string, { hash?: string }>>(readFileSync(ledgerFile, 'utf8'), {}) : {};
  const rows = Object.keys(out.docs).filter(k => k.startsWith('meta/') || k.startsWith('prs/')).map((key) => {
    const { snapshotId: _s, collectedAt: _c, ...rest } = out.docs[key];
    return { key, hash: hash12(stableJson(rest)), file: join(docsDir, `${key}.json`) };
  });
  const plan = planOf({ snapshotId: snap, mode, ledger, docs: rows, openPrs: out.openPrs, closedPrs: out.closedPrs });
  writeFileSync(join(STATE, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  if (degraded) {
    writeFileSync(join(STATE, 'snapshot.degraded.json'), JSON.stringify(out));
  }
  else {
    if (existsSync(prevFile)) { writeFileSync(join(STATE, 'snapshot.prev.json'), readFileSync(prevFile)); }
    writeFileSync(prevFile, JSON.stringify(out));
  }
  touch(join(STATE, 'alive'));

  // --- 4. summary (40 lines at most) ------------------------------------------------------------
  const s = out.summary;
  const sets = plan.entries.filter((e: Json) => e.op === 'set');
  const lines = [
    `COLLECT ${snap} reason=${reason}`,
    `read prs=${out.denominators.prs} branches=${out.denominators.branches} worktrees=${out.denominators.worktrees} terminals=${out.denominators.terminals} tickets=${out.denominators.tickets}`,
    `hard: ${s.hard.length ? s.hard.join(' ') : 'none'}`,
    `soft: ${s.soft.length ? s.soft.join(' ') : 'none'}`,
    `alerts: ${s.alerts.length ? s.alerts.join(' ') : 'no change'}`,
    `new comments (${s.comments.length}, max 10, 500 chars each):`,
    ...s.comments.slice(0, 10).map(c => `  #${c.n} ${c.by} ${c.at} ${JSON.stringify(c.body.replace(/[\r\n]+/g, ' ').slice(0, 500))}`),
    `plan: ${sets.length} writes (${sets.map((e: Json) => e.key).join(' ')}), ${plan.entries.length - sets.length} deletes, ${plan.unchanged} unchanged`,
  ];
  if (side.warn) { lines.push(`warn: ${side.warn}`); }
  for (const l of lines) { console.log(l); }
  log(`collect ${snap} reason=${reason} mode=${mode} degraded=${degraded || 'none'}`);
  if (degraded) { console.log(`COLLECT degraded ${degraded}`); return 3; }
  console.log('COLLECT ok');
  return 0;
}

if (import.meta.main) {
  try { process.exit(await collect(process.argv.slice(2))); }
  catch (e) { console.log(`COLLECT fail ${(e as Error).message.split('\n')[0]}`); process.exit(2); }
}
