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

## Subagent Dispatch Strategy

This skill is compliant with the doctrine in `CLAUDE.md` §"Orchestration Mode (Subagent Strategy)". Every dispatch follows the 6-component briefing format defined in `.claude/skills/agentic-qa-core/references/briefing-template.md`, and the pattern selected per phase matches the decision guide in `.claude/skills/agentic-qa-core/references/dispatch-patterns.md`. The four phases — Plan, Code, Verify, Archive — mirror the shape of `/test-automation` (Plan → Code → Review) extended with an inline Archive step. Phase 0 stays inline because the path self-check is one short orchestrator decision, not work that benefits from a fresh-context subagent.

| Phase                                              | Pattern              | Subagent role                                                                                                                                                  |
|----------------------------------------------------|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Phase 0 — Path self-check                          | inline               | orchestrator only; no subagent. Lists target paths against `references/kata-invariants.md` §10; aborts on FORBIDDEN, redirects to the owning skill              |
| Phase 1 — Plan (`plan.md`)                         | Single               | one Plan subagent writes `.scratch/framework-changes/<change-name>/plan.md`; collapses prior explore + propose + spec + design + tasks into one artifact        |
| Phase 2 — Code (per task batch)                    | Sequential           | one Code subagent per task batch from the plan; appends to `apply-progress.md`; on verification failure: STOP, no auto-fix                                      |
| Phase 3 — Verify — `bun run test`                  | Parallel (sub-stage) | one Verifier subagent runs the test suite                                                                                                                       |
| Phase 3 — Verify — `bun run types:check`           | Parallel (sub-stage) | one Verifier subagent runs typecheck                                                                                                                            |
| Phase 3 — Verify — `bun run lint:check`            | Parallel (sub-stage) | one Verifier subagent runs ESLint                                                                                                                               |
| Phase 3 — Verify — `bun run skills:check`          | Parallel (sub-stage) | one Verifier subagent runs the skill-registry lint (framework changes can affect `.claude/skills/`, `CLAUDE.md`, `cli/install.ts`)                              |
| Phase 3 — Aggregation + accept/reject decision     | inline               | orchestrator reads the 4 Verifier reports and decides; on any non-zero exit, presents retry / skip / abort                                                       |
| Phase 4 — Archive (move plan + apply-progress)     | inline               | orchestrator only; moves `.scratch/framework-changes/<change-name>/` to `.scratch/framework-changes/archive/<YYYY-MM-DD>-<change-name>.md`; references in commit |

- **Plan artifact location**: `.scratch/framework-changes/<change-name>/plan.md`. The `.scratch/` tree is gitignored — the plan is local, not committed. Recovery on mid-run crash: the file persists; the orchestrator reads it back on the next session.
- **Path guardrails injected per dispatch**: every Plan and Code subagent briefing MUST include the line `KATA invariants and ALLOWED/FORBIDDEN paths: .claude/skills/framework-development/references/kata-invariants.md (read §10 before touching any file).` Do NOT inline the path tables — the reference is authoritative.
- **On any subagent failure**: STOP, return the failing report, do NOT auto-rerun. The orchestrator decides retry / skip / abort. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.
- **Strict TDD flag** is set in Phase 1's `plan.md` under §"Strict TDD flag". Default OFF. Flipped ON only when the user explicitly opted in. Code phase reads it from the plan; no separate cache needed.

---

## Phase 0 — Path self-check (mandatory, runs first)

Before invoking any subagent, the orchestrator MUST list the files / directories the change will touch and verify each one against the ALLOWED / FORBIDDEN tables in `references/kata-invariants.md` §10. Skipping Phase 0 is the most common way framework changes leak into ticket-owned surface area.

1. Read `references/kata-invariants.md` §10 (ALLOWED + FORBIDDEN paths).
2. Ask the user (or infer from the request): "Which paths will this change touch?"
3. For each path, look it up in §10 ALLOWED → proceed. Or §10 FORBIDDEN → abort and redirect to the skill named in the row.
4. If a path matches neither table, ASK the user explicitly — never assume.
5. If a single change spans both ALLOWED and FORBIDDEN paths (e.g. "refactor `tests/components/ui/UiBase.ts` AND update the e2e tests that consume it"), split the work: framework-development handles the base-class change; `/test-automation` handles the test-spec migration in a follow-up.
6. Check `.scratch/framework-changes/` for an existing `<change-name>/` working dir — if found, offer the user a "Resume from existing plan" option before re-running Phase 1.

Phase 0 is one short inline decision — it does NOT write a file. If the change is approved, the decision is captured later in Phase 1's `plan.md` §Investigation.

---

## Native Phase Orchestration

After Phase 0 passes, run the four-phase pipeline in dependency order. Each subagent dispatch follows the 6-component briefing format in `agentic-qa-core/references/briefing-template.md`. Briefing skeleton for Plan and Code phases (fill the `<...>` slots):

```
Goal: <one-sentence outcome scoped to this phase>

Context docs:
  - .claude/skills/framework-development/references/kata-invariants.md
  - .scratch/framework-changes/<change-name>/plan.md   (Code phase only)
  - .scratch/framework-changes/<change-name>/apply-progress.md   (Code phase, batches > 1)
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

Dispatch: **Single**. The Plan subagent writes one consolidated artifact at `.scratch/framework-changes/<change-name>/plan.md` covering: Goal, Investigation, Approach options, Chosen approach, Invariants touched, Public API delta, Task breakdown, Strict TDD flag, Risks, Verification checklist. One file, ten sections — not five separate documents.

Present the plan to the user. Wait for approval before Phase 2.

### Phase 2 — Code

Dispatch: **Sequential** — one subagent per task batch. The orchestrator decides batching from the plan's task list; rule of thumb is 1 batch per 3-5 closely-coupled tasks, or 1 batch per task when the task touches a load-bearing file such as `ApiBase.ts` / `UiBase.ts` / `TestContext.ts`.

Each subagent:
1. Reads `plan.md` and applies the tasks in its batch in plan order.
2. Runs the per-task verification command listed in the plan.
3. Appends a one-line summary per task to `apply-progress.md`.
4. On verification failure: STOP, report, do not auto-fix.

The orchestrator never reads diffs from the Code subagent — only the summary. If the user wants to see actual changes, the orchestrator runs `git diff` inline after the batch returns.

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

Dispatch: **inline** — no subagent. The orchestrator:

1. Reads `plan.md` and `apply-progress.md` from `.scratch/framework-changes/<change-name>/`.
2. Concatenates with a header into `.scratch/framework-changes/archive/<YYYY-MM-DD>-<change-name>.md`.
3. Deletes the working `.scratch/framework-changes/<change-name>/` directory.
4. Surfaces the archive path so `/git-flow-master` can include it in the commit message body.
5. Saves an engram observation at topic_key `framework/<change-name>/archive` (supersedes the prior `plan` and `apply` observations).

Archive is a "close-the-loop" step, not "ship-the-code". Code is shipped by `/git-flow-master` based on the diff that Phase 2 produced and Phase 3 verified.

---

## References

- `references/kata-invariants.md` — INVARIANT vs EXTENSIBLE rules for the 4 KATA layers, fixture selection, ATC identity, DRY scope, import aliases, public-method contract, extension points, evolution checklist, out-of-scope surfaces, and §10 ALLOWED / FORBIDDEN path tables. Required reading before any Plan or Code subagent that touches `tests/components/`, `api/schemas/`, or fixtures.
- `../agentic-qa-core/references/skill-composition-strategy.md` — T1/T2/T3/T4 tier model, category vocabulary, validation rules. The §4 anti-leak contract is informational here: framework-development no longer chains SDD by default; §4 governs users who manually install SDD and explicitly request the SDD ceremony.
- `../agentic-qa-core/references/briefing-template.md` — 6-component briefing examples per pattern.
- `../agentic-qa-core/references/dispatch-patterns.md` — Single / Sequential / Parallel / Background decision guide.
- `../agentic-qa-core/references/orchestration-doctrine.md` — failure protocol, ASK-on-error rule, no auto-fix.
