/**
 * Documentation contracts: the region markers and the range check behind
 * `scripts/lint-doc-contracts.ts` (ADR-0016).
 *
 * A region of code that a human page describes in prose is wrapped in two
 * comment lines, Google's `LINT.IfChange` / `LINT.ThenChange` syntax, so any
 * model reading the file already knows what they mean:
 *
 *   (comment) LINT.IfChange(<label>)
 *   ... the code the pages describe ...
 *   (comment) LINT.ThenChange(<path>[#anchor], <path>[#anchor], ...)
 *
 * A marker is recognised only when it is the WHOLE content of a comment line
 * (`//`, `#`, `<!-- -->`, `/* *\/`, a JSDoc `*`, `--`, `;`), and never inside a
 * fenced block of a Markdown file. That is what lets prose, tests and docs
 * talk about the syntax without declaring a region.
 *
 * The range check: for every region whose CONTENT lines a change touches,
 * every `ThenChange` target file must change in the same range, unless a
 * commit in the range carries `Docs-Checked: <label> <reason>`. "Every", not
 * "any": updating the one obvious page and missing its parallel copies is the
 * drift this exists for. A region that did not exist at the base of the range
 * is new and cannot be violated by the change that creates it. Targets are
 * checked at FILE level; the `#anchor` is for the reader.
 *
 * Kept free of `cli/` state on purpose: the edit-time hook
 * (`.agents/hooks/doc-contracts.mjs`) carries its own dependency-free copy of
 * `parseContracts`, and `scripts/lib/doc-contracts.test.ts` asserts the two
 * read every seeded file the same way.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMaintainerCopy, isSchemaOwner } from '../../cli/lib/agents-schema.ts';

export interface ContractTarget {
  path: string
  anchor: string | null
}

export interface ContractRegion {
  file: string
  label: string
  /** 1-based line of the `IfChange` marker. */
  start: number
  /** 1-based line of the `ThenChange` marker. */
  end: number
  targets: ContractTarget[]
}

export interface ContractFinding {
  file: string
  line: number
  detail: string
}

/** The trailer that acknowledges a region whose docs still hold. */
export const DOCS_CHECKED_TRAILER = 'Docs-Checked';

const COMMENT_OPEN = String.raw`^\s*(?:\/{2,}|#+|<!--|\/\*+|\*|--|;+)\s*`;
const COMMENT_CLOSE = String.raw`\s*(?:(?:-->|\*\/)\s*)?$`;
const IF_CHANGE = new RegExp(`${COMMENT_OPEN}LINT\\.IfChange\\(([^)]*)\\)${COMMENT_CLOSE}`);
const THEN_CHANGE = new RegExp(`${COMMENT_OPEN}LINT\\.ThenChange\\(([^)]*)\\)${COMMENT_CLOSE}`);
const FENCE = /^\s*(?:```|~~~)/;
export const LABEL = /^[a-z0-9][a-z0-9-]*$/;
const ACK = new RegExp(`^${DOCS_CHECKED_TRAILER}:[ \\t]*(\\S+)(?:[ \\t]+(\\S.*))?$`);

/** Split a `ThenChange` argument list into repo-relative targets. */
export function parseTargets(raw: string): ContractTarget[] {
  return raw.split(',').map(t => t.trim()).filter(Boolean).map((t) => {
    const clean = t.replace(/^\/\//, '');
    const hash = clean.indexOf('#');
    return hash === -1
      ? { path: clean, anchor: null }
      : { path: clean.slice(0, hash), anchor: clean.slice(hash + 1) || null };
  });
}

/** Every region in one file, plus the marker problems found while reading it. */
export function parseContracts(file: string, text: string): { regions: ContractRegion[], findings: ContractFinding[] } {
  const regions: ContractRegion[] = [];
  const findings: ContractFinding[] = [];
  const markdown = file.endsWith('.md');
  let fenced = false;
  let open: { label: string, line: number } | null = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (markdown && FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) { continue; }
    const ifMatch = IF_CHANGE.exec(line);
    if (ifMatch) {
      if (open) {
        findings.push({ file, line: open.line, detail: `LINT.IfChange(${open.label}) has no LINT.ThenChange before the next LINT.IfChange` });
      }
      const label = ifMatch[1].trim();
      if (!LABEL.test(label)) {
        findings.push({ file, line: i + 1, detail: `LINT.IfChange label "${label}" must be kebab-case (a-z, 0-9, -)` });
      }
      open = { label, line: i + 1 };
      continue;
    }
    const thenMatch = THEN_CHANGE.exec(line);
    if (thenMatch) {
      if (!open) {
        findings.push({ file, line: i + 1, detail: 'LINT.ThenChange without a LINT.IfChange above it' });
        continue;
      }
      const targets = parseTargets(thenMatch[1]);
      if (targets.length === 0) {
        findings.push({ file, line: i + 1, detail: `LINT.ThenChange of region "${open.label}" names no target` });
      }
      regions.push({ file, label: open.label, start: open.line, end: i + 1, targets });
      open = null;
    }
  }
  if (open) {
    findings.push({ file, line: open.line, detail: `LINT.IfChange(${open.label}) is never closed by a LINT.ThenChange` });
  }
  return { regions, findings };
}

// ============================================================================
// WHO IT BINDS — maintainers only in v1
// ============================================================================

/**
 * True only in the boilerplate's own checkout: the upstream package name AND
 * the maintainer sentinel in `.agents/project.yaml`. The markers live in synced
 * files but point at pages a downstream project owns or does not have, so v1
 * is inert downstream (ADR-0016): no structural findings, no range block.
 */
export function contractsEnforced(root: string): boolean {
  const pkg = join(root, 'package.json');
  const yaml = join(root, '.agents', 'project.yaml');
  return existsSync(pkg) && isSchemaOwner(readFileSync(pkg, 'utf8'))
    && existsSync(yaml) && isMaintainerCopy(readFileSync(yaml, 'utf8'));
}

// ============================================================================
// GIT PLUMBING
// ============================================================================

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  }
  catch { return null; }
}

/** Tracked and untracked (not ignored) files that mention a marker. */
export function markerFiles(root: string): string[] {
  const out = git(root, ['grep', '-l', '--untracked', '-F', 'LINT.', '--', '.']);
  return out ? out.split('\n').filter(Boolean) : [];
}

/** Every region in the working tree, plus every structural problem. */
export function scanContracts(root: string): { regions: ContractRegion[], findings: ContractFinding[] } {
  const regions: ContractRegion[] = [];
  const findings: ContractFinding[] = [];
  for (const file of markerFiles(root)) {
    const parsed = parseContracts(file, readFileSync(join(root, file), 'utf8'));
    regions.push(...parsed.regions);
    findings.push(...parsed.findings);
  }
  const seen = new Map<string, ContractRegion>();
  for (const region of regions) {
    const first = seen.get(region.label);
    if (first) {
      findings.push({ file: region.file, line: region.start, detail: `label "${region.label}" is already declared at ${first.file}:${first.start}; labels are repo-wide` });
    }
    else { seen.set(region.label, region); }
    for (const target of region.targets) {
      if (target.path && !existsSync(join(root, target.path))) {
        findings.push({ file: region.file, line: region.end, detail: `region "${region.label}" names a target that does not exist: ${target.path}` });
      }
    }
  }
  return { regions, findings };
}

/** The branch the range is measured against: `origin/HEAD`, else `origin/main`. */
export function defaultBaseRef(root: string): string | null {
  const head = git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])?.trim();
  if (head) { return head; }
  return git(root, ['rev-parse', '--verify', '--quiet', 'origin/main']) ? 'origin/main' : null;
}

/**
 * A changed line span on the NEW side of a diff. `count === 0` is a pure
 * deletion that sits right after line `start`.
 */
export interface Hunk {
  start: number
  count: number
}

/** New-side hunks per file from a `git diff -U0` output. */
export function parseHunks(diff: string): Map<string, Hunk[]> {
  const out = new Map<string, Hunk[]>();
  let file: string | null = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      file = path === '/dev/null' ? null : path.replace(/^b\//, '');
      if (file && !out.has(file)) { out.set(file, []); }
      continue;
    }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m && file) {
      out.get(file)!.push({ start: Number(m[1]), count: m[2] === undefined ? 1 : Number(m[2]) });
    }
  }
  return out;
}

/** Whether a hunk touches the content lines of a region (strictly between the markers). */
export function hunkTouchesRegion(hunk: Hunk, region: { start: number, end: number }): boolean {
  if (hunk.count === 0) {
    // Lines deleted right after `hunk.start`: inside when that point sits between the markers.
    return hunk.start >= region.start && hunk.start < region.end;
  }
  const last = hunk.start + hunk.count - 1;
  return hunk.start < region.end && last > region.start;
}

/** Every `Docs-Checked: <label> <reason>` in a set of commit messages, by label. */
export function parseAcks(messages: string): { acks: Map<string, string>, unreasoned: string[] } {
  const acks = new Map<string, string>();
  const unreasoned: string[] = [];
  for (const line of messages.split('\n')) {
    const m = ACK.exec(line.trim());
    if (!m) { continue; }
    if (m[2]) { acks.set(m[1], m[2].trim()); }
    else { unreasoned.push(m[1]); }
  }
  return { acks, unreasoned };
}

// ============================================================================
// THE RANGE CHECK
// ============================================================================

export interface RangeSpec {
  /** Commit the range starts after (already resolved to a merge-base when relevant). */
  base: string
  /** `HEAD`, a sha, or `:index` for the staged tree (pre-commit). */
  head: string
}

export interface Violation {
  region: ContractRegion
  missing: string[]
}

export interface RangeReport {
  touched: ContractRegion[]
  violations: Violation[]
  acknowledged: { region: ContractRegion, reason: string }[]
  unreasoned: string[]
}

function showFile(root: string, rev: string, file: string): string | null {
  return git(root, ['show', rev === ':index' ? `:${file}` : `${rev}:${file}`]);
}

/** Regions a change touches, and which of them left a target behind. */
export function checkRange(root: string, spec: RangeSpec): RangeReport {
  const staged = spec.head === ':index';
  const diffArgs = staged ? ['diff', '--cached', '-U0', '--no-color', '--no-renames'] : ['diff', '-U0', '--no-color', '--no-renames', spec.base, spec.head];
  const hunks = parseHunks(git(root, diffArgs) ?? '');

  const changed = new Set<string>(hunks.keys());
  const deleted = git(root, staged ? ['diff', '--cached', '--name-only', '--diff-filter=D'] : ['diff', '--name-only', '--diff-filter=D', spec.base, spec.head]);
  for (const f of (deleted ?? '').split('\n').filter(Boolean)) { changed.add(f); }
  if (staged) {
    // A target already changed earlier on the branch counts too.
    for (const f of (git(root, ['diff', '--name-only', spec.base, 'HEAD']) ?? '').split('\n').filter(Boolean)) { changed.add(f); }
  }

  const messages = staged ? '' : (git(root, ['log', '--format=%B', `${spec.base}..${spec.head}`]) ?? '');
  const { acks, unreasoned } = parseAcks(messages);

  const report: RangeReport = { touched: [], violations: [], acknowledged: [], unreasoned };
  for (const [file, fileHunks] of hunks) {
    const now = showFile(root, staged ? ':index' : spec.head, file);
    if (now === null || !now.includes('LINT.')) { continue; }
    const before = showFile(root, spec.base, file);
    const existed = new Set(before === null ? [] : parseContracts(file, before).regions.map(r => r.label));
    for (const region of parseContracts(file, now).regions) {
      if (!existed.has(region.label)) { continue; }
      if (!fileHunks.some(h => hunkTouchesRegion(h, region))) { continue; }
      report.touched.push(region);
      const missing = region.targets.map(t => t.path).filter(p => p && p !== file && !changed.has(p));
      if (missing.length === 0) { continue; }
      const reason = acks.get(region.label);
      if (reason) { report.acknowledged.push({ region, reason }); }
      else { report.violations.push({ region, missing }); }
    }
  }
  return report;
}

/** The message a violation prints, shared by the gate and its tests. */
export function violationText(v: Violation): string {
  return [
    `region "${v.region.label}" (${v.region.file}:${v.region.start}) changed, but these pages that describe it did not:`,
    ...v.missing.map(m => `    ${m}`),
    '  Update them in this change. If the documented behaviour did not change, add this line to a commit message in the range:',
    `    ${DOCS_CHECKED_TRAILER}: ${v.region.label} <why the pages still hold>`,
  ].join('\n');
}
