import type { Repo } from './fixture.ts';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { makeRepo } from './fixture.ts';
import { seedAllowedSigners, signingPublicKey } from './signers.ts';

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
    r.write('.agents/edd/allowed_signers', '# header\nowner namespaces="git" ssh-ed25519 AAAAowner\n');
    r.git('config', 'gpg.format', 'ssh');
    r.git('config', 'user.signingkey', `key::${KEY}`);
    expect(seedAllowedSigners(r.dir).status).toBe('kept');
    expect(readFileSync(join(r.dir, '.agents', 'edd', 'allowed_signers'), 'utf8')).toContain('AAAAowner');
    const replaced = seedAllowedSigners(r.dir, { replace: true });
    expect(replaced.status).toBe('written');
    expect(replaced.message).toContain('refuses this change');
    expect(readFileSync(join(r.dir, '.agents', 'edd', 'allowed_signers'), 'utf8')).not.toContain('AAAAowner');
  });

  test('no ssh signing key: nothing is written and the message says what to configure', () => {
    const r = repo();
    r.git('config', 'gpg.format', 'openpgp');
    const seed = seedAllowedSigners(r.dir);
    expect(seed.status).toBe('no-key');
    expect(seed.message).toContain('git config --global gpg.format ssh');
  });
});
