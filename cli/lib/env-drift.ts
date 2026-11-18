/**
 * env-drift.ts — finds an inherited process variable that would shadow `.env`.
 *
 * varlock (the loader behind every MCP server and the test scripts) lets a
 * variable ALREADY present in the process environment win over the value in
 * `.env`, and no flag inverts that. So a stale value inherited from
 * the parent shell silently turns a corrected `.env` into a no-op, and a restart
 * does not clear it because the value is re-inherited every time. A stale
 * `ATLASSIAN_URL` once rebuilt `.context/PBI/` from a dead Jira site with exit
 * code 0 (upex-bunkai-tms, 2026-08-10); this module attacks the whole class.
 *
 * Two consumers, one rule:
 *   - `scripts/launch.ts` warns before a test run on a hit, and runs it.
 *   - `scripts/check-vars.ts` (`vars:env:check`, Rule 3) reports it in the gates.
 *
 * The rule:
 *   1. Ask varlock which schema items the process environment overrides
 *      (`varlock load --format json-full --agent` -> `overrideKeys`). Every value
 *      in that output is discarded on the spot; only names and the `isSensitive`
 *      flag survive this module. Undeclared keys are never listed. Under an outer
 *      `varlock run` the list is empty: varlock re-resolves from the files then.
 *   2. Compare each overridden NAME against the file value, `.env.local` over
 *      `.env` (varlock's precedence). Equal passes. A key that is absent or empty
 *      in both files passes too: the process is then the only source, which is
 *      legitimate (a CI secret, a value exported on purpose).
 *
 * NEVER PRINTS A VALUE. Callers decide what to show; the launcher shows lengths.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { providerResolvedKeysIn } from './secret-providers';
import { parseDotEnvPairs } from './variables-manifest';

/**
 * A process environment as this module reads it. Deliberately not
 * `NodeJS.ProcessEnv`: a host project (Next.js) may augment that type with
 * required keys, and `cli/**` must compile there too.
 */
export type EnvMap = Record<string, string | undefined>;

export interface VarlockOverrides {
  /** Schema items whose value comes from the process environment. */
  overrideKeys: string[]
  /** Schema items marked `@sensitive`. */
  sensitive: Set<string>
  /** Every item the schema declares (`.env.schema` + `.env.core.schema`). */
  declared: Set<string>
}

export interface DriftHit {
  name: string
  sensitive: boolean
  processValue: string
  fileValue: string
}

/** Absolute path of the varlock binary this repo pins, or null when `bun install` has not run. */
export function varlockBin(root: string, env: EnvMap = process.env): string | null {
  const PATH = [join(root, 'node_modules', '.bin'), env.PATH ?? ''].join(delimiter);
  return Bun.which('varlock', { PATH, cwd: root });
}

/**
 * Reads the item metadata of `varlock load --format json-full --agent`, keeping
 * names and flags only. Pure: takes the raw stdout so tests need no varlock.
 */
export function parseVarlockMetadata(stdout: string): VarlockOverrides | null {
  let blob: unknown;
  try { blob = JSON.parse(stdout); }
  catch { return null; }
  if (blob === null || typeof blob !== 'object') { return null; }
  const { overrideKeys, config } = blob as { overrideKeys?: unknown, config?: unknown };
  if (!Array.isArray(overrideKeys) || config === null || typeof config !== 'object') { return null; }
  const sensitive = new Set<string>();
  const declared = new Set<string>();
  for (const [name, item] of Object.entries(config as Record<string, { isSensitive?: unknown }>)) {
    declared.add(name);
    if (item?.isSensitive === true) { sensitive.add(name); }
  }
  return { overrideKeys: overrideKeys.filter((k): k is string => typeof k === 'string'), sensitive, declared };
}

/**
 * Runs `varlock load --format json-full --agent` in `root` with `env` as its
 * process environment. A value that fails validation still yields the metadata
 * (measured: exit 1 with the full JSON on stdout), so the exit code is not
 * consulted. Null when varlock is missing or prints no usable JSON (a schema
 * that does not parse): `varlock run` reports that itself.
 */
export function loadVarlockMetadata(root: string, env: EnvMap = process.env): VarlockOverrides | null {
  const bin = varlockBin(root, env);
  if (bin === null) { return null; }
  const res = spawnSync(bin, ['load', '--format', 'json-full', '--agent'], { cwd: root, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
  return typeof res.stdout === 'string' ? parseVarlockMetadata(res.stdout) : null;
}

/** File values as varlock layers them: `.env`, then `.env.local` on top. */
export function fileValues(root: string): Map<string, string> {
  const merged = parseDotEnvPairs(join(root, '.env'));
  for (const [name, value] of parseDotEnvPairs(join(root, '.env.local'))) { merged.set(name, value); }
  return merged;
}

/** True when the checkout has a `.env` or `.env.local` to compare against. */
export function hasEnvFiles(root: string): boolean {
  return existsSync(join(root, '.env')) || existsSync(join(root, '.env.local'));
}

/** Overridden names whose inherited value differs from a non-empty file value. */
export function findDrift(meta: VarlockOverrides, env: EnvMap, files: Map<string, string>): DriftHit[] {
  const hits: DriftHit[] = [];
  for (const name of meta.overrideKeys) {
    const fileValue = files.get(name) ?? '';
    const processValue = env[name];
    if (fileValue === '' || processValue === undefined || processValue === fileValue) { continue; }
    hits.push({ name, sensitive: meta.sensitive.has(name), processValue, fileValue });
  }
  return hits;
}

/**
 * The environment with the EMPTY inherited copies of the keys the secret
 * manager resolves removed. varlock lets any inherited variable win, an empty
 * one included, and GitHub Actions materializes every unset `secrets.X` as an
 * empty string: without this, a CI job that keeps today's per-variable secrets
 * beside `OP_SERVICE_ACCOUNT_TOKEN` would blank every vault value it did not
 * set. Only the overlay's own keys are touched, so a project without the
 * overlay keeps exactly the old behaviour. Returns the dropped NAMES.
 */
export function withoutEmptyProviderShadows(root: string, env: EnvMap): { env: EnvMap, dropped: string[] } {
  const dropped = providerResolvedKeysIn(root).filter(name => env[name] === '');
  if (dropped.length === 0) { return { env, dropped }; }
  const next: EnvMap = { ...env };
  for (const name of dropped) { delete next[name]; }
  return { env: next, dropped };
}
