import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

import { harvestSecretValues, isSecretKey, readSecretValues, redactValues } from '../lib/ui/redaction.ts';

export const MARKER = '[redacted]';
export const HIDDEN = '[redacted: this text hid a secret behind an encoding]';

const MIN_VALUE = 8;
const NOT_SECRET_ENV = /^(?:OLD)?PWD$|SESSION_ID$|_(?:SOCK|PATH|FILE|DIR)$/;
const EXTRA_SECRET_ENV = /(?:^|_)(?:JWT|OTP|PIN|PASSCODE|PASSPHRASE|MFA)(?:_|$)/;

export interface LeakRule {
  name: string
  pattern: RegExp
  mask: (match: string, groups: string[]) => string
}

// A value never runs into the page's own markup, or two clean strings on the page read as one leak.
const NOT_MARKUP = String.raw`(?!</(?:[abp]|code|dd|div|dt|em|figcaption|h[1-4]|li|pre|span|strong|summary|title)>|<(?:i|span) class="|" (?:rel|title|loading|type)="|">|\n\|\n)`;

const QUOTED = [
  String.raw`\\{1,8}"(?:${NOT_MARKUP}[^\\\n"]|\\{1,8}[^\\\n"]){0,20000}\\{1,8}"`,
  String.raw`"(?!\s{0,20}/?>|\s{1,20}[\w-]{1,60}=)(?:\\.|${NOT_MARKUP}[^"\\\n]){0,20000}"`,
  String.raw`'(?:\\.|${NOT_MARKUP}[^'\\\n]){0,20000}'`,
].join('|');

const REST_OF_LINE = String.raw`(?:(?!"(?:\s{0,20}/?>|\s{1,20}[\w-]{1,60}=))[^\r\n<]){3,}`;

// "<" ends an unquoted value only where it opens a tag, so a value holding one is still consumed whole.
const OPEN_ANGLE = String.raw`<(?!/?[\w!][\w:-]{0,40}[\s/>])`;
const INNER_QUOTE = String.raw`["'](?=[^\s"'<>/,;:)\]}\\])`;
const INNER_BACKSLASH = String.raw`\\(?![nrt"'\\])`;
const NOT_A_STRUCTURE = String.raw`(?![{[(](?:[\s"'{}[\]()]|$))`;

function unquoted(stop = ''): string {
  const char = `(?:<redacted>|[^\\s"'<\\\\${stop}]|${INNER_QUOTE}|${OPEN_ANGLE}|${INNER_BACKSLASH})`;
  return `${NOT_A_STRUCTURE}${char}{3,}`;
}

const OPEN_QUOTED = String.raw`["'](?!\s{0,20}/?>)[^\s"'<]{3,}`;

const HARMLESS = /^(?:(?:Bearer|Basic|Token|Digest|ApiKey)[ \t]+)?(?:\[redacted\]|<redacted>|\*{3,}|null|undefined|true|false|\$\{[A-Za-z_]\w*\}|\{env:[A-Za-z_]\w*\}|\$[A-Z_][A-Z0-9_]*)?$/;
const TRAILING_PUNCTUATION = /[,;.:!?)\]}>'"\\]$/;

function isHarmless(value: string): boolean {
  if (HARMLESS.test(value)) { return true; }
  let core = value;
  for (let i = 0; i < 8 && TRAILING_PUNCTUATION.test(core); i++) {
    core = core.slice(0, -1);
    if (core !== '' && HARMLESS.test(core)) { return true; }
  }
  return false;
}

function maskValue(value: string): string {
  const open = /^(?:\\{0,8}["']|\[)/.exec(value)?.[0] ?? '';
  const close = open === '[' ? ']' : open;
  const wrapped = open !== '' && value.length >= open.length + close.length && value.endsWith(close);
  const inner = wrapped ? value.slice(open.length, value.length - close.length) : value;
  if (value === MARKER || isHarmless(inner.trim().replace(/^\\{0,8}["']|\\{0,8}["']$/g, ''))) { return value; }
  if (!wrapped) { return MARKER; }
  return open === '[' ? `"${MARKER}"` : `${open}${MARKER}${close}`;
}

const keepHead = (_match: string, [head, value]: string[]): string => `${head}${maskValue(value)}`;

function maskListItems(_match: string, [head, items]: string[]): string {
  return `${head}${items.replace(new RegExp(QUOTED, 'g'), item => maskValue(item))}`;
}

const SECRET_WORD_LIST = String.raw`password|passwd|secret|api[_-]?key|api[_-]?token|token|private[_-]?key|access[_-]?key|session[_-]?id|credentials?`;
const COMPOUND_NAMES = String.raw`passcode|passphrase|recovery[_-]?code|mfa[_-]?code|csrf|contrase(?:n|ñ)a|(?:user|admin|old|new|db|login|root)[_-]?(?:pass|pwd)`;
// "pass", "auth" and the short names count only as a whole word or a suffix: "passed", "passRate" and "author" name no secret.
const SHORT_NAMES = 'pass|auth|otp|pin|jwt|sid|pw|clave';
const KEY_FORMS = String.raw`[\w-]{0,40}(?:${SECRET_WORD_LIST}|session[_-]?key|${COMPOUND_NAMES})[\w-]{0,40}|(?:[\w-]{0,40}[_-])?pwd|(?:\w[\w-]{0,40}[_-])?(?:${SHORT_NAMES})`;
const ASSIGNMENT_KEY = `(?:${KEY_FORMS})`;
const LIST_KEY = `(?:${KEY_FORMS}|(?:proxy-)?authorization)`;
const PAIR_NAME = String.raw`(?:(?:proxy-)?authorization|(?:set-)?cookie|[\w.-]{0,40}(?:${SECRET_WORD_LIST}|session)[\w.-]{0,40}|(?:\w[\w.-]{0,40}[_.-])?(?:auth|pass|pwd)(?:[_.-][\w.-]{0,40})?)`;
const KEY_END = String.raw`\\{0,8}["']?`;
const SCHEME = String.raw`(?:(?:Bearer|Basic|Token|Digest|ApiKey)[ \t]{1,20})?`;
const FLAG_NAME = String.raw`--?(?:\w[\w-]{0,40}[_-])?(?:password|passwd|passcode|pass|pwd|auth|secret|token|api[_-]?key|access[_-]?key|session[_-]?key|credentials?)`;
const FIELD_WORD = String.raw`(?:password|passcode|passwd|secret|token|pwd|(?<![a-z])pass(?![a-z]))`;
const FIELD = String.raw`textbox[ \t]{1,20}"[^"\n]{0,80}?${FIELD_WORD}[^"\n]{0,80}"(?:[ \t]{0,5}\[[^\]\n]{0,60}\]){0,8}[ \t]{0,5}:`;
const FIELD_VALUE = String.raw`(?:${NOT_MARKUP}[^\r\n<]|${OPEN_ANGLE})*`;
const FIELD_CHILD = new RegExp(String.raw`(-[ \t]+text:[ \t]*)([^\s<]${FIELD_VALUE})`, 'g');

const assignment = (key: string): string => String.raw`(${key}${KEY_END}[ \t]{0,20}(?:=>|[:=])[ \t]{0,20}${SCHEME})`;

const SECRET_PARAM = /^(?:sig|sas|jwt|x-(?:amz|goog)-(?:signature|credential|security-token))$|token|secret|passw|signature|api[_-]?key|session[_-]?(?:id|key)/i;

const SECRET_NAME_ANYWHERE = new RegExp(`${SECRET_WORD_LIST}|pwd|authorization|cookie`, 'i');

export function isSecretName(name: string): boolean {
  return isSecretKey(name) || SECRET_NAME_ANYWHERE.test(name);
}

export const LEAK_RULES: readonly LeakRule[] = [
  {
    name: 'private-key',
    pattern: /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]{0,30}PRIVATE KEY-----|$)/g,
    mask: () => MARKER,
  },
  {
    name: 'name-value-pair',
    pattern: new RegExp(String.raw`(?<![\w-])(name${KEY_END}\s{0,200}:\s{0,200}\\{0,8}["']${PAIR_NAME}\\{0,8}["']\s{0,200},\s{0,200}\\{0,8}["']?value${KEY_END}\s{0,200}:\s{0,200})(${QUOTED})`, 'gi'),
    mask: keepHead,
  },
  {
    name: 'value-name-pair',
    pattern: new RegExp(String.raw`(?<![\w-])(value${KEY_END}\s{0,200}:\s{0,200})(${QUOTED})(?=\s{0,200},\s{0,200}\\{0,8}["']?name${KEY_END}\s{0,200}:\s{0,200}\\{0,8}["']${PAIR_NAME}\\{0,8}["'])`, 'gi'),
    mask: keepHead,
  },
  {
    name: 'cookie-object',
    pattern: new RegExp(String.raw`\{(?:${NOT_MARKUP}[^{}]){0,2000}(?<![\w-])domain${KEY_END}\s{0,50}:(?:${NOT_MARKUP}[^{}]){0,2000}\}`, 'g'),
    mask: match => match.replace(
      new RegExp(String.raw`(?<![\w-])(value${KEY_END}\s{0,50}:\s{0,50})(${QUOTED})`, 'g'),
      (_pair, head: string, value: string) => `${head}${maskValue(value)}`,
    ),
  },
  {
    name: 'authorization-header',
    pattern: new RegExp(String.raw`(?<![\w-])((?:proxy-)?authorization${KEY_END}[ \t]{0,20}[:=][ \t]{0,20})(${QUOTED}|(?![\s{[])${REST_OF_LINE})`, 'gi'),
    mask: keepHead,
  },
  {
    name: 'cookie-header',
    pattern: new RegExp(String.raw`(?<![\w-])((?:set-)?cookies?${KEY_END}[ \t]{0,20}[:=][ \t]{0,20})(${QUOTED}|\[(?:${NOT_MARKUP}[^[\]<])*\]|(?![\s{[])${REST_OF_LINE})`, 'gi'),
    mask: keepHead,
  },
  {
    name: 'aria-snapshot-field',
    pattern: new RegExp(String.raw`(${FIELD}[ \t]*)([^\s<]${FIELD_VALUE})`, 'gi'),
    mask: keepHead,
  },
  {
    name: 'aria-snapshot-child',
    pattern: new RegExp(String.raw`(${FIELD}[ \t]*\r?\n)((?:[ \t]+(?:-[ \t]+)?(?:/[\w-]{1,40}|text):[^\r\n]*(?:\r?\n|$))+)`, 'gi'),
    mask: (_match, [head, children]) => `${head}${children.replace(FIELD_CHILD, (_line, lead: string, value: string) => `${lead}${maskValue(value)}`)}`,
  },
  {
    name: 'bearer-or-basic',
    pattern: /\b((?:Bearer|Basic)(?:[ \t]+|%20))([\w.~+/=-]{8,})/gi,
    mask: (match, [head, token]) => (/[\d+=]|.[A-Z]/.test(token) ? `${head}${MARKER}` : match),
  },
  {
    name: 'jwt',
    pattern: /(?<![A-Za-z0-9])eyJ[\w-]{5,1000}\.[\w-]{2,}\.[\w-]*/g,
    mask: () => MARKER,
  },
  {
    name: 'token-prefix',
    pattern: new RegExp(`(?<![A-Za-z0-9])(?:${[
      String.raw`(?:sk|rk)[-_](?=[\w-]{0,200}\d)[\w-]{16,}`,
      String.raw`sbp_\w{16,}`,
      String.raw`sb_secret_[\w-]{8,}`,
      String.raw`xox[abeoprs]-[A-Za-z0-9-]{8,}`,
      String.raw`xapp-[A-Za-z0-9-]{8,}`,
      String.raw`gh[opsru]_[A-Za-z0-9]{16,}`,
      String.raw`github_pat_\w{16,}`,
      String.raw`glpat-[\w-]{16,}`,
      String.raw`npm_[A-Za-z0-9]{16,}`,
      String.raw`(?:AKIA|ASIA)[0-9A-Z]{16}`,
      String.raw`AIza[\w-]{30,}`,
      String.raw`ATATT3[\w=-]{16,}`,
      String.raw`ops_eyJ[\w=-]{16,}`,
      String.raw`whsec_[A-Za-z0-9]{16,}`,
      String.raw`SG\.[\w-]{16,}\.[\w-]{16,}`,
    ].join('|')})`, 'g'),
    mask: () => MARKER,
  },
  {
    name: 'url-userinfo',
    pattern: /(\b[a-z][\w+.-]{0,20}:\/\/)([^\s/?#"'<>\\]+)@/gi,
    mask: (match, [scheme, userinfo]) => (userinfo === MARKER ? match : `${scheme}${MARKER}@`),
  },
  {
    name: 'user-flag',
    pattern: new RegExp(String.raw`(?<![\w-])((?:-u|--user)(?:[ \t]{1,20}|=)\\{0,8}["']?[^\s:"'<>\\/]{1,200}:)(${unquoted()})`, 'g'),
    mask: keepHead,
  },
  {
    name: 'secret-flag',
    pattern: new RegExp(String.raw`(?<![\w-])(${FLAG_NAME}[ \t]{1,20})(${QUOTED}|(?!-)${unquoted()})`, 'gi'),
    mask: keepHead,
  },
  {
    name: 'secret-query-param',
    pattern: /([?&#])([\w.-]{1,60})=([^&#\s"'<>\\;]+)/g,
    mask: (match, [lead, key, value]) => {
      const secret = isSecretKey(key) || SECRET_PARAM.test(key) || (key === 'code' && value.length >= 16);
      return secret ? `${lead}${key}=${maskValue(value)}` : match;
    },
  },
  {
    name: 'secret-list',
    pattern: new RegExp(String.raw`(?<![\w-])(${LIST_KEY}${KEY_END}[ \t]{0,20}[:=]\s{0,200}\[)((?:\[redacted\]|${NOT_MARKUP}[^[\]]){0,2000})(?=\])`, 'gi'),
    mask: maskListItems,
  },
  {
    name: 'secret-next-line',
    pattern: new RegExp(String.raw`(?<![\w-])(${LIST_KEY}${KEY_END}[ \t]{0,20}[:=][ \t]{0,20}\r?\n\s{0,200})(${QUOTED})`, 'gi'),
    mask: keepHead,
  },
  {
    name: 'secret-assignment',
    pattern: new RegExp(String.raw`(?<![\w?&#-])${assignment(ASSIGNMENT_KEY)}(${QUOTED}|${unquoted()}|${OPEN_QUOTED})`, 'gi'),
    mask: keepHead,
  },
  {
    name: 'secret-query-assignment',
    pattern: new RegExp(String.raw`(?<=[?&#])${assignment(ASSIGNMENT_KEY)}(${QUOTED}|${unquoted('&#;')}|${OPEN_QUOTED})`, 'gi'),
    mask: keepHead,
  },
];

function applyRule(text: string, rule: LeakRule, onChange?: () => void): string {
  return text.replace(rule.pattern, (...args: unknown[]) => {
    const match = args[0] as string;
    const groups = args.slice(1, -2) as string[];
    const next = rule.mask(match, groups);
    if (next !== match) { onChange?.(); }
    return next;
  });
}

export function applyRules(text: string): string {
  return LEAK_RULES.reduce((out, rule) => applyRule(out, rule), text);
}

export function patternLeaks(text: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const rule of LEAK_RULES) {
    let count = 0;
    applyRule(text, rule, () => { count++; });
    if (count > 0) { found.set(rule.name, count); }
  }
  return found;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', colon: ':', equals: '=' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|colon|equals);/gi, (all, name: string) => {
    if (name[0] !== '#') { return NAMED_ENTITIES[name.toLowerCase()] ?? all; }
    const code = name[1].toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code <= 0x10FFFF ? String.fromCodePoint(code) : all;
  });
}

function decodeEscapes(text: string): string {
  const once = (input: string): string => input.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[nrt"'\\/])/g, (_all, code: string) => {
    if (code.length > 1) { return String.fromCharCode(Number.parseInt(code.slice(1), 16)); }
    if (code === 'n' || code === 'r') { return '\n'; }
    return code === 't' ? '\t' : code;
  });
  return once(once(text));
}

function decodePercent(text: string): string {
  return text.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    try { return decodeURIComponent(run); }
    catch { return run; }
  });
}

export function decodedViews(text: string): string[] {
  const entities = decodeEntities(text);
  return [...new Set([entities, decodeEscapes(entities), decodePercent(entities)])];
}

export function textViews(text: string): string[] {
  return [...new Set([text, ...decodedViews(text)])];
}

function htmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function secretVariants(values: readonly string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (value.length < MIN_VALUE) { continue; }
    const bytes = Buffer.from(value, 'utf8');
    const base64 = bytes.toString('base64').replace(/=+$/, '');
    const twice = Buffer.from(bytes.toString('base64'), 'utf8').toString('base64').replace(/=+$/, '');
    const hex = bytes.toString('hex');
    const encoded = encodeURIComponent(value.toWellFormed());
    for (const variant of [value, JSON.stringify(value).slice(1, -1), htmlEscape(value), encoded, encoded.replace(/%20/g, '+'), base64, bytes.toString('base64url'), twice, hex, hex.toUpperCase()]) {
      out.add(variant);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

const AUTH_FILE_LIMIT_BYTES = 5 * 1024 * 1024;

function authFiles(dir: string): string[] {
  const out: string[] = [];
  let top: string;
  try { top = realpathSync(dir); }
  catch { return out; }
  const pending = [top];
  const seen = new Set(pending);
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    let names: string[];
    try { names = readdirSync(current); }
    catch { continue; }
    for (const name of names) {
      try {
        const real = realpathSync(join(current, name));
        if (!real.startsWith(`${top}${sep}`) || seen.has(real)) { continue; }
        seen.add(real);
        const info = statSync(real);
        if (info.isDirectory()) { pending.push(real); }
        else if (info.isFile() && info.size <= AUTH_FILE_LIMIT_BYTES && /\.(?:env|json)$/.test(name)) { out.push(real); }
      }
      catch { continue; }
    }
  }
  return out;
}

function parsedJson(text: string): unknown {
  try { return JSON.parse(text) as unknown; }
  catch { return null; }
}

function harvestState(node: unknown, key: string, out: string[]): void {
  if (typeof node === 'string') {
    if (isSecretKey(key)) { out.push(node); }
    if (/^\s*[{[]/.test(node)) { harvestState(parsedJson(node), key, out); }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) { harvestState(item, key, out); }
    return;
  }
  if (node === null || typeof node !== 'object') { return; }
  for (const [name, child] of Object.entries(node)) {
    if ((name === 'cookies' || name === 'localStorage') && Array.isArray(child)) {
      for (const entry of child as ({ value?: unknown } | null)[]) {
        if (typeof entry?.value === 'string') { out.push(entry.value); }
      }
    }
    harvestState(child, name, out);
  }
}

function readAuthValues(root: string): string[] {
  const out: string[] = [];
  for (const path of authFiles(join(root, '.auth'))) {
    try {
      const text = readFileSync(path, 'utf8');
      if (path.endsWith('.env')) { out.push(...harvestSecretValues(text, '.env')); }
      else { harvestState(JSON.parse(text), '', out); }
    }
    catch { continue; }
  }
  return out;
}

export function collectSecretValues(root: string, env: Record<string, string | undefined>): string[] {
  const fromEnv = Object.entries(env)
    .filter(([name]) => !NOT_SECRET_ENV.test(name) && (isSecretKey(name) || EXTRA_SECRET_ENV.test(name)))
    .map(([, value]) => value ?? '');
  const all = [...readSecretValues(root), ...readAuthValues(root), ...fromEnv];
  return [...new Set(all.filter(value => value.length >= MIN_VALUE && !HIDDEN.includes(value)))];
}

export function holdsValue(bytes: Buffer, variants: readonly string[]): boolean {
  return variants.some(v => bytes.includes(Buffer.from(v, 'utf8')) || bytes.includes(Buffer.from(v, 'utf16le')));
}

const BYTE_RULES: ReadonlySet<string> = new Set(['jwt', 'token-prefix', 'private-key']);

export function holdsToken(bytes: Buffer): boolean {
  return [...patternLeaks(bytes.toString('latin1')).keys()].some(rule => BYTE_RULES.has(rule));
}

const PNG_SIGNATURE = 8;
const PNG_TEXT_CHUNKS: ReadonlySet<string> = new Set(['tEXt', 'zTXt', 'iTXt']);

export function stripPngText(bytes: Buffer): Buffer {
  if (bytes.subarray(1, 4).toString('latin1') !== 'PNG') { return bytes; }
  const kept = [bytes.subarray(0, PNG_SIGNATURE)];
  let at = PNG_SIGNATURE;
  while (at + 8 <= bytes.length) {
    const end = Math.min(bytes.length, at + 12 + bytes.readUInt32BE(at));
    if (!PNG_TEXT_CHUNKS.has(bytes.subarray(at + 4, at + 8).toString('latin1'))) { kept.push(bytes.subarray(at, end)); }
    at = end;
  }
  kept.push(bytes.subarray(at));
  return Buffer.concat(kept);
}

const SECRET_HINT = /password|passwd|passcode|secret|token|pwd|(?<![a-z])pass(?![a-z])/i;
const CAMEL_CASE_PASS_HINT = /Pass(?![a-z])/;
const ARG = String.raw`(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')`;
const SELECTOR_AND_VALUE = new RegExp(String.raw`(\b(?:fill|type|pressSequentially)\(\s*${ARG}\s*,\s*)${ARG}`, 'g');
const VALUE_ONLY = new RegExp(String.raw`(\b(?:fill|type|pressSequentially)\(\s*)${ARG}(?=\s*(?:\)|,\s*\{))`, 'g');
const STEP_TITLE = new RegExp(String.raw`(\b(?:Fill|Type|Press sequentially) +)${ARG}`, 'g');

// A real Playwright step title is only `Fill "<value>"`: nothing in it says whether the field was a password.
const TYPED_TITLE = /^([ \t]*(?:Fill|Type|Insert|Press sequentially) )"[^\n]*?"(?=[ \t]+(?:locator\(|getBy\w+\(|internal:)|[ \t]*$)/gm;
const TYPED_CALL = /^([ \t]*-[ \t]+(?:fill|type|pressSequentially|insertText)\()[^\n]*\)/gm;
const PASSWORD_INPUT = /<input[ \t][^<>\n]{0,500}type=\\?["']password\\?["'][^<>\n]{0,500}>/gi;
const VALUE_ATTRIBUTE = /(\bvalue=\\?["'])(?!\[redacted\])[^"'\\\n]+/gi;
const SNAPSHOT_FIELD = /^([ \t]*)-[ \t]+'?(?:textbox|searchbox|spinbutton|combobox)\b/;
const SNAPSHOT_VALUE = /^((?:[^"\n]|"[^"\n]*")*?:[ \t]+)(?!\[redacted\])\S.*$/;
const SNAPSHOT_CHILD = /^([ \t]*-[ \t]+(?:text|\/placeholder):[ \t]*)(?!\[redacted\])\S.*$/;

// A page snapshot prints what each field holds, whatever its label says.
function maskSnapshotFields(text: string): string {
  let indent = -1;
  return text.split('\n').map((line) => {
    const field = SNAPSHOT_FIELD.exec(line);
    if (field) {
      indent = field[1].length;
      return line.replace(SNAPSHOT_VALUE, `$1${MARKER}`);
    }
    if (indent >= 0 && line.search(/\S/) > indent) { return line.replace(SNAPSHOT_CHILD, `$1${MARKER}`); }
    indent = -1;
    return line;
  }).join('\n');
}

// Playwright prints the typed value in step titles and call logs, where no key name sits beside it.
function maskTypedValues(text: string): string {
  const masked = `$1"${MARKER}"`;
  const always = maskSnapshotFields(text)
    .replace(TYPED_TITLE, masked)
    .replace(TYPED_CALL, `$1"${MARKER}")`)
    .replace(PASSWORD_INPUT, input => input.replace(VALUE_ATTRIBUTE, `$1${MARKER}`));
  if (!SECRET_HINT.test(always) && !CAMEL_CASE_PASS_HINT.test(always)) { return always; }
  return always.replace(SELECTOR_AND_VALUE, masked).replace(VALUE_ONLY, masked).replace(STEP_TITLE, masked);
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[a-z]`, 'gi');

export interface Redactor {
  text: (input: string) => string
  holdsSecret: (bytes: Buffer) => boolean
}

// The gate reads the page, where the renderer's markup can join a string's last lines into a match.
function pageViews(text: string): string[] {
  const end = text.slice(text.lastIndexOf('\n', Math.max(0, text.trimEnd().length - 2000)) + 1);
  const shapes = [...new Set([end, end.trimEnd()])].map(htmlEscape).flatMap(tail => [
    `<b>${tail}</b><i class="x">`,
    `<b>${tail} <i class="x">`,
    `<a title="${tail}">${tail}</a>`,
    `<a href="${tail}" rel="x">`,
  ]);
  return [htmlEscape(text), ...shapes].flatMap(decodedViews);
}

export function createRedactor(values: readonly string[]): Redactor {
  const variants = secretVariants(values);
  const split = (text: string): boolean => {
    const joined = text.replace(/<[^<>]{0,200}>|\s+/g, '');
    return variants.some(v => joined.includes(v));
  };
  const leaks = (text: string): boolean => split(text) || [...new Set([...textViews(text), ...pageViews(text)])]
    .some(view => variants.some(v => view.includes(v)) || patternLeaks(view).size > 0);

  return {
    text(input) {
      if (input === '') { return input; }
      const known = redactValues(input.replace(ANSI, ''), variants, MARKER);
      const out = applyRules(maskTypedValues(known));
      return leaks(out) ? HIDDEN : out;
    },
    holdsSecret: bytes => holdsValue(bytes, variants) || holdsToken(bytes),
  };
}
