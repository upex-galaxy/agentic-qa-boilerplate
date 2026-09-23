/**
 * @fileoverview The varlock env schema, generated from the variable manifest.
 *
 * Two committed files, mirroring the synced/project-owned split of
 * `config/variables.core.ts` / `config/variables.ts`:
 *
 *   - `.env.core.schema`  GENERATED here from `VAR_MANIFEST` + `RUNTIME_KNOBS`,
 *                         SYNCED by the updater (component `env-schema`). Never
 *                         hand-edited: `bun run vars:schema` rewrites it and
 *                         `bun run vars:schema:check` fails when it is stale.
 *   - `.env.schema`       PROJECT-OWNED (delivered once, then watched). Holds
 *                         the root decorators and imports the core half with
 *                         `@import(./.env.core.schema)`; a project appends its
 *                         own variables below the import.
 *
 * Neither file holds a value. They declare NAMES, types, sensitivity and which
 * items `varlock load` refuses to run without. Values stay in `.env` (today),
 * `.env.local` (P2) or a provider (P3).
 *
 * WHY THE CORE FILE IS NAMED `.env.core.schema` AND NOT `.env.schema.core`.
 * varlock parses any file starting with `.env` as `.env[.<env>][.<type>]`, at
 * most two segments after `env`, and refuses an import that is not `.env.*`
 * (`probe.md` P0.2: "Unsure how to interpret filename"). So the type suffix
 * must come LAST and the qualifier in the middle. varlock reads `core` as an
 * environment qualifier, but an IMPORTED file "is never treated as
 * env-specific even if its filename contains an env qualifier" (JSDoc of
 * `isEnvSpecific` in varlock's env-graph, NOT the public docs). That is the
 * one undocumented rule this layout leans on, and it is why `varlock` is
 * pinned EXACTLY in `package.json` and why `checkSchemaPairLoads` below loads
 * the committed pair through varlock on every `vars:schema:check`: a bump
 * that changes the rule fails the gate instead of silently dropping every
 * core variable from validation.
 *
 * `cli/` is import-closed (AGENTS.md §4.5): this module imports only from
 * `./variables-manifest.ts` and node built-ins. `scripts/env-schema.ts` is
 * the argv wrapper that imports FROM here.
 */

import type { VarSpec } from './variables-manifest.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { validateVarManifest, valueSourceOf, VAR_MANIFEST } from './variables-manifest.ts';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/** Generated, synced half. Root-relative. */
export const CORE_SCHEMA_FILE = '.env.core.schema';
/** Project-owned half, the file varlock auto-loads. Root-relative. */
export const PROJECT_SCHEMA_FILE = '.env.schema';
/** Written by varlock on every load (`@generateTsTypes`); gitignored. */
export const ENV_TYPES_FILE = 'env.d.ts';
/** The one manifest source the generator reads. Named for messages only. */
export const SCHEMA_SOURCE = 'cli/lib/variables-manifest.ts';

const GENERATED_BANNER_LINE = `# ${CORE_SCHEMA_FILE} - GENERATED from ${SCHEMA_SOURCE}. DO NOT EDIT.`;

// ----------------------------------------------------------------------------
// Runtime knobs: documented, optional, NOT routed by the installer
// ----------------------------------------------------------------------------

/**
 * Optional settings `.env.example` documents as COMMENTED lines and that the
 * runtime reads with a default (`config/variables.core.ts`,
 * `scripts/sync-jira-issues.ts`). They are not in `VAR_MANIFEST` because the
 * installer never collects or pushes them, but the schema MUST declare them:
 * varlock treats an undeclared key found in `.env` as implicitly sensitive,
 * and an undeclared key with an EMPTY value as a validation failure
 * (`probe.md` P0.2). A `.env` with `HEADLESS=true` uncommented has to load.
 *
 * `docs` here is free text (a sentence), unlike `VarSchemaHints.docs` (a URL).
 */
export interface RuntimeKnob {
  name: string
  docs: string
  type?: string
  example?: string
  default?: string
  sensitive?: boolean
}

export const RUNTIME_KNOBS: readonly RuntimeKnob[] = [
  // --- Browser / runtime (config/variables.core.ts) ---
  { name: 'HEADLESS', type: 'boolean', default: 'true', docs: 'Run browsers headless. Read by playwright.config through config.browser.headless.' },
  { name: 'DEFAULT_TIMEOUT', type: 'number', default: '30000', docs: 'Default action/request timeout in milliseconds (playwright.config, ApiBase).' },
  { name: 'SCREENSHOT_ON_FAILURE', type: 'boolean', default: 'true', docs: 'Capture a screenshot when a test fails (playwright.config).' },
  { name: 'VIDEO_ON_FAILURE', type: 'boolean', default: 'true', docs: 'Record video when a test fails; CI only (playwright.config).' },
  { name: 'ALLURE_RESULTS_DIR', default: './allure-results', docs: 'Where Allure raw results are written (playwright.config).' },
  // --- TMS / Jira operational params, NOT credentials ---
  { name: 'TMS_PROVIDER', type: 'enum(xray, jira, none)', default: 'xray', docs: 'Which TMS the results write-back targets (tests/utils/jiraSync.ts). Modality jira-native = jira.' },
  { name: 'JIRA_PROJECT_KEY', docs: 'Default project key for bun run jira:sync-issues; falls back to .agents/project.yaml.' },
  { name: 'JIRA_SYNC_OUTPUT', docs: 'Output directory for synced issues (default .context/PBI).' },
  { name: 'JIRA_SYNC_SPRINTS', docs: 'Default sprint selector for pull --sprint (active | current | closed | >=N | 7,8,10).' },
  { name: 'JIRA_SYNC_TYPES', docs: 'Default csv of optional coverable work-type slugs added to pull (improvement,tech-story,tech-debt).' },
  { name: 'JIRA_TEST_STATUS_FIELD', docs: 'Jira-Direct TMS provider override for the run-status custom field; empty = resolve from .agents/jira-fields.json.' },
  // --- Set by the CI runner, never by a human ---
  { name: 'CI', type: 'boolean', docs: 'Set by GitHub Actions. Read as env.isCI (global.setup, KataReporter).' },
  { name: 'BUILD_ID', docs: 'Set by GitHub Actions. Read as env.buildId (jiraSync).' },
];

// ----------------------------------------------------------------------------
// Generation
// ----------------------------------------------------------------------------

/**
 * Free text that is safe inside an env-spec comment block: no `@`, because a
 * `@word` in a comment IS a decorator to varlock, and no line break, because
 * every line of the block is emitted with its own `# ` prefix.
 */
function safeText(text: string): string {
  return text.replace(/@/g, '(at)').replace(/\s+/g, ' ').trim();
}

/** Quote a decorator argument. Double quotes, backslash-escaped. */
function quoteArg(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The `@required` decorator the schema gets for `spec`, or `null` for an
 * optional item. `schema.required` wins over `required` (see
 * `VarSchemaHints`). A conditional clause maps to `@required=forEnv(<value>)`
 * ONLY when its key is `TEST_ENV`, which is what `@currentEnv=$TEST_ENV`
 * in `.env.schema` switches on; any other key has no env-spec equivalent and
 * the item is emitted optional with the clause kept in its description.
 */
export function schemaRequiredDecorator(spec: VarSpec): string | null {
  const required = spec.schema?.required ?? spec.required;
  if (required === true) { return '@required'; }
  if (required === false) { return null; }
  const clause = required.ifEnv;
  const eq = clause.indexOf('=');
  const key = clause.slice(0, eq).trim();
  const value = clause.slice(eq + 1).trim();
  if (key === 'TEST_ENV' && value.length > 0) { return `@required=forEnv(${value})`; }
  return null;
}

function decoratorLine(parts: Array<string | null>): string | null {
  const present = parts.filter((p): p is string => p !== null && p.length > 0);
  return present.length === 0 ? null : `# ${present.join(' ')}`;
}

function renderManifestItem(spec: VarSpec): string[] {
  const lines: string[] = [];
  lines.push(`# ${safeText(spec.note)}`);
  if (spec.obtainHint !== undefined && spec.obtainHint.trim() !== '') {
    lines.push(`# Obtain: ${safeText(spec.obtainHint)}`);
  }
  const required = spec.schema?.required;
  if (required !== undefined && typeof required !== 'boolean' && schemaRequiredDecorator(spec) === null) {
    lines.push(`# Required when ${safeText(required.ifEnv)} (not expressible in env-spec; validated by the runtime).`);
  }
  const hints = spec.schema ?? {};
  const decorators = decoratorLine([
    schemaRequiredDecorator(spec),
    spec.secret ? '@sensitive' : null,
    hints.type !== undefined ? `@type=${hints.type}` : null,
    hints.example !== undefined ? `@example=${quoteArg(hints.example)}` : null,
    hints.docs !== undefined ? `@docs(${hints.docs})` : null,
  ]);
  if (decorators !== null) { lines.push(decorators); }
  lines.push(`${spec.name}=${hints.default ?? ''}`);
  return lines;
}

function renderKnob(knob: RuntimeKnob): string[] {
  const lines: string[] = [`# ${safeText(knob.docs)}`];
  const decorators = decoratorLine([
    knob.sensitive === true ? '@sensitive' : null,
    knob.type !== undefined ? `@type=${knob.type}` : null,
    knob.example !== undefined ? `@example=${quoteArg(knob.example)}` : null,
  ]);
  if (decorators !== null) { lines.push(decorators); }
  lines.push(`${knob.name}=${knob.default ?? ''}`);
  return lines;
}

/** Manifest vars whose value lives in an env file: the set the schema declares. */
function envFileSpecs(manifest: readonly VarSpec[]): VarSpec[] {
  return manifest.filter(s => valueSourceOf(s) === 'env-file');
}

/**
 * The full text of `.env.core.schema`. Deterministic: same manifest, same
 * bytes, LF line endings, trailing newline. Only manifest vars whose value
 * lives in an env file are emitted: `ATLASSIAN_URL` is anchored to
 * `.agents/project.yaml` and must never grow a second copy (AGENTS.md §7).
 */
export function generateCoreSchema(
  manifest: readonly VarSpec[] = VAR_MANIFEST,
  knobs: readonly RuntimeKnob[] = RUNTIME_KNOBS,
): string {
  validateVarManifest(manifest);
  const manifestNames = new Set(manifest.map(s => s.name));
  for (const knob of knobs) {
    if (manifestNames.has(knob.name)) {
      throw new Error(`Runtime knob '${knob.name}' is also a manifest variable; declare it once.`);
    }
  }

  const header = [
    '# ============================================================================',
    GENERATED_BANNER_LINE,
    '# ============================================================================',
    '# SYNCED by the boilerplate updater (component env-schema). Regenerate with',
    '#   bun run vars:schema        and gate it with    bun run vars:schema:check',
    `# Imported by the project-owned ${PROJECT_SCHEMA_FILE}, which holds the root`,
    '# decorators (current env, type generation) and the project\'s own variables.',
    '#',
    '# This file declares NAMES, types, sensitivity and which items varlock refuses',
    '# to run without. It never holds a value: fill .env (or .env.local), or let a',
    '# provider resolve the sensitive ones. Validate: bunx varlock load --agent',
    '#',
    '# The two root decorators below are the defaults for THIS file\'s items; each',
    '# item states its own requiredness and sensitivity explicitly.',
    '# @defaultRequired=false',
    '# @defaultSensitive=false',
    '# ---',
    '',
  ];

  const body: string[] = [];
  body.push('# ----------------------------------------------------------------------------');
  body.push(`# Variables routed by the installer (${SCHEMA_SOURCE}). Order = manifest order.`);
  body.push('# ----------------------------------------------------------------------------');
  body.push('');
  for (const spec of envFileSpecs(manifest)) {
    body.push(...renderManifestItem(spec));
    body.push('');
  }
  body.push('# ----------------------------------------------------------------------------');
  body.push('# Optional runtime knobs. Never collected by the installer; the runtime reads');
  body.push('# each one with a default. Declared so an uncommented line in .env validates.');
  body.push('# ----------------------------------------------------------------------------');
  body.push('');
  for (const knob of knobs) {
    body.push(...renderKnob(knob));
    body.push('');
  }

  return `${[...header, ...body].join('\n').replace(/\n+$/, '')}\n`;
}

/**
 * The seed for a project's `.env.schema`. Written ONLY when the file is
 * absent (`seedProjectSchema`): after that the project owns it.
 *
 * `processEnv=none`: even `loose` augments `process.env` with the DECLARED
 * keys typed strictly (measured: `process.env.TEST_ENV` became
 * `'local' | 'staging'` and `scripts/lib/api-login-core.ts` stopped
 * compiling, and any `env: Record<string, string>` handed to `spawnSync`
 * lost assignability to `ProcessEnv`). P1 changes no runtime, so the typed
 * surface is `import { ENV } from 'varlock/env'` only, for P2 to adopt.
 * `importMetaEnv=none` because nothing here reads `import.meta.env`.
 */
export function projectSchemaTemplate(): string {
  return [
    '# ============================================================================',
    `# ${PROJECT_SCHEMA_FILE} - project-owned env schema (varlock, env-spec)`,
    '# ============================================================================',
    '# Delivered once by the boilerplate, then yours: bun run up never overwrites',
    `# it. The framework half lives in ${CORE_SCHEMA_FILE} (generated + synced) and`,
    '# is pulled in by the import below. Add the variables YOUR project-under-test',
    '# needs under "Project variables"; keep values out of this file.',
    '#',
    '# Validate:   bunx varlock load --agent      (redacted, agent-safe)',
    '# Explain:    bunx varlock explain <VAR>',
    '# Reference:  https://varlock.dev/reference/item-decorators',
    '#',
    `# @import(./${CORE_SCHEMA_FILE})`,
    `# @generateTsTypes(path=./${ENV_TYPES_FILE}, processEnv=none, importMetaEnv=none)`,
    '# @currentEnv=$TEST_ENV',
    '# @defaultRequired=false',
    '# @defaultSensitive=false',
    '# ---',
    '',
    '# ----------------------------------------------------------------------------',
    '# Project variables (add below; one decorator line per item, e.g.)',
    '#   # Admin user for the back-office flows',
    '#   # @required=forEnv(staging) @type=email',
    '#   STAGING_ADMIN_EMAIL=',
    '# ----------------------------------------------------------------------------',
    '',
  ].join('\n');
}

// ----------------------------------------------------------------------------
// File operations
// ----------------------------------------------------------------------------

function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export interface CoreSchemaCheck {
  ok: boolean
  /** `missing` when the file is absent, `stale` when its bytes differ, `fresh` otherwise. */
  state: 'missing' | 'stale' | 'fresh'
  expected: string
}

/** Compare the committed `.env.core.schema` with what the manifest generates now. */
export function checkCoreSchema(root: string): CoreSchemaCheck {
  const expected = generateCoreSchema();
  const target = path.join(root, CORE_SCHEMA_FILE);
  if (!fs.existsSync(target)) { return { ok: false, state: 'missing', expected }; }
  const actual = normalizeEol(fs.readFileSync(target, 'utf8'));
  const ok = actual === expected;
  return { ok, state: ok ? 'fresh' : 'stale', expected };
}

/** Write `.env.core.schema`. Returns true when the bytes changed. */
export function writeCoreSchema(root: string): boolean {
  const check = checkCoreSchema(root);
  if (check.ok) { return false; }
  fs.writeFileSync(path.join(root, CORE_SCHEMA_FILE), check.expected, 'utf8');
  return true;
}

/** Create `.env.schema` from the template when absent. Never overwrites. */
export function seedProjectSchema(root: string): boolean {
  const target = path.join(root, PROJECT_SCHEMA_FILE);
  if (fs.existsSync(target)) { return false; }
  fs.writeFileSync(target, projectSchemaTemplate(), 'utf8');
  return true;
}

// ----------------------------------------------------------------------------
// Loading the committed pair through varlock
// ----------------------------------------------------------------------------

/** A value that satisfies an env-spec type without being anything real. */
export function placeholderFor(type: string | undefined, sensitive: boolean): string {
  const t = (type ?? 'string').trim();
  const enumMatch = /^enum\((.*)\)$/.exec(t);
  if (enumMatch) { return enumMatch[1].split(',')[0].trim(); }
  if (t.startsWith('email')) { return 'placeholder@example.test'; }
  if (t.startsWith('url')) { return 'https://placeholder.example.test'; }
  if (t.startsWith('port')) { return '5432'; }
  if (t.startsWith('boolean')) { return 'true'; }
  if (t.startsWith('number')) { return '1'; }
  // Long enough that varlock's "value is very short, is it really sensitive?"
  // warning never fires on a sensitive placeholder.
  return sensitive ? 'placeholder-not-a-secret-0000000000' : 'placeholder-value';
}

/**
 * The `.env.local` a scratch load needs: one placeholder per item that is
 * required under `currentEnv`. Everything else stays unset, which is exactly
 * what the schema must accept.
 */
export function placeholderEnv(
  currentEnv: string = 'local',
  manifest: readonly VarSpec[] = VAR_MANIFEST,
): Record<string, string> {
  const out: Record<string, string> = { TEST_ENV: currentEnv };
  for (const spec of envFileSpecs(manifest)) {
    if (spec.name === 'TEST_ENV') { continue; }
    const decorator = schemaRequiredDecorator(spec);
    if (decorator === null) { continue; }
    if (decorator === '@required' || decorator === `@required=forEnv(${currentEnv})`) {
      out[spec.name] = placeholderFor(spec.schema?.type, spec.secret);
    }
  }
  return out;
}

export interface PairLoadResult {
  ok: boolean
  exitCode: number | null
  /** `label` of every source varlock reports, in load order. Never values. */
  sources: Array<{ type: string, label: string }>
  /** Item NAMES the load resolved (values are discarded before this returns). */
  resolvedKeys: string[]
  /** Redacted diagnostic lines from varlock, last few only. */
  stderrTail: string[]
  /** Why `ok` is false, when it is. */
  reason?: string
}

/**
 * Copy the committed pair into a scratch directory, give it a placeholder
 * `.env.local`, and load it with the pinned varlock. This is the gate the
 * layout relies on (see the header): it proves the `@import` resolves, that
 * the core file is read as a SCHEMA source, and that the core items validate.
 *
 * The child runs with every schema key scrubbed from its environment, so a
 * developer's `export TEST_ENV=staging` cannot turn the gate red. Values
 * never leave this function: `json-full` prints raw values, and the parsed
 * blob is reduced to names before it is returned.
 */
export function loadSchemaPairThroughVarlock(root: string, currentEnv: string = 'local'): PairLoadResult {
  const core = path.join(root, CORE_SCHEMA_FILE);
  const project = path.join(root, PROJECT_SCHEMA_FILE);
  for (const file of [core, project]) {
    if (!fs.existsSync(file)) {
      return { ok: false, exitCode: null, sources: [], resolvedKeys: [], stderrTail: [], reason: `${path.basename(file)} is missing` };
    }
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'env-schema-pair-'));
  try {
    fs.copyFileSync(core, path.join(scratch, CORE_SCHEMA_FILE));
    fs.copyFileSync(project, path.join(scratch, PROJECT_SCHEMA_FILE));
    const values = placeholderEnv(currentEnv);
    fs.writeFileSync(
      path.join(scratch, '.env.local'),
      `${Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n')}\n`,
      'utf8',
    );

    // Spread, never a cast: `cli/**` must compile under a host whose
    // `ProcessEnv` requires `NODE_ENV` (cli/updater-host-types.test.ts).
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const spec of VAR_MANIFEST) { delete env[spec.name]; }
    for (const knob of RUNTIME_KNOBS) { delete env[knob.name]; }

    // `bunx` resolves the project's pinned devDependency from the CWD's
    // node_modules; the scratch dir has none, so point it at the repo root by
    // running there and passing the scratch dir as the load path.
    const run = spawnSync('bunx', ['varlock', 'load', '--format', 'json-full', '--compact', '--path', `${scratch}${path.sep}`], {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderrTail = (run.stderr ?? '').split(/\r?\n/).filter(l => l.trim() !== '').slice(-12);
    if (run.error) {
      return { ok: false, exitCode: null, sources: [], resolvedKeys: [], stderrTail, reason: `could not run bunx varlock: ${run.error.message}` };
    }
    if (run.status !== 0) {
      return { ok: false, exitCode: run.status, sources: [], resolvedKeys: [], stderrTail, reason: `varlock load exited ${run.status}` };
    }

    let parsed: { sources?: Array<{ type?: string, label?: string }>, config?: Record<string, unknown> };
    try {
      parsed = JSON.parse(run.stdout) as typeof parsed;
    }
    catch {
      return { ok: false, exitCode: run.status, sources: [], resolvedKeys: [], stderrTail, reason: 'varlock load printed no JSON' };
    }
    // Labels come back as paths relative to the CWD (`../../var/.../.env.schema`);
    // the basename is the only part a reader needs, and the only part that is
    // stable across machines.
    const sources = (parsed.sources ?? [])
      .filter(s => s.type !== 'container')
      .map(s => ({ type: String(s.type ?? ''), label: path.basename(String(s.label ?? '')) }));
    const resolvedKeys = Object.keys(parsed.config ?? {}).sort();

    const coreAsSchema = sources.some(s => s.type === 'schema' && s.label.endsWith(CORE_SCHEMA_FILE));
    if (!coreAsSchema) {
      return { ok: false, exitCode: run.status, sources, resolvedKeys, stderrTail, reason: `${CORE_SCHEMA_FILE} was not loaded as a schema source (import rule changed?)` };
    }
    const coreKeys = envFileSpecs(VAR_MANIFEST).map(s => s.name);
    const missing = coreKeys.filter(k => !resolvedKeys.includes(k));
    if (missing.length > 0) {
      return { ok: false, exitCode: run.status, sources, resolvedKeys, stderrTail, reason: `core items not in the resolved graph: ${missing.join(', ')}` };
    }
    return { ok: true, exitCode: run.status, sources, resolvedKeys, stderrTail };
  }
  finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
