#!/usr/bin/env bun
/**
 * OpenAPI Sync Script
 *
 * Downloads OpenAPI spec from backend and generates TypeScript types.
 * By default, downloads AND generates types in one command.
 *
 * Usage:
 *   bun run api:sync                 # Download + generate types
 *   bun run api:sync --url <url>     # From specific URL
 *   bun run api:sync --no-types      # Only download, skip type generation
 */

import { $ } from 'bun';

// Paths using Bun's import.meta
const API_DIR = `${import.meta.dir}/../api`;
const CONFIG_FILE = `${API_DIR}/.openapi-config.json`;
const OPENAPI_FILE = `${API_DIR}/openapi.json`;
const TYPES_FILE = `${API_DIR}/openapi-types.ts`;

const DEFAULT_URL = 'http://localhost:64422/swagger/v1/swagger.json';

interface OpenAPIConfig {
  url: string
  lastSync: string
  endpointCount: number
}

interface OpenAPISpec {
  paths?: Record<string, unknown>
  [key: string]: unknown
}

function log(msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const icons = { info: 'ℹ', success: '✓', warn: '⚠', error: '✗' };
  const colors = { info: '\x1B[36m', success: '\x1B[32m', warn: '\x1B[33m', error: '\x1B[31m' };
  console.log(`${colors[type]}${icons[type]}\x1B[0m ${msg}`);
}

async function checkExistingFile(): Promise<void> {
  const file = Bun.file(OPENAPI_FILE);
  if (await file.exists()) {
    log('Existing openapi.json will be overwritten', 'warn');
  }
}

async function downloadSpec(url: string): Promise<{ success: boolean, endpointCount: number }> {
  log(`Downloading from ${url}...`, 'info');

  try {
    const response = await fetch(url);

    if (!response.ok) {
      log(`Failed: ${response.status} ${response.statusText}`, 'error');
      return { success: false, endpointCount: 0 };
    }

    const spec: OpenAPISpec = await response.json();
    const endpointCount = Object.keys(spec.paths ?? {}).length;

    await Bun.write(OPENAPI_FILE, JSON.stringify(spec, null, 2));
    log(`OpenAPI saved (${endpointCount} endpoints)`, 'success');

    return { success: true, endpointCount };
  }
  catch (error) {
    log('Connection failed. Is the backend running?', 'error');
    console.error(`  ${String(error)}`);
    return { success: false, endpointCount: 0 };
  }
}

async function generateTypes(): Promise<boolean> {
  log('Generating TypeScript types...', 'info');

  // Using Bun shell for cleaner command execution
  const result = await $`bunx openapi-typescript ${OPENAPI_FILE} -o ${TYPES_FILE}`
    .nothrow()
    .quiet();

  if (result.exitCode === 0) {
    log('Types generated at api/openapi-types.ts', 'success');
    return true;
  }

  log('Type generation failed', 'error');
  console.error(result.stderr.toString());
  return false;
}

async function saveConfig(url: string, endpointCount: number): Promise<void> {
  const config: OpenAPIConfig = {
    url,
    lastSync: new Date().toISOString(),
    endpointCount,
  };
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function showHelp(): void {
  console.log(`
OpenAPI Sync - Download spec and generate TypeScript types

Usage:
  bun run api:sync                  Download + generate types (default)
  bun run api:sync --url <url>      From specific URL
  bun run api:sync --no-types       Only download, skip type generation
  bun run api:sync --help           Show this help

Default URL: ${DEFAULT_URL}
`);
}

// Parse CLI args using Bun.argv
const args = Bun.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

const noTypes = args.includes('--no-types');
const urlIndex = args.indexOf('--url');
const url = urlIndex !== -1 ? args[urlIndex + 1] : DEFAULT_URL;

console.log('\n\x1B[1m🔄 OpenAPI Sync\x1B[0m\n');

// Step 1: Check existing file
await checkExistingFile();

// Step 2: Download spec
const { success, endpointCount } = await downloadSpec(url);
if (!success) {
  process.exit(1);
}

// Step 3: Generate types (unless --no-types)
if (!noTypes) {
  const typesOk = await generateTypes();
  if (!typesOk) {
    process.exit(1);
  }
}

// Step 4: Save config
await saveConfig(url, endpointCount);

console.log('\n\x1B[32m✓ Sync completed!\x1B[0m\n');
