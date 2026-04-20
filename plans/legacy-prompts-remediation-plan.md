# Legacy Prompts — Remediation Plan

> **Companion to**: `plans/legacy-prompts-migration-audit.md` + `plans/legacy-prompts-verification-report.md`
> **Date**: 2026-04-19
> **Scope**: Close the 6 concrete gaps detected during V-01..V-09 verification. Grouped by file-of-change, ordered HIGH → MEDIUM → LOW.
> **Pre-state**: 57 FULL / 4 PARTIAL / 0 GAP (61 total)
> **Projected post-state**: 61 FULL / 0 PARTIAL / 0 GAP

**Protocol per item**: (1) Read target file end-to-end. (2) Identify insertion point. (3) Draft content (quoting legacy where verbatim is required). (4) Apply edit. (5) Grep to confirm new signal. (6) Update this plan with ✅/❌ status.

---

## Files affected (4 total)

| # | File | V-items touched | Priority mix |
|---|---|---|---|
| A | `.claude/skills/test-automation/references/planning-playbook.md` | V-01 + V-07 | HIGH + HIGH |
| B | `.claude/skills/sprint-testing/references/reporting-templates.md` | V-02 | HIGH |
| C | `.claude/skills/test-automation/references/review-checklists.md` | V-06 (both items) | MEDIUM |
| D | `.claude/commands/refresh-ai-memory.md` | V-09.1 | LOW |

Execution order below groups by file, not by priority, so each file is opened once. Within each file, apply all edits sequentially before moving on.

---

## 🟥 FILE A — `test-automation/references/planning-playbook.md` (V-01 + V-07, HIGH)

### Edit A1 — V-01 · Interrupted-session recovery matrix

**Insertion point**: new §12 *"Interrupted-session recovery"* after the existing §11 checklist (end of file).

**Content to add** (verbatim from legacy, adapted to current STEP numbering):

```md
## 12. Interrupted-session recovery

When `/test-automation` is invoked mid-flow (or resumed after context loss), determine the resume step from the PBI state:

| Has plan? (`implementation-plan.md`) | Has test code? (`tests/e2e|integration/**`) | Resume from |
|---|---|---|
| No  | No  | **STEP 2 (Planning)** |
| Yes | No  | **STEP 3 (Coding)** |
| Yes | Yes | **STEP 4 (Review)** |

The skill reads `PROGRESS.md` + `ROADMAP.md` directly — no `@`-loadable session file needed.
```

### Edit A2 — V-01 · Max 2 revision loops + Quality Gates G1-G4

**Insertion point**: inside new §12 (right after the recovery matrix), as two sub-sections.

**Content to add**:

```md
### 12.1 Revision-loop ceiling (Phase 3 · Review)

Maximum revision loops: **2**. If the test is still not APPROVED after 2 revision rounds,
present all remaining issues to the user and ask for guidance. Do not enter an infinite
loop of reviewer↔coder mutations.

### 12.2 Quality Gates G1–G4

Named phase-transition checkpoints. Each gate blocks progression until its criteria are met.

| Gate | Between | Criteria |
|---|---|---|
| **G1 · Plan exists** | STEP 2 → STEP 3 | `implementation-plan.md` created with ATCs defined (see §10 Approval gate) |
| **G2 · Tests pass** | STEP 3 → STEP 4 | All ATCs green locally (or explicit user override documented in PROGRESS.md) |
| **G3 · Review OK** | STEP 4 → STEP 5 | Reviewer verdict = APPROVED (or max 2 revision rounds reached, then user decides) |
| **G4 · Progress updated** | STEP 5 → STEP 6 | `PROGRESS.md` reflects the completed ticket (status, test file path, done count) |
```

### Edit A3 — V-07 · ROADMAP.md + PROGRESS.md templates

**Insertion point**: new §13 *"Shared state files — templates"* after §12.

**Content to add**:

```md
## 13. Shared state files — templates

Both files live under `.context/PBI/{module}/test-specs/` and are the single source of truth
for module-wide automation progress.

### 13.1 ROADMAP.md (ticket index + dependencies)

```md
# {MODULE} · Automation Roadmap

## Tickets

| ID | Title | Priority | Phase | Dependencies | TCs |
|---|---|---|---|---|---|
| {PREFIX}-T01-{slug} | ... | P0 | Plan | — | 3 |
| {PREFIX}-T02-{slug} | ... | P1 | Code | T01 | 5 |

## Dependency graph

```
T01 ──┬──► T02 ──► T04
      └──► T03
```

## Phase progress

- Plan: ▓▓▓▓░ 4/5
- Code: ▓▓░░░ 2/5
- Review: ▓░░░░ 1/5
```

### 13.2 PROGRESS.md (session-persistent tracker)

```md
# {MODULE} · Automation Progress

## Current status
- Current ticket: {PREFIX}-T02-{slug}
- Completed: 1/5
- Remaining: 4/5

## Tickets

| Ticket | Status | Test file | Done | Notes |
|---|---|---|---|---|
| T01 | done | tests/e2e/login.spec.ts | 3/3 | — |
| T02 | in-progress | tests/e2e/signup.spec.ts | 1/5 | Fixture blocked on email-verify mock |

## Session log

| Date | Action | Actor | Artifacts |
|---|---|---|---|
| 2026-04-19 | Planned T02 | AI | implementation-plan.md |

## Shared components created

- `UserFormPage` (`tests/components/ui/UserFormPage.ts`) — used by T02, T05
- `AuthApi.signupWithRetry` — used by T02, T04
```
```

**Status: ✅ applied 2026-04-20**

---

## 🟥 FILE B — `sprint-testing/references/reporting-templates.md` (V-02, HIGH)

### Edit B1 — V-02 · Restore `(WAD)` parenthetical

**Change**: §1.8 Root Cause list — `"Working As Designed"` → `"Working As Designed (WAD)"`.

### Edit B2 — V-02 · "Error Handling for Custom Fields" subsection

**Insertion point**: new subsection §1.11 (after the `customfield_*` table in §1.10), **before** the existing §5.4 one-line summary.

**Content to add** (legacy literal preserved):

```md
### 1.11 Error handling for custom fields

**DO NOT** attempt to discover or query for alternative field IDs when a `customfield_*`
create call fails. Jira custom-field IDs are tenant-specific — guessing leads to silent
data corruption in other tickets.

**Protocol on failure**:
1. Inform the user with the Custom Field Error template below.
2. Create the bug anyway with the fields that succeed.
3. Add a comment to the created bug noting which field failed and why.

**Custom Field Error template** (user-facing):

> ⚠️ Custom field `{FIELD_NAME}` (id `{CUSTOMFIELD_ID}`) could not be set on `{BUG_KEY}`.
> The bug was created without it. Please contact your Jira admin to verify the field id
> for this project, then update `jira-setup.md` and re-run traceability-fix if needed.
```

### Edit B3 — V-02 · 3-step non-UPEX fallback + Field Mapping Guide

**Insertion point**: new subsection §1.12 right after §1.11.

**Content to add**:

```md
### 1.12 Non-UPEX fallback (3-step strategy)

When the project is not UPEX and the `customfield_*` IDs above do not exist in the target
Jira instance, follow this strategy in order:

1. **Search** — query the Jira schema for equivalent field names (see Field Mapping Guide).
2. **Ask** — if no match, ask the user for the project-specific field id; store it in
   `jira-setup.md` §Custom fields.
3. **Embed in Description** — if neither option is viable, embed the metadata as a
   structured block at the top of the bug Description (Markdown fenced block with
   `Severity:`, `Error Type:`, `Root Cause:`, etc.).

**Field Mapping Guide** — UPEX names and common alternatives across tenants:

| UPEX field | Common alternatives |
|---|---|
| SEVERITY | Bug Severity, Impact, Priority Level |
| Error Type | Defect Type, Bug Category, Issue Type Detail |
| Test Environment | Found In, Detected In, Environment |
| Root Cause | Cause Category, Resolution Category, RCA Type |
| Actual Result | Actual Behavior, Observed Behavior |
| Expected Result | Expected Behavior, Desired Outcome |
```

**Status: ✅ applied 2026-04-20**

---

## 🟧 FILE C — `test-automation/references/review-checklists.md` (V-06, MEDIUM)

### Edit C1 — V-06 · Restore per-HTTP-method tuple-return table

**Change**: §3.2 A-H2 one-liner → 5-row explicit table.

**Insertion point**: replace the A-H2 line in §3.2.

**Content to add**:

```md
**A-H2 · Tuple-return contract per HTTP method**

| Method | Return shape | Notes |
|---|---|---|
| GET (single) | `[APIResponse, TBody]` | `TBody` = resource DTO |
| GET (list) | `[APIResponse, TBody[]]` *or* `[APIResponse, ListResponse<TBody>]` | Use `ListResponse<T>` when the API wraps the collection with pagination metadata |
| POST | `[APIResponse, TBody, TPayload]` | `TPayload` = the body that was sent |
| PUT / PATCH | `[APIResponse, TBody, TPayload]` | Same shape as POST |
| DELETE | `[APIResponse, TBody]` | Decision point: legacy used `void`; current convention is `TBody` (echo the deleted resource) — **confirm with the reviewer which semantic applies to your API**. Document the choice in `api-patterns.md` |
```

**Open question to surface in the PR description**: DELETE tuple — `void` (legacy) vs `TBody` (current)? The plan assumes current convention wins unless the user says otherwise.

### Edit C2 — V-06 · Legacy-code mapping appendix

**Insertion point**: new appendix at the **end** of the file, *"Appendix — Legacy code cross-reference"*.

**Content to add**:

```md
## Appendix · Legacy code cross-reference

For PR comments that reference the legacy boilerplate's flat code IDs
(`.prompts/stage-5-automation/review/*`). The current refactor split the 29+ flat
checks into a shared list (`automation-standards.md` §10) plus deltas
(`review-checklists.md`). Use this table to resolve historical references.

| Legacy code | Scope | New location |
|---|---|---|
| K-01 | KATA — Extends UiBase/ApiBase | `automation-standards.md` §10 / Component review |
| K-02 | KATA — No direct Playwright imports | `automation-standards.md` §10 / Component review |
| K-03 | KATA — Imports via aliases | `automation-standards.md` §10 / Component review |
| K-04 | KATA — ATCs return tuples/values | `review-checklists.md` §3.2 (A-H tuples) |
| K-05 | KATA — @atc tags present | `automation-standards.md` §10 / ATC review |
| K-06 | KATA — Steps for reusable chains | `automation-standards.md` §10 / Test file review |
| K-07 | KATA — Fixture selection | `review-checklists.md` §1.1 (fixture selector) |
| K-08 | KATA — TestContext usage | `automation-standards.md` §10 / Component review |
| K-09 | KATA — No duplicated helpers | `automation-standards.md` §10 / Component review |
| A-01..A-08 | ATC rules (atomicity, params, assertions) | `automation-standards.md` §10 / ATC review |
| T-01..T-05 | TypeScript rules | `test-automation/references/typescript-patterns.md` |

*Note: current local codes `A-xx` (API deltas) collide in name with legacy `A-xx` (ATC rules)
but have a different scope — always check the containing section heading.*
```

**Status: ✅ applied 2026-04-20**

---

## 🟨 FILE D — `.claude/commands/refresh-ai-memory.md` (V-09.1, LOW)

### Edit D1 — V-09.1 · Security scan step

**Insertion point**: in the Full / Minimal generation flow, after the README-write step and before the memory-file write step. Add a new dedicated step.

**Content to add**:

```md
### Security scan (pre-write)

Before writing `README.md` or the AI memory file, scan the generated content for:

- **Credentials** — strings matching `/(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/i`.
- **Production URLs** — hostnames in `{{WEBAPP_DOMAIN}}` production but not in the whitelist
  (`localhost`, `staging.*`, `dev.*`).
- **Inline tokens** — JWT-shaped strings, Atlassian API tokens, GitHub PATs.

If any match is found:
1. Redact the match in the generated content (`{{REDACTED}}`).
2. List the redactions back to the user in the summary.
3. Ask the user to source the redacted value from `.env` instead.
```

**Status: ✅ applied 2026-04-20**

---

# Execution order (recommended)

1. **FILE A** edits A1 → A2 → A3 (single open, HIGH impact, 2 V-items closed).
2. **FILE B** edits B1 → B2 → B3 (HIGH).
3. **FILE C** edits C1 → C2 (MEDIUM, resolve DELETE-void question with user before C1).
4. **FILE D** edit D1 (LOW).

After each file:
- Grep for new signal (`recovery`, `G1-G4`, `ROADMAP template`, `Custom Field Error`, `Field Mapping Guide`, `Legacy code cross-reference`, `Security scan`).
- Update the Status line for each Edit above to ✅.

After all 4 files:
- Update `plans/legacy-prompts-migration-audit.md` executive-summary metrics: 61 FULL / 0 PARTIAL / 0 GAP.
- Update `plans/legacy-prompts-verification-report.md` — mark each of the 8 net findings as **RESOLVED** with a pointer to the commit hash.
- Optionally: open a single commit per file, semantic prefix `docs:` (not `feat:` — these are doc restorations, not features).

---

# Decisions log (resolved 2026-04-20)

1. **V-06 / Edit C1** — DELETE tuple default `TBody` with a conditional note: if the target API responds `204 No Content`, switch to `[APIResponse, void]` and document the choice at the top of the owning `*Api.ts` component.
2. **V-02 / Edit B1** — Restore `(WAD)` verbatim in §1.8 Root Cause row, matching the literal value of the Jira UPEX dropdown.
3. **V-01 / Edit A2** — G2 is a **soft gate with mandatory sub-protocol** (§12.3): on a real bug discovery, first search the issue tracker, then either annotate with the existing BUG-KEY (no silent skip) or escalate to the user for bug-report creation via `/sprint-testing`. The bug key is the traceability anchor; no key = no override.

---

*Plan executed 2026-04-20. 7 edits across 4 files applied. Projected new audit state: 61 FULL / 0 PARTIAL / 0 GAP.*
