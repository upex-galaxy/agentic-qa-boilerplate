import type { BreakdownModel, ManifestLike } from './tests-explain-render.ts';

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  applyManifest,
  computeFindings,
  loadTraceability,
  parseArgs,
  preparePage,
  renderHtml,
  renderMarkdown,
  resolveLabels,
  SCHEMA_VERSION,
  SECTION_IDS,
  THEME_TOKENS,
  validateModel,
} from './tests-explain-render.ts';

// ============================================================================
// FIXTURES — synthetic, in the shape the explain mode writes. Deliberately not
// the live kata-manifest.json, which changes whenever a component is added.
// ============================================================================

function manifest(): ManifestLike {
  return {
    components: {
      api: [{
        name: 'AuthApi',
        relativePath: 'tests/components/api/AuthApi.ts',
        atcs: [
          { id: 'PROJ-101', method: 'authenticateSuccessfully', line: 73 },
          { id: 'PROJ-102', method: 'loginWithInvalidCredentials', line: 112 },
        ],
      }],
      ui: [],
    },
  };
}

function model(over: Partial<BreakdownModel> = {}): BreakdownModel {
  return {
    schemaVersion: SCHEMA_VERSION,
    lang: 'en',
    scope: { slug: 'auth', title: 'Auth module', input: 'tests/integration/auth/' },
    commit: 'abc1234',
    generatedAt: '2026-09-30T10:00:00Z',
    sourceFiles: ['tests/integration/auth/user-session.test.ts'],
    tests: [
      {
        id: 're-auth',
        name: 'UPEX-100: should be able to re-authenticate',
        file: 'tests/integration/auth/user-session.test.ts',
        line: 50,
        fixture: 'api',
        value: 'A user whose session was cleared can log in again and get a fresh token.',
        setup: ['clear-token'],
        atcs: [
          {
            id: 'PROJ-101',
            // Wrong on purpose: the manifest must win.
            method: 'inventedName',
            actions: ['POST credentials to the login endpoint', 'GET /auth/me to confirm the session'],
            assertions: [
              { polarity: 'positive', text: 'login returns 200', expected: '200', file: 'tests/components/api/AuthApi.ts', line: 84 },
              { polarity: 'positive', text: 'token type is Bearer', expected: 'Bearer', file: 'tests/components/api/AuthApi.ts', line: 86 },
            ],
          },
        ],
        assertions: [
          { polarity: 'positive', text: 'status is 200', expected: '200', file: 'tests/integration/auth/user-session.test.ts', line: 63 },
        ],
      },
      {
        id: 'no-token',
        name: 'UPEX-100: should fail without token',
        file: 'tests/integration/auth/user-session.test.ts',
        line: 35,
        fixture: 'api',
        value: 'An anonymous caller never reads a user profile.',
        atcs: [],
        assertions: [
          { polarity: 'negative', text: 'no session: status is 401', expected: '401', file: 'tests/integration/auth/user-session.test.ts', line: 42 },
        ],
        data: {
          columns: ['email', 'password'],
          rows: [
            { values: ['', 'secret'], partition: 'empty email', technique: 'BVA' },
            { values: ['user@x.io', 'wrong'], partition: 'wrong password', technique: 'EP' },
          ],
        },
      },
    ],
    setup: [
      {
        id: 'clear-token',
        name: 'Clear the stored token',
        description: 'Drops the token loaded from api-state.json',
        file: 'tests/integration/auth/user-session.test.ts',
        line: 52,
        produces: [{ variable: 'credentials', value: 'config.testUser' }],
        usedIn: ['re-auth'],
      },
    ],
    findings: [
      { kind: 'hard-wait', message: 'waitForTimeout(2000)', file: 'tests/integration/auth/user-session.test.ts', line: 99 },
    ],
    ...over,
  };
}

function raw(over: Record<string, unknown> = {}): unknown {
  return JSON.parse(JSON.stringify({ ...model(), ...over }));
}

// ============================================================================
// VALIDATION
// ============================================================================

describe('validateModel', () => {
  test('accepts a well-formed model', () => {
    const result = validateModel(raw());
    expect(result.errors).toEqual([]);
    expect(result.model?.scope.slug).toBe('auth');
  });

  test('refuses an unknown schemaVersion by name', () => {
    const result = validateModel(raw({ schemaVersion: 2 }));
    expect(result.model).toBeUndefined();
    expect(result.errors.join('\n')).toContain('schemaVersion 2');
    expect(result.errors.join('\n')).toContain(`reads ${SCHEMA_VERSION}`);
  });

  test('refuses a missing schemaVersion', () => {
    const r = raw() as Record<string, unknown>;
    delete r.schemaVersion;
    expect(validateModel(r).errors.join('\n')).toContain('schemaVersion');
  });

  test('names the JSON path of every bad field', () => {
    const bad = raw() as { tests: Array<Record<string, unknown>> };
    bad.tests[0].fixture = 'browser';
    (bad.tests[0].atcs as Array<{ assertions: Array<Record<string, unknown>> }>)[0].assertions[0].polarity = 'maybe';
    (bad.tests[1].assertions as Array<Record<string, unknown>>)[0].line = 'x';
    const errors = validateModel(bad).errors.join('\n');
    expect(errors).toContain('tests[0].fixture');
    expect(errors).toContain('tests[0].atcs[0].assertions[0].polarity');
    expect(errors).toContain('tests[1].assertions[0].line');
  });

  test('rejects a scope slug that would escape the report directory', () => {
    const errors = validateModel(raw({ scope: { slug: '../../etc', title: 't', input: 'i' } })).errors.join('\n');
    expect(errors).toContain('scope.slug');
  });

  test('rejects a non-object root', () => {
    expect(validateModel('nope').errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// MANIFEST PREFILL — the facts a script can extract are never the AI's word
// ============================================================================

describe('applyManifest', () => {
  test('overwrites method/file/line from kata-manifest.json and warns on a mismatch', () => {
    const { model: m, warnings } = applyManifest(model(), manifest());
    const atc = m.tests[0].atcs[0];
    expect(atc.method).toBe('authenticateSuccessfully');
    expect(atc.file).toBe('tests/components/api/AuthApi.ts');
    expect(atc.line).toBe(73);
    expect(atc.inManifest).toBe(true);
    expect(warnings.join('\n')).toContain('inventedName');
  });

  test('flags an ATC id the manifest does not know', () => {
    const m = model();
    m.tests[0].atcs[0].id = 'PROJ-999';
    const { model: out } = applyManifest(m, manifest());
    expect(out.tests[0].atcs[0].inManifest).toBe(false);
  });
});

// ============================================================================
// FINDINGS — read-only lint, facts with a location, never a fix
// ============================================================================

describe('computeFindings', () => {
  test('derives the mechanical findings and keeps the supplied ones', () => {
    const m = model();
    m.tests[0].atcs[0].id = 'PROJ-999';
    m.tests[0].atcs[0].assertions[1].soft = true;
    const prepared = applyManifest(m, manifest()).model;
    const kinds = computeFindings(prepared).map(f => f.kind).sort();
    expect(kinds).toContain('atc-no-negative');
    expect(kinds).toContain('atc-not-in-manifest');
    expect(kinds).toContain('soft-assertion');
    expect(kinds).toContain('hard-wait');
  });

  test('reports a test with zero assertions', () => {
    const m = model();
    m.tests[1].assertions = [];
    const findings = computeFindings(applyManifest(m, manifest()).model);
    const zero = findings.find(f => f.kind === 'test-no-assertions');
    expect(zero?.file).toBe('tests/integration/auth/user-session.test.ts');
    expect(zero?.line).toBe(35);
  });

  test('does not duplicate a finding the AI already supplied', () => {
    const m = model();
    m.tests[1].assertions = [];
    m.findings = [{ kind: 'test-no-assertions', message: 'dup', file: 'tests/integration/auth/user-session.test.ts', line: 35 }];
    const findings = computeFindings(applyManifest(m, manifest()).model);
    expect(findings.filter(f => f.kind === 'test-no-assertions')).toHaveLength(1);
  });
});

// ============================================================================
// TRACEABILITY — disk only, from the synced .context/PBI/ cache
// ============================================================================

describe('loadTraceability', () => {
  test('returns null when the PBI cache is absent', () => {
    expect(loadTraceability(join(tmpdir(), 'explain-render-no-pbi'), ['PROJ-101'])).toBeNull();
  });

  test('maps an ATC id to its synced Test and the Story that holds it', () => {
    const root = mkdtempSync(join(tmpdir(), 'explain-render-pbi-'));
    try {
      const cases = join(root, 'epics', 'EPIC-PROJ-1-auth', 'stories', 'STORY-PROJ-5-login', 'test-cases');
      mkdirSync(cases, { recursive: true });
      writeFileSync(join(cases, 'TEST-PROJ-101-valid-login.md'), [
        '# TEST: Valid login',
        '',
        '**Jira Key:** [PROJ-101](https://example.atlassian.net/browse/PROJ-101)',
        '**Status:** AUTOMATED',
        '',
      ].join('\n'));
      const rows = loadTraceability(root, ['PROJ-101', 'PROJ-102']);
      expect(rows).not.toBeNull();
      const hit = rows!.find(r => r.atc === 'PROJ-101');
      expect(hit?.testSummary).toBe('Valid login');
      expect(hit?.coverable).toBe('PROJ-5');
      expect(hit?.url).toBe('https://example.atlassian.net/browse/PROJ-101');
      expect(rows!.find(r => r.atc === 'PROJ-102')?.testSummary).toBeNull();
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// LABELS — page language = conversation language (deck decision D6)
// ============================================================================

describe('resolveLabels', () => {
  test('ships Spanish and English', () => {
    expect(resolveLabels('es', undefined).labels.findings).not.toBe(resolveLabels('en', undefined).labels.findings);
  });

  test('another language falls back to English for every key it does not supply, and says which', () => {
    const { labels, missing } = resolveLabels('pt', { findings: 'Achados' });
    expect(labels.findings).toBe('Achados');
    expect(labels.summary).toBe(resolveLabels('en', undefined).labels.summary);
    expect(missing).toContain('summary');
    expect(missing).not.toContain('findings');
  });
});

// ============================================================================
// RENDER
// ============================================================================

function page(over: Partial<BreakdownModel> = {}, trace: ReturnType<typeof loadTraceability> = null) {
  return preparePage(model(over), { manifest: manifest(), traceability: trace, linkBase: '../../../' });
}

describe('renderHtml', () => {
  test('renders every section', () => {
    const html = renderHtml(page().page);
    for (const id of SECTION_IDS) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test('carries light and dark tokens and a print stylesheet', () => {
    const html = renderHtml(page().page);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('--bg: #ffffff');
    expect(html).toContain('--bg: #16161e');
    expect(html).toContain('@media print');
    expect(html).toContain('name="viewport"');
  });

  test('makes no external request', () => {
    const html = renderHtml(page().page);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect(html).not.toContain('@import');
  });

  test('a Jira link in the traceability table is navigation, not a load', () => {
    const trace = [{ atc: 'PROJ-101', testKey: 'PROJ-101', testSummary: 'Valid login', testStatus: 'AUTOMATED', url: 'https://example.atlassian.net/browse/PROJ-101', coverable: 'PROJ-5', coverablePath: 'epics/x' }];
    const html = renderHtml(page({}, trace).page);
    const urls = html.match(/https?:\/\/[^"'\s<]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(html).toContain(`href="${u}"`);
    }
  });

  test('uses the page language and keeps test names verbatim', () => {
    const html = renderHtml(page({ lang: 'es' }).page);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain(resolveLabels('es', undefined).labels.findings);
    expect(html).toContain('UPEX-100: should be able to re-authenticate');
  });

  test('links every assertion to its file:line', () => {
    const html = renderHtml(page().page);
    expect(html).toContain('href="../../../tests/components/api/AuthApi.ts"');
    expect(html).toContain('AuthApi.ts:84');
  });

  test('shows the manifest method, never the invented one', () => {
    const html = renderHtml(page().page);
    expect(html).toContain('authenticateSuccessfully');
    expect(html).not.toContain('inventedName');
  });

  test('escapes HTML in every AI-written string', () => {
    const html = renderHtml(page({ scope: { slug: 'x', title: '<img src=x onerror=alert(1)>', input: 'i' } }).page);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  test('renders the data table with the partition and technique of each row', () => {
    const html = renderHtml(page().page);
    expect(html).toContain('wrong password');
    expect(html).toContain('BVA');
  });

  test('is deterministic for the same input', () => {
    expect(renderHtml(page().page)).toBe(renderHtml(page().page));
  });
});

describe('renderMarkdown', () => {
  test('keeps the PR-description use: summary table with counts per test', () => {
    const md = renderMarkdown(page().page);
    expect(md).toContain('| UPEX-100: should be able to re-authenticate |');
    expect(md).toContain('PROJ-101');
    expect(md).toMatch(/\|\s*3\s*\|/);
  });
});

describe('THEME_TOKENS', () => {
  test('stay in lockstep with the docs site palette (docs/assets/docs.css)', () => {
    const css = readFileSync(join(import.meta.dir, '..', 'docs', 'assets', 'docs.css'), 'utf8');
    const [light, dark] = [css.indexOf(':root {'), css.indexOf(':root[data-theme=\'dark\'] {')];
    const lightBlock = css.slice(light, dark);
    const darkBlock = css.slice(dark, css.indexOf('}', dark));
    for (const [k, v] of Object.entries(THEME_TOKENS.light)) { expect(lightBlock).toContain(`${k}: ${v};`); }
    for (const [k, v] of Object.entries(THEME_TOKENS.dark)) { expect(darkBlock).toContain(`${k}: ${v};`); }
  });
});

describe('parseArgs', () => {
  test('takes the first positional as the JSON path', () => {
    expect(parseArgs(['x.json']).jsonPath).toBe('x.json');
  });

  test('never takes the --out value for the JSON path, before or after it', () => {
    expect(parseArgs(['--out', 'p.html', 'x.json'])).toMatchObject({ jsonPath: 'x.json', out: 'p.html' });
    expect(parseArgs(['x.json', '--out', 'p.html', '--open'])).toMatchObject({ jsonPath: 'x.json', out: 'p.html', open: true });
  });

  test('no argument means help', () => {
    expect(parseArgs([]).help).toBe(true);
  });
});

describe('explain-tests.md', () => {
  test('its JSON example passes the validator, so the doc cannot drift from the contract', () => {
    const doc = readFileSync(join(import.meta.dir, '..', '.agents', 'skills', 'test-automation', 'references', 'explain-tests.md'), 'utf8');
    const block = doc.match(/```json\n([\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    expect(validateModel(JSON.parse(block![1])).errors).toEqual([]);
  });
});
