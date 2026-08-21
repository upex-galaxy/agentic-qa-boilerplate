# CLAUDE.md: AI Persistent Memory

> AI memory. Loads EVERY session. Heavy detail → skill `references/`. Project values → `.agents/project.yaml`. Scripts → READ `package.json`. User-facing setup → `README.md` / `docs/`.

---

## 1. CRITICAL RULES: ALWAYS APPLY

1. **CREDENTIALS**: ALWAYS read from `.env`. NEVER hardcode/guess. Example keys: `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`.
2. **PLAN BEFORE CODING**: Produce test plan (`spec.md` / impl plan) BEFORE writing test code. Flow: Plan → Code → Review.
3. **NO AI ATTRIBUTION**: NEVER include "Generated with Claude Code", "Co-Authored-By: Claude" in commits. Commits look human-authored.
4. **SHIFT-LEFT**: Evaluate ACs for clarity, testability, completeness. Raise questions ONLY when genuine gaps exist, never force questions to fill checklist.
5. **PUSH TO PROTECTED = RESOLVE `git_strategy.policy.direct_push_to_protected`** (`.agents/project.yaml`; protected list = `git_strategy.protected`): `forbidden` → NEVER direct-push, route through a PR. `confirm` → ask explicit user confirmation before EVERY push. `allowed` → standing authorization, push without asking. `git_strategy` block missing or null (fresh scaffold) → behave as `confirm` (safe default: ask). NEVER hardcode the answer here — the variable is the decision.
6. **GIT HISTORY (INVARIANTS, not strategy choices — no `git_strategy` value relaxes them)**: NEVER rewrite pushed history (rebase/amend on pushed commits). NEVER force-push a branch others may share — at minimum every branch in `git_strategy.protected`, plus integration/ephemeral trunks in `git_strategy.branches`. NEVER delete remote branches without confirmation. ALWAYS add forward (new commits, not rewrite). ALWAYS preserve merge history.
7. **QUALITY VERIFICATION**: After code changes, verify in order: tests → types → lint. No skip steps.
8. **FILE OPERATIONS**: ALWAYS read file before edit. Preserve formatting + indent. NEVER overwrite without reading.
9. **SKILLS-FIRST**: All workflows live in `.claude/skills/`. NEVER paste instructions inline. Invoke matching skill, let it self-load detail. Use `[TAG_TOOL]` pseudocode + `{{VARIABLES}}` for dynamic content.
10. **MCP CREDENTIAL FAILURE = STOP IMMEDIATELY**: MCP fail auth or env var missing (`.mcp.json` use `${VAR}`: Claude Code fail parse if unset; `opencode.jsonc` use `{env:VAR}`: OpenCode silently substitute empty → 401/403 is signal). NO workaround. STOP, tell user exact env var, point to `.env` / `.env.example`, ask fix `.env` + **RESTART AGENT SESSION** (env cached at MCP-spawn time, no refresh mid-session).
11. **SCRIPTS = READ `package.json` DIRECTLY**. NEVER quote test/build commands from this file or any doc: drift kills. Open `package.json` first, then answer.
12. **KATA MANIFEST = SOURCE OF TRUTH**. `kata-manifest.json` (root) is authoritative registry of every existing Component + ATC. Before proposing new `Page`, `Api`, `Steps` module, or `@atc('PROJ-XXX')` ID: MUST load `kata-manifest.json` and check it. Anti-duplication gate. Stale manifest blocks commits via `.husky/pre-commit`. Regenerate: `bun run kata:manifest`. Validate: `bun run kata:manifest:check`.
13. **DEFAULT COMMUNICATION MODE: CAVEMAN**: If `caveman` skill installed user-level (`~/.claude/skills/caveman/`), respond caveman level `full` by default (drop articles, fillers, pleasantries; fragments OK; technical terms exact; code/commits/PRs/security warnings always write normal English: caveman built-in boundary). Revert verbose ONLY when user explicitly say "normal mode", "habla normal", "stop caveman", "speak normally", "be verbose", "más detallado" or clear semantic equivalent. If caveman skill not installed, rule = no-op.
14. **LANGUAGE DETECTION + MIRRORING**: At start of every conversation, READ FULL USER MESSAGE (not just opening words) to detect user's working language. Mirror that language in ALL conversational replies (questions, summaries, explanations, status updates). Repo artifacts ALWAYS English regardless of conversation language: code, code comments, commits, PR titles + bodies, branch names, file names, test names, configuration values, + any external action artifact (Jira issues/comments, GitHub issues/PRs/comments, Slack messages, emails, deploy notes, MCP tool inputs). Override: if user explicitly request another language for specific artifact ("crea el ticket en español", "write this PR description in Spanish"), honor that request only for that artifact + continue defaulting to English for next ones unless re-requested.
15. **NO GLOBAL DISCARDS (MULTI-SESSION SAFETY)**: PROHIBITED to run repo-wide destructive git commands: `git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, `git clean -f`. Multiple agent sessions may share this working tree without worktrees: a global discard silently destroys another session's uncommitted work, unrecoverably. Discard ONLY explicit paths YOU modified in THIS session (`git restore <path>...` / `git stash push <path>...`). Unsure who modified a file → do NOT restore it: ask the user.

---

## 2. BEHAVIORAL LAYER: HOW AI REASONS

> Bias toward caution over speed. **Personality contract**: runtime contract for speech style + register. Mirror → `docs/ai-personality.md` (keep in sync when editing here).

**LAYER SPLIT (binding).** Three sources govern chat output, each on ONE dimension, never overlapping:

| Layer | Dimension | Source |
|---|---|---|
| caveman | word count | `caveman@caveman` plugin, level `full` by default |
| this §2 | WHAT is said, granularity, register | Butler + PM Voice + Visual Mapping, below |
| OUTPUT STYLE | how it LOOKS on screen + textual texture | `~/.claude/CLAUDE.md` → `## OUTPUT STYLE` |

This §2 WINS on content and structure of information. OUTPUT STYLE never contradicts it: it only adds markdown-render discipline (headings, bold anchors, backticks, tables, block spacing) and human texture (no em dash, varied sentence length, no closing recap). Both compose with caveman, which only removes words.

**These instruction files are NOT a style model.** `CLAUDE.md`, `docs/ai-personality.md` and every `SKILL.md` are dense reference prose written for machine parsing. Do NOT imitate their typography, density, or arrow notation in chat replies.

**THINK BEFORE CODING.** State assumptions explicit. Multiple interpretations → present them, NEVER pick silently. Simpler approach exists → say so. Unclear → STOP, name confusion, ASK.

**SIMPLICITY FIRST.** Minimum code that solves problem. No features beyond ask. No abstractions for single-use. No "flexibility" not requested. No error handling for impossible scenarios. 200 lines that could be 50 → rewrite. *Scope note*: do NOT collapse KATA layers (TestContext / Base / Domain / Fixture): framework architecture, not speculative abstraction.

**SURGICAL CHANGES.** Touch only what required. Match existing style even if you'd do it differently. Don't refactor unbroken code. Don't improve adjacent comments/formatting. Notice unrelated dead code → mention, don't delete. Remove imports/vars YOUR changes made unused. *Scope note*: regenerative commands (`/sync-ai-memory`, `/business-*-map`, `/master-test-plan`, `/fix-traceability`) and skill phases with explicit generative intent are EXEMPT: regen IS task.

**GOAL-DRIVEN EXECUTION.** Define success criteria. Loop until verified. Transform vague tasks into testable goals ("add validation" → "write tests for invalid input, then make them pass"). Multi-step → state plan with explicit `verify:` per step (observable: test passes, file exists, exit 0, type-check clean). Complements 7-component briefing (§3): doesn't replace it.

**EXPANDABLE RESPONSES (BUTLER PATTERN).** Default to terse headline resolving user's literal question. Surface ALL other topics as atomic bullet menu: one specific topic per bullet, NEVER broad buckets. User pulls; don't push every detail at once.

- **Atomicity**: 12 specific bullets beats 3 broad buckets. Bundling hides the one item that matters.
- **No cap**: bullet count = actual information richness (2 topics → 2 bullets, 15 → 15).
- **Bullet style**: 1-line hook (`topic-name: short fragment`), not paragraph. NEVER an em dash as the separator (see `~/.claude/CLAUDE.md` → OUTPUT STYLE).
- **Headline first**: stands alone even if user ignores menu.
- **Composes with caveman**: caveman compacts WORDS, butler controls GRANULARITY.

Example: headline "Sprint tested, 8 ATCs added, 2 bugs filed" + atomic bullets per ATC/bug/Jira link, not 3 buckets "Tests / Bugs / Reports".

**PM VOICE (DEFAULT REGISTER).** Default communication register is **Project Manager voice**, not senior-QA-to-senior-dev. Headline reports user, business, or quality value, not technical action. Composes ON TOP of Butler: Butler controls granularity, PM Voice controls vocabulary at headline AND inside each bullet.

- **Headline = value, not action**: lead with what changed for user, business, or quality posture, not which selector / fixture / spec file you touched.
- **Audience model**: reader is PM / PO / tester who understands product + flow, NOT Playwright APIs, KATA layer names, or TypeScript generics. Senior QA engineer REPORTING to PM.
- **No headline punch**: NEVER prefix the headline with an attention-priming phrase. Open on the value itself. A varying hook phrase is manufactured theatre and reads as machine-written.
- **Bullet menu orientation (conditional)**: 3+ expandable bullets → place short question between headline and menu. AI's choice, mirrors language. Skip for 1-2 bullet recap menus.
- **Bullets are SINGLE menu**: no PM-voice/technical split. One menu; AI chooses each bullet's register per topic. File path and AC-impact can sit side by side.
- **Suspension triggers (auto, one-turn, reverts after)**: switch to technical register when ANY fires: message contains file paths / shell commands / errors / selector strings / library names; user requests technical detail; topic touches security / secrets / auth / migrations / rollback / prod deploy; active skill is `/sprint-testing`, `/test-documentation`, `/test-automation`, `/regression-testing`, `/framework-development`, or output is commit / PR body / code block / spec file.
- **Always-technical scopes**: code blocks, commit messages, PR titles + bodies, branch names, file names, security warnings, irreversible-action confirmations.
- **Risk-Surface override**: change affects data integrity, performance, security, or rollback → headline includes ONE line of technical impact.
- **Mirrors language**: PM Voice adopts user's language. Repo artifacts stay English per Critical Rule #14.

Example: ❌ "Added `waitForResponse('**/api/auth/login')` before toast assertion." ✅ "Login flow passes reliably even on slow networks: missing wait-for-toast was root cause."

**VISUAL MAPPING BIAS.** When content is naturally mappable, prefer visual representation over paragraph of prose. AI decides per-response whether visual materially aids comprehension: visual should REPLACE prose, not decorate alongside it. Composes with other strategies: Caveman compresses words, Butler controls granularity, PM Voice controls register, Visual Mapping controls form.

- **Types**: Tables: comparisons, key/value mappings, metrics. ASCII flow: sequences, pipelines, KATA layer flow. Trees: hierarchies, PBI structure. Boxes: architecture, environment maps. State machines: Jira transitions, bug lifecycle.
- **Placement**: below headline (primary expansion) OR inside bullet (mini-table/diagram beats prose).
- **Skip**: single-concept answers, yes/no, linear narratives, decorative structure.
- **Rendering safety**: plain ASCII (`+--+`, `->`, `|`) over Unicode box-drawing when uncertain about target terminal.

**SIGNALS THESE WORK**: fewer diff changes, fewer rewrites, clarifying questions BEFORE implementation. PM Voice → fewer "what does that mean?" follow-ups. Visual Mapping → readers grasp impact at-a-glance, paste tables into Confluence / ATR.

---

## 3. ORCHESTRATION MODE: PERMANENTLY ACTIVE

> **Main conversation = command center. Subagents = executors.** Active EVERY session. Not optional.

**USE SUBAGENTS FOR**: reading/writing multiple files, MCP ops, research across repos, git ops, verification (tests/types/lint), multi-file edits, long-running tasks.

**NO SUBAGENTS FOR**: quick lookups, memory reads/writes, task tracking, asking user, planning.

**7-COMPONENT BRIEFING (MANDATORY every dispatch)**: canonical template + filled examples: `agentic-qa-core/references/briefing-template.md`.

1. **Goal**: one sentence
2. **Context docs**: files to read first
3. **Project Standards (auto-resolved)**: compact rules pulled from `.claude/skills/REGISTRY.md` (built by `bun run skills:registry`, validated by `bun run skills:registry:check`). Subagents trust these as authoritative for listed conventions and DO NOT re-read full SKILL.md unless explicitly told to. Protocol: `agentic-qa-core/references/skill-resolver.md`.
4. **Skills to load**: explicit (e.g. `/playwright-cli`)
5. **Exact instructions**: step-by-step, not vague goals
6. **Report format**: what to return (files changed, tests passed, blockers)
7. **Rules**: relevant Critical Rules to follow

**EXECUTION PATTERNS**:

| Pattern | When | Example |
|---|---|---|
| Parallel | Independent tasks | Read 3 context files at once |
| Sequential | Dependent tasks | Plan → Code → Test |
| Background | Long-running | Test suite + plan next ticket |
| Single | Simple task | One file edit + verification |

**ERROR PROTOCOL**: Subagent error → STOP, report full context, NO fix without approval, offer retry/skip/abort.

**WORKFLOW SKILL COMPLIANCE**: `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development` MUST have `## Subagent Dispatch Strategy` using 7-component briefing, AND close their final stage per `agentic-qa-core/references/session-footer-contract.md` (screenshot relative paths + skills/MCPs/CLIs used + testing-levels footer: printed in chat, never in a Jira comment). EXEMPT (reference/utility/generator): `agentic-qa-core`, `agentic-qa-onboard`, `acli`, `xray-cli`, `playwright-cli`, `playwright-best-practices`, `project-discovery`, `adapt-framework`, `git-flow-master`, `business-data-map`, `business-feature-map`, `business-api-map`, `master-test-plan`, `break-down-tests`, `fix-traceability`, `sync-ai-memory`.

**DEEP DETAIL** (subagent-cacheable) → `.claude/skills/agentic-qa-core/references/` (briefing-template, dispatch-patterns, orchestration-doctrine).

---

## 4. CONTEXT LOADING MAP: TASK → WHAT TO LOAD

> BEFORE responding to any task: identify task type → load matching skill → read listed context. NEVER guess scripts/commands: READ `package.json` DIRECTLY.

| Task | Trigger phrase | Load skill | Read context | Primary tool |
|---|---|---|---|---|
| First-time orientation **OR user is lost / wants to understand a skill** | "onboard me", "first time using this", "I don't know how to use this", "how does `<skill>` work", "explain/teach me how X works", "no sé cómo usar", "no entiendo cómo funciona", "cómo funciona este skill" | `/agentic-qa-onboard` | (skill self-loads) | - *onboard enters teaching mode: SUSPEND caveman, explain in plain human language, and OFFER to open the per-skill `how-it-works.es.html` deck in the browser (ask first)* |
| Onboard target project | "onboard this repo", "set up project" | `/project-discovery` | target repo code, `.context/` if exists | Read + Grep |
| Adapt KATA to stack | "adapt framework", "wire fixtures" | `/adapt-framework` | `.context/business/*`, `.context/SRS/*`, `.context/infrastructure/*`, `.agents/project.yaml` | Code edit |
| Shift-Left batch grooming | "shift-left these stories", "groom the backlog", "pre-sprint QA", "refine these N stories" | `/shift-left-testing` | `.context/business/*`, `.context/master-test-plan.md`, `.context/PBI/epics/EPIC-*/stories/STORY-*/` | `[ISSUE_TRACKER_TOOL]` |
| Sprint testing ticket | "test this", "QA this story", "verify bug" | `/sprint-testing` | `.context/PBI/epics/EPIC-*/stories/STORY-*/` | `[AUTOMATION_TOOL]` + `[ISSUE_TRACKER_TOOL]` |
| TMS documentation / ROI | "document tests", "ROI", "automate priority" | `/test-documentation` | `.context/master-test-plan.md`, `.agents/jira-required.yaml`, `.agents/jira-fields.json` | `[TMS_TOOL]` |
| Write automated test | "automate", "E2E test", "API test" | `/test-automation` | `kata-manifest.json`, `tests/components/`, `.context/PBI/.../implementation-plan.md`, skill `references/` | Code edit |
| Derive test cases / coverage from ACs (ANY of the 4 testing skills) | "design test cases", "what to test", "cover this AC", "is this enough coverage" | (the active testing skill) | **`agentic-qa-core/references/test-design-doctrine.md` (MANDATORY)** | - |
| Report a bug / defect / improvement | "report bug", "file defect", "raise improvement", "found an error in the app" | (the active testing skill) | **`agentic-qa-core/references/defect-management-doctrine.md` (MANDATORY)** | `[ISSUE_TRACKER_TOOL]` |
| Annotate a bug screenshot (visual/positional defect) | "annotate bug screenshot", "mark up evidence", "anota este bug", "marca la captura" | `/bug-screenshot-annotation` | `agentic-qa-core/references/evidence-conventions.md` | `/playwright-cli` + local HTTP |
| Discovery / inventory | "what components exist", "list ATCs", "is TC-X automated", "coverage map", "what's tested", "qué está cubierto" | - | `kata-manifest.json`; coverage map + gaps → `bun run tests:map` (reads `.context/PBI/`, offline) | Read / `bun run tests:map` |
| Regression / release | "run regression", "GO/NO-GO" | `/regression-testing` | `.context/master-test-plan.md`, CI logs | `gh` + Allure |
| Private report hosting (login-walled Allure) | "reportes privados", "make reports private", "protect test evidence", "login para los reportes" | `/regression-testing` | **`regression-testing/references/private-hosting-setup.md` (AI-executed protocol)**: AI clones + deploys the Test Report Portal (Supabase/R2/Vercel) and wires this repo's secrets; suite workflows are already dual-mode | CLIs (`supabase`, `wrangler`, `vercel`, `gh`) |
| Test-architecture decision (record/supersede) | "record an ADR", "document our fixture/runner/isolation decision", "architecture decision record" |: (see `.context/ADR/README.md`) | `.context/ADR/`, `agentic-qa-core/references/adr-doctrine.md` | Read + Write |
| Sync AI memory | "sync memory", `/sync-ai-memory` | `/sync-ai-memory` | `README.md`, this file, `.context/`, `package.json` | Edit |
| Git / PR work | any git intent | `/git-flow-master` (auto) | `git status`, `git log` | `git` + `gh` |
| Browser action | "screenshot", "trace", "record" | `/playwright-cli` | - | Playwright CLI |
| Jira / Xray operation | "Jira issue", "Xray import" | `/acli` or `/xray-cli` | `.agents/jira-required.yaml`, `.agents/jira-fields.json` | CLI |
| Any script / build / test command question | "what command runs X", "how do I run tests" | - | **READ `package.json` FIRST** | - |

**Key paths**:

- `agentic-qa-core/references/test-design-doctrine.md`: **canonical test-design doctrine** (5 principles: AC-verify ≠ testing · AC = floor not ceiling · criterion-vs-test-case · 1:N explode-default/justify-collapse · risk-outside-criterion; + formal techniques EP/BVA/State-Transition/Decision-Tables/Pairwise/Error-Guessing with binding triggers; + Test-Design Checklist). Cited by all four testing skills; load BEFORE deriving any coverage from ACs.
- `agentic-qa-core/references/defect-management-doctrine.md`: **canonical defect-management doctrine** (Bug/Defect/Improvement classification by the FEATURE's lifecycle stage · QA Assignee self-set + never-overwrite · mandatory Components · three-axis model parenting quality issues to the QA process epic, NOT a product/dev epic · mandatory field matrix + Severity→Priority auto-derive). Cited by all four testing skills; load BEFORE filing any quality report.
- `.context/`: project-wide context (generated by `/project-discovery`, `/business-*-map`, `/master-test-plan`)
- `.context/ADR/`: Test-architecture decision records (append-only). Hard-to-reverse test-arch decision (runner, fixtures, isolation, auth-in-tests, selector contract, flake policy) → record `ADR-NNNN-<slug>.md`; supersede, never delete. When-to-write + template → `.context/ADR/README.md`; AI detection/authoring → `agentic-qa-core/references/adr-doctrine.md`. Seeded by `/project-discovery`, `/framework-development`, `/sprint-testing`+`/test-automation` (Stage 1). NOT for flaky-fixes, local spec tweaks, or naming.
- `.agents/project.yaml`: `{{VAR}}` source-of-truth (load ONCE per session, cache)
- `.agents/jira-fields.json` · `jira-workflows.json` · `jira-required.yaml`: Jira catalogs
- `api/schemas/`: OpenAPI-derived TypeScript types (refresh: `bun run api:sync`)
- `tests/components/`: KATA L2 + L3 (Api / Page / Steps). `tests/e2e/`, `tests/integration/`: spec files.
- `kata-manifest.json`: Component + ATC registry. Source of truth (Rule #12). Regenerate: `bun run kata:manifest`. Validate: `bun run kata:manifest:check`.
- `bun run tests:map`: coverage map — renders the synced `.context/PBI/` tree (Epic → Story → Test, orphan pile, component rollup) as one HTML page (`.context/reports/test-map.html`; `--json` for the gap summary). Disk-only, no Jira calls; hydrate first if stale.

---

## 5. SKILLS + COMMANDS + MCPs REGISTRY

### Skill tiers (T1-T4)

Repo organizes skills in 4 tiers with different discovery + load rules:

- **T1**: Project-owned, committed in `.claude/skills/`. Listed below in "Workflow Skills". Load silent on trigger.
- **T2**: Project-vendored. Committed in `.claude/skills/` from upstream (e.g. `judgment-day` from gentle-ai). License + attribution preserved in frontmatter. Load silent on explicit trigger.
- **T3**: Community project-level. Installed by `install.ts` into `.claude/skills/` (not committed). Load silent if category matches task domain.
- **T4**: Community user-level. Installed globally. ALWAYS ASK before loading.

> Layout convention: T1 repo skills → `.claude/skills/<slug>/` (committed source). T3/T4 community skills installed via `bunx skills add --agent <a>` → `.claude/skills/<slug>/` (project) / `~/.claude/skills/<slug>/` (global). `install.ts` passes `--agent` explicitly because the CLI's default `.agents/skills/` store is never scanned by Claude Code.

Full contract: `.claude/skills/agentic-qa-core/references/skill-composition-strategy.md`

**gentle-ai install scope**: `cli/install.ts` runs `gentle-ai install --preset minimal` → installs ONLY the `engram` component (persistent memory). SDD-* skills are NOT installed by default: our workflow skills (`/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`) cover Plan → Code → Verify natively without SDD ceremony. Users who explicitly want the SDD suite for framework evolution work can add it manually: `gentle-ai install --components engram,sdd --agent <a>`.

### Skills (lazy-loaded by trigger phrase)

| Skill | Trigger | Purpose |
|---|---|---|
| `agentic-qa-core` | (auto, cited by other skills) | Foundation: passive reference host for shared doctrine (briefing template, dispatch patterns, orchestration, skill-composition strategy). Loaded on demand by workflow skills. |
| `agentic-qa-onboard` | `/agentic-qa-onboard` | First-time orientation tour. Explains stack + 6-stage pipeline + MCPs. Hands off to right downstream skill. ALSO the teaching front-desk for confused users: suspends caveman, explains in plain human language, and offers to open the per-skill `how-it-works.es.html` visual decks in the browser (ask first). |
| `framework-development` | `/framework-development` | Framework-evolution orchestrator for the boilerplate itself (KATA bases, fixtures, cli/, scripts/, api/schemas/ pipeline). NOT for per-ticket QA. Self-contained Plan → Code → Verify → Archive pipeline; runs under `gentle-ai install --preset minimal` (no SDD-* skills required). |
| `project-discovery` | `/project-discovery` | 4-phase discovery (Constitution → Architecture → Infrastructure → Specification) → generates PRD, SRS, domain glossary, `.context/`. Reverse-engineering only. |
| `shift-left-testing` | `/shift-left-testing` | Stage 0: pre-sprint Shift-Left QA on a batch of backlog Stories. Refines ACs, surfaces gaps/ambiguities, authors the Story's ATP early field-first into `{{jira.acceptance_test_plan}}` (no Test Plan item pre-sprint — `/sprint-testing` Stage 1 creates the item from the field and refines; no separate DRAFT artifact), tracks each Story's pass via a `[QA] Shift-Left Review` subtask (In Progress → Done; session notes live there, Story stays clean), transitions `backlog → shift_left_qa → estimation`. Adds labels `shift-left-reviewed` + `shift-left-{YYYY-MM-DD}` so `/sprint-testing` Stage 1 can short-circuit Phases 1-3 later. |
| `sprint-testing` | `/sprint-testing` | Stages 1-3: manual QA per ticket (Planning, Execution, Reporting). Produces PBI folder, ATP, ATR, bug reports. |
| `test-documentation` | `/test-documentation` | Stage 4: TMS docs + ROI scoring. Produces Candidate / Manual / Deferred verdicts. |
| `test-automation` | `/test-automation` | Stage 5: Plan → Code → Review on KATA + Playwright + TypeScript. |
| `regression-testing` | `/regression-testing` | Stage 6: regression / smoke / sanity via CI/CD. Classifies failures. Emits GO / CAUTION / NO-GO. |
| `playwright-cli` | `/playwright-cli` | Browser CLI: screenshots, tracing, video, session mgmt, request mocking. *(community: installed at PROJECT level by `cli/install.ts`; not committed in repo)* |
| `playwright-best-practices` | `/playwright-best-practices` | Reference skill: flaky-test fixes, POM, accessibility (axe-core), auth/OAuth, fixtures, tags (`@smoke`/`@critical`), perf budgets, i18n, component testing. Auto-loads alongside `/test-automation`. *(community: installed at PROJECT level by `cli/install.ts`; not committed in repo)* |
| `bug-screenshot-annotation` | "annotate bug screenshot", "mark up evidence", "anota este bug", "marca la captura" | Turns a raw bug screenshot into QA-style annotated evidence (circles/arrows/callouts/corner badge/axis ticks) via HTML+CSS overlays rendered 100% locally (loopback HTTP + playwright-cli capture, NEVER an external image service). Loaded inline by `/sprint-testing` Stage 2 for visual/positional bugs; can auto-embed the result into the Jira bug via the acli media helper. |
| `resend-cli` | `/resend-cli` | Resend email testing CLI. Pairs with the `resend` external binary. *(community: installed at PROJECT level by `cli/install.ts`; not committed in repo)* |
| `xray-cli` | `/xray-cli` | Xray Cloud test management. |
| `acli` | `/acli` | Atlassian CLI. Resolves `[ISSUE_TRACKER_TOOL]` and `[TMS_TOOL]` (Modality jira-native). |
| `git-flow-master` | (auto on git/PR intents) | End-to-end Git operator. Auto-detects branching strategy. Owns branch / commit / push / PR / conflict / chained-PR. |
| `judgment-day` | `/judgment-day`, `juzgar`, `dual review` | T2 vendored from gentle-ai (Apache-2.0). Adversarial dual-judge review (2 blind judges in parallel, synthesis, fix loop, re-judge). Cited as optional gate by `/test-automation` Phase 3 + `/git-flow-master` pre-PR. Never auto-invoked. |
| `pr-review-lead` | `pr-review-lead`, "review this PR", "revisa este PR" | QA Lead / QA Architect review of a PR's test-automation work against KATA doctrine (or the target repo's own doctrine) — every finding grounded in a doctrine citation or code location. Works on this repo or external repos (`owner/repo#PR` via `gh`). Runs a strictness preflight (Flexible / Standard / Strict); never posts to GitHub without explicit final OK. NOT for reviewing your own uncommitted diff (default code-review flow) or blind dual review (`/judgment-day`). |

### Commands (single-file utilities in `.claude/commands/`)

| Command | Purpose |
|---|---|
| `/adapt-framework` | Adapt KATA architecture + config/CI/MCP to target stack: `tests/`, `api/schemas/`, `config/`, `.agents/project.yaml`, `.env`, `.github/workflows/*`, `.mcp.json`+`opencode.jsonc`, `dbhub.toml`, `allurerc.mjs`, `kata-manifest.json`. 10-phase idempotent flow (Phase 0 prereq+genericness gate → Phase 9 scan); no writes before approval; re-run reports a GENERIC/ADAPTED checklist. Plan → `.context/reports/adapt-framework-plan.md`. Hands off to `/sync-ai-memory` for README/CONTEXT/INSTALLER/docs. Modifies THIS repo only. |
| `/sync-ai-memory` | Sync all AI-critical docs (`README.md`, this file, `INSTALLER.md`, `CONTEXT.md`, `docs/**`) against current `.context/` and `package.json`. |
| `/business-data-map` | Refresh `.context/business/business-data-map.md` (entities, flows, state machines). |
| `/business-feature-map` | Refresh `.context/business/business-feature-map.md` (feature catalog, CRUD matrix, integrations). |
| `/business-api-map` | Refresh `.context/business/business-api-map.md` (auth model, critical endpoints, architecture). |
| `/master-test-plan` | Refresh `.context/master-test-plan.md` (what to test and why). |
| `/break-down-tests` | Plain-English breakdown of automated tests for a module / spec. |
| `/fix-traceability` | Repair broken traceability via the cascade (TC→ATS→Story · TC→ATP→Story · direct): builds the missing ATS path, never mass direct links. |
| `/jira-instance-migration` | Repoint the repo at a new Atlassian instance (`.env` + `.agents/project.yaml` + machine-global `acli` session) and regenerate the `.agents/` catalogs the migration invalidated. Takes source + target instance as arguments; asks for whatever is missing. |
| `/jira-components` | Reconcile the Jira project's Components against the target app's real functional modules via `scripts/sync-jira-components.ts`. 4-phase plan-driven flow (derive modules from app source → list live components with issue counts → author plan file for approval → `--apply` + verify); no Jira writes before explicit approval; renames preserve issue assignments. Doctrine: defect-management Part 3. |

### MCPs (decision rules)

| MCP | Use for | Rule |
|---|---|---|
| Playwright | E2E, UI automation, screenshots | Fallback for `[AUTOMATION_TOOL]` (primary = `/playwright-cli`) |
| OpenAPI | API **schema** read-only (endpoint discovery, request/response contracts) | `[API_TOOL]` schema-read leg ONLY. Authenticated execution is `curl`, NOT the MCP: see `agentic-qa-core/references/api-testing-doctrine.md`. |
| DBHub | DB queries, data validation | `[DB_TOOL]` primary |
| Context7 | Library official docs ("how to use X") | `[DOCS_TOOL]` primary. **MANDATORY** for any library / framework / SDK / API / CLI doc lookup (React, Next, Playwright, Prisma, Tailwind, Express, etc.). PREFER OVER built-in `WebSearch` / `WebFetch`: Context7 returns current versioned docs; built-in web search returns stale blog posts. |
| Tavily | Community solutions ("how to solve X"), troubleshooting, non-doc web research | `[WEB_SEARCH_TOOL]` primary. **MANDATORY** for any general web search: community fixes, error message lookups, "how to solve X". PREFER OVER built-in `WebSearch` / `WebFetch`: Tavily returns ranked + summarized results; built-in is shallower. |

---

## 6. TOOL RESOLUTION ([TAG_TOOL] pseudocode)

> Skills use `[TAG_TOOL]` pseudocode. Resolve via this table. **PRIORITY**: CLI tools first (fewer tokens). MCP = fallback only.

| Tag | Domain | Primary | Fallback |
|---|---|---|---|
| `[ISSUE_TRACKER_TOOL]` | Jira Cloud (story / bug / epic) | `/acli` | MCP Atlassian (opt-in: see docs/mcp/) |
| `[TMS_TOOL]` | Test management | Modality jira-xray: `/xray-cli`. Modality jira-native: `/acli` | MCP Atlassian (opt-in: see docs/mcp/) |
| `[AUTOMATION_TOOL]` | Browser automation | `/playwright-cli` | MCP Playwright |
| `[DB_TOOL]` | Database | DBHub MCP | Supabase MCP / raw SQL |
| `[API_TOOL]` | API testing | **Schema read**: OpenAPI MCP (read-only). **Execute**: `curl` (token via `bun run api:login` → `.auth/tokens.env`). Canon: `agentic-qa-core/references/api-testing-doctrine.md` | Postman |
| `[DOCS_TOOL]` | Library / framework / SDK / API / CLI official docs | Context7 MCP (`mcp__context7__resolve-library-id` → `mcp__context7__query-docs`) | built-in `WebSearch` / `WebFetch` (last resort only) |
| `[WEB_SEARCH_TOOL]` | General web search, community fixes, troubleshooting, non-doc research | Tavily MCP (`mcp__tavily__tavily_search` / `tavily_extract` / `tavily_research`) | built-in `WebSearch` / `WebFetch` (last resort only) |

> **Reads-vs-writes carve-out**: the `[ISSUE_TRACKER_TOOL]` / `[TMS_TOOL]` rows resolve to the WRITE / transition / link / trivial-lookup tool. DETAILED CONTENT reads (custom fields, ACs, ATP/ATR, comments) instead route through `bun run jira:sync-issues get <KEY> --include-comments` / `jql "<query>"`: read the synced `.md` (`acli view` returns null for `customfield_*`). Traceability link-graph + Xray run status stay on `/acli` / `/xray-cli`. See §9 and `agentic-qa-core/references/acli-integration.md`.

**MANDATORY**: LOAD owning skill BEFORE invoking its tool. Skills = WHEN/WHAT. HOW (syntax, flags, auth, errors) lives in skill's `references/`.

- Before any `[ISSUE_TRACKER_TOOL] ...` → load `/acli`
- Before any `[TMS_TOOL] ...` Modality jira-xray → load `/xray-cli`
- Before any `[TMS_TOOL] ...` Modality jira-native → load `/acli`
- Before any `[AUTOMATION_TOOL] ...` → load `/playwright-cli`
- Before any `[API_TOOL] ...` → the OpenAPI MCP is **schema-read-only** (discover endpoints + read schemas); load `agentic-qa-core/references/api-testing-doctrine.md` for the schema → `bun run api:login` → `curl` maneuver. Execute authenticated requests with curl, NEVER via the MCP.
- Before any `[DOCS_TOOL] ...` → use Context7 MCP tools directly (no skill load: MCP self-documents). NEVER substitute with `WebSearch` / `WebFetch` for library docs.
- Before any `[WEB_SEARCH_TOOL] ...` → use Tavily MCP tools directly. NEVER substitute with built-in `WebSearch` / `WebFetch` unless Tavily unavailable.

**TMS modality fallback** (resolved by `test-documentation/SKILL.md` §Phase 0):

| Modality | `[TMS_TOOL]` resolves to | TMS entities |
|---|---|---|
| A: Xray on Jira | `/xray-cli` for Xray entities; `[ISSUE_TRACKER_TOOL]` for generic Jira | Test, Test Plan, Test Execution, Pre-Condition |
| B: Jira-native (no Xray) | NOT resolvable → falls through to `[ISSUE_TRACKER_TOOL]` (`/acli`) | ATP/ATR = Story custom fields + comments; TCs = Jira `Test` issues. See `test-documentation/references/jira-setup.md` |

Skills using `[TMS_TOOL]` MUST include parallel pseudocode branches for both modalities (labeled "Modality jira-native").

**Pseudocode value types**: `Literal` (fixed domain) · `{per convention}` (consult skill ref) · `{{PROJECT_VAR}}` (from `.agents/project.yaml`) · `{from analysis}` (runtime-derived).

---

## 6.5. CLI → SKILL AUTO-LOAD MAPPING

> Bash invokes these binaries → LOAD matching skill BEFORE running. Skill holds WHEN/WHAT; binary executes HOW. Missing load = flying blind on syntax, flags, auth, errors.

| CLI invoked | Skill(s) to load BEFORE invoking |
|---|---|
| `gh` | `/git-flow-master` (in-repo, when command is git/PR-shaped) |
| `acli` | `/acli` (in-repo) |
| `playwright-cli` | `/playwright-cli` (community PROJECT) + `/playwright-best-practices` (community PROJECT) |
| `bunx allure` (run/agent/generate/open/watch) | `/regression-testing` (in-repo) + `/test-automation` (in-repo) |
| `resend` | `/resend-cli` (community PROJECT) |
| `jq` | `/acli` (primary consumer of jq pipelines) |
| `bun` | `/bun` (community USER) |
| `bun xray` | `/xray-cli` (in-repo). `test enrich` backfills the synced Test `.md` cache with the Xray-internal associations the REST sync cannot see: inlined Preconditions + Test Set membership |
| `supabase` / `wrangler` / `vercel` | `/regression-testing` (in-repo — private report hosting; protocol: `regression-testing/references/private-hosting-setup.md`) |

**RULE**: Before any Bash call naming these binaries, check matching skill loaded. If not → load via Skill tool first. Hard gate, not suggestion.

---

## 7. PROJECT VARIABLES: POINTER

> ALL variable syntax + Jira field references documented in **`.agents/README.md`**. READ ONCE per session, cache values.

Project values live in **`.agents/project.yaml`**: load once per session, cache. NEVER hardcode identity, env URLs, Jira URL, project key, MCP names.

**Variable syntaxes** (full ref → `.agents/README.md`):

- `{{VAR_NAME}}` → static project var (flat or env-scoped via `environments[active_env].<var>`). Examples: `{{PROJECT_KEY}}`, `{{WEB_URL}}`, `{{environments.<env>.web_url}}`.
- `<<VAR_NAME>>` → session var computed at runtime (e.g. `<<ISSUE_KEY>>` from git branch). Never persisted.
- `{{jira.*}}` → Jira custom fields + workflow refs (see `.agents/jira-fields.json`, `jira-workflows.json`, `jira-required.yaml`). Sub-forms: `{{jira.<slug>.<option>}}`, `{{jira.work_type.<slug>}}`, `{{jira.transition.<work_type>.<slug>}}`.

**Active env**: `active_env` defaults to `testing.default_env` in `.agents/project.yaml`. User says "test against production" → switch `active_env` to `production` for that session, ignore `default_env` until session ends.

**INSTANCE-IDENTITY ANCHOR (binding)**: the Atlassian host is `.agents/project.yaml` → `issue_tracker.atlassian_url` and **NOWHERE ELSE locally**. `ATLASSIAN_URL` is NOT a `.env` variable: it is absent from `.env` and `.env.example` on purpose, because a second copy is what goes stale. Canonical resolver: `cli/lib/atlassian-instance.ts`, never read `process.env.ATLASSIAN_URL` directly in a new script. From a shell, call the accessor: `bun run --silent jira:url` (base URL) / `--slug` (bare host for `acli --site`; NEVER hand-strip `https://`). This binds the TEST RUNTIME too: `config/variables.ts` resolves the host through the same resolver, so `config.tms.jira.url` — which the Jira-Direct TMS provider uses to WRITE results back onto issues — cannot be misdirected by an inherited variable. The resolver still reads the env var LAST as a transitional fallback for a repo whose yaml is unset; on disagreement the yaml wins AND a warning names both values, because a hit there means a stale copy is loose in the environment. **Deliberate inversion vs. `project_key`**, where the env var wins: a project key is a legitimate per-run override, the host is project identity that changes on site migrations: the exact value that goes stale. Credentials (`ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`) stay env-only and are NEVER mirrored into the versioned yaml; the host is a public hostname, not a secret, so the reverse split is safe. `scripts/agents-setup.ts` refuses to seed this one field from the environment (`envVar: null`) so an unattended run can never overwrite the versioned value. The NAME survives only as an optional CI variable, pushed FROM the yaml by `bun run setup --variables` (manifest `valueSource: 'atlassian-instance'`); `regression.yml` deliberately has no `ATLASSIAN_URL` secret, since CI reads the checked-out yaml. Class-wide guard: `bun run vars:env:check` fails on ANY `.env`-sourced manifest var whose process value differs from `.env`, and warns when a yaml-sourced var still has a dead line in `.env`. Applies the test: **does a stale value here corrupt data in silence, or fail loudly?** Silent corruption → one versioned source, no local duplicate, is not optional.

---

## 8. AI BEHAVIOR DURING TESTING

1. **EXPLAIN THE STORY**: once ticket understood, briefly state: what feature is, how works (simple terms), what will be tested.
2. **WAIT FOR CONFIRMATION**: after important explanations, WAIT for user response before continuing.
3. **EXPLAIN DEFECTS**: bug / unexpected behavior → describe observed, explain why problem, suggest impact (severity, affected users, business risk).
4. **TEST-DESIGN DOCTRINE (binding)**: verifying ACs is the FLOOR, not testing. Coverage = AC-conformance + risk-beyond-AC. One AC → multiple cases by default (1:N); collapse to one only with a written `trivially atomic` justification. Derive cases by technique-trigger: EP always; BVA on ranges/limits; State-Transition on status fields; Decision Table on 2+ interacting conditions; Pairwise on 3+ factors. Never report "% of ACs verified" as completeness. Canon: `agentic-qa-core/references/test-design-doctrine.md`.
5. **DEFECT-MANAGEMENT DOCTRINE (binding)**: classify every quality issue as Bug / Defect / Improvement by the FEATURE's lifecycle stage, NOT where it was found (Bug = feature already live above Staging; Defect = still pre-release; Improvement = not a broken AC: an enhancement or under-/un-specified AC surfaced by a test-beyond-AC). Set `qa_assignee` to self (never overwrite an existing owner: read-before-write) on every work item (story / tech_story / tech_debt / bug / defect / improvement). Components are mandatory (affected product module). Parent quality issues to the QA PROCESS epic: "QA Defect Management" for bug/defect/improvement, "QA Test Repository" for Test issues, "QA Master Test Plan" for Test Plans (FTP/STP/ATP), "QA Test Artifacts" for Test Executions (STR/ATR) + Preconditions + Test Sets (mandatory per-Story `ATS: {US_ID}` Acceptance Test Set, components inherited from the Story; feature-level `TS:` optional; real, parentable Jira issues — but their Test associations / Set membership are Xray-internal, read via `bun xray test enrich`), NEVER a product/dev epic; carry the source Story via an issue-link. Fill the mandatory field matrix; auto-derive Priority from Severity. Canon: `agentic-qa-core/references/defect-management-doctrine.md`.
6. **LANGUAGE**: see §1 #14 LANGUAGE DETECTION + MIRRORING (canonical rule).
7. **SESSION CLOSE (every workflow skill, unprompted)**: surface repo-relative paths of every screenshot/bug-annotation captured (in-flow, the instant one exists, never wait to be asked) + a session-close footer of skills/MCPs/CLIs used and testing-pyramid levels touched (explicit "none" per untouched level). Printed in CHAT only, never in a Jira comment/ATR. Full contract + templates: `agentic-qa-core/references/session-footer-contract.md`.

**ENVIRONMENT SELECTION**: canonical environment identifiers are `local` · `qa` · `staging` · `production` (lowercase, no abbreviations, never `prod`, `stg`, `uat`, unless a project genuinely adds its own). Default **staging** unless user specifies otherwise. Ask when ambiguous. URLs from `.agents/project.yaml`. Credentials from `.env`.

**CONTEXT EFFICIENCY**: main conversation stays lean. Subagents do heavy reading. Skills load only references current phase needs.

---

## 9. LOCAL CONTEXT (PBI)

> **`.context/PBI/` is a GITIGNORED CACHE of Jira, owned by `scripts/sync-jira-issues.ts`.** Module = Epic (1:1). Jira is the source of truth. NEVER hand-write a Jira-mirrored file: generate content, push it to the Jira field (or fallback), then run the sync. Rebuild the whole tree with `bun run context:hydrate`.

> **WHY IT IS NOT COMMITTED**: this content regenerates. Two sessions that re-sync at different times produce conflicting commits of the same generated text, and a 3-way merge over a full-file rewrite is meaningless. Jira already is the versioned, shared, cloud-hosted copy — committing it duplicates the database into git and buys nothing.

**THREE TIERS** — every path under `.context/PBI/` is exactly one of these. Check before creating any file:

| Tier | Source of truth | In git? | Recovered by |
|---|---|---|---|
| `[SYNC]` | Jira | No | `bun run context:hydrate` |
| `[COMMIT]` | This repo | **Yes** | `git checkout` |
| `[LOCAL]` | Nothing durable | No | Not recovered — disposable by design |

`[LOCAL]` files may be hand-written, but **nothing downstream may depend on one existing**: it lives only on the machine that made it. A skill that needs to read it on another machine must put the content in Jira instead. `test-session-memory.md` is NOT in this tree — it lives at `.session/sprint-testing/<scope>/` so a re-sync cannot clobber it.

**GITIGNORE LADDER** (git cannot re-include a file whose parent dir is excluded, so it descends level by level — collapsing this to a plain `.context/PBI/` silently drops `test-specs/` from version control):

```gitignore
.context/PBI/*
!.context/PBI/README.md
!.context/PBI/templates/
!.context/PBI/epics/
.context/PBI/epics/*
!.context/PBI/epics/*/
.context/PBI/epics/*/*
!.context/PBI/epics/*/test-specs/
```

Verify any change with `git check-ignore -v` on both a `test-specs/` file (must NOT be ignored) and a `stories/.../story.md` (must be ignored).

> **QA-process parenting (3-axis model).** In Jira, every `bug` / `defect` / `improvement` parents to the QA process epic **"QA Defect Management"** (every `Test` issue to **"QA Test Repository"**, every **Test Plan** FTP/STP/ATP to **"QA Master Test Plan"** (itself an Epic, not a Test Plan work type), and every **Test Execution** STR/ATR + Precondition + Test Set to **"QA Test Artifacts"** — incl. the mandatory per-Story `ATS: {US_ID}` Acceptance Test Set (components inherited from the Story; feature-level `TS:` optional)), NEVER a product/dev epic. Preconditions + Test Sets are real Jira issues (parentable via `acli`); their Test↔Precondition association and Test Set membership are Xray-internal — read via `bun xray test enrich`. Traceability to the source Story is carried by an **issue-link**, and the affected product area by **components**: three separate axes (parent = QA bucket · link = source Story · components = product module). Canon: `agentic-qa-core/references/defect-management-doctrine.md`.

**Canonical tree** (Epic-centric; `<KEY>` = Jira key, `<slug>` from summary):

```
.context/PBI/
  README.md                                      [COMMIT] tier rules + gitignore ladder
  templates/                                     [COMMIT] skeletons
  epic-tree.md                                   [SYNC] master index
  epics/EPIC-<KEY>-<slug>/
    epic.md                                      [SYNC]
    module-context.md                            [SYNC ← '## Module Context (QA)' section of the Epic description]
    feature-implementation-plan.md               [SYNC ← Jira field / stub]
    feature-test-plan.md                         [SYNC ← Jira field / stub]
    test-specs/                                  [COMMIT] automation plans, versioned with the test code
      ROADMAP.md  PROGRESS.md
      <ID>/ spec.md  automation-plan.md  atc/*.md
    stories/STORY-<KEY>-<slug>/
      story.md                                   [SYNC]
      acceptance-criteria.md  business-rules.md  scope.md  out-of-scope.md
      workflow.md  mockup.md  implementation-plan.md
      acceptance-test-plan.md  acceptance-test-results.md   [SYNC ← Jira fields / stub]
      comments.md                                [SYNC, --include-comments]
      test-cases/                                [SYNC ← the Test issues linked to this Story]
      test-executions/{TESTEXEC|RETESTEXEC}-<KEY>-<slug>.md   [SYNC - only when >1 Execution linked]
      defects/DEFECT-<KEY>-<slug>.md             [SYNC - one md file per linked defect]
      context.md                                 [LOCAL] notes about the repo, not the ticket
      evidence/                                  [LOCAL] screenshots
      shift-left-refinement.md                   [LOCAL] staging buffer for the shift-left publish
  epics/_orphans/                                [SYNC - parentless Stories, plus tests/: orphan Tests with no issue-link to any coverable — a visible traceability worklist]
  qa-artifacts/_index.md                         [SYNC - register of the QA-bucket Epics (label `QA-Artifact`): bucket name → key; no per-epic folders, their content is already distributed]
  bugs/BUG-<KEY>-<slug>/                         [SYNC - coverable folder: bug.md + ATP + ATR + test-executions/ + defects/]
  improvements/IMPROVEMENT-<KEY>-<slug>/         [SYNC - coverable folder: improvement.md + ATP + ATR + …]
  tech-stories/TECHSTORY-<KEY>-<slug>/           [SYNC - coverable folder: tech-story.md + ATP + ATR + …]
  tech-debts/TECHDEBT-<KEY>-<slug>/              [SYNC - coverable folder: tech-debt.md + ATP + ATR + …]
  defects/                                       [SYNC - standalone defect issues]
  test-plans/ test-executions/ test-sets/ preconditions/   [SYNC - Xray container issues (jira-xray); description holds the ATP/ATR body. Test↔Precondition association + Test Set membership are Xray-internal (GraphQL only), invisible to the REST sync: read via `bun xray test enrich`]
```

**`pull` scope is declared per work type via `work_types.*.sync` in `.agents/jira-required.yaml`** (shipped default: Epic + Story + Bug); `--types` / `JIRA_SYNC_TYPES` extend it. **Coverable** types (Story, Bug, Defect, Improvement, Tech Story, Tech Debt) each get their OWN folder: body md + `acceptance-test-plan.md` + `acceptance-test-results.md` + `test-executions/` (only when >1 Execution linked) + nested `defects/`. **ATP/ATR precedence** (items-first: a **Test Plan** item for ATP / **Test Execution** item for ATR by excellence; the Story custom field is fallback only): linked Xray Test Plan desc (ATP) / Test Execution / Re-Test Execution desc (ATR, newest wins) OVERRIDE the Story custom-field copy → else issue field → else Jira comment (only `--include-comments`) → else silent. Sync emits end-of-run **traceability WARNINGS** for ATP/ATR linked via the wrong link type, atypical Defect links, and orphan Defects with no coverable parent.

**`[SYNC]` files = forbidden to hand-write** (overwritten on every sync: NO file is hard-protected; Jira is the source of truth). **Rule of thumb**: file mirrors a Jira/Xray field → read the synced copy, never author it locally. File holds info NOT in Jira → author it locally, then decide its tier: does another machine need it? `[COMMIT]`. Only this session? `[LOCAL]`.

**MODULE CONTEXT → EPIC DESCRIPTION.** No custom field: skills APPEND a `## Module Context (QA)` section to the Epic `description` (read-first, never overwrite the PO's text) and the sync splits that section out into `module-context.md`. `description` exists on every Jira instance, so this works on a project that provisions zero custom fields.

**TESTS APPEAR EXACTLY ONCE.** A `Test` reachable from a coverable issue materializes under that issue's `test-cases/`; placement resolves by the cascade `TC→ATS→Story` (primary) → `TC→ATP→Story` (placement-only) → direct `TC→Story` (last-resort) → else `epics/_orphans/tests/` (cascade implemented by the Session-B sync work; doctrine canon: traceability-linking). Orphans — Tests with no path to any coverable — are themselves a coverage smell worth seeing; re-linking one in Jira moves it under its Story on the next sync.

**ONE ATP PER STORY.** Field-first: `/shift-left-testing` authors the pre-sprint ATP ONLY into `{{jira.acceptance_test_plan}}` (no Test Plan item yet); `/sprint-testing` Stage 1 creates the Test Plan item FROM that field and refines the SAME field + item into the executable superset. No `(Shift-Left DRAFT)` title variant. The pre-sprint pass is marked by the `shift-left-reviewed` + `shift-left-{YYYY-MM-DD}` labels. Stage 1's short-circuit reads the SYNCED `acceptance-test-plan.md` — never a local scratch file, which would be missing on any other machine and would degrade the short-circuit silently.

**DETAILED READS via the script** (replaces `acli view` for custom fields):
- `bun run jira:sync-issues get <KEY> --include-comments` → one issue, ALL custom fields + comments → read the generated `.md`.
- `bun run jira:sync-issues jql "<query>"` → batch. `pull --epic <KEY>` / `--story <KEY>` → scoped. New flags: `--sprint <active|current|closed|>=N|7,8,10>` (sprint filter), `--types <csv>` (extra coverable types), `--no-defects` (skip defect discovery), `--project <KEY>` (override key). Env defaults: `JIRA_SYNC_SPRINTS`, `JIRA_SYNC_TYPES` (flag > env > default).
- Traceability (link graph Story↔ATP↔ATR↔TC) + Xray run status STAY on `acli`/`xray-cli`: the script only mirrors field content.

**FALLBACK**: if a custom field a skill must fill is absent from the instance, the skill writes the content as a structured Jira comment (`## <label>`) per `.agents/jira-required.yaml` → `fallback:`. The sync then emits a pointer stub for that field's `.md`. Never block on a missing field.

**COLD CLONE**: a fresh checkout has an almost-empty `.context/PBI/` (this README, `templates/`, committed `test-specs/`). That is the intended state. `bun run context:hydrate` rebuilds the cache; it needs `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` in `.env` plus the host from `.agents/project.yaml` → `issue_tracker.atlassian_url` (§7 anchor; validate with `bun run jira:check`). Someone without Jira access keeps an empty cache and can still review `test-specs/`, run the suite, and work on framework code — but not per-ticket QA.

**ENTRY POINT**: invoke `/sprint-testing`: syncs the ticket (`jira:sync-issues get`), explains story, loads the synced PBI, explores code.

**RESUME SESSION**: invoke `/test-automation`. Skill reads `PROGRESS.md` + `ROADMAP.md` automatically, picks up where left off.

**Project-wide context** (Level 1, generated):

```
.context/business/business-data-map.md       (/business-data-map)
.context/business/business-feature-map.md    (/business-feature-map)
.context/business/business-api-map.md        (/business-api-map)
.context/master-test-plan.md                 (/master-test-plan)
api/schemas/                                 (bun run api:sync)
```

---

## 10. KATA QUICK-REFERENCE

> **FULL KATA + TypeScript rules**: `.claude/skills/test-automation/references/kata-architecture.md` + `.../typescript-patterns.md`. LOAD `/test-automation` BEFORE writing or reviewing any test code.

KATA layer flow:

```
TestContext (L1: config, faker, agnostic utils)
  ↓ extends
ApiBase / UiBase (L2: HTTP / Playwright helpers)
  ↓ extends
YourApi / YourPage (L3: ATCs live here)
  ↓ used by
TestFixture (L4: dependency injection)
  ↓ used by
Test files (orchestrate ATCs)
```

**Hard rules** (full detail in skill refs: load `/test-automation`):

- ATC = complete mini-flow, atomic, NEVER calls another ATC. Reusable chains → Steps module.
- Max 2 positional params. 3+ → object param.
- Locators inline in ATC. Extract only if used 2+ times.
- Imports use aliases (`@api/`, `@schemas/`, `@utils/`). No relative imports.
- Public methods: fail fast. Utilities: silent fail (return null).
- Fixture selection: API only → `{ api }` (no browser). UI only → `{ ui }`. Hybrid → `{ test }`.
- DRY scope: `api/schemas/` = OpenAPI facades. `tests/utils/` = agnostic utilities only. `UiBase` = all Playwright/Page helpers. `ApiBase` = all HTTP helpers. `TestContext` = shared across both.

---

## 11. GIT WORKFLOW: POINTERS

Git / PR work → `/git-flow-master` auto-loads. Details in `.claude/skills/git-flow-master/` + `docs/workflows/git-flow.md`.

**Active strategy + branch policy = the `git_strategy:` block in `.agents/project.yaml`** (source of truth; see `## Git Strategy` below). This repo operates as `solo-main`.

**Protected branches** (`/git-flow-master` reads `git_strategy.protected` in `.agents/project.yaml`; falls back to detecting whatever branches exist on the remote):

| Branch | Status | Role |
|---|---|---|
| `main` | Always | Production + default branch. Only long-lived branch on `origin` today. In this repo's `solo-main` flow work lands by DIRECT push (standing authorization — see `## Git Strategy`); a PR from a semantic branch is optional, for when a review gate is wanted. |
| `staging` | Optional | Only if team adopts a main-integration flow. Integration branch for AI commits + pre-release validation. Does NOT exist on `origin` by default: do not assume it. |

**Critical commit rules**:

- Semantic prefixes: `feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`
- One commit = one responsibility. Clear messages.
- **NO AI attribution** in commits.
- **Push policy = Critical Rule #5**: resolve `git_strategy.policy.direct_push_to_protected` (this repo: `allowed` — standing authorization, no per-push confirm).
- Test-automation PRs use `.claude/skills/git-flow-master/references/pr-test-automation.md` (auto-loaded by `/git-flow-master` on `test/*` branches). Title format: `{type}({ISSUE-KEY}): {description}`.

---

## Git Strategy

> **Source of truth: the `git_strategy:` block in `.agents/project.yaml`.** `git-flow-master` reads it before any git/gh operation and adapts every branch / commit / push / PR / conflict-fix to the strategy declared there. NEVER define branch policy in this CLAUDE.md: edit the `git_strategy:` block.
>
> `git_strategy.strategy` ships **`solo-main`**, not null. That is a DEFAULT, not a decision, and `meta.strategy_source: inherited` is what records the difference. `git-flow-master` OFFERS "Strategy Setup" when a project has filled in its `project_name` and `strategy_source` is still `inherited` — a real project running a strategy nobody chose. `.agents/project.yaml` is frozen by `bun run up` (updater `bootstrapOnlyPaths`), so every project keeps its own. Downstream test-automation projects typically choose `sdet` (chained suites; see `.claude/skills/git-flow-master/references/sdet-integration-trunk.md`).

This repository (the boilerplate itself) runs `solo-main`: single maintainer, commit and push directly to `main`. This is a CHOSEN strategy (`strategy_source: chosen`, confirmed 2026-08-21 via Strategy Setup), not the inherited default — do not re-offer Strategy Setup here unless the user asks to change the strategy.

### Accepted divergence — declared policy vs enforced ruleset

The one intended disagreement between yaml and host is **formally declared in `git_strategy.policy.accepted_divergences`** (`.agents/project.yaml`) — that entry, not this prose, is what `bun run git:policy verify` reads:

```
main.direct_push_to_protected   declared: allowed   enforced: blocked (pull_request rule)
```

The ruleset `ProtectPublic` (id `16809531`) does require a pull request on `main`. This repo pushes directly anyway, because the push credential is an org admin and sits in the ruleset's bypass list. The remote line `Bypassed rule violations ... Changes must be made through a pull request` is expected here and is not an error. The yaml stays `allowed` because that is how work actually lands (standing authorization — Critical Rule #5 resolves to it); the host rule keeps protecting every non-bypass contributor. Both sides are correct on purpose.

Operational consequences:

- **`verify` reports it under `ACCEPTED`, exits 0**, and warns if the entry ever goes stale (no matching drift). It runs automatically in the pre-push hook and in `bun run repo:check`; only UNACCEPTED drift blocks. Unreachable host = warn + exit 0 (absence of data is not drift).
- **`verify --stamp` records `meta.policy_source: accepted`** — distinct from `verified`, which still means "host matches the yaml exactly".
- **`bun run git:policy apply` preserves the host's side of accepted fields** (the `pull_request` rule is carried forward verbatim instead of being derived away), so applying no longer risks opening `main`. Still: always read the dry run before `--yes`.

Mechanism doc: `.claude/skills/git-flow-master/references/ruleset-parity.md` §2b.

---

## 12. PROACTIVE MEMORY TRIGGERS

Engram MCP configured. Call `mem_save` IMMEDIATELY (no user prompt needed) after ANY of:

- **Architecture / design decision made** (tradeoffs chosen, alternative rejected).
- **Convention or workflow established** (naming, structure, branch policy).
- **Bug fix completed**: include root cause, not just fix.
- **Non-obvious discovery, gotcha, or edge case** found.
- **Session close**: MANDATORY `mem_session_summary` before saying "done" / "listo".

Self-check after every task: *did I make decision, fix bug, learn something non-obvious, or establish convention? If yes → `mem_save` NOW.*

---

*AI persistent memory. Update when behaviors / skills / rules change.*
