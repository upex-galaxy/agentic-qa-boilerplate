#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import pkg from '../package.json' with { type: 'json' };

import { parseArgs, printHelp } from './args.ts';
import { isAgenticDevRepo, isDirectoryEmpty } from './detect.ts';
import { downloadTemplate } from './download.ts';
import { CliError } from './errors.ts';
import { log } from './log.ts';
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

  log.banner('create-agentic-qa — bootstrap');

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

    log.step(1, 4, `Downloading template (${args.templateRepo}@${args.template})`);
    const dirExistedBefore = existsSync(projectDir);
    await downloadTemplate({
      repo: args.templateRepo,
      ref: args.template,
      targetDir: projectDir,
    });
    if (!dirExistedBefore) { rollback.trackCreatedDir(projectDir); }

    log.step(2, 4, 'Preparing project (scrub history + rewrite metadata)');
    await scrubGitHistory(projectDir);
    await pruneBootstrapExcludes(projectDir);
    await rewritePackageJson(projectDir, projectName);
    await rewriteProjectYaml(projectDir, {
      projectName,
      projectKey: args.projectKey,
    });

    if (!args.noGit) {
      log.step(3, 4, 'Initializing fresh git repository');
      initGitRepo(projectDir);
      rollback.trackGitInit();
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
    log.step(4, 4, 'Installing dependencies');
    runBunInstall(projectDir);
  }

  if (!args.noSetup) {
    log.banner('Running boilerplate installer');
    runBunSetup(projectDir, { nonInteractive: args.nonInteractive });
  }
  else {
    log.dim('--no-setup: skipping `bun run setup`. Run it manually when ready.');
  }

  log.success(`Done. Project ready at: ${projectDir}`);
  if (!args.here && !args.noSetup) {
    log.dim(`Next:  cd ${args.projectName} && bun run claude  (then invoke /agentic-qa-onboard)`);
  }
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
      log.warn('Cancelled.');
      await rollback.run('user cancelled');
      process.exit(130);
    }
    if (err instanceof CliError) {
      log.error(err.message);
      if (err.hint) { log.dim(err.hint); }
      await rollback.run(err.message);
      process.exit(err.exitCode);
    }
    log.error(`Unexpected error: ${(err as Error).message}`);
    if (process.env.DEBUG === '1' && err instanceof Error && err.stack) {
      log.dim(err.stack);
    }
    await rollback.run('unexpected error');
    process.exit(1);
  });
