import pc from 'picocolors';

import { CliError } from './errors.ts';
import { headline } from './tui.ts';

export interface Args {
  projectName?: string
  here: boolean
  template: string
  templateRepo: string
  projectKey?: string
  noInstall: boolean
  noSetup: boolean
  noGit: boolean
  nonInteractive: boolean
  help: boolean
  version: boolean
  menu: boolean
  noBanner: boolean
}

const DEFAULTS: Args = {
  here: false,
  template: 'main',
  templateRepo: 'upex-galaxy/agentic-qa-boilerplate',
  noInstall: false,
  noSetup: false,
  noGit: false,
  nonInteractive: !process.stdin.isTTY,
  help: false,
  version: false,
  menu: false,
  noBanner: false,
};

export function parseArgs(argv: readonly string[]): Args {
  const out: Args = { ...DEFAULTS };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--help':
      case '-h':
        out.help = true;
        break;
      case '--version':
      case '-v':
        out.version = true;
        break;
      case '--here':
        out.here = true;
        break;
      case '--no-install':
        out.noInstall = true;
        break;
      case '--no-setup':
        out.noSetup = true;
        break;
      case '--no-git':
        out.noGit = true;
        break;
      case '--non-interactive':
        out.nonInteractive = true;
        break;
      case '--menu':
        out.menu = true;
        break;
      case '--no-banner':
        out.noBanner = true;
        break;
      case '--template':
        out.template = requireValue(argv, ++i, '--template');
        break;
      case '--template-repo':
        out.templateRepo = requireValue(argv, ++i, '--template-repo');
        break;
      case '--project-key':
        out.projectKey = requireValue(argv, ++i, '--project-key');
        break;
      default:
        if (arg.startsWith('--')) {
          throw new CliError('USAGE', `Unknown flag: ${arg}`);
        }
        positionals.push(arg);
    }
  }

  if (positionals.length > 1) {
    throw new CliError('USAGE', `Too many positional arguments: ${positionals.join(' ')}`);
  }
  if (positionals.length === 1) {
    out.projectName = positionals[0];
  }

  // Only throw in non-interactive mode (piped / CI); in a TTY the menu handles
  // missing project names interactively. `isTTY` is undefined when there is no
  // TTY at all (CI), so use !isTTY to catch both false and undefined.
  if (!out.projectName && !out.here && !out.help && !out.version && !process.stdin.isTTY) {
    throw new CliError(
      'USAGE',
      'missing required project name.',
      'Usage:\n  bunx create-agentic-qa <project-name>\n  bunx create-agentic-qa --here          # use current directory',
    );
  }

  return out;
}

function requireValue(argv: readonly string[], idx: number, flag: string): string {
  const v = argv[idx];
  if (!v || v.startsWith('--')) {
    throw new CliError('USAGE', `Flag ${flag} requires a value.`);
  }
  return v;
}

export function printHelp(): void {
  process.stdout.write(`${headline('create-agentic-qa')}\n`);
  process.stdout.write('scaffolder for the Agentic QA ecosystem\n\n');

  process.stdout.write(pc.bold('Usage:\n'));
  process.stdout.write(`  ${pc.cyan('bunx create-agentic-qa <project-name> [flags]')}\n`);
  process.stdout.write(`  ${pc.cyan('bunx create-agentic-qa --here')}                  # use current directory\n\n`);

  process.stdout.write(pc.bold('Flags:\n'));
  const flags = [
    ['--here', 'Bootstrap into the current directory, or run setup if already bootstrapped.'],
    ['--template <ref>', 'Branch/tag/SHA of the template (default: main).'],
    ['--template-repo <owner/repo>', 'Override template upstream (default: upex-galaxy/agentic-qa-boilerplate).'],
    ['--project-key <KEY>', 'Jira project key (optional; prompted if omitted).'],
    ['--no-install', 'Skip "bun install".'],
    ['--no-setup', 'Skip "bun run setup".'],
    ['--no-git', 'Skip git init + initial commit.'],
    ['--non-interactive', 'Use safe defaults; no prompts.'],
    ['--menu', 'Force the interactive menu even when args are provided.'],
    ['--no-banner', 'Suppress the logo (useful for CI / piped output).'],
    ['--help, -h', 'Print this help.'],
    ['--version, -v', 'Print CLI version.'],
  ];
  const maxFlag = flags.reduce((m, [f]) => Math.max(m, f.length), 0);
  for (const [flag, desc] of flags) {
    process.stdout.write(`  ${pc.cyan(flag.padEnd(maxFlag))}  ${desc}\n`);
  }

  process.stdout.write(`\n${pc.bold('Examples:\n')}`);
  process.stdout.write(`  ${pc.cyan('bunx create-agentic-qa my-app')}\n`);
  process.stdout.write(`  ${pc.cyan('bunx create-agentic-qa my-app --project-key ACME')}\n`);
  process.stdout.write(`  ${pc.cyan('bunx create-agentic-qa --here')}\n`);
  process.stdout.write(`  ${pc.cyan('bunx create-agentic-qa fork --template-repo my-fork/agentic-qa-boilerplate')}\n`);
  process.stdout.write('\n');
}
