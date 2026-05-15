#!/usr/bin/env bun
/**
 * KATA Manifest Generator
 *
 * Automatically scans the codebase and generates a manifest of all KATA components and ATCs.
 * This provides context for AI agents without requiring them to scan the entire codebase.
 *
 * Usage:
 *   bun run kata:manifest           # Generate kata-manifest.json
 *   bun run kata:manifest --watch   # Watch mode (regenerate on changes)
 *   bun run kata:manifest --stdout  # Output to stdout instead of file
 *   bun run kata:manifest --check   # Validate kata-manifest.json is in sync (exit 1 if stale)
 *
 * Output: kata-manifest.json in project root
 */

import { existsSync, watch } from 'node:fs';
import { basename, join, relative } from 'node:path';

// ============================================================================
// Types
// ============================================================================

interface ATCInfo {
  id: string
  method: string
  line: number
}

interface ComponentInfo {
  name: string
  file: string
  relativePath: string
  atcs: ATCInfo[]
}

interface PreconditionInfo {
  name: string
  file: string
  relativePath: string
  methods: string[]
}

interface KataManifest {
  version: '1.0'
  generatedAt: string
  components: {
    api: ComponentInfo[]
    ui: ComponentInfo[]
  }
  preconditions: PreconditionInfo[]
  summary: {
    totalComponents: number
    totalATCs: number
    apiComponents: number
    uiComponents: number
    preconditionModules: number
  }
}

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_ROOT = process.cwd();
const COMPONENTS_DIR = join(PROJECT_ROOT, 'tests', 'components');
const OUTPUT_FILE = join(PROJECT_ROOT, 'kata-manifest.json');

const COMPONENT_PATHS = {
  api: join(COMPONENTS_DIR, 'api'),
  ui: join(COMPONENTS_DIR, 'ui'),
  preconditions: join(COMPONENTS_DIR, 'preconditions'),
};

// Files to exclude (base classes, fixtures, etc.)
const EXCLUDED_FILES = [
  'ApiBase.ts',
  'UiBase.ts',
  'TestContext.ts',
  'TestFixture.ts',
  'ApiFixture.ts',
  'UiFixture.ts',
  'index.ts',
];

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Extract @atc decorator calls from a TypeScript file
 */
async function extractATCs(filePath: string): Promise<ATCInfo[]> {
  const content = await Bun.file(filePath).text();
  const lines = content.split('\n');
  const atcs: ATCInfo[] = [];

  // Pattern: @atc('PROJ-XXX') or @atc("PROJ-XXX")
  const atcPattern = /@atc\s*\(\s*['"]([^'"]+)['"]/g;

  lines.forEach((line, index) => {
    // Skip @atc occurrences inside comments (//, JSDoc *, or //-prefixed lines).
    // The regex is naive about JS syntax, so without this filter, examples
    // inside doc comments like `e.g. @atc('UPEX-101')` produce phantom ATCs.
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      return;
    }
    const inlineCommentIdx = line.indexOf('//');
    const atcIdx = line.indexOf('@atc');
    if (inlineCommentIdx !== -1 && atcIdx !== -1 && inlineCommentIdx < atcIdx) {
      return;
    }

    const matches = [...line.matchAll(atcPattern)];
    for (const match of matches) {
      const atcId = match[1];

      // Find the method name on the next non-empty line(s).
      // Skip stacked decorators (`@other(...)`) and comment lines so the
      // lookahead does not capture `atc` from an adjacent @atc decorator
      // as a phantom method name.
      let methodName = 'unknown';
      for (let i = index + 1; i < Math.min(index + 8, lines.length); i++) {
        const nextLine = lines[i].trim();
        if (
          !nextLine
          || nextLine.startsWith('//')
          || nextLine.startsWith('*')
          || nextLine.startsWith('@')
        ) {
          continue;
        }
        const methodMatch = nextLine.match(/(?:async\s+)?(\w+)\s*\(/);
        if (methodMatch) {
          methodName = methodMatch[1];
          break;
        }
      }

      atcs.push({
        id: atcId,
        method: methodName,
        line: index + 1,
      });
    }
  });

  return atcs;
}

/**
 * Extract class name from a TypeScript file
 */
async function extractClassName(filePath: string): Promise<string> {
  const content = await Bun.file(filePath).text();

  // Pattern: export class ClassName extends or export class ClassName {
  const classMatch = content.match(/(?:export\s+)?class\s+([A-Z][a-zA-Z0-9]*)/);
  if (classMatch) {
    return classMatch[1];
  }

  // Fallback to filename without extension
  return basename(filePath, '.ts');
}

/**
 * Extract public methods from a precondition file (non-ATC reusable flows)
 */
async function extractPreconditionMethods(filePath: string): Promise<string[]> {
  const content = await Bun.file(filePath).text();
  const methods: string[] = [];

  // Pattern: async methodName( - public methods (must start with lowercase letter)
  const methodPattern = /^\s*async\s+([a-z][a-zA-Z0-9]*)\s*\(/gm;
  const matches = content.matchAll(methodPattern);

  for (const match of matches) {
    const methodName = match[1];
    // Exclude constructor and private methods (starting with _)
    if (methodName !== 'constructor' && !methodName.startsWith('_')) {
      methods.push(methodName);
    }
  }

  return [...new Set(methods)]; // Remove duplicates
}

/**
 * Scan a directory for TypeScript component files using Bun.Glob
 */
async function scanDirectory(dirPath: string): Promise<string[]> {
  // Bun.file() is the file API — .exists() is always false for directory paths.
  // Use existsSync from node:fs for directory checks.
  if (!existsSync(dirPath)) {
    return [];
  }

  const files: string[] = [];
  const glob = new Bun.Glob('*.ts');

  try {
    for await (const file of glob.scan({ cwd: dirPath, absolute: true })) {
      const fileName = basename(file);
      if (!EXCLUDED_FILES.includes(fileName)) {
        files.push(file);
      }
    }
  }
  catch {
    // Directory doesn't exist or isn't readable
  }

  return files;
}

// ============================================================================
// Main Generation Function
// ============================================================================

async function generateManifest(): Promise<KataManifest> {
  const manifest: KataManifest = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    components: {
      api: [],
      ui: [],
    },
    preconditions: [],
    summary: {
      totalComponents: 0,
      totalATCs: 0,
      apiComponents: 0,
      uiComponents: 0,
      preconditionModules: 0,
    },
  };

  // Scan API components
  const apiFiles = await scanDirectory(COMPONENT_PATHS.api);
  for (const file of apiFiles) {
    const atcs = await extractATCs(file);
    const component: ComponentInfo = {
      name: await extractClassName(file),
      file: basename(file),
      relativePath: relative(PROJECT_ROOT, file),
      atcs,
    };
    manifest.components.api.push(component);
    manifest.summary.totalATCs += atcs.length;
  }

  // Scan UI components
  const uiFiles = await scanDirectory(COMPONENT_PATHS.ui);
  for (const file of uiFiles) {
    const atcs = await extractATCs(file);
    const component: ComponentInfo = {
      name: await extractClassName(file),
      file: basename(file),
      relativePath: relative(PROJECT_ROOT, file),
      atcs,
    };
    manifest.components.ui.push(component);
    manifest.summary.totalATCs += atcs.length;
  }

  // Scan Preconditions
  const preconditionFiles = await scanDirectory(COMPONENT_PATHS.preconditions);
  for (const file of preconditionFiles) {
    const precondition: PreconditionInfo = {
      name: await extractClassName(file),
      file: basename(file),
      relativePath: relative(PROJECT_ROOT, file),
      methods: await extractPreconditionMethods(file),
    };
    manifest.preconditions.push(precondition);
  }

  // Update summary
  manifest.summary.apiComponents = manifest.components.api.length;
  manifest.summary.uiComponents = manifest.components.ui.length;
  manifest.summary.totalComponents
    = manifest.summary.apiComponents + manifest.summary.uiComponents;
  manifest.summary.preconditionModules = manifest.preconditions.length;

  // Deterministic ordering — Bun.Glob.scan order is filesystem-dependent.
  // Sorting here keeps `kata-manifest.json` byte-stable across machines so
  // `--check` stays meaningful and PR diffs stay reviewable.
  manifest.components.api.sort((a, b) => a.name.localeCompare(b.name));
  manifest.components.ui.sort((a, b) => a.name.localeCompare(b.name));
  manifest.preconditions.sort((a, b) => a.name.localeCompare(b.name));
  for (const component of [...manifest.components.api, ...manifest.components.ui]) {
    component.atcs.sort((a, b) => a.id.localeCompare(b.id));
  }
  for (const precondition of manifest.preconditions) {
    precondition.methods.sort();
  }

  return manifest;
}

// ============================================================================
// Check Mode (CI-grade freshness validator)
// ============================================================================

/**
 * Strip volatile fields before equality comparison.
 * `generatedAt` changes on every run, so it cannot participate in the diff.
 */
function stripVolatile(manifest: KataManifest): Omit<KataManifest, 'generatedAt'> & { generatedAt: string } {
  return { ...manifest, generatedAt: '<stripped>' };
}

async function checkManifest(): Promise<number> {
  const fresh = await generateManifest();

  if (!existsSync(OUTPUT_FILE)) {
    console.error('❌ kata-manifest.json missing.');
    console.error('   Run: bun run kata:manifest && git add kata-manifest.json');
    return 1;
  }

  const existingRaw = await Bun.file(OUTPUT_FILE).text();
  let existing: KataManifest;
  try {
    existing = JSON.parse(existingRaw);
  }
  catch {
    console.error('❌ kata-manifest.json is not valid JSON.');
    console.error('   Regenerate: bun run kata:manifest && git add kata-manifest.json');
    return 1;
  }

  const freshNorm = JSON.stringify(stripVolatile(fresh), null, 2);
  const existingNorm = JSON.stringify(stripVolatile(existing), null, 2);

  if (freshNorm === existingNorm) {
    console.log('✅ kata-manifest.json is up to date.');
    return 0;
  }

  console.error('❌ kata-manifest.json is stale.');
  console.error('   Run: bun run kata:manifest && git add kata-manifest.json');
  return 1;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check') || args.includes('-c');
  const watchMode = args.includes('--watch') || args.includes('-w');
  const stdoutMode = args.includes('--stdout') || args.includes('-s');

  // --check is mutually exclusive with --watch and --stdout: it validates
  // the committed file and exits, never writes or watches.
  if (checkMode) {
    process.exit(await checkManifest());
  }

  const generate = async () => {
    const manifest = await generateManifest();
    const json = JSON.stringify(manifest, null, 2);

    if (stdoutMode) {
      console.log(json);
    }
    else {
      // Trailing newline keeps the file POSIX-clean and lint-clean (eol-last).
      // checkManifest() parses both sides as JSON, so the newline does not
      // affect equality.
      await Bun.write(OUTPUT_FILE, `${json}\n`);
      console.log(`✅ Generated ${OUTPUT_FILE}`);
      console.log(`   📦 Components: ${manifest.summary.totalComponents} (${manifest.summary.apiComponents} API, ${manifest.summary.uiComponents} UI)`);
      console.log(`   🎯 ATCs: ${manifest.summary.totalATCs}`);
      console.log(`   🔗 Preconditions: ${manifest.summary.preconditionModules}`);
    }
  };

  // Initial generation
  await generate();

  // Watch mode
  if (watchMode && !stdoutMode) {
    console.log('\n👀 Watching for changes...\n');

    const dirsToWatch = [COMPONENT_PATHS.api, COMPONENT_PATHS.ui, COMPONENT_PATHS.preconditions];

    for (const dir of dirsToWatch) {
      if (existsSync(dir)) {
        watch(dir, { recursive: true }, (eventType, filename) => {
          if (filename?.endsWith('.ts')) {
            console.log(`\n🔄 Change detected: ${filename}`);
            void generate();
          }
        });
      }
    }
  }
}

void main();
