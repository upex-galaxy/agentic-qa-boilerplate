/**
 * Regression tests for `scripts/git-policy.ts` — specifically for the bypass
 * READ, which is where the script used to invent host drift.
 *
 * The defect: GitHub serves `bypass_actors` only to a caller with admin rights
 * on the repository. A non-admin receives the SAME, unchanged ruleset with that
 * key omitted. `verify` coerced the missing key to `[]`, concluded "no admin
 * bypass is configured", and reported `admin_bypass declared: true / enforced:
 * false` — exit 1, blocking `repo:check` and the pre-push hook on any machine
 * whose active `gh` account had drifted to a second identity. Nothing on the
 * host had changed; only the reader had.
 *
 * The fixtures below are TRIMMED COPIES OF REAL RESPONSES, captured on
 * 2026-09-18 from `gh api repos/upex-galaxy/agentic-qa-boilerplate/rulesets/16809531`
 * under two accounts, against one ruleset whose `updated_at` was three days old
 * in both readings. That identity is the entire point: same ruleset, two shapes.
 */

import { describe, expect, test } from 'bun:test';

import { assessBypass } from './git-policy.ts';

/** Read by an account WITH admin rights: the key is present and populated. */
const PRIVILEGED = {
  id: 16809531,
  name: 'ProtectPublic',
  enforcement: 'active',
  updated_at: '2026-09-15T16:22:43.134-03:00',
  bypass_actors: [
    { actor_id: null, actor_type: 'OrganizationAdmin', bypass_mode: 'always' },
    { actor_id: 91127281, actor_type: 'User', bypass_mode: 'always' },
  ],
  current_user_can_bypass: 'always',
};

/** Read by an account WITHOUT admin rights: no `bypass_actors` key at all. */
const UNPRIVILEGED = {
  id: 16809531,
  name: 'ProtectPublic',
  enforcement: 'active',
  updated_at: '2026-09-15T16:22:43.134-03:00',
  current_user_can_bypass: 'never',
};

describe('assessBypass — the reader, not the ruleset', () => {
  test('an admin reading a populated bypass list gets a KNOWN answer', () => {
    const r = assessBypass(PRIVILEGED);
    expect(r.known).toBe(true);
    if (!r.known) { return; }
    expect(r.hasAdminBypass).toBe(true);
    expect(r.actors).toHaveLength(2);
  });

  test('a non-admin gets UNKNOWN, never "no bypass actors" — the regression', () => {
    const r = assessBypass(UNPRIVILEGED);
    expect(r.known).toBe(false);
    if (r.known) { return; }
    expect(r.currentUserCanBypass).toBe('never');
    // The message has to name the cause, or the reader re-litigates the host.
    expect(r.reason).toContain('bypass_actors');
    expect(r.reason).toContain('current_user_can_bypass: never');
  });

  test('the discriminator is the SHAPE of the field, not its length', () => {
    // A privileged read of a ruleset with no bypass actors is a present, EMPTY
    // array. Treating that as "unknown" would be the opposite bug: a genuinely
    // removed bypass would stop being reported.
    const empty = assessBypass({ ...PRIVILEGED, bypass_actors: [], current_user_can_bypass: 'always' });
    expect(empty.known).toBe(true);
    if (!empty.known) { return; }
    expect(empty.hasAdminBypass).toBe(false);
  });

  test('an explicit null bypass_actors is unknown, not empty', () => {
    const r = assessBypass({ ...UNPRIVILEGED, bypass_actors: null });
    expect(r.known).toBe(false);
  });

  test('an unreadable ruleset (403 / 404 / offline) is unknown, not empty', () => {
    const r = assessBypass(null);
    expect(r.known).toBe(false);
    if (r.known) { return; }
    expect(r.currentUserCanBypass).toBeNull();
    expect(r.reason).toContain('could not be read');
  });

  test('a repository-role bypass counts as admin bypass', () => {
    const r = assessBypass({ bypass_actors: [{ actor_type: 'RepositoryRole', bypass_mode: 'always' }] });
    expect(r.known).toBe(true);
    if (!r.known) { return; }
    expect(r.hasAdminBypass).toBe(true);
  });

  test('a non-admin actor list does not masquerade as admin bypass', () => {
    const r = assessBypass({ bypass_actors: [{ actor_type: 'User', bypass_mode: 'pull_requests_only' }] });
    expect(r.known).toBe(true);
    if (!r.known) { return; }
    expect(r.hasAdminBypass).toBe(false);
  });

  test('a response with no privilege hint still degrades to unknown', () => {
    const r = assessBypass({ id: 1, name: 'X' } as Record<string, unknown>);
    expect(r.known).toBe(false);
    if (r.known) { return; }
    expect(r.currentUserCanBypass).toBeNull();
  });
});

describe('module hygiene', () => {
  // Importing this file must not run the CLI. Without the `import.meta.main`
  // guard, `main()` sees bun test's argv, prints the help text and exits 0 —
  // which ends the whole test process before a single assertion runs.
  test('importing git-policy.ts does not execute its CLI', () => {
    expect(typeof assessBypass).toBe('function');
  });
});
