# Future Tasks — Deferred Work from 2026-04 Sync Effort

> **Living document**. This file tracks pending, blocked, or decision-needed work items that were explicitly deferred during the April 2026 boilerplate-vs-Curacity audit and sync effort.
>
> The sync effort compared this boilerplate against `/home/sai/Desktop/work-projects/curacity/qa-automation` to port generic improvements back. Task 1 covered the audit + sync, Task 2 built the sprint-testing orchestrator and Project Variables table in `CLAUDE.md`. The items below were either explicitly deferred by the user, blocked on an upstream decision, or identified as planned next phases.
>
> Each task below is self-contained: a future session should be able to read a single entry and resume the work without rehydrating the entire sync history.

---

## 1. Task 3 — Propagate `{{VARIABLES}}` globally across prompts, guidelines, and templates

| Field | Value |
|---|---|
| **Status** | Pending (planned next phase) |
| **Owner** | Unassigned |
| **Priority** | High |

**Scope**

- All files under `.prompts/`
- All files under `.context/guidelines/`
- Any template files still holding hardcoded project-specific values (URLs, CLI commands, ticket prefixes, credential env-var names, repository paths)

**Context**

`CLAUDE.md` now defines a canonical Project Variables table (added in Task 2), but only `templates/sprint-testing-prompt.md` currently consumes those variables via `{{VARIABLE_NAME}}` placeholders. The rest of the prompt library still contains hardcoded examples (e.g., `staging.example.com`, `UPEX-###`, `bun run test:e2e`), which means every downstream consumer of the boilerplate has to search-and-replace the same examples in multiple locations.

**Rationale**

Variable propagation eliminates multi-file maintenance and makes the boilerplate truly portable: a consumer fills in `CLAUDE.md` once, and every prompt/guideline automatically resolves.

**Dependencies**

- Task 2 (sprint-testing orchestrator + CLAUDE.md variable table) — done.
- Any consumer that reads prompts raw (non-templated) must be updated to render `{{VARIABLES}}` before use, or the prompts must be usable with placeholders intact.

**Suggested approach**

1. Grep `.prompts/` and `.context/guidelines/` for hardcoded examples (staging URLs, ticket prefixes, local paths, env-var names, product name mentions).
2. Replace each hit with the corresponding `{{VARIABLE_NAME}}` from the CLAUDE.md table.
3. Verify every new variable reference has a corresponding entry in the CLAUDE.md table — add missing entries as needed.
4. Run a final grep to confirm no stray hardcoded values remain.
5. Update `templates/sprint-testing-prompt.md` example section if new variables were introduced.

**Strategy: Progressive Discovery**

This task is not a one-shot scan-and-replace. The execution strategy is progressive and iterative: we will walk through `.prompts/`, `.context/guidelines/`, and the rest of `.context/` file by file, inspecting each for hardcoded values (specific tools, environment assumptions, domain-specific names, URLs, ticket prefixes, paths). For every hardcoded value discovered, we take one of two actions:

1. If an existing variable in the CLAUDE.md Project Variables table already fits, replace the hardcoded value with that `{{VARIABLE_NAME}}`.
2. If no existing variable fits, add a new entry to the CLAUDE.md Project Variables table first, then reference it from the prompt/guideline.

Consequence: the CLAUDE.md Project Variables table is expected to **grow** during Task 3. It is not frozen at its current 21 variables — new variables will be introduced mid-propagation as discovery surfaces values the original table did not anticipate. Likewise, variables that are currently defined but unused (for example the `LOCAL_*` credential variants and `DEFAULT_ENV`) will naturally start being referenced during this phase as the relevant prompts are touched. The current "unused variables" gap is therefore expected and will resolve organically as Task 3 progresses, rather than requiring a separate cleanup pass.

---

## 2. Fix "KATA Framework" references in code files

| Field | Value |
|---|---|
| **Status** | Needs decision |
| **Owner** | Unassigned |
| **Priority** | Medium |

**Scope**

- `tests/` (test files, components, fixtures)
- `api/schemas/`
- `config/`
- `.github/workflows/`
- `package.json`
- `playwright.config.ts`
- `.env.example`
- `.gitignore`
- Any other code or config file containing the term "KATA Framework" in comments, string literals, or identifiers

**Context**

During Task 1, all documentation, prompts, and guidelines were renamed from "KATA Framework" to "KATA Architecture" to reflect that KATA is not a standalone framework but an architectural pattern layered on Playwright. **Code files were explicitly out of scope** for that rename, so they still contain the old term.

**Rationale**

Inconsistency between docs ("KATA Architecture") and code ("KATA Framework") is confusing for new contributors and AI agents alike. Unifying the term removes ambiguity.

**Dependencies**

- **Decision needed**: Rename only text comments and string literals (safe), or also rename TypeScript identifiers like `KataReporter`, `KataFixture`, etc. (breaking change — requires updating all imports and any downstream projects).

**Suggested approach**

1. Decide: text-only rename vs full identifier rename.
2. Grep for "KATA Framework" across all code files and replace with "KATA Architecture".
3. If doing the full rename, update identifiers + all imports + downstream consumers in a separate commit.
4. Run the test suite to confirm nothing broke.

---

## 3. Decide and create Jira/Xray equivalent of `coda-test-management.md`

| Field | Value |
|---|---|
| **Status** | Needs decision |
| **Owner** | Unassigned |
| **Priority** | Medium |

**Scope**

- New file under `.context/guidelines/` **or** `.context/docs/` (classification TBD)
- Filename proposal: `jira-test-management.md`

**Context**

Curacity has `.context/guidelines/coda-test-management.md`, which describes how their TMS (Coda) is organized — test hierarchies, labeling conventions, workflow states, and so on. The boilerplate needs an equivalent for Jira/Xray, but during the audit it was unclear whether the file belongs under `guidelines/` (how-to content) or `docs/` (reference content).

**Rationale**

Without a TMS-specific reference, AI agents cannot correctly create/update test cases in Jira/Xray. The file is a key input for the `xray-cli` skill and any sync between local PBI folders and Xray.

**Dependencies**

- Classification decision: guideline (how-to, prescriptive) vs doc (reference, descriptive).
- The decision should align with how other TMS references are classified in the project.

**Suggested approach**

1. Decide guideline vs doc classification.
2. Read Curacity's `coda-test-management.md` as a structural template.
3. Port the structure while replacing Coda-specific terminology with Jira/Xray equivalents (issue types, Xray test types, test plans, test executions, etc.).
4. Reference the new file from `CLAUDE.md` "Context Loading by Task" table.

---

## 4. Decide and create Jira/Xray equivalent of `coda-tms-workflow.md`

| Field | Value |
|---|---|
| **Status** | Needs decision |
| **Owner** | Unassigned |
| **Priority** | Medium |

**Scope**

- New file under `.context/guidelines/` **or** `.context/docs/` (same classification decision as item 3)
- Filename proposal: `jira-tms-workflow.md`

**Context**

Curacity has `.context/guidelines/coda-tms-workflow.md`, which describes the end-to-end TMS workflow: how tickets move between states, who owns transitions, how test results are reported back, etc. The boilerplate needs the Jira/Xray version. Deferred for the same classification reason as item 3.

**Rationale**

Complements item 3: item 3 describes the *structure* of the TMS, item 4 describes the *workflow* through it. Both are needed for an AI agent to operate a ticket end-to-end.

**Dependencies**

- Same guideline vs doc decision as item 3. Resolve both together for consistency.

**Suggested approach**

1. Resolve classification alongside item 3.
2. Port structure from Curacity's `coda-tms-workflow.md`.
3. Rewrite workflow steps using Jira/Xray transitions (Open → In Progress → Ready for QA → Done, etc.).
4. Link from `.prompts/us-qa-workflow.md` and `.prompts/bug-qa-workflow.md`.

---

## 5. Delete `.context/system-prompt.md` from Curacity (redundant)

| Field | Value |
|---|---|
| **Status** | Pending (Curacity-side action) |
| **Owner** | Unassigned |
| **Priority** | Low |

**Scope**

- **Curacity repo only** (`/home/sai/Desktop/work-projects/curacity/qa-automation`)
- File: `.context/system-prompt.md`
- **No changes in the boilerplate** — boilerplate does not have this file.

**Context**

During the Task 1 audit, `.context/system-prompt.md` in Curacity was identified as redundant — its content overlaps with `CLAUDE.md` and no prompt/guideline references it. This is a heads-up recorded here so future sync sessions remember to propose its deletion in Curacity.

**Rationale**

Reduces drift between CLAUDE.md and a parallel "system prompt" file that can silently diverge.

**Dependencies**

- Curacity-side approval per the `curacity_sync_protocol` memory (always inform and justify before changes).

**Suggested approach**

1. Re-confirm no references to `system-prompt.md` exist in Curacity.
2. Propose deletion to the Curacity maintainer with justification.
3. On approval, delete in Curacity (not here).

---

## 6. Fix Curacity's `mcp-usage-tips.md` — remove Supabase references

| Field | Value |
|---|---|
| **Status** | Pending (Curacity-side action) |
| **Owner** | Unassigned |
| **Priority** | Low |

**Scope**

- **Curacity repo only**
- File: `.context/guidelines/mcp-usage-tips.md`
- **No changes in the boilerplate.**

**Context**

During Task 1, Curacity's `mcp-usage-tips.md` was found to reference Supabase as an available MCP, but Curacity does not use Supabase. This was not a boilerplate task but is recorded here so the next sync session can address it.

**Rationale**

Keeping MCP references accurate prevents AI agents from trying to call tools that do not exist in the environment.

**Dependencies**

- Curacity-side approval per sync protocol.

**Suggested approach**

1. Confirm Supabase MCP is not configured in Curacity's `.mcp.json` or equivalent.
2. Propose edit to Curacity maintainer.
3. On approval, remove Supabase references in Curacity.

---

## 7. Implement `cli/api-login.ts` + auto token refresh scripts

| Field | Value |
|---|---|
| **Status** | Pending |
| **Owner** | Unassigned |
| **Priority** | High |

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
- May depend on Task 3 (variables) if the script references project-specific URLs.

**Suggested approach**

1. Port `cli/api-login.ts` from Curacity, replacing project-specific paths and endpoints with variables from `CLAUDE.md` / `.env`.
2. Store the refreshed token in a well-known location (e.g., `tests/.auth/token.json`) that is gitignored.
3. Add `api:login:local` and `api:login:staging` scripts to `package.json`.
4. Document usage in `README.md` under the "Authentication" section.
5. Consider wiring the login into Playwright's `globalSetup` for fully automated test runs.

---

## 8. Update `cli/update-boilerplate.ts` before next push

| Field | Value |
|---|---|
| **Status** | Pending |
| **Owner** | Unassigned |
| **Priority** | High (blocking next boilerplate release) |

**Scope**

- `cli/update-boilerplate.ts`
- Possibly its README or usage docs

**Context**

`cli/update-boilerplate.ts` is the CLI that syncs the boilerplate template into downstream projects (the tool consumers run to pull updates). After Task 2 introduced the Project Variables system in `CLAUDE.md`, this CLI needs review so that:

1. Downstream consumers are prompted to fill in or confirm their variable values after pulling updates.
2. Variable-dependent files are not blindly overwritten if the consumer has local variable customizations.
3. A migration note is surfaced explaining the new variables system.

**Rationale**

If the CLI is not updated, downstream consumers will pull variables-based templates and silently end up with `{{VARIABLE_NAME}}` placeholders in their live prompts.

**Dependencies**

- Should happen **after** Task 3 (variable propagation) to ensure the CLI handles the fully variable-ized template.

**Suggested approach**

1. Read `cli/update-boilerplate.ts` to understand the current sync logic.
2. Add a post-sync step that detects unfilled `{{VARIABLE_NAME}}` placeholders and warns the user.
3. Add a migration notice for consumers upgrading from a pre-variables boilerplate version.
4. Test the CLI against a sample downstream project before release.

---

## 9. Unify `.prompts/discovery/business-data-map.md` with its generator prompt output

| Field | Value |
|---|---|
| **Status** | Pending |
| **Owner** | Unassigned |
| **Priority** | Medium |

**Scope**

- `.prompts/discovery/business-data-map.md`
- Possibly the generator prompt under `.prompts/discovery/` (if present)
- The resulting `.context/business-data-map.md` template

**Context**

Curacity has a generator prompt that produces a `business-data-map.md` document describing system entities and flows. The boilerplate has a version of this prompt, but the expected output structure in the boilerplate template does not fully match what the generator actually produces. This drift was identified during Task 1 but fixing it was out of scope.

**Rationale**

When the template and the generator disagree, consumers get either an empty template they have to fill manually, or a generated output that cannot be validated against a known schema.

**Dependencies**

- None.

**Suggested approach**

1. Compare the current `.prompts/discovery/business-data-map.md` generator prompt output to the `.context/business-data-map.md` template.
2. Pick one as the source of truth (probably the generator output, since it is real-world).
3. Update the other to match.
4. Regenerate a sample `business-data-map.md` to validate alignment.

---

## 10. Deeper inspection of `.prompts/stage-6-regression/`

| Field | Value |
|---|---|
| **Status** | Pending (verification task) |
| **Owner** | Unassigned |
| **Priority** | Low |

**Scope**

- `.prompts/stage-6-regression/` (all files)
- Comparison target: Curacity's equivalent folder

**Context**

During Task 1 Phase 3, the sub-agents confirmed that the boilerplate's `stage-6-regression/` folder was *longer* than Curacity's and decided it did not need porting. However, a **deep content comparison was not exhaustive** — it is possible Curacity has specific valuable sections (step templates, checklists, ATC patterns) that the boilerplate is missing, even though its total length is shorter.

**Rationale**

Stage 6 covers regression after bug fixes — a critical moment where missing guidance directly causes escaped defects. Worth a second, more careful pass.

**Dependencies**

- None. Purely an audit task.

**Suggested approach**

1. Side-by-side diff of `.prompts/stage-6-regression/` in both repos.
2. For each file, list sections present in Curacity but missing in the boilerplate.
3. For each missing section, decide: port as-is, adapt to variables, or skip as project-specific.
4. Commit any ported content with a commit message referencing this future-task item.

---

## How to consume this document

- **Pick one task, read its entire entry, then act.** Each task is self-contained — do not try to tackle multiple items in one session unless they share dependencies (e.g., items 3 and 4, or items 2, 3, 7 and 8 which all depend on Task 3).
- **Check "Status" and "Dependencies" first.** A task marked "Needs decision" or "Blocked" should not be started without first resolving the blocker.
- **Update this file when a task is completed.** Delete the entry or move it to a "Completed" section with the commit SHA and date. This file is a *living* document — stale items are worse than missing items.
