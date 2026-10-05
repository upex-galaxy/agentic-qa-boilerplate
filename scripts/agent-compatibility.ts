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
 * alias, hooks, MCP, lint). "Alias pending the migration commit" and "MCP
 * drift" must be distinguishable at a glance, never one flat failure.
 */

import type { CompatibilityCheck } from '../cli/lib/agent-compatibility.ts';
import {
  checkAgentCompatibility,
  describeAliasStatus,
  groupCompatibilityErrors,
  removeShadowingCommands,
  repairClaudeSkillsAlias,
  SHADOWING_COMMANDS_BACKUP_DIR,
} from '../cli/lib/agent-compatibility.ts';
import { declaredHarnesses } from '../cli/lib/harness-selection.ts';

export * from '../cli/lib/agent-compatibility.ts';

function printCheck(result: CompatibilityCheck): void {
  console.log(describeAliasStatus(result.alias));
  console.log(`Harnesses checked: ${result.harnesses.join(', ')}.`);
  // Notes never fail the check: a harness the project does not use, skipped.
  for (const note of result.notes) {
    console.log(`  NOTE: ${note}`);
  }
  // Warnings never fail the check: each names the file and what to add.
  for (const warning of result.warnings) {
    console.warn(`  WARN: ${warning}`);
  }
  if (result.ok) {
    console.log(`Agent compatibility OK${result.warnings.length > 0 ? ` (${result.warnings.length} warning(s) above)` : ''}.`);
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
      if (declaredHarnesses().harnesses.includes('claude')) {
        const alias = repairClaudeSkillsAlias();
        console.log(describeAliasStatus(alias));
      }
      for (const moved of removeShadowingCommands()) {
        console.log(`Command shadowed a skill, moved to ${SHADOWING_COMMANDS_BACKUP_DIR}/${moved}`);
      }
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
