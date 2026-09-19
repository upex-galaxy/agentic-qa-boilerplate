/**
 * @fileoverview Additive merge of the Claude permission allow list.
 *
 * `.claude/settings.json` is bootstrap-only AND watched: delivered once when
 * missing, then project-owned and never overwritten, because the permissions,
 * the hook wiring and the env block are the project's. The cost was that a
 * skill shipped upstream arrived downstream WITHOUT the `Skill(<name>)` entry
 * that authorizes it, so the skill was installed and silently could not be
 * invoked — which happened to a skill added in this very repo.
 *
 * The fix is a set-union merge of ONE array: `permissions.allow`. Entries
 * upstream declares and the project lacks are appended. Everything else in the
 * file — `deny`, `ask`, `hooks`, `env`, `attribution`, any key at all — is read
 * and written back untouched.
 *
 * WHY NO MEMORY OF REMOVALS. A project that deliberately deleted an entry gets
 * it back on the next sync. That is accepted, deliberately: a deliberate
 * removal is re-expressible in `deny`, which nothing here touches, and `deny`
 * wins over `allow`. Remembering removals would mean a second state file
 * tracking absences — the expensive half of the `package.json` delta machinery
 * — to protect a case that already has a better expression.
 *
 * Relation to `updater-package.ts`: the JSON shape helpers are reused from
 * there (`parsePackageJson` / `stringifyPackageJson` are generic despite their
 * names: they capture indent, CRLF and trailing newline so the rewrite
 * preserves the file's formatting). The DELTA machinery is not reused, and
 * could not be: it is built on object keys with a same-key/different-value
 * bucket and per-key `appliedKeys` / `keptKeys` state. A string array has no
 * keys, no value to diverge — an entry is present or it is not — and the
 * no-memory decision above removes the state tracking entirely.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parsePackageJson, stringifyPackageJson } from './updater-package';

/** The file whose allow list is merged, and the array inside it. */
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';

export interface AllowListMerge {
  /** Entries upstream declares that the project lacked, in upstream's order. */
  added: string[]
  /** The file's new contents, or null when nothing was added (no write). */
  merged: string | null
}

/** The `permissions.allow` entries a parsed settings object declares. */
function readAllowList(data: Record<string, unknown>): string[] {
  const permissions = data.permissions;
  if (permissions === null || typeof permissions !== 'object') { return []; }
  const allow = (permissions as Record<string, unknown>).allow;
  if (!Array.isArray(allow)) { return []; }
  return allow.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Set-union the upstream allow list into the project's, appending the missing
 * entries at the END in upstream's own order — never reordering what is there,
 * never removing anything, never touching another key.
 *
 * Returns `merged: null` when there is nothing to add, when either file is
 * missing or unparseable, or when the project's file declares no `permissions`
 * object at all. That last case is deliberate: a settings file with no
 * permissions block is not a project that dropped an entry, it is a shape this
 * merge does not understand, and guessing at it would be a rewrite.
 */
export function mergeAllowList(repoRoot: string, templateDir: string): AllowListMerge {
  const localPath = path.join(repoRoot, CLAUDE_SETTINGS_FILE);
  const upstreamPath = path.join(templateDir, CLAUDE_SETTINGS_FILE);
  const nothing: AllowListMerge = { added: [], merged: null };
  if (!fs.existsSync(localPath) || !fs.existsSync(upstreamPath)) { return nothing; }

  let local: ReturnType<typeof parsePackageJson>;
  let upstream: ReturnType<typeof parsePackageJson>;
  try {
    local = parsePackageJson(localPath);
    upstream = parsePackageJson(upstreamPath);
  }
  catch {
    return nothing; // unparseable on either side: never rewrite a file we cannot read
  }

  const permissions = local.data.permissions;
  if (permissions === null || typeof permissions !== 'object' || Array.isArray(permissions)) { return nothing; }
  const localAllow = readAllowList(local.data);
  if (!Array.isArray((permissions as Record<string, unknown>).allow)) { return nothing; }

  const have = new Set(localAllow);
  const added = readAllowList(upstream.data).filter(entry => !have.has(entry));
  if (added.length === 0) { return nothing; }

  (permissions as Record<string, unknown>).allow = [...localAllow, ...added];
  return { added, merged: stringifyPackageJson(local) };
}

/**
 * Run the merge and write the result. Returns the entries added (empty when
 * nothing changed, so the caller can stay silent). The caller owns the backup:
 * this only writes when there is something to write.
 */
export function applyAllowListMerge(repoRoot: string, templateDir: string): string[] {
  const { added, merged } = mergeAllowList(repoRoot, templateDir);
  if (merged === null) { return []; }
  fs.writeFileSync(path.join(repoRoot, CLAUDE_SETTINGS_FILE), merged, 'utf-8');
  return added;
}
