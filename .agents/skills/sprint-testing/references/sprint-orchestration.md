# Sprint Orchestration — Sprint-Wide Mode

Use this reference when iterating multiple issues in a sprint. Covers: building the sprint session pair (`plan.md` + `progress.md`) and the STP that mirrors it, the per-issue orchestration loop, checkpoint mechanics, stop/pause/resume logic, and the `continue-from` parameter. Single-issue mode is described in `session-entry-points.md`.

> "Issue", not "story": Story, Bug, Defect, Improvement, Tech Story and Tech Debt are all coverable, and the sprint queue holds whichever of them the project declares (see §Part 1 Step 1).

---

## Parameters

| Parameter | Required | Meaning |
|-----------|----------|---------|
| `sprint` | YES | Sprint number `N`. Resolved from the issue's Sprint field when only an issue key was given; ASK the user when the issue carries no sprint. Never guessed. |
| `continue-from` | NO | Issue key (e.g. `{{PROJECT_KEY}}-277`) to resume from. |

If a parameter is missing, ASK the user before proceeding. Before starting, verify:

1. `.session/sprint-testing/sprint-<N>/plan.md` exists and is readable — if not, build it (§Part 1).
2. Its `## Phase breakdown` queue contains at least one row with a recognizable status (`PENDING`, `PASSED`, `FAILED`, `BLOCKED`, `DEFERRED`, `SKIPPED`).
3. If `continue-from` was provided, the issue key exists in the queue. If not, list the queued issues and ask.

---

## Orchestrator ground rules

You are the ORCHESTRATOR for in-sprint QA on `{{PROJECT_NAME}}`. Manage the workflow by dispatching sub-agents per stage, maintaining shared memory, and interacting with the user at defined checkpoints.

1. NEVER execute testing stages yourself. ALWAYS delegate to a sub-agent via the Agent tool (sequential fallback when sub-agents are unavailable).
2. Sub-agents run SEQUENTIALLY — one stage at a time. Wait for completion before dispatching the next.
3. After every sub-agent finishes, re-read `test-session-memory.md` and present a brief summary to the user.
4. TOOL FAILURE -> STOP, surface error, do NOT dispatch next sub-agent, wait for user instructions.
5. **Blocking** BUG_FOUND (smoke/env down, data integrity, security-exploitable) -> PAUSE, present bug to user, wait for decision. A **non-blocking** finding does NOT pause: the Execution subagent logs it and finishes the pass, and you surface it at Stage 2 close. Classify by the "Finding triage" table in `exploration-patterns.md`; a FAIL is not auto-Critical.

---

## Part 1 — Sprint plan + STP

Use when the user answers `sprint-wide` to the mode question and no sprint session pair exists yet. **Auto-invoked by `SKILL.md` §Session Start step 0.5**. Never run as a standalone command — it is a precondition of the skill.

It produces exactly two things, and neither is a bespoke tracker file:

| Artifact | Address | Schema | Write mode |
|---|---|---|---|
| Sprint plan | `.session/sprint-testing/sprint-<N>/plan.md` | `agentic-qa-core/references/session-management.md` §6 | rewritten wholesale → ONE writer |
| Sprint log | `.session/sprint-testing/sprint-<N>/progress.md` | same doc §7 | append-only |

and mirrors them onto the **STP** issue (`STP: Sprint#{N}: {objective}`, a Test Plan parented to the QA Master Test Plan epic): `plan.md` → its **description**, `progress.md` → its **comments**. The parity is the point — see §"STP parity" below.

### Inputs

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `sprint_number` | YES | Sprint to plan | `10` |
| `qa_lead` | NO | Defaults to `git config user.name`, ask if missing | `Jane Doe` |
| `previous_sprint` | NO | Prior sprint number, for carryover detection | `9` |

> **Prerequisite**: The sprint roster query in Step 1 is a bulk read — use `bun run jira:sync-issues jql "<query>"` (resolves every slug, materializes per-issue `.md`). Load `/acli` only for the later WRITEs (the STP, transitions). Part 1 runs before per-issue Session Start, so §0.1 has not yet executed — load `/acli` explicitly when a write is reached.

### Steps

1. **Resolve the scope by QUERY — never a hardcoded issue-type list.** The work types in scope come from the PROJECT's own declaration, so a Jira with only `Story` and one with six coverable types both work:

   | Step | Source | Rule |
   |---|---|---|
   | a. Declared | `.agents/jira-required.yaml` | every work type with `coverable: true` |
   | b. Named | that work type's `jira_issue_type` | `A \| B \| C` = ORDERED alternatives; the first name the instance actually has wins (the `subtask` entry documents this pattern) |
   | c. Present | `.agents/jira-workflows.json` | the synced catalog of what the instance really exposes — a work type absent here does not exist |
   | d. Missing | — | **SKIP WITH A NOTE** in `plan.md` §"Risks & open questions". Never a blocker, never a stop |

   Build the JQL from the surviving names plus the sprint filter. *Illustrative only, do NOT copy this list anywhere:* an instance exposing all six coverable types yields `sprint = {N} AND project = {{PROJECT_KEY}} AND issuetype in (Story, Bug, Defect, Improvement, "Tech Story", "Tech Debt")`; an instance with only `Story` yields `issuetype = Story`, which is a correct and complete run.

2. **Query the roster** via `bun run jira:sync-issues jql "<the query from Step 1>"`: Issue key, Type, Title, Priority, Status, QA Assignee, Developer, Project/Epic, Platform read from the synced `.md`. (A trivial `[ISSUE_TRACKER_TOOL]` search is fine only if you need nothing beyond key/summary/status — any custom field requires the sync.) Sort by Priority DESC, Status ASC.
3. **Classify** each issue's board status (resolve canonical slugs via `.agents/jira-workflows.json`):

   | Canonical Status (Story) | QA Category | Wave |
   |---|---|---|
   | `{{jira.status.story.in_test}}` | Active testing (resume in progress) | Wave 1 |
   | `{{jira.status.story.ready_for_qa}}` | Ready to test | Wave 1 |
   | `{{jira.status.story.qa_approved}}` *with no ATP/ATR linked* | Missing formal testing (retroactive) | Wave 1 (priority) |
   | `{{jira.status.story.in_review}}` | Dev Complete — PR open | Wave 2 |
   | `{{jira.status.story.in_progress}}` | Still in development | Pipeline |
   | `{{jira.status.story.blocked}}` | Defect blocking release (monitor) | Pipeline |
   | `{{jira.status.story.shift_left_qa}}` / `estimation` / `ready_for_dev` / `backlog` | Not started | Backlog |
   | `{{jira.status.story.qa_approved}}` *with artifacts* / `ready_for_release` / `deployed_to_production` | Verified / released | Done |
   | `{{jira.status.story.aborted}}` | Cancelled (terminal) | Cancelled |

   Principle: issues already mid-test or queued for QA go to Wave 1; previously-approved issues missing ATP/ATR get retroactive Wave-1-priority treatment. The slugs above are shown for the `story` work type; resolve the equivalent slug per work type for the other coverable types (`{{jira.status.<work_type>.<slug>}}`). If the project's substrate lacks a slug (e.g. no `blocked` status), drop that row gracefully and continue.

4. **Detect carryovers** if `previous_sprint` was given. Read the prior sprint's archived log (`.session/.archive/<date>-sprint-testing-sprint-<N-1>/progress.md`) and, when it is gone or was never on this machine, the prior STP's comments via `bun run jira:sync-issues get <STP-KEY> --include-comments`. **The STP is the authoritative source** — the archive is local and may not exist. For each issue whose last recorded status is NOT `PASSED` / `CANCELLED` / `Done`: if it appears in the current sprint, mark it a carryover with prior context; if not, note it "dropped from sprint" and inform the user.
5. **Organize waves** (substrate-driven; skip slugs the project does not expose):
   - Wave 1 = `{{jira.status.story.in_test}}` + `{{jira.status.story.ready_for_qa}}` + retroactive `{{jira.status.story.qa_approved}}` (no ATP/ATR). Sort: Priority then QA assignment.
   - Wave 2 = `{{jira.status.story.in_review}}` (Dev Complete — PR open). Sort by Priority.
   - Pipeline = `{{jira.status.story.in_progress}}` + `{{jira.status.story.blocked}}`, grouped separately.
   - Backlog = `{{jira.status.story.backlog}}` / `shift_left_qa` / `estimation` / `ready_for_dev`.
   - Done = `{{jira.status.story.qa_approved}}` (with artifacts) / `ready_for_release` / `deployed_to_production`.
   - Cancelled = `{{jira.status.story.aborted}}`.
6. **Detect QA automation tasks**: `Type = QA Task` OR title contains "E2E Tests" / "Integration Tests", assigned to `qa_lead`. Collect them as their own wave in the queue.
7. **Write the sprint session pair** using the two schemas below.
8. **Find-or-create the STP** (`SKILL.md` §Session Start 0.7) and seed its **description** from `plan.md`. Present → read-first, then update the description in place; never blind-overwrite another planner's edit.
9. **Report** a short board summary: totals, wave counts, carryovers, and every work type skipped in Step 1d.

### `plan.md` — the sprint's local STP

Follows `agentic-qa-core/references/session-management.md` §6 exactly: the frontmatter below, then the seven H2s in that order. No extra H2s, no substitute file.

```markdown
---
topic_key: session/sprint-testing/sprint-{N}/plan
skill: sprint-testing
scope: sprint-{N}
created_at: {ISO-8601 UTC}
created_by: {model-id}
status: draft
capture_prompt: true
---

## Goal
Run in-sprint QA across the Sprint {N} backlog: {objective}, closing each issue with an ATP, an ATR and a QA verdict.

## Inputs
- JQL scope: `{the query resolved in Step 1}`
- Work types in scope: {resolved names} · SKIPPED (absent from this instance): {names, or "none"}
- Roster: {n} issues · QA lead: {qa_lead} · TMS modality: {jira-xray | jira-native}
- STP: {STP-KEY or "pending creation"}
- Carryovers from Sprint {N-1}: {keys, or "none"}

## Approach
Sprint-wide mode. One nested sub-scope per issue at `.session/sprint-testing/sprint-{N}/<KEY>/`, each running the invariant 4-dispatch cadence (Session Start -> Stage 1 -> Stage 2 -> Stage 3) Sequentially. Waves are executed in order; inside a wave, by the `#` column.

## Phase breakdown
{The QUEUE. One row per issue, in execution order. The four required columns of
 session-management.md §6 plus its standard queue columns (# / Wave / Priority / Owner) —
 this table is the assignment board as well as the plan.}

| # | Wave | Phase | Pattern | Dispatch payload pointer | Priority | Owner | Exit condition |
|---|------|-------|---------|--------------------------|----------|-------|----------------|
| 1 | 1 | {KEY} — {title} | Sequential | `.session/sprint-testing/sprint-{N}/{KEY}/` | {priority} | {qa_lead or unassigned} | PENDING |

{Status lives in "Exit condition": PENDING while queued, then PASSED / FAILED / BLOCKED /
 DEFERRED / SKIPPED once Stage 3 closed the issue. The orchestrator scans for the
 lowest-numbered PENDING to pick the next issue.}

## Risks & open questions
- {risk} — mitigation: {…}
- Work types declared coverable but absent from this instance: {names} — skipped, not blocking.

## Verification checklist
- [ ] Every Wave-1 row reached a terminal status (not PENDING)
- [ ] Every closed issue has an ATP, an ATR carrying the Test Environment, and a QA comment
- [ ] Every closed issue appended one `progress.md` entry AND one STP comment
- [ ] STP description reflects the final queue; STP transitioned to its terminal state
- [ ] `STR: Sprint#{N}: Regression Testing` found-or-created at sprint close

## Cross-references
- STP: {STP-KEY}
- Per-issue sub-scopes: `.session/sprint-testing/sprint-{N}/<KEY>/{plan.md, progress.md, test-session-memory.md}`
- `.context/master-test-plan.md`, `.context/business/business-feature-map.md`
```

**`plan.md` is rewritten wholesale, so it has exactly ONE writer** — whoever plans the sprint. Mid-sprint changes (an issue arrives, a wave is promoted, an owner changes) are appended under `## Changelog` per §6, which is append-only; the body sections above it are never edited in place, because they record the agreement the sprint started from.

### `progress.md` — the append-only sprint log

Follows `agentic-qa-core/references/session-management.md` §7 exactly. One entry per issue close, appended by the orchestrator after Stage 3 verified. At sprint altitude a "phase" is one issue.

```markdown
---
topic_key: session/sprint-testing/sprint-{N}/progress
skill: sprint-testing
scope: sprint-{N}
---

## Phase {n} — {KEY} {title} — {ISO-8601 UTC}
- status: completed | failed | skipped
- dispatched_as: Sequential
- subagent_report: {verdict} · TCs {passed}/{total} ({rate}) · bugs: {keys or none}
- artifacts_touched: [{ATP-KEY}, {ATS-KEY}, {ATR-KEY}, {bug keys}]
- next: {next KEY | stop}
- notes: {one line — AC gaps, recalibrations, blockers}
```

Append-only, in both directions: never rewrite an entry. A correction is a NEW entry, exactly as a retry after a failure is (§7 "Why append-only") — the resulting log is the sprint's execution audit.

### STP parity — why the split is exactly this

The sprint pair and the STP issue are one artifact at two addresses:

| Local file | STP surface | Write mode | Writers | Failure mode it avoids |
|---|---|---|---|---|
| `plan.md` | issue **description** | rewritten wholesale | **ONE** (the planner) | two people editing a description overwrite each other |
| `progress.md` | issue **comments** | **append-only, both sides** | every tester | none — appends never collide |

So: one comment per issue close, carrying the same content as that issue's `progress.md` entry. Two testers closing two issues at the same time each add a comment and nothing is lost; two testers rewriting a description would lose one of the two.

**When the comment log and a Story's ATR disagree, the ATR wins.** The ATR is the artifact of record for that issue; the STP comment is a running log that can lag, or be written from stale state.

Read the log back with `bun run jira:sync-issues get <STP-KEY> --include-comments` — it already materializes the comments locally, so this needs no new tooling.

### Nothing local is a deliverable

`.session/` is gitignored and lives only on the machine that wrote it. The sprint's shareable record is the **STP in Jira** plus the per-issue ATP / ATS / ATR items. Never describe a local file as the canonical output, and never let a downstream step depend on one existing.

---

## Part 2 — The per-issue loop

```
ORCHESTRATOR                           SUB-AGENTS
    |
    |-> Read sprint plan.md queue + tail of sprint progress.md
    |-> Pick next issue (see STEP 1)
    |
    |-> Dispatch SESSION START ------> Creates PBI + context.md · session dir + test-session-memory.md
    |-> Present Story Explanation, WAIT for user OK
    |
    |-> Dispatch PLANNING ----------> Updates memory (artifacts, test data)
    |-> Brief user (1-2 lines)
    |
    |-> Dispatch EXECUTION ---------> Updates memory (TC statuses, findings)
    |-> If blocking BUG_FOUND: present, WAIT for user decision
    |   (non-blocking finding: subagent finished the pass; present at Stage 2 close)
    |
    |-> Dispatch REPORTING ---------> Updates memory (final status)
    |-> Verify Checklist
    |-> APPEND one entry to sprint progress.md + one comment to the STP
    |-> Archive the issue sub-scope
    |-> Present per-issue summary, WAIT for user OK
    |-> Loop to next issue
```

### STEP 1 — Auto-detect the next issue

Read the sprint `plan.md` queue (`## Phase breakdown`) and the tail of the sprint `progress.md`, in this order:

1. If `continue-from` was provided, jump directly to that issue.
2. Retroactive rows — issues in a tested state with no ATP/ATR (Wave 1 priority per Part 1 Step 3). Process these first.
3. Current wave (Wave 1 by default) — lowest-numbered row still `PENDING` in its Exit condition.
4. If the current wave is done, check whether a new wave has formed and repeat.

`progress.md` is the authority on what actually closed: a row still reading `PENDING` whose key already has a `completed` entry means the queue was not updated, so trust the log and say so.

Once chosen: note key / type / title / priority, check for an existing `test-session-memory.md` (interrupted session), tell the user which issue and why.

### STEP 2 — Dispatch sub-agents per workflow

| Issue Type | Sub-agent 1 | Sub-agent 2 | Sub-agent 3 | Sub-agent 4 |
|-------------|-------------|-------------|-------------|-------------|
| Feature / Product Roadmap / UX-UI / Task / QA Task | Session Start | Stage 1 Planning (Feature) | Stage 2 Execution | Stage 3 Reporting |
| Bug | Session Start | Bug Planning (Phase 1: Triage + Planning) | Bug Execution (Phase 2) | Bug Reporting (Phase 3) |

---

## Sub-agent prompt templates

Every dispatch uses the **7-component briefing format** defined in `.agents/skills/agentic-qa-core/references/briefing-template.md` (Goal / Context docs / Project Standards (auto-resolved) / Skills to load / Exact instructions / Report format / Rules). The four briefings below cover the per-issue cadence (Session Start -> Stage 1 -> Stage 2 -> Stage 3) and are used VERBATIM in BOTH single-issue and sprint-wide modes — single-issue runs them once, sprint-wide loops them per Wave 1 PENDING row. Detailed step instructions live in the stage-specific reference — do NOT duplicate them here.

> **Variable resolution**: `<TICKET_KEY>`, `<EPIC_KEY>`, `<EPIC_SLUG>`, `<STORY_SLUG>`, `<PBI_FOLDER>`, `<SESSION_DIR>`, `<ENV>` are session variables filled by the orchestrator before dispatch. `{{PROJECT_KEY}}`, `{{WEB_URL}}`, `{{API_URL}}`, `{{API_MCP}}`, `{{DB_MCP}}` resolve from `.agents/project.yaml` per `AGENTS.md` §"Project Variables".
>
> | Variable | Resolves to | Holds |
> |---|---|---|
> | `<PBI_FOLDER>` | `.context/PBI/epics/EPIC-<EPIC_KEY>-<EPIC_SLUG>/stories/STORY-<TICKET_KEY>-<STORY_SLUG>/` (module = Epic, 1:1) | The Jira cache for this ticket, plus local-only `context.md` and `evidence/`. Regenerable with `bun run jira:sync-issues`. |
> | `<SESSION_DIR>` | `.session/sprint-testing/<scope>/` where `<scope>` is `<TICKET_KEY>` (single-issue) or `sprint-<N>/<TICKET_KEY>` (sprint-wide) | Session state: `plan.md`, `progress.md`, and `test-session-memory.md`. In sprint-wide mode the PARENT directory `.session/sprint-testing/sprint-<N>/` holds the sprint's own `plan.md` + `progress.md` — orchestrator-owned, never written by a sub-agent. |
>
> Both are absolute paths. They are separate on purpose: `<PBI_FOLDER>` is a cache that a re-sync overwrites wholesale, so anything a resume depends on must live in `<SESSION_DIR>` instead.

> **Environment override**: every briefing resolves `{{WEB_URL}}` / `{{API_URL}}` through `test-session-memory.md` §Environment FIRST. If `WEB_URL_OVERRIDE` / `API_URL_OVERRIDE` is set there (not `none`), use it instead of the `project.yaml` active-env value — this is a session-only ad-hoc URL (broken staging, ephemeral preview deploy, hotfix branch) authorized by the user. It is NEVER written to `.agents/project.yaml`. This is distinct from `active_env` switching (which picks a *named* env from `project.yaml`). The override is recorded once at Session Start and read automatically by all four dispatches — do not re-thread it per briefing.

> **Skill-loading invariant**: every briefing that WRITES via `[ISSUE_TRACKER_TOOL]` requires `/acli`; every briefing that touches `[TMS_TOOL]` in Modality jira-xray also requires `/xray-cli`. Detailed READS (ticket detail, ACs, ATP/ATR, comments) do NOT use `/acli` — they use `bun run jira:sync-issues get <KEY> --include-comments` and read the synced `.md`. Sub-agents inherit the orchestrator's skill registry, so the orchestrator only needs to load `/acli` once at Session Start §0.1 — but each briefing's "Skills to load" line lists it explicitly so the dispatch is self-contained.

> **Bug-vs-Feature divergence**: the Stage 1 briefing applies the veto + risk-score decision tree only when `<TICKET_TYPE>` is `Bug`; for Feature/Story tickets it produces the full ATP per `acceptance-test-planning.md` Phases 1-7. The Stage 2 and Stage 3 briefings keep the same shape; their internal step list adapts (smoke + reproduce + regression vs smoke + triforce; Template C/D vs PASSED/FAILED comment).

### Briefing 1 — Session Start subagent

```
Goal: Fetch ticket <TICKET_KEY> from the issue tracker, load relevant context, create the PBI folder, and return a session-start report.

Context docs:
  - <<REPO_ROOT>>/AGENTS.md (§"Local Context (PBI)" folder convention)
  - <<REPO_ROOT>>/.context/master-test-plan.md
  - <<REPO_ROOT>>/.context/business/business-data-map.md
  - <<REPO_ROOT>>/.context/business/business-feature-map.md
  - <<REPO_ROOT>>/.context/business/business-api-map.md
  - <<REPO_ROOT>>/.agents/skills/sprint-testing/references/session-entry-points.md
  - <<REPO_ROOT>>/.agents/project.yaml (project metadata + active env)

Skills to load: none required for the read (detailed fetch uses bun run jira:sync-issues, not /acli)

Exact instructions:
  1. Fetch detail: `bun run jira:sync-issues get <TICKET_KEY> --include-comments`, then read the synced `.md` files (story.md, acceptance-criteria.md, comments.md, etc.) to capture: type, summary, AC list, status, components, fix-version, comments. NEVER `acli workitem view` for custom fields.
  2. Determine <EPIC_KEY> / <EPIC_SLUG> (module = Epic, 1:1) from the parent epic + components/labels per session-entry-points.md §"Step 4 — Module context".
  3. Generate <STORY_SLUG> (max 5 words, kebab-case) from the ticket summary.
  4. Create <PBI_FOLDER> with the HAND-AUTHORED (NON-Jira) files only:
       - context.md (session notes + "Open questions" section, populated per session-entry-points.md §"Step 7")
       - evidence/ (empty directory)
     Jira-mirrored files (story.md, acceptance-criteria.md, acceptance-test-plan.md, comments.md, ...) are materialized by the sync in Step 1 — never hand-write them.
     Create <SESSION_DIR> with:
       - test-session-memory.md (template from this reference §"test-session-memory.md template")
     It belongs in <SESSION_DIR>, NOT in <PBI_FOLDER>: a re-sync overwrites the PBI cache
     wholesale, and this file is the payload every resume and every sub-agent reads.
  5. Extract Team Discussion from the synced comments.md per session-entry-points.md §"Step 1b" rules.
  6. For Bug tickets: include the bug-specific fields (steps to reproduce, expected vs actual) in context.md.
  7. Write the Story Explanation into test-session-memory.md (the orchestrator presents it to the user).

Report format:
  {
    "ticket_key": "<TICKET_KEY>",
    "type": "Story | Bug | Task | ...",
    "epic_key": "<EPIC_KEY>",
    "epic_slug": "<EPIC_SLUG>",
    "pbi_folder": "<absolute path>",
    "memory_path": "<SESSION_DIR>/test-session-memory.md",
    "ac_count": <int>,
    "open_questions": [...],
    "ticket_summary": "...",
    "story_explanation": "<verbatim text written to memory>",
    "readiness": "READY | BLOCKED",
    "inbox_check_required": true|false,
    "checklist": "X/Y"
  }

Rules:
  - Do NOT modify the issue in the issue tracker (read-only operation; no comments, no transitions).
  - Do NOT load all of .context/ — only the docs listed above.
  - Environment reachability was already gated orchestrator-side by Session Start §0.6 before this dispatch — do NOT re-probe the env. If the ticket is email / magic-link / auth-token dependent, set inbox_check_required=true so the orchestrator runs (or has run) the inbox receive-check before Stage 1.
  - Critical Rule #1 (Login Credentials): if any tool needs auth, reference .env keys; never hardcode.
  - Never ask the user for confirmation — the orchestrator handles user interaction.
```

### Briefing 2 — Stage 1 Planning subagent

```
Goal: Produce ATP, risk-triage, and draft TCs for <TICKET_KEY> in <PBI_FOLDER>; for Bug tickets, apply the veto + risk-score decision tree before producing the ATP.

Context docs:
  - <PBI_FOLDER>/context.md (output of Session Start)
  - <SESSION_DIR>/test-session-memory.md (READ FIRST — shared memory)
  - <<REPO_ROOT>>/.agents/skills/sprint-testing/references/acceptance-test-planning.md
  - <<REPO_ROOT>>/.context/business/business-feature-map.md
  - <<REPO_ROOT>>/.context/business/business-api-map.md (if API-affecting)
  - <<REPO_ROOT>>/.context/PBI/epics/EPIC-<EPIC_KEY>-<EPIC_SLUG>/module-context.md (if it exists)

Skills to load: /acli (for ATP/ATR WRITE + Story link); in Modality jira-xray also /xray-cli (for [TMS_TOOL] Test Plan / Test Execution issues). Detailed reads (ACs, parent feature plan) use bun run jira:sync-issues, not /acli.

Exact instructions:
  1. Bug branch: run the veto decision tree per acceptance-test-planning.md §"Phase 0 — Triage" (SKIP -> emit veto_outcome=skip, write minimal Bug Analysis, exit; REQUIRE -> continue).
  2. Risk triage per acceptance-test-planning.md §"0.2 Risk score" (impact x likelihood -> P0|P1|P2 distribution).
  3. Translate ACs into ATP rows (one row per testable behavior); apply Phases 1-4 of acceptance-test-planning.md (Critical Analysis, Story Quality, Refined ACs, Test Outlines).
  4. Draft TC outlines (summary + steps + expected) — full TC bodies are formalized in Stage 4 (test-documentation), not here.
  5. Create ATP + ATS + ATR per the modality branch in acceptance-test-planning.md §"Phase 6 — Traceability + Ticket updates":
       - Modality jira-xray — Set-first order (AUTHORITATIVE):
           ① [TMS_TOOL] Find-or-create TestPlan `ATP: <TICKET_KEY>: {title}` (parent QA Master Test Plan) FROM the {{jira.acceptance_test_plan}} field content the shift-left pass left (pre-sprint the ATP lives ONLY in the field; author fresh — item + field — when the field is empty).
           ② Create the sprint Test issues per the TC-timing rule, then [TMS_TOOL] Find-or-create TestSet `ATS: <TICKET_KEY>: {title}` (parent QA Test Artifacts, components inherited from the Story — mandatory) holding ALL of them (Xray-internal membership, never issue links); link ATS→Story via the `test` slug — THE coverage link (fills the Xray coverage panel).
           ③ Derive the ATP's and the ATR Execution's test lists FROM the ATS membership — never three independent id lists.
           ④ [TMS_TOOL] Create Execution `ATR: <TICKET_KEY>: Story Testing` (parent QA Test Artifacts) ALWAYS carrying the Test Environment from `active_env` in .agents/project.yaml (or the session env switch) — NO ATR without environment (hard gate: agentic-qa-core/references/stage-gates.md §Stage 1).
           ATP→Story / ATR→Story links stay administrative ([ISSUE_TRACKER_TOOL] Link Issues; zero coverage).
       - Modality jira-native: [ISSUE_TRACKER_TOOL] Update Issue with {{jira.acceptance_test_plan}} field (or `## Acceptance Test Plan (ATP)` fallback comment when the field is absent).
  6. Materialize the local cache per modality (read-only cache; never hand-write it), then read it back to confirm:
       - Modality jira-native: `bun run jira:sync-issues get <TICKET_KEY> --include-comments` -> <PBI_FOLDER>/acceptance-test-plan.md
       - Modality jira-xray: `bun run jira:sync-issues get <ATP_KEY>` -> .context/PBI/test-plans/ATP-<ATP_KEY>-<slug>.md (the Test Plan issue; its description holds the ATP body)
         Filename note: the acronym prefix comes from a conforming ladder title; a Plan or Execution whose title does not follow the grammar keeps the legacy TESTPLAN- / TESTEXEC- / RETESTEXEC- prefix.
  7. Update <SESSION_DIR>/test-session-memory.md sections: TMS Artifacts, Test Data, Stage Results > Planning, Checklist > Planning.

Report format:
  {
    "atp_path": "<PBI_FOLDER>/acceptance-test-plan.md (jira-native) | .context/PBI/test-plans/ATP-<ATP_KEY>-<slug>.md (jira-xray)",
    "atp_id": "<TMS issue key | story-field>",
    "ats_id": "<TMS issue key | null (jira-native without Test Set work type)>",
    "atr_id": "<TMS issue key | story-field>",
    "atr_environment": "<active_env value set on the Execution — MANDATORY in jira-xray>",
    "atc_drafts": [{ "title": "...", "type": "Positive|Negative|Boundary|Edge", "priority": "P0|P1|P2" }],
    "risk_distribution": { "P0": <int>, "P1": <int>, "P2": <int> },
    "veto_outcome": "proceed | skip | require | escalate",
    "ac_gaps": [...],
    "open_questions": [...],
    "checklist": "X/Y"
  }

Rules:
  - Do NOT execute any test (Stage 2 owns execution).
  - TC timing is modality-aware (SKILL.md §"TC creation timing"): Modality jira-native → outlines only, NO `Test` work items (Stage 4 / test-documentation owns that); Modality jira-xray → create the sprint Test issues + the ATS per the Set-first order (persistent regression promotion still belongs to Stage 4).
  - NEVER create the ATR without its Test Environment (`active_env`) — an environment-less Execution fails the Stage-1 DoD gate.
  - Critical Rule #2 (Plan Before Coding): outputs are plans + outlines, no test code.
  - Surface open_questions to the orchestrator instead of guessing AC behavior.
  - Source order: Jira field (or `## Acceptance Test Plan (ATP)` fallback comment) is canonical; <PBI_FOLDER>/acceptance-test-plan.md is a read-only cache emitted by bun run jira:sync-issues — never hand-written.
```

### Briefing 3 — Stage 2 Execution subagent

```
Goal: Run smoke pass + triforce exploration (UI / API / DB) for <TICKET_KEY> against the <ENV> environment; capture evidence; surface any BUG_FOUND.

Context docs:
  - <PBI_FOLDER>/acceptance-test-plan.md (the ATP from Stage 1 — Jira-synced cache; Modality jira-xray: .context/PBI/test-plans/ATP-<ATP_KEY>-<slug>.md)
  - <SESSION_DIR>/test-session-memory.md (READ FIRST — shared memory)
  - <PBI_FOLDER>/context.md
  - <<REPO_ROOT>>/.agents/skills/sprint-testing/references/exploration-patterns.md
  - <<REPO_ROOT>>/.agents/project.yaml (active env URLs and MCP names)
  - <<REPO_ROOT>>/.context/business/business-data-map.md (entity flows for DB exploration)

Skills to load: /playwright-cli (UI exploration); the active environment's API and DB MCPs ({{API_MCP}} and {{DB_MCP}} from project.yaml). For Bug tickets in Modality jira-xray: also /xray-cli (repro-Test creation at fix-verification time, step 7) + /acli (the Bug↔Test link).

Exact instructions:
  1. Mark the ticket as actively testing (substrate-driven, idempotent, non-blocking). Resolve `{{jira.transition.<work_type>.start_testing}}` and `{{jira.status.<work_type>.in_test}}` from `.agents/jira-workflows.json` (per AGENTS.md §"Project Variables"). Call `[ISSUE_TRACKER_TOOL] Get Transitions` for `<TICKET_KEY>`. Skip (and emit `skipped_reason`) if any of these hold:
       - current status already equals `{{jira.status.<work_type>.in_test}}` -> `"already_in_test"`
       - the substrate slug is undefined for `<work_type>` (e.g. Bug work types without an intermediate in-testing state) -> `"no_in_test_state_for_<work_type>"`
       - the resolved transition id is not available from the current status -> `"transition_not_available_from_<current_status>"`
     Otherwise execute `[ISSUE_TRACKER_TOOL] Transition Issue` with the resolved transition id and append `{ when: "pre-smoke", from, to, transition_id }` to `Stage Results > Execution > Transition Trail` in `test-session-memory.md`. Never abort Stage 2 on this step — surface the skip reason in the report and proceed.
  1a. **Self-assign QA ownership** when the Story is taken into testing (per `agentic-qa-core/references/defect-management-doctrine.md` Part 2): set `{{jira.qa_assignee}}` to the AUTHENTICATED session user (self-assign — same identity that becomes `reporter`). **Never-overwrite** — read the current value first (from the synced `.md` or a GET); write only if empty, or on an explicit, justified handover. `qa_assignee` is the QA owner, DISTINCT from the native dev `assignee` (do NOT touch `assignee`). Customfield write mechanics (REST `PUT`, read-before-write) → doctrine Part 6 + `/acli`. Non-blocking — surface a skip reason in the report and proceed if it cannot be set.
  2. Configure evidence: set .playwright/cli.config.json `outputDir` to <PBI_FOLDER>/evidence/. Screenshots also need full path in --filename (outputDir does NOT apply to .png).
  3. Smoke (5-10 min, ALWAYS FIRST): validate the happy path of every P0 ATC. If smoke fails, emit smoke_result=fail and STOP — do NOT proceed to deep exploration.
  4. Triforce UI: explore edge cases, empty states, validation errors per exploration-patterns.md §1.
  5. Triforce API: hit the relevant endpoints with valid + invalid + boundary payloads via the API MCP per exploration-patterns.md §2.
  6. Triforce DB: verify state changes via the DB MCP for write-side ATCs per exploration-patterns.md §3.
  7. Bug branch: replace steps 4-6 with reproduce-original -> verify-fix -> (Modality jira-xray) create the repro `Test` NOW, at fix-verification time — ONE by default, 1:N only if the scope genuinely covers distinct conditions — link it Bug↔Test via the `test` slug, add it to the retest Execution and record its run PASSED/FAILED -> regression-pass on adjacent areas -> DB cross-validation if data-integrity bug (per session-entry-points.md §"Bug workflow Phase 2").
  8. Capture evidence (screenshots, traces, response samples) under <PBI_FOLDER>/evidence/ using the naming rule from exploration-patterns.md.
  9. For each defect found: build a BUG_FOUND entry with severity, repro steps, evidence paths, and classify it `blocking` vs `non-blocking` per the "Finding triage" table in exploration-patterns.md. A FAIL is not auto-Critical — assign severity per reporting-templates.md §1.4. Graduated handling: a **blocking** finding (smoke/env down, data integrity, security-exploitable) STOPS the pass — emit it and stop. A **non-blocking** finding is logged and you CONTINUE the pass to completion; report all non-blocking findings together (do not stop the pass for them).
  10. Update <SESSION_DIR>/test-session-memory.md sections: Stage Results > Execution, Bugs Found, Observations, Checklist > Execution.

Report format:
  {
    "start_test_transition": { "executed": true|false, "from": "<status>", "to": "<status>", "transition_id": "<id|null>", "skipped_reason": null|"<reason>" },
    "smoke_result": "pass | fail | partial",
    "triforce": {
      "ui": [{ "atc": "...", "result": "PASSED|FAILED", "evidence": [...] }],
      "api": [{ "endpoint": "...", "result": "PASSED|FAILED", "evidence": [...] }],
      "db": [{ "query": "...", "result": "PASSED|FAILED", "evidence": [...] }]
    },
    "tc_results": { "passed": <int>, "failed": <int>, "total": <int> },
    "pass_completed": true|false,
    "bugs_found": [{ "summary": "...", "severity": "Critical|High|Medium|Low", "blocking": true|false, "evidence_paths": [...], "repro_steps": "..." }],
    "blockers": [...],
    "checklist": "X/Y"
  }

Rules:
  - Do NOT file the bug in the issue tracker yet — Stage 3 handles filing per the bug-report template in reporting-templates.md.
  - Do NOT modify production data; for write-side checks use staging entities flagged in the ATP.
  - Critical Rule #1 (Login Credentials): credentials always from .env; never hardcode.
  - A blocking finding (env down, auth failure, infra issue, data corruption, security-exploitable) STOPS the pass — surface to orchestrator, do NOT auto-retry. A non-blocking finding does NOT stop the pass — log it, finish the remaining TCs, and report it at the end (set pass_completed=true).
```

### Briefing 4 — Stage 3 Reporting subagent

```
Goal: Fill the ATR, post the QA comment, transition the issue, and file bug reports for <TICKET_KEY>.

Context docs:
  - <PBI_FOLDER>/acceptance-test-plan.md (ATP — Jira-synced cache; Modality jira-xray: .context/PBI/test-plans/ATP-<ATP_KEY>-<slug>.md)
  - <SESSION_DIR>/test-session-memory.md (READ FIRST — shared memory; contains Stage 2 results)
  - <PBI_FOLDER>/evidence/ (Stage 2 evidence)
  - <PBI_FOLDER>/context.md (ticket summary)
  - <<REPO_ROOT>>/.agents/skills/sprint-testing/references/reporting-templates.md
  - <<REPO_ROOT>>/.agents/jira-fields.json (custom field IDs for ATR/ATP — Modality jira-native only)

Skills to load: /acli (issue updates + comments + transitions + bug creation); in Modality jira-xray also /xray-cli (only when ATR is an Xray Test Execution and Test Run statuses must be updated).

Exact instructions:
  1. Compile TC summary from test-session-memory.md (total, PASSED, FAILED, pass rate).
  2. Author the ATR body from the template in reporting-templates.md §"ATR Test Report body" (do NOT hand-write a local file — it is materialized from the sync in step 3a).
  3. Update the ATR in TMS:
       - Modality jira-xray: [TMS_TOOL] Update Test Execution / Run statuses; mark ATR complete.
       - Modality jira-native: [ISSUE_TRACKER_TOOL] Update Issue with {{jira.acceptance_test_results}} field (or `## Acceptance Test Results (ATR)` fallback comment when the field is absent).
  3a. Materialize the local cache per modality (read-only cache; never hand-write it), then read it back to confirm:
        - Modality jira-native: `bun run jira:sync-issues get <TICKET_KEY> --include-comments` -> <PBI_FOLDER>/acceptance-test-results.md
        - Modality jira-xray: `bun run jira:sync-issues get <ATR_KEY>` -> .context/PBI/test-executions/ATR-<ATR_KEY>-<slug>.md (the Test Execution issue; its description holds the ATR body)
  4. Post QA comment on <TICKET_KEY> via [ISSUE_TRACKER_TOOL] Add Comment using the matching template from reporting-templates.md (Story PASSED/FAILED, or Bug Template C/D).
  5. Transition <TICKET_KEY> via [ISSUE_TRACKER_TOOL] Transition Issue. Resolve from substrate:
       - **Story PASSED** -> `{{jira.transition.story.qa_sign_off}}` (`in_test` -> `qa_approved`).
       - **Bug PASSED** -> `{{jira.transition.bug.retest_passed}}` (`ready_for_qa` -> `closed`).
       - **Story FAILED — recalibration gate first.** When the failing TC is security/auth/framework-default class, run the §5.0 recalibration gate (`reporting-templates.md`) BEFORE transitioning: state the mitigation hypothesis, cite one verification fact, and surface to the user. If the finding is recalibrated to a non-defect (hypothesis confirmed + fact cited + user OK) -> treat as **GO-with-debt**: set `result = "PASSED WITH ISSUES"`, take the **Story PASSED** transition (`qa_sign_off`, `in_test` -> `qa_approved`), do NOT fire `defect_reported`, and record the gate outcome in the ATR (file a low-priority follow-up if it is genuine pre-prod debt, not a blocker). Only when the defect is confirmed real, continue to the formal-vs-non-strict branch below.
       - **Story FAILED (confirmed defect)** -> formal-vs-non-strict branch driven by `{{FORMAL_BLOCKED_GATE}}` from `.agents/project.yaml`:
           - If `qa.formal_blocked_gate == true` AND `{{jira.status.story.blocked}}` resolves AND `{{jira.transition.story.defect_reported}}` is available from current status -> execute `defect_reported` (`in_test` -> `blocked`). The bug filed in step 6 belongs to the dev who picks it up via `{{jira.transition.story.fix_defect}}` (`blocked` -> `in_progress`).
           - Otherwise (flag is false, or substrate lacks `blocked` / `defect_reported`) -> non-strict fallback: leave the story in `{{jira.status.story.in_test}}` with the linked bug and emit `transition_skipped: "non_strict_failed_left_in_test"`. The dev fixes the underlying bug; QA re-tests once redeployed.
       - **Bug FAILED** -> non-strict fallback: leave the bug in `{{jira.status.bug.ready_for_qa}}` with the QA comment surfacing the failure. If the bug is already `{{jira.status.bug.closed}}` (regression caught after sign-off), use `{{jira.transition.bug.back}}` (`closed` -> `ready_for_qa`) or `{{jira.transition.bug.re_open}}` (any -> `open`) per project policy.
     Append the executed transition (or skip reason) to `Stage Results > Reporting > Transition Trail` in `test-session-memory.md`. Never close the ticket yourself; never bypass the substrate slug.
  6. For each BUG_FOUND from Stage 2, file the quality report per `agentic-qa-core/references/defect-management-doctrine.md` (and reporting-templates.md §1):
       a. **CLASSIFY the issue type** — **Bug** (feature already live above Staging, end-user visible) vs **Defect** (feature still pre-release / Staging or below — the normal sprint-testing case) vs **Improvement** (not a broken AC) — by the FEATURE's lifecycle stage, NOT where it was found (Part 1). The create call uses this type; do NOT hardcode `--type Bug`.
       b. [ISSUE_TRACKER_TOOL] Create Issue --type <Bug|Defect|Improvement> with the summary format `<EPIC>: <COMPONENT>: <ISSUE_SUMMARY>` from reporting-templates.md §1.2; populate description, repro steps, evidence links, and the §1.10 field set.
       c. **Components** (native, MANDATORY) = the affected product module/Epic, must pre-exist in the Jira Components module (Part 3).
       d. **Priority** = auto-derived from Severity (critica→Highest … trivial→Lowest), written to native `priority`; override with a one-line justification (Part 5.1).
       e. **QA Assignee** = self (the authenticated session user); NEVER overwrite an existing owner (read-before-write). Distinct from the native dev `assignee` (Part 2).
       f. **Parent** the issue to the **QA Defect Management** process epic (`qa.qa_epics.defect_epic`, found-or-created — NEVER the Story and NEVER a product/dev epic), and KEEP the **source-Story link** for traceability (Story `causes` the issue via `{{jira.link_types.problem_incident.name}}`, per reporting-templates.md §1.13). Three axes: parent = QA epic · link = Story · components = product module (Part 4).
     Create-time customfields + native `components` go via acli `workitem create --from-json`; customfield/component edits on an existing issue go via REST `PUT` — mechanics in doctrine Part 6 + `/acli`.
  7. Update <SESSION_DIR>/test-session-memory.md sections: TMS Artifacts (final IDs), Stage Results > Reporting, Checklist > Reporting.

Report format:
  {
    "atr_path": "<PBI_FOLDER>/acceptance-test-results.md (jira-native) | .context/PBI/test-executions/ATR-<ATR_KEY>-<slug>.md (jira-xray)",
    "atr_id": "<TMS issue key | story-field>",
    "result": "PASSED | FAILED | PASSED WITH ISSUES",
    "tc_summary": { "total": <int>, "passed": <int>, "failed": <int>, "pass_rate": "<percent>" },
    "recalibration": { "applied": true|false, "hypothesis": "...", "verification_fact": "...", "outcome": "confirmed_defect | go_with_debt", "user_confirmed": true|false },
    "qa_comment_id": "<comment id or 'posted'>",
    "transition": "<from_status> -> <to_status>",
    "bugs_filed": [{ "key": "<TMS_KEY>", "summary": "..." }],
    "evidence_paths_for_user": [...],
    "errors": [...],
    "checklist": "X/Y"
  }

Rules:
  - Do NOT edit ACs on the parent ticket (read-only on AC fields).
  - Do NOT close the ticket — only transition to the QA-defined state.
  - Apply the bug summary format from reporting-templates.md §1.2 verbatim (no improvisation).
  - On 4xx/5xx from any [ISSUE_TRACKER_TOOL] / [TMS_TOOL] call: stop, report partial state, do NOT auto-retry the transition.
  - Critical Rule #3 (No AI Attribution): the QA comment must look human-authored.
  - All TMS content in English (Critical Rule from AGENTS.md §"Language").
```

### Shared sub-agent shell (legacy — kept for memory bookkeeping)

The four briefings above replace the previous narrative shell. The memory-update + checklist-tick contract that every subagent must honor is summarized below — each briefing's "Exact instructions" already references it explicitly.

```
MEMORY UPDATE: before finishing, update the relevant section of test-session-memory.md
  (Stage Results > {Stage}; TMS Artifacts; Test Data; Bugs Found; Observations).

EXIT CHECKLIST: in memory.md > Checklist > {Stage}, mark [x] every completed item.
  Leave [ ] + explanation in Observations for any uncompleted item.

IMPORTANT: credentials always from .env. Never hardcode. Never ask the user for
  confirmation — the orchestrator handles user interaction.
```

---

## test-session-memory.md template

Created at `<SESSION_DIR>/test-session-memory.md` — i.e. `.session/sprint-testing/<TICKET_KEY>/test-session-memory.md`, or `.session/sprint-testing/sprint-<N>/<TICKET_KEY>/test-session-memory.md` in sprint-wide mode. Issue altitude only — the sprint scope has no `test-session-memory.md`, because nothing is shared across sub-agents at that altitude. Hand-authored (NON-Jira) shared memory across sub-agents; gitignored with the rest of `.session/`.

```markdown
# Test Session Memory: {{PROJECT_KEY}}-{number}

> Shared memory across sub-agents. Each stage updates its section.
> Last updated: {YYYY-MM-DD HH:MM} by Session Start

## Ticket
- ID / Title / Type / Priority / Dev / Project / Platform / Sprint / Status

## Story Explanation
{2-3 paragraphs written for the QA lead to read + confirm before proceeding}

## Acceptance Criteria
{Numbered list from the ticket}

## Team Discussion
{Key points from ticket comments — chronological; skip bot / social noise}

## Environment
- Web: {{WEB_URL}} | API: {{API_URL}}
- WEB_URL_OVERRIDE: {none | ad-hoc URL}   # session-only; when set, beats {{WEB_URL}} for every stage; NEVER written to .agents/project.yaml
- API_URL_OVERRIDE: {none | ad-hoc URL}   # session-only; when set, beats {{API_URL}} for every stage; NEVER persisted
- DB MCP: {{DB_MCP}} | API MCP: {{API_MCP}}

## Test Data
{Entities / IDs / owners from DB exploration}

## Repositories
- Backend: {{BACKEND_REPO}} ({{BACKEND_STACK}}, entry {{BACKEND_ENTRY}})
- Frontend: {{FRONTEND_REPO}} ({{FRONTEND_STACK}}, entry {{FRONTEND_ENTRY}})

## Code Locations
### Backend ({{BACKEND_REPO}})
### Frontend ({{FRONTEND_REPO}})
### Database ({{DB_TYPE}})

## TMS Artifacts
| Type | ID | Name | Status |
|------|----|------|--------|
| ATP  | -  | -    | -      |
| ATS  | -  | -    | -      |
| ATR  | -  | -    | -      | <!-- record the Test Environment (active_env) set at creation -->
| TC   | -  | -    | -      |
| STP  | -  | -    | -      | <!-- sprint-level, shared across tickets (Session Start §0.7) -->

## Paths
- PBI: .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-{{PROJECT_KEY}}-{number}-{brief-title}/
- Module Context: .context/PBI/epics/EPIC-<KEY>-<slug>/module-context.md

## Stage Results
### Session Start
### Planning
### Execution
{Stage 2 subagent fills this with smoke / triforce / bug findings. MUST include a `#### Transition Trail` sub-block recording every status change driven by this stage (typically one row: the pre-smoke `start_testing` transition):}

#### Transition Trail
| When | From | To | Transition ID | Notes |
|------|------|----|---------------|-------|
| Pre-smoke | {{jira.status.<work_type>.ready_for_qa}} | {{jira.status.<work_type>.in_test}} | <id> | start_testing |

### Reporting
{Stage 3 subagent fills this with the closing-transition outcome. Pick the row that matches the verdict; only one applies per session:}

#### Transition Trail
| Scenario | From | To | Transition ID | Notes |
|----------|------|----|---------------|-------|
| Story PASSED | {{jira.status.story.in_test}} | {{jira.status.story.qa_approved}} | <id> | qa_sign_off |
| Story FAILED → recalibrated (GO-with-debt, §5.0) | {{jira.status.story.in_test}} | {{jira.status.story.qa_approved}} | <id> | qa_sign_off; result PASSED WITH ISSUES, gate outcome in ATR |
| Story FAILED (formal, `{{FORMAL_BLOCKED_GATE}}=true`) | {{jira.status.story.in_test}} | {{jira.status.story.blocked}} | <id> | defect_reported |
| Story FAILED (non-strict) | — | — | — | transition_skipped: non_strict_failed_left_in_test |
| Bug PASSED | {{jira.status.bug.ready_for_qa}} | {{jira.status.bug.closed}} | <id> | retest_passed |
| Bug FAILED | — | — | — | left in ready_for_qa with FAILED comment (or back / re_open if previously closed) |

## Bugs Found
{append when found}

## Observations
{non-blocking findings}

## Checklist

### Session Start
- [ ] Ticket + comments fetched
- [ ] Project context loaded
- [ ] Module context loaded or created
- [ ] Code explored (backend + frontend as applicable)
- [ ] Test data candidates identified
- [ ] PBI folder + context.md · session dir + test-session-memory.md created
- [ ] Story Explanation written
- [ ] Playwright config set (if UI test)

### Planning (Feature)
- [ ] Triage completed (veto or risk score)
- [ ] Test data discovered via DB
- [ ] ATP item find-or-created FROM the {{jira.acceptance_test_plan}} field (xray) / field written (native); ATP linked to ATR
- [ ] [xray] ATS created/updated with ALL the Story's TCs; ATS→Story linked via the `test` slug (coverage link); components inherited
- [ ] [xray] ATP + ATR test lists derived FROM the ATS membership (no independent id lists)
- [ ] [xray] ATR created WITH the Test Environment (active_env) — no environment, no ATR
- [ ] Test Analysis filled in ATP
- [ ] AC Gaps written (or confirmed: none)
- [ ] TCs created with full traceability
- [ ] Traceability verified ([TMS_TOOL] trace)
- [ ] ATP marked complete; TCs transitioned to Ready
- [ ] acceptance-test-plan.md materialized via bun run jira:sync-issues in PBI

### Planning (Bug)
- [ ] Veto check completed
- [ ] Bug Analysis written in ATP
- [ ] ATP + ATR created and linked (retest Execution WITH Test Environment from active_env)
- [ ] [xray] ONE repro Test planned by default (1:N only if the scope genuinely covers distinct conditions — test-design-doctrine); created at fix-verification time (Stage 2)
- [ ] Test data discovered
- [ ] ATP marked complete

### Execution
- [ ] Ticket transitioned to in-test (or skipped per substrate)
- [ ] Smoke test passed (Go/No-Go)
- [Feature] All TCs executed; none NOT RUN
- [Feature] TCs marked PASSED or FAILED in [TMS_TOOL]
- [Feature] Edge cases explored beyond TCs
- [Bug] Fix verified against original bug ACs
- [Bug] Regression check on adjacent areas
- [ ] DB cross-validation performed (if applicable)
- [ ] Evidence screenshots saved
- [ ] Bugs documented (if found)

### Reporting
- [ ] ATR report filled and marked complete
- [ ] acceptance-test-results.md materialized via bun run jira:sync-issues in PBI
- [ ] QA comment posted
- [ ] Ticket transitioned to the work-type terminal QA state via substrate (or skipped on FAILED)
```

---

## STEP 4 — Post-issue actions (orchestrator-owned)

After Sub-agent 4 finishes:

1. Read the final `test-session-memory.md`.
2. Verify the Checklist (STEP 5 below). Nothing below runs until it passes.
3. **Append ONE entry to the sprint `progress.md`** (`.session/sprint-testing/sprint-{N}/progress.md`) in the §7 block shape — `## Phase {n} — {KEY} {title} — {ts}`, `status`, `dispatched_as: Sequential`, `subagent_report` (verdict + TC pass rate + bug keys), `artifacts_touched` (ATP / ATS / ATR / bug keys), `next`, `notes`. Append-only: never rewrite an earlier entry.
3b. **Mirror it as ONE comment on the sprint STP** (`STP: Sprint#{N}: {objective}` — the Test Plan item find-or-created at Session Start §0.7), same content. Comments are append-only on both sides, which is what lets several testers close issues concurrently without clobbering each other. Do NOT rewrite the STP description here — that mirrors `plan.md` and belongs to the sprint's single planner. Skip with a note when the Test Plan work type is absent (no sprint-altitude field fallback); non-blocking.
3c. **Update the queue row** in `plan.md` `## Phase breakdown`: `PENDING` -> `PASSED` / `FAILED` / `BLOCKED` / `DEFERRED` / `SKIPPED` in its Exit-condition cell. This is the ONE in-place edit the plan takes during a sprint; anything larger (a new issue, a promoted wave, a changed owner) goes under `## Changelog` instead.
3d. **Archive the issue sub-scope** per `agentic-qa-core/references/session-management.md` §8: move `.session/sprint-testing/sprint-{N}/{KEY}/` to `.session/.archive/{YYYY-MM-DD}-sprint-testing-sprint-{N}-{KEY}/`. A FAILED issue is NOT archived — the artifacts are needed to debug it. The sprint pair itself stays put until sprint close.
4. Present a per-issue summary:

   ```
   ISSUE: {{PROJECT_KEY}}-{XXX} -- {title}
   TYPE: {type} | PRIORITY: {priority} | RESULT: {PASSED/FAILED}
   ARTIFACTS: ATP-{N}, ATR-{N}, TCs: {list}
   BUGS: {count or none} | AC GAPS: {count or none}
   OBSERVATIONS: {if any}

   Remaining queue:
   {list remaining PENDING issues with priority}

   Ready for the next issue? (waiting for OK)
   ```
5. WAIT for user OK before the next issue.

---

## STEP 5 — Final verification (orchestrator)

Inspect `test-session-memory.md > Checklist`.

1. Count `[x]` vs `[ ]` across all stages, filtering by issue type (Feature or Bug).
2. All applicable `[x]`: proceed to STEP 4's log + STP + queue updates.
3. Any applicable `[ ]` still:
   - Check Observations for the reason.
   - Valid reason (e.g. "N/A — no UI changes"): proceed.
   - Missing / unclear: inform the user and ask before marking done.
4. Orchestrator-only items:
   - [ ] Story explained and confirmation received
   - [ ] Sprint `progress.md` entry appended + mirrored as one STP comment
   - [ ] Queue row moved off `PENDING`
   - [ ] Final summary presented to user

---

## STEP 6 — Interrupted session recovery

If `test-session-memory.md` already exists for the next ticket:

1. Read it to determine the last completed stage.
2. Inform the user: "Found interrupted session for `{{PROJECT_KEY}}-{XXX}`. Last completed: {stage}. Resuming from {next stage}."
3. Skip completed stages; dispatch the next sub-agent in sequence.
4. The sub-agent reads the existing memory and continues from there.
5. Sprint altitude: the sprint `progress.md` gets its entry only when Stage 3 finally closes the issue — a resumed issue produces ONE sprint-level entry, not one per resume.

Same procedure when `continue-from` is given.

---

## STEP 7 — Session summary (before wrapping up)

When the user indicates they are done (or wrapping up), present:

```markdown
## Sprint {N} -- Session Summary ({date})

| # | Issue | Type | Priority | Title | Result | Board Status | Dev | TCs | AC Gaps | Bugs | Artifacts |
|---|--------|------|----------|-------|--------|--------------|-----|-----|---------|------|-----------|
| 1 | {{PROJECT_KEY}}-{X} | {type} | {priority} | {title} | {PASSED/FAILED/SKIPPED} | {board status} | {dev} | {X/Y (rate%)} | {count or None} | {count or None} | ATP-{N}, ATR-{N}, TCs {list} |
```

**Column definitions**: Type (Bug / Product Roadmap / Feature / Task); Priority (Critical / High / Medium / Not as Important); Result (PASSED / FAILED / SKIPPED + reason); Board Status (current on `{{ISSUE_TRACKER}}`); Dev (implementer); TCs (pass/total + rate; for bugs "DB verified" or "N/A"); AC Gaps (None if all verified); Bugs (None if clean); Artifacts (IDs).

After the table:

```
Session stats: {X} issues tested, {Y} TCs executed, {Z}% pass rate
Remaining queue: {list remaining PENDING issues with priority}
```

The table is a CHAT rendering derived from the sprint `progress.md` — do not persist a second copy of it anywhere on disk.

**Sprint close (last issue of the sprint done, no PENDING left):**

1. Find-or-create the sprint recap Execution `STR: Sprint#{N}: Regression Testing` — a **Test Execution**, parent **QA Test Artifacts**, ALWAYS with the Test Environment from `active_env` — IF `/regression-testing` has not already created it (whichever arrives first creates it; the other completes it). Fill it as the recap of the sprint's results.
2. Close the sprint STP (`STP: Sprint#{N}: {objective}`): final description update from `plan.md` (read-first) + transition to its terminal state.
3. **Archive the sprint session pair** per `agentic-qa-core/references/session-management.md` §8: move `.session/sprint-testing/sprint-{N}/` to `.session/.archive/{YYYY-MM-DD}-sprint-testing-sprint-{N}/`, then call `mem_session_summary` with the archive path. Moving the parent moves whatever sub-scope is still inside it, so verify the queue holds no PENDING and no in-flight issue first. Leave the pair in place if any issue failed.
4. Steps 1 and 2 skip with a note when the respective work type is absent (jira-native without Test Plan / Test Execution work types); non-blocking.

---

## Error protocol recap

| Signal | Action |
|--------|--------|
| Sub-agent returns `Status: BLOCKED` | Do NOT advance. Show reason, wait for user. |
| Sub-agent reports TOOL FAILURE (MCP / `[AUTOMATION_TOOL]` / `[TMS_TOOL]` / `[ISSUE_TRACKER_TOOL]`) | Stop, surface error, wait for user instructions. |
| Sub-agent reports a **blocking** BUG_FOUND (smoke/env down, data integrity, security-exploitable) | Pause, present bug, wait for user decision. |
| Sub-agent reports a **non-blocking** finding | Do NOT pause — the subagent finished the pass; surface the finding at Stage 2 close and continue. |
| Sprint `plan.md` missing / malformed | Offer to build it via Part 1. Never fabricate a queue from memory. |
| Sprint `plan.md` and `progress.md` disagree on an issue's status | `progress.md` wins (append-only audit); fix the queue row and say so. |
| STP comment log and a Story's ATR disagree | The **ATR** wins — it is the artifact of record. Append a correcting comment; never edit the posted one. |
| `continue-from` issue not in the queue | List the queued issues, ask user to confirm. |

Never proceed silently past an error.
