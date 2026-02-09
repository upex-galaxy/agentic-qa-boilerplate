# Test Management System Guide
## Aligned with the Integrated Quality Lifecycle (IQL) Methodology

---

## Executive Summary

This document defines the **architecture, processes, and best practices** for implementing a Test Management System (TMS) following the **Integrated Quality Lifecycle (IQL)** methodology.

IQL replaces the traditional STLC by integrating quality throughout the entire software development lifecycle, from initial requirements to production monitoring.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTEGRATED QUALITY LIFECYCLE (IQL)                        │
│                    "Quality is not a phase, it's a mindset"                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│      │  EARLY-GAME  │────▶│   MID-GAME   │────▶│  LATE-GAME   │            │
│      │  Prevention  │     │  Detection   │     │ Observation  │            │
│      │  Steps 1-4   │     │  Steps 5-10  │     │  Steps 11-16 │            │
│      └──────────────┘     └──────────────┘     └──────────────┘            │
│             │                    │                    │                     │
│             ▼                    ▼                    ▼                     │
│      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│      │  QA Analyst  │     │QA Automation │     │  QA + DevOps │            │
│      │    Leads     │     │   Engineer   │     │     /SRE     │            │
│      └──────────────┘     └──────────────┘     └──────────────┘            │
│                                                                              │
│                         ◀────── FEEDBACK LOOP ──────▶                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: IQL vs Traditional STLC

### Why IQL Replaces STLC

| Aspect              | STLC Traditional               | IQL Modern                      |
| ------------------- | ------------------------------ | ------------------------------- |
| Approach            | Testing as a separate phase    | Quality integrated throughout   |
| When                | Only at the end of development | From requirements to production |
| Feedback            | Late and expensive             | Continuous and early            |
| Teams               | Silos between Dev and QA       | DevOps native collaboration     |
| Production          | Ignored                        | Monitored and validated         |
| Defect Detection    | End of cycle                   | 70% faster                      |
| Automation Coverage | 20-30%                         | 60-80%                          |

### The 8 Integrated Approaches

IQL integrates 8 complementary approaches applied strategically across different phases:

| Approach                | Description                                       | Phase            |
| ----------------------- | ------------------------------------------------- | ---------------- |
| **Shift-Left Testing**  | Move quality activities earlier in SDLC           | Early-Game       |
| **Shift-Right Testing** | Extend quality validation to production           | Late-Game        |
| **Risk-Based Testing**  | Prioritize tests based on impact and probability  | Early + Mid Game |
| **Continuous Testing**  | Automated testing in CI/CD pipelines              | Mid-Game         |
| **Agile Testing**       | Fast, efficient testing within sprints            | Mid-Game         |
| **Exploratory Testing** | Leverage human intelligence for unexpected issues | Mid-Game         |
| **BDD**                 | Collaborative specification with Given-When-Then  | Early-Game       |
| **AI-Driven Testing**   | Use AI to improve efficiency and coverage         | All Phases       |

---

## Part 2: The 16 Steps of IQL

### Complete Timeline

```
══════════════════════════════════════════════════════════════════════════════
  EARLY-GAME (Steps 1-4)              "Let's build it right from the beginning"
  PREVENTION - QA Analyst Leads       TMLC Stages 1-3
══════════════════════════════════════════════════════════════════════════════

  Step 1: Requirements Analysis & Planning     [TMLC 1st Stage]
          • AC Review with PO/BA
          • Create Feature Test Plan (FTP)
          • Define test outlines/hypotheses

  Step 2: Development & Implementation         [Parallel Work]
          • Dev codes the feature
          • QA prepares test data and environment

  Step 3: Early Exploratory Testing            [TMLC 2nd Stage]
          • Execute directed exploratory tests
          • Validate US using FTP as guide
          • Provide fast feedback

  Step 4: Defect Reporting                     [TMLC 3rd Stage]
          • Log bugs with clear reproduction steps
          • Include evidence (screenshots, logs)
          • Sign-off US once critical bugs resolved

══════════════════════════════════════════════════════════════════════════════
  MID-GAME (Steps 5-10)               "Does the software meet the requirements?"
  DETECTION - QA Automation Leads     TMLC Stage 4 + TALC Stages 1-4
══════════════════════════════════════════════════════════════════════════════

  Step 5: Async Test Case Documentation        [TMLC 4th Stage]
          • Create formal Test tickets
          • Document steps, data, expected results
          • Link to Test Repository

  Step 6: Automation Candidate Evaluation      [TALC 1st Stage]
          • Review TCs for automation viability
          • Mark as Candidate or Manual
          • Update Automation Backlog

  Step 7: Test Automation Implementation       [TALC 2nd Stage]
          • Create branch, implement scripts
          • Follow framework patterns (TAUS model)
          • Push changes

  Step 8: CI Verification                      [TALC 3rd Stage]
          • Execute in CI pipeline
          • Confirm stable (no flakiness)
          • Fix script failures quickly

  Step 9: Pull Request Review                  [TALC 4th Stage]
          • Create detailed PR
          • Code review by another QA/Dev
          • Merge once approved

  Step 10: Continuous Maintenance              [TMLC + TALC Combined]
           • Run regression (manual + automated)
           • Smoke/sanity in staging
           • Remove obsolete tests

══════════════════════════════════════════════════════════════════════════════
  LATE-GAME (Steps 11-16)             "How does it behave in the real world?"
  OBSERVATION - QA + DevOps/SRE       Shift-Right Testing
══════════════════════════════════════════════════════════════════════════════

  Step 11: Production Deployment & Smoke       [Shift-Right]
           • Smoke/sanity tests in production
           • Validate critical functionalities
           • Monitor system health

  Step 12: Canary Release Monitoring           [Gradual Rollout]
           • Deploy to small % of users
           • Monitor key metrics
           • Decide rollback or expand

  Step 13: A/B Testing & Experimentation       [Optimization]
           • Test feature variations
           • Collect user behavior data
           • Make data-driven decisions

  Step 14: Real User Monitoring (RUM)          [Observability]
           • Monitor Core Web Vitals
           • Track performance by region/device
           • Alert on degradation

  Step 15: Chaos Engineering                   [Resilience]
           • Introduce controlled failures
           • Validate system recovery
           • Document weaknesses

  Step 16: Feedback Loop                       [Continuous Learning]
           • Collect production feedback
           • Analyze error patterns
           • Feed insights to next Early-Game

══════════════════════════════════════════════════════════════════════════════
                              ↻ CYCLE CONTINUES
══════════════════════════════════════════════════════════════════════════════
```

---

## Part 3: Early-Game Testing (Steps 1-4)

### Philosophy: Prevention

> "Let's build it right from the beginning"

**Primary Role:** QA Analyst
**Focus:** Prevention through early collaboration and analysis
**Approaches:** Shift-Left, BDD, Risk-Based Testing

### Step 1: Requirements Analysis & Planning

**TMLC Stage 1** - Understanding requirements and finalizing acceptance criteria

**Input:** User Story with draft Acceptance Criteria

**Activities:**
- Discuss ambiguities with PO/BA
- Create Feature Test Plan (FTP)
- Define test outlines/hypotheses

**Output:** Clear ACs validated + Feature Test Plan

**Subtasks Workflow:**
```
'QA: AC Review'         →  Open → In Progress → Done
'QA: Feature Test Plan' →  Open → In Progress → Done
```

**⚠️ IMPORTANT: FTP = Hypotheses, NOT Formal Documentation**

The scenarios in the Feature Test Plan are ASSUMPTIONS based on the Acceptance Criteria. During development, the feature may change due to:
- QA feedback during exploratory testing
- Bugs that alter expected behavior
- Changes in acceptance criteria
- UX/UI adjustments during implementation

The FTP GUIDES exploration but does NOT automatically become formal Test Cases. Formal TCs are designed in Mid-Game after confirming actual behavior.

### Step 2: Development & Implementation

**Parallel Work** - Not a direct QA task

While Dev implements the feature:
- Dev: Creates branch, implements code, unit tests, deploys to staging
- QA: Prepares test data, sets up environment, reviews FTP

**Result:** Feature ready for testing

### Step 3: Early Exploratory Testing

**TMLC Stage 2** - Fast validation using the Feature Test Plan

**Purpose:** Validate the User Story quickly before production deployment

**Activities:**
- Execute directed exploratory tests in critical/high-risk areas
- Use charters or hypotheses from FTP to guide exploration
- Report findings and defects immediately
- Provide fast feedback to development

**Subtask Workflow:**
```
'QA: Feature Testing' →  Open → In Progress → Done
```

**Result:** User Story can be deployed to production once QA approves

### Step 4: Defect Reporting

**TMLC Stage 3** - Document findings with clear, reproducible information

**Defect Report Template:**
```
ID: BUG-XXX                        Severity: Critical/High/Medium/Low
Title: [Clear, descriptive title]  Priority: P1/P2/P3/P4

ENVIRONMENT:
• Browser/Device: ___________
• OS: ___________
• Build/Version: ___________
• Environment: ___________

STEPS TO REPRODUCE:
1. ___________
2. ___________
3. ___________

EXPECTED RESULT: ___________
ACTUAL RESULT: ___________

ATTACHMENTS: □ Screenshot  □ Video  □ Logs  □ HAR file

LINKED USER STORY: US-XXX
```

**After Critical Bugs Are Resolved:**
- QA provides SIGN-OFF
- User Story approved for production deployment
- Behavior is confirmed and stable

**→ TRANSITION TO MID-GAME:** Now that behavior is confirmed, it's time to document formal Test Cases for regression and automation.

### Early-Game Key Concepts

| Concept                 | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| **Shift-Left Testing**  | Involve QA from the start to discover defects sooner and reduce rework          |
| **Exploratory Testing** | Feature Testing in 'exploratory' mode provides fast validation before US close  |
| **Async Documentation** | Design test cases AFTER US approval keeps process agile. Planning ≠ Documenting |

---

## Part 4: Mid-Game Testing (Steps 5-10)

### Philosophy: Detection

> "Does the software meet the requirements?"

**Primary Role:** QA Automation Engineer
**Focus:** Detection through structured testing
**Approaches:** Continuous Testing, Agile Testing, AI-Driven Testing

### The Two Life Cycles: TMLC and TALC

**TMLC (Test Manual Life Cycle):**
- Stage 1: AC Review + FTP (Early-Game, Step 1)
- Stage 2: Exploratory Testing (Early-Game, Step 3)
- Stage 3: Defect Reporting (Early-Game, Step 4)
- Stage 4: TC Documentation (Mid-Game, Step 5)

**TALC (Test Automation Life Cycle):**
- Stage 1: Evaluate Candidates (Mid-Game, Step 6)
- Stage 2: Automate Implementation (Mid-Game, Step 7)
- Stage 3: CI Verification (Mid-Game, Step 8)
- Stage 4: PR Review + Merge (Mid-Game, Step 9)

### Step 5: Async Test Case Documentation

**TMLC Stage 4** - Create formal Test tickets without blocking delivery

**Trigger:** User Story received sign-off in Early-Game

**Test Case Structure:**
```
ID: TC-XXX                         Status: Draft
Title: [Descriptive test title]    Priority: High/Medium/Low
Type: Functional / E2E / API       Automation: Candidate/Manual

LINKED ITEMS:
• User Story: US-XXX
• Test Suite: TS-XXX
• Epic/Feature: EPIC-XXX

PRECONDITIONS:
• ___________

TEST STEPS (Gherkin Format Recommended):
Given [initial context]
When [action is performed]
Then [expected outcome]

TEST DATA:
• ___________
```

**Status Workflow:**
```
Draft → In Review → Active → [Manual | Candidate | Automated]
```

### Step 6: Automation Candidate Evaluation

**TALC Stage 1** - Determine which test cases should be automated

**Automation Decision Matrix:**

| AUTOMATE     | MAYBE            | DON'T AUTOMATE      |
| ------------ | ---------------- | ------------------- |
| Repetitive   | Medium frequency | One-time            |
| High risk    | Complex setup    | Exploratory         |
| Regression   | Unclear ROI      | UX/Visual           |
| Smoke/Sanity |                  | Changing frequently |
| Data-driven  |                  | Low ROI             |
| API tests    |                  |                     |

**Status Transition:**
```
In Review → Candidate (if viable)
         → Manual (if not viable)
```

### Step 7: Test Automation Implementation

**TALC Stage 2** - Convert candidates into automated scripts

**Test Automation Pyramid:**
```
           /\
          /  \           E2E / UI Tests (10%)
         / E2E\          • Full user journeys
        /  10% \         • BDD scenarios
       /────────\        • Slowest, most comprehensive
      /          \
     / Integration\      Integration / API Tests (20%)
    /     20%      \     • Service interactions
   /────────────────\    • Component integration
  /                  \
 /    Unit Tests      \  Unit Tests (70%)
/        70%           \ • Individual functions
────────────────────────\• Fastest feedback
```

**Implementation Workflow:**
1. Create feature branch
2. Write test script following framework patterns
3. Run locally to verify
4. Push to remote

**Status Transition:**
```
Candidate → In Automation
```

### Step 8: CI Verification

**TALC Stage 3** - Validate automated tests in CI pipeline

**CI/CD Pipeline Flow:**
```
CODE PUSH → BUILD → TEST → REPORT
                      │
           ┌──────────┼──────────┐
           │          │          │
        PASSED     FAILED      FLAKY
           │          │          │
           │          └────┬─────┘
           │               │
           │        INVESTIGATE & FIX
           │               │
           └───────────────┴──────→ STABLE
```

**Key Activities:**
- Execute automated test suite in CI (nightly builds or per commit)
- Confirm tests pass stably (no flakiness)
- Fix any script failures quickly

### Step 9: Pull Request Review

**TALC Stage 4** - Code review and merge

**PR Review Checklist:**
- [ ] Tests follow framework patterns and conventions
- [ ] Proper assertions and error handling
- [ ] No hardcoded values (use config/environment variables)
- [ ] Tests are independent and isolated
- [ ] Clear naming and documentation
- [ ] CI pipeline passes
- [ ] Code coverage maintained or improved

**Status Transition:**
```
In Automation → Merge Request → Automated
```

**Result:** Tests are now part of the main regression suite

### Step 10: Continuous Maintenance

**TMLC + TALC Combined** - Keep the test suite healthy

**Pre-Production Verification:**
- Execute manual regression tests (TMLC)
- Run full automated suite (TALC)
- Smoke/Sanity in staging
- Review and remove obsolete tests
- Fix flaky tests

**→ TRANSITION TO LATE-GAME:** With a stable, verified suite, we're ready to deploy to production and begin the observation phase.

---

## Part 5: Late-Game Testing (Steps 11-16)

### Philosophy: Observation

> "How does it behave in the real world?"

**Primary Roles:** QA + DevOps + SRE
**Focus:** Observation, monitoring, and resilience in production
**Approaches:** Shift-Right, Chaos Engineering, Production Monitoring

### Step 11: Production Deployment & Smoke Testing

**Purpose:** Ensure application stability after production deployment

**Activities:**
- Perform smoke/sanity tests in production environment
- Validate critical functionalities post-deployment
- Log urgent issues for immediate resolution
- Monitor system health metrics in real-time

**Decision Flow:**
```
DEPLOY → SMOKE TEST → MONITOR → VALIDATE
                         │
              ┌──────────┴──────────┐
              │                     │
           PASSED                FAILED → ROLLBACK
```

### Step 12: Canary Release Monitoring

**Purpose:** Deploy to a small percentage of users to monitor behavior

**Rollout Stages:**
```
5% → 10% → 25% → 50% → 100%
 │     │     │     │     │
 └─────┴─────┴─────┴─────┘
      MONITOR AT EACH STAGE
```

**Decision Points:**
- Metrics OK? → Expand rollout
- Metrics BAD? → Rollback immediately

### Step 13: A/B Testing & Experimentation

**Purpose:** Test different feature versions to optimize user experience

**Experiment Structure:**
```
           USER TRAFFIC
                │
       ┌────────┴────────┐
       │                 │
   VARIANT A         VARIANT B
   (Control)         (Treatment)
      50%               50%
       │                 │
       └────────┬────────┘
                │
         ANALYZE RESULTS
         (Statistical Significance)
                │
       ┌────────┴────────┐
       │                 │
    A WINS            B WINS
 Keep current      Deploy new
```

### Step 14: Real User Monitoring (RUM)

**Purpose:** Monitor real user experience in production

**Core Web Vitals:**
| Metric | Target  | Description              |
| ------ | ------- | ------------------------ |
| LCP    | < 2.5s  | Largest Contentful Paint |
| FID    | < 100ms | First Input Delay        |
| CLS    | < 0.1   | Cumulative Layout Shift  |

**Monitoring Dimensions:**
- Geographic location (latency by region)
- Device type (mobile vs desktop)
- Browser type and version
- User journey completion rates
- Error rates by page/feature

### Step 15: Chaos Engineering

**Purpose:** Introduce controlled failures to validate system resilience

**Chaos Experiment Types:**
| Resource Exhaustion | Network Failures | Application Failures |
| ------------------- | ---------------- | -------------------- |
| CPU spike           | Latency          | Service crash        |
| Memory leak         | Packet loss      | Dependency timeout   |
| Disk full           | DNS failure      | Error injection      |
| Process kill        | Partition        |                      |

**Chaos Experiment Workflow:**
1. Define hypothesis ("System should recover within 30s")
2. Plan experiment (what failure, scope, duration)
3. Execute in controlled environment first
4. Execute in production (non-critical hours)
5. Observe system behavior
6. Document findings and weaknesses
7. Improve architecture

### Step 16: Feedback Loop & Continuous Improvement

**Purpose:** Analyze feedback and metrics to feed the next Early-Game cycle

**Collect Data:**
- Customer support feedback
- App store reviews
- Production metrics
- Error patterns and trends
- User behavior analytics

**Analyze & Learn:**
- Identify failure patterns
- Update acceptance criteria
- Influence product roadmap
- Improve test coverage

**→ THE CYCLE CONTINUES:** Insights from production inform the next Early-Game phase, creating a virtuous cycle of continuous improvement.

### Late-Game Key Metrics

| Metric            | Target   | Description                 |
| ----------------- | -------- | --------------------------- |
| MTTD              | < 5 min  | Mean Time To Detect         |
| MTTR              | < 30 min | Mean Time To Resolution     |
| Error Rate        | < 0.1%   | Application Error Rate      |
| CSAT              | > 4.5/5  | Customer Satisfaction Score |
| SLO Compliance    | > 99.9%  | Service Level Objective     |
| Performance Score | > 90/100 | Core Web Vitals Score       |

---

## Part 6: Test Management Artifacts

### Complete Artifact Hierarchy

This structure lives in the project's Management Tool (Jira/Xray, Azure DevOps, TestRail, etc.):

```
QA (Main Dashboard)
│
├── 📄 Test Strategy (single document)
│   └── Defines overall testing approach, tools, environments
│
├── 📄 Master Test Plan (single document)
│   └── Scope, schedule, resources, entry/exit criteria
│
├── 📁 Test Repository (like a Roadmap/Epic container)
│   │
│   ├── 📁 Module A
│   │   ├── 📋 Test Suite: Feature A1
│   │   │   ├── TC-001: Test Case 1
│   │   │   ├── TC-002: Test Case 2
│   │   │   └── TC-003: Test Case 3
│   │   └── 📋 Test Suite: Feature A2
│   │
│   ├── 📁 Module B
│   │
│   └── 📁 Module C
│
├── 📁 Test Runs (by Regression)
│   ├── 📋 Regression [Environment] Sprint X
│   ├── 📋 Regression [Environment] Sprint Y
│   └── 📋 Regression [Environment] Sprint Z
│
├── 📊 RTM (Requirements Traceability Matrix)
│   └── Features linked to Test Suites, Test Cases, and Defects
│
└── 📁 Reports
    ├── 📄 Sprint Test Summary
    ├── 📄 Release Test Report
    └── 📊 Additional Dashboards
```

### Test Runs: Focus on Regression

In the TMS, **Test Runs are primarily used for Regression cycles**, not for Smoke or Sanity executions.

**Why Regression-focused Test Runs:**

| Test Strategy    | Where it happens                           | Tracking in TMS                          |
| ---------------- | ------------------------------------------ | ---------------------------------------- |
| **Smoke Tests**  | Automated in CI/CD, executed frequently    | NO - Too frequent, tracked in CI reports |
| **Sanity Tests** | Automated in CI/CD, post-fix validation    | NO - Too frequent, tracked in CI reports |
| **Regression**   | Scheduled cycles (per sprint, per release) | YES - Manual + Automated, full tracking  |

**The core workflow:**
```
Document Test Case → Add to Regression Suite → Automate (if applicable) → Execute Regression when needed
```

**Regression Test Run naming convention:**
```
Regression [Environment] [Sprint/Release]

Examples:
• Regression Staging Sprint 15
• Regression DevStage Sprint 15
• Regression Production Release 2.0
```

### Two Reporting Systems

The TMS works alongside the Automation Framework's reporting, each serving different purposes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DUAL REPORTING ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │   AUTOMATION FRAMEWORK REPORTS  │  │      TMS REPORTS (REGRESSION)   │  │
│  │   (Allure / CI-Generated)       │  │      (Manual + Automated)       │  │
│  ├─────────────────────────────────┤  ├─────────────────────────────────┤  │
│  │                                 │  │                                 │  │
│  │  WHERE: Private website         │  │  WHERE: Management Tool         │  │
│  │         (Google Auth access)    │  │         (Jira, Xray, etc.)     │  │
│  │                                 │  │                                 │  │
│  │  WHAT:                          │  │  WHAT:                          │  │
│  │  • Smoke executions             │  │  • Regression cycles only       │  │
│  │  • Sanity executions            │  │  • Manual + Automated tests    │  │
│  │  • Regression (automated only)  │  │  • Linked to requirements      │  │
│  │  • By environment               │  │  • Defect tracking             │  │
│  │  • Historical trends            │  │  • Coverage metrics            │  │
│  │                                 │  │                                 │  │
│  │  AUDIENCE:                      │  │  AUDIENCE:                      │  │
│  │  • Dev team (quick feedback)    │  │  • QA team (full picture)      │  │
│  │  • DevOps (pipeline health)     │  │  • PMs/Stakeholders (status)   │  │
│  │  • QA (automation health)       │  │  • Management (go/no-go)       │  │
│  │                                 │  │                                 │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  CI/CD Pipeline                          TMS Regression Cycle               │
│  ─────────────                           ────────────────────               │
│  • Runs on every commit/PR               • Runs per sprint or release       │
│  • Automated tests only                  • Manual + Automated tests         │
│  • Fast feedback (minutes)               • Comprehensive (hours/days)       │
│  • Reports to Allure website             • Reports in management tool       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** The automation framework generates detailed technical reports for day-to-day execution (Smoke, Sanity), while the TMS tracks formal Regression cycles that include both automated and manual tests with full traceability.

### Key Concept: Test Case vs Test Run vs Test Result

| Concept         | Description                                                                                                     | Example                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Test Case**   | Static template defining WHAT to test. Reused across executions. Has own lifecycle (Draft → Active → Automated) | TC-001 "Verify user login with valid credentials" |
| **Test Run**    | Regression cycle grouping TCs for execution. Has context: sprint, release, environment                          | "Regression Staging Sprint 15"                    |
| **Test Result** | Outcome of executing a TC in a specific Run. Status: Passed/Failed/Blocked/Skipped. Can link to defect          | TC-001 PASSED in "Regression Staging Sprint 15"   |

**Practical Example:**
```
TC-001 (Login Test)
     │
     ├──▶ Regression Sprint 5 ──▶ Result: PASSED ✓
     │
     ├──▶ Regression Sprint 6 ──▶ Result: FAILED ✗ ──▶ BUG-042
     │
     └──▶ Regression Sprint 7 ──▶ Result: PASSED ✓ (after bug fix)

The TEST CASE remains the same. Each REGRESSION RUN produces a new RESULT.
```

### Test Case Life Cycle

The complete lifecycle from creation to automation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEST CASE LIFE CYCLE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────┐   start    ┌───────────┐  ready    ┌─────────┐                 │
│  │ DRAFT  │──────────▶│ IN DESIGN │─────────▶│  READY  │                 │
│  └────────┘   design   └───────────┘  to run   └────┬────┘                 │
│       ▲                      │                      │                       │
│       │                      │                      │                       │
│       │ recover              │ back                 ├────── for manual ────┐│
│       │                      ▼                      │                      ││
│  ┌────────────┐         ┌────────┐                  │                      ││
│  │ DEPRECATED │◀── Any ─│  back  │                  │                      ▼│
│  └────────────┘         └────────┘                  │               ┌────────┐
│                                                     │               │ MANUAL │
│                                                     │               └───┬────┘
│                          automation                 │                   │
│                            review                   │      manual       │
│                              │                      │     execution     │
│                              ▼                      │         │         │
│                        ┌───────────┐                │         │         │
│           ┌───────────│ IN REVIEW │◀───────────────┘         │         │
│           │            └─────┬─────┘                          │         │
│           │                  │                                │         │
│           │ back        approve to                            │         │
│           │              automate                             │         │
│           │                  │                                │         │
│           ▼                  ▼                                │         │
│      ┌────────┐        ┌───────────┐     manual               │         │
│      │  back  │◀───────│ CANDIDATE │────execution─────────────┘         │
│      └────────┘        └─────┬─────┘                                    │
│                              │                                          │
│                         start                                           │
│                        automation                                       │
│                              │                                          │
│                              ▼                                          │
│      ┌────────┐      ┌──────────────┐                                   │
│      │  back  │◀─────│IN AUTOMATION │                                   │
│      └────────┘      └──────┬───────┘                                   │
│                             │                                           │
│                        create PR                                        │
│                             │                          automated        │
│                             ▼                              │            │
│      ┌────────┐      ┌──────────────┐                      │            │
│      │  back  │◀─────│ PULL REQUEST │                      │            │
│      └────────┘      └──────┬───────┘                      │            │
│                             │                              │            │
│           ┌─────────────────┤                              │            │
│           │                 │ merged                       │            │
│           │ Fix             │                              │            │
│           │                 ▼                              │            │
│           │           ┌───────────┐                        │            │
│           └──────────▶│ AUTOMATED │◀───────────────────────┘            │
│                       └───────────┘                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Status Definitions:**

| Status            | Description                                       | Who         |
| ----------------- | ------------------------------------------------- | ----------- |
| **DRAFT**         | Test case created, initial outline                | QA Analyst  |
| **IN DESIGN**     | Writing detailed steps, data, expected results    | QA Analyst  |
| **READY**         | Documented and ready for execution or review      | QA Analyst  |
| **MANUAL**        | Designated for manual execution only              | QA Analyst  |
| **IN REVIEW**     | Being evaluated for automation viability          | QA Engineer |
| **CANDIDATE**     | Approved for automation, in backlog               | QA Engineer |
| **IN AUTOMATION** | Script being developed                            | QA Engineer |
| **PULL REQUEST**  | Code submitted, awaiting review                   | QA Engineer |
| **AUTOMATED**     | Script merged, part of regression suite           | QA Engineer |
| **DEPRECATED**    | No longer applicable (accessible from any status) | Any         |

**Key Transitions:**

- **READY → MANUAL**: Test not suitable for automation, will be executed manually
- **READY → IN REVIEW**: Test being evaluated for automation potential
- **CANDIDATE → MANUAL**: After review, decided to keep as manual execution
- **MANUAL → AUTOMATED**: Previously manual test gets automated later
- **PULL REQUEST → IN AUTOMATION (Fix)**: PR rejected, needs fixes
- **Any → DEPRECATED**: Feature removed or test no longer valid
- **DEPRECATED → DRAFT (recover)**: Deprecated test becomes relevant again

### Test Execution Status (Test Result)

```
NOT RUN ──▶ IN PROGRESS ──▶ ┬──▶ PASSED ✓
                            │
                            ├──▶ FAILED ✗ ──▶ DEFECT LOGGED
                            │
                            ├──▶ BLOCKED ⊘
                            │
                            └──▶ SKIPPED ⊖
```

---

## Part 7: Requirements Traceability Matrix (RTM)

The RTM is a dedicated view/table in the TMS that provides visibility into test coverage.

### Full Traceability Flow

```
BUSINESS    USER       FEATURE/      TEST       TEST      DEFECT
NEED        STORY      REQUIREMENT   SUITE      CASE

  │           │            │           │          │          │
  ▼           ▼            ▼           ▼          ▼          ▼
┌─────┐    ┌─────┐      ┌─────┐     ┌─────┐    ┌─────┐    ┌─────┐
│ BN  │───▶│ US  │─────▶│ REQ │────▶│ TS  │───▶│ TC  │───▶│ DEF │
└─────┘    └─────┘      └─────┘     └─────┘    └─────┘    └─────┘

FORWARD TRACEABILITY ──────────────────────────────────────────▶
Question: "Does every requirement have test coverage?"

◀────────────────────────────────────────── BACKWARD TRACEABILITY
Question: "What requirement does this test case verify?"
```

### RTM Table Structure

| Feature/Requirement | Test Suite      | Test Cases             | Automation % | Last Result | Open Defects | Status        |
| ------------------- | --------------- | ---------------------- | ------------ | ----------- | ------------ | ------------- |
| User Authentication | TS-001 Login    | TC-001, TC-002, TC-003 | 100%         | 3/3 Passed  | -            | ✓ OK          |
| Password Reset      | TS-002 Password | TC-004, TC-005, TC-006 | 66%          | 2/3 Passed  | BUG-042      | ⚠ At Risk     |
| 2FA Implementation  | TS-003 2FA      | TC-007, TC-008         | 50%          | 1/2 Blocked | BUG-045      | ✗ Blocked     |
| Session Management  | -               | -                      | -            | -           | -            | ⊘ No Coverage |

**Status Legend:**
- ✓ OK = Requirement fully covered, tests passing
- ⚠ At Risk = Has open defects or partial coverage
- ✗ Blocked = Testing blocked, critical issue
- ⊘ No Coverage = Gap - needs test cases!

---

## Part 8: Metrics and Dashboards

### Metrics by IQL Phase

**Early-Game Metrics (Prevention):**
- Requirements clarity score
- Defects found in AC review (before dev)
- FTP coverage per User Story
- Time from US creation to QA sign-off
- Bugs found during exploratory testing

**Mid-Game Metrics (Detection):**
- Test case execution progress
- Pass/Fail/Blocked rate
- Defect detection percentage
- Automation coverage (%)
- CI pipeline pass rate
- Test flakiness rate
- Time from TC created to Automated

**Late-Game Metrics (Observation):**
- MTTD (Mean Time To Detect) < 5 min
- MTTR (Mean Time To Resolution) < 30 min
- Error rate < 0.1%
- CSAT (Customer Satisfaction) > 4.5/5
- SLO compliance > 99.9%
- Core Web Vitals score > 90/100

### TMS Dashboard Components

The main QA dashboard should display:

**Regression Health:**
- Latest regression pass rate
- Trend over last 5 regressions
- Blocked/Failed tests requiring attention

**Coverage Status:**
- Requirements with test coverage %
- Automation coverage %
- Modules without tests (gaps)

**Defect Summary:**
- Open defects by severity
- Defects by module/feature
- Defect age (days open)

---

## Part 9: Role Collaboration Model

### QA Analyst + QA Automation Engineer Symbiosis

| QA Analyst              | QA Automation Engineer   |
| ----------------------- | ------------------------ |
| The "WHAT" and "WHY"    | The "HOW" and "WHERE"    |
| Requirements analysis   | Framework design         |
| Risk assessment         | Script implementation    |
| BDD/AC writing          | CI/CD integration        |
| Test planning           | Automation maintenance   |
| Exploratory testing     | Performance testing      |
| Test case documentation | Technical debt reduction |
| Automation candidates   | Code review              |
| **Primary: Early-Game** | **Primary: Mid-Game**    |

### The Navigator and Driver Analogy

**🗺️ QA Analyst = NAVIGATOR**
Uses their understanding of the product and user to:
- Draw the map (test plan)
- Highlight the most important destinations (automation candidates)
- Identify risky routes (high-risk areas)
- Plan the journey (test strategy)

**🚗 QA Automation Engineer = DRIVER**
Uses their technical expertise to:
- Build a fast and reliable vehicle (automation framework)
- Navigate skillfully to the defined destinations (implement tests)
- Maintain the vehicle (fix flaky tests)
- Optimize routes (improve CI/CD pipeline)

**TOGETHER:** They reach quality destinations faster and more efficiently than either could alone.

### Async Workflow

1. **Phase 1:** Analyst defines the "WHAT" - Creates acceptance criteria specific for the development team
2. **Phase 2:** Analyst prioritizes the "WHY" - Identifies priority candidates for automation and documents them
3. **Phase 3:** Engineer builds the "HOW" - Implements automation based on the analyst's prioritization

**Result:** Virtuous Quality Cycle where both roles specialize and scale efficiently.

---

## Part 10: Glossary

| Term                   | Definition                                                                |
| ---------------------- | ------------------------------------------------------------------------- |
| **IQL**                | Integrated Quality Lifecycle - methodology that replaces STLC             |
| **TMLC**               | Test Manual Life Cycle - stages 1-4 for manual testing activities         |
| **TALC**               | Test Automation Life Cycle - stages 1-4 for automation activities         |
| **FTP**                | Feature Test Plan - hypotheses/outlines created before testing            |
| **Early-Game**         | Prevention phase (Steps 1-4) - QA Analyst led                             |
| **Mid-Game**           | Detection phase (Steps 5-10) - QA Automation Engineer led                 |
| **Late-Game**          | Observation phase (Steps 11-16) - QA + DevOps/SRE                         |
| **Shift-Left**         | Moving quality activities earlier in the SDLC                             |
| **Shift-Right**        | Extending quality validation to production                                |
| **Risk-Based Testing** | Prioritizing tests based on impact and probability                        |
| **BDD**                | Behavior-Driven Development - Given/When/Then scenarios                   |
| **Test Case**          | Static template defining what to test                                     |
| **Test Run**           | Regression cycle grouping TCs for execution                               |
| **Test Result**        | Outcome of executing a TC in a specific Run                               |
| **RTM**                | Requirements Traceability Matrix - links requirements to tests to defects |
| **Regression**         | Scheduled execution of the test suite to verify no regressions            |
| **MTTD**               | Mean Time To Detect - production monitoring metric                        |
| **MTTR**               | Mean Time To Resolution - incident response metric                        |

---

## Conclusion

The **Integrated Quality Lifecycle (IQL)** is not just a methodology—it's a mindset shift that integrates quality throughout the entire software development lifecycle.

### Key Takeaways

1. **Quality is not a phase, it's a continuous cycle** - From Early-Game prevention to Late-Game observation

2. **The 16 steps provide a complete framework** - Covering everything from requirements analysis to production feedback loops

3. **Two life cycles work in harmony** - TMLC (manual) and TALC (automation) complement each other

4. **Async documentation preserves agility** - Test cases are documented AFTER behavior is confirmed, not before

5. **Regression is the focus of TMS tracking** - Smoke/Sanity run frequently in CI/CD but Regression cycles are formally tracked

6. **Dual reporting architecture** - CI/CD generates technical reports; TMS tracks comprehensive regression with traceability

7. **Roles collaborate, not compete** - Analyst and Engineer form a symbiotic relationship

8. **The feedback loop closes the circle** - Production insights feed back into the next Early-Game cycle

### The IQL Promise

> "Quality integrated from the start, detected before release, and observed in the real world."

This document serves as the foundation for implementing a Test Management System aligned with IQL principles. Adapt the specifics to your tools and context, but maintain the core philosophy: **prevention, detection, and observation** working together in a continuous cycle of quality improvement.

---

*Document Version: 2.0*
*Methodology: Integrated Quality Lifecycle (IQL)*
*Reference: upexgalaxy.com/metodologia*
