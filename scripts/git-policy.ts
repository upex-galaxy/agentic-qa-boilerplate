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
 *            `--merge <base>` checks only that `edd/evidence` is a required
 *            check carrying an integration_id on <base>; exit 1 otherwise,
 *            including an unreadable host or no GitHub origin, because it
 *            guards `gh pr merge --auto`.
 *            Exit 1 on UNACCEPTED drift; 0 in parity, when every drift is listed
 *            in `policy.accepted_divergences`, when the host is unreachable or
 *            there is no GitHub origin (warned, not verified — absence of data
 *            is not drift), or while `meta.strategy_source` is `inherited`
 *            (drift printed as warnings: nobody chose that policy). Hook-safe.
 *   apply    Derive a ruleset and the repo merge settings from git_strategy
 *            and the `evidence:` contract, and write them to the host.
 *            Dry-run by DEFAULT; `--yes` performs the write.
 *            Refuses to LOOSEN protection unless `--allow-loosening`.
 *   plan     Print the ruleset and repo settings git_strategy implies, and exit.
 *            No host calls.
 *   migrate  Move git_strategy.policy to `evidence` where the migration table
 *            says so. Dry-run by DEFAULT; `--yes` rewrites only the policy lines.
 *   setup    Ask strategy, push confirmation and merge mode, write those keys,
 *            print the plan and a read-only preflight, then either apply on a
 *            person's explicit yes (admins) or print a hand-off for an admin.
 *            `--plan-only` and a non-interactive run never write to the host.
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
 *     A caller without admin rights on the repository is not served that field
 *     AT ALL: the key is omitted and `current_user_can_bypass` reads `never`.
 *     That is a permissions artifact, not an empty bypass list, so `verify`
 *     reports UNKNOWN and never drift — the same law as the classic-404 case
 *     above, which `/git-flow-master` Step 1b states outright: absence of data
 *     is not data.
 *   - CODEOWNERS. `require_code_owner_review` is derived from whether the file
 *     actually exists, because turning it on without one produces a requirement
 *     nobody outside the bypass list can ever satisfy.
 */

import type { SetupDeps } from './lib/git-policy-setup.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import process from 'node:process';
import pc from 'picocolors';

import { parse as parseYaml } from 'yaml';
import { pickLang } from '../cli/lib/ui/strings.ts';
import { parseSetupFlags, promptAsk, runSetup } from './lib/git-policy-setup.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const PROJECT_YAML = join(REPO_ROOT, '.agents', 'project.yaml');
export const RULESET_NAME = 'ProtectPublic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AcceptedDivergence {
  field: string
  enforced?: string
  reason?: string
  accepted?: string
}

export interface GitStrategy {
  strategy: string
  branches: { production: string | null, integration: string | null, ephemeral_pattern: string | null }
  protected: string[]
  decisions: { promote_method: string, feature_merge: string, hotfix_policy: string }
  policy: {
    direct_push_to_protected?: string | null
    merge_mode?: string | null
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

export interface Rule { type: string, parameters?: Record<string, unknown> }

export interface EvidenceCheck { id: string, cmd?: string, where?: string[] }

export interface EvidenceContract { static?: EvidenceCheck[] | null }

interface StatusCheck { context: string, integration_id?: number }

interface CheckRun {
  name?: string
  app?: { id?: number, slug?: string } | null
  started_at?: string | null
  completed_at?: string | null
}

export interface RepoSettingsPatch {
  allow_auto_merge?: boolean
  allow_merge_commit?: boolean
  allow_squash_merge?: boolean
  allow_rebase_merge?: boolean
}

export interface MigrationTarget { direct_push_to_protected: string, merge_mode: string }

export interface YamlEdit { path: string[], value: string }

export interface ActionsWorkflowPermissions {
  default_workflow_permissions?: string
  can_approve_pull_request_reviews?: boolean
}

export type Migration
  = | { action: 'setup', note: string }
    | ({ action: 'rewrite', note: string } & MigrationTarget)
    | { action: 'offer', note: string, direct_push_to_protected?: string, merge_mode?: string }
    | { action: 'blocked', note: string }
    | { action: 'none', note: string };

export interface EddGate { ready: boolean, missing: string[] }

interface BypassActor { actor_type: string, bypass_mode: string }

/** The subset of `GET /repos/{owner}/{repo}/rulesets/{id}` this tool reads. */
interface RulesetDetail {
  bypass_actors?: BypassActor[] | null
  current_user_can_bypass?: string
}

/**
 * Whether the bypass list was READ, or merely not served. Two different facts,
 * and collapsing them is the defect this type exists to make unrepresentable.
 */
export type BypassAssessment
  = | { known: true, actors: BypassActor[], hasAdminBypass: boolean }
    | { known: false, reason: string, currentUserCanBypass: string | null };

export interface Finding {
  severity: 'drift' | 'accepted' | 'info'
  field: string
  declared: string
  enforced: string
  note?: string
  /** The host's side of this field could not be read. Not parity, not drift. */
  unknown?: boolean
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

/** The `login` `gh` is currently authenticated as. Named in every UNKNOWN report. */
function activeGitHubAccount(): string | null {
  const me = gh('user') as { login?: string } | null;
  return typeof me?.login === 'string' ? me.login : null;
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

export const INHERITED_EVIDENCE_STRATEGY: GitStrategy = {
  strategy: 'solo-main',
  branches: { production: 'main', integration: null, ephemeral_pattern: null },
  protected: ['main'],
  decisions: { promote_method: 'n/a', feature_merge: 'n/a', hotfix_policy: 'n/a' },
  policy: { direct_push_to_protected: 'evidence', admin_bypass: false, require_pr_reviews: null },
  meta: { strategy_source: 'inherited' },
};

export function strategyForVerify(doc: unknown): { gs: GitStrategy | null, missingBlock: boolean } {
  const gs = (doc as { git_strategy?: unknown } | null)?.git_strategy;
  if (gs === undefined || gs === null) { return { gs: INHERITED_EVIDENCE_STRATEGY, missingBlock: true }; }
  return { gs: null, missingBlock: false };
}

function readEvidence(): EvidenceContract | null {
  const doc = parseYaml(readFileSync(PROJECT_YAML, 'utf8')) as Record<string, unknown> | null;
  const block = doc?.evidence;
  return block !== null && typeof block === 'object' ? block : null;
}

/** `owner/repo` of a GitHub remote URL; null for any other remote. */
export function slugFromRemote(url: string): string | null {
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** The origin remote's URL, or null when there is no origin. */
function originUrl(): string | null {
  const p = Bun.spawnSync(['git', '-C', REPO_ROOT, 'remote', 'get-url', 'origin'], { stdout: 'pipe', stderr: 'pipe' });
  return p.exitCode === 0 ? p.stdout.toString().trim() : null;
}

/** `owner/repo` from the origin remote. */
function readSlug(): string {
  const url = originUrl();
  if (url === null) { fail('No `origin` remote — cannot resolve the repository.'); }
  const slug = slugFromRemote(url);
  if (slug === null) { fail(`origin is not a GitHub remote: ${url}`); }
  return slug;
}

/**
 * verify's exit code. Unaccepted drift blocks only a policy somebody CHOSE:
 * while `meta.strategy_source` is `inherited` the yaml holds the shipped default,
 * not a decision, and a fresh repository has no ruleset yet, so every finding is
 * a warning that points at Strategy Setup. Blocking there refused the first push
 * of every new project with a host to compare against.
 */
export function verifyExitCode(drifts: number, strategySource: unknown): number {
  return drifts > 0 && strategySource !== 'inherited' ? 1 : 0;
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
    'gitlab-flow': [prod, integ, 'main', 'pre-production', 'production'],
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
 * `direct_push_to_protected: allowed` and `evidence` omit the `pull_request`
 * rule entirely — that rule IS what blocks a direct push. Declaring either while
 * shipping the rule is the contradiction this whole script exists to catch.
 */
export const MANAGED_RULE_TYPES = new Set(['deletion', 'non_fast_forward', 'creation', 'pull_request', 'required_status_checks']);

export const EDD_CHECK = 'edd/evidence';
export const DIRECT_PUSH_VALUES = ['forbidden', 'confirm', 'allowed', 'evidence'];
export const MERGE_MODES = ['auto', 'human-approves', 'manual'];

const MERGE_MODE_UNDECLARED_NOTE = 'merge_mode is not declared; defaulted to auto, so this is a warning until git_strategy.policy.merge_mode is set';
const DIRECT_PUSH_UNDECLARED_NOTE = 'direct_push_to_protected is not declared; read as evidence, so this is a warning until it is set';
const REPO_MERGE_FLAGS = ['allow_merge_commit', 'allow_squash_merge', 'allow_rebase_merge'] as const;

export function directPushPolicy(gs: GitStrategy | null | undefined): string {
  return gs?.policy?.direct_push_to_protected ?? 'evidence';
}

export function directPushOpen(policy: string): boolean {
  return policy === 'allowed' || policy === 'evidence';
}

export function mergeMode(gs: GitStrategy): string {
  return gs.policy?.merge_mode ?? 'auto';
}

function isMergeModeField(field: string): boolean {
  return field === 'repo.allowed_merge_methods' || field.endsWith('.merge_mode') || field.endsWith('.required_checks');
}

export function softenUndeclared(gs: GitStrategy, findings: Finding[]): void {
  const pushDeclared = directPushDeclared(gs);
  const modeDeclared = mergeModeDeclared(gs);
  for (const f of findings) {
    if (f.severity !== 'drift') { continue; }
    if (!pushDeclared && f.field.endsWith('.direct_push_to_protected')) {
      f.severity = 'info';
      f.note = DIRECT_PUSH_UNDECLARED_NOTE;
    }
    else if (!modeDeclared && isMergeModeField(f.field)) {
      f.severity = 'info';
      f.note = MERGE_MODE_UNDECLARED_NOTE;
    }
  }
}

export function directPushDeclared(gs: GitStrategy): boolean {
  return gs.policy?.direct_push_to_protected !== null && gs.policy?.direct_push_to_protected !== undefined;
}

export function mergeModeDeclared(gs: GitStrategy): boolean {
  return gs.policy?.merge_mode !== null && gs.policy?.merge_mode !== undefined;
}

export function effectiveForApply(gs: GitStrategy): GitStrategy {
  if (mergeModeDeclared(gs)) { return gs; }
  return { ...gs, policy: { ...gs.policy, merge_mode: 'manual' } };
}

export function mergesOnChecks(gs: GitStrategy): boolean {
  const mode = mergeMode(gs);
  return mode === 'auto' || mode === 'human-approves';
}

export function requiredCheckContexts(contract: EvidenceContract | null | undefined): string[] {
  const checks = Array.isArray(contract?.static) ? contract.static : [];
  const ci = checks
    .filter(c => Array.isArray(c?.where) && c.where.includes('ci'))
    .map(c => c.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set([EDD_CHECK, ...ci])];
}

export function statusChecksManaged(gs: GitStrategy): boolean {
  // A required check on a branch meant to take direct pushes refuses every direct push unless the credential bypasses.
  return mergesOnChecks(gs) && (!directPushOpen(directPushPolicy(gs)) || gs.policy?.admin_bypass === true);
}

export function pullRequestModeParams(gs: GitStrategy): Pick<PullRequestParams, 'required_approving_review_count' | 'require_last_push_approval'> {
  const declared = gs.policy?.require_pr_reviews;
  switch (mergeMode(gs)) {
    case 'auto': return { required_approving_review_count: 0, require_last_push_approval: false };
    case 'human-approves': return { required_approving_review_count: Math.max(1, declared ?? 1), require_last_push_approval: true };
    default: return { required_approving_review_count: declared ?? 0, require_last_push_approval: false };
  }
}

export function expectedApprovals(gs: GitStrategy): number {
  return pullRequestModeParams(gs).required_approving_review_count;
}

function statusChecksOf(rules: Rule[]): StatusCheck[] {
  return rules
    .filter(r => r?.type === 'required_status_checks')
    .flatMap((r) => {
      const list = r.parameters?.required_status_checks;
      return Array.isArray(list) ? list.filter((c): c is StatusCheck => typeof c?.context === 'string') : [];
    });
}

function runStartedAt(run: CheckRun): number {
  const t = Date.parse(run.started_at ?? run.completed_at ?? '');
  return Number.isNaN(t) ? 0 : t;
}

export function resolveIntegrationId(body: unknown): number | null {
  const runs = (body as { check_runs?: unknown } | null)?.check_runs;
  if (!Array.isArray(runs)) { return null; }
  const actions = runs.filter((r): r is CheckRun & { app: { id: number, slug: string } } => typeof r?.app?.id === 'number' && r.app.slug === 'github-actions');
  const latestEdd = actions
    .filter(r => r.name === EDD_CHECK)
    .sort((a, b) => runStartedAt(b) - runStartedAt(a))[0];
  return (latestEdd ?? actions[0])?.app.id ?? null;
}

export function missingCheckRuns(contexts: string[], checkRunsBody: unknown): string[] {
  const runs = (checkRunsBody as { check_runs?: unknown } | null)?.check_runs;
  const names = new Set((Array.isArray(runs) ? runs : [])
    .map(r => (r as CheckRun | null)?.name)
    .filter((n): n is string => typeof n === 'string'));
  return [...new Set(contexts)].filter(c => !names.has(c));
}

export function prHeadCheckRuns(read: (path: string) => unknown | null, slug: string, production: string): unknown | null {
  const pulls = read(`repos/${slug}/pulls?state=all&base=${production}&sort=created&direction=desc&per_page=10`);
  if (!Array.isArray(pulls)) { return null; }
  for (const pr of pulls as { head?: { sha?: unknown } }[]) {
    const sha = pr?.head?.sha;
    if (typeof sha !== 'string') { continue; }
    const runs = read(`repos/${slug}/commits/${sha}/check-runs?check_name=${encodeURIComponent(EDD_CHECK)}&per_page=100`);
    if (missingCheckRuns([EDD_CHECK], runs).length === 0) { return runs; }
  }
  return { check_runs: [] };
}

export function missingRequiredChecks(contexts: string[], tipCheckRuns: unknown, prCheckRuns: unknown): { tip: string[], pr: string[] } {
  const wanted = [...new Set(contexts)];
  const tip = missingCheckRuns(wanted.filter(c => c !== EDD_CHECK), tipCheckRuns);
  const eddSeen = missingCheckRuns([EDD_CHECK], tipCheckRuns).length === 0 || missingCheckRuns([EDD_CHECK], prCheckRuns).length === 0;
  return { tip, pr: wanted.includes(EDD_CHECK) && !eddSeen ? [EDD_CHECK] : [] };
}

export function firstPullRequestNeeded(production: string): string {
  return `${EDD_CHECK} has not reported on any of the latest pull requests into ${production}. It runs only on pull requests (pull_request_target), never on ${production} itself, so the first one has to be a pull request into ${production} opened after .github/workflows/evidence.yml is on ${production} (a draft is enough, it is never merged for this); its run reports ${EDD_CHECK} on the PR head. Then re-run.`;
}

export function mergeGuard(rules: unknown): { ok: boolean, reason: string } {
  if (!Array.isArray(rules)) {
    return { ok: false, reason: 'the base branch rules could not be read, so nothing proves a required check guards the merge' };
  }
  const edd = statusChecksOf(rules as Rule[]).filter(c => c.context === EDD_CHECK);
  if (edd.length === 0) {
    return { ok: false, reason: `${EDD_CHECK} is not a required status check on the base: gh pr merge --auto would merge at once, red or not` };
  }
  const bound = edd.find(c => typeof c.integration_id === 'number');
  if (!bound) {
    return { ok: false, reason: `${EDD_CHECK} is required on the base but carries no integration_id, so any app could post it` };
  }
  return { ok: true, reason: `${EDD_CHECK} is required on the base (integration_id ${bound.integration_id})` };
}

export function repoSettingsPatch(gs: GitStrategy, rules: Rule[]): RepoSettingsPatch {
  const patch: RepoSettingsPatch = {};
  if (mergesOnChecks(gs) && statusChecksOf(rules).some(c => c.context === EDD_CHECK)) {
    patch.allow_auto_merge = true;
  }
  const methods = allowedMergeMethods(gs);
  if (methods) {
    patch.allow_merge_commit = methods.includes('merge');
    patch.allow_squash_merge = methods.includes('squash');
    patch.allow_rebase_merge = methods.includes('rebase');
  }
  return patch;
}

export function actionsSettingsPatch(gs: GitStrategy): { can_approve_pull_request_reviews: false } | null {
  return mergesOnChecks(gs) ? { can_approve_pull_request_reviews: false } : null;
}

export function actionsApprovalFinding(gs: GitStrategy, perms: ActionsWorkflowPermissions | null): Finding | null {
  if (!mergesOnChecks(gs) || perms?.can_approve_pull_request_reviews !== true) { return null; }
  return {
    severity: 'info',
    field: 'repo.actions_can_approve_pull_requests',
    declared: 'false (a workflow must never approve a pull request)',
    enforced: 'true ("Allow GitHub Actions to create and approve pull requests" is on)',
    note: 'bun run git:policy apply --yes (or setup) turns it off.',
  };
}

export function mergeMethodWidening(patch: RepoSettingsPatch, repo: RepoSettingsPatch | null): string[] {
  return REPO_MERGE_FLAGS
    .filter(k => patch[k] === true && repo?.[k] === false)
    .map(k => `repo: turns on ${k} (permits a merge method the repo currently forbids)`);
}

export function eddGateReady(found: { hasScript: boolean, hasPackageScript: boolean }): EddGate {
  const missing = [
    ...(found.hasScript ? [] : ['scripts/edd.ts']),
    ...(found.hasPackageScript ? [] : ['the `edd` script in package.json']),
  ];
  return { ready: missing.length === 0, missing };
}

export function migrationFor(gs: GitStrategy | null | undefined, gate: EddGate): Migration {
  if (!gs || !gs.strategy || gs.strategy === 'null') {
    return { action: 'setup', note: 'git_strategy is not set up, so there is no policy line to rewrite: ask your AI agent to "set up our git strategy" (git-flow-master Strategy Setup).' };
  }
  const policy = directPushPolicy(gs);
  if (policy === 'evidence') {
    return { action: 'none', note: mergeModeDeclared(gs) ? 'already on evidence' : 'already on evidence; merge_mode is not declared and reads as auto' };
  }
  const gateMissing = `the evidence gate is not in this repo yet (missing: ${gate.missing.join(', ')})`;
  if (gs.meta?.strategy_source === 'inherited' || policy === 'allowed') {
    if (!gate.ready) {
      return { action: 'blocked', note: `${policy} would move to evidence, but ${gateMissing}, so the rewrite waits until the gate exists.` };
    }
    return {
      action: 'rewrite',
      direct_push_to_protected: 'evidence',
      merge_mode: mergeMode(gs),
      note: gs.meta?.strategy_source === 'inherited'
        ? 'nobody chose the inherited policy, so it moves to the default: evidence'
        : 'allowed becomes evidence: the same push without asking, plus the pre-push evidence gate',
    };
  }
  if (policy === 'confirm') {
    return {
      action: 'offer',
      direct_push_to_protected: 'evidence',
      note: gate.ready
        ? 'confirm was chosen and stays. Offer: evidence pushes without asking once the evidence gate passes; change it by hand to accept.'
        : `confirm was chosen and stays. evidence becomes an option once the gate exists: ${gateMissing}.`,
    };
  }
  if (policy === 'forbidden') {
    return mergeModeDeclared(gs)
      ? { action: 'none', note: `forbidden stays; merge_mode is already ${mergeMode(gs)}` }
      : { action: 'offer', merge_mode: 'auto', note: 'forbidden stays (PR flow already). Offer: merge_mode auto lets GitHub merge once the required checks pass, which changes who merges; set it by hand to accept.' };
  }
  return { action: 'offer', note: `${policy} is not one of ${DIRECT_PUSH_VALUES.join(', ')}; git-policy derives a pull_request rule for it (fail closed). Fix the value by hand.` };
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isYamlContent(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && !t.startsWith('#');
}

function childBlock(lines: string[], parent: number): { start: number, end: number, indent: number } | null {
  const parentIndent = indentOf(lines[parent] ?? '');
  let indent = -1;
  let end = parent + 1;
  for (; end < lines.length; end++) {
    const line = lines[end] ?? '';
    if (!isYamlContent(line)) { continue; }
    if (indentOf(line) <= parentIndent) { break; }
    if (indent === -1) { indent = indentOf(line); }
  }
  return indent === -1 ? null : { start: parent + 1, end, indent };
}

function findKeyLine(lines: string[], block: { start: number, end: number, indent: number }, key: string): number {
  const re = new RegExp(`^ {${block.indent}}${key}:(?:\\s|$)`);
  for (let i = block.start; i < block.end; i++) {
    if (re.test(lines[i] ?? '')) { return i; }
  }
  return -1;
}

function setScalar(line: string, value: string): string {
  const cr = line.endsWith('\r') ? '\r' : '';
  const body = cr ? line.slice(0, -1) : line;
  const colon = body.indexOf(':');
  if (colon === -1) { throw new Error(`cannot read the value of: ${body.trim()}`); }
  const rest = body.slice(colon + 1);
  const hash = rest.search(/\s#/);
  const comment = hash === -1 ? '' : rest.slice(rest.slice(0, hash).trimEnd().length);
  const lead = /^\s*/.exec(rest)?.[0] || ' ';
  return `${body.slice(0, colon + 1)}${lead}${value}${comment}${cr}`;
}

export function spliceMigration(text: string, target: MigrationTarget): string {
  const lines = text.split('\n');
  const top = lines.findIndex(l => /^git_strategy:\s*(?:#.*)?\r?$/.test(l));
  if (top === -1) { throw new Error('no block-style top-level git_strategy: key'); }
  const gsBlock = childBlock(lines, top);
  const policyAt = gsBlock ? findKeyLine(lines, gsBlock, 'policy') : -1;
  const policyBlock = policyAt === -1 ? null : childBlock(lines, policyAt);
  if (!policyBlock) { throw new Error('no block-style git_strategy.policy: key'); }
  const pushAt = findKeyLine(lines, policyBlock, 'direct_push_to_protected');
  if (pushAt === -1) { throw new Error('git_strategy.policy has no direct_push_to_protected line'); }
  const modeAt = findKeyLine(lines, policyBlock, 'merge_mode');
  lines[pushAt] = setScalar(lines[pushAt] ?? '', target.direct_push_to_protected);
  if (modeAt === -1) {
    const eol = (lines[pushAt] ?? '').endsWith('\r') ? '\r' : '';
    lines.splice(pushAt + 1, 0, `${' '.repeat(policyBlock.indent)}merge_mode: ${target.merge_mode}${eol}`);
  }
  else {
    lines[modeAt] = setScalar(lines[modeAt] ?? '', target.merge_mode);
  }
  const out = lines.join('\n');

  const before = parseYaml(text) as { git_strategy: { policy: Record<string, unknown> } };
  const after = parseYaml(out) as { git_strategy?: { policy?: Record<string, unknown> } } | null;
  const policy = after?.git_strategy?.policy;
  if (!policy || policy.direct_push_to_protected !== target.direct_push_to_protected || policy?.merge_mode !== target.merge_mode) {
    throw new Error('the spliced file does not parse back to the target values');
  }
  delete before.git_strategy.policy.direct_push_to_protected;
  delete before.git_strategy.policy.merge_mode;
  delete policy.direct_push_to_protected;
  delete policy.merge_mode;
  if (!Bun.deepEquals(before, after)) { throw new Error('the splice changed more than git_strategy.policy.direct_push_to_protected / merge_mode'); }
  return out;
}

function deletePath(obj: unknown, path: string[]): void {
  let node = obj as Record<string, unknown> | null | undefined;
  for (const key of path.slice(0, -1)) {
    const child = node?.[key];
    if (child === null || typeof child !== 'object') { return; }
    node = child as Record<string, unknown>;
  }
  if (node && typeof node === 'object') { delete node[path[path.length - 1] ?? '']; }
}

function readPath(obj: unknown, path: string[]): unknown {
  let node = obj;
  for (const key of path) {
    if (node === null || typeof node !== 'object') { return undefined; }
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

export function spliceKeys(text: string, edits: YamlEdit[]): string {
  const lines = text.split('\n');
  for (const e of edits) {
    const [top, ...rest] = e.path;
    if (!top || rest.length === 0) { throw new Error(`not a nested key: ${e.path.join('.')}`); }
    let at = lines.findIndex(l => new RegExp(`^${top}:\\s*(?:#.*)?\\r?$`).test(l));
    if (at === -1) { throw new Error(`no block-style top-level ${top}: key`); }
    let inserted = false;
    for (let i = 0; i < rest.length; i++) {
      const key = rest[i] ?? '';
      const block = childBlock(lines, at);
      if (!block) { throw new Error(`no block under ${e.path.slice(0, i + 1).join('.')}`); }
      const found = findKeyLine(lines, block, key);
      if (found !== -1) {
        at = found;
        continue;
      }
      if (i < rest.length - 1) { throw new Error(`no block-style ${e.path.slice(0, i + 2).join('.')}: key`); }
      let end = block.end;
      while (end > block.start && !isYamlContent(lines[end - 1] ?? '')) { end--; }
      const eol = (lines[end - 1] ?? '').endsWith('\r') ? '\r' : '';
      lines.splice(end, 0, `${' '.repeat(block.indent)}${key}: ${e.value}${eol}`);
      inserted = true;
    }
    if (!inserted) {
      if (childBlock(lines, at) !== null) { throw new Error(`${e.path.join('.')} is a block, not a scalar line`); }
      lines[at] = setScalar(lines[at] ?? '', e.value);
    }
  }
  const out = lines.join('\n');

  const before = parseYaml(text) as unknown;
  const after = parseYaml(out) as unknown;
  for (const e of edits) {
    const want = (parseYaml(`v: ${e.value}`) as { v: unknown }).v;
    if (!Bun.deepEquals(readPath(after, e.path), want)) {
      throw new Error(`the spliced file does not parse back to ${e.path.join('.')}: ${e.value}`);
    }
    deletePath(before, e.path);
    deletePath(after, e.path);
  }
  if (!Bun.deepEquals(before, after)) { throw new Error('the splice changed more than the keys it was given'); }
  return out;
}

/** Fields formally accepted as divergent in `policy.accepted_divergences`. */
export function acceptedFields(gs: GitStrategy): string[] {
  return (gs.policy?.accepted_divergences ?? [])
    .map(d => d?.field)
    .filter((f): f is string => typeof f === 'string' && f.length > 0);
}

export function buildRules(
  gs: GitStrategy,
  codeowners: boolean,
  current: Rule[] = [],
  contexts: string[] = [EDD_CHECK],
  integrationId: number | null = null,
): Rule[] {
  const rules: Rule[] = [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    { type: 'creation' },
  ];

  // An accepted divergence on direct_push_to_protected means "the host's side of
  // this field is intended". Deriving our own pull_request rule (or omitting it)
  // would overwrite exactly what was accepted — carry the host's rule forward as-is,
  // except the approvals, which a declared auto or human-approves merge_mode owns.
  const acceptedDirectPush = acceptedFields(gs).some(f => f.endsWith('.direct_push_to_protected'));
  if (acceptedDirectPush) {
    const hostPr = current.find(r => r.type === 'pull_request');
    if (hostPr) {
      rules.push(mergeModeDeclared(gs) && mergesOnChecks(gs)
        ? { ...hostPr, parameters: { ...(hostPr.parameters ?? {}), ...pullRequestModeParams(gs) } }
        : hostPr);
    }
  }
  else if (!directPushOpen(directPushPolicy(gs))) {
    const currentPr = current.find(r => r.type === 'pull_request');
    const currentMethods = (currentPr?.parameters as Partial<PullRequestParams> | undefined)?.allowed_merge_methods;
    const mode = pullRequestModeParams(gs);
    const params: PullRequestParams = {
      required_approving_review_count: mode.required_approving_review_count,
      // Derived, never declared: the flag without the file is unsatisfiable.
      require_code_owner_review: codeowners,
      required_review_thread_resolution: true,
      dismiss_stale_reviews_on_push: true,
      require_last_push_approval: mode.require_last_push_approval,
      // `feature_merge: n/a` means the project made no decision here, so the
      // host's existing setting is the only real answer — overwriting it with
      // "all three" would WIDEN what the repo permits on the strength of a
      // non-decision.
      allowed_merge_methods: allowedMergeMethods(gs) ?? currentMethods ?? ['merge', 'squash', 'rebase'],
    };
    rules.push({ type: 'pull_request', parameters: params as unknown as Record<string, unknown> });
  }

  const hostChecksRule = current.find(r => r.type === 'required_status_checks');
  if (statusChecksManaged(gs)) {
    const hostChecks = statusChecksOf(hostChecksRule ? [hostChecksRule] : []);
    const wanted = [...new Set(contexts)];
    const managed = wanted.map((context) => {
      const hostId = hostChecks.find(c => c.context === context)?.integration_id;
      const id = typeof hostId === 'number' ? hostId : integrationId;
      return id === null ? { context } : { context, integration_id: id };
    });
    const hostParams = hostChecksRule?.parameters ?? {};
    rules.push({
      type: 'required_status_checks',
      parameters: {
        ...hostParams,
        strict_required_status_checks_policy: hostParams.strict_required_status_checks_policy ?? false,
        required_status_checks: [...hostChecks.filter(c => !wanted.includes(c.context)), ...managed],
      },
    });
  }
  else if (hostChecksRule) {
    rules.push(hostChecksRule);
  }

  // Carry forward every rule this tool does not model (required_signatures,
  // required_linear_history, ...). They are not derivable from `git_strategy`,
  // and dropping a guard because the tool has no opinion about it is exactly
  // the silent loosening this design refuses to perform.
  for (const r of current) {
    if (!MANAGED_RULE_TYPES.has(r.type)) { rules.push(r); }
  }

  return rules;
}

export function rulesetBody(gs: GitStrategy, branches: string[], rules: Rule[], existing: boolean): Record<string, unknown> {
  return {
    name: RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: branches.map(b => `refs/heads/${b}`), exclude: [] } },
    rules,
    // bypass_actors is intentionally omitted on PATCH so the host keeps whatever
    // is configured. On CREATE, seed org-admin bypass only when policy asks for it.
    ...(existing ? {} : { bypass_actors: gs.policy?.admin_bypass ? [{ actor_type: 'OrganizationAdmin', bypass_mode: 'always' }] : [] }),
  };
}

export function describeRules(rules: Rule[]): string[] {
  return rules.map((r) => {
    if (r.type === 'pull_request') {
      const p = r.parameters as unknown as PullRequestParams;
      return `pull_request  reviews=${p.required_approving_review_count} codeowner=${p.require_code_owner_review} methods=[${p.allowed_merge_methods.join(', ')}]`;
    }
    if (r.type === 'required_status_checks') {
      const checks = statusChecksOf([r]).map(c => c.integration_id === undefined ? c.context : `${c.context}@${c.integration_id}`);
      return `required_status_checks  contexts=[${checks.join(', ')}] strict=${String(r.parameters?.strict_required_status_checks_policy)}`;
    }
    return r.type;
  });
}

// ---------------------------------------------------------------------------
// bypass visibility
// ---------------------------------------------------------------------------

/**
 * Is the ruleset's bypass list readable by the account that asked?
 *
 * GitHub serves `bypass_actors` only to a caller with admin rights on the
 * repository. Everyone else receives the SAME, unchanged ruleset with the key
 * omitted and `current_user_can_bypass: "never"`. Coercing that to `[]` turns
 * "you may not look" into "there is nothing there", and on any machine holding
 * two GitHub accounts it reports a bypass list nobody touched as overnight host
 * drift — exit 1, blocking `repo:check` and the pre-push hook.
 *
 * A PRIVILEGED caller on a ruleset with no bypass actors gets `[]`: a present,
 * empty array. So the discriminator is the SHAPE of the field, never its length.
 * `current_user_can_bypass` is reported verbatim as corroboration rather than
 * branched on, because its enum is GitHub's to extend, not ours to assume.
 */
export function assessBypass(detail: RulesetDetail | null): BypassAssessment {
  const canBypass = typeof detail?.current_user_can_bypass === 'string' ? detail.current_user_can_bypass : null;
  if (detail === null) {
    return {
      known: false,
      reason: 'the ruleset detail could not be read (403, 404, or no network)',
      currentUserCanBypass: null,
    };
  }
  const actors = detail.bypass_actors;
  if (!Array.isArray(actors)) {
    return {
      known: false,
      reason: canBypass === null
        ? 'GitHub omitted `bypass_actors` from the response'
        : `GitHub omitted \`bypass_actors\` — this account is not an admin of the repository (current_user_can_bypass: ${canBypass})`,
      currentUserCanBypass: canBypass,
    };
  }
  return {
    known: true,
    actors,
    hasAdminBypass: actors.some(a => a?.actor_type === 'OrganizationAdmin' || a?.actor_type === 'RepositoryRole'),
  };
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

interface HostReading {
  branch: string
  rulesetRules: Rule[]
  classicStatus: 'configured' | 'not-configured' | 'forbidden'
}

/**
 * Move every drift whose field is listed in `policy.accepted_divergences` to
 * `accepted`, and append an `info` finding for each STALE entry (one that no
 * longer matches any drift) so the list cannot silently accumulate dead
 * exceptions. Mutates `findings`; returns the accepted entries keyed by field.
 */
export function classifyAccepted(findings: Finding[], accepted: AcceptedDivergence[]): Map<string, AcceptedDivergence> {
  const acceptedByField = new Map(accepted.filter(a => a?.field).map(a => [a.field, a]));
  for (const f of findings) {
    if (f.severity === 'drift' && acceptedByField.has(f.field)) { f.severity = 'accepted'; }
  }
  const matched = new Set(findings.filter(f => f.severity === 'accepted').map(f => f.field));
  // A field whose host side could not be READ cannot prove its acceptance stale.
  const undeterminable = new Set(findings.filter(f => f.unknown === true).map(f => f.field));
  for (const a of acceptedByField.keys()) {
    if (!matched.has(a) && !undeterminable.has(a)) {
      findings.push({
        severity: 'info',
        field: a,
        declared: 'accepted divergence (policy.accepted_divergences)',
        enforced: 'no matching drift — STALE entry, remove it from the yaml',
      });
    }
  }
  return acceptedByField;
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
  const repo = gh(`repos/${slug}`) as RepoSettingsPatch | null;
  if (repo === null) {
    log.warn(`Cannot reach ${slug} via \`gh api\` (no gh binary, no auth, or no network).`);
    log.dim('Parity NOT verified — skipping. Run `bun run git:policy verify` from a connected, authenticated shell.');
    return 0;
  }

  const branches = protectedBranches(gs);
  const codeowners = hasCodeowners();
  const findings: Finding[] = [];
  const accepted = gs.policy?.accepted_divergences ?? [];
  const declaredPush = directPushPolicy(gs);
  const pushOpen = directPushOpen(declaredPush);
  const checksManaged = statusChecksManaged(gs);
  const onChecks = mergesOnChecks(gs);
  const modeParams = pullRequestModeParams(gs);
  const reviewsFollowMode = mergeModeDeclared(gs) && onChecks;
  const contexts = requiredCheckContexts(readEvidence());
  const pushModeFinding = (field: string, declared: string[], enforced: string[], unknown: string[]): void => {
    if (declared.length > 0) {
      findings.push({ severity: 'drift', field, declared: declared.join(', '), enforced: enforced.join(', ') });
    }
    else if (unknown.length > 0) {
      findings.push({ severity: 'info', unknown: true, field, declared: 'merge_mode settings', enforced: `UNKNOWN — not served to this account: ${unknown.join(', ')}` });
    }
  };

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
    const enforcedBlocked = pr !== undefined;
    if (pushOpen && enforcedBlocked) {
      findings.push({
        severity: 'drift',
        field: `${branch}.direct_push_to_protected`,
        declared: declaredPush,
        enforced: 'blocked (a pull_request rule covers this branch)',
        note: 'Bypass actors still get through; everyone else does not.',
      });
    }
    if (!pushOpen && !enforcedBlocked) {
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
    if (!reviewsFollowMode && declaredReviews !== null && declaredReviews !== undefined && enforcedReviews !== null && declaredReviews !== enforcedReviews) {
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

    const modeDeclared: string[] = [];
    const modeEnforced: string[] = [];
    const modeUnknown: string[] = [];
    if (checksManaged) {
      if (typeof repo.allow_auto_merge !== 'boolean') { modeUnknown.push('allow_auto_merge'); }
      else if (!repo.allow_auto_merge) {
        modeDeclared.push('allow_auto_merge true');
        modeEnforced.push('allow_auto_merge false');
      }
    }
    if (pr && onChecks) {
      const gotApprovals = p.required_approving_review_count ?? 0;
      if (gotApprovals !== modeParams.required_approving_review_count) {
        modeDeclared.push(`approvals ${modeParams.required_approving_review_count}`);
        modeEnforced.push(`approvals ${gotApprovals}`);
      }
      const gotLastPush = p.require_last_push_approval === true;
      if (gotLastPush !== modeParams.require_last_push_approval) {
        modeDeclared.push(`require_last_push_approval ${modeParams.require_last_push_approval}`);
        modeEnforced.push(`require_last_push_approval ${gotLastPush}`);
      }
    }
    pushModeFinding(`${branch}.merge_mode`, modeDeclared.length > 0 ? [...modeDeclared, `(merge_mode: ${mergeMode(gs)})`] : [], modeEnforced, modeUnknown);

    if (checksManaged) {
      const hostChecks = statusChecksOf(host.rulesetRules);
      const missing = contexts.filter(c => !hostChecks.some(h => h.context === c));
      const eddBound = hostChecks.some(h => h.context === EDD_CHECK && typeof h.integration_id === 'number');
      if (missing.length > 0 || !eddBound) {
        const enforced: string[] = [hostChecks.length === 0
          ? 'no required status checks'
          : `required: ${hostChecks.map(h => typeof h.integration_id === 'number' ? `${h.context} (integration_id ${h.integration_id})` : h.context).join(', ')}`];
        if (missing.length > 0) { enforced.push(`missing: ${missing.join(', ')}`); }
        if (!eddBound && !missing.includes(EDD_CHECK)) { enforced.push(`${EDD_CHECK} has no integration_id`); }
        findings.push({
          severity: 'drift',
          field: `${branch}.required_checks`,
          declared: `required: ${contexts.join(', ')}; ${EDD_CHECK} with an integration_id`,
          enforced: enforced.join('; '),
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

  const wantRepoMethods = allowedMergeMethods(gs);
  if (wantRepoMethods) {
    const flags = [['merge', 'allow_merge_commit'], ['squash', 'allow_squash_merge'], ['rebase', 'allow_rebase_merge']] as const;
    const wrong = flags.filter(([m, k]) => typeof repo[k] === 'boolean' && repo[k] !== wantRepoMethods.includes(m));
    pushModeFinding(
      'repo.allowed_merge_methods',
      wrong.length > 0 ? flags.map(([m, k]) => `${k} ${wantRepoMethods.includes(m)}`).concat(`(from feature_merge: ${gs.decisions.feature_merge})`) : [],
      flags.map(([, k]) => `${k} ${typeof repo[k] === 'boolean' ? String(repo[k]) : 'UNKNOWN'}`),
      flags.filter(([, k]) => typeof repo[k] !== 'boolean').map(([, k]) => k),
    );
  }

  // --- admin bypass ---
  const rs = (gh(`repos/${slug}/rulesets`) as { id: number, name: string }[] | null) ?? [];
  const target = rs.find(r => r.name === RULESET_NAME) ?? rs[0];
  if (target) {
    const detail = gh(`repos/${slug}/rulesets/${target.id}`) as RulesetDetail | null;
    const bypass = assessBypass(detail);
    const declaredBypass = gs.policy?.admin_bypass === true;
    console.log(pc.bold(`Ruleset ${target.name} (id ${target.id})`));
    if (bypass.known) {
      console.log(`  bypass_actors: ${bypass.actors.length === 0 ? 'none' : bypass.actors.map(a => `${a.actor_type}/${a.bypass_mode}`).join(', ')}`);
      if (declaredBypass !== bypass.hasAdminBypass) {
        findings.push({
          severity: 'drift',
          field: 'admin_bypass',
          declared: String(declaredBypass),
          enforced: String(bypass.hasAdminBypass),
        });
      }
    }
    else {
      // The ruleset did not change; the READER did. Report who is asking and
      // how to ask as someone who can see the answer — then get out of the way.
      const who = activeGitHubAccount();
      console.log(`  bypass_actors: ${pc.yellow('UNKNOWN')} — ${bypass.reason}`);
      console.log(pc.dim(`  active gh account: ${who ?? 'could not be resolved'}`));
      console.log(pc.dim('  To read it: `gh auth switch --user <repo-admin>` (or `gh auth login`), then re-run verify.'));
      findings.push({
        severity: 'info',
        unknown: true,
        field: 'admin_bypass',
        declared: String(declaredBypass),
        enforced: `UNKNOWN — ${bypass.reason}`,
        note: `Active gh account: ${who ?? 'unresolved'}. Not counted as drift: absence of data is not data.`,
      });
    }
    console.log('');
  }

  // --- the Actions approval switch, reported from the EDD rollout on (corrections 17) ---
  const actionsFinding = actionsApprovalFinding(gs, gh(`repos/${slug}/actions/permissions/workflow`) as ActionsWorkflowPermissions | null);
  if (actionsFinding) { findings.push(actionsFinding); }

  // --- accepted divergences: declared drift the project has formally signed off ---
  const acceptedByField = classifyAccepted(findings, accepted);
  softenUndeclared(gs, findings);

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
    for (const f of infos) {
      console.log(`  ${pc.yellow('▲')} ${f.field}: ${f.enforced}`);
      if (f.note) { console.log(pc.dim(`      ${f.note}`)); }
    }
  }

  console.log('');
  if (drifts.length > 0 && verifyExitCode(drifts.length, gs.meta?.strategy_source) === 0) {
    log.warn('Declared policy does not match the host, and nobody has chosen it yet (git_strategy.meta.strategy_source: inherited).');
    log.dim('These are warnings until the strategy is chosen: ask your AI agent to "set up our git strategy" (git-flow-master Strategy Setup).');
    log.dim('From then on verify blocks on drift.');
    return 0;
  }
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
export function detectLoosening(current: Rule[], next: Rule[], slug: string, branch: string): string[] {
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
    if (c.require_last_push_approval && !n.require_last_push_approval) {
      out.push(`${branch}: turns off require_last_push_approval`);
    }
    const cm = c.allowed_merge_methods ?? [];
    const nm = n.allowed_merge_methods ?? [];
    const widened = nm.filter(m => cm.length > 0 && !cm.includes(m));
    if (widened.length > 0) {
      out.push(`${branch}: permits merge method(s) the host currently forbids: ${widened.join(', ')}`);
    }
  }
  const curHasChecks = current.some(r => r.type === 'required_status_checks');
  const nextHasChecks = next.some(r => r.type === 'required_status_checks');
  if (curHasChecks && !nextHasChecks) {
    out.push(`${branch}: removes the required_status_checks rule (merges stop waiting on any check)`);
  }
  if (curHasChecks && nextHasChecks) {
    const nextContexts = new Set(statusChecksOf(next).map(c => c.context));
    const dropped = [...new Set(statusChecksOf(current).map(c => c.context))].filter(c => !nextContexts.has(c));
    if (dropped.length > 0) { out.push(`${branch}: stops requiring status check(s): ${dropped.join(', ')}`); }
    const strict = (rules: Rule[]): boolean => rules.some(r => r.type === 'required_status_checks' && r.parameters?.strict_required_status_checks_policy === true);
    if (strict(current) && !strict(next)) { out.push(`${branch}: turns off strict_required_status_checks_policy`); }
  }
  void slug;
  return out;
}

function apply(gs: GitStrategy, slug: string, write: boolean, allowLoosening: boolean): number {
  // Unlike verify, an unreachable host here is FATAL: apply derives its payload
  // from the host's current rules, and an empty reading would masquerade as
  // "no ruleset exists" and produce a CREATE payload that drops every host rule.
  const repo = gh(`repos/${slug}`) as RepoSettingsPatch | null;
  if (repo === null) {
    log.err(`Cannot reach ${slug} via \`gh api\` (no gh binary, no auth, or no network). Refusing to derive a ruleset from an empty host reading.`);
    return 1;
  }

  const eff = effectiveForApply(gs);
  if (eff !== gs) {
    log.info('merge_mode is not declared, so apply derives as manual: no auto-merge, no managed required checks, approvals from require_pr_reviews. To opt in, declare git_strategy.policy.merge_mode.');
  }

  const contexts = requiredCheckContexts(readEvidence());
  let integrationId: number | null = null;
  if (statusChecksManaged(eff)) {
    const ref = gs.branches?.production ?? 'main';
    const checkRuns = gh(`repos/${slug}/commits/${ref}/check-runs?per_page=100`);
    integrationId = resolveIntegrationId(checkRuns);
    if (integrationId === null) {
      log.err(`No GitHub Actions check run exists yet on ${ref} to read the GitHub Actions app id (integration_id) from. Run any GitHub Actions workflow on ${ref} once, then re-run apply.`);
      return 1;
    }
    const needPr = contexts.includes(EDD_CHECK) && missingCheckRuns([EDD_CHECK], checkRuns).length > 0;
    const missing = missingRequiredChecks(contexts, checkRuns, needPr ? prHeadCheckRuns(p => gh(p), slug, ref) : null);
    if (missing.tip.length > 0) {
      log.err(`No check run on ${ref} has the name of these required contexts: ${missing.tip.join(', ')}. A required check that never reports blocks every merge. Run the CI jobs with those names on ${ref} (or fix the ids in evidence.static), then re-run apply.`);
      return 1;
    }
    if (missing.pr.length > 0) {
      log.err(firstPullRequestNeeded(ref));
      return 1;
    }
  }

  const branches = protectedBranches(gs);
  const codeowners = hasCodeowners();

  const rs = (gh(`repos/${slug}/rulesets`) as { id: number, name: string }[] | null) ?? [];
  const existing = rs.find(r => r.name === RULESET_NAME) ?? null;

  // Seed from whatever the ruleset already holds so unmanaged rules survive.
  const currentRuleset = existing
    ? (gh(`repos/${slug}/rulesets/${existing.id}`) as { rules?: Rule[] } | null)
    : null;
  const nextRules = buildRules(eff, codeowners, currentRuleset?.rules ?? [], contexts, integrationId);
  const repoPatch = repoSettingsPatch(eff, nextRules);

  console.log(pc.bold('\nGit Policy Apply'));
  console.log('='.repeat(50));
  console.log(`Repository:  ${slug}`);
  console.log(`Strategy:    ${gs.strategy}`);
  console.log(`Ruleset:     ${existing ? `${RULESET_NAME} (id ${existing.id}) — UPDATE` : `${RULESET_NAME} — CREATE`}`);
  console.log(`Branches:    ${branches.join(', ')}`);
  console.log(`CODEOWNERS:  ${codeowners ? 'present -> require_code_owner_review: true' : 'absent -> require_code_owner_review: false'}`);
  console.log('');
  console.log(pc.bold('Rules to write:'));
  for (const line of describeRules(nextRules)) { console.log(`  ${line}`); }
  console.log('');
  console.log(pc.bold('Repo settings patch:'));
  console.log(Object.keys(repoPatch).length === 0 ? '  <none>' : `  ${JSON.stringify(repoPatch)}`);
  console.log('');
  const actionsPatch = actionsSettingsPatch(eff);
  const actionsHost = actionsPatch ? gh(`repos/${slug}/actions/permissions/workflow`) as ActionsWorkflowPermissions | null : null;
  const actionsWrite = actionsPatch !== null && actionsHost?.can_approve_pull_request_reviews === true;
  console.log(pc.bold('Actions settings patch:'));
  if (!actionsPatch) { console.log('  <none>'); }
  else if (actionsHost === null) { console.log('  UNKNOWN — actions/permissions/workflow is not readable by this account; not written'); }
  else { console.log(actionsWrite ? `  ${JSON.stringify(actionsPatch)}` : '  <none> (can_approve_pull_request_reviews is already false)'); }
  console.log('');

  // Loosening check against every branch currently covered.
  const loosenings: string[] = [];
  for (const b of branches) {
    const current = (gh(`repos/${slug}/rules/branches/${b}`) as Rule[] | null) ?? [];
    loosenings.push(...detectLoosening(current, nextRules, slug, b));
  }
  loosenings.push(...mergeMethodWidening(repoPatch, repo));

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

  const body = rulesetBody(gs, branches, nextRules, existing !== null);

  if (!write) {
    console.log(pc.bold('Payload (dry run — nothing sent):'));
    console.log(JSON.stringify(body, null, 2));
    console.log('');
    log.info('Dry run. Re-run with --yes to write it.');
    return 0;
  }

  const tmp = join(tmpdir(), `git-policy-${process.pid}.json`);
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
  if (Object.keys(repoPatch).length > 0) {
    const repoTmp = join(tmpdir(), `git-policy-repo-${process.pid}.json`);
    writeFileSync(repoTmp, JSON.stringify(repoPatch));
    const rp = Bun.spawnSync(['gh', 'api', '-X', 'PATCH', `repos/${slug}`, '--input', repoTmp], { stdout: 'pipe', stderr: 'pipe' });
    if (rp.exitCode !== 0) {
      log.err(`PATCH repos/${slug} failed:`);
      console.log(rp.stderr.toString().trim());
      return 1;
    }
    log.ok(`PATCH repos/${slug} succeeded.`);
  }
  if (actionsWrite) {
    const actionsTmp = join(tmpdir(), `git-policy-actions-${process.pid}.json`);
    const payload = {
      ...(typeof actionsHost?.default_workflow_permissions === 'string' ? { default_workflow_permissions: actionsHost.default_workflow_permissions } : {}),
      ...actionsPatch,
    };
    writeFileSync(actionsTmp, JSON.stringify(payload));
    const ap = Bun.spawnSync(['gh', 'api', '-X', 'PUT', `repos/${slug}/actions/permissions/workflow`, '--input', actionsTmp], { stdout: 'pipe', stderr: 'pipe' });
    if (ap.exitCode !== 0) {
      log.err(`PUT repos/${slug}/actions/permissions/workflow failed (a 409 means the organization locks this setting):`);
      console.log(ap.stderr.toString().trim());
      return 1;
    }
    log.ok(`PUT repos/${slug}/actions/permissions/workflow succeeded.`);
  }
  log.dim('Re-run `bun run git:policy verify --stamp` to record the reconciliation.');
  return 0;
}

function verifyMerge(base: string): number {
  const url = originUrl();
  const slug = url === null ? null : slugFromRemote(url);
  if (slug === null) {
    log.err(url === null ? 'No `origin` remote: no host to prove the merge guard against.' : `origin is not a GitHub remote (${url}): no host to prove the merge guard against.`);
    return 1;
  }
  const guard = mergeGuard(gh(`repos/${slug}/rules/branches/${base}`));
  if (guard.ok) {
    log.ok(`${base}: ${guard.reason}`);
    return 0;
  }
  log.err(`${base}: ${guard.reason}`);
  return 1;
}

export function lineDiff(before: string, after: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    }
    else if (j + 1 < b.length && b[j + 1] === a[i]) {
      out.push(pc.green(`+ ${b[j]}`));
      j++;
    }
    else {
      if (i < a.length) { out.push(pc.red(`- ${a[i]}`)); }
      if (j < b.length) { out.push(pc.green(`+ ${b[j]}`)); }
      i++;
      j++;
    }
  }
  return out;
}

function gateHere(): EddGate {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> } | null;
  return eddGateReady({
    hasScript: existsSync(join(REPO_ROOT, 'scripts', 'edd.ts')),
    hasPackageScript: pkg?.scripts !== null && typeof pkg?.scripts === 'object' && 'edd' in pkg.scripts,
  });
}

function ghScopes(): string[] | null {
  try {
    const p = Bun.spawnSync(['gh', 'api', '-i', 'user'], { stdout: 'pipe', stderr: 'pipe' });
    if (p.exitCode !== 0) { return null; }
    const m = /^x-oauth-scopes:(.*)$/im.exec(p.stdout.toString());
    return m ? (m[1] ?? '').split(',').map(s => s.trim()).filter(Boolean) : null;
  }
  catch { return null; }
}

function setupDeps(slug: string | null): SetupDeps {
  const codeownersPath = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'].map(p => join(REPO_ROOT, p)).find(p => existsSync(p)) ?? null;
  return {
    interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    lang: pickLang(process.env),
    ask: promptAsk,
    print: line => console.log(line),
    readProject: () => (existsSync(PROJECT_YAML) ? readFileSync(PROJECT_YAML, 'utf8') : null),
    writeProject: (text) => { writeFileSync(PROJECT_YAML, text); },
    slug,
    gh: path => gh(path),
    scopes: ghScopes,
    gateReady: gateHere().ready,
    codeowners: () => (codeownersPath === null ? null : readFileSync(codeownersPath, 'utf8')),
    writeCodeowners: (text) => {
      mkdirSync(join(REPO_ROOT, '.github'), { recursive: true });
      writeFileSync(join(REPO_ROOT, '.github', 'CODEOWNERS'), text);
    },
    applyHost: write => (slug === null ? 1 : apply(readStrategy(), slug, write, false)),
  };
}

function migrate(write: boolean): number {
  if (!existsSync(PROJECT_YAML)) { fail(`.agents/project.yaml not found at ${PROJECT_YAML}`); }
  const text = readFileSync(PROJECT_YAML, 'utf8');
  const doc = parseYaml(text) as Record<string, unknown> | null;
  const gs = (doc?.git_strategy ?? null) as GitStrategy | null;
  const verdict = migrationFor(gs, gateHere());

  console.log(pc.bold('\nGit Policy Migrate'));
  console.log('='.repeat(50));
  if (gs) {
    console.log(`Current:  direct_push_to_protected: ${gs.policy?.direct_push_to_protected ?? 'unset (reads as evidence)'}, merge_mode: ${gs.policy?.merge_mode ?? 'unset (reads as auto)'}`);
  }
  console.log(`Verdict:  ${verdict.action}`);
  log.dim(verdict.note);
  if (verdict.action === 'setup') { return 1; }
  if (verdict.action === 'blocked') {
    if (!write) { return 0; }
    log.err('Nothing written: the policy moves to evidence only once the evidence gate exists.');
    return 1;
  }
  if (verdict.action !== 'rewrite') {
    if (write) { log.info('Nothing written: only a rewrite verdict changes the file.'); }
    return 0;
  }

  let next: string;
  try { next = spliceMigration(text, verdict); }
  catch (e) {
    log.err(`Cannot rewrite git_strategy.policy in place: ${(e as Error).message}`);
    return 1;
  }
  console.log('');
  console.log(pc.bold('Diff:'));
  for (const l of lineDiff(text, next)) { console.log(`  ${l}`); }
  console.log('');
  if (!write) {
    log.info('Dry run. Re-run with --yes to write it.');
    return 0;
  }
  writeFileSync(PROJECT_YAML, next);
  const reread = (parseYaml(readFileSync(PROJECT_YAML, 'utf8')) as { git_strategy?: GitStrategy } | null)?.git_strategy;
  if (reread?.policy?.direct_push_to_protected !== verdict.direct_push_to_protected || reread?.policy?.merge_mode !== verdict.merge_mode) {
    log.err('Wrote .agents/project.yaml but it does not read back with the new values.');
    return 1;
  }
  log.ok(`git_strategy.policy now reads direct_push_to_protected: ${verdict.direct_push_to_protected}, merge_mode: ${verdict.merge_mode}`);
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
                      merge_mode / required_checks / repo.allowed_merge_methods
                      findings are warnings until git_strategy.policy.merge_mode
                      is declared, and direct_push_to_protected findings until
                      that key is declared.
  verify --merge <b>  Exit 0 only when edd/evidence is a required check with an
                      integration_id on base <b>. Unreadable host, no origin or a
                      non-GitHub origin = exit 1 (it guards gh pr merge --auto).
  apply               Write the ruleset and repo merge settings git_strategy and
                      the evidence: contract imply. Dry-run unless --yes.
                      An accepted direct_push_to_protected divergence keeps the
                      host's pull_request rule as it is. While merge_mode is
                      undeclared it derives as manual. Refuses when no Actions
                      check run exists to read the integration_id from, or when
                      a required context has no check run on the production
                      branch.
  plan                Print the implied ruleset, repo and Actions settings. No host calls.
  setup               Ask the branching strategy, who confirms a push and how a PR
                      is merged (Enter keeps each default), write those keys to
                      .agents/project.yaml, print the plan and a read-only
                      preflight. An admin then sees the apply dry run and is asked
                      before anything is written to GitHub (default no); anyone
                      else gets a hand-off for an admin. Never loosens, never
                      widens bypass actors.
  migrate             Print the migration verdict for git_strategy.policy and the
                      diff it would make. Dry-run unless --yes. A rewrite to
                      evidence is blocked until scripts/edd.ts and the edd
                      package.json script exist.

FLAGS
  --stamp             (verify) write meta.policy_verified / policy_source when in parity
  --merge <base>      (verify) check only the auto-merge guard on <base>
  --yes               (apply, migrate) actually write; without it, a dry run
  --allow-loosening   (apply) permit a change that removes a guard or lowers the review bar
  --strategy <slug>   (setup) answer the strategy question
  --push <value>      (setup) answer the push question: forbidden | confirm | allowed | evidence
  --merge <mode>      (setup) answer the merge question: auto | human-approves | manual
  --codeowner <who>   (setup) CODEOWNERS owner of the gate paths under human-approves
  --feature-merge <m> (setup) merge method: merge-commit (default while undecided) | squash | rebase-merge
  --plan-only         (setup) plan and preflight only: no GitHub write can happen
  --write-policy      (setup) write the answers to .agents/project.yaml without asking
  --questions-json    (setup) print the three questions with their defaults as JSON, and exit
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
  if (cmd === 'verify' && argv.includes('--merge')) {
    const base = argv[argv.indexOf('--merge') + 1];
    if (!base || base.startsWith('--')) { fail('verify --merge needs a base branch: bun run git:policy verify --merge <base>'); }
    process.exit(verifyMerge(base));
  }
  if (cmd === 'migrate') {
    process.exit(migrate(argv.includes('--yes')));
  }
  if (cmd === 'setup') {
    const flags = parseSetupFlags(argv.slice(1));
    if ('error' in flags) { fail(flags.error); }
    const url = originUrl();
    void runSetup(setupDeps(url === null ? null : slugFromRemote(url)), flags).then(code => process.exit(code));
    return;
  }
  let gs: GitStrategy;
  if (cmd === 'verify') {
    const read = strategyForVerify(existsSync(PROJECT_YAML) ? parseYaml(readFileSync(PROJECT_YAML, 'utf8')) : null);
    if (read.missingBlock) {
      log.warn('No `git_strategy:` block in .agents/project.yaml: verify reads it as an inherited `evidence` policy on main (Critical Rule #5), so drift only warns. Run the git-flow-master Strategy Setup to declare one.');
    }
    gs = read.gs ?? readStrategy();
  }
  else { gs = readStrategy(); }

  switch (cmd) {
    case 'verify': {
      // No host to read is not drift, exactly like an unreachable one: a project
      // with no origin yet, or a remote that is not GitHub, must still push.
      const url = originUrl();
      const slug = url === null ? null : slugFromRemote(url);
      if (slug === null) {
        log.warn(url === null ? 'No `origin` remote yet: no host to compare the policy against.' : `origin is not a GitHub remote (${url}): no host rules to compare against.`);
        log.dim('Parity NOT verified — skipping.');
        process.exit(0);
      }
      process.exit(verify(gs, slug, argv.includes('--stamp')));
      break;
    }
    case 'apply':
      process.exit(apply(gs, readSlug(), argv.includes('--yes'), argv.includes('--allow-loosening')));
      break;
    case 'plan': {
      // `plan` makes no host calls, so it cannot know which unmanaged rules
      // exist; it shows only what the strategy itself implies.
      const eff = effectiveForApply(gs);
      const rules = buildRules(eff, hasCodeowners(), [], requiredCheckContexts(readEvidence()), null);
      console.log(JSON.stringify({
        strategy: gs.strategy,
        branches: protectedBranches(gs),
        codeowners: hasCodeowners(),
        policy: { direct_push_to_protected: directPushPolicy(gs), merge_mode: mergeMode(eff) },
        rules,
        repo_settings: repoSettingsPatch(eff, rules),
        actions_settings: actionsSettingsPatch(eff) ?? {},
        integration_id: 'resolved by apply from the latest edd/evidence check run',
      }, null, 2));
      process.exit(0);
      break;
    }
    default:
      fail(`Unknown command: ${cmd}. Use --help.`);
  }
}

// Guarded so the pure helpers above can be imported by a test without running
// the CLI. Same convention as scripts/tests-map.ts and scripts/sync-jira-issues.ts.
if (import.meta.main) {
  main();
}
