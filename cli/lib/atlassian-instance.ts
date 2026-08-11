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
 * The mismatch is not resolved in silence on purpose: `acli` and the Atlassian
 * MCP still read `ATLASSIAN_URL` directly, so a divergence is a live problem in
 * the rest of the toolchain even after this resolver picks the right host.
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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** `cli/lib/` -> repo root. */
const REPO_ROOT = join(import.meta.dir, '..', '..');
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
    + '`.agents/project.yaml` (source of truth, versioned), or set `ATLASSIAN_URL` '
    + 'in `.env` as a fallback. Run `bun run agents:setup` for an interactive walkthrough.',
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
 * Callers MUST surface this. A divergence means `acli`, the Atlassian MCP, and
 * anything else reading `ATLASSIAN_URL` directly are still pointed at the other
 * instance — this resolver only protects the scripts that call it.
 */
export function formatInstanceMismatchWarning(resolved: ResolvedAtlassianInstance): string | null {
  if (!resolved.mismatch) { return null; }
  const { yaml, env } = resolved.mismatch;
  return (
    `ATLASSIAN_URL (${env}) disagrees with .agents/project.yaml (${yaml}). `
    + `Using the yaml value: ${yaml}. `
    + 'The env value is likely a stale copy inherited by this process — `acli` and the '
    + 'Atlassian MCP still read it directly, so fix `.env` (or the shell that spawned '
    + 'this session) before running any write operation.'
  );
}
