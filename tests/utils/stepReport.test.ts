import type { OutcomeInput } from '@utils/testOutcomes';

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { knownDefectKey } from '@utils/testOutcomes';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

interface ResultStep { name: string, steps?: ResultStep[] }
interface Result {
  name: string
  status: string
  statusDetails?: { message?: string }
  labels: { name: string, value: string }[]
  steps: ResultStep[]
}

const ROOT = resolve(import.meta.dir, '../..');
const joined = (...parts: string[]): string => parts.join('');
const FAKE = {
  positional: joined('hun', 'ter2'),
  field: joined('fake', 'field', 'value'),
  token: joined('gh', 'p_', 'Fk3q9ZrT7mWb2Lx5Yc8Nd4Hs6Jv1Pa0Ge'),
  shaped: joined('Zq7!', 'fakePass'),
  hidden: joined('plain', 'words'),
  rest: joined('rest', 'value'),
};
const PAGE_SECRETS = {
  login: joined('login', 'Passphrase', 'value'),
  disabled: joined('disabled', 'Field', 'value'),
};
const BODY_SECRETS = {
  password: joined('body', 'pass', 'value'),
  access: joined('opaque', 'access', 'value'),
  refresh: joined('opaque', 'refresh', 'value'),
  bearer: joined('header', 'bearer', 'value99'),
  cookie: joined('sid=', 'cookie', 'value'),
  setCookie: joined('session=', 'setcookie', 'value'),
  cookieJar: joined('jar', 'cookie', 'value'),
  form: joined('form', 'body', 'value'),
  hex: joined('9f86d081884c7d65', '9a2feaa0c55ad015'),
  jwt: joined('ey', 'JhbGciOiJIUzI1NiJ9', '.', 'ey', 'JzdWIiOiJmYWtlIn0', '.', 'c2lnbmF0dXJl'),
  path: joined('Zk9reset', 'Token8812abcdefgh'),
};
const BROWSER = existsSync(chromium.executablePath());

// Playwright copies the spec source into error-context.md, so no secret may appear in it as one literal.
const lit = (value: string): string => `['${value.slice(0, 3)}', '${value.slice(3)}'].join('')`;

const spec = (utils: string): string => `
import { test } from '@playwright/test';
import { atc, step } from '${utils}/decorators.ts';
import { attachRequestResponseToAllure } from '${utils}/allure.ts';
import { knownDefect } from '${utils}/knownDefect.ts';

class Fake {
  @atc('PROJ-1')
  async submitForm(email: string, password: string) {}

  @atc('PROJ-2')
  async authenticate(credentials: { email: string, password: string, extra: string }) {}

  @step
  async callApi(accessToken: string, path: string) {}

  @step
  async search(term: string, filter: { owner: string, apiKey: string }) {}

  @step
  async record(note: string, other: string) {}

  @step
  async loginAs(email: string, phrase: string) {}

  @atc('PROJ-3', { sensitive: true })
  async paste(value: string) {}

  @step
  async spread(...values: string[]) {}
}

test('titles', async () => {
  const fake = new Fake();
  await fake.submitForm('a@b.test', ${lit(FAKE.positional)});
  await fake.authenticate({ email: 'c@d.test', password: ${lit(FAKE.field)}, extra: ${lit(FAKE.hidden)} });
  await fake.callApi(${lit(FAKE.field)}, '/api/orders');
  await fake.search('red shoes', { owner: 'ana', apiKey: ${lit(FAKE.field)} });
  await fake.record(${lit(FAKE.token)}, ${lit(FAKE.shaped)});
  await fake.loginAs('e@f.test', ${lit(FAKE.hidden)});
  await fake.paste(${lit(FAKE.hidden)});
  await fake.spread(${lit(FAKE.rest)});
});

test('defect still failing', () => {
  knownDefect('BUG-1', 'totals are wrong');
  throw new Error('totals differ');
});

test('defect fixed', () => {
  knownDefect('BUG-2');
});

test('attachments', async () => {
  await attachRequestResponseToAllure({
    url: 'https://app.test/api/reset/' + ${lit(BODY_SECRETS.path)},
    method: 'POST',
    requestBody: { email: 'g@h.test', password: ${lit(BODY_SECRETS.password)} },
    responseBody: {
      access_token: ${lit(BODY_SECRETS.access)},
      nested: { refreshToken: ${lit(BODY_SECRETS.refresh)}, trace: ${lit(BODY_SECRETS.hex)}, note: 'jwt ' + ${lit(BODY_SECRETS.jwt)} + ' end' },
      headers: { 'Authorization': 'Bearer ' + ${lit(BODY_SECRETS.bearer)}, 'cookie': ${lit(BODY_SECRETS.cookie)}, 'set-cookie': [${lit(BODY_SECRETS.setCookie)}] },
      cookies: [{ name: 'a', value: ${lit(BODY_SECRETS.cookieJar)}, domain: 'app.test' }],
      user: { name: 'Ana Gomez', passed: 3, orderId: 'ORD-1001' },
    },
  });
  await attachRequestResponseToAllure({ url: '/api/form', method: 'POST', requestBody: 'username=ana&password=' + ${lit(BODY_SECRETS.form)} });
});
`;

const pageSpec = (components: string): string => `
import { expect, test } from '@playwright/test';
import { LoginPage } from '${components}/ui/LoginPage.ts';

const html = \`<input data-testid="login-email-input"><input data-testid="login-password-input" type="password">
<button data-testid="login-submit-button" onclick="document.querySelector('[data-testid=login-error]').hidden = false">Go</button>
<p data-testid="login-error" hidden>Wrong credentials</p><input id="off" type="password" disabled>
<script>document.querySelector('[type=password]').addEventListener('input', e => { document.body.dataset.typed = e.target.value.length })</script>\`;

test('secret fill', async ({ page }) => {
  await page.route('http://app.test/login', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://app.test/login');
  const login = new LoginPage({ page });
  await login.loginWithInvalidCredentials({ email: 'i@j.test', password: ${lit(PAGE_SECRETS.login)} });
  expect(await page.evaluate(() => document.body.dataset.typed)).toBe('${PAGE_SECRETS.login.length}');
});

test('secret fill failing', async ({ page }) => {
  await page.setContent('<input id="off" type="password" disabled>');
  await new LoginPage({ page }).fillSecret(page.locator('#off'), ${lit(PAGE_SECRETS.disabled)});
});
`;

let dir = '';
let results: Result[] = [];
let written: string[] = [];

const names = (steps: ResultStep[]): string[] => steps.flatMap(s => [s.name, ...names(s.steps ?? [])]);
const byName = (name: string): Result => results.find(r => r.name === name) as Result;
const keyOf = (result: Result): string | null => {
  const tags: OutcomeInput['tags'] = result.labels.filter(l => l.name === 'tag').map(l => `@${l.value}`);
  return knownDefectKey({ annotations: [], tags });
};

describe('what the decorators and knownDefect() write into the Allure results', () => {
  beforeAll(async () => {
    mkdirSync(join(ROOT, '.session'), { recursive: true });
    dir = mkdtempSync(join(ROOT, '.session', 'step-report-'));
    const tests = join(ROOT, 'tests').replaceAll('\\', '/');
    writeFileSync(join(dir, 'fake.spec.ts'), spec(`${tests}/utils`));
    if (BROWSER) {
      writeFileSync(join(dir, 'page.spec.ts'), pageSpec(`${tests}/components`));
    }
    writeFileSync(join(dir, 'playwright.config.ts'), 'export default { testDir: \'.\', testMatch: \'*.spec.ts\', workers: 1, use: { actionTimeout: 5000 }, expect: { timeout: 1000 }, reporter: [[\'allure-playwright\', { resultsDir: \'results\', detail: true }]] };\n');
    const run = Bun.spawn(['bunx', '--bun', 'playwright', 'test', '-c', 'playwright.config.ts'], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
    const output = await new Response(run.stdout).text() + await new Response(run.stderr).text();
    await run.exited;
    const out = join(dir, 'results');
    if (!existsSync(out)) {
      throw new Error(`the Playwright run wrote no results:\n${output}`);
    }
    written = readdirSync(out).map(f => readFileSync(join(out, f), 'utf8'));
    results = readdirSync(out)
      .filter(f => f.endsWith('-result.json'))
      .map(f => JSON.parse(readFileSync(join(out, f), 'utf8')) as Result);
  }, 120_000);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('no fake secret reaches a step title', () => {
    const titles = names(byName('titles').steps).join('\n');
    for (const secret of Object.values(FAKE)) {
      expect(titles).not.toContain(secret);
    }
  });

  test('ordinary arguments and identities stay readable', () => {
    const titles = names(byName('titles').steps);
    expect(titles).toContain('ATC [PROJ-1]: submitForm("a@b.test", "***")');
    expect(titles).toContain('ATC [PROJ-2]: authenticate({ email: "c@d.test", password: "***", extra: "***" })');
    expect(titles).toContain('callApi("***", "/api/orders")');
    expect(titles).toContain('search("red shoes", { owner: "ana", apiKey: "***" })');
    expect(titles).toContain('record("***", "***")');
    expect(titles).toContain('loginAs("e@f.test", "***")');
    expect(titles).toContain('ATC [PROJ-3]: paste("***")');
    expect(titles).toContain('spread("***")');
  });

  test('knownDefect() puts the bug key in the result while the test still fails', () => {
    const result = byName('defect still failing');
    expect(result.status).toBe('passed');
    expect(keyOf(result)).toBe('BUG-1');
  });

  test('knownDefect() keeps the key when the defect is fixed', () => {
    const result = byName('defect fixed');
    expect(result.status).toBe('failed');
    expect(keyOf(result)).toBe('BUG-2');
  });

  test('request and response attachments carry no secret', () => {
    const everything = written.join('\n');
    for (const secret of Object.values(BODY_SECRETS)) {
      expect(everything).not.toContain(secret);
    }
    for (const readable of ['g@h.test', 'Ana Gomez', 'ORD-1001', '"passed": 3', 'username=ana']) {
      expect(everything).toContain(readable);
    }
  });

  test.skipIf(!BROWSER)('fillSecret() fills the field and leaves the value out of every result file, sub-steps kept', () => {
    expect(byName('secret fill').status).toBe('passed');
    expect(byName('secret fill failing').status).not.toBe('passed');
    const everything = written.join('\n');
    for (const secret of Object.values(PAGE_SECRETS)) {
      expect(everything).not.toContain(secret);
    }
    const titles = names(byName('secret fill').steps);
    expect(titles).toContain('ATC [PROJ-112]: loginWithInvalidCredentials({ email: "i@j.test", password: "***" })');
    expect(titles).toContain('Fill "i@j.test"');
    expect(titles).toContain('Evaluate');
  });
});
