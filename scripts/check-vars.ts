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
 *
 * GitHub-only vars (e.g. AUTO_SYNC, SLACK_WEBHOOK_URL) are pushed to CI by the
 * installer and may stay commented locally — they are NOT required to have an
 * uncommented slot, but if they DO appear uncommented they must still be in the
 * manifest (rule 2).
 *
 * Exit code: 0 if manifest is valid AND parity holds, 1 otherwise.
 */

import { join } from 'node:path';

import {
  parseDotEnvExampleKeys,
  validateVarManifest,
  VAR_MANIFEST,
  varsFor,
} from '../cli/lib/variables-manifest';

const REPO_ROOT = join(import.meta.dir, '..');
const ENV_EXAMPLE = join(REPO_ROOT, '.env.example');

function main(): void {
  const errors: string[] = [];

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

  // Report.
  console.log('Variable Manifest ⇄ .env.example Parity');
  console.log('=======================================');
  console.log(`Manifest vars:               ${VAR_MANIFEST.length} (${localVars.length} with dest∋local, ${varsFor('github').length} with dest∋github)`);
  console.log(`Uncommented .env.example keys: ${exampleKeys.length}`);
  console.log('');

  if (errors.length === 0) {
    console.log('OK — manifest and .env.example are in lockstep.');
    process.exit(0);
  }

  console.log(`ERRORS (${errors.length}):`);
  for (const e of errors) {
    console.log(`  - ${e}`);
  }
  console.log('');
  console.log('Fix: add the missing slot to .env.example, or add/remove the var in cli/lib/variables-manifest.ts.');
  process.exit(1);
}

main();
