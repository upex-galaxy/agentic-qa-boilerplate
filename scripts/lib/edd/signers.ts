import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

import { ALLOWED_SIGNERS } from './contract.ts';
import { git, showFile } from './git.ts';

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

export interface SignerSeed { status: 'written' | 'kept' | 'no-key' | 'refused', message: string }

function expandHome(p: string, home: string): string {
  return p === '~' ? home : p.startsWith('~/') ? join(home, p.slice(2)) : p;
}

export function signingKey(cwd: string, home = homedir()): { key: string, from: string } | null {
  const format = git(cwd, ['config', '--get', 'gpg.format']).out.trim();
  const raw = git(cwd, ['config', '--get', 'user.signingkey']).out.trim();
  if (format !== 'ssh' || raw === '') { return null; }
  const literal = raw.startsWith('key::') ? raw.slice(5) : raw;
  if (/^(?:ssh-|ecdsa-|sk-)\S+ \S+/.test(literal)) { return { key: literal.split(/\s+/).slice(0, 2).join(' '), from: 'the key literal in user.signingkey' }; }
  const path = expandHome(literal, home);
  const full = isAbsolute(path) ? path : join(cwd, path);
  const pub = full.endsWith('.pub') ? full : `${full}.pub`;
  if (!existsSync(pub)) { return null; }
  const fields = readFileSync(pub, 'utf8').trim().split(/\s+/);
  return fields.length >= 2 && /^(?:ssh-|ecdsa-|sk-)/.test(fields[0]) ? { key: `${fields[0]} ${fields[1]}`, from: pub } : null;
}

export function signingPublicKey(cwd: string, home = homedir()): string | null {
  return signingKey(cwd, home)?.key ?? null;
}

const KEY_TYPE = /^(?:ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+)$/;

function keyBlob(type: string, b64: string): Buffer | null {
  if (!KEY_TYPE.test(type) || !/^[A-Z0-9+/]+={0,2}$/i.test(b64)) { return null; }
  const blob = Buffer.from(b64, 'base64');
  if (blob.length < 4 || blob.readUInt32BE(0) !== type.length) { return null; }
  return blob.subarray(4, 4 + type.length).toString('latin1') === type ? blob : null;
}

export function fingerprint(key: string): string | null {
  const [type = '', b64 = ''] = key.trim().split(/\s+/);
  const blob = keyBlob(type, b64);
  return blob === null ? null : `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
}

export function signerLine(line: string): boolean {
  const t = line.trim();
  if (t === '' || t.startsWith('#')) { return false; }
  const f = t.split(/\s+/);
  for (let i = 1; i + 1 < f.length; i++) {
    if (keyBlob(f[i], f[i + 1]) !== null) { return true; }
  }
  return false;
}

export function listsASigner(text: string): boolean {
  return text.split('\n').some(signerLine);
}

export function signersEntry(cwd: string, ref: string): 'file' | 'symlink' | 'absent' {
  const entry = git(cwd, ['ls-tree', ref, '--', ALLOWED_SIGNERS]).out.trim();
  return entry === '' ? 'absent' : entry.startsWith('120000 ') ? 'symlink' : 'file';
}

export function signersAt(cwd: string, ref: string): string | null {
  return signersEntry(cwd, ref) === 'file' ? showFile(cwd, ref, ALLOWED_SIGNERS) : null;
}

export const SYMLINK_REFUSED = `${ALLOWED_SIGNERS} is a symlink. The verifier never follows one, so it lists no signer. Replace it with a regular file: git rm ${ALLOWED_SIGNERS}, run bun run edd signers, and commit the file it writes in a change of its own.`;

function isSymlink(path: string): boolean {
  try { return lstatSync(path).isSymbolicLink(); }
  catch { return false; }
}

export function seedAllowedSigners(root: string, opts: { replace?: boolean, home?: string } = {}): SignerSeed {
  const file = join(root, ALLOWED_SIGNERS);
  if (isSymlink(file)) { return { status: 'refused', message: SYMLINK_REFUSED }; }
  if (!opts.replace && existsSync(file) && listsASigner(readFileSync(file, 'utf8'))) {
    return { status: 'kept', message: `${ALLOWED_SIGNERS} already lists a signer; it was left as it is.` };
  }
  const replaced = existsSync(file) && listsASigner(readFileSync(file, 'utf8'));
  const found = signingKey(root, opts.home);
  if (found === null) { return { status: 'no-key', message: NO_SIGNING_KEY }; }
  const { key } = found;
  const principal = git(root, ['config', '--get', 'user.email']).out.trim() || 'signer';
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${[...SIGNERS_HEADER, `${principal} namespaces="git" ${key}`].join('\n')}\n`);
  const which = `${principal}, ${fingerprint(key) ?? key.split(' ')[0]}, read from ${found.from}`;
  if (replaced) {
    return { status: 'written', message: `${ALLOWED_SIGNERS} now lists your signing key (${which}) in place of the signer it held. The evidence gate reads signers from the base, which still lists the old one, so it refuses this change while it needs evidence signed by a listed key; a copy of the template has no such key.` };
  }
  return { status: 'written', message: `${ALLOWED_SIGNERS} now lists your signing key (${which}). It is the first signer, trusted on first use: commit it in a change of its own, and later signers are added by a change signed with a key already listed.` };
}
