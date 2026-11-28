import type { RunContext } from './index.ts';

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';

import { inspectHtml } from './gate.ts';
import { parseArgs, run } from './index.ts';
import { buildModel, knownDefectKey } from './model.ts';
import { collectSecretValues, createRedactor, MARKER, patternLeaks } from './redact.ts';
import { renderHtml } from './render.ts';

const TEMP: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'oneshot-'));
  TEMP.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of TEMP) { rmSync(dir, { recursive: true, force: true }); }
});

const join_ = (...parts: string[]): string => parts.join('');
const FAKE = {
  token: join_('gh', 'p_', 'Fk3', 'q9ZrT7mWb2Lx5Yc8Nd4Hs6Jv1Pa0Ge'),
  jwt: join_('ey', 'JhbGciOiJIUzI1NiJ9', '.', 'ey', 'JzdWIiOiJmYWtlLXVzZXIifQ', '.', 'c2lnbmF0dXJlLWZha2U'),
  password: join_('Zq7!', 'fake', '-pass<&>"word'),
  cookie: join_('sid=', 'c00kie', 'FakeValue12345'),
  header: join_('opaque', '-header-', 'Value998877'),
  dotenv: join_('dotenv', '-only-', 'value-5544332211'),
  stored: join_('stored', 'StateCookie', '778899'),
  env: join_('process', '-env-only-', 'value-123123'),
};

function secretRoot(): string {
  const root = tempDir();
  writeFileSync(join(root, '.env'), `STAGING_USER_PASSWORD='${FAKE.password}'\nSOME_SETTING=${FAKE.dotenv}\n`);
  mkdirSync(join(root, '.auth'));
  writeFileSync(join(root, '.auth', 'user.json'), JSON.stringify({ cookies: [{ name: 'sid', value: FAKE.stored }] }));
  return root;
}

const PROCESS_ENV = { DEMO_API_TOKEN: FAKE.env };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

interface RawStep {
  name: string
  status?: string
  start?: number
  stop?: number
  steps?: RawStep[]
  parameters?: { name: string, value: string }[]
  attachments?: { name: string, type: string, source: string }[]
}

interface RawResult {
  name: string
  status: 'passed' | 'failed' | 'broken' | 'skipped'
  file?: string
  project?: string
  message?: string
  tags?: string[]
  steps?: RawStep[]
  attachments?: { name: string, type: string, source: string }[]
  extra?: Record<string, unknown>
}

function writeResult(dir: string, index: number, raw: RawResult): void {
  const file = raw.file ?? 'integration/auth/login.test.ts';
  const project = raw.project ?? 'integration';
  writeFileSync(join(dir, `${String(index).padStart(3, '0')}-result.json`), JSON.stringify({
    uuid: `uuid-${index}`,
    name: raw.name,
    historyId: `case-${index}:params`,
    fullName: `${file} › PROJ-1: login › ${raw.name}`,
    status: raw.status,
    stage: 'finished',
    statusDetails: raw.message ? { message: raw.message, trace: `${raw.message}\n    at somewhere` } : {},
    labels: [
      ...(raw.tags ?? []).map(value => ({ name: 'tag', value })),
      { name: 'parentSuite', value: project },
      { name: 'suite', value: file },
      { name: 'subSuite', value: 'PROJ-1: login' },
    ],
    parameters: [{ name: 'Project', value: project }],
    links: [],
    start: 1000 + index * 10,
    stop: 1005 + index * 10,
    steps: raw.steps ?? [],
    attachments: raw.attachments ?? [],
    ...raw.extra,
  }));
}

const declared = (name: string): RawStep => ({ name, status: 'passed', steps: [], attachments: [], parameters: [] });
const clocked = (name: string, status = 'passed', more: Partial<RawStep> = {}): RawStep => ({ name, status, start: 1, stop: 2, ...more });
const ASSERTION = 'Error: expect(received).toBe(expected) // Object.is equality\n\nExpected: 2\nReceived: 1';

function defectFixture(): string {
  const dir = tempDir();
  const cases: RawResult[] = [
    { name: 'a genuine pass', status: 'passed', steps: [clocked('ATC [PROJ-100]: loginSuccessfully()')] },
    { name: 'runtime knownDefect leaves no marker', status: 'passed', message: ASSERTION, steps: [clocked('Expect "toBe"', 'failed')] },
    { name: 'declared annotation', status: 'passed', message: ASSERTION, steps: [clocked('Before Hooks'), declared('known-defect: BUG-6')] },
    { name: 'declared with a tag', status: 'passed', message: ASSERTION, tags: ['blocked:BUG-4'], steps: [declared('fail: undefined')] },
    { name: 'declared blocked-by', status: 'passed', message: ASSERTION, steps: [declared('fail: Blocked by BUG-11: totals')] },
    { name: 'free text mints no key', status: 'passed', message: ASSERTION, steps: [declared('fail: Broken UTF-8 handling')] },
    { name: 'declared unexpected pass', status: 'failed', tags: ['blocked:BUG-5'], steps: [declared('fail: undefined')] },
    { name: 'unmarked unexpected pass', status: 'failed' },
    { name: 'expected failure that timed out', status: 'broken', message: 'Test timeout of 60000ms exceeded.', tags: ['blocked:BUG-7'] },
    { name: 'blocked tag, plain failure', status: 'failed', tags: ['blocked:BUG-10'], message: ASSERTION },
    { name: 'blocked tag, genuine pass', status: 'passed', tags: ['blocked:BUG-9'] },
    { name: 'a clocked step is not a marker', status: 'failed', steps: [clocked('fail: Blocked by BUG-99')] },
    { name: 'a skip', status: 'skipped', message: 'No seed record available' },
  ];
  cases.forEach((c, i) => writeResult(dir, i, c));
  return dir;
}

function modelOf(resultsDir: string, secrets: string[] = []) {
  return buildModel({
    resultsDir,
    reportName: 'Run',
    environment: 'staging',
    runUrl: '',
    attachments: 'none',
    video: 'none',
    steps: 'failures',
    historyPath: '',
    redactor: createRedactor(secrets),
  });
}

describe('known defects', () => {
  const model = modelOf(defectFixture());
  const byName = new Map(model.tests.map(t => [t.name, t]));
  const of = (name: string) => [byName.get(name)?.status, byName.get(name)?.defect];

  test('a passed result carrying an error is a known defect, inferred when unmarked', () => {
    expect(of('runtime knownDefect leaves no marker')).toEqual(['known-defect', { ticket: '', outcome: 'expected', inferred: true }]);
    expect(of('a genuine pass')).toEqual(['passed', null]);
  });

  test('the key comes from the annotation, the tag or Blocked by, never from free text', () => {
    expect(of('declared annotation')[1]).toEqual({ ticket: 'BUG-6', outcome: 'expected', inferred: false });
    expect(of('declared with a tag')[1]).toEqual({ ticket: 'BUG-4', outcome: 'expected', inferred: false });
    expect(of('declared blocked-by')[1]).toEqual({ ticket: 'BUG-11', outcome: 'expected', inferred: false });
    expect(of('free text mints no key')[1]).toEqual({ ticket: '', outcome: 'expected', inferred: false });
  });

  test('knownDefectKey orders annotation and tag before Blocked by', () => {
    expect(knownDefectKey([{ type: 'fail', description: 'Blocked by BUG-2' }], ['@blocked:BUG-3'])).toBe('BUG-3');
    expect(knownDefectKey([{ type: 'known-defect', description: ' BUG-1 ' }], ['blocked:BUG-3'])).toBe('BUG-1');
    expect(knownDefectKey([{ type: 'known-defect', description: 'see BUG-1' }], [])).toBeNull();
    expect(knownDefectKey([{ type: 'fail', description: 'Blocked by BUG-2x' }], [])).toBeNull();
  });

  test('a marked expected failure that passed is an unexpected pass', () => {
    expect(of('declared unexpected pass')).toEqual(['failed', { ticket: 'BUG-5', outcome: 'unexpected-pass', inferred: false }]);
  });

  test('timeouts, plain failures, unmarked silent failures and clocked steps stay ordinary', () => {
    expect(of('expected failure that timed out')).toEqual(['broken', null]);
    expect(of('blocked tag, plain failure')).toEqual(['failed', null]);
    expect(of('unmarked unexpected pass')).toEqual(['failed', null]);
    expect(of('a clocked step is not a marker')).toEqual(['failed', null]);
    expect(of('blocked tag, genuine pass')).toEqual(['passed', null]);
  });

  test('the summary keeps known defects out of the passes', () => {
    expect(model.summary).toMatchObject({ total: 13, passed: 2, knownDefects: 5, failed: 4, broken: 1, skipped: 1, unexpectedPasses: 1 });
    expect(model.signatures.map(s => s.signature)).toContain('No error recorded');
  });

  test('ATC ids of any shape are read from step titles', () => {
    expect(byName.get('a genuine pass')?.atcIds).toEqual(['PROJ-100']);
  });

  test('ATC arguments never reach the page', () => {
    const dir = tempDir();
    const plain = join_('hun', 'ter2');
    writeResult(dir, 0, {
      name: 'positional credentials',
      status: 'passed',
      steps: [
        clocked(`ATC [PROJ-132]: submitForm("a@b.test", "${plain}")`, 'passed', { steps: [clocked('ATC [PROJ-100]: loginSuccessfully()')] }),
      ],
    });
    const steps = buildModel({
      resultsDir: dir,
      reportName: 'r',
      environment: '',
      runUrl: '',
      attachments: 'all',
      video: 'none',
      steps: 'all',
      historyPath: '',
      redactor: createRedactor([]),
    }).tests[0].steps;
    expect(steps[0].name).toBe('ATC [PROJ-132]: submitForm(…)');
    expect(steps[0].steps[0].name).toBe('ATC [PROJ-100]: loginSuccessfully()');
    expect(JSON.stringify(steps)).not.toContain(plain);
  });

  test('the page shows the keys and keeps the renderer walls', () => {
    const html = renderHtml(model);
    for (const text of ['BUG-6', 'Known defects', 'Action needed: unexpected pass', 'no defect key recorded', 'data-status="known-defect"', 'data-filter="known-defect"', 'Missing precondition']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('<script>');
    expect(html).not.toContain('script src=');
    expect(html).not.toContain('fetch(');
    expect(html).not.toContain('localStorage');
    expect(html).not.toContain('https://');
    expect(html).not.toContain('http://');
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
    expect(() => new Bun.Transpiler({ loader: 'js' }).transformSync(script)).not.toThrow();
    expect(inspectHtml(html, [])).toEqual([]);
  });

  test('setup files are scaffolding and a failed one still renders', () => {
    const dir = tempDir();
    writeResult(dir, 1, { name: 'prepare', status: 'failed', file: 'global.setup.ts', project: 'global-setup', message: 'Error: boom' });
    const only = modelOf(dir);
    expect(only.summary).toMatchObject({ total: 0, scaffolding: 1, scaffoldingFailed: 1 });
    expect(only.inputs.renderable).toBe(true);
  });
});

function leakyFixture(): string {
  const dir = tempDir();
  const { token, jwt, password, cookie, header, dotenv, stored, env } = FAKE;
  const bare = [token, jwt, password, dotenv, stored, env].join(' | ');
  const all = `${bare}\nAuthorization: Bearer ${header}\nCookie: ${cookie}`;
  const json = JSON.stringify({ headers: { 'Authorization': `Bearer ${header}`, 'set-cookie': [cookie] }, password, nested: JSON.stringify({ access_token: header }) }, null, 2);
  writeFileSync(join(dir, 'body-attachment.json'), json);
  writeFileSync(join(dir, 'log-attachment.txt'), `${'x'.repeat(65 * 1024 - 20)}\n${all}\nCookie: ${cookie}\n`);
  writeFileSync(join(dir, 'late-attachment.txt'), `${'y'.repeat(64 * 1024 - 8)} ${token}`);
  writeFileSync(join(dir, 'fake-attachment.png'), `not an image ${dotenv}`);
  writeFileSync(join(dir, 'real-attachment.png'), Buffer.concat([PNG, Buffer.from(dotenv)]));
  writeFileSync(join(dir, 'clean-attachment.png'), PNG);
  writeFileSync(join(dir, 'draw-attachment.svg'), `<svg><text>${dotenv} &#x41; token=${header}</text></svg>`);
  writeFileSync(join(dir, 'trace-attachment.zip'), `PK${token}`);
  writeFileSync(join(dir, 'net-attachment.har'), token);
  writeFileSync(join(dir, 'environment.properties'), `Environment=staging\nAPI_PASSWORD=short1\nNote=${all}\nBase=https\\://user:${header}@host.example.test/\n`);

  const attachment = (source: string, type = 'text/plain') => ({ name: `${source} ${token}`, type, source });
  writeResult(dir, 1, {
    name: `leaks ${all}`,
    status: 'failed',
    message: `apiRequestContext.get: Timeout\nCall log:\n  - Authorization: Bearer ${header}\n  - cookie: ${cookie}\n  - fill("hunter2x")\n  - waiting for getByLabel('Password')\n${all}`,
    tags: [`t-${dotenv}`],
    steps: [clocked('Fill "typed-secret-1" getByLabel(\'Password\')', 'failed', {
      parameters: [{ name: 'password', value: 'plain-looking' }, { name: 'q', value: token }],
      steps: [clocked(`ATC [PROJ-9]: call("${jwt}")`, 'failed')],
    })],
    attachments: ['body-attachment.json', 'log-attachment.txt', 'late-attachment.txt', 'fake-attachment.png', 'real-attachment.png', 'clean-attachment.png', 'draw-attachment.svg', 'trace-attachment.zip', 'net-attachment.har'].map(s => attachment(s)),
    extra: {
      fullName: `a.test.ts › ${all}`,
      description: `desc ${all}`,
      parameters: [
        { name: 'Project', value: 'integration' },
        { name: 'apiToken', value: 'matches-no-pattern' },
        { name: 'masked-one', value: 'masked-value-x', mode: 'masked' },
        { name: 'hidden-one', value: 'hidden-value-x', mode: 'hidden' },
        { name: 'free', value: all },
      ],
      links: [
        { name: all, url: `https://jira.example.test/browse/PROJ-9?token=${header}`, type: 'tms' },
        { name: 'PROJ-9', url: 'https://jira.example.test/browse/PROJ-9', type: 'tms' },
      ],
      labels: [{ name: 'suite', value: all }, { name: 'subSuite', value: all }, { name: 'parentSuite', value: all }],
    },
  });
  return dir;
}

const NEVER_IN_OUTPUT = [...Object.values(FAKE), 'plain-looking', 'matches-no-pattern', 'masked-value-x', 'hidden-value-x', 'short1', 'typed-secret-1', 'hunter2x'];

function leaksIn(html: string): string[] {
  const media = [...html.matchAll(/;base64,([A-Za-z0-9+/=]+)/g)].map(m => Buffer.from(m[1], 'base64').toString('latin1'));
  const decoded = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  return NEVER_IN_OUTPUT.filter(secret => [html, decoded, ...media].some(text => text.toLowerCase().includes(secret.toLowerCase())));
}

function context(cwd: string): RunContext & { lines: string[] } {
  const lines: string[] = [];
  return { cwd, env: PROCESS_ENV, lines, log: line => lines.push(line), error: line => lines.push(line) };
}

describe('leak gate', () => {
  test('secret values come from .env, .auth and secret-named variables', () => {
    const values = collectSecretValues(secretRoot(), { ...PROCESS_ENV, PWD: '/somewhere/long', CI_JOB_NAME: 'not-a-secret-name' });
    expect(values).toEqual(expect.arrayContaining([FAKE.password, FAKE.dotenv, FAKE.stored, FAKE.env]));
    expect(values).not.toContain('/somewhere/long');
    expect(values).not.toContain('not-a-secret-name');
  });

  test('a fixture run carrying fake secrets writes one clean, small page', () => {
    const root = secretRoot();
    const results = leakyFixture();
    const history = join(root, 'history.json');
    writeFileSync(history, JSON.stringify([
      { label: FAKE.token, at: '2026-01-01', passed: 1, failed: 0, url: `https://ci.example.test/1?sig=${FAKE.header}` },
      { label: 'b', at: FAKE.dotenv, passed: 1, failed: 1, url: 'https://ci.example.test/2' },
    ]));
    const ctx = context(root);
    const code = run(['--results', results, '--out', 'out/report.html', '--attachments', 'all', '--steps', 'all', '--history', history, '--name', FAKE.token, '--env', FAKE.dotenv, '--run-url', `https://ci.example.test/2?token=${FAKE.env}`], ctx);

    expect(ctx.lines.join('\n')).toContain('leak gate passed');
    expect(code).toBe(0);
    const out = resolve(root, 'out/report.html');
    const html = readFileSync(out, 'utf8');
    expect(leaksIn(html)).toEqual([]);
    expect(leaksIn(ctx.lines.join('\n'))).toEqual([]);
    expect(ctx.lines.at(-1)).toContain(out);
    expect(html).toContain(MARKER);
    expect(html).toContain('PROJ-9');
    expect(html).toContain('href="https://jira.example.test/browse/PROJ-9"');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html).toContain('never embedded');
    expect(html).toContain('the file holds a secret value');
    expect(Buffer.byteLength(html)).toBeLessThan(1024 * 1024);
    expect(html.match(/https?:\/\/(?!ci\.example\.test|jira\.example\.test)[^\s"'<&]+/g)?.filter(url => !url.includes('host.example.test') && !url.includes(MARKER)) ?? []).toEqual([]);
  });

  const header = FAKE.header;
  const cases: [string, string][] = [
    ['token', `<pre>${FAKE.token}</pre>`],
    ['jwt', `<pre>${FAKE.jwt}</pre>`],
    ['password assignment', `<pre>password=${header}</pre>`],
    ['escaped JSON password', `<pre>{\\&quot;password\\&quot;:\\&quot;${header}\\&quot;}</pre>`],
    ['cookie header', `<pre>Set-Cookie: ${FAKE.cookie}; Path=/</pre>`],
    ['cookie JSON', `<pre>{&quot;cookie&quot;: &quot;${FAKE.cookie}&quot;}</pre>`],
    ['authorization header', `<pre>Authorization: Token ${header}</pre>`],
    ['escaped password holding an angle bracket', `<pre>{\\&quot;password\\&quot;:\\&quot;a&lt;${header}\\&quot;}</pre>`],
    ['authorization JSON', `<pre>{&quot;authorization&quot;:&quot;${header}&quot;}</pre>`],
    ['header pair', `<pre>{&quot;name&quot;:&quot;Authorization&quot;,&quot;value&quot;:&quot;${header}&quot;}</pre>`],
    ['aria snapshot of a password field', `<pre>- textbox "Password *" [active]: ${header}</pre>`],
    ['basic', `<pre>Basic ${Buffer.from(`u:${header}`).toString('base64')}</pre>`],
    ['url userinfo', `<a href="https://user:${header}@host.example.test/">x</a>`],
    ['query parameter', `<a href="https://host.example.test/?a=1&amp;access_token=${header}">x</a>`],
    ['percent-encoded', `<pre>%3Ftoken%3D${header}</pre>`],
    ['.env value', `<pre>${FAKE.dotenv}</pre>`],
    ['password escaped as HTML', `<pre>${FAKE.password.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</pre>`],
    ['password escaped as JSON', `<pre>${JSON.stringify(FAKE.password).replace(/\\"/g, '\\u0022')}</pre>`],
    ['numeric entities', `<pre>${[...FAKE.dotenv].map(c => `&#${c.charCodeAt(0)};`).join('')}</pre>`],
    ['base64 of a value', `<pre>${Buffer.from(FAKE.dotenv).toString('base64')}</pre>`],
    ['text inside an image', `<img src="data:image/png;base64,${Buffer.from(FAKE.dotenv).toString('base64')}" />`],
    ['pattern inside an svg', `<img src="data:image/svg+xml;base64,${Buffer.from(`<svg>token=${header}</svg>`).toString('base64')}" />`],
    ['value inside binary bytes', `<img src="data:image/png;base64,${Buffer.concat([PNG, Buffer.from(FAKE.stored)]).toString('base64')}" />`],
  ];

  test.each(cases)('refuses a hand-made page holding: %s', (_label, html) => {
    const values = collectSecretValues(secretRoot(), PROCESS_ENV);
    expect(inspectHtml(html, values).length).toBeGreaterThan(0);
  });

  test('redacted markers and placeholders are not leaks', () => {
    const clean = [
      'Authorization: Bearer [redacted]',
      'cookie: [redacted]',
      '"password": "[redacted]"',
      'password=$STAGING_USER_PASSWORD',
      '"set-cookie": "[redacted]"',
      'https://[redacted]@host.example.test/?token=[redacted]',
      'Basic authentication is required',
      'password: "***"',
    ];
    for (const text of clean) { expect([text, [...patternLeaks(text)]]).toEqual([text, []]); }
  });

  test('data that ends like a key does not trip the gate on the renderer markup', () => {
    const dir = tempDir();
    const names = ['rejects an expired token:', 'reads the cookie:', 'sends authorization:', 'checks password=', 'Password: reset works', 'Basic authentication is required'];
    names.forEach((name, i) => writeResult(dir, i, { name, status: 'failed', message: name, steps: [clocked(name, 'failed')], extra: { description: name } }));
    const redactor = createRedactor([]);
    const model = buildModel({ resultsDir: dir, reportName: 'cookie:', environment: 'token=', runUrl: '', attachments: 'all', video: 'none', steps: 'all', historyPath: '', redactor });

    expect(inspectHtml(renderHtml(model), [])).toEqual([]);
  });

  test('redaction is applied before truncation', () => {
    const model = buildModel({ resultsDir: leakyFixture(), reportName: 'r', environment: '', runUrl: '', attachments: 'all', video: 'none', steps: 'all', historyPath: '', redactor: createRedactor([]) });
    const late = model.tests[0].attachments.find(a => a.name.startsWith('late-'));
    expect(late?.body).toContain('truncated');
    expect(late?.body).not.toContain(FAKE.token.slice(0, 7));
  });

  test.each(cases)('the CLI writes no file and drops the stale one: %s', (_label, html) => {
    const root = secretRoot();
    const results = tempDir();
    writeResult(results, 1, { name: 'x', status: 'passed' });
    const out = join(root, 'report.html');
    writeFileSync(out, 'stale');
    const ctx = context(root);

    expect(run(['--results', results, '--out', out], { ...ctx, render: () => html })).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(root).filter(name => name.includes('report'))).toEqual([]);
    expect(ctx.lines.join('\n')).toMatch(/rule [\w-]+: \d+/);
    expect(leaksIn(ctx.lines.join('\n'))).toEqual([]);
  });
});

describe('attachments', () => {
  test('a source that is not a plain name, or a symlink escaping the results, is not read', () => {
    const results = tempDir();
    const outside = tempDir();
    writeFileSync(join(outside, 'private.txt'), 'outside-content');
    symlinkSync(join(outside, 'private.txt'), join(results, 'link-attachment.txt'));
    symlinkSync(join(outside, 'private.txt'), join(results, 'environment.properties'));
    writeResult(results, 1, {
      name: 'x',
      status: 'failed',
      attachments: ['../private.txt', join(outside, 'private.txt'), 'link-attachment.txt', 'missing.txt'].map(source => ({ name: 'a', type: 'text/plain', source })),
    });
    writeResult(outside, 2, { name: 'outside result', status: 'passed' });
    symlinkSync(join(outside, '002-result.json'), join(results, '002-result.json'));
    const model = buildModel({ resultsDir: results, reportName: 'r', environment: '', runUrl: '', attachments: 'all', video: 'none', steps: 'all', historyPath: '', redactor: createRedactor([]) });

    expect(model.tests.map(x => x.name)).toEqual(['x']);
    expect(model.tests[0].attachments.map(a => a.kind)).toEqual(['omitted', 'omitted', 'omitted', 'omitted']);
    expect(model.envProps).toEqual([]);
    expect(JSON.stringify(model)).not.toContain('outside-content');
  });
});

describe('command line', () => {
  test('defaults need no arguments', () => {
    expect(parseArgs([])).toMatchObject({ results: 'allure-results', out: '.session/oneshot-report.html', attachments: 'none', video: 'none', steps: 'failures', name: 'Test Report' });
  });

  test('flags are read and bad ones are refused', () => {
    expect(parseArgs(['--results', 'r', '--out=o.html', '--run-url', 'https://ci.example.test/1', '--steps', 'all'])).toMatchObject({ results: 'r', out: 'o.html', runUrl: 'https://ci.example.test/1', steps: 'all' });
    for (const argv of [['--steps', 'some'], ['--attachments'], ['--context', 'x'], ['stray'], ['--out', '.env'], ['--run-url', 'javascript:alert(1)'], ['--results', '']]) {
      expect(() => parseArgs(argv)).toThrow();
    }
  });

  test('usage errors exit 2 without echoing values, help exits 0 with real usage', () => {
    const ctx = context(tempDir());
    expect(run(['stray-value-xyz'], ctx)).toBe(2);
    expect(ctx.lines.join('\n')).not.toContain('stray-value-xyz');
    const help = context(tempDir());
    expect(run(['--help'], help)).toBe(0);
    expect(help.lines[0]).toStartWith('Usage: bun run report:oneshot');
  });

  test('a missing or empty results directory writes nothing and says why', () => {
    const root = tempDir();
    const ctx = context(root);
    expect(run([], ctx)).toBe(1);
    mkdirSync(join(root, 'allure-results'));
    expect(run([], ctx)).toBe(1);
    expect(ctx.lines.join('\n')).toContain('does not exist');
    expect(ctx.lines.join('\n')).toContain('no *-result.json files');
    expect(existsSync(join(root, '.session'))).toBe(false);
  });

  test('the script entry point writes the default output from the working directory', () => {
    const root = tempDir();
    mkdirSync(join(root, 'allure-results'));
    writeResult(join(root, 'allure-results'), 1, { name: 'x', status: 'passed' });
    const child = Bun.spawnSync(['bun', '--no-env-file', join(import.meta.dir, 'index.ts')], { cwd: root, env: { PATH: process.env.PATH ?? '' } });

    expect(child.exitCode).toBe(0);
    expect(child.stdout.toString()).toContain('.session/oneshot-report.html');
    const html = readFileSync(join(root, '.session', 'oneshot-report.html'), 'utf8');
    expect(html).not.toMatch(/https?:\/\//);
  });
});

const RAW = join_('Zq9', 'vvKk', '3mmQw7');

function pageOf(text: string): string {
  return `<pre>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</pre>`;
}

function fullModel(resultsDir: string, historyPath = '') {
  return buildModel({ resultsDir, reportName: 'r', environment: '', runUrl: '', attachments: 'all', video: 'none', steps: 'all', historyPath, redactor: createRedactor([]) });
}

describe('review regressions', () => {
  test('any decorator-shaped step title loses its arguments, other titles stay readable', () => {
    const dir = tempDir();
    const titles: [string, string][] = [
      [`login("a@b.test", "${RAW}")`, 'login(…)'],
      [`LoginPage.submit("${RAW}")`, 'LoginPage.submit(…)'],
      [`ATC [PROJ-1]: AuthApi.authenticate({ pin: "${RAW}" })`, 'ATC [PROJ-1]: AuthApi.authenticate(…)'],
      [`fillForm("a\n${RAW}")`, 'fillForm(…)'],
      ['logout()', 'logout()'],
      ['ATC [PROJ-2]: Page.logout()', 'ATC [PROJ-2]: Page.logout()'],
      ['Click getByRole(\'button\', { name: \'Go\' })', 'Click getByRole(\'button\', { name: \'Go\' })'],
      ['Expect "toBe"', 'Expect "toBe"'],
    ];
    writeResult(dir, 0, { name: 'x', status: 'passed', steps: titles.map(([title]) => clocked(title)) });

    expect(fullModel(dir).tests[0].steps.map(s => s.name)).toEqual(titles.map(([, shown]) => shown));
  });

  test('.auth is walked for tokens, cookies and local storage, and never left', () => {
    const root = tempDir();
    const outside = tempDir();
    const value = (name: string): string => join_(name, '-fake-', 'value-0042');
    const names = ['access', 'refresh', 'metadata', 'cookie', 'storage', 'nested', 'profile', 'listed'] as const;
    mkdirSync(join(root, '.auth', 'profiles', 'W1'), { recursive: true });
    writeFileSync(join(root, '.auth', 'api-state.json'), JSON.stringify({ token: value('access'), tokenType: 'Bearer', refreshToken: value('refresh') }));
    writeFileSync(join(root, '.auth', 'tokens.json'), JSON.stringify({ ADMIN_STAGING: { token: value('metadata') }, tokens: [value('listed')] }));
    writeFileSync(join(root, '.auth', 'user.json'), JSON.stringify({
      cookies: [{ name: 'theme', value: value('cookie') }],
      origins: [{ origin: 'https://app.example.test', localStorage: [{ name: 'a', value: value('storage') }, { name: 'b', value: JSON.stringify({ access_token: value('nested') }) }] }],
    }));
    writeFileSync(join(root, '.auth', 'profiles', 'W1', 'tokens.env'), `export API_TOKEN_ADMIN_STAGING='${value('profile')}'\n`);
    writeFileSync(join(outside, 'elsewhere.json'), JSON.stringify({ token: value('outside') }));
    symlinkSync(join(outside, 'elsewhere.json'), join(root, '.auth', 'link.json'));
    symlinkSync(join(root, '.auth'), join(root, '.auth', 'profiles', 'loop'));
    writeFileSync(join(root, '.auth', 'huge.json'), JSON.stringify({ token: value('huge'), pad: 'x'.repeat(6 * 1024 * 1024) }));

    const values = collectSecretValues(root, {});

    expect(values).toEqual(expect.arrayContaining(names.map(value)));
    expect(values).not.toContain(value('outside'));
    expect(values).not.toContain(value('huge'));
  });

  const masked: [string, string][] = [
    ['unquoted value with a semicolon', `password=Ab12;${RAW}`],
    ['unquoted value with brackets', `DB_PASSWORD=P4ss(${RAW})`],
    ['unquoted value with an ampersand', `password: a&${RAW}`],
    ['unquoted value with a quote and an angle', `password=ab"c<${RAW}`],
    ['aria field with child lines', `- textbox "Password" [ref=e1]:\n  - /placeholder: Enter it\n  - text: ${RAW}\n- button "Go"`],
    ['aria field named pwd', `- textbox "Pwd":\n    - text: "${RAW}"`],
    ['inspected cookie', `{ name: 'sid', value: '${RAW}', domain: 'x.test' }`],
    ['inspected header', `{ name: 'Authorization', value: '${RAW}' }`],
    ['value before name', `{"value":"${RAW}","name":"Authorization"}`],
    ['pair named by auth', `{"name":"sb-auth","value":"${RAW}"}`],
    ['token list', `{"tokens":["a1","${RAW}"]}`],
    ['authorization list', `{"authorization":["${RAW}"]}`],
    ['pass key', `{"pass":"${RAW}"}`],
    ['auth key', `auth: ${RAW}`],
    ['x-auth header with a scheme', `x-auth: Token ${RAW}`],
    ['session key', `sessionKey=${RAW}`],
    ['password flag', `tool --password ${RAW}`],
    ['curl user flag', `curl -u user:${RAW} https://h.test`],
    ['value on the next line', `{\n  "password":\n    "${RAW}"\n}`],
  ];

  test.each(masked)('redacts and refuses: %s', (_label, text) => {
    const out = createRedactor([]).text(text);

    expect(inspectHtml(pageOf(text), []).length).toBeGreaterThan(0);
    expect(out).not.toContain(RAW);
    expect(out).toContain(MARKER);
    expect(inspectHtml(pageOf(out), [])).toEqual([]);
  });

  test.each([
    `Fill "${RAW}" getByTestId('pwd')`,
    `locator('#pass').fill('${RAW}')`,
    `Fill "${RAW}" getByTestId('login-pwd')`,
    `getByTestId('userPass').fill("${RAW}")`,
  ])('masks a value typed into a short password selector: %s', (text) => {
    expect(createRedactor([]).text(text)).not.toContain(RAW);
  });

  test('a secret query value is masked without eating the rest of the URL', () => {
    expect(createRedactor([]).text(`https://h.test/?a=1&token=${RAW}&b=2`)).toBe(`https://h.test/?a=1&token=${MARKER}&b=2`);
  });

  test('words that only start like a secret key stay as they are', () => {
    const redactor = createRedactor([]);
    const clean = [
      '{"passed": 3, "author": "Someone Else", "passRate": 0.95}',
      'passed: 12345',
      '{"name":"author","value":"somebody"}',
      'git push -u origin main',
      '--pass:#22c55e; --pass-d:#15803d;',
      '(token=$MY_TOKEN), password: null,',
      'Error: invalid token:\nexpected 401',
      'Password:\n  must be at least 8 characters',
    ];
    for (const text of clean) { expect(redactor.text(text)).toBe(text); }
  });

  test('whatever the model emits, the gate accepts', () => {
    const dir = tempDir();
    const nasty = [
      'Password:\n  must be at least 8 characters',
      'Error: invalid token:\nexpected 401',
      'rejects a bad token:"',
      'tokens:[',
      'x-auth:["',
      'cookie:[',
      'authorization:"',
      '- textbox "Password": x<a ',
      '--password \\"',
      'uses token=$MY_TOKEN',
      'password:\n"',
      '{ domain: x, "value":',
      `line\n${'\n'.repeat(6)}token:"\ntail"`,
    ];
    nasty.forEach((text, i) => writeResult(dir, i, {
      name: text,
      status: i % 2 === 0 ? 'failed' : 'skipped',
      message: text,
      tags: [text, 'password'],
      steps: [clocked(text, 'failed', { parameters: [{ name: text, value: text }] })],
      extra: {
        description: text,
        fullName: `a.test.ts › ${text}`,
        parameters: [{ name: 'Project', value: text }, { name: 'token:', value: 'plain' }],
        links: [{ name: 'token', url: 'abcdef-ghij', type: text }, { name: text, url: `https://h.test/${text}`, type: 'tms' }],
        labels: [{ name: 'suite', value: text }, { name: 'subSuite', value: '"quoted"' }],
      },
    }));
    const history = join(dir, 'history.json');
    writeFileSync(history, JSON.stringify([{ label: 'a', at: 'token: $A_VERY_LONG_VARIABLE', passed: 1 }, { label: 'b', at: '2026-01-02', failed: 1 }]));
    writeFileSync(join(dir, 'environment.properties'), 'token\\:=x\nNote=cookie:[\n');
    const model = fullModel(dir, history);

    expect(inspectHtml(renderHtml(model), [])).toEqual([]);
    expect(model.signatures.map(s => s.signature).join('\n')).toContain(`Password: ${MARKER}`);
  });

  test('environment.properties joins continued lines and splits on any separator', () => {
    const dir = tempDir();
    writeResult(dir, 0, { name: 'x', status: 'passed' });
    writeFileSync(join(dir, 'environment.properties'), [
      '# comment',
      'API_PASSWORD=ab\\',
      '    cd1',
      'DB_PASSWORD: ef2',
      'SMTP_PASSWORD gh3',
      'Browser : chromium',
      `Note first\\\n  ${'token'}=${RAW}`,
    ].join('\n'));

    expect(fullModel(dir).envProps).toEqual([
      { name: 'API_PASSWORD', value: MARKER },
      { name: 'DB_PASSWORD', value: MARKER },
      { name: 'SMTP_PASSWORD', value: MARKER },
      { name: 'Browser', value: 'chromium' },
      { name: 'Note', value: `firsttoken=${MARKER}` },
    ]);
  });

  test('hostile text is redacted and classified in linear time', () => {
    const redactor = createRedactor([]);
    const dir = tempDir();
    const hostile = ['\\', '-sk-', '-eyJ', 'no x ', '\\"', 'password="\\', 'ATC [x]: ', '{domain:'];
    hostile.forEach((unit, i) => {
      const text = unit.repeat(Math.ceil(200_000 / unit.length));
      writeResult(dir, i, { name: 'x', status: 'skipped', message: text, steps: [clocked(text)] });
    });
    const started = performance.now();
    for (const unit of hostile) { redactor.text(unit.repeat(Math.ceil(200_000 / unit.length))); }
    renderHtml(fullModel(dir));

    expect(performance.now() - started).toBeLessThan(20_000);
  }, 60_000);

  test('a folded retry keeps the earliest start and its bar spans the attempts', () => {
    const dir = tempDir();
    writeResult(dir, 0, { name: 'flaky', status: 'failed', extra: { historyId: 'same', start: 1000, stop: 2000 } });
    writeResult(dir, 1, { name: 'flaky', status: 'passed', extra: { historyId: 'same', start: 5000, stop: 6000 } });
    writeResult(dir, 2, { name: 'long', status: 'passed', extra: { start: 1000, stop: 11_000 } });
    const model = fullModel(dir);

    expect(model.tests.find(t => t.name === 'flaky')).toMatchObject({ status: 'passed', start: 1000, stop: 6000, duration: 2000, attempts: 2 });
    expect(model.summary.startedAt).toBe(1000);
    expect(renderHtml(model)).toContain('width="500.00"');
  });

  test('every exit 1 removes the earlier report', () => {
    const root = tempDir();
    const empty = tempDir();
    const results = tempDir();
    writeResult(results, 1, { name: 'x', status: 'passed' });
    const out = join(root, 'report.html');
    const boom = () => { throw new Error('render broke'); };
    const attempts: [string, Partial<RunContext>][] = [[join(root, 'absent'), {}], [empty, {}], [results, { render: boom }]];

    for (const [dir, more] of attempts) {
      writeFileSync(out, 'stale');
      expect(run(['--results', dir, '--out', out], { ...context(root), ...more })).toBe(1);
      expect(existsSync(out)).toBe(false);
    }
  });

  test('a secret straddling the text cut is redacted and the gate accepts the page', () => {
    for (let offset = 0; offset < 40; offset += 3) {
      for (const lead of ['x'.repeat(64 * 1024 - offset), `${'x\n'.repeat(32 * 1024 - 20)}${'y'.repeat(40 - offset)}`]) {
        const dir = tempDir();
        writeFileSync(join(dir, 'a.txt'), `${lead} "token": "${RAW}" ${'z'.repeat(200)}`);
        writeResult(dir, 0, { name: 'x', status: 'failed', attachments: [{ name: 'a', type: 'text/plain', source: 'a.txt' }] });
        const model = fullModel(dir);

        expect(model.tests[0].attachments[0].body).not.toContain(RAW.slice(0, 5));
        expect(inspectHtml(renderHtml(model), [])).toEqual([]);
      }
    }
  });

  test('a HAR saved as .json is never embedded, whatever its key order', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'net.json'), JSON.stringify({ meta: 1, log: { creator: { name: 'c' }, entries: [{ response: { content: { text: 'body-of-a-response' } } }], version: '1.2' } }));
    writeFileSync(join(dir, 'plain.json'), JSON.stringify({ log: 'not a capture' }));
    writeResult(dir, 0, { name: 'x', status: 'failed', attachments: ['net.json', 'plain.json'].map(source => ({ name: source, type: 'application/json', source })) });
    const [capture, plain] = fullModel(dir).tests[0].attachments;

    expect(capture).toMatchObject({ kind: 'omitted', body: 'HAR capture, never embedded' });
    expect(plain.kind).toBe('text');
  });

  test('a skip reason row opens the pane under the test name', () => {
    const dir = tempDir();
    writeResult(dir, 0, { name: 'skipped one', status: 'skipped', message: 'No seed record available' });

    expect(renderHtml(fullModel(dir))).toContain('row.querySelector(\'.flat-name\') || (target && target.querySelector(\'.leaf-name\'))');
  });
});
