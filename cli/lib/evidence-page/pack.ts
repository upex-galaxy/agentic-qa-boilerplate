/**
 * @fileoverview The evidence pack `evidence-pack/2.0`: its TypeScript shape (ADR-0022).
 *
 * The pack is the reference implementation's format under a generic id: the
 * ticket and its verdict, the environment strip, the cases (`tcs`) with their
 * typed evidence items and an optional compare, the bugs filed, the images
 * with their redactions, and the retest rounds. Field meanings live in the
 * `evidence-artifact` skill, `references/pack-schema.md`.
 *
 * The VALIDATOR is the skill's `scripts/build.py` (one validator, the one that
 * renders the page): `bun run evidence build` and `record` call it. These
 * types serve the TypeScript readers of a pack: the host seam, the demo and
 * the Sprint Board.
 */

import type { BugStatus, CaseStatus, Verdict } from './statuses.ts';

export const PACK_SCHEMA = 'evidence-pack/2.0';

/** Used when the project has no `board:` block: Xray Test keys share the project key, so one shape holds. */
export const GENERIC_TICKET_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export type PackKind = 'story' | 'bug';
export type CaseKind = 'tc' | 'repro' | 'retest';
export type ItemResult = 'defect' | 'pass' | 'info';
export type Coords = 'px' | 'fraction';
export type MarkShape = 'rect' | 'ellipse' | 'arrow' | 'path' | 'bubble';
export type MarkTone = 'defect' | 'ok' | 'note';
/** A compare side's tone: the mark tones plus `before`, the amber BEFORE FIX of a retest. */
export type CompareTone = MarkTone | 'before';
export type TimelineState = 'ok' | 'req' | 'wait' | 'bad';

export const EVIDENCE_HOSTS = ['claude-artifact', 'local'] as const;
export type EvidenceHost = (typeof EVIDENCE_HOSTS)[number];

export type Point = [number, number];
/** `[x, y, w, h]` in the screenshot's own pixels. */
export type RedactBox = [number, number, number, number];

export interface Annotation {
  n?: number | string
  shape: MarkShape
  tone?: MarkTone
  title?: string
  explain?: string
  layer?: string
  text?: string
  x?: number
  y?: number
  w?: number
  h?: number
  cx?: number
  cy?: number
  rx?: number
  ry?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  pts?: Point[]
}

interface ItemCommon {
  label?: string
  caption?: string
  result?: ItemResult
  round?: number
  flags?: string[]
  note?: string
  alt?: string
  /** Written by the builder: an item from an earlier round. */
  hist?: boolean
  histRound?: number
}

export interface ImageItem extends ItemCommon { type: 'image', ref: string, annotations?: Annotation[], coords?: Coords }
export interface ApiItem extends ItemCommon { type: 'api', method?: string, url?: string, status?: number | string, ms?: number | string, request?: string, response?: string, curl?: string }
export interface SqlItem extends ItemCommon { type: 'sql', db?: string, when?: string, query?: string, columns?: string[], rows?: Array<Array<string | number | boolean | null>>, hl?: number[], okRows?: number[] }
export interface TimelineEvent { t: number, label: string, rows?: number, state: TimelineState }
export interface TimelineItem extends ItemCommon { type: 'timeline', title?: string, events: TimelineEvent[], source?: string }
export interface NoteItem extends ItemCommon { type: 'note', title?: string, body: string }
export type EvidenceItem = ImageItem | ApiItem | SqlItem | TimelineItem | NoteItem;

export interface CompareSide {
  image: string
  label?: string
  detail?: string
  annotations?: Annotation[]
  coords?: Coords
  round?: number
  tone?: CompareTone
  /** Written by the builder: the short word the compare hint uses. */
  short?: string
}

export interface Compare { left: CompareSide, right: CompareSide, caption?: string }

export interface Case {
  id: string
  title: string
  status: CaseStatus | BugStatus
  note?: string
  kind?: CaseKind
  round?: number
  date?: string
  severity?: string
  priority?: string
  from?: string
  url?: string
  evidence?: EvidenceItem[]
  compare?: Compare
  hist?: boolean
  histRound?: number
}

export interface OwnerOk {
  by: string
  at: string
  cases: string[]
  pointer?: string
  record?: string
}

export interface Deferral { label?: string, ok?: OwnerOk }

export interface Ticket {
  id: string
  title: string
  module?: string
  verdict: Verdict
  verdictNote?: string
  severity?: string
  priority?: string
  bugs?: string[]
  parent?: string
  parentTitle?: string
  case?: string
  assignee?: string
  qa?: string
  date?: string
  atp?: string
  atr?: string
  deferral?: Deferral
}

export interface ImageDecl {
  /** Repo-relative (or absolute, inside the repo) screenshot path. */
  file?: string
  redact?: RedactBox[]
  /** An image recovered from a page by `extract`: the bytes inline. */
  src?: string
  w?: number
  h?: number
  bytes?: number
}

export interface Round { round: number, date?: string, build?: string }

export interface Artifact { url?: string, path?: string, published?: string[] }

export interface Pack {
  schema: typeof PACK_SCHEMA
  kind: PackKind
  ticket: Ticket
  env: Record<string, string>
  summary: string
  repro?: { steps?: string[], frequency?: string, expected?: string, actual?: string }
  images?: Record<string, ImageDecl>
  tcs: Case[]
  bugs?: Case[]
  artifact?: Artifact
  currentRound?: number
  rounds?: Round[]
}
