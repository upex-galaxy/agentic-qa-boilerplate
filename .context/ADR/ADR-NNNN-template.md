# ADR-NNNN — <Short decision title>

- **Status:** Proposed <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** YYYY-MM-DD <!-- date the decision was made / last status change -->
- **Deciders:** <names or roles — who owns this decision (QA architect / lead / framework owner)>
- **Tags:** <comma-separated, e.g. test-runner, fixtures, isolation, auth-in-tests, ci>
- **Supersedes:** — <!-- ADR-MMMM if this replaces an older decision, else — -->
- **Superseded by:** — <!-- ADR-MMMM if a newer decision replaced this, else — -->

---

## Context

What forces a test-architecture decision here? Describe the problem, the constraints (tooling, CI, flake, team, time), and the assumptions in play. State what is true _now_ — enough that a reader six months from now understands the pressure without having been in the room. Cite evidence where it exists (flaky-run data, CI timing, a vendor limit, an SRS requirement, an incident).

Common contexts: test-runner / framework choice, test-isolation & parallelization model, fixture / test-data strategy, auth-in-tests approach, selector / `data-testid` contract, exploratory-vs-scripted boundary, reporting / CI sharding, flake-retry & timeout policy.

## Decision

The option we chose, stated as a clear, active sentence: "We will …". Be specific enough that someone can tell whether a future test change violates it. If the decision introduces an invariant every test must uphold (e.g. "every E2E test resets state via transactional rollback"), state the invariant explicitly.

## Consequences

What becomes true once this is in effect — the good, the bad, and the neutral. This is the section future readers care about most.

- **Positive:** what gets easier, faster, or less flaky.
- **Negative / trade-offs:** what gets harder or what we give up (runtime cost, setup complexity, lock-in). An ADR with no negative is usually under-examined.
- **Neutral / follow-ups:** new constraints, things to revisit, work this unblocks or blocks.

## Alternatives considered

The serious options we did **not** pick, and why. One short block each — enough that nobody re-proposes a rejected option without new information.

- **<Alternative A>** — why rejected.
- **<Alternative B>** — why rejected.

## References

- Links to SRS / infrastructure docs, tickets, flaky-run reports, CI dashboards, prior ADRs, external write-ups that informed this decision.

<!--
Authoring notes (delete this comment in the real ADR):
- Filename: ADR-<NNNN>-<kebab-slug>.md  (4-digit number, never reused).
- Add a row to .context/ADR/README.md → Index after creating this file.
- Append-only: once Accepted, do not rewrite the Decision/Consequences. To change course,
  write a NEW ADR that Supersedes this one and flip this file's Status + Superseded-by line.
- Only ADR-worthy decisions belong here: architectural AND hard to reverse. Ticket-local
  test trade-offs stay in the ticket's acceptance-test-planning.md / automation plan.
  See .context/ADR/README.md.
-->
