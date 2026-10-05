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
 * reordered, and every other key — `ask`, `env`, `attribution`, any key at
 * all — is read and written back untouched.
 *
 * The hook wiring had the same freeze with a sharper edge: when upstream adds
 * a hook group that `agents:compat:check` REQUIRES (the route re-surface
 * `PostToolUse` group, ADR-0017), a frozen file fails that check at
 * pre-commit, pre-push and CI until someone edits it by hand. A project is
 * never blocked by boilerplate evolution, so `mergeHookGroups` is the same
 * additive merge for `hooks`: an upstream command the project lacks under the
 * same event and matcher is appended as a NEW group at the end of that event's
 * list. The project's own groups are never edited, reordered or removed, and a
 * command it does not want is declined by its exact text in
 * `updater.declined_hooks` (`readDeclinedHooks`). Only this file needs it:
 * `.codex/hooks.json` and the OpenCode plugin are framework files the sync
 * rewrites on every run.
 *
 * DUPLICATE KEYS. A git auto-merge of two branches that each added a hook can
 * leave the same event key twice in one object. `JSON.parse` keeps the LAST
 * value and drops the first without a word, so a rewrite built on it deletes
 * the project's hooks. Both merges read through `parseJsonKeepingDuplicates`,
 * which folds a repeated list into one (`readSettingsFile`).
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

import type { ParsedPackageJson } from './updater-package';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { hookScriptPath, stripJsonComments, stripTrailingCommas } from './agent-compatibility-contracts.ts';
import { detectIndent, stringifyPackageJson } from './updater-package';

/** The file whose permission lists are merged. */
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';

/** The OpenCode config whose permission denies are measured, never rewritten. */
export const OPENCODE_SETTINGS_FILE = 'opencode.jsonc';

/** Where a project declines an upstream deny entry, by its exact text. */
export const DECLINED_DENIES_KEY = 'updater.declined_denies';

/** Where a project declines an upstream hook command, by its exact text. */
export const DECLINED_HOOKS_KEY = 'updater.declined_hooks';

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

/** Assign as an own property even for `__proto__`, exactly like `JSON.parse` does. */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * What a repeated key keeps: two lists become one (the first's items, then the
 * second's that are not structurally identical to one already kept), two
 * objects merge key by key with the same rule, anything else is the last
 * value, which is what `JSON.parse` would have kept.
 */
function foldDuplicate(prior: unknown, next: unknown): unknown {
  if (Array.isArray(prior) && Array.isArray(next)) {
    const seen = new Set(prior.map(item => JSON.stringify(item)));
    return [...prior, ...next.filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) { return false; }
      seen.add(key);
      return true;
    })];
  }
  const priorObject = objectAt(prior);
  const nextObject = objectAt(next);
  if (priorObject !== null && nextObject !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(priorObject)) { setOwn(out, key, value); }
    for (const [key, value] of Object.entries(nextObject)) {
      setOwn(out, key, Object.hasOwn(out, key) ? foldDuplicate(out[key], value) : value);
    }
    return out;
  }
  return next;
}

const JSON_WHITESPACE = /[ \t\n\r]*/y;
// Control characters are left to `JSON.parse` of the token, which rejects them.
const JSON_STRING = /"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
const JSON_SCALAR = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;

/**
 * `JSON.parse` that keeps what a repeated object key would lose
 * (`foldDuplicate`), and names every key it folded as a dotted path
 * (`hooks.PostToolUse`). Throws `SyntaxError` on malformed JSON, like
 * `JSON.parse`; strict JSON only (no comments).
 */
export function parseJsonKeepingDuplicates(text: string): { data: unknown, duplicates: string[] } {
  const duplicates: string[] = [];
  let at = 0;
  const skipWhitespace = (): void => {
    JSON_WHITESPACE.lastIndex = at;
    JSON_WHITESPACE.exec(text);
    at = JSON_WHITESPACE.lastIndex;
  };
  const token = (pattern: RegExp, what: string): string => {
    pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (match === null) { throw new SyntaxError(`expected ${what} at offset ${at}`); }
    at = pattern.lastIndex;
    return match[0];
  };
  const expect = (char: string): void => {
    if (text[at] !== char) { throw new SyntaxError(`expected '${char}' at offset ${at}`); }
    at++;
  };
  const value = (where: string): unknown => {
    skipWhitespace();
    const char = text[at];
    if (char === '{') {
      at++;
      const out: Record<string, unknown> = {};
      skipWhitespace();
      if (text[at] === '}') { at++; return out; }
      for (;;) {
        skipWhitespace();
        const key = JSON.parse(token(JSON_STRING, 'a string key')) as string;
        skipWhitespace();
        expect(':');
        const path = where === '' ? key : `${where}.${key}`;
        const item = value(path);
        if (Object.hasOwn(out, key)) {
          duplicates.push(path);
          setOwn(out, key, foldDuplicate(out[key], item));
        }
        else { setOwn(out, key, item); }
        skipWhitespace();
        if (text[at] === ',') { at++; continue; }
        expect('}');
        return out;
      }
    }
    if (char === '[') {
      at++;
      const out: unknown[] = [];
      skipWhitespace();
      if (text[at] === ']') { at++; return out; }
      for (;;) {
        out.push(value(where));
        skipWhitespace();
        if (text[at] === ',') { at++; continue; }
        expect(']');
        return out;
      }
    }
    if (char === '"') { return JSON.parse(token(JSON_STRING, 'a string')); }
    return JSON.parse(token(JSON_SCALAR, 'a value'));
  };
  const data = value('');
  skipWhitespace();
  if (at !== text.length) { throw new SyntaxError(`unexpected content at offset ${at}`); }
  return { data, duplicates };
}

/** A settings file parsed with its formatting captured, plus the keys it repeated. */
interface SettingsFile extends ParsedPackageJson {
  duplicates: string[]
}

/**
 * Read a JSON settings file through `parseJsonKeepingDuplicates`, capturing
 * indent, CRLF and trailing newline so `stringifyPackageJson` writes it back
 * in the same shape. Throws when it is not a JSON object; the caller catches.
 */
function readSettingsFile(filePath: string): SettingsFile {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const usesCrlf = /\r\n/.test(raw);
  const normalised = raw.replace(/\r\n/g, '\n');
  const { data, duplicates } = parseJsonKeepingDuplicates(normalised);
  const object = objectAt(data);
  if (object === null) { throw new SyntaxError(`${filePath} is not a JSON object`); }
  return { data: object, indent: detectIndent(normalised), hasTrailingNewline: normalised.endsWith('\n'), usesCrlf, duplicates };
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

  let local: SettingsFile;
  let upstream: SettingsFile;
  try {
    local = readSettingsFile(localPath);
    upstream = readSettingsFile(upstreamPath);
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

/** One hook command, located by its event and matcher (`*` = every tool, or no matcher at all). */
export interface HookCommandRef {
  event: string
  matcher: string
  command: string
}

export interface HookGroupMerge {
  /** Upstream commands the project lacked, appended as new groups, in upstream's order. */
  added: HookCommandRef[]
  /** Upstream commands the project lacks and declined through `updater.declined_hooks`: left out. */
  declined: HookCommandRef[]
  /** Upstream commands whose hook script the project does not have: appending them would fail on every event. */
  skipped: HookCommandRef[]
  /** Keys the project's file repeated (`hooks.PostToolUse`), folded into one so no list is lost. */
  duplicatesFolded: string[]
  /** The file's new contents, or null when nothing changed (no write). */
  merged: string | null
}

/** Claude Code reads an absent, empty or `*` matcher as "every tool": one key for all three. */
function matcherKey(group: Record<string, unknown>): string {
  const matcher = group.matcher;
  return typeof matcher === 'string' && matcher !== '' ? matcher : '*';
}

/** The `command` strings of a group's hook entries (an entry of another type has none). */
function groupCommands(group: Record<string, unknown>): string[] {
  return Array.isArray(group.hooks) ? group.hooks.map(hook => objectAt(hook)?.command).filter((command): command is string => typeof command === 'string') : [];
}

/**
 * Append the upstream hook commands the project lacks, event by event.
 *
 * A command is present when ANY project group of the same event and matcher
 * runs it, so identity is (event, matcher, command): the same triple
 * `agents:compat:check` asserts. Each upstream group with at least one
 * missing command is appended at the END of the event's list as a new group:
 * upstream's own keys (`matcher`, ...) and only the missing hook entries. The
 * project's groups are never edited, reordered or removed; an absent `hooks`
 * object or event list is created; one of another shape (not an object, not
 * a list) is left alone, like the permission lists.
 *
 * Left out, and reported: a command the project declined by its exact text
 * (`declinedHooks`, read by `readDeclinedHooks`), and a command whose
 * repository-relative script (`hookScriptPath`) does not exist in the
 * project, because a hook pointing at a missing file fails on every event.
 *
 * Writes back (`merged` non-null) when something was appended OR the project's
 * file repeated a key: the fold is the repair, and a later rewrite through
 * `JSON.parse` would otherwise drop the first list.
 */
export function mergeHookGroups(
  repoRoot: string,
  templateDir: string,
  opts: { file?: string, declinedHooks?: readonly string[] } = {},
): HookGroupMerge {
  const file = opts.file ?? CLAUDE_SETTINGS_FILE;
  const nothing: HookGroupMerge = { added: [], declined: [], skipped: [], duplicatesFolded: [], merged: null };
  const localPath = path.join(repoRoot, file);
  const upstreamPath = path.join(templateDir, file);
  if (!fs.existsSync(localPath) || !fs.existsSync(upstreamPath)) { return nothing; }

  let local: SettingsFile;
  let upstream: SettingsFile;
  try {
    local = readSettingsFile(localPath);
    upstream = readSettingsFile(upstreamPath);
  }
  catch {
    return nothing; // unparseable on either side: never rewrite a file we cannot read
  }

  const added: HookCommandRef[] = [];
  const declined: HookCommandRef[] = [];
  const skipped: HookCommandRef[] = [];
  const declinedSet = new Set(opts.declinedHooks ?? []);
  const upstreamHooks = objectAt(upstream.data.hooks) ?? {};
  const localHooks = local.data.hooks === undefined ? {} : objectAt(local.data.hooks);

  if (localHooks !== null) {
    for (const [event, upstreamGroups] of Object.entries(upstreamHooks)) {
      if (!Array.isArray(upstreamGroups)) { continue; }
      const localGroups = localHooks[event];
      if (localGroups !== undefined && !Array.isArray(localGroups)) { continue; }
      const present = new Set<string>();
      for (const group of (localGroups ?? []) as unknown[]) {
        const object = objectAt(group);
        if (object === null) { continue; }
        for (const command of groupCommands(object)) { present.add(`${matcherKey(object)}\n${command}`); }
      }
      const appended: Record<string, unknown>[] = [];
      for (const group of upstreamGroups) {
        const object = objectAt(group);
        if (object === null || !Array.isArray(object.hooks)) { continue; }
        const matcher = matcherKey(object);
        const missing = object.hooks.filter((hook) => {
          const command = objectAt(hook)?.command;
          if (typeof command !== 'string' || present.has(`${matcher}\n${command}`)) { return false; }
          const ref = { event, matcher, command };
          if (declinedSet.has(command)) {
            declined.push(ref);
            return false;
          }
          const script = hookScriptPath(command);
          if (script !== null && !fs.existsSync(path.join(repoRoot, script))) {
            skipped.push(ref);
            return false;
          }
          added.push(ref);
          present.add(`${matcher}\n${command}`);
          return true;
        });
        if (missing.length > 0) { appended.push({ ...object, hooks: missing }); }
      }
      if (appended.length > 0) { setOwn(localHooks, event, [...((localGroups ?? []) as unknown[]), ...appended]); }
    }
    if (added.length > 0 && local.data.hooks === undefined) { local.data.hooks = localHooks; }
  }

  const duplicatesFolded = local.duplicates;
  if (added.length === 0 && duplicatesFolded.length === 0) { return { ...nothing, declined, skipped }; }
  return { added, declined, skipped, duplicatesFolded, merged: stringifyPackageJson(local) };
}

/** How a hook command reads in a row or a log line: `PostToolUse(*) node "..."`. */
export function formatHookCommand(ref: HookCommandRef): string {
  return `${ref.event}(${ref.matcher}) ${ref.command}`;
}

export interface DeclinedDenies {
  /** Entries (deny rules, or hook commands for `readDeclinedHooks`), by exact text, the project declined. */
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
  return readUpdaterList(root, 'declined_denies', `${DECLINED_DENIES_KEY} must be a list of deny entries, written exactly as in ${CLAUDE_SETTINGS_FILE}`);
}

/**
 * `updater.declined_hooks` from `<root>/.agents/project.yaml`: hook commands,
 * by exact text, the hook merge must not append. Same contract as
 * `readDeclinedDenies`: absent is empty, malformed is reported and ignored,
 * which fails toward MORE hooks (the ones `agents:compat:check` requires).
 */
export function readDeclinedHooks(root: string): DeclinedDenies {
  return readUpdaterList(root, 'declined_hooks', `${DECLINED_HOOKS_KEY} must be a list of hook commands, written exactly as in ${CLAUDE_SETTINGS_FILE}`);
}

/** One `updater.<leaf>` list of strings; `malformed` is the error for any other shape. */
function readUpdaterList(root: string, leaf: string, malformed: string): DeclinedDenies {
  const file = path.join(root, PROJECT_YAML);
  if (!fs.existsSync(file)) { return { entries: [] }; }
  let parsed: unknown;
  try { parsed = parseYaml(fs.readFileSync(file, 'utf-8')); }
  catch (err) { return { entries: [], error: `cannot parse ${PROJECT_YAML}: ${err instanceof Error ? err.message : String(err)}` }; }
  const updater = objectAt(parsed)?.updater;
  if (updater === undefined || updater === null) { return { entries: [] }; }
  const raw = objectAt(updater)?.[leaf];
  if (raw === undefined || raw === null) { return { entries: [] }; }
  if (!Array.isArray(raw) || raw.some(entry => typeof entry !== 'string')) {
    return { entries: [], error: malformed };
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
