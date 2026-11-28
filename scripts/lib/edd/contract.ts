import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { showFile } from './git.ts';

export const DEPTHS = ['none', 'light', 'standard', 'deep'] as const;
export type Depth = typeof DEPTHS[number];
export const WHERE = ['pre-push', 'ci'] as const;

export interface StaticCheck { id: string, cmd: string, where: string[] }
export interface AgenticCheck { id: string, kind: string, tool: string | null, envs: string[], min_depth: Depth }
export interface DepthRule { paths: string[], depth: Depth }
export interface Contract {
  include: string[]
  static: StaticCheck[]
  agentic: AgenticCheck[]
  depth: { default: Depth, rules: DepthRule[] }
  human: { paths: string[], keys: string[] }
  review: { bot: string | null, max_rounds: number }
  record: { artifact_retention_days: number }
}
export interface ProjectFacts {
  policy: string
  production: string
  protected: string[]
  environments: Record<string, { web_url: string | null }>
}
export interface LoadedContract {
  contract: Contract
  digest: string
  declared: boolean
  source: string
  warnings: string[]
  facts: ProjectFacts
  doc: Record<string, unknown> | null
}

export type Reader = (path: string) => string | null;

export const PROJECT_YAML = '.agents/project.yaml';
export const ALLOWED_SIGNERS = '.agents/edd/allowed_signers';

export const DEFAULT_GATE_PATHS = ['.github/workflows/**', '.husky/**', 'scripts/edd.ts', 'scripts/lib/edd/**', 'scripts/git-policy.ts', '.agents/edd/**', 'CODEOWNERS', '.agents/skills/*/evidence.yaml'];
export const DEFAULT_GATE_KEYS = ['evidence', 'git_strategy.policy'];
export const OFF_POLICIES = ['forbidden', 'confirm', 'allowed'];

const DEFAULT_STATIC: { id: string, keys: string[] }[] = [
  { id: 'format', keys: ['format:check'] },
  { id: 'lint', keys: ['lint:check'] },
  { id: 'types', keys: ['types:check'] },
  { id: 'unit', keys: ['test:unit', 'unit'] },
];

export class ContractError extends Error {}

export function treeReader(root: string): Reader {
  return (path) => {
    const p = join(root, path);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  };
}

export function refReader(cwd: string, ref: string): Reader {
  return path => showFile(cwd, ref, path);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function strings(v: unknown, what: string): string[] {
  if (v === undefined || v === null) { return []; }
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) { throw new ContractError(`${what} must be a list of strings`); }
  return v as string[];
}

function depthOf(v: unknown, what: string): Depth {
  if (typeof v !== 'string' || !(DEPTHS as readonly string[]).includes(v)) { throw new ContractError(`${what} must be one of ${DEPTHS.join(', ')}, got ${JSON.stringify(v)}`); }
  return v as Depth;
}

function staticList(v: unknown, what: string): StaticCheck[] {
  if (v === undefined || v === null) { return []; }
  if (!Array.isArray(v)) { throw new ContractError(`${what} must be a list`); }
  return v.map((e, i) => {
    if (!isObject(e) || typeof e.id !== 'string' || !e.id || typeof e.cmd !== 'string' || !e.cmd) { throw new ContractError(`${what}[${i}] needs a string id and cmd`); }
    const where = strings(e.where, `${what}[${i}].where`);
    const bad = where.filter(w => !(WHERE as readonly string[]).includes(w));
    if (bad.length > 0) { throw new ContractError(`${what}[${i}].where has ${bad.join(', ')}; allowed: ${WHERE.join(', ')}`); }
    return { id: e.id, cmd: e.cmd, where };
  });
}

function agenticList(v: unknown, what: string): AgenticCheck[] {
  if (v === undefined || v === null) { return []; }
  if (!Array.isArray(v)) { throw new ContractError(`${what} must be a list`); }
  return v.map((e, i) => {
    if (!isObject(e) || typeof e.id !== 'string' || !e.id || typeof e.kind !== 'string' || !e.kind) { throw new ContractError(`${what}[${i}] needs a string id and kind`); }
    const envs = strings(e.envs, `${what}[${i}].envs`);
    if (envs.length === 0) { throw new ContractError(`${what}[${i}].envs must name at least one environment`); }
    return { id: e.id, kind: e.kind, tool: typeof e.tool === 'string' ? e.tool : null, envs, min_depth: depthOf(e.min_depth ?? 'standard', `${what}[${i}].min_depth`) };
  });
}

function ruleList(v: unknown, what: string): DepthRule[] {
  if (v === undefined || v === null) { return []; }
  if (!Array.isArray(v)) { throw new ContractError(`${what} must be a list`); }
  return v.map((e, i) => {
    if (!isObject(e)) { throw new ContractError(`${what}[${i}] must be a map`); }
    const paths = strings(e.paths, `${what}[${i}].paths`);
    if (paths.length === 0) { throw new ContractError(`${what}[${i}].paths must name at least one glob`); }
    return { paths, depth: depthOf(e.depth, `${what}[${i}].depth`) };
  });
}

function byId<T extends { id: string }>(lists: T[][]): T[] {
  const m = new Map<string, T>();
  for (const list of lists) {
    for (const e of list) { m.set(e.id, e); }
  }
  return [...m.values()];
}

function defaultStatic(read: Reader): StaticCheck[] {
  const raw = read('package.json');
  let scripts: Record<string, unknown> = {};
  try {
    const pkg = raw ? JSON.parse(raw) as { scripts?: unknown } : null;
    if (isObject(pkg?.scripts)) { scripts = pkg.scripts; }
  }
  catch { scripts = {}; }
  return DEFAULT_STATIC.flatMap(({ id, keys }) => {
    const key = keys.find(k => typeof scripts[k] === 'string');
    return key ? [{ id, cmd: `bun run ${key}`, where: ['pre-push', 'ci'] }] : [];
  });
}

function facts(doc: Record<string, unknown> | null): ProjectFacts {
  const gs = isObject(doc?.git_strategy) ? doc.git_strategy : {};
  const declared = isObject(gs.policy) && typeof gs.policy.direct_push_to_protected === 'string' ? gs.policy.direct_push_to_protected : null;
  const policy = declared !== null && OFF_POLICIES.includes(declared) ? declared : 'evidence';
  const branches = isObject(gs.branches) ? gs.branches : {};
  const production = typeof branches.production === 'string' && branches.production ? branches.production : 'main';
  const listed = Array.isArray(gs.protected) ? gs.protected.filter((b): b is string => typeof b === 'string' && b.length > 0) : [];
  const environments: Record<string, { web_url: string | null }> = {};
  if (isObject(doc?.environments)) {
    for (const [name, env] of Object.entries(doc.environments)) {
      environments[name] = { web_url: isObject(env) && typeof env.web_url === 'string' ? env.web_url : null };
    }
  }
  return { policy, production, protected: [...new Set([production, ...listed])], environments };
}

export function canonical(v: unknown): string {
  if (Array.isArray(v)) { return `[${v.map(canonical).join(',')}]`; }
  if (isObject(v)) { return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`; }
  return JSON.stringify(v ?? null);
}

export function sha256(text: string | Uint8Array): string {
  return createHash('sha256').update(text).digest('hex');
}

export function contractDigest(c: Contract): string {
  return `sha256:${sha256(canonical(c))}`;
}

export function readProjectDoc(read: Reader): Record<string, unknown> | null {
  const raw = read(PROJECT_YAML);
  if (raw === null) { return null; }
  let doc: unknown;
  try { doc = parseYaml(raw); }
  catch (e) { throw new ContractError(`${PROJECT_YAML} is not valid YAML: ${(e as Error).message}`); }
  return isObject(doc) ? doc : null;
}

export function loadContract(read: Reader, source: string): LoadedContract {
  const doc = readProjectDoc(read);
  const warnings: string[] = [];
  const block = doc?.evidence;
  const declared = isObject(block);
  const ev: Record<string, unknown> = declared ? block : {};
  const include = strings(ev.include, 'evidence.include');
  const fragStatic: StaticCheck[][] = [];
  const fragAgentic: AgenticCheck[][] = [];
  const fragRules: DepthRule[] = [];
  for (const skill of include) {
    const where = `.agents/skills/${skill}/evidence.yaml`;
    const raw = read(where);
    if (raw === null) {
      warnings.push(`evidence.include names ${skill}, but ${where} does not exist at ${source}: it adds nothing`);
      continue;
    }
    let frag: unknown;
    try { frag = parseYaml(raw); }
    catch (e) { throw new ContractError(`${where} is not valid YAML: ${(e as Error).message}`); }
    if (!isObject(frag)) { throw new ContractError(`${where} must be a map`); }
    fragStatic.push(staticList(frag.static, `${where} static`));
    fragAgentic.push(agenticList(frag.agentic, `${where} agentic`));
    fragRules.push(...ruleList(isObject(frag.depth) ? frag.depth.rules : undefined, `${where} depth.rules`));
  }
  const depthBlock = isObject(ev.depth) ? ev.depth : {};
  const human = isObject(ev.human) ? ev.human : {};
  const review = isObject(ev.review) ? ev.review : {};
  const record = isObject(ev.record) ? ev.record : {};
  const days = record.artifact_retention_days ?? 30;
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) { throw new ContractError('evidence.record.artifact_retention_days must be a non-negative number'); }
  const contract: Contract = {
    include,
    static: byId([...fragStatic, declared ? staticList(ev.static, 'evidence.static') : defaultStatic(read)]),
    agentic: byId([...fragAgentic, agenticList(ev.agentic, 'evidence.agentic')]),
    depth: {
      default: depthOf(depthBlock.default ?? (declared ? 'standard' : 'none'), 'evidence.depth.default'),
      rules: declared ? [...ruleList(depthBlock.rules, 'evidence.depth.rules'), ...fragRules] : [{ paths: DEFAULT_GATE_PATHS, depth: 'standard' }, ...fragRules],
    },
    human: {
      paths: human.paths === undefined ? DEFAULT_GATE_PATHS : strings(human.paths, 'evidence.human.paths'),
      keys: human.keys === undefined ? DEFAULT_GATE_KEYS : strings(human.keys, 'evidence.human.keys'),
    },
    review: { bot: typeof review.bot === 'string' ? review.bot : null, max_rounds: typeof review.max_rounds === 'number' ? review.max_rounds : 2 },
    record: { artifact_retention_days: days },
  };
  return { contract, digest: contractDigest(contract), declared, source, warnings, facts: facts(doc), doc };
}

function valueAt(doc: Record<string, unknown> | null, path: string): unknown {
  let cur: unknown = doc;
  for (const k of path.split('.')) {
    if (!isObject(cur)) { return undefined; }
    cur = cur[k];
  }
  return cur;
}

export function gateKeysTouched(before: Record<string, unknown> | null, after: Record<string, unknown> | null, keys: string[]): string[] {
  return keys.filter(k => canonical(valueAt(before, k)) !== canonical(valueAt(after, k)));
}
