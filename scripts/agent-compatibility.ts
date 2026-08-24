#!/usr/bin/env bun
/**
 * @fileoverview `bun run agents:compat` / `--check` entrypoint.
 *
 * The engine itself lives in `cli/lib/agent-compatibility.ts` because `cli/` is
 * the updater's self-update component and must be import-closed — see that
 * file's header for the failure this split prevents. This file is the CLI
 * surface only: argument parsing, printing, exit code. It also re-exports the
 * engine so `scripts/agent-compatibility.ts` stays a valid import path.
 */

import type { CompatibilityCheck } from '../cli/lib/agent-compatibility.ts';
import {
  checkAgentCompatibility,
  repairClaudeSkillsAlias,
  repairCommandWrappers,
} from '../cli/lib/agent-compatibility.ts';

export * from '../cli/lib/agent-compatibility.ts';

function printCheck(result: CompatibilityCheck): void {
  if (result.ok) {
    console.log(`Agent compatibility OK: ${result.alias.path} -> ${result.alias.target} (${result.alias.type})`);
    return;
  }
  for (const error of result.errors) {
    console.error(`ERROR: ${error}`);
  }
}

if (import.meta.main) {
  const checkOnly = process.argv.includes('--check');
  try {
    if (!checkOnly) {
      const alias = repairClaudeSkillsAlias();
      console.log(`Claude skills alias ${alias.status}: ${alias.path} -> ${alias.target} (${alias.type})`);
      const wrappers = repairCommandWrappers();
      console.log(`Command wrappers synchronized: ${wrappers} updated`);
    }
    const result = checkAgentCompatibility();
    printCheck(result);
    if (!result.ok) { process.exitCode = 1; }
  }
  catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
