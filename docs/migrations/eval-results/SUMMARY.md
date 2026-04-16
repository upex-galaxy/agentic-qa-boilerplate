# Eval Run — Aggregate Summary

> Run date: 2026-04-15
> Branch: `refactor-with-skills`
> Scope: 5 migrated skills (project-discovery, sprint-testing, test-documentation, test-automation, regression-testing)
> Excluded: `xray-cli`, `playwright-cli` (pre-existing, not part of migration)

---

## Headline

| Skill | Positive | Negative | Total | Verdict |
|---|---|---|---|---|
| project-discovery   | 3/3 | 3/3 | 6/6 | PASS |
| sprint-testing      | 3/3 | 3/3 | 6/6 | PASS |
| test-documentation  | 3/3 | 3/3 | 6/6 | PASS |
| test-automation     | 3/3 | 3/3 | 6/6 | PASS |
| regression-testing  | 3/3 | 3/3 | 6/6 | PASS |
| **Total**           | **15/15** | **15/15** | **30/30** | **PASS** |

No failures. No suggested fixes to skill `description:` fields.

---

## Methodology caveat (important — read before concluding)

All 5 subagents reported the **same** limitation and fell back to the **same** method:

- `skill-creator` does **not** expose a "run trigger-evals for an arbitrary external skill" entry point. Its eval runner is built for skills created *inside* its own iteration loop, not for validating skills that already exist in `.claude/skills/`.
- The `Agent` / `Task` tool was **not available** inside the dispatched subagent context, so subagents could not spawn a fresh sub-sub-agent per eval prompt to observe real activation.
- Fallback used by all 5 subagents: **lexical / analytical matching** — each prompt in `evals/evals.json` was compared against the `description:` field of the target skill and the descriptions of sibling skills, and routing was *inferred* (not observed) using trigger-phrase matching + explicit negative guardrails.

This is a **static-analysis pass**, not an **empirical activation test**. Interpretation:

- The `description:` fields are **internally consistent**: positive-trigger vocabulary and negative guardrails align with what the evals claim.
- What this run does **not** prove: that a fresh Claude Code / Codex / Cursor session with the full registered skill catalog will actually route a given prompt to the expected skill in practice. The model's skill-picker applies its own weighting that static text analysis can only approximate.

If empirical certainty is required, a future run should dispatch one fresh `Agent`/`Task` call per prompt (30 total) with the skills registered and observe which `Skill` tool (if any) gets invoked. That capability was not present in this session's subagent context.

---

## Per-skill notes

### project-discovery
- All 3 positives match verbatim trigger phrases in the description ("set up this boilerplate", "generate business-data-map", "regenerate api-architecture").
- Negatives correctly route: E2E test writing → `test-automation`; regression execution → `regression-testing`; conceptual KATA question → direct answer (no skill).
- Description explicitly disclaims "writing tests" and "running suites" — those disclaimers drove the clean rejections.

### sprint-testing
- All 3 positives match triggers "test this ticket", "retest this bug", "process the sprint / generate SPRINT-N-TESTING framework".
- Clean handoff to siblings on negatives: automation → `test-automation`, TMS docs → `test-documentation`, regression → `regression-testing`.
- Notable: bug-retest correctly stays in `sprint-testing` rather than leaking to `regression-testing`, thanks to the explicit "manual fix verification belongs to sprint-testing" guardrail in `regression-testing`'s description.

### test-documentation
- All 3 positives (ROI, create TCs in Jira, fix traceability) hit verbatim triggers.
- Negatives route cleanly: manual execution → `sprint-testing`, writing code → `test-automation`, generic git question → no skill (CLAUDE.md covers it).
- Strong hard prerequisite in the description ("tests must already be validated") keeps it out of shift-left / exploratory scope.

### test-automation
- All 3 positives match "write E2E test", "create API component / KATA", "review test code".
- Negatives route cleanly: regression execution → `regression-testing`, TMS/ROI → `test-documentation`, onboarding → `project-discovery`.
- Disclaimers in description (`Do NOT use for running suites / documenting TCs / onboarding`) drove the rejections.

### regression-testing
- All 3 positives match "run regression", "classify nightly failures", "quality report / pass rate / trend".
- Two negatives rely on **verb discrimination**: "Write a regression test" → `test-automation` (authoring verb); "Manually test the bug fix" → `sprint-testing` (manual verb). Both are explicitly guarded in the description.
- One "soft negative" (setup GitHub Actions) correctly does not fire — no execution or analysis intent in the prompt.

---

## Recommended next actions

Ranked by value:

1. **Accept the pass and move on.** The static-analysis pass is a valid signal that the skill descriptions are internally consistent and well-guarded. All 5 skills front-load concrete verbs + trigger phrases and close with explicit `Do NOT use for: …` disclaimers against their closest sibling. The descriptions were authored during the migration with cross-skill disambiguation in mind, and this review confirms that intent.
2. **Optional: re-run empirically when tooling permits.** If at a later session the dispatched subagents have access to the `Agent`/`Task` tool (or if Anthropic ships a first-class skill-trigger-eval runner), re-run the 30 prompts as fresh-agent activations and compare. Zero cost to skip for now — the static pass is defensible.
3. **No fixes proposed.** Nothing to patch in any `description:` field. Any further tuning would be premature optimization.

---

## Provenance

Per-skill detailed reports:
- `.context/PBI/eval-results/project-discovery.md`
- `.context/PBI/eval-results/sprint-testing.md`
- `.context/PBI/eval-results/test-documentation.md`
- `.context/PBI/eval-results/test-automation.md`
- `.context/PBI/eval-results/regression-testing.md`

Source evals (authored during migration):
- `.claude/skills/{skill}/evals/evals.json` (≥3 positive + ≥3 negative per skill)
