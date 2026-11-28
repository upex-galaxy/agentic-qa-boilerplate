import type { GitStrategy, Rule } from '../git-policy.ts';
import type { AskQuestion, HostState, SetupDeps, SetupFlags } from './git-policy-setup.ts';

import { describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';

import { parseGitPolicyQuestions } from '../../cli/install.ts';

import {
  assessPreflight,
  codeownersLines,
  derivePlan,
  missingCodeownersLines,
  normalizeOwner,
  parseSetupFlags,
  readHostState,
  renderHandoff,
  runSetup,
  setupDefaults,
  setupEdits,
  setupQuestions,
  STRATEGIES,
  withAnswers,
} from './git-policy-setup.ts';

const SLUG = 'acme/widgets';

function projectYaml(policy: { push?: string, merge?: string, source?: string, strategy?: string, featureMerge?: string, production?: string } = {}): string {
  return [
    'project:',
    '  project_name: Widgets',
    '',
    'git_strategy:',
    `  strategy: ${policy.strategy ?? 'solo-main'} # DEFAULT, not a decision`,
    '  branches:',
    `    production: ${policy.production ?? 'main'} # release / default branch`,
    '    integration: null',
    '    ephemeral_pattern: null',
    '  protected: [main]',
    '  decisions:',
    '    promote_method: n/a',
    `    feature_merge: ${policy.featureMerge ?? 'merge-commit'}`,
    '    hotfix_policy: n/a',
    '  policy:',
    `    direct_push_to_protected: ${policy.push ?? 'confirm'} # forbidden | confirm | allowed | evidence`,
    `    merge_mode: ${policy.merge ?? 'null'}`,
    '    admin_bypass: true',
    '    require_pr_reviews: 0',
    '  meta:',
    '    setup_version: 1',
    `    strategy_source: ${policy.source ?? 'inherited'} # inherited | chosen`,
    '',
    'evidence:',
    '  static:',
    '    - { id: lint, cmd: bun run lint:check, where: [pre-push, ci] }',
    '    - { id: unit, cmd: bun test, where: [pre-push] }',
    '  human:',
    '    paths: [\'.github/workflows/**\', \'scripts/edd.ts\', \'CODEOWNERS\']',
    '',
  ].join('\n');
}

function gsOf(text: string): GitStrategy {
  return (parseYaml(text) as { git_strategy: GitStrategy }).git_strategy;
}

const ACTIONS_RUNS = {
  check_runs: [
    { name: 'edd/evidence', app: { id: 15368, slug: 'github-actions' }, started_at: '2026-11-27T10:00:00Z' },
    { name: 'lint', app: { id: 15368, slug: 'github-actions' }, started_at: '2026-11-27T10:00:00Z' },
  ],
};

const HOST_PR_RULES: Rule[] = [
  { type: 'deletion' },
  { type: 'non_fast_forward' },
  { type: 'required_signatures' },
];

function hostBodies(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [`repos/${SLUG}`]: { permissions: { admin: true, push: true }, owner: { login: 'acme', type: 'Organization' }, visibility: 'public', allow_auto_merge: false, allow_merge_commit: true, allow_squash_merge: false, allow_rebase_merge: false },
    'user': { login: 'ana' },
    [`repos/${SLUG}/rulesets`]: [{ id: 7, name: 'ProtectPublic' }],
    [`repos/${SLUG}/rulesets/7`]: { rules: HOST_PR_RULES },
    [`repos/${SLUG}/rules/branches/main`]: HOST_PR_RULES,
    [`repos/${SLUG}/commits/main/check-runs?per_page=100`]: ACTIONS_RUNS,
    [`repos/${SLUG}/actions/permissions/workflow`]: { default_workflow_permissions: 'write', can_approve_pull_request_reviews: true },
    'orgs/acme/actions/permissions/workflow': null,
    ...over,
  };
}

interface Harness {
  deps: SetupDeps
  printed: string[]
  asked: AskQuestion[]
  written: string[]
  applied: boolean[]
  codeowners: string[]
}

function harness(opts: { text?: string, interactive?: boolean, answers?: (string | boolean | null)[], bodies?: Record<string, unknown>, slug?: string | null, gateReady?: boolean, scopes?: string[] | null, existingCodeowners?: string | null } = {}): Harness {
  let project = opts.text ?? projectYaml();
  const answers = [...(opts.answers ?? [])];
  const bodies = opts.bodies ?? hostBodies();
  const h: Harness = { printed: [], asked: [], written: [], applied: [], codeowners: [], deps: undefined as unknown as SetupDeps };
  h.deps = {
    interactive: opts.interactive ?? false,
    lang: 'en',
    ask: async (q) => {
      h.asked.push(q);
      const next = answers.shift();
      if (next === undefined) { throw new Error(`unscripted question: ${q.id}`); }
      return next === null ? q.default : next;
    },
    print: (l) => { h.printed.push(l); },
    readProject: () => project,
    writeProject: (t) => {
      h.written.push(t);
      project = t;
    },
    slug: opts.slug === undefined ? SLUG : opts.slug,
    gh: path => (path in bodies ? bodies[path] ?? null : null),
    scopes: () => (opts.scopes === undefined ? ['repo', 'workflow'] : opts.scopes),
    gateReady: opts.gateReady ?? true,
    codeowners: () => opts.existingCodeowners ?? null,
    writeCodeowners: (t) => { h.codeowners.push(t); },
    applyHost: (write) => {
      h.applied.push(write);
      return 0;
    },
  };
  return h;
}

const NO_FLAGS: SetupFlags = { planOnly: false, writePolicy: false };
const ENTER = null;

describe('setupDefaults: Enter accepts the EDD defaults', () => {
  test('an inherited policy defaults to evidence and auto', () => {
    expect(setupDefaults(gsOf(projectYaml()), true)).toEqual({ strategy: 'solo-main', push: 'evidence', merge: 'auto' });
  });

  test('without the evidence gate, the push default is confirm', () => {
    expect(setupDefaults(gsOf(projectYaml()), false).push).toBe('confirm');
  });

  test('a chosen policy keeps its own values as the defaults', () => {
    const gs = gsOf(projectYaml({ push: 'forbidden', merge: 'manual', source: 'chosen', strategy: 'gitflow' }));
    expect(setupDefaults(gs, true)).toEqual({ strategy: 'gitflow', push: 'forbidden', merge: 'manual' });
  });
});

describe('setupQuestions', () => {
  test('three questions, each choice with a plain-words line, the recommended one marked', () => {
    const qs = setupQuestions(gsOf(projectYaml()), 'en', true);
    expect(qs.map(q => q.id)).toEqual(['strategy', 'push', 'merge']);
    expect(qs[0].choices.map(c => c.value)).toEqual(STRATEGIES);
    expect(qs[1].choices.map(c => c.value)).toEqual(['evidence', 'confirm', 'allowed', 'forbidden']);
    expect(qs[2].choices.map(c => c.value)).toEqual(['auto', 'human-approves', 'manual']);
    for (const q of qs) {
      expect(q.choices.every(c => c.day.length > 20)).toBe(true);
      expect(q.choices.filter(c => c.rec).length).toBe(1);
    }
    expect(qs[2].choices.find(c => c.rec)!.value).toBe('auto');
  });

  test('evidence is not offered when the gate is missing', () => {
    expect(setupQuestions(gsOf(projectYaml()), 'en', false)[1].choices.map(c => c.value)).not.toContain('evidence');
  });

  test('Spanish copy for the installer', () => {
    const [s] = setupQuestions(gsOf(projectYaml()), 'es', true);
    expect(s.title).toBe('Qué estrategia de ramas usa este repositorio?');
  });
});

describe('parseSetupFlags', () => {
  test('reads every flag', () => {
    expect(parseSetupFlags(['--strategy', 'sdet', '--push', 'confirm', '--merge', 'manual', '--plan-only', '--write-policy', '--codeowner', 'ana'])).toEqual({
      strategy: 'sdet',
      push: 'confirm',
      merge: 'manual',
      codeowner: 'ana',
      planOnly: true,
      writePolicy: true,
    });
  });

  test('rejects unknown values and flags', () => {
    expect(parseSetupFlags(['--merge', 'squash'])).toHaveProperty('error');
    expect(parseSetupFlags(['--push', 'sometimes'])).toHaveProperty('error');
    expect(parseSetupFlags(['--strategy', 'yolo'])).toHaveProperty('error');
    expect(parseSetupFlags(['--yes'])).toHaveProperty('error');
    expect(parseSetupFlags(['--merge'])).toHaveProperty('error');
  });
});

describe('normalizeOwner', () => {
  test('logins, teams and emails', () => {
    expect(normalizeOwner('ana')).toBe('@ana');
    expect(normalizeOwner('@acme/qa-leads')).toBe('@acme/qa-leads');
    expect(normalizeOwner('ana@acme.io')).toBe('ana@acme.io');
    expect(normalizeOwner('two words')).toBeNull();
  });
});

describe('withAnswers / setupEdits: the keys setup writes', () => {
  test('main-integration gets its integration branch protected', () => {
    const next = withAnswers(gsOf(projectYaml()), { strategy: 'main-integration', push: 'forbidden', merge: 'auto' });
    expect(next.branches.integration).toBe('staging');
    expect(next.protected).toEqual(['main', 'staging']);
    expect(next.meta.strategy_source).toBe('chosen');
  });

  test('human-approves raises require_pr_reviews to at least 1', () => {
    const next = withAnswers(gsOf(projectYaml()), { strategy: 'github-flow', push: 'forbidden', merge: 'human-approves' });
    expect(next.policy.require_pr_reviews).toBe(1);
  });

  test('sdet records its ephemeral trunk', () => {
    const edits = setupEdits(gsOf(projectYaml()), { strategy: 'sdet', push: 'confirm', merge: 'auto' });
    expect(edits.find(e => e.path.at(-1) === 'ephemeral_pattern')?.value).toBe('"test/<module>-suite"');
  });

  test('answers equal to the file produce no edit at all', () => {
    const gs = gsOf(projectYaml({ push: 'evidence', merge: 'auto', source: 'chosen' }));
    expect(setupEdits(gs, { strategy: 'solo-main', push: 'evidence', merge: 'auto' })).toEqual([]);
  });
});

describe('merge method (owner decision E3)', () => {
  test('an undecided project gets the merge commit, written with the other keys', () => {
    const gs = gsOf(projectYaml({ featureMerge: 'n/a' }));
    const edits = setupEdits(gs, { strategy: 'solo-main', push: 'evidence', merge: 'auto' });
    expect(edits.find(e => e.path.at(-1) === 'feature_merge')?.value).toBe('merge-commit');
  });

  test('a project that already chose keeps its own method (D4); a flag overrides', () => {
    const gs = gsOf(projectYaml({ featureMerge: 'squash' }));
    expect(withAnswers(gs, { strategy: 'github-flow', push: 'forbidden', merge: 'auto' }).decisions.feature_merge).toBe('squash');
    expect(withAnswers(gs, { strategy: 'github-flow', push: 'forbidden', merge: 'auto', featureMerge: 'rebase-merge' }).decisions.feature_merge).toBe('rebase-merge');
    expect(parseSetupFlags(['--feature-merge', 'fast-forward'])).toHaveProperty('error');
  });

  test('Enter on the three questions ends on the merge commit; the plan and hand-off name it', async () => {
    const bodies = hostBodies({ [`repos/${SLUG}`]: { permissions: { admin: false, push: true }, owner: { login: 'acme', type: 'Organization' }, allow_merge_commit: true, allow_squash_merge: false, allow_rebase_merge: false } });
    const h = harness({ text: projectYaml({ featureMerge: 'n/a', push: 'forbidden', source: 'chosen', merge: 'auto' }), interactive: true, answers: [ENTER, ENTER, ENTER, true], bodies });
    expect(await runSetup(h.deps, NO_FLAGS)).toBe(0);
    expect(h.asked.map(q => q.id)).toEqual(['strategy', 'push', 'merge', 'write']);
    expect(gsOf(h.written[0]).decisions.feature_merge).toBe('merge-commit');
    const out = h.printed.join('\n');
    expect(out).toContain('merge method: merge (decisions.feature_merge: merge-commit)');
    expect(out).toContain('"allowed_merge_methods": [');
    expect(out).toContain('merge method: merge;');
  });
});

describe('gitlab-flow protects production', () => {
  test('an unchosen production becomes production, and main, pre-production and production are protected', () => {
    const next = withAnswers(gsOf(projectYaml()), { strategy: 'gitlab-flow', push: 'forbidden', merge: 'auto' });
    expect(next.branches.production).toBe('production');
    expect(next.protected).toEqual(['production', 'main', 'pre-production']);
    const edits = setupEdits(gsOf(projectYaml()), { strategy: 'gitlab-flow', push: 'forbidden', merge: 'auto' });
    expect(edits.find(e => e.path.at(-1) === 'production')?.value).toBe('production');
  });

  test('a gitlab-flow project that chose its production branch keeps it', () => {
    const gs = gsOf(projectYaml({ strategy: 'gitlab-flow', source: 'chosen', production: 'live' }));
    expect(withAnswers(gs, { strategy: 'gitlab-flow', push: 'forbidden', merge: 'auto' }).branches.production).toBe('live');
    const kept = gsOf(projectYaml({ strategy: 'gitlab-flow', source: 'chosen' }));
    expect(withAnswers(kept, { strategy: 'gitlab-flow', push: 'forbidden', merge: 'auto' }).branches.production).toBe('main');
  });
});

describe('codeowners', () => {
  test('one anchored line per gate path, minus the ones already owned', () => {
    const lines = codeownersLines(['.github/workflows/**', 'scripts/edd.ts'], '@ana');
    expect(lines).toEqual(['/.github/workflows/** @ana', '/scripts/edd.ts @ana']);
    expect(missingCodeownersLines('/scripts/edd.ts @bob\n', lines)).toEqual(['/.github/workflows/** @ana']);
  });
});

function hostState(over: Partial<HostState> = {}): HostState {
  return {
    repo: { permissions: { admin: true, push: true }, owner: { login: 'acme', type: 'Organization' }, visibility: 'public' },
    login: 'ana',
    scopes: ['repo'],
    checkRuns: ACTIONS_RUNS,
    actions: { can_approve_pull_request_reviews: false },
    orgActionsReadable: true,
    rulesetId: 7,
    rulesetRules: HOST_PR_RULES,
    branchRules: { main: HOST_PR_RULES },
    ...over,
  };
}

const AUTO_FORBIDDEN = (): GitStrategy => withAnswers(gsOf(projectYaml()), { strategy: 'solo-main', push: 'forbidden', merge: 'auto' });

describe('assessPreflight: what can stop an apply before any write', () => {
  test('an admin with everything in place has no blocker', () => {
    const pre = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence', 'lint'], hostState());
    expect(pre).toMatchObject({ reachable: true, admin: true, permission: 'admin', blockers: [], integrationId: 15368 });
  });

  test('a write collaborator is not an admin', () => {
    const pre = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence'], hostState({ repo: { permissions: { admin: false, push: true } } }));
    expect(pre.admin).toBe(false);
    expect(pre.permission).toBe('write');
  });

  test('a required check that never ran blocks (the never-reports trap)', () => {
    const pre = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence', 'lint', 'types'], hostState());
    expect(pre.blockers.join(' ')).toContain('never reported on main: types');
  });

  test('edd/evidence seen only on a PR head clears the guard; seen nowhere asks for the first pull request', () => {
    const tip = { check_runs: [{ name: 'lint', app: { id: 15368, slug: 'github-actions' } }] };
    const onPr = { check_runs: [{ name: 'edd/evidence', app: { id: 15368, slug: 'github-actions' } }] };
    expect(assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence', 'lint'], hostState({ checkRuns: tip, prCheckRuns: onPr })).blockers).toEqual([]);
    const first = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence', 'lint'], hostState({ checkRuns: tip, prCheckRuns: { check_runs: [] } }));
    expect(first.blockers.join(' ')).toContain('the first one has to be a pull request into main');
    expect(first.integrationId).toBe(15368);
    const unread = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence', 'lint'], hostState({ checkRuns: tip, prCheckRuns: null }));
    expect(unread.blockers.join(' ')).toContain('could not be read');
  });

  test('a public repository where evidence.yml may not run on pull_request_target blocks a managed check', () => {
    const blocked = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence'], hostState({ pullRequestTarget: { allowed: false, reason: 'no policy' } }));
    expect(blocked.blockers.join(' ')).toContain('edd/evidence would never report: no policy');
    const unknown = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence'], hostState({ pullRequestTarget: { allowed: null, reason: 'unreadable' } }));
    expect(unknown.notes.join(' ')).toContain('pull_request_target for .github/workflows/evidence.yml: unreadable');
  });

  test('readHostState reads the Actions event policies of a public repository', () => {
    const policy = { name: 'allow', enforcement: 'active', conditions: { workflow_path: { include: ['.github/workflows/evidence.yml'], exclude: [] } }, rules: [{ type: 'restrict_action_events', parameters: { allowed_events: ['pull_request_target'] } }] };
    const host = (policies: unknown[]): ReturnType<typeof readHostState> => readHostState(AUTO_FORBIDDEN(), 'o/r', {
      gh: (path: string) => {
        if (path === 'repos/o/r') { return { visibility: 'public', permissions: { admin: true }, owner: { login: 'o', type: 'Organization' } }; }
        if (path.startsWith('repos/o/r/actions/policies?')) { return { total_count: policies.length, policies: policies.map((_, i) => ({ id: i + 1 })) }; }
        if (path.startsWith('repos/o/r/actions/policies/')) { return policies[Number(path.split('/').pop()) - 1]; }
        return null;
      },
      scopes: () => ['repo'],
    });
    expect(host([policy]).pullRequestTarget?.allowed).toBe(true);
    expect(host([]).pullRequestTarget?.allowed).toBe(false);
  });

  test('no Actions run at all blocks: no integration_id to pin the check to', () => {
    const pre = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence'], hostState({ checkRuns: { check_runs: [] } }));
    expect(pre.integrationId).toBeNull();
    expect(pre.blockers.join(' ')).toContain('integration_id');
  });

  test('a token without the repo scope blocks; an unreadable scope list is only a note', () => {
    expect(assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence'], hostState({ scopes: ['gist'] })).token.join(' ')).toContain('gh auth refresh -s repo');
    const fine = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence'], hostState({ scopes: null }));
    expect(fine.blockers).toEqual([]);
    expect(fine.notes.join(' ')).toContain('Administration: write');
  });

  test('a user-owned repo cannot keep direct pushes open behind a required check', () => {
    const gs = withAnswers(gsOf(projectYaml()), { strategy: 'solo-main', push: 'evidence', merge: 'auto' });
    const pre = assessPreflight(gs, ['edd/evidence'], hostState({ repo: { permissions: { admin: true }, owner: { login: 'ana', type: 'User' } } }));
    expect(pre.blockers.join(' ')).toContain('user-owned repository');
  });

  test('the Actions approval switch and an unreadable org setting are reported', () => {
    const pre = assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence'], hostState({ actions: { can_approve_pull_request_reviews: true }, orgActionsReadable: false }));
    expect(pre.notes.join(' ')).toContain('ON today');
    expect(pre.notes.join(' ')).toContain('409');
  });

  test('organization rulesets are named: they stack on the plan', () => {
    expect(assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence'], hostState({ orgRulesets: 2 })).notes.join(' ')).toContain('2 organization-level ruleset(s)');
  });

  test('an unreachable host is not a pass', () => {
    expect(assessPreflight(AUTO_FORBIDDEN(), ['edd/evidence'], hostState({ repo: null })).reachable).toBe(false);
  });
});

describe('renderHandoff: two ready-to-paste forms for an admin', () => {
  const gs = AUTO_FORBIDDEN();
  const host = hostState({ repo: { permissions: { admin: false, push: true } }, actions: null });

  test('a prompt and the gh api commands with this repository filled in', () => {
    const pre = assessPreflight(gs, ['edd/evidence'], host);
    const plan = derivePlan(gs, SLUG, ['edd/evidence'], false, host, pre.integrationId, []);
    const text = renderHandoff(SLUG, gs, plan, pre, host).join('\n');
    expect(text).toContain(`You are helping an admin configure GitHub for ${SLUG}`);
    expect(text).toContain(`gh api -X PUT repos/${SLUG}/rulesets/7 --input - <<'JSON'`);
    expect(text).toContain('"integration_id": 15368');
    expect(text).toContain(`gh api -X PATCH repos/${SLUG} -F allow_auto_merge=true`);
    expect(text).toContain('-F can_approve_pull_request_reviews=false');
    expect(text.indexOf('rulesets/7')).toBeLessThan(text.indexOf('allow_auto_merge=true'));
    expect(text).not.toContain('bypass_actors');
    expect(text).toContain(`gh api -X PUT repos/${SLUG}/rulesets/7 --input - <<'JSON' &&`);
    expect(text.indexOf('index("edd/evidence") != null\' | grep -qx true &&')).toBeLessThan(text.indexOf('-X PATCH'));
    expect(text).toContain('Stop at the first error');
  });

  test('the caller\'s own token problem does not withhold the admin\'s commands', () => {
    const weak = hostState({ repo: { permissions: { admin: false, push: true } }, scopes: ['gist'] });
    const pre = assessPreflight(gs, ['edd/evidence'], weak);
    const plan = derivePlan(gs, SLUG, ['edd/evidence'], false, weak, pre.integrationId, []);
    expect(renderHandoff(SLUG, gs, plan, pre, weak).join('\n')).toContain('-X PUT');
  });

  test('with a blocker, only the read commands are printed', () => {
    const blocked = hostState({ repo: { permissions: { admin: false, push: true } }, checkRuns: { check_runs: [] } });
    const pre = assessPreflight(gs, ['edd/evidence'], blocked);
    const plan = derivePlan(gs, SLUG, ['edd/evidence'], false, blocked, pre.integrationId, []);
    const text = renderHandoff(SLUG, gs, plan, pre, blocked).join('\n');
    expect(text).toContain('Not ready to apply yet');
    expect(text).not.toContain('-X PUT');
    expect(text).not.toContain('-X PATCH');
    expect(text).not.toContain('-X POST');
  });
});

describe('runSetup: the host is written only on a person\'s explicit yes', () => {
  test('non-interactive with no flags writes nothing anywhere', async () => {
    const h = harness();
    expect(await runSetup(h.deps, NO_FLAGS)).toBe(0);
    expect(h.asked).toEqual([]);
    expect(h.written).toEqual([]);
    expect(h.applied).toEqual([]);
    expect(h.printed.join('\n')).toContain('Not written: non-interactive run');
  });

  test('Enter on every question, then no to the host write: dry run only', async () => {
    const h = harness({ interactive: true, answers: [ENTER, ENTER, ENTER, true, ENTER] });
    expect(await runSetup(h.deps, NO_FLAGS)).toBe(0);
    expect(h.asked.map(q => q.id)).toEqual(['strategy', 'push', 'merge', 'write', 'apply']);
    expect(h.asked.at(-1)).toMatchObject({ kind: 'confirm', default: false });
    const after = gsOf(h.written[0]);
    expect(after.policy).toMatchObject({ direct_push_to_protected: 'evidence', merge_mode: 'auto' });
    expect(after.meta.strategy_source).toBe('chosen');
    expect(h.written[0]).toContain('direct_push_to_protected: evidence # forbidden | confirm | allowed | evidence');
    expect(h.applied).toEqual([false]);
  });

  test('an explicit yes applies after the dry run', async () => {
    const h = harness({ interactive: true, answers: ['solo-main', 'forbidden', 'auto', true, true] });
    expect(await runSetup(h.deps, NO_FLAGS)).toBe(0);
    expect(h.applied).toEqual([false, true]);
  });

  test('--plan-only never reaches the host write, even for an admin at a terminal', async () => {
    const h = harness({ interactive: true, answers: [ENTER, ENTER, ENTER, true] });
    expect(await runSetup(h.deps, { ...NO_FLAGS, planOnly: true })).toBe(0);
    expect(h.applied).toEqual([]);
    expect(h.printed.join('\n')).toContain('Plan only: nothing was written to GitHub');
  });

  test('the installer path: flags plus --write-policy write the yaml, never the host', async () => {
    const h = harness();
    const flags: SetupFlags = { strategy: 'main-integration', push: 'forbidden', merge: 'auto', planOnly: true, writePolicy: true };
    expect(await runSetup(h.deps, flags)).toBe(0);
    expect(gsOf(h.written[0])).toMatchObject({ strategy: 'main-integration', protected: ['main', 'staging'] });
    expect(h.applied).toEqual([]);
  });

  test('a non-admin gets the hand-off and no write', async () => {
    const bodies = hostBodies({ [`repos/${SLUG}`]: { permissions: { admin: false, push: true }, owner: { login: 'acme', type: 'Organization' } } });
    const h = harness({ interactive: true, answers: ['solo-main', 'forbidden', 'auto', true], bodies });
    expect(await runSetup(h.deps, NO_FLAGS)).toBe(0);
    const out = h.printed.join('\n');
    expect(out).toContain('A) Prompt for the admin\'s AI agent');
    expect(out).toContain('Stopped: ana is not an admin');
    expect(h.applied).toEqual([]);
  });

  test('a blocker stops before any host write', async () => {
    const bodies = hostBodies({ [`repos/${SLUG}/commits/main/check-runs?per_page=100`]: { check_runs: [] } });
    const h = harness({ interactive: true, answers: ['solo-main', 'forbidden', 'auto', true], bodies });
    await runSetup(h.deps, NO_FLAGS);
    expect(h.applied).toEqual([]);
    expect(h.printed.join('\n')).toContain('Stopped before any GitHub write');
  });

  test('a loosening stops: setup never loosens', async () => {
    const strict: Rule[] = [...HOST_PR_RULES, { type: 'pull_request', parameters: { required_approving_review_count: 2, allowed_merge_methods: ['merge'] } }];
    const bodies = hostBodies({ [`repos/${SLUG}/rules/branches/main`]: strict, [`repos/${SLUG}/rulesets/7`]: { rules: strict } });
    const h = harness({ interactive: true, answers: ['solo-main', 'forbidden', 'auto', true], bodies });
    await runSetup(h.deps, NO_FLAGS);
    expect(h.printed.join('\n')).toContain('lowers required approvals 2 -> 0');
    expect(h.applied).toEqual([]);
  });

  test('human-approves asks the CODEOWNERS owner and writes the file on yes', async () => {
    const h = harness({ interactive: true, answers: ['github-flow', 'forbidden', 'human-approves', 'acme/qa-leads', true, true, false] });
    expect(await runSetup(h.deps, NO_FLAGS)).toBe(0);
    expect(h.asked.map(q => q.id)).toEqual(['strategy', 'push', 'merge', 'codeowner', 'write', 'codeowners', 'apply']);
    expect(h.codeowners[0]).toBe('/.github/workflows/** @acme/qa-leads\n/scripts/edd.ts @acme/qa-leads\n/CODEOWNERS @acme/qa-leads\n');
    expect(h.applied).toEqual([false]);
  });

  test('declining the yaml write stops with nothing written', async () => {
    const h = harness({ interactive: true, answers: [ENTER, ENTER, ENTER, false] });
    expect(await runSetup(h.deps, NO_FLAGS)).toBe(0);
    expect(h.written).toEqual([]);
    expect(h.applied).toEqual([]);
  });

  test('no GitHub origin: plan from the yaml alone', async () => {
    const h = harness({ slug: null, interactive: true, answers: [ENTER, ENTER, ENTER, true] });
    expect(await runSetup(h.deps, NO_FLAGS)).toBe(0);
    expect(h.printed.join('\n')).toContain('No GitHub origin');
    expect(h.applied).toEqual([]);
  });

  test('--questions-json prints what the installer asks, in a shape it reads', async () => {
    const h = harness();
    expect(await runSetup(h.deps, { ...NO_FLAGS, questionsJson: true })).toBe(0);
    expect(parseGitPolicyQuestions(h.printed.join(''))?.map(q => q.id)).toEqual(['strategy', 'push', 'merge']);
    expect(h.written).toEqual([]);
  });

  test('a written policy the host does not enforce yet is said plainly', async () => {
    const h = harness();
    await runSetup(h.deps, { strategy: 'github-flow', push: 'forbidden', merge: 'auto', planOnly: true, writePolicy: true });
    expect(h.printed.join('\n')).toContain('declares push forbidden and merge_mode auto, and GitHub does not enforce that yet');
    const quiet = harness();
    await runSetup(quiet.deps, { ...NO_FLAGS, planOnly: true });
    expect(quiet.printed.join('\n')).not.toContain('does not enforce that yet');
  });

  test('human-approves with an open push policy is refused: it would require no approval', async () => {
    const h = harness();
    expect(await runSetup(h.deps, { ...NO_FLAGS, push: 'evidence', merge: 'human-approves', strategy: 'solo-main', writePolicy: true })).toBe(1);
    expect(h.written).toEqual([]);
    const i = harness({ interactive: true, answers: ['solo-main', 'evidence', 'human-approves', 'auto', false] });
    expect(await runSetup(i.deps, NO_FLAGS)).toBe(0);
    expect(i.asked.map(q => q.id)).toEqual(['strategy', 'push', 'merge', 'merge', 'write']);
    expect(i.printed.join('\n')).toContain('human-approves needs push forbidden or confirm');
  });

  test('a non-interactive run plans what the yaml holds, not answers it never wrote', async () => {
    const h = harness();
    await runSetup(h.deps, NO_FLAGS);
    expect(h.printed.join('\n')).toContain('strategy solo-main; push confirm; merge manual');
  });

  test('--write-policy without a terminal needs all three answers', async () => {
    const h = harness();
    expect(await runSetup(h.deps, { ...NO_FLAGS, writePolicy: true, merge: 'auto' })).toBe(1);
    expect(h.written).toEqual([]);
  });

  test('declining CODEOWNERS when the host requires code-owner review stops instead of loosening', async () => {
    const owned: Rule[] = [...HOST_PR_RULES, { type: 'pull_request', parameters: { required_approving_review_count: 1, require_code_owner_review: true, allowed_merge_methods: ['merge'] } }];
    const bodies = hostBodies({ [`repos/${SLUG}/rules/branches/main`]: owned, [`repos/${SLUG}/rulesets/7`]: { rules: owned } });
    const h = harness({ interactive: true, answers: ['github-flow', 'forbidden', 'human-approves', 'ana', true, false], bodies });
    expect(await runSetup(h.deps, NO_FLAGS)).toBe(0);
    expect(h.printed.join('\n')).toContain('without the file this would loosen protection');
    expect(h.applied).toEqual([]);
  });

  test('--push evidence without the gate is refused', async () => {
    const h = harness({ gateReady: false });
    expect(await runSetup(h.deps, { ...NO_FLAGS, push: 'evidence' })).toBe(1);
    expect(h.written).toEqual([]);
  });
});
