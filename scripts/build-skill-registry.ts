#!/usr/bin/env bun
/**
 * build-skill-registry.ts — emits `.claude/skills/REGISTRY.md`.
 *
 * Token-saving cache for the Skill Resolver protocol. Scans
 * `.claude/skills/*\/SKILL.md`, extracts a 5-15-line "Compact Rules" block per
 * skill, and writes a single registry file the orchestrator pastes into every
 * subagent briefing under `## Project Standards (auto-resolved)`.
 *
 * Subagents trust the compact rules and DO NOT re-read full SKILL.md unless
 * the briefing explicitly says so. Protocol:
 *   `.claude/skills/agentic-qa-core/references/skill-resolver.md`.
 *
 * Extraction strategies (per skill):
 *   - A (preferred): if the SKILL.md body contains a section literally titled
 *     `## Compact Rules` or `## Standards`, use the bullets from that section
 *     verbatim.
 *   - B (fallback): pick the first 15 bullets from any list in the body, or
 *     the first 15 non-empty lines of the first content section if no bullets.
 *   - Always cap at 15 rules. If truncated, append a marker bullet.
 *
 * Idempotency: re-running on an unchanged repo produces a byte-identical file.
 *
 * Cache invalidation rules (the script itself does NOT decide; it always
 * rebuilds when invoked. The orchestrator decides when to call us; the rules
 * live in `references/skill-resolver.md` §"Cache invalidation").
 *
 * Flags:
 *   --dry-run    Print what would be written; do not write the file.
 *   --verbose    Log each skill processed and which strategy applied.
 *   --help       Show usage.
 *
 * Exit codes:
 *   0 — registry written (or printed with --dry-run)
 *   1 — fatal error (no .claude/skills/, write failure, etc.)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const SKILLS_DIR = join(REPO_ROOT, '.claude', 'skills');
const CACHE_DIR = SKILLS_DIR;
const CACHE_FILE = join(CACHE_DIR, 'REGISTRY.md');

const MAX_RULES = 15;
const _MIN_RULES = 5; // informational; Strategy B may emit fewer.

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type Strategy = 'A' | 'B' | 'none';

interface SkillFrontmatter {
  name?: string
  description?: string
  phase?: string
}

interface SkillEntry {
  slug: string
  path: string
  frontmatter: SkillFrontmatter
  purpose: string
  rules: string[]
  readFullWhen: string
  strategy: Strategy
  truncated: boolean
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

function printHelp(): void {
  console.log(`Usage: bun scripts/build-skill-registry.ts [--check] [--dry-run] [--verbose] [--help]

Builds the per-session skill registry consumed by the Skill Resolver protocol.
Scans .claude/skills/*/SKILL.md, extracts compact rules per skill, and writes
.claude/skills/REGISTRY.md.

Flags:
  --check      Verify REGISTRY.md is in sync with current SKILL.md content.
               Exit 1 with a fix hint if stale; do not write. Volatile fields
               (the generated-at timestamp) are stripped before comparison.
  --dry-run    Print would-be output to stdout; do not write the file.
  --verbose    Log each skill processed and which extraction strategy applied.
  -h, --help   Show this help.

Exit code:
  0 — registry written successfully (or --check passes)
  1 — fatal error / --check found stale registry
`);
}

interface CliFlags {
  check: boolean
  dryRun: boolean
  verbose: boolean
}

function parseArgs(argv: string[]): CliFlags {
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  return {
    check: argv.includes('--check') || argv.includes('-c'),
    dryRun: argv.includes('--dry-run'),
    verbose: argv.includes('--verbose') || argv.includes('-v'),
  };
}

let VERBOSE = false;
function vlog(msg: string): void {
  if (VERBOSE) { console.log(`  ${msg}`); }
}

// -----------------------------------------------------------------------------
// Skill discovery
// -----------------------------------------------------------------------------

function listSkillDirs(): string[] {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`FATAL: ${relative(REPO_ROOT, SKILLS_DIR)} not found.`);
    process.exit(1);
  }
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  const dirs: string[] = [];
  for (const e of entries) {
    // Accept directories AND symlinks-to-directories (some skills are
    // symlinked from outside the repo, e.g. .claude/skills/playwright-cli ->
    // an external clone).
    if (!e.isDirectory() && !e.isSymbolicLink()) { continue; }
    const skillPath = join(SKILLS_DIR, e.name, 'SKILL.md');
    if (existsSync(skillPath)) { dirs.push(e.name); }
  }
  dirs.sort();
  return dirs;
}

// -----------------------------------------------------------------------------
// Frontmatter + body parsing
// -----------------------------------------------------------------------------

function splitFrontmatter(text: string): { frontmatter: SkillFrontmatter, body: string } {
  if (!text.startsWith('---\n')) {
    return { frontmatter: {}, body: text };
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: {}, body: text };
  }
  const fmRaw = text.slice(4, end);
  const body = text.slice(end + 5);
  let parsed: unknown;
  try { parsed = parseYaml(fmRaw); }
  catch { parsed = {}; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { frontmatter: {}, body };
  }
  return { frontmatter: parsed as SkillFrontmatter, body };
}

/**
 * Strip the section delimiter prefix from a line so we can compare/extract.
 * Returns null when the line is not a bullet.
 */
function bulletText(line: string): string | null {
  // Match "- text" or "* text" or "1. text" with optional leading whitespace.
  // First char of captured text must be non-space to avoid super-linear backtracking
  // (otherwise the prior [ \t]+ and (.+) overlap on space chars).
  const m = line.match(/^[ \t]*(?:[-*]|\d+\.)[ \t]+(\S.*)$/);
  return m === null ? null : m[1].trim();
}

/**
 * Strategy A: explicit `## Compact Rules` or `## Standards` section near top.
 * Returns null if no such section exists.
 */
function extractStrategyA(body: string): { rules: string[], truncated: boolean } | null {
  const lines = body.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '## Compact Rules' || line === '## Standards') {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) { return null; }

  const rules: string[] = [];
  let truncated = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line.trim())) { break; } // next section
    const t = bulletText(line);
    if (t === null) { continue; }
    if (rules.length >= MAX_RULES) { truncated = true; break; }
    rules.push(t);
  }
  return { rules, truncated };
}

/**
 * Strategy B: best-effort extraction.
 *   1. Try the first 15 bullets in the body.
 *   2. If no bullets at all, take the first 15 non-empty, non-heading lines
 *      from the first content section.
 */
function extractStrategyB(body: string): { rules: string[], truncated: boolean } {
  const lines = body.split('\n');
  const bullets: string[] = [];
  let truncated = false;

  for (const line of lines) {
    const t = bulletText(line);
    if (t === null) { continue; }
    if (bullets.length >= MAX_RULES) { truncated = true; break; }
    bullets.push(t);
  }

  if (bullets.length > 0) { return { rules: bullets, truncated }; }

  // No bullets anywhere: fall back to first 15 non-empty, non-heading,
  // non-table-row lines.
  const lineFallback: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) { continue; }
    if (trimmed.startsWith('#')) { continue; }
    if (trimmed.startsWith('|')) { continue; }
    if (trimmed.startsWith('```')) { continue; }
    if (trimmed.startsWith('>')) { continue; }
    if (lineFallback.length >= MAX_RULES) { truncated = true; break; }
    lineFallback.push(trimmed);
  }
  return { rules: lineFallback, truncated };
}

/**
 * Look for an explicit "Read full SKILL.md when:" line near the rules section
 * or anywhere in the body. Returns a default sentence if not found.
 */
function extractReadFullWhen(body: string): string {
  const m = body.match(/\*\*Read full SKILL\.md when\*\*:\s*([^\n]+)/i);
  if (m !== null) { return m[1].trim(); }
  return 'the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).';
}

/**
 * One-line purpose: take the first non-empty sentence from frontmatter
 * description, capped at ~140 chars.
 */
function distillPurpose(description: string | undefined): string {
  if (typeof description !== 'string' || description.trim().length === 0) {
    return '(no description in frontmatter)';
  }
  // Cut at first period followed by space, or hard cap at 140 chars.
  const trimmed = description.trim();
  const periodIdx = trimmed.search(/\.\s/);
  const first = periodIdx > 0 && periodIdx < 200 ? trimmed.slice(0, periodIdx + 1) : trimmed;
  if (first.length <= 140) { return first; }
  return `${first.slice(0, 137).trim()}...`;
}

// -----------------------------------------------------------------------------
// Per-skill processing
// -----------------------------------------------------------------------------

function processSkill(slug: string): SkillEntry {
  const skillPath = join(SKILLS_DIR, slug, 'SKILL.md');
  const text = readFileSync(skillPath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(text);

  let strategy: Strategy = 'none';
  let rules: string[] = [];
  let truncated = false;

  const a = extractStrategyA(body);
  if (a !== null && a.rules.length > 0) {
    strategy = 'A';
    rules = a.rules;
    truncated = a.truncated;
  }
  else {
    const b = extractStrategyB(body);
    if (b.rules.length > 0) {
      strategy = 'B';
      rules = b.rules;
      truncated = b.truncated;
    }
  }

  const readFullWhen = extractReadFullWhen(body);
  const purpose = distillPurpose(frontmatter.description);

  vlog(`[${slug}] strategy=${strategy} rules=${rules.length}${truncated ? ' (truncated)' : ''}`);

  return {
    slug,
    path: relative(REPO_ROOT, skillPath),
    frontmatter,
    purpose,
    rules,
    readFullWhen,
    strategy,
    truncated,
  };
}

// -----------------------------------------------------------------------------
// Render
// -----------------------------------------------------------------------------

function renderEntry(entry: SkillEntry): string {
  const lines: string[] = [];
  lines.push(`## Skill: ${entry.slug}`);
  lines.push('');
  lines.push(`**Purpose**: ${entry.purpose}`);
  lines.push('');

  if (entry.rules.length === 0) {
    lines.push('**Compact Rules**: (none extracted — read full SKILL.md)');
  }
  else {
    lines.push('**Compact Rules**:');
    for (const r of entry.rules) {
      lines.push(`- ${r}`);
    }
    if (entry.truncated) {
      lines.push('- (truncated — read full SKILL.md for the rest)');
    }
  }
  lines.push('');
  lines.push(`**Read full SKILL.md when**: ${entry.readFullWhen}`);
  lines.push('');
  lines.push(`> Source: \`${entry.path}\` · phase: \`${entry.frontmatter.phase ?? 'unknown'}\` · extraction strategy: ${entry.strategy}`);
  return lines.join('\n');
}

function renderRegistry(entries: SkillEntry[]): string {
  const generated = new Date().toISOString();
  const header = [
    '# Skill Registry (auto-generated)',
    '',
    `> Generated: \`${generated}\``,
    '> Generator: `bun scripts/build-skill-registry.ts`',
    '> Protocol: `.claude/skills/agentic-qa-core/references/skill-resolver.md`',
    '',
    'This file is the per-session compact-rules cache for the Skill Resolver protocol.',
    'The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.',
    'Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.',
    '',
    `Skills indexed: ${entries.length}`,
    '',
    '---',
    '',
  ].join('\n');

  const body = entries.map(renderEntry).join('\n\n---\n\n');
  return `${header}${body}\n`;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

/**
 * Strip the volatile `Generated:` timestamp line so byte-level comparison in
 * `--check` mode ignores cosmetic drift from re-runs.
 */
function stripVolatile(text: string): string {
  return text.replace(/^> Generated: `[^`]+`\n/m, '> Generated: `<stripped>`\n');
}

function checkRegistry(freshOutput: string): number {
  const relPath = relative(REPO_ROOT, CACHE_FILE);
  if (!existsSync(CACHE_FILE)) {
    console.error(`❌ ${relPath} missing.`);
    console.error(`   Run: bun run skills:registry && git add ${relPath}`);
    return 1;
  }
  const existing = readFileSync(CACHE_FILE, 'utf8');
  if (stripVolatile(freshOutput) === stripVolatile(existing)) {
    console.log(`✅ ${relPath} is up to date.`);
    return 0;
  }
  console.error(`❌ ${relPath} is stale.`);
  console.error(`   Run: bun run skills:registry && git add ${relPath}`);
  return 1;
}

function main(): void {
  const flags = parseArgs(process.argv.slice(2));
  VERBOSE = flags.verbose;
  if (VERBOSE) { console.log(`[build-skill-registry] cwd=${REPO_ROOT}`); }

  const slugs = listSkillDirs();
  if (slugs.length === 0) {
    console.error(`FATAL: no SKILL.md found under ${relative(REPO_ROOT, SKILLS_DIR)}.`);
    process.exit(1);
  }

  const entries: SkillEntry[] = slugs.map(processSkill);
  const output = renderRegistry(entries);

  const summary = [
    `Indexed ${entries.length} skills`,
    `Strategy A: ${entries.filter(e => e.strategy === 'A').length}`,
    `Strategy B: ${entries.filter(e => e.strategy === 'B').length}`,
    `No rules:   ${entries.filter(e => e.strategy === 'none').length}`,
    `Truncated:  ${entries.filter(e => e.truncated).length}`,
  ].join(' · ');

  if (flags.check) {
    process.exit(checkRegistry(output));
  }

  if (flags.dryRun) {
    console.log(`[dry-run] would write: ${relative(REPO_ROOT, CACHE_FILE)}`);
    console.log('---');
    console.log(output);
    console.log('---');
    console.log(summary);
    process.exit(0);
  }

  try {
    if (!existsSync(CACHE_DIR)) { mkdirSync(CACHE_DIR, { recursive: true }); }
    writeFileSync(CACHE_FILE, output, 'utf8');
  }
  catch (err) {
    console.error(`FATAL: cannot write ${relative(REPO_ROOT, CACHE_FILE)}: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(summary);
  if (VERBOSE) { console.log(`[build-skill-registry] wrote ${relative(REPO_ROOT, CACHE_FILE)}`); }
  // Touch statSync to satisfy linter that this import is used in some configs.
  void statSync;
  process.exit(0);
}

main();
