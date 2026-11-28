/**
 * @fileoverview The ONE status enum of the evidence page (ADR-0021, ADR-0022).
 *
 * The values live in `statuses.json`, read by this module AND by the
 * `evidence-artifact` skill's `scripts/build.py`, so the pack validator, the
 * page and the Sprint Board can never disagree on a status. Each field accepts
 * only its own subset: a case marked `RETEST PASSED` is refused by the
 * validator instead of rendering neutral. The list is ADD-ONLY.
 *
 * Case statuses ARE the sprint source's `TestStatus` (ADR-0019), so a case and
 * a TMS test speak the same vocabulary: PASSED and FAILED only on observation,
 * BLOCKED and DEFERRED as reasons a test is NOT RUN. `statuses.test.ts` holds
 * the JSON to these types.
 */

import type { BugBucket, TestStatus } from '../sprint-source/types.ts';

import data from './statuses.json' with { type: 'json' };

export const CASE_STATUSES = data.caseStatuses as readonly TestStatus[];
export type CaseStatus = TestStatus;

export type Verdict = 'PASSED' | 'FAILED' | 'PENDING' | 'PASSED WITH DEFERRALS';
export const VERDICTS = data.verdicts as readonly Verdict[];

export type BugStatus = 'OPEN' | 'FIXED' | 'RETEST PASSED' | 'RETEST FAILED' | 'DEFECT';
export const BUG_STATUSES = data.bugStatuses as readonly BugStatus[];

export type EvidenceStatus = CaseStatus | Verdict | BugStatus;
export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = [...new Set<EvidenceStatus>([...CASE_STATUSES, ...VERDICTS, ...BUG_STATUSES])];

export type Tone = 'ok' | 'defect' | 'pending' | 'neutral';

/** The colour of every status. */
export const TONE_OF = data.tones as Readonly<Record<EvidenceStatus, Tone>>;

/** Where a bug status lands in the board's bug buckets (`board.statuses.bugs`). */
export const BUG_BUCKET_OF = data.bugBuckets as Readonly<Record<BugStatus, BugBucket>>;

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
