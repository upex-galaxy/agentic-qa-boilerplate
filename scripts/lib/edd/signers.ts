import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

import { ALLOWED_SIGNERS } from './contract.ts';
import { git } from './git.ts';

export const SIGNERS_HEADER = [
  '# Public SSH keys whose signature the EDD verifier accepts on an evidence commit',
  '# (gpg.ssh.allowedSignersFile format: principal, namespaces, key). The verifier',
  '# reads this file from the BASE ref, so a pull request cannot add its own key once one is listed.',
  '# Public keys only. Add a signer by appending one line in a reviewed change.',
];

export const NO_SIGNING_KEY = [
  'No SSH signing key is configured in git, so no signer was written to .agents/edd/allowed_signers.',
  'Configure one, then run bun run edd signers:',
  '  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519          (only if you have no SSH key yet)',
  '  git config --global gpg.format ssh',
  '  git config --global user.signingkey ~/.ssh/id_ed25519.pub',
  '  git config --global commit.gpgsign true',
  'Until a signer is listed, a change that needs agentic evidence cannot pass the evidence gate.',
].join('\n');

export interface SignerSeed { status: 'written' | 'kept' | 'no-key', message: string }

function expandHome(p: string, home: string): string {
  return p === '~' ? home : p.startsWith('~/') ? join(home, p.slice(2)) : p;
}

export function signingPublicKey(cwd: string, home = homedir()): string | null {
  const format = git(cwd, ['config', '--get', 'gpg.format']).out.trim();
  const raw = git(cwd, ['config', '--get', 'user.signingkey']).out.trim();
  if (format !== 'ssh' || raw === '') { return null; }
  const literal = raw.startsWith('key::') ? raw.slice(5) : raw;
  if (/^(?:ssh-|ecdsa-|sk-)\S+ \S+/.test(literal)) { return literal.split(/\s+/).slice(0, 2).join(' '); }
  const path = expandHome(literal, home);
  const full = isAbsolute(path) ? path : join(cwd, path);
  const pub = full.endsWith('.pub') ? full : `${full}.pub`;
  if (!existsSync(pub)) { return null; }
  const fields = readFileSync(pub, 'utf8').trim().split(/\s+/);
  return fields.length >= 2 && /^(?:ssh-|ecdsa-|sk-)/.test(fields[0]) ? `${fields[0]} ${fields[1]}` : null;
}

export function listsASigner(text: string): boolean {
  return text.split('\n').some(l => l.trim() !== '' && !l.trim().startsWith('#'));
}

export function seedAllowedSigners(root: string, opts: { replace?: boolean, home?: string } = {}): SignerSeed {
  const file = join(root, ALLOWED_SIGNERS);
  if (!opts.replace && existsSync(file) && listsASigner(readFileSync(file, 'utf8'))) {
    return { status: 'kept', message: `${ALLOWED_SIGNERS} already lists a signer; it was left as it is.` };
  }
  const replaced = existsSync(file) && listsASigner(readFileSync(file, 'utf8'));
  const key = signingPublicKey(root, opts.home);
  if (key === null) { return { status: 'no-key', message: NO_SIGNING_KEY }; }
  const principal = git(root, ['config', '--get', 'user.email']).out.trim() || 'signer';
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${[...SIGNERS_HEADER, `${principal} namespaces="git" ${key}`].join('\n')}\n`);
  if (replaced) {
    return { status: 'written', message: `${ALLOWED_SIGNERS} now lists your signing key (${principal}) in place of the signer it held. The evidence gate reads signers from the base, which still lists the old one, so it refuses this change while it needs evidence signed by a listed key; a copy of the template has no such key.` };
  }
  return { status: 'written', message: `${ALLOWED_SIGNERS} now lists your signing key (${principal}). It is the first signer, trusted on first use: commit it in a change of its own, and later signers are added by a change signed with a key already listed.` };
}
