/**
 * Regression tests for `scripts/build-skill-registry.ts`, run against fixture
 * repos. The script resolves its skills directory from `process.cwd()`, so each
 * fixture is a temp dir holding nothing but `.agents/skills/<slug>/SKILL.md`
 * and the script is spawned with that dir as its working directory.
 *
 * What they guard: the LOW-CONFIDENCE marker on Strategy-B blocks. It is the
 * only signal a subagent gets that the rules it was handed were scraped rather
 * than authored, and it is easy to lose in a render refactor. And the
 * no-truncation contract on an authored `## Compact Rules` section: a cap
 * there once dropped the tail rules of three skills from every briefing.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

function addSkill(root: string, slug: string, body: string): void {
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
}

/** A temp repo carrying exactly one skill, whose body the caller supplies. */
function fixture(slug: string, body: string): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-registry-'));
  temporaryRoots.push(root);
  addSkill(root, slug, body);
  return root;
}

function git(root: string, ...args: string[]): void {
  const result = Bun.spawnSync({ cmd: ['git', ...args], cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) { throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`); }
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

describe('build-skill-registry authored rules are never truncated', () => {
  const rules = Array.from({ length: 20 }, (_, index) => `- DO: authored rule number ${index + 1}.`);

  test('every bullet of a Compact Rules section longer than 15 reaches the registry', () => {
    const output = render(fixture('rich-skill', ['## Compact Rules', '', ...rules].join('\n')));

    expect(output).toContain('extraction strategy: A');
    expect(output).toContain('- DO: authored rule number 16.');
    expect(output).toContain('- DO: authored rule number 20.');
    expect(output).not.toContain('(truncated');
  });

  test('the blind Strategy B scrape stays capped at 15 and says so', () => {
    const output = render(fixture('long-scrape', ['## Notes', '', ...rules].join('\n')));

    expect(output).toContain('extraction strategy: B');
    expect(output).toContain('- DO: authored rule number 15.');
    expect(output).not.toContain('- DO: authored rule number 16.');
    expect(output).toContain('(truncated');
  });
});

describe('build-skill-registry indexes only what a commit can carry', () => {
  const rules = ['## Compact Rules', '', '- DO: see [the guide](references/guide.md).'].join('\n');

  /** A git repo with a committed skill and a T3 community skill its .gitignore excludes. */
  function repoWithInstalledT3(): string {
    const root = fixture('committed-skill', rules);
    addSkill(root, 'community-skill', rules);
    write(root, '.gitignore', '.agents/skills/community-skill/\n');
    git(root, 'init', '-q');
    return root;
  }

  test('a skill folder git ignores stays out of the registry', () => {
    const output = render(repoWithInstalledT3());

    expect(output).toContain('## Skill: committed-skill');
    expect(output).not.toContain('community-skill');
    expect(output).toContain('Skills indexed: 1');
  });

  test('a skill symlinked into the skills folder does not end the check for the others', () => {
    const root = repoWithInstalledT3();
    const external = mkdtempSync(join(tmpdir(), 'skill-registry-ext-'));
    temporaryRoots.push(external);
    addSkill(external, 'linked-skill', rules);
    symlinkSync(join(external, '.agents/skills/linked-skill'), join(root, '.agents/skills/linked-skill'));

    const output = render(root);

    expect(output).toContain('## Skill: linked-skill');
    expect(output).not.toContain('community-skill');
  });

  test('a committed skill under an ignore pattern is still indexed', () => {
    const root = repoWithInstalledT3();
    git(root, 'add', '-f', '.agents/skills/community-skill/SKILL.md');

    expect(render(root)).toContain('## Skill: community-skill');
  });

  test('outside a git work tree every skill on disk is indexed', () => {
    const root = fixture('committed-skill', rules);
    addSkill(root, 'community-skill', rules);
    write(root, '.gitignore', '.agents/skills/community-skill/\n');

    const output = render(root);

    expect(output).toContain('## Skill: community-skill');
    expect(output).toContain('Skills indexed: 2');
  });
});
