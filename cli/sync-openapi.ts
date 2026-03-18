#!/usr/bin/env bun
/**
 * OpenAPI Sync Script
 *
 * Downloads OpenAPI/Swagger specification from multiple sources
 * and generates TypeScript types.
 *
 * Sources:
 *   1. URL     — Any HTTP endpoint serving an OpenAPI spec (Swagger UI, etc.)
 *   2. GitHub  — A file inside a GitHub repository (via `gh` CLI)
 *   3. Local   — An existing file on disk
 *
 * Usage:
 *   bun run api:sync                              # Download + generate types (interactive)
 *   bun run api:sync --url <endpoint>             # From URL + generate types
 *   bun run api:sync --file ./path/to/spec.json   # From local file + generate types
 *   bun run api:sync --no-types                   # Skip type generation
 *   bun run api:sync --config                     # Use saved config
 */

import { createInterface } from 'node:readline';
import { $ } from 'bun';

// ============================================
// Configuration
// ============================================

const API_DIR = `${import.meta.dir}/../api`;
const CONFIG_FILE = `${API_DIR}/.openapi-config.json`;
const TYPES_FILE = `${API_DIR}/openapi-types.ts`;

type SourceType = 'url' | 'github' | 'local';

interface OpenAPIConfig {
  source: SourceType
  url?: string
  repo?: string
  branch?: string
  filePath?: string
  localPath?: string
  specFile?: string
  lastSync?: string
  endpointCount?: number
}

interface OpenAPISpec {
  paths?: Record<string, unknown>
  [key: string]: unknown
}

// ============================================
// Utilities
// ============================================

function log(msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const icons = { info: 'ℹ', success: '✓', warn: '⚠', error: '✗' };
  const colors = { info: '\x1B[36m', success: '\x1B[32m', warn: '\x1B[33m', error: '\x1B[31m' };
  console.log(`${colors[type]}${icons[type]}\x1B[0m ${msg}`);
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const defaultStr = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${defaultStr}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

function detectSpecFilename(source: string): string {
  const ext = source.toLowerCase();
  if (ext.endsWith('.yaml') || ext.endsWith('.yml')) { return 'openapi.yaml'; }
  return 'openapi.json';
}

function getOpenAPIFilePath(config: OpenAPIConfig): string {
  return `${API_DIR}/${config.specFile || 'openapi.json'}`;
}

async function loadConfig(): Promise<OpenAPIConfig | null> {
  const file = Bun.file(CONFIG_FILE);
  if (await file.exists()) {
    try { return await file.json(); }
    catch { return null; }
  }
  return null;
}

async function saveConfig(config: OpenAPIConfig): Promise<void> {
  await $`mkdir -p ${API_DIR}`.quiet();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
  log(`Configuration saved to ${CONFIG_FILE}`, 'success');
}

// ============================================
// Source: URL
// ============================================

async function downloadFromUrl(url: string, outputPath: string): Promise<{ success: boolean, endpointCount: number }> {
  log(`Downloading from ${url}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      log(`Failed: ${response.status} ${response.statusText}`, 'error');
      return { success: false, endpointCount: 0 };
    }

    const contentType = response.headers.get('content-type') || '';
    let content: string;
    let endpointCount = 0;

    if (contentType.includes('json')) {
      const spec: OpenAPISpec = await response.json();
      endpointCount = Object.keys(spec.paths ?? {}).length;
      content = JSON.stringify(spec, null, 2);
    }
    else {
      content = await response.text();
    }

    if (!content.includes('openapi') && !content.includes('swagger') && !content.includes('paths')) {
      log('Downloaded content does not appear to be a valid OpenAPI specification', 'error');
      return { success: false, endpointCount: 0 };
    }

    await Bun.write(outputPath, content);
    log(`OpenAPI saved (${endpointCount} endpoints)`, 'success');
    return { success: true, endpointCount };
  }
  catch (error) {
    log('Connection failed. Is the backend running?', 'error');
    console.error(`  ${String(error)}`);
    return { success: false, endpointCount: 0 };
  }
}

// ============================================
// Source: GitHub
// ============================================

async function downloadFromGitHub(repo: string, branch: string, filePath: string, outputPath: string): Promise<{ success: boolean, endpointCount: number }> {
  log(`Downloading from ${repo}/${filePath}...`);

  try {
    // Method 1: gh api (works for private repos)
    const result = await $`gh api /repos/${repo}/contents/${filePath} -H "Accept: application/vnd.github.raw" --jq .`.nothrow().quiet();

    if (result.exitCode === 0 && result.stdout.toString().trim()) {
      const content = result.stdout.toString();
      await Bun.write(outputPath, content);
      log(`OpenAPI saved to ${outputPath}`, 'success');
      return { success: true, endpointCount: 0 };
    }

    // Method 2: raw URL fallback (public repos only)
    log('gh api failed, trying raw URL fallback...', 'warn');
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`;
    return await downloadFromUrl(rawUrl, outputPath);
  }
  catch (error) {
    log(`Download failed: ${String(error)}`, 'error');
    return { success: false, endpointCount: 0 };
  }
}

// ============================================
// Source: Local File
// ============================================

async function copyFromLocal(localPath: string, outputPath: string): Promise<{ success: boolean, endpointCount: number }> {
  const file = Bun.file(localPath);
  log(`Copying from ${localPath}...`);

  if (!(await file.exists())) {
    log(`File not found: ${localPath}`, 'error');
    return { success: false, endpointCount: 0 };
  }

  try {
    const content = await file.text();
    await Bun.write(outputPath, content);
    log(`OpenAPI copied to ${outputPath}`, 'success');
    return { success: true, endpointCount: 0 };
  }
  catch (error) {
    log(`Copy failed: ${String(error)}`, 'error');
    return { success: false, endpointCount: 0 };
  }
}

// ============================================
// Interactive Configuration
// ============================================

async function getConfigInteractive(): Promise<OpenAPIConfig> {
  console.log('\n\x1B[1m📋 OpenAPI Sync Configuration\x1B[0m\n');
  console.log('  \x1B[36m1)\x1B[0m URL     — Download from an HTTP endpoint (Swagger, localhost, etc.)');
  console.log('  \x1B[36m2)\x1B[0m GitHub  — Download from a GitHub repository');
  console.log('  \x1B[36m3)\x1B[0m Local   — Copy from a file on your machine\n');

  const choice = await prompt('Select source [1/2/3]', '1');

  if (choice === '2') {
    const repo = await prompt('GitHub repository (owner/repo)', 'org/backend-repo');
    const branch = await prompt('Branch name', 'main');
    const filePath = await prompt('Path to OpenAPI file in repo', 'docs/openapi.yaml');
    return { source: 'github', repo, branch, filePath, specFile: detectSpecFilename(filePath) };
  }

  if (choice === '3') {
    const localPath = await prompt('Path to local OpenAPI file', './backend/docs/openapi.json');
    const file = Bun.file(localPath);
    if (!(await file.exists())) {
      log(`File not found: ${localPath}`, 'error');
      process.exit(1);
    }
    return { source: 'local', localPath, specFile: detectSpecFilename(localPath) };
  }

  const url = await prompt('OpenAPI spec URL', 'http://localhost:3000/api/openapi');
  return { source: 'url', url, specFile: detectSpecFilename(url) };
}

// ============================================
// Sync Dispatcher
// ============================================

async function syncOpenAPI(config: OpenAPIConfig): Promise<{ success: boolean, endpointCount: number }> {
  const outputPath = getOpenAPIFilePath(config);
  await $`mkdir -p ${API_DIR}`.quiet();

  const existing = Bun.file(outputPath);
  if (await existing.exists()) {
    log('Existing spec will be overwritten', 'warn');
  }

  switch (config.source) {
    case 'url': return downloadFromUrl(config.url!, outputPath);
    case 'github': return downloadFromGitHub(config.repo!, config.branch!, config.filePath!, outputPath);
    case 'local': return copyFromLocal(config.localPath!, outputPath);
    default:
      log(`Unknown source: ${String(config.source)}`, 'error');
      return { success: false, endpointCount: 0 };
  }
}

// ============================================
// Type Generation
// ============================================

async function generateTypes(specFilePath: string): Promise<boolean> {
  log('Generating TypeScript types...');

  const result = await $`bunx openapi-typescript ${specFilePath} -o ${TYPES_FILE}`.nothrow().quiet();

  if (result.exitCode === 0) {
    log('Types generated at api/openapi-types.ts', 'success');
    return true;
  }

  log('Type generation failed', 'error');
  console.error(result.stderr.toString());
  return false;
}

// ============================================
// CLI Entry Point
// ============================================

const args = Bun.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
OpenAPI Sync - Download spec and generate TypeScript types

Sources (pick one):
  --url <endpoint>      Download from an HTTP URL (Swagger endpoint, etc.)
  --file <path>         Copy from a local file on disk
  (no flag)             Interactive mode — choose URL, GitHub, or local

Options:
  -c, --config          Use saved configuration (skip prompts)
  --no-types            Skip TypeScript type generation
  -h, --help            Show this help

Examples:
  bun run api:sync                                           # Interactive + types
  bun run api:sync --url http://localhost:3000/api/openapi   # From URL + types
  bun run api:sync --file ./backend/docs/openapi.yaml        # From local file + types
  bun run api:sync -c                                        # Re-sync with saved config
  bun run api:sync --url http://localhost:3000/api/openapi --no-types  # No types
`);
  process.exit(0);
}

const noTypes = args.includes('--no-types');
const useConfig = args.includes('--config') || args.includes('-c');
const urlIndex = args.indexOf('--url');
const urlArg = urlIndex !== -1 ? args[urlIndex + 1] : null;
const fileIndex = args.indexOf('--file');
const fileArg = fileIndex !== -1 ? args[fileIndex + 1] : null;

console.log('\n\x1B[1m🔄 OpenAPI Sync\x1B[0m\n');

// Resolve config
let config: OpenAPIConfig | null = null;

if (urlArg) {
  config = { source: 'url', url: urlArg, specFile: detectSpecFilename(urlArg) };
}
else if (fileArg) {
  const file = Bun.file(fileArg);
  if (!(await file.exists())) {
    log(`File not found: ${fileArg}`, 'error');
    process.exit(1);
  }
  config = { source: 'local', localPath: fileArg, specFile: detectSpecFilename(fileArg) };
}
else if (useConfig) {
  config = await loadConfig();
  if (!config) {
    log('No saved configuration found. Running interactive setup...', 'warn');
  }
}

if (!config) {
  config = await getConfigInteractive();
  const save = await prompt('\nSave this configuration for future use? (y/n)', 'y');
  if (save.toLowerCase() === 'y') {
    await saveConfig(config);
  }
}

// Sync
const { success, endpointCount } = await syncOpenAPI(config);
if (!success) { process.exit(1); }

// Generate types (default: yes, unless --no-types)
const specFilePath = getOpenAPIFilePath(config);
if (!noTypes) {
  const typesOk = await generateTypes(specFilePath);
  if (!typesOk) { process.exit(1); }
}

// Save config with metadata
config.lastSync = new Date().toISOString();
if (endpointCount > 0) { config.endpointCount = endpointCount; }
await saveConfig(config);

console.log('\n\x1B[32m✓ Sync completed!\x1B[0m\n');
