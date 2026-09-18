import type { TraceLinkRecord } from './trace.ts';
import { describe, expect, test } from 'bun:test';
import { parseArgs } from './parser.ts';
import {
  checkLinkEdge,
  checkMembership,
  resolveTraceArtifacts,

  traceVerdict,
} from './trace.ts';

const STORY = 'UPEX-42';

function link(over: Partial<TraceLinkRecord> = {}): TraceLinkRecord {
  return {
    key: 'UPEX-180',
    issueType: 'Test Set',
    summary: `ATS: ${STORY} Login`,
    linkTypeName: 'Test',
    linkId: '10421',
    storySide: 'inward',
    ...over,
  };
}

describe('resolveTraceArtifacts', () => {
  test('picks one artifact per Xray container type', () => {
    const artifacts = resolveTraceArtifacts(STORY, [
      link(),
      link({ key: 'UPEX-200', issueType: 'Test Plan', summary: `ATP: ${STORY}` }),
      link({ key: 'UPEX-194', issueType: 'Test Execution', summary: `ATR: ${STORY}` }),
      link({ key: 'UPEX-9', issueType: 'Bug', summary: 'unrelated' }),
    ]);

    expect(artifacts.ats?.key).toBe('UPEX-180');
    expect(artifacts.atp?.key).toBe('UPEX-200');
    expect(artifacts.atr?.key).toBe('UPEX-194');
    expect(artifacts.ambiguous).toEqual({ ats: [], atp: [], atr: [] });
  });

  test('the ratified title wins over link order, and the rest are reported', () => {
    // A feature-level `TS:` Set is linked first; the Story's own ATS is second.
    const artifacts = resolveTraceArtifacts(STORY, [
      link({ key: 'UPEX-100', summary: 'TS: Login feature' }),
      link({ key: 'UPEX-180', summary: `ATS: ${STORY} Login` }),
    ]);

    expect(artifacts.ats?.key).toBe('UPEX-180');
    expect(artifacts.ambiguous.ats).toEqual(['UPEX-100']);
  });

  test('another Story\'s ATS does not outrank a plainly titled Set on this Story', () => {
    const artifacts = resolveTraceArtifacts(STORY, [
      link({ key: 'UPEX-900', summary: 'ATS: UPEX-77 Checkout' }),
    ]);
    // Nothing better is linked, so it is still chosen — but it is the only candidate.
    expect(artifacts.ats?.key).toBe('UPEX-900');
    expect(artifacts.ambiguous.ats).toEqual([]);
  });

  test('a Re-Test Execution counts as the run container', () => {
    const artifacts = resolveTraceArtifacts(STORY, [
      link({ key: 'UPEX-300', issueType: 'Re-Test Execution', summary: `RETEST: ${STORY}` }),
    ]);
    expect(artifacts.atr?.key).toBe('UPEX-300');
  });

  test('nothing linked resolves to nothing', () => {
    expect(resolveTraceArtifacts(STORY, [])).toEqual({
      ats: null,
      atp: null,
      atr: null,
      ambiguous: { ats: [], atp: [], atr: [] },
    });
  });
});

describe('checkLinkEdge', () => {
  const spec = (artifact: TraceLinkRecord | null) =>
    ({ id: 'story-ats' as const, label: 'Story↔ATS', acronym: 'ATS' as const, artifact });

  test('passes on the right type in the right direction', () => {
    const edge = checkLinkEdge(spec(link()), 'Test', STORY);
    expect(edge.status).toBe('PASS');
    expect(edge.remediation).toBeNull();
  });

  test('a missing artifact fails with a placeholder remediation', () => {
    const edge = checkLinkEdge(spec(null), 'Test', STORY);
    expect(edge.status).toBe('FAIL');
    expect(edge.detail).toContain('no ATS linked');
    expect(edge.remediation).toBe('bun xray link create <ATS_KEY> UPEX-42 --type test');
  });

  test('the wrong link type fails and names both sides', () => {
    const edge = checkLinkEdge(spec(link({ linkTypeName: 'Relates' })), 'Test', STORY);
    expect(edge.status).toBe('FAIL');
    expect(edge.detail).toContain('"Relates"');
    expect(edge.detail).toContain('"Test"');
    expect(edge.remediation).toBe('bun xray link create UPEX-180 UPEX-42 --type test');
  });

  test('an inverted link fails even though the link exists', () => {
    const edge = checkLinkEdge(spec(link({ storySide: 'outward' })), 'Test', STORY);
    expect(edge.status).toBe('FAIL');
    expect(edge.detail).toContain('sits under outwardIssue');
  });

  test('the inverted-link remediation names the link id and is not a blind delete', () => {
    const edge = checkLinkEdge(spec(link({ storySide: 'outward', linkId: '77123' })), 'Test', STORY);
    // The id is the only handle the delete endpoint accepts; the old text told
    // an operator to "delete the inverted link in Jira" and named nothing.
    expect(edge.remediation).toContain('link id 77123');
    expect(edge.remediation).toContain('bun xray link delete --id 77123 --dry-run');
    expect(edge.remediation).toContain('bun xray link delete --id 77123 --yes');
    expect(edge.remediation).toContain('bun xray link create UPEX-180 UPEX-42 --type test');
    expect(edge.remediation).not.toContain('delete the inverted link in Jira');
  });

  test('a renamed link type is matched by the catalog name, case-insensitively', () => {
    const edge = checkLinkEdge(spec(link({ linkTypeName: 'verifica' })), 'Verifica', STORY);
    expect(edge.status).toBe('PASS');
  });
});

describe('checkMembership', () => {
  const keys = { ats: 'UPEX-180', atp: 'UPEX-200', atr: 'UPEX-194' };

  test('passes when all three lists hold the same tests, order ignored', () => {
    const edge = checkMembership(
      { ats: ['UPEX-1', 'UPEX-2'], atp: ['UPEX-2', 'UPEX-1'], atr: ['UPEX-1', 'UPEX-2'] },
      keys,
    );
    expect(edge.status).toBe('PASS');
    expect(edge.detail).toContain('2 test(s)');
  });

  test('names what each container is missing and the cascade that fixes it', () => {
    const edge = checkMembership(
      { ats: ['UPEX-1', 'UPEX-2'], atp: ['UPEX-1'], atr: [] },
      keys,
    );
    expect(edge.status).toBe('FAIL');
    expect(edge.detail).toContain('ATP is missing UPEX-2');
    expect(edge.detail).toContain('ATR is missing UPEX-1, UPEX-2');
    expect(edge.remediation).toBe(
      'bun xray plan add-set UPEX-200 --set UPEX-180 && bun xray exec add-set UPEX-194 --set UPEX-180',
    );
  });

  test('a test present in a container but absent from the ATS is reported, not ignored', () => {
    const edge = checkMembership({ ats: ['UPEX-1'], atp: ['UPEX-1', 'UPEX-9'], atr: ['UPEX-1'] }, keys);
    expect(edge.status).toBe('FAIL');
    expect(edge.detail).toContain('ATP carries UPEX-9, absent from the ATS');
    // Nothing to cascade: the Set is the stale side.
    expect(edge.remediation).toBeNull();
  });

  test('no ATS means nothing to compare against', () => {
    const edge = checkMembership({ ats: null, atp: ['UPEX-1'], atr: ['UPEX-1'] }, { ...keys, ats: null });
    expect(edge.status).toBe('FAIL');
    expect(edge.detail).toContain('no ATS to compare against');
  });

  test('a missing container is a problem in its own right', () => {
    const edge = checkMembership({ ats: ['UPEX-1'], atp: null, atr: ['UPEX-1'] }, { ...keys, atp: null });
    expect(edge.status).toBe('FAIL');
    expect(edge.detail).toContain('no ATP to compare');
  });
});

describe('traceVerdict', () => {
  test('one failed edge sinks the verdict — a coverage-only pass is not verification', () => {
    const edges = [
      checkLinkEdge({ id: 'story-ats', label: 'a', acronym: 'ATS', artifact: link() }, 'Test', STORY),
      checkLinkEdge({ id: 'atp-story', label: 'b', acronym: 'ATP', artifact: null }, 'Test', STORY),
    ];
    const verdict = traceVerdict(edges);
    expect(verdict.ok).toBe(false);
    expect(verdict.failed.map(e => e.id)).toEqual(['atp-story']);
  });

  test('every edge passing is the only way through', () => {
    expect(traceVerdict([
      checkLinkEdge({ id: 'story-ats', label: 'a', acronym: 'ATS', artifact: link() }, 'Test', STORY),
    ])).toEqual({ ok: true, failed: [] });
  });
});

describe('parseArgs on a single-word command', () => {
  // `trace` and `repair` take flags directly, with no subcommand. Claiming
  // args[1] unconditionally swallowed the flag NAME and stranded its VALUE as a
  // positional, so `xray repair --project DEMO` never saw DEMO.
  test('a leading flag is parsed as a flag, not as a subcommand', () => {
    expect(parseArgs(['repair', '--project', 'DEMO', '--apply'])).toEqual({
      command: 'repair',
      subcommand: '',
      flags: { project: 'DEMO', apply: true },
      positional: [],
    });
  });

  test('a leading key is still a subcommand, and trailing flags still parse', () => {
    expect(parseArgs(['trace', 'UPEX-42', '--json'])).toEqual({
      command: 'trace',
      subcommand: 'UPEX-42',
      flags: { json: true },
      positional: [],
    });
  });

  test('a real two-word command is untouched', () => {
    expect(parseArgs(['test', 'get', 'UPEX-1', '--json'])).toEqual({
      command: 'test',
      subcommand: 'get',
      flags: { json: true },
      positional: ['UPEX-1'],
    });
  });
});
