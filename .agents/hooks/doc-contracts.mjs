#!/usr/bin/env node
/**
 * @fileoverview Edit-time reminder of the documentation contracts (ADR-0016).
 *
 * Claude Code and Codex run this file as a `PostToolUse` command hook on file
 * edits (`.claude/settings.json` matcher `Edit|Write|MultiEdit`; `.codex/hooks.json`
 * matcher `Edit|Write`, which Codex maps to `apply_patch`). When the edited
 * file carries a `LINT.IfChange(label)` region and the edit lands inside it,
 * the hook adds one `DOCS:` line to the model's context naming the pages that
 * describe that region, once per session per label. The gate that enforces the
 * contract is `scripts/lint-doc-contracts.ts` at pre-push and in CI; this hook
 * only moves the reminder to the moment the edit happens.
 *
 * OpenCode registers no adapter: injecting model context from its
 * `tool.execute.after` event is not verified, so it relies on the gate alone.
 *
 * Inert outside the boilerplate's own checkout (v1 is maintainer-only): the
 * same two signals `contractsEnforced` reads, the upstream package name and
 * the maintainer sentinel in `.agents/project.yaml`. Node built-ins only, no
 * git spawn: it runs after every edit, so it has to stay in the low
 * milliseconds. `parseContracts` is a copy of the gate's grammar
 * (`scripts/lib/doc-contracts.ts`); `scripts/lib/doc-contracts.test.ts`
 * asserts both read every seeded file the same way.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const UPSTREAM_PACKAGE = 'agentic-qa-boilerplate';
const MAINTAINER_SENTINEL = '# MAINTAINER COPY:';
const COMMENT_OPEN = String.raw`^\s*(?:\/{2,}|#+|<!--|\/\*+|\*|--|;+)\s*`;
const COMMENT_CLOSE = String.raw`\s*(?:(?:-->|\*\/)\s*)?$`;
const IF_CHANGE = new RegExp(`${COMMENT_OPEN}LINT\\.IfChange\\(([^)]*)\\)${COMMENT_CLOSE}`);
const THEN_CHANGE = new RegExp(`${COMMENT_OPEN}LINT\\.ThenChange\\(([^)]*)\\)${COMMENT_CLOSE}`);
const FENCE = /^\s*(?:```|~~~)/;
const PATCH_FILE = /^\*\*\* (?:Update|Add) File: (.+)$/gm;

/** Same output as the gate's `parseContracts(...).regions`. */
export function parseContracts(file, text) {
  const regions = [];
  const markdown = file.endsWith('.md');
  let fenced = false;
  let open = null;
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
      open = { label: ifMatch[1].trim(), line: i + 1 };
      continue;
    }
    const thenMatch = THEN_CHANGE.exec(line);
    if (thenMatch && open) {
      const targets = thenMatch[1].split(',').map(t => t.trim()).filter(Boolean).map((t) => {
        const clean = t.replace(/^\/\//, '');
        const hash = clean.indexOf('#');
        return hash === -1 ? { path: clean, anchor: null } : { path: clean.slice(0, hash), anchor: clean.slice(hash + 1) || null };
      });
      regions.push({ file, label: open.label, start: open.line, end: i + 1, targets });
      open = null;
    }
  }
  return regions;
}

/** Whether this checkout is the boilerplate's own (the contracts bind only there in v1). */
export function contractsEnforced(root) {
  try {
    if (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name !== UPSTREAM_PACKAGE) { return false; }
    for (const line of readFileSync(join(root, '.agents', 'project.yaml'), 'utf8').split('\n')) {
      if (line.startsWith(MAINTAINER_SENTINEL)) { return true; }
      if (!line.startsWith('#') && line.trim() !== '') { return false; }
    }
  }
  catch { return false; }
  return false;
}

/** Every file path an edit tool call names: Claude's `file_path`, Codex's patch headers. */
export function editedPaths(toolInput) {
  const out = new Set();
  if (!toolInput || typeof toolInput !== 'object') { return []; }
  for (const key of ['file_path', 'filePath', 'path']) {
    if (typeof toolInput[key] === 'string') { out.add(toolInput[key]); }
  }
  for (const value of Object.values(toolInput)) {
    if (typeof value !== 'string' || !value.includes('*** ')) { continue; }
    for (const m of value.matchAll(PATCH_FILE)) { out.add(m[1].trim()); }
  }
  return [...out];
}

/**
 * The 1-based line spans an edit wrote, or null when the whole file counts
 * (a `Write`, a patch, or new text that cannot be located).
 */
export function editedSpans(toolInput, text) {
  const pieces = Array.isArray(toolInput?.edits)
    ? toolInput.edits.map(e => e?.new_string)
    : [toolInput?.new_string];
  if (pieces.some(p => typeof p !== 'string' || p.length === 0)) { return null; }
  const spans = [];
  for (const piece of pieces) {
    const at = text.indexOf(piece);
    if (at === -1) { return null; }
    const start = text.slice(0, at).split('\n').length;
    spans.push({ start, end: start + piece.split('\n').length - 1 });
  }
  return spans;
}

function touches(span, region) {
  return span.start <= region.end && span.end >= region.start;
}

/** The `DOCS:` lines for one tool call, before the once-per-session filter. */
export function docsLines(root, toolInput) {
  const lines = [];
  for (const raw of editedPaths(toolInput)) {
    const abs = isAbsolute(raw) ? raw : resolve(root, raw);
    const rel = relative(root, abs);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || !existsSync(abs)) { continue; }
    const text = readFileSync(abs, 'utf8');
    if (!text.includes('LINT.')) { continue; }
    const file = rel.split(sep).join('/');
    const spans = editedSpans(toolInput, text);
    for (const region of parseContracts(file, text)) {
      if (spans && !spans.some(s => touches(s, region))) { continue; }
      const pages = region.targets.map(t => (t.anchor ? `${t.path}#${t.anchor}` : t.path)).join(', ');
      lines.push({
        label: region.label,
        text: `DOCS: you edited region "${region.label}" (${file}:${region.start}); these pages describe it: ${pages}. Update them in this change, or, if the documented behaviour did not change, add "Docs-Checked: ${region.label} <reason>" to a commit message in the push (pre-push and CI enforce it).`,
      });
    }
  }
  return lines;
}

export function statePath(root, sessionId, temp = tmpdir()) {
  const repo = createHash('sha1').update(root).digest('hex').slice(0, 12);
  const session = String(sessionId).replace(/[^\w.-]/g, '_').slice(0, 120);
  return join(temp, `agentic-doc-contracts-${repo}-${session}.json`);
}

/** Drop the labels this session was already told about, and remember the rest. */
export function filterOncePerSession(lines, root, sessionId) {
  if (!sessionId || lines.length === 0) { return lines; }
  const path = statePath(root, sessionId);
  let seen = [];
  try { seen = JSON.parse(readFileSync(path, 'utf8')); }
  catch {}
  const fresh = lines.filter(l => !seen.includes(l.label));
  if (fresh.length > 0) {
    try { writeFileSync(path, JSON.stringify([...seen, ...fresh.map(l => l.label)])); }
    catch {}
  }
  return fresh;
}

function readStdin() {
  try {
    if (process.stdin.isTTY) { return {}; }
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  }
  catch { return {}; }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('doc-contracts.mjs')) {
  const input = readStdin();
  const rootFlag = process.argv.indexOf('--root');
  const root = resolve(rootFlag !== -1 ? process.argv[rootFlag + 1] : (process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()));
  if (contractsEnforced(root)) {
    const unique = new Map(docsLines(root, input.tool_input).map(l => [l.label, l]));
    const lines = filterOncePerSession([...unique.values()], root, input.session_id);
    if (lines.length > 0) {
      process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: lines.map(l => l.text).join('\n') } })}\n`);
    }
  }
}
