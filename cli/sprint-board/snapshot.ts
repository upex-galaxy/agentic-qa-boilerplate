/**
 * A self-contained HTML copy of a board: same page, same bundle, the state
 * embedded instead of fetched. Opens from file:// and needs no server.
 *
 *   full    everything (for you; the archive is this)
 *   share   built by allowlist (toShareState): no drafts, waits, answers,
 *           worker names, local paths or evidence. Safe to publish.
 *   report  the sprint QA report (toReportState): the same allowlist idea plus
 *           the counted numbers, tracker links and evidence page URLs; lands on
 *           the Report view. `stpUrl` adds the "Full record: STP" footer link.
 *
 * No mode carries the Decision dock (`sweep`).
 *
 * `--fragment` drops the document skeleton, for the Claude artifact publisher
 * (it wraps the page itself).
 */
import type { BoardState } from './model.ts';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { brandHtml } from './brand.ts';
import { buildApp } from './build.ts';
import { stpUrl, toReportState, toShareState } from './model.ts';
import { buildState } from './sources.ts';
import { archiveDir, REPO_ROOT, sprintDir, writeAtomic } from './store.ts';
import { dockLeak } from './sweep.ts';

/** `</script` inside inlined code or JSON would end the script element early. */
const scriptSafe = (s: string) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const jsonSafe = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
const escHtml = (v: string) => v.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]!);

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

let warnedNoSips = false;
/** `tmp` is the run's one temp dir; `n` keeps each thumbnail's name unique inside it. */
function thumb(rel: string, tmp: string, n: number): string | null {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) { return null; }
  // macOS sips shrinks the image so a sprint's evidence does not weigh 40 MB; without sips the original goes in.
  const out = join(tmp, `thumb-${n}.jpg`);
  let ok = false;
  try { ok = Bun.spawnSync(['sips', '-Z', '1000', '-s', 'format', 'jpeg', '-s', 'formatOptions', '55', abs, '--out', out]).exitCode === 0; }
  catch { if (!warnedNoSips) { warnedNoSips = true; console.warn('snapshot: sips not found, evidence images are embedded at full size'); } }
  const file = ok && existsSync(out) ? out : abs;
  const mime = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

export const SNAPSHOT_MODES = ['full', 'share', 'report'] as const;
export type SnapshotMode = (typeof SNAPSHOT_MODES)[number];

export async function snapshot(slug: string, opts: { mode: SnapshotMode, out?: string, embedEvidence?: boolean, archive?: boolean, fragment?: boolean, closingAt?: string, stpUrl?: string, stpHosts?: readonly string[] }): Promise<string> {
  if (opts.stpUrl !== undefined && opts.mode !== 'report') { throw new Error('--stp-url only applies to --mode report'); }
  const hosts = opts.stpHosts ?? [];
  const stp = opts.stpUrl === undefined ? undefined : stpUrl(opts.stpUrl, hosts);
  const full = buildState(slug, undefined, { closingAt: opts.closingAt });
  const { sweep, ...frozen } = full;
  const publish = (board: BoardState) => (opts.mode === 'report' ? toReportState(board, { stpUrl: stp, stpHosts: hosts }) : toShareState(board));
  const state = opts.mode === 'full' ? { ...frozen, mode: 'snapshot' as const } : publish(full);
  const images: Record<string, string> = {};
  if (opts.embedEvidence && opts.mode === 'full') {
    const paths = new Set([...full.tickets.flatMap(t => t.evidence.map(e => e.path)), ...full.asks.flatMap(a => a.attach)]);
    const tmp = mkdtempSync(join(tmpdir(), 'sb-'));
    try {
      let n = 0;
      for (const p of paths) { const d = thumb(p, tmp, n++); if (d) { images[p] = d; } }
    }
    finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  const { js, css } = await buildApp();
  let html = brandHtml(readFileSync(join(import.meta.dir, 'app', 'index.html'), 'utf8'))
    // prettier writes the tag self-closed (` />`); a literal match missed it and left snapshots unstyled.
    .replace(/<link rel="stylesheet" href="\/app\.css" data-inline="css"\s*\/?>/, () => `<style>${css}</style>`)
    .replace('<script src="/app.js" data-inline="js"></script>', () => `<script>${scriptSafe(js)}</script>`)
    .replace('<script id="board-data" type="application/json"></script>', () => `<script id="board-data" type="application/json">${jsonSafe({ ...state, images })}</script>`)
    .replace('<title>Sprint Board</title>', () => `<title>${escHtml(state.sprint.name)} ${opts.mode === 'report' ? 'QA Report' : 'Board'}</title>`);

  if (opts.fragment) {
    html = html.replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*$/i, '').replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '').replace(/<meta charset="utf-8"\s*\/?>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '').replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '');
  }

  if (opts.mode === 'share' || opts.mode === 'report') {
    // The allowlist is the guarantee; this is the tripwire that proves it held.
    const data = jsonSafe(state);
    for (const a of full.asks) {
      for (const secret of [a.text, a.reply, a.error]) {
        const probe = jsonSafe((secret ?? '').slice(0, 40)).slice(1, -1);
        if (probe.length > 12 && data.includes(probe)) { throw new Error(`${opts.mode} snapshot leaked draft ${a.id}; refusing to write`); }
      }
    }
    const bare = jsonSafe(publish(buildState(slug, full.generatedAt, { closingAt: opts.closingAt, withoutDock: true })));
    const leaked = dockLeak(sweep, data, bare, jsonSafe);
    if (leaked) { throw new Error(`${opts.mode} snapshot leaked ${leaked}; refusing to write`); }
    const dockNotes = new Set(sweep?.notes.map(n => n.id));
    if (data.includes('.session/') || data.includes('.context/PBI')) { throw new Error(`${opts.mode} snapshot contains a local path; refusing to write`); }
    if (opts.mode === 'report') {
      for (const t of full.tickets) {
        const name = t.worker.name;
        if (name && name.length > 2 && data.includes(jsonSafe(name))) { throw new Error(`report snapshot contains worker name ${name}; refusing to write`); }
      }
      for (const th of full.inbox) {
        const probe = jsonSafe(th.text.slice(0, 40)).slice(1, -1);
        const elsewhere = dockNotes.has(th.id) && bare.includes(probe);
        if (probe.length > 12 && data.includes(probe) && !elsewhere) { throw new Error(`report snapshot leaked inbox message ${th.id}; refusing to write`); }
      }
    }
  }

  const out = opts.out ?? (opts.archive
    ? join(archiveDir(), `${slug}.html`)
    : join(sprintDir(slug), `${slug}-${opts.mode}${opts.fragment ? '-fragment' : ''}.html`));
  writeAtomic(out, html);
  if (opts.archive) { writeAtomic(join(archiveDir(), `${slug}.state.json`), `${JSON.stringify(frozen, null, 2)}\n`); }
  return out;
}
