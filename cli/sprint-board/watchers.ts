import type { WatcherView } from './model.ts';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sprintDir, writeAtomic } from './store.ts';

export type WatcherRecord = Omit<WatcherView, 'alive'> & { match?: string };

const WATCHER_NAME = /^[a-z][a-z0-9-]{0,30}$/;

const watchersDir = (slug: string) => join(sprintDir(slug), 'watchers');
const watcherFile = (slug: string, name: string) => join(watchersDir(slug), `${name}.json`);
const isPid = (pid: number) => Number.isSafeInteger(pid) && pid > 0;
const save = (slug: string, record: WatcherRecord) => writeAtomic(watcherFile(slug, record.name), `${JSON.stringify(record)}\n`);
const isText = (v: unknown) => typeof v === 'string';
const isOptionalText = (v: unknown) => v === undefined || isText(v);
// The file is read as written by anyone: a regex test or a template string would coerce a wrong type into a pass.
const isRecord = (r: WatcherRecord) => isText(r.name) && WATCHER_NAME.test(r.name) && isPid(r.pid) && isText(r.startedAt) && isOptionalText(r.match) && isOptionalText(r.exitedAt);

export function checkWatcherName(name: string): string {
  if (!WATCHER_NAME.test(name)) { throw new Error(`watcher name must match ${WATCHER_NAME.source} (got "${name}")`); }
  return name;
}

export function registerWatcher(slug: string, w: { name: string, pid: number, match?: string }): void {
  checkWatcherName(w.name);
  if (!isPid(w.pid)) { throw new Error(`pid must be a whole number above 0 (got "${w.pid}")`); }
  save(slug, { name: w.name, pid: w.pid, startedAt: new Date().toISOString(), match: w.match || undefined });
}

export function readWatchers(slug: string): WatcherRecord[] {
  const dir = watchersDir(slug);
  if (!existsSync(dir)) { return []; }
  const out: WatcherRecord[] = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const r = JSON.parse(readFileSync(join(dir, file), 'utf8')) as WatcherRecord;
      if (isRecord(r) && file === `${r.name}.json`) { out.push(r); }
    }
    catch { /* a foreign or unreadable file is not a registration */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function markWatcherExit(slug: string, name: string, pid: number): void {
  const record = readWatchers(slug).find(w => w.name === name);
  // An older process that exits late must not mark the registration that replaced it.
  if (record?.pid !== pid) { return; }
  save(slug, { ...record, exitedAt: new Date().toISOString() });
}

export function clearWatcher(slug: string, name: string): boolean {
  const file = watcherFile(slug, checkWatcherName(name));
  if (!existsSync(file)) { return false; }
  rmSync(file);
  return true;
}

function signalable(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  }
  catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function pidAlive(pid: number, match?: string): boolean {
  if (!signalable(pid)) { return false; }
  try {
    const r = Bun.spawnSync(['ps', '-ww', '-o', 'stat=,command=', '-p', String(pid)]);
    const line = r.stdout.toString().trim();
    if (r.exitCode === 0 && line) {
      const stat = line.split(/\s/, 1)[0];
      // An unreaped child (state Z) still answers signal 0; a recycled pid runs another command.
      return !stat.startsWith('Z') && (!match || line.slice(stat.length).includes(match));
    }
  }
  catch { /* no usable ps: the signal check below is the answer */ }
  return signalable(pid);
}

export function watcherViews(slug: string): WatcherView[] {
  return readWatchers(slug).map(w => ({ name: w.name, pid: w.pid, startedAt: w.startedAt, exitedAt: w.exitedAt, alive: pidAlive(w.pid, w.match) }));
}
