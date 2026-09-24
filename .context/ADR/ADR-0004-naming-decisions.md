# ADR-0004 — Twelve naming conventions for QA artifacts outside the planning ladder

- **Status:** Accepted
- **Date:** 2026-06-26 (ratified); recorded as an ADR 2026-09-24
- **Deciders:** framework owner (boilerplate maintainer)
- **Tags:** naming, test-data, evidence, mocks, adr, environments, allure, local-cache, gherkin, blocked-tests
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The planning ladder (`.agents/skills/agentic-qa-core/references/planning-ladder.md`) fixed the names of Plans, Runs and Test Sets in Jira. Twelve other surfaces had no convention at all: test-data files, evidence screenshots, mocks, ADR numbers, environment ids, test folders, Allure labels, the local cache folders for executions and defects, the data factory, Gherkin variables and the blocked-test marker. Each skill improvised, so the same thing was spelled three ways across references.

The twelve gaps were proposed, ratified on 2026-06-26 and written into their owning skill references the same day. The working backlog that tracked them lived at docs/qa-standard/naming-gaps-backlog.md until the docs relaunch (2026-09-24) moved AI context out of `docs/`. This ADR is its permanent record.

## Decision

We will use these twelve conventions. The owning surface is where each is documented and enforced by review; this ADR records the decision, not the detail.

| # | Surface | Convention | Owning surface |
|---|---|---|---|
| 1 | Test-data files | `{resource}-{variant}.json` (`users-valid.json`, `orders-boundary.json`) | `test-automation/references/automation-standards.md` |
| 2 | Evidence / screenshots | `{KEY}-step{NN}-{action}.png` (`UPEX-101-step3-error-shown.png`) | `sprint-testing/references/reporting-templates.md` |
| 3 | Mock / stub responses | `tests/data/mocks/{endpoint}/{method}.{status}.json` (`auth/login/200.json`) | `test-automation/references/` (mocking) |
| 4 | ADR numbering | `ADR-{NNNN}-{slug}.md`, number allocated MANUALLY as `max(NNNN)+1` from the Index in `.context/ADR/README.md` | `.context/ADR/README.md`, `agentic-qa-core/references/adr-doctrine.md` |
| 5 | Environment ids | `local` · `qa` · `staging` · `production`, lowercase, no abbreviations | `.agents/project.yaml` `environments`, AGENTS.md §8 |
| 6 | Test module folders | `{domain-plural}/` in kebab-case (`orders/`, `user-management/`) | `test-automation/references/automation-standards.md` |
| 7 | Allure suite labels | derived from the Playwright tag (`@smoke`, `@regression`, ...), one source, no duplicate label | `regression-testing/SKILL.md`, `test-automation` (tags) |
| 8 | Test-execution files in the cache | the existing sync convention `test-executions/{ATR\|STR\|RTR\|RETEST}-{KEY}-{slug}.md`, `TESTEXEC-` / `RETESTEXEC-` kept for non-conforming titles | AGENTS.md §9, `scripts/sync-jira-issues.ts` |
| 9 | Defect files in the cache | the existing sync convention, one flat file per defect: `defects/DEFECT-{KEY}-{slug}.md` | AGENTS.md §9, `scripts/sync-jira-issues.ts` |
| 10 | Data factory / types | `DataFactory.ts` and `types.ts` under `tests/data/` (naming only) | `test-automation/references/kata-architecture.md` |
| 11 | Gherkin variables | `{snake_case}` (`{user_id}`, `{order_amount}`) | `test-documentation/references/tms-conventions.md` |
| 12 | Blocked-test marker | `@blocked:{BUG-KEY}` tag plus `test.fail('Blocked by {BUG-KEY}')` | `test-automation/references/planning-playbook.md`, `regression-testing` (GO/NO-GO filter) |

Row 8 gained the `RTR` acronym with ADR-0002 (2026-09-23).

## Consequences

- **Positive:** one spelling per surface; a reviewer can reject a name by pointing at a row. The roll-out was documentation only, so nothing broke.
- **Negative / trade-offs:** no lint rule enforces any of the twelve. Drift is caught by review or not at all. That was a deliberate choice (low risk over coverage) and is the first thing to revisit if drift shows up.
- **Neutral / follow-ups:** rows 8 and 9 were sequenced with the ladder's items-over-fields work in `scripts/sync-jira-issues.ts`, because they share the cache layout.

## Alternatives considered

- **`bun run adr:next` pre-allocator (row 4)**: rejected. The README Index is the allocator; a script for a once-a-month action was not worth owning.
- **Execution folders `test-executions/{EXEC-KEY}-{ts}/` (row 8)**: rejected in favour of the flat file the sync already wrote.
- **Nested defect layout `bug.md` + `evidence/` + `related-tests/` (row 9)**: rejected in favour of the existing flat `DEFECT-{KEY}-{slug}.md`.
- **Scaffolding `DataFactory.ts` / `types.ts` / `constants.ts` stubs (row 10)**: rejected here; scaffolding is a `/framework-development` task, and `constants.ts` does not exist on disk.
- **Lint enforcement for all twelve**: declined for the first pass (see Consequences).

## References

- `.agents/skills/agentic-qa-core/references/planning-ladder.md`: the ladder these twelve sit beside.
- `.context/ADR/ADR-0002-regression-run-record.md`: added `RTR` to row 8.
- The Naming Codex deck (`packages/decks/agentic-qa-core/naming-conventions.es.html`).
