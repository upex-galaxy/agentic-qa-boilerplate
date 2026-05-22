/**
 * @fileoverview Shared type contracts for the boilerplate updater (Phase A).
 *
 * Holds:
 *  - Legacy schema interfaces (`SyncStateV5`, `SyncStateV6`) kept for migration / detection.
 *  - Target v7 schema (`SyncStateV7`) — not yet consumed in Phase A wrapper; Phase B+ wires it.
 *  - Generic delta + apply contracts (`Component`, `DeltaEntry`, `Resolution`, `RunSummary`, ...).
 *  - Forward-declared `IgnoreFileSpec` / `IgnoreDelta` (consumed by `updater-ignore.ts`).
 *  - Forward-declared `ReportSink` + `UpdaterConfig` skeletons (Phase B will populate the
 *    full TUI binding; in Phase A they only exist as types so call-sites compile).
 *
 * No runtime logic lives here.
 */

// ============================================================================
// SCHEMA — sync state (`.template/boilerplate.lock.json`)
// ============================================================================

/**
 * v5 — legacy schema, detection only. Field `variableSystemVersion` was a boolean.
 * No `schemaVersion`, no `perComponentCommit`.
 */
export interface SyncStateV5 {
  lastSync: string
  templateCommit: string
  cliVersion: string
  syncedComponents: string[]
  variableSystemVersion: boolean
}

/**
 * v6 — current production schema.
 * `perComponentCommit` is the per-component SHA cursor; `variableSystemVersion` is a number.
 */
export interface SyncStateV6 {
  schemaVersion: 6
  lastSync: string // ISO-8601 UTC
  templateCommit: string // last successfully synced HEAD SHA
  cliVersion: string // CLI_VERSION at sync time (e.g. '6.0')
  syncedComponents: string[]
  variableSystemVersion: number
  perComponentCommit: Record<string, string>
}

/**
 * v7 — target schema (master plan §3.4). Not yet read or written by Phase A code;
 * defined here so Phase B/C can flip over without re-touching types.
 *
 * Differences vs v6:
 *  - adds `templateRepo` (explicit per-repo so the same updater-core can drive both DEV + QA)
 *  - renames `lastSync` → `lastSyncedAt` (matches QA's v6 nomenclature)
 *  - adds `ignoreFileSync` for `.gitignore` / `.prettierignore` append-only tracking
 */
export interface IgnoreFileSyncState {
  lastSyncedSha: string // blob SHA of the upstream ignore file when last compared
  appendedLines: string[] // lines previously appended via applyIgnoreAppend (de-dup source)
}

export interface SyncStateV7 {
  schemaVersion: 7
  templateRepo: string
  templateCommit: string
  perComponentCommit: Record<string, string>
  syncedComponents: string[]
  ignoreFileSync: Record<string, IgnoreFileSyncState>
  cliVersion: string
  lastSyncedAt: string // ISO-8601 UTC
  variableSystemVersion: number
}

export type SyncState = SyncStateV5 | SyncStateV6 | SyncStateV7;

// Legacy SyncVersion (pre-v5 in this codebase) — still emitted by `recordSyncVersion()`.
export interface SyncVersion {
  lastSync: string
  templateCommit: string
  cliVersion: string
  syncedComponents: string[]
  variableSystemVersion: boolean
}

/**
 * Thrown by `readSyncState` when the lock file is unparseable / unrecognised.
 * Wrapper catches this to print a friendly error before exiting.
 */
export class CorruptStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptStateError';
  }
}

// ============================================================================
// COMPONENTS / DELTA
// ============================================================================

export type ComponentKind = 'directory' | 'file-list' | 'mixed';

export interface Component {
  name: string
  type: ComponentKind
  paths: string[]
  files?: string[]
  /**
   * When true, the component's files are bootstrap-only:
   *   - if local file EXISTS → classifier forces `unchanged` (never offered as diverged)
   *   - if local file MISSING → classifier forces `new-upstream` (bootstrap copy)
   */
  bootstrapOnly?: boolean
}

export type ChangeStatus = 'M' | 'A' | 'D';

export type FileClass
  = 'clean-fastforward'
    | 'locally-diverged'
    | 'new-upstream'
    | 'deleted-upstream'
    | 'binary-skip'
    | 'unchanged';

export interface DeltaEntry {
  component: string
  path: string
  status: ChangeStatus
  fromSha: string
  toSha: string
  added: number
  removed: number
  isBinary: boolean
  templateOldSha: string | null
  templateNewSha: string | null
  classification: FileClass
}

export type Resolution = 'theirs' | 'mine' | 'skip' | 'delete' | 'keep';

export interface AppliedFile {
  entry: DeltaEntry
  resolution: Resolution
}

export interface FailedFile {
  entry: DeltaEntry
  reason: string
}

export interface RunSummary {
  applied: AppliedFile[]
  skipped: DeltaEntry[]
  failed: FailedFile[]
  newHeadSha: string
  componentsAdvanced: string[]
  componentsHeldBack: string[]
}

export interface MergeResult {
  success: number
  errors: number
}

/**
 * One deprecated upstream file that should be removed during sync (DEV-only currently).
 */
export interface DeprecatedFile {
  path: string
  component: string
  reason: string
  deprecatedSince: string
}

export interface GitVersion {
  major: number
  minor: number
  patch: number
  raw: string
}

// ============================================================================
// LOGGER — minimal interface used by core building blocks to preserve
// runtime stdout parity without dragging picocolors / inquirer into core.
//
// The wrapper supplies a real logger (mapped to the existing `log*` helpers).
// In tests / non-wrapper consumers, pass the `silentLogger` from `updater-core`.
// ============================================================================

export interface CoreLogger {
  info: (msg: string) => void
  success: (msg: string) => void
  warning: (msg: string) => void
  error: (msg: string) => void
  step: (msg: string) => void
  merge: (msg: string) => void
}

// ============================================================================
// IGNORE-FILE handler contracts (Phase A — defined for `updater-ignore.ts`)
// ============================================================================

export interface IgnoreFileSpec {
  /** Repo-relative file path, e.g. '.gitignore' */
  path: string
  /** Comment marker for the synced block, e.g. '# ===== Synced from boilerplate' */
  sentinel: string
}

export interface IgnoreDelta {
  file: string
  /** Lines present in upstream not in local — candidate appends (default checked in TUI). */
  upstreamOnlyLines: string[]
  /** FYI only — local-only lines that exist nowhere upstream. NEVER removed. */
  localOnlyLines: string[]
  /** Lines previously appended via this handler (from state.ignoreFileSync[file].appendedLines). */
  alreadySynced: string[]
}

// ============================================================================
// PHASE A — forward-declared skeletons for Phase B integration.
// Not consumed by any Phase A code path; included so call-sites and external
// consumers can compile against the final surface area today.
// ============================================================================

export interface ScopeOption {
  name: string
  changedCount: number
  divergedCount: number
}

/**
 * Stats passed to `pickScopeStrategy` so the sink can show line-delta totals
 * alongside the file count for the scope.
 */
export interface ScopeStats {
  changedCount: number
  divergedCount: number
  addedTotal: number
  removedTotal: number
}

export type ScopeStrategy = 'all' | 'pick' | 'skip';

export interface FileOption {
  entry: DeltaEntry
  label: string
}

export interface IgnoreLineOption {
  /** The exact ignore-pattern line (value submitted by multiselect). */
  value: string
  /** Display label (typically the same as `value`). */
  label: string
  /** Whether the line is checked by default in the multiselect. */
  checked: boolean
}

export interface PairedDiff {
  templateDiff: string
  localDiff: string
}

/**
 * Skeleton sink the TUI binds in Phase B. In Phase A this only exists for type-checking
 * — `runUpdate` is not yet exported from core, so no Phase A code passes a real sink.
 */
export interface ReportSink {
  phase: (n: 1 | 2 | 3 | 4 | 5, label: string) => void
  /**
   * Sub-phase banner — used for Phase 4.5 (IGNORE LINES) and any future
   * intermediate phases that don't warrant a full numbered phase header.
   * Lighter visual weight than `phase`. No-op for non-TTY / auto mode is
   * the sink's choice.
   */
  subphase: (label: string) => void
  step: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
  spinner: () => { start: (m: string) => void, stop: (m?: string) => void }
  /**
   * Generic yes/no prompt used by the core for migration prompts (v5→v6, v6→v7)
   * and per-file diff-preview confirms (Fallback (b) per master plan §3.6).
   * Returns `false` on user cancel / Ctrl-C.
   */
  confirm: (message: string, defaultValue?: boolean) => Promise<boolean>
  pickScopes: (scopes: ScopeOption[]) => Promise<string[]>
  /**
   * Optional Phase-4 hook: per-scope strategy prompt. If implemented the core
   * asks per scope whether to accept all files, pick individually, or skip the
   * scope entirely — avoiding the long multiselect when users want a blanket
   * accept. Sinks that don't implement this fall back to the legacy pickFiles
   * flow (multiselect over every file in the scope).
   */
  pickScopeStrategy?: (scope: string, stats: ScopeStats) => Promise<ScopeStrategy>
  pickFiles: (scope: string, files: FileOption[]) => Promise<DeltaEntry[]>
  pickIgnoreLines: (file: string, lines: IgnoreLineOption[]) => Promise<string[]>
  resolveDiverged: (entry: DeltaEntry, diff: PairedDiff) => Promise<Resolution>
  confirmDelete: (entry: DeltaEntry) => Promise<boolean>
  /**
   * Optional Phase-4 hook (Fallback (b) per master plan §3.6): after a
   * clean-fastforward or new-upstream file is selected, the core invokes this
   * to let the sink ask "show diff before applying?" and render the diff.
   */
  showDiff?: (entry: DeltaEntry, diff: PairedDiff) => Promise<void>
}

/**
 * Config injection contract (master plan §3.3). Wrapper builds one of these and
 * passes to `runUpdate` (Phase B+). In Phase A, the wrapper still uses the old
 * direct path and this interface is only here for forward compatibility.
 */
export interface UpdaterConfig {
  templateRepo: string
  cliVersion: string
  tempDir: string
  versionFile: string
  components: Component[]
  ignoreFiles: IgnoreFileSpec[]
  deprecatedFiles: DeprecatedFile[]
  bootstrapOnlyPaths: string[]
  agentsFrameworkFiles?: string[]
  /**
   * Optional component name (e.g. `'cli'`) whose files contain the updater itself.
   * When set, runUpdate performs a Phase 0 self-update: if any file under this
   * component differs from upstream, files are overwritten locally and the
   * process re-execs itself so the new code runs the rest of the flow. The
   * child sets `UPEX_UPDATER_REEXEC=1` to prevent infinite re-exec loops.
   */
  selfUpdateComponent?: string
  hooks?: {
    afterApply?: (summary: RunSummary) => Promise<void>
    skillsResolver?: (templateDir: string) => string[]
  }
}

// ============================================================================
// PARSED CLI ARGS — kept exported so the wrapper's parseArgs can return it.
// Repo-specific commands stay union-typed via plain string[] to avoid pinning
// updater-core to a particular repo's command vocabulary.
// ============================================================================

export interface ParsedArgs {
  commands: string[]
  help: boolean
  dryRun: boolean
  rollback: boolean
  auto: boolean
  /** Repo-specific subcommand value (e.g. DEV's MCP agent). Typed loosely on purpose. */
  updateMcpTemplate: string | null
}
