import type { ActionsWorkflowPermissions, GitStrategy, Rule, YamlEdit } from '../git-policy.ts';

import process from 'node:process';

import * as clack from '@clack/prompts';
import { parse as parseYaml } from 'yaml';

import {
  actionsSettingsPatch,
  buildRules,
  describeRules,
  detectLoosening,
  DIRECT_PUSH_VALUES,
  directPushOpen,
  EDD_CHECK,
  effectiveForApply,
  lineDiff,
  MERGE_MODES,
  mergeMethodWidening,
  mergesOnChecks,
  missingCheckRuns,
  protectedBranches,
  repoSettingsPatch,
  requiredCheckContexts,
  resolveIntegrationId,
  RULESET_NAME,
  rulesetBody,
  spliceKeys,
  statusChecksManaged,
} from '../git-policy.ts';

export type Lang = 'es' | 'en';

export const STRATEGIES = ['solo-main', 'github-flow', 'trunk-based', 'main-integration', 'enterprise', 'gitflow', 'gitlab-flow', 'sdet'];

const INTEGRATION_DEFAULT: Record<string, string> = { 'main-integration': 'staging', 'enterprise': 'staging', 'gitflow': 'develop' };
const SDET_TRUNK = 'test/<module>-suite';

type Copy = Record<Lang, [label: string, day: string]>;

const STRATEGY_COPY: Record<string, Copy> = {
  'solo-main': {
    en: ['Only main', 'Everything lands on main. No integration branch: the simplest flow for one maintainer.'],
    es: ['Solo main', 'Todo llega a main. Sin rama de integración: el flujo más simple para una sola persona.'],
  },
  'github-flow': {
    en: ['GitHub flow', 'Every change is a short branch and a pull request into main; main can always be released.'],
    es: ['GitHub flow', 'Cada cambio es una rama corta y un pull request a main; main siempre se puede publicar.'],
  },
  'trunk-based': {
    en: ['Trunk-based', 'Very short branches merged into main several times a day.'],
    es: ['Trunk-based', 'Ramas muy cortas que se fusionan en main varias veces al día.'],
  },
  'main-integration': {
    en: ['main plus an integration branch', 'Work reaches an integration branch first (staging by default); a promotion pull request takes it to main.'],
    es: ['main más una rama de integración', 'El trabajo llega primero a una rama de integración (staging por defecto); un pull request de promoción lo lleva a main.'],
  },
  'enterprise': {
    en: ['Enterprise', 'Like main plus integration, with release branches when needed and hotfixes cut from main.'],
    es: ['Enterprise', 'Como main más integración, con ramas release cuando hacen falta y hotfixes desde main.'],
  },
  'gitflow': {
    en: ['Gitflow', 'Daily work on develop, release branches into main, then a back-merge to develop.'],
    es: ['Gitflow', 'El trabajo diario en develop, ramas release hacia main y luego un back-merge a develop.'],
  },
  'gitlab-flow': {
    en: ['GitLab flow', 'main, then pre-production, then production: each environment is a branch.'],
    es: ['GitLab flow', 'main, luego pre-production, luego production: cada entorno es una rama.'],
  },
  'sdet': {
    en: ['SDET suite trunk', 'Test work goes to a per-suite trunk (test/<module>-suite) and reaches main in one final pull request.'],
    es: ['Trunk de suite SDET', 'El trabajo de tests va a un trunk por suite (test/<module>-suite) y llega a main en un único pull request final.'],
  },
};

const PUSH_COPY: Record<string, Copy> = {
  evidence: {
    en: ['When the checks pass (evidence)', 'The agent pushes by itself only after the project\'s checks pass on your machine. When they fail nothing is pushed and it fixes them first. You are never asked.'],
    es: ['Cuando pasan los checks (evidence)', 'El agente sube los cambios solo cuando pasan los checks del proyecto en tu máquina. Si fallan, no sube nada y primero los arregla. Nunca te pregunta.'],
  },
  confirm: {
    en: ['Ask me every time (confirm)', 'The agent asks you before every push to a protected branch and waits for your yes.'],
    es: ['Preguntarme siempre (confirm)', 'El agente te pregunta antes de cada push a una rama protegida y espera tu sí.'],
  },
  allowed: {
    en: ['Push without asking (allowed)', 'The agent pushes straight away, with no question and no evidence gate. The fastest option, with no safety net.'],
    es: ['Subir sin preguntar (allowed)', 'El agente sube directo, sin preguntar y sin la puerta de evidencia. Lo más rápido, sin red de seguridad.'],
  },
  forbidden: {
    en: ['Never push directly (forbidden)', 'Nothing goes straight to a protected branch: every change travels through a pull request.'],
    es: ['Nunca directo (forbidden)', 'Nada va directo a una rama protegida: cada cambio viaja por un pull request.'],
  },
};

const MERGE_COPY: Record<string, Copy> = {
  'auto': {
    en: ['Automatic (auto-merge)', 'The agent opens the pull request and turns on auto-merge. GitHub merges it by itself once the required checks pass, edd/evidence included. Nobody approves; you read the evidence afterwards.'],
    es: ['Automático (auto-merge)', 'El agente abre el pull request y activa el auto-merge. GitHub lo fusiona solo cuando pasan los checks obligatorios, edd/evidence incluido. Nadie aprueba; tú lees la evidencia después.'],
  },
  'human-approves': {
    en: ['A person approves (human-approves)', 'Same as automatic, but GitHub also waits for a person\'s approval. The approver cannot be the pull request\'s author, so a one-person repository needs a second account.'],
    es: ['Una persona aprueba (human-approves)', 'Igual que automático, pero GitHub también espera la aprobación de una persona. Quien aprueba no puede ser el autor del pull request, así que un repositorio de una sola persona necesita una segunda cuenta.'],
  },
  'manual': {
    en: ['I merge by hand (manual)', 'The agent stops once the pull request is open. A person presses merge.'],
    es: ['Fusiono a mano (manual)', 'El agente se detiene al abrir el pull request. Una persona aprieta merge.'],
  },
};

const TITLES: Record<string, Record<Lang, string>> = {
  strategy: { en: 'Which branching strategy does this repository use?', es: 'Qué estrategia de ramas usa este repositorio?' },
  push: { en: 'Who confirms a push to a protected branch?', es: 'Quién confirma un push a una rama protegida?' },
  merge: { en: 'How is a pull request merged?', es: 'Cómo se fusiona un pull request?' },
  codeowner: { en: 'Who reviews changes to the evidence gate files (their CODEOWNERS owner)?', es: 'Quién revisa los cambios a los archivos de la puerta de evidencia (su dueño en CODEOWNERS)?' },
  write: { en: 'Write these answers to .agents/project.yaml?', es: 'Escribimos estas respuestas en .agents/project.yaml?' },
  codeownersFile: { en: 'Create .github/CODEOWNERS with the lines above?', es: 'Creamos .github/CODEOWNERS con las líneas de arriba?' },
  apply: { en: 'Write this configuration to GitHub now?', es: 'Escribimos esta configuración en GitHub ahora?' },
};

export interface Choice { value: string, label: string, day: string, rec?: boolean }

export interface SetupQuestion { id: 'strategy' | 'push' | 'merge', title: string, choices: Choice[], default: string }

export interface SetupAnswers { strategy: string, push: string, merge: string }

export type AskQuestion
  = | { kind: 'select', id: string, title: string, choices: Choice[], default: string }
    | { kind: 'confirm', id: string, title: string, default: boolean }
    | { kind: 'text', id: string, title: string, default: string };

export interface SetupFlags {
  strategy?: string
  push?: string
  merge?: string
  codeowner?: string
  planOnly: boolean
  writePolicy: boolean
  questionsJson?: boolean
}

export interface SetupDeps {
  interactive: boolean
  lang: Lang
  ask: (q: AskQuestion) => Promise<string | boolean>
  print: (line: string) => void
  readProject: () => string | null
  writeProject: (text: string) => void
  slug: string | null
  gh: (path: string) => unknown | null
  scopes: () => string[] | null
  gateReady: boolean
  codeowners: () => string | null
  writeCodeowners: (text: string) => void
  applyHost: (write: boolean) => number
}

function choices(copy: Record<string, Copy>, values: string[], lang: Lang, rec: string): Choice[] {
  return values.map((value) => {
    const [label, day] = copy[value]?.[lang] ?? [value, ''];
    return { value, label, day, ...(value === rec ? { rec: true } : {}) };
  });
}

export function pushValues(gateReady: boolean): string[] {
  return ['evidence', 'confirm', 'allowed', 'forbidden'].filter(v => gateReady || v !== 'evidence');
}

export function setupDefaults(gs: GitStrategy, gateReady: boolean): SetupAnswers {
  const chosen = gs.meta?.strategy_source === 'chosen';
  const push = gs.policy?.direct_push_to_protected;
  const merge = gs.policy?.merge_mode;
  return {
    strategy: STRATEGIES.includes(gs.strategy) ? gs.strategy : 'solo-main',
    push: chosen && typeof push === 'string' && pushValues(gateReady).includes(push) ? push : (gateReady ? 'evidence' : 'confirm'),
    merge: chosen && typeof merge === 'string' && MERGE_MODES.includes(merge) ? merge : 'auto',
  };
}

export function setupQuestions(gs: GitStrategy, lang: Lang, gateReady: boolean): SetupQuestion[] {
  const d = setupDefaults(gs, gateReady);
  return [
    { id: 'strategy', title: TITLES.strategy[lang], choices: choices(STRATEGY_COPY, STRATEGIES, lang, 'solo-main'), default: d.strategy },
    { id: 'push', title: TITLES.push[lang], choices: choices(PUSH_COPY, pushValues(gateReady), lang, gateReady ? 'evidence' : 'confirm'), default: d.push },
    { id: 'merge', title: TITLES.merge[lang], choices: choices(MERGE_COPY, MERGE_MODES, lang, 'auto'), default: d.merge },
  ];
}

export function parseSetupFlags(argv: string[]): SetupFlags | { error: string } {
  const flags: SetupFlags = { planOnly: false, writePolicy: false };
  const valued = { '--strategy': 'strategy', '--push': 'push', '--merge': 'merge', '--codeowner': 'codeowner' } as const;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--plan-only') { flags.planOnly = true; }
    else if (arg === '--write-policy') { flags.writePolicy = true; }
    else if (arg === '--questions-json') { flags.questionsJson = true; }
    else if (arg in valued) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) { return { error: `${arg} needs a value` }; }
      flags[valued[arg as keyof typeof valued]] = value;
      i++;
    }
    else { return { error: `unknown setup flag: ${arg}` }; }
  }
  if (flags.strategy !== undefined && !STRATEGIES.includes(flags.strategy)) {
    return { error: `--strategy must be one of ${STRATEGIES.join(', ')}` };
  }
  if (flags.push !== undefined && !DIRECT_PUSH_VALUES.includes(flags.push)) {
    return { error: `--push must be one of ${DIRECT_PUSH_VALUES.join(', ')}` };
  }
  if (flags.merge !== undefined && !MERGE_MODES.includes(flags.merge)) {
    return { error: `--merge must be one of ${MERGE_MODES.join(', ')}` };
  }
  if (flags.codeowner !== undefined && normalizeOwner(flags.codeowner) === null) {
    return { error: '--codeowner must be a GitHub login, @org/team or an email' };
  }
  return flags;
}

export function normalizeOwner(raw: string): string | null {
  const v = raw.trim();
  if (/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(v)) { return v; }
  const m = /^@?([A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\/[\w.-]+)?)$/i.exec(v);
  return m ? `@${m[1]}` : null;
}

export function withAnswers(gs: GitStrategy, a: SetupAnswers): GitStrategy {
  const integration = gs.branches?.integration ?? INTEGRATION_DEFAULT[a.strategy] ?? null;
  const ephemeral = gs.branches?.ephemeral_pattern ?? (a.strategy === 'sdet' ? SDET_TRUNK : null);
  const reviews = gs.policy?.require_pr_reviews ?? null;
  const next: GitStrategy = {
    ...gs,
    strategy: a.strategy,
    branches: { production: gs.branches?.production ?? 'main', integration, ephemeral_pattern: ephemeral },
    policy: {
      ...gs.policy,
      direct_push_to_protected: a.push,
      merge_mode: a.merge,
      require_pr_reviews: a.merge === 'human-approves' ? Math.max(1, reviews ?? 1) : reviews,
    },
    meta: { ...gs.meta, strategy_source: 'chosen' },
  };
  return { ...next, protected: protectedBranches(next) };
}

function sameList(a: unknown, b: string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
}

export function setupEdits(gs: GitStrategy, a: SetupAnswers): YamlEdit[] {
  const next = withAnswers(gs, a);
  const edits: YamlEdit[] = [];
  const at = (path: string[], value: string): void => { edits.push({ path: ['git_strategy', ...path], value }); };
  if (gs.strategy !== next.strategy) { at(['strategy'], next.strategy); }
  if ((gs.branches?.integration ?? null) !== next.branches.integration) { at(['branches', 'integration'], String(next.branches.integration)); }
  if ((gs.branches?.ephemeral_pattern ?? null) !== next.branches.ephemeral_pattern) { at(['branches', 'ephemeral_pattern'], JSON.stringify(next.branches.ephemeral_pattern)); }
  if (!sameList(gs.protected, next.protected)) { at(['protected'], `[${next.protected.join(', ')}]`); }
  if (gs.policy?.direct_push_to_protected !== a.push) { at(['policy', 'direct_push_to_protected'], a.push); }
  if (gs.policy?.merge_mode !== a.merge) { at(['policy', 'merge_mode'], a.merge); }
  if ((gs.policy?.require_pr_reviews ?? null) !== next.policy.require_pr_reviews) { at(['policy', 'require_pr_reviews'], String(next.policy.require_pr_reviews)); }
  if (gs.meta?.strategy_source !== 'chosen') { at(['meta', 'strategy_source'], 'chosen'); }
  return edits;
}

export function gatePaths(doc: unknown): string[] {
  const paths = (doc as { evidence?: { human?: { paths?: unknown } } } | null)?.evidence?.human?.paths;
  return Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string' && p.length > 0) : [];
}

export function codeownersLines(paths: string[], owner: string): string[] {
  return paths.map(p => `${p.startsWith('/') ? p : `/${p}`} ${owner}`);
}

export function missingCodeownersLines(existing: string | null, lines: string[]): string[] {
  const have = new Set((existing ?? '').split('\n').map(l => l.trim().split(/\s+/)[0]).filter(Boolean));
  return lines.filter(l => !have.has(l.split(' ')[0]));
}

interface RepoView {
  permissions?: { admin?: boolean, push?: boolean }
  owner?: { login?: string, type?: string }
  visibility?: string
  allow_auto_merge?: boolean
  allow_merge_commit?: boolean
  allow_squash_merge?: boolean
  allow_rebase_merge?: boolean
}

export interface HostState {
  repo: RepoView | null
  login: string | null
  scopes: string[] | null
  checkRuns: unknown | null
  actions: ActionsWorkflowPermissions | null
  orgActionsReadable: boolean | null
  rulesetId: number | null
  rulesetRules: Rule[]
  branchRules: Record<string, Rule[]>
  orgRulesets?: number
}

export interface Preflight {
  reachable: boolean
  admin: boolean
  permission: string
  blockers: string[]
  token: string[]
  notes: string[]
  integrationId: number | null
}

export function assessPreflight(gs: GitStrategy, contexts: string[], host: HostState): Preflight {
  const blockers: string[] = [];
  const token: string[] = [];
  const notes: string[] = [];
  if (host.repo === null) {
    return { reachable: false, admin: false, permission: 'unknown', blockers: ['the repository could not be read with gh api (no gh binary, no auth, or no network)'], token, notes, integrationId: null };
  }
  const admin = host.repo.permissions?.admin === true;
  const permission = admin ? 'admin' : host.repo.permissions?.push === true ? 'write' : host.repo.permissions ? 'read' : 'unknown';
  const prod = gs.branches?.production ?? 'main';

  if (host.scopes === null) {
    notes.push('token scopes are not readable (a fine-grained or app token): it needs "Administration: write" on this repository to change rulesets and settings');
  }
  else if (!host.scopes.includes('repo') && !(host.repo.visibility === 'public' && host.scopes.includes('public_repo'))) {
    token.push(`the gh token lacks the repo scope (has: ${host.scopes.join(', ') || 'none'}); run: gh auth refresh -s repo`);
  }

  let integrationId: number | null = null;
  if (statusChecksManaged(gs)) {
    integrationId = resolveIntegrationId(host.checkRuns);
    if (integrationId === null) {
      blockers.push(`no GitHub Actions check run exists on ${prod} yet, so the GitHub Actions app id (integration_id) cannot be read; run the ${EDD_CHECK} workflow once on ${prod}`);
    }
    const missing = missingCheckRuns(contexts, host.checkRuns);
    if (missing.length > 0) {
      blockers.push(`these required checks have never reported on ${prod}: ${missing.join(', ')}; a required check that never reports blocks every merge, so run those CI jobs on ${prod} first`);
    }
    if (host.repo.owner?.type === 'User' && directPushOpen(gs.policy?.direct_push_to_protected ?? 'evidence')) {
      blockers.push('a user-owned repository has no ruleset bypass list, so a required check on a branch that takes direct pushes would refuse every direct push; move the repository to an organization, or choose forbidden or manual');
    }
  }

  if (actionsSettingsPatch(gs)) {
    if (host.actions === null) {
      notes.push('"Allow GitHub Actions to create and approve pull requests" is not readable by this account (an admin reads it)');
    }
    else if (host.actions.can_approve_pull_request_reviews === true) {
      notes.push('"Allow GitHub Actions to create and approve pull requests" is ON today; the plan turns it off');
    }
    if (host.repo.owner?.type === 'Organization' && host.orgActionsReadable === false) {
      notes.push('the organization\'s Actions setting is not readable (needs admin:org); if the organization locks it, turning the switch off fails with 409 and an organization owner must change it');
    }
  }
  if ((host.orgRulesets ?? 0) > 0) {
    notes.push(`${host.orgRulesets} organization-level ruleset(s) also apply to this repository; they stack on top of this plan and cannot be changed from here`);
  }
  return { reachable: true, admin, permission, blockers, token, notes, integrationId };
}

export interface SetupPlan {
  branches: string[]
  contexts: string[]
  rules: Rule[]
  body: Record<string, unknown>
  repoPatch: Record<string, boolean>
  actionsPatch: { can_approve_pull_request_reviews: false } | null
  loosenings: string[]
  codeowners: string[]
}

export function derivePlan(gs: GitStrategy, slug: string | null, contexts: string[], codeowners: boolean, host: HostState | null, integrationId: number | null, codeownerLines: string[]): SetupPlan {
  const branches = protectedBranches(gs);
  const rules = buildRules(gs, codeowners, host?.rulesetRules ?? [], contexts, integrationId);
  const repoPatch = repoSettingsPatch(gs, rules) as Record<string, boolean>;
  const loosenings: string[] = [];
  if (host) {
    for (const b of branches) { loosenings.push(...detectLoosening(host.branchRules[b] ?? [], rules, slug ?? '', b)); }
    loosenings.push(...mergeMethodWidening(repoPatch, host.repo));
  }
  return {
    branches,
    contexts,
    rules,
    body: rulesetBody(gs, branches, rules, host?.rulesetId !== null && host?.rulesetId !== undefined),
    repoPatch,
    actionsPatch: actionsSettingsPatch(gs),
    loosenings,
    codeowners: codeownerLines,
  };
}

export function renderPlan(gs: GitStrategy, plan: SetupPlan, host: HostState | null): string[] {
  const out = [
    '',
    'Plan',
    `  strategy ${gs.strategy}; push ${gs.policy.direct_push_to_protected}; merge ${gs.policy.merge_mode}`,
    `  protected branches: ${plan.branches.join(', ')}`,
    `  ruleset ${RULESET_NAME}: ${host?.rulesetId ? `UPDATE (id ${host.rulesetId})` : 'CREATE'}`,
    ...describeRules(plan.rules).map(l => `    ${l}`),
  ];
  const checks = plan.rules.find(r => r.type === 'required_status_checks');
  out.push(checks && statusChecksManaged(gs)
    ? `  required checks: ${plan.contexts.join(', ')} (from .agents/project.yaml: ${EDD_CHECK} plus every evidence.static entry whose where includes ci), pinned to the GitHub Actions app`
    : mergesOnChecks(gs)
      ? '  required checks: not managed: the push policy keeps direct pushes open and admin_bypass is false, so a required check would refuse every direct push; auto-merge stays off too'
      : '  required checks: not managed under merge_mode manual (the host rule, if any, is kept)');
  out.push(`  repo settings: ${Object.keys(plan.repoPatch).length === 0 ? 'no change' : JSON.stringify(plan.repoPatch)}`);
  if (plan.actionsPatch) {
    const now = host?.actions?.can_approve_pull_request_reviews;
    out.push(`  Actions: can_approve_pull_request_reviews -> false (now: ${typeof now === 'boolean' ? String(now) : 'unknown'})`);
  }
  if (plan.codeowners.length > 0) {
    out.push('  CODEOWNERS (gate paths need a person\'s review under human-approves):', ...plan.codeowners.map(l => `    ${l}`));
  }
  if (plan.loosenings.length > 0) {
    out.push('  this would LOOSEN protection (setup never does; apply --allow-loosening is a separate, explicit step):', ...plan.loosenings.map(l => `    - ${l}`));
  }
  return out;
}

function ghFlag(key: string, value: boolean | string): string {
  return `-F ${key}=${String(value)}`;
}

export function renderHandoff(slug: string, gs: GitStrategy, plan: SetupPlan, pre: Preflight, host: HostState): string[] {
  const writable = pre.blockers.length === 0 && plan.loosenings.length === 0;
  const prod = gs.branches?.production ?? 'main';
  const out = [
    '',
    `Hand-off: ${host.login ?? 'this account'} has ${pre.permission} access to ${slug}; changing rulesets and repository settings needs an admin.`,
    'Send one of these two to someone who administers the repository.',
  ];
  if (!writable) {
    out.push('', 'Not ready to apply yet, so only the read commands are included:', ...pre.blockers.map(b => `  - ${b}`), ...plan.loosenings.map(l => `  - loosening: ${l}`));
  }
  out.push(
    '',
    'A) Prompt for the admin\'s AI agent',
    '---',
    `You are helping an admin configure GitHub for ${slug}. Use only \`gh api\`. Merge preset: ${gs.policy.merge_mode}; push policy: ${gs.policy.direct_push_to_protected}; strategy: ${gs.strategy}; protected branches: ${plan.branches.join(', ')}.`,
    `1. Confirm you are an admin: \`gh repo view ${slug} --json viewerPermission\` must print ADMIN. If not, stop.`,
    `2. Read the current state first, GET only: \`gh api repos/${slug}\`, \`gh api repos/${slug}/rulesets\`, \`gh api repos/${slug}/actions/permissions/workflow\`. Show me the difference with the commands below.`,
    '3. Run the commands below in order, one at a time, after I say yes to each. Never widen bypass actors and never touch another ruleset.',
    '4. Read each result back from GitHub and report it. Stop at the first error (any answer that is not 2xx) and tell me the exact message; never turn on auto-merge unless the ruleset with the required checks was written and reads back.',
    `The required checks come from .agents/project.yaml: ${plan.contexts.join(', ')}.`,
    '---',
    '',
    'B) The same as gh api commands (the writes are chained with &&, so the first failure stops the rest)',
    `gh repo view ${slug} --json viewerPermission,viewerCanAdminister`,
  );
  if (writable) {
    const method = host.rulesetId ? `-X PUT repos/${slug}/rulesets/${host.rulesetId}` : `-X POST repos/${slug}/rulesets`;
    const after: string[] = [];
    if (plan.repoPatch.allow_auto_merge === true) {
      after.push(`gh api repos/${slug}/rules/branches/${prod} --jq '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context] | index("${EDD_CHECK}") != null' | grep -qx true`);
    }
    const flags = Object.entries(plan.repoPatch).map(([k, v]) => ghFlag(k, v));
    if (flags.length > 0) { after.push(`gh api -X PATCH repos/${slug} ${flags.join(' ')}`); }
    if (plan.actionsPatch && host.actions?.can_approve_pull_request_reviews !== false) {
      after.push(`gh api -X PUT repos/${slug}/actions/permissions/workflow ${ghFlag('can_approve_pull_request_reviews', false)}`);
    }
    out.push(`gh api ${method} --input - <<'JSON'${after.length > 0 ? ' &&' : ''}`, JSON.stringify(plan.body, null, 2), 'JSON');
    out.push(...after.map((c, i) => (i < after.length - 1 ? `${c} &&` : c)));
  }
  out.push(
    `gh api repos/${slug} --jq '{allow_auto_merge,allow_merge_commit,allow_squash_merge,allow_rebase_merge}'`,
    `gh api repos/${slug}/rules/branches/${prod} --jq '[.[].type]'`,
    `gh api repos/${slug}/actions/permissions/workflow`,
  );
  if (plan.codeowners.length > 0) {
    out.push('', `Also commit .github/CODEOWNERS on ${prod} with:`, ...plan.codeowners.map(l => `  ${l}`));
  }
  return out;
}

export function readHostState(gs: GitStrategy, slug: string, deps: Pick<SetupDeps, 'gh' | 'scopes'>): HostState {
  const repo = deps.gh(`repos/${slug}`) as RepoView | null;
  const login = (deps.gh('user') as { login?: unknown } | null)?.login;
  const rulesets = deps.gh(`repos/${slug}/rulesets`);
  const existing = Array.isArray(rulesets) ? (rulesets as { id?: unknown, name?: unknown }[]).find(r => r?.name === RULESET_NAME) : undefined;
  const rulesetId = typeof existing?.id === 'number' ? existing.id : null;
  const orgRulesets = Array.isArray(rulesets) ? (rulesets as { source_type?: unknown }[]).filter(r => r?.source_type === 'Organization').length : 0;
  const detail = rulesetId === null ? null : deps.gh(`repos/${slug}/rulesets/${rulesetId}`) as { rules?: unknown } | null;
  const branchRules: Record<string, Rule[]> = {};
  for (const b of protectedBranches(gs)) {
    const rules = deps.gh(`repos/${slug}/rules/branches/${b}`);
    branchRules[b] = Array.isArray(rules) ? rules as Rule[] : [];
  }
  const prod = gs.branches?.production ?? 'main';
  const org = repo?.owner?.type === 'Organization' ? repo.owner.login : null;
  return {
    repo,
    login: typeof login === 'string' ? login : null,
    scopes: deps.scopes(),
    checkRuns: statusChecksManaged(gs) ? deps.gh(`repos/${slug}/commits/${prod}/check-runs?per_page=100`) : null,
    actions: deps.gh(`repos/${slug}/actions/permissions/workflow`) as ActionsWorkflowPermissions | null,
    orgActionsReadable: org ? deps.gh(`orgs/${org}/actions/permissions/workflow`) !== null : null,
    rulesetId,
    rulesetRules: Array.isArray(detail?.rules) ? detail.rules as Rule[] : [],
    branchRules,
    orgRulesets,
  };
}

export function conflict(a: SetupAnswers): string | null {
  if (a.merge === 'human-approves' && directPushOpen(a.push)) {
    return `human-approves needs push forbidden or confirm: with push ${a.push} the branch takes direct pushes, so no pull_request rule exists and no approval would ever be required.`;
  }
  return null;
}

async function answer(deps: SetupDeps, q: SetupQuestion, given: string | undefined): Promise<string> {
  if (given !== undefined) { return given; }
  if (!deps.interactive) { return q.default; }
  return String(await deps.ask({ kind: 'select', id: q.id, title: q.title, choices: q.choices, default: q.default }));
}

export function unappliedNote(a: SetupAnswers): string[] {
  return [
    '',
    `.agents/project.yaml now declares push ${a.push} and merge_mode ${a.merge}, and GitHub does not enforce that yet.`,
    'Until the plan is applied, bun run git:policy verify (and the pre-push hook that runs it) reports every difference, and with strategy_source chosen a difference blocks the push.',
    'Apply the plan (bun run git:policy setup at a terminal, as an admin), or list the difference in git_strategy.policy.accepted_divergences with a reason.',
  ];
}

export async function runSetup(deps: SetupDeps, flags: SetupFlags): Promise<number> {
  const out = deps.print;
  let wrote = false;
  let pending: SetupAnswers | null = null;
  const p = (line: string): void => { out(line); };
  const stop = (code: number): number => {
    if (wrote && pending) { for (const l of unappliedNote(pending)) { out(l); } }
    return code;
  };
  const text = deps.readProject();
  if (text === null) {
    p('.agents/project.yaml not found: run bun setup (or bun run agents:setup) first.');
    return 1;
  }
  const doc = parseYaml(text) as Record<string, unknown> | null;
  const gs = doc?.git_strategy as GitStrategy | undefined;
  if (!gs || typeof gs !== 'object') {
    p('.agents/project.yaml has no git_strategy block to write into: restore it from .agents/project.schema.yaml, then re-run.');
    return 1;
  }
  if (flags.questionsJson) {
    p(JSON.stringify(setupQuestions(gs, deps.lang, deps.gateReady)));
    return 0;
  }
  if (flags.push === 'evidence' && !deps.gateReady) {
    p('--push evidence needs the evidence gate (scripts/edd.ts and the edd package.json script), which this repository does not have.');
    return 1;
  }
  if (flags.writePolicy && !deps.interactive && (!flags.strategy || !flags.push || !flags.merge)) {
    p('--write-policy without a terminal needs all three answers: --strategy, --push and --merge. Defaults nobody chose are never written.');
    return 1;
  }

  const questions = setupQuestions(gs, deps.lang, deps.gateReady);
  const answers: SetupAnswers = {
    strategy: await answer(deps, questions[0], flags.strategy),
    push: await answer(deps, questions[1], flags.push),
    merge: await answer(deps, questions[2], flags.merge),
  };
  while (conflict(answers) !== null) {
    p(conflict(answers) ?? '');
    if (!deps.interactive || flags.merge || flags.push) { return 1; }
    answers.merge = String(await deps.ask({ kind: 'select', id: 'merge', title: questions[2].title, choices: questions[2].choices, default: 'auto' }));
  }
  const next = withAnswers(gs, answers);

  let owner: string | null = null;
  const existingCodeowners = deps.codeowners();
  if (answers.merge === 'human-approves' || gs.policy?.merge_mode === 'human-approves') {
    const login = deps.slug ? (deps.gh('user') as { login?: unknown } | null)?.login : null;
    const fallback = typeof login === 'string' ? `@${login}` : '@<owner>';
    owner = flags.codeowner ? normalizeOwner(flags.codeowner) : null;
    while (owner === null && deps.interactive && !flags.codeowner && answers.merge === 'human-approves') {
      owner = normalizeOwner(String(await deps.ask({ kind: 'text', id: 'codeowner', title: TITLES.codeowner[deps.lang], default: fallback })));
    }
    owner ??= fallback;
  }

  p('');
  p(`Answers: strategy ${answers.strategy}, push ${answers.push}, merge ${answers.merge}`);
  const edits = setupEdits(gs, answers);
  let nextText = text;
  let current = true;
  if (edits.length === 0) {
    p('.agents/project.yaml already holds these answers.');
  }
  else {
    try { nextText = spliceKeys(text, edits); }
    catch (e) {
      p(`Cannot write the answers into .agents/project.yaml in place: ${(e as Error).message}`);
      return 1;
    }
    p('Change to .agents/project.yaml:');
    for (const l of lineDiff(text, nextText)) { p(`  ${l}`); }
    const write = flags.writePolicy || (deps.interactive && await deps.ask({ kind: 'confirm', id: 'write', title: TITLES.write[deps.lang], default: true }) === true);
    if (write) {
      deps.writeProject(nextText);
      const reread = deps.readProject();
      let after: GitStrategy | undefined;
      try { after = (parseYaml(reread ?? '') as { git_strategy?: GitStrategy } | null)?.git_strategy; }
      catch { after = undefined; }
      if (after?.strategy !== answers.strategy || after?.policy?.direct_push_to_protected !== answers.push || after?.policy?.merge_mode !== answers.merge) {
        p('Wrote .agents/project.yaml but it does not read back with the answers.');
        return 1;
      }
      p('Wrote .agents/project.yaml (read back).');
      wrote = true;
      pending = answers;
    }
    else if (deps.interactive) {
      p('Nothing written.');
      return 0;
    }
    else {
      current = false;
      p('Not written: non-interactive run. The plan below is for .agents/project.yaml as it is now. Re-run in a terminal, or pass --write-policy with all three answers.');
    }
  }

  const planned = effectiveForApply(current ? next : gs);
  const codeownerLines = planned.policy?.merge_mode === 'human-approves' && owner !== null
    ? missingCodeownersLines(existingCodeowners, codeownersLines(gatePaths(doc), owner))
    : [];
  const contexts = requiredCheckContexts(doc?.evidence as never);
  const codeownersAfter = existingCodeowners !== null || codeownerLines.length > 0;
  if (deps.slug === null) {
    for (const l of renderPlan(planned, derivePlan(planned, null, contexts, codeownersAfter, null, null, codeownerLines), null)) { p(l); }
    p('');
    p('No GitHub origin: there is no repository to configure yet. Nothing was written to GitHub.');
    return stop(0);
  }

  const host = readHostState(planned, deps.slug, deps);
  const pre = assessPreflight(planned, contexts, host);
  const plan = derivePlan(planned, deps.slug, contexts, codeownersAfter, host, pre.integrationId, codeownerLines);
  for (const l of renderPlan(planned, plan, host)) { p(l); }
  p('');
  p('Preflight (read-only)');
  p(`  repository: ${deps.slug}; account: ${host.login ?? 'unknown'}; access: ${pre.permission}`);
  for (const b of [...pre.blockers, ...pre.token]) { p(`  BLOCKER: ${b}`); }
  for (const n of pre.notes) { p(`  note: ${n}`); }

  if (!pre.reachable) {
    p('');
    p('Stopped: the plan above comes from .agents/project.yaml alone. Nothing was written to GitHub.');
    return stop(0);
  }
  if (!pre.admin) {
    for (const l of renderHandoff(deps.slug, planned, plan, pre, host)) { p(l); }
    p('');
    p(`Stopped: ${host.login ?? 'this account'} is not an admin of ${deps.slug}. Nothing was written to GitHub.`);
    return stop(0);
  }
  if (pre.blockers.length + pre.token.length > 0) {
    p('');
    p('Stopped before any GitHub write: clear the blockers above, then re-run bun run git:policy setup.');
    return stop(0);
  }
  if (plan.loosenings.length > 0) {
    p('');
    p('Stopped: this would loosen protection, which setup never does. If it is intended, run bun run git:policy apply --allow-loosening yourself.');
    return stop(0);
  }
  if (flags.planOnly || !deps.interactive) {
    p('');
    p('Plan only: nothing was written to GitHub. To apply it, run bun run git:policy setup in a terminal.');
    return stop(0);
  }
  if (codeownerLines.length > 0 && existingCodeowners === null) {
    if (await deps.ask({ kind: 'confirm', id: 'codeowners', title: TITLES.codeownersFile[deps.lang], default: true }) === true) {
      deps.writeCodeowners(`${codeownerLines.join('\n')}\n`);
      p('Wrote .github/CODEOWNERS: commit and push it so GitHub enforces it.');
    }
    else {
      const without = derivePlan(planned, deps.slug, contexts, false, host, pre.integrationId, []);
      p('No CODEOWNERS file: require_code_owner_review stays off.');
      if (without.loosenings.length > 0) {
        for (const l of without.loosenings) { p(`  - ${l}`); }
        p('Stopped: without the file this would loosen protection, which setup never does.');
        return stop(0);
      }
    }
  }
  else if (codeownerLines.length > 0) {
    p('Add the CODEOWNERS lines above to your existing CODEOWNERS file and commit it.');
  }
  const dry = deps.applyHost(false);
  if (dry !== 0) { return stop(dry); }
  if (await deps.ask({ kind: 'confirm', id: 'apply', title: TITLES.apply[deps.lang], default: false }) !== true) {
    p('Nothing written to GitHub.');
    return stop(0);
  }
  const applied = deps.applyHost(true);
  return applied === 0 ? applied : stop(applied);
}

export async function promptAsk(q: AskQuestion): Promise<string | boolean> {
  const value = q.kind === 'select'
    ? await clack.select({
        message: q.title,
        options: q.choices.map(c => ({ value: c.value, label: c.rec ? `${c.label} *` : c.label, hint: c.day })),
        initialValue: q.default,
      })
    : q.kind === 'confirm'
      ? await clack.confirm({ message: q.title, initialValue: q.default })
      : await clack.text({ message: q.title, placeholder: q.default, defaultValue: q.default });
  if (clack.isCancel(value)) {
    clack.cancel('Cancelled: nothing more was written.');
    process.exit(1);
  }
  return value;
}
