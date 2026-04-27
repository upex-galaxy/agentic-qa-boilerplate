#!/usr/bin/env bun

/**
 * ============================================================================
 * ONBOARDING — Local static server for the boilerplate's onboarding page
 * ============================================================================
 *
 * Serves `docs/onboarding/` over HTTP on a local port and opens the page in
 * the default browser. Designed to be invoked via `bun run onboarding`.
 *
 * Why a tiny custom server instead of `python -m http.server` or similar?
 *   - Zero external dependencies (uses only `Bun.serve` + `node:child_process`).
 *   - Auto-opens the browser on macOS / Linux / Windows.
 *   - No-cache headers so edits to the onboarding HTML/CSS show up on reload.
 *   - Path-traversal guard so we never serve anything outside docs/onboarding/.
 *
 * Companion to:
 *   - `scripts/agents-setup.ts`   (interactive .agents/project.yaml setup)
 *   - `scripts/agents-lint.ts`    (linter for {{VAR}} / <<VAR>> usage)
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   bun run onboarding                       # default port 4321, auto-open
 *   bun run onboarding -- --port=4000        # custom port
 *   bun run onboarding -- --no-open          # skip opening the browser
 *   bun run onboarding -- --help             # show help
 *
 * The port can also come from the PORT env var; the --port flag wins when
 * both are set.
 *
 * ============================================================================
 * EXIT CODES
 * ============================================================================
 *
 *   0  clean shutdown (SIGINT / SIGTERM, or --help)
 *   1  startup error (missing docs/onboarding/, missing index.html, port in
 *      use, invalid --port value, or unexpected runtime error)
 *
 * ============================================================================
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// ============================================================================
// CONSTANTS
// ============================================================================

const REPO_ROOT = join(import.meta.dir, '..');
const ONBOARDING_DIR = join(REPO_ROOT, 'docs', 'onboarding');
const ONBOARDING_DIR_ABS = resolve(ONBOARDING_DIR);
const DEFAULT_PORT = 4321;

// ============================================================================
// COLORS / OUTPUT (mirrors scripts/agents-setup.ts)
// ============================================================================

const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  cyan: '\x1B[36m',
};

function out(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function err(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

const log = {
  info: (msg: string) => err(`${colors.blue}i${colors.reset} ${msg}`),
  success: (msg: string) => err(`${colors.green}+${colors.reset} ${msg}`),
  warn: (msg: string) => err(`${colors.yellow}!${colors.reset} ${msg}`),
  error: (msg: string) => err(`${colors.red}x${colors.reset} ${msg}`),
  dim: (msg: string) => err(`${colors.dim}${msg}${colors.reset}`),
  header: (msg: string) => err(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}`),
};

// ============================================================================
// CLI / FLAGS
// ============================================================================

interface CliFlags {
  port: number
  noOpen: boolean
  help: boolean
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    port: resolveDefaultPort(),
    noOpen: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '--no-open') {
      flags.noOpen = true;
      continue;
    }
    if (arg.startsWith('--port=')) {
      const raw = arg.slice('--port='.length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        log.error(`Invalid --port value: ${JSON.stringify(raw)} (must be a positive integer < 65536).`);
        process.exit(1);
      }
      flags.port = parsed;
      continue;
    }
    log.warn(`Unknown flag: ${arg} (ignored)`);
  }

  return flags;
}

function resolveDefaultPort(): number {
  const envPort = process.env.PORT;
  if (envPort === undefined || envPort.trim() === '') { return DEFAULT_PORT; }
  const parsed = Number.parseInt(envPort, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    log.warn(`Ignoring PORT=${JSON.stringify(envPort)} (not a valid port). Falling back to ${DEFAULT_PORT}.`);
    return DEFAULT_PORT;
  }
  return parsed;
}

function printHelp(): void {
  out(`onboarding — local static server for docs/onboarding/

USAGE:
  bun run onboarding [flags]

FLAGS:
  --port=<N>     Port to listen on. Default: ${DEFAULT_PORT}. Also reads PORT
                 from the environment; --port wins when both are set.
  --no-open      Do NOT open the browser automatically. Useful for headless
                 environments and CI.
  --help, -h     Show this help.

WHAT IT SERVES:
  Static files under docs/onboarding/. The root path '/' resolves to
  index.html. Every response carries 'Cache-Control: no-store' so changes to
  the onboarding HTML/CSS show up on a hard refresh. A path-traversal guard
  rejects any request that would escape docs/onboarding/.

BROWSER AUTO-OPEN:
  After the server is listening, the script invokes the platform-native opener
  on the URL:
    - macOS    -> open <url>
    - Linux    -> xdg-open <url>
    - Windows  -> start <url>
  Pass --no-open to skip this step.

SHUTDOWN:
  Ctrl+C (SIGINT) or SIGTERM stops the server cleanly and exits 0.

EXIT CODES:
  0  clean shutdown (SIGINT / SIGTERM, or --help)
  1  startup error (missing docs/onboarding/, missing index.html, port in
     use, invalid --port value, or unexpected runtime error)
`);
}

// ============================================================================
// BROWSER OPENER
// ============================================================================

function openInBrowser(url: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  }
  else if (platform === 'win32') {
    // `start` is a cmd.exe builtin; the empty "" is the window title arg
    // required when the URL contains spaces / quoted segments.
    command = 'cmd';
    args = ['/c', 'start', '', url];
  }
  else {
    // Linux, *BSD, etc.
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', (e) => {
      log.warn(`Could not auto-open browser (${command}): ${e.message}`);
      log.dim(`  Open ${url} manually.`);
    });
    child.unref();
    log.dim(`opening ${url} in default browser...`);
  }
  catch (e) {
    log.warn(`Could not auto-open browser (${command}): ${(e as Error).message}`);
    log.dim(`  Open ${url} manually.`);
  }
}

// ============================================================================
// MIME TYPES — small overlay for cases Bun.file() may not infer reliably.
// Bun.file() handles the common types via the file extension, so this map is
// only the safety net for edge cases.
// ============================================================================

const MIME_OVERRIDES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function mimeFor(path: string): string | undefined {
  const dot = path.lastIndexOf('.');
  if (dot < 0) { return undefined; }
  return MIME_OVERRIDES[path.slice(dot).toLowerCase()];
}

// ============================================================================
// REQUEST HANDLER
// ============================================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let pathname = url.pathname;
  if (pathname === '/' || pathname === '') { pathname = '/index.html'; }

  // Decode percent-encoded segments before resolving — otherwise `..%2f` style
  // payloads would slip past the traversal guard. URIError on malformed input
  // is treated as a 400.
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  }
  catch {
    return new Response('Bad request', { status: 400 });
  }

  // Resolve to an absolute path and verify it stays inside ONBOARDING_DIR_ABS.
  // Using `${dir}/` as the prefix prevents the classic `<dir>foo` bypass
  // (e.g. ONBOARDING_DIR_ABS = /a/b would otherwise match /a/b-evil).
  const candidate = resolve(join(ONBOARDING_DIR_ABS, decoded));
  const guardPrefix = `${ONBOARDING_DIR_ABS}/`;
  if (candidate !== ONBOARDING_DIR_ABS && !candidate.startsWith(guardPrefix)) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!existsSync(candidate)) {
    return new Response('Not found', { status: 404 });
  }

  const file = Bun.file(candidate);
  // `Bun.file().exists()` returns false for directories; treat that as 404 so
  // we never accidentally stream a directory entry.
  if (!(await file.exists())) {
    return new Response('Not found', { status: 404 });
  }

  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
  };
  const explicit = mimeFor(candidate);
  if (explicit !== undefined) {
    headers['Content-Type'] = explicit;
  }

  return new Response(file, { headers });
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  if (!existsSync(ONBOARDING_DIR)) {
    log.error(`docs/onboarding/ not found at ${relative(process.cwd(), ONBOARDING_DIR)}`);
    log.dim('Run this command from the repo root, or generate the onboarding page first.');
    process.exit(1);
  }
  if (!existsSync(join(ONBOARDING_DIR, 'index.html'))) {
    log.error('docs/onboarding/index.html not found.');
    log.dim('The onboarding page must include an index.html entry point.');
    process.exit(1);
  }

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      port: flags.port,
      fetch: handleRequest,
      error(e) {
        log.error(`Request error: ${e.message}`);
        if (process.env.DEBUG !== undefined) { err(String(e.stack ?? e)); }
        return new Response('Internal server error', { status: 500 });
      },
    });
  }
  catch (e) {
    const msg = (e as Error).message;
    if (/EADDRINUSE|address already in use/i.test(msg)) {
      log.error(`Port ${flags.port} is already in use.`);
      log.dim('Try a different port: bun run onboarding -- --port=4322');
    }
    else {
      log.error(`Could not start server: ${msg}`);
    }
    process.exit(1);
  }

  const url = `http://localhost:${server.port}`;
  log.header('onboarding server');
  log.success(`listening on ${url}`);
  log.dim(`serving from: ${relative(process.cwd(), ONBOARDING_DIR)}`);
  log.dim('Ctrl+C to stop');

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) { return; }
    shuttingDown = true;
    err('');
    log.info(`Shutting down (${signal})...`);
    void server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  if (!flags.noOpen) {
    openInBrowser(url);
  }
}

main().catch((e) => {
  log.error(`Unexpected error: ${(e as Error).message}`);
  if (process.env.DEBUG !== undefined) {
    err(String((e as Error).stack ?? e));
  }
  process.exit(1);
});
