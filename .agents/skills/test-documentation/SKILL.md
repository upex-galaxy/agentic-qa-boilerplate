---
name: test-documentation
description: "Document already-validated tests in the TMS: ROI verdicts, TCs, ATP and ATR. Use when documenting test cases or deciding what to automate; repairing broken Story-ATS-ATP-ATR-TC traceability (repair-traceability); running the post-promotion merged pass. Not for test code (test-automation) or running suites (regression-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [tms, issue-tracker]
metadata:
  kind: workflow
  stage_owner: true
# compact_rules is consumed verbatim by scripts/build-skill-registry.ts (frontmatter first,
# no truncation). It is the registry digest of the body's Compact Rules and Phase 3 rules.
compact_rules: |
  - An AC-to-TC map is the floor: at least one TC per AC is a minimum, never a target. Coverage is AC conformance plus risk beyond the AC, so the set includes the boundary, negative, state and anomaly cases the AC is silent on. Canon: `agentic-qa-core/references/test-design-doctrine.md`.
  - 1:N applies to derivation, not to the regression repository. Only regression-worthy scenarios (Candidate or Manual) are persisted; most are Deferred. jira-native: Stage 4 creates `Test`s for those only (Deferred is report-only). jira-xray: Stage 1 already made the sprint `Test`s, so Stage 4 promotes the regression-worthy ones into the Test Plan and enriches them. Document because it will be re-run, never to hit a count.
  - Techniques by trigger: EP always; BVA for a range, limit, length or date window; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ factors combine.
  - Parametrize: same-behavior data variants are ONE Test (`Scenario Outline` + `Examples` rows) per partition. Split only when action, outcome, status or state differs. Canon: doctrine §"Part 2.5".
  - Cross-cutting characteristics (XSS, perf, a11y) deferred to app-level suites are an explicit handoff: name the receiving suite or file the gap.
  - Document already-validated behavior only (discovery-driven: `oracle: confirmed`). Exploration belongs to `/sprint-testing` and `/exploratory-testing`.
  - TC identity is Precondition + Action + verifiable outcome. Naming: `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]`; `Validate <feature>` is reserved for the grouping layer. Reject `"Login test"`, `"Login - error"`, `"TC1: Test form"`.
  - ROI gives each TC one verdict: Candidate (feeds test-automation), Manual, Deferred. Prioritize by risk.
  - No ROI verdict while a scenario is `oracle: observed`: it needs a person's answer to "is this intended?" first (decision-protocol kind 1). Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §4.
  - A Candidate or Manual verdict is fired only after a person signs it (a batch through the `mkd` deck, one verdict through the question tool). The ROI comment then carries `Verdict signed: <who>, <where>, <when>` with a checkable `<where>`, the line the TC source gate of `/test-automation` reads. Only an attended session writes it; a subagent, worker or routine lists verdicts as pending. Format: `references/tms-conventions.md` §9.
  - Discovery intake (`references/discovery-intake.md`): a COVERED candidate is dropped with a line, a WEAK one becomes a strengthen proposal for the existing test (never a new Test), a NEW one runs the full pipeline anchored to its coverage Tech Story. The >50% alarm is computed per chunk.
  - `PASSED` or `FAILED` only from a run observed in the environment the TC's precondition names, else `NOT RUN` with its reason (doctrine §5). `automated` (`merged`) only once the spec is on the production branch, through mode `post-promotion` (doctrine §6).
  - Cardinality: US to TC is 1:N; AC to TC is N:1 or N:M. Resolve the TMS modality (Xray or Jira-native) in Phase 0 first.
  - Mode from `$ARGUMENTS`: a first token matching a mode in Mode routing (`repair-traceability`, `post-promotion`, `document`) is the mode and the rest is forwarded. Otherwise `document` for plain documentation work; ask when it could be either.
  - Bug-driven (golden rule): a regression-worthy bug must end with a Test. Reuse the existing failed Test if the bug came from one, else create one (both modalities). A non-qualifying bug is treated like a failed test: Deferred, no new Test.
  - The ATS is mandatory per Story (`ATS: {US_ID}: {story title}`, even with one TC): a `Test Set` holding all the Story's TCs, parented to the QA Test Artifacts epic, with `components` inherited from the Story. Components are mandatory here; the exemption covers only the optional feature-level `TS:` sets.
  - Create sets first: find or create the ATS, ATP and ATR before the first TC (module-driven pre-creates them because parallel TC sharding needs the targets). Add each TC to the ATS, then derive the ATP's and the Execution's test lists from the ATS membership, never three independent id lists.
  - Coverage truth (`xray-cli/SKILL.md` §Direction): coverage comes from the ATS-to-Story `is tested by` link (primary) or a direct TC-to-Story link (last resort, only when no ATS can exist). Story-to-ATP and Story-to-ATR links are administrative and contribute zero coverage: keep them, never count them.
  - Membership: TC in ATS is always a TC-to-ATS `test` issue link, in both modalities (never in the TC title). jira-xray also writes the Xray-internal membership (GraphQL, via `/xray-cli`), never instead. TC in ATP and TC in ATR stay Xray-internal. Test Set work type absent means no ATS (canon: `../agentic-qa-core/references/traceability-linking.md` §9).
  - Direct TC-to-Story links are the last resort (only when no ATS can exist, such as jira-native without the Test Set work type), not the default. The defect is a TC with no path to its Story, not the direct link itself.
---

## Forbidden invocations

Never invoke `/sdd-*` skills from this workflow: SDD is an optional ceremony users install themselves, and this skill is self-contained. To change KATA, fixtures, `cli/`, `scripts/` or the `api/schemas/` pipeline, leave this skill and use `/framework-development` (it runs Plan, Code, Verify, Archive on its own). `scripts/lint-skills.ts` rejects any `/sdd-` mention outside this section; `.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4 governs users who install SDD manually.

# Test Documentation: QA Bridge

Formalize already-validated tests in the TMS (Jira, Xray or equivalent) with full traceability, the right priority and a clear automation verdict, in three phases: Analyze, Prioritize (ROI), Document. Prioritizing is not optional, because most scenarios should end up Deferred, not automated.

One prerequisite: the tests describe behavior that is already validated ({{jira.status.story.qa_approved}} story, closed bug or finished exploratory session). The TMS protects regression; it is not an exploration tool.

---

## Dependencies

Requires `agentic-qa-core`. Loads on demand:

- `agentic-qa-core/references/test-design-doctrine.md`: read before deriving TCs from acceptance criteria. It governs the 1:N TC explosion, the formal-technique triggers and the floor-not-ceiling coverage model. 
- `agentic-qa-core/references/defect-management-doctrine.md`: read before parenting a Test or raising an Improvement. It governs QA process-epic parenting (every `Test` hangs from the **QA Test Repository** epic, Part 4), the mandatory `components` axis (Part 3) and the Improvement bridge for under-specified ACs (Part 1). This skill files no Bugs.
- `agentic-qa-core/references/briefing-template.md`, `agentic-qa-core/references/dispatch-patterns.md`, `agentic-qa-core/references/orchestration-doctrine.md`, `agentic-qa-core/references/session-management.md`, `agentic-qa-core/references/preflight-gate.md`, `agentic-qa-core/references/traceability-linking.md`: cited inline by the sections that use them.

## Compact Rules

**Test-design doctrine (binding, full canon in `agentic-qa-core/references/test-design-doctrine.md`):**

- An AC-to-TC map is the floor: at least one TC per AC is a minimum, never a target. Coverage is AC conformance plus risk beyond the AC, so the set includes the boundary, negative, state and anomaly cases the AC is silent on.
- 1:N applies to derivation, not to the regression repository. Only regression-worthy scenarios (Candidate or Manual) are persisted; most are Deferred. jira-native: Stage 4 creates `Test`s for those only (Deferred is report-only). jira-xray: Stage 1 already made the sprint `Test`s, so Stage 4 promotes the regression-worthy ones into the Test Plan and enriches them. Document because it will be re-run, never to hit a count.
- Techniques by trigger: EP always; BVA for a range, limit, length or date window; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ factors combine.
- Parametrize: same-behavior data variants are ONE Test (`Scenario Outline` + `Examples` rows) per partition. Split only when action, outcome, status or state differs. Canon: doctrine §"Part 2.5".
- Cross-cutting characteristics (XSS, perf, a11y) deferred to app-level suites are an explicit handoff: name the receiving suite or file the gap.

**Test-documentation operational rules:**

- Document already-validated behavior only (discovery-driven: `oracle: confirmed`). Exploration belongs to `/sprint-testing` per ticket and `/exploratory-testing` per module, flow or sweep.
- TC identity is Precondition + Action + verifiable outcome. Naming: `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]`; `Validate <feature>` is reserved for the grouping layer (Test Set summary or `describe()`). Reject `"Login test"`, `"Login - error"`, `"TC1: Test form"`.
- ROI gives each TC one verdict: Candidate (feeds test-automation), Manual, Deferred. Prioritize by risk.
- No ROI verdict while a scenario is `oracle: observed`: it needs a person's answer to "is this intended?" first (decision-protocol kind 1). Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §4.
- A Candidate or Manual verdict is fired only after a person signs it (a batch through the `mkd` deck, one verdict through the question tool). The ROI comment then carries `Verdict signed: <who>, <where>, <when>` with a checkable `<where>` (the person's own comment id, or the saved mkd result or decision record path), the line the TC source gate of `/test-automation` reads. Only an attended session writes it; a subagent, worker or routine lists verdicts as pending. Format and the sign-only pass: `references/tms-conventions.md` §9.
- Discovery intake (`references/discovery-intake.md`): COVERED is dropped with a line, WEAK becomes a strengthen proposal (never a new Test), NEW runs the full pipeline anchored to its coverage Tech Story; the >50% alarm is per chunk.
- `PASSED` or `FAILED` only from a run observed in the environment the TC's precondition names, else `NOT RUN` with its reason (doctrine §5). `automated` (`merged`) only once the spec is on the production branch, through mode `post-promotion` (doctrine §6).
- Cardinality: US to TC is 1:N; AC to TC is N:1 or N:M. Resolve the TMS modality in Phase 0 first. The mode comes from `$ARGUMENTS` (Mode routing).
- Bug-driven (golden rule): a regression-worthy bug must end with a Test. Reuse the existing failed Test if the bug came from one, else create one (both modalities). A non-qualifying bug is treated like a failed test: Deferred, no new Test.

**Read full SKILL.md when**: resolving TMS modality, computing ROI, writing Gherkin, or wiring US-ATP-ATR-TC traceability links.

---

## Mode routing

Resolve the mode before the readiness preflight and Phase -1. When the first token of `$ARGUMENTS` matches a mode below, that token is the mode and the rest goes to it unchanged (`/test-documentation repair-traceability UPEX-123`). Without a match, plain documentation work runs the default mode, and an ambiguous request gets a question.

- `repair-traceability`: selected only by a first token `repair-traceability`, the `fix-traceability` trigger phrase, or an explicit request to repair a ticket's existing traceability. Load only `references/repair-traceability.md`. Its sequence is sealed: audit, present the plan, get explicit user approval, apply, verify. Do not start Analyze, Prioritize, Document, create unrelated test cases, or widen the ticket scope.
- `post-promotion`: selected by a first token `post-promotion`, by the hand-off `/git-flow-master` sends when a promotion lands ("run the post-promotion `merged` pass"), or by an explicit request for that pass. Load only `references/post-promotion-pass.md`. It fires `merged` on TCs whose spec is on the production branch and touches nothing else (no Analyze, no ROI, no new Test).
- `document` (default): normal TMS documentation, ROI, and Candidate, Manual and Deferred work. Continue with the workflow below.

If the user has not supplied the ticket key `repair-traceability` needs, ask for it before any TMS call. Missing credentials remain a hard stop under `AGENTS.md` Critical Rule #10.

> `repair-traceability` on one ticket cannot see the failure that matters most. Coverage-link direction is a project-wide condition: an inverted link is invisible on its own Story (the link is there, the coverage panel is just empty, and nothing reports it) and only shows as a pattern in aggregate. On one measured project roughly half the linked Stories were wired the wrong way (ADR-0006). So when the mode audits a ticket, also offer the project-wide mixed-direction sweep before applying anything: the `[TMS_TOOL]` traceability check accepts several keys or a JQL query and returns one repair worklist. Direction doctrine, the delete-before-recreate rule (Jira dedupes the pair and type, so adding the corrected link is a silent no-op) and the sweep are canon in `agentic-qa-core/references/traceability-linking.md` §4 and §10. Read them first; the plan the user approves says which links get deleted, by id.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional. The orchestrator also applies the per-stage **Definition-of-Done gates** in `agentic-qa-core/references/stage-gates.md`: verify a stage's DoD (planning stages include the Test-Design Checklist) BEFORE recording its progress checkpoint and advancing.

This skill is per-scope. `<scope>` is `<JIRA-KEY>` (ticket or bug scope, or the coverage Tech Story of a discovery-driven gap), `<module-slug>` (module scope, or a per-module discovery-driven scope) or `<YYYY-MM-DD>-adhoc` (ad-hoc scope); names are canonical in `agentic-qa-core/references/discovery-driven-doctrine.md` §2. Session state lives at `.session/test-documentation/<scope>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 and §9. Phase -1 (session resume) runs first, then Phase 0 (TMS modality), then the pipeline.

Every dispatch follows the 7-component briefing in `.agents/skills/agentic-qa-core/references/briefing-template.md` (doctrine: `AGENTS.md` §3 "Orchestration Mode"), and the pattern per phase follows `.agents/skills/agentic-qa-core/references/dispatch-patterns.md`; the session contract is `.agents/skills/agentic-qa-core/references/session-management.md`. Phase 1 and Phase 2 stay inline because planning and decisions live in the orchestrator; bulk TC creation in Phase 3 is the only parallel hotspot and the only step that branches per TMS modality.

| Phase                                                  | Pattern    | Subagent role                                                                                                                                              |
|--------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Phase -1: Session resume check                         | inline     | orchestrator only; reads `.session/test-documentation/<scope>/progress.md` if present, offers resume / restart / abort per `agentic-qa-core/references/session-management.md` §4    |
| Phase 0: Resolve TMS modality                          | inline     | orchestrator only; the 3-step probe in §Phase 0                                                                                                             |
| Phase 1: Analyze scope                                 | Single     | inline; planning lives in the orchestrator (delegating it is an anti-pattern)                                                                               |
| Phase 2: ROI / Candidate-Manual-Deferred verdict       | Single     | inline; decisions live in the orchestrator                                                                                                                  |
| Phase 3: TMS TC creation (N > 10 TCs)                  | Parallel   | M subagents, chunks of ~5-10 TCs per agent; cap = 10 to avoid Jira/Xray rate limits; each subagent loads `/xray-cli` (Modality jira-xray) or `/acli` (Modality jira-native)  |
| Phase 3: TMS TC creation (N ≤ 10 TCs)                  | Single     | inline; dispatch overhead is not justified for small batches                                                                                                |
| Phase 3: Traceability linking (US <-> ATS/ATP/ATR <-> TCs) | Single | inline; it needs the aggregated state of all created entities                                                                                               |
| Phase 3: Final report / reports (`COVERAGE-MATRIX-<scope>.md`, `PRIORITIZATION-<scope>.md`) | Single | inline; synthesis lives in the orchestrator                                                                                                |

- Concurrency cap is 10 subagents for Parallel TC creation: Jira and Xray both rate-limit at about 10 writes per second sustained, and wider fan-out triggers 429 responses. A module with more than 100 TCs gets chunks larger than 10 per subagent (the cap is on subagent count, not chunk size).
- Error protocol: on any subagent failure, stop and report the partial state (which TCs landed, which failed, with issue keys and errors), then present retry, skip and abort. Do not auto-fix or auto-rollback (see `.agents/skills/agentic-qa-core/references/orchestration-doctrine.md`). A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.

---

## With nobody at the keyboard

A supervised worker sends each question below to its conductor or launcher, which holds the gate. A routine takes the delegating brief as the approval when the brief covers the decision (`agentic-qa-core/references/decision-protocol.md`). Otherwise do the reversible work (analysis, the local plan, the reports), stop before any Jira or Xray write, and report what is waiting.

| Gate | With nobody present |
|---|---|
| Readiness preflight checklist | Self-fix only what the brief allows; a blocking RED stops the run and goes in the report. |
| Phase -1 resume, restart or abort | Resume. Restart archives the old session and abort drops it, so each needs the brief's word. |
| Ambiguous mode, missing ticket key | Stop and report; no TMS call without the key. |
| Phase 0 modality unsettled by config and evidence | Fail closed: no TMS write, report. |
| `repair-traceability` plan approval, project-wide sweep | Write the plan and stop; applying needs the approval. |
| ROI verdict signature, `oracle: observed` scenarios | List the verdicts as pending. |

Questions inside Phase 3 follow the same rule.

---

## Readiness Preflight Gate (MANDATORY — runs before Phase -1)

> Full doctrine: `agentic-qa-core/references/preflight-gate.md`. The gate runs before the resume check and the TMS-modality gate. Two laws: args are answers (the scope and any stated modality are provided, so ask only the gaps) and probe, don't assume. Surface gaps and REDs as ONE `AskUserQuestion` checklist, self-fix with approval and explanation, and stop on any blocking RED. This skill documents already-validated behavior and never executes against a live system, so its gate centers on TMS write capability. The generic baseline (env resolution, test-user creds, secret and restart handling, output contract) is in the reference §3.1; below is only this skill's capability delta.

| Capability | Need | Why here |
|---|---|---|
| Issue-tracker (`[ISSUE_TRACKER_TOOL]`) | REQUIRED | TC / ATP / ATR creation, linking, transitions. Load `/acli`; validate via `bun run jira:check`. |
| TMS modality + `[TMS_TOOL]` | REQUIRED | The whole Phase 0 gate. jira-xray: `/xray-cli` loaded, `XRAY_*` creds set and the Xray API answering (evidence, never work types alone). jira-native: `/acli` covers it. Resolve before Phase 1; ask only if all auto-checks fail. |
| Source repos readable | OPTIONAL | Phase 1 source-code validation reads backend and frontend code, not a running env, so no live-env or DB/API/browser probe is needed. |

Active env, test-user creds, DBHub, OpenAPI / API token, Playwright, `resend` and `kata-manifest.json` (owned by `/test-automation`) are N/A: documentation never hits a live system and writes no test code. When every REQUIRED row is GREEN, continue to Phase -1.

---

## Phase -1 — Session resume check (MANDATORY, inline)

Runs before Phase 0 (the TMS modality gate). Compute the prospective `<scope>` from the invocation: `<JIRA-KEY>` for ticket or bug scope (and the coverage Tech Story of a discovery-driven gap), `<module-slug>` for module scope (and a per-module discovery-driven scope), `<YYYY-MM-DD>-adhoc` for ad-hoc. Then:

1. Check `.session/test-documentation/<scope>/progress.md`.
2. If it does not exist, proceed to Phase 0 (TMS modality).
3. If it exists:
   - Read `plan.md` (chosen scope, TMS modality, TC list, ROI verdicts).
   - Read the tail of `progress.md` (last completed phase and next planned phase).
   - Tell the user the scope, TMS modality, last completed phase, next phase, and any TC creation chunks that did not finish (the most common interruption point: the Phase 3 parallel bulk create, capped at 10 subagents).
   - Offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-test-documentation-<scope>-aborted/` first.

The critical resume case is a Phase 3 parallel bulk create interrupted mid-batch. `progress.md` records one entry per returned Parallel subagent, so resume reads the chunks marked `completed` and dispatches only the missing ones (see Phase 3).

---

## Phase 0 — Resolve TMS modality (mandatory gate)

Every project runs in one of two modalities. Resolve it **before** Phase 1. The same ATP/ATR/TC concepts have **different containers** in each mode.

### The question to answer first

```
Does this project have Xray installed and licensed on Jira?
  A. Yes -> Modality jira-xray
  B. No  -> Modality jira-native (no Xray)
```

### How to resolve it without asking (in order)

1. Resolve `{{TMS_CLI}}` (`testing.tms_cli` in `.agents/project.yaml`). Value `bun xray` (or any Xray CLI) means a **candidate** jira-xray, confirmed in step 2. Value unset, `acli`-only, or `{{TMS_CLI}}` matching `{{ISSUE_TRACKER_CLI}}` means **Modality jira-native**.
2. Confirm Xray by **evidence**: the Xray API answers through `[TMS_TOOL]` (`/xray-cli`: its auth status check, then one read against the project). If it answers, the modality is **jira-xray**. Work types alone never decide: `Test Plan` / `Test Execution` / `Test Set` / `Pre-Condition` also exist as native Jira work types on jira-native instances (the table below uses them there "by excellence"), so their presence proves nothing about Xray. **Fail closed**: no answer from the Xray API means never assume jira-xray. When step 1 named an Xray CLI, that is a tool or credential failure: stop per Critical Rule #10 and name the `XRAY_*` variables.
3. **Only if neither the config nor the evidence settles it**, ask the user the question above. Do not ask by default: autoresolve first.

### What changes per modality

| Artifact | Modality jira-xray | Modality jira-native |
|----------|---------------------------|---------------------------|
| **ATP** (Acceptance Test Plan) | `Test Plan` issue titled `ATP: {STORY-KEY}: {story title}`, parented to the **QA Master Test Plan** epic, linked to the US | Same `Test Plan` issue **by excellence** (native Jira work type, Xray-independent); falls back to the Story `{{jira.acceptance_test_plan}}` field (then a `## Acceptance Test Plan (ATP)` comment) **only when the Test Plan work type is absent** from the instance. |
| **ATR** (Acceptance Test Results) | `Test Execution` issue with Test Runs per TC, Environment, Begin/End Date, titled `ATR: {STORY-KEY}: Story Testing`, parented to the **QA Test Artifacts** epic | Same `Test Execution` issue **by excellence**; falls back to the Story `{{jira.acceptance_test_results}}` field (then a `## Acceptance Test Results (ATR)` comment) **only when the Test Execution work type is absent** from the instance. |
| **TC** (Test Case) | Xray `Test` issue (type Manual / Cucumber / Generic) | Jira-native `Test` issue type (or `Task` with custom type), Description carries the full TC template |
| **ATS** (Acceptance Test Set) | `Test Set` issue titled `ATS: {US_ID}: {story title}`, mandatory per Story; holds ALL the Story's TCs (membership = TC→ATS issue links + the Xray-internal membership), linked to the US (`is tested by`, the coverage-panel link) | Same `Test Set` issue **when the work type is present**; membership expressed as the same **TC→ATS issue links**. Work type absent means **no ATS**: direct TC→Story links (cascade last resort) |
| **TS / Precondition / Test Plan** | First-class Xray issue types (`TS:` feature Set is optional grouping) | Same native work types when present in the instance; absent, use labels + Epic grouping |
| **Result sync** | CI imports JUnit/Cucumber via `[TMS_TOOL] Import Results`, and Test Runs update automatically | Custom script updates Test Status field on each TC + comment with build context |
| **CLI tag** | `[TMS_TOOL]` resolves to `bun xray` or equivalent | `[TMS_TOOL]` falls through to `[ISSUE_TRACKER_TOOL]` (acli / Jira MCP) |

### Resolve `{{TC_CREATION_STAGE}}` in the same gate

The modality says which TMS tool is live. `testing.tc_creation_stage` in `.agents/project.yaml` (referenced as `{{TC_CREATION_STAGE}}`) says **whether this skill creates the Candidate/Manual `Test` items or refines and promotes ones `/sprint-testing` already made**. Read it here, alongside the modality; unset or unrecognized means `auto`. The knob's full table and rationale are in `sprint-testing/SKILL.md` §"Which stage creates the TCs", which is authoritative; this section only consumes it.

| Resolved value | Phase 3's verb for a Candidate / Manual scenario |
|---|---|
| `auto` (default) | jira-xray: **promote + enrich** an existing sprint `Test` · jira-native: **create** the `Test` here |
| `sprint-testing` | **promote + enrich** in BOTH modalities; the items already exist, and creating a second one duplicates the repository |
| `test-documentation` | **create** in BOTH modalities; no sprint items exist to promote |

Whatever the verb, the title rule is identical: a created TC is titled to the form, and a promoted TC has its title re-derived and verified first (§"Title on promotion"). If the verb says promote but no sprint `Test` exists for a scenario (a Story tested before the knob was set, or a scenario derived only now), create it and note that in `progress.md`. Never skip the TC.

### Persist the decision

Once resolved, save the modality **and the resolved `{{TC_CREATION_STAGE}}`** into `.session/test-documentation/<scope>/plan.md` §Inputs (the canonical session record) and also mirror it to `test-session-memory.md` for the ticket (if one exists, for per-ticket sub-agent context). Treat it as sticky: do not re-resolve mid-session. If you detect drift (for example `[TMS_TOOL]` suddenly fails), stop and ask the user before re-resolving.

Reference implementations:
- Modality jira-xray concepts + Xray REST/GraphQL/CLI: `references/xray-platform.md`
- Modality jira-native project setup (Test issue type, Screen Scheme, custom fields): `references/jira-setup.md`
- Both modes side by side (field mapping, workflow, Description template): `references/jira-test-management.md`

---

## When to use each scope

Pick the scope from the input, not the output. All scopes share the Analyze, Prioritize, Document pipeline; only the input source and the defaults differ. Names, origins and granularity are canonical in `agentic-qa-core/references/discovery-driven-doctrine.md` §2; this table is the subset this skill accepts.

| Scope | Input | Typical volume | Default labels | Notes |
|-------|-------|----------------|----------------|-------|
| **Module-driven** | A module of the system explored end to end | 20-100+ scenarios | `regression`, `e2e` or `integration` | Batch of TCs grouped under the Regression Epic. Most scenarios end up Deferred. |
| **Ticket-driven** | A QA Approved user story from a sprint | 3-8 scenarios | `regression`, plus the test type | Output of a `sprint-testing` session. ATP/ATR created per US. |
| **Bug-driven** | A closed bug with a verified fix | 0-2 scenarios | `regression`, `automation-candidate` (usually) | Run the Bug-driven decision below. ROI biased up: "it failed once, it can fail again." |
| **Ad-hoc / Exploratory** | New scenarios found in exploratory testing | 1-10 scenarios | `regression` | Apply the 3 Phase-0 questions harshly; ad-hoc scenarios are often one-time validations. Gate 0 holds for every scenario that carries an oracle line. A set with no coverable creates no Test: a round whose anchor is NONE proposes the coverage Tech Story first (`agentic-qa-core/references/discovery-driven-doctrine.md` §2.1, §3), and intake runs as `discovery-driven` once it exists. |
| **Discovery-driven** | A coverage gap with no Story, anchored to a coverage Tech Story; only scenarios a person confirmed (`oracle: confirmed`) are scored | 1-10 per gap, 20-100+ per module | `regression`, plus the test type | Gate 0 below: an `oracle: observed` scenario gets no ROI verdict (`agentic-qa-core/references/discovery-driven-doctrine.md` §4). TCs use the Tech Story key as `{US_ID}` (§3 of the same file). Scored one anchor at a time (`references/discovery-intake.md` §6). |

A story ID means ticket-driven, a bug ID means bug-driven, a coverage Tech Story means discovery-driven, and a module name or a session output means module- or ad-hoc accordingly.

### Bug-driven decision: "an important bug must have a test" (golden rule)

Not every bug becomes a regression Test: a one-time typo in a stable area is treated like a failed test (the fix was verified in sprint-testing) and Deferred. Run the same analysis and prioritization as for any scenario; a regression-worthy bug must end with a Test that covers it, in BOTH modalities.

```
1. Is this Bug/Defect a regression candidate?  (apply Phase-0 filter + ROI; the prior-bug rule biases up)
   NO  -> No new Test. Treat as a failed test: fix already verified in sprint-testing -> log as Deferred. Done.
   YES -> step 2.

2. Was the bug found FROM an existing, already-executed Test?  (a Test that ran and failed — jira-native OR xray)
   YES -> REUSE that existing Test for the bug's retest + regression. It already lives in the test set;
          ensure it is linked to the bug (`tests / is tested by`) and promoted into regression. Do NOT duplicate.
   NO  -> CREATE + design the corresponding Test for the bug's retest.
          jira-native: new `Test` issue.  jira-xray: new Xray `Test` (+ plugin-appropriate Test Plan / Test Set linking).
          Link to the bug via `tests / is tested by`.
```

This overrides the sprint-testing phrase "the bug is the test case", which covers only the in-sprint retest. The retest verifies the fix now; this rule decides whether a persistent Test must exist so the bug cannot silently return.

**Scope handoff to `/test-automation`.** `Candidate` TCs flow to `/test-automation`, which plans them under the same scope names and sizes each work package (`agentic-qa-core/references/discovery-driven-doctrine.md` §2): `module-driven` is Macro, `ticket-driven` Medium, `bug-driven` Micro, `discovery-driven` Macro per module and Medium or Micro per gap. `ad-hoc / exploratory` Candidates enter under whichever fits (a module batch, or a Micro package for a single TC). `Manual` and `Deferred` verdicts are terminal and never reach automation.

After the scope is confirmed, write `.session/test-documentation/<scope>/plan.md` per `agentic-qa-core/references/session-management.md` §6. It holds:

- Goal: scope, TMS modality, expected TC count.
- Inputs: PBI references, ATP source, prior bugs.
- Approach: the per-phase dispatch table above.
- Phase breakdown: Phase 1 Analyze, Phase 2 Prioritize, Phase 3 TC creation with its chunk count, Traceability, Final report.
- Risks, and a verification checklist (all TCs created with traceability, both reports written, the Deferred list mirrored to Jira).
- Cross-references: `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/test-cases/*.md` per-TC files, `.context/reports/COVERAGE-MATRIX-<scope>.md` and `.context/reports/PRIORITIZATION-<scope>.md` (filenames per §"Reports: fixed filenames").

Then append `## Phase -1 — Session resume check — <ts>` with `status: completed` and `next: Phase 0 — Resolve TMS modality` to `progress.md`.

---

## Phase 1 — Analyze

### Inputs to gather

| Source | What to read | Why |
|--------|--------------|-----|
| User Story / Epic | Description, ACs, comments, linked issues | Scenario identification, risk signals |
| Closed bugs linked to the story | Summary, root cause, fix area | Prior-bug prioritization rule |
| Exploratory session notes | Validated scenarios, observations; from `/exploratory-testing`, its `candidate-scenarios.md` (marks and scoring rules: `references/discovery-intake.md`; only `oracle: confirmed` ones are scored) | Reuse nomenclature already used; never re-document a `COVERED` candidate |
| Coverage gap list | `.session/project-context/coverage/gap-list.json` (`project-context` mode `coverage`): behaviours by bucket, each with its coverage Tech Story; same marks and fail-closed reads (`references/discovery-intake.md`) | Discovery-driven work list in risk order; never a Test without its anchor |
| Existing ATP (if present), **modality-aware** (see §Phase 0) | **jira-native**: Story field `{{jira.acceptance_test_plan}}`, synced to `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/acceptance-test-plan.md` (read-only Jira cache; sync via `bun run jira:sync-issues get <STORY> --include-comments`). **jira-xray**: Test Plan issue `description` via `bun run jira:sync-issues get <ATP_KEY>`, synced to `test-plans/ATP-<KEY>-<slug>.md` (a non-conforming title keeps the legacy `TESTPLAN-` / `TESTEXEC-` / `RETESTEXEC-` prefix); per-TC run state via `[TMS_TOOL]` (xray-cli) | Scenarios may already exist; do not reinvent |
| Existing ATR (if present), **modality-aware** (see §Phase 0) | **jira-native**: Story field `{{jira.acceptance_test_results}}`, synced to `acceptance-test-results.md` (same `jira:sync-issues get <STORY> --include-comments`). **jira-xray**: Test Execution issue `description` via `bun run jira:sync-issues get <ATR_KEY>`, synced to `test-executions/ATR-<KEY>-<slug>.md`; per-TC run results via `[TMS_TOOL]` (xray-cli) | Prior run results; do not re-execute what is already recorded |
| Implementation plan / source code | Actual files, APIs, test IDs | Validate that the design matches the implementation before documenting |
| `business-domain-context` (`bun run context:map business-domain-context`; one term: `--section term-<slug>`) | Canonical entity + process names, their UI labels | Vocabulary reference for TC names, steps and preconditions. Terms must match the map (a placeholder map means no glossary: say so, do not invent terms) |

### Separate real scenarios from cross-cutting characteristics

Cross-cutting traits are validated inside every test, not as separate TCs.

| Cross-cutting (not a TC) | Validated by |
|--------------------------|--------------|
| Mobile responsive | Running each test in mobile viewport |
| XSS prevention | Using special-character test data inside tests |
| Performance | Timing assertions inside tests |
| Accessibility | A11y assertions inside UI tests |
| API contract | Response schema checks inside API tests |
| Generic "error handling" | Specific negative-path scenarios |

> Deferral is not omission (Compact Rules). Each row lands somewhere: woven into a TC's data and assertions, or owned by a named app-level suite. If no suite exists for a trait the feature genuinely exposes, file the gap (a Deferred TC or a note in the ATR).

A real scenario is a **user flow**: a clear business objective, a concrete precondition and action, and a verifiable outcome, named in the `should` form (Compact Rules).

### Source-code validation (mandatory before documenting)

The design in the ATP was written before code existed. Before creating any TC:

1. Open the implementation plan (if any) and list the files it touches.
2. Grep the actual code for `data-testid=`, route handlers, API paths and text formats.
3. Compare the ATP's assumptions against what the code does. If they diverge, correct the TC design and add a Refinement Notes section.

Common discrepancies: an API the ATP assumed exists turns out to be SSR/direct DB; UI text in the ATP ("based on N reviews") differs from reality ("(N reviews)"); hardcoded IDs in the ATP where the TMS needs a variable pattern. Skipping this is the most common cause of invalid automated tests later.

### Sprint TCs are drafts: refine them, do not inherit them

Whatever `/sprint-testing` Stage 1 left behind (Xray `Test` items, or ATP outlines under jira-native) was written to run once, this sprint, by its author. It is an input to this phase, never its output. Refine it before it enters the regression repository:

| What Stage 1 produced | What this phase does |
|---|---|
| **Title** | Re-derive it to the canonical form (§"Title on promotion"): a regression title reads for whoever runs it in six months, not for the tester who was there |
| **Steps / Gherkin** | Raise to *repeatable* detail: no "as before", no implicit state, no step that only makes sense after the previous test. Parameterize same-behavior data variants into one `Scenario Outline` (doctrine §Part 2.5) |
| **Preconditions** | Make them explicit and buildable from a cold environment (a sprint test may have relied on data the tester happened to have) |
| **Variables** | Replace every hardcoded id / email / UUID captured during the sprint with `{variable}` + a Variables table saying how to obtain it |
| **Scope** | A sprint TC that covers two (precondition, action) pairs splits here; two that cover the same pair merge (TC identity rule below) |

A refined TC carries a short **Refinement Notes** line in its Description (the section source-code validation writes to) naming what was tightened and why, so a reviewer can tell it from an untouched sprint artifact.

Under jira-native with `{{TC_CREATION_STAGE}}` = `auto` there is no sprint `Test` item to refine. The outline in the ATP plays that role, and the same table applies to it.

### TC identity rule (load-bearing)

A TC is defined by Precondition + Action. All expected results from the same (precondition, action) pair belong to the same TC, not to separate TCs.

```
Same TC:                                    Different TCs:
  Precondition: valid credentials             Precondition: valid credentials     -> TC-A
  Action:       submit login                  Precondition: locked account        -> TC-B
  Assertions:   redirect + token + welcome    Precondition: invalid credentials   -> TC-C
                (all one TC)                  (all same action, but preconditions differ)
```

Splitting one (precondition, action) into N "check panel A / B / C" TCs is an anti-pattern: one TC, multiple assertions.

### Technique-driven TC derivation (1:N, full canon: `agentic-qa-core/references/test-design-doctrine.md`)

One AC yields multiple TCs by default. Derive them by the AC's shape, and merge only within a partition (TC identity above), never across partitions, boundaries or states. Reduce an AC to one TC only with a written `trivially atomic` justification.

| Trigger in the AC | Technique | TCs produced |
|---|---|---|
| Any input (always) | **Equivalence Partitioning** | same-output inputs share one parameterized TC (Scenario Outline + Examples); different-output inputs get separate TCs |
| A range / limit / length / date-window | **Boundary Value Analysis** | TCs at `min-1·min·min+1 … max-1·max·max+1` + zero / empty / null / overflow (EP alone misses off-by-one) |
| A status / lifecycle field | **State-Transition** | one TC per valid transition + per invalid transition |
| 2+ interacting conditions | **Decision Table** | enumerate combos, collapse equivalents, one TC per surviving rule |
| 3+ combinable factors | **Pairwise** | all-pairs TC set (log the reduction) |

These are candidate scenarios, not yet TMS work items. ROI (Phase 2) decides which become persistent regression TCs and which stay Deferred (recorded in the prioritization report, **not created in the TMS**).

> **Improvement bridge (`agentic-qa-core/references/defect-management-doctrine.md` Part 1).** When a test beyond the AC exposes a gap because the AC was under-specified or absent (the system violated no defined criterion), file an **Improvement** issue per the doctrine (or delegate it to `/sprint-testing`). It is not a regression TC, and the Story's AC set stays as it is.

---

## Phase 2 — Prioritize (ROI)

**Gate 0 (discovery-driven only)**: the scenario is `oracle: confirmed`; otherwise it waits, unscored (`agentic-qa-core/references/discovery-driven-doctrine.md` §4).

Every scenario passes three gates in order. Failing any gate makes it Deferred.

MTP risk orders which gaps and scopes are worked first and never sets a verdict. ROI decides per scenario, and a high-risk gap can still end Deferred, explicitly (`agentic-qa-core/references/discovery-driven-doctrine.md` §7).

### Phase 0: The four filter questions

1. **Does it protect against FUTURE regressions?** If the bug was a one-time typo in a stable area, the answer is no. Defer.
2. **Are there PRIOR bugs in this area?** Yes: prioritize even with moderate ROI ("it failed once, it can fail again").
3. **Is it an APP-level concern or a FEATURE-level concern?** XSS / a11y / performance / responsive are APP-level suites, not per-feature TCs. Defer from this scope.
4. **Does a cheaper layer already cover this risk?** If a lower-cost existing test (a component/unit test, an API-level check) already exercises the same failure mode, this E2E-level TC adds cost without closing a gap. Yes, and nothing E2E-specific is left to protect: Defer.

### ROI formula (load-bearing)

```
ROI = (Frequency x Impact x Stability) / (Effort x Dependencies) / 10
```

The trailing `/ 10` is a **normalization constant, not a sixth factor**. The raw quotient over 1-5 factors spans `0.04 .. 125`, while every threshold and worked example here reads on a `0.004 .. 12.5` scale, so always divide by 10. A neutral all-3s scenario lands at `(3x3x3)/(3x3)/10 = 0.3`, which is Deferred, the intended default.

Each factor is scored 1-5 independently:

| Factor | 1 | 2 | 3 | 4 | 5 |
|--------|---|---|---|---|---|
| Frequency (how often run) | Yearly / rarely | Every release | Every sprint | Daily | Every PR / commit |
| Impact (if it fails) | Cosmetic | Minor inconvenience | Degrades UX | Blocks feature | Revenue / core business |
| Stability (of the flow) | Very volatile | Unstable | Moderate | Stable, minor changes | Unchanged for months |
| Effort (to automate) | Trivial | Low (hours) | Moderate (1-2 days) | High (several days) | Very high (week+) |
| Dependencies | None | 1-2 simple | 3-4 | 5+ | Complex externals |

Effort and Dependencies are **divisors**, so a higher score is worse. The other three are multipliers.

### Component value bonus

If a TC is reusable across multiple E2E flows:

```
Component Value = Base ROI x (1 + 0.2 x N)
```

where `N` is the number of E2E flows that consume it (a moderate-ROI atomic like `authenticateSuccessfully` can cross out of the defer bands through reuse). **`N` is a qualitative estimate, capped at 3** (max multiplier `x1.6`): no tool counts call-sites, so read it off the ATP / feature map and record the estimate in the ROI comment. Full rule: `references/tms-conventions.md` §9 "Component value bonus".

### Three outcomes (load-bearing)

Every scenario ends in exactly one of these buckets. There is no fourth.

| Outcome | Triggers it | Where it goes next | TMS status flow |
|---------|------------|--------------------|------------------|
| **Candidate** | ROI > 3.0, OR (ROI 1.5-3.0 AND prior bug), OR critical happy path | Feeds `test-automation` skill | Draft -> In Design -> READY -> In Review -> Candidate |
| **Manual** | ROI 0.5-1.5 AND not automatable (human judgment, visual inspection), OR explicitly manual-only | Terminal: manual regression suite | Draft -> In Design -> READY -> MANUAL |
| **Deferred** | ROI < 0.5, OR failed Phase-0 filter, OR one-time validation, OR **it matched neither row above** (Deferred is the default bucket: ROI under 3.0 with no prior bug and no critical-path justification lands here) | Terminal: not in regression. Can be revisited if system changes | **jira-native**: do not create a TC in the TMS. Document as Deferred in `.context/reports/PRIORITIZATION-<scope>.md` AND in the mirrored Jira comment (§"Reports: fixed filenames"; the local file is `[LOCAL]`, the comment is the durable record). **jira-xray**: the sprint `Test` (created in `/sprint-testing` Stage 1) is **not promoted** to the Regression Test Plan (RTP); it stays as a sprint execution artifact, not deleted. |

> **Band authority**: the three outcomes above collapse the 5-band table in `references/tms-conventions.md` §9 ("ROI decision thresholds (strict)"), which is the authority on band boundaries. It resolves the middle bands explicitly: `1.5-3.0` is "Case by case: prior bug? critical flow? **If no, defer**", and `0.5-1.5` is "Probably defer: include only if prior bug". Read it whenever a score falls between `0.5` and `3.0`.

If more than 50% of candidates end up Candidate or Manual, re-apply Phase 0 more strictly (a discovery batch runs this per chunk, `references/discovery-intake.md` §6).

> **Modality changes the verb in Phase 3, not the verdict here.** The verdicts are identical in both modalities. **jira-native**: Phase 3 creates `Test` work items for Candidate and Manual only (Deferred is report-only). **jira-xray**: the `Test` items already exist from `/sprint-testing` Stage 1, so Phase 3 selects and promotes the Candidate and Manual ones into the RTP (re-derived canonical title, then label `regression-candidate`) and enriches them (rich Gherkin, parameterization, edge elaboration: the "specify much more" pass). Deferred sprint Tests stay unpromoted. See `sprint-testing/SKILL.md` §"TC creation timing (modality-aware)".

---

## Phase 3 — Document in TMS

Phase 3 turns the Phase 2 verdicts into TMS artifacts: containers, TCs, links, and the hand-off to the Regression Test Plan. Every ask-first step in this phase (the Regression Epic, the feature TS, the RTP, an artifact owned by someone else, an unmapped slug) follows `## With nobody at the keyboard`: unattended, stop before the Jira write and report.

### Preflight: Regression Epic

Every documented TC needs a parent Regression Epic, the project's single test repository. That epic is the QA Test Repository process epic (`agentic-qa-core/references/defect-management-doctrine.md` Part 4). Resolve it found-or-created by the configured name `qa.qa_epics.test_repository_epic.name` ("QA Test Repository"). When it is absent, create it once, write the test-repository strategy into its description, and cache its key in `.agents/project.yaml` under `qa.qa_epics.test_repository_epic.key`. It is a QA process epic, never a product or dev epic and never unparented. The parent only says which QA bucket tracks the Test: product area travels on `components` (Part 3) and Story coverage on the issue link (Part 4).

Load `/acli` before running the commands below.

```
[ISSUE_TRACKER_TOOL] Search Issues:
  project: {{PROJECT_KEY}}
  query: type = Epic AND summary ~ "QA Test Repository"      # resolve by configured name qa.qa_epics.test_repository_epic.name
```

If none exists, ask the user before creating one named `QA Test Repository` with labels `QA-Artifact, regression` (`QA-Artifact` is the identity label of every QA process epic).

### Preflight: Test Sets (ATS mandatory per Story, TS optional feature grouping)

Two Set altitudes, and they are different things:

- The ATS (Acceptance Test Set), `ATS: {US_ID}: {story title}`, is mandatory per Story, even with a single TC. It holds all the Story's TCs and anchors coverage: the ATS to Story `is tested by` link is what fills the Xray coverage panel (ATP and ATR links do not; see `xray-cli/SKILL.md` §Direction). It is parented to QA Test Artifacts and inherits `components` from the Story (the components exemption covers feature-level `TS:` only). Phase 3 is Set-first: find-or-create the ATS, add the TCs to it, then derive the ATP's and the Execution's test lists from its membership.
- The TS (feature-level Test Set), `TS: <EPIC_KEY|module>: Validate <feature>`, is optional grouping (smoke, regression or a feature suite), 1:1 with the Epic or module, with optional `components` because a feature Set spans modules. Ask the user before creating one; the AI creates it lazily, only when a promotion needs it. Only promoted, regression-worthy Tests (Candidate or Manual) go into it; Deferred sprint Tests do not.

- Modality jira-xray: resolve or create Sets through `[TMS_TOOL]`. Membership is written in Xray (GraphQL) and as one TC to ATS `test` issue link per TC through `[ISSUE_TRACKER_TOOL]` (`../agentic-qa-core/references/traceability-linking.md` §9). The ATS to Story `is tested by` edge is also a Jira issue link, and it is mandatory.
- Modality jira-native: with the Test Set work type, create the ATS item and express membership as TC to ATS issue links plus the ATS to Story link. Without it there is no ATS: link each TC to the Story directly with `is tested by` (the cascade's last-resort path) and group by feature through the Regression Epic plus a feature or Epic label (`epic-<EPIC_KEY>` or the feature slug).

### Entity model: ATP / ATR / ATS / TC

Five entities. The Story links to its ATS, ATP and ATR ("is tested by"), but only the ATS to Story edge carries coverage; the ATP to Story and ATR to Story links are administrative and contribute zero (`xray-cli/SKILL.md` §Direction). The ATP designs the TCs (TC "is designed by" ATP) and the ATR executes them (TC "is executed by" ATR). A direct TC to Story link is the cascade's last resort, used when no ATS exists, not the default. The defect is a TC with no path to its Story, not the direct link itself. Full doctrine: `agentic-qa-core/references/traceability-linking.md` and `references/tms-architecture.md`.

| Entity | Created | Naming | Main content |
|--------|---------|--------|--------------|
| US (Story) | Pre-existing | `{{PROJECT_KEY}}-{n}` | The requirement |
| ATP | Content pre-sprint in `{{jira.acceptance_test_plan}}` (shift-left); the Test Plan ITEM by `/sprint-testing` Stage 1 from that field, or by this phase (find-or-create) when running module-driven and no Story ATP item exists | `ATP: {STORY-KEY}: {story title}` | Test Analysis + AC-to-TC coverage |
| ATR | Stage 1 (or now, if missing) | `ATR: {STORY-KEY}: Story Testing` | Test Report + execution results |
| TC | Stage 4 (this phase) | `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]` | Precondition + Action + Expected |
| ATS | Stage 1 (or now, find-or-create), mandatory per Story | `ATS: {US_ID}: {story title}` | All the Story's TCs (even one); the coverage anchor. Components inherited from the Story (mandatory). Parent: QA Test Artifacts. |
| TS (optional) | Lazily in Stage 4 if a promotion needs it (ask first); else pre-existing (async) | `TS: {EPIC-KEY\|module}: Validate {feature}` | Optional feature-level grouping (1:1 Epic) of promoted regression Tests. Components optional. Native without the work type: a feature/Epic label, no entity. |

Read `references/tms-architecture.md` when creating ATP/ATR/TC for a ticket, checking required links, or validating that a story is fully documented.

### Linking order (always Set-first)

```
1. Find-or-create the Story's ATS -> link to US (Story "is tested by" ATS — the coverage-panel link)
2. Find-or-create ATP (pre-sprint content lives in {{jira.acceptance_test_plan}}; the item usually
   exists from /sprint-testing Stage 1 — create here only when module-driven and no ATP item exists)
   -> link to US (Story "is tested by" ATP — administrative, no coverage)
3. Create ATR -> link to US (Story "is tested by" ATR — administrative, no coverage)
4. Update ATP -> link to ATR (bidirectional plan/results)
5. For each TC:
     Create TC -> add to the ATS (TC->ATS issue link in both modalities; jira-xray also
                  writes the Xray-internal membership)
               -> link to ATP (TC "is designed by" ATP) + ATR (TC "is executed by" ATR)
     # Do NOT link the TC directly to the Story when an ATS exists — TCs aggregate via the ATS.
     # Direct TC->Story is the cascade's LAST RESORT (no ATS available — e.g. jira-native
     # without the Test Set work type). The defect is a TC with NO path, not the direct link.
     # AC coverage is recorded in the ATP's AC-to-TC matrix, not as a Story<->TC issuelink.
6. Derive the ATP's and the ATR's test lists FROM the ATS membership (Set-first: the ATS holds
   ALL the Story's TCs; Plan and Execution consume that list).
7. For each PROMOTED (regression-worthy) TC:
     FIRST -> re-derive the canonical title and, if the live summary differs, rewrite it
              ([ISSUE_TRACKER_TOOL] Update Issue — summary is a Jira field, not an Xray one),
              THEN verify it matches before anything else touches the TC (see §"Title on
              promotion"). A wrongly-titled TC must never reach the RTP or carry the label.
     jira-xray  -> [TMS_TOOL] add TC to the OPTIONAL feature TS (resolve/create per Preflight) + [TMS_TOOL] add to the RTP
                   + [ISSUE_TRACKER_TOOL] label `regression-candidate` (labels are a Jira field; xray-cli has no update-label for existing Tests)
     jira-native -> [ISSUE_TRACKER_TOOL] apply the feature/Epic label (or add to a feature TS item when the work type exists)
```

Every artifact this skill creates carries `assignee` set to the authenticated session user at create time: the RTP, the ATS, the optional feature TS, every `Test` and every Precondition (`agentic-qa-core/references/artifact-lifecycle.md` §2). Xray refuses membership edits on a Test Plan the caller does not own, so an unassigned RTP blocks promotions long after the Plan exists. If find-or-create returns an artifact owned by someone else, ask the user before reassigning it.

Plan and Set lifecycle (`agentic-qa-core/references/artifact-lifecycle.md` §1):

| Artifact | Born | This skill moves it to | Then |
|---|---|---|---|
| RTP (Regression Test Plan) | `{{jira.status.test_plan.planning}}` | `{{jira.status.test_plan.ready}}` via `{{jira.transition.test_plan.designed}}` on the first promotion | stays `ready` forever, because the RTP is long-lived. Never fire `{{jira.transition.test_plan.complete}}` on it |
| ATS (per-Story Set) | `{{jira.status.test_set.designing}}` | closed by `/sprint-testing` Reporting, not here | none |
| TS (optional feature Set) | `{{jira.status.test_set.designing}}` | stays `designing` for the life of the feature | `{{jira.transition.test_set.done}}` only when its Epic closes |
| Precondition | `{{jira.status.precondition.active}}` | nothing: the workflow has no transition out of `active` | stays `active`; that is correct, not a gap |

Per-operation tool resolution and the Gherkin-enrichment CLI gap are in `references/jira-test-management.md` §"Stage-4 promote + enrich — tool resolution map". Load `/xray-cli` for command syntax.

### Where candidates go: the RTP handoff

This is the procedure for getting Phase 2 Candidates into the general regression suite, and it is the last thing Phase 3 does.

1. Find-or-create the project's Regression Test Plan (RTP): one long-lived `Test Plan` item per project, titled `RTP: {PROJECT_KEY|module}: Regression Test Plan`, parented to the QA Master Test Plan epic, `assignee` set to self at create time (see the lifecycle table above). Ask the user before creating it, as with the Regression Epic.
2. Every `Candidate` TC lands in it: title re-derived and verified (§"Title on promotion"), then `regression-candidate` applied, then added to the RTP. `Manual` TCs go to the manual regression suite, which under jira-xray is the same RTP, told apart by the `manual-only` label and the `{{jira.status.test_case.manual}}` status. `Deferred` TCs never enter it; that is the point of the verdict.
3. The RTP moves to `{{jira.status.test_plan.ready}}` on the first promotion and stays there: a regression run never completes the plan it ran from.
4. Downstream consumers read the RTP, not this session. `/test-automation` picks up the TCs at `{{jira.status.test_case.candidate}}` carrying `regression-candidate`; `/regression-testing` runs the RTP's membership into an RTR (`testPlan` is the RTP); an STR exists only at sprint close. Neither reads `.context/reports/`, since both report files are `[LOCAL]`. A Candidate that is not in the RTP does not exist downstream.

#### Grouping Candidates into e2e regression flows

The same authentication or checkout TC is consumed by several end-to-end journeys, and that reuse is what the Component value bonus (§Phase 2) scores. Group the Candidates explicitly, at the altitude `/test-automation` will use.

- One group is one e2e flow, a user journey that a spec file runs end to end, named for the journey and not the module: `Checkout — guest purchase`, not `Checkout tests`.
- A TC reused by 2+ flows is an atomic component. In KATA terms it becomes a Steps module instead of being duplicated per flow (`test-automation/references/kata-architecture.md`). Name it once, list it under every flow that consumes it, and let the `N` in the Component value bonus equal that count.
- Record the grouping in two places. The durable copy is the RTP description, as a `## Regression flows` section listing each flow with its member TC keys, readable by `/test-automation` and `/regression-testing` without this session. The local copy is a flow column in `COVERAGE-MATRIX-<scope>.md`, beside the AC, scenario, TC and verdict grid.
- A Candidate that belongs to no flow is a smell, not a category: either it is an atomic component (say which flows consume it) or its journey was never identified. Surface it instead of filing it under a catch-all.

### Creating TCs: modality matrix

| TMS stack | Manual test | Automation-candidate test |
|-----------|-------------|---------------------------|
| Xray on Jira | Two-step (Xray Cloud silently drops inline steps): (1) `[TMS_TOOL] Create Test: type=Manual` without inline steps, (2) `[TMS_TOOL] Add Test Step` per step (optionally verify with `[TMS_TOOL] Get Test`), then `[ISSUE_TRACKER_TOOL] Update Issue` to paste the complete Description template | `[TMS_TOOL] Create Test: type=Cucumber, gherkin=<high-quality gherkin>` then `[ISSUE_TRACKER_TOOL] Update Issue` with the Description template |
| Native Jira (no Xray) | `[ISSUE_TRACKER_TOOL] Create Issue: issueType=Test, description=<steps table>` | `[ISSUE_TRACKER_TOOL] Create Issue: issueType=Test, description=<gherkin in Description>` |

Always fill Description with the full TC template (Related Story, Priority, ROI, Prior bugs, Test Design gherkin or steps, Variables table, Implementation Code table, Architecture, Available Test IDs, Preconditions, Expected Results). Read `references/jira-test-management.md` when choosing between Xray and native Jira, or when the Description must be filled.

Dispatch follows `## Subagent Dispatch Strategy`. The briefings for both modalities, the sharding rule, the error protocol and the aggregation contract are in `references/tms-architecture.md` §"Parallel TC creation"; the serial flow below is what each subagent runs for its chunk.

### High-quality Gherkin (for Candidates)

```gherkin
@{priority} @regression @automation-candidate @{US_ID}
Scenario Outline: should <outcome> <connector> <condition>
  """
  Bugs covered: BUG-1, BUG-2
  Related Story: {US_ID}
  """

  # === PRECONDITIONS (tester / script builds them) ===
  Given <entity> exists with <identifier>
  And <entity> has <quantity> <elements> where <quantity> <condition>

  # === ACTION ===
  When the user navigates to "<route>"
  And the user <main_action>

  # === VALIDATIONS ===
  Then <ui_element> is displayed with format "<expected_format>"
  And <additional_validation>

  # === EQUIVALENT PARTITIONS ===
  Examples: Happy path
    | ... |
  Examples: Edge case
    | ... |
```

Rules that always apply:

- Use `{variable}` placeholders, never hardcoded data (no literal UUIDs or emails): `{mentor_id}`, not `550e8400-...`, with a Variables table saying how to obtain each value.
- Tags always include the priority (`@critical|@high|@medium|@low`), the suite (`@regression`, plus `@smoke` for the critical path), the automation flag (`@automation-candidate`) and the traceability tag (`@{US_ID}`).
- Use the structured comments `# === PRECONDITIONS ===`, `# === ACTION ===`, `# === VALIDATIONS ===` and `# === EQUIVALENT PARTITIONS ===`.
- Put the metadata in the docstring: related story, bugs covered, ROI.

### Workflow transitions

State and transition names resolve from `.agents/jira-workflows.json` (manifest at `.agents/jira-required.yaml` `work_types.test_case`) through `{{jira.status.test_case.<slug>}}` and `{{jira.transition.test_case.<slug>}}`. The full state machine is in `references/tms-conventions.md` §5.

```
Draft --start_design--> In Design --ready_to_run--> Ready --+-- for_manual                  --> Manual    (terminal manual)
                                                            +-- automation_review_from_ready --> In Review
                                                                                                  |
                                                                                                  +-- approve_to_automate --> Candidate (feeds test-automation)
```

The automation tail (`start_automation` to In Automation, `create_pr` to Pull Request, `merged` to AUTOMATED) belongs to `/test-automation`; `merged` is fired only through mode `post-promotion` (`references/post-promotion-pass.md`).

Move one state at a time; rework takes a `back_from_<state>` transition (for example `back_from_ready` to in_design).

The ROI verdict decides which branch a TC takes. All three end in a status; none is "leave it wherever":

| Verdict | Transitions to fire | TC ends at |
|---|---|---|
| Candidate | `{{jira.transition.test_case.automation_review_from_ready}}` then `{{jira.transition.test_case.approve_to_automate}}` | `{{jira.status.test_case.candidate}}` (this is what `/test-automation` picks up) |
| Manual | `{{jira.transition.test_case.for_manual}}`, fired from `ready` and not routed through `in_review` | `{{jira.status.test_case.manual}}` |
| Deferred | none | stays `{{jira.status.test_case.ready}}` (jira-xray: the unpromoted sprint Test; jira-native: no TC was created at all) |

Candidate and Manual are fired only after a person signs the verdict, and the TC's ROI comment then carries `Verdict signed: <who>, <where>, <when>` (format, who may write it, and the sign-only pass for a legacy unsigned Candidate: `references/tms-conventions.md` §9). A Candidate without that line does not pass `/test-automation`'s TC source gate.

There is no `in_review` to `manual` edge in the catalog. A TC already at `candidate` demotes through `{{jira.transition.test_case.manual_execution_from_candidate}}`. Canon: `agentic-qa-core/references/artifact-lifecycle.md` §1.1.

When a slug does not resolve (renamed Test statuses, stale catalog), run the fallback protocol in `agentic-qa-core/references/artifact-lifecycle.md` §4: list the live transitions, propose the closest synonym in one `AskUserQuestion`, fire the live id on yes, and recommend `bun run jira:sync-workflows`. A TC never stays at `draft` because a slug did not resolve.

### Naming: the one rule that matters

```
{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]
```

- The prefix is always `{US_ID}`, the key of the coverable: the User Story, or the coverage Tech Story of a discovery-driven scope (`agentic-qa-core/references/discovery-driven-doctrine.md` §3). It holds in every modality: Jira-native, Xray with Test Sets, Xray without. Test Set membership is a TC to ATS issue link wherever the Test Set work type exists, plus the Xray-internal membership under jira-xray (managed via `/xray-cli`, read via the `test enrich` command of `/xray-cli`), and it never appears in the TC title.
- The expected outcome is a verb plus object after `should`, the asserted behavior (`grant access`, `reject login`, `cap input length`).
- The conditional part is the optional connector clause (`when …` or `if …`) plus an optional `given <precondition>`. Omit it for unconditional behavior.
- Entity and process names inside `<expected outcome>` and `<condition>` come from the `business-domain-context` map when generated. Use canonical business terms only; code identifiers do not appear in TC titles or bodies.
- In code (KATA), use the `@atc('PROJ-101')` decorator (the TC's Jira key, a string literal, no template literals) and `should <behavior> when <condition>` in `test()` blocks. The grouping `describe()` uses the `'{US_ID}: Validate <feature>'` form.

Reject titles like `"Login test"`, `"Login - error"` and `"TC1: Test form"`.

#### Title on promotion: re-derive, verify, then label

The form above binds every write path, not just `create`. A TC that enters the regression repository with a sprint-era summary leaves the RTP unreadable at a glance, and `/test-automation` cannot map its Jira key to an `@atc` behavior name.

On every promotion (jira-xray: a sprint `Test` selected into the RTP; jira-native: a Stage-4 `Test` created from a sprint outline), before membership and before the label:

1. Re-derive the title from the TC's own Precondition + Action + verifiable outcome, not from the sprint outline's wording, which was written for an in-sprint run.
2. Keep the `{US_ID}: TC#:` prefix. `{US_ID}` is the source Story key and never changes on promotion. `#` is a stable index within that Story, assigned once and reused forever. Renumbering breaks every ATP/ATR matrix row and `@atc` reference that cites the TC, so leave the gap a deferred sibling creates.
3. Rewrite the summary when the live value differs (`[ISSUE_TRACKER_TOOL] Update Issue`; the summary is a Jira field, so it never routes through `[TMS_TOOL]`, in either modality).
4. Verify the stored summary matches the form and carries no anti-pattern, then apply `regression-candidate` and add the TC to the RTP. Label and membership come last, so a wrongly-titled TC is never reachable from the regression plan.

Note each old and new title in the promotion step's `progress.md` checkpoint.

### Labels: baseline per TC

Every TC gets at least one scope label and one status label:

- Scope (required, one or more): `regression` (almost always), `smoke` (critical path only, aim for 10-20% of the suite), `e2e`, `integration`, `functional`.
- Status (applied as the TC moves): `automation-candidate`, `manual-only`, `automated`. `automation-candidate` and `manual-only` are mutually exclusive, and `automation-candidate` comes off once the TC is `automated`.
- Priority (optional): `critical`, `high`, `medium`, `low`.

Full reference: `references/tms-conventions.md` §Labels.

### Local cache (synced, never hand-authored)

After TMS creation, materialize the per-TC cache with `bun run jira:sync-issues get <STORY_KEY>`. The sync writes one markdown file per linked `Test` issue into `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/test-cases/TEST-<KEY>-<slug>.md`. That directory is `[SYNC]` (a gitignored Jira mirror, see `.agents/instructions/agent-local-context-pbi.md`): this skill creates the `Test` issues in the TMS, links them to the Story, runs the sync and reads the materialized files, and it never authors files in `test-cases/`. The file format is in `references/jira-test-management.md` §Local cache. The cache saves re-reading the TMS and gives `test-automation` an immediate handoff.

### Reports: fixed filenames

Phase 3 writes exactly two files to `.context/reports/`, both named from the session `<scope>`:

| File | Holds |
|---|---|
| `.context/reports/COVERAGE-MATRIX-<scope>.md` | AC, scenario, TC key and verdict grid, plus the e2e regression flow each Candidate belongs to (§"Grouping Candidates into e2e regression flows"); the uncovered-AC list |
| `.context/reports/PRIORITIZATION-<scope>.md` | Every scenario with its five ROI factors, score, and Candidate / Manual / Deferred verdict |

`<scope>` is the same value as the session directory `.session/test-documentation/<scope>/`: `<JIRA-KEY>` for ticket or bug scope and a discovery-driven gap, `<module-slug>` for module scope and a per-module discovery-driven scope, `<YYYY-MM-DD>-adhoc` for ad-hoc scope. A re-run on the same scope overwrites its own pair and nothing else.

Both files are `[LOCAL]`, not deliverables: `.context/reports/` is gitignored and exists only on the generating machine (`.context/reports/README.md`), so nothing downstream may depend on either. Candidate and Manual verdicts survive as TMS `Test` issues with their ROI comment, but Deferred scenarios create no TMS item by design, so their reasoning needs a second home. After `PRIORITIZATION-<scope>.md` is written, mirror its Deferred list as a Jira comment on the scope's Story or Epic (the same fallback-comment pattern as `.agents/jira-required.yaml` `fallback:`):

```
[ISSUE_TRACKER_TOOL] Add comment:
  issue: {SCOPE_KEY}
  body: |
    ## Prioritization — Deferred scenarios

    | Scenario | ROI | Why deferred |
    |---|---|---|
    | <scenario> | <score> | <Phase-0 gate failed / band / one-time validation> |
```

When the comment already exists from an earlier run on this scope, replace it instead of appending a second. For module scope with no single owning issue, comment on the Regression Epic.

### Light stage verifier (closes the Documentation stage)

Run the eight-line template in `agentic-qa-core/references/artifact-lifecycle.md` §5, with these stage-specific lines:

```
[ ] Every documented TC exists by KEY, parented to the QA Test Repository epic,
    with components set and assignee = self
[ ] Every TC left its {{jira.status.test_case.draft}} birth status — Candidate at
    {{jira.status.test_case.candidate}}, Manual at {{jira.status.test_case.manual}},
    Deferred stated as deliberately left at {{jira.status.test_case.ready}}
[ ] Every promoted TC's summary matches the canonical form, re-derived and verified
    BEFORE the `regression-candidate` label and RTP membership (§"Title on promotion")
[ ] RTP at {{jira.status.test_plan.ready}}, assignee = self, NOT completed
[ ] Promoted TCs added to the RTP (and the optional feature TS) — membership verified
[ ] Every Candidate grouped into a named e2e regression flow, and the grouping written
    to the RTP description `## Regression flows` (not only to COVERAGE-MATRIX)
[ ] Preconditions at {{jira.status.precondition.active}} (no transition exists — stated N/A)
[ ] Any unmapped slug went through the §4 fallback (asked), never a silent skip
```

### Per-phase progress + Archive

After each Phase 1, 2 and 3 step (including each parallel TC-creation chunk), the orchestrator appends a phase entry to `.session/test-documentation/<scope>/progress.md` per `agentic-qa-core/references/session-management.md` §7. A 60-TC batch dispatched as 6 chunks of 10 produces 6 `## Phase 3.chunk-<N>` entries, each recording which TC IDs landed, so resume dispatches only the missing chunks.

Once the Phase 3 final report and both reports land and the Deferred list is mirrored to Jira, the orchestrator archives per `agentic-qa-core/references/session-management.md` §8: it moves `.session/test-documentation/<scope>/` to `.session/.archive/<YYYY-MM-DD>-test-documentation-<scope>/` (the two-file dir preserved) and calls `mem_session_summary` with the archive path. The durable record is the TMS: `Test` issues with their ROI comments for Candidate and Manual, and the mirrored `## Prioritization — Deferred scenarios` Jira comment for everything Deferred. The per-TC `test-cases/*.md` files are a gitignored synced cache, recoverable with `bun run context:hydrate`. On a partial failure (some chunks rate-limited with 429), archive does not run: `progress.md` keeps the per-chunk state so resume picks up the missing ones.

---

## Gotchas

- Effort and Dependencies sit in the ROI denominator, so a "critical flow" with Effort=5 and Dependencies=5 has low ROI by design, not by formula bug.
- The prior-bug rule overrides ROI thresholds: a scenario tied to a closed bug enters regression even at ROI 1.5-3.0. Source: `references/tms-conventions.md` §9, Phase 0 filter Q2 (prior bugs get priority even at moderate ROI) plus the `1.5-3.0` "Case by case" band.
- Cross-cutting concerns ("Mobile responsive", "XSS prevention", "Performance") are never TCs on their own. Validate them inside other TCs or in an app-level suite.
- Create the ATS, ATP and ATR before the first TC. Creating TCs first gives orphaned references, and mode `repair-traceability` is then the only way out. This container-first order is an intended asymmetry with `/sprint-testing` Stage 1 (TCs first, ATS grown incrementally): module-driven Stage 4 pre-creates the targets because parallel TC-creation sharding needs them to exist.
- Xray needs two calls: `[TMS_TOOL] Create Test`, then `[ISSUE_TRACKER_TOOL] Update Issue` to paste the full Description. Without the second, the TC has no readable documentation in Jira.
- Xray Cloud silently drops steps passed to the create call, so a `type=Manual` Test is created without inline steps and each step is added with `[TMS_TOOL] Add Test Step` (optionally verified with `[TMS_TOOL] Get Test`). Cucumber Tests are unaffected (Gherkin is a single field). CLI syntax lives in `/xray-cli`.
- One (precondition, action) pair is one TC, and every expected result of it belongs to that TC. Splitting assertions into separate TCs is the most-diagnosed anti-pattern in reviews.
- A bug qualifies for a regression Test only after the Bug-driven decision in Compact Rules: a closed bug is strong evidence the area regresses, so most lean Candidate, but a one-time typo in a stable area is Deferred with no new Test.
- The ATP was written before code, so validate against source: grep for `data-testid=`, routes and text formats, and log discrepancies in a Refinement Notes section on the TC.
- Derive widely, document the repeatable, automate the few: three layers, three counts. Design and derive in `/sprint-testing` (many cases by technique, recorded in the prioritization analysis, not the TMS). Document here only the scenarios worth re-running, Candidate and Manual; Deferred ones stay in the prioritization report (see Three outcomes). Automate the Candidates in `/test-automation`. The healthy shape is "analyzed 80, documented 12, automated 8", never "document all 80". Under jira-xray the 80 may already exist as sprint `Test` artifacts, so "document 12" means promote 12 into the Regression Test Plan. A test enters the regression repository because it will be re-executed, never to hit a coverage count; when most scenarios come out Candidate or Manual, apply the Phase 0 gate harder.
- Session-footer contract: the final phase is not done until the two chat-facing blocks from `../agentic-qa-core/references/session-footer-contract.md` are printed. Block one is the consolidated screenshot list (repo-relative paths, verified on disk, bug annotations first), with each capture's path surfaced the moment it lands. Block two is the Session Footer listing the skills, MCPs and CLIs actually used and the testing levels touched, with explicit "none" for expected-but-untouched levels. The framing for this skill is curation. In multi-subagent sessions each stage report carries the five footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `testing_levels_touched`, `screenshots_captured`) and the orchestrator compiles the footer once at close, in chat only, never in a Jira comment or ATR body. Lessons noticed during the session are proposed to `.session/<skill-slug>/<scope>/refinements.md` and never applied to a live skill, per `../agentic-qa-core/references/skill-refinement-protocol.md`; the footer's `Refinements proposed:` line counts them.

---

## Specific tasks

- Creating ATP/ATR/TC or checking links: `references/tms-architecture.md` (entity model, required fields, linking sequence, completeness criteria).
- Naming a TC, picking labels, or choosing Gherkin vs Traditional: `references/tms-conventions.md` (naming formulas, label taxonomy, workflow state machine, ROI table).
- Jira native vs Jira+Xray, creating tests with the right tool, or the full Description template: `references/jira-test-management.md` (mode comparison, Xray issue types, Description template, local cache template, CI/CD sync).
- Fixing broken traceability (TC not linked to US/ATP/ATR, wrong name): the Linking order above, backed by `references/tms-architecture.md` §Traceability Rules.
- Deciding whether a bug deserves a regression TC: the Bug-driven decision (§"When to use each scope"), Phase 0 Q2 plus ROI. A regression-worthy bug reuses the existing failed Test or gets a new one (golden rule); otherwise it is treated as a failed test: Deferred, no new Test.
- TMS operations: load `/xray-cli` for CLI syntax. Issue-tracker operations resolve through `[ISSUE_TRACKER_TOOL]` per AGENTS.md Tool Resolution.
  - Reads and writes split (`agentic-qa-core/references/acli-integration.md` §"Reads vs writes"). Detailed reads (custom fields, ACs, ATP/ATR, description, comments, linked bugs) go through `bun run jira:sync-issues get <KEY> --include-comments` (or `jql "<query>"`), then the synced `.md`. Never use `acli workitem view` for custom fields: it returns nothing for them. TMS writes (create Test / Test Plan / Test Execution / link / transition / comment / import) and traceability or List-Tests link-graph reads go through `[TMS_TOOL]` (acli/xray). Trivial metadata and list or search lookups (issue types, key lists) use acli `view`/`search`.
- Session contract (resume, plan.md/progress.md schemas, per-chunk checkpoint, archive policy, Engram per-phase checkpoint): `../agentic-qa-core/references/session-management.md`. This skill produces `session/test-documentation/<scope>/...` topic keys.

---

## Inputs

The reading order for an AI starting cold. Stop early when the scope is narrow enough that later inputs add no signal.

Phase 0 resolves the TMS modality (A: Xray vs B: Jira-native) live from `.agents/project.yaml` `testing.tms_cli`, sticky in `plan.md`. Phase 3 §Preflight resolves the Regression Epic through JQL by the configured name (`type = Epic AND summary ~ "QA Test Repository"`, the value of `qa.qa_epics.test_repository_epic.name`; identity label `QA-Artifact`). Label taxonomy defaults live in `references/tms-conventions.md`. No external TMS config file is read.

1. `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/`: ticket-local context (module = Epic, 1:1). The detailed read materializes the full synced Story folder; read all of it, every per-field `.md` (`story.md`, `acceptance-criteria.md`, scope, business rules) plus `comments.md`. Existing ATP and ATR are modality-aware reads (see §Phase 0). jira-native: Story-folder `acceptance-test-plan.md` and `acceptance-test-results.md` (synced from Story fields `{{jira.acceptance_test_plan}}` and `{{jira.acceptance_test_results}}`). jira-xray: `test-plans/ATP-<KEY>-<slug>.md` (Test Plan `description`) and `test-executions/ATR-<KEY>-<slug>.md` (Test Execution `description`, sync supports these types), with per-TC run results through `[TMS_TOOL]` (xray-cli).
2. `.agents/jira-required.yaml`: the canonical slug catalog for fields, statuses and link types.
3. `.agents/jira-fields.json`: the slug to numeric custom-field-ID mapping for ADF and API calls.
4. `.agents/jira-workflows.json`: the `test_case` workflow and transition catalog (Draft, In Design, Ready, and so on).
4b. `agentic-qa-core/references/artifact-lifecycle.md`: the canonical authority for artifact statuses. It holds the verdict to status mapping for TCs, the RTP that stays `ready`, assignee-at-create on every artifact this skill makes, the unmapped-status fallback (§4) and the light stage verifier that closes the stage (§5). Read it before firing any transition.
5. `.context/PBI/qa-artifacts/master-test-plan.md`: the Master Test Plan (a cache of the `QA Master Test Plan` Epic description; when missing, run `bun run context:hydrate`). It holds the prioritization rubric, what to test and why.
6. The Story's AC and spec through `bun run jira:sync-issues get <STORY> --include-comments`, then every synced `.md` in the folder, not one field. Do not use `[ISSUE_TRACKER_TOOL]` `view`, which returns null for custom fields. A TC body is the `Test` issue `description` (synced in both modalities through `bun run jira:sync-issues get <TEST-KEY>`); the Xray Gherkin / Test-Steps plugin field is not synced, since it mirrors the description, so read the synced TC `.md` for Gherkin or steps.

---

## Anti-patterns

- D1. Do not hand-write ADF JSON for Test Case, ATP or ATR bodies; hand-authored ADF drifts and breaks renderers. Author the body in Markdown, convert and validate it with `.agents/skills/acli/scripts/md-to-adf.ts`, then publish the resulting ADF JSON through `[ISSUE_TRACKER_TOOL]`, which never converts Markdown on the CLI path (`sprint-testing` S6).
- D2. Do not ship a Test Plan without traceability to a Story or Epic: orphan ATPs are unauditable. Link before the first TC lands.
- D3. Do not over-detail Test Case steps: the spec or KATA ATC is the source of truth, and the step list is a pointer.
- D4. Do not skip ROI scoring: every TC has a Candidate, Manual or Deferred verdict before the handoff to `/test-automation`.
- D5. Do not mix Modality jira-xray and Modality jira-native inside the same Story's ATP. Modality is one-shot per project and Phase 0 resolves it.
- D6. Do not fabricate Jira field IDs. Run `bun run jira:sync-fields --force` and resolve through `{{jira.<slug>}}`, because a hardcoded `customfield_NNNNN` drifts silently.
- D7. Do not link an ATR to multiple ATPs. The relationship is 1:1 (one plan, one results record); multiple ATRs per ATP is fine, the inverse is not.
- D8. Do not reopen a Closed bug to attach a regression TC. File a new TC and link it to the bug through `tests / is tested by`, so bug history stays immutable.

---

## Quick reference: pseudocode per modality

Resolve `[TMS_TOOL]` and `[ISSUE_TRACKER_TOOL]` through `AGENTS.md` §Tool Resolution. The two modality blocks below are parallel: pick one based on Phase 0.

### Regression epic (both modalities, run once per project)

Prerequisite: load `/acli` before running the commands below.

```
[ISSUE_TRACKER_TOOL] Search Issues:
  project: {{PROJECT_KEY}}
  query: type = Epic AND summary ~ "QA Test Repository"   # resolve by configured name qa.qa_epics.test_repository_epic.name

# If none, ask the user before creating:
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Epic
  title: "QA Test Repository"
  labels: QA-Artifact, regression, qa
```

### Modality jira-xray

Prerequisite: load `/xray-cli` and `/acli` before running the commands below.

```
# ATS = Xray Test Set issue — MANDATORY per Story (Set-first: create/update it FIRST).
# Parent Epic: QA Test Artifacts
[TMS_TOOL] Create TestSet:                        # find-or-create — the ATS may exist from Stage 1
  project: {{PROJECT_KEY}}
  title: ATS: {US_ID}: {story title}
  components: {inherited from the source Story}   # mandatory — the components exemption is feature-level TS: only
  tests: []                       # filled as TCs are created; holds ALL the Story's TCs (even one)

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Set (ATS) — THE coverage-panel link
  outward: {ATS_KEY}
  inward:  {STORY_KEY}
# Coverage truth (xray-cli/SKILL.md §Direction): only this ATS->Story link fills the Xray coverage
# panel. The ATP->Story / ATR->Story links below are administrative traceability only.

# ATP = Xray Test Plan issue — find-or-create. Pre-sprint the ATP lives in the Story
# field {{jira.acceptance_test_plan}} (written by /shift-left-testing); the ITEM is
# created by /sprint-testing Stage 1 from that field. Create here ONLY when running
# module-driven and no Story ATP item exists.
# Parent Epic: QA Master Test Plan
[TMS_TOOL] Create TestPlan:
  project: {{PROJECT_KEY}}
  title: ATP: {STORY-KEY}: {story title}
  components: {inherited from the source Story}   # mandatory (defect-management doctrine Part 3)
  tests: []                       # derived from the ATS membership (Set-first)

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Plan (resolve by slug + verify direction per agentic-qa-core/references/traceability-linking.md §2/§4)
  outward: {ATP_KEY}
  inward:  {STORY_KEY}

# ATR = Xray Test Execution issue
# Parent Epic: QA Test Artifacts
[TMS_TOOL] Create Execution:
  project: {{PROJECT_KEY}}
  title: ATR: {STORY-KEY}: Story Testing
  testPlan: {ATP_KEY}
  components: {inherited from the source Story}   # mandatory (defect-management doctrine Part 3)
  environment: {from .env or session context}
  tests: []                       # derived from the ATS membership (Set-first); filled at Stage 3 or via CI import

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Execution
  outward: {ATR_KEY}
  inward:  {STORY_KEY}

# TC = Xray Test issue (Cucumber for Candidates; Manual for Manual-only)
# Parent Epic: QA Test Repository
[TMS_TOOL] Create Test:
  project: {{PROJECT_KEY}}
  type: Cucumber
  title: {US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]
  labels: regression, automation-candidate, e2e, critical
  components: {affected product module}           # mandatory (defect-management doctrine Part 3)
  gherkin: {from high-quality gherkin}

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template}

# Set-first: add the TC to the Story's ATS FIRST (Xray membership + the TC->ATS link, both
# required — traceability-linking.md §9), then to the ATP (designs) and ATR (executes) —
# whose test lists derive from the ATS membership.
[TMS_TOOL] AddTests:
  testSet: {ATS_KEY}         # ATS holds ALL the Story's TCs — the coverage backbone
  tests: [{TEST_KEY}]
[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # ATS is tested by TC — the membership link
  outward: {TEST_KEY}
  inward:  {ATS_KEY}
[TMS_TOOL] AddTests:
  testPlan: {ATP_KEY}        # ATP "designs" the TC (TC "is designed by" ATP)
  tests: [{TEST_KEY}]
[TMS_TOOL] AddTests:
  execution: {ATR_KEY}       # ATR "executes" the TC (TC "is executed by" ATR)
  tests: [{TEST_KEY}]
# Do NOT create a Story<->TC issuelink while the ATS exists — coverage flows through the
# ATS->Story link. Direct TC->Story is the cascade's LAST RESORT (no ATS available);
# the defect is a TC with NO path to its Story, not the direct link itself.

# CI result flow (Stage 6)
[TMS_TOOL] Import Results:
  format: xray-json    # never junit: it creates Tests
  file:   the per-ATC payload built from reports/atc_results.json (one testKey per @atc id)
  execution: {ATR_KEY}
```

### Modality jira-native (no Xray): degraded fallback only

By excellence the ATP is a native Jira `Test Plan` issue (parented to QA Master Test Plan) and the ATR a `Test Execution` issue (parented to QA Test Artifacts), whether or not Xray is present: use the `[TMS_TOOL] Create TestPlan` and `Create Execution` blocks above. The Story-field path below is the degraded fallback, used only when those work types are unavailable in the instance and cannot be created or linked. Once the items exist they are the single source of truth and the fields go unused. This mirrors `references/tms-architecture.md` §"Modality jira-native — DEGRADED FALLBACK ONLY".

ATS in jira-native (D6, work types present means items): with the Test Set work type, create the ATS item (`ATS: {US_ID}: {story title}`, parent QA Test Artifacts, components inherited from the Story), link it to the Story (`is tested by`) and express membership as TC to ATS issue links (`traceability-linking.md` §9). Without the work type there is no ATS: link each TC to the Story directly (the last-resort step, shown below).

Prerequisite: load `/acli` before running the commands below.

```
# ATS = Test Set issue (when the work type exists — see note above)
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test Set
  summary: ATS: {US_ID}: {story title}
  components: [{inherited from the source Story}]   # mandatory — exemption is feature-level TS: only
  # Parent Epic: QA Test Artifacts

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Set (ATS)
  outward: {ATS_KEY}
  inward:  {STORY_KEY}

# ATP = Story customfield (fallback only). NO separate issue.
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_plan}}: {Test Analysis body}

# FALLBACK only if {{jira.acceptance_test_plan}} is absent in .agents/jira-fields.json:
[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: |
    ## Acceptance Test Plan (ATP)
    {Test Analysis body}

# ATR = Story customfield (fallback only). NO separate issue.
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_results}}: {Test Report body}

# FALLBACK only if {{jira.acceptance_test_results}} is absent in .agents/jira-fields.json:
[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: |
    ## Acceptance Test Results (ATR)
    {Test Report body}

# TC = Jira-native Test issue (custom issue type configured per jira-setup.md)
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test                               # or Task with a Test Type custom field
  summary: {US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]
  priority: {Critical|High|Medium|Low}
  labels: [regression, automation-candidate, e2e, critical]
  components: [{affected product module}]         # mandatory (defect-management doctrine Part 3)
  epic: {REGRESSION_EPIC_KEY}

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template — includes Gherkin if Candidate}

# Membership: with a Test Set work type present, add the TC to the ATS via an issue link
# (the same TC->ATS link jira-xray carries — traceability-linking.md §9):
[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # ATS is tested by Test (TC -> ATS membership link)
  outward: {TEST_KEY}
  inward:  {ATS_KEY}

# jira-native WITHOUT a Test Set work type ONLY (no ATS possible): link the TC to the
# Story directly — the cascade's LAST-RESORT edge (TC -> ATS -> Story is primary,
# TC -> ATP -> Story secondary/placement-only, TC -> Story direct last). The defect is a
# TC with NO path to its Story, not this direct link.
# This does NOT apply to jira-xray, where the ATS carries coverage and TCs link to the ATP (designed-by) + ATR (executed-by).
[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test (last-resort traceability edge)
  outward: {TEST_KEY}
  inward:  {STORY_KEY}

# CI result flow (Stage 6) — custom script, no auto-import
for each {TEST_KEY} in run:
  [ISSUE_TRACKER_TOOL] Update Issue:
    issue: {TEST_KEY}
    fields:
      Test Status: {PASSED|FAILED|NOT RUN}  # PASSED/FAILED only from a run in the environment the precondition names (doctrine §5); a KNOWN-BLOCKED test is NOT RUN
  [ISSUE_TRACKER_TOOL] Add Comment:
    issue: {TEST_KEY}
    body: "Run {date}: {result}. Env: {env}. CI: {url}"  # KNOWN-BLOCKED: append "blocked by {BUG-KEY}"
```

### Workflow transition (both modalities, same state machine)

Prerequisite: load `/acli` before running the commands below.

```
[ISSUE_TRACKER_TOOL] Transition Issue:
  issue: {TEST_KEY}
  transition: {{jira.transition.test_case.start_design}}   # Draft -> In Design
  # later: {{jira.transition.test_case.ready_to_run}}              # In Design -> Ready
  # later: {{jira.transition.test_case.automation_review_from_ready}}  # Ready -> In Review
  # later: {{jira.transition.test_case.approve_to_automate}}      # In Review -> Candidate
  # OR:    {{jira.transition.test_case.for_manual}}               # Ready -> Manual
```
