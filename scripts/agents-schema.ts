#!/usr/bin/env bun
/**
 * @fileoverview CLI for the `.agents/project.yaml` schema.
 *
 * Thin argv wrapper. Every decision lives in `cli/lib/agents-schema.ts`, which
 * `cli/update-boilerplate.ts` and `cli/doctor.ts` import directly — the core
 * has to sit under `cli/` because `cli/` is import-closed (AGENTS.md §4.5:
 * "Shared code goes in `cli/lib/`; a `scripts/` file that needs it imports
 * FROM `cli/`").
 *
 * Usage:
 *   bun run agents:schema            regenerate .agents/project.schema.yaml
 *   bun run agents:schema --check    fail when the committed schema is stale
 *   bun run agents:schema --project  list the key paths THIS project lacks
 *   bun run agents:schema --dry-run  print what would change, write nothing
 *   bun run agents:schema --json     machine-readable result for any mode
 *
 * The first two modes belong to the BOILERPLATE and exit 0 with a note
 * anywhere else (see `isSchemaOwner`). `--project` is the mode a consumer
 * runs, and it is also what `bun run up` and `setup:doctor` report.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  checkSchema,
  describeProjectDelta,
  generateSchema,
  isSchemaOwner,
  projectDelta,
  SCHEMA_FILE,
  SCHEMA_SOURCE,
} from '../cli/lib/agents-schema.ts';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const PROJECT = argv.includes('--project');
const DRY_RUN = argv.includes('--dry-run');
const JSON_OUT = argv.includes('--json');
const HELP = argv.includes('--help') || argv.includes('-h');

const root = process.cwd();
const sourcePath = join(root, SCHEMA_SOURCE);
const schemaPath = join(root, SCHEMA_FILE);

function out(text: string): void { process.stdout.write(text); }
function emit(payload: unknown): void { out(`${JSON.stringify(payload, null, 2)}\n`); }

if (HELP) {
  out(`agents-schema — the generated template behind ${SCHEMA_SOURCE}

  bun run agents:schema            regenerate ${SCHEMA_FILE}
  bun run agents:schema --check    exit 1 when the committed schema is stale
  bun run agents:schema --project  list the key paths this project is missing
  bun run agents:schema --dry-run  report what would change, write nothing
  bun run agents:schema --json     machine-readable result

The schema is the TEMPLATE a consumer project is compared against. It is
GENERATED from ${SCHEMA_SOURCE} in the boilerplate and SYNCED everywhere else,
so only the boilerplate regenerates it. Values that are this repo's identity —
its ruleset, its dates, its standing push authorization — are replaced, and a
leak gate refuses to emit the file when one survives.
`);
  process.exit(0);
}

if (!existsSync(sourcePath)) {
  out(`agents-schema: ${SCHEMA_SOURCE} not found — run from the repository root.\n`);
  process.exit(1);
}
const sourceText = readFileSync(sourcePath, 'utf8');

// --- CONSUMER MODE: what is this project missing? ---------------------------

if (PROJECT) {
  if (!existsSync(schemaPath)) {
    out(`agents-schema --project: ${SCHEMA_FILE} not found. Run \`bun run up\` to receive it.\n`);
    process.exit(1);
  }
  const delta = projectDelta(sourceText, readFileSync(schemaPath, 'utf8'));
  if (JSON_OUT) { emit(delta); }
  if (delta.error) {
    if (!JSON_OUT) { out(`agents-schema --project: ${delta.error}\n`); }
    process.exit(1);
  }
  if (!JSON_OUT) {
    if (delta.gaps.length === 0) {
      out(`agents-schema --project: OK — ${SCHEMA_SOURCE} has every key path the schema declares.\n`);
    }
    else {
      out(`agents-schema --project: ${describeProjectDelta(delta)}\n\n`);
      for (const gap of delta.gaps) {
        out(`  ${gap.block}${gap.wholeBlock ? ' (whole block missing)' : ''}\n`);
        for (const p of gap.paths) { out(`    ${p}\n`); }
      }
      out('\n  `bun run up` offers to insert these, one prompt per block.\n');
      if (delta.exempt.length > 0) { out(`  Silenced via updater.schema_exempt: ${delta.exempt.join(', ')}\n`); }
    }
  }
  // NEVER a failure exit: being behind upstream is not a broken repo, and a
  // red CI on every upstream key addition is how a team learns `--no-verify`.
  process.exit(0);
}

// --- OWNER MODES: generate and gate -----------------------------------------

const packageJsonPath = join(root, 'package.json');
const owner = existsSync(packageJsonPath) && isSchemaOwner(readFileSync(packageJsonPath, 'utf8'));
if (!owner) {
  const note = `${SCHEMA_FILE} is synced from upstream here, not generated. Use \`--project\` to see what this project is missing.`;
  if (JSON_OUT) { emit({ ok: true, skipped: true, reason: note }); }
  else { out(`agents-schema: skipped — ${note}\n`); }
  process.exit(0);
}

const generated = generateSchema(sourceText);

if (CHECK) {
  const committed = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf8') : '';
  const result = committed === ''
    ? { ok: false, missing: [], extra: [], remarked: [], error: `${SCHEMA_FILE} does not exist` }
    : checkSchema(sourceText, committed);
  if (JSON_OUT) { emit(result); }
  if (result.ok) {
    if (!JSON_OUT) { out('agents-schema --check: OK\n'); }
    process.exit(0);
  }
  if (!JSON_OUT) {
    out('agents-schema --check: STALE\n');
    if (result.error) { out(`  ${result.error}\n`); }
    const name = (paths: string[]): string => paths.slice(0, 10).join(', ') + (paths.length > 10 ? `, +${paths.length - 10} more` : '');
    if (result.missing.length > 0) { out(`  ${SCHEMA_FILE} is missing ${result.missing.length} path(s): ${name(result.missing)}\n`); }
    if (result.extra.length > 0) { out(`  ${SCHEMA_FILE} has ${result.extra.length} path(s) ${SCHEMA_SOURCE} does not: ${name(result.extra)}\n`); }
    if (result.remarked.length > 0) { out(`  required/optional marking differs at ${result.remarked.length} path(s): ${name(result.remarked)}\n`); }
    out(`\n  Fix: bun run agents:schema && git add ${SCHEMA_FILE}\n`);
  }
  process.exit(1);
}

if (generated.error) {
  if (JSON_OUT) { emit({ ok: false, error: generated.error, leaks: generated.leaks }); }
  else {
    out(`agents-schema: REFUSED — ${generated.error}\n`);
    for (const leak of generated.leaks) { out(`  line ${leak.line}: ${leak.pattern}\n    ${leak.text}\n`); }
    out(`\n  Either genericize the value in ${SCHEMA_SOURCE}, or add a rule for its path to GENERIC_RULES in cli/lib/agents-schema.ts.\n`);
  }
  process.exit(1);
}

const before = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf8') : '';
const changed = before !== generated.schema;

if (DRY_RUN) {
  if (JSON_OUT) { emit({ ok: true, changed, blanked: generated.blanked.length, generic: generated.generic }); }
  else { out(`agents-schema --dry-run: ${changed ? `${SCHEMA_FILE} WOULD change` : `${SCHEMA_FILE} is up to date`} (${generated.blanked.length} placeholder path(s), ${generated.generic.length} replaced)\n`); }
  process.exit(0);
}

if (changed) { writeFileSync(schemaPath, generated.schema); }
if (JSON_OUT) { emit({ ok: true, changed, blanked: generated.blanked.length, generic: generated.generic }); }
else {
  out(`agents-schema: ${changed ? 'wrote' : 'unchanged'} ${SCHEMA_FILE} (${generated.blanked.length} placeholder path(s), ${generated.generic.length} replaced)\n`);
  if (generated.generic.length > 0) { out(`  replaced: ${generated.generic.join(', ')}\n`); }
}
