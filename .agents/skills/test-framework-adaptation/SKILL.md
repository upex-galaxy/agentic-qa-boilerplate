---
name: test-framework-adaptation
description: "Adapt this boilerplate's KATA architecture, auth, variables, fixtures, CI and MCPs to a project that project-discovery already mapped. Use when adapting the framework or KATA to a stack; wiring fixtures, auth or the env schema; or re-checking how generic the repo still is. Plans first, writes after approval."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [testing-e2e, testing-api, ci-cd, meta-skill]
metadata:
  kind: workflow
---

# Test Framework Adaptation

This skill turns the example project the boilerplate ships into the user's project: identity, variables, auth, OpenAPI facades, the first entity, CI and MCP files. It has one mode, `adapt`. Forward `$ARGUMENTS` unchanged and load `references/adaptation-workflow.md`, which owns the whole idempotent Phase 0-9 workflow.

## Compact Rules

- Phases 0-2 are analysis and planning only. Phase 3 starts after explicit approval of `.context/reports/test-framework-adaptation-plan.md`; the reference says who approves when no person is present.
- Run the genericness scan every time. A repo that is already adapted gets a report and no new work.
- Stop at a missing credential or MCP value and name the variable. A secret value is typed by the user, never through the chat.
- Run the verification gate in its order and stop at the first failure.
