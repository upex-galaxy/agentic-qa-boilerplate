import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { evalTargets, evaluateRouter, PRECISION_FLOOR, promptsPerLabel, readRouterEvalFixture, RECALL_FLOOR } from './router-eval.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'router-eval-'));
  roots.push(root);
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  write('AGENTS.md', ['<!-- router:start -->', '| When | Read | Was | Then |', '|---|---|---|---|', '| git | `agent-git.md` | - | - |', '<!-- router:end -->', ''].join('\n'));
  write('.agents/instructions/agent-git.md', '---\nid: git\ntitle: Git\nload_when: git\ntriggers: [\'\\bcommit\']\npaths: []\n---\n');
  return root;
}

describe('router eval (the scorer instructions:check runs)', () => {
  test('the real repo holds its targets, every label is routed, and the targets sit on or above the floors', () => {
    const fixture = readRouterEvalFixture(REPO_ROOT)!;
    const result = evaluateRouter(REPO_ROOT, fixture)!;
    expect(result.unknownLabels).toEqual([]);
    expect(result.recall).toBeGreaterThanOrEqual(result.targets.recall);
    expect(result.precision).toBeGreaterThanOrEqual(result.targets.precision);
    expect(fixture.targets?.recall ?? 0).toBeGreaterThanOrEqual(RECALL_FLOOR);
    expect(fixture.targets?.precision ?? 0).toBeGreaterThanOrEqual(PRECISION_FLOOR);
  });

  test('counts misses, false hits and unknown labels; a target under the floor is raised to it', () => {
    const root = fixtureRoot();
    const result = evaluateRouter(root, {
      targets: { recall: 0.5, precision: 0.1 },
      prompts: [
        { prompt: 'commit this', expect: ['git'] },
        { prompt: 'push it', expect: ['git'] },
        { prompt: 'commit and explain', expect: [] },
        { prompt: 'what now', expect: ['ghost'] },
      ],
    })!;
    expect([result.truePositives, result.falseNegatives, result.falsePositives]).toEqual([1, 2, 1]);
    expect(result.misses).toEqual(['push it -> missed git', 'what now -> missed ghost']);
    expect(result.unknownLabels).toEqual(['ghost']);
    expect(result.targets).toEqual({ recall: RECALL_FLOOR, precision: PRECISION_FLOOR });
    expect(evalTargets({ targets: { recall: 0.99 }, prompts: [] }).recall).toBe(0.99);
  });

  test('no router means no score; per-label counts each prompt once', () => {
    const root = mkdtempSync(join(tmpdir(), 'router-eval-empty-'));
    roots.push(root);
    expect(evaluateRouter(root, { prompts: [] })).toBeNull();
    expect(readRouterEvalFixture(root)).toBeNull();
    expect(promptsPerLabel({ prompts: [{ prompt: 'a', expect: ['git', 'git'] }, { prompt: 'b', expect: ['git'] }] }).get('git')).toBe(2);
  });
});
