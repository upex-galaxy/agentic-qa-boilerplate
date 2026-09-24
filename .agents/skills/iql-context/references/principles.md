# IQL principles: the thirteen invariants, the three seams, the two execution profiles

Source: the official UPEX methodology site, https://www.upexgalaxy.com/metodologia, section `#principios`
("Principios e invariantes", "Las tres costuras de la I", "Los dos perfiles de ejecución"). Fetched
2026-09-23 and re-checked 2026-09-24. Spanish original; translated here, slugs kept verbatim.

This file states what the site declares as invariant and points at where the repo enforces it. It
never restates the repo's procedure. **On any conflict the repo's executable doctrine wins**: the
references under `agentic-qa-core/references/` are what the skills run against; this file is the
reading of the public method that a session can cite when a user asks "why". Where the site and the
repo disagree the site's reading is written here with a pointer, never a resolution.

## The thirteen invariants

Source: https://www.upexgalaxy.com/metodologia#principios. The site introduces them as "what does
not change when the stack, the tracker or the client changes", each pointing at the steps that
materialise it. "Where the repo enforces it" names the reference that encodes the same rule as a
gate or a contract; `web only` means the repo does not encode it by name and the skill cites the
site alone. `partial` means the repo encodes a consequence of the invariant, not the invariant.

| # | Slug | Statement | Where the repo enforces it |
|---|---|---|---|
| 1 | `choreography` | The method's contribution is not Shift-Left, Risk-Based, CI or observability but their ordering: understand, plan, explore, learn, prioritise by risk and ROI, document only what deserves to live, automate what deserves automation, integrate into CI, observe production, feed the next cycle. | partial: the stage order and per-stage gates in `agentic-qa-core/references/stage-gates.md` ("The stages, by name") |
| 2 | `execute-first-document-later` | Executing first does not mean testing without a plan: the analysis, the FTP and the ATP exist before the sprint; exploration runs against that plan, and only with real evidence is it decided which scenarios become persistent regression cases. | `agentic-qa-core/references/stage-gates.md` (Documentation is post-sprint, on already-validated behaviour); `agentic-qa-core/references/artifact-lifecycle.md` (ATP field-first, TC born at Documentation in jira-native) |
| 3 | `risk-based` | Everything is prioritised by risk: which stories are explored first, which quality attributes apply to each, which cases get documented; nothing enters the suite by habit. | `agentic-qa-core/references/test-design-doctrine.md` (risk = likelihood x impact; risk outside the criterion) |
| 4 | `roi-regression` | A case is persisted and automated only when its regression value was demonstrated; the ROI verdict (Candidate, MANUAL, Deferred) is decided at step 4 and stamped at step 6, and the suite is maintained by the same criterion. | `agentic-qa-core/references/stage-gates.md` (Documentation contract: one verdict per scenario, the >50% Candidate/Manual alarm); `agentic-qa-core/references/artifact-lifecycle.md` (verdict vs Jira status) |
| 5 | `tmlc-talc-seam` | The QA Analyst's work does not end in a folder of cases: it produces candidates that feed the QA Automation Engineer's cycle directly; that seam between TMLC and TALC is the I of Integrated. | partial: the Candidate handoff from Documentation to Automation in `agentic-qa-core/references/stage-gates.md`; the cycles are not named in the repo |
| 6 | `gates-and-artifacts` | Every step leaves a named artifact and a transition in the tracker (MTP, FTP, STP/STR, ATP/ATS/ATR, ATC); the gates are the transitions, and without the artifact there is no next step. | `agentic-qa-core/references/stage-gates.md` (DoD per stage) and `agentic-qa-core/references/artifact-lifecycle.md` (declared lifecycle per artifact) |
| 7 | `sdlc-sync-point` | Step 2 is not a QA activity: it is the synchronisation point with the SDLC, the period in which development builds while QA works in parallel; it is counted among the 15 steps so the cycle reads whole, and drawn differently. | web only (the repo has no step enumeration; the SDLC events it does model are the MTP / STP / STR rows of `agentic-qa-core/references/artifact-lifecycle.md`) |
| 8 | `stlc-absorbed` | IQL does not replace the STLC: it absorbs it, as an operating model of Software Quality Engineering that integrates the STLC activities inside the SDLC and extends them to production. | web only |
| 9 | `maturity-bounded` | IQL defines what to observe and what to improve; the maturity level defines how far to implement Late-Game; the concrete targets are defined by each product. | partial: the Capability column (L1 to L4) of `agentic-qa-core/references/stage-gates.md` ("The stages, by name") |
| 10 | `agent-executes` | Agent executes, evidence proves, human owns the decision: the agent runs the skills, the evidence proves each conclusion, and the person decides what is prioritised, what is automated, what is approved. | `agentic-qa-core/references/stage-gates.md` (contract table, "The person signs" column); `agentic-qa-core/references/decision-elicitation-doctrine.md` (how a decision is put to the human) |
| 11 | `verifier-not-executor` | Whoever verifies is not whoever executed: another agent reviews the work in a clean context and against the original artifact (ROI verdicts against the ATR, code against the approved plan); an executor auditing itself confirms its own reading. | `agentic-qa-core/references/stage-gates.md` (contract table, "Separate verifier" column; "Feedforward and feedback") |
| 12 | `agent-is-measured` | The agent is measured too: every stage has its golden set (a reference ATP, a reference ROI verdict, a reference failure classification) and its evals; without them "evidence proves" tests the product and not the executor, and there is no ground to raise autonomy. | partial: skill evals in `agentic-qa-core/references/skill-scaffold.md` (`evals/evals.json`); no golden artifact sets |
| 13 | `loop-not-sequence` | The cycle is a loop, not a queue: production feeds the next cycle's analysis through a named mechanism (the error budget and the escape rate), not through good intentions; without a number that returns to step 1 the last step is an ending, not a return. | web only (Observation is declared without a skill in `agentic-qa-core/references/stage-gates.md`; no metric flows back to Shift-Left in the repo) |

Reading note: the site orders these as a list of principles; the repo orders its doctrine by stage.
A session citing an invariant cites the slug and this table, then the repo path in the last column.

### Where each invariant lands

The site says every invariant "points at the steps that materialise it". The repo has no step
enumeration, so this map lands each invariant on the named stages of
`agentic-qa-core/references/stage-gates.md` instead; a session that needs the step numbers reads
the site (`#stages`, the "Steps que lo componen" block of each card).

| Slug | Stages where it is exercised | Stage where it is gated |
|---|---|---|
| `choreography` | all eight, in their declared order | every stage's DoD (the order is the gate) |
| `execute-first-document-later` | Execution, Reporting, then Documentation | Documentation (runs on validated behaviour only) |
| `risk-based` | Shift-Left, Planning, Documentation | Planning (surfaces by triage, veto, risk score) |
| `roi-regression` | Documentation, Automation, Regression | Documentation (one verdict per scenario) |
| `tmlc-talc-seam` | Documentation into Automation | Automation (Candidates only) |
| `gates-and-artifacts` | all eight | every stage (artifact plus transition) |
| `sdlc-sync-point` | none: step 2 sits between Shift-Left and Planning, outside every stage | none (an SDLC event, not a QA gate) |
| `stlc-absorbed` | all eight | none (a framing, not a gate) |
| `maturity-bounded` | Regression, Observation | Observation (which routines exist at all) |
| `agent-executes` | all eight | every "person signs" line of the contract table |
| `verifier-not-executor` | Documentation (recommended), Automation (required) | Automation (mandatory separate verifier) |
| `agent-is-measured` | all eight | none in the repo (see `agentic-contract.md`, "Golden sets and evals") |
| `loop-not-sequence` | Observation back into Shift-Left | none in the repo (no metric returns to Shift-Left) |

### Disagreements this file leaves open

| Topic | Site reading | Repo reading |
|---|---|---|
| Regression autonomy | 3 on the 0-5 scale (`#stages`, Regression card) | 3, with 4 allowed on a clean GO (`agentic-qa-core/references/stage-gates.md`, contract table and autonomy scale) |
| Cycle names | TMLC and TALC are named and mapped onto the stages, and called pedagogical (`#principios`, seam 02) | not named; the ROI gate plays the seam without the vocabulary |
| Step 2 | counted among the 15 steps and drawn differently (`#principios`, #7) | no step enumeration; SDLC contact is modelled as artifacts (`agentic-qa-core/references/artifact-lifecycle.md`) |
| Golden sets | one per stage, required to raise autonomy (`#principios`, #12) | skill evals only (`agentic-qa-core/references/skill-scaffold.md`); autonomy ceilings are declared, not measured |

## The three seams of the I

Source: https://www.upexgalaxy.com/metodologia#principios, "Las tres costuras de la I". The site
gives them in this order on purpose: the one that makes the method agentic, the one that sews the two
cycles, and the one that puts the STLC inside the SDLC.

| Seam | What the site says | Repo twin |
|---|---|---|
| 01 Human, agent, evidence | The agent executes, the evidence proves, the person decides. The three are sewn into every stage by its contract: what the agent does, what the person signs, what evidence the gate demands. Without this seam the method would have agents but would not be agentic. | `agentic-qa-core/references/stage-gates.md` ("The agentic contract per stage": the contract table is exactly the three columns the site names, plus autonomy and verifier) |
| 02 TMLC, TALC | The QA Analyst's work does not end in a folder of cases: it produces candidates that feed the QA Automation Engineer's cycle, and the ROI gate decides which pass. The site calls it the original seam of the method. | partial: the ROI gate and the Candidate-only entry to Automation in `agentic-qa-core/references/stage-gates.md` (Documentation and Automation rows); TMLC and TALC are not named in the repo, the site itself calls them pedagogical names |
| 03 STLC inside SDLC | IQL absorbs the STLC, integrates its activities inside the SDLC and extends them to production; step 2 is the point where the two lines synchronise. | web only (see invariants #7 and #8; the repo models SDLC contact as artifacts, not as a step) |

Diagram that draws seams 02 and 03 on one axis: https://www.upexgalaxy.com/metodologia/diagramas/stlc-vs-iql.

## The two execution profiles

Source: https://www.upexgalaxy.com/metodologia#principios, "Los dos perfiles de ejecución". The
site states that IQL is executor-agnostic: the method defines what gets done and what gates it, not
who or what runs it.

| Profile | Who executes | What the site says stays with a person |
|---|---|---|
| Manual execution | A person runs every stage with the tools of the catalogue. | The human gates still exist: the one who executes is not the one who approves the ROI verdict or the merge. |
| Agentic execution (the site badges it `AIQL`) | An agent runs the skills under the seven guardrails and each stage's contract. | The person decides at the declared decision points. This is the profile the Agentic Quality Engineer course teaches, and the one that must be qualified with evals before its autonomy is raised. |

What is human in both profiles, read across the two cards and the "never collapsed" list of the same
section (detail in `agentic-contract.md` of this skill):

| Human in both | Where the repo holds it |
|---|---|
| Approval of every ROI verdict | `agentic-qa-core/references/stage-gates.md` (Documentation, "The person signs") |
| Approval of the merge | `agentic-qa-core/references/stage-gates.md` (Automation, "The person signs") |
| Explicit agreement before filing each bug | `agentic-qa-core/references/stage-gates.md` (Execution); `agentic-qa-core/references/defect-management-doctrine.md` |
| Approval of the automation plan before code | `agentic-qa-core/references/stage-gates.md` (Automation) |

The repo does not name the two profiles; every workflow skill assumes the agentic one, and the
manual profile is what a person does when running the same stages without a harness. A session
should not present "manual" as a degraded mode: the site presents it as the same method with a
different executor and the same gates.
