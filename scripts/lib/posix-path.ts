/**
 * Repo-relative paths, always `/`-separated, whatever the platform.
 *
 * `node:path`'s `relative()` and `join()` emit `\` on Windows — including
 * Windows-with-bash, where `process.platform` is still `win32` even though the
 * shell is not. Three kinds of damage follow from letting that separator escape:
 *
 * 1. It reaches a COMMITTED, byte-compared artifact (`kata-manifest.json`,
 *    `.agents/skills/REGISTRY.md`). `kata:manifest:check` and
 *    `skills:registry:check` compare exact strings, so a Windows run fails the
 *    gate on an untouched tree — and a Windows dev who commits the regenerated
 *    artifact fails every mac and Linux gate instead.
 * 2. It reaches a compare against a `/`-written literal, which then silently
 *    never matches. Already shipped once: see the `toPosix` comment in
 *    `scripts/lint-vars.ts` and downstream issue #26.
 * 3. It reaches a user-facing message, which is merely ugly.
 *
 * Path GUARDS are deliberately not served here: a prefix check must compare in
 * the platform's own separator (`sep`), not a normalised one, so that a
 * `\`-separated candidate cannot slip past a `/`-written prefix.
 */

import { relative } from 'node:path';

/** Rewrite any Windows separators in an already-built path to `/`. */
export function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/** `relative(from, to)`, normalised to `/` so the result is platform-stable. */
export function relativePosix(from: string, to: string): string {
  return toPosix(relative(from, to));
}
