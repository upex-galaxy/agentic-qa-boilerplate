# The eight approaches the IQL integrates

**What this file is.** The eight testing approaches the official UPEX website says the IQL integrates, each with the phase the web assigns it and the concrete IQL step or artifact that makes it operational rather than an intention. Where the repo already enforces the approach through executable doctrine, the row points at that file; this file never restates the doctrine.

**Source.** The eight tabs under `https://www.upexgalaxy.com/metodologia#fases` ("Los 8 enfoques que el IQL integra"), captured in the 2026-09-24 re-crawl (the 2026-09-23 capture only had the AI-Driven tab open). Phase assignments come from the badges on each tab. Spanish text translated to English; proper nouns (Early-Game, Mid-Game, Late-Game, Trifuerza, TMLC, TALC, KATA) and artifact acronyms kept as-is.

**Conflict rule.** The repo's executable doctrine wins on conflict. Where the web reads differently, the row writes the web reading and adds "(repo: see ...)" without resolving it.

## Summary

| Approach | One-line definition (web, translated) | Phase(s) the web assigns | Operational step or artifact | Repo doctrine that enforces it |
|---|---|---|---|---|
| Shift-Left Testing | Move quality activities earlier in the development cycle | Early-Game | Step 1; the `[QA] Shift-Left Review` subtask and the pre-sprint ATP | `.agents/skills/shift-left-testing/SKILL.md` |
| Shift-Right Testing | Extend quality validation into production, where the system meets real users | Late-Game | Step 11, Canary Release Monitoring | none (Observation has no skill) |
| Risk-Based Testing | Prioritize tests by impact and probability of failure instead of covering everything equally | Early-Game, Mid-Game | Step 4; one ROI verdict per ATP scenario | `agentic-qa-core/references/test-design-doctrine.md` |
| Continuous Testing | Automated testing integrated into CI/CD pipelines for immediate feedback on every change | Mid-Game | Step 8; the suite green in CI without flakiness | `.agents/skills/test-automation/SKILL.md` |
| Agile Testing | Short testing cycles inside the sprint, not after it | Mid-Game | Step 5; asynchronous documentation after execute and report | `agentic-qa-core/references/stage-gates.md` §"Documentation" |
| Exploratory Testing | Human intelligence looking for what no written case anticipated | Mid-Game | Charters: time-boxed missions against a risk area | The Trifuerza in `.agents/skills/sprint-testing/SKILL.md` |
| BDD | Collaborative specification with Given-When-Then scenarios, written with the team and not for the team | Early-Game | The AC rewritten as Gherkin with real data | `.agents/skills/shift-left-testing/SKILL.md` |
| AI-Driven Testing | Agents that analyze, generate and maintain the quality work | Early-Game, Mid-Game, Late-Game | The agentic contract per stage; the QA signs the final classification | `agentic-qa-core/references/stage-gates.md` §"The agentic contract per stage" |

## One card per approach

Each card carries the web's fuller wording (translated), the phase badges as printed on the tab, and every repo file that gates the approach.

### Shift-Left Testing

| Field | Value |
|---|---|
| Web wording | Involve QA from the start to discover defects sooner and reduce rework, before there is code to break. In the IQL it does not stay an intention: the story carries the `[QA] Shift-Left Review` subtask, opened when refinement starts and closed when it is delivered, and QA writes the story's Acceptance Test Plan |
| Tab badge | EARLY-GAME, Prevención, steps 1-4, QA Analyst |
| Operational in | Step 1 (Requirements Analysis), Shift-Left stage, before the sprint |
| Repo doctrine | `.agents/skills/shift-left-testing/SKILL.md`; `agentic-qa-core/references/stage-gates.md` §"Shift-Left"; the pre-sprint ATP lives only in the Story field, no item: `agentic-qa-core/references/artifact-lifecycle.md` §1 (ATP row) |

### Shift-Right Testing

| Field | Value |
|---|---|
| Web wording | Extend quality validation into production, where the system receives real users. Step 11 makes it concrete: deploy the feature to a small percentage of users and monitor behavior, validating it in production with minimal risk |
| Tab badge | LATE-GAME, Observación, steps 10-15, QA + DevOps |
| Operational in | Step 11 (Canary Release Monitoring), Observation stage |
| Repo doctrine | none: the boilerplate does not cover Shift-Right. Observation is declared with no skill and no DoD (`agentic-qa-core/references/stage-gates.md` §"Observation") |

### Risk-Based Testing

| Field | Value |
|---|---|
| Web wording | Prioritize by impact and probability of failure instead of trying to cover everything equally. In step 4 every ATP scenario leaves with an ROI verdict, and most end in Deferred: a case is documented because it will be executed again, never to reach a coverage number |
| Tab badge | EARLY-GAME (steps 1-4, QA Analyst) and MID-GAME (steps 5-9, QA Automation Engineer) |
| Operational in | Step 4 (Risk-Based Prioritization), Documentation stage, Prioritize (ROI) phase; the three verdicts Candidate / Manual / Deferred |
| Repo doctrine | `agentic-qa-core/references/test-design-doctrine.md` (risk beyond the criterion, technique triggers); the ROI gate and the >50% Candidate/Manual alarm in `agentic-qa-core/references/stage-gates.md` §"Documentation" and `.agents/skills/test-documentation/SKILL.md`; verdict is not status: `agentic-qa-core/references/artifact-lifecycle.md` §1.1 |

### Continuous Testing

| Field | Value |
|---|---|
| Web wording | Automated testing integrated into CI/CD pipelines for immediate feedback on every change. Step 8 is where it is verified: the set runs in CI, on nightly builds or on every commit, and is not considered integrated until it passes stably, without flakiness |
| Tab badge | MID-GAME, Detección, steps 5-9, QA Automation Engineer |
| Operational in | Step 8 (Suite Verification in CI), Automation stage, Review + CI; the regression run in step 10 keeps it continuous |
| Repo doctrine | `.agents/skills/test-automation/SKILL.md` (the three verifiers before the PR); `agentic-qa-core/references/stage-gates.md` §"Automation" and §"Regression"; failure classification and the FLAKY history rule in `.agents/skills/regression-testing/SKILL.md` |

### Agile Testing

| Field | Value |
|---|---|
| Web wording | Test cycles that fit inside the sprint and do not push it forward. That is why documentation is asynchronous: in the default modality the cases are documented after they are executed and reported, not before, and the story is delivered without blocking |
| Tab badge | MID-GAME, Detección, steps 5-9, QA Automation Engineer |
| Operational in | Step 5 (Asynchronous Test Case Documentation), Documentation stage, Document phase; the execute-first, document-later order |
| Repo doctrine | `agentic-qa-core/references/stage-gates.md` §"Documentation"; modality resolution and the verb per modality (create in `jira-native`, promote and enrich in `jira-xray`) in `.agents/skills/test-documentation/SKILL.md`; the TC lifecycle per modality in `agentic-qa-core/references/artifact-lifecycle.md` §1 |

### Exploratory Testing

| Field | Value |
|---|---|
| Web wording | Use human intelligence to find unexpected issues that automation does not detect. It is not random clicking: professional exploration is organized in charters, time-boxed missions against a specific risk area. Inside that frame creativity is free; the frame is what turns it into work |
| Tab badge | MID-GAME, Detección, steps 5-9, QA Automation Engineer |
| Operational in | The tab names charters, not a step. The exploration itself is step 3 (Early Exploratory Testing): smoke first as Go/No-Go, then the Trifuerza (UI, API, DB) beyond the plan, feeding new partitions back into the set |
| Repo doctrine | The Trifuerza after the smoke in `.agents/skills/sprint-testing/SKILL.md`; `agentic-qa-core/references/stage-gates.md` §"Execution"; evidence capture rules in `agentic-qa-core/references/evidence-conventions.md`; classify before filing in `agentic-qa-core/references/defect-management-doctrine.md` |

### BDD

| Field | Value |
|---|---|
| Web wording | Collaborative specification in Given-When-Then scenarios, written with the team and not for the team. "Given" fixes the initial state, "When" the exact action with concrete values, "Then" the observable result. An acceptance criterion that cannot be written in Gherkin with real data is not ready yet |
| Tab badge | EARLY-GAME, Prevención, steps 1-4, QA Analyst |
| Operational in | Step 1: every AC rewritten as Given/When/Then with concrete data during Shift-Left; the readiness test is whether the Gherkin can be written with real values |
| Repo doctrine | The Given/When/Then rewrite in `.agents/skills/shift-left-testing/SKILL.md`; the criterion-vs-test-case distinction and the 1:N explode-by-default rule in `agentic-qa-core/references/test-design-doctrine.md` |

### AI-Driven Testing

| Field | Value |
|---|---|
| Web wording | Use artificial intelligence to accelerate and improve testing activities. The only one of the eight the IQL applies in all three phases. A good amplifier of the arsenal, but executing, observing and judging whether something is a defect stays fully yours: the final classification is signed by the QA |
| Tab badge | EARLY-GAME, MID-GAME and LATE-GAME (all three) |
| Operational in | Every stage's agentic contract: what the agent does, what the person signs, the evidence required, the autonomy level and whether a separate verifier is needed |
| Repo doctrine | `agentic-qa-core/references/stage-gates.md` §"The agentic contract per stage" and §"Contract table"; human decision points in `agentic-qa-core/references/decision-elicitation-doctrine.md`; the QA-signed classification in `agentic-qa-core/references/defect-management-doctrine.md` |

## How the phase pages list approaches

Each phase page (`https://www.upexgalaxy.com/metodologia/early-game`, `/mid-game`, `/late-game`, header block "dónde estás dentro del IQL") prints an "Enfoques" line per phase. Those lines overlap the eight tabs but are not the same list:

| Phase | Approaches the phase page lists | Of the eight tabs, badged for this phase | Names on the phase page that are not one of the eight tabs |
|---|---|---|---|
| Early-Game | Shift-Left, BDD, Risk-Based | Shift-Left, BDD, Risk-Based, AI-Driven | none (AI-Driven is badged on the tab, absent from the phase line) |
| Mid-Game | Continuous Testing, Agile Testing, AI-Driven | Continuous, Agile, Exploratory, Risk-Based, AI-Driven | none (Exploratory and Risk-Based are badged on the tabs, absent from the phase line) |
| Late-Game | Shift-Right, Chaos Engineering, Production Monitoring, AI Ops | Shift-Right, AI-Driven | Chaos Engineering, Production Monitoring, AI Ops (the web treats them as Late-Game practices inside steps 13-14, not as approaches of the eight) |

## Where the web's assignment sits oddly against its own steps

Listed, not resolved. Each line is a web-internal reading; the repo side is cited where it exists.

| Approach | The tab says | Elsewhere the web says | Repo side |
|---|---|---|---|
| Exploratory Testing | Phase badge Mid-Game (steps 5-9, QA Automation Engineer) | The exploration itself is step 3, inside Execution, phase Early-Game, run by the QA Analyst after the smoke (`#stages` Execution card; `early-game` page step 3) | Execution is owned by `sprint-testing`, in-sprint, L2 (`agentic-qa-core/references/stage-gates.md` §"Execution") |
| Risk-Based Testing | Phase badges Early-Game and Mid-Game | The operational step (4) is badged Early-Game on its own card, while the stage that hosts it (Documentation) is badged both Early-Game and Mid-Game | Documentation is post-sprint at L3 (`agentic-qa-core/references/stage-gates.md` §"The stages, by name") |
| Shift-Right Testing | Operational through step 11 | Steps 11-15 are marked "Panorama" on the Late-Game page: taught as an industry overview, not operated against a real production environment | No skill and no DoD for Observation (`agentic-qa-core/references/stage-gates.md` §"Observation") |
| Agile Testing | Asynchronous documentation is the mechanism "in the default modality" | The modality section (`#modalidades`) says the modality changes the verb, never the ROI verdict, so the after-execution order holds in both | `.agents/skills/test-documentation/SKILL.md`; `agentic-qa-core/references/artifact-lifecycle.md` §1 |

## Reading rule for the skill

When a task names one of the eight approaches by word ("do this risk-based", "shift-left these stories", "explore the feature"), resolve it to the operational step or artifact on its card and load the repo doctrine in the last row. The approach name is the reader's vocabulary; the step and the artifact are what the harness executes; the repo file is what gates it. None of the eight is a stage, a skill or a Jira status.
