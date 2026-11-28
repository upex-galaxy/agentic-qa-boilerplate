/**
 * @fileoverview The tracker side of the evidence page: put a bug's ONE thumbnail
 * into the tracker and link a published page from an issue (ADR-0021, its
 * tracker amendment; the `evidence-artifact` skill, `references/workflow.md` §3-§4).
 *
 *   attachThumbnail(BUG, png)   the PNG embedded at the END of the bug's Description
 *                               (append only), read back; a Description the edit
 *                               screen refuses falls back to a structured comment
 *   linkEvidence(KEY, page)     a remote link with a stable globalId (a retest
 *                               republishes to the same URL: one link, updated)
 *
 * Per modality: `jira-native` and `jira-xray` write through Jira REST; `jira-xray`
 * also reaches a Test Run when one is named (the PNG as run evidence, the TC deep
 * link appended to the run comment); `none` writes nothing and says where the
 * thumbnail and the link live.
 *
 * Every write is read back at its destination (Rule #16) and a mismatch is an
 * error naming what is missing. The network goes through an injected `TrackerIO`:
 * the live one reuses the repo's clients (the acli media helper for the upload and
 * the media id, `cli/lib/sprint-source/transport.ts` for JSON calls, `cli/xray` for
 * GraphQL), the tests replay recorded responses, and `--dry-run` runs the same code
 * against an in-memory tracker that only records the calls.
 */

import type { AttachmentDataInput } from '../../xray/types/index.ts';
import type { SourceKind } from '../sprint-source/types.ts';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { JiraHttpError } from '../sprint-source/transport.ts';

// ============================================================================
// IO
// ============================================================================

export type JiraMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** What the acli helper's upload returns (the first attachment of the response). */
export interface UploadedAttachment { id: string, filename: string, content: string, size?: number }

export interface TrackerIO {
  /** Jira REST JSON call; `null` for an empty body. Throws `JiraHttpError` on an error status. */
  jira: <T>(method: JiraMethod, path: string, body?: unknown) => Promise<T | null>
  /** `POST /rest/api/3/issue/{key}/attachments` (multipart `file`, `X-Atlassian-Token: no-check`). */
  upload: (issueKey: string, filePath: string) => Promise<UploadedAttachment>
  /** The media-services UUID behind an attachment's content URL (its redirect). */
  mediaId: (contentUrl: string) => Promise<string>
  /** Xray Cloud GraphQL. */
  xray: <T>(query: string, variables: Record<string, unknown>) => Promise<T>
  /** A Jira key to its numeric issue id (Xray takes ids). */
  issueId: (key: string) => Promise<string>
}

/** Xray queries and mutations used here, verbatim from `cli/xray/lib/graphql.ts` (passed in, so this module stays import-light). */
export interface XrayDocs {
  getTestExecution: string
  getTestRunById: string
  addEvidenceToTestRun: string
  removeEvidenceFromTestRun: string
  updateTestRunComment: string
}

// ============================================================================
// RESULT
// ============================================================================

export type RunRef = { runId: string } | { test: string, execution: string };

export interface TrackerResult {
  ok: boolean
  /** What was written, skipped and read back, in order, one line each. */
  lines: string[]
  error?: string
  /** attach: the thumbnail is in the Description (or, after a fallback, the comment) and read back. */
  embedded?: boolean
  /** attach: the Description could not be written; the image went into a comment instead. */
  fellBack?: boolean
  /** Simulated (`--dry-run`): nothing was sent and nothing was read back. */
  dryRun?: boolean
}

export interface AttachOptions {
  /**
   * An earlier thumbnail of this bug (same name, other bytes) is in the tracker: remove its
   * image and the attachment this tool embedded, then attach the new one. A person confirms
   * first: deleting a tracker attachment cannot be undone.
   */
  replace?: boolean
}

export interface TrackerOptions {
  /** The IO only records the calls: result lines say so, never claim a read-back, and nothing counts as embedded. */
  dryRun?: boolean
}

export interface EvidenceTracker {
  readonly kind: SourceKind
  attachThumbnail: (bugKey: string, pngPath: string, run?: RunRef, options?: AttachOptions) => Promise<TrackerResult>
  linkEvidence: (targetKey: string, page: { url: string, title?: string }, run?: RunRef & { caseId?: string }) => Promise<TrackerResult>
}

// ============================================================================
// ADF
// ============================================================================

export interface AdfNode { type: string, attrs?: Record<string, unknown>, content?: AdfNode[], text?: string }
export interface AdfDoc { type: 'doc', version: 1, content: AdfNode[] }

/** The media-node helpers of the acli skill (`.agents/skills/acli/scripts/jira-attach-media.ts`). */
export interface MediaHelpers {
  buildMediaNode: (mediaId: string, opts?: { width?: number, height?: number, alt?: string, layout?: string }) => AdfNode
  imageSize: (buf: Uint8Array) => { width: number, height: number } | null
}

/** Whether an ADF tree holds a `media` node with this id. */
export function adfHasMedia(node: unknown, mediaId: string): boolean {
  if (typeof node !== 'object' || node === null) { return false; }
  const n = node as AdfNode;
  if (n.type === 'media' && n.attrs?.id === mediaId) { return true; }
  return Array.isArray(n.content) && n.content.some(child => adfHasMedia(child, mediaId));
}

function isDoc(doc: unknown): doc is AdfDoc {
  return typeof doc === 'object' && doc !== null && (doc as AdfDoc).type === 'doc' && Array.isArray((doc as AdfDoc).content);
}

/**
 * The document with one node appended at the end; a missing (`null`) Description becomes a
 * fresh doc. Never edits what is there, and refuses anything that is neither `null` nor an
 * ADF doc rather than replacing it.
 */
export function appendToDoc(doc: unknown, node: AdfNode): AdfDoc {
  if (doc === null || doc === undefined) { return { type: 'doc', version: 1, content: [node] }; }
  if (!isDoc(doc)) { throw new Error('the Description is not an ADF document; nothing written (edit it by hand)'); }
  return { ...doc, version: 1, content: [...doc.content, node] };
}

/** The document without every top-level block that holds this media id (the `mediaSingle` this tool appended). */
export function removeMedia(doc: AdfDoc, mediaId: string): AdfDoc {
  return { ...doc, content: doc.content.filter(block => !adfHasMedia(block, mediaId)) };
}

// ============================================================================
// JIRA SHAPES (only the fields read)
// ============================================================================

interface JiraAttachment { id: string, filename: string, size?: number, content: string }
interface JiraIssueView { key: string, fields: { attachment?: JiraAttachment[], description?: unknown, comment?: { comments?: JiraComment[] } } }
interface JiraComment { id: string, body?: unknown }
interface JiraRemoteLink { id?: number | string, globalId?: string, object?: { url?: string, title?: string } }
interface XrayRun { id: string, comment?: string | null, evidence?: Array<{ id: string, filename: string }> | null, test?: { jira?: { key?: string } } }

const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_MAGIC.every((b, i) => bytes[i] === b);
}

/** The stable remote-link id of a page: the URL without its fragment, so a deep link and the page share one link. */
export function evidenceGlobalId(url: string): string {
  return `evidence-page:${url.split('#')[0]}`;
}

/** The TC deep link line the workflow appends to a run comment (`workflow.md` §3 step 6). */
export function deepLinkLine(url: string, ticketKey: string, caseId: string): string {
  return `Evidence: ${url.split('#')[0]}#${ticketKey}.${caseId}`;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createEvidenceTracker(kind: SourceKind, io: TrackerIO, docs: XrayDocs, media: () => Promise<MediaHelpers>, options: TrackerOptions = {}): EvidenceTracker {
  if (kind === 'none') { return noneTracker(); }
  const xray = kind === 'jira-xray';
  const dryRun = options.dryRun === true;
  /** A write line; in a dry run it says nothing was sent. */
  const wrote = (lines: string[], text: string) => lines.push(dryRun ? `(dry run, not sent) ${text}` : text);
  /** A read-back line; a dry run never claims one. */
  const readBack = (lines: string[], text: string) => lines.push(dryRun ? `DRY RUN: read-back not performed (a live run checks that ${text})` : `read-back OK: ${text}`);

  /** Resolve a Test Run before any write: a wrong TC or execution writes nothing. */
  const resolveRun = async (run: RunRef | undefined): Promise<XrayRun | null> => {
    if (run === undefined) { return null; }
    if (!xray) { throw new Error(`a Test Run is an Xray object; the ${kind} source has none (drop --run / --test / --exec)`); }
    let runId: string;
    if ('runId' in run) {
      runId = run.runId;
    }
    else {
      const execId = await io.issueId(run.execution);
      const exec = await io.xray<{ getTestExecution: { testRuns?: { results?: XrayRun[] } } | null }>(docs.getTestExecution, { issueId: execId });
      const found = exec.getTestExecution?.testRuns?.results?.find(r => r.test?.jira?.key === run.test);
      if (found === undefined) { throw new Error(`${run.test} has no run in ${run.execution} (the first 100 runs were read): add the test to the execution first (bun xray exec add-tests), or pass --run <id>`); }
      runId = found.id;
    }
    const read = await io.xray<{ getTestRunById: XrayRun | null }>(docs.getTestRunById, { id: runId });
    if (read.getTestRunById === null) { throw new Error(`Test Run ${runId} not found in Xray`); }
    return read.getTestRunById;
  };

  const readRun = async (id: string): Promise<XrayRun> => {
    const read = await io.xray<{ getTestRunById: XrayRun | null }>(docs.getTestRunById, { id });
    if (read.getTestRunById === null) { throw new Error(`Test Run ${id}: not found on read-back`); }
    return read.getTestRunById;
  };

  /**
   * `--replace`: take out an earlier thumbnail this tool embedded (same name, other bytes): its
   * media node leaves the Description, or its "Evidence" comment is deleted, then the attachment
   * is deleted; read back before the new one goes in. An attachment of that name that this tool
   * did not embed (its media id is in neither place) is left for a person.
   */
  const removeEarlier = async (bugKey: string, issuePath: string, view: JiraIssueView, earlier: JiraAttachment[], lines: string[]): Promise<JiraIssueView> => {
    const gone: Array<{ attachment: JiraAttachment, mediaId: string }> = [];
    let description = view.fields.description;
    for (const attachment of earlier) {
      const old = await io.mediaId(attachment.content);
      const ownComments = commentsOf(view).filter(c => adfHasMedia(c.body, old));
      if (!adfHasMedia(description, old) && ownComments.length === 0) {
        throw new Error(`${bugKey}: attachment ${attachment.id} (${attachment.filename}) is in neither the Description nor an "Evidence" comment, so evidence attach did not embed it; remove it by hand`);
      }
      const foreign = ownComments.filter(c => !isEvidenceComment(c.body));
      if (foreign.length > 0) {
        throw new Error(`${bugKey}: comment ${foreign.map(c => c.id).join(', ')} holds the earlier image beside other text; remove it by hand`);
      }
      if (adfHasMedia(description, old)) {
        if (!isDoc(description)) { throw new Error(`${bugKey}: the Description is not an ADF document; edit it by hand`); }
        description = removeMedia(description, old);
        await io.jira('PUT', `/rest/api/3/issue/${bugKey}`, { fields: { description } });
        wrote(lines, `${bugKey}: earlier thumbnail (media ${old}) removed from the Description`);
      }
      for (const comment of ownComments) {
        await io.jira('DELETE', `/rest/api/3/issue/${bugKey}/comment/${comment.id}`);
        wrote(lines, `${bugKey}: earlier "Evidence" comment ${comment.id} deleted`);
      }
      await io.jira('DELETE', `/rest/api/3/attachment/${attachment.id}`);
      wrote(lines, `${bugKey}: earlier attachment ${attachment.id} (${attachment.filename}) deleted`);
      gone.push({ attachment, mediaId: old });
    }
    const after = await io.jira<JiraIssueView>('GET', issuePath);
    if (after === null) { throw new Error(`read-back: ${bugKey}: empty response`); }
    for (const { attachment, mediaId } of gone) {
      if ((after.fields.attachment ?? []).some(a => a.id === attachment.id)) { throw new Error(`read-back: ${bugKey} still holds attachment ${attachment.id}`); }
      if (adfHasMedia(after.fields.description, mediaId) || commentsOf(after).some(c => adfHasMedia(c.body, mediaId))) { throw new Error(`read-back: ${bugKey} still shows media ${mediaId}`); }
    }
    readBack(lines, `${bugKey} no longer holds the earlier thumbnail (${gone.map(g => `attachment ${g.attachment.id}`).join(', ')})`);
    return after;
  };

  return {
    kind,

    async attachThumbnail(bugKey, pngPath, run, attachOptions = {}) {
      const lines: string[] = [];
      try {
        const bytes = readPng(pngPath);
        const name = basename(pngPath);
        const target = await resolveRun(run);

        // 1. what the bug already holds: attachments, Description, comments (a fallback may have used one)
        const issuePath = `/rest/api/3/issue/${bugKey}?fields=attachment,description,comment`;
        let before = await io.jira<JiraIssueView>('GET', issuePath);
        if (before === null) { throw new Error(`${bugKey}: empty response`); }

        // An earlier thumbnail (same name, other bytes) may be unredacted: never appended beside it
        const earlier = (before.fields.attachment ?? []).filter(a => a.filename === name && a.size !== bytes.length);
        if (earlier.length > 0) {
          if (attachOptions.replace !== true) {
            throw new Error(`${bugKey}: an earlier thumbnail of this bug is in the tracker (${earlier.map(a => `attachment ${a.id}`).join(', ')}); it may be unredacted; rerun with --replace after a person confirms`);
          }
          before = await removeEarlier(bugKey, issuePath, before, earlier, lines);
        }

        const same = (before.fields.attachment ?? []).find(a => a.filename === name && a.size === bytes.length);
        let mediaId: string | null = null;
        if (same !== undefined) {
          mediaId = await io.mediaId(same.content);
          lines.push(`${bugKey}: ${name} is already attached (attachment ${same.id})`);
        }

        let embedded = false;
        let fellBack = false;
        const inComment = mediaId === null ? undefined : commentsOf(before).find(c => adfHasMedia(c.body, mediaId as string));
        if (mediaId !== null && adfHasMedia(before.fields.description, mediaId)) {
          lines.push(`${bugKey}: the thumbnail is already in the Description, nothing written`);
          embedded = true;
        }
        else if (inComment !== undefined) {
          lines.push(`${bugKey}: the thumbnail is already in its "Evidence" comment ${inComment.id}, nothing written`);
          embedded = true;
          fellBack = true;
        }
        else {
          // 2. upload unless it is there, 3. its media id
          if (mediaId === null) {
            const uploaded = await io.upload(bugKey, pngPath);
            wrote(lines, `${bugKey}: attached ${uploaded.filename} (attachment ${uploaded.id})`);
            mediaId = await io.mediaId(uploaded.content);
          }
          const helpers = await media();
          const size = helpers.imageSize(bytes);
          const node = helpers.buildMediaNode(mediaId, { width: size?.width, height: size?.height, alt: name });

          // 4. append to the Description, or fall back to a structured comment. The Description read in
          // step 1 is written back whole: an edit someone makes in between is lost (a short window).
          let commentId: string | null = null;
          try {
            await io.jira('PUT', `/rest/api/3/issue/${bugKey}`, { fields: { description: appendToDoc(before.fields.description, node) } });
            wrote(lines, `${bugKey}: thumbnail appended to the end of the Description`);
          }
          catch (err) {
            if (!(err instanceof JiraHttpError) || err.status !== 400) { throw err; }
            const comment = await io.jira<JiraComment>('POST', `/rest/api/3/issue/${bugKey}/comment`, { body: evidenceCommentDoc(node) });
            if (comment === null || !comment.id) { throw new Error(`${bugKey}: the fallback comment returned no id`); }
            commentId = comment.id;
            fellBack = true;
            wrote(lines, `${bugKey}: the Description could not be written (${err.message}); thumbnail posted in an "Evidence" comment ${commentId} instead`);
          }

          // 5. read back at the destination
          const after = await io.jira<JiraIssueView>('GET', issuePath);
          const named = (after?.fields.attachment ?? []).filter(a => a.filename === name);
          if (named.length === 0) { throw new Error(`read-back: ${bugKey} holds no attachment named ${name}`); }
          if (!named.some(a => a.size === undefined || a.size === bytes.length)) { throw new Error(`read-back: ${bugKey} ${name} is ${named.map(a => a.size).join(' / ')} bytes, the file is ${bytes.length}`); }
          if (commentId === null) {
            if (!adfHasMedia(after?.fields.description, mediaId)) { throw new Error(`read-back: ${bugKey}'s Description does not hold media ${mediaId}`); }
          }
          else {
            const back = await io.jira<JiraComment>('GET', `/rest/api/3/issue/${bugKey}/comment/${commentId}`);
            if (!adfHasMedia(back?.body, mediaId)) { throw new Error(`read-back: comment ${commentId} on ${bugKey} does not hold media ${mediaId}`); }
          }
          embedded = true;
          readBack(lines, `${bugKey} holds ${name} (${bytes.length} bytes) and the image is in its ${fellBack ? 'Evidence comment' : 'Description'}`);
        }

        // jira-xray: the same PNG as the Test Run's evidence
        if (target !== null) {
          const there = (target.evidence ?? []).some(e => e.filename === name);
          if (there && attachOptions.replace !== true) {
            lines.push(`Test Run ${target.id}: ${name} is already its evidence, nothing written`);
          }
          else {
            if (there) {
              await io.xray(docs.removeEvidenceFromTestRun, { id: target.id, evidenceFilenames: [name], evidenceIds: null });
              wrote(lines, `Test Run ${target.id}: earlier ${name} removed from its evidence`);
            }
            const evidence: AttachmentDataInput[] = [{ filename: name, mimeType: 'image/png', data: Buffer.from(bytes).toString('base64') }];
            await io.xray(docs.addEvidenceToTestRun, { id: target.id, evidence });
            wrote(lines, `Test Run ${target.id}: ${name} added as evidence`);
            const back = await readRun(target.id);
            if ((back.evidence ?? []).filter(e => e.filename === name).length !== 1) { throw new Error(`read-back: Test Run ${target.id} evidence does not list ${name} exactly once`); }
            readBack(lines, `Test Run ${target.id} lists ${name} as evidence`);
          }
        }
        return { ok: true, lines, embedded: embedded && !dryRun, fellBack, ...(dryRun ? { dryRun } : {}) };
      }
      catch (err) {
        return { ok: false, lines, error: (err as Error).message, ...(dryRun ? { dryRun } : {}) };
      }
    },

    async linkEvidence(targetKey, page, run) {
      const lines: string[] = [];
      try {
        const target = await resolveRun(run);
        const globalId = evidenceGlobalId(page.url);
        const title = page.title ?? `${targetKey} Evidence page`;
        await io.jira('POST', `/rest/api/3/issue/${targetKey}/remotelink`, { globalId, relationship: 'Evidence', object: { url: page.url, title } });
        wrote(lines, `${targetKey}: remote link "${title}" -> ${page.url} (globalId ${globalId}: a republish updates it)`);
        const back = await io.jira<JiraRemoteLink | JiraRemoteLink[]>('GET', `/rest/api/3/issue/${targetKey}/remotelink?globalId=${encodeURIComponent(globalId)}`);
        const links = back === null ? [] : Array.isArray(back) ? back : [back];
        const found = links.find(l => l.globalId === globalId);
        if (found === undefined) { throw new Error(`read-back: ${targetKey} has no remote link with globalId ${globalId}`); }
        if (found.object?.url !== page.url) { throw new Error(`read-back: ${targetKey}'s evidence link points at ${found.object?.url ?? '(none)'}, not ${page.url}`); }
        readBack(lines, `${targetKey} links ${page.url}`);

        if (target !== null) {
          const caseId = run?.caseId ?? target.test?.jira?.key;
          if (caseId === undefined) { throw new Error(`Test Run ${target.id}: no test key to name the case; pass --case <id>`); }
          const line = deepLinkLine(page.url, targetKey, caseId);
          const current = target.comment ?? '';
          if (current.split('\n').includes(line)) {
            lines.push(`Test Run ${target.id}: the comment already carries ${line}`);
          }
          else {
            await io.xray(docs.updateTestRunComment, { id: target.id, comment: current === '' ? line : `${current}\n${line}` });
            const after = await readRun(target.id);
            if (!(after.comment ?? '').split('\n').includes(line)) { throw new Error(`read-back: Test Run ${target.id} comment does not carry ${line}`); }
            readBack(lines, `Test Run ${target.id} comment carries ${line}`);
          }
        }
        return { ok: true, lines, ...(dryRun ? { dryRun } : {}) };
      }
      catch (err) {
        return { ok: false, lines, error: (err as Error).message, ...(dryRun ? { dryRun } : {}) };
      }
    },
  };
}

function noneTracker(): EvidenceTracker {
  return {
    kind: 'none',
    async attachThumbnail(bugKey, pngPath) {
      readPng(pngPath);
      return { ok: true, lines: [`no tracker (board.source none): nothing attached to ${bugKey}; the thumbnail stays at ${pngPath} and the report links it`], embedded: false };
    },
    async linkEvidence(targetKey, page) {
      return { ok: true, lines: [`no tracker (board.source none): nothing linked on ${targetKey}; the link lives in the pack's artifact.url and on the board (bun run board evidence-artifact ${targetKey} ${page.url} --by worker)`] };
    },
  };
}

/** `## Evidence` + the image, the shape of the fallback comment (`.agents/jira-required.yaml` fallback convention). */
function evidenceCommentDoc(node: AdfNode): AdfDoc {
  return { type: 'doc', version: 1, content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] }, node] };
}

/** A comment this tool wrote: exactly the `Evidence` heading and one image. */
function isEvidenceComment(body: unknown): boolean {
  if (!isDoc(body) || body.content.length !== 2) { return false; }
  const [heading, image] = body.content;
  return heading.type === 'heading' && heading.content?.[0]?.text === 'Evidence' && image.type === 'mediaSingle';
}

function commentsOf(view: JiraIssueView): JiraComment[] {
  return view.fields.comment?.comments ?? [];
}

function readPng(pngPath: string): Uint8Array {
  if (!existsSync(pngPath)) { throw new Error(`${pngPath}: no such file (build it with bun run evidence build --pack <bug pack> --thumb <png>)`); }
  const bytes = new Uint8Array(readFileSync(pngPath));
  if (!isPng(bytes)) { throw new Error(`${pngPath}: not a PNG by its bytes`); }
  return bytes;
}

// ============================================================================
// DRY RUN: the same code against an in-memory tracker that records every call
// ============================================================================

export interface DryRunIO extends TrackerIO { calls: string[] }

/** Long base64 payloads are printed by size, never inline. */
function printable(body: unknown): string {
  return JSON.stringify(body, (key, value) => (key === 'data' && typeof value === 'string' && value.length > 120 ? `<base64, ${value.length} chars>` : value));
}

export interface DryRunSeed {
  /** `--replace`: the bug starts with an earlier thumbnail of this name (other bytes) in its Description, so the removal calls print too. */
  earlier?: { bugKey: string, filename: string }
}

/**
 * An empty tracker: every issue starts with no attachment, no Description, no
 * comment, no link; the named Test Run exists with no evidence and no comment. So
 * the dry run prints the calls of a first run; a live run reads first and may skip
 * some. With `seed.earlier`, the bug holds an earlier thumbnail, as `--replace` expects.
 */
export function dryRunIO(run?: RunRef, seed: DryRunSeed = {}): DryRunIO {
  const calls: string[] = [];
  const issues = new Map<string, { attachments: JiraAttachment[], description: unknown, comments: JiraComment[], links: JiraRemoteLink[] }>();
  const issue = (key: string) => {
    let state = issues.get(key);
    if (state === undefined) {
      state = { attachments: [], description: null, comments: [], links: [] };
      issues.set(key, state);
    }
    return state;
  };
  if (seed.earlier !== undefined) {
    const state = issue(seed.earlier.bugKey);
    state.attachments.push({ id: '<earlier attachment id>', filename: seed.earlier.filename, size: 0, content: '<earlier attachment content url>' });
    state.description = { type: 'doc', version: 1, content: [{ type: 'mediaSingle', content: [{ type: 'media', attrs: { id: '<earlier media id>' } }] }] };
  }
  const runs = new Map<string, XrayRun>();
  const runOf = (id: string): XrayRun => {
    let state = runs.get(id);
    if (state === undefined) {
      state = { id, comment: '', evidence: [], test: { jira: { key: run !== undefined && 'test' in run ? run.test : undefined } } };
      runs.set(id, state);
    }
    return state;
  };

  return {
    calls,
    async jira<T>(method: JiraMethod, path: string, body?: unknown): Promise<T | null> {
      calls.push(`${method} ${path}${body === undefined ? '' : ` ${printable(body)}`}`);
      const deleted = /^\/rest\/api\/3\/attachment\/(.+)$/.exec(path);
      if (deleted !== null && method === 'DELETE') {
        for (const state of issues.values()) { state.attachments = state.attachments.filter(a => a.id !== decodeURIComponent(deleted[1])); }
        return null;
      }
      const m = /^\/rest\/api\/3\/issue\/([^/?]+)(\/[^?]*)?(?:\?(.*))?$/.exec(path);
      if (m === null) { return null; }
      const [, key, sub = '', query = ''] = m;
      const state = issue(key);
      if (sub === '' && method === 'GET') { return { key, fields: { attachment: state.attachments, description: state.description, comment: { comments: state.comments } } } as T; }
      if (sub === '' && method === 'PUT') {
        state.description = (body as { fields: { description: unknown } }).fields.description;
        return null;
      }
      if (sub === '/comment' && method === 'POST') {
        const comment = { id: '<new comment id>', body: (body as { body: unknown }).body };
        state.comments.push(comment);
        return comment as T;
      }
      if (sub.startsWith('/comment/')) {
        const id = decodeURIComponent(sub.slice('/comment/'.length));
        if (method === 'DELETE') {
          state.comments = state.comments.filter(c => c.id !== id);
          return null;
        }
        return (state.comments.find(c => c.id === id) ?? null) as T;
      }
      if (sub === '/remotelink' && method === 'POST') {
        const link = body as JiraRemoteLink;
        state.links = [...state.links.filter(l => l.globalId !== link.globalId), { ...link, id: '<link id>' }];
        return { id: '<link id>' } as T;
      }
      if (sub === '/remotelink') {
        const globalId = new URLSearchParams(query).get('globalId');
        return state.links.filter(l => globalId === null || l.globalId === globalId) as T;
      }
      return null;
    },
    async upload(issueKey, filePath) {
      const bytes = readFileSync(filePath);
      calls.push(`POST /rest/api/3/issue/${issueKey}/attachments multipart file=${basename(filePath)} (${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex')}) header X-Atlassian-Token: no-check`);
      const attachment = { id: '<new attachment id>', filename: basename(filePath), size: bytes.length, content: '<attachment content url>' };
      issue(issueKey).attachments.push(attachment);
      return attachment;
    },
    async mediaId(contentUrl) {
      calls.push(`GET ${contentUrl} (redirect not followed: the media id is read from its Location)`);
      return contentUrl.includes('earlier') ? '<earlier media id>' : '<media id>';
    },
    async xray<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      const name = /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'GraphQL';
      calls.push(`Xray GraphQL ${name} ${printable(variables)}`);
      if (name === 'GetTestExecution') {
        return { getTestExecution: { testRuns: { results: [runOf('<run id>')] } } } as T;
      }
      if (name === 'GetTestRunById') { return { getTestRunById: runOf(String(variables.id)) } as T; }
      if (name === 'AddEvidenceToTestRun') {
        const target = runOf(String(variables.id));
        target.evidence = [...(target.evidence ?? []), ...(variables.evidence as AttachmentDataInput[]).map(e => ({ id: '<evidence id>', filename: e.filename }))];
        return { addEvidenceToTestRun: { addedEvidence: [], warnings: [] } } as T;
      }
      if (name === 'RemoveEvidenceFromTestRun') {
        const target = runOf(String(variables.id));
        target.evidence = (target.evidence ?? []).filter(e => !(variables.evidenceFilenames as string[]).includes(e.filename));
        return { removeEvidenceFromTestRun: { removedEvidence: [], warnings: [] } } as T;
      }
      if (name === 'UpdateTestRunComment') {
        runOf(String(variables.id)).comment = String(variables.comment);
        return { updateTestRunComment: null } as T;
      }
      return {} as T;
    },
    async issueId(key) {
      calls.push(`GET /rest/api/3/issue/${key}?fields=issuetype (the numeric id Xray takes)`);
      return `<id of ${key}>`;
    },
  };
}

// ============================================================================
// LIVE
// ============================================================================

const ACLI_MEDIA_HELPER = '../../../.agents/skills/acli/scripts/jira-attach-media.ts';

/** The acli skill's media helpers, loaded only when a tracker write needs them. */
export async function loadMediaHelpers(): Promise<MediaHelpers & { readCredential: (name: string) => string | null, uploadAttachment: (key: string, path: string) => Promise<UploadedAttachment>, resolveMediaId: (url: string) => Promise<string> }> {
  return import(ACLI_MEDIA_HELPER);
}

/**
 * The live IO, built from the repo's existing clients. For `attach`, both credential
 * readers (the acli helper reads the environment then `.env.local` / `.env`; the REST
 * transport reads the environment then the `bun xray auth login` store) are checked
 * BEFORE the first call, so a run never writes half of its steps. `link` never
 * uploads, so it checks the transport's only.
 */
export async function liveTrackerIO(operation: 'attach' | 'link'): Promise<{ io: TrackerIO, docs: XrayDocs }> {
  const helper = await loadMediaHelpers();
  if (operation === 'attach') {
    const names = ['ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'];
    const missing = names.filter(n => helper.readCredential(n) === null);
    if (missing.length > 0) {
      throw new Error(`Jira credentials not set for the upload: ${missing.join(', ')}. Fill them in .env (see .env.example), then restart the agent session.`);
    }
  }
  const { jiraAuth, jiraRequest } = await import('../sprint-source/transport.ts');
  const auth = jiraAuth();
  const { graphql, MUTATIONS, QUERIES } = await import('../../xray/lib/graphql.ts');
  const { resolveIssueId } = await import('../../xray/lib/jira.ts');
  return {
    io: {
      jira: async (method, path, body) => jiraRequest(auth, method, path, body),
      upload: helper.uploadAttachment,
      mediaId: helper.resolveMediaId,
      xray: graphql,
      issueId: resolveIssueId,
    },
    docs: xrayDocs(QUERIES, MUTATIONS),
  };
}

export function xrayDocs(queries: Record<string, string>, mutations: Record<string, string>): XrayDocs {
  return {
    getTestExecution: queries.getTestExecution,
    getTestRunById: queries.getTestRunById,
    addEvidenceToTestRun: mutations.addEvidenceToTestRun,
    removeEvidenceFromTestRun: mutations.removeEvidenceFromTestRun,
    updateTestRunComment: mutations.updateTestRunComment,
  };
}
