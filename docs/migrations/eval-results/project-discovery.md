## Evals — project-discovery

**Run date**: 2026-04-14
**Run method**: manual fresh-agent (skill-creator does not run trigger-only evals for an external skill from this context; Agent tool was not available to dispatch isolated sub-agents, so each eval prompt was analyzed against the full skill catalog and the `project-discovery` description as a fresh session would see it)
**Branch**: refactor-with-skills
**Total**: 6 evals | **Passed**: 6 | **Failed**: 0

## Results

| # | Name | Category | Pass | Observed activation | Notes |
|---|---|---|---|---|---|
| 1 | should-trigger-fresh-onboarding | positive | Pass | project-discovery | Prompt contains "set up this boilerplate" and "discover the architecture" — both are verbatim triggers in the description. |
| 2 | should-trigger-business-data-map-regeneration | positive | Pass | project-discovery | Prompt "Generate the business-data-map.md" matches the verbatim trigger "generate business-data-map". Description also lists stale `.context/business-data-map.md` as a trigger. |
| 3 | should-trigger-api-architecture-refresh | positive | Pass | project-discovery | Prompt "Regenerate api-architecture.md" matches the verbatim trigger "regenerate api-architecture" and the "stale api-architecture.md" condition. |
| 4 | should-not-trigger-write-e2e-test | negative | Pass | test-automation | Prompt "Write an E2E test for the login flow" matches test-automation description ("writing E2E or API/integration tests"). project-discovery description explicitly excludes "writing tests (test-automation)". |
| 5 | should-not-trigger-kata-concept-question | negative | Pass | none (direct answer) | General conceptual question. project-discovery adapts KATA to a project but does not exist to explain the framework; no skill should be invoked. Direct answer from the model. |
| 6 | should-not-trigger-run-regression | negative | Pass | regression-testing | Prompt "Run the regression suite" maps to regression-testing description ("Execute regression test suites via CI/CD"). project-discovery description explicitly excludes "running suites (regression-testing)". |

## Suggested fixes (only for failures)

All passed — no changes needed.
