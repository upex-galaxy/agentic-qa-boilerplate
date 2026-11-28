import type { Redactor } from './redact.ts';

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, join, sep } from 'node:path';

import { HIDDEN, isSecretName, MARKER } from './redact.ts';

export type TestStatus = 'passed' | 'failed' | 'broken' | 'skipped' | 'known-defect' | 'unknown';

export interface OneshotDefect {
  ticket: string
  outcome: 'expected' | 'unexpected-pass'
  inferred: boolean
}

export interface OneshotParameter {
  name: string
  value: string
}

export interface OneshotLink {
  name: string
  url: string
  type: string
}

export interface OneshotStep {
  name: string
  status: TestStatus
  duration: number
  parameters: OneshotParameter[]
  steps: OneshotStep[]
  atcId: string | null
}

export interface OneshotAttachment {
  name: string
  type: string
  kind: 'image' | 'video' | 'text' | 'omitted'
  body: string
  bytes: number
}

export interface OneshotTest {
  uuid: string
  name: string
  fullName: string
  status: TestStatus
  start: number
  stop: number
  duration: number
  project: string
  parentSuite: string
  suite: string
  subSuite: string
  tags: string[]
  description: string
  parameters: OneshotParameter[]
  links: OneshotLink[]
  atcIds: string[]
  message: string
  trace: string
  steps: OneshotStep[]
  attachments: OneshotAttachment[]
  historyId: string
  scaffolding: boolean
  attempts: number
  defect: OneshotDefect | null
}

export interface OneshotSummary {
  total: number
  scaffolding: number
  scaffoldingFailed: number
  passed: number
  failed: number
  broken: number
  skipped: number
  knownDefects: number
  unexpectedPasses: number
  unknown: number
  passRate: number
  wallMs: number
  cpuMs: number
  startedAt: number
  finishedAt: number
}

export interface HistoryPoint {
  label: string
  at: string
  passed: number
  failed: number
  total: number
  url: string
}

export interface FailureSignature {
  signature: string
  sample: string
  testNames: string[]
  atcIds: string[]
}

export interface OneshotInputs {
  filesInDir: number
  files: number
  parsed: number
  entries: number
  renderable: boolean
  emptyReason: string
  historyUnreadable: boolean
}

export interface OneshotModel {
  reportName: string
  environment: string
  runUrl: string
  generatedAt: number
  summary: OneshotSummary
  tests: OneshotTest[]
  projects: string[]
  tags: string[]
  envProps: OneshotParameter[]
  signatures: FailureSignature[]
  history: HistoryPoint[]
  inputs: OneshotInputs
}

const ARCHIVE_EXTENSIONS = new Set(['.zip', '.har', '.gz', '.tgz', '.tar', '.7z', '.rar', '.bz2', '.xz', '.trace', '.network']);
const ARCHIVE_TYPES = /zip|\bhar\b|playwright-trace|compressed|x-tar/i;
const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const VIDEO_MIME: Record<string, string> = { '.webm': 'video/webm', '.mp4': 'video/mp4' };

const TEXT_LIMIT_BYTES = 64 * 1024;

const ATC_PATTERN = /\bATC\s*\[([^\]\n]{1,200})\]:/i;
const DECORATED_TITLE = /^((?:[\s\S]*?\bATC\s*\[[^\]\n]{1,200}\]:\s*)?[\w$]+(?:\.[\w$]+)*)\([\s\S]*/;
const DEFECT_KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const BLOCKED_BY = /^Blocked by ([A-Z][A-Z0-9]+-\d+)(?![\w-])/;
const MARKER_STEP = /^(known-defect|fail): ([\s\S]*)$/;

export const NO_ERROR = 'No error recorded';

const SAMPLE_LINES = 8;

export function signatureOf(message: string): string {
  const head = message
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(0, 2)
    .join(' ');

  return head
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, '\'…\'')
    .replace(/\b[0-9a-f]{8,}\b/gi, '#')
    .replace(/\b\d+(?:\.\d+)?\b/g, '#')
    .replace(/\s+/g, ' ')
    .slice(0, 220);
}

type RawNode = Record<string, unknown>;

interface RawPair { name?: unknown, value?: unknown, mode?: unknown, excluded?: unknown }

function listOf<T = RawNode>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter(item => item !== null && typeof item === 'object') as T[] : [];
}

function labelOf(labels: RawPair[], name: string): string {
  return String(labels.find(l => l.name === name)?.value ?? '');
}

export interface Annotation {
  type: string
  description: string
}

// allure-playwright writes a declared annotation as a step with no clock, and drops one pushed while the test runs.
function isAnnotationStep(step: RawNode): boolean {
  return step.start === undefined && step.stop === undefined && MARKER_STEP.test(String(step.name ?? ''));
}

function readAnnotations(rawSteps: unknown): Annotation[] {
  return listOf(rawSteps).filter(isAnnotationStep).map((step) => {
    const [, type, description] = MARKER_STEP.exec(String(step.name)) as RegExpExecArray;
    return { type, description: description === 'undefined' ? '' : description };
  });
}

function blockedKeys(tags: string[]): string[] {
  return tags.map(t => t.replace(/^@/, '')).filter(t => t.startsWith('blocked:')).map(t => t.slice('blocked:'.length).trim());
}

export function knownDefectKey(annotations: Annotation[], tags: string[]): string | null {
  const exact = [
    ...annotations.filter(a => a.type === 'known-defect').map(a => a.description.trim()),
    ...blockedKeys(tags),
  ];
  const key = exact.find(candidate => DEFECT_KEY.test(candidate));
  if (key !== undefined) { return key; }
  for (const a of annotations) {
    const match = a.type === 'fail' ? BLOCKED_BY.exec(a.description.trim()) : null;
    if (match) { return match[1]; }
  }
  return null;
}

function readDefect(status: TestStatus, annotations: Annotation[], tags: string[], message: string): OneshotDefect | null {
  const marked = annotations.length > 0 || blockedKeys(tags).length > 0;
  const ticket = knownDefectKey(annotations, tags) ?? '';

  if (status === 'passed' && message !== '') {
    return { ticket, outcome: 'expected', inferred: !marked };
  }
  if (status === 'failed' && marked && message === '') {
    return { ticket, outcome: 'unexpected-pass', inferred: false };
  }
  return null;
}

function normalizeStatus(raw: unknown): TestStatus {
  switch (raw) {
    case 'passed': return 'passed';
    case 'failed': return 'failed';
    case 'broken': return 'broken';
    case 'skipped': return 'skipped';
    default: return 'unknown';
  }
}

function readParameters(raw: unknown, redactor: Redactor): OneshotParameter[] {
  return listOf<RawPair>(raw)
    .filter(p => p.mode !== 'hidden' && p.excluded !== true)
    .map((p) => {
      const name = String(p.name ?? '');
      const secret = p.mode === 'masked' || isSecretName(name);
      return { name: redactor.text(name), value: secret ? MARKER : redactor.text(String(p.value ?? '')) };
    });
}

function atcIdOf(name: string): string {
  return ATC_PATTERN.exec(name)?.[1].trim() ?? '';
}

// Positional step arguments carry passwords with no key name beside them, so no rule can find them.
function dropArguments(title: string): string {
  return title.replace(DECORATED_TITLE, (all, head: string) => (all.slice(head.length) === '()' ? all : `${head}(…)`));
}

function readSteps(raw: unknown, redactor: Redactor): OneshotStep[] {
  return listOf(raw).map((step) => {
    const rawName = String(step.name ?? '');
    const titled = isAnnotationStep(step) ? rawName.replace(/: undefined$/, '') : rawName;
    const name = dropArguments(titled);
    const start = Number(step.start ?? 0);
    const stop = Number(step.stop ?? 0);
    const atcId = atcIdOf(rawName);

    return {
      name: redactor.text(name),
      status: normalizeStatus(step.status),
      duration: Math.max(0, stop - start),
      parameters: readParameters(step.parameters, redactor),
      steps: readSteps(step.steps, redactor),
      atcId: atcId ? redactor.text(atcId) : null,
    };
  });
}

function collectAtcIds(raw: unknown, into: Set<string>): void {
  for (const step of listOf(raw)) {
    const id = atcIdOf(String(step.name ?? ''));
    if (id) { into.add(id); }
    collectAtcIds(step.steps, into);
  }
}

function rawAttachmentsDeep(node: RawNode, into: RawNode[]): void {
  into.push(...listOf(node.attachments));
  for (const step of listOf(node.steps)) { rawAttachmentsDeep(step, into); }
}

// A symlink inside the results directory may point anywhere, so the real path decides.
function containedFile(dir: string, name: string): string | null {
  const real = realpathSync(join(dir, name));
  return real.startsWith(`${realpathSync(dir)}${sep}`) && statSync(real).isFile() ? real : null;
}

function decodeUtf8(bytes: Buffer): string | null {
  if (bytes.includes(0)) { return null; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return null; }
}

function hasMagic(bytes: Buffer, mime: string): boolean {
  const head = bytes.subarray(0, 12).toString('latin1');
  switch (mime) {
    case 'image/png': return head.startsWith('\x89PNG');
    case 'image/jpeg': return head.startsWith('\xFF\xD8\xFF');
    case 'image/gif': return head.startsWith('GIF8');
    case 'image/webp': return head.startsWith('RIFF') && head.slice(8) === 'WEBP';
    case 'video/webm': return head.startsWith('\x1A\x45\xDF\xA3');
    case 'video/mp4': return head.slice(4, 8) === 'ftyp';
    default: return false;
  }
}

function isHar(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) { return false; }
  try { return Array.isArray((JSON.parse(trimmed) as { log?: { entries?: unknown } | null }).log?.entries); }
  catch { return /^\{\s*"log"\s*:\s*\{\s*"version"/.test(trimmed); }
}

// Cut text is redacted again: the cut can leave half a marker that reads as a value.
function clip(safe: string, redactor: Redactor): string {
  if (safe.length <= TEXT_LIMIT_BYTES) { return safe; }
  const boundary = safe.lastIndexOf('\n', TEXT_LIMIT_BYTES);
  const cut = boundary > TEXT_LIMIT_BYTES / 2 ? boundary : TEXT_LIMIT_BYTES;
  return `${redactor.text(safe.slice(0, cut))}\n\n... truncated, ${safe.length - cut} more characters`;
}

function readAttachment(dir: string, raw: RawNode, allowVideo: boolean, redactor: Redactor): OneshotAttachment {
  const name = redactor.text(String(raw.name ?? 'attachment'));
  const type = redactor.text(String(raw.type ?? 'application/octet-stream'));
  const source = String(raw.source ?? '');
  const omitted = (body: string, bytes = 0): OneshotAttachment => ({ name, type, kind: 'omitted', body, bytes });

  if (basename(source) !== source || source === '') {
    return omitted('attachment source is not a plain file name in the results directory');
  }

  let data: Buffer;
  const ext = extname(source).toLowerCase();
  try {
    const path = containedFile(dir, source);
    if (path === null) { return omitted('attachment source resolves outside the results directory'); }
    const size = statSync(path).size;
    if (ARCHIVE_EXTENSIONS.has(ext) || ARCHIVE_TYPES.test(type)) {
      return omitted('trace or archive, never embedded: it carries every network response the run captured', size);
    }
    if (ext in VIDEO_MIME && !allowVideo) {
      return omitted('video not embedded: enable with --video failures|all', size);
    }
    data = readFileSync(path);
  }
  catch { return omitted('file missing from the results directory or unreadable'); }

  const bytes = data.byteLength;
  const holdsSecret = (): OneshotAttachment => omitted('not embedded: the file holds a secret value', bytes);
  const media = VIDEO_MIME[ext] ?? IMAGE_MIME[ext];

  if (ext === '.imagediff') { return omitted('image diff, not embedded', bytes); }

  if (data.subarray(0, 4).toString('latin1') === 'PK\x03\x04') {
    return omitted('archive, never embedded', bytes);
  }

  if (media !== undefined && hasMagic(data, media)) {
    const readable = decodeUtf8(data);
    if (redactor.holdsSecret(data) || (readable !== null && redactor.text(readable) !== readable)) { return holdsSecret(); }
    return { name, type: media, kind: ext in VIDEO_MIME ? 'video' : 'image', bytes, body: data.toString('base64') };
  }

  const text = decodeUtf8(data);
  if (text === null) { return omitted('binary file, not embedded', bytes); }
  if (isHar(text)) { return omitted('HAR capture, never embedded', bytes); }

  const safe = redactor.text(text);
  if (media === 'image/svg+xml') {
    return safe === HIDDEN ? holdsSecret() : { name, type: media, kind: 'image', bytes, body: Buffer.from(safe, 'utf8').toString('base64') };
  }
  return { name, type, kind: 'text', bytes, body: clip(safe, redactor) };
}

function readHistory(path: string, redactor: Redactor): HistoryPoint[] | null {
  if (path === '') { return []; }

  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return null; }
  if (!Array.isArray(raw)) { return null; }

  const byRun = new Map<string, HistoryPoint>();

  for (const entry of listOf(raw)) {
    const url = redactor.text(String(entry.url ?? ''));
    const label = redactor.text(String(entry.label ?? ''));
    const stated = redactor.text(String(entry.at ?? ''));
    // The page shows slices of this field, and a slice of redacted text can read as a leak.
    const at = /^[\d :.+TZ-]*$/.test(stated) ? stated : '';
    const key = url !== '' ? url : label !== '' ? label : at;
    const passed = Number(entry.passed ?? 0) || 0;
    const failed = Number(entry.failed ?? 0) || 0;
    const total = Number(entry.total ?? passed + failed) || 0;

    const existing = byRun.get(key);
    if (existing) {
      existing.passed += passed;
      existing.failed += failed;
      existing.total += total;
      if (at !== '' && at < existing.at) { existing.at = at; }
    }
    else {
      byRun.set(key, { label, at, passed, failed, total, url });
    }
  }

  return [...byRun.values()].sort((a, b) => a.at.localeCompare(b.at));
}

const PROPERTY_KEY = /^(?:\\.|[^\\=: \t\f])*/;
const PROPERTY_SEPARATOR = /^[ \t\f]*(?:[=:][ \t\f]*)?/;

function logicalLines(text: string): string[] {
  const out: string[] = [];
  let pending = '';
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trimStart();
    if (pending === '' && (line === '' || /^[#!]/.test(line))) { continue; }
    let slashes = 0;
    while (line[line.length - 1 - slashes] === '\\') { slashes++; }
    if (slashes % 2 === 1) { pending += line.slice(0, -1); continue; }
    out.push(pending + line);
    pending = '';
  }
  return pending === '' ? out : [...out, pending];
}

const unescapeProperty = (text: string): string => text.replace(/\\([:=\\ #!])/g, '$1').trim();

function readEnvProps(dir: string, redactor: Redactor): OneshotParameter[] {
  let text = '';
  try {
    const path = containedFile(dir, 'environment.properties');
    if (path !== null) { text = readFileSync(path, 'utf-8'); }
  }
  catch { return []; }

  return logicalLines(text).map((line) => {
    const rawKey = (PROPERTY_KEY.exec(line) as RegExpExecArray)[0];
    const key = unescapeProperty(rawKey);
    const plain = unescapeProperty(line.slice(rawKey.length).replace(PROPERTY_SEPARATOR, ''));
    const safe = redactor.text(plain);
    // A line with no key of its own, such as a bare URL, hides its secret across the split.
    const whole = unescapeProperty(line);
    const secret = isSecretName(key) || (safe === plain && redactor.text(whole) !== whole);
    return { name: redactor.text(key), value: plain !== '' && secret ? MARKER : safe };
  });
}

export type AttachmentPolicy = 'all' | 'failures' | 'none';
export type VideoPolicy = 'all' | 'failures' | 'none';
export type StepPolicy = 'all' | 'failures' | 'none';

export interface BuildOptions {
  resultsDir: string
  reportName: string
  environment: string
  runUrl: string
  historyPath: string
  redactor: Redactor
  attachments: AttachmentPolicy
  video: VideoPolicy
  steps: StepPolicy
}

function foldByHistoryId(tests: OneshotTest[]): OneshotTest[] {
  const byId = new Map<string, OneshotTest>();
  const noId: OneshotTest[] = [];

  for (const test of tests) {
    if (test.historyId === '') { noId.push(test); continue; }

    const existing = byId.get(test.historyId);
    if (!existing) { byId.set(test.historyId, test); continue; }

    const winner = test.stop >= existing.stop ? test : existing;
    const loser = winner === test ? existing : test;
    winner.attempts = existing.attempts + test.attempts;

    winner.duration = winner.duration + loser.duration;
    const starts = [existing.start, test.start].filter(n => n > 0);
    winner.start = starts.length > 0 ? Math.min(...starts) : 0;
    byId.set(test.historyId, winner);
  }

  return [...byId.values(), ...noId].sort((a, b) => a.start - b.start || a.uuid.localeCompare(b.uuid));
}

export function buildModel(options: BuildOptions): OneshotModel {
  const { resultsDir, redactor } = options;
  const clean = (value: unknown): string => redactor.text(String(value ?? ''));

  const everything = readdirSync(resultsDir);
  const files = everything.filter(f => f.endsWith('-result.json')).sort();
  const tests: OneshotTest[] = [];
  let parsed = 0;

  for (const file of files) {
    let raw: RawNode;
    try {
      const path = containedFile(resultsDir, file);
      if (path === null) { continue; }
      raw = JSON.parse(readFileSync(path, 'utf-8')) as RawNode;
    }
    catch { continue; }
    if (raw === null || typeof raw !== 'object') { continue; }
    parsed++;

    const labels = listOf<RawPair>(raw.labels);
    const parameters = listOf<RawPair>(raw.parameters);
    const rawTags = labels.filter(l => l.name === 'tag').map(l => String(l.value ?? ''));
    const start = Number(raw.start ?? 0);
    const stop = Number(raw.stop ?? 0);
    const allureStatus = normalizeStatus(raw.status);
    const statusDetails = (raw.statusDetails ?? {}) as { message?: unknown, trace?: unknown };

    const defect = readDefect(allureStatus, readAnnotations(raw.steps), rawTags, String(statusDetails.message ?? ''));
    if (defect) { defect.ticket = clean(defect.ticket); }
    const status: TestStatus = defect?.outcome === 'expected' ? 'known-defect' : allureStatus;
    const isFailure = status === 'failed' || status === 'broken';

    const atcIds = new Set<string>();
    collectAtcIds(raw.steps, atcIds);
    const keepSteps = options.steps === 'all' || (options.steps === 'failures' && isFailure);

    const wantsAttachments = options.attachments === 'all'
      || (options.attachments === 'failures' && isFailure);
    const wantsVideo = options.video === 'all' || (options.video === 'failures' && isFailure);

    const collectAny = wantsAttachments || wantsVideo;

    const rawAttachments: RawNode[] = [];
    rawAttachmentsDeep(raw, rawAttachments);

    const seen = new Set<string>();
    const attachments = collectAny
      ? rawAttachments
          .filter((a) => {
            const source = String(a.source ?? '');
            if (source === '' || seen.has(source)) { return false; }
            seen.add(source);
            return true;
          })
          .map(a => readAttachment(resultsDir, a, wantsVideo, redactor))
          .filter((a) => {
            if (a.kind === 'video') { return true; }
            if (!wantsAttachments) { return a.kind === 'omitted' && a.body.startsWith('video not embedded'); }
            return true;
          })
      : [];

    const fullName = String(raw.fullName ?? '');

    tests.push({
      uuid: String(raw.uuid ?? file),
      name: clean(raw.name ?? '(unnamed)'),
      fullName: clean(fullName),
      status,
      start,
      stop,
      duration: Math.max(0, stop - start),
      project: clean(parameters.find(p => p.name === 'Project')?.value),
      parentSuite: clean(labelOf(labels, 'parentSuite')),
      suite: clean(labelOf(labels, 'suite')),
      subSuite: clean(labelOf(labels, 'subSuite')),
      tags: rawTags.map(clean),
      description: clean(raw.description),
      parameters: readParameters(parameters.filter(p => p.name !== 'Project'), redactor),
      links: listOf(raw.links).map(link => ({ name: clean(link.name || link.url), url: clean(link.url), type: clean(link.type) })),
      atcIds: [...atcIds].map(clean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
      message: clean(statusDetails.message),
      trace: clean(statusDetails.trace),
      steps: keepSteps ? readSteps(raw.steps, redactor) : [],
      attachments,
      historyId: String(raw.historyId ?? ''),
      scaffolding: /\.(?:setup|teardown)\.ts(?::\d+)*$/.test(fullName.split(' › ')[0]),
      attempts: 1,
      defect,
    });
  }

  tests.sort((a, b) => a.start - b.start || a.uuid.localeCompare(b.uuid));

  const folded = foldByHistoryId(tests);

  const real = folded.filter(t => !t.scaffolding);

  const count = (s: TestStatus): number => real.filter(t => t.status === s).length;
  const passed = count('passed');
  const failed = count('failed');
  const broken = count('broken');
  const knownDefects = count('known-defect');
  const unexpectedPasses = real.filter(t => t.defect?.outcome === 'unexpected-pass').length;

  const starts = folded.map(t => t.start).filter(n => n > 0);
  const stops = folded.map(t => t.stop).filter(n => n > 0);
  const startedAt = starts.length > 0 ? Math.min(...starts) : 0;
  const finishedAt = stops.length > 0 ? Math.max(...stops) : 0;

  const executed = passed + failed + broken + knownDefects;

  const bySignature = new Map<string, FailureSignature>();
  for (const test of folded) {
    if (test.status !== 'failed' && test.status !== 'broken') { continue; }
    if (test.message === '' && test.defect?.outcome === 'unexpected-pass') { continue; }
    const signature = test.message === '' ? NO_ERROR : redactor.text(signatureOf(test.message));
    const existing = bySignature.get(signature);
    if (existing) {
      existing.testNames.push(test.name);
      for (const id of test.atcIds) { if (!existing.atcIds.includes(id)) { existing.atcIds.push(id); } }
    }
    else {
      bySignature.set(signature, {
        signature,
        sample: redactor.text(test.message.split('\n').slice(0, SAMPLE_LINES).join('\n')),
        testNames: [test.name],
        atcIds: [...test.atcIds],
      });
    }
  }
  const signatures = [...bySignature.values()].sort((a, b) => b.testNames.length - a.testNames.length);

  const projects = [...new Set(folded.map(t => t.project).filter(Boolean))].sort();
  const tags = [...new Set(folded.flatMap(t => t.tags))].sort();

  const history = readHistory(options.historyPath, redactor);

  const inputs: OneshotInputs = {
    historyUnreadable: history === null,
    filesInDir: everything.length,
    files: files.length,
    parsed,
    entries: folded.length,
    renderable: folded.length > 0,
    emptyReason: folded.length > 0
      ? ''
      : files.length === 0
        ? `no *-result.json files in ${resultsDir} — the directory holds ${everything.length} ${everything.length === 1 ? 'file' : 'files'}, none of them results. Nothing was written.`
        : parsed === 0
          ? `${files.length} *-result.json ${files.length === 1 ? 'file' : 'files'} in ${resultsDir}, and ${files.length === 1 ? 'it did not parse' : 'none of them parsed'} as JSON. Nothing was written.`
          : `${parsed} of ${files.length} *-result.json files in ${resultsDir} parsed, and none of them yielded a test entry. Nothing was written.`,
  };

  return {
    reportName: clean(options.reportName),
    environment: clean(options.environment),
    runUrl: clean(options.runUrl),
    generatedAt: Date.now(),
    summary: {
      total: real.length,
      scaffolding: folded.length - real.length,
      scaffoldingFailed: folded.filter(t => t.scaffolding
        && (t.status === 'failed' || t.status === 'broken')).length,
      passed,
      failed,
      broken,
      skipped: count('skipped'),
      knownDefects,
      unexpectedPasses,
      unknown: count('unknown'),
      passRate: executed === 0 ? 0 : passed / executed,
      wallMs: Math.max(0, finishedAt - startedAt),
      cpuMs: folded.reduce((sum, t) => sum + t.duration, 0),
      startedAt,
      finishedAt,
    },
    tests: folded,
    projects,
    tags,
    envProps: readEnvProps(resultsDir, redactor),
    signatures,
    history: history ?? [],
    inputs,
  };
}
