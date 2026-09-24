#!/usr/bin/env bun
/**
 * lint-docs.ts — dead-link gate for the human documentation surface.
 *
 * Scans `docs/**` (`.html` and `.md`), the root `README.md`, `INSTALLER.md`
 * and `CONTEXT.md`, and `packages/decks/**` (`.html`), and fails when:
 *
 *   - a RELATIVE link (`href="…"`, `src="…"`, markdown `](…)`) does not
 *     resolve to an existing file or directory, relative to the file that
 *     holds it;
 *   - an inline-code path (`` `docs/…` ``, `<code>docs/…</code>`) that starts
 *     with a known repo root does not exist, resolved from the repo root;
 *   - an HTML page under `docs/` lacks a `<title>` or a
 *     `<meta name="description">` (the site's sidebar and search read both).
 *     That is an error for the pages the boilerplate ships (`docs/core/**` and
 *     the portal `docs/index.html`) and a warning for project-owned pages.
 *
 * External URLs, `mailto:` / `tel:` / `data:` / `javascript:`, bare anchors
 * and template placeholders are ignored; a `#fragment` or `?query` is stripped
 * before the lookup. A repo root that does not exist in this checkout is
 * skipped entirely, in both directions: an installed consumer repo has no
 * `packages/`, so neither the deck scan nor a `packages/…` citation can fail
 * there. Paths containing glob or placeholder characters (`*`, `{`, `<`, `$`)
 * are treated as patterns, not files.
 *
 * Two kinds of path are legitimately absent and never reported: a path git
 * IGNORES (generated or installed-at-setup: `.agents/prompts/…`, community
 * skills under `.agents/skills/`), and the few OPTIONAL files a doc describes
 * before anyone creates them (`OPTIONAL_PATHS`). The inline-path check does
 * not run on `packages/decks/**`: deck slides quote illustrative paths from
 * teaching examples, and other fronts add decks the gate must not trip on.
 * Their relative links ARE checked.
 *
 * Usage: bun scripts/lint-docs.ts   (exit 1 on any finding)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { relativePosix, toPosix } from './lib/posix-path.ts';

/** Repo roots an inline-code path must start with to be checked. */
export const KNOWN_ROOTS = ['docs/', '.agents/', 'scripts/', 'cli/', 'tests/', 'config/', 'packages/'] as const;

export interface DocFinding {
  file: string
  line: number
  kind: 'link' | 'path' | 'meta'
  target: string
  /** Only `meta` findings on project-owned pages are warnings; everything else fails the gate. */
  severity?: 'error' | 'warning'
}

/** Pages the boilerplate ships: a missing title or description there is an error, not a warning. */
export function isShippedDocPage(rel: string): boolean {
  return rel === 'docs/index.html' || rel.startsWith('docs/core/');
}

/** Title and description checks for one HTML page under `docs/`. */
export function lintDocMeta(rel: string, html: string): DocFinding[] {
  if (!rel.startsWith('docs/') || !rel.endsWith('.html')) { return []; }
  const head = html.split(/<\/head>/i)[0];
  const severity = isShippedDocPage(rel) ? 'error' : 'warning';
  const findings: DocFinding[] = [];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  if (!title || title[1].trim() === '') {
    findings.push({ file: rel, line: 1, kind: 'meta', target: '<title>', severity });
  }
  const description = (head.match(/<meta\s[^>]*>/gi) ?? []).find(tag => /\sname\s*=\s*["']description["']/i.test(tag));
  const content = description ? /\scontent\s*=\s*["']([^"']*)["']/i.exec(description) : null;
  if (!content || content[1].trim() === '') {
    findings.push({ file: rel, line: 1, kind: 'meta', target: '<meta name="description">', severity });
  }
  return findings;
}

/** Documented optional files: described in prose, created by the project when it wants them. */
export const OPTIONAL_PATHS = new Set<string>([
  '.agents/compatibility/command-aliases.project.json',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.svelte-kit']);

function walk(dir: string, exts: string[], out: string[]): void {
  if (!existsSync(dir)) { return; }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) { continue; }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, exts, out); }
    else if (exts.some(ext => entry.name.endsWith(ext))) { out.push(full); }
  }
}

/** Every file the gate scans, absolute paths, sorted for stable output. */
export function collectDocFiles(root: string): string[] {
  const files: string[] = [];
  walk(join(root, 'docs'), ['.html', '.md'], files);
  walk(join(root, 'packages', 'decks'), ['.html'], files);
  for (const name of ['README.md', 'INSTALLER.md', 'CONTEXT.md']) {
    const full = join(root, name);
    if (existsSync(full)) { files.push(full); }
  }
  return files.sort();
}

const IGNORED_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const PATTERN_CHARS = /[*{}<>$|&…]/;

function isCheckableLink(raw: string): boolean {
  const target = raw.trim();
  if (target === '' || IGNORED_SCHEME.test(target) || target.startsWith('/')) { return false; }
  return !PATTERN_CHARS.test(target);
}

function stripSuffix(target: string): string {
  return target.split('#')[0].split('?')[0];
}

/** Remove fenced code blocks from markdown, keeping line count stable. */
function blankFences(text: string): string {
  return text.replace(/^(```|~~~)[\s\S]*?\n\1/gm, block => block.replace(/[^\n]/g, ''));
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function rootExists(root: string, path: string): boolean {
  const top = path.split('/')[0];
  return existsSync(join(root, top));
}

/** Findings for one file. Exported for the unit test. */
export function lintDocFile(root: string, file: string): DocFinding[] {
  const findings: DocFinding[] = [];
  const raw = readFileSync(file, 'utf8');
  const isMarkdown = file.endsWith('.md');
  const text = isMarkdown ? blankFences(raw) : raw.replace(/<script[\s\S]*?<\/script>/gi, m => m.replace(/[^\n]/g, ''));
  const rel = relativePosix(root, file);
  const seen = new Set<string>();

  const linkPatterns = [
    /\b(?:href|src)\s*=\s*"([^"]*)"/g,
    /\b(?:href|src)\s*=\s*'([^']*)'/g,
  ];
  if (isMarkdown) { linkPatterns.push(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g); }

  for (const pattern of linkPatterns) {
    for (const match of text.matchAll(pattern)) {
      const target = match[1];
      if (!isCheckableLink(target)) { continue; }
      const clean = stripSuffix(target);
      if (clean === '') { continue; }
      const resolved = resolve(dirname(file), decodeURIComponent(clean));
      const fromRoot = toPosix(relativePosix(root, resolved));
      // A link that climbs into a root this checkout does not have is skipped.
      if (!fromRoot.startsWith('..') && !rootExists(root, fromRoot)) { continue; }
      if (!existsSync(resolved)) {
        const key = `link:${match.index}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({ file: rel, line: lineOf(text, match.index ?? 0), kind: 'link', target });
        }
      }
    }
  }

  const codePatterns = rel.startsWith('packages/decks/') ? [] : [/`([^`\n]+)`/g, /<code>([^<\n]+)<\/code>/g];
  for (const pattern of codePatterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = match[1].trim().replace(/[.,;:]+$/, '');
      if (!KNOWN_ROOTS.some(prefix => candidate.startsWith(prefix))) { continue; }
      if (/\s/.test(candidate) || PATTERN_CHARS.test(candidate)) { continue; }
      const clean = stripSuffix(candidate).replace(/:\d+(?:-\d+)?$/, '');
      if (!rootExists(root, clean) || OPTIONAL_PATHS.has(clean.replace(/\/$/, ''))) { continue; }
      if (!existsSync(join(root, clean))) {
        findings.push({ file: rel, line: lineOf(text, match.index ?? 0), kind: 'path', target: candidate });
      }
    }
  }
  findings.push(...lintDocMeta(rel, raw));
  return findings;
}

/** Targets git ignores, resolved from the repo root. Empty outside a git work tree. */
function gitIgnored(root: string, paths: string[]): Set<string> {
  if (paths.length === 0) { return new Set(); }
  const result = Bun.spawnSync(['git', 'check-ignore', '--stdin'], {
    cwd: root,
    stdin: new TextEncoder().encode(`${paths.join('\n')}\n`),
    stdout: 'pipe',
    stderr: 'ignore',
  });
  return new Set(result.stdout.toString().split('\n').map(line => line.trim()).filter(Boolean));
}

export function lintDocs(root: string): { files: number, findings: DocFinding[] } {
  const files = collectDocFiles(root);
  const raw = files.flatMap(file => lintDocFile(root, file));
  const refs = raw.filter(f => f.kind !== 'meta');
  const resolvedOf = (f: DocFinding): string => f.kind === 'path'
    ? stripSuffix(f.target).replace(/:\d+(?:-\d+)?$/, '')
    : relativePosix(root, resolve(root, dirname(f.file), decodeURIComponent(stripSuffix(f.target))));
  const ignored = gitIgnored(root, [...new Set(refs.map(resolvedOf))]);
  const findings = raw.filter(f => f.kind === 'meta' || !ignored.has(resolvedOf(f)));
  return { files: files.length, findings };
}

if (import.meta.main) {
  const root = process.cwd();
  if (!statSync(root).isDirectory()) { process.exit(2); }
  const { files, findings } = lintDocs(root);
  const label = (f: DocFinding): string => f.kind === 'link' ? 'dead link' : f.kind === 'path' ? 'missing path' : 'missing';
  const warnings = findings.filter(f => f.severity === 'warning');
  const errors = findings.filter(f => f.severity !== 'warning');
  for (const f of warnings) {
    console.warn(`  ! ${f.file}:${f.line}  ${label(f)}  ${f.target} (project page: warning)`);
  }
  if (errors.length === 0) {
    console.log(`✓ docs:check passed (${files} files, no dead links or paths)`);
    process.exit(0);
  }
  console.error(`✗ docs:check found ${errors.length} problem(s) in ${files} files:\n`);
  for (const f of errors) {
    console.error(`  ${f.file}:${f.line}  ${label(f)}  ${f.target}`);
  }
  process.exit(1);
}
