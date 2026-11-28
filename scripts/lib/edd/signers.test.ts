import type { Repo } from './fixture.ts';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { fakeKey, makeRepo } from './fixture.ts';
import { fingerprint, listsASigner, seedAllowedSigners, signingPublicKey } from './signers.ts';

const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForTestsOnlyFakeKeyForTestsOnly00';

const repos: Repo[] = [];
afterEach(() => {
  while (repos.length > 0) { repos.pop()?.cleanup(); }
});

function repo(): Repo {
  const r = makeRepo('edd-signers-');
  repos.push(r);
  return r;
}

describe('the first signer comes from the user', () => {
  test('a literal ssh signing key is written with the user email as principal', () => {
    const r = repo();
    r.git('config', 'gpg.format', 'ssh');
    r.git('config', 'user.signingkey', `key::${KEY} comment`);
    expect(seedAllowedSigners(r.dir).status).toBe('written');
    const text = readFileSync(join(r.dir, '.agents', 'edd', 'allowed_signers'), 'utf8');
    expect(text).toContain(`test@example.com namespaces="git" ${KEY}`);
    expect(text).toContain('# Public SSH keys');
  });

  test('a key path is read from its public half', () => {
    const r = repo();
    const home = mkdtempSync(join(tmpdir(), 'edd-home-'));
    writeFileSync(join(home, 'id_test.pub'), `${KEY} me@host\n`);
    r.git('config', 'gpg.format', 'ssh');
    r.git('config', 'user.signingkey', '~/id_test');
    expect(signingPublicKey(r.dir, home)).toBe(KEY);
  });

  test('a file that already lists a signer is kept unless replace is asked', () => {
    const r = repo();
    const owner = fakeKey('owner');
    r.write('.agents/edd/allowed_signers', `# header\nowner namespaces="git" ${owner}\n`);
    r.git('config', 'gpg.format', 'ssh');
    r.git('config', 'user.signingkey', `key::${KEY}`);
    expect(seedAllowedSigners(r.dir).status).toBe('kept');
    expect(readFileSync(join(r.dir, '.agents', 'edd', 'allowed_signers'), 'utf8')).toContain(owner);
    const replaced = seedAllowedSigners(r.dir, { replace: true });
    expect(replaced.status).toBe('written');
    expect(replaced.message).toContain('refuses this change');
    expect(readFileSync(join(r.dir, '.agents', 'edd', 'allowed_signers'), 'utf8')).not.toContain(owner);
  });

  test('no ssh signing key: nothing is written and the message says what to configure', () => {
    const r = repo();
    r.git('config', 'gpg.format', 'openpgp');
    const seed = seedAllowedSigners(r.dir);
    expect(seed.status).toBe('no-key');
    expect(seed.message).toContain('git config --global gpg.format ssh');
  });
});

describe('what counts as a listed signer', () => {
  test('only a line whose key blob names its own key type counts', () => {
    const key = fakeKey('a');
    expect(listsASigner(`a@x namespaces="git" ${key}\n`)).toBe(true);
    expect(listsASigner(`a@x namespaces="git" valid-after="20200101" ${key} comment\n`)).toBe(true);
    expect(listsASigner(`a@x ${key.replace('ssh-ed25519', 'ssh-rsa')}\n`)).toBe(false);
    expect(listsASigner('garbage\n')).toBe(false);
    expect(listsASigner('../../docs/probe-keys.txt')).toBe(false);
    expect(listsASigner('# header\n\n   \n')).toBe(false);
    expect(listsASigner('owner namespaces="git" ssh-ed25519 AAAAowner\n')).toBe(false);
  });

  test('a symlinked allowed_signers is refused and its target is left as it is', () => {
    const r = repo();
    r.write('docs/keys.txt', 'target\n');
    r.write('.agents/edd/.keep', '');
    symlinkSync('../../docs/keys.txt', join(r.dir, '.agents', 'edd', 'allowed_signers'));
    r.git('config', 'gpg.format', 'ssh');
    r.git('config', 'user.signingkey', `key::${KEY}`);
    const seed = seedAllowedSigners(r.dir);
    expect(seed.status).toBe('refused');
    expect(seed.message).toContain('git rm .agents/edd/allowed_signers');
    expect(readFileSync(join(r.dir, 'docs', 'keys.txt'), 'utf8')).toBe('target\n');
  });

  test('the written message names the key fingerprint and where the key was read from', () => {
    const r = repo();
    const key = fakeKey('fp');
    const home = mkdtempSync(join(tmpdir(), 'edd-home-'));
    writeFileSync(join(home, 'id_fp.pub'), `${key} me@host\n`);
    r.git('config', 'gpg.format', 'ssh');
    r.git('config', 'user.signingkey', '~/id_fp');
    const seed = seedAllowedSigners(r.dir, { home });
    expect(seed.status).toBe('written');
    expect(fingerprint(key)).toMatch(/^SHA256:[\w+/]{43}$/);
    expect(seed.message).toContain(`${fingerprint(key)}, read from ${join(home, 'id_fp.pub')}`);
  });
});
