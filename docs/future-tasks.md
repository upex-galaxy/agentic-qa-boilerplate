# Future Tasks — Deferred Work from 2026-04 Sync Effort

> **Living document**. This file tracks pending, blocked, or decision-needed work items that were explicitly deferred during the April 2026 boilerplate-vs-Curacity audit and sync effort.
>
> The sync effort compared this boilerplate against `/home/sai/Desktop/work-projects/curacity/qa-automation` to port generic improvements back. Task 1 covered the audit + sync, Task 2 built the sprint-testing orchestrator and Project Variables table in `CLAUDE.md`. The items below were either explicitly deferred by the user, blocked on an upstream decision, or identified as planned next phases.
>
> Each task below is self-contained: a future session should be able to read a single entry and resume the work without rehydrating the entire sync history.
>
> **Note**: Curacity-only tasks (deleting `system-prompt.md`) have been moved to the Curacity repo's own tracking. They are not tracked here.

---

## Session Summary — 2026-04-12 (Session 2)

Tasks 3+4 completed — TMS guidelines created as tool-agnostic files:

- **Tasks 3+4 (TMS guidelines)** -- Completed. Created 3 tool-agnostic guideline files (expanded from original 2-file scope after analysis showed `coda-tms-overview.md` contained unique content):
  - `.context/guidelines/tms-architecture.md` — Entity model, traceability, linking order
  - `.context/guidelines/tms-conventions.md` — Rules, states, formats, automation criteria
  - `.context/guidelines/tms-workflow.md` — 5-stage In-Sprint Testing workflow (IQL-aligned)
- **Key decisions**: Files are tool-agnostic (not Jira/Xray-specific), use `[TMS_TOOL]` pseudocode, Jira/Xray as reference implementation only. Named by content (`architecture`, `conventions`, `workflow`) not by tool.
- **Integration**: CLAUDE.md Context Loading table updated, guidelines README.md updated, IQL methodology explicitly referenced throughout.

---

## Session Summary — 2026-04-12 (Session 1)

Three tasks were completed and a major new initiative (Pseudocode Convention) was executed:

- **Task 2 (KATA Framework rename in code)** -- Completed. 36 code files updated (comments and strings only, no breaking changes). Commit `817fc0a`.
- **Task 7 (business-data-map unification)** -- Completed. Created `.context/business-data-map.md` placeholder template aligned with generator prompt. Commit `3614d6a`.
- **Task 1 (variable propagation)** -- Partially completed. `{{DEFAULT_ENV}}` and `{{PROJECT_KEY}}` propagated. The scope was largely superseded by the Pseudocode Convention (see below).
- **Pseudocode Convention** (new work) -- All hardcoded CLI/MCP commands across `.prompts/` and `.context/guidelines/` replaced with domain-level pseudocode tags (`[TMS_TOOL]`, `[ISSUE_TRACKER_TOOL]`, `[AUTOMATION_TOOL]`, `[DB_TOOL]`, `[API_TOOL]`). Tool Resolution section added to `CLAUDE.md`. 25 files transformed, ~176 replacements across 3 phases. This superseded much of the original variable propagation plan for tool-specific values.
- **mcp-usage-tips.md deletion** -- File deleted and all references cleaned up. Commit `90086c3`.

---

## 1. Task 3 — Propagate `{{VARIABLES}}` globally across prompts, guidelines, and templates

| Field | Value |
|---|---|
| **Status** | Partially completed (2026-04-12) -- scope reduced by Pseudocode Convention |
| **Owner** | Unassigned |
| **Priority** | Low (reduced from High) |

**Update (2026-04-12)**: Partial propagation was completed: `{{DEFAULT_ENV}}` and `{{PROJECT_KEY}}` (renamed from `{{TICKET_PREFIX}}`) are now propagated to relevant prompts. The Pseudocode Convention initiative (same session) replaced all hardcoded CLI/MCP tool references with domain-level pseudocode tags (`[TMS_TOOL]`, `[ISSUE_TRACKER_TOOL]`, `[AUTOMATION_TOOL]`, `[DB_TOOL]`, `[API_TOOL]`), which covered the largest category of hardcoded values that this task originally targeted. The remaining scope is limited to non-tool variables (URLs, credential env-var names, repository paths) that are still hardcoded in some files. Priority lowered to Low since the most impactful work is done.

**Remaining scope**

- Non-tool hardcoded values in `.prompts/` and `.context/guidelines/` (URLs, credential keys, repo paths)
- Verifying all CLAUDE.md Project Variables table entries are consumed somewhere

**Original context preserved below for reference.**

`CLAUDE.md` now defines a canonical Project Variables table (added in Task 2), but only `templates/sprint-testing-prompt.md` currently consumes those variables via `{{VARIABLE_NAME}}` placeholders. The rest of the prompt library still contains hardcoded examples (e.g., `staging.example.com`, `UPEX-###`, `bun run test:e2e`), which means every downstream consumer of the boilerplate has to search-and-replace the same examples in multiple locations.

**Rationale**

Variable propagation eliminates multi-file maintenance and makes the boilerplate truly portable: a consumer fills in `CLAUDE.md` once, and every prompt/guideline automatically resolves.

**Dependencies**

- Task 2 (sprint-testing orchestrator + CLAUDE.md variable table) -- done.
- Any consumer that reads prompts raw (non-templated) must be updated to render `{{VARIABLES}}` before use, or the prompts must be usable with placeholders intact.

**Suggested approach (revised)**

1. Grep `.prompts/` and `.context/guidelines/` for remaining hardcoded examples (staging URLs, credential env-var names, local paths, product name mentions). Tool-specific commands are already handled by pseudocode tags.
2. Replace each hit with the corresponding `{{VARIABLE_NAME}}` from the CLAUDE.md table.
3. Verify every new variable reference has a corresponding entry in the CLAUDE.md table.
4. Run a final grep to confirm no stray hardcoded values remain.

---

## 2. Fix "KATA Framework" references in code files -- COMPLETED

| Field | Value |
|---|---|
| **Status** | Completed (2026-04-12) |
| **Commit** | `817fc0a` |

36 code files updated -- comments and string literals only, no breaking changes. All "KATA Framework" references in code now read "KATA Architecture", consistent with documentation.

---

## 3. Create TMS guidelines (equivalent of Coda TMS files) -- COMPLETED

| Field | Value |
|---|---|
| **Status** | Completed (2026-04-12) |

**Decisions made:**
- **Classification**: Guideline (prescriptive) → `.context/guidelines/`
- **Tool scope**: Tool-agnostic with `[TMS_TOOL]` pseudocode (not Jira/Xray specific). Jira/Xray included as reference implementation only.
- **Naming**: Files named by content, not by tool: `tms-architecture.md`, `tms-conventions.md`, `tms-workflow.md`
- **Scope expanded**: Originally 2 files (Tasks 3+4), expanded to 3 files after analysis showed `coda-tms-overview.md` contained unique architectural content not covered by the other two.

**Files created:**
- `.context/guidelines/tms-architecture.md` — TMS entity model (ATP, ATR, TC), traceability rules, linking order
- `.context/guidelines/tms-conventions.md` — Test case states, naming, formats, automation criteria, labels, best practices
- `.context/guidelines/tms-workflow.md` — 5-stage In-Sprint Testing workflow (IQL-aligned)

**Integration:**
- CLAUDE.md Context Loading table updated with TMS task entries
- Guidelines README.md updated with all 3 files
- IQL methodology explicitly referenced throughout

---

## 4. (Merged into Task 3) -- COMPLETED

| Field | Value |
|---|---|
| **Status** | Completed (2026-04-12) — merged into Task 3 |

Task 4 was resolved together with Task 3 as planned. The `tms-workflow.md` file covers the workflow content that Task 4 originally targeted. See Task 3 above for details.

---

## 5. Implement `cli/api-login.ts` + auto token refresh scripts

| Field | Value |
|---|---|
| **Status** | Pending |
| **Owner** | Unassigned |
| **Priority** | Medium |

**Note**: Priority lowered from High to Medium. The CLI is useful for CI/CD automation (avoids manual token refresh) but is not critical for the boilerplate template itself. Implementation should adapt to the specific project's auth mechanism. The token is stored in `tests/.auth/token.json` (gitignored) and consumed by `ApiBase.ts`.

**Scope**

- New file: `cli/api-login.ts`
- Updates to `package.json`:
  - `api:login:local`
  - `api:login:staging`
- Possibly a shared auth helper under `tests/components/api/`

**Context**

Curacity has a working `api-login` CLI that authenticates against the backend and refreshes stored auth tokens, so API test runs do not need manual intervention. The boilerplate currently lacks this, which means consumers hit a manual token-refresh step whenever their tokens expire.

**Rationale**

Unattended API test runs are a core requirement. Without auto-refresh, CI runs fail spuriously after token expiration and local developers lose time re-authenticating.

**Dependencies**

- `.env` must expose credential keys in a generic form (e.g., `LOCAL_USER_EMAIL`, `STAGING_USER_EMAIL`, etc.) — already in place.
- May depend on Task 1 (variables) if the script references project-specific URLs.

**Suggested approach**

1. Port `cli/api-login.ts` from Curacity, replacing project-specific paths and endpoints with variables from `CLAUDE.md` / `.env`.
2. Store the refreshed token in `tests/.auth/token.json` (gitignored), consumed by `ApiBase.ts`.
3. Add `api:login:local` and `api:login:staging` scripts to `package.json`.
4. Document usage in `README.md` under the "Authentication" section.
5. Consider wiring the login into Playwright's `globalSetup` for fully automated test runs.

---

## 6. Update `cli/update-boilerplate.ts` before next push

| Field | Value |
|---|---|
| **Status** | Planned — Implementation plan ready |
| **Owner** | Unassigned |
| **Priority** | High (blocking next boilerplate release) |
| **Plan** | `docs/plan-update-boilerplate-refactor.md` |

**Note**: All prerequisite tasks (1-5, 7) are now complete. Implementation plan created with 4 fixes + 4 enhancements, estimated ~4-5 hours. See plan document for full details.

**Scope**

- `cli/update-boilerplate.ts`
- New: `.boilerplate-version.json` (version tracking)
- Possibly its README or usage docs

**Context**

`cli/update-boilerplate.ts` is the CLI that syncs the boilerplate template into downstream projects (the tool consumers run to pull updates). After Task 2 introduced the Project Variables system in `CLAUDE.md`, this CLI needs review so that:

1. Downstream consumers are prompted to fill in or confirm their variable values after pulling updates.
2. Variable-dependent files are not blindly overwritten if the consumer has local variable customizations.
3. A migration note is surfaced explaining the new variables system.

**Rationale**

If the CLI is not updated, downstream consumers will pull variables-based templates and silently end up with `{{VARIABLE_NAME}}` placeholders in their live prompts.

**Dependencies**

- Should happen **after** all other tasks (especially Task 1 variable propagation) to ensure the CLI handles the fully variable-ized template.

**Suggested approach**

1. Read `cli/update-boilerplate.ts` to understand the current sync logic.
2. Add a post-sync step that detects unfilled `{{VARIABLE_NAME}}` placeholders and warns the user.
3. Add a migration notice for consumers upgrading from a pre-variables boilerplate version.
4. Test the CLI against a sample downstream project before release.

---

## 7. Unify `.prompts/discovery/business-data-map.md` with its generator prompt output -- COMPLETED

| Field | Value |
|---|---|
| **Status** | Completed (2026-04-12) |
| **Commit** | `3614d6a` |

Created `.context/business-data-map.md` placeholder template aligned with the generator prompt structure. Generator and output template are now consistent.

---

## How to consume this document

- **Pick one task, read its entire entry, then act.** Each task is self-contained — do not try to tackle multiple items in one session unless they share dependencies (e.g., items 3 and 4 share a classification decision).
- **Check "Status" and "Dependencies" first.** A task marked "Needs decision" or "Blocked" should not be started without first resolving the blocker.
- **Update this file when a task is completed.** Delete the entry or move it to a "Completed" section with the commit SHA and date. This file is a *living* document — stale items are worse than missing items.

**Readiness groupings:**

| Readiness | Tasks |
|---|---|
| **Completed** | 2 (KATA comments fix), 3+4 (TMS guidelines — 3 files created), 7 (business-data-map unification) |
| **Low priority** | 1 (variable propagation — remaining scope reduced) |
| **Pending** | 5 (api-login CLI), 6 (update-boilerplate — last) |
