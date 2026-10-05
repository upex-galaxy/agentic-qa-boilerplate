/**
 * @fileoverview Additive merge of the Claude permission allow and deny lists.
 *
 * `.claude/settings.json` is bootstrap-only AND watched: delivered once when
 * missing, then project-owned and never overwritten, because the permissions,
 * the hook wiring and the env block are the project's. The cost was that a
 * skill shipped upstream arrived downstream WITHOUT the `Skill(<name>)` entry
 * that authorizes it, so the skill was installed and silently could not be
 * invoked — which happened to a skill added in this very repo. The same
 * freeze kept the secret deny rules (`Read(.env)`, `Bash(printenv*)`, ...)
 * away from every project scaffolded before they shipped.
 *
 * The fix is a set-union merge of TWO arrays: `permissions.allow` and
 * `permissions.deny`. Entries upstream declares and the project lacks are
 * appended after the project's own, in upstream's order. Nothing is removed or
 * reordered, and every other key — `ask`, `hooks`, `env`, `attribution`, any
 * key at all — is read and written back untouched.
 *
 * WHY NO MEMORY OF REMOVALS. A project that deliberately deleted an entry gets
 * it back on the next sync. For `allow` that is accepted, deliberately: a
 * deliberate removal is re-expressible in `deny`, which wins over `allow`.
 * `deny` has no stronger list to express "not this one", so a project that
 * wants an upstream deny OFF says so by name in `.agents/project.yaml` ->
 * `updater.declined_denies` (`readDeclinedDenies`). The opt-out is per entry,
 * not per file: protecting the whole file would also stop every deny a later
 * release adds, which is the exposure this merge exists to close.
 *
 * `opencode.jsonc` is on the same watchlist but is never merged: it is JSONC
 * (comments, trailing commas) and its permission block is an ordered map where
 * the last matching rule wins, so a programmatic rewrite would lose the
 * project's comments and could reorder its rules. `opencodeDenyGap` measures
 * which upstream denies the project lacks and renders the block to paste; the
 * parity report carries it as a row.
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
import { parse as parseYaml } from 'yaml';
import { stripJsonComments, stripTrailingCommas } from './agent-compatibility-contracts.ts';
import { parsePackageJson, stringifyPackageJson } from './updater-package';

/** The file whose permission lists are merged. */
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';

/** The OpenCode config whose permission denies are measured, never rewritten. */
export const OPENCODE_SETTINGS_FILE = 'opencode.jsonc';

/** Where a project declines an upstream deny entry, by its exact text. */
export const DECLINED_DENIES_KEY = 'updater.declined_denies';

const PROJECT_YAML = '.agents/project.yaml';

export interface PermissionListMerge {
  /** `permissions.allow` entries upstream declares that the project lacked, in upstream's order. */
  allowAdded: string[]
  /** `permissions.deny` entries upstream declares that the project lacked and did not decline, in upstream's order. */
  denyAdded: string[]
  /** Upstream deny entries the project lacks and declined through `updater.declined_denies`: left out. */
  denyDeclined: string[]
  /** The file's new contents, or null when nothing was added (no write). */
  merged: string | null
}

/** The string entries of a list (none when it is not an array). */
function stringEntries(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** A parsed object's value at `key` when it is a plain object, else null. */
function objectAt(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Set-union the upstream allow and deny lists into the project's, appending
 * the missing entries at the END in upstream's own order — never reordering
 * what is there, never removing anything, never touching another key.
 *
 * Returns `merged: null` when there is nothing to add, when either file is
 * missing or unparseable, or when the project's file declares no `permissions`
 * object at all. That last case is deliberate: a settings file with no
 * permissions block is not a project that dropped an entry, it is a shape this
 * merge does not understand, and guessing at it would be a rewrite.
 *
 * Inside an existing `permissions` object the two lists differ on purpose.
 * An absent `allow` stays absent. An absent `deny` is CREATED when upstream
 * has a deny to add: a project that never wrote a deny list did not choose
 * against the secret denies, and the explicit way to choose against one is
 * `declinedDenies`. A list of another shape (not an array) is left alone.
 *
 * `declinedDenies` lists upstream deny entries, by exact text, the project
 * does not want (`readDeclinedDenies`). They are never appended and are
 * reported back in `denyDeclined` when upstream has them and the project
 * lacks them.
 */
export function mergePermissionLists(
  repoRoot: string,
  templateDir: string,
  opts: { declinedDenies?: readonly string[] } = {},
): PermissionListMerge {
  const localPath = path.join(repoRoot, CLAUDE_SETTINGS_FILE);
  const upstreamPath = path.join(templateDir, CLAUDE_SETTINGS_FILE);
  const nothing: PermissionListMerge = { allowAdded: [], denyAdded: [], denyDeclined: [], merged: null };
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

  const block = objectAt(local.data.permissions);
  if (block === null) { return nothing; }
  const upstreamBlock = objectAt(upstream.data.permissions) ?? {};

  let allowAdded: string[] = [];
  if (Array.isArray(block.allow)) {
    const localAllow = stringEntries(block.allow);
    const have = new Set(localAllow);
    allowAdded = stringEntries(upstreamBlock.allow).filter(entry => !have.has(entry));
    if (allowAdded.length > 0) { block.allow = [...localAllow, ...allowAdded]; }
  }

  let denyAdded: string[] = [];
  let denyDeclined: string[] = [];
  if (block.deny === undefined || Array.isArray(block.deny)) {
    const localDeny: unknown[] = Array.isArray(block.deny) ? block.deny : [];
    const have = new Set(stringEntries(localDeny));
    const declined = new Set(opts.declinedDenies ?? []);
    const missing = stringEntries(upstreamBlock.deny).filter(entry => !have.has(entry));
    denyDeclined = missing.filter(entry => declined.has(entry));
    denyAdded = missing.filter(entry => !declined.has(entry));
    if (denyAdded.length > 0) { block.deny = [...localDeny, ...denyAdded]; }
  }

  if (allowAdded.length === 0 && denyAdded.length === 0) { return { ...nothing, denyDeclined }; }
  return { allowAdded, denyAdded, denyDeclined, merged: stringifyPackageJson(local) };
}

/**
 * Run the merge and write the result. Returns what was added (empty lists
 * when nothing changed, so the caller can stay silent). The caller owns the
 * backup: this only writes when there is something to write.
 */
export function applyPermissionListMerge(
  repoRoot: string,
  templateDir: string,
  opts: { declinedDenies?: readonly string[] } = {},
): Omit<PermissionListMerge, 'merged'> {
  const { merged, ...result } = mergePermissionLists(repoRoot, templateDir, opts);
  if (merged !== null) { fs.writeFileSync(path.join(repoRoot, CLAUDE_SETTINGS_FILE), merged, 'utf-8'); }
  return result;
}

export interface DeclinedDenies {
  /** Deny entries, by exact text, the project declined. */
  entries: string[]
  /** Set when the key exists but is not a list of strings: names the problem, the run ignores the key. */
  error?: string
}

/**
 * `updater.declined_denies` from `<root>/.agents/project.yaml`. An absent file,
 * block or key is an empty list. A malformed value is reported and ignored,
 * which fails toward MORE denies, never fewer.
 */
export function readDeclinedDenies(root: string): DeclinedDenies {
  const file = path.join(root, PROJECT_YAML);
  if (!fs.existsSync(file)) { return { entries: [] }; }
  let parsed: unknown;
  try { parsed = parseYaml(fs.readFileSync(file, 'utf-8')); }
  catch (err) { return { entries: [], error: `cannot parse ${PROJECT_YAML}: ${err instanceof Error ? err.message : String(err)}` }; }
  const updater = objectAt(parsed)?.updater;
  if (updater === undefined || updater === null) { return { entries: [] }; }
  const raw = objectAt(updater)?.declined_denies;
  if (raw === undefined || raw === null) { return { entries: [] }; }
  if (!Array.isArray(raw) || raw.some(entry => typeof entry !== 'string')) {
    return { entries: [], error: `${DECLINED_DENIES_KEY} must be a list of deny entries, written exactly as in ${CLAUDE_SETTINGS_FILE}` };
  }
  return { entries: raw as string[] };
}

export interface OpencodeDenyGap {
  /** Upstream `deny` rules the project's permission block lacks, grouped by tool, in upstream's order. */
  missing: { tool: string, patterns: string[] }[]
  /** JSONC the operator pastes into the project's `permission` block. */
  block: string
}

function parseJsonc(file: string): Record<string, unknown> | null {
  try {
    return objectAt(JSON.parse(stripTrailingCommas(stripJsonComments(fs.readFileSync(file, 'utf-8')))));
  }
  catch { return null; }
}

/**
 * The upstream `permission.<tool>` patterns whose action is `deny` and that
 * the project's `opencode.jsonc` does not mention at all, or null when there
 * is no gap (or either file is missing or unparseable).
 *
 * A pattern the project already lists, WHATEVER its action, is the project's
 * decision and is not reported: that is OpenCode's opt-out, set the pattern to
 * `ask` or `allow` yourself. A tool the project declares as a single action
 * (`"bash": "ask"`) has no map to append to: the block opens that tool's map
 * with `"*": "<that action>"` so pasting it keeps the project's default.
 * Upstream exceptions that follow a missing deny in the same map travel with
 * it in the block (not in `missing`), so pasting keeps upstream's order.
 */
export function opencodeDenyGap(root: string, upstreamDir: string): OpencodeDenyGap | null {
  const localFile = path.join(root, OPENCODE_SETTINGS_FILE);
  const upstreamFile = path.join(upstreamDir, OPENCODE_SETTINGS_FILE);
  if (!fs.existsSync(localFile) || !fs.existsSync(upstreamFile)) { return null; }
  const local = parseJsonc(localFile);
  const upstream = parseJsonc(upstreamFile);
  if (local === null || upstream === null) { return null; }
  const upstreamPermission = objectAt(upstream.permission) ?? {};
  const localPermission = objectAt(local.permission) ?? {};

  const missing: OpencodeDenyGap['missing'] = [];
  const lines: string[] = [
    `// Paste into "permission" in ${OPENCODE_SETTINGS_FILE}: append each entry at the END of`,
    '// that tool\'s map (OpenCode applies the last matching rule), creating the map when absent.',
  ];
  for (const [tool, rules] of Object.entries(upstreamPermission)) {
    const upstreamRules = objectAt(rules);
    if (upstreamRules === null) { continue; }
    const localValue = localPermission[tool];
    const localRules = objectAt(localValue) ?? {};
    const patterns: string[] = [];
    const entries: [string, string][] = [];
    for (const [pattern, action] of Object.entries(upstreamRules)) {
      if (action === 'deny' && !(pattern in localRules)) {
        patterns.push(pattern);
        entries.push([pattern, 'deny']);
      }
      else if (patterns.length > 0 && action !== 'deny' && typeof action === 'string') {
        // An exception upstream places AFTER a deny the block appends
        // (`"*.env.example": "allow"` after `"*.env.*": "deny"`) must follow it
        // again, or the last-match rule turns the exception into a deny. The
        // project's own action wins when it lists the pattern.
        const own = localRules[pattern];
        entries.push([pattern, typeof own === 'string' ? own : action]);
      }
    }
    if (patterns.length === 0) { continue; }
    missing.push({ tool, patterns });
    lines.push(`${JSON.stringify(tool)}: {`);
    if (typeof localValue === 'string') { lines.push(`  "*": ${JSON.stringify(localValue)},`); }
    for (const [pattern, action] of entries) { lines.push(`  ${JSON.stringify(pattern)}: ${JSON.stringify(action)},`); }
    lines.push('},');
  }
  return missing.length === 0 ? null : { missing, block: lines.join('\n') };
}
