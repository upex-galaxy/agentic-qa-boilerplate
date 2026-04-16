# Evals — sprint-testing

**Run date**: 2026-04-14
**Run method**: manual fresh-agent (analytical trigger evaluation against SKILL.md description fields of sprint-testing and sibling skills: test-automation, test-documentation, regression-testing)
**Total**: 6 evals | **Passed**: 6 | **Failed**: 0

## Methodology

The Agent/Task sub-agent dispatch tool was not available in this harness, and `skill-creator` focuses on its own iteration workflow rather than running trigger evals for an arbitrary target skill. As a fallback, each eval prompt was matched verbatim against the `description:` fields (triggers and explicit exclusions) of every competing skill in `.claude/skills/`. A prompt is counted as ACTIVATED for `sprint-testing` when its lexical triggers align with sprint-testing's description and no sibling skill's description claims the prompt more strongly. Negative evals are counted as correctly routed when a sibling skill's triggers dominate and sprint-testing's description explicitly hands off the scope.

## Results

| # | Name | Category | Pass | Observed activation | Notes |
|---|---|---|---|---|---|
| 1 | should-trigger-single-user-story | positive | Pass | sprint-testing | Prompt "Test the user story UPEX-277" matches sprint-testing triggers "test this ticket" and "QA this user story". No sibling claims user-story testing. |
| 2 | should-trigger-bug-verification | positive | Pass | sprint-testing | Prompt "retest bug PROJ-445 ... dev says it's fixed" matches triggers "retest this bug" and "verify bug fix". regression-testing description explicitly excludes "manual fix verification (that belongs to sprint-testing)". |
| 3 | should-trigger-batch-sprint | positive | Pass | sprint-testing | Prompt "Run QA on this sprint ... Generate the framework" matches triggers "process the sprint" and "generate the SPRINT-N-TESTING framework". No sibling owns batch-sprint orchestration. |
| 4 | should-not-trigger-automation | negative | Pass | test-automation | "Automate the test cases ... Write the Playwright E2E test" matches test-automation triggers "automate test", "create E2E test", "Playwright"; sprint-testing description excludes "Stage 5 automation coding (test-automation)". |
| 5 | should-not-trigger-tms-documentation | negative | Pass | test-documentation | "Document these test cases in Xray ... calculate ROI" matches test-documentation triggers "document tests", "create test cases in Jira/Xray", "ROI analysis"; sprint-testing excludes "Stage 4 TMS documentation + ROI". |
| 6 | should-not-trigger-regression-suite | negative | Pass | regression-testing | "Run the regression suite ... GO/NO-GO" matches regression-testing triggers "run regression", "GO/NO-GO decision", "release readiness"; sprint-testing excludes "Stage 6 regression suite execution". |

## Suggested fixes (only for failures)

All passed — no changes needed.
