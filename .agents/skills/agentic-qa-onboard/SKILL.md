---
name: agentic-qa-onboard
description: "Onboards a newcomer to this QA repo: the stack, the IQL stages, MCPs and env vars, then hands off to the right skill. Use when someone is new or lost (\"onboard me\", \"I don't know how to use this\"); asks how a workflow skill works or wants its how-it-works deck; or needs the full setup path for a new project."
license: MIT
compatibility: [claude-code, opencode, codex, pi]
phase: bootstrap
complementary_categories: [meta-skill]
metadata:
  kind: workflow
---

# Agentic QA Onboard: first-time tour of this repo

This skill is a guided tour for someone who just landed on the repo and asks "where do I start?", "how does QA work here?" or runs `/agentic-qa-onboard`. It explains the stack, the QA pipeline (the IQL stages, always by name: Shift-Left before the sprint, then Planning, Execution, Reporting, Documentation, Automation and Regression), the MCPs and the env vars everything depends on. Then it hands off to the downstream skill and steps back.

It is specific to **this** Playwright + KATA QA boilerplate and points at the concrete entry points: `/shift-left-testing`, `/sprint-testing`, `/sprint-conductor`, `/exploratory-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`, `/framework-development`.

---

## Compact Rules

- The skill is a tour, not an executor. It ends the moment the user knows which skill to call; hand off there and step back.
- Leave the downstream work to its owner: pre-sprint refinement is `/shift-left-testing`, per-ticket QA `/sprint-testing`, TMS authoring `/test-documentation`, automated tests `/test-automation`, suite runs `/regression-testing`, a new target repo `/project-discovery`, KATA adaptation `/test-framework-adaptation`.
- When someone is lost or asks how a skill works, drop the terse working register for the whole explanation: full sentences, a warm tone, each technical term defined the first time it appears. Go back to the normal register once they are oriented.
- Explain in the user's language. The visual decks are Spanish (technical terms stay English); every deck also has an English twin, `<name>.en.html`, next to the Spanish file (same slides, same shell). For an English speaker, offer the twin.
- When the goal is unclear, ask one question first (testing a ticket, or understanding the whole flow?). Someone who asked about one stage does not need all of them.
- Name a stage by its word (Shift-Left, Planning, Execution, Reporting, Documentation, Automation, Regression, Observation), never by number. A "Stage N" in an older doc resolves through `agentic-qa-core/references/stage-gates.md`; the why behind the stages is `iql-context`.
- When someone asks about running several sessions at once ("parallelize the sprint", "one session per story", "fleet", "launch workers"), explain the two executors in plain words (a one-shot subagent lives inside the current turn and is the default for almost everything; a supervised worker is a persistent session you keep talking to), then hand off to `/agent-orchestration`. Its deck is https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/user-level-skills/agent-orchestration/how-it-works.es.html (English twin: `.en.html`).
- Explain the concept and why it matters before any command, flag or file path.
- Ask before opening a how-it-works deck, because it launches the user's default browser. Open exactly one, then let them come back with questions before offering the next.
- Prefer the published GitHub Pages URL over the local file: a project scaffolded from this boilerplate may not carry the HTML. Use the local copy offline or on explicit request.
- Route a brand-new project through the ordered 4-phase setup path (foundation, Jira catalogs, discovery + adapt, git Strategy Setup). The joining-an-adapted-project checklist covers phase 1 only.
- State a Jira status or transition only from `.agents/jira-workflows.json`. A status that is not in that file does not exist in the instance.
- Library-docs questions go to Context7, troubleshooting to the `web-search` capability (a harness-level server), ticket WRITES to `/acli`, and detailed ticket READS (custom fields, ACs, ATP/ATR, comments) to the Jira sync script, whose synced `.md` is what you read.
- Leave the stack as it is. Playwright + KATA + Allure + TypeScript + bun is locked, and KATA is Playwright-specific: a project that needs another runner should not start from this boilerplate.

**Read full SKILL.md when**: walking the full 4-phase new-project setup, listing env vars or MCPs in detail, or answering which deck covers a given topic.

---

## Teaching mode: when someone is lost or wants to understand a skill

The skill is also the front desk for anyone confused: "I don't know how to use this", "how does `/sprint-testing` actually work?", "what does this repo even do?". The person should leave understanding, so the Compact Rules about register, language and concept-first apply. In order: start from where they are, give the concept and its why, then offer the skill's `how-it-works` deck (follow the opening protocol below), and once they know which skill to call, point at it and step back. Define jargon at first use ("an ATC, basically one complete test case, start to finish"). When the person wants to learn a topic over several sessions (a course, not a quick explanation), tell them to type `/teach`: it is installed at user level, only a person can start it (no skill can load it), and it keeps its own mission, lessons and learning record in the folder where it runs. Teaching mode stays for quick explanations inside this session.

---

## How-it-works presentations (visual, in the browser)

Most workflow skills ship a self-contained HTML presentation (Spanish with technical terms in English, and an English twin `<name>.en.html` next to it) that teaches the skill as a step-by-step workflow. Two category decks cover a family of skills at once, `agentic-qa-core` adds cross-cutting reference decks, and some skills carry craft or curriculum decks. Every how-it-works deck has the same shape: slide 1 is the cover (`/skill-name`), slide 2 the workflow map (main path plus gates, fallbacks and handoffs), then one phase per slide, closing with handoffs and how to invoke the skill on each host.

Every path below is relative to `packages/decks/`, which is also the published path segment (see "Published site"). `ls packages/decks/` is the source index; the published catalog with a card per deck is the homepage.

### Workflow decks (one per skill)

Every deck has an English twin, `<name>.en.html` in the same folder (`how-it-works.en.html` for the workflow decks). Offer the twin to anyone writing in English.

| Skill / activity | Deck (Spanish) |
| --- | --- |
| First-time tour, this skill itself | `agentic-qa-onboard/how-it-works.es.html` |
| Shift-Left (pre-sprint refinement) | `shift-left-testing/how-it-works.es.html` |
| Planning, Execution, Reporting (sprint QA) | `sprint-testing/how-it-works.es.html` |
| A sprint run as a fleet, watched from the Sprint Board | `sprint-conductor/how-it-works.es.html` |
| Exploration without a ticket (flow, module, sweep) | `exploratory-testing/how-it-works.es.html` |
| Documentation (TMS + ROI) | `test-documentation/how-it-works.es.html` |
| Automation (KATA) | `test-automation/how-it-works.es.html` |
| Regression + GO / CAUTION / NO-GO | `regression-testing/how-it-works.es.html` |
| Annotated bug screenshots | `bug-screenshot-annotation/how-it-works.es.html` |
| Building and publishing a ticket's evidence page | `evidence-artifact/how-it-works.es.html` |
| Reviewing a test-automation PR | `pr-review-lead/how-it-works.es.html` |
| Blind dual review | `judgment-day/how-it-works.es.html` |
| Discovering a new target repo | `project-discovery/how-it-works.es.html` |
| Business maps + the Master Test Plan | `project-context/how-it-works.es.html` |
| Adapting KATA to the target stack | `test-framework-adaptation/how-it-works.es.html` |
| Jira Components + instance migration | `jira-administration/how-it-works.es.html` |
| Branches, commits, PRs, worktrees | `git-flow-master/how-it-works.es.html` |
| Multi-session orchestration | https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/user-level-skills/agent-orchestration/how-it-works.es.html (published from the user skill) |
| Handing a session to a fresh one | `session-handoff/how-it-works.es.html` |
| The user-level skills the installer adds (`mkd`, `humanizer`, `grilling`, `retro` and the rest): the portal, with what each does, who calls it and a link to its own deck | `user-level-skills/how-it-works.es.html` (English twin: `.en.html`) |
| Evolving the boilerplate itself | `framework-development/how-it-works.es.html` |

Each user-level skill from `upex-galaxy/agentic-user-skills` also ships its own deck inside its installed folder: `~/.agents/skills/<name>/how-it-works.es.html` (English twin `.en.html`; `~/.claude/skills/<name>/` when the skills CLI installed it for Claude Code alone). Offer it like any other deck, asking before opening it.

### Category decks (a family of skills)

| User intent | Deck (Spanish) |
| --- | --- |
| "Where does the AI's knowledge of my app live?": the context skills (`business-data-context`, `business-api-context`, `business-e2e-context`, `business-domain-context`, `infra-context`, project-local `<aspect>-context`), their HTML maps and `bun run context:map` | `context-skills/how-it-works.es.html` |
| "How does a skill reach Jira, Xray, the browser or the web?": the `[TAG_TOOL]` resolution, `/acli`, `/xray-cli`, `/playwright-cli`, the community skills and MCP capabilities | `tooling/how-it-works.es.html` |

### Cross-cutting reference decks (agentic-qa-core)

Offer them by intent, not by skill:

| User intent | Deck (Spanish) |
| --- | --- |
| "How is everything named?": artifact / test / branch / ID naming conventions | `agentic-qa-core/naming-conventions.es.html` |
| "How do the skills fit together?": the E2E flow (story, refinement, dev, testing) as inputs and outputs per skill: what each phase reads, which skills it loads, what it produces, which Jira fields and transitions it touches | `agentic-qa-core/skills-io-flow.es.html` |
| "Why does the AI write like this?": the output style (layer split, how replies look and sound) | `agentic-qa-core/output-style.es.html` |

### CI mini-course (regression-testing)

Chaptered, quiz-driven decks teach Continuous Integration for testing on this repo's own `.github/workflows/*.yml`. Offer them by intent, in order: Part I first unless the person already writes workflows.

| User intent | Deck (Spanish) |
| --- | --- |
| "How does GitHub Actions work?" / "what is a job, a runner, a secret, an artifact" / "read me smoke.yml" | `regression-testing/ci-pipelines-fundamentals.es.html` |
| "Why four suites?" / "how do results reach Xray?" / "how would the app deploy trigger our suites?" / "write my own workflow" | `regression-testing/ci-pipelines-architecture.es.html` |

They stop where `regression-testing/how-it-works.es.html` starts (failure classification and the GO / CAUTION / NO-GO verdict); offer that deck for the analysis part.

### Craft and curriculum decks

The craft decks teach the QA judgment behind a stage; the test-automation curriculum is a learning path from programming basics to KATA. Offer them when the person wants to learn the discipline, not only the skill.

| User intent | Deck (Spanish) |
| --- | --- |
| Prevent instead of detect: refining ACs before the sprint | `shift-left-testing/shift-left-craft.es.html` |
| Explore a feature by layers (UI · API · DB) | `sprint-testing/triforce-exploration.es.html` |
| Classify and file quality issues (Bug / Defect / Improvement) | `sprint-testing/defect-management.es.html` |
| Write test cases: scopes, naming, ROI | `test-documentation/test-case-craft.es.html` |
| Read the template test code file by file, and why it has no comments | `test-automation/kata-code-tour.es.html` |
| Automation curriculum, in order | `test-automation/coding-base.es.html` → `coding-classes.es.html` → `dev-craft.es.html` → `playwright-pro.es.html` → `dojo-lab-1.es.html` → `kata-bridge.es.html` → `automation-patterns.es.html` → `api-automation-playwright.es.html` |

The skills-io deck is the best single answer to "what does skill X need or produce" and "show me the whole pipeline". It renders as a Mac-style terminal with one tab per phase (arrow keys or `1-9` switch tabs).

Each deck is a single file (CSS and JS inlined) that opens by double-click, no server. Keys: `←` `→` to move, `S` for speaker notes, `O` for the slide overview, `F` for fullscreen.

### Published site (preferred source, works in every project)

All decks, the interactive **KATA Academy** and the boilerplate homepage are published on the boilerplate's GitHub Pages hub:

```
https://upex-galaxy.github.io/agentic-qa-boilerplate/                         ← homepage (deck catalog)
https://upex-galaxy.github.io/agentic-qa-boilerplate/kata/                    ← KATA Academy (interactive)
https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/<folder>/<file>.es.html   (or <file>.en.html for the English twins)
```

Example: `.../decks/sprint-testing/how-it-works.es.html`. The `<folder>/<file>.es.html` segment is exactly the path in the tables above. Use the `.es.html` file (or the `.en.html` twin for an English speaker): an older name without `.es` or `.en` is not a current deck. The published URL works even in consumer projects scaffolded from this boilerplate; the local file is for offline use or an explicit request.

### The docs site (second surface, local)

The repo also ships a human documentation site under `docs/` (Spanish, technical terms in English): "Empezar aquí", Setup (Jira + Xray, DBHub, OpenAPI), the IQL methodology pages, Exploration (Postman, SQL cookbook) and the AI personality page. A deck teaches one skill's workflow; the site is the reference to come back to.

| Intent | Command |
|---|---|
| Open the docs site | `bun run docs` (portal; `-- --page core/setup/dbhub.html` opens one page) |
| Open the "start here" page | `bun run onboarding` |

Both start a blocking local server and open the browser, so the same rule applies: ask first, and suggest the user runs it in their own terminal (`! bun run docs`) instead of chaining it with another command.

### Opening protocol (ask first)

Opening a deck launches the user's default browser, so it needs a yes, one deck at a time.

1. Announce and ask: "I can open a short visual deck that walks through how `/sprint-testing` works, the full workflow map first, then each phase step by step. Want me to open it in your browser?"
2. If the user speaks English, offer the `.en.html` twin of the deck.
3. On a yes, open exactly one deck, published URL first and the local file as the offline fallback (pick the OS command for the user's platform):
   ```bash
   open "https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/sprint-testing/how-it-works.es.html"  # macOS → default browser
   xdg-open "https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/sprint-testing/how-it-works.es.html" # Linux
   start "" "https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/sprint-testing/how-it-works.es.html" # Windows
   # offline / repo-copy fallback (only if the file exists locally):
   open "packages/decks/sprint-testing/how-it-works.es.html"
   ```
4. After it opens, give them the keys (`←` `→` to move, `S` for speaker notes), offer to walk the slides together, and let them come back with questions before offering the next deck.
5. For "how does KATA work" or architecture questions, also offer the interactive KATA Academy (`.../kata/`): interactive chapters in Spanish, presentation mode with the `P` key.

---

## Welcome

This is the **Agentic QA Boilerplate**, a QA-only boilerplate for testing web applications with AI agents in the loop. The repo ships skills, scripts and conventions that turn a Jira QA ticket into documented test cases and automated regression coverage through the IQL stages (`iql-context` explains why the process is shaped this way). It does not ship the application under test: that lives in a separate target repo, configured in `.agents/project.yaml`.

Everything else assumes `bun setup` is complete and the foundation is green.

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
| AI agent    | the hosts declared in `.agents/instructions/agent-harnesses.md`     |

The stack is locked on purpose (see the Compact Rules): KATA is Playwright-specific, so Cypress or Robot Framework projects start elsewhere.

---

## First-time setup

Run the interactive installer once after cloning:

```bash
bun setup
```

It bootstraps `.agents/`, records the agents you select in `harnesses:` (`.agents/project.yaml`) and offers to delete the files of the harnesses left out, asks where secret values live (`.env` by default, or a secret manager), wires Engram persistent memory into each selected agent (`engram setup`), offers RTK token savings on Claude Code (optional, user level), configures the MCPs in `.mcp.json`, downloads Playwright browsers, installs the community skills `cli/install.ts` declares (`USER_LEVEL_SKILLS` + `PROJECT_LEVEL_SKILLS`), verifies the variables each MCP server's `.env` loader `--filter` names against your `.env`, and retires any plaintext MCP credential copy an older install left behind (the same thing `bun run harness:env` does). Full details in [`INSTALLER.md`](../../../INSTALLER.md).

After setup, fill `.env` with the credentials the workflow expects (see "Env vars, by scope") and restart the agent session: MCP servers read `.env` through the `.env` loader when the harness spawns them. `bun run setup:doctor` is the health check.

---

## New project path: from a fresh clone to a repo adapted to your app

`bun setup` is phase 1 of 4, not the whole story. A brand-new project (new app under test, new Jira project) walks this ordered sequence before its first ticket. Each phase checks the earlier ones, but knowing the order saves you from discovering it through an error message.

| Phase | Goal | How |
| ----- | ---- | --- |
| 1. Foundation | Tooling green on this machine | `bun setup` (it also asks the project identity + environments for `.agents/project.yaml`, downloads Chromium and syncs the Jira catalogs) → fill the `.env` values left for later → restart the agent session → `bun run setup:doctor` |
| 2. Jira side | The tracker's catalogs mirrored locally | `bun run jira:sync-fields` + `jira:sync-workflows` + `jira:sync-link-types` (generate the `.agents/*.json` catalogs every skill reads) → `/jira-administration components` (reconcile Jira Components against the app's real modules). First-time Jira provisioning: `docs/core/setup/jira-xray.html` (docs site, `bun run docs`) |
| 3. App under test | The framework knows and fits YOUR app | `/project-discovery` (reverse-engineers the target repo → the domain and infra maps inside `business-domain-context` and `infra-context`, plus `.context/project-config.md`) → `/project-context data` (the `business-data-context` map; mode `api` too when no OpenAPI spec is reachable) → `/test-framework-adaptation` (adapts KATA, config, CI, MCPs to the stack; its Phase 0 gates on those maps through `bun run context:map <slug> --list` and on `project-config.md`, so the order is enforced) |
| 4. Git strategy | Branch policy is a decision, not an inherited default | Ask **"set up our git strategy"** (git-flow-master's Strategy Setup: a short question set → `git_strategy:` block in `.agents/project.yaml`), then optionally `bun run git:policy apply` to mirror it on GitHub. If you skip it, git-flow-master offers it on your first real git action anyway (template-trap guard), and `bun run git:policy verify` runs on every push through the pre-push hook |

After phase 4, run `bun run context:hydrate` to pull the Jira cache, then `/sprint-testing <KEY>` for the first ticket. Joining a project that is already adapted? Someone did phases 2 to 4: run only the checklist at the end of this tour.

---

## Primary pipeline: the IQL stages and the skill that owns each

QA work here runs as named stages: Shift-Left before the sprint, then a per-ticket pipeline inside it. Stages are named, never numbered (`agentic-qa-core/references/stage-gates.md` §"The stages, by name" holds each one's DoD and contract). Each stage maps to a skill.

| Stage | Skill | When | What happens |
| ----- | ----- | ---- | ------------ |
| Shift-Left | `/shift-left-testing` | PRE-SPRINT (batch) | AC refinement on a batch of backlog Stories, gap-spotting, early authoring of the Story's single ATP into the `{{jira.acceptance_test_plan}}` field (outline maturity, no Test Plan item yet: `/sprint-testing` Planning creates the item FROM that field and refines the same ATP), tracked by a `[QA] Shift-Left Review` subtask, sets `{{jira.ai_effort}}`, transition `backlog → shift_left_qa → ready_for_dev`. Adds labels `shift-left-reviewed` + `shift-left-{YYYY-MM-DD}` (the dated one dates the pass for the freshness window `/sprint-testing` declares; the Stage 1 short-circuit opens only on the published ATP body, never on the labels alone). |
| Planning → Execution → Reporting | `/sprint-testing` | IN-SPRINT (ticket) | Per ticket: ATS, ATP, then ATR. Smoke + trifuerza (UI/API/DB) exploration. Planning short-circuits its first phases only when the Story's published ATP body backs a Shift-Left pass within the window `/sprint-testing` declares (the labels alone open nothing). |
| Planning → Execution → Reporting, as a fleet | `/sprint-conductor` | IN-SPRINT (whole sprint, on Orca) | One `/sprint-testing` worker per ticket, launched when the ticket really reaches the test environment, watched from the Sprint Board. The conductor never tests: it boots, watches, closes each worker with its own read-back and resumes the fleet after a reboot. |
| Execution without a ticket | `/exploratory-testing` | ON DEMAND (in-sprint or post-sprint) | Ticket-free exploration of a flow, a module or the whole app: charter, parallel recon, refutation, tie-break. Every candidate is executed live and marked NEW / WEAK / COVERED against existing coverage, and stays `oracle: observed` until a person confirms it. Feeds Documentation. |
| Documentation | `/test-documentation` | IN-SPRINT (post-QA) | Refine the executed test cases into TMS Tests, one ROI verdict per scenario (Candidate/Manual/Deferred), Candidates added to the RTP. |
| Automation | `/test-automation` | POST-SPRINT | KATA-compliant E2E + API tests on Playwright. Plan → Code → Review, with a required separate verifier. |
| Regression | `/regression-testing` | PRE-RELEASE | CI suite execution. Failure classification. GO/CAUTION/NO-GO release verdict. |
| Observation | none | PRODUCTION | Declared and empty: no skill owns it yet. |

### Jira QA state machine

The authority is `.agents/jira-workflows.json`. The names below are copied from it (regenerate with `bun run jira:sync-workflows`); write a Jira status only from that file, because a status missing from it does not exist in the instance.

```
Backlog → Shift-Left QA → Ready For Dev → In Progress → In Review → Ready For QA → In Test → QA Approved → Ready For Release → Deployed to Production
```

`/shift-left-testing` drives the upstream transitions (Backlog → Shift-Left QA → Ready For Dev) and `/sprint-testing` the downstream ones (Ready For QA → In Test → QA Approved). PO and Dev lead drive the middle leg (Ready For Dev → In Progress → In Review). A defect found in test sends the story `In Test → BLOCKED` (transition `defect reported`); `ABORTED` is the other terminal.

Bugs found during QA go `Open → In Progress → In Review → Ready For QA → Closed`, and the `ReTest Passed` transition closes one after the fix is verified. Non-fix terminals: `Deferred`, `Duplicated`, `Enhancement`, `Cannot Reproduce`, `REJECTED`, `ABORTED`.

Test cases in the TMS have their own lifecycle: `Draft → In Design → READY → In Review → Candidate → In Automation → Pull Request → AUTOMATED`. `MANUAL` is the terminal for tests that will never be automated, and `DEPRECATED` retires a test.

Each Story gets three canonical TMS artifacts: the **ATP** (plan), the **ATR** (results) and the **ATS** (Acceptance Test Set, which groups ALL the Story's TCs; its link to the Story is what fills the Xray coverage panel). Above the Story sits the planning ladder: **FTP** per feature or Epic (`/sprint-testing` feature-test-planning), **STP** at sprint start and **STR** recap at sprint close (`/sprint-testing`, with `/regression-testing` as fallback and completer), the long-lived **RTP** (Regression Test Plan, fed by `/test-documentation`) with one **RTR** (Regression Test Results) per regular regression run, which `/regression-testing` creates before the CI trigger and closes with its GO / CAUTION / NO-GO verdict, and the **MTP** Epic from `project-context` mode `test-plan`.

Two conventions apply to every quality issue filed along the way. **Components** are the target app's functional modules, mandatory on bugs, defects, improvements and Tests, and reconciled against the app's real modules through `jira-administration` mode `components`. Bugs parent to the QA process epics (for example "QA Defect Management"), never to a product or dev epic, and carry the source Story as an issue-link: parent = QA bucket, link = source Story, components = product module (the three-axis model).

`/sprint-testing` orchestrates Planning, Execution and Reporting; Documentation onwards are explicit hand-offs. To see what is already covered before Documentation or Automation, `bun run tests:map` renders the synced Epic → Story → Test tree (plus orphans and a component rollup) as one HTML page, and the `/xray-cli` skill's `test enrich` command backfills the synced Test cache with the Xray-internal associations (Preconditions, Test Set membership) that the Jira REST sync cannot see.

### Planning → Reporting example flow

`/sprint-testing UPEX-277`:

1. Syncs the ticket from Jira with `bun run jira:sync-issues get <KEY> --include-comments` (the canonical detailed read: `acli view` returns null for custom fields), then reads the materialized `.md` files.
2. Loads the synced context from `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (Module = Epic; Jira-synced files are a read-only cache).
3. Explores the relevant code in the target repo.
4. Authors the ATP (Acceptance Test Plan), writes it to the Jira field (or the fallback comment), re-syncs, and hand-writes only the non-Jira files (`context.md`, `evidence/`).
5. Executes smoke + trifuerza exploration (UI / API / DB).
6. Files the ATR (Acceptance Test Results) and bug reports if defects show up.
7. Transitions the ticket through the QA states.
8. Hands off to Documentation (`/test-documentation`) to document the executed test cases in the TMS and score ROI; its Candidate verdicts are what feed `/test-automation`. Documentation refines each Candidate (the sprint TC is a draft, its title re-derived to the canonical `{US_ID}: TC#: should …` form), groups them into named e2e regression flows and adds every one to the project's long-lived **Regression Test Plan (RTP)** with the `regression-candidate` label. That RTP membership, not any local report, is what `/test-automation` and `/regression-testing` read downstream, and every regular regression run records its results in an RTR linked to that RTP (the STR stays the sprint-close recap).

A person confirms at the gates.

---

## When to use `/framework-development` instead

| When                                                                       | Skill                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Pre-sprint AC refinement / batch grooming of backlog Stories               | `/shift-left-testing` (Shift-Left)                                   |
| Routine in-sprint QA on a Jira ticket (most cases)                         | `/sprint-testing` (ticket-driven)                                    |
| Authoring new automated test for a Candidate TC                            | `/test-automation`                                                   |
| Refactor of the boilerplate itself: KATA bases, fixtures, cli/, scripts/   | `/framework-development`                                             |

`/framework-development` covers framework evolution: changes to the boilerplate's own infrastructure, not per-ticket test writing. It is a self-contained Plan → Code → Verify → Archive pipeline that needs nothing outside the repo.

---

## Running several sessions at once (optional)

One AI session at a time is the normal way to work. A second way exists, and a newcomer should know it is there before they ask.

The AI has two executors. A *one-shot subagent* lives inside the current turn: it reads, verifies or maps something and reports back, and that is the default for almost all work. A *supervised worker* is a persistent session with its own scope that the conductor session keeps talking to, for work that does not fit inside a turn (a whole story tested end to end, a module automated, a cluster of CI failures chased down).

`/agent-orchestration` owns the second executor: one **conductor** (the session talking to you) coordinating a **fleet** of workers in **rounds**, with a claims protocol so two workers never fight over the same test user or fixture. Each workflow skill still owns what gets done; the orchestration skill owns how sessions are launched, briefed, supervised and closed.

Tell a newcomer two things. It is optional: it needs an orchestration runtime, and without one a workflow skill writes its launch file as before and you paste the lines into your own terminals. And it is not "faster QA": the dogfooded sprint (figures in ADR-0006) showed value in three sessions measuring the same environment from three angles, including a conductor instruction that a worker rightly refused because its own measurement disagreed.

Visual deck: https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/user-level-skills/agent-orchestration/how-it-works.es.html (same opening protocol as every other deck, so ask first).

---

## MCPs available

The project MCP files (`.mcp.json` and its OpenCode / Codex / Pi twins) commit only LOCAL (stdio) servers: the ones that read `.env` values (the app's database and API, the Slack bot) and the keyless docs server. The set is whatever `.mcp.json` declares (`KNOWN_MCP_IDS` in `cli/lib/agent-compatibility-contracts.ts` pins the shipped ones), and the capability each server provides is in `agentic-qa-core/references/mcp-capabilities.md` §2.

A remote server whose only project-side content was an API key is the harness's business (ADR-0005; the list of moved servers and how to connect each one per host: `cli/lib/harness-level-mcps.ts`, human guide `docs/core/variables-de-entorno.html`). The **Atlassian MCP is opt-in** (setup in `agentic-qa-core/references/mcp-atlassian-optin.md`); the primary Jira tools are `/acli` and `bun run jira:sync-issues`.

Tools resolve by capability, that is by tool-name suffix, so a user-level server or a claude.ai connector exposing the same tools counts. A capability nobody provides is a point-of-use STOP, not a silent fallback (`agentic-qa-core/references/mcp-capabilities.md`). The decision rule:

- Context7 (capability `library-docs`) for "how to use X": official docs, current API.
- The `web-search` capability (a harness-level server: Exa first, Tavily second) for "how to solve X": community fixes, troubleshooting.
- `/acli` for ticket WRITES (create, transition, comment, link); `bun run jira:sync-issues get`/`jql` for detailed READS (custom fields, ACs, ATP/ATR, comments).
- `/playwright-cli` for every browser interaction, ad-hoc or scripted. There is no browser MCP.

`.mcp.json` sits at the repo root and is **committed**: it is secret-free and names secrets only in each server's `.env` loader `--filter`. Every MCP server that needs `.env` values starts through that loader on every host (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`, `.pi/mcp.json`; `MCP_ENV_LOADER_*` in `cli/lib/agent-compatibility-contracts.ts`). The loader reads `.env` from the project root itself, so even a desktop or Dock launch sees the values and no plaintext copy is written anywhere. Only `.mcp.local.json` (personal overrides) is gitignored.

---

## Env vars, by scope

Every variable carries a scope in `cli/lib/variables-manifest.ts` (human guide: `docs/core/variables-de-entorno.html`). Nothing blocks install or the doctor: the code that reads a value validates it, with a named error. The list is `.env.example` (each variable documented in place, its scope in the manifest), `bun run vars:env:check` verifies them, and `bun run setup:doctor` shows every variable with its scope and which harness-level servers your user config declares. The Jira site HOST is not in `.env`: it lives in `.agents/project.yaml` -> `issue_tracker.atlassian_url`; read it with `bun run --silent jira:url`.

Not in `.env`: web search and Postman are MCP servers connected at harness level (a claude.ai connector, a user-scope server, the OpenCode / Codex user config, `~/.pi/agent/mcp.json` on Pi; claude.ai connectors do not exist there), and `acli` / `resend` keep their own login.

`.env` is **gitignored**: do not commit it. `.agents/project.yaml` (committed) holds non-secret context (URLs, project key, environment names) and `.env` holds the matching secrets. `bun run setup:doctor` reports any plaintext copy an older `bun run harness:env` left behind (`bun run harness:env` retires it). Verify your config with `bun run vars:check` (0 errors when fully configured).

---

## Local skills (committed in this repo)

The committed skills, with their triggers and purpose, are listed in `.agents/instructions/agent-skills-and-mcps.md` (a project's own skills, in the `## Project context skills` table of `.agents/instructions/agent-project.md`) and indexed in `.agents/skills/REGISTRY.md` (generated by `bun run skills:registry`). This skill keeps no copy.

---

## Persistent memory (Engram)

`bun setup` wires **Engram** into each selected agent with the engram binary's own `engram setup <agent>`, which registers the Engram MCP server and nothing else. On Claude Code the installer then offers the Engram plugin (`claude plugin install engram@engram`), which adds the session hooks the MCP registration does not install ([`INSTALLER.md`](../../../INSTALLER.md), "What `engram setup` adds"). The boilerplate does not use gentle-ai's workflow layer: its own workflow skills cover Plan → Code → Verify.

Tell a new user two things: the agent saves memories only when it decides to (`mem_save`), and search matches keywords, not meaning, so a short keyword query finds more than a full question.

## Token savings with RTK (optional, user level)

RTK (`rtk-ai/rtk`) compresses the output of shell commands such as `git status` before the agent reads it, so sessions spend fewer tokens. `rtk gain` shows the savings. It installs once per machine, in the user-level Claude Code config, and works only with Claude Code here. `bun setup` already offers it in an interactive run ([`INSTALLER.md`](../../../INSTALLER.md), "RTK").

Offer the prompt below only to a newcomer on Claude Code who does not have RTK (`rtk gain` fails or `rtk` is missing), and ask first: it edits `~/.claude/settings.json`. Never install it on your own, and never when the user declined it. The prompt itself shows a dry run and waits for a confirmation before it changes anything.

````text
Install RTK (rtk-ai/rtk), the token-saving output compressor, for Claude Code on this machine.

First, check the machine state. If `rtk` is already installed (`rtk gain` exits 0) and its Claude Code hook is already in ~/.claude/settings.json (a PreToolUse command containing "rtk hook claude"), report that and change nothing.

Otherwise:
1. Detect the OS and the package manager, then install with the matching command:
   - macOS or Linux with Homebrew: brew install rtk
   - Windows: winget install rtk-ai.rtk
   - Anything else: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
2. Verify with `rtk --version` and `rtk gain`. A different crate also named "rtk" exists: if `rtk gain` fails, it is the wrong binary, so stop and explain.
3. Run `rtk -v init --global --dry-run`, show me the full output and wait for my confirmation.
4. After I confirm, run `rtk init --global --auto-patch`.
5. Tell me to restart Claude Code so the hook loads.
6. Validate: `rtk rewrite "git status"` must print a rewritten command, and `rtk rewrite "supabase db diff"` must exit 1 (not rewritten, by design).

Do not use rtk-proxy or any pipeline feature. If any step fails, stop and explain what happened instead of working around it.
To uninstall later: rtk init --global --uninstall
````

## Community skills installed at user level

`bun setup` also runs `bunx skills add --global` for the cross-project skills in the `USER_LEVEL_SKILLS` array of `cli/install.ts` (the last row of the table below is not one of them: the orchestration binary installs it, not `setup`). It asks per skill with all of them pre-checked; a skill you uncheck is recorded as declined and not offered again, and a non-interactive run installs every skill not declined.

An installed skill needs a loader, or it should not be installed. An install that no flow reaches is tokens spent on a capability nobody invokes, and the failure is silent because an unused skill looks exactly like a working one. So the third column names the skill and the moment that loads this one, or says that only a human invokes it. A loader named here lets the agent load the skill without asking (`agentic-qa-core/references/skill-composition-strategy.md` §3.2). `bun run skills:check` (`T4-LOADER`) fails when a `USER_LEVEL_SKILLS` slug has no row, or when a row's loader cell neither cites its loader in backticks nor says "user-invoked only". When a skill is not installed, the step that would call it runs inline and says so; it never blocks.

| Skill | Source | Loaded by / when |
| --- | --- | --- |
| `find-skills` | vercel-labs/skills | automatic, last resort. `agentic-qa-core/references/skill-composition-strategy.md` §11.2 (Invocation order, steps 2 and 3): scan T1 and T2, then installed T3 and T4, and only when a task domain still has no match does a flow invoke it. It asks before installing anything |
| `github-actions-docs` | xixu-me/skills | `/regression-testing` (`regression-testing/SKILL.md`, the `.github/workflows/*.yml` bullet under its context files) and `/framework-development` (its `/github-actions-docs` row in the optional-skills dispatch table), when EDITING or diagnosing `.github/workflows/**`; reading a workflow does not need it |
| `html-ppt` | lewislulu/html-ppt-skill | user-invoked only. `packages/decks/` is hand-authored; this is for a one-off deck outside that tree |
| `mkd` | upex-galaxy/agentic-user-skills | `agentic-qa-core/references/decision-elicitation-doctrine.md` §3 (the installed row: "call the Skill tool with "mkd""), reached by any flow at the heavy-decision threshold of that doctrine (real tradeoffs, architecture, a larger change; small decisions go through the harness question tool instead); also named as the Handoff deck instrument in `exploratory-testing/SKILL.md` |
| `humanizer` | upex-galaxy/agentic-user-skills | `/framework-development` (`framework-development/SKILL.md`, the "Prose" step of the three jobs of a skill change) and `agentic-qa-core/references/skill-scaffold.md`, for the prose pass on a skill or instruction file it writes |
| `writing-for-agents` | upex-galaxy/agentic-user-skills | `/framework-development` (`framework-development/SKILL.md`, the instruction-file note and the "Structure" step of the three jobs of a skill change) and `agentic-qa-core/references/skill-scaffold.md`, when the change writes or edits a skill or instruction file |
| `grilling` | upex-galaxy/agentic-user-skills | `/shift-left-testing` (`shift-left-testing/SKILL.md`, `### The summary, the interview and the OK` of Phase 2 Refinement, step 1 of the interview), when a Story or plan has open questions to stress-test in rounds |
| `domain-modeling` | upex-galaxy/agentic-user-skills | `/shift-left-testing` (`shift-left-testing/SKILL.md`, `### The summary, the interview and the OK` of Phase 2 Refinement, step 3 of the interview, and `shift-left-testing/references/refinement-playbook.md`), when an answer settles a domain term for `business-domain-context` |
| `to-questionnaire` | upex-galaxy/agentic-user-skills | `/shift-left-testing` (`shift-left-testing/SKILL.md`, Phase 1 step 7, and the PO questionnaire step under `## With nobody at the keyboard`), when several open questions go to the PO or Dev as one questionnaire |
| `retro` | upex-galaxy/agentic-user-skills | `/framework-development` (`framework-development/SKILL.md`, Phase 4 Archive, step 2) and `/agent-orchestration` (its conductor cycle §9 Harvest, at the close of a wave) |
| `show-me-your-work` | upex-galaxy/agentic-user-skills | `/agent-orchestration` (its `## Brakes and the decision log`), for a routine or a long-running worker |
| `blast-radius` | upex-galaxy/agentic-user-skills | `/sprint-testing` (`sprint-testing/SKILL.md`, the bug risk score in the Bug mode branch; `sprint-testing/references/session-entry-points.md` Step 1.3; `sprint-testing/references/acceptance-test-planning.md` §0.2) and `/regression-testing` (`regression-testing/SKILL.md`, `## When to run each suite`, suite choice from a change). Not installed: the step runs inline |
| `diagnosing-bugs` | upex-galaxy/agentic-user-skills | `/sprint-testing` (`sprint-testing/SKILL.md`, the bug retest Execute step; `sprint-testing/references/session-entry-points.md` Step 1.7) and `/regression-testing` (`regression-testing/SKILL.md` Step 4, and `regression-testing/references/failure-classification.md` §6), for diagnosis only. Not installed: the step runs inline |
| `teach` | upex-galaxy/agentic-user-skills | user-invoked only. `/teach` is manual (`disable-model-invocation`), so no flow loads it; the teaching mode of this skill tells a person to type it for a multi-session course |
| `agent-orchestration` | upex-galaxy/agentic-user-skills | the `orca` row of `.agents/instructions/agent-tool-resolution.md` §6.5 and its `[ORCHESTRATION_TOOL]` row, before any orchestration command; `/sprint-conductor` boot Step 1. This repo's own fleet parts load beside it: `agentic-qa-core/references/fleet-launch-seam.md`, `fleet-provisioning.md`, `fleet-project-profile.md` |

The project-level community skills (the `PROJECT_LEVEL_SKILLS` array of `cli/install.ts`) install into `.agents/skills/` and are not committed. `skill-creator`, among them, builds every skill this repo scaffolds: `/framework-development` loads it when the change is a skill, and `project-context` mode `context-skill` loads it for a consumer's `<aspect>-context`. Both scaffold from `agentic-qa-core/references/skill-scaffold.md`.

---

## Next steps after the onboard

**On a brand-new project** (new app under test, new Jira project) follow the 4-phase "New project path" above. This checklist alone is not enough: it covers phase 1 only.

**Joining an already-adapted project**: go through this checklist before your first ticket.

- [ ] Did you run `bun setup`?
- [ ] Did you fill `.env` with what your work needs (`.env.example` documents each variable and its scope) and connect web search at harness level?
- [ ] Did you restart the agent session after filling `.env`?
- [ ] Did you populate `.agents/project.yaml` (run `bun run agents:setup` if not yet)?
- [ ] Does `bun run vars:check` exit clean (0 errors)?
- [ ] Did you run `bun run jira:check` to verify Jira credentials?
- [ ] Are the Playwright browsers installed? (`bun setup` downloads Chromium; `bun run pw:install` if that step was skipped)
- [ ] Did you run `bun run context:hydrate` to build the `.context/PBI/` Jira cache? (gitignored and regenerable; Jira stays the source of truth)
- [ ] Does the `git_strategy:` block in `.agents/project.yaml` reflect a CHOSEN strategy (`meta.strategy_source: chosen`)? If it still says `inherited`, git-flow-master offers Strategy Setup on your first git action.
- [ ] Does engram persistent memory respond (try `mem_context` after restart)?
- [ ] Ready for your first QA ticket: `/sprint-testing <UPEX-XXX>`

Fix any unchecked box first: the downstream skills assume a green foundation.

---

## With nobody at the keyboard

The tour has two waits: the one clarifying question, and the yes before a deck or docs server opens. `agentic-qa-core/references/decision-protocol.md` says who may ask.

| Situation | Path |
| --- | --- |
| A person is present | unchanged: ask, wait for the yes, open one deck |
| A supervised worker | the question and any deck go to the launcher, which holds the gate; the worker answers from the files and opens nothing |
| A routine with nobody | the delegating brief is the approval source only when it names the deck to open; a brief that names only a topic gets the explanation as text, with no browser and no local server, and the report says so |

---

## What this skill does not do

- Refine backlog Stories pre-sprint: `/shift-left-testing`
- Test a ticket: `/sprint-testing`
- Run the sprint as a fleet watched from the Sprint Board: `/sprint-conductor`
- Explore a module, a flow or the whole app with no ticket: `/exploratory-testing`
- Document test cases in TMS: `/test-documentation`
- Write automated tests: `/test-automation`
- Run a regression suite: `/regression-testing`
- Discover a brand-new target project: `/project-discovery`
- Adapt the KATA test architecture to a target stack: `/test-framework-adaptation`
- Launch or supervise several parallel sessions: `/agent-orchestration`

The tour ends once the user knows which skill to call next, and the workflow skill takes over from there.
