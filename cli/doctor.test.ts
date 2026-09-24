/**
 * @fileoverview The doctor's pure env-var classifier (ADR-0005): which verdict
 * a variable gets from its scope, its feature gate and the machine's switches.
 * The exit-code policy hangs off it: only `missing-required` may block, and no
 * manifest entry reaches it today.
 */

import type { GateContext, VarSpec } from './lib/variables-manifest.ts';
import { describe, expect, test } from 'bun:test';

import { envVarVerdict } from './doctor.ts';
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
