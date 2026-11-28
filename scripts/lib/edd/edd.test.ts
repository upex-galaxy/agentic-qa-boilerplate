import type { AttestedCheck } from './attest.ts';
import type { Repo } from './fixture.ts';

import type { EvidenceRecord } from './record.ts';

import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { AGENTIC_SCHEMA, collectChecks, evidenceMessage, parseEvidenceMessage } from './attest.ts';
import { contractDigest, ContractError, gateKeysTouched, loadContract, readProjectDoc, refReader, sha256, treeReader } from './contract.ts';
import { changeDepth, gatePathsTouched, requiredAgentic } from './depth.ts';
import { makeRepo, projectYaml } from './fixture.ts';
import { primaryRoot } from './git.ts';
import { patchId } from './patch-id.ts';
import { pruneArtifacts, readRecord, renderMarkdown, writeRecord } from './record.ts';
import { checkSignature, verifyAgentic } from './verify.ts';

const repos: Repo[] = [];
function repo(): Repo {
  const r = makeRepo();
  repos.push(r);
  return r;
}
afterEach(() => {
  while (repos.length > 0) { repos.pop()?.cleanup(); }
});

const CONTRACT = `evidence:
  static:
    - { id: lint, cmd: 'true', where: [pre-push, ci] }
  agentic:
    - { id: screens, kind: screenshots, tool: playwright-cli, envs: [local, staging], min_depth: light }
    - { id: specs, kind: test-run, tool: playwright, envs: [staging], min_depth: standard }
  depth:
    default: none
    rules:
      - { paths: ['**/*.md'], depth: none }
      - { paths: ['app/**'], depth: light }
      - { paths: ['tests/**'], depth: standard }
      - { paths: ['tests/fixtures/**'], depth: deep }
  human:
    paths: ['.github/workflows/**', 'scripts/edd.ts']
    keys: [evidence, git_strategy.policy]
`;

const VALID = (): { signature: 'valid', signer: string } => ({ signature: 'valid', signer: 'SHA256:test' });

function attestCommit(r: Repo, base: string, opts: { depth: string, checks: AttestedCheck[], digest: string, session?: string }): string {
  const subject = r.git('rev-parse', 'HEAD');
  const msg = evidenceMessage({ schema: AGENTIC_SCHEMA, subject, patch_id: patchId(r.dir, base, subject), depth: opts.depth as 'light', contract_digest: opts.digest, checks: opts.checks }, 'primary', opts.session ?? 'tester-1');
  const file = join(r.dir, '..', 'MSG');
  writeFileSync(file, msg);
  r.git('commit', '-q', '--allow-empty', '-F', file);
  return r.git('rev-parse', 'HEAD');
}

const pass = (id: string, env: string, by = 'tester-1'): AttestedCheck => ({ id, verdict: 'pass', verdict_by: by, env, artifacts: [{ path: 'a.png', sha256: 'x', bytes: 1 }] });

function setup(): { r: Repo, base: string, digest: string } {
  const r = repo();
  const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(CONTRACT), 'README.md': 'x\n' });
  return { r, base, digest: loadContract(treeReader(r.dir), 'wt').digest };
}

describe('contract', () => {
  test('a missing evidence block falls back to the package.json keys that exist and depth none', () => {
    const r = repo();
    r.commit('chore: init', { '.agents/project.yaml': projectYaml(''), 'package.json': JSON.stringify({ scripts: { 'format:check': 'x', 'lint:check': 'y', 'test': 'playwright test' } }) });
    const c = loadContract(treeReader(r.dir), 'wt');
    expect(c.declared).toBe(false);
    expect(c.contract.static.map(s => [s.id, s.cmd])).toEqual([['format', 'bun run format:check'], ['lint', 'bun run lint:check']]);
    expect(c.contract.depth.default).toBe('none');
    expect(c.contract.human.paths).toContain('scripts/edd.ts');
  });

  test('fragments merge in include order, the project wins by id, a missing fragment only warns', () => {
    const r = repo();
    r.commit('chore: init', {
      '.agents/project.yaml': projectYaml(`evidence:
  include: [alpha, ghost]
  static:
    - { id: lint, cmd: project-lint, where: [pre-push] }
  depth:
    rules:
      - { paths: ['a/**'], depth: light }
`),
      '.agents/skills/alpha/evidence.yaml': `static:
  - { id: lint, cmd: fragment-lint, where: [ci] }
  - { id: extra, cmd: fragment-extra, where: [ci] }
depth:
  rules:
    - { paths: ['a/**'], depth: deep }
`,
    });
    const c = loadContract(treeReader(r.dir), 'wt');
    expect(c.contract.static).toEqual([{ id: 'lint', cmd: 'project-lint', where: ['pre-push'] }, { id: 'extra', cmd: 'fragment-extra', where: ['ci'] }]);
    expect(c.contract.depth.rules[0].depth).toBe('light');
    expect(c.warnings.join(' ')).toContain('ghost');
  });

  test('an invalid entry is a contract error, never a silent skip', () => {
    const r = repo();
    r.commit('chore: init', { '.agents/project.yaml': projectYaml('evidence:\n  static:\n    - { id: lint }\n') });
    expect(() => loadContract(treeReader(r.dir), 'wt')).toThrow(ContractError);
  });

  test('the digest ignores key order', () => {
    const { contract } = loadContract((p: string) => (p === '.agents/project.yaml' ? projectYaml(CONTRACT) : null), 'x');
    const shuffled = JSON.parse(JSON.stringify({ record: contract.record, review: contract.review, human: contract.human, depth: contract.depth, agentic: contract.agentic, static: contract.static, include: contract.include }));
    expect(contractDigest(shuffled)).toBe(contractDigest(contract));
  });

  test('the contract is read from the base ref, not from the working tree the PR edits', () => {
    const { r, base, digest } = setup();
    r.commit('chore: weaken', { '.agents/project.yaml': projectYaml('evidence:\n  depth:\n    default: none\n') });
    const atBase = loadContract(refReader(r.dir, base), base);
    expect(atBase.digest).toBe(digest);
    expect(loadContract(treeReader(r.dir), 'wt').digest).not.toBe(digest);
  });

  test('gateKeysTouched names the gate keys whose value changed', () => {
    const before = readProjectDoc(() => projectYaml(CONTRACT));
    const after = readProjectDoc(() => projectYaml(CONTRACT, 'allowed'));
    expect(gateKeysTouched(before, after, ['evidence', 'git_strategy.policy'])).toEqual(['git_strategy.policy']);
  });
});

describe('depth', () => {
  const cfg = loadContract(() => projectYaml(CONTRACT), 'x').contract;

  test('each file takes its first matching rule and the change takes the max', () => {
    const d = changeDepth(['README.md', 'app/page.ts', 'tests/e2e/x.spec.ts'], cfg.depth);
    expect(d.depth).toBe('standard');
    expect(d.reasons).toEqual(['tests/e2e/x.spec.ts -> rule 3 (standard)']);
    expect(changeDepth(['tests/fixtures/f.ts'], cfg.depth).depth).toBe('standard');
    expect(changeDepth(['docs/x.md'], cfg.depth).depth).toBe('none');
  });

  test('--depth only raises', () => {
    expect(changeDepth(['app/x.ts'], cfg.depth, 'deep').depth).toBe('deep');
    expect(changeDepth(['tests/x.ts'], cfg.depth, 'light').depth).toBe('standard');
  });

  test('required agentic checks follow min_depth, none at depth none', () => {
    expect(requiredAgentic(cfg.agentic, 'none')).toEqual([]);
    expect(requiredAgentic(cfg.agentic, 'light').map(c => c.id)).toEqual(['screens']);
    expect(requiredAgentic(cfg.agentic, 'standard').map(c => c.id)).toEqual(['screens', 'specs']);
  });

  test('gate paths are matched for the record only', () => {
    expect(gatePathsTouched(['.github/workflows/ci.yml', 'app/x.ts'], cfg.human.paths)).toEqual(['.github/workflows/ci.yml']);
  });
});

describe('evidence message', () => {
  test('round-trips and the digest trailer hashes the JSON line', () => {
    const payload = { schema: AGENTIC_SCHEMA, subject: 'a'.repeat(40), patch_id: 'b'.repeat(40), depth: 'light' as const, contract_digest: 'sha256:c', checks: [pass('screens', 'local')] };
    const msg = evidenceMessage(payload, 'wt', 'sess');
    expect(msg.split('\n')[0]).toBe('test(evidence): attest aaaaaaa light');
    expect(msg.trimEnd().split('\n').slice(-2)).toEqual(['Worktree: wt', 'Session: sess']);
    const parsed = parseEvidenceMessage(msg);
    expect(parsed?.payload).toEqual(payload);
    expect(parsed?.digest).toBe(`sha256:${sha256(parsed?.line ?? '')}`);
    expect(parseEvidenceMessage('feat: x\n\n{"schema":"edd-agentic/1"}')).toBeNull();
  });
});

describe('verifyAgentic', () => {
  test('a docs-only change needs no evidence', () => {
    const { r, base } = setup();
    const head = r.commit('docs: x', { 'docs/a.md': 'y\n' });
    const v = verifyAgentic({ cwd: r.dir, base, head, loaded: loadContract(refReader(r.dir, base), base), allowedSigners: null });
    expect(v).toMatchObject({ ok: true, depth: 'none', evidenceCommit: null });
  });

  test('a change that needs agentic evidence and has none fails', () => {
    const { r, base } = setup();
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    const v = verifyAgentic({ cwd: r.dir, base, head, loaded: loadContract(refReader(r.dir, base), base), allowedSigners: null });
    expect(v.ok).toBe(false);
    expect(v.problems[0]).toContain('no evidence commit');
  });

  test('empty-commit binding: a valid evidence commit passes, one that changes the tree fails', () => {
    const { r, base, digest } = setup();
    r.commit('feat: x', { 'app/a.ts': '1\n' });
    const head = attestCommit(r, base, { depth: 'light', checks: [pass('screens', 'local')], digest });
    const loaded = loadContract(refReader(r.dir, base), base);
    expect(verifyAgentic({ cwd: r.dir, base, head, loaded, allowedSigners: null, signatureOf: VALID })).toMatchObject({ ok: true, evidenceCommit: head, signature: 'valid' });
    const r2 = setup();
    r2.r.commit('feat: x', { 'app/a.ts': '1\n' });
    const subject = r2.r.git('rev-parse', 'HEAD');
    const msg = evidenceMessage({ schema: AGENTIC_SCHEMA, subject, patch_id: patchId(r2.r.dir, r2.base, subject), depth: 'light', contract_digest: r2.digest, checks: [pass('screens', 'local')] }, 'primary', 'tester-1');
    r2.r.write('app/b.ts', 'smuggled\n');
    r2.r.git('add', '-A');
    writeFileSync(join(r2.r.dir, '..', 'MSG'), msg);
    r2.r.git('commit', '-q', '-F', join(r2.r.dir, '..', 'MSG'));
    const bad = verifyAgentic({ cwd: r2.r.dir, base: r2.base, head: r2.r.git('rev-parse', 'HEAD'), loaded: loadContract(refReader(r2.r.dir, r2.base), r2.base), allowedSigners: null, signatureOf: VALID });
    expect(bad.ok).toBe(false);
    expect(bad.problems.join(' ')).toContain('not empty');
  });

  test('patch-id carry-forward: a rebase onto a moved base keeps the evidence, a code change voids it', () => {
    const { r, base, digest } = setup();
    r.git('checkout', '-q', '-b', 'feat');
    r.commit('feat: x', { 'app/a.ts': '1\n' });
    attestCommit(r, base, { depth: 'light', checks: [pass('screens', 'local')], digest });
    r.git('checkout', '-q', 'main');
    const moved = r.commit('docs: unrelated', { 'docs/z.md': 'z\n' });
    r.git('checkout', '-q', 'feat');
    r.git('rebase', '-q', '--empty=keep', 'main');
    const head = r.git('rev-parse', 'HEAD');
    const loaded = loadContract(refReader(r.dir, moved), moved);
    const ok = verifyAgentic({ cwd: r.dir, base: moved, head, loaded, allowedSigners: null, signatureOf: VALID });
    expect(ok.problems).toEqual([]);
    expect(ok.ok).toBe(true);
    const parsed = parseEvidenceMessage(r.git('log', '-1', '--format=%B', head));
    expect(parsed?.subject).not.toBe(r.git('rev-parse', 'HEAD^'));
    r.commit('fix: later', { 'app/a.ts': '2\n' });
    const voided = verifyAgentic({ cwd: r.dir, base: moved, head: r.git('rev-parse', 'HEAD'), loaded, allowedSigners: null, signatureOf: VALID });
    expect(voided.ok).toBe(false);
    expect(voided.problems.join(' ')).toContain('patch id');
  });

  test('evidence attested against another contract than the base one fails', () => {
    const { r, base } = setup();
    r.commit('feat: x', { 'app/a.ts': '1\n' });
    const head = attestCommit(r, base, { depth: 'light', checks: [pass('screens', 'local')], digest: 'sha256:weaker' });
    const v = verifyAgentic({ cwd: r.dir, base, head, loaded: loadContract(refReader(r.dir, base), base), allowedSigners: null, signatureOf: VALID });
    expect(v.problems.join(' ')).toContain('re-attest');
  });

  test('the attested depth must cover the recomputed depth (depth max)', () => {
    const { r, base, digest } = setup();
    r.commit('test: x', { 'app/a.ts': '1\n', 'tests/x.spec.ts': '1\n' });
    const head = attestCommit(r, base, { depth: 'light', checks: [pass('screens', 'local'), pass('specs', 'staging')], digest });
    const v = verifyAgentic({ cwd: r.dir, base, head, loaded: loadContract(refReader(r.dir, base), base), allowedSigners: null, signatureOf: VALID });
    expect(v.depth).toBe('standard');
    expect(v.problems.join(' ')).toContain('attested depth light is below the change\'s depth standard');
  });

  test('author == tester is rejected at standard, allowed at light', () => {
    const { r, base, digest } = setup();
    r.git('commit', '-q', '--allow-empty', '-m', 'chore: noop\n\nWorktree: primary\nSession: author-7');
    r.commit('test: x\n\nWorktree: primary\nSession: author-7', { 'tests/x.spec.ts': '1\n' });
    const head = attestCommit(r, base, { depth: 'standard', checks: [pass('screens', 'local', 'author-7'), pass('specs', 'staging', 'tester-2')], digest });
    const v = verifyAgentic({ cwd: r.dir, base, head, loaded: loadContract(refReader(r.dir, base), base), allowedSigners: null, signatureOf: VALID });
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toContain('is the author session author-7');
    const l = setup();
    l.r.commit('feat: x\n\nSession: author-7', { 'app/a.ts': '1\n' });
    const lh = attestCommit(l.r, l.base, { depth: 'light', checks: [pass('screens', 'local', 'author-7')], digest: l.digest });
    expect(verifyAgentic({ cwd: l.r.dir, base: l.base, head: lh, loaded: loadContract(refReader(l.r.dir, l.base), l.base), allowedSigners: null, signatureOf: VALID }).ok).toBe(true);
  });

  test('at standard a code commit without a Session trailer cannot prove the tester differs', () => {
    const { r, base, digest } = setup();
    r.commit('test: x', { 'tests/x.spec.ts': '1\n' });
    const head = attestCommit(r, base, { depth: 'standard', checks: [pass('screens', 'local'), pass('specs', 'staging')], digest });
    const v = verifyAgentic({ cwd: r.dir, base, head, loaded: loadContract(refReader(r.dir, base), base), allowedSigners: null, signatureOf: VALID });
    expect(v.problems.join(' ')).toContain('has no Session trailer');
  });

  test('a tester label that contains the author label is another session', () => {
    const { r, base, digest } = setup();
    r.commit('test: x\n\nSession: author-7', { 'tests/x.spec.ts': '1\n' });
    const head = attestCommit(r, base, { depth: 'standard', checks: [pass('screens', 'local', 'author-7/tester'), pass('specs', 'staging', 'author-7/tester')], digest });
    expect(verifyAgentic({ cwd: r.dir, base, head, loaded: loadContract(refReader(r.dir, base), base), allowedSigners: null, signatureOf: VALID }).ok).toBe(true);
  });

  test('a whitespace-only change after attest voids the evidence (patch-id --verbatim)', () => {
    const { r, base, digest } = setup();
    r.commit('feat: x', { 'app/a.py': 'if ok:\n    go()\n' });
    attestCommit(r, base, { depth: 'light', checks: [pass('screens', 'local')], digest });
    const head = r.commit('style: dedent', { 'app/a.py': 'if ok:\n  pass\ngo()\n'.replace('  pass\n', '    pass\n') });
    const v = verifyAgentic({ cwd: r.dir, base, head, loaded: loadContract(refReader(r.dir, base), base), allowedSigners: null, signatureOf: VALID });
    expect(v.problems.join(' ')).toContain('patch id');
    const ws = setup();
    ws.r.commit('feat: x', { 'app/b.py': 'a = 1\n' });
    attestCommit(ws.r, ws.base, { depth: 'light', checks: [pass('screens', 'local')], digest: ws.digest });
    const wsHead = ws.r.commit('style: spaces', { 'app/b.py': 'a  =  1\n' });
    expect(verifyAgentic({ cwd: ws.r.dir, base: ws.base, head: wsHead, loaded: loadContract(refReader(ws.r.dir, ws.base), ws.base), allowedSigners: null, signatureOf: VALID }).ok).toBe(false);
  });

  test('depth deep needs a pass on every env of the check', () => {
    const { r, base, digest } = setup();
    r.commit('test: x', { 'app/a.ts': '1\n' });
    const head = attestCommit(r, base, { depth: 'deep', checks: [pass('screens', 'local'), pass('specs', 'staging')], digest });
    const v = verifyAgentic({ cwd: r.dir, base, head, loaded: { ...loadContract(refReader(r.dir, base), base) }, allowedSigners: null, signatureOf: VALID });
    expect(v.ok).toBe(true);
    const deepFile = setup();
    deepFile.r.commit('test: f', { 'tests/fixtures/f.ts': '1\n' });
    const loaded = loadContract(refReader(deepFile.r.dir, deepFile.base), deepFile.base);
    loaded.contract.depth.rules = [{ paths: ['tests/fixtures/**'], depth: 'deep' }];
    const dh = attestCommit(deepFile.r, deepFile.base, { depth: 'deep', checks: [pass('screens', 'local'), pass('specs', 'staging')], digest: loaded.digest });
    const dv = verifyAgentic({ cwd: deepFile.r.dir, base: deepFile.base, head: dh, loaded, allowedSigners: null, signatureOf: VALID });
    expect(dv.problems.join(' ')).toContain('depth deep needs a pass on staging');
  });

  test('an unsigned evidence commit is reported against the allowed signers', () => {
    const { r, base, digest } = setup();
    r.commit('feat: x', { 'app/a.ts': '1\n' });
    const head = attestCommit(r, base, { depth: 'light', checks: [pass('screens', 'local')], digest });
    expect(checkSignature(r.dir, head, null).signature).toBe('invalid');
    expect(checkSignature(r.dir, head, 'test@example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGtestkeynotreal\n').signature).toBe('absent');
    const v = verifyAgentic({ cwd: r.dir, base, head, loaded: loadContract(refReader(r.dir, base), base), allowedSigners: 'x' });
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toContain('signature is absent');
  });

  test('touching a gate path changes no verdict (E4 = C)', () => {
    const { r, base, digest } = setup();
    r.commit('ci: x', { '.github/workflows/ci.yml': 'x\n', 'app/a.ts': '1\n' });
    const head = attestCommit(r, base, { depth: 'light', checks: [pass('screens', 'local')], digest });
    const loaded = loadContract(refReader(r.dir, base), base);
    expect(verifyAgentic({ cwd: r.dir, base, head, loaded, allowedSigners: null, signatureOf: VALID }).ok).toBe(true);
    expect(gatePathsTouched(['.github/workflows/ci.yml'], loaded.contract.human.paths)).toHaveLength(1);
  });
});

describe('collectChecks', () => {
  function art(root: string, rel: string, body = 'x'): string {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, body);
    return p;
  }
  const required = loadContract(() => projectYaml(CONTRACT), 'x').contract.agentic;
  const envs = { local: { web_url: 'http://localhost:3000' }, staging: { web_url: 'https://staging.example.com' } };

  test('hashes artifacts of the right kind and reads the verdict', () => {
    const r = repo();
    const root = join(r.dir, '..', 'art');
    art(root, 'screens/local/home.png', 'png');
    art(root, 'screens/local/verdict.json', JSON.stringify({ verdict: 'pass', verdict_by: 'tester-1', claim: 'home renders' }));
    const { checks, problems } = collectChecks({ root, required: [required[0]], depth: 'light', subjectTime: 0, environments: envs });
    expect(problems).toEqual([]);
    expect(checks).toEqual([{ id: 'screens', verdict: 'pass', verdict_by: 'tester-1', env: 'local', claim: 'home renders', artifacts: [{ path: 'home.png', sha256: sha256('png'), bytes: 3 }] }]);
  });

  test('--tester supplies verdict_by when verdict.json names none, and must agree when it does', () => {
    const r = repo();
    const root = join(r.dir, '..', 'art');
    art(root, 'screens/local/home.png', 'png');
    art(root, 'screens/local/verdict.json', JSON.stringify({ verdict: 'pass' }));
    const none = collectChecks({ root, required: [required[0]], depth: 'light', subjectTime: 0, environments: envs });
    expect(none.problems.join(' ')).toContain('unless attest gets --tester');
    const flagged = collectChecks({ root, required: [required[0]], depth: 'light', subjectTime: 0, environments: envs, tester: 'author-7/tester' });
    expect(flagged.problems).toEqual([]);
    expect(flagged.checks[0].verdict_by).toBe('author-7/tester');
    art(root, 'screens/local/verdict.json', JSON.stringify({ verdict: 'pass', verdict_by: 'someone-else' }));
    const clash = collectChecks({ root, required: [required[0]], depth: 'light', subjectTime: 0, environments: envs, tester: 'author-7/tester' });
    expect(clash.problems.join(' ')).toContain('--tester says');
  });

  test('refuses a missing verdict, a wrong kind, a stale file and a trace on another host', () => {
    const r = repo();
    const root = join(r.dir, '..', 'art');
    art(root, 'screens/local/notes.txt');
    const stale = art(root, 'screens/staging/old.png');
    utimesSync(stale, 1, 1);
    art(root, 'screens/staging/verdict.json', JSON.stringify({ verdict: 'pass', verdict_by: 't' }));
    art(root, 'specs/staging/trace.zip');
    art(root, 'specs/staging/verdict.json', JSON.stringify({ verdict: 'pass', verdict_by: 't' }));
    const { problems } = collectChecks({ root, required, depth: 'deep', subjectTime: 1000, environments: envs, hosts: () => ['evil.example.com'] });
    const all = problems.join('\n');
    expect(all).toContain('screens/local: verdict.json is missing');
    expect(all).toContain('old.png is older than the subject commit');
    expect(all).toContain('never calls staging.example.com');
  });
});

describe('record', () => {
  const rec = (sha: string, written = new Date().toISOString()): EvidenceRecord => ({
    schema: 'edd-evidence/1',
    subject: { sha, tree: 't', patch_id: 'p', base: 'b', branch: 'main', repo: null },
    push: { remote_ref: 'refs/heads/main', flow: 'direct', where: 'pre-push' },
    contract: { digest: 'sha256:abc', read_from: 'b', declared: true, depth: 'none', depth_reasons: [], warnings: [] },
    static: [{ id: 'lint', cmd: 'a | b', exit: 1, ms: 10, output_sha256: 'h', ran_at: written }],
    agentic: { required: [], evidence_commit: null, signature: 'absent', signer: null, checks: [] },
    ready: null,
    touches_gate: { touched: true, paths: ['.husky/pre-push'], keys: [] },
    problems: [],
    producer: { script_sha256: null, worktree: 'primary', session: 's' },
    result: 'fail',
    written_at: written,
  });

  test('records land at the primary root, also from a linked worktree', () => {
    const r = repo();
    r.commit('chore: init');
    const wt = join(r.dir, '..', 'wt');
    r.git('worktree', 'add', '-q', wt);
    expect(primaryRoot(wt)).toBe(primaryRoot(r.dir));
    const path = writeRecord(primaryRoot(wt), rec('abc'));
    expect(path.startsWith(join(primaryRoot(r.dir), '.session', 'evidence'))).toBe(true);
  });

  test('a second record for the same sha keeps the first', () => {
    const r = repo();
    writeRecord(r.dir, rec('abc', '2026-01-01T00:00:00.000Z'));
    writeRecord(r.dir, rec('abc', '2026-01-02T00:00:00.000Z'));
    const files = readdirSync(join(r.dir, '.session', 'evidence')).sort();
    expect(files).toEqual(['abc.20260101T000000000Z.json', 'abc.json']);
    expect(readRecord(r.dir, 'abc')?.written_at).toBe('2026-01-02T00:00:00.000Z');
  });

  test('prune deletes old artifact folders and never a record', () => {
    const r = repo();
    const ev = join(r.dir, '.session', 'evidence');
    writeRecord(r.dir, rec('old', '2020-01-01T00:00:00.000Z'));
    mkdirSync(join(ev, 'artifacts', 'old'), { recursive: true });
    writeFileSync(join(ev, 'artifacts', 'old', 'trace.zip'), 'z');
    utimesSync(join(ev, 'artifacts', 'old', 'trace.zip'), 1, 1);
    utimesSync(join(ev, 'artifacts', 'old'), 1, 1);
    mkdirSync(join(ev, 'artifacts', 'new'), { recursive: true });
    const dry = pruneArtifacts(r.dir, 30, Date.now(), true);
    expect(dry.deleted).toEqual(['old']);
    expect(existsSync(join(ev, 'artifacts', 'old'))).toBe(true);
    const done = pruneArtifacts(r.dir, 30, Date.now(), false);
    expect(done).toEqual({ deleted: ['old'], kept: ['new'] });
    expect(existsSync(join(ev, 'artifacts', 'old'))).toBe(false);
    expect(existsSync(join(ev, 'old.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(ev, 'old.json'), 'utf8')).result).toBe('fail');
  });

  test('the rendered block carries the gate line and escapes table cells', () => {
    const md = renderMarkdown(rec('abc'));
    expect(md).toContain('## Evidence');
    expect(md).toContain('Touches gate files: yes (.husky/pre-push). Informational only');
    expect(md).toContain('a &#124; b');
    expect(md).toContain('it does not stop an agent that deliberately forges a check');
  });
});
