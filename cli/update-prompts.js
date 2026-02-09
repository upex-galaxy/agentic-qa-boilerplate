#!/usr/bin/env bun
/**
 * @fileoverview KATA Template Updater - CLI to sync projects with the template
 *
 * This script keeps derived projects synchronized with the official
 * KATA template (ai-driven-test-automation-boilerplate). Uses an "intelligent merge"
 * strategy that updates template files without deleting user's custom files.
 *
 * @description
 * Main features:
 * - Interactive menu for component selection
 * - Update by roles (QA, QA-Manual, QA-Automation, Discovery)
 * - Update by specific stages or phases
 * - Automatic backup system
 * - Intelligent merge (preserves user files)
 *
 * @requires gh - GitHub CLI must be installed and authenticated
 * @requires bun - JavaScript runtime (or compatible Node.js)
 *
 * @example
 * // Interactive menu
 * bun run update
 *
 * @example
 * // Update everything
 * bun run update all
 *
 * @example
 * // Update by role
 * bun run update prompts --role qa
 *
 * @see docs/workflows/update-guide.md - Complete usage guide
 *
 * @author UPEX Galaxy
 * @version 4.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ============================================================================
// CONFIGURATION
// ============================================================================

const TEMPLATE_REPO = 'upex-galaxy/ai-driven-test-automation-boilerplate';
const TEMP_DIR = path.join(os.tmpdir(), 'kata-template-update');

/**
 * Discovery phases configuration (one-time project onboarding)
 * Located in: .prompts/discovery/
 */
const DISCOVERY_PHASES = {
  'phase-1': { name: 'Constitution', dir: 'discovery/phase-1-constitution' },
  'phase-2': { name: 'Architecture', dir: 'discovery/phase-2-architecture' },
  'phase-3': { name: 'Infrastructure', dir: 'discovery/phase-3-infrastructure' },
  'phase-4': { name: 'Specification', dir: 'discovery/phase-4-specification' },
};

/**
 * QA Stages configuration (iterative QA workflow)
 * Located in: .prompts/stage-X-name/
 */
const QA_STAGES = {
  'stage-1': { name: 'Shift-Left Testing', dir: 'stage-1-shift-left' },
  'stage-2': { name: 'Exploratory Testing', dir: 'stage-2-exploratory' },
  'stage-3': { name: 'Test Documentation', dir: 'stage-3-documentation' },
  'stage-4': { name: 'Test Automation', dir: 'stage-4-automation' },
  'stage-5': { name: 'Shift-Right Testing', dir: 'stage-5-shift-right' },
};

/**
 * Extra directories in .prompts/
 */
const EXTRA_DIRS = ['context-generators', 'utilities'];

/**
 * Role-based presets for quick updates
 */
const ROLE_PRESETS = {
  qa: {
    stages: ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5'],
    description: 'All QA stages (Shift-Left → Automation → Shift-Right)',
  },
  'qa-manual': {
    stages: ['stage-1', 'stage-2', 'stage-3'],
    description: 'Manual QA (Shift-Left, Exploratory, Documentation)',
  },
  'qa-automation': {
    stages: ['stage-4', 'stage-5'],
    description: 'Automation only (Test Automation, Shift-Right)',
  },
  discovery: {
    phases: ['phase-1', 'phase-2', 'phase-3', 'phase-4'],
    description: 'Project onboarding (one-time setup)',
  },
  'discovery-lite': {
    phases: ['phase-1', 'phase-2'],
    description: 'Quick onboarding (Constitution + Architecture)',
  },
};

// ============================================================================
// TERMINAL COLORS
// ============================================================================

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function logHeader(message) {
  console.log(`\n${colors.bold}${colors.cyan}${message}${colors.reset}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function logStep(message) {
  console.log(`${colors.yellow}📦 ${message}${colors.reset}`);
}

function logMerge(message) {
  console.log(`${colors.magenta}🔀 ${message}${colors.reset}`);
}

// ============================================================================
// DEPENDENCY CHECK
// ============================================================================

function isPackageInstalled(packageName) {
  const nodeModulesPath = path.join(process.cwd(), 'node_modules', packageName);
  if (fs.existsSync(nodeModulesPath)) {
    return true;
  }

  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/');
    const scopedPath = path.join(process.cwd(), 'node_modules', scope, name);
    if (fs.existsSync(scopedPath)) {
      return true;
    }
  }

  return false;
}

function nativePrompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function ensureDependencies() {
  if (isPackageInstalled('@inquirer/prompts')) {
    return true;
  }

  console.log(`
${colors.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
${colors.bold}${colors.yellow}⚠️  Missing dependency: @inquirer/prompts${colors.reset}
${colors.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

This dependency is required for the ${colors.cyan}interactive menu${colors.reset}.

${colors.dim}Without it, you can only use direct commands like:${colors.reset}
  ${colors.green}bun run update all${colors.reset}              - Update everything
  ${colors.green}bun run update docs${colors.reset}             - Update docs/
  ${colors.green}bun run update prompts --role qa${colors.reset} - Update prompts for QA

${colors.bold}Do you want to install the dependency now?${colors.reset}
`);

  const answer = await nativePrompt(`${colors.cyan}[Y/n]:${colors.reset} `);

  if (answer === '' || answer === 'y' || answer === 'yes') {
    console.log(`\n${colors.blue}📦 Installing @inquirer/prompts...${colors.reset}\n`);

    try {
      execSync('bun add @inquirer/prompts', { stdio: 'inherit' });
      console.log(`
${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
${colors.bold}${colors.green}✅ Dependency installed successfully${colors.reset}
${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

You can now run the script again:

  ${colors.cyan}bun run update${colors.reset}          - Interactive menu
  ${colors.cyan}bun run update all${colors.reset}      - Update everything
  ${colors.cyan}bun run update help${colors.reset}     - See options

`);
      process.exit(0);
    } catch (error) {
      logError(`Error installing dependency: ${error.message}`);
      console.log(`\n${colors.yellow}Try installing manually:${colors.reset}`);
      console.log(`  ${colors.green}bun add @inquirer/prompts${colors.reset}\n`);
      process.exit(1);
    }
  } else {
    console.log(`\n${colors.yellow}Installation cancelled.${colors.reset}`);
    console.log(`\nYou can use direct commands without the interactive menu:`);
    console.log(`  ${colors.green}bun run update all${colors.reset}      - Update everything`);
    console.log(`  ${colors.green}bun run update help${colors.reset}     - See all options\n`);
    process.exit(0);
  }
}

// ============================================================================
// MERGE UTILITIES
// ============================================================================

function mergeDirectory(srcDir, destDir, prefix = '') {
  fs.mkdirSync(destDir, { recursive: true });

  const items = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const item of items) {
    const srcPath = path.join(srcDir, item.name);
    const destPath = path.join(destDir, item.name);

    if (item.isDirectory()) {
      mergeDirectory(srcPath, destPath, prefix + '  ');
      logSuccess(`${prefix}${item.name}/`);
    } else {
      fs.cpSync(srcPath, destPath);
      logSuccess(`${prefix}${item.name}`);
    }
  }
}

// ============================================================================
// HELP
// ============================================================================

function showHelp() {
  console.log(`
${colors.bold}${colors.cyan}📦 KATA Template Updater - Help${colors.reset}

${colors.bold}USAGE:${colors.reset}
  bun run update                    ${colors.dim}# Interactive menu${colors.reset}
  bun run update <command> [options] ${colors.dim}# Direct execution${colors.reset}

${colors.bold}COMMANDS:${colors.reset}
  all           Update everything (full merge of all directories)
  prompts       Update .prompts/ (interactive menu or with flags)
  docs          Update docs/ (full directory merge)
  context       Update .context/ (full directory merge)
  templates     Update templates/mcp/ (full directory merge)
  scripts       Update scripts/ (full directory merge)
  help          Show this help

${colors.bold}FLAGS FOR 'prompts':${colors.reset}
  --all         All stages + phases + extras
  --stage N     Specific stages (e.g., --stage 1 or --stage 1,2,3)
  --phase N     Specific phases (e.g., --phase 1 or --phase 1,2)
  --role ROLE   By role preset (see available roles)
  --extras      Only extra directories (context-generators, utilities)

${colors.bold}AVAILABLE ROLES:${colors.reset}
  qa            ${colors.dim}-> Stages 1-5 (Full QA workflow)${colors.reset}
  qa-manual     ${colors.dim}-> Stages 1-3 (Manual testing only)${colors.reset}
  qa-automation ${colors.dim}-> Stages 4-5 (Automation + Shift-Right)${colors.reset}
  discovery     ${colors.dim}-> Phases 1-4 (Project onboarding)${colors.reset}
  discovery-lite ${colors.dim}-> Phases 1-2 (Quick onboarding)${colors.reset}

${colors.bold}INTELLIGENT MERGE:${colors.reset}
  This script syncs ALL files from the template:
  - Updates/adds any file that exists in the template
  - Preserves files/folders created by the user (not in template)
  - Never deletes anything that doesn't exist in the template
  - No hardcoded lists: new template files are automatically included

${colors.bold}EXAMPLES:${colors.reset}
  bun run update                    ${colors.dim}# Interactive menu${colors.reset}
  bun run update all                ${colors.dim}# Update everything${colors.reset}
  bun run update prompts            ${colors.dim}# Menu to choose stages/phases${colors.reset}
  bun run update prompts --role qa  ${colors.dim}# All QA stages${colors.reset}
  bun run update prompts --stage 4,5 ${colors.dim}# Stages 4 and 5${colors.reset}
  bun run update prompts --phase 1,2 ${colors.dim}# Phases 1 and 2${colors.reset}
  bun run update docs context       ${colors.dim}# Multiple components${colors.reset}
`);
}

// ============================================================================
// INTERACTIVE MENUS
// ============================================================================

async function showMainMenu() {
  const { checkbox } = await import('@inquirer/prompts');

  return await checkbox({
    message: 'What do you want to update?',
    instructions: '(Use arrows, SPACE to select, ENTER to confirm)',
    choices: [
      { name: 'Everything (all)', value: 'all' },
      { name: 'Prompts (.prompts/)', value: 'prompts' },
      { name: 'Documentation (docs/)', value: 'docs' },
      { name: 'Context (.context/)', value: 'context' },
      { name: 'MCP Templates (templates/mcp/)', value: 'templates' },
      { name: 'Update scripts', value: 'scripts' },
    ],
  });
}

async function showPromptsMenu() {
  const { select } = await import('@inquirer/prompts');

  const mode = await select({
    message: 'What do you want to update?',
    choices: [
      { name: 'Everything (all stages + phases + extras)', value: 'all' },
      { name: 'By role preset...', value: 'role' },
      { name: 'QA Stages (1-5)...', value: 'stages' },
      { name: 'Discovery Phases (1-4)...', value: 'phases' },
      { name: 'Only extras (context-generators, utilities)', value: 'extras' },
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
      return await showRoleMenu();
    case 'stages':
      return await showStagesMenu();
    case 'phases':
      return await showPhasesMenu();
    case 'extras':
      return { stages: [], phases: [], extras: true };
  }
}

async function showRoleMenu() {
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
    extras: false,
  };
}

async function showStagesMenu() {
  const { checkbox } = await import('@inquirer/prompts');

  const stages = await checkbox({
    message: 'Select QA stages to update:',
    instructions: '(SPACE to select, ENTER to confirm)',
    choices: Object.entries(QA_STAGES).map(([key, config]) => ({
      name: `${key}: ${config.name}`,
      value: key,
    })),
  });

  return { stages, phases: [], extras: false };
}

async function showPhasesMenu() {
  const { checkbox } = await import('@inquirer/prompts');

  const phases = await checkbox({
    message: 'Select Discovery phases to update:',
    instructions: '(SPACE to select, ENTER to confirm)',
    choices: Object.entries(DISCOVERY_PHASES).map(([key, config]) => ({
      name: `${key}: ${config.name}`,
      value: key,
    })),
  });

  return { stages: [], phases, extras: false };
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(args) {
  const result = {
    commands: [],
    stages: null,
    phases: null,
    role: null,
    extras: false,
    all: false,
    help: false,
  };

  const validCommands = ['all', 'prompts', 'docs', 'context', 'templates', 'scripts', 'help'];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === 'help' || arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--all') {
      result.all = true;
    } else if (arg === '--extras') {
      result.extras = true;
    } else if (arg === '--stage' || arg === '--stages') {
      const nextArg = args[++i];
      if (nextArg) {
        result.stages = nextArg
          .split(',')
          .map(n => `stage-${n}`)
          .filter(s => QA_STAGES[s]);
      }
    } else if (arg === '--phase' || arg === '--phases') {
      const nextArg = args[++i];
      if (nextArg) {
        result.phases = nextArg
          .split(',')
          .map(n => `phase-${n}`)
          .filter(p => DISCOVERY_PHASES[p]);
      }
    } else if (arg === '--role') {
      const nextArg = args[++i];
      if (nextArg && ROLE_PRESETS[nextArg]) {
        result.role = nextArg;
        const preset = ROLE_PRESETS[nextArg];
        result.stages = preset.stages || [];
        result.phases = preset.phases || [];
      } else if (nextArg) {
        logError(`Unknown role: ${nextArg}`);
        logInfo(`Available roles: ${Object.keys(ROLE_PRESETS).join(', ')}`);
        process.exit(1);
      }
    } else if (validCommands.includes(arg)) {
      result.commands.push(arg);
    } else if (!arg.startsWith('-')) {
      logWarning(`Unknown command: ${arg}`);
    }
  }

  return result;
}

// ============================================================================
// PREREQUISITES
// ============================================================================

function checkCommand(command, name) {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    logError(`${name} is not installed`);
    return false;
  }
}

async function validatePrerequisites() {
  if (!checkCommand('gh', 'GitHub CLI (gh)')) {
    console.log('\nInstall it with:');
    if (process.platform === 'darwin') {
      console.log('  brew install gh');
    } else if (process.platform === 'win32') {
      console.log('  winget install GitHub.cli');
    } else {
      console.log('  sudo apt install gh  # Ubuntu/Debian');
      console.log('  Or visit: https://cli.github.com/');
    }
    process.exit(1);
  }

  try {
    execSync('gh auth status', { stdio: 'ignore' });
  } catch {
    logWarning('You are not authenticated with GitHub CLI');
    console.log('Run: gh auth login');
    process.exit(1);
  }
}

// ============================================================================
// BACKUP
// ============================================================================

function createBackup(components) {
  logStep('Creating backup...');

  const timestamp =
    new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] +
    '-' +
    new Date().toTimeString().split(' ')[0].replace(/:/g, '');
  const backupDir = path.join('.backups', `update-${timestamp}`);

  fs.mkdirSync(backupDir, { recursive: true });

  const backupMap = {
    prompts: { src: '.prompts', dest: '.prompts' },
    docs: { src: 'docs', dest: 'docs' },
    context: { src: '.context', dest: '.context' },
    templates: { src: 'templates/mcp', dest: 'templates/mcp' },
    scripts: { src: 'scripts', dest: 'scripts' },
  };

  for (const comp of components) {
    const mapping = backupMap[comp];
    if (mapping && fs.existsSync(mapping.src)) {
      const destPath = path.join(backupDir, mapping.dest);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.cpSync(mapping.src, destPath, { recursive: true });
    }
  }

  logSuccess(`Backup saved to: ${backupDir}`);
  return backupDir;
}

// ============================================================================
// CLONE TEMPLATE
// ============================================================================

async function cloneTemplate() {
  logStep('Downloading latest version of the template...');
  console.log(`${colors.dim}  Repo: ${TEMPLATE_REPO}${colors.reset}`);
  console.log(`${colors.dim}  Temp destination: ${TEMP_DIR}${colors.reset}`);

  if (fs.existsSync(TEMP_DIR)) {
    console.log(`${colors.dim}  Cleaning previous temp directory...${colors.reset}`);
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  console.log(`${colors.dim}  Verifying GitHub CLI authentication...${colors.reset}`);
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    console.log(`${colors.green}  ✓ GitHub CLI authenticated${colors.reset}`);
  } catch {
    logError('GitHub CLI is not authenticated');
    console.log(`\n${colors.yellow}Run first:${colors.reset}`);
    console.log(`  ${colors.cyan}gh auth login${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`${colors.dim}  Cloning repository (this may take a few seconds)...${colors.reset}`);

  try {
    const cloneCommand = `gh repo clone ${TEMPLATE_REPO} "${TEMP_DIR}" -- --depth 1 --quiet`;
    execSync(cloneCommand, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    console.log(`${colors.green}  ✓ Template downloaded successfully${colors.reset}`);
  } catch (error) {
    if (error.killed) {
      logError('Timeout: Download took too long (>60s)');
      console.log(`${colors.yellow}Possible causes:${colors.reset}`);
      console.log('  • Slow internet connection');
      console.log('  • GitHub issues');
      console.log(`\n${colors.yellow}Try running manually:${colors.reset}`);
      console.log(`  ${colors.cyan}gh repo clone ${TEMPLATE_REPO}${colors.reset}\n`);
    } else {
      logError('Error downloading the template');
      console.log(`${colors.yellow}Possible causes:${colors.reset}`);
      console.log('  • You do not have access to the UPEX Galaxy private repository');
      console.log('  • Internet connection issues');
      console.log('  • GitHub CLI not configured correctly');
      console.log(`\n${colors.yellow}Verify your access:${colors.reset}`);
      console.log(`  ${colors.cyan}gh repo view ${TEMPLATE_REPO}${colors.reset}\n`);
    }
    process.exit(1);
  }
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

function updatePrompts(stages, phases, includeExtras) {
  logStep('Updating .prompts/ (merge)...');

  const templatePromptsPath = path.join(TEMP_DIR, '.prompts');
  if (!fs.existsSync(templatePromptsPath)) {
    logWarning('.prompts directory not found in template');
    return;
  }

  fs.mkdirSync('.prompts', { recursive: true });

  // Check if this is a full update
  const allStages = Object.keys(QA_STAGES);
  const allPhases = Object.keys(DISCOVERY_PHASES);
  const isFullUpdate =
    includeExtras &&
    stages.length === allStages.length &&
    allStages.every(s => stages.includes(s)) &&
    phases.length === allPhases.length &&
    allPhases.every(p => phases.includes(p));

  if (isFullUpdate) {
    logMerge('Syncing full directory...');
    mergeDirectory(templatePromptsPath, '.prompts');
    return;
  }

  // Update specific stages
  if (stages && stages.length > 0) {
    logMerge('QA Stages:');
    for (const stageKey of stages) {
      const stageConfig = QA_STAGES[stageKey];
      if (!stageConfig) continue;

      const srcPath = path.join(templatePromptsPath, stageConfig.dir);
      const destPath = path.join('.prompts', stageConfig.dir);

      if (fs.existsSync(srcPath)) {
        console.log(`  ${colors.cyan}${stageKey}: ${stageConfig.name}${colors.reset}`);
        mergeDirectory(srcPath, destPath, '    ');
      } else {
        logWarning(`${stageKey} not found in template`);
      }
    }
  }

  // Update specific phases
  if (phases && phases.length > 0) {
    logMerge('Discovery Phases:');
    for (const phaseKey of phases) {
      const phaseConfig = DISCOVERY_PHASES[phaseKey];
      if (!phaseConfig) continue;

      const srcPath = path.join(templatePromptsPath, phaseConfig.dir);
      const destPath = path.join('.prompts', phaseConfig.dir);

      if (fs.existsSync(srcPath)) {
        console.log(`  ${colors.cyan}${phaseKey}: ${phaseConfig.name}${colors.reset}`);
        mergeDirectory(srcPath, destPath, '    ');
      } else {
        logWarning(`${phaseKey} not found in template`);
      }
    }

    // Also sync the discovery parent directory README if exists
    const discoveryReadmeSrc = path.join(templatePromptsPath, 'discovery', 'README.md');
    const discoveryReadmeDest = path.join('.prompts', 'discovery', 'README.md');
    if (fs.existsSync(discoveryReadmeSrc)) {
      fs.mkdirSync(path.join('.prompts', 'discovery'), { recursive: true });
      fs.cpSync(discoveryReadmeSrc, discoveryReadmeDest);
    }
  }

  // Update extras
  if (includeExtras) {
    logMerge('Extra directories:');
    for (const extraDir of EXTRA_DIRS) {
      const srcPath = path.join(templatePromptsPath, extraDir);
      const destPath = path.join('.prompts', extraDir);

      if (fs.existsSync(srcPath)) {
        console.log(`  ${colors.cyan}${extraDir}/${colors.reset}`);
        mergeDirectory(srcPath, destPath, '    ');
      }
    }

    // Also sync root files (README.md, us-qa-workflow.md, etc.)
    logMerge('Root files:');
    const items = fs.readdirSync(templatePromptsPath, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) {
        const srcPath = path.join(templatePromptsPath, item.name);
        const destPath = path.join('.prompts', item.name);
        fs.cpSync(srcPath, destPath);
        logSuccess(`  ${item.name}`);
      }
    }
  }
}

function updateDocs() {
  logStep('Updating docs/ (merge)...');

  const docsPath = path.join(TEMP_DIR, 'docs');
  if (!fs.existsSync(docsPath)) {
    logWarning('docs directory not found in template');
    return;
  }

  logMerge('Syncing full directory...');
  mergeDirectory(docsPath, 'docs');
}

function updateContext() {
  logStep('Updating .context/ (merge)...');

  const contextPath = path.join(TEMP_DIR, '.context');
  if (!fs.existsSync(contextPath)) {
    logWarning('.context directory not found in template');
    return;
  }

  logMerge('Syncing full directory...');
  mergeDirectory(contextPath, '.context');
}

function updateTemplates() {
  logStep('Updating templates/mcp/ (merge)...');

  const templatesPath = path.join(TEMP_DIR, 'templates', 'mcp');
  if (!fs.existsSync(templatesPath)) {
    logWarning('templates/mcp directory not found in template');
    return;
  }

  mergeDirectory(templatesPath, 'templates/mcp');
}

function updateScripts() {
  logStep('Updating scripts/ (merge)...');

  const scriptsPath = path.join(TEMP_DIR, 'scripts');
  if (!fs.existsSync(scriptsPath)) {
    logWarning('scripts directory not found in template');
    return;
  }

  logMerge('Syncing full directory...');
  mergeDirectory(scriptsPath, 'scripts');
}

function selfUpdate() {
  const currentScriptPath = path.join(process.cwd(), 'scripts', 'update-template.js');
  const templateScriptPath = path.join(TEMP_DIR, 'scripts', 'update-template.js');

  if (!fs.existsSync(templateScriptPath)) {
    return false;
  }

  const currentContent = fs.existsSync(currentScriptPath)
    ? fs.readFileSync(currentScriptPath, 'utf-8')
    : '';
  const templateContent = fs.readFileSync(templateScriptPath, 'utf-8');

  if (currentContent !== templateContent) {
    logStep('Auto-updating update-template.js...');
    fs.mkdirSync('scripts', { recursive: true });
    fs.cpSync(templateScriptPath, currentScriptPath);
    logSuccess('update-template.js updated to latest version');
    return true;
  }

  return false;
}

function cleanup() {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  logHeader('📦 KATA Template Updater');
  logInfo('Using intelligent merge (preserves user files)');

  // No arguments -> Interactive menu
  if (args.length === 0) {
    const depsReady = await ensureDependencies();
    if (!depsReady) return;

    const selected = await showMainMenu();

    if (selected.length === 0) {
      logWarning('Nothing selected. Exiting...');
      process.exit(0);
    }

    await validatePrerequisites();

    const components = selected.includes('all')
      ? ['prompts', 'docs', 'context', 'templates', 'scripts']
      : selected;

    createBackup(components);
    await cloneTemplate();

    selfUpdate();

    if (selected.includes('all')) {
      updatePrompts(Object.keys(QA_STAGES), Object.keys(DISCOVERY_PHASES), true);
      updateDocs();
      updateContext();
      updateTemplates();
      updateScripts();
    } else {
      for (const cmd of selected) {
        if (cmd === 'prompts') {
          const promptsConfig = await showPromptsMenu();
          updatePrompts(promptsConfig.stages, promptsConfig.phases, promptsConfig.extras);
        } else if (cmd === 'docs') {
          updateDocs();
        } else if (cmd === 'context') {
          updateContext();
        } else if (cmd === 'templates') {
          updateTemplates();
        } else if (cmd === 'scripts') {
          updateScripts();
        }
      }
    }

    cleanup();
    logHeader('✅ Update completed!');
    logInfo('Your custom files have been preserved.');
    return;
  }

  // Parse arguments
  const parsed = parseArgs(args);

  if (parsed.help) {
    showHelp();
    process.exit(0);
  }

  if (parsed.commands.length === 0) {
    logError('No valid command specified');
    showHelp();
    process.exit(1);
  }

  await validatePrerequisites();

  // Expand 'all' command
  if (parsed.commands.includes('all')) {
    parsed.commands = ['prompts', 'docs', 'context', 'templates', 'scripts'];
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
        } else if (parsed.stages || parsed.phases) {
          updatePrompts(parsed.stages || [], parsed.phases || [], parsed.extras);
        } else if (parsed.extras) {
          updatePrompts([], [], true);
        } else {
          const depsReady = await ensureDependencies();
          if (!depsReady) return;

          const promptsConfig = await showPromptsMenu();
          updatePrompts(promptsConfig.stages, promptsConfig.phases, promptsConfig.extras);
        }
        break;
      case 'docs':
        updateDocs();
        break;
      case 'context':
        updateContext();
        break;
      case 'templates':
        updateTemplates();
        break;
      case 'scripts':
        updateScripts();
        break;
    }
  }

  cleanup();
  logHeader('✅ Update completed!');
  logInfo('Your custom files have been preserved.');
}

main().catch(error => {
  logError('Unexpected error:');
  console.error(error);
  process.exit(1);
});
