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

import type { AcceptedDivergence, EvidenceContract, Finding, GitStrategy, Rule } from './git-policy.ts';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { parse as parseYaml } from 'yaml';

import { applyInsertions, planInsertions } from '../cli/lib/agents-schema.ts';

import {
  acceptedFields,
  actionsApprovalFinding,
  actionsSettingsPatch,
  approvedFromReviews,
  baseStrategy,
  assessBypass,
  buildRules,
  classifyAccepted,
  detectLoosening,
  DIRECT_PUSH_VALUES,
  directPushDeclared,
  directPushOpen,
  directPushPolicy,
  EDD_CHECK,
  eddGateReady,
  effectiveForApply,
  evidenceWorkflowWarning,
  expectedApprovals,
  headChecksVerdict,
  hostRequiresApproval,
  MANAGED_RULE_TYPES,
  MERGE_MODES,
  mergeDecision,
  mergeGuard,
  mergeMethodWidening,
  mergeMode,
  mergeModeDeclared,
  migrationFor,
  missingCheckRuns,
  missingRequiredChecks,
  prHeadCheckRuns,
  protectedBranches,
  pullRequestModeParams,
  pullRequestTargetFinding,
  pullRequestTargetVerdict,
  repoSettingsPatch,
  requiredCheckContexts,
  resolveIntegrationId,
  rulesetBody,
  slugFromRemote,
  softenUndeclared,
  spliceKeys,
  spliceMigration,
  statusChecksManaged,
  strategyForVerify,
  verifyExitCode,
} from './git-policy.ts';

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

  test('under a declared auto merge_mode the carried rule takes the mode approvals (a loosening of the host)', () => {
    const gs = strategy({ accepted_divergences: [ACCEPTED_DIRECT_PUSH], merge_mode: 'auto' });
    const pr = buildRules(gs, false, [HOST_PR_RULE]).find(r => r.type === 'pull_request');
    expect(pr?.parameters).toMatchObject({ ...HOST_PR_RULE.parameters, required_approving_review_count: 0, require_last_push_approval: false });
    expect(detectLoosening([HOST_PR_RULE], [pr!], 'o/r', 'main').join(' ')).toContain('approval');
  });

  test('under a declared human-approves merge_mode the carried rule requires the last-push approval', () => {
    const gs = strategy({ accepted_divergences: [ACCEPTED_DIRECT_PUSH], merge_mode: 'human-approves', require_pr_reviews: 2 });
    const pr = buildRules(gs, false, [HOST_PR_RULE]).find(r => r.type === 'pull_request');
    expect(pr?.parameters).toMatchObject({ required_approving_review_count: 2, require_last_push_approval: true });
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

describe('slugFromRemote: only a GitHub origin has host rules to read', () => {
  test('https and ssh GitHub remotes resolve to owner/repo', () => {
    expect(slugFromRemote('https://github.com/acme/qa.git')).toBe('acme/qa');
    expect(slugFromRemote('git@github.com:acme/qa.git')).toBe('acme/qa');
  });

  test('a local bare repo or another host resolves to nothing (verify then warns and exits 0)', () => {
    expect(slugFromRemote('/tmp/origin.git')).toBeNull();
    expect(slugFromRemote('https://gitlab.com/acme/qa.git')).toBeNull();
  });
});

describe('verifyExitCode: drift blocks only a chosen policy', () => {
  test('a chosen strategy with drift blocks', () => {
    expect(verifyExitCode(2, 'chosen')).toBe(1);
  });

  // A new project ships the inherited default and a repo with no ruleset yet:
  // blocking there refused its first push.
  test('an inherited strategy with drift warns and passes', () => {
    expect(verifyExitCode(2, 'inherited')).toBe(0);
  });

  test('no drift passes whatever the source', () => {
    expect(verifyExitCode(0, 'chosen')).toBe(0);
    expect(verifyExitCode(0, undefined)).toBe(0);
  });

  test('a missing source is not inherited: it keeps blocking', () => {
    expect(verifyExitCode(1, undefined)).toBe(1);
  });
});

function checksRule(checks: { context: string, integration_id?: number }[], strict = false): Rule {
  return { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: strict, required_status_checks: checks } };
}

function checksOf(rules: Rule[]): { context: string, integration_id?: number }[] {
  const rule = rules.find(r => r.type === 'required_status_checks');
  return (rule?.parameters?.required_status_checks ?? []) as { context: string, integration_id?: number }[];
}

function prParams(rules: Rule[]): Record<string, unknown> | undefined {
  return rules.find(r => r.type === 'pull_request')?.parameters;
}

describe('EDD constants', () => {
  test('the check name, push values and merge modes', () => {
    expect(EDD_CHECK).toBe('edd/evidence');
    expect(DIRECT_PUSH_VALUES).toEqual(['forbidden', 'confirm', 'allowed', 'evidence']);
    expect(MERGE_MODES).toEqual(['auto', 'human-approves', 'manual']);
    expect(MANAGED_RULE_TYPES.has('required_status_checks')).toBe(true);
  });
});

describe('directPushPolicy', () => {
  test('returns the declared value', () => {
    expect(directPushPolicy(strategy({ direct_push_to_protected: 'confirm' }))).toBe('confirm');
  });

  test('missing or null reads as evidence', () => {
    expect(directPushPolicy(strategy({ direct_push_to_protected: null }))).toBe('evidence');
    expect(directPushPolicy(strategy({ direct_push_to_protected: undefined }))).toBe('evidence');
    expect(directPushPolicy(null)).toBe('evidence');
  });
});

describe('directPushOpen: fail closed', () => {
  test('allowed and evidence need no pull_request rule', () => {
    expect(directPushOpen('allowed')).toBe(true);
    expect(directPushOpen('evidence')).toBe(true);
  });

  test('forbidden, confirm and unknown values are closed', () => {
    expect(directPushOpen('forbidden')).toBe(false);
    expect(directPushOpen('confirm')).toBe(false);
    expect(directPushOpen('yolo')).toBe(false);
    expect(directPushOpen('')).toBe(false);
  });
});

describe('mergeMode / mergeModeDeclared', () => {
  test('a declared mode is returned and counts as declared', () => {
    const gs = strategy({ merge_mode: 'manual' });
    expect(mergeMode(gs)).toBe('manual');
    expect(mergeModeDeclared(gs)).toBe(true);
  });

  test('missing or null reads as auto and is not declared', () => {
    expect(mergeMode(strategy())).toBe('auto');
    expect(mergeModeDeclared(strategy())).toBe(false);
    expect(mergeMode(strategy({ merge_mode: null }))).toBe('auto');
    expect(mergeModeDeclared(strategy({ merge_mode: null }))).toBe(false);
  });
});

describe('requiredCheckContexts', () => {
  test('edd/evidence first, then every static check that runs in ci, de-duplicated', () => {
    const contract: EvidenceContract = {
      static: [
        { id: 'format', cmd: 'bun run format:check', where: ['pre-push', 'ci'] },
        { id: 'local-only', where: ['pre-push'] },
        { id: 'repo-gates', where: ['ci'] },
        { id: 'format', where: ['ci'] },
        { id: EDD_CHECK, where: ['ci'] },
        { id: 'no-where' },
      ],
    };
    expect(requiredCheckContexts(contract)).toEqual([EDD_CHECK, 'format', 'repo-gates']);
  });

  test('a null or empty contract requires only edd/evidence', () => {
    expect(requiredCheckContexts(null)).toEqual([EDD_CHECK]);
    expect(requiredCheckContexts({})).toEqual([EDD_CHECK]);
    expect(requiredCheckContexts({ static: null })).toEqual([EDD_CHECK]);
  });
});

describe('statusChecksManaged', () => {
  test('auto on a PR-gated branch is managed', () => {
    expect(statusChecksManaged(strategy({ direct_push_to_protected: 'forbidden', admin_bypass: false }))).toBe(true);
  });

  test('human-approves on a PR-gated branch is managed', () => {
    expect(statusChecksManaged(strategy({ direct_push_to_protected: 'confirm', merge_mode: 'human-approves', admin_bypass: false }))).toBe(true);
  });

  test('a direct-push branch without admin bypass is not managed', () => {
    expect(statusChecksManaged(strategy({ direct_push_to_protected: 'evidence', admin_bypass: false }))).toBe(false);
    expect(statusChecksManaged(strategy({ direct_push_to_protected: 'allowed', admin_bypass: false }))).toBe(false);
  });

  test('a direct-push branch with admin bypass is managed', () => {
    expect(statusChecksManaged(strategy({ direct_push_to_protected: 'allowed', admin_bypass: true }))).toBe(true);
  });

  test('manual is never managed', () => {
    expect(statusChecksManaged(strategy({ direct_push_to_protected: 'forbidden', merge_mode: 'manual' }))).toBe(false);
  });
});

describe('pullRequestModeParams / expectedApprovals', () => {
  test('auto: no approvals, no last-push approval', () => {
    const gs = strategy({ merge_mode: 'auto', require_pr_reviews: 2 });
    expect(pullRequestModeParams(gs)).toEqual({ required_approving_review_count: 0, require_last_push_approval: false });
    expect(expectedApprovals(gs)).toBe(0);
  });

  test('human-approves: at least one approval and a last-push approval', () => {
    expect(pullRequestModeParams(strategy({ merge_mode: 'human-approves', require_pr_reviews: 2 })))
      .toEqual({ required_approving_review_count: 2, require_last_push_approval: true });
    expect(expectedApprovals(strategy({ merge_mode: 'human-approves', require_pr_reviews: 0 }))).toBe(1);
    expect(expectedApprovals(strategy({ merge_mode: 'human-approves', require_pr_reviews: null }))).toBe(1);
  });

  test('manual: as declared, else 0, no last-push approval', () => {
    expect(pullRequestModeParams(strategy({ merge_mode: 'manual', require_pr_reviews: 3 })))
      .toEqual({ required_approving_review_count: 3, require_last_push_approval: false });
    expect(expectedApprovals(strategy({ merge_mode: 'manual', require_pr_reviews: null }))).toBe(0);
  });
});

describe('resolveIntegrationId', () => {
  test('the app id of the most recent edd/evidence run wins', () => {
    const body = {
      check_runs: [
        { name: EDD_CHECK, app: { id: 11, slug: 'github-actions' }, started_at: '2026-11-01T10:00:00Z' },
        { name: EDD_CHECK, app: { id: 22, slug: 'github-actions' }, started_at: '2026-11-02T10:00:00Z' },
        { name: 'lint', app: { id: 33, slug: 'github-actions' }, started_at: '2026-11-03T10:00:00Z' },
      ],
    };
    expect(resolveIntegrationId(body)).toBe(22);
  });

  test('before any edd/evidence run, any GitHub Actions run gives the id', () => {
    const body = { check_runs: [{ name: 'other', app: { id: 9, slug: 'some-bot' } }, { name: 'lint', app: { id: 4242, slug: 'github-actions' } }] };
    expect(resolveIntegrationId(body)).toBe(4242);
  });

  test('an edd/evidence run posted by another app is never chosen', () => {
    const body = {
      check_runs: [
        { name: EDD_CHECK, app: { id: 77, slug: 'some-bot' }, started_at: '2026-11-05T10:00:00Z' },
        { name: 'lint', app: { id: 4242, slug: 'github-actions' }, started_at: '2026-11-01T10:00:00Z' },
      ],
    };
    expect(resolveIntegrationId(body)).toBe(4242);
    expect(resolveIntegrationId({ check_runs: [{ name: EDD_CHECK, app: { id: 77, slug: 'some-bot' } }] })).toBeNull();
  });

  test('no usable run, null or garbage resolves to null', () => {
    expect(resolveIntegrationId({ check_runs: [{ name: 'x', app: { id: 9, slug: 'some-bot' } }] })).toBeNull();
    expect(resolveIntegrationId({ check_runs: [] })).toBeNull();
    expect(resolveIntegrationId(null)).toBeNull();
    expect(resolveIntegrationId('garbage')).toBeNull();
    expect(resolveIntegrationId({ check_runs: 'nope' })).toBeNull();
    expect(resolveIntegrationId({ check_runs: [{ name: EDD_CHECK, app: null }] })).toBeNull();
  });
});

describe('mergeGuard: gh pr merge --auto needs a required, bound check', () => {
  test('ok when edd/evidence is required with a numeric integration_id', () => {
    const r = mergeGuard([{ type: 'deletion' }, checksRule([{ context: EDD_CHECK, integration_id: 4242 }])]);
    expect(r.ok).toBe(true);
    expect(r.reason).toContain('4242');
  });

  test('refuses when edd/evidence has no integration_id', () => {
    const r = mergeGuard([checksRule([{ context: EDD_CHECK }])]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('integration_id');
  });

  test('refuses when no required check names edd/evidence', () => {
    expect(mergeGuard([checksRule([{ context: 'lint', integration_id: 1 }])]).ok).toBe(false);
    expect(mergeGuard([{ type: 'pull_request' }]).ok).toBe(false);
    expect(mergeGuard([]).ok).toBe(false);
  });

  test('an unreadable host refuses (fail closed)', () => {
    const r = mergeGuard(null);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('could not be read');
  });
});

describe('repoSettingsPatch', () => {
  const withEdd = [checksRule([{ context: EDD_CHECK }])];

  test('auto merge is enabled only when the rules require edd/evidence', () => {
    expect(repoSettingsPatch(strategy({ merge_mode: 'auto' }), withEdd)).toEqual({ allow_auto_merge: true });
    expect(repoSettingsPatch(strategy({ merge_mode: 'human-approves' }), withEdd)).toEqual({ allow_auto_merge: true });
    expect(repoSettingsPatch(strategy({ merge_mode: 'auto' }), [])).toEqual({});
    expect(repoSettingsPatch(strategy({ merge_mode: 'auto' }), [checksRule([{ context: 'lint' }])])).toEqual({});
  });

  test('manual never enables auto merge', () => {
    expect(repoSettingsPatch(strategy({ merge_mode: 'manual' }), withEdd)).toEqual({});
  });

  test('a decided feature_merge sets the repo merge buttons to match', () => {
    const gs = strategy({ merge_mode: 'auto' });
    gs.decisions.feature_merge = 'merge-commit';
    expect(repoSettingsPatch(gs, withEdd)).toEqual({
      allow_auto_merge: true,
      allow_merge_commit: true,
      allow_squash_merge: false,
      allow_rebase_merge: false,
    });
    gs.decisions.feature_merge = 'squash';
    expect(repoSettingsPatch(gs, [])).toEqual({ allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: false });
  });
});

describe('eddGateReady: the gate is a script and its package.json key', () => {
  test('ready only when both exist', () => {
    expect(eddGateReady({ hasScript: true, hasPackageScript: true })).toEqual({ ready: true, missing: [] });
  });

  test('names what is missing', () => {
    expect(eddGateReady({ hasScript: false, hasPackageScript: true })).toEqual({ ready: false, missing: ['scripts/edd.ts'] });
    expect(eddGateReady({ hasScript: true, hasPackageScript: false })).toEqual({ ready: false, missing: ['the `edd` script in package.json'] });
    expect(eddGateReady({ hasScript: false, hasPackageScript: false }).missing).toHaveLength(2);
  });
});

describe('migrationFor (spec §5.5)', () => {
  const READY = eddGateReady({ hasScript: true, hasPackageScript: true });
  const NOT_READY = eddGateReady({ hasScript: false, hasPackageScript: false });

  test('a missing block points at Strategy Setup', () => {
    expect(migrationFor(null, READY).action).toBe('setup');
    expect(migrationFor({ ...strategy(), strategy: '' }, READY).action).toBe('setup');
  });

  test('allowed is rewritten to evidence + auto', () => {
    expect(migrationFor(strategy({ direct_push_to_protected: 'allowed' }), READY))
      .toMatchObject({ action: 'rewrite', direct_push_to_protected: 'evidence', merge_mode: 'auto' });
  });

  test('an inherited policy is rewritten, whatever its value', () => {
    const gs = { ...strategy({ direct_push_to_protected: 'confirm' }), meta: { strategy_source: 'inherited' } };
    expect(migrationFor(gs, READY)).toMatchObject({ action: 'rewrite', direct_push_to_protected: 'evidence', merge_mode: 'auto' });
  });

  test('without the gate, a rewrite is blocked and names what is missing', () => {
    const v = migrationFor(strategy({ direct_push_to_protected: 'allowed' }), NOT_READY);
    expect(v.action).toBe('blocked');
    expect(v.note).toContain('scripts/edd.ts');
    expect(v.note).toContain('`edd` script in package.json');
    const inherited = { ...strategy({ direct_push_to_protected: 'confirm' }), meta: { strategy_source: 'inherited' } };
    expect(migrationFor(inherited, NOT_READY).action).toBe('blocked');
  });

  test('a chosen confirm stays, with an offer', () => {
    const v = migrationFor({ ...strategy({ direct_push_to_protected: 'confirm' }), meta: { strategy_source: 'chosen' } }, READY);
    expect(v.action).toBe('offer');
    expect(v.note).toContain('confirm');
  });

  test('without the gate, the confirm offer says the gate is missing', () => {
    const v = migrationFor({ ...strategy({ direct_push_to_protected: 'confirm' }), meta: { strategy_source: 'chosen' } }, NOT_READY);
    expect(v.action).toBe('offer');
    expect(v.note).toContain('scripts/edd.ts');
  });

  test('forbidden stays, with merge_mode auto offered', () => {
    expect(migrationFor(strategy({ direct_push_to_protected: 'forbidden' }), READY)).toMatchObject({ action: 'offer', merge_mode: 'auto' });
    expect(migrationFor(strategy({ direct_push_to_protected: 'forbidden' }), NOT_READY)).toMatchObject({ action: 'offer', merge_mode: 'auto' });
  });

  test('already evidence needs nothing', () => {
    expect(migrationFor(strategy({ direct_push_to_protected: 'evidence' }), READY).action).toBe('none');
    expect(migrationFor(strategy({ direct_push_to_protected: null }), NOT_READY).action).toBe('none');
  });
});

const POLICY_YAML = [
  'project:',
  '  project_name: Demo',
  '',
  'git_strategy:',
  '  strategy: solo-main',
  '  description: >',
  '    policy: not a key, just prose',
  '  policy:',
  '    direct_push_to_protected: allowed   # forbidden | confirm | allowed',
  '    admin_bypass: true',
  '    require_pr_reviews: 1',
  '  meta:',
  '    strategy_source: chosen',
  '',
  'orchestration:',
  '  policy:',
  '    direct_push_to_protected: untouched',
  '',
].join('\n');

describe('spliceMigration: only the policy lines change', () => {
  const target = { direct_push_to_protected: 'evidence', merge_mode: 'auto' };

  test('replaces the push value, inserts merge_mode after it, keeps every other byte', () => {
    const out = spliceMigration(POLICY_YAML, target);
    const expected = POLICY_YAML
      .replace('direct_push_to_protected: allowed   #', 'direct_push_to_protected: evidence   #')
      .replace('# forbidden | confirm | allowed\n', '# forbidden | confirm | allowed\n    merge_mode: auto\n');
    expect(out).toBe(expected);
    const doc = parseYaml(out) as { git_strategy: { policy: unknown }, orchestration: { policy: Record<string, unknown> } };
    expect(doc.git_strategy.policy).toEqual({ direct_push_to_protected: 'evidence', merge_mode: 'auto', admin_bypass: true, require_pr_reviews: 1 });
    expect(doc.orchestration.policy.direct_push_to_protected).toBe('untouched');
  });

  test('an existing merge_mode is set in place, not duplicated', () => {
    const src = POLICY_YAML.replace('    admin_bypass: true', '    admin_bypass: true\n    merge_mode: manual');
    const out = spliceMigration(src, target);
    expect(out.match(/merge_mode:/g)).toHaveLength(1);
    expect(out).toContain('    admin_bypass: true\n    merge_mode: auto');
  });

  test('CRLF line endings survive', () => {
    const crlf = POLICY_YAML.replace(/\n/g, '\r\n');
    const out = spliceMigration(crlf, target);
    expect(out).toContain('    merge_mode: auto\r\n');
    expect(out.split('\r\n')).toHaveLength(crlf.split('\r\n').length + 1);
  });

  test('refuses when there is nothing to splice', () => {
    expect(() => spliceMigration('project:\n  a: 1\n', target)).toThrow();
    expect(() => spliceMigration('git_strategy:\n  strategy: x\n  policy: { direct_push_to_protected: allowed }\n', target)).toThrow();
    expect(() => spliceMigration('git_strategy:\n  policy:\n    admin_bypass: true\n', target)).toThrow();
  });
});

describe('buildRules: EDD push policy, merge mode and required checks', () => {
  test('auto on a PR-gated branch emits required_status_checks with edd/evidence', () => {
    const rules = buildRules(strategy({ direct_push_to_protected: 'forbidden', admin_bypass: false }), false, [], [EDD_CHECK, 'lint'], 4242);
    expect(checksOf(rules)).toEqual([{ context: EDD_CHECK, integration_id: 4242 }, { context: 'lint', integration_id: 4242 }]);
    const rule = rules.find(r => r.type === 'required_status_checks');
    expect(rule?.parameters?.strict_required_status_checks_policy).toBe(false);
    expect(prParams(rules)).toMatchObject({ required_approving_review_count: 0, require_last_push_approval: false });
  });

  test('no integration id leaves the key off', () => {
    const rules = buildRules(strategy({ direct_push_to_protected: 'forbidden' }), false);
    expect(checksOf(rules)).toEqual([{ context: EDD_CHECK }]);
  });

  test('preserves a host context the contract does not name, and the host strict flag', () => {
    const host = checksRule([{ context: 'security-scan', integration_id: 7 }], true);
    const rules = buildRules(strategy({ direct_push_to_protected: 'forbidden' }), false, [host], [EDD_CHECK], 4242);
    expect(checksOf(rules)).toEqual([{ context: 'security-scan', integration_id: 7 }, { context: EDD_CHECK, integration_id: 4242 }]);
    expect(rules.find(r => r.type === 'required_status_checks')?.parameters?.strict_required_status_checks_policy).toBe(true);
    expect(rules.filter(r => r.type === 'required_status_checks')).toHaveLength(1);
  });

  test('keeps the host integration_id for a contract context', () => {
    const host = checksRule([{ context: EDD_CHECK, integration_id: 42 }]);
    const rules = buildRules(strategy({ direct_push_to_protected: 'forbidden' }), false, [host], [EDD_CHECK], 4242);
    expect(checksOf(rules)).toEqual([{ context: EDD_CHECK, integration_id: 42 }]);
  });

  test('evidence without admin bypass: no pull_request rule and no required checks', () => {
    const rules = buildRules(strategy({ direct_push_to_protected: 'evidence', admin_bypass: false }), false);
    expect(rules.some(r => r.type === 'pull_request')).toBe(false);
    expect(rules.some(r => r.type === 'required_status_checks')).toBe(false);
  });

  test('allowed with admin bypass: required checks, no pull_request rule', () => {
    const rules = buildRules(strategy({ direct_push_to_protected: 'allowed', admin_bypass: true }), false);
    expect(rules.some(r => r.type === 'pull_request')).toBe(false);
    expect(checksOf(rules)).toEqual([{ context: EDD_CHECK }]);
  });

  test('manual carries the host required_status_checks rule forward unchanged', () => {
    const host = checksRule([{ context: 'ci', integration_id: 3 }], true);
    const rules = buildRules(strategy({ direct_push_to_protected: 'forbidden', merge_mode: 'manual', require_pr_reviews: 2 }), false, [host], [EDD_CHECK], 4242);
    expect(rules.find(r => r.type === 'required_status_checks')).toBe(host);
    expect(prParams(rules)).toMatchObject({ required_approving_review_count: 2, require_last_push_approval: false });
  });

  test('manual with no host rule emits none', () => {
    const rules = buildRules(strategy({ direct_push_to_protected: 'forbidden', merge_mode: 'manual' }), false);
    expect(rules.some(r => r.type === 'required_status_checks')).toBe(false);
  });

  test('human-approves derives approvals and a last-push approval', () => {
    const rules = buildRules(strategy({ direct_push_to_protected: 'confirm', merge_mode: 'human-approves', require_pr_reviews: 0 }), true);
    expect(prParams(rules)).toMatchObject({
      required_approving_review_count: 1,
      require_last_push_approval: true,
      require_code_owner_review: true,
      dismiss_stale_reviews_on_push: true,
      required_review_thread_resolution: true,
    });
  });

  test('an unknown direct_push value derives a pull_request rule (fail closed)', () => {
    const rules = buildRules(strategy({ direct_push_to_protected: 'whatever' }), false);
    expect(rules.some(r => r.type === 'pull_request')).toBe(true);
  });

  test('a missing or null direct_push value reads as evidence: no pull_request rule', () => {
    expect(buildRules(strategy({ direct_push_to_protected: null }), false).some(r => r.type === 'pull_request')).toBe(false);
    expect(buildRules(strategy({ direct_push_to_protected: undefined }), false).some(r => r.type === 'pull_request')).toBe(false);
  });
});

describe('detectLoosening: EDD cases', () => {
  const humanPr: Rule = {
    type: 'pull_request',
    parameters: { required_approving_review_count: 1, require_last_push_approval: true, allowed_merge_methods: ['merge'] },
  };

  test('human-approves -> auto lowers approvals and drops the last-push approval', () => {
    const next = buildRules(strategy({ direct_push_to_protected: 'forbidden', merge_mode: 'auto' }), false, [humanPr]);
    const out = detectLoosening([humanPr], next, 'o/r', 'main');
    expect(out.some(l => l.includes('lowers required approvals 1 -> 0'))).toBe(true);
    expect(out.some(l => l.includes('require_last_push_approval'))).toBe(true);
  });

  test('a removed required context is flagged', () => {
    const current = [checksRule([{ context: EDD_CHECK }, { context: 'lint' }])];
    const out = detectLoosening(current, [checksRule([{ context: EDD_CHECK }])], 'o/r', 'main');
    expect(out).toEqual(['main: stops requiring status check(s): lint']);
  });

  test('a removed required_status_checks rule is flagged', () => {
    const out = detectLoosening([checksRule([{ context: EDD_CHECK }])], [{ type: 'deletion' }], 'o/r', 'main');
    expect(out.some(l => l.includes('removes the required_status_checks rule'))).toBe(true);
  });

  test('strict true -> false is flagged', () => {
    const out = detectLoosening([checksRule([{ context: EDD_CHECK }], true)], [checksRule([{ context: EDD_CHECK }], false)], 'o/r', 'main');
    expect(out).toEqual(['main: turns off strict_required_status_checks_policy']);
  });

  test('adding a context is not loosening', () => {
    expect(detectLoosening([checksRule([{ context: EDD_CHECK }])], [checksRule([{ context: EDD_CHECK }, { context: 'lint' }])], 'o/r', 'main')).toEqual([]);
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

describe('softenUndeclared: a key nobody declared never blocks a push', () => {
  const modeDrift = (): Finding => ({ severity: 'drift', field: 'main.merge_mode', declared: 'allow_auto_merge true', enforced: 'allow_auto_merge false' });

  test('undeclared merge_mode turns its drift into a warning with a note', () => {
    const findings = [modeDrift(), { ...modeDrift(), field: 'main.required_checks' }, { ...modeDrift(), field: 'repo.allowed_merge_methods' }];
    softenUndeclared(strategy(), findings);
    expect(findings.map(f => f.severity)).toEqual(['info', 'info', 'info']);
    expect(findings[0]?.note).toContain('merge_mode is not declared');
  });

  test('declared merge_mode keeps it a drift', () => {
    const findings = [modeDrift()];
    softenUndeclared(strategy({ merge_mode: 'auto' }), findings);
    expect(findings[0]?.severity).toBe('drift');
  });

  test('undeclared direct_push_to_protected turns its drift into a warning with a note', () => {
    const findings = [directPushDrift()];
    softenUndeclared(strategy({ direct_push_to_protected: null, merge_mode: 'auto' }), findings);
    expect(findings[0]?.severity).toBe('info');
    expect(findings[0]?.note).toBe('direct_push_to_protected is not declared; read as evidence, so this is a warning until it is set');
    const missing = [directPushDrift()];
    softenUndeclared(strategy({ direct_push_to_protected: undefined, merge_mode: 'auto' }), missing);
    expect(missing[0]?.severity).toBe('info');
  });

  test('declared direct_push_to_protected keeps it a drift', () => {
    const findings = [directPushDrift()];
    softenUndeclared(strategy({ direct_push_to_protected: 'allowed', merge_mode: 'auto' }), findings);
    expect(findings[0]?.severity).toBe('drift');
  });

  test('a finding of one key is not softened by the other key being undeclared', () => {
    const findings = [directPushDrift(), modeDrift()];
    softenUndeclared(strategy({ direct_push_to_protected: 'allowed' }), findings);
    expect(findings.map(f => f.severity)).toEqual(['drift', 'info']);
  });

  test('an accepted finding stays accepted', () => {
    const findings: Finding[] = [{ ...modeDrift(), severity: 'accepted' }, { ...directPushDrift(), severity: 'accepted' }];
    softenUndeclared(strategy({ direct_push_to_protected: null }), findings);
    expect(findings.map(f => f.severity)).toEqual(['accepted', 'accepted']);
  });

  test('runs after classifyAccepted: an accepted undeclared direct push stays accepted', () => {
    const gs = strategy({ direct_push_to_protected: null, accepted_divergences: [ACCEPTED_DIRECT_PUSH] });
    const findings = [directPushDrift()];
    classifyAccepted(findings, gs.policy.accepted_divergences ?? []);
    softenUndeclared(gs, findings);
    expect(findings[0]?.severity).toBe('accepted');
  });
});

describe('directPushDeclared', () => {
  test('a value counts as declared; missing or null does not', () => {
    expect(directPushDeclared(strategy({ direct_push_to_protected: 'confirm' }))).toBe(true);
    expect(directPushDeclared(strategy({ direct_push_to_protected: null }))).toBe(false);
    expect(directPushDeclared(strategy({ direct_push_to_protected: undefined }))).toBe(false);
  });
});

describe('effectiveForApply: an undeclared merge_mode derives as manual', () => {
  test('a declared mode is used as it is', () => {
    const gs = strategy({ merge_mode: 'auto' });
    expect(effectiveForApply(gs)).toBe(gs);
  });

  test('undeclared becomes manual, without touching the input', () => {
    const gs = strategy({ direct_push_to_protected: 'forbidden', require_pr_reviews: 2 });
    const eff = effectiveForApply(gs);
    expect(eff.policy.merge_mode).toBe('manual');
    expect(gs.policy.merge_mode).toBeUndefined();
    expect(statusChecksManaged(eff)).toBe(false);
    expect(pullRequestModeParams(eff)).toEqual({ required_approving_review_count: 2, require_last_push_approval: false });
    const rules = buildRules(eff, false, [], [EDD_CHECK], 15368);
    expect(rules.some(r => r.type === 'required_status_checks')).toBe(false);
    expect(repoSettingsPatch(eff, rules).allow_auto_merge).toBeUndefined();
  });

  test('a null require_pr_reviews still derives 0 approvals', () => {
    const eff = effectiveForApply(strategy({ direct_push_to_protected: 'forbidden', require_pr_reviews: null }));
    expect(expectedApprovals(eff)).toBe(0);
  });
});

describe('missingCheckRuns: a required context must have reported at least once', () => {
  test('lists the contexts no check run is named after, de-duplicated', () => {
    const body = { check_runs: [{ name: EDD_CHECK, app: { id: 1, slug: 'github-actions' } }, { name: 'lint' }] };
    expect(missingCheckRuns([EDD_CHECK, 'lint', 'types', 'types'], body)).toEqual(['types']);
  });

  test('every context reported means nothing is missing', () => {
    expect(missingCheckRuns([EDD_CHECK], { check_runs: [{ name: EDD_CHECK }] })).toEqual([]);
  });

  test('an empty or unreadable body misses every context', () => {
    expect(missingCheckRuns([EDD_CHECK, 'lint'], { check_runs: [] })).toEqual([EDD_CHECK, 'lint']);
    expect(missingCheckRuns([EDD_CHECK], null)).toEqual([EDD_CHECK]);
    expect(missingCheckRuns([EDD_CHECK], { check_runs: 'nope' })).toEqual([EDD_CHECK]);
  });
});

describe('mergeMethodWidening: the repo patch never turns a merge button on silently', () => {
  test('false -> true is a loosening entry per flag', () => {
    const out = mergeMethodWidening(
      { allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false },
      { allow_merge_commit: true, allow_squash_merge: false, allow_rebase_merge: true },
    );
    expect(out).toEqual(['repo: turns on allow_squash_merge (permits a merge method the repo currently forbids)']);
  });

  test('narrowing, unchanged flags and allow_auto_merge are not merge-method widening', () => {
    expect(mergeMethodWidening({ allow_auto_merge: true, allow_merge_commit: false }, { allow_auto_merge: false, allow_merge_commit: true })).toEqual([]);
    expect(mergeMethodWidening({ allow_squash_merge: true }, { allow_squash_merge: true })).toEqual([]);
  });

  test('a flag the host did not serve is not read as false', () => {
    expect(mergeMethodWidening({ allow_rebase_merge: true }, {})).toEqual([]);
    expect(mergeMethodWidening({ allow_rebase_merge: true }, null)).toEqual([]);
  });
});

describe('schema back-fill of merge_mode never blocks a downstream push', () => {
  const root = join(import.meta.dir, '..');
  const project = readFileSync(join(root, '.agents', 'project.yaml'), 'utf8');
  const schema = readFileSync(join(root, '.agents', 'project.schema.yaml'), 'utf8');

  test('a project without the key gets null from the back-fill, and its merge_mode drift only warns', () => {
    const old = project.replace(/\n {4}merge_mode: .*\n/, '\n');
    expect(old).not.toContain('merge_mode:');
    const { text, error } = applyInsertions(old, planInsertions(old, schema, ['git_strategy.policy.merge_mode']));
    expect(error).toBeNull();
    const gs = (parseYaml(text) as { git_strategy: GitStrategy }).git_strategy;
    expect(gs.policy.merge_mode).toBeNull();
    expect(mergeModeDeclared(gs)).toBe(false);
    const findings: Finding[] = [{ severity: 'drift', field: 'main.merge_mode', declared: 'allow_auto_merge true', enforced: 'allow_auto_merge false' }];
    softenUndeclared(gs, findings);
    expect(findings[0]?.severity).toBe('info');
  });
});

describe('spliceKeys: setup writes only the keys it was given', () => {
  const YAML = [
    'git_strategy:',
    '  strategy: solo-main # DEFAULT, not a decision',
    '  protected: [main]',
    '  policy:',
    '    direct_push_to_protected: confirm # forbidden | confirm | allowed | evidence',
    '    admin_bypass: false',
    '  meta:',
    '    strategy_source: inherited',
    '',
    '# a comment that belongs to the next block',
    'evidence:',
    '  static: []',
    '',
  ].join('\n');

  test('sets scalars in place and keeps their comments', () => {
    const out = spliceKeys(YAML, [
      { path: ['git_strategy', 'strategy'], value: 'github-flow' },
      { path: ['git_strategy', 'protected'], value: '[main, staging]' },
      { path: ['git_strategy', 'policy', 'direct_push_to_protected'], value: 'forbidden' },
    ]);
    expect(out).toContain('  strategy: github-flow # DEFAULT, not a decision');
    expect(out).toContain('  protected: [main, staging]');
    expect(out).toContain('    direct_push_to_protected: forbidden # forbidden | confirm | allowed | evidence');
  });

  test('inserts a missing key at the end of its block, before the next block comment', () => {
    const out = spliceKeys(YAML, [{ path: ['git_strategy', 'meta', 'setup_version'], value: '1' }, { path: ['git_strategy', 'policy', 'merge_mode'], value: 'auto' }]);
    const lines = out.split('\n');
    expect(lines[lines.indexOf('    admin_bypass: false') + 1]).toBe('    merge_mode: auto');
    expect(lines[lines.indexOf('    strategy_source: inherited') + 1]).toBe('    setup_version: 1');
    expect(lines[lines.indexOf('# a comment that belongs to the next block') + 1]).toBe('evidence:');
  });

  test('CRLF line endings survive', () => {
    const out = spliceKeys(YAML.replaceAll('\n', '\r\n'), [{ path: ['git_strategy', 'policy', 'merge_mode'], value: 'manual' }]);
    expect(out).toContain('    merge_mode: manual\r\n');
  });

  test('refuses a block-valued key and a missing parent block', () => {
    expect(() => spliceKeys(YAML, [{ path: ['git_strategy', 'policy'], value: 'x' }])).toThrow('is a block');
    expect(() => spliceKeys(YAML, [{ path: ['git_strategy', 'branches', 'integration'], value: 'staging' }])).toThrow('no block-style git_strategy.branches');
  });
});

describe('protectedBranches: gitlab-flow', () => {
  test('main, pre-production and production are all protected, whatever production is called', () => {
    const base = strategy();
    expect(protectedBranches({ ...base, strategy: 'gitlab-flow', branches: { production: 'production', integration: null, ephemeral_pattern: null }, protected: [] })).toEqual(['production', 'main', 'pre-production']);
    expect(protectedBranches({ ...base, strategy: 'gitlab-flow', branches: { production: 'main', integration: null, ephemeral_pattern: null }, protected: [] })).toEqual(['main', 'pre-production', 'production']);
  });
});

describe('the Actions approval switch (corrections 17)', () => {
  test('auto and human-approves turn it off; manual leaves it alone', () => {
    expect(actionsSettingsPatch(strategy({ merge_mode: 'auto' }))).toEqual({ can_approve_pull_request_reviews: false });
    expect(actionsSettingsPatch(strategy({ merge_mode: 'human-approves' }))).toEqual({ can_approve_pull_request_reviews: false });
    expect(actionsSettingsPatch(strategy({ merge_mode: 'manual' }))).toBeNull();
  });

  test('verify notes it when on, never as drift; off or unreadable is silent', () => {
    expect(actionsApprovalFinding(strategy({ merge_mode: 'auto' }), { can_approve_pull_request_reviews: true })).toMatchObject({ severity: 'info', field: 'repo.actions_can_approve_pull_requests' });
    expect(actionsApprovalFinding(strategy({ merge_mode: 'auto' }), { can_approve_pull_request_reviews: false })).toBeNull();
    expect(actionsApprovalFinding(strategy({ merge_mode: 'auto' }), null)).toBeNull();
    expect(actionsApprovalFinding(strategy({ merge_mode: 'manual' }), { can_approve_pull_request_reviews: true })).toBeNull();
  });
});

describe('rulesetBody: one payload for apply and the hand-off', () => {
  test('an update never carries bypass_actors; a create seeds org-admin bypass only when declared', () => {
    expect(rulesetBody(strategy({ admin_bypass: true }), ['main'], [], true)).not.toHaveProperty('bypass_actors');
    expect(rulesetBody(strategy({ admin_bypass: true }), ['main'], [], false).bypass_actors).toEqual([{ actor_type: 'OrganizationAdmin', bypass_mode: 'always' }]);
    expect(rulesetBody(strategy({ admin_bypass: false }), ['main', 'staging'], [], false)).toMatchObject({ bypass_actors: [], conditions: { ref_name: { include: ['refs/heads/main', 'refs/heads/staging'] } } });
  });
});

describe('the edd/evidence guard reads pull request heads, never the production tip alone', () => {
  const ACTIONS = { app: { id: 15368, slug: 'github-actions' } };
  const tip = { check_runs: [{ name: 'lint', ...ACTIONS }, { name: 'edd/evidence (push)', ...ACTIONS }] };
  const onPr = { check_runs: [{ name: EDD_CHECK, ...ACTIONS }] };

  test('edd/evidence reported on a PR head is enough, the static ids still need the tip', () => {
    expect(missingRequiredChecks([EDD_CHECK, 'lint'], tip, onPr)).toEqual({ tip: [], pr: [], prUnread: false });
    expect(missingRequiredChecks([EDD_CHECK, 'lint', 'types'], tip, onPr)).toEqual({ tip: ['types'], pr: [], prUnread: false });
  });

  test('no PR has reported it yet: the first pull request is what is missing', () => {
    expect(missingRequiredChecks([EDD_CHECK, 'lint'], tip, { check_runs: [] })).toEqual({ tip: [], pr: [EDD_CHECK], prUnread: false });
  });

  test('an unreadable PR list is reported as unknown, not as a missing first pull request', () => {
    expect(missingRequiredChecks([EDD_CHECK, 'lint'], tip, null)).toEqual({ tip: [], pr: [EDD_CHECK], prUnread: true });
  });

  test('prHeadCheckRuns walks the latest PRs into the base until one head carries the check', () => {
    const calls: string[] = [];
    const read = (path: string): unknown => {
      calls.push(path);
      if (path.startsWith('repos/o/r/pulls')) { return [{ head: { sha: 'a1' } }, { head: { sha: 'b2' } }]; }
      return path.includes('/commits/b2/') ? onPr : { check_runs: [] };
    };
    expect(prHeadCheckRuns(read, 'o/r', 'main')).toBe(onPr);
    expect(calls[0]).toContain('pulls?state=all&base=main');
    expect(calls.some(c => c.includes('check_name=edd%2Fevidence'))).toBe(true);
  });

  test('prHeadCheckRuns returns an empty reading with no PR, and null when the list cannot be read', () => {
    expect(prHeadCheckRuns(() => [], 'o/r', 'main')).toEqual({ check_runs: [] });
    expect(prHeadCheckRuns(() => null, 'o/r', 'main')).toBeNull();
  });
});

describe('verify with no git_strategy block reads an inherited evidence policy', () => {
  test('a missing block becomes the inherited default, whose drift only warns', () => {
    const read = strategyForVerify({ project: {} });
    expect(read.missingBlock).toBe(true);
    expect(directPushPolicy(read.gs)).toBe('evidence');
    expect(read.gs?.meta.strategy_source).toBe('inherited');
    expect(verifyExitCode(1, 'inherited')).toBe(0);
  });

  test('a declared block is left to readStrategy', () => {
    expect(strategyForVerify({ git_strategy: { strategy: 'solo-main' } })).toEqual({ gs: null, missingBlock: false });
  });
});

describe('verify warns when nothing posts edd/evidence', () => {
  test('a project without .github/workflows/evidence.yml gets the warning, this repo does not', () => {
    expect(evidenceWorkflowWarning(join(import.meta.dir, '..'))).toBeNull();
    expect(evidenceWorkflowWarning(join(import.meta.dir, 'no-such-project'))).toContain('evidence.yml is missing');
  });
});

describe('verify --merge under the shipped default: the agent reads the PR head checks', () => {
  const run = (name: string, conclusion: string | null, started: string): Record<string, unknown> => ({ name, conclusion, status: conclusion === null ? 'in_progress' : 'completed', started_at: started, app: { id: 15368, slug: 'github-actions' } });

  test('every contract check green on the head lets the agent merge', () => {
    const body = { check_runs: [run(EDD_CHECK, 'success', '2026-11-28T09:22:00Z'), run('lint', 'success', '2026-11-28T09:20:00Z')] };
    expect(headChecksVerdict([EDD_CHECK, 'lint'], body)).toEqual({ green: [EDD_CHECK, 'lint'], notGreen: [] });
  });

  test('a red, pending or missing check refuses, and the latest run of a name wins', () => {
    const body = { check_runs: [run(EDD_CHECK, 'cancelled', '2026-11-28T09:21:00Z'), run(EDD_CHECK, 'success', '2026-11-28T09:22:00Z'), run('lint', null, '2026-11-28T09:20:00Z'), run('types', 'failure', '2026-11-28T09:20:00Z')] };
    expect(headChecksVerdict([EDD_CHECK, 'lint', 'types', 'unit'], body)).toEqual({ green: [EDD_CHECK], notGreen: ['lint (in_progress)', 'types (failure)', 'unit (never ran)'] });
  });
});

describe('the Actions event policy that lets evidence.yml run on pull_request_target', () => {
  const allow = { name: 'Allow pull_request_target for evidence.yml', enforcement: 'active', conditions: { workflow_path: { include: ['.github/workflows/evidence.yml'], exclude: [] } }, rules: [{ type: 'restrict_action_events', parameters: { allowed_events: ['pull_request_target'] } }] };

  test('a public repository with the allowing policy (the shape of policy 18068) runs it', () => {
    expect(pullRequestTargetVerdict('public', [allow]).allowed).toBe(true);
    expect(pullRequestTargetFinding(pullRequestTargetVerdict('public', [allow]))).toBeNull();
  });

  test('a public repository with no policy, or one that restricts the events without it, is blocked', () => {
    expect(pullRequestTargetVerdict('public', []).allowed).toBe(false);
    const narrow = { ...allow, name: 'push only', rules: [{ type: 'restrict_action_events', parameters: { allowed_events: ['push'] } }] };
    expect(pullRequestTargetVerdict('public', [allow, narrow])).toMatchObject({ allowed: false });
    expect(pullRequestTargetFinding(pullRequestTargetVerdict('public', []))?.field).toBe('repo.pull_request_target');
  });

  test('a policy for another workflow or a disabled one does not count; a private repository is not blocked; unreadable is unknown', () => {
    const other = { ...allow, conditions: { workflow_path: { include: ['.github/workflows/other.yml'], exclude: [] } } };
    expect(pullRequestTargetVerdict('public', [other, { ...allow, enforcement: 'disabled' }]).allowed).toBe(false);
    expect(pullRequestTargetVerdict('private', []).allowed).toBe(true);
    expect(pullRequestTargetVerdict('public', null).allowed).toBeNull();
  });
});

describe('mergeDecision: which merge verify --merge allows', () => {
  const green = { green: [EDD_CHECK, 'lint'], notGreen: [] };
  const open = { ok: false, reason: 'edd/evidence is not a required status check on the base' };
  const base = { base: 'main', sha: 'a'.repeat(40), guard: open, mode: 'auto', verdict: green, approved: false, hostApproves: false };
  const required = { ok: true, reason: 'required' };

  test('the host enforces: --auto, pinned to the head it read', () => {
    expect(mergeDecision({ ...base, guard: { ok: true, reason: 'required' } })).toMatchObject({ code: 0, message: expect.stringContaining(`--auto --match-head-commit ${'a'.repeat(40)}`) });
  });

  test('nothing required and all green: the agent merges, without --auto', () => {
    const d = mergeDecision(base);
    expect(d.code).toBe(0);
    expect(d.message).toContain('no --auto');
  });

  test('red, pending or unreadable checks refuse', () => {
    expect(mergeDecision({ ...base, verdict: { green: [], notGreen: ['lint (failure)'] } }).code).toBe(1);
    expect(mergeDecision({ ...base, verdict: null }).code).toBe(1);
  });

  test('human-approves needs a read approval where the host does not require one; manual never lets the agent merge', () => {
    expect(mergeDecision({ ...base, mode: 'human-approves' }).code).toBe(1);
    expect(mergeDecision({ ...base, mode: 'human-approves', approved: true }).code).toBe(0);
    expect(mergeDecision({ ...base, mode: 'manual' }).code).toBe(1);
  });

  test('a run from another app does not count as the check', () => {
    const body = { check_runs: [{ name: 'lint', conclusion: 'success', started_at: '2026-11-28T09:30:00Z', app: { id: 9, slug: 'other-app' } }, { name: 'lint', conclusion: 'failure', started_at: '2026-11-28T09:20:00Z', app: { id: 15368, slug: 'github-actions' } }] };
    expect(headChecksVerdict(['lint'], body)).toEqual({ green: [], notGreen: ['lint (failure)'] });
  });

  test('approval: the latest review of each person counts, and a change request blocks', () => {
    const sha = 'a'.repeat(40);
    expect(approvedFromReviews([{ user: { login: 'ana' }, state: 'APPROVED', commit_id: sha }], sha)).toBe(true);
    expect(approvedFromReviews([{ user: { login: 'ana' }, state: 'APPROVED', commit_id: sha }, { user: { login: 'bob' }, state: 'CHANGES_REQUESTED', commit_id: sha }], sha)).toBe(false);
    expect(approvedFromReviews([{ user: { login: 'ana' }, state: 'CHANGES_REQUESTED', commit_id: sha }, { user: { login: 'ana' }, state: 'APPROVED', commit_id: sha }, { user: { login: 'ana' }, state: 'COMMENTED', commit_id: sha }], sha)).toBe(true);
    expect(approvedFromReviews(null, sha)).toBe(false);
  });

  test('approval: only an approval of the head commit being merged counts', () => {
    const sha = 'a'.repeat(40);
    expect(approvedFromReviews([{ user: { login: 'ana' }, state: 'APPROVED', commit_id: 'c'.repeat(40) }], sha)).toBe(false);
    expect(approvedFromReviews([{ user: { login: 'ana' }, state: 'APPROVED', commit_id: 'c'.repeat(40) }, { user: { login: 'bob' }, state: 'APPROVED', commit_id: sha }], sha)).toBe(true);
  });

  test('manual never lets the agent merge, even where the host requires edd/evidence', () => {
    expect(mergeDecision({ ...base, guard: required, mode: 'manual' }).code).toBe(1);
  });

  test('human-approves on a guarded base needs the host to require a last-push approval, or a read approval of the head', () => {
    expect(mergeDecision({ ...base, guard: required, mode: 'human-approves' }).code).toBe(1);
    expect(mergeDecision({ ...base, guard: required, mode: 'human-approves', hostApproves: true }).code).toBe(0);
    expect(mergeDecision({ ...base, guard: required, mode: 'human-approves', approved: true }).code).toBe(0);
    expect(hostRequiresApproval([{ type: 'pull_request', parameters: { required_approving_review_count: 1, require_last_push_approval: true } }])).toBe(true);
    expect(hostRequiresApproval([{ type: 'pull_request', parameters: { required_approving_review_count: 1, require_last_push_approval: false } }])).toBe(false);
    expect(hostRequiresApproval([{ type: 'pull_request', parameters: { required_approving_review_count: 0, require_last_push_approval: true } }])).toBe(false);
    expect(hostRequiresApproval(null)).toBe(false);
  });

  test('the merge mode is read from the base copy of project.yaml', () => {
    expect(baseStrategy(null)).toBeNull();
    expect(baseStrategy('git_strategy: [')).toBeNull();
    expect(mergeMode(baseStrategy('project:\n  project_name: x\n')!)).toBe('auto');
    expect(mergeMode(baseStrategy('git_strategy:\n  strategy: solo-main\n  policy:\n    merge_mode: manual\n')!)).toBe('manual');
  });
});
