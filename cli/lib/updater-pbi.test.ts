import { describe, expect, test } from 'bun:test';

import {
  buildPbiMigrationPrompt,
  buildPbiPromptFileContent,
  filterPbiTrackedPaths,
  isPbiAllowlisted,
} from './updater-pbi.ts';

describe('isPbiAllowlisted', () => {
  test('accepts exactly the committed tier', () => {
    expect(isPbiAllowlisted('.context/PBI/README.md')).toBe(true);
    expect(isPbiAllowlisted('.context/PBI/templates/story.md')).toBe(true);
    expect(isPbiAllowlisted('.context/PBI/templates/nested/deep.md')).toBe(true);
    expect(isPbiAllowlisted('.context/PBI/epics/EPIC-UPEX-1-auth/test-specs/ROADMAP.md')).toBe(true);
    expect(isPbiAllowlisted('.context/PBI/epics/EPIC-UPEX-1-auth/test-specs/TC-1/spec.md')).toBe(true);
  });

  test('rejects [SYNC] content that must not be tracked', () => {
    expect(isPbiAllowlisted('.context/PBI/epic-tree.md')).toBe(false);
    expect(isPbiAllowlisted('.context/PBI/epics/EPIC-UPEX-1-auth/epic.md')).toBe(false);
    expect(isPbiAllowlisted('.context/PBI/epics/EPIC-UPEX-1-auth/stories/STORY-UPEX-2-login/story.md')).toBe(false);
    expect(isPbiAllowlisted('.context/PBI/bugs/BUG-UPEX-3-x/bug.md')).toBe(false);
  });

  test('does not let lookalike names ride the allowlist', () => {
    // A README anywhere else in the tree is NOT the committed one.
    expect(isPbiAllowlisted('.context/PBI/epics/EPIC-UPEX-1-auth/README.md')).toBe(false);
    // test-specs must sit directly under epics/<epic>/ to be committed.
    expect(isPbiAllowlisted('.context/PBI/test-specs/spec.md')).toBe(false);
    expect(isPbiAllowlisted('.context/PBI/epics/test-specs/spec.md')).toBe(false);
  });

  test('normalizes backslashes', () => {
    expect(isPbiAllowlisted('.context\\PBI\\templates\\story.md')).toBe(true);
  });
});

describe('filterPbiTrackedPaths', () => {
  test('subtracts the allowlist and keeps the rest', () => {
    const tracked = [
      '.context/PBI/README.md',
      '.context/PBI/templates/story.md',
      '.context/PBI/epics/EPIC-UPEX-1-auth/test-specs/ROADMAP.md',
      '.context/PBI/epics/EPIC-UPEX-1-auth/epic.md',
      '.context/PBI/epics/EPIC-UPEX-1-auth/stories/STORY-UPEX-2-login/story.md',
    ];
    expect(filterPbiTrackedPaths(tracked)).toEqual([
      '.context/PBI/epics/EPIC-UPEX-1-auth/epic.md',
      '.context/PBI/epics/EPIC-UPEX-1-auth/stories/STORY-UPEX-2-login/story.md',
    ]);
  });

  test('a fully compliant repo yields an empty list (hook is a no-op)', () => {
    expect(filterPbiTrackedPaths([
      '.context/PBI/README.md',
      '.context/PBI/templates/story.md',
    ])).toEqual([]);
  });

  test('drops blank lines from git output', () => {
    expect(filterPbiTrackedPaths(['', '  ', '.context/PBI/epic-tree.md'])).toEqual([
      '.context/PBI/epic-tree.md',
    ]);
  });
});

describe('buildPbiMigrationPrompt', () => {
  const paths = [
    '.context/PBI/epic-tree.md',
    '.context/PBI/epics/EPIC-UPEX-1-auth/epic.md',
  ];
  const prompt = buildPbiMigrationPrompt(paths);

  test('carries the ordered commands: tag, rm --cached, commit, hydrate', () => {
    const tagAt = prompt.indexOf('git tag pbi-pre-cache-migration');
    const rmAt = prompt.indexOf('git rm -r --cached --');
    const commitAt = prompt.indexOf('git commit -m');
    // The WHY paragraph also mentions context:hydrate — look for the step-4
    // command, i.e. the occurrence AFTER the commit step.
    const hydrateAt = prompt.indexOf('bun run context:hydrate', commitAt);
    const diffAt = prompt.indexOf('git diff pbi-pre-cache-migration -- .context/PBI');
    expect(tagAt).toBeGreaterThan(-1);
    expect(rmAt).toBeGreaterThan(tagAt);
    expect(commitAt).toBeGreaterThan(rmAt);
    expect(hydrateAt).toBeGreaterThan(commitAt);
    expect(diffAt).toBeGreaterThan(hydrateAt);
  });

  test('untracks EXACTLY the out-of-allowlist paths, quoted', () => {
    expect(prompt).toContain('git rm -r --cached -- ".context/PBI/epic-tree.md" ".context/PBI/epics/EPIC-UPEX-1-auth/epic.md"');
  });

  test('names the exact allowlist and the AGENTS.md §9 rationale', () => {
    expect(prompt).toContain('.context/PBI/README.md');
    expect(prompt).toContain('.context/PBI/templates/**');
    expect(prompt).toContain('.context/PBI/epics/*/test-specs/**');
    expect(prompt).toContain('AGENTS.md §9');
  });

  test('demands the push-to-Jira pass BEFORE declaring the migration done', () => {
    expect(prompt).toContain('PUSH TO JIRA');
    expect(prompt).toContain('Only after step 5 is complete');
  });
});

describe('buildPbiPromptFileContent', () => {
  test('wraps the prompt in the auto-generated single-use markdown envelope', () => {
    const md = buildPbiPromptFileContent(['.context/PBI/epic-tree.md']);
    expect(md).toContain('AUTO-GENERATED, SINGLE-USE');
    expect(md).toContain('```text');
    expect(md).toContain('git tag pbi-pre-cache-migration');
  });
});
