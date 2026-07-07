#!/usr/bin/env bun
/**
 * @fileoverview Generate the Allure 3 report in CI and publish it PRIVATELY
 * to the Test Report Portal (Cloudflare R2 + auth-walled portal).
 *
 * Opt-in alternative to publish-allure-pages.ts for projects that cannot
 * expose test evidence on public GitHub Pages. The report is generated with
 * the SAME allurerc.mjs as local runs, then:
 *
 *   1. Trend history is restored from the portal
 *      (GET  {PORTAL_URL}/api/history/{project}/{env}/{suite})
 *   2. `bunx allure generate` renders the Awesome report (trends included)
 *   3. The report tree is synced DIRECTLY to the private R2 bucket under
 *      {project}/{env}/{suite}/{run}/ via the S3-compatible API (aws cli —
 *      no report bytes ever pass through the portal's serverless functions)
 *   4. Updated history is pushed back
 *      (PUT  {PORTAL_URL}/api/history/{project}/{env}/{suite})
 *   5. The run is registered with the stats from allure-report/summary.json
 *      (POST {PORTAL_URL}/api/runs) → the portal returns the private viewUrl
 *
 * Retention is enforced server-side by the portal's daily cron — no pruning
 * here. History lives at {project}/{env}/{suite}/history.jsonl in R2,
 * outside any run prefix, so retention never erases trends.
 *
 * Required environment (GitHub Actions secrets):
 *   PORTAL_URL             e.g. https://reports.yourcompany.com
 *   PORTAL_PROJECT         project slug created with the portal's create-project script
 *   PORTAL_API_KEY         per-project key (printed once by create-project)
 *   R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET
 *
 * Usage (from the repo root):
 *   bun scripts/ci/publish-allure-portal.ts \
 *     --env staging --suite regression --run 82 --results merged-allure-results
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Args {
  env: string
  suite: string
  run: string
  results: string
}

interface AwesomeSummary {
  stats?: {
    total?: number
    passed?: number
    failed?: number
    broken?: number
    skipped?: number
    retries?: number
  }
  status?: string
  duration?: number
  createdAt?: number
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
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
    else { throw new Error(`Unknown flag: ${a}`); }
  }
  for (const key of ['env', 'suite', 'run', 'results'] as const) {
    if (!out[key]) { throw new Error(`--${key} is required`); }
  }
  if (!/^\d+$/.test(out.run!)) { throw new Error('--run must be numeric (github.run_number)'); }
  return out as Args;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) { throw new Error(`Missing required environment variable: ${name}`); }
  return value;
}

function sh(cmd: string, args: string[], extraEnv: Record<string, string> = {}): void {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const portalUrl = requiredEnv('PORTAL_URL').replace(/\/+$/, '');
  const project = requiredEnv('PORTAL_PROJECT');
  const apiKey = requiredEnv('PORTAL_API_KEY');
  const r2AccountId = requiredEnv('R2_ACCOUNT_ID');
  const r2Bucket = requiredEnv('R2_BUCKET');
  requiredEnv('R2_ACCESS_KEY_ID');
  requiredEnv('R2_SECRET_ACCESS_KEY');

  const repoRoot = process.cwd();
  const resultsDir = path.resolve(repoRoot, args.results);
  const reportDir = path.resolve(repoRoot, 'allure-report');
  const localHistory = path.resolve(repoRoot, '.allure/history.jsonl');
  const historyUrl = `${portalUrl}/api/history/${project}/${args.env}/${args.suite}`;
  const authHeaders = { 'x-project-slug': project, 'x-api-key': apiKey };

  if (!fs.existsSync(resultsDir) || fs.readdirSync(resultsDir).length === 0) {
    throw new Error(`No Allure results at ${resultsDir} — nothing to publish.`);
  }

  // 1. Restore trend history from the portal (404 on the stream's first run).
  fs.mkdirSync(path.dirname(localHistory), { recursive: true });
  const historyRes = await fetch(historyUrl, { headers: authHeaders });
  if (historyRes.ok) {
    fs.writeFileSync(localHistory, Buffer.from(await historyRes.arrayBuffer()));
    console.log(`History restored from portal (${args.env}/${args.suite}).`);
  }
  else if (historyRes.status === 404) {
    fs.rmSync(localHistory, { force: true });
    console.log('No previous history — trends start accruing from this run.');
  }
  else {
    throw new Error(`History GET failed: ${historyRes.status} ${await historyRes.text()}`);
  }

  // 2. Generate with the repo's own allurerc.mjs (identical to local).
  fs.rmSync(reportDir, { recursive: true, force: true });
  sh('bunx', ['allure', 'generate', resultsDir]);
  if (!fs.existsSync(path.join(reportDir, 'index.html'))) {
    throw new Error('allure generate produced no report (allure-report/index.html missing).');
  }

  // 3. Sync the report tree directly to the PRIVATE R2 bucket. --delete makes
  // republishing the same run idempotent. aws cli guesses content types.
  const reportPrefix = `${project}/${args.env}/${args.suite}/${args.run}`;
  sh(
    'aws',
    [
      's3',
      'sync',
      reportDir,
      `s3://${r2Bucket}/${reportPrefix}/`,
      '--delete',
      '--only-show-errors',
      '--endpoint-url',
      `https://${r2AccountId}.r2.cloudflarestorage.com`,
    ],
    {
      AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
      AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
      AWS_DEFAULT_REGION: 'auto',
    },
  );
  console.log(`Report synced to r2://${r2Bucket}/${reportPrefix}/`);

  // 4. Push updated history back (allure generate appends to historyPath).
  if (fs.existsSync(localHistory)) {
    const putRes = await fetch(historyUrl, {
      method: 'PUT',
      headers: { ...authHeaders, 'content-type': 'application/x-ndjson' },
      body: fs.readFileSync(localHistory),
    });
    if (!putRes.ok) {
      throw new Error(`History PUT failed: ${putRes.status} ${await putRes.text()}`);
    }
    console.log('History pushed back to portal.');
  }

  // 5. Register the run with the summary stats (Allure 3 Awesome layout).
  const summaryPath = path.join(reportDir, 'summary.json');
  const summary: AwesomeSummary = fs.existsSync(summaryPath)
    ? JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
    : {};

  const runRes = await fetch(`${portalUrl}/api/runs`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      environment: args.env,
      strategy: args.suite,
      buildNumber: args.run,
      reportPrefix,
      status: summary.status,
      stats: summary.stats,
      durationMs: summary.duration,
      startedAt: summary.createdAt ? new Date(summary.createdAt).toISOString() : undefined,
      branch: process.env.GITHUB_REF_NAME,
      commitHash: process.env.GITHUB_SHA,
      triggeredBy: process.env.GITHUB_ACTOR,
      ciJobUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : undefined,
    }),
  });
  const runBody = await runRes.json().catch(() => ({})) as { viewUrl?: string, error?: string };
  if (!runRes.ok) {
    throw new Error(`Run registration failed: ${runRes.status} ${runBody.error ?? ''}`);
  }

  console.log(`Published PRIVATELY: ${runBody.viewUrl ?? `${portalUrl}/reports`}`);
  // Surface the private URL in the GitHub Actions job summary.
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Allure Report (private portal)\nView the report (login required): ${runBody.viewUrl ?? portalUrl}\n`,
    );
  }
}

await main();
