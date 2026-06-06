---
name: agentic-qa-onboard
description: "Walks new users through this repo's QA flow — Playwright + KATA + Allure + Xray stack, Jira QA workflow (Backlog → Shift-Left QA → Estimation → Ready For Dev → Ready For QA → In Testing → Tested → Closed), /shift-left-testing for pre-sprint AC refinement on backlog Stories, /sprint-testing for in-sprint manual QA, /test-documentation for TMS test cases, /test-automation for KATA-compliant E2E/API tests, /regression-testing for CI suite execution, /framework-development for boilerplate evolution, MCPs available (Context7, Tavily, Atlassian, Playwright, DBHub, OpenAPI, Postman), critical env vars. ALSO the front desk for anyone who is lost or wants to understand how the repo or any workflow skill works — conceptually AND visually: it explains in plain human language (suspending caveman/compressed register) and can open per-skill how-it-works presentations (English + Spanish) in the user's default browser after asking. Triggers on: `onboard me to QA`, `explain this QA repo`, `first time using this`, `primer vez en QA`, `/agentic-qa-onboard`, `I don't know how to use this`, `how does sprint-testing / test-automation work`, `how does this skill work`, `show me how it works`, `teach me how QA works here`, `walk me through this skill`, `no sé cómo usar esto`, `no entiendo cómo funciona el repo`, `cómo funciona este skill`, `explícame cómo funciona`, `enséñame cómo se hace`. Do NOT use for: pre-sprint refinement (use /shift-left-testing), feature QA on a ticket (use /sprint-testing), authoring test cases in TMS (use /test-documentation), writing automated tests (use /test-automation), running regression suites (use /regression-testing)."
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

Activate when a user lands on this repo for the first time and asks "where do I start?", "how does QA work here?", or invokes `/agentic-qa-onboard`. The skill is a guided tour, not an executor: it explains the stack, the QA pipeline (pre-sprint Stage 0 + in-sprint Stages 1-6), the MCPs, and the env vars that everything depends on, then hands off to the right downstream skill.

This skill is specific to **this** Playwright + KATA QA boilerplate and points at the concrete entry points (`/shift-left-testing`, `/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`, `/framework-development`).

---

## Teaching mode — when someone is lost or wants to understand a skill

This skill is also the **front desk** for anyone who is confused: *"I don't know how to use this"*, *"how does `/sprint-testing` actually work?"*, *"what does this repo even do?"*, *"explain test-automation to me"*, *"no entiendo cómo funciona esto"*. When that happens, step into the scene as a friendly guide and follow these rules:

1. **Speak like a human, not a terminal.** For the whole explanation, **suspend any compressed / caveman register** — full sentences, warm tone, simple words, zero unexplained jargon. Define each technical term the first time you use it ("an ATC — basically one complete test case, start to finish"). This is an explicit in-skill override of the default register; resume your normal style once the person is oriented.
2. **Mirror the user's language.** Spanish in → explain in Spanish (the repo ships Spanish versions of every presentation — see below). English in → English.
3. **Start from where they are.** If the goal is unclear, ask ONE quick question ("are you trying to test a ticket, or understand the whole flow?"). Don't dump all six stages on someone who asked about one.
4. **Concept first, in plain words** — what the activity is and *why* it matters — before any command, flag, or file path.
5. **Then offer the visual presentation.** Each workflow skill has a `how-it-works` deck that teaches the activity as a craft (Part 1) and then how the AI does it from the terminal (Part 2). Offer to open it in their browser — follow the opening protocol below.
6. **Hand off when oriented.** Once they know which skill to call, point them at it and step back.

---

## How-it-works presentations (visual, in the browser)

Five of the workflow skills ship a **self-contained HTML presentation** that teaches the activity twice: **Part 1 "The Craft"** (how a QA engineer does it by hand, step by step) and **Part 2 "The Acceleration"** (how the skill makes the AI do it from the terminal). The `xray-cli` skill ships a sixth deck of a different kind — a **concept primer** that explains Xray itself from zero (what it is, its six issue types, the natural flow, coverage, traceability, defects). Each exists in **English and Spanish** (technical terms stay in English in both).

| Skill / activity         | English deck                                            | Spanish deck                                              |
| ------------------------ | ------------------------------------------------------- | --------------------------------------------------------- |
| Shift-Left Testing       | `.claude/skills/shift-left-testing/how-it-works.html`   | `.claude/skills/shift-left-testing/how-it-works.es.html`  |
| Sprint Testing           | `.claude/skills/sprint-testing/how-it-works.html`       | `.claude/skills/sprint-testing/how-it-works.es.html`      |
| Test Documentation & ROI | `.claude/skills/test-documentation/how-it-works.html`   | `.claude/skills/test-documentation/how-it-works.es.html`  |
| Test Automation (KATA)   | `.claude/skills/test-automation/how-it-works.html`      | `.claude/skills/test-automation/how-it-works.es.html`     |
| Regression & GO/NO-GO    | `.claude/skills/regression-testing/how-it-works.html`   | `.claude/skills/regression-testing/how-it-works.es.html`  |
| Xray for Jira (concept)  | `.claude/skills/xray-cli/how-it-works.html`             | `.claude/skills/xray-cli/how-it-works.es.html`            |

Single files (CSS + JS inlined) — they open by double-click, no server. Navigate with `←` `→`, `S` for speaker notes, `O` for the slide overview, `F` for fullscreen.

### Opening protocol (ALWAYS ask first)

Opening a deck launches the user's default browser — an outward, local action — so **never open one without asking, and open only ONE at a time.**

1. **Announce + ask.** "I can open a short visual deck that walks through how `/sprint-testing` works — first the manual craft, then how the skill does it from the terminal. Want me to open it in your browser?"
2. **Match the language** of the conversation: Spanish user → the `.es.html` file; English user → the `.html` file.
3. **On a yes, open exactly one deck** (pick the OS command for the user's platform):
   ```bash
   open ".claude/skills/sprint-testing/how-it-works.es.html"     # macOS  → default browser
   xdg-open ".claude/skills/sprint-testing/how-it-works.es.html" # Linux
   start "" ".claude/skills/sprint-testing/how-it-works.es.html" # Windows
   ```
4. **One at a time.** Let the person watch and come back with questions before offering the next skill's deck. Do not batch-open several.
5. **After it opens,** tell them the keys (`←` `→` to move, `S` for speaker notes) and offer to walk the slides together or answer questions as they go.

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

This bootstraps `.agents/`, installs the gentle-ai `engram` component (minimal preset), configures the 7 canonical MCPs, downloads Playwright browsers, installs 6 user-level community skills + 3 project-level community skills, and writes `.mcp.json`. Full details in [`INSTALLER.md`](../../../INSTALLER.md).

After setup, fill `.env` with the credentials the rest of the workflow expects (see "Critical env vars" below).

---

## Primary pipeline: Stage 0 (pre-sprint) + Stages 1-6 (in-sprint)

The QA work in this boilerplate runs in two halves: a pre-sprint Shift-Left grooming phase, then a 6-stage in-sprint pipeline per ticket. Each stage maps to a skill.

| Stage | Skill                  | When                | What happens                                                                              |
| ----- | ---------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| 0     | `/shift-left-testing`  | PRE-SPRINT (batch)  | AC refinement on N backlog Stories, gap-spotting, ATP DRAFT outlines, transition `backlog → shift_left_qa → estimation`. Adds label `shift-left-reviewed`. |
| 1-3   | `/sprint-testing`      | IN-SPRINT (ticket)  | Per-ticket: Planning → Execution → Reporting. Smoke + trifuerza (UI/API/DB) exploration. Short-circuits Phases 1-3 if Stage 0 ran <30 days ago. |
| 4     | `/test-documentation`  | IN-SPRINT (post-QA) | Document test cases in TMS (Test/ATP/ATR). ROI prioritization (Candidate/Manual/Deferred).|
| 5     | `/test-automation`     | POST-SPRINT         | KATA-compliant E2E + API tests on Playwright. Plan → Code → Review.                       |
| 6     | `/regression-testing`  | PRE-RELEASE         | CI suite execution. Failure classification. GO/CAUTION/NO-GO release verdict.             |

**Jira QA state machine:**

```
Backlog → Shift-Left QA → Estimation → Ready For Dev → In Progress → In Review → Ready For QA → In Testing → Tested → Closed
```

`/shift-left-testing` drives the upstream transitions (Backlog → Shift-Left QA → Estimation). `/sprint-testing` drives the downstream ones (Ready For QA → In Testing → Tested). PO/Dev lead drive the middle leg (Estimation → Ready For Dev → In Progress → In Review).

(For bugs found during QA: `Open → In Progress → Resolved → Closed` after fix verification.)

`/sprint-testing` orchestrates Stages 1-3. Stage 4 onwards are explicit hand-offs.

### Stage 1-3 example flow

`/sprint-testing UPEX-277`:

1. Syncs the ticket from Jira via `bun run jira:sync-issues get <KEY> --include-comments` (canonical detailed read — `acli view` returns null for custom fields), then reads the materialized `.md` files.
2. Loads the synced context from `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (Module = Epic; Jira-synced files are a read-only cache).
3. Explores the relevant code in the target repo.
4. Authors the ATP (Acceptance Test Plan) → writes it to the Jira field (or fallback comment) → re-syncs; hand-writes only NON-Jira files (context.md, evidence/).
5. Executes smoke + trifuerza exploration (UI / API / DB).
6. Files ATR (Acceptance Test Report) + bug reports if defects found.
7. Transitions the ticket through QA states.
8. Hands off to Stage 4 (`/test-documentation`) when a Candidate test case should be promoted to TMS.

You confirm at the gates.

---

## When to use `/framework-development` instead

| When                                                                       | Skill                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Pre-sprint AC refinement / batch grooming of backlog Stories               | `/shift-left-testing` (Stage 0)                                      |
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
- Use **Atlassian**/`/acli` for ticket WRITES (create, transition, comment, link); for detailed READS (custom fields, ACs, ATP/ATR, comments) use `bun run jira:sync-issues get`/`jql`
- Use **Playwright MCP** for ad-hoc live browser interactions; for scripted runs use `/playwright-cli`

`.mcp.json` lives at the repo root and is **gitignored** (it contains secrets).

---

## Critical env vars

Place these in `.env` before running anything that talks to a real environment:

| Var                                              | Used by                                            |
| ------------------------------------------------ | -------------------------------------------------- |
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD`       | Local app login (Playwright fixtures)              |
| `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD`   | Staging smoke tests, manual exploration            |
| `ATLASSIAN_URL` / `ATLASSIAN_EMAIL` / API token  | `acli` Jira CLI + Atlassian MCP                    |
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
| `shift-left-testing` | `/shift-left-testing`  | Stage 0 — pre-sprint AC refinement on a batch of backlog Stories. Drafts ATP, transitions `backlog → shift_left_qa → estimation`. |
| `sprint-testing`     | `/sprint-testing`      | Stages 1-3 — per-ticket manual QA loop. Short-circuits Phases 1-3 when label `shift-left-reviewed` is fresh. |
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

Rationale: this repo already covers Plan → Code → Verify natively in its workflow skills (`/shift-left-testing`, `/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`). SDD ceremony does not apply to test authoring.

Want the explicit SDD ceremony for an architectural change of your own? Run manually:

```bash
gentle-ai install --components engram,sdd --agent <claude-code|opencode|cursor>
```

Full details in [`INSTALLER.md`](../../../INSTALLER.md).

## Community skills installed at user level

`bun run setup` also runs `bunx skills add --global` for 6 cross-project skills:

| Skill | Source | Use |
| --- | --- | --- |
| `skill-creator` | anthropics/skills | Create / edit / measure skills |
| `find-skills` | vercel-labs/skills | Discover installable skills |
| `github-actions-docs` | xixu-me/skills | GitHub Actions reference |
| `brainstorming` | obra/superpowers | Pre-implementation discovery |
| `html-ppt` | lewislulu/html-ppt-skill | HTML presentation authoring |
| `bun` | bun.sh/docs | Bun runtime reference |

Plus 3 project-level community skills installed into `.claude/skills/` (not committed): `playwright-cli`, `playwright-best-practices`, `resend-cli`. See `cli/install.ts` `PROJECT_LEVEL_SKILLS` and `USER_LEVEL_SKILLS` arrays.

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

- Refine backlog Stories pre-sprint → use `/shift-left-testing`
- Test a ticket → use `/sprint-testing`
- Document test cases in TMS → use `/test-documentation`
- Write automated tests → use `/test-automation`
- Run a regression suite → use `/regression-testing`
- Discover a brand-new target project → use `/project-discovery`
- Adapt the KATA test architecture to a target stack → use `/adapt-framework`

The onboard tour ends at the moment the user knows which skill to call next. From there, the relevant workflow skill takes over.
