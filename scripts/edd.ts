#!/usr/bin/env bun
import type { Depth, LoadedContract, Reader, StaticCheck } from './lib/edd/contract.ts';
import type { EvidenceRecord, ReadyState, StaticResult } from './lib/edd/record.ts';
import type { AgenticVerdict } from './lib/edd/verify.ts';

import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { AGENTIC_SCHEMA, collectChecks, evidenceMessage } from './lib/edd/attest.ts';
import { ALLOWED_SIGNERS, ContractError, DEPTHS, gateKeysTouched, loadContract, readProjectDoc, refReader, sha256, treeReader } from './lib/edd/contract.ts';
import { changeDepth, gatePathsTouched, requiredAgentic } from './lib/edd/depth.ts';
import { changedFiles, commitTime, EMPTY_TREE, git, isCommit, isZeroOid, mergeBase, primaryRoot, repoRoot, resolveCommit, treeOf } from './lib/edd/git.ts';
import { patchId } from './lib/edd/patch-id.ts';
import { artifactsRoot, pruneArtifacts, readRecord, RECORD_SCHEMA, RENDER_MARKER, renderMarkdown, writeRecord } from './lib/edd/record.ts';
import { authorSessions, coverageProblems, isEvidenceCommit, testerProblems, verifyAgentic } from './lib/edd/verify.ts';

const USAGE = `Usage: bun run edd <command>

  attest [--base <ref>] [--depth <d>] [--session <label>] [--worktree <name>]
           Hash the artifacts of HEAD under .session/evidence/artifacts/<sha>/<check>/<env>/
           and create the signed, empty evidence commit on top of HEAD.
  gate     Pre-push evidence gate (reads git's pre-push refs on stdin; with none,
           checks HEAD against the production branch). Writes the record.
  verify [--base <ref>] [<head>]
           Check the agentic evidence of a range and print the verdict.
  verify --ci
           CI verifier: reads the GitHub event as data, writes the record, the job
           summary and the PR comment.
  render [--pr] [<sha>]
           Print the record of <sha> (default HEAD) as the PR's ## Evidence block.
  prune [--days <n>] [--dry-run]
           Delete artifact folders past the retention; records are never deleted.
  check <id>
           Run one static check of the contract whose where includes ci.
`;

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name: string): string | null {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function has(name: string): boolean {
  return argv.includes(name);
}

function positional(): string[] {
  const out: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      if (['--base', '--depth', '--session', '--worktree', '--days'].includes(argv[i])) { i++; }
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

function die(msg: string): never {
  console.error(`edd: ${msg}`);
  process.exit(1);
}

const CWD = (() => {
  try { return repoRoot(process.cwd()); }
  catch { return die('not inside a git repository'); }
})();
const PRIMARY = primaryRoot(CWD);

function identity(): { worktree: string, session: string } {
  return {
    worktree: flag('--worktree') ?? process.env.EDD_WORKTREE ?? (CWD === PRIMARY ? 'primary' : basename(CWD)),
    session: flag('--session') ?? process.env.EDD_SESSION ?? 'unknown',
  };
}

function scriptSha(): string | null {
  try { return sha256(readFileSync(import.meta.path)); }
  catch { return null; }
}

function load(read: Reader, source: string): LoadedContract {
  try { return loadContract(read, source); }
  catch (e) {
    if (e instanceof ContractError) { return die(`contract at ${source}: ${e.message}`); }
    throw e;
  }
}

function tryLoad(read: Reader, source: string): LoadedContract | string {
  try { return loadContract(read, source); }
  catch (e) {
    if (e instanceof ContractError) { return `contract at ${source}: ${e.message}`; }
    throw e;
  }
}

function runStatic(checks: StaticCheck[]): StaticResult[] {
  const out: StaticResult[] = [];
  let failed: string | null = null;
  for (const c of checks) {
    if (failed !== null) {
      out.push({ id: c.id, cmd: c.cmd, exit: null, ms: 0, output_sha256: null, ran_at: null, skipped: `${failed} failed first` });
      continue;
    }
    console.log(`edd: running ${c.id}: ${c.cmd}`);
    const ranAt = new Date().toISOString();
    const t0 = performance.now();
    const p = Bun.spawnSync(['sh', '-c', c.cmd], { cwd: CWD, stdout: 'pipe', stderr: 'pipe', env: process.env });
    const ms = Math.round(performance.now() - t0);
    const output = `${p.stdout.toString()}${p.stderr.toString()}`;
    const exit = p.exitCode ?? 1;
    out.push({ id: c.id, cmd: c.cmd, exit, ms, output_sha256: sha256(output), ran_at: ranAt });
    if (exit !== 0) {
      failed = c.id;
      console.log(output.split('\n').slice(-40).join('\n'));
    }
  }
  return out;
}

function touches(files: string[], loaded: LoadedContract, head: string): EvidenceRecord['touches_gate'] {
  const paths = gatePathsTouched(files, loaded.contract.human.paths);
  let headDoc: Record<string, unknown> | null = null;
  try { headDoc = readProjectDoc(refReader(CWD, head)); }
  catch { headDoc = null; }
  const keys = gateKeysTouched(loaded.doc, headDoc, loaded.contract.human.keys);
  return { touched: paths.length > 0 || keys.length > 0, paths, keys };
}

function emptyAgentic(depth: Depth, reasons: string[], pid: string): AgenticVerdict {
  return { ok: true, required: [], depth, depthReasons: reasons, patchId: pid, evidenceCommit: null, signature: 'absent', signer: null, checks: [], problems: [] };
}

function record(parts: {
  sha: string
  base: string
  branch: string | null
  repo: string | null
  remoteRef: string | null
  flow: EvidenceRecord['push']['flow']
  where: EvidenceRecord['push']['where']
  loaded: LoadedContract
  agentic: AgenticVerdict
  statics: StaticResult[]
  ready: ReadyState | null
  touches: EvidenceRecord['touches_gate']
  problems: string[]
}): EvidenceRecord {
  const { agentic: v } = parts;
  const problems = [...parts.problems, ...v.problems];
  const pass = problems.length === 0 && v.ok && parts.statics.every(s => s.exit === 0);
  const id = identity();
  return {
    schema: RECORD_SCHEMA,
    subject: { sha: parts.sha, tree: treeOf(CWD, parts.sha), patch_id: v.patchId, base: parts.base, branch: parts.branch, repo: parts.repo },
    push: { remote_ref: parts.remoteRef, flow: parts.flow, where: parts.where },
    contract: { digest: parts.loaded.digest, read_from: parts.loaded.source, declared: parts.loaded.declared, depth: v.depth, depth_reasons: v.depthReasons, warnings: parts.loaded.warnings },
    static: parts.statics,
    agentic: { required: v.required, evidence_commit: v.evidenceCommit, signature: v.signature, signer: v.signer, checks: v.checks },
    ready: parts.ready,
    touches_gate: parts.touches,
    problems,
    producer: { script_sha256: scriptSha(), worktree: id.worktree, session: id.session },
    result: pass ? 'pass' : 'fail',
    written_at: new Date().toISOString(),
  };
}

interface PushLine { localRef: string, localSha: string, remoteRef: string, remoteSha: string }

function parseRefs(text: string): PushLine[] {
  return text.split('\n').map(l => l.trim().split(/\s+/)).filter(p => p.length >= 4).map(([localRef, localSha, remoteRef, remoteSha]) => ({ localRef, localSha, remoteRef, remoteSha }));
}

function baseFor(head: string, remoteSha: string, production: string): string {
  if (!isZeroOid(remoteSha) && isCommit(CWD, remoteSha)) { return remoteSha; }
  const prod = resolveCommit(CWD, `refs/remotes/origin/${production}`);
  return (prod && mergeBase(CWD, head, prod)) ?? EMPTY_TREE;
}

async function gate(): Promise<number> {
  const wt = tryLoad(treeReader(CWD), 'working tree');
  if (typeof wt === 'string') { return die(wt); }
  if (wt.facts.policy !== 'evidence') { return 0; }
  let refs: PushLine[];
  if (process.stdin.isTTY) {
    const head = resolveCommit(CWD, 'HEAD');
    if (!head) { return die('no HEAD'); }
    const prod = resolveCommit(CWD, `refs/remotes/origin/${wt.facts.production}`) ?? '0'.repeat(40);
    refs = [{ localRef: 'HEAD', localSha: head, remoteRef: `refs/heads/${wt.facts.production}`, remoteSha: prod }];
  }
  else { refs = parseRefs(await Bun.stdin.text()); }
  let failed = false;
  for (const r of refs) {
    if (isZeroOid(r.localSha)) { continue; }
    const base = baseFor(r.localSha, r.remoteSha, wt.facts.production);
    const source = base === EMPTY_TREE ? 'working tree' : base;
    const problems: string[] = [];
    const tried = tryLoad(base === EMPTY_TREE ? treeReader(CWD) : refReader(CWD, base), source);
    const loaded = typeof tried === 'string' ? wt : tried;
    if (typeof tried === 'string') { problems.push(tried); }
    const branch = r.remoteRef.startsWith('refs/heads/') ? r.remoteRef.slice('refs/heads/'.length) : null;
    const isProtected = branch !== null && loaded.facts.protected.includes(branch);
    const head = resolveCommit(CWD, 'HEAD');
    if (head !== r.localSha) { problems.push(`HEAD is ${head?.slice(0, 12) ?? 'unborn'}, the push sends ${r.localSha.slice(0, 12)}: check out the commit you push so the checks run on it`); }
    const dirty = git(CWD, ['status', '--porcelain', '--untracked-files=no']).out.trim();
    if (dirty) { problems.push('tracked files have uncommitted changes: the checks would not run on the pushed commit'); }
    const statics = problems.length === 0
      ? runStatic(loaded.contract.static.filter(s => s.where.includes('pre-push')))
      : loaded.contract.static.filter(s => s.where.includes('pre-push')).map(s => ({ id: s.id, cmd: s.cmd, exit: null, ms: 0, output_sha256: null, ran_at: null, skipped: 'the pushed commit is not the checked-out tree' }));
    const files = changedFiles(CWD, base, r.localSha);
    const agentic = isProtected
      ? verifyAgentic({ cwd: CWD, base, head: r.localSha, loaded, allowedSigners: base === EMPTY_TREE ? null : refReader(CWD, base)(ALLOWED_SIGNERS) })
      : (() => { const d = changeDepth(files, loaded.contract.depth); return emptyAgentic(d.depth, d.reasons, patchId(CWD, base, r.localSha)); })();
    const rec = record({ sha: r.localSha, base, branch, repo: null, remoteRef: r.remoteRef, flow: isProtected ? 'direct' : 'pr', where: 'pre-push', loaded, agentic, statics, ready: null, touches: touches(files, loaded, r.localSha), problems });
    const path = writeRecord(PRIMARY, rec);
    console.log(`edd gate: ${rec.result.toUpperCase()} ${r.localSha.slice(0, 12)} -> ${r.remoteRef} (depth ${rec.contract.depth}). Record: ${path}`);
    for (const p of rec.problems) { console.log(`  - ${p}`); }
    for (const s of rec.static.filter(x => x.exit !== 0 && !x.skipped)) { console.log(`  - ${s.id} exited ${s.exit}: ${s.cmd}`); }
    if (rec.touches_gate.touched) { console.log(`  touches gate files (informational): ${[...rec.touches_gate.paths, ...rec.touches_gate.keys].join(', ')}`); }
    if (rec.result === 'fail') { failed = true; }
  }
  return failed ? 1 : 0;
}

async function attest(): Promise<number> {
  const wt = load(treeReader(CWD), 'working tree');
  const baseRef = flag('--base') ?? `origin/${wt.facts.production}`;
  const base = resolveCommit(CWD, baseRef);
  if (!base) { return die(`base ${baseRef} is not a commit: fetch it or pass --base`); }
  const subject = resolveCommit(CWD, 'HEAD');
  if (!subject) { return die('no HEAD'); }
  if (isEvidenceCommit(CWD, subject)) { return die('HEAD is already an evidence commit: make the code commit first'); }
  if (git(CWD, ['status', '--porcelain', '--untracked-files=no']).out.trim()) { return die('tracked files have uncommitted changes: commit them before attesting'); }
  const raise = flag('--depth');
  if (raise !== null && !(DEPTHS as readonly string[]).includes(raise)) { return die(`--depth must be one of ${DEPTHS.join(', ')}`); }
  const loaded = load(refReader(CWD, base), baseRef);
  for (const w of loaded.warnings) { console.log(`edd: warning: ${w}`); }
  const { depth } = changeDepth(changedFiles(CWD, base, subject), loaded.contract.depth, raise as Depth | null);
  const required = requiredAgentic(loaded.contract.agentic, depth);
  if (required.length === 0) {
    console.log(`edd attest: depth ${depth} requires no agentic evidence; nothing to attest.`);
    return 0;
  }
  const root = artifactsRoot(PRIMARY, subject);
  const { checks, problems } = collectChecks({ root, required, depth, subjectTime: commitTime(CWD, subject), environments: loaded.facts.environments });
  problems.push(...coverageProblems(required, checks, depth), ...testerProblems(checks, authorSessions(CWD, base, subject), depth));
  if (problems.length > 0) {
    console.error(`edd attest: refused for ${subject.slice(0, 12)} at depth ${depth} (artifacts: ${root})`);
    for (const p of [...new Set(problems)]) { console.error(`  - ${p}`); }
    return 1;
  }
  const id = identity();
  const msg = evidenceMessage({ schema: AGENTIC_SCHEMA, subject, patch_id: patchId(CWD, base, subject), depth, contract_digest: loaded.digest, checks }, id.worktree, id.session);
  const dir = mkdtempSync(join(tmpdir(), 'edd-attest-'));
  try {
    const file = join(dir, 'MSG');
    writeFileSync(file, msg);
    const p = Bun.spawnSync(['git', 'commit', '--allow-empty', '-S', '-F', file], { cwd: CWD, stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' });
    if (p.exitCode !== 0) { console.error('edd attest: git commit failed; nothing was created'); return 1; }
  }
  finally { rmSync(dir, { recursive: true, force: true }); }
  console.log(`edd attest: evidence commit ${resolveCommit(CWD, 'HEAD')?.slice(0, 12)} attests ${subject.slice(0, 12)} at depth ${depth}.`);
  return 0;
}

function verifyLocal(): number {
  const wt = load(treeReader(CWD), 'working tree');
  const baseRef = flag('--base') ?? `origin/${wt.facts.production}`;
  const base = resolveCommit(CWD, baseRef);
  const head = resolveCommit(CWD, positional()[0] ?? 'HEAD');
  if (!base || !head) { return die('base or head is not a commit'); }
  const read = refReader(CWD, base);
  const v = verifyAgentic({ cwd: CWD, base, head, loaded: load(read, baseRef), allowedSigners: read(ALLOWED_SIGNERS) });
  console.log(`edd verify: ${v.ok ? 'PASS' : 'FAIL'} depth ${v.depth}, required [${v.required.join(', ')}], evidence ${v.evidenceCommit?.slice(0, 12) ?? 'none'}, signature ${v.signature}`);
  for (const p of v.problems) { console.log(`  - ${p}`); }
  return v.ok ? 0 : 1;
}

const CONVENTIONAL = /^(?:feat|fix|docs|test|refactor|chore|perf|ci|build|style|revert)(?:\([^)]+\))?!?: \S/;

function ghJson(args: string[]): unknown {
  const p = Bun.spawnSync(['gh', 'api', ...args], { cwd: CWD, stdout: 'pipe', stderr: 'pipe', env: process.env });
  if (p.exitCode !== 0) { return null; }
  try { return JSON.parse(p.stdout.toString()); }
  catch { return null; }
}

interface PullRequestEvent {
  number: number
  title?: string
  body?: string | null
  assignees?: unknown[]
  base: { sha: string, ref: string }
  head: { sha: string, ref: string }
}

const THREADS_QUERY = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved comments(first:1){nodes{author{login}}}}}}}}';

function readyState(pr: PullRequestEvent, repo: string, loaded: LoadedContract, problems: string[]): ReadyState {
  const [owner, name] = repo.split('/');
  const res = ghJson(['graphql', '-f', `query=${THREADS_QUERY}`, '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${pr.number}`]) as { data?: { repository?: { pullRequest?: { reviewThreads?: { nodes?: { isResolved: boolean, comments?: { nodes?: { author?: { login?: string } }[] } }[] } } } } } | null;
  const threads = res?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? null;
  const open = threads === null ? null : threads.filter(t => !t.isResolved);
  const bot = loaded.contract.review.bot;
  let botReview = 'n/a';
  if (bot) {
    const reviews = ghJson([`repos/${repo}/pulls/${pr.number}/reviews?per_page=100`]) as { user?: { login?: string }, state?: string }[] | null;
    const last = Array.isArray(reviews) ? reviews.filter(r => r.user?.login === bot).at(-1) : undefined;
    const botOpen = open?.some(t => t.comments?.nodes?.[0]?.author?.login === bot) ?? true;
    botReview = last && last.state !== 'CHANGES_REQUESTED' && !botOpen ? 'clean' : 'dirty';
  }
  const title = pr.title ?? '';
  const key = pr.head.ref.match(/[A-Z][A-Z0-9]+-\d+/)?.[0] ?? null;
  const state: ReadyState = {
    threads_open: open === null ? null : open.length,
    bot_review: botReview,
    assignee: Array.isArray(pr.assignees) && pr.assignees.length > 0,
    tracker_link: key === null || (pr.body ?? '').includes(key),
    title_ok: CONVENTIONAL.test(title) && title.length < 70,
  };
  if (state.threads_open === null) { problems.push('review threads could not be read (gh api graphql)'); }
  else if (state.threads_open > 0) { problems.push(`${state.threads_open} review thread(s) are not resolved`); }
  if (botReview === 'dirty') { problems.push(`the review bot ${bot} has not left a clean review`); }
  if (!state.assignee) { problems.push('the PR has no assignee'); }
  if (!state.tracker_link) { problems.push(`the branch names ${key}, the PR body does not link it`); }
  if (!state.title_ok) { problems.push('the PR title is not a conventional title under 70 characters'); }
  return state;
}

function upsertComment(repo: string, number: number, body: string): void {
  const list = ghJson([`repos/${repo}/issues/${number}/comments?per_page=100`]) as { id: number, body?: string, user?: { login?: string } }[] | null;
  const mine = Array.isArray(list) ? list.find(c => c.user?.login === 'github-actions[bot]' && (c.body ?? '').startsWith(RENDER_MARKER)) : undefined;
  const args = mine
    ? ['-X', 'PATCH', `repos/${repo}/issues/comments/${mine.id}`, '-f', `body=${body}`]
    : ['-X', 'POST', `repos/${repo}/issues/${number}/comments`, '-f', `body=${body}`];
  if (ghJson(args) === null) { console.log('edd: warning: the PR comment could not be written'); }
}

function verifyCi(): number {
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) { return die('verify --ci needs GITHUB_EVENT_PATH (run it inside GitHub Actions)'); }
  const ev = JSON.parse(readFileSync(eventPath, 'utf8')) as { pull_request?: PullRequestEvent, before?: string, after?: string, ref?: string, repository?: { full_name?: string, default_branch?: string } };
  const repo = ev.repository?.full_name ?? null;
  const problems: string[] = [];
  let base: string;
  let head: string;
  let branch: string | null;
  let flow: EvidenceRecord['push']['flow'];
  let pr: PullRequestEvent | null = null;
  if (eventName === 'pull_request_target' && ev.pull_request) {
    pr = ev.pull_request;
    base = pr.base.sha;
    head = pr.head.sha;
    branch = pr.head.ref;
    if (!isCommit(CWD, base)) { return die(`the base commit ${base} is not in the checkout (fetch-depth 0)`); }
    if (!isCommit(CWD, head)) { return die(`the PR head ${head} is not fetched: fetch refs/pull/${pr.number}/head as data first`); }
    flow = 'pr';
  }
  else if (eventName === 'push' && ev.after && ev.ref) {
    head = ev.after;
    branch = ev.ref.startsWith('refs/heads/') ? ev.ref.slice('refs/heads/'.length) : null;
    const before = ev.before ?? '';
    const prod = ev.repository?.default_branch ?? 'main';
    base = !isZeroOid(before) && isCommit(CWD, before) ? before : ((resolveCommit(CWD, `refs/remotes/origin/${prod}`) && mergeBase(CWD, head, `refs/remotes/origin/${prod}`)) ?? EMPTY_TREE);
    flow = 'direct';
  }
  else { return die(`verify --ci handles pull_request_target and push, not ${eventName || 'no event'}`); }
  const read = base === EMPTY_TREE ? refReader(CWD, head) : refReader(CWD, base);
  const loaded = load(read, base === EMPTY_TREE ? head : base);
  if (pr && pr.base.ref !== loaded.facts.production) { flow = 'chain'; }
  if (eventName === 'push' && (branch === null || !loaded.facts.protected.includes(branch))) {
    console.log(`edd verify: ${ev.ref} is not a protected branch in the base contract; nothing to verify.`);
    return 0;
  }
  if (eventName === 'push' && loaded.facts.policy !== 'evidence') {
    console.log(`edd verify: direct_push_to_protected is ${loaded.facts.policy ?? 'unset'} at the base, not evidence; a direct push carries no evidence to verify.`);
    return 0;
  }
  const agentic = verifyAgentic({ cwd: CWD, base, head, loaded, allowedSigners: base === EMPTY_TREE ? null : read(ALLOWED_SIGNERS) });
  const ready = pr && repo ? readyState(pr, repo, loaded, problems) : null;
  const rec = record({ sha: head, base, branch, repo, remoteRef: pr ? `refs/heads/${pr.base.ref}` : (ev.ref ?? null), flow, where: 'ci', loaded, agentic, statics: [], ready, touches: touches(changedFiles(CWD, base, head), loaded, head), problems });
  const path = writeRecord(PRIMARY, rec);
  const md = renderMarkdown(rec);
  console.log(`edd verify --ci: ${rec.result.toUpperCase()} ${head.slice(0, 12)}. Record: ${path}`);
  for (const p of rec.problems) { console.log(`  - ${p}`); }
  if (process.env.GITHUB_STEP_SUMMARY) { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`); }
  if (pr && repo && process.env.GH_TOKEN) { upsertComment(repo, pr.number, md); }
  return rec.result === 'pass' ? 0 : 1;
}

function render(): number {
  const ref = positional()[0] ?? 'HEAD';
  const sha = resolveCommit(CWD, ref);
  if (!sha) { return die(`${ref} is not a commit`); }
  const rec = readRecord(PRIMARY, sha);
  if (!rec) { return die(`no evidence record for ${sha.slice(0, 12)}: the pre-push gate writes it on push`); }
  console.log(renderMarkdown(rec));
  return 0;
}

function prune(): number {
  const wt = load(treeReader(CWD), 'working tree');
  const raw = flag('--days');
  const days = raw === null ? wt.contract.record.artifact_retention_days : Number(raw);
  if (!Number.isFinite(days) || days < 0) { return die('--days must be a non-negative number'); }
  const dry = has('--dry-run');
  const r = pruneArtifacts(PRIMARY, days, Date.now(), dry);
  console.log(`edd prune: ${dry ? 'would delete' : 'deleted'} ${r.deleted.length} artifact folder(s) older than ${days} day(s), kept ${r.kept.length}; records are never deleted.`);
  for (const d of r.deleted) { console.log(`  - ${d}`); }
  return 0;
}

function check(): number {
  const id = positional()[0];
  if (!id) { return die('check needs a static check id'); }
  const wt = load(treeReader(CWD), 'working tree');
  if (!wt.declared) {
    console.log(`edd check: .agents/project.yaml declares no evidence: block; ${id} has nothing to run.`);
    return 0;
  }
  const s = wt.contract.static.find(c => c.id === id && c.where.includes('ci'));
  if (!s) {
    console.log(`edd check: ${id} is not a ci check of the evidence contract; nothing to run.`);
    return 0;
  }
  console.log(`edd check ${id}: ${s.cmd}`);
  const p = Bun.spawnSync(['sh', '-c', s.cmd], { cwd: CWD, stdout: 'inherit', stderr: 'inherit', env: process.env });
  return p.exitCode ?? 1;
}

async function main(): Promise<number> {
  switch (cmd) {
    case 'attest': return attest();
    case 'gate': return gate();
    case 'verify': return has('--ci') ? verifyCi() : verifyLocal();
    case 'render': return render();
    case 'prune': return prune();
    case 'check': return check();
    case undefined:
    case '--help':
    case '-h':
      console.log(USAGE);
      return cmd === undefined ? 1 : 0;
    default:
      console.error(`edd: unknown command ${cmd}\n${USAGE}`);
      return 1;
  }
}

process.exit(await main());
