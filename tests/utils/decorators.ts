/**
 * KATA Framework - ATC Decorator & Result Tracking
 *
 * The @atc decorator connects test methods to Jira/Xray test cases
 * and tracks execution results for reporting and TMS synchronization.
 *
 * Logging happens ONLY within the decorator - not in base components.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
 * @param testId - The Jira/Xray Test ID (e.g., 'PROJ-001')
 * @param options - Optional configuration
 * @param options.softFail - If true, continues execution on failure (default: false)
 * @param options.severity - Allure severity level: 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial'
 * @param options.description - Description for Allure report
 * @examples - Usage
 * Basic Usage - UI Component
 * ```typescript
 * @atc('PROJ-001')
 * async fillEmailSuccessfully(email: string) {
 *   const input = this.page.locator('[data-testid="email"]');
 *   await input.fill(email);
 *   await expect(input).toHaveValue(email);
 * }
 * ```
 *
 * Basic Usage - API Component
 * ```typescript
 *  @atc('PROJ-001')
 * async createUserSuccessfully(data: UserPayload): Promise<[APIResponse, User, UserPayload]> {
 *   const [response, body, payload] = await this.apiPOST<User, UserPayload>('/users', data);
 *   expect(response.status()).toBe(201);
 *   return [response, body, payload];
 * }
 * ```
 *
 * With Options
 * ```typescript
 * @atc('PROJ-002', {
 *   severity: 'critical',
 *   description: 'Validates the complete checkout flow'
 * })
 * async completeCheckoutSuccessfully() { ... }
 *
 * @atc('PROJ-UI-003', { softFail: true })
 * async verifyOptionalBanner() {
 *   // Won't fail the test if this assertion fails
 * }
 * ```
 *
 * Console Output
 * ```typescript
 * ✅ [PROJ-001] fillEmailSuccessfully - PASS (234ms)
 * ❌ [PROJ-002] submitFormSuccessfully - FAIL: Element not found
 * ⚠️ [PROJ-UI-003] Soft fail enabled - continuing execution
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
        // Execute within Allure step
        const returnValue = await allure.step(`ATC: ${testId} - ${methodName}`, async () => {
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
// Result Storage Functions
// ============================================

function storeResult(testId: string, result: AtcResult) {
  const existing = atcResults.get(testId);
  if (existing) {
    existing.push(result);
  }
  else {
    atcResults.set(testId, [result]);
  }
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

export async function generateAtcReport(outputPath = 'reports/atc_results.json') {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: getAtcSummary(),
    results: getAtcResultsObject(),
  };

  // Create parent directories if they don't exist
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`📊 ATC Report generated: ${outputPath}`);
}
