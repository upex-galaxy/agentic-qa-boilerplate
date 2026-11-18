---
name: framework-development
description: "Evolve the QA boilerplate itself: KATA bases, fixtures, installer, scripts, OpenAPI pipeline, skills and instruction files. Use when changing a fixture API, a KATA base, `cli/`, `scripts/` or deps; adding or rewriting a skill; editing AGENTS.md, a section or the ROUTER (mode `instructions`); syncing AI context or memory after a change. Per-ticket tests belong to test-automation."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [framework-evolution, meta-skill]
metadata:
  kind: workflow
  stage_owner: true

---

# Framework Development: evolve the QA boilerplate

This skill changes the framework itself: KATA layers, fixtures, the installer, the OpenAPI pipeline, scripts, doctrine docs. It puts a planning gate in front of code because these changes reach every test session and every new clone that follows. Per-ticket work has its own skills (`/test-automation`, `/sprint-testing`, `/test-documentation`, `/regression-testing`); this one is their architectural counterpart and stays out of their surface.

The pipeline is Plan, Code, Verify, Archive. It needs nothing outside the repo.

---

## Compact Rules

- Use this skill for the architectural surface only. Test writing is `/test-automation`, manual QA is `/sprint-testing`, TMS docs are `/test-documentation`, suite runs are `/regression-testing`.
- Clear the readiness preflight, then run the Phase 0 path self-check against `references/kata-invariants.md` §10 before dispatching anything. A FORBIDDEN path aborts and redirects to the skill named in its row. A path in neither table is asked about, not assumed.
- When one change spans ALLOWED and FORBIDDEN paths, split it. This skill changes the base; `/test-automation` migrates the consuming specs in a follow-up.
- Run Plan, Code, Verify, Archive in order for every non-trivial framework change. The pipeline is the gate, and "it is a quick refactor" is not an exemption: skipping it for `ApiBase.ts`, `UiBase.ts`, `TestContext.ts`, fixtures, the installer or the OpenAPI pipeline reliably ships undetected regressions.
- Leave per-ticket tests alone: the specs under `tests/e2e/` and `tests/integration/` and the per-module Page, Api and Steps components are `/test-automation` surface. The KATA bases (`TestContext.ts`, `ApiBase.ts`, `UiBase.ts`) and the fixture files are yours (`references/kata-invariants.md` §10.1).
- Keep the KATA layers (TestContext, Base, Domain, Fixture) intact, whatever the simplicity argument. They are framework architecture, not speculative abstraction.
- A new fixture API comes with the matching fixture file (`tests/components/TestFixture.ts`, `ApiFixture.ts` or `UiFixture.ts`), an updated `kata-manifest.json`, and at least one existing test that consumes it. Orphan fixtures rot, and the manifest is the anti-duplication gate (Critical Rule #12).
- A major bump of Playwright, Bun or TypeScript needs a regression run on a representative E2E suite first. Lockstep upgrades hide breaks in fixture lifecycle, locator engines and type emit.
- A change to `cli/install.ts` is exercised through the full install flow on a clean clone. Checking on an already-installed repo proves nothing, and the installer is where a bug ships silently to every new user.
- When the chosen approach reshapes test architecture (KATA layers, a fixture API, the runner, the isolation or parallelization model, the OpenAPI/type pipeline) and passes all three gates (hard to reverse, surprising without context, a real trade-off; `agentic-qa-core/references/adr-doctrine.md`), record an ADR under `.context/ADR/` after plan approval and before coding. The plan approval is the decision, so the ADR is written `Accepted` and cites it; it is never handed back for acceptance. `Proposed` is only for a question still open. ADRs are append-only: supersede, do not rewrite.
- Verify with all four checks (test, types, lint, skills) and treat any non-zero exit as REJECT: present retry, skip-and-document or abort, and do not auto-fix. A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.
- When the change is a skill (a new or restructured `.agents/skills/<slug>/`), scaffold it per `../agentic-qa-core/references/skill-scaffold.md` (frontmatter including `metadata.kind`, per-kind files and sections, Definition of Done). Write the skill text with the `writing-for-agents` and `humanizer` skills (see "Writing a skill"), `skill-creator` (T3, installed at project level) is always the builder: it makes the draft, the test prompts, the evals and the description pass. When `skill-creator` is missing, scaffold from the reference's template and say so. Consumer SUT context skills are not this skill's job: `project-context` mode `context-skill` owns them.
- `progress.md` is orchestrator-only. Code subagents return one-line summaries per task, and the orchestrator does not read their diffs.
- Close every change that adds, renames or retires a skill, a `package.json` script or a doc path, or that changes a behaviour a page describes, with the docs follow-through (Phase 3): patch `.agents/instructions/agent-context-map.md`, `.agents/instructions/agent-skills-and-mcps.md`, `README.md`, `INSTALLER.md`, `CONTEXT.md`, the `docs/core/` pages, the decks (`packages/decks/**`) and the Pages home (`packages/pages-home/**`) in the same PR. `bun run docs:check` proves the router and the quoted scripts; the prose is judgment.
- When an edit lands inside a `LINT.IfChange(<label>)` region (the hook prints a `DOCS:` line; ADR-0016), update every page its `LINT.ThenChange(...)` names in the same push. Add `Docs-Checked: <label> <reason>` to a commit message only when the documented behaviour did not change, and never by reflex or without a reason. Pre-push and CI block otherwise. A drift found later gets a new marker.
- When the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`, run the V5 drift sweep after the four verifiers, report-only (Phase 3). It greps the doc surface for prose that describes the old behaviour and counts the `Docs-Checked:` trailers the change used.
- Archive the session directory only after all four verifiers pass. On REJECT it stays in place so the run can be debugged or resumed.
- Route every change to `AGENTS.md`, a section under `.agents/instructions/`, the ROUTER or a `triggers:` list through mode `instructions`: place each sentence with `references/instructions-doctrine.md` §2 and close with `bun run instructions:check`. Section prose does not get pasted into `AGENTS.md`, and a ROUTER row needs the ADR that decides it (`--accept-router ADR-NNNN`, ADR-0013).
- When a review finding repeats, the first remedy is a check, not a prose line: a rule in the `kata` ESLint plugin (`eslint.config.base.js`), an `eslint-plugin-playwright` rule or a `kata-manifest.ts` check, with a message that names the doctrine section and the root-cause fix. Ship it at `KATA_ENFORCEMENT_LEVEL`, and add the "Enforced by" entry in `references/kata-invariants.md`. Write a prose line only when a machine cannot judge the case.
- Critical Rule #18, no comments in code by default: new and edited code carries no comments except a toolchain directive (`eslint-disable-next-line <rule> -- <reason>`, `@ts-expect-error`, `LINT.IfChange`/`LINT.ThenChange`) or one line of WHY the code cannot express and a reader would otherwise get wrong. No JSDoc blocks, section banners, narrated steps or example TODOs; teaching goes to docs and decks. Put this rule in component 7 of every Code-phase briefing, because a plan or briefing that omits it ships comments that a later pass has to strip.
- When a trigger misses or over-fires, fix the section's `triggers:` and add the prompts to `cli/lib/fixtures/instruction-router-eval.json`. A prompt is never relabelled to hide a miss.

**Read full SKILL.md when**: writing the plan artifact, batching Code-phase tasks, resuming an interrupted session, running mode `instructions`, writing a skill, or reading the ALLOWED/FORBIDDEN path tables themselves.

---

## Mode routing

The first token of `$ARGUMENTS` that names a mode below is the mode. Anything else runs the default pipeline.

| Mode | Trigger phrases | Reference | Output |
|---|---|---|---|
| (default) | evolve framework, new fixture API, refactor cli, boilerplate evolution, sync AI context | this file, Phase 0 to Phase 4 | the framework change, verified |
| `instructions` | edit `AGENTS.md`, add a rule, where does this rule go, router row, tune the triggers, new instruction section | `references/instructions-doctrine.md` | the edited instruction files, `instructions:check` green |

## Mode `instructions`

This is the one sanctioned path for changing what the agent is told on every session or per request kind. It is the default pipeline cut to the size of a text change: the placement table is the plan, the edit is the code, `instructions:check` is the verifier.

The structure of an instruction file follows the `writing-for-agents` skill (pointers, the two loads, the no-op test, completion criteria). Call the Skill tool with "writing-for-agents" before the Place step, and with "humanizer" before the Edit step so the prose reads like a person wrote it. Both skills are model-invoked, so a worker or a routine can load them without a person.

1. **Place.** For each sentence, walk `references/instructions-doctrine.md` §2 and write one line: sentence, file, and the question that decided it. A sentence that lands in a skill or in an `<aspect>-context` skill leaves this mode for that skill's own flow.
2. **Router row?** A new, changed or removed ROUTER row is a decision. Record the ADR (`agentic-qa-core/references/adr-doctrine.md`; `Accepted` when the owner already approved the change), make the edit, run `bun run instructions:check --accept-router ADR-NNNN`, and cite the fingerprint it prints in that ADR. Without the ADR the gate stays red, which is the lock doing its job.
3. **Edit.** L0 takes binding sentences only: a critical rule's full text goes in `agent-critical-rules.md` first, and the L0 line stays a verbatim fragment of it. A `triggers:` or `paths:` change adds the prompts that motivated it to `cli/lib/fixtures/instruction-router-eval.json`, labelled with what a careful reader of the ROUTER would load. Skills and sections load by meaning in any language, so a trigger list stays in English and a prompt in another language is a good eval case for it.
4. **New section?** Ship it complete: frontmatter, its ROUTER row (step 2), at least three labelled prompts that expect its `id`, and a row in the `## Sections` table of `.agents/instructions/README.md`.
5. **Verify.** `bun run instructions:check` (budget, router, frontmatter, rules, binding, the router lock, the eval, completeness), then `bun run docs:check` when a skill, script or doc path moved, then the Phase 3 verifiers as usual (`skills:check` already includes `instructions:check`). A red gate is reported with its output and never worked around.
6. **Measure (optional).** `bun run instructions:audit` reports how often routed sections are actually read, from local transcripts. Quote its overall number in the PR when the change is about routing.

## Writing a skill

A change that adds or rewrites a skill has three jobs, each with its own tool:

- Structure: Call the Skill tool with "writing-for-agents". It is the canon for what a skill leads with, what moves behind a pointer, how a description is worded and how each step ends on a completion criterion.
- Prose: Call the Skill tool with "humanizer" on the finished text. The code, commands, paths, frontmatter and variable placeholders stay as they are; only the sentences change.
- Behaviour: `skill-creator` is always the builder. After a rewrite, run it to check the skill still triggers on its own prompts and still does its job. A skill that reads well and no longer fires is a regression.

When `writing-for-agents` or `humanizer` is not installed, follow the summary in `../agentic-qa-core/references/skill-scaffold.md` "How a skill is written" and say so.

The scaffold contract (`../agentic-qa-core/references/skill-scaffold.md`) stays this repo's. Done when the skill passes `bun run skills:check`, its trigger prompts still pick it, and the registry is regenerated.

---

## Inputs

The reading order for any agent starting cold on a framework change. Stop early when the change is small enough that later inputs add nothing.

1. `kata-manifest.json`: the Component and ATC registry, source of truth per Critical Rule #12. It shows what already exists before a new fixture API, Page, Api, Steps module or ATC ID is proposed.
2. `.agents/skills/test-automation/references/kata-architecture.md` and `.agents/skills/test-automation/references/typescript-patterns.md`: the KATA layer flow (TestContext, ApiBase / UiBase, YourApi / YourPage, TestFixture), ATC identity rules, the fixture-selection contract and import-alias conventions.
3. `tests/components/`: the current Api, Page and Steps shape. Read it when touching any layer 2 or 3 surface, or a fixture those components consume.
4. `cli/install.ts`: the installer flow. Read it when evolving the installer, adding install steps or changing scaffold behaviour.
5. `scripts/sync-openapi.ts` and `api/schemas/`: the OpenAPI type pipeline. Read it when touching the API contract pipeline, schema generation or a consumer of the generated facades.
6. `package.json` and `bun.lock`: the dependency landscape. Read it before bumping Playwright, Bun, TypeScript or fixture-runtime versions, and before adding or removing scripts.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

The doctrine is `AGENTS.md` §3 (Orchestration Mode) plus the session contract in `.agents/skills/agentic-qa-core/references/session-management.md`. Every dispatch uses the 7-component briefing in `.agents/skills/agentic-qa-core/references/briefing-template.md`, with the pattern per phase picked from `.agents/skills/agentic-qa-core/references/dispatch-patterns.md`. The four phases mirror `/test-automation` (Plan, Code, Review) with an inline Archive step. Phase 0 stays inline: the path self-check and the resume check are short orchestrator decisions that gain nothing from a fresh-context subagent.

**Session scope**: `<change-name>` (kebab-case, given by the user at session start). Session state lives at `.session/framework-development/<change-name>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §9.

| Phase | Pattern | Subagent role |
|---|---|---|
| Phase 0: path self-check and session resume check | inline | The orchestrator alone. Lists target paths against `references/kata-invariants.md` §10 and aborts on FORBIDDEN. Also checks `.session/framework-development/<change-name>/` for a prior plan and progress and offers resume per `agentic-qa-core/references/session-management.md` §4. |
| Phase 1: Plan (`plan.md`) | Single | One Plan subagent writes `.session/framework-development/<change-name>/plan.md` per the `agentic-qa-core/references/session-management.md` §6 schema, folding explore, propose, spec, design and tasks into one artifact. |
| Phase 2: Code (per task batch) | Sequential | One Code subagent per task batch from the plan. The orchestrator appends to `progress.md` per `agentic-qa-core/references/session-management.md` §7. On a verification failure: stop, no auto-fix. |
| Phase 3: Verify, `bun run test` | Parallel (sub-stage) | One Verifier subagent runs the test suite. |
| Phase 3: Verify, `bun run types:check` | Parallel (sub-stage) | One Verifier subagent runs the typecheck. |
| Phase 3: Verify, `bun run lint:check` | Parallel (sub-stage) | One Verifier subagent runs ESLint. |
| Phase 3: Verify, `bun run skills:check` | Parallel (sub-stage) | One Verifier subagent runs the skill-registry lint (framework changes can affect `.agents/skills/`, `AGENTS.md`, `cli/install.ts`). |
| Phase 3: aggregation and accept/reject | inline | The orchestrator reads the 4 Verifier reports and decides. On any non-zero exit it presents retry, skip or abort. |
| Phase 3: V5 drift sweep (path-scoped) | Single (report-only) | Only when the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`. One subagent hunts the doc surface for sentences that describe the old behaviour. It never gates ACCEPT. |
| Phase 4: Archive (retro, then move plan and progress) | inline | The orchestrator alone. Runs the retro skill on the finished change, then moves `.session/framework-development/<change-name>/` to `.session/.archive/<YYYY-MM-DD>-framework-development-<change-name>/` (the two-file directory is kept per `agentic-qa-core/references/session-management.md` §8) and cites it in the commit. |

- **Plan artifact location**: `.session/framework-development/<change-name>/plan.md`. The `.session/` tree is gitignored, so the plan is local and never committed. After a mid-run crash the file persists, and the next session reads it back through the Phase 0 resume check (`agentic-qa-core/references/session-management.md` §4).
- **Path guardrails per dispatch**: every Plan and Code subagent briefing carries the line `KATA invariants and ALLOWED/FORBIDDEN paths: .agents/skills/framework-development/references/kata-invariants.md (read §10 before touching any file).` The path tables are not inlined; the reference is authoritative.
- **On any subagent failure**: stop and return the failing report. The orchestrator decides retry, skip or abort, and does not rerun on its own. See `.agents/skills/agentic-qa-core/references/orchestration-doctrine.md`.
- **Strict TDD flag**: set in Phase 1's `plan.md` under "Strict TDD flag", off by default and on only when the user explicitly opted in. The Code phase reads it from the plan, with no separate cache.

---

## Fleet seam (optional)

Phase 2 Code is sequential per task batch by default, and a change that fits one plan stays that way. A wave is several persistent worker sessions taking one task batch each, with a conductor integrating them. It suits a plan whose batches are independent (different files, no shared public API in flight). Offer it, and do not enter it silently.

- **Topology: same checkout, file ownership per worker.** Each worker's brief lists the exact files it owns, and each worker commits with explicit paths (not `git add -A`), so no worker stages another's work. When two batches must touch the same module, they do not share a wave: serialize them, or give each its own worktree.
- The conductor always writes `launch.txt` in `.session/framework-development/<change-name>/`, one self-contained line per worker, whether or not an orchestration transport exists on the machine. Launching, supervising and closing those sessions is `/agent-orchestration` (`[ORCHESTRATION_TOOL]`). Supervised launch is the native path, and `launch.txt` is the payload for the human-paste fallback when nothing can launch it.
- **Phase 0 and Phase 3 stay with the conductor.** The path self-check runs once, over the union of every worker's paths, before the first launch. The four Phase 3 verifiers run once, on the integrated tree, after the last worker reports. A green gate per worker is not a wave gate.
- **Read before every edit.** A neighbour may have changed a shared file since the brief was written. Critical Rule #15 (no global discards) matters twice as much when sessions share a tree.
- **Silence rule**: the absence of an orchestration transport is not named to the user and does not appear in the preflight gate or the plan.

---

## Readiness preflight gate (mandatory, runs before Phase 0)

Full doctrine: `agentic-qa-core/references/preflight-gate.md`. It runs first, before the path self-check and the resume check, on two laws: the change name and touched paths are provided args, so only the gaps are asked (args as answers); and capabilities are probed, not assumed. Gaps and REDs go out as one `AskUserQuestion` checklist, self-fixes need approval and an explanation, and any blocking RED stops the run. This skill evolves the framework itself and hits no live env, Jira, DB or API, so its gate is a dev-toolchain readiness check that pairs with the Phase 0 path self-check. The generic baseline (the two laws, secret and restart handling, the output contract) comes from the reference §3.1, and its env and credentials half is N/A for meta-work. Below is this skill's capability delta only.

| Capability | Need | Why here |
|---|---|---|
| Dev toolchain | REQUIRED | Phase 3 runs `bun run test`, `bun run types:check`, `bun run lint:check` and `bun run skills:check`. All four must resolve at the start. `bun install` if a dep is missing. |
| `kata-manifest.json` clean | REQUIRED | Source of truth (Critical Rule #12), and framework changes can invalidate it. `bun run kata:manifest:check` must be clean; `bun run kata:manifest` regenerates. |
| Playwright browsers | SCOPE: touching fixtures, KATA bases or tests | Verifying a fixture or base-class change runs the suite, which needs chromium (`bun run pw:install`). |
| `/github-actions-docs` + `/playwright-best-practices` | OPTIONAL | Injected per dispatch when the change touches CI YAML or fixtures and tests (the briefing skeleton already notes it). A skill that is not installed is skipped: do the step inline and say so. |

Active env, test-user credentials, OpenAPI or API token, DBHub, issue tracker, TMS and `resend` are N/A. After the gate clears (all REQUIRED green), continue to Phase 0.

---

## Phase 0 (path self-check and session resume check, mandatory, runs first)

Skipping Phase 0 is the most common way a framework change leaks into ticket-owned surface or loses state on an interruption. Before invoking any subagent, the orchestrator (a) lists the files and directories the change will touch and checks each against the ALLOWED and FORBIDDEN tables in `references/kata-invariants.md` §10, and (b) runs the session resume check from `agentic-qa-core/references/session-management.md` §4.

1. Read `references/kata-invariants.md` §10 (ALLOWED and FORBIDDEN paths).
2. Ask the user, or infer from the request, which paths the change will touch.
3. Look each path up. In §10 ALLOWED: proceed. In §10 FORBIDDEN: abort and redirect to the skill named in the row.
4. A path in neither table is asked about explicitly. Nothing is assumed.
5. A change that spans ALLOWED and FORBIDDEN paths (for example "refactor `tests/components/ui/UiBase.ts` and update the e2e tests that consume it") is split. This skill handles the base-class change; `/test-automation` handles the spec migration in a follow-up.
6. **Session resume check.** Look for `.session/framework-development/<change-name>/progress.md`. When it exists, read `plan.md` and the tail of `progress.md`, surface the last completed phase, the next planned phase and any blocking notes, and offer resume, restart or abort. On restart, archive the current directory to `.session/.archive/<YYYY-MM-DD>-framework-development-<change-name>-aborted/` before going on.

Phase 0 is one short inline decision and writes no file. When the change is approved, the decision is captured later in Phase 1's `plan.md` §Investigation.

---

## Native phase orchestration

After Phase 0 passes, the four phases run in dependency order, each subagent briefed in the 7-component format of `agentic-qa-core/references/briefing-template.md`. The skeleton for Plan and Code (fill the `<...>` slots):

```
Goal: <one-sentence outcome scoped to this phase>

Context docs:
  - .agents/skills/framework-development/references/kata-invariants.md
  - .session/framework-development/<change-name>/plan.md   (Code phase only)
  - .session/framework-development/<change-name>/progress.md   (Code phase, batches > 1; orchestrator-written, read-only for subagents)
  - <relevant ALLOWED-path files the phase will read or touch>

Project Standards (auto-resolved):
  <compact-rule blocks pulled from .agents/skills/REGISTRY.md per skill-resolver protocol>

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
  - Critical Rule #18 (no comments): new and edited code carries no comments except a toolchain directive (`eslint-disable-next-line <rule> -- <reason>`, `@ts-expect-error`, `LINT.IfChange`/`LINT.ThenChange`) or one line of WHY the code cannot express. No JSDoc blocks, banners or narrated steps.
  - Decisions: agentic-qa-core/references/decision-protocol.md before any question. A technical call inside the approved plan is decided and reported as DECIDED with the option it beat; escalate to the orchestrator only the four §5 kinds (product behaviour, a new security posture, an irreversible or outward action, what the owner reserved). Never widen the scope beyond the plan.
```

Each phase gates the next:

```
Phase 0 (inline) -> Phase 1 Plan (Single) -> Phase 2 Code (Sequential per batch) -> Phase 3 Verify (Parallel 4-way) -> Phase 4 Archive (inline)
```

### Phase 1: Plan

Dispatch: Single. The Plan subagent writes one consolidated artifact at `.session/framework-development/<change-name>/plan.md` with ten sections: Goal, Investigation, Approach options, Chosen approach, Invariants touched, Public API delta, Task breakdown, Strict TDD flag, Risks, Verification checklist. The seven base sections of `agentic-qa-core/references/session-management.md` §6 are mandatory; this skill adds Invariants touched, Public API delta and Strict TDD flag.

Present the plan to the user and wait for approval before Phase 2. An autonomous run (a worker or a routine) has no one to wait for: it follows `agentic-qa-core/references/decision-protocol.md`, records the plan's approval source in `plan.md` (the delegating brief or the settled decision), and proceeds only when that source exists. It stops and reports when it does not.

When the change is a skill, the Task breakdown follows `../agentic-qa-core/references/skill-scaffold.md` §2 for that kind, and the Verification checklist includes its §5 Definition of Done.

**ADR seeding (framework architecture).** A change that reshapes the test architecture gets an `Accepted` ADR after plan approval and before Phase 2; the rule is in Compact Rules and the test is in `agentic-qa-core/references/adr-doctrine.md` §1. Template and lifecycle: `.context/ADR/README.md`.

### Phase 2: Code

Dispatch: Sequential, one subagent per task batch. The orchestrator batches from the plan's task list: one batch per 3 to 5 closely coupled tasks, or one batch per task when it touches a load-bearing file such as `ApiBase.ts`, `UiBase.ts` or `TestContext.ts`.

Each subagent:

1. Reads `plan.md` and applies its batch's tasks in plan order.
2. Runs the per-task verification command listed in the plan.
3. Returns a one-line summary per task to the orchestrator.
4. On a verification failure: stops and reports, with no auto-fix.

The orchestrator reads only the summaries, never the Code subagent's diffs. When the user wants to see the changes, the orchestrator runs `git diff` inline after the batch returns. After each batch it appends a phase entry to `.session/framework-development/<change-name>/progress.md` per `agentic-qa-core/references/session-management.md` §7; subagents never write to that file.

### Phase 3: Verify

Dispatch: Parallel, four Verifier subagents in the same `<function_calls>` block.

| Verifier | Command | Captures |
|---|---|---|
| V1 | `bun run test` | exit code, summary |
| V2 | `bun run types:check` | exit code, summary |
| V3 | `bun run lint:check` | exit code, summary |
| V4 | `bun run skills:check` | exit code, ERROR/WARN/INFO counts |

`skills:check` is in the set because framework changes routinely touch `.agents/skills/framework-development/`, `agentic-qa-core/references/`, `AGENTS.md` and `cli/install.ts`, and `scripts/lint-skills.ts` gates every one of those surfaces (tier coherence, anti-leak, stale-path and the rest). The other three commands never see that surface, and the fourth verifier costs one parallel slot to prevent a whole failure class.

After all four return, the orchestrator aggregates inline:

- All four `exitCode == 0`: ACCEPT, proceed to Phase 4.
- Any `exitCode != 0`: REJECT. Present the failing verifier(s) with the options retry the failing Phase 2 batch, skip-and-document, or abort. No auto-fix.

### Docs follow-through (closing step of Phase 3)

Either trigger is enough: the change adds, renames or retires a skill, a `package.json` script or a doc path; or it changes a behaviour some page describes in prose (what a gate checks, what the installer asks or offers, which files a contract covers, how a rule is applied). The same PR then patches every doc that names or describes it: `.agents/instructions/agent-context-map.md` (task map), `.agents/instructions/agent-skills-and-mcps.md` (skill router), `README.md`, `INSTALLER.md`, `CONTEXT.md`, the `docs/core/` pages, the decks under `packages/decks/` and the Pages home under `packages/pages-home/`. The last two are the surface every measured drift missed. `bun run docs:check` (inside `repo:check`, and on every push) fails when a repo skill is missing from the §5 router or a doc quotes a `bun run` script `package.json` does not declare. The wording around each fact, and any page that describes the old behaviour, is read and fixed by hand. Human pages point to `.agents/skills/REGISTRY.md` for the skill list and do not enumerate it (Critical Rule #17). A downstream project's own docs are `test-framework-adaptation` Phase 9.3, never this skill.

**Declared couplings (ADR-0016).** A code region a page describes carries `LINT.IfChange(<label>)` and `LINT.ThenChange(<pages>)` comment lines. When the change touches one, every page it names changes in the same push, or a commit carries `Docs-Checked: <label> <reason>` because the documented behaviour still holds. Pre-push (`scripts/lint-doc-contracts.ts --push`) and CI block otherwise; the commit hook only warns. In Claude Code and Codex the edit hook prints the `DOCS:` line the moment the region is edited. When this change finds a drift no marker caught, add the marker in the same PR: that is how coverage grows where drift happens.

**V5 drift sweep (report-only, path-scoped).** It runs only when the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`, after the four verifiers. One subagent gets the diff (`git diff <merge-base>..HEAD`) and a one-paragraph summary of the behaviour that changed, then:

1. Extracts the changed behaviour's terms: flags, file names, commands, rule names, the old wording the diff removed.
2. Greps the doc surface: `README.md`, `INSTALLER.md`, `CONTEXT.md`, `AGENTS.md`, `.agents/instructions/**`, `.agents/skills/**`, `docs/**`, `packages/decks/**`, `packages/pages-home/**`.
3. Reads every hit in context and reports each sentence that is now wrong or silently incomplete, as `file:line`, the sentence, and what changed. A hit the PR already updated is not a finding.
4. Counts the `Docs-Checked:` trailers in the range (`git log --format=%B <merge-base>..HEAD`) and lists each label with its reason.

It never gates ACCEPT. The orchestrator fixes each finding or dismisses it with a reason, in the same PR. It is the one step that finds a coupling nobody declared.

### Phase 4: Archive

Dispatch: inline, no subagent. Archive is about closing the loop, not shipping: `/git-flow-master` ships the code from the diff Phase 2 produced and Phase 3 verified. On a Phase 3 REJECT, Phase 4 does not run and the working directory stays in place so the user can debug, resume or abort.

1. Confirm the Verification checklist in `plan.md` passes (all four Phase 3 verifiers returned exit 0).
2. **Retro.** Call the Skill tool with "retro" on the finished change: the plan, the progress log, the verifier results and any rework. Retro looks for what in the environment (navigation, automated checks, instruction files, tool cost) would make the next framework change go better. Retro ranks first the candidates that turn a repeated review finding into a check (the correction-to-check rule in Compact Rules), ahead of prose edits. Its candidates go to `.session/framework-development/<change-name>/refinements.md`, as proposals only; they are never applied to a live skill (`../agentic-qa-core/references/skill-refinement-protocol.md`), and the session footer counts them.
   - A person is at the keyboard: retro presents the ranked candidates to them in the chat as well.
   - Nobody is (a worker, a fleet session, a routine): retro writes the ranked candidates to `refinements.md` and the final report names that path. Nothing waits for an answer and archive goes on; the launcher or the owner reads the file later.
   - Retro finding nothing is a valid outcome: the report says so in one line.
   - When `retro` is not installed, write `retro skipped: not installed` in `refinements.md` and continue.
3. Move the whole working directory: `mv .session/framework-development/<change-name>/ .session/.archive/<YYYY-MM-DD>-framework-development-<change-name>/`. `plan.md`, `progress.md` and `refinements.md` stay side by side, with no concatenation, so a future resume or replay remains possible.
4. Call Engram `mem_session_summary` with the session template from `agentic-qa-core/references/session-management.md` §11. The summary includes the archive path so `mem_search "session framework-development <change-name>"` resolves back to the artifacts.
5. Surface the archive path so `/git-flow-master` can put it in the commit message body.

---

## Session close contract

**Session-footer contract (at close).** The final phase is not done until the two chat-facing blocks from `../agentic-qa-core/references/session-footer-contract.md` are printed. The first is a consolidated screenshot list (repo-relative paths, verified on disk, bug annotations first), plus in-flow surfacing of every capture's path the moment it lands. The second is the Session Footer, listing the skills, MCPs and CLIs actually used and the testing levels touched, with explicit "none" entries for expected-but-untouched levels. The framing for this skill is meta. In multi-subagent sessions each stage report carries the five footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `testing_levels_touched`, `screenshots_captured`) and the orchestrator compiles the footer once at close. It is chat only, never in a Jira comment or an ATR body. Lessons noticed during the session are proposed to `.session/<skill-slug>/<scope>/refinements.md` and never applied to a live skill, per `../agentic-qa-core/references/skill-refinement-protocol.md`; the footer's `Refinements proposed:` line counts them.

---

## References

- `references/kata-invariants.md`: invariant versus extensible rules for the 4 KATA layers, fixture selection, ATC identity, DRY scope, import aliases, the public-method contract, extension points, the evolution checklist, out-of-scope surfaces and the §10 ALLOWED / FORBIDDEN path tables. Read it before any Plan or Code subagent that touches `tests/components/`, `api/schemas/` or fixtures.
- `references/instructions-doctrine.md`: where a sentence goes among L0, a section, a skill and a context skill (mode `instructions`).
- `../agentic-qa-core/references/skill-composition-strategy.md`: the T1 to T4 tier model, category vocabulary and validation rules. Its §4 anti-leak contract is informational here: this skill does not chain SDD by default, and §4 governs users who install SDD themselves and ask for its ceremony.
- `../agentic-qa-core/references/briefing-template.md`: 7-component briefing examples per pattern.
- `../agentic-qa-core/references/dispatch-patterns.md`: the Single, Sequential, Parallel and Background decision guide.
- `../agentic-qa-core/references/orchestration-doctrine.md`: the failure protocol, ask-on-error and no auto-fix.
- `../agentic-qa-core/references/session-management.md`: the Phase 0 resume contract, the `plan.md` and `progress.md` schemas, archive policy, scope naming and Engram coupling. This skill is one producer of the `session/...` topic keys.
