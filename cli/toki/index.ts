#!/usr/bin/env bun
/**
 * WokiToki (`toki`) - CLI entry point.
 *
 * Blocking command: read + validate a spec, serve the UI, open the browser,
 * await the browser's `POST /submit`, then write the result and print it.
 *
 * STDOUT DISCIPLINE (load-bearing): the ONLY thing ever written to
 * process.stdout in the entire tool is the final result JSON, emitted once
 * here. Everything else - banners, the waiting URL, errors - goes to stderr via
 * console.error. NEVER use console.log (it writes to stdout).
 *
 * Exit codes (repo convention): 0 ok | 1 timeout/runtime | 2 spec validation.
 *
 * Bun built-ins only, zero external deps (stays extractable).
 */

import type { Result } from './schema.ts';
import type { ServeHandle } from './server.ts';
import { render } from './render.ts';
import { SpecError, validateSpec } from './schema.ts';
import { serve, TimeoutError } from './server.ts';

// ============================================================================
// ARG PARSING (self-contained, mirrors cli/xray/lib/parser.ts style)
// ============================================================================

interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | true>
}

// Flags that take a value; everything else is boolean and never consumes the
// next token (so `toki --no-open <spec>` keeps <spec> as a positional).
const VALUE_FLAGS = new Set(['port', 'timeout']);

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (VALUE_FLAGS.has(key) && next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
      }
      else {
        flags[key] = true;
        i += 1;
      }
    }
    else {
      positional.push(arg);
      i += 1;
    }
  }

  return { positional, flags };
}

function getFlag(flags: ParsedArgs['flags'], name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

function getBoolFlag(flags: ParsedArgs['flags'], name: string): boolean {
  return flags[name] === true || flags[name] === 'true';
}

// ============================================================================
// HELP
// ============================================================================

const HELP = `toki - WokiToki interactive feedback CLI

USAGE
  toki <specPath> [options]

ARGUMENTS
  specPath            Path to a spec JSON file (required)

OPTIONS
  --port <n>         Preferred port (default: 4747; auto-increments if busy)
  --timeout <min>    Minutes to wait for a submission (fractional ok, default: 1440 = 24h)
  --no-open          Do not auto-open the browser (still prints the URL)
  --help             Show this help

OUTPUT
  On submit: writes .toki/result-<name>.json and prints the result JSON to
  stdout (the ONLY thing on stdout). Banners/errors go to stderr.

EXIT CODES
  0  ok    1  timeout/runtime    2  spec validation
`;

const DEFAULT_PORT = 4747;
const DEFAULT_TIMEOUT_MINUTES = 1440;

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (getBoolFlag(flags, 'help') || getBoolFlag(flags, 'h')) {
    console.error(HELP);
    process.exit(0);
  }

  const specPath = positional[0];
  if (!specPath) {
    console.error('[toki] error: missing required <specPath> argument.\n');
    console.error(HELP);
    process.exit(2);
  }

  const port = parsePort(getFlag(flags, 'port'));
  const timeoutMinutes = parseTimeout(getFlag(flags, 'timeout'));
  const noOpen = getBoolFlag(flags, 'no-open');

  // Read + validate the spec.
  let raw: unknown;
  try {
    raw = await Bun.file(specPath).json();
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[toki] error: could not read spec file "${specPath}": ${message}`);
    process.exit(2);
  }

  let spec;
  try {
    spec = validateSpec(raw);
  }
  catch (error) {
    if (error instanceof SpecError) {
      console.error(`[toki] invalid spec at ${error.path}: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }

  // Short run id for the fallback result filename + logging.
  const id = Date.now().toString(36);

  // Start serving (blocking handshake). Wire SIGINT teardown.
  let handle: ServeHandle | null = null;
  let boundUrl = `http://localhost:${port}/`;

  const onSigint = (): void => {
    console.error('\n[toki] interrupted (SIGINT). Stopping server.');
    handle?.stop();
    process.exit(130);
  };
  process.on('SIGINT', onSigint);

  handle = serve(spec, {
    port,
    timeoutMs: timeoutMinutes * 60000,
    render,
    onListening: (info) => {
      boundUrl = info.url;
    },
  });

  // Open the browser unless suppressed. Always print the waiting URL to stderr.
  if (!noOpen) {
    openBrowser(boundUrl);
  }
  console.error(`[toki] open this URL to respond: ${boundUrl}`);

  let result;
  try {
    result = await handle.result;
  }
  catch (error) {
    if (error instanceof TimeoutError) {
      console.error(`[toki] ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
  finally {
    process.off('SIGINT', onSigint);
  }

  // Persist a backup. Derive the name from spec-NAME.json when it matches.
  const resultName = deriveResultName(specPath, id);

  // Decode any user-pasted images (data URLs in transit) to `.toki/` files and
  // rewrite each entry in-place to the file path BEFORE either write, so both
  // the backup and the authoritative stdout copy reference paths the AI can
  // Read — never inline base64. Mutates `result`.
  await persistImages(result, resultName);

  const outPath = `.toki/result-${resultName}.json`;
  try {
    await Bun.write(outPath, `${JSON.stringify(result, null, 2)}\n`);
    console.error(`[toki] result written to ${outPath}`);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[toki] warning: could not write ${outPath}: ${message}`);
  }

  // THE single stdout write. Nothing else ever touches stdout.
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

// ============================================================================
// IMAGE PERSISTENCE
// ============================================================================

/** `data:image/png;base64,...` → capture the mime in group 1. */
const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s;

/** Map an image mime to a file extension. Unknown image mimes → `bin`. */
function extForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}

/** Replace anything outside [A-Za-z0-9._-] (i.e. not word/dot/hyphen) with `_`. */
function sanitizeForFilename(value: string): string {
  return value.replace(/[^\w.-]/g, '_');
}

/**
 * Walk every block + every block.rows[] entry; for each `images` array, decode
 * any `data:` URL entry to bytes, write it to
 * `.toki/<resultName>-img-<blockId>[-<rowId>]-<n>.<ext>`, and replace the entry
 * with that relative path. Entries that are already plain paths pass through
 * untouched. A failed decode/write logs a stderr warning and drops the entry
 * (never throws — must not break the handshake). Mutates `result` in place.
 */
export async function persistImages(result: Result, resultName: string): Promise<void> {
  const safeName = sanitizeForFilename(resultName);

  for (const block of result.blocks) {
    if (Array.isArray(block.images)) {
      block.images = await persistImageList(block.images, safeName, block.id, null);
    }
    if (Array.isArray(block.rows)) {
      for (const row of block.rows) {
        if (Array.isArray(row.images)) {
          row.images = await persistImageList(row.images, safeName, block.id, row.id);
        }
      }
    }
  }
}

/**
 * Persist one `images` array, returning a new array where every decoded data
 * URL is replaced by its written `.toki/` path. Non-data-URL entries (already
 * paths) pass through; entries that fail to decode/write are dropped with a
 * stderr warning.
 */
async function persistImageList(
  images: string[],
  safeName: string,
  blockId: string,
  rowId: string | null,
): Promise<string[]> {
  const out: string[] = [];
  let n = 0;
  for (const entry of images) {
    const match = DATA_URL_RE.exec(entry);
    if (!match) {
      // Already a plain path (or non-data string) — pass through unchanged.
      out.push(entry);
      continue;
    }
    n += 1;
    const mime = match[1];
    const b64 = match[2];
    const ext = extForMime(mime);
    const safeBlock = sanitizeForFilename(blockId);
    const rowPart = rowId !== null ? `-${sanitizeForFilename(rowId)}` : '';
    const path = `.toki/${safeName}-img-${safeBlock}${rowPart}-${n}.${ext}`;
    try {
      const bytes = Buffer.from(b64, 'base64');
      await Bun.write(path, bytes);
      out.push(path);
      console.error(`[toki] image written to ${path}`);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[toki] warning: could not write image ${path}: ${message} (dropped)`);
    }
  }
  return out;
}

// ============================================================================
// HELPERS
// ============================================================================

function parsePort(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_PORT;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) {
    console.error(`[toki] error: invalid --port "${raw}".`);
    process.exit(2);
  }
  return value;
}

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_TIMEOUT_MINUTES;
  }
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`[toki] error: invalid --timeout "${raw}" (minutes, fractional allowed).`);
    process.exit(2);
  }
  return value;
}

/**
 * Derive the result filename. A spec named `spec-NAME.json` yields `NAME`
 * (so `.toki/spec-demo.json` -> `.toki/result-demo.json`). Otherwise fall back
 * to the short epoch id.
 */
function deriveResultName(specPath: string, id: string): string {
  const base = specPath.split(/[/\\]/).pop() ?? specPath;
  const match = /^spec-(.+)\.json$/.exec(base);
  return match ? match[1] : id;
}

function openBrowser(url: string): void {
  let cmd: string[];
  switch (process.platform) {
    case 'darwin':
      cmd = ['open', url];
      break;
    case 'win32':
      cmd = ['cmd', '/c', 'start', '', url];
      break;
    default:
      cmd = ['xdg-open', url];
      break;
  }
  try {
    Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[toki] could not auto-open browser (${message}). Open ${url} manually.`);
  }
}

// ============================================================================
// RUN
// ============================================================================

// Only auto-run when invoked directly as the CLI entry point. Importing this
// module (e.g. to unit-test persistImages) must NOT kick off the server.
if (import.meta.main) {
  main().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(`[toki] ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }
    else {
      console.error(`[toki] ${String(error)}`);
    }
    process.exit(1);
  });
}
