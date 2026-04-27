# Getting Started

> **Purpose**: Make sense of how this repo's pieces fit together — Skills, Commands, Scripts, and the configuration substrate. The 30-minute orientation a new contributor needs before opening any skill.
> **Audience**: New QA engineers, automation engineers, or technical leaders adopting this boilerplate. Read AFTER skimming `README.md` and BEFORE diving into individual skills.
> **Related**: [`../README.md`](../README.md) (project overview + Quick Start) · [`agentic-quality-engineering.md`](agentic-quality-engineering.md) (strategy + architecture deep-dive) · [`context-engineering.md`](context-engineering.md) (the why behind the knowledge layer).

---

## Table of Contents

1. [The fundamental idea](#1-the-fundamental-idea)
2. [Three categories of moving parts](#2-three-categories-of-moving-parts)
3. [The lifecycle: five phases](#3-the-lifecycle-five-phases)
4. [The three confusing pieces](#4-the-three-confusing-pieces)
5. [How everything connects internally](#5-how-everything-connects-internally)
6. [Cheat sheet — "I want X, I run Y"](#6-cheat-sheet--i-want-x-i-run-y)
7. [Pieces you NEVER invoke directly](#7-pieces-you-never-invoke-directly)
8. [TL;DR mental model](#8-tldr-mental-model)

---

## 1. The fundamental idea

This repository is an **AI-driven QA machine**. You have a project under test (the **target**: a frontend, a backend, or both), and this repo holds the instructions, knowledge layer, and tooling the AI uses to do quality engineering against that target. The repo never runs alone — it is always paired with one specific target codebase.

For the machine to work, three kinds of moving parts cooperate: **Skills** that orchestrate long, multi-phase AI work; **Commands** that perform one-shot utilities; and **Scripts** you run yourself in the terminal to keep the configuration substrate healthy. All three feed off the same fuel — a system of variables defined in `.agents/project.yaml` that resolves to your target's specifics at AI session bootstrap.

Read [`agentic-quality-engineering.md`](agentic-quality-engineering.md) for the strategy behind the practice and [`context-engineering.md`](context-engineering.md) for why the knowledge layer is split the way it is. This document focuses on *how the pieces connect* so you know what to invoke, in what order, and what each piece actually does.

---

## 2. Three categories of moving parts

| Type | What it is | Where it lives | Who invokes it |
|------|------------|----------------|----------------|
| **Skill** | Multi-file markdown that orchestrates the AI through long, multi-phase tasks (subagents, decisions, references). | `.claude/skills/<name>/SKILL.md` + `references/` | The AI auto-activates when your prompt matches the skill's triggers. You can also force-load via `/skill-name`. |
| **Command** | Single-file markdown for one-shot, focused utilities. | `.claude/commands/<name>.md` | You explicitly type `/<name>`. No auto-trigger. |
| **Script** | TypeScript CLI that runs in the terminal. | `scripts/*.ts` (and `cli/`) | You run `bun run <script>` directly. |

The three categories share the same fuel: the variable substrate in `.agents/project.yaml` (and Jira metadata in `.agents/jira.json` + `.agents/jira-required.yaml`). Skills resolve `{{VAR}}` placeholders against it on every AI session; commands use the same resolver; scripts read the YAML and write back to it. See §5 Circuit 1 for how that resolution actually flows.

---

## 3. The lifecycle: five phases

```
+-----------------+     +---------------+     +-----------+     +------------+     +-------------+
| Phase 0         | --> | Phase 1       | --> | Phase 2   | --> | Phase 3    | --> | Phase 4     |
| Bootstrap       |     | Discovery     |     | Adapt     |     | Daily QA   |     | Maintenance |
| (foundation)    |     | (target scan) |     | (KATA wire)|    | (sprint)   |     | (drift fix) |
+-----------------+     +---------------+     +-----------+     +------------+     +-------------+
```

Each phase has a clear trigger (one of the three categories above), a deterministic output, and a frequency. You move forward when the previous phase's output exists; you loop back to maintenance whenever the documentation drifts from reality.

### Phase 0 — Bootstrap

- **Trigger**: `bun install` → `bun run pw:install` → `bun run agents:setup` (interactive walkthrough). If you cloned skills à la carte and the foundation files are missing, you ALSO run `/framework-core init` first to install `AGENTS.md`, `.agents/`, the `scripts/agents-*.ts` CLIs, and the `package.json` script entries.
- **Produces**: A populated `.agents/project.yaml`, a `CLAUDE.md` symlink to `AGENTS.md`, and the four foundation scripts (`agents-setup`, `agents-lint`, `sync-jira-fields`, `check-jira-setup`) wired into `package.json`.
- **Frequency**: One time per repo clone. If you cloned the full repository, the foundation is already in place — only `bun install` and `bun run agents:setup` are needed.

### Phase 1 — Discovery

- **Trigger**: `/project-discovery` (skill) — give it the target repo path or describe the target's stack.
- **Produces**: `.context/PRD/` (product requirements), `.context/SRS/` (software requirements), `.context/mapping/business-data-map.md`, `.context/mapping/business-feature-map.md`, `.context/mapping/business-api-map.md`, `.context/master-test-plan.md`. The skill orchestrates the four `/business-*-map` and `/master-test-plan` commands as part of its 4-phase flow (Constitution → Architecture → Infrastructure → Specification).
- **Frequency**: Once per target. Re-run when the target undergoes a major architecture change.

### Phase 2 — Adapt

- **Trigger**: `/adapt-framework` (skill + command). Runs strictly AFTER Phase 1 — it consumes `.context/`.
- **Produces**: `tests/components/api/*.ts`, `tests/components/ui/*.ts`, `tests/components/TestFixture.ts`, `config/variables.ts`, and `api/schemas/` wired to the target's auth model and stack. Two strict sub-phases: **Plan** (no writes, presents the diff) → **user approval** → **Implement** (writes).
- **Frequency**: Once per target. Re-run only when the target's auth or stack changes meaningfully.

### Phase 3 — Daily QA work

The four workflow skills each own one slice of the in-sprint pipeline:

- `/sprint-testing` — Stages 1-3 per ticket: Planning, Execution, Reporting. Produces ATP, ATR, QA comment, bug reports.
- `/test-documentation` — Stage 4: ROI-driven test case documentation in the TMS (Jira/Xray). Emits Candidate / Manual / Deferred verdicts.
- `/test-automation` — Stage 5: Plan → Code → Review pipeline for KATA + Playwright + TypeScript automated tests.
- `/regression-testing` — Stage 6: regression / smoke / sanity execution via CI/CD, failure classification, GO / CAUTION / NO-GO verdict.

Frequency: every sprint, every ticket. The skills are designed to be invoked many times per week.

### Phase 4 — Maintenance

When `.context/`, `AGENTS.md`, or `.agents/` drifts from reality (the target shipped new modules, new Jira fields, new endpoints):

- `/refresh-ai-memory` — re-syncs `AGENTS.md` and `README.md` against current `.context/` and `package.json`. Touches FACTS only — never structural sections.
- `/business-data-map`, `/business-feature-map`, `/business-api-map` — regenerate the individual maps when the target's domain or API evolves.
- `/master-test-plan` — regenerate the master test plan when priorities shift.
- `bun run jira:sync-fields` — re-cataloging Jira custom fields after a new field is added.
- `bun run jira:check` — verify the Jira workspace still satisfies `jira-required.yaml`.
- `bun run lint:agents` — verify every `{{VAR}}` placeholder still resolves.

Frequency: as needed. Treat drift like compiler warnings — fix them when they appear, not in batches.

---

## 4. The three confusing pieces

Three pieces have similar-sounding names and overlapping verbs ("init", "adapt", "refresh"). They are NOT interchangeable. Use this table to avoid running the wrong one.

| Piece | When you invoke it | What it does | Frequency |
|-------|--------------------|--------------|-----------|
| **`/framework-core init`** (skill, active mode) | Once, ONLY if the foundation files are missing (à la carte install). If you cloned the full repo, you NEVER invoke it directly. | Generates `AGENTS.md`, `.agents/project.yaml`, `.agents/jira-required.yaml`, `.agents/jira.json`, the four `scripts/agents-*.ts` CLIs, merges entries into `package.json`, creates the `CLAUDE.md` symlink. Idempotent: existing files are preserved. | One-time |
| **`/adapt-framework`** (skill + command) | Once per target, AFTER `/project-discovery` finishes. | Adapts `tests/components/`, `config/`, `api/schemas/` to the target's stack: fixtures, page objects, API clients. Modifies THIS repo only — never the target. Plan → user approval → Implement. | Once per target |
| **`/refresh-ai-memory`** (command) | Periodically, when `.context/` drifts and `AGENTS.md` no longer reflects the project state. | Re-syncs `AGENTS.md` and `README.md` against current `.context/` and `package.json`. Touches project-specific FACTS only (Project Identity, Environment URLs, Discovery Progress) — never structural sections. | Periodic |

Mnemonic:

> `framework-core` installs the **base**, `adapt-framework` wires the **tests**, `refresh-ai-memory` updates the **documentation**.

### A passive role you never invoke

`framework-core` has a second life beyond `init`: it **hosts shared references** that workflow skills cite on demand. When `/sprint-testing`, `/test-documentation`, `/test-automation`, or `/regression-testing` delegates to a subagent, the AI loads `framework-core/references/briefing-template.md`, `dispatch-patterns.md`, and `orchestration-doctrine.md` automatically. You never type `/framework-core` to read those files — they are pulled in as part of orchestration. This passive role is invisible from the user's seat, but it is why `framework-core` exists even after Phase 0 is complete.

---

## 5. How everything connects internally

Two circuits explain the wiring. Circuit 1 is about variable resolution (the static substrate). Circuit 2 is about subagent orchestration (the dynamic execution model).

### Circuit 1 — Variables

```
.agents/project.yaml   <-- bun run agents:setup writes here (interactive)
    |
    | values: project_name, project_key, web_url, api_url,
    |         jira_url, db_mcp, api_mcp, default_env, ...
    |
    v  resolves {{VAR}} placeholders at AI session bootstrap
AGENTS.md, .claude/skills/**/SKILL.md, .claude/commands/*.md, templates/
    |
    v  AI substitutes {{VAR}} with the real value before acting
AI runs with concrete URLs, project keys, MCP server names
```

Critical distinction: **`.env` and `.agents/project.yaml` are TWO SEPARATE SYSTEMS**. Do not conflate them.

| | `.env` | `.agents/project.yaml` |
|--|--------|------------------------|
| **Purpose** | Playwright + KATA **runtime** secrets and config | AI **context-engineering** variables for `{{VAR}}` resolution |
| **Consumers** | The test runner (`bun run test`, `config/variables.ts`, fixtures, login helpers, `tests/utils/jiraSync.ts`) | AI agents (Claude Code, Cursor, Codex, Copilot, OpenCode) when resolving skill / template / doc references |
| **Examples** | `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`, `XRAY_CLIENT_SECRET`, `HEADLESS`, `DEFAULT_TIMEOUT` | `PROJECT_KEY`, `WEB_URL`, `API_URL`, `JIRA_URL`, `DB_MCP`, `default_env` |
| **Secrets?** | Yes (passwords, tokens, API keys) | No — must remain commit-safe |
| **Committed?** | Gitignored (`.env.example` is committed as a template) | Committed |
| **Lifecycle** | Edited per developer / per CI runner | Edited once when adopting the boilerplate; rarely changes after |

Two systems, two consumers, two lifecycles. Secrets in `.env`; AI context in `.agents/project.yaml`.

The variable substrate has three syntaxes that look similar but resolve from different files. The full contract lives in `.agents/README.md`, but the short version is:

- `{{VAR_NAME}}` → resolves from `.agents/project.yaml` (project-level static config).
- `<<VAR_NAME>>` → session variable, computed at runtime by the calling skill (e.g. `<<ISSUE_KEY>>` extracted from the git branch). Never persisted.
- `{{jira.<slug>}}` → portable Jira custom-field reference, resolves through `.agents/jira-required.yaml` (manifest) + `.agents/jira.json` (workspace catalog).

For the deeper rationale on the three-tier knowledge split see [`context-engineering.md`](context-engineering.md) §3.

### Circuit 2 — Orchestration

```
Workflow skill (e.g. /regression-testing)
    |
    | cites §Subagent Dispatch Strategy
    v
framework-core/references/briefing-template.md    <- 6-component format
framework-core/references/dispatch-patterns.md    <- Single/Sequential/Parallel/Background
    |
    | orchestrator builds the briefing
    v
Subagent (fresh Claude context)
    |
    | loads tool skill per the briefing
    v
/acli, /xray-cli, /playwright-cli
    |
    v  executes real shell commands
acli jira workitem create, bun xray, playwright test, ...
```

This is the canonical pattern the four workflow skills follow. The doctrine itself lives in `AGENTS.md` §Orchestration Mode and is mirrored at `.claude/skills/framework-core/references/orchestration-doctrine.md` so subagents can load it without pulling the full `AGENTS.md` into their fresh context. Each workflow skill declares its specific dispatch points in a `## Subagent Dispatch Strategy` section per-skill (which stages delegate, which pattern, which subagent role).

The takeaway: when you invoke `/regression-testing` or `/sprint-testing`, the orchestrator reads its own dispatch strategy, writes a 6-component briefing for each subagent (Goal · Context docs · Skills to load · Exact instructions · Report format · Rules), and the subagent loads tool skills (`/acli`, `/xray-cli`, `/playwright-cli`) to actually run shell commands. This is what makes the main conversation "lean" — the heavy reading happens inside subagents, not in the main thread.

---

## 6. Cheat sheet — "I want X, I run Y"

| I want to... | I run... |
|--------------|----------|
| Start fresh on a new target | `bun install` → `bun run pw:install` → `bun run agents:setup` → `/project-discovery` → `/adapt-framework` |
| Test a specific ticket manually | `/sprint-testing` (pass the ticket key) |
| Document tests in Jira/Xray with ROI | `/test-documentation` |
| Write an E2E or API test | `/test-automation` |
| Run regression and decide release | `/regression-testing` |
| Refresh `AGENTS.md` after drift | `/refresh-ai-memory` |
| Regenerate the data map | `/business-data-map` |
| Regenerate the feature map | `/business-feature-map` |
| Regenerate the API map | `/business-api-map` |
| Regenerate the master test plan | `/master-test-plan` |
| Take a screenshot via AI | `/playwright-cli` |
| Sync new Jira custom fields | `bun run jira:sync-fields` |
| Validate `{{VAR}}` placeholders | `bun run lint:agents` |
| Verify the Jira manifest matches the catalog | `bun run jira:check` |
| Validate `.env` for the active TEST_ENV | `bun run env:validate` |
| Sync OpenAPI types from the target API | `bun run api:sync` |
| Commit + push + open a PR | `/commit-push-pr` |
| Resolve a git conflict | `/fix-git-conflict` |
| Repair traceability US ↔ ATP ↔ ATR ↔ TC | `/fix-traceability` |
| Plain-English breakdown of automated tests | `/break-down-tests` |
| Bootstrap from scratch (à la carte install) | `/framework-core init` |

Every command above exists in `.claude/skills/`, `.claude/commands/`, or `package.json`. None are placeholders.

---

## 7. Pieces you NEVER invoke directly

These are passive loads — the AI pulls them in as part of orchestration, not because you typed a command.

- **Tool skills** (`/acli`, `/xray-cli`, `/playwright-cli`, `/playwright-best-practices`): the AI loads them automatically when a workflow skill needs to talk to Jira, Xray, a browser, or apply Playwright best practices. You can force-load them when you genuinely need a one-shot operation (e.g. "take a screenshot"), but they are usually invoked by other skills, not by you.
- **`framework-core/references/*`** (`briefing-template.md`, `dispatch-patterns.md`, `orchestration-doctrine.md`): the AI loads these when a workflow skill delegates to a subagent. They are passive references — the subagent loads them inside its own context to know the canonical briefing format and dispatch decision rules.
- **Templates inside `.claude/skills/framework-core/templates/`** (`AGENTS.md.template`, `project.yaml.template`, `jira-required.yaml.template`, the four `scripts/*.ts.template` files): only consumed by `/framework-core init`. They are byte-equivalent mirrors of the live files at the repo root.

---

## 8. TL;DR mental model

- **Skills** = play scripts for the AI (multi-act, with characters that delegate).
- **Commands** = single-act utilities.
- **Scripts** (`bun run …`) = what YOU run in the terminal to keep the fuel (`.agents/project.yaml` + Jira fields) healthy.
- **`.context/`** = what the AI KNOWS about the target (generated by `/project-discovery`, kept fresh by `/refresh-ai-memory` + `/business-*` commands).
- **`tests/`** = the real code, adapted by `/adapt-framework` and authored via `/test-automation`.

If you only remember one thing:

> Fill `project.yaml` first (`bun run agents:setup`), then let the AI discover the target with `/project-discovery`, then wire the tests with `/adapt-framework`. From there, invoke the four workflow skills depending on the QA stage you're in.

---

## Where to go next

- [`../README.md`](../README.md) — the GitHub-landing summary, install steps, CI workflow details, and Available Scripts catalog.
- [`agentic-quality-engineering.md`](agentic-quality-engineering.md) — the strategic deep-dive: 6-stage pipeline, KATA architecture, GO/CAUTION/NO-GO gate, instrumentation patterns.
- [`context-engineering.md`](context-engineering.md) — the **why** behind the knowledge layer: token efficiency, progressive loading, the `.env` vs `.agents/project.yaml` split, the three variable syntaxes.
- [`methodology/IQL-methodology.md`](methodology/IQL-methodology.md) — the IQL methodology deep-dive (phased approach, early/mid/late game testing).
- [`../AGENTS.md`](../AGENTS.md) — the canonical project memory + Tool Resolution table that maps `[TAG_TOOL]` pseudocode to concrete CLIs / MCPs.
- [`../.claude/skills/framework-core/SKILL.md`](../.claude/skills/framework-core/SKILL.md) — foundation skill internals (bootstrap order, idempotency rules, source-of-truth contract).

---

**Last Updated**: 2026-04-26
