import { CliError } from './errors.ts';

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

  if (!out.projectName && !out.here && !out.help && !out.version) {
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
  process.stdout.write(`create-agentic-qa — scaffolder for the Agentic QA ecosystem

Usage:
  bunx create-agentic-qa <project-name> [flags]
  bunx create-agentic-qa --here                  # use current directory

Flags:
  --here                          Bootstrap into the current directory, or run
                                  setup if already inside a bootstrapped project.
  --template <ref>                Branch/tag/SHA of the template (default: main).
  --template-repo <owner/repo>    Override template upstream
                                  (default: upex-galaxy/agentic-qa-boilerplate).
  --project-key <KEY>             Jira project key (optional; prompted if omitted).
  --no-install                    Skip "bun install".
  --no-setup                      Skip "bun run setup".
  --no-git                        Skip git init + initial commit.
  --non-interactive               Use safe defaults; no prompts.
  --help, -h                      Print this help.
  --version, -v                   Print CLI version.

Examples:
  bunx create-agentic-qa my-app
  bunx create-agentic-qa my-app --project-key ACME
  bunx create-agentic-qa --here
  bunx create-agentic-qa fork --template-repo my-fork/agentic-qa-boilerplate
`);
}
