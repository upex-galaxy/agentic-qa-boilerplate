# Evals — test-documentation

**Run date**: 2026-04-14
**Run method**: manual fresh-agent (reasoned activation analysis; no Agent/Task tool was available in this context to dispatch real fresh sub-agents, and `skill-creator` does not expose a "run trigger-evals for arbitrary skill" entry point. Each eval prompt was evaluated against the current `description:` field of `test-documentation` and the descriptions of the competing skills — `sprint-testing`, `test-automation`, `regression-testing`, `project-discovery`, `playwright-cli`, `xray-cli` — to infer which skill a fresh agent would route to.)
**Total**: 6 evals | **Passed**: 6 | **Failed**: 0

## Results

| # | Name | Category | Pass | Observed activation | Notes |
|---|---|---|---|---|---|
| 1 | should-trigger-roi-analysis | positive | PASS | test-documentation | Prompt contains "ROI framework" and "which ones should be automated" — direct hits on triggers "ROI analysis", "prioritize for automation", "which tests to automate", "Candidate vs Manual". |
| 2 | should-trigger-create-tcs-in-jira | positive | PASS | test-documentation | Prompt says "Create the test cases in Jira ... Use Gherkin" — direct hit on triggers "create test cases in Jira/Xray" and "document tests". Gherkin/Cucumber is Stage 4 territory. |
| 3 | should-trigger-fix-traceability | positive | PASS | test-documentation | Prompt mentions "traceability links between the ATP and the TCs are broken. Fix them." — direct hit on "link ATP to ATR", "fix TMS traceability", and the description's "repairing broken TMS links" phrase. |
| 4 | should-not-trigger-manual-exploration | negative | PASS | sprint-testing | "Manually test the login flow in staging" is in-sprint manual QA execution (Stages 1–3), which is sprint-testing's core domain. test-documentation explicitly requires "already validated" tests as a hard prerequisite, and its description does not list "manually test" or "execute" as triggers. |
| 5 | should-not-trigger-writing-test-code | negative | PASS | test-automation | "Write the automated test code" matches test-automation's description verbatim ("writing E2E or API/integration tests"). test-documentation's description explicitly excludes this: "Do NOT use for writing test code (test-automation)". |
| 6 | should-not-trigger-commit-conventions | negative | PASS | none (answered from CLAUDE.md) | Generic VCS convention question — no overlap with TMS, Jira, Xray, ROI, ATP/ATR/TC, or traceability vocabulary. No skill trigger; CLAUDE.md "Git Workflow" section covers it. |

## Suggested fixes (only for failures)

All passed — no changes needed.
