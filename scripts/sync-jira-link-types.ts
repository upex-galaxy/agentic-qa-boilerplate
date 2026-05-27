#!/usr/bin/env bun

/**
 * ============================================================================
 * SYNC JIRA LINK TYPES — Discover Jira issue-link types and write
 *                       .agents/jira-link-types.json
 * ============================================================================
 *
 * Walks the Jira Cloud REST API once, fetches every issue-link type in the
 * workspace, and writes a slug-keyed catalog to `.agents/jira-link-types.json`
 * so methodology slugs declared under `link_types:` in
 * `.agents/jira-required.yaml` resolve at lint time
 * (`bun run jira:check`).
 *
 * Companion script to `scripts/sync-jira-fields.ts` and
 * `scripts/sync-jira-workflows.ts` — same env vars, same logger conventions,
 * same exit-code semantics. Together they form the substrate that lets
 * methodology skills be Jira-instance-agnostic.
 *
 * JIRA API ENDPOINT USED:
 *   - GET /rest/api/3/issueLinkType
 *       Returns `{ issueLinkTypes: [{ id, name, inward, outward, self }, …] }`
 *       for the whole workspace (no pagination on this endpoint).
 *
 * ============================================================================
 * MANUAL-INVOCATION POLICY
 * ============================================================================
 *
 * This script is NOT auto-invoked by `bun run setup`, `bun run jira:check`,
 * or any CI hook (locked decision §0 of the product-management refactor plan).
 * Run it by hand whenever the workspace's issue-link-type catalog changes —
 * which is rare. `bun run jira:check` degrades to DEFERRED when the output
 * file is absent and stays green; once written, it validates declared slugs.
 *
 * ============================================================================
 * REQUIREMENTS
 * ============================================================================
 *
 *   1. Bun runtime (https://bun.sh)
 *   2. Atlassian API credentials (email + API token)
 *   3. No external dependencies — uses native `fetch` + `node:fs` +
 *      the workspace's bundled `yaml` package (already a dep, also used by
 *      `check-jira-setup.ts`).
 *
 * ============================================================================
 * ENVIRONMENT
 * ============================================================================
 *
 * Required environment variables (same as the sibling sync scripts):
 *   ATLASSIAN_URL=https://your-instance.atlassian.net
 *   ATLASSIAN_EMAIL=your-email@example.com
 *   ATLASSIAN_API_TOKEN=ATATT3x...
 *
 * Get your API token at: https://id.atlassian.com/manage-profile/security/api-tokens
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   bun run jira:sync-link-types              # write .agents/jira-link-types.json
 *   bun run jira:sync-link-types --dry-run    # print summary, do NOT write
 *   bun run jira:sync-link-types --json       # machine-readable summary
 *   bun run jira:sync-link-types --verbose    # log each link type as processed
 *   bun run jira:sync-link-types --help       # show help (manual-only reminder)
 *
 * ============================================================================
 * EXIT CODES
 * ============================================================================
 *
 *   0 → success — file written (or would have been written on --dry-run).
 *       Declared-but-missing required slugs are NOT a sync-time failure: the
 *       gap is recorded in the JSON with `exists_in_workspace: false` so
 *       `bun run jira:check` can surface it later (or degrade to the
 *       declared `fallback` slug).
 *   1 → auth / network / config / file-system error (missing env vars, REST
 *       call failed, output directory missing).
 *
 * ============================================================================
 * UNDECLARED-WORKSPACE-SLUGS POLICY
 * ============================================================================
 *
 * Workspace link types that are NOT declared in `link_types:` of
 * `.agents/jira-required.yaml` are STILL captured in the catalog — keyed by
 * their slugified workspace name, with `exists_in_workspace: true`. Rationale:
 * the catalog is a faithful inventory of the workspace, not a filter of it,
 * so future manifest additions don't require a re-sync just to surface
 * already-present types. Declared slugs always win the key when there's a
 * conflict (the declared catalog entry overrides any same-slug discovered
 * entry).
 *
 * ============================================================================
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

// ============================================================================
// CONSTANTS
// ============================================================================

const REPO_ROOT = join(import.meta.dir, '..');
const OUTPUT_PATH = join(REPO_ROOT, '.agents', 'jira-link-types.json');
const MANIFEST_PATH = join(REPO_ROOT, '.agents', 'jira-required.yaml');

/**
 * Raw URL of the upstream UPEX-standard `.agents/jira-link-types.json` file.
 *
 * Used by the `--upex` flag to download the reference catalog generated by the
 * upex-galaxy team. Issue-link types are USER-OK (no admin required), so this
 * flag is mainly a convenience for users who want the UPEX standard without
 * running the script against their own workspace.
 *
 * Hardcoded per-repo (QA vs DEV) so `bun up` re-syncs the URL with the script.
 * Pinned to `main` so `--upex` always means "current UPEX standard".
 */
const UPEX_UPSTREAM_URL = 'https://raw.githubusercontent.com/upex-galaxy/agentic-qa-boilerplate/main/.agents/jira-link-types.json';

// ============================================================================
// TYPES
// ============================================================================

interface Config {
  baseUrl: string
  email: string
  apiToken: string
}

interface CliFlags {
  dryRun: boolean
  json: boolean
  verbose: boolean
  help: boolean
  upex: boolean
}

/** A single declared entry under `link_types.required.*` / `link_types.optional.*`. */
interface LinkTypeManifestEntry {
  name?: string
  outward?: string
  inward?: string
  fallback?: string | null
  description?: string
  used_by?: string[]
}

interface LinkTypesManifest {
  required: Record<string, LinkTypeManifestEntry>
  optional: Record<string, LinkTypeManifestEntry>
}

/** Workspace-side shape returned by `GET /rest/api/3/issueLinkType`. */
interface WorkspaceLinkType {
  id: string
  name: string
  inward: string
  outward: string
  self?: string
}

interface IssueLinkTypeResponse {
  issueLinkTypes: WorkspaceLinkType[]
}

/** Output entry shape per slug in `.agents/jira-link-types.json`. */
interface CatalogEntry {
  /**
   * Jira-assigned link-type id. Empty string when the slug is declared but
   * the workspace lacks the type.
   */
  id: string
  /**
   * Workspace display name. Empty string when the slug is declared but
   * the workspace lacks the type.
   */
  name: string
  /** Outward phrasing — e.g. `depends on`. Mirrors manifest if missing in workspace. */
  outward: string
  /** Inward phrasing — e.g. `is dependency for`. Mirrors manifest if missing in workspace. */
  inward: string
  exists_in_workspace: boolean
}

type CatalogOutput = Record<string, CatalogEntry>;

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
  process.stdout.write(`${msg}\n`);
}

function err(msg: string): void {
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
    dryRun: false,
    json: false,
    verbose: false,
    help: false,
    upex: false,
  };
  for (const arg of argv) {
    switch (arg) {
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
      case '--upex':
        flags.upex = true;
        break;
    }
  }
  return flags;
}

function printHelp(): void {
  out(`sync-jira-link-types — discover Jira issue-link types → .agents/jira-link-types.json

USAGE:
  bun run jira:sync-link-types [flags]

FLAGS:
  --dry-run        Fetch + build the catalog, print the summary to stderr and
                   the resulting JSON to stdout, but do NOT write the file.
  --json           Print a machine-readable summary (counts + slug status) to
                   stdout at the end. Suppresses the human-readable summary.
  --verbose, -v    Log each discovered workspace link type as it is processed.
  --upex           Download the UPEX-standard .agents/jira-link-types.json
                   from the upstream boilerplate repo instead of querying
                   Jira. Useful when you want the reference catalog without
                   running the script against your own workspace. Bypasses
                   auth + REST calls; only network requirement is GitHub raw.
                   Source: ${UPEX_UPSTREAM_URL}
  --help, -h       Show this help.

ENVIRONMENT:
  ATLASSIAN_URL          e.g. https://your-instance.atlassian.net
  ATLASSIAN_EMAIL        e.g. you@example.com
  ATLASSIAN_API_TOKEN    Atlassian API token (https://id.atlassian.com/manage-profile/security/api-tokens)

INPUTS:
  .agents/jira-required.yaml   Manifest: declares each required + optional
                               link-type slug. Walked under the \`link_types:\`
                               section.

OUTPUT:
  .agents/jira-link-types.json Catalog keyed by slug. Each entry:
                                 { id, name, outward, inward, exists_in_workspace }
                               Declared-but-missing slugs land with empty
                               id/name and exists_in_workspace=false so
                               \`bun run jira:check\` can degrade to the
                               declared fallback. Workspace types that aren't
                               declared anywhere are still captured under
                               their slugified workspace name.

MANUAL INVOCATION ONLY:
  This script is NOT wired into \`bun run setup\` or \`bun run jira:check\`
  (locked decision §0 of the product-management refactor plan). Run it by
  hand when the workspace's issue-link-type catalog changes — which is rare.

  Idempotent: re-running with no workspace changes produces byte-identical
  output.

EXIT CODES:
  0  success — file written (or would have been written on --dry-run).
     Declared-but-missing slugs are recorded in the file, NOT a sync failure.
  1  auth / network / config / file-system error
`);
}

// ============================================================================
// CONFIG (mirrors sync-jira-fields.ts:loadConfig)
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
    log.dim('Add them to .env (see scripts/sync-jira-issues.ts header for setup).');
    log.dim('Get your API token at: https://id.atlassian.com/manage-profile/security/api-tokens');
    process.exit(1);
  }

  return {
    baseUrl: baseUrl!.replace(/\/$/, ''),
    email: email!,
    apiToken: apiToken!,
  };
}

// ============================================================================
// MANIFEST LOADER
// ============================================================================

/**
 * Parse the `link_types:` section of `.agents/jira-required.yaml` using the
 * bundled `yaml` package (same dep `check-jira-setup.ts` uses — no new deps).
 * Returns empty `required` / `optional` maps if the section or the file is
 * absent so the caller can still write a workspace-only catalog.
 */
function loadManifest(): LinkTypesManifest {
  if (!existsSync(MANIFEST_PATH)) {
    log.error(`${relative(REPO_ROOT, MANIFEST_PATH)} not found.`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(MANIFEST_PATH, 'utf8'));
  }
  catch (e) {
    log.error(`Cannot parse ${relative(REPO_ROOT, MANIFEST_PATH)}: ${(e as Error).message}`);
    process.exit(1);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    log.error(`${relative(REPO_ROOT, MANIFEST_PATH)} must be a YAML mapping at the top level.`);
    process.exit(1);
  }
  const root = parsed as Record<string, unknown>;
  const linkTypes = (root.link_types ?? {}) as Record<string, unknown>;
  const required = (linkTypes.required ?? {}) as Record<string, LinkTypeManifestEntry>;
  const optional = (linkTypes.optional ?? {}) as Record<string, LinkTypeManifestEntry>;
  return { required, optional };
}

// ============================================================================
// JIRA API CLIENT (mirrors sync-jira-fields.ts:jiraFetch)
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

async function fetchWorkspaceLinkTypes(config: Config): Promise<WorkspaceLinkType[]> {
  const resp = await jiraFetch<IssueLinkTypeResponse>(config, '/rest/api/3/issueLinkType');
  return Array.isArray(resp.issueLinkTypes) ? resp.issueLinkTypes : [];
}

// ============================================================================
// SLUGIFY (vendored from sync-jira-fields.ts — same rules per spec)
// ============================================================================

/**
 * Slugify a Jira link-type name into a stable lowercase identifier. Identical
 * rules to `sync-jira-fields.ts:slugify` so e.g. "Dependencies" → `dependencies`.
 *
 * Parenthetical decorators are stripped (see sync-jira-fields.ts header for
 * rationale).
 */
function slugify(name: string): string {
  let s = name.replace(/\s*\([^)]*\)\s*/g, ' ');
  s = s.toLowerCase();
  s = s.normalize('NFD').replace(/\p{M}/gu, '');
  s = s.replace(/\p{Extended_Pictographic}/gu, '');
  s = s.replace(/\u{200D}/gu, '');
  s = s.replace(/\u{FE0E}/gu, '');
  s = s.replace(/\u{FE0F}/gu, '');
  s = s.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9_]+/g, '_');
  s = s.replace(/_+/g, '_');
  s = s.replace(/^_+|_+$/g, '');
  return s;
}

// ============================================================================
// CATALOG BUILDER
// ============================================================================

interface BuildStats {
  workspaceCount: number
  declaredCount: number
  declaredResolved: number
  declaredFallbackUsed: number
  declaredMissingNoFallback: number
  optionalMissing: number
  undeclaredCaptured: number
}

interface DeclaredCheck {
  slug: string
  scope: 'required' | 'optional'
  entry: LinkTypeManifestEntry
  resolved: boolean
  fallbackResolved: boolean
  fallbackSlug: string | null
}

/**
 * Match a declared slug to a workspace link type by case-insensitive exact
 * match on the manifest's `name`. Slug-level match is also accepted as a
 * fallback so workspaces that already use canonical slugged names line up.
 */
function findWorkspaceMatch(
  entry: LinkTypeManifestEntry,
  slug: string,
  workspaceByName: Map<string, WorkspaceLinkType>,
  workspaceBySlug: Map<string, WorkspaceLinkType>,
): WorkspaceLinkType | null {
  if (entry.name) {
    const hit = workspaceByName.get(entry.name.toLowerCase());
    if (hit) { return hit; }
  }
  return workspaceBySlug.get(slug) ?? null;
}

function buildCatalog(
  manifest: LinkTypesManifest,
  workspaceTypes: WorkspaceLinkType[],
  flags: CliFlags,
): { catalog: CatalogOutput, stats: BuildStats, checks: DeclaredCheck[] } {
  const workspaceByName = new Map<string, WorkspaceLinkType>();
  const workspaceBySlug = new Map<string, WorkspaceLinkType>();
  for (const wt of workspaceTypes) {
    workspaceByName.set(wt.name.toLowerCase(), wt);
    const slug = slugify(wt.name);
    if (slug) { workspaceBySlug.set(slug, wt); }
    if (flags.verbose) {
      log.dim(`  workspace: "${wt.name}" (id ${wt.id}, slug ${slug || '<empty>'})`);
    }
  }

  const catalog: CatalogOutput = {};
  const checks: DeclaredCheck[] = [];

  const declaredEntries: Array<{ slug: string, scope: 'required' | 'optional', entry: LinkTypeManifestEntry }> = [];
  for (const [slug, entry] of Object.entries(manifest.required)) {
    declaredEntries.push({ slug, scope: 'required', entry });
  }
  for (const [slug, entry] of Object.entries(manifest.optional)) {
    declaredEntries.push({ slug, scope: 'optional', entry });
  }

  const declaredSlugs = new Set(declaredEntries.map(d => d.slug));

  let declaredResolved = 0;
  let declaredFallbackUsed = 0;
  let declaredMissingNoFallback = 0;
  let optionalMissing = 0;

  for (const { slug, scope, entry } of declaredEntries) {
    const match = findWorkspaceMatch(entry, slug, workspaceByName, workspaceBySlug);
    if (match) {
      catalog[slug] = {
        id: match.id,
        name: match.name,
        outward: match.outward,
        inward: match.inward,
        exists_in_workspace: true,
      };
      declaredResolved++;
      checks.push({ slug, scope, entry, resolved: true, fallbackResolved: false, fallbackSlug: null });
      continue;
    }

    // Declared but missing. Record a stub with empty id/name and the
    // manifest's outward/inward as best-effort phrasings.
    catalog[slug] = {
      id: '',
      name: '',
      outward: entry.outward ?? '',
      inward: entry.inward ?? '',
      exists_in_workspace: false,
    };

    // Determine fallback resolvability for the human-readable summary; the
    // actual fallback-vs-missing verdict lives in `check-jira-setup.ts` and
    // is recomputed there from the same catalog + manifest.
    const fbSlug = entry.fallback ?? null;
    let fallbackResolved = false;
    if (fbSlug) {
      let fbMatch: WorkspaceLinkType | undefined = workspaceBySlug.get(fbSlug);
      if (!fbMatch) {
        const fbRequiredName = manifest.required[fbSlug]?.name;
        if (fbRequiredName) {
          fbMatch = workspaceByName.get(fbRequiredName.toLowerCase());
        }
      }
      if (!fbMatch) {
        const fbOptionalName = manifest.optional[fbSlug]?.name;
        if (fbOptionalName) {
          fbMatch = workspaceByName.get(fbOptionalName.toLowerCase());
        }
      }
      if (fbMatch) {
        fallbackResolved = true;
      }
    }

    if (scope === 'required') {
      if (fallbackResolved) {
        declaredFallbackUsed++;
      }
      else {
        declaredMissingNoFallback++;
      }
    }
    else {
      optionalMissing++;
    }

    checks.push({ slug, scope, entry, resolved: false, fallbackResolved, fallbackSlug: fbSlug });
  }

  // Capture undeclared workspace types under their slugified workspace name —
  // declared slugs always win when there's a conflict.
  let undeclaredCaptured = 0;
  for (const wt of workspaceTypes) {
    const slug = slugify(wt.name);
    if (!slug) { continue; }
    if (declaredSlugs.has(slug)) { continue; }
    // If the slug is already present in the catalog from another path, skip.
    if (slug in catalog) { continue; }
    catalog[slug] = {
      id: wt.id,
      name: wt.name,
      outward: wt.outward,
      inward: wt.inward,
      exists_in_workspace: true,
    };
    undeclaredCaptured++;
  }

  // Sort top-level keys alphabetically for deterministic output.
  const sortedCatalog: CatalogOutput = {};
  for (const k of Object.keys(catalog).sort()) {
    sortedCatalog[k] = catalog[k];
  }

  const stats: BuildStats = {
    workspaceCount: workspaceTypes.length,
    declaredCount: declaredEntries.length,
    declaredResolved,
    declaredFallbackUsed,
    declaredMissingNoFallback,
    optionalMissing,
    undeclaredCaptured,
  };

  return { catalog: sortedCatalog, stats, checks };
}

// ============================================================================
// FILE I/O
// ============================================================================

function writeCatalog(filePath: string, catalog: CatalogOutput): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    log.error(`Output directory does not exist: ${dir}`);
    process.exit(1);
  }
  writeFileSync(filePath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

// ============================================================================
// UPEX UPSTREAM FETCH (--upex flag)
// ============================================================================

/**
 * Download the upstream UPEX-standard `.agents/jira-link-types.json` directly
 * from GitHub raw. Validates that the response is parseable JSON and that the
 * top-level shape is an object (one key per slug).
 */
async function fetchUpexUpstream(): Promise<CatalogOutput> {
  log.info(`Downloading UPEX standard from ${UPEX_UPSTREAM_URL}…`);
  let response: Response;
  try {
    response = await fetch(UPEX_UPSTREAM_URL);
  }
  catch (e) {
    throw new Error(`Network error fetching upstream: ${(e as Error).message}`);
  }
  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  }
  catch {
    throw new Error('Upstream response is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Upstream JSON is not a top-level object (expected slug → entry map).');
  }
  return parsed as CatalogOutput;
}

// ============================================================================
// REPORTER
// ============================================================================

function printHumanSummary(
  stats: BuildStats,
  checks: DeclaredCheck[],
  outputPath: string,
  wrote: boolean,
): void {
  log.success(
    `${wrote ? 'Wrote' : 'Would write'} catalog with ${Object.keys(checks).length} declared slug(s) `
    + `+ ${stats.undeclaredCaptured} workspace-only slug(s) → ${relative(REPO_ROOT, outputPath)}`,
  );
  log.dim(`   workspace link types: ${stats.workspaceCount}`);
  log.dim(`   declared resolved:    ${stats.declaredResolved} / ${stats.declaredCount}`);
  if (stats.declaredFallbackUsed > 0) {
    log.dim(`   declared via fallback (DEGRADED, direction may be lost): ${stats.declaredFallbackUsed}`);
  }
  if (stats.declaredMissingNoFallback > 0) {
    log.dim(`   declared missing with NO usable fallback: ${stats.declaredMissingNoFallback}`);
  }
  if (stats.optionalMissing > 0) {
    log.dim(`   optional absent: ${stats.optionalMissing}`);
  }

  const required = checks.filter(c => c.scope === 'required');
  const optional = checks.filter(c => c.scope === 'optional');

  if (required.length > 0) {
    err('');
    err(`  ${colors.bold}Required slugs:${colors.reset}`);
    for (const c of required) {
      if (c.resolved) {
        err(`    ${colors.green}✔${colors.reset} ${c.slug} → present`);
      }
      else if (c.fallbackResolved && c.fallbackSlug) {
        err(`    ${colors.yellow}⚠${colors.reset} ${c.slug} → missing, fallback "${c.fallbackSlug}" available`);
      }
      else {
        err(`    ${colors.red}✖${colors.reset} ${c.slug} → missing, NO fallback (jira:check will fail here)`);
      }
    }
  }

  if (optional.length > 0) {
    err('');
    err(`  ${colors.bold}Optional slugs:${colors.reset}`);
    for (const c of optional) {
      if (c.resolved) {
        err(`    ${colors.green}✔${colors.reset} ${c.slug} → present`);
      }
      else {
        err(`    ${colors.dim}·${colors.reset} ${c.slug} → absent (optional)`);
      }
    }
  }
  err('');
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

  // --upex: short-circuit the entire Jira-fetch pipeline and download the
  // upstream reference JSON. Does not require ATLASSIAN_* env vars.
  if (flags.upex) {
    let upstream: CatalogOutput;
    try {
      upstream = await fetchUpexUpstream();
    }
    catch (e) {
      log.error(`UPEX fetch failed: ${(e as Error).message}`);
      process.exit(1);
    }
    const slugCount = Object.keys(upstream).length;
    if (flags.dryRun) {
      out(JSON.stringify(upstream, null, 2));
      log.info(`Dry run — would have written ${slugCount} link-type slug(s) from UPEX upstream to ${OUTPUT_PATH}.`);
      process.exit(0);
    }
    writeCatalog(OUTPUT_PATH, upstream);
    log.success(`Downloaded UPEX standard: ${slugCount} link-type slug(s) → ${OUTPUT_PATH}`);
    log.dim(`  Source: ${UPEX_UPSTREAM_URL}`);
    process.exit(0);
  }

  const config = loadConfig();
  const manifest = loadManifest();

  log.info('Fetching workspace issue-link types…');
  let workspaceTypes: WorkspaceLinkType[];
  try {
    workspaceTypes = await fetchWorkspaceLinkTypes(config);
  }
  catch (e) {
    log.error(`Failed to fetch workspace link types: ${(e as Error).message}`);
    process.exit(1);
  }
  log.info(`Discovered ${workspaceTypes.length} workspace link type(s).`);

  const { catalog, stats, checks } = buildCatalog(manifest, workspaceTypes, flags);

  if (flags.dryRun) {
    out(JSON.stringify(catalog, null, 2));
    if (flags.json) {
      // --json takes precedence for machine-readable output; reprint the
      // summary as JSON on a separate line so consumers can split on it.
      err(JSON.stringify({
        would_write_to: OUTPUT_PATH,
        stats,
        checks: checks.map(c => ({
          slug: c.slug,
          scope: c.scope,
          resolved: c.resolved,
          fallback_resolved: c.fallbackResolved,
          fallback_slug: c.fallbackSlug,
        })),
      }, null, 2));
    }
    else {
      printHumanSummary(stats, checks, OUTPUT_PATH, false);
      log.info('Dry run — no file written.');
    }
    process.exit(0);
  }

  writeCatalog(OUTPUT_PATH, catalog);

  if (flags.json) {
    out(JSON.stringify({
      written_to: OUTPUT_PATH,
      stats,
      checks: checks.map(c => ({
        slug: c.slug,
        scope: c.scope,
        resolved: c.resolved,
        fallback_resolved: c.fallbackResolved,
        fallback_slug: c.fallbackSlug,
      })),
    }, null, 2));
    process.exit(0);
  }

  printHumanSummary(stats, checks, OUTPUT_PATH, true);
}

main().catch((e) => {
  log.error((e as Error).message);
  process.exit(1);
});
