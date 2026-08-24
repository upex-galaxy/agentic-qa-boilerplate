/**
 * @fileoverview Protected-file drift advisory (AI-assisted migration).
 *
 * Some files are deliberately NOT synced by the updater because every
 * downstream project adapts them (auth flow, env map, KATA bases, report
 * config, CI workflows, MCP registry). But the boilerplate keeps evolving
 * those same files, so a downstream project would silently miss the
 * improvements forever.
 *
 * This hook generalizes the original instruction-file drift advisory to a
 * WATCHLIST of protected files. It NEVER edits any of them. Per entry it:
 *
 *  1. Reads the upstream copy from the template clone (tempDir).
 *  2. Short-circuits when the local copy already matches upstream
 *     (whitespace-insensitive) — nothing to migrate.
 *  3. Fires ONLY when the UPSTREAM content changed since the last advice,
 *     tracked by a content hash in `.template/upstream-sha/<slug>.sha`
 *     (one nudge per upstream change, never on dry-run — afterApply is
 *     skipped there).
 *
 * All drifted entries are batched into ONE advisory + ONE copy-paste AI
 * prompt (surgical merge: port upstream improvements, preserve every
 * project adaptation, show diff before writing). The prompt is also
 * persisted to `.agents/prompts/boilerplate-drift-prompt.md` (gitignored,
 * auto-generated, single-use) so it survives the terminal session.
 */

import type { ReportSink, RunSummary } from './updater-types';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import pc from 'picocolors';

// ============================================================================
// TYPES
// ============================================================================

export interface ProtectedWatchEntry {
  /** Repo-relative path, forward slashes (e.g. `allurerc.mjs`). */
  path: string
  /** One-line human reason shown in the advisory table (why it is protected). */
  reason: string
  /**
   * Override for the sha-marker file. `AGENTS.md` keeps the legacy
   * `.template/claude-md.upstream.sha` marker so repos that already received
   * the old single-file advisory are not re-nudged.
   */
  markerPath?: string
}

export interface ProtectedDriftConfig {
  entries: ProtectedWatchEntry[]
  /** Template clone directory (upstream files live at `<tempDir>/<entry.path>`). */
  tempDir: string
  /** `owner/repo` — builds the raw.githubusercontent.com URLs in the prompt. */
  templateRepo: string
  /** Where the copy-paste prompt is persisted. */
  promptOutPath: string
}

/** Default marker directory for watchlist entries (one .sha file per entry). */
const MARKER_DIR = '.template/upstream-sha';

// ============================================================================
// PURE HELPERS (exported for tests)
// ============================================================================

/** Whitespace-insensitive normalization for the "already identical" short-circuit. */
export function normalizeForCompare(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/g, '\n');
}

/** Stable filesystem-safe slug for an entry path (marker filename). */
export function markerSlug(entryPath: string): string {
  return entryPath.replace(/\\/g, '/').replace(/[^a-z0-9.-]+/gi, '_');
}

/** Resolve the marker file for an entry (legacy override wins). */
export function resolveMarkerPath(entry: ProtectedWatchEntry, cwd: string): string {
  return path.join(cwd, entry.markerPath ?? path.join(MARKER_DIR, `${markerSlug(entry.path)}.sha`));
}

export interface DriftedEntry extends ProtectedWatchEntry {
  upstreamSha: string
  /** True when this is the first advice ever for this entry (no marker yet). */
  firstAdvice: boolean
}

/**
 * Detect which watchlist entries drifted: upstream exists, local exists,
 * local differs from upstream, and upstream changed since the last advice.
 * Pure with respect to markers — does NOT write them (see persistMarkers).
 */
export function detectProtectedDrift(
  entries: ProtectedWatchEntry[],
  tempDir: string,
  cwd: string,
): DriftedEntry[] {
  const drifted: DriftedEntry[] = [];
  for (const entry of entries) {
    const upstreamPath = path.join(tempDir, entry.path);
    const localPath = path.join(cwd, entry.path);
    // Both copies must exist: no upstream → nothing canonical to port; no
    // local → the project intentionally removed it, not ours to resurrect.
    if (!fs.existsSync(upstreamPath) || !fs.existsSync(localPath)) { continue; }

    let upstreamContent: string;
    let localContent: string;
    try {
      upstreamContent = fs.readFileSync(upstreamPath, 'utf8');
      localContent = fs.readFileSync(localPath, 'utf8');
    }
    catch { continue; }

    // Project tracks the boilerplate verbatim → nothing to suggest.
    if (normalizeForCompare(upstreamContent) === normalizeForCompare(localContent)) { continue; }

    const upstreamSha = crypto.createHash('sha256').update(upstreamContent, 'utf8').digest('hex');
    let lastSha = '';
    try {
      const markerPath = resolveMarkerPath(entry, cwd);
      if (fs.existsSync(markerPath)) { lastSha = fs.readFileSync(markerPath, 'utf8').trim(); }
    }
    catch { /* unreadable marker — treat as first advice */ }

    if (lastSha === upstreamSha) { continue; } // no NEW upstream change since last nudge

    drifted.push({ ...entry, upstreamSha, firstAdvice: lastSha === '' });
  }
  return drifted;
}

/**
 * Persist the upstream sha markers for the advised entries so each upstream
 * change nudges exactly once, even if the user ignores the advice.
 * Non-fatal on write failure — worst case we advise again next run.
 */
export function persistMarkers(drifted: DriftedEntry[], cwd: string): void {
  for (const entry of drifted) {
    try {
      const markerPath = resolveMarkerPath(entry, cwd);
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(markerPath, `${entry.upstreamSha}\n`);
    }
    catch { /* non-fatal */ }
  }
}

/** Build the surgical-merge prompt handed to the downstream AI. */
export function buildDriftPrompt(drifted: DriftedEntry[], templateRepo: string): string {
  const rawBase = `https://raw.githubusercontent.com/${templateRepo}/main`;
  const fileList = drifted
    .map(e => `   - ${e.path}  (canonical: ${rawBase}/${e.path})  — protected because: ${e.reason}`)
    .join('\n');
  return [
    'Migrate the project-adapted files below to the latest boilerplate capabilities, surgically.',
    '',
    'These files are intentionally NOT synced by `bun run update` because this project',
    'adapted them. The boilerplate versions evolved since the last sync:',
    '',
    fileList,
    '',
    'For EACH file:',
    '1. Fetch its canonical boilerplate version from the URL above',
    '   (use your web-fetch tool, or run: curl -fsSL <url>).',
    '2. Diff it against the local copy.',
    '3. Port ONLY the upstream improvements: new capabilities, new config options,',
    '   new sections, fixes. Explain each improvement you are porting.',
    '4. PRESERVE every project adaptation verbatim — names, URLs, credentials',
    '   references, project-specific selectors/fixtures/env vars/jobs. Never replace',
    '   a local customization with a generic boilerplate placeholder.',
    '5. On any genuine conflict (same block, divergent intent), surface it for my',
    '   decision instead of silently overwriting.',
    '6. Show me a concise before/after diff per file BEFORE writing anything.',
    '',
    'BEFORE porting any config that depends on a pinned tool (e.g. allurerc.mjs depends on',
    'the `allure` devDependency), check the pinned version against the latest SAME-major',
    '(`npm view <pkg> version` vs package.json) and offer the update first — `bun run update`',
    'appends new devDependencies but never bumps existing ones, so new config options may',
    'not exist in the locally pinned version.',
    '',
    'POST-MERGE COMMANDS (each reconciled file feeds a generated catalog — regenerate it):',
    ' - after reconciling `.agents/jira-required.yaml`, run `bun run jira:sync-workflows`',
    '   (it catalogs ONLY the work_types the manifest declares — stale input, truncated catalog);',
    ' - after reconciling skills (`.agents/skills/**`), run `bun run skills:registry`;',
    ' - after reconciling test files (`tests/**`), run `bun run kata:manifest`.',
    '',
    'After migrating, run the project verification (tests -> types -> lint) and report results.',
  ].join('\n');
}

/** Markdown wrapper for the persisted prompt file. */
export function buildPromptFileContent(drifted: DriftedEntry[], templateRepo: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    '# Boilerplate drift — AI migration prompt',
    '',
    `> **AUTO-GENERATED, SINGLE-USE.** Written by \`bun run update\` on ${today}.`,
    '> Paste the prompt below into your AI session, then delete this file.',
    '> It is regenerated (overwritten) whenever the updater detects new upstream',
    '> changes in protected files.',
    '',
    '```text',
    buildDriftPrompt(drifted, templateRepo),
    '```',
    '',
  ].join('\n');
}

// ============================================================================
// HOOK FACTORY
// ============================================================================

/**
 * Build the `afterApply` hook. Detects drifted protected files, persists the
 * nudge markers, prints the advisory + copy-paste prompt, and writes the
 * prompt file. Never mutates any watched file.
 */
export function makeProtectedDriftHook(
  cfg: ProtectedDriftConfig,
  sink: ReportSink,
): (summary: RunSummary) => Promise<void> {
  return async (_summary: RunSummary): Promise<void> => {
    const cwd = process.cwd();
    const drifted = detectProtectedDrift(cfg.entries, cfg.tempDir, cwd);
    if (drifted.length === 0) { return; }

    // Markers FIRST: one nudge per upstream change even if the user ignores it.
    persistMarkers(drifted, cwd);

    sink.warn(`El boilerplate evolucionó ${drifted.length} archivo(s) protegido(s) que el updater NUNCA sobrescribe (tienen adaptaciones de este proyecto):`);
    for (const entry of drifted) {
      sink.step(`${pc.bold(entry.path)} ${pc.dim(`— ${entry.reason}`)}`);
    }
    sink.step('Nada fue modificado. Pega el prompt de abajo en tu IA para portar SOLO las mejoras, preservando tus adaptaciones:');

    const prompt = buildDriftPrompt(drifted, cfg.templateRepo);
    try {
      fs.mkdirSync(path.dirname(cfg.promptOutPath), { recursive: true });
      fs.writeFileSync(cfg.promptOutPath, buildPromptFileContent(drifted, cfg.templateRepo));
      sink.step(`Prompt guardado en ${pc.cyan(path.relative(cwd, cfg.promptOutPath))} (auto-generado, un solo uso).`);
    }
    catch { /* non-fatal — the stdout block below still carries the prompt */ }

    // Plain stdout (no log-prefix bullets) so the block copy-pastes cleanly.
    process.stdout.write(`\n${pc.dim('────────  COPY PROMPT BELOW  ────────')}\n${prompt}\n${pc.dim('────────  COPY PROMPT ABOVE  ────────')}\n\n`);
  };
}
