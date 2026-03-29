/**
 * KATA Framework - ATC Decorator & Result Tracking
 *
 * The @atc decorator connects test methods to Jira/Xray test cases
 * and tracks execution results for reporting and TMS synchronization.
 *
 * Logging happens ONLY within the decorator - not in base components.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { test } from '@playwright/test';
import { config } from '@variables';
import * as allure from 'allure-js-commons';

import { ContentType } from 'allure-js-commons';

// ============================================
// Types
// ============================================

export interface AtcResult {
  testId: string
  methodName: string
  className: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  error: string | null
  executedAt: string
  duration: number
  softFail: boolean
}

export interface AtcOptions {
  softFail?: boolean
  description?: string
  severity?: 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial'
}

// ============================================
// ATC Decorator
// ============================================

/**
 * @atc decorator for marking methods as Acceptance Test Cases
 *
 * Connects the method to a Jira/Xray test case and tracks execution.
 * This decorator handles ALL logging - base components should NOT log.
 *
 * Uses TC39 Stage 3 decorator format (Bun/modern TypeScript).
 *
 * @param testId - The Jira/Xray Test ID (e.g., 'UPEX-101')
 * @param options - Optional configuration
 * @param options.softFail - If true, continues execution on failure (default: false)
 * @param options.severity - Allure severity level: 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial'
 * @param options.description - Description for Allure report
 * @examples - Usage
 * Basic Usage - UI Component
 * ```typescript
 * @atc('UPEX-101')
 * async fillEmailSuccessfully(email: string) {
 *   const input = this.page.locator('[data-testid="email"]');
 *   await input.fill(email);
 *   await expect(input).toHaveValue(email);
 * }
 * ```
 *
 * Basic Usage - API Component
 * ```typescript
 *  @atc('UPEX-101')
 * async createUserSuccessfully(data: UserPayload): Promise<[APIResponse, User, UserPayload]> {
 *   const [response, body, payload] = await this.apiPOST<User, UserPayload>('/users', data);
 *   expect(response.status()).toBe(201);
 *   return [response, body, payload];
 * }
 * ```
 *
 * With Options
 * ```typescript
 * @atc('UPEX-102', {
 *   severity: 'critical',
 *   description: 'Validates the complete checkout flow'
 * })
 * async completeCheckoutSuccessfully() { ... }
 *
 * @atc('UPEX-103', { softFail: true })
 * async verifyOptionalBanner() {
 *   // Won't fail the test if this assertion fails
 * }
 * ```
 *
 * Console Output
 * ```typescript
 * ✅ [UPEX-101] fillEmailSuccessfully - PASS (234ms)
 * ❌ [UPEX-102] submitFormSuccessfully - FAIL: Element not found
 * ⚠️ [UPEX-103] Soft fail enabled - continuing execution
 * ```
 */
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

      // Add Allure metadata
      try {
        allure.label('testId', testId);

        if (options.description !== undefined && options.description !== '') {
          allure.description(options.description);
        }

        if (options.severity !== undefined) {
          allure.severity(options.severity);
        }

        // Link to Jira test case
        if (config.tms.jira.url !== '') {
          allure.link(`${config.tms.jira.url}/browse/${testId}`, testId, 'tms');
        }
      }
      catch {
        // Allure might not be available in all contexts
      }

      try {
        // Execute within test.step (visible in KataReporter + auto-captured by allure-playwright)
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
        result.status = 'FAIL';
        result.error = error instanceof Error ? error.message : String(error);
        result.duration = Date.now() - startTime;
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

// ============================================
// Step Decorator (helper tracing)
// ============================================

/**
 * @step decorator for helper method tracing
 *
 * Wraps the method in Playwright's test.step() so it appears in KataReporter.
 * Shows method name and formatted parameters in the terminal.
 *
 * Use on Layer 3 public helper methods (read-only queries).
 * Do NOT use on @atc methods or Layer 2 base methods.
 *
 * @example
 * @step
 * async getBookings(filters: BookingFilters) {
 *   return this.apiGET<BookingVmContainer>('/bookings', { params });
 * }
 * // Terminal: ---- ✓ getBookings({ start: "2024-09-01", end: "2024-09-30" })
 */
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

// ============================================
// Parameter Formatting (for step titles)
// ============================================

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

function formatArgs(args: unknown[]): string {
  if (args.length === 0) {
    return '()';
  }
  return `(${args.map(a => formatValue(a)).join(', ')})`;
}

// ============================================
// Result Storage Functions
// ============================================

/**
 * NDJSON file path for cross-process ATC result persistence.
 *
 * Playwright runs each project (setup, e2e, integration, teardown) in
 * separate worker processes. In-memory Maps don't survive across them.
 * Each @atc execution appends one JSON line here; KataReporter.onEnd()
 * aggregates all lines into the final report.
 */
export const ATC_PARTIAL_PATH = resolve('reports/.atc_partial.ndjson');

function storeResult(_testId: string, result: AtcResult) {
  mkdirSync(dirname(ATC_PARTIAL_PATH), { recursive: true });
  appendFileSync(ATC_PARTIAL_PATH, `${JSON.stringify(result)}\n`);
}
