/**
 * @fileoverview Pure / low-I/O building blocks for the boilerplate updater (Phase A).
 *
 * Scope of this module:
 *   - Filesystem + git subprocess helpers (read-only or atomic write).
 *   - State I/O (`readSyncState`, `writeSyncState`, `migrateSyncState`).
 *   - Delta computation (`computeDelta`, `classifyFile`).
 *   - Apply primitives (`applyResolution`, `appendBackupManifest`).
 *   - Diff renderers (`renderTemplateDiff`, `renderLocalDiff`).
 *   - Misc pure utilities (`normalizeWhitespace`, `cleanupTempDir`, ...).
 *
 * NOT in scope here:
 *   - ANSI colors, picocolors, boxen, inquirer, @clack/prompts.
 *   - console.log / process.stdout.write.
 *   - process.exit (callers receive Errors and decide).
 *   - DEV-specific config constants (`TEMPLATE_REPO`, `COMPONENTS`, ...).
 *
 * To preserve runtime stdout parity in Phase A, building blocks that previously
 * called `log*` helpers now accept an optional `CoreLogger` — the wrapper
 * supplies one wired to its existing ANSI logger; tests pass `silentLogger`.
 *
 * Phase B will introduce `runUpdate(cfg, sink, opts)` here and migrate the
 * wrapper to drive a TUI sink instead of the raw ANSI logger.
 */

import type {
  AppliedFile,
  BoilerplateCopyKept,
  ChangeStatus,
  Component,
  CoreLogger,
  DeltaEntry,
  DeprecatedFile,
  FailedFile,
  FileClass,
  GitVersion,
  IgnoreDelta,
  IgnoreLineOption,
  LocalEditOverwritten,
  PackageJsonDelta,
  PackageJsonKeptKey,
  PackageJsonKeyOption,
  PairedDiff,
  ReportSink,
  RunSummary,
  ScopeOption,
  SyncState,
  SyncStateV5,
  SyncStateV6,
  SyncStateV7,
  UpdaterConfig,
} from './updater-types';
import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CONTEXT_MAP_SKILLS } from './context-maps';
import { testSiblingsToHoldBack } from './updater-drift';
import { applyIgnoreAppend, computeBlobSha, detectIgnoreDelta } from './updater-ignore';
import { applyPackageJsonAppend, applyPackageJsonOverride, detectPackageJsonDelta } from './updater-package';
import { ComponentOverlapError, CorruptStateError } from './updater-types';

// ============================================================================
// SILENT LOGGER — default no-op used when the caller does not supply one.
// ============================================================================

export const silentLogger: CoreLogger = {
  info: () => {},
  success: () => {},
  warning: () => {},
  error: () => {},
  step: () => {},
  merge: () => {},
};

// ============================================================================
// SMALL HELPERS
// ============================================================================

export function errorMessage(err: unknown): string {
  if (err instanceof Error) { return err.message; }
  return String(err);
}

/**
 * True when a repo-relative path falls under one of the `repoOnlyPaths` prefixes
 * — the boilerplate's own material, which never travels to a consumer project.
 *
 * A prefix matches the path itself or anything beneath it, and only at a segment
 * boundary: `docs/qa-standard` must not swallow a sibling called
 * `docs/qa-standards` or `docs/qa-standard-archive`. Backslashes are normalized
 * so a Windows-shaped entry path compares equal to a POSIX-shaped prefix. An
 * empty prefix never matches, so a stray entry cannot blank the whole sync.
 */
export function isRepoOnlyPath(filePath: string, prefixes: string[]): boolean {
  const p = filePath.replace(/\\/g, '/');
  return prefixes.some((raw) => {
    const prefix = raw.replace(/\\/g, '/').replace(/\/+$/, '');
    if (prefix === '') { return false; }
    return p === prefix || p.startsWith(`${prefix}/`);
  });
}

/**
 * True when `relPath` never travels to this repo: a repo-only path, or a
 * repo-only pattern (`UpdaterConfig.repoOnlyPatterns`). Applies to every
 * delivery route, the self-update of the updater included.
 */
export function isRepoOnlyForRun(cfg: Pick<UpdaterConfig, 'repoOnlyPaths' | 'repoOnlyPatterns'>, relPath: string): boolean {
  const rel = relPath.replace(/\\/g, '/');
  return isRepoOnlyPath(rel, cfg.repoOnlyPaths ?? []) || (cfg.repoOnlyPatterns ?? []).some(re => re.test(rel));
}

/**
 * Context skills a consumer authors (`<aspect>-context/`, the judgment layer
 * over its own `.context/` maps) are PROJECT-LOCAL by construction: the sync
 * never delivers, overwrites or deletes one, even on the day upstream ships a
 * same-slug directory as an example. Two families keep syncing as before: the
 * one context skill upstream owns (`iql-context`), and the workflow skills
 * whose slugs predate the `-context` suffix rule: `project-context`, which
 * `scripts/lint-skills.ts` grandfathers in KIND_SUFFIX_EXEMPT (`cli/` is
 * import-closed, so a test keeps the two in step), and the retired
 * `sync-ai-context`, kept here so a downstream copy stays upstream's and
 * `deprecatedFiles` can remove it instead of the sync treating it as the
 * project's own.
 */
export const CONTEXT_SKILL_SUFFIX = '-context';
export const UPSTREAM_CONTEXT_SUFFIX_SKILLS: ReadonlySet<string> = new Set(['iql-context', 'project-context', 'sync-ai-context']);

/**
 * True for any path inside `<skillsDir>/<slug>/` where `slug` ends in
 * `-context` and is not one upstream owns. Segment-aware and separator-agnostic.
 */
export function isProjectLocalSkillPath(relPath: string, skillsDir = '.agents/skills'): boolean {
  const p = relPath.replace(/\\/g, '/');
  const root = skillsDir.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!p.startsWith(`${root}/`)) { return false; }
  const slug = p.slice(root.length + 1).split('/')[0] ?? '';
  if (slug === '' || !slug.endsWith(CONTEXT_SKILL_SUFFIX)) { return false; }
  return !UPSTREAM_CONTEXT_SUFFIX_SKILLS.has(slug);
}

/**
 * The one exception to "a `<aspect>-context` is project-local": the context
 * map skills (`CONTEXT_MAP_SKILLS`, cli/lib/context-maps.ts) ship as
 * placeholders, so a project that lacks one gets its WHOLE folder once. A
 * folder that exists, even half-empty, is the project's and is never touched:
 * `isProjectLocalSkillPath` still keeps every one of these paths out of the
 * overwrite and delete pools, so this is delivery-only. Returns bootstrap
 * entries for the absent folders, owned by whichever selected component owns
 * the skills dir (or that skill's own subdirectory, for `--skill` runs).
 */
export function collectContextMapBootstrap(
  components: readonly Component[],
  templateDir: string,
  repoRoot: string,
  existing: readonly DeltaEntry[] = [],
  skillsDir = '.agents/skills',
): DeltaEntry[] {
  const root = skillsDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const taken = new Set(existing.map(e => e.path.replace(/\\/g, '/')));
  const out: DeltaEntry[] = [];
  for (const skill of CONTEXT_MAP_SKILLS) {
    const skillRel = `${root}/${skill.slug}`;
    const owner = components.find(c => c.type === 'directory'
      && c.paths.some(p => [root, skillRel].includes(p.replace(/\\/g, '/').replace(/\/+$/, ''))));
    if (!owner) { continue; }
    const src = path.join(templateDir, ...skillRel.split('/'));
    if (!fs.existsSync(src) || fs.existsSync(path.join(repoRoot, ...skillRel.split('/')))) { continue; }
    const walk = (dir: string): void => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) { walk(full); continue; }
        const rel = `${skillRel}/${path.relative(src, full).split(path.sep).join('/')}`;
        if (!taken.has(rel)) { out.push(bootstrapEntry(owner.name, rel, templateDir)); }
      }
    };
    walk(src);
  }
  return out;
}

/**
 * Recursive count of plain files under a directory. Returns 0 when the dir is missing.
 */
export function countFilesInDir(dir: string): number {
  if (!fs.existsSync(dir)) { return 0; }
  let count = 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      count += countFilesInDir(path.join(dir, item.name));
    }
    else {
      count++;
    }
  }
  return count;
}

/**
 * Recursive walk that returns all plain files under a directory.
 */
export function collectFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) { return files; }

  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...collectFiles(fullPath));
    }
    else {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Best-effort cleanup of a temp directory. Never throws.
 */
export function cleanupTempDir(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ============================================================================
// GIT ENVIRONMENT DETECTION (pure)
// ============================================================================

/**
 * Execute `git --version` and parse the result.
 * Throws Error('GIT_NOT_FOUND') if git binary is not on PATH.
 * Throws Error('GIT_VERSION_UNPARSEABLE: <raw>') if the version string does not match expected format.
 */
export function detectGitVersion(): GitVersion {
  let raw: string;
  try {
    raw = execSync('git --version', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  }
  catch {
    throw new Error('GIT_NOT_FOUND');
  }

  const match = /\bgit version (\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!match) {
    throw new Error(`GIT_VERSION_UNPARSEABLE: ${raw}`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    raw,
  };
}

/**
 * Returns true when the detected git version is >= 2.25 (required for sparse-checkout).
 */
export function gitVersionMeetsMin(v: GitVersion): boolean {
  return v.major > 2 || (v.major === 2 && v.minor >= 25);
}

/**
 * Resolve the HEAD commit SHA of an already-cloned template repo.
 * Returns 'unknown' on any failure (rather than throwing).
 */
export function resolveTemplateHeadSha(repoDir: string): string {
  try {
    return execSync(`git -C "${repoDir}" rev-parse HEAD`, { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  }
  catch {
    return 'unknown';
  }
}

/**
 * Build sparse-checkout patterns from a component registry.
 *
 * Gitignore-style patterns (`--no-cone` mode) require explicit filenames for
 * root-level files. For components declared with `paths: ['.']`, expand to each
 * entry in `files` so root-level files like `.editorconfig` and `CONTEXT.md`
 * actually land in the partial clone.
 */
export function buildSparseCheckoutPatterns(components: Component[]): string[] {
  const patterns = new Set<string>();
  for (const c of components) {
    for (const p of c.paths) {
      if (p === '.') {
        for (const f of c.files ?? []) {
          patterns.add(f);
        }
      }
      else {
        patterns.add(p);
      }
    }
  }
  return [...patterns];
}

// ============================================================================
// SYNC STATE I/O
// ============================================================================

/**
 * Read a sync-state lock file and return a typed SyncState.
 * Returns null when the file is absent (bootstrap path).
 * Throws CorruptStateError when JSON is invalid or the shape is unrecognized.
 *
 * Recognizes three v6 shapes plus v5 fallback:
 *   - dev shape:   { schemaVersion: 6, lastSync, perComponentCommit, ... }
 *   - qa  shape:   { schema: 6, lastSyncedAt, perComponentCommit, ... }
 *     (normalized in-memory to dev shape; downstream sees `schemaVersion: 6`)
 *   - v7 shape is parsed by isV7State at the call site, since it also carries
 *     `schemaVersion` and goes through the same code path here.
 */
export function readSyncState(repoRoot: string, versionFile: string): SyncState | null {
  const filePath = path.join(repoRoot, versionFile);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  catch {
    throw new CorruptStateError(
      `Corrupt sync state: ${filePath}. Refusing to silently overwrite. Fix or delete the file.`,
    );
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'perComponentCommit' in parsed
    && (parsed as Record<string, unknown>).schemaVersion === 6
  ) {
    return parsed as SyncStateV6;
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'perComponentCommit' in parsed
    && (parsed as Record<string, unknown>).schema === 6
  ) {
    const p = parsed as Record<string, unknown> & { perComponentCommit: Record<string, string> };
    return {
      schemaVersion: 6,
      lastSync: typeof p.lastSyncedAt === 'string' ? p.lastSyncedAt : new Date().toISOString(),
      templateCommit: typeof p.templateCommit === 'string' ? p.templateCommit : '',
      cliVersion: typeof p.cliVersion === 'string' ? p.cliVersion : '',
      syncedComponents: Array.isArray(p.syncedComponents)
        ? (p.syncedComponents as string[])
        : Object.keys(p.perComponentCommit),
      variableSystemVersion: 1,
      perComponentCommit: p.perComponentCommit,
    } satisfies SyncStateV6;
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'templateCommit' in parsed
  ) {
    return parsed as SyncStateV5;
  }

  throw new CorruptStateError(
    `Corrupt sync state: ${filePath}. Refusing to silently overwrite. Fix or delete the file.`,
  );
}

/**
 * Pure function — converts a v5 SyncStateV5 to a SyncStateV6 with empty perComponentCommit.
 * templateCommit and syncedComponents are preserved.
 * variableSystemVersion is set to 1 (number, was boolean in v5).
 */
export function migrateSyncState(old: SyncStateV5, cliVersion: string): SyncStateV6 {
  return {
    schemaVersion: 6,
    lastSync: new Date().toISOString(),
    templateCommit: old.templateCommit,
    cliVersion,
    syncedComponents: old.syncedComponents,
    variableSystemVersion: 1,
    perComponentCommit: {},
  };
}

/**
 * Atomic write of SyncStateV6 to the lock file path.
 * Writes to a `.tmp.<pid>` sibling first, then renames to the final path.
 * POSIX rename guarantee assumes both files are on the same filesystem.
 *
 * Logging is delegated to the caller via `logger.success(...)`; this preserves the
 * exact `"Version registrada en …"` line the wrapper has always printed.
 */
export function writeSyncState(
  repoRoot: string,
  versionFile: string,
  state: SyncStateV6,
  logger: CoreLogger = silentLogger,
): void {
  const finalPath = path.join(repoRoot, versionFile);
  const tmpPath = `${finalPath}.tmp.${process.pid}`;
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmpPath, finalPath);
  logger.success(`Version registrada en ${versionFile}`);
}

// ============================================================================
// FILE CLASSIFICATION
// ============================================================================

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.tar',
  '.gz',
  '.pdf',
  '.pyc',
]);

/**
 * Normalise whitespace for comparison purposes.
 *   1. CRLF → LF
 *   2. Trailing horizontal whitespace stripped per line
 *   3. Trailing whitespace on last line without newline
 *   4. Multiple trailing blank lines collapsed to single trailing newline
 */
export function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+(?=\n)/g, '')
    .replace(/[ \t]+$/, '')
    .replace(/\n+$/, '\n');
}

/**
 * Classify a single delta entry into a FileClass.
 *
 * Side-effects: reads local filesystem + executes `git show` (idempotent reads only).
 *
 * Classification rules (in order):
 *   1. Binary extension heuristic → 'binary-skip'
 *   2. status D + no local file → 'unchanged'
 *   3. status D + local file exists → 'deleted-upstream'
 *   4. Bootstrap-aware override (per-component bootstrapOnly or agents bootstrap-file allowlist):
 *        local exists → 'unchanged' (NEVER offered as diverged — JSDoc invariant)
 *        local missing → 'new-upstream'
 *   5. status A + no local file → 'new-upstream'
 *   6. status A + local exists → 'locally-diverged'
 *   7. status M + no local file → 'clean-fastforward'
 *   8. status M + byte-identical to template-old → 'clean-fastforward'
 *   9. status M + whitespace-only diff → 'clean-fastforward'
 *  10. else → 'locally-diverged'
 *
 * Repo-specific config flows through `components` (for `bootstrapOnly`) and
 * `agentsBootstrapFiles` (bootstrap-only paths; see `isBootstrapOnlyFile`).
 */
/**
 * Match a delta path against a component's file-list whitelist.
 *
 * Behavior by component type:
 *  - `'directory'` / `'mixed'`  → always true (no whitelist filtering; the
 *    component owns its declared directory tree wholesale).
 *  - `'file-list'`              → true iff `filePath` exactly equals
 *    `<root>/<file>` for one of `component.files`, where `<root>` is the
 *    component's first declared path. `paths: ['.']` matches root-level files
 *    by their literal name (no leading `./`).
 *
 * Match is exact-string only — no glob expansion, no nested-path expansion.
 * `files: ['README.md']` with `paths: ['.agents']` matches `.agents/README.md`
 * but NOT `.agents/subdir/README.md` (predictable + collision-free).
 */
export function entryMatchesFileList(filePath: string, component: Component): boolean {
  if (component.type !== 'file-list') { return true; }
  const root = component.paths[0];
  const files = component.files ?? [];
  for (const f of files) {
    const expected = (root === '.' || root === undefined) ? f : `${root}/${f}`;
    if (filePath === expected) { return true; }
  }
  return false;
}

/**
 * Whether a file is framework-exempt — i.e. its basename matches the component's
 * `frameworkFiles` allowlist (so it flows through despite `bootstrapOnly`), UNLESS
 * its full repo-relative path is re-exempted via `frameworkFilesExcept` (project
 * state that must be preserved, e.g. `.context/ADR/README.md`).
 *
 * Single source of truth for both `classifyFile` and the batch loop in
 * `computeDelta` — they MUST agree or bootstrap/diverged classification drifts.
 */
export function isFrameworkExemptPath(
  component: Component | undefined,
  relPath: string,
): boolean {
  if (component?.bootstrapOnly !== true) { return false; }
  const basename = path.basename(relPath);
  if (component.frameworkFiles?.includes(basename) !== true) { return false; }
  // Path-level re-exemption: keep this file project-owned (bootstrap), not flow-through.
  if (component.frameworkFilesExcept?.includes(relPath) === true) { return false; }
  return true;
}

/**
 * True when `relPath` is bootstrap-only: delivered once when missing, then
 * project-owned and never overwritten. Three ways in:
 *
 *  1. the whole component is `bootstrapOnly`, except its framework-exempt
 *     files (`frameworkFiles` minus `frameworkFilesExcept`), which flow through;
 *  2. the repo-relative path is listed in `bootstrapOnlyPaths`, whatever
 *     component owns it (`scripts/api-login.project.ts` belongs to
 *     `scripts`, not `agents`);
 *  3. legacy `agents` contract: a basename listed there (`project.yaml`,
 *     `jira-*.json`) is bootstrap-only for the `agents` root file-list, unless
 *     `agentsFrameworkFiles` names it as boilerplate-owned (`README.md`).
 *
 * Single source of truth for `classifyFile`, `reconcileComponentsByContent`
 * and the fresh-install bootstrap walk: they MUST agree.
 */
export function isBootstrapOnlyFile(
  relPath: string,
  component: Component | undefined,
  bootstrapOnlyPaths: readonly string[],
  agentsFrameworkFiles: readonly string[] = [],
): boolean {
  if (isFrameworkExemptPath(component, relPath)) { return false; }
  if (component?.bootstrapOnly === true) { return true; }
  const rel = relPath.replace(/\\/g, '/');
  const basename = path.basename(rel);
  const isAgentsRoot = component?.name === 'agents';
  if (isAgentsRoot && agentsFrameworkFiles.includes(basename)) { return false; }
  return bootstrapOnlyPaths.some((raw) => {
    const p = raw.replace(/\\/g, '/');
    return p === rel || (isAgentsRoot && path.basename(p) === basename);
  });
}

export function classifyFile(
  entry: Omit<DeltaEntry, 'classification'>,
  templateDir: string,
  localRepoRoot: string,
  components: readonly Component[],
  agentsBootstrapFiles: readonly string[],
): FileClass {
  // 1. Binary detection — extension heuristic
  const ext = path.extname(entry.path).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext) || entry.isBinary) {
    return 'binary-skip';
  }

  const localPath = path.join(localRepoRoot, entry.path);
  const localExists = fs.existsSync(localPath);

  // 2-3. Deleted upstream
  if (entry.status === 'D') {
    return localExists ? 'deleted-upstream' : 'unchanged';
  }

  // 4. Bootstrap-aware override
  const component = components.find(c => c.name === entry.component);
  const isBootstrapFile = isBootstrapOnlyFile(entry.path, component, agentsBootstrapFiles);
  if (isBootstrapFile) {
    return localExists ? 'unchanged' : 'new-upstream';
  }

  // 5-6. Added upstream
  if (entry.status === 'A') {
    return localExists ? 'locally-diverged' : 'new-upstream';
  }

  // status === 'M' from here
  // 7. User deleted the file locally. Do NOT silently resurrect it via a
  // fast-forward write — classify as diverged so it is skipped by default
  // (auto) or prompted (interactive); the user can opt in to restore it.
  if (!localExists) {
    return 'locally-diverged';
  }

  // 8. Byte-compare local vs template-old blob
  const localBytes = fs.readFileSync(localPath);

  if (entry.templateOldSha) {
    let templateOldBytes: Buffer;
    try {
      templateOldBytes = execSync(
        `git -C "${templateDir}" show ${entry.templateOldSha}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
    }
    catch {
      // Cannot retrieve blob — safe fallback to diverged
      return 'locally-diverged';
    }

    if (Buffer.compare(localBytes, templateOldBytes) === 0) {
      return 'clean-fastforward';
    }

    // 9. Whitespace-only divergence
    const localStr = localBytes.toString('utf8');
    const oldStr = templateOldBytes.toString('utf8');
    if (normalizeWhitespace(localStr) === normalizeWhitespace(oldStr)) {
      return 'clean-fastforward';
    }
  }

  return 'locally-diverged';
}

// ============================================================================
// DELTA COMPUTATION
// ============================================================================

/**
 * Compute per-component deltas using stored SHA cursors.
 *
 * For each component with a known perComponentCommit SHA:
 *   - Runs `git log <sha>..HEAD --name-status --no-renames -- <paths>`
 *   - Runs `git diff --numstat <sha>..HEAD -- <paths>` for line counts + binary detection
 *   - Resolves templateOldSha / templateNewSha per entry
 *   - Calls classifyFile() for each entry
 *
 * Components whose SHA equals HEAD → skipped (zero delta).
 * Components with no SHA entry → skipped here; bootstrap path handles them.
 *
 * Returns: flat DeltaEntry[] (classified). The optional `logger` preserves the
 * exact warning lines the legacy implementation printed on git failures.
 */
export function computeDelta(
  templateDir: string,
  components: readonly Component[],
  state: SyncStateV6,
  localRepoRoot: string,
  agentsBootstrapFiles: readonly string[],
  logger: CoreLogger = silentLogger,
): DeltaEntry[] {
  const delta: DeltaEntry[] = [];

  // Get current HEAD SHA of the template clone
  let headSha: string;
  try {
    headSha = execSync(`git -C "${templateDir}" rev-parse HEAD`, { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  }
  catch {
    logger.error('No se pudo resolver el HEAD SHA del template clone');
    return delta;
  }

  for (const component of components) {
    const componentSha = state.perComponentCommit[component.name];

    if (!componentSha) {
      // No SHA recorded — skip; bootstrap path handles this
      continue;
    }

    if (componentSha === headSha) {
      // Already at HEAD for this component
      continue;
    }

    // Build path args for git commands
    const pathArgs = component.paths.map(p => `"${p}"`).join(' ');

    // --- name-status (with --no-renames to demote R → D+A) ---
    let nameStatusOutput: string;
    try {
      nameStatusOutput = execSync(
        `git -C "${templateDir}" log ${componentSha}..HEAD --name-status --no-renames --diff-filter=ADM -- ${pathArgs}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch {
      logger.warning(`No se pudo computar el delta del componente '${component.name}'. Saltando.`);
      continue;
    }

    // --- numstat (for line counts + binary detection) ---
    let numstatOutput: string;
    try {
      numstatOutput = execSync(
        `git -C "${templateDir}" diff --numstat ${componentSha}..HEAD -- ${pathArgs}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch {
      numstatOutput = '';
    }

    // Build numstat lookup: path → { added, removed, isBinary }
    const numstatMap = new Map<string, { added: number, removed: number, isBinary: boolean }>();
    for (const line of numstatOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      // Binary: "-\t-\t<path>"
      const binaryMatch = /^-\t-\t(.+)$/.exec(trimmed);
      if (binaryMatch) {
        numstatMap.set(binaryMatch[1], { added: 0, removed: 0, isBinary: true });
        continue;
      }
      const numMatch = /^(\d+)\t(\d+)\t(.+)$/.exec(trimmed);
      if (numMatch) {
        numstatMap.set(numMatch[3], {
          added: Number.parseInt(numMatch[1], 10),
          removed: Number.parseInt(numMatch[2], 10),
          isBinary: false,
        });
      }
    }

    // Parse name-status output — unique paths (git log may repeat a file across commits)
    const seenPaths = new Set<string>();
    const fileStatuses = new Map<string, ChangeStatus>();

    for (const line of nameStatusOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      const match = /^([MAD])\t(.+)$/.exec(trimmed);
      if (!match) { continue; }
      const status = match[1] as ChangeStatus;
      const filePath = match[2];
      // Most-recent status in git log order wins (git log prints newest-first)
      if (!seenPaths.has(filePath)) {
        seenPaths.add(filePath);
        fileStatuses.set(filePath, status);
      }
    }

    for (const [filePath, status] of fileStatuses) {
      // File-list whitelist filter (Level 1 — closes the gap where computeDelta
      // ignored `component.files` and captured every change under
      // `component.paths`). `directory` / `mixed` components are unaffected.
      if (!entryMatchesFileList(filePath, component)) { continue; }

      const numstat = numstatMap.get(filePath) ?? { added: 0, removed: 0, isBinary: false };

      // Resolve templateOldSha (blob at componentSha)
      let templateOldSha: string | null = null;
      if (status !== 'A') {
        try {
          const lsOld = execSync(
            `git -C "${templateDir}" ls-tree ${componentSha} -- "${filePath}"`,
            { stdio: ['pipe', 'pipe', 'pipe'] },
          ).toString().trim();
          const blobMatch = /\bblob\s+([0-9a-f]{40})\b/.exec(lsOld);
          templateOldSha = blobMatch ? blobMatch[1] : null;
        }
        catch {
          templateOldSha = null;
        }
      }

      // Resolve templateNewSha (blob at HEAD)
      let templateNewSha: string | null = null;
      if (status !== 'D') {
        try {
          const lsNew = execSync(
            `git -C "${templateDir}" ls-tree HEAD -- "${filePath}"`,
            { stdio: ['pipe', 'pipe', 'pipe'] },
          ).toString().trim();
          const blobMatch = /\bblob\s+([0-9a-f]{40})\b/.exec(lsNew);
          templateNewSha = blobMatch ? blobMatch[1] : null;
        }
        catch {
          templateNewSha = null;
        }
      }

      const partial: Omit<DeltaEntry, 'classification'> = {
        component: component.name,
        path: filePath,
        status,
        fromSha: componentSha,
        toSha: headSha,
        added: numstat.added,
        removed: numstat.removed,
        isBinary: numstat.isBinary,
        templateOldSha,
        templateNewSha,
      };

      const classification = classifyFile(
        partial,
        templateDir,
        localRepoRoot,
        components,
        agentsBootstrapFiles,
      );

      delta.push({ ...partial, classification });
    }
  }

  // --- Level 2: GLOBAL DEDUPE BY PATH ---
  // Two components can match the same path (e.g. a directory component and a
  // file-list component whose root contains files inside the directory). Without
  // dedupe, Phase 4 prompts the user twice for the same file and applyResolution
  // runs twice on the same path (corrupts pre-write backup).
  //
  // Ownership rule:
  //   1. Pick the component whose *matching* path is the longest prefix of the
  //      file path (most specific).
  //   2. On tie, the component that appears earlier in the `components[]`
  //      declaration wins (maintainer-controlled, stable across runs).
  //
  // Eviction is logged via the optional `logger.step` so users can audit
  // conflicts during `--auto` runs.
  const componentIndex = new Map<string, number>();
  components.forEach((c, idx) => { componentIndex.set(c.name, idx); });
  // A consumer's `<aspect>-context/` is never in play: not delivered, not
  // overwritten, and never a `deleted-upstream` candidate that `--force` would
  // remove the day upstream drops an example of the same name.
  const withoutProjectLocal = delta.filter(e => !isProjectLocalSkillPath(e.path));
  return dedupeDeltaByPath(withoutProjectLocal, components, componentIndex, logger);
}

// ============================================================================
// CONTENT RECONCILE (Profundidad B — full 1:1 sync, cursor-independent)
// ============================================================================

/**
 * Batch-resolve the HEAD blob SHA of every file under `pathspecs` in the
 * template clone. One `git ls-tree -r HEAD` call (cheap) → map relPath → sha.
 */
function batchUpstreamShas(templateDir: string, pathspecs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (pathspecs.length === 0) { return map; }
  try {
    const args = pathspecs.map(p => `"${p}"`).join(' ');
    const out = execSync(
      `git -C "${templateDir}" ls-tree -r HEAD -- ${args}`,
      { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 64 },
    ).toString();
    for (const line of out.split('\n')) {
      // <mode> blob <sha>\t<path>
      const m = /^\S+\s+blob\s+([0-9a-f]{40})\t(.+)$/.exec(line);
      if (m) { map.set(m[2].replace(/\\/g, '/'), m[1]); }
    }
  }
  catch {
    // empty map → caller treats every file as new (safe — copies wholesale)
  }
  return map;
}

/**
 * Batch-compute the git blob SHA of the given local files. Uses
 * `git hash-object --stdin-paths` (one call) and falls back to per-file
 * `computeBlobSha` if the batch call fails. Missing files are omitted.
 */
function batchLocalShas(repoRoot: string, relPaths: string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (relPaths.length === 0) { return map; }
  try {
    const out = execSync('git hash-object --stdin-paths', {
      cwd: repoRoot,
      input: relPaths.join('\n'),
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 64,
    }).toString().trim();
    const shas = out.split('\n');
    relPaths.forEach((p, i) => {
      const sha = shas[i]?.trim();
      if (sha && /^[0-9a-f]{40}$/.test(sha)) { map.set(p, sha); }
    });
  }
  catch {
    for (const p of relPaths) {
      const sha = computeBlobSha(path.join(repoRoot, p));
      if (sha) { map.set(p, sha); }
    }
  }
  return map;
}

/**
 * Full content reconcile for regular framework components (Profundidad B).
 *
 * Unlike `computeDelta` (which only sees files touched in the git-log range
 * cursor..HEAD), this walks the ENTIRE upstream component tree and compares
 * each file's content against the local copy by git blob SHA — independent of
 * the stored SHA cursor. This guarantees a 1:1 match with the boilerplate: a
 * file missing locally OR locally edited while upstream stayed the same is
 * still detected and re-synced.
 *
 * Emits per file:
 *   - 'new-upstream'      → missing locally (copy)
 *   - 'locally-diverged'  → present but bytes differ (overwritten with 'theirs')
 *   - (nothing)           → bytes identical
 *   - binary extensions   → skipped (mirrors classifyFile rule 1)
 *
 * Bootstrap-only files keep their preserve-if-present / copy-if-missing rule
 * (project-owned — never overwritten). Deleted-upstream files are NOT detected
 * here (a removed-upstream file can't appear in an upstream tree walk); that
 * stays with `computeDelta`'s git-log `D` entries, which safely flag only files
 * the boilerplate explicitly removed (never project-local-only files).
 */
export function reconcileComponentsByContent(
  templateDir: string,
  components: readonly Component[],
  localRepoRoot: string,
  agentsBootstrapFiles: readonly string[],
): DeltaEntry[] {
  const out: DeltaEntry[] = [];

  for (const component of components) {
    const relPaths = collectComponentRelPaths(component, templateDir);
    if (relPaths.length === 0) { continue; }

    const pathspecs = component.type === 'file-list'
      ? relPaths
      : component.paths;
    const upstreamShas = batchUpstreamShas(templateDir, pathspecs);

    // Decide each file's fate; collect the present ones for a batched local hash.
    const present: string[] = [];
    const missing: string[] = [];
    const bootstrapMissing: string[] = [];
    for (const relPath of relPaths) {
      const ext = path.extname(relPath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) { continue; } // mirror classifyFile rule 1

      const isBootstrapFile = isBootstrapOnlyFile(relPath, component, agentsBootstrapFiles);

      const localExists = fs.existsSync(path.join(localRepoRoot, relPath));
      if (isBootstrapFile) {
        // project-owned: copy only if missing, never overwrite
        if (!localExists) { bootstrapMissing.push(relPath); }
        continue;
      }
      if (!localExists) { missing.push(relPath); }
      else { present.push(relPath); }
    }

    for (const relPath of [...missing, ...bootstrapMissing]) {
      out.push(bootstrapEntry(component.name, relPath, templateDir));
    }

    const localShas = batchLocalShas(localRepoRoot, present);
    for (const relPath of present) {
      const upstreamSha = upstreamShas.get(relPath);
      if (!upstreamSha) { continue; } // not tracked upstream — leave alone
      const localSha = localShas.get(relPath);
      if (localSha && localSha === upstreamSha) { continue; } // identical → nothing

      out.push({
        component: component.name,
        path: relPath,
        status: 'M',
        fromSha: '',
        toSha: upstreamSha,
        added: 0,
        removed: 0,
        isBinary: false,
        templateOldSha: null,
        templateNewSha: upstreamSha,
        classification: 'locally-diverged',
      });
    }
  }

  return out;
}

/**
 * Internal helper for the Level 2 dedupe pass at the end of `computeDelta`.
 *
 * Walks `delta`, keeping at most one entry per `path`. Owner is chosen by
 * `pathSpecificity` (longest matching prefix from the component's `paths`),
 * with declaration order as the deterministic tie-breaker.
 *
 * Emits one `logger.step` line per evicted (path, loser) pair.
 */
function dedupeDeltaByPath(
  delta: DeltaEntry[],
  components: readonly Component[],
  componentIndex: Map<string, number>,
  logger: CoreLogger,
): DeltaEntry[] {
  const owned = new Map<string, DeltaEntry>();
  const evictions: { path: string, winner: string, loser: string }[] = [];

  for (const entry of delta) {
    const existing = owned.get(entry.path);
    if (!existing) { owned.set(entry.path, entry); continue; }

    const compA = components.find(c => c.name === existing.component);
    const compB = components.find(c => c.name === entry.component);
    if (!compA || !compB) {
      // Component lookup failed (stale registry / state) — keep the entry that
      // resolves to a known component; record the eviction so it isn't silent.
      if (!compA && compB) {
        evictions.push({ path: entry.path, winner: entry.component, loser: existing.component });
        owned.set(entry.path, entry);
      }
      else {
        evictions.push({ path: entry.path, winner: existing.component, loser: entry.component });
      }
      continue;
    }

    const specA = pathSpecificity(existing.path, compA);
    const specB = pathSpecificity(entry.path, compB);
    const idxA = componentIndex.get(existing.component) ?? Number.MAX_SAFE_INTEGER;
    const idxB = componentIndex.get(entry.component) ?? Number.MAX_SAFE_INTEGER;

    const newWins = specB > specA || (specB === specA && idxB < idxA);
    if (newWins) {
      evictions.push({ path: entry.path, winner: entry.component, loser: existing.component });
      owned.set(entry.path, entry);
    }
    else {
      evictions.push({ path: entry.path, winner: existing.component, loser: entry.component });
    }
  }

  for (const { path: p, winner, loser } of evictions) {
    logger.step(`Path '${p}' owned by '${winner}' (also matched by '${loser}' — evicted)`);
  }

  return [...owned.values()];
}

/**
 * Score a file path against a component's `paths` array. Returns the length
 * of the longest matching prefix; -1 if no path matches.
 *
 *   - `paths: ['.']` matches any path; specificity 0.
 *   - `paths: ['.claude']` matches `.claude/foo`; specificity 7.
 *   - `paths: ['.agents/skills']` matches `.agents/skills/foo`; specificity 14.
 *
 * Used by `dedupeDeltaByPath` to pick the most-specific owner when two
 * components both match a file.
 */
// ============================================================================
// DIRTY-TREE GUARD HELPERS (pure; exported for tests)
// ============================================================================

/**
 * Env var through which the parent process tells its self-update re-exec child
 * which repo-relative paths the updater ITSELF dirtied before spawning it
 * (cross-harness migration output, the refreshed CLI files). Newline-separated.
 */
export const UPDATER_OWNED_PATHS_ENV = 'UPEX_UPDATER_OWNED_PATHS';

/**
 * Env var through which the parent tells its self-update re-exec child which
 * upstream sha it refreshed the self-update component to. The child finds
 * those files identical to upstream and walks no entry for the component, so
 * without this the `cli` lock cursor never advanced past the release the
 * project was scaffolded at. See `selfUpdatedComponents`.
 */
export const UPDATER_SELF_UPDATED_ENV = 'UPEX_UPDATER_SELF_UPDATED';

/**
 * Env var through which the parent tells its self-update re-exec child which
 * confirmations the person already gave (comma-separated keys), so the child
 * does not ask them again: it re-runs `runUpdate` from the top.
 */
export const UPDATER_CONFIRMED_ENV = 'UPEX_UPDATER_CONFIRMED';

/** True when the parent process of a re-exec already got a yes for `key`. */
export function confirmedByParent(key: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.UPEX_UPDATER_REEXEC !== '1') { return false; }
  return (env[UPDATER_CONFIRMED_ENV] ?? '').split(',').includes(key);
}

/** Records a yes in this process's env, which a re-exec child inherits. */
function rememberConfirmed(key: string): void {
  const keys = new Set((process.env[UPDATER_CONFIRMED_ENV] ?? '').split(',').filter(Boolean));
  keys.add(key);
  process.env[UPDATER_CONFIRMED_ENV] = [...keys].join(',');
}

/**
 * The self-update component when the parent process refreshed it to exactly
 * `newHeadSha` before re-exec'ing us: it has no delta entry left to advance
 * its cursor through, yet it IS at upstream HEAD, so the lock must say so.
 * Empty when there was no self-update, or when upstream moved between the
 * parent's fetch and ours (the files then differ again and sync as ordinary
 * entries, which advance the cursor the usual way).
 */
export function selfUpdatedComponents(
  cfg: Pick<UpdaterConfig, 'selfUpdateComponent'>,
  newHeadSha: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const refreshed = env[UPDATER_SELF_UPDATED_ENV];
  if (!cfg.selfUpdateComponent || !refreshed || refreshed !== newHeadSha) { return []; }
  return [cfg.selfUpdateComponent];
}

/**
 * Fallback for the first self-update from a pre-8.1 parent (7.x): that code
 * predates `UPEX_UPDATER_SELF_UPDATED`, so it re-execs the child on
 * `UPEX_UPDATER_REEXEC=1` alone, without the sha it just wrote `cli/` at.
 * `selfUpdatedComponents` then sees nothing and the lock cursor never moves
 * past the scaffold release, forever.
 *
 * The re-exec child detects the same fact independently: it walks the
 * self-update component's own file list and compares each one's content
 * against the fetched upstream by blob SHA (same mechanism the parent uses
 * before writing `cli/`, see the SELF-UPDATE block). Every file identical, and
 * the lock's prior cursor for the component is not already at `newHeadSha`,
 * settles the component there, same effect as the env signal.
 *
 * Only meaningful in the re-exec child: a fresh (non-re-exec) process has no
 * reason to believe a self-update just happened, so it returns `[]` there too.
 * Invariant: the `--dry-run` preview's own re-exec (see the SELF-UPDATE block's
 * `opts.dryRun` branch) never writes `cli/` before re-executing, so local
 * content there still differs from upstream and this never settles the
 * cursor from a preview run.
 */
export function selfUpdateComponentByContent(
  cfg: Pick<UpdaterConfig, 'components' | 'selfUpdateComponent'>,
  templateDir: string,
  repoRoot: string,
  newHeadSha: string,
  priorCursor: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (env.UPEX_UPDATER_REEXEC !== '1' || !cfg.selfUpdateComponent) { return []; }
  if (!priorCursor || priorCursor === newHeadSha) { return []; }
  const selfComp = cfg.components.find(c => c.name === cfg.selfUpdateComponent);
  if (!selfComp) { return []; }
  const relPaths = collectComponentRelPaths(selfComp, templateDir);
  if (relPaths.length === 0) { return []; }
  const pathspecs = selfComp.type === 'file-list' ? relPaths : selfComp.paths;
  const upstreamShas = batchUpstreamShas(templateDir, pathspecs);
  const localShas = batchLocalShas(repoRoot, relPaths);
  const identical = relPaths.every((relPath) => {
    const upstreamSha = upstreamShas.get(relPath);
    const localSha = localShas.get(relPath);
    return upstreamSha !== undefined && localSha !== undefined && upstreamSha === localSha;
  });
  return identical ? [cfg.selfUpdateComponent] : [];
}

/**
 * Where a run records what it wrote. Gitignored. A sync deliberately leaves
 * its output uncommitted (the parity prompt is reviewed first), so the NEXT
 * run's dirty-tree guard must recognise that output as its own: a dirty path
 * whose current sha256 equals the recorded one was not edited by the user and
 * is exempt. Anything else (an unrelated file, or a synced file the user
 * edited since) still aborts. See `splitByLastApply`.
 */
export const LAST_APPLY_FILE = '.template/last-apply.json';

/** The single-character C escapes git emits inside a quoted path, to their byte. */
const C_ESCAPE_BYTES: Record<string, number> = {
  'a': 0x07,
  'b': 0x08,
  'f': 0x0C,
  'n': 0x0A,
  'r': 0x0D,
  't': 0x09,
  'v': 0x0B,
  '\\': 0x5C,
  '"': 0x22,
};

/**
 * Decode the body of a git C-quoted path (`core.quotepath`, ON by default):
 * any path with a space, a control character or a byte above 0x7f comes back
 * wrapped in double quotes with its bytes escaped.
 *
 * The `\NNN` escapes are octal BYTES of the UTF-8 encoding, not characters, so
 * they are collected into a buffer and decoded once at the end — otherwise
 * `configuraci\303\263n.md` yields two replacement characters instead of `ó`.
 */
function decodeCQuotedPath(body: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') { bytes.push(...Buffer.from(ch, 'utf8')); continue; }
    const next = body[i + 1];
    if (next === undefined) { bytes.push(0x5C); break; } // trailing lone backslash
    const simple = C_ESCAPE_BYTES[next];
    if (simple !== undefined) { bytes.push(simple); i += 1; continue; }
    const octal = /^[0-7]{1,3}/.exec(body.slice(i + 1))?.[0];
    if (octal !== undefined) { bytes.push(Number.parseInt(octal, 8) & 0xFF); i += octal.length; continue; }
    bytes.push(0x5C); // unknown escape: keep the backslash, re-read the next char
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Paths named by `git status --porcelain` output. Renames (`R  old -> new`)
 * report BOTH sides: either one being foreign is reason enough to stop.
 * Tolerates a line whose leading status column was trimmed away
 * (` D path` -> `D path`).
 *
 * A QUOTED path is C-unescaped (see `decodeCQuotedPath`). An unquoted one is
 * already literal and is left exactly as it came: porcelain emits forward
 * slashes on every platform, so a backslash there belongs to the filename.
 */
export function parsePorcelainPaths(porcelain: string): string[] {
  const out: string[] = [];
  for (const raw of porcelain.split('\n')) {
    if (raw.trim() === '') { continue; }
    // `XY <path>`: two status columns, one space, then the path. A line whose
    // leading column was trimmed away (`D path`) has one column, then a space.
    let rest: string;
    if (raw.length > 3 && raw[2] === ' ') { rest = raw.slice(3); }
    else if (raw.length > 2 && raw[1] === ' ') { rest = raw.slice(2); }
    else { rest = raw.trim(); }
    for (const side of rest.split(' -> ')) {
      const trimmed = side.trim();
      const quoted = /^"(.*)"$/.exec(trimmed)?.[1];
      const path = quoted === undefined ? trimmed : decodeCQuotedPath(quoted);
      if (path !== '') { out.push(path); }
    }
  }
  return out;
}

/**
 * Dirty paths that are NOT confined to `exemptPrefixes` (exact path or
 * directory prefix at a segment boundary). These are the ones the guard must
 * still refuse: work the user has not committed. Everything under an exempt
 * prefix was produced by the updater itself.
 */
export function foreignDirtyPaths(porcelain: string, exemptPrefixes: string[]): string[] {
  return parsePorcelainPaths(porcelain).filter(p => !isRepoOnlyPath(p, exemptPrefixes));
}

/** Repo-relative paths a component owns: file-list literals or directory trees. */
export function componentOwnedPaths(component: Component): string[] {
  const claim = componentClaims(component);
  return [...claim.literals, ...claim.trees].map(p => p.replace(/\\/g, '/'));
}

/**
 * Paths whose dirtiness the guard ignores because the updater wrote them:
 *
 *  - the lock file, `.backups/` and the last-apply record, always: all three
 *    are updater-owned, and a lock left uncommitted by the previous run is
 *    not the user's work;
 *  - whatever the wrapper reports as its own preflight output
 *    (`opts.updaterOwnedPaths`, e.g. the cross-harness migration), plus the
 *    same list handed down by a parent process through UPDATER_OWNED_PATHS_ENV;
 *  - in the self-update re-exec child ONLY (`UPEX_UPDATER_REEXEC=1`): the
 *    self-update component's own paths. The parent refreshed those files
 *    moments ago and re-launched us on purpose; refusing to continue over them
 *    is what forced downstream projects to reach for `--force` after every CLI
 *    release.
 *
 * Never exempts anything else: a genuinely uncommitted user file still aborts.
 */
export function dirtyTreeExemptions(
  cfg: Pick<UpdaterConfig, 'components' | 'selfUpdateComponent' | 'versionFile'>,
  opts: { updaterOwnedPaths?: string[] },
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  // The last-apply record is updater-owned like the lock (and gitignored once
  // the synced `.gitignore` line lands; exempt either way).
  const exempt = new Set<string>([cfg.versionFile, '.backups', LAST_APPLY_FILE, ...(opts.updaterOwnedPaths ?? [])]);
  for (const p of (env[UPDATER_OWNED_PATHS_ENV] ?? '').split('\n')) {
    if (p.trim() !== '') { exempt.add(p.trim()); }
  }
  if (env.UPEX_UPDATER_REEXEC === '1' && cfg.selfUpdateComponent) {
    const selfComp = cfg.components.find(c => c.name === cfg.selfUpdateComponent);
    if (selfComp) { for (const p of componentOwnedPaths(selfComp)) { exempt.add(p); } }
  }
  return [...exempt];
}

/**
 * True when the sync could WRITE `relPath`: it sits inside a component the run
 * syncs (file-list literal or directory tree), or it is an ignore file, a
 * `package.json` spec, or a deprecated file. Never true for a path the sync
 * refuses to touch: a bootstrap-only component, a bootstrap-only path (the
 * protected watchlist inside a synced component), an excluded path, or the
 * boilerplate's own material.
 *
 * The dirty-tree guard blocks ONLY on user work inside this surface: those
 * files would be overwritten and their pre-write backup lives in `.backups/`
 * (gitignored). Uncommitted work anywhere else (`tests/` outside the
 * `tests-utils` helpers, project code, a protected file) is listed and never
 * blocks: the sync does not write there.
 */
export function isWithinWriteSurface(
  cfg: Pick<UpdaterConfig, 'components' | 'ignoreFiles' | 'packageJsonSpecs' | 'deprecatedFiles' | 'excludePaths' | 'repoOnlyPaths' | 'repoOnlyPatterns' | 'bootstrapOnlyPaths'>,
  relPath: string,
): boolean {
  const p = relPath.replace(/\\/g, '/');
  const never = new Set([...(cfg.excludePaths ?? []), ...cfg.bootstrapOnlyPaths].map(x => x.replace(/\\/g, '/')));
  if (never.has(p) || isRepoOnlyForRun(cfg, p)) { return false; }
  if (isProjectLocalSkillPath(p)) { return false; } // a consumer's `<aspect>-context/`: never written by the sync
  const exact = new Set<string>([
    ...cfg.ignoreFiles.map(ig => ig.path),
    ...(cfg.packageJsonSpecs ?? []).map(spec => spec.path),
    ...cfg.deprecatedFiles.map(dep => dep.path),
  ].map(x => x.replace(/\\/g, '/')));
  if (exact.has(p)) { return true; }
  for (const c of cfg.components) {
    if (c.bootstrapOnly) { continue; }
    if (isRepoOnlyPath(p, componentOwnedPaths(c))) { return true; }
  }
  return false;
}

// ============================================================================
// LAST-APPLY RECORD (re-run safety after an uncommitted sync)
// ============================================================================

export interface LastApplyRecord {
  upstreamSha: string
  writtenAt: string
  /** The commit message the closing box suggested for that sync. */
  suggestedCommit: string
  /** Repo-relative path of the saved parity prompt, or null when the run had no findings. */
  promptFile: string | null
  /** Repo-relative path -> sha256 of the content written, or null for a path the run deleted / unindexed. */
  files: Record<string, string | null>
}

/** sha256 (hex) of a file's bytes, or null when it does not exist / is not a plain file. */
export function sha256File(absPath: string): string | null {
  try {
    if (!fs.statSync(absPath).isFile()) { return null; }
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(fs.readFileSync(absPath));
    return hasher.digest('hex');
  }
  catch {
    return null;
  }
}

export function readLastApply(repoRoot: string): LastApplyRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(repoRoot, LAST_APPLY_FILE), 'utf8')) as Partial<LastApplyRecord>;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.files !== 'object' || parsed.files === null) { return null; }
    return {
      upstreamSha: typeof parsed.upstreamSha === 'string' ? parsed.upstreamSha : '',
      writtenAt: typeof parsed.writtenAt === 'string' ? parsed.writtenAt : '',
      suggestedCommit: typeof parsed.suggestedCommit === 'string' ? parsed.suggestedCommit : '',
      promptFile: typeof parsed.promptFile === 'string' ? parsed.promptFile : null,
      files: parsed.files,
    };
  }
  catch {
    return null;
  }
}

/**
 * Record `paths` (repo-relative, as `git status` names them) with the sha256 of
 * what is on disk right now. Non-fatal: without the record the next run simply
 * falls back to the plain guard.
 */
export function writeLastApply(
  repoRoot: string,
  paths: readonly string[],
  meta: { upstreamSha: string, suggestedCommit: string, promptFile: string | null },
): LastApplyRecord | null {
  const files: Record<string, string | null> = {};
  for (const p of [...new Set(paths)].sort()) { files[p] = sha256File(path.join(repoRoot, p)); }
  const record: LastApplyRecord = { ...meta, writtenAt: new Date().toISOString(), files };
  try {
    const out = path.join(repoRoot, LAST_APPLY_FILE);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }
  catch {
    return null;
  }
}

/**
 * Split the guard's foreign dirty paths into the ones the last run wrote and
 * nobody touched since (same sha256 now, or deleted then and still absent) and
 * the ones that are genuinely the user's (unrecorded, or recorded with a
 * different hash).
 */
export function splitByLastApply(
  foreign: readonly string[],
  record: LastApplyRecord | null,
  repoRoot: string,
): { recorded: string[], userOwned: string[] } {
  if (!record) { return { recorded: [], userOwned: [...foreign] }; }
  const recorded: string[] = [];
  const userOwned: string[] = [];
  for (const p of foreign) {
    const expected = record.files[p];
    if (expected !== undefined && sha256File(path.join(repoRoot, p)) === expected) { recorded.push(p); }
    else { userOwned.push(p); }
  }
  return { recorded, userOwned };
}

// ============================================================================
// LOCAL EDITS (3-way: local vs the upstream copy at the lock cursor)
// ============================================================================

/**
 * Among the reconciled entries (every synced file whose local bytes differ
 * from upstream HEAD), the ones the PROJECT edited: local also differs from
 * the upstream copy at the component's lock cursor. A file that merely lags
 * upstream (local == old upstream) is a fast-forward, not an edit.
 *
 * Per component, `git diff --name-only <cursor> HEAD` (tree-level, no blobs)
 * says which paths upstream changed since the lock:
 *   - not changed upstream: local != HEAD == old upstream, so the project edited it;
 *   - changed upstream: `computeDelta` already byte-compared local against the
 *     old blob (`classifyFile`), so its verdict is reused.
 * A component whose cursor git cannot diff (unreachable sha) yields nothing,
 * and so does a path upstream ADDED after the cursor (no base copy): unknown
 * is never reported as an edit.
 */
export function detectLocalEdits(
  templateDir: string,
  components: readonly Component[],
  perComponentCommit: Readonly<Record<string, string>>,
  deltaEntries: readonly DeltaEntry[],
  reconciled: readonly DeltaEntry[],
  localRepoRoot: string,
): Set<string> {
  const edited = new Set<string>();
  const delta = new Map(deltaEntries.map(e => [e.path, e] as const));
  for (const component of components) {
    const cursor = perComponentCommit[component.name];
    if (!cursor) { continue; }
    let changedUpstream: Set<string>;
    try {
      const pathArgs = component.paths.map(p => `"${p}"`).join(' ');
      const out = execSync(`git -C "${templateDir}" diff --name-only ${cursor} HEAD -- ${pathArgs}`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
      changedUpstream = new Set(out.split('\n').map(l => l.trim()).filter(l => l !== ''));
    }
    catch {
      continue;
    }
    for (const entry of reconciled) {
      if (entry.component !== component.name || entry.classification !== 'locally-diverged') { continue; }
      if (!fs.existsSync(path.join(localRepoRoot, entry.path))) { continue; }
      if (!changedUpstream.has(entry.path)) { edited.add(entry.path); continue; }
      const d = delta.get(entry.path);
      // Added upstream since the cursor: there is no base copy to compare the
      // project's bytes against, so "edited" cannot be told from "arrived
      // another way" (a migrated Claude-era repo has every skill in this
      // state, moved from `.claude/skills/` by the preflight). Unknown is
      // never reported as an edit.
      if (!d || d.status === 'A' || d.templateOldSha === null) { continue; }
      if (d.classification === 'locally-diverged') { edited.add(entry.path); }
    }
  }
  return edited;
}

// ============================================================================
// COMPONENT REGISTRY VALIDATION (Level 3 — fatal at startup)
// ============================================================================

interface ComponentClaim {
  name: string
  literals: string[] // exact path strings this component owns (file-list)
  trees: string[] // directory trees this component owns wholesale
}

/**
 * Compute the effective path claims of a component.
 *
 *  - `'file-list'`            → `literals` only; each entry resolved against the
 *    component's first declared `paths` element (or treated as root-level when
 *    that path is `'.'`).
 *  - `'directory'` / `'mixed'` → `trees` only; the component owns each declared
 *    path and everything below it.
 */
function componentClaims(c: Component): ComponentClaim {
  if (c.type === 'file-list') {
    const root = c.paths[0];
    const files = c.files ?? [];
    const literals = files.map((f) => {
      if (root === '.' || root === undefined) { return f; }
      return `${root}/${f}`;
    });
    return { name: c.name, literals, trees: [] };
  }
  return { name: c.name, literals: [], trees: [...c.paths] };
}

/**
 * Return true if `literal` falls inside `tree` (or is `tree` itself, or `tree`
 * is the repo root `'.'`).
 */
function literalInsideTree(literal: string, tree: string): boolean {
  if (tree === '.') { return true; }
  return literal === tree || literal.startsWith(`${tree}/`);
}

/**
 * Return true if directory trees `a` and `b` overlap — i.e. one is the other,
 * one is a prefix of the other, or either is the repo root.
 */
function treesOverlap(a: string, b: string): boolean {
  if (a === '.' || b === '.') { return true; }
  if (a === b) { return true; }
  return a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/**
 * Find an overlapping path between two component claims, or null when they are
 * disjoint. Inspects all four cross-products: literal ∩ literal,
 * literal ⊂ tree (both directions), and tree ∩ tree.
 */
function findOverlap(a: ComponentClaim, b: ComponentClaim): string | null {
  for (const la of a.literals) {
    if (b.literals.includes(la)) { return la; }
  }
  for (const la of a.literals) {
    for (const tb of b.trees) {
      if (literalInsideTree(la, tb)) { return la; }
    }
  }
  for (const lb of b.literals) {
    for (const ta of a.trees) {
      if (literalInsideTree(lb, ta)) { return lb; }
    }
  }
  for (const ta of a.trees) {
    for (const tb of b.trees) {
      if (treesOverlap(ta, tb)) {
        // Report the more-specific tree as the overlap point.
        return ta.length > tb.length ? ta : tb;
      }
    }
  }
  return null;
}

/**
 * Validate a component registry at config-time. Throws `ComponentOverlapError`
 * on the first pair of components that claim ownership over the same path.
 *
 * Pure / no I/O — operates on `paths` + `files` + `type` only. Safe to call
 * before any clone or filesystem operation, so misconfigured registries fail
 * fast before consuming network or disk resources.
 */
export function validateComponentRegistry(components: readonly Component[]): void {
  const claims = components.map(componentClaims);
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const overlap = findOverlap(claims[i], claims[j]);
      if (overlap !== null) {
        throw new ComponentOverlapError(
          `Componentes '${claims[i].name}' y '${claims[j].name}' se solapan en '${overlap}'. `
          + 'Ajusta \'paths\' / \'files\' para que cada ruta tenga un único dueño.',
        );
      }
    }
  }
}

export function pathSpecificity(filePath: string, component: Component): number {
  let best = -1;
  for (const p of component.paths) {
    if (p === '.') {
      best = Math.max(best, 0);
      continue;
    }
    if (filePath === p || filePath.startsWith(`${p}/`)) {
      best = Math.max(best, p.length);
    }
  }
  return best;
}

// ============================================================================
// APPLY PRIMITIVES
// ============================================================================

/**
 * Append a RESTORE.txt manifest to the backup directory.
 * Records timestamp, SHAs, and one line per entry with status/classification/resolution/path.
 * Includes the prior sync state as base64 for full rollback.
 */
export function appendBackupManifest(
  backupDir: string,
  entries: DeltaEntry[],
  state: SyncStateV6,
  cliVersion: string,
): void {
  const lines: string[] = [
    '# update-boilerplate rollback manifest',
    `timestamp: ${new Date().toISOString()}`,
    `priorTemplateCommit: ${state.templateCommit || 'none'}`,
    `newTemplateCommit: ${state.templateCommit}`,
    `cliVersion: ${cliVersion}`,
    '',
    '# entries: <status> <classification> <resolution> <path>',
  ];

  for (const entry of entries) {
    lines.push(`${entry.status} ${entry.classification} applied ${entry.path}`);
  }

  // Encode prior state JSON as base64 for rollback
  const priorJson = JSON.stringify(state, null, 2);
  const priorBase64 = Buffer.from(priorJson).toString('base64');
  lines.push('');
  lines.push(`PRIOR_STATE_JSON_BASE64:${priorBase64}`);

  fs.writeFileSync(path.join(backupDir, 'RESTORE.txt'), `${lines.join('\n')}\n`);
}

/**
 * Apply a single resolution to a delta entry.
 * ALWAYS backs up the existing local file BEFORE any write/delete (pre-write backup).
 *
 * Resolutions:
 *   - 'theirs': write template-new blob bytes to local path (raw upstream bytes)
 *   - 'mine':   no-op (local file already preserved)
 *   - 'skip':   no-op
 *   - 'delete': rmSync local file (after backup)
 *   - 'keep':   no-op (deleted-upstream file kept locally)
 *
 * `dryRun: true` logs what would happen but makes no FS writes.
 *
 * Logging is delegated to the caller via `logger`; preserves the original
 * "Aplicado: …", "Conservado: …", "Saltado: …", "Eliminado: …", "[dry-run] aplicaría: …",
 * "[dry-run] eliminaría: …" lines.
 */
export async function applyResolution(
  entry: DeltaEntry,
  resolution: 'theirs' | 'mine' | 'skip' | 'delete' | 'keep',
  templateDir: string,
  localRepoRoot: string,
  backupDir: string,
  dryRun = false,
  logger: CoreLogger = silentLogger,
): Promise<void> {
  const localPath = path.join(localRepoRoot, entry.path);

  // Pre-write backup for destructive resolutions
  if (!dryRun && (resolution === 'theirs' || resolution === 'delete') && fs.existsSync(localPath)) {
    const backupPath = path.join(backupDir, entry.path);
    fs.mkdirSync(path.join(backupPath, '..'), { recursive: true });
    fs.cpSync(localPath, backupPath);
  }

  try {
    switch (resolution) {
      case 'theirs': {
        if (!entry.templateNewSha) {
          throw new Error(`Sin templateNewSha para ${entry.path} — no se puede aplicar 'theirs'`);
        }
        if (dryRun) {
          logger.info(`[dry-run] aplicaría: ${entry.path}`);
          break;
        }
        // Write raw upstream bytes (not normalized)
        const templateBytes = execSync(
          `git -C "${templateDir}" show ${entry.templateNewSha}`,
          { stdio: ['pipe', 'pipe', 'pipe'] },
        );
        fs.mkdirSync(path.join(localPath, '..'), { recursive: true });
        fs.writeFileSync(localPath, templateBytes);
        logger.success(`Aplicado: ${entry.path}`);
        break;
      }
      case 'mine':
        logger.info(`Conservado (mine): ${entry.path}`);
        break;
      case 'skip':
        logger.info(`Saltado: ${entry.path}`);
        break;
      case 'delete':
        if (dryRun) {
          logger.info(`[dry-run] eliminaría: ${entry.path}`);
          break;
        }
        fs.rmSync(localPath, { force: true });
        logger.success(`Eliminado: ${entry.path}`);
        break;
      case 'keep':
        logger.info(`Conservado (eliminado upstream, mantenido localmente): ${entry.path}`);
        break;
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`applyResolution falló para ${entry.path} (${resolution}): ${msg}`);
  }
}

// ============================================================================
// DIFF RENDERERS
// ============================================================================

/**
 * Render a colorized unified diff of template changes: template-old → template-new.
 * For status=A (no old blob), uses the empty-tree SHA as the old side.
 */
export function renderTemplateDiff(entry: DeltaEntry, repoDir: string): string {
  // New-upstream entries (bootstrap / first-time files) carry a BLOB sha in
  // templateNewSha and have no templateOldSha. `git diff <empty-tree> <blob>`
  // is invalid (needs tree↔tree or blob↔blob), so we show the blob content
  // directly — which is what the user actually wants for new files.
  if (!entry.templateOldSha && entry.templateNewSha) {
    try {
      return execSync(
        `git -C "${repoDir}" show ${entry.templateNewSha}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch {
      return `(could not read upstream content for ${entry.path})\n`;
    }
  }

  const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const oldRef = entry.templateOldSha || EMPTY_TREE;
  const newRef = entry.templateNewSha || EMPTY_TREE;

  try {
    return execSync(
      `git -C "${repoDir}" diff --color=always ${oldRef} ${newRef}`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString();
  }
  catch {
    return `(could not render template diff for ${entry.path})\n`;
  }
}

/**
 * Render a colorized unified diff of local changes: template-old → local-current.
 * Writes the template-old blob to a tmp file, then uses `git diff --no-index`.
 * ALWAYS cleans up the tmp file in a finally block.
 */
export function renderLocalDiff(entry: DeltaEntry, repoDir: string, localRepoRoot: string): string {
  const localPath = path.join(localRepoRoot, entry.path);

  if (!fs.existsSync(localPath)) {
    return `(local file does not exist: ${entry.path})\n`;
  }

  if (!entry.templateOldSha) {
    return `(no template-old blob available for ${entry.path})\n`;
  }

  const tmpPath = path.join(os.tmpdir(), `upex-diff-old-${process.pid}-${Date.now()}`);

  try {
    const blobBytes = execSync(
      `git -C "${repoDir}" show ${entry.templateOldSha}`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    fs.writeFileSync(tmpPath, blobBytes);

    try {
      return execSync(
        `git diff --no-index --color=always "${tmpPath}" "${localPath}"`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch (diffErr) {
      // git diff --no-index exits non-zero when files differ — expected
      const err = diffErr as { stdout?: Buffer | string };
      if (err.stdout) {
        return err.stdout.toString();
      }
      return `(could not render local diff for ${entry.path})\n`;
    }
  }
  catch {
    return `(could not retrieve template-old blob for ${entry.path})\n`;
  }
  finally {
    try {
      fs.rmSync(tmpPath, { force: true });
    }
    catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// AUTO-MODE PLANNING (pure)
// ============================================================================

/**
 * Build the non-interactive apply plan from a set of delta entries.
 *
 * Upstream is canonical for framework files: new + diverged files are ALWAYS
 * applied with 'theirs' (full overwrite), regardless of mode. `forceMode` only
 * controls the one destructive edge — deleting files upstream removed:
 *
 * Both modes:
 *   - clean-fastforward → apply 'theirs'
 *   - new-upstream      → apply 'theirs' (copy)
 *   - locally-diverged  → apply 'theirs' (OVERWRITE local with upstream)
 *   - binary-skip       → skip
 *
 * `--auto` (forceMode = false):  deleted-upstream → deferred (never delete)
 * `--force` (forceMode = true):  deleted-upstream → apply 'delete'
 *
 * `unchanged` is excluded in both modes (filtered upstream). A backup is taken
 * before any destructive write, so every overwrite/delete is reversible via
 * --rollback.
 */
export function planAuto(
  entries: DeltaEntry[],
  forceMode = false,
): { plan: AppliedFile[], deferred: DeltaEntry[] } {
  const plan: AppliedFile[] = [];
  const deferred: DeltaEntry[] = [];

  for (const entry of entries) {
    switch (entry.classification) {
      case 'clean-fastforward':
      case 'new-upstream':
        plan.push({ entry, resolution: 'theirs' });
        break;
      case 'locally-diverged':
        // Upstream canonical — overwrite local divergence in every mode.
        plan.push({ entry, resolution: 'theirs' });
        break;
      case 'deleted-upstream':
        if (forceMode) { plan.push({ entry, resolution: 'delete' }); }
        else { deferred.push(entry); }
        break;
      case 'binary-skip':
        plan.push({ entry, resolution: 'skip' });
        break;
      case 'unchanged':
        // Should not appear here — filtered upstream
        break;
    }
  }

  return { plan, deferred };
}

/**
 * Compute componentsAdvanced / componentsHeldBack from an in-flight summary.
 * A component "advances" only when none of its entries were skipped or failed.
 *
 * `deferredEntries` (deleted-upstream files held back in auto-mode) also block advancement
 * because the delete hasn't been confirmed yet.
 *
 * `settledComponents` are the components that advance WITHOUT an entry of
 * their own: the ones this run bootstrapped (no lock cursor yet) that had
 * nothing to deliver, e.g. a bootstrap-only file the project already owns
 * (`.claude/settings.json`, `.codex/config.toml`), and the self-update
 * component the parent process refreshed to this very sha before re-exec'ing
 * (`selfUpdatedComponents`). Either way the lock must learn the sha, or every
 * later run repeats "bootstrap parcial" / keeps `cli` at the scaffold release.
 */
export function computeComponentAdvancement(
  summary: {
    applied: AppliedFile[]
    skipped: DeltaEntry[]
    failed: FailedFile[]
  },
  deferredEntries: DeltaEntry[] = [],
  settledComponents: readonly string[] = [],
): { componentsAdvanced: string[], componentsHeldBack: string[] } {
  const allEntryComponents = new Set([
    ...summary.applied.map(a => a.entry.component),
    ...summary.skipped.map(s => s.component),
    ...summary.failed.map(f => f.entry.component),
    ...deferredEntries.map(d => d.component),
  ]);
  const blockedComponents = new Set([
    ...summary.skipped.map(s => s.component),
    ...summary.failed.map(f => f.entry.component),
  ]);
  const settled = settledComponents.filter(c => !allEntryComponents.has(c));
  return {
    componentsAdvanced: [...allEntryComponents, ...settled].filter(c => !blockedComponents.has(c)),
    componentsHeldBack: [...blockedComponents],
  };
}

/**
 * Components whose lock cursor is behind `newHeadSha` but that have nothing to
 * deliver at it: no entry of theirs in `visible` (the run's user-facing delta,
 * `unchanged` / `binary-skip` already filtered out). The content reconcile walks
 * the full upstream tree, so "no visible entry" means the project already holds
 * this head's copy; the cursor moves without an entry, like a settled bootstrap.
 *
 * Live finding: a sync that advanced 13 components left the other 9 (no delta)
 * at the old cursor, so the top-level `templateCommit`, which advances only when
 * EVERY component sits at the new head, stayed releases behind forever. A
 * component with a visible entry is never listed here, whatever happens to it
 * (a deselected scope, a skipped file): its delta is still pending.
 */
export function componentsWithoutDelta(
  components: readonly Component[],
  visible: readonly DeltaEntry[],
  perComponentCommit: Readonly<Record<string, string>>,
  newHeadSha: string,
): string[] {
  const withDelta = new Set(visible.map(e => e.component));
  return components
    .filter((c) => {
      const cursor = perComponentCommit[c.name];
      return cursor !== undefined && cursor !== newHeadSha && !withDelta.has(c.name);
    })
    .map(c => c.name);
}

// ============================================================================
// SYNC-STATE WRITEBACK (pure)
// ============================================================================

/**
 * Suggest a semantic commit message post-sync. Printed as advisory — never auto-committed.
 */
export function suggestCommitMessage(summary: RunSummary): string {
  return `chore(boilerplate): sync to ${summary.newHeadSha.slice(0, 7)}`;
}

/**
 * Pure function — advances perComponentCommit SHAs based on the run summary.
 *
 * Rules:
 *   - For each component that appeared in the delta:
 *     - If ANY entry in summary.skipped or summary.failed belongs to that component
 *       → keep prior perComponentCommit[component] (re-offered on next run)
 *     - Else → advance to newHeadSha
 *   - Components untouched this run → prior value preserved
 *   - Top-level templateCommit advances to newHeadSha ONLY if ALL components advanced
 *
 * A component with no delta at the new head is not "untouched": the caller
 * lists it in `componentsAdvanced` (`componentsWithoutDelta`, passed as a
 * settled component), or `templateCommit` could never reach the head.
 */
export function advanceSyncState(
  prior: SyncStateV6,
  summary: RunSummary,
  components: readonly Component[],
  newHeadSha: string,
  cliVersion: string,
): SyncStateV6 {
  const next: SyncStateV6 = {
    ...prior,
    lastSync: new Date().toISOString(),
    cliVersion,
    perComponentCommit: { ...prior.perComponentCommit },
  };

  // Advance SHAs per componentsAdvanced list
  const advancedSet = new Set(summary.componentsAdvanced);
  for (const name of advancedSet) {
    next.perComponentCommit[name] = newHeadSha;
  }

  // Top-level templateCommit advances only if every component advanced
  const allAdvanced = components.every(
    c => next.perComponentCommit[c.name] === newHeadSha,
  );
  next.templateCommit = allAdvanced ? newHeadSha : prior.templateCommit;

  return next;
}

// ============================================================================
// AUTO / INTERACTIVE MODE DETECTION (pure)
// ============================================================================

/**
 * Returns true if the CLI should run in non-interactive (auto/CI) mode.
 * Inputs are read from the supplied flags object + the current process env;
 * pulling these out lets tests stub them deterministically.
 */
export function isNonInteractive(flags: { auto: boolean }): boolean {
  if (flags.auto) { return true; }
  if (process.env.CI === 'true') { return true; }
  if (!process.stdin.isTTY) { return true; }
  return false;
}

// ============================================================================
// v6 ↔ v7 SCHEMA HELPERS (Phase B — v7 read/write surface)
// ============================================================================

/**
 * Type guard — v7 sync state.
 */
export function isV7State(s: SyncState | null): s is SyncStateV7 {
  return s !== null
    && typeof s === 'object'
    && 'schemaVersion' in s
    && (s as { schemaVersion?: number }).schemaVersion === 7;
}

/**
 * Type guard — v6 sync state.
 */
export function isV6State(s: SyncState | null): s is SyncStateV6 {
  return s !== null
    && typeof s === 'object'
    && 'schemaVersion' in s
    && (s as { schemaVersion?: number }).schemaVersion === 6;
}

/**
 * Type guard — v5 sync state (legacy boolean variableSystemVersion).
 */
export function isV5State(s: SyncState | null): s is SyncStateV5 {
  return s !== null
    && typeof s === 'object'
    && !('schemaVersion' in s)
    && 'templateCommit' in s;
}

/**
 * Promote a v6 state in-memory to v7. Adds empty `ignoreFileSync`, renames
 * `lastSync` → `lastSyncedAt`, and bumps schema version.
 *
 * Pure — does NOT write to disk. The caller persists v7 only on successful sync
 * (atomic write at end of Phase 5).
 */
export function migrateV6ToV7(old: SyncStateV6, templateRepo: string, cliVersion: string): SyncStateV7 {
  return {
    schemaVersion: 7,
    templateRepo,
    templateCommit: old.templateCommit,
    perComponentCommit: { ...old.perComponentCommit },
    syncedComponents: [...old.syncedComponents],
    ignoreFileSync: {},
    cliVersion,
    lastSyncedAt: old.lastSync,
    variableSystemVersion: old.variableSystemVersion,
  };
}

/**
 * Atomic write of SyncStateV7 to the lock file path (mirror of `writeSyncState`).
 */
export function writeSyncStateV7(
  repoRoot: string,
  versionFile: string,
  state: SyncStateV7,
  logger: CoreLogger = silentLogger,
): void {
  const finalPath = path.join(repoRoot, versionFile);
  const tmpPath = `${finalPath}.tmp.${process.pid}`;
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmpPath, finalPath);
  logger.success(`Version registrada en ${versionFile}`);
}

/** JSON with keys sorted at every level, so two states compare by content, not by key order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) { return `[${value.map(stableJson).join(',')}]`; }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * True when `next` carries something the lock on disk (`existing`, its raw
 * text, or null when absent) does not, `lastSyncedAt` excluded. A run that
 * applied nothing must leave the tree byte-identical: rewriting the lock only
 * to bump the timestamp dirties `git status` for no information.
 */
export function syncStateWriteNeeded(existing: string | null, next: SyncStateV7): boolean {
  if (existing === null) { return true; }
  let prior: unknown;
  try { prior = JSON.parse(existing); }
  catch { return true; }
  if (typeof prior !== 'object' || prior === null) { return true; }
  const withoutStamp = (o: object): Record<string, unknown> =>
    Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'lastSyncedAt'));
  return stableJson(withoutStamp(prior)) !== stableJson(withoutStamp(next));
}

/**
 * Advance perComponentCommit SHAs for a v7 state — mirror of `advanceSyncState`
 * (same rules, including the no-delta components the caller settles) but
 * preserves the v7-only `ignoreFileSync` block.
 */
export function advanceSyncStateV7(
  prior: SyncStateV7,
  summary: RunSummary,
  components: readonly Component[],
  newHeadSha: string,
  cliVersion: string,
): SyncStateV7 {
  const next: SyncStateV7 = {
    ...prior,
    lastSyncedAt: new Date().toISOString(),
    cliVersion,
    perComponentCommit: { ...prior.perComponentCommit },
    ignoreFileSync: { ...prior.ignoreFileSync },
    packageJsonSync: { ...(prior.packageJsonSync ?? {}) },
  };

  const advancedSet = new Set(summary.componentsAdvanced);
  for (const name of advancedSet) {
    next.perComponentCommit[name] = newHeadSha;
  }

  const allAdvanced = components.every(
    c => next.perComponentCommit[c.name] === newHeadSha,
  );
  next.templateCommit = allAdvanced ? newHeadSha : prior.templateCommit;

  return next;
}

// ============================================================================
// REPO ACQUISITION (Phase B — moved from wrapper)
// ============================================================================

/**
 * Partial clone of the template repository using sparse-checkout.
 * Falls back internally? NO — caller is responsible for the fallback decision
 * (the wrapper retries with a full shallow clone on partial-clone failure).
 *
 * Throws on any failure with a structured message. The caller (sink layer)
 * translates this into UX.
 */
export async function partialCloneTemplate(
  templateRepo: string,
  dest: string,
  allowedPaths: string[],
): Promise<void> {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  cloneTemplate(templateRepo, dest, ['--no-checkout'], !isLocalTemplateSource(templateRepo));

  try {
    execSync(`git -C "${dest}" sparse-checkout init --no-cone`, { stdio: ['pipe', 'pipe', 'pipe'] });
    const patterns = allowedPaths.map(p => `"${p}"`).join(' ');
    execSync(`git -C "${dest}" sparse-checkout set ${patterns}`, { stdio: ['pipe', 'pipe', 'pipe'] });
    execSync(`git -C "${dest}" checkout`, { stdio: ['pipe', 'pipe', 'pipe'] });
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`SPARSE_CHECKOUT_FAILED: ${msg}`);
  }
}

/**
 * Env var through which a parent process hands its child an upstream clone
 * that is ALREADY on disk (the `--dry-run` preview of a pending self-update
 * runs the freshly fetched updater against the parent's clone). The child
 * widens that clone's sparse-checkout to its own patterns instead of cloning
 * again, and leaves its cleanup to the parent.
 */
export const UPDATER_UPSTREAM_DIR_ENV = 'UPEX_UPDATER_UPSTREAM_DIR';

/** The pre-fetched upstream dir a parent handed down, when it exists. */
export function prefetchedUpstreamDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = env[UPDATER_UPSTREAM_DIR_ENV];
  return dir && fs.existsSync(path.join(dir, '.git')) ? dir : null;
}

/**
 * Re-apply the sparse-checkout of an existing partial clone with a (wider)
 * pattern set. A promisor clone fetches the missing blobs lazily.
 */
export function widenSparseCheckout(dest: string, allowedPaths: string[]): void {
  const patterns = allowedPaths.map(p => `"${p}"`).join(' ');
  execSync(`git -C "${dest}" sparse-checkout set ${patterns}`, { stdio: ['pipe', 'pipe', 'pipe'] });
  execSync(`git -C "${dest}" checkout`, { stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * Shallow clone fallback (no sparse-checkout). Used when partialCloneTemplate fails.
 */
export async function shallowCloneTemplate(templateRepo: string, dest: string): Promise<void> {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  cloneTemplate(templateRepo, dest, ['--depth', '1'], !isLocalTemplateSource(templateRepo));
}

/**
 * True when `templateRepo` names a LOCAL git repository (absolute or relative
 * path, or a `file://` URL) instead of a GitHub `OWNER/REPO` handle. Local
 * sources are cloned with plain `git clone` and need no `gh` session: this is
 * how the updater is exercised against an unpublished branch of the
 * boilerplate (`UPEX_TEMPLATE_REPO=/path/to/clone bun sync`).
 */
export function isLocalTemplateSource(templateRepo: string): boolean {
  return templateRepo.startsWith('file://')
    || path.isAbsolute(templateRepo)
    || /^[A-Z]:[\\/]/i.test(templateRepo)
    || /^\.{1,2}[\\/]/.test(templateRepo);
}

/**
 * Shared clone step for both acquisition strategies. GitHub handles go through
 * `gh repo clone` (which resolves the URL and reuses the `gh` credential);
 * local sources go straight to `git clone`. Partial-clone filters are only
 * requested from GitHub: a local clone hardlinks objects anyway and git prints
 * a warning for a filter the local transport ignores.
 */
function cloneTemplate(templateRepo: string, dest: string, gitArgs: string[], viaGh: boolean): void {
  if (viaGh) {
    // Verify gh auth (the wrapper has already done a pre-flight check, but the
    // window between that check and this clone can be long; re-check is cheap).
    try {
      execSync('gh auth status', { stdio: 'pipe' });
    }
    catch {
      throw new Error('GH_AUTH_MISSING');
    }
  }
  const filter = viaGh && gitArgs.includes('--no-checkout') ? ['--filter=blob:none'] : [];
  const command = viaGh
    ? `gh repo clone ${templateRepo} "${dest}" -- ${[...filter, ...gitArgs, '--quiet'].join(' ')}`
    : `git clone ${[...gitArgs, '--quiet'].join(' ')} "${templateRepo.replace(/^file:\/\//, '')}" "${dest}"`;
  try {
    execSync(command, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
  }
  catch (error) {
    const err = error as { killed?: boolean };
    if (err.killed) { throw new Error('CLONE_TIMEOUT'); }
    throw new Error('CLONE_FAILED');
  }
}

// ============================================================================
// BOOTSTRAP HELPERS (Phase B — moved from wrapper)
// ============================================================================

/**
 * Walk every plain-file path that lives under a component, relative to the
 * template clone root. Mirrors the `runBootstrapForComponents` helper that used
 * to live in the wrapper.
 */
function collectComponentRelPaths(component: Component, templateDir: string): string[] {
  const out: string[] = [];
  const componentPaths = component.type === 'file-list'
    ? (component.files ?? []).map((f) => {
        const root = component.paths[0];
        return root === '.' || root === undefined ? f : path.join(root, f);
      })
    : component.paths;

  for (const componentPath of componentPaths) {
    const srcPath = path.join(templateDir, componentPath);
    if (!fs.existsSync(srcPath)) { continue; }
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      const walk = (dir: string): void => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const full = path.join(dir, item.name);
          if (item.isDirectory()) { walk(full); }
          else {
            const rel = full.slice(templateDir.length + 1).replace(/\\/g, '/');
            if (isProjectLocalSkillPath(rel)) { continue; } // upstream never delivers a consumer's context skill
            out.push(rel);
          }
        }
      };
      walk(srcPath);
    }
    else {
      // Normalize separators so file-list / single-file components produce the same
      // forward-slash relPaths as the directory-walk branch above. Otherwise path.join's
      // backslashes on Windows break the git pathspecs used to bootstrap these files,
      // and they are silently skipped.
      out.push(componentPath.replace(/\\/g, '/'));
    }
  }
  return out;
}

/**
 * Build a synthetic DeltaEntry for a bootstrap file (status='A', new-upstream).
 */
function bootstrapEntry(component: string, relPath: string, templateDir: string): DeltaEntry {
  let templateNewSha: string | null = null;
  let added = 0;
  try {
    const lsOutput = execSync(
      `git -C "${templateDir}" ls-tree HEAD -- "${relPath}"`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString().trim();
    if (lsOutput) {
      const parts = lsOutput.split(/\s+/);
      templateNewSha = parts[2] ?? null;
    }
  }
  catch {
    templateNewSha = null;
  }
  if (templateNewSha) {
    try {
      const blob = execSync(
        `git -C "${templateDir}" show ${templateNewSha}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
      added = blob.length === 0 ? 0 : blob.split('\n').length - (blob.endsWith('\n') ? 1 : 0);
    }
    catch {
      added = 0;
    }
  }
  return {
    component,
    path: relPath,
    status: 'A',
    fromSha: '',
    toSha: templateNewSha ?? '',
    added,
    removed: 0,
    isBinary: false,
    templateOldSha: null,
    templateNewSha,
    classification: 'new-upstream',
  };
}

// ============================================================================
// BACKUP HELPER (Phase B — used by runUpdate)
// ============================================================================

/**
 * Create a timestamped backup directory under `.backups/update-<ISO>/`.
 * Components are copied wholesale (mirror of the wrapper's createBackup).
 * The backup directory path is returned; entries are populated as
 * applyResolution writes (pre-write backup contract).
 */
export function createBackupDir(repoRoot: string): string {
  // Full ISO timestamp (incl. milliseconds) + pid so two runs — or the
  // self-update backup and the apply backup within the same run — never collide
  // on one directory and overwrite each other's pre-write backups.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(repoRoot, '.backups', `update-${stamp}-${process.pid}`);
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

// ============================================================================
// PAIRED DIFF HELPER (Phase B — builds PairedDiff for sink consumption)
// ============================================================================

/**
 * Build a PairedDiff struct for an entry: template change + local change.
 */
export function buildPairedDiff(entry: DeltaEntry, templateDir: string, localRepoRoot: string): PairedDiff {
  return {
    templateDiff: renderTemplateDiff(entry, templateDir),
    localDiff: renderLocalDiff(entry, templateDir, localRepoRoot),
  };
}

// ============================================================================
// DEPRECATED FILES CLEANUP (Phase B — moved from wrapper)
// ============================================================================

/**
 * Remove the folders a deleted file left empty, walking up toward the repo
 * root and stopping at the first one that still holds anything. A retired
 * skill otherwise leaves `.agents/skills/<slug>/references/` behind, and a
 * skill folder with no SKILL.md fails skills:check.
 */
function pruneEmptyParents(repoRoot: string, relPath: string): void {
  let dir = path.dirname(path.join(repoRoot, relPath));
  const root = path.resolve(repoRoot);
  while (path.resolve(dir) !== root && path.resolve(dir).startsWith(root + path.sep)) {
    if (fs.readdirSync(dir).length > 0) { return; }
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

// ============================================================================
// SELF-UPDATE GUARDS
// ============================================================================

/**
 * What the self-update refreshes: every file of the self-update component that
 * differs from upstream (blob sha), minus the repo-only ones (they never
 * travel, `isRepoOnlyForRun`) and minus the protected ones the project has
 * (`selfUpdateKeptProtected`, listed apart so the run can name them).
 */
export function selfUpdatePlan(
  cfg: Pick<UpdaterConfig, 'repoOnlyPaths' | 'repoOnlyPatterns' | 'bootstrapOnlyPaths' | 'agentsFrameworkFiles'>,
  selfComp: Component,
  templateDir: string,
  repoRoot: string,
): { selfFiles: string[], stale: string[], keptProtected: string[] } {
  const selfFiles = collectComponentRelPaths(selfComp, templateDir).filter(relPath => !isRepoOnlyForRun(cfg, relPath));
  const differing: string[] = [];
  for (const relPath of selfFiles) {
    const localPath = path.join(repoRoot, relPath);
    let upstreamSha: string;
    try {
      upstreamSha = execSync(
        `git -C "${templateDir}" hash-object "${relPath}"`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString().trim();
    }
    catch {
      continue;
    }
    let localSha = '';
    if (fs.existsSync(localPath)) {
      try {
        localSha = execSync(
          `git hash-object "${localPath}"`,
          { stdio: ['pipe', 'pipe', 'pipe'] },
        ).toString().trim();
      }
      catch {
        localSha = '';
      }
    }
    if (localSha !== upstreamSha) {
      differing.push(relPath);
    }
  }
  const keptProtected = selfUpdateKeptProtected(differing, selfComp, cfg, repoRoot);
  return { selfFiles, stale: differing.filter(rel => !keptProtected.includes(rel)), keptProtected };
}

/**
 * The stale updater files the self-update may NOT overwrite: a bootstrap-only
 * path (`bootstrapOnlyPaths`, which carries `updater.protected_paths`) the
 * project already has. Bootstrap-only means "delivered once when missing", so a
 * missing protected file is still refreshed. The protected-drift row of the
 * parity table reports the kept copy, as it does for every other component.
 */
export function selfUpdateKeptProtected(
  stale: readonly string[],
  selfComp: Component,
  cfg: Pick<UpdaterConfig, 'bootstrapOnlyPaths' | 'agentsFrameworkFiles'>,
  repoRoot: string,
): string[] {
  return stale.filter(rel => fs.existsSync(path.join(repoRoot, rel))
    && isBootstrapOnlyFile(rel, selfComp, cfg.bootstrapOnlyPaths ?? [], cfg.agentsFrameworkFiles ?? []));
}

/**
 * Load the refreshed updater entry in a throwaway process without running it
 * (`import.meta.main` is false for an imported module; `UPEX_UPDATER_REEXEC=1`
 * is a second guard). A refreshed file that imports a kept protected file which
 * no longer fits fails HERE, at module load, instead of bricking `bun sync`
 * for good. Null when the entry loads, else the loader's error text.
 */
export function selfUpdateImportError(entry: string, repoRoot: string): string | null {
  const url = pathToFileURL(path.resolve(entry)).href;
  const r = spawnSync(process.execPath, ['-e', `await import(${JSON.stringify(url)})`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    env: { ...process.env, UPEX_UPDATER_REEXEC: '1' },
  });
  if (r.error) { return r.error.message; }
  if (r.status === 0) { return null; }
  const text = `${r.stderr ?? ''}${r.stdout ?? ''}`.trim();
  return text.split('\n').filter(Boolean).slice(-6).join('\n') || `exit ${r.status ?? 'signal'}`;
}

/**
 * Undo a self-update copy: every overwritten file comes back from
 * `backupDir`, every file the copy CREATED is removed (it has no backup).
 */
export function restoreSelfUpdate(refreshed: readonly string[], backupDir: string, repoRoot: string): void {
  for (const rel of refreshed) {
    const saved = path.join(backupDir, rel);
    const dst = path.join(repoRoot, rel);
    if (fs.existsSync(saved)) { fs.copyFileSync(saved, dst); }
    else if (fs.existsSync(dst)) {
      fs.unlinkSync(dst);
      pruneEmptyParents(repoRoot, rel);
    }
  }
}

/** The newest `.backups/update-*` directory of `repoRoot` (the timestamped names sort), or null. */
function newestUpdateBackup(repoRoot: string): string | null {
  const root = path.join(repoRoot, '.backups');
  let names: string[];
  try { names = fs.readdirSync(root).filter(n => n.startsWith('update-')).sort(); }
  catch { return null; }
  const newest = names.at(-1);
  return newest === undefined ? null : path.join(root, newest);
}

export interface ParentOverwriteRepair {
  /** Protected updater files put back from the parent's backup. */
  restored: string[]
  /** Protected copies the new updater cannot load: upstream's copy stays in place. */
  unloadable: string[]
  /** The backup the copies came from; null when nothing qualified. */
  backupDir: string | null
}

/**
 * Run in a self-update re-exec child. A parent updater older than
 * `selfUpdatePlan` overwrote every stale updater file, a protected one
 * included (with a backup, no row), so the first sync after that fix would
 * still lose the project's copy. A path comes back from the newest
 * `.backups/update-*` only when ALL hold: the parent says it wrote it
 * (`ownedPaths`, from UPDATER_OWNED_PATHS_ENV); it is bootstrap-only here;
 * its local bytes equal upstream's (the overwrite happened); and the backup
 * holds a different copy. Then the entry is import-checked: when it no longer
 * loads, upstream's copies are put back and the paths are `unloadable`.
 */
export function repairParentOverwrites(
  cfg: Pick<UpdaterConfig, 'bootstrapOnlyPaths' | 'agentsFrameworkFiles'>,
  selfComp: Component,
  templateDir: string,
  repoRoot: string,
  ownedPaths: readonly string[],
  entry: string,
): ParentOverwriteRepair {
  const none: ParentOverwriteRepair = { restored: [], unloadable: [], backupDir: null };
  const backupDir = newestUpdateBackup(repoRoot);
  if (backupDir === null) { return none; }
  const restored: string[] = [];
  for (const raw of new Set(ownedPaths)) {
    const rel = raw.replace(/\\/g, '/');
    if (!isRepoOnlyPath(rel, componentOwnedPaths(selfComp))) { continue; }
    if (!isBootstrapOnlyFile(rel, selfComp, cfg.bootstrapOnlyPaths ?? [], cfg.agentsFrameworkFiles ?? [])) { continue; }
    const local = path.join(repoRoot, rel);
    const upstream = path.join(templateDir, rel);
    const saved = path.join(backupDir, rel);
    if (!fs.existsSync(local) || !fs.existsSync(upstream) || !fs.existsSync(saved)) { continue; }
    const localBytes = fs.readFileSync(local);
    if (Buffer.compare(localBytes, fs.readFileSync(upstream)) !== 0) { continue; }
    if (Buffer.compare(localBytes, fs.readFileSync(saved)) === 0) { continue; }
    fs.copyFileSync(saved, local);
    restored.push(rel);
  }
  if (restored.length === 0) { return none; }
  if (selfUpdateImportError(entry, repoRoot) === null) { return { restored, unloadable: [], backupDir }; }
  for (const rel of restored) { fs.copyFileSync(path.join(templateDir, rel), path.join(repoRoot, rel)); }
  return { restored: [], unloadable: restored, backupDir };
}

/**
 * Run in a self-update re-exec child, before `cleanupBoilerplateCopies`. A
 * parent older than this updater copied upstream's HEAD over every differing
 * updater file, the project's edited copy of a boilerplate-only one (a `cli/`
 * test, snapshot or fixture) included, so the cleanup would then find
 * upstream's bytes and delete the file as an unedited copy. Each such path the
 * parent says it wrote (`ownedPaths`) is judged by the copy it left in the
 * newest `.backups/update-*`, with the cleanup's own rule: upstream's at HEAD or
 * at the lock cursor (the cleanup's whitespace normalization) stays as the
 * parent left it, for the cleanup to remove; anything else is the project's and
 * comes back, so the cleanup keeps it as `edited`. A path the parent created
 * has no backup copy and is upstream's by construction.
 */
export function restoreParentOverwrittenEdits(
  cfg: Pick<UpdaterConfig, 'components' | 'cleanupRepoOnly'>,
  templateDir: string,
  repoRoot: string,
  ownedPaths: readonly string[],
  cursors: Record<string, string>,
): string[] {
  const lists = cfg.cleanupRepoOnly;
  const backupDir = newestUpdateBackup(repoRoot);
  if (!lists || backupDir === null) { return []; }
  const restored: string[] = [];
  for (const raw of new Set(ownedPaths)) {
    const rel = raw.replace(/\\/g, '/');
    if (!isRepoOnlyForRun({ repoOnlyPaths: lists.paths, repoOnlyPatterns: lists.patterns }, rel) || isProjectLocalSkillPath(rel)) { continue; }
    const saved = path.join(backupDir, rel);
    if (!fs.existsSync(saved)) { continue; }
    const projectCopy = fs.readFileSync(saved);
    const headPath = path.join(templateDir, rel);
    const head = fs.existsSync(headPath) ? fs.readFileSync(headPath) : null;
    const component = cfg.components.find(c => !c.bootstrapOnly && isRepoOnlyPath(rel, componentOwnedPaths(c)));
    const cursor = component ? cursors[component.name] : undefined;
    const atCursor = cursor !== undefined && cloneHasCommit(templateDir, cursor) ? upstreamBlobAt(templateDir, cursor, rel) : null;
    if (sameContent(projectCopy, head) || sameContent(projectCopy, atCursor)) { continue; }
    fs.mkdirSync(path.dirname(path.join(repoRoot, rel)), { recursive: true });
    fs.copyFileSync(saved, path.join(repoRoot, rel));
    restored.push(rel);
  }
  return restored.sort();
}

// ============================================================================
// BOILERPLATE COPIES CLEANUP (upstream's unedited copies a project already has)
// ============================================================================

export interface BoilerplateCleanupResult {
  /** Removed (or, on a dry-run, that a real run removes), repo-relative. */
  removed: string[]
  /** Kept with a row: edited by the project, protected, or not verifiable. */
  kept: BoilerplateCopyKept[]
  /** The backup the removed copies went to; null when nothing was removed. */
  backupDir: string | null
}

/** The bytes of `rel` at `rev` in the upstream clone; null when that revision has no such file. */
function upstreamBlobAt(templateDir: string, rev: string, rel: string): Buffer | null {
  const r = spawnSync('git', ['-C', templateDir, 'show', `${rev}:${rel}`], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/** `dir/name.ts` -> `dir/name.test.ts` (also `.js`, `.mjs`): the test of a protected file stays with it. */
function protectedTestSibling(filePath: string): string | null {
  const match = /^(.*)\.(ts|js|mjs)$/.exec(filePath.replace(/\\/g, '/'));
  if (match === null || match[1].endsWith('.test')) { return null; }
  return `${match[1]}.test.${match[2]}`;
}

/** Whether the clone holds commit `rev` (a shallow fallback clone may not). */
function cloneHasCommit(templateDir: string, rev: string): boolean {
  if (!/^[0-9a-f]{7,64}$/i.test(rev)) { return false; }
  return spawnSync('git', ['-C', templateDir, 'cat-file', '-e', `${rev}^{commit}`], { stdio: 'ignore' }).status === 0;
}

/** Same content, under the whitespace normalization `classifyFile` applies. */
function sameContent(local: Buffer, upstream: Buffer | null): boolean {
  if (upstream === null) { return false; }
  return Buffer.compare(local, upstream) === 0 || normalizeWhitespace(local.toString('utf8')) === normalizeWhitespace(upstream.toString('utf8'));
}

/** Every file below the components' paths in `repoRoot`, repo-relative (node_modules and .git skipped). */
function localComponentFiles(components: readonly Component[], repoRoot: string): string[] {
  const out = new Set<string>();
  const walk = (rel: string): void => {
    const abs = path.join(repoRoot, rel);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(abs); }
    catch { return; }
    if (stat.isSymbolicLink()) { return; }
    if (stat.isFile()) { out.add(rel); return; }
    if (!stat.isDirectory()) { return; }
    for (const name of fs.readdirSync(abs)) {
      if (name === 'node_modules' || name === '.git') { continue; }
      walk(`${rel}/${name}`);
    }
  };
  for (const c of components) {
    if (c.bootstrapOnly) { continue; }
    for (const p of componentOwnedPaths(c)) { if (p !== '.' && p !== '') { walk(p.replace(/\\/g, '/').replace(/\/+$/, '')); } }
  }
  return [...out].sort();
}

/**
 * Remove from a project the boilerplate-only files (`cfg.cleanupRepoOnly`:
 * the boilerplate's own tests, snapshots, fixtures, maintainer scripts) that
 * stopped travelling, but only upstream's UNEDITED copies. A file goes when
 * ALL four hold, and is kept otherwise (fail closed):
 *  1. it matches `cfg.cleanupRepoOnly` (and is no project-local skill);
 *  2. upstream has the path at the clone's HEAD or at its component's lock
 *     cursor;
 *  3. the local bytes equal that copy (the whitespace normalization of
 *     `classifyFile`);
 *  4. it is not bootstrap-only (watchlist, `updater.protected_paths`) and not
 *     the `.test.*` sibling of a bootstrap-only file.
 * A removed file is copied to the run's backup first. A kept file gets a
 * reason (`edited`, `protected`, `unverified` when upstream's copy could not
 * be read); a file upstream never had is the project's own and is silent. On
 * a dry-run nothing is written and `removed` lists what a real run removes.
 */
export function cleanupBoilerplateCopies(
  cfg: Pick<UpdaterConfig, 'components' | 'bootstrapOnlyPaths' | 'agentsFrameworkFiles' | 'cleanupRepoOnly'>,
  repoRoot: string,
  templateDir: string,
  cursors: Record<string, string>,
  dryRun: boolean,
  logger: CoreLogger = silentLogger,
): BoilerplateCleanupResult {
  const result: BoilerplateCleanupResult = { removed: [], kept: [], backupDir: null };
  const lists = cfg.cleanupRepoOnly;
  if (!lists) { return result; }
  const matches = (rel: string): boolean => isRepoOnlyForRun({ repoOnlyPaths: lists.paths, repoOnlyPatterns: lists.patterns }, rel) && !isProjectLocalSkillPath(rel);
  const heldSiblings = new Set((cfg.bootstrapOnlyPaths ?? []).map(p => protectedTestSibling(p)).filter((p): p is string => p !== null));

  for (const rel of localComponentFiles(cfg.components, repoRoot).filter(matches)) {
    const component = cfg.components.find(c => !c.bootstrapOnly && isRepoOnlyPath(rel, componentOwnedPaths(c)));
    if (isBootstrapOnlyFile(rel, component, cfg.bootstrapOnlyPaths ?? [], cfg.agentsFrameworkFiles ?? []) || heldSiblings.has(rel)) {
      result.kept.push({ path: rel, reason: 'protected' });
      continue;
    }
    let local: Buffer;
    try { local = fs.readFileSync(path.join(repoRoot, rel)); }
    catch {
      result.kept.push({ path: rel, reason: 'unverified' });
      continue;
    }
    const headPath = path.join(templateDir, rel);
    const head = fs.existsSync(headPath) ? fs.readFileSync(headPath) : null;
    const cursor = component ? cursors[component.name] : undefined;
    const cursorKnown = cursor !== undefined && cloneHasCommit(templateDir, cursor);
    const atCursor = cursorKnown ? upstreamBlobAt(templateDir, cursor, rel) : null;
    if (sameContent(local, head) || sameContent(local, atCursor)) {
      result.removed.push(rel);
      continue;
    }
    if (!cursorKnown) {
      // An older upstream copy cannot be ruled out: unproven either way.
      result.kept.push({ path: rel, reason: 'unverified' });
      continue;
    }
    if (head === null && atCursor === null) { continue; } // upstream never had it: the project's own file
    result.kept.push({ path: rel, reason: 'edited' });
  }

  if (result.removed.length === 0) { return result; }
  if (dryRun) {
    logger.info(`[dry-run] eliminaría ${result.removed.length} copia(s) de archivos propios del boilerplate (tests, fixtures): ${result.removed.slice(0, 5).join(', ')}${result.removed.length > 5 ? ', …' : ''}`);
    return result;
  }
  const backupDir = createBackupDir(repoRoot);
  const removed: string[] = [];
  for (const rel of result.removed) {
    const src = path.join(repoRoot, rel);
    try {
      const saved = path.join(backupDir, rel);
      fs.mkdirSync(path.dirname(saved), { recursive: true });
      fs.copyFileSync(src, saved);
      fs.unlinkSync(src);
      pruneEmptyParents(repoRoot, rel);
      removed.push(rel);
    }
    catch (err) {
      logger.warning(`No se pudo eliminar ${rel}: ${errorMessage(err)}`);
      result.kept.push({ path: rel, reason: 'unverified' });
    }
  }
  result.removed = removed;
  result.backupDir = removed.length > 0 ? backupDir : null;
  if (removed.length > 0) {
    logger.success(`Eliminadas ${removed.length} copia(s) sin editar de archivos propios del boilerplate (tests, fixtures); backup en ${path.relative(repoRoot, backupDir)}.`);
  }
  return result;
}

/**
 * Drop the `deleted-upstream` entries of files `cleanupDeprecated` removes in
 * Phase 5 anyway. Left in, the interactive run asks about the same delete
 * twice and `--auto` defers it, which holds the whole component back.
 */
export function dropDeprecatedDeletes<T extends { path: string, classification: string }>(
  entries: T[],
  deprecatedFiles: Pick<DeprecatedFile, 'path'>[],
): T[] {
  const deprecated = new Set(deprecatedFiles.map(d => d.path.replace(/\\/g, '/')));
  return entries.filter(e => !(e.classification === 'deleted-upstream' && deprecated.has(e.path.replace(/\\/g, '/'))));
}

/**
 * Remove files in `cfg.deprecatedFiles` from the local repo. Honors dryRun.
 * A file marked `backup` is copied into the run's backup directory first
 * (`ensureBackup`), and is kept when that copy fails.
 * Returns the count of files actually removed (or that would be removed in dry-run).
 */
export function cleanupDeprecated(
  cfg: UpdaterConfig,
  repoRoot: string,
  dryRun: boolean,
  logger: CoreLogger = silentLogger,
  ensureBackup?: () => string,
): number {
  const present = cfg.deprecatedFiles.filter(d => fs.existsSync(path.join(repoRoot, d.path)));
  if (present.length === 0) { return 0; }

  let removed = 0;
  for (const dep of present) {
    if (dryRun) {
      logger.info(`[dry-run] eliminaría deprecated: ${dep.path} (${dep.reason})`);
      removed++;
      continue;
    }
    try {
      if (dep.backup === true && ensureBackup) {
        const saved = path.join(ensureBackup(), dep.path);
        fs.mkdirSync(path.dirname(saved), { recursive: true });
        fs.cpSync(path.join(repoRoot, dep.path), saved);
      }
      fs.unlinkSync(path.join(repoRoot, dep.path));
      pruneEmptyParents(repoRoot, dep.path);
      logger.success(`Eliminado: ${dep.path}`);
      logger.info(`Razon: ${dep.reason} (deprecated desde ${dep.deprecatedSince})`);
      removed++;
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warning(`No se pudo eliminar ${dep.path}: ${msg}`);
    }
  }
  return removed;
}

// ============================================================================
// ORCHESTRATOR — runUpdate (Phase B mega-flow)
// ============================================================================

/**
 * Top-level updater orchestrator. Drives the 5-phase TUI flow:
 *   Phase 1 — FETCH:    partial-clone the template repo (fallback: shallow clone).
 *   Phase 2 — DETECT:   read prior state, classify delta, build component summary.
 *   Phase 3 — SCOPE:    pick which components to review (skipped when changed < 10 or auto).
 *   Phase 4 — FILES:    pick files per scope, resolve diverged, confirm deletes,
 *                       optionally show diff before apply (Fallback (b)).
 *   Phase 4.5 — IGNORE: surface upstream-only ignore lines (no-op stub in Phase B).
 *   Phase 5 — APPLY:    apply resolutions, advance state, cleanup deprecated.
 *
 * State migrations (v5→v6, v6→v7) are prompted via `sink.confirm`. The wrapper
 * does NOT call `runUpdate` for `--rollback` or `--update-mcp-template`; those
 * short-circuit before this orchestrator.
 */
export async function runUpdate(
  cfg: UpdaterConfig,
  sink: ReportSink,
  opts: { auto: boolean, dryRun: boolean, rollback: boolean, force?: boolean, updaterOwnedPaths?: string[] },
): Promise<RunSummary> {
  if (opts.rollback) {
    // Wrapper handles rollback; reaching runUpdate with rollback=true is a contract error.
    throw new Error('runUpdate received rollback=true; wrapper must short-circuit first');
  }

  // Component registry validation (Level 3 — fatal). Runs BEFORE fetch so a
  // misconfigured registry never wastes a clone. ComponentOverlapError bubbles
  // up to the wrapper which prints it as a structured error.
  try {
    validateComponentRegistry(cfg.components);
  }
  catch (err) {
    if (err instanceof ComponentOverlapError) {
      sink.error(err.message);
      throw err;
    }
    throw err;
  }

  const repoRoot = process.cwd();
  const emptySummary: RunSummary = {
    applied: [],
    skipped: [],
    failed: [],
    newHeadSha: '',
    componentsAdvanced: [],
    componentsHeldBack: [],
  };
  // A preflight refusal: the wrapper prints `Abortado.` and exits 1 on it.
  const abortedSummary: RunSummary = { ...emptySummary, aborted: true };

  // --- DIRTY WORKING TREE GUARD (data-loss safety, pre-fetch) ---
  // Pre-write backups live in .backups/, which is gitignored — so an
  // uncommitted user who proceeds and later runs `git clean` / `git stash` can
  // lose both the working copy and the backup. Refuse on a dirty tree unless
  // --force; interactive mode offers an explicit override.
  //
  // Dirtiness the updater produced itself (cross-harness migration output, the
  // CLI files a parent process refreshed before re-exec'ing us) is exempt: see
  // `dirtyTreeExemptions`. A clean tree before `bun sync --auto` must never
  // abort because of the updater's own writes.
  //
  // The previous run's own output is exempt too, even uncommitted: a sync
  // leaves its files for review on purpose, and `.template/last-apply.json`
  // holds their hashes. A recorded path with the same hash is the updater's;
  // one the user edited since (hash differs) or never recorded still aborts.
  const readPorcelain = (): string => {
    try {
      // `-uall` lists untracked FILES, not a collapsed `?? dir/` entry, so a
      // directory the updater created can be matched file by file against the
      // exemptions instead of hiding (or exposing) everything beneath it.
      return execSync(`git -C "${repoRoot}" status --porcelain --untracked-files=all`, { encoding: 'utf8' }).trimEnd();
    }
    catch {
      return ''; // not a git repo / git unavailable — nothing to guard against
    }
  };
  // Paths that were the USER's dirt when the run started: never recorded as
  // updater output at the end, so the next guard still refuses them.
  let userDirtBefore: string[] = [];
  if (!opts.dryRun) {
    const dirty = readPorcelain();
    const foreign = dirty.trim() ? foreignDirtyPaths(dirty, dirtyTreeExemptions(cfg, opts)) : [];
    const lastApply = readLastApply(repoRoot);
    const { recorded, userOwned } = splitByLastApply(foreign, lastApply, repoRoot);
    userDirtBefore = userOwned;
    // Only user work the sync would OVERWRITE can be lost; dirt outside the
    // write surface (tests/, project code, protected files) is listed and
    // never blocks. See `isWithinWriteSurface`.
    const blocking = userOwned.filter(p => isWithinWriteSurface(cfg, p));
    const outside = userOwned.filter(p => !isWithinWriteSurface(cfg, p));
    if (!opts.force) {
      if (dirty.trim() && foreign.length === 0) {
        sink.step('Árbol de trabajo con cambios propios del updater (migración / self-update); el guard los ignora.');
      }
      if (recorded.length > 0) {
        sink.step(`Árbol con la salida del sync anterior sin commitear (${recorded.length} ruta(s), hash intacto); el guard las reconoce como propias.`);
      }
      if (outside.length > 0) {
        const shownOutside = outside.slice(0, 5).join(', ') + (outside.length > 5 ? ` (+${outside.length - 5} más)` : '');
        sink.step(`${outside.length} ruta(s) con cambios sin commitear fuera de lo que este updater escribe (${shownOutside}); no bloquean.`);
      }
      if (blocking.length > 0) {
        const shown = blocking.slice(0, 5).join(', ') + (blocking.length > 5 ? ` (+${blocking.length - 5} más)` : '');
        sink.warn(`El árbol de trabajo tiene cambios sin commitear en rutas que este updater SINCRONIZA (${shown}). Serían sobrescritas y sus backups van a .backups/ (gitignored); un \`git clean\` posterior podría perderlos. Commitea o haz stash antes de actualizar.`);
        if (lastApply && recorded.length > 0) {
          sink.warn(`El sync anterior sigue sin commitear. Commit sugerido: ${lastApply.suggestedCommit}${lastApply.promptFile ? `; prompt de paridad: ${lastApply.promptFile}` : ''}.`);
        }
        if (opts.auto) {
          // Name the files and the reversible fix, never `--force` (analysis §8 #20):
          // that flag also deletes files and takes upstream's package.json values.
          const paths = blocking.slice(0, 5).map(p => JSON.stringify(p)).join(' ');
          sink.error(`Abortado: ${blocking.length} ruta(s) que este updater sincroniza tienen cambios sin commitear (${shown}). Commitéalas, o guárdalas con \`git stash push -- ${paths}\`, y vuelve a correr.`);
          return abortedSummary;
        }
        const proceed = confirmedByParent('dirty-tree') || await sink.confirm('Continuar de todas formas pese a los cambios sin commitear?', false);
        if (!proceed) {
          return abortedSummary;
        }
        rememberConfirmed('dirty-tree');
      }
    }
  }
  /**
   * Record what this run left uncommitted (everything dirty now minus the
   * user's own dirt from before), so the next guard recognises it. Runs after
   * the afterApply hooks: the alias repair, the registry and the prompt count too.
   */
  const recordLastApply = (summary: RunSummary, promptFile: string | null): void => {
    if (opts.dryRun) { return; }
    const dirtyNow = readPorcelain();
    const userDirt = new Set(userDirtBefore);
    const paths = (dirtyNow.trim() ? parsePorcelainPaths(dirtyNow) : []).filter(p => !userDirt.has(p));
    const record = writeLastApply(repoRoot, paths, {
      upstreamSha: summary.newHeadSha,
      suggestedCommit: suggestCommitMessage(summary),
      promptFile,
    });
    summary.lastApplyPaths = record ? Object.keys(record.files).length : 0;
  };

  // --- STATE LOAD + MIGRATION (pre-Phase 1) ---
  let rawState: SyncState | null;
  try {
    rawState = readSyncState(repoRoot, cfg.versionFile);
  }
  catch (err) {
    if (err instanceof CorruptStateError) {
      sink.error(err.message);
      return abortedSummary;
    }
    throw err;
  }

  // Schema migration — single collapsed prompt regardless of source version.
  // v5 → v7 chains migrations silently; users see one Yes/No instead of two.
  let v7State: SyncStateV7 | null = null;
  const fromV5 = isV5State(rawState);
  const fromV6 = isV6State(rawState);
  if (fromV5 || fromV6) {
    const sourceLabel = fromV5 ? 'v5 (legacy)' : 'v6';
    sink.warn(`Detectado esquema ${sourceLabel} en .template/boilerplate.lock.json.`);
    const ok = opts.auto || opts.force || confirmedByParent('lock-migration')
      ? true
      : await sink.confirm(`Migrar esquema ${sourceLabel} → v7 (rastreo per-component SHA + ignore-files + flags ampliados)?`, true);
    if (!ok) {
      sink.warn('Migración cancelada. Ejecuta de nuevo cuando quieras migrar.');
      return abortedSummary;
    }
    rememberConfirmed('lock-migration');
    const v6 = fromV5 ? migrateSyncState(rawState as SyncStateV5, cfg.cliVersion) : (rawState as SyncStateV6);
    v7State = migrateV6ToV7(v6, cfg.templateRepo, cfg.cliVersion);
  }
  else if (isV7State(rawState)) {
    v7State = rawState;
  }

  // Ensure ignoreFileSync is initialized on every v7 state (defensive — older
  // v7 states written before Phase C may have undefined for this field).
  if (v7State !== null && !v7State.ignoreFileSync) {
    v7State.ignoreFileSync = {};
  }
  // Same defensive init for packageJsonSync (added in-place on v7 schema —
  // older v7 lockfiles predate this field).
  if (v7State !== null && !v7State.packageJsonSync) {
    v7State.packageJsonSync = {};
  }

  // --- PHASE 1 — FETCH ---
  sink.phase(1, 'FETCH');
  // Sparse-checkout must include component paths, ignore-file paths AND
  // package.json paths so Phase 4.5 / 4.5b can read them out of the partial
  // clone — plus any extra paths hooks need to read from upstream (e.g. the
  // protected-file drift watchlist; without them the advisory silently
  // skips every entry because the upstream copy "does not exist").
  const sparsePatterns = [
    ...buildSparseCheckoutPatterns(cfg.components),
    ...cfg.ignoreFiles.map(spec => spec.path),
    ...(cfg.packageJsonSpecs ?? []).map(spec => spec.path),
    ...(cfg.sparseExtraPaths ?? []),
  ];
  // A parent process (the --dry-run preview of a pending self-update) may hand
  // down the clone it already fetched: widen it to our patterns, never re-clone,
  // and leave its cleanup to the parent.
  const prefetched = prefetchedUpstreamDir();
  const templateDir = prefetched ?? cfg.tempDir;
  if (prefetched) {
    try {
      widenSparseCheckout(prefetched, sparsePatterns);
      sink.step(`Upstream ya descargado por el proceso padre: ${path.basename(prefetched)}`);
    }
    catch (err) {
      sink.warn(`No se pudo ampliar el sparse-checkout del upstream heredado: ${errorMessage(err)}`);
    }
  }
  const fetchSpin = sink.spinner();
  if (!prefetched) { fetchSpin.start(`Cloning upstream (${cfg.templateRepo})…`); }
  try {
    if (!prefetched) {
      await partialCloneTemplate(cfg.templateRepo, cfg.tempDir, sparsePatterns);
      fetchSpin.stop(`Template descargado (sparse-checkout): ${cfg.templateRepo}`);
    }
  }
  catch (firstErr) {
    fetchSpin.stop('Partial clone falló — intentando shallow clone…');
    const fallbackSpin = sink.spinner();
    fallbackSpin.start('Clonando shallow…');
    try {
      await shallowCloneTemplate(cfg.templateRepo, cfg.tempDir);
      fallbackSpin.stop(`Template descargado (shallow): ${cfg.templateRepo}`);
    }
    catch (secondErr) {
      fallbackSpin.stop('Shallow clone falló.');
      const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
      sink.error(`No se pudo descargar el template: ${msg}`);
      // Surface the first error too for diagnostics
      const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      sink.error(`Causa partial-clone: ${firstMsg}`);
      return abortedSummary;
    }
  }

  const newHeadSha = resolveTemplateHeadSha(templateDir);
  sink.step(`HEAD upstream: ${newHeadSha.slice(0, 7)}`);

  // --- SELF-UPDATE (before Phase 2) ---
  // If cfg.selfUpdateComponent points at the component that owns the updater
  // itself (e.g. `cli/`), refresh those files in-place and re-exec the script
  // so the rest of the flow runs against the fresh code. Skipped when the
  // child process is already a re-exec (UPEX_UPDATER_REEXEC=1).
  //
  // Under --dry-run nothing is written: the fetched updater is run straight
  // from the upstream clone against this project (same flags, same cwd), so
  // the preview shows what the NEW code would do (its migration plan, its
  // components, its parity table) instead of the current code's opinion.
  if (cfg.selfUpdateComponent && process.env.UPEX_UPDATER_REEXEC !== '1') {
    const selfComp = cfg.components.find(c => c.name === cfg.selfUpdateComponent);
    if (selfComp) {
      // Repo-only files never travel; a protected file the project has is kept,
      // as in every other component, and the protected-drift row reports it.
      const { selfFiles, stale, keptProtected } = selfUpdatePlan(cfg, selfComp, templateDir, repoRoot);
      if (keptProtected.length > 0) {
        sink.warn(`Self-update: ${keptProtected.length} archivo(s) protegido(s) del CLI se conservan (difieren de upstream): ${keptProtected.join(', ')}.`);
      }
      if (stale.length > 0 && opts.dryRun) {
        // The running script, located inside the self-update component: by its
        // repo-relative path when launched from the project, else by basename
        // (a copy of the updater launched from elsewhere, as in the smoke tests).
        const argvEntry = path.resolve(process.argv[1] ?? '');
        const argvRel = path.relative(repoRoot, argvEntry).replace(/\\/g, '/');
        const posixSelf = selfFiles.map(f => f.replace(/\\/g, '/'));
        const entryRel = posixSelf.find(f => f === argvRel) ?? posixSelf.find(f => path.basename(f) === path.basename(argvEntry)) ?? '';
        const upstreamEntry = path.join(templateDir, entryRel);
        if (!entryRel || !fs.existsSync(upstreamEntry)) {
          sink.warn(`Self-update pendiente (${stale.length} archivo(s) del CLI difieren de upstream). --dry-run no puede previsualizar con el updater nuevo: la corrida real lo aplica primero.`);
        }
        else {
          sink.warn(`Self-update pendiente: ${stale.length} archivo(s) del CLI difieren de upstream. --dry-run: previsualizando con el updater nuevo (${entryRel} del clon upstream), sin escribir cli/…`);
          // The upstream clone has no node_modules: point it at ours so the
          // fetched updater resolves its dependencies. Outside the repo tree.
          const localModules = path.join(repoRoot, 'node_modules');
          const cloneModules = path.join(templateDir, 'node_modules');
          if (fs.existsSync(localModules) && !fs.existsSync(cloneModules)) {
            try { fs.symlinkSync(localModules, cloneModules, process.platform === 'win32' ? 'junction' : 'dir'); }
            catch (err) { sink.warn(`No se pudo enlazar node_modules en el clon upstream: ${errorMessage(err)}`); }
          }
          const handoff = await cfg.hooks?.beforeReexec?.({ kind: 'preview', from: cfg.cliVersion, to: newHeadSha.slice(0, 7) }) ?? {};
          const child = spawnSync(process.execPath, [upstreamEntry, ...process.argv.slice(2)], {
            stdio: 'inherit',
            cwd: repoRoot,
            env: { ...process.env, ...handoff, UPEX_UPDATER_REEXEC: '1', [UPDATER_UPSTREAM_DIR_ENV]: templateDir },
          });
          cleanupTempDir(cfg.tempDir);
          if (child.error) {
            sink.error(`Preview con el updater nuevo falló: ${child.error.message}`);
            process.exit(1);
          }
          process.exit(child.status ?? 1);
        }
      }
      else if (stale.length > 0) {
        sink.warn(`Self-update: actualizando ${stale.length} archivo(s) del CLI antes de continuar…`);
        // A2: confirm before clobbering cli/. A user who customized the updater
        // gets a chance to bail; files are backed up + restorable via --rollback,
        // but .backups/ is gitignored, so the explicit OK matters. Auto skips.
        // `--force` never asks either (analysis §8 #21: the help says so).
        if (!opts.auto && !opts.force) {
          const okSelf = await sink.confirm(`Se reemplazarán ${stale.length} archivo(s) de cli/ (backup en .backups/, restaurable con --rollback). Continuar?`, true);
          if (!okSelf) {
            sink.warn('Self-update cancelado. Re-ejecuta cuando quieras actualizar el CLI.');
            cleanupTempDir(cfg.tempDir);
            return abortedSummary;
          }
        }
        // Pre-write backup contract: mirror each existing local file into a
        // fresh `.backups/update-<ts>/` before overwriting. Symmetric with
        // applyResolution's backup behavior. `bun sync --rollback` can then
        // restore the prior CLI if a self-update breaks it.
        const selfBackupDir = createBackupDir(repoRoot);
        for (const relPath of stale) {
          const src = path.join(templateDir, relPath);
          const dst = path.join(repoRoot, relPath);
          if (fs.existsSync(dst)) {
            const backupPath = path.join(selfBackupDir, relPath);
            fs.mkdirSync(path.dirname(backupPath), { recursive: true });
            fs.copyFileSync(dst, backupPath);
          }
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.cpSync(src, dst);
          sink.step(`  · ${relPath}`);
        }
        sink.step(`Backup en ${path.relative(repoRoot, selfBackupDir)}`);
        // The new updater must load against the files it did NOT refresh (a
        // kept protected one). If it cannot, put the old CLI back and stop:
        // re-exec'ing it would brick `bun sync` until a hand repair.
        const importError = selfUpdateImportError(process.argv[1] ?? '', repoRoot);
        if (importError !== null) {
          restoreSelfUpdate(stale, selfBackupDir, repoRoot);
          const blame = keptProtected.length > 0 ? ` Archivo(s) protegido(s) que el CLI nuevo no puede cargar: ${keptProtected.join(', ')}. Fusiona upstream en ellos o quítalos de updater.protected_paths, y re-ejecuta.` : '';
          sink.error(`Self-update abortado: el CLI nuevo no carga, se restauró el anterior (${stale.length} archivo(s) desde ${path.relative(repoRoot, selfBackupDir)}).${blame}\n${importError}`);
          cleanupTempDir(cfg.tempDir);
          return { ...abortedSummary, newHeadSha, selfUpdateBlocked: { protectedPaths: keptProtected, error: importError } };
        }
        sink.step('Re-ejecutando con código actualizado…');
        // The child inherits what WE dirtied (preflight output + the CLI files
        // just written) so its own dirty-tree guard can tell it apart from
        // uncommitted user work; see `dirtyTreeExemptions`.
        const ownedPaths = dirtyTreeExemptions(cfg, opts).concat(stale);
        const handoff = await cfg.hooks?.beforeReexec?.({ kind: 'self-update', from: cfg.cliVersion, to: newHeadSha.slice(0, 7) }) ?? {};
        const child = spawnSync(process.execPath, [process.argv[1], ...process.argv.slice(2)], {
          stdio: 'inherit',
          // The sha we just put `cli/` at: the child advances that cursor even
          // though it finds nothing left to sync there (`selfUpdatedComponents`).
          env: { ...process.env, ...handoff, UPEX_UPDATER_REEXEC: '1', [UPDATER_OWNED_PATHS_ENV]: ownedPaths.join('\n'), [UPDATER_SELF_UPDATED_ENV]: newHeadSha },
        });
        cleanupTempDir(cfg.tempDir);
        if (child.error) {
          sink.error(`Re-exec tras self-update falló: ${child.error.message}`);
          process.exit(1);
        }
        // child.status is null when the child died from a signal — treat as
        // failure (exit 1) instead of reporting false success with `?? 0`.
        process.exit(child.status ?? 1);
      }
    }
  }

  // --- SELF-UPDATE REPAIR (re-exec child) ---
  // A parent older than this updater overwrote protected updater files too;
  // put the project's copies back before anything reads them.
  let selfUpdateRepair: ParentOverwriteRepair | null = null;
  if (cfg.selfUpdateComponent && process.env.UPEX_UPDATER_REEXEC === '1' && process.env[UPDATER_SELF_UPDATED_ENV] && !opts.dryRun) {
    const selfComp = cfg.components.find(c => c.name === cfg.selfUpdateComponent);
    if (selfComp) {
      const owned = (process.env[UPDATER_OWNED_PATHS_ENV] ?? '').split('\n').filter(Boolean);
      selfUpdateRepair = repairParentOverwrites(cfg, selfComp, templateDir, repoRoot, owned, process.argv[1] ?? '');
      // The project's edited copies of boilerplate-only files the parent replaced
      // come back before the cleanup judges them (it keeps them as `edited`).
      const editsBack = restoreParentOverwrittenEdits(cfg, templateDir, repoRoot, owned, v7State?.perComponentCommit ?? {});
      if (editsBack.length > 0) {
        sink.warn(`Self-update: el updater anterior reemplazó ${editsBack.length} copia(s) editada(s) por el proyecto de archivos propios del boilerplate; restaurada(s) desde su backup: ${editsBack.join(', ')}.`);
      }
      if (selfUpdateRepair.restored.length > 0) {
        sink.warn(`Self-update: el updater anterior sobrescribió ${selfUpdateRepair.restored.length} archivo(s) protegido(s); restaurado(s) desde ${path.relative(repoRoot, selfUpdateRepair.backupDir ?? '')}: ${selfUpdateRepair.restored.join(', ')}.`);
      }
      if (selfUpdateRepair.unloadable.length > 0) {
        sink.warn(`Self-update: tu copia protegida no carga con el CLI nuevo; queda la de upstream (la tuya en ${path.relative(repoRoot, selfUpdateRepair.backupDir ?? '')}): ${selfUpdateRepair.unloadable.join(', ')}.`);
      }
    }
  }
  const repairFacts: Pick<RunSummary, 'selfUpdateRepair'> = selfUpdateRepair && (selfUpdateRepair.restored.length > 0 || selfUpdateRepair.unloadable.length > 0) ? { selfUpdateRepair } : {};

  // --- PHASE 2 — DETECT ---
  sink.phase(2, 'DETECT');

  let entries: DeltaEntry[] = [];
  let bootstrapMode = false;
  let bootstrapComponents: Component[] = [];
  // Synced files the PROJECT edited (3-way, see detectLocalEdits): an
  // overwrite of one of these gets a parity row, with its backup path.
  let localEdits = new Set<string>();

  // Three sync modes:
  //   1. Fresh install     — no prior state at all → ALL components bootstrap.
  //   2. Partial bootstrap — state exists but some requested components have no
  //                          SHA cursor (e.g. previous run targeted a subset).
  //                          Those components bootstrap; the rest delta vs SHA.
  //   3. Pure delta        — state covers every requested component.
  const isFreshInstall = v7State === null
    || Object.keys(v7State.perComponentCommit).length === 0;

  const collectBootstrapEntries = (comps: readonly Component[]): DeltaEntry[] => {
    const out: DeltaEntry[] = [];
    for (const component of comps) {
      const relPaths = collectComponentRelPaths(component, templateDir);
      for (const relPath of relPaths) {
        const isBootstrapFile = isBootstrapOnlyFile(relPath, component, cfg.bootstrapOnlyPaths, cfg.agentsFrameworkFiles);
        const localPath = path.join(repoRoot, relPath);
        if (isBootstrapFile && fs.existsSync(localPath)) {
          continue;
        }
        out.push(bootstrapEntry(component.name, relPath, templateDir));
      }
    }
    return out;
  };

  if (isFreshInstall) {
    bootstrapMode = true;
    bootstrapComponents = cfg.components.slice();
    sink.warn('Primera ejecución detectada — modo bootstrap (sincronización inicial completa).');
    entries = collectBootstrapEntries(bootstrapComponents);
  }
  else {
    const knownSha = new Set(Object.keys(v7State!.perComponentCommit));
    const newComponents = cfg.components.filter(c => !knownSha.has(c.name));
    const deltaComponents = cfg.components.filter(c => knownSha.has(c.name));

    if (newComponents.length > 0) {
      bootstrapMode = true;
      bootstrapComponents = newComponents;
      const names = newComponents.map(c => c.name).join(', ');
      sink.warn(`Componentes sin sincronizar previamente: ${names} — bootstrap parcial.`);
      entries.push(...collectBootstrapEntries(newComponents));
    }

    if (deltaComponents.length > 0) {
      const v6Shape: SyncStateV6 = {
        schemaVersion: 6,
        lastSync: v7State!.lastSyncedAt,
        templateCommit: v7State!.templateCommit,
        cliVersion: v7State!.cliVersion,
        syncedComponents: v7State!.syncedComponents,
        variableSystemVersion: v7State!.variableSystemVersion,
        perComponentCommit: v7State!.perComponentCommit,
      };
      // Full repo-relative paths: `isBootstrapOnlyFile` matches them exactly
      // for any component, and by basename for the legacy `agents` root list.
      const bootstrapOnlyPaths = cfg.bootstrapOnlyPaths;

      // Content reconcile (Profundidad B) is the authoritative source for
      // new + diverged files: it walks the FULL upstream tree and compares by
      // blob SHA, independent of the cursor — so missing files and local edits
      // are always caught (a git-log delta keyed on the cursor misses both).
      const reconciled = reconcileComponentsByContent(
        templateDir,
        deltaComponents,
        repoRoot,
        bootstrapOnlyPaths,
      );

      // computeDelta is still run, but ONLY its deleted-upstream entries are
      // kept — those flag files the boilerplate explicitly removed (a tree walk
      // cannot detect a deletion). Its A/M entries are superseded by the
      // content reconcile above (which also catches cursor-passed drift).
      const deltaEntries = computeDelta(
        templateDir,
        deltaComponents,
        v6Shape,
        repoRoot,
        bootstrapOnlyPaths,
        makeCoreLoggerFromSink(sink),
      );
      const deletes = deltaEntries.filter(e => e.classification === 'deleted-upstream');
      localEdits = detectLocalEdits(templateDir, deltaComponents, v6Shape.perComponentCommit, deltaEntries, reconciled, repoRoot);

      // Merge + dedupe by path (reconcile wins; deletes never overlap since a
      // removed-upstream file is absent from the reconcile tree walk).
      const componentIndex = new Map<string, number>();
      cfg.components.forEach((c, idx) => { componentIndex.set(c.name, idx); });
      const merged = dedupeDeltaByPath(
        [...reconciled, ...deletes],
        cfg.components,
        componentIndex,
        makeCoreLoggerFromSink(sink),
      );
      entries.push(...merged);
    }
  }

  // Drop generated, per-repo files that must never be synced (e.g.
  // .agents/skills/REGISTRY.md). One filter point covers all three detection
  // paths — bootstrap, content reconcile, and git-log delta — since they all
  // feed into `entries`. Each repo regenerates these from its own state.
  if (cfg.excludePaths && cfg.excludePaths.length > 0) {
    const excluded = new Set(cfg.excludePaths.map(p => p.replace(/\\/g, '/')));
    entries = entries.filter(e => !excluded.has(e.path.replace(/\\/g, '/')));
  }

  // Drop the boilerplate's own working material, which no consumer inherits
  // (e.g. `docs/qa-standard/`). Same filter point as excludePaths
  // for the same reason: all detection paths converge on `entries`.
  if (cfg.repoOnlyPaths && cfg.repoOnlyPaths.length > 0) {
    entries = entries.filter(e => !isRepoOnlyPath(e.path, cfg.repoOnlyPaths ?? []));
  }
  if (cfg.repoOnlyPatterns && cfg.repoOnlyPatterns.length > 0) {
    const patterns = cfg.repoOnlyPatterns;
    entries = entries.filter(e => !patterns.some(re => re.test(e.path.replace(/\\/g, '/'))));
  }

  // A deprecated file leaves through cleanupDeprecated (Phase 5), not the delete prompt.
  entries = dropDeprecatedDeletes(entries, cfg.deprecatedFiles);

  // The test of a protected file the project kept travels with that file: held
  // back (not delivered, not overwritten) while the two copies differ.
  const heldSiblings = testSiblingsToHoldBack(cfg.holdTestSiblingsOf ?? [], repoRoot, templateDir);
  const testSiblingsHeldBack: { path: string, protectedPath: string }[] = [];
  if (heldSiblings.length > 0) {
    const byPath = new Map(heldSiblings.map(h => [h.path, h]));
    entries = entries.filter((e) => {
      const held = byPath.get(e.path.replace(/\\/g, '/'));
      if (held === undefined) { return true; }
      if (e.classification !== 'unchanged' && e.classification !== 'binary-skip') { testSiblingsHeldBack.push(held); }
      return false;
    });
    for (const held of testSiblingsHeldBack) {
      sink.warn(`${held.path}: retenido junto a su archivo protegido ${held.protectedPath} (tu copia difiere de upstream).`);
    }
  }

  // Business context skills: the whole folder once, when the project has none.
  entries.push(...collectContextMapBootstrap(cfg.components, templateDir, repoRoot, entries));

  // Filter out unchanged / binary-skip from the user-facing pool
  const visible = entries.filter(
    e => e.classification !== 'unchanged' && e.classification !== 'binary-skip',
  );

  // Summary table per component
  const perComp = new Map<string, { changed: number, diverged: number }>();
  for (const e of visible) {
    const slot = perComp.get(e.component) ?? { changed: 0, diverged: 0 };
    slot.changed++;
    // Diverged = the PROJECT edited it (3-way, `detectLocalEdits`), not merely "bytes differ".
    if (e.classification === 'locally-diverged' && localEdits.has(e.path)) { slot.diverged++; }
    perComp.set(e.component, slot);
  }

  // Pre-detect ignore-line deltas so we know whether to early-exit. If file delta
  // is empty but ignore-line delta is non-empty, we still proceed to Phase 4.5.
  const ignoreDeltasPre: IgnoreDelta[] = [];
  for (const spec of cfg.ignoreFiles) {
    const delta = detectIgnoreDelta(spec, repoRoot, templateDir, v7State);
    if (delta.upstreamOnlyLines.length > 0) {
      ignoreDeltasPre.push(delta);
    }
  }

  // Pre-detect package.json deltas (Phase 4.5b). Same early-exit semantics: a
  // non-empty pkg-json delta keeps us alive even when file delta + ignore delta
  // are empty. A delta is "non-empty" when ANY section has either upstream-only
  // keys (append candidates) or local-override keys (FYI warns).
  const pkgJsonDeltasPre: PackageJsonDelta[] = [];
  for (const spec of cfg.packageJsonSpecs ?? []) {
    const delta = detectPackageJsonDelta(spec, repoRoot, templateDir, v7State);
    let hasSomething = false;
    for (const secDelta of Object.values(delta.sections)) {
      if (Object.keys(secDelta.upstreamOnlyKeys).length > 0
        || Object.keys(secDelta.localOverrideKeys).length > 0) {
        hasSomething = true;
        break;
      }
    }
    if (hasSomething) {
      pkgJsonDeltasPre.push(delta);
    }
  }

  // A bootstrapped component with nothing to deliver still needs its lock
  // cursor recorded (see computeComponentAdvancement), so it is not a no-op.
  // So does the component the parent's self-update already put at upstream
  // HEAD: no entry to walk, but a cursor that must move to this sha. The env
  // signal is the fast path; a pre-8.1 parent never sets it, so the content
  // fallback (selfUpdateComponentByContent) catches that case independently.
  const priorSelfUpdateCursor = cfg.selfUpdateComponent ? v7State?.perComponentCommit[cfg.selfUpdateComponent] : undefined;
  const settledSelfUpdateSignal = selfUpdatedComponents(cfg, newHeadSha);
  const settledSelfUpdate = (
    settledSelfUpdateSignal.length > 0
      ? settledSelfUpdateSignal
      : selfUpdateComponentByContent(cfg, templateDir, repoRoot, newHeadSha, priorSelfUpdateCursor)
  ).filter(name => !entries.some(e => e.component === name));
  // A component already synced before, behind this head, with no delta at it:
  // its cursor moves too, so `templateCommit` can reach the head (see
  // componentsWithoutDelta). Listed before the no-op exit below, so a re-run
  // at the same head also heals a lock a partial-delta sync left behind.
  const settledNoDelta = componentsWithoutDelta(cfg.components, visible, v7State?.perComponentCommit ?? {}, newHeadSha);
  const settledBootstrap = [...new Set([
    ...bootstrapComponents.filter(c => !entries.some(e => e.component === c.name)).map(c => c.name),
    ...settledSelfUpdate,
    ...settledNoDelta,
  ])];
  // The afterApply hooks still run on a no-op: they are idempotent (alias,
  // registry) and they own the parity report, which is the run's
  // end state whatever was applied. A re-run over an uncommitted sync lands
  // here and ends with the same table instead of an abort.
  const runAfterApply = async (summary: RunSummary): Promise<void> => {
    if (!cfg.hooks?.afterApply) { return; }
    try {
      await cfg.hooks.afterApply(summary);
    }
    catch (err) {
      sink.warn(`afterApply hook falló: ${errorMessage(err)}`);
    }
  };
  // Upstream's unedited copies of the boilerplate-only files that stopped
  // travelling: removed with a backup (dry-run: listed), the rest kept with a
  // row. Before the no-change exit, so a project already at HEAD is cleaned too.
  const cleanup = cfg.cleanupRepoOnly
    ? cleanupBoilerplateCopies(cfg, repoRoot, templateDir, v7State?.perComponentCommit ?? {}, opts.dryRun, makeCoreLoggerFromSink(sink))
    : null;
  const cleanupFacts: Pick<RunSummary, 'boilerplateCopiesRemoved' | 'boilerplateCopiesKept' | 'boilerplateCleanupBackup'> = cleanup
    ? { boilerplateCopiesRemoved: cleanup.removed, boilerplateCopiesKept: cleanup.kept, boilerplateCleanupBackup: cleanup.backupDir }
    : {};
  const finish = async (summary: RunSummary): Promise<RunSummary> => {
    await runAfterApply(summary);
    recordLastApply(summary, summary.promptSaved ? (cfg.promptFile ?? null) : null);
    if (!prefetched) { cleanupTempDir(cfg.tempDir); }
    return summary;
  };
  if (visible.length === 0 && ignoreDeltasPre.length === 0 && pkgJsonDeltasPre.length === 0 && settledBootstrap.length === 0) {
    sink.step('Sin cambios detectados respecto al upstream. Nada que sincronizar.');
    return finish({ ...emptySummary, newHeadSha, testSiblingsHeldBack, ...cleanupFacts, ...repairFacts });
  }
  if (visible.length > 0) {
    let suffix = '';
    if (bootstrapMode) {
      suffix = isFreshInstall ? ' (modo bootstrap — primera sync)' : ' (bootstrap parcial + delta)';
    }
    const label = bootstrapMode ? 'archivo(s) nuevos/cambiados' : 'archivo(s) con cambios';
    sink.step(`Detectados ${visible.length} ${label} en ${perComp.size} componente(s)${suffix}.`);
  }
  else if (ignoreDeltasPre.length > 0) {
    sink.step(`Sin cambios de archivos — solo líneas nuevas en ${ignoreDeltasPre.length} ignore-file(s).`);
  }
  else if (pkgJsonDeltasPre.length > 0) {
    sink.step(`Sin cambios de archivos — solo keys nuevas en ${pkgJsonDeltasPre.length} package.json.`);
  }
  else {
    sink.step(`Sin cambios de archivos; solo se registra el cursor de ${settledBootstrap.join(', ')} en el lock.`);
  }

  // Non-interactive when EITHER --auto (CI-safe) OR --force (upstream wins).
  // Both skip every prompt; they differ only in the apply policy (planAuto's
  // forceMode flag and the package.json divergence resolution below).
  const nonInteractive = opts.auto || opts.force === true;

  // --- PHASE 3 — SCOPE ---
  let chosenScopes: string[] = [];
  const AUTO_COLLAPSE_THRESHOLD = 10;
  if (visible.length > 0) {
    if (nonInteractive || visible.length < AUTO_COLLAPSE_THRESHOLD) {
      chosenScopes = [...perComp.keys()];
      if (!nonInteractive) {
        sink.phase(3, 'SCOPE');
        sink.step(`Solo ${visible.length} archivo(s) — saltando selección de scope.`);
      }
    }
    else {
      sink.phase(3, 'SCOPE');
      const scopeOpts: ScopeOption[] = [...perComp.entries()].map(([name, s]) => ({
        name,
        changedCount: s.changed,
        divergedCount: s.diverged,
      }));
      chosenScopes = await sink.pickScopes(scopeOpts);
      if (chosenScopes.length === 0 && ignoreDeltasPre.length === 0 && pkgJsonDeltasPre.length === 0) {
        sink.warn('No seleccionaste ningún componente. Saliendo sin cambios.');
        return emptySummary;
      }
    }
  }

  // --- PHASE 4 — FILES + RESOLUTIONS ---
  // Only emit the phase header when there are visible file deltas to resolve.
  if (visible.length > 0 && chosenScopes.length > 0) {
    sink.phase(4, 'FILES');
  }

  const applied: AppliedFile[] = [];
  const skipped: DeltaEntry[] = [];
  const failed: FailedFile[] = [];
  const localEditsOverwritten: LocalEditOverwritten[] = [];
  let backupDir: string | null = null;
  const ensureBackup = (): string => {
    if (backupDir === null) {
      backupDir = createBackupDir(repoRoot);
    }
    return backupDir;
  };
  /** Bookkeeping after a successful 'theirs' write over a file the project had edited. */
  const noteOverwrite = (item: AppliedFile): void => {
    applied.push(item);
    if (item.resolution === 'theirs' && localEdits.has(item.entry.path)) {
      localEditsOverwritten.push({ path: item.entry.path, component: item.entry.component });
    }
  };

  // Collect first, then write (installer-ui plan §4): every decision of Phase 3
  // to 4.5b is taken before ANY file is written, and the writes happen once, at
  // the start of Phase 5. A run cancelled mid-way through the questions leaves
  // the tree untouched instead of half-applied.
  interface QueuedWrite { item: AppliedFile, tracksEdits: boolean }
  const queued: QueuedWrite[] = [];
  const queue = (item: AppliedFile, tracksEdits: boolean): void => { queued.push({ item, tracksEdits }); };

  for (const scope of chosenScopes) {
    const scopeFiles = visible.filter(e => e.component === scope);
    if (scopeFiles.length === 0) { continue; }

    let selected: DeltaEntry[];
    if (nonInteractive) {
      // non-interactive path: apply planAuto to the scope's entries.
      // --force (opts.force) flips planAuto to overwrite diverged + delete
      // upstream-removed files; --auto keeps the CI-safe policy.
      const { plan, deferred } = planAuto(scopeFiles, opts.force === true);
      // Deferred (deleted-upstream) is held back; mark as skipped
      for (const d of deferred) { skipped.push(d); }
      // Plan items that resolve to 'skip' are skipped; others apply
      for (const item of plan) {
        if (item.resolution === 'skip') {
          skipped.push(item.entry);
          continue;
        }
        queue(item, true);
      }
      continue;
    }

    // Interactive: per-scope strategy prompt (all/pick/skip) when the sink
    // implements pickScopeStrategy; otherwise fall back to direct multiselect.
    const scopeStats = scopeFiles.reduce(
      (acc, e) => {
        acc.addedTotal += e.added;
        acc.removedTotal += e.removed;
        if (e.classification === 'locally-diverged' && localEdits.has(e.path)) { acc.divergedCount++; }
        return acc;
      },
      { changedCount: scopeFiles.length, divergedCount: 0, addedTotal: 0, removedTotal: 0 },
    );

    let strategy: 'all' | 'pick' | 'skip' = 'pick';
    if (sink.pickScopeStrategy) {
      strategy = await sink.pickScopeStrategy(scope, scopeStats);
    }

    if (strategy === 'skip') {
      for (const e of scopeFiles) { skipped.push(e); }
      continue;
    }

    if (strategy === 'all') {
      selected = scopeFiles.slice();
    }
    else {
      const fileOpts = scopeFiles.map(entry => ({
        entry,
        label: formatFileLabel(entry),
      }));
      selected = await sink.pickFiles(scope, fileOpts);
    }

    // Files not selected → skipped
    const selectedPaths = new Set(selected.map(e => e.path));
    for (const e of scopeFiles) {
      if (!selectedPaths.has(e.path)) { skipped.push(e); }
    }

    // Per-file handling
    for (const entry of selected) {
      if (entry.classification === 'locally-diverged' && localEdits.has(entry.path)) {
        // The project edited this file AND upstream changed it: taking either
        // side alone loses the other change, so the person decides (the
        // backup of 'theirs' is taken at write time, --rollback restores it).
        // A dry-run asks nothing and previews the overwrite, as before.
        if (opts.dryRun) {
          sink.step(`[dry-run] cambió en los dos lados, la corrida real pregunta: ${entry.path}`);
          applied.push({ entry, resolution: 'theirs' });
          continue;
        }
        const resolution = await sink.resolveDiverged(entry, buildPairedDiff(entry, templateDir, repoRoot));
        if (resolution === 'theirs') {
          queue({ entry, resolution: 'theirs' }, true);
        }
        else {
          skipped.push(entry);
        }
        continue;
      }

      if (entry.classification === 'deleted-upstream') {
        const wantsDelete = await sink.confirmDelete(entry);
        if (!wantsDelete) {
          skipped.push(entry);
          continue;
        }
        queue({ entry, resolution: 'delete' }, false);
        continue;
      }

      // clean-fastforward / new-upstream → optional diff preview, then apply 'theirs'.
      // Only ask when user explicitly chose 'pick' (audit mode); 'all' means
      // blanket accept — no preview prompts.
      if (sink.showDiff && strategy === 'pick') {
        const paired = buildPairedDiff(entry, templateDir, repoRoot);
        await sink.showDiff(entry, paired);
      }
      queue({ entry, resolution: 'theirs' }, false);
    }
  }

  // --- PHASE 4.5 — IGNORE LINES ---
  // Re-uses the `ignoreDeltasPre` list pre-computed before Phase 3 (above) so
  // we don't redundantly walk the upstream/local sets twice. Skip the entire
  // sub-phase (no header, no spinner) when total upstream-only lines across
  // all configured ignore files is zero.
  const ignoreSelections = new Map<string, string[]>();
  if (ignoreDeltasPre.length > 0) {
    sink.subphase('IGNORE LINES');
    for (const delta of ignoreDeltasPre) {
      let selected: string[];
      if (nonInteractive) {
        // auto/force: accept ALL upstream-only lines (append-only is safe).
        selected = delta.upstreamOnlyLines.slice();
        sink.step(`[auto] ${delta.file}: aceptando ${selected.length} línea(s)`);
      }
      else {
        const options: IgnoreLineOption[] = delta.upstreamOnlyLines.map(line => ({
          value: line,
          label: line,
          checked: true,
        }));
        selected = await sink.pickIgnoreLines(delta.file, options);
      }
      if (selected.length > 0) {
        ignoreSelections.set(delta.file, selected);
      }
    }
  }

  // --- PHASE 4.5b — PACKAGE.JSON KEYS ---
  // Two flows per configured section:
  //   1. upstream-only keys → append-only (default: scripts + devDependencies).
  //   2. diverged keys (same key, different value) → resolved per policy:
  //        --force       → 'theirs' (overwrite local with upstream)
  //        --auto        → 'skip'   (keep local, CI-safe, re-surface next run)
  //        interactive   → ask sink.resolvePackageJsonKey (theirs/mine/skip)
  //      'mine' is recorded in state.keptKeys so it stops re-prompting until the
  //      upstream value changes again; 'skip' is never recorded.
  const pkgJsonSelections = new Map<string, {
    selectedKeys: Record<string, string[]>
    values: Record<string, Record<string, string>>
    overrides: Record<string, Record<string, string>>
    kept: Record<string, Record<string, string>>
  }>();
  // Every key kept at the project's value ('skip' or 'mine'): the parity
  // report gets one row per key, so a non-interactive run does not lose the
  // FYI in the terminal scrollback.
  const packageJsonKept: PackageJsonKeptKey[] = [];
  // Every key appended this run (planned, on a dry-run), with its value: the
  // parity stage checks an appended script's target file once every component
  // has written its files.
  const packageJsonAppended: { file: string, section: string, key: string, value: string }[] = [];
  if (pkgJsonDeltasPre.length > 0) {
    sink.subphase('PACKAGE.JSON KEYS');
    for (const delta of pkgJsonDeltasPre) {
      const selectedKeys: Record<string, string[]> = {};
      const values: Record<string, Record<string, string>> = {};
      const overrides: Record<string, Record<string, string>> = {};
      const kept: Record<string, Record<string, string>> = {};

      // --- Diverged keys (same key, different value) ---
      for (const [section, secDelta] of Object.entries(delta.sections)) {
        for (const [key, drift] of Object.entries(secDelta.localOverrideKeys)) {
          let resolution: 'theirs' | 'mine' | 'skip';
          if (opts.force === true) {
            resolution = 'theirs';
            sink.step(`[force] ${delta.file} ${section}.${key}: usando versión upstream`);
          }
          else if (section === 'scripts' && drift.cursorValue !== undefined && drift.localValue === drift.cursorValue) {
            // The project never changed it since the last sync: upstream's new
            // value is a fast-forward (a kept stale script, such as a `test` over
            // tests that no longer travel, would fail).
            resolution = 'theirs';
            sink.step(`${delta.file} ${section}.${key}: sin cambios del proyecto desde el último sync; se toma la versión upstream`);
          }
          else if (opts.auto || !sink.resolvePackageJsonKey) {
            // CI-safe default (and fallback when the sink has no resolver):
            // keep local and re-surface next run.
            resolution = 'skip';
            sink.warn(
              `${delta.file} ${section}.${key}: divergencia local — se mantiene tu versión\n`
              + `  local:    ${drift.localValue}\n`
              + `  upstream: ${drift.upstreamValue}`,
            );
          }
          else {
            resolution = await sink.resolvePackageJsonKey(delta.file, section, key, drift);
          }

          if (resolution === 'theirs') {
            (overrides[section] ??= {})[key] = drift.upstreamValue;
          }
          else if (resolution === 'mine') {
            (kept[section] ??= {})[key] = drift.upstreamValue;
          }
          // 'skip' → record nothing in the lock (re-prompts next run by design)
          if (resolution !== 'theirs') {
            packageJsonKept.push({ file: delta.file, section, key, localValue: drift.localValue, upstreamValue: drift.upstreamValue, resolution });
          }
        }
      }

      // --- New keys (upstream-only) — append-only ---
      for (const [section, secDelta] of Object.entries(delta.sections)) {
        const upstreamOnly = Object.entries(secDelta.upstreamOnlyKeys);
        if (upstreamOnly.length === 0) { continue; }

        let selected: string[];
        if (nonInteractive) {
          selected = upstreamOnly.map(([k]) => k);
          sink.step(`[auto] ${delta.file} ${section}: aceptando ${selected.length} key(s)`);
        }
        else if (sink.pickPackageJsonKeys) {
          const options: PackageJsonKeyOption[] = upstreamOnly.map(([k, v]) => ({
            value: k,
            label: `${k}: ${v.length > 50 ? `${v.slice(0, 50)}…` : v}`,
            checked: true,
          }));
          selected = await sink.pickPackageJsonKeys(delta.file, section, options);
        }
        else {
          // Sink hasn't implemented interactive pick — fall back to auto-accept.
          selected = upstreamOnly.map(([k]) => k);
          sink.step(`${delta.file} ${section}: ${selected.length} key(s) (sink sin picker, aceptando todas)`);
        }

        if (selected.length > 0) {
          selectedKeys[section] = selected;
          values[section] = Object.fromEntries(upstreamOnly);
        }
      }

      const hasWork = Object.keys(selectedKeys).length > 0
        || Object.keys(overrides).length > 0
        || Object.keys(kept).length > 0;
      if (hasWork) {
        pkgJsonSelections.set(delta.file, { selectedKeys, values, overrides, kept });
      }
    }
  }

  // --- PHASE 5 — APPLY (state write + deprecated cleanup) ---
  sink.phase(5, 'APPLY');

  // The file writes decided in Phase 4, in decision order.
  for (const { item, tracksEdits } of queued) {
    if (opts.dryRun) {
      sink.step(item.resolution === 'delete' ? `[dry-run] eliminaría: ${item.entry.path}` : `[dry-run] aplicaría: ${item.entry.path}`);
      applied.push(item);
      continue;
    }
    try {
      await applyResolution(item.entry, item.resolution, templateDir, repoRoot, ensureBackup(), false, makeCoreLoggerFromSink(sink));
      if (tracksEdits) { noteOverwrite(item); }
      else { applied.push(item); }
    }
    catch (err) {
      failed.push({ entry: item.entry, reason: errorMessage(err) });
    }
  }

  // Apply ignore-line appends BEFORE state write (so the new appendedLines
  // make it into the persisted v7 state). In bootstrap mode v7State is null;
  // materialize it lazily so the appendedLines can still be tracked.
  for (const spec of cfg.ignoreFiles) {
    const selected = ignoreSelections.get(spec.path);
    if (!selected || selected.length === 0) { continue; }
    let appended: string[] = selected;
    if (!opts.dryRun) {
      appended = applyIgnoreAppend(spec, selected, repoRoot, cfg.cliVersion);
      sink.step(`Append a ${spec.path}: ${appended.length} línea(s)`);
    }
    else {
      sink.step(`[dry-run] aplicaría a ${spec.path}: ${appended.length} línea(s)`);
    }
    // Update v7 state's ignoreFileSync block (cumulative appendedLines + blob sha).
    if (v7State === null) {
      v7State = {
        schemaVersion: 7,
        templateRepo: cfg.templateRepo,
        templateCommit: '',
        perComponentCommit: {},
        syncedComponents: [],
        ignoreFileSync: {},
        packageJsonSync: {},
        cliVersion: cfg.cliVersion,
        lastSyncedAt: new Date().toISOString(),
        variableSystemVersion: 1,
      };
    }
    const prev = v7State.ignoreFileSync?.[spec.path]?.appendedLines ?? [];
    const blobSha = computeBlobSha(path.join(templateDir, spec.path));
    v7State.ignoreFileSync = {
      ...(v7State.ignoreFileSync ?? {}),
      [spec.path]: {
        lastSyncedSha: blobSha,
        appendedLines: Array.from(new Set([...prev, ...appended])),
      },
    };
  }

  // Apply package.json appends + overrides BEFORE state write (mirror of ignore-append above).
  for (const spec of cfg.packageJsonSpecs ?? []) {
    const selection = pkgJsonSelections.get(spec.path);
    if (!selection) { continue; }
    const hasAppends = Object.keys(selection.selectedKeys).length > 0;
    const hasOverrides = Object.keys(selection.overrides).length > 0;
    const hasKept = Object.keys(selection.kept).length > 0;
    if (!hasAppends && !hasOverrides && !hasKept) { continue; }

    // Back up the local file BEFORE write (pre-write backup contract).
    const localPath = path.join(repoRoot, spec.path);
    if (!opts.dryRun && (hasAppends || hasOverrides) && fs.existsSync(localPath)) {
      const dir = ensureBackup();
      const backupPath = path.join(dir, spec.path);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(localPath, backupPath);
    }

    let writtenBySection: Record<string, string[]>;
    if (!opts.dryRun) {
      writtenBySection = applyPackageJsonAppend(spec, selection.values, repoRoot, selection.selectedKeys);
      for (const [section, keys] of Object.entries(writtenBySection)) {
        sink.step(`Append a ${spec.path} ${section}: ${keys.length} key(s)`);
      }
      // Overwrite diverged keys resolved as 'theirs' (use upstream value).
      if (hasOverrides) {
        const overwritten = applyPackageJsonOverride(spec, selection.overrides, repoRoot);
        for (const [section, keys] of Object.entries(overwritten)) {
          sink.step(`Actualizado a upstream en ${spec.path} ${section}: ${keys.length} key(s)`);
        }
      }
    }
    else {
      writtenBySection = selection.selectedKeys;
      for (const [section, keys] of Object.entries(writtenBySection)) {
        sink.step(`[dry-run] aplicaría a ${spec.path} ${section}: ${keys.length} key(s)`);
      }
      for (const [section, kv] of Object.entries(selection.overrides)) {
        sink.step(`[dry-run] actualizaría a upstream en ${spec.path} ${section}: ${Object.keys(kv).length} key(s)`);
      }
    }

    for (const [section, keys] of Object.entries(writtenBySection)) {
      for (const key of keys) {
        const value = selection.values[section]?.[key];
        if (typeof value === 'string') { packageJsonAppended.push({ file: spec.path, section, key, value }); }
      }
    }

    // Materialise v7State lazily (bootstrap mode) so the state update sticks.
    if (v7State === null) {
      v7State = {
        schemaVersion: 7,
        templateRepo: cfg.templateRepo,
        templateCommit: '',
        perComponentCommit: {},
        syncedComponents: [],
        ignoreFileSync: {},
        packageJsonSync: {},
        cliVersion: cfg.cliVersion,
        lastSyncedAt: new Date().toISOString(),
        variableSystemVersion: 1,
      };
    }

    const upstreamBlobSha = computeBlobSha(path.join(templateDir, spec.path));
    const fileState = v7State.packageJsonSync?.[spec.path] ?? {};
    const newFileState: Record<string, { lastSyncedSha: string, appliedKeys: string[], keptKeys?: Record<string, string> }> = {};
    for (const section of spec.sections) {
      const prevKeys = fileState[section]?.appliedKeys ?? [];
      const writtenForSection = writtenBySection[section] ?? [];
      // Carry forward prior kept-mine decisions; drop any key now overwritten to
      // upstream ('theirs'), then merge in this run's new kept-mine decisions.
      const prevKept = fileState[section]?.keptKeys ?? {};
      const overriddenThisRun = selection.overrides[section] ?? {};
      const mergedKept: Record<string, string> = {};
      for (const [k, v] of Object.entries(prevKept)) {
        if (!(k in overriddenThisRun)) { mergedKept[k] = v; }
      }
      for (const [k, v] of Object.entries(selection.kept[section] ?? {})) {
        mergedKept[k] = v;
      }
      newFileState[section] = {
        lastSyncedSha: upstreamBlobSha,
        appliedKeys: Array.from(new Set([...prevKeys, ...writtenForSection])),
        ...(Object.keys(mergedKept).length > 0 ? { keptKeys: mergedKept } : {}),
      };
    }
    v7State.packageJsonSync = {
      ...(v7State.packageJsonSync ?? {}),
      [spec.path]: newFileState,
    };
  }

  // Persist backup manifest if any entries were touched
  if (backupDir !== null && v7State !== null && !opts.dryRun) {
    const v6Shape: SyncStateV6 = {
      schemaVersion: 6,
      lastSync: v7State.lastSyncedAt,
      templateCommit: v7State.templateCommit,
      cliVersion: v7State.cliVersion,
      syncedComponents: v7State.syncedComponents,
      variableSystemVersion: v7State.variableSystemVersion,
      perComponentCommit: v7State.perComponentCommit,
    };
    appendBackupManifest(backupDir, [...applied.map(a => a.entry), ...skipped, ...failed.map(f => f.entry)], v6Shape, cfg.cliVersion);
  }

  // Deprecated cleanup runs AFTER apply, BEFORE state write (and before the
  // afterApply hooks). A dry-run lists what it would remove and writes nothing.
  cleanupDeprecated(cfg, repoRoot, opts.dryRun, makeCoreLoggerFromSink(sink), ensureBackup);

  // Compute advancement
  const advancement = computeComponentAdvancement(
    { applied, skipped, failed },
    // Deferred-deletes are already represented in `skipped`, so no separate
    // deferred list is passed (the old `bootstrapMode ? [] : []` was a no-op).
    [],
    // Settled without an entry: bootstrapped with nothing to deliver,
    // refreshed by the parent's self-update, or already at this head's
    // content with a cursor behind it (see `settledBootstrap`).
    [...new Set([...bootstrapComponents.map(c => c.name), ...settledSelfUpdate, ...settledNoDelta])],
  );

  const summary: RunSummary = {
    applied,
    skipped,
    failed,
    newHeadSha,
    componentsAdvanced: advancement.componentsAdvanced,
    componentsHeldBack: advancement.componentsHeldBack,
    backupDir,
    localEditsOverwritten,
    packageJsonKept,
    packageJsonAppended,
    testSiblingsHeldBack,
    ...cleanupFacts,
    ...repairFacts,
  };

  // State write
  if (!opts.dryRun) {
    const baseV7: SyncStateV7 = v7State ?? {
      schemaVersion: 7,
      templateRepo: cfg.templateRepo,
      templateCommit: '',
      perComponentCommit: {},
      syncedComponents: [],
      ignoreFileSync: {},
      packageJsonSync: {},
      cliVersion: cfg.cliVersion,
      lastSyncedAt: new Date().toISOString(),
      variableSystemVersion: 1,
    };
    const nextState = advanceSyncStateV7(baseV7, summary, cfg.components, newHeadSha, cfg.cliVersion);
    // The lock is updater-owned and gets committed with the sync: a run that
    // changed nothing in it must not dirty it just to bump the timestamp.
    let existingLock: string | null = null;
    try { existingLock = fs.readFileSync(path.join(repoRoot, cfg.versionFile), 'utf8'); }
    catch { existingLock = null; }
    if (syncStateWriteNeeded(existingLock, nextState)) {
      writeSyncStateV7(repoRoot, cfg.versionFile, nextState, makeCoreLoggerFromSink(sink));
    }
    else {
      sink.step(`Lock sin cambios (${cfg.versionFile} intacto).`);
    }
  }

  // After-apply hooks, the last-apply record, temp dir cleanup.
  return finish(summary);
}

// ============================================================================
// SINK ↔ CoreLogger ADAPTER (Phase B)
// ============================================================================

/**
 * Adapt a ReportSink into the CoreLogger contract expected by lower-level helpers
 * (`applyResolution`, `writeSyncState`, etc.). The sink's `step` is mapped to
 * `info` and `success`; `warn` to `warning`; `error` to `error`; `merge` is
 * mapped to `step` (informational by nature).
 */
export function makeCoreLoggerFromSink(sink: ReportSink): CoreLogger {
  return {
    info: msg => sink.step(msg),
    success: msg => sink.step(msg),
    warning: msg => sink.warn(msg),
    error: msg => sink.error(msg),
    step: msg => sink.step(msg),
    merge: msg => sink.step(msg),
  };
}

// ============================================================================
// FILE LABEL HELPER (Phase B — used by sink.pickFiles)
// ============================================================================

/**
 * Format a file label for the multiselect: `[badge] path +A/-D`.
 *   - badge: `M!` for diverged, `+` for new-upstream, `D` for deleted-upstream,
 *            `M` for clean-fastforward
 */
export function formatFileLabel(entry: DeltaEntry): string {
  let badge: string;
  switch (entry.classification) {
    case 'locally-diverged':
      badge = 'M!';
      break;
    case 'new-upstream':
      badge = '+';
      break;
    case 'deleted-upstream':
      badge = 'D';
      break;
    case 'clean-fastforward':
      badge = 'M';
      break;
    default:
      badge = entry.status;
  }
  const stats = entry.added || entry.removed ? `  +${entry.added}/-${entry.removed}` : '';
  return `[${badge}] ${entry.path}${stats}`;
}
