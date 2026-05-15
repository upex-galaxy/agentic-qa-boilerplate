import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CliError } from './errors.ts';
import { log } from './log.ts';

/**
 * Project-name sanitization rules:
 * - lowercase
 * - replace non [a-z0-9._-] with '-'
 * - collapse repeated '-'
 * - trim leading/trailing '-'
 * - clamp to 214 chars (npm pkg name limit)
 */
export function sanitizeProjectName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 214);
}

export async function scrubGitHistory(projectDir: string): Promise<void> {
  const gitDir = join(projectDir, '.git');
  if (existsSync(gitDir)) {
    await rm(gitDir, { recursive: true, force: true });
    log.dim('  Removed inherited .git history.');
  }
}

export async function rewritePackageJson(projectDir: string, projectName: string): Promise<void> {
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new CliError('BOOTSTRAP', `package.json missing at ${pkgPath}.`);
  }
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as Record<string, unknown>;

  pkg.name = projectName;
  pkg.version = '0.1.0';
  pkg.description = '';
  if (pkg.author === '') { delete pkg.author; }
  if (pkg.keywords && Array.isArray(pkg.keywords) && pkg.keywords.length === 0) {
    delete pkg.keywords;
  }
  // Drop "main" if it points at a non-existent default entrypoint.
  if (pkg.main === 'index.js' && !existsSync(join(projectDir, 'index.js'))) {
    delete pkg.main;
  }

  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  log.dim(`  Wrote package.json (name=${projectName}, version=0.1.0).`);
}

/**
 * Patch top-level keys in `.agents/project.yaml`. We do regex line edits rather
 * than full YAML parsing to keep this package zero-dep and to preserve comments.
 *
 * Updates supported:
 *   - project.name        (always set if found)
 *   - project.project_key (only if projectKey provided)
 */
export async function rewriteProjectYaml(projectDir: string, opts: {
  projectName: string
  projectKey?: string
}): Promise<void> {
  const yamlPath = join(projectDir, '.agents', 'project.yaml');
  if (!existsSync(yamlPath)) {
    // Boilerplate ships .agents/project.yaml; if missing the template is older
    // than expected — surface a non-fatal warning.
    log.warn('  .agents/project.yaml not found in template; skipping rename.');
    return;
  }

  let content = await readFile(yamlPath, 'utf8');
  content = replaceYamlField(content, 'name', opts.projectName);
  if (opts.projectKey) {
    content = replaceYamlField(content, 'project_key', opts.projectKey);
  }
  await writeFile(yamlPath, content, 'utf8');
  log.dim(`  Wrote .agents/project.yaml (name=${opts.projectName}${opts.projectKey ? `, project_key=${opts.projectKey}` : ''}).`);
}

/**
 * Replace the value of a top-level field inside the `project:` map of the YAML.
 * Matches the first occurrence of `^  <field>: <anything>$`.
 */
function replaceYamlField(content: string, field: string, value: string): string {
  const pattern = new RegExp(`^(\\s{2}${escapeReg(field)}:)\\s*.*$`, 'm');
  if (!pattern.test(content)) { return content; }
  return content.replace(pattern, `$1 ${value}`);
}

function escapeReg(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function initGitRepo(projectDir: string): void {
  const initRes = spawnSync('git', ['init', '-b', 'main'], { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] });
  if (initRes.status !== 0) {
    throw new CliError('BOOTSTRAP', 'git init failed.', initRes.stderr.toString());
  }

  const addRes = spawnSync('git', ['add', '.'], { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] });
  if (addRes.status !== 0) {
    throw new CliError('BOOTSTRAP', 'git add failed.', addRes.stderr.toString());
  }

  const commitRes = spawnSync(
    'git',
    ['commit', '-m', 'chore: initial commit from agentic-qa-boilerplate', '--no-verify'],
    { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (commitRes.status !== 0) {
    // Most likely: no git user.email/name configured. Surface a clear hint.
    throw new CliError(
      'BOOTSTRAP',
      'git commit failed.',
      `Stderr: ${commitRes.stderr.toString().trim()}\nHint: configure your git identity:\n  git config --global user.email "you@example.com"\n  git config --global user.name "Your Name"`,
    );
  }
  log.dim('  git init + initial commit done.');
}

interface ScaffoldManifest {
  version?: number
  exclude?: string[]
}

/**
 * Read `.template/manifest.json` from the freshly extracted project and delete
 * every path listed under `exclude`. This is how the template repo declares
 * "files committed to main that should NOT end up in a freshly bootstrapped
 * project" — e.g. the CLI's own source under `packages/`, or business maps
 * that are specific to the template's own product.
 *
 * Living in the template repo (not bundled into the CLI) means new exclusions
 * can be added by editing `.template/manifest.json` and pushing to `main` —
 * no CLI republish required.
 *
 * Security: paths are restricted to project-relative (no absolute paths, no
 * `..` traversal). Unsafe entries are skipped with a warning.
 */
export async function applyTemplateExclude(projectDir: string): Promise<void> {
  const manifestPath = join(projectDir, '.template', 'manifest.json');
  if (!existsSync(manifestPath)) {
    log.dim('  No .template/manifest.json — keeping all extracted files.');
    return;
  }

  let manifest: ScaffoldManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ScaffoldManifest;
  }
  catch (err) {
    log.warn(`  .template/manifest.json unreadable, skipping: ${(err as Error).message}`);
    return;
  }

  const paths = Array.isArray(manifest.exclude) ? manifest.exclude : [];
  if (paths.length === 0) {
    log.dim('  .template/manifest.json has no `exclude` entries.');
    return;
  }

  let pruned = 0;
  for (const rel of paths) {
    if (typeof rel !== 'string' || rel.length === 0) { continue; }
    if (rel.startsWith('/') || rel.split(/[\\/]/).includes('..')) {
      log.warn(`  Skipped unsafe path in manifest: ${rel}`);
      continue;
    }
    const abs = join(projectDir, rel);
    if (existsSync(abs)) {
      await rm(abs, { recursive: true, force: true });
      pruned++;
    }
  }
  log.dim(`  Pruned ${pruned} template artifact path(s) per manifest.`);
}
