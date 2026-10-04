/**
 * @fileoverview The `instructions` component: what the sync does around the
 * progressive-disclosure instruction sections (`.agents/instructions/`).
 *
 * Ownership, one line each:
 *
 *  - every file in `.agents/instructions/` except `project.md` is upstream's
 *    and syncs like a skill (overwrite, `.backups/` copy, an "overwritten
 *    edit" row, `updater.protected_paths` to keep a merge);
 *  - `project.md` is the project's own and is never synced. A project that
 *    has none receives it ONCE, written from the generic stub upstream ships
 *    beside it (`project.md.template`), never from upstream's own `project.md`,
 *    which carries the boilerplate's own exceptions (its Git Strategy);
 *  - `AGENTS.md` (L0) stays the project's, on the watchlist. A project
 *    scaffolded before the split keeps its monolith: it gets one row mapping
 *    each old heading to the section that now carries it, and naming the
 *    headings that are its own and belong in `project.md`.
 *
 * Both deliveries of the stub (this module for `bun run up`, the scaffolder in
 * `packages/create-agentic-qa`) and `instructions:check` refuse a stub that
 * carries the boilerplate's identity: `stubLeaks` is that gate.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { IDENTITY_PATTERNS } from './agents-schema';

export const INSTRUCTIONS_COMPONENT = 'instructions';
export const INSTRUCTIONS_DIR = '.agents/instructions';
/** The project-owned overlay: never synced, delivered once from the stub. */
export const PROJECT_INSTRUCTIONS = `${INSTRUCTIONS_DIR}/project.md`;
/** The generic stub upstream ships for it. Not `.md`, so no section reader takes it for a section. */
export const PROJECT_INSTRUCTIONS_TEMPLATE = `${INSTRUCTIONS_DIR}/project.md.template`;
/** The heading under which a repository records its own reading of its git strategy (never in a stub). */
export const PROJECT_GIT_HEADING = '## Git Strategy (this repository)';
/** Marker of an L0 that has the ROUTER, i.e. a project already on progressive disclosure. */
export const ROUTER_MARKER = '<!-- router:start -->';

// ============================================================================
// LEAK GATE
// ============================================================================

/**
 * Why a stub must not ship, empty when it may. A stub carries the
 * boilerplate's identity when it holds an identity pattern (the same list the
 * `project.schema.yaml` gate uses), the boilerplate's own Git Strategy
 * heading, or is byte-equal to the boilerplate's own `project.md` (`own`,
 * when the caller has it): a copy of that file is not a stub.
 */
export function stubLeaks(stub: string, own?: string | null): string[] {
  const reasons: string[] = [];
  const lines = stub.split('\n');
  for (const { name, re } of IDENTITY_PATTERNS) {
    const i = lines.findIndex(line => re.test(line));
    if (i >= 0) { reasons.push(`line ${i + 1} carries ${name}`); }
  }
  if (lines.some(line => line.trim() === PROJECT_GIT_HEADING)) {
    reasons.push(`it carries the boilerplate's own "${PROJECT_GIT_HEADING.replace(/^## /, '')}" section`);
  }
  if (typeof own === 'string' && own.trim() !== '' && own.trim() === stub.trim()) {
    reasons.push('it is a copy of the boilerplate\'s own project.md, not a stub');
  }
  return reasons;
}

// ============================================================================
// PROJECT.MD DELIVERY (bootstrap, once)
// ============================================================================

export type ProjectInstructionsOutcome
  = | { kind: 'present' }
    | { kind: 'no-template' }
    | { kind: 'delivered', dryRun: boolean }
    | { kind: 'refused', reasons: string[] };

/**
 * Write `project.md` from upstream's stub when the project has none. Never
 * touches an existing file, and never writes a stub the leak gate refuses.
 * Under `dryRun` it reports what the real run would do and writes nothing.
 */
export function deliverProjectInstructions(root: string, upstreamDir: string, opts: { dryRun?: boolean } = {}): ProjectInstructionsOutcome {
  const target = path.join(root, PROJECT_INSTRUCTIONS);
  if (fs.existsSync(target)) { return { kind: 'present' }; }
  const templatePath = path.join(upstreamDir, PROJECT_INSTRUCTIONS_TEMPLATE);
  if (!fs.existsSync(templatePath)) { return { kind: 'no-template' }; }
  const stub = fs.readFileSync(templatePath, 'utf8');
  const ownPath = path.join(upstreamDir, PROJECT_INSTRUCTIONS);
  const own = fs.existsSync(ownPath) ? fs.readFileSync(ownPath, 'utf8') : null;
  const reasons = stubLeaks(stub, own);
  if (reasons.length > 0) { return { kind: 'refused', reasons }; }
  if (opts.dryRun === true) { return { kind: 'delivered', dryRun: true }; }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, stub, 'utf8');
  return { kind: 'delivered', dryRun: false };
}

// ============================================================================
// PRE-SPLIT AGENTS.md: where each old heading went
// ============================================================================

/** Where an old monolith heading's content lives now. `L0` = the upstream `AGENTS.md` itself. */
export interface HeadingHome {
  /** Matches the old heading (numbered headings by their number, so a project's wording does not matter). */
  match: RegExp
  home: string
}

/**
 * The monolith `AGENTS.md` headings, in their old order, and their new homes.
 * A numbered heading matches by its number: projects reworded their titles,
 * and the number is what skills cite (`§9`).
 */
export const LEGACY_HEADING_HOMES: readonly HeadingHome[] = [
  { match: /^1\.\s/, home: 'L0 (each rule\'s binding sentence) + `01-critical-rules.md` (full text)' },
  { match: /^2\.\s/, home: 'L0, whole' },
  { match: /^3\.\s/, home: 'L0 (core) + `90-orchestration-detail.md`' },
  { match: /^4\.\s/, home: '`15-context-map.md`' },
  { match: /^4\.5\.?\s/, home: '`10-harnesses.md`' },
  { match: /^5\.\s/, home: '`20-skills-and-mcps.md`' },
  { match: /^6\.\s/, home: '`30-tool-resolution.md`' },
  { match: /^6\.5\.?\s/, home: '`30-tool-resolution.md`' },
  { match: /^7\.\s/, home: '`40-project-variables.md`' },
  { match: /^8\.\s/, home: '`50-ticket-work.md`' },
  { match: /^9\.\s/, home: '`60-local-context-pbi.md`' },
  { match: /^10\.\s/, home: '`70-code-quickref.md`' },
  { match: /^11\.\s/, home: '`80-git.md`' },
  { match: /^Git Strategy$/i, home: '`80-git.md` (the shared doctrine) + `project.md` → `Git Strategy (this repository)` (this project\'s own reading and any accepted divergence)' },
  { match: /^12\.\s/, home: 'L0, whole' },
];

/** `##` headings of a markdown text, in order (the `#` title and deeper levels excluded). */
function h2Headings(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n').filter(l => l.startsWith('## ')).map(l => l.replace(/^## /, '').trim());
}

/** Whether an `AGENTS.md` already carries the L0 ROUTER (the project is on progressive disclosure). */
export function hasRouter(agents: string): boolean {
  return agents.split('\n').some(line => line.trim() === ROUTER_MARKER);
}

export interface LegacyMigrationPlan {
  /** Old heading -> its new home, in the project's order. */
  moved: Array<{ heading: string, home: string }>
  /** Headings no upstream file owns: the project's own, which belong in `project.md`. */
  projectOwn: string[]
}

/**
 * The migration plan for a pre-split `AGENTS.md`, or null when the project is
 * already split (its L0 has the ROUTER) or upstream is not (no ROUTER there:
 * nothing to migrate to). Headings the new L0 itself carries (`LOAD PROTOCOL`,
 * `ROUTER`) are never the project's own; a `###` under a mapped `##` travels
 * with it.
 */
export function legacyMigrationPlan(project: string, upstreamL0: string): LegacyMigrationPlan | null {
  if (hasRouter(project) || !hasRouter(upstreamL0)) { return null; }
  const upstream = new Set(h2Headings(upstreamL0).map(h => h.toLowerCase()));
  const moved: LegacyMigrationPlan['moved'] = [];
  const projectOwn: string[] = [];
  for (const heading of h2Headings(project)) {
    const home = LEGACY_HEADING_HOMES.find(h => h.match.test(heading));
    if (home) { moved.push({ heading, home: home.home }); }
    else if (!upstream.has(heading.toLowerCase())) { projectOwn.push(heading); }
  }
  return { moved, projectOwn };
}

/** One evidence line + the saved-file note for the migration row. */
export function legacyMigrationRow(plan: LegacyMigrationPlan): { evidence: string, note: string } {
  const own = plan.projectOwn.length > 0
    ? `${plan.projectOwn.length} heading(s) are this project's own and move to ${PROJECT_INSTRUCTIONS}: ${plan.projectOwn.map(h => `"${h}"`).join(', ')}`
    : `no heading is this project's own; project-specific prose inside the old sections moves to ${PROJECT_INSTRUCTIONS}`;
  const evidence = [
    'informational: AGENTS.md predates progressive disclosure (no ROUTER); upstream ships a short always-on L0 plus the sections in .agents/instructions/, which this sync delivered',
    `${plan.moved.length} old heading(s) now live in a section and arrive synced from here on`,
    own,
    'merge = replace AGENTS.md with upstream\'s L0, then copy this project\'s own rules into project.md (the map is in the saved file); AGENTS.md is never rewritten by the updater',
  ].join('; ');
  const note = [
    'Where each heading of this AGENTS.md lives now (sections are under .agents/instructions/):',
    '',
    '| Old heading | New home |',
    '|---|---|',
    ...plan.moved.map(m => `| ${m.heading} | ${m.home} |`),
    ...plan.projectOwn.map(h => `| ${h} | \`project.md\` (this project's own) |`),
    '',
    'After the move, `bun run instructions:check` proves the new L0 is routed and under budget.',
  ].join('\n');
  return { evidence, note };
}

/**
 * Read both `AGENTS.md` copies and return the migration row, or null when
 * there is nothing to migrate (already split, upstream not split, a copy
 * missing).
 */
export function runLegacyMigrationCheck(root: string, upstreamDir: string): { evidence: string, note: string } | null {
  const local = path.join(root, 'AGENTS.md');
  const upstream = path.join(upstreamDir, 'AGENTS.md');
  if (!fs.existsSync(local) || !fs.existsSync(upstream)) { return null; }
  const plan = legacyMigrationPlan(fs.readFileSync(local, 'utf8'), fs.readFileSync(upstream, 'utf8'));
  return plan ? legacyMigrationRow(plan) : null;
}
