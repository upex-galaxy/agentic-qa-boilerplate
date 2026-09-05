/**
 * @fileoverview Parity report after `bun run up`: ONE table of what still
 * differs from upstream per surface, with concrete evidence, and ONE prompt the
 * user hands to their AI so every row gets a decision (keep project | take
 * upstream | merge) BEFORE anything is edited.
 *
 * Inputs are collected by the wrapper at afterApply time, while the upstream
 * clone is still on disk:
 *
 *  - protected watchlist entries that drifted this run (`updater-drift.ts`);
 *  - the compatibility check (`checkAgentCompatibility`): its errors are the
 *    only BLOCKING findings, and the MCP set errors are folded per host. When a
 *    compat error and a watched-file drift name the SAME path, they fold into
 *    one row (compat evidence first, drift evidence appended);
 *  - skills the cross-harness migration archived because `.agents/skills/`
 *    already owned the name (this run's, plus any archive dir entry that has
 *    not been nudged yet; one marker per skill under `.template/upstream-sha/`);
 *  - command wrappers no manifest produced (upstream manifest, plus the
 *    optional project overlay `command-aliases.project.json`), ONE row per
 *    path whether the compat check named it or the disk scan found it;
 *  - components held back this run, with their lock commits;
 *  - `.env` keys upstream documents and the project lacks;
 *  - the `git_strategy` provenance stamp in `.agents/project.yaml`.
 *
 * Rules: no finding without evidence (a heading, a key, a server id, a count);
 * ids are sequential per run; the prompt speaks in headings and sections,
 * never in rule numbers. Full diffs go to the saved file, never to the terminal.
 * A `merge` on a watched file always says what to port and what to keep (the
 * upstream additions vs the project-only keys or sections); a structural
 * (identity) file compares keys only and fires, labelled `informational`, for
 * upstream additions alone.
 */

import type { CompatibilityErrorGroup } from './agent-compatibility.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { stripJsonComments } from './agent-compatibility-contracts.ts';
import { COMMAND_ALIAS_MANIFEST, COMMAND_ALIAS_PROJECT_MANIFEST, compatibilityErrorGroup, undeclaredCommandWrappers } from './agent-compatibility.ts';

// ============================================================================
// TYPES
// ============================================================================

export type ParitySurface = 'instructions' | 'skills' | 'commands' | 'hooks' | 'mcp' | 'env' | 'components' | 'package' | 'git' | 'gates';

/**
 * `take upstream` is reserved for content the project lacks entirely. A row
 * whose evidence names something only the project has (a server, a key, a
 * heading, an edit) suggests `merge`: following `take upstream` literally
 * there would delete it.
 */
export type ParitySuggestion
  = 'keep project' | 'take upstream' | 'merge' | 'add to overlay' | 'run agents:compat' | 'decide';

export interface ParityFinding {
  id: number
  surface: ParitySurface
  path: string
  /** Concrete, scannable: headings, keys, server ids, counts. Never a diff. */
  evidence: string
  suggested: ParitySuggestion
  /** Blocking = a failed compatibility contract. Watched-file drift never blocks. */
  blocking: boolean
  /** Full paired diff, written to the saved file under the finding's heading. */
  diff?: string
  /** Plain-text detail (gate output, the two package.json values), written to the saved file when there is no diff. */
  detail?: string
  /** A follow-up the saved file repeats under the row (how to keep a merge on the next sync). */
  note?: string
}

/** A synced file the project had edited that this run overwrote (`RunSummary.localEditsOverwritten`). */
export interface LocalEditInput {
  path: string
  component: string
  /** Absolute path of the pre-write backup copy, or null when none was written. */
  backupPath: string | null
}

export interface PackageJsonKeptInput {
  file: string
  section: string
  key: string
  localValue: string
  upstreamValue: string
}

/** Outcome of one quality gate the wrapper ran after the apply (`types:check`, `lint:check`). */
export interface GateResult {
  script: string
  status: 'pass' | 'fail' | 'timeout' | 'error'
  exitCode: number | null
  /** Seconds the gate took. */
  seconds: number
  errorCount: number
  /** The first error lines of the output, already trimmed. */
  firstErrors: string[]
  /** Repo-relative paths named by the errors that THIS run applied. */
  failingApplied: string[]
  /** Complete combined output, for the saved file. */
  output: string
}

export interface ParityDriftInput {
  path: string
  reason: string
  /** Compare keys only (project identity file): a row for upstream additions, none for value differences. */
  structural?: boolean
  /** `project` = declared in `updater.protected_paths`: a synced component file, so its row sits on Skills or Componentes. */
  source?: 'upstream' | 'project'
}

export interface HeldBackComponent {
  component: string
  lockCommit: string | null
}

export interface ParityInput {
  /** Project root (the consumer repo). */
  root: string
  /** Upstream clone directory, still on disk during afterApply. */
  upstreamDir: string
  /** Watchlist entries that drifted this run (already filtered by the sha markers). */
  drift: ParityDriftInput[]
  /** `checkAgentCompatibility().errors`. */
  compatErrors: string[]
  /** Skills to report as archived (names only); see `archivedSkillsToReport`. */
  archivedSkills: string[]
  /** Directory holding the archived skills (`<MIGRATION_BACKUP_DIR>/skills`). */
  archivedSkillsDir: string
  heldBack: HeldBackComponent[]
  /** Keys upstream `.env.example` documents that the project's `.env` / `.env.example` lack. */
  envNewKeys: string[]
  /** Project-edited synced files this run overwrote. */
  localEdits?: LocalEditInput[]
  /** `package.json` keys kept at the project's value while upstream differs. */
  packageJsonKept?: PackageJsonKeptInput[]
  /** Quality gates run after the apply; only failed / timed-out ones become rows. */
  gates?: GateResult[]
  /** A legacy git-tracked `.context/PBI/` cache (see `updater-pbi.ts`): one row, the recipe in its file. */
  pbiCache?: PbiCacheInput | null
}

export interface PbiCacheInput {
  /** Tracked paths outside the committed allowlist. */
  tracked: number
  /** Repo-relative path of the saved migration recipe. */
  recipePath: string
}

export interface ParityMeta {
  templateRepo: string
  upstreamSha: string
  lockSha: string
  /** Repo-relative path of the saved prompt file (named inside the prompt). */
  promptFile: string
}

export type SurfaceState = 'ok' | 'warn' | 'blocked';

export interface SurfaceRow {
  surface: ParitySurface
  label: string
  state: SurfaceState
  cell: string
}

export interface ParityReport {
  /** One row per surface, in `SURFACE_ORDER`; the wrapper renders them with `tui.table`. */
  surfaces: SurfaceRow[]
  prompt: string
  fileBody: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const PARITY_PROMPT_PATH = path.join('.agents', 'prompts', 'parity-plan.md');
/** One marker per archived skill, next to the watchlist sha markers (gitignored). */
const ARCHIVED_SKILL_MARKER_DIR = path.join('.template', 'upstream-sha');
const WRAPPER_UNDECLARED_EVIDENCE = `wrapper not produced by ${COMMAND_ALIAS_MANIFEST} nor ${COMMAND_ALIAS_PROJECT_MANIFEST}`;

const MCP_HOST_FILE: Record<string, string> = {
  claude: '.mcp.json',
  opencode: 'opencode.jsonc',
  codex: '.codex/config.toml',
};

/** Order of the surfaces in every table. */
export const SURFACE_ORDER: ParitySurface[] = ['instructions', 'skills', 'commands', 'hooks', 'mcp', 'env', 'components', 'package', 'git', 'gates'];

/** English labels for the prompt (the AI reads it). */
const SURFACE_LABEL_EN: Record<ParitySurface, string> = {
  instructions: 'Instructions',
  skills: 'Skills',
  commands: 'Commands',
  hooks: 'Hooks',
  mcp: 'MCP',
  env: 'Env',
  components: 'Components',
  package: 'package.json',
  git: 'Git',
  gates: 'Gates',
};

/** Spanish labels for the terminal table (the human reads it). */
const SURFACE_LABEL_ES: Record<ParitySurface, string> = {
  instructions: 'Instrucciones y config',
  skills: 'Skills',
  commands: 'Comandos',
  hooks: 'Hooks',
  mcp: 'MCP',
  env: 'Env',
  components: 'Componentes',
  package: 'package.json',
  git: 'Git',
  gates: 'Verificación',
};

/** The other two MCP registries a host's project-only server must be declared in. */
function otherMcpHostFiles(host: string): string {
  return Object.entries(MCP_HOST_FILE).filter(([id]) => id !== host).map(([, file]) => file).join(' and ');
}

const MAX_NAMES = 3;

/** Appended to every overwritten-edit row: the one-line fix that makes the next sync keep the merge. */
export const PROTECT_HINT = 'add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge';

/** The same fix, spelled out as the YAML to paste, repeated under the row in the saved file. */
export function protectNote(filePath: string): string {
  return [
    `Keep this merge on the next sync: ${PROTECT_HINT}:`,
    '',
    '    updater:',
    '      protected_paths:',
    `        - ${filePath}`,
  ].join('\n');
}

// ============================================================================
// DIFF HELPERS
// ============================================================================

export interface DiffStats {
  hunks: number
  added: number
  removed: number
}

/** Hunk / line counts of a unified diff. */
export function diffStats(diff: string): DiffStats {
  let hunks = 0;
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) { hunks += 1; }
    else if (line.startsWith('+') && !line.startsWith('+++')) { added += 1; }
    else if (line.startsWith('-') && !line.startsWith('---')) { removed += 1; }
  }
  return { hunks, added, removed };
}

/**
 * `git diff --no-index` between two paths (files or directories), uncolored,
 * `+` = what `b` has. Absolute paths in the headers are replaced by the labels
 * so the saved file reads `project/AGENTS.md` -> `upstream/AGENTS.md`, not two
 * temp-dir paths. Git prints header paths with forward slashes on every
 * platform, so a Windows `a` / `b` is normalized the same way before the
 * relabel, or the temp-dir paths would survive there. Returns '' when the
 * paths are identical or git is unavailable.
 */
export function diffNoIndex(a: string, b: string, labels: { a: string, b: string } = { a: 'project', b: 'upstream' }): string {
  const res = spawnSync('git', ['diff', '--no-index', '--no-color', '--', a, b], { encoding: 'utf8' });
  let out = res.stdout ?? '';
  const relabel = (raw: string, label: string): void => {
    const needle = raw.replace(/\\/g, '/');
    const replacement = `/${label}/${path.basename(needle)}`;
    for (const form of new Set([needle, raw])) { out = out.split(form).join(replacement); }
  };
  relabel(a, labels.a);
  relabel(b, labels.b);
  return out;
}

function formatStats(stats: DiffStats): string {
  return `${stats.hunks} hunk${stats.hunks === 1 ? '' : 's'} (+${stats.added}/-${stats.removed})`;
}

function listNames(names: string[]): string {
  const shown = names.slice(0, MAX_NAMES).map(n => `"${n}"`).join(', ');
  return names.length > MAX_NAMES ? `${shown} +${names.length - MAX_NAMES} more` : shown;
}

// ============================================================================
// SECTION-LEVEL EVIDENCE
// ============================================================================

const HEADING_RE = /^#{1,3}\s+/;

/** Markdown sections keyed by heading (levels 1-3). Body is whitespace-normalized. */
export function markdownSections(text: string): Map<string, string> {
  const sections = new Map<string, string[]>();
  let current = '';
  sections.set(current, []);
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (HEADING_RE.test(line)) {
      current = line.replace(HEADING_RE, '').trim();
      // A repeated heading gets a suffix so both bodies survive the comparison.
      let key = current;
      for (let n = 2; sections.has(key); n += 1) { key = `${current} (${n})`; }
      current = key;
      sections.set(current, []);
      continue;
    }
    sections.get(current)!.push(line.trimEnd());
  }
  return new Map([...sections].map(([k, v]) => [k, v.join('\n').trim()]));
}

export interface SectionDelta {
  added: string[]
  removed: string[]
  changed: string[]
}

// A separator swap alone (`## A — B` vs `## A: B`) is not a heading change:
// collapse the four interchangeable forms to one canonical token before
// comparing. Whitespace is trimmed and collapsed too, so stray double spaces
// never cause a false added/removed pair. Case-sensitive otherwise — this is
// a comparison key, never shown to the user.
const HEADING_SEPARATOR_RE = / — | – | - |:\s*/g;
/** Canonical stand-in for any of the four separator forms above. */
const HEADING_SEPARATOR_CANONICAL = ' :: ';

function normalizeHeadingKey(heading: string): string {
  return heading
    .trim()
    .replace(/\s+/g, ' ')
    .replace(HEADING_SEPARATOR_RE, HEADING_SEPARATOR_CANONICAL)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Headings upstream added / project-only / present in both with a different body. */
export function markdownSectionDelta(project: string, upstream: string): SectionDelta {
  const mine = markdownSections(project);
  const theirs = markdownSections(upstream);
  // Normalized key -> the project's own heading text, for matching across a
  // punctuation-only rename.
  const mineByKey = new Map<string, string>();
  for (const heading of mine.keys()) {
    if (heading === '') { continue; }
    mineByKey.set(normalizeHeadingKey(heading), heading);
  }

  const added: string[] = [];
  const changed: string[] = [];
  for (const [heading, body] of theirs) {
    if (heading === '') { continue; }
    const mineHeading = mineByKey.get(normalizeHeadingKey(heading));
    if (mineHeading === undefined) { added.push(heading); }
    else if (mine.get(mineHeading) !== body) { changed.push(heading); }
  }
  const theirsKeys = new Set([...theirs.keys()].filter(h => h !== '').map(normalizeHeadingKey));
  const removed = [...mine.keys()].filter(h => h !== '' && !theirsKeys.has(normalizeHeadingKey(h)));
  return { added, removed, changed };
}

/**
 * Entries of a structured config, two levels deep (`top`, `top.child` when the
 * child is a plain object), key -> value. Two levels is where MCP registries,
 * permission blocks and `git_strategy` live; deeper is noise. YAML falls back
 * to a line scan (keys only) when the parser rejects the text.
 */
export function configEntries(text: string, filePath: string): Map<string, unknown> | null {
  const ext = path.extname(filePath).toLowerCase();
  let parsed: unknown;
  try {
    if (ext === '.json') { parsed = JSON.parse(text); }
    else if (ext === '.jsonc') { parsed = JSON.parse(stripJsonComments(text).replace(/,(\s*[}\]])/g, '$1')); }
    else if (ext === '.toml') { parsed = Bun.TOML.parse(text); }
    else if (ext === '.yaml' || ext === '.yml') {
      try { parsed = parseYaml(text); }
      catch { return new Map(yamlKeys(text).map(k => [k, undefined])); }
    }
    else { return null; }
  }
  catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { return null; }
  const entries = new Map<string, unknown>();
  for (const [top, value] of Object.entries(parsed as Record<string, unknown>)) {
    entries.set(top, value);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [child, childValue] of Object.entries(value as Record<string, unknown>)) { entries.set(`${top}.${child}`, childValue); }
    }
  }
  return entries;
}

/** Keys of a structured config, two levels deep (see `configEntries`). */
export function configKeys(text: string, filePath: string): string[] | null {
  const entries = configEntries(text, filePath);
  return entries ? [...entries.keys()] : null;
}

/** Top-level and first-nested YAML keys (block style, 2-space indent), no parser needed. */
function yamlKeys(text: string): string[] {
  const keys: string[] = [];
  let top = '';
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const topMatch = /^([\w.-]+):/.exec(line);
    if (topMatch) { top = topMatch[1]; keys.push(top); continue; }
    const childMatch = /^ {2}([\w.-]+):/.exec(line);
    if (childMatch && top !== '') { keys.push(`${top}.${childMatch[1]}`); }
  }
  return keys;
}

export interface KeyDelta {
  added: string[]
  projectOnly: string[]
  /**
   * Keys both copies have with a different value. A top key whose children
   * are entries of their own counts through them only; a nested object (an
   * MCP server entry under `mcpServers` / `mcp` / `mcp_servers`) is compared
   * whole, args, env and url included.
   */
  changed: string[]
  /** For each `changed` key holding an object on both sides: which fields differ (`args differ`, `env keys differ`). */
  changedDetail: Record<string, string>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `a`, `a and b`, `a, b and c`. */
function joinAnd(items: string[]): string {
  if (items.length <= 1) { return items.join(''); }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Field order in an object-diff phrase: what an MCP server entry is made of, then the rest alphabetically. */
const OBJECT_FIELD_ORDER = ['type', 'transport', 'command', 'args', 'url', 'headers', 'env', 'env_vars', 'environment', 'enabled', 'disabled'];

/**
 * Which fields of two objects differ, as one phrase: `args differ`,
 * `args and env keys differ`, `command, args and url differ`. An env table
 * (`env`, `env_vars`, `environment`) is compared by key set first: `env keys
 * differ` when the variable names differ, `env values differ` when only the
 * values do.
 */
function describeObjectDelta(mine: Record<string, unknown>, theirs: Record<string, unknown>): string {
  const rank = (field: string): number => {
    const at = OBJECT_FIELD_ORDER.indexOf(field);
    return at === -1 ? OBJECT_FIELD_ORDER.length : at;
  };
  const fields = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const differing: string[] = [];
  for (const field of fields) {
    const own = mine[field];
    const other = theirs[field];
    if (stableValue(own) === stableValue(other)) { continue; }
    if ((field === 'env' || field === 'env_vars' || field === 'environment') && isPlainObject(own) && isPlainObject(other)) {
      const sameKeys = stableValue(Object.keys(own).sort()) === stableValue(Object.keys(other).sort());
      differing.push(sameKeys ? `${field} values` : `${field} keys`);
      continue;
    }
    differing.push(field);
  }
  return `${joinAnd(differing)} differ`;
}

/**
 * The changed keys as evidence: scalars by name (`values differ at: "a.x"`),
 * object entries by what differs inside (`context7: args differ`), at most
 * `MAX_NAMES` of each named, the rest counted.
 */
function describeChangedKeys(changed: string[], detail: Record<string, string>): string {
  const scalars = changed.filter(k => !(k in detail));
  const objects = changed.filter(k => k in detail);
  const parts: string[] = [];
  if (scalars.length > 0) { parts.push(`values differ at: ${listNames(scalars)}`); }
  if (objects.length > 0) {
    // The entry's own name: the key minus the registry it sits under.
    const shown = objects.slice(0, MAX_NAMES).map(k => `${k.slice(k.indexOf('.') + 1)}: ${detail[k]}`).join('; ');
    parts.push(objects.length > MAX_NAMES ? `${shown}; +${objects.length - MAX_NAMES} more` : shown);
  }
  return parts.join('; ');
}

/** Stable serialization for value comparison (key order of objects normalized). */
function stableValue(value: unknown): string {
  if (typeof value !== 'object' || value === null) { return JSON.stringify(value) ?? 'undefined'; }
  if (Array.isArray(value)) { return `[${value.map(stableValue).join(',')}]`; }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableValue(obj[k])}`).join(',')}}`;
}

/**
 * Upstream additions, project-only keys, and keys whose values differ. Given
 * plain key lists (no values) `changed` stays empty.
 */
export function configKeyDelta(project: readonly string[] | ReadonlyMap<string, unknown>, upstream: readonly string[] | ReadonlyMap<string, unknown>): KeyDelta {
  const mine = project instanceof Map ? project : new Map((project as readonly string[]).map(k => [k, undefined]));
  const theirs = upstream instanceof Map ? upstream : new Map((upstream as readonly string[]).map(k => [k, undefined]));
  const withValues = project instanceof Map && upstream instanceof Map;
  const added = [...theirs.keys()].filter(k => !mine.has(k));
  const projectOnly = [...mine.keys()].filter(k => !theirs.has(k));
  const changed: string[] = [];
  const changedDetail: Record<string, string> = {};
  if (withValues) {
    // A key whose children are entries of their own (a top key holding an
    // object) is judged through them; anything else is compared whole.
    const expanded = (key: string): boolean => {
      const prefix = `${key}.`;
      for (const k of theirs.keys()) { if (k.startsWith(prefix)) { return true; } }
      for (const k of mine.keys()) { if (k.startsWith(prefix)) { return true; } }
      return false;
    };
    for (const [key, value] of theirs) {
      if (!mine.has(key) || expanded(key)) { continue; }
      const own = mine.get(key);
      if (stableValue(own) === stableValue(value)) { continue; }
      changed.push(key);
      if (isPlainObject(own) && isPlainObject(value)) { changedDetail[key] = describeObjectDelta(own, value); }
    }
  }
  return { added, projectOnly, changed, changedDetail };
}

export interface WatchedFileEvidence {
  evidence: string
  /** The project has headings or keys upstream lacks: `take upstream` would delete them. */
  projectOnly: boolean
  /** The cost-aware verb: what porting upstream would add, and what it would cost the project. */
  suggested: ParitySuggestion
}

/**
 * Verb + evidence for one watched file from what the two copies share and
 * lack. `unit` names the structure compared ("key" / "heading"). Never a bare
 * `merge`: the evidence says what to port and what to keep.
 */
function costSignal(unit: string, added: string[], projectOnly: string[], changed: string[], changedDetail: Record<string, string> = {}): { parts: string[], suggested: ParitySuggestion } {
  const units = (n: number): string => `${unit}${n === 1 ? '' : 's'}`;
  const changedNote = unit === 'heading' ? `body differs in ${changed.length}: ${listNames(changed)}` : describeChangedKeys(changed, changedDetail);
  if (added.length > 0 && projectOnly.length > 0) {
    const parts = [`port upstream additions only: ${listNames(added)}`, `keep project-only ${units(projectOnly.length)}: ${listNames(projectOnly)}`];
    if (changed.length > 0) { parts.push(changedNote); }
    return { parts, suggested: 'merge' };
  }
  if (added.length > 0) {
    if (changed.length === 0) { return { parts: [`upstream added ${added.length} ${units(added.length)}: ${listNames(added)}`, 'nothing project-only'], suggested: 'take upstream' }; }
    return { parts: [`port upstream additions only: ${listNames(added)}`, `keep project ${unit === 'heading' ? 'bodies' : 'values'} at: ${listNames(changed)}`], suggested: 'merge' };
  }
  if (projectOnly.length > 0) {
    if (changed.length === 0) { return { parts: [`project-only ${units(projectOnly.length)}: ${listNames(projectOnly)}`, 'upstream adds nothing'], suggested: 'keep project' }; }
    return { parts: [`keep project-only ${units(projectOnly.length)}: ${listNames(projectOnly)}`, `${changedNote} (port what you want)`], suggested: 'merge' };
  }
  if (changed.length > 0) { return { parts: [`same ${units(2)}, ${changedNote} (port what you want, keep the rest)`], suggested: 'merge' }; }
  return { parts: [`same ${units(2)} and ${unit === 'heading' ? 'bodies' : 'values'}; formatting or comments differ`], suggested: 'keep project' };
}

/** Evidence for a watched file, from its two copies plus the diff. */
export function watchedFileEvidence(filePath: string, project: string, upstream: string, diff: string): WatchedFileEvidence {
  const stats = formatStats(diffStats(diff));
  let parts: string[];
  let projectOnly = false;
  let suggested: ParitySuggestion = 'merge';
  if (path.extname(filePath).toLowerCase() === '.md') {
    const delta = markdownSectionDelta(project, upstream);
    projectOnly = delta.removed.length > 0;
    ({ parts, suggested } = costSignal('heading', delta.added, delta.removed, delta.changed));
  }
  else {
    const mine = configEntries(project, filePath);
    const theirs = configEntries(upstream, filePath);
    if (mine && theirs) {
      const delta = configKeyDelta(mine, theirs);
      projectOnly = delta.projectOnly.length > 0;
      ({ parts, suggested } = costSignal('key', delta.added, delta.projectOnly, delta.changed, delta.changedDetail));
    }
    else {
      // No key structure (a shell hook, a JS config): the hunks are the evidence.
      parts = ['content differs (no key structure): review the hunks in the saved file'];
    }
  }
  return { evidence: `${parts.join('; ')}; ${stats}`, projectOnly, suggested };
}

/**
 * Structure-only comparison for a project identity file: keys or headings
 * upstream added, nothing else. `null` when upstream added nothing (a value
 * difference is project identity, not drift: no row).
 */
export function structuralEvidence(filePath: string, project: string, upstream: string): string | null {
  let added: string[];
  let unit: string;
  if (path.extname(filePath).toLowerCase() === '.md') {
    added = markdownSectionDelta(project, upstream).added;
    unit = 'heading';
  }
  else {
    const mine = configEntries(project, filePath);
    const theirs = configEntries(upstream, filePath);
    if (!mine || !theirs) { return null; }
    added = configKeyDelta(mine, theirs).added;
    unit = 'key';
  }
  if (added.length === 0) { return null; }
  return `informational: upstream added ${added.length} ${unit}${added.length === 1 ? '' : 's'}: ${listNames(added)}; merge = add the new ${unit}s, values are project identity and never compared`;
}

/** One evidence sentence for a watched file, from its two copies plus the diff. */
export function describeWatchedFile(filePath: string, project: string, upstream: string, diff: string): string {
  return watchedFileEvidence(filePath, project, upstream, diff).evidence;
}

// ============================================================================
// COMPAT ERROR CLASSIFICATION
// ============================================================================

const MCP_MISSING_RE = /^MCP (\S+) missing from (\w+):/;
const MCP_EXTRA_RE = /^MCP (\S+) present in (\w+) only:/;
/** `validateCommandAliases` names a wrapper file no manifest produced. */
const WRAPPER_UNDECLARED_RE = /^Command wrapper not declared in any manifest: (\S+?);/;

const COMPAT_GROUP_SURFACE: Record<CompatibilityErrorGroup, ParitySurface> = {
  instructions: 'instructions',
  alias: 'skills',
  wrappers: 'commands',
  hooks: 'hooks',
  mcp: 'mcp',
};

/** Same classifier `bun run agents:compat` groups its output by. */
export function compatErrorSurface(message: string): ParitySurface {
  return COMPAT_GROUP_SURFACE[compatibilityErrorGroup(message)];
}

/**
 * Generated surfaces are rebuilt by `agents:compat`; a wrapper no manifest
 * declares is the project's to declare (overlay) or delete; anything else
 * comes from upstream's shape.
 */
export function compatErrorSuggestion(message: string): ParitySuggestion {
  if (WRAPPER_UNDECLARED_RE.test(message)) { return 'add to overlay'; }
  return /command wrapper|skills alias|\.claude\/skills/i.test(message) ? 'run agents:compat' : 'take upstream';
}

function compatErrorPath(message: string): string {
  const m = /(?:^|\s|:)((?:\.[\w-]+|[\w-]+)(?:\/[\w.-]+)+\.\w+)/.exec(message);
  if (m) { return m[1]; }
  const host = /(claude|opencode|codex)\b/i.exec(message);
  if (host && /MCP/.test(message)) { return MCP_HOST_FILE[host[1].toLowerCase()]; }
  if (/skills alias|\.claude\/skills/.test(message)) { return '.claude/skills'; }
  return '(compat)';
}

// ============================================================================
// COLLECTOR
// ============================================================================

function readIfExists(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return null; }
}

function watchedSurface(filePath: string, source: 'upstream' | 'project' = 'upstream'): ParitySurface {
  if (filePath === '.mcp.json' || filePath === 'opencode.jsonc' || filePath === '.codex/config.toml') { return 'mcp'; }
  if (filePath === '.claude/settings.json') { return 'hooks'; }
  if (filePath.startsWith('.agents/skills/')) { return 'skills'; }
  // Synced component files kept as the project's own (.husky hooks, a declared path).
  if (filePath.startsWith('.husky/') || source === 'project') { return 'components'; }
  return 'instructions';
}

/**
 * Wrappers on disk that no manifest (upstream, project overlay) produces, as the
 * compat engine sees them. Without a manifest there is nothing to compare
 * against, so a project that has not received `agent-compatibility` yet yields
 * nothing instead of throwing.
 */
function wrappersNoManifestProduced(root: string): string[] {
  try { return undeclaredCommandWrappers(root); }
  catch { return []; }
}

// ============================================================================
// ARCHIVED SKILLS (one nudge per skill)
// ============================================================================

function archivedSkillMarkerPath(root: string, skill: string): string {
  return path.join(root, ARCHIVED_SKILL_MARKER_DIR, `archived-skill-${skill.replace(/[^a-z0-9.-]+/gi, '_')}.marker`);
}

/**
 * Archived skills that still need a row: what THIS run archived (the migration
 * result, carried into the re-exec child by the wrapper) plus any directory
 * under `archivedSkillsDir` that was never nudged. A skill whose marker exists
 * is skipped, so the row appears once even though the archive dir (gitignored,
 * per developer) stays on disk until the user deletes it.
 */
export function archivedSkillsToReport(root: string, archivedSkillsDir: string, thisRun: readonly string[]): string[] {
  const names = new Set(thisRun);
  try {
    for (const d of fs.readdirSync(archivedSkillsDir, { withFileTypes: true })) {
      if (d.isDirectory()) { names.add(d.name); }
    }
  }
  catch { /* no archive dir: only this run's names, if any */ }
  return [...names].sort().filter(skill => !fs.existsSync(archivedSkillMarkerPath(root, skill)));
}

/** Write the one-nudge marker for each reported skill. Non-fatal: worst case we nudge again. */
export function persistArchivedSkillMarkers(root: string, skills: readonly string[]): void {
  for (const skill of skills) {
    try {
      const marker = archivedSkillMarkerPath(root, skill);
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
    }
    catch { /* non-fatal */ }
  }
}

export interface GitStrategyStamp {
  present: boolean
  strategy: string | null
  source: string | null
}

/** `git_strategy` provenance from `.agents/project.yaml`, regex-read (no YAML parser in `cli/`). */
export function readGitStrategyStamp(projectYaml: string | null): GitStrategyStamp {
  if (projectYaml === null || !/^git_strategy:/m.test(projectYaml)) { return { present: false, strategy: null, source: null }; }
  const strategy = /^ {2}strategy:\s*([\w-]+)/m.exec(projectYaml)?.[1] ?? null;
  const source = /^\s+strategy_source:\s*([\w-]+)/m.exec(projectYaml)?.[1] ?? null;
  return { present: true, strategy, source };
}

/**
 * Build the findings for this run. Reads the two trees and shells `git diff
 * --no-index` for counts; writes nothing.
 */
export function collectParityFindings(input: ParityInput): ParityFinding[] {
  const findings: Omit<ParityFinding, 'id'>[] = [];

  // 1. Watched files that drifted: section-level evidence, full diff for the
  //    file. Kept aside until the compat errors are known: a compat error on
  //    the same path folds the drift into its (blocking) row.
  //    A structural entry (project identity) fires only for upstream
  //    additions, labelled `informational`, and its keys are the evidence; a
  //    value-only difference is no row at all.
  const drifted = new Map<string, Omit<ParityFinding, 'id'> & { projectOnly: boolean }>();
  for (const entry of input.drift) {
    const project = readIfExists(path.join(input.root, entry.path));
    const upstream = readIfExists(path.join(input.upstreamDir, entry.path));
    if (project === null || upstream === null) { continue; }
    const diff = diffNoIndex(path.join(input.root, entry.path), path.join(input.upstreamDir, entry.path));
    if (entry.structural) {
      const evidence = structuralEvidence(entry.path, project, upstream);
      if (evidence === null) { continue; }
      drifted.set(entry.path, { surface: watchedSurface(entry.path, entry.source), path: entry.path, evidence, suggested: 'merge', blocking: false, diff, projectOnly: true });
      continue;
    }
    const { evidence, projectOnly, suggested } = watchedFileEvidence(entry.path, project, upstream, diff);
    drifted.set(entry.path, {
      surface: watchedSurface(entry.path, entry.source),
      path: entry.path,
      evidence,
      suggested,
      blocking: false,
      diff,
      projectOnly,
    });
  }

  // 2. Compat errors. MCP set errors fold into one finding per host; a wrapper
  //    no manifest declares is one row per path; the rest stay one finding
  //    each. All of them block: the contract failed. A drifted watched file on
  //    the same path folds in: compat evidence first, drift evidence appended,
  //    the full diff kept for the saved file. Upstream's shape is suggested
  //    only when the project holds nothing of its own there; a project-only
  //    server, key or heading turns the suggestion into `merge` (still
  //    blocking: the contract is still broken).
  const compat: Omit<ParityFinding, 'id'>[] = [];
  const pushCompat = (finding: Omit<ParityFinding, 'id'>): void => {
    const drift = drifted.get(finding.path);
    if (!drift) { compat.push(finding); return; }
    drifted.delete(finding.path);
    const { projectOnly, ...driftFinding } = drift;
    compat.push({
      ...finding,
      evidence: `${finding.evidence}; ${driftFinding.evidence}`,
      suggested: finding.suggested === 'take upstream' && !projectOnly ? 'take upstream' : 'merge',
      diff: driftFinding.diff,
    });
  };
  const wrappersReported = new Set<string>();
  const mcpByHost = new Map<string, { missing: string[], extra: string[] }>();
  for (const error of input.compatErrors) {
    const undeclared = WRAPPER_UNDECLARED_RE.exec(error);
    if (undeclared) {
      wrappersReported.add(undeclared[1]);
      pushCompat({ surface: 'commands', path: undeclared[1], evidence: WRAPPER_UNDECLARED_EVIDENCE, suggested: 'add to overlay', blocking: true });
      continue;
    }
    const missing = MCP_MISSING_RE.exec(error);
    const extra = MCP_EXTRA_RE.exec(error);
    const match = missing ?? extra;
    if (!match) {
      pushCompat({
        surface: compatErrorSurface(error),
        path: compatErrorPath(error),
        evidence: error,
        suggested: compatErrorSuggestion(error),
        blocking: true,
      });
      continue;
    }
    const host = match[2];
    const bucket = mcpByHost.get(host) ?? { missing: [], extra: [] };
    (missing ? bucket.missing : bucket.extra).push(match[1]);
    mcpByHost.set(host, bucket);
  }
  for (const [host, sets] of mcpByHost) {
    const parts: string[] = [];
    if (sets.missing.length > 0) { parts.push(`missing: ${sets.missing.join(', ')} (declared in .mcp.json)`); }
    // Servers only this host has are the project's integrations: the fix is to
    // declare them everywhere or drop them deliberately, never to overwrite
    // the file with upstream's copy.
    if (sets.extra.length > 0) { parts.push(`only here: ${sets.extra.join(', ')} (not in .mcp.json): declare them in ${otherMcpHostFiles(host)}, or remove them`); }
    pushCompat({
      surface: 'mcp',
      path: MCP_HOST_FILE[host] ?? host,
      evidence: parts.join('; '),
      suggested: sets.extra.length === 0 ? 'take upstream' : 'merge',
      blocking: true,
    });
  }
  findings.push(...[...drifted.values()].map(({ projectOnly: _projectOnly, ...finding }) => finding), ...compat);

  // 3. Archived skills: the migration kept the legacy copy because upstream owns the name.
  for (const skill of input.archivedSkills) {
    const archived = path.join(input.archivedSkillsDir, skill);
    const canonical = path.join(input.root, '.agents', 'skills', skill);
    if (!fs.existsSync(archived)) { continue; }
    const diff = fs.existsSync(canonical) ? diffNoIndex(canonical, archived, { a: 'canonical', b: 'archived' }) : '';
    const stats = diffStats(diff);
    findings.push({
      surface: 'skills',
      path: path.relative(input.root, archived).replace(/\\/g, '/'),
      evidence: fs.existsSync(canonical)
        ? `archived collision vs .agents/skills/${skill}: ${formatStats(stats)}`
        : `archived; .agents/skills/${skill} no longer exists`,
      suggested: 'decide',
      blocking: false,
      diff: diff || undefined,
    });
  }

  // 4. Command wrappers no manifest knows about, when the compat check did not
  //    already name them (it did not run, or the manifest was missing then).
  for (const wrapper of wrappersNoManifestProduced(input.root)) {
    if (wrappersReported.has(wrapper)) { continue; }
    findings.push({
      surface: 'commands',
      path: wrapper,
      evidence: WRAPPER_UNDECLARED_EVIDENCE,
      suggested: 'add to overlay',
      blocking: false,
    });
  }

  // 5. Components held back this run, with the lock cursor each one stays at.
  if (input.heldBack.length > 0) {
    findings.push({
      surface: 'components',
      path: '.template/boilerplate.lock.json',
      evidence: `held back: ${input.heldBack.map(h => `${h.component}@${h.lockCommit ? h.lockCommit.slice(0, 7) : 'no lock'}`).join(', ')}`,
      suggested: 'decide',
      blocking: false,
    });
  }

  // 5b. `.context/PBI/` still tracked in git: one row on Componentes. The
  //     path list (hundreds of lines on a live run) lives in the recipe file,
  //     never in the prompt.
  if (input.pbiCache && input.pbiCache.tracked > 0) {
    findings.push({
      surface: 'components',
      path: '.context/PBI/',
      evidence: `${input.pbiCache.tracked} tracked path(s) still in git (Jira cache, gitignored by design); migration recipe saved to ${input.pbiCache.recipePath}`,
      suggested: 'decide',
      blocking: false,
    });
  }

  // 6. Env keys upstream documents and the project lacks.
  if (input.envNewKeys.length > 0) {
    findings.push({
      surface: 'env',
      path: '.env',
      evidence: `upstream .env.example added ${input.envNewKeys.length} key(s): ${input.envNewKeys.join(', ')}`,
      suggested: 'decide',
      blocking: false,
    });
  }

  // 7. Synced files the project had edited and this run overwrote: the edit
  //    lives in the backup; the row says where, how far the two are apart,
  //    and how to keep the merge next time (`updater.protected_paths`). A
  //    path already protected never reaches here: it is never overwritten.
  for (const edit of input.localEdits ?? []) {
    const current = path.join(input.root, edit.path);
    const backupRel = edit.backupPath ? path.relative(input.root, edit.backupPath).replace(/\\/g, '/') : null;
    const diff = edit.backupPath && fs.existsSync(edit.backupPath) && fs.existsSync(current)
      ? diffNoIndex(edit.backupPath, current, { a: 'project-edit', b: 'applied' })
      : '';
    const stats = diffStats(diff);
    // Restoring a project's own skill from the backup leaves REGISTRY.md
    // built from the overwritten (upstream) content until the registry is
    // regenerated by hand: the row says so.
    const isSkillPath = edit.path.startsWith('.agents/skills/');
    const registryHint = isSkillPath ? '; after restoring, run bun run skills:registry' : '';
    findings.push({
      surface: isSkillPath ? 'skills' : 'components',
      path: edit.path,
      evidence: `project edit overwritten; backup: ${backupRel ?? 'none'}; ${diff ? `${formatStats(stats)} vs applied` : 'backup unavailable'}; ${PROTECT_HINT}${registryHint}`,
      suggested: 'merge',
      blocking: false,
      diff: diff || undefined,
      note: protectNote(edit.path),
    });
  }

  // 8. package.json keys kept at the project's value: the terminal FYI is
  //    lost on a non-interactive run; the row survives, the values go to the file.
  for (const kept of input.packageJsonKept ?? []) {
    findings.push({
      surface: 'package',
      path: kept.file,
      evidence: `${kept.section}.${kept.key}: project value kept; upstream differs`,
      suggested: 'decide',
      blocking: false,
      detail: `project (kept):\n  ${kept.localValue}\nupstream:\n  ${kept.upstreamValue}`,
    });
  }

  // 9. Quality gates that failed after the apply. Informational (never
  //    blocking): a type or lint break the diff-based rows cannot see.
  for (const gate of input.gates ?? []) {
    if (gate.status === 'pass') { continue; }
    const head = gate.status === 'timeout'
      ? `skipped: no verdict within ${Math.round(gate.seconds)} s`
      : gate.status === 'error'
        ? `could not run (exit ${gate.exitCode ?? 'signal'})`
        : `exit ${gate.exitCode ?? 'signal'}; ${gate.errorCount} error(s)`;
    const parts = [head];
    if (gate.firstErrors.length > 0) { parts.push(`first: ${gate.firstErrors.join(' | ')}`); }
    if (gate.status === 'fail') {
      parts.push(gate.failingApplied.length > 0
        ? `applied this run: ${gate.failingApplied.join(', ')}`
        : 'none of the failing files was applied this run');
    }
    findings.push({
      surface: 'gates',
      path: gate.script,
      evidence: parts.join('; '),
      suggested: 'decide',
      blocking: false,
      detail: gate.output.trim() || undefined,
    });
  }

  // 10. Git strategy provenance: a shipped default nobody chose is a pending decision.
  const stamp = readGitStrategyStamp(readIfExists(path.join(input.root, '.agents', 'project.yaml')));
  if (fs.existsSync(path.join(input.root, '.agents', 'project.yaml'))) {
    if (!stamp.present) {
      findings.push({
        surface: 'git',
        path: '.agents/project.yaml',
        evidence: 'no git_strategy block (git-flow-master cannot read a branch policy)',
        suggested: 'decide',
        blocking: false,
      });
    }
    else if (stamp.source !== 'chosen') {
      findings.push({
        surface: 'git',
        path: '.agents/project.yaml',
        evidence: `git_strategy.meta.strategy_source: ${stamp.source ?? 'unset'} (strategy: ${stamp.strategy ?? 'unset'}, shipped default, never chosen)`,
        suggested: 'decide',
        blocking: false,
      });
    }
  }

  return findings.map((f, i) => ({ id: i + 1, ...f }));
}

// ============================================================================
// RENDERER
// ============================================================================

function surfaceRows(findings: ParityFinding[]): SurfaceRow[] {
  return SURFACE_ORDER.map((surface) => {
    const own = findings.filter(f => f.surface === surface);
    const state: SurfaceState = own.length === 0 ? 'ok' : own.some(f => f.blocking) ? 'blocked' : 'warn';
    const paths = [...new Set(own.map(f => f.path))];
    const shown = paths.slice(0, MAX_NAMES).join(', ') + (paths.length > MAX_NAMES ? ` (+${paths.length - MAX_NAMES})` : '');
    const cell = own.length === 0
      ? 'sin diferencias'
      : `${own.length} hallazgo${own.length === 1 ? '' : 's'}: ${shown}`;
    return { surface, label: SURFACE_LABEL_ES[surface], state, cell };
  });
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function buildParityPrompt(findings: ParityFinding[], meta: ParityMeta): string {
  const upstream = meta.upstreamSha ? meta.upstreamSha.slice(0, 7) : 'unknown';
  const lock = meta.lockSha ? meta.lockSha.slice(0, 7) : 'none';
  const rows = findings.map(f => `| ${f.id} | ${SURFACE_LABEL_EN[f.surface]} | ${escapeCell(f.path)} | ${escapeCell(f.evidence)} | ${f.suggested} |`);
  // A GitHub handle has a raw URL per file; a local clone (UPEX_TEMPLATE_REPO=/path) does not.
  const isGitHubHandle = /^[\w.-]+\/[\w.-]+$/.test(meta.templateRepo);
  const copies = isGitHubHandle ? `; upstream copies: https://raw.githubusercontent.com/${meta.templateRepo}/main/<path>` : '';
  return [
    `Parity review after \`bun run up\` (upstream ${meta.templateRepo}@${upstream}, project lock ${lock}).`,
    'Present the table below to the user, one row per finding, and WAIT for a decision per row',
    '(keep project | take upstream | merge) BEFORE editing anything. Then apply only the chosen rows,',
    'run tests -> types -> lint, and report.',
    `Full diffs per row live in ${meta.promptFile}${copies}.`,
    'Rows marked BLOCKING failed a compatibility contract and must be resolved for `bun run agents:compat:check` to pass.',
    '`take upstream` is suggested only where the project lacks the content entirely; a row naming project-only servers, keys, headings or edits suggests `merge` (its backup or values are in the saved file).',
    'A `merge` row says what to port (upstream additions) and what to keep (project-only). A row labelled `informational` is a project identity file compared by keys only: merge = add the listed keys, never the values.',
    '',
    '| # | Surface | File | What differs (evidence) | Suggested |',
    '|---|---|---|---|---|',
    ...rows.map((row, i) => (findings[i].blocking ? row.replace(/ \|$/, ' (BLOCKING) |') : row)),
    '',
    'Post-merge: bun run agents:compat && bun run agents:compat:check && bun run repo:check',
  ].join('\n');
}

export function buildParityFileBody(findings: ParityFinding[], meta: ParityMeta): string {
  const today = new Date().toISOString().slice(0, 10);
  const evidence = findings.filter(f => f.diff || f.detail || f.note).flatMap(f => [
    `### ${f.id}. ${f.path}`,
    '',
    f.evidence,
    '',
    ...(f.diff || f.detail ? [f.diff ? '```diff' : '```text', (f.diff ?? f.detail ?? '').trimEnd(), '```', ''] : []),
    ...(f.note ? [f.note, ''] : []),
  ]);
  return [
    '# Parity plan — AI review prompt',
    '',
    `> **AUTO-GENERATED, SINGLE-USE.** Written by \`bun run up\` on ${today}.`,
    '> Paste the prompt below into your AI session, then delete this file.',
    '> It is regenerated (overwritten) on every run that ends with findings.',
    '',
    '```text',
    buildParityPrompt(findings, meta),
    '```',
    '',
    ...(evidence.length > 0 ? ['## Evidence (full diffs: `+` is what upstream has, `-` is what the project has; for an overwritten edit, `-` is the project edit and `+` what was applied)', '', ...evidence] : []),
  ].join('\n');
}

export function renderParityReport(findings: ParityFinding[], meta: ParityMeta): ParityReport {
  return {
    surfaces: surfaceRows(findings),
    prompt: buildParityPrompt(findings, meta),
    fileBody: buildParityFileBody(findings, meta),
  };
}

// ============================================================================
// EXIT VERDICT (--strict, aborts)
// ============================================================================

export interface StrictVerdict {
  exitCode: 0 | 1
  /** One line, or null when exit 0. */
  reason: string | null
}

/** Exit 1 under `--strict` when any finding blocks; warn + exit 0 otherwise. */
export function strictVerdict(strict: boolean, findings: ParityFinding[]): StrictVerdict {
  const blocking = findings.filter(f => f.blocking);
  if (!strict || blocking.length === 0) { return { exitCode: 0, reason: null }; }
  const paths = [...new Set(blocking.map(f => f.path))];
  return {
    exitCode: 1,
    reason: `--strict: ${blocking.length} hallazgo(s) bloqueante(s) de compatibilidad (${paths.slice(0, MAX_NAMES).join(', ')}${paths.length > MAX_NAMES ? ', …' : ''}). Corrige y vuelve a correr \`bun run agents:compat:check\`.`,
  };
}

export interface RunVerdict extends StrictVerdict {
  /** The closing line the wrapper prints through `tui.outro`. */
  outro: string
}

export const ABORTED_OUTRO = 'Abortado.';

/**
 * What the process reports at the end. An aborted run (a preflight refusal:
 * dirty tree, corrupt lock, clone failure, a declined migration or
 * self-update) is never a success: exit 1 and `Abortado.` in every mode. An
 * explicit prompt cancel (Ctrl-C) never reaches here: it throws and exits 130.
 * Otherwise `--strict` decides, and the outro names the mode.
 */
export function runVerdict(
  run: { aborted: boolean, dryRun: boolean, strict: boolean },
  findings: ParityFinding[],
): RunVerdict {
  if (run.aborted) { return { exitCode: 1, reason: null, outro: ABORTED_OUTRO }; }
  const strict = strictVerdict(run.strict, findings);
  if (strict.exitCode !== 0) { return { ...strict, outro: 'Sincronizacion completada con contratos rotos (--strict).' }; }
  return { ...strict, outro: run.dryRun ? 'Dry-run completado.' : 'Sincronizacion completada.' };
}
