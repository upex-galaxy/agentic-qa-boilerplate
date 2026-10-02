/**
 * Regression tests for `scripts/git-policy.ts`.
 *
 * Two defects, one test file:
 *
 * 1. ACCEPTED DIVERGENCES. `.agents/project.yaml` lists
 *    `git_strategy.policy.accepted_divergences`, and `AGENTS.md` → "Git Strategy"
 *    promises that `verify` reports a listed divergence as ACCEPTED and exits 0,
 *    and that `apply` carries the host's side of an accepted field forward
 *    instead of deriving it away. `classifyAccepted` and `buildRules` hold that
 *    promise; until they were tested, nothing did.
 *
 * 2. THE BYPASS READ. GitHub serves `bypass_actors` only to a caller with admin
 *    rights on the repository. A non-admin receives the SAME, unchanged ruleset
 *    with that key omitted. `verify` coerced the missing key to `[]`, concluded
 *    "no admin bypass is configured", and reported `admin_bypass declared: true /
 *    enforced: false` — exit 1, blocking `repo:check` and the pre-push hook on
 *    any machine whose active `gh` account had drifted to a second identity.
 *    Nothing on the host had changed; only the reader had.
 *
 * The bypass fixtures below are TRIMMED COPIES OF REAL RESPONSES, captured on
 * 2026-09-18 from `gh api repos/upex-galaxy/agentic-qa-boilerplate/rulesets/16809531`
 * under two accounts, against one ruleset whose `updated_at` was three days old
 * in both readings. That identity is the entire point: same ruleset, two shapes.
 */

import type { AcceptedDivergence, Finding, GitStrategy, Rule } from './git-policy.ts';

import { describe, expect, test } from 'bun:test';

import { acceptedFields, assessBypass, buildRules, classifyAccepted } from './git-policy.ts';

const ACCEPTED_DIRECT_PUSH: AcceptedDivergence = {
  field: 'main.direct_push_to_protected',
  enforced: 'blocked (pull_request rule)',
  accepted: '2026-08-21',
  reason: 'Admin credential pushes directly; the host rule protects everyone else.',
};

function strategy(overrides: Partial<GitStrategy['policy']> = {}): GitStrategy {
  return {
    strategy: 'solo-main',
    branches: { production: 'main', integration: null, ephemeral_pattern: null },
    protected: ['main'],
    decisions: { promote_method: 'n/a', feature_merge: 'n/a', hotfix_policy: 'n/a' },
    policy: { direct_push_to_protected: 'allowed', admin_bypass: true, require_pr_reviews: 1, ...overrides },
    meta: {},
  };
}

function directPushDrift(): Finding {
  return {
    severity: 'drift',
    field: 'main.direct_push_to_protected',
    declared: 'allowed',
    enforced: 'blocked (a pull_request rule covers this branch)',
  };
}

const HOST_PR_RULE: Rule = {
  type: 'pull_request',
  parameters: { required_approving_review_count: 1, allowed_merge_methods: ['merge'] },
};

describe('classifyAccepted: a signed-off divergence is not drift', () => {
  test('a drift listed in accepted_divergences becomes ACCEPTED', () => {
    const findings = [directPushDrift()];
    const byField = classifyAccepted(findings, [ACCEPTED_DIRECT_PUSH]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('accepted');
    expect(byField.get('main.direct_push_to_protected')?.reason).toContain('Admin credential');
  });

  test('a drift NOT listed stays a drift', () => {
    const other: Finding = { severity: 'drift', field: 'main.require_pr_reviews', declared: '0', enforced: '1' };
    const findings = [other, directPushDrift()];
    classifyAccepted(findings, [ACCEPTED_DIRECT_PUSH]);
    expect(findings.map(f => f.severity)).toEqual(['drift', 'accepted']);
  });

  test('an entry with no matching drift is reported as a STALE info finding', () => {
    const findings: Finding[] = [];
    classifyAccepted(findings, [ACCEPTED_DIRECT_PUSH]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('info');
    expect(findings[0]?.field).toBe('main.direct_push_to_protected');
    expect(findings[0]?.enforced).toContain('STALE');
  });

  test('a field whose host side was UNKNOWN cannot prove its acceptance stale', () => {
    const accepted: AcceptedDivergence = { field: 'admin_bypass', reason: 'org policy' };
    const findings: Finding[] = [{ severity: 'info', unknown: true, field: 'admin_bypass', declared: 'true', enforced: 'UNKNOWN' }];
    classifyAccepted(findings, [accepted]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.enforced).toBe('UNKNOWN');
  });

  test('no accepted list leaves every finding untouched', () => {
    const findings = [directPushDrift()];
    classifyAccepted(findings, []);
    expect(findings[0]?.severity).toBe('drift');
  });

  test('entries without a field are ignored, not matched', () => {
    const findings = [directPushDrift()];
    classifyAccepted(findings, [{ field: '' }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('drift');
  });
});

describe('acceptedFields', () => {
  test('lists the field of every well-formed entry', () => {
    const gs = strategy({ accepted_divergences: [ACCEPTED_DIRECT_PUSH, { field: '' }] });
    expect(acceptedFields(gs)).toEqual(['main.direct_push_to_protected']);
  });

  test('an absent list is empty', () => {
    expect(acceptedFields(strategy())).toEqual([]);
  });
});

describe('buildRules: apply never bulldozes an accepted divergence', () => {
  test('accepted direct_push_to_protected carries the host pull_request rule forward verbatim', () => {
    const gs = strategy({ accepted_divergences: [ACCEPTED_DIRECT_PUSH] });
    const rules = buildRules(gs, false, [HOST_PR_RULE]);
    expect(rules.find(r => r.type === 'pull_request')).toBe(HOST_PR_RULE);
  });

  test('without the acceptance, `allowed` derives NO pull_request rule', () => {
    const rules = buildRules(strategy(), false, [HOST_PR_RULE]);
    expect(rules.some(r => r.type === 'pull_request')).toBe(false);
  });

  test('accepted with no host rule derives none either', () => {
    const gs = strategy({ accepted_divergences: [ACCEPTED_DIRECT_PUSH] });
    expect(buildRules(gs, false, []).some(r => r.type === 'pull_request')).toBe(false);
  });
});

/** Read by an account WITH admin rights: the key is present and populated. */
const PRIVILEGED = {
  id: 16809531,
  name: 'ProtectPublic',
  enforcement: 'active',
  updated_at: '2026-09-15T16:22:43.134-03:00',
  bypass_actors: [
    { actor_id: null, actor_type: 'OrganizationAdmin', bypass_mode: 'always' },
    { actor_id: 91127281, actor_type: 'User', bypass_mode: 'always' },
  ],
  current_user_can_bypass: 'always',
};

/** Read by an account WITHOUT admin rights: no `bypass_actors` key at all. */
const UNPRIVILEGED = {
  id: 16809531,
  name: 'ProtectPublic',
  enforcement: 'active',
  updated_at: '2026-09-15T16:22:43.134-03:00',
  current_user_can_bypass: 'never',
};

describe('assessBypass — the reader, not the ruleset', () => {
  test('an admin reading a populated bypass list gets a KNOWN answer', () => {
    const r = assessBypass(PRIVILEGED);
    expect(r.known).toBe(true);
    if (!r.known) { return; }
    expect(r.hasAdminBypass).toBe(true);
    expect(r.actors).toHaveLength(2);
  });

  test('a non-admin gets UNKNOWN, never "no bypass actors" — the regression', () => {
    const r = assessBypass(UNPRIVILEGED);
    expect(r.known).toBe(false);
    if (r.known) { return; }
    expect(r.currentUserCanBypass).toBe('never');
    // The message has to name the cause, or the reader re-litigates the host.
    expect(r.reason).toContain('bypass_actors');
    expect(r.reason).toContain('current_user_can_bypass: never');
  });

  test('the discriminator is the SHAPE of the field, not its length', () => {
    // A privileged read of a ruleset with no bypass actors is a present, EMPTY
    // array. Treating that as "unknown" would be the opposite bug: a genuinely
    // removed bypass would stop being reported.
    const empty = assessBypass({ ...PRIVILEGED, bypass_actors: [], current_user_can_bypass: 'always' });
    expect(empty.known).toBe(true);
    if (!empty.known) { return; }
    expect(empty.hasAdminBypass).toBe(false);
  });

  test('an explicit null bypass_actors is unknown, not empty', () => {
    const r = assessBypass({ ...UNPRIVILEGED, bypass_actors: null });
    expect(r.known).toBe(false);
  });

  test('an unreadable ruleset (403 / 404 / offline) is unknown, not empty', () => {
    const r = assessBypass(null);
    expect(r.known).toBe(false);
    if (r.known) { return; }
    expect(r.currentUserCanBypass).toBeNull();
    expect(r.reason).toContain('could not be read');
  });

  test('a repository-role bypass counts as admin bypass', () => {
    const r = assessBypass({ bypass_actors: [{ actor_type: 'RepositoryRole', bypass_mode: 'always' }] });
    expect(r.known).toBe(true);
    if (!r.known) { return; }
    expect(r.hasAdminBypass).toBe(true);
  });

  test('a non-admin actor list does not masquerade as admin bypass', () => {
    const r = assessBypass({ bypass_actors: [{ actor_type: 'User', bypass_mode: 'pull_requests_only' }] });
    expect(r.known).toBe(true);
    if (!r.known) { return; }
    expect(r.hasAdminBypass).toBe(false);
  });

  test('a response with no privilege hint still degrades to unknown', () => {
    const r = assessBypass({ id: 1, name: 'X' } as Record<string, unknown>);
    expect(r.known).toBe(false);
    if (r.known) { return; }
    expect(r.currentUserCanBypass).toBeNull();
  });
});

describe('module hygiene', () => {
  // Importing this file must not run the CLI. Without the `import.meta.main`
  // guard, `main()` sees bun test's argv, prints the help text and exits 0 —
  // which ends the whole test process before a single assertion runs.
  test('importing git-policy.ts does not execute its CLI', () => {
    expect(typeof assessBypass).toBe('function');
  });
});
