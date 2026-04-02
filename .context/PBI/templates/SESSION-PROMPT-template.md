# {Module Name} - Test Automation Session Prompt

> **Usage**: Copy the prompt below and paste it at the start of each new session with the AI working in your test automation repository. The prompt is self-contained and reusable across sessions.

---

## PROMPT (copy from here)

```
We are working on UI/API test automation for the {Module Name} module. This is a structured project with tickets organized in a roadmap. Your role is to implement automated tests ticket by ticket.

## STEP 1: Read current progress

Read this file FIRST to know what has been done and what comes next:

.context/PBI/{module-name}/test-specs/PROGRESS.md

This file tells you:
- Which ticket is in progress or is next
- Which test cases are already automated
- What test data has been discovered
- What shared components already exist
- Decisions and learnings from previous sessions

## STEP 2: Load the necessary context

Based on the ticket you will work on, load these files in this order:

### Always (base context):
1. `CLAUDE.md` (repo root) → Project config, stack, commands, MCPs
2. `.context/PBI/{module-name}/test-specs/ROADMAP.md` → Full roadmap with dependencies
3. The current ticket spec: `.context/PBI/{module-name}/test-specs/{MODULE}-T{XX}-{name}/spec.md`

### To understand the module:
4. `.context/PBI/{module-name}/{module-name}-test-plan.md` → Master document with:
   - Page architecture (states, layout)
   - All API endpoints consumed
   - Business logic and calculations
   - CSS selectors / locators reference
   - Test data strategy

### To understand the business (only if you need more context):
5. `.context/business-data-map.md` → Business flows and data entities
6. `.context/api-architecture.md` → API catalog and auth

### To understand the codebase (only if you need to explore code):
7. The target application's frontend and backend code paths
   (documented in the module context file)

## STEP 3: Work on the ticket

Each ticket's `spec.md` has:
- Summary (what and why)
- Preconditions (what test data you need)
- Test Cases in Gherkin format (scenarios to automate)
- Acceptance Criteria (checklist to consider the ticket done)

Work in order per the roadmap (Phase 1 → 2 → 3 → ...). Within each phase, follow ticket order. Do not skip tickets unless there is a documented blocker.

## STEP 4: Update progress

When done working (or before closing the session), UPDATE the PROGRESS.md file:

1. Change the ticket status (not-started → in-progress → done)
2. Record the test file path created
3. Update TC automation counts
4. If you discovered useful test data, record it in "Test Data Discovered"
5. If you created shared components (page objects, fixtures), record them
6. If you made an important decision or found a workaround, record it
7. Add a session entry in the Session Log with date and summary
8. Update "Current Status" in the header

This is CRITICAL so the next session can continue without losing context.

## GENERAL RULES

- Work ONE ticket at a time. Finish or mark as blocked before moving to the next.
- If a ticket requires test data that doesn't exist, document the blocker in PROGRESS.md and move to the next ticket you can work on.
- If you create reusable page objects, fixtures, or helpers, document them to avoid duplication.
- The Gherkin scenarios in the tickets are the specification. Do not add or remove test cases without consulting me.
```

---

## NOTES FOR THE USER

### How to use this prompt

1. Open a new AI session in your test automation repository
2. Copy the content of the PROMPT block above
3. Paste it as your first message
4. Optionally, add additional instructions like:
   - "Start with {MODULE}-T01"
   - "Continue where you left off"
   - "There is a blocker on T02, skip to T03"
   - "I only need you to investigate test data for T04"

### What to add based on your needs

If you want the AI to follow specific automation guidelines, add after the prompt:

```
Additionally, for implementation follow these guidelines:
- Read: .context/guidelines/TAE/kata-ai-index.md
- Read: .context/guidelines/TAE/automation-standards.md
- Read: .context/guidelines/TAE/typescript-patterns.md
```

### Expected workflow

```
Session 1: "Start with {MODULE}-T01"
  → AI reads PROGRESS.md (all not-started)
  → Reads context + ticket T01 spec.md
  → Implements tests
  → Updates PROGRESS.md

Session 2: (paste prompt)
  → AI reads PROGRESS.md (T01 done, T02 not-started)
  → "Continue where you left off"
  → Reads context + ticket T02 spec.md
  → Implements tests
  → Updates PROGRESS.md

Session N: (paste prompt)
  → AI reads PROGRESS.md (knows full history)
  → Picks up next ticket automatically
  → ...
```
