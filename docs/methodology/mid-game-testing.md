# Mid-Game Testing

> **IQL Phase 2** · Continuous Testing · Agile Testing · AI-Driven

## Overview

**"Does the software meet requirements?"**

**Detection** phase - Focus on detecting defects before release through structured testing.

The **second phase of the Integrated Quality Lifecycle** where the **QA Automation Engineer** leads technical implementation. Like in gaming: **consolidate early-game advantage** and prepare for late-game.

---

## Mid-Game: Second Phase of IQL

**Mid-Game Testing** is the central phase of the **Integrated Quality Lifecycle** where the testing strategy defined in Early-Game is implemented.

### Position in IQL Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ●══════════════════════════════════════════════════════════▶   │
│                                                                 │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐│
│  │  EARLY-GAME     │──▶│   MID-GAME      │──▶│   LATE-GAME     ││
│  │  Completed      │   │   ✅ CURRENT PHASE│   │   Next        ││
│  │                 │   │                 │   │                 ││
│  │  Steps 1-4      │   │   Steps 5-9     │   │   Steps 10-15   ││
│  │  QA Analyst     │   │   QA Automation │   │   QA + DevOps   ││
│  └─────────────────┘   └─────────────────┘   └─────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Mid-Game Characteristics

| Aspect            | Detail                       |
| ----------------- | ---------------------------- |
| **Steps**         | 5-9 of IQL                   |
| **Approaches**    | Continuous, Agile, AI-Driven |
| **Main Role**     | QA Automation Engineer       |
| **Tools**         | Playwright, Jenkins, CI/CD   |

> _"⚡ Mid-Game: Implementation and Automation"_
>
> Like in MOBAs, **the mid-game is where you consolidate the advantage** obtained in early-game. In IQL, this phase **technically implements the testing strategy** to create a robust continuous defect detection system.

---

## The 5 Steps of Mid-Game Testing

**Mid-Game Testing** is executed through **5 specific steps** corresponding to Steps 5-9 of IQL.

> _"Transition from TMLC (Test Manual Life Cycle) to TALC (Test Automation Life Cycle) with focus on automation and CI/CD."_

### Step 5: Asynchronous Test Case Documentation

**TMLC - Test Manual Life Cycle (4th Stage)**

Create formal 'Test' tickets for each prioritized scripted scenario, without blocking US delivery.

**Key Activities:**

- The status normally starts as 'Draft'
- QA documents test steps, data and expected results in 'Test' tickets
- Each ticket is linked to the Epic Test Repository in Jira for centralized management

**Expected Result:**
A healthy backlog of high-value test cases, ready for manual or automated execution.

**Tools:** Jira, Xray, Confluence

---

### Step 6: Automation Candidate Test Assessment

**TALC - Test Automation Life Cycle (1st Stage)**

Review newly documented test cases to determine if they should be automated.

**Key Activities:**

- The test moves to 'In Review' status
- QA Automation inspects each 'Test' ticket to check feasibility
- If viable, it's marked as 'Candidate'; otherwise, it remains 'Manual'
- The Automation Backlog is updated accordingly

**Expected Result:**
Clear differentiation between manual tests and automation candidates.

**Tools:** Jira, Xray, Claude Code

---

### Step 7: Candidate Test Case Automation

**TALC - Test Automation Life Cycle (2nd Stage) - TAUS Model**

Convert candidate tests into automated scripts for CI using the TAUS model.

**Key Activities:**

- Status transitions: Candidate → In Automation
- A new branch is created, test scripts are implemented
- Changes are pushed following the TAUS pattern

**Expected Result:**
Scripted tests ready for continuous integration.

**Tools:** GitHub, Playwright, Cypress, Docker

---

### Step 8: Automated Test Verification in CI

**TALC - Test Automation Life Cycle (3rd Stage)**

Validate new automated tests in the Continuous Integration pipeline.

**Key Activities:**

- The automated test suite runs in CI (nightly builds or each commit)
- Confirm tests pass stably (without flakiness)
- Any failures or script issues are fixed quickly

**Expected Result:**
Stable automated tests reliably integrated in CI/CD.

**Tools:** GitHub Actions, Docker, Slack

---

### Step 9: Test Code Review (Pull Request)

**TALC - Test Automation Life Cycle (4th Stage)**

Create a detailed Pull Request for review and approval of new automated tests.

**Key Activities:**

- Status Transitions: Merge Request → Automated
- A Pull Request is created detailing the new Repository changes
- The Pull Request is reviewed and approved by another QA/Dev
- Merge is performed once approved

**Expected Result:**
Pull Request MERGED. Stable automated tests reliably integrated in CI/CD.

**Tools:** GitHub, Visual Studio Code, Cursor

---

## Test Automation Pyramid

**Strategic architecture** to organize test automation with **balance between speed, coverage and maintenance**.

```
                    ┌─────────────┐
                    │  E2E UI     │  10%
                    │   Tests     │  Slowest but comprehensive
                    └─────────────┘
               ┌─────────────────────────┐
               │    Integration/Service   │  20%
               │         Tests            │  Medium speed, good coverage
               └─────────────────────────┘
    ┌─────────────────────────────────────────────────┐
    │                 Unit Tests                       │  70%
    │          Extremely fast                          │  Developers test individual
    │                                                  │  functions/components
    └─────────────────────────────────────────────────┘
```

### Pyramid Layers

#### E2E UI Tests (10%)

- **Description:** Automate BDD scenarios, simulate full user journeys
- **Characteristics:** Slowest but comprehensive
- **Examples:** Login flow, Purchase workflow, User registration

#### Integration/Service Tests (20%)

- **Description:** Test interactions between components/microservices
- **Characteristics:** Medium speed, good coverage
- **Examples:** API integration, Database operations, Service communication

#### Unit Tests (70%)

- **Description:** Developers test individual functions/components
- **Characteristics:** Extremely fast
- **Examples:** Function validation, Component isolation, Business logic

### Why the Pyramid Works

| Aspect                       | Benefit                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| **Optimized Speed**          | 70% unit tests execute in seconds, providing immediate feedback                |
| **Smart Coverage**           | Each layer covers different aspects: logic, integration and user experience    |
| **Sustainable Maintenance**  | Fewer E2E tests means less fragility and maintenance effort                    |

---

## The 4 Approaches of Mid-Game Testing

**Mid-Game Testing** integrates four complementary approaches that work in synergy to create a **robust detection system**.

### Continuous Testing

- **Description:** Automated testing integrated in CI/CD pipelines for immediate feedback on every change.
- **Benefit:** Instant Feedback

### Agile Testing

- **Description:** Fast and efficient testing cycles within sprints to accelerate delivery.
- **Benefit:** Optimized Speed

### Exploratory Testing

- **Description:** Leverage human intelligence to find unexpected issues that automation doesn't detect.
- **Benefit:** Smart Coverage

### AI-Driven Testing

- **Description:** Use artificial intelligence to accelerate and improve testing activities.
- **Benefit:** Amplified Power

> _"⚡ Mid-Game: Consolidating the Advantage"_
>
> These **four integrated approaches** allow the QA Automation Engineer to build a **continuous detection system** that consolidates the strategic advantage obtained in Early-Game and prepares the ground for success in Late-Game.

---

## Mid-Game Tools

| Category            | Tools                      |
| ------------------- | -------------------------- |
| **Test Management** | Jira, Xray, Confluence     |
| **Automation**      | Playwright, Cypress        |
| **CI/CD**           | GitHub Actions, Docker     |
| **IDE**             | Visual Studio Code, Cursor |
| **AI Assistance**   | Claude Code                |
| **Communication**   | Slack                      |

---

## Navigation

- [IQL Methodology](./IQL-methodology.md) - Complete view of Integrated Quality Lifecycle
- [Early-Game Testing](./early-game-testing.md) - Phase 1: Prevention and early strategy
- [Late-Game Testing](./late-game-testing.md) - Phase 3: Observation and production
