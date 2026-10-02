#!/usr/bin/env bun
/**
 * context-map.ts — the AI's read path into a business context map.
 *
 * A map (`.agents/skills/<slug>/references/<map>.html`) is the single source of
 * a synthesis: a human opens it in a browser, the AI reads it through this
 * script. Inline SVG is most of a map's bytes and none of its facts, so the
 * reader strips `<svg>`, `<style>`, `<script>` and the `<head>`, and prints each
 * `<section>` as markdown-shaped text with its id, its date and its sources.
 * No dependency: regexes over the fixed anatomy the generator writes
 * (`agentic-qa-core/references/business-context-maps.md` §2 "Anatomy").
 *
 * USAGE
 *   bun run context:map <skill-slug | path/to/map.html>
 *   bun run context:map <skill> --section <id>   # one section only
 *   bun run context:map <skill> --list           # id · updated · sources, one per line
 *
 * EXIT CODES
 *   0  printed (a placeholder map prints a notice on stderr and exits 0)
 *   1  unknown skill, missing map, unknown section id, or bad arguments
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { contextMapSkill, isPlaceholderMap } from '../cli/lib/context-maps.ts';

export interface MapSection {
  id: string
  title: string
  updated: string | null
  sources: string | null
  /** The section body rendered as text, figures reduced to one line. */
  text: string
}

export interface ParsedMap {
  title: string | null
  placeholder: boolean
  sections: MapSection[]
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'', '&nbsp;': ' ', '&middot;': '·', '&mdash;': '-', '&ndash;': '-', '&rarr;': '->' };

function decode(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|nbsp|middot|mdash|ndash|rarr);/g, m => ENTITIES[m] ?? m);
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decode(m[2] ?? m[3] ?? '') : null;
}

/** Strip every tag, collapse whitespace on each line. */
function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
}

/** Render one section's inner HTML as markdown-shaped text. */
export function renderSectionText(inner: string): string {
  let html = inner
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, t: string) => `\`${t}\``);
  // A figure becomes one line: its diagram type and caption.
  html = html.replace(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/gi, (_m, attrs: string, body: string) => {
    const type = attr(attrs, 'data-diagram') ?? 'diagram';
    const cap = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(body);
    return `\n[figure: ${type}${cap ? ` - ${stripTags(cap[1])}` : ''}]\n`;
  });
  // Tables: one line per row, cells joined by " | ".
  html = html.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_m, row: string) => {
    const cells = [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => stripTags(c[1]));
    return `\n| ${cells.join(' | ')} |`;
  });
  html = html
    .replace(/<h([3-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, t: string) => `\n${'#'.repeat(Number(level))} ${stripTags(t)}\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, t: string) => `\n- ${stripTags(t)}\n`)
    .replace(/<(?:p|div|dt|dd|pre|blockquote|br)\b[^>]*>/gi, '\n');
  const lines = html.split('\n').map(line => stripTags(line));
  // Keep one blank line between blocks, none between rows of the same table.
  return lines
    .filter((line, i) => {
      if (line !== '') { return true; }
      const prev = lines.slice(0, i).reverse().find(l => l !== '');
      const next = lines.slice(i + 1).find(l => l !== '');
      if (prev?.startsWith('|') && next?.startsWith('|')) { return false; }
      return i > 0 && lines[i - 1] !== '';
    })
    .join('\n')
    .trim();
}

/** Parse a map into sections. Tolerant: a map without sections yields none. */
export function parseMap(html: string): ParsedMap {
  const placeholder = isPlaceholderMap(html);
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const body = html
    .replace(/<head\b[\s\S]*?<\/head>/i, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const sections: MapSection[] = [];
  for (const m of body.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)) {
    const id = attr(m[1], 'id');
    if (id === null) { continue; }
    const heading = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(m[2]);
    const inner = heading ? m[2].replace(heading[0], '') : m[2];
    sections.push({
      id,
      title: heading ? stripTags(heading[1]) : id,
      updated: attr(m[1], 'data-updated'),
      sources: attr(m[1], 'data-sources'),
      text: renderSectionText(inner),
    });
  }
  return { title: titleMatch ? stripTags(titleMatch[1]) : null, placeholder, sections };
}

export function formatSection(s: MapSection): string {
  const meta = [`id: ${s.id}`, `updated: ${s.updated ?? 'unknown'}`, `sources: ${s.sources || 'none declared'}`].join(' · ');
  return `## ${s.title}\n<!-- ${meta} -->\n\n${s.text}\n`;
}

export function formatList(map: ParsedMap): string {
  return map.sections.map(s => `${s.id}\t${s.updated ?? 'unknown'}\t${s.sources ?? ''}`).join('\n');
}

/** Resolve a skill slug (or a path) to its map file. Null when nothing is there. */
export function resolveMapPath(target: string, repoRoot: string): string | null {
  if (target.endsWith('.html')) {
    const abs = resolve(repoRoot, target);
    return existsSync(abs) ? abs : null;
  }
  const refs = join(repoRoot, '.agents', 'skills', target, 'references');
  const known = contextMapSkill(target);
  if (known && existsSync(join(refs, known.map))) { return join(refs, known.map); }
  if (!existsSync(refs)) { return null; }
  const candidate = readdirSync(refs).find(f => f.endsWith('-map.html'));
  return candidate ? join(refs, candidate) : null;
}

interface Args { target: string | null, section: string | null, list: boolean, help: boolean, unknown: string[] }

export function parseArgs(argv: string[]): Args {
  const out: Args = { target: null, section: null, list: false, help: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; }
    else if (a === '--list') { out.list = true; }
    else if (a === '--section') { out.section = argv[++i] ?? ''; }
    else if (a.startsWith('--section=')) { out.section = a.slice('--section='.length); }
    else if (a.startsWith('-')) { out.unknown.push(a); }
    else if (out.target === null) { out.target = a; }
    else { out.unknown.push(a); }
  }
  return out;
}

export interface Io { out: (s: string) => void, err: (s: string) => void }

const STDIO: Io = { out: (s) => { process.stdout.write(s); }, err: (s) => { process.stderr.write(s); } };

export function run(argv: string[], repoRoot: string, io: Io = STDIO): number {
  const args = parseArgs(argv);
  if (args.help || args.target === null) {
    io.out('usage: bun run context:map <skill-slug | path/to/map.html> [--section <id>] [--list]\n');
    return args.help ? 0 : 1;
  }
  if (args.unknown.length > 0 || args.section === '') {
    io.err(`context:map: bad arguments: ${[...args.unknown, args.section === '' ? '--section needs an id' : ''].filter(Boolean).join(', ')}\n`);
    return 1;
  }
  const path = resolveMapPath(args.target, repoRoot);
  if (path === null) {
    io.err(`context:map: no map found for \`${args.target}\` (expected .agents/skills/${args.target}/references/*-map.html)\n`);
    return 1;
  }
  const map = parseMap(readFileSync(path, 'utf8'));
  if (map.placeholder) {
    const generator = contextMapSkill(args.target)?.generator ?? 'project-context mode <aspect>';
    io.err(`context:map: \`${args.target}\` holds a PLACEHOLDER map: nothing has been generated yet. Run \`${generator}\`.\n`);
    return 0;
  }
  if (args.list) {
    io.out(`${formatList(map)}\n`);
    return 0;
  }
  if (args.section !== null) {
    const s = map.sections.find(x => x.id === args.section);
    if (!s) {
      io.err(`context:map: no section \`${args.section}\`. Known ids: ${map.sections.map(x => x.id).join(', ') || 'none'}\n`);
      return 1;
    }
    io.out(formatSection(s));
    return 0;
  }
  io.out(`# ${map.title ?? args.target}\n\n${map.sections.map(formatSection).join('\n')}`);
  return 0;
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2), process.cwd()));
}
