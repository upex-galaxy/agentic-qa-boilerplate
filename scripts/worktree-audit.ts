#!/usr/bin/env bun
/**
 * worktree-audit.ts — what a linked worktree still holds that git does not,
 * classified, before it is removed.
 *
 * Removing a worktree (`git worktree remove` without `--force`, a harness's own
 * cleanup, Orca's delete) deletes every gitignored file inside it and exits 0.
 * This lists them as STATE (belongs in the primary checkout), CACHE (a command
 * brings it back), DISPOSABLE (safe to lose) or UNKNOWN (no rule; review), from
 * the one table in `cli/lib/worktree.ts`.
 *
 * Usage:
 *   bun run worktree:audit [<path>]                 audit; read-only
 *   bun run worktree:audit [<path>] --rescue        copy STATE to the same path in the primary
 *   bun run worktree:audit [<path>] --rescue --dry-run
 *   bun run worktree:audit [<path>] --json
 *
 * Exit codes: 0 = nothing durable left (removal loses nothing that matters);
 * 1 = STATE or UNKNOWN still only in the worktree (after --rescue: a conflict
 * or an UNKNOWN entry remains); 2 = usage error (not a git checkout, or the
 * target is the primary checkout itself).
 *
 * --rescue never overwrites: a file already in the primary with identical bytes
 * counts as rescued; different bytes are a conflict left for a human. Read-only
 * on the worktree in every mode. Prints paths only, never file contents.
 */

import type { AuditClass } from '../cli/lib/worktree.ts';
import { resolve } from 'node:path';

import { auditWorktree, checkoutRoots, rescueState } from '../cli/lib/worktree.ts';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`worktree-audit — classify a linked worktree's gitignored files before removing it

  bun run worktree:audit [<path>]                  audit (default path: current directory)
  bun run worktree:audit [<path>] --rescue         copy STATE into the primary checkout, never overwriting
  bun run worktree:audit [<path>] --rescue --dry-run
  bun run worktree:audit [<path>] --json

Classes
  state       belongs in the primary checkout (.session/, .scratch/, evidence, reports, updater state)
  cache       a command rebuilds it (bun install, context:hydrate, worktree:provision, ...)
  disposable  safe to lose (test output, editor litter, Allure history, TMS results, tokens)
  unknown     no rule matches: review by hand

Exit: 0 nothing durable left · 1 state/unknown remains · 2 usage error
`);
  process.exit(0);
}

const RESCUE = args.includes('--rescue');
const DRY_RUN = args.includes('--dry-run');
const JSON_OUT = args.includes('--json');
const positional = args.filter(a => !a.startsWith('-'));
const target = resolve(positional[0] ?? process.cwd());

const roots = checkoutRoots(target);
if (roots === null) {
  process.stderr.write(`worktree-audit: not inside a git checkout: ${target}\n`);
  process.exit(2);
}
if (!roots.linked) {
  process.stderr.write(`worktree-audit: ${roots.repoRoot} is the primary checkout, not a linked worktree; nothing to audit.\n`);
  process.exit(2);
}

const worktree = roots.repoRoot;
const entries = auditWorktree(worktree);
const byClass = (c: AuditClass) => entries.filter(e => e.class === c);
const rescue = RESCUE ? rescueState(worktree, roots.primaryRoot, entries, { dryRun: DRY_RUN }) : null;

const unknown = byClass('unknown');
const stateLeft = rescue === null ? byClass('state').length : rescue.conflicts.length;
const exitCode = stateLeft > 0 || unknown.length > 0 ? 1 : 0;

if (JSON_OUT) {
  process.stdout.write(`${JSON.stringify({ worktree, primary: roots.primaryRoot, entries, rescue, exitCode }, null, 2)}\n`);
  process.exit(exitCode);
}

process.stdout.write(`worktree-audit: ${worktree}\n  primary: ${roots.primaryRoot}\n`);
const LABELS: Record<AuditClass, string> = {
  state: 'STATE (belongs in the primary)',
  unknown: 'UNKNOWN (no rule; review by hand)',
  cache: 'CACHE (a command rebuilds it)',
  disposable: 'DISPOSABLE (safe to lose)',
};
for (const cls of ['state', 'unknown', 'cache', 'disposable'] as const) {
  const rows = byClass(cls);
  if (rows.length === 0) { continue; }
  process.stdout.write(`\n  ${LABELS[cls]}: ${rows.length}\n`);
  for (const row of rows) { process.stdout.write(`    ${row.path}  · ${row.note}\n`); }
}
if (entries.length === 0) { process.stdout.write('\n  no gitignored files.\n'); }

if (rescue !== null) {
  const verb = DRY_RUN ? 'would copy' : 'copied';
  process.stdout.write(`\n  rescue into ${roots.primaryRoot}${DRY_RUN ? ' (dry run, nothing written)' : ''}\n`);
  for (const rel of rescue.copied) { process.stdout.write(`    ${verb}     ${rel}\n`); }
  for (const rel of rescue.identical) { process.stdout.write(`    identical  ${rel}\n`); }
  for (const rel of rescue.conflicts) { process.stdout.write(`    CONFLICT   ${rel}  (primary has different bytes; kept the primary's, compare by hand)\n`); }
  for (const rel of rescue.skipped) { process.stdout.write(`    skipped    ${rel}  (not a regular file)\n`); }
}

process.stdout.write('\n');
if (exitCode === 0) {
  process.stdout.write('  verdict: nothing durable is only here; removing this worktree loses no state.\n');
}
else {
  if (stateLeft > 0) {
    process.stdout.write(rescue === null
      ? `  verdict: ${stateLeft} STATE entr${stateLeft === 1 ? 'y' : 'ies'} would be lost. Run again with --rescue, then remove.\n`
      : `  verdict: ${stateLeft} conflict(s) left; resolve them by hand before removing.\n`);
  }
  if (unknown.length > 0) {
    process.stdout.write(`  verdict: ${unknown.length} UNKNOWN entr${unknown.length === 1 ? 'y' : 'ies'}: decide by hand, then add a rule to AUDIT_RULES (cli/lib/worktree.ts).\n`);
  }
}
process.exit(exitCode);
