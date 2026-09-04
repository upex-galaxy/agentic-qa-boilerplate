#!/usr/bin/env bun
/**
 * @fileoverview `bun run agents:compat` / `--check` entrypoint.
 *
 * The engine itself lives in `cli/lib/agent-compatibility.ts` because `cli/` is
 * the updater's self-update component and must be import-closed — see that
 * file's header for the failure this split prevents. This file is the CLI
 * surface only: argument parsing, printing, exit code. It also re-exports the
 * engine so `scripts/agent-compatibility.ts` stays a valid import path.
 *
 * Output contract: the alias status line is printed on EVERY run, whatever
 * the overall verdict, and the errors are grouped per surface (instructions,
 * alias, wrappers, hooks, MCP). "Alias pending the migration commit" and "MCP
 * drift" must be distinguishable at a glance, never one flat failure.
 */

import type { CompatibilityCheck } from '../cli/lib/agent-compatibility.ts';
import {
  checkAgentCompatibility,
  describeAliasStatus,
  groupCompatibilityErrors,
  repairClaudeSkillsAlias,
  repairCommandWrappers,
} from '../cli/lib/agent-compatibility.ts';

export * from '../cli/lib/agent-compatibility.ts';

function printCheck(result: CompatibilityCheck): void {
  console.log(describeAliasStatus(result.alias));
  if (result.ok) {
    console.log('Agent compatibility OK.');
    return;
  }
  const groups = groupCompatibilityErrors(result.errors);
  console.error(`Agent compatibility FAILED: ${result.errors.length} error(s) across ${groups.length} surface(s).`);
  for (const bucket of groups) {
    console.error(`[${bucket.group}] ${bucket.label}`);
    for (const error of bucket.errors) {
      console.error(`  ERROR: ${error}`);
    }
  }
}

if (import.meta.main) {
  const checkOnly = process.argv.includes('--check');
  try {
    if (!checkOnly) {
      const alias = repairClaudeSkillsAlias();
      console.log(describeAliasStatus(alias));
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
