#!/usr/bin/env bun
import type { AttachmentPolicy, OneshotModel } from './model.ts';

import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';

import { redactSecretText, redactValues } from '../lib/ui/redaction.ts';
import { inspectHtml } from './gate.ts';
import { buildModel } from './model.ts';
import { collectSecretValues, createRedactor, MARKER, secretVariants } from './redact.ts';
import { renderHtml } from './render.ts';

export const USAGE = `Usage: bun run report:oneshot [options]

Turns a directory of Allure result files into one self-contained HTML file.

  --results <dir>       where the *-result.json files are        default: allure-results
  --out <file.html>     where to write the report                default: .session/oneshot-report.html
  --name <text>         report title                             default: Test Report
  --env <text>          environment label shown in the report
  --run-url <url>       http(s) link back to the CI run
  --history <file>      JSON array of past runs ({label, at, passed, failed, total, url}) for the trend
  --attachments <mode>  all | failures | none: embed screenshots and logs    default: none
  --video <mode>        all | failures | none: embed video recordings        default: none
  --steps <mode>        all | failures | none: render step trees             default: failures
  -h, --help            show this help

Before writing, the finished page is scanned for tokens, passwords, cookies, authorization headers and
local secret values. Any hit exits 1 and writes nothing.
Every exit 1 removes the file already at --out, so an earlier report cannot pass for this run.
Exit codes: 0 written, 1 nothing written (no results, leak gate, I/O error), 2 usage.`;

const POLICIES = ['all', 'failures', 'none'] as const;

export interface Args {
  help: boolean
  results: string
  out: string
  name: string
  env: string
  runUrl: string
  history: string
  attachments: AttachmentPolicy
  video: AttachmentPolicy
  steps: AttachmentPolicy
}

function policy(flag: string, value: string): AttachmentPolicy {
  if (!(POLICIES as readonly string[]).includes(value)) {
    throw new Error(`${flag} must be all, failures or none`);
  }
  return value as AttachmentPolicy;
}

export function parseArgs(argv: string[]): Args {
  const text = (fallback: string) => ({ type: 'string' as const, default: fallback });
  const { values, positionals } = parseNodeArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'help': { type: 'boolean', short: 'h', default: false },
      'results': text('allure-results'),
      'out': text('.session/oneshot-report.html'),
      'name': text('Test Report'),
      'env': text(''),
      'run-url': text(''),
      'history': text(''),
      'attachments': text('none'),
      'video': text('none'),
      'steps': text('failures'),
    },
  });
  if (positionals.length > 0) { throw new Error(`unexpected argument: every value needs a flag (${positionals.length} given without one)`); }
  if (values.results === '') { throw new Error('--results needs a directory'); }
  if (!/\.html?$/i.test(values.out)) { throw new Error('--out must name an .html file'); }
  if (values['run-url'] !== '' && !/^https?:\/\//i.test(values['run-url'])) { throw new Error('--run-url must be an http(s) URL'); }

  return {
    help: values.help,
    results: values.results,
    out: values.out,
    name: values.name,
    env: values.env,
    runUrl: values['run-url'],
    history: values.history,
    attachments: policy('--attachments', values.attachments),
    video: policy('--video', values.video),
    steps: policy('--steps', values.steps),
  };
}

export interface RunContext {
  cwd: string
  env: Record<string, string | undefined>
  log: (line: string) => void
  error: (line: string) => void
  render?: (model: OneshotModel) => string
}

function removeStale(path: string): boolean {
  try {
    if (lstatSync(path).isDirectory()) { return false; }
    rmSync(path, { force: true });
  }
  catch { return false; }
  return true;
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); }
  catch { return false; }
}

function summaryLines(model: OneshotModel): string[] {
  const s = model.summary;
  const real = model.tests.filter(t => !t.scaffolding);
  const lines = [`${s.total} tests: ${s.passed} passed, ${s.knownDefects} known defects, ${s.failed} failed, ${s.broken} broken, ${s.skipped} skipped`];

  const inferred = real.filter(t => t.defect?.inferred).length;
  if (inferred > 0) {
    lines.push(`${inferred} known defects have no marker in the results (a passed result carrying an error), so no defect key: check they are expected failures`);
  }
  if (s.unexpectedPasses > 0) {
    lines.push(`${s.unexpectedPasses} expected to fail but passed, which fails the run: the defect may be fixed`);
  }
  const silent = real.filter(t => (t.status === 'failed' || t.status === 'broken') && t.message === '' && !t.defect).length;
  if (silent > 0) {
    lines.push(`${silent} failed with no error recorded: an unmarked unexpected pass looks like this`);
  }
  const { inputs } = model;
  if (inputs.parsed < inputs.files) {
    lines.push(`${inputs.files - inputs.parsed} of ${inputs.files} *-result.json files could not be read and were skipped`);
  }
  if (inputs.historyUnreadable) {
    lines.push('the --history file is not a readable JSON array: the report has no trend');
  }
  if (s.total === 0) {
    lines.push(`no real tests ran: all ${inputs.entries} entries are setup or teardown, ${s.scaffoldingFailed} of them failed`);
  }
  lines.push(`pass rate ${(s.passRate * 100).toFixed(1)}% over ${s.passed + s.failed + s.broken + s.knownDefects} executed`);

  const attachments = model.tests.flatMap(t => t.attachments);
  const omitted = attachments.filter(a => a.kind === 'omitted').length;
  lines.push(`evidence: ${attachments.length - omitted} embedded, ${omitted} omitted (traces and archives are never embedded)`);
  return lines;
}

export function run(argv: string[], context: RunContext): number {
  let args: Args;
  try { args = parseArgs(argv); }
  catch (error) {
    context.error(`[oneshot] ${redactSecretText(error instanceof Error ? error.message : 'bad arguments')}`);
    context.error(`\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    context.log(USAGE);
    return 0;
  }

  let hidden: string[] = [];
  const safe = (line: string): string => redactValues(line, hidden, MARKER);
  const say = (line: string): void => context.log(`[oneshot] ${safe(line)}`);
  const complain = (line: string): void => context.error(`[oneshot] ${safe(line)}`);

  const outPath = resolve(context.cwd, args.out);
  let written = false;
  try {
    const values = collectSecretValues(context.cwd, context.env);
    hidden = secretVariants(values);

    const resultsDir = resolve(context.cwd, args.results);
    if (!isDirectory(resultsDir)) {
      complain(`results directory does not exist or is not a directory: ${resultsDir}. Nothing was written.`);
      return 1;
    }

    const model = buildModel({
      resultsDir,
      reportName: args.name,
      environment: args.env,
      runUrl: args.runUrl,
      attachments: args.attachments,
      video: args.video,
      steps: args.steps,
      historyPath: args.history === '' ? '' : resolve(context.cwd, args.history),
      redactor: createRedactor(values),
    });
    if (!model.inputs.renderable) {
      complain(model.inputs.emptyReason);
      return 1;
    }

    const html = (context.render ?? renderHtml)(model);
    const rendererText = readFileSync(new URL('./render.ts', import.meta.url), 'utf8');
    const findings = inspectHtml(html, values, rendererText);
    if (findings.length > 0) {
      complain('leak gate refused the report. Nothing was written.');
      for (const finding of findings) { complain(`  rule ${finding.rule}: ${finding.count}`); }
      return 1;
    }
    mkdirSync(dirname(outPath), { recursive: true });
    const draft = `${outPath}.${process.pid}.tmp`;
    try {
      writeFileSync(draft, html, 'utf-8');
      renameSync(draft, outPath);
    }
    finally { rmSync(draft, { force: true }); }
    written = true;

    const bytes = Buffer.byteLength(html, 'utf-8');
    for (const line of summaryLines(model)) { say(line); }
    say(`leak gate passed (pattern rules and ${values.length} local secret values)`);
    context.log(`[oneshot] wrote ${outPath} (${(bytes / 1024 / 1024).toFixed(2)} MB, ${bytes} bytes)`);
    return 0;
  }
  catch (error) {
    complain(redactSecretText(error instanceof Error ? error.message : 'unexpected error'));
    return 1;
  }
  finally {
    if (!written && removeStale(outPath)) { complain(`removed the earlier file at ${outPath} so it cannot be attached by mistake`); }
  }
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2), { cwd: process.cwd(), env: process.env, log: console.log, error: console.error }));
}
