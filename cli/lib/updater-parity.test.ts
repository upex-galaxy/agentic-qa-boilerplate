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
  configEntries,
  configKeyDelta,
  configKeys,
  describeWatchedFile,
  diffNoIndex,
  diffStats,
  markdownSectionDelta,
  persistArchivedSkillMarkers,
  protectNote,
  readGitStrategyStamp,
  renderParityReport,
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
    expect(configKeyDelta(['a', 'b.x'], ['a', 'b.y'])).toEqual({ added: ['b.y'], projectOnly: ['b.x'], changed: [], changedDetail: {} });
    // With values (Maps) the shared keys whose values differ are named; a top
    // key with object children is judged through its children only.
    const mine = configEntries('{"a":1,"b":{"x":1,"y":[1]},"c":{"z":1}}', 'x.json')!;
    const theirs = configEntries('{"a":2,"b":{"x":1,"y":[2]},"c":{"z":1}}', 'x.json')!;
    expect(configKeyDelta(mine, theirs)).toEqual({ added: [], projectOnly: [], changed: ['a', 'b.y'], changedDetail: {} });
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
    expect(agents.evidence).toMatch(/\d+ hunks? \(\+\d+\/-\d+\)$/);
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
    expect(codex.evidence).toMatch(/^missing: n8n \(declared in \.mcp\.json\); only here: acme \(not in \.mcp\.json\): declare them in \.mcp\.json and opencode\.jsonc, or remove them; port upstream additions only: "mcp_servers\.n8n"; keep project-only key: "mcp_servers\.acme"; \d+ hunks? \(\+\d+\/-\d+\)$/);
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
    expect(prompt).toContain('| # | Surface | File | What differs (evidence) | Suggested |');
    expect(prompt).toContain('| 1 | Instructions | AGENTS.md | port upstream additions only: "5.5 MULTI-HARNESS"');
    expect(prompt).toMatch(/\| MCP \| \.codex\/config\.toml \| missing: n8n \(declared in \.mcp\.json\); only here: acme \(not in \.mcp\.json\): declare them in \.mcp\.json and opencode\.jsonc, or remove them; port upstream additions only: "mcp_servers\.n8n"[^|]* \| merge \(BLOCKING\) \|/);
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
    expect(prompt).toContain('| 1 | Hooks | .claude/settings.json | a \\| b c | merge |');
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
    expect(jira.evidence).toBe('informational: upstream added 1 key: "required.priority"; merge = add the new keys, values are project identity and never compared');
    expect(jira.diff).toContain('+  priority:');
  });

  test('a drifted file without key structure (a husky hook) reads its hunks; the row is never blocking', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.husky/pre-push', '#!/bin/sh\nbun run repo:check\nbun run e2e\n');
    write(upstream, '.husky/pre-push', '#!/bin/sh\nbun run repo:check\n');
    const findings = collectParityFindings({ ...base(root, upstream), drift: [{ path: '.husky/pre-push', reason: 'project gates live here' }] });
    expect(findings).toHaveLength(1);
    expect(findings[0].surface).toBe('components');
    expect(findings[0].suggested).toBe('merge');
    expect(findings[0].blocking).toBe(false);
    expect(findings[0].evidence).toBe('content differs (no key structure): review the hunks in the saved file; 1 hunk (+0/-1)');
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
    expect(declared[0].evidence).toBe('project-only heading: "Project note"; upstream adds nothing; 1 hunk (+0/-2)');
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
    expect(configKeyDelta(mine, theirs)).toEqual({ added: [], projectOnly: [], changed: ['mcpServers.context7'], changedDetail: { 'mcpServers.context7': 'args differ' } });

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
    expect(findings[0].evidence).toBe('370 tracked path(s) still in git (Jira cache, gitignored by design); migration recipe saved to .agents/prompts/pbi-cache-migration.md');
    expect(renderParityReport(findings, META).surfaces.find(s => s.surface === 'components')?.cell).toBe('1 hallazgo: .context/PBI/');
    // Nothing tracked: no row.
    expect(collectParityFindings({ root, upstreamDir: temporaryRoot(), drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [], pbiCache: null })).toEqual([]);
  });
});
