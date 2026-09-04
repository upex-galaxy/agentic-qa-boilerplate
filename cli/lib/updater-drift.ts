/**
 * @fileoverview Protected-file drift detection (feeds the parity report).
 *
 * Some files are deliberately NOT synced by the updater because every
 * downstream project adapts them (AI memory, env map, KATA bases, report
 * config, CI workflows, MCP registries, Claude permissions). But the
 * boilerplate keeps evolving those same files, so a downstream project would
 * silently miss the improvements forever.
 *
 * This module detects WHICH watchlist entries drifted. It NEVER edits any of
 * them. The watchlist is the upstream list plus the paths the project declares
 * in `.agents/project.yaml` -> `updater.protected_paths` (see
 * `projectProtectedPaths`); the wrapper also feeds every entry into the
 * updater's `bootstrapOnlyPaths`, so an entry inside a synced component is
 * delivered once when missing and never overwritten. Per entry it:
 *
 *  1. Reads the upstream copy from the template clone (tempDir).
 *  2. Short-circuits when the local copy already matches upstream
 *     (whitespace-insensitive) — nothing to migrate.
 *  3. Fires ONLY when the UPSTREAM content changed since the last advice,
 *     tracked by a content hash in `.template/upstream-sha/<slug>.sha`
 *     (one nudge per upstream change, never on dry-run — afterApply is
 *     skipped there).
 *
 * The advisory itself (section-level evidence, the copy-paste prompt, the
 * persisted `.agents/prompts/parity-plan.md`) is rendered by
 * `updater-parity.ts`, which folds these entries into the single end-of-run
 * parity report next to compat errors, MCP set drift and held-back components.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parse as parseYaml } from 'yaml';

// ============================================================================
// TYPES
// ============================================================================

export interface ProtectedWatchEntry {
  /** Repo-relative path, forward slashes (e.g. `allurerc.mjs`). */
  path: string
  /** One-line human reason shown in the advisory table (why it is protected). */
  reason: string
  /**
   * Override for the sha-marker file. `AGENTS.md` keeps the legacy
   * `.template/claude-md.upstream.sha` marker so repos that already received
   * the old single-file advisory are not re-nudged.
   */
  markerPath?: string
  /**
   * Compare STRUCTURE only (keys / headings): the file is project identity
   * (`.agents/project.yaml`, `.agents/jira-required.yaml`), so a value that
   * differs from upstream's own scaffold is not drift. The parity row fires
   * only for keys upstream added, labelled `informational`.
   */
  structural?: boolean
  /** Where the entry comes from: the upstream list, or `updater.protected_paths` in `.agents/project.yaml`. */
  source?: 'upstream' | 'project'
}

// ============================================================================
// PROJECT-DECLARED PROTECTION (`updater.protected_paths` in `.agents/project.yaml`)
// ============================================================================

/** Reason shown on drift rows for a project-declared entry. */
export const PROJECT_PROTECTED_REASON = 'declared in .agents/project.yaml -> updater.protected_paths (never overwritten; delivered once when missing)';

export interface ProjectProtectedPaths {
  /** Normalized repo-relative paths, in declaration order, deduplicated. */
  paths: string[]
  /** Entries ignored, each with the reason (reported, never fatal). */
  rejected: Array<{ value: string, reason: string }>
}

/**
 * `updater.protected_paths` from the text of `.agents/project.yaml`: a list of
 * repo-relative FILE paths the project wants kept as its own (a synced file it
 * merged by hand, e.g. `.husky/pre-push` before 8.2 or a customized skill).
 * A path outside the repo (absolute, `..`), under `.git`, a directory, or a
 * non-string is rejected with its reason; a missing block yields nothing.
 */
export function projectProtectedPaths(projectYaml: string | null): ProjectProtectedPaths {
  const out: ProjectProtectedPaths = { paths: [], rejected: [] };
  if (projectYaml === null || projectYaml.trim() === '') { return out; }
  let parsed: unknown;
  try { parsed = parseYaml(projectYaml); }
  catch (err) {
    out.rejected.push({ value: 'updater.protected_paths', reason: `cannot parse .agents/project.yaml: ${err instanceof Error ? err.message : String(err)}` });
    return out;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { return out; }
  const updater = (parsed as Record<string, unknown>).updater;
  if (updater === undefined || updater === null) { return out; }
  if (typeof updater !== 'object' || Array.isArray(updater)) {
    out.rejected.push({ value: 'updater', reason: 'must be a mapping with a protected_paths list' });
    return out;
  }
  const raw = (updater as Record<string, unknown>).protected_paths;
  if (raw === undefined || raw === null) { return out; }
  if (!Array.isArray(raw)) {
    out.rejected.push({ value: 'updater.protected_paths', reason: 'must be a list of repo-relative file paths' });
    return out;
  }
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || item.trim() === '') {
      out.rejected.push({ value: String(item), reason: 'not a path (expected a non-empty string)' });
      continue;
    }
    const normalized = item.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const reason = rejectProtectedPath(normalized);
    if (reason) { out.rejected.push({ value: item, reason }); continue; }
    if (seen.has(normalized)) { continue; }
    seen.add(normalized);
    out.paths.push(normalized);
  }
  return out;
}

/** Why a normalized path cannot be protected, or null when it can. */
function rejectProtectedPath(p: string): string | null {
  if (p === '' || p === '.') { return 'not a file path'; }
  if (p.startsWith('/') || p.startsWith('~') || /^[a-z]:\//i.test(p)) { return 'outside the repo (absolute path)'; }
  const segments = p.split('/');
  if (segments.includes('..')) { return 'outside the repo (`..` segment)'; }
  if (segments[0] === '.git') { return 'under .git'; }
  if (p.endsWith('/')) { return 'a directory (list each file)'; }
  return null;
}

/** Read `updater.protected_paths` from `<root>/.agents/project.yaml` (absent file = nothing). */
export function readProjectProtectedPaths(root: string): ProjectProtectedPaths {
  const file = path.join(root, '.agents', 'project.yaml');
  let text: string | null = null;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch { return { paths: [], rejected: [] }; }
  return projectProtectedPaths(text);
}

/**
 * The effective watchlist for a run: the upstream entries plus every valid
 * project-declared path that is not already listed. Project entries carry
 * `source: 'project'` and a fixed reason; upstream entries keep theirs.
 */
export function mergeProtectedWatchlist(upstream: readonly ProtectedWatchEntry[], projectPaths: readonly string[]): ProtectedWatchEntry[] {
  const known = new Set(upstream.map(e => e.path));
  const merged: ProtectedWatchEntry[] = upstream.map(e => ({ ...e, source: e.source ?? 'upstream' }));
  for (const p of projectPaths) {
    if (known.has(p)) { continue; }
    known.add(p);
    merged.push({ path: p, reason: PROJECT_PROTECTED_REASON, source: 'project' });
  }
  return merged;
}

/** Default marker directory for watchlist entries (one .sha file per entry). */
const MARKER_DIR = '.template/upstream-sha';

// ============================================================================
// PURE HELPERS (exported for tests)
// ============================================================================

/** Whitespace-insensitive normalization for the "already identical" short-circuit. */
export function normalizeForCompare(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/g, '\n');
}

/** Stable filesystem-safe slug for an entry path (marker filename). */
export function markerSlug(entryPath: string): string {
  return entryPath.replace(/\\/g, '/').replace(/[^a-z0-9.-]+/gi, '_');
}

/** Resolve the marker file for an entry (legacy override wins). */
export function resolveMarkerPath(entry: ProtectedWatchEntry, cwd: string): string {
  return path.join(cwd, entry.markerPath ?? path.join(MARKER_DIR, `${markerSlug(entry.path)}.sha`));
}

export interface DriftedEntry extends ProtectedWatchEntry {
  upstreamSha: string
  /** True when this is the first advice ever for this entry (no marker yet). */
  firstAdvice: boolean
}

/**
 * Detect which watchlist entries drifted: upstream exists, local exists,
 * local differs from upstream, and upstream changed since the last advice.
 * Pure with respect to markers — does NOT write them (see persistMarkers).
 */
export function detectProtectedDrift(
  entries: readonly ProtectedWatchEntry[],
  tempDir: string,
  cwd: string,
): DriftedEntry[] {
  const drifted: DriftedEntry[] = [];
  for (const entry of entries) {
    const upstreamPath = path.join(tempDir, entry.path);
    const localPath = path.join(cwd, entry.path);
    // Both copies must exist: no upstream → nothing canonical to port; no
    // local → the project intentionally removed it, not ours to resurrect.
    if (!fs.existsSync(upstreamPath) || !fs.existsSync(localPath)) { continue; }

    let upstreamContent: string;
    let localContent: string;
    try {
      upstreamContent = fs.readFileSync(upstreamPath, 'utf8');
      localContent = fs.readFileSync(localPath, 'utf8');
    }
    catch { continue; }

    // Project tracks the boilerplate verbatim → nothing to suggest.
    if (normalizeForCompare(upstreamContent) === normalizeForCompare(localContent)) { continue; }

    const upstreamSha = crypto.createHash('sha256').update(upstreamContent, 'utf8').digest('hex');
    let lastSha = '';
    try {
      const markerPath = resolveMarkerPath(entry, cwd);
      if (fs.existsSync(markerPath)) { lastSha = fs.readFileSync(markerPath, 'utf8').trim(); }
    }
    catch { /* unreadable marker — treat as first advice */ }

    if (lastSha === upstreamSha) { continue; } // no NEW upstream change since last nudge

    drifted.push({ ...entry, upstreamSha, firstAdvice: lastSha === '' });
  }
  return drifted;
}

/**
 * Persist the upstream sha markers for the advised entries so each upstream
 * change nudges exactly once, even if the user ignores the advice.
 * Non-fatal on write failure — worst case we advise again next run.
 */
export function persistMarkers(drifted: readonly DriftedEntry[], cwd: string): void {
  for (const entry of drifted) {
    try {
      const markerPath = resolveMarkerPath(entry, cwd);
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(markerPath, `${entry.upstreamSha}\n`);
    }
    catch { /* non-fatal */ }
  }
}
