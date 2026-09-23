#!/usr/bin/env bun
/**
 * @fileoverview CLI for the varlock env schema.
 *
 * Thin argv wrapper. Every decision lives in `cli/lib/env-schema.ts`, which
 * `cli/doctor.ts` imports directly; the core sits under `cli/` because `cli/`
 * is import-closed (AGENTS.md §4.5) and a `scripts/` file imports FROM it.
 *
 * Usage:
 *   bun run vars:schema            regenerate .env.core.schema (and seed .env.schema if absent)
 *   bun run vars:schema:check      exit 1 when .env.core.schema is stale OR the committed
 *                                  pair does not load through the pinned varlock
 *   bun run vars:schema --json     machine-readable result for either mode
 *
 * The pair-load half of `--check` is deliberate, not decoration: the layout
 * (`.env.schema` importing `.env.core.schema`) rests on a varlock rule stated
 * in its source and not in its public docs. This gate is what turns a varlock
 * bump that changes the rule into a red pre-commit instead of a schema that
 * silently validates nothing. No value is printed by either mode.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  checkCoreSchema,
  CORE_SCHEMA_FILE,
  loadSchemaPairThroughVarlock,
  PROJECT_SCHEMA_FILE,
  SCHEMA_SOURCE,
  seedProjectSchema,
  writeCoreSchema,
} from '../cli/lib/env-schema.ts';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const JSON_OUT = argv.includes('--json');
const HELP = argv.includes('--help') || argv.includes('-h');

const root = process.cwd();

function out(text: string): void { process.stdout.write(text); }
function emit(payload: unknown): void { out(`${JSON.stringify(payload, null, 2)}\n`); }

if (HELP) {
  out(`env-schema — ${CORE_SCHEMA_FILE} generated from ${SCHEMA_SOURCE}

  bun run vars:schema            regenerate ${CORE_SCHEMA_FILE}; seed ${PROJECT_SCHEMA_FILE} when absent
  bun run vars:schema:check      exit 1 when ${CORE_SCHEMA_FILE} is stale or the pair fails to load
  bun run vars:schema --json     machine-readable result

Validate your own values (redacted):  bunx varlock load --agent
`);
  process.exit(0);
}

if (!existsSync(join(root, 'package.json'))) {
  out('env-schema: run from the repository root (package.json not found).\n');
  process.exit(1);
}

if (CHECK) {
  const core = checkCoreSchema(root);
  const pair = core.ok ? loadSchemaPairThroughVarlock(root) : null;
  const ok = core.ok && pair !== null && pair.ok;

  if (JSON_OUT) {
    emit({
      ok,
      core: { file: CORE_SCHEMA_FILE, state: core.state },
      pair: pair === null
        ? null
        : { ok: pair.ok, exitCode: pair.exitCode, reason: pair.reason ?? null, sources: pair.sources, resolvedKeys: pair.resolvedKeys },
    });
    process.exit(ok ? 0 : 1);
  }

  out('Env schema (varlock)\n');
  out('====================\n');
  out(`${CORE_SCHEMA_FILE}: ${core.state}\n`);
  if (!core.ok) {
    out(`\nFix: bun run vars:schema && git add ${CORE_SCHEMA_FILE}\n`);
    process.exit(1);
  }
  if (pair === null || !pair.ok) {
    out(`Pair load through varlock: FAILED (${pair?.reason ?? 'unknown'})\n`);
    for (const line of pair?.stderrTail ?? []) { out(`  ${line}\n`); }
    out(`\nThe committed ${PROJECT_SCHEMA_FILE} + ${CORE_SCHEMA_FILE} pair does not load with the pinned varlock.\n`);
    out('If varlock was just bumped, re-read the header of cli/lib/env-schema.ts before changing the layout.\n');
    process.exit(1);
  }
  out(`Pair load through varlock: OK (${pair.resolvedKeys.length} items, sources: ${pair.sources.map(s => s.label).join(', ')})\n`);
  process.exit(0);
}

// --- GENERATE ---------------------------------------------------------------

const coreChanged = writeCoreSchema(root);
const projectSeeded = seedProjectSchema(root);

if (JSON_OUT) {
  emit({ ok: true, core: { file: CORE_SCHEMA_FILE, changed: coreChanged }, project: { file: PROJECT_SCHEMA_FILE, seeded: projectSeeded } });
  process.exit(0);
}
out(`${CORE_SCHEMA_FILE}: ${coreChanged ? 'regenerated' : 'already up to date'}\n`);
out(`${PROJECT_SCHEMA_FILE}: ${projectSeeded ? 'created from the template (project-owned from now on)' : 'kept (project-owned)'}\n`);
if (coreChanged || projectSeeded) {
  out(`\nNext: git add ${[coreChanged ? CORE_SCHEMA_FILE : null, projectSeeded ? PROJECT_SCHEMA_FILE : null].filter(Boolean).join(' ')}\n`);
}
