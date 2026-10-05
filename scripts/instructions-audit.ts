#!/usr/bin/env bun
/**
 * @fileoverview `bun run instructions:audit`: recall of the instruction router
 * measured on this machine's own Claude Code transcripts.
 *
 * For every `ROUTE: read .agents/instructions/<file>` line the prompt hook
 * injected, checks whether the agent read that file in the same turn, and
 * prints recall per section and overall against `RECALL_TARGET`. Parsing rules
 * and what counts as a read: `scripts/lib/instructions-audit.ts`.
 *
 * Scope: the transcripts of every checkout `git worktree list` names (the
 * primary checkout and its worktrees), or only this one with `--here`, written
 * in the last `--days` days (default 30). `--removed-worktrees` adds the
 * transcripts of worktrees already deleted: every transcript folder that sits
 * beside a live worktree's (same parent directory, the orchestrator's
 * workspace folder for this repository). Transcripts live under
 * `$CLAUDE_CONFIG_DIR/projects/<slug>/` (default `~/.claude`). A transcript
 * untouched for `QUIET_MS` is a finished session: its last turn closes, so a
 * dispatched worker's single turn is measured instead of left open.
 *
 * Claude Code only. OpenCode keeps sessions in its own storage and Codex in
 * `~/.codex/sessions/`, each with a different shape and no hook attachment to
 * key on; they are not parsed yet and the report says so.
 *
 * Transcripts can hold secrets: this script prints section file names and
 * counts, never a prompt, a tool input or any other transcript text.
 *
 * Usage: bun run instructions:audit [--here] [--removed-worktrees] [--days N] [--json]
 * Exit 0 always: it is a measurement, not a gate.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { auditTranscript, claudeProjectSlug, emptyAudit, recallOf, totals } from './lib/instructions-audit.ts';

export const RECALL_TARGET = 0.9;
/** A transcript quiet this long belongs to a session that has ended. */
export const QUIET_MS = 10 * 60_000;

/** Checkout roots to audit: every worktree of this repository, or the current one. */
export function checkoutRoots(cwd: string, here: boolean): string[] {
  if (here) { return [resolve(cwd)]; }
  const run = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8' });
  const roots = run.status === 0
    ? run.stdout.split('\n').filter(l => l.startsWith('worktree ')).map(l => l.slice('worktree '.length).trim())
    : [];
  return roots.length > 0 ? [...new Set(roots.map(r => resolve(r)))] : [resolve(cwd)];
}

/**
 * Transcript folder names to read: one per root, plus (with `removed`) every
 * folder whose name extends the slug of a non-primary worktree's parent
 * directory, which is where deleted worktrees of this repository lived.
 */
export function transcriptDirs(projectsDir: string, roots: string[], removed: boolean): string[] {
  const dirs = new Set(roots.map(root => claudeProjectSlug(root)));
  if (removed && existsSync(projectsDir)) {
    const prefixes = roots.slice(1).map(root => `${claudeProjectSlug(dirname(root))}-`);
    for (const name of readdirSync(projectsDir)) {
      if (prefixes.some(prefix => name.startsWith(prefix))) { dirs.add(name); }
    }
  }
  return [...dirs].map(name => join(projectsDir, name)).filter(dir => existsSync(dir));
}

/** Top-level session transcripts (subagent transcripts nest deeper and are not routed), with their mtime. */
export function transcriptFiles(dirs: string[], sinceMs: number): Array<{ path: string, mtimeMs: number }> {
  const files: Array<{ path: string, mtimeMs: number }> = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) { continue; }
      const path = join(dir, name);
      const { mtimeMs } = statSync(path);
      if (mtimeMs >= sinceMs) { files.push({ path, mtimeMs }); }
    }
  }
  return files;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const here = args.includes('--here');
  const json = args.includes('--json');
  const daysAt = args.indexOf('--days');
  const days = daysAt >= 0 ? Number(args[daysAt + 1]) : 30;
  if (!Number.isFinite(days) || days <= 0) {
    console.error('✗ --days needs a positive number');
    process.exit(2);
  }
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude');
  const roots = checkoutRoots(process.cwd(), here);
  const dirs = transcriptDirs(join(configDir, 'projects'), roots, !here && args.includes('--removed-worktrees'));
  const now = Date.now();
  const files = transcriptFiles(dirs, now - days * 86_400_000);
  const result = emptyAudit();
  for (const file of files) { auditTranscript(readFileSync(file.path, 'utf8').split('\n'), result, now - file.mtimeMs >= QUIET_MS); }
  const all = totals(result);
  const overall = recallOf(all);
  const pct = (n: number | null): string => (n === null ? '-' : `${(n * 100).toFixed(1)}%`);
  const rows = [...result.sections.entries()].sort(([a], [b]) => a.localeCompare(b));

  if (json) {
    console.log(JSON.stringify({
      checkouts: roots.length,
      transcriptDirs: dirs.length,
      days,
      transcripts: result.transcripts,
      routedSessions: result.routedSessions,
      importRoutes: result.importRoutes,
      optionalLines: result.optionalLines,
      reminders: result.reminders,
      readAfterReminder: result.readAfterReminder,
      target: RECALL_TARGET,
      overall: { ...all, recall: overall },
      sections: Object.fromEntries(rows.map(([path, t]) => [path, { ...t, recall: recallOf(t) }])),
    }, null, 2));
    process.exit(0);
  }

  console.log(`instructions:audit: ${result.transcripts} Claude Code transcript(s) from ${dirs.length} checkout folder(s), last ${days} day(s); ${result.routedSessions} carried section routes.`);
  if (all.routed === 0) {
    console.log('- no section ROUTE: lines found: nothing to measure yet (the hook routes only in checkouts that have the ROUTER).');
    process.exit(0);
  }
  const width = Math.max(...rows.map(([p]) => p.length), 'section'.length);
  console.log(`\n  ${'section'.padEnd(width)}  routed  in-turn  before  missed  open  recall`);
  for (const [path, t] of rows) {
    console.log(`  ${path.padEnd(width)}  ${String(t.routed).padStart(6)}  ${String(t.readInTurn).padStart(7)}  ${String(t.readBefore).padStart(6)}  ${String(t.missed).padStart(6)}  ${String(t.open).padStart(4)}  ${pct(recallOf(t)).padStart(6)}`);
  }
  console.log(`\n  overall recall ${pct(overall)} (target ${pct(RECALL_TARGET)}): ${all.readInTurn} read in turn + ${all.readBefore} already read, ${all.missed} missed; ${all.open} open; ${result.importRoutes} import route(s) not counted.`);
  console.log(`  re-surface: ${result.reminders} ROUTE-PENDING reminder(s), ${result.readAfterReminder} routed file(s) read after one; ${result.optionalLines} ROUTE-OPTIONAL line(s) offered.`);
  console.log(overall !== null && overall >= RECALL_TARGET ? '✓ at or above target' : '⚠ below target: the agent skips routed sections; see the misses per section above');
  console.log('- OpenCode and Codex transcripts are not parsed yet.');
}
