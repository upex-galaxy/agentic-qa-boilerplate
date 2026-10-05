/**
 * @fileoverview Tests for the varlock env schema generator.
 *
 * Three things must stay true: the generator is deterministic and reads the
 * manifest's schema hints the way `VarSchemaHints` documents; free text can
 * never leak a decorator into the schema; and the committed pair actually
 * loads through the pinned varlock (the layout's one undocumented reliance,
 * see the header of `./env-schema.ts`). The last one shells out to `bunx
 * varlock`, so it needs `bun install` to have run. The sensitivity lint is
 * static and never runs varlock: every secret-looking key in a loaded schema
 * must be `@sensitive`, or `varlock load --agent` prints its value in clear.
 */

import type { VarSpec } from './variables-manifest.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  checkSchemaSensitivity,
  CORE_SCHEMA_FILE,
  generateCoreSchema,
  isSecretLookingName,
  lintSchemaSensitivity,
  loadSchemaPairThroughVarlock,
  neutralizeRetiredKeys,
  parseSchemaForSensitivity,
  placeholderEnv,
  placeholderFor,
  PROJECT_SCHEMA_FILE,
  projectSchemaTemplate,
  removeRetiredEnvLines,
  RETIRED_KEYS,
  retiredEnvKeysIn,
  RUNTIME_KNOBS,
  schemaFilesIn,
  schemaRequiredDecorator,
  SECRET_NAME_PATTERNS,
  seedProjectSchema,
  writeCoreSchema,
} from './env-schema.ts';
import { envFileVars, VAR_MANIFEST } from './variables-manifest.ts';

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..');

function spec(overrides: Partial<VarSpec> & { name: string }): VarSpec {
  return {
    destinations: ['local'],
    secret: false,
    scope: 'core',
    usedBy: 'a consumer',
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
  test('a non-core item is never required, whatever its fields say (ADR-0005 second lock)', () => {
    expect(schemaRequiredDecorator(spec({ name: 'A', scope: 'project', required: true }))).toBeNull();
    expect(schemaRequiredDecorator(spec({ name: 'A', scope: 'tooling', schema: { required: { ifEnv: 'TEST_ENV=local' } } }))).toBeNull();
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

  test('declares every env-file manifest var and every runtime knob exactly once, never ATLASSIAN_URL nor a retired key', () => {
    const text = generateCoreSchema();
    const declared = text.split('\n').filter(l => /^[A-Z][A-Z0-9_]*=/.test(l)).map(l => l.slice(0, l.indexOf('=')));
    for (const s of envFileVars()) { expect(declared.filter(k => k === s.name)).toHaveLength(1); }
    for (const k of RUNTIME_KNOBS) { expect(declared.filter(x => x === k.name)).toHaveLength(1); }
    for (const k of RETIRED_KEYS) { expect(declared).not.toContain(k.name); }
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

  test('groups items under one banner per scope, core first, and names the consumer', () => {
    const text = generateCoreSchema([
      spec({ name: 'P_ONE', scope: 'project', usedBy: 'the app login' }),
      spec({ name: 'C_ONE', scope: 'core', usedBy: 'the runner', featureGate: 'auto-sync' }),
      spec({ name: 'T_ONE', scope: 'tooling', usedBy: 'a notifier' }),
    ], []);
    const at = (needle: string): number => text.indexOf(needle);
    expect(at('FRAMEWORK (scope: core)')).toBeGreaterThan(-1);
    expect(at('FRAMEWORK (scope: core)')).toBeLessThan(at('C_ONE='));
    expect(at('C_ONE=')).toBeLessThan(at('TOOLING (scope: tooling'));
    expect(at('T_ONE=')).toBeLessThan(at('PROJECT-UNDER-TEST (scope: project'));
    expect(at('PROJECT-UNDER-TEST (scope: project')).toBeLessThan(at('P_ONE='));
    expect(text).toContain('# Used by: the runner (only when the auto-sync switch is on)\n');
    expect(text).toContain('# Used by: the app login\n');
  });

  test('free text cannot smuggle a decorator or a line break into the schema', () => {
    const text = generateCoreSchema([
      spec({ name: 'A', note: 'contact ops@example.test\nsecond line', obtainHint: '@required is not a hint' }),
    ], [{ name: 'K', docs: 'knob @sensitive text' }]);
    expect(text).toContain('# contact ops(at)example.test second line\n# Used by: a consumer\n# Obtain: (at)required is not a hint\nA=\n');
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

describe('retired keys in .env', () => {
  const OLD_ENV = [
    '# a comment that names TAVILY_API_KEY=',
    'TEST_ENV=local',
    'TAVILY_API_KEY=',
    'export POSTMAN_API_KEY=pm-value',
    '# RESEND_API_KEY=commented-out',
    'ATLASSIAN_EMAIL=me(at)example.com',
    'TAVILY_API_KEY=duplicate',
    '',
  ].join('\n');

  test('retiredEnvKeysIn names the active assignments only, in RETIRED_KEYS order, never a value', () => {
    expect(retiredEnvKeysIn(OLD_ENV)).toEqual(['TAVILY_API_KEY', 'POSTMAN_API_KEY']);
    expect(retiredEnvKeysIn('TEST_ENV=local\n')).toEqual([]);
  });

  test('removeRetiredEnvLines drops every active retired line and keeps the rest byte for byte', () => {
    const { text, removed } = removeRetiredEnvLines(OLD_ENV);
    expect(removed).toEqual(['TAVILY_API_KEY', 'POSTMAN_API_KEY']);
    expect(text).toBe([
      '# a comment that names TAVILY_API_KEY=',
      'TEST_ENV=local',
      '# RESEND_API_KEY=commented-out',
      'ATLASSIAN_EMAIL=me(at)example.com',
      '',
    ].join('\n'));
    expect(removeRetiredEnvLines('A=1\r\nAPI_TOKEN=x\r\nB=2').text).toBe('A=1\r\nB=2');
    expect(removeRetiredEnvLines(text).removed).toEqual([]);
  });

  test('neutralizeRetiredKeys sets a constant placeholder and never touches other keys', () => {
    const input: Record<string, string | undefined> = { PATH: '/bin', TAVILY_API_KEY: '' };
    const env = neutralizeRetiredKeys(input, ['TAVILY_API_KEY', 'API_TOKEN']);
    expect(env).toEqual({ PATH: '/bin', TAVILY_API_KEY: 'retired', API_TOKEN: 'retired' });
    expect(input.TAVILY_API_KEY).toBe('');
  });

  test('through the pinned varlock: an empty retired key fails the load, and both remedies pass it', () => {
    // The measurement this design rests on. If varlock ever stops failing an
    // undeclared empty key, the cleanup is still right; if a process value
    // stops winning over the .env line, the doctor's neutralization breaks.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-schema-retired-'));
    try {
      fs.copyFileSync(path.join(REPO_ROOT, CORE_SCHEMA_FILE), path.join(dir, CORE_SCHEMA_FILE));
      fs.copyFileSync(path.join(REPO_ROOT, PROJECT_SCHEMA_FILE), path.join(dir, PROJECT_SCHEMA_FILE));
      const scrubbed: NodeJS.ProcessEnv = { ...process.env };
      for (const s of VAR_MANIFEST) { delete scrubbed[s.name]; }
      for (const k of RUNTIME_KNOBS) { delete scrubbed[k.name]; }
      for (const k of RETIRED_KEYS) { delete scrubbed[k.name]; }
      const load = (env: NodeJS.ProcessEnv): number | null => spawnSync('bunx', ['varlock', 'load', '--agent', '--path', `${dir}${path.sep}`], {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).status;

      const old = 'TEST_ENV=local\nTAVILY_API_KEY=\n';
      fs.writeFileSync(path.join(dir, '.env'), old, 'utf8');
      expect(load(scrubbed)).not.toBe(0);
      expect(load(neutralizeRetiredKeys(scrubbed, retiredEnvKeysIn(old)))).toBe(0);
      fs.writeFileSync(path.join(dir, '.env'), removeRetiredEnvLines(old).text, 'utf8');
      expect(load(scrubbed)).toBe(0);
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
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
    // A synthetic manifest with a conditional core item: the helper still
    // understands forEnv, even though the real manifest no longer emits one.
    const manifest = [
      spec({ name: 'TEST_ENV', required: true }),
      spec({ name: 'LOCAL_ONLY', required: { ifEnv: 'TEST_ENV=local' } }),
      spec({ name: 'STAGING_ONLY', required: { ifEnv: 'TEST_ENV=staging' } }),
      spec({ name: 'OPTIONAL' }),
    ];
    expect(Object.keys(placeholderEnv('local', manifest)).sort()).toEqual(['LOCAL_ONLY', 'TEST_ENV']);
    expect(Object.keys(placeholderEnv('staging', manifest)).sort()).toEqual(['STAGING_ONLY', 'TEST_ENV']);
  });

  test('the real manifest needs nothing but TEST_ENV under any env', () => {
    // The framework requires only what it owns (ADR-0005): a project's
    // test-user pair is an optional typed example, never a required item.
    expect(Object.keys(placeholderEnv('local'))).toEqual(['TEST_ENV']);
    expect(Object.keys(placeholderEnv('staging'))).toEqual(['TEST_ENV']);
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

  test('the real manifest carries no conditional @required (project credentials are optional)', () => {
    // ADR-0005: a test-user pair is the project's, so the synced schema never
    // marks it required for an environment. A missing one fails by name at the
    // point of use (config.testUser), not at varlock load.
    const conditional = VAR_MANIFEST.filter(s => schemaRequiredDecorator(s)?.startsWith('@required=forEnv') === true).map(s => s.name);
    expect(conditional).toEqual([]);
  });
});

describe('sensitivity lint', () => {
  const lint = (...texts: string[]) => lintSchemaSensitivity(texts.map((text, i) => ({ file: `f${i}.schema`, text })));
  const HEADER_OFF = '# @defaultSensitive=false\n# ---\n\n';

  test('secret names match as whole segments, case-insensitive', () => {
    for (const name of ['GH_TOKEN', 'SLACK_MCP_XOXP_TOKEN', 'slack_xoxb', 'DB_PASSWORD', 'DB_PASSWD', 'XRAY_CLIENT_SECRET', 'PORTAL_API_KEY', 'AWS_ACCESS_KEY', 'SSH_PRIVATE_KEY', 'GITHUB_PAT', 'GOOGLE_CREDENTIALS', 'OP_SERVICE_ACCOUNT_TOKEN']) {
      expect(isSecretLookingName(name)).toBe(true);
    }
    for (const name of ['MAX_TOKENS', 'TOKENIZER', 'JIRA_PROJECT_KEY', 'PATH', 'PASSWORDLESS_MODE', 'XRAY_CLIENT_ID', 'TEST_ENV']) {
      expect(isSecretLookingName(name)).toBe(false);
    }
    expect(SECRET_NAME_PATTERNS).toContain('XOXP');
  });

  test('the incident: a scratch schema declaring a token without @sensitive fails, naming key and line', () => {
    const v = lint('SLACK_MCP_REACTION_TOOL=\nSLACK_MCP_XOXP_TOKEN=\n');
    expect(v).toEqual([{ key: 'SLACK_MCP_XOXP_TOKEN', file: 'f0.schema', line: 2, reason: 'secret-looking name without @sensitive' }]);
  });

  test('bare @sensitive, @sensitive=true, @sensitive={...} and a post-value comment all pass', () => {
    expect(lint(`${HEADER_OFF}# @sensitive @docs(https://x.test)\nA_TOKEN=\n# @sensitive=true\nB_TOKEN=\n# @sensitive={preventLeaks=false}\nC_TOKEN=\nD_TOKEN= # @sensitive\nE_TOKEN="a # b" # @sensitive\n`)).toEqual([]);
  });

  test('a decorator must sit in its own comment block, directly above the item', () => {
    const v = lint(`${HEADER_OFF}# @sensitive\n\nA_TOKEN=\n# set @sensitive later\nB_TOKEN=\n`);
    expect(v.map(x => x.key)).toEqual(['A_TOKEN', 'B_TOKEN']);
  });

  test('a commented-out assignment is not an item', () => {
    expect(lint(`${HEADER_OFF}# A_TOKEN=op(op://vault/A_TOKEN/password)\n`)).toEqual([]);
  });

  test('an explicit opt-out anywhere fails, even when another file marks the key @sensitive', () => {
    const v = lint(`${HEADER_OFF}# @sensitive\nA_TOKEN=\n`, `${HEADER_OFF}# @public\nA_TOKEN=\n`);
    expect(v).toEqual([{ key: 'A_TOKEN', file: 'f1.schema', line: 5, reason: 'secret-looking name marked non-sensitive (@public / @sensitive=false)' }]);
    expect(lint(`${HEADER_OFF}# @sensitive=false\nA_TOKEN=\n`)[0].reason).toMatch(/non-sensitive/);
  });

  test('a re-declaration without a decorator keeps the @sensitive of another file', () => {
    expect(lint(`${HEADER_OFF}# @sensitive\nA_TOKEN=\n`, `${HEADER_OFF}# @required\nA_TOKEN=\n`)).toEqual([]);
  });

  test('a non-literal @sensitive fails', () => {
    expect(lint(`${HEADER_OFF}# @sensitive=forEnv(production)\nA_TOKEN=\n`)[0].reason).toMatch(/literal/);
  });

  test('@defaultSensitive=true covers a bare item only when every declaring file says so', () => {
    const overlay = '# @defaultRequired=false\n# @defaultSensitive=true\n# ---\n\nA_TOKEN=op(op://v/A_TOKEN/password)\n';
    expect(lint(overlay)).toEqual([]);
    expect(lint(overlay, `${HEADER_OFF}A_TOKEN=\n`).map(x => x.key)).toEqual(['A_TOKEN']);
    expect(lint('# @defaultSensitive=inferFromPrefix(PUBLIC_)\n# ---\nA_TOKEN=\n')).toEqual([]);
  });

  test('parse reads root @import targets from the header only', () => {
    const parsed = parseSchemaForSensitivity('# @import(./.env.core.schema)\n# @import(./.env.x.schema, allowMissing=true)\n# ---\n# @import(./not-a-root.schema)\nA=\n');
    expect(parsed.imports).toEqual(['./.env.core.schema', './.env.x.schema']);
    expect(parsed.items.map(i => i.key)).toEqual(['A']);
  });

  test('the committed schemas pass, and a violation in an imported file is found', () => {
    const repo = checkSchemaSensitivity(REPO_ROOT);
    expect(repo.violations).toEqual([]);
    expect(repo.files).toEqual(expect.arrayContaining([PROJECT_SCHEMA_FILE, CORE_SCHEMA_FILE]));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-schema-sens-'));
    try {
      fs.writeFileSync(path.join(dir, PROJECT_SCHEMA_FILE), '# @import(./.env.extra.schema)\n# @defaultSensitive=false\n# ---\n', 'utf8');
      fs.writeFileSync(path.join(dir, '.env.extra.schema'), '# @defaultSensitive=false\n# ---\nNPM_TOKEN=\n', 'utf8');
      expect(schemaFilesIn(dir)).toEqual([PROJECT_SCHEMA_FILE, '.env.extra.schema']);
      const check = checkSchemaSensitivity(dir);
      expect(check.ok).toBe(false);
      expect(check.violations).toEqual([{ key: 'NPM_TOKEN', file: '.env.extra.schema', line: 3, reason: 'secret-looking name without @sensitive' }]);
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('every secret-looking manifest var is secret: true, so the generated core passes', () => {
    const unmarked = VAR_MANIFEST.filter(s => isSecretLookingName(s.name) && !s.secret).map(s => s.name);
    expect(unmarked).toEqual([]);
  });
});
