/**
 * Regression tests for `scripts/lint-skills.ts`, run against fixture repos
 * through the `LINT_SKILLS_ROOT` override. Each fixture is the smallest tree
 * the linter accepts: a `cli/install.ts` with the community tier lists, an
 * `AGENTS.md` with a §5 registry table, the workflow skills the anti-leak and
 * session checks insist on, and one community skill COMMITTED as a real
 * directory inside `.agents/skills/` (what downstream projects do with their
 * `bunx skills add` output).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const LINT_SCRIPT = resolve(import.meta.dir, 'lint-skills.ts');
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

/** The five workflow skills plus the gateway: every one is session-retrofitted. */
const T1_SKILLS = [
  'framework-development',
  'shift-left-testing',
  'sprint-testing',
  'test-automation',
  'regression-testing',
  'test-documentation',
];

/** Verbatim banner prefix the session contract demands (the dash is U+2014). */
const SESSION_BANNER = '> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch \u2014 main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion).';

function t1Skill(slug: string, body = ''): string {
  const categories = slug === 'framework-development' ? 'complementary_categories: [framework-evolution]\n' : '';
  return [
    '---',
    `name: ${slug}`,
    `description: ${slug} fixture.`,
    `${categories}---`,
    '',
    `# ${slug}`,
    '',
    SESSION_BANNER,
    '',
    '## Phase 0',
    '',
    'Resume from `.session/` when a plan exists.',
    '',
    body,
    '',
  ].join('\n');
}

/** A path the STALE-PATH check rejects when it appears inside a T1 body. */
const STALE_CITATION = 'See `scripts/does-not-exist.ts` for the shape.';

/**
 * A repo with the six T1 skills, `resend-cli` listed under PROJECT_LEVEL_SKILLS
 * (T3) AND committed as a real directory in `.agents/skills/`, its body citing
 * a path that does not exist. `listCommunityInAgentsMd` decides whether the
 * AGENTS.md §5 table carries the `resend-cli` row.
 */
function fixture(options: { listCommunityInAgentsMd: boolean, staleT1Body?: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), 'lint-skills-'));
  temporaryRoots.push(root);

  write(root, 'cli/install.ts', [
    'const PROJECT_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [',
    '  { package: \'https://github.com/resend/resend-skills\', skill: \'resend-cli\' },',
    '];',
    'const USER_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [];',
    '',
  ].join('\n'));

  const rows = T1_SKILLS.map(slug => `| \`${slug}\` | \`/${slug}\` | fixture |`);
  if (options.listCommunityInAgentsMd) {
    rows.push('| `resend-cli` | `/resend-cli` | community, installed at PROJECT level |');
  }
  write(root, 'AGENTS.md', [
    '# AGENTS.md',
    '',
    '## 5. SKILLS + COMMANDS + MCPs REGISTRY',
    '',
    '| Skill | Trigger | Purpose |',
    '|---|---|---|',
    ...rows,
    '',
    '## 6. TOOL RESOLUTION',
    '',
    'Text.',
    '',
  ].join('\n'));

  for (const slug of T1_SKILLS) {
    write(root, `.agents/skills/${slug}/SKILL.md`, t1Skill(slug, options.staleT1Body && slug === 'sprint-testing' ? STALE_CITATION : ''));
  }

  // The committed community skill: a real directory, not a symlink, with a
  // vendor body the project does not author.
  write(root, '.agents/skills/resend-cli/SKILL.md', [
    '---',
    'name: resend-cli',
    'description: Community email CLI skill.',
    '---',
    '',
    '# resend-cli',
    '',
    STALE_CITATION,
    '',
  ].join('\n'));
  return root;
}

function runLint(root: string): { exitCode: number, output: string } {
  const result = Bun.spawnSync({
    cmd: ['bun', LINT_SCRIPT],
    env: { ...process.env, LINT_SKILLS_ROOT: root },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: result.exitCode, output: `${result.stdout.toString()}${result.stderr.toString()}` };
}

describe('lint-skills tier classification', () => {
  test('a community skill committed in the store keeps its install.ts tier (no TIER-MISMATCH, no T1 lint on its body)', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true }));

    expect(output).not.toContain('TIER-MISMATCH:');
    expect(output).not.toContain('STALE-PATH:');
    expect(output).toContain(`Scanning .agents/skills ... ${T1_SKILLS.length} T1 skills (+ 1 community skills committed in the store, tiers from cli/install.ts)`);
    expect(output).toContain('lint:skills passed');
    expect(exitCode).toBe(0);
  });

  test('install.ts stays the authority: a committed community skill absent from AGENTS.md §5 is still a TIER-MISMATCH', () => {
    // Before the fix the committed directory made `resend-cli` a T1 skill, and T1
    // is exempt from the §5 cross-check, so this drift was silent.
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: false }));

    expect(output).toContain('[resend-cli] TIER-MISMATCH: skill is in cli/install.ts tier arrays but absent from AGENTS.md §5');
    expect(output).not.toContain('STALE-PATH:');
    // TIER-MISMATCH is WARN severity: reported, never a failed gate.
    expect(exitCode).toBe(0);
  });

  test('the same stale citation inside a project-authored skill is still an error', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true, staleT1Body: true }));

    expect(output).toContain('[sprint-testing] STALE-PATH:');
    expect(output).toContain('scripts/does-not-exist.ts');
    expect(exitCode).toBe(1);
  });
});
