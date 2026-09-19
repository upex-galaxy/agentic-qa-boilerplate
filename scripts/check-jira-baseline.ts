#!/usr/bin/env bun
/**
 * check-jira-baseline.ts — is this project's `work_types:` set behind upstream's?
 *
 * `.agents/jira-required.yaml` is the INPUT to `jira:sync-workflows`, which
 * catalogs only the work types declared in it. A manifest missing a work type
 * upstream has since added regenerates a TRUNCATED `.agents/jira-workflows.json`
 * and still exits 0, so every transition on that work type falls into the
 * unmapped-status fallback from then on, permanently and silently.
 *
 * This check makes that visible. It is WARN-ONLY and ALWAYS exits 0 (except on
 * `--write` failure): a project may legitimately not use a work type, and a
 * legitimate omission must never become a wall.
 *
 * Why the baseline is a constant and not a read of upstream's file, plus how
 * upstream keeps it honest: see `scripts/lib/jira-required-baseline.ts`.
 *
 * Usage:
 *   bun run jira:baseline            # compare and report (always exit 0)
 *   bun run jira:baseline --write    # regenerate the baseline FROM this repo's
 *                                    # manifest. Upstream-maintainer command:
 *                                    # running it in a consumer silences the
 *                                    # warning instead of answering it.
 *   bun run jira:baseline --json     # machine-readable
 */

import type { WorkTypeComparison } from './lib/jira-required-baseline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  compareWorkTypes,
  parseWorkTypeKeys,
  UPSTREAM_WORK_TYPE_KEYS,
} from './lib/jira-required-baseline';

const REPO_ROOT = join(import.meta.dir, '..');
const MANIFEST_PATH = join(REPO_ROOT, '.agents', 'jira-required.yaml');
const BASELINE_MODULE_PATH = join(import.meta.dir, 'lib', 'jira-required-baseline.ts');

const C = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  yellow: '\x1B[33m',
  green: '\x1B[32m',
  cyan: '\x1B[36m',
};

/** Rewrite the `UPSTREAM_WORK_TYPE_KEYS` array literal in place. */
function writeBaseline(keys: string[]): void {
  const source = readFileSync(BASELINE_MODULE_PATH, 'utf8');
  const arrayRe = /(export const UPSTREAM_WORK_TYPE_KEYS: readonly string\[\] = \[)[\s\S]*?(\n\];)/;
  if (!arrayRe.test(source)) {
    console.error(`FATAL: could not find UPSTREAM_WORK_TYPE_KEYS in ${relative(REPO_ROOT, BASELINE_MODULE_PATH)}.`);
    process.exit(1);
  }
  const body = keys.map(k => `\n  '${k}',`).join('');
  writeFileSync(BASELINE_MODULE_PATH, source.replace(arrayRe, `$1${body}$2`), 'utf8');
  console.log(`${C.green}✔${C.reset} Wrote ${keys.length} work-type key(s) to ${relative(REPO_ROOT, BASELINE_MODULE_PATH)}`);
}

function report(localKeys: string[], cmp: WorkTypeComparison): void {
  console.log('');
  console.log(`${C.cyan}Jira manifest baseline${C.reset}`);
  console.log(`  manifest:  ${relative(REPO_ROOT, MANIFEST_PATH)} (${localKeys.length} work types)`);
  console.log(`  baseline:  upstream declares ${UPSTREAM_WORK_TYPE_KEYS.length}`);
  console.log('');

  if (cmp.missingLocally.length > 0) {
    console.log(`${C.yellow}WARNING${C.reset} — upstream declares ${cmp.missingLocally.length} work type(s) this project does not:`);
    for (const key of cmp.missingLocally) {
      console.log(`  - ${key}`);
    }
    console.log('');
    console.log(`${C.dim}  jira:sync-workflows catalogs only what the manifest declares, so any${C.reset}`);
    console.log(`${C.dim}  transition on the above resolves through the unmapped-status fallback.${C.reset}`);
    console.log(`${C.dim}  If the project genuinely does not use one, this warning is correct and${C.reset}`);
    console.log(`${C.dim}  harmless. If it does, copy the block from upstream's${C.reset}`);
    console.log(`${C.dim}  .agents/jira-required.yaml and re-run: bun run jira:sync-workflows${C.reset}`);
    console.log('');
  }

  if (cmp.extraLocally.length > 0) {
    console.log(`${C.dim}NOTE — declared here, absent from the baseline: ${cmp.extraLocally.join(', ')}${C.reset}`);
    console.log(`${C.dim}  A project addition needs nothing. In the boilerplate itself it means the${C.reset}`);
    console.log(`${C.dim}  baseline is stale: run \`bun run jira:baseline --write\`.${C.reset}`);
    console.log('');
  }

  if (cmp.missingLocally.length === 0 && cmp.extraLocally.length === 0) {
    console.log(`${C.green}✔${C.reset} Manifest work types match the upstream baseline.`);
    console.log('');
  }
}

const USAGE = `Usage: bun run jira:baseline [--write] [--json] [--help]

Compares the \`work_types:\` keys declared in .agents/jira-required.yaml against
upstream's baseline (scripts/lib/jira-required-baseline.ts). A work type upstream
declares and this project does not is reported as a WARNING, because
jira:sync-workflows catalogs only what the manifest declares — so its transitions
would silently resolve through the unmapped-status fallback forever.

WARN-ONLY: always exits 0. A legitimate omission must not become a wall.

Flags:
  --write      Regenerate the baseline FROM this repo's manifest. Maintainer
               command for the boilerplate itself; in a consumer repo it
               silences the warning instead of answering it.
  --json       Machine-readable output.
  -h, --help   This text.
`;

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!existsSync(MANIFEST_PATH)) {
    // A repo with no manifest has nothing to compare, and this check never blocks.
    console.log(`${C.dim}jira:baseline — ${relative(REPO_ROOT, MANIFEST_PATH)} not found; skipped.${C.reset}`);
    process.exit(0);
  }

  const localKeys = parseWorkTypeKeys(readFileSync(MANIFEST_PATH, 'utf8'));

  if (argv.includes('--write')) {
    writeBaseline(localKeys);
    process.exit(0);
  }

  const cmp = compareWorkTypes(localKeys);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      manifest: relative(REPO_ROOT, MANIFEST_PATH),
      localWorkTypes: localKeys,
      baselineWorkTypes: [...UPSTREAM_WORK_TYPE_KEYS],
      missingLocally: cmp.missingLocally,
      extraLocally: cmp.extraLocally,
    }, null, 2));
    process.exit(0);
  }

  report(localKeys, cmp);
  // Warn-only by contract.
  process.exit(0);
}

if (import.meta.main) { main(); }
