/**
 * @fileoverview Append-only package.json sync handler.
 *
 * Mirror of `updater-ignore.ts` but JSON-aware. Surfaces upstream-only keys
 * inside the configured sections (default: `scripts`, `devDependencies`) and
 * appends them at the END of each section while preserving the user's existing
 * key order. Same-key/different-value drift is reported as FYI and NEVER
 * overwritten. Top-level keys outside the configured sections (`name`,
 * `version`, `dependencies`, `lint-staged`, etc.) stay byte-identical.
 *
 * Contract:
 *  - Compare upstream `package.json` against local section-by-section.
 *  - Surface upstream-only keys as `upstreamOnlyKeys` (safe append).
 *  - Surface same-key/different-value as `localOverrideKeys` (FYI only).
 *  - State tracks `appliedKeys` per (file, section) so an applied key never
 *    re-surfaces on subsequent runs (mirror of `appendedLines`).
 *
 * Parse / write rules:
 *  - Local indent detected from the existing file (defaults to 2 spaces).
 *  - Trailing-newline presence preserved.
 *  - CRLF / LF detected and normalised to the file's existing style.
 *  - Within each section, user's existing key order preserved; new keys
 *    appended at end, sorted alphabetically among themselves.
 *  - Sections not listed in the spec are passed through untouched.
 */

import type {
  PackageJsonDelta,
  PackageJsonSectionDelta,
  PackageJsonSpec,
  SyncStateV7,
} from './updater-types';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// PARSE HELPERS
// ============================================================================

export interface ParsedPackageJson {
  data: Record<string, unknown>
  indent: number
  hasTrailingNewline: boolean
  usesCrlf: boolean
}

/**
 * Detect indent from raw JSON text. Returns the number of spaces, or -1 when
 * the file uses tabs. Defaults to 2 when no indented line is found.
 * `stringifyPackageJson` interprets -1 as '\t'.
 */
export function detectIndent(raw: string): number {
  const lines = raw.split('\n');
  for (const line of lines) {
    if (line.length === 0) { continue; }
    const match = line.match(/^( +|\t)/);
    if (!match) { continue; }
    if (match[1].startsWith('\t')) { return -1; }
    return match[1].length;
  }
  return 2;
}

/**
 * Parse package.json and capture formatting metadata (indent, EOL, trailing
 * newline) so the rewrite can preserve it byte-for-byte outside the mutated
 * sections. Throws on parse failure — caller MUST catch.
 */
export function parsePackageJson(filePath: string): ParsedPackageJson {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const usesCrlf = /\r\n/.test(raw);
  const normalised = raw.replace(/\r\n/g, '\n');
  const hasTrailingNewline = normalised.endsWith('\n');
  const indent = detectIndent(normalised);
  const data = JSON.parse(normalised) as Record<string, unknown>;
  return { data, indent, hasTrailingNewline, usesCrlf };
}

/**
 * Stringify with the formatting metadata captured at parse time.
 */
export function stringifyPackageJson(parsed: ParsedPackageJson): string {
  const indentArg: string | number = parsed.indent === -1 ? '\t' : parsed.indent;
  let out = JSON.stringify(parsed.data, null, indentArg);
  if (parsed.hasTrailingNewline) { out += '\n'; }
  if (parsed.usesCrlf) { out = out.replace(/\n/g, '\r\n'); }
  return out;
}

/**
 * Extract a string-keyed object section. Returns empty object when section is
 * missing or not an object. Non-string values are skipped (defensive — scripts
 * and devDependencies are always string maps).
 */
export function getSection(data: Record<string, unknown>, section: string): Record<string, string> {
  const raw = data[section];
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') { out[k] = v; }
  }
  return out;
}

// ============================================================================
// DETECT
// ============================================================================

/**
 * Diff a local package.json against its upstream counterpart for every
 * configured section.
 *
 * Returns empty deltas (all four buckets empty) when the upstream or local
 * file is missing or unparseable. State's `appliedKeys` is subtracted from
 * `upstreamOnlyKeys` so previously-applied keys never re-surface.
 */
export function detectPackageJsonDelta(
  spec: PackageJsonSpec,
  repoRoot: string,
  templateDir: string,
  state: Pick<SyncStateV7, 'packageJsonSync'> | null,
): PackageJsonDelta {
  const upstreamPath = path.join(templateDir, spec.path);
  const localPath = path.join(repoRoot, spec.path);

  const emptySections: Record<string, PackageJsonSectionDelta> = {};
  for (const section of spec.sections) {
    emptySections[section] = {
      upstreamOnlyKeys: {},
      localOverrideKeys: {},
      localOnlyKeys: [],
      alreadyApplied: state?.packageJsonSync?.[spec.path]?.[section]?.appliedKeys ?? [],
    };
  }

  if (!fs.existsSync(upstreamPath) || !fs.existsSync(localPath)) {
    return { file: spec.path, sections: emptySections };
  }

  let upstream: ParsedPackageJson;
  let local: ParsedPackageJson;
  try {
    upstream = parsePackageJson(upstreamPath);
    local = parsePackageJson(localPath);
  }
  catch {
    return { file: spec.path, sections: emptySections };
  }

  const sections: Record<string, PackageJsonSectionDelta> = {};
  for (const section of spec.sections) {
    const upstreamMap = getSection(upstream.data, section);
    const localMap = getSection(local.data, section);
    const appliedKeys = state?.packageJsonSync?.[spec.path]?.[section]?.appliedKeys ?? [];
    const appliedSet = new Set(appliedKeys);
    const keptKeys = state?.packageJsonSync?.[spec.path]?.[section]?.keptKeys ?? {};

    const upstreamOnlyKeys: Record<string, string> = {};
    const localOverrideKeys: Record<string, { localValue: string, upstreamValue: string }> = {};
    const localOnlyKeys: string[] = [];

    for (const [key, upstreamValue] of Object.entries(upstreamMap)) {
      if (!(key in localMap)) {
        if (!appliedSet.has(key)) {
          upstreamOnlyKeys[key] = upstreamValue;
        }
        continue;
      }
      const localValue = localMap[key];
      if (localValue !== upstreamValue) {
        // Suppress keys the user already chose to keep ('mine') against this
        // exact upstream value. If upstream changed since, re-surface it.
        if (keptKeys[key] === upstreamValue) { continue; }
        localOverrideKeys[key] = { localValue, upstreamValue };
      }
    }

    for (const key of Object.keys(localMap)) {
      if (!(key in upstreamMap)) {
        localOnlyKeys.push(key);
      }
    }

    sections[section] = {
      upstreamOnlyKeys,
      localOverrideKeys,
      localOnlyKeys,
      alreadyApplied: [...appliedSet],
    };
  }

  return { file: spec.path, sections };
}

// ============================================================================
// APPLY
// ============================================================================

/**
 * Append selected keys to the local package.json under the configured sections.
 *
 * Caller passes the per-section values map (keyed by section name → { key:
 * upstreamValue }). Optionally, caller can restrict which keys to write via
 * `keysBySection` — when omitted, ALL keys present in `valuesBySection[section]`
 * are written.
 *
 * Ordering contract:
 *   - User's existing keys in each section keep their original order.
 *   - New keys appended AT THE END of the section, sorted alphabetically among
 *     themselves only (no global re-sort).
 *   - Sections absent in local are created at the end of the JSON object.
 *
 * Idempotency:
 *   - Keys already present locally (any value) are SKIPPED — never overwritten.
 *     Drift is FYI only; caller already filtered via `detectPackageJsonDelta`.
 *
 * Never removes local content. Never modifies sections outside `spec.sections`.
 *
 * Returns the keys actually written per section. Empty result means no fs
 * write occurred.
 */
export function applyPackageJsonAppend(
  spec: PackageJsonSpec,
  valuesBySection: Record<string, Record<string, string>>,
  repoRoot: string,
  keysBySection?: Record<string, string[]>,
): Record<string, string[]> {
  const filePath = path.join(repoRoot, spec.path);
  if (!fs.existsSync(filePath)) {
    return {};
  }

  let parsed: ParsedPackageJson;
  try {
    parsed = parsePackageJson(filePath);
  }
  catch {
    return {};
  }

  const written: Record<string, string[]> = {};
  let changed = false;

  for (const section of spec.sections) {
    const values = valuesBySection[section] ?? {};
    const explicitKeys = keysBySection?.[section];
    const keys = (explicitKeys ?? Object.keys(values))
      .filter(k => k in values)
      .slice()
      .sort();

    if (keys.length === 0) { continue; }

    const existingSection = parsed.data[section];
    const localMap = (existingSection !== null && typeof existingSection === 'object')
      ? { ...(existingSection as Record<string, unknown>) }
      : {};

    const writtenForSection: string[] = [];
    for (const key of keys) {
      if (key in localMap) { continue; } // never overwrite (drift is FYI only)
      localMap[key] = values[key];
      writtenForSection.push(key);
    }

    if (writtenForSection.length > 0) {
      parsed.data[section] = localMap;
      written[section] = writtenForSection;
      changed = true;
    }
  }

  if (!changed) {
    return {};
  }

  fs.writeFileSync(filePath, stringifyPackageJson(parsed));
  return written;
}

/**
 * Overwrite EXISTING keys in the local package.json with upstream values.
 *
 * Counterpart to `applyPackageJsonAppend` — that one only adds NEW keys and
 * never touches existing ones. This one is the explicit "use upstream" ('theirs')
 * resolution for diverged keys: it replaces the local value of a key that
 * already exists. Only keys present in `overridesBySection[section]` AND already
 * present locally are written (a missing local key is ignored — append handles
 * those). Key order is preserved (in-place replacement, no re-sort).
 *
 * Never adds new sections. Never removes keys. Preserves file formatting.
 *
 * Returns the keys actually overwritten per section. Empty result → no write.
 */
export function applyPackageJsonOverride(
  spec: PackageJsonSpec,
  overridesBySection: Record<string, Record<string, string>>,
  repoRoot: string,
): Record<string, string[]> {
  const filePath = path.join(repoRoot, spec.path);
  if (!fs.existsSync(filePath)) {
    return {};
  }

  let parsed: ParsedPackageJson;
  try {
    parsed = parsePackageJson(filePath);
  }
  catch {
    return {};
  }

  const written: Record<string, string[]> = {};
  let changed = false;

  for (const section of spec.sections) {
    const overrides = overridesBySection[section] ?? {};
    const keys = Object.keys(overrides);
    if (keys.length === 0) { continue; }

    const existingSection = parsed.data[section];
    if (existingSection === null || typeof existingSection !== 'object') { continue; }
    const localMap = existingSection as Record<string, unknown>;

    const writtenForSection: string[] = [];
    for (const key of keys) {
      if (!(key in localMap)) { continue; } // append handles brand-new keys
      localMap[key] = overrides[key];
      writtenForSection.push(key);
    }

    if (writtenForSection.length > 0) {
      written[section] = writtenForSection;
      changed = true;
    }
  }

  if (!changed) {
    return {};
  }

  fs.writeFileSync(filePath, stringifyPackageJson(parsed));
  return written;
}
