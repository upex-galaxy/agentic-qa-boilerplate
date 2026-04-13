# Test Automation Agent - Orchestrator Prompt

> **Purpose**: Orchestrate the Stage 5 automation workflow (Planning, Coding, Review) for a module's test specs.
> **When to use**: After test specs exist in `.context/PBI/{module}/test-specs/` and you want to automate them.
> This template uses `{{VARIABLE}}` references defined in `CLAUDE.md` -> Project Variables.
> All `{{...}}` tokens are substituted lazily at load time from the Project Variables table.

---

## ORCHESTRATOR RULES

1. You NEVER write test code yourself. You ALWAYS delegate to sub-agents via the Agent tool.
2. Sub-agents run SEQUENTIALLY (one at a time). Wait for completion before dispatching the next.
3. After each sub-agent completes, read the updated PROGRESS.md to stay informed.
4. Present results to the user at defined interaction points (see flow below).
5. If a sub-agent reports a TOOL FAILURE, STOP immediately and inform the user. Do not dispatch the next sub-agent.
6. If a sub-agent reports TESTS FAILING, PAUSE, present the failure details to the user, and wait for their decision before continuing.

---

## PARAMETERS

Ask for these if not provided:

| Parameter | Required | Description |
|-----------|----------|-------------|
| **module** | Yes | Module name (e.g., `auth`, `billing`). Maps to `.context/PBI/{module}/` |
| **ticket-id** | No | Specific ticket to work on (e.g., `AUTH-T01`). If omitted, auto-detect from PROGRESS.md |
| **type** | No | `e2e` or `api`. If omitted, determine from the ticket's spec.md content |

---

## FLOW OVERVIEW

```
ORCHESTRATOR                            SUB-AGENTS
    |
    |-- STEP 0: Validate prerequisites
    |   (ROADMAP.md + PROGRESS.md exist)
    |
    |-- STEP 1: Detect next ticket
    |   Read PROGRESS.md -> find first non-done ticket
    |   Read ticket spec.md -> determine test type
    |   REPORT to user -> WAIT for confirmation
    |
    |-- Dispatch Sub-agent 1 ----------> PLANNING
    |   (wait for completion)            Reads: spec.md, existing code
    |                                    Produces: implementation-plan.md
    |
    |-- Read implementation-plan.md
    |-- REPORT plan summary -> WAIT for user approval
    |
    |-- Dispatch Sub-agent 2 ----------> CODING
    |   (wait for completion)            Reads: implementation-plan.md
    |                                    Produces: component, test file, fixture updates
    |                                    Runs tests locally
    |
    |-- REPORT coding results to user
    |
    |-- Dispatch Sub-agent 3 ----------> REVIEW
    |   (wait for completion)            Reads: code from coding phase
    |                                    Produces: issue report + verdict
    |
    |-- If NEEDS REVISION -> loop back to Sub-agent 2 with fix list
    |-- If APPROVED -> proceed
    |
    |-- STEP 5: Update PROGRESS.md
    |-- STEP 6: Ask user -> next ticket or finish
    |
```

---

## STEP 0: VALIDATE PREREQUISITES

Before anything else, verify the module is set up for automation:

1. **Check ROADMAP exists**: `.context/PBI/{module}/test-specs/ROADMAP.md`
   - If missing: STOP. Tell the user: "No ROADMAP.md found for module `{module}`. Run the module-test-specification prompt first: `.prompts/stage-5-automation/planning/module-test-specification.md`"

2. **Check PROGRESS exists**: `.context/PBI/{module}/test-specs/PROGRESS.md`
   - If missing: STOP. Same guidance as above.

3. **Read both files** to understand the full scope and current state.

4. **Verify at least one ticket is not done**:
   - Scan PROGRESS.md for tickets where Status != `done`
   - If all tickets are `done`: inform the user that the module is fully automated.

---

## STEP 1: AUTO-DETECT NEXT TICKET

### If user provided a ticket-id:

1. Locate the ticket spec at `.context/PBI/{module}/test-specs/{ticket-id}-*/spec.md`
2. Read the spec.md
3. Verify the ticket exists in PROGRESS.md

### If no ticket-id provided:

1. Read PROGRESS.md
2. Scan ticket rows across all phases, in phase order (Phase 1 first)
3. Find the first ticket where Status is NOT `done`
4. Check dependencies in ROADMAP.md: if the ticket depends on another that is not `done`, skip it and pick the next eligible ticket
5. Read the ticket's spec.md

### Determine test type:

If the user did not specify `type`, infer it from the spec.md:

| Spec content indicator | Type |
|------------------------|------|
| Mentions UI actions, page navigation, form interactions, locators | `e2e` |
| Mentions API endpoints, HTTP methods, request/response payloads | `api` |
| Contains both UI and API test cases | `hybrid` (treat as `e2e` with API preconditions) |

### Report to user and WAIT:

```
MODULE: {module}
TICKET: {ticket-id} - {title}
TYPE: {e2e / api / hybrid}
ITEMS: {N} TCs + {N} Test Scenarios
DEPENDENCIES: {list or "None"}
PHASE: {phase number and name}

Spec summary:
{2-3 sentence summary of what this ticket covers}

Ready to start planning. Confirm?
```

**WAIT for user confirmation before proceeding.**

---

## STEP 2: PLANNING PHASE (Dispatch Sub-agent 1)

```
ROLE: You are a QA sub-agent executing PLANNING (Phase 1 of 3) for ticket {ticket-id}.

INSTRUCTIONS FILE: Read and execute the instructions in:
  .prompts/stage-5-automation/planning/test-implementation-plan.md

CONTEXT FILES TO READ (in this order):
  1. .context/PBI/{module}/test-specs/{ticket-dir}/spec.md — the test specification
  2. .context/PBI/{module}/test-specs/ROADMAP.md — overall module plan
  3. .context/guidelines/TAE/kata-ai-index.md — KATA quick orientation
  4. .context/guidelines/TAE/automation-standards.md — ATC rules and patterns
  5. .context/guidelines/TAE/test-design-principles.md — TC identity, naming

CONDITIONAL READS (based on test type):
  - If API: tests/components/api/ApiBase.ts, tests/components/ApiFixture.ts, api/openapi-types.ts
  - If E2E: tests/components/ui/UiBase.ts, tests/components/UiFixture.ts
  - Always: tests/components/TestContext.ts, tests/data/types.ts, tests/data/DataFactory.ts

ALSO SCAN FOR EXISTING CODE:
  - List files in tests/components/api/ and tests/components/ui/ to find reusable components
  - List files in tests/components/steps/ for existing step chains
  - Check tests/e2e/ and tests/integration/ for existing test files in this domain

TICKET: {ticket-id} — {ticket title}
MODULE: {module}
TYPE: {e2e / api / hybrid}
SPEC PATH: .context/PBI/{module}/test-specs/{ticket-dir}/spec.md

TASK:
Execute Phase 1 Planning as defined in the instructions file:
  1. Read and understand the spec.md completely
  2. Identify which ATCs need to be created vs which already exist
  3. Determine test data strategy (Discover / Modify / Generate)
  4. Map each TC from spec.md to a KATA ATC method
  5. Define the file structure: component file, test file, fixture updates
  6. Document architecture decisions (fixture type, data strategy, shared components)
  7. Produce implementation-plan.md in the ticket directory

OUTPUT FILE: .context/PBI/{module}/test-specs/{ticket-dir}/implementation-plan.md

REPORT BACK: Return a structured summary:
  - Status: COMPLETED or BLOCKED (with reason)
  - Plan path: {full path to implementation-plan.md}
  - ATCs to create: {list with method names}
  - ATCs to reuse: {list or "none"}
  - Files to create/modify: {list}
  - Data strategy: {summary}
  - Fixture type: {api / ui / test}
  - Estimated complexity: {low / medium / high}
```

### After Sub-agent 1 completes:

1. Read the produced `implementation-plan.md`
2. Present a summary to the user:

```
PLANNING COMPLETE for {ticket-id}

ATCs to implement:
{list each ATC with method name and brief description}

Files to create:
  - Component: {path}
  - Test file: {path}
  - Fixture updates: {path}

Data strategy: {summary}
Fixture type: {api / ui / test}

Approve this plan to proceed to coding? (You can also request changes.)
```

**WAIT for user approval before proceeding to coding.**

---

## STEP 3: CODING PHASE (Dispatch Sub-agent 2)

Choose the prompt based on test type:

| Type | Prompt |
|------|--------|
| `api` | `.prompts/stage-5-automation/coding/integration-test-coding.md` |
| `e2e` | `.prompts/stage-5-automation/coding/e2e-test-coding.md` |
| `hybrid` | `.prompts/stage-5-automation/coding/e2e-test-coding.md` (with API precondition setup) |

```
ROLE: You are a QA sub-agent executing CODING (Phase 2 of 3) for ticket {ticket-id}.

INSTRUCTIONS FILE: Read and execute the instructions in:
  {selected coding prompt path}

CONTEXT FILES TO READ (in this order):
  1. .context/PBI/{module}/test-specs/{ticket-dir}/implementation-plan.md — your blueprint
  2. .context/PBI/{module}/test-specs/{ticket-dir}/spec.md — the test specification
  3. .context/guidelines/TAE/kata-ai-index.md — KATA quick orientation
  4. .context/guidelines/TAE/automation-standards.md — ATC rules and patterns
  5. .context/guidelines/TAE/test-design-principles.md — TC identity, naming

TYPE-SPECIFIC CONTEXT:
  - If API: .context/guidelines/TAE/api-testing-patterns.md
  - If E2E: .context/guidelines/TAE/e2e-testing-patterns.md

TYPE-SPECIFIC CODE TO READ:
  - If API: tests/components/api/ApiBase.ts (Layer 2), tests/components/ApiFixture.ts (Layer 4)
  - If E2E: tests/components/ui/UiBase.ts (Layer 2), tests/components/UiFixture.ts (Layer 4)
  - Always: tests/components/TestContext.ts (Layer 1), tests/components/TestFixture.ts (Layer 4)

REFERENCE COMPONENTS (read at least one for pattern):
  - If API: tests/components/api/AuthApi.ts (reference implementation)
  - If E2E: tests/components/ui/LoginPage.ts (reference implementation)

TICKET: {ticket-id} — {ticket title}
MODULE: {module}
TYPE: {e2e / api / hybrid}
PLAN PATH: .context/PBI/{module}/test-specs/{ticket-dir}/implementation-plan.md

TASK:
Execute Phase 2 Coding as defined in the instructions file:
  1. Read the implementation-plan.md — this is your blueprint
  2. Implement the KATA component (Layer 3) with all ATCs defined in the plan
  3. Create the test file that orchestrates the ATCs
  4. Register the component in the appropriate fixture (ApiFixture / UiFixture / TestFixture)
  5. Run the tests locally to verify they pass

CRITICAL RULES:
  - Login credentials: ALWAYS read from .env file. NEVER hardcode or guess passwords.
  - Follow KATA architecture strictly: ATCs are complete test cases, not single interactions
  - Locators inline within ATCs (E2E). No separate locator files.
  - Use import aliases (@api/, @ui/, @utils/, @schemas/, @data/). No relative imports.
  - Type everything: no `any` types
  - Fixed assertions inside ATCs, variable assertions in test files

TEST EXECUTION:
  After implementing, run the tests:
  - API tests: bun run test:integration --grep "{ticket-id}"
  - E2E tests: bun run test:e2e --grep "{ticket-id}"
  Report pass/fail results.

REPORT BACK: Return a structured summary:
  - Status: COMPLETED or BLOCKED (with reason)
  - Files created: {list with full paths}
  - Files modified: {list with full paths}
  - Test results: {X/Y passing, list any failures with details}
  - Component: {component name and file path}
  - ATCs implemented: {list with method names}
  - Notes: {any deviations from plan, decisions made during implementation}
```

### After Sub-agent 2 completes:

1. Read the sub-agent's report
2. Present to user:

```
CODING COMPLETE for {ticket-id}

Files created:
{list each file with path}

Files modified:
{list each file with path}

Test results: {X/Y passing}
{If failures: list each failure with brief description}

Proceeding to code review.
```

If tests are FAILING, ask user: "Tests have failures. Proceed to review anyway, or fix first?"

---

## STEP 4: REVIEW PHASE (Dispatch Sub-agent 3)

Choose the prompt based on test type:

| Type | Prompt |
|------|--------|
| `api` | `.prompts/stage-5-automation/review/integration-test-review.md` |
| `e2e` | `.prompts/stage-5-automation/review/e2e-test-review.md` |
| `hybrid` | `.prompts/stage-5-automation/review/e2e-test-review.md` |

```
ROLE: You are a QA sub-agent executing REVIEW (Phase 3 of 3) for ticket {ticket-id}.

INSTRUCTIONS FILE: Read and execute the instructions in:
  {selected review prompt path}

CONTEXT FILES TO READ:
  1. .context/guidelines/TAE/kata-ai-index.md — KATA quick orientation
  2. .context/guidelines/TAE/automation-standards.md — rules and anti-patterns
  3. .context/guidelines/TAE/test-design-principles.md — ATCs vs helpers, naming
  4. .context/PBI/{module}/test-specs/{ticket-dir}/implementation-plan.md — original plan

CODE TO REVIEW:
  {list all files created and modified in the coding phase, with full paths}

TICKET: {ticket-id} — {ticket title}
MODULE: {module}
TYPE: {e2e / api / hybrid}

TASK:
Execute Phase 3 Review as defined in the instructions file:
  1. Gather all code produced in the coding phase
  2. Run the full KATA compliance checklist (component structure, ATC quality)
  3. Run the code quality checklist (TypeScript, imports, methods)
  4. Run the test file review (structure, independence, data)
  5. Run the fixture registration review
  6. Produce a verdict: APPROVED or NEEDS REVISION

VERDICT CRITERIA:
  - APPROVED: No CRITICAL issues. MINOR issues noted but acceptable.
  - NEEDS REVISION: Any CRITICAL issue found. List exact fixes needed.

SEVERITY LEVELS:
  - CRITICAL: Violates KATA principles, broken tests, security issue (hardcoded secrets)
  - MAJOR: Significant quality issue but tests work (poor naming, missing assertions)
  - MINOR: Style issue, improvement opportunity (JSDoc missing, import order)

REPORT BACK: Return a structured summary:
  - Verdict: APPROVED or NEEDS REVISION
  - Critical issues: {count and list, or "none"}
  - Major issues: {count and list, or "none"}
  - Minor issues: {count and list, or "none"}
  - KATA compliance: {X/Y checks passed}
  - Code quality: {X/Y checks passed}
  - Test quality: {X/Y checks passed}
  - Fix list (if NEEDS REVISION): {numbered list of exact changes needed}
```

### After Sub-agent 3 completes:

**If verdict is APPROVED:**

```
REVIEW PASSED for {ticket-id}

KATA compliance: {X/Y}
Code quality: {X/Y}
Test quality: {X/Y}

{List any minor/major issues noted for reference}

Proceeding to update progress.
```

**If verdict is NEEDS REVISION:**

```
REVIEW REQUIRES CHANGES for {ticket-id}

Critical issues found:
{numbered list of critical issues}

{Also list major issues if any}

Fix list:
{numbered list of exact changes needed}

Sending back to coding phase for fixes.
```

Then re-dispatch Sub-agent 2 (CODING) with additional instructions:

```
ADDITIONAL CONTEXT: This is a REVISION pass. The review phase found issues that must be fixed.

FIX LIST:
{insert the numbered fix list from the review verdict}

Read the existing code, apply ONLY the fixes listed above, and re-run tests.
Do NOT rewrite code that was not flagged. Minimal, targeted changes only.
```

After the revision coding sub-agent completes, re-dispatch Sub-agent 3 (REVIEW) again.

**Maximum revision loops: 2.** If still not approved after 2 revision rounds, present all remaining issues to the user and ask for guidance.

---

## STEP 5: UPDATE PROGRESS

After the review is APPROVED:

1. **Update PROGRESS.md** at `.context/PBI/{module}/test-specs/PROGRESS.md`:
   - Change the ticket's Status from its current value to `done`
   - Fill in the Test File path
   - Update the Done count (e.g., `4/4`)
   - Add implementation notes
   - Update the **Current Status** section (Current Ticket, counts)
   - Add an entry to the **Session Log** table
   - Add any new shared components to **Shared Components Created**

2. **Update ROADMAP.md** progress tracker:
   - Mark the ticket's progress: check the appropriate status box

3. **Update TMS status** (if connected):
   ```
   [TMS_TOOL] Update Test Status:
     - test: {ticket-id}
     - status: Automated
   ```

4. **Report to user:**

```
TICKET COMPLETED: {ticket-id} - {title}

Files created:
{list all files with paths}

Test results: {X/Y passing}
PROGRESS.md: Updated ({N}/{total} tickets done for module {module})

{If TMS updated: "TMS status updated to Automated"}
```

---

## STEP 6: NEXT TICKET OR FINISH

After Step 5, check PROGRESS.md for remaining work:

**If more tickets remain:**

```
Module progress: {completed}/{total} tickets done

Next eligible ticket: {ticket-id} - {title}
  Type: {e2e / api}
  Priority: {P0/P1/P2}
  Phase: {phase name}
  Dependencies: {met / list unmet}

Continue with {ticket-id}? Or finish for now?
```

**WAIT for user response.** If they confirm, loop back to STEP 1 with the next ticket.

**If all tickets are done:**

```
MODULE COMPLETE: {module}

All {total} tickets automated:
{table of all tickets with status, test file path, TC count}

Total TCs automated: {count}
Total Test Scenarios automated: {count}
Shared components created: {list}

Module {module} is fully covered. No remaining work.
```

---

## INTERRUPTED SESSION RECOVERY

If PROGRESS.md shows a ticket with status `in-progress`:

1. Read the ticket directory for existing artifacts:
   - `spec.md` — always exists
   - `implementation-plan.md` — exists if planning was completed
   - Check if test files already exist in `tests/`

2. Determine where to resume:

| Has plan? | Has test code? | Resume from |
|-----------|---------------|-------------|
| No | No | STEP 2 (Planning) |
| Yes | No | STEP 3 (Coding) |
| Yes | Yes | STEP 4 (Review) |

3. Inform the user:

```
INTERRUPTED SESSION DETECTED for {ticket-id}

Last state: {planning complete / coding complete / in review}
Resuming from: {Step N - Phase name}

Continue? (Or restart from planning?)
```

**WAIT for user confirmation.**

---

## IF A TOOL FAILS

If any sub-agent reports a tool failure (MCP, Playwright, test runner, file system):
- STOP immediately
- Show the error to the user
- Do NOT dispatch the next sub-agent
- Wait for user instructions on how to proceed

---

## QUALITY GATES

These gates must pass before moving to the next step:

| Gate | Between | Criteria |
|------|---------|----------|
| G1: Plan exists | Step 2 -> Step 3 | `implementation-plan.md` created with ATCs defined |
| G2: Tests pass | Step 3 -> Step 4 | All tests passing locally (or user explicitly overrides) |
| G3: Review approved | Step 4 -> Step 5 | Verdict is APPROVED (or max revision loops reached with user OK) |
| G4: Progress updated | Step 5 -> Step 6 | PROGRESS.md reflects the completed ticket |
