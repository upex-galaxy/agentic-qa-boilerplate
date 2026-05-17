---
name: agentic-qa-onboard
description: "Walks new users through this repo's QA flow — Playwright + KATA + Allure + Xray stack, Jira QA workflow (Ready For QA → In Testing → Tested → Closed), /sprint-testing for in-sprint manual QA, /test-documentation for TMS test cases, /test-automation for KATA-compliant E2E/API tests, /regression-testing for CI suite execution, /sdd-* for spec-driven framework refactors, MCPs available (Context7, Tavily, Atlassian, Playwright, DBHub, OpenAPI, Postman), critical env vars. Triggers on: `onboard me to QA`, `explain this QA repo`, `first time using this`, `primer vez en QA`, `/agentic-qa-onboard`. Do NOT use for: feature QA on a ticket (use /sprint-testing), authoring test cases in TMS (use /test-documentation), writing automated tests (use /test-automation), running regression suites (use /regression-testing)."
license: MIT
compatibility: [claude-code, opencode]
phase: bootstrap
complementary_categories: [meta-skill]
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # high-leverage architectural work
  planning: sonnet       # structured writing
  implementation: sonnet # default for code work
  review: opus           # critical analysis
  archive: haiku         # mechanical close-out
-->

# Agentic QA Onboard — First-time tour of this repo

Activate when a user lands on this repo for the first time and asks "where do I start?", "how does QA work here?", or invokes `/agentic-qa-onboard`. The skill is a guided tour, not an executor: it explains the stack, the QA pipeline (Stages 1-6), the MCPs, and the env vars that everything depends on, then hands off to the right downstream skill.

This skill complements `/sdd-onboard` (installed via gentle-ai). `/sdd-onboard` walks users through the SDD spec-driven loop in the abstract; `/agentic-qa-onboard` is specific to **this** Playwright + KATA QA boilerplate and points at the concrete entry points (`/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`).

---

## Welcome

This is the **Agentic QA Boilerplate** — a QA-only boilerplate for testing web applications with AI agents in the loop. The repo ships skills, scripts, and conventions that turn a Jira QA ticket into documented test cases and automated regression coverage through a structured 6-stage pipeline. It does **not** ship the application under test — that lives in a separate target repo (configured via `.agents/project.yaml`).

If you cloned this repo and you don't yet have `bun run setup` complete, start there. Everything else assumes the foundation is green.

---

## Stack

| Layer       | Choice                                       |
| ----------- | -------------------------------------------- |
| Framework   | Playwright (E2E + API)                       |
| Architecture| KATA (TestContext / Base / Domain / Fixture) |
| Reporting   | Allure                                       |
| TMS         | Jira + Xray Cloud                            |
| Language    | TypeScript (strict mode)                     |
| Runtime     | bun                                          |
| Lint/format | ESLint + Prettier (pre-commit hooks)         |
| AI agent    | Claude Code (primary), OpenCode (alt)        |

The stack is intentionally locked. If your QA project needs a different stack (Cypress, Robot Framework, etc.), this boilerplate is not the right starting point — the KATA architecture is Playwright-specific.

---

## First-time setup

Run the interactive installer once after cloning:

```bash
bun run setup
```

This bootstraps `.agents/`, installs gentle-ai skills (14 of them), configures the 7 canonical MCPs, downloads Playwright browsers, and writes `.mcp.json`. Full details in [`INSTALLER.md`](../../../INSTALLER.md).

After setup, fill `.env` with the credentials the rest of the workflow expects (see "Critical env vars" below).

---

## Primary pipeline: Stages 1-6

The QA work in this boilerplate is organized as a 6-stage pipeline. Each stage maps to a skill.

| Stage | Skill                  | What happens                                                                              |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------- |
| 1-3   | `/sprint-testing`      | Per-ticket: Planning → Execution → Reporting. Smoke + trifuerza (UI/API/DB) exploration. |
| 4     | `/test-documentation`  | Document test cases in TMS (Test/ATP/ATR). ROI prioritization (Candidate/Manual/Deferred).|
| 5     | `/test-automation`     | KATA-compliant E2E + API tests on Playwright. Plan → Code → Review.                       |
| 6     | `/regression-testing`  | CI suite execution. Failure classification. GO/CAUTION/NO-GO release verdict.             |

**Jira QA state machine:**

```
Ready For QA → In Testing → Tested → Closed
```

(For bugs found during QA: `Open → In Progress → Resolved → Closed` after fix verification.)

`/sprint-testing` orchestrates Stages 1-3. Stage 4 onwards are explicit hand-offs.

### Stage 1-3 example flow

`/sprint-testing UPEX-277`:

1. Reads the ticket from Jira via `/acli`.
2. Loads module context from `.context/PBI/{module}/`.
3. Explores the relevant code in the target repo.
4. Creates the PBI folder and ATP (Acceptance Test Plan).
5. Executes smoke + trifuerza exploration (UI / API / DB).
6. Files ATR (Acceptance Test Report) + bug reports if defects found.
7. Transitions the ticket through QA states.
8. Hands off to Stage 4 (`/test-documentation`) when a Candidate test case should be promoted to TMS.

You confirm at the gates.

---

## When to use `/sdd-*` instead

Hand-off matrix copied from [`INSTALLER.md`](../../../INSTALLER.md):

| When                                                                       | Skill                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Routine in-sprint QA on a Jira ticket (most cases)                         | `/sprint-testing` (ticket-driven)                                    |
| Large refactor of the test framework / KATA architecture / fixture model   | `/sdd-*` (spec-driven, explore → propose → spec → design → …)        |
| Story with detailed AC you want traced formally as a test specification    | Both: `/sdd-spec` first, then `/sprint-testing` for the cycle        |

If the change feels like a research project (alternatives to compare, multiple modules of the test suite touched, no ticket because it's internal infrastructure), reach for `/sdd-explore` first. Otherwise, stick with `/sprint-testing`.

---

## MCPs available

Seven canonical MCPs ship with the boilerplate:

| MCP        | Use it for                                                              |
| ---------- | ----------------------------------------------------------------------- |
| Context7   | Official library docs (Playwright, KATA-relevant TS, Allure…)           |
| Tavily     | Web search, troubleshooting community Q&A                               |
| Atlassian  | Jira ticket reads, transitions, comment posting                         |
| Playwright | Live browser interactions for exploratory QA (when CLI is not enough)   |
| DBHub      | DB queries to validate state-mutating tests                             |
| OpenAPI    | API endpoint exploration, contract checking                             |
| Postman    | Saved request collections, request replay for API tests                 |

**Decision rule:**

- Use **Context7** for "how to use X" — official docs, current API
- Use **Tavily** for "how to solve X" — community fixes, troubleshooting
- Use **Atlassian** for ticket operations; for bulk Jira work prefer `/acli`
- Use **Playwright MCP** for ad-hoc live browser interactions; for scripted runs use `/playwright-cli`

`.mcp.json` lives at the repo root and is **gitignored** (it contains secrets).

---

## Critical env vars

Place these in `.env` before running anything that talks to a real environment:

| Var                                              | Used by                                            |
| ------------------------------------------------ | -------------------------------------------------- |
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD`       | Local app login (Playwright fixtures)              |
| `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD`   | Staging smoke tests, manual exploration            |
| `ATLASSIAN_SITE` / `ATLASSIAN_EMAIL` / API token | `acli` Jira CLI + Atlassian MCP                    |
| `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET`          | `bun xray` CLI (Xray Cloud authentication)         |
| `TAVILY_API_KEY`                                 | Tavily MCP                                         |
| `POSTMAN_API_KEY`                                | Postman MCP                                        |

`.env` is **gitignored**. Never commit it. `.agents/project.yaml` (committed) holds non-secret context (URLs, project key, environment names); `.env` holds the matching secrets.

`.mcp.json` is also **gitignored** — it holds the wired-up MCP configuration with secrets resolved.

Verify your config with `bun run vars:check` (should report 0 errors when fully configured).

---

## Local skills (committed in this repo)

| Skill                | Trigger                | Purpose                                                                        |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `agentic-qa-core`    | (auto, cited by other skills) | Passive reference host: briefing template, dispatch patterns, orchestration doctrine, skill-composition strategy |
| `agentic-qa-onboard` | `/agentic-qa-onboard`  | This skill — first-time orientation                                            |
| `project-discovery`  | `/project-discovery`   | 4-phase reverse-engineering of a target project                                |
| `sprint-testing`     | `/sprint-testing`      | Stages 1-3 — per-ticket manual QA loop                                         |
| `test-documentation` | `/test-documentation`  | Stage 4 — TMS test case authoring + ROI                                        |
| `test-automation`    | `/test-automation`     | Stage 5 — KATA + Playwright + TS automation                                    |
| `regression-testing` | `/regression-testing`  | Stage 6 — CI suite execution + GO/NO-GO verdict                                |
| `playwright-cli`     | `/playwright-cli`      | Browser automation CLI helpers                                                 |
| `playwright-best-practices` | `/playwright-best-practices` | Reference skill: flaky-test fixes, POM, accessibility (axe-core), auth/OAuth, fixtures, tags, perf budgets, i18n. Auto-loads alongside `/test-automation` |
| `acli`               | `/acli`                | Atlassian CLI wrapper for Jira/Confluence terminal work                        |
| `xray-cli`           | `/xray-cli`            | Xray Cloud TMS CLI                                                             |
| `git-flow-master`    | (auto on git intents)  | End-to-end Git operator (branch, commit, push, PR, conflict, chained-PR)       |

---

## Skills installed via gentle-ai (user-level)

Run `bun run setup` once to install these at user level. They are not committed in this repo.

| Skill                | Trigger              | Purpose                                       |
| -------------------- | -------------------- | --------------------------------------------- |
| `sdd-init`           | `/sdd-init`          | Initialize SDD context for a project          |
| `sdd-explore`        | `/sdd-explore`       | Investigate an idea / compare approaches      |
| `sdd-propose`        | `/sdd-propose`       | Write a change proposal                       |
| `sdd-spec`           | `/sdd-spec`          | Write requirements + scenarios as delta specs |
| `sdd-design`         | `/sdd-design`        | Architecture + technical design doc           |
| `sdd-tasks`          | `/sdd-tasks`         | Break design into a task checklist            |
| `sdd-apply`          | `/sdd-apply`         | Implement tasks per spec/design               |
| `sdd-verify`         | `/sdd-verify`        | Validate implementation against specs         |
| `sdd-archive`        | `/sdd-archive`       | Sync delta specs into main, close the change  |
| `sdd-onboard`        | `/sdd-onboard`       | Guided SDD walkthrough on real codebase       |
| `skill-registry`     | (auto)               | Build the project-standards compact registry  |
| `judgment-day`       | `/judgment-day`      | Adversarial parallel review (2 blind judges)  |
| `issue-creation`     | `/issue-creation`    | Issue filing workflow (bug + feature)         |

Plus `engram` (persistent memory across sessions). Full details in [`INSTALLER.md`](../../../INSTALLER.md).

> Plus 9 community skills installed via `bunx skills add ... --global` during `bun run setup` (`skill-creator`, `find-skills`, `gh-cli`, `github-actions-docs`, `playwright-cli`, `n8n-skills`, `emil-design-eng`, `ui-ux-pro-max`, `brainstorming`). See `cli/install.ts` `USER_LEVEL_SKILLS` array.

---

## Next steps after the onboard

Run through this checklist before you reach for your first ticket:

- [ ] Did you run `bun run setup`?
- [ ] Did you fill `.env` with your own credentials (`LOCAL_*`, `STAGING_*`, `ATLASSIAN_*`, `XRAY_*`, `TAVILY_API_KEY`, `POSTMAN_API_KEY`)?
- [ ] Did you populate `.agents/project.yaml` (run `bun run agents:setup` if not yet)?
- [ ] Does `bun run vars:check` exit clean (0 errors)?
- [ ] Did you run `bun run jira:check` to verify Jira credentials?
- [ ] Did you run `bun run pw:install` to get Playwright browsers?
- [ ] Do the gentle-ai skills appear in autocomplete (restart your agent if not)?
- [ ] Ready for your first QA ticket: `/sprint-testing <UPEX-XXX>`

If any box is unchecked, fix that first. The downstream skills assume a green foundation.

---

## What this skill does NOT do

- Test a ticket → use `/sprint-testing`
- Document test cases in TMS → use `/test-documentation`
- Write automated tests → use `/test-automation`
- Run a regression suite → use `/regression-testing`
- Discover a brand-new target project → use `/project-discovery`
- Adapt the KATA test architecture to a target stack → use `/adapt-framework`

The onboard tour ends at the moment the user knows which skill to call next. From there, the relevant workflow skill takes over.
