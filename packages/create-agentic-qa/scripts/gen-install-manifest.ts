#!/usr/bin/env bun
/**
 * gen-install-manifest.ts
 *
 * Lives inside the `create-agentic-qa` package because it generates the
 * package's own `src/installer-manifest.json` — the catalogue rendered by
 * `bunx create-agentic-qa --inspect`. Reads the authoritative declarations
 * from the boilerplate (two levels up) so the published CLI stays in sync with
 * what `bun setup` actually does:
 *
 *   cli/install.ts               skills, MCPs, external CLIs, flags, prompts,
 *                                and the order the phases are started in
 *   cli/lib/ui/installer-run.ts  the phase list (id, title, hint) the page and
 *                                the terminal show
 *   cli/preflight.ts             the setup preflight checks (runSetupPreflight)
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
 *   1. Reads the three files above as plain text.
 *   2. Extracts flat string arrays (CANONICAL_MCPS, KNOWN_FLAGS), the
 *      MCP_SERVER_SECRETS map, the EXTERNAL_CLIS / *_LEVEL_SKILLS object
 *      arrays, the HELP usage lines and the English phase list via regex.
 *   3. Merges them with the static text below (PURPOSES, PHASE_STEPS,
 *      PREREQUISITES) and VALIDATES the static text against the sources
 *      (validateAgainstSources): a phase added, removed or reordered, a step
 *      whose code is gone, a prompt nobody declared, or a blocking preflight
 *      check no prerequisite names all stop the build. That is what makes
 *      `check:manifest` catch drift in the hand-written half too, not only in
 *      the extracted half.
 *   4. Writes pretty-printed JSON to the target file.
 *
 * Maintenance note:
 *   A new skill / MCP / CLI in cli/install.ts needs its purpose string in
 *   PURPOSES. A new phase, step or prompt needs its entry in PHASE_STEPS; a
 *   new blocking preflight check needs a prerequisite (or a NOT_APPLICABLE
 *   reason). `check:manifest` (pre-publish, and tests/manifest.test.ts) fails
 *   until the static text matches the code.
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
const INSTALLER_RUN_TS = resolve(REPO_ROOT, 'cli/lib/ui/installer-run.ts');
const PREFLIGHT_TS = resolve(REPO_ROOT, 'cli/preflight.ts');
export const MANIFEST_PATH = resolve(import.meta.dir, '../src/installer-manifest.json');

// ============================================================================
// Static purpose strings
// Keep these in sync when skills/MCPs/CLIs are added to cli/install.ts.
// ============================================================================

const PURPOSES: Record<string, string> = {
  // Engram persistent memory, wired per agent with `engram setup`
  'engram': 'Persistent memory across sessions.',

  // MCPs (CANONICAL_MCPS) — QA stack
  'context7': 'Library documentation MCP — fetches official current docs for any library.',
  'dbhub': 'DBHub MCP — direct DB queries and schema introspection for test data validation.',
  'openapi': 'OpenAPI MCP — explore API endpoints and contract testing from the agent.',
  'slack-aurora': 'Slack bot MCP — read channels, post and react from the agent (optional; token in .env).',

  // Community project-level skills (PROJECT_LEVEL_SKILLS)
  'playwright-cli': 'Browser automation CLI — screenshots, traces, video, session management, request mocking.',
  'playwright-best-practices': 'Playwright reference patterns — flaky-test fixes, POM, accessibility (axe-core), auth/OAuth fixtures, perf budgets, i18n, component testing.',
  'resend-cli': 'Transactional email development with Resend.',
  'skill-creator': 'Create, modify, and evaluate Claude Code skills.',
  'diagram-design': 'Diagrams for the business context maps (data, API, E2E).',

  // Community user-level skills (USER_LEVEL_SKILLS)
  'find-skills': 'Discover and search available skills.',
  'github-actions-docs': 'GitHub Actions documentation and workflow patterns.',
  'html-ppt': 'Create HTML-based presentations.',
  'mkd': 'Decision-deck CLI — the AI asks, the user answers point by point in a browser deck.',
};

function purposeOr(name: string, fallback = `Community skill: ${name}`): string {
  return PURPOSES[name] ?? fallback;
}

// ============================================================================
// Phases: what each phase of `bun setup` does
//
// The phase LIST (ids, titles, hints, order) is read from
// cli/lib/ui/installer-run.ts; only the steps are written here. Every step
// names `probes`: literal tokens that must exist in cli/install.ts (or in
// cli/preflight.ts for `pre`), so a step whose code was removed or renamed
// fails the build. `prompts` are the ask ids the step raises (`x-*` = an id
// built from a template, `x-${...}`); every ask id in cli/install.ts must be
// claimed by exactly one step.
// ============================================================================

export interface StepSpec {
  step: string
  what: string
  probes: string[]
  prompts?: string[]
  /** Asks without a declared ask id (the preflight's own start question). */
  interactive?: boolean
}

export const PHASE_STEPS: Record<string, StepSpec[]> = {
  pre: [
    { step: 'Preflight', what: 'Checks tools, AI agents, network and disk in a few seconds (cli/preflight.ts). A blocking row stops the run before anything is written; a warning only skips the step it affects.', probes: ['runSetupPreflight('] },
    { step: 'Start confirmation', what: 'Asks once whether to start; --non-interactive skips it.', probes: ['confirmStart('], interactive: true },
    { step: 'Clean project.yaml', what: 'A project copied with "Use this template" gets a clean .agents/project.yaml from the schema before anything writes to it.', probes: ['reseedCopiedTemplate('] },
  ],
  team: [
    { step: 'AI agents', what: 'Which agents the project supports (Claude Code, OpenCode, Codex, Pi), recorded in .agents/project.yaml `harnesses:`; the files of an agent you drop can be removed.', probes: ['askAgents(', 'recordHarnessSelection('], prompts: ['agents', 'drop-*'] },
    { step: 'Engram', what: 'Detects Engram 3.0+ and, for Claude Code, offers its plugin (session hooks, installed once per machine).', probes: ['detectEngram('], prompts: ['engram-incompatible', 'engram-plugin'] },
    { step: 'User-level skills', what: 'Which user-level community skills to install, one by one; a declined skill is left out of later runs.', probes: ['askUserLevelSkills('], prompts: ['user-skills'] },
  ],
  install: [
    { step: 'Dependencies', what: 'bun install when node_modules is missing or stale. Runs in the background while the next phases ask their questions.', probes: ['runDepsStep('] },
    { step: 'Chromium', what: 'Downloads the Playwright test browser (bunx playwright install chromium).', probes: ['runPlaywrightStep('] },
    { step: 'Engram wiring', what: 'engram setup for each selected agent, plus the Claude Code plugin when accepted.', probes: ['runEngramStep('] },
    { step: 'Community skills', what: 'bunx skills add: project-level skills into .agents/skills/, the chosen user-level skills globally.', probes: ['runCommunityStep('] },
    { step: 'Link the skills', what: 'Repairs the agent contract: the .claude/skills alias onto .agents/skills/ and the CLAUDE.md shim.', probes: ['compatibilityStep('] },
  ],
  project: [
    { step: 'Project identity', what: 'Project name, key, web domain, local and staging URLs and the default environment, written to .agents/project.yaml by agents-setup --non-interactive (bun run agents:setup changes them later).', probes: ['projectPhase(', 'agents-setup.ts'], prompts: ['project-identity', 'project-envs', 'project-default-env'] },
  ],
  creds: [
    { step: 'Retired keys', what: 'Offers to remove the .env keys this version no longer reads.', probes: ['cleanRetiredEnvKeys('], prompts: ['retired-keys'] },
    { step: 'Secrets provider', what: 'Where secret values live: .env (default) or 1Password, which writes the committed .env.provider.schema with references only.', probes: ['secretsProviderStep('], prompts: ['secrets-provider', 'op-vault', 'op-auth'] },
    { step: 'MCP variables', what: 'Checks the variables each project MCP server reads and asks for the ones the installer manages. A value already set in your shell is copied into .env only when you say yes; an unattended run copies none and lists the names.', probes: ['configureMcps('], prompts: ['var-*', 'mcp-shell-*'] },
    { step: 'Day-0 credentials', what: 'The Atlassian email and API token (and the other core variables) the skills use today; the rest is added when needed.', probes: ['configureDayZeroCredentials('], prompts: ['day0'] },
    { step: 'API login', what: 'Optional bun run api:login, offered only when the test user and API_BASE_URL exist and the API answers.', probes: ['optionalApiBootstrap(', '\'api:login\''], prompts: ['api-login'] },
  ],
  jira: [
    { step: 'acli session', what: 'Signs the Atlassian CLI in with the .env email and token; a rejected token is asked again.', probes: ['acliAuthStep('], prompts: ['token-retry-*'] },
    { step: 'Jira catalogs', what: 'Custom fields, workflows and link types, from your own Jira (workflow pickers through jira:sync-workflows --plan-json / --answers) or from the UPEX reference catalog; writes .agents/jira-*.json.', probes: ['jiraCatalogsStep(', '\'jira:sync-fields\'', '\'jira:sync-workflows\'', '\'jira:sync-link-types\'', '\'--plan-json\'', '\'--answers\''], prompts: ['jira-catalogs', 'wf-*'] },
    { step: 'Sprint Board statuses', what: 'Right after the catalogs: offers the suggested board.statuses buckets once, then board.jql (default from the project key); written only when bun run board:check would accept the block.', probes: ['boardStatusesStep('], prompts: ['board-statuses', 'board-jql'] },
    { step: 'Jira check', what: 'bun run jira:check validates the Jira setup manifest against the synced catalogs.', probes: ['jiraCheckStep(', '\'jira:check\''] },
  ],
  github: [
    { step: 'GitHub repository', what: 'Optional: creates the remote with gh (account, visibility, name) and pushes the first commit, after the background downloads finish.', probes: ['setupGithubRemote('], prompts: ['gh-create', 'gh-account', 'gh-visibility', 'gh-name'] },
  ],
  verify: [
    { step: 'Command-line tools', what: 'Reports which external CLIs are on PATH (information only; nothing is installed).', probes: ['verifyExternalClis('] },
    { step: 'Agent contract', what: 'Counts the project MCP servers that are ready and checks instructions, skills and MCP configs for every selected agent.', probes: ['checkAgentCompatibility('] },
    { step: 'Plaintext copies', what: 'Retires the plaintext MCP credential copies an older install left behind.', probes: ['retireHarnessCopies('] },
    { step: 'Save progress', what: 'Writes .template/installer.state.json so the next run repeats nothing.', probes: ['writeInstallState('] },
  ],
  done: [
    { step: 'Report', what: 'One report: what was done, what is pending and what to run next.', probes: ['buildReport('] },
  ],
};

// ============================================================================
// Prerequisites
//
// `preflight` names the cli/preflight.ts runSetupPreflight check ids the row
// stands for. Every check that can BLOCK the run must be named by a required
// row or listed in NOT_APPLICABLE with the reason; a new blocking check fails
// the build until it is described here.
// ============================================================================

export interface PrerequisiteSpec {
  name: string
  required: boolean
  purpose: string
  installHint: string
  binaryName?: string
  /** Any one of these on PATH satisfies the row. */
  binaryNames?: string[]
  preflight?: string[]
}

export const NOT_APPLICABLE: Record<string, string> = {
  repo: 'The scaffolder creates the project and its package.json before bun setup runs.',
};

function prerequisites(mcpsWithKeys: string[]): PrerequisiteSpec[] {
  return [
    {
      name: 'bun >= 1.4.3',
      required: true,
      purpose: 'JavaScript runtime and package manager used by every script and the installer itself.',
      installHint: 'https://bun.sh/docs/installation',
      binaryName: 'bun',
      preflight: ['bun'],
    },
    {
      name: 'node >= 22',
      required: true,
      purpose: 'Your agent\'s hooks run on Node, so bun setup does not start without it; the npx wrapper of create-agentic-qa needs it too.',
      installHint: 'https://nodejs.org/en/download',
      binaryName: 'node',
      preflight: ['node'],
    },
    {
      name: 'git',
      required: true,
      purpose: 'Clones the template and tracks your project\'s history. Set user.name and user.email before the first commit, or the preflight warns.',
      installHint: 'https://git-scm.com/downloads',
      binaryName: 'git',
      preflight: ['git'],
    },
    {
      name: 'an AI agent (Claude Code, OpenCode, Codex or Pi)',
      required: true,
      purpose: 'bun setup configures only the agents you pick, and does not start when none is installed.',
      installHint: 'https://github.com/upex-galaxy/agentic-qa-boilerplate#readme',
      binaryNames: ['claude', 'opencode', 'codex', 'pi'],
      preflight: ['harness'],
    },
    {
      name: 'internet access',
      required: true,
      purpose: 'Community skills download from the npm registry and GitHub, the test browser from cdn.playwright.dev; the preflight probes all three.',
      installHint: 'https://api.github.com',
      preflight: ['net-npm', 'net-github', 'net-playwright'],
    },
    {
      name: 'disk space (1.1 GB+)',
      required: true,
      purpose: 'Chromium and the dependencies use about 1.1 GB. Below 400 MB free bun setup does not start; below 1.2 GB it warns.',
      installHint: 'https://bun.sh/docs',
      preflight: ['disk'],
    },
    {
      name: 'acli (Atlassian CLI)',
      required: false,
      purpose: 'The Jira phase signs in and syncs catalogs with it; without it the Jira phase is skipped.',
      installHint: 'https://developer.atlassian.com/cloud/acli/guides/install-acli/',
      binaryName: 'acli',
      preflight: ['acli', 'net-atlassian'],
    },
    {
      name: 'engram >= 3.0',
      required: false,
      purpose: 'Cross-session memory for the agents; without it the memory step is skipped.',
      installHint: 'https://github.com/Gentleman-Programming/engram',
      binaryName: 'engram',
      preflight: ['engram'],
    },
    {
      name: 'gh (GitHub CLI)',
      required: false,
      purpose: 'Only for the GitHub phase (create the remote repository and push); choose local only otherwise.',
      installHint: 'https://cli.github.com',
      binaryName: 'gh',
      preflight: ['gh'],
    },
    {
      name: '1Password CLI (op)',
      required: false,
      purpose: 'Only when the project keeps its secrets in 1Password (secrets.provider: 1password).',
      installHint: 'https://developer.1password.com/docs/cli/get-started/',
      binaryName: 'op',
      preflight: ['op'],
    },
    {
      // Reported by `pythonCheck` (cli/preflight.ts) as information, never a block.
      name: 'Python 3.9+ with Pillow',
      required: false,
      purpose: 'Only for the evidence pages (/evidence-artifact, bun run evidence); nothing in the install needs it.',
      installHint: 'https://www.python.org/downloads/ then Pillow (Homebrew Python: brew install pillow; Windows: py -m pip install pillow)',
      binaryName: 'python3',
    },
    {
      name: 'API keys (.env)',
      required: false,
      purpose: `The project MCP servers that read keys (${mcpsWithKeys.join(', ')}) connect once their values are in .env; web search and similar servers run at harness level and keep their keys outside .env.`,
      installHint: 'See .env.example in the project root after scaffolding.',
    },
  ];
}

// ============================================================================
// Parsing helpers
// ============================================================================

/**
 * Extract a flat string-literal array: `const X = [ 'a', 'b', ... ] as const`
 * (also `const X = new Set([ ... ])`). Returns the string values without quotes.
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
  for (const entry of block.matchAll(/['"]?([\w-]+)['"]?\s*:\s*\[([^\]]*)\]/g)) {
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

export interface PhaseDef {
  id: string
  title: string
  hint?: string
}

/** The English phase list of `installerPhases()` in cli/lib/ui/installer-run.ts. */
export function extractPhases(installerRunSrc: string): PhaseDef[] {
  const en = installerRunSrc.indexOf('\n  en: {');
  const start = en === -1 ? -1 : installerRunSrc.indexOf('phases: [', en);
  const end = start === -1 ? -1 : installerRunSrc.indexOf('] as PhaseDef[]', start);
  if (start === -1 || end === -1) {
    throw new Error('Could not find the English `phases: [...] as PhaseDef[]` list in cli/lib/ui/installer-run.ts — its shape may have changed; update gen-install-manifest.ts');
  }
  const block = installerRunSrc.slice(start, end);
  const phases = [...block.matchAll(/\{\s*id:\s*'([\w-]+)',\s*title:\s*'([^']*)'(?:,\s*hint:\s*'([^']*)')?\s*\}/g)]
    .map(m => ({ id: m[1], title: m[2], ...(m[3] ? { hint: m[3] } : {}) }));
  if (phases.length === 0) {
    throw new Error('Extracted the phase list from cli/lib/ui/installer-run.ts but found 0 phases — shape may have changed');
  }
  return phases;
}

/** The `bun setup ...` usage lines of the installer's HELP text, split into command and description. */
function extractHelpUsage(src: string): { command: string, what?: string }[] {
  const m = /const\s+HELP\s*=\s*`([\s\S]*?)`;/.exec(src);
  if (!m || !m[1]) {
    throw new Error('Could not extract HELP from cli/install.ts — its shape may have changed; update gen-install-manifest.ts');
  }
  return m[1].split('\n').map(l => l.trim()).filter(l => /^bun setup(?:\s{2,}|\s+-|$)/.test(l)).map((l) => {
    const [command, ...rest] = l.split(/\s{2,}/);
    return rest.length > 0 ? { command, what: rest.join(' ') } : { command };
  });
}

/** Every ask id cli/install.ts raises; a template id (`x-${...}`) comes back as `x-*`. */
export function extractAskIds(src: string): string[] {
  const ids = new Set<string>();
  for (const m of src.matchAll(/\bask<[^>]*>\(\{\s*id:\s*(?:'([\w-]+)'|`([\w-]*)\$\{)/g)) {
    ids.add(m[1] ?? `${m[2]}*`);
  }
  return [...ids];
}

/** Check ids in runSetupPreflight, and the subset that can set `state: 'block'`. */
export function extractPreflightChecks(preflightSrc: string): { all: Set<string>, blocking: Set<string> } {
  const start = preflightSrc.indexOf('export async function runSetupPreflight');
  const end = start === -1 ? -1 : preflightSrc.indexOf('\nexport ', start + 1);
  if (start === -1) {
    throw new Error('Could not find runSetupPreflight in cli/preflight.ts — its shape may have changed; update gen-install-manifest.ts');
  }
  const body = preflightSrc.slice(start, end === -1 ? undefined : end);
  const all = new Set<string>();
  const blocking = new Set<string>();
  for (const line of body.split('\n')) {
    for (const m of line.matchAll(/\bid:\s*'([\w-]+)'/g)) {
      all.add(m[1]);
      if (/'block'/.test(line)) { blocking.add(m[1]); }
    }
  }
  if (all.size === 0) {
    throw new Error('Found runSetupPreflight in cli/preflight.ts but 0 check ids — shape may have changed');
  }
  return { all, blocking };
}

// ============================================================================
// Validation: the hand-written half against the code
// ============================================================================

export interface Sources {
  install: string
  installerRun: string
  preflight: string
}

/** Every reason the static text no longer describes the code; empty = in sync. */
export function validateAgainstSources(sources: Sources, phases: PhaseDef[], prereqs: PrerequisiteSpec[]): string[] {
  const errors: string[] = [];
  const ids = phases.map(p => p.id);

  // Phase list: same set as PHASE_STEPS.
  for (const id of ids) {
    if (!PHASE_STEPS[id]) { errors.push(`phase "${id}" (cli/lib/ui/installer-run.ts) has no steps in PHASE_STEPS`); }
  }
  for (const id of Object.keys(PHASE_STEPS)) {
    if (!ids.includes(id)) { errors.push(`PHASE_STEPS describes phase "${id}", which cli/lib/ui/installer-run.ts no longer declares`); }
  }

  // Phase order: the last `ui.phase('<id>'` call in cli/install.ts (the main
  // pipeline; --sync-skills opens team/install earlier) follows the declared order.
  let previous = { id: '', at: -1 };
  for (const id of ids) {
    let at = sources.install.lastIndexOf(`ui.phase('${id}'`);
    if (at === -1) { at = sources.install.lastIndexOf(`ui.phaseEnd('${id}'`); }
    if (at === -1) {
      errors.push(`phase "${id}" is declared in cli/lib/ui/installer-run.ts but cli/install.ts never starts it`);
      continue;
    }
    if (at < previous.at) {
      errors.push(`cli/install.ts runs phase "${id}" before "${previous.id}", against the order in cli/lib/ui/installer-run.ts`);
    }
    previous = { id, at };
  }

  // Steps: every probe still exists; every prompt is a real ask id and every ask id is claimed.
  const askIds = extractAskIds(sources.install);
  const claimed = new Map<string, string>();
  for (const [phase, steps] of Object.entries(PHASE_STEPS)) {
    const src = phase === 'pre' ? `${sources.install}\n${sources.preflight}` : sources.install;
    for (const s of steps) {
      for (const probe of s.probes) {
        if (!src.includes(probe)) { errors.push(`step "${phase}/${s.step}": ${probe} is gone from cli/install.ts`); }
      }
      for (const p of s.prompts ?? []) {
        if (!askIds.includes(p)) { errors.push(`step "${phase}/${s.step}": prompt "${p}" is not asked in cli/install.ts`); }
        if (claimed.has(p)) { errors.push(`prompt "${p}" is claimed by "${claimed.get(p)}" and "${phase}/${s.step}"`); }
        claimed.set(p, `${phase}/${s.step}`);
      }
    }
  }
  for (const id of askIds) {
    if (!claimed.has(id)) { errors.push(`cli/install.ts asks "${id}", which no PHASE_STEPS step declares`); }
  }

  // Prerequisites: every named preflight check exists; every blocking check is described.
  const checks = extractPreflightChecks(sources.preflight);
  const covered = new Set<string>();
  for (const p of prereqs) {
    for (const id of p.preflight ?? []) {
      if (!checks.all.has(id)) { errors.push(`prerequisite "${p.name}" names preflight check "${id}", which runSetupPreflight no longer has`); }
      if (p.required) { covered.add(id); }
    }
  }
  for (const id of checks.blocking) {
    if (!covered.has(id) && !NOT_APPLICABLE[id]) {
      errors.push(`preflight check "${id}" can block bun setup but no required prerequisite names it (or add it to NOT_APPLICABLE with the reason)`);
    }
  }
  return errors;
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

export function buildManifest(sources: Sources): object {
  const src = sources.install;
  const canonicalMcps = extractStringArray(src, 'CANONICAL_MCPS');
  const mcpSecrets = extractMcpSecrets(src);
  const projectSkills = extractCommunitySkills(src, 'PROJECT_LEVEL_SKILLS');
  const userSkills = extractCommunitySkills(src, 'USER_LEVEL_SKILLS');
  const externalClis = extractExternalClis(src);
  const knownFlags = extractStringArray(src, 'KNOWN_FLAGS');
  const usage = extractHelpUsage(src);
  const phases = extractPhases(sources.installerRun);
  const askIds = extractAskIds(src);

  const mcpsWithKeys = canonicalMcps.filter(name => (mcpSecrets[name] ?? []).length > 0);
  const prereqs = prerequisites(mcpsWithKeys);

  const errors = validateAgainstSources(sources, phases, prereqs);
  if (errors.length > 0) {
    throw new Error(`the manifest's hand-written half no longer matches the installer:\n  - ${errors.join('\n  - ')}\nUpdate PHASE_STEPS / PREREQUISITES in gen-install-manifest.ts.`);
  }

  // Engram is wired per agent with the engram binary's own `engram setup`.
  const engramItems: ManifestEntry[] = [
    { name: 'engram', purpose: purposeOr('engram'), source: 'engram setup' },
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
    version: 2,
    sourceRef: 'main',
    prerequisites: prereqs.map(({ preflight: _preflight, ...p }) => p),
    willInstall: {
      engramMemory: { count: engramItems.length, items: engramItems },
      communityProjectSkills: { count: projectItems.length, items: projectItems },
      communityUserSkills: { count: userItems.length, items: userItems },
    },
    willConfigure: {
      mcps: mcpEntries,
      envFiles: [
        { path: '.env', what: 'Created from .env.example. Stores all API keys and secrets (gitignored).' },
        // eslint-disable-next-line no-template-curly-in-string
        { path: '.mcp.json', what: 'Already committed. Uses ${VAR} placeholders — installer ensures .env has the values.' },
        { path: 'opencode.jsonc', what: 'Already committed. Uses {env:VAR} placeholders — installer ensures .env has the values.' },
        { path: '.agents/project.yaml', what: 'Project identity, environments and the selected agents, written by the Team and Project phases.' },
        { path: '.template/installer.state.json', what: 'Installer idempotency state (gitignored). Tracks which steps completed.' },
      ],
      auth: [
        // `credsFrom` lists ENV vars only. The Atlassian site host is not one:
        // it lives in `.agents/project.yaml` -> `issue_tracker.atlassian_url`
        // and is read via `bun run jira:url`. Listing it here would tell users
        // to put it in `.env`, which is what this repo just stopped doing.
        {
          service: 'acli (Atlassian CLI)',
          method: 'Signed in by the Jira phase with the .env email and token — credentials stored in ~/.config/acli/. Site host from .agents/project.yaml (bun run jira:url --slug), not from the environment.',
          credsFrom: ['ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'],
        },
        {
          service: 'Jira via the opt-in Atlassian MCP (HTTP basic auth)',
          method: 'Not configured by bun setup: acli stays the default Jira path. When enabled, env vars are read at MCP startup; the site host is pasted into the config (an MCP config cannot run a command); print it with bun run jira:url.',
          credsFrom: ['ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'],
        },
        {
          service: 'Xray Cloud (bun xray)',
          method: 'Not configured by bun setup: credentials are read when a bun xray command runs. Only needed when the project uses Xray as its TMS.',
          credsFrom: ['XRAY_CLIENT_ID', 'XRAY_CLIENT_SECRET'],
        },
      ],
    },
    phases: phases.map(p => ({
      ...p,
      steps: (PHASE_STEPS[p.id] ?? []).map(s => ({
        step: s.step,
        what: s.what,
        interactive: s.interactive ?? (s.prompts ?? []).length > 0,
        ...((s.prompts ?? []).length > 0 ? { prompts: s.prompts } : {}),
      })),
    })),
    prompts: askIds,
    flags: knownFlags,
    usage,
    willNotInstall,
  };
}

// ============================================================================
// JSON helpers
// ============================================================================

function sortedJson(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export function readSources(): Sources {
  for (const p of [INSTALL_TS, INSTALLER_RUN_TS, PREFLIGHT_TS]) {
    if (!existsSync(p)) {
      throw new Error(`Could not find ${p}`);
    }
  }
  return {
    install: readFileSync(INSTALL_TS, 'utf8'),
    installerRun: readFileSync(INSTALLER_RUN_TS, 'utf8'),
    preflight: readFileSync(PREFLIGHT_TS, 'utf8'),
  };
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const checkMode = process.argv.includes('--check');

  let manifest: object;
  try {
    manifest = buildManifest(readSources());
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
      engramMemory: { count: number }
      communityProjectSkills: { count: number }
      communityUserSkills: { count: number }
    }
    willConfigure: { mcps: unknown[] }
    phases: unknown[]
    prerequisites: unknown[]
    willNotInstall: unknown[]
  };

  const engramCount = parsed.willInstall.engramMemory.count;
  const projectCount = parsed.willInstall.communityProjectSkills.count;
  const userCount = parsed.willInstall.communityUserSkills.count;
  const mcpCount = parsed.willConfigure.mcps.length;
  const phaseCount = parsed.phases.length;
  const prereqCount = parsed.prerequisites.length;
  const wontCount = parsed.willNotInstall.length;

  process.stdout.write(
    `Manifest written: engram=${engramCount}, project=${projectCount}, user=${userCount}, mcps=${mcpCount}, phases=${phaseCount}, prereqs=${prereqCount}, won't-install=${wontCount}\n`,
  );
}

if (import.meta.main) {
  main();
}
