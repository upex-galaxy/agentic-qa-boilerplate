import type { AdfDoc, MediaHelpers, TrackerIO, UploadedAttachment, XrayDocs } from './tracker.ts';

import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';

import { MUTATIONS, QUERIES } from '../../xray/lib/graphql.ts';
import { JiraHttpError } from '../sprint-source/transport.ts';
import { adfHasMedia, appendToDoc, createEvidenceTracker, deepLinkLine, dryRunIO, evidenceGlobalId, loadMediaHelpers, removeMedia, xrayDocs } from './tracker.ts';

const HERE = import.meta.dir;
const recorded = <T>(name: string): T => JSON.parse(readFileSync(join(HERE, 'fixtures', 'recorded', name), 'utf8')) as T;

const DOCS: XrayDocs = xrayDocs(QUERIES, MUTATIONS);
const MEDIA = '0a1b2c3d-0000-4000-8000-000000007202';
const PAGE = 'https://claude.ai/artifact/0000aaaa-7001';

/** Every temp dir a test made, removed after the suite whatever its outcome. */
const TEMP: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-tracker-'));
  TEMP.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of TEMP) { rmSync(dir, { recursive: true, force: true }); }
});

/** The bug's thumbnail: a real PNG, under the name the build gives it. */
function thumbnail(): { path: string, size: number } {
  const dir = tempDir();
  const path = join(dir, 'ACME-7101-thumbnail.png');
  copyFileSync(join(HERE, 'fixtures', 'demo', 'checkout-error.png'), path);
  return { path, size: statSync(path).size };
}

const media = async (): Promise<MediaHelpers> => {
  const helper = await loadMediaHelpers();
  return { buildMediaNode: helper.buildMediaNode, imageSize: helper.imageSize };
};

type Step
  = | { op: 'jira', method: string, path: string, reply?: unknown, fail?: number, check?: (body: unknown) => void }
    | { op: 'upload', key: string, reply: UploadedAttachment }
    | { op: 'mediaId', url: string, reply: string }
    | { op: 'xray', name: string, reply: unknown, check?: (variables: Record<string, unknown>) => void }
    | { op: 'issueId', key: string, reply: string };

/** Replays the recorded responses in order and fails on any call the script did not expect. */
function replay(steps: Step[]): TrackerIO & { left: () => number } {
  const queue = [...steps];
  const next = <S extends Step['op']>(op: S, what: string): Extract<Step, { op: S }> => {
    const step = queue.shift();
    if (step === undefined) { throw new Error(`unexpected call ${op} ${what}: the recorded script is over`); }
    if (step.op !== op) { throw new Error(`expected ${step.op}, got ${op} ${what}`); }
    return step as Extract<Step, { op: S }>;
  };
  return {
    left: () => queue.length,
    async jira<T>(method: string, path: string, body?: unknown) {
      const step = next('jira', `${method} ${path}`);
      expect(`${method} ${path}`).toBe(`${step.method} ${step.path}`);
      step.check?.(body);
      if (step.fail !== undefined) { throw new JiraHttpError(method, path, step.fail, 'Bad Request'); }
      return (step.reply ?? null) as T | null;
    },
    async upload(key, filePath) {
      const step = next('upload', key);
      expect(key).toBe(step.key);
      expect(filePath.endsWith('ACME-7101-thumbnail.png')).toBe(true);
      return step.reply;
    },
    async mediaId(url) {
      const step = next('mediaId', url);
      expect(url).toBe(step.url);
      return step.reply;
    },
    async xray<T>(query: string, variables: Record<string, unknown>) {
      const name = /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? '';
      const step = next('xray', name);
      expect(name).toBe(step.name);
      step.check?.(variables);
      return step.reply as T;
    },
    async issueId(key) {
      const step = next('issueId', key);
      expect(key).toBe(step.key);
      return step.reply;
    },
  };
}

interface IssueView { key: string, fields: { attachment: Array<{ id: string, filename: string, size?: number, content: string }>, description: unknown } }

const before = (): IssueView => recorded<IssueView>('jira-bug-before.json');
const uploaded = (size: number): UploadedAttachment & { size: number } => ({ ...recorded<Array<UploadedAttachment & { size: number }>>('jira-attachments-upload.json')[0], size });
function withThumbnail(view: IssueView, size: number, inDescription: boolean): IssueView {
  const next = structuredClone(view);
  next.fields.attachment.push({ id: '7202', filename: 'ACME-7101-thumbnail.png', size, content: 'https://acme.example/rest/api/3/attachment/content/7202' });
  if (inDescription) { next.fields.description = appendToDoc(next.fields.description, { type: 'mediaSingle', attrs: { layout: 'center' }, content: [{ type: 'media', attrs: { type: 'file', id: MEDIA, collection: '' } }] }); }
  return next;
}
const ISSUE = '/rest/api/3/issue/ACME-7101?fields=attachment,description,comment';

describe('adf helpers', () => {
  it('appends at the end and never edits what is there', () => {
    const doc = before().fields.description as AdfDoc;
    const next = appendToDoc(doc, { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: MEDIA } }] });
    expect(next.content.slice(0, doc.content.length)).toEqual(doc.content);
    expect(next.content.at(-1)?.type).toBe('mediaSingle');
    expect(adfHasMedia(next, MEDIA)).toBe(true);
    expect(adfHasMedia(doc, MEDIA)).toBe(false);
  });

  it('turns a missing Description into a fresh doc, and refuses one that is not ADF', () => {
    expect(appendToDoc(null, { type: 'mediaSingle' })).toEqual({ type: 'doc', version: 1, content: [{ type: 'mediaSingle' }] });
    expect(() => appendToDoc('plain text', { type: 'mediaSingle' })).toThrow('not an ADF document');
  });

  it('removes only the blocks that hold the media id', () => {
    const doc = appendToDoc(before().fields.description, { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: MEDIA } }] });
    expect(removeMedia(doc, MEDIA)).toEqual(before().fields.description as AdfDoc);
  });

  it('keys a link by the page, not by the deep link', () => {
    expect(evidenceGlobalId(`${PAGE}#ACME-7001.TC2`)).toBe(evidenceGlobalId(PAGE));
    expect(deepLinkLine(`${PAGE}#x`, 'ACME-7001', 'ACME-7111')).toBe(`Evidence: ${PAGE}#ACME-7001.ACME-7111`);
  });
});

describe('attachThumbnail on jira-native', () => {
  it('uploads, resolves the media id, appends to the Description and reads it back', async () => {
    const png = thumbnail();
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: before() },
      { op: 'upload', key: 'ACME-7101', reply: uploaded(png.size) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
      {
        op: 'jira',
        method: 'PUT',
        path: '/rest/api/3/issue/ACME-7101',
        check: (body) => {
          const doc = (body as { fields: { description: AdfDoc } }).fields.description;
          expect(doc.content.slice(0, 3)).toEqual((before().fields.description as AdfDoc).content);
          expect(doc.content).toHaveLength(4);
          expect(adfHasMedia(doc.content[3], MEDIA)).toBe(true);
          expect(doc.content[3].content?.[0].attrs).toMatchObject({ alt: 'ACME-7101-thumbnail.png', width: expect.any(Number), height: expect.any(Number) });
        },
      },
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(before(), png.size, true) },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path);
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ ok: true, embedded: true, fellBack: false });
    expect(result.lines.at(-1)).toContain('read-back OK');
    expect(io.left()).toBe(0);
  });

  it('skips when the same file is attached and already in the Description', async () => {
    const png = thumbnail();
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(before(), png.size, true) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path);
    expect(result).toMatchObject({ ok: true, embedded: true });
    expect(result.lines.join('\n')).toContain('already in the Description');
    expect(io.left()).toBe(0);
  });

  it('embeds an attachment that is there but not in the Description, without a second upload', async () => {
    const png = thumbnail();
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(before(), png.size, false) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
      { op: 'jira', method: 'PUT', path: '/rest/api/3/issue/ACME-7101' },
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(before(), png.size, true) },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path);
    expect(result).toMatchObject({ ok: true, embedded: true });
    expect(io.left()).toBe(0);
  });

  it('wraps a null Description in a fresh doc', async () => {
    const png = thumbnail();
    const empty = before();
    empty.fields.description = null;
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: empty },
      { op: 'upload', key: 'ACME-7101', reply: uploaded(png.size) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
      { op: 'jira', method: 'PUT', path: '/rest/api/3/issue/ACME-7101', check: body => expect((body as { fields: { description: AdfDoc } }).fields.description.content).toHaveLength(1) },
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(empty, png.size, true) },
    ]);
    expect((await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path)).ok).toBe(true);
  });

  it('falls back to an Evidence comment when the Description cannot be edited, and reads the comment back', async () => {
    const png = thumbnail();
    const comment = recorded<{ id: string, body: AdfDoc }>('jira-comment.json');
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: before() },
      { op: 'upload', key: 'ACME-7101', reply: uploaded(png.size) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
      { op: 'jira', method: 'PUT', path: '/rest/api/3/issue/ACME-7101', fail: 400 },
      {
        op: 'jira',
        method: 'POST',
        path: '/rest/api/3/issue/ACME-7101/comment',
        reply: comment,
        check: (body) => {
          const doc = (body as { body: AdfDoc }).body;
          expect(doc.content[0]).toMatchObject({ type: 'heading', content: [{ text: 'Evidence' }] });
          expect(adfHasMedia(doc, MEDIA)).toBe(true);
        },
      },
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(before(), png.size, false) },
      { op: 'jira', method: 'GET', path: '/rest/api/3/issue/ACME-7101/comment/7301', reply: { ...comment, body: appendToDoc(null, { type: 'media', attrs: { id: MEDIA } }) } },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path);
    expect(result).toMatchObject({ ok: true, embedded: true, fellBack: true });
    expect(result.lines.join('\n')).toContain('Evidence" comment 7301');
  });

  it('fails when the read-back does not hold the image, naming the media id', async () => {
    const png = thumbnail();
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: before() },
      { op: 'upload', key: 'ACME-7101', reply: uploaded(png.size) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
      { op: 'jira', method: 'PUT', path: '/rest/api/3/issue/ACME-7101' },
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(before(), png.size, false) },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(`does not hold media ${MEDIA}`);
  });

  it('fails when the stored attachment size differs from the file', async () => {
    const png = thumbnail();
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: before() },
      { op: 'upload', key: 'ACME-7101', reply: uploaded(png.size) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
      { op: 'jira', method: 'PUT', path: '/rest/api/3/issue/ACME-7101' },
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(before(), png.size - 1, true) },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(`the file is ${png.size}`);
  });

  it('refuses a file that is not a PNG before any call', async () => {
    const path = join(tempDir(), 'ACME-7101-thumbnail.png');
    writeFileSync(path, 'not an image');
    const io = replay([]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', path);
    expect(result.error).toContain('not a PNG');
  });

  it('refuses a Test Run on jira-native before any call', async () => {
    const png = thumbnail();
    const result = await createEvidenceTracker('jira-native', replay([]), DOCS, media).attachThumbnail('ACME-7101', png.path, { runId: 'run-7111' });
    expect(result.error).toContain('Test Run is an Xray object');
  });
});

describe('attachThumbnail on jira-xray with a Test Run', () => {
  it('resolves the run first, embeds in the bug, then adds the PNG as run evidence and reads it back', async () => {
    const png = thumbnail();
    const run = recorded<{ getTestRunById: { evidence: Array<{ id: string, filename: string }> } }>('xray-test-run.json');
    const after = structuredClone(run);
    after.getTestRunById.evidence.push({ id: 'ev-7502', filename: 'ACME-7101-thumbnail.png' });
    const io = replay([
      { op: 'issueId', key: 'ACME-7141', reply: '17141' },
      { op: 'xray', name: 'GetTestExecution', reply: recorded('xray-test-execution.json'), check: v => expect(v).toEqual({ issueId: '17141' }) },
      { op: 'xray', name: 'GetTestRunById', reply: run, check: v => expect(v).toEqual({ id: 'run-7111' }) },
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(before(), png.size, true) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
      {
        op: 'xray',
        name: 'AddEvidenceToTestRun',
        reply: { addEvidenceToTestRun: { addedEvidence: ['ev-7502'], warnings: [] } },
        check: (v) => {
          const evidence = v.evidence as Array<{ filename: string, mimeType: string, data: string }>;
          expect(v.id).toBe('run-7111');
          expect(evidence).toHaveLength(1);
          expect(evidence[0]).toMatchObject({ filename: 'ACME-7101-thumbnail.png', mimeType: 'image/png' });
          expect(Buffer.from(evidence[0].data, 'base64').length).toBe(png.size);
        },
      },
      { op: 'xray', name: 'GetTestRunById', reply: after },
    ]);
    const result = await createEvidenceTracker('jira-xray', io, DOCS, media).attachThumbnail('ACME-7101', png.path, { test: 'ACME-7111', execution: 'ACME-7141' });
    expect(result.error).toBeUndefined();
    expect(result.lines.at(-1)).toBe('read-back OK: Test Run run-7111 lists ACME-7101-thumbnail.png as evidence');
    expect(io.left()).toBe(0);
  });

  it('writes nothing when the test has no run in the execution', async () => {
    const png = thumbnail();
    const io = replay([
      { op: 'issueId', key: 'ACME-7141', reply: '17141' },
      { op: 'xray', name: 'GetTestExecution', reply: recorded('xray-test-execution.json') },
    ]);
    const result = await createEvidenceTracker('jira-xray', io, DOCS, media).attachThumbnail('ACME-7101', png.path, { test: 'ACME-7999', execution: 'ACME-7141' });
    expect(result.error).toContain('ACME-7999 has no run in ACME-7141');
    expect(io.left()).toBe(0);
  });
});

describe('a second attach and an earlier thumbnail (review round)', () => {
  const OLD = '0a1b2c3d-0000-4000-8000-000000007209';
  const OLD_URL = 'https://acme.example/rest/api/3/attachment/content/7209';
  /** The bug after an earlier attach: a thumbnail of the same name, OTHER bytes, embedded where `where` says. */
  function withEarlier(where: 'description' | 'comment' | 'nowhere'): IssueView & { fields: { comment?: { comments: Array<{ id: string, body: unknown }> } } } {
    const view = structuredClone(before()) as IssueView & { fields: { comment?: { comments: Array<{ id: string, body: unknown }> } } };
    view.fields.attachment.push({ id: '7209', filename: 'ACME-7101-thumbnail.png', size: 1234, content: OLD_URL });
    const node = { type: 'mediaSingle', attrs: { layout: 'center' }, content: [{ type: 'media', attrs: { type: 'file', id: OLD, collection: '' } }] };
    if (where === 'description') { view.fields.description = appendToDoc(view.fields.description, node); }
    if (where === 'comment') { view.fields.comment!.comments.push({ id: '7302', body: { type: 'doc', version: 1, content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] }, node] } }); }
    return view;
  }

  it('M1: after a comment fallback, a second attach finds the image in the Evidence comment and writes nothing', async () => {
    const png = thumbnail();
    const view = withThumbnail(before(), png.size, false) as IssueView & { fields: { comment: { comments: Array<{ id: string, body: unknown }> } } };
    view.fields.comment.comments.push({ id: '7301', body: { type: 'doc', version: 1, content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] }, { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: MEDIA } }] }] } });
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: view },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path);
    expect(result).toMatchObject({ ok: true, embedded: true, fellBack: true });
    expect(result.lines.at(-1)).toContain('already in its "Evidence" comment 7301');
    expect(io.left()).toBe(0);
  });

  it('M1 (reviewer repro): two attach runs on a tracker whose Description refuses edits post ONE comment and ONE upload', async () => {
    const png = thumbnail();
    const io = dryRunIO();
    const refusing = { ...io, jira: async <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) => {
      if (method === 'PUT') { throw new JiraHttpError(method, path, 400, 'Bad Request: Field description cannot be set'); }
      return io.jira<T>(method, path, body);
    } };
    const tracker = createEvidenceTracker('jira-native', refusing, DOCS, media);
    const first = await tracker.attachThumbnail('ACME-7101', png.path);
    const second = await tracker.attachThumbnail('ACME-7101', png.path);
    expect(first).toMatchObject({ ok: true, fellBack: true });
    expect(first.lines.join('\n')).toContain('Field description cannot be set');
    expect(second).toMatchObject({ ok: true, embedded: true, fellBack: true });
    expect(io.calls.filter(c => c.startsWith('POST /rest/api/3/issue/ACME-7101/comment'))).toHaveLength(1);
    expect(io.calls.filter(c => c.includes('/attachments multipart'))).toHaveLength(1);
  });

  it('S3: an earlier thumbnail with other bytes is refused without --replace, before any write', async () => {
    const png = thumbnail();
    const io = replay([{ op: 'jira', method: 'GET', path: ISSUE, reply: withEarlier('description') }]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ACME-7101: an earlier thumbnail of this bug is in the tracker (attachment 7209); it may be unredacted; rerun with --replace after a person confirms');
    expect(io.left()).toBe(0);
  });

  it('S3: --replace takes the old image out of the Description, deletes its attachment, reads back, then attaches the new one', async () => {
    const png = thumbnail();
    const earlier = withEarlier('description');
    const cleaned = structuredClone(before());
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: earlier },
      { op: 'mediaId', url: OLD_URL, reply: OLD },
      { op: 'jira', method: 'PUT', path: '/rest/api/3/issue/ACME-7101', check: body => expect((body as { fields: { description: AdfDoc } }).fields.description).toEqual(before().fields.description as AdfDoc) },
      { op: 'jira', method: 'DELETE', path: '/rest/api/3/attachment/7209' },
      { op: 'jira', method: 'GET', path: ISSUE, reply: cleaned },
      { op: 'upload', key: 'ACME-7101', reply: uploaded(png.size) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
      { op: 'jira', method: 'PUT', path: '/rest/api/3/issue/ACME-7101', check: body => expect(adfHasMedia((body as { fields: { description: AdfDoc } }).fields.description, OLD)).toBe(false) },
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(cleaned, png.size, true) },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path, undefined, { replace: true });
    expect(result.error).toBeUndefined();
    expect(result.lines).toContain('read-back OK: ACME-7101 no longer holds the earlier thumbnail (attachment 7209)');
    expect(io.left()).toBe(0);
  });

  it('S3: --replace deletes an earlier Evidence comment the fallback wrote', async () => {
    const png = thumbnail();
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: withEarlier('comment') },
      { op: 'mediaId', url: OLD_URL, reply: OLD },
      { op: 'jira', method: 'DELETE', path: '/rest/api/3/issue/ACME-7101/comment/7302' },
      { op: 'jira', method: 'DELETE', path: '/rest/api/3/attachment/7209' },
      { op: 'jira', method: 'GET', path: ISSUE, reply: before() },
      { op: 'upload', key: 'ACME-7101', reply: uploaded(png.size) },
      { op: 'mediaId', url: 'https://acme.example/rest/api/3/attachment/content/7202', reply: MEDIA },
      { op: 'jira', method: 'PUT', path: '/rest/api/3/issue/ACME-7101' },
      { op: 'jira', method: 'GET', path: ISSUE, reply: withThumbnail(before(), png.size, true) },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path, undefined, { replace: true });
    expect(result.error).toBeUndefined();
    expect(io.left()).toBe(0);
  });

  it('S3: --replace leaves an attachment it did not embed to a person', async () => {
    const png = thumbnail();
    const io = replay([
      { op: 'jira', method: 'GET', path: ISSUE, reply: withEarlier('nowhere') },
      { op: 'mediaId', url: OLD_URL, reply: OLD },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).attachThumbnail('ACME-7101', png.path, undefined, { replace: true });
    expect(result.error).toContain('evidence attach did not embed it; remove it by hand');
    expect(io.left()).toBe(0);
  });

  it('S3: --replace --dry-run prints the removal calls against a seeded earlier thumbnail', async () => {
    const png = thumbnail();
    const io = dryRunIO(undefined, { earlier: { bugKey: 'ACME-7101', filename: 'ACME-7101-thumbnail.png' } });
    const result = await createEvidenceTracker('jira-native', io, DOCS, media, { dryRun: true }).attachThumbnail('ACME-7101', png.path, undefined, { replace: true });
    expect(result.error).toBeUndefined();
    expect(io.calls).toContain('DELETE /rest/api/3/attachment/<earlier attachment id>');
    expect(io.calls.some(c => c.startsWith('PUT /rest/api/3/issue/ACME-7101 {"fields":{"description":{"type":"doc","version":1,"content":[]}}}'))).toBe(true);
  });
});

describe('linkEvidence', () => {
  const LINKS = '/rest/api/3/issue/ACME-7001/remotelink';
  const READ = `${LINKS}?globalId=${encodeURIComponent(evidenceGlobalId(PAGE))}`;

  it('posts a remote link keyed by the page and reads it back', async () => {
    const io = replay([
      { op: 'jira', method: 'POST', path: LINKS, reply: { id: 7401 }, check: body => expect(body).toEqual({ globalId: evidenceGlobalId(PAGE), relationship: 'Evidence', object: { url: PAGE, title: 'ACME-7001 Evidence page' } }) },
      { op: 'jira', method: 'GET', path: READ, reply: recorded('jira-remotelink.json') },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).linkEvidence('ACME-7001', { url: PAGE });
    expect(result).toMatchObject({ ok: true });
    expect(result.lines.at(-1)).toBe(`read-back OK: ACME-7001 links ${PAGE}`);
  });

  it('fails when the link read back points elsewhere', async () => {
    const stale = recorded<Array<{ object: { url: string } }>>('jira-remotelink.json');
    stale[0].object.url = 'https://claude.ai/artifact/0000aaaa-7999';
    const io = replay([
      { op: 'jira', method: 'POST', path: LINKS, reply: { id: 7401 } },
      { op: 'jira', method: 'GET', path: READ, reply: stale },
    ]);
    const result = await createEvidenceTracker('jira-native', io, DOCS, media).linkEvidence('ACME-7001', { url: PAGE });
    expect(result.error).toContain('points at https://claude.ai/artifact/0000aaaa-7999');
  });

  it('appends the TC deep link to the run comment once, on jira-xray', async () => {
    const run = recorded<{ getTestRunById: { comment: string } }>('xray-test-run.json');
    const line = deepLinkLine(PAGE, 'ACME-7001', 'ACME-7111');
    const after = structuredClone(run);
    after.getTestRunById.comment = `${run.getTestRunById.comment}\n${line}`;
    const io = replay([
      { op: 'xray', name: 'GetTestRunById', reply: run },
      { op: 'jira', method: 'POST', path: LINKS, reply: { id: 7401 } },
      { op: 'jira', method: 'GET', path: READ, reply: recorded('jira-remotelink.json') },
      { op: 'xray', name: 'UpdateTestRunComment', reply: { updateTestRunComment: null }, check: v => expect(v).toEqual({ id: 'run-7111', comment: after.getTestRunById.comment }) },
      { op: 'xray', name: 'GetTestRunById', reply: after },
    ]);
    const result = await createEvidenceTracker('jira-xray', io, DOCS, media).linkEvidence('ACME-7001', { url: PAGE }, { runId: 'run-7111' });
    expect(result.error).toBeUndefined();
    expect(result.lines.at(-1)).toBe(`read-back OK: Test Run run-7111 comment carries ${line}`);

    const again = replay([
      { op: 'xray', name: 'GetTestRunById', reply: after },
      { op: 'jira', method: 'POST', path: LINKS, reply: { id: 7401 } },
      { op: 'jira', method: 'GET', path: READ, reply: recorded('jira-remotelink.json') },
    ]);
    const second = await createEvidenceTracker('jira-xray', again, DOCS, media).linkEvidence('ACME-7001', { url: PAGE }, { runId: 'run-7111' });
    expect(second.lines.at(-1)).toContain('already carries');
    expect(again.left()).toBe(0);
  });
});

describe('none and dry run', () => {
  it('none writes nothing and says where things live', async () => {
    const png = thumbnail();
    const tracker = createEvidenceTracker('none', replay([]), DOCS, media);
    expect((await tracker.attachThumbnail('ACME-7101', png.path)).lines[0]).toContain(`the thumbnail stays at ${png.path}`);
    expect((await tracker.linkEvidence('ACME-7001', { url: PAGE })).lines[0]).toContain(`bun run board evidence-artifact ACME-7001 ${PAGE} --by worker`);
  });

  it('S1: a dry run never claims a read-back and nothing counts as embedded', async () => {
    const png = thumbnail();
    const tracker = createEvidenceTracker('jira-native', dryRunIO(), DOCS, media, { dryRun: true });
    for (const result of [await tracker.attachThumbnail('ACME-7101', png.path), await tracker.linkEvidence('ACME-7001', { url: PAGE })]) {
      expect(result).toMatchObject({ ok: true, dryRun: true });
      expect(result.lines.join('\n')).not.toContain('read-back OK');
      expect(result.lines.some(l => l.startsWith('DRY RUN: read-back not performed'))).toBe(true);
      expect(result.embedded ?? false).toBe(false);
    }
  });

  it('a dry run records every call of a first run and sends nothing', async () => {
    const png = thumbnail();
    const io = dryRunIO({ test: 'ACME-7111', execution: 'ACME-7141' });
    const tracker = createEvidenceTracker('jira-xray', io, DOCS, media);
    const attach = await tracker.attachThumbnail('ACME-7101', png.path, { test: 'ACME-7111', execution: 'ACME-7141' });
    expect(attach.error).toBeUndefined();
    expect(io.calls[0]).toBe('GET /rest/api/3/issue/ACME-7141?fields=issuetype (the numeric id Xray takes)');
    expect(io.calls).toContain(`GET ${ISSUE}`);
    expect(io.calls.some(c => c.startsWith('POST /rest/api/3/issue/ACME-7101/attachments multipart file=ACME-7101-thumbnail.png') && c.includes('X-Atlassian-Token: no-check'))).toBe(true);
    expect(io.calls.some(c => c.startsWith('PUT /rest/api/3/issue/ACME-7101 {"fields":{"description"'))).toBe(true);
    expect(io.calls.some(c => c.startsWith('Xray GraphQL AddEvidenceToTestRun') && c.includes('<base64,'))).toBe(true);
    const link = await tracker.linkEvidence('ACME-7001', { url: PAGE }, { test: 'ACME-7111', execution: 'ACME-7141' });
    expect(link.error).toBeUndefined();
    expect(io.calls.some(c => c.startsWith('Xray GraphQL UpdateTestRunComment'))).toBe(true);
  });
});
