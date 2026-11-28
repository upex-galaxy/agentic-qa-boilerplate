import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { test } from '@playwright/test';
import { config } from '@variables';
import * as allure from 'allure-js-commons';

import { ContentType } from 'allure-js-commons';

export interface AtcResult {
  testId: string
  methodName: string
  className: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  error: string | null
  executedAt: string
  duration: number
  softFail: boolean
  playwrightTestId?: string
}

export interface AtcOptions {
  softFail?: boolean
  description?: string
  severity?: 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial'
  sensitive?: boolean
}

export function atc(testId: string, options: AtcOptions = {}) {
  // eslint-disable-next-line ts/no-explicit-any -- Required for decorator flexibility with strict mode
  return function <T extends (...args: any[]) => Promise<any>>(
    originalMethod: T,
    context: ClassMethodDecoratorContext,
  ): T {
    const methodName = String(context.name);

    // eslint-disable-next-line ts/no-explicit-any -- Matches generic T signature
    async function replacement(this: { constructor: { name: string } }, ...args: any[]) {
      const startTime = Date.now();
      const className = this.constructor.name;

      const result: AtcResult = {
        testId,
        methodName,
        className,
        status: 'PASS',
        error: null,
        executedAt: new Date().toISOString(),
        duration: 0,
        softFail: options.softFail || false,
      };

      try {
        allure.label('testId', testId);

        if (options.description !== undefined && options.description !== '') {
          allure.description(options.description);
        }

        if (options.severity !== undefined) {
          allure.severity(options.severity);
        }

        if (config.tms.jira.url !== '') {
          allure.link(`${config.tms.jira.url}/browse/${testId}`, testId, 'tms');
        }
      }
      catch {
        // Allure might not be available in all contexts
      }

      // Tag the test with this ATC id so KataReporter maps outcomes to TC ids (ADR-0020).
      try {
        result.playwrightTestId = test.info().testId;
        const annotations = test.info().annotations;
        if (!annotations.some(a => a.type === 'atc' && a.description === testId)) {
          annotations.push({ type: 'atc', description: testId });
        }
      }
      catch {
        // Called outside a running test: there is nothing to tag
      }

      try {
        const stepTitle = `ATC [${testId}]: ${methodName}${formatArgs(originalMethod, methodName, args, options.sensitive)}`;
        const returnValue = await test.step(stepTitle, async () => {
          return originalMethod.apply(this, args);
        });

        result.status = 'PASS';
        result.duration = Date.now() - startTime;
        storeResult(testId, result);

        console.log(`✅ [${testId}] ${methodName} - PASS (${result.duration}ms)`);

        return returnValue;
      }
      catch (error: unknown) {
        result.error = error instanceof Error ? error.message : String(error);
        result.duration = Date.now() - startTime;

        // A runtime test.skip() throws to stop the test: NOT RUN (ADR-0020), not a failure, so it must propagate.
        if (isSkipping()) {
          result.status = 'SKIP';
          storeResult(testId, result);
          console.log(`⏭️ [${testId}] ${methodName} - SKIP: ${result.error}`);
          throw error;
        }

        result.status = 'FAIL';
        storeResult(testId, result);

        console.log(`❌ [${testId}] ${methodName} - FAIL: ${result.error}`);

        if (options.softFail) {
          console.log(`⚠️ [${testId}] Soft fail enabled - continuing execution`);

          try {
            await allure.attachment('Soft Fail Error', result.error, ContentType.TEXT);
          }
          catch {
            // Allure might not be available
          }

          return undefined;
        }

        throw error;
      }
    }

    return replacement as T;
  };
}

// eslint-disable-next-line ts/no-explicit-any -- Required for decorator flexibility with strict mode
export function step<T extends (...args: any[]) => Promise<any>>(
  originalMethod: T,
  context: ClassMethodDecoratorContext,
): T {
  const methodName = String(context.name);

  // eslint-disable-next-line ts/no-explicit-any -- Matches generic T signature
  async function replacement(this: unknown, ...args: any[]) {
    const stepTitle = `${methodName}${formatArgs(originalMethod, methodName, args)}`;
    return test.step(stepTitle, async () => {
      return originalMethod.apply(this, args);
    });
  }

  return replacement as T;
}

const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'authorization', 'access_token']);
const SENSITIVE_STEM = /passw|passcode|passphrase|pwd|secret|token|authorization|cookie|api[_-]?key|access[_-]?key|private[_-]?key|session[_-]?id|signature/i;
const SENSITIVE_WORDS = new Set(['pass', 'pw', 'auth', 'bearer', 'otp', 'pin', 'cvv']);
const SENSITIVE_METHOD = /log_?in|sign_?(?:in|up)|authenticat|authoriz|register|passw|credential|token|secret|api_?key|otp/i;
const IDENTITY_NAMES = new Set(['email', 'mail', 'useremail', 'emailaddress', 'user', 'username', 'userid', 'login']);
const SECRET_SHAPES = [
  /eyJ[\w-]{5,}\.[\w-]{2,}\./,
  /(?<![A-Za-z0-9])(?:(?:sk|rk)[-_][\w-]{16,}|sbp_\w{16,}|gh[opsru]_[A-Za-z0-9]{16,}|github_pat_\w{16,}|glpat-[\w-]{16,}|xox[abeoprs]-[A-Za-z0-9-]{8,}|npm_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|ATATT3[\w=-]{16,}|whsec_[A-Za-z0-9]{16,})/,
  /\b(?:Bearer|Basic)\s+[\w.~+/=-]{8,}/,
  /:\/\/[^/\s:@]+:[^/\s@]+@/,
  /(?:passw(?:or)?d|pwd|secret|token|api_?key|signature)=[^&\s]+/i,
];
const PLAIN_ADDRESS = /^(?:https?:\/\/\S+|[^@\s]+@[^@\s]+\.[a-z]{2,})$/i;
const PASSWORD_CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[!#$%^&*()+=[\]{}|;:'",<>?~`@\\]/];
const MASKED = '"***"';
const MAX_STRING_LEN = 80;
const MAX_OBJECT_LEN = 120;

function isSensitiveName(name: string): boolean {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  return SENSITIVE_KEYS.has(name.toLowerCase())
    || SENSITIVE_STEM.test(name)
    || words.some(word => SENSITIVE_WORDS.has(word));
}

function isIdentityName(name: string): boolean {
  return IDENTITY_NAMES.has(name.replace(/[^a-z0-9]/gi, '').toLowerCase());
}

function looksSecret(value: string): boolean {
  if (SECRET_SHAPES.some(shape => shape.test(value))) {
    return true;
  }
  if (/\s/.test(value) || value.length < 8 || PLAIN_ADDRESS.test(value)) {
    return false;
  }
  const opaque = /^[a-f0-9]{32,}$/i.test(value)
    || (value.length >= 20 && /^[\w+/=-]+$/.test(value) && PASSWORD_CLASSES.slice(0, 3).every(c => c.test(value)));
  return opaque || PASSWORD_CLASSES.every(c => c.test(value));
}

// `credential` is true inside a credential-taking call or object, where only identity fields stay readable.
function formatValue(value: unknown, name: string, credential: boolean): string {
  if (isSensitiveName(name)) {
    return MASKED;
  }
  const guarded = credential || /credential/i.test(name);
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'function') {
    return '[Function]';
  }

  if (typeof value === 'string') {
    if ((guarded && !isIdentityName(name)) || looksSecret(value)) {
      return MASKED;
    }
    return value.length > MAX_STRING_LEN
      ? `"${value.slice(0, MAX_STRING_LEN)}..."`
      : `"${value}"`;
  }

  if (typeof value === 'number') {
    return guarded && !isIdentityName(name) ? MASKED : String(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record);
    const secretPair = typeof record.name === 'string' && isSensitiveName(record.name);
    const formatted = entries
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${secretPair && k === 'value' ? MASKED : formatValue(v, k, guarded)}`)
      .join(', ');
    const suffix = entries.length > 5 ? ', ...' : '';
    const result = `{ ${formatted}${suffix} }`;
    return result.length > MAX_OBJECT_LEN
      ? `${result.slice(0, MAX_OBJECT_LEN)}...}`
      : result;
  }

  return String(value);
}

function isSkipping(): boolean {
  try {
    return test.info().expectedStatus === 'skipped';
  }
  catch {
    return false;
  }
}

// A decorated method can reach us as `async[(decorators, "name")](a, b)`, so a "(" inside brackets is skipped.
function parameterStart(source: string): number {
  let brackets = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '[') {
      brackets++;
    }
    else if (source[i] === ']') {
      brackets--;
    }
    else if (source[i] === '(' && brackets === 0) {
      return i;
    }
  }
  return -1;
}

// A rest or destructured slot has no name.
function parameterNames(source: string): (string | undefined)[] {
  const slots: string[] = [''];
  let depth = 0;
  let quote = '';
  for (let i = parameterStart(source); i >= 0 && i < source.length; i++) {
    const char = source[i];
    if (quote !== '') {
      if (char === '\\') {
        i++;
      }
      else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
    }
    else if (char === '(' || char === '{' || char === '[') {
      depth++;
      if (depth === 1) {
        continue;
      }
    }
    else if (char === ')' || char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        break;
      }
    }
    else if (char === ',' && depth === 1) {
      slots.push('');
      continue;
    }
    slots[slots.length - 1] += char;
  }
  return slots.map(slot => /^\s*([A-Z_$][\w$]*)/i.exec(slot)?.[1]);
}

function formatArgs(method: { toString: () => string }, methodName: string, args: unknown[], sensitive = false): string {
  if (args.length === 0) {
    return '()';
  }
  const names = parameterNames(method.toString());
  const credential = SENSITIVE_METHOD.test(methodName);
  const formatted = args.map((arg, index) => {
    const name = names[index];
    if (sensitive) {
      return MASKED;
    }
    // A text argument nobody can name is masked: it may be the password.
    if (name === undefined && (typeof arg === 'string' || typeof arg === 'number')) {
      return MASKED;
    }
    return formatValue(arg, name ?? '', credential);
  });
  return `(${formatted.join(', ')})`;
}

export const ATC_PARTIAL_PATH = resolve('reports/.atc_partial.ndjson');

function storeResult(_testId: string, result: AtcResult) {
  mkdirSync(dirname(ATC_PARTIAL_PATH), { recursive: true });
  appendFileSync(ATC_PARTIAL_PATH, `${JSON.stringify(result)}\n`);
}
