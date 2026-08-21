import { describe, expect, test } from 'bun:test';
import { extractSuggestedEnvironment } from './project-config.ts';

describe('extractSuggestedEnvironment', () => {
  test('falls back to testing.default_env', () => {
    expect(extractSuggestedEnvironment({ testing: { default_env: 'staging' } })).toBe('staging');
  });

  test('prefers testing.active_env over default_env', () => {
    const parsed = { testing: { active_env: 'production', default_env: 'staging' } };

    expect(extractSuggestedEnvironment(parsed)).toBe('production');
  });

  test('skips a null active_env (the shipped template value)', () => {
    const parsed = { testing: { active_env: null, default_env: 'qa' } };

    expect(extractSuggestedEnvironment(parsed)).toBe('qa');
  });

  test('skips blank strings', () => {
    expect(extractSuggestedEnvironment({ testing: { default_env: '  ' } })).toBeNull();
  });

  test('trims a padded value', () => {
    expect(extractSuggestedEnvironment({ testing: { default_env: ' staging ' } })).toBe('staging');
  });

  test('returns null when both values are unset', () => {
    expect(extractSuggestedEnvironment({ testing: { active_env: null, default_env: null } })).toBeNull();
  });

  test('tolerates malformed documents', () => {
    expect(extractSuggestedEnvironment(null)).toBeNull();
    expect(extractSuggestedEnvironment({})).toBeNull();
    expect(extractSuggestedEnvironment({ testing: null })).toBeNull();
    expect(extractSuggestedEnvironment('garbage')).toBeNull();
  });
});
