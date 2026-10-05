/**
 * @fileoverview The doctor's pure env-var classifier (ADR-0005): which verdict
 * a variable gets from its scope, its feature gate and the machine's switches.
 * The exit-code policy hangs off it: only `missing-required` may block, and no
 * manifest entry reaches it today.
 */

import type { GateContext, VarSpec } from './lib/variables-manifest.ts';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { checkoutSetupActions, envVarVerdict, probeOpenApiSpec } from './doctor.ts';
import { VAR_MANIFEST, varsFor } from './lib/variables-manifest.ts';

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

const off: GateContext = { env: {}, atlassianHostSet: false };

describe('envVarVerdict', () => {
  test('a set value is set, whatever the scope', () => {
    expect(envVarVerdict(spec({ name: 'A', scope: 'project' }), true, off)).toBe('set');
    expect(envVarVerdict(spec({ name: 'A', scope: 'core', required: true }), true, off)).toBe('set');
  });

  test('a project or tooling var is never more than missing-optional', () => {
    expect(envVarVerdict(spec({ name: 'A', scope: 'project' }), false, off)).toBe('missing-optional');
    expect(envVarVerdict(spec({ name: 'A', scope: 'tooling', featureGate: 'portal-url' }), false, { env: { PORTAL_URL: 'https://x' } })).toBe('missing-optional');
  });

  test('a core var behind a gate is a warning only while the gate is on', () => {
    const atlassian = spec({ name: 'ATLASSIAN_API_TOKEN', scope: 'core', featureGate: 'atlassian-url', required: true });
    expect(envVarVerdict(atlassian, false, off)).toBe('missing-optional');
    expect(envVarVerdict(atlassian, false, { env: {}, atlassianHostSet: true })).toBe('missing-gated');
    const xray = spec({ name: 'XRAY_CLIENT_ID', scope: 'core', featureGate: 'tms-xray' });
    expect(envVarVerdict(xray, false, { env: { AUTO_SYNC: 'true', TMS_PROVIDER: 'jira' } })).toBe('missing-optional');
    expect(envVarVerdict(xray, false, { env: { AUTO_SYNC: 'true' } })).toBe('missing-gated');
  });

  test('only an ungated, required core var with no default can block', () => {
    expect(envVarVerdict(spec({ name: 'A', scope: 'core', required: true }), false, off)).toBe('missing-required');
    expect(envVarVerdict(spec({ name: 'A', scope: 'core', required: true, defaultValue: 'x' }), false, off)).toBe('missing-optional');
    expect(envVarVerdict(spec({ name: 'A', scope: 'core', required: false }), false, off)).toBe('missing-optional');
  });

  test('the real manifest has no var that could block the doctor, even with every switch on', () => {
    const allOn: GateContext = { env: { AUTO_SYNC: 'true', TMS_PROVIDER: 'xray', PORTAL_URL: 'https://x' }, atlassianHostSet: true };
    const blocking = varsFor('local').filter(s => envVarVerdict(s, false, allOn) === 'missing-required').map(s => s.name);
    expect(blocking).toEqual([]);
    // And the manifest as a whole declares every scope the doctor prints.
    expect(new Set(VAR_MANIFEST.map(s => s.scope))).toEqual(new Set(['core', 'tooling', 'project']));
  });
});

describe('probeOpenApiSpec', () => {
  const root = mkdtempSync(join(tmpdir(), 'doctor-openapi-'));
  mkdirSync(join(root, 'api'), { recursive: true });
  writeFileSync(join(root, 'api', 'openapi.json'), '{}');
  const answering = (status: number) => async () => new Response('{}', { status });
  const silent = async () => { throw new Error('ECONNREFUSED'); };

  test('says nothing when the variable is empty: the env row already covers it', async () => {
    expect(await probeOpenApiSpec(undefined, root, silent)).toBeNull();
    expect(await probeOpenApiSpec('  ', root, silent)).toBeNull();
  });

  test('a file path resolves against the repo root', async () => {
    expect(await probeOpenApiSpec('./api/openapi.json', root, silent)).toBeNull();
    const missing = await probeOpenApiSpec('./api/missing.json', root, silent);
    expect(missing?.target).toBe('bun run api:sync');
    expect(missing?.hint).toContain('./api/missing.json');
    expect(missing?.hint).not.toContain('API route');
  });

  test('a value that starts with / and is no file reads as the API route alone', async () => {
    const route = await probeOpenApiSpec('/api/openapi', root, silent);
    expect(route?.target).toBe('bun run api:sync');
    expect(route?.hint).toContain('/api/openapi');
    expect(route?.hint).toContain('looks like an API route');
    expect(route?.hint).toContain('origin of API_BASE_URL');
    expect(route?.hint).toContain('relative to the repo root');
    expect(await probeOpenApiSpec(join(root, 'api', 'openapi.json'), root, silent)).toBeNull();
  });

  test('a URL must answer 2xx, and the message names the host, never the full value', async () => {
    expect(await probeOpenApiSpec('https://api.example.test/openapi.json?token=x', root, answering(200))).toBeNull();
    const notFound = await probeOpenApiSpec('https://api.example.test/openapi.json?token=x', root, answering(404));
    expect(notFound?.hint).toContain('api.example.test that answered 404');
    expect(notFound?.hint).not.toContain('token=x');
    const down = await probeOpenApiSpec('http://127.0.0.1:9/openapi.json', root, silent);
    expect(down?.hint).toContain('127.0.0.1:9 that did not answer');
  });
});

describe('checkoutSetupActions', () => {
  const ready = { linked: false, envFile: true, deps: true, gitHooks: true };

  test('a ready checkout needs nothing', () => {
    expect(checkoutSetupActions(ready).actions).toEqual([]);
    expect(checkoutSetupActions({ ...ready, linked: true }).actions).toEqual([]);
  });

  test('an unprovisioned worktree gets ONE provision command, never the template copy', () => {
    const { actions, replaces } = checkoutSetupActions({ linked: true, envFile: false, deps: false, gitHooks: false });
    expect(actions.map(a => a.target)).toEqual(['bun run worktree:provision']);
    expect(actions[0].hint).toContain('.husky/_');
    // The generic `cp .env.example .env` and `bun run harness:env` are exactly what empties
    // the main checkout's env block from a worktree, so both are suppressed.
    expect(replaces).toEqual({ envFile: true, deps: true, harnessEnv: true });
  });

  test('a worktree with .env but no hooks keeps the harness:env advice', () => {
    const { actions, replaces } = checkoutSetupActions({ linked: true, envFile: true, deps: true, gitHooks: false });
    expect(actions.map(a => a.target)).toEqual(['bun run worktree:provision']);
    expect(replaces.harnessEnv).toBe(false);
  });

  test('a primary checkout with dependencies but no hook shims is told to reinstall', () => {
    const { actions } = checkoutSetupActions({ ...ready, gitHooks: false });
    expect(actions.map(a => a.target)).toEqual(['bun install']);
  });
});
