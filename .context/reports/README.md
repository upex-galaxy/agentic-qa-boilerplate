# reports/ — Sprint Reports

Historical home for sprint-level testing frameworks. One file per sprint, generated and maintained by the `/sprint-testing` skill in batch-sprint mode.

Sprint reports are cross-ticket aggregates; they sit here so they don't get buried inside the per-ticket content in `.context/PBI/`.

## Naming convention

`SPRINT-{N}-TESTING.md`, where `{N}` is the sprint number.

Examples: `SPRINT-9-TESTING.md`, `SPRINT-10-TESTING.md`.

## What each file contains

- Wave 1 / Wave 2 ticket roadmap for the sprint.
- Per-ticket status (PENDING / PASSED / FAILED), ATP link, ATR link, TCs.
- Carryover tickets from the previous sprint.
- QA lead assignment and unassigned counts.

## Lifecycle

| Stage | Trigger | Actor |
|-------|---------|-------|
| **Created** | `/sprint-testing` §Session Start step 0.5, when batch mode is detected and the file is missing (or stale > 24h) | `/sprint-testing` skill |
| **Updated** | After Stage 3 completes for each ticket in the sprint | `/sprint-testing` skill |
| **Retained** | Never deleted — old sprint reports stay for audit and trend analysis | — |

The framework file is the single source of truth for sprint progress.

## How to consume

- Open the latest file to see in-flight sprint state.
- Diff consecutive files to detect recurring carryovers.
- Feed into retro-prep tools or dashboards.

## Related

- Ticket-level artifacts (ATPs, ATRs, evidence) -> `.context/PBI/`.
- Sprint-wide test strategy -> `.context/master-test-plan.md`.
