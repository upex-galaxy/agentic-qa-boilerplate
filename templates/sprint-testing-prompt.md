# Sprint Testing Prompt Template

> This is a **copy-paste template**, NOT a terminal prompt.
> Do NOT load with `@`. Copy the content between the markers, edit the NOTES section, and paste into your chat session.

--- START COPY ---

Context: Load the sprint testing backlog and continue with testing.

EXECUTION INSTRUCTIONS:

For each ticket in the queue, determine the type and execute the complete workflow:

  If Feature / Product Roadmap / UX-UI / Task:
    1. Read and execute @.prompts/session-start.md (initialize session, create PBI)
    2. Read and execute @.prompts/stage-1-planning/acceptance-test-plan.md (triage, create ATP/ATR/TCs)
    3. Read and execute @.prompts/stage-2-execution/exploratory-testing.md (exploratory testing)
    4. Read and execute @.prompts/stage-3-reporting/test-report.md (report results)

  If Bug:
    1. Read and execute @.prompts/session-start.md (initialize session, create PBI)
    2. Read and execute @.prompts/bug-qa-workflow.md (complete bug workflow)

CRITICAL RULE - Stage 2 is NOT optional:
  Stage 2 (exploratory-testing.md) is where real testing happens: what-ifs, edge cases,
  boundary values, data variations, user perspectives. Do NOT skip this stage.
  The TCs from Stage 1 are the MINIMUM, not the total. Stage 2 discovers what is missing.

BETWEEN STAGES:
  Do not stop to ask for confirmation to advance between stages.
  Only pause if: you find a bug or minor issue, a suspicious observation, you need a decision from me, or something fails.

AFTER COMPLETING EACH TICKET:
  - Update the sprint testing document with the result.
  - Leave a mini summary in the chat: ticket, result, observations if any, artifacts, and list of remaining tickets.
  - Wait for my OK to continue with the next ticket.

IF A TOOL FAILS (MCP, playwright-cli, [TMS_CLI]):
  Stop immediately and inform me. Do not attempt workarounds without my approval.

SESSION NOTES:
  {{Replace this entire block with your session context. Example format below:}}

  [TICKET-001] -- Summary

  Ticket: [TICKET-001] - [Ticket Title]
  Result: [PASSED/FAILED] ([N/N] TCs)
  Artifacts: ATP-XX, ATR-XX, TC-XXX, TC-XXX

  What was tested:
  [Brief description of what was verified]

  Verifications:
  - [Verification point 1]
  - [Verification point 2]
  - [DB cross-validation if applicable]

  Observations (non-blocking):
  1. [Observation 1]
  2. [Observation 2]

  ---
  Remaining tickets:

  | # | Ticket       | Type            | Title                        | Status  |
  |---|--------------|-----------------|------------------------------|---------|
  | 1 | [TICKET-002] | [Feature/Bug]   | [Title]                      | PENDING |
  | 2 | [TICKET-003] | [Feature/Bug]   | [Title]                      | PENDING |
  | 3 | [TICKET-004] | [Bug]           | [Title]                      | PENDING |

  Next in queue: [TICKET-002] ([Title]).

COMPLETION CHECKLIST (PER TICKET):

  At the START of each ticket, create tasks from this checklist.
  Filter by type: unmarked items are common, [Feature] only for features, [Bug] only for bugs.
  At the END of each ticket, review this checklist as an exit gate.
  Do NOT report the ticket as complete if any applicable item is missing.

  SESSION START:
    [ ] Ticket fetched from TMS ([TMS_CLI] or Jira MCP)
    [ ] Comments fetched (if available)
    [ ] Story explained to user
    [ ] User confirmation received
    [ ] Project context loaded (business-data-map, api-architecture)
    [ ] Module context verified (exists or created)
    [ ] Code explored (backend + frontend as applicable)
    [ ] PBI folder created (.context/PBI/{module}/[TICKET-ID]-{title}/)
    [ ] context.md created with ACs, team discussion, related code

  PLANNING:
    [ ] Triage completed (veto or risk score)
    [ ] Test data discovered via DB queries
    [ ] ATP created and linked to Story ([TMS_CLI] or TMS)
    [ ] ATR created and linked to Story ([TMS_CLI] or TMS)
    [ ] ATP linked to ATR ([TMS_CLI] or TMS)
    [Feature] Test Analysis filled in ATP
    [Feature] AC Gaps documented in ticket
    [Feature] TCs created with full traceability (--story + --test-plan + --test-result)
    [Feature] Traceability verified ([TMS_CLI] or TMS)
    [Bug] Bug Analysis filled in ATP
    [ ] ATP marked complete
    [Feature] TCs transitioned to Ready

  EXECUTION:
    [ ] Playwright config pointing to evidence/ (if UI test)
    [Feature] All TCs executed (none in NOT RUN)
    [Feature] TCs marked PASSED or FAILED in TMS
    [Feature] Edge cases explored (what-ifs, boundaries, data variations)
    [Bug] Fix verified against original bug ACs
    [Bug] Regression check on adjacent areas
    [ ] DB cross-validation performed (if applicable)
    [ ] Bugs documented (if found)
    [ ] Evidence saved (screenshots or API responses in evidence/)

  REPORTING:
    [ ] ATR report filled ([TMS_CLI] or TMS)
    [ ] ATR marked complete
    [ ] test-report.md created in PBI (local mirror of ATR)
    [ ] QA comment prepared for ticket
    [ ] Evidence paths mentioned to user for attachment
    [Bug] Automation assessment included in ATR (candidate for regression test?)
    [ ] Ticket transitioned to tested status ([TMS_CLI] or TMS)
    [ ] Sprint testing doc updated
    [ ] Final summary presented to user in chat

--- END COPY ---
