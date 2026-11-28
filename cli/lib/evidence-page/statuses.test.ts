import type { BugStatus, Tone, Verdict } from './statuses.ts';

import { describe, expect, it } from 'bun:test';
import { BUG_BUCKETS, TEST_STATUSES } from '../sprint-source/types.ts';
import { BUG_BUCKET_OF, BUG_STATUSES, CASE_STATUSES, EVIDENCE_STATUSES, TONE_OF, VERDICTS } from './statuses.ts';

// Every member of each union, once: a status added to a type but not to the JSON (or the reverse) fails below
const BUG: Record<BugStatus, true> = { 'OPEN': true, 'FIXED': true, 'RETEST PASSED': true, 'RETEST FAILED': true, 'DEFECT': true };
const VERDICT: Record<Verdict, true> = { 'PASSED': true, 'FAILED': true, 'PENDING': true, 'PASSED WITH DEFERRALS': true };
const TONES: Record<Tone, true> = { ok: true, defect: true, pending: true, neutral: true };

describe('statuses.json, the shared status enum', () => {
  it('holds the case statuses of the sprint source, in its order', () => {
    expect([...CASE_STATUSES]).toEqual([...TEST_STATUSES]);
  });

  it('matches the TypeScript unions exactly', () => {
    expect([...BUG_STATUSES].sort() as string[]).toEqual(Object.keys(BUG).sort());
    expect([...VERDICTS].sort() as string[]).toEqual(Object.keys(VERDICT).sort());
  });

  it('has one known tone for every status and nothing else', () => {
    expect(Object.keys(TONE_OF).sort()).toEqual([...EVIDENCE_STATUSES].sort());
    for (const status of EVIDENCE_STATUSES) {
      expect(Object.keys(TONES)).toContain(TONE_OF[status]);
    }
  });

  it('maps every bug status onto a board bug bucket', () => {
    expect(Object.keys(BUG_BUCKET_OF).sort()).toEqual([...BUG_STATUSES].sort());
    for (const status of BUG_STATUSES) {
      expect(BUG_BUCKETS as readonly string[]).toContain(BUG_BUCKET_OF[status]);
    }
  });

  it('names a signed-off deferral as the doctrine does, never in the pass colour', () => {
    expect(VERDICTS).toContain('PASSED WITH DEFERRALS');
    expect(TONE_OF['PASSED WITH DEFERRALS']).toBe('pending');
  });

  it('keeps the values the Sprint Board already maps (add-only)', () => {
    expect(BUG_STATUSES.slice(0, 4)).toEqual(['OPEN', 'FIXED', 'RETEST PASSED', 'RETEST FAILED']);
    expect(TONE_OF['RETEST PASSED']).toBe('ok');
    expect(BUG_BUCKET_OF['RETEST PASSED']).toBe('resolved');
  });
});
