#!/usr/bin/env bun
/**
 * @fileoverview CLI for the per-harness credential generator.
 *
 * Thin argv wrapper. Every decision lives in `cli/lib/harness-env.ts`, which
 * `cli/doctor.ts` imports directly — the core has to sit under `cli/` because
 * `cli/` is import-closed (AGENTS.md section 4.5: "Shared code goes in
 * `cli/lib/`; a `scripts/` file that needs it imports FROM `cli/`").
 *
 * Usage:
 *   bun run harness:env              generate both surfaces from .env
 *   bun run harness:env --check      verify .env and the surfaces agree (exit 1 on drift)
 *   bun run harness:env --dry-run    print what WOULD change, write nothing
 *   bun run harness:env --json       machine-readable result for either mode
 *
 * NEVER PRINTS A VALUE. Every line below carries variable NAMES and a verdict.
 */

import {
  check,
  CLAUDE_LOCAL_SETTINGS,
  generate,
  OPENCODE_CONFIG,
  OPENCODE_SECRET_DIR,
} from '../cli/lib/harness-env.ts';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const DRY_RUN = argv.includes('--dry-run');
const JSON_OUT = argv.includes('--json');
const HELP = argv.includes('--help') || argv.includes('-h');

function names(list: string[]): string {
  return list.length === 0 ? '(none)' : list.join(', ');
}

if (HELP) {
  process.stdout.write(`harness-env — generate the per-harness credential surfaces from .env

  bun run harness:env              generate both surfaces
  bun run harness:env --check      verify; exit 1 when .env and the surfaces disagree
  bun run harness:env --dry-run    report what would change, write nothing
  bun run harness:env --json       machine-readable result

Surfaces
  ${CLAUDE_LOCAL_SETTINGS}   env block, merged (every key it did not put there is preserved)
  ${OPENCODE_SECRET_DIR}/<VAR>        value files at mode 0600, referenced from ${OPENCODE_CONFIG} as {file:...}

Only variables an MCP config actually references are emitted. Values are never printed.
`);
  process.exit(0);
}

if (CHECK) {
  const result = check();
  if (JSON_OUT) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  else {
    process.stdout.write(`harness-env --check: ${result.ok ? 'OK' : 'DRIFT'}\n`);
    process.stdout.write(`  ${result.summary}\n`);
    for (const f of result.findings) {
      const mark = f.blocking ? 'x' : 'i';
      process.stdout.write(`  [${mark}] ${f.surface}/${f.kind}: ${names(f.names)}\n`);
      process.stdout.write(`      ${f.detail}\n`);
    }
    if (!result.ok) {
      process.stdout.write('\n  Fix: bun run harness:env\n');
    }
  }
  process.exit(result.ok ? 0 : 1);
}

const result = generate(undefined, { dryRun: DRY_RUN });

if (JSON_OUT) {
  // Safe by construction: `GenerateResult.env` is typed without its `values`
  // map, so there is no credential in this object to serialise.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

const verb = DRY_RUN ? 'would write' : 'wrote';
process.stdout.write(`harness-env: ${result.changed ? verb : 'already in sync'}\n`);
process.stdout.write(`  allowlist (${result.allowlist.all.length}): ${names(result.allowlist.all)}\n`);
process.stdout.write(`  excluded (${result.excluded.length} of ${result.declared.length} declared in .env.example, no MCP config references them): ${names(result.excluded)}\n`);

process.stdout.write(`\n  ${CLAUDE_LOCAL_SETTINGS}\n`);
if (result.claude.redirectedToMainCheckout) {
  // Measured: a Claude Code session in a worktree reads the MAIN checkout's
  // file and ignores the worktree's. Writing the local copy would be a silent
  // no-op, so say out loud which file was touched.
  process.stdout.write('    (worktree: written to the MAIN checkout, which is the file Claude Code reads)\n');
  process.stdout.write(`    -> ${result.claude.path}\n`);
  if (result.claude.divergentFromMainCheckout.length > 0) {
    process.stdout.write(
      '    WARNING: this worktree\'s .env disagrees with the main checkout\'s for '
      + `${names(result.claude.divergentFromMainCheckout)}, and every worktree on this machine `
      + 'shares that one env block.\n',
    );
  }
}
process.stdout.write(`    added:     ${names(result.claude.added)}\n`);
process.stdout.write(`    updated:   ${names(result.claude.updated)}\n`);
process.stdout.write(`    unchanged: ${names(result.claude.unchanged)}\n`);
process.stdout.write(`    removed:   ${names(result.claude.removed)}\n`);
process.stdout.write(`    skipped (empty in .env): ${names(result.claude.skipped)}\n`);
process.stdout.write(`    preserved (not ours): ${names([...result.claude.preserved, ...result.claude.preservedKeys])}\n`);

process.stdout.write(`\n  ${OPENCODE_SECRET_DIR}/ + ${OPENCODE_CONFIG}\n`);
process.stdout.write(`    value files written:   ${names(result.opencode.write)}\n`);
process.stdout.write(`    value files unchanged: ${names(result.opencode.unchanged)}\n`);
process.stdout.write(`    value files removed:   ${names(result.opencode.removed)}\n`);
process.stdout.write(`    {env:} rewritten to {file:}: ${names(result.opencode.rewritten)}\n`);
process.stdout.write(`    undeclared in .env (kept on {env:}, unchanged behaviour): ${names(result.opencode.undeclared)}\n`);

if (result.allowlist.declaredNotReferenced.length > 0) {
  process.stdout.write(`\n  note: MCP_SERVER_SECRETS declares, no config references: ${names(result.allowlist.declaredNotReferenced)}\n`);
}
if (result.allowlist.referencedNotDeclared.length > 0) {
  process.stdout.write(`  note: a config references, MCP_SERVER_SECRETS does not declare: ${names(result.allowlist.referencedNotDeclared)}\n`);
}
