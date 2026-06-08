# ADR Doctrine — detecting and authoring test-architecture decision records

Shared reference cited by `project-discovery` (SRS / infrastructure), `framework-development` (framework evolution), and `sprint-testing` + `test-automation` (Stage 1 / Phase 1 planning). It tells a workflow **when** a test-architecture decision deserves a permanent record, and **how** to author one without re-litigating settled decisions.

The canonical convention — template, status lifecycle, append-only rule, index — lives in `.context/ADR/README.md`. This file owns the AI-side **detection heuristic**, the **promotion rule**, and the **authoring procedure**. Read both; do not duplicate the lifecycle here.

> "Architecture" = **test architecture**, not product architecture. A wrong runner / fixture / isolation decision is among the most expensive things to reverse in software — you rewrite the suite. So test work is an unusually strong fit for ADRs.

---

## 1. The two-gate detection heuristic

A decision earns an ADR only when it passes **both** gates. One gate alone is not enough.

```
                  ┌─────────────────────────────┐
 decision made ──▶│ Gate 1: architectural?      │── no ──▶ no ADR
                  │ (test-suite structure /      │
                  │  cross-cutting test concern / │
                  │  test invariant)             │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                  ┌─────────────────────────────┐
                  │ Gate 2: hard to reverse?    │── no ──▶ no ADR (record locally)
                  │ (rewrite many tests /        │
                  │  migrate fixtures+data /      │
                  │  coordinate across QA team)  │
                  └──────────────┬──────────────┘
                                 │ yes
                                 ▼
                          record an ADR
```

**Passes both → ADR.** Test-runner / framework choice with lock-in (Playwright vs Cypress vs WebdriverIO), Page-Object vs Screenplay, fixture / test-data strategy (factories vs seeded DB vs API setup vs static fixtures), test-isolation & parallelization model (per-worker DB, transactional rollback, namespacing), auth-in-tests strategy (storageState reuse vs login-per-test vs token injection), the selector / `data-testid` contract, the exploratory-vs-scripted boundary, reporting / CI sharding, flake-retry & timeout policy.

**Fails a gate → not an ADR.** Flaky-fix root causes (→ engram + regression report), renaming a spec, a one-off `waitFor`, picking an assertion helper for a single spec, single-use scaffolding, and **ticket-local test decisions** (→ stay in the ticket's `acceptance-test-planning.md` / automation plan).

When genuinely unsure, ask the user one question rather than recording silently or skipping silently: _"This looks like a hard-to-reverse test-architecture call — record it as an ADR?"_

---

## 2. The promotion rule (ticket-local vs ADR-worthy)

The acceptance-test-planning and automation-plan templates already have a `## Technical Decisions` / `## Architecture Decisions` section. Most of what lands there is **ticket-local** and stays there. Promote a decision out of the plan and into a standalone ADR only when it passes both gates.

| Decision                                                       | Lives in                                          |
| -------------------------------------------------------------- | ------------------------------------------------- |
| "Use a longer `expect` timeout on this one assertion"          | ticket `acceptance-test-planning.md` / plan        |
| "This ATC verifies via the API instead of the UI"             | ticket `acceptance-test-planning.md` / plan        |
| "All E2E tests reset state via per-worker transactional rollback" | **ADR** (+ a pointer from the plan)            |
| "Every test reuses a stored `storageState`, never login-per-test" | **ADR** (+ a pointer from the plan)            |

When you promote, leave a one-line backlink in the plan's `## Technical Decisions` (`See ADR-NNNN`) so the plan stays self-explaining and the decision is tracked where it can be superseded.

---

## 3. Authoring procedure

1. **Confirm both gates** (§1). If unsure, ask.
2. **Allocate the number.** Read `.context/ADR/README.md` → Index for the highest existing `ADR-NNNN`; the new one is the next 4-digit, zero-padded number. Numbers are never reused.
3. **Copy the template.** `.context/ADR/ADR-NNNN-template.md` → `.context/ADR/ADR-<NNNN>-<slug>.md` (`<slug>` = short kebab summary). Fill every section — Context, Decision, Consequences (positive **and** negative), Alternatives considered.
4. **Set status honestly.** Open question remaining → `Proposed`. Agreed and binding → `Accepted` **after the human approves**. An AI workflow drafts; the human accepts.
5. **Update the Index** table in `.context/ADR/README.md` (ADR / Title / Status / Supersedes / Superseded by).
6. **If it supersedes an existing ADR**, wire both directions and flip the old ADR's `Status` line to `Superseded by ADR-<NNNN>`. **Never edit the superseded decision's body** — it is the historical record.
7. **Persist to engram** (`mem_save`, type `architecture`) so the decision survives compaction, per the proactive-memory protocol.

---

## 4. Where this plugs into the workflows

- **`/project-discovery`, SRS / infrastructure phases** — when defining (greenfield) or discovering (brownfield) the project's test landscape, the big cross-cutting choices are exactly the ADR-worthy ones. Seed / flag the **first batch** here (test-runner, isolation model, fixture/data strategy, auth-in-tests, selector contract), referencing `.context/SRS/` and `.context/infrastructure/`. Foundational, made once, maximally hard to reverse.
- **`/framework-development`, Phase 1 planning** — the primary seeding site for the boilerplate's **own** test architecture. When a change reshapes KATA layers, fixture APIs, the test runner, or the isolation model, record an ADR before Phase 2 coding. Framework evolution is meta-work — its decisions touch every test session that follows.
- **`/sprint-testing` + `/test-automation`, Stage 1 / Phase 1 planning** — when a ticket forces a decision that passes both gates (and wasn't already covered by a foundation ADR), promote it from the plan's `## Technical Decisions` / `## Architecture Decisions` to a standalone ADR before coding. Architectural rework discovered mid-review loops back here.

---

## 5. Anti-patterns — NEVER do these

- **A1.** NEVER ADR a ticket-local test trade-off. If it changes one spec and is easy to undo, it stays in the ticket's plan. Over-recording buries the decisions that matter.
- **A2.** NEVER rewrite or delete an Accepted ADR to "update" it. Write a new ADR that supersedes it. The old one stays as history (append-only).
- **A3.** NEVER record an ADR with no `Negative / trade-off` consequence. A decision with only upsides is under-examined — find the cost (runtime, flake, setup, lock-in) or it isn't a real architectural choice.
- **A4.** NEVER mark an AI-drafted ADR `Accepted` without explicit human sign-off. Draft as `Proposed`; the human flips it to `Accepted`.
- **A5.** NEVER reuse or skip ADR numbers. The Index in `.context/ADR/README.md` is the allocator — read it before assigning.
