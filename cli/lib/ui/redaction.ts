/**
 * @fileoverview Secret values out of everything the tooling prints or saves.
 *
 * Two layers. The primary one is exact: `readSecretValues` collects the literal
 * values a repo's MCP configs and `.env*` files hold, and `redactValues` masks
 * each occurrence. The net is by pattern: `redactSecretText` masks the value
 * next to a secret-named key, after a secret-named flag, inside a URL, and
 * any token-shaped run, keeping every key name. A placeholder (`${VAR}`,
 * `{env:VAR}`, `{file:dir/VAR}`) names a variable and always stays.
 *
 * Shared byte for byte with the QA boilerplate (`bun run shared:check`).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REDACTED = '<redacted>';

export interface RedactOptions {
  envKeys?: boolean
}

export const SECRET_WORDS: ReadonlySet<string> = new Set([
  'TOKEN',
  'TOKENS',
  'SECRET',
  'SECRETS',
  'PASSWORD',
  'PASSWD',
  'PASS',
  'PWD',
  'KEY',
  'APIKEY',
  'AUTH',
  'AUTHORIZATION',
  'BEARER',
  'CREDENTIAL',
  'CREDENTIALS',
  'COOKIE',
  'SESSION',
  'PAT',
  'DSN',
  'SIGNATURE',
  'XOXP',
  'XOXB',
]);

const PLACEHOLDER = /\$\{[A-Za-z_]\w*\}|\{env:[A-Za-z_]\w*\}|\{file:[^}]*\}/g;
const HAS_PLACEHOLDER = /\$\{[A-Za-z_]\w*\}|\{env:[A-Za-z_]\w*\}|\{file:[^}]*\}/;

const TOKEN_SHAPE = new RegExp([
  String.raw`(?<![A-Za-z0-9])(?:sk|rk)[-_][\w-]{4,}`,
  String.raw`(?<![A-Za-z0-9])sbp_\w{4,}`,
  String.raw`(?<![A-Za-z0-9])xox[abeoprs]-[A-Za-z0-9-]{4,}`,
  String.raw`(?<![A-Za-z0-9])gh[opsru]_[A-Za-z0-9]{8,}`,
  String.raw`(?<![A-Za-z0-9])github_pat_\w{8,}`,
  String.raw`(?<![A-Za-z0-9])glpat-[\w-]{8,}`,
  String.raw`(?<![A-Za-z0-9])npm_[A-Za-z0-9]{16,}`,
  String.raw`(?<![A-Za-z0-9])AKIA[0-9A-Z]{12,}`,
  String.raw`(?<![A-Za-z0-9])AIza[\w-]{20,}`,
  String.raw`(?<![A-Za-z0-9])eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}`,
  String.raw`(?<=\bBearer\s+)[\w.~+/=-]{8,}`,
].join('|'), 'g');

const HIGH_ENTROPY = /(?<![\w+=-])[\w+=-]{32,}(?![\w+=-])/g;

const PLAIN_SETTING = /^(?:[a-z]{1,16}|\d{1,6})$/;

const MIN_VALUE = 8;

function words(name: string): string[] {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

export function isSecretKey(name: string): boolean {
  return words(name).some(word => SECRET_WORDS.has(word));
}

function isRandom(run: string): boolean {
  return run.split(/[-_]/).some(part => part.length >= 16 && /[A-Z]/.test(part) && /[a-z]/.test(part) && /\d/.test(part));
}

export function looksLikeSecret(value: string): boolean {
  const bare = value.replace(PLACEHOLDER, '');
  TOKEN_SHAPE.lastIndex = 0;
  if (TOKEN_SHAPE.test(bare)) { return true; }
  return [...bare.matchAll(HIGH_ENTROPY)].some(m => isRandom(m[0]));
}

function masksValue(key: string, value: string, options: RedactOptions): boolean {
  const bare = value.replace(PLACEHOLDER, '').trim();
  if (bare === '' || bare === REDACTED) { return false; }
  if (/^[a-z][\w+.-]*:\/\//i.test(bare) && !isSecretKey(key)) { return false; }
  if (looksLikeSecret(value)) { return true; }
  if (HAS_PLACEHOLDER.test(value) && /^[A-Z :._-]{0,16}$/i.test(bare)) { return false; }
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(bare) || /^[\w-]+(?:\.[\w-]+)+$/.test(bare)) { return false; }
  if (isSecretKey(key)) { return true; }
  return !PLAIN_SETTING.test(bare) && options.envKeys === true && /^[A-Z][A-Z0-9_]*$/.test(key);
}

export function redactValue(key: string, value: string, options: RedactOptions = { envKeys: true }): string {
  return masksValue(key, value, options) ? mask(value) : value;
}

function mask(value: string): string {
  const refs = value.match(PLACEHOLDER);
  return refs ? refs.join(' ') : REDACTED;
}

const QUOTED_PAIR = /(["'])([A-Z_][\w.-]*)\1(\s*[:=]\s*)(["'])((?:\\.|(?!\4)[^\\\n])*)\4/gi;
const BARE_KEY_QUOTED_VALUE = /(^|[\s{,;])([A-Z_][\w.-]*)(\s*[:=]\s*)(["'])((?:\\.|(?!\4)[^\\\n])*)\4/gim;
const BARE_PAIR = /^([+\- ]?\s*(?:export\s+)?)([A-Za-z_][\w.-]*)(\s*[:=]\s*)(?![\s"'{[])([^\s#,]+)/gm;
const FLAG_VALUE = /(--?[A-Z][\w-]*)(\s*=\s*|[ \t]+|["']\s*,\s*["'])([^\s"',\]]+)/gi;
const URL_PASSWORD = /(\b[a-z][\w+.-]*:\/\/[^\s/:@"']+:)([^\s@/"']+)(@)/gi;
const QUERY_PARAM = /([?&])([\w.-]+)=([^&\s"'#]+)/g;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export function redactSecretText(text: string, options: RedactOptions = {}): string {
  return text
    .replace(ANSI, '')
    .replace(QUOTED_PAIR, (all, q: string, key: string, sep: string, vq: string, value: string) =>
      (masksValue(key, value, options) ? `${q}${key}${q}${sep}${vq}${mask(value)}${vq}` : all))
    .replace(BARE_KEY_QUOTED_VALUE, (all, lead: string, key: string, sep: string, vq: string, value: string) =>
      (masksValue(key, value, options) ? `${lead}${key}${sep}${vq}${mask(value)}${vq}` : all))
    .replace(BARE_PAIR, (all, lead: string, key: string, sep: string, value: string) =>
      (masksValue(key, value, options) ? `${lead}${key}${sep}${mask(value)}` : all))
    .replace(FLAG_VALUE, (all, flag: string, sep: string, value: string) =>
      (isSecretKey(flag) && value !== REDACTED && !value.startsWith('-') && !HAS_PLACEHOLDER.test(value) ? `${flag}${sep}${REDACTED}` : all))
    .replace(URL_PASSWORD, (_all, head: string, _password: string, at: string) => `${head}${REDACTED}${at}`)
    .replace(QUERY_PARAM, (all, mark: string, key: string, value: string) =>
      (masksValue(key, value, {}) ? `${mark}${key}=${REDACTED}` : all))
    .replace(TOKEN_SHAPE, REDACTED)
    .replace(HIGH_ENTROPY, run => (isRandom(run) ? REDACTED : run));
}

export function redactValues(text: string, values: readonly string[], replacement = REDACTED): string {
  let out = text;
  for (const value of values) {
    if (out.includes(value)) { out = out.split(value).join(replacement); }
  }
  return out;
}

export function redactAll(text: string, values: readonly string[], options: RedactOptions = {}): string {
  return redactSecretText(redactValues(text, values), options);
}

export function redactParseError(message: string): string {
  return redactSecretText(message.replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, `"${REDACTED}"`));
}

const MCP_FILES = ['.mcp.json', 'opencode.jsonc', 'opencode.json', '.codex/config.toml', '.pi/mcp.json'];

export function holdsEnvValues(path: string): boolean {
  const posix = path.replace(/\\/g, '/');
  const base = posix.slice(posix.lastIndexOf('/') + 1);
  return MCP_FILES.some(file => posix === file || posix.endsWith(`/${file}`)) || isDotenv(base);
}

function isDotenv(base: string): boolean {
  return /^\.env(?:\.|$)/.test(base) && base !== '.env.example' && !base.endsWith('.schema');
}

function stripJsonc(text: string): string {
  return text
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, m => (m.startsWith('"') ? m : ''))
    .replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (m, closer: string | undefined) => closer ?? m);
}

function urlSecrets(url: string): string[] {
  const out: string[] = [];
  for (const m of url.matchAll(URL_PASSWORD)) { out.push(m[2]); }
  for (const m of url.matchAll(QUERY_PARAM)) {
    if (masksValue(m[2], m[3], {})) { out.push(m[3]); }
  }
  return out;
}

function harvestTree(node: unknown, key: string, out: Set<string>): void {
  if (typeof node === 'string') {
    if (HAS_PLACEHOLDER.test(node) && !looksLikeSecret(node)) { return; }
    if (masksValue(key, node, { envKeys: true })) { out.add(node); }
    for (const part of urlSecrets(node)) { out.add(part); }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      const previous = node[i - 1];
      if (typeof item === 'string' && typeof previous === 'string' && /^--?[A-Z]/i.test(previous) && isSecretKey(previous) && !HAS_PLACEHOLDER.test(item)) {
        out.add(item);
      }
      if (typeof item === 'string') {
        const eq = /^(--?[A-Z][\w-]*)=(.+)$/i.exec(item);
        if (eq && isSecretKey(eq[1]) && !HAS_PLACEHOLDER.test(eq[2])) { out.add(eq[2]); }
      }
      harvestTree(item, key, out);
    });
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) { harvestTree(v, k, out); }
  }
}

function harvestByPattern(text: string, out: Set<string>): void {
  for (const m of text.matchAll(QUOTED_PAIR)) {
    if (masksValue(m[2], m[5], { envKeys: true })) { out.add(m[5]); }
  }
  for (const m of text.matchAll(BARE_KEY_QUOTED_VALUE)) {
    if (masksValue(m[2], m[5], { envKeys: true })) { out.add(m[5]); }
  }
  for (const m of text.matchAll(TOKEN_SHAPE)) { out.add(m[0]); }
}

function harvestDotenv(text: string, out: Set<string>): void {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:export\s+)?[A-Z_a-z]\w*\s*=(.*)$/.exec(lines[i]);
    if (!m) { continue; }
    let value = m[1].trim();
    const quote = value[0];
    if ((quote === '"' || quote === '\'') && !value.slice(1).includes(quote)) {
      const parts = [value.slice(1)];
      while (i + 1 < lines.length && !lines[i + 1].includes(quote)) { parts.push(lines[++i]); }
      if (i + 1 < lines.length) { parts.push(lines[++i].slice(0, lines[i].indexOf(quote))); }
      for (const part of parts) { if (part.trim().length >= MIN_VALUE) { out.add(part.trim()); } }
      continue;
    }
    if (quote === '"' || quote === '\'') { value = value.slice(1, value.indexOf(quote, 1)); }
    else { value = value.replace(/\s+#.*$/, ''); }
    if (!HAS_PLACEHOLDER.test(value)) { out.add(value); }
  }
}

export function harvestSecretValues(text: string, path: string): string[] {
  const out = new Set<string>();
  const posix = path.replace(/\\/g, '/');
  const base = posix.slice(posix.lastIndexOf('/') + 1);
  if (isDotenv(base)) { harvestDotenv(text, out); }
  else {
    try {
      const tree: unknown = base.endsWith('.toml') ? Bun.TOML.parse(text) : JSON.parse(stripJsonc(text));
      harvestTree(tree, '', out);
    }
    catch {
      harvestByPattern(text, out);
    }
  }
  return [...out].filter(v => v.length >= MIN_VALUE && v !== REDACTED).sort((a, b) => b.length - a.length);
}

export function readSecretValues(root: string): string[] {
  const out = new Set<string>();
  const read = (rel: string): void => {
    const file = join(root, rel);
    if (!existsSync(file)) { return; }
    try {
      for (const value of harvestSecretValues(readFileSync(file, 'utf8'), rel)) { out.add(value); }
    }
    catch { out.delete(''); }
  };
  for (const rel of MCP_FILES) { read(rel); }
  let names: string[] = [];
  try { names = readdirSync(root); }
  catch { names = []; }
  for (const name of names) {
    if (isDotenv(name)) { read(name); }
  }
  return [...out].sort((a, b) => b.length - a.length);
}
