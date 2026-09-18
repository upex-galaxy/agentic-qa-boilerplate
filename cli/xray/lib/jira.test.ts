/**
 * Round-trip tests for the Jira issue-link write path.
 *
 * This file exists because nothing pinned the write path to the read path, and
 * for months they disagreed: `link create <ARTIFACT> <STORY> --type test` — the
 * documented coverage recipe — stored the shape Xray counts as ZERO coverage,
 * while its own confirmation line described the correct one. Three agents
 * disagreed about which layer was wrong, and the measurement that settled it
 * (live Xray GraphQL coverage on one Story carrying both shapes over two
 * disjoint sets of ten Tests) is encoded below as the fake Jira's behaviour:
 *
 *   A link POSTed as `{outwardIssue: A, inwardIssue: B}` reads back from B's
 *   `issuelinks` as `outwardIssue: A`, and from A's as `inwardIssue: B`.
 *   Coverage requires the artifact under `inwardIssue` ON THE STORY.
 *
 * The suite therefore asserts the invariant, not the implementation: create the
 * link the recipe creates, read the Story back, and require the artifact to sit
 * under `inwardIssue`. Any future swap of the payload fields fails here.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { buildIssueLinkPayload, createIssueLink, deleteIssueLink, getIssueLinks, searchIssueKeys } from './jira.ts';

const STORY = 'UPEX-42';
const ATS = 'UPEX-180';

interface StoredLink {
  id: string
  typeName: string
  /** Key sent as `outwardIssue` in the POST body. */
  outwardKey: string
  /** Key sent as `inwardIssue` in the POST body. */
  inwardKey: string
}

/**
 * A fake Jira that stores links as the POST sends them and renders an
 * `issuelinks` entry the way the live instance was measured to: the other
 * issue appears under the FIELD NAME it carried in the payload.
 */
class FakeJira {
  readonly links: StoredLink[] = [];
  private nextId = 10_400;
  /** Every request the code under test made, for asserting the raw payload. */
  readonly requests: Array<{ method: string, url: string, body: unknown }> = [];

  handle = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    this.requests.push({ method, url, body });

    if (method === 'POST' && url.endsWith('/rest/api/3/issueLink')) {
      this.links.push({
        id: String(this.nextId++),
        typeName: body.type.name,
        outwardKey: body.outwardIssue.key,
        inwardKey: body.inwardIssue.key,
      });
      return new Response('', { status: 201 });
    }

    if (method === 'DELETE' && url.includes('/rest/api/3/issueLink/')) {
      const id = url.split('/').pop() as string;
      const index = this.links.findIndex(l => l.id === id);
      if (index === -1) {
        return new Response('link not found', { status: 404, statusText: 'Not Found' });
      }
      this.links.splice(index, 1);
      return new Response('', { status: 204 });
    }

    if (method === 'POST' && url.endsWith('/rest/api/3/search/jql')) {
      return Response.json({
        isLast: true,
        issues: [{ key: STORY }, { key: 'UPEX-43' }],
      });
    }

    const readMatch = /\/rest\/api\/3\/issue\/([A-Z0-9-]+)\?/.exec(url);
    if (method === 'GET' && readMatch) {
      const key = readMatch[1];
      return Response.json({ id: '1', key, fields: { issuelinks: this.entriesFor(key) } });
    }

    return new Response('unexpected request', { status: 500, statusText: 'Internal Server Error' });
  };

  /**
   * The measured read shape: reading issue `key`, the OTHER issue appears under
   * the field name that other issue was sent under in the POST.
   */
  private entriesFor(key: string): unknown[] {
    return this.links
      .filter(l => l.outwardKey === key || l.inwardKey === key)
      .map((l) => {
        const other = l.outwardKey === key ? l.inwardKey : l.outwardKey;
        const field = l.outwardKey === key ? 'inwardIssue' : 'outwardIssue';
        return {
          id: l.id,
          type: { name: l.typeName },
          [field]: {
            id: `9${l.id}`,
            key: other,
            fields: { issuetype: { name: 'Test Set' }, summary: `ATS: ${STORY} Login` },
          },
        };
      });
  }
}

const realFetch = globalThis.fetch;
let jira: FakeJira;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  jira = new FakeJira();
  globalThis.fetch = jira.handle as typeof globalThis.fetch;
  savedEnv = {
    ATLASSIAN_URL: process.env.ATLASSIAN_URL,
    ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
    ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
  };
  process.env.ATLASSIAN_EMAIL = 'qa@example.test';
  process.env.ATLASSIAN_API_TOKEN = 'token';
  // Last-resort host source, so the suite still resolves a base URL on a
  // machine with no `xray auth login` and a repo whose yaml host is unset.
  process.env.ATLASSIAN_URL ??= 'https://example.atlassian.net';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    }
    else {
      process.env[key] = value;
    }
  }
});

describe('buildIssueLinkPayload', () => {
  test('the subject of the outward verb is sent as inwardIssue', () => {
    // Measured inversion: the covering artifact goes in `inwardIssue`, because
    // that is the field it must appear under when the STORY is read back.
    expect(buildIssueLinkPayload('Test', ATS, STORY)).toEqual({
      type: { name: 'Test' },
      outwardIssue: { key: STORY },
      inwardIssue: { key: ATS },
    });
  });

  test('swapping the arguments swaps the payload, nothing else', () => {
    expect(buildIssueLinkPayload('Test', STORY, ATS)).toEqual({
      type: { name: 'Test' },
      outwardIssue: { key: ATS },
      inwardIssue: { key: STORY },
    });
  });
});

describe('link create -> read back (the coverage round trip)', () => {
  test('the documented recipe leaves the artifact under inwardIssue ON THE STORY', async () => {
    // `link create <ATS> <STORY> --type test` — the recipe every skill and every
    // `trace` remediation prints.
    const payload = await createIssueLink('Test', ATS, STORY);
    expect(payload).toEqual({
      type: { name: 'Test' },
      outwardIssue: { key: STORY },
      inwardIssue: { key: ATS },
    });

    const storyLinks = await getIssueLinks(STORY);
    expect(storyLinks).not.toBeNull();
    expect(storyLinks).toHaveLength(1);
    // THE assertion: the shape Xray's coverage panel counts.
    expect(storyLinks?.[0].key).toBe(ATS);
    expect(storyLinks?.[0].side).toBe('inward');
  });

  test('the artifact side is the mirror image, so neither end is ambiguous', async () => {
    await createIssueLink('Test', ATS, STORY);
    const artifactLinks = await getIssueLinks(ATS);
    expect(artifactLinks?.[0].key).toBe(STORY);
    expect(artifactLinks?.[0].side).toBe('outward');
  });

  test('the POSTed body is what the confirmation line can be built from', async () => {
    await createIssueLink('Test', ATS, STORY);
    const post = jira.requests.find(r => r.method === 'POST');
    expect(post?.body).toEqual({
      type: { name: 'Test' },
      outwardIssue: { key: STORY },
      inwardIssue: { key: ATS },
    });
  });

  test('creating it the other way round produces the zero-coverage shape', async () => {
    // The pre-fix behaviour, kept as a test so the regression is named: this is
    // exactly what 21 Stories on a live project were wired to.
    await createIssueLink('Test', STORY, ATS);
    const storyLinks = await getIssueLinks(STORY);
    expect(storyLinks?.[0].side).toBe('outward');
  });

  test('every entry carries the LINK id, not an issue id', async () => {
    await createIssueLink('Test', ATS, STORY);
    const storyLinks = await getIssueLinks(STORY);
    expect(storyLinks?.[0].linkId).toBe(jira.links[0].id);
    expect(storyLinks?.[0].id).not.toBe(jira.links[0].id);
  });
});

describe('deleteIssueLink', () => {
  test('removes the link by its own id and the Story stops reporting it', async () => {
    await createIssueLink('Test', ATS, STORY);
    const [link] = (await getIssueLinks(STORY)) ?? [];

    expect(await deleteIssueLink(link.linkId)).toBe(true);
    expect(await getIssueLinks(STORY)).toEqual([]);
  });

  test('an unknown id throws with the id in the message', async () => {
    expect(deleteIssueLink('999999')).rejects.toThrow(/link id 999999/);
  });
});

describe('searchIssueKeys', () => {
  test('returns the keys the JQL matched', async () => {
    expect(await searchIssueKeys('project = UPEX')).toEqual([STORY, 'UPEX-43']);
    const search = jira.requests.find(r => String(r.url).endsWith('/search/jql'));
    expect(search?.body).toMatchObject({ jql: 'project = UPEX', fields: ['key'] });
  });
});
