import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { demoBugPack, demoStoryPack } from './demo.ts';
import { describePage, evidenceUrlError, iconOf, publishEvidence, recordPublication } from './hosts.ts';

const HOSTS = ['claude.ai'];
const URL_A = 'https://claude.ai/artifact/abc123';
const URL_CODE = 'https://claude.ai/code/artifact/0f0e0d0c-0b0a-4908-8706-050403020100';
const story = () => demoStoryPack({ ok: 'a.png', error: 'b.png' });

describe('publishEvidence', () => {
  it('local: returns the repo-relative path, already published', () => {
    const result = publishEvidence('/repo/.context/PBI/x/evidence/evidence-artifact/index.html', null, 'local', { packPath: 'p', repoRoot: '/repo' });
    expect(result).toEqual({ ref: { host: 'local', location: '.context/PBI/x/evidence/evidence-artifact/index.html', state: 'published' } });
  });

  it('claude-artifact, first publish: the reference icon per kind and a description, then record the URL', () => {
    const page = join('/tmp', 'evidence-artifact', 'index.html');
    const { ref, agentStep } = publishEvidence(page, undefined, 'claude-artifact', { packPath: 'pack.json', kind: 'bug', description: 'DEMO-7120 staging evidence' });
    expect(ref).toEqual({ host: 'claude-artifact', location: page, state: 'agent-action' });
    expect(agentStep?.publish).toEqual({ file_path: page, icon: 'bug', description: 'DEMO-7120 staging evidence' });
    expect(agentStep?.readFirst).toBeNull();
    expect(agentStep?.record).toContain('bun run evidence record --pack pack.json --url');
    expect(iconOf('story')).toBe('checklist');
  });

  it('claude-artifact, republish: read the existing URL first and publish to the SAME url', () => {
    const { ref, agentStep } = publishEvidence('/tmp/index.html', URL_A, 'claude-artifact', { packPath: 'pack.json' });
    expect(ref.location).toBe(URL_A);
    expect(agentStep?.readFirst).toBe(URL_A);
    expect(agentStep?.publish).toEqual({ file_path: '/tmp/index.html', url: URL_A });
    expect(agentStep?.instructions.join(' ')).toContain('Never omit url');
  });
});

describe('describePage', () => {
  it('counts the current round only', () => {
    expect(describePage(story())).toBe('DEMO-7101 staging evidence: 1 of 4 TCs passed, 1 bug filed');
    // The bug pack: the round-0 reproduction is history, the retest is current
    expect(describePage(demoBugPack({ error: 'b.png', fixed: 'c.png' }))).toBe('DEMO-7120 staging evidence: 1 of 1 cases passed');
  });

  it('says whether a story\'s deferrals have the owner OK', () => {
    const pack = story();
    pack.ticket.verdict = 'PENDING';
    pack.tcs = pack.tcs.filter(c => c.status === 'PASSED' || c.status === 'DEFERRED');
    pack.bugs = [];
    expect(describePage(pack)).toBe('DEMO-7101 staging evidence: 1 of 2 TCs passed, 1 deferred, waiting for owner OK');
    pack.ticket.deferral = { label: 'not-fully-tested', ok: { by: 'Owner (demo)', at: '2026-10-24T15:00:00Z', record: 'owner OK given in session', cases: ['DEMO-7101-TC3'] } };
    expect(describePage(pack)).toBe('DEMO-7101 staging evidence: 1 of 2 TCs passed, 1 deferred (not-fully-tested), owner OK cited');
  });
});

describe('evidenceUrlError', () => {
  it('accepts both claude.ai artifact forms', () => {
    expect(evidenceUrlError(URL_A, HOSTS)).toBeNull();
    expect(evidenceUrlError(URL_CODE, HOSTS)).toBeNull();
  });

  it('refuses other hosts, plain http, other claude.ai paths and query strings', () => {
    expect(evidenceUrlError('https://imgbox.example/abc', HOSTS)).toContain('not in board.evidence.allowed_hosts');
    expect(evidenceUrlError('http://claude.ai/artifact/abc', HOSTS)).toBe('an evidence link must be https');
    expect(evidenceUrlError('https://claude.ai/chat/abc', HOSTS)).toContain('must be https://claude.ai/artifact/<id>');
    expect(evidenceUrlError(`${URL_A}?share=1`, HOSTS)).toBe('an evidence link carries no query string or fragment');
    expect(evidenceUrlError('not a url', HOSTS)).toContain('is not a URL');
    // N8: userinfo in an evidence link
    expect(evidenceUrlError('https://u:p@claude.ai/artifact/x', HOSTS)).toBe('an evidence link carries no user name or password');
  });
});

describe('recordPublication', () => {
  const now = new Date('2026-10-24T12:00:00Z');

  it('stores the URL in the reference shape {url, path, published[]} and appends each publish', () => {
    const first = recordPublication(story(), URL_A, { allowedHosts: HOSTS, now, pagePath: 'evidence/evidence-artifact/index.html' });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.pack.artifact).toEqual({ url: URL_A, path: 'evidence/evidence-artifact/index.html', published: [now.toISOString()] });
    const again = recordPublication(first.pack, URL_A, { allowedHosts: HOSTS, now });
    expect(again.ok && again.pack.artifact).toEqual({ url: URL_A, path: 'evidence/evidence-artifact/index.html', published: [now.toISOString(), now.toISOString()] });
  });

  it('refuses a second URL for a published pack', () => {
    const first = recordPublication(story(), URL_A, { allowedHosts: HOSTS, now });
    const second = first.ok ? recordPublication(first.pack, URL_CODE, { allowedHosts: HOSTS, now }) : first;
    expect(second).toEqual({ ok: false, error: `this pack is already published at ${URL_A}; republish to that url instead of minting a second page` });
  });
});
