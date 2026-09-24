---
name: iql-context
description: "The methodology index of this repo: how the IQL (Integrated Quality Lifecycle) is structured, why the QA process runs as eight named stages, what the artifact ladder (MTP / FTP / STP / ATP / ATS / ATR / STR / RTP / RTR) means, where each invariant is enforced, and how THIS project adapts it. Load it whenever someone asks why the process is shaped this way, what a stage / step / phase / cycle / altitude is, what IQL, TMLC, TALC, Early-Game / Mid-Game / Late-Game, Trifuerza, light mode, autonomy level or execution profile mean, which skill owns a stage, or how the website's methodology maps onto the skills here, even when they do not say 'IQL'. Pure knowledge: it changes what the agent knows, never what it does next. NOT for running a stage (the workflow skills), NOT for SUT knowledge (the project's own <aspect>-context skills)."
license: MIT
compatibility: [claude-code, codex, opencode]
metadata:
  kind: context
---

# iql-context

> Kind `context` (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Shipped upstream and synced verbatim; a project adapts it through the two seams in §"How a project adapts it", never by editing this file.

## Compact Rules

- DO: answer "why is the process shaped this way" from the index below, then point at the canonical reference for the procedure; never restate a DoD, a transition table or a link catalog that a reference already owns.
- DO: name stages by word (Shift-Left, Planning, Execution, Reporting, Documentation, Automation, Regression, Observation), never by number; a numbered "Stage N" in an older doc resolves through `agentic-qa-core/references/stage-gates.md`.
- DO: read `.agents/project.yaml` → `qa.methodology` before saying which stages a project runs or how strict its gates are; the shipped values are a default, not a decision.
- DO: read `references/project-overrides.md` for the project's own rules and exceptions; they win over this index for THAT project, and only there.
- DO NOT: resolve a web-vs-repo disagreement on your own. The repo's executable doctrine (`agentic-qa-core/references/*`) is what the skills enforce; the website is the public narrative. State both readings and cite both.
- DO NOT: treat this skill as SUT knowledge. Entities, endpoints, infra and Jira content live in `.context/` maps and the project's `<aspect>-context` skills.
- DO NOT: edit this SKILL.md or its synced references in a consumer project; propose a refinement per `agentic-qa-core/references/skill-refinement-protocol.md` (project-owned prose goes in `references/project-overrides.md`).
- WHEN a question is about ONE aspect (phases and steps, the agentic contract, the eight approaches, the thirteen invariants): load only that reference from §"References".

**Read full SKILL.md when**: building a briefing that must explain the methodology to a subagent, answering "why" questions about the ladder or the stages, or checking which invariant a proposed shortcut violates.

## What this skill knows

One aspect of this repository: **its own QA methodology**, the IQL, as the official site narrates it and as the repo enforces it. It knows the shape (phases, stages, steps, cycles, altitudes), the invariants, the agentic contract (autonomy, verifier, guardrails, execution profiles, light mode) and, per project, the adaptation values. It does not know the product under test.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `agentic-qa-core/references/stage-gates.md` | the stages by name, autonomy scale, contract table, DoD per stage | executable doctrine (wins) |
| `agentic-qa-core/references/artifact-lifecycle.md` | every artifact's created / moved / terminal status | executable doctrine (wins) |
| `agentic-qa-core/references/planning-ladder.md` | the ladder, the title grammar, the RTP and RTR amendments | ratified ladder |
| `agentic-qa-core/references/traceability-linking.md` | the link catalog, the coverage cascade, the no-roll-up rule | executable doctrine (wins) |
| `agentic-qa-core/references/defect-management-doctrine.md` | Bug / Defect / Improvement, the three axes, the four QA-process epics | executable doctrine (wins) |
| `agentic-qa-core/references/test-design-doctrine.md` | the five principles and the technique triggers | executable doctrine (wins) |
| `agentic-qa-core/references/decision-elicitation-doctrine.md` | how the human decides | executable doctrine (wins) |
| `.agents/jira-workflows.json` | the real state machines (Story, Bug, Test) of the instance | catalog, never restated here |
| `.agents/project.yaml` → `qa.methodology`, `qa.qa_epics` | what THIS project runs | adaptation seam 1 |
| `references/project-overrides.md` | the project's own rules and exceptions | adaptation seam 2 (project-owned) |
| https://www.upexgalaxy.com/metodologia (+ `/early-game`, `/mid-game`, `/late-game`, `/diagramas/*`) | the public narrative: phases, steps, cycles, approaches, principles, light mode, metrics | narrative (cited, never wins over the repo) |

## Index of invariants

Each row states ONE invariant and cites where it comes from. "web" = the anchor on https://www.upexgalaxy.com/metodologia unless a phase page is named. "repo: none" = the repo does not encode it; the skill indexes it by web citation only (see `references/`).

| Topic | Invariant | Web | Repo |
|---|---|---|---|
| Three phases | Early-Game (prevention, QA Analyst) · Mid-Game (detection, QA Automation Engineer) · Late-Game (observation, QA + DevOps). Phases group steps, not stages | `#fases`, `/early-game` | none: `references/phases-steps-cycles.md` |
| Eight stages, named never numbered | Shift-Left · Planning · Execution · Reporting · Documentation · Automation · Regression · Observation. A stage has a name, a DoD and a contract; steps are its breakdown | `#stages`, `/diagramas/iql-completo` | `agentic-qa-core/references/stage-gates.md` §"The stages, by name" |
| Shift-Left → `shift-left-testing` | pre-sprint, in batch, zero TMS entities; the ATP goes into the Story field; the Story stops at Estimation; the `[QA] Shift-Left Review` subtask tracks the pass | `#stages`, `/early-game` | `agentic-qa-core/references/stage-gates.md` §"Shift-Left"; `.agents/skills/shift-left-testing/SKILL.md` |
| Planning → `sprint-testing` | in-sprint; Set-first (ATS, then ATP, then ATR); the ATP item is born FROM the field; an ATR without Test Environment fails the DoD; STP / FTP find-or-create | `#stages`, `/diagramas/sprint-testing` | `agentic-qa-core/references/stage-gates.md` §"Planning" |
| Execution → `sprint-testing` | smoke as Go / No-Go first, then the Trifuerza beyond the plan; every finding classified before filing; a human agrees to every filing | `#stages`, `#trifuerza` | `agentic-qa-core/references/stage-gates.md` §"Execution"; `agentic-qa-core/references/defect-management-doctrine.md` Part 1 |
| Reporting → `sprint-testing` | the ATR is a Test Execution item; a QA comment; links verified in direction; the human signs the transition | `#stages` | `agentic-qa-core/references/stage-gates.md` §"Reporting"; `agentic-qa-core/references/traceability-linking.md` §10 |
| Documentation → `test-documentation` | a ROI gate over already-validated behaviour: exactly one verdict per scenario, most Deferred; a second-agent verifier recommended | `#stages`, `/mid-game` | `agentic-qa-core/references/stage-gates.md` §"Documentation" |
| Automation → `test-automation` | Candidates only; the plan is approved before code; verifiers green; the only stage with a mandatory separate verifier | `#stages`, `/diagramas/automatizacion-de-tests` | `agentic-qa-core/references/stage-gates.md` §"Automation" |
| Regression → `regression-testing` | every failure classified; a FLAKY verdict needs run history; GO / CAUTION / NO-GO; the human decides every CAUTION | `#stages`, `/late-game` | `agentic-qa-core/references/stage-gates.md` §"Regression" |
| Observation → no skill | declared and empty: its operating unit is an agentic routine, capability L4, no DoD | `#stages`, `/late-game` | `agentic-qa-core/references/stage-gates.md` §"Observation" |
| Sprint close is not a stage | STP and STR close at the batch boundary, by whichever of `sprint-testing` or `regression-testing` arrives first | `#stages` | `agentic-qa-core/references/stage-gates.md` §"Sprint close" |
| SDLC events around the loop | MTP once per product · STP at sprint open · development (step 2) is the SDLC sync point, in no stage · STR at sprint close | `#stages`, `#bucle` | `agentic-qa-core/references/artifact-lifecycle.md` §1 (MTP / STP / STR rows) |
| Artifact ladder and altitude | MTP (product, an Epic here) · FTP (feature) · STP (sprint) · ATP / ATS / ATR (story) · STR (sprint) · RTP and RTR (product, long-lived plan, one run per verdict) · TC / ATC (TMS layer) · TS (feature, optional). First token = altitude, P = Plan, R = Results | `#artefactos` | `agentic-qa-core/references/planning-ladder.md` §2 and its RTP / RTR amendments; `agentic-qa-core/references/artifact-lifecycle.md` §1 |
| Title grammar | `{ACRONYM}: {scope-id}: {descriptor}` | `#artefactos` | `agentic-qa-core/references/planning-ladder.md` §3 |
| Set-first and the one coverage edge | the ATS exists first and is mandatory even with one TC; ATS → Story is the ONLY edge that fills the coverage panel; ATP → Story and ATR → Story are administrative | `#artefactos`, `/diagramas/gestion-de-tests` | `agentic-qa-core/references/traceability-linking.md` §3, §4 |
| Pre-sprint ATP lives in the field | before the sprint the ATP exists only in `{{jira.acceptance_test_plan}}`: no item, no DRAFT title; the item is born in Planning; labels `shift-left-reviewed` + `shift-left-{YYYY-MM-DD}` | `/early-game` | `agentic-qa-core/references/artifact-lifecycle.md` §1 (ATP row); `AGENTS.md` §9 |
| An ATR needs an environment | no Test Execution without Test Environment; a hard gate, never collapsed | `#principios` | `agentic-qa-core/references/stage-gates.md` §"Planning" DoD |
| No results roll-up | the STR is a sibling recap, not the sum of the ATRs; the feature altitude has no run of its own | `#artefactos` | `agentic-qa-core/references/traceability-linking.md` §3 |
| Three-axis parenting | parent = QA-process epic · issue link = source Story · components = product module; never a product epic | none | `agentic-qa-core/references/defect-management-doctrine.md` Part 4; `AGENTS.md` §9 |
| Four QA-process epics | QA Master Test Plan · QA Test Repository · QA Test Artifacts · QA Defect Management; names from `qa.qa_epics`, label `QA-Artifact` | none | `agentic-qa-core/references/defect-management-doctrine.md` Part 4; `.agents/project.yaml` |
| Two modalities | `jira-native` (factory default) and `jira-xray`, resolved by probing; the modality changes the VERB, never the ROI verdict | `#modalidades` | `.agents/skills/test-documentation/SKILL.md` §"Phase 0" |
| ROI verdict is not a Jira status | Candidate / Manual / Deferred are verdicts; the same words also exist as statuses and are not the same thing | `#jira` | `agentic-qa-core/references/artifact-lifecycle.md` §1 (TC row), §1.1 |
| Bug / Defect / Improvement | classified by the FEATURE's lifecycle stage, not by where it was found; the three share one Jira workflow; classify before filing | `#jira`, `/diagramas/jira-bug` | `agentic-qa-core/references/defect-management-doctrine.md` Part 1 |
| Internal cycles | TMLC and TALC are pedagogical names mapped onto the stages; SDC (Story) and BLC (Bug) are the real state machines; PLC is declared empty | `#ciclos` | none by name: `references/phases-steps-cycles.md`; state machines in `.agents/jira-workflows.json` |
| Autonomy and verifier | a 0-5 scale per stage; a separate verifier where the stage says so | `#stages` | `agentic-qa-core/references/stage-gates.md` §"Autonomy scale (CSA 0-5)", §"Contract table" |
| The human decides | agent executes, evidence proves, the human owns the decision; dense or batched decisions go to the `mkd` deck | `#principios` | `agentic-qa-core/references/decision-elicitation-doctrine.md`; `AGENTS.md` §2 |
| Jira workflows per type | status and transition NAMES come from `.agents/jira-workflows.json`, which wins over any SKILL.md | `#jira`, `/diagramas/jira-user-story`, `/diagramas/jira-test` | `.agents/jira-workflows.json`; `.agents/jira-required.yaml` |
| Trifuerza | UI · API · DB, the exploration model of Execution, run AFTER the smoke; surfaces chosen by triage, veto and risk score | `#trifuerza` | `.agents/skills/sprint-testing/SKILL.md`; `agentic-qa-core/references/preflight-gate.md` §5 |
| Analyst + Automation Engineer | two roles, asynchronous and parallel; the TMLC → TALC seam is the I of Integrated | `#ciclos`, `#principios` | none: `references/agentic-contract.md` |
| The thirteen invariants | `choreography` … `loop-not-sequence`, each with a slug | `#principios` | partial: `references/principles.md` maps each to its repo twin |
| Maturity levels | L1 Prevention · L2 Early Detection · L3 Continuous Detection · L4 Production Observation; the level sets how far Late-Game goes | `#iql`, `/late-game` | `agentic-qa-core/references/stage-gates.md` §"The stages, by name" (Capability column) |
| KATA | four named layers plus optional Steps; test files consume, they are not a layer; `@atc('KEY')` names the code representation of an Acceptance Test Case | `#arquitectura`, `/diagramas/automatizacion-de-tests` | `AGENTS.md` §10; `.agents/skills/test-automation/references/kata-architecture.md` |
| Test design | AC-verify is not testing · the AC is the floor · one criterion explodes into many cases · risk lives outside the criterion; technique triggers | `/early-game` | `agentic-qa-core/references/test-design-doctrine.md` |
| Eight approaches | Shift-Left, Shift-Right, Risk-Based, Continuous, Agile, Exploratory, BDD, AI-Driven; the IQL's contribution is the ORDER, not the approaches | `#fases` | none: `references/approaches.md` |
| Light mode | four collapsible gates with condition and cost; four that never collapse | `#principios` | none as a mode: `references/agentic-contract.md`; the never-collapsed four are hard gates in `agentic-qa-core/references/stage-gates.md` |

## Rules (judgment, dated)

- 2026-09-24 · When the website and the repo disagree, the repo's executable doctrine is what the skills enforce; say so, cite both, and never "fix" one side from this skill. Measured: the disagreement ledger in the context-skills implementation report (fleet worker `context-a`), which lists the known cases with both readings.
- 2026-09-24 · "ATC" has two legitimate readings: on the site it is the Acceptance Test Case (a TC born from an acceptance criterion; A is never Automated), and in KATA `@atc('KEY')` is the code representation of that same case. Read `AGENTS.md` §10 "ATC" as the code method. Measured: `#artefactos` vs `AGENTS.md` §10.
- 2026-09-24 · A "Stage N" in an older skill or comment is a historical number, not a name; resolve it through the table in `agentic-qa-core/references/stage-gates.md` and answer with the name. Measured: numbers still appear in `AGENTS.md` §5 and in the sprint-testing / regression-testing headings.
- 2026-09-24 · Regression autonomy is stated as "3" on the site; the repo's contract table carries its own wording with a condition for a clean GO. Quote the repo when a skill asks what it may decide alone. Measured: `#stages` card Regression vs `agentic-qa-core/references/stage-gates.md`.

## Not here

- The product under test (entities, endpoints, infra, personas) → `.context/` maps and the project's own `<aspect>-context` skills (`project-context` mode `context-skill`).
- Any procedure: what a stage DOES step by step → the owning workflow skill.
- Jira content and status names → `.context/PBI/` (the synced mirror) and `.agents/jira-workflows.json`.
- A test-architecture decision → `.context/ADR/`.

## How a project adapts it (two seams, the body stays synced)

| Kind of adaptation | Seam | Mechanism |
|---|---|---|
| Values: which stages the project runs, gate strictness, execution profile | `.agents/project.yaml` → `qa.methodology` | the yaml is bootstrap-only and schema-diffed, so a key upstream adds later is offered insert-only by `bun run up` |
| Prose: a project rule, a local exception, a renamed artifact | `references/project-overrides.md` | delivered once when missing, never overwritten (bootstrap-only), project-owned |
| The skill body and the other references | none | synced verbatim; a direct edit gets a parity row on the next sync, and the fix is a refinement proposal upstream |

## References

Load one per aspect; none is needed to answer from the index above.

| Reference | Read when |
|---|---|
| `references/phases-steps-cycles.md` | the question names a phase, a step number, TMLC / TALC / SDC / BLC / PLC, a moment, or a maturity block |
| `references/agentic-contract.md` | roles and guardrails per stage, the two execution profiles, light mode, quality attributes by risk, the method's metrics, the agentic routine, golden sets |
| `references/principles.md` | the thirteen invariants by slug, the three seams of the I |
| `references/approaches.md` | one of the eight approaches and where the IQL makes it concrete |
| `references/gotchas.md` | something reads two different ways between the site, the repo and a project |
| `references/project-overrides.md` | always, in a consumer project: the local rules win there |

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits. A refinement that belongs to this project alone goes to `references/project-overrides.md`; one that belongs to the method goes upstream per `agentic-qa-core/references/upstream-feedback.md`.
