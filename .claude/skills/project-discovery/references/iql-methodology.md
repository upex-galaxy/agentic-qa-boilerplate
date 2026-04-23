# IQL Methodology — Background

> Read this only if the user asks "what is IQL?", "why this discovery structure?", or "why these phases?". This file is background reading. It contains no procedures.

---

## What IQL is

**IQL = Integrated Quality Lifecycle.** A modern replacement for the traditional STLC (Software Testing Life Cycle).

Core idea: quality is not a phase that happens after development. Quality is a continuous activity that runs from initial requirements (Early-Game) through release (Mid-Game) into production (Late-Game). The discovery skill produces the artifacts that make Early-Game and Mid-Game feasible on a previously-undocumented project.

Tagline: **"Quality is not a phase, it's a mindset."**

---

## IQL vs Traditional STLC

| Aspect | STLC (Traditional) | IQL (Modern) |
|--------|--------------------|--------------|
| Approach | Testing as a separate phase | Quality integrated throughout |
| When | Only at the end of development | From requirements to production |
| Feedback | Late and expensive | Continuous and early |
| Teams | Silos between Dev and QA | DevOps-native collaboration |
| Production | Ignored once shipped | Monitored and validated |
| Defect detection | End of cycle | Up to 70% faster |
| Automation coverage | 20-30% | 60-80% |

The discovery skill exists because IQL **cannot start** without a shared understanding of what the system does, who uses it, how it is built, and how it ships. STLC could survive on a single test plan written at the end. IQL needs persistent context that every contributor reads.

---

## The 8 Integrated Approaches

IQL stitches together eight complementary approaches; each is most useful at a specific phase.

| Approach | Description | Phase |
|----------|-------------|-------|
| Shift-Left Testing | Move quality activities earlier in the SDLC | Early-Game |
| Shift-Right Testing | Extend quality validation into production | Late-Game |
| Risk-Based Testing | Prioritize tests by impact and probability | Early + Mid |
| Continuous Testing | Automated testing in CI/CD pipelines | Mid-Game |
| Agile Testing | Fast, in-sprint testing | Mid-Game |
| Exploratory Testing | Human intuition for unexpected issues | Mid-Game |
| BDD | Collaborative specification with Given-When-Then | Early-Game |
| AI-Driven Testing | Use AI to improve coverage and efficiency | All phases |

The discovery outputs (PRD, SRS, business-data-map, master-test-plan) are the substrate every approach above relies on. Without them, Shift-Left has nothing to shift; Risk-Based has nothing to score; AI-Driven has nothing to ground its prompts in. (API endpoint shape is sourced separately from `bun run api:sync` outputs and the `/business-api-map` command.)

---

## The 16 Steps of IQL — high-level map

```
==============================================================================
  EARLY-GAME (Steps 1-4)              "Build it right from the beginning"
  PREVENTION - QA Analyst leads
==============================================================================

  Step 1: Requirements Analysis & Planning     (AC review, Feature Test Plan)
  Step 2: Development & Implementation         (Dev codes, QA preps env/data)
  Step 3: Early Exploratory Testing            (FTP-guided exploration)
  Step 4: Defect Reporting                     (clear repro, sign-off US)

==============================================================================
  MID-GAME (Steps 5-10)               "Does the software meet the requirements?"
  DETECTION - QA Automation leads
==============================================================================

  Step 5: Async Test Case Documentation        (formal TC tickets)
  Step 6: Automation Candidate Evaluation      (mark Candidate vs Manual)
  Step 7: Test Automation Implementation       (write Playwright/KATA scripts)
  Step 8: CI Verification                      (run in pipeline, fix flakes)
  Step 9: Pull Request Review                  (PR + code review + merge)
  Step 10: Continuous Maintenance              (regression, smoke, prune)

==============================================================================
  LATE-GAME (Steps 11-16)             "How does it behave in the real world?"
  OBSERVATION - QA + DevOps/SRE
==============================================================================

  Step 11: Production Smoke
  Step 12: Canary Release Monitoring
  Step 13: A/B Testing & Experimentation
  Step 14: Real User Monitoring (RUM)
  Step 15: Chaos Engineering
  Step 16: Feedback Loop  ->  cycle restarts at Step 1

==============================================================================
                              CYCLE CONTINUES
==============================================================================
```

Late-Game (Steps 11-16) is owned by DevOps/SRE plus QA. It is **out of scope** for the discovery skill. Discovery sets up Early-Game and Mid-Game artifacts; Late-Game is observed by other tooling (RUM, chaos, telemetry).

---

## How discovery phases map to IQL

The four discovery phases are not arbitrary. Each one produces the inputs a specific IQL step needs to run successfully on a project the team has never tested before.

| Discovery phase | Output | IQL step that consumes it | Why |
|-----------------|--------|---------------------------|-----|
| Phase 1 — Constitution | `business-model.md`, `domain-glossary.md`, `project-config.md` | Step 1 (AC Review) | Cannot review ACs against a system you do not understand. Glossary disambiguates "user" vs "account" vs "tenant". |
| Phase 2 — PRD | `executive-summary.md`, `user-personas.md`, `user-journeys.md` (+ `business-feature-map.md` from `/business-feature-map` command) | Step 1 (Risk-Based scoping) + Step 3 (Exploratory charters) | Personas drive role-based test design. Journeys become charter starting points. |
| Phase 2 — SRS | `architecture.md`, `api-contracts.md`, `functional-specs.md`, `non-functional-specs.md` | Step 5 (TC Documentation) + Step 6 (Automation Candidate Evaluation) | TCs cite FR-N entries; API contracts define request/response oracles for automation. |
| Phase 3 — Infrastructure | `backend.md`, `frontend.md`, `infrastructure.md` | Step 7 (Implementation) + Step 8 (CI Verification) | Cannot script auth without knowing how auth works. Cannot configure CI without knowing run/deploy commands. |
| Phase 4 — Specification | `PBI/README.md`, `templates/*.md` | Step 4 (Defect Reporting) + Step 5 (TC Documentation) | Bug reports and TC tickets must follow the team's tracker conventions. |
| Context Generators | `business-data-map.md`, `master-test-plan.md` | Steps 1, 3, 5, 6, 7 | The two highest-traffic context files this skill owns. Used by every QA and automation session to ground prompts in reality. (API context comes from `bun run api:sync` types + `/business-api-map`, both outside this skill.) |

> KATA adaptation is owned by the `/adapt-framework` command, not this skill. It feeds IQL Step 7 (Implementation) with `tests/components/**` wired to the project's stack, but runs after all discovery outputs exist.

---

## Early-Game (Steps 1-4) — what the discovery enables

**Philosophy: Prevention.** "Build it right from the beginning."

**Primary role:** QA Analyst.
**Approaches active:** Shift-Left, BDD, Risk-Based.

### Step 1 — Requirements Analysis & Planning (TMLC Stage 1)

Input: a User Story with draft Acceptance Criteria.

QA discusses ambiguities with the PO/BA, produces a **Feature Test Plan (FTP)**, and defines test outlines. The FTP holds **hypotheses**, not formal test cases — the feature may still change during development.

Discovery dependency: needs Phase 1 (glossary) and Phase 2 PRD (personas + journeys) to ground the FTP in real terminology.

### Step 2 — Development & Implementation (Parallel work)

Dev codes the feature. QA prepares test data, sets up environments, and reviews the FTP. No QA-specific deliverable.

Discovery dependency: needs Phase 3 (env URLs, run commands) so QA can stand the system up locally.

### Step 3 — Early Exploratory Testing (TMLC Stage 2)

QA runs directed exploratory sessions in critical/high-risk areas using FTP charters. Feedback flows back to development immediately.

Discovery dependency: needs `master-test-plan.md` so QA knows which flows are critical and where the historical pain lives.

### Step 4 — Defect Reporting (TMLC Stage 3)

Bugs are logged with clear reproduction steps, evidence, environment details. QA signs off the User Story once critical bugs are resolved.

Discovery dependency: needs Phase 4 templates so bugs land in the team's tracker with the expected fields and conventions.

### Early-Game key concepts

| Concept | Meaning |
|---------|---------|
| Shift-Left | Involve QA from the start to find defects sooner and reduce rework |
| Exploratory Testing | "Feature Testing" in exploratory mode provides fast validation before US close |
| Async Documentation | Designing TCs **after** sign-off keeps the team agile. Planning is not documenting. |
| FTP = Hypotheses | The Feature Test Plan is assumptions, not formal TCs. Formal TCs come in Mid-Game once behavior is confirmed. |

---

## Mid-Game (Steps 5-10) — what the discovery enables

**Philosophy: Detection.** "Does the software meet the requirements?"

**Primary role:** QA Automation Engineer.
**Approaches active:** Continuous Testing, Agile Testing, AI-Driven Testing.

Mid-Game introduces two parallel life cycles:

- **TMLC (Test Manual Life Cycle)** — Stages 1-3 happened in Early-Game; Stage 4 (TC Documentation) starts here.
- **TALC (Test Automation Life Cycle)** — Stages 1-4 are entirely Mid-Game.

### Step 5 — Async Test Case Documentation (TMLC Stage 4)

Trigger: User Story received sign-off in Early-Game. QA now creates formal Test tickets with steps, data, expected results, linked to a Test Repository.

Status workflow: `Draft -> In Review -> Active -> [Manual | Candidate | Automated]`.

Discovery dependency: needs Phase 2 SRS (functional specs to cite as oracles) and Phase 4 (TC ticket template).

### Step 6 — Automation Candidate Evaluation (TALC Stage 1)

QA reviews each TC against an automation decision matrix (frequency, ROI, stability, risk). Result: TC is marked Candidate or Manual; Candidates land in the Automation Backlog.

Discovery dependency: needs `master-test-plan.md` and ROI rubric (covered by `test-documentation` skill).

### Step 7 — Test Automation Implementation (TALC Stage 2)

Engineer creates a branch, implements scripts following framework patterns (KATA layers in this repo), pushes changes.

Discovery dependency: needs a working KATA adaptation with TestContext, ApiBase, UiBase, TestFixture wired to the project's stack and auth flow. That adaptation is produced by the `/adapt-framework` command (not this skill), which consumes the discovery outputs.

### Step 8 — CI Verification (TALC Stage 3)

Tests run in CI. Engineer confirms stability (no flakes) and fixes failures.

Discovery dependency: needs Phase 3 Infrastructure (`infrastructure.md`) — CI provider, run command, secrets, environments.

### Step 9 — Pull Request Review (TALC Stage 4)

Detailed PR. Code review by another QA or Dev. Merge once approved.

Discovery dependency: project conventions captured in `project-config.md` (branch naming, commit prefixes, review process).

### Step 10 — Continuous Maintenance (TMLC + TALC combined)

Run regression (manual + automated), smoke/sanity in staging, remove obsolete tests.

Discovery dependency: needs `master-test-plan.md` for the regression-suite definition. Owned by `regression-testing` skill at execution time.

---

## Why "continuous QA, not gate"

Three concrete reasons the discovery skill enforces this framing:

1. **Earlier defect detection is cheaper.** A defect found in Early-Game (during AC review or exploratory testing) costs a conversation. The same defect found in Late-Game (production) costs an incident response, a hotfix, a postmortem, and trust capital with users. The discovery artifacts (PRD/SRS/glossary) make Early-Game possible for a project the team is new to — without them, "shift-left" is a slogan with no surface area.

2. **Async TC documentation keeps delivery fast.** STLC blocked merges on a complete test plan. IQL signs off the User Story on exploratory evidence (Step 3-4) and writes formal TCs after the fact (Step 5). The discovery's `master-test-plan.md` gives QA the prioritization it needs to know which TCs to write first when the backlog is long — without it, the async pattern collapses into "we never wrote them."

3. **Automation needs a context anchor.** AI-Driven Testing prompts (test-automation skill) reference `business-data-map.md` (entities + flows) and the OpenAPI types under `api/schemas/` produced by `bun run api:sync` (real request/response shapes) to ground generation. Without those, the AI hallucinates. The discovery skill exists to remove that hallucination surface — at least for the business side — before the rest of the lifecycle starts.

---

## Operational cycles — SDC and TDC

Two complementary cycles run in parallel across IQL phases. They are not new phases — they are *how work moves through Jira*.

- **Story Delivery Cycle (SDC)**: the Story's own lifecycle. PM writes AC → Dev implements → QA validates via exploratory + ATP/ATR artifacts → Story → `Done`. Each Story produces one ATP and one ATR (see `test-documentation/references/tms-architecture.md` for the containers per modality). Owner: PM + Dev + QA Analyst.
- **Test Delivery Cycle (TDC)**: the Test's own lifecycle. QA identifies scenarios during SDC exploration → Analyst documents them in Stage 4 → Engineer automates Candidates in Stage 5 → Regression suite runs them forever. Owner: QA Analyst + QA Engineer.

SDC and TDC overlap every sprint: SDC produces validated behaviour; TDC turns the subset worth protecting into regression. A healthy project measures both — SDC throughput (Stories/sprint, time-to-Done) and TDC coverage (% of Candidates Automated, regression pass-rate). `/project-discovery` seeds both cycles; `/sprint-testing` runs SDC per Story; `/test-documentation` + `/test-automation` run TDC per TC.

---

## Out of scope for this skill

- **Late-Game (Steps 11-16).** Production smoke, canary, RUM, chaos, A/B testing — these are owned by DevOps/SRE tooling and not produced by the discovery phases.
- **Step 5 execution.** Documenting TCs is the `test-documentation` skill's job; discovery only produces the substrate (templates + context).
- **Step 7 execution.** Writing automation is the `test-automation` skill's job; discovery only produces the framework adaptation.
- **Step 10 execution.** Running regression and producing GO/NO-GO is the `regression-testing` skill's job.

If a user asks discovery to do any of the above, point them at the correct skill instead of expanding scope.
