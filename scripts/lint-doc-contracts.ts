#!/usr/bin/env bun
/**
 * lint-doc-contracts.ts — the documentation-contract gate (ADR-0016).
 *
 * A region of code wrapped in `LINT.IfChange(label)` / `LINT.ThenChange(...)`
 * markers names the pages that describe it in prose. When a change touches the
 * region, every one of those pages must change in the same range, or a commit
 * in the range must carry `Docs-Checked: <label> <reason>`. Grammar and range
 * rules: `scripts/lib/doc-contracts.ts`.
 *
 * Modes:
 *   bun scripts/lint-doc-contracts.ts              structural lint (markers balanced,
 *                                                  labels unique, targets exist); also
 *                                                  runs inside `docs:check`
 *   bun scripts/lint-doc-contracts.ts --staged     pre-commit: WARN only, never blocks
 *                                                  (docs often land in the next commit)
 *   bun scripts/lint-doc-contracts.ts --push       pre-push: BLOCKS, range = merge-base
 *                                                  with origin/HEAD (else origin/main)..HEAD
 *   bun scripts/lint-doc-contracts.ts --base <sha> --head <sha>
 *                                                  CI: BLOCKS on the PR range
 *   --warn                                         any range mode, never blocks
 *
 * v1 binds the boilerplate's own checkout only (`contractsEnforced`): in a
 * downstream project every mode prints one line and exits 0, because the
 * markers ship in synced files but point at pages the project owns or lacks.
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { checkRange, contractsEnforced, defaultBaseRef, scanContracts, violationText } from './lib/doc-contracts.ts';

interface Args {
  mode: 'structure' | 'staged' | 'push' | 'range'
  base: string | null
  head: string | null
  warn: boolean
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { mode: 'structure', base: null, head: null, warn: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged') { args.mode = 'staged'; }
    else if (a === '--push') { args.mode = 'push'; }
    else if (a === '--warn') { args.warn = true; }
    else if (a === '--base') { args.base = argv[++i] ?? null; args.mode = 'range'; }
    else if (a === '--head') { args.head = argv[++i] ?? null; }
    else { throw new Error(`unknown argument: ${a}`); }
  }
  if (args.mode === 'range' && (!args.base || !args.head)) { throw new Error('--base and --head go together'); }
  return args;
}

function mergeBase(root: string, a: string, b: string): string | null {
  try { return execFileSync('git', ['merge-base', a, b], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

function main(): number {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  if (!contractsEnforced(root)) {
    if (args.mode !== 'structure') { console.log('doc-contracts: maintainer-only in v1 (ADR-0016), skipped in this project.'); }
    return 0;
  }

  if (args.mode === 'structure') {
    const { regions, findings } = scanContracts(root);
    for (const f of findings) { console.error(`  ${f.file}:${f.line}  ${f.detail}`); }
    if (findings.length > 0) { return 1; }
    console.log(`✓ doc-contracts: ${regions.length} region(s), markers well-formed`);
    return 0;
  }

  let base: string | null;
  let head: string;
  if (args.mode === 'range') {
    // A PR's base sha is the tip of the target branch, which may have moved
    // since the branch point: measure from the merge-base, like a PR diff does.
    head = args.head!;
    base = mergeBase(root, args.base!, head) ?? args.base;
  }
  else {
    const ref = process.env.DOC_CONTRACTS_BASE || defaultBaseRef(root);
    base = ref ? mergeBase(root, ref, 'HEAD') : null;
    head = args.mode === 'staged' ? ':index' : 'HEAD';
  }
  if (!base) {
    console.log('doc-contracts: no base to compare against (no origin/HEAD or origin/main); skipped.');
    return 0;
  }

  const report = checkRange(root, { base, head });
  const blocking = args.mode !== 'staged' && !args.warn;
  for (const label of report.unreasoned) {
    console.warn(`⚠️  doc-contracts: "Docs-Checked: ${label}" has no reason; it does not count. Write the reason after the label.`);
  }
  for (const a of report.acknowledged) {
    console.log(`doc-contracts: region "${a.region.label}" acknowledged by Docs-Checked: ${a.reason}`);
  }
  if (report.violations.length === 0) {
    if (args.mode !== 'staged') {
      console.log(`✓ doc-contracts: ${report.touched.length} region(s) touched, ${report.acknowledged.length} acknowledged, none left a page behind`);
    }
    return 0;
  }
  const head1 = blocking ? '✗ doc-contracts' : '⚠️  doc-contracts (warning, does not block here)';
  console.error(`${head1}: ${report.violations.length} region(s) changed without the pages that describe them.\n`);
  for (const v of report.violations) { console.error(`${violationText(v)}\n`); }
  if (blocking) {
    console.error('A trailer on a pushed commit cannot be added; on an unpushed one, amend it or add an empty commit carrying the line.');
  }
  return blocking ? 1 : 0;
}

if (import.meta.main) {
  try { process.exit(main()); }
  catch (error) {
    console.error(`doc-contracts: ${(error as Error).message}`);
    process.exit(2);
  }
}
