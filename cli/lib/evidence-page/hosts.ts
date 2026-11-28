/**
 * @fileoverview The host seam of the evidence page (decision D17, ADR-0021, ADR-0022).
 *
 * The builder writes a static file; a HOST makes it reachable:
 *   - `claude-artifact` (default): a private hosted Claude artifact. Publishing
 *     it is a HARNESS tool (`Artifact`), not an API a CLI can call, so this
 *     module returns the exact step the agent runs, and `recordPublication`
 *     stores the URL the tool returned. A pack that already has a URL is
 *     republished to it (read first), so a retest round never mints a second.
 *   - `local`: the file on disk; the report links its repo-relative path. For
 *     harnesses with no hosted equivalent.
 *
 * Privacy, unchanged on every host: private by default; a session never shares
 * the page or makes a public link (the owner shares it from the page's own
 * share menu); evidence never leaves through a third-party image service.
 */

import type { EvidenceHost, Pack } from './pack.ts';

import { isAbsolute, relative, resolve } from 'node:path';

import { EVIDENCE_HOSTS } from './pack.ts';

export { EVIDENCE_HOSTS };
export type { EvidenceHost };

export const DEFAULT_HOST: EvidenceHost = 'claude-artifact';

export interface EvidenceRef {
  host: EvidenceHost
  /** The published URL, or the page path while the agent has not published it yet. */
  location: string
  state: 'published' | 'agent-action'
}

export interface AgentPublishStep {
  tool: 'Artifact'
  /** Read the existing artifact first: a publish to a URL this session has not read is refused. */
  readFirst: string | null
  publish: { file_path: string, url?: string, icon?: string, description?: string }
  /** Run after the publish, with the URL the tool returned. */
  record: string
  instructions: string[]
}

export interface PublishResult {
  ref: EvidenceRef
  agentStep?: AgentPublishStep
}

/** The reference's icons: a checklist for a story page, a bug for a bug page. */
export function iconOf(kind: Pack['kind']): string {
  return kind === 'bug' ? 'bug' : 'checklist';
}

/** The round the verdict is judged on: `currentRound`, else the highest round present, else 0 (as `build.py` reads it). */
function currentRound(pack: Pick<Pack, 'tcs' | 'currentRound'>): number {
  const own = (c: Pack['tcs'][number]) => c.round ?? 0;
  return pack.currentRound ?? Math.max(0, ...pack.tcs.map(own), ...pack.tcs.flatMap(c => (c.evidence ?? []).map(e => e.round ?? 0)));
}

/** One sentence for the gallery card: `<KEY> <env> evidence: <n> of <m> TCs passed`, current round only, with a story's deferrals. */
export function describePage(pack: Pick<Pack, 'ticket' | 'env' | 'tcs' | 'bugs' | 'kind' | 'currentRound'>): string {
  const cur = currentRound(pack);
  const live = pack.tcs.filter(c => (c.round ?? (c.kind === 'repro' ? 0 : cur)) >= cur);
  const passed = live.filter(c => c.status === 'PASSED').length;
  const env = Object.values(pack.env ?? {})[0];
  const bugs = (pack.bugs ?? []).length;
  const what = pack.kind === 'bug' ? 'cases' : 'TCs';
  return `${pack.ticket.id}${env ? ` ${env}` : ''} evidence: ${passed} of ${live.length} ${what} passed${deferralNote(pack, live)}${bugs > 0 ? `, ${bugs} bug${bugs > 1 ? 's' : ''} filed` : ''}`;
}

function deferralNote(pack: Pick<Pack, 'ticket' | 'kind'>, live: Pack['tcs']): string {
  const deferred = pack.kind === 'bug' ? [] : live.filter(c => c.status === 'DEFERRED');
  if (deferred.length === 0) { return ''; }
  const covered = pack.ticket.deferral?.ok?.cases ?? [];
  const label = pack.ticket.deferral?.label;
  const ok = deferred.every(c => covered.includes(c.id))
    ? ', owner OK cited'
    : pack.ticket.verdict === 'FAILED' ? '' : ', waiting for owner OK';
  if (ok === '' && !label) { return ''; }
  return `, ${deferred.length} deferred${label ? ` (${label})` : ''}${ok}`;
}

export function publishEvidence(
  htmlPath: string,
  existingUrl: string | null | undefined,
  host: EvidenceHost = DEFAULT_HOST,
  context: { packPath: string, repoRoot?: string, kind?: Pack['kind'], description?: string } = { packPath: '<pack>' },
): PublishResult {
  const absolute = resolve(htmlPath);
  if (host === 'local') {
    const root = context.repoRoot ?? process.cwd();
    const rel = relative(root, absolute);
    return { ref: { host, location: rel.startsWith('..') || isAbsolute(rel) ? absolute : rel, state: 'published' } };
  }

  const existing = existingUrl ?? null;
  const icon = iconOf(context.kind ?? 'story');
  const publish: AgentPublishStep['publish'] = existing === null
    ? { file_path: absolute, icon, ...(context.description ? { description: context.description } : {}) }
    : { file_path: absolute, url: existing };
  const record = `bun run evidence record --pack ${context.packPath} --url <the url the Artifact tool returned>`;
  const instructions = existing === null
    ? [
        `Publish with the Artifact tool: file_path=${absolute}, icon=${icon}${context.description ? `, description="${context.description}"` : ''}. Static page, no capabilities. It is private; do not share it or make a public link.`,
        `Then record the URL it returns: ${record}`,
      ]
    : [
        `Read the existing artifact first: Artifact action "read", url=${existing}.`,
        `Republish to the SAME url: Artifact publish, file_path=${absolute}, url=${existing}. Never omit url: that mints a second page.`,
        `Then record it: ${record.replace('<the url the Artifact tool returned>', existing)}`,
      ];
  return {
    ref: { host, location: existing ?? absolute, state: 'agent-action' },
    agentStep: { tool: 'Artifact', readFirst: existing, publish, record, instructions },
  };
}

const CLAUDE_ARTIFACT_PATH = /^\/(?:artifact\/[\w-]+|code\/artifact\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** `null` when the URL may be recorded, else why not. */
export function evidenceUrlError(url: string, allowedHosts: readonly string[]): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  }
  catch {
    return `${JSON.stringify(url)} is not a URL`;
  }
  if (parsed.protocol !== 'https:') {
    return 'an evidence link must be https';
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return 'an evidence link carries no user name or password';
  }
  if (!allowedHosts.includes(parsed.hostname)) {
    return `host ${parsed.hostname} is not in board.evidence.allowed_hosts (${allowedHosts.join(', ') || 'empty'})`;
  }
  if (parsed.hostname === 'claude.ai' && !CLAUDE_ARTIFACT_PATH.test(parsed.pathname)) {
    return 'a claude.ai evidence link must be https://claude.ai/artifact/<id> or https://claude.ai/code/artifact/<uuid>';
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    return 'an evidence link carries no query string or fragment';
  }
  return null;
}

export type RecordResult = { ok: true, pack: Pack } | { ok: false, error: string };

/** Store a publication on the pack. A different URL than the recorded one is refused: republish to the first. */
export function recordPublication(pack: Pack, url: string, options: { allowedHosts: readonly string[], now?: Date, pagePath?: string }): RecordResult {
  const error = evidenceUrlError(url, options.allowedHosts);
  if (error !== null) {
    return { ok: false, error };
  }
  const existing = pack.artifact?.url;
  if (existing !== undefined && existing !== url) {
    return { ok: false, error: `this pack is already published at ${existing}; republish to that url instead of minting a second page` };
  }
  const at = (options.now ?? new Date()).toISOString();
  const path = pack.artifact?.path ?? options.pagePath;
  return {
    ok: true,
    pack: {
      ...pack,
      artifact: { url, ...(path === undefined ? {} : { path }), published: [...(pack.artifact?.published ?? []), at] },
    },
  };
}
