---
id: context-map
title: 'Context loading map: task to skill to context'
load_when: 'any workflow task (onboard, discover, adapt, shift-left, sprint testing, documentation, automation, regression, maps, defects, decisions, handoff, browser, Jira) or "which skill / what to read for X"'
triggers: ['\bonboard', '\bshift.?left', '\bsprint', '\bregres', '\b(?:re)?test(?:ing)? (?:this|the|a) (?:story|ticket|bug)\b', '\bretest', '\b(?:write|draft|create) (?:the |an? )?AT[PR]\b', '\bbusiness (?:data|feature|api|domain|e2e|infra) map\b', '\bautomat', '\bdocument (the )?tests?\b', '\bROI\b', '\bADR\b', '\bhandoff\b', '\bscreenshot', '\bmaster test plan\b', '\bcoverage\b', '\bexplorat', '\bconductor\b', '\bexplor\w* (?:the )?(?:\w+ )?(?:module|flow)\b', '\bwhich skill\b', '\bhow does .+ work\b', '\bdisk space\b', '\bfree (?:up )?(?:disk|space)\b', '\bclean ?up\b', '\bclean (?:the )?(?:repo|generated|reports?|artifacts?|junk)\b', '\bgenerated (?:files?|artifacts?|junk)\b', '\bjunk\b', '\bbun (?:run )?clean\b']
paths: []
---

# Context loading map

> Heavy detail lives in a skill's `references/`. Project values live in `.agents/project.yaml`. Scripts come from `package.json`. User-facing setup is in `README.md` and `docs/`.

## 4. Context loading map: task to what to load

Before answering a task, name its type, load the matching skill, then read the context the table lists. For scripts and commands, read `package.json` directly (Rule #11). Skills and sections load by meaning, so a prompt in any language matches the same row as its English equivalent.

### Which skill for X

When the request is a goal and not yet a skill name, pick by intent. The skill's own `SKILL.md` is the authority on what it does; this list only points.

| You want to | Start with |
|---|---|
| Learn the repo, or you are lost | `/agentic-qa-onboard` |
| Make a backlog Story testable before the sprint | `/shift-left-testing` |
| Test a Story or bug that is in the sprint | `/sprint-testing` |
| Poke at a module or flow with no ticket | `/exploratory-testing` |
| Run the whole sprint as a fleet | `/sprint-conductor` |
| Fan work out to several sessions | `/agent-orchestration` (user level) |
| Put test cases and ROI in the TMS | `/test-documentation` |
| Write or review automated tests | `/test-automation` |
| Run a suite, classify failures, decide GO or NO-GO | `/regression-testing` |
| Learn how the product works | the context map skill that owns the topic |
| Refresh maps, the test plan or the coverage gap list | `/project-context` |
| Publish evidence for a ticket or annotate a bug screenshot | `/evidence-artifact`, `/bug-screenshot-annotation` |
| Branch, commit, push or open a PR | `/git-flow-master` |
| Review someone's PR | `/pr-review-lead` |
| Change the boilerplate or the agent instructions | `/framework-development` |
| Free disk space, or clear generated files (test output, reports, playwright-cli logs, scratch, builds) | `bun run clean` (dry run first; its registry in `cli/lib/clean.ts` is the list of what is safe to delete) |
| Continue in a fresh session | `/session-handoff` |

Two requests cut across the list. Deriving coverage from ACs loads `agentic-qa-core/references/test-design-doctrine.md` inside whichever testing skill is active. Filing a defect loads `agentic-qa-core/references/defect-management-doctrine.md` the same way.

### Full map

| Task | Trigger phrase | Load skill | Read context | Primary tool |
|---|---|---|---|---|
| First-time orientation, or the user is lost or wants to understand a skill | "onboard me", "first time using this", "I don't know how to use this", "how does `<skill>` work", "explain how X works" | `/agentic-qa-onboard` | (the skill loads its own context) | - *onboard switches to teaching mode: drop the terse working register, explain in plain language, and ask before opening the per-skill `how-it-works.es.html` deck in the browser* |
| Install or update this project | "run setup", "install the project", "update the boilerplate", "bun sync" | - | `INSTALLER.md` (phases, where the run is shown, what an agent cannot answer); `bun run setup:doctor --json` for the current state | Bash. An agent shell never opens the page: run `bun setup --non-interactive` or `bun sync --auto`, or ask the human to run the command in their own terminal, where it opens the page |
| Onboard target project | "onboard this repo", "set up project" | `/project-discovery` | target repo code, `.context/` if it exists | Read + Grep |
| Adapt KATA to stack | "adapt framework", "wire fixtures", "test framework adaptation" | `/test-framework-adaptation` | the context maps (`bun run context:map <slug>`: `business-domain-context`, `infra-context`, the business maps), `.context/project-config.md`, `.agents/project.yaml` | Code edit |
| Shift-Left batch grooming | "shift-left these stories", "groom the backlog", "pre-sprint QA", "refine these N stories" | `/shift-left-testing` | business context maps (`bun run context:map <slug>`), `.context/PBI/qa-artifacts/master-test-plan.md`, `.context/PBI/epics/EPIC-*/stories/STORY-*/` | `[ISSUE_TRACKER_TOOL]` |
| Sprint testing issue | "test this", "QA this story", "verify bug", "process sprint N" | `/sprint-testing` | `.context/PBI/epics/EPIC-*/stories/STORY-*/` | `[AUTOMATION_TOOL]` + `[ISSUE_TRACKER_TOOL]` |
| Conduct a sprint fleet from the Sprint Board | "/sprint-conductor", "sprint conductor", "conduct the sprint", "boot the conductor", "watch the test environment", "resume the conductor after a reboot" | `/sprint-conductor` | `sprint-testing/references/fleet-conductor.md`, `sprint-testing/references/sprint-board.md`, `cli/sprint-board/README.md`, `.agents/project.yaml` (`board:`, `orchestration:`) | `[ORCHESTRATION_TOOL]` + `[ISSUE_TRACKER_TOOL]` |
| Exploratory testing without a ticket | "exploratory testing", "explore the <module> module", "sweep the app", "find bugs in <flow>", "explore the coverage gaps" | `/exploratory-testing` | the coverage gap list (`project-context` mode `coverage`), `kata-manifest.json`, `.context/PBI/qa-artifacts/master-test-plan.md`, the business context maps (`bun run context:map <slug>`) | `[AUTOMATION_TOOL]` + `[DB_TOOL]` + `[API_TOOL]` |
| TMS documentation / ROI | "document tests", "ROI", "automate priority" | `/test-documentation` | `.context/PBI/qa-artifacts/master-test-plan.md`, `.agents/jira-required.yaml`, `.agents/jira-fields.json` | `[TMS_TOOL]` |
| Write automated test | "automate", "E2E test", "API test" | `/test-automation` | `kata-manifest.json`, `tests/components/`, `.context/PBI/.../implementation-plan.md`, skill `references/` | Code edit |
| Derive test cases / coverage from ACs (any of the 4 testing skills) | "design test cases", "what to test", "cover this AC", "is this enough coverage" | (the active testing skill) | `agentic-qa-core/references/test-design-doctrine.md`, read before deriving any coverage | - |
| Report a bug / defect / improvement | "report bug", "file defect", "raise improvement", "found an error in the app" | (the active testing skill) | `agentic-qa-core/references/defect-management-doctrine.md`, read before filing | `[ISSUE_TRACKER_TOOL]` |
| Annotate a bug screenshot (visual or positional defect) | "annotate bug screenshot", "mark up evidence" | `/bug-screenshot-annotation` | `agentic-qa-core/references/evidence-conventions.md` | `/playwright-cli` + local HTTP |
| Build or publish the evidence page of a ticket or bug, retest it | "evidence page", "publish the evidence", "retest evidence" | `/evidence-artifact` | `evidence-artifact/references/workflow.md`, `references/pack-schema.md`, `agentic-qa-core/references/evidence-conventions.md` | `bun run evidence` + Artifact tool |
| Ask the user to decide (a batch of decisions, or one dense one) | "decide", "which option", "options", a report the user must react to point by point | - | `agentic-qa-core/references/decision-protocol.md` first (whether the question reaches the user at all), then `agentic-qa-core/references/decision-elicitation-doctrine.md` (how to ask) | `mkd` decision deck; the harness prompt below the threshold or when `mkd` is absent |
| Discovery / inventory | "what components exist", "list ATCs", "is TC-X automated", "coverage map", "what's tested" | - | `kata-manifest.json`; Story to Test traceability and orphans: `bun run tests:map` (reads `.context/PBI/`, offline). Behaviour to test (what the product does that no test exercises) is `project-context` mode `coverage`, not this map | Read / `bun run tests:map` |
| Regression / release | "run regression", "GO/NO-GO" | `/regression-testing` | `.context/PBI/qa-artifacts/master-test-plan.md`, CI logs | `gh` + Allure |
| Private report hosting (login-walled Allure) | "make reports private", "protect test evidence", "login for the reports" | `/regression-testing` | `regression-testing/references/private-hosting-setup.md` (AI-executed protocol): the AI clones and deploys the Test Report Portal (Supabase/R2/Vercel) and wires this repo's secrets; suite workflows are already dual-mode | CLIs (`supabase`, `wrangler`, `vercel`, `gh`) |
| Test-architecture decision (record or supersede) | "record an ADR", "document our fixture/runner/isolation decision", "architecture decision record" | - (see `.context/ADR/README.md`) | `.context/ADR/`, `agentic-qa-core/references/adr-doctrine.md` | Read + Write |
| Why the QA process is shaped this way (methodology, not a procedure) | "why do we create an ATS per story", "what is a stage / step / phase / altitude", "Early-Game / Mid-Game / Late-Game", "TMLC / TALC", "light mode", "what does IQL mean here" | `iql-context` (loads by meaning, kind `context`) | `.agents/project.yaml` `qa.methodology`; `iql-context/references/project-overrides.md` | - *knowledge only, it never runs a stage* |
| Refresh project maps / test strategy | "refresh context", "business data/API/E2E map", "feature map", "user journeys", "master test plan" | `/project-context` (selected mode) | target code, `.context/`, live read-only sources; the map lands inside its business context skill | Read + approved section write |
| Coverage inventory (behaviours vs tests) | "coverage gaps", "gap list", "weak tests", "what is not tested" | `/project-context` mode `coverage` | the business maps (`bun run context:map <slug>`), `kata-manifest.json`, the TMS, `.context/PBI/qa-artifacts/master-test-plan.md`; `bun run context:coverage` (collect, classify, propose) | `bun run context:coverage` + `[ISSUE_TRACKER_TOOL]` after approval |
| Understand the SUT (data, API, journeys, vocabulary, stack) | "how does X work", "which endpoint", "what does a user do", "entity lifecycle", "what does <term> mean", "how is it deployed" | the matching context map skill (loads by meaning, kind `context`: the business maps, `business-domain-context` for vocabulary, `infra-context` for stack and environments) | `bun run context:map <slug> [--section <id>]`, never the raw HTML | - *knowledge plus a proposal path: a contradicted section is proposed and applied on approval* |
| Sync AI repository context (docs follow-through) | "sync AI context", "sync AI memory", "update the docs after this change" | `/framework-development` (boilerplate change) or `/test-framework-adaptation` Phase 9.3 (project-owned docs) | `README.md`, this file, `package.json`; `bun run docs:check` proves the router and the quoted scripts | Edit |
| Edit the agent instructions (L0, a section, the ROUTER, triggers) | "edit AGENTS.md", "add a rule", "where does this rule go", "tune the triggers", "new instruction section", "measure route recall" | `/framework-development` mode `instructions` | `framework-development/references/instructions-doctrine.md` (where each sentence goes), `.agents/instructions/README.md`; `bun run instructions:check` (locks and router eval), `bun run instructions:audit` (recall from transcripts) | Edit |
| Orchestrate several sessions (fleet of workers) | "orchestrate", "fleet", "workers", "one session per story", "resume the run", "automation routine" | `/agent-orchestration` (user level) | `.agents/project.yaml` `orchestration:` block (defaults); `agentic-qa-core/references/fleet-project-profile.md`, `fleet-launch-seam.md`, `fleet-provisioning.md` (this repo's parts) | `[ORCHESTRATION_TOOL]` (gate: binary plus reachable runtime; silent when absent) |
| Hand this session to a fresh one (context window filling up) | "handoff", "pass the context to another session", "continue this in another session", "hand this session over", "write a handoff" | `/session-handoff` | `<<PRIMARY_ROOT>>/.session/handoffs/` (the lineage so far, in the primary checkout even from a worktree); the skill loads its own capture contract | terminal of the SAME harness in the SAME worktree (runtime optional: without it the owner pastes the line) |
| Git / PR work | any git intent | `/git-flow-master` (loads by meaning) | `git status`, `git log` | `git` + `gh` |
| Browser action | "screenshot", "trace", "record", "log in as <role>", "pair testing", "use my browser" | `/playwright-cli` | `agentic-qa-core/references/browser-sessions.md`, read before the first `open`: whose login, which browser, `testing.browser.pair_mode` | Playwright CLI |
| Jira / Xray operation | "Jira issue", "Xray import" | `/acli` or `/xray-cli` | `.agents/jira-required.yaml`, `.agents/jira-fields.json` | CLI |
| Any script / build / test command question | "what command runs X", "how do I run tests" | - | `package.json`, read first | - |

### Key paths

The doctrine files below are the canon for their topic. Load the one that matches before the work it governs.

- `agentic-qa-core/references/test-design-doctrine.md`: test design (five principles, the formal techniques with their binding triggers, the Test-Design Checklist). Cited by all four testing skills; load before deriving coverage from ACs.
- `agentic-qa-core/references/defect-management-doctrine.md`: defect management (Bug, Defect or Improvement by the feature's lifecycle stage, QA Assignee self-set and kept, mandatory Components, the three-axis parenting, the field matrix and Severity to Priority). Cited by all four testing skills; load before filing any quality report.
- `agentic-qa-core/references/decision-elicitation-doctrine.md`: how to ask a person to decide (question tool, `mkd` deck, plan mode; the weight threshold; §0 who may ask; §7 the sweep; what to do with a returned "did not understand" note). Load before asking for decisions in batch.
- `agentic-qa-core/references/artifact-lifecycle.md`: which status each artifact is created in and which stage moves it where (§1), the edges the catalog lacks (§1.1), assignee-at-create (§2), the unmapped-status fallback (§4: list the live transitions, ask once with `AskUserQuestion`, fire the live id, recommend `bun run jira:sync-workflows`, never skip silently), the light stage verifier (§5). Load before any transition.
- `.context/`: what a script pulls from a source of truth (the PBI cache, reports) plus the few files this repo owns (ADRs, `project-config.md`, the PBI README and templates, `test-specs/`). It is ignored by default with explicit re-includes, and `.gitignore` owns the list. What an AI synthesizes lives in a skill: every map is HTML inside its context map skill (`CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`), generated by `/project-discovery` (domain, infra) or `/project-context` (data, api, e2e), and read with `bun run context:map <slug>` (`agentic-qa-core/references/business-context-maps.md`). Legacy `.context/business/`, `PRD/`, `SRS/` and `infrastructure/` files stay tracked and serve only as generator input.
- `docs/`: the human documentation site (HTML, Spanish), served by `bun run docs`; `bun run onboarding` opens its start page. `docs/core/`, `docs/assets/` and the portal files ship and sync with `bun sync`; every other folder under `docs/` is project-owned and the updater never writes it. The AI does not load it, because the canon lives in `.agents/skills/` references.
- `.context/ADR/`: test-architecture decision records, append-only. A test-architecture decision (runner, fixtures, isolation, auth in tests, selector contract, flake policy) that passes the three gates of `agentic-qa-core/references/adr-doctrine.md` §1 (hard to reverse, surprising without context, a real trade-off) becomes `ADR-NNNN-<slug>.md`; a later one supersedes, nothing is deleted. When to write and the template: `.context/ADR/README.md`; detection and authoring: `agentic-qa-core/references/adr-doctrine.md`. Seeded by `/project-discovery`, `/framework-development`, and `/sprint-testing` plus `/test-automation` (Stage 1). Flaky fixes, local spec tweaks and naming do not get one.
- `.agents/project.yaml`: the `{{VAR}}` source of truth. Load it once per session and cache it.
- `.agents/jira-fields.json`, `jira-workflows.json`, `jira-required.yaml`: the Jira catalogs.
- `api/schemas/`: OpenAPI-derived TypeScript types (refresh with `bun run api:sync`).
- `tests/components/`: KATA L2 and L3 (Api, Page, Steps). `tests/e2e/` and `tests/integration/` hold the spec files.
- `kata-manifest.json`: the Component and ATC registry and the source of truth (Rule #12). Regenerate with `bun run kata:manifest`, validate with `bun run kata:manifest:check`.
- `bun run tests:map`: renders the synced `.context/PBI/` tree (Epic, Story, Test, the orphan pile, the component rollup) as one HTML page, `.context/reports/test-map.html`, with `--json` for the gap summary. It reads disk only and makes no Jira calls, so hydrate first when the cache is stale.
- `bun run jira:baseline`: warns when `.agents/jira-required.yaml` declares fewer work types than upstream's baseline (`scripts/lib/jira-required-baseline.ts`). `jira:sync-workflows` catalogs only what the manifest declares, so a stale manifest regenerates a truncated `jira-workflows.json` and every transition on the missing types falls into the unmapped-status fallback. It only warns, because a deliberate omission is legitimate. `bun run jira:check` and `bun run setup:doctor` print it too.
