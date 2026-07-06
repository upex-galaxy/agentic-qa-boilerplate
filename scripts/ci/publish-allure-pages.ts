#!/usr/bin/env bun
/**
 * @fileoverview Generate the Allure 3 report in CI and publish it to gh-pages.
 *
 * Replaces simple-elf/allure-report-action (Allure 2) + peaceiris deploy so
 * that CI uses EXACTLY the same generator and config as local runs: the
 * `allure` devDependency driven by the repo's `allurerc.mjs`. The published
 * report is byte-for-byte what a developer sees with `bun run allure:open` —
 * the Awesome report served directly (Report | Graphs | Timeline modes).
 *
 * Per {env}/{suite} the published tree looks like:
 *
 *   {env}/{suite}/
 *     index.html      -> relative redirect to the latest run
 *     history.jsonl   -> Allure 3 trend history (restored before generate,
 *                        saved back after — same historyPath mechanism as local)
 *     {runNumber}/    -> one full report per run (latest N kept, rest pruned)
 *
 * Pruning is real here (the old action's keep_reports never deleted anything).
 * The gh-pages checkout is committed and pushed directly; the monthly squash
 * workflow keeps the branch's git history bounded.
 *
 * Usage (from the repo root, gh-pages checked out into ./gh-pages):
 *   bun scripts/ci/publish-allure-pages.ts \
 *     --env staging --suite regression --run 82 \
 *     --results merged-allure-results --pages gh-pages [--keep 10] [--no-push]
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Args {
  env: string
  suite: string
  run: string
  results: string
  pages: string
  keep: number
  push: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> & { keep: number, push: boolean } = { keep: 10, push: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) { throw new Error(`Missing value for ${a}`); }
      return v;
    };
    if (a === '--env') { out.env = next(); }
    else if (a === '--suite') { out.suite = next(); }
    else if (a === '--run') { out.run = next(); }
    else if (a === '--results') { out.results = next(); }
    else if (a === '--pages') { out.pages = next(); }
    else if (a === '--keep') { out.keep = Number(next()); }
    else if (a === '--no-push') { out.push = false; }
    else { throw new Error(`Unknown flag: ${a}`); }
  }
  for (const key of ['env', 'suite', 'run', 'results', 'pages'] as const) {
    if (!out[key]) { throw new Error(`--${key} is required`); }
  }
  if (!Number.isInteger(out.keep) || out.keep < 1) { throw new Error('--keep must be a positive integer'); }
  if (!/^\d+$/.test(out.run!)) { throw new Error('--run must be numeric (github.run_number)'); }
  return out as Args;
}

function sh(cmd: string, args: string[], opts: { cwd?: string } = {}): string {
  const res = spawnSync(cmd, args, { cwd: opts.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}`);
  }
  return res.stdout ?? '';
}

/** Relative redirect so the page works on any host/base path. */
function redirectHtml(run: string): string {
  return [
    '<!DOCTYPE html><meta charset="utf-8">',
    `<meta http-equiv="refresh" content="0; URL=./${run}/index.html">`,
    '<meta http-equiv="Pragma" content="no-cache"><meta http-equiv="Expires" content="0">',
    `<a href="./${run}/index.html">Latest Allure report (run ${run})</a>`,
    '',
  ].join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const resultsDir = path.resolve(repoRoot, args.results);
  const pagesDir = path.resolve(repoRoot, args.pages);
  const suiteDir = path.join(pagesDir, args.env, args.suite);
  const historyFile = path.join(suiteDir, 'history.jsonl');
  const localHistory = path.resolve(repoRoot, '.allure/history.jsonl');
  const reportDir = path.resolve(repoRoot, 'allure-report');

  if (!fs.existsSync(resultsDir) || fs.readdirSync(resultsDir).length === 0) {
    throw new Error(`No Allure results at ${resultsDir} — nothing to publish.`);
  }

  // gh-pages checkout may be absent on a fresh repo (checkout step is
  // continue-on-error). Initialize an orphan branch so the first suite run
  // bootstraps the site, mirroring what the old action did.
  if (!fs.existsSync(path.join(pagesDir, '.git'))) {
    console.log('gh-pages checkout not found — bootstrapping an orphan branch.');
    fs.mkdirSync(pagesDir, { recursive: true });
    sh('git', ['init', '-b', 'gh-pages'], { cwd: pagesDir });
    const originUrl = sh('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot }).trim();
    sh('git', ['remote', 'add', 'origin', originUrl], { cwd: pagesDir });
    // Share the runner's auth (actions/checkout persisted credentials on the
    // main checkout via http.extraheader in its local git config).
    try {
      const header = sh('git', ['config', '--local', '--get', 'http.https://github.com/.extraheader'], { cwd: repoRoot }).trim();
      if (header) { sh('git', ['config', 'http.https://github.com/.extraheader', header], { cwd: pagesDir }); }
    }
    catch { /* fine — credentials may come from the environment instead */ }
    fs.writeFileSync(path.join(pagesDir, '.nojekyll'), '');
  }

  // 1. Restore trend history (same historyPath mechanism as local runs).
  fs.mkdirSync(path.dirname(localHistory), { recursive: true });
  if (fs.existsSync(historyFile)) {
    fs.copyFileSync(historyFile, localHistory);
    console.log(`History restored from ${path.relative(repoRoot, historyFile)}`);
  }
  else {
    console.log('No previous history — trends start accruing from this run.');
  }

  // 2. Generate with the repo's own allurerc.mjs (identical to local).
  fs.rmSync(reportDir, { recursive: true, force: true });
  sh('bunx', ['allure', 'generate', resultsDir], { cwd: repoRoot });
  if (!fs.existsSync(path.join(reportDir, 'index.html'))) {
    throw new Error('allure generate produced no report (allure-report/index.html missing).');
  }

  // 3. Assemble {env}/{suite}: new run dir + latest redirect + updated history.
  const runDir = path.join(suiteDir, args.run);
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.mkdirSync(suiteDir, { recursive: true });
  fs.cpSync(reportDir, runDir, { recursive: true });
  fs.writeFileSync(path.join(suiteDir, 'index.html'), redirectHtml(args.run));
  if (fs.existsSync(localHistory)) {
    fs.copyFileSync(localHistory, historyFile);
  }

  // 4. Prune: keep the newest `keep` numeric run dirs (including this one).
  const runDirs = fs.readdirSync(suiteDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
    .map(d => Number(d.name))
    .sort((a, b) => b - a);
  for (const stale of runDirs.slice(args.keep)) {
    fs.rmSync(path.join(suiteDir, String(stale)), { recursive: true, force: true });
    console.log(`Pruned old run ${stale}`);
  }

  // 5. Commit + push (retry once with rebase in case a sibling suite pushed).
  sh('git', ['config', 'user.name', 'github-actions[bot]'], { cwd: pagesDir });
  sh('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], { cwd: pagesDir });
  sh('git', ['add', '-A', path.join(args.env, args.suite)], { cwd: pagesDir });
  if (!fs.existsSync(path.join(pagesDir, '.nojekyll'))) {
    fs.writeFileSync(path.join(pagesDir, '.nojekyll'), '');
  }
  sh('git', ['add', '-A', '.nojekyll'], { cwd: pagesDir });

  const status = sh('git', ['status', '--porcelain'], { cwd: pagesDir }).trim();
  if (status === '') {
    console.log('Nothing changed on gh-pages — skipping commit.');
    return;
  }
  sh('git', ['commit', '-m', `allure: ${args.env}/${args.suite} run ${args.run}`], { cwd: pagesDir });

  if (!args.push) {
    console.log('--no-push set — commit left local for inspection.');
    return;
  }
  try {
    sh('git', ['push', 'origin', 'gh-pages'], { cwd: pagesDir });
  }
  catch {
    console.log('Push rejected — rebasing on remote gh-pages and retrying once…');
    sh('git', ['pull', '--rebase', 'origin', 'gh-pages'], { cwd: pagesDir });
    sh('git', ['push', 'origin', 'gh-pages'], { cwd: pagesDir });
  }
  console.log(`Published ${args.env}/${args.suite} run ${args.run} (keeping last ${args.keep} runs).`);
}

main();
