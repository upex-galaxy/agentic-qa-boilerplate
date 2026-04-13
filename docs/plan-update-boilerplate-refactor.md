# Plan: Refactoring `cli/update-boilerplate.ts`

> **Purpose**: Self-contained implementation plan for a future AI session.
> **Context**: This is Task 6 from `docs/future-tasks.md` — the LAST task before shipping the boilerplate.
> **Status**: All prerequisite tasks (1-5, 7) are completed. The boilerplate now uses `{{VARIABLE}}` placeholders and `[TMS_TOOL]` pseudocode tags throughout.

---

## Background for the Orchestrator AI

### What is this script?

`cli/update-boilerplate.ts` is a CLI that downstream consumers run to pull updates from the boilerplate template into their project. It:

1. Clones the template repo (`upex-galaxy/ai-driven-test-automation-boilerplate`) to `/tmp/`
2. Backs up consumer's current files to `.backups/`
3. Copies updated files from template to consumer's project (one-way overwrite)
4. Supports interactive menu or CLI arguments for selective sync

### What changed in the boilerplate recently?

- **Project Variables system**: CLAUDE.md now has a `## Project Variables` table with `{{VARIABLE}}` placeholders. 26+ files in `.prompts/` and `.context/` use these variables.
- **Pseudocode Convention**: 25+ files now use `[TMS_TOOL]`, `[ISSUE_TRACKER_TOOL]`, etc. instead of hardcoded CLI commands.
- **New files**: `tms-architecture.md`, `tms-conventions.md`, `tms-workflow.md`, `cli/api-login.ts`
- **Variable propagation**: Jira URLs standardized to `{{JIRA_URL}}`, upex-galaxy refs made generic.

### The problem

Consumers who run `bun run update` will get files with `{{VARIABLE}}` placeholders but:
- No warning about unfilled placeholders
- No migration notice explaining the new variables system
- No guidance on what to do next
- Weak error handling if file operations fail

### Files to read before working

| File | Why |
|------|-----|
| `cli/update-boilerplate.ts` | The script to refactor (1,159 lines, 34 functions) |
| `CLAUDE.md` § Project Variables | The variables table consumers must fill |
| `CLAUDE.md` § Tool Resolution | Pseudocode convention reference |
| `docs/future-tasks.md` § Task 6 | Original requirements |
| `config/variables.ts` | Environment config pattern (for reference) |
| `cli/api-login.ts` | Example of well-structured CLI (for style reference) |

---

## Script Architecture Reference

### Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `TEMPLATE_REPO` | `'upex-galaxy/ai-driven-test-automation-boilerplate'` | Line 103 |
| `TEMP_DIR` | `join(tmpdir(), 'kata-boilerplate-update')` | Line 104 |
| `TOOLING_FILES` | `['.editorconfig', '.prettierrc', '.prettierignore']` | Line 736 |
| `EXAMPLE_FILES` | `['.mcp.example.json', 'dbhub.example.toml']` | Line 762 |

### Key Functions (by category)

**File Operations (the ones that need error handling fixes):**

| Function | Lines | What it does |
|----------|-------|-------------|
| `mergeDirectory()` | 524-542 | Recursive cpSync — the core copy function |
| `updatePrompts()` | 548-652 | Syncs `.prompts/` by stages/phases |
| `updateGuidelines()` | 654-665 | Syncs `.context/guidelines/` |
| `updateDocs()` | 667-678 | Syncs `docs/` |
| `updateCli()` | 680-691 | Syncs `cli/` |
| `updateTemplates()` | 693-704 | Syncs `templates/mcp/` (NOTE: this dir doesn't exist — see Fix 1) |
| `updateVscode()` | 706-717 | Syncs `.vscode/` |
| `updateHusky()` | 719-730 | Syncs `.husky/` |
| `updateTooling()` | 742-756 | Syncs editor config files |
| `updateExamples()` | 767-781 | Syncs example templates |
| `selfUpdate()` | 783-805 | Auto-updates this script |

**Infrastructure:**

| Function | Lines | What it does |
|----------|-------|-------------|
| `createBackup()` | 430-459 | Creates timestamped backup |
| `cloneTemplate()` | 465-518 | Clones repo via `gh` CLI |
| `cleanup()` | 807-809 | Removes temp dir |
| `validatePrerequisites()` | 400-424 | Checks `gh` CLI + auth |

**Main flow:** `main()` at line 999. Two paths: interactive (no args) and direct (with args).

### What Gets Synced vs Preserved

**Synced (overwritten from template):**
`.prompts/`, `.context/guidelines/`, `docs/`, `cli/`, `templates/`, `.vscode/`, `.husky/`, `.editorconfig`, `.prettierrc`, `.prettierignore`, `.mcp.example.json`, `dbhub.example.toml`

**Preserved (never touched):**
`CLAUDE.md`, `README.md`, `config/`, `tests/`, `.github/`, `package.json`, `tsconfig.json`, `.env`, `.context/PBI/`, `.context/PRD/`, `.context/SRS/`

---

## Implementation Phases

### Phase 1: Fixes (Critical — must complete)

#### Fix 1: `updateTemplates()` references non-existent `templates/mcp/`

**Problem**: Line 693 syncs `templates/mcp/` but that directory does not exist. The `templates/` directory is flat with only `README.md` and `sprint-testing-prompt.md`.

**Fix**: Update `updateTemplates()` to sync the entire `templates/` directory instead of `templates/mcp/`. Update the log message and menu description accordingly.

**Changes**:
- `updateTemplates()` lines 693-704: Change source path from `join(TEMP_DIR, 'templates', 'mcp')` to `join(TEMP_DIR, 'templates')`
- Update the `showMainMenu()` description from "MCP Templates (templates/mcp/)" to "Templates (templates/)"
- Update `showHelp()` text accordingly

---

#### Fix 2: Error handling in `mergeDirectory()` and all update functions

**Problem**: `mergeDirectory()` (line 524) has no try-catch. If any `cpSync` fails (permission denied, disk full), the entire sync aborts and subsequent components are silently skipped. The backup is not restored.

**Fix**: Wrap file operations in try-catch. Log individual file failures without aborting. Return success/failure status.

**Changes**:
```
mergeDirectory() → Add try-catch around cpSync, log warning on failure, continue
All update*() functions → Add try-catch around mergeDirectory calls
main() → Track and report failed components at end
```

**Implementation pattern**:
```typescript
function mergeDirectory(srcDir: string, destDir: string, prefix = ''): { success: number, errors: number } {
  let success = 0;
  let errors = 0;
  mkdirSync(destDir, { recursive: true });
  const items = readdirSync(srcDir, { withFileTypes: true });
  for (const item of items) {
    const srcPath = join(srcDir, item.name);
    const destPath = join(destDir, item.name);
    try {
      if (item.isDirectory()) {
        const sub = mergeDirectory(srcPath, destPath, `${prefix}  `);
        success += sub.success;
        errors += sub.errors;
      } else {
        cpSync(srcPath, destPath);
        success++;
      }
    } catch (err) {
      log.warning(`${prefix}Skipped ${item.name}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }
  return { success, errors };
}
```

---

#### Fix 3: Post-sync variable detection and warning

**Problem**: After sync, files contain `{{VARIABLE}}` placeholders. If consumer's CLAUDE.md doesn't have these variables filled, the prompts are unusable. No warning is shown.

**Fix**: After all sync operations complete, scan synced files for `{{VARIABLE}}` patterns and check against CLAUDE.md. Print a clear warning with actionable next steps.

**New function**: `detectUnfilledVariables()`

**Logic**:
1. Read consumer's `CLAUDE.md`
2. Extract variable names from the `## Project Variables` table
3. Check which variables have placeholder values (contain `[`, `example`, `myproject`, etc.)
4. Scan all synced files for `{{VARIABLE_NAME}}` patterns
5. Cross-reference: which used variables are still unfilled in CLAUDE.md?
6. Print warning with list of unfilled variables and file counts

**Output example**:
```
⚠ [update] Variables need configuration in CLAUDE.md:

   Variable              Used in    Status
   ─────────────────────────────────────────
   {{PROJECT_KEY}}       18 files   ⚠ Still placeholder
   {{JIRA_URL}}          10 files   ⚠ Still placeholder
   {{DEFAULT_ENV}}        6 files   ✓ Configured
   {{WEBAPP_DOMAIN}}      1 file    ⚠ Still placeholder

ℹ Open CLAUDE.md and fill the Project Variables table.
ℹ Or run this prompt in your AI assistant:

   @.prompts/utilities/context-engineering-setup.md

  This will guide you through configuring your project variables.
```

**Call site**: After all sync functions and before `cleanup()` in `main()`.

---

#### Fix 4: Migration notice for pre-variables consumers

**Problem**: Consumers upgrading from pre-variables boilerplate don't know the system changed. They get `{{VARIABLE}}` placeholders with no context.

**Fix**: Before starting sync, detect if consumer is on a pre-variables version. Show a migration banner with explanation and a copy-paste prompt.

**New function**: `checkMigrationNeeded()`

**Detection logic**:
1. Check if `CLAUDE.md` exists
2. Check if it contains `## Project Variables` section
3. If not → consumer is pre-variables → show migration notice

**Migration notice content**:
```
╔══════════════════════════════════════════════════════════════╗
║                    UPGRADE NOTICE                            ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  This boilerplate now uses Project Variables.                ║
║  All prompts use {{VARIABLE}} placeholders that resolve     ║
║  from your CLAUDE.md configuration.                          ║
║                                                              ║
║  AFTER this update completes, run this prompt:               ║
║                                                              ║
║    @.prompts/utilities/context-engineering-setup.md           ║
║                                                              ║
║  This will update your CLAUDE.md with the new variables      ║
║  table and configure it for your project.                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

**Call site**: In `main()`, after `validatePrerequisites()` and before `createBackup()`.

---

### Phase 2: Enhancements (Should-have — implement after fixes)

#### Enhancement 1: `--dry-run` mode

**Purpose**: Let consumers preview what would change before committing.

**Changes**:
- Add `dryRun: boolean` to `ParsedArgs`
- Parse `--dry-run` flag in `parseArgs()`
- In each `update*()` function, if `dryRun` is true: count files and log "Would sync N files to X/" without copying
- Skip backup and cleanup in dry-run mode
- Add `--dry-run` to `showHelp()` documentation

**Usage**: `bun run update all --dry-run`

---

#### Enhancement 2: Version tracking with `.boilerplate-version.json`

**Purpose**: Track which version of the template the consumer last synced from. This enables:
- The script to know if the consumer is outdated
- Future `bun run update --check` command to show "you are N commits behind"
- Migration detection (more reliable than checking CLAUDE.md content)

**File location**: Project root, `.boilerplate-version.json`
**Should be**: Committed to consumer's repo (informational, not secret)

**Structure**:
```json
{
  "lastSync": "2026-04-13T...",
  "templateCommit": "abc123...",
  "syncedComponents": ["prompts", "guidelines", "docs", "cli"],
  "variableSystemVersion": 1
}
```

**New function**: `recordSyncVersion(syncedComponents: string[])`
**Call site**: After successful sync, before cleanup

The `variableSystemVersion` field is key — it enables migration detection:
- If file doesn't exist → first-time consumer or pre-variables (show full migration)
- If `variableSystemVersion < 1` → pre-variables consumer (show migration)
- If `variableSystemVersion >= 1` → post-variables (show variable check only)

---

#### Enhancement 3: Improved self-update with version check

**Problem**: Current `selfUpdate()` (line 783) blindly overwrites the script if files differ, without warning about breaking changes.

**Fix**:
- Extract a `CLI_VERSION` constant at top of file (e.g., `const CLI_VERSION = '5.1'`)
- Before overwriting, check if template version is newer
- Log what changed: "Updating cli/update-boilerplate.ts from v5.0 to v5.1"
- If major version changes (5.x → 6.x), prompt for confirmation

---

#### Enhancement 4: Rollback command

**Purpose**: Allow consumers to revert a bad update from `.backups/`.

**New command**: `bun run update --rollback`

**Logic**:
1. List available backups in `.backups/` sorted by date
2. Let user select which backup to restore (or use most recent)
3. Copy backup contents back to project root
4. Log what was restored

---

### Phase 3: Polish (Nice-to-have — future session)

#### Polish 1: Conflict detection for customized files
- Before overwriting, use `git diff` to detect locally-modified files
- Warn user and offer to skip or backup individually

#### Polish 2: `--skip` and `--only` component filters
- `bun run update all --skip docs,tooling`
- `bun run update --only prompts,cli`

#### Polish 3: Post-sync summary report
- Print table of components synced with file counts
- Show new files added, existing files updated
- Show backup location

---

## Variable Inventory (for Fix 3 implementation)

Variables defined in CLAUDE.md that need checking:

| Variable | Used in N files | Most common locations |
|----------|-----------------|----------------------|
| `{{PROJECT_KEY}}` | 30+ | `.prompts/`, `.context/guidelines/tms-*` |
| `{{JIRA_URL}}` | 10 | `.prompts/`, `.context/guidelines/TAE/` |
| `{{DEFAULT_ENV}}` | 6 | `.prompts/`, `docs/` |
| `{{TMS_CLI}}` | 18 | `templates/sprint-testing-prompt.md` |
| `{{PROJECT_NAME}}` | 3 | `templates/` |
| `{{WEBAPP_DOMAIN}}` | 1 | `.context/test-management-system.md` |
| `{{API_URL_LOCAL}}` | 2 | `.context/guidelines/TAE/` |
| Other env/stack vars | ~30 | Mostly `templates/sprint-testing-prompt.md` |

**Total**: ~46 unique variable occurrences across 27 files.

**Note**: `ci-cd-integration.md` has 42 `{{ }}` matches but many are GitHub Actions syntax (`${{ secrets.X }}`), not project variables. The detection function must distinguish between `{{PROJECT_KEY}}` (uppercase, our convention) and `${{ secrets.X }}` (GitHub Actions).

**Regex recommendation**: `/\{\{([A-Z][A-Z_]+)\}\}/g` — matches only UPPERCASE variables, excludes GitHub Actions `${{ }}` syntax.

---

## Implementation Order

```
1. Fix 1: updateTemplates() path correction           (5 min)
2. Fix 2: Error handling in mergeDirectory()           (30 min)
3. Fix 3: detectUnfilledVariables()                    (1 hour)
4. Fix 4: Migration notice                             (30 min)
5. Enhancement 1: --dry-run mode                       (45 min)
6. Enhancement 2: .boilerplate-version.json            (30 min)
7. Enhancement 3: Self-update version check            (20 min)
8. Enhancement 4: Rollback command                     (45 min)
```

**Total estimated**: ~4-5 hours

---

## Testing Checklist

After implementation, verify these scenarios:

- [ ] `bun run update --help` shows dry-run, rollback, and version flags
- [ ] `bun run update all --dry-run` previews changes without modifying files
- [ ] `bun run update all` on a pre-variables project shows migration notice
- [ ] `bun run update all` on a post-variables project shows variable check
- [ ] Variables warning lists unfilled placeholders with file counts
- [ ] Warning includes copy-paste prompt for `@.prompts/utilities/context-engineering-setup.md`
- [ ] `.boilerplate-version.json` is created after successful sync
- [ ] `bun run update --rollback` restores from latest backup
- [ ] File copy failure logs warning but doesn't abort entire sync
- [ ] Self-update detects version change and logs it
- [ ] `updateTemplates()` syncs `templates/` (not `templates/mcp/`)

---

## Commit Strategy

| Order | Scope | Commit message |
|-------|-------|----------------|
| 1 | Fixes 1-2 | `fix: improve error handling and template path in update-boilerplate` |
| 2 | Fixes 3-4 | `feat: add variable detection and migration notice to update-boilerplate` |
| 3 | Enhancements 1-2 | `feat: add dry-run mode and version tracking to update-boilerplate` |
| 4 | Enhancements 3-4 | `feat: add self-update versioning and rollback to update-boilerplate` |
| 5 | future-tasks.md | `docs: mark Task 6 as completed in future-tasks.md` |
