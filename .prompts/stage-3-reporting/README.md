# Stage 3: Reporting

> **Purpose**: Complete the ATR (Test Report) and report any bugs found.
> **When**: All Test Cases have been executed in Stage 2.
> **Prerequisite**: Complete Stage 2 (Execution) first.

---

## Overview

Stage 3 finalizes the testing cycle by:
1. Filling the ATR Test Report
2. Reporting any bugs found during execution
3. Summarizing all test results
4. Adding a comment to the User Story
5. Transitioning the ticket to "Tested" status

---

## Prompts in This Stage

| Prompt | Purpose |
|--------|---------|
| `test-report.md` | Fill ATR, summarize results, complete workflow |
| `bug-report.md` | Document and report bugs found during testing |

---

## Artifacts Updated

| Artifact | Location | Description |
|----------|----------|-------------|
| ATR (TMS) | Test Results in TMS | Test Report filled, marked Complete |
| Bug (TMS) | Backlog in TMS | Bug reports (if any) |
| US Comment | User Story in TMS | Summary of QA results |
| test-report.md | `.context/PBI/{module-name}/TK-{number}-{brief-title}/` | Local mirror of ATR |

---

## Workflow Status Impact

This stage does NOT directly transition TC Workflow Status.

TCs should already have Test Status (PASSED/FAILED) from Stage 2.

The next stage (Stage 4: Documentation) will transition TCs to **Candidate** or **Manual**.

---

## Entry Criteria

- [ ] Stage 2 completed
- [ ] All TCs have final status (PASSED or FAILED)
- [ ] Evidence captured in `evidence/` folder

---

## Exit Criteria

- [ ] ATR Test Report filled
- [ ] ATR marked as Complete
- [ ] Bugs reported (if any FAILED TCs)
- [ ] Summary comment added to User Story
- [ ] Local `test-report.md` finalized
- [ ] Ticket ready for "Tested" transition

---

## Next Stage

After completing Stage 3:

**If ALL TCs PASSED:**
- Ticket transitions to "Tested" status
- Consider Stage 4 (Documentation) to prioritize TCs for automation

**If ANY TCs FAILED:**
- Wait for bug fixes
- Re-test failed TCs (Stage 2)
- Update ATR after re-test
- Repeat Stage 3 when all pass

---

**Related**: [Session Start](../session-start.md) | [Stage 2 - Execution](../stage-2-execution/) | [Stage 4 - Documentation](../stage-4-documentation/) | [QA Workflow](../us-qa-workflow.md)
