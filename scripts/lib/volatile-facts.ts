/**
 * volatile-facts.ts — the two regex-visible families of Critical Rule #17
 * (committed prose names the source of truth, never its current value), shared
 * by `lint-skills.ts` (`.agents/**` + `AGENTS.md`) and `lint-docs.ts`
 * (`docs/**`, `README.md`, `INSTALLER.md`, the decks).
 *
 *   FILE-LINE      a path with a known extension followed by `:N`, `:N-M` or
 *                  `#LN`. A line number shifts on any edit above it; cite the
 *                  file plus a symbol or a heading instead.
 *   CURRENT-STATE  the dating vocabulary of a claim about the present: "today",
 *                  "currently", "as of <year>", a dated "measured / verified",
 *                  "since <version>", a measured token or byte size, a tool
 *                  version after a tool name, and the Spanish equivalents.
 *
 * Both checks skip what the canon exempts: fenced code blocks, `<pre>`,
 * `<code class="block">`, `<script>` / `<style>` bodies, the YAML frontmatter,
 * and any line that carries the escape hatch `volatile-ok: <reason>`; a file
 * whose header carries `volatile-ok-file: <reason>` (a dated ledger by design)
 * is skipped whole. The caller decides the file set (ADRs and `.session/**`
 * are never handed in);
 * `isVolatileExemptPath` is the shared answer for the two prefixes.
 *
 * Canon: .agents/skills/agentic-qa-core/references/volatile-facts.md
 */

export type VolatileKind = 'FILE-LINE' | 'CURRENT-STATE';

export interface VolatileHit {
  /** 1-based line in the original text. */
  line: number
  kind: VolatileKind
  /** The matched span, verbatim. */
  match: string
}

/** The per-line escape hatch. The reason after the colon is mandatory by doctrine, not by regex. */
export const VOLATILE_OK = /volatile-ok:/;

/**
 * The file-level escape hatch, for a dated ledger BY DESIGN (canon §4: every
 * row carries its own date and version, rows move out when they stop being
 * true). It must sit in the first lines of the file, with a reason.
 */
export const VOLATILE_OK_FILE = /volatile-ok-file:/;
const FILE_MARKER_WINDOW = 12;

/** `foo.ts:12`, `foo.md:3-9`, `foo.ts#L12`. The extension list is what this repo cites in prose. */
export const FILE_LINE_PATTERN
  = /[\w./-]+\.(?:ts|tsx|js|mjs|cjs|md|yaml|yml|json|jsonc|toml|html|sh|css)(?::\d+(?:-\d+)?|#L\d+)\b/g;

/**
 * One regex per dating shape, so a hit names the shape that fired. Word
 * boundaries keep "today" out of "todayjs"; the Spanish set is the same words
 * the docs use. All case-insensitive.
 */
export const CURRENT_STATE_PATTERNS: ReadonlyArray<RegExp> = [
  // "today", "currently", "right now", "at the moment", "as of 2026", "as of v1.3"
  /\b(?:today|currently|right now|at the moment|as of (?:\d{4}|v?\d+\.\d+))\b/gi,
  // Spanish: "hoy", "actualmente", "a la fecha", "por ahora"
  /\b(?:hoy|actualmente|a la fecha|por ahora)\b/gi,
  // dated forensic note: "measured 2026-09-17", "verified on 2026-08-18", "confirmed 2026-08-21 via", "measured (2026-09-04"
  /\b(?:measured|verified|confirmed|established|corrected|medido|verificado)(?: on| against| live)?[ :,(]+\d{4}-\d{2}(?:-\d{2})?\b/gi,
  // edit-history narration keyed on a release: "since 8.4", "desde 8.3"
  /\b(?:since|desde) \d+\.\d+\b/gi,
  // measured sizes: "~2k tokens", "2271 bytes"
  /~\s?\d+k tokens\b|\b\d+ bytes\b/gi,
  // a tool version in prose: "orca 1.4.190", "acli v1.3.18", "Claude Code 2.1.278", "verified against v1.3.18"
  /\b(?:orca|acli|gentle-ai|bun|playwright|node|codex|opencode|claude code|verified against|as of) v?\d+\.\d+\.\d+\b/gi,
];

/** Paths the rule exempts by genre: a dated record is right forever because the date is part of the claim. */
export function isVolatileExemptPath(rel: string): boolean {
  const p = rel.replace(/\\/g, '/');
  return p.startsWith('.context/ADR/') || p.startsWith('.session/') || p.includes('/.session/');
}

/** Replace every character of each match except newlines with a space, so line numbers survive. */
function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, block => block.replace(/[^\n]/g, ' '));
}

/**
 * Prose only: fenced blocks, `<pre>`, `<code class="block">`, `<script>`,
 * `<style>` and the YAML frontmatter are blanked (same length, newlines kept).
 */
export function proseOnly(text: string, options: { html: boolean }): string {
  let out = text;
  if (out.startsWith('---')) {
    const end = out.indexOf('\n---', 3);
    if (end !== -1) { out = blank(out, /^---[\s\S]*?\n---/); }
  }
  out = blank(out, /^(```|~~~)[\s\S]*?\n\1/gm);
  if (options.html) {
    out = blank(out, /<pre\b[\s\S]*?<\/pre>/gi);
    out = blank(out, /<code\s[^>]*class\s*=\s*["'][^"']*\bblock\b[^"']*["'][^>]*>[\s\S]*?<\/code>/gi);
    out = blank(out, /<script\b[\s\S]*?<\/script>/gi);
    out = blank(out, /<style\b[\s\S]*?<\/style>/gi);
  }
  return out;
}

/**
 * Every FILE-LINE and CURRENT-STATE hit in one file's text. `html` widens the
 * exclusions to the HTML block forms; markdown gets fences and frontmatter.
 */
export function scanVolatile(text: string, options: { html: boolean }): VolatileHit[] {
  const raw = text.split('\n');
  if (raw.slice(0, FILE_MARKER_WINDOW).some(line => VOLATILE_OK_FILE.test(line))) { return []; }
  const prose = proseOnly(text, options).split('\n');
  const hits: VolatileHit[] = [];
  for (let i = 0; i < prose.length; i++) {
    if (VOLATILE_OK.test(raw[i] ?? '')) { continue; }
    const line = prose[i];
    if (line.trim() === '') { continue; }
    for (const m of line.matchAll(FILE_LINE_PATTERN)) {
      hits.push({ line: i + 1, kind: 'FILE-LINE', match: m[0] });
    }
    for (const pattern of CURRENT_STATE_PATTERNS) {
      for (const m of line.matchAll(pattern)) {
        hits.push({ line: i + 1, kind: 'CURRENT-STATE', match: m[0] });
      }
    }
  }
  return hits;
}

/** The one-line remedy the linters print next to a hit. */
export function volatileRemedy(kind: VolatileKind): string {
  return kind === 'FILE-LINE'
    ? 'a line number shifts on any edit above it: cite the file plus a symbol or a heading (Rule #17; `volatile-ok: <reason>` on the line to keep it)'
    : 'a claim about the present goes stale: state the behaviour without the date / version / measurement, or move the figure to an ADR (Rule #17; `volatile-ok: <reason>` on the line to keep it)';
}
