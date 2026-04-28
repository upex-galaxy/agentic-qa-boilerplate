# Context Engineering Strategy

> **Purpose**: Explain the context engineering strategy for AI-driven test automation.
> **Audience**: Humans learning the system + AI when needing to understand "why".
> **Related**: `AGENTS.md` contains the operational context loaded each session. (`CLAUDE.md` at the repo root is a symlink on Linux/macOS — and a byte-identical copy on Windows — pointing at `AGENTS.md`. They are the same file; structural changes belong in `AGENTS.md` and propagate through the symlink.)

---

## 1. What is Context Engineering?

**Context Engineering** is the practice of structuring information so AI assistants can work effectively on a codebase. Instead of the AI reading everything (expensive, slow), we provide curated context based on the task.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Token Efficiency** | Load only what's needed for the current task |
| **Progressive Loading** | Start with summary, load details on demand |
| **Context Relevance** | Different tasks need different context |
| **Single Source of Truth** | One place for each type of information |
| **Tool-Agnostic Context** | `.agents/` is consumed by any AI agent (Claude Code, Codex, Cursor, Copilot, OpenCode), not just Claude. Agent-specific surfaces (`.claude/`, `.cursor/`, `.gemini/`, …) layer on top of the shared substrate. |

---

## 2. Repository Philosophy

This repository separates concerns into distinct directories, each with a specific purpose:

```
agentic-qa-boilerplate/
│
├── .agents/          → Tool-agnostic project + Jira config (any AI agent reads this)
├── .context/         → Documentation THAT the AI reads (context)
├── .claude/skills/   → Workflow skills (task instructions + references)
├── docs/             → Documentation for humans
├── tests/            → KATA Architecture implementation
└── AGENTS.md         → Project memory (loaded every session)
```

### Why This Separation?

| Directory | Contains | When Loaded |
|-----------|----------|-------------|
| `.agents/` | Tool-agnostic project + Jira config (`project.yaml`, `jira-fields.json`, `jira-required.yaml`) | When the AI needs to resolve `{{VAR}}` or `{{jira.<slug>}}` |
| `.context/` | Facts about the system (what exists, how it works) | When AI needs to understand the system |
| `.claude/skills/` | Task instructions + references (what to do, step by step) | When AI loads a skill for a specific task |
| `docs/` | Learning material for humans | When humans need to learn |
| `AGENTS.md` | Operational rules + project state | Every session automatically |

---

## 3. Variable & Config Substrate

Skills, commands, templates and docs reference dynamic values through three distinct variable syntaxes. They are NOT interchangeable, and they resolve from different files.

### Files in `.agents/`

| File | Role | Edited by | Regenerated with |
|------|------|-----------|------------------|
| `.agents/project.yaml` | Per-project static config: name, repo paths, URLs (per environment), MCP server names, issue-tracker metadata, default env. | Project owner (one-time) | `bun run agents:setup` (interactive) or by hand |
| `.agents/jira-fields.json` | Auto-generated catalog of every custom field in your Jira workspace, keyed by canonical slug. | Generated only — never edit by hand | `bun run jira:sync-fields` |
| `.agents/jira-required.yaml` | Declarative manifest of the Jira custom fields the methodology requires (with expected types, option lists, consumers). | Methodology maintainers | Updated when a skill adds or drops a `{{jira.<slug>}}` reference |
| `.agents/README.md` | The contract: explains the three variable syntaxes and how the resolver, linter and `jira:check` cooperate. | Methodology maintainers | — |

### The three variable syntaxes

| Syntax | Meaning | Resolves from |
|--------|---------|---------------|
| `{{VAR_NAME}}` | **Project variable** — static per-repo value. Two flavours: **flat** (top-level section, e.g. `{{PROJECT_KEY}}` -> `project.project_key`) and **env-scoped** (`{{WEB_URL}}`, `{{API_URL}}`, `{{DB_MCP}}`, `{{API_MCP}}`) which resolve to the active environment's value. | `.agents/project.yaml` |
| `<<VAR_NAME>>` | **Session variable** — computed at runtime by the calling skill or command (e.g. `<<ISSUE_KEY>>` extracted from a git branch name). Never persisted, never declared. | The skill / command's runtime context |
| `{{jira.<slug>}}` | **Jira custom field reference** — portable pointer to a Jira custom field. Skills never hardcode `customfield_XXXXX`. | `.agents/jira-required.yaml` (canonical declaration) AND `.agents/jira-fields.json` (workspace-resolved IDs) |

For explicit cross-env references in multi-env documents (rare), the form `{{environments.<env>.<var>}}` (e.g. `{{environments.local.web_url}}`) bypasses active-env resolution. See `.agents/README.md` for the complete contract.

### `.env` vs `.agents/project.yaml` — two systems by design

The boilerplate intentionally separates two configuration substrates. They have different consumers, different lifecycles, and **must not be conflated**.

| | `.env` | `.agents/project.yaml` |
|--|--------|------------------------|
| **Purpose** | Playwright / KATA **runtime** secrets and config | AI **context-engineering** variables for `{{VAR}}` resolution |
| **Consumers** | The test runner (`bun run test`, fixtures, login helpers) | AI agents (Claude Code, Cursor, Codex, Copilot, OpenCode) — when resolving skill / template / doc references |
| **Examples** | `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`, `XRAY_CLIENT_SECRET`, `HEADLESS`, `DEFAULT_TIMEOUT` | `PROJECT_KEY`, `WEB_URL`, `API_URL`, `JIRA_URL`, `DB_MCP`, `default_env` |
| **Secrets?** | Yes (passwords, tokens, API keys) | No — must remain commit-safe |
| **Committed?** | Gitignored (`.env.example` is committed as a template) | Committed |
| **Lifecycle** | Edited per developer / per CI runner | Edited once when adopting the boilerplate; rarely changes after |

Two systems, two consumers, two lifecycles. Use the right substrate for the right value — secrets in `.env`, AI context in `.agents/project.yaml`.

---

## 4. Directory Structure

### .context/ - AI Context

```
.context/
├── PRD/                       → Product Requirements (generated)
├── SRS/                       → Software Requirements (generated)
├── PBI/                       → Per-module + per-ticket context (generated)
│
├── mapping/                   → Business maps (command-generated)
│   ├── business-data-map.md       → System flows + entities        (/business-data-map)
│   ├── business-feature-map.md    → Feature catalog + CRUD matrix  (/business-feature-map)
│   └── business-api-map.md        → Auth model + critical API      (/business-api-map)
│
├── reports/                   → Run artifacts: regression reports, GO/NO-GO verdicts, analysis output
├── master-test-plan.md        → What to test and why                (/master-test-plan)
└── test-management-system.md  → TMS architecture + conventions + workflow
```

Workflow instructions and role-specific guidelines (TAE, QA, MCP usage) now live inside agent skills under `.claude/skills/`.

### .claude/skills/ - AI Operations Center

```
.claude/skills/
├── framework-core/        → Foundation: shared references (briefing template, dispatch patterns, orchestration doctrine) + bootstrap (`/framework-core init`)
├── acli/                  → Atlassian CLI skill: Jira issue tracking + Modality B TMS operations
├── project-discovery/     → 4-phase reverse-engineering, generates `.context/` artifacts. README/AGENTS.md upkeep is `/refresh-ai-memory`; foundation files are `/framework-core init`.
├── sprint-testing/        → In-sprint QA (planning + execution + reporting, per ticket)
├── test-documentation/    → TMS documentation + test prioritization
├── test-automation/       → KATA test planning + coding + review
├── regression-testing/    → Regression execution + GO/NO-GO
├── playwright-cli/        → Browser automation helper
└── xray-cli/              → Xray TMS helper
```

**Key Skills**:
- `/framework-core init` - Foundation bootstrap (AGENTS.md, .agents/, scripts/, package.json)
- `/test-automation` - KATA test writing pipeline
- `/sprint-testing` - End-to-end in-sprint QA
- `/project-discovery` - Generates `.context/` artifacts; pair with `/refresh-ai-memory` for README/AGENTS.md upkeep

### docs/ - Human Documentation

```
docs/
├── agentic-quality-engineering.md → Top-level entry point: vision, principles, lifecycle overview
├── architectures/                 → Target application architecture
├── methodology/                   → Testing methodology (IQL, KATA phases)
├── setup/                         → Setup guides (MCP, tools)
├── testing/                       → Testing guides (API, DB, automation)
├── workflows/                     → Workflow guides (git, environments)
└── context-engineering.md         → This file
```

### tests/ - KATA Implementation

```
tests/
├── components/          → KATA components (Layers 1-4)
│   ├── TestContext.ts   → Layer 1: Config, Faker, utilities
│   ├── api/             → Layers 2-3: ApiBase + domain APIs
│   ├── ui/              → Layers 2-3: UiBase + domain pages
│   ├── steps/           → Reusable ATC chains
│   └── TestFixture.ts   → Layer 4: Dependency injection
│
├── e2e/                 → E2E tests (UI + API)
├── integration/         → Integration tests (API only)
├── data/                → Test data (fixtures, uploads)
└── utils/               → Decorators, reporters
```

---

## 5. Key Files (Stable Names)

These files have stable names and locations. Reference them confidently:

| File / Skill | Purpose |
|--------------|---------|
| `AGENTS.md` | Project memory, loaded every session |
| `.agents/project.yaml` | Tool-agnostic project variables (`{{VAR}}` source of truth) |
| `.agents/jira-required.yaml` | Manifest of Jira custom fields the methodology requires |
| `.agents/jira-fields.json` | Auto-generated catalog of the workspace's Jira fields (`{{jira.<slug>}}` resolution) |
| `framework-core/SKILL.md` | Foundation skill: bootstrap + shared references for every workflow skill |
| `/test-automation` skill | Entry point for writing tests (KATA) |
| `/sprint-testing` skill | QA workflow orchestrator (plan + execute + report) |
| `/project-discovery` skill | Generate project documentation + `.context/` |

---

## 6. Workflow Overview

### One-Time Setup (Discovery)

```
Phase 0: Bootstrap       → /framework-core init  (writes AGENTS.md, .agents/, scripts/, package.json updates)
                          bun run agents:setup   (interactive walkthrough of .agents/project.yaml)
                          bun run jira:sync-fields (catalog Jira workspace fields)
                          bun run jira:check     (validate against jira-required.yaml manifest)
                          bun run lint:agents    (verify every {{VAR}} and {{jira.<slug>}} resolves)
Phase 1: Constitution    → Understand the business
Phase 2: Architecture    → Document PRD + SRS
Phase 3: Infrastructure  → Map technical stack
Phase 4: Specification   → Connect to backlog
```

**Output**: Populated `.agents/` config + `.context/` directories.

### Context Generators

After discovery, run these commands (orchestrated by `/project-discovery` or invoked individually — they are independent commands, not sub-skills):

```
/business-data-map          → .context/mapping/business-data-map.md
/business-feature-map       → .context/mapping/business-feature-map.md
/business-api-map           → .context/mapping/business-api-map.md
/master-test-plan           → .context/master-test-plan.md
bun run api:sync            → api/schemas/ (TypeScript types from OpenAPI)
```

### QA Stages (Per User Story)

| Stage | Activity | Skill |
|-------|----------|-------|
| **Stage 1** | Planning (shift-left, AC review, ATP draft) | `/sprint-testing` |
| **Stage 2** | Execution (exploratory + smoke + trifuerza) | `/sprint-testing` |
| **Stage 3** | Reporting (ATR, QA comment, bug reports) | `/sprint-testing` |
| **Stage 4** | TMS documentation + ROI prioritization (Candidate / Manual / Deferred) | `/test-documentation` |
| **Stage 5** | Automation: plan → code → review (KATA on Playwright + TS) | `/test-automation` |
| **Stage 6** | Regression execution + failure classification + GO/NO-GO | `/regression-testing` |
| **Onboarding** | 4-phase reverse-engineering of an existing target repo | `/project-discovery` + `/adapt-framework` |
| **Bootstrap** | Foundation files for fresh adoption (AGENTS.md, `.agents/`, scripts) | `/framework-core init` |

---

## 7. Orchestration as Context Engineering

Token efficiency is not just about which files to load — it is also about which agent loads them. Subagent dispatch is a context-engineering tool: the main conversation stays lean and acts as command center, while focused subagents do heavy reading and work in their own context.

The orchestration doctrine has three shared assets, all hosted by `framework-core`:

| Asset | Path | Role |
|-------|------|------|
| **Orchestration doctrine** | `framework-core/references/orchestration-doctrine.md` | Cacheable mirror of `AGENTS.md` §"Orchestration Mode (Subagent Strategy)". Subagents load this instead of pulling the full `AGENTS.md`. |
| **Briefing template** | `framework-core/references/briefing-template.md` | The canonical 6-component briefing format (Goal / Context docs / Skills to load / Exact instructions / Report format / Rules) with one filled example per dispatch pattern. |
| **Dispatch patterns** | `framework-core/references/dispatch-patterns.md` | Decision guide and heuristic for picking Single / Sequential / Parallel / Background. |

Each workflow skill (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`) declares **its own dispatch points** in a `## Subagent Dispatch Strategy` section of its `SKILL.md`. That table maps each stage to its dispatch pattern and subagent role, so the AI knows up-front when to delegate and how to brief.

Reference / utility / generator skills (`framework-core`, `acli`, `xray-cli`, `playwright-cli`, `project-discovery`, `adapt-framework`, the `business-*-map` and helper commands) are exempt from the dispatch-table requirement — they execute synchronously in-line.

---

## 8. Progressive Loading Strategy

### By Task Type

| Task | Load First | Load If Needed |
|------|------------|----------------|
| **Write E2E or API Test** | `/test-automation` (SKILL.md) | The skill's own `references/` (planning playbook, KATA patterns, etc.) |
| **Exploratory Testing** | `/sprint-testing` (SKILL.md) + `.context/master-test-plan.md` | Skill `references/` (exploration patterns, session entry points) |
| **Understand System** | `.context/mapping/business-data-map.md` | `.context/PRD/*`, `.context/SRS/*` |
| **Use MCP** | `AGENTS.md` §"MCPs Available" + §"Tool Resolution" | The owning CLI skill (`/acli`, `/xray-cli`, `/playwright-cli`) |

### By Role

| Role | Primary Skill(s) |
|------|------------------|
| **Project Onboarding** | `/framework-core init` -> `/project-discovery` -> `/adapt-framework` |
| **TAE (Test Automation)** | `/test-automation` |
| **QA (Manual Testing)** | `/sprint-testing` + `/test-documentation` |
| **DevOps** | `/regression-testing` |

---

## 9. Token Optimization Tips

### DO

- Load `AGENTS.md` first (automatic)
- Load task-specific guidelines
- Use skills from `.claude/skills/` for structured tasks
- Reference code in `tests/components/` as living examples
- From subagents, load `framework-core/references/orchestration-doctrine.md` instead of pulling full `AGENTS.md`

### DON'T

- Load all guidelines at once
- Include full file trees in prompts
- Duplicate information across files
- Load PRD/SRS for simple test writing

---

## 10. Maintenance Guidelines

### When to Update AGENTS.md

- Project identity changes
- New MCPs configured
- New CLI tools added
- Testing decisions documented

### When to Update Skills

- Framework patterns or conventions change (update the relevant skill's `references/`)
- Workflow steps change (update the SKILL.md orchestration)
- New outputs required or better instructions discovered
- Structural changes to `AGENTS.md` must mirror `framework-core/templates/AGENTS.md.template` in the same commit (the live file and the template are byte-equivalent for structural sections)

---

## Related Documentation

- **AGENTS.md** - Operational context (project root)
- **README.md** - Project overview for humans
- `.agents/README.md` - Variable resolution contract (`{{VAR}}`, `<<VAR>>`, `{{jira.<slug>}}`)
- `/test-automation` skill - KATA Architecture entry point
- `.claude/skills/` - Workflow skills (each one self-describes via its SKILL.md)

---

**Last Updated**: 2026-04-26
