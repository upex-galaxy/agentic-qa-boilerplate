# Skill Registry (auto-generated)

> Generated: `2026-08-21T18:39:48.721Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.claude/skills/agentic-qa-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 15

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
- **Speak like a human, not a terminal.** For the whole explanation, **suspend any compressed / caveman register** — full sentences, warm tone, simple words, zero unexplained jargon. Define each technical term the first time you use it ("an ATC — basically one complete test case, start to finish"). This is an explicit in-skill override of the default register; resume your normal style once the person is oriented.
- **Mirror the user's language.** Spanish in → explain in Spanish. English in → explain in English — but note that the visual decks ship in Spanish only (technical terms stay in English inside them).
- **Start from where they are.** If the goal is unclear, ask ONE quick question ("are you trying to test a ticket, or understand the whole flow?"). Don't dump all six stages on someone who asked about one.
- **Concept first, in plain words** — what the activity is and *why* it matters — before any command, flag, or file path.
- **Then offer the visual presentation.** Each workflow skill has a `how-it-works` deck that walks the skill's workflow step by step: a cover slide, a full workflow map (main path + adjacent paths), then one phase per slide with the craft concepts embedded where they apply. Offer to open it in their browser — follow the opening protocol below.
- **Hand off when oriented.** Once they know which skill to call, point them at it and step back.
- **Announce + ask.** "I can open a short visual deck that walks through how `/sprint-testing` works — the full workflow map first, then each phase step by step. Want me to open it in your browser?"
- **Decks are Spanish-only** (`.es.html`). If the user speaks English, mention the deck is in Spanish (technical terms stay in English) before opening it.
- **On a yes, open exactly one deck** — published URL first; local file as offline fallback (pick the OS command for the user's platform):
- **One at a time.** Let the person watch and come back with questions before offering the next skill's deck. Do not batch-open several.
- **After it opens,** tell them the keys (`←` `→` to move, `S` for speaker notes) and offer to walk the slides together or answer questions as they go.
- **For "how does KATA work" / architecture questions,** also offer the interactive KATA Academy (`.../kata/`) — 8 interactive chapters, Spanish, presentation mode with the `P` key.
- Syncs the ticket from Jira via `bun run jira:sync-issues get <KEY> --include-comments` (canonical detailed read — `acli view` returns null for custom fields), then reads the materialized `.md` files.
- Loads the synced context from `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (Module = Epic; Jira-synced files are a read-only cache).
- Explores the relevant code in the target repo.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/agentic-qa-onboard/SKILL.md` · phase: `bootstrap` · extraction strategy: B

---

## Skill: bug-screenshot-annotation

**Purpose**: Turns a raw bug screenshot into a QA-style annotated evidence image — circles/ovals around the broken region, arrows, callout text boxes,...

**Compact Rules**:
- A quota-walled image MCP was simply unavailable (429 across every tier). Not a design problem — just dead.
- A second generative service got hard-blocked by the agent runtime's own data-exfiltration classifier, because QA screenshots carry real product/customer/competitor data and the destination was not a trusted host. Critically, **explicit user authorization in chat did not lift the block** — and one screenshot had already leaked to the service's public S3/CloudFront bucket before the second attempt was caught.
- **Input**: a raw screenshot that already exists on disk (typically in the ticket's PBI `evidence/` folder). This skill overlays shapes; it does not generate or edit images from a text description.
- **Output**: exactly ONE file that counts as evidence — the final rendered annotated PNG, in the ticket's `evidence/` folder. The crop and the annotation HTML are Bucket C working files (see `../agentic-qa-core/references/evidence-conventions.md` §1): session scratchpad only, never referenced from Jira/ATR/bug tickets.
- **Not for**: filing the bug (reporting-templates owns that), plain before/after shots that read clearly raw, photos of physical objects/documents.
- **Identify the region.** From the raw screenshot (or its accessibility snapshot), work out the pixel crop box and roughly where each annotation shape lands relative to it.
- **Crop with Python + PIL — scratchpad only.**
- **Build the annotation HTML — scratchpad only.** The crop goes in as a background `<img>`; each annotation is one absolutely-positioned `<div>` overlay. Do NOT design from scratch — copy/adjust the commented blocks in `references/shapes.html` (circle-callout, arrow-to-region, callout-box, badge-corner, axis-tick + axis-tag, before-after) and keep its z-index scale.
- **Serve it over loopback.** The browser-automation CLI refuses `file://` URLs (errors out before rendering) — a local HTTP server is the only way, and loopback binding is also what keeps this approach exfiltration-safe, not just a workaround:
- **Capture with the browser-automation CLI.** Load `/playwright-cli` first (CLI → skill auto-load rule) for exact verbs/flags. Flow: open `http://127.0.0.1:<port>/annotation.html`, resize the viewport to the HTML's real dimensions (equal or larger — a smaller viewport clips callouts), then screenshot with an explicit destination path into the ticket's `evidence/` folder, named:
- **Inspect and iterate.** Read the PNG back and check it reads cleanly. Not optional and not one-shot — expect at least one adjustment pass: move/resize a circle or callout box, rewrap/shorten callout text, nudge the badge or arrow out of a collision.
- **Clean up.** Kill the HTTP server process (`kill <pid>` or `pkill -f "http.server <port>"`). Never leave it running past the session.
- **Report the path — immediately, unprompted.** The moment the final PNG lands in `evidence/`, state its repo-relative path in chat, in that same turn (standing contract: `../agentic-qa-core/references/session-footer-contract.md` Part 1). The path must also reappear in the session-close consolidated screenshot list, leading the "Bug annotations" group.
- **(Optional — this repo's upgrade over the manual-attach model.) Embed into the bug issue.** Jira accepts inline images via the bundled helper — offer to publish the annotated PNG directly as an evidence comment on the bug (human confirms first):
- **Badge hidden behind a callout box.** Both are `position: absolute`; without explicit stacking, DOM order (not visual intent) decides paint order. `references/shapes.html` fixes this with an explicit z-index scale — base image `1` → circles/arrows/ticks `10` → callout boxes `20` → corner badge `30` (always topmost). Skipping the scale is the #1 source of annotation bugs; don't let a copy-pasted block quietly drop its `z-index`.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/bug-screenshot-annotation/SKILL.md` · phase: `unknown` · extraction strategy: B

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
- **Plan artifact location**: `.session/framework-development/<change-name>/plan.md`. The `.session/` tree is gitignored — the plan is local, not committed. Recovery on mid-run crash: the file persists; the orchestrator reads it back on the next session via Phase 0 resume check (see `agentic-qa-core/references/session-management.md` §4).
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
- **A `404` from `branches/{b}/protection` does NOT mean the branch is unprotected.** A repo governed by rulesets returns `404` there while enforcing PR requirements, approvals, signed commits and non-fast-forward bans through `rules/branches/{b}`. Stopping at the classic endpoint produces a confident "unprotected" reading on a branch that requires a reviewed pull request.
- **A push that succeeds is not evidence of an absent rule.** Org owners and anyone on the ruleset bypass list push through while the rule still binds everyone else. When a push prints `Changes must be made through a pull request`, that was a BYPASS: report it as one, never as permission. With `git_strategy.policy.admin_bypass: true` (or the divergence listed in `git_strategy.policy.accepted_divergences`), the `Bypassed rule violations` remote line is the DOCUMENTED norm — mention it in the report as expected, do NOT treat it as an anomaly, do NOT stall asking for confirmation, and NEVER open a PR to "satisfy" the rule.
- **`require_code_owner_review: true` with no `CODEOWNERS` file is unsatisfiable, not strict.** Nobody outside the bypass list can clear it, so every merge becomes a bypass.
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

## Skill: pr-review-lead

**Purpose**: Acts as a QA Lead / QA Architect reviewing a pull request's test-automation work against this repo's KATA doctrine (or the target repo's...

**Compact Rules**:
- `agentic-qa-core/references/briefing-template.md`, `agentic-qa-core/references/dispatch-patterns.md`, `agentic-qa-core/references/orchestration-doctrine.md` — when a PR is large enough to warrant subagent fan-out (see Step 2).
- The default doctrine set for KATA/test-automation PRs, read fresh every invocation (never from memory of a prior session): `test-automation/references/kata-architecture.md`, `test-automation/references/typescript-patterns.md`, `test-automation/references/review-checklists.md`, `agentic-qa-core/references/test-design-doctrine.md`, `agentic-qa-core/references/defect-management-doctrine.md`.
- `references/severity-and-scoring.md`, `references/evidence-and-doctrine-lookup.md`, `references/output-and-posting-flow.md` — this skill's own reference material, read at the step noted below.
- **Flexible** — only flag things that are evidently wrong or could hurt test reliability/design: real bugs, hardcoded secrets, flaky-prone data dependencies, missing coverage that's genuinely unaddressed. A pattern that diverges from "textbook" KATA but works fine is not a finding.
- **Standard (recommended default)** — same real-defect bar as Flexible, plus doctrine-pattern deviations surface as light observations, explicitly framed as a comparison ("the documented pattern does X, this PR does Y") rather than an error. Never let a pattern note drag the score the way a real defect does.
- **Strict** — full literal compliance pass against every applicable doctrine file. A deviation is a tagged finding even when it works fine, especially anything that isn't really part of the documented flow/architecture. Still keep the Real vs. Pattern buckets separate in the output — Strict widens what counts as a finding, it does not turn pattern notes into "errors."
- **This repo**: load `CLAUDE.md` in full, plus the doctrine files listed under Dependencies above. This is the reference standard.
- **External repo**: check whether the target repo ships its own `CLAUDE.md` / `.claude/skills/` / `.context/` doctrine before assuming anything — many sibling projects are forked from this same boilerplate and carry (a possibly-evolved version of) the same KATA doctrine, but you cannot assume that without checking. If it has its own doctrine, that repo's doctrine is authoritative for this review, not this repo's copy. If it has none, fall back to this repo's KATA doctrine as the reference standard, and say so explicitly in the output ("this repo has no doctrine of its own, findings are graded against `agentic-qa-boilerplate`'s KATA conventions").
- **This repo, current branch's PR**: `gh pr view`/`gh pr diff` against the working repo.
- **External repo**: `gh pr view <N> --repo <owner>/<repo> --json ...` for metadata/commits/files, then per-file `gh api repos/<owner>/<repo>/pulls/<N>/files --paginate` for patches. Large PRs (`gh pr diff` errors past ~20k lines, a real limit you will hit) fall back to per-file patches via the same paginated `files` endpoint — never give up and skim the PR description instead of the code.
- Distinguish real work from noise: a large diff is sometimes 95%+ an unrelated bulk sync/vendor-update commit. Check `commits[].messageHeadline` before assuming every line matters; call this out to the user rather than reviewing the noise commit line-by-line.
- A concrete code location (file:line in the diff) showing the defect itself, and/or
- A doctrine file:section backing the "this is wrong per our conventions" claim.
- **Real / Reliability** — bugs, hardcoded credentials, data dependencies that can silently break, scalability foot-guns, genuinely unaddressed coverage gaps. Weighted at every strictness level.
- **Pattern / Doctrine-deviation** — diverges from a documented convention but isn't a functional defect. Weight depends on the Step 0 level (soft observation at Flexible/Standard, tagged finding at Strict — see `references/severity-and-scoring.md`).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/pr-review-lead/SKILL.md` · phase: `unknown` · extraction strategy: B

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
- `agentic-qa-core/references/defect-management-doctrine.md` — **canonical authority** for classifying (Bug/Defect/Improvement), the mandatory field matrix, QA-Assignee ownership, and the QA process epic when a confirmed regression is filed in Jira (Phase 3). Read BEFORE filing any defect.
- **Error protocol**: On any subagent failure: STOP, report full context to user, present retry / skip / abort options. Do NOT auto-fix. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.
- Compute prospective `<scope>` = `<env>-<YYYY-MM-DD>` from invocation context (env defaults to `{{DEFAULT_ENV}}`).
- Check `.session/regression-testing/<scope>/progress.md`.
- If it does NOT exist → proceed to suite selection + Phase 1 preflight + plan.md write.
- If it DOES exist:
- Read `plan.md` (captured `suite`, `env`, `workflow_file`, `RUN_ID` if Phase 1 already triggered).
- Read tail of `progress.md`.
- If `RUN_ID` is present AND `progress.md` last entry is `Phase 1 — Trigger — status: completed` but Monitor entry is missing/failed: surface the option to **re-attach** to the existing `RUN_ID` via `gh run view <RUN_ID> --json status,conclusion` instead of re-triggering. This is the high-value resume case.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/regression-testing/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: shift-left-testing

**Purpose**: Orchestrates pre-sprint Shift-Left QA on a batch of backlog Stories.

**Compact Rules**:
- ACs are the FLOOR. Refinement's job is to push past the happy-path contract: surface the boundaries, exceptions, states, and anomalies the Story is silent on.
- 1:N is the default: a non-trivial AC implies multiple outlines (valid partition + each distinct invalid + boundaries + states). A 1-outline AC requires a written "trivially atomic" justification — never the default.
- Tag each refinement gap to a technique: ranges/limits → BVA; status/lifecycle fields → State-Transition; 2+ interacting conditions → Decision Table; 3+ combinable factors → Pairwise.
- A refined AC (Given/When/Then) is the business assertion; the outline (`Should <behavior> <condition>`) is its exploration. Keep them distinct.
- Stories ONLY (no bugs — nothing to refine upstream). Entry status Backlog / Shift-Left QA / Estimation / Ready For Dev.
- Output = refined ACs + gap/ambiguity questions + the pre-sprint ATP in the `{{jira.acceptance_test_plan}}` field (outline NAMES + coverage estimate, no test code, no execution, NO Test Plan item — `/sprint-testing` Stage 1 creates the item from the field) + the closed `[QA] Shift-Left Review` subtask + the batch report.
- Tracking subtask `[QA] Shift-Left Review` per accepted Story: find-or-create in Phase 1 (transition to In Progress), close in Phase 3 handoff (transition to Done). Exhaustive session annotations (long analysis, refinement traces) go on the SUBTASK, keeping the Story clean. Work type + transitions resolved from `.agents/jira-workflows.json`; no subtask work type in the catalog → skip with a warning, never block.
- The heart of the skill (Phase 2) = edge cases not in story + ambiguities + gaps — feed them to PO/Dev as questions AND as derived outlines.
- On taking a Story into refinement (first QA pickup), set `qa_assignee` to self — read-before-write, never overwrite an existing owner (`agentic-qa-core/references/defect-management-doctrine.md` Part 2). This skill files NO Bug/Defect/Improvement; only the QA-Assignee hook applies.
- On completion: add label `shift-left-reviewed`; transition Backlog → Shift-Left QA → Estimation.

**Read full SKILL.md when**: running the batch grooming pipeline, writing the per-Story `shift-left-refinement.md`, or handling the PO/Dev handoff.

> Source: `.claude/skills/shift-left-testing/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: sprint-testing

**Purpose**: Orchestrates in-sprint manual QA per ticket across Stages 1 (Planning), 2 (Execution) and 3 (Reporting).

**Compact Rules**:
- AC-pass is the FLOOR, not the goal. Coverage = AC-conformance + risk-beyond-AC (boundaries, errors, states, anomalies). Never report "% of ACs verified" as completeness. (Canon: `agentic-qa-core/references/test-design-doctrine.md`.)
- 1:N is the default: explode every non-trivial AC into multiple cases (EP partitions + boundaries + states + contexts). Collapsing an AC to one case requires a written "trivially atomic" justification.
- Apply techniques by trigger: EP always; BVA wherever a range / limit / length / date-window exists; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction); Error-Guessing charters for experience-based risk.
- A criterion is a business assertion; a test case is a concrete exploration of it. Run the Test-Design Checklist before finalizing the ATP.
- CLASSIFY before filing — stop hardcoding "Bug". **Bug** = affected feature already live above Staging (end-user visible); **Defect** = feature still pre-release (Staging or below), the normal output of sprint testing; **Improvement** = not a broken AC (an enhancement, or an under-specified/absent AC surfaced by a test-beyond-AC). Classification follows the FEATURE's lifecycle stage, not where the problem was found. (Canon: `agentic-qa-core/references/defect-management-doctrine.md` Part 1.)
- `qa_assignee` (`{{jira.qa_assignee}}`) = the authenticated session user (self-assign). Set it when a Story is TAKEN INTO TESTING (start_testing) and on every filed Bug / Defect / Improvement. NEVER-OVERWRITE an existing owner (read-before-write); distinct from the native dev `assignee` (Part 2).
- `components` (native, MANDATORY) = the affected product module/Epic, must pre-exist in the Jira Components module (Part 3).
- Three-axis model: **parent** = QA Defect Management process epic (`qa.qa_epics.defect_epic`, found-or-created — NEVER a product/dev epic, NEVER the Story); **issue link** = the source Story (traceability); **components** = product module (Part 4).
- `priority` (native) is auto-derived from `{{jira.severity}}` (critica→Highest, mayor→High, moderada→Medium, menor→Low, trivial→Lowest); override with a 1-line justification (Part 5.1).
- Three stages, always in order: Stage 1 Planning → Stage 2 Execution → Stage 3 Reporting. Hand off Stages 4/5/6 to `test-documentation` / `test-automation` / `regression-testing`.
- Jira is source of truth. Read tickets via `bun run jira:sync-issues get <KEY> --include-comments`, then the synced `.md`. NEVER `acli workitem view` for custom fields (returns `null`).
- Bugs run the veto + triage + risk-score decision tree BEFORE any ATP is written.
- Execution = smoke pass first, then trifuerza (UI/API/DB) exploration; capture evidence under the PBI folder.
- API testing = three-tool maneuver: OpenAPI MCP for schema (READ-ONLY) → `bun run api:login` for the token (→ `.auth/tokens.env`) → **curl** for authenticated requests. NEVER execute via the OpenAPI MCP. Canon: `agentic-qa-core/references/api-testing-doctrine.md`.
- Consult `domain-glossary.md` (if present) before authoring the ATP, refined ACs, and TC outlines.
- On any subagent failure: STOP, report partial state, offer retry / skip-stage / abort. No auto-fix, no auto-rollback.
- Stage 1 Set-first order (Modality jira-xray — AUTHORITATIVE): the Story's coverage backbone is its **ATS** (`ATS: {US_ID}: {story title}` — mandatory per Story, even with a single TC; parent: QA Test Artifacts epic; components inherited from the Story). Create the sprint `Test` issues, put ALL of them in the ATS, and link **ATS→Story** via the `test` slug (Story `is tested by` ATS) — the ONLY coverage-bearing edge (fills the Xray coverage panel); Story↔ATP and Story↔ATR links are administrative traceability with ZERO coverage.
- The ATP item is find-or-created FROM the `{{jira.acceptance_test_plan}}` field (where shift-left authored it) — pre-sprint the ATP lives ONLY in that field; Stage 1 is where the Test Plan item is born (parent: QA Master Test Plan epic).
- Derive, never re-list: the ATP's and the ATR Execution's test lists are DERIVED from the ATS membership — never maintained as independent id lists (three hand-maintained lists drift silently and corrupt coverage).
- ATR always with environment (HARD GATE): create the ATR / retest Execution ALWAYS carrying the Test Environment resolved from `active_env` in `.agents/project.yaml` (or the session env switch). No ATR without environment — an environment-less Execution fails the Stage-1 DoD gate (`agentic-qa-core/references/stage-gates.md`).
- TC∈ATS / TC∈ATP / TC∈ATR membership is Xray-internal (GraphQL) — NEVER expressed as Jira issue links in Modality jira-xray. Do NOT link TCs directly to the Story (last-resort only, for instances with no Test Set work type).
- Bug retest (Modality jira-xray): ONE repro `Test` by default, created at fix-verification time (Stage 2), linked Bug↔Test via the `test` slug and executed in the retest Execution (`ReTest: {BUG_KEY}: {summary}`); 1:N only with a written test-design justification. Modality jira-native: no in-sprint TCs (the bug is the immediate retest case) — persistent-Test decisions defer to Stage 4.
- STP find-or-create fires on the sprint's FIRST ticket: `STP: Sprint#{N}: {objective}` (Test Plan item, parent: QA Master Test Plan; a LIVING planner — append each tested ticket, keep progress current). The sprint recap Execution `STR: Sprint#{N}: Regression Testing` (parent: QA Test Artifacts) is created at sprint close.

**Read full SKILL.md when**: starting a sprint cold, resuming a session, or handling a bug-triage / batch-sprint flow not covered by the rules above.

> Source: `.claude/skills/sprint-testing/SKILL.md` · phase: `unknown` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: test-automation

**Purpose**: Plan, write, and review automated tests following KATA (Komponent Action Test Architecture) on Playwright + TypeScript.

**Compact Rules**:
- "All ACs covered" is the FLOOR, not the success bar. The ATC set must also cover risk-beyond-AC: invalid/boundary inputs, auth/error paths, state transitions, and anomalies the AC is silent on.
- 1:N is the default: one AC maps to multiple ATCs. EP-merge collapses same-behavior inputs INSIDE one partition into a parameterized ATC — it must NEVER collapse across distinct partitions, boundaries, or states. BVA cases are required wherever a range/limit/length/date-window exists (EP alone misses off-by-one).
- Apply techniques by trigger: EP always; BVA on ranges/limits; State-Transition for stateful flows; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction).
- Parametrize for artifact economy: same-behavior data variants → ONE parameterized `@atc` (fixture / data-factory rows iterated by the test) per partition, NOT N ATCs; split only when action / outcome / state differs. (Canon: doctrine §"Part 2.5".)
- An AC is the business assertion; an ATC is its concrete exploration (Precondition + Action + Assertions). Run the Test-Design Checklist before finalizing the plan.
- Plan → Code → Review, always in order. Only automate `Candidate` verdicts from `/test-documentation`.
- Fixture selection: API-only → `{ api }` (no browser); UI-only → `{ ui }`; hybrid → `{ test }`.
- ATC = atomic mini-flow; NEVER calls another ATC. Reusable chains → a Steps module.
- Max 2 positional params (3+ → object param). Locators inline (extract only at 2+ uses). Imports via aliases (`@api/`, `@schemas/`, `@utils/`) — no relative imports.
- Public methods fail fast; utilities silent-fail (return null). Validate against `kata-manifest.json` before adding components/ATCs (anti-duplication gate).

**Read full SKILL.md when**: writing KATA component code, choosing fixtures for a hybrid flow, or applying the Phase 3 review checklist.

> Source: `.claude/skills/test-automation/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: test-documentation

**Purpose**: Analyze, prioritize, and document test cases in TMS (Jira/Xray) -- the bridge between manual QA and test automation.

**Compact Rules**:
- Documenting an AC→TC map is the FLOOR (≥1 TC per AC is a minimum, never a target). Coverage = AC-conformance + risk-beyond-AC; the TC set must include boundary / negative / state / anomaly cases the AC is silent on. (Canon: `agentic-qa-core/references/test-design-doctrine.md`.)
- 1:N applies to DERIVATION (consider many cases by technique), not to the REGRESSION repository. Only regression-worthy scenarios (Candidate/Manual) are persisted there; most are Deferred. jira-native: Stage 4 CREATES `Test`s for those only (Deferred = report-only). jira-xray: sprint `Test`s already exist (Stage 1) — Stage 4 PROMOTES the regression-worthy into the Test Plan + enriches them. Document because it will be re-run, never to hit a count.
- Apply techniques by trigger: EP always; BVA wherever a range/limit/length/date-window exists; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors.
- Parametrize for artifact economy: same-behavior data variants → ONE Test (`Scenario Outline` + `Examples` rows) per partition, NOT N separate Tests; split only when action / outcome / status / state differs. (Canon: doctrine §"Part 2.5".)
- Cross-cutting characteristics (XSS, perf, a11y) deferred to app-level suites are an EXPLICIT handoff, not a silent drop — name the receiving suite or file the gap.
- Documents already-validated behavior only — not an exploration tool (exploration belongs to `/sprint-testing`).
- TC identity = Precondition + Action + verifiable outcome. Naming (TC): `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]`; `Validate <feature>` is reserved for the GROUPING layer (Test Set summary / `describe()`). Reject `"Login test"`, `"Login - error"`, `"TC1: Test form"`.
- ROI formula → one of three verdicts per TC: Candidate (feeds test-automation), Manual, Deferred. Prioritize by risk.
- Cardinality: US→TC is 1:N; AC→TC is N:1 or N:M. Resolve TMS modality (Xray vs Jira-native) in Phase 0 before documenting.
- Bug-driven (GOLDEN RULE): not every bug is a regression TC, but a regression-worthy bug MUST end with a Test — REUSE the existing failed Test if it came from one, else CREATE one (both modalities). A non-qualifying bug is treated like a failed test → Deferred, no new Test.
- ATS is MANDATORY per Story (`ATS: {US_ID}: {story title}`, even with a single TC): a `Test Set` holding ALL the Story's TCs, parented to the QA Test Artifacts epic, `components` INHERITED from the Story (mandatory — the components exemption applies ONLY to the optional feature-level `TS:` grouping sets).
- Set-first creation order: find-or-create the ATS, ATP and ATR BEFORE the first TC (module-driven pre-creates the containers because parallel TC sharding needs the targets to exist); add each TC to the ATS, THEN derive the ATP's and the Execution's test lists FROM the ATS membership — never three independent id lists.
- Coverage truth (live-verified): ONLY the ATS→Story `is tested by` link fills the Xray coverage panel. Story↔ATP and Story↔ATR links are administrative traceability and contribute ZERO coverage — keep them, never count them as coverage.
- Membership: Modality jira-xray → TC∈ATS/ATP/ATR is Xray-internal (GraphQL, via `/xray-cli`), NEVER a Jira issue link (and never in the TC title). Modality jira-native carve-out: with the Test Set work type present, membership IS expressed as TC→ATS issue links; work type absent → no ATS.
- Direct TC→Story links are the cascade's LAST RESORT (valid only when no ATS can exist — e.g. jira-native without the Test Set work type), not the default. The defect is a TC with NO path to its Story, not the direct link itself.

**Read full SKILL.md when**: resolving TMS modality, computing ROI, writing Gherkin, or wiring US-ATP-ATR-TC traceability links.

> Source: `.claude/skills/test-documentation/SKILL.md` · phase: `unknown` · source: frontmatter `compact_rules` (verbatim)

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
- **Xray credentials missing/broken** → Critical Rule #10 applies: STOP, name the
- **Jira-layer operations only** (issue links, summaries, transitions, comments
- **X1.** NEVER call `bun xray ...` directly from workflow skills (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`). Workflow skills use `[TMS_TOOL]` pseudo-code and load `/xray-cli` — only this skill owns the literal CLI syntax.
- **X2.** NEVER cache Xray bearer tokens beyond their 24h TTL. Stale tokens produce silent 401s mid-import that look like network blips; re-auth via `bun xray auth login` instead of catching the error.
- **X3.** NEVER batch-import test results without first verifying the Test Plan / Test Execution keys exist in the target project. Orphan results get rejected and the whole import aborts — pre-check with `exec get` / `plan get`.
- **X4.** NEVER hand-craft Xray JSON payloads (`testInfo`, `iterations`, `evidences`) outside `bun xray`. The CLI owns the canonical shape; drift from it breaks future schema migrations and silently mis-attributes evidence to the wrong run.
- **X5.** NEVER run `bun xray import` or `bun xray backup restore` against production without `--dry-run` first. These commands write irreversibly across hundreds of TCs and runs — preview the diff before applying.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/xray-cli/SKILL.md` · phase: `unknown` · extraction strategy: B
