# Naming Gaps — Approved Backlog (implement AFTER the planning ladder is ratified)

> **Status**: all 12 conventions **APPROVED by the user**. **Blocked**: do NOT implement
> until `planning-ladder-proposal.md` (the MTP/FTP/STP/ATP + FTR/STR/ATR nomenclature) is
> ratified and propagated first — the ladder is the structural backbone these gaps hang off.
>
> **On implementation**: for each gap, write the convention into the owning skill's
> `references/*.md`, add a lint rule where enforceable, and add it to the Naming Codex deck
> (EN + ES) under the relevant layer. Then regenerate `REGISTRY.md`.

| # | Gap | Approved convention | Owning surface |
|---|---|---|---|
| 1 | Test-data files | `{resource}-{variant}.json` → `users-valid.json`, `orders-boundary.json` | `test-automation/references/automation-standards.md` (tests/data) |
| 2 | Evidence / screenshots | `{KEY}-step{NN}-{action}.png` → `UPEX-101-step3-error-shown.png` | `sprint-testing/references/reporting-templates.md` (evidence/) |
| 3 | Mock / stub responses | `tests/data/mocks/{endpoint}/{method}.{status}.json` → `auth/login/200.json` | `test-automation/references` (mocking) |
| 4 | ADR file numbering | `ADR-{NNNN}-{slug}.md` + a `bun run adr:next` number pre-allocator | `.context/ADR/README.md` · `agentic-qa-core/references/adr-doctrine.md` |
| 5 | Env identifiers | `local · qa · staging · production` (lowercase, no abbreviations) | `.agents/project.yaml` `environments` · CLAUDE.md §7 |
| 6 | Test module folders | `{domain-plural}/` kebab-case → `orders/`, `user-management/` | `test-automation/references/automation-standards.md` (tests/e2e, tests/integration) |
| 7 | Allure suite labels | derive from the Playwright tag (`@smoke`/`@regression`/…) — single source, no duplication | `regression-testing/SKILL.md` · `test-automation` (tags) |
| 8 | Test-execution folders | `test-executions/{EXEC-KEY}-{ts}/` → `PROJ-555-20260626T1430Z/` | CLAUDE.md §9 PBI tree · `scripts/sync-jira-issues.ts` |
| 9 | Nested defect files | mirror the Story layout: `bug.md` + `evidence/` + `related-tests/` | CLAUDE.md §9 · `scripts/sync-jira-issues.ts` |
| 10 | Data factory / types | `DataFactory.ts` · `types.ts` · `constants.ts` under `tests/data/` | `test-automation/references/kata-architecture.md` |
| 11 | Gherkin variables | `{snake_case}` → `{user_id}`, `{order_amount}` | `test-documentation/references/tms-conventions.md` (Gherkin) |
| 12 | Blocked-test marker | `@blocked:{BUG-KEY}` tag + `test.fail('Blocked by {BUG-KEY}')` | `test-automation/references/planning-playbook.md` · `regression-testing` (GO/NO-GO filter) |

## Suggested batching (when unblocked)

- **Easy / already-implicit** (ratify almost free): 5 (envs), 6 (module folders), 11 (Gherkin vars), 12 (blocked marker).
- **Data & mocks**: 1, 3, 10.
- **Execution & defect folders**: 8, 9 — touch the sync script + PBI tree (do alongside the ladder's items-over-fields work).
- **Infra / reporting**: 4 (ADR), 7 (Allure).

## Cross-dependency note

Gaps **8** and **9** (test-execution folders, nested defect files) overlap with the planning-ladder
work (Plans/Runs become Jira items; the sync script materializes their folders). Sequence them
**with** the ladder's `scripts/sync-jira-issues.ts` changes, not before.
