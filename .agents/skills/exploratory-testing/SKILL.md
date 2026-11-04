---
name: exploratory-testing
description: "Ticket-free exploratory testing of a critical flow, a module or the whole product, across UI, API and DB together, in the Execution stage. Runs a charter, a parallel reconnaissance fan-out, a refutation pass whose job is to kill each finding, a main-thread tie-break, and a handoff where every candidate scenario is executed live, marked NEW / WEAK / COVERED against existing coverage (the coverage gap list, or the KATA manifest plus the TMS), and marked `oracle: observed` until a person confirms it. Feeds `test-documentation` (ROI decides per scenario) and, for behaviour with no Story, the coverage Tech Story. Use whenever the user wants to hunt bugs or find test candidates without a specific ticket, explore a module or flow end to end, run a periodic sweep or health-check round, go back for the gaps the coverage inventory found, or seed test-documentation with validated scenarios. Triggers on: exploratory testing, explore the <module> module, find bugs in <flow>, sweep the app, health-check round, hunt for bugs, discover test candidates, explore the coverage gaps, characterize what the product does, testing exploratorio, explora el modulo de X, busca bugs en, barrido de la app, recorre los huecos de cobertura. Do NOT use for: testing one ticket against its ACs (sprint-testing), formalizing TCs with ROI (test-documentation), writing automated test code (test-automation), building the coverage inventory itself (project-context mode coverage), or pre-code refinement (shift-left-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [testing-e2e, testing-api, issue-tracker, tms]
metadata:
  kind: workflow
  requires_capabilities: [db, api-schema]
  stage_owner: true
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the binding doctrine below and in references/.
compact_rules: |
  - Ticket-free entry into the Execution stage: the scope is a flow, a module or a sweep, never a ticket key (a named ticket routes to `sprint-testing`). Mode from the first `$ARGUMENTS` token (`flow` | `module` | `sweep`), or from a request that clearly names one flow, one module or a sweep (args-as-answers); otherwise ASK.
  - Five steps, always in order: Charter (main thread) -> Recon (Parallel) -> Refute (Parallel) -> Tie-break (main thread) -> Handoff (main thread). Planning and tie-breaks are never delegated. The charter is presented and confirmed before any Recon dispatch, unless the request already named the scope and said go.
  - Build the coverage view BEFORE Recon: the gap list of `project-context` mode `coverage` when it exists, else `coverage-view.json` from `kata-manifest.json` + the TMS Tests read by `bun run context:coverage collect` (never by `jira:sync-issues`: Tests are `sync: never`); a TMS not read is stated `TMS not read` and no manual cover counts. Every candidate is marked NEW / WEAK / COVERED; only a counted `exercises` cover makes COVERED; a `weak`, stale or unverified cover never dedupes a candidate away.
  - Compare at least 2-3 rows plus a control group before calling anything anomalous, and state the detection query verbatim.
  - Refute mandate: every Medium+ anomaly gets a Parallel verifier told to REFUTE it (join fan-out, data quirk, intended behaviour, harness artifact); it survives only if it cannot be explained away. Check a row's own invariant, not just that it differs from another row; execute competing hypotheses side by side, never infer them. Canon: `agentic-qa-core/references/adversarial-verification.md`.
  - Verifier disagreement goes to a main-thread tie-break: a decisive query plus a direct read of the live code path. Never a third verifier, never an average, never one agent's verdict alone on a data-integrity, money or security finding.
  - Oracle: behaviour with no AC is `oracle: observed`; "is this intended?" goes to a person (decision-protocol kind 1), a batch through the `mkd` deck, a single question through the question tool. `oracle: confirmed` (who, where, when) makes the observation PASSED; `not intended` makes it FAILED and a proposed defect. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §4.
  - A candidate is PASSED or FAILED only when observed in the environment its precondition names; a code read, unit test, green CI or another environment leaves it NOT RUN with exactly one reason, BLOCKED or DEFERRED (execution), and it climbs the blocking ladder; with no coverable yet, its follow-up lives on the coverage Tech Story once approved, and until then as an item of the Handoff deck. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.
  - Never call anything that sends, notifies or pushes downstream; reads and previews are fine. A project's own list (`## Never-call endpoints` in `agent-project.md`) is carried verbatim in briefing component 7.
  - Mutations only to set up a precondition, within the charter's budget. Every created row goes into `created_rows` the moment it exists; cleanup re-reads each one (a delete's response code is not proof).
  - Person-signed writes: every bug (`sprint-testing/references/reporting-templates.md` §1, gate §1.12, classified per `defect-management-doctrine.md` Part 1), every coverage Tech Story (`discovery-driven-doctrine.md` §3), every module-context write. This skill creates no Test and scores no ROI.
  - Evidence that reaches a person goes through the `evidence-artifact` skill; raw captures stay in the session `evidence/` until a coverable exists.
  - On any subagent failure: STOP, report which surface or finding failed, offer retry / skip-surface / abort; a skipped surface is recorded "not covered this round", never dropped silently. A skill that itself broke is reported upstream per `agentic-qa-core/references/upstream-feedback.md`.
---

## Forbidden invocations

**NEVER invoke `/sdd-*` skills from this workflow.** SDD is an optional
user-installed ceremony; this skill ships self-contained and does not chain
SDD under any condition. If you need to refactor KATA, fixtures, cli/,
scripts/, or api/schemas/ pipeline, exit this skill first and invoke
`/framework-development`.

This boundary is mechanical, not advisory: `scripts/lint-skills.ts` rejects
any `/sdd-` mention outside this section. See:
`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4
(governs users who manually install SDD).

# Exploratory Testing — Find Bugs, Discover Test Candidates, Without a Ticket

Freestyle but precise testing across a critical flow, a module, or the whole product: UI, API and DB
together, never one alone. No ticket required. This skill hunts for real bugs in the highest-risk surfaces
(data integrity and security first) and produces candidate scenarios that were **executed live** and
**checked against existing coverage**, so `test-documentation` receives new work, not a second copy of
what the repository already holds.

The method rests on four disciplines, and skipping any of them is how a plausible-looking anomaly becomes
a wrong bug report: a parallel reconnaissance fan-out, a refutation pass whose job is to kill findings, a
main-thread tie-break when verifiers disagree, and evidence-backed reporting. This repository adds the
fifth: the coverage view, built before anyone explores, so every candidate says whether it is NEW, WEAK or
already COVERED.

---

## Position in the pipeline

This is the second entry into the **Execution** stage (`agentic-qa-core/references/stage-gates.md`
§"The stages, by name"): same stage, entry by SCOPE instead of by ticket. It is the `explore` and `confirm`
steps of the discovery-driven flow (`agentic-qa-core/references/discovery-driven-doctrine.md` §1).

```
project-context coverage (gap list) --+
                                      v
                       [exploratory-testing]
                         |            |             |
                         v            v             v
            confirmed bugs   candidate scenarios    behaviour with no Story
            (person signs,   NEW / WEAK, oracle     -> coverage Tech Story
            sprint-testing   confirmed -> ROI in    (person signs; doctrine §3)
            retests later)   test-documentation
```

---

## Dependencies

Requires `agentic-qa-core`. Loads on demand:

- `agentic-qa-core/references/adversarial-verification.md`: **MANDATORY before the Refute and Tie-break steps.**
- `agentic-qa-core/references/discovery-driven-doctrine.md`: **MANDATORY before marking any candidate** (the oracle rule §4, the outcome vocabulary and blocking ladder §5, the coverage anchor §3, risk vs ROI §7).
- `agentic-qa-core/references/defect-management-doctrine.md`: **MANDATORY before proposing any Bug / Defect / Improvement.**
- `agentic-qa-core/references/test-design-doctrine.md`: techniques applied to the code, the schema and the observed behaviour instead of an AC (Part 2).
- `agentic-qa-core/references/briefing-template.md`, `agentic-qa-core/references/dispatch-patterns.md`, `agentic-qa-core/references/orchestration-doctrine.md`, `agentic-qa-core/references/session-management.md`, `agentic-qa-core/references/preflight-gate.md`, `agentic-qa-core/references/decision-elicitation-doctrine.md`: cited inline by the sections that use them.

## Compact Rules

**Exploration operational rules (binding):**

- Ticket-free entry into the Execution stage: the scope is a flow, a module or a sweep, never a ticket key (a named ticket routes to `sprint-testing`). Mode from the first `$ARGUMENTS` token (`flow` | `module` | `sweep`), or from a request that clearly names one flow, one module or a sweep (args-as-answers); otherwise ASK.
- Five steps, always in order: Charter (main thread) -> Recon (Parallel) -> Refute (Parallel) -> Tie-break (main thread) -> Handoff (main thread). Planning and tie-breaks are never delegated. The charter is presented and confirmed before any Recon dispatch, unless the request already named the scope and said go.
- Build the coverage view BEFORE Recon: the gap list of `project-context` mode `coverage` when it exists, else `coverage-view.json` from `kata-manifest.json` + the TMS Tests read by `bun run context:coverage collect` (never by `jira:sync-issues`: Tests are `sync: never`); a TMS not read is stated `TMS not read` and no manual cover counts. Every candidate is marked NEW / WEAK / COVERED; only a counted `exercises` cover makes COVERED; a `weak`, stale or unverified cover never dedupes a candidate away.
- Compare at least 2-3 rows plus a control group before calling anything anomalous, and state the detection query verbatim.

**Verification doctrine (binding — full canon: `agentic-qa-core/references/adversarial-verification.md`):**

- Refute mandate: every Medium+ anomaly gets a Parallel verifier told to REFUTE it (join fan-out, data quirk, intended behaviour, harness artifact); it survives only if it cannot be explained away. Check a row's own invariant, not just that it differs from another row; execute competing hypotheses side by side, never infer them.
- Verifier disagreement goes to a main-thread tie-break: a decisive query plus a direct read of the live code path. Never a third verifier, never an average, never one agent's verdict alone on a data-integrity, money or security finding.

**Oracle and outcomes (binding — full canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §4, §5):**

- Oracle: behaviour with no AC is `oracle: observed`; "is this intended?" goes to a person (decision-protocol kind 1), a batch through the `mkd` deck, a single question through the question tool. `oracle: confirmed` (who, where, when) makes the observation PASSED; `not intended` makes it FAILED and a proposed defect.
- A candidate is PASSED or FAILED only when observed in the environment its precondition names; a code read, unit test, green CI or another environment leaves it NOT RUN with exactly one reason, BLOCKED or DEFERRED (execution), and it climbs the blocking ladder; with no coverable yet, its follow-up lives on the coverage Tech Story once approved, and until then as an item of the Handoff deck.

**Safety and signatures (binding):**

- Never call anything that sends, notifies or pushes downstream; reads and previews are fine. A project's own list (`## Never-call endpoints` in `agent-project.md`) is carried verbatim in briefing component 7.
- Mutations only to set up a precondition, within the charter's budget. Every created row goes into `created_rows` the moment it exists; cleanup re-reads each one (a delete's response code is not proof).
- Person-signed writes: every bug (`sprint-testing/references/reporting-templates.md` §1, gate §1.12, classified per `defect-management-doctrine.md` Part 1), every coverage Tech Story (`discovery-driven-doctrine.md` §3), every module-context write. This skill creates no Test and scores no ROI.
- Evidence that reaches a person goes through the `evidence-artifact` skill; raw captures stay in the session `evidence/` until a coverable exists.
- On any subagent failure: STOP, report which surface or finding failed, offer retry / skip-surface / abort; a skipped surface is recorded "not covered this round", never dropped silently. A skill that itself broke is reported upstream per `agentic-qa-core/references/upstream-feedback.md`.

**Read full SKILL.md when**: starting a round cold, resuming a session, or handling a sweep, a tie-break or a Handoff not covered by the rules above.

---

## Inputs — read these first, in this order

1. `.agents/project.yaml`: environments, `testing.default_env`, `testing.tc_creation_stage`, the backend and frontend repositories, `orchestration.max_workers`, `qa.qa_epics`.
2. The gap list of `project-context` mode `coverage` (`<<PRIMARY_ROOT>>/.session/project-context/coverage/gap-list.json`; schema: `project-context/references/coverage.md` §"gap-list.json"). Optional: without it, the Charter step builds the coverage view itself.
3. `kata-manifest.json`: the ATCs already automated (Critical Rule #12).
4. `.context/PBI/qa-artifacts/master-test-plan.md`: the risk level of each flow, which orders the queue.
5. The business maps, read with `bun run context:map <slug>`: `business-e2e-context` first, then `business-api-context` and `business-data-context` per touched level; `business-domain-context` for the vocabulary of every scenario title.
6. The module's synced `module-context.md` under `.context/PBI/epics/` (fixtures, gotchas, trap instances, prior rounds).
7. `agent-project.md` `## Never-call endpoints`, when the project has written one.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is **per-round scope**: `<scope>` = `<YYYY-MM-DD>-<scope-slug>` (e.g. `2026-05-20-orders`, `2026-05-20-checkout-flow`, `2026-05-20-sweep`). Session state lives at `<<PRIMARY_ROOT>>/.session/exploratory-testing/<scope>/` per `agentic-qa-core/references/session-management.md` §3 + §9; its files are listed in `references/handoff-and-reporting.md`. The plan write is the charter: `plan.md` follows the §6 schema and points at `charter.md`.

Every dispatch follows the 7-component briefing (`agentic-qa-core/references/briefing-template.md`); the pattern per step follows `agentic-qa-core/references/dispatch-patterns.md`. The orchestrator verifies each step's DoD (`agentic-qa-core/references/stage-gates.md` §"Execution (exploration without a ticket)") before recording its checkpoint and advancing.

| Step | Pattern | Subagent role | Reference |
|---|---|---|---|
| Charter | inline (main thread) | none: planning is never delegated. Mode, scope, coverage view, recon plan, environment gate, confirmation | `references/scope-and-recon-planning.md` |
| Recon | **Parallel** | one Recon agent per surface or module, at most `orchestration.max_workers` at once, each returning the structured schema | `references/recon-fanout.md` |
| Refute | **Parallel** | one verifier per Medium+ anomaly, mandate REFUTE | `agentic-qa-core/references/adversarial-verification.md` §1-§3 |
| Tie-break | inline (main thread) | none: a subagent's verdict on a data-integrity, money or security finding is never the last word | `agentic-qa-core/references/adversarial-verification.md` §4 |
| Handoff | Single per artifact | one subagent per bug draft or per anchor proposal; `candidate-scenarios.md`, the oracle deck and the module-context harvest stay in the main thread (they need the whole round's state) | `references/handoff-and-reporting.md` |

> **Why Parallel for Recon and Refute**: each surface and each finding is independent: no shared state, no ordering. A sweep of many modules run serially would take hours; the fan-out is the point.

> **Why the main thread for Charter and Tie-break**: the charter is planning; the tie-break exists because a single agent's verdict on a high-cost finding is not trustworthy enough to be final.

> **On any subagent failure**: STOP, report the partial state (which surfaces and findings completed, which rows were created), present retry / skip-surface / abort. A skipped surface is recorded in `session.md` as "not covered this round", never silently omitted. No auto-fix, no auto-rollback. A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.

---

## Fleet seam (optional)

Recon runs on in-turn subagents by default. A sweep large enough to outgrow one turn may run one persistent worker per module instead, only when the user asks for it:

- **Topology: same checkout.** Recon writes nothing to the repository, only the session directory, one `recon/<surface>.json` per worker. No worktree is needed.
- The conductor writes `launch.txt` in the session directory, one self-contained line per module, **always**. Launching and supervising those sessions is `orca-orchestration/SKILL.md` (`[ORCHESTRATION_TOOL]`); `launch.txt` is the payload for the human-paste fallback.
- **Refute, Tie-break and Handoff stay with the conductor.** Workers return Recon reports and their `created_rows`; they never file, never ask the person, never tie-break.
- **Silence rule**: the absence of an orchestration transport is never named to the user and never appears in the charter or the session record.

---

## Readiness Preflight Gate (MANDATORY — runs before Phase 0)

> Full doctrine: `agentic-qa-core/references/preflight-gate.md`. Two laws: (1) **args-as-answers**: the mode, the scope and a named environment are provided args; ask only the gaps. (2) **probe, don't assume**. Surface gaps and REDs as ONE checklist question; STOP on a blocking RED. The generic baseline (environment, test-user credentials by name, secret and restart handling) is inherited from §3.1. Below is only this skill's delta.

| Capability | Need | Why here |
|---|---|---|
| Environment reachable + roles signed in | REQUIRED | Every candidate must be observed live in a named environment (doctrine §5.2). Roles through the app's own login (`agentic-qa-core/references/browser-sessions.md` §4). |
| DB (`[DB_TOOL]`) and API schema (`[API_TOOL]`) | REQUIRED | Recon reads both on every surface. Point-of-use check per `preflight-gate.md` §8; missing → STOP and name the capability. |
| Browser (`/playwright-cli`) | SCOPE: surfaces with UI | The UI leg of the Trifuerza. |
| Business maps + MTP | REQUIRED for a sweep, SOFT for a module | `bun run context:map <slug> --list` shows sections, no placeholder notice. A module round narrows to what code and environment show and says so. |
| Coverage view source | SOFT | The gap list, or `kata-manifest.json` + TMS read access to build `coverage-view.json`. Without the TMS, manual covers are unknown: every candidate claiming one is `NEW` and the charter says why. |
| Issue tracker (`[ISSUE_TRACKER_TOOL]`) | SCOPE: Handoff writes | Only when a person approves a bug, a Tech Story or a module-context write. Load `/acli`. |

---

## Phase 0 — Session resume check + Session Init

0.0 **Resume check** (`agentic-qa-core/references/session-management.md` §4). Compute `<scope>` = `<YYYY-MM-DD>-<scope-slug>`. Check `<<PRIMARY_ROOT>>/.session/exploratory-testing/<scope>/progress.md` (from a worktree, say so in one line and look in the primary). If it exists, read `plan.md`, `charter.md` and the tail of `progress.md`, surface the last completed step and the next one, and offer **resume / restart / abort**. On `restart`, archive the directory to `.session/.archive/<YYYY-MM-DD>-exploratory-testing-<scope>-aborted/` first.

0.1 **Mode**. The first `$ARGUMENTS` token `flow`, `module` or `sweep` IS the mode and the rest is forwarded; a request that clearly names one flow, one module or a whole-product sweep is the answer too (args-as-answers); a ticket key routes to `sprint-testing`; otherwise ask the mode question (`references/scope-and-recon-planning.md` §1).

0.2 **Create the session directory**, write `plan.md` (§6 schema, the `## Inputs` H2 names the coverage view source and the environment) and append `## Phase 0 — Session Init — <ISO-8601 UTC>` with `next: Charter` to `progress.md`.

---

## Workflow — five steps, always in this order

```
Charter -- mode + scope source + charter.md + coverage view + recon plan + env gate
    -> PRESENT the charter, WAIT for confirmation            references/scope-and-recon-planning.md
Recon (Parallel) -- one agent per surface: DB + API [+ UI], Trifuerza technique
    -> structured schema incl. observed[] with covered_by and created_rows
    -> compare 2-3 rows + a control group before any anomaly references/recon-fanout.md
Refute (Parallel) -- one verifier per Medium+ anomaly, mandate REFUTE
    -> own invariant, competing hypotheses executed           agentic-qa-core/references/adversarial-verification.md
Tie-break (main thread) -- only where verifiers disagree
    -> decisive query + direct read of the live code path     adversarial-verification.md §4
Handoff (main thread) -- findings/FNN-*.md (confirmed AND refuted)
    -> candidate-scenarios.md, each NEW / WEAK / COVERED, oracle: observed
    -> ONE deck for the person: oracle answers, bugs to file, Tech Stories, module context
    -> approved writes, cleanup re-read, session.md, footer, archive
                                                              references/handoff-and-reporting.md
```

Every step closes with its checkpoint in `progress.md`. A step that returns a partial result is NEEDS REVISION, never advanced (`stage-gates.md` §"The gate rule").

### Handoff decisions, by weight

The instrument follows the weight of the decisions, never their count (`AGENTS.md` §2). A round's Handoff is usually a report the person reacts to point by point, each item with its own option set: the oracle answer per candidate, file or discard per finding, the grain and approval of each Tech Story, the module context harvest. That report goes into one `mkd` decision deck (`agentic-qa-core/references/decision-elicitation-doctrine.md`); a round with a single small item asks it through the question tool. A blocking item (a row that cannot be cleaned up, a credential failure) is asked at once, never held for the deck.

---

## Gotchas — apply every invocation

1. **A weak cover is not coverage.** A test that runs through a behaviour without checking it leaves the candidate WEAK, and WEAK is handed off. Only a counted `exercises` cover makes COVERED.
2. **Observed is not intended.** Never write what the product did as the expected result of a scenario before a person confirms it; that freezes whatever defect was observed (doctrine §4).
3. **Compare 2-3 rows before calling an anomaly.** One row, or a loose `GROUP BY`, is a lead (`references/recon-fanout.md` §2).
4. **Check the row's own invariant.** Two rows differing proves nothing; a row that breaks its own formula and matches another row's value is a copy (`adversarial-verification.md` §2).
5. **Execute the simulation, never infer it.** Same rule as `sprint-testing/references/exploration-patterns.md` and doctrine §5.2.
6. **Size by reachability.** A defect in a hidden or unlinked route is real, but its severity reflects who can reach it: map endpoint -> handler -> caller -> navigation entry first (`adversarial-verification.md` §4, §5).
7. **Sparse environment data breaks "regressed this sprint".** Say so in the finding instead of guessing at recency.
8. **Read the live schema before a query leans on a column name**: project docs drift.
9. **Language**: every artifact (charter, findings, candidate scenarios, bug drafts, commits) in English; the conversation mirrors the user.
10. **Session footer, chat only**: capture paths the instant they exist and again at close, plus skills, MCPs, CLIs and testing levels, execution framing (`agentic-qa-core/references/session-footer-contract.md`).

---

## Skills to load

| Skill | Load when |
|---|---|
| `playwright-cli` | before any browser step of a Recon UI sub-task |
| `evidence-artifact` | when a confirmed finding becomes a bug draft, or the round's confirmed scenarios are reviewed as a batch |
| `acli` | before any Handoff write a person approved (bug, Tech Story, module context) |
| `xray-cli` | only to read Xray-side membership when building `coverage-view.json` under Modality jira-xray |
| `mkd` | the Handoff deck (T4, named here as the instrument: loaded without asking; absent → offer the install in one line and fall back to the question tool) |

---

## Cross-skill handoff — what this skill does NOT do

| Before this skill | After this skill |
|---|---|
| `project-context` mode `coverage` (optional): the gap list, ordered by MTP risk | `test-documentation`: `candidate-scenarios.md` (NEW and WEAK only; only `oracle: confirmed` is scored, Gate 0), scope `discovery-driven` on a coverage Tech Story, `module-driven` on an existing coverable; with no anchor, the coverage Tech Story is proposed first (doctrine §2.1, §3) and intake runs as `discovery-driven` once it exists |
| (none required: a self-starting entry, on demand or as a scheduled round) | `sprint-testing`: filed bugs re-enter its retest cycle once fixed |
| | `project-context` modes `e2e` / `api` / `data`: a behaviour the maps lack, proposed as a map section |

This skill produces no ATP, ATR or TC, scores no ROI and writes no test code. A named ticket routes to `sprint-testing`.

---

## Pseudocode tags used here

| Tag | Resolves to | Defined in |
|---|---|---|
| `[DB_TOOL]` | the DB MCP of the active environment (`db_mcp`) | `AGENTS.md` Tool Resolution |
| `[API_TOOL]` | the OpenAPI MCP (schema only) + curl | `AGENTS.md` Tool Resolution |
| `[AUTOMATION_TOOL]` | `/playwright-cli` | `AGENTS.md` Tool Resolution |
| `[ISSUE_TRACKER_TOOL]` | `acli`, or `{{ISSUE_TRACKER_CLI}}` | `AGENTS.md` Tool Resolution |
| `[TMS_TOOL]` | `xray-cli` (jira-xray) or `acli` (jira-native) | `AGENTS.md` Tool Resolution |
| `[ORCHESTRATION_TOOL]` | the multi-session orchestration CLI (fleet seam only) | `orca-orchestration/SKILL.md` |

---

## References — read the narrow one for the situation

| Reference | Read when |
|---|---|
| `references/scope-and-recon-planning.md` | Charter: the modes, the scope sources, the charter template, the coverage view, the recon plan, the environment gate, the confirmation |
| `references/recon-fanout.md` | Recon: the per-agent schema, the 2-3 rows rule, tool limits, the never-call boundary, mutation discipline, a filled briefing |
| `agentic-qa-core/references/adversarial-verification.md` | Refute and Tie-break: the mandate, the own-invariant check, executing hypotheses, the tie-break, the trap categories |
| `references/handoff-and-reporting.md` | Handoff: the session layout, `session.md`, findings, `candidate-scenarios.md` with its marks and outcomes, the anchor, the oracle deck, evidence, bugs, module context, cleanup, close |

---

## Pre-flight checklist

- [ ] Mode picked (Critical-Flow-Targeted / Module-Targeted / Whole-App Sweep), not a ticket key
- [ ] `module-context.md` read for every in-scope module
- [ ] Coverage view built (gap list `run_id`, or `coverage-view.json`, with `TMS not read` stated when it was not) and passed to every Recon agent
- [ ] Charter written and confirmed; environment gate and tool probe passed
- [ ] Recon dispatched Parallel, one agent per surface, every report in the schema (`created_rows` even if empty)
- [ ] Every Medium+ anomaly refuted or survived; every disagreement settled by the tie-break
- [ ] One `findings/FNN-*.md` per finding, confirmed and refuted
- [ ] Every candidate marked NEW / WEAK / COVERED and carrying its outcome and oracle state
- [ ] The Handoff decisions asked by weight; only approved writes made, each read back
- [ ] Module-context harvest asked for every touched module, or recorded as skipped ("nothing cleared the bar")
- [ ] Every `created_rows` entry re-read gone
- [ ] `session.md` written; session footer printed (execution framing); `Refinements proposed:` line present
