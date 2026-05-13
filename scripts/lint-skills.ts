#!/usr/bin/env bun
/* eslint-disable regexp/no-super-linear-backtracking */
/**
 * lint-skills.ts — validates the T1-T4 skill tier coherence in this repo.
 *
 * Tier model (full doctrine: .claude/skills/agentic-qa-core/references/skill-composition-strategy.md)
 *   T1  — project-owned skills committed under .claude/skills/<slug>/SKILL.md
 *   T2  — gentle-ai SDD-* + helpers, declared in cli/install.ts:SKILL_SLUGS (user level)
 *   T3  — community project-level, declared in cli/install.ts:PROJECT_LEVEL_SKILLS
 *         (gitignored, fetched at install time, NOT committed)
 *   T4  — community user-level, declared in cli/install.ts:USER_LEVEL_SKILLS
 *
 * Seven checks are run; each violation is printed prefixed with the relevant
 * skill or array name. Exit code 0 = pass, 1 = at least one violation.
 *
 *   1. T1 frontmatter completeness — every directory under .claude/skills/
 *      either has SKILL.md with `complementary_categories` declaring at least
 *      one known category, OR is the slug of a T3 community skill listed in
 *      PROJECT_LEVEL_SKILLS (in which case it might be present locally as a
 *      gitignored install artifact and is exempt).
 *
 *   2. T2 SKILL_SLUGS validity — every entry in cli/install.ts:SKILL_SLUGS
 *      is a known SDD-* / meta slug (allowlist below).
 *
 *   3. T3 PROJECT_LEVEL_SKILLS shape — every entry has both `package` (URL)
 *      and `skill` (string) fields.
 *
 *   4. T4 USER_LEVEL_SKILLS shape — every entry has both `package` and `skill`.
 *
 *   5. Category vocabulary — every category cited by any SKILL.md
 *      `complementary_categories` field is in the known-category allowlist
 *      (mirrors §5.1 of the strategy doc).
 *
 *   6. `framework-development` exclusivity — that skill MUST exist at
 *      .claude/skills/framework-development/SKILL.md AND be the only T1 with
 *      category `framework-evolution`.
 *
 *   7. Anti-leak — the substring `/sdd-` MUST NOT appear in the body of the
 *      four QA-workflow skills (sprint-testing, test-automation,
 *      regression-testing, test-documentation), EXCEPT inside the
 *      "Forbidden invocations" section which legitimately mentions it.
 *
 * Usage: bun run scripts/lint-skills.ts   (or: bun run lint:skills)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dir, '..');
const SKILLS_DIR = join(REPO_ROOT, '.claude/skills');
const INSTALL_TS = join(REPO_ROOT, 'cli/install.ts');

/**
 * Authoritative category list — mirrors §5.1 of
 * .claude/skills/agentic-qa-core/references/skill-composition-strategy.md.
 * If a new category is added there, mirror it here (or refactor both to read
 * from a shared source).
 */
const KNOWN_CATEGORIES = new Set([
  'testing-e2e',
  'testing-api',
  'testing-component',
  'accessibility',
  'vcs',
  'issue-tracker',
  'tms',
  'meta-skill',
  'automation-cli',
  'ci-cd',
  'framework-evolution',
]);

/**
 * Allowed slugs for cli/install.ts:SKILL_SLUGS (T2 — gentle-ai installed).
 * SDD-* core + judgment-day + issue-creation + skill-registry.
 */
const KNOWN_T2_SLUGS = new Set([
  'sdd-init',
  'sdd-explore',
  'sdd-propose',
  'sdd-spec',
  'sdd-design',
  'sdd-tasks',
  'sdd-apply',
  'sdd-verify',
  'sdd-archive',
  'sdd-onboard',
  'skill-registry',
  'judgment-day',
  'issue-creation',
]);

/**
 * QA workflow skills subject to the anti-leak rule (check 7). The "Forbidden
 * invocations" section is the ONLY place where `/sdd-*` may legitimately
 * appear in their bodies.
 */
const ANTI_LEAK_SKILLS = [
  'sprint-testing',
  'test-automation',
  'regression-testing',
  'test-documentation',
];

const ANTI_LEAK_ALLOWED_SECTION = 'Forbidden invocations';

// -----------------------------------------------------------------------------
// Violations accumulator
// -----------------------------------------------------------------------------

const violations: string[] = [];

function violation(scope: string, msg: string): void {
  violations.push(`[${scope}] ${msg}`);
}

// -----------------------------------------------------------------------------
// Frontmatter parser — minimal, no YAML lib needed for our shape
// -----------------------------------------------------------------------------

interface SkillFrontmatter {
  name?: string
  categories: string[]
  raw: string
}

/**
 * Extracts the YAML frontmatter (between leading `---` fences) and pulls out
 * `name` and `complementary_categories`. We only need a tiny subset, so we
 * do not pull in a YAML dependency — the format we expect is:
 *
 *   ---
 *   name: foo
 *   complementary_categories: [a, b, c]
 *   ---
 *
 * If the categories field uses block-list YAML (- a / - b), we also handle
 * that; everything else is best-effort.
 */
function parseFrontmatter(content: string): SkillFrontmatter | null {
  if (!content.startsWith('---')) { return null; }
  const end = content.indexOf('\n---', 3);
  if (end === -1) { return null; }
  const block = content.slice(3, end);

  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : undefined;

  const categories: string[] = [];
  // Inline form: complementary_categories: [a, b, c]
  const inlineMatch = block.match(/^complementary_categories:\s*\[([^\]]*)\]/m);
  if (inlineMatch) {
    for (const raw of inlineMatch[1].split(',')) {
      const cat = raw.trim().replace(/^["']|["']$/g, '');
      if (cat) { categories.push(cat); }
    }
  }
  else {
    // Block form: complementary_categories:\n  - a\n  - b
    const blockMatch = block.match(/^complementary_categories:[ \t]*\n((?:[ \t]+-[ \t]+\S[^\n]*\n?)+)/m);
    if (blockMatch) {
      for (const line of blockMatch[1].split('\n')) {
        const m = line.match(/^[ \t]+-[ \t]+(.+)$/);
        if (m) { categories.push(m[1].trim().replace(/^["']|["']$/g, '')); }
      }
    }
  }

  return { name, categories, raw: block };
}

// -----------------------------------------------------------------------------
// install.ts parser — extract the three arrays we care about
// -----------------------------------------------------------------------------

interface CommunitySkillEntry {
  package?: string
  skill?: string
  raw: string
}

interface InstallTsParsed {
  skillSlugs: string[]
  projectLevel: CommunitySkillEntry[]
  userLevel: CommunitySkillEntry[]
}

/**
 * Greedy-but-scoped parse of cli/install.ts. We do not run TypeScript — we
 * just walk text looking for the three named const declarations and pull the
 * array body between `[` and the matching `]`.
 *
 * Tolerates trailing-comma + comments + multi-line entries (the actual install.ts
 * uses all three).
 */
function parseInstallTs(text: string): InstallTsParsed {
  return {
    skillSlugs: extractStringArray(text, 'SKILL_SLUGS'),
    projectLevel: extractCommunityArray(text, 'PROJECT_LEVEL_SKILLS'),
    userLevel: extractCommunityArray(text, 'USER_LEVEL_SKILLS'),
  };
}

function extractArrayBody(text: string, name: string): string | null {
  // Match: const NAME ... = [ ... ]
  // (we anchor on `const NAME` to avoid matching usages elsewhere).
  const start = text.search(new RegExp(`const\\s+${name}\\b`));
  if (start === -1) { return null; }
  const open = text.indexOf('[', start);
  if (open === -1) { return null; }
  // Walk chars to find matching `]` accounting for nesting.
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '[') { depth++; }
    else if (ch === ']') {
      depth--;
      if (depth === 0) { return text.slice(open + 1, i); }
    }
  }
  return null;
}

function extractStringArray(text: string, name: string): string[] {
  const body = extractArrayBody(text, name);
  if (body === null) { return []; }
  const out: string[] = [];
  // Match string literals 'foo' or "foo" anywhere in the body (line-comments + trailing commas are fine).
  const re = /['"]([^'"]+)['"]/g;
  for (const match of body.matchAll(re)) { out.push(match[1]); }
  return out;
}

function extractCommunityArray(text: string, name: string): CommunitySkillEntry[] {
  const body = extractArrayBody(text, name);
  if (body === null) { return []; }
  const out: CommunitySkillEntry[] = [];
  // Each entry is an object literal {...}. Walk depth to slice them.
  let depth = 0;
  let start = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{') {
      if (depth === 0) { start = i; }
      depth++;
    }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const obj = body.slice(start, i + 1);
        out.push(parseObjectLiteral(obj));
        start = -1;
      }
    }
  }
  return out;
}

function parseObjectLiteral(src: string): CommunitySkillEntry {
  const entry: CommunitySkillEntry = { raw: src };
  const pkgMatch = src.match(/package\s*:\s*['"]([^'"]+)['"]/);
  if (pkgMatch) { entry.package = pkgMatch[1]; }
  const skillMatch = src.match(/skill\s*:\s*['"]([^'"]+)['"]/);
  if (skillMatch) { entry.skill = skillMatch[1]; }
  return entry;
}

// -----------------------------------------------------------------------------
// Anti-leak section-aware grep
// -----------------------------------------------------------------------------

/**
 * Returns true if `/sdd-` appears in the body of `content` outside of the
 * "Forbidden invocations" H2 section. Frontmatter (between leading `---`
 * fences) is also excluded because category names there are inert.
 */
function hasAntiLeakViolation(content: string): boolean {
  // Strip frontmatter.
  let body = content;
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3);
    if (end !== -1) { body = body.slice(end + 4); }
  }

  // Split into sections by H2 headers (lines starting with "## ").
  const lines = body.split('\n');
  const sections: Array<{ header: string, content: string }> = [];
  let currentHeader = '';
  let currentLines: string[] = [];
  for (const line of lines) {
    const m = line.match(/^##[ \t]+(.+?)[ \t]*$/);
    if (m) {
      // Push the previous section.
      sections.push({ header: currentHeader, content: currentLines.join('\n') });
      currentHeader = m[1];
      currentLines = [];
    }
    else {
      currentLines.push(line);
    }
  }
  sections.push({ header: currentHeader, content: currentLines.join('\n') });

  for (const sec of sections) {
    if (sec.header.toLowerCase().includes(ANTI_LEAK_ALLOWED_SECTION.toLowerCase())) {
      continue;
    }
    if (sec.content.includes('/sdd-')) {
      return true;
    }
  }
  return false;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main(): void {
  // ---- Load and parse install.ts ----
  if (!existsSync(INSTALL_TS)) {
    console.error(`FATAL: ${INSTALL_TS} not found`);
    process.exit(1);
  }
  const installText = readFileSync(INSTALL_TS, 'utf8');
  const install = parseInstallTs(installText);

  // ---- Build T3 slug exemption set (Check 1) ----
  const t3Slugs = new Set<string>();
  for (const e of install.projectLevel) {
    if (e.skill) { t3Slugs.add(e.skill); }
  }

  // ---- Walk .claude/skills/ to catalog T1 skills + collect categories ----
  if (!existsSync(SKILLS_DIR)) {
    console.error(`FATAL: ${SKILLS_DIR} not found`);
    process.exit(1);
  }

  interface T1Skill {
    slug: string
    skillMdPath: string
    frontmatter: SkillFrontmatter | null
  }
  const t1Skills: T1Skill[] = [];
  const t1WithFrameworkEvolution: string[] = [];

  for (const entry of readdirSync(SKILLS_DIR)) {
    const slugPath = join(SKILLS_DIR, entry);
    if (!statSync(slugPath).isDirectory()) { continue; }

    const skillMd = join(slugPath, 'SKILL.md');
    if (!existsSync(skillMd)) {
      // Check 1: directory present without SKILL.md → exempt only if T3.
      if (!t3Slugs.has(entry)) {
        violation(entry, 'directory has no SKILL.md and is not a T3 community skill');
      }
      continue;
    }

    const content = readFileSync(skillMd, 'utf8');
    const fm = parseFrontmatter(content);
    t1Skills.push({ slug: entry, skillMdPath: skillMd, frontmatter: fm });

    // Check 1: frontmatter must declare at least one known category.
    if (!fm) {
      if (!t3Slugs.has(entry)) {
        violation(entry, 'SKILL.md has no parseable YAML frontmatter');
      }
      continue;
    }

    if (fm.categories.length === 0) {
      if (!t3Slugs.has(entry)) {
        violation(entry, 'SKILL.md frontmatter has no `complementary_categories` field (or it is empty)');
      }
    }
    else {
      // Check 5: all cited categories must be in the known vocabulary.
      for (const cat of fm.categories) {
        if (!KNOWN_CATEGORIES.has(cat)) {
          violation(entry, `cites unknown category \`${cat}\` (not in §5.1 vocabulary)`);
        }
      }
      // Track who claims framework-evolution (Check 6).
      if (fm.categories.includes('framework-evolution')) {
        t1WithFrameworkEvolution.push(entry);
      }
    }
  }

  // ---- Check 2: SKILL_SLUGS validity ----
  for (const slug of install.skillSlugs) {
    if (!KNOWN_T2_SLUGS.has(slug)) {
      violation('SKILL_SLUGS', `unknown T2 slug \`${slug}\` (allowlist: SDD-*, skill-registry, judgment-day, issue-creation)`);
    }
  }

  // ---- Check 3: PROJECT_LEVEL_SKILLS shape ----
  for (const [i, e] of install.projectLevel.entries()) {
    if (!e.package) { violation('PROJECT_LEVEL_SKILLS', `entry #${i} missing \`package\` field`); }
    if (!e.skill) { violation('PROJECT_LEVEL_SKILLS', `entry #${i} missing \`skill\` field`); }
  }

  // ---- Check 4: USER_LEVEL_SKILLS shape ----
  for (const [i, e] of install.userLevel.entries()) {
    if (!e.package) { violation('USER_LEVEL_SKILLS', `entry #${i} missing \`package\` field`); }
    if (!e.skill) { violation('USER_LEVEL_SKILLS', `entry #${i} missing \`skill\` field`); }
  }

  // ---- Check 6: framework-development exclusivity ----
  const fwDev = t1Skills.find(s => s.slug === 'framework-development');
  if (!fwDev) {
    violation('framework-development', 'expected T1 skill at .claude/skills/framework-development/SKILL.md not found');
  }
  else if (!fwDev.frontmatter?.categories.includes('framework-evolution')) {
    violation('framework-development', 'must declare category `framework-evolution` in frontmatter');
  }
  if (t1WithFrameworkEvolution.length > 1) {
    const others = t1WithFrameworkEvolution.filter(s => s !== 'framework-development').join(', ');
    violation('framework-evolution', `category MUST be exclusive to \`framework-development\`; also claimed by: ${others}`);
  }

  // ---- Check 7: anti-leak ----
  for (const slug of ANTI_LEAK_SKILLS) {
    const skillMd = join(SKILLS_DIR, slug, 'SKILL.md');
    if (!existsSync(skillMd)) {
      violation(slug, 'expected workflow SKILL.md missing — anti-leak rule cannot be checked');
      continue;
    }
    const content = readFileSync(skillMd, 'utf8');
    if (hasAntiLeakViolation(content)) {
      violation(slug, 'body contains `/sdd-` outside the "Forbidden invocations" section');
    }
  }

  // ---- Report ----
  const checkNames = [
    'T1 frontmatter completeness',
    'T2 SKILL_SLUGS validity',
    'T3 PROJECT_LEVEL_SKILLS shape',
    'T4 USER_LEVEL_SKILLS shape',
    'category vocabulary',
    '`framework-development` exclusivity',
    'anti-leak (`/sdd-` outside Forbidden invocations)',
  ];

  if (violations.length === 0) {
    console.log(`✓ lint:skills passed (${checkNames.length}/${checkNames.length} checks)`);
    console.log('  Checks run:');
    for (const c of checkNames) { console.log(`    - ${c}`); }
    process.exit(0);
  }
  else {
    console.error(`✗ lint:skills failed: ${violations.length} violation(s)`);
    for (const v of violations) { console.error(`  - ${v}`); }
    console.error('');
    console.error('  Doctrine: .claude/skills/agentic-qa-core/references/skill-composition-strategy.md');
    process.exit(1);
  }
}

main();
