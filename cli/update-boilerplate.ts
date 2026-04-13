#!/usr/bin/env bun

/**
 * ============================================================================
 * UPDATE BOILERPLATE CLI
 * ============================================================================
 *
 * Keeps your project synchronized with the official KATA template
 * (ai-driven-test-automation-boilerplate) without overwriting your
 * project-specific customizations.
 *
 * PRINCIPLE:
 *   Only sync UNIVERSAL framework files, never project-specific configs.
 *
 * ============================================================================
 * WHAT GETS SYNCED (Universal - same across all projects)
 * ============================================================================
 *
 *   .prompts/           QA workflow prompts (stages, phases, utilities)
 *   .context/guidelines/ Framework documentation (TAE, QA, MCP guides)
 *   docs/               General documentation
 *   cli/                CLI tools (this file auto-updates itself)
 *   templates/          Sprint testing prompt, templates
 *   .vscode/            IDE configuration (extensions, settings)
 *   .husky/             Git hooks
 *   tooling/            Config files (editorconfig, prettier)
 *   examples/           Example templates (.mcp.example.json, dbhub.example.toml)
 *
 * ============================================================================
 * WHAT NEVER GETS SYNCED (Project-specific)
 * ============================================================================
 *
 *   .github/workflows/  Your CI/CD pipelines
 *   config/             Your URLs, credentials, timeouts
 *   tests/components/   Your domain components (pages, APIs)
 *   tests/utils/        Your custom utilities
 *   tests/data/         Your fixtures and factories
 *   tests/setup/        Your auth setup
 *   playwright.config   Your test configuration
 *   .context/PRD|SRS|idea|PBI  Your generated discovery content
 *   CLAUDE.md|AGENTS.md|GEMINI.md  Your AI memory files
 *   README.md           Your project documentation
 *   package.json        Your dependencies
 *   eslint.config.js    Your linting rules
 *   tsconfig.json       Your TypeScript config
 *   .env.example        Your environment variables
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
 *   bun run update                  Interactive menu
 *   bun run update all              Update everything (allowed dirs only)
 *   bun run update prompts          Update .prompts/
 *   bun run update guidelines       Update .context/guidelines/
 *   bun run update docs             Update docs/
 *   bun run update cli              Update cli/
 *   bun run update templates        Update templates/
 *   bun run update vscode           Update .vscode/
 *   bun run update husky            Update .husky/
 *   bun run update tooling          Update config files (prettier, eslint, etc.)
 *   bun run update examples         Update example templates
 *   bun run update all --dry-run    Preview changes without modifying
 *   bun run update --rollback       Restore from most recent backup
 *
 * PROMPTS OPTIONS:
 *   bun run update prompts --all           All stages + phases + extras
 *   bun run update prompts --stage 4,5     Specific stages
 *   bun run update prompts --phase 1,2     Specific phases
 *   bun run update prompts --role qa       QA role preset (stages 1-5)
 *   bun run update prompts --role discovery Discovery preset (phases 1-4)
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
 * @version 5.1
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLI_VERSION = '5.1';
const TEMPLATE_REPO = 'upex-galaxy/ai-driven-test-automation-boilerplate';
const TEMP_DIR = join(tmpdir(), 'kata-boilerplate-update');

/**
 * Discovery phases configuration
 * Located in: .prompts/discovery/
 */
const DISCOVERY_PHASES: Record<string, { name: string, dir: string }> = {
  'phase-1': { name: 'Constitution', dir: 'discovery/phase-1-constitution' },
  'phase-2': { name: 'Architecture', dir: 'discovery/phase-2-architecture' },
  'phase-3': { name: 'Infrastructure', dir: 'discovery/phase-3-infrastructure' },
  'phase-4': { name: 'Specification', dir: 'discovery/phase-4-specification' },
};

/**
 * QA Stages configuration
 * Located in: .prompts/stage-X-name/
 */
const QA_STAGES: Record<string, { name: string, dir: string }> = {
  'stage-1': { name: 'Shift-Left Testing', dir: 'stage-1-shift-left' },
  'stage-2': { name: 'Exploratory Testing', dir: 'stage-2-exploratory' },
  'stage-3': { name: 'Test Documentation', dir: 'stage-3-documentation' },
  'stage-4': { name: 'Test Automation', dir: 'stage-4-automation' },
  'stage-5': { name: 'Regression Testing', dir: 'stage-5-regression' },
};

/**
 * Extra directories in .prompts/
 */
const EXTRA_PROMPT_DIRS = ['utilities', 'setup'];

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
 * Role-based presets for quick updates
 */
const ROLE_PRESETS: Record<string, {
  description: string
  stages?: string[]
  phases?: string[]
  extras?: boolean
}> = {
  'qa': {
    description: 'All QA stages (Shift-Left to Regression)',
    stages: ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5'],
  },
  'qa-manual': {
    description: 'Manual QA (Shift-Left, Exploratory, Documentation)',
    stages: ['stage-1', 'stage-2', 'stage-3'],
  },
  'qa-automation': {
    description: 'Automation only (Test Automation, Regression)',
    stages: ['stage-4', 'stage-5'],
  },
  'discovery': {
    description: 'Project onboarding (all phases)',
    phases: ['phase-1', 'phase-2', 'phase-3', 'phase-4'],
  },
  'discovery-lite': {
    description: 'Quick onboarding (Constitution + Architecture)',
    phases: ['phase-1', 'phase-2'],
  },
  'framework': {
    description: 'Framework updates (guidelines + CLI + docs)',
    extras: true,
  },
};

// ============================================================================
// TYPES
// ============================================================================

interface ParsedArgs {
  commands: string[]
  stages: string[] | null
  phases: string[] | null
  role: string | null
  extras: boolean
  all: boolean
  help: boolean
  dryRun: boolean
  rollback: boolean
}

interface PromptsConfig {
  stages: string[]
  phases: string[]
  extras: boolean
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
  ${colors.green}bun run update all${colors.reset}              - Update everything
  ${colors.green}bun run update prompts --role qa${colors.reset} - Update prompts for QA
  ${colors.green}bun run update cli${colors.reset}              - Update CLI tools

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
    stages: null,
    phases: null,
    role: null,
    extras: false,
    all: false,
    help: false,
    dryRun: false,
    rollback: false,
  };

  const validCommands = ['all', 'prompts', 'guidelines', 'docs', 'cli', 'templates', 'vscode', 'husky', 'tooling', 'examples', 'help', 'rollback'];

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
    else if (arg === '--extras') {
      result.extras = true;
    }
    else if (arg === '--stage' || arg === '--stages') {
      const nextArg = args[++i];
      if (nextArg) {
        result.stages = nextArg
          .split(',')
          .map(n => `stage-${n.trim()}`)
          .filter(s => QA_STAGES[s]);
      }
    }
    else if (arg === '--phase' || arg === '--phases') {
      const nextArg = args[++i];
      if (nextArg) {
        result.phases = nextArg
          .split(',')
          .map(n => `phase-${n.trim()}`)
          .filter(p => DISCOVERY_PHASES[p]);
      }
    }
    else if (arg === '--role') {
      const nextArg = args[++i];
      if (nextArg && ROLE_PRESETS[nextArg]) {
        result.role = nextArg;
        const preset = ROLE_PRESETS[nextArg];
        result.stages = preset.stages || [];
        result.phases = preset.phases || [];
        result.extras = preset.extras || false;
      }
      else if (nextArg) {
        log.error(`Unknown role: ${nextArg}`);
        log.info(`Available roles: ${Object.keys(ROLE_PRESETS).join(', ')}`);
        process.exit(1);
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
    prompts: { src: '.prompts', dest: '.prompts' },
    guidelines: { src: '.context/guidelines', dest: '.context/guidelines' },
    docs: { src: 'docs', dest: 'docs' },
    cli: { src: 'cli', dest: 'cli' },
    templates: { src: 'templates', dest: 'templates' },
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
function executeDryRun(commands: string[], allMode: boolean): void {
  log.header('  DRY RUN — No files will be modified');
  console.log('');

  const components: { name: string, dir: string }[] = [];

  if (commands.includes('prompts') || allMode) {
    components.push({ name: 'Prompts (.prompts/)', dir: join(TEMP_DIR, '.prompts') });
  }
  if (commands.includes('guidelines') || allMode) {
    components.push({ name: 'Guidelines (.context/guidelines/)', dir: join(TEMP_DIR, '.context', 'guidelines') });
  }
  if (commands.includes('docs') || allMode) {
    components.push({ name: 'Documentation (docs/)', dir: join(TEMP_DIR, 'docs') });
  }
  if (commands.includes('cli') || allMode) {
    components.push({ name: 'CLI Tools (cli/)', dir: join(TEMP_DIR, 'cli') });
  }
  if (commands.includes('templates') || allMode) {
    components.push({ name: 'Templates (templates/)', dir: join(TEMP_DIR, 'templates') });
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
// UPDATE FUNCTIONS
// ============================================================================

function updatePrompts(stages: string[], phases: string[], includeExtras: boolean): MergeResult {
  log.step('Updating .prompts/ (merge)...');

  const totals: MergeResult = { success: 0, errors: 0 };

  const templatePromptsPath = join(TEMP_DIR, '.prompts');
  if (!existsSync(templatePromptsPath)) {
    log.warning('.prompts directory not found in template');
    return totals;
  }

  mkdirSync('.prompts', { recursive: true });

  // Check if this is a full update
  const allStages = Object.keys(QA_STAGES);
  const allPhases = Object.keys(DISCOVERY_PHASES);
  const isFullUpdate
    = includeExtras
      && stages.length === allStages.length
      && allStages.every(s => stages.includes(s))
      && phases.length === allPhases.length
      && allPhases.every(p => phases.includes(p));

  if (isFullUpdate) {
    log.merge('Syncing full directory...');
    const result = mergeDirectory(templatePromptsPath, '.prompts');
    totals.success += result.success;
    totals.errors += result.errors;
    return totals;
  }

  // Update specific stages
  if (stages && stages.length > 0) {
    log.merge('QA Stages:');
    for (const stageKey of stages) {
      const stageConfig = QA_STAGES[stageKey];
      if (!stageConfig) {
        continue;
      }

      const srcPath = join(templatePromptsPath, stageConfig.dir);
      const destPath = join('.prompts', stageConfig.dir);

      if (existsSync(srcPath)) {
        console.log(`  ${colors.cyan}${stageKey}: ${stageConfig.name}${colors.reset}`);
        const result = mergeDirectory(srcPath, destPath, '    ');
        totals.success += result.success;
        totals.errors += result.errors;
      }
      else {
        log.warning(`${stageKey} not found in template`);
      }
    }
  }

  // Update specific phases
  if (phases && phases.length > 0) {
    log.merge('Discovery Phases:');
    for (const phaseKey of phases) {
      const phaseConfig = DISCOVERY_PHASES[phaseKey];
      if (!phaseConfig) {
        continue;
      }

      const srcPath = join(templatePromptsPath, phaseConfig.dir);
      const destPath = join('.prompts', phaseConfig.dir);

      if (existsSync(srcPath)) {
        console.log(`  ${colors.cyan}${phaseKey}: ${phaseConfig.name}${colors.reset}`);
        const result = mergeDirectory(srcPath, destPath, '    ');
        totals.success += result.success;
        totals.errors += result.errors;
      }
      else {
        log.warning(`${phaseKey} not found in template`);
      }
    }

    // Also sync the discovery parent directory README if exists
    const discoveryReadmeSrc = join(templatePromptsPath, 'discovery', 'README.md');
    const discoveryReadmeDest = join('.prompts', 'discovery', 'README.md');
    if (existsSync(discoveryReadmeSrc)) {
      mkdirSync(join('.prompts', 'discovery'), { recursive: true });
      try {
        cpSync(discoveryReadmeSrc, discoveryReadmeDest);
        totals.success++;
      }
      catch (err) {
        log.warning(`Skipped discovery/README.md: ${err instanceof Error ? err.message : String(err)}`);
        totals.errors++;
      }
    }
  }

  // Update extras (utilities, setup, root files)
  if (includeExtras) {
    log.merge('Extra directories:');
    for (const extraDir of EXTRA_PROMPT_DIRS) {
      const srcPath = join(templatePromptsPath, extraDir);
      const destPath = join('.prompts', extraDir);

      if (existsSync(srcPath)) {
        console.log(`  ${colors.cyan}${extraDir}/${colors.reset}`);
        const result = mergeDirectory(srcPath, destPath, '    ');
        totals.success += result.success;
        totals.errors += result.errors;
      }
    }

    // Also sync root files (README.md, us-qa-workflow.md, etc.)
    log.merge('Root files:');
    const items = readdirSync(templatePromptsPath, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) {
        const srcPath = join(templatePromptsPath, item.name);
        const destPath = join('.prompts', item.name);
        try {
          cpSync(srcPath, destPath);
          log.success(`  ${item.name}`);
          totals.success++;
        }
        catch (err) {
          log.warning(`  Skipped ${item.name}: ${err instanceof Error ? err.message : String(err)}`);
          totals.errors++;
        }
      }
    }
  }

  return totals;
}

function updateGuidelines(): MergeResult {
  log.step('Updating .context/guidelines/ (merge)...');

  const guidelinesPath = join(TEMP_DIR, '.context', 'guidelines');
  if (!existsSync(guidelinesPath)) {
    log.warning('.context/guidelines directory not found in template');
    return { success: 0, errors: 0 };
  }

  log.merge('Syncing guidelines...');
  return mergeDirectory(guidelinesPath, '.context/guidelines');
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

function updateTemplates(): MergeResult {
  log.step('Updating templates/ (merge)...');

  const templatesPath = join(TEMP_DIR, 'templates');
  if (!existsSync(templatesPath)) {
    log.warning('templates directory not found in template');
    return { success: 0, errors: 0 };
  }

  log.merge('Syncing templates...');
  return mergeDirectory(templatesPath, 'templates');
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
      { name: 'Prompts (.prompts/)', value: 'prompts' },
      { name: 'Guidelines (.context/guidelines/)', value: 'guidelines' },
      { name: 'Documentation (docs/)', value: 'docs' },
      { name: 'CLI Tools (cli/)', value: 'cli' },
      { name: 'Templates (templates/)', value: 'templates' },
      { name: 'VS Code Config (.vscode/)', value: 'vscode' },
      { name: 'Git Hooks (.husky/)', value: 'husky' },
      { name: 'Tooling (prettier, eslint, tsconfig)', value: 'tooling' },
      { name: 'Example Templates (.env.example, etc.)', value: 'examples' },
    ],
  });
}

async function showPromptsMenu(): Promise<PromptsConfig> {
  const { select } = await import('@inquirer/prompts');

  const mode = await select({
    message: 'What do you want to update?',
    choices: [
      { name: 'Everything (all stages + phases + extras)', value: 'all' },
      { name: 'By role preset...', value: 'role' },
      { name: 'QA Stages (1-5)...', value: 'stages' },
      { name: 'Discovery Phases (1-4)...', value: 'phases' },
      { name: 'Only extras (utilities, setup)', value: 'extras' },
    ],
  });

  switch (mode) {
    case 'all':
      return {
        stages: Object.keys(QA_STAGES),
        phases: Object.keys(DISCOVERY_PHASES),
        extras: true,
      };
    case 'role':
      return showRoleMenu();
    case 'stages':
      return showStagesMenu();
    case 'phases':
      return showPhasesMenu();
    case 'extras':
      return { stages: [], phases: [], extras: true };
    default:
      return { stages: [], phases: [], extras: false };
  }
}

async function showRoleMenu(): Promise<PromptsConfig> {
  const { select } = await import('@inquirer/prompts');

  const role = await select({
    message: 'Select a role preset:',
    choices: Object.entries(ROLE_PRESETS).map(([key, value]) => ({
      name: `${key.toUpperCase()} - ${value.description}`,
      value: key,
    })),
  });

  const preset = ROLE_PRESETS[role];
  return {
    stages: preset.stages || [],
    phases: preset.phases || [],
    extras: preset.extras || false,
  };
}

async function showStagesMenu(): Promise<PromptsConfig> {
  const { checkbox } = await import('@inquirer/prompts');

  const stages = await checkbox({
    message: 'Select QA stages to update: (SPACE to select, ENTER to confirm)',
    choices: Object.entries(QA_STAGES).map(([key, config]) => ({
      name: `${key}: ${config.name}`,
      value: key,
    })),
  });

  return { stages, phases: [], extras: false };
}

async function showPhasesMenu(): Promise<PromptsConfig> {
  const { checkbox } = await import('@inquirer/prompts');

  const phases = await checkbox({
    message: 'Select Discovery phases to update: (SPACE to select, ENTER to confirm)',
    choices: Object.entries(DISCOVERY_PHASES).map(([key, config]) => ({
      name: `${key}: ${config.name}`,
      value: key,
    })),
  });

  return { stages: [], phases, extras: false };
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
  prompts       Update .prompts/ (QA workflow prompts)
  guidelines    Update .context/guidelines/ (TAE, QA, MCP guides)
  docs          Update docs/ (documentation)
  cli           Update cli/ (CLI tools)
  templates     Update templates/ (sprint testing prompt, etc.)
  vscode        Update .vscode/ (IDE configuration)
  husky         Update .husky/ (Git hooks)
  tooling       Update config files (prettier, eslint, tsconfig)
  examples      Update example templates (.env.example, etc.)
  rollback      Restore from the most recent backup
  help          Show this help

${colors.bold}GLOBAL FLAGS:${colors.reset}
  --dry-run     Preview what would change without modifying files
  --rollback    Restore from the most recent backup

${colors.bold}FLAGS FOR 'prompts':${colors.reset}
  --all         All stages + phases + extras
  --stage N     Specific stages (e.g., --stage 4 or --stage 1,2,3)
  --phase N     Specific phases (e.g., --phase 1 or --phase 1,2)
  --role ROLE   By role preset (see available roles)
  --extras      Only extra directories (utilities, setup)

${colors.bold}AVAILABLE ROLES:${colors.reset}
  qa            ${colors.dim}-> Stages 1-5 (Full QA workflow)${colors.reset}
  qa-manual     ${colors.dim}-> Stages 1-3 (Manual testing only)${colors.reset}
  qa-automation ${colors.dim}-> Stages 4-5 (Automation + Regression)${colors.reset}
  discovery     ${colors.dim}-> Phases 1-4 (Project onboarding)${colors.reset}
  discovery-lite ${colors.dim}-> Phases 1-2 (Quick onboarding)${colors.reset}
  framework     ${colors.dim}-> Guidelines + CLI + docs${colors.reset}

${colors.bold}WHAT GETS SYNCED:${colors.reset}
  ${colors.green}  .prompts/${colors.reset}             QA workflow prompts
  ${colors.green}  .context/guidelines/${colors.reset}  Framework documentation
  ${colors.green}  docs/${colors.reset}                 General documentation
  ${colors.green}  cli/${colors.reset}                  CLI tools (auto-updates)
  ${colors.green}  templates/${colors.reset}            Sprint testing prompt, templates
  ${colors.green}  .vscode/${colors.reset}              IDE configuration
  ${colors.green}  .husky/${colors.reset}               Git hooks
  ${colors.green}  tooling${colors.reset}               editorconfig, prettier
  ${colors.green}  examples${colors.reset}              .mcp.example.json, dbhub.example.toml

${colors.bold}WHAT NEVER GETS SYNCED (project-specific):${colors.reset}
  ${colors.red}  .github/workflows/${colors.reset}    Your CI/CD pipelines
  ${colors.red}  config/${colors.reset}               Your environment config
  ${colors.red}  tests/${colors.reset}                Your test components
  ${colors.red}  playwright.config${colors.reset}     Your test config
  ${colors.red}  eslint.config.js${colors.reset}      Your linting rules
  ${colors.red}  tsconfig.json${colors.reset}         Your TypeScript config
  ${colors.red}  .env.example${colors.reset}          Your env variables
  ${colors.red}  CLAUDE.md${colors.reset}             Your AI memory
  ${colors.red}  README.md${colors.reset}             Your project docs
  ${colors.red}  package.json${colors.reset}          Your dependencies

${colors.bold}INTELLIGENT MERGE:${colors.reset}
  - Updates/adds files from template
  - Preserves your files not in template
  - Never deletes user-created content
  - Creates automatic backup before changes

${colors.bold}EXAMPLES:${colors.reset}
  bun run update                     ${colors.dim}# Interactive menu${colors.reset}
  bun run update all                 ${colors.dim}# Update everything${colors.reset}
  bun run update prompts --role qa   ${colors.dim}# All QA stages${colors.reset}
  bun run update prompts --stage 4,5 ${colors.dim}# Stages 4 and 5${colors.reset}
  bun run update cli guidelines      ${colors.dim}# Multiple components${colors.reset}
  bun run update all --dry-run       ${colors.dim}# Preview without changes${colors.reset}
  bun run update --rollback          ${colors.dim}# Restore last backup${colors.reset}
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
  const syncedDirs = ['.prompts', '.context/guidelines', 'docs', 'templates'];
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
  log.info('Or run this prompt in your AI assistant:\n');
  console.log(`   ${colors.cyan}@.prompts/utilities/context-engineering-setup.md${colors.reset}\n`);
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
${colors.yellow}║${colors.reset}  All prompts use ${colors.cyan}{{VARIABLE}}${colors.reset} placeholders that resolve    ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  from your CLAUDE.md configuration.                        ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  ${colors.bold}AFTER${colors.reset} this update completes, run this prompt:            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}    ${colors.green}@.prompts/utilities/context-engineering-setup.md${colors.reset}        ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  This will update your CLAUDE.md with the new variables     ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  table and configure it for your project.                   ${colors.yellow}║${colors.reset}
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
      ? ['prompts', 'guidelines', 'docs', 'cli', 'templates', 'vscode', 'husky', 'tooling', 'examples']
      : selected;

    createBackup(components);
    await cloneTemplate();

    selfUpdate();

    const totals: MergeResult = { success: 0, errors: 0 };
    const addResult = (r: MergeResult) => { totals.success += r.success; totals.errors += r.errors; };

    if (selected.includes('all')) {
      addResult(updatePrompts(Object.keys(QA_STAGES), Object.keys(DISCOVERY_PHASES), true));
      addResult(updateGuidelines());
      addResult(updateDocs());
      addResult(updateCli());
      addResult(updateTemplates());
      addResult(updateVscode());
      addResult(updateHusky());
      addResult(updateTooling());
      addResult(updateExamples());
    }
    else {
      for (const cmd of selected) {
        if (cmd === 'prompts') {
          const promptsConfig = await showPromptsMenu();
          addResult(updatePrompts(promptsConfig.stages, promptsConfig.phases, promptsConfig.extras));
        }
        else if (cmd === 'guidelines') {
          addResult(updateGuidelines());
        }
        else if (cmd === 'docs') {
          addResult(updateDocs());
        }
        else if (cmd === 'cli') {
          addResult(updateCli());
        }
        else if (cmd === 'templates') {
          addResult(updateTemplates());
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

  if (parsed.commands.length === 0) {
    log.error('No valid command specified');
    showHelp();
    process.exit(1);
  }

  await validatePrerequisites();
  checkMigrationNeeded();

  // Expand 'all' command
  if (parsed.commands.includes('all')) {
    parsed.commands = ['prompts', 'guidelines', 'docs', 'cli', 'templates', 'vscode', 'husky', 'tooling', 'examples'];
    parsed.all = true;
  }

  await cloneTemplate();

  // Dry-run mode: preview changes without modifying files
  if (parsed.dryRun) {
    executeDryRun(parsed.commands, parsed.all);
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
      case 'prompts':
        if (parsed.all) {
          addResult(updatePrompts(Object.keys(QA_STAGES), Object.keys(DISCOVERY_PHASES), true));
        }
        else if (parsed.stages || parsed.phases) {
          addResult(updatePrompts(parsed.stages || [], parsed.phases || [], parsed.extras));
        }
        else if (parsed.extras) {
          addResult(updatePrompts([], [], true));
        }
        else {
          await ensureDependencies();
          const promptsConfig = await showPromptsMenu();
          addResult(updatePrompts(promptsConfig.stages, promptsConfig.phases, promptsConfig.extras));
        }
        break;
      case 'guidelines':
        addResult(updateGuidelines());
        break;
      case 'docs':
        addResult(updateDocs());
        break;
      case 'cli':
        addResult(updateCli());
        break;
      case 'templates':
        addResult(updateTemplates());
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
