# Curacity Sync Plan

> **Purpose**: Instructions for an AI orchestrator to execute all pending synchronization tasks in the Curacity repo, aligning it with Boilerplate improvements.
> **Delete this file** after all tasks are complete.

---

## Repositories

| Alias | Path | Role |
|-------|------|------|
| **CURACITY** | `/home/sai/Desktop/work-projects/curacity/qa-automation` | Target repo (execute changes here) |
| **BOILERPLATE** | `/home/sai/Desktop/upex/web-apps/ai-driven-test-automation-boilerplate` | Reference repo (read-only, use as template) |

**CRITICAL RULES:**

1. All changes target the **CURACITY** repo. NEVER modify the Boilerplate.
2. Curacity uses **Coda TMS** — keep all Coda-specific references (`bun coda`, canvas, Coda backlog). Do NOT genericize them.
3. Curacity's domain is **hotels/bookings** — keep all domain-specific content.
4. Preserve Curacity's unique content when restructuring. The Boilerplate provides **structure**, Curacity provides **content**.
5. Each task below is independent. Execute them in parallel where possible.
6. ALWAYS search for cross-references before deleting/renaming a file. Update ALL references.

---

## PART 1: FILE RESTRUCTURING

### Task C1: Move `context-generators/` files to canonical locations

**What**: The `context-generators/` folder should not exist as a separate directory. These generators belong in `discovery/` (system docs) and `utilities/` (project docs).

**Action**:

1. Move files:

| File | From | To |
|------|------|----|
| `api-architecture.md` | `.prompts/context-generators/` | `.prompts/discovery/` |
| `business-data-map.md` | `.prompts/context-generators/` | `.prompts/discovery/` |
| `project-test-guide.md` | `.prompts/context-generators/` | `.prompts/utilities/` |

2. Delete `.prompts/context-generators/README.md`
3. Delete `.prompts/context-generators/` directory

4. Update cross-references — search for `context-generators` across the entire repo and update all occurrences:

| File | What to change |
|------|----------------|
| `.prompts/README.md` | Remove `context-generators/` from directory tree. Update any paths pointing to the moved files. |
| `.prompts/utilities/README.md` | Add `project-test-guide.md` to the utilities list if not already present. |
| `.prompts/utilities/framework-doc-setup.md` | Update paths if it references `context-generators/` |
| `.context/system-prompt.md` | Update paths if it references `context-generators/` |
| `context-engineering.md` (root) | Update paths if it references `context-generators/` |
| `cli/update-prompts.js` | Update paths if it references `context-generators/` |

5. Verify with: `grep -r "context-generators" .prompts/ .context/ CLAUDE.md` — expect 0 results.

**Note**: The content of the moved files stays IDENTICAL. Only the location changes.

---

### Task C2: Rename `shift-left-testing.md` → `acceptance-test-plan.md`

**What**: The name "shift-left-testing" is too broad. The content is specifically about Triage + creating ATP/ATR/TCs. "acceptance-test-plan" is more accurate and matches Boilerplate convention.

**Important**: There is already a `legacy/acceptance-test-plan.md` file. This is the OLD deprecated version. Delete it first to avoid conflict.

**Action**:

1. Delete `.prompts/legacy/acceptance-test-plan.md` (it's already deprecated, replaced by shift-left-testing.md)
2. Rename: `.prompts/stage-1-planning/shift-left-testing.md` → `.prompts/stage-1-planning/acceptance-test-plan.md`
3. Inside the renamed file: update the title from `# Shift-Left Testing` to `# Acceptance Test Plan` (keep the rest of the content unchanged)

4. Update ALL cross-references — search for `shift-left-testing` across the entire repo:

| File | What to change |
|------|----------------|
| `.prompts/README.md` | `shift-left-testing.md` → `acceptance-test-plan.md` in directory tree AND in Quick Start flow |
| `.prompts/session-start.md` | `stage-1-planning/shift-left-testing.md` → `stage-1-planning/acceptance-test-plan.md` |
| `.prompts/us-qa-workflow.md` | All references (approx lines 102, 503) → `acceptance-test-plan.md` |
| `.prompts/bug-qa-workflow.md` | Any Stage 1 references |
| `.prompts/stage-1-planning/README.md` | File listing and descriptions |
| `.prompts/stage-3-reporting/test-report.md` | Reference at approx line 69 |
| `.prompts/utilities/traceability-fix.md` | If it references Stage 1 artifacts |
| `.context/guidelines/QA/README.md` | If it references the prompt |
| `.context/system-prompt.md` | If it references the prompt |
| `CLAUDE.md` | Any "Shift-Left" prompt references (keep the Shift-Left *principle* wording where it describes methodology, only change file path references) |

5. Verify with: `grep -r "shift-left-testing" .prompts/ .context/ CLAUDE.md` — expect 0 results for file paths (conceptual mentions of "shift-left" methodology are OK).

---

## PART 2: CONTENT SPLITTING

### Task C3: Split `exploratory-testing.md` into 4 files (Triforce)

**What**: Split the single Stage 2 prompt into 4 specialized prompts — one per testing layer. This reduces context window consumption since the AI only loads the layer it needs.

**IMPORTANT**: There are TWO `exploratory-testing.md` files in Curacity:
- `.prompts/stage-2-execution/exploratory-testing.md` — **THE PROMPT** (this is what we're splitting)
- `.context/guidelines/QA/exploratory-testing.md` — **THE METHODOLOGY GUIDELINE** (do NOT touch this)

**Source to read first**: Read the current `.prompts/stage-2-execution/exploratory-testing.md` in full to understand Curacity's unique content.

**Structural reference**: Read the 4 Boilerplate files for structure (NOT content):
- `BOILERPLATE/.prompts/stage-2-execution/smoke-test.md`
- `BOILERPLATE/.prompts/stage-2-execution/ui-exploration.md`
- `BOILERPLATE/.prompts/stage-2-execution/api-exploration.md`
- `BOILERPLATE/.prompts/stage-2-execution/db-exploration.md`

**Action**:

1. Create 4 new files in `.prompts/stage-2-execution/`:

#### `smoke-test.md`
- **Structure from**: Boilerplate's `smoke-test.md`
- **Purpose**: Quick 5-10 min deployment validation checklist
- **Curacity adaptations**:
  - Use Curacity's environment URLs (DevStage)
  - Reference Curacity's tools: Playwright CLI, Database MCP
  - Include hotel/booking domain examples where the Boilerplate has generic ones
  - Keep Coda CLI references for TMS artifact verification

#### `ui-exploration.md`
- **Structure from**: Boilerplate's `ui-exploration.md`
- **Purpose**: Deep UI exploration with Playwright MCP
- **Curacity content to distribute here**:
  - Exploration Charter (scope IN/OUT + timebox) — the UI-relevant parts
  - 7 Exploration Techniques table (UI-applicable techniques)
  - Exploration Log Format (Validated/Discovered/Observations/Not Tested)
  - Discovery Decision Framework (Bug? New TC? Observation?)
  - TCs as Guides philosophy
  - Any Playwright-specific exploration patterns from the original

#### `api-exploration.md`
- **Structure from**: Boilerplate's `api-exploration.md`
- **Purpose**: Deep API exploration with Postman/OpenAPI MCP
- **Curacity content to distribute here**:
  - Exploration Charter — API-relevant scope
  - 7 Exploration Techniques — API-applicable techniques
  - API-specific patterns from the original
  - Reference Curacity's OpenAPI MCP and API architecture

#### `db-exploration.md`
- **Structure from**: Boilerplate's `db-exploration.md`
- **Purpose**: Deep database verification with DBHub MCP
- **Curacity content to distribute here**:
  - Exploration Charter — DB-relevant scope
  - Data integrity verification patterns
  - Reference Curacity's DB schema (Hotels, HotelSettings, Bookings, Invoices, Reconciliation)
  - Database MCP usage patterns from the original

2. Delete `.prompts/stage-2-execution/exploratory-testing.md` (the PROMPT file only)

3. Update `.prompts/stage-2-execution/README.md`:
   - Replace single `exploratory-testing.md` entry with 4 new files
   - Add guidance on which file to use when (smoke for quick check, ui/api/db for deep exploration)

4. Update ALL cross-references — search for `exploratory-testing.md` in `.prompts/`:

| File | What to change |
|------|----------------|
| `.prompts/README.md` | Replace single entry with 4 files in directory tree |
| `.prompts/us-qa-workflow.md` | Update Stage 2 section (approx lines 106, 224, 505) to reference the 4 files with selection guidance |
| `.prompts/session-start.md` | If it references exploratory-testing.md as next step |
| `.prompts/sprint-testing-prompt.md` | If it references Stage 2 |
| `CLAUDE.md` | Update Stage 2 / QA Workflow references |

**Note**: Do NOT modify `.context/guidelines/QA/exploratory-testing.md` — that's a methodology guideline, not a prompt.

5. Verify with: `grep -r "stage-2-execution/exploratory-testing.md" .prompts/ CLAUDE.md` — expect 0 results.

---

## PART 3: CONTENT ENHANCEMENTS

### Task C4: Add Risk Matrix and Component Value to `test-prioritization.md`

**What**: Add two Boilerplate enhancements to the existing test-prioritization.md. The core ROI formula is already identical — these are additions, not replacements.

**Source**: Read `BOILERPLATE/.prompts/stage-4-documentation/test-prioritization.md` and extract:
1. The **Risk Matrix visualization** (ASCII quadrant: HIGH/LOW failure risk vs impact)
2. The **Component Value formula**: `Base ROI × (1 + 0.2 × N)`

**Action**:

1. Read Curacity's `.prompts/stage-4-documentation/test-prioritization.md` in full
2. Find the section after the ROI formula and interpretation thresholds
3. Add the Risk Matrix visualization:

```
                    HIGH BUSINESS IMPACT
                           │
           ┌───────────────┼───────────────┐
           │   CRITICAL    │    HIGH       │
           │  Automate     │  Automate     │
           │  First        │  Second       │
           │               │               │
HIGH ──────┼───────────────┼───────────────┼────── LOW
FAILURE    │               │               │      FAILURE
RISK       │    MEDIUM     │    LOW        │      RISK
           │  Automate     │  Manual or    │
           │  Third        │  Defer        │
           │               │               │
           └───────────────┼───────────────┘
                           │
                    LOW BUSINESS IMPACT
```

4. Add the Component Value formula section:

```markdown
### Component Value (Reusability Bonus)

For shared components (login, navigation, API setup), apply a reusability multiplier:

```
Component Value = Base ROI × (1 + 0.2 × N)

Where N = number of E2E flows that use this component
```

**Example:**
- "Successful login" used in 5 E2E flows
- Base ROI = 1.5
- Component Value = 1.5 × (1 + 0.2 × 5) = 1.5 × 2.0 = 3.0
- Result: High priority to automate
```

5. Adapt examples to Curacity domain where possible (e.g., "Successful hotel login" instead of generic).

**Keep**: All existing Curacity-specific content (Coda CLI commands, TC Workflow Status updates, etc.).

---

### Task C5: Create `test-analysis.md` prompt in Stage 4

**What**: Create a standalone prompt for retroactive test analysis — for when Stage 1 planning was skipped and the team needs to catch up.

**IMPORTANT CONTEXT**: Curacity already has `test-analysis.md` as a **local PBI file** (created in `.context/PBI/{module}/{ticket}/test-analysis.md` as ATP mirror). This new file is a **PROMPT** — it generates that local file from scratch when Stage 1 was skipped.

**Source**: Read `BOILERPLATE/.prompts/stage-4-documentation/test-analysis.md`

**Action**:

1. Copy the Boilerplate's `test-analysis.md` to `.prompts/stage-4-documentation/test-analysis.md`
2. Adapt for Curacity:
   - Replace `[TMS_CLI]` / Jira/Xray references with Coda CLI equivalents (`bun coda`)
   - Replace generic domain examples with hotel/booking examples where applicable
   - Keep the "OPTIONAL" / "skip note" marker clearly visible
   - Update tool references to Curacity's MCPs (Database MCP names, API MCP names)
3. Update `.prompts/stage-4-documentation/README.md` to include the new file
4. Update `.prompts/README.md` directory tree to show the new file

---

### Task C6: Add `atc-tracing-system.md` guideline

**What**: Add the ATC tracing system documentation to Curacity's TAE guidelines. This describes the full lifecycle: `@atc` decorator → NDJSON persistence → reporting → TMS sync.

**Source**: Read `BOILERPLATE/.context/guidelines/TAE/atc-tracing-system.md`

**Action**:

1. Copy to `.context/guidelines/TAE/atc-tracing-system.md`
2. Adapt the TMS sync section:
   - The core infrastructure (decorators, NDJSON, terminal output, Allure) is **TMS-agnostic** — keep as-is
   - The TMS sync layer references **Xray Cloud and Jira Direct** — add a parallel section for **Coda** sync
   - Add a note: "Coda adapter pending implementation" if the sync code doesn't exist yet
   - Keep both Xray and Coda sync options documented (Curacity may use either)
3. Update `.context/guidelines/TAE/README.md` to include the new file in the TAE guidelines list
4. Optionally add to `CLAUDE.md` context loading section if the architecture layers are referenced there

---

### Task C7: Add missing sections to `CLAUDE.md`

**What**: Add 6 sections that the Boilerplate's CLAUDE.md has and Curacity's doesn't. These provide quick-reference architecture and operational context.

**Source**: Read `BOILERPLATE/CLAUDE.md` for the template structure of each section.

**IMPORTANT**: Curacity's CLAUDE.md already has some of these partially (e.g., "Architecture Layers" exists, "Key Principles" exists). Do NOT duplicate — only add what's genuinely missing.

**Action**: Read Curacity's `CLAUDE.md` in full, then add only the MISSING sections:

#### 1. KATA Architecture diagram (visual)
- **Check**: Curacity has "Architecture Layers" section — verify if it already includes the visual diagram:
  ```
  TestContext (Layer 1) → ApiBase/UiBase (Layer 2) → Components (Layer 3) → TestFixture (Layer 4) → Tests
  ```
- **If missing**: Add the visual diagram. If present but less detailed, enhance it.

#### 2. Fundamental Rules (quick reference table)
- **Check**: Curacity has "Key Principles" section — compare with Boilerplate's "Fundamental Rules".
- **If missing patterns**: Add TypeScript patterns table (Max 2 params, aliases, locators, fast fail), DRY context table (api/schemas, tests/utils, UiBase, ApiBase, TestContext).
- **If already covered**: Skip or merge.

#### 3. CLI Tools table
- **Check**: Curacity has "Coda CLI" section — verify if other CLI tools are documented.
- **If missing**: Add table with `bun xray`, `bun run api:sync`, `bun run kata:manifest` and any Curacity-specific scripts.
- Adapt: Use Curacity's actual scripts from `package.json`.

#### 4. Skills (Claude Code) table
- **Check**: Does Curacity document available slash commands?
- **If missing**: Add Skills table listing `playwright-cli`, `xray-cli`, and any Curacity-specific skills.
- Verify: Check what's actually in Curacity's `.claude/skills/` directory.

#### 5. Discovery Progress table
- **If missing**: Add phase tracking table (Phase 1-3 + Context Generators) with status column.
- Adapt: Fill in actual status based on what files exist in `.context/`.

#### 6. Access Configuration checklist
- **If missing**: Add configured/pending checklist for MCPs, runtime, CI, URLs, credentials.
- Adapt: Mark items as configured based on actual Curacity setup.

**Placement**: Add each section in a logical position within the existing CLAUDE.md structure. Do NOT reorganize existing sections — only insert new ones.

---

## PART 4: VERIFICATION

After completing all tasks, run these checks:

```bash
# 1. context-generators folder is gone
ls .prompts/context-generators/
# Expected: No such file or directory

# 2. No context-generators references remain
grep -r "context-generators" .prompts/ .context/ CLAUDE.md
# Expected: 0 results

# 3. shift-left-testing.md is renamed
ls .prompts/stage-1-planning/acceptance-test-plan.md
# Expected: File exists
ls .prompts/stage-1-planning/shift-left-testing.md
# Expected: No such file or directory

# 4. No shift-left-testing file path references remain
grep -r "shift-left-testing\.md" .prompts/ .context/ CLAUDE.md
# Expected: 0 results (conceptual "shift-left" mentions are OK)

# 5. exploratory-testing.md prompt is split
ls .prompts/stage-2-execution/smoke-test.md .prompts/stage-2-execution/ui-exploration.md .prompts/stage-2-execution/api-exploration.md .prompts/stage-2-execution/db-exploration.md
# Expected: All 4 files exist
ls .prompts/stage-2-execution/exploratory-testing.md
# Expected: No such file or directory

# 6. Methodology guideline is untouched
ls .context/guidelines/QA/exploratory-testing.md
# Expected: File exists (NOT deleted)

# 7. No prompt references to old exploratory-testing.md
grep -r "stage-2-execution/exploratory-testing.md" .prompts/ CLAUDE.md
# Expected: 0 results

# 8. New files exist
ls .prompts/stage-4-documentation/test-analysis.md
ls .context/guidelines/TAE/atc-tracing-system.md
# Expected: Both exist

# 9. test-prioritization.md has new sections
grep -c "Component Value" .prompts/stage-4-documentation/test-prioritization.md
grep -c "Risk Matrix" .prompts/stage-4-documentation/test-prioritization.md
# Expected: At least 1 match each

# 10. Legacy file cleaned up
ls .prompts/legacy/acceptance-test-plan.md
# Expected: No such file or directory
```

---

## EXECUTION ORDER

| Task | Parallel Group | Scope | Dependencies |
|------|---------------|-------|--------------|
| C1 | Group A | Move 3 files + delete folder + update refs | None |
| C2 | Group A | Rename 1 file + delete legacy + update refs | None |
| C3 | Group B | Split 1 file into 4 + update refs | None (but most complex) |
| C4 | Group C | Edit 1 file (add 2 sections) | None |
| C5 | Group C | Create 1 file + update READMEs | None |
| C6 | Group C | Create 1 file + update README | None |
| C7 | Group D | Edit CLAUDE.md (add up to 6 sections) | None |
| Verification | After all | Run checks | All tasks complete |

**All tasks are independent** — execute Groups A, B, C, D in parallel.

---

## CLEANUP

After all tasks are verified:
1. Delete `CURACITY-SYNC-PLAN.md` (this file, if copied to Curacity)
2. Delete `CURACITY-SYNC-NOTES.md` from the Boilerplate repo (already reviewed)
3. Commit all Curacity changes with: `docs: sync structure and content with boilerplate improvements`
