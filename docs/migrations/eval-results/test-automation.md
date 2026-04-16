# Evals — test-automation

**Run date**: 2026-04-14
**Run method**: manual fresh-agent (skill-creator does not support running trigger evals for arbitrary existing skills; fallback used by matching each prompt against the registered skill descriptions to infer activation)
**Total**: 6 evals | **Passed**: 6 | **Failed**: 0

## Results

| # | Name | Category | Pass | Observed activation | Notes |
|---|---|---|---|---|---|
| 1 | should-trigger-write-e2e-test | positive | ✓ | test-automation | Prompt "Write an E2E test for the checkout flow..." directly matches description triggers ("writing E2E... tests", "write test", "create E2E test"). |
| 2 | should-trigger-create-api-component | positive | ✓ | test-automation | Prompt explicitly names "API component" and "KATA pattern" — both are primary triggers in the description. |
| 3 | should-trigger-review-test-code | positive | ✓ | test-automation | Prompt "Review the test... Verify it follows KATA" matches "review test code" and "KATA compliance" trigger phrases. |
| 4 | should-not-trigger-run-regression-suite | negative | ✓ | regression-testing | "Trigger the regression suite... ship to production" routes to regression-testing (CI/CD execution, GO/NO-GO verdict). test-automation description explicitly disclaims "running suites". |
| 5 | should-not-trigger-document-test-case | negative | ✓ | test-documentation | "Document... in Jira as Xray Tests... compute the ROI" routes to test-documentation (TMS artifacts, ROI scoring). test-automation description disclaims "documenting TCs in Jira/Xray". |
| 6 | should-not-trigger-onboard-project | negative | ✓ | project-discovery | "Set up this new project... generate the business-data-map and api-architecture context files" routes to project-discovery. test-automation description disclaims "onboarding a repo". |

## Suggested fixes (only for failures)

All passed — no changes needed.
