/**
 * @fileoverview Canonical resolver for the ACTIVE Atlassian instance host.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every Jira-touching script used to read the instance host straight from
 * `process.env.ATLASSIAN_URL`. That is a real, observed data-corruption vector,
 * not a theoretical one:
 *
 *   - A stale `ATLASSIAN_URL` can live in the PROCESS environment (inherited
 *     from whatever spawned the agent session) while the `.env` file on disk
 *     holds the CORRECT, post-migration value.
 *   - `bun` autoloads `.env`, and `dotenv-cli` loads it too — but BOTH treat a
 *     variable that is already present in the process as the winner. A correct
 *     `.env` is therefore ignored in silence.
 *   - A full application restart does NOT clear it: the value is re-inherited
 *     from the same parent every time.
 *
 * The failure mode is silent, not loud. `scripts/sync-jira-issues.ts` OVERWRITES
 * `.context/PBI/` with whatever the host returns, so a stale host rewrites the
 * local cache with another site's content and reports success. This actually
 * happened (upex-bunkai-tms, 2026-08-10): a story folder was rewritten with
 * pre-migration content from the old instance.
 *
 * THE ANCHOR
 * ----------
 * The instance host is PROJECT IDENTITY, not a per-developer override. It
 * changes on a site migration — the exact event that leaves stale copies behind.
 * So it is resolved from a VERSIONED file that shows up in a diff:
 *
 *   1. `.agents/project.yaml` -> `issue_tracker.atlassian_url`   (source of truth)
 *   2. `ATLASSIAN_URL` env var                                   (fallback only)
 *   3. Neither set -> throw, so nothing ever silently points at a guess.
 *
 * When both are set and DISAGREE, the yaml wins and a warning names both values.
 * The mismatch is not resolved in silence on purpose: a divergence means some
 * OTHER process in the toolchain is still being handed the wrong host.
 *
 * `ATLASSIAN_URL` IS NO LONGER A LOCAL VARIABLE
 * ---------------------------------------------
 * It is deliberately absent from `.env` / `.env.example`: as long as it lived
 * there, a stale copy in the PROCESS environment could shadow the corrected file
 * and re-create the exact failure above. Locally, the yaml is now the ONLY
 * source, and step 2 above degraded to a compatibility shim for a repo that has
 * not run `bun run agents:setup` yet.
 *
 * That applies to the TEST RUNTIME too, not just the tooling: `config/variables.ts`
 * resolves the host through this module, so a Jira-Direct TMS sync cannot be
 * pointed at a dead site by an inherited variable either.
 *
 * Everything that needs the host from a SHELL calls the accessor instead of
 * interpolating an env var: `bun run jira:url` (base URL) / `--slug` (bare host
 * for `acli --site`). See `scripts/atlassian-url.ts`.
 *
 * DELIBERATE INVERSION vs. THE PROJECT-KEY RESOLVER
 * -------------------------------------------------
 * `sync-jira-issues.ts:resolveProjectKey()` lets `JIRA_PROJECT_KEY` WIN over the
 * yaml — a project key is a legitimate per-run override ("sync ACME instead").
 * The instance host is not: it identifies the project itself. Opposite
 * precedence, on purpose.
 *
 * CREDENTIALS STAY ENV-ONLY
 * -------------------------
 * `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` are secrets and are NEVER mirrored
 * into `.agents/project.yaml` (a versioned file). They keep coming from `.env`
 * and are validated by each caller as before.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/** Where the resolved host came from. */
export type AtlassianUrlSource = 'project.yaml' | 'env';

export interface AtlassianInstanceMismatch {
  /** Normalized value declared in `.agents/project.yaml`. */
  yaml: string
  /** Normalized value found in `ATLASSIAN_URL`. */
  env: string
}

export interface ResolvedAtlassianInstance {
  /** Normalized `https://host` — scheme guaranteed, no trailing slash. */
  baseUrl: string
  source: AtlassianUrlSource
  /** Non-null only when BOTH sources are set and point at different hosts. */
  mismatch: AtlassianInstanceMismatch | null
}

// ----------------------------------------------------------------------------
// Paths
// ----------------------------------------------------------------------------

/**
 * `cli/lib/` -> repo root. `import.meta.dir` is Bun-only; the CI Framework
 * Validation check loads playwright.config under Node, where it is undefined
 * and `join(undefined)` throws — fall back to the portable URL-based form.
 */
const REPO_ROOT = join(import.meta.dir ?? dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT_YAML_PATH = join(REPO_ROOT, '.agents', 'project.yaml');

// ----------------------------------------------------------------------------
// Normalization
// ----------------------------------------------------------------------------

/**
 * Normalizes a host value to `https://host` form so the two sources can be
 * compared, and so callers can concatenate `/rest/api/3/...` unconditionally.
 *
 * Tolerates both shapes that exist in the wild across this repo's own docs:
 *   - `https://acme.atlassian.net/`  (what `bun run agents:setup` writes)
 *   - `acme.atlassian.net`           (the bare slug `acli --site` consumes)
 *
 * Returns `null` for a blank / unusable value.
 */
export function normalizeAtlassianUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') { return null; }
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') { return null; }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

/** Case-insensitive host comparison of two already-normalized URLs. */
function sameInstance(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// ----------------------------------------------------------------------------
// Sources
// ----------------------------------------------------------------------------

/**
 * Reads `issue_tracker.atlassian_url` from `.agents/project.yaml`.
 *
 * Returns `null` when the file is missing, unparseable, the field is absent, or
 * its value is `null` / blank — the boilerplate ships it `null` on purpose so a
 * template repo never carries a concrete site.
 */
export function readAtlassianUrlFromYaml(yamlPath: string = PROJECT_YAML_PATH): string | null {
  if (!existsSync(yamlPath)) { return null; }
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(yamlPath, 'utf8'));
  }
  catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') { return null; }
  const tracker = (parsed as Record<string, unknown>).issue_tracker;
  if (tracker === null || typeof tracker !== 'object') { return null; }
  return normalizeAtlassianUrl((tracker as Record<string, unknown>).atlassian_url as string);
}

// ----------------------------------------------------------------------------
// Resolver
// ----------------------------------------------------------------------------

export interface ResolveOptions {
  /** Override the `.agents/project.yaml` location (tests, non-standard roots). */
  yamlPath?: string
  /** Override the env value (defaults to `process.env.ATLASSIAN_URL`). */
  envValue?: string | null
}

/**
 * Resolves the active Atlassian instance. Throws when neither source is set, so
 * a caller can never fall through to an implicit or guessed host.
 */
export function resolveAtlassianInstance(options: ResolveOptions = {}): ResolvedAtlassianInstance {
  const yamlUrl = readAtlassianUrlFromYaml(options.yamlPath ?? PROJECT_YAML_PATH);
  const envUrl = normalizeAtlassianUrl(
    options.envValue === undefined ? process.env.ATLASSIAN_URL : options.envValue,
  );

  if (yamlUrl) {
    const mismatch = envUrl && !sameInstance(yamlUrl, envUrl)
      ? { yaml: yamlUrl, env: envUrl }
      : null;
    return { baseUrl: yamlUrl, source: 'project.yaml', mismatch };
  }

  if (envUrl) {
    return { baseUrl: envUrl, source: 'env', mismatch: null };
  }

  throw new Error(
    'Atlassian instance is not set. Fill `issue_tracker.atlassian_url` in '
    + '`.agents/project.yaml` — it is the single source of truth, and it is versioned '
    + 'so the value shows up in a diff. Run `bun run agents:setup` for an interactive '
    + 'walkthrough. (`ATLASSIAN_URL` is NOT a `.env` variable anymore; it is read here '
    + 'only as a transitional fallback for a repo that has not been set up yet.)',
  );
}

// ----------------------------------------------------------------------------
// Reporting helpers
// ----------------------------------------------------------------------------

/** Human label for a run banner, e.g. `.agents/project.yaml`. */
export function instanceSourceLabel(source: AtlassianUrlSource): string {
  return source === 'project.yaml'
    ? '.agents/project.yaml -> issue_tracker.atlassian_url'
    : 'ATLASSIAN_URL env fallback';
}

/**
 * Warning text for a yaml/env divergence, or `null` when they agree.
 *
 * Callers MUST surface this. `ATLASSIAN_URL` is no longer written to `.env`, so
 * a value showing up here came from the process environment or a CI secret —
 * i.e. exactly the stale-copy vector this module exists to defend against.
 */
export function formatInstanceMismatchWarning(resolved: ResolvedAtlassianInstance): string | null {
  if (!resolved.mismatch) { return null; }
  const { yaml, env } = resolved.mismatch;
  return (
    `ATLASSIAN_URL (${env}) disagrees with .agents/project.yaml (${yaml}). `
    + `Using the yaml value: ${yaml}. `
    + 'ATLASSIAN_URL is not part of .env anymore, so this value was inherited from the '
    + 'process environment (or a CI secret) and is almost certainly stale. Unset it in '
    + 'the shell that spawned this session before running any write operation: '
    + '`ps eww -p $PPID` walks the ancestry.'
  );
}

// ----------------------------------------------------------------------------
// Shapes
// ----------------------------------------------------------------------------

/**
 * The BARE HOST form `acli --site` consumes: no scheme, no trailing slash.
 *
 * `acli jira auth login --site` wants `acme.atlassian.net`, not
 * `https://acme.atlassian.net/`. Every consumer used to hand-roll this with
 * `${ATLASSIAN_URL#https://}` — a shell parameter expansion that silently
 * no-ops on an `http://` value and leaves a trailing slash in place. Deriving
 * it here means one implementation and one set of edge cases.
 */
export function toSiteSlug(baseUrl: string): string {
  return baseUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

// ----------------------------------------------------------------------------
// Writer
// ----------------------------------------------------------------------------

/**
 * Sets `issue_tracker.atlassian_url` in `.agents/project.yaml`, in place.
 *
 * Surgical on purpose: it rewrites exactly the one leaf line and preserves the
 * trailing comment, the surrounding comment block, and every other line byte
 * for byte. `scripts/agents-setup.ts` owns the full-file renderer, but that one
 * needs a complete update map for every tracked field — overkill (and lossy)
 * when a caller has a single value in hand.
 *
 * Throws when the file or the `atlassian_url:` leaf is missing: the caller asked
 * to persist project identity, and silently doing nothing is how a repo ends up
 * pointing at a guess. Returns the normalized value that was written.
 */
export function writeAtlassianUrlToYaml(
  rawUrl: string,
  yamlPath: string = PROJECT_YAML_PATH,
): string {
  const normalized = normalizeAtlassianUrl(rawUrl);
  if (!normalized) {
    throw new Error(
      `Refusing to write a blank Atlassian instance URL (got ${JSON.stringify(rawUrl)}).`,
    );
  }
  if (!existsSync(yamlPath)) {
    throw new Error(`Cannot write the Atlassian instance: ${yamlPath} does not exist.`);
  }

  const lines = readFileSync(yamlPath, 'utf8').split('\n');
  let inIssueTracker = false;
  let written = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A column-0 key opens a new top-level section (and closes the previous one).
    if (/^[a-z_][\w-]*\s*:/i.test(line)) {
      inIssueTracker = /^issue_tracker\s*:/.test(line);
      continue;
    }
    if (!inIssueTracker) { continue; }
    // Head and value are matched in SEPARATE passes: a single pattern ending
    // `\s*)(.*)$` lets the two quantifiers exchange whitespace and backtrack
    // super-linearly (`scripts/agents-setup.ts:rewriteLeafLine` splits it for
    // the same reason).
    const head = /^(\s*atlassian_url\s*:)(\s*)/.exec(line);
    if (!head) { continue; }
    const rest = line.slice(head[0].length);

    // Preserve the trailing `# ...` comment; replace only the scalar. The
    // `TODO:` prefix is dropped once a real value lands, matching what
    // `agents-setup.ts` does — the two writers must produce the same line, or
    // every install churns the diff back and forth.
    const commentAt = findTrailingCommentStart(rest);
    let comment = '';
    if (commentAt !== -1) {
      let body = rest.slice(commentAt).trimEnd().replace(/^#+/, '').trim();
      if (body.startsWith('TODO:')) { body = body.slice('TODO:'.length).trim(); }
      comment = ` # ${body}`;
    }
    lines[i] = `${head[1]}${head[2] || ' '}${formatYamlScalar(normalized)}${comment}`;
    written = true;
    break;
  }

  if (!written) {
    throw new Error(
      `Could not find \`issue_tracker.atlassian_url\` in ${yamlPath}. `
      + 'The file is malformed or was hand-edited — fix it, or run `bun run agents:setup`.',
    );
  }

  writeFileSync(yamlPath, lines.join('\n'), 'utf8');
  return normalized;
}

/**
 * Quote a scalar the way `scripts/agents-setup.ts:formatYamlValue` would.
 *
 * A URL contains `:`, so that writer always quotes it. Emitting it bare here
 * would be equally valid YAML but would make every subsequent `bun run
 * agents:setup` rewrite the line — churn in a versioned file that reviewers
 * then have to read past. Same input, same bytes.
 */
function formatYamlScalar(v: string): string {
  const needsQuote = (
    v === ''
    || /^(?:null|true|false|yes|no|on|off|~)$/i.test(v)
    || /^-?\d/.test(v)
    || /[:#&*!|>'"%@`]/.test(v)
    || /^\s/.test(v)
    || /\s$/.test(v)
  );
  if (!needsQuote) { return v; }
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Index of the `#` that opens a trailing comment on a YAML scalar line, or -1.
 *
 * A `#` only opens a comment at the start of the value or after whitespace, so a
 * URL fragment (`https://host/#anchor`) is not mistaken for one, and a `#` inside
 * a quoted scalar is skipped.
 */
function findTrailingCommentStart(rest: string): number {
  let quote: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (quote !== null) {
      if (ch === quote) { quote = null; }
      continue;
    }
    if (ch === '"' || ch === '\'') { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(rest[i - 1]))) { return i; }
  }
  return -1;
}
