/**
 * Xray CLI - Traceability Verification Module
 *
 * Pure evaluation of the three-edge check
 * (`agentic-qa-core/references/traceability-linking.md` §10): given a Story's
 * Jira issue links and the test lists of the artifacts they point at, decide
 * per edge whether traceability holds.
 *
 * The four verdicts are:
 *   1. `Story↔ATS`  — the COVERAGE edge. The Test Set must be the outward party
 *                     of a `test` link, so the Story reads "is tested by". This
 *                     is the only edge Xray's coverage panel counts.
 *   2. `ATP↔Story`  — administrative. Same link type, same direction.
 *   3. `ATR↔Story`  — administrative. Same link type, same direction.
 *   4. list parity  — ATS membership == ATP test list == ATR test list. That
 *                     membership is Xray-internal (§9), invisible to the link
 *                     reads, which is why it is a separate edge.
 *
 * Pure (records in, verdicts out): the command wrapper owns Jira REST and the
 * Xray GraphQL reads, so every rule below is testable without credentials.
 */

/** One linked issue as seen FROM the Story's own `issuelinks`. */
export interface TraceLinkRecord {
  key: string
  /** Jira issue type display name (`Test Set`, `Test Plan`, `Test Execution`, ...). */
  issueType: string
  summary: string
  /** Display name of the link type on this instance (never hardcoded upstream). */
  linkTypeName: string
  /**
   * Which side of the link the STORY sits on. `inward` means the linked issue
   * is the outward party — the Story reads the inward description
   * ("is tested by"), which is the direction coverage requires.
   */
  storySide: 'inward' | 'outward'
}

export type EdgeStatus = 'PASS' | 'FAIL';

export interface TraceEdge {
  id: 'story-ats' | 'atp-story' | 'atr-story' | 'lists-match'
  label: string
  status: EdgeStatus
  /** What was found, in one line. */
  detail: string
  /** The exact command that fixes it, or null when the edge passes. */
  remediation: string | null
}

export interface TraceArtifacts {
  ats: TraceLinkRecord | null
  atp: TraceLinkRecord | null
  atr: TraceLinkRecord | null
  /** Further candidates of each type, so an ambiguous link graph stays visible. */
  ambiguous: { ats: string[], atp: string[], atr: string[] }
}

// ============================================================================
// ARTIFACT RESOLUTION
// ============================================================================

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** True when `issueType` names the Xray container `kind` (`Re-Test Execution` counts as an execution). */
function isKind(issueType: string, kind: 'test set' | 'test plan' | 'test execution'): boolean {
  return normalize(issueType).includes(kind);
}

/**
 * Pick the canonical artifact among same-typed candidates.
 *
 * The ratified title grammar wins: `ATS: {STORY_KEY}` / `ATP: …` / `ATR: …`
 * names the Story's own artifact, so a Story linked to both its ATS and a
 * feature-level `TS:` Set resolves to the right one. Beyond that, a title
 * carrying the acronym at all beats one that does not, and link order decides
 * the rest. Every unpicked candidate is reported as ambiguity, never dropped.
 */
function pick(
  candidates: TraceLinkRecord[],
  acronym: 'ATS' | 'ATP' | 'ATR',
  storyKey: string,
): { chosen: TraceLinkRecord | null, rest: string[] } {
  if (candidates.length === 0) {
    return { chosen: null, rest: [] };
  }
  const exact = `${acronym.toLowerCase()}: ${normalize(storyKey)}`;
  const chosen
    = candidates.find(c => normalize(c.summary).startsWith(exact))
      ?? candidates.find(c => normalize(c.summary).startsWith(`${acronym.toLowerCase()}:`))
      ?? candidates[0];
  return { chosen, rest: candidates.filter(c => c !== chosen).map(c => c.key) };
}

export function resolveTraceArtifacts(storyKey: string, links: TraceLinkRecord[]): TraceArtifacts {
  const sets = pick(links.filter(l => isKind(l.issueType, 'test set')), 'ATS', storyKey);
  const plans = pick(links.filter(l => isKind(l.issueType, 'test plan')), 'ATP', storyKey);
  const execs = pick(links.filter(l => isKind(l.issueType, 'test execution')), 'ATR', storyKey);

  return {
    ats: sets.chosen,
    atp: plans.chosen,
    atr: execs.chosen,
    ambiguous: { ats: sets.rest, atp: plans.rest, atr: execs.rest },
  };
}

// ============================================================================
// EDGE VERDICTS
// ============================================================================

export interface EdgeSpec {
  id: TraceEdge['id']
  label: string
  /** Acronym used in the remediation hint and the "not linked" message. */
  acronym: 'ATS' | 'ATP' | 'ATR'
  artifact: TraceLinkRecord | null
}

/**
 * Verify one link edge: the artifact exists, carries the `test` link type, and
 * sits on the OUTWARD side so the Story reads "is tested by".
 *
 * `linkTypeName` comes from the `.agents/jira-required.yaml` catalog, so a
 * workspace that renamed its link type is still matched by its own name.
 */
export function checkLinkEdge(spec: EdgeSpec, linkTypeName: string, storyKey: string): TraceEdge {
  const base = { id: spec.id, label: spec.label } as const;
  const fix = (artifactKey: string): string =>
    `bun xray link create ${artifactKey} ${storyKey} --type test`;

  if (spec.artifact === null) {
    return {
      ...base,
      status: 'FAIL',
      detail: `no ${spec.acronym} linked to ${storyKey}`,
      remediation: fix(`<${spec.acronym}_KEY>`),
    };
  }

  const { key, linkTypeName: actual, storySide } = spec.artifact;

  if (normalize(actual) !== normalize(linkTypeName)) {
    return {
      ...base,
      status: 'FAIL',
      detail: `${key} is linked by "${actual}", not "${linkTypeName}"`,
      remediation: fix(key),
    };
  }

  if (storySide !== 'inward') {
    return {
      ...base,
      status: 'FAIL',
      detail: `${key} is linked the wrong way round — ${storyKey} is the outward party, so it does not read "is tested by"`,
      remediation: `delete the inverted link in Jira, then: ${fix(key)}`,
    };
  }

  return { ...base, status: 'PASS', detail: `${key} (${actual})`, remediation: null };
}

// ============================================================================
// LIST PARITY
// ============================================================================

export interface MembershipLists {
  /** Test keys in the ATS, or null when there is no ATS to read. */
  ats: string[] | null
  atp: string[] | null
  atr: string[] | null
}

export interface MembershipKeys {
  ats: string | null
  atp: string | null
  atr: string | null
}

function missingFrom(source: string[], target: string[]): string[] {
  const have = new Set(target.map(normalize));
  return [...new Set(source)].filter(k => !have.has(normalize(k)));
}

/**
 * Verify that the ATS membership, the ATP test list and the ATR test list hold
 * the same Tests.
 *
 * The ATS is the source of truth (Set-first: the Plan and the Run derive their
 * lists from it), so the remediation is always a cascade FROM the Set, never a
 * per-test add. A container the ATS does not cover is reported as an extra, not
 * silently accepted: a Run carrying tests the Set never had means the Set is
 * stale, and that is the fact worth seeing.
 */
export function checkMembership(lists: MembershipLists, keys: MembershipKeys): TraceEdge {
  const base = { id: 'lists-match' as const, label: 'ATS membership == ATP test list == ATR test list' };

  if (lists.ats === null) {
    return {
      ...base,
      status: 'FAIL',
      detail: 'no ATS to compare against — the Plan and the Run derive their lists from its membership',
      remediation: null,
    };
  }

  const problems: string[] = [];
  const fixes: string[] = [];

  for (const [acronym, list, key, cascade] of [
    ['ATP', lists.atp, keys.atp, 'plan add-set'],
    ['ATR', lists.atr, keys.atr, 'exec add-set'],
  ] as const) {
    if (list === null) {
      problems.push(`no ${acronym} to compare`);
      continue;
    }
    const absent = missingFrom(lists.ats, list);
    const extra = missingFrom(list, lists.ats);
    if (absent.length > 0) {
      problems.push(`${acronym} is missing ${absent.join(', ')}`);
      if (key !== null && keys.ats !== null) {
        fixes.push(`bun xray ${cascade} ${key} --set ${keys.ats}`);
      }
    }
    if (extra.length > 0) {
      problems.push(`${acronym} carries ${extra.join(', ')}, absent from the ATS`);
    }
  }

  if (problems.length === 0) {
    return { ...base, status: 'PASS', detail: `${lists.ats.length} test(s) in all three`, remediation: null };
  }

  return {
    ...base,
    status: 'FAIL',
    detail: problems.join('; '),
    remediation: fixes.length > 0 ? fixes.join(' && ') : null,
  };
}

// ============================================================================
// VERDICT
// ============================================================================

/**
 * Traceability holds ONLY when every edge passes. A missing administrative edge
 * is a FAIL, not a warning: the coverage edge alone leaves the next consumer
 * walking `issuelinks` from the Plan or the Run with nothing to find.
 */
export function traceVerdict(edges: TraceEdge[]): { ok: boolean, failed: TraceEdge[] } {
  const failed = edges.filter(e => e.status === 'FAIL');
  return { ok: failed.length === 0, failed };
}
