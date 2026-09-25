# IQL phases, steps and cycles: the structure the web carries and the repo does not

**What this file is.** The skeleton of the Integrated Quality Lifecycle (IQL) as published on the official UPEX website: three phases, four moments, four maturity blocks, fifteen steps, the SDLC events around the loop, and the five named internal cycles. It carries only what the repo's executable doctrine does not already encode. The repo has the eight stages by name, one DoD per stage, the agentic contract and the artifact lifecycle; this file never restates them, it cites them.

**Source.** `https://www.upexgalaxy.com/metodologia` (fetched 2026-09-23; collapsed accordions and tabs re-crawled 2026-09-24) and the three phase pages `https://www.upexgalaxy.com/metodologia/early-game`, `/mid-game`, `/late-game` (fetched 2026-09-23). Spanish text translated to English; proper nouns (Early-Game, Mid-Game, Late-Game, Trifuerza, TMLC, TALC, SDC, BLC, PLC, KATA) and artifact acronyms kept as-is.

**Conflict rule.** The repo's executable doctrine wins on conflict. Where the web reads differently, this file writes the web reading and points at the repo file with "(repo: see ...)" without resolving it.

**Vocabulary the web fixes (`#stages`).** A stage has a name, never a number, and is what gets executed and gated. A step is the breakdown inside a stage. A phase groups steps, not stages, so one stage can straddle two phases.

## Three phases

Source: `https://www.upexgalaxy.com/metodologia#fases` ("Navegar el IQL completo") and the header block of each phase page ("dónde estás dentro del IQL"). Repo twin: none by name. `agentic-qa-core/references/stage-gates.md` §"The stages, by name" carries a Moment and a Capability column per stage, no phase column.

| Phase | Posture (web) | Steps | Protagonist role | Guiding question (translated) | Approaches the phase page lists | Tools the phase page lists |
|---|---|---|---|---|---|---|
| Early-Game | Prevention (Prevención) | 1-4 | QA Analyst | "Let's build it right from the start" | Shift-Left, BDD, Risk-Based | Jira (or equivalent tracker), Confluence (or team wiki), API client (Postman, Bruno, curl), agentic harness (Claude Code, OpenCode, Codex) |
| Mid-Game | Detection (Detección) | 5-9 | QA Automation Engineer | "Does the software meet the requirements?" | Continuous Testing, Agile Testing, AI-Driven | Playwright, GitHub Actions (or equivalent CI), Docker, Xray |
| Late-Game | Observation (Observación) | 10-15 | QA + DevOps | "How does it behave in the real world?" | Shift-Right, Chaos Engineering, Production Monitoring, AI Ops | Sentry / Grafana / Datadog, progressive delivery / feature flags, k6, UptimeRobot (or availability monitor) |

Three readings the phase badges on the stage cards (`#stages`) make explicit:

| Reading | Where the web says it |
|---|---|
| Documentation straddles two phases: step 4 is Early-Game, steps 5 and 6 are Mid-Game | Documentation stage card carries both badges |
| Regression's only step (10) is Late-Game although its capability level is L3 | Regression stage card: badge Late-Game, level L3 Continuous Detection |
| Steps 11-15 are marked "Panorama": taught and evaluated as an industry overview and roadmap, not operated against a real production environment | `late-game` page, "Los 6 steps del Late-Game" |

The Late-Game page also ranks a suggested adoption order by maturity prerequisite: step 10 first (CI green with a regression suite on every PR), then 13 (error tracking and RUM in production), 15 (one production source plus a ritual that returns what was learned to step 1), 11 (progressive delivery with per-cohort metrics), 12 (feature flags and product analytics), 14 (distributed architecture, defined SLOs, an SRE team). Source: `https://www.upexgalaxy.com/metodologia/late-game`, "Madurez" block under each step.

## Four moments and four maturity blocks

Source: `https://www.upexgalaxy.com/metodologia#bucle` ("El bucle del IQL: 8 stages en 4 momentos") and `#vista-ejecutiva` ("El IQL en cuatro bloques"). Repo twin: `agentic-qa-core/references/stage-gates.md` §"The stages, by name" (Moment and Capability columns).

| Moment (web, Spanish) | English | Stages the web places there | Phase badges the web shows | Repo moment vocabulary (repo: see `agentic-qa-core/references/stage-gates.md`) |
|---|---|---|---|---|
| Antes del sprint | Before the sprint | Shift-Left | Early-Game | pre-sprint (batch) |
| Dentro del sprint | Inside the sprint | Planning, Execution, Reporting | Early-Game | in-sprint |
| Cierre y release | Close and release | Documentation, Automation, Regression | Early-Game, Mid-Game, Late-Game | post-sprint |
| Producción | Production | Observation | Late-Game | production |

The moment names differ between web and repo ("Cierre y release" vs "post-sprint"); this file keeps both and picks neither.

The four blocks are the same four maturity levels used later to decide how far to go:

| Block | Level | Problem it attacks (translated) | Result it leaves (translated) | Stages the block lists | Steps the block covers | Phase badge |
|---|---|---|---|---|---|---|
| 01 | L1 Prevention | The most expensive defects are born in ambiguous stories, before a line of code exists | Stories with verifiable criteria and one acceptance plan per story before the sprint starts | Shift-Left, Planning | 1, 2 | Early-Game |
| 02 | L2 Early Detection | A bug found after the merge costs the whole team's rework | Feedback to the developer before the pull request, with real evidence and bugs prioritized by risk | Execution, Reporting, Documentation | 3, 4 | Early-Game |
| 03 | L3 Continuous Detection | Case repositories nobody maintains and automated suites nobody trusts | Reliable regression in CI: only what proved value is documented and automated, and it runs on every pull request | Documentation, Automation, Regression | 5-10 | Mid-Game, Late-Game |
| 04 | L4 Production Observation | What happens in production does not come back to the backlog | Production feeds the strategy: real metrics decide what to observe, test and improve in the next cycle | Observation | 11-15 | Late-Game |

**Web-internal inconsistency on Documentation.** Block 02 lists Documentation and covers steps 3-4; block 03 lists Documentation again and covers steps 5-10; the Documentation stage card (`#stages`) says L3 Continuous Detection and holds steps 4-6. So step 4 (Risk-Based Prioritization) is L2 by the block cards and L3 by the stage card. The repo places the whole Documentation stage at L3 (repo: see `agentic-qa-core/references/stage-gates.md`). Not resolved here.

**Maturity rule (`#vista-ejecutiva`, "Hasta dónde llegar").** IQL defines what to observe and what to improve; the maturity level defines how far to implement Late-Game; each product defines its own concrete targets.

## The fifteen steps

Source: the stage cards under `https://www.upexgalaxy.com/metodologia#stages` ("Steps que lo componen") and the per-phase syllabus: `early-game` "Los 4 steps del Early-Game", `mid-game` "Los 5 steps del Mid-Game", `late-game` "Los 6 steps del Late-Game". Repo twin: none. The repo enumerates stages, not steps (repo: see `agentic-qa-core/references/stage-gates.md`).

| # | Step (translated, Spanish original) | Stage | Phase | Role | Cycle position (web badge) | Deliverable the web names |
|---|---|---|---|---|---|---|
| 1 | Requirements Analysis (Análisis de Requerimientos) | Shift-Left (pre-sprint half) and Planning (in-sprint half) | Early-Game | QA Analyst | TMLC 1st, Analysis | ATP per Story, pre-sprint only in the `acceptance_test_plan` field; FTP per Epic, whose item is created at sprint open |
| 2 | Development and Implementation (Desarrollo e Implementación) | none: SDLC event | Early-Game | Development team | Parallel Work | A working environment for testing (the US built and deployed to staging) |
| 3 | Early Exploratory Testing (Pruebas Exploratorias Tempranas) | Execution (execution half) and Reporting (record half) | Early-Game | QA Analyst | TMLC 2nd, Exploration | US approved or bugs filed, with the Story's ATR as the record of the run; the Feature altitude has no execution of its own |
| 4 | Risk-Based Prioritization (Priorización Risk-Based) | Documentation, Prioritize (ROI) phase | Early-Game | QA Analyst | TMLC 3rd, Prioritization | ATP refined with exactly one ROI verdict per scenario: Candidate, Manual or Deferred |
| 5 | Asynchronous Test Case Documentation (Documentación Asíncrona de Test Cases) | Documentation, Document phase | Mid-Game | QA Automation Engineer | TMLC 4th, Documentation | High-value TC backlog in the TMS, grouped in the Story's ATS, ready for Playwright |
| 6 | TC Evaluation for Automation (Evaluación de TCs para Automatización) | Documentation / Automation boundary | Mid-Game | QA Automation Engineer | TALC 1st, Evaluation | TCs approved to automate (Candidate) or marked Manual; the verdict is stamped with the `approve to automate` transition |
| 7 | Automation of the Candidates (Automatización de los candidatos) | Automation, Plan -> Code | Mid-Game | QA Automation Engineer | TALC 2nd, Automation | Cases implemented in the automation repo on KATA, each method carrying `@atc('KEY')`, PR created |
| 8 | Suite Verification in CI (Verificación de la suite en CI) | Automation, Review + CI | Mid-Game | QA Automation Engineer | TALC 3rd, CI Verification | ATCs stable in CI without flakiness, with traceability reports |
| 9 | Pull Request Review (Revisión del Pull Request) | Automation, Review | Mid-Game | QA Automation Engineer | TALC 4th, PR Review | PR merged, ATCs integrated in CI/CD |
| 10 | Continuous Maintenance | Regression | Late-Game | QA + DevOps | Production Ops | US deployed to production with confidence, plus the sprint STR |
| 11 | Canary Release Monitoring | Observation | Late-Game | QA + DevOps | Shift-Right, Panorama | Safe validation with minimal risk |
| 12 | A/B Testing | Observation | Late-Game | QA + DevOps | Experimentation, Panorama | Decisions based on real user data |
| 13 | Real User Monitoring (RUM) | Observation | Late-Game | QA + DevOps | Observability, Panorama | Full visibility of real UX; metrics named: Core Web Vitals, MTTD, MTTR |
| 14 | Chaos Engineering | Observation | Late-Game | QA + DevOps | Resilience, Panorama | Robust system with validated recovery |
| 15 | Feedback Loop | Observation | Late-Game | QA + DevOps | Continuous Learning, Panorama | Continuous product improvement, feeding the next Early-Game cycle |

Step 2 is counted among the fifteen so the cycle reads as a whole, and it is drawn differently: it is the SDLC synchronization point, the period when development builds while QA works in parallel, and the only step that belongs to no stage (`early-game` page, "Evento del SDLC").

Step 1 has three sub-steps on the web (`early-game` page): [1a] Epic analysis -> FTP (macro context; a living document refined during the whole Epic), [1b] analysis of the Epic's sibling stories (delivered, in development, and only defined) -> the full picture of the feature, [1c] Story analysis -> ATP, citing the FTP instead of re-deriving it.

Tools the web names per step, with the web's own classification (RECOMMENDED = implementation standard default; ADAPTABLE = implementation standard, swappable; CLIENT-CONTROLLED = the environment brings it):

| Step | Tools (classification) |
|---|---|
| 1 | Agentic harness (ADAPTABLE), Jira or equivalent tracker (CLIENT-CONTROLLED), Confluence or team wiki (CLIENT-CONTROLLED) |
| 2 | GitHub / GitLab repository and pull requests (CLIENT-CONTROLLED); the standard requires one branch per story and a reviewed PR |
| 3 | Agentic harness (ADAPTABLE), MCPs for OpenAPI, database, tracker, browser (ADAPTABLE; the MCP reads, never executes: the API is exercised with curl and the CLI token), API client (ADAPTABLE), Jira (CLIENT-CONTROLLED) |
| 4 | Jira (CLIENT-CONTROLLED); criteria named: potential impact, defect probability, value-cost-risk |
| 5, 6 | Xray (ADAPTABLE; UPEX operates `jira-xray`, the boilerplate starts in `jira-native`), Jira (CLIENT-CONTROLLED) |
| 7 | KATA (RECOMMENDED), Playwright (RECOMMENDED), agentic harness (ADAPTABLE), Jira (CLIENT-CONTROLLED) |
| 8 | Playwright (RECOMMENDED), Docker (RECOMMENDED), GitHub / GitLab (CLIENT-CONTROLLED), GitHub Actions or equivalent CI (CLIENT-CONTROLLED), Slack / Teams (CLIENT-CONTROLLED) |
| 9 | Playwright (RECOMMENDED), agentic harness (ADAPTABLE), GitHub / GitLab (CLIENT-CONTROLLED) |
| 10 | Playwright (RECOMMENDED), Xray (ADAPTABLE), GitHub Actions or equivalent CI (CLIENT-CONTROLLED) |
| 11-15 | Sentry / Grafana / Datadog, progressive delivery / feature flags, k6 (only when performance enters by risk in step 1), UptimeRobot, chaos tooling (Gremlin, Litmus, own scripts), Jira, Slack / Teams: all CLIENT-CONTROLLED except k6 (ADAPTABLE) |

Two notes the web attaches to the steps that the repo encodes elsewhere:

| Web note | Repo file to read instead of this note |
|---|---|
| Candidate, MANUAL and Deferred are ROI verdicts decided at step 4; the three also exist as Jira statuses (Candidate and MANUAL on the TC, Deferred on the Bug) and the verdict and the status are not the same thing | `agentic-qa-core/references/artifact-lifecycle.md` §1 (TC row) and §1.1 |
| Each step lists its Jira transitions by name (US, TC, Bug / Defect / Improvement). The web lists `Draft -> In Design -> READY` under step 5 (Documentation); the repo has the modality-conditional owner of those transitions | `.agents/jira-workflows.json` for the names; `agentic-qa-core/references/artifact-lifecycle.md` §1 and `agentic-qa-core/references/stage-gates.md` §"Lifecycle expectations per stage" for who fires them (repo: see both; not resolved here) |

## SDLC events around the loop

Source: the "Los eventos del SDLC" accordion under `https://www.upexgalaxy.com/metodologia#stages` (re-crawl 2026-09-24) and `#bucle`. Repo twin: `agentic-qa-core/references/artifact-lifecycle.md` §1 (MTP, STP, STR rows) and `agentic-qa-core/references/planning-ladder.md` §2 (Plan and Runner per altitude).

| Event (web, Spanish) | English | Artifact | When | What the web says (translated) | Owner the web names |
|---|---|---|---|---|---|
| Onboarding del producto | Product onboarding | MTP | once per product | Written once, outside the sprint cycle, when the team enters the product. Not an IQL step because it does not repeat with every story: it is the starting condition of every cycle that follows | `/master-test-plan` (the web's name; repo: the MTP is the QA Master Test Plan Epic, produced by `project-context` mode `test-plan`; see `agentic-qa-core/references/artifact-lifecycle.md` and `agentic-qa-core/references/planning-ladder.md` §1.1) |
| Apertura de sprint | Sprint open | STP | pre-sprint | Born when the sprint opens, on the first ticket touched, not in a step of its own. If the client's tracker lacks the plan work type, the event is skipped with a declared note, never silently | `/sprint-testing` (find-or-create on the first ticket of the sprint) |
| Desarrollo e implementación | Development and implementation | none | in-sprint | The SDLC sync point: development builds while QA prepares. Counted among the 15 steps so the cycle reads, which is why it is the only step that belongs to no stage | the development team (step 2 of 15) |
| Cierre de sprint | Sprint close | STR | post-sprint | Recaps the sprint and closes the STP. Not the sum of the ATRs: on the results side there is no structural aggregation, so the ATRs are read and reviewed together, beside the STR | `/sprint-testing` or `/regression-testing`, whichever arrives first (repo: see `agentic-qa-core/references/stage-gates.md` §"Sprint close" and `agentic-qa-core/references/traceability-linking.md` §3 on the results side having no roll-up edge) |

The loop (`#bucle`) draws three return arrows a linear model cannot: the defect, the NO-GO, and production feeding the next cycle's analysis. The web names the mechanism for the third arrow (error budget and escape rate): without a number that returns to step 1, the last step is an ending, not a return.

## Internal cycles

Source: `https://www.upexgalaxy.com/metodologia#ciclos` ("Los ciclos que corren adentro"). Repo twin: none by name. The web itself states that TMLC and TALC are UPEX pedagogical names, not the boilerplate's live pipeline, where work is organized by stage with one owning skill each; and that SDC and BLC are the real state machines of the instance, read from `.agents/jira-workflows.json`.

**TMLC, Test Manual Life Cycle** (four stages; the web maps TMLC 1st to Shift-Left and Planning, TMLC 2nd to Execution and Reporting, TMLC 3rd and 4th to Documentation):

| TMLC stage | Name (translated) | Step | Boilerplate stage |
|---|---|---|---|
| 1st | Analysis | 1, Requirements Analysis | Shift-Left (pre-sprint) and Planning (in-sprint) |
| 2nd | Exploration | 3, Early Exploratory Testing | Execution and Reporting |
| 3rd | Prioritization | 4, Risk-Based Prioritization | Documentation, Prioritize (ROI) phase |
| 4th | Documentation | 5, Asynchronous Test Case Documentation | Documentation, Document phase |

**TALC, Test Automation Life Cycle** (four stages; the web maps TALC 1st to the Documentation/Automation boundary and TALC 2nd to 4th to Automation):

| TALC stage | Name (translated) | Step | Boilerplate stage |
|---|---|---|---|
| 1st | Evaluation | 6, TC Evaluation for Automation | Documentation / Automation boundary |
| 2nd | Automation | 7, Automation of the Candidates | Automation, Plan -> Code |
| 3rd | CI Verification | 8, Suite Verification in CI | Automation, Review + CI |
| 4th | PR Review | 9, Pull Request Review | Automation, Review |

The web names Documentation's sub-phases Prioritize and Document only; the repo names Analyze / Prioritize / Document (repo: see `agentic-qa-core/references/stage-gates.md` §"Documentation"). The TMLC -> TALC seam (step 5 -> step 6) is what the web calls the I of Integrated.

**SDC, BLC and PLC** (the web: two real state machines and one declared-empty cycle):

| Cycle | Full name (web) | Applies to | What the web says (translated) | Where the names live |
|---|---|---|---|---|
| SDC | Story Development Cycle, "UPEX Feature (US) Workflow" | `story` | The story's end-to-end path. The IQL does not invent it, it accompanies it: Shift-Left lives between Backlog and Estimation, Execution and Reporting between In Test and QA Approved, and the BLOCKED branch is the return a linear model cannot express | `.agents/jira-workflows.json` (`story`); status and transition names come from there, never from prose |
| BLC | Bug Life Cycle, "UPEX BUG/DEFECT LIFE CYCLE" | `bug`, `defect`, `improvement` | The finding's path, shared by the three work types: Bug if the feature is already live above Staging, Defect if still pre-release, Improvement if no acceptance criterion is violated. Classifying before filing is mandatory | `.agents/jira-workflows.json` (`bug`); classification rule in `agentic-qa-core/references/defect-management-doctrine.md` |
| PLC | Production Lifecycle | (none yet) | What happens after release: signal, item, decision, return to analysis. Declared so the model does not pretend it does not exist, and declared empty so nobody sells it before the skill that runs it exists. Its stage is Observation | nowhere: declared empty on the web; the repo's Observation stage has no skill and no DoD (repo: see `agentic-qa-core/references/stage-gates.md` §"Observation") |

The web prints state and transition counts for SDC and BLC. They are instance data synced from Jira Cloud, so this file does not repeat them: read `.agents/jira-workflows.json`.

## Where the boilerplate stages map

Source: the eight stage cards under `https://www.upexgalaxy.com/metodologia#stages` (badges, "Skill dueña", "Autonomía", "Verificador separado", "Roles"). Repo citation for every row: `agentic-qa-core/references/stage-gates.md` (§"The stages, by name" for the moment and level, §"Contract table" for autonomy and verifier, and the per-stage DoD under §"Per-stage DoD checklists").

| Web stage | Moment (web) | Phase badges | Level | Cycle badges | Owning skill (web) | Autonomy (web, 0-5) | Separate verifier (web) | Roles (web) | Repo citation |
|---|---|---|---|---|---|---|---|---|---|
| Shift-Left | Antes del sprint | Early-Game | L1 Prevention | TMLC 1st | `shift-left-testing` | 2 | not needed | QA Analyst, Executor | `agentic-qa-core/references/stage-gates.md` §"Shift-Left" |
| Planning | Dentro del sprint | Early-Game | L1 Prevention | TMLC 1st | `sprint-testing` | 2 | not needed | QA Analyst, Executor | `agentic-qa-core/references/stage-gates.md` §"Planning" |
| Execution | Dentro del sprint | Early-Game | L2 Early Detection | TMLC 2nd | `sprint-testing` | 3 | not needed | QA Analyst, Executor | `agentic-qa-core/references/stage-gates.md` §"Execution" |
| Reporting | Dentro del sprint | Early-Game | L2 Early Detection | TMLC 2nd | `sprint-testing` | 2 | not needed | QA Analyst, Executor | `agentic-qa-core/references/stage-gates.md` §"Reporting" |
| Documentation | Cierre y release | Early-Game, Mid-Game | L3 Continuous Detection | TMLC 3rd, TMLC 4th, TALC 1st | `test-documentation` | 2 | recommended (second agent) | QA Analyst, QA Lead, Executor, Verifier | `agentic-qa-core/references/stage-gates.md` §"Documentation" |
| Automation | Cierre y release | Mid-Game | L3 Continuous Detection | TALC 2nd, 3rd, 4th | `test-automation` | 2 -> 3, ceiling inside the approved plan | required (`pr-review-lead`, `judgment-day`) | QA Automation Engineer, QA Lead, Executor, Verifier | `agentic-qa-core/references/stage-gates.md` §"Automation" |
| Regression | Cierre y release | Late-Game | L3 Continuous Detection | none | `regression-testing` | 3 (repo: 3, with 4 allowed on a clean GO; see `agentic-qa-core/references/stage-gates.md` §"Autonomy scale") | not needed | QA Automation Engineer, QA Lead, Executor, Guardian | `agentic-qa-core/references/stage-gates.md` §"Regression" |
| Observation | Producción | Late-Game | L4 Production Observation | PLC (declared empty) | none: the operating unit is an agentic routine | 3 | not applicable yet | QA Lead, Guardian | `agentic-qa-core/references/stage-gates.md` §"Observation" |

Two things the web carries per stage that the repo contract table does not name: the role vocabulary above (QA Analyst, QA Lead, QA Automation Engineer, Executor, Verifier, Guardian) and a seven-word guardrail vocabulary (Lectura, Escritura, Aprobación, Secretos, Validación, Trazabilidad, Checkpoints: read, write, approval, secrets, validation, traceability, checkpoints) with a per-stage subset on each card. Both are indexed here by web citation only (`#stages`, and `#principios` "Los guardrails del agente").

Sprint close is not a stage on either side: the web shows it as the STR event card, the repo as a batch-close DoD owned by whichever of `sprint-testing` or `regression-testing` arrives first (`agentic-qa-core/references/stage-gates.md` §"Sprint close").
