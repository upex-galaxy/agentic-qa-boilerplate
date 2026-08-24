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
 *   - `.agents/jira-fields.json` — auto-generated catalog of the user's actual Jira
 *     custom fields. Produced by `bun run jira:sync-fields`.
 *
 * For each `required` slug, the script verifies:
 *   1. The slug exists in `jira-fields.json`.            Missing => ❌ ERROR.
 *   2. The `type` matches.                        Mismatch => ⚠️ WARNING.
 *   3. (option fields) every declared option key exists in jira-fields.json.
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
 *   --live      Additionally compare the CACHED `.agents/jira-workflows.json`
 *               against live Jira (one read-only, non-admin REST call). Catches
 *               the staleness class every offline check is blind to: the cache
 *               was correct when it was written and Jira moved underneath it.
 *               Warnings only — never changes the exit code.
 *   --project <KEY>
 *               Project key for --live (flag > JIRA_PROJECT_KEY > project.yaml).
 *   --help      Show usage.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { resolveAtlassianInstance } from '../cli/lib/atlassian-instance';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RequiredEntry {
  name?: string
  type: string
  /**
   * For plain `option` / `array`-of-option fields: a flat list of expected
   * option slugs (e.g. `[critica, mayor, menor]`).
   * For `option-with-child` (cascading) fields: either a flat list of expected
   * parent slugs, or an object mapping parent slug → list of expected child
   * slugs (e.g. `{ infraestructura: [redes, servidores] }`).
   */
  options?: string[] | Record<string, string[]>
  description?: string
  used_by?: string[]
}

interface UnmappedEntry {
  description?: string
  used_by?: string[]
}

interface LinkTypeEntry {
  name?: string
  outward?: string
  inward?: string
  fallback?: string | null
  description?: string
  used_by?: string[]
}

interface Manifest {
  required: Record<string, RequiredEntry>
  optional: Record<string, RequiredEntry>
  unmapped: Record<string, UnmappedEntry>
  linkTypesRequired: Record<string, LinkTypeEntry>
  linkTypesOptional: Record<string, LinkTypeEntry>
}

// ---- Work types (workflow validation) ---------------------------------------

interface ManifestRequiredStatus {
  slug: string
  description?: string
}

interface ManifestRequiredTransition {
  slug: string
  from?: string
  to?: string
  description?: string
}

interface ManifestWorkType {
  slug: string
  jiraIssueType: string
  description?: string
  requiredStatuses: ManifestRequiredStatus[]
  requiredTransitions: ManifestRequiredTransition[]
}

interface CatalogStatus {
  id: string | null
  name: string | null
  category: string | null
}

interface CatalogTransition {
  id: string | null
  name: string | null
  from_status_id: string | null
  to_status_id: string | null
  from_canonical: string | null
  to_canonical: string | null
}

interface CatalogWorkType {
  jira_issue_type: { id: string, name: string } | null
  workflow_scheme: { id: string, name: string } | null
  workflow: { id: string | null, name: string } | null
  statuses: Record<string, CatalogStatus>
  transitions: Record<string, CatalogTransition>
}

type WorkflowsCatalog = Record<string, CatalogWorkType>;

type WorkTypeKind = 'work_type' | 'status' | 'transition';

interface WorkTypeCheckResult {
  workType: string
  kind: WorkTypeKind
  /** Entity slug under the work type (status/transition slug, or '<work_type>' for the work_type row itself). */
  entity: string
  severity: Severity
  notes: string[]
}

interface NestedOptionEntry {
  id: string
  children: Record<string, string>
}

interface JiraFieldEntry {
  id: string
  type?: string
  name?: string
  /**
   * Discriminated by `type`:
   *   - `option` / `array`        → `Record<string, string>`           (slug → option id)
   *   - `option-with-child`       → `Record<string, NestedOptionEntry>` (parent slug → { id, children })
   */
  options?: Record<string, string> | Record<string, NestedOptionEntry>
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
const CATALOG_PATH = join(REPO_ROOT, '.agents', 'jira-fields.json');
const WORKFLOWS_PATH = join(REPO_ROOT, '.agents', 'jira-workflows.json');
const LINK_TYPES_PATH = join(REPO_ROOT, '.agents', 'jira-link-types.json');
const PROJECT_YAML_PATH = join(REPO_ROOT, '.agents', 'project.yaml');

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
  const linkTypesRaw = (root.link_types ?? {}) as Record<string, unknown>;
  const linkTypesRequired = (linkTypesRaw.required ?? {}) as Record<string, LinkTypeEntry>;
  const linkTypesOptional = (linkTypesRaw.optional ?? {}) as Record<string, LinkTypeEntry>;
  return { required, optional, unmapped, linkTypesRequired, linkTypesOptional };
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

/**
 * Split a `jira_issue_type` declaration into ordered alternatives. Mirrors
 * `scripts/sync-jira-workflows.ts:issueTypeNameCandidates` so what the sync writes
 * is exactly what this validates.
 */
function issueTypeNameCandidates(declared: string): string[] {
  return declared.split('|').map(name => name.trim()).filter(Boolean);
}

/**
 * Load `.agents/jira-workflows.json` (the discovered workflow catalog). Returns
 * `null` if the file is absent — the work-type validation block will then
 * report MISSING for every required work_type with a hint to run
 * `bun run jira:sync-workflows`. Returns the parsed object otherwise (which
 * may be the empty `{}` placeholder, or a partial shell with `null` fields).
 */
function loadWorkflowsCatalog(): WorkflowsCatalog | null {
  if (!existsSync(WORKFLOWS_PATH)) { return null; }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(WORKFLOWS_PATH, 'utf8'));
  }
  catch (err) {
    console.error(`FATAL: cannot parse ${relative(REPO_ROOT, WORKFLOWS_PATH)}: ${(err as Error).message}`);
    process.exit(1);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`FATAL: ${relative(REPO_ROOT, WORKFLOWS_PATH)} must be a JSON object.`);
    process.exit(1);
  }
  return parsed as WorkflowsCatalog;
}

/**
 * Walk `.agents/jira-required.yaml` and pull out the `work_types:` section.
 * Mirrors `scripts/sync-jira-workflows.ts:loadManifestWorkTypes` so that what
 * the sync writes is exactly what the check validates. Same line-walking
 * grammar (no extra YAML dep) — narrow but stable.
 *
 * Returns `[]` if the section is absent or empty so the caller can short-circuit.
 */
function loadManifestWorkTypes(): ManifestWorkType[] {
  // Manifest already failed-fast in loadManifest(), so we know it parses; just
  // re-read raw lines here so we can preserve declaration order deterministically.
  const text = readFileSync(MANIFEST_PATH, 'utf8');
  const lines = text.split(/\r?\n/);

  const workTypes: ManifestWorkType[] = [];
  let inWorkTypes = false;
  let currentWorkType: ManifestWorkType | null = null;
  let currentMap: 'required_statuses' | 'required_transitions' | null = null;

  const sectionRe = /^work_types:\s*$/;
  const topLevelRe = /^[a-z_][\w-]*:\s*(?:#.*)?$/;
  const workTypeHeaderRe = /^ {2}([a-z_][a-z0-9_]*):\s*$/;
  const subKeyRe = /^ {4}([a-z_][a-z0-9_]*):[ \t]*(\S.*)?$/;
  const entryRe = /^ {6}([a-z_][a-z0-9_]*):[ \t]*(\S.*)?$/;

  function finalizeWorkType(): void {
    if (currentWorkType) {
      workTypes.push(currentWorkType);
    }
    currentWorkType = null;
    currentMap = null;
  }

  for (const line of lines) {
    if (topLevelRe.test(line)) {
      if (inWorkTypes) { finalizeWorkType(); }
      inWorkTypes = sectionRe.test(line);
      continue;
    }
    if (!inWorkTypes) { continue; }
    if (line.trim() === '' || line.trimStart().startsWith('#')) { continue; }

    const wtHeader = workTypeHeaderRe.exec(line);
    if (wtHeader) {
      finalizeWorkType();
      currentWorkType = {
        slug: wtHeader[1],
        jiraIssueType: '',
        requiredStatuses: [],
        requiredTransitions: [],
      };
      currentMap = null;
      continue;
    }

    if (!currentWorkType) { continue; }

    const subKey = subKeyRe.exec(line);
    if (subKey) {
      const key = subKey[1];
      const rawValue = subKey[2];
      currentMap = null;
      if (key === 'jira_issue_type') {
        currentWorkType.jiraIssueType = stripYamlScalar(rawValue);
      }
      else if (key === 'description') {
        currentWorkType.description = stripYamlScalar(rawValue);
      }
      else if (key === 'required_statuses') {
        currentMap = 'required_statuses';
      }
      else if (key === 'required_transitions') {
        currentMap = 'required_transitions';
      }
      continue;
    }

    const entry = entryRe.exec(line);
    if (entry && currentMap) {
      const slug = entry[1];
      const inlineBody = entry[2] ?? '';
      const parsed = parseInlineMapping(inlineBody);
      if (currentMap === 'required_statuses') {
        currentWorkType.requiredStatuses.push({
          slug,
          description: parsed.description,
        });
      }
      else {
        currentWorkType.requiredTransitions.push({
          slug,
          from: parsed.from,
          to: parsed.to,
          description: parsed.description,
        });
      }
    }
  }
  if (inWorkTypes) { finalizeWorkType(); }

  return workTypes;
}

function stripYamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === '~') { return ''; }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineMapping(body: string): { from?: string, to?: string, description?: string } {
  const result: { from?: string, to?: string, description?: string } = {};
  const trimmed = body.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return result;
  }
  const inner = trimmed.slice(1, -1);
  const parts: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let buf = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inSingle) {
      buf += ch;
      if (ch === '\'') { inSingle = false; }
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '\\') { buf += inner[++i] ?? ''; continue; }
      if (ch === '"') { inDouble = false; }
      continue;
    }
    if (ch === '\'') { inSingle = true; buf += ch; continue; }
    if (ch === '"') { inDouble = true; buf += ch; continue; }
    if (ch === '{' || ch === '[') { depth++; buf += ch; continue; }
    if (ch === '}' || ch === ']') { depth--; buf += ch; continue; }
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== '') { parts.push(buf); }

  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) { continue; }
    const key = part.slice(0, colonIdx).trim();
    const value = stripYamlScalar(part.slice(colonIdx + 1));
    if (key === 'from') { result.from = value; }
    else if (key === 'to') { result.to = value; }
    else if (key === 'description') { result.description = value; }
  }
  return result;
}

// -----------------------------------------------------------------------------
// Comparison
// -----------------------------------------------------------------------------

/**
 * Loose type compatibility: jira-fields.json sometimes reports types more specifically
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
  // `option-with-child` (cascading select) is its own canonical type — accept
  // an exact match here so the catch-all below doesn't flag it as a mismatch
  // when the manifest declares it.
  if (declared === 'option-with-child' && found === 'option-with-child') { return true; }
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
      notes: ['not present in .agents/jira-fields.json'],
      missingOptions: [],
    };
  }

  let severity: Severity = 'ok';

  if (!typesMatch(expected.type, found.type)) {
    severity = 'mismatch';
    notes.push(`type mismatch: declared "${expected.type}", found "${found.type ?? '<unknown>'}"`);
  }

  if (expected.type === 'option') {
    const foundOptions = (found.options ?? {}) as Record<string, unknown>;
    const presentOptionKeys = new Set(Object.keys(foundOptions));

    // Empty options on a declared `option` field is almost always a config
    // drift (missing context, scoped permissions, …). Surface it whether or
    // not the manifest declared specific option slugs.
    if (presentOptionKeys.size === 0) {
      if (severity === 'ok') { severity = 'mismatch'; }
      notes.push('field declared as type:option but jira-fields.json has empty options map — re-run jira:sync-fields or check field context permissions');
    }

    if (Array.isArray(expected.options) && expected.options.length > 0) {
      for (const opt of expected.options) {
        if (!presentOptionKeys.has(opt)) { missingOptions.push(opt); }
      }
      if (missingOptions.length > 0) {
        if (severity === 'ok') { severity = 'mismatch'; }
        notes.push(`missing option(s): ${missingOptions.join(', ')}`);
      }
    }
  }

  if (expected.type === 'option-with-child') {
    const foundOptions = (found.options ?? {}) as Record<string, NestedOptionEntry | string>;
    const presentParentKeys = new Set(Object.keys(foundOptions));

    if (presentParentKeys.size === 0) {
      if (severity === 'ok') { severity = 'mismatch'; }
      notes.push('field declared as type:option-with-child but jira-fields.json has empty options map — re-run jira:sync-fields or check field context permissions');
    }

    if (Array.isArray(expected.options) && expected.options.length > 0) {
      // Plain array of parent slugs.
      for (const parent of expected.options) {
        if (!presentParentKeys.has(parent)) { missingOptions.push(parent); }
      }
      if (missingOptions.length > 0) {
        if (severity === 'ok') { severity = 'mismatch'; }
        notes.push(`missing parent option(s): ${missingOptions.join(', ')}`);
      }
    }
    else if (
      expected.options !== null
      && typeof expected.options === 'object'
      && !Array.isArray(expected.options)
    ) {
      // Object form: { parentSlug: [childSlug, ...] }. Validate parents AND children.
      const expectedNested = expected.options as Record<string, unknown>;
      for (const [parentSlug, childList] of Object.entries(expectedNested)) {
        if (!presentParentKeys.has(parentSlug)) {
          missingOptions.push(parentSlug);
          continue;
        }
        if (Array.isArray(childList) && childList.length > 0) {
          const parentEntry = foundOptions[parentSlug];
          const presentChildKeys = new Set(
            parentEntry !== null && typeof parentEntry === 'object' && 'children' in parentEntry
              ? Object.keys(parentEntry.children ?? {})
              : [],
          );
          for (const child of childList) {
            if (typeof child !== 'string') { continue; }
            if (!presentChildKeys.has(child)) { missingOptions.push(`${parentSlug}.${child}`); }
          }
        }
      }
      if (missingOptions.length > 0) {
        if (severity === 'ok') { severity = 'mismatch'; }
        notes.push(`missing option(s): ${missingOptions.join(', ')}`);
      }
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
// Work-type validation (workflows + statuses + transitions)
// -----------------------------------------------------------------------------

/**
 * Validate one work_type from the manifest against the workflows catalog.
 *
 * Severity model mirrors the custom-fields block:
 *   - MISSING       → required entity not present in the catalog
 *   - MISMATCHED    → present but a key attribute (issue type name, transition
 *                     from/to) doesn't match the manifest declaration
 *   - INFO          → catalog file absent (every required entity reports MISSING
 *                     with a hint to run `bun run jira:sync-workflows` first)
 *   - OK            → present and consistent
 *
 * The work_type itself contributes one row (covering the issue type match);
 * each required status and transition contributes one row.
 *
 * `catalog === null` is the "no jira-workflows.json yet" path. We treat every
 * required entity as MISSING but stamp every note with the recovery hint so
 * the user knows what to do.
 */
function checkWorkType(
  workType: ManifestWorkType,
  catalog: WorkflowsCatalog | null,
): WorkTypeCheckResult[] {
  const results: WorkTypeCheckResult[] = [];

  const catalogMissing = catalog === null;
  const catalogEntry: CatalogWorkType | undefined = catalog?.[workType.slug];
  const catalogAbsent = catalogMissing || !catalogEntry;
  const recoveryHint = catalogMissing
    ? 'catalog file missing — run `bun run jira:sync-workflows` first'
    : 'work_type not present in jira-workflows.json — re-run `bun run jira:sync-workflows`';

  // 1. Work-type-level row: validate issue type name match (or report missing).
  const wtNotes: string[] = [];
  let wtSeverity: Severity = 'ok';
  if (catalogAbsent) {
    wtSeverity = 'missing';
    wtNotes.push(recoveryHint);
  }
  else if (catalogEntry) {
    const foundType = catalogEntry.jira_issue_type;
    if (!foundType || !foundType.name) {
      wtSeverity = 'missing';
      wtNotes.push('work_type declared but jira_issue_type is null in jira-workflows.json — re-run `bun run jira:sync-workflows`');
    }
    else if (!issueTypeNameCandidates(workType.jiraIssueType)
      .some(name => name.toLowerCase() === foundType.name.toLowerCase())) {
      // `jira_issue_type` may declare ordered alternatives (`A | B | C`); the sync
      // catalogs whichever one the project has. Comparing the raw declaration
      // against the resolved name flagged every such work_type as a mismatch.
      wtSeverity = 'mismatch';
      wtNotes.push(`expected one of '${workType.jiraIssueType}', found '${foundType.name}'`);
    }
  }
  results.push({
    workType: workType.slug,
    kind: 'work_type',
    entity: workType.slug,
    severity: wtSeverity,
    notes: wtNotes,
  });

  // 2. Required statuses.
  for (const reqStatus of workType.requiredStatuses) {
    const notes: string[] = [];
    let severity: Severity = 'ok';
    if (catalogAbsent) {
      severity = 'missing';
      notes.push(recoveryHint);
    }
    else {
      const found = catalogEntry?.statuses?.[reqStatus.slug];
      if (!found || !found.id) {
        severity = 'missing';
        notes.push(
          `required status '${reqStatus.slug}' not mapped — re-run \`bun run jira:sync-workflows\` (or add the status in Jira admin)`,
        );
      }
      else if (found.category) {
        // Category is informational; surface it in verbose output by leaving
        // a benign note. Severity stays OK.
        notes.push(`category: ${found.category}`);
      }
    }
    results.push({
      workType: workType.slug,
      kind: 'status',
      entity: reqStatus.slug,
      severity,
      notes,
    });
  }

  // 3. Required transitions.
  // Compute the set of declared status slugs once so we can be lenient when
  // a transition's from/to references an undeclared status (its canonical
  // resolution may be a discovered slug that doesn't equal the manifest's
  // expected slug — only flag mismatches when both ends correspond to
  // declared statuses).
  const declaredStatusSlugs = new Set(workType.requiredStatuses.map(s => s.slug));

  for (const reqTrans of workType.requiredTransitions) {
    const notes: string[] = [];
    let severity: Severity = 'ok';
    if (catalogAbsent) {
      severity = 'missing';
      notes.push(recoveryHint);
    }
    else {
      const found = catalogEntry?.transitions?.[reqTrans.slug];
      if (!found || !found.id) {
        severity = 'missing';
        notes.push(
          `required transition '${reqTrans.slug}' not mapped — re-run \`bun run jira:sync-workflows\` (or add the transition in Jira admin)`,
        );
      }
      else {
        // Validate from/to canonicals when the manifest declares them AND both
        // ends correspond to declared statuses (lenient otherwise — see B.3 spec).
        // The manifest may also declare `from: any` (or `to: any`) for global
        // transitions like `bug.re_open`; those never contribute a from/to
        // mismatch on the `any` side regardless of the discovered canonical.
        const expectedFrom = reqTrans.from;
        const expectedTo = reqTrans.to;
        const foundFrom = found.from_canonical;
        const foundTo = found.to_canonical;

        const fromComparable = expectedFrom
          && expectedFrom !== 'any'
          && foundFrom
          && declaredStatusSlugs.has(expectedFrom)
          && declaredStatusSlugs.has(foundFrom);
        const toComparable = expectedTo
          && expectedTo !== 'any'
          && foundTo
          && declaredStatusSlugs.has(expectedTo)
          && declaredStatusSlugs.has(foundTo);

        const fromMismatch = fromComparable && expectedFrom !== foundFrom;
        const toMismatch = toComparable && expectedTo !== foundTo;

        if (fromMismatch || toMismatch) {
          severity = 'mismatch';
          notes.push(
            `transition '${reqTrans.slug}' connects '${foundFrom ?? '(?)'}'→'${foundTo ?? '(?)'}' but manifest expects '${expectedFrom ?? '(?)'}'→'${expectedTo ?? '(?)'}'`,
          );
        }
      }
    }
    results.push({
      workType: workType.slug,
      kind: 'transition',
      entity: reqTrans.slug,
      severity,
      notes,
    });
  }

  return results;
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

interface WorkTypeCounters {
  ok: number
  missing: number
  mismatch: number
  info: number
}

function tallyWorkTypes(results: WorkTypeCheckResult[]): WorkTypeCounters {
  const c: WorkTypeCounters = { ok: 0, missing: 0, mismatch: 0, info: 0 };
  for (const r of results) {
    c[r.severity]++;
  }
  return c;
}

function printHumanReport(
  results: CheckResult[],
  counters: Counters,
  catalogSize: number,
  verbose: boolean,
  workTypeResults: WorkTypeCheckResult[],
  workTypeCounters: WorkTypeCounters,
  workTypeManifestCount: number,
  workflowsCatalogPresent: boolean,
): void {
  const totalOk = counters.ok + workTypeCounters.ok;
  const totalMissing = counters.missing + workTypeCounters.missing;
  const totalMismatch = counters.mismatch + workTypeCounters.mismatch;
  const totalInfo = counters.info + workTypeCounters.info;

  console.log('Jira Setup Status');
  console.log('=================');
  console.log('Manifest:  .agents/jira-required.yaml');
  console.log(`Catalog:   .agents/jira-fields.json (${catalogSize} fields)`);
  if (workTypeManifestCount > 0) {
    console.log(`Workflows: .agents/jira-workflows.json (${workflowsCatalogPresent ? 'present' : 'absent — run `bun run jira:sync-workflows`'})`);
  }
  console.log('');
  if (workTypeManifestCount > 0) {
    console.log(`Required: ${counters.required} · Optional: ${counters.optional} · Unmapped: ${counters.unmapped} · Work types: ${workTypeManifestCount}`);
  }
  else {
    console.log(`Required: ${counters.required} · Optional: ${counters.optional} · Unmapped: ${counters.unmapped}`);
  }
  console.log(
    `Summary:  ✅ ${totalOk} OK   ❌ ${totalMissing} missing   ⚠️ ${totalMismatch} mismatched   💡 ${totalInfo} informational`,
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
      if (exp.type === 'option' && Array.isArray(exp.options) && exp.options.length > 0) {
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
      console.log(`    Found in jira-fields.json: type=${found.type ?? '<unknown>'}, name=${JSON.stringify(found.name ?? '')}`);
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

  // ----- Work types & workflow statuses block ---------------------------------
  if (workTypeManifestCount > 0) {
    console.log('Work types & workflow statuses');
    console.log('------------------------------');
    if (!workflowsCatalogPresent) {
      console.log('💡 .agents/jira-workflows.json is absent — every required entity is reported as MISSING.');
      console.log('   Run `bun run jira:sync-workflows` to populate the catalog, then re-run `bun run jira:check`.');
      console.log('');
    }

    // Group rows by work_type for readability.
    const byWorkType = new Map<string, WorkTypeCheckResult[]>();
    for (const r of workTypeResults) {
      const arr = byWorkType.get(r.workType) ?? [];
      arr.push(r);
      byWorkType.set(r.workType, arr);
    }

    for (const [wtSlug, rows] of byWorkType.entries()) {
      console.log(`  [${wtSlug}]`);
      const hasIssue = rows.some(
        r => r.severity === 'missing' || r.severity === 'mismatch' || r.severity === 'info',
      );
      if (!hasIssue && !verbose) {
        // Everything OK: emit one summary line so a clean run isn't blank.
        const statusCount = rows.filter(r => r.kind === 'status').length;
        const transitionCount = rows.filter(r => r.kind === 'transition').length;
        console.log(`    ✅ OK — ${statusCount} status${statusCount === 1 ? '' : 'es'}, ${transitionCount} transition${transitionCount === 1 ? '' : 's'} all mapped`);
        console.log('');
        continue;
      }
      for (const r of rows) {
        const glyph = r.severity === 'ok'
          ? '✅'
          : r.severity === 'missing'
            ? '❌'
            : r.severity === 'mismatch'
              ? '⚠️ '
              : '💡';
        const label = r.kind === 'work_type'
          ? `work_type "${r.entity}"`
          : `${r.kind} "${r.entity}"`;
        if (r.severity === 'ok' && !verbose && r.notes.length === 0) {
          // Suppress silent OK rows in non-verbose mode for brevity.
          continue;
        }
        if (r.severity === 'ok' && !verbose) {
          // Suppress OK rows that only carry an informational category note.
          continue;
        }
        console.log(`    ${glyph} ${label}`);
        for (const note of r.notes) {
          console.log(`        Note: ${note}`);
        }
      }
      console.log('');
    }

    if (verbose) {
      const wtOk = workTypeResults.filter(r => r.severity === 'ok');
      if (wtOk.length > 0) {
        console.log(`  ✅ OK (${wtOk.length} work-type rows hidden by default)`);
        console.log('');
      }
    }
  }

  // ----- Exit code (sum across both blocks) -----------------------------------
  const fieldExitTrigger = missing.filter(r => r.scope === 'required').length > 0
    || mismatch.filter(r => r.scope === 'required').length > 0;
  const workTypeExitTrigger = workTypeResults.some(
    r => r.severity === 'missing' || r.severity === 'mismatch',
  );
  const exitCode = fieldExitTrigger || workTypeExitTrigger ? 1 : 0;
  const exitReason = exitCode === 0
    ? 'no missing required items'
    : 'required items missing or mismatched';
  console.log(`Exit: ${exitCode} (${exitReason})`);
}

function printJsonReport(
  results: CheckResult[],
  counters: Counters,
  catalogSize: number,
  workTypeResults: WorkTypeCheckResult[],
  workTypeCounters: WorkTypeCounters,
  workflowsCatalogPresent: boolean,
  liveOutcome: LiveCheckOutcome | null,
): void {
  const fieldExitTrigger = results.some(
    r => r.scope === 'required' && (r.severity === 'missing' || r.severity === 'mismatch'),
  );
  const workTypeExitTrigger = workTypeResults.some(
    r => r.severity === 'missing' || r.severity === 'mismatch',
  );
  const exitCode = fieldExitTrigger || workTypeExitTrigger ? 1 : 0;

  const summary = {
    manifest: '.agents/jira-required.yaml',
    catalog: '.agents/jira-fields.json',
    catalog_size: catalogSize,
    workflows_catalog: '.agents/jira-workflows.json',
    workflows_catalog_present: workflowsCatalogPresent,
    counters,
    work_type_counters: workTypeCounters,
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
    work_type_results: workTypeResults.map(r => ({
      work_type: r.workType,
      kind: r.kind,
      entity: r.entity,
      severity: r.severity,
      notes: r.notes,
    })),
    live: liveOutcome === null
      ? { requested: false }
      : {
          requested: true,
          ran: liveOutcome.ran,
          skipped_reason: liveOutcome.skippedReason ?? null,
          base_url: liveOutcome.baseUrl ?? null,
          project_key: liveOutcome.projectKey ?? null,
          project_key_source: liveOutcome.projectKeySource ?? null,
          issue_types_seen: liveOutcome.issueTypesSeen ?? null,
          work_types_compared: liveOutcome.workTypesCompared ?? null,
          statuses_compared: liveOutcome.statusesCompared ?? null,
          drift_count: liveOutcome.findings.length,
          findings: liveOutcome.findings.map(f => ({
            work_type: f.workType,
            kind: f.kind,
            entity: f.entity,
            cached: f.cached,
            live: f.live,
            note: f.note,
          })),
        },
  };

  console.log(JSON.stringify(summary, null, 2));
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

/**
 * Pull `--project <KEY>` / `--project=<KEY>` out of argv. Only consumed by
 * `--live`; ignored (and harmless) otherwise.
 */
function readProjectFlag(args: string[]): string | null {
  const inline = args.find(a => a.startsWith('--project='));
  if (inline) {
    const value = inline.slice('--project='.length).trim();
    return value === '' ? null : value;
  }
  const idx = args.indexOf('--project');
  if (idx !== -1 && idx + 1 < args.length) {
    const value = args[idx + 1].trim();
    if (value !== '' && !value.startsWith('-')) { return value; }
  }
  return null;
}

function printHelp(): void {
  console.log(`Usage: bun run jira:check [--json] [--verbose] [--live] [--project <KEY>] [--help]

Compares .agents/jira-required.yaml (the methodology's required-fields manifest)
against .agents/jira-fields.json (your Jira workspace's custom-field catalog) and
reports MISSING / MISMATCHED / OK status for each required and optional slug.

Offline by default. \`--live\` adds one read-only Jira call that compares the
CACHED .agents/jira-workflows.json against what Jira reports right now — the one
staleness class the offline checks structurally cannot see.

Flags:
  --json           Emit a machine-readable JSON summary.
  --verbose        Include OK entries in the human-readable report (default hides
                   them for brevity).
  --live           Also compare the cached workflow catalog against live Jira
                   (issue-type + status ids). Needs ATLASSIAN_EMAIL /
                   ATLASSIAN_API_TOKEN and only the non-admin Browse Projects
                   permission. Findings are warnings; the exit code never moves.
  --project <KEY>  Project key for --live. Precedence: this flag >
                   JIRA_PROJECT_KEY env > .agents/project.yaml project_key.
  -h, --help       Show this help.

Exit code:
  0 — all required fields present and matching
  1 — at least one required field missing or type-mismatched
      (--live drift is reported as a warning and never sets 1)
`);
}

// -----------------------------------------------------------------------------
// link_types validation
// -----------------------------------------------------------------------------

interface LinkTypeReport {
  slug: string
  scope: 'required' | 'optional'
  severity: 'ok' | 'fallback' | 'missing' | 'deferred'
  expected: LinkTypeEntry
  fallbackSlug?: string
}

interface LinkTypeCatalogEntry {
  id?: string
  name?: string
  outward?: string
  inward?: string
  exists_in_workspace?: boolean
}

function loadLinkTypesCatalog(): Record<string, LinkTypeCatalogEntry> | null {
  if (!existsSync(LINK_TYPES_PATH)) { return null; }
  try {
    const parsed = JSON.parse(readFileSync(LINK_TYPES_PATH, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, LinkTypeCatalogEntry>;
    }
  }
  catch {
    // fall through — treat malformed as missing
  }
  return null;
}

/**
 * A slug counts as "resolved in workspace" only when its catalog entry exists
 * AND its `exists_in_workspace` flag is not explicitly false. The sync script
 * keeps declared-but-missing slugs in the catalog as stubs with
 * `exists_in_workspace: false` — those must NOT pass validation.
 */
function isWorkspaceResolved(entry: LinkTypeCatalogEntry | undefined): boolean {
  if (!entry) { return false; }
  return entry.exists_in_workspace !== false;
}

function checkLinkTypes(
  manifest: Manifest,
  catalog: Record<string, LinkTypeCatalogEntry> | null,
): { results: LinkTypeReport[], deferred: boolean } {
  const results: LinkTypeReport[] = [];
  const deferred = catalog === null;

  for (const [slug, entry] of Object.entries(manifest.linkTypesRequired)) {
    if (deferred) {
      results.push({ slug, scope: 'required', severity: 'deferred', expected: entry });
      continue;
    }
    if (isWorkspaceResolved(catalog[slug])) {
      results.push({ slug, scope: 'required', severity: 'ok', expected: entry });
      continue;
    }
    const fb = entry.fallback ?? null;
    if (fb && isWorkspaceResolved(catalog[fb])) {
      results.push({
        slug,
        scope: 'required',
        severity: 'fallback',
        expected: entry,
        fallbackSlug: fb,
      });
      continue;
    }
    results.push({ slug, scope: 'required', severity: 'missing', expected: entry });
  }

  for (const [slug, entry] of Object.entries(manifest.linkTypesOptional)) {
    if (deferred) {
      results.push({ slug, scope: 'optional', severity: 'deferred', expected: entry });
      continue;
    }
    const present = isWorkspaceResolved(catalog[slug]);
    results.push({
      slug,
      scope: 'optional',
      severity: present ? 'ok' : 'missing',
      expected: entry,
    });
  }

  return { results, deferred };
}

function printLinkTypesReport(results: LinkTypeReport[], deferred: boolean): boolean {
  if (results.length === 0) { return false; }
  console.log('Link Types');
  console.log('==========');
  if (deferred) {
    console.log('💡 DEFERRED — .agents/jira-link-types.json not found.');
    console.log('   Run `bun run jira:sync-link-types` to populate the catalog.');
    console.log('   Validation skipped; degrade gracefully.');
    console.log('');
    return false;
  }

  let hasMissingRequired = false;
  const okCount = results.filter(r => r.severity === 'ok').length;
  const fallbackCount = results.filter(r => r.severity === 'fallback').length;
  const missingRequired = results.filter(r => r.scope === 'required' && r.severity === 'missing');
  const missingOptional = results.filter(r => r.scope === 'optional' && r.severity === 'missing');

  console.log(
    `Summary: ✅ ${okCount} OK   ⚠️ ${fallbackCount} via fallback   `
    + `❌ ${missingRequired.length} required missing   💡 ${missingOptional.length} optional absent`,
  );
  console.log('');

  // Per-slug present/fallback/absent report.
  for (const r of results.filter(x => x.scope === 'required')) {
    if (r.severity === 'ok') {
      console.log(`  ✅ ${r.slug} → present`);
    }
    else if (r.severity === 'fallback') {
      console.log(`  ⚠️  ${r.slug} → via fallback "${r.fallbackSlug}"`);
    }
    else {
      console.log(`  ❌ ${r.slug} → absent (workspace lacks the type AND its fallback)`);
    }
  }
  for (const r of results.filter(x => x.scope === 'optional')) {
    console.log(`  ${r.severity === 'ok' ? '✅' : '💡'} ${r.slug} (optional) → ${r.severity === 'ok' ? 'present' : 'absent'}`);
  }
  console.log('');

  if (missingRequired.length > 0) {
    hasMissingRequired = true;
    console.log('❌ MISSING required link types (workspace lacks the type AND its fallback):');
    for (const r of missingRequired) {
      console.log(`  - ${r.slug} (expected name "${r.expected.name ?? r.slug}")`);
      console.log('    Action: create the link type in Jira admin → Issues → Issue link types,');
      console.log('            then re-run `bun run jira:sync-link-types`.');
    }
    console.log('');
  }

  if (fallbackCount > 0) {
    console.log('⚠️ DEGRADED — required link types resolved via fallback (direction may be lost):');
    for (const r of results.filter(x => x.severity === 'fallback')) {
      console.log(`  - ${r.slug} → fallback "${r.fallbackSlug}" — consumers must flag direction loss.`);
    }
    console.log('');
  }

  return hasMissingRequired;
}

// -----------------------------------------------------------------------------
// Live drift detection (--live)
// -----------------------------------------------------------------------------

/**
 * Everything above this line is OFFLINE: it compares the manifest against the
 * CACHED catalogs. That is structurally blind to the failure mode where the
 * cache itself went stale — a Jira admin reconfigures the project after the last
 * `jira:sync-workflows` run, every id in `jira-workflows.json` starts pointing at
 * the wrong thing, and `jira:check` keeps passing clean the whole time.
 *
 * `--live` closes that gap with ONE read-only call:
 *
 *   GET /rest/api/3/project/{projectIdOrKey}/statuses
 *
 * chosen deliberately over `createmeta/{key}/issuetypes`: it needs the same
 * (non-admin) *Browse Projects* project permission but returns the project's
 * issue types AND each one's full status list, so it detects status drift too —
 * and statuses are what skills actually dereference as
 * `{{jira.status.<work_type>.<slug>}}`.
 *
 * NOT covered, deliberately: `workflow`, `workflow_scheme` and `transitions`.
 * Those come from `/workflowscheme/project` + `POST /workflows`, which require
 * ADMINISTER — the exact permission the audience for this check does not have
 * (`jira:sync-workflows` probes for it and exits early with
 * `[JIRA_SYNC_SKIPPED_NO_ADMIN]`). Re-running the admin-gated sync stays the only
 * way to revalidate those three. The report says so out loud rather than letting
 * a clean `--live` pass imply the whole catalog was verified.
 *
 * Findings are WARNINGS and never move the exit code. An out-of-date catalog is
 * a legitimate state: a non-admin operator literally cannot re-sync, and the
 * `--upex` path intentionally ships upstream's catalog. The point here is signal,
 * not a gate.
 */

interface LiveStatus {
  id: string
  name: string
  statusCategory?: { key?: string }
}

interface LiveIssueType {
  id: string
  name: string
  statuses?: LiveStatus[]
}

type LiveDriftKind
  = | 'issue_type_absent'
    | 'issue_type_id_changed'
    | 'issue_type_renamed'
    | 'status_absent'
    | 'status_id_changed'
    | 'status_renamed';

interface LiveDriftFinding {
  workType: string
  kind: LiveDriftKind
  /** Status slug, or the work_type slug itself for issue-type-level rows. */
  entity: string
  cached: string
  live: string
  note: string
}

interface LiveCheckOutcome {
  ran: boolean
  skippedReason?: string
  baseUrl?: string
  projectKey?: string
  projectKeySource?: string
  issueTypesSeen?: number
  workTypesCompared?: number
  statusesCompared?: number
  findings: LiveDriftFinding[]
}

async function liveFetch<T>(baseUrl: string, auth: string, endpoint: string): Promise<T> {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`${response.status} ${response.statusText} — ${body}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Project key precedence, mirroring `scripts/sync-jira-issues.ts`:
 * `--project` flag > `JIRA_PROJECT_KEY` env > `.agents/project.yaml`.
 *
 * Never prompts and never writes: this is a read-only validator, and the
 * boilerplate ships `project_key: null` on purpose.
 */
function resolveLiveProjectKey(flagValue: string | null): { key: string | null, source: string } {
  if (flagValue) { return { key: flagValue, source: '--project flag' }; }
  const envKey = process.env.JIRA_PROJECT_KEY?.trim();
  if (envKey) { return { key: envKey, source: 'JIRA_PROJECT_KEY env var' }; }
  if (existsSync(PROJECT_YAML_PATH)) {
    try {
      const parsed = parseYaml(readFileSync(PROJECT_YAML_PATH, 'utf8')) as Record<string, unknown> | null;
      const project = parsed?.project as Record<string, unknown> | undefined;
      const raw = project?.project_key;
      if (typeof raw === 'string' && raw.trim() !== '') {
        return { key: raw.trim(), source: '.agents/project.yaml → project.project_key' };
      }
    }
    catch {
      // Unparseable project.yaml is not this validator's problem — treat the
      // key as unresolved and let the caller report a clean SKIPPED.
    }
  }
  return { key: null, source: 'none' };
}

async function runLiveDriftCheck(
  workTypes: ManifestWorkType[],
  catalog: WorkflowsCatalog | null,
  projectKeyFlag: string | null,
): Promise<LiveCheckOutcome> {
  const findings: LiveDriftFinding[] = [];

  if (catalog === null || Object.keys(catalog).length === 0) {
    return {
      ran: false,
      findings,
      skippedReason: '.agents/jira-workflows.json is absent or empty — nothing cached to compare '
        + 'against. Run `bun run jira:sync-workflows` (or `--upex`) first.',
    };
  }

  // Host resolution goes through the canonical resolver, never a bare env read:
  // a stale host would silently compare this project's catalog against another
  // site and report every single id as drift.
  let instance: ReturnType<typeof resolveAtlassianInstance>;
  try {
    instance = resolveAtlassianInstance();
  }
  catch (err) {
    return { ran: false, findings, skippedReason: (err as Error).message };
  }

  const email = process.env.ATLASSIAN_EMAIL?.trim();
  const apiToken = process.env.ATLASSIAN_API_TOKEN?.trim();
  if (!email || !apiToken) {
    return {
      ran: false,
      findings,
      baseUrl: instance.baseUrl,
      skippedReason: 'ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN missing from the environment — add them to .env.',
    };
  }

  const { key: projectKey, source: projectKeySource } = resolveLiveProjectKey(projectKeyFlag);
  if (!projectKey) {
    return {
      ran: false,
      findings,
      baseUrl: instance.baseUrl,
      skippedReason: 'no project key — pass `--project <KEY>`, set JIRA_PROJECT_KEY, or fill '
        + '`project.project_key` in .agents/project.yaml.',
    };
  }

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  let liveTypes: LiveIssueType[];
  try {
    liveTypes = await liveFetch<LiveIssueType[]>(
      instance.baseUrl,
      auth,
      `/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`,
    );
  }
  catch (err) {
    return {
      ran: false,
      findings,
      baseUrl: instance.baseUrl,
      projectKey,
      projectKeySource,
      skippedReason: `Jira read failed for project ${projectKey}: ${(err as Error).message}`,
    };
  }

  const liveByName = new Map<string, LiveIssueType>();
  const liveById = new Map<string, LiveIssueType>();
  for (const it of liveTypes) {
    liveByName.set(it.name.trim().toLowerCase(), it);
    liveById.set(String(it.id), it);
  }
  const manifestBySlug = new Map(workTypes.map(w => [w.slug, w]));

  let workTypesCompared = 0;
  let statusesCompared = 0;

  for (const [slug, entry] of Object.entries(catalog)) {
    const cachedType = entry?.jira_issue_type;
    // Unsynced shells (`jira_issue_type: null`) are the offline block's job —
    // it already reports them as MISSING with the re-sync hint.
    if (!cachedType || !cachedType.name || !cachedType.id) { continue; }
    workTypesCompared++;

    const cachedName = cachedType.name.trim();
    const cachedId = String(cachedType.id);
    let live = liveByName.get(cachedName.toLowerCase());

    if (live) {
      if (String(live.id) !== cachedId) {
        findings.push({
          workType: slug,
          kind: 'issue_type_id_changed',
          entity: slug,
          cached: `${cachedName} (id ${cachedId})`,
          live: `${live.name} (id ${live.id})`,
          note: 'same issue-type name, different id — the project was reconfigured after the last sync',
        });
      }
    }
    else {
      // The cached name is gone. Before calling it absent, try the two ways it
      // can still be the same thing: another alternative declared in the
      // manifest (`Sub-task | Task`), or the same id under a new name.
      const declared = manifestBySlug.get(slug)?.jiraIssueType;
      const alternative = declared
        ? issueTypeNameCandidates(declared)
            .map(name => liveByName.get(name.trim().toLowerCase()))
            .find(candidate => candidate !== undefined)
        : undefined;
      const byId = liveById.get(cachedId);

      if (alternative) {
        findings.push({
          workType: slug,
          kind: 'issue_type_renamed',
          entity: slug,
          cached: `${cachedName} (id ${cachedId})`,
          live: `${alternative.name} (id ${alternative.id})`,
          note: 'cached name is gone, but another alternative declared in jira-required.yaml is present',
        });
        live = alternative;
      }
      else if (byId) {
        findings.push({
          workType: slug,
          kind: 'issue_type_renamed',
          entity: slug,
          cached: `${cachedName} (id ${cachedId})`,
          live: `${byId.name} (id ${byId.id})`,
          note: 'id still exists but the issue type was renamed in Jira',
        });
        live = byId;
      }
      else {
        findings.push({
          workType: slug,
          kind: 'issue_type_absent',
          entity: slug,
          cached: `${cachedName} (id ${cachedId})`,
          live: '(not in project)',
          note: `neither the cached name nor the cached id exists in ${projectKey} any more`,
        });
        continue;
      }
    }

    const liveStatusByName = new Map<string, LiveStatus>();
    const liveStatusById = new Map<string, LiveStatus>();
    for (const st of live.statuses ?? []) {
      liveStatusByName.set(st.name.trim().toLowerCase(), st);
      liveStatusById.set(String(st.id), st);
    }

    for (const [statusSlug, cachedStatus] of Object.entries(entry.statuses ?? {})) {
      if (!cachedStatus?.id || !cachedStatus.name) { continue; }
      statusesCompared++;
      const cachedStatusName = cachedStatus.name.trim();
      const cachedStatusId = String(cachedStatus.id);

      const byName = liveStatusByName.get(cachedStatusName.toLowerCase());
      if (byName) {
        if (String(byName.id) !== cachedStatusId) {
          findings.push({
            workType: slug,
            kind: 'status_id_changed',
            entity: statusSlug,
            cached: `${cachedStatusName} (id ${cachedStatusId})`,
            live: `${byName.name} (id ${byName.id})`,
            note: 'status name matches but the id moved — every {{jira.status.*}} reference to it is stale',
          });
        }
        continue;
      }

      const byStatusId = liveStatusById.get(cachedStatusId);
      if (byStatusId) {
        findings.push({
          workType: slug,
          kind: 'status_renamed',
          entity: statusSlug,
          cached: `${cachedStatusName} (id ${cachedStatusId})`,
          live: `${byStatusId.name} (id ${byStatusId.id})`,
          note: 'same status id, renamed in Jira — ids still resolve, printed names are wrong',
        });
        continue;
      }

      findings.push({
        workType: slug,
        kind: 'status_absent',
        entity: statusSlug,
        cached: `${cachedStatusName} (id ${cachedStatusId})`,
        live: '(not on this issue type)',
        note: `neither the cached name nor the cached id is on "${live.name}" in ${projectKey} any more`,
      });
    }
  }

  return {
    ran: true,
    findings,
    baseUrl: instance.baseUrl,
    projectKey,
    projectKeySource,
    issueTypesSeen: liveTypes.length,
    workTypesCompared,
    statusesCompared,
  };
}

function printLiveReport(outcome: LiveCheckOutcome): void {
  console.log('Live Jira Drift (cached catalog ⇄ live Jira)');
  console.log('===========================================');

  if (!outcome.ran) {
    console.log(`💡 SKIPPED — ${outcome.skippedReason}`);
    console.log('   Offline validation above is unaffected; the exit code does not change.');
    console.log('');
    return;
  }

  console.log(
    `Source: ${outcome.baseUrl}  project ${outcome.projectKey} (via ${outcome.projectKeySource})`,
  );
  console.log(
    `Compared: ${outcome.workTypesCompared} work_type(s) and ${outcome.statusesCompared} cached status(es) `
    + `against ${outcome.issueTypesSeen} live issue type(s).`,
  );
  console.log('');

  if (outcome.findings.length === 0) {
    console.log('✅ No drift — every cached issue-type and status id still matches live Jira.');
  }
  else {
    console.log(`⚠️ ${outcome.findings.length} drift finding(s) — the cached catalog is stale:`);
    console.log('');
    let current = '';
    for (const f of outcome.findings) {
      if (f.workType !== current) {
        current = f.workType;
        console.log(`  ${current}`);
      }
      console.log(`    ⚠️  ${f.entity} [${f.kind}]`);
      console.log(`        cached: ${f.cached}`);
      console.log(`        live:   ${f.live}`);
      console.log(`        ${f.note}`);
    }
    console.log('');
    console.log('   Action: ask someone with Jira ADMINISTER (or ADMINISTER_PROJECTS) to run');
    console.log('           `bun run jira:sync-workflows --force` on this checkout and commit the result.');
  }

  console.log('');
  console.log('   Scope: issue-type and status ids only. `workflow`, `workflow_scheme` and');
  console.log('          `transitions` are admin-gated (POST /workflows) and are NOT verified here —');
  console.log('          a clean pass does not mean the whole catalog is current.');
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  const asJson = args.includes('--json');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const live = args.includes('--live');
  const projectKeyFlag = readProjectFlag(args);

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

  // ----- Work-types validation block ------------------------------------------
  const workTypes = loadManifestWorkTypes();
  const workflowsCatalog = loadWorkflowsCatalog();
  const workflowsCatalogPresent = workflowsCatalog !== null;

  let workTypeResults: WorkTypeCheckResult[] = [];
  if (workTypes.length === 0) {
    // Skip the block entirely; informational nudge once (non-JSON only).
    if (!asJson) {
      console.log('💡 INFO: no work_types declared in manifest — skipping workflow validation.');
      console.log('');
    }
  }
  else {
    for (const wt of workTypes) {
      workTypeResults = workTypeResults.concat(checkWorkType(wt, workflowsCatalog));
    }
  }
  const workTypeCounters = tallyWorkTypes(workTypeResults);

  // ----- link_types validation block ------------------------------------------
  const linkTypesCatalog = loadLinkTypesCatalog();
  const { results: linkTypeResults, deferred: linkTypesDeferred } = checkLinkTypes(
    manifest,
    linkTypesCatalog,
  );
  const linkTypesMissingRequired = !linkTypesDeferred
    && linkTypeResults.some(r => r.scope === 'required' && r.severity === 'missing');

  // ----- live drift block (opt-in, --live) ------------------------------------
  // Purely additive: the offline verdict above and the exit code below are
  // untouched whether this runs, is skipped, or reports drift.
  const liveOutcome: LiveCheckOutcome | null = live
    ? await runLiveDriftCheck(workTypes, workflowsCatalog, projectKeyFlag)
    : null;

  if (asJson) {
    printJsonReport(
      results,
      counters,
      catalogSize,
      workTypeResults,
      workTypeCounters,
      workflowsCatalogPresent,
      liveOutcome,
    );
  }
  else {
    printHumanReport(
      results,
      counters,
      catalogSize,
      verbose,
      workTypeResults,
      workTypeCounters,
      workTypes.length,
      workflowsCatalogPresent,
    );
    printLinkTypesReport(linkTypeResults, linkTypesDeferred);
    if (liveOutcome) { printLiveReport(liveOutcome); }
  }

  const fieldExitTrigger = results.some(
    r => r.scope === 'required' && (r.severity === 'missing' || r.severity === 'mismatch'),
  );
  const workTypeExitTrigger = workTypeResults.some(
    r => r.severity === 'missing' || r.severity === 'mismatch',
  );
  // `--live` findings are deliberately absent from this expression — see the
  // rationale on the live-drift block.
  const exitCode = fieldExitTrigger || workTypeExitTrigger || linkTypesMissingRequired ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`FATAL: ${(err as Error).message}`);
  process.exit(1);
});
