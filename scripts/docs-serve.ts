#!/usr/bin/env bun
/**
 * docs-serve.ts — local server for the human documentation site (`bun run docs`).
 *
 * Serves `docs/` on 127.0.0.1 and opens the portal (`docs/index.html`) in the
 * default browser. `/manifest.json` is built in memory on every request
 * (scripts/docs-manifest.ts), so a page added under `docs/` shows up in the
 * sidebar on the next refresh. Zero dependencies: Bun.serve + node built-ins.
 *
 * USAGE
 *   bun run docs                                  # port 4173, auto-open
 *   bun run docs -- --port 4000                   # custom port (also --port=4000)
 *   bun run docs -- --page core/setup/dbhub.html  # open one page inside the portal
 *   bun run docs -- --no-open                     # skip the browser (CI, headless)
 *
 * The business context maps are served IN PLACE from their skills
 * (`.agents/skills/<slug>/references/<map>.html`) under a virtual
 * `mapas-de-contexto/` folder, so the portal and the AI read the same file;
 * nothing is copied into `docs/` (agentic-qa-core/references/business-context-maps.md §8).
 *
 * When the port is busy the server tries the next one, up to 20 ports higher.
 * `bun run onboarding` is this same server opened on `core/empezar-aqui.html`.
 *
 * EXIT CODES
 *   0  clean shutdown (SIGINT / SIGTERM) or --help
 *   1  startup error (missing docs/, bad flag value, no free port, --page not found)
 */

import type { DocsFolder } from './docs-manifest.ts';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { CONTEXT_MAP_SKILLS, isPlaceholderMap } from '../cli/lib/context-maps.ts';
import { buildManifest, DEFAULT_ORDER, readPageMeta } from './docs-manifest.ts';

const REPO_ROOT = join(import.meta.dir, '..');
/** Virtual folder the business context maps are served under. */
export const CONTEXT_MAPS_DIR = 'mapas-de-contexto';
const DOCS_DIR = resolve(REPO_ROOT, 'docs');
export const DEFAULT_PORT = 4173;
const PORT_ATTEMPTS = 20;

const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  cyan: '\x1B[36m',
};

function err(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

const log = {
  success: (msg: string) => err(`${colors.green}+${colors.reset} ${msg}`),
  warn: (msg: string) => err(`${colors.yellow}!${colors.reset} ${msg}`),
  error: (msg: string) => err(`${colors.red}x${colors.reset} ${msg}`),
  dim: (msg: string) => err(`${colors.dim}${msg}${colors.reset}`),
  header: (msg: string) => err(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}`),
};

export interface ServeFlags {
  port: number
  noOpen: boolean
  page: string | null
  help: boolean
}

function parsePort(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!/^\d+$/.test(raw) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid --port value: ${JSON.stringify(raw)} (must be an integer between 1 and 65535).`);
  }
  return parsed;
}

/** Parse CLI flags. Throws on a malformed value; unknown flags are reported by the caller. */
export function parseServeArgs(argv: string[]): { flags: ServeFlags, unknown: string[] } {
  const flags: ServeFlags = { port: DEFAULT_PORT, noOpen: false, page: null, help: false };
  const unknown: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { flags.help = true; }
    else if (arg === '--no-open') { flags.noOpen = true; }
    else if (arg.startsWith('--port=')) { flags.port = parsePort(arg.slice('--port='.length)); }
    else if (arg === '--port') { flags.port = parsePort(argv[++i] ?? ''); }
    else if (arg.startsWith('--page=')) { flags.page = normalizePage(arg.slice('--page='.length)); }
    else if (arg === '--page') { flags.page = normalizePage(argv[++i] ?? ''); }
    else { unknown.push(arg); }
  }
  return { flags, unknown };
}

/** `docs/core/x.html`, `/core/x.html`, `core/x.html` -> `core/x.html`. */
export function normalizePage(raw: string): string {
  return raw.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^docs\//, '');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeFor(path: string): string | undefined {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? undefined : MIME[path.slice(dot).toLowerCase()];
}

/**
 * A 404 the reader can act on: an HTML request gets a page styled like the
 * site (same stylesheet, same theme), with a link back to the portal. Assets
 * keep the plain text body, and both stay a real 404 for scripts and tests.
 */
function notFound(pathname: string): Response {
  const isPage = pathname.endsWith('/') || /\.html?$/i.test(pathname) || !/\.[a-z0-9]+$/i.test(pathname);
  if (!isPage) { return new Response('Not found', { status: 404 }); }
  const safe = pathname.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[ch] ?? ch);
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Página no encontrada</title>
    <link rel="stylesheet" href="/assets/docs.css" />
    <script src="/assets/docs.js"></script>
  </head>
  <body>
    <div class="notice">
      <h1>Esa página no existe</h1>
      <p><code>${safe}</code> no está en <code>docs/</code>. Puede haber cambiado de nombre o de carpeta.</p>
      <p><a href="/">Volver al portal de la documentación</a></p>
    </div>
  </body>
</html>
`;
  return new Response(html, { status: 404, headers: { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' } });
}

/** Absolute path of a context map by its virtual page path (`mapas-de-contexto/<slug>.html`), or null. */
export function contextMapFile(repoRoot: string, page: string): string | null {
  const m = new RegExp(`^/?${CONTEXT_MAPS_DIR}/([a-z0-9-]+)\\.html$`).exec(page);
  const skill = m ? CONTEXT_MAP_SKILLS.find(s => s.slug === m[1]) : undefined;
  if (!skill) { return null; }
  const file = join(repoRoot, '.agents', 'skills', skill.slug, 'references', skill.map);
  return existsSync(file) ? file : null;
}

/** Sidebar folder for the context maps present on disk; null when there are none. */
export function contextMapsFolder(repoRoot: string): DocsFolder | null {
  const children: DocsFolder['children'] = [];
  for (const skill of CONTEXT_MAP_SKILLS) {
    const page = `${CONTEXT_MAPS_DIR}/${skill.slug}.html`;
    const file = contextMapFile(repoRoot, page);
    if (file === null) { continue; }
    const html = readFileSync(file, 'utf8');
    const meta = readPageMeta(html);
    children.push({
      type: 'page',
      path: page,
      title: meta.title ?? skill.slug,
      description: isPlaceholderMap(html)
        ? `Sin generar todavía: ejecuta ${skill.generator}.`
        : (meta.description ?? `Mapa de ${skill.slug}, servido desde su skill.`),
      order: children.length + 1,
    });
  }
  if (children.length === 0) { return null; }
  return {
    type: 'folder',
    path: CONTEXT_MAPS_DIR,
    title: 'Mapas de contexto',
    description: 'Los mapas que viven dentro de sus context skills (negocio, dominio, infraestructura), servidos en su lugar.',
    order: DEFAULT_ORDER - 1,
    index: null,
    children,
  };
}

/**
 * Request handler for a docs directory. Exported for the unit test. With a
 * `repoRoot`, the business context maps are served from their skills and
 * listed in the manifest.
 */
export function createDocsHandler(docsDir: string, repoRoot: string | null = null): (req: Request) => Promise<Response> {
  const docsAbs = resolve(docsDir);
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (pathname === '/manifest.json') {
      const manifest = buildManifest(docsAbs);
      const maps = repoRoot === null ? null : contextMapsFolder(repoRoot);
      if (maps !== null) { manifest.children.push(maps); }
      return new Response(JSON.stringify(manifest, null, 2), {
        headers: { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' },
      });
    }
    const mapFile = repoRoot === null ? null : contextMapFile(repoRoot, pathname);
    if (mapFile !== null) {
      return new Response(Bun.file(mapFile), { headers: { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' } });
    }
    if (pathname === '/' || pathname === '') { pathname = '/index.html'; }
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    }
    catch {
      return new Response('Bad request', { status: 400 });
    }
    // Traversal guard in the platform's own separator (see AGENTS.md §10).
    let candidate = resolve(join(docsAbs, decoded));
    if (candidate !== docsAbs && !candidate.startsWith(docsAbs + sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    if (decoded.endsWith('/')) { candidate = join(candidate, 'index.html'); }
    const file = Bun.file(candidate);
    if (!existsSync(candidate) || !(await file.exists())) {
      return notFound(decoded);
    }
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    const type = mimeFor(candidate);
    if (type !== undefined) { headers['Content-Type'] = type; }
    return new Response(file, { headers });
  };
}

function openInBrowser(url: string): void {
  let command: string;
  let args: string[];
  if (process.platform === 'darwin') { command = 'open'; args = [url]; }
  // `start` is a cmd.exe builtin; the empty "" is the window title argument.
  else if (process.platform === 'win32') { command = 'cmd'; args = ['/c', 'start', '', url]; }
  else { command = 'xdg-open'; args = [url]; }
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', (e) => {
      log.warn(`Could not auto-open the browser (${command}): ${e.message}. Open ${url} manually.`);
    });
    child.unref();
  }
  catch (e) {
    log.warn(`Could not auto-open the browser (${command}): ${(e as Error).message}. Open ${url} manually.`);
  }
}

function printHelp(): void {
  process.stdout.write(`docs — local server for the human documentation site (docs/)

USAGE:
  bun run docs [-- flags]

FLAGS:
  --port <N>     Port to listen on (default ${DEFAULT_PORT}; tries the next ${PORT_ATTEMPTS} when busy).
  --page <path>  Open this page inside the portal, e.g. core/setup/dbhub.html.
  --no-open      Do not open the browser.
  --help, -h     Show this help.

Pages live under docs/. docs/core/ is shipped by the boilerplate; add your own
pages under any other folder and they appear in the sidebar on refresh.
`);
}

function listen(port: number, fetch: (req: Request) => Promise<Response>): ReturnType<typeof Bun.serve> {
  let lastError: Error | null = null;
  for (let candidate = port; candidate < port + PORT_ATTEMPTS && candidate <= 65535; candidate++) {
    try {
      return Bun.serve({ hostname: '127.0.0.1', port: candidate, fetch });
    }
    catch (e) {
      lastError = e as Error;
      if (!/EADDRINUSE|address already in use|in use/i.test(lastError.message)) { throw lastError; }
    }
  }
  throw new Error(`No free port between ${port} and ${port + PORT_ATTEMPTS - 1} (${lastError?.message ?? 'unknown'}).`);
}

/** Start the server. Shared with scripts/onboarding.ts. */
export function serveDocs(argv: string[], title = 'docs server'): void {
  let parsed: ReturnType<typeof parseServeArgs>;
  try {
    parsed = parseServeArgs(argv);
  }
  catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }
  const { flags, unknown } = parsed;
  for (const flag of unknown) { log.warn(`Unknown flag: ${flag} (ignored)`); }
  if (flags.help) { printHelp(); process.exit(0); }

  if (!existsSync(join(DOCS_DIR, 'index.html'))) {
    log.error('docs/index.html not found. Run this from the repo root.');
    process.exit(1);
  }
  if (flags.page !== null && !existsSync(join(DOCS_DIR, flags.page)) && contextMapFile(REPO_ROOT, flags.page) === null) {
    log.error(`--page ${flags.page}: docs/${flags.page} does not exist.`);
    process.exit(1);
  }

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = listen(flags.port, createDocsHandler(DOCS_DIR, REPO_ROOT));
  }
  catch (e) {
    log.error(`Could not start the server: ${(e as Error).message}`);
    process.exit(1);
  }

  const base = `http://127.0.0.1:${server.port}/`;
  const url = flags.page === null ? base : `${base}#/${flags.page}`;
  log.header(title);
  if (server.port !== flags.port) { log.warn(`port ${flags.port} was busy, using ${server.port}`); }
  log.success(`listening on ${url}`);
  log.dim('serving docs/ · Ctrl+C to stop');

  const shutdown = (): void => {
    void server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (!flags.noOpen) { openInBrowser(url); }
}

if (import.meta.main) {
  serveDocs(process.argv.slice(2));
}
