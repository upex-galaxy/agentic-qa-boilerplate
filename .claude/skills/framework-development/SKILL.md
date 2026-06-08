---
name: framework-development
description: "Framework evolution mode — evolves the QA boilerplate itself (KATA, fixtures, cli/, scripts/, api/schemas/ pipeline, package.json deps). Self-contained Plan → Code → Verify → Archive pipeline; runs under the `gentle-ai install --preset minimal` install (no SDD-* skills required). Use when adding new fixture APIs, refactoring KATA base classes, evolving the installer, modifying the OpenAPI sync pipeline, or any change to the framework infrastructure that is NOT per-ticket test writing or manual QA. Triggers on: /framework-development, \"evolve framework\", \"framework refactor\", \"new fixture API\", \"modify KATA base\", \"refactor cli\", \"boilerplate evolution\". Do NOT use for: writing tests for a ticket (use /test-automation), manual QA per ticket (use /sprint-testing), documenting test cases (use /test-documentation), running regression suites (use /regression-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [framework-evolution, meta-skill]
---

# Framework Development — Evolve the QA Boilerplate

Gateway skill for changes to the framework itself: KATA layers, fixtures, installer, OpenAPI pipeline, scripts, doctrine docs. Per-ticket QA work, test specs, and TMS documentation are owned by other workflow skills (`/sprint-testing`, `/test-documentation`, `/test-automation`, `/regression-testing`) and MUST NOT trigger this skill.

The skill exists because framework-surface changes — new fixture, new layer helper, installer rewrite, manifest extractor — deserve a planning gate before code. Per-ticket test writing already has its own gate in `/test-automation` Plan → Code → Review; this skill is its architectural-surface counterpart.

---

## Inputs

Canonical reading order for any AI starting cold on a framework-development workflow. Read in order; stop earlier when the change is small enough that later inputs add no signal.

1. `kata-manifest.json` — Component + ATC registry (source of truth per Critical Rule #12). Establishes what already exists before any new fixture API, Page, Api, Steps module, or ATC ID is proposed.
2. `.claude/skills/test-automation/references/kata-architecture.md` + `.claude/skills/test-automation/references/typescript-patterns.md` — KATA layer flow (TestContext → ApiBase / UiBase → YourApi / YourPage → TestFixture), ATC identity rules, fixture-selection contract, import-alias conventions.
3. `tests/components/` — current Api / Page / Steps shape; required reading when touching any L2 / L3 surface or adding a fixture consumed by these components.
4. `cli/install.ts` — installer flow; required reading when evolving the installer, adding install steps, or modifying boilerplate scaffold behavior.
5. `scripts/sync-openapi.ts` + `api/schemas/` — OpenAPI-derived TypeScript types pipeline; required reading when touching the API contract pipeline, schema generation, or any consumer of generated facades.
6. `package.json` + `bun.lockb` — dep landscape; required reading before bumping Playwright / Bun / TypeScript / fixture-runtime versions or adding/removing scripts.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is compliant with the doctrine in `CLAUDE.md` §"Orchestration Mode (Subagent Strategy)" and the session contract in `.claude/skills/agentic-qa-core/references/session-management.md`. Every dispatch follows the 6-component briefing format defined in `.claude/skills/agentic-qa-core/references/briefing-template.md`, and the pattern selected per phase matches the decision guide in `.claude/skills/agentic-qa-core/references/dispatch-patterns.md`. The four phases — Plan, Code, Verify, Archive — mirror the shape of `/test-automation` (Plan → Code → Review) extended with an inline Archive step. Phase 0 stays inline because the path self-check + session resume check are short orchestrator decisions that do not benefit from a fresh-context subagent.

**Session scope**: `<change-name>` (kebab-case, user-provided at session start). Session state lives at `.session/framework-development/<change-name>/{plan.md, progress.md}` per `./session-management.md` §9.

| Phase                                              | Pattern              | Subagent role                                                                                                                                                  |
|----------------------------------------------------|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Phase 0 — Path self-check + session resume check   | inline               | orchestrator only; no subagent. Lists target paths against `references/kata-invariants.md` §10; aborts on FORBIDDEN. Also checks `.session/framework-development/<change-name>/` for prior plan/progress and offers resume per `./session-management.md` §4 |
| Phase 1 — Plan (`plan.md`)                         | Single               | one Plan subagent writes `.session/framework-development/<change-name>/plan.md` per `./session-management.md` §6 schema; collapses prior explore + propose + spec + design + tasks into one artifact |
| Phase 2 — Code (per task batch)                    | Sequential           | one Code subagent per task batch from the plan; orchestrator appends to `progress.md` per `./session-management.md` §7 schema; on verification failure: STOP, no auto-fix |
| Phase 3 — Verify — `bun run test`                  | Parallel (sub-stage) | one Verifier subagent runs the test suite                                                                                                                       |
| Phase 3 — Verify — `bun run types:check`           | Parallel (sub-stage) | one Verifier subagent runs typecheck                                                                                                                            |
| Phase 3 — Verify — `bun run lint:check`            | Parallel (sub-stage) | one Verifier subagent runs ESLint                                                                                                                               |
| Phase 3 — Verify — `bun run skills:check`          | Parallel (sub-stage) | one Verifier subagent runs the skill-registry lint (framework changes can affect `.claude/skills/`, `CLAUDE.md`, `cli/install.ts`)                              |
| Phase 3 — Aggregation + accept/reject decision     | inline               | orchestrator reads the 4 Verifier reports and decides; on any non-zero exit, presents retry / skip / abort                                                       |
| Phase 4 — Archive (move plan + progress)           | inline               | orchestrator only; moves `.session/framework-development/<change-name>/` to `.session/.archive/<YYYY-MM-DD>-framework-development-<change-name>/` (two-file dir preserved per `./session-management.md` §8); references in commit |

- **Plan artifact location**: `.session/framework-development/<change-name>/plan.md`. The `.session/` tree is gitignored — the plan is local, not committed. Recovery on mid-run crash: the file persists; the orchestrator reads it back on the next session via Phase 0 resume check (see `./session-management.md` §4).
- **Grace period for legacy path**: prior versions wrote to `.scratch/framework-changes/<change-name>/{plan.md, apply-progress.md}`. Phase 0 also checks the legacy path during the grace period — if found, the orchestrator offers to copy state to the new `.session/...` location before resuming.
- **Path guardrails injected per dispatch**: every Plan and Code subagent briefing MUST include the line `KATA invariants and ALLOWED/FORBIDDEN paths: .claude/skills/framework-development/references/kata-invariants.md (read §10 before touching any file).` Do NOT inline the path tables — the reference is authoritative.
- **On any subagent failure**: STOP, return the failing report, do NOT auto-rerun. The orchestrator decides retry / skip / abort. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.
- **Strict TDD flag** is set in Phase 1's `plan.md` under §"Strict TDD flag". Default OFF. Flipped ON only when the user explicitly opted in. Code phase reads it from the plan; no separate cache needed.

---

## Readiness Preflight Gate (MANDATORY — runs before Phase 0)

> Full doctrine: `agentic-qa-core/references/preflight-gate.md`. Runs FIRST, before the path self-check and resume check. Two laws: (1) **args-as-answers** — the change name and touched paths are provided args; ask only the gaps. (2) **probe, don't assume**. Surface gaps + REDs as ONE `AskUserQuestion` checklist; self-fix with approval + explanation; STOP on any blocking RED. This skill evolves the framework itself — it does NOT hit a live env, Jira, DB, or API — so its gate is a **dev-toolchain readiness** check that pairs with the Phase 0 path self-check. **Generic baseline** (the two laws, secret/restart handling, output contract) is inherited from the reference §3.1 — not repeated here; the env/creds half of the baseline is N/A for meta-work. Below is only this skill's **specific capability delta**.

| Capability | Need | Why here |
|---|---|---|
| Dev toolchain | REQUIRED | Phase 3 Verify runs `bun run test` / `bun run types:check` / `bun run lint:check` / `bun run skills:check`. All four must resolve at t=0. `bun install` if a dep is missing. |
| `kata-manifest.json` clean | REQUIRED | Source of truth (Critical Rule #12). Framework changes can invalidate it — `bun run kata:manifest:check` clean, `bun run kata:manifest` to regenerate. |
| Playwright browsers | SCOPE — touching fixtures / KATA bases / tests | Verify of a fixture or base-class change runs the suite, which needs chromium (`bun run pw:install`). |
| `/github-actions-docs` + `/playwright-best-practices` | OPTIONAL | Injected per dispatch when the change touches CI YAML or fixtures/tests (already noted in the briefing skeleton). |

Active env, test-user creds, OpenAPI/`API_TOKEN`, DBHub, issue-tracker, TMS and `resend` are **N/A** — framework evolution is meta-work on this repo. After the gate clears (all REQUIRED GREEN), continue to Phase 0 below.

---

## Phase 0 — Path self-check + session resume check (mandatory, runs first)

Before invoking any subagent, the orchestrator MUST (a) list the files / directories the change will touch and verify each one against the ALLOWED / FORBIDDEN tables in `references/kata-invariants.md` §10, and (b) run the session resume check per `./session-management.md` §4. Skipping Phase 0 is the most common way framework changes leak into ticket-owned surface area OR lose mid-run state on interruption.

1. Read `references/kata-invariants.md` §10 (ALLOWED + FORBIDDEN paths).
2. Ask the user (or infer from the request): "Which paths will this change touch?"
3. For each path, look it up in §10 ALLOWED → proceed. Or §10 FORBIDDEN → abort and redirect to the skill named in the row.
4. If a path matches neither table, ASK the user explicitly — never assume.
5. If a single change spans both ALLOWED and FORBIDDEN paths (e.g. "refactor `tests/components/ui/UiBase.ts` AND update the e2e tests that consume it"), split the work: framework-development handles the base-class change; `/test-automation` handles the test-spec migration in a follow-up.
6. **Session resume check** (per `./session-management.md` §4): check `.session/framework-development/<change-name>/progress.md`. If it exists, read `plan.md` + the tail of `progress.md`, surface the last completed phase + next planned phase + any blocking notes, and offer **resume / restart / abort**. On `restart`, archive the current directory to `.session/.archive/<YYYY-MM-DD>-framework-development-<change-name>-aborted/` before proceeding.
7. **Legacy path check** (grace period): also check `.scratch/framework-changes/<change-name>/` for prior plan/progress under the old layout. If found, offer to migrate the state to the new `.session/...` location.

Phase 0 is one short inline decision — it does NOT write a file. If the change is approved, the decision is captured later in Phase 1's `plan.md` §Investigation.

---

## Native Phase Orchestration

After Phase 0 passes, run the four-phase pipeline in dependency order. Each subagent dispatch follows the 6-component briefing format in `agentic-qa-core/references/briefing-template.md`. Briefing skeleton for Plan and Code phases (fill the `<...>` slots):

```
Goal: <one-sentence outcome scoped to this phase>

Context docs:
  - .claude/skills/framework-development/references/kata-invariants.md
  - .session/framework-development/<change-name>/plan.md   (Code phase only)
  - .session/framework-development/<change-name>/progress.md   (Code phase, batches > 1; orchestrator-written, read-only for subagents)
  - <relevant ALLOWED-path files the phase will read or touch>

Skills to load: <none by default; orchestrator injects /playwright-best-practices if fixtures/tests, /github-actions-docs if CI YAML>

Exact instructions:
  1. Read kata-invariants.md fully. Verify §10 ALLOWED for every touched path. FORBIDDEN → STOP.
  2. <phase-specific step — e.g. "write the plan", "implement task batch N">
  3. Save the artifact at the engram topic_key framework/<change-name>/<phase>.
  4. Return the executive summary inline.

Report format:
  - status: ready | blocked | failed
  - artifact: <absolute path or engram topic_key>
  - next_recommended: <phase or "stop">
  - risks: [<one-liner per risk>]
  - skill_resolution: injected | fallback-inline

Rules:
  - ALLOWED paths only (kata-invariants.md §10). FORBIDDEN → abort.
  - Do NOT modify generated artifacts (api/openapi-types.ts, kata-manifest.json, reports/).
  - If strict TDD is ON (read from plan §"Strict TDD flag"), every production-code task is preceded by a failing test in the same batch.
  - On uncertainty, STOP and report — do not improvise on framework surface.
```

Phase order (each phase gates the next):

```
Phase 0 (inline) -> Phase 1 Plan (Single) -> Phase 2 Code (Sequential per batch) -> Phase 3 Verify (Parallel 4-way) -> Phase 4 Archive (inline)
```

### Phase 1 — Plan

Dispatch: **Single**. The Plan subagent writes one consolidated artifact at `.session/framework-development/<change-name>/plan.md` covering: Goal, Investigation, Approach options, Chosen approach, Invariants touched, Public API delta, Task breakdown, Strict TDD flag, Risks, Verification checklist. One file, ten sections — not five separate documents. The seven base sections from `./session-management.md` §6 are mandatory; framework-development extends them with three skill-specific sections (Invariants touched, Public API delta, Strict TDD flag).

Present the plan to the user. Wait for approval before Phase 2.

**ADR seeding (framework architecture).** When the chosen approach reshapes the framework's test architecture — KATA layers, fixture APIs, the test runner, the isolation/parallelization model, or the OpenAPI/type pipeline — and the decision passes the two-gate test (architectural AND hard to reverse per `agentic-qa-core/references/adr-doctrine.md` §1), record a `.context/ADR/ADR-NNNN-<slug>.md` after the plan is approved and before Phase 2 coding. Framework evolution is meta-work: its decisions bind every test session that follows, so historicize them rather than leaving them in a one-off `plan.md` that gets archived. The plan's "Invariants touched" / "Public API delta" sections are the prime ADR candidates. Draft `Proposed`; the human accepts. Template + lifecycle: `.context/ADR/README.md`.

### Phase 2 — Code

Dispatch: **Sequential** — one subagent per task batch. The orchestrator decides batching from the plan's task list; rule of thumb is 1 batch per 3-5 closely-coupled tasks, or 1 batch per task when the task touches a load-bearing file such as `ApiBase.ts` / `UiBase.ts` / `TestContext.ts`.

Each subagent:
1. Reads `plan.md` and applies the tasks in its batch in plan order.
2. Runs the per-task verification command listed in the plan.
3. Returns a one-line summary per task to the orchestrator.
4. On verification failure: STOP, report, do not auto-fix.

The orchestrator never reads diffs from the Code subagent — only the summary. If the user wants to see actual changes, the orchestrator runs `git diff` inline after the batch returns. After each batch returns, the orchestrator appends a phase entry to `.session/framework-development/<change-name>/progress.md` per `./session-management.md` §7 (subagents never write to `progress.md` directly — that is an orchestrator-only file).

### Phase 3 — Verify

Dispatch: **Parallel** — four Verifier subagents in the same `<function_calls>` block:

| Verifier | Command                | Captures             |
|----------|------------------------|----------------------|
| V1       | `bun run test`         | exit code, summary   |
| V2       | `bun run types:check`  | exit code, summary   |
| V3       | `bun run lint:check`   | exit code, summary   |
| V4       | `bun run skills:check` | exit code, ERROR/WARN/INFO counts |

`skills:check` is included because framework changes routinely touch `.claude/skills/framework-development/`, `agentic-qa-core/references/`, `CLAUDE.md`, and `cli/install.ts` — every one of those surfaces is read by `scripts/lint-skills.ts` and gated by 10 named checks (tier coherence, anti-leak, stale-path, duplicate-tier, etc.). The other three commands never see this surface; adding the fourth verifier costs one parallel slot and prevents an entire failure class.

After all four return, the orchestrator inline-aggregates:

- All four `exitCode == 0` → ACCEPT. Proceed to Phase 4.
- Any `exitCode != 0` → REJECT. Present failing verifier(s) to the user. Options: retry the failing Phase 2 batch / skip-and-document / abort. Do NOT auto-fix.

### Phase 4 — Archive

Dispatch: **inline** — no subagent. The orchestrator performs the archive flow from `./session-management.md` §8:

1. Verifies the Verification checklist in `plan.md` passes (all four Phase 3 verifiers returned exit 0).
2. Moves the entire working directory: `mv .session/framework-development/<change-name>/ .session/.archive/<YYYY-MM-DD>-framework-development-<change-name>/`. Both `plan.md` and `progress.md` are preserved side by side (no concatenation) so future resume-replay stays possible.
3. Calls Engram `mem_session_summary` with the session template per `./session-management.md` §11. The summary MUST include the archive path so `mem_search "session framework-development <change-name>"` resolves back to the artifacts.
4. Surfaces the archive path so `/git-flow-master` can include it in the commit message body.

Archive is a "close-the-loop" step, not "ship-the-code". Code is shipped by `/git-flow-master` based on the diff that Phase 2 produced and Phase 3 verified. On Phase 3 REJECT, archive does NOT run — the working directory stays in place so the user can debug, resume, or abort.

---

## Anti-patterns — NEVER do these

- **F1.** NEVER use `/framework-development` for per-ticket test writing — that surface is owned by `/test-automation` (Plan → Code → Review on KATA + Playwright + TypeScript). Framework-development governs the architectural surface only.
- **F2.** NEVER collapse KATA layers (TestContext / Base / Domain / Fixture) under the pretext of simplification. The layers are framework architecture, not speculative abstraction. Critical Rule #12-adjacent: simplicity-first does NOT apply to KATA.
- **F3.** NEVER edit `tests/components/` from a framework-development session — those are L2 / L3 KATA components owned by per-ticket work via `/test-automation`. If a base-class refactor forces a consumer migration, split the work: framework-development changes the base; `/test-automation` migrates the specs in a follow-up.
- **F4.** NEVER skip the Plan → Code → Verify → Archive pipeline for non-trivial framework changes. The pipeline IS the gate — bypassing it for "quick" refactors of `ApiBase.ts`, `UiBase.ts`, `TestContext.ts`, fixtures, installer, or OpenAPI pipeline reliably produces undetected regressions.
- **F5.** NEVER bump major versions of Playwright / Bun / TypeScript without a regression run on a representative E2E suite. Lockstep upgrades hide breaking changes in fixture lifecycle, locator engines, or type-emit behavior.
- **F6.** NEVER add a new fixture API without updating `tests/components/TestFixture.ts` (or the matching `ApiFixture.ts` / `UiFixture.ts`) AND `kata-manifest.json` AND citing at least one existing test that consumes it. Orphan fixtures rot — and `kata-manifest.json` is the anti-duplication gate (Critical Rule #12).
- **F7.** NEVER refactor `cli/install.ts` without testing the full install flow on a clean clone. The installer is the only surface where a bug ships silently to every new user — verification on the developer's already-installed repo proves nothing.
- **F8.** NEVER introduce a hard-to-reverse test-framework architectural decision (KATA-layer reshape, new fixture API, test-runner swap, isolation/parallelization model) without recording it as an ADR in `.context/ADR/`. Framework evolution binds every later test session — a decision left only in an archived `plan.md` gets re-litigated or silently violated. Draft `Proposed` before Phase 2; the human approves. ADRs are append-only: supersede, never rewrite. See `agentic-qa-core/references/adr-doctrine.md`.

---

## References

- `references/kata-invariants.md` — INVARIANT vs EXTENSIBLE rules for the 4 KATA layers, fixture selection, ATC identity, DRY scope, import aliases, public-method contract, extension points, evolution checklist, out-of-scope surfaces, and §10 ALLOWED / FORBIDDEN path tables. Required reading before any Plan or Code subagent that touches `tests/components/`, `api/schemas/`, or fixtures.
- `../agentic-qa-core/references/skill-composition-strategy.md` — T1/T2/T3/T4 tier model, category vocabulary, validation rules. The §4 anti-leak contract is informational here: framework-development no longer chains SDD by default; §4 governs users who manually install SDD and explicitly request the SDD ceremony.
- `../agentic-qa-core/references/briefing-template.md` — 6-component briefing examples per pattern.
- `../agentic-qa-core/references/dispatch-patterns.md` — Single / Sequential / Parallel / Background decision guide.
- `../agentic-qa-core/references/orchestration-doctrine.md` — failure protocol, ASK-on-error rule, no auto-fix.
- `../agentic-qa-core/references/session-management.md` — Phase 0 resume contract, `plan.md` / `progress.md` schemas, archive policy, scope-naming, Engram coupling. This skill is one of the producers of `session/...` topic keys.
