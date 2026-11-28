import { decodedViews, holdsToken, holdsValue, patternLeaks, secretVariants, textViews } from './redact.ts';

export interface LeakFinding {
  rule: string
  count: number
}

const MEDIA_PAYLOAD = /(?<=\ssrc=")data:(?:image|video)\/[\w.+-]+;base64,([A-Za-z0-9+/=]*)(?=")/g;

function asText(bytes: Buffer): string | null {
  if (bytes.includes(0)) { return null; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return null; }
}

export function inspectHtml(html: string, values: readonly string[], rendererText = ''): LeakFinding[] {
  const payloads: Buffer[] = [];
  const page = html.replace(MEDIA_PAYLOAD, (_uri, payload: string) => {
    payloads.push(Buffer.from(payload, 'base64'));
    return '';
  });
  const texts = [page, ...payloads.map(asText).filter(text => text !== null)];

  const found = new Map<string, number>();
  for (const text of texts) {
    const perText = new Map<string, number>();
    for (const view of decodedViews(text)) {
      for (const [rule, count] of patternLeaks(view)) { perText.set(rule, Math.max(count, perText.get(rule) ?? 0)); }
    }
    for (const [rule, count] of perText) { found.set(rule, (found.get(rule) ?? 0) + count); }
  }

  const binary = payloads.filter(bytes => asText(bytes) === null && holdsToken(bytes)).length;
  if (binary > 0) { found.set('token-in-media', binary); }

  const views = texts.flatMap(textViews);
  // A value that is also a word of the renderer's own source cannot be told apart from the template.
  const checked = values.filter(value => !rendererText.includes(value));
  const exact = checked.filter((value) => {
    const variants = secretVariants([value]);
    return views.some(view => variants.some(v => view.includes(v))) || payloads.some(bytes => holdsValue(bytes, variants));
  });
  if (exact.length > 0) { found.set('exact-secret-value', exact.length); }

  return [...found].map(([rule, count]) => ({ rule, count }));
}
