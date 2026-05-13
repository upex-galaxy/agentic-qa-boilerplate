#!/usr/bin/env bun

/**
 * ============================================================================
 * UPDATE BOILERPLATE CLI
 * ============================================================================
 *
 * Keeps your project synchronized with the official KATA template
 * (agentic-qa-boilerplate) without overwriting your
 * project-specific customizations.
 *
 * PRINCIPLE:
 *   Only sync UNIVERSAL framework files, never project-specific configs.
 *   Per-component SHA tracking ensures only changed files are surfaced —
 *   no false positives, no unnecessary prompts after a clean sync.
 *
 * ============================================================================
 * AGENT SKILLS MODEL
 * ============================================================================
 *
 * Operational workflows live as agent skills under `.claude/skills/`. Both
 * Claude Code and OpenCode read this directory natively (OpenCode falls back
 * to Claude Code conventions when its own paths are absent), so a single
 * canonical location covers all supported agents — no symlinks needed.
 *
 * ============================================================================
 * WHAT GETS SYNCED (Universal - same across all projects)
 * ============================================================================
 *
 *   .claude/skills/        Agent skills (project-discovery, sprint-testing, ...)
 *   .claude/commands/      Slash commands (sync-ai-memory, fix-traceability, business-*-map, ...)
 *   .claude/settings.json  Versioned default permissions (settings.local.json untouched)
 *   scripts/               Framework scripts (agents-lint, sync-jira-issues, sync-openapi, api-login, kata-manifest, ...)
 *   templates/             Universal templates (pr-test-automation, ...)
 *   .agents/README.md      Variable system documentation (only README, not project.yaml/jira-fields.json)
 *   docs/                  General documentation
 *   cli/                   CLI tools — xray/ (multi-command Xray CLI) and this auto-updater itself
 *   .vscode/               IDE configuration (extensions, settings)
 *   .husky/                Git hooks
 *   tooling/               Config files (editorconfig, prettier)
 *   examples/              Example templates (.mcp.example.json, dbhub.example.toml)
 *
 * After every successful sync the CLI also reports any framework scripts or
 * dependencies present in the template `package.json` but missing from yours,
 * with the exact lines to copy across.
 *
 * ============================================================================
 * WHAT NEVER GETS SYNCED (Project-specific)
 * ============================================================================
 *
 *   .github/workflows/          Your CI/CD pipelines
 *   config/                     Your URLs, credentials, timeouts
 *   tests/components/           Your domain components (pages, APIs)
 *   tests/utils/                Your custom utilities
 *   tests/data/                 Your fixtures and factories
 *   tests/setup/                Your auth setup
 *   playwright.config           Your test configuration
 *   .context/PRD|SRS|idea|PBI   Your generated discovery content
 *   .agents/project.yaml        Your project variables (per-repo config)
 *   .agents/jira-fields.json    Auto-generated Jira field catalog
 *   .agents/jira-required.yaml  Manifest customised per project (optional/unmapped)
 *   .claude/settings.local.json Your personal Claude Code permissions (gitignored)
 *   .mcp.json                   Your MCP credentials (use .mcp.example.json as a template)
 *   CLAUDE.md|GEMINI.md         Your AI memory files
 *   README.md                   Your project documentation
 *   package.json                Your dependencies (script/dep gaps reported instead)
 *   eslint.config.js            Your linting rules
 *   tsconfig.json               Your TypeScript config
 *   .env.example                Your environment variables
 *
 * ============================================================================
 * REQUIREMENTS
 * ============================================================================
 *
 * 1. Bun runtime       (https://bun.sh)
 * 2. git >= 2.25       (for sparse-checkout and partial clone support)
 * 3. GitHub CLI (gh)   — authenticated with access to the template repo
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   bun run update                                    Interactive per-file menu
 *   bun run update all                                Update everything (allowed dirs only)
 *   bun run update skills                             Sync all agent skills
 *   bun run update skills --skill sprint-testing      Sync a specific skill
 *   bun run update skills --skill a,b,c               Sync several skills
 *   bun run update skills --list                      List skills available in the template
 *   bun run update commands                           Update .claude/commands/ (slash commands)
 *   bun run update scripts                            Update scripts/ (framework scripts)
 *   bun run update templates                          Update templates/ (universal templates)
 *   bun run update agents-docs                        Update .agents/README.md only
 *   bun run update claude-config                      Update .claude/settings.json (settings.local.json untouched)
 *   bun run update docs                               Update docs/
 *   bun run update cli                                Update cli/
 *   bun run update vscode                             Update .vscode/
 *   bun run update husky                              Update .husky/
 *   bun run update tooling                            Update config files (prettier, etc.)
 *   bun run update examples                           Update example templates
 *   bun run update all --dry-run                      Preview changes without modifying
 *   bun run update all --auto                         Non-interactive: apply safe changes, skip diverged
 *   bun run update all --auto --dry-run               Preview what --auto would apply
 *   bun run update --rollback                         Restore from most recent backup
 *
 * ============================================================================
 * DELTA-DRIVEN INTERACTIVE MERGE
 * ============================================================================
 *
 * The CLI uses a delta-driven merge strategy powered by per-component SHA
 * tracking. On each run it computes exactly which upstream files changed since
 * your last sync and presents only those files for review:
 *
 *   clean-fastforward   — template changed, your copy is identical (applied automatically)
 *   locally-diverged    — both sides changed; prompts [t]heirs / [m]ine / [s]kip
 *   new-upstream        — new file in template not yet in your repo (applied automatically)
 *   deleted-upstream    — upstream removed a file; requires explicit confirmation to delete locally
 *   binary-skip         — binary files are always skipped with a warning
 *
 * In auto / CI mode (--auto or CI=true): clean-ff + new-upstream applied automatically;
 * diverged files skipped; deletions deferred (never deleted without human confirmation).
 *
 * ============================================================================
 * PER-COMPONENT SHA TRACKING
 * ============================================================================
 *
 * Sync state is stored in `.boilerplate-version.json` (v6 schema):
 *
 *   {
 *     "schema": 6,
 *     "templateRepo": "upex-galaxy/agentic-qa-boilerplate",
 *     "templateCommit": "<last-synced-HEAD-sha>",
 *     "perComponentCommit": {
 *       "skills": "<sha>",
 *       "scripts": "<sha>",
 *       ...
 *     },
 *     "lastSyncedAt": "<ISO-8601>",
 *     "cliVersion": "6.0"
 *   }
 *
 * A component's SHA advances only when ALL changed files in that component
 * were applied (no skips, no failures). Skipped files reappear on the next run.
 * This file is safe to commit — it records your sync history, not secrets.
 *
 * First run (no version file): the CLI bootstraps with a one-time bulk sync
 * and writes the initial `perComponentCommit` map.
 *
 * Upgrade from v5.3: the CLI prompts before migrating; abort exits 0 and
 * leaves the file untouched. Migration only commits to disk after a
 * successful sync, never before.
 *
 * Repository acquisition uses git sparse-checkout (partial clone with
 * --filter=blob:none) so only the synced paths are downloaded — one network
 * round trip, minimal bandwidth.
 *
 * ============================================================================
 *
 * @author UPEX Galaxy
 * @version 6.0
 */

import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLI_VERSION = '6.0';
const TEMPLATE_REPO = 'upex-galaxy/agentic-qa-boilerplate';
const TEMP_DIR = join(tmpdir(), 'kata-boilerplate-update');

/**
 * Canonical skills location (Claude Code) and portability symlink target.
 * The CLI syncs the canonical path; the symlink is ensured after sync so
 * Codex / Copilot / Cursor / OpenCode resolve skills from the same source.
 */
const SKILLS_CANONICAL_DIR = join('.claude', 'skills');

/**
 * Config files that are universal across all KATA projects
 * NOTE: eslint.config.js and tsconfig.json are project-specific (not synced)
 */
const TOOLING_FILES = [
  '.editorconfig',
  '.prettierrc',
  '.prettierignore',
];

/**
 * Example/template files that help users configure their project
 * NOTE: .env.example is project-specific (not synced)
 */
const EXAMPLE_FILES = [
  '.mcp.example.json',
  'dbhub.example.toml',
];

/**
 * Files inside .agents/ that ARE universal and safe to sync.
 *
 * NEVER sync from .agents/:
 *   - project.yaml         (per-repo config — owned by the consumer)
 *   - jira-fields.json            (auto-generated by `bun run jira:sync-fields`)
 *   - jira-required.yaml   (manifest the consumer customises with optional/unmapped entries)
 *   - skills (symlink)     (managed independently by the skills sync)
 */
const AGENTS_DOCS_FILES = [
  '.agents/README.md',
];

/**
 * Universal `.claude/` config files that ARE safe to sync.
 *
 * NEVER sync from .claude/:
 *   - settings.local.json   (per-developer permissions; gitignored)
 *   - skills/, commands/    (handled by their own sync paths)
 */
const CLAUDE_CONFIG_FILES = [
  '.claude/settings.json',
];

/**
 * Canonical component registry. Each entry drives:
 *  - sparse-checkout path patterns (via `paths`)
 *  - perComponentCommit key (via `name`)
 *  - bootstrap/delta scoping
 *
 * TOOLING_FILES and EXAMPLE_FILES are resolved at declaration time so this
 * const can reference them. AGENTS_DOCS_FILES and CLAUDE_CONFIG_FILES likewise.
 */
const COMPONENTS = [
  { name: 'skills', paths: ['.claude/skills'], kind: 'directory' as const },
  { name: 'commands', paths: ['.claude/commands'], kind: 'directory' as const },
  { name: 'scripts', paths: ['scripts'], kind: 'directory' as const },
  { name: 'templates', paths: ['templates'], kind: 'directory' as const },
  { name: 'docs', paths: ['docs'], kind: 'directory' as const },
  { name: 'cli', paths: ['cli'], kind: 'directory' as const },
  { name: 'vscode', paths: ['.vscode'], kind: 'directory' as const },
  { name: 'husky', paths: ['.husky'], kind: 'directory' as const },
  { name: 'agents-docs', paths: AGENTS_DOCS_FILES, kind: 'file-list' as const, files: AGENTS_DOCS_FILES },
  { name: 'claude-config', paths: CLAUDE_CONFIG_FILES, kind: 'file-list' as const, files: CLAUDE_CONFIG_FILES },
  { name: 'tooling', paths: TOOLING_FILES, kind: 'file-list' as const, files: TOOLING_FILES },
  { name: 'examples', paths: EXAMPLE_FILES, kind: 'file-list' as const, files: EXAMPLE_FILES },
] satisfies readonly Component[];

// ============================================================================
// TYPES
// ============================================================================

interface ParsedArgs {
  commands: string[]
  skills: string[] | null
  listSkills: boolean
  all: boolean
  help: boolean
  dryRun: boolean
  rollback: boolean
  auto: boolean
}

interface MergeResult {
  success: number
  errors: number
}

// writeSyncState uses tmp+rename atomic write. Assumes .boilerplate-version.json and its .tmp.PID
// sibling are on the same filesystem (POSIX rename guarantee). Cross-FS writes (e.g. tmpdir on a
// separate partition) are out of scope.

// v6 — target schema
interface SyncStateV6 {
  schema: 6
  templateRepo: string
  templateCommit: string
  perComponentCommit: Record<string, string>
  lastSyncedAt: string
  cliVersion: string
  variableSystemVersion: 1
}

// v5.3 — legacy, detection only (still exists in the wild)
interface SyncStateV5 {
  lastSync: string
  templateCommit: string
  cliVersion: string
  syncedComponents: string[]
  variableSystemVersion: number
}

type SyncState = SyncStateV6 | SyncStateV5;

type ComponentKind = 'directory' | 'file-list';

interface Component {
  name: string
  paths: string[]
  kind: ComponentKind
  files?: string[]
  backupRoots?: string[]
}

type ChangeStatus = 'M' | 'A' | 'D';

type FileClass
  = 'clean-fastforward'
    | 'locally-diverged'
    | 'new-upstream'
    | 'deleted-upstream'
    | 'unchanged'
    | 'binary-skip';

interface DeltaEntry {
  component: string
  path: string
  status: ChangeStatus
  classification: FileClass
  addLines: number
  delLines: number
  isBinary: boolean
  templateOldSha: string | null
  templateNewSha: string | null
}

type Resolution = 'theirs' | 'mine' | 'skip' | 'delete' | 'keep';

interface AppliedFile {
  entry: DeltaEntry
  resolution: Resolution
}

interface FailedFile {
  entry: DeltaEntry
  resolution: Resolution
  error: string
}

interface RunSummary {
  applied: AppliedFile[]
  skipped: AppliedFile[]
  failed: FailedFile[]
  binarySkipped: DeltaEntry[]
  bootstrapComponents: string[]
  newHeadSha: string
}

class CorruptStateError extends Error {}

// ============================================================================
// TERMINAL COLORS & LOGGING
// ============================================================================

const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  magenta: '\x1B[35m',
  cyan: '\x1B[36m',
};

const log = {
  header: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}`),
  success: (msg: string) => console.log(`${colors.green}  ${msg}${colors.reset}`),
  warning: (msg: string) => console.log(`${colors.yellow}  ${msg}${colors.reset}`),
  error: (msg: string) => console.log(`${colors.red}  ${msg}${colors.reset}`),
  info: (msg: string) => console.log(`${colors.blue}  ${msg}${colors.reset}`),
  step: (msg: string) => console.log(`${colors.yellow}  ${msg}${colors.reset}`),
  merge: (msg: string) => console.log(`${colors.magenta}  ${msg}${colors.reset}`),
  dim: (msg: string) => console.log(`${colors.dim}  ${msg}${colors.reset}`),
};

// ============================================================================
// NATIVE PROMPT (for interactive mode without @inquirer/prompts)
// ============================================================================

async function nativePrompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ============================================================================
// DEPENDENCY CHECK
// ============================================================================

function isPackageInstalled(packageName: string): boolean {
  const nodeModulesPath = join(process.cwd(), 'node_modules', packageName);
  if (existsSync(nodeModulesPath)) {
    return true;
  }

  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/');
    const scopedPath = join(process.cwd(), 'node_modules', scope, name);
    if (existsSync(scopedPath)) {
      return true;
    }
  }

  return false;
}

async function ensureDependencies(): Promise<boolean> {
  if (isPackageInstalled('@inquirer/prompts')) {
    return true;
  }

  console.log(`
${colors.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
${colors.bold}${colors.yellow}  Missing dependency: @inquirer/prompts${colors.reset}
${colors.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

This dependency is required for the ${colors.cyan}interactive menu${colors.reset}.

${colors.dim}Without it, you can only use direct commands like:${colors.reset}
  ${colors.green}bun run update all${colors.reset}                      - Update everything
  ${colors.green}bun run update skills${colors.reset}                   - Sync agent skills
  ${colors.green}bun run update cli${colors.reset}                      - Update CLI tools

${colors.bold}Do you want to install the dependency now?${colors.reset}
`);

  const answer = await nativePrompt(`${colors.cyan}[Y/n]:${colors.reset} `);

  if (answer === '' || answer === 'y' || answer === 'yes') {
    console.log(`\n${colors.blue}  Installing @inquirer/prompts...${colors.reset}\n`);

    try {
      execSync('bun add @inquirer/prompts', { stdio: 'inherit' });
      console.log(`
${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
${colors.bold}${colors.green}  Dependency installed successfully${colors.reset}
${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

Run the script again:
  ${colors.cyan}bun run update${colors.reset}
`);
      process.exit(0);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Error installing dependency: ${message}`);
      console.log(`\n${colors.yellow}Try installing manually:${colors.reset}`);
      console.log(`  ${colors.green}bun add @inquirer/prompts${colors.reset}\n`);
      process.exit(1);
    }
  }
  else {
    console.log(`\n${colors.yellow}Installation cancelled.${colors.reset}`);
    console.log('\nYou can use direct commands without the interactive menu:');
    console.log(`  ${colors.green}bun run update all${colors.reset}      - Update everything`);
    console.log(`  ${colors.green}bun run update help${colors.reset}     - See all options\n`);
    process.exit(0);
  }

  return false;
}

// ============================================================================
// GIT ENVIRONMENT GUARD
// ============================================================================

interface GitVersion {
  major: number
  minor: number
  patch: number
  raw: string
}

/**
 * Execute `git --version` and parse the result.
 * Throws Error('GIT_NOT_FOUND') if git binary is not on PATH.
 * Throws Error('GIT_VERSION_UNPARSEABLE: <raw>') if the version string does not match expected format.
 */
function detectGitVersion(): GitVersion {
  let raw: string;
  try {
    raw = execSync('git --version', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  }
  catch {
    throw new Error('GIT_NOT_FOUND');
  }

  const match = /\bgit version (\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!match) {
    throw new Error(`GIT_VERSION_UNPARSEABLE: ${raw}`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    raw,
  };
}

/**
 * Ensure git >= 2.25.0 is available. Exits process with code 2 on any failure.
 * NOT called from main() in M1 — wired in M4.
 */
function ensureGitVersion(): void {
  let version: GitVersion;
  try {
    version = detectGitVersion();
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'GIT_NOT_FOUND') {
      log.error('git not found on PATH. git >= 2.25 is required for sparse-checkout support.');
      log.info('Install git:');
      if (process.platform === 'darwin') {
        log.info('  brew install git');
      }
      else if (process.platform === 'win32') {
        log.info('  winget install Git.Git  (or use WSL2 with apt install git)');
      }
      else {
        log.info('  sudo apt install git        # Ubuntu/Debian/WSL');
        log.info('  apk add git                 # Alpine');
      }
    }
    else {
      log.error(`Could not determine git version: ${msg}`);
    }
    process.exit(2);
  }

  const { major, minor, raw } = version;
  const meetsReq = major > 2 || (major === 2 && minor >= 25);
  if (!meetsReq) {
    log.error(`git ${raw} detected. git >= 2.25.0 is required for sparse-checkout support.`);
    log.info('Upgrade git:');
    if (process.platform === 'darwin') {
      log.info('  brew upgrade git');
    }
    else if (process.platform === 'win32') {
      log.info('  winget upgrade Git.Git  (or update via WSL2: sudo apt-get install --only-upgrade git)');
    }
    else {
      log.info('  sudo apt-get install --only-upgrade git    # Ubuntu/Debian/WSL');
      log.info('  apk upgrade git                             # Alpine');
    }
    process.exit(2);
  }
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    commands: [],
    skills: null,
    listSkills: false,
    all: false,
    help: false,
    dryRun: false,
    rollback: false,
    auto: false,
  };

  const validCommands = ['all', 'skills', 'commands', 'scripts', 'templates', 'agents-docs', 'claude-config', 'docs', 'cli', 'vscode', 'husky', 'tooling', 'examples', 'help', 'rollback'];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === 'help' || arg === '--help' || arg === '-h') {
      result.help = true;
    }
    else if (arg === '--all') {
      result.all = true;
    }
    else if (arg === '--dry-run') {
      result.dryRun = true;
    }
    else if (arg === '--auto') {
      result.auto = true;
    }
    else if (arg === '--rollback' || arg === 'rollback') {
      result.rollback = true;
    }
    else if (arg === '--list') {
      result.listSkills = true;
    }
    else if (arg === '--skill' || arg === '--skills') {
      const nextArg = args[++i];
      if (nextArg) {
        result.skills = nextArg
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0);
      }
    }
    else if (validCommands.includes(arg)) {
      result.commands.push(arg);
    }
    else if (!arg.startsWith('-')) {
      log.warning(`Unknown command: ${arg}`);
    }
  }

  return result;
}

// ============================================================================
// PREREQUISITES
// ============================================================================

function checkCommand(command: string, name: string): boolean {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  }
  catch {
    log.error(`${name} is not installed`);
    return false;
  }
}

async function validatePrerequisites(): Promise<void> {
  if (!checkCommand('gh', 'GitHub CLI (gh)')) {
    console.log('\nInstall it with:');
    if (process.platform === 'darwin') {
      console.log('  brew install gh');
    }
    else if (process.platform === 'win32') {
      console.log('  winget install GitHub.cli');
    }
    else {
      console.log('  sudo apt install gh  # Ubuntu/Debian');
      console.log('  Or visit: https://cli.github.com/');
    }
    process.exit(1);
  }

  try {
    execSync('gh auth status', { stdio: 'ignore' });
  }
  catch {
    log.warning('You are not authenticated with GitHub CLI');
    console.log('Run: gh auth login');
    process.exit(1);
  }
}

// ============================================================================
// BACKUP
// ============================================================================

// eslint-disable-next-line unused-imports/no-unused-vars
function createBackup(components: string[]): string {
  log.step('Creating backup...');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = join('.backups', `update-${timestamp}`);

  mkdirSync(backupDir, { recursive: true });

  const backupMap: Record<string, { src: string, dest: string }> = {
    skills: { src: '.claude/skills', dest: '.claude/skills' },
    commands: { src: '.claude/commands', dest: '.claude/commands' },
    scripts: { src: 'scripts', dest: 'scripts' },
    templates: { src: 'templates', dest: 'templates' },
    docs: { src: 'docs', dest: 'docs' },
    cli: { src: 'cli', dest: 'cli' },
    vscode: { src: '.vscode', dest: '.vscode' },
    husky: { src: '.husky', dest: '.husky' },
  };

  for (const comp of components) {
    const mapping = backupMap[comp];
    if (mapping && existsSync(mapping.src)) {
      const destPath = join(backupDir, mapping.dest);
      mkdirSync(join(destPath, '..'), { recursive: true });
      cpSync(mapping.src, destPath, { recursive: true });
    }
  }

  log.success(`Backup saved to: ${backupDir}`);
  return backupDir;
}

/**
 * Restore files from the most recent backup in .backups/
 */
function rollbackFromBackup(): void {
  log.header('  Rollback from Backup');

  const backupsDir = '.backups';
  if (!existsSync(backupsDir)) {
    log.error('No backups found. The .backups/ directory does not exist.');
    process.exit(1);
  }

  const backups = readdirSync(backupsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('update-'))
    .map(d => d.name)
    .sort()
    .reverse();

  if (backups.length === 0) {
    log.error('No backups found in .backups/');
    process.exit(1);
  }

  const latest = backups[0];
  const backupPath = join(backupsDir, latest);

  log.info(`Found ${backups.length} backup${backups.length > 1 ? 's' : ''}:`);
  for (const b of backups.slice(0, 5)) {
    const marker = b === latest ? `${colors.green}  (latest)${colors.reset}` : '';
    console.log(`   ${colors.dim}${b}${colors.reset}${marker}`);
  }
  if (backups.length > 5) {
    console.log(`   ${colors.dim}... and ${backups.length - 5} more${colors.reset}`);
  }

  console.log('');
  log.step(`Restoring from: ${latest}`);

  // Walk the backup directory and copy files back
  let restored = 0;
  const restoreDir = (srcDir: string, destDir: string) => {
    const items = readdirSync(srcDir, { withFileTypes: true });
    for (const item of items) {
      const srcPath = join(srcDir, item.name);
      const destPath = join(destDir, item.name);
      if (item.isDirectory()) {
        mkdirSync(destPath, { recursive: true });
        restoreDir(srcPath, destPath);
      }
      else {
        cpSync(srcPath, destPath);
        restored++;
      }
    }
  };

  try {
    restoreDir(backupPath, process.cwd());
    log.success(`Restored ${restored} files from ${latest}`);
  }
  catch (err) {
    log.error(`Rollback failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// ============================================================================
// CLONE TEMPLATE
// ============================================================================

async function cloneTemplate(): Promise<void> {
  log.step('Downloading latest version of the template...');
  log.dim(`Repo: ${TEMPLATE_REPO}`);
  log.dim(`Temp destination: ${TEMP_DIR}`);

  if (existsSync(TEMP_DIR)) {
    log.dim('Cleaning previous temp directory...');
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  log.dim('Verifying GitHub CLI authentication...');
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    log.success('GitHub CLI authenticated');
  }
  catch {
    log.error('GitHub CLI is not authenticated');
    console.log(`\n${colors.yellow}Run first:${colors.reset}`);
    console.log(`  ${colors.cyan}gh auth login${colors.reset}\n`);
    process.exit(1);
  }

  log.dim('Cloning repository (this may take a few seconds)...');

  try {
    const cloneCommand = `gh repo clone ${TEMPLATE_REPO} "${TEMP_DIR}" -- --depth 1 --quiet`;
    execSync(cloneCommand, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    log.success('Template downloaded successfully');
  }
  catch (error) {
    const err = error as { killed?: boolean, message?: string };
    if (err.killed) {
      log.error('Timeout: Download took too long (>60s)');
      console.log(`${colors.yellow}Possible causes:${colors.reset}`);
      console.log('  - Slow internet connection');
      console.log('  - GitHub issues');
      console.log(`\n${colors.yellow}Try running manually:${colors.reset}`);
      console.log(`  ${colors.cyan}gh repo clone ${TEMPLATE_REPO}${colors.reset}\n`);
    }
    else {
      log.error('Error downloading the template');
      console.log(`${colors.yellow}Possible causes:${colors.reset}`);
      console.log('  - You do not have access to the repository');
      console.log('  - Internet connection issues');
      console.log('  - GitHub CLI not configured correctly');
      console.log(`\n${colors.yellow}Verify your access:${colors.reset}`);
      console.log(`  ${colors.cyan}gh repo view ${TEMPLATE_REPO}${colors.reset}\n`);
    }
    process.exit(1);
  }
}

// ============================================================================
// MERGE UTILITIES
// ============================================================================

function mergeDirectory(srcDir: string, destDir: string, prefix = ''): MergeResult {
  let success = 0;
  let errors = 0;

  mkdirSync(destDir, { recursive: true });

  const items = readdirSync(srcDir, { withFileTypes: true });

  for (const item of items) {
    const srcPath = join(srcDir, item.name);
    const destPath = join(destDir, item.name);

    try {
      if (item.isDirectory()) {
        const sub = mergeDirectory(srcPath, destPath, `${prefix}  `);
        success += sub.success;
        errors += sub.errors;
        log.success(`${prefix}${item.name}/`);
      }
      else {
        cpSync(srcPath, destPath);
        success++;
        log.success(`${prefix}${item.name}`);
      }
    }
    catch (err) {
      log.warning(`${prefix}Skipped ${item.name}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

/**
 * Count files in a directory recursively (for dry-run mode)
 */
function countFilesInDir(dir: string): number {
  if (!existsSync(dir)) { return 0; }
  let count = 0;
  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      count += countFilesInDir(join(dir, item.name));
    }
    else {
      count++;
    }
  }
  return count;
}

/**
 * Execute a dry-run: preview what would change without modifying files.
 */
// eslint-disable-next-line unused-imports/no-unused-vars
function executeDryRun(commands: string[], allMode: boolean, skillsFilter: string[] | null): void {
  log.header('  DRY RUN — No files will be modified');
  console.log('');

  const components: { name: string, dir: string }[] = [];

  if (commands.includes('skills') || allMode) {
    const templateSkillsPath = join(TEMP_DIR, SKILLS_CANONICAL_DIR);
    const available = listTemplateSkills(templateSkillsPath);
    const selected = skillsFilter && skillsFilter.length > 0
      ? available.filter(s => skillsFilter.includes(s))
      : available;

    if (selected.length === 0) {
      console.log(`   ${colors.dim}Skills  →  None selected or template directory missing${colors.reset}`);
    }
    else {
      for (const skill of selected) {
        components.push({ name: `Skill: ${skill}`, dir: join(templateSkillsPath, skill) });
      }
    }
  }
  if (commands.includes('commands') || allMode) {
    components.push({ name: 'Slash commands (.claude/commands/)', dir: join(TEMP_DIR, '.claude', 'commands') });
  }
  if (commands.includes('scripts') || allMode) {
    components.push({ name: 'Framework scripts (scripts/)', dir: join(TEMP_DIR, 'scripts') });
  }
  if (commands.includes('templates') || allMode) {
    components.push({ name: 'Universal templates (templates/)', dir: join(TEMP_DIR, 'templates') });
  }
  if (commands.includes('docs') || allMode) {
    components.push({ name: 'Documentation (docs/)', dir: join(TEMP_DIR, 'docs') });
  }
  if (commands.includes('cli') || allMode) {
    components.push({ name: 'CLI Tools (cli/)', dir: join(TEMP_DIR, 'cli') });
  }
  if (commands.includes('vscode') || allMode) {
    components.push({ name: 'VS Code (.vscode/)', dir: join(TEMP_DIR, '.vscode') });
  }
  if (commands.includes('husky') || allMode) {
    components.push({ name: 'Git Hooks (.husky/)', dir: join(TEMP_DIR, '.husky') });
  }
  if (commands.includes('tooling') || allMode) {
    // Tooling is individual files, count them directly
    const toolingCount = TOOLING_FILES.filter(f => existsSync(join(TEMP_DIR, f))).length;
    console.log(`   ${colors.cyan}Tooling${colors.reset}  →  Would sync ${toolingCount} config file${toolingCount !== 1 ? 's' : ''}`);
  }
  if (commands.includes('examples') || allMode) {
    const examplesCount = EXAMPLE_FILES.filter(f => existsSync(join(TEMP_DIR, f))).length;
    console.log(`   ${colors.cyan}Examples${colors.reset}  →  Would sync ${examplesCount} example file${examplesCount !== 1 ? 's' : ''}`);
  }
  if (commands.includes('agents-docs') || allMode) {
    const agentsDocsCount = AGENTS_DOCS_FILES.filter(f => existsSync(join(TEMP_DIR, f))).length;
    console.log(`   ${colors.cyan}.agents docs${colors.reset}  →  Would sync ${agentsDocsCount} doc file${agentsDocsCount !== 1 ? 's' : ''} (project.yaml / jira-fields.json / jira-required.yaml NOT touched)`);
  }
  if (commands.includes('claude-config') || allMode) {
    const claudeCount = CLAUDE_CONFIG_FILES.filter(f => existsSync(join(TEMP_DIR, f))).length;
    console.log(`   ${colors.cyan}.claude config${colors.reset}  →  Would sync ${claudeCount} file${claudeCount !== 1 ? 's' : ''} (settings.local.json NOT touched)`);
  }

  let totalFiles = 0;
  for (const comp of components) {
    const count = countFilesInDir(comp.dir);
    totalFiles += count;
    if (count > 0) {
      console.log(`   ${colors.cyan}${comp.name}${colors.reset}  →  Would sync ${count} file${count !== 1 ? 's' : ''}`);
    }
    else {
      console.log(`   ${colors.dim}${comp.name}  →  Not found in template${colors.reset}`);
    }
  }

  console.log('');
  log.info(`Total: ${totalFiles} files would be synced`);
  log.info('Run without --dry-run to apply changes.');
}

// ============================================================================
// SKILLS HELPERS
// ============================================================================

/**
 * Return the skill folder names present in a `.claude/skills/` directory.
 */
function listTemplateSkills(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) { return []; }
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

/**
 * Print the list of skills available in the template and exit.
 */
function printSkillsList(): void {
  const templateSkillsPath = join(TEMP_DIR, SKILLS_CANONICAL_DIR);
  const skills = listTemplateSkills(templateSkillsPath);

  log.header('  Skills available in the template');
  if (skills.length === 0) {
    log.warning('No skills found in the template (.claude/skills/).');
    return;
  }
  for (const skill of skills) {
    console.log(`   ${colors.cyan}${skill}${colors.reset}`);
  }
  console.log('');
  log.info(`Total: ${skills.length} skill${skills.length === 1 ? '' : 's'}`);
  log.info('Use `bun run update skills --skill <name[,name,...]>` to sync specific skills.');
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

/**
 * Sync skills at skill-folder granularity.
 *
 * Each folder inside the template's `.claude/skills/` is treated as the atomic
 * unit of sync. User skills that don't exist in the template are preserved.
 */
// eslint-disable-next-line unused-imports/no-unused-vars
function updateSkills(skillsFilter: string[] | null): MergeResult {
  log.step(`Updating ${SKILLS_CANONICAL_DIR}/ (merge)...`);

  const totals: MergeResult = { success: 0, errors: 0 };

  const templateSkillsPath = join(TEMP_DIR, SKILLS_CANONICAL_DIR);
  if (!existsSync(templateSkillsPath)) {
    log.warning(`${SKILLS_CANONICAL_DIR} directory not found in template`);
    return totals;
  }

  const availableSkills = listTemplateSkills(templateSkillsPath);
  if (availableSkills.length === 0) {
    log.warning(`No skill folders found under ${SKILLS_CANONICAL_DIR} in the template`);
    return totals;
  }

  let selectedSkills = availableSkills;

  if (skillsFilter && skillsFilter.length > 0) {
    const unknown = skillsFilter.filter(s => !availableSkills.includes(s));
    if (unknown.length > 0) {
      log.error(`Unknown skill${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);
      log.info(`Available skills: ${availableSkills.join(', ')}`);
      process.exit(1);
    }
    selectedSkills = skillsFilter;
  }

  mkdirSync(SKILLS_CANONICAL_DIR, { recursive: true });

  log.merge(`Syncing ${selectedSkills.length} skill${selectedSkills.length === 1 ? '' : 's'}:`);
  for (const skill of selectedSkills) {
    const srcPath = join(templateSkillsPath, skill);
    const destPath = join(SKILLS_CANONICAL_DIR, skill);

    console.log(`  ${colors.cyan}${skill}${colors.reset}`);
    const result = mergeDirectory(srcPath, destPath, '    ');
    totals.success += result.success;
    totals.errors += result.errors;
  }

  return totals;
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateDocs(): MergeResult {
  log.step('Updating docs/ (merge)...');

  const docsPath = join(TEMP_DIR, 'docs');
  if (!existsSync(docsPath)) {
    log.warning('docs directory not found in template');
    return { success: 0, errors: 0 };
  }

  log.merge('Syncing full directory...');
  return mergeDirectory(docsPath, 'docs');
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateCli(): MergeResult {
  log.step('Updating cli/ (merge)...');

  const cliPath = join(TEMP_DIR, 'cli');
  if (!existsSync(cliPath)) {
    log.warning('cli directory not found in template');
    return { success: 0, errors: 0 };
  }

  log.merge('Syncing CLI tools...');
  return mergeDirectory(cliPath, 'cli');
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateVscode(): MergeResult {
  log.step('Updating .vscode/ (merge)...');

  const vscodePath = join(TEMP_DIR, '.vscode');
  if (!existsSync(vscodePath)) {
    log.warning('.vscode directory not found in template');
    return { success: 0, errors: 0 };
  }

  log.merge('Syncing VS Code configuration...');
  return mergeDirectory(vscodePath, '.vscode');
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateHusky(): MergeResult {
  log.step('Updating .husky/ (merge)...');

  const huskyPath = join(TEMP_DIR, '.husky');
  if (!existsSync(huskyPath)) {
    log.warning('.husky directory not found in template');
    return { success: 0, errors: 0 };
  }

  log.merge('Syncing Git hooks...');
  return mergeDirectory(huskyPath, '.husky');
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateTooling(): MergeResult {
  log.step('Updating tooling config files...');

  let success = 0;
  let errors = 0;

  log.merge('Syncing config files...');
  for (const file of TOOLING_FILES) {
    const srcPath = join(TEMP_DIR, file);
    try {
      if (existsSync(srcPath)) {
        cpSync(srcPath, file);
        log.success(file);
        success++;
      }
      else {
        log.warning(`${file} not found in template`);
      }
    }
    catch (err) {
      log.warning(`Skipped ${file}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateExamples(): MergeResult {
  log.step('Updating example templates...');

  let success = 0;
  let errors = 0;

  log.merge('Syncing example files...');
  for (const file of EXAMPLE_FILES) {
    const srcPath = join(TEMP_DIR, file);
    try {
      if (existsSync(srcPath)) {
        cpSync(srcPath, file);
        log.success(file);
        success++;
      }
      else {
        log.warning(`${file} not found in template`);
      }
    }
    catch (err) {
      log.warning(`Skipped ${file}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateCommands(): MergeResult {
  log.step('Updating .claude/commands/ (merge)...');

  const commandsPath = join(TEMP_DIR, '.claude', 'commands');
  if (!existsSync(commandsPath)) {
    log.warning('.claude/commands directory not found in template');
    return { success: 0, errors: 0 };
  }

  log.merge('Syncing slash commands...');
  return mergeDirectory(commandsPath, join('.claude', 'commands'));
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateScripts(): MergeResult {
  log.step('Updating scripts/ (merge)...');

  const scriptsPath = join(TEMP_DIR, 'scripts');
  if (!existsSync(scriptsPath)) {
    log.warning('scripts directory not found in template');
    return { success: 0, errors: 0 };
  }

  log.merge('Syncing framework scripts...');
  return mergeDirectory(scriptsPath, 'scripts');
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateTemplates(): MergeResult {
  log.step('Updating templates/ (merge)...');

  const templatesPath = join(TEMP_DIR, 'templates');
  if (!existsSync(templatesPath)) {
    log.warning('templates directory not found in template');
    return { success: 0, errors: 0 };
  }

  log.merge('Syncing universal templates...');
  return mergeDirectory(templatesPath, 'templates');
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateAgentsDocs(): MergeResult {
  log.step('Updating .agents/ documentation...');

  let success = 0;
  let errors = 0;

  log.merge('Syncing .agents docs (project.yaml / jira-fields.json / jira-required.yaml are NOT touched)...');
  for (const file of AGENTS_DOCS_FILES) {
    const srcPath = join(TEMP_DIR, file);
    try {
      if (existsSync(srcPath)) {
        mkdirSync(join(file, '..'), { recursive: true });
        cpSync(srcPath, file);
        log.success(file);
        success++;
      }
      else {
        log.warning(`${file} not found in template`);
      }
    }
    catch (err) {
      log.warning(`Skipped ${file}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

// eslint-disable-next-line unused-imports/no-unused-vars
function updateClaudeConfig(): MergeResult {
  log.step('Updating .claude/ config...');

  let success = 0;
  let errors = 0;

  log.merge('Syncing .claude config (settings.local.json is NOT touched)...');
  for (const file of CLAUDE_CONFIG_FILES) {
    const srcPath = join(TEMP_DIR, file);
    try {
      if (existsSync(srcPath)) {
        mkdirSync(join(file, '..'), { recursive: true });
        cpSync(srcPath, file);
        log.success(file);
        success++;
      }
      else {
        log.warning(`${file} not found in template`);
      }
    }
    catch (err) {
      log.warning(`Skipped ${file}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

/**
 * Extract CLI_VERSION from a script's source code.
 */
function extractVersion(content: string): string | null {
  const match = content.match(/const\s+CLI_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

// eslint-disable-next-line unused-imports/no-unused-vars
function selfUpdate(): boolean {
  const currentScriptPath = join(process.cwd(), 'cli', 'update-boilerplate.ts');
  const templateScriptPath = join(TEMP_DIR, 'cli', 'update-boilerplate.ts');

  if (!existsSync(templateScriptPath)) {
    return false;
  }

  const currentContent = existsSync(currentScriptPath)
    ? readFileSync(currentScriptPath, 'utf-8')
    : '';
  const templateContent = readFileSync(templateScriptPath, 'utf-8');

  if (currentContent !== templateContent) {
    const currentVer = extractVersion(currentContent) || 'unknown';
    const templateVer = extractVersion(templateContent) || 'unknown';

    // Detect major version change
    const currentMajor = currentVer.split('.')[0];
    const templateMajor = templateVer.split('.')[0];

    if (currentMajor !== templateMajor && currentMajor !== 'unknown') {
      log.warning(`Major version change detected: v${currentVer} → v${templateVer}`);
      log.info('Review the changelog for breaking changes after this update.');
    }

    log.step(`Auto-updating update-boilerplate.ts (v${currentVer} → v${templateVer})...`);
    mkdirSync('cli', { recursive: true });
    cpSync(templateScriptPath, currentScriptPath);
    log.success(`update-boilerplate.ts updated to v${templateVer}`);
    return true;
  }

  log.dim('update-boilerplate.ts is already up to date');
  return false;
}

function cleanup(): void {
  rmSync(TEMP_DIR, { recursive: true, force: true });
}

// ============================================================================
// INTERACTIVE MENUS
// ============================================================================

// eslint-disable-next-line unused-imports/no-unused-vars
async function showMainMenu(): Promise<string[]> {
  const { checkbox } = await import('@inquirer/prompts');

  return checkbox({
    message: 'What do you want to update? (SPACE to select, ENTER to confirm)',
    choices: [
      { name: 'Everything (all allowed directories)', value: 'all' },
      { name: 'Skills (.claude/skills/)', value: 'skills' },
      { name: 'Slash commands (.claude/commands/)', value: 'commands' },
      { name: 'Framework scripts (scripts/)', value: 'scripts' },
      { name: 'Universal templates (templates/)', value: 'templates' },
      { name: '.agents docs (.agents/README.md only)', value: 'agents-docs' },
      { name: '.claude config (.claude/settings.json)', value: 'claude-config' },
      { name: 'Documentation (docs/)', value: 'docs' },
      { name: 'CLI Tools (cli/)', value: 'cli' },
      { name: 'VS Code Config (.vscode/)', value: 'vscode' },
      { name: 'Git Hooks (.husky/)', value: 'husky' },
      { name: 'Tooling (prettier, editorconfig)', value: 'tooling' },
      { name: 'Example Templates (.mcp.example.json, etc.)', value: 'examples' },
    ],
  });
}

/**
 * Show a checkbox listing the skills discovered in the template.
 * Returns the subset selected by the user (defaults to all).
 */
// eslint-disable-next-line unused-imports/no-unused-vars
async function showSkillsMenu(): Promise<string[]> {
  const { checkbox } = await import('@inquirer/prompts');

  const templateSkillsPath = join(TEMP_DIR, SKILLS_CANONICAL_DIR);
  const available = listTemplateSkills(templateSkillsPath);

  if (available.length === 0) {
    log.warning(`No skills found under ${SKILLS_CANONICAL_DIR} in the template.`);
    return [];
  }

  const selected = await checkbox({
    message: 'Select skills to sync: (SPACE to toggle, ENTER to confirm)',
    choices: available.map(name => ({ name, value: name, checked: true })),
  });

  return selected;
}

// ============================================================================
// HELP
// ============================================================================

function showHelp(): void {
  console.log(`
${colors.bold}${colors.cyan}  Update Boilerplate CLI${colors.reset}
${colors.dim}  Keep your project synced with the KATA template${colors.reset}

${colors.bold}USAGE:${colors.reset}
  bun run update                     ${colors.dim}# Interactive menu${colors.reset}
  bun run update <command> [options] ${colors.dim}# Direct execution${colors.reset}

${colors.bold}COMMANDS:${colors.reset}
  all           Update all allowed directories
  skills        Sync .claude/skills/ (agent skills)
  commands      Sync .claude/commands/ (slash commands)
  scripts       Sync scripts/ (framework scripts: agents-lint, sync-jira-issues, ...)
  templates     Sync templates/ (universal templates: pr-test-automation, ...)
  agents-docs   Sync .agents/README.md only (project.yaml/jira-fields.json untouched)
  claude-config Sync .claude/settings.json (settings.local.json untouched)
  docs          Update docs/ (documentation)
  cli           Update cli/ (CLI tools)
  vscode        Update .vscode/ (IDE configuration)
  husky         Update .husky/ (Git hooks)
  tooling       Update config files (prettier, editorconfig)
  examples      Update example templates (.mcp.example.json, etc.)
  rollback      Restore from the most recent backup
  help          Show this help

${colors.bold}GLOBAL FLAGS:${colors.reset}
  --dry-run     Preview what would change without modifying files
  --rollback    Restore from the most recent backup
  --auto        Non-interactive mode: apply clean-ff + new-upstream, skip diverged, never delete

${colors.bold}FLAGS FOR 'skills':${colors.reset}
  --skill NAME  Sync a specific skill folder (e.g., --skill sprint-testing)
                Accepts a comma-separated list: --skill sprint-testing,test-automation
  --list        List the skills available in the template and exit

${colors.bold}WHAT GETS SYNCED:${colors.reset}
  ${colors.green}  .claude/skills/${colors.reset}        Agent skills (canonical location)
  ${colors.green}  .claude/commands/${colors.reset}      Slash commands (sync-ai-memory, fix-traceability, business-*-map, ...)
  ${colors.green}  .claude/settings.json${colors.reset}  Versioned default permissions (your settings.local.json untouched)
  ${colors.green}  .agents/README.md${colors.reset}      Variable system documentation
  ${colors.green}  scripts/${colors.reset}               Framework scripts (agents-lint, sync-jira-issues, kata-manifest, ...)
  ${colors.green}  templates/${colors.reset}             Universal templates (pr-test-automation, ...)
  ${colors.green}  docs/${colors.reset}                  General documentation
  ${colors.green}  cli/${colors.reset}                   CLI tools (auto-updates)
  ${colors.green}  .vscode/${colors.reset}               IDE configuration
  ${colors.green}  .husky/${colors.reset}                Git hooks
  ${colors.green}  tooling${colors.reset}                editorconfig, prettier
  ${colors.green}  examples${colors.reset}               .mcp.example.json, dbhub.example.toml

${colors.bold}WHAT NEVER GETS SYNCED (project-specific):${colors.reset}
  ${colors.red}  .github/workflows/${colors.reset}        Your CI/CD pipelines
  ${colors.red}  config/${colors.reset}                   Your environment config
  ${colors.red}  tests/${colors.reset}                    Your test components
  ${colors.red}  .agents/project.yaml${colors.reset}      Your project variables
  ${colors.red}  .agents/jira-fields.json${colors.reset}         Auto-generated Jira catalog
  ${colors.red}  .agents/jira-required.yaml${colors.reset} Manifest with project customisations
  ${colors.red}  .claude/settings.local.json${colors.reset} Your personal Claude Code permissions
  ${colors.red}  .mcp.json${colors.reset}                  Your MCP credentials (use .mcp.example.json as a template)
  ${colors.red}  playwright.config${colors.reset}         Your test config
  ${colors.red}  eslint.config.js${colors.reset}          Your linting rules
  ${colors.red}  tsconfig.json${colors.reset}             Your TypeScript config
  ${colors.red}  .env.example${colors.reset}              Your env variables
  ${colors.red}  CLAUDE.md${colors.reset}                 Your AI memory
  ${colors.red}  README.md${colors.reset}                 Your project docs
  ${colors.red}  package.json${colors.reset}              Your dependencies (gaps reported instead)

${colors.bold}INTELLIGENT MERGE:${colors.reset}
  - Updates/adds files from template
  - Preserves your files not in template
  - Never deletes user-created content
  - Creates automatic backup before changes

${colors.bold}EXAMPLES:${colors.reset}
  bun run update                                       ${colors.dim}# Interactive menu${colors.reset}
  bun run update all                                   ${colors.dim}# Update everything${colors.reset}
  bun run update skills                                ${colors.dim}# Sync all skills${colors.reset}
  bun run update skills --skill sprint-testing         ${colors.dim}# Sync one skill${colors.reset}
  bun run update skills --skill sprint-testing,test-automation ${colors.dim}# Sync a subset${colors.reset}
  bun run update skills --list                         ${colors.dim}# List available skills${colors.reset}
  bun run update cli docs                              ${colors.dim}# Multiple components${colors.reset}
  bun run update all --dry-run                         ${colors.dim}# Preview without changes${colors.reset}
  bun run update --rollback                            ${colors.dim}# Restore last backup${colors.reset}
`);
}

// ============================================================================
// VERSION TRACKING
// ============================================================================

const VERSION_FILE = '.boilerplate-version.json';

interface BoilerplateVersion {
  lastSync: string
  templateCommit: string
  cliVersion: string
  syncedComponents: string[]
  variableSystemVersion: number
}

/**
 * Get the HEAD commit hash from the cloned template repo.
 */
function getTemplateCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: TEMP_DIR, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  }
  catch {
    return 'unknown';
  }
}

/**
 * Record sync metadata to .boilerplate-version.json after successful sync.
 */
// eslint-disable-next-line unused-imports/no-unused-vars
function recordSyncVersion(syncedComponents: string[]): void {
  const version: BoilerplateVersion = {
    lastSync: new Date().toISOString(),
    templateCommit: getTemplateCommit(),
    cliVersion: CLI_VERSION,
    syncedComponents,
    variableSystemVersion: 1,
  };

  writeFileSync(VERSION_FILE, `${JSON.stringify(version, null, 2)}\n`);
  log.success(`Version recorded in ${VERSION_FILE}`);
}

/**
 * Read the current .boilerplate-version.json if it exists.
 */
function readSyncVersion(): BoilerplateVersion | null {
  if (!existsSync(VERSION_FILE)) { return null; }
  try {
    return JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
  }
  catch {
    return null;
  }
}

// ============================================================================
// SYNC STATE I/O
// ============================================================================

/**
 * Read .boilerplate-version.json and return a typed SyncState.
 * Returns null when the file is absent (bootstrap path).
 * Throws CorruptStateError when JSON is invalid.
 * Discriminates v6 vs v5 by presence of `perComponentCommit` and `schema === 6`.
 */
function readSyncState(repoRoot: string): SyncState | null {
  const filePath = join(repoRoot, VERSION_FILE);
  if (!existsSync(filePath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  catch {
    throw new CorruptStateError(
      `Corrupt sync state: ${filePath}. Refusing to silently overwrite. Fix or delete the file.`,
    );
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'perComponentCommit' in parsed
    && (parsed as Record<string, unknown>).schema === 6
  ) {
    return parsed as SyncStateV6;
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'templateCommit' in parsed
  ) {
    return parsed as SyncStateV5;
  }

  throw new CorruptStateError(
    `Corrupt sync state: ${filePath}. Refusing to silently overwrite. Fix or delete the file.`,
  );
}

/**
 * Pure function — no I/O.
 * Converts a v5.3 SyncStateV5 to a SyncStateV6 with empty perComponentCommit.
 * templateCommit and variableSystemVersion are preserved from the old state.
 */
function migrateSyncState(old: SyncStateV5): SyncStateV6 {
  return {
    schema: 6,
    templateRepo: TEMPLATE_REPO,
    templateCommit: old.templateCommit,
    perComponentCommit: {},
    lastSyncedAt: new Date().toISOString(),
    cliVersion: CLI_VERSION,
    variableSystemVersion: 1,
  };
}

/**
 * Ask the user for consent before migrating v5.3 → v6.
 * Uses native readline to match the existing prompt style.
 * Returns true on Y/y/Enter; false on N/n.
 * No file writes — I/O is deferred to writeSyncState post-sync.
 */
async function promptForMigration(_old: SyncStateV5): Promise<boolean> {
  const answer = await nativePrompt(
    `${colors.yellow}Detected v5.3 .boilerplate-version.json. Upgrade to v6 (adds perComponentCommit field)? [Y/n]:${colors.reset} `,
  );
  return answer === '' || answer === 'y' || answer === 'yes';
}

/**
 * Atomic write of SyncStateV6 to .boilerplate-version.json.
 * Writes to a .tmp.<pid> sibling first, then renames to final path.
 * Assumes the tmp file and the final path are on the same filesystem (POSIX rename guarantee).
 */
function writeSyncState(repoRoot: string, state: SyncStateV6): void {
  const finalPath = join(repoRoot, VERSION_FILE);
  const tmpPath = `${finalPath}.tmp.${process.pid}`;
  writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  // Node's renameSync is POSIX-atomic on same-FS — no half-written JSON risk
  renameSync(tmpPath, finalPath);
  log.success(`Version recorded in ${VERSION_FILE}`);
}

// ============================================================================
// REPOSITORY ACQUISITION (NEW — partial clone scaffold; legacy cloneTemplate still active)
// ============================================================================

/**
 * Resolve the HEAD commit SHA of the already-cloned template repo.
 * Replaces getTemplateCommit() with explicit repoDir arg.
 */
function resolveTemplateHeadSha(repoDir: string): string {
  try {
    return execSync(`git -C "${repoDir}" rev-parse HEAD`, { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  }
  catch {
    return 'unknown';
  }
}

/**
 * Partial clone of the template repository using sparse-checkout.
 * Replaces legacy cloneTemplate() — NOT yet called from main() in M1.
 * When `allowedPaths` is omitted, defaults to the union of all COMPONENTS paths.
 *
 * Steps:
 *   1. Remove existing dest if present
 *   2. gh auth status (preserved from cloneTemplate)
 *   3. git clone --filter=blob:none --no-checkout
 *   4. git sparse-checkout init --no-cone
 *   5. git sparse-checkout set <patterns>
 *   6. git checkout
 *
 * Exits process with code 3 on clone failure (Scenario 3.2).
 * Used by the auto/CI path in main().
 */
async function partialCloneTemplate(
  repoUrl: string,
  dest: string,
  allowedPaths: string[] = COMPONENTS.flatMap(c => c.paths),
): Promise<void> {
  log.step('Downloading latest version of the template (partial clone)...');
  log.dim(`Repo: ${repoUrl}`);
  log.dim(`Temp destination: ${dest}`);

  if (existsSync(dest)) {
    log.dim('Cleaning previous temp directory...');
    rmSync(dest, { recursive: true, force: true });
  }

  log.dim('Verifying GitHub CLI authentication...');
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    log.success('GitHub CLI authenticated');
  }
  catch {
    log.error('GitHub CLI is not authenticated');
    console.log(`\n${colors.yellow}Run first:${colors.reset}`);
    console.log(`  ${colors.cyan}gh auth login${colors.reset}\n`);
    process.exit(1);
  }

  log.dim('Cloning repository with sparse-checkout (filter=blob:none)...');

  try {
    execSync(
      `gh repo clone ${repoUrl} "${dest}" -- --filter=blob:none --no-checkout --quiet`,
      { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 },
    );
  }
  catch (error) {
    const err = error as { killed?: boolean, message?: string };
    if (err.killed) {
      log.error('Timeout: Clone took too long (>60s)');
    }
    else {
      log.error('Error cloning the template repository');
      log.info('Possible causes: no repo access, network issues, gh CLI misconfigured');
      log.info(`Verify: gh repo view ${repoUrl}`);
    }
    process.exit(3);
  }

  try {
    execSync(`git -C "${dest}" sparse-checkout init --no-cone`, { stdio: ['pipe', 'pipe', 'pipe'] });
    const patterns = allowedPaths.map(p => `"${p}"`).join(' ');
    execSync(`git -C "${dest}" sparse-checkout set ${patterns}`, { stdio: ['pipe', 'pipe', 'pipe'] });
    execSync(`git -C "${dest}" checkout`, { stdio: ['pipe', 'pipe', 'pipe'] });
    log.success('Template downloaded successfully (sparse checkout)');
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`Sparse-checkout setup failed: ${msg}`);
    process.exit(3);
  }
}

// ============================================================================
// FILE CLASSIFICATION
// ============================================================================

/**
 * PURE helper — used ONLY inside classifyFile for whitespace-only divergence
 * detection (Capability 5.2). NEVER applied to file content being written.
 *
 * Normalises:
 *   1. CRLF → LF
 *   2. Trailing horizontal whitespace stripped per line
 *   3. Trailing whitespace on last line without newline
 *   4. Multiple trailing blank lines collapsed to single trailing newline
 */
function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+(?=\n)/g, '')
    .replace(/[ \t]+$/, '')
    .replace(/\n+$/, '\n');
}

/**
 * Classify a single delta entry into a FileClass.
 * Side-effects: reads local filesystem + executes git show (idempotent reads, no mutations).
 *
 * Classification rules (in order):
 *   1. isBinary → 'binary-skip'
 *   2. status D + no local file → 'unchanged'
 *   3. status D + local file exists → 'deleted-upstream'
 *   4. status A + no local file → 'new-upstream'
 *   5. status A + local exists → 'locally-diverged' (template-old treated as empty blob)
 *   6. status M + no local file → 'clean-fastforward' (user deleted locally; ff applies)
 *   7. status M + byte-identical to template-old → 'clean-fastforward'
 *   8. status M + whitespace-only diff → 'clean-fastforward'
 *   9. else → 'locally-diverged'
 */
function classifyFile(
  entry: Omit<DeltaEntry, 'classification'>,
  repoDir: string,
  localRepoRoot: string,
): FileClass {
  if (entry.isBinary) {
    return 'binary-skip';
  }

  const localPath = join(localRepoRoot, entry.path);
  const localExists = existsSync(localPath);

  if (entry.status === 'D') {
    return localExists ? 'deleted-upstream' : 'unchanged';
  }

  if (entry.status === 'A') {
    if (!localExists) {
      return 'new-upstream';
    }
    // Added upstream but also exists locally (added independently) → diverged
    return 'locally-diverged';
  }

  // status === 'M'
  if (!localExists) {
    // User deleted the file locally; fast-forward applies cleanly
    return 'clean-fastforward';
  }

  // Byte-compare local content vs template-old blob
  const localBytes = readFileSync(localPath);

  if (entry.templateOldSha) {
    let templateOldBytes: Buffer;
    try {
      templateOldBytes = execSync(
        `git -C "${repoDir}" show ${entry.templateOldSha}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ) as unknown as Buffer;
    }
    catch {
      // If we cannot retrieve the blob treat it as diverged (safe fallback)
      return 'locally-diverged';
    }

    if (Buffer.compare(localBytes, templateOldBytes) === 0) {
      return 'clean-fastforward';
    }

    // Whitespace-only divergence check
    const localStr = localBytes.toString('utf8');
    const oldStr = templateOldBytes.toString('utf8');
    if (normalizeWhitespace(localStr) === normalizeWhitespace(oldStr)) {
      return 'clean-fastforward';
    }
  }

  return 'locally-diverged';
}

// ============================================================================
// DELTA COMPUTATION
// ============================================================================

/**
 * Compute per-component deltas using stored SHA cursors.
 *
 * For each component with a known perComponentCommit SHA:
 *   - Runs `git log <sha>..HEAD --name-status --no-renames -- <paths>`
 *   - Runs `git diff --numstat <sha>..HEAD -- <paths>` for line counts + binary detection
 *   - Resolves templateOldSha / templateNewSha per entry
 *   - Calls classifyFile() for each entry
 *
 * Components whose SHA equals HEAD → skipped (zero delta).
 * Components with no SHA entry → pushed to `bootstrap` list.
 *
 * Returns: flat DeltaEntry[] (classified) + bootstrap Component[] list.
 */
function computeDelta(
  repoDir: string,
  components: readonly Component[],
  state: SyncStateV6,
): { delta: DeltaEntry[], bootstrap: Component[] } {
  const delta: DeltaEntry[] = [];
  const bootstrap: Component[] = [];

  // Get current HEAD SHA of the template clone
  let headSha: string;
  try {
    headSha = execSync(`git -C "${repoDir}" rev-parse HEAD`, { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  }
  catch {
    log.error('Could not resolve HEAD SHA of template clone');
    return { delta, bootstrap };
  }

  for (const component of components) {
    const componentSha = state.perComponentCommit[component.name];

    if (!componentSha) {
      // No SHA recorded → needs bootstrap
      bootstrap.push(component);
      continue;
    }

    if (componentSha === headSha) {
      // Already at HEAD for this component
      continue;
    }

    // Build path args for git commands
    const pathArgs = component.paths.map(p => `"${p}"`).join(' ');

    // --- name-status (with --no-renames to demote R → D+A) ---
    let nameStatusOutput: string;
    try {
      nameStatusOutput = execSync(
        `git -C "${repoDir}" log ${componentSha}..HEAD --name-status --no-renames --diff-filter=ADM -- ${pathArgs}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch {
      log.warning(`Could not compute delta for component '${component.name}'. Skipping.`);
      continue;
    }

    // --- numstat (for line counts + binary detection) ---
    let numstatOutput: string;
    try {
      numstatOutput = execSync(
        `git -C "${repoDir}" diff --numstat ${componentSha}..HEAD -- ${pathArgs}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch {
      numstatOutput = '';
    }

    // Build numstat lookup: path → { addLines, delLines, isBinary }
    const numstatMap = new Map<string, { addLines: number, delLines: number, isBinary: boolean }>();
    for (const line of numstatOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      // Binary: "-\t-\t<path>"
      const binaryMatch = /^-\t-\t(.+)$/.exec(trimmed);
      if (binaryMatch) {
        numstatMap.set(binaryMatch[1], { addLines: 0, delLines: 0, isBinary: true });
        continue;
      }
      const numMatch = /^(\d+)\t(\d+)\t(.+)$/.exec(trimmed);
      if (numMatch) {
        numstatMap.set(numMatch[3], {
          addLines: Number.parseInt(numMatch[1], 10),
          delLines: Number.parseInt(numMatch[2], 10),
          isBinary: false,
        });
      }
    }

    // Parse name-status output — each file appears as e.g. "M\tpath/to/file"
    // We collect unique paths (git log --name-status may repeat files across commits)
    const seenPaths = new Set<string>();
    const fileStatuses = new Map<string, ChangeStatus>();

    for (const line of nameStatusOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      const match = /^([MAD])\t(.+)$/.exec(trimmed);
      if (!match) { continue; }
      const status = match[1] as ChangeStatus;
      const filePath = match[2];
      // For the same path appearing multiple times across commits, the latest
      // status in git log order (most recent first) wins. We stop at first occurrence.
      if (!seenPaths.has(filePath)) {
        seenPaths.add(filePath);
        fileStatuses.set(filePath, status);
      }
    }

    for (const [filePath, status] of fileStatuses) {
      const numstat = numstatMap.get(filePath) ?? { addLines: 0, delLines: 0, isBinary: false };

      // Resolve templateOldSha (blob at componentSha)
      let templateOldSha: string | null = null;
      if (status !== 'A') {
        try {
          const lsOld = execSync(
            `git -C "${repoDir}" ls-tree ${componentSha} -- "${filePath}"`,
            { stdio: ['pipe', 'pipe', 'pipe'] },
          ).toString().trim();
          // ls-tree output: "<mode> blob <sha>\t<path>"
          const blobMatch = /\bblob\s+([0-9a-f]{40})\b/.exec(lsOld);
          templateOldSha = blobMatch ? blobMatch[1] : null;
        }
        catch {
          templateOldSha = null;
        }
      }

      // Resolve templateNewSha (blob at HEAD)
      let templateNewSha: string | null = null;
      if (status !== 'D') {
        try {
          const lsNew = execSync(
            `git -C "${repoDir}" ls-tree HEAD -- "${filePath}"`,
            { stdio: ['pipe', 'pipe', 'pipe'] },
          ).toString().trim();
          const blobMatch = /\bblob\s+([0-9a-f]{40})\b/.exec(lsNew);
          templateNewSha = blobMatch ? blobMatch[1] : null;
        }
        catch {
          templateNewSha = null;
        }
      }

      const partial: Omit<DeltaEntry, 'classification'> = {
        component: component.name,
        path: filePath,
        status,
        addLines: numstat.addLines,
        delLines: numstat.delLines,
        isBinary: numstat.isBinary,
        templateOldSha,
        templateNewSha,
      };

      const classification = classifyFile(partial, repoDir, process.cwd());

      delta.push({ ...partial, classification });
    }
  }

  return { delta, bootstrap };
}

// ============================================================================
// APPLIER (per-file writes with pre-write backup)
// ============================================================================

/**
 * Append a RESTORE.txt manifest to the backup directory.
 * Records timestamp, SHAs, and one line per entry with status/classification/resolution/path.
 * Includes the prior .boilerplate-version.json as base64 for full rollback.
 */
function appendBackupManifest(backupDir: string, entries: DeltaEntry[], state: SyncStateV6): void {
  const lines: string[] = [
    '# update-boilerplate rollback manifest',
    `timestamp: ${new Date().toISOString()}`,
    `priorTemplateCommit: ${state.templateCommit || 'none'}`,
    `newTemplateCommit: ${state.templateCommit}`,
    `cliVersion: ${CLI_VERSION}`,
    '',
    '# entries: <status> <classification> <resolution> <path>',
  ];

  for (const entry of entries) {
    lines.push(`${entry.status} ${entry.classification} applied ${entry.path}`);
  }

  // Encode prior state JSON as base64 for rollback
  const priorJson = JSON.stringify(state, null, 2);
  const priorBase64 = Buffer.from(priorJson).toString('base64');
  lines.push('');
  lines.push(`PRIOR_STATE_JSON_BASE64:${priorBase64}`);

  writeFileSync(join(backupDir, 'RESTORE.txt'), `${lines.join('\n')}\n`);
}

/**
 * Apply a single resolution to a delta entry.
 * ALWAYS backs up the existing local file before any write/delete.
 *
 * Resolutions:
 *   - 'theirs': write template-new blob bytes to local path
 *   - 'mine':   no-op (local file already preserved)
 *   - 'skip':   no-op
 *   - 'delete': rmSync local file (after backup)
 *   - 'keep':   no-op (deleted-upstream file kept)
 */
async function applyResolution(
  entry: DeltaEntry,
  resolution: Resolution,
  repoDir: string,
  localRepoRoot: string,
  backupDir: string,
): Promise<void> {
  const localPath = join(localRepoRoot, entry.path);

  // 1. Pre-write backup for destructive resolutions
  if ((resolution === 'theirs' || resolution === 'delete') && existsSync(localPath)) {
    const backupPath = join(backupDir, entry.path);
    mkdirSync(join(backupPath, '..'), { recursive: true });
    cpSync(localPath, backupPath);
  }

  try {
    switch (resolution) {
      case 'theirs': {
        if (!entry.templateNewSha) {
          throw new Error(`No templateNewSha for ${entry.path} — cannot apply 'theirs'`);
        }
        const templateBytes = execSync(
          `git -C "${repoDir}" show ${entry.templateNewSha}`,
          { stdio: ['pipe', 'pipe', 'pipe'] },
        );
        mkdirSync(join(localPath, '..'), { recursive: true });
        writeFileSync(localPath, templateBytes);
        log.success(`Applied: ${entry.path}`);
        break;
      }
      case 'mine':
        log.dim(`Kept (mine): ${entry.path}`);
        break;
      case 'skip':
        log.dim(`Skipped: ${entry.path}`);
        break;
      case 'delete':
        rmSync(localPath, { force: true });
        log.success(`Deleted: ${entry.path}`);
        break;
      case 'keep':
        log.dim(`Kept (deleted-upstream, kept locally): ${entry.path}`);
        break;
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`applyResolution failed for ${entry.path} (${resolution}): ${msg}`);
  }
}

// ============================================================================
// BOOTSTRAP PATH (Capability 9)
// ============================================================================

/**
 * Performs a one-time bulk sync for components that have no prior SHA history.
 *
 * Called when:
 *   a) `.boilerplate-version.json` is absent (first-ever run — Scenario 9.1), or
 *   b) `perComponentCommit[component]` is missing/empty for a given component
 *      while v6 state exists for others (Scenario 9.2 — partial bootstrap).
 *
 * SUBSET INVARIANT: when `components` is a strict subset of ALL_COMPONENTS
 * (e.g. `bun run update skills`), only the provided components are bootstrapped.
 * Components not in `components` are left entirely untouched — their
 * `perComponentCommit` entries are not written by this function.
 *
 * Backup contract: every file written is backed up via applyResolution BEFORE
 * the write occurs (Capability 12.1). The same applyResolution pipeline as the
 * incremental sync path is used, so --rollback works identically for bootstrap runs.
 *
 * @param repoDir     Absolute path to the partial-clone temp directory.
 * @param components  Components to bootstrap (may be a subset of COMPONENTS).
 * @param localRepoRoot  Absolute path to the consumer repo root (process.cwd()).
 * @param backupDir   Timestamped backup directory created by the caller.
 * @param dryRun      When true, log what would be copied without writing anything.
 * @returns           RunSummary with applied/skipped/failed + bootstrapped component names.
 */
async function runBootstrapForComponents(
  repoDir: string,
  components: Component[],
  localRepoRoot: string,
  backupDir: string,
  dryRun: boolean,
): Promise<{ summary: RunSummary, bootstrapped: string[] }> {
  const applied: AppliedFile[] = [];
  const skipped: AppliedFile[] = [];
  const failed: FailedFile[] = [];
  const bootstrapped: string[] = [];

  for (const component of components) {
    log.warning(
      `⚠  BOOTSTRAP for component "${component.name}": no SHA history.\n`
      + '   Bulk-syncing all files. Local edits may be overwritten this once.\n'
      + '   Run `git diff HEAD` after to review changes.',
    );

    const componentPaths = component.kind === 'file-list'
      ? (component.files ?? [])
      : component.paths;

    // Collect all files from the template for this component
    const filesToSync: string[] = [];

    for (const componentPath of componentPaths) {
      const srcPath = join(repoDir, componentPath);
      if (!existsSync(srcPath)) {
        log.warning(`Bootstrap: path "${componentPath}" not found in template — skipping.`);
        continue;
      }

      const stat = statSync(srcPath);
      if (stat.isDirectory()) {
        // Walk directory recursively
        const walkDir = (dir: string): void => {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              walkDir(fullPath);
            }
            else {
              // Convert absolute path to repo-relative POSIX path
              const relPath = fullPath.slice(repoDir.length + 1).replace(/\\/g, '/');
              filesToSync.push(relPath);
            }
          }
        };
        walkDir(srcPath);
      }
      else {
        filesToSync.push(componentPath);
      }
    }

    if (filesToSync.length === 0) {
      log.info(`Bootstrap: no files found for component "${component.name}" — skipping.`);
      continue;
    }

    let componentFailed = false;

    for (const relPath of filesToSync) {
      // Resolve the blob SHA from the template HEAD for this file
      let templateNewSha: string | null = null;
      try {
        const lsOutput = execSync(
          `git -C "${repoDir}" ls-tree HEAD -- "${relPath}"`,
          { stdio: ['pipe', 'pipe', 'pipe'] },
        ).toString().trim();
        if (lsOutput) {
          // Format: <mode> blob <sha>\t<path>
          const parts = lsOutput.split(/\s+/);
          templateNewSha = parts[2] ?? null;
        }
      }
      catch {
        // If ls-tree fails, we still attempt the copy below
      }

      // Build a synthetic DeltaEntry for this bootstrap file
      const syntheticEntry: DeltaEntry = {
        component: component.name,
        path: relPath,
        status: 'A',
        classification: 'new-upstream',
        addLines: 0,
        delLines: 0,
        isBinary: false,
        templateOldSha: null,
        templateNewSha,
      };

      if (dryRun) {
        log.dim(`[dry-run bootstrap] would sync: ${relPath}`);
        skipped.push({ entry: syntheticEntry, resolution: 'theirs' });
        continue;
      }

      try {
        await applyResolution(syntheticEntry, 'theirs', repoDir, localRepoRoot, backupDir);
        applied.push({ entry: syntheticEntry, resolution: 'theirs' });
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Bootstrap failed to sync ${relPath}: ${msg}`);
        failed.push({ entry: syntheticEntry, resolution: 'theirs', error: msg });
        componentFailed = true;
      }
    }

    if (!componentFailed && !dryRun) {
      bootstrapped.push(component.name);
    }
  }

  const summary: RunSummary = {
    applied,
    skipped,
    failed,
    binarySkipped: [],
    bootstrapComponents: bootstrapped,
    newHeadSha: '',
  };

  return { summary, bootstrapped };
}

// ============================================================================
// AUTO / CI MODE
// ============================================================================

/**
 * Returns true if the CLI should run in non-interactive (auto/CI) mode.
 * Checks: --auto flag, CI env var, or stdin is not a TTY.
 */
function isNonInteractive(args: ParsedArgs): boolean {
  if (args.auto) { return true; }
  const ci = process.env.CI;
  if (ci === 'true' || ci === 'TRUE' || ci === '1') { return true; }
  if (!process.stdin.isTTY) { return true; }
  return false;
}

/**
 * Build the auto-mode apply plan from a set of delta entries.
 *
 * Rules (Capability 8.1, 14.1):
 *   - clean-fastforward → { resolution: 'theirs' }
 *   - new-upstream      → { resolution: 'theirs' }
 *   - locally-diverged  → { resolution: 'skip' }  (not a CI error — OQ #4)
 *   - deleted-upstream  → deferred (NEVER delete in auto)
 *   - binary-skip       → { resolution: 'skip' }
 *   - unchanged         → excluded (should not be in visible entries)
 */
function planAuto(entries: DeltaEntry[]): { plan: AppliedFile[], deferred: DeltaEntry[] } {
  const plan: AppliedFile[] = [];
  const deferred: DeltaEntry[] = [];

  for (const entry of entries) {
    switch (entry.classification) {
      case 'clean-fastforward':
      case 'new-upstream':
        plan.push({ entry, resolution: 'theirs' });
        break;
      case 'locally-diverged':
        plan.push({ entry, resolution: 'skip' });
        break;
      case 'deleted-upstream':
        deferred.push(entry);
        break;
      case 'binary-skip':
        plan.push({ entry, resolution: 'skip' });
        break;
      case 'unchanged':
        // Should not appear here — filtered upstream
        break;
    }
  }

  return { plan, deferred };
}

/**
 * Execute the auto-mode pipeline: apply plan, print summary table.
 * Exits 0 always (diverged skips are not CI errors per OQ #4).
 */
async function runAuto(
  entries: DeltaEntry[],
  templateDir: string,
  localRepoRoot: string,
  backupDir: string,
  dryRun: boolean,
): Promise<RunSummary> {
  const { plan, deferred } = planAuto(entries);

  const applied: AppliedFile[] = [];
  const skipped: AppliedFile[] = [];
  const failed: FailedFile[] = [];

  for (const item of plan) {
    if (item.resolution === 'skip') {
      log.info(`[skipped] locally diverged: ${item.entry.path}`);
      skipped.push(item);
      continue;
    }

    if (dryRun) {
      log.dim(`[dry-run] would apply: ${item.entry.path}`);
      applied.push(item);
      continue;
    }

    try {
      await applyResolution(item.entry, item.resolution, templateDir, localRepoRoot, backupDir);
      applied.push(item);
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to apply ${item.entry.path}: ${msg}`);
      failed.push({ entry: item.entry, resolution: item.resolution, error: msg });
    }
  }

  for (const entry of deferred) {
    log.info(`[kept] upstream deleted (additive auto): ${entry.path}`);
  }

  // Print summary table
  const appliedCount = applied.length;
  const skippedCount = skipped.length;
  const keptDeletedCount = deferred.length;
  const failedCount = failed.length;

  console.log('');
  console.log(`${colors.bold}${colors.cyan}  Sync Summary${colors.reset}`);
  console.log(`${colors.dim}  ┌───────────────┬───────┐${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${colors.bold}Status        ${colors.reset}${colors.dim}│${colors.reset} ${colors.bold}Count${colors.reset}${colors.dim} │${colors.reset}`);
  console.log(`${colors.dim}  ├───────────────┼───────┤${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${colors.green}Applied       ${colors.reset}${colors.dim}│${colors.reset}   ${String(appliedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${colors.yellow}Skipped       ${colors.reset}${colors.dim}│${colors.reset}   ${String(skippedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${colors.dim}Kept-deleted  ${colors.reset}${colors.dim}│${colors.reset}   ${String(keptDeletedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${failedCount > 0 ? colors.red : colors.dim}Failed        ${colors.reset}${colors.dim}│${colors.reset}   ${String(failedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  └───────────────┴───────┘${colors.reset}`);
  console.log('');

  if (deferred.length > 0) {
    log.info('Deletion-pending (requires interactive confirmation):');
    for (const entry of deferred) {
      log.dim(`  ${entry.path}`);
    }
    console.log('');
  }

  return {
    applied,
    skipped,
    failed,
    binarySkipped: entries.filter(e => e.classification === 'binary-skip'),
    bootstrapComponents: [],
    newHeadSha: '', // filled in by caller
  };
}

// ============================================================================
// DIFF RENDERING (Capability 7)
// ============================================================================

/**
 * Render a colorized unified diff of upstream changes: template-old → template-new.
 * Uses `git diff <oldSha> <newSha>` inside the template clone.
 * For status=A (no old blob), uses the empty-tree SHA as the old side.
 */
function renderTemplateDiff(entry: DeltaEntry, repoDir: string): string {
  const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const oldRef = entry.templateOldSha || EMPTY_TREE;
  const newRef = entry.templateNewSha || EMPTY_TREE;

  try {
    return execSync(
      `git -C "${repoDir}" diff --color=always ${oldRef} ${newRef}`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString();
  }
  catch {
    return `(could not render template diff for ${entry.path})\n`;
  }
}

/**
 * Render a colorized unified diff of local changes: template-old → local-current.
 * Writes the template-old blob to a tmp file, then uses `git diff --no-index`.
 * ALWAYS cleans up the tmp file in a finally block (Design Risk #1).
 */
function renderLocalDiff(entry: DeltaEntry, repoDir: string, localRepoRoot: string): string {
  const localPath = join(localRepoRoot, entry.path);

  if (!existsSync(localPath)) {
    return `(local file does not exist: ${entry.path})\n`;
  }

  if (!entry.templateOldSha) {
    // No old blob (e.g. A status with local collision) — diff empty → local
    return `(no template-old blob available for ${entry.path})\n`;
  }

  const tmpPath = join(tmpdir(), `kata-diff-old-${process.pid}-${Date.now()}`);

  try {
    // Write template-old blob to tmp file
    const blobBytes = execSync(
      `git -C "${repoDir}" show ${entry.templateOldSha}`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    writeFileSync(tmpPath, blobBytes);

    try {
      return execSync(
        `git diff --no-index --color=always "${tmpPath}" "${localPath}"`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch (diffErr) {
      // git diff --no-index exits non-zero when files differ — that's expected
      // Extract stdout from the error object
      const err = diffErr as { stdout?: Buffer | string };
      if (err.stdout) {
        return err.stdout.toString();
      }
      return `(could not render local diff for ${entry.path})\n`;
    }
  }
  catch {
    return `(could not retrieve template-old blob for ${entry.path})\n`;
  }
  finally {
    // Always clean up tmp file regardless of success or failure
    try {
      rmSync(tmpPath, { force: true });
    }
    catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Print both diffs side-by-side with clear section headers.
 * Used before the per-file resolution prompt.
 */
function printPairedDiffs(entry: DeltaEntry, repoDir: string, localRepoRoot: string): void {
  console.log('');
  console.log(`${colors.bold}${colors.cyan}=== Upstream changes (template-old → template-new) ===${colors.reset}`);
  const templateDiff = renderTemplateDiff(entry, repoDir);
  if (templateDiff.trim()) {
    console.log(templateDiff);
  }
  else {
    console.log(`${colors.dim}  (no diff output)${colors.reset}`);
  }

  console.log(`${colors.bold}${colors.cyan}=== Your local changes (template-old → local-current) ===${colors.reset}`);
  const localDiff = renderLocalDiff(entry, repoDir, localRepoRoot);
  if (localDiff.trim()) {
    console.log(localDiff);
  }
  else {
    console.log(`${colors.dim}  (no diff output — files may be identical)${colors.reset}`);
  }
  console.log('');
}

// ============================================================================
// INTERACTIVE SELECTION UI (Capability 6)
// ============================================================================

/**
 * Present a flat checkbox menu for user selection of changed files.
 *
 * Row format: `[M] path/to/file.ts  +12/-3` or `[M!] path/to/file.ts  +12/-3` for diverged.
 * [D] rows default to unchecked per Capability 6.1.
 * All rows default to unchecked per Capability 6.1.
 * Group separators (single line) are inserted between components for visual segmentation.
 *
 * Returns the array of checked DeltaEntry objects (Capability 6.2).
 */
async function selectFilesInteractive(entries: DeltaEntry[]): Promise<DeltaEntry[]> {
  const { checkbox, Separator } = await import('@inquirer/prompts');

  // Filter: exclude unchanged and binary-skip (binary-skip warned separately upstream)
  const visible = entries.filter(
    e => e.classification !== 'unchanged' && e.classification !== 'binary-skip',
  );

  if (visible.length === 0) {
    log.info('Nothing to update.');
    return [];
  }

  // Build choices with component group separators
  interface CheckboxChoice { name: string, value: DeltaEntry, checked: boolean }
  const choices: (CheckboxChoice | InstanceType<typeof Separator>)[] = [];

  let lastComponent = '';
  for (const entry of visible) {
    if (entry.component !== lastComponent) {
      if (lastComponent !== '') {
        choices.push(new Separator());
      }
      choices.push(new Separator(`── ${entry.component} ──`));
      lastComponent = entry.component;
    }

    const badge = entry.classification === 'locally-diverged' ? `${entry.status}!` : entry.status;
    const stats = `  +${entry.addLines}/-${entry.delLines}`;
    const label = `[${badge}] ${entry.path}${stats}`;

    choices.push({
      name: label,
      value: entry,
      // D rows default unchecked; all others also default unchecked per spec
      checked: false,
    });
  }

  const selected = await checkbox<DeltaEntry>({
    message: 'Select files to sync: (SPACE to toggle, ENTER to confirm)',
    choices,
  });

  return selected;
}

// ============================================================================
// PER-FILE RESOLUTION (Capability 7, 14)
// ============================================================================

/**
 * Show paired diffs and prompt the user for a resolution on a locally-diverged file.
 * Prompt: `[t]heirs / [m]ine / [s]kip (default: skip): `
 * Default is skip (per Capability 7.3).
 * Re-prompts on invalid input.
 */
async function resolveDivergedFile(
  entry: DeltaEntry,
  repoDir: string,
  localRepoRoot: string,
): Promise<Resolution> {
  printPairedDiffs(entry, repoDir, localRepoRoot);

  while (true) {
    const answer = await nativePrompt(
      `${colors.bold}${colors.cyan}[t]heirs / [m]ine / [s]kip${colors.reset} (default: skip): `,
    );

    if (answer === '' || answer === 's' || answer === 'skip') {
      return 'skip';
    }
    if (answer === 't' || answer === 'theirs') {
      return 'theirs';
    }
    if (answer === 'm' || answer === 'mine') {
      return 'mine';
    }

    log.warning(`Invalid input '${answer}'. Enter t (theirs), m (mine), or s (skip).`);
  }
}

/**
 * Prompt for explicit deletion confirmation on a deleted-upstream file.
 * Prompt: `Delete <path> locally? [y/N]: ` with default N.
 * Returns 'delete' on y/Y; 'keep' on N/n/Enter.
 */
async function confirmDeletion(entry: DeltaEntry): Promise<Resolution> {
  const answer = await nativePrompt(
    `${colors.yellow}Delete ${entry.path} locally?${colors.reset} [y/N]: `,
  );

  if (answer === 'y' || answer === 'yes') {
    return 'delete';
  }
  return 'keep';
}

// ============================================================================
// INTERACTIVE PLAN (Capability 6, 7, 14)
// ============================================================================

/**
 * Orchestrate the full interactive per-file pipeline.
 *
 * Steps:
 *   1. selectFilesInteractive → user picks files
 *   2. For each selected entry:
 *      - clean-fastforward / new-upstream → resolution: 'theirs'
 *      - locally-diverged → resolveDivergedFile()
 *      - deleted-upstream → confirmDeletion()
 *   3. Unchecked entries → push to summary.skipped
 *
 * Returns RunSummary (partial — newHeadSha filled in by caller).
 */
async function planInteractive(
  entries: DeltaEntry[],
  repoDir: string,
  localRepoRoot: string,
  dryRun: boolean,
): Promise<{ plan: AppliedFile[], skipped: AppliedFile[] }> {
  const selected = await selectFilesInteractive(entries);

  const selectedPaths = new Set(selected.map(e => e.path));

  const plan: AppliedFile[] = [];
  const skipped: AppliedFile[] = [];

  // Unchecked entries are skipped
  for (const entry of entries.filter(
    e => e.classification !== 'unchanged' && e.classification !== 'binary-skip',
  )) {
    if (!selectedPaths.has(entry.path)) {
      skipped.push({ entry, resolution: 'skip' });
    }
  }

  // For each selected entry, determine resolution
  for (const entry of selected) {
    if (entry.classification === 'clean-fastforward' || entry.classification === 'new-upstream') {
      plan.push({ entry, resolution: 'theirs' });
    }
    else if (entry.classification === 'locally-diverged') {
      if (dryRun) {
        // In dry-run, still prompt so user sees the menu — but resolution is advisory only
        log.dim(`[dry-run] diverged file selected: ${entry.path} — prompting for preview...`);
        const resolution = await resolveDivergedFile(entry, repoDir, localRepoRoot);
        log.dim(`[dry-run] would resolve as: ${resolution}`);
        plan.push({ entry, resolution });
      }
      else {
        const resolution = await resolveDivergedFile(entry, repoDir, localRepoRoot);
        if (resolution === 'skip') {
          skipped.push({ entry, resolution });
        }
        else {
          plan.push({ entry, resolution });
        }
      }
    }
    else if (entry.classification === 'deleted-upstream') {
      if (dryRun) {
        log.dim(`[dry-run] deleted-upstream selected: ${entry.path} — would prompt for deletion confirm`);
        plan.push({ entry, resolution: 'delete' });
      }
      else {
        const resolution = await confirmDeletion(entry);
        if (resolution === 'keep') {
          skipped.push({ entry, resolution: 'keep' });
        }
        else {
          plan.push({ entry, resolution: 'delete' });
        }
      }
    }
  }

  return { plan, skipped };
}

// ============================================================================
// SYNC-STATE WRITEBACK
// ============================================================================

/**
 * Suggest a semantic commit message post-sync (Capability 13.1).
 * Printed as advisory — never auto-committed.
 */
function suggestCommitMessage(summary: RunSummary): string {
  return `chore(boilerplate): sync to ${summary.newHeadSha.slice(0, 7)}`;
}

/**
 * PURE function — advances perComponentCommit SHAs based on the run summary.
 *
 * Rules (Capability 11.1/11.2, ADR-5):
 *   - For each component that appeared in the delta:
 *     - If ANY entry in summary.skipped or summary.failed belongs to that component
 *       → keep prior perComponentCommit[component] (SHA holds)
 *     - Else → advance to newHeadSha
 *   - For each component in summary.bootstrapComponents → advance to newHeadSha
 *   - Components untouched this run → prior value preserved
 *   - Top-level templateCommit advances to newHeadSha ONLY if ALL components advanced
 */
function advanceSyncState(
  prior: SyncStateV6,
  summary: RunSummary,
  components: readonly Component[],
  newHeadSha: string,
): SyncStateV6 {
  const next: SyncStateV6 = {
    ...prior,
    lastSyncedAt: new Date().toISOString(),
    cliVersion: CLI_VERSION,
    perComponentCommit: { ...prior.perComponentCommit },
  };

  // Build set of component names that appeared in this run's delta
  const allDeltaEntries = [
    ...summary.applied.map(a => a.entry),
    ...summary.skipped.map(s => s.entry),
    ...summary.failed.map(f => f.entry),
  ];

  const deltaCoveredComponents = new Set(allDeltaEntries.map(e => e.component));

  // Build set of components that had failures or skips (per-component SHA stays)
  const blockedComponents = new Set<string>();
  for (const item of summary.skipped) {
    blockedComponents.add(item.entry.component);
  }
  for (const item of summary.failed) {
    blockedComponents.add(item.entry.component);
  }

  // Advance or hold per component
  for (const component of components) {
    if (!deltaCoveredComponents.has(component.name)) {
      // Not in delta this run — preserve prior SHA unchanged
      continue;
    }

    if (blockedComponents.has(component.name)) {
      // Has skips or failures — hold SHA
      next.perComponentCommit[component.name] = prior.perComponentCommit[component.name] ?? '';
    }
    else {
      next.perComponentCommit[component.name] = newHeadSha;
    }
  }

  // Bootstrap components always advance
  for (const name of summary.bootstrapComponents) {
    next.perComponentCommit[name] = newHeadSha;
  }

  // Top-level templateCommit advances only if every component advanced
  const allAdvanced = components.every(
    c => next.perComponentCommit[c.name] === newHeadSha,
  );
  next.templateCommit = allAdvanced ? newHeadSha : prior.templateCommit;

  return next;
}

// ============================================================================
// VARIABLE DETECTION
// ============================================================================

/**
 * Recursively collect all file paths in a directory
 */
function collectFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) { return files; }

  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...collectFiles(fullPath));
    }
    else {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Scan synced files for {{VARIABLE}} placeholders and check against CLAUDE.md.
 * Warns the user about unfilled variables that need configuration.
 */
function detectUnfilledVariables(): void {
  const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) {
    return; // No CLAUDE.md — migration notice (Fix 4) handles this
  }

  const claudeContent = readFileSync(claudeMdPath, 'utf-8');

  // Check if CLAUDE.md has the Project Variables section
  if (!claudeContent.includes('## Project Variables')) {
    return; // Pre-variables consumer — migration notice handles this
  }

  // Extract variable definitions from the table by parsing lines
  const definedVars = new Map<string, string>(); // varName -> value
  const varLineRegex = /`\{\{([A-Z][A-Z_]+)\}\}`/;

  for (const line of claudeContent.split('\n')) {
    const varMatch = varLineRegex.exec(line);
    if (!varMatch) { continue; }

    // Split the table row by | and grab the value column (3rd cell)
    const cells = line.split('|').map(c => c.trim());
    if (cells.length >= 4) {
      definedVars.set(varMatch[1], cells[3]);
    }
  }

  if (definedVars.size === 0) {
    return; // Table exists but no variables found
  }

  // Scan synced directories for {{VARIABLE}} usage
  const VARIABLE_REGEX = /\{\{([A-Z][A-Z_]+)\}\}/g;
  const syncedDirs = ['.claude/skills', 'docs'];
  const varUsage = new Map<string, number>(); // varName -> file count

  for (const dir of syncedDirs) {
    const files = collectFiles(dir);
    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.ts') && !file.endsWith('.json')) { continue; }

      try {
        const content = readFileSync(file, 'utf-8');
        const varsInFile = new Set<string>();

        for (const varMatch of content.matchAll(VARIABLE_REGEX)) {
          varsInFile.add(varMatch[1]);
        }

        for (const varName of varsInFile) {
          varUsage.set(varName, (varUsage.get(varName) || 0) + 1);
        }
      }
      catch {
        // Skip unreadable files
      }
    }
  }

  if (varUsage.size === 0) {
    return; // No variables found in synced files
  }

  // Determine which variables are still placeholder values
  const PLACEHOLDER_PATTERNS = ['[', 'example', 'myproject', 'localhost', 'company.atlassian'];
  const unfilled: { name: string, files: number }[] = [];
  const filled: { name: string, files: number }[] = [];

  for (const [varName, fileCount] of varUsage) {
    const value = definedVars.get(varName) || '';
    const isPlaceholder = !value
      || PLACEHOLDER_PATTERNS.some(p => value.toLowerCase().includes(p));

    if (isPlaceholder) {
      unfilled.push({ name: varName, files: fileCount });
    }
    else {
      filled.push({ name: varName, files: fileCount });
    }
  }

  if (unfilled.length === 0) {
    return; // All variables are configured
  }

  // Print warning
  console.log('');
  log.warning('Variables need configuration in CLAUDE.md:\n');

  const maxNameLen = Math.max(...[...unfilled, ...filled].map(v => v.name.length + 4)); // +4 for {{ }}
  const header = `   ${'Variable'.padEnd(maxNameLen + 2)}${'Used in'.padEnd(12)}Status`;
  console.log(`${colors.dim}${header}${colors.reset}`);
  console.log(`${colors.dim}   ${'─'.repeat(maxNameLen + 2 + 12 + 15)}${colors.reset}`);

  for (const v of unfilled) {
    const varStr = `{{${v.name}}}`.padEnd(maxNameLen + 2);
    const filesStr = `${v.files} file${v.files > 1 ? 's' : ''}`.padEnd(12);
    console.log(`   ${colors.yellow}${varStr}${colors.reset}${filesStr}${colors.yellow}⚠ Still placeholder${colors.reset}`);
  }
  for (const v of filled) {
    const varStr = `{{${v.name}}}`.padEnd(maxNameLen + 2);
    const filesStr = `${v.files} file${v.files > 1 ? 's' : ''}`.padEnd(12);
    console.log(`   ${colors.green}${varStr}${colors.reset}${filesStr}${colors.green}✓ Configured${colors.reset}`);
  }

  console.log('');
  log.info('Open CLAUDE.md and fill the Project Variables table.');
  log.info('Skills auto-load their own operational detail; invoke any skill by its trigger (e.g., `/project-discovery`).');
}

// ============================================================================
// PACKAGE.JSON GAP DETECTION
// ============================================================================

/**
 * After a successful sync, detect framework scripts and dependencies that
 * exist in the template `package.json` but are missing from the consumer's.
 *
 * Strategy:
 *   - Scripts: any template script whose command references a file in scripts/
 *     or cli/ that ALSO exists in the template (so it's framework infrastructure
 *     and not a project-specific helper). If the consumer doesn't define a
 *     script with that exact name, report it.
 *   - Dependencies: any entry in template `dependencies` that the consumer
 *     does not have in either `dependencies` or `devDependencies`.
 *     `devDependencies` are intentionally NOT compared because they belong to
 *     the consumer's toolchain choice.
 *
 * `package.json` itself is never overwritten — the user copies the missing
 * lines manually after reviewing them.
 */
function detectMissingFrameworkScripts(): void {
  const consumerPath = join(process.cwd(), 'package.json');
  const templatePath = join(TEMP_DIR, 'package.json');

  if (!existsSync(consumerPath) || !existsSync(templatePath)) {
    return;
  }

  let consumer: { scripts?: Record<string, string>, dependencies?: Record<string, string>, devDependencies?: Record<string, string> };
  let template: { scripts?: Record<string, string>, dependencies?: Record<string, string> };

  try {
    consumer = JSON.parse(readFileSync(consumerPath, 'utf-8'));
    template = JSON.parse(readFileSync(templatePath, 'utf-8'));
  }
  catch (err) {
    log.warning(`Could not parse package.json for gap analysis: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const frameworkRefPattern = /bun run ((?:scripts|cli)\/\S+)/;
  const missingScripts: { name: string, command: string }[] = [];

  for (const [name, command] of Object.entries(template.scripts || {})) {
    if (typeof command !== 'string') { continue; }
    const match = frameworkRefPattern.exec(command);
    if (!match) { continue; }

    // Only treat it as framework infra if the referenced file actually exists in the template
    const referencedFile = match[1];
    if (!existsSync(join(TEMP_DIR, referencedFile))) { continue; }

    if (!consumer.scripts || !(name in consumer.scripts)) {
      missingScripts.push({ name, command });
    }
  }

  const consumerHasDep = (depName: string): boolean =>
    Boolean(consumer.dependencies?.[depName]) || Boolean(consumer.devDependencies?.[depName]);

  const missingDeps: { name: string, version: string }[] = [];
  for (const [name, version] of Object.entries(template.dependencies || {})) {
    if (typeof version !== 'string') { continue; }
    if (!consumerHasDep(name)) {
      missingDeps.push({ name, version });
    }
  }

  if (missingScripts.length === 0 && missingDeps.length === 0) {
    return;
  }

  console.log('');
  log.warning('Framework gaps detected in your package.json. Add the lines below manually:\n');

  if (missingScripts.length > 0) {
    console.log(`${colors.bold}  Add to "scripts":${colors.reset}`);
    for (const { name, command } of missingScripts) {
      console.log(`    ${colors.green}"${name}"${colors.reset}: ${colors.dim}"${command}"${colors.reset},`);
    }
    console.log('');
  }

  if (missingDeps.length > 0) {
    console.log(`${colors.bold}  Add to "dependencies":${colors.reset}`);
    for (const { name, version } of missingDeps) {
      console.log(`    ${colors.green}"${name}"${colors.reset}: ${colors.dim}"${version}"${colors.reset},`);
    }
    console.log('');
  }

  log.info('Run `bun install` after editing package.json so the new scripts work.');
}

// ============================================================================
// MIGRATION DETECTION
// ============================================================================

/**
 * Detect if consumer is upgrading from a pre-variables boilerplate.
 * Shows a migration banner if CLAUDE.md lacks the Project Variables section.
 */
function checkMigrationNeeded(): void {
  // If version file exists and shows variables system is known, skip
  const syncVersion = readSyncVersion();
  if (syncVersion && syncVersion.variableSystemVersion >= 1) {
    return;
  }

  const claudeMdPath = join(process.cwd(), 'CLAUDE.md');

  // No CLAUDE.md at all — likely a fresh project, not a migration
  if (!existsSync(claudeMdPath)) {
    return;
  }

  const content = readFileSync(claudeMdPath, 'utf-8');

  // Already has variables section — no migration needed
  if (content.includes('## Project Variables')) {
    return;
  }

  // Pre-variables consumer — show migration notice
  console.log(`
${colors.yellow}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.yellow}║${colors.reset}${colors.bold}                      UPGRADE NOTICE                        ${colors.reset}${colors.yellow}║${colors.reset}
${colors.yellow}╠══════════════════════════════════════════════════════════════╣${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  This boilerplate now uses ${colors.cyan}Project Variables${colors.reset}.               ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  Skills use ${colors.cyan}{{VARIABLE}}${colors.reset} placeholders that resolve         ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  from your CLAUDE.md configuration.                        ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  ${colors.bold}AFTER${colors.reset} this update completes, invoke any skill by its     ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  trigger (e.g., ${colors.green}/project-discovery${colors.reset}). Skills auto-load    ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  the operational detail and will update your CLAUDE.md.    ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

// ============================================================================
// SYNC SUMMARY
// ============================================================================

// eslint-disable-next-line unused-imports/no-unused-vars
function printSyncSummary(totals: MergeResult): void {
  if (totals.errors > 0) {
    log.warning(`Sync finished with warnings: ${totals.success} files synced, ${totals.errors} skipped`);
    log.info('Check the warnings above for details. Your backup is available in .backups/');
  }
  else {
    log.success(`${totals.success} files synced successfully`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  log.header('  Update Boilerplate CLI');
  log.info('Using intelligent merge (preserves user files)');

  // No arguments → Interactive per-file pipeline (M3)
  if (args.length === 0) {
    await ensureDependencies();
    ensureGitVersion();
    await validatePrerequisites();

    // Read sync state
    let priorStateInteractive: SyncState | null = null;
    try {
      priorStateInteractive = readSyncState(process.cwd());
    }
    catch (err) {
      if (err instanceof CorruptStateError) {
        log.error(err.message);
        process.exit(4);
      }
      throw err;
    }

    // Acquire template (needed for both bootstrap and incremental paths)
    await partialCloneTemplate(TEMPLATE_REPO, TEMP_DIR);
    const newHeadShaInteractive = resolveTemplateHeadSha(TEMP_DIR);

    // ── BOOTSTRAP PATH (first-ever run — no version file) ───────────────────
    if (priorStateInteractive === null) {
      log.warning(
        '⚠  First-time sync detected. Bulk-syncing all framework files.\n'
        + '   Use --dry-run first to preview if you have local edits.',
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const bootstrapBackupDir = join('.backups', `update-${timestamp}`);
      mkdirSync(bootstrapBackupDir, { recursive: true });

      const { summary: bootstrapSummary, bootstrapped: bootstrappedNames }
        = await runBootstrapForComponents(TEMP_DIR, COMPONENTS, process.cwd(), bootstrapBackupDir, false);

      const initialState: SyncStateV6 = {
        schema: 6,
        templateRepo: TEMPLATE_REPO,
        templateCommit: newHeadShaInteractive,
        perComponentCommit: Object.fromEntries(bootstrappedNames.map(n => [n, newHeadShaInteractive])),
        lastSyncedAt: new Date().toISOString(),
        cliVersion: CLI_VERSION,
        variableSystemVersion: 1,
      };
      writeSyncState(process.cwd(), initialState);

      detectUnfilledVariables();
      detectMissingFrameworkScripts();
      cleanup();

      log.header('  Bootstrap completed!');
      log.info(`Applied: ${bootstrapSummary.applied.length}, Failed: ${bootstrapSummary.failed.length}`);
      log.info(suggestCommitMessage({ ...bootstrapSummary, newHeadSha: newHeadShaInteractive }));
      log.info(`Suggested commit: git add .boilerplate-version.json && git commit -m "chore(boilerplate): bootstrap to ${newHeadShaInteractive.slice(0, 7)}"`);

      if (bootstrapSummary.failed.length > 0) {
        process.exit(5);
      }
      return;
    }

    // ── SCHEMA MIGRATION (v5.3 → v6) ────────────────────────────────────────
    let v6StateInteractive: SyncStateV6;
    if (!('perComponentCommit' in priorStateInteractive)) {
      // Prompt user before migrating
      const accepted = await promptForMigration(priorStateInteractive);
      if (!accepted) {
        log.info('Migration declined. Exiting without changes.');
        cleanup();
        process.exit(0);
      }
      // In-memory migration only; disk write happens at end of successful sync
      v6StateInteractive = migrateSyncState(priorStateInteractive);
    }
    else {
      v6StateInteractive = priorStateInteractive;
    }

    const { delta, bootstrap } = computeDelta(TEMP_DIR, COMPONENTS, v6StateInteractive);

    // Handle any components needing bootstrap (missing perComponentCommit entry)
    if (bootstrap.length > 0) {
      log.info(`Bootstrap needed for components: ${bootstrap.map(c => c.name).join(', ')}`);
      const bsTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const bsBackupDir = join('.backups', `update-${bsTimestamp}`);
      mkdirSync(bsBackupDir, { recursive: true });

      const { bootstrapped: bsNames }
        = await runBootstrapForComponents(TEMP_DIR, bootstrap, process.cwd(), bsBackupDir, false);

      // Advance perComponentCommit for bootstrapped components immediately
      for (const name of bsNames) {
        v6StateInteractive = {
          ...v6StateInteractive,
          perComponentCommit: {
            ...v6StateInteractive.perComponentCommit,
            [name]: newHeadShaInteractive,
          },
        };
      }
    }

    // Filter: only visible entries (exclude unchanged + binary-skip from main list)
    const visibleInteractive = delta.filter(e => e.classification !== 'unchanged');

    // Warn about binary skips
    for (const entry of visibleInteractive.filter(e => e.classification === 'binary-skip')) {
      log.warning(`Binary file skipped: ${entry.path}`);
    }

    if (visibleInteractive.filter(e => e.classification !== 'binary-skip').length === 0) {
      log.info('Already at HEAD for all components.');
      cleanup();
      return;
    }

    // Run interactive per-file plan
    const { plan, skipped } = await planInteractive(
      visibleInteractive,
      TEMP_DIR,
      process.cwd(),
      false, // dryRun=false here; dry-run is handled below when args present
    );

    if (plan.length === 0 && skipped.length > 0) {
      log.info('No files selected. Nothing to apply.');
      cleanup();
      return;
    }

    // Apply resolutions
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDirInteractive = join('.backups', `update-${timestamp}`);
    mkdirSync(backupDirInteractive, { recursive: true });

    const appliedInteractive: AppliedFile[] = [];
    const failedInteractive: FailedFile[] = [];

    for (const item of plan) {
      try {
        await applyResolution(item.entry, item.resolution, TEMP_DIR, process.cwd(), backupDirInteractive);
        appliedInteractive.push(item);
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to apply ${item.entry.path}: ${msg}`);
        failedInteractive.push({ entry: item.entry, resolution: item.resolution, error: msg });
      }
    }

    const summaryInteractive: RunSummary = {
      applied: appliedInteractive,
      skipped,
      failed: failedInteractive,
      binarySkipped: visibleInteractive.filter(e => e.classification === 'binary-skip'),
      bootstrapComponents: [],
      newHeadSha: newHeadShaInteractive,
    };

    // Write backup manifest
    appendBackupManifest(backupDirInteractive, visibleInteractive, v6StateInteractive);

    // Advance and write sync state
    const nextStateInteractive = advanceSyncState(
      v6StateInteractive,
      summaryInteractive,
      COMPONENTS,
      newHeadShaInteractive,
    );
    writeSyncState(process.cwd(), nextStateInteractive);

    // Post-sync checks
    detectUnfilledVariables();
    detectMissingFrameworkScripts();
    cleanup();

    log.header('  Update completed!');
    log.info(`Applied: ${appliedInteractive.length}, Skipped: ${skipped.length}, Failed: ${failedInteractive.length}`);
    log.info(suggestCommitMessage(summaryInteractive));
    log.info('Your custom files have been preserved.');

    if (failedInteractive.length > 0) {
      process.exit(5);
    }
    return;
  }

  // Parse arguments
  const parsed = parseArgs(args);

  if (parsed.help) {
    showHelp();
    process.exit(0);
  }

  if (parsed.rollback) {
    rollbackFromBackup();
    return;
  }

  // `skills --list` short-circuits before any write operation
  if (parsed.listSkills) {
    await validatePrerequisites();
    await cloneTemplate();
    printSkillsList();
    cleanup();
    return;
  }

  if (parsed.commands.length === 0) {
    log.error('No valid command specified');
    showHelp();
    process.exit(1);
  }

  ensureGitVersion();
  await validatePrerequisites();

  // Read sync state (CorruptStateError → exit 4)
  let priorState: SyncState | null = null;
  try {
    priorState = readSyncState(process.cwd());
  }
  catch (err) {
    if (err instanceof CorruptStateError) {
      log.error(err.message);
      process.exit(4);
    }
    throw err;
  }

  checkMigrationNeeded();

  // Expand 'all' command
  if (parsed.commands.includes('all')) {
    parsed.commands = ['skills', 'commands', 'scripts', 'templates', 'agents-docs', 'claude-config', 'docs', 'cli', 'vscode', 'husky', 'tooling', 'examples'];
    parsed.all = true;
  }

  // ── AUTO / CI MODE PATH (M2) ─────────────────────────────────────────────
  if (isNonInteractive(parsed)) {
    const reason = parsed.auto ? 'flag' : (process.env.CI ? 'env' : 'tty');
    log.info(`Auto/CI mode active. Reason: ${reason}.`);

    // Acquire template via partial clone
    await partialCloneTemplate(TEMPLATE_REPO, TEMP_DIR);

    const newHeadSha = resolveTemplateHeadSha(TEMP_DIR);

    // ── BOOTSTRAP PATH in auto mode (null state = first-ever run) ───────────
    let v6State: SyncStateV6;
    if (priorState === null) {
      log.warning(
        '⚠  First-time sync detected. Bulk-syncing all framework files.\n'
        + '   Use --dry-run first to preview if you have local edits.',
      );

      if (parsed.dryRun) {
        log.header('  DRY RUN (auto bootstrap) — No files will be modified');
        log.info('Would perform first-time bootstrap sync for all components.');
        // Log what would be synced (lightweight preview)
        for (const component of COMPONENTS) {
          log.dim(`[dry-run bootstrap] would sync component: ${component.name}`);
        }
        cleanup();
        return;
      }

      const bsTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const bsBackupDir = join('.backups', `update-${bsTimestamp}`);
      mkdirSync(bsBackupDir, { recursive: true });

      const { summary: bsSummary, bootstrapped: bsNames }
        = await runBootstrapForComponents(TEMP_DIR, COMPONENTS, process.cwd(), bsBackupDir, false);

      const initialStateAuto: SyncStateV6 = {
        schema: 6,
        templateRepo: TEMPLATE_REPO,
        templateCommit: newHeadSha,
        perComponentCommit: Object.fromEntries(bsNames.map(n => [n, newHeadSha])),
        lastSyncedAt: new Date().toISOString(),
        cliVersion: CLI_VERSION,
        variableSystemVersion: 1,
      };
      writeSyncState(process.cwd(), initialStateAuto);

      detectUnfilledVariables();
      detectMissingFrameworkScripts();
      cleanup();

      log.header('  Bootstrap completed!');
      log.info(`Applied: ${bsSummary.applied.length}, Failed: ${bsSummary.failed.length}`);
      log.info(suggestCommitMessage({ ...bsSummary, newHeadSha }));

      if (bsSummary.failed.length > 0) {
        process.exit(5);
      }
      return;
    }

    // ── SCHEMA MIGRATION in auto mode (v5.3 detected) ───────────────────────
    if (!('perComponentCommit' in priorState)) {
      // Auto mode cannot prompt — require interactive for migration
      log.warning(
        'Detected v5.3 .boilerplate-version.json. Schema migration requires interactive mode.\n'
        + 'Run `bun run update` (without --auto) to be prompted for the v5→v6 upgrade.',
      );
      cleanup();
      process.exit(0);
    }

    v6State = priorState;

    const { delta, bootstrap } = computeDelta(TEMP_DIR, COMPONENTS, v6State);

    // Run bootstrap for components with missing perComponentCommit
    if (bootstrap.length > 0) {
      log.info(`Bootstrap needed for components: ${bootstrap.map(c => c.name).join(', ')}`);
      if (!parsed.dryRun) {
        const bsAutoTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const bsAutoBackupDir = join('.backups', `update-${bsAutoTimestamp}`);
        mkdirSync(bsAutoBackupDir, { recursive: true });

        const { bootstrapped: bsAutoNames }
          = await runBootstrapForComponents(TEMP_DIR, bootstrap, process.cwd(), bsAutoBackupDir, false);

        for (const name of bsAutoNames) {
          v6State = {
            ...v6State,
            perComponentCommit: { ...v6State.perComponentCommit, [name]: newHeadSha },
          };
        }
      }
      else {
        for (const component of bootstrap) {
          log.dim(`[dry-run bootstrap] would sync component: ${component.name}`);
        }
      }
    }

    // Filter: only visible entries (exclude unchanged)
    const visibleEntries = delta.filter(
      e => e.classification !== 'unchanged',
    );

    // Log binary skips
    for (const entry of visibleEntries.filter(e => e.classification === 'binary-skip')) {
      log.warning(`Binary file skipped: ${entry.path}`);
    }

    if (visibleEntries.length === 0 && bootstrap.length === 0) {
      log.info('Already at HEAD for all components.');
      cleanup();
      return;
    }

    // Dry-run: print plan without applying
    if (parsed.dryRun) {
      log.header('  DRY RUN (auto mode) — No files will be modified');
      const { plan, deferred } = planAuto(visibleEntries);
      for (const item of plan) {
        const action = item.resolution === 'theirs' ? 'would apply' : 'would skip';
        log.dim(`[dry-run] ${action}: ${item.entry.path}`);
      }
      for (const entry of deferred) {
        log.dim(`[dry-run] deletion-pending (requires interactive): ${entry.path}`);
      }
      log.info(`Total: ${plan.filter(p => p.resolution === 'theirs').length} would apply, ${plan.filter(p => p.resolution === 'skip').length} would skip, ${deferred.length} deletion-pending`);
      cleanup();
      return;
    }

    // Create backup dir for this run
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = join('.backups', `update-${timestamp}`);
    mkdirSync(backupDir, { recursive: true });

    // Execute auto pipeline
    const summary = await runAuto(visibleEntries, TEMP_DIR, process.cwd(), backupDir, false);
    summary.newHeadSha = newHeadSha;

    // Write backup manifest
    appendBackupManifest(backupDir, visibleEntries, v6State);

    // Advance sync state and write
    const nextState = advanceSyncState(v6State, summary, COMPONENTS, newHeadSha);
    writeSyncState(process.cwd(), nextState);

    // Post-sync checks
    detectUnfilledVariables();
    detectMissingFrameworkScripts();
    cleanup();

    log.header('  Update completed!');
    log.info(suggestCommitMessage(summary));

    if (summary.failed.length > 0) {
      process.exit(5);
    }
    return;
  }

  // ── INTERACTIVE PATH (TTY, non-auto, args provided) ──────────────────────

  // Acquire template via partial clone
  await partialCloneTemplate(TEMPLATE_REPO, TEMP_DIR);
  const newHeadShaTTY = resolveTemplateHeadSha(TEMP_DIR);

  // ── BOOTSTRAP PATH (first-ever run with args) ────────────────────────────
  if (priorState === null) {
    log.warning(
      '⚠  First-time sync detected. Bulk-syncing all framework files.\n'
      + '   Use --dry-run first to preview if you have local edits.',
    );
    const bsTTYTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const bsTTYBackupDir = join('.backups', `update-${bsTTYTimestamp}`);
    mkdirSync(bsTTYBackupDir, { recursive: true });

    const { summary: bsTTYSummary, bootstrapped: bsTTYNames }
      = await runBootstrapForComponents(TEMP_DIR, COMPONENTS, process.cwd(), bsTTYBackupDir, false);

    const initialStateTTY: SyncStateV6 = {
      schema: 6,
      templateRepo: TEMPLATE_REPO,
      templateCommit: newHeadShaTTY,
      perComponentCommit: Object.fromEntries(bsTTYNames.map(n => [n, newHeadShaTTY])),
      lastSyncedAt: new Date().toISOString(),
      cliVersion: CLI_VERSION,
      variableSystemVersion: 1,
    };
    writeSyncState(process.cwd(), initialStateTTY);

    detectUnfilledVariables();
    detectMissingFrameworkScripts();
    cleanup();

    log.header('  Bootstrap completed!');
    log.info(`Applied: ${bsTTYSummary.applied.length}, Failed: ${bsTTYSummary.failed.length}`);
    log.info(suggestCommitMessage({ ...bsTTYSummary, newHeadSha: newHeadShaTTY }));

    if (bsTTYSummary.failed.length > 0) {
      process.exit(5);
    }
    return;
  }

  // ── SCHEMA MIGRATION (v5.3 → v6) in TTY args path ───────────────────────
  let v6StateTTY: SyncStateV6;
  if (!('perComponentCommit' in priorState)) {
    const acceptedTTY = await promptForMigration(priorState);
    if (!acceptedTTY) {
      log.info('Migration declined. Exiting without changes.');
      cleanup();
      process.exit(0);
    }
    v6StateTTY = migrateSyncState(priorState);
  }
  else {
    v6StateTTY = priorState;
  }

  const { delta: deltaTTY, bootstrap: bootstrapTTY } = computeDelta(TEMP_DIR, COMPONENTS, v6StateTTY);

  if (bootstrapTTY.length > 0) {
    log.info(`Bootstrap needed for components: ${bootstrapTTY.map(c => c.name).join(', ')}`);
    const bsTTY2Timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const bsTTY2BackupDir = join('.backups', `update-${bsTTY2Timestamp}`);
    mkdirSync(bsTTY2BackupDir, { recursive: true });

    const { bootstrapped: bsTTY2Names }
      = await runBootstrapForComponents(TEMP_DIR, bootstrapTTY, process.cwd(), bsTTY2BackupDir, false);

    for (const name of bsTTY2Names) {
      v6StateTTY = {
        ...v6StateTTY,
        perComponentCommit: { ...v6StateTTY.perComponentCommit, [name]: newHeadShaTTY },
      };
    }
  }

  const visibleTTY = deltaTTY.filter(e => e.classification !== 'unchanged');

  for (const entry of visibleTTY.filter(e => e.classification === 'binary-skip')) {
    log.warning(`Binary file skipped: ${entry.path}`);
  }

  if (visibleTTY.filter(e => e.classification !== 'binary-skip').length === 0) {
    log.info('Already at HEAD for all components.');
    cleanup();
    return;
  }

  // Dry-run: interactive prompts still shown, no writes
  if (parsed.dryRun) {
    log.header('  DRY RUN (interactive mode) — No files will be modified');
    const { plan: dryPlan, skipped: drySkipped } = await planInteractive(
      visibleTTY,
      TEMP_DIR,
      process.cwd(),
      true, // dryRun=true
    );

    log.info(`Would apply: ${dryPlan.length}, Would skip: ${drySkipped.length}`);
    for (const item of dryPlan) {
      log.dim(`[dry-run] would ${item.resolution}: ${item.entry.path}`);
    }
    for (const item of drySkipped) {
      log.dim(`[dry-run] would skip: ${item.entry.path}`);
    }
    cleanup();
    return;
  }

  // Run interactive per-file plan
  const { plan: ttyPlan, skipped: ttySkipped } = await planInteractive(
    visibleTTY,
    TEMP_DIR,
    process.cwd(),
    false,
  );

  // Create backup dir
  const timestampTTY = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDirTTY = join('.backups', `update-${timestampTTY}`);
  mkdirSync(backupDirTTY, { recursive: true });

  const appliedTTY: AppliedFile[] = [];
  const failedTTY: FailedFile[] = [];

  for (const item of ttyPlan) {
    try {
      await applyResolution(item.entry, item.resolution, TEMP_DIR, process.cwd(), backupDirTTY);
      appliedTTY.push(item);
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to apply ${item.entry.path}: ${msg}`);
      failedTTY.push({ entry: item.entry, resolution: item.resolution, error: msg });
    }
  }

  const summaryTTY: RunSummary = {
    applied: appliedTTY,
    skipped: ttySkipped,
    failed: failedTTY,
    binarySkipped: visibleTTY.filter(e => e.classification === 'binary-skip'),
    bootstrapComponents: [],
    newHeadSha: newHeadShaTTY,
  };

  appendBackupManifest(backupDirTTY, visibleTTY, v6StateTTY);

  const nextStateTTY = advanceSyncState(v6StateTTY, summaryTTY, COMPONENTS, newHeadShaTTY);
  writeSyncState(process.cwd(), nextStateTTY);

  detectUnfilledVariables();
  detectMissingFrameworkScripts();
  cleanup();

  log.header('  Update completed!');
  log.info(`Applied: ${appliedTTY.length}, Skipped: ${ttySkipped.length}, Failed: ${failedTTY.length}`);
  log.info(suggestCommitMessage(summaryTTY));
  log.info('Your custom files have been preserved.');

  if (failedTTY.length > 0) {
    process.exit(5);
  }
}

main().catch((error) => {
  log.error('Unexpected error:');
  console.error(error);
  process.exit(1);
});
