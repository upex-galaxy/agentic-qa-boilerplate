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
 *   templates/mcp/      MCP configuration templates
 *   .vscode/            IDE configuration (extensions, settings)
 *   .husky/             Git hooks
 *   tooling/            Config files (prettier, eslint, tsconfig, editorconfig)
 *   examples/           Example templates (.env.example, .mcp.example.json, etc.)
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
 *   bun run update templates        Update templates/mcp/
 *   bun run update vscode           Update .vscode/
 *   bun run update husky            Update .husky/
 *   bun run update tooling          Update config files (prettier, eslint, etc.)
 *   bun run update examples         Update example templates
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
 * @version 5.0
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

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
}

interface PromptsConfig {
  stages: string[]
  phases: string[]
  extras: boolean
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
  };

  const validCommands = ['all', 'prompts', 'guidelines', 'docs', 'cli', 'templates', 'vscode', 'husky', 'tooling', 'examples', 'help'];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === 'help' || arg === '--help' || arg === '-h') {
      result.help = true;
    }
    else if (arg === '--all') {
      result.all = true;
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
    templates: { src: 'templates/mcp', dest: 'templates/mcp' },
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

function mergeDirectory(srcDir: string, destDir: string, prefix = ''): void {
  mkdirSync(destDir, { recursive: true });

  const items = readdirSync(srcDir, { withFileTypes: true });

  for (const item of items) {
    const srcPath = join(srcDir, item.name);
    const destPath = join(destDir, item.name);

    if (item.isDirectory()) {
      mergeDirectory(srcPath, destPath, `${prefix}  `);
      log.success(`${prefix}${item.name}/`);
    }
    else {
      cpSync(srcPath, destPath);
      log.success(`${prefix}${item.name}`);
    }
  }
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

function updatePrompts(stages: string[], phases: string[], includeExtras: boolean): void {
  log.step('Updating .prompts/ (merge)...');

  const templatePromptsPath = join(TEMP_DIR, '.prompts');
  if (!existsSync(templatePromptsPath)) {
    log.warning('.prompts directory not found in template');
    return;
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
    mergeDirectory(templatePromptsPath, '.prompts');
    return;
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
        mergeDirectory(srcPath, destPath, '    ');
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
        mergeDirectory(srcPath, destPath, '    ');
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
      cpSync(discoveryReadmeSrc, discoveryReadmeDest);
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
        mergeDirectory(srcPath, destPath, '    ');
      }
    }

    // Also sync root files (README.md, us-qa-workflow.md, etc.)
    log.merge('Root files:');
    const items = readdirSync(templatePromptsPath, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) {
        const srcPath = join(templatePromptsPath, item.name);
        const destPath = join('.prompts', item.name);
        cpSync(srcPath, destPath);
        log.success(`  ${item.name}`);
      }
    }
  }
}

function updateGuidelines(): void {
  log.step('Updating .context/guidelines/ (merge)...');

  const guidelinesPath = join(TEMP_DIR, '.context', 'guidelines');
  if (!existsSync(guidelinesPath)) {
    log.warning('.context/guidelines directory not found in template');
    return;
  }

  log.merge('Syncing guidelines...');
  mergeDirectory(guidelinesPath, '.context/guidelines');
}

function updateDocs(): void {
  log.step('Updating docs/ (merge)...');

  const docsPath = join(TEMP_DIR, 'docs');
  if (!existsSync(docsPath)) {
    log.warning('docs directory not found in template');
    return;
  }

  log.merge('Syncing full directory...');
  mergeDirectory(docsPath, 'docs');
}

function updateCli(): void {
  log.step('Updating cli/ (merge)...');

  const cliPath = join(TEMP_DIR, 'cli');
  if (!existsSync(cliPath)) {
    log.warning('cli directory not found in template');
    return;
  }

  log.merge('Syncing CLI tools...');
  mergeDirectory(cliPath, 'cli');
}

function updateTemplates(): void {
  log.step('Updating templates/mcp/ (merge)...');

  const templatesPath = join(TEMP_DIR, 'templates', 'mcp');
  if (!existsSync(templatesPath)) {
    log.warning('templates/mcp directory not found in template');
    return;
  }

  log.merge('Syncing MCP templates...');
  mergeDirectory(templatesPath, 'templates/mcp');
}

function updateVscode(): void {
  log.step('Updating .vscode/ (merge)...');

  const vscodePath = join(TEMP_DIR, '.vscode');
  if (!existsSync(vscodePath)) {
    log.warning('.vscode directory not found in template');
    return;
  }

  log.merge('Syncing VS Code configuration...');
  mergeDirectory(vscodePath, '.vscode');
}

function updateHusky(): void {
  log.step('Updating .husky/ (merge)...');

  const huskyPath = join(TEMP_DIR, '.husky');
  if (!existsSync(huskyPath)) {
    log.warning('.husky directory not found in template');
    return;
  }

  log.merge('Syncing Git hooks...');
  mergeDirectory(huskyPath, '.husky');
}

/**
 * Config files that are universal across all KATA projects
 */
const TOOLING_FILES = [
  '.editorconfig',
  '.prettierrc',
  '.prettierignore',
  'eslint.config.js',
  'tsconfig.json',
];

function updateTooling(): void {
  log.step('Updating tooling config files...');

  log.merge('Syncing config files...');
  for (const file of TOOLING_FILES) {
    const srcPath = join(TEMP_DIR, file);
    if (existsSync(srcPath)) {
      cpSync(srcPath, file);
      log.success(file);
    }
    else {
      log.warning(`${file} not found in template`);
    }
  }
}

/**
 * Example/template files that help users configure their project
 */
const EXAMPLE_FILES = [
  '.env.example',
  '.mcp.example.json',
  'dbhub.example.toml',
];

function updateExamples(): void {
  log.step('Updating example templates...');

  log.merge('Syncing example files...');
  for (const file of EXAMPLE_FILES) {
    const srcPath = join(TEMP_DIR, file);
    if (existsSync(srcPath)) {
      cpSync(srcPath, file);
      log.success(file);
    }
    else {
      log.warning(`${file} not found in template`);
    }
  }
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
    log.step('Auto-updating update-boilerplate.ts...');
    mkdirSync('cli', { recursive: true });
    cpSync(templateScriptPath, currentScriptPath);
    log.success('update-boilerplate.ts updated to latest version');
    return true;
  }

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
      { name: 'MCP Templates (templates/mcp/)', value: 'templates' },
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
  templates     Update templates/mcp/ (MCP configs)
  vscode        Update .vscode/ (IDE configuration)
  husky         Update .husky/ (Git hooks)
  tooling       Update config files (prettier, eslint, tsconfig)
  examples      Update example templates (.env.example, etc.)
  help          Show this help

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
  ${colors.green}  templates/mcp/${colors.reset}        MCP configuration templates
  ${colors.green}  .vscode/${colors.reset}              IDE configuration
  ${colors.green}  .husky/${colors.reset}               Git hooks
  ${colors.green}  tooling${colors.reset}               prettier, eslint, tsconfig, editorconfig
  ${colors.green}  examples${colors.reset}              .env.example, .mcp.example.json, dbhub.example.toml

${colors.bold}WHAT NEVER GETS SYNCED (project-specific):${colors.reset}
  ${colors.red}  .github/workflows/${colors.reset}    Your CI/CD pipelines
  ${colors.red}  config/${colors.reset}               Your environment config
  ${colors.red}  tests/${colors.reset}                Your test components
  ${colors.red}  playwright.config${colors.reset}     Your test config
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
`);
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

    const components = selected.includes('all')
      ? ['prompts', 'guidelines', 'docs', 'cli', 'templates', 'vscode', 'husky', 'tooling', 'examples']
      : selected;

    createBackup(components);
    await cloneTemplate();

    selfUpdate();

    if (selected.includes('all')) {
      updatePrompts(Object.keys(QA_STAGES), Object.keys(DISCOVERY_PHASES), true);
      updateGuidelines();
      updateDocs();
      updateCli();
      updateTemplates();
      updateVscode();
      updateHusky();
      updateTooling();
      updateExamples();
    }
    else {
      for (const cmd of selected) {
        if (cmd === 'prompts') {
          const promptsConfig = await showPromptsMenu();
          updatePrompts(promptsConfig.stages, promptsConfig.phases, promptsConfig.extras);
        }
        else if (cmd === 'guidelines') {
          updateGuidelines();
        }
        else if (cmd === 'docs') {
          updateDocs();
        }
        else if (cmd === 'cli') {
          updateCli();
        }
        else if (cmd === 'templates') {
          updateTemplates();
        }
        else if (cmd === 'vscode') {
          updateVscode();
        }
        else if (cmd === 'husky') {
          updateHusky();
        }
        else if (cmd === 'tooling') {
          updateTooling();
        }
        else if (cmd === 'examples') {
          updateExamples();
        }
      }
    }

    cleanup();
    log.header('  Update completed!');
    log.info('Your custom files have been preserved.');
    return;
  }

  // Parse arguments
  const parsed = parseArgs(args);

  if (parsed.help) {
    showHelp();
    process.exit(0);
  }

  if (parsed.commands.length === 0) {
    log.error('No valid command specified');
    showHelp();
    process.exit(1);
  }

  await validatePrerequisites();

  // Expand 'all' command
  if (parsed.commands.includes('all')) {
    parsed.commands = ['prompts', 'guidelines', 'docs', 'cli', 'templates', 'vscode', 'husky', 'tooling', 'examples'];
    parsed.all = true;
  }

  createBackup(parsed.commands);
  await cloneTemplate();

  selfUpdate();

  // Execute commands
  for (const cmd of parsed.commands) {
    switch (cmd) {
      case 'prompts':
        if (parsed.all) {
          updatePrompts(Object.keys(QA_STAGES), Object.keys(DISCOVERY_PHASES), true);
        }
        else if (parsed.stages || parsed.phases) {
          updatePrompts(parsed.stages || [], parsed.phases || [], parsed.extras);
        }
        else if (parsed.extras) {
          updatePrompts([], [], true);
        }
        else {
          await ensureDependencies();
          const promptsConfig = await showPromptsMenu();
          updatePrompts(promptsConfig.stages, promptsConfig.phases, promptsConfig.extras);
        }
        break;
      case 'guidelines':
        updateGuidelines();
        break;
      case 'docs':
        updateDocs();
        break;
      case 'cli':
        updateCli();
        break;
      case 'templates':
        updateTemplates();
        break;
      case 'vscode':
        updateVscode();
        break;
      case 'husky':
        updateHusky();
        break;
      case 'tooling':
        updateTooling();
        break;
      case 'examples':
        updateExamples();
        break;
    }
  }

  cleanup();
  log.header('  Update completed!');
  log.info('Your custom files have been preserved.');
}

main().catch((error) => {
  log.error('Unexpected error:');
  console.error(error);
  process.exit(1);
});
