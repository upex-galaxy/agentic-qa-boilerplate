# Integrating gentle-ai with this repo

> **Audience**: QA engineers cloning `agentic-qa-boilerplate` for the first time, or anyone deciding whether to opt into the gentle-ai ecosystem.
> **Read time**: 8 minutes.
> **Status**: stable as of 2026-05-10.

---

## What is gentle-ai and why this repo uses it

[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) is a user-level installer that configures AI agents (Claude Code, OpenCode, Cursor, etc.) with a curated set of skills, an MCP-based persistent memory layer (Engram), and an SDD (Spec-Driven Development) orchestrator. It does not install agents themselves — it tunes the agents you already have.

This repo treats gentle-ai as a **base global "quasi-must-have"**. The recommended onboarding (`bun run setup`) installs it if missing, then layers Engram + 11 SDD skills + 2 universal helpers (judgment-day, issue-creation) + skill-registry on top of your agent. The result is one consistent skillset across every QA repo on your machine that follows this model.

The integration is **not strict**. If you choose to skip gentle-ai, the repo still works: workflow skills committed locally (`/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`, `/agentic-qa-core`, etc.) keep functioning, and the 7 canonical MCPs are still configured. What you lose is the SDD spec-driven loop, persistent cross-session memory, adversarial review, and the issue-filing helper. Section "How to opt out" below details the trade-off.

---

## What gets installed via gentle-ai

When `bun run setup` runs the gentle-ai branch (1 engram component + 14 skills, repeated per agent):

### Engram (MCP component, not a skill)

| Slug     | Type      | What it does                                                                                                |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `engram` | Component | Persistent memory across sessions. Auto-saves decisions, bugs, conventions; auto-recalls on session resume. |

### SDD skills (11)

| Slug             | Brief description                                                                |
| ---------------- | -------------------------------------------------------------------------------- |
| `sdd-init`       | Bootstrap SDD context, detect stack, activate Strict TDD if testing is available |
| `sdd-explore`    | Investigate codebase before committing to a change                               |
| `sdd-propose`    | Create a change proposal (intent, scope, approach)                               |
| `sdd-spec`       | Write requirements + scenarios as delta specs                                    |
| `sdd-design`     | Technical design (architecture decisions, component boundaries)                  |
| `sdd-tasks`      | Break a change into reviewable implementation tasks                              |
| `sdd-apply`      | Implement tasks following specs and design                                       |
| `sdd-verify`     | Validate implementation against specs (tests, edge cases, perf)                  |
| `sdd-archive`    | Sync delta specs into main specs and close the change                            |
| `sdd-onboard`    | Guided end-to-end SDD walkthrough on a real codebase                             |
| `skill-registry` | Build the compact project-standards registry from installed skills               |

### Universal helpers (2)

| Slug             | Brief description                                                          |
| ---------------- | -------------------------------------------------------------------------- |
| `judgment-day`   | Adversarial parallel review — 2 independent judges review the same target  |
| `issue-creation` | Issue filing workflow (bug + feature templates, issue-first enforcement)   |

> The installer dispatches one `gentle-ai install --skill <slug> --agent <agent>` per skill, plus `gentle-ai install --component engram --agent <agent>` for Engram. Re-runs are idempotent: already-installed skills are skipped.

### Why not `cognitive-doc-design` or `comment-writer`?

Both ship via gentle-ai but are dev-writing-leaning. QA reporting tone is owned vertically by `/sprint-testing` (QA comment formats, bug report structure) and `/regression-testing` (stakeholder reports). Adding the dev-writing helpers would create overlap, not value.

---

## What stays local (committed in this repo)

Skills that are workflow-specific to this boilerplate live in `.claude/skills/` and are committed to the repo. They install with the clone — no external installer required.

| Skill                | Trigger                | Why it stays local                                                            |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `agentic-qa-core`    | `/agentic-qa-core init`| Foundation: shared references + bootstrap of `.agents/` and AGENTS.md         |
| `agentic-qa-onboard` | `/agentic-qa-onboard`  | First-time orientation tour (this is the entry point for new contributors)    |
| `project-discovery`  | `/project-discovery`   | 4-phase reverse-engineering of a target project (Constitution → Specification)|
| `sprint-testing`     | `/sprint-testing`      | Stages 1-3: per-ticket manual QA loop (planning, execution, reporting)        |
| `test-documentation` | `/test-documentation`  | Stage 4: TMS test-case authoring + ROI prioritization (Jira/Xray bridge)      |
| `test-automation`    | `/test-automation`     | Stage 5: KATA + Playwright + TS test authoring (plan → code → review)         |
| `regression-testing` | `/regression-testing`  | Stage 6: CI suite execution, failure classification, GO/NO-GO verdict         |
| `playwright-cli`     | `/playwright-cli`      | Browser automation CLI helpers (screenshots, traces, mocking)                 |
| `acli`               | `/acli`                | Atlassian CLI wrapper for Jira/Confluence terminal work                       |
| `xray-cli`           | `/xray-cli`            | Xray Cloud TMS CLI (test creation, executions, JUnit/Cucumber import)         |
| `git-flow-master`    | (auto on git intents)  | End-to-end Git operator (branch, commit, push, PR, conflict, chained-PR)      |

These skills evolve with the repo and are versioned in git. The split is intentional: gentle-ai owns the **horizontal** ecosystem (apply across all your QA repos), this repo owns the **vertical** workflow (specific to the QA stages 1-6 pipeline).

---

## Hand-off matrix — `/sprint-testing` vs `/sdd-*`

This is the most common point of confusion. Both workflows can drive QA work to completion. They serve different shapes of work.

| When                                                                       | Skill                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Routine in-sprint QA on a Jira ticket (most cases)                         | `/sprint-testing` (ticket-driven)                                    |
| Large refactor of the test framework / KATA architecture / fixture model   | `/sdd-*` (spec-driven)                                               |
| Story with detailed AC you want traced formally as a test specification    | Both: `/sdd-spec` first, then `/sprint-testing` for the cycle        |

### When to reach for `/sprint-testing`

The default choice for normal sprint QA. You have a ready-for-QA Jira ticket, AC is reasonably clear, the change is bounded (one feature, one bug fix, one regression). You want the standard cycle: plan, execute trifuerza (UI/API/DB) exploration, run smoke + regression, file ATP/ATR + bug reports, transition the ticket. Nothing about the QA work requires multi-phase architectural design — a clear test plan is enough.

Example: "Test UPEX-277 — empty states on the user-list filter." Ticket is `Ready For QA`, AC is 3 bullets, scope is one component plus one API. `/sprint-testing` drives the whole thing.

### When to reach for `/sdd-*`

The right choice when the change is shaped more like a research project than a ticket. You're touching the test framework architecture (KATA layers, fixtures, Page Object structure), the design space has alternatives worth comparing, the change crosses several modules of the test suite, or there is no ticket because the work is internal QA infrastructure. SDD gives you explicit phases (explore → propose → spec → design → tasks → apply → verify → archive) and an artifact trail that survives across sessions via Engram.

Example: "Replace the auth fixture model — move from per-test login to a shared auth state file with role-based personas." This benefits from `/sdd-explore` (read the current fixture wiring), `/sdd-propose` (compare approaches), and `/sdd-design` (commit to an architecture) before any test code is rewritten.

### When to combine both

You have a QA ticket but the AC is dense and you want it traced formally as a test specification. Run `/sdd-spec` first to lock down the requirements and scenarios as a delta spec, then hand off to `/sprint-testing` for the cycle. The spec gets archived after the ticket closes, leaving a permanent trace for future regression rounds.

---

## Troubleshooting

- **gentle-ai not detected after install** — re-run `bun run setup`. The detector probes `which gentle-ai` plus `gentle-ai version`; if either fails the installer falls back to the "skip gentle-ai" branch. Confirm the binary is on PATH (`which gentle-ai` should return a path under `/usr/local/bin/`, `~/bin/`, `~/go/bin/`, or a Homebrew prefix).
- **MCPs not loading** — open `.mcp.json` in the repo root and check that no `{{VAR_NAME}}` placeholders remain. The installer fills them with values you provided or with placeholders for later. Replace placeholders with real values, or export the env vars in your shell. `.mcp.json` is gitignored.
- **Skills not appearing in autocomplete** — restart Claude Code (or your agent of choice). MCP and skill configs are cached at agent startup.
- **`/agentic-qa-onboard` does not trigger on natural language** — use the explicit slash command: `/agentic-qa-onboard`. The natural-language triggers (`onboard me to QA`, `primer vez en QA`) are advisory, not guaranteed.
- **How do I uninstall gentle-ai skills?** — `gentle-ai uninstall --skill <slug> --agent <agent>` removes a single skill. `gentle-ai uninstall --all --agent <agent>` removes everything gentle-ai-managed for that agent. Backups are created automatically before uninstall.

---

## How to opt out

If you prefer not to use gentle-ai, the installer accepts a "skip" choice. To make it permanent:

1. Edit `.agents/install-state.json` and set `"gentleAi": { "status": "skipped" }`.
2. Re-run `bun run setup`. The installer detects the skipped state and only configures the 7 canonical MCPs.

What you lose:

- **SDD spec-driven loop** — `/sdd-*` skills are not installed. Large test-framework refactors fall back to ad-hoc planning.
- **Persistent memory (Engram)** — no cross-session recall, no `mem_save` / `mem_search`. Each session starts blind.
- **Adversarial review (judgment-day)** — no parallel-judges review for high-stakes test framework changes. Code review reverts to single-perspective.
- **Issue creation (issue-creation)** — no issue-first enforcement helper. You file QA bugs however your team usually does.

What you keep: every workflow skill committed in this repo (`/sprint-testing`, `/test-documentation`, `/test-automation`, `/regression-testing`, `/agentic-qa-core`, `/agentic-qa-onboard`, `/playwright-cli`, `/acli`, `/xray-cli`, `/project-discovery`, `/git-flow-master`) and the 7 canonical MCPs (Context7, Tavily, Atlassian, Playwright, DBHub, OpenAPI, Postman). The repo is fully usable without gentle-ai — the integration is additive.

---

## See also

- [AGENTS.md § Quick Start](../../AGENTS.md) — entry point for `bun run setup` and `/agentic-qa-onboard`
- [.claude/skills/agentic-qa-onboard/SKILL.md](../../.claude/skills/agentic-qa-onboard/SKILL.md) — the orientation skill itself
- [docs/setup/README.md](./README.md) — index of setup guides in this repo
- [docs/setup/jira-setup-guide.md](./jira-setup-guide.md) — Jira/Atlassian credentials + acli login flow
- [docs/setup/mcp-dbhub.md](./mcp-dbhub.md) / [mcp-openapi.md](./mcp-openapi.md) — MCP-specific setup notes
