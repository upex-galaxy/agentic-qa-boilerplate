# ADR-0002 — Every regression verdict gets its own run record: the RTR

- **Status:** Accepted
- **Date:** 2026-09-23
- **Deciders:** QA architect (framework owner); decided through the RTR spike deck (decisions D1-D6 below, every recommendation accepted on 2026-09-23)
- **Tags:** traceability, tms, artifact-ladder, regression, ci, xray, write-back
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The planning ladder ratified on 2026-06-26 and amended on 2026-08-21 and 2026-09-15 (`.agents/skills/agentic-qa-core/references/planning-ladder.md`) gives every altitude a Plan and, above the Master rung, a Runner: STP has the STR, ATP has the ATR. The 2026-09-15 amendment added the RTP, the long-lived Regression Test Plan that `/test-documentation` fills by promotion, and left its Runner cell empty with the note "the STR runs it". ADR-0001 recorded that ladder in its own table (Master, Feature, Sprint, Story) before the RTP existed. A spike on 2026-09-22 (`.session/spikes/rtr/plan.md`, read-only, every fact cited from the checkout) established that the empty cell is a real gap, for five reasons that hold together:

1. **The STR is the wrong altitude for a regression run.** Doctrine defines the STR as a per-sprint recap, born at sprint close, closed after the sprint's verdict (`artifact-lifecycle.md` §1). The regression suite is a nightly, pre-release run (`regression-testing/SKILL.md`). A recap of one sprint cannot be the record of a run that happens fifteen times inside that sprint and keeps happening after it.

2. **The only CI import target is one static secret, shared by three suites.** `regression.yml`, `smoke.yml` and `sanity.yml` all import into `STP_EXECUTION_KEY`, a GitHub secret that somebody rotates by hand every sprint. Nothing reads "the current sprint's STR": a stale secret files this sprint's runs into last sprint's recap without a warning. And because smoke and sanity share the key, a one-file sanity run flips a handful of Test Runs inside the sprint's regression execution, which is exactly what the skill's own anti-pattern R6 ("never mix smoke and regression results into one pass-rate number") forbids.

3. **There is no per-run record.** An Xray import into an existing Execution updates that Execution's Test Runs in place: fifteen nightly imports leave ONE status per Test and no history of the runs that produced it. The GO / CAUTION / NO-GO verdict is computed per run (`regression-testing/SKILL.md` Phase 3), yet the STR is closed "after the verdict". Which verdict? After the first nightly the STR is at `close` and every later import lands on a closed container (`reactive` exists in the catalog and is deliberately unused, `artifact-lifecycle.md` §1.1).

4. **A run outside a sprint has no home.** Release-candidate, hotfix and post-deploy regressions happen between sprints. The skill is told never to invent a sprint number and to ask instead; the code fallback in `tests/utils/jiraSync.ts` mints an unparented `STR: Build#{id}: Regression Testing` per run, the exact shape `docs/methodology/kata-fundamentals.md` §5.4 says this repo removed.

5. **The ladder itself says so.** The RTP row's Runner cell is empty. FTR was cut in 2026-08-21 because it duplicated the STR; a regression run record does not duplicate the STR, because the two answer different questions. The STR answers "how did the sprint go" (a recap at a sprint boundary, `traceability-linking.md` §3 calls it a sibling recap). A regression run answers "is this build releasable".

Two constraints shape the decision. The catalog must not grow: `test_execution` already carries `active` → `complete` → `close` (`.agents/jira-workflows.json`), and the ladder grammar `{ACRONYM}: {scope}: {desc}` is ratified. And Modality `jira-native` has no Test Execution work type at all (`test-documentation/references/jira-setup.md`; CI skips the import job outright there), so whatever is decided must degrade the way the STR already does.

## Decision

**We will record every regression run that produces a verdict as its own Test Execution, the RTR (Regression Test Results), linked to the RTP and parented to QA Test Artifacts. One RTR per verdict. The RTR is the CI import target of that run.**

| Property | Value |
| --- | --- |
| Name | **RTR: Regression Test Results.** Pairs with the RTP the way STR pairs with STP and ATR with ATP ("Results", plural, matches the family) |
| Work type | `test_execution`, the same workflow as STR and ATR: `active` → `complete` → `close`. **No catalog change** |
| Title | `RTR: {scope-id}: Regression Testing`. Scope-id = `{env}-{YYYY-MM-DD}` by default (an optional `#2` suffix for a second verdict on the same day); a release tag such as `v2.3.0-rc1` when the run is a release candidate. Examples: `RTR: staging-2026-09-23: Regression Testing`, `RTR: v2.3.0-rc1: Regression Testing` |
| Parent | **QA Test Artifacts** epic (axis 1), like every Execution |
| Plan link | Xray `testPlan` field → the **RTP**, the same mechanism the STR uses toward the STP |
| TC edge | the existing `test_execute` slug (`executes`); membership arrives with the imported Test Runs. No new slug. Whether the Jira-layer edge is materialized explicitly follows the same rule as the ATR (`traceability-linking.md` §9) |
| Environment | `testEnvironments` from `active_env`, set at create (the environment gate already binding on every Execution) |
| Assignee | self, at create (`artifact-lifecycle.md` §2) |
| Cardinality | **one RTR per verdict** |
| Verdict | the GO / CAUTION / NO-GO comment is posted on the RTR; it is the durable record of the run |
| Modality | jira-xray only. jira-native: no item, skip with a stated note; the results are the per-Test status writes and the `[LOCAL]` report |

**Lifecycle of one RTR.** `/regression-testing` creates it at `active` in Phase 1, BEFORE the CI trigger, so CI receives its key as the import target. An environment re-run before the verdict imports into the same RTR. A re-run AFTER a verdict (a NO-GO fixed and retried) is a NEW RTR. After the verdict comment is posted: `complete` → `close`. Never `reactive`: a closed RTR is history.

**Relation to the STR (D1, D6).** The STR keeps its role: the sprint-close recap, `STR: Sprint#{N}: Regression Testing`, created by whoever arrives first at sprint close. The sprint-close regression run is recorded as the STR (existing contract) and that STR ALSO carries `testPlan → RTP`, so it has dual membership (STP and RTP) and the RTP's latest-status rollup includes the sprint-close run. Every other regression run is an RTR.

**Write-back (D3, D4).** The CI import target is the RTR of the current run, passed per run: a `workflow_dispatch` input `execution_key` that overrides the `STP_EXECUTION_KEY` secret. The secret keeps its name; its semantics widen to "the Execution this run imports into" (RTR by default, the STR at sprint close). Smoke and sanity never write into a regression execution unless a key is passed to them explicitly; without one they skip the TMS import.

**Two invariants this establishes, so the next reader does not have to re-derive them:**

- **The results side has NO roll-up edge.** There is no `ATR is part of STR`, no `STR is part of RTR`, and no `RTR is part of anything`. An Execution's numbers are its own Test Runs. Per-Story outcomes are read from the ATRs, the sprint's from the STR, a build's from its RTR.
- **`testPlan` is an Xray field on the Execution, not a Jira link type.** STR → STP, STR → RTP and RTR → RTP all ride that field. It is absent from `.agents/jira-link-types.json` by design and never needs a slug.

**The six decisions, as taken (2026-09-23):**

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | Does the STR survive as its own acronym? | Yes. STR for the sprint-close run, RTR for every other regression run |
| D2 | RTR scope-id grammar | `{env}-{YYYY-MM-DD}` (optional `#2` same day); a release tag for a release candidate |
| D3 | `STP_EXECUTION_KEY` | Name kept; semantics "the Execution this run imports into"; `execution_key` workflow input on top |
| D4 | Smoke and sanity write-back | Skip the TMS import unless an execution key is passed explicitly |
| D5 | RTR in jira-native | No item. Stated skip note, per-Test status writes, `[LOCAL]` report |
| D6 | Sprint-close STR also `testPlan → RTP`? | Yes, dual membership (STP + RTP) |

## Consequences

**Positive.**

- Every verdict has a record with its own Test Runs, environment, date and comment. "Which verdict closed the STR" stops being a question; the STR goes back to being what doctrine already said it was, a sprint recap.
- The RTP's own rollup (latest status per Test across Executions) answers "is the regression suite green right now" without anyone writing into the plan. That is the property the RTP was ratified to give.
- The CI import target stops being a secret somebody rotates by hand every sprint. A run carries its target; a stale secret can no longer file this sprint's runs into last sprint's recap.
- Smoke and sanity can no longer corrupt the regression pass rate by writing into its Execution. R6 becomes enforceable instead of advisory.
- Runs outside a sprint (release candidates, hotfixes, post-deploy) have a parented, titled, plan-linked home. The `Build#` fallback stops being the normal path.
- No catalog change: no new work type, status, field or link slug. `kata-manifest.json`, `jira-workflows.json`, `jira-fields.json` and `jira-link-types.json` are untouched.

**Negative / trade-offs.**

- More Jira issues. A nightly suite produces one RTR per verdict, so a project running nightly accrues roughly twenty to thirty closed Executions a month under QA Test Artifacts. They are closed and filterable by title prefix, but the bucket grows.
- One more artifact for `/regression-testing` to create BEFORE the trigger, which means a Jira write on the critical path of every run. If Jira is unreachable the skill must decide between running without a record and not running; that policy lives in the skill, not here.
- Two Executions can now describe the same sprint-close run from different angles (the STR by contract, an RTR if someone triggers a second verdict the same day). The scope-id `#2` suffix and the D1 rule (sprint close = STR, everything else = RTR) are what keep that legible; the reader has to know the rule.
- `STP_EXECUTION_KEY` keeps a name that no longer describes its content. A rename with a deprecation alias is the later cleanup D3 deferred; until then the variable's comment and manifest hint carry the real semantics.
- The flakiness math does not move: the `≥5 runs` history rule and FLAKY / KNOWN-BLOCKED classification stay in Allure history. Per-run RTRs add a Jira-side trail, not a second source of truth, and a reader who expects flake statistics in Jira will not find them.

**Neutral / follow-ups.**

- ADR-0001's ladder table (Master, Feature, Sprint, Story) is extended by reference, not rewritten: the Product-regression rung (RTP + RTR) is a fifth row that ADR-0001 could not have known about. ADR-0001's decision, that the local cache mirrors the title grammar, applies to the new acronyms unchanged: `RTP-<KEY>-<slug>.md` under `test-plans/`, `RTR-<KEY>-<slug>.md` under `test-executions/`, and both guarded at Story altitude.
- The CI change (`execution_key` input; smoke/sanity skip-unless-key) touches workflows on the protected watchlist. Downstream projects receive it as a parity row, never an overwrite.
- The `Build#` fallback in `tests/utils/jiraSync.ts` becomes `RTR: Build#{id}: Regression Testing` with a `testPlan` toward the RTP, so an orphan is at least titled and plan-linked. It remains a fallback, not a path.
- `FTP is part of STP` on the plans side is semantically odd (a feature outlives a sprint). Noted, not touched: it is a different decision.

## Alternatives considered

- **`STP → RTP [is_part_of]`, chaining sprint plans into the regression plan.** Rejected, for five reasons. (1) The RTP is a curated subset, not a union: only `Candidate` and `Manual` verdicts are promoted and `Deferred` never enters, so a sprint plan contains Tests that are by design NOT in the regression plan, and "STP is part of RTP" asserts the opposite containment. (2) Membership is the edge, and it is per Test: promotion = Xray Test Plan membership plus the `regression-candidate` label, and every question a reader asks ("is TC X in regression?", "which sprint fed it?") is answered at TC level via label, membership and the `test` link to its Story. (3) The roll-up is a Plans-of-one-increment mechanism: `traceability-linking.md` §3 makes ATP → FTP → STP optional coverage aggregation within a delivery increment, while the RTP is cross-sprint, product-altitude and has no terminal; chaining thirty STPs into it produces a link panel with no query value. (4) Parenting already expresses belonging: RTP, STP, FTP and ATP all parent to the QA Master Test Plan epic, nothing is orphaned. (5) Doctrine forbids inventing edges: no literal link names, no results-side roll-up, and the same discipline applies to the plans side beyond what the catalog declares. There is also no slug `is_part_of` in the catalog; the roll-up rides the `relates` family with the outward phrase `is part of`.

- **Keep the STR as the RTP's runner (the status quo).** Rejected: it is reasons 1 through 4 of the Context. A per-sprint recap closed after one verdict cannot be the record of fifteen runs, and a static secret cannot follow the sprint.

- **Fold the STR into the RTR and retire the STR like the FTR (D1 option b).** Rejected: purer on paper, but it re-opens the 2026-08-21 amendment, the STP ↔ STR contract, the sprint-close DoD, `/sprint-testing` and five decks, to remove an artifact that still answers its own question. The blast radius is not worth the symmetry.

- **`Build#{run-id}` as the scope-id (D2 option c).** Rejected: it is what the fallback already does and it reads as noise in a Jira list. `{env}-{date}` is what the skill's own session scope already uses; a release tag is what a release reader searches for.

- **Rename `STP_EXECUTION_KEY` now (D3 options b, c).** Deferred: a rename touches downstream GitHub secrets, `cli/lib/variables-manifest.ts`, every README and `.env.example` line. Widening the semantics and adding the per-run input on top delivers the fix without blocking on the cleanup.

- **Smoke and sanity each mint their own Execution, or keep sharing the regression target (D4 options b, c).** Rejected: sharing is the bug (reason 2); one Execution per smoke run is orphan-per-run noise for a suite whose verdict nobody files in the TMS. Skip-unless-key keeps the door open for a project that wants smoke results in Jira and closes it by default.

- **A native `Task`-shaped issue per run in jira-native (D5 option b).** Rejected: it invents a work type the doctrine has never had, for a modality whose STR rule is already "skip with a stated note". Parity with the STR is the smaller promise.

## References

- `.session/spikes/rtr/plan.md`: the 2026-09-22 read-only spike (twelve student claims verified, the RTR shape, the `STP → RTP` rejection, the full ladder after the change, the six decisions). A session artifact, gitignored.
- `.agents/skills/agentic-qa-core/references/planning-ladder.md`: the ratified ladder, the title grammar (§3), the 2026-09-15 RTP amendment and the 2026-09-23 RTR amendment
- `.context/ADR/ADR-0001-artifact-ladder-local-cache.md`: the local cache mirrors the title grammar; extended here by reference
- `.agents/skills/agentic-qa-core/references/artifact-lifecycle.md`: the RTR row (§1), assignee at create (§2), parenting (§3)
- `.agents/skills/agentic-qa-core/references/traceability-linking.md`: the results-side no-roll-up rule and the `testPlan` field note (§3)
- `.agents/skills/agentic-qa-core/references/stage-gates.md`: the Regression contract row, lifecycle row and DoD
- `.agents/skills/regression-testing/SKILL.md`: the producer of the RTR (Phase 1 create, Phase 3 verdict)
- `.github/workflows/regression.yml`, `smoke.yml`, `sanity.yml`: the `STP_EXECUTION_KEY` import target and the `execution_key` input
- `tests/utils/jiraSync.ts`: the import path and the `Build#` fallback
