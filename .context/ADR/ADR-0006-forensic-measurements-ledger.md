# ADR-0006 — Doctrine keeps the why; the measured figures and dates live here

- **Status:** Proposed
- **Date:** 2026-09-24
- **Deciders:** framework owner (boilerplate maintainer); drafted by `/framework-development` from the volatile-facts sweep (decided 2026-09-24)
- **Tags:** doctrine, documentation, lint, forensics
- **Supersedes:** —
- **Superseded by:** —

---

## Context

A sweep of every committed prose surface on 2026-09-24 (`AGENTS.md`, `.agents/**`, `docs/**`, `README.md`, `INSTALLER.md`, the decks and the pages home; 217 files) found 860 sentences whose truth depends on the current contents of another file, of the tracker or of an external tool. 309 were plainly stale or about to be; 121 of the rest were already wrong on `main` that day: four different skill counts for one directory, three copies of the alias table, `file:line` citations into `cli/install.ts` that no longer point at the named symbol, an updater paragraph written as a changelog, a `project.yaml` comment telling the reader to mirror a variable that `AGENTS.md` §7 says must not exist.

The largest single family, 228 of the 430 doubtful rows, was the same doubt: a dated forensic note ("measured 2026-09-17", "since 8.4", "the last fleet", a byte count, a token size) used as the rationale of a rule inside doctrine an agent loads every session. Those notes are the only record of WHY several rules exist (the repo has no changelog), so deleting them loses the argument; keeping them makes the rule carry a date that reads as a claim about the present and invites re-verification on every read.

Critical Rule #17 (`AGENTS.md` §1) and its canon (`.agents/skills/agentic-qa-core/references/volatile-facts.md`) settle the general case: committed prose names the source of truth, never its current value. This ADR settles the forensic-note case and is the record the prose points at.

## Decision

We will keep the WHY of a rule in the doctrine as one sentence with no figure and no date, and move the figure, the date and the context of every measurement that motivated a rule into a dated record: this ADR for the repo's own doctrine, or a dated ledger a skill owns by design (`orca-orchestration/references/gotchas.md`, whose rows carry their own date and tool version and are moved out when they stop being true). The doctrine links the record ("see ADR-0006", "G58") instead of restating the number.

A new measurement that motivates a rule is appended to §Ledger below, never inlined in the rule. ADRs, changelogs and dated reports are exempt from Rule #17 because the date is part of the claim.

### Ledger of measurements behind current doctrine

Every row is a snapshot at its date. None of them is a claim about the present.

| Doctrine that keeps the why | Measurement (figure, date, context) |
|---|---|
| `AGENTS.md` Rule #10, MCP credential failure is silent on every host but Codex | Measured 2026-09-20 on all three hosts; this corrected the rule's earlier claim that a missing variable fails at parse time. |
| `AGENTS.md` §4.5, never `parseDocument(...).toString()` a file under `.agents/` | On `.agents/jira-required.yaml` the round-trip grew the file by 2271 bytes while changing nothing, rewrapped folded scalars and rewrote `[main]` as `[ main ]` (2026-09). |
| `AGENTS.md` §4.5, one schema-driven back-fill hook instead of one hand-written hook per block | `orchestration:` was the newest block of `.agents/project.yaml` when the schema hook was written and nobody had written its hook: the proof the per-block mechanism does not scale (2026-09). |
| `AGENTS.md` §4.5, updater behaviours formerly narrated as "since 8.1 / 8.3 / 8.4 / this release" | Release history of `bun run up`: 8.1 introduced the env signal a self-update advances the `cli` cursor on (the content fallback covers a pre-8.1 parent); 8.3 narrowed the dirty-tree guard to the paths the sync writes; 8.4 added the per-surface closing table, the parity prompt saved to `.agents/prompts/parity-plan.md`, the `Now` column, the `PATH_PREREQUISITES` blocking row, `skills:check` among the post-sync gates, the punctuation-insensitive heading compare, the silent marker seeding, the `Gates: omitidas` line and the `skills:registry` afterApply hook; the release after 8.4 added the additive `permissions.allow` merge of `.claude/settings.json`, the blocking `CONFIG_BLOCK_READERS` row and the unresolved-doctrine ledger for `AGENTS.md`. |
| `AGENTS.md` §5, the orchestration vendor stubs load alongside the T1 skill | Posture flipped 2026-09-22: the pair measured about 2k tokens, and the fetch-on-demand posture cost a live fleet one iteration spent correcting an invented flag. |
| `AGENTS.md` §10, repo-relative paths in `scripts/` go through `scripts/lib/posix-path.ts` | The `\` separator bug shipped three times before the helper existed: into `kata-manifest.json`, into `REGISTRY.md`, and into the allowlist compare of `lint-vars.ts` (downstream issue #26). |
| `AGENTS.md` §11, no legacy git-flow doc applies | `docs/workflows/git-flow.md` was removed 2026-09-24; it mandated a `staging` branch that did not exist on `origin` at that date. |
| `AGENTS.md` §Git Strategy, this repo's strategy is chosen, not inherited | `solo-main` confirmed 2026-08-21 via Strategy Setup (`meta.strategy_source: chosen`). The ruleset that requires a pull request on `main` is `ProtectPublic`, id 16809531; the push credential sits in its bypass list. `required_approving_review_count = 1` verified 2026-08-18 against that ruleset (`.agents/project.yaml` `meta.policy_verified`). |
| `artifact-lifecycle.md`, `defect-management-doctrine.md`, `sprint-orchestration.md`: read the assignee before every transition | Measured 2026-09-17 on a live project: `start_testing` and `qa_sign_off` each silently moved a Story's native `assignee` through an undocumented assign post-function. |
| `artifact-lifecycle.md` §4.2, a Test Set close can be refused by project-specific validators | Measured 2026-09-17: closing a Test Set was refused by five mandatory-field validators at once (Test Analysis, VCR Estimation, Test Outline, automation type, regression flag) on one project's screen. |
| `defect-management-doctrine.md`, `sprint-orchestration.md`: cache the QA-epic keys back after creation | Measured 2026-09-17: all four QA-process Epics existed in Jira while every cached `key` was still `null`. |
| `sprint-orchestration.md`, `xray-cli/references/graphql-api.md`: an instance's run-status vocabulary is its own | Measured 2026-09-17: one instance accepted only `TODO`, `EXECUTING`, `PASSED`, `FAILED` and rejected `BLOCKED` and `ABORTED`. |
| `decision-elicitation-doctrine.md`, the deck renders and the returned contract is read | Measured 2026-09-19 on the primary checkout. |
| `test-design-doctrine.md`, an AC set that "worked for a year" still hid the failure | The measured failure was on 2026-09-17, on an AC set the whole team had used for about a year. |
| `traceability-linking.md`, `test-documentation/SKILL.md`, `xray-cli/SKILL.md`: the coverage sweep and the `TC → ATS → Story` cascade | On one measured project 21 of 43 linked Stories were wired the wrong way and one had lost a fully populated 69-Test Test Set; two disjoint sets of ten Tests existed for one Story; three agents read the same linking sentence in opposite directions (2026-09). |
| `agentic-qa-onboard/SKILL.md`, the dogfood anecdote | One dogfood sprint: three of the most delayed stories tested in parallel, 32 minutes of parallel execution, 21 tracker artefacts, 9 quality issues (conductor report, 2026-09). |
| `regression-testing/SKILL.md`, a long run is dispatched in the background | Suite durations measured in this boilerplate at the time: regression 20-60 min, smoke 2-5 min, sanity 1-10 min. Every downstream suite differs. |
| `sprint-testing/SKILL.md`, `fleet-conductor.md`: a worker's env is verified, never assumed | Measured 2026-09-17 on a three-worker fleet in one repo: an env prefix on the launch line did not survive every launcher, and three of three workers ran with both variables empty. Measured 2026-09 (sprint 19, source fleet): 3 of 8 workers ran an entire issue with no DB connectivity. |
| `sprint-testing/SKILL.md`, no implicit ADF conversion on publish | Measured 2026-09-17 on three ATP bodies and every QA comment of a fleet run. |
| `evidence-conventions.md`, `fleet-conductor.md`: evidence folders are qualified per session | Measured 2026-09-17: a repo whose config still pointed at one story's evidence folder cross-contaminated the first unqualified capture of all three concurrent sessions. Orphaned headless browsers: ten at about 2.7 GB on 2026-08-30. |
| `fleet-conductor.md`, no quotes inside a launch prompt | Measured 2026-09-04 on the source fleet: a quote inside the prompt produced a shell parse error that killed five of five launch lines. |
| `planning-ladder.md`, Xray coverage ignores a Story linked only to a Plan and an Execution | Verified live 2026-08-21: a Story linked to a Test Plan (16 tests) and a Test Execution (16 tests) still showed UNCOVERED, 0 tests. |
| `session-footer-contract.md`, the footer is printed unprompted | Real precedent on a sibling project, 2026-07-06 and 2026-07-07. |
| `orca-orchestration/references/automations.md`, the routine cadence | One run on 2026-09-13 cost USD 1.33 and 115 seconds on a top-tier model: about 5.5k output tokens, 101k cache-creation tokens, 353k cache reads, 14 turns. Measure once per routine before choosing a cadence. |
| `orca-orchestration/SKILL.md`, "Consequence for cost" (the vendor stubs load alongside the skill) | Corrected 2026-09-22; the paragraph used to say the opposite. Every other orca measurement lives in `orca-orchestration/references/gotchas.md` by G-id. |
| `orca-orchestration/references/orca-machine-setup.md`, `session-identity.md`, `auto-trigger.md`: an MCP child inherits the launch directory | Measured on Claude Code 2.1.275 to 2.1.278 (the three references cited three adjacent versions): a session launched inside a worktree gave its MCP child the main checkout's value; a direct probe on 2026-09-17 showed `direnv: export +ATLASSIAN_API_TOKEN`. |
| `packages/pages-home/harnesses.es.html`, the adapt-framework migration | `adapt-framework` was 590 lines before the migration. |
| `packages/decks/orca-orchestration/how-it-works.es.html`, dogfood figures | Dogfood, conductor report, 2026-09: seven conductor subagents cost about 980k tokens against about 180k of observed output across three workers; three workers and four stages produced up to nine interventions. |

## Consequences

- **Positive:** doctrine reads as a contract again: the rule, its one-sentence why, and a pointer. A session never has to decide whether "measured 2026-09-17" is still true. The lint can flag a dating word in doctrine without an allowlist per rule, because the dated form has one home.
- **Negative / trade-offs:** the reader who doubts a rule takes one more hop to see the evidence. A measurement appended here has to be linked from the doctrine by hand; nothing checks that the link exists.
- **Neutral / follow-ups:** the orca gotchas ledger keeps its own dates and versions (a dated ledger by design, exempt). Decks caption their dogfood figures with the run's date and source instead of moving them here. `COUNT-NOUN` lint stays deferred until the hand-applied cleanup leaves a residue small enough to allowlist.

## Alternatives considered

- **Delete the forensic notes outright** — loses the only record of why several rules exist; the next session re-litigates a settled rule with no evidence.
- **Keep the dated notes in the doctrine** — the reader cannot tell a rationale from a live claim, the lint cannot flag dating vocabulary without allowlisting every rule, and the same measurement was already copied three times across skills with three different wordings.
- **A CHANGELOG instead of an ADR** — a changelog is ordered by release, not by rule; a reader starting from a rule would not find its measurement. The ADR index is what every session reads first.

## References

- Critical Rule #17: `AGENTS.md` §1
- Canon: `.agents/skills/agentic-qa-core/references/volatile-facts.md`
- Sweep report and owner verdicts (local, gitignored): `.session/spikes/volatile-facts/report.md`, `.session/decisions/volatile-facts-2026-09-24.json`
- Dated ledger kept by a skill: `.agents/skills/orca-orchestration/references/gotchas.md`
