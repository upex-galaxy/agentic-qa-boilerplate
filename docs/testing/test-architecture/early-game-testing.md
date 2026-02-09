# Early-Game Testing

> **IQL Phase 1** · Shift-Left · BDD · Risk-Based

## Overview

**"Let's build it right from the start"**

**Prevention** phase - Focus on preventing defects through early collaboration and analysis.

The **first phase of the Integrated Quality Lifecycle** where the **QA Analyst** leads the early strategy. Like in gaming: **Mastering the Early-Game** gives you a decisive advantage for the entire match.

---

## Early-Game: First Phase of IQL

**Early-Game Testing** is the foundational phase of the **Integrated Quality Lifecycle** where strategic quality foundations are established for the entire project.

### Position in IQL Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ●══════════════════════════════════════════════════════════▶   │
│                                                                 │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐│
│  │  EARLY-GAME     │──▶│   MID-GAME      │──▶│   LATE-GAME     ││
│  │  ✅ CURRENT PHASE│   │   Next          │   │   Future        ││
│  │                 │   │                 │   │                 ││
│  │  Steps 1-4      │   │   Steps 5-9     │   │   Steps 10-15   ││
│  │  QA Analyst     │   │   QA Automation │   │   QA + DevOps   ││
│  └─────────────────┘   └─────────────────┘   └─────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Early-Game Characteristics

| Aspect            | Detail                      |
| ----------------- | --------------------------- |
| **Steps**         | 1-4 of IQL                  |
| **Approaches**    | Shift-Left, BDD, Risk-Based |
| **Main Role**     | QA Analyst                  |
| **Tools**         | Jira, Confluence, Postman   |

> _"🎮 Early-Game: The Foundation of Strategic Advantage"_
>
> Like in MOBAs, **mastering the early-game gives you an advantage for the entire match**. In IQL, this phase establishes the **strategic quality foundation** that facilitates success in Mid-Game and Late-Game phases.

---

## The 4 Steps of Early-Game Testing

**Early-Game Testing** is executed through **4 specific steps** corresponding to Steps 1-4 of IQL.

> _"Each step has a specific objective within the TMLC (Test Manual Life Cycle) and integrates perfectly with the development workflow."_

### Step 1: Requirements Analysis and Planning

**TMLC - Test Manual Life Cycle (1st Stage)**

Understand requirements and finalize acceptance criteria of the US before starting implementation.

**Key Activities:**

- QA discusses ambiguities with stakeholders
- QA creates a Feature Test Plan (FTP) describing initial scenarios
- The subtask 'QA: AC Review' and 'QA: Feature Test Plan' moves from Open → In Progress → Done

**Expected Result:**
A clear set of acceptance criteria and an FTP to guide specific testing in the US.

**Tools:** Jira, Confluence, Slack, Claude Code

---

### Step 2: Development and Implementation

**Parallel work (Not a direct QA task)**

Build and deploy the US in a staging environment while QA prepares the strategy.

**Key Activities:**

- Developers create a branch and implement the US code
- Code is deployed to the corresponding Environment
- QA can test the US in the same development branch if possible

**Expected Result:**
A functional environment where the QA team can start testing.

**Tools:** GitHub, Docker, TypeScript, Python

---

### Step 3: Early Exploratory Test Execution

**TMLC - Test Manual Life Cycle (2nd Stage) - Early-Gank**

Quickly validate the US using Feature Test Execution (FTX) defined in the FTP.

**Key Activities:**

- The subtask 'QA: Feature Testing' moves from Open → In Progress → Done
- QA performs targeted exploratory testing in critical or high-risk areas
- Findings and defects are reported immediately

**Expected Result:**
The User Story can be deployed to production once QA approves it. The US is closed in Jira.

**Tools:** Browser DevTools, Postman, Jira

---

### Step 4: Risk-Based Prioritization

**TMLC - Test Manual Life Cycle (3rd Stage) - Risk-Based**

Decide which FTP scenarios deserve formal test cases vs remaining as exploratory.

**Key Activities:**

- QA evaluates potential impact and probability of defects for each scenario
- High-value scenarios are selected to become Test Cases
- Decisions are recorded in a Test Repository (Epic in Jira)

**Expected Result:**
Refined list of scenarios ready to become scripted test cases.

**Tools:** Jira, Xray, Confluence

---

## Key Concepts of Early-Game Testing

### Shift-Left Testing

- **Description:** Involve QA from the start to discover defects sooner and reduce rework.
- **Benefit:** Early Prevention = Optimized Economy

### Exploratory Testing

- **Description:** 'Exploratory' Feature Testing provides quick validation before US closure.
- **Benefit:** Agile and Flexible Feedback

### Risk-Based Selection

- **Description:** Dedicate QA resources to highest-impact scenarios for documentation and automation.
- **Benefit:** Time Invested in What Matters

### Async Documentation

- **Description:** Designing test cases after US approval keeps the process agile without blockers.
- **Benefit:** Delivery Without Delays

---

## Integrated Approaches in Early-Game Testing

Our methodology integrates **multiple testing types and strategies** organized into five main categories to create comprehensive and strategic coverage.

### 1. Strategic Macro-Approaches

The three fundamental approaches that guide all work methodology at UPEX:

#### Shift-Left Testing

- **Main approach:** Involve QA team from the earliest stages of the development cycle.
- **Objective:** Detect defects and ambiguities at the start to reduce costs and rework.

#### Risk-Based Testing

- **Smart approach:** Develop and prioritize tests classifying scenarios by impact and criticality.
- **Objective:** Focus efforts on Value-Cost-Risk, avoiding unnecessary documentation overload.

#### Continuous Testing

- **Automation approach:** Integrate automated tests in CI/CD pipeline for immediate feedback.
- **Objective:** Maintain software quality through constant validation and early regression detection.

### 2. Approaches by Design and Execution Method

Define how test cases are designed and executed:

#### Scripted Testing

- **Scripted Tests:** Designed with concrete steps, input data and expected results.
- **Ideal for:** Repetitive scenarios like regression and when traceability is priority.

#### Exploratory Testing

- **Exploratory Tests:** Based on objectives or hypotheses (charters) without rigidly defined steps.
- **Allow:** Investigating software freely and creatively, discovering defects in less explored "corners".

### 3. The "Testing Trident" - Key Technical Competencies

Considered the **minimum essential knowledge** at UPEX. Defines the **fundamental technical competencies** that are learned and applied with Early-Game Testing methodology.

> **Important note:** The Trident is not methodology approaches, but the **technical knowledge areas** that every QA must master.

#### E2E / Frontend Testing (System Testing)

Tests that validate the complete flow from the UI, simulating how a real user would interact with the system.

#### API Testing / Backend (Logic Layer Testing)

Logic-level tests to validate communication and responses between different services.

#### Database Testing (Data Layer Testing)

Focuses on the data layer to ensure information integrity and consistency.

### 4. Non-Functional Testing - Quality Aspects

Tests that evaluate quality aspects beyond functionality:

| Type                      | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| **Performance Testing**   | Measures load and stress the system can support                           |
| **Usability Testing**     | Evaluates how easy and intuitive the system is for the user               |
| **Security Testing**      | Focuses on identifying security vulnerabilities                           |
| **Accessibility Testing** | Ensures the application is usable by people with diverse capabilities     |

### 5. Approaches by Execution Strategy

Applied at specific moments in the lifecycle to meet concrete objectives:

| Approach               | Description                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Smoke Testing**      | Quick check to validate that essential functionalities work. Decides if a version is stable for deep testing.                     |
| **Sanity Testing**     | Quick and shallow tests after minor changes to validate that main functionalities are still operating.                            |
| **Regression Testing** | Execute broad set of tests to confirm new modifications didn't affect existing functionalities.                                   |
| **Re-Testing**         | Specifically focuses on retesting functionalities that previously had defects to confirm successful correction.                   |
| **Feature Testing**    | Comprehensive testing of individual features or user stories to validate complete functionality before integration.                |

> _"🎮 Early-Game Testing: Comprehensive Methodology"_
>
> This **strategic combination of approaches** allows QAs trained at UPEX to approach any project with a **decisive early advantage**, applying the right approach at the precise moment to maximize impact and optimize resources.

---

## Why "Early-Game"?

### The Winning Strategy

In competitive video games (MOBA), professional players know that **mastering the "early game"** is crucial to winning the match. The decisions and actions you take in the first minutes determine your advantage for the rest of the game.

| In Competitive Gaming                                                                                                                  | In Strategic QA                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Control resources early, position strategically and take initial advantage to dominate the complete game. **Optimized team economy.** | Apply quality feedback from the beginning to give decisive advantage to the project. **Optimized development economy.** |

---

## Early-Game Testing in Practice

As a QA trained at UPEX, you don't wait for development to finish. **You orchestrate quality from analysis** to create early strategic advantage.

### Strategic Control

You participate in **requirements analysis** and **strategic planning** to identify weak points and create early mitigation plans.

- _Advantage from the Origin_

### Optimized Economy

You perform **early exploratory testing** and **risk analysis** to optimize budget and reduce rework costs.

- _Optimized Resources_

### Solid Foundation

You build a **solid quality foundation** that facilitates automation, scalability and long-term maintenance.

- _Strategic Foundation_

---

## Your Competitive Advantage in the Market

QAs trained in Early-Game Testing are highly valued because they **think strategically** and provide value from day one.

### Key Benefits

| Benefit                              | Description                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Dramatic Cost Reduction**          | Detecting and correcting defects early is up to 100x more economical than doing it in production. You optimize project economy. |
| **Optimized Development Time**       | You avoid rework and delays by identifying problems before they propagate. Total timeline control.                              |
| **Natural Leadership**               | You integrate as technical leader with development and product teams, orchestrating quality from analysis.                      |
| **Measurable Strategic Impact**      | Your work has direct and quantifiable impact on product success. You're part of the core strategy team.                         |
| **Competitive Gaming Mindset**       | You develop strategic thinking, risk analysis and resource optimization that are highly valued.                                 |
| **Unique CV Differentiation**        | You stand out as a QA who understands the business, thinks strategically and masters advanced methodologies.                    |

---

## Work Environment Setup

At UPEX Galaxy you work with the **same professional tools** you'll use in real companies. Your experience will be **100% transferable** to the job market.

### Jira + Xray Integration

**Project Management & Test Management**

- **Jira:** Complete project management, user stories, bugs and progress tracking with agile methodologies.
- **Xray:** Integrated test management for design, execution and reporting of test cases with complete traceability.

_📋 Professional documentation and traceability_

### GitHub + Actions CI/CD

**Version Control & Automation**

- **GitHub:** Version control, collaboration on automation code and project documentation.
- **GitHub Actions:** CI/CD pipelines for automatic test execution and build deployment.

_⚡ Automation and Continuous Testing_

### Complementary Tools

| Tool                   | Use                                                  |
| ---------------------- | ---------------------------------------------------- |
| **Slack**              | Real-time communication with distributed teams       |
| **Postman**            | API testing and service documentation                |
| **Playwright/Cypress** | Web and E2E test automation                          |

**100% professional experience:** The same tools, workflows and methodologies you'll find in top-tier technology companies.

---

## Navigation

- [IQL Methodology](./IQL-methodology.md) - Complete view of Integrated Quality Lifecycle
- [Mid-Game Testing](./mid-game-testing.md) - Phase 2: Detection and implementation
- [Late-Game Testing](./late-game-testing.md) - Phase 3: Observation and production
