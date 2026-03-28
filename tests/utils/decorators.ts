/**
 * KATA Framework - ATC Decorator & Result Tracking
 *
 * The @atc decorator connects test methods to Jira/Xray test cases
 * and tracks execution results for reporting and TMS synchronization.
 *
 * Logging happens ONLY within the decorator - not in base components.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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
// Global Results Storage
// ============================================

const atcResults: Map<string, AtcResult[]> = new Map();

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
 * Each @atc execution appends one JSON line here; the teardown reads
 * and aggregates all lines into the final report.
 */
const NDJSON_PATH = resolve('reports/atc_results.ndjson');

function storeResult(testId: string, result: AtcResult) {
  // In-memory (useful within the same worker)
  const existing = atcResults.get(testId);
  if (existing) {
    existing.push(result);
  }
  else {
    atcResults.set(testId, [result]);
  }

  // Persist to NDJSON (survives across worker processes)
  mkdirSync(dirname(NDJSON_PATH), { recursive: true });
  appendFileSync(NDJSON_PATH, `${JSON.stringify(result)}\n`);
}

/**
 * Read all ATC results from the NDJSON file (cross-process aggregation).
 * Groups results by testId for the final report.
 */
function readNdjsonResults(): Record<string, AtcResult[]> {
  const results: Record<string, AtcResult[]> = {};

  if (!existsSync(NDJSON_PATH)) {
    return results;
  }

  const lines = readFileSync(NDJSON_PATH, 'utf-8').split('\n').filter(Boolean);

  for (const line of lines) {
    const result = JSON.parse(line) as AtcResult;
    if (results[result.testId]) {
      results[result.testId].push(result);
    }
    else {
      results[result.testId] = [result];
    }
  }

  return results;
}

export function getAtcResults() {
  return new Map(atcResults);
}

export function getAtcResultsObject() {
  const obj: Record<string, AtcResult[]> = {};
  atcResults.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

export function clearAtcResults() {
  atcResults.clear();
}

export function getAtcSummary() {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const testIds: string[] = [];

  atcResults.forEach((results, testId) => {
    testIds.push(testId);
    results.forEach((r) => {
      total++;
      if (r.status === 'PASS') {
        passed++;
      }
      else if (r.status === 'FAIL') {
        failed++;
      }
      else {
        skipped++;
      }
    });
  });

  return { total, passed, failed, skipped, testIds };
}

// ============================================
// Report Generation
// ============================================

/**
 * Generates the final ATC report by reading the NDJSON file
 * (which was populated by all worker processes during test execution).
 *
 * This is called from the global teardown, which runs in its own process.
 * The in-memory Map would be empty here — NDJSON is the source of truth.
 */
export interface AtcSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  testIds: string[]
}

export async function generateAtcReport(outputPath = 'reports/atc_results.json'): Promise<AtcSummary> {
  // Read from NDJSON (cross-process results)
  const allResults = readNdjsonResults();

  // Compute summary from disk results
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const testIds: string[] = [];

  for (const [testId, results] of Object.entries(allResults)) {
    testIds.push(testId);
    for (const r of results) {
      total++;
      if (r.status === 'PASS') {
        passed++;
      }
      else if (r.status === 'FAIL') {
        failed++;
      }
      else {
        skipped++;
      }
    }
  }

  const summary: AtcSummary = { total, passed, failed, skipped, testIds };

  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    results: allResults,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`📊 ATC Report generated: ${outputPath}`);

  // Clean up NDJSON after aggregation
  if (existsSync(NDJSON_PATH)) {
    unlinkSync(NDJSON_PATH);
  }

  return summary;
}
