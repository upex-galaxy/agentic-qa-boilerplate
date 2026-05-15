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
 * Eleven checks are run; each violation is printed prefixed with the relevant
 * skill or array name. Exit code 0 = pass (no ERROR violations), 1 = at least
 * one ERROR violation. WARN and INFO are reported but do not cause non-zero exit.
 *
 *   1. T1 frontmatter completeness — every directory under .claude/skills/
 *      either has SKILL.md with `complementary_categories` declaring at least
 *      one known category, OR is the slug of a T3 community skill listed in
 *      PROJECT_LEVEL_SKILLS (in which case it might be present locally as a
 *      gitignored install artifact and is exempt).
 *      Check 1 now discriminates absent vs empty-list:
 *        - field absent → ERROR (unchanged)
 *        - field present but empty [] → INFO EMPTY-CATS (new)
 *        - field present with values → proceed to Check 5
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
 *   8. TIER-MISMATCH — skill named in CLAUDE.md §5 but absent from
 *      cli/install.ts matching tier array, or vice versa. T1 skills exempt.
 *      WARN severity (does not fail CI).
 *
 *   9. STALE-PATH — path-like literals in inline backtick spans of T1 SKILL.md
 *      bodies (outside fenced code blocks) must resolve to existing files
 *      relative to repo root. ERROR severity.
 *
 *  10. EMPTY-CATS — handled inline in Check 1 state switch (see above).
 *
 *  11. DUPLICATE-TIER — a skill slug appearing in more than one of SKILL_SLUGS,
 *      PROJECT_LEVEL_SKILLS, USER_LEVEL_SKILLS is an install conflict.
 *      ERROR severity.
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
const CLAUDE_MD = join(REPO_ROOT, 'CLAUDE.md');

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

type Severity = 'ERROR' | 'WARN' | 'INFO';

interface Violation {
  severity: Severity
  scope: string
  msg: string
}

const violations: Violation[] = [];

function violation(severity: Severity, scope: string, msg: string): void {
  violations.push({ severity, scope, msg });
}

const SEVERITY_COLORS: Record<Severity, string> = {
  ERROR: '\x1B[31m',
  WARN: '\x1B[33m',
  INFO: '\x1B[34m',
};

function renderViolation(v: Violation): string {
  const c = SEVERITY_COLORS[v.severity];
  return `  ${c}[${v.severity}]\x1B[0m [${v.scope}] ${v.msg}`;
}

function exitCode(vs: Violation[]): 0 | 1 {
  return vs.some(v => v.severity === 'ERROR') ? 1 : 0;
}

// -----------------------------------------------------------------------------
// Frontmatter parser — minimal, no YAML lib needed for our shape
// -----------------------------------------------------------------------------

type CategoriesField
  = { state: 'missing' }
    | { state: 'present-empty' }
    | { state: 'present-nonempty', values: string[] };

interface SkillFrontmatter {
  name?: string
  categoriesField: CategoriesField
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
 *
 * The `categoriesField` discriminated union distinguishes:
 *   - 'missing'          → key not present in frontmatter at all
 *   - 'present-empty'    → key present but value is an empty list []
 *   - 'present-nonempty' → key present with at least one value
 */
function parseFrontmatter(content: string): SkillFrontmatter | null {
  if (!content.startsWith('---')) { return null; }
  const end = content.indexOf('\n---', 3);
  if (end === -1) { return null; }
  const block = content.slice(3, end);

  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : undefined;

  const hasKey = block.includes('complementary_categories:');

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

  let categoriesField: CategoriesField;
  if (!hasKey) {
    categoriesField = { state: 'missing' };
  }
  else if (categories.length === 0) {
    categoriesField = { state: 'present-empty' };
  }
  else {
    categoriesField = { state: 'present-nonempty', values: categories };
  }

  return { name, categoriesField, raw: block };
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
// Checks 8–11 (new)
// -----------------------------------------------------------------------------

// --- Check 8: TIER-MISMATCH ---

interface ClaudeMdSkillEntry {
  name: string
  sourceLine: number
}

const CLAUDE_MD_SKILL_ROW = /^\|\s*`([\w-]+)`\s*\|/;
const CLAUDE_MD_H2 = /^## (.+)$/;

/**
 * Detects whether an H2 heading line belongs to §5 (Skills registry).
 * Matches headings that start with "5." or are exactly "5" followed by
 * optional punctuation/whitespace, e.g.:
 *   "5. SKILLS + COMMANDS + MCPs REGISTRY"
 *   "5 Skills"
 */
function isSection5Heading(heading: string): boolean {
  return /^5[.\s]/.test(heading.trim());
}

function parseClaudeMdSkillsRegistry(claudeMdPath: string): {
  entries: ClaudeMdSkillEntry[]
  parseError?: string
} {
  const text = readFileSync(claudeMdPath, 'utf8');
  const lines = text.split('\n');
  const entries: ClaudeMdSkillEntry[] = [];

  // Walk lines tracking the current H2 section. Only collect skill-row matches
  // when the nearest preceding H2 heading is §5 (Skills registry). This prevents
  // the regex from matching table rows in other sections (e.g., §11 git-branches
  // table which has | `main` | and | `staging` | rows).
  let inSection5 = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const h2Match = line.match(CLAUDE_MD_H2);
    if (h2Match) {
      inSection5 = isSection5Heading(h2Match[1]);
      continue;
    }

    if (!inSection5) { continue; }

    const rowMatch = line.match(CLAUDE_MD_SKILL_ROW);
    if (rowMatch) {
      entries.push({ name: rowMatch[1], sourceLine: i + 1 });
    }
  }

  if (entries.length === 0) {
    return {
      entries: [],
      parseError: 'CLAUDE.md §5 table extracted 0 skill rows — format may have drifted',
    };
  }
  return { entries };
}

function checkTierMismatch(
  claudeEntries: ClaudeMdSkillEntry[],
  t1DirSlugs: Set<string>,
  installKnownSlugs: Set<string>,
): Violation[] {
  const result: Violation[] = [];
  const claudeNames = new Set(claudeEntries.map(e => e.name));

  // Skills in CLAUDE.md that are not T1 and not in install.ts.
  for (const entry of claudeEntries) {
    if (t1DirSlugs.has(entry.name)) { continue; } // T1 exempt
    if (!installKnownSlugs.has(entry.name)) {
      result.push({
        severity: 'WARN',
        scope: entry.name,
        msg: `TIER-MISMATCH: skill is in CLAUDE.md §5 (line ${entry.sourceLine}) but absent from cli/install.ts tier arrays`,
      });
    }
  }

  // Skills in install.ts that are not T1 and not in CLAUDE.md.
  for (const slug of installKnownSlugs) {
    if (t1DirSlugs.has(slug)) { continue; } // T1 exempt
    if (!claudeNames.has(slug)) {
      result.push({
        severity: 'WARN',
        scope: slug,
        msg: 'TIER-MISMATCH: skill is in cli/install.ts tier arrays but absent from CLAUDE.md §5',
      });
    }
  }

  return result;
}

// --- Check 9: STALE-PATH ---

function stripFencedCodeBlocks(md: string): string {
  return md.replace(/```[\s\S]*?```/g, '');
}

const INLINE_CODE_PATH
  = /`((?:\.claude\/skills|scripts|cli|\.agents|tests|api)\/[\w./-]+)`/g;

function checkStalePaths(
  skillSlug: string,
  body: string,
  repoRoot: string,
): Violation[] {
  const result: Violation[] = [];
  const stripped = stripFencedCodeBlocks(body);

  INLINE_CODE_PATH.lastIndex = 0;
  for (const match of stripped.matchAll(INLINE_CODE_PATH)) {
    const path = match[1];
    // Skip absolute paths.
    if (path.startsWith('/')) { continue; }
    const full = join(repoRoot, path);
    if (!existsSync(full)) {
      result.push({
        severity: 'ERROR',
        scope: skillSlug,
        msg: `STALE-PATH: \`${path}\` referenced in SKILL.md body does not exist on disk`,
      });
    }
  }

  return result;
}

// --- Check 11: DUPLICATE-TIER ---

function checkDuplicateTier(
  t2Slugs: Set<string>,
  t3Slugs: Set<string>,
  t4Slugs: Set<string>,
): Violation[] {
  const result: Violation[] = [];
  const tierMap = new Map<string, string[]>();

  const addToMap = (slugs: Set<string>, tierName: string): void => {
    for (const slug of slugs) {
      const existing = tierMap.get(slug) ?? [];
      existing.push(tierName);
      tierMap.set(slug, existing);
    }
  };

  addToMap(t2Slugs, 'SKILL_SLUGS');
  addToMap(t3Slugs, 'PROJECT_LEVEL_SKILLS');
  addToMap(t4Slugs, 'USER_LEVEL_SKILLS');

  for (const [slug, tiers] of tierMap) {
    if (tiers.length > 1) {
      result.push({
        severity: 'ERROR',
        scope: slug,
        msg: `DUPLICATE-TIER: skill appears in multiple tier arrays: ${tiers.join(', ')}`,
      });
    }
  }

  return result;
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

  // ---- Build tier slug sets ----
  const t2Slugs = new Set<string>(install.skillSlugs);
  const t3Slugs = new Set<string>();
  for (const e of install.projectLevel) {
    if (e.skill) { t3Slugs.add(e.skill); }
  }
  const t4Slugs = new Set<string>();
  for (const e of install.userLevel) {
    if (e.skill) { t4Slugs.add(e.skill); }
  }
  const installKnownSlugs = new Set<string>([...t2Slugs, ...t3Slugs, ...t4Slugs]);

  // ---- Walk .claude/skills/ to catalog T1 skills + collect categories ----
  if (!existsSync(SKILLS_DIR)) {
    console.error(`FATAL: ${SKILLS_DIR} not found`);
    process.exit(1);
  }

  interface T1Skill {
    slug: string
    skillMdPath: string
    frontmatter: SkillFrontmatter | null
    body: string
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
        violation('ERROR', entry, 'directory has no SKILL.md and is not a T3 community skill');
      }
      continue;
    }

    const content = readFileSync(skillMd, 'utf8');
    // Extract body (everything after frontmatter) for STALE-PATH check.
    let body = content;
    if (body.startsWith('---')) {
      const end = body.indexOf('\n---', 3);
      if (end !== -1) { body = body.slice(end + 4); }
    }
    const fm = parseFrontmatter(content);
    t1Skills.push({ slug: entry, skillMdPath: skillMd, frontmatter: fm, body });

    // Check 1: frontmatter must declare at least one known category.
    if (!fm) {
      if (!t3Slugs.has(entry)) {
        violation('ERROR', entry, 'SKILL.md has no parseable YAML frontmatter');
      }
      continue;
    }

    // 3-way switch on categoriesField state.
    switch (fm.categoriesField.state) {
      case 'missing':
        if (!t3Slugs.has(entry)) {
          violation('ERROR', entry, 'SKILL.md frontmatter has no `complementary_categories` field');
        }
        break;
      case 'present-empty':
        if (!t3Slugs.has(entry)) {
          violation('INFO', entry, 'EMPTY-CATS: `complementary_categories` is present but empty — declare at least one §5.1 category');
        }
        break;
      case 'present-nonempty': {
        // Check 5: all cited categories must be in the known vocabulary.
        for (const cat of fm.categoriesField.values) {
          if (!KNOWN_CATEGORIES.has(cat)) {
            violation('ERROR', entry, `cites unknown category \`${cat}\` (not in §5.1 vocabulary)`);
          }
        }
        // Track who claims framework-evolution (Check 6).
        if (fm.categoriesField.values.includes('framework-evolution')) {
          t1WithFrameworkEvolution.push(entry);
        }
        break;
      }
    }
  }

  // Build T1 dir slug set (available after the T1 walk).
  const t1DirSlugs = new Set<string>(t1Skills.map(s => s.slug));

  // ---- Check 2: SKILL_SLUGS validity ----
  for (const slug of install.skillSlugs) {
    if (!KNOWN_T2_SLUGS.has(slug)) {
      violation('ERROR', 'SKILL_SLUGS', `unknown T2 slug \`${slug}\` (allowlist: SDD-*, skill-registry, judgment-day, issue-creation)`);
    }
  }

  // ---- Check 3: PROJECT_LEVEL_SKILLS shape ----
  for (const [i, e] of install.projectLevel.entries()) {
    if (!e.package) { violation('ERROR', 'PROJECT_LEVEL_SKILLS', `entry #${i} missing \`package\` field`); }
    if (!e.skill) { violation('ERROR', 'PROJECT_LEVEL_SKILLS', `entry #${i} missing \`skill\` field`); }
  }

  // ---- Check 4: USER_LEVEL_SKILLS shape ----
  for (const [i, e] of install.userLevel.entries()) {
    if (!e.package) { violation('ERROR', 'USER_LEVEL_SKILLS', `entry #${i} missing \`package\` field`); }
    if (!e.skill) { violation('ERROR', 'USER_LEVEL_SKILLS', `entry #${i} missing \`skill\` field`); }
  }

  // ---- Check 6: framework-development exclusivity ----
  const fwDev = t1Skills.find(s => s.slug === 'framework-development');
  if (!fwDev) {
    violation('ERROR', 'framework-development', 'expected T1 skill at .claude/skills/framework-development/SKILL.md not found');
  }
  else if (fwDev.frontmatter?.categoriesField.state !== 'present-nonempty'
    || !fwDev.frontmatter.categoriesField.values.includes('framework-evolution')) {
    violation('ERROR', 'framework-development', 'must declare category `framework-evolution` in frontmatter');
  }
  if (t1WithFrameworkEvolution.length > 1) {
    const others = t1WithFrameworkEvolution.filter(s => s !== 'framework-development').join(', ');
    violation('ERROR', 'framework-evolution', `category MUST be exclusive to \`framework-development\`; also claimed by: ${others}`);
  }

  // ---- Check 7: anti-leak ----
  for (const slug of ANTI_LEAK_SKILLS) {
    const skillMd = join(SKILLS_DIR, slug, 'SKILL.md');
    if (!existsSync(skillMd)) {
      violation('ERROR', slug, 'expected workflow SKILL.md missing — anti-leak rule cannot be checked');
      continue;
    }
    const content = readFileSync(skillMd, 'utf8');
    if (hasAntiLeakViolation(content)) {
      violation('ERROR', slug, 'body contains `/sdd-` outside the "Forbidden invocations" section');
    }
  }

  // ---- Checks 8–11 (new) ----

  // Check 8: TIER-MISMATCH
  if (!existsSync(CLAUDE_MD)) {
    violation('ERROR', '[lint-skills]', 'CLAUDE.md missing at repo root — TIER-MISMATCH check skipped');
  }
  else {
    const { entries, parseError } = parseClaudeMdSkillsRegistry(CLAUDE_MD);
    if (parseError) {
      violation('WARN', '[lint-skills]', `TIER-MISMATCH parse failure: ${parseError}`);
    }
    else {
      violations.push(...checkTierMismatch(entries, t1DirSlugs, installKnownSlugs));
    }
  }

  // Check 9: STALE-PATH
  for (const skill of t1Skills) {
    violations.push(...checkStalePaths(skill.slug, skill.body, REPO_ROOT));
  }

  // Check 10: EMPTY-CATS is handled inline in Check 1 state switch above.

  // Check 11: DUPLICATE-TIER
  violations.push(...checkDuplicateTier(t2Slugs, t3Slugs, t4Slugs));

  // ---- Report ----
  const checkNames = [
    'T1 frontmatter completeness (+ EMPTY-CATS discrimination)',
    'T2 SKILL_SLUGS validity',
    'T3 PROJECT_LEVEL_SKILLS shape',
    'T4 USER_LEVEL_SKILLS shape',
    'category vocabulary',
    '`framework-development` exclusivity',
    'anti-leak (`/sdd-` outside Forbidden invocations)',
    'TIER-MISMATCH (CLAUDE.md §5 vs install.ts)',
    'STALE-PATH (inline-code path references in SKILL.md bodies)',
    'EMPTY-CATS (present but empty `complementary_categories`)',
    'DUPLICATE-TIER (skill slug in multiple tier arrays)',
  ];

  if (violations.length === 0) {
    console.log(`✓ lint:skills passed (${checkNames.length}/${checkNames.length} checks)`);
    console.log('  Checks run:');
    for (const c of checkNames) { console.log(`    - ${c}`); }
    process.exit(0);
  }
  else {
    const errCount = violations.filter(v => v.severity === 'ERROR').length;
    const warnCount = violations.filter(v => v.severity === 'WARN').length;
    const infoCount = violations.filter(v => v.severity === 'INFO').length;

    console.error(`✗ lint:skills: ERROR: ${errCount}, WARN: ${warnCount}, INFO: ${infoCount}`);

    const sorted = [...violations].sort((a, b) => {
      const order: Record<Severity, number> = { ERROR: 0, WARN: 1, INFO: 2 };
      return order[a.severity] - order[b.severity];
    });

    for (const v of sorted) { console.error(renderViolation(v)); }
    console.error('');
    console.error('  Doctrine: .claude/skills/agentic-qa-core/references/skill-composition-strategy.md');
    process.exit(exitCode(violations));
  }
}

main();
