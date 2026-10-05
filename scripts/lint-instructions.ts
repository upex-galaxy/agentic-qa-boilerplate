#!/usr/bin/env bun
/**
 * @fileoverview Structural gate for the progressive-disclosure instructions.
 *
 * `AGENTS.md` (L0) is loaded on every session by all three hosts; the section
 * files under `.agents/instructions/` load only when the L0 ROUTER (or the
 * hook's `ROUTE:` line) sends the model there. That split only works while
 * these hold, and each one is checked here:
 *
 *   - BUDGET: two levels, the same in both boilerplates. Over `L0_TARGET` is a
 *     warning (the number stays visible); over `L0_BUDGET` fails in the
 *     maintainers' copy, over `L0_PROJECT_BUDGET` fails in a project (its own
 *     L0 additions included); and whatever the budgets say, L0 must stay under
 *     `CODEX_PROJECT_DOC_MAX_BYTES`, where Codex cuts project instructions
 *     without telling the model.
 *   - ROUTER: the markers exist, every row names at least one section file or
 *     Claude import, every named file resolves, and every section file is named
 *     by some row (an unrouted section is unreachable).
 *   - NAMES: every file in the folder but `README.md` carries the
 *     `SECTION_PREFIX` (`agent-`), so a reader knows it comes from the agent
 *     setup. Names carry no number: the router row order is the order.
 *   - FRONTMATTER: every section opens with `id` (kebab, unique, and equal to
 *     the file stem without `agent-`: `agent-git.md` -> `id: git`, the tag a
 *     `ROUTE:` line carries), `title`, `load_when`, `triggers` (regex sources
 *     that compile, case-insensitive) and `paths`. Only `agent-project.md` may
 *     leave `triggers` empty.
 *   - RULES: every L0 critical rule ends with its `Full: agent-critical-rules.md#<n>` pointer, has the same
 *     number and name as a heading in `agent-critical-rules.md`, and each of its
 *     sentences is a verbatim fragment of that rule's full text (so L0 can be
 *     shortened, never reworded).
 *   - BINDING: a `NEVER` / `MUST` line in a section binds only if the actor can
 *     reach it from where it always looks. It passes when its sentence is
 *     verbatim in L0, when it sits under a numbered rule heading of
 *     `agent-critical-rules.md`, or when it carries one id: `Rule #N` (an L0
 *     rule), `` binding: `/<skill>` `` (a skill whose compact rules carry a
 *     prohibition) or `` enforced: `bun run <script>` `` (a gate in
 *     `package.json`).
 *
 *   - SKILLS: a skill the project authored is routed from the `## Project
 *     context skills` table of `agent-project.md`, never from the synced skills
 *     section. A row there whose `.agents/skills/<slug>/SKILL.md` does not
 *     exist is an error; a filled table while `agent-project.md` has no `triggers`
 *     is a warning (the hook never routes the file by keyword); a project-local
 *     skill (`isProjectLocalSkillPath`, the shipped context map skills aside)
 *     in `agent-skills-and-mcps.md` is a warning (`bun run up` overwrites that
 *     file and the row is lost).
 *   - STUB: `agent-project.md.template`, the generic `agent-project.md` a downstream project
 *     receives, carries none of this repo's identity (`stubLeaks`: the
 *     `project.schema.yaml` identity patterns, the own Git Strategy heading,
 *     a copy of the maintainers' own `agent-project.md`). Required in the
 *     maintainers' copy.
 *
 * Three locks keep the split from eroding (ADR-0013). Each one binds the
 * maintainers' copy as an error; in a project it is a warning, and only once
 * the file it reads is there (the README and the eval set are synced, the ADR
 * folder is not, and `AGENTS.md` is the project's own):
 *
 *   - LOCK: the ROUTER rows are frozen. `<!-- router:lock <fingerprint>
 *     <ADR-NNNN> -->` in `AGENTS.md` records the fingerprint of the table and
 *     the ADR that decided it; a table that no longer matches fails, and so
 *     does an ADR that does not exist or does not cite that fingerprint. The
 *     escape hatch is the decision itself: write (or amend) the ADR, then
 *     `bun run instructions:check --accept-router ADR-NNNN` rewrites the lock
 *     and names the fingerprint the ADR must cite.
 *   - EVAL: the labelled-prompt eval of the router (`scripts/lib/router-eval.ts`)
 *     runs on every call, whole set in milliseconds, and must hold the recall
 *     and precision targets, so a `triggers:` or `paths:` edit that loses a
 *     route or floods them fails here, before any test run.
 *   - COMPLETE: every section but `agent-project.md` ships whole: frontmatter
 *     and a router row (checked above), at least `MIN_EVAL_PROMPTS` labelled
 *     prompts that expect its id, and a row in the README `## Sections` table.
 *
 * A repo without `.agents/instructions/` has not adopted the split yet, and a
 * project whose `AGENTS.md` has no ROUTER still runs its pre-split monolith
 * (the sync delivers the sections; moving AGENTS.md is the project's own merge,
 * named in the parity report): the gate prints a note and passes, because
 * being behind upstream is not a broken repo.
 *
 * Usage: bun scripts/lint-instructions.ts   (exit 1 on any error; warnings print and pass)
 *        bun scripts/lint-instructions.ts --accept-router ADR-NNNN   (re-lock the ROUTER on a decided change)
 */

import type { RouterEvalFixture, RouterEvalResult } from './lib/router-eval.ts';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMaintainerCopy } from '../cli/lib/agents-schema.ts';
import { contextMapSkill } from '../cli/lib/context-maps.ts';
import { isProjectLocalSkillPath } from '../cli/lib/updater-core.ts';
import { PROJECT_INSTRUCTIONS, PROJECT_INSTRUCTIONS_TEMPLATE, stubLeaks } from '../cli/lib/updater-instructions.ts';
import {
  ADR_DIR,
  findAdr,
  importRefs,
  INSTRUCTIONS_DIR,
  INSTRUCTIONS_README,
  L0_FILE,
  listSections,
  PROJECT_SECTION,
  PROJECT_SKILLS_HEADING,
  readmeSectionRows,
  ROUTER_EVAL_FIXTURE,
  routerFingerprint,
  routerLock,
  routerRows,
  SECTION_PREFIX,
  sectionId,
  sectionRefs,
  SKILL_ROUTER_HEADING,
  SKILLS_SECTION,
  skillTableRows,
  withRouterLock,
} from './lib/instructions.ts';
import { evaluateRouter, MIN_EVAL_PROMPTS, promptsPerLabel, readRouterEvalFixture } from './lib/router-eval.ts';

/** Target for the boilerplate's L0: over it is a warning, so the number stays visible. */
export const L0_TARGET = 16 * 1024;
/** Ceiling for the boilerplate's own L0 (the maintainers' copy): behaviour whole plus every rule's binding sentence. */
export const L0_BUDGET = 24 * 1024;
/** Ceiling for a project's L0, its own additions included. */
export const L0_PROJECT_BUDGET = 28 * 1024;
/** Codex `project_doc_max_bytes` default: past it the file is cut at the byte, silently. */
export const CODEX_PROJECT_DOC_MAX_BYTES = 32 * 1024;
export const RULES_SECTION = 'agent-critical-rules.md';

export interface InstructionFinding {
  file: string
  line: number
  kind: 'budget' | 'router' | 'unrouted' | 'name' | 'frontmatter' | 'trigger' | 'rule' | 'binding' | 'skills' | 'stub' | 'lock' | 'eval' | 'complete'
  severity: 'error' | 'warning'
  detail: string
}

export interface InstructionReport {
  adopted: boolean
  /** A project with the sections but a pre-split `AGENTS.md` (no ROUTER): nothing is checked yet. */
  pendingMigration: boolean
  l0Bytes: number
  /** The ceiling that applies to this repo: `L0_BUDGET` in the maintainers' copy, else `L0_PROJECT_BUDGET`. */
  budget: number
  sections: number
  rows: number
  /** The router eval result, when the fixture and the router are both there. */
  eval?: RouterEvalResult
  /** The ROUTER lock as found in L0, when there is one. */
  lock?: { fingerprint: string, adr: string }
  findings: InstructionFinding[]
}

/** Budget for one L0 size: a Codex cut or a ceiling fails, the target only warns. */
export function budgetFinding(bytes: number, maintainer: boolean): InstructionFinding | null {
  const ceiling = maintainer ? L0_BUDGET : L0_PROJECT_BUDGET;
  const at = (severity: InstructionFinding['severity'], detail: string): InstructionFinding => ({ file: L0_FILE, line: 1, kind: 'budget', severity, detail });
  if (bytes > CODEX_PROJECT_DOC_MAX_BYTES) { return at('error', `${bytes} B > ${CODEX_PROJECT_DOC_MAX_BYTES} B: Codex cuts project instructions here without telling the model`); }
  if (bytes > ceiling) {
    return at('error', maintainer
      ? `${bytes} B > ${ceiling} B boilerplate ceiling: move detail into a section file, keep only binding sentences in L0`
      : `${bytes} B > ${ceiling} B ceiling with project additions: move project text into ${INSTRUCTIONS_DIR}/${PROJECT_SECTION} or a project context skill`);
  }
  if (bytes > L0_TARGET) { return at('warning', `${bytes} B > ${L0_TARGET} B target`); }
  return null;
}

const NEVER_MUST = /\b(?:NEVER|MUST)\b/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Sentences of a line, markdown list / quote / table prefixes dropped. */
function sentences(line: string): string[] {
  return line
    .replace(/^\s*(?:[-*>]|\d+\.)\s+/, '')
    .split(/(?<=[.!?])\s+(?=[A-Z*`"(])/)
    .map(s => norm(s).replace(/[.:]$/, ''))
    .filter(Boolean);
}

/** L0 critical rules: number → { name, rest, line }. */
function l0Rules(l0: string): Map<number, { name: string, rest: string, line: number, pointer: boolean }> {
  const rules = new Map<number, { name: string, rest: string, line: number, pointer: boolean }>();
  const lines = l0.split('\n');
  const start = lines.findIndex(l => /^## 1\. /.test(l));
  if (start < 0) { return rules; }
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    const m = /^(\d+)\. \*\*([^*]+)\*\*(.*)$/.exec(lines[i]);
    if (!m) { continue; }
    const full = /\s+Full: (\S+)#(\d+)$/.exec(m[3]);
    const pointer = full !== null && full[1] === RULES_SECTION && full[2] === m[1];
    rules.set(Number(m[1]), { name: m[2], rest: full ? m[3].slice(0, full.index) : m[3], line: i + 1, pointer });
  }
  return rules;
}

/** `agent-critical-rules.md` headings: number → { name, body, line }. */
function fullRules(text: string): Map<number, { name: string, body: string, line: number }> {
  const rules = new Map<number, { name: string, body: string, line: number }>();
  const lines = text.split('\n');
  let current: { n: number, name: string, body: string[], line: number } | null = null;
  const flush = (): void => { if (current) { rules.set(current.n, { name: current.name, body: current.body.join(' '), line: current.line }); } };
  lines.forEach((line, i) => {
    const h = /^## (\d+)\. (.+)$/.exec(line);
    if (h) { flush(); current = { n: Number(h[1]), name: h[2], body: [], line: i + 1 }; return; }
    if (/^#{1,2} /.test(line)) { flush(); current = null; return; }
    if (current) { current.body.push(line); }
  });
  flush();
  return rules;
}

function scriptNames(root: string): Set<string> {
  const pkg = join(root, 'package.json');
  if (!existsSync(pkg)) { return new Set(); }
  return new Set(Object.keys((JSON.parse(readFileSync(pkg, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}));
}

/** Whether a skill's compact rules (or hard rules) carry a prohibition the cited line can lean on. */
function skillBinds(root: string, slug: string): boolean {
  const file = join(root, '.agents', 'skills', slug, 'SKILL.md');
  if (!existsSync(file)) { return false; }
  const text = readFileSync(file, 'utf8');
  const start = text.search(/^## (?:Compact Rules|Hard rules)$/m);
  if (start < 0) { return false; }
  const rest = text.slice(start).split('\n').slice(1);
  const end = rest.findIndex(line => line.startsWith('## '));
  const block = (end < 0 ? rest : rest.slice(0, end)).join('\n');
  return /\b(?:never|must|do not)\b/i.test(block);
}

export function lintInstructions(root: string): InstructionReport {
  const findings: InstructionFinding[] = [];
  const l0Path = join(root, L0_FILE);
  const adopted = existsSync(join(root, INSTRUCTIONS_DIR));
  const l0 = existsSync(l0Path) ? readFileSync(l0Path, 'utf8') : '';
  const l0Bytes = Buffer.byteLength(l0, 'utf8');
  const yamlPath = join(root, '.agents', 'project.yaml');
  const maintainer = existsSync(yamlPath) && isMaintainerCopy(readFileSync(yamlPath, 'utf8'));
  const budget = maintainer ? L0_BUDGET : L0_PROJECT_BUDGET;
  if (!adopted) { return { adopted, pendingMigration: false, l0Bytes, budget, sections: 0, rows: 0, findings }; }
  if (!maintainer && routerRows(l0) === null) { return { adopted, pendingMigration: true, l0Bytes, budget, sections: 0, rows: 0, findings }; }

  // BUDGET
  const overBudget = budgetFinding(l0Bytes, maintainer);
  if (overBudget) { findings.push(overBudget); }

  const sections = listSections(root);
  const names = new Set(sections.map(s => s.name));

  // NAMES: readable, prefixed, unnumbered.
  for (const name of readdirSync(join(root, INSTRUCTIONS_DIR))) {
    if (name === INSTRUCTIONS_README || name.startsWith('.')) { continue; }
    if (!name.startsWith(SECTION_PREFIX)) {
      findings.push({ severity: 'error', file: `${INSTRUCTIONS_DIR}/${name}`, line: 1, kind: 'name', detail: `every file here but ${INSTRUCTIONS_README} starts with \`${SECTION_PREFIX}\`: rename it to ${SECTION_PREFIX}${name.replace(/^\d+-/, '')}` });
    }
  }

  // ROUTER
  const rows = routerRows(l0);
  const routed = new Set<string>();
  if (rows === null) {
    findings.push({ severity: 'error', file: L0_FILE, line: 1, kind: 'router', detail: 'router markers <!-- router:start --> / <!-- router:end --> missing' });
  }
  else {
    if (rows.length === 0) { findings.push({ severity: 'error', file: L0_FILE, line: 1, kind: 'router', detail: 'router table has no rows' }); }
    for (const row of rows) {
      const read = row.cells[1] ?? '';
      const refs = sectionRefs(read);
      const imports = importRefs(read);
      if (refs.length === 0 && imports.length === 0) {
        findings.push({ severity: 'error', file: L0_FILE, line: row.line, kind: 'router', detail: 'row names no section file and no @import in its Read cell' });
      }
      for (const ref of refs) {
        routed.add(ref);
        if (!names.has(ref)) { findings.push({ severity: 'error', file: L0_FILE, line: row.line, kind: 'router', detail: `\`${ref}\` does not exist in ${INSTRUCTIONS_DIR}/` }); }
      }
      for (const ref of imports) {
        if (!existsSync(join(root, ref))) { findings.push({ severity: 'error', file: L0_FILE, line: row.line, kind: 'router', detail: `@${ref} does not resolve from the repo root` }); }
      }
    }
  }
  for (const s of sections) {
    if (rows !== null && !routed.has(s.name)) {
      findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'unrouted', detail: 'no ROUTER row in AGENTS.md names this section, so nothing loads it' });
    }
  }

  // FRONTMATTER + TRIGGERS
  const ids = new Map<string, string>();
  for (const s of sections) {
    const fm = s.frontmatter;
    if (fm === null) {
      findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'frontmatter', detail: s.frontmatterError ?? 'missing leading --- frontmatter block' });
      continue;
    }
    const isProject = s.name === PROJECT_SECTION;
    if (typeof fm.id !== 'string' || !KEBAB.test(fm.id)) { findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'frontmatter', detail: '`id` must be a kebab-case string' }); }
    else if (s.name.startsWith(SECTION_PREFIX) && fm.id !== sectionId(s.name)) { findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'frontmatter', detail: `\`id: ${fm.id}\` must be the file stem without \`${SECTION_PREFIX}\`: \`id: ${sectionId(s.name)}\`` }); }
    else if (ids.has(fm.id)) { findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'frontmatter', detail: `\`id: ${fm.id}\` duplicates ${ids.get(fm.id)}` }); }
    else { ids.set(fm.id, s.rel); }
    for (const key of ['title', 'load_when'] as const) {
      const value = fm[key];
      if (typeof value !== 'string' || value.trim() === '') { findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'frontmatter', detail: `\`${key}\` must be a non-empty string` }); }
    }
    if (!Array.isArray(fm.paths) || fm.paths.some(p => typeof p !== 'string')) {
      findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'frontmatter', detail: '`paths` must be a list of strings (may be empty)' });
    }
    if (!Array.isArray(fm.triggers) || fm.triggers.some(t => typeof t !== 'string')) {
      findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'frontmatter', detail: '`triggers` must be a list of regex strings' });
      continue;
    }
    if (fm.triggers.length === 0 && !isProject) { findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'frontmatter', detail: '`triggers` is empty: the hook can never route here' }); }
    for (const t of fm.triggers as string[]) {
      try { void new RegExp(t, 'i'); }
      catch (error) { findings.push({ severity: 'error', file: s.rel, line: 1, kind: 'trigger', detail: `${JSON.stringify(t)} does not compile: ${(error as Error).message}` }); }
    }
  }

  // RULES: L0 binding sentences against the full text.
  const rules = l0Rules(l0);
  const rulesSection = sections.find(s => s.name === RULES_SECTION);
  const full = rulesSection ? fullRules(rulesSection.text) : new Map<number, { name: string, body: string, line: number }>();
  if (rules.size === 0) { findings.push({ severity: 'error', file: L0_FILE, line: 1, kind: 'rule', detail: '`## 1.` critical rules not found in L0' }); }
  if (!rulesSection) { findings.push({ severity: 'error', file: `${INSTRUCTIONS_DIR}/${RULES_SECTION}`, line: 1, kind: 'rule', detail: 'full text of the critical rules is missing' }); }
  else {
    for (const [n, rule] of rules) {
      const target = full.get(n);
      if (!rule.pointer) { findings.push({ severity: 'error', file: L0_FILE, line: rule.line, kind: 'rule', detail: `rule ${n} does not end with its "Full: ${RULES_SECTION}#${n}" pointer` }); }
      if (!target) { findings.push({ severity: 'error', file: L0_FILE, line: rule.line, kind: 'rule', detail: `rule ${n} has no "## ${n}." heading in ${RULES_SECTION}` }); continue; }
      if (target.name !== rule.name) { findings.push({ severity: 'error', file: rulesSection.rel, line: target.line, kind: 'rule', detail: `rule ${n} is named "${target.name}" here but "${rule.name}" in L0` }); }
      const body = norm(target.body);
      for (const fragment of sentences(rule.rest.replace(/^[:.]\s*/, ''))) {
        if (!body.includes(fragment)) { findings.push({ severity: 'error', file: L0_FILE, line: rule.line, kind: 'rule', detail: `rule ${n}: "${fragment.slice(0, 80)}" is not verbatim in ${RULES_SECTION}` }); }
      }
    }
    for (const [n, target] of full) {
      if (!rules.has(n)) { findings.push({ severity: 'error', file: rulesSection.rel, line: target.line, kind: 'rule', detail: `rule ${n} has no binding sentence in L0` }); }
    }
  }

  // BINDING: every NEVER / MUST line in a section is reachable from where the actor always looks.
  const scripts = scriptNames(root);
  const l0Norm = norm(l0);
  for (const s of sections) {
    let fenced = false;
    let ruleHeading: number | null = null;
    s.text.split('\n').forEach((line, i) => {
      if (/^\s*```/.test(line)) { fenced = !fenced; return; }
      if (fenced) { return; }
      const h = /^(#{1,6}) (\d+)?/.exec(line);
      if (h) { ruleHeading = s.name === RULES_SECTION && h[1] === '##' && h[2] ? Number(h[2]) : null; return; }
      // A keyword inside a code span is a mention (`NEVER` the word), not a directive.
      if (!NEVER_MUST.test(line.replace(/`[^`]*`/g, ''))) { return; }
      if (ruleHeading !== null && rules.has(ruleHeading)) { return; }
      const ruleIds = [...line.matchAll(/\bRule #(\d+)\b/g)].map(m => Number(m[1]));
      if (ruleIds.some(n => rules.has(n))) { return; }
      const skills = [...line.matchAll(/binding: `\/?([a-z0-9-]+)`/g)].map(m => m[1]);
      if (skills.some(slug => skillBinds(root, slug))) { return; }
      const gates = [...line.matchAll(/enforced: `bun run ([\w:.-]+)`/g)].map(m => m[1]);
      if (gates.some(g => scripts.has(g))) { return; }
      const binding = sentences(line).filter(x => NEVER_MUST.test(x));
      if (binding.length > 0 && binding.every(x => l0Norm.includes(x))) { return; }
      findings.push({ severity: 'error', file: s.rel, line: i + 1, kind: 'binding', detail: 'NEVER/MUST line with no binding id: add `Rule #N`, binding: `/<skill>`, enforced: `bun run <script>`, or put the sentence in L0' });
    });
  }

  // SKILLS: the project's own skills are routed from agent-project.md, the one file `bun run up` never overwrites.
  const project = sections.find(s => s.name === PROJECT_SECTION);
  const projectRel = `${INSTRUCTIONS_DIR}/${PROJECT_SECTION}`;
  const projectRows = project ? skillTableRows(project.text, PROJECT_SKILLS_HEADING) ?? [] : [];
  for (const row of projectRows) {
    if (!existsSync(join(root, '.agents', 'skills', row.slug, 'SKILL.md'))) {
      findings.push({ severity: 'error', file: projectRel, line: row.line, kind: 'skills', detail: `\`${row.slug}\` has no .agents/skills/${row.slug}/SKILL.md: remove the row or create the skill` });
    }
  }
  const projectTriggers = project?.frontmatter?.triggers;
  if (project && projectRows.length > 0 && Array.isArray(projectTriggers) && projectTriggers.length === 0) {
    findings.push({ severity: 'warning', file: project.rel, line: 1, kind: 'skills', detail: 'the Project context skills table has rows but `triggers` is empty: add each skill\'s trigger phrases as regex sources so the hook routes this file' });
  }
  const skillsSection = sections.find(s => s.name === SKILLS_SECTION);
  const skillsRel = `${INSTRUCTIONS_DIR}/${SKILLS_SECTION}`;
  for (const row of skillsSection ? skillTableRows(skillsSection.text, SKILL_ROUTER_HEADING) ?? [] : []) {
    // The context map skills ship their rows upstream; every other project-local `<aspect>-context` is the project's.
    if (isProjectLocalSkillPath(`.agents/skills/${row.slug}/SKILL.md`) && contextMapSkill(row.slug) === undefined) {
      findings.push({ severity: 'warning', file: skillsRel, line: row.line, kind: 'skills', detail: `\`${row.slug}\` is project-owned but routed from a synced file \`bun run up\` overwrites: move the row to ${INSTRUCTIONS_DIR}/${PROJECT_SECTION} \`## Project context skills\`` });
    }
  }

  // STUB: the generic agent-project.md a downstream project receives carries none of this repo's identity.
  const stubPath = join(root, PROJECT_INSTRUCTIONS_TEMPLATE);
  if (existsSync(stubPath)) {
    const own = maintainer && existsSync(join(root, PROJECT_INSTRUCTIONS)) ? readFileSync(join(root, PROJECT_INSTRUCTIONS), 'utf8') : null;
    for (const reason of stubLeaks(readFileSync(stubPath, 'utf8'), own)) {
      findings.push({ severity: 'error', file: PROJECT_INSTRUCTIONS_TEMPLATE, line: 1, kind: 'stub', detail: `the stub would leak to every project: ${reason}` });
    }
  }
  else if (maintainer) {
    findings.push({ severity: 'error', file: PROJECT_INSTRUCTIONS_TEMPLATE, line: 1, kind: 'stub', detail: `missing: a project without ${PROJECT_INSTRUCTIONS} has no generic stub to receive` });
  }

  // LOCK, EVAL, COMPLETE: the three locks that keep the split from eroding.
  const lockSeverity: InstructionFinding['severity'] = maintainer ? 'error' : 'warning';
  const lock = rows === null ? null : routerLock(l0);
  if (rows !== null) { findings.push(...lockFindings(root, l0, maintainer)); }
  let fixture: RouterEvalFixture | null = null;
  try { fixture = readRouterEvalFixture(root); }
  catch (error) { findings.push({ severity: lockSeverity, file: ROUTER_EVAL_FIXTURE, line: 1, kind: 'eval', detail: (error as Error).message }); }
  let evalResult: RouterEvalResult | undefined;
  if (fixture === null) {
    if (maintainer && !findings.some(f => f.kind === 'eval')) { findings.push({ severity: 'error', file: ROUTER_EVAL_FIXTURE, line: 1, kind: 'eval', detail: 'missing: the router eval has no labelled prompts to run' }); }
  }
  else if (rows !== null) {
    evalResult = evaluateRouter(root, fixture) ?? undefined;
    if (evalResult) { findings.push(...evalFindings(evalResult, lockSeverity)); }
  }
  findings.push(...completeFindings(root, sections, fixture, maintainer));

  return {
    adopted,
    pendingMigration: false,
    l0Bytes,
    budget,
    sections: sections.length,
    rows: rows?.length ?? 0,
    eval: evalResult,
    lock: lock ? { fingerprint: lock.fingerprint, adr: lock.adr } : undefined,
    findings,
  };
}

const ACCEPT_HINT = '`bun run instructions:check --accept-router ADR-NNNN`';

/** LOCK: the ROUTER table matches its lock, and the lock's ADR exists and cites the fingerprint. */
// LINT.IfChange(router-lock)
export function lockFindings(root: string, l0: string, maintainer: boolean): InstructionFinding[] {
  const fingerprint = routerFingerprint(l0);
  if (fingerprint === null) { return []; }
  const lock = routerLock(l0);
  const severity: InstructionFinding['severity'] = maintainer ? 'error' : 'warning';
  if (lock === null) {
    // A project that has never locked its router opted out; the maintainers' copy cannot.
    return maintainer
      ? [{ severity, file: L0_FILE, line: 1, kind: 'lock', detail: `the ROUTER has no lock line: record the ADR that decided the table, then ${ACCEPT_HINT}` }]
      : [];
  }
  const out: InstructionFinding[] = [];
  if (lock.fingerprint !== fingerprint) {
    out.push({
      severity,
      file: L0_FILE,
      line: lock.line,
      kind: 'lock',
      detail: `ROUTER rows changed (table ${fingerprint}, lock ${lock.fingerprint}). Rows are fixed request kinds: grow a section and its \`triggers:\` instead. A new request kind is an architectural decision: write the ADR, then ${ACCEPT_HINT}`,
    });
  }
  if (!maintainer) { return out; }
  const adr = findAdr(root, lock.adr);
  if (adr === null) {
    out.push({ severity, file: L0_FILE, line: lock.line, kind: 'lock', detail: `the lock names ${lock.adr}, which is not in ${ADR_DIR}/` });
  }
  else if (!readFileSync(join(root, adr), 'utf8').includes(lock.fingerprint)) {
    out.push({ severity, file: adr, line: 1, kind: 'lock', detail: `${lock.adr} does not cite the router fingerprint \`${lock.fingerprint}\` the lock records: add it (References, or an Amendments line)` });
  }
  return out;
}
// LINT.ThenChange(.agents/instructions/README.md, .agents/skills/framework-development/references/instructions-doctrine.md, packages/decks/progressive-disclosure/how-it-works.es.html)

/** EVAL: recall, binding recall and precision hold their targets; every label names a routed id. */
export function evalFindings(result: RouterEvalResult, severity: InstructionFinding['severity']): InstructionFinding[] {
  const out: InstructionFinding[] = [];
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  if (result.recall < result.targets.recall) {
    out.push({ severity, file: ROUTER_EVAL_FIXTURE, line: 1, kind: 'eval', detail: `router recall ${pct(result.recall)} < ${pct(result.targets.recall)}: fix the section's \`triggers:\`, never the label. ${result.misses.slice(0, 5).join('; ')}` });
  }
  else if (result.bindingRecall < result.targets.bindingRecall) {
    // Binding recall never exceeds recall: reported only when recall itself holds.
    out.push({ severity, file: ROUTER_EVAL_FIXTURE, line: 1, kind: 'eval', detail: `router binding recall ${pct(result.bindingRecall)} < ${pct(result.targets.bindingRecall)}: the ranking pushes expected sections past the cap onto the optional line; a weak anchor needs a sharper trigger. ${result.demoted.slice(0, 5).join('; ')}` });
  }
  if (result.precision < result.targets.precision) {
    out.push({ severity, file: ROUTER_EVAL_FIXTURE, line: 1, kind: 'eval', detail: `router precision ${pct(result.precision)} < ${pct(result.targets.precision)}: a trigger fires on prompts that do not need its section; narrow it` });
  }
  if (result.unknownLabels.length > 0) {
    out.push({ severity, file: ROUTER_EVAL_FIXTURE, line: 1, kind: 'eval', detail: `labels no routed section or import carries: ${result.unknownLabels.join(', ')}` });
  }
  return out;
}

/** COMPLETE: every section but the project overlay has enough labelled prompts and a README row; no README row is stale. */
export function completeFindings(
  root: string,
  sections: ReturnType<typeof listSections>,
  fixture: RouterEvalFixture | null,
  maintainer: boolean,
): InstructionFinding[] {
  const out: InstructionFinding[] = [];
  const severity: InstructionFinding['severity'] = maintainer ? 'error' : 'warning';
  const readmeRel = `${INSTRUCTIONS_DIR}/${INSTRUCTIONS_README}`;
  const readmePath = join(root, readmeRel);
  const readmeRows = existsSync(readmePath) ? readmeSectionRows(readFileSync(readmePath, 'utf8')) : null;
  if (readmeRows === null && maintainer) {
    out.push({ severity, file: readmeRel, line: 1, kind: 'complete', detail: 'no `## Sections` table: every section file needs a row there' });
  }
  const perLabel = fixture ? promptsPerLabel(fixture) : null;
  const names = new Set(sections.map(s => s.name));
  for (const s of sections) {
    if (s.name === PROJECT_SECTION) { continue; }
    const id = typeof s.frontmatter?.id === 'string' ? s.frontmatter.id : sectionId(s.name);
    const count = perLabel?.get(id) ?? 0;
    if (perLabel && count < MIN_EVAL_PROMPTS) {
      out.push({ severity, file: s.rel, line: 1, kind: 'complete', detail: `${count} labelled prompt(s) expect \`${id}\` in ${ROUTER_EVAL_FIXTURE}; a section ships with at least ${MIN_EVAL_PROMPTS}` });
    }
    if (readmeRows && !readmeRows.some(r => r.name === s.name)) {
      out.push({ severity, file: s.rel, line: 1, kind: 'complete', detail: `no row in the \`## Sections\` table of ${readmeRel}` });
    }
  }
  for (const row of readmeRows ?? []) {
    if (!names.has(row.name)) { out.push({ severity, file: readmeRel, line: row.line, kind: 'complete', detail: `\`${row.name}\` is not a section in ${INSTRUCTIONS_DIR}/` }); }
  }
  return out;
}

/**
 * `--accept-router ADR-NNNN`: re-lock the ROUTER on a decided change. Refuses
 * an ADR that is not on disk; writes the lock and returns the fingerprint the
 * ADR must cite (the lint keeps failing until it does).
 */
export function acceptRouter(root: string, adrId: string): { ok: boolean, message: string } {
  if (!/^ADR-\d{4}$/.test(adrId)) { return { ok: false, message: `expected an ADR id like ADR-0013, got ${JSON.stringify(adrId)}` }; }
  const l0Path = join(root, L0_FILE);
  const l0 = existsSync(l0Path) ? readFileSync(l0Path, 'utf8') : '';
  const fingerprint = routerFingerprint(l0);
  if (fingerprint === null) { return { ok: false, message: `${L0_FILE} has no ROUTER markers to lock` }; }
  const adr = findAdr(root, adrId);
  if (adr === null) { return { ok: false, message: `${adrId} is not in ${ADR_DIR}/: write the ADR that decides the new table first` }; }
  writeFileSync(l0Path, withRouterLock(l0, fingerprint, adrId));
  if (!readFileSync(join(root, adr), 'utf8').includes(fingerprint)) {
    return { ok: false, message: `ROUTER locked at ${fingerprint} by ${adrId}; now cite it in ${adr}: add \`router fingerprint ${fingerprint}\` (References, or an Amendments line)` };
  }
  return { ok: true, message: `ROUTER locked at ${fingerprint} by ${adrId}` };
}

if (import.meta.main) {
  const root = process.cwd();
  if (!statSync(root).isDirectory()) { process.exit(2); }
  const acceptAt = process.argv.indexOf('--accept-router');
  if (acceptAt >= 0) {
    const accepted = acceptRouter(root, process.argv[acceptAt + 1] ?? '');
    (accepted.ok ? console.log : console.error)(`${accepted.ok ? '✓' : '✗'} ${accepted.message}`);
    if (!accepted.ok) { process.exit(1); }
  }
  const report = lintInstructions(root);
  if (!report.adopted) {
    console.log(`- instructions:check skipped: no ${INSTRUCTIONS_DIR}/ in this repo (progressive disclosure not adopted yet)`);
    process.exit(0);
  }
  if (report.pendingMigration) {
    console.log(`- instructions:check skipped: ${L0_FILE} has no ROUTER yet (pre-split monolith); move it to the L0 + ${INSTRUCTIONS_DIR}/ layout, see the parity report of \`bun run up\``);
    process.exit(0);
  }
  const errors = report.findings.filter(f => f.severity === 'error');
  for (const f of report.findings.filter(f => f.severity === 'warning')) {
    console.warn(`  ⚠ ${f.file}:${f.line}  ${f.kind}  ${f.detail}`);
  }
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const evalNote = report.eval
    ? `; router eval recall ${pct(report.eval.recall)} binding ${pct(report.eval.bindingRecall)} precision ${pct(report.eval.precision)} over ${report.eval.prompts} prompts`
    : '';
  const lockNote = report.lock ? `; router lock ${report.lock.fingerprint} (${report.lock.adr})` : '';
  if (errors.length === 0) {
    console.log(`✓ instructions:check passed (L0 ${report.l0Bytes} B; target ${L0_TARGET} B, ceiling ${report.budget} B; ${report.sections} sections, ${report.rows} router rows${evalNote}${lockNote})`);
    process.exit(0);
  }
  for (const f of errors) {
    console.error(`  ✗ ${f.file}:${f.line}  ${f.kind}  ${f.detail}`);
  }
  console.error(`✗ instructions:check failed: ${errors.length} error(s)`);
  process.exit(1);
}
