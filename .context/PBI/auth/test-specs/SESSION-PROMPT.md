# Auth - Test Automation Session Prompt

> **Usage**: Copy the prompt below and paste it at the start of each new session with the AI working in your test automation repository.

---

## PROMPT (copy from here)

```
We are working on UI/API test automation for the Auth module. This is a structured project with tickets organized in a roadmap. Your role is to implement automated tests ticket by ticket.

## STEP 1: Read current progress

Read this file FIRST to know what has been done and what comes next:

.context/PBI/auth/test-specs/PROGRESS.md

## STEP 2: Load the necessary context

### Always (base context):
1. `CLAUDE.md` (repo root) → Project config, stack, commands, MCPs
2. `.context/PBI/auth/test-specs/ROADMAP.md` → Full roadmap with dependencies
3. The current ticket spec: `.context/PBI/auth/test-specs/{AUTH}-T{XX}-{name}/spec.md`

### To understand the module:
4. `.context/PBI/auth/auth-test-plan.md` → Master document with endpoints, selectors, data strategy

## STEP 3: Work on the ticket

Each ticket's `spec.md` has TCs in Gherkin format. Work in order per the roadmap.

## STEP 4: Update progress

When done, UPDATE the PROGRESS.md file with status changes, test file paths, and session log.
```
