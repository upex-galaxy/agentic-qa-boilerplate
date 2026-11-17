// Unit tests (bun test tests/utils); Playwright never collects this file because every project sets its own testMatch.

import type { OutcomeRecord } from '@utils/testOutcomes';
import type { AtcReport, AtcRun } from '@utils/xrayResults';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addUnfinishedAtcs,
  buildXrayPayload,
  buildXrayTests,
  findKeyProblems,
  keyProblemLine,
  mergeAtcReports,
  readRunReport,
  runCli,
  UNFINISHED_METHOD,
} from '@utils/xrayResults';

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

function run(testId: string, overrides: Partial<AtcRun> = {}): AtcRun {
  return {
    testId,
    methodName: 'loginSuccessfully',
    className: 'LoginPage',
    status: 'PASS',
    error: null,
    executedAt: '2026-01-01T00:00:00.000Z',
    duration: 12,
    softFail: false,
    ...overrides,
  };
}

describe('mergeAtcReports', () => {
  it('concatenates the executions of one ATC across reports', () => {
    const integration: AtcReport = { results: { 'DEMO-7101': [run('DEMO-7101')] } };
    const e2e: AtcReport = { results: { 'DEMO-7101': [run('DEMO-7101', { status: 'FAIL', error: 'boom' })], 'DEMO-7102': [run('DEMO-7102')] } };

    const merged = mergeAtcReports([integration, e2e, {}]);

    expect(Object.keys(merged)).toEqual(['DEMO-7101', 'DEMO-7102']);
    expect(merged['DEMO-7101']).toHaveLength(2);
  });
});

describe('buildXrayTests / buildXrayPayload', () => {
  it('writes one entry per ATC, keyed by the @atc id, FAILED when any execution failed', () => {
    const tests = buildXrayTests({
      'DEMO-7101': [run('DEMO-7101'), run('DEMO-7101', { status: 'FAIL', error: 'Timeout' })],
      'DEMO-7102': [run('DEMO-7102'), run('DEMO-7102')],
    });

    expect(tests.map(t => [t.testKey, t.status])).toEqual([['DEMO-7101', 'FAILED'], ['DEMO-7102', 'PASSED']]);
    expect(tests[0].comment).toContain('Executions: 2');
    expect(tests[0].comment).toContain('Error:\nTimeout');
  });

  it('never carries testInfo or info, so Xray cannot create a Test or an Execution', () => {
    const payload = buildXrayPayload('DEMO-7150', { 'DEMO-7101': [run('DEMO-7101')] });

    expect(Object.keys(payload).sort()).toEqual(['testExecutionKey', 'tests']);
    expect(payload.testExecutionKey).toBe('DEMO-7150');
    for (const entry of payload.tests) {
      expect(Object.keys(entry).sort()).toEqual(['comment', 'status', 'testKey']);
    }
  });
});

describe('findKeyProblems', () => {
  it('names every id that is not a Jira issue key, with its method', () => {
    const problems = findKeyProblems({
      'DEMO-7101': [run('DEMO-7101')],
      'login-01': [run('login-01', { className: 'LoginPage', methodName: 'loginWithSso' })],
      'demo-7102': [run('demo-7102')],
    });

    expect(problems).toEqual(['login-01 (LoginPage.loginWithSso)', 'demo-7102 (LoginPage.loginSuccessfully)']);
    expect(keyProblemLine(problems)).toContain('nothing was sent to Xray: login-01 (LoginPage.loginWithSso), demo-7102');
  });

  it('accepts real keys', () => {
    expect(findKeyProblems({ 'DEMO-7101': [run('DEMO-7101')], 'QA_X2-7103': [run('QA_X2-7103')] })).toEqual([]);
  });
});

describe('runCli (the CI step)', () => {
  let dir: string;
  let lines: string[];
  let logSpy: ReturnType<typeof spyOn>;
  let errSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xray-results-'));
    lines = [];
    logSpy = spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
    errSpy = spyOn(console, 'error').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  function report(name: string, results: Record<string, AtcRun[]>): string {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify({ results }));
    return path;
  }

  it('writes the payload when every id is a Test key, skipping a report that is absent', () => {
    const out = join(dir, 'xray-results.json');
    const code = runCli(['--execution', 'DEMO-7150', '--out', out, report('a.json', { 'DEMO-7101': [run('DEMO-7101')] }), join(dir, 'missing.json')]);

    expect(code).toBe(0);
    const payload = JSON.parse(readFileSync(out, 'utf-8'));
    expect(payload.testExecutionKey).toBe('DEMO-7150');
    expect(payload.tests).toHaveLength(1);
  });

  it('fails with ONE line naming each bad id and writes nothing', () => {
    const out = join(dir, 'xray-results.json');
    const code = runCli(['--execution', 'DEMO-7150', '--out', out, report('a.json', { 'DEMO-7101': [run('DEMO-7101')], 'smoke-login': [run('smoke-login')] })]);

    expect(code).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith('::error title=Xray import blocked::');
    expect(lines[0]).toContain('smoke-login (LoginPage.loginSuccessfully)');
    expect(() => readFileSync(out)).toThrow();
  });

  it('writes nothing and exits 0 when no ATC ran', () => {
    const out = join(dir, 'xray-results.json');
    expect(runCli(['--execution', 'DEMO-7150', '--out', out, report('a.json', {})])).toBe(0);
    expect(lines[0]).toContain('No ATC result to import');
    expect(() => readFileSync(out)).toThrow();
  });

  it('refuses a missing or malformed execution key', () => {
    expect(runCli(['--out', join(dir, 'x.json')])).toBe(2);
    expect(runCli(['--execution', 'not a key', '--out', join(dir, 'x.json')])).toBe(2);
  });
});

function record(overrides: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    id: 'pw-1',
    title: 'creates an order',
    titlePath: ['', 'e2e', 'orders.test.ts', 'creates an order'],
    file: 'tests/e2e/orders.test.ts',
    line: 1,
    project: 'e2e',
    class: 'failed',
    testStatus: 'FAILED',
    cause: 'timeout',
    rootTestId: null,
    attempts: 1,
    flaky: false,
    durationMs: 60000,
    atcIds: [],
    knownDefect: null,
    skipReason: null,
    error: 'Test timeout of 60000ms exceeded.',
    actionItem: null,
    ...overrides,
  };
}

describe('runtime skips are NOT RUN (verifier S2)', () => {
  it('leaves out an ATC whose every execution was skipped', () => {
    const tests = buildXrayTests({
      'DEMO-7111': [run('DEMO-7111', { status: 'SKIP', error: 'Test is skipped: no data' })],
      'DEMO-7112': [run('DEMO-7112', { status: 'SKIP' }), run('DEMO-7112')],
    });
    expect(tests.map(t => [t.testKey, t.status])).toEqual([['DEMO-7112', 'PASSED']]);
    expect(tests[0].comment).toContain('Executions: 1');
  });
});

describe('an ATC that never finished still reaches Xray as FAILED (verifier S3)', () => {
  it('adds a FAIL for an ATC a failed test started but never recorded', () => {
    const merged = addUnfinishedAtcs(
      { 'DEMO-7121': [run('DEMO-7121', { playwrightTestId: 'pw-1' })] },
      { generatedAt: '2026-01-01T00:00:00.000Z', records: [record({ atcIds: ['DEMO-7121', 'DEMO-7122'] })] },
    );
    expect(merged['DEMO-7121']).toHaveLength(1);
    expect(merged['DEMO-7122'][0]).toMatchObject({ status: 'FAIL', methodName: UNFINISHED_METHOD, playwrightTestId: 'pw-1' });
    expect(buildXrayTests(merged).find(t => t.testKey === 'DEMO-7122')?.comment).toContain('ATC did not finish');
  });

  it('ties a finished execution to its own test: a pass elsewhere does not cover the hang', () => {
    const merged = addUnfinishedAtcs(
      { 'DEMO-7123': [run('DEMO-7123', { playwrightTestId: 'pw-other' })] },
      { generatedAt: 'g', records: [record({ id: 'pw-1', atcIds: ['DEMO-7123'] })] },
    );
    expect(buildXrayTests(merged)).toEqual([expect.objectContaining({ testKey: 'DEMO-7123', status: 'FAILED' })]);
  });

  it('ignores passed and skipped tests', () => {
    const merged = addUnfinishedAtcs({}, {
      generatedAt: 'g',
      records: [
        record({ class: 'passed', testStatus: 'PASSED', atcIds: ['DEMO-7124'] }),
        record({ class: 'skipped', testStatus: 'NOT RUN', atcIds: ['DEMO-7125'] }),
      ],
    });
    expect(merged).toEqual({});
  });
});

describe('readRunReport: one run, read whole or refused', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xray-run-'));
  });

  function write(name: string, body: unknown): string {
    const path = join(dir, name);
    writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body));
    return path;
  }

  it('uses the sibling test-outcomes.json, even with no atc_results.json', () => {
    write('test-outcomes.json', { runId: 'r1', generatedAt: 'g', records: [record({ atcIds: ['DEMO-7131'] })] });
    const read = readRunReport(join(dir, 'atc_results.json'));
    expect(read.problems).toEqual([]);
    expect(Object.keys(read.results)).toEqual(['DEMO-7131']);
  });

  it('refuses a report from another run than its test-outcomes.json (stale, verifier N5)', () => {
    const report = write('atc_results.json', { runId: 'r0', results: { 'DEMO-7132': [run('DEMO-7132')] } });
    write('test-outcomes.json', { runId: 'r1', generatedAt: 'g', records: [] });
    expect(readRunReport(report).problems).toEqual([expect.stringContaining('stale report')]);
  });

  it('names a malformed report instead of throwing (verifier N3)', () => {
    const bad = write('atc_results.json', '{ not json');
    expect(readRunReport(bad).problems).toEqual([expect.stringContaining(`unreadable report ${bad}`)]);
    const shapeless = write('atc_results.json', '[1, 2]');
    expect(readRunReport(shapeless).problems).toEqual([expect.stringContaining('no results map')]);
  });
});

describe('runCli: every refusal is one line', () => {
  let dir: string;
  let lines: string[];
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xray-cli-'));
    lines = [];
    logSpy = spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('a malformed report gives one ::error line and exit 1 (N3)', () => {
    const bad = join(dir, 'atc_results.json');
    writeFileSync(bad, '{ not json');
    expect(runCli(['--execution', 'DEMO-7150', '--out', join(dir, 'x.json'), bad])).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith('::error title=Xray import blocked::Nothing was sent to Xray: unreadable report');
  });

  it('a malformed execution key gives one ::error line naming it (N4)', () => {
    expect(runCli(['--execution', ' DEMO-7150', '--out', join(dir, 'x.json')])).toBe(2);
    expect(lines).toEqual(['::error title=Xray import blocked::The execution key " DEMO-7150" is not a Test Execution key (PROJECT-123 shape), nothing was sent to Xray.']);
  });
});
