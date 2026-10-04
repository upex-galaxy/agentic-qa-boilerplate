import type { Component, UpdaterConfig } from './updater-types.ts';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { COMPONENTS, DEPRECATED_FILES } from '../update-boilerplate.ts';
import { cleanupDeprecated, dropDeprecatedDeletes, isWithinWriteSurface, reconcileComponentsByContent } from './updater-core.ts';
import {
  deliverProjectInstructions,
  INSTRUCTIONS_COMPONENT,
  INSTRUCTIONS_DIR,
  LEGACY_PROJECT_INSTRUCTIONS,
  legacyMigrationPlan,
  legacyMigrationRow,
  moveLegacyProjectInstructions,
  PROJECT_GIT_HEADING,
  PROJECT_INSTRUCTIONS,
  PROJECT_INSTRUCTIONS_TEMPLATE,
  RENAMED_SECTION_FILES,
  RETIRED_SECTION_FILES,
  runLegacyMigrationCheck,
  stubLeaks,
} from './updater-instructions.ts';
import { collectParityFindings } from './updater-parity.ts';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater-instructions-'));
  roots.push(root);
  return root;
}

function write(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

const STUB = '---\nid: project\ntitle: \'Project-specific instructions\'\nload_when: \'anything specific to this project\'\ntriggers: []\npaths: []\n---\n\n# Project-specific instructions\n';
const OWN = `${STUB}\n${PROJECT_GIT_HEADING}\n\nThis repository pushes main directly.\n`;

const L0 = [
  '# AGENTS.md',
  '',
  '## LOAD PROTOCOL',
  '',
  '## 1. CRITICAL RULES: ALWAYS APPLY',
  '',
  '## 2. BEHAVIORAL LAYER: HOW AI REASONS',
  '',
  '## 3. ORCHESTRATION MODE',
  '',
  '## ROUTER',
  '',
  '<!-- router:start -->',
  '| When | Read |',
  '|---|---|',
  '| git | `agent-git.md` |',
  '<!-- router:end -->',
  '',
  '## 12. PROACTIVE MEMORY TRIGGERS',
  '',
].join('\n');

const MONOLITH = [
  '# AGENTS.md',
  '',
  '## 1. CRITICAL RULES: ALWAYS APPLY',
  '## 2. BEHAVIORAL LAYER',
  '## 3. ORCHESTRATION MODE',
  '## 4. CONTEXT LOADING MAP: TASK → WHAT TO LOAD',
  '## 4.5. HOST HARNESSES: ONE SOURCE, THREE CONSUMERS',
  '## 5. SKILLS + MODES + MCPs REGISTRY',
  '### Skill tiers (T1-T4)',
  '## 6. TOOL RESOLUTION ([TAG_TOOL] pseudocode)',
  '## 6.5. CLI → SKILL AUTO-LOAD MAPPING',
  '## 7. PROJECT VARIABLES: POINTER',
  '## 8. AI BEHAVIOR DURING TESTING',
  '## 9. LOCAL CONTEXT (PBI)',
  '## 10. KATA QUICK-REFERENCE',
  '## 11. GIT WORKFLOW: POINTERS',
  '## Git Strategy',
  '## Acme payment sandbox',
  '## 12. PROACTIVE MEMORY TRIGGERS',
  '',
].join('\n');

describe('the instructions component', () => {
  test('is a synced directory component over .agents/instructions', () => {
    expect(COMPONENTS.find(c => c.name === INSTRUCTIONS_COMPONENT)).toEqual({ name: 'instructions', type: 'directory', paths: ['.agents/instructions'] });
  });

  test('syncs every section and the stub; agent-project.md is outside the write surface', () => {
    const upstream = tempRoot();
    spawnSync('git', ['init', '--quiet', '--initial-branch=main', upstream]);
    write(upstream, '.agents/instructions/agent-git.md', 'upstream git\n');
    write(upstream, PROJECT_INSTRUCTIONS_TEMPLATE, STUB);
    write(upstream, PROJECT_INSTRUCTIONS, OWN);
    for (const args of [['config', 'user.email', 'test@example.com'], ['config', 'user.name', 'test'], ['add', '-A'], ['commit', '--quiet', '-m', 'upstream']]) {
      spawnSync('git', ['-C', upstream, ...args]);
    }
    const project = tempRoot();
    write(project, '.agents/instructions/agent-git.md', 'project edit\n');
    write(project, PROJECT_INSTRUCTIONS, '# our own rules\n');
    const component: Component = { name: INSTRUCTIONS_COMPONENT, type: 'directory', paths: ['.agents/instructions'] };
    const entries = reconcileComponentsByContent(upstream, [component], project, []);
    // The edited section is overwritten like a skill; agent-project.md is filtered by excludePaths in runUpdate.
    expect(entries.find(e => e.path === '.agents/instructions/agent-git.md')?.classification).toBe('locally-diverged');
    expect(entries.find(e => e.path === PROJECT_INSTRUCTIONS_TEMPLATE)?.classification).toBe('new-upstream');
    const cfg = { components: [component], ignoreFiles: [], packageJsonSpecs: [], deprecatedFiles: [], excludePaths: [PROJECT_INSTRUCTIONS], repoOnlyPaths: [], bootstrapOnlyPaths: [] };
    expect(isWithinWriteSurface(cfg, '.agents/instructions/agent-git.md')).toBe(true);
    expect(isWithinWriteSurface(cfg, PROJECT_INSTRUCTIONS)).toBe(false);
  });
});

describe('stubLeaks', () => {
  test('a generic stub passes', () => {
    expect(stubLeaks(STUB, OWN)).toEqual([]);
  });

  test('an identity pattern, the own Git Strategy heading and a copy of the own agent-project.md are refused', () => {
    expect(stubLeaks('Bypasses the ProtectPublic ruleset\n')).toHaveLength(1);
    expect(stubLeaks('See https://upexgalaxy72.atlassian.net\n')).toHaveLength(1);
    expect(stubLeaks(`# P\n\n${PROJECT_GIT_HEADING}\n`)).toHaveLength(1);
    expect(stubLeaks(OWN, OWN).length).toBe(2);
  });
});

describe('deliverProjectInstructions', () => {
  test('a project without agent-project.md gets the stub once, never upstream\'s own file', () => {
    const upstream = tempRoot();
    write(upstream, PROJECT_INSTRUCTIONS_TEMPLATE, STUB);
    write(upstream, PROJECT_INSTRUCTIONS, OWN);
    const project = tempRoot();
    expect(deliverProjectInstructions(project, upstream, { dryRun: true })).toEqual({ kind: 'delivered', dryRun: true });
    expect(existsSync(join(project, PROJECT_INSTRUCTIONS))).toBe(false);
    expect(deliverProjectInstructions(project, upstream)).toEqual({ kind: 'delivered', dryRun: false });
    expect(readFileSync(join(project, PROJECT_INSTRUCTIONS), 'utf8')).toBe(STUB);
    write(project, PROJECT_INSTRUCTIONS, '# edited\n');
    expect(deliverProjectInstructions(project, upstream)).toEqual({ kind: 'present' });
    expect(readFileSync(join(project, PROJECT_INSTRUCTIONS), 'utf8')).toBe('# edited\n');
  });

  test('a leaking stub is refused and nothing is written; an upstream without a stub delivers nothing', () => {
    const upstream = tempRoot();
    const project = tempRoot();
    expect(deliverProjectInstructions(project, upstream)).toEqual({ kind: 'no-template' });
    write(upstream, PROJECT_INSTRUCTIONS_TEMPLATE, OWN);
    const outcome = deliverProjectInstructions(project, upstream);
    expect(outcome.kind).toBe('refused');
    expect(existsSync(join(project, PROJECT_INSTRUCTIONS))).toBe(false);
  });
});

describe('a pre-split AGENTS.md', () => {
  test('maps every old heading to its new home and names the project\'s own', () => {
    const plan = legacyMigrationPlan(MONOLITH, L0);
    expect(plan).not.toBeNull();
    const homes = Object.fromEntries(plan!.moved.map(m => [m.heading.split(' ')[0], m.home]));
    expect(homes['4.']).toBe('`agent-context-map.md`');
    expect(homes['4.5.']).toBe('`agent-harnesses.md`');
    expect(homes['6.5.']).toBe('`agent-tool-resolution.md`');
    expect(homes['9.']).toBe('`agent-local-context-pbi.md`');
    expect(homes.Git).toContain('agent-project.md');
    expect(plan!.moved).toHaveLength(15);
    expect(plan!.projectOwn).toEqual(['Acme payment sandbox']);
    const row = legacyMigrationRow(plan!);
    expect(row.evidence).toContain('"Acme payment sandbox"');
    expect(row.evidence).toContain('never rewritten');
    expect(row.note).toContain('| 9. LOCAL CONTEXT (PBI) | `agent-local-context-pbi.md` |');
  });

  test('nothing to migrate when the project already has the ROUTER, or upstream has none', () => {
    expect(legacyMigrationPlan(L0, L0)).toBeNull();
    expect(legacyMigrationPlan(MONOLITH, MONOLITH)).toBeNull();
  });

  test('the migration row reaches the parity report on the instructions surface, never blocking', () => {
    const upstream = tempRoot();
    const project = tempRoot();
    write(upstream, 'AGENTS.md', L0);
    write(project, 'AGENTS.md', MONOLITH);
    const row = runLegacyMigrationCheck(project, upstream);
    expect(row).not.toBeNull();
    const findings = collectParityFindings({
      root: project,
      upstreamDir: upstream,
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(project, 'none'),
      heldBack: [],
      envNewKeys: [],
      instructionRows: [{ path: 'AGENTS.md', evidence: row!.evidence, suggested: 'merge', side: 'kept', note: row!.note }],
      contextMaps: [],
      playwrightProfileKeys: [],
    });
    const migration = findings.find(f => f.path === 'AGENTS.md');
    expect(migration).toMatchObject({ surface: 'instructions', blocking: false, side: 'kept', suggested: 'merge' });
    expect(migration?.note).toContain('New home');
  });

  test('when AGENTS.md also drifted, the migration replaces its heading advice: one row, the map attached', () => {
    const upstream = tempRoot();
    const project = tempRoot();
    write(upstream, 'AGENTS.md', L0);
    write(project, 'AGENTS.md', MONOLITH);
    const row = runLegacyMigrationCheck(project, upstream)!;
    const findings = collectParityFindings({
      root: project,
      upstreamDir: upstream,
      drift: [{ path: 'AGENTS.md', reason: 'per-project AI memory', structural: false }],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(project, 'none'),
      heldBack: [],
      envNewKeys: [],
      doctrineDebt: 'informational: 2 doctrine section(s) upstream has',
      instructionRows: [{ path: 'AGENTS.md', evidence: row.evidence, suggested: 'merge', side: 'kept', note: row.note }],
      contextMaps: [],
      playwrightProfileKeys: [],
    });
    const rows = findings.filter(f => f.path === 'AGENTS.md');
    expect(rows).toHaveLength(1);
    expect(rows[0].evidence).toContain('predates progressive disclosure');
    expect(rows[0].evidence).toContain('2 doctrine section(s)');
    expect(rows[0].evidence).not.toContain('keep project-only headings');
    expect(rows[0].note).toContain('New home');
  });
});

describe('the rename to agent- names', () => {
  const REPO = join(import.meta.dir, '..', '..');
  /** A project scaffolded while the sections still carried numbers, one of them merged by hand. */
  function numberedProject(): string {
    const project = tempRoot();
    for (const name of Object.keys(RENAMED_SECTION_FILES)) { write(project, `${INSTRUCTIONS_DIR}/${name}`, `old ${name}\n`); }
    write(project, `${INSTRUCTIONS_DIR}/80-git.md`, 'our merged git section\r\nno trailing newline');
    write(project, LEGACY_PROJECT_INSTRUCTIONS, `${STUB}\n## Acme payment sandbox\r\n\nUse card 4242.`);
    write(project, `${INSTRUCTIONS_DIR}/README.md`, 'guide\n');
    return project;
  }

  test('every old name maps to a file upstream ships now, and every retired copy is backed up on its way out', () => {
    const shipped = new Set(readdirSync(join(REPO, INSTRUCTIONS_DIR)));
    for (const [oldName, newName] of Object.entries(RENAMED_SECTION_FILES)) {
      expect(shipped.has(newName)).toBe(true);
      expect(shipped.has(oldName)).toBe(false);
    }
    expect(Object.keys(RENAMED_SECTION_FILES)).not.toContain('project.md');
    for (const retired of RETIRED_SECTION_FILES) {
      expect(DEPRECATED_FILES).toContainEqual(retired);
      expect(retired.backup).toBe(true);
    }
  });

  test('bun run up retires the numbered copies with a backup, after a dry-run that touches nothing', () => {
    const project = numberedProject();
    const cfg = { deprecatedFiles: RETIRED_SECTION_FILES } as unknown as UpdaterConfig;
    let backupDir: string | null = null;
    const ensureBackup = (): string => (backupDir ??= join(project, '.backups', 'update-test'));

    expect(cleanupDeprecated(cfg, project, true, undefined, ensureBackup)).toBe(12);
    expect(existsSync(join(project, INSTRUCTIONS_DIR, '80-git.md'))).toBe(true);
    expect(backupDir).toBeNull();

    expect(cleanupDeprecated(cfg, project, false, undefined, ensureBackup)).toBe(12);
    const left = readdirSync(join(project, INSTRUCTIONS_DIR)).sort();
    expect(left).toEqual(['README.md', 'project.md']);
    expect(readFileSync(join(project, '.backups', 'update-test', INSTRUCTIONS_DIR, '80-git.md'), 'utf8')).toBe('our merged git section\r\nno trailing newline');
    expect(readdirSync(join(project, '.backups', 'update-test', INSTRUCTIONS_DIR))).toHaveLength(12);
  });

  test('the sync never asks to delete a numbered copy: the deprecated cleanup owns it', () => {
    const entries = [
      { path: `${INSTRUCTIONS_DIR}/80-git.md`, classification: 'deleted-upstream' },
      { path: `${INSTRUCTIONS_DIR}/agent-git.md`, classification: 'new-upstream' },
    ];
    expect(dropDeprecatedDeletes(entries, RETIRED_SECTION_FILES).map(e => e.path)).toEqual([`${INSTRUCTIONS_DIR}/agent-git.md`]);
  });

  test('project.md moves to agent-project.md byte for byte, and the stub is then never written over it', () => {
    const project = numberedProject();
    const before = readFileSync(join(project, LEGACY_PROJECT_INSTRUCTIONS));
    expect(moveLegacyProjectInstructions(project, { dryRun: true })).toEqual({ kind: 'moved', dryRun: true });
    expect(existsSync(join(project, PROJECT_INSTRUCTIONS))).toBe(false);
    expect(moveLegacyProjectInstructions(project)).toEqual({ kind: 'moved', dryRun: false });
    expect(existsSync(join(project, LEGACY_PROJECT_INSTRUCTIONS))).toBe(false);
    expect(readFileSync(join(project, PROJECT_INSTRUCTIONS)).equals(before)).toBe(true);

    const upstream = tempRoot();
    write(upstream, PROJECT_INSTRUCTIONS_TEMPLATE, STUB);
    expect(deliverProjectInstructions(project, upstream)).toEqual({ kind: 'present' });
    expect(readFileSync(join(project, PROJECT_INSTRUCTIONS)).equals(before)).toBe(true);
    expect(moveLegacyProjectInstructions(project)).toEqual({ kind: 'none' });
  });

  test('with both names present nothing moves: the project merges by hand', () => {
    const project = numberedProject();
    write(project, PROJECT_INSTRUCTIONS, '# already renamed\n');
    expect(moveLegacyProjectInstructions(project)).toEqual({ kind: 'both' });
    expect(readFileSync(join(project, PROJECT_INSTRUCTIONS), 'utf8')).toBe('# already renamed\n');
    expect(existsSync(join(project, LEGACY_PROJECT_INSTRUCTIONS))).toBe(true);
  });

  test('the old overlay name is outside the write surface, like the new one', () => {
    const component: Component = { name: INSTRUCTIONS_COMPONENT, type: 'directory', paths: [INSTRUCTIONS_DIR] };
    const cfg = { components: [component], ignoreFiles: [], packageJsonSpecs: [], deprecatedFiles: RETIRED_SECTION_FILES, excludePaths: [PROJECT_INSTRUCTIONS, LEGACY_PROJECT_INSTRUCTIONS], repoOnlyPaths: [], bootstrapOnlyPaths: [] };
    expect(isWithinWriteSurface(cfg, LEGACY_PROJECT_INSTRUCTIONS)).toBe(false);
    expect(isWithinWriteSurface(cfg, `${INSTRUCTIONS_DIR}/agent-git.md`)).toBe(true);
  });
});
