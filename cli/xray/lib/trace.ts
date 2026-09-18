/**
 * Xray CLI - Traceability Verification Module
 *
 * Pure evaluation of the three-edge check
 * (`agentic-qa-core/references/traceability-linking.md` §10): given a Story's
 * Jira issue links and the test lists of the artifacts they point at, decide
 * per edge whether traceability holds.
 *
 * The four verdicts are:
 *   1. `Story↔ATS`  — the COVERAGE edge. The Test Set must appear under
 *                     `inwardIssue` in the Story's `issuelinks` entry for the
 *                     `test` link type. Measured: that is the only shape Xray's
 *                     coverage panel counts, and the only edge it counts at all.
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
   * Id of the LINK itself (`issuelinks[].id`), carried so a remediation can
   * name the exact link to remove instead of telling an operator to find it.
   */
  linkId: string
  /**
   * Which FIELD the artifact appears under in the STORY's entry — the raw
   * shape, not a semantic reading. `inward` (the entry carries
   * `inwardIssue: <artifact>`) is the shape Xray's coverage panel counts;
   * `outward` is a link that exists and covers nothing.
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
  /**
   * `issuelinks[].id` of the artifact's link to the Story, when one exists.
   * Null on `lists-match` (no single link backs that edge) and on a missing
   * artifact (there is no link to name an id for).
   */
  linkId: string | null
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
 * appears under `inwardIssue` in the Story's entry — the shape Xray's coverage
 * panel counts.
 *
 * `linkTypeName` comes from the `.agents/jira-required.yaml` catalog, so a
 * workspace that renamed its link type is still matched by its own name.
 *
 * The inverted-link remediation is deliberately TWO commands, the first of
 * which refuses to run without `--yes`. It used to read "delete the inverted
 * link in Jira, then: link create ...", with no link id and no confirmation
 * step, on a gate that exits 1 — a destructive instruction an operator ran on
 * live data. It also could not have worked as a one-liner: Jira dedupes a link
 * between the same pair and type regardless of direction, so the recreate half
 * is a silent no-op until the delete lands.
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
      linkId: null,
    };
  }

  const { key, linkTypeName: actual, storySide, linkId } = spec.artifact;

  if (normalize(actual) !== normalize(linkTypeName)) {
    return {
      ...base,
      status: 'FAIL',
      detail: `${key} is linked by "${actual}", not "${linkTypeName}"`,
      remediation: fix(key),
      linkId,
    };
  }

  if (storySide !== 'inward') {
    return {
      ...base,
      status: 'FAIL',
      detail: `${key} sits under outwardIssue in ${storyKey}'s issuelinks — the link exists and carries no coverage`,
      remediation:
        `review link id ${linkId} on ${storyKey}, then replace it (Jira dedupes the pair+type, `
        + 'so the create is a no-op until the delete lands): '
        + `bun xray link delete --id ${linkId} --dry-run  →  `
        + `bun xray link delete --id ${linkId} --yes  →  ${fix(key)}`,
      linkId,
    };
  }

  return { ...base, status: 'PASS', detail: `${key} (${actual})`, remediation: null, linkId };
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
      linkId: null,
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
    return { ...base, status: 'PASS', detail: `${lists.ats.length} test(s) in all three`, remediation: null, linkId: null };
  }

  return {
    ...base,
    status: 'FAIL',
    detail: problems.join('; '),
    remediation: fixes.length > 0 ? fixes.join(' && ') : null,
    linkId: null,
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
