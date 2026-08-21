#!/usr/bin/env bun
/**
 * git-policy.ts — parity between the DECLARED git strategy and the ENFORCED host rules.
 *
 * `.agents/project.yaml` -> `git_strategy` records what the team decided.
 * The hosting platform records what is actually enforced. These drift, and the
 * drift is only discovered at the worst moment: a merge that stalls on an
 * approval nobody expected, or a "protected" branch that was never protected.
 *
 * `git-flow-master`'s Step 1b already specified this reconciliation in prose,
 * for an agent to perform by hand. That is exactly why it kept not happening —
 * this repo shipped `require_pr_reviews: 0` against a host demanding 1 approval
 * plus a code-owner review, and the mismatch surfaced as a refused merge.
 * A script performs every query every time, which is the property the prose
 * could not guarantee.
 *
 * COMMANDS
 *   verify   Read the host, diff against git_strategy, report. Read-only.
 *            `--stamp` writes meta.policy_verified / policy_source when clean.
 *            Exit 1 on UNACCEPTED drift; 0 in parity, when every drift is listed
 *            in `policy.accepted_divergences`, or when the host is unreachable
 *            (warned, not verified — absence of data is not drift). Hook-safe.
 *   apply    Derive a ruleset from git_strategy and write it to the host.
 *            Dry-run by DEFAULT; `--yes` performs the write.
 *            Refuses to LOOSEN protection unless `--allow-loosening`.
 *   plan     Print the ruleset git_strategy implies, and exit. No host calls.
 *
 * WHY RULESETS AND NOT CLASSIC BRANCH PROTECTION
 * `branches/{b}/protection` returns 404 on a repo governed by rulesets while
 * every rule still binds. `verify` therefore queries BOTH and treats a classic
 * 404 as "not configured through that mechanism", never as "unprotected".
 * `apply` only ever writes rulesets: mixing the two mechanisms on one branch
 * produces a union nobody can reason about.
 *
 * WHAT THIS DELIBERATELY DOES NOT MANAGE
 *   - `bypass_actors` beyond the org-admin role. Real actor IDs are org
 *     identity, not project config, and must not live in a versioned per-project
 *     file. `verify` reports them; `apply` preserves whatever is already there.
 *   - CODEOWNERS. `require_code_owner_review` is derived from whether the file
 *     actually exists, because turning it on without one produces a requirement
 *     nobody outside the bypass list can ever satisfy.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import pc from 'picocolors';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = join(import.meta.dir, '..');
const PROJECT_YAML = join(REPO_ROOT, '.agents', 'project.yaml');
const RULESET_NAME = 'ProtectPublic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AcceptedDivergence {
  field: string
  enforced?: string
  reason?: string
  accepted?: string
}

interface GitStrategy {
  strategy: string
  branches: { production: string | null, integration: string | null, ephemeral_pattern: string | null }
  protected: string[]
  decisions: { promote_method: string, feature_merge: string, hotfix_policy: string }
  policy: {
    direct_push_to_protected: string
    admin_bypass: boolean
    require_pr_reviews: number | null
    accepted_divergences?: AcceptedDivergence[]
  }
  meta: Record<string, unknown>
}

interface PullRequestParams {
  required_approving_review_count: number
  require_code_owner_review: boolean
  required_review_thread_resolution: boolean
  dismiss_stale_reviews_on_push: boolean
  require_last_push_approval: boolean
  allowed_merge_methods: string[]
}

interface Rule { type: string, parameters?: Record<string, unknown> }

interface Finding {
  severity: 'drift' | 'accepted' | 'info'
  field: string
  declared: string
  enforced: string
  note?: string
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const log = {
  info: (m: string) => console.log(`${pc.blue('i')} ${m}`),
  ok: (m: string) => console.log(`${pc.green('✔')} ${m}`),
  warn: (m: string) => console.log(`${pc.yellow('▲')} ${m}`),
  err: (m: string) => console.log(`${pc.red('✖')} ${m}`),
  dim: (m: string) => console.log(pc.dim(`  ${m}`)),
};

function fail(msg: string): never {
  log.err(msg);
  process.exit(1);
}

/** `gh api` wrapper. Returns null on any non-zero exit (404 / 403 / no network / no gh binary). */
function gh(path: string, args: string[] = []): unknown | null {
  try {
    const p = Bun.spawnSync(['gh', 'api', path, ...args], { stdout: 'pipe', stderr: 'pipe' });
    if (p.exitCode !== 0) { return null; }
    const out = p.stdout.toString().trim();
    if (out === '') { return null; }
    return JSON.parse(out);
  }
  catch { return null; } // gh binary absent, or non-JSON output
}

function ghExitCode(path: string): number {
  try { return Bun.spawnSync(['gh', 'api', path], { stdout: 'pipe', stderr: 'pipe' }).exitCode ?? 1; }
  catch { return 1; }
}

function readStrategy(): GitStrategy {
  if (!existsSync(PROJECT_YAML)) { fail(`.agents/project.yaml not found at ${PROJECT_YAML}`); }
  const doc = parseYaml(readFileSync(PROJECT_YAML, 'utf8')) as Record<string, unknown>;
  const gs = doc?.git_strategy as GitStrategy | undefined;
  // Teach, don't just refuse: a missing block means this project never ran its
  // Git Strategy Setup. Nothing is auto-generated here on purpose — branch
  // policy is a per-project decision, and a silently appended default would
  // record a strategy nobody chose.
  if (!gs) {
    fail([
      '`git_strategy:` block missing from .agents/project.yaml — this project has not run its Git Strategy Setup.',
      '  Branch policy is a per-project decision; this script never invents one, so the block is not auto-created.',
      '  Fix: ask your AI agent to "set up our git strategy" — git-flow-master\'s Strategy Setup questionnaire',
      '  writes the `git_strategy:` block (strategy, branches, protection policy) into .agents/project.yaml.',
      '  Until then, this check keeps failing — including the pre-push hook that runs it on every push.',
    ].join('\n'));
  }
  if (!gs.strategy || gs.strategy === 'null') {
    fail([
      '`git_strategy.strategy` is unset in .agents/project.yaml — the block exists but no strategy was ever chosen.',
      '  Fix: ask your AI agent to "set up our git strategy" (git-flow-master Strategy Setup) to fill it in.',
      '  Until then, this check keeps failing — including the pre-push hook that runs it on every push.',
    ].join('\n'));
  }
  return gs;
}

/** `owner/repo` from the origin remote. */
function readSlug(): string {
  const p = Bun.spawnSync(['git', '-C', REPO_ROOT, 'remote', 'get-url', 'origin'], { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) { fail('No `origin` remote — cannot resolve the repository.'); }
  const url = p.stdout.toString().trim();
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) { fail(`origin is not a GitHub remote: ${url}`); }
  return `${m[1]}/${m[2]}`;
}

function hasCodeowners(): boolean {
  return ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']
    .some(p => existsSync(join(REPO_ROOT, p)));
}

// ---------------------------------------------------------------------------
// The mapping: git_strategy -> ruleset
// ---------------------------------------------------------------------------

/**
 * Branches a strategy protects. Derived from the strategy shape, then unioned
 * with whatever `protected:` already lists — an operator may protect more than
 * the strategy implies, and narrowing that silently would be a loosening.
 */
export function protectedBranches(gs: GitStrategy): string[] {
  const prod = gs.branches?.production ?? 'main';
  const integ = gs.branches?.integration ?? null;
  const byStrategy: Record<string, (string | null)[]> = {
    'solo-main': [prod],
    'github-flow': [prod],
    'trunk-based': [prod],
    'main-integration': [prod, integ],
    'enterprise': [prod, integ],
    'gitflow': [prod, integ ?? 'develop'],
    'gitlab-flow': [prod, integ, 'pre-production'],
    // `sdet` runs an EPHEMERAL per-suite trunk (`branches.ephemeral_pattern`) with
    // `integration: null`. Protecting it would put ruleset friction on exactly the
    // intermediate merges the strategy exists to keep frictionless, so only the
    // production branch is covered. Listed explicitly rather than left to the
    // default, because "the default happened to be right" is not a decision.
    'sdet': [prod],
  };
  const base = byStrategy[gs.strategy] ?? [prod];
  const declared = Array.isArray(gs.protected) ? gs.protected : [];
  return [...new Set([...base, ...declared].filter((b): b is string => typeof b === 'string' && b.length > 0))];
}

/** `feature_merge` decides which merge button the host offers. */
export function allowedMergeMethods(gs: GitStrategy): string[] | null {
  switch (gs.decisions?.feature_merge) {
    case 'squash': return ['squash'];
    case 'rebase-merge': return ['rebase'];
    case 'merge-commit': return ['merge'];
    default: return null; // `n/a` — no decision; the caller preserves the host value
  }
}

/**
 * The ruleset `git_strategy` implies.
 *
 * `direct_push_to_protected: allowed` omits the `pull_request` rule entirely —
 * that rule IS what blocks a direct push. Declaring "allowed" while shipping the
 * rule is the contradiction this whole script exists to catch.
 */
export const MANAGED_RULE_TYPES = new Set(['deletion', 'non_fast_forward', 'creation', 'pull_request']);

/** Fields formally accepted as divergent in `policy.accepted_divergences`. */
export function acceptedFields(gs: GitStrategy): string[] {
  return (gs.policy?.accepted_divergences ?? [])
    .map(d => d?.field)
    .filter((f): f is string => typeof f === 'string' && f.length > 0);
}

export function buildRules(gs: GitStrategy, codeowners: boolean, current: Rule[] = []): Rule[] {
  const rules: Rule[] = [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    { type: 'creation' },
  ];

  // An accepted divergence on direct_push_to_protected means "the host's side of
  // this field is intended". Deriving our own pull_request rule (or omitting it)
  // would overwrite exactly what was accepted — carry the host's rule forward as-is.
  const acceptedDirectPush = acceptedFields(gs).some(f => f.endsWith('.direct_push_to_protected'));
  if (acceptedDirectPush) {
    const hostPr = current.find(r => r.type === 'pull_request');
    if (hostPr) { rules.push(hostPr); }
  }
  else if (gs.policy?.direct_push_to_protected !== 'allowed') {
    const currentPr = current.find(r => r.type === 'pull_request');
    const currentMethods = (currentPr?.parameters as Partial<PullRequestParams> | undefined)?.allowed_merge_methods;
    const params: PullRequestParams = {
      required_approving_review_count: gs.policy?.require_pr_reviews ?? 0,
      // Derived, never declared: the flag without the file is unsatisfiable.
      require_code_owner_review: codeowners,
      required_review_thread_resolution: true,
      dismiss_stale_reviews_on_push: true,
      require_last_push_approval: false,
      // `feature_merge: n/a` means the project made no decision here, so the
      // host's existing setting is the only real answer — overwriting it with
      // "all three" would WIDEN what the repo permits on the strength of a
      // non-decision.
      allowed_merge_methods: allowedMergeMethods(gs) ?? currentMethods ?? ['merge', 'squash', 'rebase'],
    };
    rules.push({ type: 'pull_request', parameters: params as unknown as Record<string, unknown> });
  }

  // Carry forward every rule this tool does not model (required_signatures,
  // required_status_checks, ...). They are not derivable from `git_strategy`,
  // and dropping a guard because the tool has no opinion about it is exactly
  // the silent loosening this design refuses to perform.
  for (const r of current) {
    if (!MANAGED_RULE_TYPES.has(r.type)) { rules.push(r); }
  }

  return rules;
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

interface HostReading {
  branch: string
  rulesetRules: Rule[]
  classicStatus: 'configured' | 'not-configured' | 'forbidden'
}

function readHost(slug: string, branch: string): HostReading {
  const rules = (gh(`repos/${slug}/rules/branches/${branch}`) as Rule[] | null) ?? [];
  const code = ghExitCode(`repos/${slug}/branches/${branch}/protection`);
  const classicStatus = code === 0 ? 'configured' : code === 1 ? 'not-configured' : 'forbidden';
  return { branch, rulesetRules: rules, classicStatus };
}

function verify(gs: GitStrategy, slug: string, stamp: boolean): number {
  // Preflight: no host reading means no finding, not a drift. Exit 0 with a loud
  // warning so hooks (pre-push) and `repo:check` never block on a machine that is
  // offline, unauthenticated, or missing `gh` — absence of data is not parity.
  if (gh(`repos/${slug}`) === null) {
    log.warn(`Cannot reach ${slug} via \`gh api\` (no gh binary, no auth, or no network).`);
    log.dim('Parity NOT verified — skipping. Run `bun run git:policy verify` from a connected, authenticated shell.');
    return 0;
  }

  const branches = protectedBranches(gs);
  const codeowners = hasCodeowners();
  const findings: Finding[] = [];
  const accepted = gs.policy?.accepted_divergences ?? [];

  console.log(pc.bold('\nGit Policy Parity Report'));
  console.log('='.repeat(50));
  console.log(`Repository:  ${slug}`);
  console.log(`Strategy:    ${gs.strategy}`);
  console.log(`Protected:   ${branches.join(', ')}`);
  console.log(`CODEOWNERS:  ${codeowners ? 'present' : 'absent'}`);
  console.log('');

  for (const branch of branches) {
    const host = readHost(slug, branch);
    const pr = host.rulesetRules.find(r => r.type === 'pull_request');
    const p = (pr?.parameters ?? {}) as Partial<PullRequestParams>;

    console.log(pc.bold(`Branch ${branch}`));
    if (host.rulesetRules.length === 0) {
      console.log('  no ruleset rules apply');
    }
    else {
      console.log(`  rules: ${host.rulesetRules.map(r => r.type).join(', ')}`);
    }
    if (host.classicStatus === 'configured') {
      console.log(`  ${pc.yellow('classic branch protection ALSO configured')} — two mechanisms union on this branch`);
    }

    // --- direct push ---
    const declaredPush = gs.policy?.direct_push_to_protected ?? 'confirm';
    const enforcedBlocked = pr !== undefined;
    if (declaredPush === 'allowed' && enforcedBlocked) {
      findings.push({
        severity: 'drift',
        field: `${branch}.direct_push_to_protected`,
        declared: 'allowed',
        enforced: 'blocked (a pull_request rule covers this branch)',
        note: 'Bypass actors still get through; everyone else does not.',
      });
    }
    if (declaredPush !== 'allowed' && !enforcedBlocked) {
      findings.push({
        severity: 'drift',
        field: `${branch}.direct_push_to_protected`,
        declared: declaredPush,
        enforced: 'open (no pull_request rule)',
      });
    }

    // --- reviews ---
    const declaredReviews = gs.policy?.require_pr_reviews;
    const enforcedReviews = pr ? (p.required_approving_review_count ?? 0) : null;
    if (declaredReviews !== null && declaredReviews !== undefined && enforcedReviews !== null && declaredReviews !== enforcedReviews) {
      findings.push({
        severity: 'drift',
        field: `${branch}.require_pr_reviews`,
        declared: String(declaredReviews),
        enforced: String(enforcedReviews),
      });
    }

    // --- code owner review, the unsatisfiable-requirement trap ---
    if (p.require_code_owner_review === true && !codeowners) {
      findings.push({
        severity: 'drift',
        field: `${branch}.require_code_owner_review`,
        declared: 'n/a (derived from CODEOWNERS, which is absent)',
        enforced: 'true',
        note: 'No CODEOWNERS file exists, so nobody outside the bypass list can ever satisfy this. Either add the file or turn the flag off.',
      });
    }

    // --- merge methods ---
    const wantMethods = allowedMergeMethods(gs);
    const gotMethods = p.allowed_merge_methods;
    if (pr && gotMethods && wantMethods) {
      const same = wantMethods.length === gotMethods.length && wantMethods.every(m => gotMethods.includes(m));
      if (!same) {
        findings.push({
          severity: 'drift',
          field: `${branch}.allowed_merge_methods`,
          declared: `${wantMethods.join(', ')} (from feature_merge: ${gs.decisions.feature_merge})`,
          enforced: gotMethods.join(', '),
        });
      }
    }

    // --- force-push / deletion guards ---
    for (const t of ['non_fast_forward', 'deletion'] as const) {
      if (!host.rulesetRules.some(r => r.type === t)) {
        findings.push({
          severity: 'info',
          field: `${branch}.${t}`,
          declared: 'expected (every strategy protects against this)',
          enforced: 'absent',
        });
      }
    }
    console.log('');
  }

  // --- admin bypass ---
  const rs = (gh(`repos/${slug}/rulesets`) as { id: number, name: string }[] | null) ?? [];
  const target = rs.find(r => r.name === RULESET_NAME) ?? rs[0];
  if (target) {
    const full = gh(`repos/${slug}/rulesets/${target.id}`) as { bypass_actors?: { actor_type: string, bypass_mode: string }[] } | null;
    const actors = full?.bypass_actors ?? [];
    const declaredBypass = gs.policy?.admin_bypass === true;
    const hasAdminBypass = actors.some(a => a.actor_type === 'OrganizationAdmin' || a.actor_type === 'RepositoryRole');
    console.log(pc.bold(`Ruleset ${target.name} (id ${target.id})`));
    console.log(`  bypass_actors: ${actors.length === 0 ? 'none' : actors.map(a => `${a.actor_type}/${a.bypass_mode}`).join(', ')}`);
    if (declaredBypass !== hasAdminBypass) {
      findings.push({
        severity: 'drift',
        field: 'admin_bypass',
        declared: String(declaredBypass),
        enforced: String(hasAdminBypass),
      });
    }
    console.log('');
  }

  // --- accepted divergences: declared drift the project has formally signed off ---
  const acceptedByField = new Map(accepted.filter(a => a?.field).map(a => [a.field, a]));
  for (const f of findings) {
    if (f.severity === 'drift' && acceptedByField.has(f.field)) { f.severity = 'accepted'; }
  }
  // A stale entry accepts a divergence that no longer exists — surface it so the
  // list cannot silently accumulate dead exceptions.
  const matched = new Set(findings.filter(f => f.severity === 'accepted').map(f => f.field));
  for (const a of acceptedByField.keys()) {
    if (!matched.has(a)) {
      findings.push({
        severity: 'info',
        field: a,
        declared: 'accepted divergence (policy.accepted_divergences)',
        enforced: 'no matching drift — STALE entry, remove it from the yaml',
      });
    }
  }

  // --- report ---
  const drifts = findings.filter(f => f.severity === 'drift');
  const accepts = findings.filter(f => f.severity === 'accepted');
  const infos = findings.filter(f => f.severity === 'info');

  console.log(pc.bold(`DRIFT (${drifts.length}):`));
  if (drifts.length === 0) { console.log('  <none>'); }
  for (const f of drifts) {
    console.log(`  ${pc.red('✖')} ${f.field}`);
    console.log(`      declared: ${f.declared}`);
    console.log(`      enforced: ${f.enforced}`);
    if (f.note) { console.log(pc.dim(`      ${f.note}`)); }
  }
  if (accepts.length > 0) {
    console.log(`\n${pc.bold(`ACCEPTED (${accepts.length}):`)}`);
    for (const f of accepts) {
      const entry = acceptedByField.get(f.field);
      console.log(`  ${pc.green('✔')} ${f.field}  declared ${f.declared} / enforced ${f.enforced}`);
      if (entry?.reason) { console.log(pc.dim(`      ${String(entry.reason).trim().replace(/\s+/g, ' ')}`)); }
    }
  }
  if (infos.length > 0) {
    console.log(`\n${pc.bold(`NOTES (${infos.length}):`)}`);
    for (const f of infos) { console.log(`  ${pc.yellow('▲')} ${f.field}: ${f.enforced}`); }
  }

  console.log('');
  if (drifts.length > 0) {
    log.warn('Declared policy does not match the host.');
    log.dim('Fix the host:  bun run git:policy apply --yes');
    log.dim('Fix the yaml:  edit .agents/project.yaml -> git_strategy.policy, then re-run verify');
    log.dim('Accept it:     add the finding\'s field to git_strategy.policy.accepted_divergences with a reason');
    return 1;
  }

  const source = accepts.length > 0 ? 'accepted' : 'verified';
  if (accepts.length > 0) { log.ok('Declared policy matches the host, modulo formally accepted divergences.'); }
  else { log.ok('Declared policy matches the host.'); }
  if (stamp) { stampVerified(source); }
  else { log.dim(`Re-run with --stamp to record meta.policy_verified / policy_source: ${source}`); }
  return 0;
}

/** Append-only edit of the two meta fields. Never rewrites anything else. */
function stampVerified(source: 'verified' | 'accepted'): void {
  const today = new Date().toISOString().slice(0, 10);
  const verifiedRe = /^(\s*)policy_verified:\s*\S+/m;
  const sourceRe = /^(\s*)policy_source:\s*\S+/m;
  let text = readFileSync(PROJECT_YAML, 'utf8');

  // Absent fields and already-correct fields both produce an unchanged file, so
  // test for presence FIRST. Reporting "could not stamp" on an already-stamped
  // file trains the reader to ignore the warning.
  if (!verifiedRe.test(text) || !sourceRe.test(text)) {
    log.warn('meta.policy_verified / meta.policy_source not found in git_strategy.meta — nothing stamped.');
    return;
  }

  const before = text;
  text = text.replace(verifiedRe, `$1policy_verified: ${today}`);
  text = text.replace(sourceRe, `$1policy_source: ${source}`);
  if (text === before) {
    log.ok(`Already stamped: policy_verified: ${today}, policy_source: ${source}`);
    return;
  }
  writeFileSync(PROJECT_YAML, text);
  log.ok(`Stamped meta.policy_verified: ${today}, meta.policy_source: ${source}`);
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

/**
 * A change LOOSENS protection when it removes a guard or lowers the review bar.
 * `apply` refuses those by default: a tool that can silently open `main` is a
 * worse problem than the drift it fixes.
 */
function detectLoosening(current: Rule[], next: Rule[], slug: string, branch: string): string[] {
  const out: string[] = [];
  for (const t of ['deletion', 'non_fast_forward', 'required_signatures'] as const) {
    if (current.some(r => r.type === t) && !next.some(r => r.type === t)) {
      out.push(`${branch}: removes the \`${t}\` guard`);
    }
  }
  const curPr = current.find(r => r.type === 'pull_request');
  const nextPr = next.find(r => r.type === 'pull_request');
  if (curPr && !nextPr) { out.push(`${branch}: removes the pull-request requirement entirely (direct pushes become possible)`); }
  if (curPr && nextPr) {
    const c = (curPr.parameters ?? {}) as Partial<PullRequestParams>;
    const n = (nextPr.parameters ?? {}) as Partial<PullRequestParams>;
    const cr = c.required_approving_review_count ?? 0;
    const nr = n.required_approving_review_count ?? 0;
    if (nr < cr) { out.push(`${branch}: lowers required approvals ${cr} -> ${nr}`); }
    if (c.require_code_owner_review && !n.require_code_owner_review) {
      out.push(`${branch}: turns off require_code_owner_review`);
    }
    const cm = c.allowed_merge_methods ?? [];
    const nm = n.allowed_merge_methods ?? [];
    const widened = nm.filter(m => cm.length > 0 && !cm.includes(m));
    if (widened.length > 0) {
      out.push(`${branch}: permits merge method(s) the host currently forbids: ${widened.join(', ')}`);
    }
  }
  void slug;
  return out;
}

function apply(gs: GitStrategy, slug: string, write: boolean, allowLoosening: boolean): number {
  // Unlike verify, an unreachable host here is FATAL: apply derives its payload
  // from the host's current rules, and an empty reading would masquerade as
  // "no ruleset exists" and produce a CREATE payload that drops every host rule.
  if (gh(`repos/${slug}`) === null) {
    log.err(`Cannot reach ${slug} via \`gh api\` (no gh binary, no auth, or no network). Refusing to derive a ruleset from an empty host reading.`);
    return 1;
  }

  const branches = protectedBranches(gs);
  const codeowners = hasCodeowners();

  const rs = (gh(`repos/${slug}/rulesets`) as { id: number, name: string }[] | null) ?? [];
  const existing = rs.find(r => r.name === RULESET_NAME) ?? null;

  // Seed from whatever the ruleset already holds so unmanaged rules survive.
  const currentRuleset = existing
    ? (gh(`repos/${slug}/rulesets/${existing.id}`) as { rules?: Rule[] } | null)
    : null;
  const nextRules = buildRules(gs, codeowners, currentRuleset?.rules ?? []);

  console.log(pc.bold('\nGit Policy Apply'));
  console.log('='.repeat(50));
  console.log(`Repository:  ${slug}`);
  console.log(`Strategy:    ${gs.strategy}`);
  console.log(`Ruleset:     ${existing ? `${RULESET_NAME} (id ${existing.id}) — UPDATE` : `${RULESET_NAME} — CREATE`}`);
  console.log(`Branches:    ${branches.join(', ')}`);
  console.log(`CODEOWNERS:  ${codeowners ? 'present -> require_code_owner_review: true' : 'absent -> require_code_owner_review: false'}`);
  console.log('');
  console.log(pc.bold('Rules to write:'));
  for (const r of nextRules) {
    if (r.type === 'pull_request') {
      const p = r.parameters as unknown as PullRequestParams;
      console.log(`  pull_request  reviews=${p.required_approving_review_count} codeowner=${p.require_code_owner_review} methods=[${p.allowed_merge_methods.join(', ')}]`);
    }
    else { console.log(`  ${r.type}`); }
  }
  console.log('');

  // Loosening check against every branch currently covered.
  const loosenings: string[] = [];
  for (const b of branches) {
    const current = (gh(`repos/${slug}/rules/branches/${b}`) as Rule[] | null) ?? [];
    loosenings.push(...detectLoosening(current, nextRules, slug, b));
  }

  if (loosenings.length > 0) {
    log.warn('This would LOOSEN protection:');
    for (const l of loosenings) { console.log(`    ${pc.red('-')} ${l}`); }
    if (!allowLoosening) {
      console.log('');
      fail('Refusing to loosen protection. Re-run with --allow-loosening if this is intended.');
    }
    console.log(pc.dim('  --allow-loosening given; proceeding.'));
    console.log('');
  }

  const body = {
    name: RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: branches.map(b => `refs/heads/${b}`), exclude: [] } },
    rules: nextRules,
    // bypass_actors is intentionally omitted on PATCH so the host keeps whatever
    // is configured. On CREATE, seed org-admin bypass only when policy asks for it.
    ...(existing ? {} : { bypass_actors: gs.policy?.admin_bypass ? [{ actor_type: 'OrganizationAdmin', bypass_mode: 'always' }] : [] }),
  };

  if (!write) {
    console.log(pc.bold('Payload (dry run — nothing sent):'));
    console.log(JSON.stringify(body, null, 2));
    console.log('');
    log.info('Dry run. Re-run with --yes to write it.');
    return 0;
  }

  const tmp = join('/tmp', `git-policy-${process.pid}.json`);
  writeFileSync(tmp, JSON.stringify(body));
  const path = existing ? `repos/${slug}/rulesets/${existing.id}` : `repos/${slug}/rulesets`;
  // GitHub's "Update a repository ruleset" is PUT, not PATCH — PATCH returns 404.
  const method = existing ? 'PUT' : 'POST';
  const p = Bun.spawnSync(['gh', 'api', '-X', method, path, '--input', tmp], { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) {
    log.err(`${method} ${path} failed:`);
    console.log(p.stderr.toString().trim());
    return 1;
  }
  log.ok(`${method} ${path} succeeded.`);
  log.dim('Re-run `bun run git:policy verify --stamp` to record the reconciliation.');
  return 0;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const HELP = `
git-policy — parity between .agents/project.yaml -> git_strategy and the host ruleset

USAGE
  bun run git:policy <command> [flags]

COMMANDS
  verify              Read the host, diff against git_strategy, report. Exit 1 on
                      unaccepted drift; divergences listed in
                      git_strategy.policy.accepted_divergences report as ACCEPTED
                      (exit 0). Unreachable host = warn + exit 0 (hook-safe).
  apply               Write the ruleset git_strategy implies. Dry-run unless --yes.
                      Preserves the host's side of any accepted-divergent field.
  plan                Print the implied ruleset. No host calls.

FLAGS
  --stamp             (verify) write meta.policy_verified / policy_source when in parity
  --yes               (apply) actually write; without it, apply is a dry run
  --allow-loosening   (apply) permit a change that removes a guard or lowers the review bar
  --help              this text

NOTES
  Rulesets only. Classic branch protection is READ by verify (a 404 there means
  "not configured through that mechanism", never "unprotected") and never written.
  bypass_actors and CODEOWNERS are reported, not managed — see the file header.
`;

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    console.log(HELP);
    process.exit(0);
  }
  const cmd = argv[0];
  const gs = readStrategy();
  const slug = readSlug();

  switch (cmd) {
    case 'verify':
      process.exit(verify(gs, slug, argv.includes('--stamp')));
      break;
    case 'apply':
      process.exit(apply(gs, slug, argv.includes('--yes'), argv.includes('--allow-loosening')));
      break;
    case 'plan': {
      // `plan` makes no host calls, so it cannot know which unmanaged rules
      // exist; it shows only what the strategy itself implies.
      const rules = buildRules(gs, hasCodeowners());
      console.log(JSON.stringify({
        strategy: gs.strategy,
        branches: protectedBranches(gs),
        codeowners: hasCodeowners(),
        rules,
      }, null, 2));
      process.exit(0);
      break;
    }
    default:
      fail(`Unknown command: ${cmd}. Use --help.`);
  }
}

main();
