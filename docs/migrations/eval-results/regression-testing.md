# Evals — regression-testing

**Run date**: 2026-04-14
**Run method**: manual fresh-agent (static analysis against skill descriptions; Task/Agent tool not available in this environment, skill-creator is interactive-only for arbitrary skills)
**Total**: 6 evals | **Passed**: 6 | **Failed**: 0

## Method notes

Each eval prompt was evaluated against the `regression-testing` skill's `description:` field and the descriptions of the most plausible competing skills (`test-automation`, `sprint-testing`, `github-actions-docs`). Activation was inferred by matching:
- Trigger phrases explicitly listed in the description (`run regression`, `trigger test workflow`, `analyze test results`, `quality report`, `GO/NO-GO decision`, `release readiness`, `flaky tests`, `Allure report`, `smoke suite`, `pass rate`, `nightly test failure`, `stage 6`).
- Explicit negative guardrails in the description ("Do NOT use for writing new regression tests ... or for manual fix verification").
- Primary intent of the prompt (execute / analyze / report vs. author / retest / infra setup).

## Results

| # | Name | Category | Pass | Observed activation | Notes |
|---|---|---|---|---|---|
| 1 | trigger-regression-on-staging-for-release-decision | positive | ✓ | regression-testing | "regression suite", "staging", "deploy to production" map directly to `run regression` + GO/NO-GO trigger phrases. |
| 2 | classify-nightly-smoke-failures | positive | ✓ | regression-testing | "nightly smoke", "analyze", "classify failures" map to `smoke suite`, `nightly test failure`, `analyze test results`. |
| 3 | quality-report-with-pass-rate-and-trend | positive | ✓ | regression-testing | "quality report", "pass rate", "trend" are exact triggers in the description. |
| 4 | write-regression-test-for-login-bug | negative | ✓ | test-automation | Verb is "Write" (authoring). Description's explicit guardrail: "Do NOT use for writing new regression tests (that belongs to test-automation)." test-automation description matches "writing E2E or API/integration tests". |
| 5 | manual-retest-of-bug-fix | negative | ✓ | sprint-testing | "Manually test whether the bug fix ... actually works" is manual fix verification. Description's explicit guardrail: "Do NOT use for ... manual fix verification (that belongs to sprint-testing)." sprint-testing description covers "bug retesting". |
| 6 | setup-github-actions-for-pr-tests | negative | ✓ | github-actions-docs (or general response) | Intent is CI/CD infrastructure setup, not executing regression. No `run regression`, `analyze results`, or GO/NO-GO signal. Prompt also lacks any "regression", "smoke", "flaky", or "release readiness" keyword. |

## Suggested fixes (only for failures)

All passed — no changes needed.

## Observations (non-blocking)

- The description is well-scoped: it front-loads the three canonical verbs (Execute / Analyze / Decide) and closes with explicit negative guardrails against the two closest siblings (`test-automation` for authoring, `sprint-testing` for manual retest). Those guardrails are what make Evals 4 and 5 clean rejections rather than near-misses.
- Eval 6 is a "soft" negative: the skill's `references/ci-cd-integration.md` may legitimately be consulted, but the top-level pipeline (trigger → classify → verdict) correctly does not fire because the prompt has no execution or analysis intent.
- No keyword collision was observed between the positive-trigger vocabulary (GO/NO-GO, pass rate, Allure, flaky, nightly) and the negative prompts, which is a healthy sign that the description discriminates well.
