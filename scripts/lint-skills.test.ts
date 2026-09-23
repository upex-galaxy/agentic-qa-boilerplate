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

/**
 * A project-authored SKILL.md. `kind` is the purpose axis (`metadata.kind`);
 * `null` omits the whole `metadata:` block so KIND-MISSING can be provoked
 * (`null`, not `undefined`: an explicit `undefined` would select the default).
 */
function t1Skill(slug: string, body = '', kind: string | null = 'workflow'): string {
  const categories = slug === 'framework-development' ? 'complementary_categories: [framework-evolution]\n' : '';
  const metadata = kind === null ? '' : `metadata:\n  kind: ${kind}\n`;
  return [
    '---',
    `name: ${slug}`,
    `description: ${slug} fixture.`,
    `${categories}${metadata}---`,
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
 * A purpose-axis VIOLATION line (`KIND-MISSING:` / `KIND-VOCAB:` / `KIND-SUFFIX:`).
 * The trailing colon matters: the "Checks run" summary of a green run names the
 * same three checks without it.
 */
const KIND_VIOLATION = /KIND-(MISSING|VOCAB|SUFFIX):/;

/**
 * A repo with the six T1 skills, `resend-cli` listed under PROJECT_LEVEL_SKILLS
 * (T3) AND committed as a real directory in `.agents/skills/`, its body citing
 * a path that does not exist. `listCommunityInAgentsMd` decides whether the
 * AGENTS.md §5 table carries the `resend-cli` row. `sprintTestingKind` overrides
 * the `metadata.kind` of `sprint-testing` (`null` omits the block entirely).
 * `extraSkills` adds project-authored skills, each with its §5 row, so the
 * purpose-axis checks can be exercised on any slug shape.
 */
interface FixtureOptions {
  listCommunityInAgentsMd: boolean
  staleT1Body?: boolean
  sprintTestingKind?: string | null
  extraSkills?: Array<{ slug: string, kind?: string }>
}

function fixture(options: FixtureOptions): string {
  const root = mkdtempSync(join(tmpdir(), 'lint-skills-'));
  temporaryRoots.push(root);

  write(root, 'cli/install.ts', [
    'const PROJECT_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [',
    '  { package: \'https://github.com/resend/resend-skills\', skill: \'resend-cli\' },',
    '];',
    'const USER_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [];',
    '',
  ].join('\n'));

  const extraSkills = options.extraSkills ?? [];
  const rows = [...T1_SKILLS, ...extraSkills.map(s => s.slug)].map(slug => `| \`${slug}\` | \`/${slug}\` | fixture |`);
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
    const body = options.staleT1Body && slug === 'sprint-testing' ? STALE_CITATION : '';
    const kind = slug === 'sprint-testing' && options.sprintTestingKind !== undefined
      ? options.sprintTestingKind
      : 'workflow';
    write(root, `.agents/skills/${slug}/SKILL.md`, t1Skill(slug, body, kind));
  }
  for (const extra of extraSkills) {
    write(root, `.agents/skills/${extra.slug}/SKILL.md`, t1Skill(extra.slug, '', extra.kind ?? null));
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
    // The vendor body declares no `metadata.kind` and is never asked for one.
    expect(output).not.toMatch(KIND_VIOLATION);
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

describe('lint-skills purpose axis (metadata.kind)', () => {
  test('a project-authored skill without metadata.kind is a KIND-MISSING error', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true, sprintTestingKind: null }));

    expect(output).toContain('[sprint-testing] KIND-MISSING:');
    expect(output).toContain('context, workflow, utility, core');
    expect(exitCode).toBe(1);
  });

  test('a kind outside the vocabulary is a KIND-VOCAB error', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true, sprintTestingKind: 'gadget' }));

    expect(output).toContain('[sprint-testing] KIND-VOCAB:');
    expect(output).toContain('`metadata.kind: gadget`');
    expect(exitCode).toBe(1);
  });

  test('a `-context` slug must declare kind context (suffix → kind)', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true, extraSkills: [{ slug: 'acme-context', kind: 'workflow' }] }));

    expect(output).toContain('[acme-context] KIND-SUFFIX: slug ends `-context` so `metadata.kind` must be `context`, found `workflow`');
    expect(exitCode).toBe(1);
  });

  test('a `-cli` slug must declare kind utility (suffix → kind)', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true, extraSkills: [{ slug: 'acme-cli', kind: 'context' }] }));

    expect(output).toContain('[acme-cli] KIND-SUFFIX: slug ends `-cli` so `metadata.kind` must be `utility`, found `context`');
    expect(exitCode).toBe(1);
  });

  test('a utility without a `-cli` / `-tool` / `-app` suffix is a KIND-SUFFIX error (kind → suffix)', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true, extraSkills: [{ slug: 'acme-helper', kind: 'utility' }] }));

    expect(output).toContain('[acme-helper] KIND-SUFFIX: `metadata.kind: utility` requires a slug ending `-cli` / `-tool` / `-app`');
    expect(exitCode).toBe(1);
  });

  test('`acli` is grandfathered by name: utility without the suffix passes', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true, extraSkills: [{ slug: 'acli', kind: 'utility' }] }));

    expect(output).not.toMatch(KIND_VIOLATION);
    expect(exitCode).toBe(0);
  });

  test('`project-context` is grandfathered by name: a workflow with the `-context` suffix passes', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true, extraSkills: [{ slug: 'project-context', kind: 'workflow' }] }));

    expect(output).not.toMatch(KIND_VIOLATION);
    expect(exitCode).toBe(0);
  });

  test('a `-context` slug declaring kind context passes', () => {
    const { exitCode, output } = runLint(fixture({ listCommunityInAgentsMd: true, extraSkills: [{ slug: 'acme-context', kind: 'context' }] }));

    expect(output).not.toMatch(KIND_VIOLATION);
    expect(output).toContain('lint:skills passed');
    expect(exitCode).toBe(0);
  });
});
