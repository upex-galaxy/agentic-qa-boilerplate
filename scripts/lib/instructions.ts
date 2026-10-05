/**
 * @fileoverview Shared reader for the progressive-disclosure instructions.
 *
 * `AGENTS.md` is the always-on layer (L0): critical rules, behaviour,
 * orchestration core and a fixed ROUTER between `<!-- router:start -->` and
 * `<!-- router:end -->`. Everything else lives in one section file per topic
 * under `.agents/instructions/`, each opening with a frontmatter block
 * (`id`, `title`, `load_when`, `triggers`, `paths`) the hook and the lint read.
 *
 * `lint-instructions.ts`, `lint-docs.ts` and `lint-skills.ts` all read the
 * layout through this module, so the location of the skill router table is
 * defined once.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const L0_FILE = 'AGENTS.md';
export const INSTRUCTIONS_DIR = '.agents/instructions';
/** Every file in the folder but the README starts with it: it says the file comes from the agent setup. */
export const SECTION_PREFIX = 'agent-';
/** The section that holds the skill trigger router table (`### Skills ...`). */
export const SKILLS_SECTION = 'agent-skills-and-mcps.md';
/** Human guide to the folder: never routed, carries no frontmatter. */
export const INSTRUCTIONS_README = 'README.md';
/** Project-owned overlay section: delivered once as a stub, never synced. */
export const PROJECT_SECTION = 'agent-project.md';
/**
 * The skill router table's heading in the skills section (or a pre-split `AGENTS.md`).
 * That file is synced: `bun run up` overwrites it, so it holds upstream skills only.
 */
export const SKILL_ROUTER_HEADING = /^### Skills \(lazy-loaded by trigger phrase\)/m;
/**
 * The table in `agent-project.md` where a project routes the skills it authored
 * (`project-context` mode `context-skill`, adaptation). Project-owned, so the
 * rows survive `bun run up`.
 */
export const PROJECT_SKILLS_HEADING = /^## Project context skills\s*$/m;
export const ROUTER_START = '<!-- router:start -->';
export const ROUTER_END = '<!-- router:end -->';

export interface SectionFrontmatter {
  id?: unknown
  title?: unknown
  load_when?: unknown
  triggers?: unknown
  paths?: unknown
}

export interface Section {
  /** File name inside `.agents/instructions/`. */
  name: string
  /** Repo-relative POSIX path. */
  rel: string
  text: string
  /** Parsed frontmatter, or null when the block is missing. */
  frontmatter: SectionFrontmatter | null
  /** YAML error message when the block exists but does not parse. */
  frontmatterError?: string
}

/** Splits a leading `---` frontmatter block. Null data when the file has none. */
export function splitFrontmatter(text: string): { data: SectionFrontmatter | null, error?: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) { return { data: null }; }
  try {
    const data = parseYaml(match[1]) as unknown;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { data: null, error: 'frontmatter is not a mapping' };
    }
    return { data: data as SectionFrontmatter };
  }
  catch (error) {
    return { data: null, error: (error as Error).message.split('\n')[0] };
  }
}

/** A section's frontmatter `id`: its file stem without the prefix (`agent-git.md` -> `git`). */
export function sectionId(name: string): string {
  return name.replace(/\.md$/, '').replace(new RegExp(`^${SECTION_PREFIX}`), '');
}

/** Every markdown file under `.agents/instructions/` except the human README, sorted. */
export function listSections(root: string): Section[] {
  const dir = join(root, INSTRUCTIONS_DIR);
  if (!existsSync(dir)) { return []; }
  return readdirSync(dir)
    .filter(name => name.endsWith('.md') && name !== INSTRUCTIONS_README)
    .sort()
    .map((name) => {
      const text = readFileSync(join(dir, name), 'utf8');
      const { data, error } = splitFrontmatter(text);
      return { name, rel: `${INSTRUCTIONS_DIR}/${name}`, text, frontmatter: data, frontmatterError: error };
    });
}

/**
 * The file that carries the skill router table: the skills section when the
 * repo has split its instructions, else `AGENTS.md` (a downstream repo the
 * sync has not reached yet keeps the table there). Null when neither exists.
 */
export function skillRouterSource(root: string): { rel: string, path: string } | null {
  const section = join(root, INSTRUCTIONS_DIR, SKILLS_SECTION);
  if (existsSync(section)) { return { rel: `${INSTRUCTIONS_DIR}/${SKILLS_SECTION}`, path: section }; }
  const l0 = join(root, L0_FILE);
  if (existsSync(l0)) { return { rel: L0_FILE, path: l0 }; }
  return null;
}

export interface SkillTableRow {
  /** Skill slug from the first column (backticked). */
  slug: string
  /** 1-based line in the file. */
  line: number
}

/**
 * Rows of the skill table under `heading`, up to the next heading of level 1-3,
 * one per first-column backticked slug. Null when the heading is missing.
 */
export function skillTableRows(text: string, heading: RegExp): SkillTableRow[] | null {
  const start = text.search(heading);
  if (start < 0) { return null; }
  const firstLine = text.slice(0, start).split('\n').length;
  const after = text.slice(start).split('\n').slice(1);
  const next = after.findIndex(line => /^#{1,3} /.test(line));
  const body = next < 0 ? after : after.slice(0, next);
  const rows: SkillTableRow[] = [];
  body.forEach((line, i) => {
    const cell = /^\|\s*`([a-z0-9][a-z0-9-]*)`\s*\|/.exec(line);
    if (cell) { rows.push({ slug: cell[1], line: firstLine + 1 + i }); }
  });
  return rows;
}

/** The project's own skill rows (`## Project context skills` in `agent-project.md`), or null when the file or the heading is missing. */
export function projectSkillRows(root: string): SkillTableRow[] | null {
  const file = join(root, INSTRUCTIONS_DIR, PROJECT_SECTION);
  if (!existsSync(file)) { return null; }
  return skillTableRows(readFileSync(file, 'utf8'), PROJECT_SKILLS_HEADING);
}

export interface RouterRow {
  /** 1-based line in `AGENTS.md`. */
  line: number
  cells: string[]
}

/** Table rows between the router markers (header and separator excluded), or null when a marker is missing. */
export function routerRows(l0: string): RouterRow[] | null {
  const lines = l0.split('\n');
  const start = lines.findIndex(l => l.trim() === ROUTER_START);
  const end = lines.findIndex(l => l.trim() === ROUTER_END);
  if (start < 0 || end < 0 || end < start) { return null; }
  const rows: RouterRow[] = [];
  let seenHeader = false;
  for (let i = start + 1; i < end; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) { continue; }
    if (/^\|[\s:|-]+\|$/.test(line)) { continue; }
    if (!seenHeader) { seenHeader = true; continue; }
    rows.push({ line: i + 1, cells: line.slice(1, -1).split('|').map(c => c.trim()) });
  }
  return rows;
}

/**
 * The ROUTER lock, one comment line in `AGENTS.md`: the fingerprint of the
 * table it froze and the ADR that decided that table. The rows are request
 * kinds, fixed on purpose (ADR-0009); a change to them is an architectural
 * decision, so the lock moves only together with an ADR that cites it.
 */
export const ROUTER_LOCK = /<!-- router:lock ([0-9a-f]{12}) (ADR-\d{4}) -->/;
export const ADR_DIR = '.context/ADR';
/** Labelled prompts for the router (recall / precision), read by the lint and `cli/lib/instruction-router.test.ts`. */
export const ROUTER_EVAL_FIXTURE = 'cli/lib/fixtures/instruction-router-eval.json';
/** The index in `.agents/instructions/README.md`: one row per section file. */
export const README_SECTIONS_HEADING = /^## Sections\s*$/m;

/**
 * The ROUTER table as the lock sees it: header plus rows, separator rows
 * dropped, every cell trimmed and its inner whitespace collapsed, so a
 * reflowed table keeps its fingerprint and a changed cell does not.
 */
export function routerTableLines(l0: string): string[] | null {
  const lines = l0.split('\n');
  const start = lines.findIndex(l => l.trim() === ROUTER_START);
  const end = lines.findIndex(l => l.trim() === ROUTER_END);
  if (start < 0 || end < 0 || end < start) { return null; }
  return lines.slice(start + 1, end)
    .map(l => l.trim())
    .filter(l => l.startsWith('|') && !/^\|[\s:|-]+\|$/.test(l))
    .map(l => l.slice(1, -1).split('|').map(c => c.replace(/\s+/g, ' ').trim()).join(' | '));
}

/** First 12 hex of the sha256 of the normalized ROUTER table, or null without markers. */
export function routerFingerprint(l0: string): string | null {
  const lines = routerTableLines(l0);
  return lines === null ? null : createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12);
}

/** The lock line of `AGENTS.md`, or null when there is none. */
export function routerLock(l0: string): { fingerprint: string, adr: string, line: number } | null {
  const lines = l0.split('\n');
  const index = lines.findIndex(l => ROUTER_LOCK.test(l));
  if (index < 0) { return null; }
  const m = ROUTER_LOCK.exec(lines[index])!;
  return { fingerprint: m[1], adr: m[2], line: index + 1 };
}

/** `AGENTS.md` with its lock set to `fingerprint` + `adr`: replaced in place, or added right under the router end marker. */
export function withRouterLock(l0: string, fingerprint: string, adr: string): string {
  const lock = `<!-- router:lock ${fingerprint} ${adr} -->`;
  if (ROUTER_LOCK.test(l0)) { return l0.replace(ROUTER_LOCK, lock); }
  const lines = l0.split('\n');
  const end = lines.findIndex(l => l.trim() === ROUTER_END);
  if (end < 0) { return l0; }
  lines.splice(end + 1, 0, lock);
  return lines.join('\n');
}

/** Repo-relative path of `ADR-NNNN-*.md` under `.context/ADR/`, or null. */
export function findAdr(root: string, id: string): string | null {
  const dir = join(root, ADR_DIR);
  if (!existsSync(dir)) { return null; }
  const name = readdirSync(dir).find(n => n.startsWith(`${id}-`) && n.endsWith('.md'));
  return name ? `${ADR_DIR}/${name}` : null;
}

/** Section file names the README `## Sections` table lists (first cell, backticked), or null when the table is missing. */
export function readmeSectionRows(text: string): Array<{ name: string, line: number }> | null {
  const start = text.search(README_SECTIONS_HEADING);
  if (start < 0) { return null; }
  const firstLine = text.slice(0, start).split('\n').length;
  const after = text.slice(start).split('\n').slice(1);
  const next = after.findIndex(line => /^#{1,2} /.test(line));
  const rows: Array<{ name: string, line: number }> = [];
  (next < 0 ? after : after.slice(0, next)).forEach((line, i) => {
    const cell = /^\|\s*`([\w.-]+\.md)`\s*\|/.exec(line);
    if (cell) { rows.push({ name: cell[1], line: firstLine + 1 + i }); }
  });
  return rows;
}

/** Section file names a router cell names in backticks (`agent-harnesses.md`, `agent-project.md`). */
export function sectionRefs(cell: string): string[] {
  return [...cell.matchAll(/`([\w.-]+\.md)`/g)].map(m => m[1]);
}

/** Claude `@path` imports written in plain text (code spans excluded): `@package.json`, `@.agents/project.yaml`. */
export function importRefs(cell: string): string[] {
  const plain = cell.replace(/`[^`]*`/g, '');
  return [...plain.matchAll(/(?:^|\s)@([\w./-]*[\w-])/g)].map(m => m[1]);
}
