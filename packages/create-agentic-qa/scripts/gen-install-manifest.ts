#!/usr/bin/env bun
/**
 * gen-install-manifest.ts
 *
 * Lives inside the `create-agentic-qa` package because it generates the
 * package's own `src/installer-manifest.json` — the catalogue rendered by
 * `bunx create-agentic-qa --inspect`. Reads the authoritative skill / MCP /
 * CLI declarations from the boilerplate's `cli/install.ts` (two levels up)
 * so the published CLI stays in sync with what `bun run setup` actually
 * installs.
 *
 * Why it does NOT live in the boilerplate's root `scripts/`:
 *   The boilerplate's `scripts/` is copied verbatim into every bootstrapped
 *   consumer project. This generator is dev-tooling for the scaffolder
 *   itself — consumers never run it. Putting it under `packages/` (which
 *   `TEMPLATE_EXCLUDES` prunes during bootstrap) keeps consumer projects
 *   free of dead code.
 *
 * Usage (from the boilerplate root):
 *   bun --cwd packages/create-agentic-qa run gen:manifest    # write JSON
 *   bun --cwd packages/create-agentic-qa run check:manifest  # drift check
 *
 * How it works:
 *   1. Reads cli/install.ts as plain text.
 *   2. Extracts flat string arrays (CANONICAL_MCPS) via regex — acceptable
 *      because these arrays contain only string literals.
 *   3. Extracts MCP_SERVER_SECRETS (Record<string, string[]>) by matching the
 *      object block then iterating key/value pairs.
 *   4. Extracts EXTERNAL_CLIS objects from the EXTERNAL_CLIS array literal.
 *   5. Builds the manifest object, merging parsed data with the static purpose
 *      strings in PURPOSES below.
 *   6. Writes pretty-printed, sorted-key JSON to the target file.
 *
 * Maintenance note:
 *   Purpose strings for skills / MCPs / CLIs live in PURPOSES below.
 *   When you add a new skill / MCP / CLI to cli/install.ts, also add its
 *   purpose string here. `check:manifest` (wired into the package's CI /
 *   pre-publish flow) catches drift between the two files.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ============================================================================
// Paths
// ============================================================================

// import.meta.dir = packages/create-agentic-qa/scripts/
// ../../..        = boilerplate root
const REPO_ROOT = resolve(import.meta.dir, '../../..');
const INSTALL_TS = resolve(REPO_ROOT, 'cli/install.ts');
const MANIFEST_PATH = resolve(import.meta.dir, '../src/installer-manifest.json');

// ============================================================================
// Static purpose strings
// Keep these in sync when skills/MCPs/CLIs are added to cli/install.ts.
// ============================================================================

const PURPOSES: Record<string, string> = {
  // gentle-ai component (minimal preset installs engram only — SDD-* skills
  // are NOT installed by default; opt-in via `gentle-ai install --components engram,sdd`)
  'engram': 'Persistent memory across sessions.',

  // MCPs (CANONICAL_MCPS) — QA stack
  'context7': 'Library documentation MCP — fetches official current docs for any library.',
  'tavily': 'Web search MCP — used by skills that need fresh community / docs lookups.',
  'atlassian': 'Jira / Confluence MCP — story, test case, and page operations from the agent.',
  'dbhub': 'DBHub MCP — direct DB queries and schema introspection for test data validation.',
  'openapi': 'OpenAPI MCP — explore API endpoints and contract testing from the agent.',
  'playwright': 'Playwright MCP — browser automation and DOM inspection for E2E test exploration.',
  'postman': 'Postman MCP — API collection management and request testing.',

  // Community project-level skills (PROJECT_LEVEL_SKILLS)
  'playwright-cli': 'Browser automation CLI — screenshots, traces, video, session management, request mocking.',
  'playwright-best-practices': 'Playwright reference patterns — flaky-test fixes, POM, accessibility (axe-core), auth/OAuth fixtures, perf budgets, i18n, component testing.',
  'resend-cli': 'Transactional email development with Resend.',

  // Community user-level skills (USER_LEVEL_SKILLS)
  'skill-creator': 'Create, modify, and evaluate Claude Code skills.',
  'find-skills': 'Discover and search available skills.',
  'github-actions-docs': 'GitHub Actions documentation and workflow patterns.',
  'brainstorming': 'Structured brainstorming and ideation techniques.',
  'html-ppt': 'Create HTML-based presentations.',
  'bun': 'Bun runtime reference — installation, scripts, package management, testing.',
};

function purposeOr(name: string, fallback = `Community skill: ${name}`): string {
  return PURPOSES[name] ?? fallback;
}

// ============================================================================
// Parsing helpers
// ============================================================================

/**
 * Extract a flat string-literal array: `const X = [ 'a', 'b', ... ] as const`.
 * Returns the string values without quotes.
 * Throws if the pattern is not found.
 */
function extractStringArray(src: string, constName: string): string[] {
  // Match `const NAME = [` through the first closing `]` (non-greedy via [\s\S]*?)
  const pattern = new RegExp(`const\\s+${constName}\\s*[=:].*?\\[([\\s\\S]*?)\\]`, 'm');
  const match = pattern.exec(src);
  if (!match || !match[1]) {
    throw new Error(
      `Could not extract ${constName} from cli/install.ts — its shape may have changed; update gen-install-manifest.ts`,
    );
  }
  const inner = match[1];
  // Pull all quoted strings (single or double)
  const items = [...inner.matchAll(/['"]([^'"]+)['"]/g)]
    .map(m => m[1])
    .filter((s): s is string => s != null && s.length > 0);
  if (items.length === 0) {
    throw new Error(
      `Extracted ${constName} from cli/install.ts but found 0 items — shape may have changed`,
    );
  }
  return items;
}

/**
 * Extract MCP_SERVER_SECRETS: Record<string, readonly string[]>
 * Returns a map of { serverName: envVarArray }.
 */
function extractMcpSecrets(src: string): Record<string, string[]> {
  // Find the block `const MCP_SERVER_SECRETS ... = { ... };`
  const blockPattern = /const\s+MCP_SERVER_SECRETS\s*[=:][^{]*\{([\s\S]*?)\};/;
  const match = blockPattern.exec(src);
  if (!match || !match[1]) {
    throw new Error(
      'Could not extract MCP_SERVER_SECRETS from cli/install.ts — its shape may have changed; update gen-install-manifest.ts',
    );
  }
  const block = match[1];
  const result: Record<string, string[]> = {};
  // Match each `key: [ ... ]` entry
  for (const entry of block.matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)) {
    const key = entry[1];
    const valuesBlock = entry[2];
    const vars = [...(valuesBlock ?? '').matchAll(/['"]([^'"]+)['"]/g)]
      .map(v => v[1])
      .filter((s): s is string => s != null && s.length > 0);
    if (key) {
      result[key] = vars;
    }
  }
  if (Object.keys(result).length === 0) {
    throw new Error(
      'Extracted MCP_SERVER_SECRETS block but found 0 entries — shape may have changed',
    );
  }
  return result;
}

interface ExternalCli {
  name: string
  install?: string
  docs: string
  purpose: string
}

/**
 * Extract EXTERNAL_CLIS array of objects.
 * Parses each `{ name: '...', docs: '...', ... }` entry.
 */
function extractExternalClis(src: string): ExternalCli[] {
  // Find the EXTERNAL_CLIS array block
  const blockStart = src.indexOf('const EXTERNAL_CLIS');
  if (blockStart === -1) {
    throw new Error(
      'Could not find EXTERNAL_CLIS in cli/install.ts — its shape may have changed; update gen-install-manifest.ts',
    );
  }
  // Find the matching closing bracket of the array
  let depth = 0;
  let inArray = false;
  let arrayStart = -1;
  let arrayEnd = -1;
  for (let i = blockStart; i < src.length; i++) {
    if (src[i] === '[') {
      if (!inArray) { inArray = true; arrayStart = i; }
      depth++;
    }
    else if (src[i] === ']') {
      depth--;
      if (depth === 0 && inArray) { arrayEnd = i; break; }
    }
  }
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error('Could not find EXTERNAL_CLIS array bounds in cli/install.ts');
  }
  const arrayBlock = src.slice(arrayStart + 1, arrayEnd);

  const clis: ExternalCli[] = [];
  // Split on object boundaries — find each `{...}` block
  let objDepth = 0;
  let objStart = -1;
  for (let i = 0; i < arrayBlock.length; i++) {
    if (arrayBlock[i] === '{') {
      if (objDepth === 0) { objStart = i; }
      objDepth++;
    }
    else if (arrayBlock[i] === '}') {
      objDepth--;
      if (objDepth === 0 && objStart !== -1) {
        const obj = arrayBlock.slice(objStart + 1, i);
        const getField = (field: string): string | undefined => {
          const fp = new RegExp(`${field}\\s*:\\s*['"]([^'"]+)['"]`);
          const fm = fp.exec(obj);
          return fm?.[1];
        };
        const name = getField('name');
        const docs = getField('docs');
        const install = getField('install');
        const purpose = getField('purpose');
        if (name && docs && purpose) {
          clis.push({ name, docs, purpose, ...(install ? { install } : {}) });
        }
        objStart = -1;
      }
    }
  }
  if (clis.length === 0) {
    throw new Error('Extracted EXTERNAL_CLIS block but found 0 entries — shape may have changed');
  }
  return clis;
}

interface CommunitySkillEntry {
  package: string
  skill?: string
}

/**
 * Extract a CommunitySkill array (PROJECT_LEVEL_SKILLS or USER_LEVEL_SKILLS).
 */
function extractCommunitySkills(src: string, constName: string): CommunitySkillEntry[] {
  const blockStart = src.indexOf(`const ${constName}`);
  if (blockStart === -1) {
    throw new Error(
      `Could not find ${constName} in cli/install.ts — its shape may have changed; update gen-install-manifest.ts`,
    );
  }
  let depth = 0;
  let inArray = false;
  let arrayStart = -1;
  let arrayEnd = -1;
  for (let i = blockStart; i < src.length; i++) {
    if (src[i] === '[') {
      if (!inArray) { inArray = true; arrayStart = i; }
      depth++;
    }
    else if (src[i] === ']') {
      depth--;
      if (depth === 0 && inArray) { arrayEnd = i; break; }
    }
  }
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(`Could not find ${constName} array bounds in cli/install.ts`);
  }
  const arrayBlock = src.slice(arrayStart + 1, arrayEnd);

  const skills: CommunitySkillEntry[] = [];
  let objDepth2 = 0;
  let objStart2 = -1;
  for (let i = 0; i < arrayBlock.length; i++) {
    if (arrayBlock[i] === '{') {
      if (objDepth2 === 0) { objStart2 = i; }
      objDepth2++;
    }
    else if (arrayBlock[i] === '}') {
      objDepth2--;
      if (objDepth2 === 0 && objStart2 !== -1) {
        const obj = arrayBlock.slice(objStart2 + 1, i);
        const getField = (field: string): string | undefined => {
          const fp = new RegExp(`${field}\\s*:\\s*['"]([^'"]+)['"]`);
          const fm = fp.exec(obj);
          return fm?.[1];
        };
        const pkg = getField('package');
        const skill = getField('skill');
        if (pkg) {
          skills.push({ package: pkg, ...(skill ? { skill } : {}) });
        }
        objStart2 = -1;
      }
    }
  }
  if (skills.length === 0) {
    throw new Error(`Extracted ${constName} block but found 0 entries — shape may have changed`);
  }
  return skills;
}

// ============================================================================
// Skill name helpers
// ============================================================================

/** Derive a display name from a CommunitySkill entry. */
function skillDisplayName(s: CommunitySkillEntry): string {
  if (s.skill && s.skill !== '*') { return s.skill; }
  // No skill specified = whole package. Use last segment of package path.
  const parts = s.package.replace(/^https?:\/\/github\.com\//, '').split('/');
  return `${parts[parts.length - 1] ?? s.package} (full package)`;
}

/** Derive source URL from package string. */
function skillSource(pkg: string): string {
  if (pkg.startsWith('http')) { return pkg; }
  // Short form like `supabase/agent-skills` or `czlonkowski/n8n-skills`
  if (pkg.includes('/') && !pkg.includes(' ')) { return pkg; }
  return pkg;
}

// ============================================================================
// Manifest builder
// ============================================================================

interface ManifestEntry {
  name: string
  purpose: string
  source?: string
}

function buildManifest(src: string): object {
  const canonicalMcps = extractStringArray(src, 'CANONICAL_MCPS');
  const mcpSecrets = extractMcpSecrets(src);
  const projectSkills = extractCommunitySkills(src, 'PROJECT_LEVEL_SKILLS');
  const userSkills = extractCommunitySkills(src, 'USER_LEVEL_SKILLS');
  const externalClis = extractExternalClis(src);

  // gentle-ai is invoked with `--preset minimal`, which installs only the
  // engram component. SDD-* skills are opt-in via `gentle-ai install --components engram,sdd`.
  const gentleAiItems: ManifestEntry[] = [
    { name: 'engram', purpose: purposeOr('engram'), source: 'gentle-ai' },
  ];

  // community project skills
  const projectItems: ManifestEntry[] = projectSkills.map(s => ({
    name: skillDisplayName(s),
    purpose: purposeOr(s.skill ?? skillDisplayName(s).replace(' (full package)', '')),
    source: skillSource(s.package),
  }));

  // community user skills
  const userItems: ManifestEntry[] = userSkills.map(s => ({
    name: skillDisplayName(s),
    purpose: purposeOr(s.skill ?? skillDisplayName(s).replace(' (full package)', '')),
    source: skillSource(s.package),
  }));

  // MCPs
  const mcpEntries = canonicalMcps.map(name => ({
    name,
    envVars: mcpSecrets[name] ?? [],
    purpose: purposeOr(name, `MCP server: ${name}`),
  }));

  // willNotInstall — derived from EXTERNAL_CLIS
  const willNotInstall = externalClis.map(cli => ({
    name: cli.name,
    reason: cli.install
      ? `Must be installed manually. Run: ${cli.install}`
      : 'Must be installed manually using your OS package manager.',
    installHint: cli.docs,
  }));

  return {
    version: 1,
    sourceRef: 'main',
    prerequisites: [
      {
        name: 'bun',
        required: true,
        purpose: 'JavaScript runtime and package manager used by every script and the installer itself.',
        installHint: 'https://bun.sh/docs/installation',
        binaryName: 'bun',
      },
      {
        name: 'git',
        required: true,
        purpose: 'Required to clone the template and track your project\'s history.',
        installHint: 'https://git-scm.com/downloads',
        binaryName: 'git',
      },
      {
        name: 'node >= 18',
        required: true,
        purpose: 'Used by the npx wrapper that runs create-agentic-qa. Must be v18 or newer.',
        installHint: 'https://nodejs.org/en/download',
        binaryName: 'node',
      },
      {
        name: 'gh (GitHub CLI)',
        required: false,
        purpose: 'Optional. Needed only if you want the installer to auto-create a GitHub repo (Phase 4 Step 9).',
        installHint: 'https://cli.github.com',
        binaryName: 'gh',
      },
      {
        name: 'internet access',
        required: true,
        purpose: 'The scaffolder downloads the boilerplate template from GitHub and gentle-ai skills from their registries.',
        installHint: 'https://api.github.com',
      },
      {
        name: 'disk space (200 MB+)',
        required: false,
        purpose: 'The template, node_modules, and installed skills require at least 200 MB of free disk space.',
        installHint: 'https://bun.sh/docs',
      },
      {
        name: 'API keys (.env)',
        required: false,
        purpose: 'MCP servers (Tavily, Atlassian, DBHub, OpenAPI, Playwright, Postman) require API keys set in .env before they can connect.',
        installHint: 'See .env.example in the project root after scaffolding.',
      },
    ],
    willInstall: {
      gentleAiSkills: { count: gentleAiItems.length, items: gentleAiItems },
      communityProjectSkills: { count: projectItems.length, items: projectItems },
      communityUserSkills: { count: userItems.length, items: userItems },
    },
    willConfigure: {
      mcps: mcpEntries,
      envFiles: [
        { path: '.env', what: 'Created from .env.example. Stores all API keys and secrets (gitignored).' },
        { path: '.envrc', what: 'direnv autoload file — loads .env into the shell on cd (optional, offered interactively).' },
        // eslint-disable-next-line no-template-curly-in-string
        { path: '.mcp.json', what: 'Already committed. Uses ${VAR} placeholders — installer ensures .env has the values.' },
        { path: 'opencode.jsonc', what: 'Already committed. Uses {env:VAR} placeholders — installer ensures .env has the values.' },
        { path: '.template/installer.state.json', what: 'Installer idempotency state (gitignored). Tracks which steps completed.' },
      ],
      auth: [
        {
          service: 'acli (Atlassian CLI)',
          method: 'One-time interactive login — credentials stored in ~/.config/acli/',
          credsFrom: ['ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN', 'ATLASSIAN_URL'],
        },
        {
          service: 'Jira (HTTP basic auth via MCP)',
          method: 'Env vars read at MCP startup — no interactive login needed',
          credsFrom: ['ATLASSIAN_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'],
        },
        {
          service: 'Xray Cloud (xray-cli)',
          method: 'Env-var driven — credentials read at command invocation. Only required when TMS_PROVIDER=xray.',
          credsFrom: ['XRAY_CLIENT_ID', 'XRAY_CLIENT_SECRET'],
        },
      ],
      postInstallSteps: [
        {
          step: 'agents:setup',
          what: 'Runs bun run scripts/agents-setup.ts — wires .agents/project.yaml with project name, key, and URLs.',
          interactive: true,
        },
        {
          step: 'acli auth',
          what: 'Runs acli login — authenticates the Atlassian CLI for Jira/Confluence operations.',
          interactive: true,
        },
        {
          step: 'jira:sync-fields',
          what: 'Fetches custom field metadata from Jira and writes .agents/jira-fields.json.',
          interactive: false,
        },
        {
          step: 'jira:sync-workflows',
          what: 'Fetches workflow transitions from Jira and writes .agents/jira-workflows.json.',
          interactive: false,
        },
        {
          step: 'jira:check',
          what: 'Validates the Jira setup manifest against the fetched field catalog.',
          interactive: false,
        },
        {
          step: 'api:sync',
          what: 'Runs bun run api:sync — fetches OpenAPI spec from the configured backend and regenerates api/schemas/ TypeScript types.',
          interactive: false,
        },
        {
          step: 'xray auth login',
          what: 'Runs bun xray auth login — authenticates against Xray Cloud. Only when TMS_PROVIDER=xray; skipped for Jira-native (Modality jira-native).',
          interactive: true,
        },
      ],
    },
    willNotInstall,
  };
}

// ============================================================================
// JSON helpers
// ============================================================================

function sortedJson(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const checkMode = process.argv.includes('--check');

  if (!existsSync(INSTALL_TS)) {
    process.stderr.write(`ERROR: Could not find cli/install.ts at ${INSTALL_TS}\n`);
    process.exit(1);
  }

  const src = readFileSync(INSTALL_TS, 'utf8');

  let manifest: object;
  try {
    manifest = buildManifest(src);
  }
  catch (err) {
    process.stderr.write(`ERROR: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const generated = sortedJson(manifest);

  if (checkMode) {
    if (!existsSync(MANIFEST_PATH)) {
      process.stderr.write(`DRIFT: ${MANIFEST_PATH} does not exist. Run: bun run gen:manifest\n`);
      process.exit(1);
    }
    const existing = readFileSync(MANIFEST_PATH, 'utf8');
    // Compare semantic content (formatting-insensitive). The manifest is now
    // deterministic — no per-run timestamp — so a parse + stringify roundtrip
    // is enough to canonicalise both sides before comparing.
    const canonicalize = (s: string): string => JSON.stringify(JSON.parse(s));
    try {
      if (canonicalize(existing) === canonicalize(generated)) {
        process.stdout.write('check:manifest — OK (no drift)\n');
        process.exit(0);
      }
      else {
        process.stderr.write('DRIFT: installer-manifest.json is out of sync with cli/install.ts.\n');
        process.stderr.write('Run: bun run gen:manifest  to regenerate.\n');
        process.exit(1);
      }
    }
    catch {
      process.stderr.write('DRIFT: Could not parse installer-manifest.json — run: bun run gen:manifest\n');
      process.exit(1);
    }
  }

  writeFileSync(MANIFEST_PATH, generated, 'utf8');
  // Run prettier on the generated file so it passes format:check automatically.
  spawnSync('bunx', ['prettier', '--write', MANIFEST_PATH], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
  });

  const parsed = JSON.parse(generated) as {
    willInstall: {
      gentleAiSkills: { count: number }
      communityProjectSkills: { count: number }
      communityUserSkills: { count: number }
    }
    willConfigure: { mcps: unknown[] }
    prerequisites: unknown[]
    willNotInstall: unknown[]
  };

  const gentleCount = parsed.willInstall.gentleAiSkills.count;
  const projectCount = parsed.willInstall.communityProjectSkills.count;
  const userCount = parsed.willInstall.communityUserSkills.count;
  const mcpCount = parsed.willConfigure.mcps.length;
  const prereqCount = parsed.prerequisites.length;
  const wontCount = parsed.willNotInstall.length;

  process.stdout.write(
    `Manifest written: gentle-ai=${gentleCount}, project=${projectCount}, user=${userCount}, mcps=${mcpCount}, prereqs=${prereqCount}, won't-install=${wontCount}\n`,
  );
}

main();
