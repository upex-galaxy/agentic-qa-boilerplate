/**
 * @fileoverview Tests for the inline `kata` ESLint plugin in `eslint.config.base.js`.
 *
 * ESLint's own RuleTester with the TypeScript parser, one valid and one invalid
 * case per check. The filename decides which check applies, so every case names
 * the repo-relative path it pretends to be.
 */

import type { Rule } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, it } from 'bun:test';
import { RuleTester } from 'eslint';
import { kataPlugin } from '../eslint.config.base.js';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
});

const rules = kataPlugin.rules as Record<string, Rule.RuleModule>;

tester.run('kata/layer-imports', rules['layer-imports'], {
  valid: [
    { filename: 'tests/e2e/a/a.test.ts', code: 'import { expect, test } from \'@TestFixture\';' },
    { filename: 'tests/e2e/a/a.test.ts', code: 'import { expect } from \'@playwright/test\';' },
    { filename: 'tests/e2e/a/a.test.ts', code: 'import type { test } from \'@playwright/test\';' },
    { filename: 'tests/setup/global.setup.ts', code: 'import { test as setup } from \'@playwright/test\';' },
    { filename: 'tests/data/DataFactory.ts', code: 'import { faker } from \'@faker-js/faker\';' },
    { filename: 'api/schemas/auth.types.ts', code: 'import type { components } from \'@openapi\';' },
    { filename: 'tests/components/api/ExampleApi.ts', code: 'import { ApiBase } from \'@api/ApiBase\';' },
    { filename: 'tests/components/ui/ExamplePage.ts', code: 'import { UiBase } from \'@ui/UiBase\';' },
    { filename: 'tests/components/ApiFixture.ts', code: 'import { AuthApi } from \'@api/AuthApi\';' },
    { filename: 'tests/components/steps/ExampleSteps.ts', code: 'import { TestContext } from \'@TestContext\';' },
    { filename: 'tests/components/TestFixture.ts', code: 'import { ApiFixture } from \'@ApiFixture\';' },
    { filename: 'tests/components/TestContext.ts', code: 'import { DataFactory } from \'@DataFactory\';' },
  ],
  invalid: [
    { filename: 'tests/e2e/a/a.test.ts', code: 'import { test } from \'@playwright/test\';', errors: [{ messageId: 'specTest' }] },
    { filename: 'tests/integration/a/a.test.ts', code: 'import { expect, test } from \'@playwright/test\';', errors: [{ messageId: 'specTest' }] },
    { filename: 'tests/e2e/a/a.test.ts', code: 'import { faker } from \'@faker-js/faker\';', errors: [{ messageId: 'faker' }] },
    { filename: 'tests/components/api/ExampleApi.ts', code: 'import type { components } from \'@openapi\';', errors: [{ messageId: 'openapi' }] },
    { filename: 'tests/components/api/ExampleApi.ts', code: 'import { AuthApi } from \'@api/AuthApi\';', errors: [{ messageId: 'component' }] },
    { filename: 'tests/components/ui/ExamplePage.ts', code: 'import { LoginPage } from \'@ui/LoginPage\';', errors: [{ messageId: 'component' }] },
    { filename: 'tests/components/ui/ExamplePage.ts', code: 'export { LoginPage } from \'@ui/LoginPage\';', errors: [{ messageId: 'component' }] },
    { filename: 'tests/components/ui/ExamplePage.ts', code: 'import { test } from \'@TestFixture\';', errors: [{ messageId: 'fixtureOrSteps' }] },
    { filename: 'tests/components/api/ExampleApi.ts', code: 'import { ExampleSteps } from \'@steps/ExampleSteps\';', errors: [{ messageId: 'fixtureOrSteps' }] },
    { filename: 'tests/components/TestContext.ts', code: 'import { ExampleApi } from \'@api/ExampleApi\';', errors: [{ messageId: 'testContext' }] },
  ],
});

tester.run('kata/atc-no-atc-call', rules['atc-no-atc-call'], {
  valid: [
    {
      filename: 'tests/components/api/ExampleApi.ts',
      code: 'class A { @atc(\'X-1\') async one() { await this.helper(); } async helper() {} }',
    },
    {
      filename: 'tests/components/api/ExampleApi.ts',
      code: 'class A { @atc(\'X-1\') async one() { await other.two(); } @atc(\'X-2\') async two() {} }',
    },
  ],
  invalid: [
    {
      filename: 'tests/components/api/ExampleApi.ts',
      code: 'class A { @atc(\'X-1\') async one() { await this.two(); } @atc(\'X-2\') async two() {} }',
      errors: [{ messageId: 'atcCallsAtc', data: { name: 'two' } }],
    },
    {
      filename: 'tests/components/ui/ExamplePage.ts',
      code: 'class A { @atc(\'X-1\') async one() { if (x) { await this.two(); } } @step @atc(\'X-2\') async two() {} }',
      errors: [{ messageId: 'atcCallsAtc' }],
    },
  ],
});

tester.run('kata/no-decorator-in-base', rules['no-decorator-in-base'], {
  valid: [
    { filename: 'tests/components/api/ApiBase.ts', code: 'class A { async get() {} }' },
    { filename: 'tests/components/api/ExampleApi.ts', code: 'class A { @atc(\'X-1\') async one() {} }' },
  ],
  invalid: [
    { filename: 'tests/components/api/ApiBase.ts', code: 'class A { @atc(\'X-1\') async get() {} }', errors: [{ messageId: 'decoratorInBase' }] },
    { filename: 'tests/components/ui/UiBase.ts', code: 'class A { @step() async click() {} }', errors: [{ messageId: 'decoratorInBase' }] },
    { filename: 'tests/components/TestContext.ts', code: '@x class A {}', errors: [{ messageId: 'decoratorInBase' }] },
  ],
});

tester.run('kata/no-raw-page-in-spec', rules['no-raw-page-in-spec'], {
  valid: [
    { filename: 'tests/e2e/a/a.test.ts', code: 'test(\'t\', async ({ ui, api }) => {});' },
    { filename: 'tests/e2e/a/a.test.ts', code: 'test(\'t\', async () => {});' },
    { filename: 'tests/components/UiFixture.ts', code: 'test(\'t\', async ({ page }) => {});' },
  ],
  invalid: [
    { filename: 'tests/e2e/a/a.test.ts', code: 'test(\'t\', async ({ page }) => {});', errors: [{ messageId: 'rawPage', data: { name: 'page' } }] },
    { filename: 'tests/integration/a/a.test.ts', code: 'test.only(\'t\', async ({ api, request }) => {});', errors: [{ messageId: 'rawPage', data: { name: 'request' } }] },
    { filename: 'tests/e2e/a/a.test.ts', code: 'test.skip(\'t\', async function ({ page: p }) {});', errors: [{ messageId: 'rawPage' }] },
  ],
});
