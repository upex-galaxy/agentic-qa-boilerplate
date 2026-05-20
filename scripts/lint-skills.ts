#!/usr/bin/env bun
/* eslint-disable regexp/no-super-linear-backtracking */
/**
 * lint-skills.ts — validates the T1-T4 skill tier coherence in this repo.
 *
 * Tier model (full doctrine: .claude/skills/agentic-qa-core/references/skill-composition-strategy.md)
 *   T1  — project-owned skills committed under .claude/skills/<slug>/SKILL.md
 *   T2  — vendored upstream skills committed under .claude/skills/<slug>/SKILL.md
 *         (frontmatter `vendored_from` points at the upstream source)
 *   T3  — community project-level, declared in cli/install.ts:PROJECT_LEVEL_SKILLS
 *         (gitignored, fetched at install time, NOT committed)
 *   T4  — community user-level, declared in cli/install.ts:USER_LEVEL_SKILLS
 *
 * Eight checks are run; each violation is printed prefixed with the relevant
 * skill or array name. Exit code 0 = pass (no ERROR violations), 1 = at least
 * one ERROR violation. WARN and INFO are reported but do not cause non-zero exit.
 *
 *   1. T1 frontmatter parseability — every directory under .claude/skills/
 *      either has SKILL.md with parseable YAML frontmatter, OR is the slug of
 *      a T3 community skill listed in PROJECT_LEVEL_SKILLS (in which case it
 *      might be present locally as a gitignored install artifact and is exempt).
 *      The `complementary_categories` field is strictly OPTIONAL — skills do
 *      not need to declare it. When declared, its values are audited by Check 4.
 *
 *   2. T3 PROJECT_LEVEL_SKILLS shape — every entry has both `package` (URL)
 *      and `skill` (string) fields.
 *
 *   3. T4 USER_LEVEL_SKILLS shape — every entry has both `package` and `skill`.
 *
 *   4. Category vocabulary — when a SKILL.md declares
 *      `complementary_categories` with at least one value, every cited
 *      category MUST be in the known-category allowlist (mirrors §5.1 of the
 *      strategy doc).
 *
 *   5. `framework-development` exclusivity — that skill MUST exist at
 *      .claude/skills/framework-development/SKILL.md AND be the only T1 with
 *      category `framework-evolution`.
 *
 *   6. Anti-leak — the substring `/sdd-` MUST NOT appear in the body of the
 *      four QA-workflow skills (sprint-testing, test-automation,
 *      regression-testing, test-documentation), EXCEPT inside the
 *      "Forbidden invocations" section which legitimately mentions it.
 *
 *   7. TIER-MISMATCH — skill named in CLAUDE.md §5 but absent from
 *      cli/install.ts matching tier array, or vice versa. T1 + T4 skills
 *      exempt (T1 lives in .claude/skills/; T4 is auto-discovered at runtime).
 *      WARN severity (does not fail CI).
 *
 *   8. STALE-PATH — path-like literals in inline backtick spans of T1 SKILL.md
 *      bodies (outside fenced code blocks) must resolve to existing files
 *      relative to repo root. ERROR severity.
 *
 *   9. DUPLICATE-TIER — a skill slug appearing in more than one of
 *      PROJECT_LEVEL_SKILLS, USER_LEVEL_SKILLS is an install conflict.
 *      ERROR severity.
 *
 * Usage: bun run scripts/lint-skills.ts   (or: bun run skills:check)
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
 * QA workflow skills subject to the anti-leak rule (check 6). The "Forbidden
 * invocations" section is the ONLY place where `/sdd-*` may legitimately
 * appear in their bodies.
 */
const ANTI_LEAK_SKILLS = [
  'shift-left-testing',
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
// Checks 7–10 (new)
// -----------------------------------------------------------------------------

// --- Check 7: TIER-MISMATCH ---

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
  t2Slugs: Set<string>,
  t3Slugs: Set<string>,
  t4Slugs: Set<string>,
): Violation[] {
  const result: Violation[] = [];
  const claudeNames = new Set(claudeEntries.map(e => e.name));

  // T4 USER_LEVEL_SKILLS are auto-discovered at runtime and MUST NOT appear in
  // CLAUDE.md §5 by doctrine (see skill-composition-strategy.md §10). Exclude
  // them from this check; include only T2 + T3 in the install-side set.
  const checkedSlugs = new Set<string>([...t2Slugs, ...t3Slugs]);

  // Skills in CLAUDE.md that are not T1 and not in install.ts (T2/T3).
  for (const entry of claudeEntries) {
    if (t1DirSlugs.has(entry.name)) { continue; } // T1 exempt
    if (t4Slugs.has(entry.name)) { continue; } // T4 exempt (auto-discovered)
    if (!checkedSlugs.has(entry.name)) {
      result.push({
        severity: 'WARN',
        scope: entry.name,
        msg: `TIER-MISMATCH: skill is in CLAUDE.md §5 (line ${entry.sourceLine}) but absent from cli/install.ts tier arrays`,
      });
    }
  }

  // Skills in install.ts that are not T1 and not in CLAUDE.md.
  for (const slug of checkedSlugs) {
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

// --- Check 8: STALE-PATH ---

function stripFencedCodeBlocks(md: string): string {
  return md.replace(/```[\s\S]*?```/g, '');
}

const INLINE_CODE_PATH
  = /`((?:\.claude\/skills|scripts|cli|\.agents|tests|api)\/[\w./-]+)`/g;

function checkStalePaths(
  skillSlug: string,
  skillDir: string,
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
    if (path.endsWith('/')) { continue; } // directory-shape illustration, not a file ref
    // Skill-dir-first resolution: shorthand like `scripts/foo.ts` inside a skill
    // body should resolve against the skill's own directory; fall back to repo
    // root for paths that are genuinely repo-rooted (e.g. `.claude/skills/...`).
    if (existsSync(join(skillDir, path))) { continue; }
    if (existsSync(join(repoRoot, path))) { continue; }
    result.push({
      severity: 'ERROR',
      scope: skillSlug,
      msg: `STALE-PATH: \`${path}\` referenced in SKILL.md body does not exist on disk`,
    });
  }

  return result;
}

// --- Check 10: DUPLICATE-TIER ---

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

  // T2 today is vendored (committed under .claude/skills/, surfaced via the T1
  // dir walk). The param is preserved for symmetry; populate if a future
  // install.ts-declared T2 model returns.
  addToMap(t2Slugs, 'T2_VENDORED');
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
  // T2 today is vendored (committed under .claude/skills/<slug>/ with `vendored_from`
  // frontmatter) — captured via the T1 dir walk, not via a separate install.ts array.
  // The empty Set is kept for symmetry with the DUPLICATE-TIER signature; if a
  // future T2 declared-via-install model returns, populate it here.
  const t2Slugs = new Set<string>();
  const t3Slugs = new Set<string>();
  for (const e of install.projectLevel) {
    if (e.skill) { t3Slugs.add(e.skill); }
  }
  const t4Slugs = new Set<string>();
  for (const e of install.userLevel) {
    if (e.skill) { t4Slugs.add(e.skill); }
  }

  // ---- Walk .claude/skills/ to catalog T1 skills + collect categories ----
  if (!existsSync(SKILLS_DIR)) {
    console.error(`FATAL: ${SKILLS_DIR} not found`);
    process.exit(1);
  }

  interface T1Skill {
    slug: string
    skillDir: string
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
    t1Skills.push({ slug: entry, skillDir: slugPath, skillMdPath: skillMd, frontmatter: fm, body });

    // Check 1: frontmatter must declare at least one known category.
    if (!fm) {
      if (!t3Slugs.has(entry)) {
        violation('ERROR', entry, 'SKILL.md has no parseable YAML frontmatter');
      }
      continue;
    }

    // `complementary_categories` is strictly OPTIONAL. We only audit values
    // when present-nonempty (vocabulary + framework-evolution tracking).
    // Absent and empty states are tolerated silently.
    if (fm.categoriesField.state === 'present-nonempty') {
      for (const cat of fm.categoriesField.values) {
        if (!KNOWN_CATEGORIES.has(cat)) {
          violation('ERROR', entry, `cites unknown category \`${cat}\` (not in §5.1 vocabulary)`);
        }
      }
      if (fm.categoriesField.values.includes('framework-evolution')) {
        t1WithFrameworkEvolution.push(entry);
      }
    }
  }

  // Build T1 dir slug set (available after the T1 walk).
  const t1DirSlugs = new Set<string>(t1Skills.map(s => s.slug));

  // ---- Check 2: PROJECT_LEVEL_SKILLS shape ----
  for (const [i, e] of install.projectLevel.entries()) {
    if (!e.package) { violation('ERROR', 'PROJECT_LEVEL_SKILLS', `entry #${i} missing \`package\` field`); }
    if (!e.skill) { violation('ERROR', 'PROJECT_LEVEL_SKILLS', `entry #${i} missing \`skill\` field`); }
  }

  // ---- Check 3: USER_LEVEL_SKILLS shape ----
  for (const [i, e] of install.userLevel.entries()) {
    if (!e.package) { violation('ERROR', 'USER_LEVEL_SKILLS', `entry #${i} missing \`package\` field`); }
    if (!e.skill) { violation('ERROR', 'USER_LEVEL_SKILLS', `entry #${i} missing \`skill\` field`); }
  }

  // ---- Check 5: framework-development exclusivity ----
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

  // ---- Check 6: anti-leak ----
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

  // ---- Checks 7–10 (new) ----

  // Check 7: TIER-MISMATCH
  if (!existsSync(CLAUDE_MD)) {
    violation('ERROR', '[lint-skills]', 'CLAUDE.md missing at repo root — TIER-MISMATCH check skipped');
  }
  else {
    const { entries, parseError } = parseClaudeMdSkillsRegistry(CLAUDE_MD);
    if (parseError) {
      violation('WARN', '[lint-skills]', `TIER-MISMATCH parse failure: ${parseError}`);
    }
    else {
      violations.push(...checkTierMismatch(entries, t1DirSlugs, t2Slugs, t3Slugs, t4Slugs));
    }
  }

  // Check 8: STALE-PATH
  for (const skill of t1Skills) {
    violations.push(...checkStalePaths(skill.slug, skill.skillDir, skill.body, REPO_ROOT));
  }

  // Check 9: DUPLICATE-TIER
  violations.push(...checkDuplicateTier(t2Slugs, t3Slugs, t4Slugs));

  // ---- Report ----
  const checkNames = [
    'T1 frontmatter parseability',
    'T3 PROJECT_LEVEL_SKILLS shape',
    'T4 USER_LEVEL_SKILLS shape',
    'category vocabulary (only when declared)',
    '`framework-development` exclusivity',
    'anti-leak (`/sdd-` outside Forbidden invocations)',
    'TIER-MISMATCH (CLAUDE.md §5 vs install.ts)',
    'STALE-PATH (inline-code path references in SKILL.md bodies)',
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
