---
name: agentic-qa-onboard
description: "Walks new users through this repo's QA flow — Playwright + KATA + Allure + Xray stack, Jira QA workflow (Ready For QA → In Testing → Tested → Closed), /sprint-testing for in-sprint manual QA, /test-documentation for TMS test cases, /test-automation for KATA-compliant E2E/API tests, /regression-testing for CI suite execution, /framework-development for boilerplate evolution, MCPs available (Context7, Tavily, Atlassian, Playwright, DBHub, OpenAPI, Postman), critical env vars. Triggers on: `onboard me to QA`, `explain this QA repo`, `first time using this`, `primer vez en QA`, `/agentic-qa-onboard`. Do NOT use for: feature QA on a ticket (use /sprint-testing), authoring test cases in TMS (use /test-documentation), writing automated tests (use /test-automation), running regression suites (use /regression-testing)."
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

This skill is specific to **this** Playwright + KATA QA boilerplate and points at the concrete entry points (`/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`, `/framework-development`).

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

This bootstraps `.agents/`, installs the gentle-ai `engram` component (minimal preset), configures the 7 canonical MCPs, downloads Playwright browsers, installs 8 user-level community skills + 2 project-level Playwright skills, and writes `.mcp.json`. Full details in [`INSTALLER.md`](../../../INSTALLER.md).

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

## When to use `/framework-development` instead

| When                                                                       | Skill                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Routine in-sprint QA on a Jira ticket (most cases)                         | `/sprint-testing` (ticket-driven)                                    |
| Authoring new automated test for a Candidate TC                            | `/test-automation`                                                   |
| Refactor of the boilerplate itself — KATA bases, fixtures, cli/, scripts/  | `/framework-development`                                             |

`/framework-development` covers framework evolution (changes to the boilerplate's own infrastructure, not per-ticket test writing). Self-contained Plan → Code → Verify → Archive pipeline; works under the minimal install preset (no SDD-* skills required).

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
| `judgment-day`       | `/judgment-day`, `juzgar` | Vendored from gentle-ai (Apache-2.0). Adversarial dual-judge review (2 blind judges in parallel, fix loop, re-judge). Optional gate cited by `/test-automation` Phase 3 + `/git-flow-master` pre-PR. |

---

## What `bun run setup` installs via gentle-ai

`bun run setup` runs `gentle-ai install --preset minimal` — installs ONLY the **`engram`** component (persistent memory binary + MCP adapter + agent config). No SDD-* skills, no foundation skills.

Rationale: this repo already covers Plan → Code → Verify natively in its workflow skills (`/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`). SDD ceremony does not apply to test authoring.

Want the explicit SDD ceremony for an architectural change of your own? Run manually:

```bash
gentle-ai install --components engram,sdd --agent <claude-code|opencode|cursor>
```

Full details in [`INSTALLER.md`](../../../INSTALLER.md).

## Community skills installed at user level

`bun run setup` also runs `bunx skills add --global` for 8 cross-project skills:

| Skill | Source | Use |
| --- | --- | --- |
| `skill-creator` | anthropics/skills | Create / edit / measure skills |
| `find-skills` | vercel-labs/skills | Discover installable skills |
| `gh-cli` | github/awesome-copilot | GitHub CLI patterns |
| `github-actions-docs` | xixu-me/skills | GitHub Actions reference |
| `brainstorming` | obra/superpowers | Pre-implementation discovery |
| `cli-printing-press` | mvanhorn/cli-printing-press | CLI report rendering |
| `html-ppt` | lewislulu/html-ppt-skill | HTML presentation authoring |
| `resend-cli` | resend/resend-skills | Email automation CLI |

Plus 2 project-level community skills installed into `.claude/skills/` (not committed): `playwright-cli`, `playwright-best-practices`. See `cli/install.ts` `PROJECT_LEVEL_SKILLS` and `USER_LEVEL_SKILLS` arrays.

---

## Next steps after the onboard

Run through this checklist before you reach for your first ticket:

- [ ] Did you run `bun run setup`?
- [ ] Did you fill `.env` with your own credentials (`LOCAL_*`, `STAGING_*`, `ATLASSIAN_*`, `XRAY_*`, `TAVILY_API_KEY`, `POSTMAN_API_KEY`)?
- [ ] Did you populate `.agents/project.yaml` (run `bun run agents:setup` if not yet)?
- [ ] Does `bun run vars:check` exit clean (0 errors)?
- [ ] Did you run `bun run jira:check` to verify Jira credentials?
- [ ] Did you run `bun run pw:install` to get Playwright browsers?
- [ ] Does engram persistent memory respond (try `mem_context` after restart)?
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
