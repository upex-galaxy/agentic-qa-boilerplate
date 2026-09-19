/**
 * Tests for the jira-required work-type baseline check.
 *
 * The warning path cannot be exercised through the CLI without mutating the
 * repo's own `.agents/jira-required.yaml` (the script resolves it from
 * `import.meta.dir`), so the pure functions are tested directly and the CLI is
 * covered only for the shape it must never break: exit 0.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import {
  compareWorkTypes,
  parseWorkTypeKeys,
  UPSTREAM_WORK_TYPE_KEYS,
} from './lib/jira-required-baseline';

const REPO_ROOT = join(import.meta.dir, '..');

const SYNTHETIC = `required:
  acceptance_criteria:
    id: customfield_10001

work_types:
  story:
    jira_issue_type: Story
    required_statuses:
      backlog: Backlog
  bug:
    jira_issue_type: Bug
  project_specific_thing:
    jira_issue_type: Widget

link_types:
  test:
    name: Test
`;

describe('parseWorkTypeKeys', () => {
  it('pulls the top-level keys under work_types: in declaration order', () => {
    expect(parseWorkTypeKeys(SYNTHETIC)).toEqual(['story', 'bug', 'project_specific_thing']);
  });

  it('does not leak keys from the sections around it', () => {
    const keys = parseWorkTypeKeys(SYNTHETIC);
    expect(keys).not.toContain('acceptance_criteria');
    expect(keys).not.toContain('test');
  });

  it('returns [] when the section is absent', () => {
    expect(parseWorkTypeKeys('required:\n  a:\n    id: x\n')).toEqual([]);
  });

  it('returns [] when the section is present but empty', () => {
    expect(parseWorkTypeKeys('work_types:\nlink_types:\n  test:\n')).toEqual([]);
  });

  it('tolerates CRLF line endings', () => {
    expect(parseWorkTypeKeys(SYNTHETIC.replace(/\n/g, '\r\n'))).toEqual([
      'story',
      'bug',
      'project_specific_thing',
    ]);
  });

  it('ignores deeper keys that look like headers', () => {
    const text = 'work_types:\n  story:\n    required_statuses:\n      backlog: Backlog\n';
    expect(parseWorkTypeKeys(text)).toEqual(['story']);
  });
});

describe('compareWorkTypes', () => {
  it('reports what upstream declares and the project does not', () => {
    const cmp = compareWorkTypes(['story', 'bug'], ['story', 'bug', 'epic', 'defect']);
    expect(cmp.missingLocally).toEqual(['epic', 'defect']);
    expect(cmp.extraLocally).toEqual([]);
  });

  it('reports a project-only work type separately, not as a gap', () => {
    const cmp = compareWorkTypes(['story', 'widget'], ['story']);
    expect(cmp.missingLocally).toEqual([]);
    expect(cmp.extraLocally).toEqual(['widget']);
  });

  it('is clean when both sides agree, whatever the order', () => {
    const cmp = compareWorkTypes(['bug', 'story'], ['story', 'bug']);
    expect(cmp.missingLocally).toEqual([]);
    expect(cmp.extraLocally).toEqual([]);
  });

  it('treats an empty local manifest as every key missing', () => {
    const cmp = compareWorkTypes([], ['story', 'bug']);
    expect(cmp.missingLocally).toEqual(['story', 'bug']);
  });

  it('defaults to the shipped upstream baseline', () => {
    const cmp = compareWorkTypes([...UPSTREAM_WORK_TYPE_KEYS]);
    expect(cmp.missingLocally).toEqual([]);
    expect(cmp.extraLocally).toEqual([]);
  });
});

/**
 * In the boilerplate ITSELF the manifest is the baseline, so the two must agree
 * and a mismatch means someone edited `.agents/jira-required.yaml` without
 * running `bun run jira:baseline --write`.
 *
 * This assertion must NOT run in a consumer repo: there the manifest is
 * project-owned and diverging from upstream is legitimate — that divergence is
 * exactly what the check WARNS about, and turning it into a failing test here
 * would be the blocking gate the design rules out. `package.json` `name` is the
 * discriminator because the scaffolder rewrites it
 * (`packages/create-agentic-qa/src/prepare.ts:42`) while leaving `repository`
 * pointing at upstream. It fails OPEN: an unreadable or renamed package means
 * skip, never fail.
 */
function isUpstreamCheckout(): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name === 'agentic-qa-boilerplate';
  }
  catch {
    return false;
  }
}

describe('the baseline against this repo', () => {
  it.skipIf(!isUpstreamCheckout())('matches .agents/jira-required.yaml upstream', () => {
    const text = readFileSync(join(REPO_ROOT, '.agents', 'jira-required.yaml'), 'utf8');
    const cmp = compareWorkTypes(parseWorkTypeKeys(text));
    expect(cmp.missingLocally).toEqual([]);
    expect(cmp.extraLocally).toEqual([]);
  });
});
