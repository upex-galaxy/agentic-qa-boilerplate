# `.context/ADR/` — Architecture Decision Records (test architecture)

Append-only log of the **important, hard-to-reverse** test-architecture decisions made on this project. One file per decision. Decisions are never deleted — they are **superseded** by newer ADRs that link back, so the history of _why the test suite is the way it is_ stays intact.

The point: a future human or AI session can read these instead of re-litigating a settled decision or silently violating a test invariant it didn't know existed (e.g. swapping the fixture model in one ticket and breaking isolation everywhere else).

> "Architecture" here means **test architecture**, not product architecture. A wrong test-framework / fixture / isolation decision is among the most expensive things to reverse in all of software — you rewrite the suite. That makes test work an unusually strong fit for ADRs.

---

## What an ADR is (and is not)

An ADR captures a single decision: the context that forced it, the option chosen, the alternatives rejected, and the consequences the team accepted. It is a **source-of-truth document**, not a cache — nothing regenerates it, and it is committed to git like the test code.

It is the right artifact when a decision passes **both** gates:

| Gate                  | Question                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| **1 — Architectural** | Does it shape the test-suite structure, a cross-cutting test concern, or an invariant every test must uphold?  |
| **2 — Hard to reverse** | Would changing it later mean rewriting many tests, migrating fixtures/test-data setup, or coordinating across the QA team? |

Examples that earn an ADR: test-runner / framework choice with real lock-in (Playwright vs Cypress vs WebdriverIO), Page-Object vs Screenplay vs raw, fixture / test-data strategy (factories vs seeded DB vs API setup vs static fixtures), test-isolation & parallelization model (per-worker DB, transactional rollback, namespacing), auth-in-tests strategy (storageState reuse vs login-per-test vs token injection), the selector / `data-testid` contract with the app, the exploratory-vs-scripted boundary, reporting / CI sharding strategy, flake-retry & timeout policy.

**NOT an ADR** (these have other homes):

- A flaky-test fix or its root cause → engram `mem_save` + the regression report.
- Renaming a test file, a one-off `waitFor`, picking an assertion helper for a single spec → just the commit.
- Single-use test scaffolding → no record needed.
- **Ticket-local test decisions** (which fixture for one ATC, one selector tweak, a one-spec trade-off) → they stay in that ticket's `acceptance-test-planning.md` / automation plan under `## Technical Decisions`. Promote one to an ADR **only** when it passes both gates above.

---

## Status lifecycle

```
Proposed ──→ Accepted ──→ Superseded   (by ADR-NNNN, which links back)
                   └────→ Deprecated   (no longer applies; nothing replaces it)
```

- **Proposed** — drafted, under discussion, not yet binding.
- **Accepted** — binding. Downstream test work must honor it.
- **Superseded** — a newer ADR replaces it. Set `Superseded by: ADR-NNNN`; the new ADR sets `Supersedes: ADR-MMMM`. **Do not edit the old decision body** — leave it as the historical record. (Test-architecture decisions evolve as the suite matures, so superseding is the normal, expected path.)
- **Deprecated** — the decision no longer applies and nothing replaces it (e.g. that test surface was removed).

**Append-only.** Never delete an ADR file. Never rewrite a decision after it is Accepted — supersede it with a new one. The only in-place edit allowed on an Accepted ADR is flipping its `Status` line and adding the `Superseded by` / `Deprecated` pointer.

---

## How to write one

1. Copy [`ADR-NNNN-template.md`](./ADR-NNNN-template.md) to `ADR-<NNNN>-<slug>.md`.
   - `<NNNN>` = next free 4-digit number, zero-padded (`0001`, `0002`, …). Numbers are never reused.
   - `<slug>` = short kebab-case summary (`playwright-over-cypress`, `transactional-test-isolation`).
2. Fill every section. If a decision is still open, set `Status: Proposed` and say what's unresolved.
3. Add a row to the **Index** below.
4. If it supersedes an existing ADR, wire both directions (`Supersedes` / `Superseded by`) and flip the old one's `Status`.

Who authors: a human QA architect / lead directly, **or** an AI workflow that detected an ADR-worthy decision and drafted it for human approval — `/project-discovery` (SRS / infrastructure test-architecture, seeds the first batch), `/framework-development` (when evolving the boilerplate's own KATA layers, fixtures, or runner), and `/sprint-testing` + `/test-automation` (Stage 1 / Phase 1 planning, when a ticket forces a hard-to-reverse test-architecture decision). Either way, the human approves before `Status: Accepted`. The detection + authoring procedure for AI workflows lives in `.claude/skills/agentic-qa-core/references/adr-doctrine.md`.

---

## Index

| ADR | Title | Status | Supersedes | Superseded by |
| --- | ----- | ------ | ---------- | ------------- |
| _— none yet —_ | The first ADR is usually seeded during `/project-discovery` (SRS / infrastructure), `/framework-development` (framework evolution), or the first `/sprint-testing` · `/test-automation` ticket that forces a hard-to-reverse test-architecture decision. | | | |

> Keep this table in sync whenever an ADR is added or its status changes. It is the fast index every session reads first.

---

## References

- Template: [`ADR-NNNN-template.md`](./ADR-NNNN-template.md)
- AI detection + authoring doctrine: `.claude/skills/agentic-qa-core/references/adr-doctrine.md`
- Where this folder sits in the bigger map: `.context/README.md` and root `CONTEXT.md`
- These records cover **test-architecture** decisions — both the boilerplate's own test framework (KATA layers, fixtures, runner — owned by `/framework-development`) and how it is wired to a specific project under test (discovered by `/project-discovery`).
