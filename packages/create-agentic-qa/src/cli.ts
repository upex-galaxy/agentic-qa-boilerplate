#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import figuresModule from 'figures';
import pc from 'picocolors';

import pkg from '../package.json' with { type: 'json' };

import { parseArgs, printHelp } from './args.ts';
import { isAgenticDevRepo, isDirectoryEmpty } from './detect.ts';
import { runDoctor } from './doctor.ts';
import { downloadTemplate } from './download.ts';
import { CliError } from './errors.ts';
import { runInspect } from './inspect.ts';
import { log } from './log.ts';
import { runMenu } from './menu.ts';
import {
  initGitRepo,
  pruneBootstrapExcludes,
  rewritePackageJson,
  rewriteProjectYaml,
  sanitizeProjectName,
  scrubGitHistory,
} from './prepare.ts';
import { rollback } from './rollback.ts';
import { ensureBunAvailable, ensureGitAvailable, runBunInstall, runBunSetup } from './runners.ts';
import * as tui from './tui.ts';

const figures = figuresModule as unknown as Record<string, string>;

const VERSION = (pkg as { version: string }).version;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return 0;
  }
  if (args.version) {
    process.stdout.write(`create-agentic-qa v${VERSION}\n`);
    return 0;
  }

  // Print logo unless suppressed
  if (!args.noBanner) {
    process.stdout.write(`${tui.logo()}\n`);
  }

  // -----------------------------------------------------------------------
  // Interactive menu — show when no project name + not --here, or --menu forced.
  // -----------------------------------------------------------------------
  if ((!args.projectName && !args.here) || args.menu) {
    let menuDone = false;
    while (!menuDone) {
      const result = await runMenu();

      if (result.kind === 'quit') {
        tui.outro('See you next time.');
        return 0;
      }

      if (result.kind === 'doctor') {
        await runDoctor();
        tui.breathe();
        // Loop back to menu
        continue;
      }

      if (result.kind === 'inspect') {
        await runInspect();
        tui.breathe();
        // Loop back to menu
        continue;
      }

      // scaffold
      args.projectName = result.projectName;
      menuDone = true;
    }
  }

  ensureBunAvailable();
  if (!args.noGit) { ensureGitAvailable(); }

  const cwd = process.cwd();

  // ------------------------------------------------------------------
  // Decide mode: in-repo vs bootstrap.
  // ------------------------------------------------------------------
  let projectDir: string;
  let runStageA = true; // stage A = download + scrub + rewrite + git init

  if (args.here) {
    projectDir = cwd;
    if (isAgenticDevRepo(cwd, args.templateRepo)) {
      log.success('Existing agentic-qa project detected. Skipping bootstrap.');
      runStageA = false;
    }
    else if (!isDirectoryEmpty(cwd)) {
      throw new CliError(
        'CONFLICT',
        `Current directory is not empty and is not an agentic-qa project: ${cwd}`,
        'Move to an empty directory, or run without --here and pass a project name.',
      );
    }
  }
  else {
    const safeName = sanitizeProjectName(args.projectName!);
    if (!safeName) {
      throw new CliError('USAGE', `Invalid project name: "${args.projectName}".`);
    }
    projectDir = resolve(cwd, safeName);

    if (existsSync(projectDir)) {
      if (isAgenticDevRepo(projectDir, args.templateRepo)) {
        log.success(`Existing agentic-qa project at ${projectDir}. Skipping bootstrap.`);
        runStageA = false;
      }
      else if (!isDirectoryEmpty(projectDir)) {
        throw new CliError(
          'CONFLICT',
          `Target directory exists and is not empty: ${projectDir}`,
          'Choose a different name, or remove the directory.',
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // Stage A — bootstrap from template (only when not already in-repo)
  // ------------------------------------------------------------------
  if (runStageA) {
    const projectName = args.here
      ? sanitizeProjectName(args.projectName ?? deriveNameFromPath(projectDir))
      : sanitizeProjectName(args.projectName!);

    // Step 1 — Download template
    const s1 = tui.spinner();
    s1.start(`Downloading template (${args.templateRepo}@${args.template})…`);
    const dirExistedBefore = existsSync(projectDir);
    try {
      await downloadTemplate({
        repo: args.templateRepo,
        ref: args.template,
        targetDir: projectDir,
      });
      s1.stop('Template downloaded');
    }
    catch (err) {
      s1.error(`Failed to download template: ${(err as Error).message}`);
      throw err;
    }
    if (!dirExistedBefore) { rollback.trackCreatedDir(projectDir); }

    // Step 2 — Prepare project
    const s2 = tui.spinner();
    s2.start('Preparing project (scrub history + rewrite metadata)…');
    try {
      await scrubGitHistory(projectDir);
      await pruneBootstrapExcludes(projectDir);
      await rewritePackageJson(projectDir, projectName);
      await rewriteProjectYaml(projectDir, {
        projectName,
        projectKey: args.projectKey,
      });
      s2.stop('Project prepared');
    }
    catch (err) {
      s2.error(`Failed to prepare project: ${(err as Error).message}`);
      throw err;
    }

    if (!args.noGit) {
      // Step 3 — git init
      const s3 = tui.spinner();
      s3.start('Initializing fresh git repository…');
      try {
        initGitRepo(projectDir);
        rollback.trackGitInit();
        s3.stop('Git repository initialized');
      }
      catch (err) {
        s3.error(`Failed to initialize git: ${(err as Error).message}`);
        throw err;
      }
    }
    else {
      log.dim('  --no-git: skipping git init.');
    }

    // Stage A complete — stop tracking rollback (next failures should NOT
    // delete user files; project is in a usable state).
    rollback.forget();
  }

  // ------------------------------------------------------------------
  // Stage B — delegate to the boilerplate's own installer.
  // ------------------------------------------------------------------
  if (!args.noInstall) {
    const s4 = tui.spinner();
    s4.start('Installing dependencies (bun install)…');
    try {
      runBunInstall(projectDir);
      s4.stop('Dependencies installed');
    }
    catch (err) {
      s4.error(`Failed to install dependencies: ${(err as Error).message}`);
      throw err;
    }
  }

  if (!args.noSetup) {
    tui.section('Running boilerplate installer');
    runBunSetup(projectDir, { nonInteractive: args.nonInteractive });
  }
  else {
    log.dim('--no-setup: skipping `bun run setup`. Run it manually when ready.');
  }

  // ------------------------------------------------------------------
  // Final success box
  // ------------------------------------------------------------------
  const cdCmd = args.here ? '' : `cd ${args.projectName}`;
  const nextStepNum = cdCmd ? 2 : 1;
  const nextLines = [
    pc.green(`${figures.tick ?? '✔'}  Project ready at ${projectDir}`),
    '',
    pc.bold('Next steps (in order):'),
    ...(cdCmd ? [`  1.  ${pc.cyan(cdCmd)}`] : []),
    `  ${nextStepNum}.  ${pc.cyan('bun run claude')}     ${pc.dim('# or: bun run opencode')}`,
    `      ${pc.dim('then invoke /agentic-qa-onboard')}`,
    '',
    pc.dim('Full guide: README.md → "Getting started"'),
  ];
  process.stdout.write(`${tui.successBox(nextLines)}\n`);

  return 0;
}

function deriveNameFromPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? 'agentic-qa-app';
}

main()
  .then(code => process.exit(code))
  .catch(async (err) => {
    if (err && typeof err === 'object' && (err as { name?: string }).name === 'ExitPromptError') {
      tui.cancel('Cancelled.');
      await rollback.run('user cancelled');
      process.exit(130);
    }
    if (err instanceof CliError) {
      process.stderr.write(pc.red(`${figures.cross ?? '✘'}  ${err.message}\n`));
      if (err.hint) { log.dim(err.hint); }
      await rollback.run(err.message);
      process.exit(err.exitCode);
    }
    process.stderr.write(pc.red(`${figures.cross ?? '✘'}  Unexpected error: ${(err as Error).message}\n`));
    if (process.env.DEBUG === '1' && err instanceof Error && err.stack) {
      log.dim(err.stack);
    }
    await rollback.run('unexpected error');
    process.exit(1);
  });
