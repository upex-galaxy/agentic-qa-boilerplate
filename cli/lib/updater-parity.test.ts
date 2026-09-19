import type { ParityFinding, ParityInput, ParityMeta } from './updater-parity.ts';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import {
  ABORTED_OUTRO,
  archivedSkillsToReport,
  buildParityFileBody,
  buildParityPrompt,
  collectParityFindings,
  compatErrorSuggestion,
  compatErrorSurface,
  CONFIG_BLOCK_READERS,
  configEntries,
  configKeyDelta,
  configKeys,
  describeWatchedFile,
  diffNoIndex,
  diffStats,
  frameworkGatesNote,
  lintStagedNoStashNote,
  markdownSectionDelta,
  missingConfigBlocks,
  PATH_PREREQUISITES,
  persistArchivedSkillMarkers,
  prerequisiteFor,
  protectNote,
  readGitStrategyStamp,
  renderParityReport,
  RESOLVED_BY_APPLY_MARK,
  resolvedByApply,
  runVerdict,
  strictVerdict,
  structuralEvidence,
  SURFACE_ORDER,
  watchedFileEvidence,
} from './updater-parity.ts';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'parity '));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

const META: ParityMeta = {
  templateRepo: 'upex-galaxy/agentic-qa-boilerplate',
  upstreamSha: 'abcdef1234567890',
  lockSha: '1234567abcdef',
  promptFile: '.agents/prompts/parity-plan.md',
};

const MANIFEST = JSON.stringify({
  version: 1,
  wrapperHosts: ['claude', 'opencode'],
  aliases: [{ alias: 'sync-ai-memory', skill: 'sync-ai-memory', mode: 'default', forwardArguments: true }],
});

/** A project + upstream pair with every finding type present. */
function fixture(): { root: string, upstream: string, input: ParityInput } {
  const root = temporaryRoot();
  const upstream = temporaryRoot();

  // Instructions: upstream added a section, changed one, project has its own.
  write(root, 'AGENTS.md', '# Memory\n\n## 1. RULES\n\nold rule\n\n## 9. ACME ONLY\n\nours\n');
  write(upstream, 'AGENTS.md', '# Memory\n\n## 1. RULES\n\nnew rule\n\n## 5.5 MULTI-HARNESS\n\nthree hosts\n');

  // Hooks/config: project keeps its own permission entries, upstream added a key.
  write(root, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(bun *)'] }, hooks: {} }, null, 2));
  write(upstream, '.claude/settings.json', JSON.stringify({ permissions: { allow: [], deny: [] }, hooks: {}, env: {} }, null, 2));

  // MCP: the Codex registry drifted (upstream added n8n) AND fails the set contract.
  write(root, '.codex/config.toml', '[mcp_servers.context7]\ncommand = "x"\n\n[mcp_servers.acme]\ncommand = "y"\n');
  write(upstream, '.codex/config.toml', '[mcp_servers.context7]\ncommand = "x"\n\n[mcp_servers.n8n]\ncommand = "z"\n');

  // Commands: one manifest wrapper, one overlay wrapper, one rogue wrapper per
  // host. The compat check names the Claude one; the OpenCode one is found by
  // the disk scan alone (as when the check could not run).
  write(upstream, '.agents/compatibility/command-aliases.json', MANIFEST);
  write(root, '.agents/compatibility/command-aliases.json', MANIFEST);
  write(root, '.agents/compatibility/command-aliases.project.json', JSON.stringify({ version: 1, aliases: [{ alias: 'acme-deploy' }] }));
  write(root, '.claude/commands/sync-ai-memory.md', 'wrapper\n');
  write(root, '.claude/commands/acme-deploy.md', 'overlay wrapper\n');
  write(root, '.claude/commands/rogue.md', 'nobody produced this\n');
  write(root, '.opencode/commands/rogue.md', 'nobody produced this\n');

  // Skills: the migration archived a colliding copy.
  write(root, '.agents/skills/acli/SKILL.md', '---\nname: acli\n---\nupstream body\n');
  write(root, '.template/pre-agents-migration/skills/acli/SKILL.md', '---\nname: acli\n---\nproject body\n');

  // Git: shipped default nobody chose.
  write(root, '.agents/project.yaml', 'git_strategy:\n  strategy: solo-main\n  meta:\n    strategy_source: inherited\n');

  const input: ParityInput = {
    root,
    upstreamDir: upstream,
    drift: [
      { path: 'AGENTS.md', reason: 'memory' },
      { path: '.claude/settings.json', reason: 'permissions' },
      { path: '.codex/config.toml', reason: 'codex mcp registry' },
    ],
    compatErrors: [
      'MCP n8n missing from codex: declared in .mcp.json, absent from .codex/config.toml',
      'MCP acme present in codex only: declare it in .mcp.json or remove it from .codex/config.toml',
      'claude command wrapper contains workflow prose: .claude/commands/sync-ai-memory.md',
      'Command wrapper not declared in any manifest: .claude/commands/rogue.md; add it to .agents/compatibility/command-aliases.project.json or delete it',
      'claude hook command must be exactly: node "$CLAUDE_PROJECT_DIR/.agents/hooks/personality-reinject.mjs"',
    ],
    archivedSkills: ['acli'],
    archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
    heldBack: [{ component: 'cli', lockCommit: 'deadbeefcafe' }, { component: 'docs', lockCommit: null }],
    envNewKeys: ['N8N_API_KEY', 'RESEND_API_KEY'],
  };
  return { root, upstream, input };
}

describe('section-level evidence', () => {
  test('markdown delta reports headings added upstream, changed, and project-only', () => {
    const delta = markdownSectionDelta(
      '# T\n\n## A\n\nsame\n\n## B\n\nmine\n\n## C\n\nours\n',
      '# T\n\n## A\n\nsame\n\n## B\n\ntheirs\n\n## D\n\nnew\n',
    );
    expect(delta.added).toEqual(['D']);
    expect(delta.changed).toEqual(['B']);
    expect(delta.removed).toEqual(['C']);
  });

  test('a heading changed only by punctuation counts as unchanged; hunk counts still come from the real diff', () => {
    // Em dash, en dash, spaced hyphen and colon are interchangeable separators.
    const sameBody = markdownSectionDelta(
      `# T\n\n## A ${'—'} B\n\nsame\n`,
      '# T\n\n## A: B\n\nsame\n',
    );
    expect(sameBody).toEqual({ added: [], removed: [], changed: [] });
    const alsoUnchanged = markdownSectionDelta(
      '# T\n\n## A - B\n\nsame\n',
      `# T\n\n## A ${'–'} B\n\nsame\n`,
    );
    expect(alsoUnchanged).toEqual({ added: [], removed: [], changed: [] });
    // A genuine body change under a punctuation-only heading rename is still caught.
    const changedBody = markdownSectionDelta(
      '# T\n\n## A - B\n\nmine\n',
      `# T\n\n## A ${'–'} B\n\ntheirs\n`,
    );
    expect(changedBody).toEqual({ added: [], removed: [], changed: [`A ${'–'} B`] });
    // A heading that is genuinely different (not just punctuation) still reports.
    const genuinelyDifferent = markdownSectionDelta('# T\n\n## A: B\n\nx\n', '# T\n\n## A: C\n\nx\n');
    expect(genuinelyDifferent).toEqual({ added: ['A: C'], removed: ['A: B'], changed: [] });
    // Hunk counts are a separate path from heading evidence: unaffected.
    const diff = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n';
    expect(describeWatchedFile('AGENTS.md', `## A ${'—'} B\n\nsame\n`, '## A: B\n\nsame\n', diff))
      .toBe('same headings and bodies; formatting or comments differ; 1 hunk (+1/-1)');
  });

  test('config keys go two levels deep for JSON, JSONC, TOML and YAML', () => {
    expect(configKeys('{"mcpServers":{"n8n":{}},"x":1}', '.mcp.json')).toEqual(['mcpServers', 'mcpServers.n8n', 'x']);
    expect(configKeys('{\n  // c\n  "mcp": { "n8n": {}, },\n}', 'opencode.jsonc')).toEqual(['mcp', 'mcp.n8n']);
    expect(configKeys('[mcp_servers.n8n]\ncommand = "x"\n', '.codex/config.toml')).toEqual(['mcp_servers', 'mcp_servers.n8n']);
    expect(configKeys('testing:\n  default_env: staging\ngit_strategy:\n  strategy: solo-main\n', '.agents/project.yaml'))
      .toEqual(['testing', 'testing.default_env', 'git_strategy', 'git_strategy.strategy']);
    expect(configKeys('export default {}', 'eslint.config.js')).toBeNull();
  });

  test('key delta separates upstream additions from project-only keys', () => {
    expect(configKeyDelta(['a', 'b.x'], ['a', 'b.y'])).toEqual({ added: ['b.y'], projectOnly: ['b.x'], changed: [], changedDetail: {}, changedArrays: [], addedObjects: [] });
    // With values (Maps) the shared keys whose values differ are named; a top
    // key with object children is judged through its children only.
    const mine = configEntries('{"a":1,"b":{"x":1,"y":[1]},"c":{"z":1}}', 'x.json')!;
    const theirs = configEntries('{"a":2,"b":{"x":1,"y":[2]},"c":{"z":1}}', 'x.json')!;
    // An array on both sides is reported by its ELEMENTS, and listed in
    // `changedArrays` so the evidence never calls an appended entry a changed value.
    expect(configKeyDelta(mine, theirs)).toEqual({
      added: [],
      projectOnly: [],
      changed: ['a', 'b.y'],
      changedDetail: { 'b.y': 'added: ["2"], removed: ["1"]' },
      changedArrays: ['b.y'],
      addedObjects: [],
    });
  });

  test('watched-file evidence names sections for markdown and keys for config, plus hunk counts', () => {
    const diff = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n@@ -5 +5 @@\n+added\n';
    expect(diffStats(diff)).toEqual({ hunks: 2, added: 2, removed: 1 });
    const md = describeWatchedFile('AGENTS.md', '## A\n\nx\n', '## A\n\ny\n\n## B\n\nz\n', diff);
    expect(md).toBe('port upstream additions only: "B"; keep project bodies at: "A"; 2 hunks (+2/-1)');
    const json = describeWatchedFile('.mcp.json', '{"mcpServers":{"a":{}}}', '{"mcpServers":{"a":{},"b":{}}}', diff);
    expect(json).toBe('upstream added 1 key: "mcpServers.b"; nothing project-only; 2 hunks (+2/-1)');
    expect(describeWatchedFile('eslint.config.js', 'a', 'b', diff)).toBe('content differs (no key structure): review the hunks in the saved file; 2 hunks (+2/-1)');
  });

  test('cost signal: the verb follows what porting upstream adds and what it costs the project', () => {
    // Live finding (Bunkai): tsconfig.json read `merge` with no cost signal,
    // while applying upstream literally would have dropped the Next.js keys.
    const diff = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n';
    const row = (project: string, upstream: string, file = 'x.json'): [string, string] => {
      const e = watchedFileEvidence(file, project, upstream, diff);
      return [e.suggested, e.evidence.replace(/; 1 hunk \(\+1\/-1\)$/, '')];
    };
    // Both: port the additions, keep the project's own keys.
    expect(row('{"compilerOptions":{"jsx":"preserve","paths":{}}}', '{"compilerOptions":{"paths":{},"allowJs":true},"include":[]}'))
      .toEqual(['merge', 'port upstream additions only: "compilerOptions.allowJs", "include"; keep project-only key: "compilerOptions.jsx"']);
    // Only upstream additions, nothing else differs: nothing to lose.
    expect(row('{"a":{"x":1}}', '{"a":{"x":1,"y":2}}')).toEqual(['take upstream', 'upstream added 1 key: "a.y"; nothing project-only']);
    // Upstream additions next to project values at shared keys: port the additions only.
    expect(row('{"a":{"x":1}}', '{"a":{"x":2,"y":2}}')).toEqual(['merge', 'port upstream additions only: "a.y"; keep project values at: "a.x"']);
    // Only project-only keys: nothing to port.
    expect(row('{"a":{"x":1},"mine":{}}', '{"a":{"x":1}}')).toEqual(['keep project', 'project-only key: "mine"; upstream adds nothing']);
    expect(row('{"a":{"x":1},"mine":{}}', '{"a":{"x":2}}')).toEqual(['merge', 'keep project-only key: "mine"; values differ at: "a.x" (port what you want)']);
    // Same keys: the changed values are named, never a bare merge.
    expect(row('{"a":{"x":1}}', '{"a":{"x":2}}')).toEqual(['merge', 'same keys, values differ at: "a.x" (port what you want, keep the rest)']);
    expect(row('{"a":{"x":1}}', '{ "a": { "x": 1 } }')).toEqual(['keep project', 'same keys and values; formatting or comments differ']);
    // Markdown: the same table over headings.
    expect(row('## A\n\nx\n\n## MINE\n\nm\n', '## A\n\nx\n\n## B\n\nb\n', 'AGENTS.md'))
      .toEqual(['merge', 'port upstream additions only: "B"; keep project-only heading: "MINE"']);
    expect(row('## A\n\nx\n', '## A\n\nx\n\n## B\n\nb\n', 'AGENTS.md')).toEqual(['take upstream', 'upstream added 1 heading: "B"; nothing project-only']);
    expect(row('## A\n\nx\n\n## MINE\n\nm\n', '## A\n\nx\n', 'AGENTS.md')).toEqual(['keep project', 'project-only heading: "MINE"; upstream adds nothing']);
    expect(row('## A\n\nx\n', '## A\n\ny\n', 'AGENTS.md')).toEqual(['merge', 'same headings, body differs in 1: "A" (port what you want, keep the rest)']);
    // TOML and YAML carry values too.
    expect(row('[a]\nx = 1\n', '[a]\nx = 2\n', 'c.toml')[1]).toBe('same keys, values differ at: "a.x" (port what you want, keep the rest)');
    expect(row('a:\n  x: 1\n', 'a:\n  x: 1\n  y: 2\n', 'p.yaml')).toEqual(['take upstream', 'upstream added 1 key: "a.y"; nothing project-only']);
  });

  test('structural (identity) files: a row only for upstream additions, labelled informational; values are never compared', () => {
    expect(structuralEvidence('.agents/project.yaml', 'project:\n  name: acme\n', 'project:\n  name: null\n')).toBeNull();
    expect(structuralEvidence('.agents/project.yaml', 'project:\n  name: acme\n  extra: 1\n', 'project:\n  name: null\n')).toBeNull();
    expect(structuralEvidence('.agents/project.yaml', 'project:\n  name: acme\n', 'project:\n  name: null\nupdater:\n  protected_paths: []\n'))
      .toBe('informational: upstream added 2 keys: "updater", "updater.protected_paths"; merge = add the new keys, values are project identity and never compared');
    expect(structuralEvidence('x.md', '## A\n\nmine\n', '## A\n\ntheirs\n')).toBeNull();
    expect(structuralEvidence('x.md', '## A\n', '## A\n\n## B\n')).toBe('informational: upstream added 1 heading: "B"; merge = add the new headings, values are project identity and never compared');
  });
});

describe('compat error classification', () => {
  test('surface and suggestion follow the wording', () => {
    expect(compatErrorSurface('claude command wrapper contains workflow prose: .claude/commands/x.md')).toBe('commands');
    expect(compatErrorSuggestion('claude command wrapper contains workflow prose: .claude/commands/x.md')).toBe('run agents:compat');
    expect(compatErrorSurface('Claude skills alias missing: .claude/skills')).toBe('skills');
    expect(compatErrorSuggestion('Claude skills alias missing: .claude/skills')).toBe('run agents:compat');
    expect(compatErrorSurface('codex hook command must be exactly: …')).toBe('hooks');
    expect(compatErrorSuggestion('codex hook command must be exactly: …')).toBe('take upstream');
    expect(compatErrorSurface('opencode MCP n8n mismatch: expected {…}, found {…}')).toBe('mcp');
    const stray = 'Command wrapper not declared in any manifest: .claude/commands/stray.md; add it to .agents/compatibility/command-aliases.project.json or delete it';
    expect(compatErrorSurface(stray)).toBe('commands');
    expect(compatErrorSuggestion(stray)).toBe('add to overlay');
  });
});

describe('diffNoIndex', () => {
  test('relabels the two absolute paths as project/ and upstream/, forward slashes included', () => {
    const root = temporaryRoot();
    write(root, 'a/AGENTS.md', '# one\n');
    write(root, 'b/AGENTS.md', '# two\n');
    const diff = diffNoIndex(join(root, 'a', 'AGENTS.md'), join(root, 'b', 'AGENTS.md'));
    expect(diff).toContain('--- a/project/AGENTS.md');
    expect(diff).toContain('+++ b/upstream/AGENTS.md');
    expect(diff).not.toContain(root);
    // A Windows-style caller path is normalized before the relabel, so the
    // forward-slash header git prints still matches it.
    const windowsStyle = diffNoIndex(join(root, 'a', 'AGENTS.md').replace(/\//g, '\\'), join(root, 'b', 'AGENTS.md').replace(/\//g, '\\'));
    if (windowsStyle !== '') { expect(windowsStyle).not.toContain(root); }
  });
});

describe('collectParityFindings', () => {
  test('produces one finding per type, sequential ids, evidence on every row', () => {
    const { input } = fixture();
    const findings = collectParityFindings(input);

    expect(findings.map(f => f.id)).toEqual(findings.map((_, i) => i + 1));
    for (const f of findings) { expect(f.evidence.length).toBeGreaterThan(0); }

    const byPath = (p: string): ParityFinding => {
      const f = findings.find(x => x.path === p);
      if (!f) { throw new Error(`no finding for ${p}: ${findings.map(x => x.path).join(', ')}`); }
      return f;
    };

    const agents = byPath('AGENTS.md');
    expect(agents.surface).toBe('instructions');
    expect(agents.blocking).toBe(false);
    expect(agents.suggested).toBe('merge');
    expect(agents.evidence).toContain('port upstream additions only: "5.5 MULTI-HARNESS"');
    expect(agents.evidence).toContain('keep project-only heading: "9. ACME ONLY"');
    expect(agents.evidence).toContain('body differs in 1: "1. RULES"');
    expect(agents.evidence).toMatch(/\d+ hunks? \(\+\d+\/-\d+\); memory$/);
    expect(agents.diff).toContain('@@');

    const settings = byPath('.claude/settings.json');
    expect(settings.surface).toBe('hooks');
    expect(settings.evidence).toContain('port upstream additions only: "permissions.deny", "env"; keep project values at: "permissions.allow"');
    expect(settings.suggested).toBe('merge');
    expect(settings.diff).toContain('-      "Bash(bun *)"');

    // MCP set errors fold into one row per host, and the watched-file drift on
    // the same path folds into THAT row: compat evidence first, drift evidence
    // appended, the full diff kept, upstream's shape suggested.
    const codex = byPath('.codex/config.toml');
    expect(codex.surface).toBe('mcp');
    expect(codex.blocking).toBe(true);
    expect(codex.evidence).toMatch(/^missing: n8n \(declared in \.mcp\.json\); only here: acme \(not in \.mcp\.json\): declare them in \.mcp\.json and opencode\.jsonc, or remove them; port upstream additions only: "mcp_servers\.n8n"; keep project-only key: "mcp_servers\.acme"; \d+ hunks? \(\+\d+\/-\d+\); codex mcp registry$/);
    // Following `take upstream` literally would delete `acme`, the project's own
    // server: a row naming project-only content always suggests `merge`.
    expect(codex.suggested).toBe('merge');
    expect(codex.diff).toContain('+[mcp_servers.n8n]');
    expect(findings.filter(f => f.path === '.codex/config.toml')).toHaveLength(1);
    expect(findings.filter(f => f.surface === 'mcp')).toHaveLength(1);

    const wrapper = byPath('.claude/commands/sync-ai-memory.md');
    expect(wrapper.surface).toBe('commands');
    expect(wrapper.blocking).toBe(true);
    expect(wrapper.suggested).toBe('run agents:compat');

    const hook = findings.find(f => f.surface === 'hooks' && f.blocking);
    expect(hook?.suggested).toBe('take upstream');

    const archived = byPath('.template/pre-agents-migration/skills/acli');
    expect(archived.surface).toBe('skills');
    expect(archived.evidence).toMatch(/^archived collision vs \.agents\/skills\/acli: 1 hunk \(\+1\/-1\)$/);
    expect(archived.suggested).toBe('decide');
    expect(archived.diff).toContain('project body');

    // A stray wrapper is ONE row per path: the one the compat check named is
    // blocking, the one only the disk scan found is not; both say `add to overlay`.
    const rogue = findings.filter(f => f.surface === 'commands' && f.suggested === 'add to overlay');
    expect(rogue.map(f => [f.path, f.blocking])).toEqual([['.claude/commands/rogue.md', true], ['.opencode/commands/rogue.md', false]]);
    for (const f of rogue) { expect(f.evidence).toBe('wrapper not produced by .agents/compatibility/command-aliases.json nor .agents/compatibility/command-aliases.project.json'); }
    expect(findings.some(f => f.path === '.claude/commands/acme-deploy.md')).toBe(false);

    const held = byPath('.template/boilerplate.lock.json');
    expect(held.surface).toBe('components');
    expect(held.evidence).toBe('held back: cli@deadbee, docs@no lock');

    const env = byPath('.env');
    expect(env.surface).toBe('env');
    expect(env.evidence).toBe('upstream .env.example added 2 key(s): N8N_API_KEY, RESEND_API_KEY');

    const git = byPath('.agents/project.yaml');
    expect(git.surface).toBe('git');
    expect(git.evidence).toContain('strategy_source: inherited');
    expect(git.blocking).toBe(false);
  });

  test('a fully aligned project yields zero findings', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.agents/compatibility/command-aliases.json', MANIFEST);
    write(upstream, '.agents/compatibility/command-aliases.json', MANIFEST);
    write(root, '.claude/commands/sync-ai-memory.md', 'wrapper\n');
    write(root, '.agents/project.yaml', 'git_strategy:\n  strategy: solo-main\n  meta:\n    strategy_source: chosen\n');
    const findings = collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
    });
    expect(findings).toEqual([]);
  });

  test('stray wrappers need a manifest to compare against', () => {
    const root = temporaryRoot();
    write(root, '.claude/commands/anything.md', 'x\n');
    const findings = collectParityFindings({
      root,
      upstreamDir: temporaryRoot(),
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
    });
    expect(findings.filter(f => f.surface === 'commands')).toEqual([]);
  });

  test('archived skills nudge once: this run, plus unreported archive entries, until their marker exists', () => {
    const root = temporaryRoot();
    const archive = join(root, '.template/pre-agents-migration/skills');
    write(root, '.template/pre-agents-migration/skills/acli/SKILL.md', 'old\n');
    write(root, '.template/pre-agents-migration/skills/old-one/SKILL.md', 'older\n');

    // The migration archived `acli` this run; `old-one` sits there from an
    // earlier run that never reported it. Both get their one nudge.
    expect(archivedSkillsToReport(root, archive, ['acli'])).toEqual(['acli', 'old-one']);
    persistArchivedSkillMarkers(root, ['acli', 'old-one']);
    expect(existsSync(join(root, '.template/upstream-sha/archived-skill-acli.marker'))).toBe(true);

    // Next run: the archive dir is still on disk, no migration result, no row.
    expect(archivedSkillsToReport(root, archive, [])).toEqual([]);
    // A fresh archive of the same name (marker present) stays quiet; a new name does not.
    write(root, '.template/pre-agents-migration/skills/newer/SKILL.md', 'x\n');
    expect(archivedSkillsToReport(root, archive, ['acli', 'newer'])).toEqual(['newer']);
    // No archive dir at all: only this run's names.
    expect(archivedSkillsToReport(temporaryRoot(), join(root, 'nope'), ['x'])).toEqual(['x']);
  });

  test('git strategy stamp reads block presence, strategy and provenance', () => {
    expect(readGitStrategyStamp(null)).toEqual({ present: false, strategy: null, source: null });
    expect(readGitStrategyStamp('name: x\n')).toEqual({ present: false, strategy: null, source: null });
    expect(readGitStrategyStamp('git_strategy:\n  strategy: gitflow # c\n  meta:\n    strategy_source: chosen\n'))
      .toEqual({ present: true, strategy: 'gitflow', source: 'chosen' });
  });
});

describe('the pre-commit hook carries the --no-stash fix downstream', () => {
  // Issue #28 bug 2: lint-staged's backup stash cannot traverse the
  // `.claude/skills` symlink, so every commit after the cross-harness migration
  // dies on `Cannot save the current worktree state`. `.husky/pre-commit` is
  // bootstrap-only (project gates live there), so a consumer never receives
  // upstream's fixed copy — the parity row has to tell them.

  test('the note fires only for a hook that still lacks the flag', () => {
    expect(lintStagedNoStashNote('bunx lint-staged\nbun run types:check\n')).toContain('--no-stash');
    expect(lintStagedNoStashNote('bunx lint-staged\n')).toContain('+bunx lint-staged --no-stash');
    expect(lintStagedNoStashNote('bunx lint-staged --no-stash\n')).toBeNull();
    expect(lintStagedNoStashNote('npx lint-staged --no-stash --concurrent false\n')).toBeNull();
    // A hook that does not run lint-staged at all has nothing to fix.
    expect(lintStagedNoStashNote('bun run types:check\n')).toBeNull();
    // A commented-out invocation is not a live one.
    expect(lintStagedNoStashNote('# bunx lint-staged\nbun run lint:check\n')).toBeNull();
  });

  test('the drift row on .husky/pre-commit names the fix and repeats it in the saved file', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.husky/pre-commit', 'bunx lint-staged\nbun run types:check\n');
    write(upstream, '.husky/pre-commit', 'bunx lint-staged --no-stash\nbun run types:check\n');

    const findings = collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [{ path: '.husky/pre-commit', reason: 'project gates live here' }],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
    });

    const hook = findings.find(f => f.path === '.husky/pre-commit');
    expect(hook).toBeDefined();
    expect(hook!.surface).toBe('components');
    expect(hook!.blocking).toBe(false);
    expect(hook!.evidence).toContain('lint-staged still runs without --no-stash');
    expect(hook!.note).toContain('+bunx lint-staged --no-stash');
    expect(buildParityFileBody(findings, META)).toContain('+bunx lint-staged --no-stash');
  });

  test('a hook that already has the flag and sources the gates drifts without a note', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    // Both adoption nudges satisfied: the flag is there AND the hook sources the
    // synced gates file, so the only thing left is ordinary drift.
    const adopted = 'bunx lint-staged --no-stash\n. "$(dirname -- "$0")/framework-gates.sh"\nframework_gates_pre_commit\n';
    write(root, '.husky/pre-commit', adopted);
    write(upstream, '.husky/pre-commit', `${adopted}bun run project:extra\n`);

    const findings = collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [{ path: '.husky/pre-commit', reason: 'project gates live here' }],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
    });

    const hook = findings.find(f => f.path === '.husky/pre-commit');
    expect(hook).toBeDefined();
    expect(hook!.evidence).not.toContain('--no-stash');
    expect(hook!.note).toBeUndefined();
  });
});

describe('the doctrine ledger row', () => {
  function base(root: string, upstream: string): Parameters<typeof collectParityFindings>[0] {
    return {
      root,
      upstreamDir: upstream,
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
    };
  }

  test('with no AGENTS.md drift row of its own it stands alone on Instrucciones', () => {
    const root = temporaryRoot();
    const findings = collectParityFindings({ ...base(root, temporaryRoot()), doctrineDebt: 'informational: 2 doctrine section(s) missing' });
    const row = findings.find(f => f.path === 'AGENTS.md');
    expect(row!.surface).toBe('instructions');
    expect(row!.blocking).toBe(false);
    expect(row!.evidence).toContain('2 doctrine section(s) missing');
  });

  test('it folds onto the AGENTS.md drift row instead of raising a second one', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, 'AGENTS.md', '# Memory\n\n## 1. RULES\n\nmine\n');
    write(upstream, 'AGENTS.md', '# Memory\n\n## 1. RULES\n\nmine\n\n## 9. DOCTRINE\n\nnew\n');
    const findings = collectParityFindings({
      ...base(root, upstream),
      drift: [{ path: 'AGENTS.md', reason: 'AI memory adapted per project' }],
      doctrineDebt: 'informational: 1 doctrine section(s) unresolved for 4 run(s)',
    });
    const rows = findings.filter(f => f.path === 'AGENTS.md');
    expect(rows).toHaveLength(1);
    expect(rows[0].evidence).toContain('unresolved for 4 run(s)');
    // The ordinary drift evidence is still there: the fold appends, never replaces.
    expect(rows[0].evidence).toContain('AI memory adapted per project');
  });

  test('no debt means no row', () => {
    const root = temporaryRoot();
    expect(collectParityFindings({ ...base(root, temporaryRoot()), doctrineDebt: null }).find(f => f.path === 'AGENTS.md')).toBeUndefined();
  });
});

describe('a missing config block a shipped skill reads blocks the run', () => {
  // E2: a top-level block upstream added is otherwise `structural` —
  // informational, never blocking — which is right for project identity and
  // wrong when a skill in the same release reads the block: it then fails at
  // runtime, mid-session, instead of here where there is an operator.
  const READERS = {
    '.agents/project.yaml': {
      git_strategy: { skill: '/git-flow-master', requiredBy: 'the protected-branch list and the push policy' },
    },
  };

  function findings(projectYaml: string, upstreamYaml: string, readers = READERS): ParityFinding[] {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.agents/project.yaml', projectYaml);
    write(upstream, '.agents/project.yaml', upstreamYaml);
    return collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [{ path: '.agents/project.yaml', reason: 'per-project identity', structural: true }],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
      configBlockReaders: readers,
    });
  }

  test('the block is missing: the row blocks and names the skill that reads it', () => {
    const row = findings(
      'project:\n  name: consumer\n',
      'project:\n  name: upstream\ngit_strategy:\n  strategy: solo-main\n',
    ).find(f => f.path === '.agents/project.yaml');
    expect(row!.blocking).toBe(true);
    expect(row!.suggested).toBe('merge');
    expect(row!.evidence).toContain('BLOCKING');
    expect(row!.evidence).toContain('/git-flow-master');
    // The values stay the project's: the row asks for the block, not the config.
    expect(row!.evidence).toContain('adapt its VALUES to this project');
  });

  test('a block the project HAS stays informational however much its values differ', () => {
    const rows = findings(
      'project:\n  name: consumer\ngit_strategy:\n  strategy: sdet\n  protected: [main, staging]\n',
      'project:\n  name: upstream\ngit_strategy:\n  strategy: solo-main\n  protected: [main]\n',
    ).filter(f => f.path === '.agents/project.yaml');
    // Values are project identity: the structural comparison finds no added key,
    // so nothing escalates. (An unrelated `git` surface row about
    // `strategy_source` can still be there; it is not this rule's doing.)
    expect(rows.every(f => !f.blocking)).toBe(true);
    expect(rows.some(f => f.evidence.includes('BLOCKING'))).toBe(false);
  });

  test('an undeclared block upstream added is informational, exactly as before', () => {
    const row = findings(
      'project:\n  name: consumer\n',
      'project:\n  name: upstream\nsome_new_block:\n  a: 1\n',
    ).find(f => f.path === '.agents/project.yaml');
    expect(row!.blocking).toBe(false);
    expect(row!.evidence).toContain('informational');
    expect(row!.evidence).not.toContain('BLOCKING');
  });

  test('missingConfigBlocks is top-level only and declaration-driven', () => {
    const project = 'git_strategy:\n  strategy: solo-main\n';
    const upstream = 'git_strategy:\n  strategy: solo-main\n  policy:\n    direct_push_to_protected: allowed\n';
    // `policy` is a CHILD of a block the project has: a value-shaped difference,
    // not the absent-block failure this escalates.
    expect(missingConfigBlocks('.agents/project.yaml', project, upstream, READERS)).toEqual([]);
    // A file with no declaration never escalates, whatever it is missing.
    expect(missingConfigBlocks('.mcp.json', '{}', '{"git_strategy":{}}', READERS)).toEqual([]);
    // A side that is not a key/value map at all: no guessing. (YAML that merely
    // fails the parser falls back to a key line-scan by design, so the honest
    // no-structure case is a document that parses to something else.)
    expect(missingConfigBlocks('.agents/project.yaml', '- a\n- b\n', 'git_strategy:\n  a: 1\n', READERS)).toEqual([]);
  });

  test('the shipped declaration names real blocks and real skills', () => {
    const declared = CONFIG_BLOCK_READERS['.agents/project.yaml'];
    expect(Object.keys(declared)).toContain('git_strategy');
    expect(Object.keys(declared)).toContain('orchestration');
    for (const reader of Object.values(declared)) {
      expect(reader.skill.startsWith('/')).toBe(true);
      expect(reader.requiredBy.length).toBeGreaterThan(20);
    }
  });
});

describe('the allow-list merge is reported, never silent', () => {
  test('an informational Componentes row names every permission the merge added', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    const findings = collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
      allowListAdded: ['Skill(pr-review-lead)', 'Skill(session-handoff)'],
    });
    const row = findings.find(f => f.path === '.claude/settings.json');
    expect(row!.surface).toBe('components');
    expect(row!.blocking).toBe(false);
    expect(row!.evidence).toContain('2 permission(s) added');
    expect(row!.evidence).toContain('Skill(pr-review-lead)');
    // The row has to say what was NOT touched, or it reads like a file rewrite.
    expect(row!.evidence).toContain('deny/ask/hooks/env untouched');
  });

  test('a run that added nothing raises no row at all', () => {
    const root = temporaryRoot();
    const findings = collectParityFindings({
      root,
      upstreamDir: temporaryRoot(),
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
      allowListAdded: [],
    });
    expect(findings.find(f => f.path === '.claude/settings.json')).toBeUndefined();
  });
});

describe('the husky hooks carry the gates split downstream', () => {
  // Both hooks are bootstrap-only, so a gate added upstream never reached a
  // project scaffolded earlier. The gates upstream owns now live in the SYNCED
  // `.husky/framework-gates.sh`; a hook that does not source it still sees
  // nothing, and only this row can say so.

  test('the note fires only for a hook that does not source the gates file', () => {
    const pending = frameworkGatesNote('bunx lint-staged --no-stash\nbun run types:check\n', '.husky/pre-commit');
    expect(pending).toContain('framework_gates_pre_commit');
    expect(pending).toContain('if [ -f "$GATES" ]; then');
    // The pre-push hook is nudged towards its OWN function, not pre-commit's.
    expect(frameworkGatesNote('bun run lint:check\n', '.husky/pre-push')).toContain('framework_gates_pre_push');
    // Already adopted: silence.
    expect(frameworkGatesNote('. "$(dirname -- "$0")/framework-gates.sh"\nframework_gates_pre_push\n', '.husky/pre-push')).toBeNull();
    // A mention in a comment is not an adoption.
    expect(frameworkGatesNote('# see framework-gates.sh\nbun run types:check\n', '.husky/pre-commit')).toContain('Adopt the gates split');
  });

  test('both hooks get the row, and pre-commit can carry both nudges at once', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    // A pre-split project: every gate inlined, lint-staged without the flag.
    write(root, '.husky/pre-commit', 'bunx lint-staged\nbun run types:check\n');
    write(root, '.husky/pre-push', 'bun run format:check && bun run lint:check\n');
    write(upstream, '.husky/pre-commit', 'bunx lint-staged --no-stash\n. "$(dirname -- "$0")/framework-gates.sh"\nframework_gates_pre_commit\n');
    write(upstream, '.husky/pre-push', '. "$(dirname -- "$0")/framework-gates.sh"\nframework_gates_pre_push\n');

    const findings = collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [
        { path: '.husky/pre-commit', reason: 'project gates live here' },
        { path: '.husky/pre-push', reason: 'project gates live here' },
      ],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
    });

    const preCommit = findings.find(f => f.path === '.husky/pre-commit');
    expect(preCommit!.evidence).toContain('does not source .husky/framework-gates.sh');
    // Both nudges land on the same row rather than one hiding the other.
    expect(preCommit!.evidence).toContain('--no-stash');
    expect(preCommit!.note).toContain('+bunx lint-staged --no-stash');
    expect(preCommit!.note).toContain('framework_gates_pre_commit');

    const prePush = findings.find(f => f.path === '.husky/pre-push');
    expect(prePush!.evidence).toContain('does not source .husky/framework-gates.sh');
    expect(prePush!.note).toContain('framework_gates_pre_push');
    // Adoption is a merge the operator reviews, never a silent overwrite.
    expect(prePush!.blocking).toBe(false);
  });
});

describe('renderParityReport', () => {
  test('table has every surface with ok / warn / blocked, prompt carries the WAIT contract, file body carries the diffs', () => {
    const { input } = fixture();
    const findings = collectParityFindings(input);
    const report = renderParityReport(findings, META);

    expect(report.surfaces.map(r => r.surface)).toEqual(SURFACE_ORDER);
    const state = Object.fromEntries(report.surfaces.map(r => [r.surface, r.state]));
    expect(state).toEqual({
      instructions: 'warn',
      skills: 'warn',
      commands: 'blocked',
      hooks: 'blocked',
      mcp: 'blocked',
      env: 'warn',
      components: 'warn',
      package: 'ok',
      git: 'warn',
      gates: 'ok',
    });
    expect(report.surfaces.map(r => r.label)).toEqual(['Instrucciones y config', 'Skills', 'Comandos', 'Hooks', 'MCP', 'Env', 'Componentes', 'package.json', 'Git', 'Verificación']);
    expect(report.surfaces.find(r => r.surface === 'mcp')?.cell).toBe('1 hallazgo: .codex/config.toml');

    const prompt = report.prompt;
    expect(prompt.startsWith('Parity review after `bun run up` (upstream upex-galaxy/agentic-qa-boilerplate@abcdef1, project lock 1234567).')).toBe(true);
    expect(prompt).toContain('WAIT for a decision per row');
    expect(prompt).toContain('(keep project | take upstream | merge) BEFORE editing anything');
    expect(prompt).toContain('| # | Surface | File | Now | What differs (evidence) | Suggested |');
    expect(prompt).toContain('| 1 | Instructions | AGENTS.md | kept | port upstream additions only: "5.5 MULTI-HARNESS"');
    // A watched path is never overwritten; a row that is not a two-copy contest says so with `-`.
    expect(prompt).toContain('| 10 | Env | .env | - |');
    expect(prompt).toContain('`Now` is the copy on disk today');
    expect(prompt).toMatch(/\| MCP \| \.codex\/config\.toml \| kept \| missing: n8n \(declared in \.mcp\.json\); only here: acme \(not in \.mcp\.json\): declare them in \.mcp\.json and opencode\.jsonc, or remove them; port upstream additions only: "mcp_servers\.n8n"[^|]* \| merge \(BLOCKING\) \|/);
    expect(prompt).toContain('`take upstream` is suggested only where the project lacks the content entirely');
    expect(prompt.trimEnd().endsWith('Post-merge: bun run agents:compat && bun run agents:compat:check && bun run repo:check')).toBe(true);
    // Scannable: never the diff itself, never rule numbers.
    expect(prompt).not.toContain('@@');
    expect(prompt).not.toMatch(/Rule #\d/);

    const body = report.fileBody;
    expect(body).toContain('AUTO-GENERATED, SINGLE-USE');
    expect(body).toContain('### 1. AGENTS.md');
    expect(body).toContain('### 2. .claude/settings.json');
    expect(body).toContain('```diff');
    expect(body).toContain('+## 5.5 MULTI-HARNESS');
    expect(buildParityFileBody(findings, META)).toBe(body);
  });

  test('the raw-URL hint appears for a GitHub handle only, never for a local upstream path', () => {
    expect(buildParityPrompt([], META)).toContain('https://raw.githubusercontent.com/upex-galaxy/agentic-qa-boilerplate/main/<path>');
    expect(buildParityPrompt([], { ...META, templateRepo: '/tmp/upstream' })).not.toContain('raw.githubusercontent.com');
  });

  test('zero findings render an all-ok table and an empty prompt table', () => {
    const report = renderParityReport([], META);
    expect(report.surfaces.every(r => r.state === 'ok' && r.cell === 'sin diferencias')).toBe(true);
    expect(buildParityPrompt([], META)).not.toContain('| 1 |');
  });

  test('pipes and newlines inside evidence never break the markdown table', () => {
    const prompt = buildParityPrompt([{
      id: 1,
      surface: 'hooks',
      path: '.claude/settings.json',
      evidence: 'a | b\nc',
      suggested: 'merge',
      blocking: false,
    }], META);
    expect(prompt).toContain('| 1 | Hooks | .claude/settings.json | - | a \\| b c | merge |');
  });
});

describe('strictVerdict', () => {
  const blocking: ParityFinding = { id: 1, surface: 'mcp', path: '.codex/config.toml', evidence: 'missing: n8n', suggested: 'take upstream', blocking: true };
  const drift: ParityFinding = { id: 2, surface: 'instructions', path: 'AGENTS.md', evidence: 'changed 1: "x"', suggested: 'merge', blocking: false };

  test('default mode never fails, whatever the findings', () => {
    expect(strictVerdict(false, [blocking, drift])).toEqual({ exitCode: 0, reason: null });
  });

  test('--strict fails only on blocking findings; watched-file drift alone passes', () => {
    expect(strictVerdict(true, [drift])).toEqual({ exitCode: 0, reason: null });
    expect(strictVerdict(true, [])).toEqual({ exitCode: 0, reason: null });
    const verdict = strictVerdict(true, [blocking, drift]);
    expect(verdict.exitCode).toBe(1);
    expect(verdict.reason).toContain('1 hallazgo(s) bloqueante(s)');
    expect(verdict.reason).toContain('.codex/config.toml');
    expect(verdict.reason?.split('\n')).toHaveLength(1);
  });

  test('an aborted run exits 1 with `Abortado.` in every mode, and never reads as completed', () => {
    for (const mode of [{ dryRun: false, strict: false }, { dryRun: false, strict: true }, { dryRun: true, strict: false }]) {
      const verdict = runVerdict({ aborted: true, ...mode }, [blocking]);
      expect(verdict).toEqual({ exitCode: 1, reason: null, outro: ABORTED_OUTRO });
      expect(verdict.outro).toBe('Abortado.');
    }
  });

  test('a completed run keeps the strict semantics and names its mode in the outro', () => {
    expect(runVerdict({ aborted: false, dryRun: false, strict: false }, [blocking]))
      .toEqual({ exitCode: 0, reason: null, outro: 'Sincronizacion completada.' });
    expect(runVerdict({ aborted: false, dryRun: true, strict: false }, []))
      .toEqual({ exitCode: 0, reason: null, outro: 'Dry-run completado.' });
    const strict = runVerdict({ aborted: false, dryRun: false, strict: true }, [blocking, drift]);
    expect(strict.exitCode).toBe(1);
    expect(strict.reason).toContain('--strict');
    expect(strict.outro).toBe('Sincronizacion completada con contratos rotos (--strict).');
    expect(runVerdict({ aborted: false, dryRun: false, strict: true }, [drift]).exitCode).toBe(0);
  });
});

describe('never a destructive default for project-only content', () => {
  // Live finding (Bunkai): row 8 said `take upstream (BLOCKING)` for an
  // opencode.jsonc holding four working project servers; applied literally it
  // would have deleted them. `take upstream` is only for content the project
  // lacks entirely.
  function base(root: string, upstream: string): ParityInput {
    return { root, upstreamDir: upstream, drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [] };
  }

  test('an MCP host with project-only servers suggests merge and names the other two registries; missing-only still takes upstream', () => {
    const root = temporaryRoot();
    const findings = collectParityFindings({
      ...base(root, temporaryRoot()),
      compatErrors: [
        'MCP n8n missing from codex: declared in .mcp.json, absent from .codex/config.toml',
        'MCP dbhub present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
        'MCP postman present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
      ],
    });
    const codex = findings.find(f => f.path === '.codex/config.toml')!;
    expect(codex.suggested).toBe('take upstream');
    expect(codex.blocking).toBe(true);
    const opencode = findings.find(f => f.path === 'opencode.jsonc')!;
    expect(opencode.suggested).toBe('merge');
    expect(opencode.blocking).toBe(true);
    expect(opencode.evidence).toBe('only here: dbhub, postman (not in .mcp.json): declare them in .mcp.json and .codex/config.toml, or remove them');
  });

  test('a watched file folded into a compat row keeps take upstream only when the project has nothing of its own there', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    // Same keys, upstream added one: nothing project-only.
    write(root, '.codex/config.toml', '[mcp_servers.context7]\ncommand = "x"\n');
    write(upstream, '.codex/config.toml', '[mcp_servers.context7]\ncommand = "x"\n\n[mcp_servers.n8n]\ncommand = "z"\n');
    // Project-only key next to the upstream addition.
    write(root, 'opencode.jsonc', '{"mcp":{"context7":{},"dbhub":{}}}');
    write(upstream, 'opencode.jsonc', '{"mcp":{"context7":{},"n8n":{}}}');
    const findings = collectParityFindings({
      ...base(root, upstream),
      drift: [{ path: '.codex/config.toml', reason: 'r' }, { path: 'opencode.jsonc', reason: 'r' }],
      compatErrors: [
        'MCP n8n missing from codex: declared in .mcp.json, absent from .codex/config.toml',
        'MCP n8n missing from opencode: declared in .mcp.json, absent from opencode.jsonc',
      ],
    });
    expect(findings.find(f => f.path === '.codex/config.toml')?.suggested).toBe('take upstream');
    const opencode = findings.find(f => f.path === 'opencode.jsonc')!;
    expect(opencode.suggested).toBe('merge');
    expect(opencode.evidence).toContain('keep project-only key: "mcp.dbhub"');
    expect(opencode.blocking).toBe(true);
    // Any other compat contract still takes upstream's shape (no project content involved).
    expect(collectParityFindings({ ...base(root, upstream), compatErrors: ['claude hook command must be exactly: node x'] })[0].suggested).toBe('take upstream');
    expect(findings.every(f => f.suggested !== 'decide' || f.surface === 'git')).toBe(true);
  });
});

describe('rows the diff-based table could not see before', () => {
  function base(root: string, upstream: string): ParityInput {
    return { root, upstreamDir: upstream, drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [] };
  }

  test('an overwritten project edit: one row on skills or components, backup named, hunks vs applied, full diff in the file', () => {
    const root = temporaryRoot();
    write(root, '.agents/skills/acli/SKILL.md', 'upstream body\n');
    write(root, '.backups/update-1/.agents/skills/acli/SKILL.md', 'project body\n');
    write(root, 'scripts/x.ts', 'upstream\n');
    write(root, '.backups/update-1/scripts/x.ts', 'ours\n');
    write(root, 'docs/gone.md', 'upstream\n');
    const findings = collectParityFindings({
      ...base(root, temporaryRoot()),
      localEdits: [
        { path: '.agents/skills/acli/SKILL.md', component: 'agent-compatibility', backupPath: join(root, '.backups/update-1/.agents/skills/acli/SKILL.md') },
        { path: 'scripts/x.ts', component: 'scripts', backupPath: join(root, '.backups/update-1/scripts/x.ts') },
        { path: 'docs/gone.md', component: 'docs', backupPath: null },
      ],
    });
    const skill = findings.find(f => f.path === '.agents/skills/acli/SKILL.md')!;
    expect(skill.surface).toBe('skills');
    expect(skill.suggested).toBe('merge');
    expect(skill.blocking).toBe(false);
    expect(skill.evidence).toBe('project edit overwritten; backup: .backups/update-1/.agents/skills/acli/SKILL.md; 1 hunk (+1/-1) vs applied; add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge; after restoring, run bun run skills:registry');
    expect(skill.note).toBe(protectNote('.agents/skills/acli/SKILL.md'));
    expect(skill.diff).toContain('-project body');
    expect(skill.diff).toContain('+upstream body');
    expect(findings.find(f => f.path === 'scripts/x.ts')?.surface).toBe('components');
    expect(findings.find(f => f.path === 'docs/gone.md')?.evidence).toBe('project edit overwritten; backup: none; backup unavailable; add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge');
    const body = buildParityFileBody(findings, META);
    expect(body).toContain('### 1. .agents/skills/acli/SKILL.md');
    expect(body).toContain('-project body');
    // The saved file repeats the fix under every overwritten-edit row, as the YAML to paste.
    expect(body).toContain('    updater:\n      protected_paths:\n        - .agents/skills/acli/SKILL.md');
    expect(body).toContain('### 3. docs/gone.md');
    expect(body).toContain('        - docs/gone.md');
  });

  test('a structural drift entry: informational row for upstream additions only, no row for value differences', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.agents/project.yaml', 'project:\n  project_name: acme\ngit_strategy:\n  strategy: solo-main\n  meta:\n    strategy_source: chosen\n');
    write(upstream, '.agents/project.yaml', 'project:\n  project_name: null\ngit_strategy:\n  strategy: solo-main\n  meta:\n    strategy_source: inherited\n');
    write(root, '.agents/jira-required.yaml', 'required:\n  severity:\n    type: option\n');
    write(upstream, '.agents/jira-required.yaml', 'required:\n  severity:\n    type: option\n  priority:\n    type: option\n');
    const findings = collectParityFindings({
      ...base(root, upstream),
      drift: [{ path: '.agents/project.yaml', reason: 'identity', structural: true }, { path: '.agents/jira-required.yaml', reason: 'manifest', structural: true }],
    });
    // project.yaml differs only in values (and the git stamp is `chosen`): nothing at all.
    expect(findings.filter(f => f.path === '.agents/project.yaml')).toEqual([]);
    const jira = findings.find(f => f.path === '.agents/jira-required.yaml')!;
    expect(jira.surface).toBe('instructions');
    expect(jira.suggested).toBe('merge');
    expect(jira.blocking).toBe(false);
    expect(jira.evidence).toBe('informational: upstream added 1 key: "required.priority"; merge = add the new keys, values are project identity and never compared; manifest');
    expect(jira.diff).toContain('+  priority:');
  });

  test('a drifted file without key structure (a husky hook) reads its hunks; the row is never blocking', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    // Both copies already source the synced gates file, so the gates-split nudge
    // stays silent and the evidence is purely the hunk reading under test.
    write(root, '.husky/pre-push', '#!/bin/sh\n. "$(dirname -- "$0")/framework-gates.sh"\nbun run e2e\n');
    write(upstream, '.husky/pre-push', '#!/bin/sh\n. "$(dirname -- "$0")/framework-gates.sh"\n');
    const findings = collectParityFindings({ ...base(root, upstream), drift: [{ path: '.husky/pre-push', reason: 'project gates live here' }] });
    expect(findings).toHaveLength(1);
    expect(findings[0].surface).toBe('components');
    expect(findings[0].suggested).toBe('merge');
    expect(findings[0].blocking).toBe(false);
    expect(findings[0].evidence).toBe('content differs (no key structure): review the hunks in the saved file; 1 hunk (+0/-1); project gates live here');
    expect(findings[0].diff).toContain('-bun run e2e');
    // A project-declared path sits on Skills (under .agents/skills/) or Componentes, never on Instrucciones.
    write(root, '.agents/skills/acli/SKILL.md', '## A\n\n## Project note\n');
    write(upstream, '.agents/skills/acli/SKILL.md', '## A\n');
    write(root, 'scripts/x.ts', 'mine\n');
    write(upstream, 'scripts/x.ts', 'theirs\n');
    const declared = collectParityFindings({ ...base(root, upstream), drift: [
      { path: '.agents/skills/acli/SKILL.md', reason: 'declared', source: 'project' },
      { path: 'scripts/x.ts', reason: 'declared', source: 'project' },
    ] });
    expect(declared.map(f => [f.path, f.surface, f.suggested])).toEqual([
      ['.agents/skills/acli/SKILL.md', 'skills', 'keep project'],
      ['scripts/x.ts', 'components', 'merge'],
    ]);
    expect(declared[0].evidence).toBe('project-only heading: "Project note"; upstream adds nothing; 1 hunk (+0/-2); declared');
  });

  test('a package.json key kept at the project value: one row per key, both values in the file body only', () => {
    const root = temporaryRoot();
    const findings = collectParityFindings({
      ...base(root, temporaryRoot()),
      packageJsonKept: [
        { file: 'package.json', section: 'scripts', key: 'repo:check', localValue: 'bun run a', upstreamValue: 'bun run a && bun run b' },
        { file: 'package.json', section: 'devDependencies', key: 'eslint', localValue: '^9.0.0', upstreamValue: '^9.30.0' },
      ],
    });
    expect(findings.map(f => [f.surface, f.path, f.evidence, f.suggested, f.blocking])).toEqual([
      ['package', 'package.json', 'scripts.repo:check: project value kept; upstream differs', 'decide', false],
      ['package', 'package.json', 'devDependencies.eslint: project value kept; upstream differs', 'decide', false],
    ]);
    const report = renderParityReport(findings, META);
    expect(report.surfaces.find(r => r.surface === 'package')).toMatchObject({ state: 'warn', cell: '2 hallazgos: package.json' });
    expect(report.prompt).not.toContain('bun run a && bun run b');
    expect(report.fileBody).toContain('```text\nproject (kept):\n  bun run a\nupstream:\n  bun run a && bun run b\n```');
  });

  test('a failed gate: informational row with exit code, first errors and the applied files it names; a passing gate is no row', () => {
    const root = temporaryRoot();
    const output = 'cli/lib/updater-core.test.ts(84,19): error TS2352: Conversion of type X may be a mistake.\ncli/other.ts(1,1): error TS1000: nope\n';
    const findings = collectParityFindings({
      ...base(root, temporaryRoot()),
      gates: [
        { script: 'types:check', status: 'fail', exitCode: 2, seconds: 9.4, errorCount: 2, firstErrors: output.trim().split('\n'), failingApplied: ['cli/lib/updater-core.test.ts'], output },
        { script: 'lint:check', status: 'pass', exitCode: 0, seconds: 3, errorCount: 0, firstErrors: [], failingApplied: [], output: '' },
        { script: 'test', status: 'timeout', exitCode: null, seconds: 120, errorCount: 0, firstErrors: [], failingApplied: [], output: '' },
      ],
    });
    expect(findings.map(f => [f.surface, f.path, f.suggested, f.blocking])).toEqual([
      ['gates', 'types:check', 'decide', false],
      ['gates', 'test', 'decide', false],
    ]);
    expect(findings[0].evidence).toBe(`exit 2; 2 error(s); first: ${output.trim().split('\n').join(' | ')}; applied this run: cli/lib/updater-core.test.ts`);
    expect(findings[1].evidence).toBe('skipped: no verdict within 120 s');
    const report = renderParityReport(findings, META);
    expect(report.surfaces.find(r => r.surface === 'gates')).toMatchObject({ label: 'Verificación', state: 'warn' });
    expect(report.fileBody).toContain('### 1. types:check');
    expect(report.fileBody).toContain('```text\ncli/lib/updater-core.test.ts(84,19)');
    // Never blocking: --strict does not fail on a gate.
    expect(strictVerdict(true, findings).exitCode).toBe(0);
  });
});

describe('MCP registries are compared per server, args and env included', () => {
  // Live finding (Bunkai, 8.2 port): `.codex/config.toml` read "same keys and
  // values; formatting or comments differ" while a server's args differed,
  // because the two-level view stopped at the server object.
  const diff = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n';
  const row = (project: string, upstream: string, file: string): [string, string] => {
    const e = watchedFileEvidence(file, project, upstream, diff);
    return [e.suggested, e.evidence.replace(/; 1 hunk \(\+1\/-1\)$/, '')];
  };

  test('a nested server object is compared whole; the evidence names the server and the fields that differ', () => {
    const mine = configEntries('{"mcpServers":{"context7":{"command":"npx","args":["-y","@upstash/context7-mcp@1"],"env":{"CONTEXT7_API_KEY":"ref"}}}}', '.mcp.json')!;
    const theirs = configEntries('{"mcpServers":{"context7":{"command":"npx","args":["-y","@upstash/context7-mcp@2"],"env":{"CONTEXT7_API_KEY":"ref"}}}}', '.mcp.json')!;
    expect(configKeyDelta(mine, theirs)).toEqual({ added: [], projectOnly: [], changed: ['mcpServers.context7'], changedDetail: { 'mcpServers.context7': 'args differ' }, changedArrays: [], addedObjects: [] });

    expect(row(
      '{"mcpServers":{"context7":{"command":"npx","args":["a"]},"supabase":{"command":"npx","args":["s"],"env":{"SUPABASE_ACCESS_TOKEN":"ref"}}}}',
      '{"mcpServers":{"context7":{"command":"npx","args":["b"]},"supabase":{"command":"npx","args":["s"],"env":{"SUPABASE_ACCESS_TOKEN":"ref","SUPABASE_PROJECT_REF":"ref"}}}}',
      '.mcp.json',
    )).toEqual(['merge', 'same keys, context7: args differ; supabase: env keys differ (port what you want, keep the rest)']);
    // Same env keys, different values; several fields at once.
    expect(row(
      '{"mcp":{"tavily":{"type":"remote","url":"https://a","headers":{"Authorization":"Bearer {env:TAVILY_API_KEY}"}}}}',
      '{"mcp":{"tavily":{"type":"remote","url":"https://b","headers":{"Authorization":"Bearer {env:TAVILY_KEY}"}}}}',
      'opencode.jsonc',
    )[1]).toBe('same keys, tavily: url and headers differ (port what you want, keep the rest)');
    expect(row('[mcp_servers.n8n]\ncommand = "npx"\n[mcp_servers.n8n.env]\nA = "1"\n', '[mcp_servers.n8n]\ncommand = "npx"\n[mcp_servers.n8n.env]\nA = "2"\n', '.codex/config.toml')[1])
      .toBe('same keys, n8n: env values differ (port what you want, keep the rest)');
    // Truly identical registries still read as identical.
    expect(row('{"mcpServers":{"a":{"args":[1]}}}', '{ "mcpServers": { "a": { "args": [1] } } }', '.mcp.json')).toEqual(['keep project', 'same keys and values; formatting or comments differ']);
  });

  test('at most three servers are named, the rest counted; scalars keep their own phrase', () => {
    const servers = (v: string): string => `{"x":1,"mcpServers":{${['a', 'b', 'c', 'd', 'e'].map(s => `"${s}":{"args":["${v}"]}`).join(',')}}}`;
    expect(row(servers('1'), servers('2'), '.mcp.json')[1]).toBe('same keys, a: args differ; b: args differ; c: args differ; +2 more (port what you want, keep the rest)');
    expect(row('{"x":1,"mcpServers":{"a":{"args":["1"]}}}', '{"x":2,"mcpServers":{"a":{"args":["2"]}}}', '.mcp.json')[1])
      .toBe('same keys, values differ at: "x"; a: args differ (port what you want, keep the rest)');
  });
});

describe('a git-tracked .context/PBI/ cache is one row on Componentes', () => {
  test('the row carries the count and the recipe path; the path list stays in the file', () => {
    const root = temporaryRoot();
    const findings = collectParityFindings({
      root,
      upstreamDir: temporaryRoot(),
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, 'x'),
      heldBack: [],
      envNewKeys: [],
      pbiCache: { tracked: 370, recipePath: '.agents/prompts/pbi-cache-migration.md' },
    });
    expect(findings.map(f => [f.surface, f.path, f.suggested, f.blocking])).toEqual([['components', '.context/PBI/', 'decide', false]]);
    // The ignore clause is the row's whole value: the ladder was already at full
    // parity with upstream while 370 paths stayed tracked, so "fix .gitignore" is
    // a detour the row must close off.
    expect(findings[0].evidence).toBe('370 tracked path(s) still in git (Jira cache, gitignored by design); an ignore rule does not untrack what is already in the index; run the recipe; migration recipe saved to .agents/prompts/pbi-cache-migration.md');
    expect(renderParityReport(findings, META).surfaces.find(s => s.surface === 'components')?.cell).toBe('1 hallazgo: .context/PBI/');
    // Nothing tracked: no row.
    expect(collectParityFindings({ root, upstreamDir: temporaryRoot(), drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [], pbiCache: null })).toEqual([]);
  });
});

describe('a kept file whose hunk gates another file of the same release', () => {
  // Live finding (Bunkai): upstream shipped a skill declaring the new category
  // `orchestration` AND the one-line `scripts/lint-skills.ts` hunk that admits
  // it. The script was in `updater.protected_paths`, so only the skill landed
  // and `bun run skills:check` failed on a freshly synced repo. The row's whole
  // evidence was `2 hunks (+1/-5)`, so `keep project` was chosen off it.
  function base(root: string, upstream: string): ParityInput {
    return { root, upstreamDir: upstream, drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [] };
  }

  test('the row names the prerequisite and its gate, blocks, and fails --strict', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, 'scripts/lint-skills.ts', 'const KNOWN_CATEGORIES = [\'testing\'];\n');
    write(upstream, 'scripts/lint-skills.ts', 'const KNOWN_CATEGORIES = [\'testing\', \'orchestration\'];\n');
    const findings = collectParityFindings({
      ...base(root, upstream),
      drift: [{ path: 'scripts/lint-skills.ts', reason: 'declared', source: 'project' }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].blocking).toBe(true);
    expect(findings[0].suggested).toBe('merge');
    expect(findings[0].side).toBe('kept');
    expect(findings[0].evidence).toContain('PREREQUISITE for this release');
    expect(findings[0].evidence).toContain('`bun run skills:check`');
    expect(strictVerdict(true, findings).exitCode).toBe(1);
    // The prompt's BLOCKING legend covers both kinds now.
    expect(buildParityPrompt(findings, META)).toContain('carry a hunk another file of this release depends on');
    // And the terminal table shows the surface as blocked, not merely warned.
    expect(renderParityReport(findings, META).surfaces.find(s => s.surface === 'components')?.state).toBe('blocked');
  });

  test('a watched path with no declaration keeps its non-blocking row; the manifest is injectable', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, 'allurerc.mjs', 'export default { name: \'acme\' };\n');
    write(upstream, 'allurerc.mjs', 'export default { name: \'boilerplate\' };\n');
    const drift = [{ path: 'allurerc.mjs', reason: 'report name adapted per project' }];
    const plain = collectParityFindings({ ...base(root, upstream), drift });
    expect(plain[0].blocking).toBe(false);
    expect(plain[0].side).toBe('kept');
    expect(plain[0].evidence).not.toContain('PREREQUISITE');

    const declared = collectParityFindings({
      ...base(root, upstream),
      drift,
      prerequisites: { 'allurerc.mjs': { requiredBy: 'the categories dashboard the synced reporter writes', gate: 'bun run report:check' } },
    });
    expect(declared[0].blocking).toBe(true);
    expect(declared[0].evidence).toContain('the categories dashboard the synced reporter writes');
    expect(declared[0].evidence).toContain('`bun run report:check`');
  });

  test('the shipped manifest declares the category vocabulary at least', () => {
    expect(prerequisiteFor('scripts/lint-skills.ts')).not.toBeNull();
    expect(prerequisiteFor('scripts/lint-skills.ts')?.gate).toBe('bun run skills:check');
    expect(prerequisiteFor('scripts\\lint-skills.ts')).toBe(PATH_PREREQUISITES['scripts/lint-skills.ts']);
    expect(prerequisiteFor('README.md')).toBeNull();
  });
});

describe('evidence a reader can act on without opening the diff', () => {
  function base(root: string, upstream: string): ParityInput {
    return { root, upstreamDir: upstream, drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [] };
  }

  test('an array key reports the elements added and removed, never "values differ"', () => {
    // Live finding (Bunkai): row 7 read "same keys, values differ at
    // permissions.allow" while upstream had simply APPENDED two permissions.
    const evidence = describeWatchedFile(
      '.claude/settings.json',
      JSON.stringify({ permissions: { allow: ['Bash(bun *)', 'Bash(git *)'] } }),
      JSON.stringify({ permissions: { allow: ['Bash(bun *)', 'Bash(orca *)', 'Skill(orca-orchestration)'] } }),
      '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n',
    );
    expect(evidence).toContain('"permissions.allow": added: ["Bash(orca *)", "Skill(orca-orchestration)"], removed: ["Bash(git *)"]');
    expect(evidence).not.toContain('values differ at');
  });

  test('a truncated additions list still names every new top-level object', () => {
    // Live finding (Bunkai): one of the "+3 more" on a CI workflow row was a
    // 99-line `jobs.XrayImport`, so a 180-line change read as six lines.
    const project = 'name: regression\non:\n  push: {}\njobs:\n  Smoke:\n    runs-on: ubuntu-latest\n';
    const upstream = 'name: regression\non:\n  push: {}\nconcurrency:\n  group: ci\n  cancel-in-progress: true\nenv:\n  TZ: UTC\njobs:\n  Smoke:\n    runs-on: ubuntu-latest\n  XrayImport:\n    runs-on: ubuntu-latest\n';
    const evidence = describeWatchedFile('.github/workflows/regression.yml', project, upstream, '--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y\n');
    expect(evidence).toBe('upstream added 6 keys: "concurrency", "env", "jobs.XrayImport" (new objects), "concurrency.group", "concurrency.cancel-in-progress", "env.TZ"; nothing project-only; 1 hunk (+1/-1)');
    // With more scalars than the list shows, the containers still survive the truncation.
    const many = 'name: regression\non:\n  push: {}\nconcurrency:\n  group: ci\n  cancel-in-progress: true\n  a: 1\n  b: 2\njobs:\n  Smoke:\n    runs-on: ubuntu-latest\n  XrayImport:\n    runs-on: ubuntu-latest\n';
    const truncated = describeWatchedFile('.github/workflows/regression.yml', project, many, '');
    expect(truncated).toContain('"concurrency", "jobs.XrayImport" (new objects)');
    expect(truncated).toContain('+1 more');
    // Three additions or fewer are all named anyway: no marker, no noise.
    expect(describeWatchedFile('.mcp.json', '{"mcpServers":{"a":{}}}', '{"mcpServers":{"a":{},"b":{}}}', '')).toContain('upstream added 1 key: "mcpServers.b";');
  });

  test('each row says which copy is on disk: kept, overwritten, or neither', () => {
    const root = temporaryRoot();
    write(root, 'scripts/x.ts', 'upstream\n');
    write(root, '.backups/update-1/scripts/x.ts', 'ours\n');
    const findings = collectParityFindings({
      ...base(root, temporaryRoot()),
      localEdits: [{ path: 'scripts/x.ts', component: 'scripts', backupPath: join(root, '.backups/update-1/scripts/x.ts') }],
      packageJsonKept: [{ file: 'package.json', section: 'scripts', key: 'repo:check', localValue: 'a', upstreamValue: 'a && b' }],
      envNewKeys: ['ORCA_HOME'],
    });
    expect(findings.map(f => [f.path, f.side])).toEqual([
      ['.env', undefined],
      ['scripts/x.ts', 'overwritten'],
      ['package.json', 'kept'],
    ]);
  });
});

describe('the dry-run table marks what the apply step resolves by itself', () => {
  // Live finding (Bunkai): --dry-run reported 22 rows / 12 blocking, the real
  // run 16 / 6, because applying the files rebuilt the generated surfaces. A
  // reader planning from the dry-run over-estimated the manual work by 40%.
  const compat: ParityFinding = { id: 1, surface: 'skills', path: '.claude/skills', evidence: 'skills alias missing', suggested: 'run agents:compat', blocking: true };
  const drift: ParityFinding = { id: 2, surface: 'instructions', path: 'AGENTS.md', evidence: 'body differs in 1: "1. RULES"', suggested: 'merge', blocking: false, side: 'kept' };

  test('the marked rows are the ones the run rebuilds or re-delivers, and only those', () => {
    expect(resolvedByApply(compat)).toBe(true);
    expect(resolvedByApply(drift)).toBe(false);
    // The six rows the live run resolved by itself: a contract against the old
    // hook emitter, whose file the apply delivers. Its own path could not be
    // extracted from the message, so the evidence is what identifies it.
    expect(resolvedByApply({
      path: '(compat)',
      evidence: 'claude hook command must be exactly: node "$CLAUDE_PROJECT_DIR/.agents/hooks/personality-reinject.mjs"',
      suggested: 'take upstream',
      blocking: true,
    })).toBe(true);
    // A project-owned registry is never re-delivered: the contract needs a human.
    expect(resolvedByApply({ path: '.codex/config.toml', evidence: 'missing: n8n', suggested: 'take upstream', blocking: true })).toBe(false);
    expect(resolvedByApply({ path: '.claude/settings.json', evidence: 'stale hook command', suggested: 'take upstream', blocking: true })).toBe(false);
    // A stray wrapper is a decision (declare it in the overlay, or delete it).
    expect(resolvedByApply({ path: '.claude/commands/rogue.md', evidence: 'wrapper not produced by .agents/compatibility/command-aliases.json', suggested: 'add to overlay', blocking: true })).toBe(false);
  });

  test('the mark and its legend appear on a dry-run only', () => {
    const dry = buildParityPrompt([compat, drift], { ...META, dryRun: true });
    expect(dry).toContain('Parity review after `bun run up --dry-run`');
    expect(dry).toContain(`skills alias missing ${RESOLVED_BY_APPLY_MARK}`);
    expect(dry).toContain('this table lists MORE work than the run that applies');
    expect(dry).not.toContain(`"1. RULES" ${RESOLVED_BY_APPLY_MARK}`);

    const real = buildParityPrompt([compat, drift], META);
    expect(real).not.toContain(RESOLVED_BY_APPLY_MARK);
    expect(real).toContain('Parity review after `bun run up` (upstream');
  });
});
