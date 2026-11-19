import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const REPO = resolve(import.meta.dir, '..');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

const PROJECT = 'project:\n  project_name: demo\n  project_key: DEMO\n  unused_key: x\nenvironments:\n  local:\n    web_url: x\n';

function fixture(checks = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'lint-vars-'));
  roots.push(root);
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  write('.agents/project.yaml', PROJECT + checks);
  write('.agents/jira-required.yaml', 'required: {}\noptional: {}\n');
  write('AGENTS.md', '# Agents\nName {{PROJECT_NAME}}.\nTypo {{PROJCT_NAME}} and {{environments.local.web_url}}.\n');
  write('.agents/skills/foreign/SKILL.md', '# Foreign\nScene {{SCENE_TITLE}} for {{PROJECT_KEY}} and {{CAMERA_ANGLE}}.\n');
  for (const rel of ['scripts/lint-vars.ts', 'cli/lib/check-scope.ts']) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    copyFileSync(join(REPO, rel), join(root, rel));
  }
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'));
  return root;
}

function run(root: string): { code: number, out: string } {
  const result = Bun.spawnSync(['bun', 'scripts/lint-vars.ts'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  return { code: result.exitCode ?? 1, out: result.stdout.toString() + result.stderr.toString() };
}

const INFO_TAIL = [
  '  - 5 bare {{VAR}} occurrences across 2 files',
  '  - 1 explicit {{environments.<env>.<var>}} occurrences (0 invalid)',
  '  - 0 distinct <<VAR>> session variables (0 occurrences)',
  '  - 0 valid {{jira.*}} references (0 option-value refs, 0 cascading, 0 work_type refs, 0 status refs, 0 transition refs, 0 link_type refs); 0 invalid (errors above)',
  '  - 0 documentation meta-references skipped (allowlisted)',
];

const HEAD = [
  'Agents Lint Report',
  '==================',
  'Scanned: 2 files',
  'Declared in project.yaml:        3 flat + 1 env-scoped (across 1 envs: local) = 4 variables',
  'Declared in jira-required.yaml:  0 slugs (0 required + 0 optional + 0 unmapped) + 0 work_type(s) + 0 link_type(s)',
  'Catalog jira-fields.json:               absent (option-value checks skipped — run `bun run jira:sync-fields`)',
  'Catalog jira-workflows.json:     absent (workflow checks skipped — run `bun run jira:sync-workflows`)',
  '',
];

const WARNINGS = [
  'WARNINGS (1):',
  '  - DECLARED_BUT_UNUSED: UNUSED_KEY  (no occurrences in scanned files)',
  '',
  'INFO:',
];

const GOLDEN = [
  ...HEAD,
  'ERRORS (3):',
  '  - UNDECLARED: {{SCENE_TITLE}} at .agents/skills/foreign/SKILL.md:2',
  '  - UNDECLARED: {{CAMERA_ANGLE}} at .agents/skills/foreign/SKILL.md:2',
  '  - UNDECLARED: {{PROJCT_NAME}} at AGENTS.md:3',
  '',
  ...WARNINGS,
  ...INFO_TAIL,
  '',
].join('\n');

describe('vars:check checks.vars_check.skip_paths', () => {
  test('without the key the report is byte for byte the one before the key existed', () => {
    expect(run(fixture())).toEqual({ code: 1, out: GOLDEN });
  });

  test('the shipped default block changes nothing and declares no variable', () => {
    const block = 'checks:\n  mcp_parity:\n    mode: strict\n    relay: {}\n  vars_check:\n    skip_paths: []\n  docs_check:\n    include: []\n    exclude: []\n';
    expect(run(fixture(block))).toEqual({ code: 1, out: GOLDEN });
  });

  test('a skipped folder drops only its undeclared bare names; a typo elsewhere still fails', () => {
    const { code, out } = run(fixture('checks:\n  vars_check:\n    skip_paths: [.agents/skills/foreign/**]\n'));
    expect(code).toBe(1);
    expect(out).toBe([
      ...HEAD,
      'ERRORS (1):',
      '  - UNDECLARED: {{PROJCT_NAME}} at AGENTS.md:3',
      '',
      ...WARNINGS,
      ...INFO_TAIL,
      '  - 2 undeclared bare {{VAR}} ignored in 1 files (checks.vars_check.skip_paths)',
      '',
    ].join('\n'));
  });

  test('a declared name inside a skipped folder still counts as a use', () => {
    const { out } = run(fixture('checks:\n  vars_check:\n    skip_paths: [.agents/skills/foreign/**]\n'));
    expect(out).toContain('WARNINGS (1):\n  - DECLARED_BUT_UNUSED: UNUSED_KEY  (no occurrences in scanned files)\n\n');
  });

  test('a glob over the framework surface, a glob that matches nothing and a malformed list are errors', () => {
    const { code, out } = run(fixture('checks:\n  vars_check:\n    skip_paths: [.agents/skills/**, .agents/skills/gone/**]\n'));
    expect(code).toBe(1);
    expect(out).toContain('  - CHECKS_CONFIG: checks.vars_check.skip_paths: .agents/skills/** covers the framework surface');
    expect(out).toContain('  - CHECKS_CONFIG: checks.vars_check.skip_paths: .agents/skills/gone/** matches no scanned file (a folder needs /**)');
    expect(run(fixture('checks:\n  vars_check:\n    skip_paths: .agents/skills/foreign/**\n')).out).toContain('  - CHECKS_CONFIG: checks.vars_check.skip_paths: must be a list of repo-relative globs');
  });
});
