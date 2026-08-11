#!/usr/bin/env bun
/**
 * check-vars.ts — asserts the variable manifest and `.env.example` agree.
 *
 * Per handoff decision D1 (`.scratch/handoff-installer-variables-automation.md`):
 * `cli/lib/variables-manifest.ts` is the single source of truth, while
 * `.env.example` stays the human-facing file developers copy from. This script
 * is the lockstep guard between them, run in `repo:check` / pre-commit so the
 * two never drift again.
 *
 * Parity rules:
 *   1. Every manifest var whose destinations include `local` MUST have an
 *      UNCOMMENTED `KEY=` slot in `.env.example` (it is what humans copy).
 *   2. Every UNCOMMENTED key in `.env.example` MUST exist in the manifest
 *      (no orphan keys with no destination routing).
 *   3. No manifest var may hold a DIFFERENT value in the process environment
 *      than in the repo's `.env`. The process value silently wins at load time,
 *      so a stale one makes a corrected `.env` a no-op — see `checkEnvDrift`
 *      below for the full rationale and the diagnosis commands. Skipped when
 *      `.env` is absent (CI, fresh clone).
 *
 * GitHub-only vars (e.g. AUTO_SYNC, SLACK_WEBHOOK_URL) are pushed to CI by the
 * installer and may stay commented locally — they are NOT required to have an
 * uncommented slot, but if they DO appear uncommented they must still be in the
 * manifest (rule 2).
 *
 * Exit code: 0 if manifest is valid AND parity holds AND there is no drift,
 * 1 otherwise.
 */

import type { VarSpec } from '../cli/lib/variables-manifest';
import { existsSync } from 'node:fs';

import { join } from 'node:path';
import {
  parseDotEnvExampleKeys,
  parseDotEnvPairs,
  validateVarManifest,
  VAR_MANIFEST,
  varsFor,
} from '../cli/lib/variables-manifest';

const REPO_ROOT = join(import.meta.dir, '..');
const ENV_EXAMPLE = join(REPO_ROOT, '.env.example');
const ENV_FILE = join(REPO_ROOT, '.env');

/**
 * Masks a value for display. Secrets never print at all; non-secrets print in
 * full because seeing the two hosts side by side IS the diagnosis.
 */
function display(spec: VarSpec | undefined, value: string): string {
  if (value === '') { return '(empty)'; }
  if (spec?.secret) { return `${'*'.repeat(8)} (${value.length} chars)`; }
  return value;
}

/**
 * Rule 3 — the process environment must agree with the repo's `.env`.
 *
 * A variable that is ALREADY present in the process wins over the `.env` file
 * under both loaders this repo uses: `bun` autoloads `.env` without overriding,
 * and `dotenv-cli` does the same unless `-o` is passed. So a stale value
 * inherited from whatever spawned the shell (or an agent session) silently
 * shadows a corrected `.env`, and a full application restart does not clear it
 * because the value is re-inherited every time.
 *
 * That is not hypothetical: a stale `ATLASSIAN_URL` made `jira:sync-issues`
 * overwrite `.context/PBI/` with content from a pre-migration Atlassian site
 * while reporting success (upex-bunkai-tms, 2026-08-10). Identity values are
 * anchored to `.agents/project.yaml` now (see `cli/lib/atlassian-instance.ts`),
 * but that fixes one variable. This rule attacks the whole class: ANY manifest
 * variable whose process value disagrees with `.env` fails the check loudly.
 *
 * Diagnosing a hit: walk the process ancestry with `ps eww -p <pid>` to find who
 * injected it, and test the login shell in isolation with
 * `env -i HOME=$HOME zsh -l -c 'echo $VAR'` — testing from the contaminated
 * shell inherits the bad value and gives a false negative.
 *
 * Skipped entirely when `.env` is absent (CI, fresh clone): there is nothing to
 * compare against, and the manifest⇄`.env.example` rules already cover that case.
 *
 * SEVERITY IS CALLER-CONTROLLED. Rules 1 and 2 describe the REPOSITORY and are
 * always fatal. Drift describes the DEVELOPER'S MACHINE, so making it fatal
 * everywhere would block a CSS fix from being pushed because a shell somewhere up
 * the ancestry carries a stale Jira host. Set `VARS_ENV_CHECK_DRIFT=warn` to
 * report drift without failing; `.husky/pre-push` does exactly that. Explicit
 * runs and `repo:check` leave it unset, so there it stays a hard error.
 */
function checkEnvDrift(errors: string[], warnings: string[]): 'checked' | 'skipped' {
  if (!existsSync(ENV_FILE)) { return 'skipped'; }

  const softFail = process.env.VARS_ENV_CHECK_DRIFT === 'warn';
  const sink = softFail ? warnings : errors;
  const filePairs = parseDotEnvPairs(ENV_FILE);
  const specByName = new Map(VAR_MANIFEST.map(s => [s.name, s]));

  for (const [name, fileValue] of filePairs) {
    // Only manifest vars are in scope. An unknown key in `.env` is rule 2's job.
    const spec = specByName.get(name);
    if (!spec) { continue; }

    // An EMPTY file value shadows nothing — the process is then the only source,
    // which is legitimate (a secret injected by the platform, a value the user
    // exports on purpose). Same carve-out `cli/install.ts` makes when it loads
    // `.env`: only a non-empty file value overrides the process. Without this the
    // rule fires on every blank slot in the template and becomes noise.
    if (fileValue === '') { continue; }

    const procValue = process.env[name];
    // Absent from the process is fine: the loader will supply the file value.
    if (procValue === undefined) { continue; }
    if (procValue === fileValue) { continue; }

    sink.push(
      `ENV_DRIFT: '${name}' differs between the process environment and .env — `
      + `process=${display(spec, procValue)} vs .env=${display(spec, fileValue)}. `
      + 'The process value WINS at load time, so .env is being ignored in silence.',
    );
  }

  return 'checked';
}

function main(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 0 — the manifest itself must be structurally valid.
  try {
    validateVarManifest();
  }
  catch (err) {
    console.error(`FATAL: VAR_MANIFEST is invalid: ${(err as Error).message}`);
    process.exit(1);
  }

  const exampleKeys = parseDotEnvExampleKeys(ENV_EXAMPLE);
  const exampleSet = new Set(exampleKeys);
  const manifestNames = new Set(VAR_MANIFEST.map(s => s.name));

  // Rule 1 — every local-destination var has an uncommented slot.
  const localVars = varsFor('local');
  const missingLocalSlots: string[] = [];
  for (const spec of localVars) {
    if (!exampleSet.has(spec.name)) {
      missingLocalSlots.push(spec.name);
    }
  }

  // Rule 2 — every uncommented example key is a known manifest var.
  const orphanKeys: string[] = [];
  for (const key of exampleKeys) {
    if (!manifestNames.has(key)) {
      orphanKeys.push(key);
    }
  }

  for (const name of missingLocalSlots) {
    errors.push(`MISSING_SLOT: manifest var '${name}' (dest∋local) has no uncommented slot in .env.example.`);
  }
  for (const key of orphanKeys) {
    errors.push(`ORPHAN_KEY: '${key}' is uncommented in .env.example but absent from VAR_MANIFEST.`);
  }

  // Rule 3 — the process environment must not shadow `.env` with a stale value.
  const driftStatus = checkEnvDrift(errors, warnings);
  const driftSoft = process.env.VARS_ENV_CHECK_DRIFT === 'warn';

  const driftLabel = driftStatus === 'skipped'
    ? 'skipped (no .env)'
    : driftSoft ? 'checked (warn-only)' : 'checked';

  // Report.
  console.log('Variable Manifest ⇄ .env.example Parity');
  console.log('=======================================');
  console.log(`Manifest vars:               ${VAR_MANIFEST.length} (${localVars.length} with dest∋local, ${varsFor('github').length} with dest∋github)`);
  console.log(`Uncommented .env.example keys: ${exampleKeys.length}`);
  console.log(`Process env ⇄ .env drift:     ${driftLabel}`);
  console.log('');

  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length}) — reported, not blocking:`);
    for (const w of warnings) {
      console.log(`  - ${w}`);
    }
    console.log('');
    printDriftRemedy();
    console.log('');
  }

  if (errors.length === 0) {
    console.log(
      warnings.length > 0
        ? 'OK — manifest and .env.example are in lockstep. Env drift above is a warning here.'
        : 'OK — manifest and .env.example are in lockstep, and no env drift.',
    );
    process.exit(0);
  }

  console.log(`ERRORS (${errors.length}):`);
  for (const e of errors) {
    console.log(`  - ${e}`);
  }
  console.log('');
  console.log('Fix (MISSING_SLOT / ORPHAN_KEY): add the missing slot to .env.example, or add/remove the var in cli/lib/variables-manifest.ts.');
  if (errors.some(e => e.startsWith('ENV_DRIFT:'))) {
    printDriftRemedy();
  }
  process.exit(1);
}

/** Shared remedy block — printed for drift whether it lands as an error or a warning. */
function printDriftRemedy(): void {
  console.log('Fix (ENV_DRIFT): the process value is stale and shadows .env. Find who injected it —');
  console.log('  ps eww -p $PPID                          # walk the ancestry; repeat up the chain');
  console.log('  env -i HOME=$HOME zsh -l -c \'echo $VAR\'   # test the login shell in isolation');
  console.log('Testing from the contaminated shell inherits the bad value and gives a false negative.');
  console.log('Restarting the app does NOT fix it: the value is re-inherited from the same parent.');
  console.log('Relaunch the agent session through `bun run claude` / `bun run opencode` (they pass');
  console.log('dotenv -o, which forces .env over anything inherited).');
}

main();
