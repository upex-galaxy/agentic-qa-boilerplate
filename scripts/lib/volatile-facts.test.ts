import { describe, expect, test } from 'bun:test';
import { isVolatileExemptPath, scanVolatile } from './volatile-facts.ts';

const md = (text: string): ReturnType<typeof scanVolatile> => scanVolatile(text, { html: false });
const html = (text: string): ReturnType<typeof scanVolatile> => scanVolatile(text, { html: true });
const tags = (hits: ReturnType<typeof scanVolatile>): string[] => hits.map(h => `${h.line}:${h.kind}:${h.match}`);

describe('volatile-facts FILE-LINE', () => {
  test('flags a path with a line, a range or a #L anchor', () => {
    expect(tags(md('See `cli/install.ts:403` and `install.ts:500-545` and foo.md#L12.'))).toEqual([
      '1:FILE-LINE:cli/install.ts:403',
      '1:FILE-LINE:install.ts:500-545',
      '1:FILE-LINE:foo.md#L12',
    ]);
  });

  test('a bare path, a symbol and a clock time are not hits', () => {
    expect(md('See `hasBinary` in `cli/install.ts`; the run started at 12:30 and `package.json` lists it.')).toEqual([]);
  });

  test('fenced code and the frontmatter are skipped, line numbers survive', () => {
    const text = ['---', 'description: see install.ts:12 today', '---', '', '```', 'x.ts:1', '```', 'prose `y.ts:2`'].join('\n');
    expect(tags(md(text))).toEqual(['8:FILE-LINE:y.ts:2']);
  });

  test('volatile-ok on the same line silences it', () => {
    expect(md('Example of the bad form: `x.ts:12` <!-- volatile-ok: teaching example -->')).toEqual([]);
  });
});

describe('volatile-facts CURRENT-STATE', () => {
  test('flags dating words, dated measurements, since-version, sizes and tool versions', () => {
    const text = [
      'The list has ten entries today.',
      'Measured 2026-09-17 on a live project.',
      'Since 8.4 the updater does X.',
      'The pair measures ~2k tokens and grew by 2271 bytes.',
      'Verified against orca 1.4.190.',
      'La tabla tiene hoy 24 entradas y actualmente tres tipos.',
    ].join('\n');
    expect(tags(md(text))).toEqual([
      '1:CURRENT-STATE:today',
      '2:CURRENT-STATE:Measured 2026-09-17',
      '3:CURRENT-STATE:Since 8.4',
      '4:CURRENT-STATE:~2k tokens',
      '4:CURRENT-STATE:2271 bytes',
      '5:CURRENT-STATE:orca 1.4.190',
      '6:CURRENT-STATE:hoy',
      '6:CURRENT-STATE:actualmente',
    ]);
  });

  test('a stable sentence with a date-free rationale is not a hit', () => {
    expect(md('Measured on a real fleet: every worker started empty. The servers `.mcp.json` declares. Max 2 positional params.')).toEqual([]);
  });

  test('HTML: <pre>, <code class="block">, <script> and <style> bodies are skipped', () => {
    const text = [
      '<p>Cuesta hoy unos tokens.</p>',
      '<pre>trace at spec.ts:12 today</pre>',
      '<code class="block">x.ts:1</code>',
      '<script>const today = 1;</script>',
      '<style>.today{}</style>',
      '<h2>¿Qué hace hoy?<!-- volatile-ok: teaching title --></h2>',
    ].join('\n');
    expect(tags(html(text))).toEqual(['1:CURRENT-STATE:hoy']);
  });

  test('a dated record is exempt by path', () => {
    expect(isVolatileExemptPath('.context/ADR/ADR-0006-x.md')).toBe(true);
    expect(isVolatileExemptPath('.session/spikes/report.md')).toBe(true);
    expect(isVolatileExemptPath('.agents/skills/acli/SKILL.md')).toBe(false);
  });
});
