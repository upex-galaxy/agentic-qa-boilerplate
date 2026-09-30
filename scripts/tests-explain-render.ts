#!/usr/bin/env bun

/**
 * ============================================================================
 * TESTS EXPLAIN RENDER - Turn a test-breakdown JSON into one HTML page
 * ============================================================================
 *
 * `/test-automation explain` (the break-down-tests mode) reads the tests of a
 * scope and writes the FACTS as JSON: tests, ATC calls, assertions with their
 * file and line, fixtures, data rows, setup variables. This script validates
 * that JSON and renders a self-contained page a PM can read and a reviewer can
 * trust. The AI does the reading and the business wording; the page itself is
 * deterministic, identical across runs and harnesses.
 *
 * Facts a script can extract are never the AI's word: every ATC id is looked
 * up in `kata-manifest.json`, whose method, file and line overwrite whatever
 * the JSON says. Traceability (ATC -> Jira Test -> Story) is read from the
 * synced `.context/PBI/` cache on disk, never from Jira.
 *
 * The JSON contract carries `schemaVersion`. This script is synced to every
 * consumer, so it refuses a version it does not know, by name, instead of
 * rendering half a page.
 *
 * USAGE:
 *   bun scripts/tests-explain-render.ts <breakdown.json> [options]
 *
 * OPTIONS:
 *   --out <path>   Output file (default: the JSON path with `.html`)
 *   --open         Open the page with the system opener after writing it
 *   help           Show usage
 *
 * ============================================================================
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { relativePosix } from './lib/posix-path.ts';
import { parseSyncedName, parseTestMarkdown } from './tests-map.ts';

// ============================================================================
// CONTRACT
// ============================================================================

/** Bump when the JSON shape changes incompatibly; the renderer refuses any other value. */
const SCHEMA_VERSION = 1;

const FIXTURES = ['api', 'ui', 'test'] as const;
const POLARITIES = ['positive', 'negative'] as const;
const TECHNIQUES = ['EP', 'BVA', 'state-transition', 'decision-table', 'pairwise', 'error-guessing'] as const;
const FINDING_KINDS = ['atc-no-negative', 'test-no-assertions', 'soft-assertion', 'hard-wait', 'atc-not-in-manifest', 'other'] as const;

/** The eight sections every page renders, in page order. The id is the anchor. */
const SECTION_IDS = ['overview', 'summary', 'flow', 'cards', 'dataflow', 'findings', 'traceability', 'glossary'] as const;

type Fixture = typeof FIXTURES[number];
type Polarity = typeof POLARITIES[number];
type Technique = typeof TECHNIQUES[number];
type FindingKind = typeof FINDING_KINDS[number];

interface Assertion {
  polarity: Polarity
  /** What must (positive) or must NOT (negative) be true, in the page language. */
  text: string
  expected?: string
  file: string
  line: number
  soft?: boolean
}

interface AtcCall {
  /** The `@atc('KEY')` id, verbatim. */
  id: string
  /** Overwritten from kata-manifest.json when the id is registered there. */
  method?: string
  file?: string
  line?: number
  params?: string
  actions: string[]
  assertions: Assertion[]
  /** Set by applyManifest, never by the JSON. */
  inManifest?: boolean
}

interface DataRow {
  values: string[]
  partition: string
  technique?: Technique
}

interface TestEntry {
  /** Slug, unique in the file, used as the anchor. */
  id: string
  /** The test title, verbatim. */
  name: string
  file: string
  line: number
  fixture: Fixture
  /** One sentence: the business value this test protects. */
  value: string
  guard?: string
  /** Ids of `setup[]` entries this test depends on. */
  setup?: string[]
  atcs: AtcCall[]
  /** Assertions written in the test body itself, outside any ATC. */
  assertions?: Assertion[]
  data?: { columns: string[], rows: DataRow[] }
}

interface SetupEntry {
  id: string
  name: string
  description: string
  file: string
  line: number
  produces: { variable: string, value: string }[]
  /** Test ids that reuse what this setup produced. */
  usedIn: string[]
}

interface Finding {
  kind: FindingKind
  message: string
  file: string
  line: number
}

interface GlossaryEntry {
  term: string
  definition: string
}

interface BreakdownModel {
  schemaVersion: number
  /** BCP-47 code of the conversation language (deck decision D6). */
  lang: string
  /** Label overrides; required in practice for a language the renderer does not ship. */
  labels?: Partial<Labels>
  scope: { slug: string, title: string, input: string }
  commit?: string
  generatedAt?: string
  sourceFiles: string[]
  tests: TestEntry[]
  setup?: SetupEntry[]
  /** Findings only a reader can see (a hard wait, an odd pattern). Mechanical ones are derived. */
  findings?: Finding[]
  glossary?: GlossaryEntry[]
}

interface ManifestLike {
  components: Record<string, { name: string, relativePath: string, atcs: { id: string, method: string, line: number }[] }[]>
}

interface TraceRow {
  atc: string
  testKey: string | null
  testSummary: string | null
  testStatus: string | null
  url: string | null
  /** Jira key of the Story (or other coverable) whose folder holds the Test. */
  coverable: string | null
  coverablePath: string | null
}

// ============================================================================
// LABELS (page language = conversation language; ids, names and code stay verbatim)
// ============================================================================

interface Labels {
  pageTitle: string
  overview: string
  summary: string
  flow: string
  cards: string
  dataflow: string
  findings: string
  traceability: string
  glossary: string
  copyMarkdown: string
  copied: string
  filterPlaceholder: string
  statTests: string
  statAtcs: string
  statAssertions: string
  statPositive: string
  statNegative: string
  statFixtures: string
  scope: string
  commit: string
  generated: string
  sources: string
  colTest: string
  colAtcs: string
  colAssertions: string
  colValue: string
  setup: string
  assertionsShort: string
  guard: string
  actions: string
  positive: string
  negative: string
  expected: string
  soft: string
  testLevel: string
  data: string
  partition: string
  technique: string
  variable: string
  valueCol: string
  source: string
  usedIn: string
  kind: string
  detail: string
  location: string
  noSetup: string
  noFindings: string
  noTrace: string
  notInCache: string
  colJiraTest: string
  colStatus: string
  colCoverable: string
  kindAtcNoNegative: string
  kindTestNoAssertions: string
  kindSoftAssertion: string
  kindHardWait: string
  kindAtcNotInManifest: string
  kindOther: string
  notInManifest: string
  findingsNote: string
}

const EN: Labels = {
  pageTitle: 'Test breakdown',
  overview: 'Overview',
  summary: 'What this suite proves',
  flow: 'Flow per test',
  cards: 'Test cards',
  dataflow: 'Data flow',
  findings: 'Findings',
  traceability: 'Traceability',
  glossary: 'Glossary',
  copyMarkdown: 'Copy as Markdown',
  copied: 'Copied',
  filterPlaceholder: 'Filter tests...',
  statTests: 'tests',
  statAtcs: 'ATCs',
  statAssertions: 'assertions',
  statPositive: 'positive',
  statNegative: 'negative',
  statFixtures: 'fixtures',
  scope: 'Scope',
  commit: 'Commit',
  generated: 'Generated',
  sources: 'Source files',
  colTest: 'Test',
  colAtcs: 'ATC ids',
  colAssertions: 'Assertions',
  colValue: 'What it proves',
  setup: 'Setup',
  assertionsShort: 'assertions',
  guard: 'Runs only when',
  actions: 'Actions',
  positive: 'Must be true',
  negative: 'Must NOT be true',
  expected: 'expected',
  soft: 'soft',
  testLevel: 'Assertions in the test body',
  data: 'Test data',
  partition: 'Partition covered',
  technique: 'Technique',
  variable: 'Variable',
  valueCol: 'Value',
  source: 'Produced by',
  usedIn: 'Reused in',
  kind: 'Finding',
  detail: 'Detail',
  location: 'Where',
  noSetup: 'No shared setup: every test builds its own data.',
  noFindings: 'Nothing to report.',
  noTrace: 'No synced Jira cache on this machine (.context/PBI/). Run bun run context:hydrate to see ATC to Story links.',
  notInCache: 'not in the synced cache',
  colJiraTest: 'Jira Test',
  colStatus: 'Status',
  colCoverable: 'Covers',
  kindAtcNoNegative: 'ATC without a negative assertion',
  kindTestNoAssertions: 'Test with zero assertions',
  kindSoftAssertion: 'Soft assertion',
  kindHardWait: 'Hard wait',
  kindAtcNotInManifest: 'ATC not in kata-manifest.json',
  kindOther: 'Other',
  notInManifest: 'not in kata-manifest.json',
  findingsNote: 'Facts with a location. This page never proposes a fix.',
};

const ES: Labels = {
  pageTitle: 'Desglose de tests',
  overview: 'Resumen',
  summary: 'Qué prueba esta suite',
  flow: 'Flujo de cada test',
  cards: 'Fichas de test',
  dataflow: 'Flujo de datos',
  findings: 'Hallazgos',
  traceability: 'Trazabilidad',
  glossary: 'Glosario',
  copyMarkdown: 'Copiar como Markdown',
  copied: 'Copiado',
  filterPlaceholder: 'Filtrar tests...',
  statTests: 'tests',
  statAtcs: 'ATCs',
  statAssertions: 'aserciones',
  statPositive: 'positivas',
  statNegative: 'negativas',
  statFixtures: 'fixtures',
  scope: 'Alcance',
  commit: 'Commit',
  generated: 'Generado',
  sources: 'Archivos fuente',
  colTest: 'Test',
  colAtcs: 'IDs de ATC',
  colAssertions: 'Aserciones',
  colValue: 'Qué prueba',
  setup: 'Preparación',
  assertionsShort: 'aserciones',
  guard: 'Se ejecuta solo si',
  actions: 'Acciones',
  positive: 'Debe cumplirse',
  negative: 'NO debe ocurrir',
  expected: 'esperado',
  soft: 'soft',
  testLevel: 'Aserciones en el cuerpo del test',
  data: 'Datos de prueba',
  partition: 'Partición cubierta',
  technique: 'Técnica',
  variable: 'Variable',
  valueCol: 'Valor',
  source: 'Lo produce',
  usedIn: 'Se reutiliza en',
  kind: 'Hallazgo',
  detail: 'Detalle',
  location: 'Dónde',
  noSetup: 'Sin preparación compartida: cada test arma sus propios datos.',
  noFindings: 'Nada que reportar.',
  noTrace: 'No hay caché sincronizada de Jira en esta máquina (.context/PBI/). Corré bun run context:hydrate para ver los vínculos ATC a Story.',
  notInCache: 'no está en la caché sincronizada',
  colJiraTest: 'Test en Jira',
  colStatus: 'Estado',
  colCoverable: 'Cubre',
  kindAtcNoNegative: 'ATC sin aserción negativa',
  kindTestNoAssertions: 'Test sin aserciones',
  kindSoftAssertion: 'Aserción soft',
  kindHardWait: 'Espera fija',
  kindAtcNotInManifest: 'ATC ausente de kata-manifest.json',
  kindOther: 'Otro',
  notInManifest: 'ausente de kata-manifest.json',
  findingsNote: 'Hechos con ubicación. Esta página nunca propone un arreglo.',
};

const BUILTIN_LABELS: Record<string, Labels> = { en: EN, es: ES };

const GLOSSARY: Record<string, GlossaryEntry[]> = {
  en: [
    { term: 'ATC', definition: 'Acceptance Test Case: one complete, atomic mini-flow (an action plus the checks that prove it worked), tagged with a Jira Test id.' },
    { term: 'Fixture', definition: 'What a test receives ready to use: { api } for HTTP only, { ui } for the browser only, { test } for both.' },
    { term: 'Steps', definition: 'A reusable chain of ATCs used as a precondition, so a test does not repeat the same setup flow.' },
    { term: 'KATA layer', definition: 'The four levels the test code is built on: shared context, API/UI helpers, the per-module components that hold the ATCs, and the fixtures that hand them to tests.' },
    { term: 'Positive assertion', definition: 'A check that something MUST be true, such as a 200 status or a field with the expected value.' },
    { term: 'Negative assertion', definition: 'A check that something must NOT happen, such as no session being created after a failed login.' },
    { term: 'EP / BVA', definition: 'Equivalence Partitioning picks one value per class of inputs that behave the same; Boundary Value Analysis tests the edges of a range, where bugs cluster.' },
  ],
  es: [
    { term: 'ATC', definition: 'Acceptance Test Case: un mini-flujo completo y atómico (una acción más las verificaciones que prueban que funcionó), etiquetado con el id de un Test de Jira.' },
    { term: 'Fixture', definition: 'Lo que el test recibe listo para usar: { api } solo HTTP, { ui } solo navegador, { test } ambos.' },
    { term: 'Steps', definition: 'Una cadena reutilizable de ATCs que sirve de precondición, para que un test no repita el mismo flujo de preparación.' },
    { term: 'Capa KATA', definition: 'Los cuatro niveles sobre los que se arma el código de test: contexto compartido, helpers de API y UI, los componentes por módulo que contienen los ATCs, y los fixtures que se los entregan a los tests.' },
    { term: 'Aserción positiva', definition: 'Una verificación de algo que DEBE cumplirse, como un status 200 o un campo con el valor esperado.' },
    { term: 'Aserción negativa', definition: 'Una verificación de algo que NO debe ocurrir, como que no se cree sesión tras un login fallido.' },
    { term: 'EP / BVA', definition: 'Partición de Equivalencia elige un valor por cada clase de entradas que se comportan igual; Análisis de Valores Límite prueba los bordes de un rango, donde se juntan los bugs.' },
  ],
};

/**
 * Resolves the label set for a language. `en` and `es` ship complete; any other
 * language takes the JSON's `labels` and falls back to English per missing key,
 * reporting which keys fell back so the caller can say so.
 */
function resolveLabels(lang: string, overrides: Partial<Labels> | undefined): { labels: Labels, missing: (keyof Labels)[] } {
  const base = BUILTIN_LABELS[lang.split('-')[0].toLowerCase()];
  const labels: Labels = { ...(base ?? EN), ...(overrides ?? {}) };
  const missing = base
    ? []
    : (Object.keys(EN) as (keyof Labels)[]).filter(k => overrides?.[k] === undefined);
  return { labels, missing };
}

// ============================================================================
// THEME — the docs site palette (docs/assets/docs.css), embedded so the page
// makes no request. A test keeps these values in lockstep with that file.
// ============================================================================

const THEME_TOKENS: { light: Record<string, string>, dark: Record<string, string> } = {
  light: {
    '--bg': '#ffffff',
    '--bg-soft': '#f7f8fb',
    '--surface': '#ffffff',
    '--surface-2': '#f1f3f8',
    '--border': '#e4e7ef',
    '--border-strong': '#cdd3e1',
    '--text': '#1b1f31',
    '--text-2': '#444a61',
    '--muted': '#626a84',
    '--accent': '#3352b3',
    '--accent-soft': 'rgba(51, 82, 179, 0.1)',
    '--purple': '#7143b8',
    '--cyan': '#14606d',
    '--green': '#2f6156',
    '--green-soft': 'rgba(47, 97, 86, 0.1)',
    '--red': '#b12d4b',
    '--red-soft': 'rgba(177, 45, 75, 0.09)',
    '--yellow': '#8a5a12',
    '--yellow-soft': 'rgba(138, 90, 18, 0.11)',
    '--code-bg': '#f5f6fa',
    '--code-text': '#343b58',
    '--focus-ring': '#3352b3',
  },
  dark: {
    '--bg': '#16161e',
    '--bg-soft': '#1a1b26',
    '--surface': '#1f2335',
    '--surface-2': '#24283b',
    '--border': 'rgba(255, 255, 255, 0.08)',
    '--border-strong': 'rgba(255, 255, 255, 0.17)',
    '--text': '#c0caf5',
    '--text-2': '#a9b1d6',
    '--muted': '#8b93b8',
    '--accent': '#7aa2f7',
    '--accent-soft': 'rgba(122, 162, 247, 0.13)',
    '--purple': '#bb9af7',
    '--cyan': '#7dcfff',
    '--green': '#9ece6a',
    '--green-soft': 'rgba(158, 206, 106, 0.1)',
    '--red': '#f7768e',
    '--red-soft': 'rgba(247, 118, 142, 0.1)',
    '--yellow': '#e0af68',
    '--yellow-soft': 'rgba(224, 175, 104, 0.11)',
    '--code-bg': '#1a1b26',
    '--code-text': '#c0caf5',
    '--focus-ring': '#9ab8ff',
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const ATC_ID = /^[A-Z][A-Z0-9]*-\d+$/;
const LANG = /^[a-z]{2,3}(?:-[A-Z0-9]{2,8})*$/i;

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

class Checker {
  readonly errors: string[] = [];

  str(obj: Json, key: string, path: string, opts: { optional?: boolean, pattern?: RegExp } = {}): void {
    const v = obj[key];
    if (v === undefined && opts.optional) { return; }
    if (typeof v !== 'string' || v.trim() === '') {
      this.errors.push(`${path}${key}: expected a non-empty string`);
      return;
    }
    if (opts.pattern && !opts.pattern.test(v)) {
      this.errors.push(`${path}${key}: "${v}" does not match ${opts.pattern}`);
    }
  }

  line(obj: Json, key: string, path: string, optional = false): void {
    const v = obj[key];
    if (v === undefined && optional) { return; }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
      this.errors.push(`${path}${key}: expected a line number (integer >= 1)`);
    }
  }

  oneOf(obj: Json, key: string, path: string, allowed: readonly string[], optional = false): void {
    const v = obj[key];
    if (v === undefined && optional) { return; }
    if (typeof v !== 'string' || !allowed.includes(v)) {
      this.errors.push(`${path}${key}: expected one of ${allowed.join(' | ')}`);
    }
  }

  strings(obj: Json, key: string, path: string, optional = false): void {
    const v = obj[key];
    if (v === undefined && optional) { return; }
    if (!Array.isArray(v) || v.some(s => typeof s !== 'string')) {
      this.errors.push(`${path}${key}: expected an array of strings`);
    }
  }

  array(obj: Json, key: string, path: string, optional = false): Json[] {
    const v = obj[key];
    if (v === undefined && optional) { return []; }
    if (!Array.isArray(v)) {
      this.errors.push(`${path}${key}: expected an array`);
      return [];
    }
    return v.map((item, i) => {
      if (!isObject(item)) { this.errors.push(`${path}${key}[${i}]: expected an object`); }
      return isObject(item) ? item : {};
    });
  }
}

function checkAssertion(c: Checker, a: Json, path: string): void {
  c.oneOf(a, 'polarity', path, POLARITIES);
  c.str(a, 'text', path);
  c.str(a, 'expected', path, { optional: true });
  c.str(a, 'file', path);
  c.line(a, 'line', path);
  if (a.soft !== undefined && typeof a.soft !== 'boolean') { c.errors.push(`${path}soft: expected a boolean`); }
}

function checkTest(c: Checker, t: Json, path: string): void {
  c.str(t, 'id', path, { pattern: SLUG });
  c.str(t, 'name', path);
  c.str(t, 'file', path);
  c.line(t, 'line', path);
  c.oneOf(t, 'fixture', path, FIXTURES);
  c.str(t, 'value', path);
  c.str(t, 'guard', path, { optional: true });
  c.strings(t, 'setup', path, true);
  c.array(t, 'atcs', path).forEach((atc, i) => {
    const p = `${path}atcs[${i}].`;
    c.str(atc, 'id', p, { pattern: ATC_ID });
    c.str(atc, 'method', p, { optional: true });
    c.str(atc, 'file', p, { optional: true });
    c.line(atc, 'line', p, true);
    c.str(atc, 'params', p, { optional: true });
    c.strings(atc, 'actions', p);
    c.array(atc, 'assertions', p).forEach((a, j) => checkAssertion(c, a, `${p}assertions[${j}].`));
  });
  c.array(t, 'assertions', path, true).forEach((a, j) => checkAssertion(c, a, `${path}assertions[${j}].`));
  if (t.data !== undefined) {
    if (!isObject(t.data)) {
      c.errors.push(`${path}data: expected an object`);
      return;
    }
    c.strings(t.data, 'columns', `${path}data.`);
    c.array(t.data, 'rows', `${path}data.`).forEach((row, i) => {
      const p = `${path}data.rows[${i}].`;
      c.strings(row, 'values', p);
      c.str(row, 'partition', p);
      c.oneOf(row, 'technique', p, TECHNIQUES, true);
    });
  }
}

/**
 * Validates an unknown JSON value against the contract. Every error names the
 * JSON path it is about, so the AI that wrote the file can fix it in one pass.
 */
function validateModel(raw: unknown): { model?: BreakdownModel, errors: string[] } {
  if (!isObject(raw)) { return { errors: ['root: expected a JSON object'] }; }
  if (raw.schemaVersion === undefined) {
    return { errors: [`schemaVersion: missing; this renderer reads ${SCHEMA_VERSION}`] };
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    return {
      errors: [`schemaVersion ${JSON.stringify(raw.schemaVersion)} is not supported; this renderer reads ${SCHEMA_VERSION}. Update the boilerplate (bun run up) or write the JSON at version ${SCHEMA_VERSION}.`],
    };
  }

  const c = new Checker();
  c.str(raw, 'lang', '', { pattern: LANG });
  if (!isObject(raw.scope)) {
    c.errors.push('scope: expected an object');
  }
  else {
    c.str(raw.scope, 'slug', 'scope.', { pattern: SLUG });
    c.str(raw.scope, 'title', 'scope.');
    c.str(raw.scope, 'input', 'scope.');
  }
  c.str(raw, 'commit', '', { optional: true });
  c.str(raw, 'generatedAt', '', { optional: true });
  c.strings(raw, 'sourceFiles', '');
  if (raw.labels !== undefined && (!isObject(raw.labels) || Object.values(raw.labels).some(v => typeof v !== 'string'))) {
    c.errors.push('labels: expected an object of strings');
  }

  const tests = c.array(raw, 'tests', '');
  if (Array.isArray(raw.tests) && raw.tests.length === 0) { c.errors.push('tests: expected at least one test'); }
  tests.forEach((t, i) => checkTest(c, t, `tests[${i}].`));

  const setup = c.array(raw, 'setup', '', true);
  setup.forEach((s, i) => {
    const p = `setup[${i}].`;
    c.str(s, 'id', p, { pattern: SLUG });
    c.str(s, 'name', p);
    c.str(s, 'description', p);
    c.str(s, 'file', p);
    c.line(s, 'line', p);
    c.array(s, 'produces', p).forEach((v, j) => {
      c.str(v, 'variable', `${p}produces[${j}].`);
      c.str(v, 'value', `${p}produces[${j}].`);
    });
    c.strings(s, 'usedIn', p);
  });

  c.array(raw, 'findings', '', true).forEach((f, i) => {
    const p = `findings[${i}].`;
    c.oneOf(f, 'kind', p, FINDING_KINDS);
    c.str(f, 'message', p);
    c.str(f, 'file', p);
    c.line(f, 'line', p);
  });

  c.array(raw, 'glossary', '', true).forEach((g, i) => {
    c.str(g, 'term', `glossary[${i}].`);
    c.str(g, 'definition', `glossary[${i}].`);
  });

  // Cross references: a dangling id renders as a dead link, so it is an error.
  if (c.errors.length === 0) {
    const testIds = new Set(tests.map(t => t.id as string));
    const setupIds = new Set(setup.map(s => s.id as string));
    tests.forEach((t, i) => (t.setup as string[] | undefined)?.forEach((id) => {
      if (!setupIds.has(id)) { c.errors.push(`tests[${i}].setup: "${id}" is not a setup[].id`); }
    }));
    setup.forEach((s, i) => (s.usedIn as string[]).forEach((id) => {
      if (!testIds.has(id)) { c.errors.push(`setup[${i}].usedIn: "${id}" is not a tests[].id`); }
    }));
    if (testIds.size !== tests.length) { c.errors.push('tests: ids must be unique'); }
  }

  return c.errors.length > 0 ? { errors: c.errors } : { model: raw as unknown as BreakdownModel, errors: [] };
}

// ============================================================================
// MANIFEST PREFILL + FINDINGS
// ============================================================================

/**
 * Overwrites every ATC call's method, file and line with kata-manifest.json's
 * values, so the page never shows a fact the AI could have invented. Returns
 * a copy; the input is untouched.
 */
function applyManifest(model: BreakdownModel, manifest: ManifestLike): { model: BreakdownModel, warnings: string[] } {
  const index = new Map<string, { method: string, file: string, line: number }>();
  for (const components of Object.values(manifest.components)) {
    for (const component of components) {
      for (const atc of component.atcs) {
        index.set(atc.id, { method: atc.method, file: component.relativePath, line: atc.line });
      }
    }
  }

  const warnings: string[] = [];
  const out: BreakdownModel = structuredClone(model);
  for (const test of out.tests) {
    for (const atc of test.atcs) {
      const known = index.get(atc.id);
      atc.inManifest = known !== undefined;
      if (!known) { continue; }
      for (const field of ['method', 'file', 'line'] as const) {
        if (atc[field] !== undefined && atc[field] !== known[field]) {
          warnings.push(`${atc.id}: JSON says ${field} "${atc[field]}", kata-manifest.json says "${known[field]}"; the manifest wins.`);
        }
      }
      atc.method = known.method;
      atc.file = known.file;
      atc.line = known.line;
    }
  }
  return { model: out, warnings };
}

function assertionsOf(test: TestEntry): Assertion[] {
  return [...(test.assertions ?? []), ...test.atcs.flatMap(a => a.assertions)];
}

/**
 * The read-only lint: mechanical findings derived from the model, merged with
 * the ones only a reader could spot (supplied in the JSON). Deduplicated by
 * kind + location, sorted by location.
 */
function computeFindings(model: BreakdownModel): Finding[] {
  const found: Finding[] = [...(model.findings ?? [])];
  const seenAtc = new Set<string>();
  for (const test of model.tests) {
    if (assertionsOf(test).length === 0) {
      found.push({ kind: 'test-no-assertions', message: test.name, file: test.file, line: test.line });
    }
    for (const atc of test.atcs) {
      for (const a of atc.assertions) {
        if (a.soft) { found.push({ kind: 'soft-assertion', message: a.text, file: a.file, line: a.line }); }
      }
      if (seenAtc.has(atc.id)) { continue; }
      seenAtc.add(atc.id);
      const where = { file: atc.file ?? test.file, line: atc.line ?? test.line };
      const label = atc.method ? `${atc.id} ${atc.method}` : atc.id;
      if (!atc.assertions.some(a => a.polarity === 'negative')) {
        found.push({ kind: 'atc-no-negative', message: label, ...where });
      }
      if (atc.inManifest === false) {
        found.push({ kind: 'atc-not-in-manifest', message: label, ...where });
      }
    }
    for (const a of test.assertions ?? []) {
      if (a.soft) { found.push({ kind: 'soft-assertion', message: a.text, file: a.file, line: a.line }); }
    }
  }

  const unique = new Map<string, Finding>();
  for (const f of found) {
    const key = `${f.kind}|${f.file}|${f.line}`;
    if (!unique.has(key)) { unique.set(key, f); }
  }
  return [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
}

// ============================================================================
// TRACEABILITY (disk only)
// ============================================================================

const COVERABLE_PREFIXES = new Set(['STORY', 'BUG', 'IMPROVEMENT', 'TECHSTORY', 'TECHDEBT', 'DEFECT']);

/**
 * Maps each ATC id to the synced Test `.md` of the same key and the coverable
 * folder that holds it, by walking `.context/PBI/`. Null when the cache does
 * not exist on this machine (a cold clone or someone without Jira access).
 */
function loadTraceability(pbiRoot: string, atcIds: string[]): TraceRow[] | null {
  if (!existsSync(pbiRoot)) { return null; }
  const wanted = new Set(atcIds);
  const hits = new Map<string, TraceRow>();

  const walk = (dir: string, coverable: { key: string, path: string } | null): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        const parsed = parseSyncedName(name);
        const next = parsed && COVERABLE_PREFIXES.has(parsed.prefix)
          ? { key: parsed.key, path: relativePosix(pbiRoot, full) }
          : coverable;
        walk(full, next);
        continue;
      }
      if (!name.endsWith('.md')) { continue; }
      const parsed = parseSyncedName(name.slice(0, -3));
      if (!parsed || parsed.prefix !== 'TEST' || !wanted.has(parsed.key) || hits.has(parsed.key)) { continue; }
      const tc = parseTestMarkdown(readFileSync(full, 'utf8'), name);
      hits.set(parsed.key, {
        atc: parsed.key,
        testKey: tc.key,
        testSummary: tc.summary,
        testStatus: tc.status,
        url: tc.url,
        coverable: coverable?.key ?? null,
        coverablePath: coverable?.path ?? null,
      });
    }
  };
  walk(pbiRoot, null);

  return [...wanted].sort().map(id => hits.get(id) ?? {
    atc: id,
    testKey: null,
    testSummary: null,
    testStatus: null,
    url: null,
    coverable: null,
    coverablePath: null,
  });
}

// ============================================================================
// PREPARE
// ============================================================================

interface PreparedPage {
  model: BreakdownModel
  labels: Labels
  findings: Finding[]
  traceability: TraceRow[] | null
  glossary: GlossaryEntry[]
  /** Prefix that turns a repo-relative path into a link relative to the page. */
  linkBase: string
  stats: { tests: number, atcs: number, positive: number, negative: number, fixtures: Fixture[] }
}

function preparePage(
  model: BreakdownModel,
  ctx: { manifest: ManifestLike | null, traceability: TraceRow[] | null, linkBase: string },
): { page: PreparedPage, warnings: string[] } {
  const warnings: string[] = [];
  let working = model;
  if (ctx.manifest) {
    const applied = applyManifest(model, ctx.manifest);
    working = applied.model;
    warnings.push(...applied.warnings);
  }
  const { labels, missing } = resolveLabels(working.lang, working.labels);
  if (missing.length > 0) {
    warnings.push(`lang "${working.lang}" is not built in and labels omit ${missing.length} key(s); those fall back to English: ${missing.join(', ')}`);
  }

  const lang = working.lang.split('-')[0].toLowerCase();
  const glossary = new Map<string, GlossaryEntry>();
  for (const g of GLOSSARY[lang] ?? GLOSSARY.en) { glossary.set(g.term.toLowerCase(), g); }
  for (const g of working.glossary ?? []) { glossary.set(g.term.toLowerCase(), g); }

  const all = working.tests.flatMap(assertionsOf);
  const page: PreparedPage = {
    model: working,
    labels,
    findings: computeFindings(working),
    traceability: ctx.traceability,
    glossary: [...glossary.values()],
    linkBase: ctx.linkBase,
    stats: {
      tests: working.tests.length,
      atcs: new Set(working.tests.flatMap(t => t.atcs.map(a => a.id))).size,
      positive: all.filter(a => a.polarity === 'positive').length,
      negative: all.filter(a => a.polarity === 'negative').length,
      fixtures: FIXTURES.filter(f => working.tests.some(t => t.fixture === f)),
    },
  };
  return { page, warnings };
}

// ============================================================================
// RENDER HELPERS
// ============================================================================

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loc(page: PreparedPage, file: string, line: number): string {
  // A plain relative link: a file:// page cannot jump to a line, so the line
  // is carried in the visible text, where a reviewer reads it.
  return `<a class="loc" href="${escapeHtml(page.linkBase + file)}">${escapeHtml(file)}:${line}</a>`;
}

function glossaryDef(page: PreparedPage, term: string): string {
  return page.glossary.find(g => g.term.toLowerCase() === term.toLowerCase())?.definition ?? '';
}

function term(page: PreparedPage, lookup: string, shown: string = lookup): string {
  const def = glossaryDef(page, lookup);
  return def ? `<abbr title="${escapeHtml(def)}">${escapeHtml(shown)}</abbr>` : escapeHtml(shown);
}

function fixtureBadge(page: PreparedPage, fixture: Fixture): string {
  return `<abbr class="badge fx-${fixture}" title="${escapeHtml(glossaryDef(page, 'Fixture'))}">{ ${fixture} }</abbr>`;
}

function kindLabel(labels: Labels, kind: FindingKind): string {
  const map: Record<FindingKind, string> = {
    'atc-no-negative': labels.kindAtcNoNegative,
    'test-no-assertions': labels.kindTestNoAssertions,
    'soft-assertion': labels.kindSoftAssertion,
    'hard-wait': labels.kindHardWait,
    'atc-not-in-manifest': labels.kindAtcNotInManifest,
    'other': labels.kindOther,
  };
  return map[kind];
}

function section(id: typeof SECTION_IDS[number], heading: string, body: string): string {
  return `<section id="${id}"><h2>${escapeHtml(heading)}</h2>${body}</section>`;
}

// ============================================================================
// SECTIONS
// ============================================================================

function renderOverview(page: PreparedPage): string {
  const { model, labels, stats } = page;
  const tile = (n: number | string, label: string) => `<div class="tile"><strong>${escapeHtml(String(n))}</strong><span>${escapeHtml(label)}</span></div>`;
  const meta = [
    `<dt>${escapeHtml(labels.scope)}</dt><dd><code>${escapeHtml(model.scope.input)}</code></dd>`,
    model.commit ? `<dt>${escapeHtml(labels.commit)}</dt><dd><code>${escapeHtml(model.commit)}</code></dd>` : '',
    model.generatedAt ? `<dt>${escapeHtml(labels.generated)}</dt><dd>${escapeHtml(model.generatedAt)}</dd>` : '',
    `<dt>${escapeHtml(labels.sources)}</dt><dd>${model.sourceFiles.map(f => `<a class="loc" href="${escapeHtml(page.linkBase + f)}">${escapeHtml(f)}</a>`).join('<br>')}</dd>`,
  ].join('');
  return section('overview', labels.overview, `
    <div class="tiles">
      ${tile(stats.tests, labels.statTests)}
      ${tile(stats.atcs, labels.statAtcs)}
      ${tile(stats.positive + stats.negative, labels.statAssertions)}
      ${tile(stats.positive, labels.statPositive)}
      ${tile(stats.negative, labels.statNegative)}
      ${tile(stats.fixtures.map(f => `{ ${f} }`).join(' ') || '-', labels.statFixtures)}
    </div>
    <dl class="meta">${meta}</dl>`);
}

function renderSummary(page: PreparedPage): string {
  const { labels } = page;
  const rows = page.model.tests.map(t => `
    <tr>
      <td><a href="#test-${escapeHtml(t.id)}">${escapeHtml(t.name)}</a></td>
      <td>${t.atcs.map(a => `<code>${escapeHtml(a.id)}</code>`).join(' ') || '-'}</td>
      <td class="num">${assertionsOf(t).length}</td>
      <td>${escapeHtml(t.value)}</td>
    </tr>`).join('');
  return section('summary', labels.summary, `
    <input id="filter" type="search" placeholder="${escapeHtml(labels.filterPlaceholder)}" aria-label="${escapeHtml(labels.filterPlaceholder)}">
    <div class="scroll-x"><table id="summary-table">
      <thead><tr><th>${escapeHtml(labels.colTest)}</th><th>${escapeHtml(labels.colAtcs)}</th><th>${escapeHtml(labels.colAssertions)}</th><th>${escapeHtml(labels.colValue)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`);
}

function renderFlow(page: PreparedPage): string {
  const { labels, model } = page;
  const setupName = new Map((model.setup ?? []).map(s => [s.id, s.name]));
  const lanes = model.tests.map((t) => {
    const all = assertionsOf(t);
    const pos = all.filter(a => a.polarity === 'positive').length;
    const neg = all.length - pos;
    const setup = (t.setup ?? []).map(id => setupName.get(id) ?? id);
    const chain = t.atcs.length > 0
      ? `<ol class="chain">${t.atcs.map(a => `<li>${term(page, 'ATC')} <code>${escapeHtml(a.id)}</code> ${escapeHtml(a.method ?? '')}</li>`).join('')}</ol>`
      : `<span class="node node-muted">${escapeHtml(labels.testLevel)}</span>`;
    return `
      <div class="lane">
        <div class="lane-title"><a href="#test-${escapeHtml(t.id)}">${escapeHtml(t.name)}</a></div>
        <div class="lane-nodes">
          ${setup.length > 0 ? `<span class="node node-setup">${escapeHtml(labels.setup)}: ${escapeHtml(setup.join(', '))}</span><span class="arrow" aria-hidden="true">&rarr;</span>` : ''}
          ${fixtureBadge(page, t.fixture)}
          <span class="arrow" aria-hidden="true">&rarr;</span>
          ${chain}
          <span class="arrow" aria-hidden="true">&rarr;</span>
          <span class="node node-assert"><span class="${pos > 0 ? 'pos' : 'muted'}">${pos} ${escapeHtml(labels.statPositive)}</span> · <span class="${neg > 0 ? 'neg' : 'muted'}">${neg} ${escapeHtml(labels.statNegative)}</span></span>
        </div>
      </div>`;
  }).join('');
  return section('flow', labels.flow, lanes);
}

function renderAssertionList(page: PreparedPage, assertions: Assertion[], polarity: Polarity): string {
  const list = assertions.filter(a => a.polarity === polarity);
  if (list.length === 0) { return ''; }
  const heading = polarity === 'positive' ? page.labels.positive : page.labels.negative;
  const items = list.map(a => `
    <li>${escapeHtml(a.text)}
      ${a.expected !== undefined ? `<span class="expected">${escapeHtml(page.labels.expected)}: <code>${escapeHtml(a.expected)}</code></span>` : ''}
      ${a.soft ? `<span class="chip chip-warn">${escapeHtml(page.labels.soft)}</span>` : ''}
      ${loc(page, a.file, a.line)}</li>`).join('');
  return `<div class="asserts asserts-${polarity}"><h5>${term(page, polarity === 'positive' ? 'Positive assertion' : 'Negative assertion', heading)}</h5><ul>${items}</ul></div>`;
}

function renderCard(page: PreparedPage, t: TestEntry): string {
  const { labels } = page;
  const atcs = t.atcs.map((a, i) => `
    <div class="atc">
      <h4>${i + 1}. ${term(page, 'ATC')} <code>${escapeHtml(a.id)}</code> <code>${escapeHtml(a.method ?? '?')}(${escapeHtml(a.params ?? '')})</code>
        ${a.file && a.line ? loc(page, a.file, a.line) : ''}
        ${a.inManifest === false ? `<span class="chip chip-bad">${escapeHtml(labels.notInManifest)}</span>` : ''}</h4>
      ${a.actions.length > 0 ? `<h5>${escapeHtml(labels.actions)}</h5><ol>${a.actions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>` : ''}
      ${renderAssertionList(page, a.assertions, 'positive')}
      ${renderAssertionList(page, a.assertions, 'negative')}
    </div>`).join('');
  const bodyAsserts = t.assertions && t.assertions.length > 0
    ? `<div class="atc"><h4>${escapeHtml(labels.testLevel)}</h4>${renderAssertionList(page, t.assertions, 'positive')}${renderAssertionList(page, t.assertions, 'negative')}</div>`
    : '';
  const data = t.data
    ? `<h5>${escapeHtml(labels.data)}</h5><div class="scroll-x"><table>
        <thead><tr>${t.data.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}<th>${escapeHtml(labels.partition)}</th><th>${escapeHtml(labels.technique)}</th></tr></thead>
        <tbody>${t.data.rows.map(r => `<tr>${r.values.map(v => `<td><code>${escapeHtml(v)}</code></td>`).join('')}<td>${escapeHtml(r.partition)}</td><td>${r.technique ? `<span class="chip">${escapeHtml(r.technique)}</span>` : '-'}</td></tr>`).join('')}</tbody>
      </table></div>`
    : '';
  return `
    <article class="card" id="test-${escapeHtml(t.id)}">
      <h3>${escapeHtml(t.name)}</h3>
      <p class="card-meta">${fixtureBadge(page, t.fixture)} ${loc(page, t.file, t.line)}</p>
      <p class="value">${escapeHtml(t.value)}</p>
      ${t.guard ? `<p class="guard"><strong>${escapeHtml(labels.guard)}:</strong> ${escapeHtml(t.guard)}</p>` : ''}
      ${atcs}
      ${bodyAsserts}
      ${data}
    </article>`;
}

/** Cards grouped by file; a large scope starts collapsed so the summary stays first. */
function renderCards(page: PreparedPage): string {
  const byFile = new Map<string, TestEntry[]>();
  for (const t of page.model.tests) { byFile.set(t.file, [...(byFile.get(t.file) ?? []), t]); }
  const open = page.model.tests.length <= 10 ? ' open' : '';
  const groups = [...byFile.entries()].map(([file, tests]) => `
    <details class="file-group"${open}>
      <summary><code>${escapeHtml(file)}</code> <span class="muted">(${tests.length} ${escapeHtml(page.labels.statTests)})</span></summary>
      ${tests.map(t => renderCard(page, t)).join('')}
    </details>`).join('');
  return section('cards', page.labels.cards, groups);
}

function renderDataflow(page: PreparedPage): string {
  const { labels, model } = page;
  const setup = model.setup ?? [];
  if (setup.length === 0) { return section('dataflow', labels.dataflow, `<p class="empty">${escapeHtml(labels.noSetup)}</p>`); }
  const nameOf = new Map(model.tests.map(t => [t.id, t.name]));
  const rows = setup.flatMap(s => (s.produces.length > 0 ? s.produces : [{ variable: '-', value: '-' }]).map(p => `
    <tr>
      <td class="nowrap"><code>${escapeHtml(p.variable)}</code></td>
      <td><code>${escapeHtml(p.value)}</code></td>
      <td>${escapeHtml(s.name)}<br><span class="muted">${escapeHtml(s.description)}</span><br>${loc(page, s.file, s.line)}</td>
      <td>${s.usedIn.map(id => `<a href="#test-${escapeHtml(id)}">${escapeHtml(nameOf.get(id) ?? id)}</a>`).join('<br>')}</td>
    </tr>`)).join('');
  return section('dataflow', labels.dataflow, `<div class="scroll-x"><table>
    <thead><tr><th>${escapeHtml(labels.variable)}</th><th>${escapeHtml(labels.valueCol)}</th><th>${escapeHtml(labels.source)}</th><th>${escapeHtml(labels.usedIn)}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`);
}

function renderFindings(page: PreparedPage): string {
  const { labels, findings } = page;
  if (findings.length === 0) { return section('findings', labels.findings, `<p class="empty">${escapeHtml(labels.noFindings)}</p>`); }
  const rows = findings.map(f => `
    <tr class="finding finding-${f.kind}">
      <td>${escapeHtml(kindLabel(labels, f.kind))}</td>
      <td>${escapeHtml(f.message)}</td>
      <td>${loc(page, f.file, f.line)}</td>
    </tr>`).join('');
  return section('findings', labels.findings, `<p class="muted">${escapeHtml(labels.findingsNote)}</p><div class="scroll-x"><table>
    <thead><tr><th>${escapeHtml(labels.kind)}</th><th>${escapeHtml(labels.detail)}</th><th>${escapeHtml(labels.location)}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`);
}

function renderTraceability(page: PreparedPage): string {
  const { labels, traceability } = page;
  if (!traceability) { return section('traceability', labels.traceability, `<p class="empty">${escapeHtml(labels.noTrace)}</p>`); }
  const rows = traceability.map((r) => {
    const test = r.testKey
      ? `${r.url ? `<a href="${escapeHtml(r.url)}">${escapeHtml(r.testKey)}</a>` : escapeHtml(r.testKey)} ${escapeHtml(r.testSummary ?? '')}`
      : `<span class="muted">${escapeHtml(labels.notInCache)}</span>`;
    return `
      <tr>
        <td><code>${escapeHtml(r.atc)}</code></td>
        <td>${test}</td>
        <td>${escapeHtml(r.testStatus ?? '-')}</td>
        <td>${r.coverable ? `<code>${escapeHtml(r.coverable)}</code>` : '-'}</td>
      </tr>`;
  }).join('');
  return section('traceability', labels.traceability, `<div class="scroll-x"><table>
    <thead><tr><th>ATC</th><th>${escapeHtml(labels.colJiraTest)}</th><th>${escapeHtml(labels.colStatus)}</th><th>${escapeHtml(labels.colCoverable)}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`);
}

function renderGlossary(page: PreparedPage): string {
  const items = page.glossary.map(g => `<dt>${escapeHtml(g.term)}</dt><dd>${escapeHtml(g.definition)}</dd>`).join('');
  return section('glossary', page.labels.glossary, `<dl class="glossary">${items}</dl>`);
}

// ============================================================================
// MARKDOWN EXPORT (keeps the PR-description use the chat output served)
// ============================================================================

function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdown(page: PreparedPage): string {
  const { labels, model } = page;
  const lines = [
    `## ${labels.pageTitle}: ${model.scope.title}`,
    '',
    `${labels.scope}: \`${model.scope.input}\`${model.commit ? ` · ${labels.commit}: \`${model.commit}\`` : ''}`,
    '',
    `| ${labels.colTest} | ${labels.colAtcs} | ${labels.colAssertions} | ${labels.colValue} |`,
    '|---|---|---|---|',
    ...model.tests.map(t => `| ${mdCell(t.name)} | ${t.atcs.map(a => a.id).join(', ') || '-'} | ${assertionsOf(t).length} | ${mdCell(t.value)} |`),
  ];
  if (page.findings.length > 0) {
    lines.push('', `### ${labels.findings}`, '');
    for (const f of page.findings) {
      lines.push(`- ${kindLabel(labels, f.kind)}: ${f.message} (\`${f.file}:${f.line}\`)`);
    }
  }
  return `${lines.join('\n')}\n`;
}

// ============================================================================
// PAGE
// ============================================================================

function tokenBlock(tokens: Record<string, string>): string {
  return Object.entries(tokens).map(([k, v]) => `${k}: ${v};`).join(' ');
}

const STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
  code, .loc { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: .86em; }
  code { background: var(--code-bg); color: var(--code-text); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
  a { color: var(--accent); }
  a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  header.top { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; justify-content: space-between; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  h2 { font-size: 1.15rem; margin: 36px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  h3 { font-size: 1.02rem; margin: 0 0 6px; }
  h4 { font-size: .95rem; margin: 14px 0 6px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
  h5 { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 10px 0 4px; }
  abbr[title] { text-decoration: underline dotted; cursor: help; }
  .muted, .empty { color: var(--muted); }
  .empty { font-style: italic; }
  nav.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: .9rem; margin: 12px 0 0; }
  button { font: inherit; background: var(--accent); color: var(--bg); border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
  .tile { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
  .tile strong { display: block; font-size: 1.35rem; }
  .tile span { color: var(--muted); font-size: .85rem; }
  dl.meta { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 14px 0 0; font-size: .9rem; }
  dl.meta dt { color: var(--muted); }
  dl.meta dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  input[type=search] { width: 100%; max-width: 360px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-strong);
    background: var(--surface); color: var(--text); font: inherit; margin-bottom: 8px; }
  .scroll-x { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; }
  /* On a phone a table scrolls inside its own box instead of crushing its columns. */
  .scroll-x > table { min-width: 560px; }
  th, td { text-align: left; vertical-align: top; padding: 7px 9px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; white-space: nowrap; }
  td.nowrap code { overflow-wrap: normal; white-space: nowrap; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .lane { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin: 10px 0; background: var(--bg-soft); }
  .lane-title { font-weight: 600; margin-bottom: 8px; }
  .lane-nodes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .node { border-radius: 8px; padding: 4px 10px; background: var(--surface-2); border: 1px solid var(--border); font-size: .88rem; }
  .node-setup { background: var(--yellow-soft); }
  .node-muted { color: var(--muted); }
  .node-assert .pos { color: var(--green); font-weight: 600; }
  .node-assert .neg { color: var(--red); font-weight: 600; }
  .arrow { color: var(--muted); }
  ol.chain { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; counter-reset: step; }
  ol.chain li { counter-increment: step; border-radius: 8px; padding: 4px 10px; background: var(--accent-soft); border: 1px solid var(--border); font-size: .88rem; }
  ol.chain li::before { content: counter(step) ". "; font-weight: 700; color: var(--accent); }
  .badge { display: inline-block; border-radius: 999px; padding: 2px 10px; font: 600 .82rem ui-monospace, Menlo, monospace; text-decoration: none; }
  .fx-api { background: var(--accent-soft); color: var(--accent); }
  .fx-ui { background: var(--green-soft); color: var(--green); }
  .fx-test { background: var(--yellow-soft); color: var(--yellow); }
  details.file-group { border: 1px solid var(--border); border-radius: 10px; margin: 10px 0; padding: 8px 12px; background: var(--surface); }
  details.file-group > summary { cursor: pointer; font-weight: 600; }
  .card { border-top: 1px solid var(--border); padding: 14px 0 6px; }
  .card:first-of-type { border-top: 0; }
  .card-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 6px; }
  .value { margin: 0 0 6px; color: var(--text-2); }
  .guard { background: var(--yellow-soft); border-radius: 8px; padding: 6px 10px; }
  .atc { border-left: 3px solid var(--accent-soft); padding-left: 12px; margin: 8px 0; }
  .asserts ul { margin: 0; padding-left: 20px; }
  .asserts li { margin: 3px 0; }
  .asserts-positive li::marker { color: var(--green); }
  .asserts-negative li::marker { color: var(--red); }
  .expected { color: var(--muted); margin: 0 4px; }
  .loc { margin-left: 4px; overflow-wrap: anywhere; }
  .chip { display: inline-block; border-radius: 999px; padding: 0 8px; font-size: .75rem; font-weight: 600; background: var(--surface-2); }
  .chip-warn { background: var(--yellow-soft); color: var(--yellow); }
  .chip-bad { background: var(--red-soft); color: var(--red); }
  .finding td:first-child { font-weight: 600; }
  dl.glossary dt { font-weight: 700; margin-top: 10px; }
  dl.glossary dd { margin: 2px 0 0; color: var(--text-2); }
  @media print {
    body { background: #fff; color: #000; }
    button, #filter, nav.toc { display: none; }
    .lane, details.file-group, .tile { break-inside: avoid; }
    a { color: inherit; }
  }
`;

const SCRIPT = `
(function () {
  var filter = document.getElementById('filter');
  if (filter) {
    filter.addEventListener('input', function () {
      var q = filter.value.toLowerCase();
      document.querySelectorAll('#summary-table tbody tr').forEach(function (row) {
        row.hidden = q !== '' && row.textContent.toLowerCase().indexOf(q) === -1;
      });
    });
  }
  var button = document.getElementById('copy-md');
  var source = document.getElementById('md-source');
  if (button && source) {
    button.addEventListener('click', function () {
      var done = function () { button.textContent = button.getAttribute('data-copied'); };
      var fallback = function () {
        source.hidden = false; source.select(); document.execCommand('copy'); source.hidden = true; done();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(source.value).then(done, fallback);
      } else { fallback(); }
    });
  }
  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('details').forEach(function (d) { d.open = true; });
  });
})();
`;

function renderHtml(page: PreparedPage): string {
  const { labels, model } = page;
  const toc = SECTION_IDS.map(id => `<a href="#${id}">${escapeHtml(labels[id])}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="${escapeHtml(model.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="tests-explain-render schemaVersion ${SCHEMA_VERSION}">
<title>${escapeHtml(labels.pageTitle)}: ${escapeHtml(model.scope.title)}</title>
<style>
  :root { ${tokenBlock(THEME_TOKENS.light)} color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { ${tokenBlock(THEME_TOKENS.dark)} color-scheme: dark; } }
${STYLE}
</style>
</head>
<body>
<main>
<header class="top">
  <div>
    <h1>${escapeHtml(labels.pageTitle)}: ${escapeHtml(model.scope.title)}</h1>
    <nav class="toc">${toc}</nav>
  </div>
  <button id="copy-md" type="button" data-copied="${escapeHtml(labels.copied)}">${escapeHtml(labels.copyMarkdown)}</button>
</header>
<textarea id="md-source" hidden readonly>${escapeHtml(renderMarkdown(page))}</textarea>
${renderOverview(page)}
${renderSummary(page)}
${renderFlow(page)}
${renderCards(page)}
${renderDataflow(page)}
${renderFindings(page)}
${renderTraceability(page)}
${renderGlossary(page)}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

// ============================================================================
// MAIN
// ============================================================================

const USAGE = `
Usage: bun scripts/tests-explain-render.ts <breakdown.json> [options]

Validates a test-breakdown JSON (written by /test-automation explain) and
writes a self-contained HTML page next to it. No network calls.

Options:
  --out <path>   Output file (default: the JSON path with .html)
  --open         Open the page with the system opener after writing it
  help           Show this message
`;

function openInSystem(path: string): void {
  let command: string;
  let args: string[];
  if (process.platform === 'darwin') { command = 'open'; args = [path]; }
  // `start` is a cmd.exe builtin; the empty "" is the window title argument.
  else if (process.platform === 'win32') { command = 'cmd'; args = ['/c', 'start', '', path]; }
  else { command = 'xdg-open'; args = [path]; }
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', e => console.warn(`Could not open the page (${command}): ${e.message}. Open ${path} by hand.`));
    child.unref();
  }
  catch (e) {
    console.warn(`Could not open the page (${command}): ${(e as Error).message}. Open ${path} by hand.`);
  }
}

function gitShortSha(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  }
  catch {
    return undefined;
  }
}

/** Positional `<breakdown.json>` plus flags; the value after `--out` is never taken for the JSON path. */
function parseArgs(args: string[]): { jsonPath?: string, out?: string, open: boolean, help: boolean } {
  const outFlag = args.indexOf('--out');
  const out = outFlag === -1 ? undefined : args[outFlag + 1];
  const jsonPath = args.find((a, i) => !a.startsWith('--') && a !== 'help' && (outFlag === -1 || i !== outFlag + 1));
  return { jsonPath, out, open: args.includes('--open'), help: args.length === 0 || args.includes('help') || args.includes('--help') };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const { jsonPath, out: outArg } = args;
  if (!jsonPath) {
    console.error('Missing <breakdown.json>.');
    process.exit(1);
  }
  if (!existsSync(jsonPath)) {
    console.error(`Not found: ${jsonPath}`);
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  }
  catch (e) {
    console.error(`${jsonPath} is not valid JSON: ${(e as Error).message}`);
    process.exit(1);
  }
  const { model, errors } = validateModel(raw);
  if (!model) {
    console.error(`${jsonPath} does not match the breakdown contract:`);
    for (const err of errors) { console.error(`  - ${err}`); }
    process.exit(1);
  }

  const cwd = process.cwd();
  const manifestPath = join(cwd, 'kata-manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestLike : null;
  if (!manifest) { console.warn('kata-manifest.json not found: ATC facts are shown as written, unverified.'); }

  model.commit ??= gitShortSha();
  model.generatedAt ??= new Date().toISOString().replace('T', ' ').slice(0, 16);

  const outPath = resolve(outArg ?? `${jsonPath.replace(/\.json$/i, '')}.html`);
  const atcIds = [...new Set(model.tests.flatMap(t => t.atcs.map(a => a.id)))];
  const traceability = loadTraceability(join(cwd, '.context', 'PBI'), atcIds);
  const rel = relativePosix(dirname(outPath), cwd);
  const linkBase = rel === '' ? '' : `${rel}/`;

  const { page, warnings } = preparePage(model, { manifest, traceability, linkBase });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderHtml(page));

  for (const w of warnings) { console.warn(`warn: ${w}`); }
  console.log(`Wrote ${relativePosix(cwd, outPath)}`);
  console.log(`${page.stats.tests} tests · ${page.stats.atcs} ATCs · ${page.stats.positive + page.stats.negative} assertions · ${page.findings.length} findings`);
  if (args.open) { openInSystem(outPath); }
}

export {
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
};

export type { Assertion, AtcCall, BreakdownModel, Finding, Labels, ManifestLike, PreparedPage, SetupEntry, TestEntry, TraceRow };

// Guarded so the pure helpers above can be imported by tests without running
// the renderer. Same convention as scripts/tests-map.ts.
if (import.meta.main) {
  main();
}
