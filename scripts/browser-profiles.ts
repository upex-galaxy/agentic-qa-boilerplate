#!/usr/bin/env bun
/**
 * browser-profiles.ts — list, and with --apply delete, the Chrome profiles the
 * Playwright CLI daemon left on this machine (`ud-<session>-<browser>` dirs).
 *
 * `--persistent` (or an old config with `isolated: false`) keeps one full
 * profile per session name and `close` never removes it; in-memory sessions
 * leave nothing (browser-sessions.md §8). Logic: `cli/lib/browser-profiles.ts`.
 *
 * Usage:
 *   bun run browser:profiles                       dry run: every ud-* dir, size, age, verdict
 *   bun run browser:profiles --older-than 30       change the age gate (days, default 7)
 *   bun run browser:profiles --apply               delete the ones older than the gate and held by no live session
 *   bun run browser:profiles --json                machine-readable dry run
 *
 * Live sessions come from `playwright-cli list --all`. When that cannot be
 * read, the dry run says so and --apply refuses (exit 1): an unknown live set
 * is never treated as an empty one. Never touches ~/.agentic-qa/playwright-profiles/
 * or any custom --profile dir; only `<daemon dir>/<workspace hash>/ud-*`.
 *
 * Exit codes: 0 = done (dry run, or every selected dir deleted); 1 = --apply
 * refused or a deletion failed; 2 = usage error.
 */

import type { LiveSession, ProfileDecision } from '../cli/lib/browser-profiles.ts';
import { spawnSync } from 'node:child_process';

import {
  ageDays,
  daemonBaseDir,
  DEFAULT_OLDER_THAN_DAYS,
  deleteProfile,
  formatBytes,
  parseListAll,
  scanDaemonProfiles,
  selectStale,
} from '../cli/lib/browser-profiles.ts';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`browser-profiles — the Chrome profiles the Playwright CLI daemon left on this machine

  bun run browser:profiles                    dry run (default): every ud-* dir with size, age and verdict
  bun run browser:profiles --older-than <d>   age gate in days (default ${DEFAULT_OLDER_THAN_DAYS})
  bun run browser:profiles --apply            delete the dirs older than the gate that no live session holds
  bun run browser:profiles --json             dry run as JSON

Never touches ~/.agentic-qa/playwright-profiles/ or a custom --profile dir.
Doctrine: .agents/skills/agentic-qa-core/references/browser-sessions.md §8
`);
  process.exit(0);
}

let apply = false;
let json = false;
let olderThan = DEFAULT_OLDER_THAN_DAYS;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--apply') { apply = true; }
  else if (a === '--json') { json = true; }
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

function liveSessions(): { live: LiveSession[] | null, why: string } {
  const run = spawnSync('playwright-cli', ['list', '--all'], { encoding: 'utf8', timeout: 30_000 });
  if (run.error) { return { live: null, why: `playwright-cli list --all failed: ${run.error.message}` }; }
  if (run.status !== 0) { return { live: null, why: `playwright-cli list --all exited ${run.status}` }; }
  return { live: parseListAll(run.stdout), why: '' };
}

const base = daemonBaseDir();
const profiles = scanDaemonProfiles(base);
const { live, why } = liveSessions();
const now = Date.now();
const decisions: ProfileDecision[] = selectStale(profiles, live ?? [], olderThan, now);
const selected = decisions.filter(d => d.verdict === 'delete');
const sum = (list: readonly ProfileDecision[]): number => list.reduce((n, d) => n + d.profile.bytes, 0);
const total = sum(decisions);

if (json) {
  process.stdout.write(`${JSON.stringify({
    base,
    olderThanDays: olderThan,
    liveSessions: live,
    liveSessionsError: live ? null : why,
    scanned: decisions.length,
    totalBytes: total,
    selected: selected.length,
    selectedBytes: sum(selected),
    profiles: decisions.map(d => ({ ...d.profile, ageDays: ageDays(d.profile.lastUsedMs, now), verdict: d.verdict })),
  }, null, 2)}\n`);
  process.exit(0);
}

process.stdout.write(`Daemon dir: ${base}\n`);
if (decisions.length === 0) {
  process.stdout.write('No ud-* profiles: nothing to clean.\n');
  process.exit(0);
}
if (!live) { process.stdout.write(`WARNING: live sessions unknown (${why}); every dir is shown as if none were open.\n`); }

const byAge = [...decisions].sort((a, b) => a.profile.lastUsedMs - b.profile.lastUsedMs);
for (const d of byAge) {
  const where = d.profile.workspaceDir ?? d.profile.workspaceHash;
  process.stdout.write(`${formatBytes(d.profile.bytes).padStart(8)}  ${String(ageDays(d.profile.lastUsedMs, now)).padStart(4)}d  ${d.verdict.padEnd(18)}  ${d.profile.name}  (${where})\n`);
}
const workspaces = new Set(decisions.map(d => d.profile.workspaceHash)).size;
const kept = (verdict: string): number => decisions.filter(d => d.verdict === verdict).length;
process.stdout.write(`\nScanned ${decisions.length} ud-* dirs in ${workspaces} workspace(s), ${formatBytes(total)}. Kept: ${kept('keep: live session')} held by a live session, ${kept('keep: recent')} used in the last ${olderThan} day(s).\n`);

if (!apply) {
  process.stdout.write(`Dry run: would delete ${selected.length} of ${decisions.length} scanned, ${formatBytes(sum(selected))}. Re-run with --apply to delete them.\n`);
  process.exit(0);
}
if (!live) {
  process.stderr.write(`--apply refused: live sessions unknown (${why}). Fix playwright-cli, then re-run.\n`);
  process.exit(1);
}

let deletedBytes = 0;
let deleted = 0;
const failures: string[] = [];
for (const d of selected) {
  const error = deleteProfile(d.profile.path, base);
  if (error) { failures.push(`${d.profile.path}: ${error}`); continue; }
  deleted += 1;
  deletedBytes += d.profile.bytes;
}
process.stdout.write(`Deleted ${deleted} of ${decisions.length} scanned, ${formatBytes(deletedBytes)}.\n`);
if (failures.length > 0) {
  process.stderr.write(`${failures.length} failed:\n${failures.map(f => `  ${f}`).join('\n')}\n`);
  process.exit(1);
}
