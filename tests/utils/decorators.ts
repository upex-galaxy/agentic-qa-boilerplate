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
        const stepTitle = `ATC [${testId}]: ${methodName}${formatArgs(args)}`;
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
    const stepTitle = `${methodName}${formatArgs(args)}`;
    return test.step(stepTitle, async () => {
      return originalMethod.apply(this, args);
    });
  }

  return replacement as T;
}

const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'authorization', 'access_token']);
const MAX_STRING_LEN = 80;
const MAX_OBJECT_LEN = 120;

function formatValue(value: unknown, key?: string): string {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return '"***"';
  }
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
    return value.length > MAX_STRING_LEN
      ? `"${value.slice(0, MAX_STRING_LEN)}..."`
      : `"${value}"`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const formatted = entries
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${formatValue(v, k)}`)
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

function formatArgs(args: unknown[]): string {
  if (args.length === 0) {
    return '()';
  }
  return `(${args.map(a => formatValue(a)).join(', ')})`;
}

export const ATC_PARTIAL_PATH = resolve('reports/.atc_partial.ndjson');

function storeResult(_testId: string, result: AtcResult) {
  mkdirSync(dirname(ATC_PARTIAL_PATH), { recursive: true });
  appendFileSync(ATC_PARTIAL_PATH, `${JSON.stringify(result)}\n`);
}
