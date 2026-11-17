// Unit tests (bun test tests/utils); Playwright never collects this file because every project sets its own testMatch.

import type { OutcomeInput, OutcomeRecord } from '@utils/testOutcomes';
import {
  actionItemLines,
  buildOutcomeRecords,
  classifyAttempt,
  errorLine,
  isListOnlyRun,
  knownDefectKey,
  listedHeadline,
  outcomeHeadline,
  stepSummaryMarkdown,
  summarizeOutcomes,
  testStatusOf,
} from '@utils/testOutcomes';

import { describe, expect, it } from 'bun:test';

let seq = 0;
function input(overrides: Partial<OutcomeInput> = {}): OutcomeInput {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `test ${seq}`,
    titlePath: ['', 'e2e', 'file.test.ts', `test ${seq}`],
    file: 'tests/e2e/file.test.ts',
    line: seq,
    project: 'e2e',
    parentKey: 'file.test.ts',
    expectedStatus: 'passed',
    annotations: [],
    tags: [],
    attempts: [{ status: 'passed', durationMs: 10 }],
    ...overrides,
  };
}

function one(overrides: Partial<OutcomeInput> = {}): OutcomeRecord {
  return buildOutcomeRecords([input(overrides)])[0];
}

describe('classifyAttempt: one row per measured shape', () => {
  it('plain pass is passed', () => {
    expect(classifyAttempt(input())).toEqual({ outcome: 'passed', cause: null });
  });

  it('plain failure and timeout are failed', () => {
    expect(classifyAttempt(input({ attempts: [{ status: 'failed', durationMs: 1 }] })))
      .toEqual({ outcome: 'failed', cause: 'assertion' });
    expect(classifyAttempt(input({ attempts: [{ status: 'timedOut', durationMs: 1 }] })))
      .toEqual({ outcome: 'failed', cause: 'timeout' });
  });

  it('skip with expectedStatus passed and no annotation is a setup cascade, never a skip', () => {
    expect(classifyAttempt(input({ attempts: [{ status: 'skipped', durationMs: 0 }] })))
      .toEqual({ outcome: 'failed', cause: 'setup-cascade' });
  });

  it('runtime and static skip / fixme are skipped', () => {
    for (const type of ['skip', 'fixme']) {
      expect(classifyAttempt(input({
        expectedStatus: 'skipped',
        annotations: [{ type, description: 'reason' }],
        attempts: [{ status: 'skipped', durationMs: 0 }],
      }))).toEqual({ outcome: 'skipped', cause: 'skip-annotation' });
    }
  });

  it('a conditional skip inside a hook carries the annotation and stays skipped', () => {
    expect(classifyAttempt(input({
      expectedStatus: 'skipped',
      annotations: [{ type: 'skip', description: 'no feature flag' }],
      attempts: [{ status: 'skipped', durationMs: 0 }],
    })).outcome).toBe('skipped');
  });

  it('test.fail failing is a known defect, passing is an unexpected pass', () => {
    const marked = { expectedStatus: 'failed' as const, annotations: [{ type: 'fail', description: 'Blocked by BK-9' }] };
    expect(classifyAttempt(input({ ...marked, attempts: [{ status: 'failed', durationMs: 1 }] })))
      .toEqual({ outcome: 'known-defect', cause: 'expected-failure' });
    expect(classifyAttempt(input({ ...marked, attempts: [{ status: 'passed', durationMs: 1 }] })))
      .toEqual({ outcome: 'unexpected-pass', cause: 'expected-failure' });
  });

  it('no result or an interrupted attempt is not run', () => {
    expect(classifyAttempt(input({ attempts: [] }))).toEqual({ outcome: 'skipped', cause: 'not-run' });
    expect(classifyAttempt(input({ attempts: [{ status: 'interrupted', durationMs: 1 }] })))
      .toEqual({ outcome: 'skipped', cause: 'not-run' });
  });

  it('a static skip the run never reached is still a skip by annotation', () => {
    expect(classifyAttempt(input({ expectedStatus: 'skipped', annotations: [{ type: 'skip' }], attempts: [] })))
      .toEqual({ outcome: 'skipped', cause: 'skip-annotation' });
  });
});

describe('testStatusOf: the doctrine mapping', () => {
  it('maps every class onto the sprint source TestStatus', () => {
    expect(testStatusOf('passed', null)).toBe('PASSED');
    expect(testStatusOf('failed', 'assertion')).toBe('FAILED');
    expect(testStatusOf('known-defect', 'expected-failure')).toBe('FAILED');
    expect(testStatusOf('unexpected-pass', 'expected-failure')).toBe('PASSED');
    expect(testStatusOf('skipped', 'skip-annotation')).toBe('NOT RUN');
  });

  it('a failure that was not observed is BLOCKED, not FAILED', () => {
    expect(testStatusOf('failed', 'setup-cascade')).toBe('BLOCKED');
    expect(testStatusOf('failed', 'dependency-failed')).toBe('BLOCKED');
  });
});

describe('knownDefectKey: every marker the repo uses', () => {
  it('reads the known-defect annotation first', () => {
    expect(knownDefectKey({ annotations: [{ type: 'known-defect', description: 'BK-1' }], tags: ['@blocked:BK-2'] })).toBe('BK-1');
  });

  it('reads the @blocked tag and the test.fail description', () => {
    expect(knownDefectKey({ annotations: [{ type: 'fail' }], tags: ['@blocked:BK-77'] })).toBe('BK-77');
    expect(knownDefectKey({ annotations: [{ type: 'fail', description: 'Blocked by BK-999' }], tags: [] })).toBe('BK-999');
  });

  it('returns null when no marker names a key', () => {
    expect(knownDefectKey({ annotations: [{ type: 'fail' }], tags: ['@smoke'] })).toBeNull();
    expect(knownDefectKey({ annotations: [{ type: 'fail', description: 'flaky backend' }], tags: [] })).toBeNull();
  });
});

describe('buildOutcomeRecords', () => {
  it('attributes a beforeAll cascade to the first failed sibling', () => {
    const root = input({ parentKey: 'cascade', attempts: [{ status: 'failed', durationMs: 5, error: 'Error: setup boom' }] });
    const sibling = input({ parentKey: 'cascade', attempts: [{ status: 'skipped', durationMs: 0 }] });
    const elsewhere = input({ parentKey: 'other' });
    const [r, s, e] = buildOutcomeRecords([root, sibling, elsewhere]);

    expect(r.class).toBe('failed');
    expect(r.testStatus).toBe('FAILED');
    expect(r.error).toBe('Error: setup boom');
    expect(s).toMatchObject({ class: 'failed', cause: 'setup-cascade', testStatus: 'BLOCKED', rootTestId: root.id });
    expect(e.class).toBe('passed');
  });

  it('never takes a cascade root from the same describe in another project', () => {
    const smokeRoot = input({ project: 'smoke-ui', parentKey: 'smoke-ui > file.test.ts > flow', attempts: [{ status: 'failed', durationMs: 1 }] });
    const e2eSibling = input({ project: 'e2e', parentKey: 'e2e > file.test.ts > flow', attempts: [{ status: 'skipped', durationMs: 0 }] });
    const [, s] = buildOutcomeRecords([smokeRoot, e2eSibling]);
    expect(s).toMatchObject({ class: 'failed', cause: 'setup-cascade', rootTestId: null });
  });

  it('a cascade with no failed sibling has no root', () => {
    expect(one({ attempts: [{ status: 'skipped', durationMs: 0 }] }).rootTestId).toBeNull();
  });

  it('a zero-result test whose (transitive) dependency failed is a setup failure', () => {
    const setup = input({ project: 'global-setup', attempts: [{ status: 'failed', durationMs: 1 }] });
    const uiSetup = input({ project: 'ui-setup', attempts: [] });
    const e2e = input({ project: 'e2e', attempts: [] });
    const deps = { 'ui-setup': ['global-setup'], 'e2e': ['ui-setup'] };
    const [, u, e] = buildOutcomeRecords([setup, uiSetup, e2e], deps);

    expect(u).toMatchObject({ class: 'failed', cause: 'dependency-failed', testStatus: 'BLOCKED', rootTestId: setup.id });
    expect(e).toMatchObject({ class: 'failed', cause: 'dependency-failed', rootTestId: setup.id });
  });

  it('a zero-result test with healthy dependencies is not run (max-failures, interrupt)', () => {
    const [r] = buildOutcomeRecords([input({ project: 'e2e', attempts: [] })], { e2e: ['ui-setup'] });
    expect(r).toMatchObject({ class: 'skipped', cause: 'not-run', testStatus: 'NOT RUN', rootTestId: null });
  });

  it('classifies the last attempt and flags a flaky pass', () => {
    const r = one({ attempts: [{ status: 'failed', durationMs: 4 }, { status: 'passed', durationMs: 6 }] });
    expect(r).toMatchObject({ class: 'passed', flaky: true, attempts: 2, durationMs: 10 });
  });

  it('opens an action item for an unexpected pass and for a keyless expected failure', () => {
    const up = one({ expectedStatus: 'failed', tags: ['@blocked:BK-5'], annotations: [{ type: 'fail' }] });
    expect(up).toMatchObject({ class: 'unexpected-pass', knownDefect: 'BK-5', actionItem: 'unexpected-pass', testStatus: 'PASSED' });

    const keyless = one({ expectedStatus: 'failed', annotations: [{ type: 'fail' }], attempts: [{ status: 'failed', durationMs: 1 }] });
    expect(keyless).toMatchObject({ class: 'known-defect', knownDefect: null, actionItem: 'known-defect-without-key' });

    const keyed = one({ expectedStatus: 'failed', annotations: [{ type: 'fail', description: 'Blocked by BK-6' }], attempts: [{ status: 'failed', durationMs: 1 }] });
    expect(keyed).toMatchObject({ class: 'known-defect', knownDefect: 'BK-6', actionItem: null });
  });

  it('collects the @atc ids from annotations, deduplicated', () => {
    const r = one({ annotations: [{ type: 'atc', description: 'BK-T1' }, { type: 'atc', description: 'BK-T1' }, { type: 'atc', description: 'BK-T2' }] });
    expect(r.atcIds).toEqual(['BK-T1', 'BK-T2']);
  });

  it('keeps the skip reason only on skipped records', () => {
    expect(one({ expectedStatus: 'skipped', annotations: [{ type: 'fixme', description: 'broken' }], attempts: [{ status: 'skipped', durationMs: 0 }] }).skipReason)
      .toBe('fixme: broken');
    expect(one().skipReason).toBeNull();
  });
});

describe('errorLine', () => {
  it('strips ANSI, keeps the first line and truncates', () => {
    const esc = String.fromCharCode(27);
    expect(errorLine(`${esc}[31mboom${esc}[39m\nstack`)).toBe('boom');
    expect(errorLine('x'.repeat(400))?.length).toBe(303);
    expect(errorLine(undefined)).toBeNull();
  });
});

describe('fix round: the reviewer probes (VERIFY M1, M2, S4, N10)', () => {
  it('M1: a test.fail test that times out is failed / timeout, never a reproduced known defect', () => {
    const r = one({
      expectedStatus: 'failed',
      annotations: [{ type: 'known-defect', description: 'BK-997' }, { type: 'fail', description: 'Blocked by BK-997' }],
      attempts: [{ status: 'timedOut', durationMs: 60000 }, { status: 'timedOut', durationMs: 60000 }],
    });
    expect(r).toMatchObject({ class: 'failed', cause: 'timeout', testStatus: 'FAILED', knownDefect: null, actionItem: null });
    const h = outcomeHeadline(summarizeOutcomes([r]), 'failed');
    expect(h.text).toBe('EXECUTION FAILED: 1 FAILED');
  });

  it('M2: free text in a test.fail reason never mints a defect key and the headline stays red', () => {
    for (const reason of ['Broken UTF-8 handling', 'ISO-8601 dates off by one', 'SHA-256 mismatch', 'HTTP-2 only']) {
      const r = one({ expectedStatus: 'failed', annotations: [{ type: 'fail', description: reason }], attempts: [{ status: 'failed', durationMs: 1 }] });
      expect(r).toMatchObject({ class: 'known-defect', knownDefect: null, actionItem: 'known-defect-without-key' });
      expect(outcomeHeadline(summarizeOutcomes([r])).ok).toBe(false);
    }
  });

  it('M2: a key is read only from a whole marker value or the "Blocked by <KEY>" form', () => {
    expect(knownDefectKey({ annotations: [{ type: 'known-defect', description: 'see UTF-8' }], tags: ['@blocked:BK-1 and more'] })).toBeNull();
    expect(knownDefectKey({ annotations: [{ type: 'fail', description: 'Blocked by BK-12: parser drops the BOM' }], tags: [] })).toBe('BK-12');
    expect(knownDefectKey({ annotations: [{ type: 'fail', description: 'Fails until BK-12 ships' }], tags: [] })).toBeNull();
  });

  it('S4: a setup project failing only through an unexpected pass marks its dependents dependency-failed', () => {
    const setup = input({ project: 'setup', expectedStatus: 'failed', tags: ['@blocked:BK-3'], annotations: [{ type: 'fail' }] });
    const dependent = input({ project: 'e2e', attempts: [] });
    const [, d] = buildOutcomeRecords([setup, dependent], { e2e: ['setup'] });
    expect(d).toMatchObject({ class: 'failed', cause: 'dependency-failed', testStatus: 'BLOCKED', rootTestId: setup.id });
  });

  it('N11: a listing is recognised and never reads as passed', () => {
    expect(isListOnlyRun('passed', [input({ attempts: [] }), input({ attempts: [] })])).toBe(true);
    expect(isListOnlyRun('passed', [input({ attempts: [] }), input()])).toBe(false);
    expect(isListOnlyRun('interrupted', [input({ attempts: [] })])).toBe(false);
    expect(isListOnlyRun('passed', [])).toBe(false);
    expect(listedHeadline(14)).toBe('LISTED 14 TESTS, NONE RUN');
  });

  it('N10: a test.fail test that passed first and failed on retry is flaky', () => {
    const r = one({ expectedStatus: 'failed', tags: ['@blocked:BK-4'], annotations: [{ type: 'fail' }], attempts: [{ status: 'passed', durationMs: 1 }, { status: 'failed', durationMs: 1 }] });
    expect(r).toMatchObject({ class: 'known-defect', flaky: true });
    expect(one({ attempts: [{ status: 'passed', durationMs: 1 }] }).flaky).toBe(false);
  });
});

describe('outcomeHeadline: the headline cannot read green over a hidden failure', () => {
  const records = (inputs: Partial<OutcomeInput>[], deps: Record<string, string[]> = {}) =>
    buildOutcomeRecords(inputs.map(i => input(i)), deps);

  it('says ALL TESTS PASSED only when every test passed', () => {
    expect(outcomeHeadline(summarizeOutcomes(records([{}, {}])))).toEqual({ ok: true, text: 'ALL TESTS PASSED' });
  });

  it('names known defects and skips on a green run', () => {
    const s = summarizeOutcomes(records([
      {},
      { expectedStatus: 'failed', annotations: [{ type: 'fail', description: 'Blocked by BK-1' }], attempts: [{ status: 'failed', durationMs: 1 }] },
      { expectedStatus: 'skipped', annotations: [{ type: 'skip' }], attempts: [{ status: 'skipped', durationMs: 0 }] },
    ]));
    expect(outcomeHeadline(s)).toEqual({ ok: true, text: 'PASSED WITH 1 KNOWN DEFECT, 1 SKIPPED' });
  });

  it('fails a run whose only problems are a setup cascade Playwright calls ok()', () => {
    const s = summarizeOutcomes(records([
      { parentKey: 'c', attempts: [{ status: 'failed', durationMs: 1 }] },
      { parentKey: 'c', attempts: [{ status: 'skipped', durationMs: 0 }] },
      { parentKey: 'c', attempts: [{ status: 'skipped', durationMs: 0 }] },
    ]));
    expect(s.setupFailures).toBe(2);
    const h = outcomeHeadline(s);
    expect(h.ok).toBe(false);
    expect(h.text).toBe('EXECUTION FAILED: 3 FAILED (2 NOT OBSERVED: SETUP FAILED, BLOCKED ON THE BOARD, 1 ASSERTION/TIMEOUT)');
  });

  it('fails on an unexpected pass, a keyless expected failure, a not-run test or an interrupted run', () => {
    const up = summarizeOutcomes(records([{ expectedStatus: 'failed', tags: ['@blocked:BK-1'], annotations: [{ type: 'fail' }] }]));
    expect(outcomeHeadline(up)).toEqual({ ok: false, text: 'EXECUTION FAILED: 1 UNEXPECTED PASS' });

    const keyless = summarizeOutcomes(records([{ expectedStatus: 'failed', annotations: [{ type: 'fail' }], attempts: [{ status: 'failed', durationMs: 1 }] }]));
    expect(outcomeHeadline(keyless).text).toBe('EXECUTION FAILED: 1 EXPECTED FAILURE WITHOUT A DEFECT KEY');

    const notRun = summarizeOutcomes(records([{}, { attempts: [] }]));
    expect(outcomeHeadline(notRun).text).toBe('EXECUTION FAILED: 1 NOT RUN');

    expect(outcomeHeadline(summarizeOutcomes(records([{}])), 'interrupted').text).toBe('EXECUTION FAILED: RUN INTERRUPTED');
  });

  it('a failed run with clean records is never green (error outside any test)', () => {
    expect(outcomeHeadline(summarizeOutcomes(records([{}])), 'failed'))
      .toEqual({ ok: false, text: 'EXECUTION FAILED: ERROR OUTSIDE ANY TEST' });
  });

  it('an empty run is never green', () => {
    expect(outcomeHeadline(summarizeOutcomes([]))).toEqual({ ok: false, text: 'NO TESTS RAN' });
  });
});

describe('action items and the step summary', () => {
  it('lists unexpected passes, keyless expected failures and each setup root once', () => {
    const root = input({ title: 'auth setup', project: 'ui-setup', attempts: [{ status: 'failed', durationMs: 1 }] });
    const recs = buildOutcomeRecords([
      root,
      input({ title: 'dep a', project: 'e2e', attempts: [] }),
      input({ title: 'dep b', project: 'e2e', attempts: [] }),
      input({ title: 'fixed already', expectedStatus: 'failed', tags: ['@blocked:BK-3'], annotations: [{ type: 'fail' }] }),
    ], { e2e: ['ui-setup'] });
    const lines = actionItemLines(recs);
    expect(lines).toContain('UNEXPECTED PASS: fixed already [e2e] (expected failure for BK-3): retest the defect, then remove the expected-failure marker');
    expect(lines).toContain('SETUP FAILED: auth setup [ui-setup] took down 2 tests (counted FAILED here, BLOCKED on the board: not observed)');
  });

  it('renders counts and action items without error text', () => {
    const recs = buildOutcomeRecords([
      input({ attempts: [{ status: 'failed', durationMs: 1, error: 'secret-ish detail' }] }),
      input({ expectedStatus: 'failed', tags: ['@blocked:BK-3'], annotations: [{ type: 'fail' }] }),
    ]);
    const md = stepSummaryMarkdown(summarizeOutcomes(recs), recs);
    expect(md).toContain('**NOT OK: EXECUTION FAILED: 1 FAILED, 1 UNEXPECTED PASS**');
    expect(md).toContain('| Unexpected passes | 1 |');
    expect(md).not.toContain('secret-ish detail');
  });
});
