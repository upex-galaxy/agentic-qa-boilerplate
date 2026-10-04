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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const L0_FILE = 'AGENTS.md';
export const INSTRUCTIONS_DIR = '.agents/instructions';
/** The section that holds the skill trigger router table (`### Skills ...`). */
export const SKILLS_SECTION = '20-skills-and-mcps.md';
/** Human guide to the folder: never routed, carries no frontmatter. */
export const INSTRUCTIONS_README = 'README.md';
/** Project-owned overlay section: delivered once as a stub, never synced. */
export const PROJECT_SECTION = 'project.md';
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

/** Section file names a router cell names in backticks (`10-harnesses.md`, `project.md`). */
export function sectionRefs(cell: string): string[] {
  return [...cell.matchAll(/`([\w.-]+\.md)`/g)].map(m => m[1]);
}

/** Claude `@path` imports written in plain text (code spans excluded): `@package.json`, `@.agents/project.yaml`. */
export function importRefs(cell: string): string[] {
  const plain = cell.replace(/`[^`]*`/g, '');
  return [...plain.matchAll(/(?:^|\s)@([\w./-]*[\w-])/g)].map(m => m[1]);
}
