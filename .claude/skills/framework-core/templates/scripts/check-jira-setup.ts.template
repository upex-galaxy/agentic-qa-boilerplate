#!/usr/bin/env bun
/**
 * check-jira-setup.ts — validates that the user's Jira workspace contains the
 * custom fields the methodology requires.
 *
 * Two inputs:
 *   - `.agents/jira-required.yaml` — declarative manifest of required /
 *     optional / unmapped slugs. Owned by the methodology, committed to the
 *     repo. Entries declare expected `name`, `type`, and (for option-type
 *     fields) the option slugs.
 *   - `.agents/jira.json` — auto-generated catalog of the user's actual Jira
 *     custom fields. Produced by `bun run jira:sync-fields`.
 *
 * For each `required` slug, the script verifies:
 *   1. The slug exists in `jira.json`.            Missing => ❌ ERROR.
 *   2. The `type` matches.                        Mismatch => ⚠️ WARNING.
 *   3. (option fields) every declared option key exists in jira.json.
 *                                                 Missing options => ⚠️ WARNING.
 *
 * `optional` slugs follow the same checks but missing => 💡 INFO (no error).
 * `unmapped` slugs are reported as informational lines pointing to the
 * manifest documentation.
 *
 * Exit code: 0 if all required present and correct, 1 if any required missing
 * or any required type mismatched. Warnings on optional/unmapped never affect
 * the exit code.
 *
 * Flags:
 *   --json      Emit a machine-readable summary instead of human-readable.
 *   --verbose   Show ✅ entries individually (default suppresses them).
 *   --help      Show usage.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RequiredEntry {
  name?: string
  type: string
  options?: string[]
  description?: string
  used_by?: string[]
}

interface UnmappedEntry {
  description?: string
  used_by?: string[]
}

interface Manifest {
  required: Record<string, RequiredEntry>
  optional: Record<string, RequiredEntry>
  unmapped: Record<string, UnmappedEntry>
}

interface JiraFieldEntry {
  id: string
  type?: string
  name?: string
  options?: Record<string, string>
  system?: boolean
  provider?: string
}

type Severity = 'ok' | 'missing' | 'mismatch' | 'info';

interface CheckResult {
  slug: string
  scope: 'required' | 'optional' | 'unmapped'
  severity: Severity
  expected: RequiredEntry | UnmappedEntry
  found?: JiraFieldEntry
  /** Human-readable reasons (one per problem). Empty for `ok`. */
  notes: string[]
  /** For option-type required entries: which option keys are missing. */
  missingOptions: string[]
}

// -----------------------------------------------------------------------------
// Loaders
// -----------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dir, '..');
const MANIFEST_PATH = join(REPO_ROOT, '.agents', 'jira-required.yaml');
const CATALOG_PATH = join(REPO_ROOT, '.agents', 'jira.json');

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`FATAL: ${relative(REPO_ROOT, MANIFEST_PATH)} does not exist.`);
    process.exit(1);
  }
  const text = readFileSync(MANIFEST_PATH, 'utf8');
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  }
  catch (err) {
    console.error(`FATAL: cannot parse ${relative(REPO_ROOT, MANIFEST_PATH)}: ${(err as Error).message}`);
    process.exit(1);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('FATAL: manifest must be a YAML mapping at the top level.');
    process.exit(1);
  }
  const root = parsed as Record<string, unknown>;
  const required = (root.required ?? {}) as Record<string, RequiredEntry>;
  const optional = (root.optional ?? {}) as Record<string, RequiredEntry>;
  const unmapped = (root.unmapped ?? {}) as Record<string, UnmappedEntry>;
  return { required, optional, unmapped };
}

function loadCatalog(): Record<string, JiraFieldEntry> {
  if (!existsSync(CATALOG_PATH)) {
    console.error(`FATAL: ${relative(REPO_ROOT, CATALOG_PATH)} does not exist.`);
    console.error('Run `bun run jira:sync-fields` first to populate the catalog.');
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  }
  catch (err) {
    console.error(`FATAL: cannot parse ${relative(REPO_ROOT, CATALOG_PATH)}: ${(err as Error).message}`);
    process.exit(1);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`FATAL: ${relative(REPO_ROOT, CATALOG_PATH)} must be a JSON object.`);
    process.exit(1);
  }
  return parsed as Record<string, JiraFieldEntry>;
}

// -----------------------------------------------------------------------------
// Comparison
// -----------------------------------------------------------------------------

/**
 * Loose type compatibility: jira.json sometimes reports types more specifically
 * than the manifest cares about (e.g. `datetime` vs declared `date`). Treat
 * common families as equivalent.
 */
function typesMatch(declared: string, found: string | undefined): boolean {
  if (!found) { return false; }
  if (declared === found) { return true; }
  // Accept date/datetime equivalence.
  if (declared === 'date' && found === 'datetime') { return true; }
  if (declared === 'datetime' && found === 'date') { return true; }
  // Accept `multi-option` <-> `array` (Jira reports multi-selects as `array`).
  if (declared === 'multi-option' && found === 'array') { return true; }
  if (declared === 'array' && found === 'multi-option') { return true; }
  // `any` is a wildcard.
  if (declared === 'any') { return true; }
  return false;
}

function checkRequired(
  slug: string,
  expected: RequiredEntry,
  catalog: Record<string, JiraFieldEntry>,
  scope: 'required' | 'optional',
): CheckResult {
  const found = catalog[slug];
  const notes: string[] = [];
  const missingOptions: string[] = [];

  if (!found) {
    return {
      slug,
      scope,
      severity: scope === 'required' ? 'missing' : 'info',
      expected,
      notes: ['not present in .agents/jira.json'],
      missingOptions: [],
    };
  }

  let severity: Severity = 'ok';

  if (!typesMatch(expected.type, found.type)) {
    severity = 'mismatch';
    notes.push(`type mismatch: declared "${expected.type}", found "${found.type ?? '<unknown>'}"`);
  }

  if (expected.type === 'option' && Array.isArray(expected.options) && expected.options.length > 0) {
    const presentOptionKeys = new Set(Object.keys(found.options ?? {}));
    for (const opt of expected.options) {
      if (!presentOptionKeys.has(opt)) { missingOptions.push(opt); }
    }
    if (missingOptions.length > 0) {
      if (severity === 'ok') { severity = 'mismatch'; }
      notes.push(`missing option(s): ${missingOptions.join(', ')}`);
    }
  }

  return { slug, scope, severity, expected, found, notes, missingOptions };
}

function checkUnmapped(slug: string, expected: UnmappedEntry): CheckResult {
  return {
    slug,
    scope: 'unmapped',
    severity: 'info',
    expected,
    notes: ['unmapped marker — see .agents/jira-required.yaml for migration path'],
    missingOptions: [],
  };
}

// -----------------------------------------------------------------------------
// Reporting
// -----------------------------------------------------------------------------

interface Counters {
  ok: number
  missing: number
  mismatch: number
  info: number
  required: number
  optional: number
  unmapped: number
}

function tally(results: CheckResult[]): Counters {
  const c: Counters = { ok: 0, missing: 0, mismatch: 0, info: 0, required: 0, optional: 0, unmapped: 0 };
  for (const r of results) {
    c[r.severity]++;
    c[r.scope]++;
  }
  return c;
}

function printHumanReport(
  results: CheckResult[],
  counters: Counters,
  catalogSize: number,
  verbose: boolean,
): void {
  console.log('Jira Setup Status');
  console.log('=================');
  console.log('Manifest:  .agents/jira-required.yaml');
  console.log(`Catalog:   .agents/jira.json (${catalogSize} fields)`);
  console.log('');
  console.log(`Required: ${counters.required} · Optional: ${counters.optional} · Unmapped: ${counters.unmapped}`);
  console.log(
    `Summary:  ✅ ${counters.ok} OK   ❌ ${counters.missing} missing   ⚠️ ${counters.mismatch} mismatched   💡 ${counters.info} informational`,
  );
  console.log('');

  const missing = results.filter(r => r.severity === 'missing');
  const mismatch = results.filter(r => r.severity === 'mismatch');
  const info = results.filter(r => r.severity === 'info');
  const ok = results.filter(r => r.severity === 'ok');

  if (missing.length > 0) {
    console.log('❌ MISSING required fields (must create in Jira):');
    console.log('');
    for (const r of missing) {
      const exp = r.expected as RequiredEntry;
      console.log(`  - ${r.slug}`);
      if (exp.name) { console.log(`    Suggested name: "${exp.name}"`); }
      console.log(`    Type: ${exp.type}`);
      if (exp.type === 'option' && exp.options?.length) {
        console.log(`    Suggested options: ${exp.options.join(', ')}`);
      }
      if (exp.used_by?.length) { console.log(`    Used by: ${exp.used_by.join(', ')}`); }
      console.log(
        '    Action: create a custom field in Jira admin → Issues → Custom fields,',
      );
      console.log(
        '            assign to the relevant issue type, then re-run',
      );
      console.log(
        '            `bun run jira:sync-fields --force` followed by `bun run jira:check`.',
      );
      console.log('');
    }
  }

  if (mismatch.length > 0) {
    console.log('⚠️ MISMATCHED fields (review):');
    console.log('');
    for (const r of mismatch) {
      const exp = r.expected as RequiredEntry;
      const found = r.found!;
      console.log(`  - ${r.slug}`);
      console.log(`    Found in jira.json: type=${found.type ?? '<unknown>'}, name=${JSON.stringify(found.name ?? '')}`);
      console.log(`    Expected: type=${exp.type}${exp.name ? `, name="${exp.name}"` : ''}`);
      if (r.missingOptions.length > 0) {
        console.log(`    Missing option(s): ${r.missingOptions.join(', ')}`);
      }
      for (const note of r.notes) { console.log(`    Note: ${note}`); }
      console.log('    Action: rename / convert in Jira OR update the manifest to match reality.');
      console.log('');
    }
  }

  if (info.length > 0) {
    console.log('💡 INFO:');
    console.log('');
    for (const r of info) {
      if (r.scope === 'optional') {
        const exp = r.expected as RequiredEntry;
        console.log(`  - ${r.slug} (optional)`);
        console.log('    Not present in your Jira. Methodology works without it.');
        if (exp.description) { console.log(`    Purpose: ${exp.description.trim().split('\n')[0]}`); }
      }
      else if (r.scope === 'unmapped') {
        const exp = r.expected as UnmappedEntry;
        console.log(`  - ${r.slug} (unmapped)`);
        const desc = (exp.description ?? '').trim().split('\n')[0];
        if (desc) { console.log(`    ${desc}`); }
        console.log('    See .agents/jira-required.yaml `unmapped:` for the migration path.');
      }
      console.log('');
    }
  }

  if (verbose && ok.length > 0) {
    console.log(`✅ OK (${ok.length}):`);
    for (const r of ok) {
      const exp = r.expected as RequiredEntry;
      console.log(`  - ${r.slug}  (type=${exp.type}${r.scope === 'optional' ? ', optional' : ''})`);
    }
    console.log('');
  }

  const exitCode = missing.filter(r => r.scope === 'required').length > 0
    || mismatch.filter(r => r.scope === 'required').length > 0
    ? 1
    : 0;
  console.log(`Exit: ${exitCode} (${exitCode === 0 ? 'no missing required fields' : 'required fields missing or mismatched'})`);
}

function printJsonReport(
  results: CheckResult[],
  counters: Counters,
  catalogSize: number,
): void {
  const exitCode = results.some(
    r => r.scope === 'required' && (r.severity === 'missing' || r.severity === 'mismatch'),
  )
    ? 1
    : 0;

  const summary = {
    manifest: '.agents/jira-required.yaml',
    catalog: '.agents/jira.json',
    catalog_size: catalogSize,
    counters,
    exit_code: exitCode,
    results: results.map(r => ({
      slug: r.slug,
      scope: r.scope,
      severity: r.severity,
      expected_type: (r.expected as RequiredEntry).type ?? null,
      expected_name: (r.expected as RequiredEntry).name ?? null,
      expected_options: (r.expected as RequiredEntry).options ?? null,
      found: r.found
        ? { id: r.found.id, type: r.found.type ?? null, name: r.found.name ?? null }
        : null,
      missing_options: r.missingOptions,
      notes: r.notes,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

function printHelp(): void {
  console.log(`Usage: bun run jira:check [--json] [--verbose] [--help]

Compares .agents/jira-required.yaml (the methodology's required-fields manifest)
against .agents/jira.json (your Jira workspace's custom-field catalog) and
reports MISSING / MISMATCHED / OK status for each required and optional slug.

Flags:
  --json       Emit a machine-readable JSON summary.
  --verbose    Include OK entries in the human-readable report (default hides
               them for brevity).
  -h, --help   Show this help.

Exit code:
  0 — all required fields present and matching
  1 — at least one required field missing or type-mismatched
`);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  const asJson = args.includes('--json');
  const verbose = args.includes('--verbose') || args.includes('-v');

  const manifest = loadManifest();
  const catalog = loadCatalog();

  const results: CheckResult[] = [];
  for (const [slug, expected] of Object.entries(manifest.required)) {
    results.push(checkRequired(slug, expected, catalog, 'required'));
  }
  for (const [slug, expected] of Object.entries(manifest.optional)) {
    results.push(checkRequired(slug, expected, catalog, 'optional'));
  }
  for (const [slug, expected] of Object.entries(manifest.unmapped)) {
    results.push(checkUnmapped(slug, expected));
  }

  const counters = tally(results);
  const catalogSize = Object.keys(catalog).length;

  if (asJson) {
    printJsonReport(results, counters, catalogSize);
  }
  else {
    printHumanReport(results, counters, catalogSize, verbose);
  }

  const exitCode = results.some(
    r => r.scope === 'required' && (r.severity === 'missing' || r.severity === 'mismatch'),
  )
    ? 1
    : 0;
  process.exit(exitCode);
}

main();
