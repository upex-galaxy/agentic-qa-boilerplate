# Master Test Plan — placeholder

> **Run `/master-test-plan` (Claude Code command) to populate or refresh this file.**

This file is the canonical test-strategy layer — a business-derived, risk-ranked roadmap that answers: what to test in this application, and why does it matter?

- **Hard requirement for**: `sprint-testing`, `test-documentation`.
- **Soft input for**: `test-automation`, `regression-testing`.
- **Consumed by**: the `sprint-testing` and `test-automation` skills when planning exploratory sessions and automation scope.
- **Requires**: `.context/business/business-data-map.md` and `.context/business/business-feature-map.md` to be populated first.

The command replaces this placeholder with the full structure (Executive Risk Map, Per-flow Testing Rationale, State Machines, Silent Killers, External-Integration Failure Points, Dependency Cascades, Developer-Forgotten Edge Cases, Pre-release Checklist, Out-of-Scope section). Until then, keep this file checked in so both the AI and your team can see that it is the expected anchor.

See `.claude/commands/master-test-plan.md` for the exact output contract.
