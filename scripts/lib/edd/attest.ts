import type { AgenticCheck, Depth } from './contract.ts';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

import { join, relative } from 'node:path';

import { sha256 } from './contract.ts';

export const AGENTIC_SCHEMA = 'edd-agentic/1';
export const EVIDENCE_SUBJECT_PREFIX = 'test(evidence): attest ';
export const VERDICT_FILE = 'verdict.json';

export interface ArtifactRef { path: string, sha256: string, bytes: number }
export interface AttestedCheck { id: string, verdict: string, verdict_by: string, env: string, artifacts: ArtifactRef[], claim?: string }
export interface AgenticPayload { schema: string, subject: string, patch_id: string, depth: Depth, contract_digest: string, checks: AttestedCheck[] }
export interface ParsedEvidence { payload: AgenticPayload, line: string, subject: string | null, patchId: string | null, digest: string | null }

const KIND_FILES: Record<string, RegExp> = {
  'screenshots': /\.(?:png|jpe?g|webp)$/i,
  'test-run': /\.(?:zip|xml|json)$/i,
  'api-calls': /\.(?:har|json)$/i,
};
const TIMED = /\.(?:png|jpe?g|webp|zip|har)$/i;
const TRACE = /\.zip$/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { out.push(...walk(p)); }
    else if (st.isFile()) { out.push(p); }
  }
  return out;
}

export type TraceHosts = (file: string) => string[] | null;

export function traceHosts(file: string): string[] | null {
  const list = Bun.spawnSync(['unzip', '-Z1', file], { stdout: 'pipe', stderr: 'pipe' });
  if (list.exitCode !== 0) { return null; }
  const members = list.stdout.toString().split('\n').map(s => s.trim()).filter(m => m.endsWith('.network'));
  const hosts = new Set<string>();
  for (const m of members) {
    const p = Bun.spawnSync(['unzip', '-p', file, m], { stdout: 'pipe', stderr: 'pipe' });
    if (p.exitCode !== 0) { return null; }
    for (const match of p.stdout.toString().matchAll(/"url":"(https?:\/\/[^"]+)"/g)) {
      try { hosts.add(new URL(match[1]).host); }
      catch {}
    }
  }
  return [...hosts];
}

export interface CollectInput {
  root: string
  required: AgenticCheck[]
  depth: Depth
  subjectTime: number
  environments: Record<string, { web_url: string | null }>
  hosts?: TraceHosts
}

export function collectChecks(input: CollectInput): { checks: AttestedCheck[], problems: string[] } {
  const checks: AttestedCheck[] = [];
  const problems: string[] = [];
  const hostsOf = input.hosts ?? traceHosts;
  for (const c of input.required) {
    const dir = join(input.root, c.id);
    const envs = existsSync(dir) ? readdirSync(dir).filter(e => statSync(join(dir, e)).isDirectory()) : [];
    const wanted = input.depth === 'deep' ? c.envs : c.envs.filter(e => envs.includes(e)).slice(0, 1);
    if (wanted.length === 0) {
      problems.push(`${c.id}: no artifacts under ${relative(input.root, dir) || dir}/<env>/ for any of ${c.envs.join(', ')}`);
      continue;
    }
    for (const env of wanted) {
      const envDir = join(dir, env);
      if (!existsSync(envDir)) {
        problems.push(`${c.id}: depth deep needs every env; nothing under ${c.id}/${env}/`);
        continue;
      }
      const verdictPath = join(envDir, VERDICT_FILE);
      if (!existsSync(verdictPath)) {
        problems.push(`${c.id}/${env}: ${VERDICT_FILE} is missing (verdict, verdict_by, optional claim)`);
        continue;
      }
      let v: { verdict?: unknown, verdict_by?: unknown, claim?: unknown };
      try { v = JSON.parse(readFileSync(verdictPath, 'utf8')) as typeof v; }
      catch { problems.push(`${c.id}/${env}: ${VERDICT_FILE} is not JSON`); continue; }
      if (typeof v.verdict !== 'string' || typeof v.verdict_by !== 'string' || !v.verdict_by.trim()) {
        problems.push(`${c.id}/${env}: ${VERDICT_FILE} needs string verdict and verdict_by`);
        continue;
      }
      if (v.verdict !== 'pass') { problems.push(`${c.id}/${env}: verdict is ${v.verdict}, not pass`); }
      const files = walk(envDir).filter(f => f !== verdictPath);
      const re = KIND_FILES[c.kind];
      if (files.length === 0) { problems.push(`${c.id}/${env}: no artifact files`); }
      else if (re && !files.some(f => re.test(f))) { problems.push(`${c.id}/${env}: no artifact of kind ${c.kind} (${re.source})`); }
      for (const f of files.filter(f => TIMED.test(f))) {
        if (statSync(f).mtimeMs / 1000 < input.subjectTime) { problems.push(`${c.id}/${env}: ${relative(envDir, f)} is older than the subject commit`); }
      }
      const traces = files.filter(f => TRACE.test(f));
      if (traces.length > 0) {
        const url = input.environments[env]?.web_url ?? null;
        const want = url ? new URL(url).host : null;
        if (want === null) { problems.push(`${c.id}/${env}: environments.${env}.web_url is not set, so the trace host cannot be checked`); }
        for (const t of traces) {
          const hosts = hostsOf(t);
          if (hosts === null) { problems.push(`${c.id}/${env}: ${relative(envDir, t)} could not be read as a trace (unzip)`); }
          else if (want !== null && !hosts.includes(want)) { problems.push(`${c.id}/${env}: ${relative(envDir, t)} never calls ${want} (saw ${hosts.join(', ') || 'no URL'})`); }
        }
      }
      checks.push({
        id: c.id,
        verdict: v.verdict,
        verdict_by: v.verdict_by.trim(),
        env,
        artifacts: files.map((f) => {
          const bytes = readFileSync(f);
          return { path: relative(envDir, f), sha256: sha256(bytes), bytes: bytes.length };
        }),
        ...(typeof v.claim === 'string' && v.claim ? { claim: v.claim } : {}),
      });
    }
  }
  return { checks, problems };
}

export function evidenceMessage(payload: AgenticPayload, worktree: string, session: string): string {
  const line = JSON.stringify(payload);
  return [
    `${EVIDENCE_SUBJECT_PREFIX}${payload.subject.slice(0, 7)} ${payload.depth}`,
    '',
    line,
    '',
    `Evidence-Subject: ${payload.subject}`,
    `Evidence-Patch-Id: ${payload.patch_id}`,
    `Evidence-Digest: sha256:${sha256(line)}`,
    `Worktree: ${worktree}`,
    `Session: ${session}`,
    '',
  ].join('\n');
}

function trailer(msg: string, key: string): string | null {
  const m = msg.match(new RegExp(`^${key}: *(\\S+) *$`, 'm'));
  return m ? m[1] : null;
}

export function parseEvidenceMessage(msg: string): ParsedEvidence | null {
  if (!msg.startsWith(EVIDENCE_SUBJECT_PREFIX)) { return null; }
  const line = msg.split('\n').find(l => l.startsWith('{') && l.includes(`"schema":"${AGENTIC_SCHEMA}"`));
  if (!line) { return null; }
  let payload: AgenticPayload;
  try { payload = JSON.parse(line) as AgenticPayload; }
  catch { return null; }
  if (payload?.schema !== AGENTIC_SCHEMA || !Array.isArray(payload.checks)) { return null; }
  return { payload, line, subject: trailer(msg, 'Evidence-Subject'), patchId: trailer(msg, 'Evidence-Patch-Id'), digest: trailer(msg, 'Evidence-Digest') };
}
