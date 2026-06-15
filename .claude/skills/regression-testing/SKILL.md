---
name: regression-testing
description: "Execute regression test suites via CI/CD, analyze results, classify failures, and produce GO/NO-GO release decisions. Use when running regression, smoke, or sanity suites through GitHub Actions, monitoring workflow runs, downloading Allure or Playwright artifacts, classifying failures (REGRESSION vs FLAKY vs KNOWN vs ENVIRONMENT vs NEW TEST), computing pass-rate and trend metrics, deciding release readiness, generating executive quality reports, or creating regression issues. Triggers on: run regression, trigger test workflow, analyze test results, quality report, GO/NO-GO decision, release readiness, flaky tests, Allure report, smoke suite, pass rate, nightly test failure, stage 6. Do NOT use for writing new regression tests (that belongs to test-automation) or for manual fix verification (that belongs to sprint-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [testing-e2e, ci-cd]
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
`.claude/skills/agentic-qa-core/references/skill-composition-strategy.md` §4
(governs users who manually install SDD).

# Regression Testing — Execute, Analyze, Decide

Orchestrates the full release-readiness pipeline: trigger a CI suite, monitor it to completion, classify failures, score against release criteria, and emit a GO / CAUTION / NO-GO verdict plus a stakeholder report.

Three phases, always in this order: **Execute → Analyze → Report**. Do not skip analysis and jump to a report. Do not guess classification without reading failure logs.

---

## Inputs

- `.github/workflows/*.yml` — workflow files for regression / smoke / sanity suites; defines triggers, inputs, and artifact uploads.
- `.context/master-test-plan.md` — regression Epic key + expected pass-rate SLOs per suite.
- `playwright.config.ts` — reporter config, retry policy, project matrix; needed to interpret retry counts and shard splits.
- Previous run's Allure report (artifact URL or local download under `./analysis/previous/`) — baseline for trend computation.
- `kata-manifest.json` — registry of tests and ATCs available; used to cross-reference failed test IDs.
- `.agents/jira-required.yaml` — Jira refs (project key, work types, transitions) for filing regression issues.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional. The orchestrator also applies the per-stage **Definition-of-Done gates** in `./stage-gates.md`: verify a stage's DoD BEFORE recording its progress checkpoint and advancing.

This skill is **per-run scope**: `<scope>` = `<env>-<YYYY-MM-DD>` (e.g. `staging-2026-05-20`). Session state lives at `.session/regression-testing/<scope>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. The single highest-value resume case: if the Monitor subagent dies while watching a long CI run but `RUN_ID` was captured in `plan.md`, Phase 0 re-attaches via `gh run view <RUN_ID>` instead of re-triggering CI (saves 20–60 min of wall-clock).

This skill is compliant with the doctrine in `CLAUDE.md` §"Orchestration Mode (Subagent Strategy)" and the session contract in `.claude/skills/agentic-qa-core/references/session-management.md`. Every dispatch follows the 6-component briefing format defined in `.claude/skills/agentic-qa-core/references/briefing-template.md`, and the pattern selected per stage matches the decision guide in `.claude/skills/agentic-qa-core/references/dispatch-patterns.md`. The two CI-bound stages (long-running watch, multi-artifact download) and the high-volume failure classification step are the hotspots — everything else stays inline because the dispatch overhead is not justified.

| Stage                                                      | Pattern    | Subagent role                                                                                                  |
|------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------------------------|
| Trigger workflow (`gh workflow run`)                       | Single     | inline — no dispatch needed (one shell call)                                                                   |
| Wait/monitor `gh run watch`                                | Background | one Monitor subagent runs the watch; main thread continues with prep work; subagent notifies on exit           |
| Download 3 artifacts (allure / evidence / playwright)      | Parallel   | 3 simultaneous subagents, one per artifact; cap = 3 (no rate-limit risk)                                       |
| Classify failures (chunks of ~10 tests each)               | Parallel   | N subagents based on failure volume; cap = 10 to avoid context dilution                                        |
| Compute metrics (pass-rate, trends)                        | Single     | inline — needs aggregated state, low cost                                                                      |
| Generate executive report                                  | Single     | inline — final synthesis, decisions live here                                                                  |
| GO / CAUTION / NO-GO verdict                               | Single     | inline — main thread owns release decisions                                                                    |

- **Error protocol**: On any subagent failure: STOP, report full context to user, present retry / skip / abort options. Do NOT auto-fix. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.

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
| `[TMS_TOOL]` (result sync) | OPTIONAL | Only when `.agents/project.yaml` `testing.tms_cli` is set — Stage 3 pushes run status. jira-xray → `/xray-cli` + `XRAY_*`. |
| `[ISSUE_TRACKER_TOOL]` (file regression issues) | OPTIONAL | Only on NO-GO / CAUTION-with-regressions, to file issues. Load `/acli` then. |

Test-user creds, OpenAPI/`API_TOKEN`, DBHub and Playwright browsers live **inside the CI runner**, not the orchestrator — this skill does not exercise them locally, so they are out of scope for this gate. After the gate clears (all REQUIRED GREEN), continue to Phase 0 below.

---

## Phase 0 — Session resume check (MANDATORY, inline)

Before suite selection or any `gh workflow run`, run the resume contract from `agentic-qa-core/references/session-management.md` §4:

1. Compute prospective `<scope>` = `<env>-<YYYY-MM-DD>` from invocation context (env defaults to `{{DEFAULT_ENV}}`).
2. Check `.session/regression-testing/<scope>/progress.md`.
3. If it does NOT exist → proceed to suite selection + Phase 1 preflight + plan.md write.
4. If it DOES exist:
   - Read `plan.md` (captured `suite`, `env`, `workflow_file`, `RUN_ID` if Phase 1 already triggered).
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

Allure 3 is a devDep — `bunx allure` resolves to the local `node_modules/.bin/allure`, no `brew install allure` / `scoop install allure` required. Configuration lives at `allurerc.mjs` (Awesome plugin enabled).

| Use case | Script | Underlying command |
|---|---|---|
| Run tests + auto-generate report (human review) | `bun allure:run` | `bunx allure run -- bun test` |
| Run tests + emit markdown for AI review | `bun allure:agent` | `bunx allure agent -- bun test` |
| Generate report from existing `./allure-results` | `bun allure:generate` | `bunx allure generate ./allure-results` |
| Serve last generated report locally | `bun allure:open` | `bunx allure open` |
| Live-refresh report during iterative dev | `bun allure:watch` | `bunx allure watch ./allure-results` |

`bun allure:agent` is the AI-friendly entry point: it produces a markdown summary the orchestrator (or a Verifier subagent) can read directly without parsing HTML. Use it whenever you need a structured pass/fail breakdown after a local re-run while triaging a CI failure (Phase 2 step 1, before downloading the merged-allure-results artifact from CI).

CI artifacts (`merged-allure-results-{env}`) are still produced by the workflow and downloaded via `gh run download` as documented in Phase 2 — those use the same allurerc config inside the runner.

---

## Phase 1 — Execute

### Preflight (always)

```bash
gh auth status
gh repo view --json name,owner
gh workflow list
```

If `gh` is not authenticated, stop and ask the user to run `gh auth login`. Do not proceed.

**Write `.session/regression-testing/<scope>/plan.md`** per `agentic-qa-core/references/session-management.md` §6 BEFORE the Trigger step below. Capture: Goal (suite + env + reason for run), Inputs (workflow file path, env vars, optional grep/test_file for sanity), Approach (subagent pattern per stage from the dispatch table above), Phase breakdown (Trigger → Monitor → Download → Classify → Compute → Report → Verdict), Risks, Verification checklist (all 3 artifacts download + verdict emitted), Cross-references (`.context/reports/regression-<env>-<date>.md` will hold the final verdict). `RUN_ID` lands in `plan.md` §Inputs AFTER the Trigger step captures it — append, do not rewrite the body.

### Trigger

```bash
# Full regression
gh workflow run regression.yml \
  -f environment=staging \
  -f video_record=false \
  -f generate_allure=true

# Smoke
gh workflow run smoke.yml -f environment=staging -f generate_allure=true

# Sanity (grep OR test_file, never both)
gh workflow run sanity.yml -f environment=staging -f test_type=e2e -f grep="@auth"
gh workflow run sanity.yml -f environment=staging -f test_file="tests/e2e/auth/login.test.ts"
```

### Capture run ID

```bash
# Wait 3-5 seconds for the run to register, then:
gh run list --workflow=regression.yml --limit=1 --json databaseId,status,createdAt -q '.[0].databaseId'
```

Store as `RUN_ID`. Every subsequent step uses it.

**Progress checkpoint after Trigger**: append `RUN_ID` to `.session/regression-testing/<scope>/plan.md` §Inputs (so resume can re-attach) AND append a phase entry `## Phase 1.Trigger — <ts>` with `status: completed`, `next: Phase 1.Monitor`, `notes: RUN_ID=<value>` to `progress.md`. This is the critical persistence point — Trigger landing without `RUN_ID` persisted means resume cannot re-attach.

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

### Step 3: Compute metrics

| Metric | Formula |
|--------|---------|
| Total | count of results |
| Passed / Failed / Skipped / Broken | count by `status` |
| Pass Rate | `Passed / Total * 100` |
| Duration | `max(stop) - min(start)` |
| Trend | current pass rate − previous run pass rate |

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
| REGRESSION | HIGH | Block release, create issue, assign |
| FLAKY | MEDIUM | Schedule stabilization, do not block |
| KNOWN ISSUE | LOW | Document, do not block |
| ENVIRONMENT | MEDIUM | Re-run after infra check |
| NEW TEST | LOW | Manual verification, then accept or fix |

> **`sdet` CI-fallback clause** (integration-trunk suites only): an ENVIRONMENT-class red on a Sanity-CI run for a ticket branch may authorize merging **into the integration trunk** — never the final `trunk → main` PR — when proven by BOTH (a) the change passing locally on `local` AND `staging`, and (b) the same red being present independent of the change (nightly already red, or the failing line is shared pre-existing code). File a separate infra/flake ticket and reference it in the PR. This is NOT a relaxation of the GO bar: a REGRESSION-class failure is never eligible, and the final PR to `main` still requires a genuinely green test step. See `.claude/skills/git-flow-master/references/sdet-integration-trunk.md` §CI-fallback clause.

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

### Create issues (when decision = NO-GO or CAUTION with regressions)

For each REGRESSION, open one issue:

```bash
gh issue create \
  --title "[REGRESSION] {test_name} failing in {suite}" \
  --label "regression,bug,automated-tests" \
  --body "$(cat <<EOF
## Regression Details
- Test ID: {atc_id}
- Suite: {suite}
- Run ID: {run_id}
- Environment: {environment}

## Error
\`\`\`
{error_message}
\`\`\`

## Evidence
- [Workflow run]({run_url})
- [Allure report]({allure_url})

## Last passed
{last_pass_date} (Run #{last_pass_run})
EOF
)"
```

Save the returned issue number to reference in the report.

### TMS sync (optional, when `[TMS_TOOL]` is configured via `.agents/project.yaml` `testing.tms_cli`)

> **Prerequisite**: Load `/xray-cli` skill (Modality jira-xray) before executing the `[TMS_TOOL]` commands below. In Modality jira-native, load `/acli` instead and map test-execution operations to native Jira issues (see `test-documentation/references/jira-setup.md`).

```
[TMS_TOOL] Update Test Execution:
  executionKey: {execution-key}
  results: {per-ATC status + failure comments from Phase 2}
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
### Environment ({n}) — re-run after infra check

## Trend (last 5 runs)
{ASCII sparkline or pass-rate table}

## Links
- Workflow run: {url}
- Allure: {url}
- Created issues: {list}
- TMS execution: {key / url}

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

### Per-phase progress + Archive

After Phase 1 Monitor returns, after each Phase 2 step (Collect / Parse / Compute / Classify / Severity), and after Phase 3 Verdict, the orchestrator appends a phase entry to `.session/regression-testing/<scope>/progress.md` per `agentic-qa-core/references/session-management.md` §7. `artifacts_touched` records the downloaded CI artifacts (allure / evidence / playwright dirs) + the final `.context/reports/regression-<env>-<date>.md`.

After the Verdict emits, the orchestrator runs Archive per `agentic-qa-core/references/session-management.md` §8: moves `.session/regression-testing/<scope>/` to `.session/.archive/<YYYY-MM-DD>-regression-testing-<scope>/` (two-file dir preserved) and calls `mem_session_summary` with the archive path. The canonical `.context/reports/regression-<env>-<date>.md` stays in the reports dir as the committed deliverable.

On Verdict = NO-GO with regressions still being filed as issues, archive WAITS until the issue-creation step completes (so the session state still references the open issue list at archive time).

---

## Gotchas

- **Allure URL is predictable but only live after the "Build & Deploy Allure Report" job succeeds.** If that job failed, the URL 404s — analyze from downloaded artifacts instead.
- **`gh run watch` can time out** on long suites. Fall back to polling `gh run view <RUN_ID> --json status` every 60-90 seconds.
- **`gh run view --log` dumps every step's output** and is often >50MB on large suites. Always prefer `--log-failed` during analysis; use `--job=<JOB_ID> --log` for targeted drilldown.
- **Retries mask flakiness.** Playwright is configured with `retries: 2` in CI. A test that passes on retry is still flaky — inspect `retries` count in Allure, not just final status.
- **ENVIRONMENT is not a scapegoat.** `ECONNREFUSED` to your app's own API probably means the app crashed, not "infra glitch". Check if the same run has many unrelated tests failing on the same host — that is environment. One test failing with a network error on an endpoint that other tests hit successfully is more likely a REGRESSION.
- **Never mark NEW TEST as REGRESSION.** A first-ever failure with no history is not a regression — it is unverified. Manually confirm once before classifying.
- **Flakiness needs 10 runs of history minimum.** If you don't have 10 runs, mark it as "insufficient history" and re-evaluate next sprint. Do not guess.
- **Sanity + `grep` and `test_file` are mutually exclusive.** Passing both makes the workflow ignore one silently. Pick one.
- **Video recording inflates artifact size by 5-10x.** Only enable `video_record=true` when debugging flakiness or capturing bug evidence. Never enable it for nightly regression.
- **CI credentials come from GitHub secrets, not `.env`.** Do not copy values from local `.env` into workflow YAML — reference `${{ secrets.NAME }}` only.

---

## Specific tasks

* **Configuring or debugging GitHub Actions workflows** — read `references/ci-cd-integration.md`
* **Classifying a borderline failure (REGRESSION vs FLAKY vs ENVIRONMENT)** — read `references/failure-classification.md`
* **TMS / Xray result import** — load `/xray-cli` skill
* **Downloading traces or screenshots for a failure** — use `[AUTOMATION_TOOL]` per CLAUDE.md Tool Resolution; for Playwright trace inspection load `/playwright-cli`
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
# Trigger + get run ID in one shot
gh workflow run regression.yml -f environment=staging && sleep 5 && \
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
