#!/usr/bin/env bun
/**
 * agents-lint.ts — validates the agentic variable system in this repo.
 *
 * Four variable syntaxes coexist:
 *   1. {{VAR_NAME}}   (UPPER_SNAKE_CASE) — project variable; MUST be declared in
 *                      `.agents/project.yaml`. Resolution rules:
 *                      - Flat key (e.g. PROJECT_NAME -> `project.project_name`):
 *                        the bare reference resolves to the flat YAML leaf.
 *                      - Env-scoped key (e.g. WEB_URL -> `environments[active_env].web_url`):
 *                        the bare reference resolves against the active environment
 *                        at AI runtime (session override > `testing.default_env`).
 *                        From the linter's perspective, "declared as env-scoped"
 *                        means the snake_case name appears under at least one
 *                        environment in `environments:`.
 *   2. {{environments.<env>.<var>}} — explicit env-scoped reference. Resolves
 *                      directly to `environments.<env>.<var>` regardless of
 *                      active env. The linter validates that <env> is a real
 *                      environment in the YAML AND that <var> exists under it.
 *   3. <<VAR_NAME>>   — session variable; computed at runtime, never declared.
 *                      We only count and info-log these.
 *   4. {{jira.<slug>}} (lowercase dot-notation) — Jira custom field reference.
 *                      MUST resolve to a slug declared in `.agents/jira-required.yaml`
 *                      under either `required:` or `optional:`. The manifest is the
 *                      canonical declaration of slugs the methodology consumes.
 *                      Validating that those declared slugs actually exist in
 *                      the user's Jira (`.agents/jira.json`) is owned by
 *                      `bun run jira:check`.
 *
 * Exit code: 0 if no ERRORs, 1 otherwise. WARNs do not affect exit code.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dir, '..');
const PROJECT_YAML = join(REPO_ROOT, '.agents', 'project.yaml');
const JIRA_REQUIRED_YAML = join(REPO_ROOT, '.agents', 'jira-required.yaml');

// Directories to scan recursively.
const SCAN_ROOTS = [
  '.claude',
  'templates',
  '.context',
];

// Single root-level file to also scan.
const SCAN_FILES = [
  'AGENTS.md',
];

// Directories to skip outright while walking.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.scratch',
  'tests',
  'api',
  'cli',
  'scripts',
  'config',
  'dist',
  'coverage',
  '.agents', // never lint our own source-of-truth
]);

// Allowlist: identifiers that look like variables but are documentation strings
// describing the syntax itself. Each entry is [variableName, fileSubstring] —
// the linter ignores matches where both conditions hold.
const DOC_META_ALLOWLIST: Array<[string, string]> = [
  // §Critical Rules rule 9: "Use [TAG_TOOL] pseudocode and {{VARIABLES}} for dynamic content"
  ['VARIABLES', 'AGENTS.md'],
  // §Project Variables bootstrap instruction explaining the {{VAR_NAME}} syntax
  ['VAR_NAME', 'AGENTS.md'],
];

// -----------------------------------------------------------------------------
// Step 1 — load declared project variables from .agents/project.yaml
// -----------------------------------------------------------------------------

interface DeclaredVars {
  /** Flat keys (top-level sections, NOT under `environments:`), upper-cased. */
  flat: Set<string>
  /** Env-scoped key names (union across all envs), upper-cased. */
  envScoped: Set<string>
  /** Environment names declared under `environments:` (lower-case as in YAML). */
  envNames: Set<string>
  /** Per-env catalog: { local: Set<"web_url","api_url",...>, staging: ... } (snake_case). */
  envCatalog: Map<string, Set<string>>
}

function loadDeclaredVariables(yamlPath: string): DeclaredVars {
  if (!existsSync(yamlPath)) {
    console.error(`FATAL: ${yamlPath} does not exist. Run Session 1 first.`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(yamlPath, 'utf8'));
  }
  catch (err) {
    console.error(`FATAL: cannot parse ${yamlPath}: ${(err as Error).message}`);
    process.exit(1);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`FATAL: ${yamlPath} must be a YAML mapping at the top level.`);
    process.exit(1);
  }
  const root = parsed as Record<string, unknown>;

  const flat = new Set<string>();
  const envScoped = new Set<string>();
  const envNames = new Set<string>();
  const envCatalog = new Map<string, Set<string>>();

  for (const [sectionName, sectionVal] of Object.entries(root)) {
    if (sectionName === 'environments') {
      // Nested: each child is an environment whose leaves are env-scoped vars.
      if (!sectionVal || typeof sectionVal !== 'object' || Array.isArray(sectionVal)) {
        console.error(`FATAL: ${yamlPath}: \`environments:\` must be a mapping.`);
        process.exit(1);
      }
      for (const [envName, envVal] of Object.entries(sectionVal as Record<string, unknown>)) {
        envNames.add(envName);
        const perEnv = new Set<string>();
        if (envVal && typeof envVal === 'object' && !Array.isArray(envVal)) {
          for (const leafKey of Object.keys(envVal as Record<string, unknown>)) {
            envScoped.add(leafKey.toUpperCase());
            perEnv.add(leafKey);
          }
        }
        envCatalog.set(envName, perEnv);
      }
      continue;
    }
    // Flat section: each child is a flat leaf.
    if (sectionVal && typeof sectionVal === 'object' && !Array.isArray(sectionVal)) {
      for (const leafKey of Object.keys(sectionVal as Record<string, unknown>)) {
        flat.add(leafKey.toUpperCase());
      }
    }
  }

  return { flat, envScoped, envNames, envCatalog };
}

/**
 * Load the set of declared Jira slugs from `.agents/jira-required.yaml`.
 * Both `required:` and `optional:` slugs are accepted — `unmapped:` is NOT
 * (those have no matching `{{jira.<slug>}}` syntax; skills reference them as
 * literal `customfield_*` markers).
 */
function loadManifestSlugs(yamlPath: string): { all: Set<string>, required: number, optional: number } {
  if (!existsSync(yamlPath)) {
    console.error(`FATAL: ${yamlPath} does not exist. Required for Jira slug validation.`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(yamlPath, 'utf8'));
  }
  catch (err) {
    console.error(`FATAL: cannot parse ${yamlPath}: ${(err as Error).message}`);
    process.exit(1);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`FATAL: ${yamlPath} must be a YAML mapping at the top level.`);
    process.exit(1);
  }
  const root = parsed as Record<string, unknown>;
  const required = (root.required ?? {}) as Record<string, unknown>;
  const optional = (root.optional ?? {}) as Record<string, unknown>;
  const all = new Set<string>([...Object.keys(required), ...Object.keys(optional)]);
  return { all, required: Object.keys(required).length, optional: Object.keys(optional).length };
}

// -----------------------------------------------------------------------------
// Step 2 — recursive directory walk that respects skip-dirs and symlinks
// -----------------------------------------------------------------------------

function walkMarkdown(root: string, files: string[]): void {
  if (!existsSync(root)) { return; }

  let entries: string[];
  try {
    entries = readdirSync(root);
  }
  catch {
    return;
  }

  for (const name of entries) {
    const full = join(root, name);

    // lstat — do not follow symlinks. CLAUDE.md is a symlink to AGENTS.md, and
    // we already include AGENTS.md explicitly via SCAN_FILES; skipping symlinks
    // avoids double-counting.
    let stat;
    try {
      stat = lstatSync(full);
    }
    catch {
      continue;
    }
    if (stat.isSymbolicLink()) { continue; }

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(name)) { continue; }
      walkMarkdown(full, files);
    }
    else if (stat.isFile() && name.endsWith('.md')) {
      files.push(full);
    }
  }
}

function collectFiles(): string[] {
  const out: string[] = [];
  for (const r of SCAN_ROOTS) {
    walkMarkdown(join(REPO_ROOT, r), out);
  }
  for (const f of SCAN_FILES) {
    const full = join(REPO_ROOT, f);
    if (existsSync(full)) {
      const stat = lstatSync(full);
      if (!stat.isSymbolicLink()) { out.push(full); }
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Step 3 — scan each file for variable occurrences
// -----------------------------------------------------------------------------

interface ProjectVarHit {
  name: string // upper-case
  file: string
  line: number
}

interface ExplicitEnvHit {
  env: string // lowercase env name
  varName: string // lowercase snake_case
  file: string
  line: number
}

interface JiraSlugHit {
  slug: string
  file: string
  line: number
}

interface ScanResult {
  projectVarHits: ProjectVarHit[]
  explicitEnvHits: ExplicitEnvHit[]
  sessionVarNames: Set<string>
  sessionVarOccurrences: number
  jiraSlugHits: JiraSlugHit[]
  metaSkippedCount: number
}

// IMPORTANT: matchers must be ordered so explicit env refs do NOT also match
// the bare-form regex. We scan EXPLICIT_ENV_RE first per line, mark covered
// columns, then scan PROJECT_RE while skipping covered ranges.
const PROJECT_RE = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
const EXPLICIT_ENV_RE = /\{\{environments\.([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\}\}/g;
const JIRA_RE = /\{\{jira\.([a-z_][a-z0-9_]*)\}\}/g;
const SESSION_RE = /<<([A-Z_][A-Z0-9_]*)>>/g;

function isAllowlisted(varName: string, filePath: string): boolean {
  return DOC_META_ALLOWLIST.some(
    ([allowedName, fileSub]) => allowedName === varName && filePath.includes(fileSub),
  );
}

function scanFiles(files: string[]): ScanResult {
  const projectVarHits: ProjectVarHit[] = [];
  const explicitEnvHits: ExplicitEnvHit[] = [];
  const sessionVarNames = new Set<string>();
  let sessionVarOccurrences = 0;
  const jiraSlugHits: JiraSlugHit[] = [];
  let metaSkippedCount = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // --- explicit env refs first; remember their spans so PROJECT_RE skips them.
      // (PROJECT_RE matches UPPER_SNAKE only — explicit env refs are lowercase, so
      //  they cannot collide. Same for JIRA_RE. We still tracked spans defensively.)
      EXPLICIT_ENV_RE.lastIndex = 0;
      for (;;) {
        const m = EXPLICIT_ENV_RE.exec(line);
        if (m === null) { break; }
        explicitEnvHits.push({ env: m[1], varName: m[2], file, line: i + 1 });
      }

      // --- bare project vars {{UPPER}}
      PROJECT_RE.lastIndex = 0;
      for (;;) {
        const m = PROJECT_RE.exec(line);
        if (m === null) { break; }
        const name = m[1];
        if (isAllowlisted(name, file)) {
          metaSkippedCount++;
          continue;
        }
        projectVarHits.push({ name, file, line: i + 1 });
      }

      // --- jira refs
      JIRA_RE.lastIndex = 0;
      for (;;) {
        const m = JIRA_RE.exec(line);
        if (m === null) { break; }
        jiraSlugHits.push({ slug: m[1], file, line: i + 1 });
      }

      // --- session vars
      SESSION_RE.lastIndex = 0;
      for (;;) {
        const m = SESSION_RE.exec(line);
        if (m === null) { break; }
        sessionVarNames.add(m[1]);
        sessionVarOccurrences++;
      }
    }
  }

  return {
    projectVarHits,
    explicitEnvHits,
    sessionVarNames,
    sessionVarOccurrences,
    jiraSlugHits,
    metaSkippedCount,
  };
}

// -----------------------------------------------------------------------------
// Step 4 — produce report
// -----------------------------------------------------------------------------

function main(): void {
  const declared = loadDeclaredVariables(PROJECT_YAML);
  const manifest = loadManifestSlugs(JIRA_REQUIRED_YAML);
  const files = collectFiles();
  const result = scanFiles(files);

  // Bare {{VAR}} validation: must be declared either as flat or env-scoped.
  const undeclared: ProjectVarHit[] = [];
  const usedNames = new Set<string>();
  for (const hit of result.projectVarHits) {
    usedNames.add(hit.name);
    if (declared.flat.has(hit.name)) { continue; }
    if (declared.envScoped.has(hit.name)) { continue; }
    undeclared.push(hit);
  }

  // Explicit env reference validation: env must exist; var must exist under it.
  const invalidExplicitEnv: ExplicitEnvHit[] = [];
  for (const hit of result.explicitEnvHits) {
    if (!declared.envNames.has(hit.env)) {
      invalidExplicitEnv.push(hit);
      continue;
    }
    const perEnv = declared.envCatalog.get(hit.env);
    if (!perEnv || !perEnv.has(hit.varName)) {
      invalidExplicitEnv.push(hit);
    }
  }

  // Declared-but-unused: a flat or env-scoped name that no skill references.
  // Note: explicit env refs (e.g. {{environments.local.web_url}}) DO count as
  //       a use of the env-scoped key (web_url -> WEB_URL).
  const explicitlyUsedEnvScoped = new Set<string>(
    result.explicitEnvHits.map(h => h.varName.toUpperCase()),
  );
  const allDeclared = new Set<string>([...declared.flat, ...declared.envScoped]);
  const declaredButUnused = [...allDeclared]
    .filter(d => !usedNames.has(d) && !explicitlyUsedEnvScoped.has(d))
    .sort();

  // Jira slug validation: every {{jira.<slug>}} must be declared in the manifest.
  const invalidJiraHits = result.jiraSlugHits.filter(h => !manifest.all.has(h.slug));
  const validJiraCount = result.jiraSlugHits.length - invalidJiraHits.length;

  const filesWithProjectHits = new Set(result.projectVarHits.map(h => h.file)).size;

  const totalErrors = undeclared.length + invalidExplicitEnv.length + invalidJiraHits.length;

  // ----- output -----
  const envList = [...declared.envNames].sort().join(', ') || '(none)';
  const declaredTotal = declared.flat.size + declared.envScoped.size;

  console.log('Agents Lint Report');
  console.log('==================');
  console.log(`Scanned: ${files.length} files`);
  console.log(
    `Declared in project.yaml:        ${declared.flat.size} flat + ${declared.envScoped.size} env-scoped `
    + `(across ${declared.envNames.size} envs: ${envList}) = ${declaredTotal} variables`,
  );
  console.log(`Declared in jira-required.yaml:  ${manifest.all.size} slugs (${manifest.required} required + ${manifest.optional} optional)`);
  console.log('');

  console.log(`ERRORS (${totalErrors}):`);
  if (totalErrors === 0) {
    console.log('  <none>');
  }
  else {
    for (const hit of undeclared) {
      const rel = relative(REPO_ROOT, hit.file);
      console.log(`  - UNDECLARED: {{${hit.name}}} at ${rel}:${hit.line}`);
    }
    for (const hit of invalidExplicitEnv) {
      const rel = relative(REPO_ROOT, hit.file);
      const reason = !declared.envNames.has(hit.env)
        ? `unknown env '${hit.env}' (known: ${envList})`
        : `var '${hit.varName}' not present under environments.${hit.env}`;
      console.log(`  - UNDECLARED env reference: {{environments.${hit.env}.${hit.varName}}} at ${rel}:${hit.line}  (${reason})`);
    }
    for (const hit of invalidJiraHits) {
      const rel = relative(REPO_ROOT, hit.file);
      console.log(`  - UNDECLARED: {{jira.${hit.slug}}} at ${rel}:${hit.line}`);
    }
  }
  console.log('');

  console.log(`WARNINGS (${declaredButUnused.length}):`);
  if (declaredButUnused.length === 0) {
    console.log('  <none>');
  }
  else {
    for (const name of declaredButUnused) {
      console.log(`  - DECLARED_BUT_UNUSED: ${name}  (no occurrences in scanned files)`);
    }
  }
  console.log('');

  console.log('INFO:');
  console.log(`  - ${result.projectVarHits.length} bare {{VAR}} occurrences across ${filesWithProjectHits} files`);
  console.log(`  - ${result.explicitEnvHits.length} explicit {{environments.<env>.<var>}} occurrences (${invalidExplicitEnv.length} invalid)`);
  console.log(`  - ${result.sessionVarNames.size} distinct <<VAR>> session variables (${result.sessionVarOccurrences} occurrences)`);
  console.log(`  - ${validJiraCount} valid {{jira.*}} references; ${invalidJiraHits.length} invalid (errors above)`);
  console.log(`  - ${result.metaSkippedCount} documentation meta-references skipped (allowlisted)`);

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
