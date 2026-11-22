#!/usr/bin/env bun
/**
 * Weekly digest of new GitHub issues on this repo, for the "Weekly issue digest" Orca automation.
 * Compares the current open-issue list against a saved cursor and prints only what's new since
 * the last run. Exit code 0 always; absence of output means nothing new.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO = 'upex-galaxy/agentic-qa-boilerplate';
const STATE_PATH = '.session/weekly-issue-digest/state.json';

interface GhIssue { number: number, title: string, url: string, createdAt: string, labels: { name: string }[] }
interface State { seen: number[] }

function readState(): State {
  if (!existsSync(STATE_PATH)) { return { seen: [] }; }
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State; }
  catch { return { seen: [] }; }
}

function writeState(state: State): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function run(cmd: string[]): string {
  const proc = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
  if (proc.exitCode !== 0) { throw new Error(`${cmd.join(' ')} failed: ${proc.stderr.toString()}`); }
  return proc.stdout.toString();
}

function main(): void {
  const state = readState();
  const seenSet = new Set(state.seen);

  const raw = run(['gh', 'issue', 'list', '--repo', REPO, '--state', 'open', '--limit', '200', '--json', 'number,title,url,createdAt,labels']);
  const issues: GhIssue[] = JSON.parse(raw);

  const fresh = issues.filter(i => !seenSet.has(i.number)).sort((a, b) => a.number - b.number);

  // Every open issue is now "seen": next run only reports what's new after this point.
  writeState({ seen: issues.map(i => i.number) });

  if (fresh.length === 0) {
    console.log('NO_NEW_ISSUES');
    return;
  }

  // The `skill-feedback` label family was never created on this repo (upstream-feedback.md §5),
  // so the convention that actually survives in practice is the `[skill-feedback]` title prefix.
  const urgent = fresh.filter(i => !i.title.startsWith('[skill-feedback]'));
  console.log(`NEW_ISSUES: ${fresh.length}`);
  console.log('');
  for (const i of fresh) {
    const tags = i.labels.map(l => l.name).join(', ') || 'no labels';
    console.log(`#${i.number} ${i.title}`);
    console.log(`  ${i.url}`);
    console.log(`  labels: ${tags} · opened ${i.createdAt.slice(0, 10)}`);
    console.log('');
  }
  if (urgent.length > 0) {
    console.log(`HEADS_UP: ${urgent.length} of these carry no "skill-feedback" label (not from the self-healing path) — worth a closer look first.`);
  }
}

main();
