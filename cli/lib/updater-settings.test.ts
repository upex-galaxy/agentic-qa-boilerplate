import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { CLAUDE_DOC_CONTRACTS_COMMAND, CLAUDE_HOOK_COMMAND, validateHookCompatibility } from './agent-compatibility-contracts.ts';
import { applyPermissionListMerge, CLAUDE_SETTINGS_FILE, formatHookCommand, mergeHookGroups, mergePermissionLists, OPENCODE_SETTINGS_FILE, opencodeDenyGap, parseJsonKeepingDuplicates, readDeclinedDenies, readDeclinedHooks } from './updater-settings';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater settings '));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

/** A settings file with the given allow list plus the keys nothing may touch. */
function settings(allow: string[], extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    permissions: { allow, deny: ['Bash(rm -rf *)'], ask: [] },
    hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node hook.mjs' }] }] },
    env: { BASH_DEFAULT_TIMEOUT_MS: '300000' },
    ...extra,
  }, null, 2)}\n`;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

describe('the Claude permission allow list merges additively', () => {
  test('entries upstream added are appended in upstream order; nothing else moves', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, CLAUDE_SETTINGS_FILE, settings(['Read', 'Skill(acli)', 'Bash(bun *)']));
    write(upstream, CLAUDE_SETTINGS_FILE, settings(['Read', 'Skill(acli)', 'Skill(pr-review-lead)', 'Skill(session-handoff)']));

    const { allowAdded, merged } = mergePermissionLists(root, upstream);
    expect(allowAdded).toEqual(['Skill(pr-review-lead)', 'Skill(session-handoff)']);
    const after = JSON.parse(merged!) as { permissions: { allow: string[], deny: string[], ask: string[] } };
    // The project's own order is preserved and its own entry survives: append,
    // never re-sort, never drop.
    expect(after.permissions.allow).toEqual([
      'Read',
      'Skill(acli)',
      'Bash(bun *)',
      'Skill(pr-review-lead)',
      'Skill(session-handoff)',
    ]);
    expect(after.permissions.deny).toEqual(['Bash(rm -rf *)']);
  });

  test('ask, hooks, env and unknown keys come back byte-identical; deny only grows', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, CLAUDE_SETTINGS_FILE, settings(['Read'], { cleanupPeriodDays: 60, projectOnlyKey: { a: 1 } }));
    // Upstream disagrees about every one of them. None of it may travel.
    write(upstream, CLAUDE_SETTINGS_FILE, JSON.stringify({
      permissions: { allow: ['Read', 'Skill(new)'], deny: ['Bash(everything *)'], ask: ['Write'] },
      hooks: {},
      env: { BASH_DEFAULT_TIMEOUT_MS: '1' },
      cleanupPeriodDays: 1,
    }, null, 2));

    const { merged } = mergePermissionLists(root, upstream);
    const before = JSON.parse(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf-8')) as Record<string, unknown>;
    const after = JSON.parse(merged!) as Record<string, unknown>;
    // The project's deny entry stays first; upstream's is appended after it.
    expect(after.permissions).toMatchObject({ deny: ['Bash(rm -rf *)', 'Bash(everything *)'], ask: [] });
    for (const key of ['hooks', 'env', 'cleanupPeriodDays', 'projectOnlyKey']) {
      expect(after[key]).toEqual(before[key]);
    }
  });

  test('a project that removed an entry gets it back — accepted, and deny is how to say no', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, CLAUDE_SETTINGS_FILE, settings(['Read']));
    write(upstream, CLAUDE_SETTINGS_FILE, settings(['Read', 'Bash(curl *)']));
    expect(mergePermissionLists(root, upstream).allowAdded).toEqual(['Bash(curl *)']);
    // Twice in a row, because nothing remembers removals by design: the same
    // entry re-appears on every sync until the project expresses it in `deny`.
    applyPermissionListMerge(root, upstream);
    expect(mergePermissionLists(root, upstream).allowAdded).toEqual([]);
  });

  test('nothing to add, an unreadable side or a file without a permissions block writes nothing', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    // Already a superset of upstream.
    write(root, CLAUDE_SETTINGS_FILE, settings(['Read', 'Write']));
    write(upstream, CLAUDE_SETTINGS_FILE, settings(['Read']));
    expect(mergePermissionLists(root, upstream).merged).toBeNull();
    // Upstream missing entirely.
    expect(mergePermissionLists(root, temporaryRoot()).merged).toBeNull();
    // Unparseable project copy: never rewrite a file we cannot read.
    write(root, CLAUDE_SETTINGS_FILE, '{ not json');
    expect(mergePermissionLists(root, upstream).merged).toBeNull();
    // A shape this merge does not understand is left alone, not guessed at.
    write(root, CLAUDE_SETTINGS_FILE, '{\n  "env": {}\n}\n');
    expect(mergePermissionLists(root, upstream).merged).toBeNull();
    // An absent allow stays absent (deny already complete here).
    write(root, CLAUDE_SETTINGS_FILE, '{\n  "permissions": { "deny": ["Bash(rm -rf *)"] }\n}\n');
    expect(mergePermissionLists(root, upstream).merged).toBeNull();
  });

  test('the file keeps its indent and trailing-newline style', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    // Four-space indent, no trailing newline.
    write(root, CLAUDE_SETTINGS_FILE, JSON.stringify({ permissions: { allow: ['Read'] } }, null, 4));
    write(upstream, CLAUDE_SETTINGS_FILE, settings(['Read', 'Skill(new)']));
    const { merged } = mergePermissionLists(root, upstream);
    expect(merged).toContain('\n    "permissions"');
    expect(merged!.endsWith('\n')).toBe(false);
  });

  test('applyPermissionListMerge writes the file and reports what it added', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, CLAUDE_SETTINGS_FILE, settings(['Read']));
    write(upstream, CLAUDE_SETTINGS_FILE, settings(['Read', 'Skill(new)']));
    expect(applyPermissionListMerge(root, upstream)).toEqual({ allowAdded: ['Skill(new)'], denyAdded: [], denyDeclined: [] });
    const onDisk = JSON.parse(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf-8')) as { permissions: { allow: string[] } };
    expect(onDisk.permissions.allow).toEqual(['Read', 'Skill(new)']);
  });
});

/** Upstream's settings: a destructive-command deny plus the secret denies. */
const UPSTREAM_DENY = ['Bash(rm -rf *)', 'Read(.env)', 'Read(.auth/**)', 'Bash(printenv*)'];

function settingsWithDeny(deny: string[] | undefined): string {
  const permissions: Record<string, unknown> = { allow: ['Read'], ask: ['Write'] };
  if (deny !== undefined) { permissions.deny = deny; }
  return `${JSON.stringify({ permissions, hooks: {}, env: { A: '1' } }, null, 2)}\n`;
}

describe('the Claude permission deny list merges additively', () => {
  test('a project scaffolded before the secret denies receives them after its own entries', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, CLAUDE_SETTINGS_FILE, settingsWithDeny(['Bash(rm -rf *)']));
    write(upstream, CLAUDE_SETTINGS_FILE, settingsWithDeny(UPSTREAM_DENY));

    const { allowAdded, denyAdded, denyDeclined, merged } = mergePermissionLists(root, upstream);
    expect(allowAdded).toEqual([]);
    expect(denyAdded).toEqual(['Read(.env)', 'Read(.auth/**)', 'Bash(printenv*)']);
    expect(denyDeclined).toEqual([]);
    const after = JSON.parse(merged!) as { permissions: Record<string, unknown>, env: unknown };
    expect(after.permissions.deny).toEqual(UPSTREAM_DENY);
    // allow and ask are exactly what the project wrote.
    expect(after.permissions.allow).toEqual(['Read']);
    expect(after.permissions.ask).toEqual(['Write']);
    expect(after.env).toEqual({ A: '1' });
  });

  test('a project with no deny list at all gets one inside its permissions block', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, CLAUDE_SETTINGS_FILE, settingsWithDeny(undefined));
    write(upstream, CLAUDE_SETTINGS_FILE, settingsWithDeny(UPSTREAM_DENY));
    const after = JSON.parse(mergePermissionLists(root, upstream).merged!) as { permissions: Record<string, unknown> };
    expect(after.permissions.deny).toEqual(UPSTREAM_DENY);
  });

  test('a custom project deny keeps its place; nothing is removed or reordered', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    // Project order differs from upstream's and carries an entry upstream never had.
    write(root, CLAUDE_SETTINGS_FILE, settingsWithDeny(['Bash(terraform destroy *)', 'Read(.env)', 'Bash(rm -rf *)']));
    write(upstream, CLAUDE_SETTINGS_FILE, settingsWithDeny(UPSTREAM_DENY));
    const { denyAdded, merged } = mergePermissionLists(root, upstream);
    expect(denyAdded).toEqual(['Read(.auth/**)', 'Bash(printenv*)']);
    expect((JSON.parse(merged!) as { permissions: { deny: string[] } }).permissions.deny)
      .toEqual(['Bash(terraform destroy *)', 'Read(.env)', 'Bash(rm -rf *)', 'Read(.auth/**)', 'Bash(printenv*)']);
  });

  test('an opted-out deny is never appended, and is reported as declined', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, CLAUDE_SETTINGS_FILE, settingsWithDeny(['Bash(rm -rf *)']));
    write(upstream, CLAUDE_SETTINGS_FILE, settingsWithDeny(UPSTREAM_DENY));
    const declinedDenies = ['Bash(printenv*)'];

    const first = applyPermissionListMerge(root, upstream, { declinedDenies });
    expect(first.denyAdded).toEqual(['Read(.env)', 'Read(.auth/**)']);
    expect(first.denyDeclined).toEqual(['Bash(printenv*)']);
    // Stable: the next sync adds nothing and keeps reporting the decision.
    const second = mergePermissionLists(root, upstream, { declinedDenies });
    expect(second.merged).toBeNull();
    expect(second.denyDeclined).toEqual(['Bash(printenv*)']);
    const onDisk = JSON.parse(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf-8')) as { permissions: { deny: string[] } };
    expect(onDisk.permissions.deny).not.toContain('Bash(printenv*)');
  });

  test('a declined entry the project already has stays: the opt-out never removes', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, CLAUDE_SETTINGS_FILE, settingsWithDeny(UPSTREAM_DENY));
    write(upstream, CLAUDE_SETTINGS_FILE, settingsWithDeny(UPSTREAM_DENY));
    const result = mergePermissionLists(root, upstream, { declinedDenies: ['Read(.env)'] });
    expect(result.merged).toBeNull();
    expect(result.denyDeclined).toEqual([]);
  });

  test('a list of another shape is left alone; the other list still merges', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(upstream, CLAUDE_SETTINGS_FILE, settingsWithDeny(UPSTREAM_DENY));
    write(root, CLAUDE_SETTINGS_FILE, '{\n  "permissions": { "allow": ["Read"], "deny": "Read(.env)" }\n}\n');
    expect(mergePermissionLists(root, upstream).merged).toBeNull();
    write(root, CLAUDE_SETTINGS_FILE, '{\n  "permissions": { "allow": "Read" }\n}\n');
    expect(JSON.parse(mergePermissionLists(root, upstream).merged!))
      .toEqual({ permissions: { allow: 'Read', deny: UPSTREAM_DENY } });
  });
});

describe('updater.declined_denies in .agents/project.yaml', () => {
  test('absent file, block or key is an empty list', () => {
    const root = temporaryRoot();
    expect(readDeclinedDenies(root)).toEqual({ entries: [] });
    write(root, '.agents/project.yaml', 'project:\n  project_name: null\n');
    expect(readDeclinedDenies(root)).toEqual({ entries: [] });
    write(root, '.agents/project.yaml', 'updater:\n  protected_paths: []\n');
    expect(readDeclinedDenies(root)).toEqual({ entries: [] });
    write(root, '.agents/project.yaml', 'updater:\n  protected_paths: []\n  declined_denies: []\n');
    expect(readDeclinedDenies(root)).toEqual({ entries: [] });
  });

  test('a list of strings is read verbatim', () => {
    const root = temporaryRoot();
    write(root, '.agents/project.yaml', 'updater:\n  protected_paths: []\n  declined_denies:\n    - Bash(printenv*)\n    - "Bash(env)"\n');
    expect(readDeclinedDenies(root)).toEqual({ entries: ['Bash(printenv*)', 'Bash(env)'] });
  });

  test('a malformed value is reported and ignored (fails toward more denies)', () => {
    const root = temporaryRoot();
    write(root, '.agents/project.yaml', 'updater:\n  declined_denies: Bash(env)\n');
    const result = readDeclinedDenies(root);
    expect(result.entries).toEqual([]);
    expect(result.error).toContain('updater.declined_denies');
  });
});

describe('opencode.jsonc deny gap (measured, never rewritten)', () => {
  const upstreamOpencode = `{
  // comment
  "permission": {
    "edit": "allow",
    "bash": {
      "*": "ask",
      "git *": "allow",
      "rm -rf *": "deny",
      "printenv*": "deny",
    },
    "read": {
      "*": "allow",
      "*.env": "deny",
      "*.env.*": "deny",
      "*.env.example": "allow",
      "*.env.schema": "allow",
      "*.auth/*": "deny",
    },
  },
}
`;

  test('lists the upstream denies the project lacks and renders the paste block', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(upstream, OPENCODE_SETTINGS_FILE, upstreamOpencode);
    write(root, OPENCODE_SETTINGS_FILE, '{\n  // mine\n  "permission": {\n    "bash": { "*": "ask", "rm -rf *": "deny", },\n    "read": { "*": "allow" },\n  },\n}\n');
    const gap = opencodeDenyGap(root, upstream)!;
    expect(gap.missing).toEqual([{ tool: 'bash', patterns: ['printenv*'] }, { tool: 'read', patterns: ['*.env', '*.env.*', '*.auth/*'] }]);
    expect(gap.block).toContain('"bash": {\n  "printenv*": "deny",\n},');
    // Allows upstream has are never offered on their own: only denies travel.
    expect(gap.block).not.toContain('git *');
    // The project's file is untouched.
    expect(readFileSync(join(root, OPENCODE_SETTINGS_FILE), 'utf-8')).toContain('// mine');
  });

  test('an exception after a missing deny travels with it, so the last match keeps it', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(upstream, OPENCODE_SETTINGS_FILE, upstreamOpencode);
    // The project already allows the schema file; that action is kept, re-stated after the deny.
    write(root, OPENCODE_SETTINGS_FILE, '{ "permission": { "read": { "*": "allow", "*.env.schema": "ask" } } }\n');
    const gap = opencodeDenyGap(root, upstream)!;
    expect(gap.missing.find(m => m.tool === 'read')!.patterns).toEqual(['*.env', '*.env.*', '*.auth/*']);
    expect(gap.block).toContain('"read": {\n  "*.env": "deny",\n  "*.env.*": "deny",\n  "*.env.example": "allow",\n  "*.env.schema": "ask",\n  "*.auth/*": "deny",\n},');
    // An exception that comes before every missing deny is not repeated.
    expect(gap.block).not.toContain('"*": "allow"');
  });

  test('a pattern the project lists with another action is its opt-out', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(upstream, OPENCODE_SETTINGS_FILE, upstreamOpencode);
    write(root, OPENCODE_SETTINGS_FILE, '{ "permission": { "bash": { "rm -rf *": "deny", "printenv*": "ask" }, "read": { "*.env": "allow", "*.env.*": "deny", "*.auth/*": "deny" } } }\n');
    expect(opencodeDenyGap(root, upstream)).toBeNull();
  });

  test('a tool declared as one action keeps that action as the map default', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(upstream, OPENCODE_SETTINGS_FILE, upstreamOpencode);
    write(root, OPENCODE_SETTINGS_FILE, '{ "permission": { "bash": "ask", "read": "allow" } }\n');
    const gap = opencodeDenyGap(root, upstream)!;
    expect(gap.block).toContain('"bash": {\n  "*": "ask",\n  "rm -rf *": "deny",\n  "printenv*": "deny",\n},');
  });

  test('a missing or unparseable file on either side is no gap', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    expect(opencodeDenyGap(root, upstream)).toBeNull();
    write(upstream, OPENCODE_SETTINGS_FILE, upstreamOpencode);
    expect(opencodeDenyGap(root, upstream)).toBeNull();
    write(root, OPENCODE_SETTINGS_FILE, '{ not json');
    expect(opencodeDenyGap(root, upstream)).toBeNull();
  });
});

// --- hooks ---------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '../..');
const ROUTER_L0 = '# L0\n<!-- router:start -->\n| When the request involves | Read | Was | Then |\n|---|---|---|---|\n| git | `agent-git.md` | §11 | - |\n<!-- router:end -->\n';
const PROJECT_HOOK = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/scripts/audit-bash.mjs"', timeout: 3 }] };

function hook(command: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'command', command, timeout: 5, ...extra };
}

/**
 * A downstream project as the sync leaves it before this merge existed: the
 * hook scripts already synced, AGENTS.md with the router, a Claude-only
 * harness list, and a `.claude/settings.json` frozen at an older release (no
 * `PostToolUse` at all) plus a hook of the project's own.
 */
function downstreamProject(hooks: Record<string, unknown> = {
  UserPromptSubmit: [{ hooks: [hook(CLAUDE_HOOK_COMMAND, { statusMessage: 'Loading output contract...' })] }],
  SessionStart: [{ matcher: 'compact', hooks: [hook(CLAUDE_HOOK_COMMAND)] }, { matcher: 'clear', hooks: [hook(CLAUDE_HOOK_COMMAND)] }],
  PreToolUse: [PROJECT_HOOK],
}): string {
  const root = temporaryRoot();
  for (const script of ['personality-reinject.mjs', 'doc-contracts.mjs']) {
    mkdirSync(join(root, '.agents/hooks'), { recursive: true });
    copyFileSync(join(REPO_ROOT, '.agents/hooks', script), join(root, '.agents/hooks', script));
  }
  write(root, 'AGENTS.md', ROUTER_L0);
  write(root, '.agents/project.yaml', 'harnesses: [claude]\nupdater:\n  protected_paths: []\n');
  write(root, CLAUDE_SETTINGS_FILE, `${JSON.stringify({ permissions: { allow: ['Read'], deny: [] }, hooks, env: { A: '1' } }, null, 2)}\n`);
  return root;
}

/** The boilerplate's own settings file is the upstream every downstream merges from. */
function upstreamDir(): string {
  const upstream = temporaryRoot();
  write(upstream, CLAUDE_SETTINGS_FILE, readFileSync(join(REPO_ROOT, CLAUDE_SETTINGS_FILE), 'utf8'));
  return upstream;
}

function apply(root: string, upstream: string, declinedHooks: string[] = []): ReturnType<typeof mergeHookGroups> {
  const result = mergeHookGroups(root, upstream, { declinedHooks });
  if (result.merged !== null) { writeFileSync(join(root, CLAUDE_SETTINGS_FILE), result.merged); }
  return result;
}

describe('the Claude hook groups merge additively', () => {
  test('a project frozen before the route re-surface group fails compat, and passes once the merge ran', () => {
    const root = downstreamProject();
    const upstream = upstreamDir();
    expect(validateHookCompatibility(root, ['claude'])).toEqual([
      expect.stringContaining('claude must re-surface unread routes: a PostToolUse group with no matcher'),
    ]);

    const { added, declined, skipped, duplicatesFolded } = apply(root, upstream);
    expect(added.map(formatHookCommand)).toEqual([
      `PostToolUse(*) ${CLAUDE_HOOK_COMMAND}`,
      `PostToolUse(Edit|Write|MultiEdit) ${CLAUDE_DOC_CONTRACTS_COMMAND}`,
    ]);
    expect([declined, skipped, duplicatesFolded]).toEqual([[], [], []]);
    expect(validateHookCompatibility(root, ['claude'])).toEqual([]);
  });

  test('the project\'s own groups, other keys and order are untouched; new groups go at the end', () => {
    const root = downstreamProject({
      UserPromptSubmit: [{ hooks: [hook(CLAUDE_HOOK_COMMAND)] }],
      PostToolUse: [PROJECT_HOOK],
      SessionStart: [{ matcher: 'compact', hooks: [hook(CLAUDE_HOOK_COMMAND)] }, { matcher: 'clear', hooks: [hook(CLAUDE_HOOK_COMMAND)] }],
    });
    const before = JSON.parse(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf8'));
    apply(root, upstreamDir());
    const after = JSON.parse(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf8'));

    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(after.permissions).toEqual(before.permissions);
    expect(after.env).toEqual(before.env);
    expect(after.hooks.UserPromptSubmit).toEqual(before.hooks.UserPromptSubmit);
    expect(after.hooks.SessionStart).toEqual(before.hooks.SessionStart);
    // The project's group stays first and byte-equal; upstream's arrive after it.
    expect(after.hooks.PostToolUse[0]).toEqual(PROJECT_HOOK);
    expect(after.hooks.PostToolUse.slice(1).map((group: { matcher?: string }) => group.matcher)).toEqual([undefined, 'Edit|Write|MultiEdit']);
  });

  test('a second run adds nothing and writes nothing', () => {
    const root = downstreamProject();
    const upstream = upstreamDir();
    apply(root, upstream);
    const settled = readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf8');
    const again = mergeHookGroups(root, upstream);
    expect(again.added).toEqual([]);
    expect(again.merged).toBeNull();
    expect(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf8')).toBe(settled);
  });

  test('a command declined in updater.declined_hooks stays out and is reported', () => {
    const root = downstreamProject();
    const { added, declined } = apply(root, upstreamDir(), [CLAUDE_DOC_CONTRACTS_COMMAND]);
    expect(added.map(formatHookCommand)).toEqual([`PostToolUse(*) ${CLAUDE_HOOK_COMMAND}`]);
    expect(declined.map(formatHookCommand)).toEqual([`PostToolUse(Edit|Write|MultiEdit) ${CLAUDE_DOC_CONTRACTS_COMMAND}`]);
    expect(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf8')).not.toContain('doc-contracts.mjs');
  });

  test('a command whose script the project lacks is skipped, never wired to a missing file', () => {
    const root = downstreamProject();
    rmSync(join(root, '.agents/hooks/doc-contracts.mjs'));
    const { added, skipped } = apply(root, upstreamDir());
    expect(added.map(formatHookCommand)).toEqual([`PostToolUse(*) ${CLAUDE_HOOK_COMMAND}`]);
    expect(skipped.map(formatHookCommand)).toEqual([`PostToolUse(Edit|Write|MultiEdit) ${CLAUDE_DOC_CONTRACTS_COMMAND}`]);
  });

  test('a matcher of "", "*" or none is the same group key', () => {
    const root = downstreamProject({ PostToolUse: [{ matcher: '', hooks: [hook(CLAUDE_HOOK_COMMAND)] }] });
    const upstream = temporaryRoot();
    write(upstream, CLAUDE_SETTINGS_FILE, JSON.stringify({ hooks: { PostToolUse: [{ matcher: '*', hooks: [hook(CLAUDE_HOOK_COMMAND)] }, { hooks: [hook(CLAUDE_HOOK_COMMAND)] }] } }));
    expect(mergeHookGroups(root, upstream).added).toEqual([]);
  });

  test('an absent hooks object is created; one of another shape is left alone', () => {
    const upstream = upstreamDir();
    const root = temporaryRoot();
    write(root, '.agents/hooks/personality-reinject.mjs', '');
    write(root, '.agents/hooks/doc-contracts.mjs', '');
    write(root, CLAUDE_SETTINGS_FILE, '{\n  "permissions": { "allow": [] }\n}\n');
    const created = JSON.parse(mergeHookGroups(root, upstream).merged!);
    expect(Object.keys(created.hooks)).toEqual(['UserPromptSubmit', 'PostToolUse', 'SessionStart']);
    write(root, CLAUDE_SETTINGS_FILE, '{\n  "hooks": []\n}\n');
    expect(mergeHookGroups(root, upstream).merged).toBeNull();
    write(root, CLAUDE_SETTINGS_FILE, '{\n  "hooks": { "PostToolUse": "off" }\n}\n');
    const merged = JSON.parse(mergeHookGroups(root, upstream).merged!);
    expect(merged.hooks.PostToolUse).toBe('off');
  });

  test('missing or unparseable on either side: nothing, no write', () => {
    const root = downstreamProject();
    expect(mergeHookGroups(root, temporaryRoot()).merged).toBeNull();
    write(root, CLAUDE_SETTINGS_FILE, '{ not json');
    expect(mergeHookGroups(root, upstreamDir()).merged).toBeNull();
  });
});

describe('a settings key repeated by a git auto-merge', () => {
  // Two branches that each added a PostToolUse group, merged by git: valid
  // JSON to every parser, and JSON.parse keeps only the second list.
  const REPEATED = `{
  "permissions": { "allow": ["Read"] },
  "hooks": {
    "PostToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \\"$CLAUDE_PROJECT_DIR/scripts/audit-bash.mjs\\"" }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": ${JSON.stringify(CLAUDE_HOOK_COMMAND)} }] }
    ]
  }
}
`;

  test('both lists survive the hook merge, folded into one, and the fold is reported', () => {
    const root = downstreamProject();
    write(root, CLAUDE_SETTINGS_FILE, REPEATED);
    const { duplicatesFolded, merged, added } = mergeHookGroups(root, upstreamDir());
    expect(duplicatesFolded).toEqual(['hooks.PostToolUse']);
    const groups = JSON.parse(merged!).hooks.PostToolUse as { matcher?: string }[];
    expect(groups.map(group => group.matcher)).toEqual(['Bash', undefined, 'Edit|Write|MultiEdit']);
    // The unmatched personality group the second list already carried is not added again.
    expect(added.map(formatHookCommand)).not.toContain(`PostToolUse(*) ${CLAUDE_HOOK_COMMAND}`);
  });

  test('the permission merge no longer drops the first list either', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, CLAUDE_SETTINGS_FILE, REPEATED);
    write(upstream, CLAUDE_SETTINGS_FILE, settings(['Read', 'Skill(acli)']));
    const after = JSON.parse(mergePermissionLists(root, upstream).merged!);
    expect(after.hooks.PostToolUse).toHaveLength(2);
  });

  test('parseJsonKeepingDuplicates reads a clean file exactly like JSON.parse and rejects malformed JSON', () => {
    const real = readFileSync(join(REPO_ROOT, CLAUDE_SETTINGS_FILE), 'utf8');
    expect(parseJsonKeepingDuplicates(real)).toEqual({ data: JSON.parse(real), duplicates: [] });
    const tricky = '{"a":[1,-2.5e3,true,null,"q\\"\\u00e9"],"__proto__":{"x":1},"b":{}}';
    expect(parseJsonKeepingDuplicates(tricky).data).toEqual(JSON.parse(tricky));
    for (const bad of ['{', '{"a":1,}', '[1 2]', '{"a":1} x', '\'a\'', '{"a":"raw\nnewline"}']) {
      expect(() => parseJsonKeepingDuplicates(bad)).toThrow(SyntaxError);
    }
  });

  test('repeated lists fold without repeating an identical item; repeated scalars keep the last', () => {
    const { data, duplicates } = parseJsonKeepingDuplicates('{"l":[1,2],"l":[2,3],"o":{"x":[1]},"o":{"x":[2],"y":1},"s":1,"s":2}');
    expect(data).toEqual({ l: [1, 2, 3], o: { x: [1, 2], y: 1 }, s: 2 });
    expect(duplicates).toEqual(['l', 'o', 's']);
  });
});

describe('updater.declined_hooks in .agents/project.yaml', () => {
  test('absent is empty; a list of commands is read verbatim; a malformed value is reported and ignored', () => {
    const root = temporaryRoot();
    expect(readDeclinedHooks(root)).toEqual({ entries: [] });
    write(root, '.agents/project.yaml', `updater:\n  declined_hooks:\n    - ${JSON.stringify(CLAUDE_DOC_CONTRACTS_COMMAND)}\n`);
    expect(readDeclinedHooks(root)).toEqual({ entries: [CLAUDE_DOC_CONTRACTS_COMMAND] });
    write(root, '.agents/project.yaml', 'updater:\n  declined_hooks: node x.mjs\n');
    const result = readDeclinedHooks(root);
    expect(result.entries).toEqual([]);
    expect(result.error).toContain('updater.declined_hooks');
  });
});
