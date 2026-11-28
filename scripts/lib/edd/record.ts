import type { AttestedCheck } from './attest.ts';
import type { Depth } from './contract.ts';

import type { Signature } from './verify.ts';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RECORD_SCHEMA = 'edd-evidence/1';
export const RENDER_MARKER = '<!-- edd-evidence -->';

export interface StaticResult { id: string, cmd: string, exit: number | null, ms: number, output_sha256: string | null, ran_at: string | null, skipped?: string }
export interface ReadyState { threads_open: number | null, bot_review: string, assignee: boolean, tracker_link: boolean, title_ok: boolean }
export interface EvidenceRecord {
  schema: string
  subject: { sha: string, tree: string, patch_id: string, base: string, branch: string | null, repo: string | null }
  push: { remote_ref: string | null, flow: 'direct' | 'pr' | 'chain', where: 'pre-push' | 'ci' }
  contract: { digest: string, read_from: string, declared: boolean, depth: Depth, depth_reasons: string[], warnings: string[] }
  static: StaticResult[]
  agentic: { required: string[], evidence_commit: string | null, signature: Signature, signer: string | null, checks: AttestedCheck[] }
  ready: ReadyState | null
  touches_gate: { touched: boolean, paths: string[], keys: string[] }
  problems: string[]
  producer: { script_sha256: string | null, worktree: string, session: string }
  result: 'pass' | 'fail'
  written_at: string
}

export function scrubLine(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/::/g, ': :').replace(/##\[/g, '## [').replace(/%0[AD]/gi, ' ');
}

export function evidenceDir(primary: string): string {
  return join(primary, '.session', 'evidence');
}

export function artifactsRoot(primary: string, sha: string): string {
  return join(evidenceDir(primary), 'artifacts', sha);
}

function stamp(iso: string): string {
  return iso.replace(/[^0-9A-Z]/gi, '');
}

export function writeRecord(primary: string, rec: EvidenceRecord): string {
  const dir = evidenceDir(primary);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${rec.subject.sha}.json`);
  if (existsSync(path)) {
    let prior = '';
    try { prior = String((JSON.parse(readFileSync(path, 'utf8')) as { written_at?: unknown }).written_at ?? ''); }
    catch {}
    let keep = join(dir, `${rec.subject.sha}.${stamp(prior) || statSync(path).mtimeMs.toFixed(0)}.json`);
    for (let n = 1; existsSync(keep); n++) { keep = join(dir, `${rec.subject.sha}.${stamp(prior)}-${n}.json`); }
    renameSync(path, keep);
  }
  writeFileSync(path, `${JSON.stringify(rec, null, 2)}\n`);
  return path;
}

export function readRecord(primary: string, sha: string): EvidenceRecord | null {
  const path = join(evidenceDir(primary), `${sha}.json`);
  if (!existsSync(path)) { return null; }
  return JSON.parse(readFileSync(path, 'utf8')) as EvidenceRecord;
}

function cell(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/[\\`*_[\]()!@#|<>~]/g, ch => `&#${ch.charCodeAt(0)};`).slice(0, 200);
}

export function renderMarkdown(rec: EvidenceRecord): string {
  const short = (s: string | null): string => (s ? `\`${s.slice(0, 12)}\`` : '-');
  const lines = [
    RENDER_MARKER,
    '## Evidence',
    '',
    `**Result: ${rec.result.toUpperCase()}** for ${short(rec.subject.sha)} (${rec.push.where}, ${rec.push.flow}), depth \`${rec.contract.depth}\`, contract \`${rec.contract.digest.slice(0, 19)}\` read from ${cell(rec.contract.read_from)}.`,
    '',
    'What this proves: the declared checks ran and the agentic evidence is bound to this exact diff and signed by an allowed key. It catches mistakes and drift; it does not stop an agent that deliberately forges a check or its artifacts.',
    '',
    `Touches gate files: ${rec.touches_gate.touched ? `yes (${cell([...rec.touches_gate.paths, ...rec.touches_gate.keys.map(k => `key ${k}`)].join(', '))})` : 'no'}. Informational only: it changes no verdict.`,
    '',
  ];
  if (rec.static.length > 0) {
    lines.push('| Static check | Command | Exit | Time |', '|---|---|---|---|');
    for (const s of rec.static) {
      lines.push(`| ${cell(s.id)} | ${cell(s.cmd)} | ${s.skipped ? `skipped: ${cell(s.skipped)}` : String(s.exit)} | ${s.skipped ? '-' : `${(s.ms / 1000).toFixed(1)} s`} |`);
    }
    lines.push('');
  }
  if (rec.agentic.required.length > 0 || rec.agentic.evidence_commit) {
    lines.push(`Agentic evidence: commit ${short(rec.agentic.evidence_commit)}, signature \`${rec.agentic.signature}\`${rec.agentic.signer ? ` (${cell(rec.agentic.signer)})` : ''}.`, '');
    if (rec.agentic.checks.length > 0 && rec.agentic.signature === 'valid') {
      lines.push('| Agentic check | Env | Verdict | By | Artifacts |', '|---|---|---|---|---|');
      for (const c of rec.agentic.checks) {
        lines.push(`| ${cell(c.id)} | ${cell(c.env)} | ${cell(c.verdict)} | ${cell(c.verdict_by)} | ${c.artifacts.length} |`);
      }
      lines.push('');
    }
  }
  if (rec.ready) {
    const r = rec.ready;
    lines.push(`Ready: threads open ${r.threads_open ?? 'unknown'}, bot review ${r.bot_review}, assignee ${r.assignee ? 'yes' : 'no'}, tracker link ${r.tracker_link ? 'yes' : 'no'}, title ${r.title_ok ? 'ok' : 'not conventional or too long'}. Threads and the bot review are a snapshot of this run, informational only; the ruleset enforces thread resolution.`, '');
  }
  if (rec.problems.length > 0) {
    lines.push('Problems:', '', ...rec.problems.map(p => `- ${cell(p)}`), '');
  }
  return lines.join('\n');
}

export interface PruneResult { deleted: string[], kept: string[] }

function newestMtime(dir: string): number {
  let t = statSync(dir).mtimeMs;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    t = Math.max(t, st.isDirectory() ? newestMtime(p) : st.mtimeMs);
  }
  return t;
}

export function pruneArtifacts(primary: string, days: number, now: number, dryRun: boolean): PruneResult {
  const root = join(evidenceDir(primary), 'artifacts');
  const out: PruneResult = { deleted: [], kept: [] };
  if (!existsSync(root)) { return out; }
  const cutoff = now - days * 86_400_000;
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) { continue; }
    const last = newestMtime(dir);
    if (last < cutoff) {
      if (!dryRun) { rmSync(dir, { recursive: true, force: true }); }
      out.deleted.push(name);
    }
    else { out.kept.push(name); }
  }
  return out;
}
