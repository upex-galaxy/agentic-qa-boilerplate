#!/usr/bin/env bun
/**
 * clean.ts — delete what this repo generates and can rebuild, by level.
 *
 * Usage:
 *   bun run clean                       dry run, level safe: every path, size, age and how it comes back
 *   bun run clean --apply               delete the level-safe paths (this is what `test:clean` runs)
 *   bun run clean --profiles            add browser profiles left inside the repo (the owner's logins)
 *   bun run clean --history             add .allure/ trend history and the .backups* Xray exports
 *   bun run clean --sessions            add old scratch under .session/ (--older-than <days>, default 30)
 *   bun run clean --builds              add node_modules and dist (bun install brings them back)
 *   bun run clean --all                 every level
 *   bun run clean --json                machine-readable dry run
 *
 * The registry and its guard live in `cli/lib/clean.ts`: an explicit allowlist,
 * never "whatever git ignores". Browser profiles of the Playwright CLI daemon
 * are `bun run browser:profiles`; the browsers Playwright downloads are pruned
 * by `bun run pw:install` itself (it keeps what any project still references).
 *
 * Exit codes: 0 = done (dry run, or everything selected deleted); 1 = a
 * deletion failed; 2 = usage error.
 */

import type { CleanLevel } from '../cli/lib/clean.ts';
import { formatBytes } from '../cli/lib/browser-profiles.ts';

import { DEFAULT_SESSION_DAYS, LEVELS, planClean, removeEntry } from '../cli/lib/clean.ts';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`clean — delete what this repo generates and can rebuild

  bun run clean                       dry run, level safe (default)
  bun run clean --apply               delete the selected paths
  bun run clean --profiles            + browser profiles left inside the repo (the owner's logins)
  bun run clean --history             + .allure/ trend history and the .backups* Xray exports
  bun run clean --sessions            + old scratch under .session/ (archive, spikes, finished runs)
  bun run clean --older-than <days>   age gate for --sessions (default ${DEFAULT_SESSION_DAYS})
  bun run clean --builds              + node_modules and dist (bun install rebuilds them)
  bun run clean --all                 every level
  bun run clean --json                dry run as JSON

Never touches .env*, .auth/, .context/PBI/, .session/decisions|handoffs|framework-development.
`);
  process.exit(0);
}

const levels = new Set<CleanLevel>(['safe']);
let apply = false;
let json = false;
let olderThan = DEFAULT_SESSION_DAYS;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--apply') { apply = true; }
  else if (a === '--json') { json = true; }
  else if (a === '--all') { for (const l of LEVELS) { levels.add(l); } }
  else if (a === '--profiles' || a === '--history' || a === '--sessions' || a === '--builds') { levels.add(a.slice(2) as CleanLevel); }
  else if (a === '--older-than' || a.startsWith('--older-than=')) {
    const raw = a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[++i];
    olderThan = Number(raw);
    if (raw === undefined || raw === '' || !Number.isFinite(olderThan) || olderThan < 0) {
      process.stderr.write(`--older-than needs a number of days, got "${raw ?? ''}"\n`);
      process.exit(2);
    }
  }
  else {
    process.stderr.write(`unknown argument: ${a} (see --help)\n`);
    process.exit(2);
  }
}

const root = process.cwd();
const now = Date.now();
const entries = planClean(root, { levels: [...levels], olderThanDays: olderThan, nowMs: now });
const selected = entries.filter(e => e.verdict === 'delete');
const sum = (list: readonly { bytes: number }[]): number => list.reduce((n, e) => n + e.bytes, 0);
const ageOf = (ms: number): number => Math.max(0, Math.floor((now - ms) / 86_400_000));

if (json) {
  process.stdout.write(`${JSON.stringify({
    levels: [...levels],
    olderThanDays: olderThan,
    totalBytes: sum(entries),
    selected: selected.length,
    selectedBytes: sum(selected),
    entries: entries.map(e => ({ ...e, ageDays: ageOf(e.lastUsedMs) })),
  }, null, 2)}\n`);
  process.exit(0);
}

if (entries.length === 0) {
  process.stdout.write(`Nothing to clean at level ${[...levels].join(' + ')}.\n`);
  process.exit(0);
}

const bySize = [...entries].sort((a, b) => b.bytes - a.bytes);
for (const e of bySize) {
  process.stdout.write(`${formatBytes(e.bytes).padStart(8)}  ${String(ageOf(e.lastUsedMs)).padStart(4)}d  ${e.level.padEnd(8)}  ${e.verdict.padEnd(12)}  ${e.rel}\n`);
}
process.stdout.write(`\nLevel ${[...levels].join(' + ')}: ${entries.length} path(s), ${formatBytes(sum(entries))}.`);
if (levels.has('sessions')) { process.stdout.write(` Sessions younger than ${olderThan} day(s) are kept.`); }
process.stdout.write('\n');

if (!apply) {
  process.stdout.write(`Dry run: would delete ${selected.length}, ${formatBytes(sum(selected))}. Re-run with --apply to delete them.\n`);
  process.exit(0);
}

let deleted = 0;
let deletedBytes = 0;
const failures: string[] = [];
for (const e of selected) {
  const error = removeEntry(root, e);
  if (error) { failures.push(`${e.rel}: ${error}`); continue; }
  deleted += 1;
  deletedBytes += e.bytes;
}
process.stdout.write(`Deleted ${deleted} of ${entries.length}, ${formatBytes(deletedBytes)}.\n`);
if (failures.length > 0) {
  process.stderr.write(`${failures.length} failed:\n${failures.map(f => `  ${f}`).join('\n')}\n`);
  process.exit(1);
}
