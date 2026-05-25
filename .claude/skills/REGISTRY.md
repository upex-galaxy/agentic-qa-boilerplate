# Skill Registry (auto-generated)

> Generated: `2026-05-25T08:48:09.804Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.claude/skills/agentic-qa-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 13

---
## Skill: acli

**Purpose**: Atlassian CLI (official `acli` binary, v1.3+ as of 2026) for Jira Cloud, Confluence Cloud, and org admin tasks from the terminal.

**Compact Rules**:
- **Silent pagination truncation.** `workitem search` without `--paginate` returns the first page only — no warning. Scripts that count or iterate keys read the wrong number of items.
- **Auth is per-product.** `acli jira auth login` does not authenticate `acli admin`, `acli confluence`, or `acli rovodev`. There is also a top-level `acli auth` for global OAuth (newer surface). Each scope has its own session.
- **The "work item" vs "issue" split.** The CLI renamed commands (`jira issue` → `jira workitem`) but the JSON response still has a top-level `issues[]` array and CSV inputs still use `issueType`/`parentIssueId` spellings. Mixing old and new terminology in the same script works, but confuses readers.
- **Unknown subcommands fail silently.** Typing `acli jira workflow --help` does NOT error — it falls back to `acli jira --help` with exit 0. So "no error" ≠ "command exists". Always verify by checking the help body actually changed.
- **Hard limits the docs do not advertise.** `acli` cannot list custom fields, edit custom-field values on existing items, manage workflows, manage issue types, or touch project versions/components. See `references/gotchas.md`.
- Read `complementary_categories` from this skill's frontmatter (`issue-tracker`).
- Resolve via the host repo's skill-registry cache (`.claude/skills/REGISTRY.md`, built by `scripts/build-skill-registry.ts`). Fallback: scan the session-start `system-reminder` skill list.
- Apply the threshold rule per the host repo's skill-composition strategy doc (T1 / T3 silent; T4 ASK).
- The Atlassian MCP fallback documented below is OPT-IN, not a skill — enable manually via `docs/mcp/`.
- `acli` binary is not installed in the environment.
- `acli` auth fails and cannot be fixed in the current session.
- The operation is one of the documented `acli` blind spots: enumerate custom fields, edit custom-field values on existing work items, manage workflows / issue types / priorities / resolutions / project versions / components, upload attachments, add watchers, add an item to a sprint.
- Bulk operations (acli consumes far fewer tokens per call).
- Scripting / CI pipelines.
- Operations that return large result sets (MCP payloads inflate token usage).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/acli/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: agentic-qa-core

**Purpose**: Foundation skill that hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrin...

**Compact Rules**:
- agentic-qa-core/references/briefing-template.md
- agentic-qa-core/references/dispatch-patterns.md
- Create or modify any files. It is a passive reference library.
- Create or modify `.context/` files (that belongs to `/project-discovery`).
- Generate or scaffold tests, fixtures, or KATA components (that belongs to `/adapt-framework` and `/test-automation`).
- Adapt the framework to a specific stack (that belongs to `/adapt-framework`).
- Sync AI-critical documents or project-specific facts in `CLAUDE.md` (that belongs to `/sync-ai-memory`).
- Sync OpenAPI / API schemas (that's `bun run api:sync`).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/agentic-qa-core/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: agentic-qa-onboard

**Purpose**: Walks new users through this repo's QA flow — Playwright + KATA + Allure + Xray stack, Jira QA workflow (Backlog → Shift-Left QA → Estima...

**Compact Rules**:
- Reads the ticket from Jira via `/acli`.
- Loads module context from `.context/PBI/{module}/`.
- Explores the relevant code in the target repo.
- Creates the PBI folder and ATP (Acceptance Test Plan).
- Executes smoke + trifuerza exploration (UI / API / DB).
- Files ATR (Acceptance Test Report) + bug reports if defects found.
- Transitions the ticket through QA states.
- Hands off to Stage 4 (`/test-documentation`) when a Candidate test case should be promoted to TMS.
- Use **Context7** for "how to use X" — official docs, current API
- Use **Tavily** for "how to solve X" — community fixes, troubleshooting
- Use **Atlassian** for ticket operations; for bulk Jira work prefer `/acli`
- Use **Playwright MCP** for ad-hoc live browser interactions; for scripted runs use `/playwright-cli`
- [ ] Did you run `bun run setup`?
- [ ] Did you fill `.env` with your own credentials (`LOCAL_*`, `STAGING_*`, `ATLASSIAN_*`, `XRAY_*`, `TAVILY_API_KEY`, `POSTMAN_API_KEY`)?
- [ ] Did you populate `.agents/project.yaml` (run `bun run agents:setup` if not yet)?
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/agentic-qa-onboard/SKILL.md` · phase: `bootstrap` · extraction strategy: B

---

## Skill: framework-development

**Purpose**: Framework evolution mode — evolves the QA boilerplate itself (KATA, fixtures, cli/, scripts/, api/schemas/ pipeline, package.json deps).

**Compact Rules**:
- `kata-manifest.json` — Component + ATC registry (source of truth per Critical Rule #12). Establishes what already exists before any new fixture API, Page, Api, Steps module, or ATC ID is proposed.
- `.claude/skills/test-automation/references/kata-architecture.md` + `.claude/skills/test-automation/references/typescript-patterns.md` — KATA layer flow (TestContext → ApiBase / UiBase → YourApi / YourPage → TestFixture), ATC identity rules, fixture-selection contract, import-alias conventions.
- `tests/components/` — current Api / Page / Steps shape; required reading when touching any L2 / L3 surface or adding a fixture consumed by these components.
- `cli/install.ts` — installer flow; required reading when evolving the installer, adding install steps, or modifying boilerplate scaffold behavior.
- `scripts/sync-openapi.ts` + `api/schemas/` — OpenAPI-derived TypeScript types pipeline; required reading when touching the API contract pipeline, schema generation, or any consumer of generated facades.
- `package.json` + `bun.lockb` — dep landscape; required reading before bumping Playwright / Bun / TypeScript / fixture-runtime versions or adding/removing scripts.
- **Plan artifact location**: `.session/framework-development/<change-name>/plan.md`. The `.session/` tree is gitignored — the plan is local, not committed. Recovery on mid-run crash: the file persists; the orchestrator reads it back on the next session via Phase 0 resume check (see `./session-management.md` §4).
- **Grace period for legacy path**: prior versions wrote to `.scratch/framework-changes/<change-name>/{plan.md, apply-progress.md}`. Phase 0 also checks the legacy path during the grace period — if found, the orchestrator offers to copy state to the new `.session/...` location before resuming.
- **Path guardrails injected per dispatch**: every Plan and Code subagent briefing MUST include the line `KATA invariants and ALLOWED/FORBIDDEN paths: .claude/skills/framework-development/references/kata-invariants.md (read §10 before touching any file).` Do NOT inline the path tables — the reference is authoritative.
- **On any subagent failure**: STOP, return the failing report, do NOT auto-rerun. The orchestrator decides retry / skip / abort. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.
- **Strict TDD flag** is set in Phase 1's `plan.md` under §"Strict TDD flag". Default OFF. Flipped ON only when the user explicitly opted in. Code phase reads it from the plan; no separate cache needed.
- Read `references/kata-invariants.md` §10 (ALLOWED + FORBIDDEN paths).
- Ask the user (or infer from the request): "Which paths will this change touch?"
- For each path, look it up in §10 ALLOWED → proceed. Or §10 FORBIDDEN → abort and redirect to the skill named in the row.
- If a path matches neither table, ASK the user explicitly — never assume.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/framework-development/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: git-flow-master

**Purpose**: End-to-end Git operator for any branching strategy.

**Compact Rules**:
- "I want to start work on UPEX-123" → branch creation
- "commit and push", "subir cambios", "push to main" → commit + push flow
- "abrí un PR contra staging" → PR creation
- "tengo conflictos al hacer pull" → conflict resolution
- "este PR va a quedar enorme" → chained-PR planning hand-off
- "qué estrategia de git usamos en este repo" → strategy detection / persistence
- "el push fue rechazado" → diagnostic + recovery flow
- Current branch.
- Dirty / clean working tree (staged / unstaged / untracked counts).
- Unpushed / unpulled commits (ahead / behind upstream).
- Upstream status (no upstream, up-to-date, diverged).
- Remote name(s) — most repos have one (`origin`); some have a fork + upstream.
- **Marker in `CLAUDE.md`** — search for `<!-- git-flow-master:strategy:VALUE -->` where `VALUE` is one of the seven slugs. If found, use it. This is the persisted decision.
- **Single-branch heuristic** — `git branch -a` shows only `main` (or `master`) and no integration branch in the remote → `solo-main`.
- **Two-branch heuristic** — exactly `main` (or `master`) + one of `{staging, dev, develop, integration}` exists upstream → `main-integration` (record the integration branch name).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/git-flow-master/SKILL.md` · phase: `implementation` · extraction strategy: B

---

## Skill: judgment-day

**Purpose**: Trigger: judgment day, dual review, adversarial review, juzgar.

**Compact Rules**:
- `/test-automation` — Review phase for high-risk test changes
- `/git-flow-master` — pre-PR gate when the diff is large or touches shared fixtures / base classes
- `/framework-development` — pre-archive review of framework evolution diffs
- The diff / files / PR / architecture slice under review — the literal target the user named.
- `CLAUDE.md` — repo conventions, Critical Rules, behavioral layer (the judges must score against these, not generic best-practice).
- `.claude/skills/REGISTRY.md` — skill registry; resolve which project skills apply to the target's file paths + task type, and inject the same `Skills to load before work` block into both judge prompts.
- The change's spec / PR description / Jira ticket — the stated intent. Judges score against intent, not their imagined intent.
- `references/prompts-and-formats.md` — judge prompts, fix prompts, warning rubric, verdict table format.
- Prior judge outputs from earlier rounds (Round 2+ only) — to detect regressions or stale findings vs. new ones.
- Resolve project skills before launching agents: read skill registry, match skill paths by target files/task, and inject the same `Skills to load before work` block into both judge prompts and fix prompts.
- Launch **two blind judges in parallel** with identical target and criteria; never review the code yourself.
- Wait for both judges before synthesis; never accept a partial verdict.
- Classify warnings as `WARNING (real)` only if normal intended use can trigger them; otherwise downgrade to INFO as `WARNING (theoretical)`.
- Ask before fixing Round 1 confirmed issues.
- After any fix agent runs, immediately re-launch both judges in parallel before commit/push/done/session summary.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/judgment-day/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: project-discovery

**Purpose**: Onboard a project to this testing boilerplate and generate the context files that every QA and automation session depends on.

**Compact Rules**:
- **Target project repo** — path resolved at session start (see "Before starting: target repo location" below). Read code and any in-repo PRD. This is the primary source of truth — discovery is reverse-engineering, never aspirational design.
- **Target repo's `README.md` and existing onboarding docs** — fastest path to project intent, stack signals, and run commands before deep code reads.
- **`.context/` directory** (if partial state exists from a prior discovery run) — informs Phase 0 resume decisions and prevents redundant work. Diff against current code before overwriting.
- **`.agents/project.yaml` and `.env.example`** — variable resolution patterns (`{{PROJECT_KEY}}`, env URLs, MCP names) that every downstream context file references.
- **`kata-manifest.json`** — registry of existing KATA Components + ATCs. Anchors what test surface the boilerplate already expects so discovery records gaps coherently.
- **`.claude/skills/agentic-qa-core/references/skill-composition-strategy.md`** — workflow context for downstream skill hand-offs (`/adapt-framework`, `/sprint-testing`, `/test-documentation`).
- **Business / domain docs supplied by the user** (Confluence, Notion exports, internal wikis) — secondary source for business model and glossary when in-repo signal is thin.
- Check `.session/project-discovery/progress.md`.
- If it does NOT exist → proceed to "Before starting: target repo location" below, then "Pick the scope first" (which writes `plan.md`).
- If it DOES exist:
- Read `plan.md` (chosen scope, target repo path, phase plan).
- Read tail of `progress.md` (last completed phase + next planned phase).
- Surface to the user: scope chosen, target repo, last completed phase, next phase, any open Discovery Gaps from the last entry.
- Offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-project-discovery-aborted/` before proceeding.
- **Project Connection** -- repo paths, tech stack detection, environment URLs, credentials from `.env`, team contacts.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/project-discovery/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: regression-testing

**Purpose**: Execute regression test suites via CI/CD, analyze results, classify failures, and produce GO/NO-GO release decisions.

**Compact Rules**:
- `.github/workflows/*.yml` — workflow files for regression / smoke / sanity suites; defines triggers, inputs, and artifact uploads.
- `.context/master-test-plan.md` — regression Epic key + expected pass-rate SLOs per suite.
- `playwright.config.ts` — reporter config, retry policy, project matrix; needed to interpret retry counts and shard splits.
- Previous run's Allure report (artifact URL or local download under `./analysis/previous/`) — baseline for trend computation.
- `kata-manifest.json` — registry of tests and ATCs available; used to cross-reference failed test IDs.
- `.agents/jira-required.yaml` — Jira refs (project key, work types, transitions) for filing regression issues.
- **Error protocol**: On any subagent failure: STOP, report full context to user, present retry / skip / abort options. Do NOT auto-fix. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.
- Compute prospective `<scope>` = `<env>-<YYYY-MM-DD>` from invocation context (env defaults to `{{DEFAULT_ENV}}`).
- Check `.session/regression-testing/<scope>/progress.md`.
- If it does NOT exist → proceed to suite selection + Phase 1 preflight + plan.md write.
- If it DOES exist:
- Read `plan.md` (captured `suite`, `env`, `workflow_file`, `RUN_ID` if Phase 1 already triggered).
- Read tail of `progress.md`.
- If `RUN_ID` is present AND `progress.md` last entry is `Phase 1 — Trigger — status: completed` but Monitor entry is missing/failed: surface the option to **re-attach** to the existing `RUN_ID` via `gh run view <RUN_ID> --json status,conclusion` instead of re-triggering. This is the high-value resume case.
- Otherwise surface the standard offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-regression-testing-<scope>-aborted/` first.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/regression-testing/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: shift-left-testing

**Purpose**: Orchestrates pre-sprint Shift-Left QA on a batch of backlog Stories.

**Compact Rules**:
- `.context/business/business-feature-map.md` + `.context/business/business-data-map.md` — domain vocabulary, entity model, CRUD matrix. Anchors refined ACs in real entities and flows.
- `.context/master-test-plan.md` — regression Epic + in-scope modules. Tells the refinement whether the Story falls inside an already-prioritized area.
- The Story's Acceptance Criteria + `**Source spec:**` reference on Jira (fetched via `[ISSUE_TRACKER_TOOL]`). Canonical input — every refined AC must trace back here.
- `.context/PBI/{module-name}/{TICKET-ID}-*/` if a PBI folder already exists for this Story (created by a prior `/sprint-testing` cycle). Carries earlier session notes worth honoring.
- `.agents/jira-workflows.json` — Story workflow + valid transitions (`backlog -> shift_left_qa -> estimation`). Source of `{{jira.transition.story.*}}` slugs used in Phase 3.
- `.agents/jira-required.yaml` — canonical slug catalog. Source of `{{jira.acceptance_test_plan}}` and other Jira field slugs touched in handoff.
- Update Jira description with "QA Refinements (Shift-Left Analysis)"
- Populate ATP DRAFT (Modality jira-native: custom field + comment mirror;
- Labels: shift-left-reviewed + shift-left-{YYYY-MM-DD}
- Transition: backlog -> shift_left_qa (analyze) -> estimation (estimate)
- Verify trace
- Always load `/acli` (Story fetch, custom-field update, comment, transition, label, link).
- **Modality jira-xray** AND user opts into Test Plan link draft for each Story -> also load `/xray-cli`. The default in shift-left is NO Test Plan creation (PO has not estimated yet, scope may shrink) — the ATP DRAFT lives on the Story description + comment + custom field. Ask the user before creating Test Plan issues.
- **Modality jira-native** -> `/acli` alone covers `[ISSUE_TRACKER_TOOL]` and `[TMS_TOOL]`.
- `.context/business/business-data-map.md`
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/shift-left-testing/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: sprint-testing

**Purpose**: Orchestrates in-sprint manual QA per ticket across Stages 1 (Planning), 2 (Execution) and 3 (Reporting).

**Compact Rules**:
- `.agents/project.yaml` — project identity, env URLs, `{{PROJECT_KEY}}`, MCP names, active environment.
- `.agents/jira-required.yaml` — canonical slug catalog (custom fields, statuses, transitions) for the active workspace.
- `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping for `{{jira.<slug>}}` resolution at runtime.
- `.agents/jira-workflows.json` — workflow + transition catalog (resolves Ready For QA → In Testing → Tested for Story / Bug / Test Case work types).
- `.context/PBI/{module}/{TICKET-ID}-*/context.md` — ticket-local context: ACs, Team Discussion summary, session notes, open questions (read if it already exists from a prior Session Start).
- `.context/master-test-plan.md` — regression Epic pointer, modality decision (Xray vs Jira-native), what to test and why.
- `.context/business/business-feature-map.md` — feature catalog vocabulary; resolves "what module owns this story" for `{module-name}` PBI folder naming.
- The Story or Bug ticket itself — AC, ATP, comments — fetched via `[ISSUE_TRACKER_TOOL]`. The ticket body is source-of-truth, not the local PBI mirror.
- `.env` — `LOCAL_USER_*` / `STAGING_USER_*` credentials. NEVER hardcode; always read at runtime.
- `kata-manifest.json` — registry of existing KATA Components + ATCs. Check before proposing new ATCs in Stage 3 hand-off so the test-automation phase doesn't duplicate work.
- Story ID with status Ready-for-QA -> Single ticket / User Story.
- Bug ID deployed to staging -> Single ticket / Bug.
- Sprint number, "process sprint X", or an existing `SPRINT-{N}-TESTING.md` -> Batch sprint.
- If the framework file does not exist yet, generate it first (see `sprint-orchestration.md`).
- Compute prospective `<scope>` from invocation: `<JIRA-KEY>` (single-ticket) or `sprint-<N>/<JIRA-KEY>` (batch — once per ticket in the wave loop).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/sprint-testing/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: test-automation

**Purpose**: Plan, write, and review automated tests following KATA (Component Action Test Architecture) on Playwright + TypeScript.

**Compact Rules**:
- **Code phase scope rule**: each Code subagent edits multiple files in isolation, returns a list of changed files + a one-line summary per file. The orchestrator never reads the diffs — only the summary. If the user wants to see actual diffs, the orchestrator runs `git diff` inline after the subagent returns.
- **On any Verifier failure**: STOP, return the failing report verbatim to the user, do NOT auto-fix the test code, do NOT re-dispatch the Code phase without user approval. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.
- **MANDATORY context doc for Plan + Code briefings**: include `kata-manifest.json` (root) in the "Context docs" component (item 2 of the 6-component briefing). Without it the subagent will scan `tests/components/**` directly, burn tokens, and risk proposing duplicates. See Critical Rule #12 in `CLAUDE.md`.
- `kata-manifest.json` (root) — authoritative registry of every Component (`api[]`, `ui[]`) and every `@atc('TICKET-ID')` ID. Anti-duplication gate per Critical Rule #12 in `CLAUDE.md`. MUST load before proposing any new `Page`, `Api`, `Steps` module, or `@atc` ID.
- `.claude/skills/test-automation/references/kata-architecture.md` + `.claude/skills/test-automation/references/typescript-patterns.md` — full doctrine for KATA layers (TestContext / Base / Domain / Fixture), ATC identity, fixture selection, import-alias rules, params contracts.
- `tests/components/` — existing Api / Page / Steps shape on disk. Establishes naming, helper-vs-ATC split, fixture registration patterns to follow.
- `.context/PBI/{module}/{TICKET-ID}-*/implementation-plan.md` — if pre-existing (typically produced by `/test-documentation`), it carries the per-TC plan, candidate verdict, and component mapping. Cite it from the session `plan.md` rather than duplicating.
- The Story's AC + ATP (via `[ISSUE_TRACKER_TOOL]`) — source of truth for scenarios that become ATCs. Resolve the issue key from the scope picker.
- `api/schemas/` — OpenAPI-derived TypeScript types. Refresh via `bun run api:sync` if stale. Required for any Api component touching a new endpoint.
- `.env` — credentials (`LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`, etc.) read via `config.testUser` from `@variables`. Never hardcode; never guess.
- Determine the prospective `<scope>` from the invocation context (ticket key, regression-driven TC, or module slug — see "Pick the planning scope first" below).
- Check `.session/test-automation/<scope>/progress.md`.
- If it does NOT exist → proceed to scope picker + Phase 1.
- If it DOES exist:
- Read `plan.md` (thin index) + the tail of `progress.md`.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/test-automation/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: test-documentation

**Purpose**: Analyze, prioritize, and document test cases in TMS (Jira/Xray) -- the bridge between manual QA and test automation.

**Compact Rules**:
- **Concurrency cap = 10 subagents** for Parallel TC creation. Jira and Xray APIs both rate-limit at ~10 writes/sec sustained; fanning out wider triggers 429 responses. If a module has >100 TCs, batches per subagent must be larger than 10 each (cap is on subagent count, not chunk size).
- **Error protocol**: On any subagent failure: STOP, report the partial success state (which TCs landed, which failed, with their issue keys / errors), present retry / skip / abort options. Do NOT auto-fix nor auto-rollback. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.
- Check `.session/test-documentation/<scope>/progress.md`.
- If it does NOT exist → proceed to Phase 0 (TMS modality).
- If it DOES exist:
- Read `plan.md` (chosen scope, TMS modality, TC list, ROI verdicts).
- Read tail of `progress.md` (last completed phase + next planned phase).
- Surface to the user: scope, TMS modality, last completed phase, next phase, any pending TC creation chunks that did not finish (the most common interruption point — Phase 3 parallel bulk create capped at 10 subagents).
- Offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-test-documentation-<scope>-aborted/` first.
- Check `CLAUDE.md` for `{{TMS_CLI}}`. Value `bun xray` (or any Xray CLI) -> **Modality jira-xray**. Value is unset, `acli`-only, or `{{TMS_CLI}}` matches `{{ISSUE_TRACKER_CLI}}` -> **Modality jira-native**.
- If `CLAUDE.md` is ambiguous, look for a `.context/master-test-plan.md` line such as `TMS: Xray on Jira` or `TMS: Jira native`.
- If still ambiguous, list existing issue types in the project via `[ISSUE_TRACKER_TOOL] List issue types`. If the project exposes `Test Plan` / `Test Execution` / `Test Set` / `Pre-Condition`, it is **Modality jira-xray**. Otherwise **Modality jira-native**.
- **Only if all three checks fail**, ask the user the question above. Do NOT ask by default — autoresolve first.
- Modality jira-xray concepts + Xray REST/GraphQL/CLI -> `references/xray-platform.md`
- Modality jira-native project setup (Test issue type, Screen Scheme, custom fields) -> `references/jira-setup.md`
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/test-documentation/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: xray-cli

**Purpose**: Xray Cloud test management via `bun xray` CLI: create/list tests, manage test executions and plans, import JUnit/Cucumber/Xray JSON resul...

**Compact Rules**:
- Confirm the project is in Modality jira-xray. Resolution logic lives in `test-documentation/SKILL.md` §Phase 0.
- If the project is in Modality jira-native (no Xray plugin) -> **do not use this skill**. Instead, load `/acli` — TMS operations map to native Jira issues (see `test-documentation/references/jira-setup.md`).
- **Jira key**: `{{PROJECT_KEY}}-194` — resolved via Jira REST in-process. Requires Jira credentials configured (`auth login --jira-url --jira-email --jira-token` or the `JIRA_*` env vars).
- **Numeric Xray issueId**: `1042389` — used as-is, no resolution call.
- *Missing at Xray layer*: tests linked at the Jira layer but not registered with Xray. `--apply` re-attaches them.
- *Missing at Jira layer*: tests registered with Xray but without a Jira issuelink. Reported only — sync never auto-deletes.
- `~/.xray-cli/config.json` - Stored credentials and default project
- `~/.xray-cli/token.json` - Cached auth token (24h validity)
- `xray` binary is not installed in the environment.
- Auth cannot be completed in the current session.
- Operation is simple (single test status update, small query).
- Bulk test import (JUnit/Cucumber/Xray JSON).
- Backup / restore / large sync operations.
- Anything involving Test Plans or Test Executions at scale (xray-cli is far more complete).
- **X1.** NEVER call `bun xray ...` directly from workflow skills (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`). Workflow skills use `[TMS_TOOL]` pseudo-code and load `/xray-cli` — only this skill owns the literal CLI syntax.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/xray-cli/SKILL.md` · phase: `unknown` · extraction strategy: B
