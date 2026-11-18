---
name: test-automation
description: "Plan, write and review KATA tests on Playwright and TypeScript, or explain existing automated tests read-only. Use when automating E2E or API tests, creating Page or Api components, ATCs or fixtures, reviewing test code for KATA, or breaking down what tests assert (break-down-tests). Not for running suites (regression-testing) or documenting TCs (test-documentation)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [testing-e2e, testing-api, testing-component, automation-cli, accessibility]
metadata:
  kind: workflow
  requires_capabilities: [db, api-schema]
  stage_owner: true

---

## Forbidden invocations

Do not invoke `/sdd-*` skills from this workflow. SDD is an optional ceremony the user installs by hand, and this skill ships self-contained. A refactor of KATA, fixtures, `cli/`, `scripts/` or the `api/schemas/` pipeline is a different job: exit and invoke `/framework-development`, which runs its own Plan, Code, Verify and Archive loop. `scripts/lint-skills.ts` rejects any `/sdd-` mention outside this section; governing text: `.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4.

# Test Automation: Plan, Code, Review

This skill produces KATA-compliant automated tests for an existing Playwright + TypeScript project in three phases, always in this order: **Plan, Code, Review**. A test written without a plan duplicates components and misses risk the acceptance criteria never mention.

KATA (Komponent Action Test Architecture) rewires the usual Page Object pattern, and tests written the "standard" way are rejected at review. Load the reference for the area you are about to write in first.

---

## Dependencies

Requires `agentic-qa-core`. Loads on demand:

- `agentic-qa-core/references/test-design-doctrine.md`: read it before planning which ATCs to write from acceptance criteria. It governs the 1:N ATC derivation, the formal-technique triggers (including BVA, which KATA's EP-merge rule does not replace) and the floor-not-ceiling coverage model.
- `agentic-qa-core/references/briefing-template.md`, `agentic-qa-core/references/dispatch-patterns.md`, `agentic-qa-core/references/orchestration-doctrine.md`, `agentic-qa-core/references/session-management.md`, `agentic-qa-core/references/preflight-gate.md`, `agentic-qa-core/references/adr-doctrine.md`: cited inline by the sections that use them.

## Compact Rules

**Test-design doctrine (binding, full canon: `agentic-qa-core/references/test-design-doctrine.md`):**

- Critical Rule #18, no comments in code by default: new and edited code carries no comments except a toolchain directive (`eslint-disable-next-line <rule> -- <reason>`, `@ts-expect-error`, `LINT.IfChange`/`LINT.ThenChange`) or one line of WHY the code cannot express and a reader would otherwise get wrong. No JSDoc blocks, section banners, narrated steps or example TODOs; teaching goes to docs and decks. Put this rule in component 7 of every briefing that writes tests or components.
- "All ACs covered" is the floor, not the success bar. The ATC set also covers risk beyond the AC: invalid and boundary inputs, auth and error paths, state transitions, and anomalies the AC is silent on.
- 1:N is the default: one AC maps to several ATCs. EP-merge collapses same-behavior inputs inside one partition into a parameterized ATC; it never collapses across distinct partitions, boundaries or states. BVA cases are required wherever a range, limit, length or date window exists, because EP alone misses off-by-one.
- Apply techniques by trigger: EP always; BVA on ranges and limits; State-Transition for stateful flows; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction).
- Same-behavior data variants become ONE parameterized `@atc` per partition, not N ATCs; split only when the action, outcome or state differs (doctrine §"Part 2.5"). Run the Test-Design Checklist before finalizing the plan.

**Test-automation operational rules:**

- Plan, Code, Review always run in order, even for a one-test regression, behind the TC source gate (also first on every resume). Only `Candidate` TCs are automated. In scope are the Tests at `candidate` whose `Verdict signed:` ROI comment has Jira `created` AND `updated` older than this run's start. Manual and recorded-Deferred Tests are listed out of scope. Stop and route to `/test-documentation` only on a named TC that is not a signed Candidate, a Test with no verdict, or zero signed Candidates. The run never signs, never waits for a signature, never creates a Test, never scores ROI and never fires a verdict transition. Signed ROI is a hard gate and never collapses.
- A TC reaches `automated` (labels `+automated -automation-candidate`) only when its code is on the production branch (`git_strategy.branches.production`). A merge into an integration branch or a suite trunk is not `automated`. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §6.
- Fixtures: API-only uses `{ api }` (no browser), UI-only `{ ui }`, hybrid `{ test }`. An ATC never calls another ATC; a reusable chain goes in a Steps module. At most 2 positional params (3+ take an object param). Locators stay inline until 2+ uses. Imports go through aliases, never relative paths. Public methods fail fast; utilities fail silently (return null).
- Check `kata-manifest.json` before adding a component or an ATC (the anti-duplication gate).
- Mode comes from `$ARGUMENTS` (see Mode routing): `explain` or `automate`; ask when it could be either.
- Before a step that uses a declared MCP capability (`metadata.requires_capabilities`: `db`, `api-schema`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: when no available tool provides it, stop and name the capability and how to enable it. No silent fallback.
- Review runs on two axes besides the three verifiers: spec compliance and standards, checked by separate subagents, with a lying-test check on every new assertion (Phase 3).

**Read full SKILL.md when**: writing KATA component code, choosing fixtures for a hybrid flow, or applying the Phase 3 review checklist.

---

## Mode routing

Resolve the mode before any readiness preflight or session workflow. When the first token of `$ARGUMENTS` matches a mode below, that token is the mode and the rest is forwarded to it unchanged (`/test-automation explain tests/e2e/login.spec.ts`). Otherwise `automate` is the default for plain automation work, and an ambiguous request gets a question.

- `explain`: selected by a first token `explain`, by the `break-down-tests` trigger phrase, or by an explicit request to explain existing automated tests. Forward the remaining `$ARGUMENTS` unchanged, load only `references/explain-tests.md`, produce its HTML breakdown, then stop. The mode is sealed and read-only: its only writes are the two report files `.context/reports/test-breakdown/<scope>.json` and `<scope>.html` (gitignored, rendered by `bun run tests:explain:render`). It creates no session state, runs no Plan -> Code -> Review, edits no tests or product code, does not regenerate `kata-manifest.json`, and makes no Jira or TMS call.
- `automate` (default): all normal KATA planning, coding and review triggers. Continue with the workflow below.

When the invocation could mean either explanation or implementation, ask which outcome is wanted. A read-only explanation request never becomes implementation on inference.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional. The orchestrator also applies the per-stage **Definition-of-Done gates** in `agentic-qa-core/references/stage-gates.md`: verify a stage's DoD (planning stages include the Test-Design Checklist) BEFORE recording its progress checkpoint and advancing.

This skill is per-scope: `<scope>` = `<JIRA-KEY>` (ticket-driven, bug-driven, or discovery-driven per gap) or `<module-slug>` (module-driven, or discovery-driven per module). Scope names: `agentic-qa-core/references/discovery-driven-doctrine.md` §2. Session state lives at `.session/test-automation/<scope>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. The session `plan.md` is a thin index that cites the canonical domain artifacts (`spec.md`, `automation-plan.md`, `atc/*.md`) under the Epic's `test-specs/` tree (`.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/`). Domain content stays in the PBI tree and is not duplicated.

Every dispatch follows the 7-component briefing in `.agents/skills/agentic-qa-core/references/briefing-template.md` (`AGENTS.md` §3) and the pattern in `.agents/skills/agentic-qa-core/references/dispatch-patterns.md`. The orchestrator also applies the Definition-of-Done gates in `agentic-qa-core/references/stage-gates.md`: a stage's DoD (planning stages include the Test-Design Checklist) is verified before the progress checkpoint is recorded. Plan keeps the KATA architecture reads out of the orchestrator, Code isolates the multi-file edits, and Review fans out independent verifiers and reviewers.

| Stage                                          | Pattern              | Subagent role                                                                                                                  |
|------------------------------------------------|----------------------|--------------------------------------------------------------------------------------------------------------------------------|
| Plan (`spec.md` + `automation-plan.md`)        | Single               | one Plan subagent returns the two artifacts, keeping KATA architecture reads out of the orchestrator                            |
| Code (writing E2E or API tests)                | Sequential           | one Code subagent per scope unit (module = 1 per TC; ticket = 1 total); the many-file edits stay in its context                 |
| Review: `bun run test`                         | Parallel (sub-stage) | one Verifier subagent runs the test suite                                                                                       |
| Review: `bun run types:check`                  | Parallel (sub-stage) | one Verifier subagent runs typecheck                                                                                            |
| Review: `bun run lint:check`                   | Parallel (sub-stage) | one Verifier subagent runs lint                                                                                                 |
| Review: spec compliance                        | Parallel (sub-stage) | one Spec reviewer checks the diff against the approved plan and the TC bodies, and hunts lying tests                            |
| Review: standards                              | Parallel (sub-stage) | one Standards reviewer checks the diff against the KATA standards in the review references                                      |
| Review aggregation + merge/reject decision     | Single               | inline: the orchestrator reads the five reports and decides                                                                     |

- Each Code subagent returns the changed files with a one-line summary each. The orchestrator reads the summary, not the diffs, and runs `git diff` inline only when the user wants them.
- On any Verifier failure, stop and return the failing report verbatim. Do not auto-fix the test code and do not re-dispatch Code without approval (`.agents/skills/agentic-qa-core/references/orchestration-doctrine.md`). A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.
- Every Plan and Code briefing lists `kata-manifest.json` (root) under "Context docs" (component 2). Without it the subagent scans `tests/components/**` itself and may propose duplicates (Critical Rule #12 in `AGENTS.md`).

---

## Inputs: read these first, in this order

The reading order for an agent starting cold. Stop earlier when later inputs add nothing for the scope.

1. `kata-manifest.json` (root): the registry of every Component (`api[]`, `ui[]`) and every `@atc('TICKET-ID')` ID, and the anti-duplication gate (Critical Rule #12 in `AGENTS.md`). Load it before proposing any new `Page`, `Api`, `Steps` module or `@atc` ID.
2. `.agents/skills/test-automation/references/kata-architecture.md` + `.agents/skills/test-automation/references/typescript-patterns.md`: the doctrine for the KATA layers (TestContext / Base / Domain / Fixture), ATC identity, fixture selection, import-alias rules and params contracts.
3. `tests/components/`: the Api, Page and Steps shape on disk. It sets naming, the helper-versus-ATC split and fixture registration patterns to follow.
4. The Story's `implementation-plan.md` (dev plan) and the ATP under `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/`. They are Jira-synced, read-only caches: Jira is the source of truth, so never hand-write them. Materialize with `bun run jira:sync-issues get <STORY-KEY> --include-comments`, then read the entire synced Story folder: every per-field `.md` (`story.md`, `acceptance-criteria.md`, scope, business rules and the rest) plus `comments.md`. Skipping any of them produces incomplete ATCs. The ATP read depends on the modality (resolve it via `.agents/project.yaml` `testing.tms_cli`, the same gate as `/test-documentation` §Phase 0):
   - Modality jira-native: the ATP is the Story field `{{jira.acceptance_test_plan}}`, synced as `acceptance-test-plan.md` in the Story folder by the same `jira:sync-issues get <STORY-KEY> --include-comments`.
   - Modality jira-xray: the ATP is the Test Plan issue `description`, read with `bun run jira:sync-issues get <ATP_KEY>` into `test-plans/ATP-<KEY>-<slug>.md`; per-TC run results come from `[TMS_TOOL]` (xray-cli), not the sync. A Plan or Execution whose title does not follow the ladder grammar keeps the legacy `TESTPLAN-` / `TESTEXEC-` / `RETESTEXEC-` prefix.

   The dev `implementation-plan.md` carries the implementation approach and, when `/test-documentation` produced it, the per-TC candidate verdict and component mapping. Cite it from the session `plan.md`; it is not the automation plan (`test-specs/<scope>/automation-plan.md`) you write in Phase 1.
5. The Story's AC, the source of truth for the scenarios that become ATCs, read from the same synced `.md` files. `[ISSUE_TRACKER_TOOL]` `view` returns `null` for `customfield_*`, so it cannot supply them. When a field is absent from the instance, the sync emits a pointer stub and the content lives in comments or the description per `.agents/jira-required.yaml` `fallback:`. A TC body is the `Test` issue `description`, synced in both modalities via `bun run jira:sync-issues get <TEST-KEY>`; the Xray Gherkin / Test-Steps plugin field mirrors it and is not synced, so read the synced TC `.md` for Gherkin and steps.
6. `api/schemas/`: the OpenAPI-derived TypeScript types. Refresh with `bun run api:sync` when stale. Required for any Api component that touches a new endpoint.
7. `.env`: credentials (`LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD` and the like), read through `config.testUser` from `@variables`. Never hardcode or guess one.
8. `agentic-qa-core/references/artifact-lifecycle.md`: the TC status ladder this skill owns (`candidate`, `in_automation`, `pull_request`, `automated`), the unmapped-status fallback (§4) and the light stage verifier that closes Review (§5). Read it before firing any transition.

---

## Readiness Preflight Gate (runs before Phase 0)

> Full doctrine: `agentic-qa-core/references/preflight-gate.md`. It runs first, before the resume check and the scope picker. Two laws: (1) args-as-answers: the scope, the ticket key and "API test" versus "E2E test" are provided args, so ask only the gaps; (2) probe, do not assume. Surface gaps and REDs as ONE `AskUserQuestion` checklist, self-fix with approval and an explanation, and stop on any blocking RED. It asks whether tools and environment are ready to write and run code, which differs from the anti-duplication "Pre-flight checklist" in Phase 1. The generic baseline (env resolution, test-user creds, secret and restart handling, output contract) is reference §3.1; below is this skill's capability delta.

| Capability | Need | Why here |
|---|---|---|
| Framework adapted (artifacts present) | REQUIRED | Project ATCs cannot be written against the generic `Example*` scaffolds the boilerplate ships. Probe the reference §4 ADAPTED signals; still generic means stop and tell the user to run `/project-discovery` then `/test-framework-adaptation` themselves. The gate never auto-runs them. |
| Dev toolchain | REQUIRED | The Review gate runs `bun run test` / `bun run types:check` / `bun run lint:check`. Resolve them at t=0, not at Phase 3. `bun install` if a dep is missing. |
| `kata-manifest.json` clean | REQUIRED | Anti-duplication source of truth (Critical Rule #12). `bun run kata:manifest:check` clean before proposing components/ATCs; `bun run kata:manifest` if stale. |
| Active env + test-user creds | REQUIRED | Authored tests run live against `<<ACTIVE_ENV>>`. Env reachable + `.env` creds for the env (per role if multi-role). |
| Playwright browsers | REQUIRED | `bunx playwright` resolves + chromium installed (`bun run pw:install`). |
| OpenAPI MCP (schema read-only) + `api/schemas/` synced | SCOPE: API/integration tests; needed at **Phase 1 Plan** too | Phase 1 explores endpoints (via the `openapi` MCP, schema-read-only) to design ATCs and classify test data. Api components consume OpenAPI-derived types (`api/schemas/`; refresh `bun run api:sync`); authenticated test-code calls use the Playwright API fixture (`.auth/api-state.json` from `bun run api:login`), with no token or MCP injection and no restart. |
| DBHub MCP | SCOPE: data setup/validation; needed at **Phase 1 Plan** too | Phase 1 explores the schema (via the `dbhub` MCP) to design data fixtures (Discover / Modify / Generate). `dbhub` answers a schema probe; `DBHUB_*` in `.env`. Unset means fill `.env` and RESTART. |
| Business context map per touched level | REQUIRED, per level in scope, needed at **Phase 1 Plan** | E2E/UI uses `business-e2e-context`, API uses `business-api-context`, DB/data setup uses `business-data-context`: the skill exists AND `bun run context:map <slug> --list` prints sections, not the placeholder notice. RED means stop and hand the user `project-context` mode `e2e` / `api` / `data`; a missing skill means `bun sync`. |
| Issue-tracker (`[ISSUE_TRACKER_TOOL]`) | SCOPE: ticket/bug/discovery-driven | ATP + AC reads via `bun run jira:sync-issues`; TMS modality for the ATP source. Pure module-driven from an existing spec may not need it. |

Surfaces (UI, API or both) follow the planning scope and the ATCs Phase 1 designs; they are never a user question (reference §5). When the baseline and the surface tools the scope needs are GREEN, continue to Phase 0.

---

## Phase 0 — Resume check (MANDATORY, inline)

Before picking the planning scope, run the session resume contract from `agentic-qa-core/references/session-management.md` §4:

1. Determine the prospective `<scope>` from the invocation context (ticket key, bug-driven TC, or module slug — see "Pick the planning scope first" below).
2. Check `.session/test-automation/<scope>/progress.md`.
3. If it does NOT exist → proceed to scope picker + Phase 1.
4. If it DOES exist:
   - Read `plan.md` (thin index) + the tail of `progress.md`.
   - Read the cited canonical `spec.md` / `automation-plan.md` / `atc/*.md` under `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/` for the domain content.
   - Surface to the user: last completed phase (Plan / Code / Review) + next phase + open Review findings if any.
   - Offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-test-automation-<scope>-aborted/` before proceeding.
   - On `resume`, run the TC source gate (below) FIRST, before the phase it resumes: a plan written before the gate existed may list unsigned TCs.

Phase 0 is inline (no subagent).

---

## Pick the planning scope first

Every automation session starts by choosing its planning scope. Pick once, then follow the Plan, Code, Review pipeline. The scope names the origin; Macro, Medium and Micro only size the work package (canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §2).

| Scope | Input | Output | Use when |
|-------|-------|--------|----------|
| **Module-driven** (Macro) | A module name + list of candidate TCs | One module spec + N ATC specs | Batch-automating an entire module (10+ tests). First pass on a new area. |
| **Ticket-driven** (Medium) | A single ticket/story ID with scenarios | One implementation plan for that ticket | Automating one user story end-to-end. Default for sprint work. |
| **Bug-driven** (Micro) | One specific TC (often after a bug fix) | One ATC implementation plan | Adding a single regression test after a fix. Smallest unit of work. Legacy name: Regression-driven. |
| **Discovery-driven** (Macro per module; Medium or Micro per gap) | The signed Candidate TCs of a coverage Tech Story (no Story behind them) | Same outputs as the matching size above | Covering behaviour already in production that no Story specified. Its TCs passed the oracle rule and the ROI upstream; a bare gap is not an input. |

When in doubt, ask which scope; several TC IDs in a briefing do not by themselves mean "module". These scopes consume the `Candidate` verdicts from `/test-documentation` (Stage 4), which shares the scope names. Only `Candidate` (`to_be_automated`) TCs reach automation; `Manual` and `Deferred` are terminal. Candidates from an `ad-hoc / exploratory` documentation session enter under whichever scope fits: a module batch, or a Micro package for a single TC.

---

## TC source gate (Phase 0 by TC source, before Plan)

The gate runs after the scope is picked and before the first planning read, and again first on every resume, whatever phase the resume lands on. The TCs come from the TMS, never from this skill. Before reading Jira, append `## Phase 0 — TC source gate — <ts>` to `.session/test-automation/<scope>/progress.md`: that timestamp is this run's start.

| Scope | Tests looked at |
|---|---|
| ticket-driven | the Story's Tests (its `ATS:` Test Set membership, or its direct TC→Story links where no ATS can exist) |
| bug-driven | the Test linked to the bug (`tests / is tested by`) |
| module-driven | the module's Tests at `{{jira.status.test_case.candidate}}` (JQL by component + status) |
| discovery-driven | the Tests of the coverage Tech Story's `ATS:` Test Set |

In scope are the Tests at `{{jira.status.test_case.candidate}}` (or `in_automation` / `pull_request` on a resume) whose ROI comment carries a `Verdict signed:` line (format and the sign-only pass: `test-documentation/references/tms-conventions.md` §9) and whose Jira `created` AND `updated` timestamps both predate this run's start. Read status and comments this run through `[ISSUE_TRACKER_TOOL]`: the work item view of the `comment` field returns each comment's `id`, `created` and `updated` (the comment-list output does not), and the sync never writes a Test (`test_case` declares `sync: never`). A signature written or edited during this run keeps the gate closed, and a local file, plan, label or value this session wrote is not evidence (fail-closed, `agentic-qa-core/references/orchestration-doctrine.md`). On the person's own tracker token this is the strongest evidence available; a code check is the follow-up (`agentic-qa-core/references/discovery-driven-doctrine.md` §8).

Out of scope, listed in the plan and never a stop: Tests at `{{jira.status.test_case.manual}}`; Tests at `{{jira.status.test_case.ready}}` with a recorded Deferred verdict (their ROI comment, or the mirrored Deferred list on the coverable); Candidates without a valid signature, listed for the sign-only pass.

Stop and report, routing the scope (Story key, coverage Tech Story key or gap ids) to `/test-documentation`, only when a TC the request names is not a signed Candidate, a Test in the list has no verdict at all (no ROI record: undocumented or still in design), or the scope yields zero signed Candidates. This skill never creates a Test to fill a gap, never runs the sign-only pass and never waits for it inside the run it gates: a later run re-reads Jira. Signed ROI is a hard gate with no collapse path (`agentic-qa-core/references/stage-gates.md` §Automation).

## Batch mode (fleet), an optional second executor

A batch (module-driven, or several ticket-driven scopes queued together) runs sequentially in one session by default: one Work Package at a time, Plan, Code and Review each. A batch fleet, several persistent sessions working different Work Packages at once under a conductor, is opt-in: enter it only when the user asks, or when the batch holds 3+ Work Packages that touch disjoint modules. Below is scoping only; the launch and lifecycle transport lives in `/agent-orchestration` (`[ORCHESTRATION_TOOL]`).

- A Work Package (WP) is one delivery unit, one `test-specs/<ID>/` spec (`spec.md` + `automation-plan.md` + `atc/*.md`). Sprint origin: the `Candidate` TCs of one Story. Discovery origin: the signed Candidates of a coverage Tech Story. The conductor runs the TC source gate before partitioning, and a batch is a list of WPs, never of files.
- Partition by module, not by ticket. One worker owns every WP that touches a module's components, and WPs sharing a module run sequentially inside that worker. Two workers on one module would collide in the Pages, Apis and fixtures they share, the files with the least merge tolerance.
- One worktree per worker. This skill writes code, and two sessions in one checkout contend on the git index even when their files are disjoint. Branch and PR follow `git_strategy` (`sdet` = one trunk, see `.agents/skills/git-flow-master/references/sdet-integration-trunk.md`).
- The conductor regenerates `kata-manifest.json` per integration (`bun run kata:manifest`). It is generated output: never hand-merge it and never resolve it as a text conflict.
- The batch runs with or without an orchestration binary: the conductor always writes the launch file (one self-contained line per worker), launches it with the binary or leaves it for the human to paste. The payload is the same, and the absence is not reported.

Full protocol (partition algorithm, collision table, conductor-only operations, integration order, per-worker brief): `references/batch-fleet.md`.

---

## Workflow: Plan, Code, Review

```
Phase 1: Plan         -> Phase 2: Code             -> Phase 3: Review
(spec / plan)            (component + test file)      (KATA compliance)
        |                         |                             |
  .context/PBI/epics/        tests/components/**         Review checklist
    EPIC-<KEY>-<slug>/       tests/e2e/** or                (pass/fail)
    test-specs/<scope>/      tests/integration/**
    spec.md
    automation-plan.md
    atc/*.md                 Register in fixture
```

Code starts after the Plan is written and approved, and a ticket closes after Review passes.

### Phase 1: Plan

Load `kata-manifest.json` (root) before any planning: it shows what to reuse and which `@atc('PROJ-XXX')` IDs are taken (Critical Rule #12 in `AGENTS.md`, enforced by the husky pre-commit gate).

**Pre-flight checklist** (anti-duplication, run before writing the plan):

- Cross-check every proposed TC ID against `components.api[].atcs[].id` and `components.ui[].atcs[].id`; a match means the TC is already automated, so re-scope or reuse.
- Cross-check every proposed Component name against `components.api[].name` and `components.ui[].name`; a match means extend that class.
- When a Steps method or an ATC already covers the flow, extend it rather than rebuild.

Write the canonical domain plan files for the chosen scope under the Epic's `test-specs/` tree, `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/` (`spec.md`, `automation-plan.md`, `atc/*.md`). They are hand-authored, non-Jira files committed to git. The automation `automation-plan.md` is distinct from the Story-folder dev `implementation-plan.md` (Jira-synced, read-only). The plan answers:

- Which scenarios become tests, which become ATCs, and which are shared preconditions (Steps)?
- Which components exist already (`tests/components/api/*Api.ts`, `tests/components/ui/*Page.ts`) and which need creating?
- What test data is required, classified as Discover, Modify or Generate (never assume data exists in staging)?
- Which fixture does the test use (`{api}`, `{ui}` or `{test}`), and does a shared precondition call for a Steps class (`tests/components/steps/*Steps.ts`)?
- Which TMS ATC IDs map to which component methods?

Also write the session index `plan.md` at `.session/test-automation/<scope>/plan.md` per `agentic-qa-core/references/session-management.md` §6: a thin index (Goal, Inputs citing the artifacts above, Approach, Phase breakdown table, Risks, Verification checklist, Cross-references) that points to the domain content and does not copy it.

Dispatch is **Single** (§Subagent Dispatch Strategy); the full briefing is in `references/planning-playbook.md` §Plan dispatch.

Present the plan to the user and wait for approval before coding. After approval, the orchestrator appends `## Phase 1 — Plan — <ts>` with `status: completed`, `artifacts_touched: [list of domain + session files]` and `next: Phase 2 — Code` to `.session/test-automation/<scope>/progress.md`.

### Phase 2: Code

Dispatch is **Sequential**, one subagent per scope unit, which loads `references/e2e-patterns.md` and `references/api-patterns.md` per scope.

Every Code subagent loads `/playwright-best-practices` (community, project-installed) for generic Playwright and TypeScript craft (flaky-test fixes, POM versus fixtures, axe-core, auth, fixture lifecycle, perf budgets, i18n, component testing), alongside `/test-automation` for the KATA-specific rules (ATC identity, inline locators, fixture selection). Add `/playwright-cli` only when the subagent must drive a real browser session while exploring.

**Open the TC lifecycle first.** Before the first line of code, move every in-scope TC out of `{{jira.status.test_case.candidate}}`: `[ISSUE_TRACKER_TOOL] Transition: {{jira.transition.test_case.start_automation}}` to `{{jira.status.test_case.in_automation}}`. A TC left at `candidate` while its code is being written tells the team nobody picked it up. An unmapped slug takes the `agentic-qa-core/references/artifact-lifecycle.md` §4 fallback (ask, never skip silently).

Implement in this order:

1. Types at the top of the component file (payloads, responses, domain DTOs).
2. The component class, extending `ApiBase` or `UiBase`. Helpers first (no decorator), ATCs second (`@atc('TICKET-ID')`).
3. Register the component in `tests/components/ApiFixture.ts` or `UiFixture.ts`. Steps classes (`tests/components/steps/*Steps.ts`) are not registered in any fixture: tests and setup files instantiate them directly (see `ExampleSteps.ts`).
4. The test file, under `tests/e2e/{module}/` or `tests/integration/{module}/`, using the correct fixture.
5. Run and verify in this order:

```bash
bun run test <path/to/new.test.ts>   # does it pass?
bun run types:check                   # tsc --noEmit, no errors
bun run lint:check                         # ESLint, no errors
```

Any failing step gets fixed before Review.

6. Signal it in the TMS, per TC:
   - There is no separate automated Test issue. The `@atc('<TC_KEY>')` id is the TC's key, so the TC itself is the automated test: each run result is recorded on the TC (one Xray run per ATC, imported by its key; the import never creates a Test, `regression-testing/references/ci-cd-integration.md`). Do not create a second "automated" Test and do not link one to the TC.
   - Labels are not optional: add `automated` on the `Test` and remove `automation-candidate`; the two are mutually exclusive (`test-documentation/SKILL.md` §Labels). Flip them when the TC reaches AUTOMATED (see §Git & TMS handoff: the `merged` transition once the code is on the production branch with CI green), not on a merge into an integration branch or a suite trunk.

```
[ISSUE_TRACKER_TOOL] Update work item: {TC_KEY}  labels: + automated  - automation-candidate
```

**Progress checkpoint**: after each Code subagent returns (per scope unit: one per TC for module-driven, one total for ticket-driven), the orchestrator appends a phase entry to `.session/test-automation/<scope>/progress.md` per `agentic-qa-core/references/session-management.md` §7. For module-driven scope, a mid-batch resume reads the entries and skips ATCs already coded.

#### AI-readable verification (optional, recommended)

Run Allure (`bunx allure`, version pinned in `package.json`) in agent mode to get a markdown report of the new test that needs no HTML parsing:

```bash
bun allure:agent           # `bunx allure agent -- bunx --bun playwright test`, through the env launcher
```

Allure is a devDep, so no global install is needed. Use it to confirm the test exercised the expected ATC (the summary lists each `@atc('TICKET-ID')` block with its status), for a scope check before Phase 3, or to read a fixture or locator mismatch as structure instead of a raw stack. For human review of the same run:

```bash
bun allure:run             # `bunx allure run -- bunx --bun playwright test`, through the env launcher (full HTML report)
bun allure:open            # serve the last generated report locally
```

`regression-testing` owns CI and suite-level reporting (`bun allure:generate`, `bun allure:watch`).

### Phase 3: Review

Dispatch is **Parallel**: the three Verifiers (tests, types, lint) and the two reviewers (spec, standards) go out in one tool-call block. Verifier briefings are in `references/review-checklists.md` §Parallel verification dispatch. A failed checklist item is a blocker, and a clean review is the merge gate. `references/review-checklists.md` holds the full lists (E2E and API overlap but differ).

**Two axes, two subagents.** A diff can pass one axis and fail the other: code that follows every KATA rule but automates the wrong behavior, or a test that checks exactly what the TC says but breaks the layers. One reviewer holding both lets either hide the other, so each gets a fresh context and its own report. The orchestrator puts the diff command (`git diff <branch-base>...HEAD`) in both briefings and does not merge or rerank the reports.

The two briefs, what each reviewer reads and the lying-test checks (LT-1 and LT-2 with the Spec reviewer, LT-3 with the Standards reviewer) are in `references/review-checklists.md` §"Two-axis review". A test that passes while the product is broken is worse than none, because the suite reports coverage that does not exist, so every new assertion gets the check. A bug-driven test also has to fail on the unfixed code: red before green.

**Required separate verifier.** Before merge, run `/pr-review-lead` or `/judgment-day` against the diff in a clean context (a fresh session or subagent that did not write the code). It applies to every change: Automation is the only stage with a mandatory separate verifier (`agentic-qa-core/references/stage-gates.md`, contract table), and its autonomy rises from 2 to 3 inside the approved plan, so the check on the way out is harder than the freedom on the way in. `/judgment-day` runs two blind judges in parallel and approves only when both agree (`.agents/skills/judgment-day/SKILL.md`); `/pr-review-lead` is a QA-lead-style review grounded in KATA doctrine. Skipping it is a Review DoD failure.

**Light stage verifier** (closes the Automation stage): run the template in `agentic-qa-core/references/artifact-lifecycle.md` §5. Stage-specific lines:

```
[ ] Every in-scope TC at {{jira.status.test_case.in_automation}} or beyond (start_automation fired)
[ ] Every ATC carries its TC's own key (`@atc('<TC_KEY>')`); no separate automated Test issue created
[ ] Labels flipped only at the status they belong to (+automated / -automation-candidate
    at `merged`, never at a trunk or integration merge)
[ ] No TC left at {{jira.status.test_case.candidate}} with code already written for it
[ ] No TC at {{jira.status.test_case.pull_request}} whose spec is already on the production branch
    (backstop for the post-promotion `merged` pass, discovery-driven-doctrine.md §6)
[ ] Any unmapped slug went through the §4 fallback (asked), never a silent skip
```

**Progress checkpoint and archive.** Phase 3 returns ACCEPT when all three Verifiers exit 0 and neither reviewer reports a blocker. The orchestrator then appends `## Phase 3 — Review — <ts>` with `status: completed` and `next: stop` to `.session/test-automation/<scope>/progress.md`, and archives per `agentic-qa-core/references/session-management.md` §8: it moves `.session/test-automation/<scope>/` to `.session/.archive/<YYYY-MM-DD>-test-automation-<scope>/` (two-file dir preserved) and calls `mem_session_summary` including the archive path. On REJECT the archive does not run, and the working directory stays for debugging.

#### Git & TMS handoff (suites with a trunk or an integration branch)

This skill stops at a clean local review. It does not create branches, push or open PRs: that is `/git-flow-master`'s job. When the repo's git strategy is `sdet` (the standing mode for chained test-automation suites), each ticket flows through the per-ticket loop in `.agents/skills/git-flow-master/references/sdet-integration-trunk.md`:

- The Phase 3 ACCEPT gate is the skill's local validation gate. Under `sdet` it must pass on both the `local` and `staging` environments before push, so re-run the suite against each (`active_env` per `.agents/project.yaml`). The Verifiers are local-only; Sanity CI on the branch belongs to `/git-flow-master` and `/regression-testing`.
- After ACCEPT, surface the explicit handoff: _"Local gate green. Ready for `/git-flow-master`: cut `test/{KEY}-{slug}` from the integration trunk, push, Sanity-CI, PR into the trunk, merge `--no-ff`."_ Do not auto-invoke git operations.
- Append the Git Ledger line to the suite's `progress.md` after each branch action (orchestrator-written, append-only), so a resuming session knows how the trunk was left. Schema: `../agentic-qa-core/references/session-management.md` §7 "The Git Ledger"; what to write: `.agents/skills/git-flow-master/references/sdet-integration-trunk.md` §Resume.
- The TC lifecycle anchors to the ticket-branch PR, not to the final `trunk → main` PR. The full ladder this skill owns (canon: `agentic-qa-core/references/artifact-lifecycle.md` §1, Test row):

  | Moment | Transition | Status after |
  |---|---|---|
  | Phase 2 — Code opens | `{{jira.transition.test_case.start_automation}}` | `{{jira.status.test_case.in_automation}}` |
  | ticket PR opens into the trunk | `{{jira.transition.test_case.create_pr}}` | `{{jira.status.test_case.pull_request}}` |
  | the code reaches the production branch (`git_strategy.branches.production`; the final suite PR under `sdet`), CI green there | `{{jira.transition.test_case.merged}}` | `{{jira.status.test_case.automated}}` |

  Merging into the trunk is not `automated`, and the same holds for any strategy with an integration branch (`main-integration` and the like): `automated` means the code is on the production branch (`agentic-qa-core/references/discovery-driven-doctrine.md` §6). Execute the transitions through `/test-documentation` and `[ISSUE_TRACKER_TOOL]` (`merged` through its mode `post-promotion`, once the spec is on the production branch). Resolve every slug through `.agents/jira-workflows.json`, and on an unmapped slug run the `artifact-lifecycle.md` §4 fallback instead of skipping.

---

## Waiting points and who holds them

`agentic-qa-core/references/decision-protocol.md` decides what reaches a person; this table gives each wait its path.

| Wait | A person is present | Supervised worker | Routine with nobody |
|---|---|---|---|
| Readiness gaps and REDs | one `AskUserQuestion` checklist | `ask` the conductor | the brief answers the args; a blocking RED stops the run and is reported |
| Resume, restart or abort (Phase 0) | offer the three | the conductor picks | resume when `progress.md` exists; restart or abort only when the brief says so |
| Scope or mode is ambiguous | ask | `ask` the conductor | the brief names it; otherwise stop at the scope picker and report |
| Plan approval | present the plan and wait | the conductor approves | a brief that approves the plan counts; otherwise write the plan (local, reversible), stop and report |
| Verifier or reviewer failure | return the report verbatim | return it to the conductor | same, no auto-fix |
| ADR candidate (gotcha 17) | ask one question | `ask` the conductor | record it `Proposed` and report |
| Jira writes: lifecycle transitions and label flips | after plan approval, as the steps say | same | only when the brief covers them; otherwise stop before the write and report |
| Git handoff | surface the handoff line | tell the conductor | surface it in the report; no branch, push or PR |

---

## Fixture selection (load-bearing on every invocation)

The fixture decides whether a browser opens. A wrong fixture gives slow API tests or a missing UI context.

| Test type | Fixture | Browser opens? | Use when |
|-----------|---------|----------------|----------|
| API only (integration) | `{ api }` | No (lazy) | Pure API testing. No UI needed. |
| UI only | `{ ui }` | Yes | UI-focused testing. No backend setup via API. |
| Hybrid (UI + API setup) | `{ test }` | Yes | Setup data via API, drive flow via UI, verify via API. |

- Only three fixtures exist (`tests/components/TestFixture.ts`). Reusable precondition chains (3+ ATCs repeated across 3+ files) go in a Steps class under `tests/components/steps/`, instantiated directly in the test and never exposed as a fixture.
- `tests/integration/**` almost always uses `{ api }`. `tests/e2e/**` uses `{ ui }` when no API setup is needed and `{ test }` otherwise. A test that never touches the UI does not request `{ ui }`, which would open a browser for nothing.

---

## Gotchas (the most common rejection reasons)

1. **ATC = complete test case, not a single click.** `clickLoginButton()` is not an ATC; `loginWithValidCredentials(credentials)` is. A method that only wraps `page.click()` is deleted.
2. **TC Identity Rule: Precondition + Action = 1 TC.** All expected results from the same precondition and the same action are assertions of one TC, not separate TCs. Do not split a TC across panels, endpoints or UI sections.
3. **Equivalence Partitioning.** The same expected output means one parameterized ATC. Three ATCs that each return HTTP 401 for an invalid login are wrong; merge them into one `loginWithInvalidCredentials(payload)`.
4. **ATCs do not call ATCs.** Reusable chains go in the Steps module (`tests/components/steps/*Steps.ts`), which is not decorated with `@atc`.
5. **Locators inline.** No `locators/*.ts` files; at 2+ uses in one component, a `private readonly` arrow function in the class.
6. **Helpers vs ATCs.** An action that changes state is an ATC (`@atc('TICKET-ID')`). A GET is an ATC only when its response is the business outcome under test (business data, 401, 403, 404); a GET that only prepares data is a helper (no `@atc`, optionally `@step`), and one that confirms an action stays inside that action's ATC (`references/kata-architecture.md` Rule 7).
7. **Fixed assertions go inside ATCs.** Status code, required fields and URL redirect checks live in the ATC. Test-level assertions (flow outcomes) go in the test file.
8. **Max 2 positional parameters.** 3+ take an object parameter (`fn(args: Args)`).
9. **Import aliases are mandatory.** `@api/`, `@ui/`, `@utils/`, `@variables`, `@TestContext`, `@schemas/`. Lint rejects relative imports (`../../../`).
10. **No hardcoded waits.** No `page.waitForTimeout(3000)`. Wait for a specific condition: `waitForResponse`, `waitForURL` or a web-first assertion such as `expect(locator).toBeVisible()` on `[data-loaded="true"]`. Lint flags `waitForTimeout`, `waitForSelector` and `networkidle` (`playwright/no-wait-for-timeout`, `no-wait-for-selector`, `no-networkidle`) attributes.
11. **No retries by default.** `retries: 0` in `playwright.config.ts`. A test that passes on retry is flaky, not passing, so investigate it.
12. **Credentials from `.env`, never hardcoded.** `LOCAL_USER_EMAIL` / `STAGING_USER_EMAIL` and their passwords, read via `config.testUser` from `@variables`; no password, token or API key inline in a spec, fixture or data file.
13. **Each test generates its own data.** No shared state between tests. Use `TestContext.generateUserData()` or faker helpers for unique values.
14. **Ticket ID prefix in every `test()`.** Format: `test('TICKET-ID: should {behavior} when {condition}', ...)`. The `describe` block may also carry the ticket ID when the file is tied to one ticket.
15. **One component per file, one file per feature.** Components follow `{Resource}Api.ts` or `{Page}Page.ts`. Test files follow `{verb}{Feature}.test.ts` (`applyDiscount.test.ts`, never `discount.test.ts`).
16. **Consult the manifest before proposing components or ATCs.** Skipping it produces duplicate Pages (`LoginPage` when `LoginPage.ts` exists), duplicate ATC IDs (`@atc('PROJ-90')` minted twice) and missed reuse (`getBookingById` when `BookingsApi.getById` exists). Start the Plan phase by loading it; the husky gate enforces freshness.
17. **Cross-cutting test-architecture decisions become ADRs, not plan-buried prose.** When Plan or Code reveals a decision that passes all three gates of `agentic-qa-core/references/adr-doctrine.md` (hard to reverse, surprising without context, a real trade-off), promote it from `planning-playbook.md` §2 "Architecture Decisions" to a standalone `.context/ADR/ADR-NNNN-<slug>.md` and leave a `See ADR-NNNN` backlink in the plan. Examples: a fixture lifecycle reused across tickets, a test-data-isolation contract, an auth-in-tests change, a flake-retry-policy shift, a Page-Object-versus-Screenplay move. A decision that fails a gate, ticket-local choices included, stays in the plan. ADRs are append-only: supersede, never rewrite.
18. **Session-footer contract (at close).** The final phase is not done until the two chat-facing blocks from `../agentic-qa-core/references/session-footer-contract.md` are printed: (1) a consolidated screenshot list (repo-relative paths, verified on disk, bug annotations first) plus each capture's path the moment it lands; (2) the Session Footer listing the skills, MCPs and CLIs actually used and the testing levels touched, with explicit "none" entries for expected-but-untouched levels. Framing for this skill: authoring. With several subagents, each stage report carries the five footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `testing_levels_touched`, `screenshots_captured`) and the orchestrator compiles the footer once. Chat only, never a Jira comment or an ATR body. Lessons are proposed to `.session/<skill-slug>/<scope>/refinements.md` and never applied to a live skill (`../agentic-qa-core/references/skill-refinement-protocol.md`); the footer's `Refinements proposed:` line counts them.
19. **The KATA layers never collapse.** TestContext, ApiBase + UiBase, Domain (Api, Page, Steps) and Fixture stay separate (`references/kata-architecture.md`). Tests that flatten layers are rejected at Review.
20. **No `customfield_NNNNN` in spec files, test data or test config.** Resolve Jira fields through `{{jira.<slug>}}` against `.agents/jira-fields.json` and `.agents/jira-required.yaml`, so test code survives workspace rotations.
21. **Test code and product code never share a PR.** Test PRs follow the `test/*` branch convention with the title `{type}({ISSUE-KEY}): {description}` (`.agents/skills/git-flow-master/references/pr-test-automation.md`). Under `sdet`, adjacent non-test work does not ride a `test/*` ticket branch either: it goes on a Plus Branch (`docs/*`, `chore/*` or `fix/*` into the integration trunk), per `.agents/skills/git-flow-master/references/sdet-integration-trunk.md`.

---

## Minimal templates (small, load-bearing)

### KATA component signatures

```typescript
// API component — Layer 3
export class UsersApi extends ApiBase {
  constructor(options: TestContextOptions) { super(options); }

  // Helper (read-only)
  @step
  async getUserById(id: string): Promise<[APIResponse, UserResponse]> {
    return this.apiGET<UserResponse>(`/users/${id}`);
  }

  // ATC (state-changing)
  @atc('TICKET-ID')
  async createUserSuccessfully(payload: UserPayload): Promise<[APIResponse, UserResponse, UserPayload]> {
    const [response, body, sent] = await this.apiPOST<UserResponse, UserPayload>('/users', payload);
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    return [response, body, sent];
  }
}
```

```typescript
// UI component — Layer 3
export class LoginPage extends UiBase {
  constructor(options: TestContextOptions) { super(options); }

  @atc('TICKET-ID')
  async loginWithValidCredentials(data: LoginData): Promise<void> {
    await this.page.goto('/login');
    await this.page.locator('#email').fill(data.email);
    await this.page.locator('#password').fill(data.password);
    await this.page.locator('button[type="submit"]').click();
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

### Test file skeleton

```typescript
import { test, expect } from '@TestFixture';
import usersData from '@data/fixtures/users.json';

test.describe('TICKET-ID: Validate discount codes', () => {
  test('TICKET-ID: should apply percentage discount when code is valid', async ({ api }) => {
    const order = await api.orders.createOrderSuccessfully(orderData);
    const totals = await api.orders.getTotals({ orderId: order.id });
    expect(totals.finalAmount).toBe(expectedFinalAmount); // a literal from the TC, not recomputed from the response
  });
});
```

### Fixture registration (excerpt)

```typescript
// tests/components/UiFixture.ts
export class UiFixture extends TestContext {
  readonly login: LoginPage;
  readonly checkout: CheckoutPage;

  constructor(options: TestContextOptions) {
    super(options);
    this.login = new LoginPage(options);
    this.checkout = new CheckoutPage(options);
  }
}
```

---

## Quality gates (must pass before merge)

| Gate | Command | Must be |
|------|---------|---------|
| Tests pass | `bun run test {path}` | All green, zero retries used |
| Types | `bun run types:check` | No errors |
| Lint | `bun run lint:check` | No errors |
| Fixture registered | visual | Component is in `ApiFixture` / `UiFixture` (Steps classes are instantiated directly, never registered) |
| ATC IDs linked | visual | Every `@atc('X')` matches a real TMS test case ID |
| Naming | visual | Files PascalCase for components, camelCase verb for test files |
| Spec and standards reviewers | review | Both reports carry no blocker, and no assertion is tautological, unable to fail or structure-sensitive |
| Session footer | chat | Session footer + consolidated screenshot list printed in chat per session-footer-contract (never in a Jira comment) |

---

## Which reference to read

Not every invocation needs every reference. Load the one that matches the task.

- KATA architecture, fixture selection, ATC rules, Steps module mechanics: `references/kata-architecture.md`
- TypeScript conventions (params, imports, types, errors, DRY by layer): `references/typescript-patterns.md`
- Naming, tagging, folder structure, anti-patterns, quality gates: `references/automation-standards.md`
- Writing a Playwright `Page` component, locator strategy, data-testid rules, UI waits: `references/e2e-patterns.md`
- Writing an `Api` component, OpenAPI type facades, HTTP helper usage, schema imports: `references/api-patterns.md`
- Designing test data (Discover, Modify, Generate), fixtures JSON, faker: `references/test-data-management.md`
- `@atc` / `@step` decorators, NDJSON results, TMS sync mechanics: `references/atc-tracing.md`
- Writing the Plan (module, ticket and ATC scopes and templates): `references/planning-playbook.md`
- A batch across parallel sessions (partition, conductor duties, integration order): `references/batch-fleet.md`
- Running the review checklist (E2E or API): `references/review-checklists.md`
- Configuring Playwright, CI integration, projects, sharding: `references/ci-integration.md`
- Session resume contract, plan.md and progress.md schemas, archive policy, Engram per-phase checkpoint: `../agentic-qa-core/references/session-management.md` (Phase 0, Phase 1 and Archive of this skill)

Tool resolution: use `[AUTOMATION_TOOL]` for browser work (`/playwright-cli`, the only browser path), `[API_TOOL]` for OpenAPI exploration, `[DB_TOOL]` for verifying test data, `[TMS_TOOL]` for TMS sync (load `/xray-cli` when available) and `[ISSUE_TRACKER_TOOL]` for ticket work. Detailed Story reads (ACs, ATP, dev implementation-plan, custom fields) go through `bun run jira:sync-issues get <KEY> --include-comments` (or `jql "<query>"`) and the synced `.md`. Never read custom fields with `acli workitem view`: it returns `null` for them. Writes (commenting automated-test status back to the Story, transitions) go through `/acli`, and trivial summary, status and key-list lookups can use its view or search. See `agentic-qa-core/references/acli-integration.md` §"Reads vs writes". Resolve tags through the project's AGENTS.md Tool Resolution table.

---

## Quick reference

```bash
# Planning outputs (hand-authored, NON-Jira; Epic-level test-specs/)
# .context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/spec.md
# .context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/automation-plan.md
# .context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/atc/*.md
# (the Story-folder implementation-plan.md is the Jira-synced DEV plan — read-only input, not written here)

# Code locations
# tests/components/api/{Resource}Api.ts
# tests/components/ui/{Page}Page.ts
# tests/components/steps/{Domain}Steps.ts
# tests/integration/{module}/{verbFeature}.test.ts
# tests/e2e/{module}/{verbFeature}.test.ts

# Local validation loop
bun run test <path>
bun run types:check
bun run lint:check
bun run kata:manifest               # regenerate registry if components/ATCs changed
git add kata-manifest.json          # stage so the freshness gate passes
bun run kata:manifest:check         # confirm gate would pass (husky runs this on commit)

# Env + TMS sync
cp .env.example .env                # populate test credentials
bun run api:sync                    # regenerate OpenAPI schema types
```
