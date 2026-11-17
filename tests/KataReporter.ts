import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import type { AtcResult } from '@utils/decorators';
import type { OutcomeAnnotation, OutcomeInput, OutcomeRecord, OutcomesDocument } from '@utils/testOutcomes';

import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

import { ATC_PARTIAL_PATH } from '@utils/decorators';
import {
  actionItemLines,
  buildOutcomeRecords,
  buildOutcomesDocument,
  isListOnlyRun,
  listedHeadline,
  outcomeCountsLine,
  outcomeHeadline,
  OUTCOMES_PATH,
  stepSummaryMarkdown,
} from '@utils/testOutcomes';
import { env, config as testConfig } from '@variables';

const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[90m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  white: '\x1B[37m',
  bgGreen: '\x1B[102m',
  bgRed: '\x1B[41m',
  bgYellow: '\x1B[43m',
  bgBlack: '\x1B[30m',
};

class KataReporter implements Reporter {
  private startTime: number;
  private endTime: number;
  private testResults: TestAttr[];
  private retryCount: number;
  private totalRetries: number;
  private runningTests: TestCase[];
  private parallelTests: boolean;
  private totalTests: number;
  private rootSuite: Suite | undefined;
  private listOnly = false;
  /** Stamped on both reports/atc_results.json and reports/test-outcomes.json, so a reader can tell a stale pair. */
  private readonly runId = randomUUID();
  private fullConfig: FullConfig | undefined;

  constructor() {
    this.startTime = 0;
    this.endTime = 0;
    this.testResults = [];
    this.retryCount = 0;
    this.totalRetries = 0;
    this.runningTests = [];
    this.parallelTests = false;
    this.totalTests = 0;
  }

  onBegin(config: FullConfig, suite: Suite) {
    if (process.env.CI) {
      console.log(`${colors.yellow}%s${colors.reset}`, '🧩 Running in CI...');
    }

    this.startTime = Date.now();
    this.rootSuite = suite;
    this.fullConfig = config;
    this.totalTests = suite.allTests().length;
    this.parallelTests = config.workers > 1;
    this.runningTests = suite.allTests();

    const usedWorkers = config.workers === 1 ? '1 worker' : `${config.workers} workers`;
    console.log('\n', `🎬 Total Tests to Run: ${this.totalTests} TC using ${usedWorkers}`);

    if (suite.suites.length === 1) {
      const usedProject = suite.suites[0].title;
      console.log(
        `${colors.green}%s${colors.reset}`,
        `🚀 Starting Test Execution in ${usedProject.toUpperCase()}...`,
      );
    }
    else {
      const projectNames = suite.suites.map(({ title }) => title);
      console.log(
        `${colors.green}%s${colors.reset}`,
        `🚀 Starting Test Execution in ${projectNames.join(', ').toUpperCase()}...`,
      );
    }
  }

  onTestBegin(test: TestCase) {
    this.totalRetries = test.retries;

    const runningTestCase = this.runningTests.find(({ id }) => id === test.id);
    if (!runningTestCase) {
      throw new Error('Test not found in runningTests');
    }

    const testNumber = this.runningTests.indexOf(runningTestCase) + 1;
    const testWorker = this.parallelTests ? ` (worker: ${test.results[0].workerIndex + 1})` : '';
    const testLabel = `[${testNumber}/${this.totalTests}]`;

    if (test.expectedStatus === 'skipped') {
      console.log(
        `\n${colors.dim}%s${colors.reset}`,
        `🔧${testWorker} Skipped Test ${testLabel} => ${runningTestCase.title}`,
      );
    }
    else {
      const testRetry = runningTestCase.results[0].retry;
      const retryLabel = testRetry >= 1 ? ` 💫 Retry #${testRetry}` : '';
      console.log(
        `\n${colors.blue}%s${colors.reset}`,
        `🧪${testWorker} Running Test ${testLabel} => ${runningTestCase.title}${retryLabel}`,
      );
    }

    this.testResults.push({
      testID: test.id,
      testNumber,
      testName: test.title,
      testWorker,
    });
  }

  onStepBegin(test: TestCase, _result: TestResult, step: TestStep) {
    if (step.category !== 'test.step') {
      return;
    }

    const testName = this.parallelTests ? ` -- ${test.title}` : '';
    console.group();
    console.log(`${colors.white}%s${colors.reset}`, `---- ✓ ${step.title}${testName}`);
  }

  onStepEnd(test: TestCase, _result: TestResult, step: TestStep) {
    if (step.category !== 'test.step') {
      return;
    }

    const testRun = this.testResults.find(({ testID }) => testID === test.id);
    if (!testRun) {
      throw new Error('Test not found in testResults');
    }

    const testLabel = `[${testRun.testNumber}/${this.totalTests}]`;
    const testName = this.parallelTests ? ` -- ${testLabel} ${test.title}` : '';

    console.group();

    if (step.error !== undefined) {
      console.log(
        `${colors.red}%s${colors.reset}`,
        `---- step failed 🔴 [${step.duration}ms]${testName}`,
      );
      if (step.error.location !== undefined) {
        console.log(`${colors.red}%s${colors.reset}`, '---- 🔎 Located in:', step.error.location);
      }
      if (step.error.snippet !== undefined && step.error.snippet !== '') {
        console.log(`${colors.red}%s${colors.reset}`, '---- 🔴 Snippet:');
        console.log(step.error.snippet);
      }
      if (step.error.message !== undefined && step.error.message !== '') {
        console.log(`${colors.red}%s${colors.reset}`, '---- 🔴 Error:', step.error.message);
      }
      console.log(`${colors.red}%s${colors.reset}`, '---- ✔️ File:', test.titlePath()[2]);
    }
    else {
      console.log(
        `${colors.green}%s${colors.reset}`,
        `---- step passed ✅ [${step.duration}ms]${testName}`,
      );
    }

    console.groupEnd();
    console.groupEnd();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const testRun = this.testResults.find(({ testID }) => testID === test.id);
    if (!testRun) {
      throw new Error('Test not found in testResults');
    }

    const testLabel = `[${testRun.testNumber}/${this.totalTests}]`;
    const testName = this.parallelTests ? ` -- ${testLabel} ${test.title}` : '';

    console.group();

    switch (result.status) {
      case 'passed':
        console.log(
          `${colors.green}%s${colors.reset}`,
          `---- 🔎 Test Output: ✅ PASSED${testName}`,
        );
        this.retryCount = 0;
        break;

      case 'failed':
      case 'timedOut':
      case 'interrupted':
        this.logTestError(result, testName);
        this.retryCount = result.retry + 1;
        if (this.retryCount > this.totalRetries) {
          this.retryCount = 0;
        }
        break;
    }

    console.groupEnd();

    const index = this.testResults.indexOf(testRun);
    this.testResults[index].testStatus = result.status;
    this.testResults[index].testDuration = result.duration;
  }

  onStdOut(chunk: string | Buffer, _test: void | TestCase, result: void | TestResult) {
    const output = chunk.toString().trim();
    if (output) {
      console.log(output);
    }
    if (result && result.errors.length > 0) {
      console.log(result.errors);
    }
  }

  onStdErr(chunk: string | Buffer, _test: void | TestCase, result: void | TestResult) {
    const output = chunk.toString().trim();
    if (output) {
      console.error(output);
    }
    if (result && result.errors.length > 0) {
      console.log(result.errors);
    }
  }

  printsToStdio(): boolean {
    return true;
  }

  onError(error: TestError) {
    console.group();
    if (error.message !== undefined && error.message !== '') {
      console.log(`${colors.red}%s${colors.reset}`, '---- 🔴 Error Exception:', error.message);
    }
    if (error.location !== undefined) {
      console.log(`${colors.red}%s${colors.reset}`, '---- 🔴 Error Location:', error.location);
    }
    if (error.value !== undefined && error.value !== '') {
      console.log(`${colors.red}%s${colors.reset}`, '---- 🔴 Error Value:', error.value);
    }
    if (error.snippet !== undefined && error.snippet !== '') {
      console.log(`${colors.red}%s${colors.reset}`, '---- 🔴 Error Snippet:', error.snippet);
    }
    console.groupEnd();
  }

  onEnd(result: FullResult) {
    // Outcomes first: they decide `listOnly`, which the ATC report reads.
    const outcomes = this.generateOutcomesReport(result);
    this.generateAtcReport();
    const classOf = new Map(outcomes?.records.map(r => [r.id, r]) ?? []);

    this.endTime = Date.now();
    const duration = (this.endTime - this.startTime) / 1000;

    const resultMessages: Record<string, string> = {
      passed: ' ALL TESTS PASSED ',
      failed: ' EXECUTION FAILED - there is one or more failed tests ',
      timedout: ' TIMEDOUT - execution run out of time ',
      interrupted: ' INTERRUPTED - execution was interrupted ',
    };

    console.log(
      `\n${colors.bgYellow}${colors.bgBlack}%s${colors.reset}`,
      '📊 TEST REPORT SUMMARY:',
      '\n',
    );

    const sorted = [...this.testResults].sort((a, b) => a.testNumber - b.testNumber);
    console.group();
    for (const test of sorted) {
      if (test.testDuration === undefined) {
        continue;
      }

      const durationSec = (test.testDuration / 1000).toFixed(3);
      const record = classOf.get(test.testID);
      const label = record ? this.getOutcomeLabel(record) : test.testStatus;
      const icon = record ? this.getOutcomeIcon(record) : this.getStatusIcon(test.testStatus);
      const color = this.getOutcomeColor(record, test.testStatus);

      console.log(
        `${color}%s${colors.reset}`,
        `${label} ${icon} ${test.testNumber} 🧪 ${test.testName} ${durationSec}s`,
      );
    }
    console.groupEnd();

    console.log('\n', `⏰ Test Execution Ended in ${duration.toFixed(2)} seconds.`);

    // Headline comes from outcome records, not Playwright ok(): a setup cascade is ok() there, a known defect is not a pass.
    const headline = outcomes ? outcomeHeadline(outcomes.summary, result.status) : undefined;
    const message = headline ? ` ${headline.text} ` : resultMessages[result.status];
    const green = headline ? headline.ok : result.status === 'passed';

    if (this.listOnly) {
      console.log(
        `${colors.bold}${colors.white}%s${colors.reset}${colors.bgYellow}${colors.bgBlack}%s${colors.reset}`,
        '🚀 Overall Output: 📋 ',
        ` ${listedHeadline(this.totalTests)} `,
      );
    }
    else if (green) {
      console.log(
        `${colors.bold}${colors.white}%s${colors.reset}${colors.bgGreen}${colors.bgBlack}%s${colors.reset}`,
        '🚀 Overall Output: ✅ ',
        message,
      );
    }
    else {
      console.log(
        `${colors.bold}${colors.white}%s${colors.reset}${colors.bgRed}${colors.white}%s${colors.reset}`,
        '🚀 Overall Output: 🔴 ',
        message,
      );
    }

    if (outcomes) {
      console.log(`${colors.dim}%s${colors.reset}`, `   ${outcomeCountsLine(outcomes.summary)}`);
      for (const line of actionItemLines(outcomes.records)) {
        console.log(`${colors.yellow}%s${colors.reset}`, `   ⚑ ${line}`);
      }
    }

    console.log(colors.reset);
  }

  private generateOutcomesReport(result: FullResult): OutcomesDocument | undefined {
    if (this.rootSuite === undefined || this.fullConfig === undefined) {
      return undefined;
    }

    const inputs: OutcomeInput[] = this.rootSuite.allTests().map((test) => {
      const project = test.parent.project()?.name ?? '';
      const lastResult = test.results.at(-1);
      const annotations: OutcomeAnnotation[] = [];
      for (const a of [...test.annotations, ...(lastResult?.annotations ?? [])]) {
        if (!annotations.some(b => b.type === a.type && b.description === a.description)) {
          annotations.push({ type: a.type, description: a.description });
        }
      }
      return {
        id: test.id,
        title: test.title,
        titlePath: test.titlePath(),
        file: relative(process.cwd(), test.location.file),
        line: test.location.line,
        project,
        parentKey: [project, ...test.parent.titlePath()].join(' > '),
        expectedStatus: test.expectedStatus,
        annotations,
        tags: test.tags,
        attempts: test.results.map(r => ({ status: r.status, durationMs: r.duration, error: r.error?.message })),
      };
    });

    const dependencies: Record<string, string[]> = {};
    for (const project of this.fullConfig.projects) {
      dependencies[project.name] = project.dependencies;
    }

    // `--list` reaches onEnd with no attempt: nothing ran, so there is no outcome to record.
    if (isListOnlyRun(result.status, inputs)) {
      this.listOnly = true;
      return undefined;
    }

    const records: OutcomeRecord[] = buildOutcomeRecords(inputs, dependencies);
    const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;
    const built = buildOutcomesDocument(records, {
      status: result.status,
      environment: env.current,
      baseUrl: testConfig.baseUrl,
      ci: runUrl ? { runUrl, sha: process.env.GITHUB_SHA ?? null } : null,
      playwright: this.fullConfig.version,
    });
    const document = { ...built, runId: this.runId };

    mkdirSync(dirname(OUTCOMES_PATH), { recursive: true });
    writeFileSync(OUTCOMES_PATH, `${JSON.stringify(document, null, 2)}\n`);
    console.log(`📊 Test outcomes generated: ${OUTCOMES_PATH}`);

    const stepSummary = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummary) {
      try {
        appendFileSync(stepSummary, `\n${stepSummaryMarkdown(document.summary, records, result.status)}`);
      }
      catch {
        // The step summary is a convenience; the records file is the contract
      }
    }

    return document;
  }

  private getOutcomeLabel(record: OutcomeRecord): string {
    if (record.class === 'failed' && record.testStatus === 'BLOCKED') {
      return 'setup failed';
    }
    return record.class.replace('-', ' ');
  }

  private getOutcomeIcon(record: OutcomeRecord): string {
    const icons: Record<OutcomeRecord['class'], string> = {
      'passed': '✅',
      'failed': record.testStatus === 'BLOCKED' ? '⛔' : '❌',
      'known-defect': '🐞',
      'unexpected-pass': '❗',
      'skipped': '⏭️',
    };
    return icons[record.class];
  }

  private getOutcomeColor(record: OutcomeRecord | undefined, status?: string): string {
    if (record === undefined) {
      return status === 'passed' ? colors.green : colors.red;
    }
    if (record.class === 'passed') {
      return colors.green;
    }
    if (record.class === 'known-defect' || record.class === 'skipped') {
      return colors.yellow;
    }
    return colors.red;
  }

  private generateAtcReport(outputPath = 'reports/atc_results.json') {
    if (!existsSync(ATC_PARTIAL_PATH)) {
      // No ATC ran: drop a stale report so a later write-back does not import it; `--list` leaves it alone.
      if (!this.listOnly && existsSync(outputPath)) {
        unlinkSync(outputPath);
      }
      return;
    }

    const results: Record<string, AtcResult[]> = {};
    const lines = readFileSync(ATC_PARTIAL_PATH, 'utf-8').split('\n').filter(Boolean);

    for (const line of lines) {
      const entry = JSON.parse(line) as AtcResult;
      if (results[entry.testId]) {
        results[entry.testId].push(entry);
      }
      else {
        results[entry.testId] = [entry];
      }
    }

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let executions = 0;
    const testIds: string[] = [];

    for (const [testId, entries] of Object.entries(results)) {
      testIds.push(testId);
      executions += entries.length;

      const hasFail = entries.some(r => r.status === 'FAIL');
      const allSkip = entries.every(r => r.status === 'SKIP');

      if (hasFail) {
        failed++;
      }
      else if (allSkip) {
        skipped++;
      }
      else {
        passed++;
      }
    }

    const total = testIds.length;

    const report = {
      runId: this.runId,
      generatedAt: new Date().toISOString(),
      summary: { total, passed, failed, skipped, executions, testIds },
      results,
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📊 ATC Report generated: ${outputPath}`);

    unlinkSync(ATC_PARTIAL_PATH);
  }

  private logTestError(result: TestResult, testName: string) {
    const statusIcons: Record<string, string> = {
      failed: '❌ FAILED',
      timedOut: '⏱️ TIMED OUT',
      interrupted: '⚠️ INTERRUPTED',
    };

    console.log(
      `${colors.red}%s${colors.reset}`,
      `---- 🔎 Test Output: ${statusIcons[result.status]}${testName}`,
    );

    if (result.error === undefined) {
      return;
    }

    if (result.error.message !== undefined && result.error.message !== '') {
      console.log(`${colors.red}%s${colors.reset}`, '---- 🔴 Error:', result.error.message);
    }
    if (result.error.value !== undefined && result.error.value !== '') {
      console.log(`${colors.red}%s${colors.reset}`, '---- 🔴 Value:', result.error.value);
    }
    if (result.error.snippet !== undefined && result.error.snippet !== '') {
      console.log(`${colors.red}%s${colors.reset}`, '---- 🔴 Snippet:');
      console.group();
      console.log(result.error.snippet);
      console.groupEnd();
    }
    if (result.error.location !== undefined) {
      console.log(`${colors.red}%s${colors.reset}`, '---- 🔎 Located in:', result.error.location);
    }
  }

  private getStatusIcon(status?: string): string {
    const icons: Record<string, string> = {
      passed: '✅',
      failed: '❌',
      timedOut: '⌛',
      interrupted: '⚠️',
    };
    if (status === undefined || status === '') {
      return '❓';
    }
    return icons[status] ?? '❓';
  }
}

export default KataReporter;

interface TestAttr {
  testID: string
  testNumber: number
  testName: string
  testWorker: string
  testStatus?: string
  testDuration?: number
}
