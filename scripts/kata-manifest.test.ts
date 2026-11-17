import { describe, expect, test } from 'bun:test';
import { findUnregisteredComponents } from './kata-manifest.ts';

function component(name: string) {
  return { name, file: `${name}.ts`, relativePath: `tests/components/${name}.ts`, atcs: [] };
}

function manifestOf(api: string[], ui: string[]) {
  return {
    version: '1.0' as const,
    generatedAt: '',
    components: { api: api.map(component), ui: ui.map(component) },
    steps: [],
    summary: { totalComponents: 0, totalATCs: 0, apiComponents: 0, uiComponents: 0, stepsModules: 0 },
  };
}

const API = `import { AuthApi } from '@api/AuthApi';
export class ApiFixture {
  readonly auth: AuthApi;
  constructor() { this.auth = new AuthApi(); }
}`;
const UI = `import { LoginPage } from '@ui/LoginPage';
export class UiFixture {}`;

describe('findUnregisteredComponents', () => {
  test('a component instantiated and typed in its fixture is registered', () => {
    expect(findUnregisteredComponents(manifestOf(['AuthApi'], []), { api: API, ui: UI })).toEqual([]);
  });

  test('a component only imported, or absent, is reported', () => {
    expect(findUnregisteredComponents(manifestOf(['OrderApi'], ['LoginPage']), { api: API, ui: UI }))
      .toEqual(['OrderApi', 'LoginPage']);
  });

  test('a component is checked against its own fixture only', () => {
    expect(findUnregisteredComponents(manifestOf([], ['AuthApi']), { api: API, ui: UI })).toEqual(['AuthApi']);
  });

  test('ApiBase and UiBase are never reported', () => {
    expect(findUnregisteredComponents(manifestOf(['ApiBase'], ['UiBase']), { api: '', ui: '' })).toEqual([]);
  });
});
