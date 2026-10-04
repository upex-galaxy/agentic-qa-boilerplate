import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { importRefs, routerRows, sectionRefs, skillRouterSource } from './lib/instructions.ts';
import {
  budgetFinding,
  CODEX_PROJECT_DOC_MAX_BYTES,
  L0_BUDGET,
  L0_PROJECT_BUDGET,
  L0_TARGET,
  lintInstructions,
} from './lint-instructions.ts';

let root: string;

function write(rel: string, content = ''): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const fm = (id: string, triggers = '[\'\\bgit\\b\']'): string =>
  `---\nid: ${id}\ntitle: '${id}'\nload_when: 'when ${id}'\ntriggers: ${triggers}\npaths: []\n---\n\n`;

const L0 = (opts: { rule1?: string, rows?: string[], extra?: string } = {}): string => [
  '# AGENTS.md',
  '',
  '## 1. CRITICAL RULES: ALWAYS APPLY',
  '',
  opts.rule1 ?? '1. **CREDENTIALS**: ALWAYS read from `.env`. NEVER hardcode/guess. → 01',
  '',
  '## ROUTER',
  '',
  '<!-- router:start -->',
  '| When | Read | Was | Then |',
  '|---|---|---|---|',
  ...(opts.rows ?? [
    '| a rule | `01-critical-rules.md` | §1 | - |',
    '| git | `80-git.md` | §11 | - |',
    '| scripts | whenever any of these apply, read @package.json first | Rule #11 | - |',
    '| project | `project.md` | - | - |',
  ]),
  '<!-- router:end -->',
  '',
  opts.extra ?? '',
].join('\n');

const RULES = `${fm('critical-rules', '[\'\\brule\']')}# Critical rules\n\n## 1. CREDENTIALS\n\n1. **CREDENTIALS**: ALWAYS read from \`.env\`. NEVER hardcode/guess. Example keys live in \`.env.example\`.\n`;

function scaffold(): void {
  write('package.json', JSON.stringify({ scripts: { 'skills:check': 'x' } }));
  write('AGENTS.md', L0());
  write('.agents/instructions/01-critical-rules.md', RULES);
  write('.agents/instructions/80-git.md', `${fm('git')}# Git\n\nBranch from main.\n`);
  write('.agents/instructions/project.md', `${fm('project', '[]')}# Project\n`);
  write('.agents/instructions/README.md', '# Guide\n\nNEVER routed, no frontmatter.\n');
}

const kinds = (): string[] => lintInstructions(root).findings.filter(f => f.severity === 'error').map(f => `${f.kind}:${f.file}`);
const warnings = (): string[] => lintInstructions(root).findings.filter(f => f.severity === 'warning').map(f => `${f.kind}:${f.file}`);
const MAINTAINER_YAML = '# MAINTAINER COPY: this repo\nproject: {}\n';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lint-instructions-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('lint-instructions', () => {
  test('a repo without .agents/instructions/ has not adopted the split and passes', () => {
    write('AGENTS.md', 'x'.repeat(CODEX_PROJECT_DOC_MAX_BYTES + 10));
    const report = lintInstructions(root);
    expect(report.adopted).toBe(false);
    expect(report.findings).toEqual([]);
  });

  test('a well-formed layout passes; the README is neither routed nor checked', () => {
    scaffold();
    const report = lintInstructions(root);
    expect(report.findings).toEqual([]);
    expect(report.sections).toBe(3);
    expect(report.rows).toBe(4);
  });

  test('the budget levels nest under the Codex cut', () => {
    expect(L0_TARGET).toBe(16384);
    expect(L0_BUDGET).toBe(24576);
    expect(L0_PROJECT_BUDGET).toBe(28672);
    expect(CODEX_PROJECT_DOC_MAX_BYTES).toBe(32768);
    expect(L0_TARGET < L0_BUDGET && L0_BUDGET < L0_PROJECT_BUDGET && L0_PROJECT_BUDGET < CODEX_PROJECT_DOC_MAX_BYTES).toBe(true);
  });

  test('budget: over the target warns, over the ceiling fails, the Codex cut fails everywhere', () => {
    expect(budgetFinding(L0_TARGET, true)).toBeNull();
    expect(budgetFinding(L0_TARGET + 1, true)?.severity).toBe('warning');
    expect(budgetFinding(L0_BUDGET + 1, true)?.severity).toBe('error');
    expect(budgetFinding(L0_BUDGET + 1, false)?.severity).toBe('warning');
    expect(budgetFinding(L0_PROJECT_BUDGET + 1, false)?.severity).toBe('error');
    expect(budgetFinding(CODEX_PROJECT_DOC_MAX_BYTES + 1, false)?.detail).toContain('Codex');
  });

  test('L0 over the target warns and passes; the maintainer copy fails at the boilerplate ceiling, a project at the higher one', () => {
    scaffold();
    write('AGENTS.md', L0({ extra: 'y'.repeat(L0_TARGET) }));
    expect(kinds()).toEqual([]);
    expect(warnings()).toEqual(['budget:AGENTS.md']);
    write('AGENTS.md', L0({ extra: 'y'.repeat(L0_BUDGET) }));
    expect(kinds()).toEqual([]);
    write('.agents/project.yaml', MAINTAINER_YAML);
    write('.agents/instructions/project.md.template', '# Project\n');
    expect(kinds()).toEqual(['budget:AGENTS.md']);
    write('AGENTS.md', L0({ extra: 'y'.repeat(L0_PROJECT_BUDGET) }));
    write('.agents/project.yaml', 'project: {}\n');
    expect(kinds()).toEqual(['budget:AGENTS.md']);
  });

  test('an unrouted section, a dead row and a dead @import fail by name', () => {
    scaffold();
    write('.agents/instructions/30-tools.md', `${fm('tools')}# Tools\n`);
    write('AGENTS.md', L0({ rows: [
      '| a rule | `01-critical-rules.md` | §1 | - |',
      '| git | `80-git.md`, `85-gone.md` | §11 | - |',
      '| scripts | read @missing.json first | - | - |',
      '| project | `project.md` | - | - |',
      '| nothing | read the docs | - | - |',
    ] }));
    expect(kinds().sort()).toEqual([
      'router:AGENTS.md',
      'router:AGENTS.md',
      'router:AGENTS.md',
      'unrouted:.agents/instructions/30-tools.md',
    ]);
  });

  test('missing router markers fail once in the maintainers\' copy, without flagging every section as unrouted', () => {
    scaffold();
    write('.agents/project.yaml', MAINTAINER_YAML);
    write('.agents/instructions/project.md.template', '# Project\n');
    write('AGENTS.md', L0().replace('<!-- router:start -->', ''));
    expect(kinds()).toEqual(['router:AGENTS.md']);
  });

  test('a project that received the sections but still runs its pre-split AGENTS.md is pending, not broken', () => {
    scaffold();
    write('AGENTS.md', `# AGENTS.md\n\n## 9. LOCAL CONTEXT (PBI)\n\n${'x'.repeat(CODEX_PROJECT_DOC_MAX_BYTES)}\n`);
    const report = lintInstructions(root);
    expect(report.pendingMigration).toBe(true);
    expect(report.findings).toEqual([]);
  });

  test('stub: an identity pattern, the own Git Strategy heading or a copy of the own project.md fails', () => {
    scaffold();
    write('.agents/instructions/project.md.template', '# Project\n\nPushes bypass the ProtectPublic ruleset.\n\n## Git Strategy (this repository)\n');
    expect(kinds()).toEqual(['stub:.agents/instructions/project.md.template', 'stub:.agents/instructions/project.md.template']);
    write('.agents/project.yaml', MAINTAINER_YAML);
    write('.agents/instructions/project.md.template', `${fm('project', '[]')}# Project\n`);
    expect(kinds()).toEqual(['stub:.agents/instructions/project.md.template']);
    write('.agents/instructions/project.md.template', '# A generic stub\n');
    expect(kinds()).toEqual([]);
  });

  test('stub: required in the maintainers\' copy, optional in a project', () => {
    scaffold();
    expect(kinds()).toEqual([]);
    write('.agents/project.yaml', MAINTAINER_YAML);
    expect(kinds()).toEqual(['stub:.agents/instructions/project.md.template']);
  });

  test('frontmatter shape: missing block, bad id, duplicate id, empty triggers and a trigger that does not compile', () => {
    scaffold();
    write('.agents/instructions/80-git.md', '# Git without frontmatter\n');
    write('.agents/instructions/90-a.md', fm('Bad_Id'));
    write('.agents/instructions/91-b.md', fm('critical-rules'));
    write('.agents/instructions/92-c.md', fm('c', '[]'));
    write('.agents/instructions/93-d.md', fm('d', '[\'(unclosed\']'));
    write('AGENTS.md', L0({ rows: [
      '| a rule | `01-critical-rules.md` | §1 | - |',
      '| git | `80-git.md`, `90-a.md`, `91-b.md`, `92-c.md`, `93-d.md` | §11 | - |',
      '| project | `project.md` | - | - |',
    ] }));
    expect(kinds().sort()).toEqual([
      'frontmatter:.agents/instructions/80-git.md',
      'frontmatter:.agents/instructions/90-a.md',
      'frontmatter:.agents/instructions/91-b.md',
      'frontmatter:.agents/instructions/92-c.md',
      'trigger:.agents/instructions/93-d.md',
    ]);
  });

  test('an L0 rule must keep its pointer, its name and verbatim sentences of the full text', () => {
    scaffold();
    write('AGENTS.md', L0({ rule1: '1. **CREDENTIALS**: ALWAYS read from `.env`. NEVER hardcode/guess.' }));
    expect(kinds()).toEqual(['rule:AGENTS.md']);
    write('AGENTS.md', L0({ rule1: '1. **SECRETS**: ALWAYS read from `.env`. → 01' }));
    expect(kinds()).toEqual(['rule:.agents/instructions/01-critical-rules.md']);
    write('AGENTS.md', L0({ rule1: '1. **CREDENTIALS**: ALWAYS read secrets from `.env`. → 01' }));
    expect(kinds()).toEqual(['rule:AGENTS.md']);
  });

  test('a full rule with no binding sentence in L0 fails', () => {
    scaffold();
    write('.agents/instructions/01-critical-rules.md', `${RULES}\n## 2. PLAN\n\n2. **PLAN**: plan first.\n`);
    expect(kinds()).toEqual(['rule:.agents/instructions/01-critical-rules.md']);
  });

  test('a NEVER/MUST line binds through L0 verbatim, a rule id, a skill compact rule or a gate', () => {
    scaffold();
    write('.agents/skills/git-flow-master/SKILL.md', '# Git\n\n## Compact Rules\n\n- DO NOT force-push.\n\n## Other\n');
    write('.agents/skills/empty-skill/SKILL.md', '# Empty\n\n## Compact Rules\n\n- Be nice.\n');
    write('.agents/instructions/80-git.md', [
      fm('git'),
      'NEVER hardcode/guess.',
      'NEVER rebase main (Rule #1).',
      'NEVER push without a PR (binding: `/git-flow-master`).',
      'MUST pass hooks (enforced: `bun run skills:check`).',
      'Mentions the word `NEVER` in a code span only.',
      '```',
      'NEVER inside a fence is an example.',
      '```',
      'NEVER rebase a shared branch (Rule #9).',
      'NEVER merge alone (binding: `/empty-skill`).',
      'MUST be green (enforced: `bun run nope`).',
      'MUST stay unreachable.',
    ].join('\n'));
    const lines = lintInstructions(root).findings.filter(f => f.kind === 'binding').map(f => f.line);
    expect(lines).toEqual([18, 19, 20, 21]);
  });

  test('lines under a numbered rule heading of 01-critical-rules.md are bound by that rule', () => {
    scaffold();
    write('.agents/instructions/01-critical-rules.md', `${RULES}\nNEVER commit the .env file.\n`);
    expect(kinds()).toEqual([]);
  });
});

describe('instructions helper', () => {
  test('router rows skip the header and the separator; refs and plain-text imports are extracted', () => {
    const rows = routerRows(L0()) ?? [];
    expect(rows.map(r => r.cells[1])).toEqual([
      '`01-critical-rules.md`',
      '`80-git.md`',
      'whenever any of these apply, read @package.json first',
      '`project.md`',
    ]);
    expect(sectionRefs('`10-a.md`, `project.md` and `x.ts`')).toEqual(['10-a.md', 'project.md']);
    expect(importRefs('read @.agents/project.yaml and @package.json, not `@README.md`')).toEqual(['.agents/project.yaml', 'package.json']);
  });

  test('the skill router source is the skills section when present, else AGENTS.md, else null', () => {
    expect(skillRouterSource(root)).toBeNull();
    write('AGENTS.md', '# x');
    expect(skillRouterSource(root)?.rel).toBe('AGENTS.md');
    write('.agents/instructions/20-skills-and-mcps.md', '# s');
    expect(skillRouterSource(root)?.rel).toBe('.agents/instructions/20-skills-and-mcps.md');
  });
});
