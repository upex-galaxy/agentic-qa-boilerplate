#!/usr/bin/env bun
/**
 * lint-docs.ts — dead-link gate for the human documentation surface.
 *
 * Scans `docs/**` (`.html` and `.md`), the root `README.md`, `INSTALLER.md`
 * and `CONTEXT.md`, the nested READMEs (`.context/README.md` and the
 * `README.md` of each direct child of `.context/` and `packages/`), and the
 * HTML that GitHub Pages publishes (`packages/decks/**`, `packages/pages-home/**`),
 * and fails when:
 *
 *   - a RELATIVE link (`href="…"`, `src="…"`, markdown `](…)`) does not
 *     resolve to an existing file or directory, relative to the file that
 *     holds it. A published page (`PUBLISHED_MOUNTS`) is resolved the way the
 *     Pages site serves it: `./decks/x.html` from the portal is
 *     `packages/decks/x.html` in the repo, `./docs/` is `docs/`, and a link
 *     into a report tree the suite workflows publish (`REPORT_ROOTS`) is
 *     skipped, because no source file backs it;
 *   - an inline-code path (`` `docs/…` ``, `<code>docs/…</code>`) that starts
 *     with a known repo root does not exist, resolved from the repo root;
 *   - an HTML page under `docs/` lacks a `<title>` or a
 *     `<meta name="description">` (the site's sidebar and search read both).
 *     That is an error for the pages the boilerplate ships (`docs/core/**` and
 *     the portal `docs/index.html`) and a warning for project-owned pages.
 *   - the prose carries a volatile fact of one of the two regex-visible
 *     families of Critical Rule #17: a `path.ext:N` citation (`FILE-LINE`) or a
 *     claim about the present (`CURRENT-STATE`: "today", "as of <year>", a
 *     dated measurement, "since <version>", a tool version). Fenced blocks,
 *     `<pre>`, `<code class="block">`, `<script>` and `<style>` are skipped; a
 *     line marked `volatile-ok: <reason>` is kept. Severity per family in
 *     `VOLATILE_SEVERITY` (both families fail the gate).
 *   - a repo skill (a committed `.agents/skills/<slug>/SKILL.md`) is missing
 *     from the `AGENTS.md` section 5 skill router (`roster`). A project-local
 *     `<aspect>-context` skill is exempt (`isProjectLocalSkillPath`). The human
 *     pages are NOT checked for a skill list: they point to the generated
 *     `REGISTRY.md`, because enumerating the skills there is the mutable-set
 *     copy Critical Rule #17 forbids.
 *   - a `bun run <name>` quoted in `AGENTS.md` or in the doc surface (fenced
 *     blocks, decks and the Pages portal included) names a script
 *     `package.json` does not declare (`script`). Placeholders, file runs
 *     (`bun run scripts/x.ts`) and prose that only names the command
 *     (`bun run = npm run`) are ignored.
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
 * Their relative links and their `bun run` names ARE checked.
 *
 * Usage: bun scripts/lint-docs.ts   (exit 1 on any finding)
 */

import type { VolatileKind } from './lib/volatile-facts.ts';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isProjectLocalSkillPath } from '../cli/lib/updater-core.ts';
import { relativePosix, toPosix } from './lib/posix-path.ts';
import { isVolatileExemptPath, scanVolatile, volatileRemedy } from './lib/volatile-facts.ts';

/** Repo roots an inline-code path must start with to be checked. */
export const KNOWN_ROOTS = ['docs/', '.agents/', 'scripts/', 'cli/', 'tests/', 'config/', 'packages/'] as const;

export interface DocFinding {
  file: string
  line: number
  kind: 'link' | 'path' | 'meta' | 'file-line' | 'current-state' | 'roster' | 'script'
  target: string
  /** Only `meta` findings on project-owned pages are warnings; everything else fails the gate. */
  severity?: 'error' | 'warning'
}

/** Severity of the two volatile-facts families: both fail the gate (a `volatile-ok: <reason>` line or a `volatile-ok-file:` ledger is the only way to keep one). */
export const VOLATILE_SEVERITY: Record<VolatileKind, 'error' | 'warning'> = {
  'FILE-LINE': 'error',
  'CURRENT-STATE': 'error',
};

/** Volatile-facts findings for one file (Critical Rule #17). Exported for the unit test. */
export function lintDocVolatile(rel: string, raw: string): DocFinding[] {
  if (isVolatileExemptPath(rel)) { return []; }
  const findings: DocFinding[] = [];
  const seen = new Set<string>();
  for (const hit of scanVolatile(raw, { html: rel.endsWith('.html') })) {
    const key = `${hit.line}:${hit.kind}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    const kind = hit.kind === 'FILE-LINE' ? 'file-line' : 'current-state';
    findings.push({ file: rel, line: hit.line, kind, target: hit.match, severity: VOLATILE_SEVERITY[hit.kind] });
  }
  return findings;
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

/**
 * Documented optional files: described in prose, present only in some projects.
 * The retired command-alias overlay is one: nothing creates it any more, but a
 * project scaffolded earlier may still carry it, and the updater names it.
 */
export const OPTIONAL_PATHS = new Set<string>([
  '.agents/compatibility/command-aliases.project.json',
]);

/**
 * Where each published surface lives on the GitHub Pages site
 * (`.github/workflows/pages.yml` assembles it): site prefix -> repo directory.
 * The empty prefix is the site root, served from `packages/pages-home/`.
 * Longest prefix wins.
 */
export const PUBLISHED_MOUNTS: ReadonlyArray<readonly [site: string, repo: string]> = [
  ['decks/', 'packages/decks/'],
  ['docs/', 'docs/'],
  ['kata/', 'packages/kata-academy/'],
  ['', 'packages/pages-home/'],
];

/**
 * Top-level site folders no source file backs: the Allure trees the suite
 * workflows publish per environment (`<env>/<suite>/`). A link into one is a
 * runtime URL, not a repo path.
 */
export const REPORT_ROOTS = ['local', 'qa', 'staging', 'production'] as const;

/** Repo path (posix, relative) -> site path, or null when the file is not published HTML. */
export function sitePathOf(rel: string): string | null {
  if (!rel.endsWith('.html')) { return null; }
  for (const [site, repo] of PUBLISHED_MOUNTS) {
    if (repo !== '' && rel.startsWith(repo)) { return site + rel.slice(repo.length); }
  }
  return null;
}

/**
 * Resolve a relative link the way the Pages site does, for a published page.
 * Returns the repo path that backs the target, `'skip'` for a report tree, or
 * `'outside'` when the link climbs above the site root.
 */
export function resolvePublishedLink(siteFile: string, target: string): string | 'skip' | 'outside' {
  const parts = siteFile.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') { continue; }
    if (seg === '..') {
      if (parts.length === 0) { return 'outside'; }
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const site = parts.join('/') + (target.endsWith('/') && parts.length > 0 ? '/' : '');
  if ((REPORT_ROOTS as readonly string[]).includes(parts[0] ?? '')) { return 'skip'; }
  const sorted = [...PUBLISHED_MOUNTS].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, repo] of sorted) {
    const bare = prefix.replace(/\/$/, '');
    if (prefix === '' || site === bare || site.startsWith(prefix)) {
      const rest = prefix === '' ? site : site.slice(Math.min(site.length, prefix.length));
      return (repo + rest).replace(/\/$/, '') || repo.replace(/\/$/, '');
    }
  }
  return 'outside';
}

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

/**
 * The READMEs that live outside `docs/` one level down: `.context/` and its
 * direct children, and every `packages/*` package. Not a recursive walk:
 * `.context/PBI/` is a Jira cache that can hold thousands of files.
 * `.agents/README.md` is `lint-skills.ts` territory.
 */
function nestedReadmes(root: string): string[] {
  const out: string[] = [];
  for (const base of ['.context', 'packages']) {
    const dir = join(root, base);
    if (!existsSync(dir)) { continue; }
    const own = join(dir, 'README.md');
    if (existsSync(own)) { out.push(own); }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const readme = join(dir, entry.name, 'README.md');
      if (entry.isDirectory() && existsSync(readme)) { out.push(readme); }
    }
  }
  return out;
}

/** Every file the gate scans, absolute paths, sorted for stable output. */
export function collectDocFiles(root: string): string[] {
  const files: string[] = [];
  walk(join(root, 'docs'), ['.html', '.md'], files);
  walk(join(root, 'packages', 'decks'), ['.html'], files);
  walk(join(root, 'packages', 'pages-home'), ['.html'], files);
  for (const name of ['README.md', 'INSTALLER.md', 'CONTEXT.md']) {
    const full = join(root, name);
    if (existsSync(full)) { files.push(full); }
  }
  for (const readme of nestedReadmes(root)) {
    if (!files.includes(readme)) { files.push(readme); }
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
      const site = sitePathOf(rel);
      let resolved = resolve(dirname(file), decodeURIComponent(clean));
      let outside = false;
      if (site !== null) {
        const published = resolvePublishedLink(site, decodeURIComponent(clean));
        if (published === 'skip') { continue; }
        // A link above the site root has no target once published: always dead.
        outside = published === 'outside';
        if (!outside) { resolved = join(root, published); }
      }
      const fromRoot = toPosix(relativePosix(root, resolved));
      // A link that climbs into a root this checkout does not have is skipped.
      if (!outside && !fromRoot.startsWith('..') && !rootExists(root, fromRoot)) { continue; }
      if (outside || !existsSync(resolved)) {
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
  findings.push(...lintDocVolatile(rel, raw));
  return findings;
}

const ROUTER_HEADING = /^### Skills \(lazy-loaded by trigger phrase\)/m;

/** Slugs in the first column of the AGENTS.md section 5 router table, or null when the table is missing. */
export function routerSlugs(agentsMd: string): Set<string> | null {
  const start = agentsMd.search(ROUTER_HEADING);
  if (start < 0) { return null; }
  const after = agentsMd.slice(start).split('\n').slice(1);
  const next = after.findIndex(line => /^#{1,3} /.test(line));
  const section = next < 0 ? after : after.slice(0, next);
  const slugs = new Set<string>();
  for (const line of section) {
    const cell = /^\|\s*`([a-z0-9][a-z0-9-]*)`\s*\|/.exec(line);
    if (cell) { slugs.add(cell[1]); }
  }
  return slugs;
}

/** Repo skills: committed skill folders (a gitignored community install does not count). */
function repoSkills(root: string): string[] {
  const dir = join(root, '.agents', 'skills');
  if (!existsSync(dir)) { return []; }
  const candidates = readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
    .map(e => e.name);
  const ignored = gitIgnored(root, candidates.map(slug => `.agents/skills/${slug}/SKILL.md`));
  return candidates
    .filter(slug => !ignored.has(`.agents/skills/${slug}/SKILL.md`))
    .filter(slug => !isProjectLocalSkillPath(`.agents/skills/${slug}/SKILL.md`))
    .sort();
}

/** `roster` findings: repo skills missing from the AGENTS.md section 5 router. */
export function lintRoster(root: string): DocFinding[] {
  const agentsFile = join(root, 'AGENTS.md');
  const skills = repoSkills(root);
  if (!existsSync(agentsFile) || skills.length === 0) { return []; }
  const findings: DocFinding[] = [];
  const router = routerSlugs(readFileSync(agentsFile, 'utf8'));
  if (router === null) {
    return [{ file: 'AGENTS.md', line: 1, kind: 'roster', target: 'section 5 skill router table (### Skills heading not found)' }];
  }
  for (const slug of skills) {
    if (!router.has(slug)) { findings.push({ file: 'AGENTS.md', line: 1, kind: 'roster', target: slug }); }
  }
  return findings;
}

const BUN_RUN = /\bbun run(?:\s+--silent)?\s+([^\s`'"<>()[\]|,;\\]+)/g;

/** `script` findings: `bun run <name>` citations whose name `package.json` does not declare. */
function scriptNames(pkgFile: string): string[] {
  if (!existsSync(pkgFile)) { return []; }
  return Object.keys((JSON.parse(readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {});
}

export function lintScripts(root: string, files: string[]): DocFinding[] {
  const pkgFile = join(root, 'package.json');
  if (!existsSync(pkgFile)) { return []; }
  const rootScripts = scriptNames(pkgFile);
  const findings: DocFinding[] = [];
  for (const file of files) {
    const rel = relativePosix(root, file);
    // A package README quotes its own scripts as well as the root ones. Decks
    // and the Pages portal live under packages/ but teach the root scripts.
    const pkg = sitePathOf(rel) === null ? /^packages\/([^/]+)\//.exec(rel) : null;
    const scripts = new Set(pkg ? [...rootScripts, ...scriptNames(join(root, 'packages', pkg[1], 'package.json'))] : rootScripts);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(BUN_RUN)) {
      const name = match[1].replace(/[.:]+$/, '');
      if (!/^[a-z0-9]/i.test(name) || name.includes('/') || /\.[cm]?[jt]sx?$/.test(name) || PATTERN_CHARS.test(name)) { continue; }
      if (!scripts.has(name)) { findings.push({ file: rel, line: lineOf(text, match.index ?? 0), kind: 'script', target: name }); }
    }
  }
  return findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
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
  const isRef = (f: DocFinding): boolean => f.kind === 'link' || f.kind === 'path';
  const refs = raw.filter(isRef);
  const resolvedOf = (f: DocFinding): string => f.kind === 'path'
    ? stripSuffix(f.target).replace(/:\d+(?:-\d+)?$/, '')
    : relativePosix(root, resolve(root, dirname(f.file), decodeURIComponent(stripSuffix(f.target))));
  const ignored = gitIgnored(root, [...new Set(refs.map(resolvedOf))]);
  const findings = raw.filter(f => !isRef(f) || !ignored.has(resolvedOf(f)));
  const agentsFile = join(root, 'AGENTS.md');
  findings.push(...lintRoster(root));
  findings.push(...lintScripts(root, existsSync(agentsFile) ? [agentsFile, ...files] : files));
  return { files: files.length, findings };
}

if (import.meta.main) {
  const root = process.cwd();
  if (!statSync(root).isDirectory()) { process.exit(2); }
  const { files, findings } = lintDocs(root);
  const label = (f: DocFinding): string => {
    switch (f.kind) {
      case 'link': return 'dead link';
      case 'path': return 'missing path';
      case 'file-line': return 'FILE-LINE';
      case 'current-state': return 'CURRENT-STATE';
      case 'roster': return 'skill not listed';
      case 'script': return 'unknown script';
      default: return 'missing';
    }
  };
  const note = (f: DocFinding): string => f.kind === 'meta'
    ? '(project page: warning)'
    : f.kind === 'file-line' ? `(${volatileRemedy('FILE-LINE')})` : f.kind === 'current-state' ? `(${volatileRemedy('CURRENT-STATE')})` : '';
  const warnings = findings.filter(f => f.severity === 'warning');
  const errors = findings.filter(f => f.severity !== 'warning');
  for (const f of warnings) {
    console.warn(`  ! ${f.file}:${f.line}  ${label(f)}  ${f.target} ${note(f)}`);
  }
  if (errors.length === 0) {
    const tail = warnings.length > 0 ? `, ${warnings.length} warning(s)` : '';
    console.log(`✓ docs:check passed (${files} files, no dead links or paths${tail})`);
    process.exit(0);
  }
  console.error(`✗ docs:check found ${errors.length} problem(s) in ${files} files:\n`);
  for (const f of errors) {
    console.error(`  ${f.file}:${f.line}  ${label(f)}  ${f.target}`);
  }
  process.exit(1);
}
