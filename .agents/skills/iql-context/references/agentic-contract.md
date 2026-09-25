# IQL agentic contract: roles, guardrails, light mode, quality attributes, metrics, routines, evals

Source: the official UPEX methodology site, https://www.upexgalaxy.com/metodologia (sections
`#principios`, `#stages`, `#vista-ejecutiva`, `#bucle`) and its phase pages
https://www.upexgalaxy.com/metodologia/early-game and https://www.upexgalaxy.com/metodologia/late-game.
Fetched 2026-09-23 and re-checked 2026-09-24. Spanish original; translated here.

This file ports only what the site states and the repo does not encode by name. The repo's
executable contract per stage (autonomy scale CSA 0-5, contract table, verifier posture, DoD per
stage) lives in `agentic-qa-core/references/stage-gates.md` and **wins on any conflict**; nothing
from it is restated here. Where the site and the repo disagree, the site's value is written and the
repo path is pointed at; the disagreement is not resolved in this file.

Vocabulary translated once, then used in English: Lectura = Read, Escritura = Write, Aprobación =
Approval, Secretos = Secrets, Validación = Validation, Trazabilidad = Traceability, Checkpoints =
Checkpoints. Roles keep the site's English names: QA Analyst, QA Lead, QA Automation Engineer,
Executor, Verifier, Guardian.

## Roles and guardrails per stage

Source: https://www.upexgalaxy.com/metodologia#stages (one card per stage, lines "Roles",
"Guardrails que lo gobiernan", "Autonomía", "Verificador separado"). Autonomy and verifier are
transcribed as the site states them; the repo's own values are in the contract table of
`agentic-qa-core/references/stage-gates.md`, which has neither a roles column nor a guardrail
vocabulary.

| Stage | Roles (site) | Guardrails named (site) | Autonomy (site) | Separate verifier (site) |
|---|---|---|---|---|
| Shift-Left | QA Analyst, Executor | Read, Write, Approval, Validation, Checkpoints | 2 on the 0-5 scale | not needed |
| Planning | QA Analyst, Executor | Read, Write, Approval, Validation, Traceability, Checkpoints | 2 | not needed |
| Execution | QA Analyst, Executor | Read, Write, Approval, Secrets, Validation, Checkpoints | 3 | not needed |
| Reporting | QA Analyst, Executor | Read, Write, Approval, Validation, Traceability, Checkpoints | 2 | not needed |
| Documentation | QA Analyst, QA Lead, Executor, Verifier | Read, Write, Approval, Validation, Traceability, Checkpoints | 2 | recommended; verifies: second-agent |
| Automation | QA Automation Engineer, QA Lead, Executor, Verifier | Read, Write, Approval, Secrets, Validation, Traceability, Checkpoints | 2 to 3, ceiling inside the approved plan | mandatory; verifies: pr-review-lead, judgment-day |
| Regression | QA Automation Engineer, QA Lead, Executor, Guardian | Read, Approval, Secrets, Validation, Traceability, Checkpoints | 3 (repo: see `agentic-qa-core/references/stage-gates.md`, which allows 4 on a clean GO) | not needed |
| Observation | QA Lead, Guardian | Read, Approval, Secrets, Validation, Checkpoints | 3 | does not apply yet |

Readings the table makes visible: Regression is the one stage the site lists without the Write
guardrail (the suite reads, the person decides); Secrets appears only where the agent touches a
running environment or a pipeline (Execution, Automation, Regression, Observation); Verifier is a
role only where a separate verifier exists (Documentation, Automation); Guardian appears only in
the two stages that run on CI or in production. Each card also states what the agent does, what the
person signs and what evidence is demanded; those three columns are the repo's contract table and
are cited from `agentic-qa-core/references/stage-gates.md`, not copied here.

## The seven guardrails

Source: https://www.upexgalaxy.com/metodologia#principios ("Los guardrails del agente"). The site
lists the seven and, on the stage cards, which ones govern each stage. It defines only two of them
in prose; the rest are named, not defined, and this table says so rather than inventing a definition.

| Guardrail | What the site says | Defined or only named |
|---|---|---|
| Read | What the agent may read. Instanced per routine as the `read` permission (late-game, "Permisos acotados"). | defined by example |
| Write | What the agent may write, and nothing else. Instanced per routine as the `write` permission. | defined by example |
| Approval | Named on every stage card; the "person signs" line of each card is where it lands. | only named |
| Secrets | Named on the cards of Execution, Automation, Regression and Observation. | only named |
| Validation | No conclusion without reproducible evidence (`#arquitectura`, "Evidencia como salida de primera clase"; repeated as the third element of the routine anatomy). | defined |
| Traceability | Named on the cards of Planning, Reporting, Documentation, Automation and Regression; the architecture section ties it to the cascade case, plan, story, criterion. | only named (mechanism in `agentic-qa-core/references/traceability-linking.md`) |
| Checkpoints | Named on every stage card. | only named (the repo's checkpoints are the "person signs" entries and the light stage verifier in `agentic-qa-core/references/stage-gates.md`) |

## Light mode

Source: https://www.upexgalaxy.com/metodologia#principios ("El modo light"). The site defines
four gates that may be collapsed "when the release squeezes", each with a condition and a cost.

| Collapsible gate | Condition (site) | Cost (site) |
|---|---|---|
| The ATP as a Test Plan item of the Planning stage | The ATP exists in the story's `acceptance_test_plan` field and the sprint already has an STP. | The story does not appear in the sprint coverage panel until the item is created. (Repo: only the ATS to Story edge fills coverage, see `agentic-qa-core/references/traceability-linking.md`; the site says the same on its test-management diagram.) |
| Promoting the cases to the feature Test Set | The feature has a single live story, or the TS already exists from an earlier sprint. | The feature smoke has to be assembled by hand the next sprint. |
| The recommended verifier of the ROI verdicts | Fewer than five scenarios and none lands in Candidate. | The regression filter loses its second reading: the >50% Candidate/Manual alarm loses its control. |
| The five-run history before declaring FLAKY | The failure reproduces by hand and is recorded as INSUFFICIENT HISTORY in the report. | A real regression can be archived as flaky; the debt is paid the next sprint. |

Activation rule, as the site states it:

| Rule | Statement |
|---|---|
| Who | The QA Lead decides it. |
| Scope | One sprint, written in the STP. |
| Inheritance | Never inherited by the next sprint. |
| Debt | Every collapsed gate leaves a debt item in the backlog with its condition and its date. A light mode without recorded debt is a gate that was lost, not a gate that was collapsed. |

What is never collapsed (site): the ATR with Test Environment (the site calls it a hard gate of the
boilerplate: without a declared environment the result says nothing); the explicit human agreement
before filing each bug; the approval of the automation plan before writing code; the human approval
of the merge.

Repo posture: the repo has no light mode. The four never-collapsed items exist as hard gates in the
Planning DoD, the Execution contract and the Automation contract of
`agentic-qa-core/references/stage-gates.md`; the four collapsible gates exist there as ordinary
gates with no collapse path, so a session asked to "run light" has nothing to invoke and should say
so, then cite this section.

## Quality attributes declared by risk

Source: https://www.upexgalaxy.com/metodologia/early-game (step 1, "Atributos de calidad por
riesgo"). Each story's ATP declares which attributes apply and why, derived from the story's risk:
impact, likelihood, the data it touches and the surface it exposes. What does not enter by risk is
not tested in that story. The FTP may raise an attribute to the whole feature. Functionality always
applies.

| Attribute | Applies when (site) |
|---|---|
| Functionality | Always (it is the acceptance criterion). |
| Security | The story touches authentication, roles or sensitive data, or receives external input. |
| Performance | The story adds listings, queries or heavy calculations, or touches a flow with an SLO. |
| Accessibility | The story creates or changes public UI. |
| Resilience | The story depends on external integrations, queues or retries. |
| Data integrity | The story writes, migrates or transforms persisted data. |
| Compatibility | The story runs on several browsers, devices or API versions. |
| Privacy | The story processes personal or regulated data. |

Repo twin: the risk formula (risk = likelihood x impact) and the "risk outside the criterion"
principle in `agentic-qa-core/references/test-design-doctrine.md`; the repo derives cases by
technique and by risk but does not declare attributes per ATP by name, so this list is web only.

## Method metrics

Source: https://www.upexgalaxy.com/metodologia/late-game ("Las 6 métricas del Late-Game" and
"Las métricas del método"). The site separates the product's production metrics from the method's
own metrics. Production targets are marked `targetKind: example` on the site: reference benchmarks,
never universal objectives; each implementation declares its own in `implementationTargets`.

| Late-Game production metric (site) | Reference target (site, example only) |
|---|---|
| MTTD, mean time to detect | under 5 minutes |
| MTTR, mean time to resolution | under 30 minutes |
| Application error rate | under 0.1% |
| CSAT | above 4.5 of 5 |
| SLO compliance | above 99.9% |
| Core Web Vitals performance score | above 90 of 100 |

| Method metric (site) | What it measures (site) | Repo |
|---|---|---|
| Change failure rate | Share of deployments ending in incident, rollback or hotfix; the DORA metric that says whether the method sustains velocity or only pushes it. | not measured |
| Escape rate | Bugs found in production over all bugs of the period; the one thing the method promises, that the defect is found earlier. | not measured |
| Deferred ratio | Share of scenarios the ROI gate keeps out of regression; the filter's health. Alarm: more than half in Candidate or Manual means the filter was not applied, and the discard phase runs again. | the >50% Candidate/Manual alarm in `agentic-qa-core/references/stage-gates.md` (Documentation) |
| Flaky rate | Tests that change result without a code change, over the whole suite; what decides whether the team believes the regression. | the FLAKY rule (five runs of history, else INSUFFICIENT HISTORY) in `agentic-qa-core/references/stage-gates.md` (Regression); no rate is computed |
| Lead time AC to ATP (site marks it optional) | Time from a story having acceptance criteria to having its acceptance test plan; whether Shift-Left arrives on time. | not measured |

How production feeds step 1 (site, `#bucle` and invariant `loop-not-sequence`): the error budget and
the escape rate are the named numbers that return to the next cycle's analysis; the site treats a
loop without such a number as a sequence with an ending.

## Agentic routine anatomy

Source: https://www.upexgalaxy.com/metodologia/late-game (after the Observation card, "La rutina
agéntica"). The site defines the agentic routine as the operating unit of the stages that do not fit
in a session: it runs alone, on a schedule or on a trigger, and its product is evidence with an
addressee. It is what lets Regression and Observation exist without someone sitting to watch them.
Observation has no skill on the site or in the repo; the routine is its declared unit.

| Element | What the site requires |
|---|---|
| Trigger | What wakes it: a schedule, a push, a crossed threshold. Explicit and single; a routine without a named trigger is a script someone runs by hand. |
| Bounded permissions | What it may read and what it may write, and nothing else: the Read and Write guardrails instanced for this routine, not the agent's general trust. |
| Evidence | What it leaves when it ends, whether it ran well or badly: the command, the output, the artifact. Without reproducible evidence there is no conclusion, even when nobody looks. |
| Report | Whom it speaks to and through which channel. A routine that does not report to a person is not autonomy: it is a silenced alarm. |

Repo twins: the Observation entries of `agentic-qa-core/references/stage-gates.md` (declared, no
skill, no DoD, autonomy and verifier stated in the contract table) and the AUTOMATION mode of
`.agents/skills/orca-orchestration/SKILL.md` (an unattended scheduled routine whose dispatcher
never produces output). Neither names the four elements; a routine written in the repo should be
checked against this table until the repo carries its own.

## Golden sets and evals

Source: https://www.upexgalaxy.com/metodologia#principios, invariant `agent-is-measured`. The site
requires, per stage, a golden set and evals: a reference ATP, a reference ROI verdict, a reference
failure classification. Without them, "evidence proves" tests the product and not the executor, and
there is no ground on which to raise an agent's autonomy. The agentic execution profile of the same
section repeats the rule: qualify with evals before raising autonomy.

| Site requirement | Repo twin |
|---|---|
| Evals per stage | skill evals (`evals/evals.json` per workflow skill) in `agentic-qa-core/references/skill-scaffold.md` |
| Golden set per stage (reference ATP, reference ROI verdict, reference failure classification) | none declared; the repo's evals exercise the skill's behaviour, not a reference artifact |
| Autonomy raised only after qualification | the CSA ceiling per stage in `agentic-qa-core/references/stage-gates.md` is a design decision, not the outcome of a measurement |

Maturity bound on all of the above (site, https://www.upexgalaxy.com/metodologia/late-game "Hasta
dónde llegar"): L1 Prevention needs a backlog in a tracker and QA in refinement; L2 Early Detection
needs a pre-merge test environment; L3 Continuous Detection needs pull requests and a CI that runs
per PR; L4 Production Observation needs production observability, progressive delivery for canary
and A/B, and SLOs plus an SRE culture for chaos. The level says which of these routines and metrics
make sense at that level; repo twin for the levels: the Capability column of
`agentic-qa-core/references/stage-gates.md`.
