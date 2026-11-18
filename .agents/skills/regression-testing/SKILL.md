---
name: regression-testing
description: "Run regression, smoke or sanity suites through CI and decide GO / CAUTION / NO-GO. Use when running or triggering a suite; analyzing a failed or nightly run and classifying flaky, regression or environment failures; judging release readiness; writing a quality report. Not for writing regression tests (test-automation) or retesting one bug fix (sprint-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [testing-e2e, ci-cd]
metadata:
  kind: workflow
  stage_owner: true

---

## Forbidden invocations

Do not invoke `/sdd-*` skills from this workflow. SDD is an optional ceremony a user installs by hand; this skill ships self-contained and never chains it. To refactor KATA, fixtures, `cli/`, `scripts/` or the `api/schemas/` pipeline, exit this skill and invoke `/framework-development`, which runs Plan, Code, Verify, Archive on its own. `scripts/lint-skills.ts` rejects any `/sdd-` mention outside this section; `.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4 governs users who install SDD.

# Regression Testing: Execute, Analyze, Decide

This skill takes a CI suite from trigger to release decision: it runs the suite, watches it finish, classifies each failure, scores the run against the release criteria, and ends with a GO / CAUTION / NO-GO verdict and a stakeholder report. The phases run in one order, **Execute, Analyze, Report**.

---

## Compact Rules

- Read a failure's logs before classifying it, and analyze before reporting.
- Clear the readiness preflight before triggering anything (`gh` authenticated, workflow file present, GitHub Actions secrets set, Allure resolvable, active env confirmed): a long run that 401s halfway is the expensive failure.
- Persist `RUN_ID` the moment the trigger returns, so resume re-attaches to a live run instead of re-triggering CI.
- Check a failure's history before marking it REGRESSION; skipping that is the most common misclassification. A first-ever failure with no history is NEW TEST, unverified, not a regression.
- Classify every failure into exactly one of KNOWN-BLOCKED / KNOWN ISSUE / ENVIRONMENT / NEW TEST / FLAKY / REGRESSION, and give severity on a separate axis (a FLAKY test on checkout is still CRITICAL). Classification fails closed: every class but REGRESSION cites its evidence (the `@blocked:{BUG-KEY}` marker; a ticket created BEFORE the run; the matching log line plus the other failures on that host; the empty history query; the ids and results of at least 5 runs on an unchanged build). No citation, or a ticket this session filed, means REGRESSION.
- Exclude `@blocked:{BUG-KEY}` tests from the gating pass-rate and report their count with each blocking key. They are parked behind a bug that is already filed: never REGRESSION, never a new bug.
- Use ENVIRONMENT only with evidence. Many unrelated tests failing on one host is environment; one test failing on an endpoint other tests reach fine is more likely a REGRESSION.
- Call a test FLAKY only with at least 5 runs of history. With fewer, label the failure INSUFFICIENT HISTORY and count it as REGRESSION for the verdict (fail-closed), then re-evaluate on the next run. When several classes match, the order is KNOWN-BLOCKED > KNOWN ISSUE > ENVIRONMENT > NEW TEST > FLAKY > REGRESSION: FLAKY wins only with its citation, and REGRESSION is what is left.
- Take the run's counts (total, passed, failed, skipped, pass-rate) from `reports/test-outcomes.json`. Allure supplies each failure's detail and the history behind FLAKY, and the counts only when that file is missing from the downloaded artifacts (always for smoke and sanity runs; say so in the report).
- Do not emit GO while any REGRESSION-class failure stands. Hard vetoes regardless of score: any `@critical` test failing, any HIGH/CRITICAL-severity regression, or a pass rate below 90%.
- A borderline failure may be diagnosed with `diagnosing-bugs`, never fixed: no product-code instrumentation and no fix.
- File only CONFIRMED product failures: the REGRESSION class, plus a NEW TEST failure once manually confirmed as a real defect. FLAKY, ENVIRONMENT and KNOWN ISSUE get no issue at all. Triage decides WHETHER to file; the defect-management doctrine decides the type and the fields.
- Do not open a GitHub issue for a quality failure. File it in the issue tracker, parented to the QA Defect Management process epic and linked to the source Story, never to a product or dev epic.
- Create the RTR (Regression Test Results, a Test Execution) BEFORE triggering CI, persist its key beside `RUN_ID`, and pass it as the `execution_key` dispatch input; Phase 1 has its fields. One RTR per verdict. The STR is created or completed only when the run is the sprint close (then it links to both the STP and the RTP).
- Do not import a regular regression run into the sprint STR. Smoke and sanity never write into a regression execution: they import only when an execution key is passed explicitly.
- Close the RTR (or the sprint-close STR) via `complete` only AFTER the verdict comment is posted on it, and leave the RTP at its ready status: a suite run never completes the plan it ran from.
- Do not invent a sprint number. The RTR needs none (its scope-id is `{env}-{YYYY-MM-DD}` or a release tag); only the sprint-close STR takes `N`, from the user or the STP's own scope-id. Ask before creating anything at sprint altitude.
- Download the artifacts even on a red build (evidence vanishes after the retention window), and keep smoke and regression results in separate pass-rates because their SLOs differ.
- Inspect traces and screenshots with `/playwright-cli` (`[AUTOMATION_TOOL]`). It is the only browser path; no MCP backs it.

**Read full SKILL.md when**: driving the CI commands, applying the GO/CAUTION/NO-GO scoring table, resolving a borderline classification, wiring the TMS artifacts, or writing the report.

---

## Inputs

- `.github/workflows/*.yml`: the workflow files for the regression, smoke and sanity suites. They define the triggers, inputs and artifact uploads. Before editing or diagnosing one, call the Skill tool with "github-actions-docs"; when it is not installed, check the Actions syntax against the official docs (`library-docs` capability) and say so. Actions syntax changes upstream without notice, and a guessed key fails at runner start with a message that points nowhere. Reading one does not need it.
- `.context/PBI/qa-artifacts/master-test-plan.md`: the regression Epic key and the pass-rate SLOs per suite.
- `playwright.config.ts`: reporter config, retry policy and project matrix, needed to read retry counts and shard splits.
- The previous run's Allure report (artifact URL, or a download under `./analysis/previous/`): the trend baseline.
- `kata-manifest.json`: the registry of tests and ATCs, used to cross-reference failed test ids.
- `.agents/jira-required.yaml`: the Jira refs (project key, work types, transitions) for regression issues.
- `agentic-qa-core/references/defect-management-doctrine.md`: the authority for classifying (Bug / Defect / Improvement), the mandatory field matrix, QA-Assignee ownership and the QA process epic. Read it before filing a confirmed regression in Jira (Phase 3).
- The RTP key (`RTP: {{PROJECT_KEY}}: Regression Test Plan`, a Test Plan item parented to QA Master Test Plan). Phase 1 finds it by title through `[TMS_TOOL]` as the RTR's `testPlan` target. `/test-documentation` produces it (promotion of `regression-candidate` TCs); this skill neither creates nor writes into it. Modality jira-native has no Test Plan item (the promotion is the `regression-candidate` label), so there is no key to resolve.
- The RTR (`RTR: <<SCOPE_ID>>: Regression Testing`, a Test Execution parented to QA Test Artifacts): created in Phase 1 before the trigger, imported into by CI, closed in Phase 3 after the verdict. One per verdict; Phase 1 covers its key.
- `agentic-qa-core/references/artifact-lifecycle.md`: the authority for artifact statuses. The RTR (or the sprint-close STR) closes at `{{jira.status.test_execution.close}}` after the verdict, the RTP stays at `{{jira.status.test_plan.ready}}`, every created artifact carries `assignee` = self, and an unmapped transition slug goes through the §4 fallback instead of a silent skip. Read it before firing any transition.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional. The orchestrator also applies the per-stage **Definition-of-Done gates** in `agentic-qa-core/references/stage-gates.md`: verify a stage's DoD BEFORE recording its progress checkpoint and advancing.

The scope is per run: `<scope>` = `<env>-<YYYY-MM-DD>` (e.g. `staging-2026-05-20`). Session state lives at `.session/regression-testing/<scope>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. The resume case worth the most: the Monitor subagent dies mid-watch, but `RUN_ID` is in `plan.md`, so Phase 0 re-attaches with `gh run view <RUN_ID>` instead of re-triggering CI.

Every dispatch follows `AGENTS.md` §3 and the 7-component briefing in `.agents/skills/agentic-qa-core/references/briefing-template.md`, and each stage's pattern follows `.agents/skills/agentic-qa-core/references/dispatch-patterns.md`. The long watch, the artifact download and the high-volume classification are the hotspots; the rest stays inline.

| Stage                                                      | Pattern    | Subagent role                                                                                                  |
|------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------------------------|
| Trigger workflow (`gh workflow run`)                       | Single     | inline, no dispatch needed (one shell call)                                                                   |
| Wait/monitor `gh run watch`                                | Background | one Monitor subagent runs the watch; the main thread continues with prep work; the subagent notifies on exit           |
| Download the run's artifacts                               | Parallel   | one subagent per artifact `gh run view --json artifacts` lists (no rate-limit risk)                          |
| Classify failures (chunks of ~10 tests each)               | Parallel   | N subagents by failure volume; cap per `dispatch-patterns.md` to avoid context dilution                                        |
| Compute metrics (pass-rate, trends)                        | Single     | inline, needs aggregated state                                                                      |
| Generate executive report                                  | Single     | inline, final synthesis, decisions live here                                                                  |
| GO / CAUTION / NO-GO verdict                               | Single     | inline, main thread owns release decisions                                                                    |

- On a subagent failure, stop, report the full context to the user and offer retry, skip or abort. Do not auto-fix (`.agents/skills/agentic-qa-core/references/orchestration-doctrine.md`). A skill that itself broke (a wrong step, a missing verifier, a stale rule) goes upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.

---

## Fleet seam (optional)

One conductor reads the run, classifies and owns the verdict, so triage is never split across sessions. The seam covers what comes AFTER Phase 2: when classification leaves several independent failure clusters that each need code and the user asks for them to be worked at once.

- **Topology: one worktree per failure cluster.** A cluster's fix is code (a spec, a locator, a fixture), and two sessions in one checkout contend on the git index even on disjoint files, so each worker gets its own checkout and branch.
- The conductor writes `launch.txt` in `.session/regression-testing/<scope>/`, one self-contained line per cluster, whether or not any orchestration transport exists on the machine. `/agent-orchestration` (`[ORCHESTRATION_TOOL]`) owns launching, supervising and closing those sessions; `launch.txt` is the payload for the paste-by-hand fallback when nothing can launch them.
- **The verdict stays with the conductor.** GO / CAUTION / NO-GO, the metrics, the RTR (or the sprint-close STR) and every Jira write are Phase 3. A worker fixes its cluster and reports; it does not re-score the run, file the defect or transition the RTR.
- A worker authors its fix under `/test-automation` (Plan, Code, Review) on its own branch, and it lands per `git_strategy`: a regression fix gets no exemption from the automation gate.
- Silence rule: a missing orchestration transport is never named to the user and never appears in the preflight gate, the Environment block or the report.

---

## Readiness preflight gate (mandatory, runs before Phase 0)

> Full doctrine: `agentic-qa-core/references/preflight-gate.md`. The gate runs before the resume check and any `gh workflow run`, on two laws: **args-as-answers** (the suite, env and any grep or test_file are provided args, so ask only the gaps) and **probe, don't assume**. Gaps and REDs go out as ONE `AskUserQuestion` checklist, a self-fix needs approval and an explanation, and a blocking RED stops the run. The generic baseline (env resolution, secret and restart handling, output contract) is the reference §3.1; below is only this skill's capability delta.

| Capability | Need | Why here |
|---|---|---|
| GitHub CLI authenticated | REQUIRED | Every stage drives CI via `gh` (`gh auth status`, `gh workflow run`, `gh run watch`, `gh run download`). When not authenticated, the user runs `gh auth login` (suggest the `!` prefix) and the run does not proceed. |
| Workflow files present | REQUIRED | `.github/workflows/` must hold the regression/smoke/sanity workflow for the chosen suite, with the inputs this skill passes. |
| GitHub Actions Secrets/Variables | REQUIRED | The runner authenticates with env-prefixed creds (`secrets.<ENV>_USER_EMAIL` / `_PASSWORD`) + `XRAY_*` / `ATLASSIAN_*` as Repository/Environment Secrets, and the suite 401s mid-run without them. `gh secret list` (add `--env <env>` for environment scope) shows them; a missing one is set with `gh secret set <NAME>` from `.env`. If `/test-framework-adaptation` did not push the secrets, this is the most common silent gap. |
| Allure local | REQUIRED | `bunx allure` resolves (devDep, no global install); `allurerc.mjs` present for `bun allure:agent` markdown triage. |
| Active env | REQUIRED | The suite runs against `<<ACTIVE_ENV>>` (default `{{DEFAULT_ENV}}`). Confirm it is the intended target before a long run. |
| `[TMS_TOOL]` (result sync) | OPTIONAL | Only when `.agents/project.yaml` `testing.tms_cli` is set: Phase 1 creates the RTR before the trigger, Phase 3 posts the verdict on it and closes it. Modality jira-xray uses `/xray-cli` + `XRAY_*`. |
| `[ISSUE_TRACKER_TOOL]` (file regression issues) | OPTIONAL | Only on NO-GO / CAUTION-with-regressions, to file issues. Load `/acli` then. |

Test-user creds, the OpenAPI / API token, DBHub and Playwright browsers live inside the CI runner, so the gate does not probe them. When every REQUIRED row is GREEN, continue to Phase 0.

---

## Phase 0 (session resume check, mandatory, inline)

Before suite selection or any `gh workflow run`, run the resume contract from `agentic-qa-core/references/session-management.md` §4:

1. Compute prospective `<scope>` = `<env>-<YYYY-MM-DD>` from invocation context (env defaults to `{{DEFAULT_ENV}}`).
2. Check `.session/regression-testing/<scope>/progress.md`.
3. If it does NOT exist → proceed to suite selection + Phase 1 preflight + plan.md write.
4. If it DOES exist:
   - Read `plan.md` (captured `suite`, `env`, `workflow_file`, `RTR_KEY` if Phase 1 already created the run record, `RUN_ID` if Phase 1 already triggered).
   - Read tail of `progress.md`.
   - If `RUN_ID` is present AND `progress.md` last entry is `Phase 1 — Trigger — status: completed` but Monitor entry is missing/failed: surface the option to **re-attach** to the existing `RUN_ID` via `gh run view <RUN_ID> --json status,conclusion` instead of re-triggering. This is the high-value resume case.
   - Otherwise surface the standard offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-regression-testing-<scope>-aborted/` first.

---

## With nobody at the keyboard

This skill waits for a person at seven points. What `agentic-qa-core/references/decision-protocol.md` and the record already settle, follow without asking. For the rest:

| Gate | Person present | Supervised worker | Routine, no person |
|---|---|---|---|
| Preflight checklist | one `AskUserQuestion` checklist | the worker reports gaps and REDs to the conductor, which holds the gate | the delegating brief supplies suite, env and grep or test_file; a gap it does not cover, or any RED, stops the run before CI and the report names it |
| Phase 0 resume, restart or abort | the offer as written | the conductor picks | re-attach to a live `RUN_ID`, else resume from `progress.md`; restart (it re-triggers CI) only when the brief says so |
| Allure same-major bump | offer it | the conductor decides | report the available update and bump nothing |
| Allure new major | ask, presenting the breaking changes | the conductor decides | report the breaking changes and bump nothing |
| `allurerc.mjs` or `TestFixture.ts` migration | show the diff and wait for approval | send the diff to the conductor | put the proposed diff in the report and change neither file |
| Sprint-close `N` | ask the user | the conductor supplies it | without `N` in the brief, run a plain RTR and create no STR |
| Subagent failure options | retry, skip or abort | the conductor picks | stop, report the full context, re-run nothing |

Every Jira write (the RTR, the verdict comment, a regression issue) is outward. A routine whose brief does not cover Jira writes still runs the suite without the RTR (CI skips the TMS import with a warning), classifies, scores and writes the local report, then stops and reports the verdict as ready to post.

---

## When to run each suite

| Suite | Workflow file | Duration | Use when |
|-------|---------------|----------|----------|
| `regression` | `regression.yml` | a long run (read the last `gh run view` duration) | Pre-release validation, nightly full run |
| `smoke` | `smoke.yml` | a short run (read the last `gh run view` duration) | Post-deploy health check, `@critical` only |
| `sanity` | `sanity.yml` | varies (read the last `gh run view` duration) | Validate one feature / one file / one grep pattern |

A bare "run regression" means `regression` on `{{DEFAULT_ENV}}`, "smoke" or "critical only" means `smoke`, and a named file, grep pattern or single feature means `sanity`.

When the request is a change rather than a named suite ("what could this PR break", a release candidate, a diff to verify), the scope comes from the change itself. Call the Skill tool with "blast-radius" on the change. A contained change maps to a `sanity` grep or file; one that reaches shared flows, data or config maps to `regression`. Record the choice under Approach in `plan.md`. If the skill is not installed, do the step inline and say so there: read the diff, list the flows its symbols reach (including what a symbol search misses: API payloads, DB columns, flags) and pick the suite from that list. The step needs no person.

---

## Local reporting (Allure, no global install)

Allure (major pinned in `package.json`) is a devDep: `bunx allure` resolves to the local `node_modules/.bin/allure`, with no global install. `allurerc.mjs` configures a single plugin on purpose. With only **Awesome**, the generated `index.html` is the report itself (no card-chooser landing) and its mode dropdown covers everything: **Report** (drill-down, tag filters), **Graphs** (the full executive chart set) and **Timeline**. Do not add `plugin-dashboard` instances: they duplicate Graphs and bring the landing screen back (rationale in the `allurerc.mjs` comments). Trend charts read `historyPath: ./.allure/history.jsonl` and fill in from the 2nd run onward.

| Use case | Script | Underlying command |
|---|---|---|
| Run tests + auto-generate report (human review) | `bun allure:run` | `bunx allure run -- bunx --bun playwright test`, through the env launcher like the `test*` scripts |
| Run tests + emit markdown for AI review | `bun allure:agent` | `bunx allure agent -- bunx --bun playwright test`, through the env launcher like the `test*` scripts |
| Generate report from existing `./allure-results` | `bun allure:generate` | `bunx allure generate ./allure-results` |
| Serve last generated report locally | `bun allure:open` | `bunx allure open` |
| Live-refresh report during iterative dev | `bun allure:watch` | `bunx allure watch ./allure-results` |

`bun allure:agent` writes a markdown summary an agent reads without parsing HTML. Use it for a structured pass/fail breakdown after a local re-run while triaging a CI failure (Phase 2 step 1, before downloading `merged-allure-results-{env}`). CI produces those artifacts and `gh run download` fetches them (Phase 2). The GitHub Pages reports come from `scripts/ci/publish-allure-pages.ts` with the SAME `allurerc.mjs` and `allure` devDep as local runs; `/{env}/{suite}/` redirects into the latest run's Awesome report, with per-suite trend history and the `--keep` retention that script applies.

### Allure version-currency check (required during any Allure or Pages setup)

The boilerplate pins the Allure packages at scaffold time, so a fresh install is usually behind upstream. Run this check first on any **Allure setup** (first local report, or a RED on the "Allure local" preflight row) or **GitHub Pages setup** (`references/github-pages-setup.md`):

1. `npm view allure version && npm view allure-playwright version`, compared against `package.json`.
2. **Same major behind**: summarize the news (release notes: `gh api repos/allure-framework/allure3/releases`), then offer `bun update allure allure-playwright allure-js-commons` (or bump the `^` ranges and `bun install`). Keep `allure-js-commons` in lockstep with `allure-playwright`, because `tests/components/TestFixture.ts` imports it for the `layer` auto-label.
3. **New major available**: never upgrade silently. Present the breaking changes and wait for explicit user approval.
4. **Config currency (older scaffolds)**: the updater (`bun sync`, read `package.json`) syncs skills and appends new devDeps, but never overwrites the project-adapted `allurerc.mjs` or `tests/components/TestFixture.ts`. If the local `allurerc.mjs` predates the current template (no `historyPath`, no `categories`, or stale `plugin-dashboard` instances), offer to migrate it: fetch the boilerplate's current `allurerc.mjs` as reference (`https://raw.githubusercontent.com/upex-galaxy/agentic-qa-boilerplate/main/allurerc.mjs`), keep the project's `name`, and port the config. Do the same for the `_allureLayer` auto-fixture in `TestFixture.ts`; without it the testingPyramid and durations-by-layer charts render empty. Show the diff and wait for approval before changing either file.
5. After any bump, run `bun allure:generate` from existing results (or a sandbox run) and confirm the root `index.html` opens the Awesome report directly, with the Report | Graphs | Timeline dropdown working.

Keep these on upgrade (context in the `allurerc.mjs` comments):
- Dashboard chart `type` values must match `ChartType` in `@allurereport/charts-api`. The plugin README's `trend` and `pie` examples are stale and yield an empty dashboard (404 on `widgets/charts.json`).
- `historyPath` stays OUTSIDE `allure-report/` (`./.allure/history.jsonl`), or `test:clean` erases trend history.
- Multiple instances of one plugin need an explicit `import:` field, because a custom key alone does not resolve. This matters only when a project adds extra report views.

---

## Phase 1: Execute

### Preflight (always)

```bash
gh auth status
gh repo view --json name,owner
gh workflow list
```

If `gh` is not authenticated, stop and ask the user to run `gh auth login`.

Before the Trigger step, write `.session/regression-testing/<scope>/plan.md` per `agentic-qa-core/references/session-management.md` §6: the goal (suite, env, reason for the run); the inputs (workflow file, env vars, the optional grep or test_file); the approach (the subagent pattern per stage, the suite choice and its blast-radius output); the phase breakdown (Trigger, Monitor, Download, Classify, Compute, Report, Verdict); risks; a verification checklist (all 3 artifacts download, a verdict is emitted); and the cross-reference to `.context/reports/regression-<env>-<date>.md`, which will hold the final verdict. `RTR_KEY` joins `plan.md` §Inputs after the Create-the-RTR step and `RUN_ID` after the Trigger step. Append both; do not rewrite the body.

### Create the RTR (before the trigger)

The run record exists BEFORE CI starts, so the workflow imports into it instead of into a shared secret. `<<SCOPE_ID>>` = `<<ACTIVE_ENV>>-<YYYY-MM-DD>` (the same value as the session `<scope>`), or the release tag (e.g. `v2.3.0-rc1`) when the user says the run is a release candidate. Only the regression suite gets an RTR; smoke and sanity get none (see the Trigger block).

1. **Resolve the RTP.** Find the Test Plan titled `RTP: {{PROJECT_KEY}}: Regression Test Plan`. When it is missing, do not create it here (it is `/test-documentation`'s promotion artifact): create the RTR without the `testPlan` edge, record the gap as a stated N/A in the verifier and the report, and recommend running the promotion first.
2. **Find or create the RTR.** A same-scope RTR still `{{jira.status.test_execution.active}}` (no verdict yet: an ENVIRONMENT re-run, a resumed session) is reused. A same-scope RTR already `{{jira.status.test_execution.close}}` (verdict written) means this is a NEW run: append `#2` (then `#3`) to the scope-id. Never reopen a closed RTR (`reactive` stays unused).
3. **Persist** `<<RTR_KEY>>` in `.session/regression-testing/<scope>/plan.md` §Inputs, on the line `RUN_ID` will join after the trigger. Resume reads both.
4. **Pass it to CI** as `-f execution_key=<<RTR_KEY>>` on `gh workflow run` (Trigger block below). The workflow's `execution_key` input overrides the `STP_EXECUTION_KEY` secret (`references/ci-cd-integration.md` §4).

```
[TMS_TOOL] Find Test Plan:
  summary: RTP: {{PROJECT_KEY}}: Regression Test Plan
  -> <<RTP_KEY>>   (missing: RTR without testPlan + stated gap; never create the RTP here)

[TMS_TOOL] Find-or-create Test Execution:
  summary: RTR: <<SCOPE_ID>>: Regression Testing        # e.g. RTR: staging-2026-09-23: Regression Testing
  parent: {QA Test Artifacts epic: qa.qa_epics.test_artifacts_epic.key, resolved by .name when the key is null}
  testEnvironments: [<<ACTIVE_ENV>>]
  assignee: self
  testPlan: <<RTP_KEY>>
  -> <<RTR_KEY>>   (persist beside RUN_ID, pass as execution_key)

# Modality jira-native
RTR: n/a (jira-native has no Test Executions); results = per-Test status writes + [LOCAL] report
  -> no key: trigger WITHOUT execution_key; the CI jira-native leg writes per-Test status,
     the verdict lives in the [LOCAL] report (and a comment on the Release issue when one exists)
```

**Sprint-close variant.** When the user says this run IS the sprint close, the target is the STR instead of an RTR. Find or create `STR: Sprint#{N}: Regression Testing` per the existing contract (§TMS sync: parent QA Test Artifacts, Test Environment, assignee self, `testPlan` to the STP AND to the RTP, dual membership), persist its key in the same `plan.md` slot, and pass it as `execution_key` the same way.

### Trigger

```bash
# Full regression: execution_key = the RTR (or sprint-close STR) created in the step above
gh workflow run regression.yml \
  -f environment=staging \
  -f execution_key=$RTR_KEY \
  -f video_record=false \
  -f generate_allure=true

# Smoke (no execution_key: smoke never writes into a regression execution;
# pass one only when its results deliberately belong in a specific Execution)
gh workflow run smoke.yml -f environment=staging -f generate_allure=true

# Sanity (grep OR test_file, never both; same execution_key rule as smoke)
gh workflow run sanity.yml -f environment=staging -f test_type=e2e -f grep="@auth"
gh workflow run sanity.yml -f environment=staging -f test_file="tests/e2e/auth/login.test.ts"
```

Modality jira-native: omit `execution_key` on every suite; there is no Execution to import into.

### Capture run ID

```bash
# Wait 3-5 seconds for the run to register, then:
gh run list --workflow=regression.yml --limit=1 --json databaseId,status,createdAt -q '.[0].databaseId'
```

Store it as `RUN_ID`; every later step uses it.

**Progress checkpoint after Trigger**: append `RUN_ID` to `.session/regression-testing/<scope>/plan.md` §Inputs (so resume can re-attach) AND append a phase entry `## Phase 1.Trigger — <ts>` with `status: completed`, `next: Phase 1.Monitor`, `notes: RUN_ID=<value> RTR_KEY=<value>` to `progress.md`. Without the saved `RUN_ID` resume cannot re-attach, and without `RTR_KEY` a resumed session cannot tell which Execution CI imported into.

### Monitor to completion

Delegate `gh run watch <RUN_ID>` to a Monitor subagent (the **Background** dispatch in §Subagent Dispatch Strategy), so the main thread can prepare the report scaffold and load the classification rubric. The briefing is in `references/ci-cd-integration.md` §"Monitoring the workflow run (Background dispatch)". The subagent runs:

```bash
gh run watch <RUN_ID> --exit-status
# Fallback polling (only if gh run watch is unavailable):
gh run view <RUN_ID> --json status,conclusion
# status: queued | in_progress | completed
# conclusion (only when completed): success | failure | cancelled | timed_out
```

Start Phase 2 only after the Monitor returns `status: completed`.

### Output of Phase 1

A short execution summary: workflow name, run ID, environment, duration, conclusion, per-job status, artifact list, and the Allure URL pattern `https://{owner}.github.io/{repo}/{environment}/{suite}/`. For configuring new workflows, debugging CI-only failures, tuning sharding / retries / timeouts, or wiring up secrets and variables, read `references/ci-cd-integration.md`.

---

## Phase 2: Analyze

### Step 1: Collect data

Use the dispatch defined in §Subagent Dispatch Strategy: **Parallel** for the three artifact downloads (allure, evidence, playwright). Fan out one subagent per artifact that `gh run view --json artifacts` lists, in a single tool-call block. Each owns one directory and reports when its download is verified. The metadata reads stay inline because they are short.

```bash
# Inline (main thread): full run context
gh run view <RUN_ID> --json status,conclusion,jobs,createdAt,updatedAt,url,headBranch,event,actor

# Inline (main thread): failed logs only (much smaller than --log)
gh run view <RUN_ID> --log-failed

# Inline (main thread): list artifacts so the parallel dispatchers know what to fetch
gh run view <RUN_ID> --json artifacts --jq '.artifacts[].name'

# Parallel subagent A: allure results + the run's outcome records (counts)
gh run download <RUN_ID> -n merged-allure-results-staging -D ./analysis/
gh run download <RUN_ID> -n e2e-atc-results -D ./analysis/outcomes/e2e/                   # reports/test-outcomes.json
gh run download <RUN_ID> -n integration-atc-results -D ./analysis/outcomes/integration/   # one per job that ran

# Parallel subagent B: failure evidence (screenshots, traces, videos)
gh run download <RUN_ID> -n e2e-failure-evidence       -D ./analysis/evidence/

# Parallel subagent C: playwright HTML report
gh run download <RUN_ID> -n e2e-playwright-report      -D ./analysis/playwright/
```

Briefing shape: `agentic-qa-core/references/briefing-template.md` §"Parallel — Download 3 CI artifacts in regression-testing".

### Step 2: Parse results

Counts come from `reports/test-outcomes.json`, failure detail from Allure.

`regression.yml` uploads `reports/test-outcomes.json` inside the `e2e-atc-results` and `integration-atc-results` artifacts, one file per job (written by `KataReporter`, ADR-0020). Each file holds one record per test with its outcome class: `passed`, `failed`, `known-defect`, `unexpected-pass` or `skipped`, and the run's counts are the sum of the files. Allure alone can read green over tests never observed passing: it files an expected failure as passed, and Playwright reports a test skipped by a failed `beforeAll` as ok.

Use Allure for what the records do not hold (the message, trace and `suite`/`severity` labels of each failure, and the cross-run history FLAKY needs). Use its `status` for the counts only when `reports/test-outcomes.json` is absent from the downloaded artifacts: always for `smoke.yml` and `sanity.yml` (they do not upload it), and for a downstream project not yet on ADR-0020 or a job that died before `onEnd`. The report then says the counts are Allure-derived and may overstate passes.

Failure-detail priority is Allure results JSON, then Playwright `report.json`, then raw logs. Each Allure result has `status`, `statusDetails.message`, `statusDetails.trace` and `labels[]` (look for `testId` = ATC ID, `suite` and `severity`).

> The `suite` label is tag-derived. It comes from the Playwright tag (`@smoke` / `@regression` / `@e2e` / `@integration` / `@critical`) that also drives CI scope selection, so it is exactly the scope CI ran and needs no reconciling against another label set. Convention owner: `test-automation/references/ci-integration.md` §3.2.1.

### Step 3: Compute metrics

| Metric | Formula |
|--------|---------|
| Total | count of records in `reports/test-outcomes.json` (Allure results only as the stated fallback) |
| Passed / Failed / Skipped | count by outcome class (`known-defect` is its own line and feeds KNOWN-BLOCKED; an `unexpected-pass` is an action item, never a silent pass); on the Allure fallback, count by `status` (incl. Broken) |
| Pass Rate | `Passed / Total * 100` |
| Duration | `max(stop) - min(start)` |
| Trend | current pass rate − previous run pass rate |

Compute the gating Pass Rate over `Total − KNOWN-BLOCKED` and report the blocked count separately with each `{BUG-KEY}` (Step 4): parked tests must not depress the score that drives GO/NO-GO, and the split keeps the decision from being gamed in either direction.

The trend needs the previous run's artifacts:

```bash
PREV=$(gh run list --workflow=regression.yml --limit=2 --json databaseId -q '.[1].databaseId')
gh run download $PREV -n merged-allure-results-staging -D ./analysis/previous/
```

### Step 4: Classify every failure

Use the dispatch defined in §Subagent Dispatch Strategy: **Parallel** when the failure list has more than 10 entries. Shard the failures into chunks of about 10 (cap at 10 subagents), fan out one classification subagent per chunk and merge their JSON reports in the main thread. With 10 or fewer, classify inline: the dispatch overhead is not worth it. Briefing and merge protocol: `references/failure-classification.md` §"Parallel classification (default for >10 failures)".

Apply this decision tree to each failed test, inline or inside a subagent. Read the failure's logs and check its history before marking anything REGRESSION.

```
Failed test
  │
  ├── Tagged @blocked:{BUG-KEY}? ────────────► KNOWN-BLOCKED
  │   (test asserts test.fail('Blocked by {BUG-KEY}') — a deliberately
  │    parked test, not a fresh regression; excluded from gating pass-rate)
  │
  ├── Linked to a known-issue ticket? ───────► KNOWN ISSUE
  │
  ├── Error matches environment pattern? ────► ENVIRONMENT ISSUE
  │   (ECONNREFUSED, ETIMEDOUT, net::ERR_, Navigation timeout,
  │    browserType.launch, 502/503, context deadline exceeded)
  │
  ├── No history (first-ever run)? ──────────► NEW TEST FAILURE
  │
  ├── ≥ 5 runs of history, failure rate > 20%
  │   over the last min(10, available) runs,
  │   same build across them? ───────────────► FLAKY
  │
  ├── 1-4 runs of history? ──────────────────► REGRESSION, labeled INSUFFICIENT HISTORY
  │   (FLAKY cannot be proven: fail-closed,
  │    re-evaluate on the next run)
  │
  └── Anything else (passed before, fails now)► REGRESSION   (release blocker)
```

When more than one branch matches, the first one down the tree wins: KNOWN-BLOCKED > KNOWN ISSUE > ENVIRONMENT > NEW TEST > FLAKY > REGRESSION. FLAKY beats REGRESSION only when its citation is complete. REGRESSION is the residual class, not a rank to win.

| Category | Impact | Action | Evidence the classification must cite |
|----------|--------|--------|------|
| KNOWN-BLOCKED | LOW | Already tracked by `{BUG-KEY}`: exclude from gating pass-rate, list in report with the blocking bug key. No new Jira bug (the marker already names the open bug) | the `@blocked:{BUG-KEY}` tag in the spec and its bug key |
| REGRESSION | HIGH | Block release, file Jira Bug/Defect (Phase 3 §File defects in Jira, doctrine Part 1), assign | none: it is the closed value |
| FLAKY | MEDIUM | Schedule stabilization, do not block. No Jira bug | the run ids and results of at least 5 runs, and the build each ran on (unchanged across them) |
| KNOWN ISSUE | LOW | Document against existing ticket, do not block. No new Jira bug | the ticket key, created before this run started, that names the ATC ID or test title |
| ENVIRONMENT | MEDIUM | Re-run after infra check. No Jira bug | the log line matching an environment pattern, plus the other tests that failed on the same host in the same run |
| NEW TEST | LOW | Manual verification: if a genuine product defect, file Jira Bug/Defect; else accept or fix | the history query (Allure history, TMS runs) that returned no earlier execution |

Classification is a fail-closed gate (`agentic-qa-core/references/orchestration-doctrine.md`, FAIL-CLOSED GATES). Every class except REGRESSION lets a failure past the release gate, and the classifier is the one who picks it, so a non-blocking class stands only with its citation from the last column. A missing or empty citation, or a ticket this session filed to make the failure "known", makes the failure REGRESSION. A parallel chunk's classification returned without its `evidence` is merged as REGRESSION too (`references/failure-classification.md` §Parallel classification).

**When a borderline failure's cause is unclear.** If the tree leaves a failure between REGRESSION, FLAKY and ENVIRONMENT and the log does not settle it, call the Skill tool with "diagnosing-bugs" for diagnosis only: its Phases 1 to 3 (build a loop that reproduces the failure, minimise it, form hypotheses) find the trigger, and you classify from what it proved. Add no instrumentation to product code and write no fix; both belong to the developer. When the skill is not installed, narrow the cause inline (re-run the one test, change one variable at a time, diff the commits between the last pass and this failure) and say so in the report. A cause still unproven leaves the failure at REGRESSION.

**KNOWN-BLOCKED consumes the blocked-test marker.** The `@blocked:{BUG-KEY}` tag plus `test.fail('Blocked by {BUG-KEY}')` is defined in `test-automation` (`references/automation-standards.md` §7 Stability; the `PROGRESS.md` blocked-tests note lives in `references/planning-playbook.md`), and this skill only consumes it. Such a test is KNOWN-BLOCKED, never REGRESSION: it stays out of the gating pass-rate (§Compute metrics), appears in the report under its own heading with the blocking `{BUG-KEY}`, and gets no new Jira bug.

> `sdet` CI-fallback clause (integration-trunk suites only): an ENVIRONMENT-class red on a Sanity-CI run for a ticket branch may authorize merging into the integration trunk, never the final `trunk → main` PR, when both hold: (a) the change passes locally on `local` AND `staging`, and (b) the same red is present independent of the change (nightly already red, or the failing line is shared pre-existing code). File a separate infra/flake ticket and reference it in the PR. The GO bar is unchanged: a REGRESSION-class failure is never eligible, and the final PR to `main` still needs a genuinely green test step. See `.agents/skills/git-flow-master/references/sdet-integration-trunk.md` §CI-fallback clause.

Read `references/failure-classification.md` when the tree is ambiguous, for the error-pattern catalogue, or to compute flakiness over history.

### Step 5: Assess severity per failure

Severity is independent of classification. A FLAKY test on the checkout flow is still CRITICAL severity.

| Severity | Criteria |
|----------|----------|
| CRITICAL | Core user journey (login, checkout, payment). Any `@critical` tagged test. |
| HIGH | Major feature (search, profile, dashboard) |
| MEDIUM | Secondary feature (filters, preferences) |
| LOW | Edge case or admin-only path |

### Output of Phase 2

An analysis block with the metrics table, trend delta, one section per failure category (Regressions first, then Flaky, Known, Environment, New), per-failed-test detail (name, ATC ID, suite, error, last-pass date, screenshot link), job summary and a preliminary verdict. Record the tested commit (`gh run view <RUN_ID> --json headSha`): a different commit is a different baseline, so compare trends only between runs whose commits are known.

---

## Phase 3: Report and decide

### GO / CAUTION / NO-GO scoring

Compute a weighted score from the analysis. Maximum is 10.

| Factor | +3 | +1 | 0 | -1 | -2 | -3 |
|--------|----|----|---|----|----|----|
| Pass Rate | ≥ 95% | 90–95% | | | < 90% | |
| Regressions | 0 | 1-2 Low | | 1+ Medium | | Any High/Critical |
| Critical tests | All pass | | | | | Any fail |
| Flaky tests | | ≤ 3 | 4-5 | > 5 | | |

Verdict thresholds:

- Score 7 or more: **GO**, release approved.
- Score 4 to 6: **CAUTION**, manual review required, document accepted risks.
- Score below 4: **NO-GO**, block release, fix regressions, re-run.

Three hard vetoes override the score: any `@critical` test fails, any HIGH/CRITICAL-severity REGRESSION exists, or the pass rate is below 90%. No GO while any REGRESSION-class failure stands.

### File defects in Jira (when decision = NO-GO or CAUTION with regressions)

Quality issues go to Jira, never GitHub, following `agentic-qa-core/references/defect-management-doctrine.md` (the authority `/sprint-testing` uses) with the full mandatory field matrix. Which failures qualify is in the Compact Rules. FLAKY, ENVIRONMENT and KNOWN ISSUE route to stabilization, infra or the existing ticket; the doctrine decides the type and the fields.

For each issue that clears the gate:

1. Classify Bug vs Defect by the affected feature's lifecycle stage, not by where the failure ran (doctrine Part 1). A regressed feature already live above Staging (production or a superior env) is a **Bug**. A feature still pre-release (Staging or below) is a **Defect**. A genuinely new, desirable behavior surfaced beyond the AC is an **Improvement** (Part 1).
2. Fill the mandatory field matrix (doctrine Part 5): `severity` (impact-based) with `priority` auto-derived (Part 5.1), native `components` = the affected product module (Part 3, mandatory and pre-existing), `root_cause` + `error_type` + `test_environment`, `qa_assignee` = the authenticated session user (self; read before write, Part 2) and `evidence` (Allure link plus failure screenshots, traces and logs from `./analysis/evidence/`).
3. Parent it to the QA Defect Management epic, the QA process epic (`qa.qa_epics.defect_epic.name`), found or created, and never to a product or dev epic (Part 4).
4. Link it to the source Story or feature for traceability through the causal link (Part 4): the regressed ATC's covering Story.
5. Write via acli/REST (doctrine Part 6): create with acli `workitem create --from-json` (create-time customfields under `additionalAttributes.customfield_*`, native `components:[{name}]`). Set customfields and components on an existing issue via REST `PUT /rest/api/3/issue/{KEY}`. This stage may run from CI, so load `/acli` first: it owns auth, syntax and the REST-PUT pattern in `references/acli-integration.md`.

Run the doctrine's filing gate (Part 9) before submitting each issue, and save the returned Jira key to reference in the report.

### TMS sync (optional, when `[TMS_TOOL]` is configured via `.agents/project.yaml` `testing.tms_cli`)

Load `/xray-cli` (Modality jira-xray) before running the `[TMS_TOOL]` commands below. In Modality jira-native, load `/acli` instead and map test-execution operations to native Jira issues (see `test-documentation/references/jira-setup.md`).

A regression run maps to Jira items (no Story custom field exists at this altitude). The default pair is RTP + RTR; the STP + STR pair applies only to the sprint-close run.

- **RTP** (Regression Test Plan): a Test Plan item titled `RTP: {{PROJECT_KEY}}: Regression Test Plan`, parent QA Master Test Plan (`qa.qa_epics.master_test_plan_epic.name`). Producer: `/test-documentation` (promotion of `regression-candidate` TCs). This skill only consumes it as the RTR's `testPlan` target and never writes into it or creates it. An Xray Test Plan aggregates the latest status of each Test across Executions, so the RTP answers "is the regression suite green" as RTRs accumulate (`test-documentation/references/xray-platform.md` §4).
- **RTR** (Regression Test Results): a Test Execution item titled `RTR: <<SCOPE_ID>>: Regression Testing` (for example `RTR: staging-2026-09-23: Regression Testing`, or `RTR: v2.3.0-rc1: Regression Testing` for a release candidate), parent QA Test Artifacts (`qa.qa_epics.test_artifacts_epic.name`), `testPlan` to RTP, Test Environment and `assignee` = self at create. Producer: this skill, Phase 1, before the trigger (§Create the RTR). It is the CI import target: the `execution_key` dispatch input carries its key, and the `STP_EXECUTION_KEY` secret (name kept for downstream repos) is only the fallback for a scheduled run no dispatcher minted a key for. One RTR per verdict: an ENVIRONMENT re-run before the verdict imports into the same RTR, while a re-run after a verdict (a NO-GO fixed and retried) is a new RTR with a `#2` scope-id.
- **STP + STR** (sprint close only): `STP: Sprint#{N}: {sprint objective}` (Test Plan, parent QA Master Test Plan, `relates to` the Sprint; producer `/sprint-testing`, whose Session Start find-or-creates it on the sprint's first ticket; this skill find-or-creates it only as a fallback and never writes results into it) and `STR: Sprint#{N}: Regression Testing` (Test Execution, parent QA Test Artifacts, `relates to` the Sprint, `testPlan` to STP AND `testPlan` to RTP, dual membership). The STR is the sprint-close recap of all sprint results: whoever arrives first creates it and the other completes it (`/sprint-testing`'s batch close, or this skill when it runs the closing regression). A regular regression run during the sprint is an RTR, never the STR.

`N` is a sprint-close concern only. When the run is the sprint close, it comes from the user or from the `Sprint#{N}` scope-id of the STP this skill finds. A guessed `N` forks a duplicate STP/STR pair, so with no STP and no `N`, ask before creating anything at sprint altitude.

**Environment gate.** Every Test Execution this skill creates (the RTR, and the STR at sprint close) carries the Test Environment from `active_env` in `.agents/project.yaml`, set at create time. Write no results into an Execution until its environment is set.

**Ownership gate.** Every artifact this skill creates (the RTR; at sprint close the STR, and the STP in the fallback case) carries `assignee` = the authenticated session user, set at create time (`agentic-qa-core/references/artifact-lifecycle.md` §2). Xray refuses membership edits on a Test Plan the caller does not own. If the find returns an artifact someone else owns, ask before reassigning it.

**Lifecycle gate** (`agentic-qa-core/references/artifact-lifecycle.md` §1):

- The RTR is born `{{jira.status.test_execution.active}}` in Phase 1 and moves to `{{jira.status.test_execution.close}}` via `{{jira.transition.test_execution.complete}}` after the verdict comment is posted on it: not before, not left open, not reopened (`reactive` stays unused; a later run is a new RTR). The sprint-close STR follows the same rule.
- The RTP, and any Test Plan this skill only consumed, stays at `{{jira.status.test_plan.ready}}`: a suite execution does not finish the plan it ran from, so do not fire `{{jira.transition.test_plan.complete}}` here.
- The STP is closed by whoever owns sprint close. When this skill is the sprint close (see the sprint-close DoD in `stage-gates.md`), `{{jira.transition.test_plan.complete}}` moves it to `{{jira.status.test_plan.completed}}` after the STR is closed.
- An unmapped slug follows the `artifact-lifecycle.md` §4 fallback: list the live transitions, propose the closest synonym in one `AskUserQuestion`, fire the live id on yes, and recommend `bun run jira:sync-workflows`. Do not skip it silently or guess an id.

The RTR already exists when Phase 3 starts (created in Phase 1, imported into by CI through `execution_key`), so Phase 3 writes only what CI did not, posts the verdict and closes it. At sprint close, find the STR first: if `/sprint-testing`'s batch close got there first, this skill only completes it.

```
# Default: the RTR created in Phase 1 (§Create the RTR)
[TMS_TOOL] Update Test Execution:
  executionKey: <<RTR_KEY>>
  results: {per-ATC status + failure comments from Phase 2, only what the CI import did not land}

[ISSUE_TRACKER_TOOL] Add Comment:
  issue: <<RTR_KEY>>
  body: {GO / CAUTION / NO-GO verdict, score, blockers, workflow-run + Allure links}

# After the verdict comment is posted: close the run, never leave it ACTIVE
[ISSUE_TRACKER_TOOL] Transition: {{jira.transition.test_execution.complete}}   # active -> close
  issue: <<RTR_KEY>>

# Sprint close ONLY: the STR is the target instead, with dual plan membership
[TMS_TOOL] Find-or-create Test Execution:
  summary: STR: Sprint#{N}: Regression Testing
  parent: {QA Test Artifacts epic: qa.qa_epics.test_artifacts_epic.name}
  links: {relates to → Sprint; testPlan → STP key; testPlan → RTP key}
  environment: {active_env from .agents/project.yaml}
  assignee: self
  -> then the same Update / Add Comment / Transition sequence on the STR key

# Modality jira-native
RTR: n/a (jira-native has no Test Executions); results = per-Test status writes + [LOCAL] report
[ISSUE_TRACKER_TOOL] Update Test status: {per-Test status field write, one per executed Test;
  the CI leg already did this when AUTO_SYNC is on, so write only what it did not land}
verdict: `.context/reports/regression-{env}-{date}.md` ([LOCAL]) + a comment on the Release issue when one exists
```

### Write the report

Save to `.context/reports/regression-{env}-{date}.md`. The report template is inline below. Open `references/failure-classification.md` only for the pattern catalogue.

---

## Report template

```markdown
# Regression Quality Report — {env} — {date}

## Executive Summary
**Verdict: {GO / CAUTION / NO-GO}**
Score: {score}/10. {one-line rationale}

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Pass Rate | {x}% | >= 95% | {ok/warn/fail} |
| Regressions | {n} | 0 | {ok/warn/fail} |
| Critical failures | {n} | 0 | {ok/warn/fail} |
| Flaky | {n} | <= 3 | {ok/warn/fail} |
| Duration | {d} | - | - |

## Release Blockers
{if NO-GO, enumerate regressions with severity, owner, ETA. Otherwise: "None."}

## Failure Details
### Regressions ({n})
  - {test} | {atc_id} | last passed {date} | [issue]({url}) | probable cause: {...}

### Flaky ({n}) — schedule stabilization
### Known Issues ({n}) — accepted
### Known-Blocked ({n}) — excluded from gating pass-rate
  - {test} | {atc_id} | blocked by [{BUG-KEY}]({url})
### Environment ({n}) — re-run after infra check

## Trend (last 5 runs)
{ASCII sparkline or pass-rate table}

## Links
- Workflow run: {url}
- Allure: {url}
- Created issues: {list}
- TMS execution: RTR: {key} (testPlan → RTP {key}) | STR: {key} (sprint close, testPlan → STP + RTP) | n/a (jira-native, stated skip)

## Recommendations
1. Immediate (pre-release): {...}
2. Short-term (this sprint): {...}
3. Long-term (tech debt): {...}
```

### Post-decision actions

| Decision | Actions |
|----------|---------|
| GO | Mark release candidate approved; schedule post-deploy smoke |
| CAUTION | Review with team lead; document accepted risks; proceed deliberately |
| NO-GO | Block release; assign regression issues; schedule fix verification; plan re-run |

Whatever the verdict, close the run record as the lifecycle gate describes, then run the light stage verifier (`agentic-qa-core/references/artifact-lifecycle.md` §5). Stage-specific lines:

```
[ ] RTR exists by KEY and existed BEFORE the CI trigger (its key went out as execution_key)
[ ] RTR carries its Test Environment (active_env), assignee = self, parent QA Test Artifacts
[ ] RTR -> RTP linked via the `testPlan` edge (a missing RTP is a STATED N/A naming the promotion gap)
[ ] Verdict comment posted ON the RTR (the durable record, not the local report file)
[ ] RTR at {{jira.status.test_execution.close}} via complete, AFTER the verdict; never reactive
[ ] Sprint close only: STR exists by KEY, testPlan -> STP AND -> RTP, closed after the sprint-close verdict
[ ] RTP untouched at {{jira.status.test_plan.ready}} (a regression run never completes it)
[ ] Modality jira-native: the RTR line is the stated skip note; per-Test status writes landed; [LOCAL] report written
[ ] Any unmapped slug went through the §4 fallback (asked), never a silent skip
```

### Waiting points and who holds them

Phase 3 waits for a person at four points: the sprint number when no STP is found, reassigning an artifact someone else owns, the unmapped-slug question, and the CAUTION review. `agentic-qa-core/references/decision-protocol.md` says which reach a person at all. When one does:

| Case | What happens |
|------|--------------|
| A person is present | Ask, as written above. |
| A supervised worker | The conductor or launcher holds the gate; the worker reports the question and waits. |
| A routine with nobody | The delegating brief is the approval source when it covers the decision. Without one, do the reversible work (analysis, local report, classification), stop before any outward or irreversible action (Jira writes, filing, transitions, messages) and report what is waiting. The CAUTION review is always a person's: report it as pending. |

### Per-phase progress + Archive

After Phase 1 Monitor returns, after each Phase 2 step and after the Phase 3 Verdict, the orchestrator appends a phase entry to `.session/regression-testing/<scope>/progress.md` per `agentic-qa-core/references/session-management.md` §7. `artifacts_touched` records the downloaded CI artifacts (allure, evidence and playwright dirs) and the final `.context/reports/regression-<env>-<date>.md`.

After the Verdict emits, the orchestrator runs Archive per `agentic-qa-core/references/session-management.md` §8: it moves `.session/regression-testing/<scope>/` to `.session/.archive/<YYYY-MM-DD>-regression-testing-<scope>/` (two-file dir preserved) and calls `mem_session_summary` with the archive path. `.context/reports/regression-<env>-<date>.md` stays in the reports dir as gitignored `[LOCAL]` output (`.context/reports/README.md`): it exists only on the machine that ran the suite, so nothing downstream may depend on it. The durable record is the RTR in the TMS (the STR only at sprint close) plus the verdict comment posted on it. Modality jira-native: the per-Test status writes plus this `[LOCAL]` report, by stated skip.

On a NO-GO with regressions still being filed as issues, archive waits until issue creation completes, so the session state still references the open issue list at archive time.

---

## Gotchas

- The Allure URL is predictable but only live after the "Build & Deploy Allure Report" job succeeds. If that job failed, the URL 404s: analyze from the downloaded artifacts.
- `gh run watch` can time out on long suites. Fall back to polling `gh run view <RUN_ID> --json status` every 60-90 seconds.
- `gh run view --log` is often over 50MB on large suites. Use `--log-failed` during analysis and `--job=<JOB_ID> --log` for a drilldown.
- This repo ships `retries: 0` everywhere (`playwright.config.ts`), because a retry would only mask a flake. A flaky test surfaces as a plain intermittent failure and is caught by the >20% history rule. If a downstream project has consciously enabled retries, a test that passes on retry is still flaky, and the report states the retry count. See the "Conscious divergence: enabling retries" box in `references/ci-cd-integration.md` for how to read retry counts in Allure.
- `ECONNREFUSED` to your app's own API probably means the app crashed, not an infra glitch (the ENVIRONMENT evidence rule above).
- Flakiness needs 5 runs of history before it can be called at all, and the failure rate is computed over the last N = min(10, available) runs (`references/failure-classification.md`): 5 is the floor for any signal, 10 is the window the percentage uses.
- A suppressed test needs a tracking issue. A failure is KNOWN ISSUE only with a Jira ticket that predates the run (the citation in the Step 4 table); a suppression with no ticket is REGRESSION.
- Sanity plus `grep` and `test_file` are mutually exclusive. Passing both makes the workflow ignore one silently, so pick one.
- Video recording inflates artifact size by 5-10x: enable `video_record=true` only to debug flakiness or capture bug evidence, never for nightly regression.
- CI credentials come from GitHub secrets, not `.env`. Reference `${{ secrets.NAME }}` in workflow YAML and never copy values from a local `.env`.
- The session is not closed until the two chat-facing blocks from `../agentic-qa-core/references/session-footer-contract.md` are printed: the consolidated screenshot list (repo-relative paths, verified on disk, bug annotations first, each capture's path surfaced the moment it lands) and the Session Footer listing the skills, MCPs and CLIs actually used and the testing levels touched, with an explicit "none" for expected-but-untouched levels. Framing for this skill: execution. With several subagents, each stage report carries the five footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `testing_levels_touched`, `screenshots_captured`) and the orchestrator compiles the footer once at close. It goes in chat only, never in a Jira comment or ATR body. Lessons noticed during the session are proposed to `.session/<skill-slug>/<scope>/refinements.md` and never applied to a live skill, per `../agentic-qa-core/references/skill-refinement-protocol.md`; the footer's `Refinements proposed:` line counts them.

---

## Specific tasks

- Configuring or debugging GitHub Actions workflows: read `references/ci-cd-integration.md`.
- Enabling GitHub Pages so the published Allure reports are browsable (a 404 report URL, "publish the reports site"): read `references/github-pages-setup.md` (enable via `gh api`, the first-build stuck/errored gotcha and manual rebuild, the gh-pages history squash job). Run the §Allure version-currency check first.
- Making CI reports private (login-protected, no public evidence): read `references/private-hosting-setup.md` (Test Report Portal: Vercel + Supabase + private R2, work-email login, portal-side retention, history round-trip replacing gh-pages). The publish step in all three suite workflows is already dual-mode, so you only wire secrets. GitHub Enterprise orgs have a zero-infra shortcut (Pages visibility set to Private): offer it first.
- Setting up Allure locally for the first time, or the user asks whether Allure is up to date: run the §Allure version-currency check under §Local reporting.
- Classifying a borderline failure (REGRESSION vs FLAKY vs ENVIRONMENT): read `references/failure-classification.md`.
- TMS or Xray result import: load `/xray-cli`.
- Downloading traces or screenshots for a failure: use `[AUTOMATION_TOOL]` per AGENTS.md Tool Resolution, and load `/playwright-cli` for Playwright trace inspection.
- The session contract (Phase 0 resume, plan.md/progress.md schemas, archive policy, Engram per-phase checkpoint, RUN_ID re-attach mechanism): read `../agentic-qa-core/references/session-management.md`. This skill produces `session/regression-testing/<scope>/...` topic keys.

---

## Quick reference

```bash
# Trigger + get run ID in one shot (RTR_KEY = the Execution created in Phase 1 §Create the RTR)
gh workflow run regression.yml -f environment=staging -f execution_key=$RTR_KEY && sleep 5 && \
  RUN_ID=$(gh run list --workflow=regression.yml --limit=1 --json databaseId -q '.[0].databaseId') && \
  echo "RUN_ID=$RUN_ID"

# Wait for completion
gh run watch $RUN_ID

# Failed logs only
gh run view $RUN_ID --log-failed

# All failure evidence
gh run download $RUN_ID -n e2e-failure-evidence -D ./analysis/evidence/

# Previous run for trend
PREV=$(gh run list --workflow=regression.yml --limit=2 --json databaseId -q '.[1].databaseId')
gh run download $PREV -n merged-allure-results-staging -D ./analysis/previous/
```
