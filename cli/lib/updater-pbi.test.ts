import type { PbiCacheFact } from './updater-pbi.ts';
import type { ReportSink } from './updater-types.ts';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  buildPbiMigrationPrompt,
  buildPbiPromptFileContent,
  filterPbiTrackedPaths,
  isPbiAllowlisted,
  makePbiCacheMigrationHook,
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

describe('the afterApply hook', () => {
  // Live finding (Bunkai, 8.2 port): 370 tracked paths dumped inline dwarfed
  // the eight parity rows. The hook now writes the recipe and reports one
  // fact; the terminal gets nothing from it.
  function git(root: string, args: string[]): void {
    const res = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (res.status !== 0) { throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`); }
  }
  function write(root: string, rel: string, body: string): void {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  const lines: string[] = [];
  const sink = { step: (m: string) => lines.push(m), warn: (m: string) => lines.push(m), error: (m: string) => lines.push(m) } as unknown as ReportSink;
  const summary = { applied: [], skipped: [], failed: [], newHeadSha: '', componentsAdvanced: [], componentsHeldBack: [] };

  test('reports the count and the recipe path, writes the recipe, prints nothing; a dry-run writes nothing', async () => {
    // realpath: macOS hands out /var/..., and process.cwd() reports /private/var/...
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pbi hook ')));
    const previousCwd = process.cwd();
    try {
      git(root, ['init', '--quiet', '--initial-branch=main']);
      git(root, ['config', 'user.email', 'test@example.com']);
      git(root, ['config', 'user.name', 'test']);
      write(root, '.context/PBI/README.md', 'tiers\n');
      write(root, '.context/PBI/epic-tree.md', 'synced\n');
      write(root, '.context/PBI/epics/EPIC-X-1/epic.md', 'synced\n');
      write(root, '.agents/prompts/pbi-cache-migration-prompt.md', 'stale 8.2 dump\n');
      git(root, ['add', '-A']);
      git(root, ['commit', '--quiet', '-m', 'legacy']);
      process.chdir(root);
      const out = join(root, '.agents', 'prompts', 'pbi-cache-migration.md');
      const facts: PbiCacheFact[] = [];

      await makePbiCacheMigrationHook({ promptOutPath: out, dryRun: true }, sink, f => facts.push(f))(summary);
      expect(facts).toEqual([{ tracked: 2, recipePath: '.agents/prompts/pbi-cache-migration.md' }]);
      expect(existsSync(out)).toBe(false);

      await makePbiCacheMigrationHook({ promptOutPath: out }, sink, f => facts.push(f))(summary);
      expect(facts).toHaveLength(2);
      const recipe = readFileSync(out, 'utf8');
      expect(recipe).toContain('git rm -r --cached -- ".context/PBI/epic-tree.md" ".context/PBI/epics/EPIC-X-1/epic.md"');
      expect(recipe).not.toContain('.context/PBI/README.md"');
      // The 8.2 file name is gone, so a stale dump never lingers next to the recipe.
      expect(existsSync(join(root, '.agents/prompts/pbi-cache-migration-prompt.md'))).toBe(false);
      expect(lines).toEqual([]);

      // A compliant repo: no fact, no file.
      git(root, ['rm', '-r', '--cached', '--quiet', '.context/PBI/epic-tree.md', '.context/PBI/epics']);
      git(root, ['commit', '--quiet', '-m', 'untrack']);
      rmSync(out);
      await makePbiCacheMigrationHook({ promptOutPath: out }, sink, f => facts.push(f))(summary);
      expect(facts).toHaveLength(2);
      expect(existsSync(out)).toBe(false);
    }
    finally {
      process.chdir(previousCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
