import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { parseArgs } from '../src/args.ts';
import { buildTarArgs } from '../src/download.ts';
import { CliError } from '../src/errors.ts';
import { pruneBootstrapExcludes, rewriteProjectYaml, sanitizeProjectName } from '../src/prepare.ts';

describe('parseArgs', () => {
  test('accepts a project name as positional', () => {
    const a = parseArgs(['my-app']);
    expect(a.projectName).toBe('my-app');
    expect(a.here).toBe(false);
    expect(a.template).toBe('main');
  });

  test('rejects missing project name without --here', () => {
    expect(() => parseArgs([])).toThrow(CliError);
  });

  test('accepts --here without a name', () => {
    const a = parseArgs(['--here']);
    expect(a.here).toBe(true);
    expect(a.projectName).toBeUndefined();
  });

  test('parses --template and --template-repo', () => {
    const a = parseArgs(['my-app', '--template', 'develop', '--template-repo', 'fork/agentic-qa-boilerplate']);
    expect(a.template).toBe('develop');
    expect(a.templateRepo).toBe('fork/agentic-qa-boilerplate');
  });

  test('parses skip flags', () => {
    const a = parseArgs(['my-app', '--no-install', '--no-setup', '--no-git']);
    expect(a.noInstall).toBe(true);
    expect(a.noSetup).toBe(true);
    expect(a.noGit).toBe(true);
  });

  test('rejects unknown flag', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(CliError);
  });

  test('rejects flag missing value', () => {
    expect(() => parseArgs(['my-app', '--template'])).toThrow(CliError);
  });

  test('parses --menu flag', () => {
    const a = parseArgs(['--menu', 'foo']);
    expect(a.menu).toBe(true);
    expect(a.projectName).toBe('foo');
  });

  test('parses --no-banner flag', () => {
    const a = parseArgs(['--no-banner', 'foo']);
    expect(a.noBanner).toBe(true);
  });
});

describe('sanitizeProjectName', () => {
  test('lowercases and replaces invalid chars', () => {
    expect(sanitizeProjectName('My App!')).toBe('my-app');
  });

  test('collapses repeated dashes', () => {
    expect(sanitizeProjectName('foo---bar')).toBe('foo-bar');
  });

  test('trims leading/trailing dashes', () => {
    expect(sanitizeProjectName('-foo-')).toBe('foo');
  });

  test('clamps to 214 chars', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeProjectName(long).length).toBeLessThanOrEqual(214);
  });
});

describe('rewriteProjectYaml', () => {
  let dir: string;

  // Mirrors the real .agents/project.yaml shape: the field is `project_name`,
  // NOT `name`. Targeting the wrong key used to no-op silently on every scaffold.
  const TEMPLATE_YAML = [
    'project:',
    '  project_name: null # TODO: Project name',
    '  project_key: null # TODO: Project key',
    '  other: keep-me',
    '',
  ].join('\n');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caq-yaml-'));
    mkdirSync(join(dir, '.agents'), { recursive: true });
    writeFileSync(join(dir, '.agents', 'project.yaml'), TEMPLATE_YAML);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function readYaml(): string {
    return readFileSync(join(dir, '.agents', 'project.yaml'), 'utf8');
  }

  test('writes project_name, the field the template actually declares', async () => {
    await rewriteProjectYaml(dir, { projectName: 'my-app' });

    expect(readYaml()).toContain('  project_name: my-app');
    expect(readYaml()).not.toContain('project_name: null');
  });

  test('writes project_key only when one is provided', async () => {
    await rewriteProjectYaml(dir, { projectName: 'my-app' });
    expect(readYaml()).toContain('  project_key: null');

    await rewriteProjectYaml(dir, { projectName: 'my-app', projectKey: 'ACME' });
    expect(readYaml()).toContain('  project_key: ACME');
  });

  test('leaves unrelated fields untouched', async () => {
    await rewriteProjectYaml(dir, { projectName: 'my-app', projectKey: 'ACME' });
    expect(readYaml()).toContain('  other: keep-me');
  });

  test('does not throw when the field is absent', async () => {
    writeFileSync(join(dir, '.agents', 'project.yaml'), 'project:\n  unrelated: x\n');
    await rewriteProjectYaml(dir, { projectName: 'my-app' });
    expect(readYaml()).toContain('  unrelated: x');
  });
});

describe('buildTarArgs', () => {
  // `--force-local` is GNU-only; bsdtar (macOS, and C:\Windows\System32\tar.exe
  // on Windows 10 1803+ / 11) aborts with "Option --force-local is not supported".
  test('never passes --force-local, on any platform', () => {
    expect(buildTarArgs('/tmp/target')).not.toContain('--force-local');
  });

  test('passes the tarball as a bare relative name (no drive colon for GNU tar)', () => {
    const args = buildTarArgs('/tmp/target');
    const file = args[args.indexOf('-xzf') + 1];
    expect(file).toBe('template.tar.gz');
    expect(file).not.toContain(':');
    expect(file).not.toContain('/');
  });

  test('strips the GitHub wrapper directory', () => {
    expect(buildTarArgs('/tmp/target')).toContain('--strip-components=1');
  });

  test('passes the target directory to -C', () => {
    const args = buildTarArgs('/tmp/target');
    expect(args[args.indexOf('-C') + 1]).toBe('/tmp/target');
  });
});

describe('pruneBootstrapExcludes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caq-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('removes hardcoded excludes from project dir', async () => {
    mkdirSync(join(dir, 'packages', 'foo'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'foo', 'a.ts'), '// a');
    writeFileSync(join(dir, 'keep.txt'), 'keep me');

    await pruneBootstrapExcludes(dir);

    expect(existsSync(join(dir, 'packages'))).toBe(false);
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true);
  });

  // The boilerplate's own release history must not travel to a consumer project.
  test('removes the boilerplate CHANGELOG', async () => {
    writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog');
    writeFileSync(join(dir, 'README.md'), '# Keep me');

    await pruneBootstrapExcludes(dir);

    expect(existsSync(join(dir, 'CHANGELOG.md'))).toBe(false);
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
  });

  test('is a no-op when hardcoded excludes are absent', async () => {
    writeFileSync(join(dir, 'keep.txt'), 'keep me');
    await pruneBootstrapExcludes(dir);
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true);
  });

  // Our design material about evolving the framework is not framework the
  // consumer inherits. Mirrored by `repoOnlyPaths` so `bun run up` cannot
  // re-deliver what this prunes.
  test('removes the boilerplate qa-standard docs but keeps the rest of docs/', async () => {
    mkdirSync(join(dir, 'docs', 'qa-standard'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'qa-standard', 'planning-ladder-proposal.md'), '# Proposal');
    mkdirSync(join(dir, 'docs', 'methodology'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'methodology', 'kata-fundamentals.md'), '# KATA');

    await pruneBootstrapExcludes(dir);

    expect(existsSync(join(dir, 'docs', 'qa-standard'))).toBe(false);
    expect(existsSync(join(dir, 'docs', 'methodology', 'kata-fundamentals.md'))).toBe(true);
  });

  // The consumer inherits the CAPABILITY to record ADRs — the README that says
  // when to write one and the template to copy — but none of OUR decisions.
  test('prunes recorded ADRs while keeping the ADR README and template', async () => {
    mkdirSync(join(dir, '.context', 'ADR'), { recursive: true });
    writeFileSync(join(dir, '.context', 'ADR', 'README.md'), '# When to write an ADR');
    writeFileSync(join(dir, '.context', 'ADR', 'ADR-NNNN-template.md'), '# Template');
    writeFileSync(join(dir, '.context', 'ADR', 'ADR-0001-pbi-is-a-cache.md'), '# Decision');
    writeFileSync(join(dir, '.context', 'ADR', 'ADR-0002-one-atp.md'), '# Decision');

    await pruneBootstrapExcludes(dir);

    expect(existsSync(join(dir, '.context', 'ADR', 'README.md'))).toBe(true);
    // "NNNN" is not a digit run, so the template survives the same filter that
    // drops every numbered decision.
    expect(existsSync(join(dir, '.context', 'ADR', 'ADR-NNNN-template.md'))).toBe(true);
    expect(existsSync(join(dir, '.context', 'ADR', 'ADR-0001-pbi-is-a-cache.md'))).toBe(false);
    expect(existsSync(join(dir, '.context', 'ADR', 'ADR-0002-one-atp.md'))).toBe(false);
  });

  test('leaves the ADR directory alone when it holds no recorded decisions', async () => {
    mkdirSync(join(dir, '.context', 'ADR'), { recursive: true });
    writeFileSync(join(dir, '.context', 'ADR', 'README.md'), '# When to write an ADR');

    await pruneBootstrapExcludes(dir);

    expect(existsSync(join(dir, '.context', 'ADR', 'README.md'))).toBe(true);
  });
});
