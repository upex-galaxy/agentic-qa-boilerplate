import type { AttestedCheck } from './attest.ts';
import type { AgenticCheck, Depth, LoadedContract } from './contract.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseEvidenceMessage } from './attest.ts';
import { DEPTHS, sha256 } from './contract.ts';
import { changeDepth, depthRank, requiredAgentic } from './depth.ts';
import { changedFiles, commitMessage, git, parentsOf, rangeCommits, trailerValues, treeOf } from './git.ts';
import { patchId } from './patch-id.ts';

export type Signature = 'valid' | 'invalid' | 'absent';

export interface AgenticVerdict {
  ok: boolean
  required: string[]
  depth: Depth
  depthReasons: string[]
  patchId: string
  evidenceCommit: string | null
  signature: Signature
  signer: string | null
  checks: AttestedCheck[]
  problems: string[]
}

export interface VerifyInput {
  cwd: string
  base: string
  head: string
  loaded: LoadedContract
  allowedSigners: string | null
  signatureOf?: (sha: string) => { signature: Signature, signer: string | null }
}

export function isEvidenceCommit(cwd: string, sha: string): boolean {
  return parseEvidenceMessage(commitMessage(cwd, sha)) !== null;
}

export function findEvidenceCommit(cwd: string, base: string, head: string): string | null {
  const range = rangeCommits(cwd, base, head);
  return range.find(c => isEvidenceCommit(cwd, c)) ?? null;
}

export function authorSessions(cwd: string, base: string, head: string): string[] {
  const s = new Set<string>();
  for (const c of rangeCommits(cwd, base, head)) {
    if (isEvidenceCommit(cwd, c)) { continue; }
    for (const v of trailerValues(cwd, c, 'Session')) {
      if (v && v !== 'unknown') { s.add(v); }
    }
  }
  return [...s];
}

export function sameSession(verdictBy: string, session: string): boolean {
  const a = verdictBy.trim().toLowerCase();
  const b = session.trim().toLowerCase();
  return a === b || (b.length >= 4 && a.includes(b));
}

export function testerProblems(checks: AttestedCheck[], sessions: string[], depth: Depth): string[] {
  if (depthRank(depth) < depthRank('standard')) { return []; }
  return checks.flatMap(c => sessions.filter(s => sameSession(c.verdict_by, s)).map(s => `${c.id}/${c.env}: verdict_by "${c.verdict_by}" is the author session ${s}; at depth ${depth} the tester must be another session`));
}

export function coverageProblems(required: AgenticCheck[], checks: AttestedCheck[], depth: Depth): string[] {
  const out: string[] = [];
  for (const r of required) {
    const mine = checks.filter(c => c.id === r.id);
    if (mine.length === 0) { out.push(`${r.id}: required at depth ${depth}, not attested`); continue; }
    for (const c of mine) {
      if (c.verdict !== 'pass') { out.push(`${r.id}/${c.env}: verdict ${c.verdict}`); }
      if (!Array.isArray(c.artifacts) || c.artifacts.length === 0) { out.push(`${r.id}/${c.env}: no artifacts listed`); }
      if (!r.envs.includes(c.env)) { out.push(`${r.id}/${c.env}: env is not one of ${r.envs.join(', ')}`); }
    }
    const wanted = depth === 'deep' ? r.envs : [];
    for (const env of wanted) {
      if (!mine.some(c => c.env === env && c.verdict === 'pass')) { out.push(`${r.id}: depth deep needs a pass on ${env}`); }
    }
  }
  return out;
}

export function checkSignature(cwd: string, sha: string, allowedSigners: string | null): { signature: Signature, signer: string | null } {
  if (allowedSigners === null || allowedSigners.trim() === '') { return { signature: 'invalid', signer: null }; }
  const dir = mkdtempSync(join(tmpdir(), 'edd-signers-'));
  try {
    const file = join(dir, 'allowed_signers');
    writeFileSync(file, allowedSigners);
    const r = git(cwd, ['-c', `gpg.ssh.allowedSignersFile=${file}`, 'log', '-1', '--format=%G?%x00%GF', sha]);
    const [status, fp] = r.out.trim().split('\0');
    if (r.code !== 0) { return { signature: 'invalid', signer: null }; }
    if (status === 'N') { return { signature: 'absent', signer: null }; }
    return { signature: status === 'G' ? 'valid' : 'invalid', signer: fp || null };
  }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

export function verifyAgentic(input: VerifyInput): AgenticVerdict {
  const { cwd, base, head, loaded } = input;
  const files = changedFiles(cwd, base, head);
  const { depth, reasons } = changeDepth(files, loaded.contract.depth);
  const required = requiredAgentic(loaded.contract.agentic, depth);
  const pid = patchId(cwd, base, head);
  const verdict: AgenticVerdict = { ok: true, required: required.map(r => r.id), depth, depthReasons: reasons, patchId: pid, evidenceCommit: null, signature: 'absent', signer: null, checks: [], problems: [] };
  const evidence = findEvidenceCommit(cwd, base, head);
  if (required.length === 0 && evidence === null) { return verdict; }
  const problems = verdict.problems;
  if (evidence === null) {
    problems.push(`depth ${depth} requires agentic evidence (${verdict.required.join(', ')}) and no evidence commit is in the range: run bun run edd attest`);
    verdict.ok = false;
    return verdict;
  }
  verdict.evidenceCommit = evidence;
  const parsed = parseEvidenceMessage(commitMessage(cwd, evidence));
  if (parsed === null) { problems.push(`${evidence.slice(0, 12)}: evidence message cannot be parsed`); verdict.ok = false; return verdict; }
  const { payload } = parsed;
  verdict.checks = payload.checks;
  const parents = parentsOf(cwd, evidence);
  if (parents.length !== 1) { problems.push('the evidence commit must have exactly one parent'); }
  else if (treeOf(cwd, evidence) !== treeOf(cwd, parents[0])) { problems.push('the evidence commit is not empty: it changes the tree'); }
  if (parsed.digest !== `sha256:${sha256(parsed.line)}`) { problems.push('Evidence-Digest does not match the attested JSON line'); }
  if (parsed.patchId !== payload.patch_id) { problems.push('Evidence-Patch-Id trailer and the attested patch_id differ'); }
  if (parsed.subject !== payload.subject) { problems.push('Evidence-Subject trailer and the attested subject differ'); }
  if (payload.patch_id !== pid) {
    problems.push(`the change's patch id is ${pid}, the evidence attests ${payload.patch_id}: the diff changed after attest, re-attest`);
  }
  const sig = input.signatureOf ? input.signatureOf(evidence) : checkSignature(cwd, evidence, input.allowedSigners);
  verdict.signature = sig.signature;
  verdict.signer = sig.signer;
  if (sig.signature !== 'valid') { problems.push(`evidence commit signature is ${sig.signature} against the allowed signers read from the base`); }
  if (payload.contract_digest !== loaded.digest) { problems.push(`the evidence was attested against contract ${payload.contract_digest}; the base contract is ${loaded.digest}: re-attest`); }
  if (!(DEPTHS as readonly string[]).includes(payload.depth) || depthRank(payload.depth) < depthRank(depth)) { problems.push(`attested depth ${payload.depth} is below the change's depth ${depth}`); }
  problems.push(...coverageProblems(required, payload.checks, depth));
  problems.push(...testerProblems(payload.checks, authorSessions(cwd, base, parents[0] ?? head), depth));
  verdict.ok = problems.length === 0;
  return verdict;
}
