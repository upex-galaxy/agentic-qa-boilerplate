# Session Entry Points: Session Start, User-Story and Bug Workflows

> **Subagent context**: this file is part of the "Context docs" briefing component for the Session Start subagent (see `sprint-testing/SKILL.md` §Subagent Dispatch Strategy and `sprint-orchestration.md` §"Briefing 1 — Session Start subagent").

Load this reference whenever you enter sprint-testing in any mode. Session Start runs first in every mode. The User-Story and Bug sections describe what happens after it in single-issue mode. Sprint-wide mode wraps the same stages in the orchestration loop from `sprint-orchestration.md`.

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
   (ATP+ATS+ATR Set-first;      (veto / risk score, ATP + ATR;
    outlines native / Xray       xray: ONE repro Test at fix-
    Tests; regression TCs        verification; native: no TCs
    persisted in Stage 4)        in-sprint; regression Test
                                 reused/created in Stage 4 if worthy)
   Stage 2 Execution           Phase 2 Execution
   (smoke + UI/API/DB)         (reproduce -> verify fix -> regression)
   Stage 3 Reporting           Phase 3 Reporting
   (ATR + QA comment)          (ATR + QA verification comment)
```

After the final stage, hand off to Stage 4 (`test-documentation`), Stage 5 (`test-automation`), or Stage 6 (`regression-testing`) as applicable. Those stages are out of scope for this skill.

---

## Session Start: the universal entry

Act as a Senior QA Engineer preparing a testing session for a ticket (User Story or Bug).

### Input

- `TICKET-ID` (required), e.g. `{{PROJECT_KEY}}-123`.
- Environment: defaults to `{{DEFAULT_ENV}}`; ask if ambiguous. For an ad-hoc URL not in `project.yaml` (broken staging, ephemeral preview deploy, hotfix branch URL), record it as a session override instead of editing config: see Step 6b and the `WEB_URL_OVERRIDE` / `API_URL_OVERRIDE` slot.

### Step 0 — Environment + inbox preflight (reachability gate)

Run this before fetching the ticket and before any ATP or Jira write, once the active environment (or its session override) is resolved. It is a cheap probe that prevents the costliest waste in a run: authoring an ATP against an environment that turns out to be unreachable.

1. Reachability probe. Issue a generic HTTP request to the active `{{WEB_URL}}` and `{{API_URL}}` root (HEAD or GET, e.g. `curl -sI {{WEB_URL}}`). A 2xx or 3xx (including a login redirect) is reachable. A 404, 410 or 5xx on root, a connection refusal, or a dead-deployment page (`DEPLOYMENT_NOT_FOUND` and similar) means the environment is not testable.
2. Inbox receive-check (conditional). Only when the ticket depends on email, a magic link or an auth token: confirm the configured mailbox or provider can receive mail, not just send it. A send-only provider cannot complete a magic-link flow.
3. Verdict. Reachable (and, if relevant, the inbox receives) means continue to Step 1. Unreachable, or inbox send-only: stop, surface it to the user and author no ATP. Offer a session env override (Step 6b) if the user has a working alternate URL.

The gate answers "is the environment up, can we get the email?". It does not replace the Stage 2 smoke test, which answers "does the feature work?". Both run.

### Step 0b — Sprint Test Plan (STP) find-or-create (orchestrator-inline, sprint-wide mode only, first ticket of the sprint)

**Mode gate:** this step runs only in `sprint-wide` mode. In `single-issue` mode skip it entirely: that mode creates no sprint session pair and no STP (`SKILL.md` §scope table). Resolve the ticket's sprint number N from its Sprint field: `bun run jira:sync-issues get <KEY>`, then read the sprint value in the generated `.md`. For a whole-sprint pull use `--sprint <active|current|closed|>=N|7,8,10>` (or the `JIRA_SYNC_SPRINTS` env default), which resolves N once for the whole sprint. A ticket with no sprint: ask the user, never guess. Then find `STP: Sprint#{N}: {objective}`, a **Test Plan** item parented to the **QA Master Test Plan** epic. Missing: create it (find-or-create; `/regression-testing` creates it as fallback if it runs suites first). Present: update it. The STP is a living sprint planner: add this ticket to its scope and refresh progress after each tested ticket.

The STP's description mirrors the sprint `plan.md` (rewritten wholesale: read-first, one writer). Its comments mirror the sprint `progress.md` (append-only, one comment per issue close, so concurrent testers never clobber each other). Where a comment and a Story's ATR disagree, the ATR wins. The sprint recap Execution `STR: Sprint#{N}: Regression Testing` is created at sprint close, not here (see `sprint-orchestration.md` §STEP 7). Modality jira-native without the Test Plan work type: skip with a note (no sprint-altitude field fallback); non-blocking.

### Step 1 — Fetch the ticket from the issue tracker

> **Prerequisite**: detailed fetch uses `bun run jira:sync-issues`, not `/acli`. Load `/xray-cli` only in Modality jira-xray for the traceability `[TMS_TOOL]` calls. If Session Start §0.1 in `SKILL.md` already loaded it, skip.

```
# Detailed read — materializes per-field .md under the STORY folder (ACs, description, comments):
bun run jira:sync-issues get {TICKET-ID} --include-comments
# then READ the synced story.md / acceptance-criteria.md / comments.md
# NEVER `acli workitem view` for custom fields — it returns null.

# For TMS-native tests list (optional, used in Stage 1 later) — traceability stays on [TMS_TOOL]:
[TMS_TOOL] List Tests:
  - project: {{PROJECT_KEY}}
```

Note from the synced files: Title, Project / Module, Status (must be ready for testing), Sprint, Acceptance Criteria, Dependencies, Comments.

### Step 1b — Team Discussion from ticket comments

The Step 1 response includes the comments. Extract:

- Decisions: agreed behavior, scope changes, AC clarifications.
- Technical notes: implementation details shared by developers.
- Edge cases: scenarios or concerns raised by the team.
- Blockers and warnings: known issues or constraints.

| Rule | Detail |
|------|--------|
| Format | `[Author] (date): key point` per relevant comment |
| Grouping | If 5+ comments, group by theme (decisions / technical / edge cases) |
| Skip | Automated comments (bot messages, status transitions, CI notifications) |
| Skip | Social comments ("thanks!", "looks good", emoji-only) |
| Images | Note as `[image attachment: {filename}]` (not downloadable) |
| >10 threads | Include the 10 most recent substantive comments, note the total count |

This step never blocks:

| Scenario | Action |
|----------|--------|
| Comments exist | Format into the Team Discussion section for `context.md` (Step 7) |
| No comments | Note: "No team discussions found on this ticket." |
| Issue-tracker unavailable | Log a warning, note "Comments not loaded", continue |
| Step 1 failed entirely | Skip Step 1b, continue to Step 2 |

### Step 1c — Deploy check (the deployed environment is truth, the tracker is a hint)

Step 0 proved the environment answers. This step proves it runs the change under test. A status of {{jira.status.story.ready_for_qa}} says someone moved the ticket; it does not say the build on the active environment contains the merge. Testing a build without the change produces failures filed as defects against code that was never deployed, or passes that prove nothing about the ticket. For a Bug the change is the fix, and the same check applies before retesting it.

Gather two values, read-only:

1. The change's merge commit. The PR linked from the ticket: the development panel, a remote link, or a PR URL in the synced `comments.md`. Several PRs: every one of them.
2. The build the active environment runs. Whatever the environment itself reports first (a version or health endpoint, a response header, the build id in the app footer, a testability page when the SUT exposes one); else the deploy record for that environment (the CI deploy job or the hosting platform's deployment, with its commit). Where this project exposes it is in the `infra-context` map (`bun run context:map infra-context`), not in a value copied from another project.

Compare them in the SUT repository: `git merge-base --is-ancestor <merge> <deployed>` in a clone (exit 0 = contained), or `gh api repos/<owner>/<repo>/compare/<merge>...<deployed> --jq .status` (`ahead` or `identical` = contained). Then one verdict:

| Verdict | What happens |
|---|---|
| **CONTAINED** | continue. Record the deployed build id in `test-session-memory.md` §Environment; Stage 3 carries it into the ATR's environment line |
| **NOT CONTAINED** | stop before any ATP or Jira write. Surface it to the user with both ids: the tracker says ready, the environment does not have it. Do not test it and do not file a defect against the feature, because the feature is not there. The ticket is not testable yet |
| **UNVERIFIED** (no build id exposed, or no merge linked) | do not block. Say which value was missing, record `deploy: UNVERIFIED (<what was missing>)` in `test-session-memory.md` §Environment, and include it in Step 2's explanation. Stage 2's smoke test becomes the first evidence: a smoke failure in this state is triaged as "not deployed?" before it is filed as a defect |

A worker in a fleet reports the verdict in its stage report. An unattended routine that selects Stories for testing runs this check on each candidate before opening a worker, because the deployed environment is truth and the tracker is a hint: a NOT CONTAINED candidate is a dropped item with both build ids in the routine's report and gets no worker, and an UNVERIFIED one goes to its worker with the gap named in the brief. Regression triage follows the same rule: its report names the build the run tested.

### Step 2 — Explain the story to the user (required, then wait)

Stop and explain the story to the user in a brief, easy summary:

- What is this feature or bug about?
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

If the team discussion changes or extends the ACs, highlight that explicitly so the user sees context beyond the original ticket.

**MANDATORY:** wait for user confirmation before continuing.

> Sub-agent exception (both modes): a sub-agent does not ask the user. It writes the Story Explanation into `test-session-memory.md` and finishes; the orchestrator shows it to the user.

### Step 3 — Load project context

Read these to understand the system (the maps through their reader, never the raw HTML):

```
bun run context:map business-data-context    # business flows, entities and state machines
bun run context:map business-e2e-context     # user journeys, feature catalog, CRUD matrix, integrations
bun run context:map business-api-context     # auth model, critical journey endpoints, external integrations
.context/PBI/qa-artifacts/master-test-plan.md   # testing guide (what to test and why); cache of the MTP Epic
```

Together they give business flows, journeys and the feature inventory, API contracts and the authentication model, and the test strategy. A command that prints the placeholder notice counts as missing: a file existing is not enough. A missing MTP cache is first refreshed with `bun run context:hydrate` (the plan lives in Jira). If all four are still missing, stop and hand off to the `project-discovery` skill (or invoke the individual `project-context` modes `data` / `e2e` / `api` + `test-plan`). Sprint-testing cannot plan without them.

### Step 4 — Module context (3-level hierarchy)

The hierarchy is: Project (system-wide), Epic/Module (a feature area like Orders or Dashboard; module = Epic, 1:1), Story (the individual ticket).

Derive `<EPIC_KEY>` from the ticket's parent epic and `<EPIC_SLUG>` from the epic/module field, in kebab-case (e.g. "Checkout Improvements" becomes `checkout`). The module folder is `epics/EPIC-<EPIC_KEY>-<EPIC_SLUG>/`.

**Jira owns the module context.** It lives in the Epic `description` under a `## Module Context (QA)` heading, and `bun run jira:sync-issues` splits that section out into `module-context.md`. There is no dedicated custom field on purpose: `description` exists on every Jira instance, so this works on a project that never provisions a single custom field.

Check whether `.context/PBI/epics/EPIC-<EPIC_KEY>-<EPIC_SLUG>/module-context.md` exists after the Step 1 sync:

| Module Context | Action |
|----------------|--------|
| Exists | Read it; skip full code exploration; use the existing knowledge |
| Missing | Do a full exploration, then publish the result to the Epic description and re-sync |

When it is missing, explore the code related to the ticket:

- Backend (`{{BACKEND_REPO}}` with entry `{{BACKEND_ENTRY}}`, stack `{{BACKEND_STACK}}`): controllers, services, models related to the feature.
- Frontend (`{{FRONTEND_REPO}}` with entry `{{FRONTEND_ENTRY}}`, stack `{{FRONTEND_STACK}}`): routes, state, components.

Draft the body from the template at `.context/PBI/templates/module-context-template.md`, filling in the routes discovered, state files found, API endpoints, database tables and key entities for testing. Then publish it:

```
# 1. READ the current Epic description first — this is an APPEND, never an overwrite.
#    The PO owns the text above; QA owns only the '## Module Context (QA)' section.
bun run jira:sync-issues get <EPIC_KEY>          # read the synced epic.md

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: <EPIC_KEY>
  description: |
    <existing description, verbatim>

    ## Module Context (QA)

    <the drafted body>

# 2. Materialize it back as module-context.md
bun run jira:sync-issues get <EPIC_KEY>
```

**A fleet worker does not publish.** In fleet mode (`fleet-conductor.md` §3) the worker keeps the drafted body, or what it learned about an existing one, under a `## Module Learnings (candidate)` heading in its own `test-session-memory.md`, and the conductor publishes it at the issue close (`fleet-conductor.md` §10 "Module learnings"). Several workers replacing one Epic section race, and the last writer erases the others.

If a `## Module Context (QA)` section already exists in the description, replace that section only and leave the rest untouched. Module context is reusable: the next ticket in the same module reads it from Jira and skips exploration, on any machine.

Document story-specific code that is not in the module context at ticket level only.

### Step 5 — Load skills

```
Use skill: playwright-cli     # browser automation for UI testing
Use skill: xray-cli           # TMS operations (if project uses Xray)
```

Skip skills that are not configured for the project.

### Step 6 — Create the PBI structure

```
.context/PBI/                          # ENTIRELY gitignored — a Jira cache (`.agents/instructions/agent-local-context-pbi.md`)
  templates/                           # do not edit (committed)
    module-context-template.md
  epics/
    EPIC-<EPIC_KEY>-<EPIC_SLUG>/       # EPIC / MODULE LEVEL (reusable; module = Epic, 1:1)
      module-context.md                # Jira-synced: the '## Module Context (QA)' section of the Epic description
      feature-test-plan.md             # Jira-synced read-only cache (epic level; if generated)
      test-specs/                      # COMMITTED — automation plans, versioned with the test code
      stories/
        STORY-<TICKET_KEY>-<STORY_SLUG>/   # STORY LEVEL (new)
          context.md                   # hand-authored story-specific context (Step 7, NON-Jira, local-only)
          acceptance-test-plan.md      # ATP, Jira-synced read-only cache (Stage 1)
          acceptance-test-results.md   # ATR, Jira-synced read-only cache (Stage 3)
          test-cases/                  # Jira-synced: the Test issues linked to this Story
          evidence/                    # screenshots, NON-Jira, local-only

.session/sprint-testing/<scope>/       # gitignored session state
  test-session-memory.md               # shared memory across the 4 sub-agent dispatches
```

Folder naming: `<EPIC_SLUG>` is kebab-case from the ticket's epic/module field; `<STORY_SLUG>` is an AI-generated summary of about 5 words, kebab-case.

Create the folders and the hand-authored files (`context.md`, `evidence/`) now, plus `test-session-memory.md` under `.session/sprint-testing/<scope>/`. The Jira-mirrored files (`acceptance-test-plan.md` Stage 1, `acceptance-test-results.md` Stage 3, `module-context.md` and `feature-test-plan.md` if epic-level, `test-cases/`) are materialized by `bun run jira:sync-issues`. Hand-writing them would be overwritten at the next sync.

### Step 6b — Session env override (record once, session-only)

When testing against an ad-hoc URL that is not in `.agents/project.yaml` (a broken staging env, often surfaced by the Step 0 preflight; an ephemeral preview deploy; a hotfix branch URL the user authorizes for this session only), leave `project.yaml` alone. Record the override once in `test-session-memory.md` §Environment:

```
- WEB_URL_OVERRIDE: https://preview-xyz.vercel.app   # session-only; beats {{WEB_URL}}; NEVER persisted
- API_URL_OVERRIDE: https://preview-xyz.vercel.app/api
```

Every stage resolves `{{WEB_URL}}` / `{{API_URL}}` through this slot first (the override wins when set to a value other than `none`), so the URL reaches all four dispatches without re-typing. This differs from `active_env` switching, which selects a named environment already defined in `project.yaml`. The override lives for the session and is never written back to config.

### Step 7 — Write the initial context.md

> `context.md` is a hand-authored non-Jira file: session notes, related code, open questions. ACs live in the synced `acceptance-criteria.md`, the full ticket in `story.md`, and Team Discussion in `comments.md` (all materialized by `bun run jira:sync-issues`). Reference them here; do not copy them.

```markdown
# {{PROJECT_KEY}}-{number}: {Title}
**Ticket:** {{PROJECT_KEY}}-{number} | **Epic/Module:** EPIC-<EPIC_KEY>-<EPIC_SLUG> | **Status:** {status} | **Sprint:** {sprint}

> Jira-sourced detail (read-only caches, not copied here): `story.md`, `acceptance-criteria.md`, `comments.md` — materialized by `bun run jira:sync-issues get <KEY> --include-comments`.

## Team Discussion (analysis only — source is comments.md)
### Key Decisions
- [{Author}] ({date}): {decision}
### Technical Notes
- [{Author}] ({date}): {note}
### Edge Cases Raised
- [{Author}] ({date}): {edge case}
{If no comments: "No team discussions found."}

## Related Code
### Backend / Frontend / Database
- `{path}` — {description}
- Tables: {tables}

## TMS Artifacts
| Artifact | ID | Status |
|----------|----|--------|
| ATP | Pending | Created in Stage 1 (synced acceptance-test-plan.md) |
| ATR | Pending | Created in Stage 3 (synced acceptance-test-results.md) |

## Session Notes
### Session 1 — {date}
Context loaded / Code explored / Environment
```

### Output summary (single-issue mode)

```markdown
## Session Initialized: {{PROJECT_KEY}}-{number}
- Ticket / Module / ACs count / Team Discussions count
- Project context loaded
- Module context: loaded or created
- Story context.md created
- Next step: US workflow section below OR Bug workflow section below
```

### Error table

| Situation | Action |
|-----------|--------|
| Ticket not found | Verify ID, check the issue tracker |
| Env unreachable (404/410/5xx on root, dead deployment) | Stop at Step 0, surface to user, author no ATP; offer a session env override (Step 6b) |
| Inbox send-only (email/auth story) | Stop at Step 0, surface to user; a magic-link flow cannot complete without a receiving inbox |
| Ticket not ready for testing, or Step 1c verdict NOT CONTAINED | Wait for deployment; surface both build ids to the user |
| No ACs defined | Request ACs before testing |
| No test data found | Expand query, ask user for alternatives |
| Code not found | Search with alternative terms |
| No comments on ticket | Continue, note in `context.md` |
| >10 comments | Summarize the 10 most recent, note earlier omitted |
| Project context files missing | Stop and hand off to `project-discovery` |

### Behaviour reminders

1. Explain the story before proceeding, and wait for the user's confirmation (a sub-agent, in either mode, writes the explanation to `test-session-memory.md` instead).
2. All documentation and TMS content in English.
3. Load module context, or create and publish it when missing (Step 4).
4. Persist everything into the PBI folder.
5. Credentials come from `.env`, never hardcoded.

---

## With nobody at the keyboard

Several steps above and below wait for a person: the Step 2 confirmation, the Step 0 and Step 1c stops, the Step 0b sprint-number question, the Step 1.4 triage confirmation, the missing-context hand-off, and the status-slug fallback question. Who holds each gate depends on who runs the session. The general rule is `agentic-qa-core/references/decision-protocol.md`.

| Run | Who holds the gate |
|-----|--------------------|
| A person is present | The person, as written in each step |
| A supervised worker (fleet) | The conductor or launcher: the worker writes the question or verdict into `test-session-memory.md` and its stage report, then waits for the answer |
| A routine with nobody | The delegating brief, when it covers the decision (for example a triage outcome it pre-authorised). Without one, do the reversible work (reads, local files, the session memory), stop before any outward or irreversible action (Jira writes, transitions, comments, pushes, messages), and report what is pending |

---

## User-Story workflow (single-issue mode)

After Session Start, run Stages 1, 2 and 3 for the story. Then hand off to Stage 4 / 5 / 6.

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
- [ ] Feature deployed to the active env (`{{WEB_URL}}` / `{{API_URL}}`): Step 1c verdict CONTAINED, or UNVERIFIED and stated.
- [ ] Project context files loaded.

### Stage 1: Planning (overview)

Prompts / references:

- `references/acceptance-test-planning.md`: ATP body, Test Analysis, TC nomenclature, traceability.
- `references/feature-test-planning.md`: higher-granularity feature plan (optional).

> **Prerequisite**: load `/acli` before any `[ISSUE_TRACKER_TOOL]` write. Detailed reads use `bun run jira:sync-issues`, not `/acli`. In Modality jira-xray also load `/xray-cli` for `[TMS_TOOL]` calls. If Session Start §0.1 already loaded them, skip.

Actions:

1. Read the story (ACs, business rules, dependencies) from the synced `.md` (materialized by `bun run jira:sync-issues get <KEY> --include-comments`).
2. Triage (veto or risk score). Outputs: Full Plan, Quick Plan or Skip.
3. Discover test data via `[DB_TOOL]` on `{{DB_MCP}}` (and/or `[API_TOOL]`).
4. Create the TCs per SKILL.md §"TC creation timing" (jira-xray: sprint `Test` issues at executable detail; jira-native: outlines only, no `Test` work items).
5. ATS (jira-xray): create or update the Story's `ATS: {US_ID}: {story title}` (parent **QA Test Artifacts**, components inherited from the Story, which is mandatory) holding all the Story's TCs (Xray-internal membership plus one `TC→ATS` link per TC, `agentic-qa-core/references/traceability-linking.md` §9). Link **ATS→Story** via the `test` slug: this is the coverage link (it fills the coverage panel).
6. ATP item from the field (find-or-create): find or create the Test Plan item `ATP: {STORY-KEY}: {story title}` from the Story's `{{jira.acceptance_test_plan}}` field content. Pre-sprint the ATP lives only in the field (shift-left is field-first); author fresh (item and field) when the field is empty. Modality jira-native: write `{{jira.acceptance_test_plan}}` / fallback comment instead. Set-first: the ATS comes first, the ATP item second (SKILL.md §"Stage 1 Set-first order").
7. ATR with environment: create the ATR Execution (`ATR: {STORY-KEY}: Story Testing`) always carrying the Test Environment from `active_env`. No ATR exists without an environment (hard gate). Derive the ATP's and the ATR's test lists from the ATS membership, never three independent id lists. Link ATP→Story and ATR→Story (administrative traceability; zero coverage). Link ATP -> ATR.
8. Fill Test Analysis in the ATP (scope, risks, scenarios, variables, test data, AC gaps).
9. Verify with the **three-edge check** (`agentic-qa-core/references/traceability-linking.md` §Traceability verification: Link List on Story + ATP + ATR, or `bun xray trace {{PROJECT_KEY}}-{number}`). Traceability reads stay on `[ISSUE_TRACKER_TOOL]` / `[TMS_TOOL]`, not the sync.
10. Statuses + ownership (`agentic-qa-core/references/artifact-lifecycle.md` §1 + §2). Assignee = self on the ATP, the ATS, the ATR and every `Test`, set at create time (Xray refuses membership edits on a Plan the caller does not own). Then:
     - each `Test`: `{{jira.transition.test_case.start_design}}` -> `{{jira.transition.test_case.ready_to_run}}` = `{{jira.status.test_case.ready}}`, parented to the **QA Test Repository** epic.
     - ATP: `{{jira.transition.test_plan.designed}}` -> `{{jira.status.test_plan.ready}}`. Not `complete`: the ATP is completed at Stage 3, once the ATR results are in.
     - ATS stays `{{jira.status.test_set.designing}}` and ATR stays `{{jira.status.test_execution.active}}`: both close at Stage 3. State it; do not "fix" it.
     On an unmapped slug run the §4 fallback (list live transitions, ask ONE `AskUserQuestion`, take the live id, recommend `bun run jira:sync-workflows`); never skip silently.
11. Materialize the read-only cache (never hand-written) per modality: jira-native -> `bun run jira:sync-issues get <KEY> --include-comments` -> `acceptance-test-plan.md` in the STORY folder; jira-xray -> `bun run jira:sync-issues get <ATP_KEY>` -> `.context/PBI/test-plans/ATP-<ATP_KEY>-<slug>.md`. Filename note: the acronym prefix comes from a conforming ladder title; a Plan or Execution whose title does not follow the grammar keeps the legacy `TESTPLAN-` / `TESTEXEC-` / `RETESTEXEC-` prefix.

Output checkpoint:

```markdown
## Stage 1 Complete
- [ ] ATP created with N scenarios
- [ ] TC nomenclature `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]` applied
- [ ] Variables + test data identified
- [ ] Traceability verified
- [ ] Ready for execution testing
```

### Stage 2: Execution (overview)

Reference: `references/exploration-patterns.md`.

Actions:

0. Mark the ticket as actively testing (substrate-driven, idempotent, non-blocking): resolve `{{jira.transition.<work_type>.start_testing}}` and `{{jira.status.<work_type>.in_test}}` from `.agents/jira-workflows.json`, and transition `<TICKET_KEY>` to the in-test state if it is not already there. Skip cleanly when the substrate has no in-test state for the work type. Detail in `sprint-orchestration.md` Briefing 3 Step 1.
1. Smoke test (5-10 min, always first): verify basic functionality works with no blocking errors. Go (proceed) or No-Go (stop and report).
2. Deep exploration as applicable:
   - UI on `{{WEB_URL}}` via `[AUTOMATION_TOOL]`.
   - API on `{{API_URL}}` via `[API_TOOL]`.
   - DB cross-validation via `[DB_TOOL]` on `{{DB_MCP}}`.
3. Use TCs as guides but explore beyond them (edge cases, boundaries, data variations, user perspectives). Create new TCs for significant discoveries.
4. Update TC statuses in the TMS: PASSED / FAILED only when observed in the precondition's environment, else NOT RUN with its ladder reason.
5. File any bugs per `references/reporting-templates.md` (Bug Report template).
6. Decision: PASSED (incl. recorded deferrals) goes to Stage 3. BLOCKED runs the blocking ladder (recreate, then QA defers with a follow-up task, then developers, then the owner if unsure; `agentic-qa-core/references/discovery-driven-doctrine.md` §5), never an open-ended wait. FAILED is triaged first (a FAIL is not auto-Critical). A **blocking** failure (smoke/env down, data integrity, security-exploitable) stops the pass and is surfaced now; a **non-blocking** finding is logged, the TC marked FAILED, and the pass continues, with the finding surfaced at Stage 2 close. See `exploration-patterns.md` "Finding triage".

Output checkpoint:

```markdown
## Stage 2 Complete
- [ ] Smoke: PASSED / FAILED
- [ ] Deep exploration: PASSED / FAILED / NOT RUN (BLOCKED or DEFERRED (execution), reason recorded)
- [ ] Bugs created: N (or none)
- [ ] Recommendation: APPROVE / REJECT / LADDER (a case still BLOCKED: name the ladder step it is on, never an open-ended wait)
```

### Stage 3: Reporting (overview)

Reference: `references/reporting-templates.md`.

> **Prerequisite**: load `/acli` before any `[ISSUE_TRACKER_TOOL]` call (QA comment, transition, bug filing). In Modality jira-xray also load `/xray-cli` for `[TMS_TOOL]` ATR update / Run update. Modality jira-native: `/acli` covers both tags. Skip if Session Start §0.1 already loaded them.

Actions:

1. Compile the TC summary (total, PASSED, FAILED, pass rate).
2. Fill the ATR Test Report via `[TMS_TOOL] atr update {ATR-ID} --report "..."` (or write `{{jira.acceptance_test_results}}` / fallback comment in Modality jira-native). Mark the ATR complete.
3. Materialize the read-only cache (never hand-written) per modality: jira-native -> `bun run jira:sync-issues get <KEY> --include-comments` -> `acceptance-test-results.md` in the STORY folder; jira-xray -> `bun run jira:sync-issues get <ATR_KEY>` -> `.context/PBI/test-executions/ATR-<ATR_KEY>-<slug>.md`.
4. Post the QA comment to the ticket via `[ISSUE_TRACKER_TOOL]`, using the user-story templates (PASSED / FAILED) from `reporting-templates.md`.
5. Transition the ticket via substrate. Decision tree: Story PASSED (every case PASSED, or `DEFERRED (execution)` listed in the QA comment for the signer) -> `{{jira.transition.story.qa_sign_off}}`; Bug PASSED -> `{{jira.transition.bug.retest_passed}}`; Story FAILED with `{{FORMAL_BLOCKED_GATE}}=true` -> `{{jira.transition.story.defect_reported}}` (`in_test` -> `blocked`); Story FAILED non-strict (flag false or no `blocked` slug) -> leave in `{{jira.status.story.in_test}}` with the linked bug; Bug FAILED -> leave in `{{jira.status.bug.ready_for_qa}}` (or `back` / `re_open` if previously closed). `sprint-orchestration.md` Briefing 4 Step 5 has the full decision tree.
6. Give the user the evidence screenshot paths to attach.

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
    +--> ATS (ATS: {US_ID}: {story title})        <- `test` slug: THE coverage link (fills the panel)
    |        holds ALL the Story's TCs (a TC->ATS `test` link per TC, both modalities; + Xray membership in xray)
    |
    +--> ATP (ATP: {STORY-KEY}: {story title})    <- administrative link (zero coverage)
    |        test list DERIVED from the ATS
    +--> ATR (ATR: {STORY-KEY}: Story Testing)    <- administrative link; ALWAYS carries the
             test list DERIVED from the ATS          Test Environment (active_env)
```

All artifacts are created in Stage 1 with complete links, and the ATS membership is the single source of the Plan and Execution test lists. Direct TC→Story links are a last resort, for instances with no Test Set work type.

### Error table (US workflow)

| Situation | Action |
|-----------|--------|
| US not ready | Verify status, wait for "{{jira.status.story.ready_for_qa}}" |
| Staging down | Check deployment, escalate to DevOps |
| Blocking bug found (smoke/env down, data integrity, security-exploitable) | Stop exploration, surface, wait for fix |
| Non-blocking finding (cosmetic, minor validation, edge-case on non-critical TC) | Log it, mark TC FAILED, continue the pass; surface at Stage 2 close |
| Flaky behaviour | Retry with fresh data; document and move on |

---

## Bug workflow (single-issue mode)

After Session Start, run Phase 1, Phase 2 and Phase 3. Bugs use the same PBI folder structure as user stories. TC handling depends on the modality: **Modality jira-xray** creates ONE repro `Test` by default at fix-verification time (Phase 2); **Modality jira-native** creates no TCs in-sprint, because the bug ticket itself is the implicit test case (it defers to Stage 4).

### When to use this workflow

| Work Type | Use this workflow? |
|-----------|-------------------|
| Bug | Yes |
| Feature / Task / Tech Debt | No: use the user-story workflow above |

| Ticket Status | Use this workflow? |
|---------------|-------------------|
| Fix deployed to the active env (Step 1c verdict CONTAINED, or UNVERIFIED and stated) | Yes, ready to retest |
| In Progress / Dev Complete (not yet {{jira.status.story.ready_for_qa}}) | No: wait for deployment |
| Already tested | No: already verified |

### Phase 1: Triage + Planning

#### Step 1.1 — Triage

Goal: decide Full Retesting, Code-Review-only or Skip. Philosophy: test where it matters and skip where testing adds no value. Fetch Title, Status, Work Type, Person Hours, Description, Priority, Module.

#### Step 1.2 — Veto table (bypasses risk score)

**VETO: SKIP retesting** (recommend Code Review only):

| Condition | Indicators |
|-----------|------------|
| Pure text / label fix | typo, label, text, copy, spelling, tooltip + hardcoded in frontend |
| Pure visual / CSS | color, style, spacing, font, alignment, responsive, UI polish |
| Documentation | README, docs, comments, swagger, help text |
| Config / infrastructure | config, env, pipeline, deployment, CI/CD |
| Tech debt cleanup | refactor, cleanup, rename + no functional change |

How to verify "Pure text": if the text comes from the API or DB it is not pure text (it needs retesting); text hardcoded in the frontend is pure text (skip).

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

The score reads the ticket text, and the fix can reach further than the text says. Before settling on LOW, or when a MEDIUM sits near the line, call the Skill tool with "blast-radius" on the fix's diff or PR. Raise the score only for a reach the table missed (a shared helper, a wire format, a second reader of the same column) and say so in the triage result. Not installed: read the diff and the callers of what it changes inline, and say you did it inline.

#### Step 1.4 — Present triage result and WAIT

Present the decision with sections for VETO SKIP, VETO REQUIRE, or SCORE-BASED. Include bug summary, reproduction steps, decision, rationale, environment, recommendation. **MANDATORY:** wait for user confirmation. The user may ask questions, request more context, or override. Under "With nobody at the keyboard" a supervised worker reports the decision to its conductor, and a routine proceeds only when its brief covers the triage outcome.

#### Code Review workflow (low-risk path)

> **Prerequisite**: load `/acli` before the final `[ISSUE_TRACKER_TOOL]` post in step 4. Skip if Session Start §0.1 already loaded it.

If triage is Code Review, skip Phases 2 and 3:

1. Search for the fix in code: `grep` for the fixed value and for residual old values.
2. Verify the fix is correct: it addresses the reported issue, leaves no residual buggy code, and no similar issue sits nearby.
3. Prepare the QA Code Review comment:

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
4. Post via `[ISSUE_TRACKER_TOOL]`. This ends the Code Review workflow.

#### Step 1.5 — Create ATP + ATR (repro Test modality-aware)

For bugs that need Full Retesting:

- ATP: `ATP: {BUG_KEY}: {summary}` (Test Plan item, find-or-create)
- ATR: the retest Execution `ReTest: {BUG_KEY}: {summary}`, always created with the Test Environment from `active_env` (no ATR without environment: hard gate, `agentic-qa-core/references/stage-gates.md` §Stage 1)
- Link ATP to ATR

**Repro Test (Modality jira-xray, in-sprint)**: plan ONE repro `Test` by default. Use 1:N only when the bug's scope genuinely covers distinct conditions, and justify it per `agentic-qa-core/references/test-design-doctrine.md`. It is created at fix-verification time (Phase 2), linked **Bug↔Test** via the `test` slug (`{{jira.link_types.test}}`, Bug `is tested by` Test; bugs are coverable), executed in the retest Execution, and its run recorded PASSED/FAILED (Phase 3).

**Modality jira-native, unchanged**: no TCs in-sprint. The bug ticket is the implicit immediate retest case. Reproduction steps are the test steps; Expected vs Actual are the pass/fail criteria. **Regression follow-up (golden rule, both modalities)**: if the bug is regression-worthy, Stage 4 (`test-documentation` bug-driven decision) ensures a persistent Test covers it: reuse the existing failed Test (or the in-sprint repro Test) or create one. Not every bug qualifies (a one-time typo in a stable area is treated like a failed test).

#### Step 1.6 — Discover test data

Use `[DB_TOOL]` on `{{DB_MCP}}` or `[API_TOOL]` to find the test data needed to reproduce and verify the bug. Document the entities, IDs, owners and the user role needed.

#### Step 1.7 — Fill Bug Analysis in the ATP

Bug Analysis is your execution guide. Write it before touching the browser:

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

When the reproduction steps are missing or the bug reproduces only some of the time, call the Skill tool with "diagnosing-bugs" to pin down the triggering condition (not to fix it, and with no instrumentation of product code). Not installed: narrow the repro inline (smallest data, one variable at a time) and say so. A bug still without a repro goes back to the reporter.

#### Step 1.8 — Load Playwright CLI skill

```
Use skill: playwright-cli
```

#### Step 1.9 — Verify traceability

Confirm ATP -> ticket, ATR -> ticket and ATP -> ATR are all linked. Missing-TCs "gaps" are expected at this point: the repro Test (Modality jira-xray) only arrives at fix-verification time in Phase 2, and in Modality jira-native the bug stays the implicit TC.

### Phase 2: Execution

The detailed smoke / evidence-config / regression-check playbook lives in `references/exploration-patterns.md`. Bug-specific flow:

1. Configure evidence: do not repoint the shared `.playwright/cli.config.json` `outputDir` (`agentic-qa-core/references/evidence-conventions.md` §1 Bucket A + §5). Pass the full destination path in `--filename` on every capture, resolving to `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-{{PROJECT_KEY}}-{number}-{brief-title}/evidence`. `outputDir` does not apply to `.png` screenshots anyway, so the full path is required regardless. Open a named session for the ticket (`-s=<KEY>`) and `state-load` the role the repro needs (`agentic-qa-core/references/browser-sessions.md` §4).
2. Verify the fix: navigate to the affected area, reproduce the original scenario, observe the bug is gone, verify the expected behaviour, and screenshot the correct behaviour. Evidence naming: `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-{{PROJECT_KEY}}-{number}-{brief-title}/evidence/{{PROJECT_KEY}}-{number}-{brief-description}.png`.
2b. Create the repro Test (Modality jira-xray only), now at fix-verification time, per Step 1.5: ONE `Test` covering the repro scenario by default (1:N only if the scope genuinely covers distinct conditions, citing the test-design-doctrine justification), linked Bug↔Test via the `test` slug, added to the retest Execution. Modality jira-native: skip (defers to Stage 4).
3. Quick regression check: adjacent features still work, similar scenarios still work, edge cases (empty / null / max) are still handled. If a regression is found, document it and file a new bug.

### Phase 3: Reporting

Templates (ATR body, QA comment Template C PASSED / Template D FAILED, evidence-attachment rules) live in `references/reporting-templates.md`. Bug-specific flow:

1. Automation opportunity assessment: rate 0-2 each for Reproducibility, Stability, Risk, Frequency, Complexity. Totals: 8-10 HIGH / 5-7 MEDIUM / 0-4 LOW. Record the suggested test type (E2E / API / DB) and effort (Low / Medium / High). The `test-documentation` skill uses this for the formal ROI decision.
2. Update ATR: if none exists, create the retest Execution `ReTest: {BUG_KEY}: {summary}` (always with the Test Environment from `active_env`, and `assignee` = self, `agentic-qa-core/references/artifact-lifecycle.md` §2). Fill it with the ticket, environment, result (PASSED/FAILED), step-by-step verification, regression check and automation assessment. **Modality jira-xray**: record the repro Test's run in the retest Execution as PASSED/FAILED, then close it: `[ISSUE_TRACKER_TOOL] Transition: {{jira.transition.re_test_execution.complete}}` (`active` -> `close`). "Mark complete" is that transition: a retest Execution left at `{{jira.status.re_test_execution.active}}` reads as a verification still running. Unmapped slug: `artifact-lifecycle.md` §4 fallback (ask, never skip).
3. Ticket status + comment: PASSED adds the verification summary via Template C and transitions via `{{jira.transition.bug.retest_passed}}` (`ready_for_qa` -> `closed`). FAILED adds the failure details via Template D, leaves the bug in `{{jira.status.bug.ready_for_qa}}` and tags the developer; if the bug was already `{{jira.status.bug.closed}}` (regression caught after sign-off), use `{{jira.transition.bug.back}}` (`closed` -> `ready_for_qa`) or `{{jira.transition.bug.re_open}}` (any -> `open`) per project policy. Prepare the comment before transitioning, every time.
4. Evidence paths for the user: after posting, tell them the 1-2 most important screenshot paths to attach (the bug-showing-fix for PASSED; before/after for regressions; skip navigation screenshots).
5. Update local PBI `context.md`: Type Bug, Status VERIFIED/FAILED, Verified date, Bug Summary (Was/Now), Verification Result + evidence path, Automation Assessment (Candidate/Priority/Reason), Notes.
6. Report to user with a `Bug Verification Complete` block: bug, dev, result, verification summary table, evidence path, automation assessment, TMS artifacts (ATR id), next steps (ready for prod / add to automation backlog / return to dev).

### Bug workflow quality checklist

- [ ] Reproduction steps were clear (a bug with none goes back to the reporter before testing)
- [ ] Test data discovered and documented
- [ ] ATP filled with Bug Analysis (execution guide)
- [ ] Bug fix verified working
- [ ] Regression check completed
- [ ] Evidence captured (screenshot)
- [ ] Automation opportunity assessed
- [ ] ATR documented with results
- [ ] Ticket status updated
- [ ] Local PBI updated

Two habits keep a bug pass small. Plan ONE repro Test in jira-xray at fix-verification time (none in jira-native, where the bug is the immediate test case), and fill Bug Analysis and test-data discovery before touching the browser, so a retest reuses the data.

### Bug vs User Story: quick comparison

| Aspect | Bug | User Story |
|--------|-----|------------|
| Has ACs? | No, has Expected vs Actual | Yes, multiple ACs |
| Test planning | ATP with Bug Analysis | ATP with Test Analysis |
| Test cases | xray: ONE repro Test at fix-verification (1:N only if scope justifies); native: none in-sprint (bug = test case) | 1:N per AC by technique (see test-design-doctrine) |
| Documentation | ATP (Bug Analysis) + ATR | ATP + ATR + TCs (full) |
| Automation | High priority if recurring | Based on business value (Stage 4 ROI) |

Bugs are opportunities for automation. Every verified bug fix is a potential regression test, so flag it for `test-documentation`.
