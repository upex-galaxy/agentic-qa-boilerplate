---
name: exploratory-testing
description: "Exploratory testing of a flow, a module or the whole app without a ticket, hunting bugs and test candidates across UI, API and DB. Use when asked to explore a module or flow, run a sweep or health-check round, go after the coverage gaps, or find validated scenarios for test-documentation. Not for a named ticket (sprint-testing)."
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
  - Entry is by scope, never by ticket: a flow, a module or a sweep. A named ticket key routes to `sprint-testing`. The mode comes from the first `$ARGUMENTS` token (`flow` | `module` | `sweep`), or from a request that clearly names one flow, one module or a sweep (args-as-answers); otherwise ask.
  - Five steps in this order: Charter (main thread), Recon (Parallel), Refute (Parallel), Tie-break (main thread), Handoff (main thread). Planning and tie-breaks stay on the main thread. Present the charter and get it confirmed before any Recon dispatch, unless the request already named the scope and said go.
  - Build the coverage view before Recon: the gap list of `project-context` mode `coverage` when it exists, else `coverage-view.json` from `kata-manifest.json` plus the TMS Tests read by `bun run context:coverage collect` (not by `jira:sync-issues`, because Tests are `sync: never`). A TMS that was not read is stated as `TMS not read`, and no manual cover counts. Mark every candidate NEW, WEAK or COVERED. Only a counted `exercises` cover makes COVERED; a `weak`, stale or unverified cover never dedupes a candidate away.
  - Compare at least 2-3 rows plus a control group before calling anything anomalous, and state the detection query verbatim.
  - Refute mandate: every Medium+ anomaly gets a Parallel verifier told to REFUTE it (join fan-out, data quirk, intended behaviour, harness artifact). It survives only if it cannot be explained away. Check a row's own invariant, not just that it differs from another row, and execute competing hypotheses side by side instead of inferring them. Canon: `agentic-qa-core/references/adversarial-verification.md`.
  - Verifier disagreement goes to a main-thread tie-break: a decisive query plus a direct read of the live code path. Never settle it with a third verifier or an average, and never let one agent's verdict stand alone on a data-integrity, money or security finding.
  - Oracle: behaviour with no AC is `oracle: observed`. "Is this intended?" goes to a person (decision-protocol kind 1): a batch through the `mkd` deck, a single question through the question tool. `oracle: confirmed` (who, where, when) makes the observation PASSED; `not intended` makes it FAILED and a proposed defect. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §4.
  - A candidate is PASSED or FAILED only when observed in the environment its precondition names. A code read, unit test, green CI or another environment leaves it NOT RUN with exactly one reason, BLOCKED or DEFERRED (execution), and it climbs the blocking ladder. With no coverable yet, its follow-up lives on the coverage Tech Story once approved, and until then as an item of the Handoff deck. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.
  - Never call anything that sends, notifies or pushes downstream; reads and previews are fine. A project's own list (`## Never-call endpoints` in `agent-project.md`) goes verbatim into briefing component 7.
  - Mutate only to set up a precondition, within the charter's budget. Record every created row in `created_rows` the moment it exists; cleanup re-reads each one (a delete's response code is not proof).
  - A person signs every write: each bug (`sprint-testing/references/reporting-templates.md` §1, gate §1.12, classified per `defect-management-doctrine.md` Part 1), each coverage Tech Story (`discovery-driven-doctrine.md` §3), each module-context write. This skill creates no Test and scores no ROI.
  - Evidence that reaches a person goes through the `evidence-artifact` skill; raw captures stay in the session `evidence/` until a coverable exists.
  - On any subagent failure, stop, report which surface or finding failed, and offer retry, skip-surface or abort. A skipped surface is recorded as "not covered this round", never dropped silently. A skill that itself broke is reported upstream per `agentic-qa-core/references/upstream-feedback.md`.
---

## Forbidden invocations

This workflow never invokes `/sdd-*` skills. SDD is an optional ceremony the user installs; this skill is
self-contained and does not chain into it. To refactor KATA, fixtures, `cli/`, `scripts/` or the
`api/schemas/` pipeline, leave this skill and invoke `/framework-development`.

`scripts/lint-skills.ts` enforces the boundary: it rejects any `/sdd-` mention outside this section
(`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4 covers users who install SDD).

# Exploratory Testing

Freestyle but precise testing across a critical flow, a module or the whole product, with UI, API and DB
together and no ticket. The goal is real bugs in the highest-risk surfaces (data integrity and security
first), plus candidate scenarios that were executed live and checked against existing coverage, so
`test-documentation` receives new work and not a second copy of what the repository already holds.

Five disciplines carry the method, and skipping one is how a plausible anomaly becomes a wrong bug report:
a parallel reconnaissance fan-out, a refutation pass whose job is to kill findings, a main-thread
tie-break when verifiers disagree, evidence-backed reporting, and a coverage view built before anyone
explores, so every candidate says whether it is NEW, WEAK or already COVERED.

## Position in the pipeline

This is the second entry into the Execution stage (`agentic-qa-core/references/stage-gates.md` §"The stages, by name"): the same stage, entered by scope instead of by ticket. It is the `explore` and `confirm` steps of the discovery-driven flow (`agentic-qa-core/references/discovery-driven-doctrine.md` §1).

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

## Dependencies

Requires `agentic-qa-core`. These load on demand:

- `agentic-qa-core/references/adversarial-verification.md`: read before the Refute and Tie-break steps.
- `agentic-qa-core/references/discovery-driven-doctrine.md`: read before marking any candidate (the oracle rule §4, the outcome vocabulary and blocking ladder §5, the coverage anchor §3, risk vs ROI §7).
- `agentic-qa-core/references/defect-management-doctrine.md`: read before proposing any Bug, Defect or Improvement.
- `agentic-qa-core/references/test-design-doctrine.md`: techniques applied to the code, the schema and the observed behaviour instead of an AC (Part 2).
- `agentic-qa-core/references/briefing-template.md`, `dispatch-patterns.md`, `orchestration-doctrine.md`, `session-management.md`, `preflight-gate.md` and `decision-elicitation-doctrine.md` (same folder): cited inline where they apply.

## Compact Rules

The binding rules of this skill are the `compact_rules` key in the frontmatter above. The registry hands that
text to every executor verbatim, and the sections below explain how to carry each rule out. They cover the
entry by scope, the five-step order, the coverage view, the 2-3 rows comparison, the refute mandate, the
tie-break, the oracle, the outcome vocabulary, the never-call and mutation boundaries, the person-signed
writes, evidence and subagent failure.

**Read full SKILL.md when**: starting a round cold, resuming a session, or handling a sweep, a tie-break or a Handoff not covered by the rules above.

---

## Inputs

Read these first, in this order:

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

A round is one scope: `<scope>` = `<YYYY-MM-DD>-<scope-slug>` (for example `2026-05-20-orders`, `2026-05-20-checkout-flow`, `2026-05-20-sweep`). Session state lives at `<<PRIMARY_ROOT>>/.session/exploratory-testing/<scope>/` (`agentic-qa-core/references/session-management.md` §3 and §9); `references/handoff-and-reporting.md` lists its files. The plan write is the charter: `plan.md` follows the §6 schema and points at `charter.md`.

Every dispatch uses the 7-component briefing (`agentic-qa-core/references/briefing-template.md`) and the pattern for its step (`agentic-qa-core/references/dispatch-patterns.md`). Before recording a step's checkpoint and advancing, the orchestrator verifies that step's definition of done (`agentic-qa-core/references/stage-gates.md` §"Execution (exploration without a ticket)").

| Step | Pattern | Subagent role | Reference |
|---|---|---|---|
| Charter | inline (main thread) | none: planning is never delegated. Mode, scope, coverage view, recon plan, environment gate, confirmation | `references/scope-and-recon-planning.md` |
| Recon | **Parallel** | one Recon agent per surface or module, at most `orchestration.max_workers` at once, each returning the structured schema | `references/recon-fanout.md` |
| Refute | **Parallel** | one verifier per Medium+ anomaly, mandate REFUTE | `agentic-qa-core/references/adversarial-verification.md` §1-§3 |
| Tie-break | inline (main thread) | none: a subagent's verdict on a data-integrity, money or security finding is never the last word | `agentic-qa-core/references/adversarial-verification.md` §4 |
| Handoff | Single per artifact | one subagent per bug draft or per anchor proposal; `candidate-scenarios.md`, the oracle deck and the module-context harvest stay in the main thread (they need the whole round's state) | `references/handoff-and-reporting.md` |

Recon and Refute run in parallel because each surface and each finding is independent, with no shared state or ordering; a sweep of many modules run serially would take hours. Charter and Tie-break stay on the main thread because the charter is planning and a single agent's verdict on a high-cost finding is not trustworthy enough to be final.

On a subagent failure, report the partial state (which surfaces and findings completed, which rows were created) and offer retry, skip-surface or abort. Record a skipped surface in `session.md` as "not covered this round". Do not auto-fix or auto-roll-back. A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, and verified with `gh issue view`.

## Fleet seam (optional)

Recon runs on in-turn subagents by default. A sweep large enough to outgrow one turn may run one persistent worker per module, only when the user asks for it:

- Same checkout. Recon writes nothing to the repository, only the session directory (one `recon/<surface>.json` per worker), so no worktree is needed.
- The conductor always writes `launch.txt` in the session directory, one self-contained line per module. Launching and supervising those sessions is `/agent-orchestration` (`[ORCHESTRATION_TOOL]`); `launch.txt` is the payload for the human-paste fallback.
- Refute, Tie-break and Handoff stay with the conductor. Workers return Recon reports and their `created_rows`; they do not file, ask the person or tie-break.
- The absence of an orchestration transport is not mentioned to the user and does not appear in the charter or the session record.

---

## Readiness Preflight Gate (runs before Phase 0)

Full doctrine: `agentic-qa-core/references/preflight-gate.md`. Two laws apply: args-as-answers (the mode, the scope and a named environment are provided, so ask only the gaps) and probe, don't assume. Surface the gaps and REDs as one checklist question, and stop on a blocking RED. The generic baseline (environment, test-user credentials by name, secret and restart handling) comes from §3.1; the table is this skill's delta.

| Capability | Need | Why here |
|---|---|---|
| Environment reachable + roles signed in | REQUIRED | Every candidate must be observed live in a named environment (doctrine §5.2). Roles through the app's own login (`agentic-qa-core/references/browser-sessions.md` §4). |
| DB (`[DB_TOOL]`) and API schema (`[API_TOOL]`) | REQUIRED | Recon reads both on every surface. Point-of-use check per `preflight-gate.md` §8; missing → STOP and name the capability. |
| Browser (`/playwright-cli`) | SCOPE: surfaces with UI | The UI leg of the Trifuerza. |
| Business maps + MTP | REQUIRED for a sweep, SOFT for a module | `bun run context:map <slug> --list` shows sections, no placeholder notice. A module round narrows to what code and environment show and says so. |
| Coverage view source | SOFT | The gap list, or `kata-manifest.json` + TMS read access to build `coverage-view.json`. Without the TMS, manual covers are unknown: every candidate claiming one is `NEW` and the charter says why. |
| Issue tracker (`[ISSUE_TRACKER_TOOL]`) | SCOPE: Handoff writes | Only when a person approves a bug, a Tech Story or a module-context write. Load `/acli`. |

---

## Phase 0 (session resume check and session init)

0.0 **Resume check** (`agentic-qa-core/references/session-management.md` §4). Compute `<scope>` = `<YYYY-MM-DD>-<scope-slug>`. Check `<<PRIMARY_ROOT>>/.session/exploratory-testing/<scope>/progress.md` (from a worktree, say so in one line and look in the primary). If it exists, read `plan.md`, `charter.md` and the tail of `progress.md`, surface the last completed step and the next one, and offer **resume / restart / abort**. On `restart`, archive the directory to `.session/.archive/<YYYY-MM-DD>-exploratory-testing-<scope>-aborted/` first.

0.1 **Mode**. The first `$ARGUMENTS` token `flow`, `module` or `sweep` IS the mode and the rest is forwarded; a request that clearly names one flow, one module or a whole-product sweep is the answer too (args-as-answers); a ticket key routes to `sprint-testing`; otherwise ask the mode question (`references/scope-and-recon-planning.md` §1).

0.2 **Create the session directory**, write `plan.md` (§6 schema, the `## Inputs` H2 names the coverage view source and the environment) and append `## Phase 0 — Session Init — <ISO-8601 UTC>` with `next: Charter` to `progress.md`.

---

## Workflow

Five steps, in this order.

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

Each step closes with its checkpoint in `progress.md`. A step that returns a partial result is NEEDS REVISION and does not advance (`stage-gates.md` §"The gate rule").

### Handoff decisions, by weight

The instrument follows the weight of the decisions, not their count (`AGENTS.md` §2). A round's Handoff is usually a report the person reacts to point by point, each item with its own options: the oracle answer per candidate, file or discard per finding, the grain and approval of each Tech Story, the module-context harvest. That report goes into one `mkd` decision deck (`agentic-qa-core/references/decision-elicitation-doctrine.md`); a round with a single small item asks it through the question tool. A blocking item (a row that cannot be cleaned up, a credential failure) is asked at once and does not wait for the deck.

### With nobody at the keyboard

The waits in this skill are the resume / restart / abort offer, the mode question, the preflight checklist, the charter confirmation, the subagent-failure choice, and the Handoff decisions. `agentic-qa-core/references/decision-protocol.md` says which of them reach a person at all. For the rest:

| Wait | Supervised worker | Routine with nobody |
|---|---|---|
| Resume, restart or abort | the conductor answers | resume the existing session |
| Mode and charter confirmation | the conductor confirms | proceed only when the delegating brief names the scope and says go; otherwise write the charter, stop and report |
| Preflight RED | the conductor decides | stop and report the RED |
| Subagent failure | the conductor chooses | skip the surface and record "not covered this round" |
| Handoff deck | the conductor holds it | leave the deck unanswered: the session stays open, nothing is filed, no Tech Story or module-context write is made |

Everything reversible still runs: Recon, Refute, Tie-break, the findings files, `candidate-scenarios.md` and cleanup. Every Jira write, and every oracle answer, waits for a person.

---

## Gotchas

Apply on every invocation.

1. **A weak cover is not coverage.** A test that runs through a behaviour without checking it leaves the candidate WEAK, and WEAK is handed off.
2. **Observed is not intended.** Do not write what the product did as the expected result of a scenario before a person confirms it; that freezes whatever defect was observed (doctrine §4).
3. **Compare 2-3 rows before calling an anomaly.** One row, or a loose `GROUP BY`, is a lead (`references/recon-fanout.md` §2).
4. **Check the row's own invariant.** Two rows differing proves nothing; a row that breaks its own formula and matches another row's value is a copy (`adversarial-verification.md` §2).
5. **Execute the simulation, never infer it.** Same rule as `sprint-testing/references/exploration-patterns.md` and doctrine §5.2.
6. **Size by reachability.** A defect in a hidden or unlinked route is real, but its severity reflects who can reach it: map endpoint, handler, caller and navigation entry first (`adversarial-verification.md` §4, §5).
7. **Sparse environment data breaks "regressed this sprint".** Say so in the finding instead of guessing at recency.
8. **Read the live schema before a query leans on a column name**: project docs drift.
9. **Language.** Every artifact (charter, findings, candidate scenarios, bug drafts, commits) is in English; the conversation mirrors the user.
10. **Session footer, chat only.** Capture paths the instant they exist and again at close, plus skills, MCPs, CLIs and testing levels, in execution framing (`agentic-qa-core/references/session-footer-contract.md`).

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

## Cross-skill handoff

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
| `[ORCHESTRATION_TOOL]` | the multi-session orchestration CLI (fleet seam only) | `/agent-orchestration` |

---

## References

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
- [ ] Every Recon report is in the schema (`created_rows` even if empty); every Medium+ anomaly is refuted or survived, and every disagreement is settled by the tie-break
- [ ] One `findings/FNN-*.md` per finding, confirmed and refuted; every candidate marked NEW / WEAK / COVERED with its outcome and oracle state
- [ ] Handoff decisions asked by weight; only approved writes made, each read back; module-context harvest asked per touched module or recorded as skipped ("nothing cleared the bar")
- [ ] Every `created_rows` entry re-read gone
- [ ] `session.md` written; session footer printed (execution framing); `Refinements proposed:` line present
