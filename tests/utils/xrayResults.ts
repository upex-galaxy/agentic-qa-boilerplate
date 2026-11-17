// Xray JSON, not JUnit: JUnit makes Xray create a Generic Test per testcase without test_key; this module never writes testInfo.

import type { AtcResult } from '@utils/decorators';
import type { OutcomesDocument } from '@utils/testOutcomes';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Declared here because decorators.ts is the project's own copy and may predate playwrightTestId.
export type AtcRun = AtcResult & { playwrightTestId?: string };

export interface XrayTestEntry {
  testKey: string
  status: 'PASSED' | 'FAILED'
  comment: string
}

export interface XrayExecutionPayload {
  testExecutionKey: string
  tests: XrayTestEntry[]
}

export interface AtcReport {
  runId?: string
  results?: Record<string, AtcRun[]>
}

export interface RunReport {
  results: Record<string, AtcRun[]>
  problems: string[]
}

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

export const UNFINISHED_METHOD = '(did not finish)';

export function mergeAtcReports(reports: AtcReport[]): Record<string, AtcRun[]> {
  const merged: Record<string, AtcRun[]> = {};
  for (const report of reports) {
    for (const [testId, executions] of Object.entries(report.results ?? {})) {
      merged[testId] = [...(merged[testId] ?? []), ...executions];
    }
  }
  return merged;
}

// The atc annotation is pushed when an ATC starts and the record only when it ends, so a timeout leaves the first without the second.
export function addUnfinishedAtcs(
  results: Record<string, AtcRun[]>,
  outcomes: Pick<OutcomesDocument, 'generatedAt' | 'records'>,
): Record<string, AtcRun[]> {
  const merged: Record<string, AtcRun[]> = { ...results };

  for (const record of outcomes.records) {
    if (record.testStatus !== 'FAILED') {
      continue;
    }
    for (const atcId of record.atcIds) {
      const executions = merged[atcId] ?? [];
      // A record without a stamped test id cannot be tied to one test: any execution of the ATC counts as finished.
      const finished = executions.some(e => e.playwrightTestId === undefined || e.playwrightTestId === record.id);
      if (finished) {
        continue;
      }
      merged[atcId] = [...executions, {
        testId: atcId,
        methodName: UNFINISHED_METHOD,
        className: '',
        status: 'FAIL',
        error: `ATC did not finish: the test "${record.title}" failed (${record.cause ?? 'failed'}) before the ATC recorded a result.`
          + `${record.error ? ` ${record.error}` : ''}`,
        executedAt: outcomes.generatedAt,
        duration: record.durationMs,
        softFail: false,
        playwrightTestId: record.id,
      }];
    }
  }

  return merged;
}

export function buildXrayTests(results: Record<string, AtcRun[]>): XrayTestEntry[] {
  const tests: XrayTestEntry[] = [];

  for (const [testId, executions] of Object.entries(results)) {
    const ran = executions.filter(e => e.status !== 'SKIP');
    if (ran.length === 0) {
      continue;
    }
    const finalStatus = ran.some(e => e.status === 'FAIL') ? 'FAILED' : 'PASSED';
    const lastExecution = ran[ran.length - 1];

    tests.push({
      testKey: testId,
      status: finalStatus,
      comment:
        `KATA ATC: ${lastExecution.methodName}\n`
        + `Executions: ${ran.length}\n`
        + `Duration: ${lastExecution.duration}ms\n`
        + `Last run: ${lastExecution.executedAt}\n${
          lastExecution.error !== null ? `\nError:\n${lastExecution.error}` : ''
        }`,
    });
  }

  return tests;
}

export function buildXrayPayload(executionKey: string, results: Record<string, AtcRun[]>): XrayExecutionPayload {
  return { testExecutionKey: executionKey, tests: buildXrayTests(results) };
}

export function findKeyProblems(results: Record<string, AtcRun[]>): string[] {
  return Object.entries(results)
    .filter(([testId]) => !ISSUE_KEY.test(testId))
    .map(([testId, executions]) => {
      const first = executions[0];
      return first ? `${testId} (${first.className}.${first.methodName})` : testId;
    });
}

export function keyProblemLine(problems: string[]): string {
  return `Not a Test key (PROJECT-123 shape), nothing was sent to Xray: ${problems.join(', ')}. `
    + 'Every @atc id must be the key of a Test that already exists in the TMS; '
    + 'a missing Test is created by /test-documentation, never by an import.';
}

function readJson<T>(path: string, problems: string[]): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  }
  catch (error) {
    problems.push(`unreadable report ${path} (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isResultsReport(value: unknown): value is AtcReport {
  return isPlainObject(value)
    && (value.results === undefined || (isPlainObject(value.results) && Object.values(value.results).every(Array.isArray)));
}

export function readRunReport(reportPath: string): RunReport {
  const problems: string[] = [];
  const outcomesPath = join(dirname(reportPath), 'test-outcomes.json');

  const report = existsSync(reportPath) ? readJson<AtcReport>(reportPath, problems) : null;
  const outcomes = existsSync(outcomesPath) ? readJson<OutcomesDocument>(outcomesPath, problems) : null;

  if (report !== null && !isResultsReport(report)) {
    problems.push(`unreadable report ${reportPath} (no results map)`);
  }
  if (outcomes !== null && !(isPlainObject(outcomes) && Array.isArray(outcomes.records))) {
    problems.push(`unreadable report ${outcomesPath} (no records list)`);
  }
  if (report !== null && outcomes?.runId !== undefined && report.runId !== outcomes.runId) {
    problems.push(`stale report ${reportPath} (run ${report.runId ?? 'unknown'}, but ${outcomesPath} is run ${outcomes.runId})`);
  }
  if (problems.length > 0) {
    return { results: {}, problems };
  }

  const results = mergeAtcReports(report ? [report] : []);
  return { results: outcomes ? addUnfinishedAtcs(results, outcomes) : results, problems };
}

interface CliArgs {
  execution: string
  out: string
  reports: string[]
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { execution: '', out: '', reports: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execution') {
      args.execution = argv[++i] ?? '';
    }
    else if (arg === '--out') {
      args.out = argv[++i] ?? '';
    }
    else {
      args.reports.push(arg);
    }
  }
  return args;
}

export function runCli(argv: string[]): number {
  const { execution, out, reports } = parseCliArgs(argv);

  if (out === '') {
    console.error('Usage: bun tests/utils/xrayResults.ts --execution <TEST-EXECUTION-KEY> --out <file> <atc_results.json...>');
    return 2;
  }
  if (!ISSUE_KEY.test(execution)) {
    console.log(`::error title=Xray import blocked::The execution key "${execution}" is not a Test Execution key (PROJECT-123 shape), nothing was sent to Xray.`);
    return 2;
  }

  const runs = reports.map(readRunReport);
  const readProblems = runs.flatMap(r => r.problems);
  if (readProblems.length > 0) {
    console.log(`::error title=Xray import blocked::Nothing was sent to Xray: ${readProblems.join('; ')}.`);
    return 1;
  }

  const results = mergeAtcReports(runs.map(r => ({ results: r.results })));

  const problems = findKeyProblems(results);
  if (problems.length > 0) {
    console.log(`::error title=Xray import blocked::${keyProblemLine(problems)}`);
    return 1;
  }

  const payload = buildXrayPayload(execution, results);
  if (payload.tests.length === 0) {
    console.log(`::notice title=Xray import skipped::No ATC result to import in this run (${reports.length} report path(s) read).`);
    return 0;
  }

  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${payload.tests.length} result(s) for existing Tests into ${out} (target ${execution}).`);
  return 0;
}

if (import.meta.main) {
  process.exit(runCli(process.argv.slice(2)));
}
