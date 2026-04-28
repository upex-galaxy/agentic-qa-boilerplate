#!/usr/bin/env bun

/**
 * ============================================================================
 * SYNC JIRA FIELDS — Discover Jira custom fields and write .agents/jira-fields.json
 * ============================================================================
 *
 * Walks the Jira Cloud REST API, discovers every custom field in the
 * workspace, slugifies the names, and writes the result to `.agents/jira-fields.json`
 * so skills/commands can reference fields portably as `{{jira.<slug>}}` instead
 * of hardcoding `customfield_XXXXX` IDs.
 *
 * Companion script to `scripts/jira-sync.ts` (which this script does NOT
 * touch — that refactor lives in Session 5 of the agentic-variables plan).
 *
 * JIRA API ENDPOINTS USED:
 *   - GET /rest/api/3/field
 *       Returns ALL fields (system + custom). We filter `custom: true`.
 *   - GET /rest/api/3/field/{fieldId}/context
 *       Returns the contexts for a custom field. We pick the default context
 *       (or the first one if none is flagged default).
 *   - GET /rest/api/3/field/{fieldId}/context/{contextId}/option
 *       Returns the option list for a single-select / multi-select / radio
 *       custom field within that context.
 *
 * ============================================================================
 * REQUIREMENTS
 * ============================================================================
 *
 * 1. Bun runtime (https://bun.sh)
 * 2. Atlassian API credentials (email + API token)
 * 3. No external dependencies — uses native fetch + node:fs
 *
 * ============================================================================
 * ENVIRONMENT
 * ============================================================================
 *
 * Required environment variables (same as `scripts/jira-sync.ts`):
 *   ATLASSIAN_URL=https://your-instance.atlassian.net
 *   ATLASSIAN_EMAIL=your-email@example.com
 *   ATLASSIAN_API_TOKEN=ATATT3x...
 *
 * Get your API token at: https://id.atlassian.com/manage-profile/security/api-tokens
 *
 * No project key is needed — custom fields are workspace-scoped, not
 * project-scoped, on Jira Cloud.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   bun run jira:sync-fields                   # write .agents/jira-fields.json
 *   bun run jira:sync-fields --force           # overwrite if already populated
 *   bun run jira:sync-fields --allow-collisions# tolerate slug collisions (suffix _2, _3, …)
 *   bun run jira:sync-fields --dry-run         # print result, do not write
 *   bun run jira:sync-fields --json            # machine-readable summary
 *   bun run jira:sync-fields --verbose         # log each field as processed
 *   bun run jira:sync-fields --help            # show help
 *
 * ============================================================================
 * EXIT CODES
 * ============================================================================
 *
 *   0 → success
 *   1 → auth / network / config / file-system error (e.g. missing env vars,
 *       Jira API failure, refusal to overwrite a populated file without
 *       --force, output directory missing)
 *   2 → actionable slug collisions detected — two or more Jira custom fields
 *       slugify to the same key, AND at least one of them is a user-managed
 *       field (renameable in the Jira admin UI). The write was aborted.
 *       Rename the duplicates in Jira (recommended) or re-run with
 *       --allow-collisions to suffix them with _2, _3, … and write the file
 *       anyway. Never returned in --dry-run (collisions are a write-time
 *       concern).
 *
 *       Collisions where every participant is plugin-managed (e.g. two
 *       different "Design" fields owned by Jira Service Management) are
 *       non-actionable* — the user cannot rename them — so the script
 *       silently auto-suffixes and continues. Use --verbose to inspect them.
 *
 * ============================================================================
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ============================================================================
// CONSTANTS
// ============================================================================

const REPO_ROOT = join(import.meta.dir, '..');
const OUTPUT_PATH = join(REPO_ROOT, '.agents', 'jira-fields.json');
const MANIFEST_PATH = join(REPO_ROOT, '.agents', 'jira-required.yaml');

// ============================================================================
// TYPES
// ============================================================================

interface Config {
  baseUrl: string
  email: string
  apiToken: string
}

interface CliFlags {
  force: boolean
  allowCollisions: boolean
  dryRun: boolean
  json: boolean
  verbose: boolean
  help: boolean
}

/** A single field that participated in a slug collision. */
interface CollisionEntry {
  id: string
  name: string
  type: string
  /** True if the field is a user-managed custom field (renameable in Jira). */
  userManaged: boolean
  /** Plugin namespace for system-managed fields, undefined for user-managed ones. */
  provider?: string
}

interface JiraFieldSchema {
  type?: string
  items?: string
  custom?: string
  customId?: number
  system?: string
}

interface JiraField {
  id: string
  key?: string
  name: string
  custom: boolean
  schema?: JiraFieldSchema
}

interface JiraFieldContext {
  id: string
  name: string
  description?: string
  isGlobalContext?: boolean
  isAnyIssueType?: boolean
}

interface JiraFieldContextResponse {
  values: JiraFieldContext[]
  isLast?: boolean
  startAt?: number
  total?: number
}

interface JiraFieldOption {
  id: string
  value: string
  disabled?: boolean
  optionId?: string
}

interface JiraFieldOptionResponse {
  values: JiraFieldOption[]
  isLast?: boolean
  startAt?: number
  total?: number
}

/**
 * Nested option shape for cascading-select (`option-with-child`) fields.
 * Each parent slug maps to its option id plus a flat map of child slug → child id.
 */
interface NestedOptionEntry {
  id: string
  children: Record<string, string>
}

/** Output shape per field in `.agents/jira-fields.json`. */
interface JiraFieldEntry {
  id: string
  type: string
  name: string
  /**
   * Discriminated by `type`:
   *   - `option` / `array`        → `Record<string, string>`           (slug → option id)
   *   - `option-with-child`       → `Record<string, NestedOptionEntry>` (parent slug → { id, children })
   * Other types do not carry options.
   */
  options?: Record<string, string> | Record<string, NestedOptionEntry>
  /** Marks plugin-managed fields (greenhopper, servicedesk, jpo, charting, …). */
  system?: true
  /** Plugin namespace for system-managed fields, e.g. `com.pyxis.greenhopper.jira`. */
  provider?: string
}

type JiraFieldsOutput = Record<string, JiraFieldEntry>;

// ============================================================================
// COLORS / OUTPUT
// ============================================================================

const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  cyan: '\x1B[36m',
};

function out(msg: string): void {
  // stdout — for normal output
  process.stdout.write(`${msg}\n`);
}

function err(msg: string): void {
  // stderr — for warnings and errors
  process.stderr.write(`${msg}\n`);
}

const log = {
  info: (msg: string) => err(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => err(`${colors.green}✔${colors.reset} ${msg}`),
  warn: (msg: string) => err(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => err(`${colors.red}✖${colors.reset} ${msg}`),
  dim: (msg: string) => err(`${colors.dim}${msg}${colors.reset}`),
};

// ============================================================================
// CLI / HELP
// ============================================================================

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    force: false,
    allowCollisions: false,
    dryRun: false,
    json: false,
    verbose: false,
    help: false,
  };
  for (const arg of argv) {
    switch (arg) {
      case '--force':
        flags.force = true;
        break;
      case '--allow-collisions':
        flags.allowCollisions = true;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--json':
        flags.json = true;
        break;
      case '--verbose':
      case '-v':
        flags.verbose = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
    }
  }
  return flags;
}

function printHelp(): void {
  out(`sync-jira-fields — discover Jira custom fields → .agents/jira-fields.json

USAGE:
  bun run jira:sync-fields [flags]

FLAGS:
  --force              Overwrite .agents/jira-fields.json even if already populated.
                       The file is treated as "populated" when it is not the
                       empty placeholder \`{}\`. Does NOT bypass the slug
                       collision check — see --allow-collisions for that.
  --allow-collisions   Tolerate slug collisions and write the file anyway.
                       Colliding slugs are suffixed with _2, _3, … in
                       discovery order. NOT recommended for fields used by
                       the methodology — prefer renaming the duplicates in
                       Jira so each field has a unique name.
  --dry-run            Fetch and slugify everything, but print the resulting
                       JSON to stdout instead of writing the file. Collisions
                       are reported as warnings but do not block dry-run.
  --json               Print a machine-readable summary (counts by type) to
                       stdout at the end. Suppresses the human-readable
                       summary.
  --verbose, -v        Log each field name as it is processed.
  --help, -h           Show this help.

ENVIRONMENT:
  ATLASSIAN_URL          e.g. https://your-instance.atlassian.net
  ATLASSIAN_EMAIL        e.g. you@example.com
  ATLASSIAN_API_TOKEN    Atlassian API token (https://id.atlassian.com/manage-profile/security/api-tokens)

OUTPUT:
  .agents/jira-fields.json      Populated with one entry per custom field, keyed by
                         a slug derived from the field name. See .agents/README.md.

EXIT CODES:
  0  success
  1  auth / network / config / file-system error
  2  actionable slug collisions detected — write aborted (rename in Jira or
     pass --allow-collisions). Never returned in --dry-run.

NOTES:
  Each entry in jira-fields.json is annotated with "system": true and a "provider"
  string when the field is plugin-managed (Jira Software, Service
  Management, Advanced Roadmaps, etc.). User-managed custom fields stay
  clean (no extra keys).

  Collisions where every participating field is plugin-managed are
  silently auto-suffixed with _2, _3, … because plugin-managed fields
  cannot be renamed. Run with --verbose to inspect them. Collisions with
  at least one user-managed participant still abort by default — those are
  the ones you can fix in Jira.

RECOMMENDED FLOW:
  1. bun run jira:sync-fields                   # may exit 2 with collision report
  2. <rename duplicates in Jira admin UI>
  3. bun run jira:sync-fields --force           # writes .agents/jira-fields.json

  bun run jira:sync-fields --allow-collisions   # bypass collision check
`);
}

// ============================================================================
// CONFIG
// ============================================================================

function loadConfig(): Config {
  const baseUrl = process.env.ATLASSIAN_URL;
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_API_TOKEN;

  const missing: string[] = [];
  if (!baseUrl) { missing.push('ATLASSIAN_URL'); }
  if (!email) { missing.push('ATLASSIAN_EMAIL'); }
  if (!apiToken) { missing.push('ATLASSIAN_API_TOKEN'); }

  if (missing.length > 0) {
    log.error(`Missing required environment variables: ${missing.join(', ')}`);
    log.dim('Add them to .env (see scripts/jira-sync.ts header for setup).');
    log.dim('Get your API token at: https://id.atlassian.com/manage-profile/security/api-tokens');
    process.exit(1);
  }

  return {
    baseUrl: baseUrl!.replace(/\/$/, ''),
    email: email!,
    apiToken: apiToken!,
  };
}

/**
 * Read the set of slugs declared in `.agents/jira-required.yaml` (across
 * `required:`, `optional:` and `unmapped:` sections). Used so the sync can
 * emit a visible warning when a *declared* option-type field comes back with
 * no options — silent `options: {}` would otherwise mask a real config issue.
 *
 * Returns an empty set if the manifest file does not exist (the sync can
 * still run before the manifest is bootstrapped).
 */
function loadDeclaredSlugs(): Set<string> {
  const declared = new Set<string>();
  if (!existsSync(MANIFEST_PATH)) { return declared; }
  let text: string;
  try {
    text = readFileSync(MANIFEST_PATH, 'utf8');
  }
  catch {
    return declared;
  }
  // Manifest keys are unindented `slug:` lines under `required:` / `optional:`
  // / `unmapped:`. Parsing the YAML here would pull in a dep just to extract
  // top-level keys, so we walk lines and collect any line indented exactly
  // two spaces ending in `:` — that matches the manifest's documented shape.
  let inSection = false;
  const sectionRe = /^(?:required|optional|unmapped):\s*$/;
  const slugRe = /^ {2}([a-z_][a-z0-9_]*):\s*$/;
  for (const line of text.split(/\r?\n/)) {
    if (sectionRe.test(line)) {
      inSection = true;
      continue;
    }
    // A new top-level key (no leading space, ends in `:`) closes the current section.
    if (/^[a-z_][\w-]*:/i.test(line)) {
      inSection = sectionRe.test(line);
      continue;
    }
    if (inSection) {
      const m = slugRe.exec(line);
      if (m) { declared.add(m[1]); }
    }
  }
  return declared;
}

// ============================================================================
// JIRA API CLIENT
// ============================================================================

async function jiraFetch<T>(
  config: Config,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${config.baseUrl}${endpoint}`;
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(
      `Jira API error: ${response.status} ${response.statusText} — ${text}`,
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

async function fetchAllCustomFields(config: Config): Promise<JiraField[]> {
  // GET /rest/api/3/field returns the full array (no pagination on this endpoint).
  const all = await jiraFetch<JiraField[]>(config, '/rest/api/3/field');
  return all.filter(f => f.custom === true);
}

async function fetchFieldContexts(
  config: Config,
  fieldId: string,
): Promise<JiraFieldContext[]> {
  // Paginated endpoint, but in practice fields rarely have >1 context.
  // We page anyway to be defensive.
  const all: JiraFieldContext[] = [];
  let startAt = 0;
  const maxResults = 50;
  let hasMore = true;
  while (hasMore) {
    const resp = await jiraFetch<JiraFieldContextResponse>(
      config,
      `/rest/api/3/field/${fieldId}/context?startAt=${startAt}&maxResults=${maxResults}`,
    );
    all.push(...(resp.values ?? []));
    if (resp.isLast || !resp.values || resp.values.length < maxResults) {
      hasMore = false;
    }
    else {
      startAt += resp.values.length;
    }
  }
  return all;
}

async function fetchFieldOptions(
  config: Config,
  fieldId: string,
  contextId: string,
): Promise<JiraFieldOption[]> {
  const all: JiraFieldOption[] = [];
  let startAt = 0;
  const maxResults = 100;
  let hasMore = true;
  while (hasMore) {
    const resp = await jiraFetch<JiraFieldOptionResponse>(
      config,
      `/rest/api/3/field/${fieldId}/context/${contextId}/option?startAt=${startAt}&maxResults=${maxResults}`,
    );
    all.push(...(resp.values ?? []));
    if (resp.isLast || !resp.values || resp.values.length < maxResults) {
      hasMore = false;
    }
    else {
      startAt += resp.values.length;
    }
  }
  return all;
}

/**
 * Fetch child options of a single parent option in a cascading-select
 * (`option-with-child`) field. Endpoint mirrors `fetchFieldOptions` but
 * scopes the request to a specific parent option id.
 */
async function fetchChildOptions(
  config: Config,
  fieldId: string,
  contextId: string,
  parentOptionId: string,
): Promise<JiraFieldOption[]> {
  const all: JiraFieldOption[] = [];
  let startAt = 0;
  const maxResults = 100;
  let hasMore = true;
  while (hasMore) {
    const resp = await jiraFetch<JiraFieldOptionResponse>(
      config,
      `/rest/api/3/field/${fieldId}/context/${contextId}/option/${parentOptionId}/option?startAt=${startAt}&maxResults=${maxResults}`,
    );
    all.push(...(resp.values ?? []));
    if (resp.isLast || !resp.values || resp.values.length < maxResults) {
      hasMore = false;
    }
    else {
      startAt += resp.values.length;
    }
  }
  return all;
}

// ============================================================================
// SLUGIFY
// ============================================================================

/**
 * Slugify a Jira field name into a stable lowercase identifier.
 *
 * Steps (in order):
 *   1. lowercase
 *   2. NFD normalize + strip combining diacritics (accents)
 *   3. strip emoji + variation selectors + zero-width joiners + symbols
 *   4. replace any character NOT in [a-z0-9_] with `_`
 *   5. collapse multiple `_` into one
 *   6. trim leading/trailing `_`
 *
 * Examples:
 *   "🔥 Severity (Bug)"        → "severity_bug"
 *   "Plan de Aceptación"       → "plan_de_aceptacion"
 *   "Acceptance Test Plan"     → "acceptance_test_plan"
 *   "Story Points (Numeric)"   → "story_points_numeric"
 */
function slugify(name: string): string {
  // 1. lowercase
  let s = name.toLowerCase();

  // 2. strip diacritics — NFD splits "á" into "a" + U+0301; the property
  // class `\p{M}` matches every combining mark, so we drop them all.
  s = s.normalize('NFD').replace(/\p{M}/gu, '');

  // 3. strip emoji + pictographic + variation selectors
  // We unify by removing every "Extended_Pictographic" codepoint plus the
  // ancillary glue characters that emoji sequences use. Bun supports the
  // `\p{...}` Unicode property escape with the `u` flag.
  s = s.replace(/\p{Extended_Pictographic}/gu, '');
  // ZWJ + variation selectors. Each character is stripped via its own replace
  // because grouping them in a single character class triggers the linter's
  // `no-misleading-character-class` rule (these glyphs combine with adjacent
  // characters), and an alternation tripps `prefer-character-class`.
  s = s.replace(/\u{200D}/gu, ''); // zero-width joiner
  s = s.replace(/\u{FE0E}/gu, ''); // text variation selector
  s = s.replace(/\u{FE0F}/gu, ''); // emoji variation selector
  s = s.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ''); // regional indicators (flags)

  // 3b. translate `&` → ` and ` so e.g. "Fixed & Deployed" word-breaks
  // naturally into `fixed_and_deployed` instead of `fixed_deployed`.
  s = s.replace(/&/g, ' and ');

  // 4. anything not [a-z0-9_] → `_`
  s = s.replace(/[^a-z0-9_]+/g, '_');

  // 5. collapse repeats
  s = s.replace(/_+/g, '_');

  // 6. trim
  s = s.replace(/^_+|_+$/g, '');

  return s;
}

// ============================================================================
// FIELD OWNERSHIP (user-managed vs plugin-managed)
// ============================================================================

/** Prefix used by Jira's first-party "Custom fields" plugin. */
const USER_MANAGED_PREFIX = 'com.atlassian.jira.plugin.system.customfieldtypes:';

/**
 * Classify a Jira custom field as user-managed (created in the Jira admin UI,
 * renameable, deletable) or system-managed (provided by a plugin such as
 * Jira Software / Service Management / Advanced Roadmaps; cannot be renamed
 * or deleted by the Jira admin).
 *
 * Heuristic: a field is user-managed iff its `schema.custom` URI starts with
 * the standard `com.atlassian.jira.plugin.system.customfieldtypes:` prefix.
 * Anything else with `custom: true` (greenhopper, servicedesk, jpo, charting,
 * dev-integration, …) is plugin-managed. If `schema.custom` is missing/empty
 * we default to system-managed — defensive, won't trigger user-actionable
 * collision warnings for fields we can't reason about.
 */
function isUserManaged(field: JiraField): boolean {
  const custom = field.schema?.custom;
  if (!custom) { return false; }
  return custom.startsWith(USER_MANAGED_PREFIX);
}

/**
 * Extract the plugin namespace from a `schema.custom` URI.
 *
 *   "com.pyxis.greenhopper.jira:gh-sprint"               → "com.pyxis.greenhopper.jira"
 *   "com.atlassian.servicedesk:sd-customer-organizations" → "com.atlassian.servicedesk"
 *   undefined / ""                                        → "unknown"
 *
 * Only meaningful for system-managed fields; user-managed fields don't carry
 * a `provider` in the output JSON.
 */
function extractProvider(field: JiraField): string {
  const custom = field.schema?.custom;
  if (!custom) { return 'unknown'; }
  const colonIdx = custom.indexOf(':');
  return colonIdx === -1 ? custom : custom.slice(0, colonIdx);
}

// ============================================================================
// FIELD TYPE DETECTION
// ============================================================================

/**
 * Map Jira's `schema.type` (and `schema.items` for arrays) to the canonical
 * type string we write into jira-fields.json.
 *
 * Also reports whether this type carries dropdown options that we should
 * fetch from the field-context API.
 */
function detectFieldType(field: JiraField): { type: string, hasOptions: boolean } {
  const schema = field.schema;
  if (!schema) {
    return { type: 'any', hasOptions: false };
  }

  // Cascading select. `schema.type` is reported as `"option-with-child"` by
  // Jira, but we anchor on `schema.custom` (full URI: `...:cascadingselect`)
  // because the custom-URI signal is more stable across Jira plugins. Place
  // this check BEFORE the generic `option` branch so cascading fields don't
  // get mis-classified as plain single-selects.
  const custom = schema.custom ?? '';
  if (custom.includes('cascadingselect')) {
    return { type: 'option-with-child', hasOptions: true };
  }

  const t = schema.type ?? 'any';

  // Single-select option / radio button / dropdown.
  if (t === 'option') {
    return { type: 'option', hasOptions: true };
  }

  // Array fields: multi-select if items === 'option', otherwise generic array.
  if (t === 'array') {
    const item = schema.items ?? 'string';
    const hasOptions = item === 'option';
    return { type: 'array', hasOptions };
  }

  // Pass-through for known scalar types.
  // We only enumerate the common ones; anything else falls through with its
  // own schema.type string, which is still useful debugging info.
  return { type: t, hasOptions: false };
}

// ============================================================================
// CORE PIPELINE
// ============================================================================

async function buildFieldsOutput(
  config: Config,
  flags: CliFlags,
  declaredSlugs: Set<string>,
): Promise<{
  output: JiraFieldsOutput
  stats: Record<string, number>
  totalOptions: number
  collisions: Map<string, CollisionEntry[]>
}> {
  log.info('Fetching custom fields from Jira…');
  const fields = await fetchAllCustomFields(config);
  log.info(`Found ${fields.length} custom fields. Processing…`);

  // First pass: slugify, detect collisions.
  // We build:
  //   slugCounts        — running occurrence counter per base slug (for suffixing)
  //   collisionGroups   — base slug → every CollisionEntry that mapped to it,
  //                       in discovery order. Populated only when count > 1.
  //                       Reported by main() and used to decide exit code.
  //   slugged           — every field with its final (suffixed) slug. The
  //                       suffix logic always runs so dry-run / --allow-collisions
  //                       produce internally-consistent JSON. main() decides
  //                       whether to actually write.
  const slugCounts = new Map<string, number>();
  const collisionGroups = new Map<string, CollisionEntry[]>();
  const slugged: Array<{
    field: JiraField
    slug: string
    type: string
    hasOptions: boolean
    userManaged: boolean
    provider: string
  }> = [];

  for (const field of fields) {
    const baseSlug = slugify(field.name);
    if (!baseSlug) {
      log.warn(`Field "${field.name}" (${field.id}) slugified to empty string — skipping.`);
      continue;
    }
    const occurrences = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, occurrences);
    const slug = occurrences === 1 ? baseSlug : `${baseSlug}_${occurrences}`;
    const { type, hasOptions } = detectFieldType(field);
    const userManaged = isUserManaged(field);
    const provider = extractProvider(field);

    if (occurrences > 1) {
      // First-time we see a collision for this base slug, retroactively grab
      // the original (occurrence #1) entry from `slugged` so the report shows
      // every participant, not just the duplicates.
      let group = collisionGroups.get(baseSlug);
      if (!group) {
        group = [];
        const original = slugged.find(s => s.slug === baseSlug);
        if (original) {
          group.push({
            id: original.field.id,
            name: original.field.name,
            type: original.type,
            userManaged: original.userManaged,
            provider: original.userManaged ? undefined : original.provider,
          });
        }
        collisionGroups.set(baseSlug, group);
      }
      group.push({
        id: field.id,
        name: field.name,
        type,
        userManaged,
        provider: userManaged ? undefined : provider,
      });

      // Only emit the inline WARN line when --allow-collisions is set
      // OR we are in --dry-run. In the default (write) path, the
      // structured collision report from main() carries the message and
      // the inline noise would only confuse the user before the abort.
      //
      // For non-actionable collisions (all participants so far are
      // plugin-managed and therefore unrenameable in Jira) we stay quiet
      // by default — main() will surface them via --verbose only.
      const groupNow = collisionGroups.get(baseSlug)!;
      const groupActionable = groupNow.some(e => e.userManaged);
      if (groupActionable && (flags.allowCollisions || flags.dryRun)) {
        log.warn(`Slug collision: "${field.name}" → "${slug}" (was ${baseSlug}). Two Jira fields share the slugified name.`);
      }
    }

    slugged.push({ field, slug, type, hasOptions, userManaged, provider });
  }

  // Second pass: fetch options where applicable.
  const output: JiraFieldsOutput = {};
  const stats: Record<string, number> = {};
  let totalOptions = 0;

  for (const { field, slug, type, hasOptions, userManaged, provider } of slugged) {
    stats[type] = (stats[type] ?? 0) + 1;

    const entry: JiraFieldEntry = {
      id: field.id,
      type,
      name: field.name,
    };

    if (hasOptions) {
      try {
        const contexts = await fetchFieldContexts(config, field.id);
        if (contexts.length === 0) {
          // No contexts → the field has no resolvable options. Stay silent for
          // undeclared slugs (most plugin-managed fields land here), but
          // promote to a real warning when the slug appears in
          // `jira-required.yaml` — that's a configuration drift the user
          // needs to see.
          if (declaredSlugs.has(slug)) {
            log.warn(`${slug} (${field.id}): declared in jira-required.yaml but Jira returned no contexts — options map will be empty. Check field-context permissions or remove the slug from the manifest.`);
          }
          else if (flags.verbose) {
            log.dim(`  ${slug}: no contexts, options={}`);
          }
          entry.options = {};
        }
        else {
          // Prefer a globally-scoped context; fall back to the first.
          const ctx
            = contexts.find(c => c.isGlobalContext)
              ?? contexts[0];

          if (type === 'option-with-child') {
            // Cascading select: fetch parent options, then each parent's
            // children. Persist as parentSlug → { id, children: { childSlug: id } }.
            const parents = await fetchFieldOptions(config, field.id, ctx.id);
            const nestedMap: Record<string, NestedOptionEntry> = {};
            const seenParents = new Map<string, number>();
            let childTotal = 0;
            for (const parent of parents) {
              const baseParent = slugify(parent.value);
              if (!baseParent) { continue; }
              const seenCount = (seenParents.get(baseParent) ?? 0) + 1;
              seenParents.set(baseParent, seenCount);
              const parentKey = seenCount === 1 ? baseParent : `${baseParent}_${seenCount}`;

              const children = await fetchChildOptions(config, field.id, ctx.id, parent.id);
              const childMap: Record<string, string> = {};
              const seenChildren = new Map<string, number>();
              for (const child of children) {
                const baseChild = slugify(child.value);
                if (!baseChild) { continue; }
                const seenChildCount = (seenChildren.get(baseChild) ?? 0) + 1;
                seenChildren.set(baseChild, seenChildCount);
                const childKey = seenChildCount === 1 ? baseChild : `${baseChild}_${seenChildCount}`;
                childMap[childKey] = child.id;
              }
              const sortedChildren: Record<string, string> = {};
              for (const k of Object.keys(childMap).sort()) {
                sortedChildren[k] = childMap[k]!;
              }
              nestedMap[parentKey] = { id: parent.id, children: sortedChildren };
              childTotal += children.length;
            }
            const sortedNested: Record<string, NestedOptionEntry> = {};
            for (const k of Object.keys(nestedMap).sort()) {
              sortedNested[k] = nestedMap[k]!;
            }
            entry.options = sortedNested;
            totalOptions += parents.length + childTotal;
            if (flags.verbose) {
              log.dim(`  ${slug}: ${parents.length} parent option(s), ${childTotal} child option(s)`);
            }
            if (parents.length === 0 && declaredSlugs.has(slug)) {
              log.warn(`${slug} (${field.id}): declared in jira-required.yaml but cascading-select context has zero parent options.`);
            }
          }
          else {
            const options = await fetchFieldOptions(config, field.id, ctx.id);
            const optionMap: Record<string, string> = {};
            const seen = new Map<string, number>();
            for (const opt of options) {
              const baseKey = slugify(opt.value);
              if (!baseKey) { continue; }
              const seenCount = (seen.get(baseKey) ?? 0) + 1;
              seen.set(baseKey, seenCount);
              const key = seenCount === 1 ? baseKey : `${baseKey}_${seenCount}`;
              optionMap[key] = opt.id;
            }
            // Sort option keys alphabetically for deterministic output.
            const sortedOptions: Record<string, string> = {};
            for (const k of Object.keys(optionMap).sort()) {
              sortedOptions[k] = optionMap[k]!;
            }
            entry.options = sortedOptions;
            totalOptions += options.length;
            if (flags.verbose) { log.dim(`  ${slug}: ${options.length} option(s)`); }
            if (options.length === 0 && declaredSlugs.has(slug)) {
              log.warn(`${slug} (${field.id}): declared in jira-required.yaml but Jira context returned zero options.`);
            }
          }
        }
      }
      catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 404 || status === 400) {
          log.warn(`Could not fetch options for "${field.name}" (${field.id}): ${(e as Error).message.split('—')[0]?.trim() ?? 'unknown'}. Continuing.`);
          if (declaredSlugs.has(slug)) {
            log.warn(`${slug} (${field.id}): declared in jira-required.yaml but options fetch failed — options map will be empty.`);
          }
          entry.options = {};
        }
        else {
          // Any other error is fatal — the workspace is in a state we don't
          // understand and silently writing partial data would be worse.
          throw e;
        }
      }
    }

    if (flags.verbose && !hasOptions) {
      log.dim(`  ${slug} (${type})`);
    }

    // System-managed fields advertise their plugin namespace so consumers
    // can tell why a field cannot be renamed. We only insert these keys
    // here (after options) so JSON.stringify preserves the documented
    // order: id, type, name, options?, system?, provider?.
    if (!userManaged) {
      entry.system = true;
      entry.provider = provider;
    }

    output[slug] = entry;
  }

  // Sort top-level keys alphabetically for deterministic output.
  const sortedOutput: JiraFieldsOutput = {};
  for (const k of Object.keys(output).sort()) {
    sortedOutput[k] = output[k]!;
  }

  return { output: sortedOutput, stats, totalOptions, collisions: collisionGroups };
}

// ============================================================================
// FILE I/O
// ============================================================================

function isPopulated(filePath: string): boolean {
  if (!existsSync(filePath)) { return false; }
  try {
    const raw = readFileSync(filePath, 'utf8').trim();
    if (raw === '' || raw === '{}') { return false; }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.keys(parsed).length > 0;
  }
  catch {
    // If we can't parse it, treat as populated to be safe — `--force` is
    // required to overwrite a malformed file.
    return true;
  }
}

/**
 * A collision is "actionable" iff at least one participating field is
 * user-managed — i.e. the user can fix it by renaming that field in the
 * Jira admin UI. When every participant is plugin-managed (greenhopper,
 * servicedesk, jpo, …) the user has no way to break the collision, so we
 * silently auto-suffix instead of aborting.
 */
function isActionableCollision(group: CollisionEntry[]): boolean {
  return group.some(e => e.userManaged);
}

/**
 * Split the raw collision map produced by `buildFieldsOutput` into two:
 * actionable groups (≥1 user-managed participant) and non-actionable groups
 * (all participants are plugin-managed).
 */
function partitionCollisions(
  collisions: Map<string, CollisionEntry[]>,
): {
  actionable: Map<string, CollisionEntry[]>
  nonActionable: Map<string, CollisionEntry[]>
} {
  const actionable = new Map<string, CollisionEntry[]>();
  const nonActionable = new Map<string, CollisionEntry[]>();
  for (const [slug, group] of collisions) {
    if (isActionableCollision(group)) {
      actionable.set(slug, group);
    }
    else {
      nonActionable.set(slug, group);
    }
  }
  return { actionable, nonActionable };
}

/**
 * Verbose-only stderr line for non-actionable collisions. These are
 * silently auto-suffixed with `_2`, `_3`, … because the user cannot rename
 * plugin-managed fields. We still want a way to inspect them when
 * debugging, hence the --verbose escape hatch.
 */
function logNonActionableCollisions(
  nonActionable: Map<string, CollisionEntry[]>,
): void {
  for (const [slug, group] of nonActionable) {
    log.dim(`ℹ Auto-suffixed system field collision: ${slug} (${group.length} fields, all plugin-managed)`);
    for (let i = 0; i < group.length; i++) {
      const entry = group[i];
      const branch = i === group.length - 1 ? '└─' : '├─';
      const provider = entry.provider ?? 'unknown';
      log.dim(`   ${branch} ${entry.id}  "${entry.name}"  (provider: ${provider})`);
    }
  }
}

/**
 * Print the structured slug-collision report to stderr.
 *
 * Only ever called with the **actionable** subset of collisions
 * (≥1 user-managed participant). Non-actionable collisions never reach
 * this function — they are silently auto-suffixed and only logged in
 * --verbose mode via `logNonActionableCollisions`.
 *
 * Used in two distinct paths:
 *   - Default write path  → report + abort with exit code 2 (no write).
 *   - --dry-run path      → report only (informational); dry-run always
 *                            exits 0 because nothing is written.
 *
 * Format: one block per colliding base slug, listing every field that
 * mapped to it (id, original name, detected type, ownership marker),
 * followed by a hint pointing at the two ways out (rename in Jira /
 * --allow-collisions).
 */
function reportCollisions(
  collisions: Map<string, CollisionEntry[]>,
  context: 'abort' | 'dry-run',
): void {
  const total = collisions.size;
  if (context === 'abort') {
    log.error(`Detected ${total} slug collision${total === 1 ? '' : 's'}. Refusing to write ${OUTPUT_PATH}.`);
  }
  else {
    log.warn(`Detected ${total} slug collision${total === 1 ? '' : 's'} (dry-run — not aborting).`);
  }

  err('');
  err('  These Jira custom fields slugify to the same key. Skills referencing');
  err('  {{jira.<slug>}} would resolve non-deterministically.');
  err('');

  // Compute padding so the columns line up across all entries.
  let widestId = 0;
  let widestName = 0;
  for (const group of collisions.values()) {
    for (const entry of group) {
      if (entry.id.length > widestId) { widestId = entry.id.length; }
      const quoted = `"${entry.name}"`;
      if (quoted.length > widestName) { widestName = quoted.length; }
    }
  }

  // Mixed = at least one user-managed AND at least one plugin-managed
  // participant in the same slug group. We add a hint at the bottom in
  // that case explaining that only the user-managed side is renameable.
  let anyMixed = false;
  const sortedSlugs = Array.from(collisions.keys()).sort();
  for (const slug of sortedSlugs) {
    const group = collisions.get(slug)!;
    const hasSystem = group.some(e => !e.userManaged);
    const hasUser = group.some(e => e.userManaged);
    if (hasSystem && hasUser) { anyMixed = true; }

    err(`  ${colors.bold}${slug}${colors.reset}:`);
    for (let i = 0; i < group.length; i++) {
      const entry = group[i];
      const isLast = i === group.length - 1;
      const branch = isLast ? '└─' : '├─';
      const idCol = entry.id.padEnd(widestId);
      const nameCol = `"${entry.name}"`.padEnd(widestName);
      const ownership = entry.userManaged
        ? `${entry.type}, user-managed`
        : `${entry.type}, system: ${entry.provider ?? 'unknown'}`;
      err(`    ${branch} ${idCol}  ${nameCol}  (${ownership})`);
    }
    err('');
  }

  if (context === 'abort') {
    err(`  ${colors.bold}Recommended action:${colors.reset} rename the duplicates in Jira so each field has`);
    err('  a unique name, then re-run:');
    err('');
    err(`      ${colors.cyan}bun run jira:sync-fields --force${colors.reset}`);
    err('');
    if (anyMixed) {
      err('  (System-managed fields cannot be renamed. Rename the user-managed');
      err('  duplicate(s) to break the collision.)');
      err('');
    }
    err('  To bypass this check (NOT recommended for fields used by the methodology;');
    err('  affected slugs will be suffixed with _2, _3, ...):');
    err('');
    err(`      ${colors.cyan}bun run jira:sync-fields --allow-collisions${colors.reset}`);
    err('');
  }
  else {
    err(`  ${colors.bold}Note:${colors.reset} a real run (no --dry-run) would refuse to write unless you pass`);
    err('  --allow-collisions. Rename the duplicates in Jira to fix this properly.');
    if (anyMixed) {
      err('  (System-managed fields cannot be renamed. Rename the user-managed');
      err('  duplicate(s) to break the collision.)');
    }
    err('');
  }
}

function writeOutput(filePath: string, output: JiraFieldsOutput): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    log.error(`Output directory does not exist: ${dir}`);
    process.exit(1);
  }
  writeFileSync(filePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  // Refuse to overwrite without --force (unless dry-run).
  if (!flags.dryRun && isPopulated(OUTPUT_PATH) && !flags.force) {
    log.error(`${OUTPUT_PATH} already populated. Re-run with --force to overwrite.`);
    process.exit(1);
  }

  const config = loadConfig();
  const declaredSlugs = loadDeclaredSlugs();

  let output: JiraFieldsOutput;
  let stats: Record<string, number>;
  let totalOptions: number;
  let collisions: Map<string, CollisionEntry[]>;
  try {
    ({ output, stats, totalOptions, collisions } = await buildFieldsOutput(config, flags, declaredSlugs));
  }
  catch (e) {
    log.error(`Failed to build fields output: ${(e as Error).message}`);
    process.exit(1);
  }

  const fieldCount = Object.keys(output).length;
  const { actionable, nonActionable } = partitionCollisions(collisions);
  const hasActionable = actionable.size > 0;

  // Non-actionable collisions (every participant is plugin-managed) cannot
  // be fixed by the user, so we silently auto-suffix and only surface them
  // in --verbose mode regardless of dry-run / write path.
  if (flags.verbose && nonActionable.size > 0) {
    logNonActionableCollisions(nonActionable);
  }

  if (flags.dryRun) {
    out(JSON.stringify(output, null, 2));
    if (hasActionable) {
      // Informational only — dry-run never aborts on collisions.
      reportCollisions(actionable, 'dry-run');
    }
    log.info(`Dry run — would have written ${fieldCount} field(s) to ${OUTPUT_PATH}.`);
    process.exit(0);
  }

  // Real (write) run. Actionable collisions take priority over --force:
  // even with --force, we will not silently clobber the file when slugs
  // collide on user-managed fields, because the resulting jira-fields.json would
  // have non-deterministic keys for fields the user can actually rename.
  if (hasActionable && !flags.allowCollisions) {
    reportCollisions(actionable, 'abort');
    process.exit(2);
  }

  writeOutput(OUTPUT_PATH, output);

  if (flags.json) {
    out(JSON.stringify({
      written_to: OUTPUT_PATH,
      total_fields: fieldCount,
      total_options: totalOptions,
      by_type: stats,
    }, null, 2));
    process.exit(0);
  }

  log.success(`Synced ${fieldCount} custom fields to ${OUTPUT_PATH}`);
  const typeKeys = Object.keys(stats).sort();
  for (const t of typeKeys) {
    const suffix = t === 'option' || t === 'array'
      ? totalOptions > 0 ? ` (with ${totalOptions} options total across all option/array fields)` : ''
      : '';
    log.dim(`   - ${stats[t]} ${t}${typeKeys.indexOf(t) === 0 ? suffix : ''}`);
  }
}

main().catch((e) => {
  log.error((e as Error).message);
  process.exit(1);
});
