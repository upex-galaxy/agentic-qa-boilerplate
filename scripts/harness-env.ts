#!/usr/bin/env bun
/**
 * @fileoverview CLI that retires the plaintext MCP credential copies.
 *
 * Thin argv wrapper. Every decision lives in `cli/lib/harness-env.ts`, which
 * `cli/doctor.ts` imports directly — the core has to sit under `cli/` because
 * `cli/` is import-closed (AGENTS.md section 4.5: "Shared code goes in
 * `cli/lib/`; a `scripts/` file that needs it imports FROM `cli/`").
 *
 * The command used to GENERATE two plaintext copies of every MCP credential
 * (`.claude/settings.local.json` env block, `.auth/opencode/<VAR>`). Every MCP
 * server now reads `.env` itself through the `.env` loader, so the command is
 * kept as the migration path for a machine that still holds those copies, and
 * for the `prepare` line of a project that still calls it.
 *
 * Usage:
 *   bun run harness:env              retire the stale copies (backup notice for any .env cannot reproduce)
 *   bun run harness:env --check      exit 1 while a stale copy remains
 *   bun run harness:env --dry-run    print what WOULD be retired, change nothing
 *   bun run harness:env --json       machine-readable result for either mode
 *   bun scripts/harness-env.ts --placeholders
 *                                    create EMPTY .auth/opencode/<VAR> files for a LEGACY opencode.jsonc
 *                                    that still carries {file:} references. Run by `prepare`; reads no .env.
 *
 * NEVER PRINTS A VALUE. Every line below carries variable NAMES and a verdict.
 */

import {
  BACKUP_DIR,
  check,
  ensureOpencodePlaceholders,
  OPENCODE_SECRET_DIR,
  retire,
} from '../cli/lib/harness-env.ts';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const DRY_RUN = argv.includes('--dry-run');
const JSON_OUT = argv.includes('--json');
const PLACEHOLDERS = argv.includes('--placeholders');
const HELP = argv.includes('--help') || argv.includes('-h');

function names(list: string[]): string {
  return list.length === 0 ? '(none)' : list.join(', ');
}

if (HELP) {
  process.stdout.write(`harness-env — retire the plaintext MCP credential copies

MCP servers no longer read a copy of .env. Each one that needs .env values starts through
  bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <server>
in .mcp.json, opencode.jsonc and .codex/config.toml, so it reads .env (or the secret manager)
itself, however the harness was launched. This command removes what the old generator left:
the env block of .claude/settings.local.json and ${OPENCODE_SECRET_DIR}/.

  bun run harness:env              retire the stale copies
  bun run harness:env --check      exit 1 while a stale copy remains
  bun run harness:env --dry-run    report what would be retired, change nothing
  bun run harness:env --json       machine-readable result

A copy equal to .env is deleted. A copy .env does not reproduce is moved to ${BACKUP_DIR}/
and named: put the right value in .env yourself, then delete that directory. A copy a host
config still reads without the loader is kept until that config changes
(\`bun run agents:compat:check\` names the change). Values are never printed.
`);
  process.exit(0);
}

if (PLACEHOLDERS) {
  // Runs inside `bun install` (the `prepare` script), so it must never fail the
  // install. It only matters for a legacy opencode.jsonc; on the loader shape it
  // creates nothing, and it points at the retirement when copies remain.
  try {
    const result = ensureOpencodePlaceholders();
    if (result.created.length > 0 || result.error !== undefined) {
      process.stdout.write(
        `harness-env --placeholders: ${OPENCODE_SECRET_DIR}/ created ${result.created.length} empty `
        + `(${names(result.created)}) for a legacy opencode.jsonc${result.error === undefined ? '' : `; WARNING ${result.error}`}\n`,
      );
    }
    const stale = check().findings.filter(f => f.kind === 'stale-copy');
    if (stale.length > 0) {
      process.stdout.write(`harness-env: plaintext MCP credential copies still on disk (${names(stale.flatMap(f => f.names))}); run \`bun run harness:env\` to retire them.\n`);
    }
  }
  catch (err) {
    process.stdout.write(`harness-env --placeholders: skipped (${(err as Error).message}).\n`);
  }
  process.exit(0);
}

if (CHECK) {
  const result = check();
  if (JSON_OUT) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  else {
    process.stdout.write(`harness-env --check: ${result.ok ? 'OK' : 'STALE COPIES'}\n`);
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

const result = retire(undefined, { dryRun: DRY_RUN });

if (JSON_OUT) {
  // Safe by construction: RetireResult carries names and paths, never a value.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.errors.length === 0 ? 0 : 1);
}

if (result.errors.length > 0) {
  process.stdout.write('harness-env: REFUSED, nothing changed. An MCP config could not be parsed, and it might still read a copy:\n');
  for (const error of result.errors) { process.stdout.write(`  ${error}\n`); }
  process.exit(1);
}

const verb = DRY_RUN ? 'would retire' : 'retired';
process.stdout.write(`harness-env: ${result.changed ? verb : 'nothing to retire'}${DRY_RUN ? ' (dry run, nothing changed)' : ''}\n`);
for (const surface of [...result.claude, ...(result.opencode === null ? [] : [result.opencode])]) {
  process.stdout.write(`\n  ${surface.path}\n`);
  process.stdout.write(`    deleted (same value in .env): ${names(surface.removed)}\n`);
  process.stdout.write(`    backed up (.env differs or lacks it): ${names(surface.backedUp)}\n`);
  if (surface.kept.length > 0) {
    process.stdout.write(`    kept (a host config still reads them without the loader): ${names(surface.kept)}\n`);
  }
}
if (result.backupDirs.length > 0) {
  process.stdout.write(`\n  BACKUP: ${result.backupDirs.join(', ')}\n`);
  process.stdout.write('    These held a value .env does not have. Put the right one in .env (or the secret manager) yourself,\n');
  process.stdout.write('    then delete the directory: it is a plaintext copy too. Never paste a value into the chat.\n');
}
if (result.changed && !DRY_RUN) {
  process.stdout.write('\n  Restart the agent session: MCP servers read .env when the harness spawns them.\n');
}
