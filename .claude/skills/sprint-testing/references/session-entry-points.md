# Session Entry Points — Session Start, User-Story and Bug Workflows

> **Subagent context**: this file is part of the "Context docs" briefing component for the Session Start subagent (see `sprint-testing/SKILL.md` §Subagent Dispatch Strategy and `sprint-orchestration.md` §"Briefing 1 — Session Start subagent").

Load this reference whenever you enter sprint-testing in any mode. Session Start is universal — every mode runs it first. The User-Story and Bug sections describe what happens after Session Start in single-ticket mode. Batch-sprint mode wraps these same stages in the orchestration loop from `sprint-orchestration.md`.

---

## Shared pipeline

```
Session Start (universal)
    -> loads context, creates PBI, writes Story Explanation
    -> WAIT for user confirmation

Branch by ticket type:

   User Story                  Bug
   ----------                  ---
   Stage 1 Planning            Phase 1 Triage + Planning
   (ATP + ATR + TCs)           (veto / risk score, ATP + ATR, no TCs)
   Stage 2 Execution           Phase 2 Execution
   (smoke + UI/API/DB)         (reproduce -> verify fix -> regression)
   Stage 3 Reporting           Phase 3 Reporting
   (ATR + QA comment)          (ATR + QA verification comment)
```

After the final stage, hand off to Stage 4 (`test-documentation`), Stage 5 (`test-automation`), or Stage 6 (`regression-testing`) as applicable. Those are OUT OF SCOPE for this skill.

---

## Session Start — the universal entry

Act as a Senior QA Engineer preparing a testing session for a ticket (User Story or Bug).

### Input

- `TICKET-ID` (required) — e.g. `{{PROJECT_KEY}}-123`.
- Environment — defaults to `{{DEFAULT_ENV}}` (staging); ask if ambiguous.

### Step 1 — Fetch the ticket from the issue tracker

> **Prerequisite**: Load `/acli` skill before executing the commands below. In Modality A (Xray) also load `/xray-cli` for `[TMS_TOOL]` calls. If Session Start §0.1 in `SKILL.md` already loaded them, skip.

```
[ISSUE_TRACKER_TOOL] Fetch Issue:
  - issueId: {TICKET-ID}

# For TMS-native tests list (optional, used in Stage 1 later):
[TMS_TOOL] List Tests:
  - project: {{PROJECT_KEY}}
```

Extract and note: Title, Project / Module, Status (must be ready for testing), Sprint, Acceptance Criteria, Dependencies, Comments.

### Step 1b — Team Discussion from ticket comments

The issue-tracker response from Step 1 includes comments. Process them now.

Extract:
- **Decisions** — agreed-upon behavior, scope changes, AC clarifications.
- **Technical notes** — implementation details shared by developers.
- **Edge cases** — scenarios or concerns raised by team members.
- **Blockers / warnings** — known issues or constraints.

Formatting rules:

| Rule | Detail |
|------|--------|
| Format | `[Author] (date): key point` per relevant comment |
| Grouping | If 5+ comments, group by theme (decisions / technical / edge cases) |
| Skip | Automated comments (bot messages, status transitions, CI notifications) |
| Skip | Social comments ("thanks!", "looks good", emoji-only) |
| Images | Note as `[image attachment: {filename}]` — not downloadable |
| >10 threads | Include 10 most recent substantive comments, note total count |

This step is NON-BLOCKING:

| Scenario | Action |
|----------|--------|
| Comments exist | Format into Team Discussion section for `context.md` (Step 7) |
| No comments | Note: "No team discussions found on this ticket." |
| Issue-tracker unavailable | Log warning, note "Comments not loaded", continue |
| Step 1 failed entirely | Skip Step 1b, continue to Step 2 |

### Step 2 — Explain the story to the user (REQUIRED, then WAIT)

Stop and explain the story to the user. Provide a brief, easy-to-understand summary:

- What is this feature / bug about?
- How does it work?
- What will we be testing?
- Any important team decisions from ticket comments (scope changes, dev notes, PO clarifications).

Example:

```
This story is about showing empty states in the Dashboard.
When a user has not uploaded their data yet, the page should show "Awaiting Data"
instead of the normal dashboard.

We will test 4 acceptance criteria:
- AC1: Show "Awaiting Data" when no file exists
- AC2: Show "Synced" when integration completes
- AC3: Only one empty state at a time
- AC4: Show file reception date

Team discussed in the comments:
- Dev confirmed: API returns 204 (No Content) when no data exists
- PM clarified: admin view is out of scope for this story

Shall we proceed?
```

If team discussions reveal decisions that modify or extend the ACs, highlight them explicitly so the user sees context beyond the original ticket.

**MANDATORY:** WAIT for user confirmation before continuing.

> Batch-sprint mode exception: when running as a sub-agent, do NOT ask the user — just write the Story Explanation into `test-session-memory.md` and finish. The orchestrator shows it to the user.

### Step 3 — Load project context

Read these files to understand the system:

```
.context/mapping/business-data-map.md       # business flows and state machines
.context/mapping/business-feature-map.md    # feature catalog, CRUD matrix, integrations
.context/mapping/business-api-map.md        # auth model, critical journey endpoints, external integrations
.context/master-test-plan.md                # testing guide (what to test and why)
```

These provide business flows, feature inventory, API contracts + authentication model, and the test strategy. If ALL four files are missing, stop and hand off to the `project-discovery` skill (or invoke the individual `/business-*-map` + `/master-test-plan` commands). Sprint-testing cannot plan without them.

### Step 4 — Module context (3-level hierarchy)

The context hierarchy is: Project (system-wide) -> Module (feature area like Orders, Dashboard) -> Story (individual ticket).

Derive `{module-name}` from the ticket's project or module field — kebab-case (e.g. "Monthly Statement Improvements" -> `monthly-statement`).

Check whether `module-context.md` exists:

| Module Context | Action |
|----------------|--------|
| Exists | Read it; skip full code exploration; use the existing knowledge |
| Missing | Create the module folder; do a full exploration; generate `module-context.md` |

If it exists at `.context/PBI/{module-name}/module-context.md`, read it. Otherwise, explore code related to the ticket:

- Backend (`{{BACKEND_REPO}}` with entry `{{BACKEND_ENTRY}}`, stack `{{BACKEND_STACK}}`): controllers, services, models related to the feature.
- Frontend (`{{FRONTEND_REPO}}` with entry `{{FRONTEND_ENTRY}}`, stack `{{FRONTEND_STACK}}`): routes, state, components.

Then generate `module-context.md` from the project template at `.context/PBI/templates/module-context.md` (or `module-context-template.md`). Fill with: routes discovered, state files found, API endpoints, database tables, key entities for testing. Module context is REUSABLE — the next ticket in the same module skips exploration.

Document story-specific code that is NOT in module context (ticket-level only).

### Step 5 — Load skills

```
Use skill: playwright-cli     # browser automation for UI testing
Use skill: xray-cli           # TMS operations (if project uses Xray)
```

Skip skills that are not configured for the project.

### Step 6 — Create the PBI structure

```
.context/PBI/
  templates/                           # do not edit
    module-context.md
  {module-name}/                       # MODULE LEVEL (reusable)
    module-context.md                  # persists across tickets
    {{PROJECT_KEY}}-{number}-{brief-title}/   # STORY LEVEL (new)
      context.md                       # story-specific context (Step 7)
      test-analysis.md                 # ATP mirror, created in Stage 1
      test-report.md                   # ATR mirror, created in Stage 3
      evidence/                        # screenshots, gitignored
```

Folder naming:

- `{module-name}`: kebab-case from the ticket project/module field.
- `{brief-title}`: AI-generated summary, max ~5 words, kebab-case.

Create the folders now. `test-analysis.md` and `test-report.md` are created later (Stages 1 / 3); `context.md` and `evidence/` are created now.

### Step 7 — Write the initial context.md

```markdown
# {{PROJECT_KEY}}-{number}: {Title}
**Ticket:** {{PROJECT_KEY}}-{number} | **Module:** {module-name} | **Status:** {status} | **Sprint:** {sprint}

## Acceptance Criteria
- AC1: ... / AC2: ... / ...

## Team Discussion
> Extracted from ticket comments.
### Key Decisions
- [{Author}] ({date}): {decision}
### Technical Notes
- [{Author}] ({date}): {note}
### Edge Cases Raised
- [{Author}] ({date}): {edge case}
{If no comments: "No team discussions found."}
{If issue-tracker failed: "Comments not loaded."}

## Related Code
### Backend / Frontend / Database
- `{path}` — {description}
- Tables: {tables}

## TMS Artifacts
| Artifact | ID | Status |
|----------|----|--------|
| ATP | Pending | Created in Stage 1 |
| ATR | Pending | Created in Stage 3 |

## Session Notes
### Session 1 — {date}
Context loaded / Code explored / Environment
```

### Output summary (single-ticket mode)

```markdown
## Session Initialized: {{PROJECT_KEY}}-{number}
- Ticket / Module / ACs count / Team Discussions count
- Project context loaded (all 3 files)
- Module context: loaded or created
- Story context.md created
- Next step: US workflow section below OR Bug workflow section below
```

### Error table

| Situation | Action |
|-----------|--------|
| Ticket not found | Verify ID, check the issue tracker |
| Ticket not ready for testing | Wait for deployment |
| No ACs defined | Request ACs before testing |
| No test data found | Expand query, ask user for alternatives |
| Code not found | Search with alternative terms |
| No comments on ticket | Continue — note in `context.md` |
| >10 comments | Summarize the 10 most recent, note earlier omitted |
| Project context files missing | Stop and hand off to `project-discovery` |

### Behaviour reminders

1. Always explain the story before proceeding.
2. WAIT for user confirmation; never auto-advance (except batch-sprint sub-agent mode).
3. All documentation and TMS content in English.
4. ALWAYS load / create module context — do not skip exploration.
5. Persist everything into the PBI folder.
6. Credentials always from `.env` — never hardcode.

---

## User-Story workflow (single-ticket mode)

After Session Start, run Stages 1 -> 2 -> 3 for the story. Then hand off to Stage 4 / 5 / 6.

```
┌────────────────────────────────────────────────────────────────┐
│                     US QA WORKFLOW                              │
└────────────────────────────────────────────────────────────────┘

 Session Start  ───► Stage 1 ───► Stage 2 ───► Stage 3 ───►  hand-off
                    Planning      Execution     Reporting     (Stage 4/5/6)
                    ATP/ATR/TCs   Smoke+deep    ATR + comment
                                  exploration
```

### Prerequisites

- [ ] Session Start executed.
- [ ] Story is "{{jira.status.story.ready_for_qa}}".
- [ ] Feature deployed to the active env (`{{WEB_URL}}` / `{{API_URL}}`).
- [ ] Project context files loaded.

### Stage 1 — Planning (overview)

Prompts / references:

- `references/acceptance-test-planning.md` — ATP body, Test Analysis, TC nomenclature, traceability.
- `references/feature-test-planning.md` — higher-granularity feature plan (optional).

> **Prerequisite**: Load `/acli` skill before any `[ISSUE_TRACKER_TOOL]` call. In Modality A (Xray) also load `/xray-cli` for `[TMS_TOOL]` calls. If Session Start §0.1 already loaded them, skip. Modality B: `/acli` covers both tags.

Actions:

1. Read the story (ACs, business rules, dependencies).
2. Triage (veto or risk score) — outputs: Full Plan vs Quick Plan vs Skip.
3. Discover test data via `[DB_TOOL]` on `{{DB_MCP}}` (and/or `[API_TOOL]`).
4. Create the ATP linked to the Story via `[TMS_TOOL]`.
5. Create the ATR linked to the Story. Link ATP -> ATR.
6. Fill Test Analysis in the ATP (scope, risks, scenarios, variables, test data, AC gaps).
7. Create TCs with FULL traceability (`--story + --test-plan + --test-result`).
8. Verify: `[TMS_TOOL] trace {{PROJECT_KEY}}-{number}`.
9. Mark ATP complete. Transition TCs to Ready.
10. Create `test-analysis.md` in the PBI folder (local mirror of ATP).

Output checkpoint:

```markdown
## Stage 1 Complete
- [ ] ATP created with N scenarios
- [ ] TC nomenclature `{US_ID}: TC#: Validate <CORE> <CONDITIONAL>` applied
- [ ] Variables + test data identified
- [ ] Traceability verified
- [ ] Ready for execution testing
```

### Stage 2 — Execution (overview)

Reference: `references/exploration-patterns.md`.

Actions:

0. **Mark ticket as actively testing** (substrate-driven, idempotent, non-blocking): resolve `{{jira.transition.<work_type>.start_testing}}` and `{{jira.status.<work_type>.in_test}}` from `.agents/jira-workflows.json`; transition `<TICKET_KEY>` to the in-test state if it is not already there. Skip cleanly when the substrate has no in-test state for the work type (e.g. Bugs in this boilerplate's default substrate). Detail in `sprint-orchestration.md` Briefing 3 Step 1.
1. **Smoke test (5-10 min, ALWAYS FIRST)**: verify basic functionality works, no blocking errors. Go (proceed) or No-Go (STOP and report).
2. **Deep exploration** as applicable:
   - UI on `{{WEB_URL}}` via `[AUTOMATION_TOOL]`.
   - API on `{{API_URL}}` via `[API_TOOL]`.
   - DB cross-validation via `[DB_TOOL]` on `{{DB_MCP}}`.
3. Use TCs as guides but explore beyond them (edge cases, boundaries, data variations, user perspectives). Create new TCs for significant discoveries.
4. Update TC statuses in the TMS (PASSED / FAILED).
5. Bug reporting — file any issues per `references/reporting-templates.md` (Bug Report template).
6. Decision: PASSED -> Stage 3. BLOCKED -> wait, retry. FAILED -> report + escalate.

Output checkpoint:

```markdown
## Stage 2 Complete
- [ ] Smoke: PASSED / FAILED
- [ ] Deep exploration: PASSED / FAILED / BLOCKED
- [ ] Bugs created: N (or none)
- [ ] Recommendation: APPROVE / REJECT / WAIT
```

### Stage 3 — Reporting (overview)

Reference: `references/reporting-templates.md`.

> **Prerequisite**: Load `/acli` skill before any `[ISSUE_TRACKER_TOOL]` call (QA comment, transition, bug filing). In Modality A (Xray) also load `/xray-cli` for `[TMS_TOOL]` ATR update / Run update. Modality B: `/acli` covers both tags. Skip if Session Start §0.1 already loaded them.

Actions:

1. Compile TC summary (total, PASSED, FAILED, pass rate).
2. Fill the ATR Test Report via `[TMS_TOOL] atr update {ATR-ID} --report "..."`. Mark ATR complete.
3. Create `test-report.md` in the PBI folder (local mirror of ATR).
4. Post the QA comment to the ticket via `[ISSUE_TRACKER_TOOL]`. Use the user-story templates (PASSED / FAILED) from `reporting-templates.md`.
5. Transition the ticket to the work-type terminal QA state via substrate: Story PASSED -> `{{jira.transition.story.qa_sign_off}}`, Bug PASSED -> `{{jira.transition.bug.retest_passed}}`. Skip the transition on FAILED outcomes (no canonical "send back to dev" transition in the substrate yet) — see `sprint-orchestration.md` Briefing 4 Step 5 for full decision tree.
6. Attach evidence screenshot paths for the user.

Output checkpoint:

```markdown
## Stage 3 Complete
- [ ] All bugs formally documented and linked to the US
- [ ] ATR filled and marked complete
- [ ] QA comment posted
- [ ] Ticket transitioned
```

### Hand-off after Stage 3

| Next step | Skill | Reason |
|-----------|-------|--------|
| Prioritize for automation, calculate ROI, formal Candidate/Manual/Deferred decisions, create regression TCs | `test-documentation` | Stage 4 |
| Write the automated test code for Candidates | `test-automation` | Stage 5 |
| Run the automated suite, release decision | `regression-testing` | Stage 6 |

### Traceability model

```
USER STORY ({{PROJECT_KEY}}-XXX)
    |
    +--> ATP (Test Plan: {{PROJECT_KEY}}-XXX)
    |        |
    |        +--> ATR (Test Results: {{PROJECT_KEY}}-XXX)
    |                 |
    +--> TCs ---------+
         (linked to Story + ATP + ATR)
```

All artifacts are created in Stage 1 with complete links.

### Error table (US workflow)

| Situation | Action |
|-----------|--------|
| US not ready | Verify status, wait for "{{jira.status.story.ready_for_qa}}" |
| Staging down | Check deployment, escalate to DevOps |
| Critical bug found | Stop exploration, create bug, wait for fix |
| Flaky behaviour | Retry with fresh data; document and move on |

---

## Bug workflow (single-ticket mode)

After Session Start, run Phase 1 -> Phase 2 -> Phase 3. Bugs use the same PBI folder structure as user stories, but create NO TCs — the bug ticket itself is the implicit test case.

### When to use this workflow

| Work Type | Use this workflow? |
|-----------|-------------------|
| Bug | Yes |
| Feature / Task / Tech Debt | No — use the user-story workflow above |

| Ticket Status | Use this workflow? |
|---------------|-------------------|
| Deployed to staging | Yes — ready to retest |
| In Progress / Dev Complete (not yet {{jira.status.story.ready_for_qa}}) | No — wait for deployment |
| Already tested | No — already verified |

### Phase 1 — Triage + Planning

#### Step 1.1 — Triage

Goal: decide Full Retesting vs Code-Review-only vs Skip. Philosophy: test where it matters; skip where testing adds no value. Fetch Title, Status, Work Type, Person Hours, Description, Priority, Module.

#### Step 1.2 — Veto table (bypasses risk score)

**VETO: SKIP retesting** (recommend Code Review only):

| Condition | Indicators |
|-----------|------------|
| Pure text / label fix | typo, label, text, copy, spelling, tooltip + hardcoded in frontend |
| Pure visual / CSS | color, style, spacing, font, alignment, responsive, UI polish |
| Documentation | README, docs, comments, swagger, help text |
| Config / infrastructure | config, env, pipeline, deployment, CI/CD |
| Tech debt cleanup | refactor, cleanup, rename + no functional change |

How to verify "Pure text": if the text comes from API/DB it's NOT pure text (needs retesting); hardcoded in frontend is pure text (skip).

**VETO: REQUIRE retesting** (regardless of score):

| Condition | Examples |
|-----------|----------|
| Money / billing | invoices, payments, pricing, fees, commissions, caps |
| Data integrity | CRUD, import/export, data sync, calculations |
| Auth / authorization | login, permissions, roles, security, tokens |
| External integrations | third-party APIs, webhooks, email, payment gateways |
| State machine bugs | workflow transitions, status changes, multi-step processes |
| Calculations / formulas | numeric calculations users depend on |

If a veto applies, skip to Step 1.4 with the veto result.

#### Step 1.3 — Risk score (only if no veto)

| Factor | Points | How to evaluate |
|--------|--------|-----------------|
| Bug involves API/DB data (vs hardcoded) | +3 | Does the fix touch backend data flow? |
| Clear reproduction steps | +2 | Are there specific steps to verify? |
| User-facing functionality | +2 | Will end users notice a regression? |
| Priority High or Critical | +2 | Check ticket priority |
| State changes involved | +2 | Workflow / status transitions affected? |
| Multiple components | +1 | Frontend + Backend? |
| External user report | +1 | Customer (not internal) reporter? |

Score: 0-3 LOW (Code Review only); 4-7 MEDIUM (ask user); 8+ HIGH (Full Retesting).

#### Step 1.4 — Present triage result and WAIT

Present the decision with sections for VETO SKIP, VETO REQUIRE, or SCORE-BASED. Include bug summary, reproduction steps, decision, rationale, environment, recommendation. MANDATORY: wait for user confirmation. The user may ask questions, request more context, or override.

#### Code Review workflow (low-risk path)

> **Prerequisite**: Load `/acli` skill before the final `[ISSUE_TRACKER_TOOL]` post in step 4. Skip if Session Start §0.1 already loaded it.

If triage is Code Review, skip Phases 2-3:

1. **Search for the fix in code** — `grep` for the fixed value and for residual old values.
2. **Verify the fix is correct** — addresses reported issue, no residual buggy code, no similar issues nearby.
3. **Prepare QA Code Review comment**:

   ```
   QA CODE REVIEW - {{PROJECT_KEY}}-{number}
   Reviewed: {date}
   Type: Low Risk Bug Fix (Code Review only)
   TRIAGE: {Veto SKIP or Risk Score = X (LOW)}
   VERIFICATION:
   - [x] Fix found in: {file locations}
   - [x] Issue "{bug description}" addressed
   - [x] No residual problematic code found
   RESULT: Verified
   No ATP/ATR created (low risk fix).
   Ready for {{jira.status.bug.closed}} status.
   ```
4. Post via `[ISSUE_TRACKER_TOOL]`. END of Code Review workflow.

#### Step 1.5 — Create ATP + ATR (no TCs)

For bugs that need Full Retesting:

- ATP: "Test Plan: {{PROJECT_KEY}}-{number}"
- ATR: "Test Results: {{PROJECT_KEY}}-{number}"
- Link ATP to ATR

Why no TCs: the bug ticket is the implicit test case. Reproduction steps = test steps. Expected vs Actual = pass/fail criteria.

#### Step 1.6 — Discover test data

Use `[DB_TOOL]` on `{{DB_MCP}}` or `[API_TOOL]` to find test data needed to reproduce and verify the bug. Document the entities, IDs, owners, and user role needed.

#### Step 1.7 — Fill Bug Analysis in the ATP

Bug Analysis is your execution guide — write it BEFORE touching the browser:

```
BUG ANALYSIS - {{PROJECT_KEY}}-{number}
Date: {today}

BUG SUMMARY
  Was: {what was broken}
  Fix: {what the fix should do}
  Module: {affected module}

TEST DATA
  Environment: {Staging / localhost}
  Entity: {name} (ID: {id})
  Related data: {context}
  User: {role needed to reproduce}
  URL: {direct link to affected page}

VERIFICATION STRATEGY
  1. Navigate to: {affected area}
  2. Setup: {preconditions}
  3. Reproduce: {original bug steps}
  4. Verify fix: {what to observe}
  5. Regression: {related areas to check}

RISK ASSESSMENT
  Priority: {from ticket}
  If regresses: {user impact}
```

#### Step 1.8 — Load Playwright CLI skill

```
Use skill: playwright-cli
```

#### Step 1.9 — Verify traceability

Confirm ATP -> ticket, ATR -> ticket, ATP -> ATR are all linked. Missing-TCs "gaps" are expected and OK for bugs (the bug is the implicit TC).

### Phase 2 — Execution

Detailed smoke / evidence-config / regression-check playbook lives in `references/exploration-patterns.md`. Bug-specific flow:

1. **Configure evidence**: `.playwright/cli.config.json` `outputDir` -> `.context/PBI/{module-name}/{{PROJECT_KEY}}-{number}-{brief-title}/evidence`. Remember `outputDir` does NOT apply to `.png` screenshots — always pass the full path in `--filename`.
2. **Verify the fix**: navigate to the affected area -> reproduce original scenario -> observe the bug is GONE -> verify expected behaviour -> screenshot the correct behaviour. Evidence naming: `.context/PBI/{module}/{{PROJECT_KEY}}-{number}-{brief-title}/evidence/{{PROJECT_KEY}}-{number}-{brief-description}.png`.
3. **Quick regression check**: adjacent features still work; similar scenarios still work; edge cases (empty / null / max) still handled. If a regression is found, document it and file a new bug.

### Phase 3 — Reporting

Templates (ATR body, QA comment Template C PASSED / Template D FAILED, evidence-attachment rules) live in `references/reporting-templates.md`. Bug-specific flow:

1. **Automation opportunity assessment** — rate 0-2 each: Reproducibility, Stability, Risk, Frequency, Complexity. Totals: 8-10 HIGH / 5-7 MEDIUM / 0-4 LOW. Record suggested test type (E2E / API / DB) and effort (Low / Medium / High). The `test-documentation` skill will use this for the formal ROI decision.
2. **Update ATR** — if none exists, create "Bug Verification: {{PROJECT_KEY}}-{number}". Fill with: ticket, environment, result (PASSED/FAILED), step-by-step verification, regression check, automation assessment. Mark complete.
3. **Ticket status + comment** — PASSED: add verification summary via Template C, transition to {{jira.status.bug.closed}} (via the {{jira.transition.bug.retest_passed}} transition). FAILED: add failure details via Template D, move back to {{jira.status.bug.in_progress}}, tag developer. ALWAYS prepare the comment BEFORE transitioning.
4. **Evidence paths for the user** — after posting, tell them the 1-2 most important screenshot paths to attach (pick bug-showing-fix for PASSED; before/after for regressions; skip navigation screenshots).
5. **Update local PBI `context.md`** — Type: Bug, Status VERIFIED/FAILED, Verified date, Bug Summary (Was/Now), Verification Result + evidence path, Automation Assessment (Candidate/Priority/Reason), Notes.
6. **Report to user** — `Bug Verification Complete` block with: bug, dev, result, verification summary table, evidence path, automation assessment, TMS artifacts (ATR id), next steps (ready for prod / add to automation backlog / return to dev).

### Bug workflow quality checklist

- [ ] Reproduction steps were clear
- [ ] Test data discovered and documented
- [ ] ATP filled with Bug Analysis (execution guide)
- [ ] Bug fix verified working
- [ ] Regression check completed
- [ ] Evidence captured (screenshot)
- [ ] Automation opportunity assessed
- [ ] ATR documented with results
- [ ] Ticket status updated
- [ ] Local PBI updated

### What not to do (bugs)

| Avoid | Why |
|-------|-----|
| Creating TCs for bugs | The bug itself is the test case |
| Skipping Bug Analysis | The ATP is your execution guide — not ad-hoc testing |
| Skipping test-data discovery | Test data must be reusable if retesting is needed |
| Skipping automation assessment | Bugs are prime regression-test candidates |
| Testing without reproduction steps | Always confirm steps exist before testing |

### Bug vs User Story — quick comparison

| Aspect | Bug | User Story |
|--------|-----|------------|
| Has ACs? | No — has Expected vs Actual | Yes — multiple ACs |
| Test planning | ATP with Bug Analysis | ATP with Test Analysis |
| Test cases | None (bug = test case) | 1 positive + 1 negative per AC (approx) |
| Documentation | ATP (Bug Analysis) + ATR | ATP + ATR + TCs (full) |
| Automation | High priority if recurring | Based on business value (Stage 4 ROI) |

Bugs are OPPORTUNITIES for automation. Every verified bug fix is a potential regression test — flag it accordingly for `test-documentation`.
