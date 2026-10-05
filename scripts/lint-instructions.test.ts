import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { importRefs, PROJECT_SKILLS_HEADING, routerFingerprint, routerRows, sectionRefs, skillRouterSource, skillTableRows, withRouterLock } from './lib/instructions.ts';
import {
  acceptRouter,
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
  opts.rule1 ?? '1. **CREDENTIALS**: Reference a secret only by its variable NAME. NEVER hardcode or guess. Full: agent-critical-rules.md#1',
  '',
  '## ROUTER',
  '',
  '<!-- router:start -->',
  '| When | Read | Was | Then |',
  '|---|---|---|---|',
  ...(opts.rows ?? [
    '| a rule | `agent-critical-rules.md` | §1 | - |',
    '| git | `agent-git.md` | §11 | - |',
    '| scripts | whenever any of these apply, read @package.json first | Rule #11 | - |',
    '| project | `agent-project.md` | - | - |',
  ]),
  '<!-- router:end -->',
  '',
  opts.extra ?? '',
].join('\n');

const RULES = `${fm('critical-rules', '[\'\\brule\']')}# Critical rules\n\n## 1. CREDENTIALS\n\n1. **CREDENTIALS**: Reference a secret only by its variable NAME. NEVER hardcode or guess. Example keys live in \`.env.example\`.\n`;

function scaffold(): void {
  write('package.json', JSON.stringify({ scripts: { 'skills:check': 'x' } }));
  write('AGENTS.md', L0());
  write('.agents/instructions/agent-critical-rules.md', RULES);
  write('.agents/instructions/agent-git.md', `${fm('git')}# Git\n\nBranch from main.\n`);
  write('.agents/instructions/agent-project.md', `${fm('project', '[]')}# Project\n`);
  write('.agents/instructions/README.md', '# Guide\n\nNEVER routed, no frontmatter.\n');
}

const kinds = (): string[] => lintInstructions(root).findings.filter(f => f.severity === 'error').map(f => `${f.kind}:${f.file}`);
const warnings = (): string[] => lintInstructions(root).findings.filter(f => f.severity === 'warning').map(f => `${f.kind}:${f.file}`);
const MAINTAINER_YAML = '# MAINTAINER COPY: this repo\nproject: {}\n';

const README = [
  '# Guide',
  '',
  'NEVER routed, no frontmatter.',
  '',
  '## Sections',
  '',
  '| File | Holds |',
  '|---|---|',
  '| `agent-critical-rules.md` | rules |',
  '| `agent-git.md` | git |',
  '| `agent-project.md` | project |',
  '',
].join('\n');

const evalSet = (extra: Array<{ prompt: string, expect: string[] }> = []): string => JSON.stringify({
  targets: { recall: 0.95, precision: 0.8 },
  prompts: [
    { prompt: 'what does rule 3 say', expect: ['critical-rules'] },
    { prompt: 'explain that rule', expect: ['critical-rules'] },
    { prompt: 'is this against a rule?', expect: ['critical-rules'] },
    { prompt: 'git status', expect: ['git'] },
    { prompt: 'use git rebase here', expect: ['git'] },
    { prompt: 'git log please', expect: ['git'] },
    ...extra,
  ],
});

/** AGENTS.md text with its router locked by `adr` at the table's own fingerprint. */
const locked = (text: string, adr = 'ADR-0001'): string => withRouterLock(text, routerFingerprint(text)!, adr);

/** The maintainers' copy: every lock's input present and consistent. */
function maintainer(): void {
  write('.agents/project.yaml', MAINTAINER_YAML);
  write('.agents/instructions/agent-project.md.template', '# Project\n');
  write('.agents/instructions/README.md', README);
  write('cli/lib/fixtures/instruction-router-eval.json', evalSet());
  write('.context/ADR/ADR-0001-router.md', `# ADR-0001\n\nRouter fingerprint ${routerFingerprint(L0())}.\n`);
  write('AGENTS.md', locked(L0()));
}

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
    maintainer();
    write('AGENTS.md', locked(L0({ extra: 'y'.repeat(L0_BUDGET) })));
    expect(kinds()).toEqual(['budget:AGENTS.md']);
    write('AGENTS.md', L0({ extra: 'y'.repeat(L0_PROJECT_BUDGET) }));
    write('.agents/project.yaml', 'project: {}\n');
    expect(kinds()).toEqual(['budget:AGENTS.md']);
  });

  test('an unrouted section, a dead row and a dead @import fail by name', () => {
    scaffold();
    write('.agents/instructions/agent-tools.md', `${fm('tools')}# Tools\n`);
    write('AGENTS.md', L0({ rows: [
      '| a rule | `agent-critical-rules.md` | §1 | - |',
      '| git | `agent-git.md`, `85-gone.md` | §11 | - |',
      '| scripts | read @missing.json first | - | - |',
      '| project | `agent-project.md` | - | - |',
      '| nothing | read the docs | - | - |',
    ] }));
    expect(kinds().sort()).toEqual([
      'router:AGENTS.md',
      'router:AGENTS.md',
      'router:AGENTS.md',
      'unrouted:.agents/instructions/agent-tools.md',
    ]);
  });

  test('missing router markers fail once in the maintainers\' copy, without flagging every section as unrouted', () => {
    scaffold();
    maintainer();
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

  test('stub: an identity pattern, the own Git Strategy heading or a copy of the own agent-project.md fails', () => {
    scaffold();
    write('.agents/instructions/agent-project.md.template', '# Project\n\nPushes bypass the ProtectPublic ruleset.\n\n## Git Strategy (this repository)\n');
    expect(kinds()).toEqual(['stub:.agents/instructions/agent-project.md.template', 'stub:.agents/instructions/agent-project.md.template']);
    maintainer();
    write('.agents/instructions/agent-project.md.template', `${fm('project', '[]')}# Project\n`);
    expect(kinds()).toEqual(['stub:.agents/instructions/agent-project.md.template']);
    write('.agents/instructions/agent-project.md.template', '# A generic stub\n');
    expect(kinds()).toEqual([]);
  });

  test('stub: required in the maintainers\' copy, optional in a project', () => {
    scaffold();
    expect(kinds()).toEqual([]);
    maintainer();
    rmSync(join(root, '.agents/instructions/agent-project.md.template'));
    expect(kinds()).toEqual(['stub:.agents/instructions/agent-project.md.template']);
  });

  test('frontmatter shape: missing block, bad id, an id off its file name, empty triggers and a trigger that does not compile', () => {
    scaffold();
    write('.agents/instructions/agent-git.md', '# Git without frontmatter\n');
    write('.agents/instructions/agent-a.md', fm('Bad_Id'));
    write('.agents/instructions/agent-b.md', fm('critical-rules'));
    write('.agents/instructions/agent-c.md', fm('c', '[]'));
    write('.agents/instructions/agent-d.md', fm('d', '[\'(unclosed\']'));
    write('.agents/instructions/agent-e.md', fm('not-e'));
    write('AGENTS.md', L0({ rows: [
      '| a rule | `agent-critical-rules.md` | §1 | - |',
      '| git | `agent-git.md`, `agent-a.md`, `agent-b.md`, `agent-c.md`, `agent-d.md`, `agent-e.md` | §11 | - |',
      '| project | `agent-project.md` | - | - |',
    ] }));
    expect(kinds().sort()).toEqual([
      'frontmatter:.agents/instructions/agent-a.md',
      'frontmatter:.agents/instructions/agent-b.md',
      'frontmatter:.agents/instructions/agent-c.md',
      'frontmatter:.agents/instructions/agent-e.md',
      'frontmatter:.agents/instructions/agent-git.md',
      'trigger:.agents/instructions/agent-d.md',
    ]);
    const details = lintInstructions(root).findings.map(f => f.detail);
    expect(details).toContain('`id: critical-rules` must be the file stem without `agent-`: `id: b`');
    expect(details).toContain('`id: not-e` must be the file stem without `agent-`: `id: e`');
  });

  test('names: every file but README.md carries the agent- prefix, numbered or not', () => {
    scaffold();
    write('.agents/instructions/80-git.md', `${fm('git')}# Git\n`);
    write('.agents/instructions/notes.md.template', '# Notes\n');
    write('.agents/instructions/.DS_Store', '');
    const names = lintInstructions(root).findings.filter(f => f.kind === 'name');
    expect(names.map(f => f.file).sort()).toEqual(['.agents/instructions/80-git.md', '.agents/instructions/notes.md.template']);
    expect(names.find(f => f.file.endsWith('80-git.md'))?.detail).toContain('rename it to agent-git.md');
  });

  test('an L0 rule must keep its pointer, its name and verbatim sentences of the full text', () => {
    scaffold();
    write('AGENTS.md', L0({ rule1: '1. **CREDENTIALS**: Reference a secret only by its variable NAME. NEVER hardcode or guess.' }));
    expect(kinds()).toEqual(['rule:AGENTS.md']);
    write('AGENTS.md', L0({ rule1: '1. **CREDENTIALS**: Reference a secret only by its variable NAME. NEVER hardcode or guess. Full: agent-critical-rules.md#2' }));
    expect(kinds()).toEqual(['rule:AGENTS.md']);
    write('AGENTS.md', L0({ rule1: '1. **SECRETS**: Reference a secret only by its variable NAME. Full: agent-critical-rules.md#1' }));
    expect(kinds()).toEqual(['rule:.agents/instructions/agent-critical-rules.md']);
    write('AGENTS.md', L0({ rule1: '1. **CREDENTIALS**: Reference secrets only by NAME. Full: agent-critical-rules.md#1' }));
    expect(kinds()).toEqual(['rule:AGENTS.md']);
  });

  test('a full rule with no binding sentence in L0 fails', () => {
    scaffold();
    write('.agents/instructions/agent-critical-rules.md', `${RULES}\n## 2. PLAN\n\n2. **PLAN**: plan first.\n`);
    expect(kinds()).toEqual(['rule:.agents/instructions/agent-critical-rules.md']);
  });

  test('a NEVER/MUST line binds through L0 verbatim, a rule id, a skill compact rule or a gate', () => {
    scaffold();
    write('.agents/skills/git-flow-master/SKILL.md', '# Git\n\n## Compact Rules\n\n- DO NOT force-push.\n\n## Other\n');
    write('.agents/skills/empty-skill/SKILL.md', '# Empty\n\n## Compact Rules\n\n- Be nice.\n');
    write('.agents/instructions/agent-git.md', [
      fm('git'),
      'NEVER hardcode or guess.',
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

  test('lines under a numbered rule heading of agent-critical-rules.md are bound by that rule', () => {
    scaffold();
    write('.agents/instructions/agent-critical-rules.md', `${RULES}\nNEVER commit the .env file.\n`);
    expect(kinds()).toEqual([]);
  });

  test('skills: a project skill row lives in agent-project.md; a dead row fails, a row without triggers or in the synced section warns', () => {
    scaffold();
    const table = (slugs: string[]): string => ['| Skill | Trigger | Purpose |', '|---|---|---|', ...slugs.map(slug => `| \`${slug}\` | "x" | y |`)].join('\n');
    write('.agents/skills/billing-context/SKILL.md', '# billing');
    write('.agents/instructions/agent-project.md', `${fm('project', '[]')}# Project\n\n## Project context skills\n\n${table(['billing-context'])}\n`);
    const skills = (): string[] => lintInstructions(root).findings.filter(f => f.kind === 'skills').map(f => `${f.severity}:${f.file}:${f.line}`);
    expect(skills()).toEqual(['warning:.agents/instructions/agent-project.md:1']);

    write('.agents/instructions/agent-project.md', `${fm('project', '[\'\\bbilling\\b\']')}# Project\n\n## Project context skills\n\n${table(['billing-context', 'ghost-context'])}\n`);
    expect(skills()).toEqual(['error:.agents/instructions/agent-project.md:16']);

    write('.agents/instructions/agent-project.md', `${fm('project', '[\'\\bbilling\\b\']')}# Project\n\n## Project context skills\n\n${table(['billing-context'])}\n`);
    write('.agents/instructions/agent-skills-and-mcps.md', `${fm('skills-and-mcps', '[\'\\bskills?\\b\']')}### Skills (lazy-loaded by trigger phrase)\n\n${table(['iql-context', 'infra-context', 'billing-context'])}\n`);
    expect(skills()).toEqual(['warning:.agents/instructions/agent-skills-and-mcps.md:15']);
  });
});

describe('lint-instructions: the three locks (ADR-0013)', () => {
  const ROW = '| a new kind | `agent-git.md` | - | - |';
  const withRow = (text: string): string => text.replace('<!-- router:end -->', `${ROW}\n<!-- router:end -->`);

  test('the maintainers\' copy with every lock input in place passes, and reports the eval and the lock', () => {
    scaffold();
    maintainer();
    const report = lintInstructions(root);
    expect(report.findings.filter(f => f.severity === 'error')).toEqual([]);
    expect(report.eval).toMatchObject({ prompts: 6, recall: 1, precision: 1 });
    expect(report.lock).toEqual({ fingerprint: routerFingerprint(L0())!, adr: 'ADR-0001' });
  });

  test('lock: a router edit without a decision fails; a whitespace reflow does not', () => {
    scaffold();
    maintainer();
    write('AGENTS.md', withRow(readFileSync(join(root, 'AGENTS.md'), 'utf8')));
    expect(kinds()).toEqual(['lock:AGENTS.md']);
    expect(lintInstructions(root).findings.find(f => f.kind === 'lock')?.detail).toContain('--accept-router ADR-NNNN');
    write('AGENTS.md', locked(L0()).replace('| git | `agent-git.md` | §11 | - |', '|  git  |   `agent-git.md`  | §11 |   - |'));
    expect(kinds()).toEqual([]);
  });

  test('lock: required in the maintainers\' copy; the ADR must exist and cite the fingerprint', () => {
    scaffold();
    maintainer();
    write('AGENTS.md', L0());
    expect(kinds()).toEqual(['lock:AGENTS.md']);
    write('AGENTS.md', locked(L0(), 'ADR-0042'));
    expect(kinds()).toEqual(['lock:AGENTS.md']);
    write('AGENTS.md', locked(L0()));
    write('.context/ADR/ADR-0001-router.md', '# ADR-0001\n\nNo fingerprint here.\n');
    expect(kinds()).toEqual(['lock:.context/ADR/ADR-0001-router.md']);
  });

  test('lock: --accept-router refuses a missing ADR, re-locks, and the gate holds until the ADR cites the new fingerprint', () => {
    scaffold();
    maintainer();
    write('AGENTS.md', withRow(readFileSync(join(root, 'AGENTS.md'), 'utf8')));
    expect(acceptRouter(root, 'ADR-0002').ok).toBe(false);
    expect(acceptRouter(root, 'adr-2').ok).toBe(false);
    write('.context/ADR/ADR-0002-new-kind.md', '# ADR-0002\n');
    const accepted = acceptRouter(root, 'ADR-0002');
    const fingerprint = routerFingerprint(withRow(L0()))!;
    expect(accepted).toEqual({ ok: false, message: expect.stringContaining(fingerprint) });
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain(`<!-- router:lock ${fingerprint} ADR-0002 -->`);
    expect(kinds()).toEqual(['lock:.context/ADR/ADR-0002-new-kind.md']);
    write('.context/ADR/ADR-0002-new-kind.md', `# ADR-0002\n\nRouter fingerprint ${fingerprint}.\n`);
    expect(acceptRouter(root, 'ADR-0002').ok).toBe(true);
    expect(kinds()).toEqual([]);
  });

  test('lock: a project that never locked opted out; a project lock that drifts only warns', () => {
    scaffold();
    expect(kinds()).toEqual([]);
    write('AGENTS.md', withRow(locked(L0())));
    expect(kinds()).toEqual([]);
    expect(warnings()).toEqual(['lock:AGENTS.md']);
  });

  test('eval: a triggers edit that loses routes, or one that floods them, fails the gate', () => {
    scaffold();
    maintainer();
    write('.agents/instructions/agent-git.md', `${fm('git', '[\'\\bnever-matches\\b\']')}# Git\n\nBranch from main.\n`);
    expect(kinds()).toEqual(['eval:cli/lib/fixtures/instruction-router-eval.json']);
    expect(lintInstructions(root).findings.find(f => f.kind === 'eval')?.detail).toContain('recall');
    write('.agents/instructions/agent-git.md', `${fm('git', '[\'\\bgit\\b\', \'\\w\']')}# Git\n\nBranch from main.\n`);
    expect(lintInstructions(root).findings.find(f => f.kind === 'eval')?.detail).toContain('precision');
  });

  test('eval: a label naming no routed section fails; a missing fixture fails only the maintainers\' copy', () => {
    scaffold();
    maintainer();
    write('cli/lib/fixtures/instruction-router-eval.json', evalSet([{ prompt: 'git again', expect: ['git', 'ghost'] }]));
    expect(lintInstructions(root).findings.filter(f => f.kind === 'eval').map(f => f.detail).join(' ')).toContain('ghost');
    rmSync(join(root, 'cli/lib/fixtures/instruction-router-eval.json'));
    expect(kinds()).toEqual(['eval:cli/lib/fixtures/instruction-router-eval.json']);
    write('.agents/project.yaml', 'project: {}\n');
    expect(kinds()).toEqual([]);
  });

  test('complete: a new section with frontmatter and a row but no labelled prompts and no README row fails twice', () => {
    scaffold();
    maintainer();
    write('.agents/instructions/agent-tools.md', `${fm('tools', '[\'\\bacli\\b\']')}# Tools\n`);
    write('AGENTS.md', locked(L0({ rows: [
      '| a rule | `agent-critical-rules.md` | §1 | - |',
      '| git | `agent-git.md` | §11 | - |',
      '| tools | `agent-tools.md` | §6 | - |',
      '| scripts | whenever any of these apply, read @package.json first | Rule #11 | - |',
      '| project | `agent-project.md` | - | - |',
    ] })));
    write('.context/ADR/ADR-0001-router.md', `# ADR-0001\n\n${routerFingerprint(readFileSync(join(root, 'AGENTS.md'), 'utf8'))}\n`);
    expect(kinds()).toEqual(['complete:.agents/instructions/agent-tools.md', 'complete:.agents/instructions/agent-tools.md']);
    write('cli/lib/fixtures/instruction-router-eval.json', evalSet(['run acli view', 'acli transition', 'acli login'].map(prompt => ({ prompt, expect: ['tools'] }))));
    write('.agents/instructions/README.md', README.replace('| `agent-project.md` |', '| `agent-tools.md` | tools |\n| `agent-project.md` |'));
    expect(kinds()).toEqual([]);
  });

  test('complete: a README row naming a gone file fails; a missing table fails the maintainers\' copy, a project only warns', () => {
    scaffold();
    maintainer();
    write('.agents/instructions/README.md', `${README}| \`agent-gone.md\` | old |\n`);
    expect(kinds()).toEqual(['complete:.agents/instructions/README.md']);
    write('.agents/instructions/README.md', '# Guide\n');
    expect(kinds()).toEqual(['complete:.agents/instructions/README.md']);
    write('.agents/project.yaml', 'project: {}\n');
    write('.agents/instructions/README.md', README.replace('| `agent-git.md` | git |\n', ''));
    expect(kinds()).toEqual([]);
    expect(warnings()).toEqual(['complete:.agents/instructions/agent-git.md']);
  });
});

describe('instructions helper', () => {
  test('router rows skip the header and the separator; refs and plain-text imports are extracted', () => {
    const rows = routerRows(L0()) ?? [];
    expect(rows.map(r => r.cells[1])).toEqual([
      '`agent-critical-rules.md`',
      '`agent-git.md`',
      'whenever any of these apply, read @package.json first',
      '`agent-project.md`',
    ]);
    expect(sectionRefs('`10-a.md`, `agent-project.md` and `x.ts`')).toEqual(['10-a.md', 'agent-project.md']);
    expect(importRefs('read @.agents/project.yaml and @package.json, not `@README.md`')).toEqual(['.agents/project.yaml', 'package.json']);
  });

  test('the skill router source is the skills section when present, else AGENTS.md, else null', () => {
    expect(skillRouterSource(root)).toBeNull();
    write('AGENTS.md', '# x');
    expect(skillRouterSource(root)?.rel).toBe('AGENTS.md');
    write('.agents/instructions/agent-skills-and-mcps.md', '# s');
    expect(skillRouterSource(root)?.rel).toBe('.agents/instructions/agent-skills-and-mcps.md');
  });

  test('a skill table ends at the next heading; a missing heading is null, not an empty table', () => {
    const text = ['# P', '## Project context skills', '| Skill | T |', '|---|---|', '| `a-context` | x |', '## Next', '| `b-context` | x |'].join('\n');
    expect(skillTableRows(text, PROJECT_SKILLS_HEADING)).toEqual([{ slug: 'a-context', line: 5 }]);
    expect(skillTableRows('# P\n', PROJECT_SKILLS_HEADING)).toBeNull();
  });
});
