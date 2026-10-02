#!/usr/bin/env bun
/**
 * check-commit-trailers.ts — WARN-only check of the forensic commit trailers
 * (AGENTS.md Critical Rule #3, canon in `git-flow-master` §3.2).
 *
 * Every commit an agent session writes ends with exactly these two lines:
 *
 *   Worktree: <name|primary>
 *   Session: <label>
 *
 * copied from the `AGENT IDENTITY:` line the prompt hook injects. And no
 * commit carries a harness-branded trailer (`Claude-Session:` and kin), an AI
 * `Co-Authored-By:`, or a "Generated with <tool>" line.
 *
 * The rule lives in prose; this script is what makes it reachable at commit
 * time. It NEVER blocks: it prints what is wrong to stderr and exits 0, so a
 * human commit, a merge, or an emergency fix always goes through. Called from
 * `.husky/commit-msg` with the message file path git hands the hook.
 *
 * Usage:
 *   bun scripts/check-commit-trailers.ts <commit-msg-file>
 */

import { readFileSync } from 'node:fs';

const WORKTREE_TRAILER = /^Worktree: \S.*$/;
const SESSION_TRAILER = /^Session: \S.*$/;

/** A trailer KEY that names a tool or vendor instead of the work. */
const BRANDED_SESSION_TRAILER = /^[\w.-]+-Session:/i;
const AI_NAMES = /claude|anthropic|openai|chatgpt|\bgpt\b|codex|copilot|gemini|opencode|cursor|aider|\bai\b/i;
const CO_AUTHOR = /^Co-Authored-By:/i;
const GENERATED_WITH = /\bgenerated (?:with|by)\b/i;

/** git's verbose-mode cut line: everything below it is never committed. */
const SCISSORS = /^# -+ >8 -+$/;

/** The message git will actually record: comments and the verbose diff stripped. */
export function committedLines(raw: string): string[] {
  const lines: string[] = [];
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    if (SCISSORS.test(line)) { break; }
    if (line.startsWith('#')) { continue; }
    lines.push(line.trimEnd());
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') { lines.pop(); }
  while (lines.length > 0 && lines[0] === '') { lines.shift(); }
  return lines;
}

/** Every problem with the message's trailers, as one human-readable line each. */
export function commitTrailerWarnings(raw: string): string[] {
  const lines = committedLines(raw);
  if (lines.length === 0) { return []; }
  const warnings: string[] = [];

  for (const line of lines) {
    if (BRANDED_SESSION_TRAILER.test(line)) {
      warnings.push(`harness-branded trailer "${line.split(':')[0]}:" is forbidden; use "Worktree:" + "Session:" instead.`);
    }
    else if (CO_AUTHOR.test(line) && AI_NAMES.test(line)) {
      warnings.push('AI "Co-Authored-By:" trailer is attribution and is forbidden.');
    }
    else if (GENERATED_WITH.test(line) && AI_NAMES.test(line)) {
      warnings.push('"Generated with/by <tool>" line is attribution and is forbidden.');
    }
  }

  const last = lines[lines.length - 1];
  const previous = lines.length > 1 ? lines[lines.length - 2] : '';
  if (!WORKTREE_TRAILER.test(previous) || !SESSION_TRAILER.test(last)) {
    const present = lines.some(line => WORKTREE_TRAILER.test(line)) && lines.some(line => SESSION_TRAILER.test(line));
    warnings.push(present
      ? '"Worktree:" and "Session:" must be the LAST two lines, in that order, with nothing below them.'
      : 'missing forensic trailers: end the message with "Worktree: <name|primary>" then "Session: <label>" (values from the AGENT IDENTITY line; "unknown" when unresolved).');
  }
  return warnings;
}

function main(): void {
  const file = process.argv[2];
  if (!file) { return; }
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  }
  catch {
    return;
  }
  const warnings = commitTrailerWarnings(raw);
  if (warnings.length === 0) { return; }
  const yellow = '\x1B[33m';
  const reset = '\x1B[0m';
  console.error(`${yellow}⚠ commit-msg (warning only, commit kept):${reset}`);
  for (const warning of warnings) {
    console.error(`  - ${warning}`);
  }
  console.error('  Rule: AGENTS.md Critical Rule #3; canon: .agents/skills/git-flow-master/SKILL.md §3.2.');
}

if (import.meta.main) {
  try {
    main();
  }
  catch {
    // Warn-only by contract: a crash here must never block a commit.
  }
  process.exit(0);
}
