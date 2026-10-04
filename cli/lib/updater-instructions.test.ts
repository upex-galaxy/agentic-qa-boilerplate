import type { Component } from './updater-types.ts';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { COMPONENTS } from '../update-boilerplate.ts';
import { isWithinWriteSurface, reconcileComponentsByContent } from './updater-core.ts';
import {
  deliverProjectInstructions,
  INSTRUCTIONS_COMPONENT,
  legacyMigrationPlan,
  legacyMigrationRow,
  PROJECT_GIT_HEADING,
  PROJECT_INSTRUCTIONS,
  PROJECT_INSTRUCTIONS_TEMPLATE,
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
  '| git | `80-git.md` |',
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

  test('syncs every section and the stub; project.md is outside the write surface', () => {
    const upstream = tempRoot();
    spawnSync('git', ['init', '--quiet', '--initial-branch=main', upstream]);
    write(upstream, '.agents/instructions/80-git.md', 'upstream git\n');
    write(upstream, PROJECT_INSTRUCTIONS_TEMPLATE, STUB);
    write(upstream, PROJECT_INSTRUCTIONS, OWN);
    for (const args of [['config', 'user.email', 'test@example.com'], ['config', 'user.name', 'test'], ['add', '-A'], ['commit', '--quiet', '-m', 'upstream']]) {
      spawnSync('git', ['-C', upstream, ...args]);
    }
    const project = tempRoot();
    write(project, '.agents/instructions/80-git.md', 'project edit\n');
    write(project, PROJECT_INSTRUCTIONS, '# our own rules\n');
    const component: Component = { name: INSTRUCTIONS_COMPONENT, type: 'directory', paths: ['.agents/instructions'] };
    const entries = reconcileComponentsByContent(upstream, [component], project, []);
    // The edited section is overwritten like a skill; project.md is filtered by excludePaths in runUpdate.
    expect(entries.find(e => e.path === '.agents/instructions/80-git.md')?.classification).toBe('locally-diverged');
    expect(entries.find(e => e.path === PROJECT_INSTRUCTIONS_TEMPLATE)?.classification).toBe('new-upstream');
    const cfg = { components: [component], ignoreFiles: [], packageJsonSpecs: [], deprecatedFiles: [], excludePaths: [PROJECT_INSTRUCTIONS], repoOnlyPaths: [], bootstrapOnlyPaths: [] };
    expect(isWithinWriteSurface(cfg, '.agents/instructions/80-git.md')).toBe(true);
    expect(isWithinWriteSurface(cfg, PROJECT_INSTRUCTIONS)).toBe(false);
  });
});

describe('stubLeaks', () => {
  test('a generic stub passes', () => {
    expect(stubLeaks(STUB, OWN)).toEqual([]);
  });

  test('an identity pattern, the own Git Strategy heading and a copy of the own project.md are refused', () => {
    expect(stubLeaks('Bypasses the ProtectPublic ruleset\n')).toHaveLength(1);
    expect(stubLeaks('See https://upexgalaxy72.atlassian.net\n')).toHaveLength(1);
    expect(stubLeaks(`# P\n\n${PROJECT_GIT_HEADING}\n`)).toHaveLength(1);
    expect(stubLeaks(OWN, OWN).length).toBe(2);
  });
});

describe('deliverProjectInstructions', () => {
  test('a project without project.md gets the stub once, never upstream\'s own file', () => {
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
    expect(homes['4.']).toBe('`15-context-map.md`');
    expect(homes['4.5.']).toBe('`10-harnesses.md`');
    expect(homes['6.5.']).toBe('`30-tool-resolution.md`');
    expect(homes['9.']).toBe('`60-local-context-pbi.md`');
    expect(homes.Git).toContain('project.md');
    expect(plan!.moved).toHaveLength(15);
    expect(plan!.projectOwn).toEqual(['Acme payment sandbox']);
    const row = legacyMigrationRow(plan!);
    expect(row.evidence).toContain('"Acme payment sandbox"');
    expect(row.evidence).toContain('never rewritten');
    expect(row.note).toContain('| 9. LOCAL CONTEXT (PBI) | `60-local-context-pbi.md` |');
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
});
