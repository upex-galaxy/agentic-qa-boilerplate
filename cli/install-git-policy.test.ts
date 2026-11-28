import { describe, expect, test } from 'bun:test';

import { gitPolicySetupArgs, parseGitPolicyQuestions } from './install.ts';

describe('installer git policy step: plan and preflight only', () => {
  test('a non-interactive run asks nothing and passes no answer', () => {
    expect(gitPolicySetupArgs(null)).toEqual(['scripts/git-policy.ts', 'setup', '--plan-only']);
  });

  test('answers from the installer write the yaml keys and still stop at the plan', () => {
    const args = gitPolicySetupArgs({ strategy: 'main-integration', push: 'forbidden', merge: 'auto' });
    expect(args).toEqual(['scripts/git-policy.ts', 'setup', '--plan-only', '--strategy', 'main-integration', '--push', 'forbidden', '--merge', 'auto', '--write-policy']);
    expect(args).not.toContain('--yes');
    expect(args).not.toContain('--allow-loosening');
  });

  test('questions are read only when they have the expected shape', () => {
    const q = { id: 'strategy', title: 't', default: 'solo-main', choices: [{ value: 'solo-main', label: 'l', day: 'd' }] };
    expect(parseGitPolicyQuestions(JSON.stringify([q, { ...q, id: 'push' }, { ...q, id: 'merge' }]))).toHaveLength(3);
    expect(parseGitPolicyQuestions(JSON.stringify([q]))).toBeNull();
    expect(parseGitPolicyQuestions(JSON.stringify([q, q, { ...q, choices: [] }]))).toBeNull();
    expect(parseGitPolicyQuestions('not json')).toBeNull();
  });
});
