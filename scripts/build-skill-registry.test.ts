/**
 * Regression tests for `scripts/build-skill-registry.ts`, run against fixture
 * repos. The script resolves its skills directory from `process.cwd()`, so each
 * fixture is a temp dir holding nothing but `.agents/skills/<slug>/SKILL.md`
 * and the script is spawned with that dir as its working directory.
 *
 * What they guard: the LOW-CONFIDENCE marker on Strategy-B blocks. It is the
 * only signal a subagent gets that the rules it was handed were scraped rather
 * than authored, and it is easy to lose in a render refactor.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const BUILD_SCRIPT = resolve(import.meta.dir, 'build-skill-registry.ts');
const MARKER = '> ⚠ LOW-CONFIDENCE (extraction strategy B)';

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function write(root: string, relativePath: string, content: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

/** A temp repo carrying exactly one skill, whose body the caller supplies. */
function fixture(slug: string, body: string): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-registry-'));
  temporaryRoots.push(root);
  write(root, `.agents/skills/${slug}/SKILL.md`, [
    '---',
    `name: ${slug}`,
    `description: ${slug} fixture.`,
    '---',
    '',
    `# ${slug}`,
    '',
    body,
    '',
  ].join('\n'));
  return root;
}

function render(root: string): string {
  const result = Bun.spawnSync({
    cmd: ['bun', BUILD_SCRIPT, '--dry-run'],
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return `${result.stdout.toString()}${result.stderr.toString()}`;
}

describe('build-skill-registry low-confidence marker', () => {
  test('a skill with no Compact Rules section is stamped LOW-CONFIDENCE, ahead of its Purpose line', () => {
    const output = render(fixture('scraped-skill', [
      '## Dependencies',
      '',
      '- `agentic-qa-core/references/briefing-template.md` — read on dispatch.',
      '- `agentic-qa-core/references/dispatch-patterns.md` — pattern per phase.',
    ].join('\n')));

    expect(output).toContain(MARKER);
    expect(output).toContain('extraction strategy: B');
    const heading = output.indexOf('## Skill: scraped-skill');
    expect(output.indexOf(MARKER)).toBeGreaterThan(heading);
    expect(output.indexOf(MARKER)).toBeLessThan(output.indexOf('**Purpose**'));
  });

  test('the line fallback (a body with no bullets at all) is stamped too', () => {
    const output = render(fixture('prose-skill', [
      '## Overview',
      '',
      'This skill is documented as prose and ships no bullet list anywhere.',
    ].join('\n')));

    expect(output).toContain(MARKER);
    expect(output).toContain('extraction strategy: B');
  });

  test('a skill with an authored Compact Rules section is Strategy A and carries no marker', () => {
    const output = render(fixture('authored-skill', [
      '## Compact Rules',
      '',
      '- DO: read the plan before touching any file.',
      '- DO NOT: auto-fix a failing verification; stop and report.',
      '',
      '**Read full SKILL.md when**: the compact rules do not cover the scenario.',
    ].join('\n')));

    expect(output).not.toContain(MARKER);
    expect(output).toContain('extraction strategy: A');
  });
});
