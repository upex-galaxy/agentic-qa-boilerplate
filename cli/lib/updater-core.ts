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
  ChangeStatus,
  Component,
  CoreLogger,
  DeltaEntry,
  FailedFile,
  FileClass,
  GitVersion,
  IgnoreDelta,
  IgnoreLineOption,
  PackageJsonDelta,
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
 * `agentsBootstrapFiles` (for the `agents` component's basename allowlist).
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
  const basename = path.basename(entry.path);
  const isFrameworkExempt = (
    component?.bootstrapOnly === true
    && component.frameworkFiles?.includes(basename) === true
  );
  const isBootstrapFile = !isFrameworkExempt && (
    (component?.bootstrapOnly === true)
    || (entry.component === 'agents' && agentsBootstrapFiles.includes(basename))
  );
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
      ) as unknown as Buffer;
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
  return dedupeDeltaByPath(delta, components, componentIndex, logger);
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

      const basename = path.basename(relPath);
      const isFrameworkExempt = component.bootstrapOnly === true
        && component.frameworkFiles?.includes(basename) === true;
      const isBootstrapFile = !isFrameworkExempt && (
        component.bootstrapOnly === true
        || (component.name === 'agents' && agentsBootstrapFiles.includes(basename))
      );

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
 *   - `paths: ['.claude/skills']` matches `.claude/skills/foo`; specificity 14.
 *
 * Used by `dedupeDeltaByPath` to pick the most-specific owner when two
 * components both match a file.
 */
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
 */
export function computeComponentAdvancement(
  summary: {
    applied: AppliedFile[]
    skipped: DeltaEntry[]
    failed: FailedFile[]
  },
  deferredEntries: DeltaEntry[] = [],
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
  return {
    componentsAdvanced: [...allEntryComponents].filter(c => !blockedComponents.has(c)),
    componentsHeldBack: [...blockedComponents],
  };
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

/**
 * Advance perComponentCommit SHAs for a v7 state — mirror of `advanceSyncState`
 * but preserves the v7-only `ignoreFileSync` block.
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

  // Verify gh auth (the wrapper has already done a pre-flight check, but the
  // window between that check and this clone can be long; re-check is cheap).
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  }
  catch {
    throw new Error('GH_AUTH_MISSING');
  }

  try {
    execSync(
      `gh repo clone ${templateRepo} "${dest}" -- --filter=blob:none --no-checkout --quiet`,
      { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 },
    );
  }
  catch (error) {
    const err = error as { killed?: boolean };
    if (err.killed) { throw new Error('CLONE_TIMEOUT'); }
    throw new Error('CLONE_FAILED');
  }

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
 * Shallow clone fallback (no sparse-checkout). Used when partialCloneTemplate fails.
 */
export async function shallowCloneTemplate(templateRepo: string, dest: string): Promise<void> {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  }
  catch {
    throw new Error('GH_AUTH_MISSING');
  }
  try {
    execSync(
      `gh repo clone ${templateRepo} "${dest}" -- --depth 1 --quiet`,
      { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 },
    );
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
 * Remove files in `cfg.deprecatedFiles` from the local repo. Honors dryRun.
 * Returns the count of files actually removed (or that would be removed in dry-run).
 */
export function cleanupDeprecated(
  cfg: UpdaterConfig,
  repoRoot: string,
  dryRun: boolean,
  logger: CoreLogger = silentLogger,
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
      fs.unlinkSync(path.join(repoRoot, dep.path));
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
  opts: { auto: boolean, dryRun: boolean, rollback: boolean, force?: boolean },
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

  // --- DIRTY WORKING TREE GUARD (data-loss safety, pre-fetch) ---
  // Pre-write backups live in .backups/, which is gitignored — so an
  // uncommitted user who proceeds and later runs `git clean` / `git stash` can
  // lose both the working copy and the backup. Refuse on a dirty tree unless
  // --force; interactive mode offers an explicit override.
  if (!opts.dryRun && !opts.force) {
    let dirty = '';
    try {
      dirty = execSync(`git -C "${repoRoot}" status --porcelain`, { encoding: 'utf8' }).trim();
    }
    catch {
      dirty = ''; // not a git repo / git unavailable — nothing to guard against
    }
    if (dirty) {
      sink.warn('El árbol de trabajo tiene cambios sin commitear. Los backups del updater van a .backups/ (gitignored); un `git clean` posterior podría perderlos. Commitea o haz stash antes de actualizar.');
      if (opts.auto) {
        sink.error('Abortado: árbol sucio en modo --auto. Re-ejecuta con --force para forzar.');
        return emptySummary;
      }
      const proceed = await sink.confirm('¿Continuar de todas formas pese a los cambios sin commitear?', false);
      if (!proceed) {
        return emptySummary;
      }
    }
  }

  // --- STATE LOAD + MIGRATION (pre-Phase 1) ---
  let rawState: SyncState | null;
  try {
    rawState = readSyncState(repoRoot, cfg.versionFile);
  }
  catch (err) {
    if (err instanceof CorruptStateError) {
      sink.error(err.message);
      return emptySummary;
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
    const ok = opts.auto
      ? true
      : await sink.confirm(`Migrar esquema ${sourceLabel} → v7 (rastreo per-component SHA + ignore-files + flags ampliados)?`, true);
    if (!ok) {
      sink.warn('Migración cancelada. Ejecuta de nuevo cuando quieras migrar.');
      return emptySummary;
    }
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
  const fetchSpin = sink.spinner();
  fetchSpin.start(`Cloning upstream (${cfg.templateRepo})…`);
  const templateDir = cfg.tempDir;
  try {
    // Sparse-checkout must include component paths, ignore-file paths AND
    // package.json paths so Phase 4.5 / 4.5b can read them out of the partial clone.
    const sparsePatterns = [
      ...buildSparseCheckoutPatterns(cfg.components),
      ...cfg.ignoreFiles.map(spec => spec.path),
      ...(cfg.packageJsonSpecs ?? []).map(spec => spec.path),
    ];
    await partialCloneTemplate(cfg.templateRepo, cfg.tempDir, sparsePatterns);
    fetchSpin.stop(`Template descargado (sparse-checkout): ${cfg.templateRepo}`);
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
      return emptySummary;
    }
  }

  const newHeadSha = resolveTemplateHeadSha(templateDir);
  sink.step(`HEAD upstream: ${newHeadSha.slice(0, 7)}`);

  // --- SELF-UPDATE (before Phase 2) ---
  // If cfg.selfUpdateComponent points at the component that owns the updater
  // itself (e.g. `cli/`), refresh those files in-place and re-exec the script
  // so the rest of the flow runs against the fresh code. Skipped when the
  // child process is already a re-exec (UPEX_UPDATER_REEXEC=1).
  if (cfg.selfUpdateComponent && process.env.UPEX_UPDATER_REEXEC !== '1' && !opts.dryRun) {
    const selfComp = cfg.components.find(c => c.name === cfg.selfUpdateComponent);
    if (selfComp) {
      const selfFiles = collectComponentRelPaths(selfComp, templateDir);
      const stale: string[] = [];
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
          stale.push(relPath);
        }
      }
      if (stale.length > 0) {
        sink.warn(`Self-update: actualizando ${stale.length} archivo(s) del CLI antes de continuar…`);
        // A2: confirm before clobbering cli/. A user who customized the updater
        // gets a chance to bail; files are backed up + restorable via --rollback,
        // but .backups/ is gitignored, so the explicit OK matters. Auto skips.
        if (!opts.auto) {
          const okSelf = await sink.confirm(`Se reemplazarán ${stale.length} archivo(s) de cli/ (backup en .backups/, restaurable con --rollback). ¿Continuar?`, true);
          if (!okSelf) {
            sink.warn('Self-update cancelado. Re-ejecuta cuando quieras actualizar el CLI.');
            cleanupTempDir(cfg.tempDir);
            return emptySummary;
          }
        }
        // Pre-write backup contract: mirror each existing local file into a
        // fresh `.backups/update-<ts>/` before overwriting. Symmetric with
        // applyResolution's backup behavior. `bun run up --rollback` can then
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
        sink.step('Re-ejecutando con código actualizado…');
        const child = spawnSync(process.execPath, [process.argv[1], ...process.argv.slice(2)], {
          stdio: 'inherit',
          env: { ...process.env, UPEX_UPDATER_REEXEC: '1' },
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

  // --- PHASE 2 — DETECT ---
  sink.phase(2, 'DETECT');

  let entries: DeltaEntry[] = [];
  let bootstrapMode = false;
  let bootstrapComponents: Component[] = [];

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
        const basename = path.basename(relPath);
        const isBootstrapFile = component.bootstrapOnly === true
          || (component.name === 'agents' && (cfg.agentsFrameworkFiles ?? []).includes(basename) === false
            && cfg.bootstrapOnlyPaths.some(p => relPath === p || relPath.endsWith(`/${basename}`)));
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
      const agentsBootstrapBasenames = cfg.bootstrapOnlyPaths
        .filter(p => p.startsWith('.agents/'))
        .map(p => path.basename(p));

      // Content reconcile (Profundidad B) is the authoritative source for
      // new + diverged files: it walks the FULL upstream tree and compares by
      // blob SHA, independent of the cursor — so missing files and local edits
      // are always caught (a git-log delta keyed on the cursor misses both).
      const reconciled = reconcileComponentsByContent(
        templateDir,
        deltaComponents,
        repoRoot,
        agentsBootstrapBasenames,
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
        agentsBootstrapBasenames,
        makeCoreLoggerFromSink(sink),
      );
      const deletes = deltaEntries.filter(e => e.classification === 'deleted-upstream');

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
  // .claude/skills/REGISTRY.md). One filter point covers all three detection
  // paths — bootstrap, content reconcile, and git-log delta — since they all
  // feed into `entries`. Each repo regenerates these from its own state.
  if (cfg.excludePaths && cfg.excludePaths.length > 0) {
    const excluded = new Set(cfg.excludePaths.map(p => p.replace(/\\/g, '/')));
    entries = entries.filter(e => !excluded.has(e.path.replace(/\\/g, '/')));
  }

  // Filter out unchanged / binary-skip from the user-facing pool
  const visible = entries.filter(
    e => e.classification !== 'unchanged' && e.classification !== 'binary-skip',
  );

  // Summary table per component
  const perComp = new Map<string, { changed: number, diverged: number }>();
  for (const e of visible) {
    const slot = perComp.get(e.component) ?? { changed: 0, diverged: 0 };
    slot.changed++;
    if (e.classification === 'locally-diverged') { slot.diverged++; }
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

  if (visible.length === 0 && ignoreDeltasPre.length === 0 && pkgJsonDeltasPre.length === 0) {
    sink.step('Sin cambios detectados respecto al upstream. Nada que sincronizar.');
    return emptySummary;
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
  else {
    sink.step(`Sin cambios de archivos — solo keys nuevas en ${pkgJsonDeltasPre.length} package.json.`);
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
  let backupDir: string | null = null;
  const ensureBackup = (): string => {
    if (backupDir === null) {
      backupDir = createBackupDir(repoRoot);
    }
    return backupDir;
  };

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
      selected = [];
      for (const item of plan) {
        if (item.resolution === 'skip') {
          skipped.push(item.entry);
          continue;
        }
        // Apply directly
        if (opts.dryRun) {
          sink.step(`[dry-run] aplicaría: ${item.entry.path}`);
          applied.push(item);
          continue;
        }
        try {
          await applyResolution(
            item.entry,
            item.resolution,
            templateDir,
            repoRoot,
            ensureBackup(),
            false,
            makeCoreLoggerFromSink(sink),
          );
          applied.push(item);
        }
        catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ entry: item.entry, reason: msg });
        }
      }
      continue;
    }

    // Interactive: per-scope strategy prompt (all/pick/skip) when the sink
    // implements pickScopeStrategy; otherwise fall back to direct multiselect.
    const scopeStats = scopeFiles.reduce(
      (acc, e) => {
        acc.addedTotal += e.added;
        acc.removedTotal += e.removed;
        if (e.classification === 'locally-diverged') { acc.divergedCount++; }
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
      if (entry.classification === 'locally-diverged') {
        // Upstream is canonical for framework files — no skip/mine prompt.
        // The user already controls inclusion via scope/file selection above;
        // a SELECTED diverged file is overwritten wholesale ('theirs'). Backup
        // is taken inside applyResolution, so --rollback restores it.
        if (opts.dryRun) {
          sink.step(`[dry-run] sobreescribiría con upstream: ${entry.path}`);
          applied.push({ entry, resolution: 'theirs' });
          continue;
        }
        try {
          await applyResolution(
            entry,
            'theirs',
            templateDir,
            repoRoot,
            ensureBackup(),
            false,
            makeCoreLoggerFromSink(sink),
          );
          applied.push({ entry, resolution: 'theirs' });
        }
        catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ entry, reason: msg });
        }
        continue;
      }

      if (entry.classification === 'deleted-upstream') {
        const wantsDelete = await sink.confirmDelete(entry);
        if (!wantsDelete) {
          skipped.push(entry);
          continue;
        }
        if (opts.dryRun) {
          sink.step(`[dry-run] eliminaría: ${entry.path}`);
          applied.push({ entry, resolution: 'delete' });
          continue;
        }
        try {
          await applyResolution(
            entry,
            'delete',
            templateDir,
            repoRoot,
            ensureBackup(),
            false,
            makeCoreLoggerFromSink(sink),
          );
          applied.push({ entry, resolution: 'delete' });
        }
        catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ entry, reason: msg });
        }
        continue;
      }

      // clean-fastforward / new-upstream → optional diff preview, then apply 'theirs'.
      // Only ask when user explicitly chose 'pick' (audit mode); 'all' means
      // blanket accept — no preview prompts.
      if (sink.showDiff && strategy === 'pick') {
        const paired = buildPairedDiff(entry, templateDir, repoRoot);
        await sink.showDiff(entry, paired);
      }
      if (opts.dryRun) {
        sink.step(`[dry-run] aplicaría: ${entry.path}`);
        applied.push({ entry, resolution: 'theirs' });
        continue;
      }
      try {
        await applyResolution(
          entry,
          'theirs',
          templateDir,
          repoRoot,
          ensureBackup(),
          false,
          makeCoreLoggerFromSink(sink),
        );
        applied.push({ entry, resolution: 'theirs' });
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ entry, reason: msg });
      }
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
          // 'skip' → record nothing (re-prompts next run by design)
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

  // Deprecated cleanup runs AFTER apply, BEFORE state write
  if (!opts.dryRun) {
    cleanupDeprecated(cfg, repoRoot, false, makeCoreLoggerFromSink(sink));
  }

  // Compute advancement
  const advancement = computeComponentAdvancement(
    { applied, skipped, failed },
    // Deferred-deletes are already represented in `skipped`, so no separate
    // deferred list is passed (the old `bootstrapMode ? [] : []` was a no-op).
    [],
  );

  const summary: RunSummary = {
    applied,
    skipped,
    failed,
    newHeadSha,
    componentsAdvanced: advancement.componentsAdvanced,
    componentsHeldBack: advancement.componentsHeldBack,
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
    writeSyncStateV7(repoRoot, cfg.versionFile, nextState, makeCoreLoggerFromSink(sink));
  }

  // After-apply hook (DEV uses for MCP template refresh, etc.)
  if (cfg.hooks?.afterApply) {
    try {
      await cfg.hooks.afterApply(summary);
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sink.warn(`afterApply hook falló: ${msg}`);
    }
  }

  // Cleanup temp dir
  cleanupTempDir(cfg.tempDir);

  return summary;
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
