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
 *   - FRONTMATTER: every section opens with `id` (kebab, unique), `title`,
 *     `load_when`, `triggers` (regex sources that compile, case-insensitive)
 *     and `paths`. Only `project.md` may leave `triggers` empty.
 *   - RULES: every L0 critical rule ends with its `→ 01` pointer, has the same
 *     number and name as a heading in `01-critical-rules.md`, and each of its
 *     sentences is a verbatim fragment of that rule's full text (so L0 can be
 *     shortened, never reworded).
 *   - BINDING: a `NEVER` / `MUST` line in a section binds only if the actor can
 *     reach it from where it always looks. It passes when its sentence is
 *     verbatim in L0, when it sits under a numbered rule heading of
 *     `01-critical-rules.md`, or when it carries one id: `Rule #N` (an L0
 *     rule), `` binding: `/<skill>` `` (a skill whose compact rules carry a
 *     prohibition) or `` enforced: `bun run <script>` `` (a gate in
 *     `package.json`).
 *
 * A repo without `.agents/instructions/` has not adopted the split yet: the
 * gate prints a note and passes, because being behind upstream is not a broken
 * repo.
 *
 * Usage: bun scripts/lint-instructions.ts   (exit 1 on any error; warnings print and pass)
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isMaintainerCopy } from '../cli/lib/agents-schema.ts';
import {
  importRefs,
  INSTRUCTIONS_DIR,
  L0_FILE,
  listSections,
  PROJECT_SECTION,
  routerRows,
  sectionRefs,
} from './lib/instructions.ts';

/** Target for the boilerplate's L0: over it is a warning, so the number stays visible. */
export const L0_TARGET = 16 * 1024;
/** Ceiling for the boilerplate's own L0 (the maintainers' copy): behaviour whole plus every rule's binding sentence. */
export const L0_BUDGET = 24 * 1024;
/** Ceiling for a project's L0, its own additions included. */
export const L0_PROJECT_BUDGET = 28 * 1024;
/** Codex `project_doc_max_bytes` default: past it the file is cut at the byte, silently. */
export const CODEX_PROJECT_DOC_MAX_BYTES = 32 * 1024;
export const RULES_SECTION = '01-critical-rules.md';

export interface InstructionFinding {
  file: string
  line: number
  kind: 'budget' | 'router' | 'unrouted' | 'frontmatter' | 'trigger' | 'rule' | 'binding'
  severity: 'error' | 'warning'
  detail: string
}

export interface InstructionReport {
  adopted: boolean
  l0Bytes: number
  /** The ceiling that applies to this repo: `L0_BUDGET` in the maintainers' copy, else `L0_PROJECT_BUDGET`. */
  budget: number
  sections: number
  rows: number
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
    const pointer = /\s→ 01$/.test(m[3]);
    rules.set(Number(m[1]), { name: m[2], rest: m[3].replace(/\s*→ 01$/, ''), line: i + 1, pointer });
  }
  return rules;
}

/** `01-critical-rules.md` headings: number → { name, body, line }. */
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
  if (!adopted) { return { adopted, l0Bytes, budget, sections: 0, rows: 0, findings }; }

  // BUDGET
  const overBudget = budgetFinding(l0Bytes, maintainer);
  if (overBudget) { findings.push(overBudget); }

  const sections = listSections(root);
  const names = new Set(sections.map(s => s.name));

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
      if (!rule.pointer) { findings.push({ severity: 'error', file: L0_FILE, line: rule.line, kind: 'rule', detail: `rule ${n} does not end with its "→ 01" pointer` }); }
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

  return { adopted, l0Bytes, budget, sections: sections.length, rows: rows?.length ?? 0, findings };
}

if (import.meta.main) {
  const root = process.cwd();
  if (!statSync(root).isDirectory()) { process.exit(2); }
  const report = lintInstructions(root);
  if (!report.adopted) {
    console.log(`- instructions:check skipped: no ${INSTRUCTIONS_DIR}/ in this repo (progressive disclosure not adopted yet)`);
    process.exit(0);
  }
  const errors = report.findings.filter(f => f.severity === 'error');
  for (const f of report.findings.filter(f => f.severity === 'warning')) {
    console.warn(`  ⚠ ${f.file}:${f.line}  ${f.kind}  ${f.detail}`);
  }
  if (errors.length === 0) {
    console.log(`✓ instructions:check passed (L0 ${report.l0Bytes} B; target ${L0_TARGET} B, ceiling ${report.budget} B; ${report.sections} sections, ${report.rows} router rows)`);
    process.exit(0);
  }
  for (const f of errors) {
    console.error(`  ✗ ${f.file}:${f.line}  ${f.kind}  ${f.detail}`);
  }
  console.error(`✗ instructions:check failed: ${errors.length} error(s)`);
  process.exit(1);
}
