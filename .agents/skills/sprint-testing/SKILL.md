---
name: sprint-testing
description: "Runs in-sprint manual QA per issue: plan, execute and report. Use when testing a user story; retesting a bug fix; smoke-testing or exploring a ticket's feature; working the sprint QA backlog or resuming a ticket. Not for ticket-free exploration (exploratory-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [testing-e2e, testing-api, issue-tracker]
metadata:
  kind: workflow
  requires_capabilities: [db, api-schema]
  stage_owner: true
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the binding doctrine below and in references/.
compact_rules: |
  - AC-pass is the floor, not the goal. Coverage is AC-conformance plus risk beyond the ACs (boundaries, errors, states, anomalies), so never report "% of ACs verified" as completeness. (Canon: `agentic-qa-core/references/test-design-doctrine.md`.)
  - 1:N is the default: explode every non-trivial AC into several cases (EP partitions, boundaries, states, contexts). Collapsing an AC to one case needs a written "trivially atomic" justification.
  - Apply techniques by trigger: EP always; BVA wherever a range / limit / length / date-window exists; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction); Error-Guessing charters for experience-based risk.
  - A criterion is a business assertion; a test case is a concrete exploration of it. Run the Test-Design Checklist before finalizing the ATP.
  - Classify before filing; do not default to "Bug". A Bug is a feature already live above Staging (end-user visible). A Defect is a feature still pre-release (Staging or below), the normal output of sprint testing. An Improvement is not a broken AC (an enhancement, or an under-specified or absent AC surfaced by a test-beyond-AC). Classification follows the feature's lifecycle stage, not where the problem was found. (Canon: `agentic-qa-core/references/defect-management-doctrine.md` Part 1.)
  - `qa_assignee` (`{{jira.qa_assignee}}`) records the QA who followed the Story: Shift-Left fills it and it stays for the Story's whole life. Set it (authenticated session user) at `start_testing` only when still empty, and on every filed Bug / Defect / Improvement. Read before write and never overwrite an existing owner. The native `assignee` follows the dev model (it moves to the QA at Ready For QA) and the harness never restores a previous owner (Part 2).
  - `components` (native, mandatory) is the affected product module or Epic and must already exist in the Jira Components module (Part 3).
  - Three axes: the parent is the QA Defect Management process epic (`qa.qa_epics.defect_epic`, found-or-created; never a product or dev epic, never the Story); the issue link is the source Story (traceability); components is the product module (Part 4).
  - `priority` (native) is derived from `{{jira.severity}}` (critica = Highest, mayor = High, moderada = Medium, menor = Low, trivial = Lowest); override with a one-line justification (Part 5.1).
  - Mode comes from `$ARGUMENTS`: a first token naming a mode (`single-issue`, `sprint-wide`) is the mode and the rest is forwarded. Otherwise ask the mode question; never infer it.
  - Three stages, always in order: Stage 1 Planning, Stage 2 Execution, Stage 3 Reporting. Stages 4, 5 and 6 go to `test-documentation`, `test-automation` and `regression-testing`.
  - QTU (optional audit aid): when Stage 3 approves a Story (`qa_sign_off` to `{{jira.status.story.qa_approved}}`), write `{{jira.quality_token_usage}}` if the harness shows the tokens (K = input plus output, cache reads reported separately) or a human enters them. Empty is a valid, stated N/A and never fails a verifier; when the field is absent, use a structured Jira comment. The value is cumulative: when the Story returns to QA (retest, `back_from_qa_approved`, fix loops), read the current value first, add this cycle's measured delta, never overwrite, and post one comment `QTU cycle N: +x K (total y K) source=<harness|human>`; an empty current value gets just this cycle's delta. Never estimate or invent a number.
  - Jira is the source of truth. Read tickets with `bun run jira:sync-issues get <KEY> --include-comments`, then the synced `.md`. Never use `acli workitem view` for custom fields (it returns `null`).
  - Bugs run the veto, triage and risk-score decision tree before any ATP is written.
  - Stage 1's Shift-Left short-circuit is fail-closed: the `shift-left-reviewed` and dated labels alone run the full flow. Phases 1-3 are skipped only on cited evidence: a pre-sprint ATP body in the synced `acceptance-test-plan.md` (or its `## Acceptance Test Plan (ATP)` fallback comment), a dated label under 30 days old, and refined ACs that still match the Story. Stage 1 writes neither those labels nor that field before the check (`references/acceptance-test-planning.md` §0.0).
  - Execution is a smoke pass first, then trifuerza (UI/API/DB) exploration; capture evidence under the PBI folder.
  - A TC is PASSED or FAILED only when observed in the environment its precondition names; a unit test, green CI, a code read or another environment leaves it NOT RUN. NOT RUN runs the blocking ladder (recreate, then QA defers with a follow-up task, then developers, then the owner if unsure) and is never recorded FAILED. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.
  - API testing is a three-tool maneuver: the OpenAPI MCP for the schema (read-only), `bun run api:login` for the token (written to `.auth/tokens.env`), and **curl** for authenticated requests. Never execute through the OpenAPI MCP. Canon: `agentic-qa-core/references/api-testing-doctrine.md`.
  - Every role signs in through the app's own login only (UI form to `.auth/<env>-<role>.json`, or `bun run api:login --role <role>`). Never obtain a session through a service-role or admin key, an admin user-management API, a server-generated magic link or reset token, a locally signed JWT or a database session row; seeding test DATA through API or DB stays allowed. An auth story runs end to end through a real inbox (`/resend-cli`); `production` uses dedicated synthetic QA accounts only. A check that seems to need a shortcut is a blocker to report. Canon: `agentic-qa-core/references/browser-sessions.md` §4.
  - Consult `business-domain-context` (`bun run context:map business-domain-context`) before authoring the ATP, refined ACs and TC outlines.
  - On any subagent failure: stop, report the partial state, offer retry / skip-stage / abort. No auto-fix, no auto-rollback. A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.
  - Stage 1 Set-first order (Modality jira-xray, authoritative): the Story's coverage backbone is its **ATS** (`ATS: {US_ID}: {story title}`, mandatory per Story even with one TC; parent: QA Test Artifacts epic; components inherited from the Story). Create the sprint `Test` issues, put all of them in the ATS, and link ATS to Story via the `test` slug (Story `is tested by` ATS): the primary coverage-bearing edge, which fills the Xray coverage panel. A direct TC to Story link is the only other one (last resort, only when no ATS can exist). Story-to-ATP and Story-to-ATR links are administrative and carry zero coverage.
  - The ATP item is find-or-created from the `{{jira.acceptance_test_plan}}` field (pre-sprint the ATP lives only there; Stage 1 is where the Test Plan item is born, parent: QA Master Test Plan epic). The ATP's and the ATR Execution's test lists are derived from the ATS membership, never kept as independent id lists (three hand-kept lists drift and corrupt coverage).
  - ATR always with environment (hard gate): create the ATR or retest Execution carrying the Test Environment resolved from `active_env` in `.agents/project.yaml` (or the session env switch). An Execution without environment fails the Stage-1 DoD gate (`agentic-qa-core/references/stage-gates.md`).
  - TC in ATS membership is always a TC to ATS `test` issue link, in both modalities; jira-xray also writes the Xray-internal membership (GraphQL), never instead (`agentic-qa-core/references/traceability-linking.md` §9). TC in ATP and TC in ATR stay Xray-internal. Link TCs directly to the Story only as a last resort, for instances with no Test Set work type.
  - Bug retest (Modality jira-xray): one repro `Test` by default, created at fix-verification time (Stage 2), linked Bug to Test via the `test` slug and executed in the retest Execution (`ReTest: {BUG_KEY}: {summary}`); 1:N only with a written test-design justification. Modality jira-native: no in-sprint TCs (the bug is the immediate retest case); persistent-Test decisions defer to Stage 4.
  - STP find-or-create fires on the sprint's first ticket: `STP: Sprint#{N}: {objective}` (Test Plan item, parent: QA Master Test Plan; a living planner, so append each tested ticket and keep progress current). The sprint recap Execution `STR: Sprint#{N}: Regression Testing` (parent: QA Test Artifacts) is created at sprint close and links to both the STP and the RTP (dual `testPlan` membership). RTRs recorded during the sprint (`RTR: {scope-id}: Regression Testing`, one per regression verdict) belong to `/regression-testing`.
  - Two modes, asked at Session Start and never inferred: `sprint-wide` (the whole sprint's QA backlog) or `single-issue` (one issue from it). Only `sprint-wide` creates or updates the STP and the sprint session pair; `single-issue` creates neither.
  - Scope (single-issue or sprint-wide) is one axis; executors (1 or N) is the other. One executor is the default and unchanged in every detail. N>1 ("fleet mode") is sprint-wide only and fires when the user answers the executors question with N (`orchestration.max_workers` in `.agents/project.yaml` is a round cap, never a switch). The orchestration gate decides only who opens the sessions (pass: Orca launches and supervises; fail: the human pastes the same launch lines), never what an issue's pipeline does. Canon: `sprint-testing/references/fleet-conductor.md`.
  - Fleet mode invariants: the launch file is always written (without the gate the human pastes its N lines), and when the gate fails the orchestration tool is never named to the user. A worker is single-issue mode, detected from the prompt token `fleet worker` plus its brief (env vars are an optional extra signal on the human-paste path only). A worker has no checkpoints, cannot skip its preflight MCP probes, makes zero sprint-altitude writes, never writes its Epic's `## Module Context (QA)` section (it stages `## Module Learnings (candidate)` in its `test-session-memory.md`; the conductor publishes once per module), and runs to `worker_done` without returning to its prompt. **Rounds** (concurrency groups) are not **waves** (Jira-status buckets).
  - `sprint-wide` is a real session scope, not a folder: `.session/sprint-testing/sprint-<N>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §6/§7, holding one nested `<JIRA-KEY>/` sub-scope per issue. `plan.md` is the local STP (queue, waves, assignment); `progress.md` is the append-only sprint log, one entry per issue close. There is no local sprint tracker file; anything the team needs lives in the STP in Jira.
  - Sprint scope is a JQL query, never a hardcoded issue-type list: take the work types declared `coverable: true` in `.agents/jira-required.yaml`, resolve each one's `jira_issue_type` (`A | B | C` is an ordered list of alternatives, the first the instance has wins), and intersect with `.agents/jira-workflows.json`. A declared type the instance lacks is skipped with a note, never a blocker.
  - STP maintenance parity (concurrent testers): `plan.md` mirrors the STP issue description, which is rewritten wholesale, so one writer (whoever plans the sprint) and read first before writing. `progress.md` mirrors the STP issue comments, append-only on both sides, one comment per issue close, so two testers never clobber each other. Where the comment log and a Story's ATR disagree, the ATR wins: it is the artifact of record.
---

## Forbidden invocations

Never invoke `/sdd-*` skills from this workflow. SDD is an optional ceremony the
user installs; this skill ships self-contained and does not chain into it. To
refactor KATA, fixtures, `cli/`, `scripts/` or the `api/schemas/` pipeline, exit
this skill and invoke `/framework-development`, which runs Plan, Code, Verify,
Archive natively and needs no SDD.

The boundary is mechanical: `scripts/lint-skills.ts` rejects any `/sdd-` mention
outside this section. See `.agents/skills/agentic-qa-core/references/skill-composition-strategy.md`
§4 (it governs users who install SDD by hand).

# Sprint Testing: Plan, Execute, Report per Ticket

This skill drives the manual and exploratory QA loop for tickets during a sprint, in three stages that always run in this order: **Stage 1 Planning, Stage 2 Execution, Stage 3 Reporting**. Stages 4, 5 and 6 belong to other skills, which it hands off to at the end.

The pipeline is the same in every mode; only the entry point and the bookkeeping differ. **Single-issue** takes one issue at a time. **Sprint-wide** takes the whole sprint's QA backlog under a sprint-level session pair. "Issue" means every coverable work type `.agents/jira-required.yaml` declares (`work_types.*.coverable`), not only stories.

---

## Dependencies

Requires `agentic-qa-core`. Two of its references are read before the work they govern:

- `agentic-qa-core/references/test-design-doctrine.md`, before designing any ATP or TC coverage from acceptance criteria (five principles, floor-not-ceiling coverage, 1:N explode-default, formal-technique triggers).
- `agentic-qa-core/references/defect-management-doctrine.md`, before taking a Story into testing and before filing any Bug, Defect or Improvement (classification by feature lifecycle, QA-Assignee self-assign and never-overwrite, mandatory Components, the three-axis model, Severity to Priority).

The other references it ships (`briefing-template.md`, `dispatch-patterns.md`, `orchestration-doctrine.md`, `session-management.md`, `preflight-gate.md`, `adr-doctrine.md`) are read by the sections that cite them.

## Compact Rules

Test-design doctrine (binding; the registry carries the full rules from the frontmatter, the canon is `agentic-qa-core/references/test-design-doctrine.md`):

- AC-pass is the floor, not the goal: coverage is AC-conformance plus risk beyond the ACs, and "% of ACs verified" is never completeness.
- 1:N is the default; collapsing an AC to one case needs a written "trivially atomic" justification.
- Apply techniques by trigger: EP always; BVA for any range, limit, length or date-window; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction); Error-Guessing charters for experience-based risk.
- Run the Test-Design Checklist before finalizing the ATP.

Defect-management doctrine (binding; same arrangement, canon `agentic-qa-core/references/defect-management-doctrine.md`):

- Classify before filing, never default to "Bug": Bug is a feature live above Staging, Defect a feature still pre-release (the normal output of sprint testing), Improvement is not a broken AC. Classification follows the feature's lifecycle stage (Part 1).
- `qa_assignee` (`{{jira.qa_assignee}}`) is set at `start_testing` only when still empty, and on every filed Bug / Defect / Improvement. Read before write and never overwrite an existing owner (Part 2).
- `components` (native, mandatory) must already exist in the Jira Components module (Part 3).
- Parent is the QA Defect Management process epic (`qa.qa_epics.defect_epic`), the issue link is the source Story, components is the product module (Part 4).
- `priority` is derived from `{{jira.severity}}` (critica = Highest, mayor = High, moderada = Medium, menor = Low, trivial = Lowest); override with a one-line justification (Part 5.1).

Sprint-testing operational rules:

- Mode comes from `$ARGUMENTS`: a first token naming a mode (`single-issue`, `sprint-wide`) is the mode and the rest is forwarded. Otherwise ask the mode question; never infer it.
- Three stages, always in order: Stage 1 Planning, Stage 2 Execution, Stage 3 Reporting. Stages 4, 5 and 6 go to `test-documentation`, `test-automation` and `regression-testing`.
- QTU (optional audit aid): when Stage 3 approves a Story (`qa_sign_off` to `{{jira.status.story.qa_approved}}`), write `{{jira.quality_token_usage}}` if the harness shows the tokens (K = input plus output, cache reads reported separately) or a human enters them. Empty is a valid, stated N/A and never fails a verifier; when the field is absent, use a structured Jira comment. The value is cumulative: when the Story returns to QA (retest, `back_from_qa_approved`, fix loops), read the current value first, add this cycle's measured delta, never overwrite, and post one comment `QTU cycle N: +x K (total y K) source=<harness|human>`; an empty current value gets just this cycle's delta. Never estimate or invent a number.
- Jira is the source of truth. Read tickets with `bun run jira:sync-issues get <KEY> --include-comments`, then the synced `.md`. Never use `acli workitem view` for custom fields (it returns `null`).
- Bugs run the veto, triage and risk-score decision tree before any ATP is written.
- Stage 1's Shift-Left short-circuit is fail-closed: the `shift-left-reviewed` and dated labels alone run the full flow. Phases 1-3 are skipped only on cited evidence: a pre-sprint ATP body in the synced `acceptance-test-plan.md` (or its `## Acceptance Test Plan (ATP)` fallback comment), a dated label under 30 days old, and refined ACs that still match the Story. Stage 1 writes neither those labels nor that field before the check (`references/acceptance-test-planning.md` §0.0).
- Execution is a smoke pass first, then trifuerza (UI/API/DB) exploration; capture evidence under the PBI folder.
- A TC is PASSED or FAILED only when observed in the environment its precondition names; a unit test, green CI, a code read or another environment leaves it NOT RUN. NOT RUN runs the blocking ladder (recreate, then QA defers with a follow-up task, then developers, then the owner if unsure) and is never recorded FAILED. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.
- API testing is a three-tool maneuver: the OpenAPI MCP for the schema (read-only), `bun run api:login` for the token (written to `.auth/tokens.env`), and **curl** for authenticated requests. Never execute through the OpenAPI MCP. Canon: `agentic-qa-core/references/api-testing-doctrine.md`.
- Every role signs in through the app's own login only (UI form to `.auth/<env>-<role>.json`, or `bun run api:login --role <role>`). Never obtain a session through a service-role or admin key, an admin user-management API, a server-generated magic link or reset token, a locally signed JWT or a database session row; seeding test DATA through API or DB stays allowed. An auth story runs end to end through a real inbox (`/resend-cli`); `production` uses dedicated synthetic QA accounts only. A check that seems to need a shortcut is a blocker to report. Canon: `agentic-qa-core/references/browser-sessions.md` §4.
- Consult `business-domain-context` (`bun run context:map business-domain-context`) before authoring the ATP, refined ACs and TC outlines.
- On any subagent failure: stop, report the partial state, offer retry / skip-stage / abort. No auto-fix, no auto-rollback.
- Two modes, asked at Session Start and never inferred: `sprint-wide` (the whole sprint's QA backlog) or `single-issue` (one issue from it). Only `sprint-wide` creates the sprint session pair `.session/sprint-testing/sprint-<N>/{plan.md, progress.md}` and the STP; `single-issue` creates neither.
- The sprint scope is a JQL query built from the work types declared `coverable: true` in `.agents/jira-required.yaml`, intersected with what `.agents/jira-workflows.json` says the instance actually has. Never a hardcoded issue-type list.
- Before any step that uses a declared MCP capability (`metadata.requires_capabilities`: `db`, `api-schema`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: resolve by tool-name suffix, and when no available tool provides it, stop and name the capability and how to enable it. Never fall back silently.

**Read full SKILL.md when**: starting a sprint cold, resuming a session, or handling a bug-triage / sprint-wide flow not covered by the rules above.

---

## Inputs: read these first, in this order

The reading order for an AI starting cold on a sprint-testing workflow. Stop early when the ticket is small enough that later inputs add no signal.

1. `.agents/project.yaml`: project identity, env URLs, `{{PROJECT_KEY}}`, MCP names, active environment.
2. `.agents/jira-required.yaml`: the canonical slug catalog (custom fields, statuses, transitions).
3. `.agents/jira-fields.json`: slug to numeric custom-field ID, for `{{jira.<slug>}}` resolution at runtime.
4. `.agents/jira-workflows.json`: the workflow and transition catalog and the authoritative source of every status and transition name. A status that is not in this file does not exist in the instance.
4b. `agentic-qa-core/references/artifact-lifecycle.md`: which status each artifact this skill creates must end in (ATP `ready` then `completed`, ATS `designing` then `close`, ATR `active` then `close`, TCs `draft` then `ready`), assignee-at-create, the unmapped-status fallback (§4) and the light stage verifier that closes each stage (§5). Read it before firing any transition.
5. `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/context.md`: hand-authored ticket-local notes and open questions, read if a prior Session Start created it. It is never a Jira mirror.
6. `.context/PBI/qa-artifacts/master-test-plan.md`: a cache of the `QA Master Test Plan` Epic description (missing: run `bun run context:hydrate`), with the regression Epic pointer and what to test and why.
7. `business-e2e-context` (`bun run context:map business-e2e-context`): the journeys the story sits in and the feature catalog vocabulary. It resolves "what epic owns this story" for the `epics/EPIC-<KEY>-<slug>/` PBI folder name (module = Epic, 1:1). `business-data-context` and `business-api-context` join per touched level (DB, API), read the same way.
8. `business-domain-context` (`bun run context:map business-domain-context`; one term: `--section term-<slug>`): the canonical vocabulary for test names, entity terms and Gherkin wording. When a new or ambiguous term surfaces, flag it in the Stage 3 QA comment and propose the one-section edit through that skill's refresh path (applied only on approval); a testing session never hand-edits the map.
9. The Story or Bug ticket itself (AC, ATP, comments), read with `bun run jira:sync-issues get <KEY> --include-comments`, then the synced `.md` files (`story.md`, `acceptance-criteria.md`, `acceptance-test-plan.md`, `comments.md`) under the STORY folder. Jira is the source of truth and the `.md` is a read-only cache. Never use `acli workitem view` for custom fields (it returns `null`).
10. `.env`: the test-user credentials `config/variables.ts` declares for `<<ACTIVE_ENV>>` (shipped example names: `LOCAL_USER_*` / `STAGING_USER_*`), read at runtime and never hardcoded. Nothing requires them up front: `config.testUser` fails by name when a test reads an empty pair.
11. `kata-manifest.json`: the registry of existing KATA Components and ATCs, checked before proposing new ATCs in the Stage 3 hand-off so test-automation does not duplicate work.

Items 6 to 8 often arrive after `/project-discovery` and may be absent: proceed and put a `missing_input` note in the Stage 1 ATP so a later pass can fill the gap. `kata-manifest.json` only matters at the Stage 3 to `test-automation` hand-off, so pure manual-QA runs skip it.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional. The orchestrator also applies the per-stage **Definition-of-Done gates** in `agentic-qa-core/references/stage-gates.md`: verify a stage's DoD (planning stages include the Test-Design Checklist) BEFORE recording its progress checkpoint and advancing.

The skill runs at two altitudes, and each is a real session scope (`agentic-qa-core/references/session-management.md` §3 and §9, "Nested scopes"):

```
.session/sprint-testing/
├── <JIRA-KEY>/              # single-issue mode
│   ├── plan.md  progress.md  test-session-memory.md
└── sprint-<N>/              # sprint-wide mode
    ├── plan.md              # the local STP: scope, waves, assignment
    ├── progress.md          # append-only sprint log, one entry per issue close
    └── <JIRA-KEY>/          # per-issue sub-scope, identical to single-issue
        └── plan.md  progress.md  test-session-memory.md
```

Single-issue `<scope>` is `<JIRA-KEY>` (for example `UPEX-123`). Sprint-wide has the sprint scope `sprint-<N>` and issue scopes `sprint-<N>/<JIRA-KEY>`. Both `plan.md` files follow the §6 schema and both `progress.md` files the §7 append-only schema; only the meaning of "phase" differs (a stage at issue altitude, one issue in the queue at sprint altitude).

`test-session-memory.md` exists at the issue altitude only. It carries the TMS modality, the issue context and the stage state shared across the four sub-agent dispatches. The three files coexist per issue: `plan.md` indexes the session, `progress.md` decides the next stage, `test-session-memory.md` holds the cross-stage payload.

The skill follows `AGENTS.md` §3 (Orchestration Mode). Every dispatch uses the 7-component briefing in `.agents/skills/agentic-qa-core/references/briefing-template.md`, with the pattern per stage taken from `.agents/skills/agentic-qa-core/references/dispatch-patterns.md`. Both modes use the same four dispatch points per issue (Session Start, Stage 1, Stage 2, Stage 3), and sprint-wide loops them once per issue. The full briefings (Goal / Context docs / Project Standards (auto-resolved) / Skills to load / Exact instructions / Report format / Rules) live in `references/sprint-orchestration.md` §"Sub-agent prompt templates".

| Stage                                              | Pattern    | Subagent role                                                                                                                                                                  |
|----------------------------------------------------|------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Session Start (per-issue)                          | Single     | dispatch a session-start subagent: fetch the issue from the issue tracker, load `.context/`, create the PBI folder + `context.md` and the session dir + `test-session-memory.md`, return issue summary + AC list |
| Stage 1 — Planning (ATP + draft TCs + risk triage) | Sequential | dispatch a Planning subagent: produce the ATP artifact + risk score + draft TC outlines; bug tickets get the veto + triage decision tree applied                                |
| Stage 2 — Execution (smoke + UI/API/DB exploration)| Sequential | dispatch an Execution subagent: smoke pass first, then triforce (UI/API/DB) exploration; capture evidence under the PBI folder; surface BUG_FOUND if applicable                  |
| Stage 3 — Reporting (ATR + QA comment + transition)| Sequential | dispatch a Reporting subagent: fill the ATR, post the QA comment, transition the issue, file bug reports if any                                                                 |
| Fleet fan-out (sprint-wide, N>1 executors ONLY)    | Parallel   | fan out N **worker briefs** — one per issue of the round — as launchable sessions, not as subagents of this turn: seed `<KEY>/brief.md`, write `launch.txt`, launch, wait, process reports. Absent in every N=1 run. Canon: `references/fleet-conductor.md` |

> **Sequential, not parallel.** Each stage feeds the next (Session Start's PBI folder is read by Stage 1, Stage 1's ATP by Stage 2, Stage 2's evidence by Stage 3), and parallelism inside one issue would race on shared PBI state. The Fleet row parallelizes across issues instead: each worker owns one issue end to end and runs the four dispatches sequentially inside it.

> **On any subagent failure**: stop, report the partial state (which stages completed, what artifacts landed), and present retry / skip-stage / abort. No auto-fix, no auto-rollback. See `.agents/skills/agentic-qa-core/references/orchestration-doctrine.md`.

---

## Scope: ask for the mode first

| Mode | Input | Output | Use when |
|------|-------|--------|----------|
| **single-issue — User Story** | One story key (e.g. `{{PROJECT_KEY}}-123`) | ATP + ATR + QA comment + issue moved to {{jira.status.story.qa_approved}}. TC artifacts depend on modality: jira-native → outlines only (regression TCs created in Stage 4); jira-xray → created + executed `Test`s this sprint, promoted to regression in Stage 4 (see "TC creation timing") | Full QA on one story end to end |
| **single-issue — Bug** | One bug key | Triage decision, then either Code-Review-only OR ATP + ATR + verification report | Retesting a bug fix on staging |
| **sprint-wide** | Sprint number `N` | Sprint session pair (`plan.md` queue + append-only `progress.md`) · STP found-or-created and maintained · per-issue artifacts · session summary | Running the whole sprint's QA backlog, with interruption + resume support |

### The mode question (asked, never inferred)

Session Start asks this in one question, before anything else:

> Run **the whole sprint's QA backlog** (`sprint-wide`), or **one issue from it** (`single-issue`)?

A sprint number in the invocation is a hint, not an answer: "QA sprint 12" can mean either. The one explicit answer is a first token of `$ARGUMENTS` that names the mode (`/sprint-testing sprint-wide 12`, `/sprint-testing single-issue UPEX-123`). That token is the mode, the rest is forwarded, and the question is skipped. Otherwise ask, then apply:

| Answer | Sprint session pair | STP | Per-issue sub-scopes |
|---|---|---|---|
| `sprint-wide` | created at `.session/sprint-testing/sprint-<N>/` | found-or-created and kept current | `sprint-<N>/<JIRA-KEY>/`, one per issue |
| `single-issue` | **not created** | **not created** | `<JIRA-KEY>/` at the top level |

For `sprint-wide` only, ask the second question (skip it for `single-issue`, where one issue has one executor by definition):

> Run the queue **in this session** (one executor), or **fan it out to one session per issue** (a fleet)?

### Executors: the second axis (1 or N)

What this skill runs is `scope × executors`:

| | **1 executor** (default) | **N executors** (fleet mode) |
|---|---|---|
| **single-issue** | unchanged: this session runs the one issue | does not exist: one issue, one executor |
| **sprint-wide** | unchanged: this session walks the queue, issue by issue | this session becomes the **conductor**; one launched session per issue of the round runs the same 4 dispatches on its own issue |

N=1 is unchanged, byte for byte. Fleet mode changes who runs an issue and nothing about what happens to it. It is on only when the scope is `sprint-wide` and the user answered the second question with N executors; `orchestration.max_workers` in `.agents/project.yaml` only caps how many run per round.

The orchestration gate decides how the sessions get launched. When it passes (binary present, runtime reachable), the orchestration layer launches and supervises them. When it fails, the conductor writes `.session/sprint-testing/sprint-<N>/launch.txt` anyway (one self-contained line per issue) and tells the user to open N terminals and paste one line each. The three-state gate lives in `/agent-orchestration`; this skill does not reimplement it. When the gate fails, the orchestration tool is never named, recommended or reported, not in the plan, the preflight gate, the ATR or the dashboard: a gap in tooling the user does not have is not a QA finding.

Worker mode is detected from the prompt, not the environment. A worker's launch prompt opens with `/sprint-testing <KEY> fleet worker …` and names its brief; the token `fleet worker` plus the brief's `Label` / `Task` / `Dispatch` fields are the signal. On a real fleet an env prefix written into a launch line did not survive every launcher and every worker ran with both variables empty (ADR-0006), so nothing in this skill depends on env vars. Canon: `references/fleet-conductor.md` §3.

Everything else fleet mode adds (the conductor's duties, brief seeding, `launch.txt` rules, rounds, the auth one-writer rule, browser isolation, claims, the liveness dashboard) is in `references/fleet-conductor.md`. The transport (sessions, terminals, mailbox, cleanup) is in `agent-orchestration`, cited there as `[ORCHESTRATION_TOOL]` pseudocode. The conductor maneuver around it (boot with the Sprint Board, the watch pass, the round close, the resume after a reboot) is `/sprint-conductor`.

### Sprint scope is a JQL query, never a hardcoded type list

A project whose Jira has only `Story` must work, and so must one that added `Tech Debt`, so the backlog is resolved by query and never by a literal issue-type list written into the rule. Four steps:

1. Read `.agents/jira-required.yaml` and take every work type declared `coverable: true`.
2. For each, resolve `jira_issue_type`. A value of the form `A | B | C` is an ordered list of alternatives, and the first name the instance actually has wins (the `subtask` entry documents why: the subtask level is spelled `Sub-task`, `Task` or `Subtarea` depending on the instance).
3. Intersect with `.agents/jira-workflows.json`, the synced catalog of what the instance really exposes. A work type absent from that file does not exist here.
4. A declared type the instance lacks is skipped with a note in the sprint `plan.md` §Risks, never a blocker.

Build the JQL from the surviving names plus the sprint filter. Illustrative only, so do not copy this list into the plan or any reference: on an instance exposing every declared coverable type it yields `sprint = {N} AND project = {{PROJECT_KEY}} AND issuetype in (Story, Bug, Defect, Improvement, "Tech Story", "Tech Debt")`; on an instance with only `Story` it yields `issuetype = Story`, a correct and complete run.

Run it with `bun run jira:sync-issues jql "<query>"` (resolves every slug and materializes the per-issue `.md`), or `pull --sprint <N> --types <csv>` for the same roster.

### When nobody is at the keyboard

Some steps below wait for a person. Who holds each gate depends on who runs the session. `agentic-qa-core/references/decision-protocol.md` says which calls are the agent's and which escalate; this table only places this skill's gates.

| Gate | A person is present | A supervised worker | A routine with nobody |
|---|---|---|---|
| Mode and executors questions | asked | not asked: `fleet worker` plus the brief fix one issue | the delegating brief names mode and scope; if it does not, stop before creating anything and report |
| Test-case format (Stage 1, jira-xray) | asked once per batch | declared in the brief; a silent brief gets one `ask` to the conductor | the brief names it; if not, finish the reversible planning, stop before creating `Test` issues, report |
| Story explanation OK, Preflight Gate checklist, resume / restart / abort | asked | the conductor holds the gate (`references/fleet-conductor.md` §10); a worker resumes its own scope and never restarts | resume needs no brief; restart and abort need the brief's word, otherwise report; a blocking RED probe stops the run and reports |
| An unmapped status slug, or a find-or-create that returns someone else's artifact | one `AskUserQuestion` | one `ask` to the conductor | leave the artifact and the transition alone, record it in `progress.md`, report |
| Dead environment or send-only inbox (§0.6) | stop, surface, offer the env override | `ask` the conductor | stop before any ATP or Jira write and report; use an override only if the brief names one |
| Sprint number missing (§0.7) | ask the user | `ask` the conductor | the brief names N; if not, skip the STP write and report |
| MEDIUM risk score on a bug | ask the user | `ask` the conductor | the brief decides; if silent, do the reversible triage work, stop before any Jira write and report |
| Blocking BUG_FOUND, severity recalibration (Gotchas 10 and 14) | present it and wait | `ask` the conductor | stop before the transition, link or message, and report |
| Per-issue summary OK (sprint-wide), subagent failure | asked | the conductor holds the round | stop after the reversible output and report (`references/sprint-orchestration.md` gate table) |

---

## Workflow: one pipeline for all modes

Where a Gotcha or a reference disagrees with §"TC creation timing" or §"Stage 1 Set-first order", those sections win.

```
Session Start (always first)
    -> PBI folder + context.md · session dir + test-session-memory.md
    -> Story explanation, WAIT for user OK

Stage 1 — Planning
    -> For Story: triage risk + Test Analysis + ATP/ATR + TC OUTLINES (names + 1-line precond/expected)
                  jira-native -> NO `Test` work items here (created in Stage 4, regression-worthy only)
                  jira-xray   -> Set-first order (see "Stage 1 Set-first order" below): ① CREATE +
                                 EXECUTE `Test` issues at executable detail + the Story's ATS (Test
                                 Set) created/updated holding ALL of them ② ATP item find-or-created
                                 FROM the {{jira.acceptance_test_plan}} field content ③ ATP/ATR test
                                 lists DERIVED from the ATS membership ④ ATR always created WITH the
                                 Test Environment.
                                 Stage 4 promotes the regression-worthy ones into the Regression
                                 Test Plan (RTP), re-deriving the canonical title on the way in.
    -> For Bug:   veto check + Bug Analysis + ATP/ATR.
                  jira-xray   -> ONE repro `Test` by default, created at fix-verification time (1:N
                                 only if the scope genuinely covers distinct conditions — justify per
                                 test-design-doctrine), executed in the retest Execution, PASSED/FAILED
                                 recorded. Bug↔Test linked via the `test` slug (Bug is coverable).
                  jira-native -> no TCs in-sprint (the bug IS the immediate retest case; defers to
                                 Stage 4). If regression-worthy, Stage 4 ensures a persistent Test
                                 covers it — REUSE the existing failed Test or CREATE one (golden
                                 rule; both modalities).
    -> See references/acceptance-test-planning.md and references/feature-test-planning.md
    -> TC work-item timing rule -> see "TC creation timing (modality-aware)" below

Stage 2 — Execution
    -> Smoke test is always first (Go / No-Go)
    -> Then UI / API / DB exploration per what changed
    -> Evidence into .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/
    -> See references/exploration-patterns.md

Stage 3 — Reporting
    -> Fill ATR, post QA comment, transition ticket
    -> CLOSE the artifacts Stage 1 opened (artifact-lifecycle.md §1):
         ATR  complete -> {{jira.status.test_execution.close}}   (after every run status is recorded)
         ATS  done     -> {{jira.status.test_set.close}}         (membership now final)
         ATP  complete -> {{jira.status.test_plan.completed}}    (results are in)
    -> File bugs via bug-report template when found
    -> Light stage verifier (artifact-lifecycle.md §5) closes the stage
    -> See references/reporting-templates.md

---> Hand off (cross-skill, NOT this skill):
       Stage 4 -> test-documentation
       Stage 5 -> test-automation
       Stage 6 -> regression-testing
```

### TC creation timing (modality-aware)

This section settles when a test case becomes a work item in the TMS. The principle: a test is persisted into the regression repository because it will be re-executed (manual or automated), never to hit a count. The mechanism differs by modality because the tools differ: an Xray `Test` issue is an execution unit, a Jira-native `Test` issue is documentation. An execution artifact (how you run and record a test this sprint) is not the regression repository (the curated set of repeatable tests); the principle governs the repository only.

| | **Modality jira-native** | **Modality jira-xray** (`bun xray` CLI) |
|---|---|---|
| Stage 1 (Planning) | TC **outlines only** (names + 1-line precond/expected in the ATP). **No `Test` work items**: a native `Test` issue IS documentation, so it waits for the Stage-4 regression-worthy gate. | **ASK the format once per batch** (see "Test-case format: ask once per batch" below), then **create + execute** Xray `Test` issues for the **planned outlines**, at *executable* detail (preconditions + runnable steps), and run them via a **Test Execution**, all in one pass. By Xray's plugin design the `Test` is the execution unit, so generating these artifacts is what makes the rest of the Xray flow work. All created Tests are aggregated into the Story's **ATS** and the Plan/Execution lists derive from that membership (see "Stage 1 Set-first order" below). **Manual** tests are created **without inline steps**, then steps are added one-by-one (see "Manual Xray test steps: two-step creation"). |
| Stage 2 (Execution) | Run planned outlines **and explore beyond them**; track outline status (PASS/FAIL) in `test-session-memory.md`. | Execute the created Tests in the Test Execution and **explore beyond them**. A throwaway exploratory probe becomes a `Test` ONLY if it found a defect or is worth repeating; otherwise it stays as session evidence or a bug, NOT a `Test` (avoids a one-shot-Test explosion). |
| Stage 4 (`test-documentation`) | **Create** `Test` work items **only for regression-worthy** scenarios (Candidate/Manual) after ROI; apply the feature/Epic label (native's organizer, no Test Set entity). Deferred: report only, no TMS `Test`. | **Select + promote**: from the sprint Xray Tests, the regression-worthy ones (Candidate/Manual) get **enriched** (rich Gherkin, parameterization, edge elaboration), **labelled** `regression-candidate`, **added to the feature Test Set** (1:1 Epic, created lazily if missing) **and the Regression Test Plan**. Deferred sprint Tests stay tied to their Test Execution as historical record: **not promoted, not deleted**. |

Invariants (both modalities):

- The persistent regression set is ROI-gated in Stage 4, never assumed in Stage 1.
- The wide 1:N technique derivation feeds the ATP outlines and the execution. In native it stays as outlines; in Xray it materializes as sprint `Test` artifacts. Either way it does not auto-populate the regression repository.
- Heavy specification ("specify much more") is spent only on Stage-4 regression candidates, never on Deferred scenarios.

See `agentic-qa-core/references/test-design-doctrine.md` (derive widely) and `test-documentation` Three-Outcomes (persist narrowly).

Whenever this stage does create a `Test` work item, its summary must already match the canonical form `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]`. `{US_ID}` is the Story key and `#` a stable index within that Story, assigned once and never renumbered. A sprint-era title is not a draft to tidy later: Stage 4 re-derives and verifies it on promotion (`test-documentation/SKILL.md` §"Title on promotion"), and a Test created outside the form forces a rename there. Full grammar and anti-patterns: `references/acceptance-test-planning.md` §TC nomenclature.

#### Which stage creates the TCs: `{{TC_CREATION_STAGE}}` (project knob)

The table above is the `auto` behavior, the shipped default. `.agents/project.yaml` → `testing.tc_creation_stage` (referenced as `{{TC_CREATION_STAGE}}`) lets a project override it. Resolve it at the modality gate (Session Start step 0), alongside `{{TMS_CLI}}`, and record the resolved value in `test-session-memory.md` next to the modality. It is sticky for the session, exactly like the modality.

| Value | Stage 1 (this skill) creates `Test` work items? | Notes |
|---|---|---|
| `auto` (default) | jira-xray → **yes** · jira-native → **no** (outlines only) | the table above, unchanged |
| `sprint-testing` | **yes**, in both modalities | a jira-native project that wants in-sprint Test items (e.g. its dashboards count Test issues per sprint). Stage 4 then REFINES + promotes them instead of creating them |
| `test-documentation` | **no**, in both modalities | an Xray project that wants a clean regression repository. **Cost, state it to the user before honouring it**: Xray's `Test` is the execution unit, so with no Test items there is no Test Execution to run them in. Stage 1's ATR carries no runs and per-TC PASSED/FAILED evidence lives only in the ATR body. Traceability degrades to the ATP text |

Why the knob exists: under jira-native a `Test` issue is documentation, so one per sprint outline fills the regression repository with cases that were never ROI-gated. Under jira-xray the `Test` is what Xray executes, and its traceability (coverage panel, Test Execution runs, Plan membership) needs the item during the sprint. Neither default is universally right, so the default follows the tool (`auto`) and a project may weigh repository cleanliness against traceability differently.

An unset or unrecognized value is treated as `auto`, said once. Do not ask the user mid-stage: a missing knob is the shipped default, not a gap.

#### Test-case format: ask once per batch (Modality jira-xray, Stage 1)

Before creating the batch of Xray `Test` issues, ask the user once which format to use and apply the answer to the whole batch:

- **Manual**: Xray `type=Manual`; step / data / expected-result steps (human-readable, no Gherkin).
- **Gherkin / Cucumber**: Xray `type=Cucumber`; Scenario / Scenario Outline + Examples.

Suggest Gherkin for automation-candidate flows and Manual for exploratory or human-judgment scenarios, then wait for the user's choice; do not auto-pick. This ask is a sprint-execution convenience and does not pre-empt the Stage-4 ROI verdict-to-format mapping in `test-documentation` (Candidate to Gherkin, Manual to Manual), which governs the persistent regression repository.

In worker mode the format is declared, never asked: nobody watches a worker's terminal, and Manual and Gherkin produce different artifacts, so this fork cannot be downgraded into report content the way a checkpoint can.

- The conductor asks the user once per batch (per round, or once for the whole fleet run) and writes the answer into the `## Test-case format` field of every brief it seeds.
- The worker reads the format from its brief and applies it to its whole batch.
- If the brief is silent, the worker neither guesses nor prompts the user: it sends one `ask` to the conductor and waits (`references/fleet-conductor.md` §10). A guessed format costs a rewrite of every `Test` it created.

#### Manual Xray test steps: two-step creation (Modality jira-xray)

Xray Cloud silently drops steps passed inline to `test create`. So when the batch format is Manual, create each Test in two steps and never inline:

1. Create the `Test` (`type=Manual`) without inline steps: `[TMS_TOOL] Create Test: type=Manual, title=...` (no `steps=`).
2. Add each step one by one with `[TMS_TOOL] Add Test Step` (action / data / expected per step). The `/xray-cli` skill carries the concrete CLI syntax.

Optionally verify with `[TMS_TOOL] Get Test` that the steps landed. Gherkin/Cucumber Tests are unaffected (the Gherkin is one field); the two-step rule applies to Manual tests only.

#### Stage 1 Set-first order (Modality jira-xray)

The Story's coverage backbone is its **ATS** (Acceptance Test Set, `ATS: {US_ID}: {story title}`, `{US_ID}` = the Story key; mandatory per Story, even with a single TC). Stage 1 runs in this order:

1. **ATS holding ALL the Story's TCs.** Create the sprint `Test` issues, then create or update the Story's ATS (parent: **QA Test Artifacts** epic; **components inherited from the Story, mandatory**) with all of them as members, and link **ATS to Story** via the `test` slug (`{{jira.link_types.test}}`, Story `is tested by` ATS). This link fills the Xray coverage panel (`xray-cli/SKILL.md` §Direction); the ATP-to-Story and ATR-to-Story links are administrative traceability and contribute zero coverage.
2. **ATP item from the field (find-or-create).** Pre-sprint the ATP lives only in `{{jira.acceptance_test_plan}}`: the shift-left pass is field-first and does not create the item. Find-or-create the Test Plan issue `ATP: {STORY-KEY}: {story title}` (parent: **QA Master Test Plan** epic) and seed its description from the field content. If the field is empty (no shift-left pass), author the ATP normally and write both the item and the field.
3. **Derive, never re-list.** The ATP's test list and the ATR Execution's test list are derived from the ATS membership, never kept as three independent id lists.
4. **ATR always with environment.** Create the ATR Execution (`ATR: {STORY-KEY}: Story Testing`, parent: **QA Test Artifacts**) always carrying the Test Environment resolved from `active_env` in `.agents/project.yaml` (or the session env switch). No ATR without environment; this is a hard gate (`agentic-qa-core/references/stage-gates.md` §Stage 1).
5. **Assignee = self on every artifact created here** (ATP, ATS, ATR, every `Test`), set at create time (`agentic-qa-core/references/artifact-lifecycle.md` §2). Xray refuses membership edits on a Test Plan the caller does not own, so an unassigned ATP cannot have its test list updated later, and the failure surfaces mid-flow after the Plan exists. A find-or-create that returns someone else's artifact is not reassigned silently: ask the user first.
6. **Statuses: the artifacts must leave the status `create` dropped them in** (`artifact-lifecycle.md` §1). At the end of Stage 1:

   | Artifact | Born | Stage 1 leaves it at | Transition |
   |---|---|---|---|
   | sprint `Test` (TC) | `{{jira.status.test_case.draft}}` | `{{jira.status.test_case.ready}}` | `{{jira.transition.test_case.start_design}}` then `{{jira.transition.test_case.ready_to_run}}` |
   | ATP | `{{jira.status.test_plan.planning}}` | `{{jira.status.test_plan.ready}}` | `{{jira.transition.test_plan.designed}}` |
   | ATS | `{{jira.status.test_set.designing}}` | **stays `designing`**, because membership is not final until Stage 3 | none |
   | ATR | `{{jira.status.test_execution.active}}` | **stays `active`**, because the run has not happened yet | none |
   | STP (sprint altitude) | `{{jira.status.test_plan.planning}}` | `{{jira.status.test_plan.ready}}` once the sprint scope is set | `{{jira.transition.test_plan.designed}}` |

   Each sprint `Test` is parented to the QA Test Repository epic (`qa.qa_epics.test_repository_epic`), never the product Epic and never unparented (`.agents/instructions/agent-local-context-pbi.md`). A TC left at `draft` and unparented is the defect this rule exists to prevent.

7. **On an unmapped slug**, run the fallback protocol in `agentic-qa-core/references/artifact-lifecycle.md` §4: list the live transitions, propose the closest synonym in one `AskUserQuestion`, fire the live id on yes, and recommend `bun run jira:sync-workflows`. Never skip a transition silently.

TC in ATS membership is always a TC to ATS issue link (`test` slug), in this modality and in jira-native alike; here the Xray-internal membership (GraphQL) is written as well, never instead. TC in ATP and TC in ATR membership stays Xray-internal. An instance without the Test Set work type has no ATS and falls back to direct TC to Story links. Canon: `agentic-qa-core/references/traceability-linking.md` §9.

The stage asymmetry is intended, not drift: in-sprint Stage 1 creates the TCs first and groups them into the ATS as they land, while Stage 4 module-driven (`test-documentation`) pre-creates the containers before the first TC because parallel sharding needs the targets to exist.

Session Start is the universal entry, and every mode runs the same four dispatches sequentially (Session Start, Stage 1, Stage 2, Stage 3), each subagent's report feeding the next briefing's "Context docs". Use the briefings in `references/sprint-orchestration.md` verbatim, even for one issue. Sprint-wide loops them through the `PENDING` rows of the sprint `plan.md` queue and, after each issue closes, appends one entry to the sprint `progress.md` and one comment to the STP.

---

## Readiness Preflight Gate (MANDATORY — runs before Phase 0)

> Full doctrine: `agentic-qa-core/references/preflight-gate.md`. Runs FIRST, before the resume check. Two laws: (1) **args-as-answers** — "QA UPEX-123 on staging" already answers env + scope; "test the login API" already answers the surface (API). Ask only the gaps. (2) **probe, don't assume** — a configured MCP is RED until it actually answers. Surface gaps + REDs as ONE `AskUserQuestion` checklist; self-fix with approval + explanation; STOP on any blocking RED. This is the heaviest gate in the repo because Stage 2 exercises UI + API + DB live. **Generic baseline** (env resolution, test-user creds, secret/restart handling, the two laws, output contract) is inherited from the reference §3.1 — not repeated here. Below is only this skill's **specific capability delta**.

| Capability | Need | Why here |
|---|---|---|
| Framework adapted (artifacts present) | REQUIRED | Live QA needs the project wired — `{{WEB_URL}}` / MCP names are `null` on a generic boilerplate. Probe the reference §4 ADAPTED signals; still generic → STOP and tell the user to run `/project-discovery` → `/test-framework-adaptation` themselves. The gate NEVER auto-runs them. |
| Active env reachable | REQUIRED | Authoring an ATP against a dead env is the highest-cost waste. Probe `{{WEB_URL}}` + `{{API_URL}}` root. This subsumes the env half of Session Start §0.6 — pulled to t=0. |
| Test-user credentials + roles | REQUIRED | `<<ACTIVE_ENV>>` creds in `.env`: role `user` = the `<ENV>_USER_*` pair, any other role = `<ENV>_<ROLE>_EMAIL` / `_PASSWORD`. Ask how many roles the ticket needs; one token per role via `bun run api:login [<env>] --role <role> [--profile <name>]`, one browser state per role at `.auth/<env>-<role>.json` (`agentic-qa-core/references/browser-sessions.md` §4). |
| Issue-tracker (`[ISSUE_TRACKER_TOOL]`) + TMS modality | REQUIRED | All ATP/ATR/QA-comment/transition writes go to Jira. Load `/acli`; resolve modality; load `/xray-cli` + `XRAY_*` if jira-xray. |
| OpenAPI MCP (schema read-only) | SCOPE — when API surface is in scope | The `openapi` MCP is **schema-read-only** — discover endpoints + read schemas (`list-api-endpoints` / `get-api-endpoint-schema`); it does NOT execute authenticated requests. Probe that a schema call returns the spec. Generic/unset spec → `/test-framework-adaptation`. Execution is curl's job (next row). |
| API token for curl (`bun run api:login`) | SCOPE — when API execution is in scope | Authenticated requests run via **curl**, not the MCP. Mint: `bun run api:login [<env>] [--role <role>]` → `.auth/tokens.env`. Execute: `source .auth/tokens.env && curl -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" "$API_BASE_URL/<path>"`. **No restart needed** (the token never enters an MCP). Canon: `agentic-qa-core/references/api-testing-doctrine.md`. |
| DBHub MCP | SCOPE — when DB validation is in scope | The trifuerza DB leg. Probe `dbhub` lists schema/tables; `DBHUB_*` in `.env`. Unset → user fills `.env` + RESTART (spawn-time). Queries and troubleshooting: `agentic-qa-core/references/db-testing-doctrine.md`. |
| Playwright / `/playwright-cli` | SCOPE — when UI surface is in scope | Smoke + UI exploration. Browser present (`bun run pw:install` if not). |
| Email (`resend`) — can RECEIVE | SCOPE — magic-link / auth-token tickets only | Subsumes the inbox half of Session Start §0.6. A send-only provider cannot complete a magic-link flow → STOP before Stage 1. |
| Business context map per touched level | REQUIRED — per level in scope | UI/E2E → `business-e2e-context`, API → `business-api-context`, DB → `business-data-context`: the skill exists AND `bun run context:map <slug> --list` prints sections, not the placeholder notice. RED → STOP and hand the user `project-context` mode `e2e` / `api` / `data`; a missing skill → `bun sync`. |
| `kata-manifest.json` | OPTIONAL | Only load-bearing at the Stage 3 → `/test-automation` handoff (anti-duplication). |

Surfaces (UI / API / DB / code-review-only) are decided by **Stage 1 Planning's triage + veto + risk-scoring** — NEVER asked of the user (reference §5). The gate only probes and reports which surface tools are ready; Stage 1 reads that report and picks the trifuerza subset on its own. A scope-conditional tool stays REQUIRED only once Stage 1 selects its surface — if RED then, surface the remedy at that point. Session Start §0.6 stays as written — this gate is its t=0 generalization, not a replacement. After the gate clears (generic baseline + any already-evident surface tools GREEN), continue to Phase 0 below.

---

## Phase 0 — Session resume check (MANDATORY, inline)

Before Session Start dispatch, run the resume contract from `agentic-qa-core/references/session-management.md` §4:

1. Compute prospective `<scope>` from the mode answer: `<JIRA-KEY>` (single-issue) or `sprint-<N>` then `sprint-<N>/<JIRA-KEY>` (sprint-wide — see the two-altitude note below).
2. Check `.session/sprint-testing/<scope>/progress.md`.
3. If it does NOT exist → proceed to Session Start (writes `plan.md`).
4. If it DOES exist:
   - Read `plan.md` + tail of `progress.md`.
   - Optionally read `.session/sprint-testing/<scope>/test-session-memory.md` for the per-issue domain state (load-bearing across the 4 sub-agent dispatches; issue altitude only).
   - Surface to the user: last completed stage (Session Start / Stage 1 / Stage 2 / Stage 3) — or, at sprint altitude, the last closed issue and the next `PENDING` one — plus any unresolved BUG_FOUND or TOOL FAILURE from the last entry.
   - Offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-sprint-testing-<scope>-aborted/` first.

**Sprint-wide runs Phase 0 twice over, at two altitudes** (`agentic-qa-core/references/session-management.md` §9 "Nested scopes"):

- **Once on `sprint-<N>`** at sprint entry. Existing pair → the resume summary is "queue of {n}, {k} closed, next is `<KEY>`". No pair → Session Start §0.5 builds it.
- **Then once per issue on `sprint-<N>/<JIRA-KEY>`**, as the loop enters that issue (NOT once at sprint-loop entry). Per-issue resume keeps sprint progress fine-grained.

`restart` at sprint altitude archives the whole `sprint-<N>/` tree, nested sub-scopes included — never offer it while an issue is mid-flight.

---

## Session Start — the universal entry

Every invocation starts here, sprint-wide runs included. Session Start prepares everything the three stages read and then stops for the user's OK on the story explanation. It runs after Phase 0 (above), which decides fresh start or resume. The gates that wait for a person are placed in "When nobody is at the keyboard" (above).

0. Resolve the TMS modality (Xray on Jira, or Jira-native). By default ATP, ATR and ATS are real Jira items:
   - a `Test Plan` issue (`ATP: {STORY-KEY}: {story title}`) under the **QA Master Test Plan** epic;
   - a `Test Execution` issue (`ATR: {STORY-KEY}: Story Testing`) under the **QA Test Artifacts** epic;
   - a `Test Set` issue (`ATS: {US_ID}: {story title}`, the Story's coverage backbone), also under **QA Test Artifacts**.

   The Story custom-field and comment mirror (Modality jira-native) is a fallback for instances without those work types. Before the sprint the ATP lives only in the `{{jira.acceptance_test_plan}}` field, and Stage 1 is where the Test Plan item is born (find-or-create from the field). Title grammar, epic parenting and the FTP name: `references/acceptance-test-planning.md`.

   The full resolution algorithm is in `test-documentation/SKILL.md` §Phase 0; apply the same three-step probe here: `testing.tms_cli` in `.agents/project.yaml`, then Xray API evidence through `/xray-cli` (work types alone never decide), then ask the user. Persist the result into `test-session-memory.md`, and in the same breath resolve `{{TC_CREATION_STAGE}}` from `testing.tc_creation_stage` in `.agents/project.yaml` (unset or unrecognized means `auto`), because it decides whether Stage 1 creates `Test` work items at all (§"Which stage creates the TCs"). Both values are sticky for the session and not re-resolved mid-stage.
0.1. Load the tool skills the modality needs, before any pseudocode below runs. They carry the syntax, flags and JSON payloads this skill leaves out.
   - Always `/acli`, for Jira writes (comment, transition, link, custom-field update, bug creation). Detailed reads (ACs, ATP/ATR, description, comments) skip it: run `bun run jira:sync-issues get <KEY> --include-comments` and read the synced `.md` (`agentic-qa-core/references/acli-integration.md` §"Reads vs writes").
   - Modality jira-xray adds `/xray-cli` for Test, Test Execution, Test Plan and Test Run operations and for traceability reads.
   - Modality jira-native needs nothing more: `/acli` covers the `[ISSUE_TRACKER_TOOL]` writes and the `[TMS_TOOL]` operations, and reads still go through the sync script.
0.5. Sprint session pair (sprint-wide only; single-issue and bug-only invocations own no sprint-altitude state and skip it). The mode came from the "mode question" ask, never from the invocation wording. Phase 0 already looked for `.session/sprint-testing/sprint-<N>/progress.md`; act on what it found:
   - Missing: build the pair before entering the issue loop. Resolve the JQL scope (§"Sprint scope is a JQL query"), write `plan.md` per `agentic-qa-core/references/session-management.md` §6, and open `progress.md` with its frontmatter. Procedure: `sprint-orchestration.md` §Part 1, Sprint plan + STP.
   - Present: resume against it. `plan.md` is the sprint's agreement and is not regenerated on a schedule (a rewrite would destroy hand-written wave notes and assignments). New issues are appended to the queue and recorded in `## Changelog` (append-only, §6).
0.6. Environment and inbox preflight (orchestrator-inline, blocking, runs before Stage 1 authors any ATP). An ATP written against a dead environment is the most expensive waste in a run, so check first.
   - Probe `{{WEB_URL}}` and the `{{API_URL}}` root with a generic request (HEAD or GET, for example `curl -sI {{WEB_URL}}`). A 2xx or 3xx counts as reachable, a login redirect included. A hard failure on the root (404, 410, 5xx, connection refused, a dead-deployment page such as `DEPLOYMENT_NOT_FOUND`) means the environment is not testable.
   - On a hard failure, stop and surface it before Stage 1: dispatch no Session Start subagent and author no ATP. Offer a session env override if the user has a working alternate URL (Gotcha 15).
   - Inbox receive-check, only when the ticket depends on email, a magic link or an auth token (inferred from the invocation, ticket type, labels or title): confirm the mailbox can receive, not just send, since a send-only provider cannot complete a magic-link flow. If it cannot, stop and surface before Stage 1.
   - This is a reachability gate, not the Stage 2 smoke test (does the feature work?). Both run (S7).
0.7. Sprint Test Plan (STP) find-or-create (orchestrator-inline, sprint-wide only, on the first ticket of the sprint). Single-issue mode owns no sprint-altitude state and creates no STP, so it skips this step.
   - Resolve N from the ticket's Sprint field: `bun run jira:sync-issues get <KEY>`, then read the sprint value in the generated `.md`. The script also accepts `--sprint <active|current|closed|>=N|7,8,10>` and the `JIRA_SYNC_SPRINTS` env default (the sprint-wide path, resolving N once for a whole pull). A ticket with no sprint means asking the user for N, never guessing it.
   - Search for `STP: Sprint#{N}: {objective}`, a **Test Plan** item under the **QA Master Test Plan** epic. Missing: create it (`/regression-testing` is the fallback creator if it runs suites first). Present: update it. The STP is a living sprint planner: add this ticket to its scope and keep progress current after every tested ticket.
   - The STP closes at sprint end. The recap Execution `STR: Sprint#{N}: Regression Testing` (parent **QA Test Artifacts**) is created at sprint close by whichever arrives first, the sprint-wide close recap or `/regression-testing`, and the other completes it (`references/sprint-orchestration.md` §STEP 7). The STR carries `testPlan` to the STP and to the RTP (dual membership). Regression runs during the sprint are RTRs (`RTR: {scope-id}: Regression Testing`, one per verdict) owned by `/regression-testing`: never write one into the STR.
   - Modality jira-native without the Test Plan work type: skip with a note (no field fallback at sprint altitude); non-blocking.
   - STP maintenance under concurrent testers (binding). The sprint session pair and the STP issue are one artifact at two addresses, split exactly like this:

     | Local file | STP surface | Write mode | Writers |
     |---|---|---|---|
     | `plan.md` | the issue **description** | rewritten wholesale | **ONE**, whoever plans the sprint |
     | `progress.md` | the issue **comments** | **append-only, both sides** | every tester |

     A description is replaced on each write, so two editors clobber each other; a comment is added, so two commenters never can. Read the description before touching it (never overwrite someone's scope edit), and when an issue closes append ONE comment carrying the same content as that issue's `progress.md` entry. When the comment log and a Story's ATR disagree, the ATR wins: it is the artifact of record and the log can lag. Read the log back with `bun run jira:sync-issues get <STP-KEY> --include-comments`.
1. Fetch the ticket with `bun run jira:sync-issues get <KEY> --include-comments` (title, ACs, priority, comments) and read the synced `.md` files under the STORY folder. Never use `acli workitem view` for custom fields: it returns `null`.
2. Extract the Team Discussion from the synced `comments.md` (decisions, tech notes, edge cases, blockers). This is non-blocking.
3. Load the project-wide context: the business context maps per touched level (`bun run context:map business-data-context`, `business-api-context`, `business-e2e-context`, with `--section <id>` when one entity, endpoint group or journey is enough) and `.context/PBI/qa-artifacts/master-test-plan.md`.
4. Load `module-context.md` (3-level hierarchy: project, module, ticket) if the sync materialized it. If it is absent, draft the body and publish it into the Epic description's `## Module Context (QA)` section (read first, never overwrite; a fleet worker stages it under `## Module Learnings (candidate)` in its `test-session-memory.md` and the conductor publishes it), then re-sync. The local file is Jira-synced and never authored by hand (`references/session-entry-points.md` Step 4).
5. Explore the backend (`{{BACKEND_REPO}}`) and frontend (`{{FRONTEND_REPO}}`) code.
6. Find test-data candidates through `[DB_TOOL]` on `{{DB_MCP}}`.
7. Create the PBI folder and the session directory:
   ```
   .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-{{PROJECT_KEY}}-{number}-{brief-title}/
     context.md                # hand-authored: session notes + open questions (NON-Jira, local-only)
     evidence/                 # screenshots (NON-Jira, local-only)

   .session/sprint-testing/<scope>/
     test-session-memory.md    # hand-authored: shared memory across the 4 sub-agent dispatches
   ```
   The Jira-mirrored files (`story.md`, `acceptance-criteria.md`, `acceptance-test-plan.md`, `acceptance-test-results.md`, `comments.md` and the rest) are materialized by `bun run jira:sync-issues get <KEY> --include-comments`, never written here. The PBI tree is gitignored (a Jira cache; see `.agents/instructions/agent-local-context-pbi.md`), so `context.md` and `evidence/` are local-only. `test-session-memory.md` lives in `.session/` because a re-sync rewrites the PBI cache and every resume and sub-agent reads this file.
8. Write the session `plan.md` at `.session/sprint-testing/<scope>/plan.md` per `agentic-qa-core/references/session-management.md` §6: Goal (one sentence per ticket), Inputs (PBI paths, TMS modality, Team Discussion summary), Approach (mode and per-stage dispatch pattern), Phase breakdown (Session Start, Stage 1, Stage 2, Stage 3, each with its dispatch pointer and exit condition), Risks (from triage), Verification checklist, and Cross-references (`context.md`, `test-session-memory.md`, `acceptance-test-plan.md`, `acceptance-test-results.md`).
9. Write a Story Explanation and stop for the user's confirmation. Nothing past this point runs before the OK.
10. After the OK, append the first progress entry `## Session Start — <ts>` with `status: completed`, `next: Stage 1 — Planning` to `.session/sprint-testing/<scope>/progress.md`.

Details, templates and the error table are in `references/session-entry-points.md`.

---

## Mode branches: what changes after Session Start

Single-issue and sprint-wide runs follow the same 4-dispatch cadence per issue: Session Start, Stage 1, Stage 2, Stage 3. Use the briefings in `references/sprint-orchestration.md` §"Sub-agent prompt templates" verbatim, even for one issue. The notes below cover only what differs per issue type or mode.

### single-issue, User Story (Stages 1, 2, 3)

- Stage 1 (per "TC creation timing"): triage risk, run Test Analysis, build the ATP and ATR, then branch on the modality. Jira-native writes TC outlines only and creates no `Test` work items. Jira-xray asks the TC format once per batch (Manual or Gherkin), then creates and executes `Test` issues for the planned outlines at executable detail through a Test Execution (Manual tests are create-then-add-step, per "Manual Xray test steps: two-step creation"). Persistent regression TCs are created (native) or promoted (xray) in Stage 4.
- Traceability in jira-xray is Set-first (§"Stage 1 Set-first order"):
  1. The Story's **ATS** (`ATS: {US_ID}: {story title}`) is created or updated holding all the created TCs, and linked ATS to Story through the `test` slug. That is the coverage link.
  2. The ATP item is find-or-created from the `{{jira.acceptance_test_plan}}` field.
  3. The ATP and ATR test lists are derived from the ATS membership.
  4. The ATR is created with the Test Environment (`active_env`).

  ATP-to-Story and ATR-to-Story links stay as administrative traceability, and TCs are not linked directly to the Story (Gotcha 9, which also holds the three-edge check).
- Stage 2: smoke test, then UI, API and DB exploration beyond the planned outlines. Record each outline or Test run as PASSED or FAILED on observation in the precondition's environment, else NOT RUN through the blocking ladder (`agentic-qa-core/references/discovery-driven-doctrine.md` §5). Fold newly discovered partitions, boundaries or transitions back into the outline set; an exploratory probe becomes a `Test` only if it found a defect or is worth repeating. File bugs.
- Stage 3: author the ATR Test Report and apply the modality branch (`reporting-templates.md` §2.3-2.4). Jira-native writes the `{{jira.acceptance_test_results}}` field (or the `## Acceptance Test Results (ATR)` fallback comment), then runs `jira:sync-issues get <KEY> --include-comments` to get `acceptance-test-results.md` in the STORY folder. Jira-xray updates the Test Execution, then runs `jira:sync-issues get <ATR_KEY>` to get `.context/PBI/test-executions/ATR-<ATR_KEY>-<slug>.md` (acronym prefix for a conforming ladder title; a non-conforming title keeps the legacy `TESTPLAN-` / `TESTEXEC-` / `RETESTEXEC-` prefix). Then post the QA comment through `[ISSUE_TRACKER_TOOL]` and transition the ticket.
- Progress checkpoint: after each stage subagent returns, append a phase entry to `.session/sprint-testing/<scope>/progress.md` per `agentic-qa-core/references/session-management.md` §7 (`status: completed`, `dispatched_as: Sequential`, `next: Stage <N+1> | hand-off`).
- Archive after Stage 3 (or after the veto-skip Code-Review variant): move `.session/sprint-testing/<scope>/` to `.session/.archive/<YYYY-MM-DD>-sprint-testing-<scope>/` and call `mem_session_summary` per `agentic-qa-core/references/session-management.md` §8. The PBI artifacts under `.context/PBI/` stay.
- Afterwards, hand off to `test-documentation` for ROI and Stage 4.

### single-issue, Bug (Triage, Verify, Report)

Same 4 dispatches. The Stage 1 briefing also applies the veto and risk-score decision tree before producing the ATP.

- Triage: run the veto table (see Gotchas). On SKIP, run the Code-Review workflow and finish: the Stage 2 and Stage 3 dispatches collapse into the in-place comment and transition, and the orchestrator skips them only when the Stage 1 subagent reports `veto_outcome: skip`.
- Risk score only if no veto applies: 0-3 LOW, 4-7 MEDIUM (ask the user), 8+ HIGH. Before settling on LOW, or on a MEDIUM near the line, call the Skill tool with "blast-radius" on the fix's diff (`references/session-entry-points.md` Step 1.3). When it is not installed, size the radius inline from the diff and the callers, and say so in the report.
- Artifacts: create the ATP and the ATR. The ATR is the retest Execution `ReTest: {BUG_KEY}: {summary}`, always created with the Test Environment from `active_env` (no ATR without an environment). Fill Bug Analysis inside the ATP.
- Repro Test (Modality jira-xray only): create ONE repro `Test` by default, at fix-verification time in Stage 2. Use 1:N only when the bug's scope covers distinct conditions, and justify it per `agentic-qa-core/references/test-design-doctrine.md`. Link Bug to Test through the `test` slug (`{{jira.link_types.test}}`, Bug `is tested by` Test; bugs are coverable), execute it in the retest Execution and record PASSED or FAILED. Modality jira-native is unchanged: no TCs in-sprint, because the bug is the immediate retest case, and persistent-Test decisions wait for Stage 4.
- Regression follow-up: a regression-worthy bug gets a persistent Test in Stage 4 (`test-documentation` bug-driven decision), reusing the failed or repro Test or creating one (golden rule). A one-time typo in a stable area is treated like a failed test.
- Execute: reproduce the original bug, verify the fix, run a regression pass on adjacent areas, and cross-validate in the DB if the bug is about data integrity. When the retest fails or the cause is unclear, call the Skill tool with "diagnosing-bugs" for diagnosis only, before filing: build the loop, reproduce, minimise and hypothesise (its Phases 1-3). Add no instrumentation to product code and write no fix; both belong to the developer. Carry the cause into Root Cause. When it is not installed, narrow the cause inline (reproduce, change one variable at a time) and say so in the report.
- Report: update the ATR, post the comment (Template C for PASSED, Template D for FAILED), and give the user one or two evidence screenshot paths.

### sprint-wide

- Pre-step: if the sprint session pair does not exist, build `plan.md` (the local STP: JQL-resolved queue, waves, assignment) plus an empty `progress.md`, and find-or-create the STP issue from it (`sprint-orchestration.md` §Part 1).
- Loop: read the `plan.md` queue for the first `PENDING` row and dispatch the same 4-stage sequence for that issue. Then append one entry to the sprint `progress.md`, add one comment to the STP, present a per-issue summary and wait for the user's OK.
- Resume: Phase 0 runs at both altitudes, once on `sprint-<N>/progress.md` at sprint entry ("how far did this sprint get?") and then per issue on `sprint-<N>/<ISSUE>/progress.md`, the canonical resume signal per `agentic-qa-core/references/session-management.md` §4. Domain state for an in-flight issue sits beside it in `sprint-<N>/<ISSUE>/test-session-memory.md`, which the 4 sub-agent dispatches read. `progress.md` says which stage is next and `test-session-memory.md` carries the payload; both survive a `jira:sync-issues` re-pull because neither lives in the PBI cache.
- Checkpoints: after each stage subagent returns, append a phase entry to the issue's `progress.md` (`session-management.md` §7). After Stage 3, append ONE entry to the sprint's `progress.md`, mirror it as one STP comment, then archive the issue sub-scope: move `.session/sprint-testing/sprint-<N>/<ISSUE>/` to `.session/.archive/<YYYY-MM-DD>-sprint-testing-sprint-<N>-<ISSUE>/` and call `mem_session_summary`. The PBI artifacts stay. The sprint pair is archived only at sprint close (§STEP 7), never while an issue is mid-flight.
- Nothing local is a deliverable: `.session/` is gitignored and exists only on this machine. The shareable record is the STP in Jira (description from `plan.md`, comments from `progress.md`) and the per-Story ATP, ATS and ATR items. Never tell the user a local file is the canonical output.
- Stops: stop on TOOL FAILURE and pause on BUG_FOUND (Gotcha 10). Append the sprint `progress.md` entry only after Stage 3 completes.
- N>1 executors (fleet mode): everything above still holds. The loop is the same queue, the waves are the same, the STP parity is the same and the sprint-altitude writes stay with this session. What changes is that the per-issue 4-dispatch sequence runs inside a launched worker session instead of here, in **rounds** of at most `orchestration.max_workers` issues inside the current wave. Read `references/fleet-conductor.md` before seeding the first brief; the transport is `[ORCHESTRATION_TOOL]` pseudocode resolved in `agent-orchestration`.

---

## Gotchas: rules to apply on every invocation

1. Credentials come from `.env`. Never hardcode or guess them.
2. PBI folder naming: `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (module = Epic, 1:1), with `<slug>` at most 5 words, kebab-case, generated from the ticket title. Epic-level files live in the EPIC folder, story-level files in the STORY folder.
3. Bug TCs are modality-aware: the repro `Test` rule in "single-issue, Bug" (Mode branches) applies in jira-xray, and jira-native carries no TCs in-sprint, the bug ticket being the implicit immediate test case. Either way a regression-worthy bug ends with a persistent Test in Stage 4: reuse the existing failed Test (or the in-sprint repro Test) or create one (golden rule). Not every bug qualifies.
4. The smoke test is the first action in Stage 2. If smoke fails (No-Go), stop and report instead of exploring deeper: it is an environment-level blocker. Findings from deep exploration follow the graduated rule in #10.
5. Bug veto table. Skip retesting when the bug is pure text, CSS, docs, config or tech-debt cleanup with no functional change. Require retesting, whatever the score, when it touches money, data integrity, auth, external integrations, state machines or calculations. The veto beats the risk score.
6. Story TCs are planned in Stage 1 and executed in Stage 2 ("planning first"). Three exceptions are intended: the bug repro `Test` created at fix-verification time (Gotcha 3); an exploratory probe that found a defect or is worth repeating, which becomes a `Test` in Stage 2 (§"TC creation timing"); and jira-native, which creates no `Test` work items in-sprint at all. Which stage creates them is decided by §"TC creation timing (modality-aware)" and `{{TC_CREATION_STAGE}}`.
7. Explain the story, then wait for the OK. Do not go past Session Start without the user's confirmation; bug triage works the same way ("When nobody is at the keyboard" says who holds the gate in a worker or a routine).
8. Evidence directory. The shared `.playwright/cli.config.json` `outputDir` stays at the tool-owned directory it ships with and is never repointed (`agentic-qa-core/references/evidence-conventions.md` §1 Bucket A and §5). Every `[AUTOMATION_TOOL]` capture carries an explicit destination path resolving to `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/`; that is required anyway, because `outputDir` does not apply to `.png`.
9. Traceability check after Stage 1 (Modality jira-xray): run the three-edge check (`agentic-qa-core/references/traceability-linking.md` §Traceability verification: Link List on Story, ATP and ATR, or `bun xray trace {TICKET}`) against the Set-first model in Mode branches. The coverage backbone is the ATS: `ATS: {US_ID}: {story title}` linked to the Story through the `test` slug ("is tested by") and holding all the Story's TCs (one `TC` to `ATS` `test` link per TC plus the Xray-internal membership, `agentic-qa-core/references/traceability-linking.md` §9). Story-to-ATP and Story-to-ATR links are administrative and contribute zero coverage (live-verified), and their test lists derive from the ATS membership. TCs are not linked directly to the Story (last resort only, for instances with no Test Set work type). Bugs: the repro Test links Bug to Test at fix-verification time, so gaps for missing TCs before then are expected. Full doctrine: `agentic-qa-core/references/traceability-linking.md` and `test-documentation/references/tms-architecture.md`.
10. Graduated stop and pause.
    - TOOL FAILURE: stop, report, await the user.
    - Blocking BUG_FOUND (smoke or environment down, data integrity, security-exploitable): pause, present the bug, await the decision, and do not dispatch the next sub-agent while it is unresolved.
    - Non-blocking finding (cosmetic, minor validation, an edge case on a non-critical TC, a framework default pending recalibration): the Execution subagent logs it and continues the pass, and the orchestrator surfaces it at Stage 2 close.
    - A FAIL is not automatically Critical. Triage first: severity per `references/reporting-templates.md` §1.4, recalibrated at §5.0 for security, auth and framework defaults (`references/exploration-patterns.md` "Finding triage").
11. Sprint log timing (sprint-wide). Append the sprint-altitude `progress.md` entry, and its mirror STP comment, only after Stage 3 completes and the orchestrator-side checklist verifies. `progress.md` is append-only in both directions: never rewrite an entry or edit a posted comment, add a new entry and a new comment instead. There is no local sprint tracker file.
12. Language. All artifacts, TMS content and commit messages are in English. The user's language is mirrored only in conversation.
13. Environment and inbox preflight comes before the ATP. Session Start §0.6 checks reachability (and, for email or auth stories, that the inbox can receive) before any ATP or Jira write, so a dead environment is caught with a stop and not at Stage 2 (S7).
14. Recalibrate severity before blocking a Story. A Story TC FAIL is not automatically a blocking defect. When the failing TC is security, auth or framework-default class (cookie flags, CSP/HSTS headers, SDK-by-design behavior), run the recalibration gate (`references/reporting-templates.md` §5.0) before firing `{{jira.transition.story.defect_reported}}` or blocked: state the framework-default or mitigation hypothesis, cite one verification fact and surface it to the user. A recalibrated finding becomes GO-with-debt (`PASSED WITH ISSUES`), not a blocker. The mechanical path stays the default for ordinary functional FAILs. Once the gate confirms a real blocking defect and the `defect_reported` to `blocked` transition fires, also create the Story `is blocked by` Bug issuelink through `{{jira.link_types.blocks.name}}` (the Bug `blocks` the Story; `references/reporting-templates.md` §5.1, mechanics in `agentic-qa-core/references/traceability-linking.md` §2, §4, §6), because the transition alone does not record the dependency edge.
15. Session env override. To test against an ad-hoc URL that is not in `.agents/project.yaml` (a broken staging, an ephemeral preview deploy, a hotfix branch URL), record it once in `test-session-memory.md` §Environment as `WEB_URL_OVERRIDE` / `API_URL_OVERRIDE`. While set, it beats the `project.yaml` active-env value for every stage and all four dispatches read it automatically, so do not re-thread it per briefing and do not write it to `project.yaml`. It differs from `active_env` switching, which picks a named environment.
16. Session-footer contract (at close). The final stage is not done until the two chat-facing blocks from `../agentic-qa-core/references/session-footer-contract.md` are printed.
    - First, the consolidated screenshot list: repo-relative paths verified on disk, bug annotations first, with each capture's path surfaced the moment it lands.
    - Second, the Session Footer listing the skills, MCPs and CLIs actually used and the testing levels touched, with explicit "none" for expected-but-untouched levels. Framing: execution.
    - Each stage report carries the five footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `testing_levels_touched`, `screenshots_captured`) and the orchestrator compiles the footer once at close. It is chat only, never in a Jira comment or ATR body.
    - Lessons noticed are proposed to `.session/<skill-slug>/<scope>/refinements.md`, never applied to a live skill (`../agentic-qa-core/references/skill-refinement-protocol.md`); the footer's `Refinements proposed:` line counts them.

---

## Cross-skill handoff: what this skill does not do

| Predecessor | Load this skill | Reason |
|-------------|-----------------|--------|
| Pre-sprint AC refinement on a batch of backlog Stories | `shift-left-testing` | Stage 0. If the Story passed through `/shift-left-testing` (label `shift-left-reviewed` with a dated label under 30 days old) AND its pre-sprint ATP body is in Jira, Stage 1 here short-circuits Phases 1-3 of `acceptance-test-planning.md` and continues from Phase 4. The labels alone open nothing (fail-closed, §0.0). The shift-left pass leaves the ATP in the `{{jira.acceptance_test_plan}}` FIELD only (field-first, no Test Plan item pre-sprint), and Stage 1 finds-or-creates the item from that field. The short-circuit reads the SYNCED `acceptance-test-plan.md`. A Story that skipped Shift-Left runs all phases in full. |

| After Stage 3 you need... | Load this skill | Reason |
|---------------------------|-----------------|--------|
| Formalize TCs in Jira/Xray, calculate ROI, decide Candidate / Manual / Deferred | `test-documentation` | Stage 4. This skill produces the inputs (outlines, execution evidence); `test-documentation` produces the regression backlog: `Test` work items (jira-native) or promotion into the Regression Test Plan (jira-xray), regression-worthy scenarios only. |
| Write the automated test code (KATA Page / Api and test file) | `test-automation` | Stage 5. Plan, Code, Review pipeline. |
| Explore a module, a flow or the whole product with no ticket | `exploratory-testing` | The ticket-free entry into the Execution stage; it reuses this skill's Trifuerza technique and bug template, not its ticket pipeline. |
| Run the regression or smoke suite in CI and emit a GO/NO-GO verdict | `regression-testing` | Stage 6. This skill's Stage 2 smoke is local and manual, not the CI suite. |
| Generate the business context maps (data / e2e / api) and the Master Test Plan (MTP Epic) | `project-discovery` (or the individual `project-context` modes `data` / `e2e` / `api` and `test-plan`) | Sprint-testing consumes these and does not create them. A contradicted section is proposed through the owning context skill's refresh, never edited from here. |

If Session Start reports that any project-wide context file is missing, stop and hand off to `project-discovery` (or the relevant command) instead of continuing.

---

## Pseudocode tags used here

| Tag | Resolves to | Defined in |
|-----|-------------|------------|
| `[TMS_TOOL]` | xray-cli skill, Atlassian MCP, or `{{TMS_CLI}}` | `AGENTS.md` Tool Resolution |
| `[ISSUE_TRACKER_TOOL]` | `acli`, Atlassian MCP, or `{{ISSUE_TRACKER_CLI}}` | `AGENTS.md` Tool Resolution |
| `[AUTOMATION_TOOL]` | playwright-cli skill (the only browser path) | `AGENTS.md` Tool Resolution |
| `[DB_TOOL]` | DBHub MCP or Supabase MCP | `AGENTS.md` Tool Resolution |
| `[API_TOOL]` | Schema read: OpenAPI MCP (read-only); execute: curl (token via `bun run api:login`) | `AGENTS.md` Tool Resolution + `agentic-qa-core/references/api-testing-doctrine.md` |
| `[ORCHESTRATION_TOOL]` | the multi-session orchestration layer, used only in fleet mode (sprint-wide, N>1 executors) | `agent-orchestration` (the tool owner; this skill names verbs, never commands) |

**Reads vs writes** (`agentic-qa-core/references/acli-integration.md` §"Reads vs writes"): detailed issue reads go through `bun run jira:sync-issues get <KEY> --include-comments` (or `jql "<query>"`) and the synced `.md`. Never use `acli workitem view` for custom fields (it returns `null`). Writes, transitions, links, bug creation and trivial summary or status lookups stay on `[ISSUE_TRACKER_TOOL]` (`/acli`). Traceability (the Story, ATP, ATR, TC link graph and Xray run status) stays on `[TMS_TOOL]`, `/acli` or `/xray-cli`, not on the sync.

Concrete tools (`bun`, `git`, `gh`) are used literally. Project variables like `{{PROJECT_KEY}}`, `{{DB_MCP}}` and `{{WEB_URL}}` resolve from `.agents/project.yaml` (env-scoped variables resolve to the active environment).

---

## References: read the narrow one for the situation

All references are self-contained. Load one at a time.

| Reference | Read when |
|-----------|-----------|
| `sprint-orchestration.md` | Sprint-wide mode: the session pair and the STP, resuming, the sprint log, dispatching stage sub-agents, stop, pause and `continue-from`. |
| `fleet-conductor.md` | Sprint-wide with more than one executor: worker identity, brief seeding, `launch.txt`, rounds, auth one-writer, browser isolation, claims, liveness, blocked tokens. Skip it at N=1. |
| `sprint-board.md` | A fleet run with the Sprint Board (`cli/sprint-board/`): the board at every stage, the brief block, the four channels, decision cards, evidence and fixtures, the watch-pass sentinel. Skip it at N=1. |
| `session-entry-points.md` | Initializing a session (any mode): project and module context, the PBI folder and `context.md`, the session dir and `test-session-memory.md`, Team Discussion extraction, the user-story and bug workflow order. |
| `acceptance-test-planning.md` | Stage 1: the ATP, Test Analysis, TC nomenclature `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]`, traceability creation and verification, the Bug Analysis variant. |
| `feature-test-planning.md` | Stage 1 at feature or multi-story level: the feature test plan, risk triage rubric, scenario decomposition, variable and test-data identification. |
| `exploration-patterns.md` | Stage 2: the smoke Go/No-Go playbook, UI on `{{WEB_URL}}`, API on `{{API_URL}}`, DB cross-validation via `{{DB_MCP}}`, evidence naming and capture, the edge-case checklist. |
| `reporting-templates.md` | Stage 3: the ATR body, the bug report template, QA comment templates (story PASSED/FAILED, bug Template C/D), evidence attachment. |
| `../agentic-qa-core/references/artifact-lifecycle.md` | Before any transition: lifecycle rows (§1), the three edges that do not exist (§1.1), assignee-at-create (§2), the unmapped-status fallback (§4), the light stage verifier (§5). |
| `../agentic-qa-core/references/session-management.md` | Phase 0, Session Start, checkpoints and Archive: the resume contract, plan.md and progress.md schemas, archive policy, the Engram checkpoint (this skill produces the `session/sprint-testing/<scope>/...` topic keys). |

---

## Anti-patterns

Each one points at a rule stated elsewhere and keeps its code because other files cite it.

- S1. Do not move a Story to {{jira.status.story.qa_approved}} (Ready For Release) without QA sign-off and a signed-off ATR snapshot for the audit trail.
- S2. Do not skip the Stage 1 Test Plan (ATP) item in Modality jira-xray: it is step 2 of the Set-first order, born from the `{{jira.acceptance_test_plan}}` field, and the three-edge check fails without it. ATS first, ATP second (§"Stage 1 Set-first order"). The one exception is `qa.methodology.gate_mode: light`, which may collapse the ATP item as a declared, per-sprint collapse written in the STP with its debt item.
- S3. Do not push results to Jira without an ATR snapshot: the QA comment summarizes, the ATR is the audit record.
- S4. Do not duplicate the ATR in a second store (Jira and Confluence). Pick one per the TMS modality (`testing.tms_cli` in `.agents/project.yaml`) and link to it.
- S5. Do not bypass the bug-triage tree (veto, risk score, then Severity and Root Cause): every failure is triaged before it becomes a Bug ticket.
- S6. Do not write ATP or ATR bodies in raw ADF JSON by hand, and do not assume `[ISSUE_TRACKER_TOOL]` converts Markdown: the CLI path stores a Markdown body verbatim, so the field renders literal `#` and `**` (measured on a real fleet run; see ADR-0006). Author Markdown, convert and validate it with `.agents/skills/acli/scripts/md-to-adf.ts`, then publish the ADF JSON through the matching surface (`agentic-qa-core/references/acli-integration.md`, `.agents/skills/acli/references/adf-authoring-style.md` §5, failure modes in `agentic-qa-core/references/jira-publishing-gotchas.md`). A plain-text comment needs no conversion.
- S7. Do not skip the smoke pass before triforce (UI / API / DB) exploration: a broken environment produces false-positive bugs.
- S8. Do not mix UI, API and DB findings in one bug ticket; file per layer or per root-cause cluster.
- S9. Do not reuse a PBI folder across tickets: contamination breaks evidence and traceability.
- S10. Do not move a ticket from Ready For QA to In Test before the user has confirmed the story explanation (`.agents/instructions/agent-ticket-work.md`).
- S11. Do not skip the promote between stages: each one writes a `progress.md` entry and feeds the next subagent's Context docs.
- S12. Do not file a bug without a reproducible path and evidence (screenshot, trace, log, HAR or DB row reference). "It failed for me once" is not a bug ticket.
- S13. Do not hardcode `customfield_NNNNN` IDs in ATP, ATR, QA comments or any reference here; resolve through `{{jira.<slug>}}` against `.agents/jira-required.yaml`.
- S14. Do not hand-write a Jira-mirrored `.md` in the PBI folder (`story.md`, `acceptance-criteria.md`, `acceptance-test-plan.md`, `acceptance-test-results.md`, `comments.md`, `feature-test-plan.md`, `module-context.md`, `test-cases/` and the rest). Write the content to the Jira custom field through `[ISSUE_TRACKER_TOOL]` (or, when the field is absent, a structured comment per `.agents/jira-required.yaml` `fallback:`; `module-context.md` goes to the `## Module Context (QA)` section of the Epic description), run `bun run jira:sync-issues get <KEY> --include-comments` and read the materialized file; a hand-written file in the gitignored PBI tree is invisible to every other machine. Only `context.md` and `evidence/` are hand-authored there, and `test-session-memory.md` lives under `.session/sprint-testing/<scope>/`.
- S15. Do not bury a hard-to-reverse test-architecture decision in a ticket plan. A decision earns a standalone ADR only when it passes all three gates: it is hard to reverse (test-data-isolation contract, auth-in-tests change, fixture topology, a flake-retry policy spanning 3+ tests or 2+ tickets), a future reader would be surprised by it without context, and it is a real trade-off between genuine alternatives. Promote such a decision to `.context/ADR/ADR-NNNN-<slug>.md` (append-only; supersede, never edit) and leave a `See ADR-NNNN` backlink in the plan's `## Technical Decisions`. A decision that fails a gate is ticket-local and stays in the plan. The AI drafts `Proposed`; the human approves (`agentic-qa-core/references/adr-doctrine.md` §1 and §2).
- S16. Do not create an ATR or retest Execution without a Test Environment (no ATR without environment): it resolves from `active_env` or the session env switch at creation, and an environment-less Execution fails the Stage-1 DoD gate (`agentic-qa-core/references/stage-gates.md`).
- S17. Do not keep the ATS, ATP and ATR test lists as independent id lists (Modality jira-xray): the ATS membership is the single source and the other two derive from it.
- S18. Do not leave an artifact in the status Jira's `create` transition dropped it in (ATP at `{{jira.status.test_plan.planning}}`, ATS at `{{jira.status.test_set.designing}}`, ATR at `{{jira.status.test_execution.active}}`, TC at `{{jira.status.test_case.draft}}`) after its owning stage closed: it tells the team the work never happened and is a reported defect of this harness. Fire the transition, or run the `agentic-qa-core/references/artifact-lifecycle.md` §4 fallback and ask.
- S19. Do not create a Test Plan, Test Execution, Test Set or `Test` without an `assignee`: Xray refuses membership edits on a Plan the caller does not own (`agentic-qa-core/references/artifact-lifecycle.md` §2). A find-or-create that returns someone else's artifact is never reassigned silently; ask first.

---

## Pre-flight checklist

- [ ] Phase 0 ran (read `.session/sprint-testing/<scope>/progress.md`); the user chose resume / restart / abort if prior state existed
- [ ] Mode asked and answered (`sprint-wide` / `single-issue`), never inferred from the invocation wording
- [ ] Sprint-wide: executors asked and answered (1 or N). N>1: `references/fleet-conductor.md` read and its checklist run. N=1: nothing about fleet mode applies and nothing about it was said to the user
- [ ] Sprint-wide: `.session/sprint-testing/sprint-<N>/plan.md` written with the JQL-resolved queue; skipped work types noted, not treated as blockers
- [ ] Session Start complete, user confirmed the story explanation
- [ ] `.session/sprint-testing/<scope>/plan.md` written (per `session-management.md` §6 schema)
- [ ] Project-wide context files present (if missing, hand off to `project-discovery`); PBI folder, `context.md`, session dir and `test-session-memory.md` created
- [ ] `.env` credentials loaded (no hardcoded passwords)
- [ ] Bug path: veto table evaluated before the risk score
- [ ] Sprint STP found-or-created (first ticket) or updated (Session Start §0.7; skip note if the work type is absent)
- [ ] Stage 1 artifacts created and verified through the three-edge check (`agentic-qa-core/references/traceability-linking.md` §Traceability verification). Jira-xray: Set-first order honored (ATP item from the field, ATS with all TCs linked to the Story through the `test` slug, Plan and Execution lists derived from the ATS membership)
- [ ] ATR / retest Execution carries the Test Environment (`active_env`): no environment, no ATR (S16)
- [ ] Stage 1 statuses left correct: TCs at `{{jira.status.test_case.ready}}` (parented to QA Test Repository), ATP at `{{jira.status.test_plan.ready}}`, ATS still `designing`, ATR still `active`, each with `assignee` = self (S18 / S19)
- [ ] Stage 2: smoke test first with Go/No-Go recorded, evidence under the ticket's `evidence/` folder
- [ ] Stage 3 ATR filled, QA comment posted, ticket transitioned
- [ ] Story approved: `{{jira.quality_token_usage}}` written (cumulative, one cycle comment) when a figure is available, or N/A stated; empty is valid (`sprint-orchestration.md` Stage 3 step 5b)
- [ ] Stage 3 closed the Stage-1 artifacts: ATR to `{{jira.status.test_execution.close}}`, ATS to `{{jira.status.test_set.close}}`, ATP to `{{jira.status.test_plan.completed}}` (or each unmapped slug went through the `artifact-lifecycle.md` §4 fallback and was asked, never silently skipped)
- [ ] Light stage verifier run at the close of each stage per `agentic-qa-core/references/artifact-lifecycle.md` §5, every line YES or a stated N/A
- [ ] Progress checkpoint appended after each Stage subagent returned; after Stage 3, archived to `.session/.archive/<YYYY-MM-DD>-sprint-testing-<scope>/` and `mem_session_summary` called
- [ ] Hand-off identified for Stages 4 / 5 / 6 if applicable
- [ ] Sprint-wide: sprint `progress.md` entry appended and mirrored as ONE STP comment after Stage 3 only, user OK'd the next issue
- [ ] Session footer and consolidated screenshot list printed in chat per session-footer-contract (never in a Jira comment)
