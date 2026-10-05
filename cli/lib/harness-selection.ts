/**
 * @fileoverview Which host harnesses a project uses (`harnesses:` in
 * `.agents/project.yaml`).
 *
 * The boilerplate ships adapters for three harnesses (Claude Code, OpenCode,
 * Codex). A downstream project that runs on one of them deletes the other
 * two's files, and every gate that checks the three of them (the compat check,
 * `setup:doctor`, the installer, the updater) would then fail on files the
 * project chose not to keep. This module answers, once, which harnesses the
 * gates check (ADR-0012):
 *
 *  1. The boilerplate itself (`isSchemaOwner`) checks all three, whatever its
 *     yaml says: a deleted OpenCode or Codex file in the template must fail.
 *  2. An explicit `harnesses:` list wins.
 *  3. Absent or `null`: detect from the files present. A harness is in use
 *     while ANY of its files exists, so deleting one file of a harness still
 *     fails its contract; only deleting all of them retires it. Nothing found
 *     at all checks all three, which fails toward checking more.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { applySplices, isSchemaOwner, locateLeaf } from './agents-schema.ts';

export const HARNESSES = ['claude', 'opencode', 'codex'] as const;
export type Harness = (typeof HARNESSES)[number];

/** The yaml key, top level of `.agents/project.yaml`. */
export const HARNESSES_KEY = 'harnesses';

/** Display names, for doctor rows and installer prompts. */
export const HARNESS_LABEL: Record<Harness, string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex',
};

/**
 * The versioned files each harness owns, repo-relative. Detection reads them,
 * the installer offers to delete them, the updater stops delivering them for
 * a harness the project does not use. `.claude/skills` is not here: it is a
 * generated alias, never committed.
 */
export const HARNESS_FILES: Record<Harness, readonly string[]> = {
  claude: ['CLAUDE.md', '.mcp.json', '.claude/settings.json'],
  opencode: ['opencode.jsonc', '.opencode/plugins/personality-reinject.js'],
  codex: ['.codex/config.toml', '.codex/hooks.json', '.codex/environments/environment.toml'],
};

export type HarnessSource = 'boilerplate' | 'declared' | 'detected' | 'fallback';

export interface HarnessSelection {
  /** In use, canonical order unless declared (then the declared order). Never empty. */
  harnesses: Harness[]
  /** Not in use, canonical order. */
  skipped: Harness[]
  source: HarnessSource
  /** A `harnesses:` value that could not be used as written; each names what was ignored. */
  warnings: string[]
}

export function isHarness(value: unknown): value is Harness {
  return typeof value === 'string' && (HARNESSES as readonly string[]).includes(value);
}

/** The harness that owns a repo-relative path, or null when none does. */
export function harnessOfPath(path: string): Harness | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const harness of HARNESSES) {
    if (HARNESS_FILES[harness].includes(normalized)) { return harness; }
  }
  if (normalized.startsWith('.opencode/')) { return 'opencode'; }
  if (normalized.startsWith('.codex/')) { return 'codex'; }
  return null;
}

/**
 * The raw `harnesses:` value of a project yaml: `undefined` when the key is
 * absent, the file is missing or it does not parse (all three mean "detect").
 */
export function readDeclaredHarnessValue(root: string): unknown {
  const path = join(resolve(root), '.agents', 'project.yaml');
  if (!existsSync(path)) { return undefined; }
  try {
    const parsed = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown> | null;
    return parsed !== null && typeof parsed === 'object' ? parsed[HARNESSES_KEY] : undefined;
  }
  catch { return undefined; }
}

/** Harnesses with at least one of their files on disk, canonical order. */
export function detectHarnesses(root: string): Harness[] {
  const resolvedRoot = resolve(root);
  return HARNESSES.filter(harness => HARNESS_FILES[harness].some(file => existsSync(join(resolvedRoot, file))));
}

function readSchemaOwner(root: string): boolean {
  const packageJson = join(root, 'package.json');
  return existsSync(packageJson) && isSchemaOwner(readFileSync(packageJson, 'utf8'));
}

function selection(harnesses: Harness[], source: HarnessSource, warnings: string[] = []): HarnessSelection {
  return { harnesses, skipped: HARNESSES.filter(h => !harnesses.includes(h)), source, warnings };
}

export interface HarnessSelectionOptions {
  /** Overrides the `package.json` read (tests). */
  schemaOwner?: boolean
}

// LINT.IfChange(harness-selection)
export function declaredHarnesses(root = process.cwd(), options: HarnessSelectionOptions = {}): HarnessSelection {
  const resolvedRoot = resolve(root);
  if (options.schemaOwner ?? readSchemaOwner(resolvedRoot)) {
    return selection([...HARNESSES], 'boilerplate');
  }

  const warnings: string[] = [];
  const raw = readDeclaredHarnessValue(resolvedRoot);
  if (raw !== undefined && raw !== null) {
    if (Array.isArray(raw)) {
      const declared: Harness[] = [];
      for (const entry of raw) {
        if (!isHarness(entry)) {
          warnings.push(`${HARNESSES_KEY}: ignored ${JSON.stringify(entry)} (one of ${HARNESSES.join(', ')})`);
        }
        else if (!declared.includes(entry)) {
          declared.push(entry);
        }
      }
      if (declared.length > 0) { return selection(declared, 'declared', warnings); }
      warnings.push(`${HARNESSES_KEY}: names no known harness, detecting from the files present`);
    }
    else {
      warnings.push(`${HARNESSES_KEY}: must be a list (e.g. [claude]), detecting from the files present`);
    }
  }

  const detected = detectHarnesses(resolvedRoot);
  if (detected.length > 0) { return selection(detected, 'detected', warnings); }
  return selection([...HARNESSES], 'fallback', warnings);
}
// LINT.ThenChange(README.md, INSTALLER.md, CONTEXT.md, .agents/instructions/agent-harnesses.md, docs/core/fundamentos/harness.html, packages/pages-home/harnesses.es.html)

/**
 * The host whose MCP config defines the server set the others must match:
 * Claude when it is in use (its `.mcp.json` has always been the canonical
 * set), otherwise the first declared harness.
 */
export function canonicalMcpHarness(harnesses: readonly Harness[]): Harness {
  return harnesses.includes('claude') ? 'claude' : harnesses[0] ?? 'claude';
}

/** One line per harness not in use, for the compat check and doctor. */
export function skippedHarnessNotes(selected: HarnessSelection): string[] {
  const why = selected.source === 'declared' ? 'not declared in .agents/project.yaml harnesses' : 'none of its files present';
  return selected.skipped.map(harness => `${harness}: ${why}, skipped`);
}

/** The explicit, usable entries of `harnesses:` (empty when absent, null or unusable). */
export function explicitHarnesses(root: string): Harness[] {
  const raw = readDeclaredHarnessValue(root);
  if (!Array.isArray(raw)) { return []; }
  return raw.filter(isHarness).filter((entry, index, all) => all.indexOf(entry) === index);
}

/** The block appended when the yaml has no `harnesses:` key yet. */
function harnessesBlock(value: string): string {
  return [
    '# Host harnesses this project uses (ADR-0012), any of: claude, opencode, codex.',
    '# The compatibility gates check only these. null = detect from the files present.',
    `${HARNESSES_KEY}: ${value}`,
    '',
  ].join('\n');
}

/**
 * The yaml text with `harnesses:` set to `harnesses`, as a parser-located
 * splice (never a re-serialization: see the `.agents/` rule in
 * `agent-harnesses.md`). The value lands on the key's own line and a trailing
 * comment survives; an absent key is appended as a commented block. The
 * result is re-parsed, and a mismatch throws instead of returning a file that
 * means something else.
 */
export function withHarnesses(yamlText: string, harnesses: readonly Harness[]): string {
  const value = `[${harnesses.join(', ')}]`;
  const located = locateLeaf(yamlText, [HARNESSES_KEY]);
  const out = located !== null
    ? applySplices(yamlText, [{ range: [located.afterKey, located.value[1]], text: ` ${value}` }])
    : `${yamlText.replace(/\n*$/, '\n')}\n${harnessesBlock(value)}`;
  const parsed = (parseYaml(out) as Record<string, unknown> | null)?.[HARNESSES_KEY];
  if (!Array.isArray(parsed) || parsed.join(',') !== harnesses.join(',')) {
    throw new Error(`${HARNESSES_KEY}: the write did not re-parse as ${value}`);
  }
  return out;
}

/**
 * What `bun run up` never delivers, watches or reports for a harness the
 * project does not use: its files, plus the directories the updater syncs
 * whole. A directory entry covers everything under it.
 */
export const HARNESS_SYNC_PATHS: Record<Harness, readonly string[]> = {
  claude: ['CLAUDE.md', '.mcp.json', '.claude/settings.json'],
  opencode: ['opencode.jsonc', '.opencode/plugins'],
  codex: ['.codex'],
};

/** `HARNESS_SYNC_PATHS` of every harness not in use (none in the boilerplate). */
export function unusedHarnessPaths(root: string, selection: HarnessSelection = declaredHarnesses(root)): string[] {
  return selection.skipped.flatMap(harness => [...HARNESS_SYNC_PATHS[harness]]);
}

/** Whether a repo-relative path is one of `paths` or sits under one (segment boundary). */
export function isUnderAny(path: string, paths: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, '/');
  return paths.some(p => normalized === p || normalized.startsWith(`${p}/`));
}
