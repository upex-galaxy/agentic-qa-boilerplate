/**
 * @fileoverview Ignore-file append-only sync handler (master plan §3.7).
 *
 * Phase A status: NEW FILE — exports `detectIgnoreDelta` and `applyIgnoreAppend`.
 * The Phase A wrapper does NOT yet consume this module. Phase C wires it into the
 * 5-phase flow (Phase 4.5 — between file selection and apply).
 *
 * Contract (master plan §3.7):
 *  - Compare upstream ignore-file (`.gitignore`, `.prettierignore`, future
 *    `.dockerignore`, ...) against local ignore-file line-by-line.
 *  - Surface lines present in upstream but absent locally as `upstreamOnlyLines`.
 *  - Surface lines present locally but absent upstream as `localOnlyLines` (FYI
 *    only — NEVER removed, never auto-edited).
 *  - State tracks `appendedLines` per ignore file in `state.ignoreFileSync[file]`
 *    so a line accepted once is never re-prompted on the next run.
 *
 * Parsing rules:
 *  - tokenize by line
 *  - normalize CRLF → LF
 *  - trim trailing whitespace per line
 *  - drop blank lines and `#`-comment lines from the comparison set
 *    (they are kept in the local file unchanged but are not "appendable")
 *  - compare by exact-string set (no glob expansion)
 *
 * Append rules:
 *  - locate or create a single sentinel block at end of file:
 *      # ===== Synced from boilerplate v7.0 =====
 *  - within the sentinel, group new lines under a dated sub-heading:
 *      # ----- 2026-05-21 (sync) -----
 *      /new/pattern/
 *  - if a sub-heading for today already exists inside the sentinel, append under it
 *  - never remove local lines, never modify lines outside the sentinel block
 */

import type { IgnoreDelta, IgnoreFileSpec, SyncStateV7 } from './updater-types';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';

import * as path from 'node:path';

// ============================================================================
// LINE TOKENISATION + COMPARABLE SET
// ============================================================================

/**
 * Split file contents into lines for comparison.
 * Normalises CRLF → LF and trims trailing whitespace per line. Keeps blanks
 * and comments in their original positions; downstream callers filter them out
 * via `isComparableLine` when building the upstream/local sets.
 */
export function tokeniseIgnoreFile(content: string): string[] {
  const normalised = content.replace(/\r\n/g, '\n');
  return normalised.split('\n').map(line => line.replace(/[ \t]+$/, ''));
}

/**
 * Return true when a line is a meaningful pattern (i.e. eligible for the
 * upstream-only / local-only comparison set). Blanks and `#` comments are
 * skipped from the comparison but preserved in the file.
 */
export function isComparableLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) { return false; }
  if (trimmed.startsWith('#')) { return false; }
  return true;
}

/**
 * Convert raw file contents into the set of comparable patterns it contains.
 * Order is preserved by insertion into a Set (caller can iterate deterministically).
 */
export function buildPatternSet(content: string): Set<string> {
  const out = new Set<string>();
  for (const line of tokeniseIgnoreFile(content)) {
    if (isComparableLine(line)) {
      out.add(line);
    }
  }
  return out;
}

// ============================================================================
// DETECT
// ============================================================================

/**
 * Diff a local ignore file against its upstream counterpart.
 *
 * Returns:
 *   - `upstreamOnlyLines`  — lines present in upstream not in local, minus any
 *                            line already in `state.ignoreFileSync[file].appendedLines`
 *                            (so previously-applied lines never re-surface).
 *   - `localOnlyLines`     — FYI only; never touched.
 *   - `alreadySynced`      — passthrough of the appendedLines set for reporting.
 *
 * Missing local file → every comparable upstream line is `upstreamOnlyLines`.
 * Missing upstream file → empty delta (nothing to sync).
 */
export function detectIgnoreDelta(
  spec: IgnoreFileSpec,
  repoRoot: string,
  templateDir: string,
  state: Pick<SyncStateV7, 'ignoreFileSync'> | null,
): IgnoreDelta {
  const upstreamPath = path.join(templateDir, spec.path);
  const localPath = path.join(repoRoot, spec.path);

  if (!fs.existsSync(upstreamPath)) {
    return {
      file: spec.path,
      upstreamOnlyLines: [],
      localOnlyLines: [],
      alreadySynced: state?.ignoreFileSync?.[spec.path]?.appendedLines ?? [],
    };
  }

  const upstreamContent = fs.readFileSync(upstreamPath, 'utf-8');
  const upstreamSet = buildPatternSet(upstreamContent);

  const localContent = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf-8') : '';
  const localSet = buildPatternSet(localContent);

  const previouslyAppended = new Set(
    state?.ignoreFileSync?.[spec.path]?.appendedLines ?? [],
  );

  const upstreamOnlyLines: string[] = [];
  for (const line of upstreamSet) {
    if (localSet.has(line)) { continue; }
    if (previouslyAppended.has(line)) { continue; }
    upstreamOnlyLines.push(line);
  }

  const localOnlyLines: string[] = [];
  for (const line of localSet) {
    if (!upstreamSet.has(line)) {
      localOnlyLines.push(line);
    }
  }

  return {
    file: spec.path,
    upstreamOnlyLines,
    localOnlyLines,
    alreadySynced: [...previouslyAppended],
  };
}

// ============================================================================
// APPEND
// ============================================================================

/**
 * Format for the dated sub-heading inside the sentinel block.
 * Stable, comparable string — used by `applyIgnoreAppend` to detect whether
 * today already has a sub-heading and re-use it instead of duplicating.
 */
export function formatDatedSubHeading(date: Date = new Date()): string {
  const iso = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return `# ----- ${iso} (sync) -----`;
}

/**
 * Find the position of the sentinel block start in the file, if any.
 * Returns the line index (0-based) of the sentinel comment, or -1 if absent.
 *
 * The sentinel is identified by `spec.sentinel` as a prefix of the trimmed line —
 * the suffix (e.g. " v7.0 =====") may vary across versions; only the prefix is
 * required to match for re-use.
 */
export function findSentinelLine(lines: string[], sentinelPrefix: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(sentinelPrefix)) {
      return i;
    }
  }
  return -1;
}

/**
 * Append selected lines to the local ignore file under the sentinel block.
 *
 * Idempotency contract:
 *   - If the sentinel block does not exist, create it at end of file with the
 *     canonical header (`spec.sentinel` + ' v7.0 ====='), then add today's
 *     dated sub-heading and the selected lines.
 *   - If the sentinel block exists but today's dated sub-heading does not,
 *     append the dated sub-heading + selected lines at the end of the file.
 *   - If today's dated sub-heading already exists, append selected lines
 *     immediately under it (preserving any prior lines for today).
 *   - Lines already present anywhere inside the sentinel block are de-duped.
 *
 * Never removes local content. Never modifies lines outside the sentinel block.
 *
 * Returns the list of lines that were actually written (excluding de-duped ones)
 * so the caller can update `state.ignoreFileSync[file].appendedLines`.
 */
export function applyIgnoreAppend(
  spec: IgnoreFileSpec,
  selected: string[],
  repoRoot: string,
  cliVersion: string = '7.0',
  date: Date = new Date(),
): string[] {
  if (selected.length === 0) {
    return [];
  }

  const filePath = path.join(repoRoot, spec.path);
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n')
    : '';

  const lines = existing === '' ? [] : existing.split('\n');
  const sentinelHeader = `${spec.sentinel} v${cliVersion} =====`;
  const datedSubHeading = formatDatedSubHeading(date);

  const sentinelIdx = findSentinelLine(lines, spec.sentinel);

  // Build a Set of every comparable line already anywhere in the file to
  // de-dup. Defensive: shouldn't happen if state was tracked correctly, but
  // ensures we never write a duplicate even if the user added the same line
  // manually between runs.
  const existingInFile = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) { continue; }
    existingInFile.add(line.replace(/[ \t]+$/, ''));
  }

  const toWrite: string[] = selected
    .map(l => l.replace(/[ \t]+$/, ''))
    .filter(l => l.length > 0 && !existingInFile.has(l));

  if (toWrite.length === 0) {
    // Nothing new to add (all selected lines already inside sentinel block).
    return [];
  }

  // Build the new content
  const out: string[] = [...lines];

  // Ensure the file ends with a single trailing blank line BEFORE sentinel insertion
  // so the sentinel block doesn't jam against the prior content.
  const trimEndIdx = (): void => {
    while (out.length > 0 && out[out.length - 1] === '') { out.pop(); }
  };

  if (sentinelIdx === -1) {
    // No sentinel yet — create at end of file
    trimEndIdx();
    if (out.length > 0) { out.push(''); }
    out.push(sentinelHeader);
    out.push(datedSubHeading);
    for (const line of toWrite) {
      out.push(line);
    }
    out.push(''); // trailing newline at EOF
  }
  else {
    // Sentinel already exists — find today's dated sub-heading inside it (if any)
    let datedIdx = -1;
    for (let i = sentinelIdx + 1; i < out.length; i++) {
      if (out[i].trim() === datedSubHeading) {
        datedIdx = i;
        break;
      }
    }

    if (datedIdx === -1) {
      // Append dated sub-heading + lines at end of file
      trimEndIdx();
      out.push('');
      out.push(datedSubHeading);
      for (const line of toWrite) {
        out.push(line);
      }
      out.push('');
    }
    else {
      // Insert lines under today's dated sub-heading, after any existing
      // entries already in today's block but before the next `# -----`
      // sub-heading (or before the trailing blank lines if this is the
      // last block in the file).
      let insertAt = out.length;
      for (let i = datedIdx + 1; i < out.length; i++) {
        if (out[i].trim().startsWith('# -----')) {
          insertAt = i;
          break;
        }
      }
      // Trim trailing blank lines from insertion point so we sit flush
      // with the last entry of today's block.
      while (insertAt > datedIdx + 1 && out[insertAt - 1] === '') {
        insertAt--;
      }
      out.splice(insertAt, 0, ...toWrite);
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, out.join('\n'));

  return toWrite;
}

// ============================================================================
// BLOB SHA HELPER
// ============================================================================

/**
 * Compute the git blob SHA of a file via `git hash-object`. Used to record
 * the upstream version sentinel for an ignore file at sync time so the next
 * run can detect upstream changes cheaply.
 *
 * Returns the 40-char SHA on success, or empty string on any failure (caller
 * tolerates a missing SHA — the appendedLines set remains the primary
 * de-dup mechanism).
 */
export function computeBlobSha(filePath: string): string {
  if (!fs.existsSync(filePath)) { return ''; }
  try {
    return execSync(
      `git hash-object "${filePath}"`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString().trim();
  }
  catch {
    return '';
  }
}
