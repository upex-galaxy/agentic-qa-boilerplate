// Playwright reports a setup cascade as ok() and gives dependents of a failed project no result; Allure files test.fail as passed (measured on 1.60.0, ADR-0020).

import type { TestStatus } from '@/cli/lib/sprint-source/types';

export const OUTCOMES_SCHEMA = 'test-outcomes/1.0';
export const OUTCOMES_PATH = 'reports/test-outcomes.json';

export const OUTCOME_CLASSES = ['passed', 'failed', 'known-defect', 'unexpected-pass', 'skipped'] as const;
export type OutcomeClass = (typeof OUTCOME_CLASSES)[number];

export type OutcomeCause
  = | 'assertion'
    | 'timeout'
    | 'setup-cascade'
    | 'dependency-failed'
    | 'expected-failure'
    | 'skip-annotation'
    | 'not-run';

export type ActionItem = 'unexpected-pass' | 'known-defect-without-key';

export type PlaywrightStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

// Failures that were not observed (setup failed, body never ran) are overridden to BLOCKED in testStatusOf (D21).
export const TEST_STATUS_OF_CLASS = {
  'passed': 'PASSED',
  'failed': 'FAILED',
  'known-defect': 'FAILED',
  'unexpected-pass': 'PASSED',
  'skipped': 'NOT RUN',
} as const satisfies Record<OutcomeClass, TestStatus>;

const NOT_OBSERVED_CAUSES: ReadonlySet<OutcomeCause> = new Set(['setup-cascade', 'dependency-failed']);

export function testStatusOf(outcome: OutcomeClass, cause: OutcomeCause | null): TestStatus {
  if (outcome === 'failed' && cause !== null && NOT_OBSERVED_CAUSES.has(cause)) {
    return 'BLOCKED';
  }
  return TEST_STATUS_OF_CLASS[outcome];
}

export interface OutcomeAnnotation {
  type: string
  description?: string
}

export interface OutcomeAttempt {
  status: PlaywrightStatus
  durationMs: number
  error?: string
}

export interface OutcomeInput {
  id: string
  title: string
  titlePath: string[]
  file: string
  line: number
  project: string
  parentKey: string
  expectedStatus: PlaywrightStatus
  annotations: OutcomeAnnotation[]
  tags: string[]
  attempts: OutcomeAttempt[]
}

export interface OutcomeRecord {
  id: string
  title: string
  titlePath: string[]
  file: string
  line: number
  project: string
  class: OutcomeClass
  testStatus: TestStatus
  cause: OutcomeCause | null
  rootTestId: string | null
  attempts: number
  flaky: boolean
  durationMs: number
  atcIds: string[]
  knownDefect: string | null
  skipReason: string | null
  error: string | null
  actionItem: ActionItem | null
}

export interface OutcomeSummary {
  total: number
  passed: number
  failed: number
  knownDefect: number
  unexpectedPass: number
  skipped: number
  setupFailures: number
  notRun: number
  flaky: number
  actionItems: number
}

export interface RunInfo {
  status: string
  environment: string
  baseUrl: string
  ci: { runUrl: string, sha: string | null } | null
  playwright: string
}

export interface OutcomesDocument {
  schema: typeof OUTCOMES_SCHEMA
  generatedAt: string
  runId?: string
  run: RunInfo
  summary: OutcomeSummary
  records: OutcomeRecord[]
}

const DEFECT_KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const BLOCKED_BY = /^Blocked by ([A-Z][A-Z0-9]+-\d+)(?![\w-])/;
const FAILED_STATUSES: ReadonlySet<PlaywrightStatus> = new Set(['failed', 'timedOut']);
const MAX_ERROR_LEN = 300;

function hasAnnotation(input: OutcomeInput, ...types: string[]): boolean {
  return input.annotations.some(a => types.includes(a.type));
}

// Free text never mints a key: a reason like "Broken UTF-8 handling" leaves the record keyless, which is an action item.
export function knownDefectKey(input: Pick<OutcomeInput, 'annotations' | 'tags'>): string | null {
  const exact = [
    ...input.annotations.filter(a => a.type === 'known-defect').map(a => (a.description ?? '').trim()),
    ...input.tags.filter(t => t.startsWith('@blocked:')).map(t => t.slice('@blocked:'.length).trim()),
  ];
  const key = exact.find(candidate => DEFECT_KEY.test(candidate));
  if (key !== undefined) {
    return key;
  }
  for (const a of input.annotations) {
    const match = a.type === 'fail' ? (a.description ?? '').trim().match(BLOCKED_BY) : null;
    if (match) {
      return match[1];
    }
  }
  return null;
}

function skipReason(input: OutcomeInput): string | null {
  const annotation = input.annotations.find(a => a.type === 'skip' || a.type === 'fixme');
  if (!annotation) {
    return null;
  }
  return annotation.description ? `${annotation.type}: ${annotation.description}` : annotation.type;
}

export function errorLine(message: string | undefined): string | null {
  if (message === undefined || message === '') {
    return null;
  }
  // eslint-disable-next-line no-control-regex -- stripping ANSI colour codes is the point
  const plain = message.replace(/\u001B\[[0-9;]*m/g, '').trim();
  const first = plain.split('\n')[0] ?? '';
  return first.length > MAX_ERROR_LEN ? `${first.slice(0, MAX_ERROR_LEN)}...` : first;
}

interface Classified {
  outcome: OutcomeClass
  cause: OutcomeCause | null
}

export function classifyAttempt(input: OutcomeInput): Classified {
  const last = input.attempts.at(-1);

  if (input.expectedStatus === 'skipped' && hasAnnotation(input, 'skip', 'fixme')) {
    return { outcome: 'skipped', cause: 'skip-annotation' };
  }
  if (last === undefined || last.status === 'interrupted') {
    return { outcome: 'skipped', cause: 'not-run' };
  }
  if (input.expectedStatus === 'failed') {
    if (last.status === 'passed') {
      return { outcome: 'unexpected-pass', cause: 'expected-failure' };
    }
    // Only an observed failure reproduces the defect: a timeout falls through to failed / timeout
    if (last.status === 'failed') {
      return { outcome: 'known-defect', cause: 'expected-failure' };
    }
  }
  if (last.status === 'passed') {
    return { outcome: 'passed', cause: null };
  }
  if (last.status === 'failed') {
    return { outcome: 'failed', cause: 'assertion' };
  }
  if (last.status === 'timedOut') {
    return { outcome: 'failed', cause: 'timeout' };
  }
  if (hasAnnotation(input, 'skip', 'fixme')) {
    return { outcome: 'skipped', cause: 'skip-annotation' };
  }
  // Expected to run but skipped with no skip/fixme marker: a beforeAll or serial sibling failed. Never a skip.
  return { outcome: 'failed', cause: 'setup-cascade' };
}

function transitiveDependencies(project: string, dependencies: Record<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const queue = [...(dependencies[project] ?? [])];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (seen.has(next)) {
      continue;
    }
    seen.add(next);
    queue.push(...(dependencies[next] ?? []));
  }
  return seen;
}

export function buildOutcomeRecords(
  inputs: readonly OutcomeInput[],
  projectDependencies: Record<string, string[]> = {},
): OutcomeRecord[] {
  const classified = inputs.map(input => ({ input, ...classifyAttempt(input) }));

  // A root is any test Playwright calls `unexpected`: a failure, timeout or unexpected pass (which also stops a serial group).
  const isPlainFailure = (c: (typeof classified)[number]) =>
    (c.outcome === 'failed' && (c.cause === 'assertion' || c.cause === 'timeout')) || c.outcome === 'unexpected-pass';

  const firstFailureInSuite = new Map<string, string>();
  const firstFailureInProject = new Map<string, string>();
  for (const c of classified) {
    if (!isPlainFailure(c)) {
      continue;
    }
    if (!firstFailureInSuite.has(c.input.parentKey)) {
      firstFailureInSuite.set(c.input.parentKey, c.input.id);
    }
    if (!firstFailureInProject.has(c.input.project)) {
      firstFailureInProject.set(c.input.project, c.input.id);
    }
  }

  return classified.map(({ input, outcome, cause }) => {
    let finalOutcome = outcome;
    let finalCause = cause;
    let rootTestId: string | null = null;

    if (finalCause === 'setup-cascade') {
      rootTestId = firstFailureInSuite.get(input.parentKey) ?? null;
    }
    else if (finalCause === 'not-run' && input.attempts.length === 0) {
      for (const dependency of transitiveDependencies(input.project, projectDependencies)) {
        const root = firstFailureInProject.get(dependency);
        if (root !== undefined) {
          finalOutcome = 'failed';
          finalCause = 'dependency-failed';
          rootTestId = root;
          break;
        }
      }
    }

    const last = input.attempts.at(-1);
    // Flaky = the last attempt matched the expectation and an earlier one did not.
    const flaky = last?.status === input.expectedStatus
      && input.attempts.slice(0, -1).some(a => a.status !== input.expectedStatus);
    const defect = finalOutcome === 'known-defect' || finalOutcome === 'unexpected-pass'
      ? knownDefectKey(input)
      : null;

    let actionItem: ActionItem | null = null;
    if (finalOutcome === 'unexpected-pass') {
      actionItem = 'unexpected-pass';
    }
    else if (finalOutcome === 'known-defect' && defect === null) {
      actionItem = 'known-defect-without-key';
    }

    const atcIds = [...new Set(
      input.annotations
        .filter(a => a.type === 'atc' && a.description)
        .map(a => a.description as string),
    )];

    return {
      id: input.id,
      title: input.title,
      titlePath: input.titlePath,
      file: input.file,
      line: input.line,
      project: input.project,
      class: finalOutcome,
      testStatus: testStatusOf(finalOutcome, finalCause),
      cause: finalCause,
      rootTestId,
      attempts: input.attempts.length,
      flaky,
      durationMs: input.attempts.reduce((sum, a) => sum + a.durationMs, 0),
      atcIds,
      knownDefect: defect,
      skipReason: finalOutcome === 'skipped' ? skipReason(input) : null,
      error: last && FAILED_STATUSES.has(last.status) ? errorLine(last.error) : null,
      actionItem,
    };
  });
}

export function summarizeOutcomes(records: readonly OutcomeRecord[]): OutcomeSummary {
  const count = (predicate: (r: OutcomeRecord) => boolean) => records.filter(predicate).length;
  return {
    total: records.length,
    passed: count(r => r.class === 'passed'),
    failed: count(r => r.class === 'failed'),
    knownDefect: count(r => r.class === 'known-defect'),
    unexpectedPass: count(r => r.class === 'unexpected-pass'),
    skipped: count(r => r.class === 'skipped'),
    setupFailures: count(r => r.class === 'failed' && r.cause !== null && NOT_OBSERVED_CAUSES.has(r.cause)),
    notRun: count(r => r.class === 'skipped' && r.cause === 'not-run'),
    flaky: count(r => r.flaky),
    actionItems: count(r => r.actionItem !== null),
  };
}

function plural(n: number, singular: string, pluralForm = `${singular}S`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export interface Headline {
  ok: boolean
  text: string
}

export function outcomeHeadline(summary: OutcomeSummary, runStatus = 'passed'): Headline {
  if (summary.total === 0) {
    return { ok: false, text: 'NO TESTS RAN' };
  }

  // Playwright's run status still counts: a worker crash or global setup error fails the run while every record reads clean.
  const ok = summary.failed === 0
    && summary.unexpectedPass === 0
    && summary.actionItems === 0
    && summary.notRun === 0
    && runStatus === 'passed';

  if (ok) {
    const caveats: string[] = [];
    if (summary.knownDefect > 0) {
      caveats.push(plural(summary.knownDefect, 'KNOWN DEFECT'));
    }
    if (summary.skipped > 0) {
      caveats.push(`${summary.skipped} SKIPPED`);
    }
    return { ok, text: caveats.length === 0 ? 'ALL TESTS PASSED' : `PASSED WITH ${caveats.join(', ')}` };
  }

  const parts: string[] = [];
  if (summary.failed > 0) {
    const plain = summary.failed - summary.setupFailures;
    const detail = summary.setupFailures > 0
      ? ` (${summary.setupFailures} NOT OBSERVED: SETUP FAILED, BLOCKED ON THE BOARD${plain > 0 ? `, ${plain} ASSERTION/TIMEOUT` : ''})`
      : '';
    parts.push(`${summary.failed} FAILED${detail}`);
  }
  if (summary.unexpectedPass > 0) {
    parts.push(plural(summary.unexpectedPass, 'UNEXPECTED PASS', 'UNEXPECTED PASSES'));
  }
  if (summary.notRun > 0) {
    parts.push(`${summary.notRun} NOT RUN`);
  }
  const keyless = summary.actionItems - summary.unexpectedPass;
  if (keyless > 0) {
    parts.push(`${keyless} EXPECTED FAILURE WITHOUT A DEFECT KEY`);
  }
  if (runStatus === 'interrupted' || runStatus === 'timedout') {
    parts.push(`RUN ${runStatus.toUpperCase()}`);
  }
  else if (runStatus !== 'passed' && parts.length === 0) {
    parts.push('ERROR OUTSIDE ANY TEST');
  }
  return { ok, text: `EXECUTION FAILED: ${parts.join(', ')}` };
}

// `playwright test --list` reaches onEnd with no attempts: a listing is not a run, so the last real run's records stay.
export function isListOnlyRun(runStatus: string, inputs: readonly Pick<OutcomeInput, 'attempts'>[]): boolean {
  return runStatus === 'passed' && inputs.length > 0 && inputs.every(i => i.attempts.length === 0);
}

export function listedHeadline(total: number): string {
  return `LISTED ${plural(total, 'TEST')}, NONE RUN`;
}

export function outcomeCountsLine(summary: OutcomeSummary): string {
  return [
    `${summary.total} total`,
    `${summary.passed} passed`,
    `${summary.failed} failed (${summary.setupFailures} setup)`,
    `${summary.knownDefect} known defects`,
    `${summary.unexpectedPass} unexpected passes`,
    `${summary.skipped} skipped (${summary.notRun} not run)`,
    `${summary.flaky} flaky`,
  ].join(' · ');
}

export function actionItemLines(records: readonly OutcomeRecord[]): string[] {
  // The same file can run under two projects: name the project so two lines never look like a duplicate
  const named = (r: OutcomeRecord) => (r.project === '' ? r.title : `${r.title} [${r.project}]`);
  const lines: string[] = [];
  for (const r of records) {
    if (r.actionItem === 'unexpected-pass') {
      const defect = r.knownDefect ? ` (expected failure for ${r.knownDefect})` : '';
      lines.push(`UNEXPECTED PASS: ${named(r)}${defect}: retest the defect, then remove the expected-failure marker`);
    }
    else if (r.actionItem === 'known-defect-without-key') {
      lines.push(`EXPECTED FAILURE WITHOUT A DEFECT KEY: ${named(r)}: call knownDefect('{BUG-KEY}') (tests/utils/knownDefect.ts) or tag it @blocked:{BUG-KEY}`);
    }
  }

  const byRoot = new Map<string, number>();
  for (const r of records) {
    if (r.rootTestId !== null) {
      byRoot.set(r.rootTestId, (byRoot.get(r.rootTestId) ?? 0) + 1);
    }
  }
  for (const [rootId, count] of byRoot) {
    const root = records.find(r => r.id === rootId);
    const name = root ? named(root) : rootId;
    lines.push(`SETUP FAILED: ${name} took down ${plural(count, 'test', 'tests')} (counted FAILED here, BLOCKED on the board: not observed)`);
  }
  return lines;
}

export function stepSummaryMarkdown(summary: OutcomeSummary, records: readonly OutcomeRecord[], runStatus = 'passed'): string {
  const headline = outcomeHeadline(summary, runStatus);
  const rows: Array<[string, number]> = [
    ['Passed', summary.passed],
    ['Failed', summary.failed],
    ['  of which setup failures (not observed, BLOCKED on the board)', summary.setupFailures],
    ['Known defects (expected failures)', summary.knownDefect],
    ['Unexpected passes', summary.unexpectedPass],
    ['Skipped', summary.skipped],
    ['  of which not run (the run stopped first)', summary.notRun],
    ['Flaky (passed on retry)', summary.flaky],
    ['Total', summary.total],
  ];
  const lines = [
    `### Test outcomes (\`${OUTCOMES_PATH}\`)`,
    '',
    `**${headline.ok ? 'OK' : 'NOT OK'}: ${headline.text}**`,
    '',
    '| Outcome | Count |',
    '|---|---:|',
    ...rows.map(([label, n]) => `| ${label} | ${n} |`),
  ];
  const items = actionItemLines(records);
  if (items.length > 0) {
    lines.push('', '**Action items**', '', ...items.map(item => `- ${item}`));
  }
  return `${lines.join('\n')}\n`;
}

export function buildOutcomesDocument(records: OutcomeRecord[], run: RunInfo, now = new Date()): OutcomesDocument {
  return {
    schema: OUTCOMES_SCHEMA,
    generatedAt: now.toISOString(),
    run,
    summary: summarizeOutcomes(records),
    records,
  };
}
