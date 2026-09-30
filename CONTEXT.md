# Context Engineering — how this repo loads context for the AI

> **Purpose**: Explain the context engineering strategy for AI-driven test automation. Top-level reference alongside `README.md`, `AGENTS.md`, and `INSTALLER.md`.
> **Audience**: Humans learning the system + AI when needing to understand "why".
> **Related**: `AGENTS.md` contains the operational context loaded each session. It is the only instruction body in the repo; `CLAUDE.md` is a one-line shim (`@AGENTS.md`) that Claude Code follows to reach it. Operational prose belongs in `AGENTS.md` — never in the shim. See §2.1 below.
> **Sync**: A change to the context architecture updates this file in the same PR (`framework-development` docs follow-through); `bun run docs:check` guards its paths.

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
| **Tool-Agnostic Context** | `.agents/` holds the shared substrate — instructions, skills, hook emitter — consumed by every supported harness. Harness-specific directories (`.claude/`, `.opencode/`, `.codex/`) hold only thin adapters and generated artifacts, never a second copy of the content. |

---

## 2. Repository Philosophy

This repository separates concerns into distinct directories, each with a specific purpose:

```
agentic-qa-boilerplate/
│
├── AGENTS.md               → Project memory: the only instruction body (loaded every session)
├── .agents/
│   ├── project.yaml        → Tool-agnostic project + Jira config (any harness reads this)
│   ├── skills/             → Workflow skills (task instructions + references), committed; list: REGISTRY.md
│   └── hooks/              → Shared personality-reinject emitter (one file, three adapters)
├── .context/               → Documentation THAT the AI reads (context)
├── docs/                   → Human documentation site (`bun run docs`)
└── tests/                  → KATA Architecture implementation
```

### Why This Separation?

| Directory | Contains | When Loaded |
|-----------|----------|-------------|
| `AGENTS.md` | Operational rules + project state | Every session automatically |
| `.agents/project.yaml` + Jira catalogs | Tool-agnostic project config (`project.yaml`, `jira-fields.json`, `jira-required.yaml`) | When the AI needs to resolve `{{VAR}}` or `{{jira.<slug>}}` |
| `.agents/skills/` | Task instructions + references (what to do, step by step) | When AI loads a skill for a specific task |
| `.context/` | Facts about the system (what exists, how it works) | When AI needs to understand the system |
| `docs/` | HTML site for humans (`bun run docs`); `docs/core/` ships with the boilerplate, other folders are project-owned | When humans need to learn |

### 2.1 Host harnesses: one source, three consumers

The repo runs on **Claude Code, OpenCode, and Codex (CLI + Desktop)**. There is exactly one copy of every instruction and every skill. Where the harnesses genuinely differ — MCP file format, hook API, how a skill is invoked — each keeps a thin versioned adapter. Nothing is duplicated.

> Visual walkthrough: [**Una fuente, tres harnesses**](https://upex-galaxy.github.io/agentic-qa-boilerplate/harnesses.es.html) (Spanish, published page with diagrams).

| Surface | Claude Code | OpenCode | Codex CLI + Desktop |
|---------|-------------|----------|---------------------|
| **Instructions** | `CLAUDE.md` → `@AGENTS.md` **[generated shim]** | `AGENTS.md` (native) | `AGENTS.md` (native) |
| **Skills** | `.claude/skills` **[generated alias]** | `.agents/skills/` (native) | `.agents/skills/` (native) |
| **Commands** | none: `/<skill> <mode>` through `.claude/skills` | none: name the skill and the mode in prose | none: name the skill and the mode in prose |
| **Hook** | `.claude/settings.json` → `UserPromptSubmit` | `.opencode/plugins/personality-reinject.js` | `.codex/hooks.json` → `UserPromptSubmit` |
| **MCP** | `.mcp.json` | `opencode.jsonc` | `.codex/config.toml` |

**Instructions.** `AGENTS.md` is the only instruction body. OpenCode and Codex load it natively. Claude Code loads `CLAUDE.md`, which is exactly `@AGENTS.md` plus one newline — a documented import rather than a symlink, so it survives a Windows checkout. Writing operational prose into `CLAUDE.md` is structural drift, and `agents:compat:check` fails on it.

**Skills.** Every repo skill lives committed under `.agents/skills/` (the list is `.agents/skills/REGISTRY.md`). OpenCode and Codex discover that directory natively. Claude Code reaches the same tree through `.claude/skills`, a POSIX symlink (Windows junction) that is **generated and gitignored** — never committed, never hand-edited.

**Commands.** No harness gets command files. A skill is invoked by its own name plus a mode: when the first token of `$ARGUMENTS` matches one of its modes, that token is the mode and the rest is forwarded; with no match, the skill asks. Claude Code: `/<skill> <mode>` through `.claude/skills` (for example `/project-context data`). OpenCode and Codex: name the skill and the mode in prose. Each multi-mode skill lists its modes in its `## Mode routing` section; `.agents/skills/REGISTRY.md` lists the skills.

**Hook.** `.agents/hooks/personality-reinject.mjs` holds the contract text once. Claude and Codex run it as a command hook; OpenCode imports the constant from a thin plugin. The contract is enforced by `cli/lib/agent-compatibility-contracts.ts`: no absolute personal paths, no duplicated hook file, OpenCode must mutate `output.system` in place.

**MCP.** The canonical server set is whatever `.mcp.json` declares (only LOCAL stdio servers; web search and Postman run at harness level, `cli/lib/harness-level-mcps.ts`; browser automation is `/playwright-cli`, never an MCP); every server there must exist in the other two configs. Parity is checked semantically: each native format (JSON / JSONC / TOML) is normalized into a common shape and compared on the `.env` variables each server depends on and on its literal settings, so a server missing from one host, or present in one host only, is a failure. The boilerplate-known ids (`KNOWN_MCP_IDS`) additionally get a strict per-host shape check when the project declares them; any other server gets the generic check only. Codex never expands `${VAR}`, so `.codex/config.toml` names every secret by variable (`bearer_token_env_var`, `env_vars`).

**Generated versus versioned (hard rule).** Every bold `[generated]` cell above is output. Edit the source, then regenerate:

| Generated artifact | Its source | Regenerate |
|--------------------|------------|------------|
| `CLAUDE.md` (one-line `@AGENTS.md` shim) | `AGENTS.md` | `bun run agents:compat` |
| `.claude/skills` (POSIX symlink / Windows junction) | `.agents/skills/` | `bun run agents:compat` |

`bun run agents:compat:check` validates the whole contract (shim bytes, alias target, no project command named like a skill, hook adapters, MCP parity), prints the alias status line on every run and groups errors per surface. It runs inside `bun run repo:check`, in the pre-push hook, and conditionally in pre-commit.

**Project-owned commands and the updater.** A project's own slash commands are plain harness command files it edits by hand (`.claude/commands/`, `.opencode/commands/`). The old overlay `.agents/compatibility/command-aliases.project.json` is inert: nothing reads it, and `bun run up` names it once in an informational row. A command named like a repo skill would hide that skill's instructions, so `agents:compat:check` fails on it and `bun run agents:compat` (also run by `bun run up` and `bun run setup`) moves it to `.backups/shadowing-commands/<same path>`, gitignored and recoverable. `bun run up` (8.2) closes with one "Estado por superficie" table (one row per surface, `SURFACE_ORDER` in `cli/lib/updater-parity.ts`) and ONE parity prompt saved to `.agents/prompts/parity-plan.md`: numbered rows with evidence, one per path, each awaiting `keep project | take upstream | merge` before the AI edits anything; `take upstream` is suggested only where the project lacks the content entirely, and every `merge` on a watched file says what to port and what to keep. `--strict` turns a blocking parity finding into exit 1; an aborted run prints `Abortado.` and exits 1; `.claude/settings.json`, `.codex/` and the husky hooks ship once when missing and then sit on the protected watchlist next to `AGENTS.md`, `.mcp.json`, `opencode.jsonc` and `.codex/config.toml`, never overwritten. A project extends that watchlist through `updater.protected_paths` in `.agents/project.yaml`. On the migration run the `.claude/skills` alias waits for the migration commit (`bun run agents:compat` creates it).

**Two harness-specific facts worth knowing.** Codex loads project `.codex/` config and hooks only in a repository marked trusted, and `bun run setup:doctor` reports that trust separately because it is runtime state no file read can verify. Codex Desktop consumes the same repository config as the CLI — no second convention, no extra directory.

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
| **Examples** | `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`, `XRAY_CLIENT_SECRET`, `ATLASSIAN_API_TOKEN`, `HEADLESS`, `DEFAULT_TIMEOUT` | `PROJECT_KEY`, `WEB_URL`, `API_URL`, `ATLASSIAN_URL`, `DB_MCP`, `default_env` |
| **Secrets?** | Yes (passwords, tokens, API keys) | No — must remain commit-safe |
| **Committed?** | Gitignored (`.env.example` is committed as a template) | Committed |
| **Lifecycle** | Edited per developer / per CI runner | Edited once when adopting the boilerplate; rarely changes after |

Two systems, two consumers, two lifecycles. Use the right substrate for the right value — secrets in `.env`, AI context in `.agents/project.yaml`.

---

## 4. Directory Structure

### .context/ - AI Context

```
.context/
├── README.md                  → What lives here and why (caches + repo-owned files)
├── project-config.md          → Project config written by `/project-discovery` (committed)
│
├── ADR/                       → Architecture Decision Records — test architecture (append-only, never regenerated)
│   ├── README.md                  → When-to-write (two-gate) + status lifecycle + index
│   └── ADR-NNNN-template.md       → Copy → ADR-NNNN-<slug>.md per decision (supersede, never delete)
│
├── PBI/                       → Per-module + per-ticket context — GITIGNORED cache of Jira
│                                 rebuild: `bun run context:hydrate` · committed exceptions: README.md,
│                                 templates/, epics/*/test-specs/ (see .context/PBI/README.md)
│
└── reports/                   → Run artifacts: regression reports, GO/NO-GO verdicts, analysis output
```

> **Ignored by default.** `.context/*` is ignored and only the files this repo owns are re-included; `.gitignore` (the `.context/` block) owns the list. The AI's synthesis (business model, glossary, architecture, infra, data / API / E2E maps) lives in context skills, not here. A project may still hold legacy `business/`, `PRD/`, `SRS/` or `infrastructure/` folders: they stay tracked and are read only as generator input (`.context/README.md` §Legacy folders).

> **Master Test Plan**: it lives in Jira, in the `QA Master Test Plan` Epic description (`project-context` mode `test-plan` writes it). The sync caches it at `.context/PBI/qa-artifacts/master-test-plan.md`, so there is no committed MTP file (ADR-0007).

> **TMS configuration**: modality (Xray vs Jira-native) is derived from `.agents/project.yaml` `testing.tms_cli`. Regression Epic and label taxonomy are auto-discovered live by `/test-documentation` Phase 0 + Preflight. Jira/Xray setup lives in `docs/core/setup/jira-xray.html`; the IQL methodology narrative is the official site, https://upexgalaxy.com/metodologia.

Workflow instructions and role-specific guidelines (TAE, QA, MCP usage) live inside agent skills under `.agents/skills/`.

### .agents/skills/ - AI Operations Center

Every repo skill is committed here. OpenCode and Codex read this directory directly; Claude Code reaches it through the generated `.claude/skills` alias (§2.1). The list of skills, with tier, kind and compact rules, is `.agents/skills/REGISTRY.md` (generated by `bun run skills:registry`); community skills installed by `cli/install.ts` share the same store but are not committed. Context skills (`metadata.kind: context`) hold the AI's synthesis of the project: the context map skills (`CONTEXT_MAP_SKILLS` in `cli/lib/context-maps.ts`) each carry one HTML map, read with `bun run context:map <slug>`.

**Key Skills**:
- `agentic-qa-core` - Passive reference host cited by other skills (no direct invocation)
- `/test-automation` - KATA test writing pipeline
- `/sprint-testing` - End-to-end in-sprint QA
- `/project-discovery` - Generates the domain map (`business-domain-context`) and the infra map (`infra-context`), plus `.context/project-config.md`
- `/framework-development` - Evolves the boilerplate itself (KATA bases, fixtures, cli/, scripts/)

### docs/ - Human Documentation

```
docs/
├── index.html      → Portal: sidebar built from each page's <title> + meta description
├── assets/         → Shared docs.css / docs.js and the IQL diagrams
├── core/           → Shipped by the boilerplate, synced by `bun run up`; its pages are the portal sidebar
│   └── empezar-aqui.html   → Start here (also `bun run onboarding`)
└── <any other folder>/     → Project-owned pages, never written by the updater
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
| `AGENTS.md` | Project memory, loaded every session — the only instruction body |
| `CLAUDE.md` | One-line shim (`@AGENTS.md`) so Claude Code reaches `AGENTS.md`. Never holds prose of its own |
| `.agents/hooks/personality-reinject.mjs` | Shared hook emitter; the three harness adapters call into it |
| `.agents/project.yaml` | Tool-agnostic project variables (`{{VAR}}` source of truth) |
| `.agents/jira-required.yaml` | Manifest of Jira custom fields the methodology requires |
| `.agents/jira-fields.json` | Auto-generated catalog of the workspace's Jira fields (`{{jira.<slug>}}` resolution) |
| `agentic-qa-core/SKILL.md` | Foundation skill: bootstrap + shared references for every workflow skill |
| `.context/ADR/README.md` | Test-architecture decision log — when to write one, status lifecycle, index (append-only) |
| `/test-automation` skill | Entry point for writing tests (KATA) |
| `/sprint-testing` skill | QA workflow orchestrator (plan + execute + report) |
| `/project-discovery` skill | Generate project documentation + `.context/` |

---

## 6. Workflow Overview

### One-Time Setup (Discovery)

```
Phase 0: Foundation      → bun run agents:setup   (interactive walkthrough of .agents/project.yaml)
                          bun run jira:sync-fields (catalog Jira workspace fields)
                          bun run jira:check     (validate against jira-required.yaml manifest)
                          bun run vars:check     (verify every {{VAR}} and {{jira.<slug>}} resolves)
Phase 1: Constitution    → Understand the business       (business-domain-context map)
Phase 2: Architecture    → Architecture, NFRs, services   (infra-context map)
Phase 3: Infrastructure  → Map technical stack            (infra-context map)
Phase 4: Specification   → Backlog connection check       (bun run jira:check, writes no file)
```

> Foundation files (`AGENTS.md`, `.agents/`, `scripts/`, `package.json`) ship with the boilerplate — clone the full repo rather than bootstrapping per project.

**Output**: Populated `.agents/` config, the `business-domain-context` and `infra-context` maps, and `.context/project-config.md`.

### Context Generators

After discovery, run these `project-context` modes (orchestrated by `/project-discovery` or invoked one by one; each mode is independent):

```
/project-context data       → .agents/skills/business-data-context/references/business-data-map.html
/project-context e2e        → .agents/skills/business-e2e-context/references/business-e2e-map.html
/project-context api        → .agents/skills/business-api-context/references/business-api-map.html
/project-context test-plan  → QA Master Test Plan Epic in Jira (cache: .context/PBI/qa-artifacts/master-test-plan.md)
bun run api:sync            → api/schemas/ (TypeScript types from OpenAPI)
```

The maps are HTML: a human opens them in a browser or in `bun run docs` (folder "Mapas de contexto"); the AI reads them with `bun run context:map <slug> [--section <id>]`, never raw. A second run regenerates only the stale sections.


> **`.context/ADR/` is the exception — append-only, never regenerated.** Architecture Decision Records are the one `.context/` artifact that is authored (by a human QA architect, or an AI workflow drafting for human approval — `/project-discovery` architecture/infra phases, `/framework-development`, `/sprint-testing` + `/test-automation` Stage 1) and **never re-run**. Each captures one important, hard-to-reverse test-architecture decision (runner, fixtures, isolation, auth-in-tests, selector contract, flake policy). Superseded by a newer ADR that links back — never overwritten or deleted. See `.context/ADR/README.md`.

### QA Stages (Per User Story)

| Stage | Activity | Skill |
|-------|----------|-------|
| **Stage 0** | Pre-sprint Shift-Left: AC refinement on backlog Stories, gap-spotting, pre-sprint ATP (outline maturity, authored into the `{{jira.acceptance_test_plan}}` field; the Test Plan item is created by `/sprint-testing` Stage 1), batch grooming | `/shift-left-testing` |
| **Stage 1** | Planning (in-sprint, AC validation, full ATP; short-circuits the early planning phases when a recent Stage 0 pass exists, window in `/sprint-testing`) | `/sprint-testing` |
| **Stage 2** | Execution (exploratory + smoke + trifuerza) | `/sprint-testing` |
| **Stage 3** | Reporting (ATR, QA comment, bug reports) | `/sprint-testing` |
| **Stage 4** | TMS documentation + ROI prioritization (Candidate / Manual / Deferred) | `/test-documentation` |
| **Stage 5** | Automation: plan → code → review (KATA on Playwright + TS) | `/test-automation` |
| **Stage 6** | Regression execution + failure classification + GO/NO-GO | `/regression-testing` |
| **Onboarding** | 4-phase reverse-engineering of an existing target repo | `/project-discovery` + `/test-framework-adaptation` |

---

## 7. Orchestration as Context Engineering

Token efficiency is not just about which files to load — it is also about which agent loads them. Subagent dispatch is a context-engineering tool: the main conversation stays lean and acts as command center, while focused subagents do heavy reading and work in their own context.

The orchestration doctrine has a few shared assets, all hosted by `agentic-qa-core`:

| Asset | Path | Role |
|-------|------|------|
| **Orchestration doctrine** | `agentic-qa-core/references/orchestration-doctrine.md` | Cacheable mirror of `AGENTS.md` §3 "Orchestration Mode". Subagents load this instead of pulling the full `AGENTS.md`. |
| **Briefing template** | `agentic-qa-core/references/briefing-template.md` | The canonical 7-component briefing format (Goal / Context docs / Project Standards (auto-resolved) / Skills to load / Exact instructions / Report format / Rules) with one filled example per dispatch pattern. |
| **Dispatch patterns** | `agentic-qa-core/references/dispatch-patterns.md` | Decision guide and heuristic for picking Single / Sequential / Parallel / Background. |
| **Skill Resolver Protocol** | `agentic-qa-core/references/skill-resolver.md` + `.agents/skills/REGISTRY.md` | Build-once-per-session compact-rules cache. Orchestrator runs `bun run skills:registry`, then pastes per-skill "Compact Rules" blocks into every briefing under `Project Standards (auto-resolved)`. Subagents trust these and skip re-reading full `SKILL.md`. Validated by `bun run skills:registry:check`. |

Each stage-owning workflow skill (frontmatter `metadata.stage_owner: true`; `.agents/skills/REGISTRY.md` shows which) declares **its own dispatch points** in a `## Subagent Dispatch Strategy` section of its `SKILL.md`. That table maps each stage to its dispatch pattern and subagent role, so the AI knows up-front when to delegate and how to brief. `bun run skills:check` (`STAGE-OWNER-DISPATCH`) enforces the section.

Every other skill (reference, utility, generator) is exempt from the dispatch-table requirement: it executes synchronously in-line.

---

## 8. Progressive Loading Strategy

### By Task Type

| Task | Load First | Load If Needed |
|------|------------|----------------|
| **Write E2E or API Test** | `/test-automation` (SKILL.md) | The skill's own `references/` (planning playbook, KATA patterns, etc.) |
| **Pre-sprint AC refinement / backlog grooming** | `/shift-left-testing` (SKILL.md) + the business context maps (`bun run context:map <slug>`) | Skill `references/` (backlog-selection, refinement-playbook, atp-outline-template) |
| **Exploratory Testing** | `/sprint-testing` (SKILL.md) + `.context/PBI/qa-artifacts/master-test-plan.md` | Skill `references/` (exploration patterns, session entry points) |
| **Understand System** | `bun run context:map business-data-context` (and `business-api-context`, `business-e2e-context`) | `bun run context:map business-domain-context` (vocabulary), `bun run context:map infra-context` (stack, environments) |
| **Use MCP** | `AGENTS.md` §5 "MCPs (decision rules)" + §6 "Tool Resolution" | The owning CLI skill (`/acli`, `/xray-cli`, `/playwright-cli`) |

### By Role

| Role | Primary Skill(s) |
|------|------------------|
| **Project Onboarding** | `/project-discovery` -> `/test-framework-adaptation` |
| **TAE (Test Automation)** | `/test-automation` |
| **QA (Manual Testing)** | `/sprint-testing` + `/test-documentation` |
| **DevOps** | `/regression-testing` |

---

## 9. Token Optimization Tips

### DO

- Load `AGENTS.md` first (automatic on every harness)
- Load task-specific guidelines
- Use skills from `.agents/skills/` for structured tasks
- Reference code in `tests/components/` as living examples
- From subagents, load `agentic-qa-core/references/orchestration-doctrine.md` instead of pulling full `AGENTS.md`

### DON'T

- Load all guidelines at once
- Include full file trees in prompts
- Duplicate information across files
- Load whole context maps for simple test writing (use `--section <id>`)

---

## 10. Maintenance Guidelines

### When to Update AGENTS.md

- Project identity changes
- New MCPs configured — add the server to all three configs (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`), then run `bun run agents:compat:check`
- New CLI tools added
- Testing decisions documented

Never write the update into `CLAUDE.md`: it is a generated one-line shim, and `agents:compat:check` fails when it holds prose.

### When to Update the Harness Adapters

- **New invocation (boilerplate)** → add a mode to the owning skill's `## Mode routing` section. There is no command layer to generate
- **Project-owned command (a downstream project)** → a plain file under `.claude/commands/` or `.opencode/commands/`, edited by hand. One named like a repo skill fails `agents:compat:check`, and `bun run agents:compat` moves it to `.backups/shadowing-commands/`
- **New MCP server** → declare it in `.mcp.json` first, then mirror it in `opencode.jsonc` and `.codex/config.toml` with the same `.env` dependencies (Codex: `env_vars` / `bearer_token_env_var`, never `${VAR}`). `agents:compat:check` names the server and the host that lacks it
- **New or renamed skill** → create it under `.agents/skills/`. Nothing else to do: OpenCode and Codex read it directly, Claude Code sees it through the generated alias
- **Hook contract text changes** → edit `.agents/hooks/personality-reinject.mjs` only. The three adapters call into it and stay untouched

### When to Update Skills

- Framework patterns or conventions change (update the relevant skill's `references/`)
- Workflow steps change (update the SKILL.md orchestration)
- New outputs required or better instructions discovered

### When to Record an ADR

- A hard-to-reverse **test-architecture** decision is made (test runner, fixture / test-data strategy, isolation & parallelization model, auth-in-tests, selector contract, flake-retry policy)
- It passes the two-gate test (architectural **AND** hard to reverse) → author `.context/ADR/ADR-NNNN-<slug>.md` (append-only; supersede, never edit). AI drafts `Proposed`; the human approves → `Accepted`
- Ticket-local test trade-offs stay in the ticket's plan, not an ADR. Detection + authoring: `agentic-qa-core/references/adr-doctrine.md`; convention: `.context/ADR/README.md`

---

## Related Documentation

- **AGENTS.md** - Operational context (project root), loaded by all three harnesses
- **README.md** - Project overview for humans
- `.agents/README.md` - Variable resolution contract (`{{VAR}}`, `<<VAR>>`, `{{jira.<slug>}}`)
- `.context/ADR/README.md` - Test-architecture decision records (when to write one, status lifecycle, index)
- `/test-automation` skill - KATA Architecture entry point
- `.agents/skills/` - Workflow skills (each one self-describes via its SKILL.md)

---

> **You are here**: Context Engineering map for AI agents in the QA repo. **Next**: `bun run docs`, then [`docs/core/metodologia/este-repo.html`](docs/core/metodologia/este-repo.html).
