#!/usr/bin/env bun
/**
 * docs-manifest.ts — the table of contents of the human documentation site.
 *
 * Walks `docs/` and returns the tree the portal (`docs/index.html`) renders as
 * its sidebar. The dev server (`bun run docs`) builds it in memory on every
 * request to `/manifest.json`, so a new page shows up on refresh. This CLI
 * (`bun run docs:build`) writes the same tree to `docs/manifest.json` for
 * static hosting. The file is generated and gitignored: never hand-edit it.
 *
 * Rules:
 *   - one page per `*.html` under `docs/`, except the portal `docs/index.html`;
 *   - `title` from `<title>`, `description` from `<meta name="description">`,
 *     `order` from `<meta name="docs-order" content="10">` (default 1000);
 *   - a folder's own `index.html` names the folder
 *     (`<meta name="docs-section-title">`, falling back to its `<title>`),
 *     gives it an order, and becomes the page the folder label opens;
 *   - a folder with no index is named from its directory (Title Case);
 *   - `assets/` directories, dotfiles and dot-directories are skipped;
 *   - siblings sort by order, then by title.
 *
 * Usage: bun scripts/docs-manifest.ts [--stdout]
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_ORDER = 1000;

export interface DocsPage {
  type: 'page'
  /** Path relative to `docs/`, forward slashes (`core/setup/dbhub.html`). */
  path: string
  title: string
  description: string
  order: number
}

export interface DocsFolder {
  type: 'folder'
  /** Path relative to `docs/` (`core/setup`). */
  path: string
  title: string
  description: string
  order: number
  /** The folder's own `index.html`, when it has one. */
  index: string | null
  children: DocsNode[]
}

export type DocsNode = DocsPage | DocsFolder;

export interface DocsManifest {
  generatedAt: string
  children: DocsNode[]
}

const SKIP_DIRS = new Set(['assets', 'node_modules']);

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html: string, name: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const nameMatch = /\bname\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (nameMatch?.[1].toLowerCase() !== name) { continue; }
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag) ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    return content ? decodeEntities(content[1]) : '';
  }
  return null;
}

export interface PageMeta {
  title: string | null
  description: string | null
  order: number
  sectionTitle: string | null
}

/** Read the metadata the manifest needs out of one page's HTML. */
export function readPageMeta(html: string): PageMeta {
  const head = html.split(/<\/head>/i)[0];
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const rawOrder = metaContent(head, 'docs-order');
  const parsed = rawOrder === null ? Number.NaN : Number.parseFloat(rawOrder);
  return {
    title: titleMatch ? decodeEntities(titleMatch[1]) || null : null,
    description: metaContent(head, 'description'),
    order: Number.isFinite(parsed) ? parsed : DEFAULT_ORDER,
    sectionTitle: metaContent(head, 'docs-section-title'),
  };
}

/** `metodologia` -> `Metodologia`, `sql-cookbook` -> `Sql Cookbook`. */
export function titleCase(name: string): string {
  return name
    .replace(/\.html$/i, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function compareNodes(a: DocsNode, b: DocsNode): number {
  if (a.order !== b.order) { return a.order - b.order; }
  return a.title.localeCompare(b.title, 'es');
}

function walkFolder(docsDir: string, rel: string): DocsNode[] {
  const abs = rel === '' ? docsDir : join(docsDir, rel);
  const nodes: DocsNode[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) { continue; }
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) { continue; }
      const children = walkFolder(docsDir, childRel);
      const indexPath = `${childRel}/index.html`;
      const hasIndex = existsSync(join(docsDir, indexPath));
      if (children.length === 0 && !hasIndex) { continue; }
      const meta = hasIndex ? readPageMeta(readFileSync(join(docsDir, indexPath), 'utf8')) : null;
      nodes.push({
        type: 'folder',
        path: childRel,
        title: meta?.sectionTitle || meta?.title || titleCase(entry.name),
        description: meta?.description ?? '',
        order: meta?.order ?? DEFAULT_ORDER,
        index: hasIndex ? indexPath : null,
        children,
      });
      continue;
    }
    if (!entry.name.toLowerCase().endsWith('.html')) { continue; }
    // The portal itself (root) and a folder's landing page (carried by the folder) are not leaves.
    if (entry.name === 'index.html') { continue; }
    const meta = readPageMeta(readFileSync(join(abs, entry.name), 'utf8'));
    nodes.push({
      type: 'page',
      path: childRel,
      title: meta.title ?? titleCase(entry.name),
      description: meta.description ?? '',
      order: meta.order,
    });
  }
  return nodes.sort(compareNodes);
}

/** Build the manifest for a `docs/` directory. Empty tree when the directory is missing. */
export function buildManifest(docsDir: string, now: Date = new Date()): DocsManifest {
  return {
    generatedAt: now.toISOString(),
    children: existsSync(docsDir) ? walkFolder(docsDir, '') : [],
  };
}

/** Every page path in the manifest, landing pages included, depth-first. */
export function manifestPaths(nodes: DocsNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === 'page') { out.push(node.path); continue; }
    if (node.index) { out.push(node.index); }
    out.push(...manifestPaths(node.children));
  }
  return out;
}

if (import.meta.main) {
  const docsDir = join(process.cwd(), 'docs');
  const manifest = buildManifest(docsDir);
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (process.argv.includes('--stdout')) {
    process.stdout.write(json);
  }
  else {
    writeFileSync(join(docsDir, 'manifest.json'), json);
    console.log(`✓ docs/manifest.json written (${manifestPaths(manifest.children).length} pages)`);
  }
}
