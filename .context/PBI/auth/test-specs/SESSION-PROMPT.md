# Auth - Session Initialization

> **What this is**: Load this file via `@` at the start of each AI session to resume module automation work.
> **For full orchestration** (planning + coding + review pipeline): use `@.prompts/orchestrators/test-automation-agent.md` instead.

---

## Context

- **Module**: Auth
- **Module path**: `.context/PBI/auth/`
- **Ticket prefix**: AUTH

## Instructions

You are resuming test automation work for the **Auth** module. Follow these steps in order.

### 1. Read progress state

Read `.context/PBI/auth/test-specs/PROGRESS.md` first. It tells you:
- Which ticket is in progress or next
- Which test cases are already automated
- Shared components that exist
- Decisions and learnings from previous sessions

### 2. Load context for the current ticket

Based on what PROGRESS.md says, load these files:

**Always**:
1. `.context/PBI/auth/test-specs/ROADMAP.md` -- full roadmap with dependencies
2. The current ticket spec: `.context/PBI/auth/test-specs/AUTH-T{XX}-{name}/spec.md`

**If you need module context**:
3. `.context/PBI/auth/auth-test-plan.md` -- endpoints, selectors, data strategy

**If you need business context**:
4. `.context/business-data-map.md`
5. `.context/api-architecture.md`

### 3. Work on the ticket

Each ticket's `spec.md` contains TCs in Gherkin format and acceptance criteria. Work in roadmap order (Phase 1 -> 2 -> 3). Do not skip tickets unless there is a documented blocker.

Work ONE ticket at a time. Finish or mark as blocked before moving to the next.

### 4. Update progress

Before closing the session, UPDATE PROGRESS.md:
- Change ticket status (not-started -> in-progress -> done)
- Record test file paths created
- Update TC automation counts
- Log any discovered test data, shared components, or decisions
- Add a session entry with date and summary
