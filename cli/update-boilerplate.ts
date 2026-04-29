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
 *
 * ============================================================================
 * AGENT SKILLS MODEL
 * ============================================================================
 *
 * Operational workflows live as agent skills under `.claude/skills/`. The
 * canonical location is the Claude Code directory:
 *
 *   .claude/skills/                Canonical skills directory (one folder per skill)
 *   .agents/skills  -> ../.claude/skills  Relative symlink for portability
 *                                          (Codex / Copilot / Cursor / OpenCode)
 *
 * The CLI syncs the canonical directory only. The `.agents/skills` symlink is
 * ensured after every successful skills sync so other agent platforms see the
 * same content without duplication.
 *
 * ============================================================================
 * WHAT GETS SYNCED (Universal - same across all projects)
 * ============================================================================
 *
 *   .claude/skills/        Agent skills (project-discovery, sprint-testing, ...)
 *   .claude/commands/      Slash commands (commit-push-pr, refresh-ai-memory, ...)
 *   .claude/settings.json  Versioned default permissions (settings.local.json untouched)
 *   scripts/               Framework scripts (agents-lint, sync-jira-issues, sync-openapi, api-login, kata-manifest, ...)
 *   templates/             Universal templates (pr-test-automation, ...)
 *   .agents/README.md      Variable system documentation (only README, not project.yaml/jira-fields.json)
 *   docs/               General documentation
 *   cli/                CLI tools — xray/ (multi-command Xray CLI) and this auto-updater itself
 *   .vscode/            IDE configuration (extensions, settings)
 *   .husky/             Git hooks
 *   tooling/            Config files (editorconfig, prettier)
 *   examples/           Example templates (.mcp.example.json, dbhub.example.toml)
 *
 * After every successful sync the CLI also reports any framework scripts or
 * dependencies present in the template `package.json` but missing from yours,
 * with the exact lines to copy across.
 *
 * ============================================================================
 * WHAT NEVER GETS SYNCED (Project-specific)
 * ============================================================================
 *
 *   .github/workflows/         Your CI/CD pipelines
 *   config/                    Your URLs, credentials, timeouts
 *   tests/components/          Your domain components (pages, APIs)
 *   tests/utils/               Your custom utilities
 *   tests/data/                Your fixtures and factories
 *   tests/setup/               Your auth setup
 *   playwright.config          Your test configuration
 *   .context/PRD|SRS|idea|PBI  Your generated discovery content
 *   .agents/project.yaml       Your project variables (per-repo config)
 *   .agents/jira-fields.json          Auto-generated Jira field catalog
 *   .agents/jira-required.yaml Manifest customised per project (optional/unmapped)
 *   .claude/settings.local.json Your personal Claude Code permissions (gitignored)
 *   .mcp.json                  Your MCP credentials (use .mcp.example.json as a template)
 *   CLAUDE.md|AGENTS.md|GEMINI.md  Your AI memory files
 *   README.md                  Your project documentation
 *   package.json               Your dependencies (script/dep gaps reported instead)
 *   eslint.config.js           Your linting rules
 *   tsconfig.json              Your TypeScript config
 *   .env.example               Your environment variables
 *
 * ============================================================================
 * REQUIREMENTS
 * ============================================================================
 *
 * 1. Bun runtime (https://bun.sh)
 * 2. GitHub CLI (gh) - authenticated with access to the template repo
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   bun run update                                    Interactive menu
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
 *   bun run update --rollback                         Restore from most recent backup
 *
 * ============================================================================
 * INTELLIGENT MERGE
 * ============================================================================
 *
 * The script uses "intelligent merge" strategy:
 *   - Updates/adds files from template
 *   - Preserves user files not in template
 *   - Never deletes user-created content
 *   - Creates automatic backup before changes
 *
 * ============================================================================
 *
 * @author UPEX Galaxy
 * @version 5.3
 */

import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLI_VERSION = '5.3';
const TEMPLATE_REPO = 'upex-galaxy/agentic-qa-boilerplate';
const TEMP_DIR = join(tmpdir(), 'kata-boilerplate-update');

/**
 * Canonical skills location (Claude Code) and portability symlink target.
 * The CLI syncs the canonical path; the symlink is ensured after sync so
 * Codex / Copilot / Cursor / OpenCode resolve skills from the same source.
 */
const SKILLS_CANONICAL_DIR = join('.claude', 'skills');
const SKILLS_SYMLINK_PATH = join('.agents', 'skills');
const SKILLS_SYMLINK_TARGET = join('..', '.claude', 'skills');

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
}

interface MergeResult {
  success: number
  errors: number
}

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
    // Recreate the .agents/skills symlink if the skills directory was restored
    if (existsSync(SKILLS_CANONICAL_DIR)) {
      ensureAgentsSkillsSymlink();
    }
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

/**
 * Ensure `.agents/skills` is a relative symlink pointing at `../.claude/skills`.
 *
 * Behavior:
 *   - Absent        -> create the symlink.
 *   - Correct link  -> leave untouched, log confirmation.
 *   - Wrong target  -> warn the user, do not overwrite.
 *   - Real dir/file -> warn the user, do not overwrite.
 *   - Windows EPERM -> print elevation instructions.
 */
function ensureAgentsSkillsSymlink(): void {
  const parentDir = '.agents';

  try {
    mkdirSync(parentDir, { recursive: true });
  }
  catch (err) {
    log.warning(`Could not create ${parentDir}/: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (existsSync(SKILLS_SYMLINK_PATH)) {
    let stats;
    try {
      stats = lstatSync(SKILLS_SYMLINK_PATH);
    }
    catch (err) {
      log.warning(`Could not inspect ${SKILLS_SYMLINK_PATH}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    if (stats.isSymbolicLink()) {
      let currentTarget = '';
      try {
        currentTarget = readlinkSync(SKILLS_SYMLINK_PATH);
      }
      catch {
        // Ignore read failure, treat as wrong target
      }

      if (currentTarget === SKILLS_SYMLINK_TARGET) {
        log.dim(`${SKILLS_SYMLINK_PATH} symlink already configured`);
        return;
      }

      log.warning(
        `${SKILLS_SYMLINK_PATH} is a symlink pointing to "${currentTarget}" (expected "${SKILLS_SYMLINK_TARGET}").`,
      );
      log.info(`Remove it manually and re-run: rm "${SKILLS_SYMLINK_PATH}" && bun run update skills`);
      return;
    }

    // Real directory or file — never overwrite user data
    log.warning(
      `${SKILLS_SYMLINK_PATH} exists as a regular ${stats.isDirectory() ? 'directory' : 'file'}; not overwriting.`,
    );
    log.info(
      'To enable multi-agent portability, back up and remove it, then re-run the skills sync so the symlink can be created.',
    );
    return;
  }

  // Absent — create the symlink
  try {
    symlinkSync(SKILLS_SYMLINK_TARGET, SKILLS_SYMLINK_PATH, 'dir');
    log.success(`Created symlink ${SKILLS_SYMLINK_PATH} -> ${SKILLS_SYMLINK_TARGET}`);
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as NodeJS.ErrnoException | undefined)?.code;

    if (process.platform === 'win32' && code === 'EPERM') {
      log.warning(
        'Symlink creation requires elevated permissions on Windows. '
        + `Run this command as Administrator, or manually create "${SKILLS_SYMLINK_PATH}" `
        + `as a directory junction / symlink to "${SKILLS_CANONICAL_DIR}".`,
      );
      return;
    }

    if (process.platform === 'win32') {
      log.warning(`Could not create ${SKILLS_SYMLINK_PATH}: ${message}`);
      log.info(
        'On Windows, creating symlinks may require elevated permissions. '
        + `Run this command as Administrator, or manually create "${SKILLS_SYMLINK_PATH}" `
        + `as a directory junction / symlink to "${SKILLS_CANONICAL_DIR}".`,
      );
      return;
    }

    log.warning(`Could not create ${SKILLS_SYMLINK_PATH}: ${message}`);
  }
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

  // Ensure the portability symlink exists after a successful sync
  ensureAgentsSkillsSymlink();

  return totals;
}

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

${colors.bold}FLAGS FOR 'skills':${colors.reset}
  --skill NAME  Sync a specific skill folder (e.g., --skill sprint-testing)
                Accepts a comma-separated list: --skill sprint-testing,test-automation
  --list        List the skills available in the template and exit

${colors.bold}WHAT GETS SYNCED:${colors.reset}
  ${colors.green}  .claude/skills/${colors.reset}        Agent skills (canonical location)
  ${colors.green}  .claude/commands/${colors.reset}      Slash commands (commit-push-pr, refresh-ai-memory, ...)
  ${colors.green}  .claude/settings.json${colors.reset}  Versioned default permissions (your settings.local.json untouched)
  ${colors.green}  .agents/skills${colors.reset}         Relative symlink to .claude/skills (auto-managed)
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

  // No arguments -> Interactive menu
  if (args.length === 0) {
    await ensureDependencies();

    const selected = await showMainMenu();

    if (selected.length === 0) {
      log.warning('Nothing selected. Exiting...');
      process.exit(0);
    }

    await validatePrerequisites();
    checkMigrationNeeded();

    const components = selected.includes('all')
      ? ['skills', 'commands', 'scripts', 'templates', 'agents-docs', 'claude-config', 'docs', 'cli', 'vscode', 'husky', 'tooling', 'examples']
      : selected;

    createBackup(components);
    await cloneTemplate();

    selfUpdate();

    const totals: MergeResult = { success: 0, errors: 0 };
    const addResult = (r: MergeResult) => { totals.success += r.success; totals.errors += r.errors; };

    if (selected.includes('all')) {
      addResult(updateSkills(null));
      addResult(updateCommands());
      addResult(updateScripts());
      addResult(updateTemplates());
      addResult(updateAgentsDocs());
      addResult(updateClaudeConfig());
      addResult(updateDocs());
      addResult(updateCli());
      addResult(updateVscode());
      addResult(updateHusky());
      addResult(updateTooling());
      addResult(updateExamples());
    }
    else {
      for (const cmd of selected) {
        if (cmd === 'skills') {
          const skillSelection = await showSkillsMenu();
          if (skillSelection.length === 0) {
            log.warning('No skills selected. Skipping skills sync.');
            continue;
          }
          addResult(updateSkills(skillSelection));
        }
        else if (cmd === 'commands') {
          addResult(updateCommands());
        }
        else if (cmd === 'scripts') {
          addResult(updateScripts());
        }
        else if (cmd === 'templates') {
          addResult(updateTemplates());
        }
        else if (cmd === 'agents-docs') {
          addResult(updateAgentsDocs());
        }
        else if (cmd === 'claude-config') {
          addResult(updateClaudeConfig());
        }
        else if (cmd === 'docs') {
          addResult(updateDocs());
        }
        else if (cmd === 'cli') {
          addResult(updateCli());
        }
        else if (cmd === 'vscode') {
          addResult(updateVscode());
        }
        else if (cmd === 'husky') {
          addResult(updateHusky());
        }
        else if (cmd === 'tooling') {
          addResult(updateTooling());
        }
        else if (cmd === 'examples') {
          addResult(updateExamples());
        }
      }
    }

    recordSyncVersion(components);
    detectUnfilledVariables();
    detectMissingFrameworkScripts();
    cleanup();
    log.header('  Update completed!');
    printSyncSummary(totals);
    log.info('Your custom files have been preserved.');
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

  await validatePrerequisites();
  checkMigrationNeeded();

  // Expand 'all' command
  if (parsed.commands.includes('all')) {
    parsed.commands = ['skills', 'commands', 'scripts', 'templates', 'agents-docs', 'claude-config', 'docs', 'cli', 'vscode', 'husky', 'tooling', 'examples'];
    parsed.all = true;
  }

  await cloneTemplate();

  // Dry-run mode: preview changes without modifying files
  if (parsed.dryRun) {
    executeDryRun(parsed.commands, parsed.all, parsed.skills);
    cleanup();
    return;
  }

  createBackup(parsed.commands);

  selfUpdate();

  const totals: MergeResult = { success: 0, errors: 0 };
  const addResult = (r: MergeResult) => { totals.success += r.success; totals.errors += r.errors; };

  // Execute commands
  for (const cmd of parsed.commands) {
    switch (cmd) {
      case 'skills':
        addResult(updateSkills(parsed.skills));
        break;
      case 'commands':
        addResult(updateCommands());
        break;
      case 'scripts':
        addResult(updateScripts());
        break;
      case 'templates':
        addResult(updateTemplates());
        break;
      case 'agents-docs':
        addResult(updateAgentsDocs());
        break;
      case 'claude-config':
        addResult(updateClaudeConfig());
        break;
      case 'docs':
        addResult(updateDocs());
        break;
      case 'cli':
        addResult(updateCli());
        break;
      case 'vscode':
        addResult(updateVscode());
        break;
      case 'husky':
        addResult(updateHusky());
        break;
      case 'tooling':
        addResult(updateTooling());
        break;
      case 'examples':
        addResult(updateExamples());
        break;
    }
  }

  recordSyncVersion(parsed.commands);
  detectUnfilledVariables();
  detectMissingFrameworkScripts();
  cleanup();
  log.header('  Update completed!');
  printSyncSummary(totals);
  log.info('Your custom files have been preserved.');
}

main().catch((error) => {
  log.error('Unexpected error:');
  console.error(error);
  process.exit(1);
});
