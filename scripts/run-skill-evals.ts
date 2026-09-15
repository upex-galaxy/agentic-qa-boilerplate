#!/usr/bin/env bun
/**
 * run-skill-evals.ts — discovers and runs every `evals/evals.json` under
 * `.agents/skills/**` and fails with a non-zero exit code when a case is
 * malformed or structurally inconsistent.
 *
 * Scope (deliberately minimal — this is the missing RUNNER, not a grading
 * framework): these are *activation* evals ("does the skill fire for this
 * prompt?"). Actually judging whether a live model run matched
 * `expected_behavior` / `expected_output` needs a real model invocation and a
 * grader (that is what `claude plugin eval` does for `case.yaml` +
 * `graders/*.md` suites). Wiring these `evals.json` files into that pipeline
 * is future work, not this script's job.
 *
 * PENDING: this script only validates STRUCTURE. It does not invoke a model,
 * so a green run here does NOT mean the 66 cases' skills actually activate
 * (or don't) for their prompts — that question is still open. See
 * docs/reports/2026-09-15-ola-f-doctrina.md "Qué queda abierto" for the full
 * note; this comment is the other half of that pointer.
 *
 * What this script DOES check, for every case, deterministically and
 * without any network/API call:
 *
 *   - the file is valid JSON with a non-empty `evals` array
 *   - every case has a non-empty prompt and a non-empty expected-outcome
 *     field (`expected_behavior` or `expected_output`, whichever shape the
 *     file uses)
 *   - the polarity field (`category: positive|negative` or a boolean
 *     `should_trigger`) is present and valid, when the shape declares one
 *   - `name`/`id` is unique within the file
 *   - an `expected_skill` field (when present) resolves to a real skill
 *     directory under `.agents/skills/`
 *   - the file's own `skill_name` (when present) matches the directory it
 *     lives under
 *
 * A case that only has weak signal (e.g. a positive prompt sharing no
 * obvious keyword with its skill's frontmatter description) is reported as a
 * WARNING, never a failure — that heuristic is too noisy to gate on.
 *
 * Discovery: `.agents/skills/*\/evals/evals.json`. `.scratch` and any
 * `.backups*` directory are dead copies, never source, and are skipped.
 *
 * Flags:
 *   --verbose    Log every case processed.
 *   --help       Show usage.
 *
 * Exit codes:
 *   0 — every eval file discovered and every case passed structural checks
 *   1 — fatal error (no evals found, unreadable file) or a case failed
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const SKILLS_DIR = join(REPO_ROOT, '.agents', 'skills');

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

function printHelp(): void {
  console.log(`Usage: bun scripts/run-skill-evals.ts [--verbose] [--help]

Discovers every .agents/skills/*/evals/evals.json, structurally validates
each activation-eval case, and fails (exit 1) if any case is malformed.

Flags:
  --verbose    Log every case processed, not just failures/warnings.
  -h, --help   Show this help.

Exit code:
  0 — all discovered eval files are structurally valid
  1 — fatal error, or at least one case failed validation
`);
}

let VERBOSE = false;
function vlog(msg: string): void {
  if (VERBOSE) { console.log(`  ${msg}`); }
}

// -----------------------------------------------------------------------------
// Discovery
// -----------------------------------------------------------------------------

function listSkillSlugs(): string[] {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`FATAL: ${relative(REPO_ROOT, SKILLS_DIR)} not found.`);
    process.exit(1);
  }
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  const slugs: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory() && !e.isSymbolicLink()) { continue; }
    if (e.name === '.scratch' || e.name.startsWith('.backups')) { continue; }
    slugs.push(e.name);
  }
  slugs.sort();
  return slugs;
}

interface EvalFile {
  slug: string
  path: string
  relPath: string
}

function discoverEvalFiles(slugs: string[]): EvalFile[] {
  const files: EvalFile[] = [];
  for (const slug of slugs) {
    const path = join(SKILLS_DIR, slug, 'evals', 'evals.json');
    if (existsSync(path)) {
      files.push({ slug, path, relPath: relative(REPO_ROOT, path) });
    }
  }
  return files;
}

// -----------------------------------------------------------------------------
// Case normalization (the 3 shapes actually in use across the 9 files)
// -----------------------------------------------------------------------------

type Polarity = 'positive' | 'negative' | 'unspecified';

interface RawCase {
  name?: unknown
  id?: unknown
  prompt?: unknown
  expected_behavior?: unknown
  expected_output?: unknown
  expected_skill?: unknown
  category?: unknown
  should_trigger?: unknown
  expectations?: unknown
}

interface NormalizedCase {
  key: string
  prompt: unknown
  expectedText: unknown
  expectedSkill: unknown
  polarity: Polarity
  polarityFieldPresent: boolean
  polarityFieldValid: boolean
}

function normalizeCase(raw: RawCase, index: number): NormalizedCase {
  const key = typeof raw.name === 'string'
    ? raw.name
    : raw.id !== undefined ? String(raw.id) : `#${index}`;

  const expectedText = raw.expected_behavior ?? raw.expected_output;

  let polarity: Polarity = 'unspecified';
  let polarityFieldPresent = false;
  let polarityFieldValid = true;

  if ('category' in raw) {
    polarityFieldPresent = true;
    if (raw.category === 'positive' || raw.category === 'negative') {
      polarity = raw.category;
    }
    else {
      polarityFieldValid = false;
    }
  }
  else if ('should_trigger' in raw) {
    polarityFieldPresent = true;
    if (typeof raw.should_trigger === 'boolean') {
      polarity = raw.should_trigger ? 'positive' : 'negative';
    }
    else {
      polarityFieldValid = false;
    }
  }
  // Shape with `expectations` (no explicit polarity field) — these files
  // only encode positive activation cases today; treated as unspecified
  // rather than assumed, so a future negative case added without a polarity
  // field is not silently misread as positive.

  return {
    key,
    prompt: raw.prompt,
    expectedText,
    expectedSkill: raw.expected_skill,
    polarity,
    polarityFieldPresent,
    polarityFieldValid,
  };
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

interface CaseResult {
  key: string
  errors: string[]
  warnings: string[]
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateCase(raw: RawCase, index: number, knownSlugs: Set<string>): CaseResult {
  const c = normalizeCase(raw, index);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isNonEmptyString(c.prompt)) {
    errors.push('missing or empty `prompt`');
  }
  if (!isNonEmptyString(c.expectedText)) {
    errors.push('missing or empty `expected_behavior`/`expected_output`');
  }
  if (c.polarityFieldPresent && !c.polarityFieldValid) {
    errors.push('`category` must be "positive"/"negative", or `should_trigger` must be a boolean');
  }
  if (!c.polarityFieldPresent && !('expectations' in raw)) {
    warnings.push('no polarity field (`category` or `should_trigger`) — cannot tell if this is a positive or negative activation case');
  }
  if (isNonEmptyString(c.expectedSkill) && !knownSlugs.has(c.expectedSkill)) {
    errors.push(`\`expected_skill: ${c.expectedSkill}\` does not match any directory under .agents/skills/`);
  }
  if ('expectations' in raw) {
    if (!Array.isArray(raw.expectations) || raw.expectations.length === 0) {
      errors.push('`expectations` present but not a non-empty array');
    }
  }

  return { key: c.key, errors, warnings };
}

interface FileResult {
  file: EvalFile
  caseCount: number
  passed: number
  failed: number
  warned: number
  errors: string[]
}

function validateFile(file: EvalFile, knownSlugs: Set<string>): FileResult {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file.path, 'utf8'));
  }
  catch (err) {
    return {
      file,
      caseCount: 0,
      passed: 0,
      failed: 1,
      warned: 0,
      errors: [`invalid JSON: ${(err as Error).message}`],
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { file, caseCount: 0, passed: 0, failed: 1, warned: 0, errors: ['top-level value must be an object with an `evals` array'] };
  }

  const obj = parsed as { evals?: unknown, skill_name?: unknown };

  if (isNonEmptyString(obj.skill_name) && obj.skill_name !== file.slug) {
    errors.push(`\`skill_name: ${obj.skill_name}\` does not match the owning directory \`${file.slug}\``);
  }

  if (!Array.isArray(obj.evals) || obj.evals.length === 0) {
    errors.push('`evals` must be a non-empty array');
    return { file, caseCount: 0, passed: 0, failed: 1, warned: 0, errors };
  }

  const seenKeys = new Set<string>();
  let passed = 0;
  let failed = 0;
  let warned = 0;

  for (let i = 0; i < obj.evals.length; i++) {
    const raw = obj.evals[i] as RawCase;
    const result = validateCase(raw, i, knownSlugs);

    if (seenKeys.has(result.key)) {
      result.errors.push(`duplicate case key "${result.key}" within this file`);
    }
    seenKeys.add(result.key);

    if (result.errors.length > 0) {
      failed++;
      vlog(`[${file.slug}] FAIL ${result.key}: ${result.errors.join('; ')}`);
    }
    else {
      passed++;
      vlog(`[${file.slug}] pass ${result.key}${result.warnings.length > 0 ? ` (warn: ${result.warnings.join('; ')})` : ''}`);
    }
    if (result.warnings.length > 0) { warned++; }

    for (const e of result.errors) { errors.push(`${result.key}: ${e}`); }
  }

  return { file, caseCount: obj.evals.length, passed, failed, warned, errors };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  VERBOSE = argv.includes('--verbose') || argv.includes('-v');

  const slugs = listSkillSlugs();
  const knownSlugs = new Set(slugs);
  const files = discoverEvalFiles(slugs);

  if (files.length === 0) {
    console.error('FATAL: no evals/evals.json found under .agents/skills/*/evals/.');
    process.exit(1);
  }

  const results = files.map(f => validateFile(f, knownSlugs));

  let totalCases = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarned = 0;

  for (const r of results) {
    totalCases += r.caseCount;
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalWarned += r.warned;

    const status = r.errors.length === 0 && r.failed === 0 ? '✅' : '❌';
    console.log(`${status} ${r.file.relPath}: ${r.passed}/${r.caseCount} passed${r.warned > 0 ? `, ${r.warned} warned` : ''}${r.failed > 0 ? `, ${r.failed} FAILED` : ''}`);
    for (const e of r.errors) {
      console.error(`   ERROR: ${e}`);
    }
  }

  console.log('---');
  console.log(`Files: ${results.length} · Cases: ${totalCases} · Passed: ${totalPassed} · Warned: ${totalWarned} · Failed: ${totalFailed}`);

  const anyFailure = results.some(r => r.failed > 0 || (r.errors.length > 0 && r.caseCount === 0));
  process.exit(anyFailure ? 1 : 0);
}

main();
