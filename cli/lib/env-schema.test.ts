/**
 * @fileoverview Tests for the varlock env schema generator.
 *
 * Three things must stay true: the generator is deterministic and reads the
 * manifest's schema hints the way `VarSchemaHints` documents; free text can
 * never leak a decorator into the schema; and the committed pair actually
 * loads through the pinned varlock (the layout's one undocumented reliance,
 * see the header of `./env-schema.ts`). The last one shells out to `bunx
 * varlock`, so it needs `bun install` to have run.
 */

import type { VarSpec } from './variables-manifest.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  CORE_SCHEMA_FILE,
  generateCoreSchema,
  loadSchemaPairThroughVarlock,
  placeholderEnv,
  placeholderFor,
  PROJECT_SCHEMA_FILE,
  projectSchemaTemplate,
  RUNTIME_KNOBS,
  schemaRequiredDecorator,
  seedProjectSchema,
  writeCoreSchema,
} from './env-schema.ts';
import { envFileVars, VAR_MANIFEST } from './variables-manifest.ts';

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..');

function spec(overrides: Partial<VarSpec> & { name: string }): VarSpec {
  return {
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'somewhere',
    note: 'a note',
    ...overrides,
  };
}

describe('schemaRequiredDecorator', () => {
  test('required: true -> @required', () => {
    expect(schemaRequiredDecorator(spec({ name: 'A', required: true }))).toBe('@required');
  });
  test('ifEnv on TEST_ENV -> forEnv', () => {
    expect(schemaRequiredDecorator(spec({ name: 'A', required: { ifEnv: 'TEST_ENV=staging' } }))).toBe('@required=forEnv(staging)');
  });
  test('ifEnv on another key has no env-spec equivalent -> optional', () => {
    expect(schemaRequiredDecorator(spec({ name: 'A', required: { ifEnv: 'AUTO_SYNC=true' } }))).toBeNull();
  });
  test('schema.required overrides the installer requiredness', () => {
    expect(schemaRequiredDecorator(spec({ name: 'A', required: true, critical: true, schema: { required: false } }))).toBeNull();
    expect(schemaRequiredDecorator(spec({ name: 'A', required: false, schema: { required: { ifEnv: 'TEST_ENV=local' } } }))).toBe('@required=forEnv(local)');
  });
});

describe('generateCoreSchema', () => {
  test('is deterministic, LF-only, ends with one newline', () => {
    const a = generateCoreSchema();
    const b = generateCoreSchema();
    expect(a).toBe(b);
    expect(a.includes('\r')).toBe(false);
    expect(a.endsWith('\n')).toBe(true);
    expect(a.endsWith('\n\n')).toBe(false);
  });

  test('declares every env-file manifest var and every runtime knob exactly once, never ATLASSIAN_URL', () => {
    const text = generateCoreSchema();
    const declared = text.split('\n').filter(l => /^[A-Z][A-Z0-9_]*=/.test(l)).map(l => l.slice(0, l.indexOf('=')));
    for (const s of envFileVars()) { expect(declared.filter(k => k === s.name)).toHaveLength(1); }
    for (const k of RUNTIME_KNOBS) { expect(declared.filter(x => x === k.name)).toHaveLength(1); }
    expect(declared).not.toContain('ATLASSIAN_URL');
    expect(declared).toHaveLength(envFileVars().length + RUNTIME_KNOBS.length);
  });

  test('maps the manifest to decorators the way VarSchemaHints documents', () => {
    const text = generateCoreSchema([
      spec({ name: 'TEST_ENV', required: true, schema: { type: 'enum(local, staging)', default: 'local' } }),
      spec({ name: 'LOCAL_USER_PASSWORD', secret: true, required: { ifEnv: 'TEST_ENV=local' } }),
      spec({ name: 'ATLASSIAN_API_TOKEN', secret: true, required: true, critical: true, schema: { required: false, docs: 'https://id.atlassian.com/x' } }),
      spec({ name: 'API_BASE_URL', schema: { type: 'url', example: 'http://localhost:3000' } }),
    ], []);
    expect(text).toContain('# @required @type=enum(local, staging)\nTEST_ENV=local\n');
    expect(text).toContain('# @required=forEnv(local) @sensitive\nLOCAL_USER_PASSWORD=\n');
    expect(text).toContain('# @sensitive @docs(https://id.atlassian.com/x)\nATLASSIAN_API_TOKEN=\n');
    expect(text).toContain('# @type=url @example="http://localhost:3000"\nAPI_BASE_URL=\n');
  });

  test('free text cannot smuggle a decorator or a line break into the schema', () => {
    const text = generateCoreSchema([
      spec({ name: 'A', note: 'contact ops@example.test\nsecond line', obtainHint: '@required is not a hint' }),
    ], [{ name: 'K', docs: 'knob @sensitive text' }]);
    expect(text).toContain('# contact ops(at)example.test second line\n# Obtain: (at)required is not a hint\nA=\n');
    expect(text).toContain('# knob (at)sensitive text\nK=\n');
  });

  test('rejects a knob that shadows a manifest var', () => {
    expect(() => generateCoreSchema([spec({ name: 'A' })], [{ name: 'A', docs: 'dup' }])).toThrow(/declare it once/);
  });

  test('the real manifest emits no unconditional @required outside TEST_ENV', () => {
    // The schema's contract is validateTestEnv's: TEST_ENV plus the active
    // env's test-user credentials. CI never holds an Atlassian token.
    const unconditional = envFileVars().filter(s => schemaRequiredDecorator(s) === '@required').map(s => s.name);
    expect(unconditional).toEqual(['TEST_ENV']);
  });
});

describe('placeholders', () => {
  test('placeholderFor satisfies each type without being real', () => {
    expect(placeholderFor('enum(local, staging)', false)).toBe('local');
    expect(placeholderFor('email', false)).toBe('placeholder@example.test');
    expect(placeholderFor('url', false)).toMatch(/^https:\/\//);
    expect(placeholderFor('port', false)).toBe('5432');
    expect(placeholderFor(undefined, true).length).toBeGreaterThan(20);
  });
  test('placeholderEnv covers exactly what is required under the env', () => {
    const local = placeholderEnv('local');
    expect(Object.keys(local).sort()).toEqual(['LOCAL_USER_EMAIL', 'LOCAL_USER_PASSWORD', 'TEST_ENV']);
    const staging = placeholderEnv('staging');
    expect(Object.keys(staging).sort()).toEqual(['STAGING_USER_EMAIL', 'STAGING_USER_PASSWORD', 'TEST_ENV']);
  });
});

describe('files', () => {
  test('writeCoreSchema is idempotent and seedProjectSchema never overwrites', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-schema-test-'));
    try {
      expect(writeCoreSchema(dir)).toBe(true);
      expect(writeCoreSchema(dir)).toBe(false);
      expect(seedProjectSchema(dir)).toBe(true);
      fs.writeFileSync(path.join(dir, PROJECT_SCHEMA_FILE), '# mine\n', 'utf8');
      expect(seedProjectSchema(dir)).toBe(false);
      expect(fs.readFileSync(path.join(dir, PROJECT_SCHEMA_FILE), 'utf8')).toBe('# mine\n');
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the project template imports the core file and switches on TEST_ENV', () => {
    const t = projectSchemaTemplate();
    expect(t).toContain(`# @import(./${CORE_SCHEMA_FILE})`);
    expect(t).toContain('# @currentEnv=$TEST_ENV');
  });
});

describe('the committed pair loads through the pinned varlock', () => {
  test('the repo pair resolves every core item with .env.core.schema read as a schema source', () => {
    const result = loadSchemaPairThroughVarlock(REPO_ROOT, 'local');
    expect(result.reason).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.sources.some(s => s.type === 'schema' && s.label.endsWith(CORE_SCHEMA_FILE))).toBe(true);
    expect(result.resolvedKeys).toContain('TEST_ENV');
    expect(result.resolvedKeys).toContain('ATLASSIAN_API_TOKEN');
  });

  test('a missing required item fails the load instead of passing silently', () => {
    // Same pair, but the staging env, whose credentials the local placeholder
    // set does not carry: the gate must go red, not green.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-schema-neg-'));
    try {
      fs.copyFileSync(path.join(REPO_ROOT, CORE_SCHEMA_FILE), path.join(dir, CORE_SCHEMA_FILE));
      fs.copyFileSync(path.join(REPO_ROOT, PROJECT_SCHEMA_FILE), path.join(dir, PROJECT_SCHEMA_FILE));
      // A project file that forgot the import: the core items vanish.
      fs.writeFileSync(path.join(dir, PROJECT_SCHEMA_FILE), '# @currentEnv=$TEST_ENV\n# ---\nTEST_ENV=local\n', 'utf8');
      const noImport = loadSchemaPairThroughVarlock(dir, 'local');
      expect(noImport.ok).toBe(false);
      expect(noImport.reason).toMatch(/not loaded as a schema source|core items not in the resolved graph/);
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('VAR_MANIFEST and the placeholder set agree on what staging needs', () => {
    // Guard for the negative test above: if the manifest ever stops requiring
    // staging credentials, that test would pass for the wrong reason.
    expect(VAR_MANIFEST.some(s => s.name === 'STAGING_USER_PASSWORD' && schemaRequiredDecorator(s) === '@required=forEnv(staging)')).toBe(true);
  });
});
