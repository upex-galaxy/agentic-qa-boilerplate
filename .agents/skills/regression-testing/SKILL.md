---
name: regression-testing
description: "Execute regression test suites via CI/CD, analyze results, classify failures, and produce GO/NO-GO release decisions. Use when running regression, smoke, or sanity suites through GitHub Actions, monitoring workflow runs, downloading Allure or Playwright artifacts, classifying failures (REGRESSION vs FLAKY vs KNOWN vs ENVIRONMENT vs NEW TEST), computing pass-rate and trend metrics, deciding release readiness, generating executive quality reports, or creating regression issues. Triggers on: run regression, trigger test workflow, analyze test results, quality report, GO/NO-GO decision, release readiness, flaky tests, Allure report, smoke suite, pass rate, nightly test failure, stage 6. Do NOT use for writing new regression tests (that belongs to test-automation) or for manual fix verification (that belongs to sprint-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [testing-e2e, ci-cd]
metadata:
  kind: workflow
---

## Forbidden invocations

**NEVER invoke `/sdd-*` skills from this workflow.** SDD is an optional
user-installed ceremony; this skill ships self-contained and does not chain
SDD under any condition. If you need to refactor KATA, fixtures, cli/,
scripts/, or api/schemas/ pipeline, exit this skill first and invoke
`/framework-development` — which itself runs Plan → Code → Verify → Archive
natively (no SDD required).

This boundary is mechanical, not advisory: `scripts/lint-skills.ts` rejects
any `/sdd-` mention outside this section. See:
`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4
(governs users who manually install SDD).

# Regression Testing — Execute, Analyze, Decide

Orchestrates the full release-readiness pipeline: trigger a CI suite, monitor it to completion, classify failures, score against release criteria, and emit a GO / CAUTION / NO-GO verdict plus a stakeholder report.

Three phases, always in this order: **Execute → Analyze → Report**. Do not skip analysis and jump to a report. Do not guess classification without reading failure logs.

---

## Compact Rules

- DO: run Execute → Analyze → Report in that order. Never skip analysis and jump to a report, and never classify a failure without reading its logs.
- DO: clear the readiness preflight before triggering anything — `gh` authenticated, the suite's workflow file present, GitHub Actions secrets set, Allure resolvable, active env confirmed. A 20-60 minute run that 401s mid-way is the expensive failure.
- DO: persist `RUN_ID` the moment the trigger returns, before anything else. Resume re-attaches to a live run instead of re-triggering CI; a trigger that landed without the id saved costs the whole run again.
- DO NOT: mark a failure REGRESSION without checking its history first — the single most common misclassification. A first-ever failure with no history is NEW TEST, unverified, not a regression.
- DO: classify every failure into exactly one of KNOWN-BLOCKED / KNOWN ISSUE / ENVIRONMENT / NEW TEST / FLAKY / REGRESSION, and assess severity on a separate axis — a FLAKY test on checkout is still CRITICAL.
- DO: exclude `@blocked:{BUG-KEY}` tests from the gating pass-rate and report their count with each blocking key. They are parked behind an already-filed bug: never REGRESSION, and never a new bug.
- DO NOT: use ENVIRONMENT as a scapegoat. Many unrelated tests failing on one host is environment; one test failing on an endpoint other tests reach fine is more likely a REGRESSION.
- DO NOT: call a test flaky on fewer than 5 runs of history — mark "insufficient history" and re-evaluate rather than guessing.
- DO NOT: emit GO while any REGRESSION-class failure stands. Hard vetoes regardless of score: any `@critical` test failing, any HIGH/CRITICAL-severity regression, or a pass rate below 90%.
- DO: file only CONFIRMED product failures — the REGRESSION class, plus a NEW TEST failure once manually confirmed to be a real defect. FLAKY, ENVIRONMENT and KNOWN ISSUE get no issue at all. Triage decides WHETHER to file; the defect-management doctrine decides the type and the fields.
- DO NOT: open a GitHub issue for a quality failure. It is filed in the issue tracker, parented to the QA Defect Management process epic and linked to the source Story — never to a product or dev epic.
- DO: create the RTR (Regression Test Results, a Test Execution: `RTR: {scope-id}: Regression Testing`, parent QA Test Artifacts, Test Environment set, assignee self, `testPlan` → RTP) BEFORE triggering CI, persist its key beside `RUN_ID`, and pass it as the `execution_key` dispatch input. One RTR per verdict. The STR is created or completed ONLY when the run is the sprint close (then it links to both the STP and the RTP).
- DO NOT: import a regular regression run into the sprint STR, and never let smoke or sanity write into a regression execution: they import only when an execution key is passed explicitly.
- DO: close the RTR (or the sprint-close STR) via `complete` only AFTER the verdict comment is posted on it, and leave the RTP at its ready status: a suite run never completes the plan it ran from.
- DO NOT: invent a sprint number. The RTR needs none (its scope-id is `{env}-{YYYY-MM-DD}` or a release tag). `N` matters only for the sprint-close STR: take it from the user or from the STP's own scope-id, and ask before creating anything at sprint altitude.
- DO NOT: skip the artifact download on a red build (evidence vanishes after the retention window), and never merge smoke and regression results into one pass-rate — their SLOs differ.

**Read full SKILL.md when**: driving the CI commands, applying the GO/CAUTION/NO-GO scoring table, resolving a borderline classification, wiring the TMS artifacts, or writing the report.

---

## Inputs

- `.github/workflows/*.yml` — workflow files for regression / smoke / sanity suites; defines triggers, inputs, and artifact uploads. **LOAD `/github-actions-docs` before editing or diagnosing one**: Actions syntax (matrix, `needs`, reusable workflows, artifact retention, permissions) is the part of this skill's surface that changes upstream without telling anyone, and a guessed key fails at runner start with a message that points nowhere. Reading one does not need it; changing one does.
- `.context/master-test-plan.md` — regression Epic key + expected pass-rate SLOs per suite.
- `playwright.config.ts` — reporter config, retry policy, project matrix; needed to interpret retry counts and shard splits.
- Previous run's Allure report (artifact URL or local download under `./analysis/previous/`) — baseline for trend computation.
- `kata-manifest.json` — registry of tests and ATCs available; used to cross-reference failed test IDs.
- `.agents/jira-required.yaml` — Jira refs (project key, work types, transitions) for filing regression issues.
- `agentic-qa-core/references/defect-management-doctrine.md` — **canonical authority** for classifying (Bug/Defect/Improvement), the mandatory field matrix, QA-Assignee ownership, and the QA process epic when a confirmed regression is filed in Jira (Phase 3). Read BEFORE filing any defect.
- **RTP key** (`RTP: {{PROJECT_KEY}}: Regression Test Plan`, a Test Plan item parented to QA Master Test Plan): found by title via `[TMS_TOOL]` in Phase 1, it is the RTR's `testPlan` target. Producer: `/test-documentation` (promotion of `regression-candidate` TCs); this skill never creates it and never writes into it. Modality jira-native: there is no Test Plan item, the promotion is the `regression-candidate` label on the Test issues, so there is no key to resolve.
- **RTR** (`RTR: <<SCOPE_ID>>: Regression Testing`, a Test Execution parented to QA Test Artifacts): the run record this skill CREATES in Phase 1 before the trigger, CI imports into, and Phase 3 closes after the verdict. One per verdict. Its key is persisted beside `RUN_ID` in `plan.md` and passed to CI as the `execution_key` dispatch input.
- `agentic-qa-core/references/artifact-lifecycle.md` — **canonical authority** for artifact statuses: the RTR (or the sprint-close STR) closes at `{{jira.status.test_execution.close}}` after the verdict, the RTP stays at `{{jira.status.test_plan.ready}}`, every created artifact carries `assignee` = self, and an unmapped transition slug goes through the §4 fallback instead of a silent skip. Read BEFORE firing any transition.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional. The orchestrator also applies the per-stage **Definition-of-Done gates** in `agentic-qa-core/references/stage-gates.md`: verify a stage's DoD BEFORE recording its progress checkpoint and advancing.

This skill is **per-run scope**: `<scope>` = `<env>-<YYYY-MM-DD>` (e.g. `staging-2026-05-20`). Session state lives at `.session/regression-testing/<scope>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. The single highest-value resume case: if the Monitor subagent dies while watching a long CI run but `RUN_ID` was captured in `plan.md`, Phase 0 re-attaches via `gh run view <RUN_ID>` instead of re-triggering CI (saves 20–60 min of wall-clock).

This skill is compliant with the doctrine in `AGENTS.md` §"Orchestration Mode (Subagent Strategy)" and the session contract in `.agents/skills/agentic-qa-core/references/session-management.md`. Every dispatch follows the 7-component briefing format defined in `.agents/skills/agentic-qa-core/references/briefing-template.md`, and the pattern selected per stage matches the decision guide in `.agents/skills/agentic-qa-core/references/dispatch-patterns.md`. The two CI-bound stages (long-running watch, multi-artifact download) and the high-volume failure classification step are the hotspots — everything else stays inline because the dispatch overhead is not justified.

| Stage                                                      | Pattern    | Subagent role                                                                                                  |
|------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------------------------|
| Trigger workflow (`gh workflow run`)                       | Single     | inline — no dispatch needed (one shell call)                                                                   |
| Wait/monitor `gh run watch`                                | Background | one Monitor subagent runs the watch; main thread continues with prep work; subagent notifies on exit           |
| Download 3 artifacts (allure / evidence / playwright)      | Parallel   | 3 simultaneous subagents, one per artifact; cap = 3 (no rate-limit risk)                                       |
| Classify failures (chunks of ~10 tests each)               | Parallel   | N subagents based on failure volume; cap = 10 to avoid context dilution                                        |
| Compute metrics (pass-rate, trends)                        | Single     | inline — needs aggregated state, low cost                                                                      |
| Generate executive report                                  | Single     | inline — final synthesis, decisions live here                                                                  |
| GO / CAUTION / NO-GO verdict                               | Single     | inline — main thread owns release decisions                                                                    |

- **Error protocol**: On any subagent failure: STOP, report full context to user, present retry / skip / abort options. Do NOT auto-fix. See `.agents/skills/agentic-qa-core/references/orchestration-doctrine.md`. A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.

---

## Fleet seam (optional)

Triage itself is never parallelized across sessions: one conductor reads the run, classifies, and owns the verdict. The seam is for what comes AFTER Phase 2, when the classification leaves several **independent failure clusters** that each need code — and only when the user asks for them to be worked at once.

- **Topology: one worktree per failure cluster.** A cluster's fix is code (a spec, a locator, a fixture), so each worker gets its own checkout and its own branch; two sessions in one checkout contend on the git index even on disjoint files. One cluster = one worker = one branch. Never two workers on one cluster.
- The conductor writes `launch.txt` in `.session/regression-testing/<scope>/` — one self-contained line per cluster — **always**, whether or not any orchestration transport exists on the machine. Launching, supervising and closing those sessions is `orca-orchestration/SKILL.md` (`[ORCHESTRATION_TOOL]`): supervised launch is the native path, and `launch.txt` is the payload for the human-paste fallback when nothing can launch it.
- **The verdict never moves.** GO / CAUTION / NO-GO, the metrics, the RTR (or the sprint-close STR) and every Jira write stay with the conductor (Phase 3). A worker fixes its cluster and reports; it does not re-score the run, does not file the defect, and does not transition the RTR.
- Each worker's fix is authored under `/test-automation` (Plan → Code → Review) on its own branch, and lands per `git_strategy` — a regression fix is not exempt from the automation gate.
- **Silence rule**: the absence of an orchestration transport is never named to the user, never appears in the preflight gate, and never appears in the Environment block or the report.

---

## Readiness Preflight Gate (MANDATORY — runs before Phase 0)

> Full doctrine: `agentic-qa-core/references/preflight-gate.md`. Runs FIRST, before the resume check and any `gh workflow run`. Two laws: (1) **args-as-answers** — the suite (regression/smoke/sanity), env, and any grep/test_file are provided args; ask only the gaps. (2) **probe, don't assume**. Surface gaps + REDs as ONE `AskUserQuestion` checklist; self-fix with approval + explanation; STOP on any blocking RED. This generalizes the Phase 1 §Preflight (`gh auth`) to a full readiness check pulled to t=0. **Generic baseline** (env resolution, secret/restart handling, the two laws, output contract) is inherited from the reference §3.1 — not repeated here. Below is only this skill's **specific capability delta** (note: test-user creds, MCPs and browsers live inside the CI runner, not the orchestrator).

| Capability | Need | Why here |
|---|---|---|
| GitHub CLI authenticated | REQUIRED | Every stage drives CI via `gh` (`gh auth status`, `gh workflow run`, `gh run watch`, `gh run download`). Not authed → user runs `gh auth login` (suggest the `!` prefix); do not proceed. |
| Workflow files present | REQUIRED | `.github/workflows/` must hold the regression/smoke/sanity workflow for the chosen suite, with the inputs this skill passes. |
| GitHub Actions Secrets/Variables | REQUIRED | The runner authenticates with env-prefixed creds (`secrets.<ENV>_USER_EMAIL` / `_PASSWORD`) + `XRAY_*` / `ATLASSIAN_*` as Repository/Environment Secrets — the suite 401s mid-run without them. `gh secret list` (add `--env <env>` for environment scope) shows them; missing → `gh secret set <NAME>` from `.env`. `/adapt-framework` only emits a manual list today, so this is the most common silent gap. |
| Allure 3 local | REQUIRED | `bunx allure` resolves (devDep, no global install); `allurerc.mjs` present for `bun allure:agent` markdown triage. |
| Active env | REQUIRED | The suite runs against `<<ACTIVE_ENV>>` (default `{{DEFAULT_ENV}}`). Confirm it is the intended target before a 20–60 min run. |
| `[TMS_TOOL]` (result sync) | OPTIONAL | Only when `.agents/project.yaml` `testing.tms_cli` is set: Phase 1 creates the RTR before the trigger, Phase 3 posts the verdict on it and closes it. jira-xray → `/xray-cli` + `XRAY_*`. |
| `[ISSUE_TRACKER_TOOL]` (file regression issues) | OPTIONAL | Only on NO-GO / CAUTION-with-regressions, to file issues. Load `/acli` then. |

Test-user creds, OpenAPI/`API_TOKEN`, DBHub and Playwright browsers live **inside the CI runner**, not the orchestrator — this skill does not exercise them locally, so they are out of scope for this gate. After the gate clears (all REQUIRED GREEN), continue to Phase 0 below.

---

## Phase 0 — Session resume check (MANDATORY, inline)

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

## When to run each suite

| Suite | Workflow file | Duration | Use when |
|-------|---------------|----------|----------|
| `regression` | `regression.yml` | 20-60 min | Pre-release validation, nightly full run |
| `smoke` | `smoke.yml` | 2-5 min | Post-deploy health check, `@critical` only |
| `sanity` | `sanity.yml` | 1-10 min | Validate one feature / one file / one grep pattern |

If the user says "run regression" with no qualifier, default to `regression` on `{{DEFAULT_ENV}}`. If they say "smoke" or "critical only", use `smoke`. If they specify a file, grep, or single feature, use `sanity`.

---

## Local reporting (Allure 3, no global install)

Allure 3 is a devDep — `bunx allure` resolves to the local `node_modules/.bin/allure`, no `brew install allure` / `scoop install allure` required. Configuration lives at `allurerc.mjs`, single-plugin BY DESIGN: with only the **Awesome** plugin the generated `index.html` IS the report (no card-chooser landing), and its top-left mode dropdown covers everything — **Report** (drill-down, tag filters), **Graphs** (complete executive chart set: status, dynamics, severities, stability, testing pyramid, durations…), **Timeline**. Never add `plugin-dashboard` instances — they duplicate Graphs with fewer charts and bring back the landing screen (rationale in `allurerc.mjs` comments). Trend charts are fed by `historyPath: ./.allure/history.jsonl` and populate from the 2nd run onward.

| Use case | Script | Underlying command |
|---|---|---|
| Run tests + auto-generate report (human review) | `bun allure:run` | `bunx allure run -- bun test` |
| Run tests + emit markdown for AI review | `bun allure:agent` | `bunx allure agent -- bun test` |
| Generate report from existing `./allure-results` | `bun allure:generate` | `bunx allure generate ./allure-results` |
| Serve last generated report locally | `bun allure:open` | `bunx allure open` |
| Live-refresh report during iterative dev | `bun allure:watch` | `bunx allure watch ./allure-results` |

`bun allure:agent` is the AI-friendly entry point: it produces a markdown summary the orchestrator (or a Verifier subagent) can read directly without parsing HTML. Use it whenever you need a structured pass/fail breakdown after a local re-run while triaging a CI failure (Phase 2 step 1, before downloading the merged-allure-results artifact from CI).

CI artifacts (`merged-allure-results-{env}`) are still produced by the workflow and downloaded via `gh run download` as documented in Phase 2. The published GitHub Pages reports are generated by `scripts/ci/publish-allure-pages.ts` with the SAME `allurerc.mjs` and `allure` devDep as local runs — the `/{env}/{suite}/` URL redirects straight into the latest run's Awesome report (Report | Graphs | Timeline), with per-suite trend history and last-10-runs retention.

### Allure version-currency check (MANDATORY during any Allure/Pages setup)

The boilerplate pins `allure` / `allure-playwright` / `allure-js-commons` at scaffold time, so by the time someone installs the repo and runs this setup they are usually behind upstream. Whenever this skill performs **Allure setup** (first local report, preflight RED on the "Allure 3 local" row) or **GitHub Pages setup** (`references/github-pages-setup.md`), run this check FIRST:

1. `npm view allure version && npm view allure-playwright version` → compare against `package.json`.
2. **Same major behind** → summarize the news for the user (release notes: `gh api repos/allure-framework/allure3/releases`), then offer `bun update allure allure-playwright allure-js-commons` (or bump the `^` ranges + `bun install`). Keep `allure-js-commons` in lockstep with `allure-playwright` (it is imported directly by `tests/components/TestFixture.ts` for the `layer` auto-label).
3. **New major available** → NEVER upgrade silently. Present breaking changes and wait for explicit user approval.
4. **Config-currency (older scaffolds)** — `bun run update` syncs skills and appends new devDeps, but it NEVER overwrites `allurerc.mjs` or `tests/components/TestFixture.ts` (project-adapted files). If the local `allurerc.mjs` predates the current template (no `historyPath`, no `categories`, or stale `plugin-dashboard` instances), OFFER to migrate it: fetch the boilerplate's current `allurerc.mjs` as reference (`https://raw.githubusercontent.com/upex-galaxy/agentic-qa-boilerplate/main/allurerc.mjs`), preserve the project's `name`, and port the config. Same for the `_allureLayer` auto-fixture in `TestFixture.ts` (feeds the testingPyramid + durations-by-layer charts in Awesome's Graphs tab) — without it those charts render empty. Never overwrite silently; show the diff and wait for approval.
5. After any bump: `bun allure:generate` from existing results (or a sandbox run) and confirm the report renders — the root `index.html` must open the Awesome report directly, with the Report | Graphs | Timeline mode dropdown working.

Known gotchas to preserve on upgrade (context in `allurerc.mjs` comments):
- Dashboard chart `type` values must match `ChartType` in `@allurereport/charts-api` — the plugin README's `trend`/`pie` examples are stale and yield an empty dashboard (404 on `widgets/charts.json`).
- `historyPath` must stay OUTSIDE `allure-report/` (`./.allure/history.jsonl`) or `test:clean` erases trend history.
- Multiple instances of one plugin need an explicit `import:` field — a custom key alone does not resolve (relevant only if a project deliberately adds extra report views).

---

## Phase 1 — Execute

### Preflight (always)

```bash
gh auth status
gh repo view --json name,owner
gh workflow list
```

If `gh` is not authenticated, stop and ask the user to run `gh auth login`. Do not proceed.

**Write `.session/regression-testing/<scope>/plan.md`** per `agentic-qa-core/references/session-management.md` §6 BEFORE the Trigger step below. Capture: Goal (suite + env + reason for run), Inputs (workflow file path, env vars, optional grep/test_file for sanity), Approach (subagent pattern per stage from the dispatch table above), Phase breakdown (Trigger → Monitor → Download → Classify → Compute → Report → Verdict), Risks, Verification checklist (all 3 artifacts download + verdict emitted), Cross-references (`.context/reports/regression-<env>-<date>.md` will hold the final verdict). `RTR_KEY` lands in `plan.md` §Inputs after the Create-the-RTR step below, and `RUN_ID` joins it AFTER the Trigger step captures it — append, do not rewrite the body.

### Create the RTR (before the trigger)

The run record is born BEFORE CI starts, so the workflow receives its key and imports into it instead of into a shared secret. `<<SCOPE_ID>>` = `<<ACTIVE_ENV>>-<YYYY-MM-DD>` (the same value as the session `<scope>`), or the release tag (e.g. `v2.3.0-rc1`) when the user says the run is a release candidate. Regression suite only: smoke and sanity get no RTR (see the Trigger block).

1. **Resolve the RTP**: find the Test Plan titled `RTP: {{PROJECT_KEY}}: Regression Test Plan`. Missing → do NOT create it here (the RTP is `/test-documentation`'s promotion artifact): create the RTR without the `testPlan` edge, record the gap as a stated N/A in the verifier and the report, and recommend running the promotion first.
2. **Find-or-create the RTR**. A same-scope RTR still `{{jira.status.test_execution.active}}` (no verdict yet: an ENVIRONMENT re-run, a resumed session) is REUSED. A same-scope RTR already `{{jira.status.test_execution.close}}` (verdict written) means this is a NEW run: append `#2` (then `#3`) to the scope-id. Never reopen a closed RTR (`reactive` stays unused).
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

**Sprint-close variant.** When the user says this run IS the sprint close, the target is the STR instead of an RTR: find-or-create `STR: Sprint#{N}: Regression Testing` per the existing contract (§TMS sync: parent QA Test Artifacts, Test Environment, assignee self, `testPlan` → STP AND `testPlan` → RTP, dual membership), persist its key in the same `plan.md` slot, and pass it as `execution_key` the same way. `N` comes from the user or from the STP's scope-id, never invented.

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

Store as `RUN_ID`. Every subsequent step uses it.

**Progress checkpoint after Trigger**: append `RUN_ID` to `.session/regression-testing/<scope>/plan.md` §Inputs (so resume can re-attach) AND append a phase entry `## Phase 1.Trigger — <ts>` with `status: completed`, `next: Phase 1.Monitor`, `notes: RUN_ID=<value> RTR_KEY=<value>` to `progress.md`. This is the critical persistence point — Trigger landing without `RUN_ID` persisted means resume cannot re-attach, and without `RTR_KEY` a resumed session cannot tell which Execution CI imported into.

### Monitor to completion

Use the dispatch defined in §Subagent Dispatch Strategy: **Background**. Delegate `gh run watch <RUN_ID>` to a Monitor subagent so the main thread is freed to prepare the report scaffold and load the classification rubric. See `references/ci-cd-integration.md` §"Monitoring the workflow run (Background dispatch)" for the full briefing.

Reference command (executed inside the subagent, not inline on the main thread):

```bash
gh run watch <RUN_ID> --exit-status
# Fallback polling (only if gh run watch is unavailable):
gh run view <RUN_ID> --json status,conclusion
# status: queued | in_progress | completed
# conclusion (only when completed): success | failure | cancelled | timed_out
```

Do not start Phase 2 until the Monitor returns `status: completed`.

### Output of Phase 1

A short execution summary with: workflow name, run ID, environment, duration, conclusion, per-job status, artifact list, and the Allure URL pattern `https://{owner}.github.io/{repo}/{environment}/{suite}/`.

Read `references/ci-cd-integration.md` when configuring new workflows, debugging CI-only failures, tuning sharding / retries / timeouts, or wiring up secrets and variables.

---

## Phase 2 — Analyze

### Step 1: Collect data

Use the dispatch defined in §Subagent Dispatch Strategy: **Parallel** for the three artifact downloads (allure / evidence / playwright). Fan out three subagents in a single tool-call block — each owns one artifact, writes to its own directory, and reports back when its download is verified. The metadata reads (`gh run view`) stay inline because they are short.

Reference commands (the metadata reads run inline; the three `gh run download` calls live inside the parallel subagents):

```bash
# Inline (main thread): full run context
gh run view <RUN_ID> --json status,conclusion,jobs,createdAt,updatedAt,url,headBranch,event,actor

# Inline (main thread): failed logs only (much smaller than --log)
gh run view <RUN_ID> --log-failed

# Inline (main thread): list artifacts so the parallel dispatchers know what to fetch
gh run view <RUN_ID> --json artifacts --jq '.artifacts[].name'

# Parallel subagent A — allure results
gh run download <RUN_ID> -n merged-allure-results-staging -D ./analysis/

# Parallel subagent B — failure evidence (screenshots, traces, videos)
gh run download <RUN_ID> -n e2e-failure-evidence       -D ./analysis/evidence/

# Parallel subagent C — playwright HTML report
gh run download <RUN_ID> -n e2e-playwright-report      -D ./analysis/playwright/
```

Each subagent uses the briefing shape in `agentic-qa-core/references/briefing-template.md` §"Parallel — Download 3 CI artifacts in regression-testing". Cap the fan-out at 3 — there are only ever three artifact streams and GitHub's per-run rate limits are not a concern at that size.

### Step 2: Parse results

Source of truth priority: **Allure results JSON > Playwright `report.json` > raw logs**. Each Allure result has `status`, `statusDetails.message`, `statusDetails.trace`, and `labels[]` (look for `testId` = ATC ID, `suite`, and `severity`).

> **The `suite` label is tag-derived — single source of truth.** Allure suite/grouping labels are NOT a separate taxonomy: they derive from the Playwright tag (`@smoke` / `@regression` / `@e2e` / `@integration` / `@critical`) that also drives CI scope selection. A test tagged `@integration` reports `suite: integration` automatically. So the `suite` you read here is exactly the scope CI ran — never reconcile it against a parallel Allure label set. Convention owner: `test-automation/references/ci-integration.md` §3.2.1.

### Step 3: Compute metrics

| Metric | Formula |
|--------|---------|
| Total | count of results |
| Passed / Failed / Skipped / Broken | count by `status` |
| Pass Rate | `Passed / Total * 100` |
| Duration | `max(stop) - min(start)` |
| Trend | current pass rate − previous run pass rate |

> **Exclude KNOWN-BLOCKED from the gating pass-rate.** Tests classified
> KNOWN-BLOCKED (tagged `@blocked:{BUG-KEY}`, see Step 4) are parked behind an
> already-filed bug — they are NOT regression failures and must not depress the
> pass-rate that drives the GO/NO-GO score. Compute the gating Pass Rate over
> `Total − KNOWN-BLOCKED`, and report the blocked count separately (with each
> `{BUG-KEY}`) so the release decision is not gamed in either direction.

Previous-run comparison requires downloading artifacts of the previous run:

```bash
PREV=$(gh run list --workflow=regression.yml --limit=2 --json databaseId -q '.[1].databaseId')
gh run download $PREV -n merged-allure-results-staging -D ./analysis/previous/
```

### Step 4: Classify every failure

Use the dispatch defined in §Subagent Dispatch Strategy: **Parallel** when the failure list has more than 10 entries. Shard the failures into chunks of ~10 (cap at 10 subagents) and fan out one classification subagent per chunk; merge their JSON reports in the main thread. For ≤10 failures, classify inline (the dispatch overhead is not justified). See `references/failure-classification.md` §"Parallel classification (default for >10 failures)" for the full briefing and merge protocol.

Apply this decision tree to each failed test (whether classified inline or inside a parallel subagent). **Never mark a test REGRESSION without checking history first** — that is the single most common misclassification.

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
  ├── Failure rate > 20% over last 10 runs? ─► FLAKY
  │
  └── Passed in last ≤ 5 runs, now fails? ───► REGRESSION   (release blocker)
```

| Category | Impact | Action |
|----------|--------|--------|
| KNOWN-BLOCKED | LOW | Already tracked by `{BUG-KEY}` — exclude from gating pass-rate, list in report with the blocking bug key. **No new Jira bug** (the marker already names the open bug) |
| REGRESSION | HIGH | Block release, file Jira Bug/Defect (Phase 3 §File defects in Jira, doctrine Part 1), assign |
| FLAKY | MEDIUM | Schedule stabilization, do not block — **no Jira bug** |
| KNOWN ISSUE | LOW | Document against existing ticket, do not block — **no new Jira bug** |
| ENVIRONMENT | MEDIUM | Re-run after infra check — **no Jira bug** |
| NEW TEST | LOW | Manual verification → if a genuine product defect, file Jira Bug/Defect; else accept or fix |

> **KNOWN-BLOCKED — consuming the blocked-test marker.** The `@blocked:{BUG-KEY}`
> tag + `test.fail('Blocked by {BUG-KEY}')` marker is **defined in
> `test-automation`** (`references/automation-standards.md` §7 Stability; the
> `PROGRESS.md` blocked-tests note lives in `references/planning-playbook.md`) —
> this skill only *consumes* it. The GO/NO-GO gate MUST recognize `@blocked:{BUG-KEY}` tests and
> classify them as **KNOWN-BLOCKED, never REGRESSION**: they are deliberately
> parked behind an already-filed bug, not a fresh failure. Exclude them from the
> pass-rate that gates the release (see §Compute metrics), and list each in the
> report under its own heading with the blocking `{BUG-KEY}`. Do NOT file a new
> Jira bug — the marker already names the open one.

> **`sdet` CI-fallback clause** (integration-trunk suites only): an ENVIRONMENT-class red on a Sanity-CI run for a ticket branch may authorize merging **into the integration trunk** — never the final `trunk → main` PR — when proven by BOTH (a) the change passing locally on `local` AND `staging`, and (b) the same red being present independent of the change (nightly already red, or the failing line is shared pre-existing code). File a separate infra/flake ticket and reference it in the PR. This is NOT a relaxation of the GO bar: a REGRESSION-class failure is never eligible, and the final PR to `main` still requires a genuinely green test step. See `.agents/skills/git-flow-master/references/sdet-integration-trunk.md` §CI-fallback clause.

Read `references/failure-classification.md` when: the decision tree is ambiguous, you need the full error-pattern catalogue, you are classifying a borderline case, or you are computing flakiness over historical runs.

### Step 5: Assess severity per failure

Severity is independent of classification. A FLAKY test on the checkout flow is still CRITICAL severity.

| Severity | Criteria |
|----------|----------|
| CRITICAL | Core user journey (login, checkout, payment). Any `@critical` tagged test. |
| HIGH | Major feature (search, profile, dashboard) |
| MEDIUM | Secondary feature (filters, preferences) |
| LOW | Edge case or admin-only path |

### Output of Phase 2

An analysis block with: metrics table, trend delta, one section per failure category (Regressions first, then Flaky, Known, Environment, New), per-failed-test detail (name, ATC ID, suite, error, last-pass date, screenshot link), job summary, and a preliminary verdict.

---

## Phase 3 — Report & Decide

### GO / CAUTION / NO-GO scoring

Compute a weighted score from the analysis. Maximum is 9.

| Factor | +3 | +1 | 0 | -1 | -2 | -3 |
|--------|----|----|---|----|----|----|
| Pass Rate | ≥ 95% | 90–95% | | | < 90% | |
| Regressions | 0 | 1-2 Low | | 1+ Medium | | Any High/Critical |
| Critical tests | All pass | | | | | Any fail |
| Flaky tests | | ≤ 3 | 4-5 | > 5 | | |

**Verdict thresholds:**
- Score **≥ 7** → **GO** — release approved
- Score **4-6** → **CAUTION** — manual review required, document accepted risks
- Score **< 4** → **NO-GO** — block release, fix regressions, re-run

Never auto-GO if: any `@critical` test fails, any REGRESSION with HIGH/CRITICAL severity exists, or pass rate < 90%. These are hard vetoes regardless of score.

### File defects in Jira (when decision = NO-GO or CAUTION with regressions)

> **Quality issues go to Jira, not GitHub.** A regression-discovered product
> failure is a defect-management artifact and follows
> `agentic-qa-core/references/defect-management-doctrine.md` — the same authority
> `/sprint-testing` uses. This skill files the issue IN JIRA with the full
> mandatory field matrix; it does NOT open a GitHub issue.

**Only CONFIRMED real product failures become Jira issues.** Use the Phase 2
Step 4 triage as the gate: file in Jira **only** for the `REGRESSION` class and
for a `NEW TEST` failure once it is manually confirmed to be a genuine product
defect (not a bad assertion). **`FLAKY`, `ENVIRONMENT`, and `KNOWN ISSUE` do NOT
get a Jira bug** — they route to stabilization / infra / the existing ticket as
the classification table already prescribes. The failure-triage classification
and the defect issue-type are **separate axes**: triage decides *whether* to
file; the doctrine decides *what type* and *what fields*.

For each issue that clears the gate:

1. **Classify Bug vs Defect** by the affected feature's lifecycle stage, NOT by
   where the failure ran (doctrine Part 1): the regressed feature is **already
   live above Staging (production / superior env)** → **Bug**; the feature is
   still **pre-release (Staging or below)** → **Defect**. A genuinely new,
   desirable behavior surfaced beyond the AC → **Improvement** (Part 1).
2. **File it in Jira with the full mandatory field matrix** (doctrine Part 5):
   `severity` (impact-based) → `priority` auto-derived (Part 5.1), native
   `components` = affected product module (Part 3, mandatory & pre-existing),
   `root_cause` + `error_type` + `test_environment`, `qa_assignee` = the
   authenticated session user (self; never-overwrite, Part 2), and `evidence`
   (Allure link + failure screenshots/traces/logs from `./analysis/evidence/`).
3. **Parent to the QA Defect Management epic** — the QA process epic
   (`qa.qa_epics.defect_epic.name`), found-or-created; NEVER a product/dev epic
   (Part 4).
4. **Link to the source Story/feature** for traceability via the causal link
   (Part 4) — the regressed ATC's covering Story.
5. **Write via acli/REST** (doctrine Part 6): create with acli
   `workitem create --from-json` (create-time customfields under
   `additionalAttributes.customfield_*`, native `components:[{name}]`); set
   customfields/components on an existing issue via REST `PUT
   /rest/api/3/issue/{KEY}`; `qa_assignee` is read-before-write. Because this
   stage may run **from CI**, **load `/acli` first** (it owns auth, syntax, and
   the REST-PUT pattern in `references/acli-integration.md`).

Run the doctrine's **filing gate** (Part 9) before submitting each issue. Save
the returned Jira key to reference in the report.

### TMS sync (optional, when `[TMS_TOOL]` is configured via `.agents/project.yaml` `testing.tms_cli`)

> **Prerequisite**: Load `/xray-cli` skill (Modality jira-xray) before executing the `[TMS_TOOL]` commands below. In Modality jira-native, load `/acli` instead and map test-execution operations to native Jira issues (see `test-documentation/references/jira-setup.md`).

A regression run maps to Jira **items** (items-first by excellence: no Story custom field exists at this altitude). The default pair is RTP + RTR. The STP + STR pair applies only to the sprint-close run.

- **RTP** (Regression Test Plan): a **Test Plan** item titled `RTP: {{PROJECT_KEY}}: Regression Test Plan`, parent **QA Master Test Plan** (`qa.qa_epics.master_test_plan_epic.name`). **Producer: `/test-documentation`** (promotion of `regression-candidate` TCs). This skill only CONSUMES it as the RTR's `testPlan` target: it is **never written into** and never created here. An Xray Test Plan aggregates the LATEST status of each of its Tests across all Executions, so the RTP answers "is the regression suite green right now" on its own as RTRs accumulate (`test-documentation/references/xray-platform.md` §4).
- **RTR** (Regression Test Results): a **Test Execution** item titled `RTR: <<SCOPE_ID>>: Regression Testing` (e.g. `RTR: staging-2026-09-23: Regression Testing`, or `RTR: v2.3.0-rc1: Regression Testing` for a release candidate), parent **QA Test Artifacts** (`qa.qa_epics.test_artifacts_epic.name`), `testPlan` → RTP, Test Environment + `assignee` = self at create. **Producer: THIS skill**, Phase 1, before the trigger (§Create the RTR). It is the CI import target: the `execution_key` dispatch input carries its key, and the `STP_EXECUTION_KEY` secret (name kept for downstream repos) is only the fallback for a scheduled run that no dispatcher minted a key for. **One RTR per verdict**: an ENVIRONMENT re-run before the verdict imports into the same RTR; a re-run after a verdict (a NO-GO fixed and retried) is a NEW RTR with a `#2` scope-id; never `reactive`.
- **STP + STR** (sprint close ONLY): `STP: Sprint#{N}: {sprint objective}` (Test Plan, parent QA Master Test Plan, `relates to` the Sprint; producer `/sprint-testing`, whose Session Start find-or-creates it on the sprint's first ticket; this skill consumes it and find-or-creates it only as a fallback, never writes results into it) and `STR: Sprint#{N}: Regression Testing` (Test Execution, parent QA Test Artifacts, `relates to` the Sprint, `testPlan` → STP AND `testPlan` → RTP, dual membership). The STR is the sprint-close recap of all sprint results: **whoever arrives first creates it, the other completes it** (`/sprint-testing`'s batch close, or this skill when it runs the closing regression). A regular regression run during the sprint is an RTR, never the STR. The run's term is **Regression Testing**: "Sprint" already comes from the `Sprint#{N}` scope-id.

> **`N` is a sprint-close concern only.** The RTR needs no sprint number. When the run IS the sprint close, `N` comes from the user or from the `Sprint#{N}` scope-id of the STP this skill finds. **Never invent it**: a guessed `N` forks a duplicate STP/STR pair. No STP found and no `N` given → ASK before creating anything at sprint altitude.

**Environment gate**: every Test Execution this skill creates (the RTR, and the STR at sprint close) carries the **Test Environment** taken from `active_env` in `.agents/project.yaml`, set at create time. An Execution without its environment fails the checklist: do not write results into it until the environment is set.

**Ownership gate**: every artifact this skill CREATES (the RTR; at sprint close the STR, and the STP in the fallback case) carries `assignee` = the authenticated session user, set at create time — `agentic-qa-core/references/artifact-lifecycle.md` §2. Xray refuses membership edits on a Test Plan the caller does not own, so an unassigned Plan turns into a blocker the moment tests must be added to it. If the find returns an artifact someone ELSE owns, do not reassign it silently: ask first.

**Lifecycle gate** (`agentic-qa-core/references/artifact-lifecycle.md` §1):

- The **RTR** is born `{{jira.status.test_execution.active}}` in Phase 1 and MUST be transitioned to `{{jira.status.test_execution.close}}` via `{{jira.transition.test_execution.complete}}` **after the GO / CAUTION / NO-GO verdict comment is posted on it**: never before the verdict, never left open, never reopened (`reactive` stays unused; a later run is a new RTR).
- The **STR** (sprint close only) follows the same rule after the sprint-close verdict.
- The **RTP** (and any Test Plan this skill only consumed) stays at `{{jira.status.test_plan.ready}}` and is **never completed** by a regression run: the RTP is long-lived, and a suite execution does not finish the plan it ran from. Do NOT fire `{{jira.transition.test_plan.complete}}` here.
- The **STP** is closed by whoever owns sprint close, not by this skill — unless this skill IS the sprint close (see the sprint-close DoD in `stage-gates.md`), in which case `{{jira.transition.test_plan.complete}}` moves it to `{{jira.status.test_plan.completed}}` after the STR is closed.
- **Unmapped slug** → `artifact-lifecycle.md` §4 fallback: list the LIVE transitions, propose the closest synonym in ONE `AskUserQuestion`, fire the live id on yes, recommend `bun run jira:sync-workflows`. Never skip silently, never guess an id.

**The run record already exists when Phase 3 starts**: the RTR was created in Phase 1 and CI imported into it through `execution_key`, so Phase 3 only writes what CI did not, posts the verdict and closes it. At sprint close, never assume another producer already created the STR; if `/sprint-testing`'s batch close got there first, the find returns its item and this skill only completes it:

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

Save to `.context/reports/regression-{env}-{date}.md`. Use `references/failure-classification.md` only if you need the pattern catalogue; the report template itself is inline below.

---

## Report template

```markdown
# Regression Quality Report — {env} — {date}

## Executive Summary
**Verdict: {GO / CAUTION / NO-GO}**
Score: {score}/9. {one-line rationale}

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

Whatever the verdict, close the run record: post the GO / CAUTION / NO-GO comment ON the RTR (on the STR only when the run is the sprint close), transition it to `{{jira.status.test_execution.close}}` via `{{jira.transition.test_execution.complete}}`, leave the RTP at `{{jira.status.test_plan.ready}}`, then run the **light stage verifier** (`agentic-qa-core/references/artifact-lifecycle.md` §5). Stage-specific lines:

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

### Per-phase progress + Archive

After Phase 1 Monitor returns, after each Phase 2 step (Collect / Parse / Compute / Classify / Severity), and after Phase 3 Verdict, the orchestrator appends a phase entry to `.session/regression-testing/<scope>/progress.md` per `agentic-qa-core/references/session-management.md` §7. `artifacts_touched` records the downloaded CI artifacts (allure / evidence / playwright dirs) + the final `.context/reports/regression-<env>-<date>.md`.

After the Verdict emits, the orchestrator runs Archive per `agentic-qa-core/references/session-management.md` §8: moves `.session/regression-testing/<scope>/` to `.session/.archive/<YYYY-MM-DD>-regression-testing-<scope>/` (two-file dir preserved) and calls `mem_session_summary` with the archive path. `.context/reports/regression-<env>-<date>.md` stays in the reports dir as a **local generated report** — that directory is gitignored `[LOCAL]` output (`.context/reports/README.md`), so the file exists only on the machine that ran the suite and nothing downstream may depend on it. **The durable record is the RTR in the TMS (the STR only at sprint close) plus the GO / CAUTION / NO-GO comment** posted on it. Modality jira-native: the per-Test status writes plus this `[LOCAL]` report, by stated skip.

On Verdict = NO-GO with regressions still being filed as issues, archive WAITS until the issue-creation step completes (so the session state still references the open issue list at archive time).

---

## Gotchas

- **Allure URL is predictable but only live after the "Build & Deploy Allure Report" job succeeds.** If that job failed, the URL 404s — analyze from downloaded artifacts instead.
- **`gh run watch` can time out** on long suites. Fall back to polling `gh run view <RUN_ID> --json status` every 60-90 seconds.
- **`gh run view --log` dumps every step's output** and is often >50MB on large suites. Always prefer `--log-failed` during analysis; use `--job=<JOB_ID> --log` for targeted drilldown.
- **This repo ships `retries: 0` everywhere** (`playwright.config.ts`) — tests must be deterministic, and a retry would only mask the flake. A flaky test therefore surfaces as a plain intermittent failure and is caught by the >20% history rule, never by a retry-pass signal. If a downstream project has consciously enabled retries, a test that passes on retry is still flaky — see the "Conscious divergence: enabling retries" box in `references/ci-cd-integration.md` for how to read retry counts in Allure.
- **ENVIRONMENT is not a scapegoat.** `ECONNREFUSED` to your app's own API probably means the app crashed, not "infra glitch". Check if the same run has many unrelated tests failing on the same host — that is environment. One test failing with a network error on an endpoint that other tests hit successfully is more likely a REGRESSION.
- **Never mark NEW TEST as REGRESSION.** A first-ever failure with no history is not a regression — it is unverified. Manually confirm once before classifying.
- **Flakiness needs 5 runs of history minimum before you can call it at all** (below that, mark "insufficient history" and re-evaluate next sprint — do not guess). The failure-rate itself is computed over a wider window: the last N = min(10, available) runs (see `references/failure-classification.md`). 5 is the floor to have any signal; 10 is the window the percentage is actually computed over.
- **Sanity + `grep` and `test_file` are mutually exclusive.** Passing both makes the workflow ignore one silently. Pick one.
- **Video recording inflates artifact size by 5-10x.** Only enable `video_record=true` when debugging flakiness or capturing bug evidence. Never enable it for nightly regression.
- **CI credentials come from GitHub secrets, not `.env`.** Do not copy values from local `.env` into workflow YAML — reference `${{ secrets.NAME }}` only.
- **Session-footer contract (mandatory at close).** The final phase is not done until the two chat-facing blocks from `../agentic-qa-core/references/session-footer-contract.md` are printed: (1) consolidated screenshot list — repo-relative paths, verified on disk, bug annotations first — plus in-flow surfacing of every capture's path the instant it lands; (2) Session Footer listing skills/MCPs/CLIs actually used + testing levels touched, with explicit "none" entries for expected-but-untouched levels. Framing for this skill: execution. Multi-subagent sessions: each stage report carries the five footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `testing_levels_touched`, `screenshots_captured`); the orchestrator compiles the footer ONCE at close. Chat only — never in a Jira comment or ATR body. Lessons noticed during the session are PROPOSED to `.session/<skill-slug>/<scope>/refinements.md` and never applied to a live skill, per `../agentic-qa-core/references/skill-refinement-protocol.md`; the footer's `Refinements proposed:` line counts them.

---

## Specific tasks

* **Configuring or debugging GitHub Actions workflows** — read `references/ci-cd-integration.md`
* **Enabling GitHub Pages so the published Allure reports are browsable ("set up GitHub Pages", "report URL is 404", "publish the reports site")** — read `references/github-pages-setup.md` (enable via `gh api`, first-build stuck/errored gotcha + manual rebuild, gh-pages history squash job). Run the §Allure version-currency check first.
* **Making CI reports PRIVATE ("reports must be login-protected", "no publiques evidencia pública", "protege los reportes")** — read `references/private-hosting-setup.md` (Test Report Portal: Vercel + Supabase + private R2, work-email login, portal-side retention, history round-trip replacing gh-pages). The publish step in all three suite workflows is already dual-mode — you only wire secrets. GitHub Enterprise orgs have a zero-infra shortcut (Pages visibility → Private); offer it first.
* **Setting up Allure locally for the first time, or the user asks "is Allure up to date?"** — run the §Allure version-currency check under §Local reporting.
* **Classifying a borderline failure (REGRESSION vs FLAKY vs ENVIRONMENT)** — read `references/failure-classification.md`
* **TMS / Xray result import** — load `/xray-cli` skill
* **Downloading traces or screenshots for a failure** — use `[AUTOMATION_TOOL]` per AGENTS.md Tool Resolution; for Playwright trace inspection load `/playwright-cli`
* **Session contract (Phase 0 resume, plan.md/progress.md schemas, archive policy, Engram per-phase checkpoint, RUN_ID re-attach mechanism)** — read `../agentic-qa-core/references/session-management.md`. This skill is a producer of `session/regression-testing/<scope>/...` topic keys.

---

## Anti-patterns — NEVER do these

- **R1.** NEVER classify a failure as FLAKY without re-running the test in isolation — masks real regressions.
- **R2.** NEVER emit GO when known REGRESSION class > 0 — quality gate is binary: regressions block.
- **R3.** NEVER auto-retry failing tests in CI without surfacing the retry count in the report.
- **R4.** NEVER skip Allure artifact download on red builds — evidence vanishes after the retention window.
- **R5.** NEVER trigger a regression workflow without `--ref <commit-sha>` pinned — different commit = different baseline.
- **R6.** NEVER mix smoke + regression suite results into one pass-rate number — different SLOs.
- **R7.** NEVER mark a test KNOWN-failure without a Jira ticket linking the suppression to a tracking issue.

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
