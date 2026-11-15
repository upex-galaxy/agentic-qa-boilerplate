# ADR Doctrine: detecting and authoring test-architecture decision records

Shared reference cited by `project-discovery` (architecture and infrastructure phases), `framework-development` (framework evolution), and `sprint-testing` and `test-automation` (Stage 1 / Phase 1 planning). It tells a workflow when a test-architecture decision deserves a permanent record, and how to write one without re-litigating settled decisions.

The canonical convention (template, status lifecycle, append-only rule, index) lives in `.context/ADR/README.md`. This file owns the detection test, the promotion rule and the authoring procedure. Read both, and keep the lifecycle there.

"Architecture" here means test architecture, not product architecture. A wrong runner, fixture or isolation decision is among the most expensive things to reverse, because you rewrite the suite. That is why test work fits ADRs so well.

The test below is the three-gate ADR test from the `domain-modeling` skill (its `ADR-FORMAT.md`), applied to the test suite. Its goal is a short list of decisions a future reader would otherwise "fix" by mistake, so over-recording is as much a failure as under-recording.

---

## 1. The three-gate detection test

A decision about the test suite's structure, a cross-cutting test concern or a test invariant earns an ADR only when it passes all three gates. One or two gates are not enough.

```
                  ┌─────────────────────────────┐
 decision made ──▶│ Gate 1: hard to reverse?    │── no ──▶ no ADR (you will just reverse it)
                  │ (rewrite many tests /        │
                  │  migrate fixtures+data /      │
                  │  coordinate across QA team)  │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                  ┌─────────────────────────────┐
                  │ Gate 2: surprising without  │── no ──▶ no ADR (nobody will wonder why)
                  │ context? (a future reader    │
                  │  would ask "why this way?")  │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                  ┌─────────────────────────────┐
                  │ Gate 3: a real trade-off?   │── no ──▶ no ADR (the obvious thing, nothing to record)
                  │ (genuine alternatives, one   │
                  │  picked for stated reasons)  │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                          record an ADR
```

Passes all three: test-runner or framework choice with lock-in (Playwright vs Cypress vs WebdriverIO), Page-Object vs Screenplay, fixture and test-data strategy (factories vs seeded DB vs API setup vs static fixtures), the isolation and parallelization model (per-worker DB, transactional rollback, namespacing), auth-in-tests (storageState reuse vs login-per-test vs token injection), the selector and `data-testid` contract, the exploratory-vs-scripted boundary, reporting and CI sharding, flake-retry and timeout policy. Also worth recording: a deliberate deviation from the obvious path, a constraint the code does not show (a compliance rule, a partner SLA), and a rejected alternative whose rejection is non-obvious.

Fails a gate: flaky-fix root causes (they go to engram and the regression report), renaming a spec, a one-off `waitFor`, an assertion helper for a single spec, single-use scaffolding, and ticket-local test decisions (they stay in the ticket's `acceptance-test-planning.md` or automation plan). A ticket-local trade-off that changes one spec and is easy to undo never becomes an ADR; over-recording buries the decisions that matter.

When you are unsure, ask the user one question instead of recording or skipping silently: "This looks like a hard-to-reverse test-architecture call, record it as an ADR?" A supervised worker asks its conductor. With nobody to ask, `decision-protocol.md` applies: record it as `Proposed` and report it.

---

## 2. The promotion rule (ticket-local vs ADR-worthy)

The acceptance-test-planning and automation-plan templates already have a `## Technical Decisions` / `## Architecture Decisions` section. Most of what lands there is ticket-local and stays there. Promote a decision into a standalone ADR only when it passes all three gates.

| Decision                                                       | Lives in                                          |
| -------------------------------------------------------------- | ------------------------------------------------- |
| "Use a longer `expect` timeout on this one assertion"          | ticket `acceptance-test-planning.md` / plan        |
| "This ATC verifies via the API instead of the UI"             | ticket `acceptance-test-planning.md` / plan        |
| "All E2E tests reset state via per-worker transactional rollback" | **ADR** (+ a pointer from the plan)            |
| "Every test reuses a stored `storageState`, never login-per-test" | **ADR** (+ a pointer from the plan)            |

When you promote, leave a one-line backlink in the plan's `## Technical Decisions` (`See ADR-NNNN`) so the plan stays self-explaining and the decision is tracked where it can be superseded.

---

## 3. Authoring procedure

1. Confirm the three gates (§1). If unsure, ask.
2. Allocate the number by hand, there is no script. Open `.context/ADR/README.md`, read the Index table, take `max(existing NNNN) + 1` and zero-pad to 4 digits. The Index table is the only allocator (there is no `adr:next` command), so read it before assigning. Numbers are never reused or skipped, even when an ADR is superseded or deprecated.
3. Copy the template `.context/ADR/ADR-NNNN-template.md` to `.context/ADR/ADR-<NNNN>-<slug>.md` (`<slug>` is a short kebab summary). Fill every section: Context, Decision, Consequences (positive and negative), Alternatives considered. A section can be one sentence. Name a real cost under the negative consequences (runtime, flake, setup, lock-in); a decision with only upsides is under-examined, and if you cannot find the cost it was not a real architectural choice.
4. Set the status honestly. The ADR records a decision the human already made (a decision deck, a chat answer, an approved plan): write it `Accepted`, and let the `Deciders` line name where it was approved. A question still open is `Proposed`, and the ADR says what is unresolved. Do not ask the human to "accept" an ADR that only records a decision they already took, because the approval happened when they decided. Do not mark `Accepted` a decision no human approved.
5. Update the Index table in `.context/ADR/README.md` (ADR / Title / Status / Supersedes / Superseded by).
6. If it supersedes an existing ADR, wire both directions and flip the old ADR's `Status` line to `Superseded by ADR-<NNNN>`. Do not edit or delete an Accepted ADR's body to "update" it: write a new ADR that supersedes it, and the old one stays as the historical record.
7. Persist to engram (`mem_save`, type `architecture`) so the decision survives compaction, per the proactive-memory protocol.

---

## 4. Where this plugs into the workflows

- `/project-discovery`, architecture and infrastructure phases (Phases 2-3): defining (greenfield) or discovering (brownfield) the test landscape surfaces the big cross-cutting choices. Seed or flag the first batch here (test-runner, isolation model, fixture and data strategy, auth-in-tests, selector contract), citing the `infra-context` map sections they rest on (`bun run context:map infra-context --section <id>`). These are foundational, made once, and the hardest to reverse.
- `/framework-development`, Phase 1 planning: the main seeding site for the boilerplate's own test architecture. When a change reshapes KATA layers, fixture APIs, the test runner or the isolation model, record an ADR before Phase 2 coding, because its decisions touch every test session that follows.
- `/sprint-testing` and `/test-automation`, Stage 1 / Phase 1 planning: when a ticket forces a decision that passes the three gates and no foundation ADR covers it, promote it from the plan's `## Technical Decisions` / `## Architecture Decisions` to a standalone ADR before coding. Architectural rework found mid-review loops back here.
