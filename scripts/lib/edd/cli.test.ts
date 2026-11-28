import type { Repo } from './fixture.ts';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';

import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { fakeKey, makeRepo, projectYaml } from './fixture.ts';

const EDD = resolve(import.meta.dir, '..', '..', 'edd.ts');
const GATES = resolve(import.meta.dir, '..', '..', '..', '.husky', 'framework-gates.sh');

const ME = fakeKey('me');
const repos: Repo[] = [];
afterEach(() => {
  while (repos.length > 0) { repos.pop()?.cleanup(); }
});

function contract(cmd: string): string {
  return `evidence:
  static:
    - { id: lint, cmd: '${cmd}', where: [pre-push, ci] }
    - { id: never, cmd: 'exit 3', where: [ci] }
  depth:
    default: none
`;
}

function fixture(policy: string): { r: Repo, base: string } {
  const r = makeRepo();
  repos.push(r);
  const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(contract('test -f ok.txt'), policy) });
  r.git('update-ref', 'refs/remotes/origin/main', base);
  return { r, base };
}

function run(cwd: string, args: string[], stdin = ''): { code: number, out: string } {
  const p = Bun.spawnSync(['bun', EDD, ...args], { cwd, stdin: Buffer.from(stdin), stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: `${p.stdout.toString()}${p.stderr.toString()}` };
}

function ciPush(r: Repo, before: string, after: string, ref = 'refs/heads/main'): { code: number, out: string } {
  const path = join(r.dir, '..', 'push-event.json');
  writeFileSync(path, JSON.stringify({ before, after, ref, repository: { full_name: 'o/r', default_branch: 'main' } }));
  const p = Bun.spawnSync(['bun', EDD, 'verify', '--ci'], { cwd: r.dir, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: path, GITHUB_STEP_SUMMARY: '', GH_TOKEN: '' } });
  return { code: p.exitCode ?? 1, out: `${p.stdout.toString()}${p.stderr.toString()}` };
}

function records(dir: string): string[] {
  const ev = join(dir, '.session', 'evidence');
  return existsSync(ev) ? readdirSync(ev).filter(f => f.endsWith('.json')) : [];
}

describe('edd gate', () => {
  test('policy evidence: a failing check refuses the push and writes a fail record', () => {
    const { r, base } = fixture('evidence');
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec).toMatchObject({ schema: 'edd-evidence/1', result: 'fail', push: { where: 'pre-push', flow: 'direct' }, contract: { read_from: base } });
    expect(rec.static.map((s: { id: string, exit: number }) => [s.id, s.exit])).toEqual([['lint', 1]]);
  });

  test('policy evidence: a passing run writes a pass record', () => {
    const { r, base } = fixture('evidence');
    const head = r.commit('feat: x', { 'ok.txt': '1\n' });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.out).toContain('edd gate: PASS');
    expect(res.code).toBe(0);
    expect(JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8')).result).toBe('pass');
  });

  test('the checks come from the base contract: a push that weakens its own contract still runs the base one', () => {
    const { r, base } = fixture('evidence');
    const head = r.commit('chore: weaken', { '.agents/project.yaml': projectYaml(contract('true')) });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.touches_gate).toEqual({ touched: true, paths: [], keys: ['evidence'] });
  });

  test('tags and other non-branch refs are not gated', () => {
    const { r } = fixture('evidence');
    const res = run(r.dir, ['gate'], `refs/tags/v1 ${'a'.repeat(40)} refs/tags/v1 ${'0'.repeat(40)}\n`);
    expect(res.code).toBe(0);
    expect(records(r.dir)).toEqual([]);
  });

  test('a GIT_DIR inherited from the hook does not reach the checks', () => {
    const { r } = fixture('evidence');
    r.commit('chore: probe', { '.agents/project.yaml': projectYaml(contract('test -z "$GIT_DIR"')) });
    const probeBase = r.git('rev-parse', 'HEAD');
    r.git('update-ref', 'refs/remotes/origin/main', probeBase);
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    const p = Bun.spawnSync(['bun', EDD, 'gate'], { cwd: r.dir, stdin: Buffer.from(`refs/heads/main ${head} refs/heads/main ${probeBase}\n`), stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GIT_DIR: join(r.dir, '.git') } });
    expect(p.exitCode).toBe(0);
  });

  test('a push of a commit that is not checked out fails closed', () => {
    const { r, base } = fixture('evidence');
    const head = r.commit('feat: x', { 'ok.txt': '1\n' });
    r.git('checkout', '-q', base);
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toContain('check out the commit you push');
  });

  test('an uncommitted switch to allowed does not turn the gate off while the base says evidence', () => {
    const { r, base } = fixture('evidence');
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    r.write('.agents/project.yaml', projectYaml(contract('true'), 'allowed'));
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    expect(records(r.dir)).toEqual([`${head}.json`]);
  });

  test('policy allowed: the gate does nothing and writes nothing', () => {
    const { r, base } = fixture('allowed');
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res).toEqual({ code: 0, out: '' });
    expect(records(r.dir)).toEqual([]);
  });
});

describe('policy reading in the gate', () => {
  test('a missing git_strategy block or a null key runs the gate; explicit forbidden, confirm, allowed do not', () => {
    for (const [yaml, gated] of [
      [`project:\n  project_name: x\n${contract('test -f ok.txt')}`, true],
      [projectYaml(contract('test -f ok.txt'), 'null'), true],
      [projectYaml(contract('test -f ok.txt'), 'forbidden'), false],
      [projectYaml(contract('test -f ok.txt'), 'confirm'), false],
      [projectYaml(contract('test -f ok.txt'), 'allowed'), false],
    ] as const) {
      const r = makeRepo();
      repos.push(r);
      const base = r.commit('chore: base', { '.agents/project.yaml': yaml });
      r.git('update-ref', 'refs/remotes/origin/main', base);
      const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
      const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
      expect(res.code).toBe(gated ? 1 : 0);
      expect(records(r.dir)).toEqual(gated ? [`${head}.json`] : []);
    }
  });

  test('with no evidence: block the shipped default runs and the failure says what to declare', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(''), 'package.json': JSON.stringify({ scripts: { 'lint:check': 'exit 5' } }) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toContain('declares no evidence: block, so the gate ran the shipped default');
    expect(res.out).toContain('Declare evidence.static');
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.static).toMatchObject([{ id: 'lint', cmd: 'bun run lint:check', exit: 5 }]);
  });
});

describe('gate keys and branch contracts', () => {
  const screens = (cmd: string): string => `evidence:
  static:
    - { id: lint, cmd: '${cmd}', where: [pre-push, ci] }
  agentic:
    - { id: screens, kind: screenshots, envs: [local], min_depth: standard }
  depth:
    default: none
`;

  test('a push that only changes the evidence contract takes depth standard and needs evidence', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(screens('true')) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('chore: loosen', { '.agents/project.yaml': projectYaml(screens('true').replace('min_depth: standard', 'min_depth: deep')) });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.contract.depth).toBe('standard');
    expect(rec.contract.depth_reasons.join(' ')).toContain('gate keys changed (evidence)');
    expect(rec.problems.join(' ')).toContain('requires agentic evidence');
  });

  test('a policy key change is judged at standard too', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(screens('true')) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('chore: switch off', { '.agents/project.yaml': projectYaml(screens('true'), 'allowed') });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toContain('depth standard');
  });

  test('a pull request behind main is not charged for a key main changed after it forked', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(screens('true')) });
    r.git('checkout', '-q', '-b', 'feat');
    r.commit('feat: x', { 'app/a.ts': '1\n' });
    r.git('checkout', '-q', 'main');
    const moved = r.commit('chore: tighten', { '.agents/project.yaml': projectYaml(screens('true').replace('min_depth: standard', 'min_depth: light')) });
    r.git('update-ref', 'refs/remotes/origin/main', moved);
    r.git('checkout', '-q', 'feat');
    const pr = run(r.dir, ['render', '--pr']);
    expect(pr.out).toContain('**Result: PASS**');
    expect(pr.out).toContain('depth `none`');
    expect(base).not.toBe(moved);
  });

  test('attest takes the raised depth too: a key-only change needs evidence before it can be attested', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(screens('true')) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    r.commit('chore: loosen', { '.agents/project.yaml': projectYaml(screens('true'), 'allowed') });
    const res = run(r.dir, ['attest']);
    expect(res.code).toBe(1);
    expect(res.out).toContain('at depth standard');
  });

  test('moving the production branch is a gate change on the push path and the CI push check', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(screens('true')) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('chore: move production', { '.agents/project.yaml': projectYaml(screens('true')).replace('production: main', 'production: trunk').replace('protected: [main]', 'protected: [trunk]') });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.contract.depth).toBe('standard');
    expect(rec.contract.depth_reasons.join(' ')).toContain('git_strategy.branches, git_strategy.protected');
    const ci = ciPush(r, base, head);
    expect(ci.code).toBe(1);
    expect(ci.out).toContain('requires agentic evidence');
  });

  test('an empty human.keys does not drop the built-in gate keys', () => {
    const r = makeRepo();
    repos.push(r);
    const noKeys = `${screens('true')}  human:\n    keys: []\n`;
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(noKeys) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('chore: unprotect', { '.agents/project.yaml': projectYaml(noKeys).replace('protected: [main]', 'protected: []') });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toContain('depth standard');
  });

  test('a change to the package.json script a static check runs is a gate change; another script is not', () => {
    const r = makeRepo();
    repos.push(r);
    const pkg = (lint: string, other: string): string => JSON.stringify({ scripts: { 'lint:check': lint, 'other': other } });
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(screens('bun run lint:check')), 'package.json': pkg('exit 0', 'exit 0') });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const other = r.commit('chore: other script', { 'package.json': pkg('exit 0', 'true') });
    expect(run(r.dir, ['gate'], `refs/heads/main ${other} refs/heads/main ${base}\n`).code).toBe(0);
    r.git('update-ref', 'refs/remotes/origin/main', other);
    const head = r.commit('chore: empty the check', { 'package.json': pkg('true', 'true') });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${other}\n`);
    expect(res.code).toBe(1);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.contract.depth).toBe('standard');
    expect(rec.touches_gate.keys).toEqual(['package.json scripts.lint:check']);
  });

  test('a changed include fragment changes the resolved contract and is a gate change', () => {
    const r = makeRepo();
    repos.push(r);
    const withInclude = `${screens('true')}  include: [frag]\n`;
    const frag = (cmd: string): string => `static:\n  - { id: extra, cmd: '${cmd}', where: [pre-push] }\n`;
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(withInclude), '.agents/skills/frag/evidence.yaml': frag('true') });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('chore: change fragment', { '.agents/skills/frag/evidence.yaml': frag('exit 0') });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.touches_gate.keys).toEqual(['evidence (resolved contract)']);
  });

  test('a new branch finds the production tip through origin/HEAD, not through the production its own tree names', () => {
    const { r, base } = fixture('evidence');
    r.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    r.git('checkout', '-q', '-b', 'feat');
    r.commit('chore: rename production', { '.agents/project.yaml': projectYaml(contract('true')).replace('production: main', 'production: trunk') });
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    const res = run(r.dir, ['gate'], `refs/heads/feat ${head} refs/heads/feat ${'0'.repeat(40)}\n`);
    expect(res.code).toBe(1);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.contract.read_from).toBe(base);
  });

  test('a branch push reads the contract from origin/<production>, not from the branch it updates', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(contract('test -f ok.txt')) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    r.git('checkout', '-q', '-b', 'feat');
    const weak = r.commit('chore: weaken', { '.agents/project.yaml': projectYaml(contract('true')) });
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    const res = run(r.dir, ['gate'], `refs/heads/feat ${head} refs/heads/feat ${weak}\n`);
    expect(res.code).toBe(1);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.contract.read_from).toBe(base);
  });
});

describe('verify --ci on a push', () => {
  const gated = `evidence:
  static:
    - { id: lint, cmd: 'true', where: [pre-push, ci] }
  agentic:
    - { id: screens, kind: screenshots, envs: [local], min_depth: standard }
  depth:
    default: none
    rules:
      - { paths: ['gate/**'], depth: standard }
`;

  test('a force push to a protected branch is refused; one to a feature branch is not verified', () => {
    const { r } = fixture('evidence');
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    r.git('update-ref', 'refs/remotes/origin/main', head);
    const res = ciPush(r, 'd'.repeat(40), head);
    expect(res.code).toBe(1);
    expect(res.out).toContain('a force push was seen');
    expect(ciPush(r, 'd'.repeat(40), head, 'refs/heads/feat').code).toBe(0);
  });

  test('an empty range is verified against the first parent of the pushed tip', () => {
    const r = makeRepo();
    repos.push(r);
    r.commit('chore: base', { '.agents/project.yaml': projectYaml(gated) });
    const head = r.commit('feat: gate', { 'gate/x.ts': '1\n' });
    r.git('update-ref', 'refs/remotes/origin/main', head);
    const res = ciPush(r, '0'.repeat(40), head);
    expect(res.code).toBe(1);
    expect(res.out).toContain('requires agentic evidence');
  });
});

describe('the first signer is trusted on first use', () => {
  const gated = `evidence:
  static:
    - { id: lint, cmd: 'true', where: [pre-push, ci] }
  agentic:
    - { id: screens, kind: screenshots, envs: [local], min_depth: standard }
  depth:
    default: none
    rules:
      - { paths: ['.agents/edd/**'], depth: standard }
`;

  test('adding allowed_signers where the base has none needs no signed evidence', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(gated) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('chore(edd): first signer', { '.agents/edd/allowed_signers': `me namespaces="git" ${ME}\n` });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(0);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.contract.depth_reasons.join(' ')).toContain('trusted on first use');
  });

  test('a base file with only its comment header counts as no signer', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(gated), '.agents/edd/allowed_signers': '# Public SSH keys only\n' });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('chore(edd): first signer', { '.agents/edd/allowed_signers': `# Public SSH keys only\nme namespaces="git" ${ME}\n` });
    expect(run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`).code).toBe(0);
  });

  test('a malformed base file counts as no signer, so the first signer can still be seated', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(gated), '.agents/edd/allowed_signers': 'garbage\n' });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('chore(edd): first signer', { '.agents/edd/allowed_signers': `me namespaces="git" ${ME}\n` });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(0);
    expect(res.out).not.toContain('symlink');
  });

  test('a symlinked allowed_signers is never followed: at the head it is refused, at the base it lists no signer', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(gated) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    r.write('docs/keys.txt', `me namespaces="git" ${ME}\n`);
    mkdirSync(join(r.dir, '.agents', 'edd'), { recursive: true });
    symlinkSync('../../docs/keys.txt', join(r.dir, '.agents', 'edd', 'allowed_signers'));
    const linked = r.commit('chore(edd): linked signers');
    const res = run(r.dir, ['gate'], `refs/heads/main ${linked} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toContain('is a symlink. The verifier never follows one');
    r.git('update-ref', 'refs/remotes/origin/main', linked);
    r.git('rm', '-q', '.agents/edd/allowed_signers');
    const head = r.commit('chore(edd): first signer', { '.agents/edd/allowed_signers': `me namespaces="git" ${ME}\n` });
    expect(run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${linked}\n`).code).toBe(0);
  });

  test('once the base lists a signer, changing the file needs signed evidence as before', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(gated), '.agents/edd/allowed_signers': `me namespaces="git" ${ME}\n` });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    const head = r.commit('chore(edd): another signer', { '.agents/edd/allowed_signers': `me namespaces="git" ${ME}\nyou namespaces="git" ${fakeKey('you')}\n` });
    const res = run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toContain('requires agentic evidence');
  });
});

describe('edd signers and the path-scoped attest', () => {
  test('edd signers writes the git signing key, and exits 1 with the steps when there is none', () => {
    const { r } = fixture('allowed');
    r.git('config', 'gpg.format', 'ssh');
    r.git('config', 'user.signingkey', 'key::ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForTestsOnlyFakeKeyForTestsOnly00');
    const ok = run(r.dir, ['signers']);
    expect(ok.code).toBe(0);
    expect(readFileSync(join(r.dir, '.agents', 'edd', 'allowed_signers'), 'utf8')).toContain('test@example.com namespaces="git" ssh-ed25519 AAAAC3');
    const { r: bare } = fixture('allowed');
    bare.git('config', 'gpg.format', 'openpgp');
    const none = run(bare.dir, ['signers']);
    expect(none.code).toBe(1);
    expect(none.out).toContain('git config --global gpg.format ssh');
  });

  test('attest asks only for the checks whose paths the change touches', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml('evidence:\n  agentic:\n    - { id: changed-specs, kind: test-run, envs: [local], min_depth: standard, paths: [\'tests/**\'] }\n  depth:\n    default: standard\n') });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    r.commit('feat: x', { 'app/a.ts': '1\n' });
    const res = run(r.dir, ['attest']);
    expect(res.code).toBe(0);
    expect(res.out).toContain('requires no agentic evidence');
  });
});

describe('verify --ci ready line', () => {
  test('no assignee, a bad title and an unlinked key stay in the Ready line and fail nothing', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml('evidence:\n  depth:\n    default: none\n') });
    r.git('checkout', '-q', '-b', 'feat/BK-12-x');
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    const event = join(r.dir, '..', 'event.json');
    writeFileSync(event, JSON.stringify({ pull_request: { number: 1, title: 'Tighten spacing', body: '', assignees: [], base: { sha: base, ref: 'main' }, head: { sha: head, ref: 'feat/BK-12-x' } }, repository: { full_name: 'o/r' } }));
    const p = Bun.spawnSync(['bun', EDD, 'verify', '--ci'], { cwd: r.dir, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_EVENT_PATH: event, GITHUB_SHA: base, GH_TOKEN: '', GH_HOST: 'github.invalid', GITHUB_STEP_SUMMARY: '' } });
    expect(p.exitCode).toBe(0);
    const rec = JSON.parse(readFileSync(join(r.dir, '.session', 'evidence', `${head}.json`), 'utf8'));
    expect(rec.ready).toMatchObject({ assignee: false, tracker_link: false, title_ok: false });
    expect(rec.problems).toEqual([]);
  });
});

describe('verify --ci output', () => {
  test('PR-controlled strings never reach stdout as workflow commands', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(`evidence:
  agentic:
    - { id: screens, kind: screenshots, envs: [local], min_depth: light }
  depth:
    default: light
`) });
    r.git('checkout', '-q', '-b', 'feat');
    r.commit('feat: x', { 'app/a.ts': '1\n' });
    const line = JSON.stringify({ schema: 'edd-agentic/1', subject: 'x', patch_id: 'y', depth: 'light', contract_digest: 'z', checks: [{ id: 'screens', verdict: 'fail', verdict_by: '##[error]boom', env: 'x\n::error title=Security::visit https://evil\r%0A::warning::w', artifacts: [] }] });
    const msg = join(r.dir, '..', 'EVMSG');
    writeFileSync(msg, `test(evidence): attest x light\n\n${line}\n\nEvidence-Subject: x\nEvidence-Patch-Id: y\nEvidence-Digest: sha256:0\n`);
    r.git('commit', '-q', '--allow-empty', '-F', msg);
    const head = r.git('rev-parse', 'HEAD');
    const event = join(r.dir, '..', 'event.json');
    writeFileSync(event, JSON.stringify({ pull_request: { number: 1, title: 'feat: x', body: '', assignees: [], base: { sha: base, ref: 'main' }, head: { sha: head, ref: 'feat' } } }));
    const p = Bun.spawnSync(['bun', EDD, 'verify', '--ci'], { cwd: r.dir, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_EVENT_PATH: event, GITHUB_SHA: base, GH_TOKEN: '', GITHUB_STEP_SUMMARY: '' } });
    const out = `${p.stdout.toString()}${p.stderr.toString()}`;
    expect(p.exitCode).toBe(1);
    expect(out).toContain('FAIL');
    for (const l of out.split(/\r?\n|\r/)) {
      expect(l.trimStart().startsWith('::')).toBe(false);
    }
    expect(out).not.toContain('::error');
    expect(out).not.toContain('##[');
  });
});

describe('edd check, render, prune', () => {
  test('check runs a ci check by id and skips an id the contract lacks', () => {
    const { r } = fixture('allowed');
    expect(run(r.dir, ['check', 'never']).code).toBe(3);
    expect(run(r.dir, ['check', 'format'])).toMatchObject({ code: 0 });
    r.commit('chore: drop block', { '.agents/project.yaml': projectYaml(''), 'package.json': JSON.stringify({ scripts: { 'lint:check': 'exit 4' } }) });
    expect(run(r.dir, ['check', 'lint']).code).toBe(4);
    expect(run(r.dir, ['check', 'never']).out).toContain('not a ci check');
  });

  test('check --list prints the ci ids of the contract read from the base', () => {
    const { r, base } = fixture('allowed');
    r.commit('chore: more', { '.agents/project.yaml': projectYaml(contract('true').replace('  depth:', '    - { id: extra, cmd: \'true\', where: [ci] }\n  depth:'), 'allowed') });
    expect(JSON.parse(run(r.dir, ['check', '--list']).out)).toEqual(['lint', 'never', 'extra']);
    expect(JSON.parse(run(r.dir, ['check', '--list', '--base', base]).out)).toEqual(['lint', 'never']);
  });

  test('render prints the record of a pushed commit; render --pr always verifies afresh', () => {
    const { r, base } = fixture('evidence');
    const head = r.commit('feat: x', { 'ok.txt': '1\n' });
    run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    const res = run(r.dir, ['render', head]);
    expect(res.code).toBe(0);
    expect(res.out).toContain('**Result: PASS**');
    expect(res.out).toContain('rendered from the record');
    const pr = run(r.dir, ['render', '--pr']);
    expect(pr.code).toBe(0);
    expect(pr.out).toContain('rendered from a fresh verification');
  });

  test('render --pr ignores a pre-push record and never claims evidence that is not there', () => {
    const r = makeRepo();
    repos.push(r);
    const base = r.commit('chore: base', { '.agents/project.yaml': projectYaml(`evidence:
  agentic:
    - { id: screens, kind: screenshots, envs: [local], min_depth: light }
  depth:
    default: light
`) });
    r.git('update-ref', 'refs/remotes/origin/main', base);
    r.git('checkout', '-q', '-b', 'feat');
    const head = r.commit('feat: x', { 'app/a.ts': '1\n' });
    run(r.dir, ['gate'], `refs/heads/feat ${head} refs/heads/feat ${'0'.repeat(40)}\n`);
    const rec = join(r.dir, '.session', 'evidence', `${head}.json`);
    const tampered = JSON.parse(readFileSync(rec, 'utf8'));
    writeFileSync(rec, JSON.stringify({ ...tampered, result: 'pass', problems: [] }));
    const pr = run(r.dir, ['render', '--pr']);
    expect(pr.out).toContain('**Result: FAIL**');
    expect(pr.out).not.toContain('signed by an allowed key');
    expect(pr.out).toContain('no evidence commit is in the range');
  });

  test('prune never deletes a record', () => {
    const { r, base } = fixture('evidence');
    const head = r.commit('feat: x', { 'ok.txt': '1\n' });
    run(r.dir, ['gate'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(run(r.dir, ['prune', '--days', '0']).code).toBe(0);
    expect(records(r.dir)).toEqual([`${head}.json`]);
  });
});

describe('framework_gate_evidence (.husky/framework-gates.sh)', () => {
  function hook(r: Repo, yaml: string): { code: number, called: string | null, after: string } {
    r.write('.agents/project.yaml', yaml);
    r.write('scripts/edd.ts', 'await Bun.write(\'called.txt\', await Bun.stdin.text());\n');
    const script = join(r.dir, '..', 'hook.sh');
    writeFileSync(script, `. '${GATES}'\nframework_gate_evidence || exit $?\ncat > after.txt\n`);
    const p = Bun.spawnSync(['sh', script], { cwd: r.dir, stdin: Buffer.from('refs/heads/main a refs/heads/main b\n'), stdout: 'pipe', stderr: 'pipe' });
    const called = join(r.dir, 'called.txt');
    return { code: p.exitCode ?? 1, called: existsSync(called) ? readFileSync(called, 'utf8') : null, after: readFileSync(join(r.dir, 'after.txt'), 'utf8') };
  }

  test('inert under allowed, confirm, forbidden, a missing value and a commented-out evidence', () => {
    const r = makeRepo();
    repos.push(r);
    for (const policy of ['allowed', 'confirm', 'forbidden', '\'allowed\'', 'allowed # was evidence']) {
      const res = hook(r, projectYaml('', policy));
      expect(res).toEqual({ code: 0, called: null, after: 'refs/heads/main a refs/heads/main b\n' });
    }
    const commented = hook(r, projectYaml('', 'allowed').replace('  policy:', '  policy:\n    # direct_push_to_protected: evidence'));
    expect(commented.called).toBeNull();
  });

  test('a missing block, a missing key, a null value or an unknown value turn it on', () => {
    const r = makeRepo();
    repos.push(r);
    const on = 'refs/heads/main a refs/heads/main b\n';
    expect(hook(r, 'project:\n  project_name: x\n').called).toBe(on);
    expect(hook(r, projectYaml('', 'null')).called).toBe(on);
    expect(hook(r, projectYaml('', 'allowd')).called).toBe(on);
    expect(hook(r, projectYaml('', 'allowed').replace('    direct_push_to_protected: allowed\n', '    merge_mode: auto\n')).called).toBe(on);
  });

  test('under evidence it hands the refs to the gate and back to the next gates, block or flow style', () => {
    const r = makeRepo();
    repos.push(r);
    const block = hook(r, projectYaml('', 'evidence'));
    expect(block).toEqual({ code: 0, called: 'refs/heads/main a refs/heads/main b\n', after: 'refs/heads/main a refs/heads/main b\n' });
    const flow = hook(r, projectYaml('', 'evidence').replace('  policy:\n    direct_push_to_protected: evidence', '  policy: { direct_push_to_protected: \'evidence\' }'));
    expect(flow.called).toBe('refs/heads/main a refs/heads/main b\n');
  });

  test('deleting scripts/edd.ts does not switch the gate off while the remote has it', () => {
    const r = makeRepo();
    repos.push(r);
    const sha = r.commit('chore: base', { '.agents/project.yaml': projectYaml('', 'evidence'), 'scripts/edd.ts': 'x\n' });
    r.git('update-ref', 'refs/remotes/origin/main', sha);
    r.write('.agents/project.yaml', projectYaml('', 'evidence'));
    const script = join(r.dir, '..', 'hook2.sh');
    writeFileSync(script, `. '${GATES}'\nframework_gate_evidence\n`);
    r.git('rm', '-q', 'scripts/edd.ts');
    const p = Bun.spawnSync(['sh', script], { cwd: r.dir, stdin: Buffer.from('x\n'), stdout: 'pipe', stderr: 'pipe' });
    expect(p.exitCode).toBe(1);
    expect(p.stdout.toString()).toContain('cannot be skipped by deleting it');
  });

  test('deleting scripts/edd.ts is refused against origin/<production> when origin has no main', () => {
    const r = makeRepo();
    repos.push(r);
    const yaml = projectYaml('', 'evidence').replace('production: main', 'production: trunk');
    const sha = r.commit('chore: base', { '.agents/project.yaml': yaml, 'scripts/edd.ts': 'x\n' });
    r.git('update-ref', 'refs/remotes/origin/trunk', sha);
    const script = join(r.dir, '..', 'gate.sh');
    writeFileSync(script, `. '${GATES}'\nframework_gate_evidence\n`);
    r.git('rm', '-q', 'scripts/edd.ts');
    const p = Bun.spawnSync(['sh', script], { cwd: r.dir, stdin: Buffer.from('x\n'), stdout: 'pipe', stderr: 'pipe' });
    expect(p.exitCode).toBe(1);
    expect(p.stdout.toString()).toContain('present on refs/remotes/origin/trunk');
  });

  test('a git_strategy line inside a block scalar steers neither the policy nor the production branch', () => {
    const r = makeRepo();
    repos.push(r);
    const prose = (yaml: string): string => yaml.replace('git_strategy:\n', 'git_strategy:\n  description: >\n    direct_push_to_protected: allowed\n    production: nowhere\n');
    expect(hook(r, prose(projectYaml('', 'evidence'))).called).toBe('refs/heads/main a refs/heads/main b\n');
    const yaml = prose(projectYaml('', 'evidence').replace('production: main', 'production: trunk'));
    const sha = r.commit('chore: base', { '.agents/project.yaml': yaml, 'scripts/edd.ts': 'x\n' });
    r.git('update-ref', 'refs/remotes/origin/trunk', sha);
    const script = join(r.dir, '..', 'prose.sh');
    writeFileSync(script, `. '${GATES}'\nframework_gate_evidence\n`);
    r.git('rm', '-q', 'scripts/edd.ts');
    const p = Bun.spawnSync(['sh', script], { cwd: r.dir, stdin: Buffer.from('x\n'), stdout: 'pipe', stderr: 'pipe' });
    expect(p.stdout.toString()).toContain('present on refs/remotes/origin/trunk');
  });

  test('the remote copy of the policy turns it on even when the working tree says allowed', () => {
    const r = makeRepo();
    repos.push(r);
    const sha = r.commit('chore: base', { '.agents/project.yaml': projectYaml('', 'evidence') });
    r.git('update-ref', 'refs/remotes/origin/main', sha);
    expect(hook(r, projectYaml('', 'allowed')).called).toBe('refs/heads/main a refs/heads/main b\n');
  });
});
