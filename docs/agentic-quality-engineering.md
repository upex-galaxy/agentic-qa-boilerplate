# Agentic Quality Engineering

> **Purpose**: The single source of truth for what this repository is and how it works — the strategy, the architecture, the skills, the orchestration model, and the engineering discipline that back every automated test.
> **Audience**: Engineers, QA practitioners, and technical leaders evaluating or adopting this boilerplate. Read this before you read anything else.
> **Scope**: Context Engineering, Claude Code skills and commands, MCP integrations, agent orchestration with human-in-the-loop, KATA test automation architecture, and the release quality gate.
> **Why "agentic"?** This practice is not "AI as a chatbot." It relies on auto-triggering skills, subagents dispatched for focused tasks, live tool use through MCPs and CLIs, and checkpointed human supervision. Those are the defining traits of *agentic* systems — hence the name.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why This Boilerplate Exists](#2-why-this-boilerplate-exists)
3. [Strategy: Agentic Shift-Left Testing](#3-strategy-agentic-shift-left-testing)
4. [Glossary: Terms Used Throughout This Document](#4-glossary-terms-used-throughout-this-document)
5. [System Architecture](#5-system-architecture)
6. [Context Engineering: The Knowledge Layer](#6-context-engineering-the-knowledge-layer)
7. [Sources of Truth: Where Context Comes From](#7-sources-of-truth-where-context-comes-from)
8. [Working with Claude Code: Daily Workflow](#8-working-with-claude-code-daily-workflow)
9. [The Orchestration Model: AI Works, Human Decides](#9-the-orchestration-model-ai-works-human-decides)
10. [Stages 1–3 Flow: Session Start → Planning → Execution → Reporting](#10-stages-13-flow-session-start--planning--execution--reporting)
11. [Test Automation Engineering](#11-test-automation-engineering)
12. [The AI Toolkit: Skills, Commands, Integrations](#12-the-ai-toolkit-skills-commands-integrations)
13. [The Quality Gate: GO / CAUTION / NO-GO](#13-the-quality-gate-go--caution--no-go)
14. [Anatomy of a Test Session](#14-anatomy-of-a-test-session)
15. [Metrics: Instrumentation Template](#15-metrics-instrumentation-template)
16. [Summary of What the Practice Delivers](#16-summary-of-what-the-practice-delivers)

---

## 1. Overview

This repository is not a traditional test suite. It is an **agentic quality engineering practice** built on top of Playwright, TypeScript, and Bun, orchestrated through Claude Code skills and commands, and backed by a structured knowledge layer that lets AI agents understand the system under test without the QA engineer having to re-explain it every session.

The skills are written in the open SKILL format and are compatible with Claude Code, Copilot, Cursor, Codex, and OpenCode runtimes — Claude Code is the reference implementation used throughout this document.

The practice is organised around a **6-stage pipeline** that takes a ticket from acceptance criteria review all the way to a data-driven release decision:

```
SESSION START  →  STAGE 1   →  STAGE 2   →  STAGE 3   →  STAGE 4    →  STAGE 5   →  STAGE 6
  (Context)      (Planning)   (Execution)  (Reporting)  (Documentation) (Automation) (Regression)
```

| Stage | Owning skill | Output |
| ----- | ------------ | ------ |
| **Onboarding** (one-time) | `project-discovery` (discovery) + `/adapt-framework` (KATA adaptation) | `CLAUDE.md`, `.context/` artifacts, and KATA wired to the target stack |
| **1 — Planning** | `sprint-testing` | ATP + TCs linked to ACs |
| **2 — Execution** | `sprint-testing` | Smoke + trifuerza (UI/API/DB) exploration, evidence captured |
| **3 — Reporting** | `sprint-testing` | ATR, bug tickets, QA comment on the source ticket |
| **4 — Documentation** | `test-documentation` | TMS artefacts with ROI verdict (Candidate / Manual / Deferred) |
| **5 — Automation** | `test-automation` | KATA Playwright tests, `@atc` decorated and traceable |
| **6 — Regression** | `regression-testing` | CI pass-rate, failure classification, GO / CAUTION / NO-GO verdict |

Every stage is powered by an AI skill, every skill operates with a human-in-the-loop checkpoint, and every artefact produced is traceable from the original user story to the CI regression run that validates the release.

This document walks through the full system — the problem it solves, the strategy behind it, the architecture that supports it, and the engineering rigor applied to each layer.

---

## 2. Why This Boilerplate Exists

Most early-stage products start in the same place:

- **Zero automated tests.** Every verification is manual and not repeatable.
- **No Test Management System.** No central record of test plans, test cases, or test results.
- **No traceability.** Bugs are found, but there is no link from requirement to test to release.
- **No test strategy.** No documented answer to "what should we be testing, and why?"

That works until it doesn't. The moment the product handles **real money**, **regulated data**, or **multi-tenant isolation**, the cost of a silent regression explodes. A missed acceptance criterion becomes a customer refund, an incident response, or a compliance finding.

The goal of this boilerplate is therefore not to "add some tests" to a project, but to install — end-to-end — the **infrastructure, knowledge, and workflows** that make quality engineering possible at all. A company that adopts this repository gets, on day one:

- A 6-stage pipeline owned by AI skills, with human checkpoints between stages.
- A structured context layer (`.context/`) the AI reads before it acts.
- A KATA test architecture ready to receive the first tests.
- A TMS integration (Jira/Xray by default, swappable) with programmatic traceability.
- A CI-driven quality gate that emits GO / CAUTION / NO-GO verdicts, not gut feelings.

The rest of this document describes how that boilerplate is built and how it operates in practice.

---

## 3. Strategy: Agentic Shift-Left Testing

The guiding strategy is **Shift-Left Testing**: the earlier in the software development lifecycle a bug is found, the cheaper it is to fix. This is not a new idea — it has been well understood for decades. What has changed is the economics.

### The cost-of-defect curve

```
   Cost / Effort to Fix
          ▲
          │                                                    ╱
          │                                                 ╱       ← Without QA gate
          │                                             ╱             (exponential rise)
          │                                         ╱
          │                                     ╱
          │                        inflection
          │                            ●
          │                  ╱──────────────────
          │                ╱                        ← With Agentic Shift-Left
          │              ╱                            (small early effort, then flat)
          │            ╱
          ●──────────────────────────────────────────────────▶  SDLC phase
        Requirements  Design   Dev    Test    Pre-Prod    Production
        [AC Review]   [ATP]   [Smoke] [UI+API+DB]         [Too late]
```

- The **red curve** represents the traditional trajectory: a bug caught in production costs dramatically more than one caught during requirements review. A single missed acceptance criterion that reaches production can mean a data migration, a customer refund, or an incident response.
- The **green curve** represents the Shift-Left trajectory: invest small upfront effort in AC reviews, test plans, and early validation, and the cost curve flattens.

### Why agents make Shift-Left economically viable

Shift-Left has always been known to work. What has historically prevented teams from adopting it is **cost**: an analyst has to read every acceptance criterion, design every test plan, chase every traceability link. Most organisations cannot afford that manual labour.

Agents change the equation:

- **Context loading is automatic.** Skills read the relevant business rules, API docs, and test priorities on session start — no human has to prepare a briefing.
- **Test plan generation is minutes, not hours.** The AI drafts a risk triage, scenarios, and test data requirements from the ticket and its context.
- **Traceability is verified programmatically.** The `fix-traceability` command and the `xray-cli` skill walk the full chain — story → ATP → ATR → TCs — and catch missing links automatically.

The rest of this document describes how that strategy is implemented in code and skills.

---

## 4. Glossary: Terms Used Throughout This Document

| Term                  | Definition                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Token**             | The unit an AI model reads and writes. Tokens have direct cost and occupy context window space.                              |
| **Context Window**    | The memory available within a single conversation. Everything the AI can "see" right now.                                    |
| **MCP**               | Model Context Protocol. A standard that lets AI tools talk to live systems — database, browser, API, TMS.                    |
| **Skill**             | A reusable AI capability, stored under `.claude/skills/<name>/`. Auto-triggers when the user's intent matches its description. |
| **Command**           | A one-shot utility stored under `.claude/commands/<name>.md`. Invoked explicitly with `/<name>`. No auto-triggering.          |
| **Subagent**          | A specialist worker dispatched by a skill for a focused task (planning, execution, reporting, verification).                 |
| **Persistent Memory** | Facts that survive across conversations — user preferences, project rules, team decisions.                                   |
| **ATP**               | Acceptance Test Plan. The risk triage and scenario design produced in Stage 1 (Planning).                                    |
| **ATR**               | Acceptance Test Results. The report filed in Stage 3 (Reporting).                                                            |
| **TC**                | Test Case. A single, traceable verification linked to an acceptance criterion.                                               |
| **ATC**               | Automated Test Case. A TC implemented as code, carrying an `@atc('{{PROJECT_KEY}}-XXX-TC#')` decorator.                      |
| **PBI**               | Product Backlog Item. In this repo, the local folder (`.context/PBI/...`) that stores per-ticket and per-module knowledge.   |
| **KATA**              | Komponent Action Test Architecture. The four-layer pattern used to organise automated tests.                                 |
| **Subagent Dispatch Strategy** | Per-skill table declaring which stages delegate to subagents and with what pattern (Single / Sequential / Parallel / Background). Lives in each workflow `SKILL.md` under `## Subagent Dispatch Strategy`. |

---

## 5. System Architecture

The practice is organised in three conceptual tiers:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      QUALITY ENGINEER (Human)                       │
│         Makes decisions · Reviews AI output · Approves releases     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────┴────────────────────────────────────┐
│                          AI SKILLS LAYER                            │
│                                                                     │
│  Foundation skill                                                   │
│  ┌────────────────┐                                                 │
│  │ framework-core │  Briefing template · Dispatch patterns ·        │
│  └────────────────┘  Orchestration doctrine · Bootstrap CLI         │
│                                                                     │
│  Workflow skills                                                    │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────┐ │
│  │ project-  │ │  sprint-  │ │   test-   │ │   test-   │ │regres. │ │
│  │discovery  │ │  testing  │ │documentat.│ │automation │ │testing │ │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └────────┘ │
│                                                                     │
│  Tool / utility skills                                              │
│  acli · xray-cli · playwright-cli                                   │
│                                                                     │
│  Shared Knowledge Layer                                             │
│  Business flows · API docs · Test priorities · Per-ticket memory    │
└──────────────────────┬──────────────────┬──────────────────┬────────┘
                       │                  │                  │
              ┌────────▼─────┐   ┌───────▼────────┐  ┌──────▼───────┐
              │  [TMS_TOOL]  │   │   [DB_TOOL]    │  │   CI / CD    │
              │  (Jira/Xray) │   │ (DBHub MCP…)   │  │(GitHub Act.) │
              └──────────────┘   └────────────────┘  └──────────────┘
```

### Top tier — the Quality Engineer

The human sits on top. The AI never ships anything on its own. Every stage has a checkpoint where a human reviews, approves, modifies, or rejects the AI's work.

### Middle tier — the AI skills

Six core skills handle the end-to-end pipeline (one foundation + five workflow):

- **`framework-core`** — foundation skill. Hosts the canonical briefing template, dispatch patterns, and orchestration doctrine cited by every workflow skill, and provides the `init` bootstrap that writes `AGENTS.md`, `.agents/project.yaml`, and the `agents-*` scripts when adopting the boilerplate.
- **`project-discovery`** — one-time onboarding. Generates the context files every other skill depends on.
- **`sprint-testing`** — Stages 1–3. Planning, Execution, and Reporting per ticket. The everyday driver.
- **`test-documentation`** — Stage 4. ROI analysis that decides which manual TCs are worth automating.
- **`test-automation`** — Stage 5. Writing the actual KATA + Playwright test code.
- **`regression-testing`** — Stage 6. Running the regression suite and emitting a release verdict.

Tool / utility skills — `acli` (Atlassian CLI for Jira work-item operations), `xray-cli` (Xray Cloud test management), `playwright-cli` (browser automation) — are invoked on demand or composed inside the workflow skills.

All skills share the **Knowledge Layer** (the `.context/` directory): business rules, API architecture, test priorities, and per-ticket memory.

### Bottom tier — the systems the AI operates on

- **`[ISSUE_TRACKER_TOOL]`** — Jira issue management (Stories, Bugs, Epics) accessed via the `acli` skill (Atlassian CLI) by default; swappable via the Tool Resolution table in `CLAUDE.md`.
- **`[TMS_TOOL]`** — the test management system holding ATPs, ATRs, and TCs. Resolves to the `xray-cli` skill in **Modality A** (Xray on Jira) or to the `acli` skill in **Modality B** (Jira-native, no Xray plugin). The modality is decided once per project in `test-documentation/SKILL.md` §Phase 0.
- **`[DB_TOOL]`** — the live database, accessed through an MCP (DBHub by default). Used to find, generate, or verify test data.
- **CI / CD** — the regression suite, typically GitHub Actions, reporting to Allure.

The `[TOOL]` brackets are not decorative. Every skill in this repo writes tool calls in `[TAG_TOOL]` pseudocode, which resolves against the table in `CLAUDE.md` "Tool Resolution". Swap the row, swap the backend — no skill edits required.

---

## 6. Context Engineering: The Knowledge Layer

Context Engineering is the discipline of curating the information the AI reads **before** it acts. An AI that reads the right context does not need to guess, and does not hallucinate. An AI that guesses is dangerous in a production-grade system.

The knowledge layer is organised in three tiers, mirroring the scope at which the information is relevant:

```
┌──────────────────────────────────────────────────────────────┐
│  PROJECT LEVEL                                               │
│  Business rules · API architecture · Test priorities         │
│  Example: business-data-map.md catalogs every entity and     │
│  flow in the system under test.                              │
└──────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  MODULE LEVEL                                                │
│  Routes · DB tables · Shared test data · Module-specific     │
│  conventions.                                                │
│  Example: `PBI/{module}/module-context.md` lists the routes, │
│  tables, and test-data candidates for that module.           │
└──────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  TICKET LEVEL                                                │
│  Acceptance criteria · Team decisions · Evidence ·           │
│  Session memory.                                             │
│  Example: `PBI/{module}/{PROJECT_KEY}-XXX-{title}/spec.md`,  │
│  `implementation-plan.md`, `evidence/*.png`.                 │
└──────────────────────────────────────────────────────────────┘
```

### How it actually looks on disk

```
.context/
├── mapping/                      # Project level — business maps (command-generated)
│   ├── business-data-map.md      #   System flows and entities         (/business-data-map)
│   ├── business-feature-map.md   #   Feature catalog, CRUD, flags      (/business-feature-map)
│   └── business-api-map.md       #   Auth model, critical endpoints    (/business-api-map)
├── master-test-plan.md           # Project level — what to test and why (/master-test-plan)
├── PRD/                          # Project level — product requirements (phase 2 of discovery)
│   └── business/                 #   Business constitution, domain glossary
├── SRS/                          # Project level — software requirements (phase 2 of discovery)
└── PBI/                          # Module + ticket level
    └── {module}/
        ├── module-context.md     # Module overview
        └── test-specs/
            ├── ROADMAP.md        # All tickets + automation status
            ├── PROGRESS.md       # Current progress
            └── {PROJECT_KEY}-XXX-{title}/
                ├── spec.md                # Test specification
                ├── implementation-plan.md # Automation plan
                └── atc/*.md               # Individual ATC designs
```

The canonical shape is documented in `.context/README.md`. The strategic reasoning behind the three-tier split lives in `docs/context-engineering.md` — read that for the full rationale.

### Cross-skill references

A second knowledge surface exists outside `.context/`: the `framework-core/references/*.md` files. They host the briefing template, the dispatch patterns decision guide, and the orchestration doctrine that workflow skills cite instead of duplicating. They are loaded on demand by other skills and form part of the practice's knowledge layer even though they live under `.claude/skills/` rather than `.context/`.

### Project variables vs runtime credentials

Static project values (`{{PROJECT_KEY}}`, `{{WEB_URL}}`, `{{API_URL}}`, `{{JIRA_URL}}`, etc.) live in `.agents/project.yaml` — the AI resolves `{{VAR_NAME}}` references against that file once per session. Runtime test credentials (`STAGING_USER_EMAIL`, `STAGING_USER_PASSWORD`, etc.) remain in `.env` and are read at execution time. The two systems are separate by design: `.agents/project.yaml` is committed to the repo, `.env` is gitignored.

### Why it matters

When the AI opens a ticket a week after the last session, the context is still there — every AC, every team discussion, every piece of evidence. There is no re-briefing cost. This is how "zero context loss" is maintained sprint over sprint.

---

## 7. Sources of Truth: Where Context Comes From

The knowledge layer is static documentation. Before every test, the AI **also** pulls from seven live sources — this is what makes the system feel alive and prevents the AI from reasoning against stale assumptions.

```
                          ┌─────────────────────────┐
                          │      SESSION START      │
                          │   7 sources loaded      │
                          │   automatically         │
                          └──────────┬──────────────┘
                                     │
   ┌──────────┬──────────┬───────────┼───────────┬──────────────┬──────────┐
   ▼          ▼          ▼           ▼           ▼              ▼          ▼
 Frontend   Backend   Knowledge   Database      API          UI runtime   TMS
 codebase   codebase  layer       schema        spec         (browser)    (tickets)
 ({{FRONT   ({{BACK   (.context/) [DB_TOOL]     [API_TOOL]   [AUTOMATION  [TMS_TOOL]
 END_REPO}) END_REPO})                                       _TOOL]
```

Each source feeds the AI a specific kind of truth:

| Source                    | What it provides                                              | Access mechanism                                       |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| **Frontend codebase**     | Routes, state management, API call patterns                   | Direct file reads against `{{FRONTEND_REPO}}`          |
| **Backend codebase**      | Controllers, services, models, DTOs                           | Direct file reads against `{{BACKEND_REPO}}`           |
| **Knowledge layer**       | Curated business rules, API docs, test priorities             | `.context/` files                                      |
| **Database schema**       | Live tables, columns, relationships, real test data           | `[DB_TOOL]` — DBHub MCP by default                     |
| **API spec**              | Every endpoint, request/response shapes, types                | `[API_TOOL]` — OpenAPI MCP by default                  |
| **UI runtime**            | Real screenshots, accessibility tree, navigation state        | `[AUTOMATION_TOOL]` — `playwright-cli` skill           |
| **TMS**                   | Tickets, ACs, team discussion, test artefacts                 | `[TMS_TOOL]` — `xray-cli` skill (Jira/Xray) by default |

The `[TAG_TOOL]` brackets map to concrete implementations via the **Tool Resolution** table in `CLAUDE.md`. Skills never hard-code a tool name — they call `[TMS_TOOL]` and let the table decide whether that means the Xray CLI, the Atlassian MCP, or something else the team plugged in.

**TMS modality**: `[TMS_TOOL]` resolves to the `xray-cli` skill in **Modality A** (Xray on Jira) or to the `acli` skill in **Modality B** (Jira-native, no Xray plugin), per `test-documentation/SKILL.md` §Phase 0. In Modality B, ATPs and ATRs live as Story custom fields with comment mirrors and TCs live as Jira `Test` issues; the workflow skills carry parallel pseudocode branches for both modalities.

Each AI operates on these sources through two complementary interfaces:

- **CLIs** — first-party command-line tools shipped inside this repo (`bun xray`, `bun run api:sync`, etc.). Fast, deterministic, low-token. Preferred when available.
- **MCPs** — Anthropic's Model Context Protocol bridges to external systems (`dbhub`, `openapi`, `atlassian`, `context7`, `tavily`). Used when the CLI does not cover the action, or when the AI needs to explore rather than execute a fixed workflow.

Before any test design starts, the AI has traversed the relevant subset of these seven sources. That is the reason it does not need to guess.

---

## 8. Working with Claude Code: Daily Workflow

The daily workflow is plain English. The QA engineer tells Claude Code what is needed, and the matching skill auto-triggers on description match.

### Example invocations

```text
> Read @.context/reports/SPRINT-10-TESTING.md and process this sprint
  → Auto-triggers: sprint-testing skill in sprint mode

> Test {{PROJECT_KEY}}-450
  → Auto-triggers: sprint-testing skill in single-ticket mode

> Retest bug {{PROJECT_KEY}}-460
  → Auto-triggers: sprint-testing skill in bug mode

> Continue sprint from {{PROJECT_KEY}}-450, mode yolo
  → Auto-triggers: sprint-testing skill, resume + batch (no stops)

> Run regression suite
  → Auto-triggers: regression-testing skill

> Write E2E test for {{module}}
  → Auto-triggers: test-automation skill
```

Auto-triggering is governed by each skill's `description` field, which lists the phrases the skill should respond to. The decision tree in `CLAUDE.md` documents the full mapping. Explicit invocation is also supported — `/sprint-testing`, `/test-automation`, and so on — for cases where determinism is preferred over pattern matching.

### What happens on invocation

The skill loads its references, opens the PBI folder for the target ticket (or creates it), pulls context from the seven sources listed above, and dispatches the first subagent of the stage. Everything that happens next is visible in the transcript.

### Recommended Stack

The practice runs on this combination of tools. Each is replaceable, but the combination is what the practice expects out of the box:

| Tool                              | Role                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| **AI-native terminal** (Warp, etc.) | Terminal with voice input, blocks, smart autocomplete.          |
| **Claude Code**                   | The AI CLI that runs on top — dispatches skills, subagents, MCPs. |
| **VSCode · Cursor · Windsurf**    | Editor — personal preference, not a standard. Pick one.         |
| **Git**                           | Code and context versioning.                                    |
| **`[TMS_TOOL]`** (Jira/Xray)      | Test management — tickets, ATPs, ATRs, TCs.                     |

Claude Code is the load-bearing piece — it is the orchestrator that triggers skills, dispatches subagents, and accesses MCPs. Everything else is the engineer's working surface around it.

---

## 9. The Orchestration Model: AI Works, Human Decides

This is the most important architectural decision in the practice, and the one most often misunderstood in AI-assisted QA: **skills do not run end-to-end autonomously**.

```
                ┌─────────────────────────┐
                │    MAIN AI (Skill)      │
                │    "Command Center"     │
                │    Dispatches work      │
                └────────────┬────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │ Subagent │ ──●→    │ Subagent │ ──●→    │ Subagent │  ──●→ Done
  │ PLANNING │  👤     │EXECUTION │  👤     │REPORTING │   👤
  └──────────┘         └──────────┘         └──────────┘

  ● = Human checkpoint. The QA engineer reviews, approves, modifies, or vetoes.
      Nothing proceeds without review.
```

### Three guarantees

1. **Every subagent reports back.** No silent work. The main AI presents a summary at the end of each stage.
2. **The human can stop, redirect, or modify at any checkpoint.** Veto at any gate forces the skill to replan.
3. **Full transcript is logged.** Every decision, every dispatch, every output is auditable after the fact.

### Why the checkpoints exist

AI makes mistakes — misreading an AC, selecting wrong test data, misclassifying a failure. Catching those mistakes **between stages** prevents them from cascading. A wrong decision in Planning that reaches Reporting produces a corrupted ATR. Caught at the Planning gate, it is a two-minute correction.

This is what gives the practice AI **speed** without losing human **judgment**. The skill does the mechanical work; the engineer does the deciding.

### Where the doctrine lives

The orchestration model is not improvised per session — it is captured in canonical references that workflow skills load on demand. Engineers and skill authors should know where to look:

- **`AGENTS.md` §Orchestration Mode** — canonical project-level statement of the strategy (subagent-or-not decision rule, briefing format, error protocol).
- **`framework-core/references/orchestration-doctrine.md`** — cacheable mirror loaded by subagents that need the full doctrine without re-reading `AGENTS.md`.
- **`framework-core/references/briefing-template.md`** — the six-component briefing format every dispatch uses (Goal · Context docs · Skills to load · Exact instructions · Report format · Rules).
- **`framework-core/references/dispatch-patterns.md`** — decision guide for the four patterns (Single, Sequential, Parallel, Background) and when each applies.
- **`## Subagent Dispatch Strategy`** sections inside each workflow `SKILL.md` (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`) — per-stage tables declaring which steps delegate to subagents and with what pattern.

When a skill writes `Use the dispatch defined in §Subagent Dispatch Strategy: Parallel`, that line is shorthand for the full briefing assembled from the references above. The doctrine is a single source, cited from many places.

---

## 10. Stages 1–3 Flow: Session Start → Planning → Execution → Reporting

The `sprint-testing` skill handles the per-ticket work across Stages 1, 2 and 3. A full cycle compresses what would otherwise be a multi-hour manual workflow into a predictable, repeatable per-ticket process. Exact duration depends on scope and risk, but the practice is designed to keep mechanical work out of the engineer's hands so they can focus on judgement.

```
  [Session Start]  →  [Stage 1]     →  [Stage 2]        →  [Stage 3]
                      Planning         Execution           Reporting
  Context + data     Risk + design    Smoke + tests      Results + bugs
       │                  │                  │                   │
       ▼                  ▼                  ▼                   ▼
 Load context       Risk triage         Smoke test           Fill ATR
 Fetch ticket       Design scenarios    UI + API + DB        File bugs
 Find test data     Create ATP          Evidence capture     Post QA comment
                    Create TCs                               Close ticket
```

### Session Start

- Fetch the ticket via `[ISSUE_TRACKER_TOOL]` (title, ACs, comments, linked artefacts).
- Explain the story back to the user in plain English and wait for confirmation.
- Load project context (`.context/master-test-plan.md`, `.context/mapping/business-data-map.md`, `.context/mapping/business-feature-map.md`, `.context/mapping/business-api-map.md`).
- Explore the frontend and backend code related to the ticket.
- Query the database via `[DB_TOOL]` for test data candidates (**generate > discover > modify** hierarchy — never hardcode).
- Create or update the PBI folder (`.context/PBI/{module}/{PROJECT_KEY}-XXX-{title}/`).
- Configure the browser automation environment via the `playwright-cli` skill.

### Stage 1 — Planning

- Run a risk triage across each AC.
- Design scenarios with equivalence partitioning and boundary analysis.
- Identify required test data and environment preconditions.
- Create an ATP record in `[TMS_TOOL]`, fill in the Test Analysis content, and link it to the ticket.
- Create TC records for each designed scenario, linked to the ATP and to the ACs they cover.
- Present the plan to the engineer and wait for approval.

### Stage 2 — Execution

- Run the smoke test first as a Go/No-Go gate. If smoke fails, stop and report; do not spend time on deep testing.
- Execute UI, API, and DB checks per the plan.
- Capture evidence (screenshots, API responses, DB query results) into `evidence/`.
- Classify any findings as bugs, observations, or acceptable deviations.

### Stage 3 — Reporting

- Fill the Test Results (ATR) record in `[TMS_TOOL]` with status per TC.
- File bug tickets following the naming convention documented inside the `sprint-testing` skill's references.
- Post a QA-done comment on the original ticket and transition the tracker status.

### The deliverable

At the end of the cycle, every ticket has: a PBI folder on disk, an ATP and ATR in the TMS, TCs linked to ACs, evidence captured, bugs filed, and a clean comment trail on the source ticket. Nothing is undocumented.

---

## 11. Test Automation Engineering

Automation is not the goal. **Automating the right tests with engineering rigor** is the goal. This is why Stage 4 (`test-documentation`) runs an ROI analysis first — only manual TCs that protect real regression risk get automated. The result is a lean, maintainable suite, not test bloat.

Stage 5 (`test-automation`) is structured as a three-phase pipeline — Plan, Code, Review:

```
  [1] PLAN          →      [2] CODE          →      [3] REVIEW
  AI designs the           AI writes the             AI runs a quality
  implementation           test code in              checklist. Human
  plan. Human              KATA pattern.             verifies. Maximum
  approves before          Human monitors.           2 revision loops,
  any code is                                        then escalates.
  written.
```

These three phases map cleanly to the dispatch patterns: **Single** (Plan — one planner subagent), **Sequential** (Code — one subagent per scope unit), **Parallel** (Review — three verifier subagents running `bun run test`, `bun run type-check`, and `bun run lint` simultaneously). The full table lives in `test-automation/SKILL.md` §Subagent Dispatch Strategy.

### The KATA Architecture

Automated tests live in a four-layer architecture called **KATA** (Komponent Action Test Architecture). The layering is intentional: each layer has a single responsibility, and each layer can be tested or swapped independently.

```
┌────────────────────────────────────────────────────────────────┐
│  LAYER 4: TestFixture                             [injector]   │
│  Dependency injection — { api } { ui } { test } { steps }      │
│  File: tests/components/TestFixture.ts                         │
└────────────────────────────────────────────────────────────────┘
                              ▲
┌────────────────────────────────────────────────────────────────┐
│  LAYER 3: Components (domain)                   [your code]    │
│  {{Domain}}Api · {{Domain}}Page · {{Domain}}Flow               │
│  Each ATC carries @atc('{{PROJECT_KEY}}-XXX-TC#')              │
│  Dirs: tests/components/api/  ·  tests/components/ui/          │
└────────────────────────────────────────────────────────────────┘
                              ▲
┌────────────────────────────────────────────────────────────────┐
│  LAYER 2: ApiBase / UiBase                   [shared helpers]  │
│  HTTP helpers · Playwright helpers · Auth · Assertions         │
│  Files: tests/components/api/ApiBase.ts                        │
│         tests/components/ui/UiBase.ts                          │
└────────────────────────────────────────────────────────────────┘
                              ▲
┌────────────────────────────────────────────────────────────────┐
│  LAYER 1: TestContext                           [foundation]   │
│  Config · Faker · Environment · Credentials · Utilities        │
│  File: tests/components/TestContext.ts                         │
└────────────────────────────────────────────────────────────────┘

        ▲ Test files orchestrate ATCs across components
```

### Three load-bearing principles

**Principle 1 — ATC = complete flow, not a single click.**
An Automated Test Case (ATC) is a full scenario: navigate + act + verify. ATCs are atomic — they do not call each other. When a reusable chain is needed, it lives in the Steps module. Fixed assertions stay inside the ATC; test-level assertions live in the test file.

**Principle 2 — `@atc` decorator traces to the TMS.**
Every automated test carries an `@atc('{{PROJECT_KEY}}-XXX-TC#')` decorator. When CI fails, the decorator makes it possible to walk the chain in reverse: failing ATC → TMS TC → ATP → User Story → Acceptance Criterion. The AI can answer "which requirement is at risk?" in one hop.

**Principle 3 — Smart fixtures by test type.**
Fixtures are chosen to minimise cost:

| Test type | Fixture    | Browser launched? |
| --------- | ---------- | ----------------- |
| API only  | `{ api }`  | No (lazy)         |
| UI only   | `{ ui }`   | Yes               |
| Hybrid    | `{ test }` | Yes               |

A pure API test does not open Chromium. Across hundreds of runs, this saves minutes per CI execution and keeps the suite fast.

### What the AI is allowed to do

The AI writes the implementation plan first — scenarios, components that exist, components that need to be created, required test data. The plan is approved **before** a single line of code is written. Code is then generated following the KATA pattern. Review runs a quality checklist (naming, locator hygiene, fixture choice, assertion placement, `@atc` decorator presence). Two revision loops maximum, then the work escalates to the engineer. This cap prevents the AI from grinding on a bad design.

Full details live in the skill's own references:

- `.claude/skills/test-automation/references/`

---

## 12. The AI Toolkit: Skills, Commands, Integrations

The practice uses three complementary kinds of AI capability:

- **Skills** auto-trigger on intent (a user phrase matches the skill description).
- **Commands** are invoked explicitly with `/<name>` for one-shot utilities.
- **Integrations** are the live systems the AI can query and act on. These split into two kinds: **MCPs** (the external bridge) and **CLIs** (first-party command-line tools built inside this repo). Both surface the same systems — teams pick CLI-first when available, MCP as fallback.

### Skills (auto-trigger on intent)

| Skill                 | Stage        | When it fires                                                                  |
| --------------------- | ------------ | ------------------------------------------------------------------------------ |
| `framework-core`      | Foundation   | "regenerate AGENTS.md", "framework bootstrap", "setup framework foundation", "install boilerplate scripts" |
| `project-discovery`   | Onboarding   | "set up this project", "onboard this repo", "generate business-data-map", "discover the architecture" |
| `sprint-testing`      | 1 · 2 · 3    | "test {{PROJECT_KEY}}-XXX", "process sprint N", "retest bug", "QA this story", "mode yolo" |
| `test-documentation`  | 4            | "document tests", "ROI analysis", "Candidate vs Manual", "fix traceability"    |
| `test-automation`     | 5            | "automate TC", "write E2E test", "KATA component", "review test code"          |
| `regression-testing`  | 6            | "run regression", "quality report", "GO/NO-GO decision", "analyze failures"    |
| `acli`                | any          | Atlassian CLI for Jira from the terminal — work-item create/edit/transition, bulk operations, scripting Jira |
| `xray-cli`            | any          | TMS CLI operations — create tests, manage executions, import results, backup   |
| `playwright-cli`      | any          | Browser automation — screenshots, navigation, form filling, tracing, mocking   |

All skill definitions live under `.claude/skills/<name>/SKILL.md`, with detailed references under `.claude/skills/<name>/references/`.

### Commands (`/<name>` — on-demand utility)

Commands are deterministic, single-purpose prompts invoked explicitly. Unlike skills, they do not auto-trigger.

| Command                       | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `/adapt-framework`            | Adapt this boilerplate's KATA test architecture to a project already reverse-engineered by `/project-discovery` (Plan -> Approval -> Implement) |
| `/refresh-ai-memory`          | Regenerate `README.md` and the AI memory file (`AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `.cursor/rules`, auto-detected) so they reflect the current `.context/` and `package.json` state |
| `/master-test-plan`           | Generate or refresh `.context/master-test-plan.md` — what to test and why, derived from the discovery artefacts |
| `/business-data-map`          | Generate or refresh `.context/mapping/business-data-map.md` (entities, flows, state machines) |
| `/business-feature-map`       | Generate or refresh `.context/mapping/business-feature-map.md` (feature catalog, CRUD matrix, integrations) |
| `/business-api-map`           | Generate or refresh `.context/mapping/business-api-map.md` (auth model, critical endpoints, architecture) |
| `/commit-push-pr`             | Commit, push, and open a PR (full integrated flow)       |
| `/fix-git-conflict`           | Resolve git conflicts safely                             |
| `/fix-traceability`           | Repair broken TMS traceability links (US → ATP → ATR → TC) |
| `/break-down-tests`           | Plain-English breakdown of automated tests for a given module / spec |

All command definitions live under `.claude/commands/<name>.md`.

### Integrations (live system access)

MCPs and CLIs are how the AI talks to real systems. Without them, the AI can only reason against text; with them, the AI can query, act, and verify.

| Integration        | Default provider     | Use                                                   |
| ------------------ | -------------------- | ----------------------------------------------------- |
| `[TMS_TOOL]`       | `xray-cli` skill     | Create/list tests, manage executions, import results, back up project |
| `[ISSUE_TRACKER_TOOL]` | Atlassian CLI    | Fetch tickets, comments, transitions                  |
| `[DB_TOOL]`        | DBHub MCP            | SQL queries — explore schema, discover and verify test data |
| `[API_TOOL]`       | OpenAPI MCP          | Contract exploration, endpoint discovery              |
| `[AUTOMATION_TOOL]`| `playwright-cli` skill | Browser automation — screenshots, tracing, mocking  |
| `context7` MCP     | Anthropic-ecosystem  | Official library documentation                        |
| `tavily` MCP       | Anthropic-ecosystem  | Web search for community solutions                    |

Each `[TAG_TOOL]` resolves via the Tool Resolution table in `CLAUDE.md`. Swap the row to swap the backend — skills keep calling the same tag.

**Decision rule:**

- `context7` — "how to use X" (official docs).
- `tavily` — "how to solve X" (community solutions).

Authentication tokens for long-lived MCPs expire on their own cadence. Refresh scripts live under `cli/` and `scripts/` (the latter hosts foundation utilities written by `framework-core` such as `agents-setup.ts`, `agents-lint.ts`, `sync-jira-fields.ts`, and `check-jira-setup.ts`) and are documented in each MCP's setup guide (`docs/setup/`).

---

## 13. The Quality Gate: GO / CAUTION / NO-GO

Every release candidate passes through the same gate. There is no "I think it's fine" shipping decision — the verdict is data-driven, owned by the `regression-testing` skill (Stage 6).

### The three verdicts

| Verdict     | Pass rate | Critical failures | Action                            |
| ----------- | --------- | ----------------- | --------------------------------- |
| **GO**      | ≥ 95%     | 0                 | Ship.                             |
| **CAUTION** | 85–95%    | Investigate       | Conditional release after review. |
| **NO-GO**   | < 85%     | Any critical      | Block. Fix before shipping.       |

### Failure classification

When a test fails, the AI does not just report "failure." It classifies the failure into one of five categories:

- **Regression** — a real defect introduced in the release candidate.
- **Flaky** — the test is non-deterministic; fix the test, not the code.
- **Known** — the failure matches a previously-filed bug still in progress.
- **Environment** — the failure is caused by infrastructure, not code (DB down, token expired, network blip).
- **New Test** — a newly added test that has not yet stabilised.

Classification decides the release verdict. Five flaky tests do not block a release; one real regression does.

### The artefacts

- GitHub Actions runs the regression suite nightly and on-demand (`.github/workflows/`).
- Allure generates the report dashboard.
- The skill emits a release note with the verdict, the pass rate, the critical failures (if any), and the classification summary.

---

## 14. Anatomy of a Test Session

To illustrate how the pieces fit together, here is what a typical ticket's journey looks like from start to finish.

Consider a ticket `{{PROJECT_KEY}}-XXX` with a handful of acceptance criteria covering a revenue-impacting feature:

1. **Session Start.** The `sprint-testing` skill loads project context, opens the ticket via `[ISSUE_TRACKER_TOOL]`, explores the frontend (`{{FRONTEND_REPO}}`) and backend (`{{BACKEND_REPO}}`) code paths related to the feature, queries the database via `[DB_TOOL]` for test data candidates, and creates the PBI folder for the ticket.
2. **Stage 1 — Planning.** Risk triage across each AC. Test cases are designed per AC using equivalence partitioning and boundary analysis. An ATP is created in `[TMS_TOOL]` and TCs are linked to the ATP and to the ACs they cover. The plan is presented to the engineer for approval.
3. **Stage 2 — Execution.** The smoke test runs first as a Go/No-Go gate. If it passes, the skill executes the planned UI, API, and DB checks, capturing evidence into the PBI `evidence/` folder.
4. **Stage 3 — Reporting.** The ATR is filled in `[TMS_TOOL]` with status per TC. Any bugs are filed following the naming convention. A QA-done comment is posted on the ticket and the tracker status is transitioned.
5. **Traceability verification.** The `/fix-traceability` command (or the `xray-cli` skill's trace operation) walks the chain and confirms every link — Story → ATP → ATR → TCs — is present and correct.

Every artefact lives in the TMS and in the PBI folder on disk. The AI produces the plan, runs the tests, files the results, and verifies traceability. The engineer reviews and approves at each checkpoint.

---

## 15. Metrics: Instrumentation Template

Catching bugs is baseline. The next step is turning the bug stream into engineering insight — so the team can decide where to invest tech debt effort, which integrations are fragile, and whether shift-left AC review is actually paying off.

This section is a **recommended instrumentation pattern**, not a pipeline that ships turned on. Teams adopt it when they are ready to measure quality as rigorously as they deliver it.

### Instrumentation (inputs)

Three custom fields on every bug ticket:

| Field                  | Purpose                                             | Examples                                                  |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| **Component Affected** | Which module the bug hit                            | Any module name from `PBI/{module}/`                      |
| **Root Cause**         | Why the bug exists                                  | AC Gap · Code · Integration · Data · Edge Case · Regression |
| **Upstream Ticket**    | Which feature introduced the bug                    | The user story in whose release the defect appeared       |

### Engineering insight (outputs)

Four metrics emerge once the instrumentation is in place:

| Metric                              | Business question answered                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| **Defect density by component**     | Which modules are most fragile? Where should tech debt investment land?                       |
| **Root cause distribution**         | Where is quality leaking? AC gaps, integrations, or code?                                     |
| **First-deploy AC compliance rate** | What percentage of features meet their ACs on the first deploy versus requiring iteration?    |
| **Bug escape rate**                 | How many bugs pass the QA gate and reach production? (The honest before-after number.)        |

Treat these as a starting point, not a canon. Add fields that map to your team's risk model, drop fields that do not earn their keep.

---

## 16. Summary of What the Practice Delivers

### What ships in this repository

- **A foundation skill (`framework-core`)** — bootstraps `AGENTS.md`, `.agents/project.yaml`, and the `agents-*` scripts; hosts the canonical orchestration doctrine, briefing template, and dispatch patterns cited by every workflow skill.
- **A roster of stage-aware AI skills** — auto-triggered by user intent, orchestrated with human-in-the-loop checkpoints. Each stage of the pipeline has its own skill. The current roster is enumerated in Section 12.
- **A library of utility commands** — deterministic, single-purpose, invoked with `/<name>`. The current library is enumerated in Section 12.
- **Live system integrations** — MCPs for the database, API, TMS, and library documentation, plus first-party CLIs for TMS operations and browser automation. The current set is enumerated in Section 12.
- **A structured context layer** — project, module, and ticket-level knowledge, on disk and version-controlled. Contains business rules, API documentation, per-ticket memory, and team guidelines.
- **TMS integration with traceability** — ATPs, ATRs, TCs linked to user stories, with programmatic traceability verification via `/fix-traceability` and the `xray-cli` skill.
- **A KATA automated test suite scaffold** — four-layer architecture, `@atc` decorators tracing every test to a TMS TC, smart fixtures, ROI-curated scope.
- **A CI/CD pipeline** — build, smoke, sanity, and regression workflows in GitHub Actions.
- **A data-driven quality gate** — GO / CAUTION / NO-GO, with AI-classified failures.

### The core claim

A QA practice that tests faster, documents everything, and tells the team — with data — when it is safe to ship. Built on the premise that AI handles the mechanical work, and the engineer handles the decisions.

The rest is execution.

---

**Last Updated**: 2026-04-26

**See also**:
- `AGENTS.md` — canonical project memory, Tool Resolution, and skill routing (mirrored at `CLAUDE.md`)
- `docs/context-engineering.md` — strategy behind the three-tier context split
- `docs/methodology/IQL-methodology.md` — phased methodology deep-dive
- `.claude/skills/framework-core/SKILL.md` — foundation skill internals (bootstrap + shared references)
- `.claude/skills/framework-core/references/orchestration-doctrine.md` — canonical orchestration doctrine cited by every workflow skill
- `.claude/skills/acli/SKILL.md` — Atlassian CLI integration for Jira work-item operations
- `.claude/skills/test-automation/references/` — KATA architecture, `@atc` decorator, and traceability chain
- `.context/README.md` — canonical context layout
- `.claude/skills/project-discovery/SKILL.md` — onboarding skill internals
- `.claude/skills/sprint-testing/SKILL.md` — Stages 1–3 skill internals
- `.claude/skills/test-documentation/SKILL.md` — Stage 4 skill internals
- `.claude/skills/test-automation/SKILL.md` — Stage 5 skill internals
- `.claude/skills/regression-testing/SKILL.md` — Stage 6 skill internals
