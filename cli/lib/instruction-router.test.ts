import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';

import {
  bindingRoutes,
  classifyPrompt,
  fileRouteState,
  IMPORT_ROW_TRIGGERS,
  loadInstructionRouter,
  MAX_ROUTED_SECTIONS,
  neutralizePaths,
  parseSectionFrontmatter,
  pendingRouteReminder,
  rearmRoutes,
  renderHookOutput,
  ROUTE_OPTIONAL_PREFIX,
  ROUTE_PENDING_PREFIX,
  ROUTE_PREFIX,
  routeLines,
  routeStatePath,
} from '../../.agents/hooks/personality-reinject.mjs';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const NODE_BINARY = Bun.which('node') ?? 'node';
const HOOK_EMITTER = join(REPO_ROOT, '.agents/hooks/personality-reinject.mjs');
const EVAL = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'instruction-router-eval.json'), 'utf8')) as {
  targets: { recall: number, precision: number }
  prompts: Array<{ prompt: string, expect: string[] }>
};
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function temporaryRoot(prefix = 'instruction router '): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** A two-section checkout with its own router, so a test owns every trigger it relies on. */
function routerFixture(): string {
  const root = temporaryRoot();
  write(root, 'AGENTS.md', [
    '# L0',
    '<!-- router:start -->',
    '| When the request involves | Read | Was | Then |',
    '|---|---|---|---|',
    '| git work | `agent-git.md` | §11 | - |',
    '| variables | whenever any of these apply, read @.agents/project.yaml and `40-vars.md` | §7 | - |',
    '| tracker | `60-pbi.md`, `40-vars.md` | §9, §7 | - |',
    '| scripts | whenever any of these apply, read @package.json first | Rule #11 | - |',
    '<!-- router:end -->',
    '',
  ].join('\n'));
  write(root, '.agents/instructions/agent-git.md', '---\nid: git\ntitle: "Git"\nload_when: "git"\ntriggers: ["\\\\bcommit", "\\\\bpush"]\npaths: [".husky/"]\n---\n\n# Git\n');
  write(root, '.agents/instructions/40-vars.md', '---\nid: vars\ntitle: Vars\nload_when: vars\ntriggers:\n  - "\\\\benvironments?\\\\b"\n  - \'project\\.yaml\'\npaths: []\n---\n');
  write(root, '.agents/instructions/60-pbi.md', '---\nid: pbi\ntitle: PBI\nload_when: pbi\ntriggers: ["\\\\bjira\\\\b"]\npaths: [".context/PBI/"]\n---\n');
  write(root, '.agents/project.yaml', 'project: {}\n');
  write(root, 'package.json', '{}\n');
  return root;
}

const memoryState = () => {
  let record: Record<string, unknown> = {};
  return { read: () => record, write: (next: Record<string, unknown>) => { record = next; }, clear: () => { record = {}; } };
};

/** The binding line the hook prints for one routed file of `routerFixture()`. */
const SIZES: Record<string, string> = {
  '.agents/instructions/agent-git.md': ' (git, 9 lines)',
  '.agents/instructions/40-vars.md': ' (vars, 9 lines)',
  '.agents/project.yaml': ' (1 lines)',
  'package.json': ' (1 lines)',
};
const route = (path: string) => `${ROUTE_PREFIX} ${path}${SIZES[path] ?? ''} before acting on this prompt`;

describe('router source: AGENTS.md and the section frontmatter, read at runtime', () => {
  test('the dependency-free frontmatter parser agrees with yaml on every real section', () => {
    const dir = join(REPO_ROOT, '.agents/instructions');
    for (const file of readdirSync(dir).filter(name => name.endsWith('.md'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      const block = /^---\n([\s\S]*?)\n---\n/.exec(text);
      const ours = parseSectionFrontmatter(text) as Record<string, unknown> | null;
      if (!block) {
        expect(ours).toBeNull();
        continue;
      }
      const reference = parseYaml(block[1]) as Record<string, unknown>;
      for (const key of ['id', 'triggers', 'paths']) {
        expect([file, key, ours?.[key]]).toEqual([file, key, reference[key]]);
      }
    }
  });

  test('block lists, single quotes and quoted commas parse like yaml', () => {
    const text = '---\nid: x\ntriggers:\n  - "a, b"\n  - \'it\'\'s\'\npaths: [\'c/\', "d, e/", f/]\n---\n';
    const reference = parseYaml(text.split('---\n')[1]) as Record<string, unknown>;
    const ours = parseSectionFrontmatter(text) as Record<string, unknown>;
    expect(ours.triggers).toEqual(reference.triggers);
    expect(ours.paths).toEqual(reference.paths);
  });

  test('every routed section of the real repo brings an id and compiled triggers', () => {
    const router = loadInstructionRouter(REPO_ROOT)!;
    for (const target of router.targets.values()) {
      if (!target.path.startsWith('.agents/instructions/')) { continue; }
      expect(target.id.length).toBeGreaterThan(0);
      if (!target.path.endsWith('/agent-project.md')) { expect(target.triggers.length).toBeGreaterThan(0); }
    }
  });

  test('a router edit changes the routing with no code change: one source of truth', () => {
    const root = routerFixture();
    expect(classifyPrompt(loadInstructionRouter(root), 'commit this')).toEqual(['.agents/instructions/agent-git.md']);
    write(root, '.agents/instructions/agent-git.md', '---\nid: git\ntitle: Git\nload_when: git\ntriggers: ["\\\\bmerge"]\npaths: []\n---\n');
    expect(classifyPrompt(loadInstructionRouter(root), 'commit this')).toEqual([]);
    expect(classifyPrompt(loadInstructionRouter(root), 'merge this')).toEqual(['.agents/instructions/agent-git.md']);
  });

  test('no AGENTS.md or no markers: nothing is routed, nothing throws', () => {
    const root = temporaryRoot();
    expect(loadInstructionRouter(root)).toBeNull();
    write(root, 'AGENTS.md', '# single-file layout\n');
    expect(loadInstructionRouter(root)).toBeNull();
    expect(routeLines({ repoRoot: root, prompt: 'commit and push', routeState: null })).toEqual([]);
  });

  test('agent-project.md routes by its own triggers: a project skill row there survives bun run up with no code change', () => {
    const root = routerFixture();
    const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    write(root, 'AGENTS.md', agents.replace('<!-- router:end -->', '| anything specific to this project | `agent-project.md` | - | project context skills |\n<!-- router:end -->'));
    write(root, '.agents/instructions/agent-project.md', '---\nid: project\ntitle: Project\nload_when: project\ntriggers: []\npaths: []\n---\n\n## Project context skills\n');
    expect(classifyPrompt(loadInstructionRouter(root), 'how is a billing invoice voided?')).toEqual([]);
    write(root, '.agents/instructions/agent-project.md', '---\nid: project\ntitle: Project\nload_when: project\ntriggers: [\'\\binvoices?\\b\']\npaths: []\n---\n\n## Project context skills\n\n| Skill | Trigger | Purpose |\n|---|---|---|\n| `billing-context` | invoice | Billing rules. |\n');
    expect(classifyPrompt(loadInstructionRouter(root), 'how is a billing invoice voided?')).toEqual(['.agents/instructions/agent-project.md']);
  });

  test('an invalid trigger is skipped, the rest of the section still routes', () => {
    const root = routerFixture();
    write(root, '.agents/instructions/agent-git.md', '---\nid: git\ntitle: Git\nload_when: git\ntriggers: ["(unclosed", "\\\\bpush"]\npaths: []\n---\n');
    expect(classifyPrompt(loadInstructionRouter(root), 'push it')).toEqual(['.agents/instructions/agent-git.md']);
  });
});

describe('classification', () => {
  test('a row fires on its anchor only: a file shared by two rows does not drag the other row in', () => {
    const router = loadInstructionRouter(routerFixture());
    expect(classifyPrompt(router, 'which environment is active?')).toEqual(['.agents/instructions/40-vars.md', '.agents/project.yaml']);
    expect(classifyPrompt(router, 'sync the jira issue')).toEqual(['.agents/instructions/60-pbi.md', '.agents/instructions/40-vars.md']);
  });

  test('an import that anchors its row alone uses the generic import triggers', () => {
    const router = loadInstructionRouter(routerFixture());
    expect(Object.keys(IMPORT_ROW_TRIGGERS)).toEqual(['package.json']);
    expect(classifyPrompt(router, 'how do I run the tests?')).toEqual(['package.json']);
    expect(classifyPrompt(router, '¿cómo levanto el server?')).toEqual(['package.json']);
  });

  test('a run/corré request reaches the scripts row through one qualifier word and the Spanish regression form', () => {
    const router = loadInstructionRouter(routerFixture());
    expect(classifyPrompt(router, 'run the regression suite and give me a GO/NO-GO')).toContain('package.json');
    expect(classifyPrompt(router, 'dispatch a subagent to run the verification gates')).toContain('package.json');
    expect(classifyPrompt(router, 'corré la regresión de smoke en staging')).toContain('package.json');
    expect(classifyPrompt(router, 'run a quick review of the story')).not.toContain('package.json');
  });

  test('paths: a named path fires its section, the longest prefix wins, a path tail does not', () => {
    const root = routerFixture();
    write(root, '.agents/instructions/agent-git.md', '---\nid: git\ntitle: Git\nload_when: git\ntriggers: ["\\\\bnever-matches-anything\\\\b"]\npaths: [".context/", ".husky/"]\n---\n');
    const router = loadInstructionRouter(root);
    expect(classifyPrompt(router, 'edit .husky/pre-commit')).toEqual(['.agents/instructions/agent-git.md']);
    expect(classifyPrompt(router, 'open ./.husky/pre-push')).toEqual(['.agents/instructions/agent-git.md']);
    expect(classifyPrompt(router, 'read .context/PBI/X-1/story.md')).toEqual(['.agents/instructions/60-pbi.md', '.agents/instructions/40-vars.md']);
    expect(classifyPrompt(router, 'read .context/ADR/0001.md')).toEqual(['.agents/instructions/agent-git.md']);
    expect(classifyPrompt(router, 'see vendor/.husky/x')).toEqual([]);
  });

  test('an empty or blank prompt routes nothing', () => {
    const router = loadInstructionRouter(routerFixture());
    expect(classifyPrompt(router, '')).toEqual([]);
    expect(classifyPrompt(router, '   ')).toEqual([]);
  });
});

describe('ROUTE: lines and the per-session state', () => {
  test('one line per newly routed file: section with its id, import bare', () => {
    const root = routerFixture();
    expect(routeLines({ repoRoot: root, prompt: 'change project.yaml', routeState: memoryState() })).toEqual([
      route('.agents/instructions/40-vars.md'),
      route('.agents/project.yaml'),
    ]);
  });

  test('a file already routed in the session costs 0 bytes; a new one still routes', () => {
    const root = routerFixture();
    const state = memoryState();
    expect(routeLines({ repoRoot: root, prompt: 'commit this', routeState: state })).toHaveLength(1);
    expect(routeLines({ repoRoot: root, prompt: 'and push it', routeState: state })).toEqual([]);
    expect(routeLines({ repoRoot: root, prompt: 'push, then run the tests', routeState: state })).toEqual([route('package.json')]);
  });

  test('the file-backed state is keyed by checkout and session, and re-arms', () => {
    const root = routerFixture();
    const temp = temporaryRoot('route state ');
    const one = fileRouteState(root, 'session-1', temp)!;
    const two = fileRouteState(root, 'session-2', temp)!;
    expect(routeStatePath(root, 'session-1', temp)).not.toBe(routeStatePath(root, 'session-2', temp));
    expect(routeLines({ repoRoot: root, prompt: 'commit', routeState: one })).toHaveLength(1);
    expect(routeLines({ repoRoot: root, prompt: 'commit', routeState: one })).toEqual([]);
    expect(routeLines({ repoRoot: root, prompt: 'commit', routeState: two })).toHaveLength(1);
    rearmRoutes({ repoRoot: root, routeState: one });
    expect(routeLines({ repoRoot: root, prompt: 'commit', routeState: one })).toHaveLength(1);
  });

  test('no session id means no state: every prompt routes what it matches', () => {
    expect(fileRouteState(routerFixture(), '')).toBeNull();
  });

  test('the Claude Code wire: ROUTE lines last, after identity; SessionStart compact or clear re-arms and prints nothing', () => {
    const root = routerFixture();
    const sessionId = `route-test-${process.pid}-${Date.now()}`;
    const options = { repoRoot: root, env: { CLAUDE_PROJECT_DIR: root }, home: temporaryRoot('home '), orca: false, envMissing: false, worktreeUnprovisioned: false };
    const prompt = (text: string) => JSON.parse(renderHookOutput({ ...options, hookInput: { session_id: sessionId, prompt: text, hook_event_name: 'UserPromptSubmit' } })).hookSpecificOutput.additionalContext.split('\n') as string[];
    try {
      const first = prompt('commit this');
      expect(first.at(-2)).toStartWith('AGENT IDENTITY:');
      expect(first.at(-1)).toBe(route('.agents/instructions/agent-git.md'));
      expect(prompt('push it').some(line => line.startsWith(ROUTE_PREFIX))).toBe(false);
      for (const source of ['compact', 'clear']) {
        expect(renderHookOutput({ ...options, hookInput: { session_id: sessionId, hook_event_name: 'SessionStart', source } })).toBe('');
        expect(prompt('push it').at(-1)).toBe(route('.agents/instructions/agent-git.md'));
      }
      expect(renderHookOutput({ ...options, hookInput: { session_id: sessionId, hook_event_name: 'SessionStart', source: 'resume' } })).toBe('');
      expect(prompt('push it').some(line => line.startsWith(ROUTE_PREFIX))).toBe(false);
    }
    finally {
      rmSync(routeStatePath(root, sessionId), { force: true });
    }
  });
});

describe('adherence: scope, rank and cap, re-surface (ADR-0017)', () => {
  /** Five one-trigger sections, one row each, so a test owns the ranking. */
  function rankFixture(): string {
    const root = temporaryRoot('route rank ');
    const ids = ['alpha', 'beta', 'gamma', 'delta', 'omega'];
    write(root, 'AGENTS.md', [
      '<!-- router:start -->',
      '| When | Read | Was | Then |',
      '|---|---|---|---|',
      ...ids.map(id => `| ${id} | \`agent-${id}.md\` | - | - |`),
      '| alpha and omega | `agent-alpha.md`, `agent-omega.md` | - | - |',
      '<!-- router:end -->',
      '',
    ].join('\n'));
    for (const id of ids) {
      write(root, `.agents/instructions/agent-${id}.md`, `---\nid: ${id}\ntitle: ${id}\nload_when: ${id}\ntriggers: ['\\b${id}\\b', '\\b${id}s\\b']\npaths: ['${id}/']\n---\n\n# ${id}\n`);
    }
    return root;
  }
  const file = (id: string) => `.agents/instructions/agent-${id}.md`;

  test('rows rank by anchor strength: path hits, then distinct triggers, then the earliest match', () => {
    const router = loadInstructionRouter(rankFixture());
    expect(classifyPrompt(router, 'beta gamma, and gamma/ and gammas')).toEqual([file('gamma'), file('beta')]);
    expect(classifyPrompt(router, 'delta then alpha')).toEqual([file('delta'), file('alpha'), file('omega')]);
  });

  test('companions rank after every anchor, so they are the first to fall past the cap', () => {
    const router = loadInstructionRouter(rankFixture());
    expect(classifyPrompt(router, 'alpha beta gamma')).toEqual([file('alpha'), file('beta'), file('gamma'), file('omega')]);
    expect(bindingRoutes(router, 'alpha beta gamma')).toEqual([file('alpha'), file('beta'), file('gamma')]);
  });

  test(`at most ${MAX_ROUTED_SECTIONS} binding lines; the rest share one optional line, offered once and never recorded as routed`, () => {
    const root = rankFixture();
    const state = memoryState();
    const lines = routeLines({ repoRoot: root, prompt: 'alpha beta gamma delta', routeState: state });
    expect(lines.filter(line => line.startsWith(ROUTE_PREFIX))).toHaveLength(MAX_ROUTED_SECTIONS);
    expect(lines.at(-1)).toBe(`${ROUTE_OPTIONAL_PREFIX} the prompt also touches ${file('delta')} (delta), ${file('omega')} (omega); read one only if the task needs it.`);
    expect(routeLines({ repoRoot: root, prompt: 'alpha beta gamma delta', routeState: state })).toEqual([]);
    expect(routeLines({ repoRoot: root, prompt: 'now the delta work', routeState: state })).toEqual([
      `${ROUTE_PREFIX} ${file('delta')} (delta, 9 lines) before acting on this prompt`,
    ]);
  });

  test('a ROUTE-SCOPE line replaces the prompt: ids route directly, words classify, none routes nothing', () => {
    const router = loadInstructionRouter(rankFixture());
    expect(classifyPrompt(router, 'alpha beta gamma delta\nROUTE-SCOPE: omega')).toEqual([file('omega')]);
    expect(classifyPrompt(router, 'Do the work. ROUTE-SCOPE: delta, the beta stuff')).toEqual([file('delta'), file('beta')]);
    expect(classifyPrompt(router, 'alpha beta\nROUTE-SCOPE: none')).toEqual([]);
    expect(classifyPrompt(router, 'explain the `ROUTE-SCOPE:` header for beta')).toEqual([file('beta')]);
  });

  test('an orchestrator preamble is skipped: only the task block after its marker is classified', () => {
    const router = loadInstructionRouter(rankFixture());
    expect(classifyPrompt(router, 'You are a worker. alpha beta gamma.\n=== TASK ===\n/skill KEY fleet worker. Do the delta work.')).toEqual([file('delta')]);
  });

  test('absolute paths are locations, not intent: one into the checkout turns relative, any other is blanked', () => {
    const root = rankFixture();
    const router = loadInstructionRouter(root);
    expect(classifyPrompt(router, 'read /elsewhere/alpha-repo/beta/notes.md')).toEqual([]);
    expect(classifyPrompt(router, `edit ${router!.root}/gamma/x.ts`)).toEqual([file('gamma')]);
    expect(neutralizePaths('run /framework-development on tests/e2e/a.spec.ts and ~/x/y')).toBe('run /framework-development on tests/e2e/a.spec.ts and  ');
  });

  test('re-surface: the first tool call that reads no routed section gets ONE ROUTE-PENDING line', () => {
    const root = rankFixture();
    const state = memoryState();
    routeLines({ repoRoot: root, prompt: 'gamma beta', routeState: state });
    const call = (toolName: string, toolInput: Record<string, unknown>) => pendingRouteReminder({ repoRoot: root, routeState: state, toolName, toolInput });
    expect(call('Read', { file_path: `${root}/${file('gamma')}` })).toBe('');
    expect(call('Bash', { command: 'cat NOTES.md && git status' })).toBe(`${ROUTE_PENDING_PREFIX} routed for this prompt and still unread: ${file('beta')}. Read it before the next step (AGENTS.md LOAD PROTOCOL); this reminder is not repeated.`);
    expect(call('Bash', { command: 'git diff' })).toBe('');
    expect(call('Bash', { command: `cat ${file('beta')}` })).toBe('');
  });

  test('re-surface stays quiet when the sections were read first, and a new prompt resets it', () => {
    const root = rankFixture();
    const state = memoryState();
    routeLines({ repoRoot: root, prompt: 'gamma', routeState: state });
    expect(pendingRouteReminder({ repoRoot: root, routeState: state, toolName: 'Bash', toolInput: { command: `sed -n 1,40p ${file('gamma')}` } })).toBe('');
    expect(pendingRouteReminder({ repoRoot: root, routeState: state, toolName: 'Bash', toolInput: { command: 'ls' } })).toBe('');
    routeLines({ repoRoot: root, prompt: 'nothing routable here', routeState: state });
    expect(pendingRouteReminder({ repoRoot: root, routeState: state, toolName: 'Bash', toolInput: { command: 'ls' } })).toBe('');
  });

  test('the Claude Code PostToolUse wire: once per prompt, never for a subagent call, nothing for an unknown event', () => {
    const root = rankFixture();
    const sessionId = `route-pending-${process.pid}-${Date.now()}`;
    const options = { repoRoot: root, env: { CLAUDE_PROJECT_DIR: root }, home: temporaryRoot('home '), orca: false, envMissing: false, worktreeUnprovisioned: false };
    const post = (extra: Record<string, unknown> = {}) => renderHookOutput({ ...options, hookInput: { session_id: sessionId, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, ...extra } });
    try {
      renderHookOutput({ ...options, hookInput: { session_id: sessionId, prompt: 'beta', hook_event_name: 'UserPromptSubmit' } });
      expect(post({ agent_id: 'sub-1' })).toBe('');
      const reminder = JSON.parse(post()).hookSpecificOutput;
      expect(reminder.hookEventName).toBe('PostToolUse');
      expect(reminder.additionalContext).toStartWith(ROUTE_PENDING_PREFIX);
      expect(post()).toBe('');
      expect(renderHookOutput({ ...options, hookInput: { session_id: sessionId, hook_event_name: 'Stop' } })).toBe('');
    }
    finally {
      rmSync(routeStatePath(root, sessionId), { force: true });
    }
  });
});

describe('labelled-prompt eval (bilingual)', () => {
  const router = loadInstructionRouter(REPO_ROOT)!;
  const idOf = (path: string) => router.targets.get(path)?.id || path;
  const results = EVAL.prompts.map(({ prompt, expect: expected }) => {
    const named = classifyPrompt(router, prompt).map(idOf);
    const binding = bindingRoutes(router, prompt).map(idOf);
    return { prompt, expected, missed: expected.filter(id => !named.includes(id)), extra: binding.filter(id => !expected.includes(id)) };
  });
  const truePositives = results.reduce((sum, r) => sum + r.expected.length - r.missed.length, 0);
  const falseNegatives = results.reduce((sum, r) => sum + r.missed.length, 0);
  const falsePositives = results.reduce((sum, r) => sum + r.extra.length, 0);

  test('the set is large enough and covers both languages', () => {
    expect(EVAL.prompts.length).toBeGreaterThanOrEqual(40);
    expect(EVAL.prompts.some(p => /[áéíóú¿ñ]/i.test(p.prompt))).toBe(true);
    for (const result of results) {
      for (const id of result.expected) {
        expect([...router.targets.values()].some(target => (target.id || target.path) === id)).toBe(true);
      }
    }
  });

  test(`recall >= ${EVAL.targets.recall} and precision >= ${EVAL.targets.precision}`, () => {
    const recall = truePositives / (truePositives + falseNegatives);
    const precision = truePositives / (truePositives + falsePositives);
    const misses = results.filter(r => r.missed.length > 0).map(r => `${r.prompt} -> missed ${r.missed.join(', ')}`);
    expect({ recall: recall >= EVAL.targets.recall, misses }).toEqual({ recall: true, misses: recall >= EVAL.targets.recall ? misses : [] });
    expect(precision).toBeGreaterThanOrEqual(EVAL.targets.precision);
  });

  test('timing: routing the whole set stays far inside the 50 ms hook budget per prompt', () => {
    const started = performance.now();
    for (const { prompt } of EVAL.prompts) {
      classifyPrompt(loadInstructionRouter(REPO_ROOT), prompt);
    }
    const perPrompt = (performance.now() - started) / EVAL.prompts.length;
    expect(perPrompt).toBeLessThan(50);
  });

  test('the real hook process answers a prompt with its ROUTE line', () => {
    const run = Bun.spawnSync([NODE_BINARY, HOOK_EMITTER], {
      cwd: REPO_ROOT,
      stdin: Buffer.from(JSON.stringify({ prompt: 'commit and push', hook_event_name: 'UserPromptSubmit' })),
      env: { PATH: process.env.PATH ?? '', HOME: temporaryRoot('home ') },
    });
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toMatch(/ROUTE: read \.agents\/instructions\/agent-git\.md \(git, \d+ lines\) before acting on this prompt/);
  });
});
