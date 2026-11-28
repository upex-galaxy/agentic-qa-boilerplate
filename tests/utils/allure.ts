import * as allure from 'allure-js-commons';
import { ContentType } from 'allure-js-commons';

const MASKED = '***';
const SECRET_KEY = /passw|passcode|passphrase|pwd|secret|token|authorization|cookie|api[_-]?key|access[_-]?key|private[_-]?key|session[_-]?id|signature/i;
const SECRET_KEY_WORDS = new Set(['pass', 'pw', 'auth', 'bearer', 'otp', 'pin', 'cvv', 'sid', 'jwt']);
const IDENTITY_KEYS = new Set(['email', 'mail', 'useremail', 'emailaddress', 'user', 'username', 'userid', 'login']);
const SECRET_SHAPES = [
  /eyJ[\w-]{5,}\.[\w-]{2,}\.[\w-]*/g,
  /(?<![A-Za-z0-9])(?:(?:sk|rk)[-_][\w-]{16,}|sbp_\w{16,}|gh[opsru]_[A-Za-z0-9]{16,}|github_pat_\w{16,}|glpat-[\w-]{16,}|xox[abeoprs]-[A-Za-z0-9-]{8,}|npm_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|ATATT3[\w=-]{16,}|whsec_[A-Za-z0-9]{16,})/g,
  /\b(?:Bearer|Basic)\s+[\w.~+/=-]{8,}/g,
  /(?<=:\/\/)[^/\s:@"]+:[^/\s@"]+(?=@)/g,
];
const SECRET_HEADER = /((?:authorization|set-cookie|cookie)["']?[ \t]*:[ \t]*)[^ \t\r\n][^\r\n]*/gi;
const SECRET_ASSIGNMENT = /((?:passw(?:or)?d|pwd|secret|token|api[_-]?key|signature|session[_-]?id)[\w-]{0,20}["']?[ \t]*[:=][ \t]*["']?)[^\s&"',;<>]+/gi;

function isSecretKeyName(key: string): boolean {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  return SECRET_KEY.test(key) || words.some(word => SECRET_KEY_WORDS.has(word));
}

function isOpaqueToken(value: string): boolean {
  return /^[a-f0-9]{32,}$/i.test(value)
    || (/^[\w+/=-]{20,}$/.test(value) && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value));
}

function maskText(text: string): string {
  if (isOpaqueToken(text)) {
    return MASKED;
  }
  return SECRET_SHAPES.reduce((out, shape) => out.replace(shape, MASKED), text)
    .replace(SECRET_HEADER, `$1${MASKED}`)
    .replace(SECRET_ASSIGNMENT, `$1${MASKED}`);
}

// `credential` is true inside a credential object, where only identity fields stay readable.
function maskData(value: unknown, key: string, credential: boolean): unknown {
  if (isSecretKeyName(key)) {
    return MASKED;
  }
  const guarded = credential || /credential/i.test(key);
  const hidden = guarded && !IDENTITY_KEYS.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase());
  if (typeof value === 'string') {
    return hidden ? MASKED : maskText(value);
  }
  if (typeof value === 'number') {
    return hidden ? MASKED : value;
  }
  if (Array.isArray(value)) {
    return value.map(item => maskData(item, key, guarded));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const secretValue = 'domain' in record || (typeof record.name === 'string' && isSecretKeyName(record.name));
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, secretValue && k === 'value' ? MASKED : maskData(v, k, guarded)]));
}

function maskedContent(data: unknown): string {
  if (typeof data !== 'string') {
    return JSON.stringify(maskData(JSON.parse(JSON.stringify(data)), '', false), null, 2);
  }
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'object' && parsed !== null) {
      return JSON.stringify(maskData(parsed, '', false), null, 2);
    }
  }
  catch {
    // A body that is not JSON is masked as text
  }
  return maskText(data);
}

export interface AllureFilenameArgs {
  url: string
  suffix: string
}

export interface AttachJsonArgs {
  name: string
  data: unknown
  contentType?: ContentType
}

export interface AttachRequestResponseArgs {
  url: string
  method: string
  responseBody?: unknown
  requestBody?: unknown
}

export function generateAllureFilename(args: AllureFilenameArgs): string {
  const { url, suffix } = args;

  const cleanUrl = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');

  const segments = cleanUrl.split('/').filter(Boolean).slice(-2).map(s => (maskText(s) === s ? s : 'masked'));
  const pathPart = segments.length > 0 ? segments.join('_') : 'root';

  const cleanPath = pathPart.replace(/[^a-z0-9]/gi, '_').slice(0, 50);

  return `${cleanPath}_${suffix}`;
}

export async function attachJsonToAllure(args: AttachJsonArgs): Promise<void> {
  const { name, data, contentType = ContentType.JSON } = args;

  try {
    if (data === undefined || data === null) {
      return;
    }

    if (typeof data === 'object' && Object.keys(data).length === 0) {
      return;
    }

    await allure.attachment(name, maskedContent(data), contentType);
  }
  catch {
    // Allure might not be available in all contexts
  }
}

export async function attachRequestResponseToAllure(
  args: AttachRequestResponseArgs,
): Promise<void> {
  const { url, method, responseBody, requestBody } = args;

  try {
    if (responseBody !== undefined && responseBody !== null) {
      const isNonEmpty = typeof responseBody !== 'object' || Object.keys(responseBody).length > 0;
      if (isNonEmpty) {
        const filename = generateAllureFilename({ url, suffix: `${method}_response` });
        await attachJsonToAllure({ name: filename, data: responseBody });
      }
    }

    if (requestBody !== undefined && requestBody !== null) {
      const isNonEmpty = typeof requestBody !== 'object' || Object.keys(requestBody).length > 0;
      if (isNonEmpty) {
        const filename = generateAllureFilename({ url, suffix: `${method}_request` });
        await attachJsonToAllure({ name: filename, data: requestBody });
      }
    }
  }
  catch {
    // Allure might not be available in all contexts
  }
}
