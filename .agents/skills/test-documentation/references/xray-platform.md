# Xray platform reference (Modality jira-xray)

What Xray is on Jira: issue types, the traceability matrix, the data flow from Playwright, environment variables and CI. Read it when the project is in Modality jira-xray (resolved in `SKILL.md` §Phase 0). Load `/xray-cli` for command syntax and `jira-setup.md` for the Jira-native fallback. How to write the tests themselves belongs to `test-automation`.

---

## 1. What Xray adds to Jira

Xray is a Test Management app for Jira. Tests, executions and plans are Jira issues, so they get workflows, screens, JQL, custom fields and the REST API. Coverage links between tests and requirements come built in.

| | Advantage | Cost |
|-|-----------|------|
| Jira-native | Use Jira workflows, permissions, JQL | Requires Jira Cloud or DC license |
| Built-in traceability | Links from Test to Story to Bug are first-class | Extra issue types to learn |
| CI/CD support | JUnit, Cucumber, Xray-JSON importers + REST API | Cloud and Server/DC have different APIs |
| BDD support | Native Cucumber Gherkin field | Test Type is fixed at creation (cannot convert Manual to Cucumber) |

---

## 2. Issue types (six)

Every TMS artifact becomes one of these:

| Issue type | Purpose | Notes |
|------------|---------|-------|
| **Test** | Individual test case (Manual / Cucumber / Generic) | Child of Regression Epic; member of its Story's ATS (coverage reaches the Story via the ATS→Story link; a direct Test↔Story link is the cascade's last resort). |
| **Test Set** | Two altitudes: **ATS** (per-Story, mandatory, holds all the Story's TCs even when there is one; its `is tested by` link to the Story fills the coverage panel) and **TS** (feature-level, optional grouping: smoke / regression / domain) | Membership is Xray-internal (manage via `/xray-cli`, read via the test enrich command of `/xray-cli`); for the ATS it is also a TC→ATS issue link (`../../agentic-qa-core/references/traceability-linking.md` §9). It is never the TC prefix (the TC prefix is always `{US_ID}`). The ATS→Story `is tested by` edge is a Jira link and is mandatory. Titles: `ATS: {US_ID}: {story title}` / `TS: {EPIC-KEY\|module}: Validate {feature}`. Components: inherited from the Story on the ATS (mandatory); optional on the feature-level `TS:` only (a feature Set spans modules by design). Both parented to **QA Test Artifacts**. |
| **Test Plan** | Strategic planning for a release / sprint | Planning-level container. Holds **FTP / STP / ATP / RTP** Plans (titles `FTP: …` / `STP: Sprint#{N}: {objective}` / `ATP: {STORY-KEY}: {story title}` / `RTP: {PROJECT_KEY\|module}: Regression Test Plan`). The `Regression Testing` suffix belongs to the STR, not the STP; the RTP is the long-lived product-altitude regression plan. Parented to **QA Master Test Plan**. |
| **Test Execution** | One execution cycle; holds Test Runs | Holds **STR / ATR / RTR** Runs (titles `STR: Sprint#{N}: Regression Testing` / `ATR: {STORY-KEY}: Story Testing` / `RTR: {scope-id}: Regression Testing`). FTR is retired: feature results are read from the per-Story ATRs, and the STR is a sibling sprint recap, not an aggregate of them. Carries Environment, Begin/End Date. Target of CI result import. Parented to **QA Test Artifacts**. |
| **Pre-Condition** | Reusable prerequisites | Associated to Tests that share setup. The association is Xray-internal (manage via `/xray-cli`, read via the test enrich command of `/xray-cli`) and never a Jira issue link. Title: `{COMPONENT}: {required state}` (no ladder acronym). The title states the required state and the content holds the setup steps, kept distinct, e.g. `Auth: User logged in as Admin`. Parented to **QA Test Artifacts**. |
| **Test Run** | Not a Jira issue: an internal entity inside a Test Execution | One per Test per Execution. Carries PASS/FAIL/TODO/BLOCKED/ABORTED/EXECUTING. |

Typical hierarchy (parents are the QA-process Epics):

```
QA Master Test Plan (Epic)
  +-- Test Plan: ATP: {STORY-KEY}: {story title}   (= ATP)
  +-- Test Plan: STP: Sprint#{N}: {objective}      (sprint plan)
  +-- Test Plan: RTP: {PROJECT_KEY}: Regression Test Plan   (product regression plan, long-lived)

QA Test Artifacts (Epic)
  +-- Test Set: ATS: {US_ID}: {story title}             (= ATS, MANDATORY per Story —
  |       +-- Test (TC1, TC2, ...)                       ALL its TCs; ATS->Story link = coverage)
  +-- Test Set: TS: Checkout: Validate checkout v2      (optional feature grouping)
  |       +-- Test (TC3, TC4, ...)
  +-- Test Execution: ATR: {STORY-KEY}: Story Testing   (= ATR)
         +-- Test Run per Test (PASS / FAIL / TODO)

QA Test Repository (Epic)
  +-- Test (TC1, TC2, TC3, TC4, ...)               (permanent test repository)
```

---

## 3. Test types (three)

The `Test Type` field is set at creation and cannot be changed afterwards without delete and recreate.

| Type | Use when | Steps field |
|------|----------|-------------|
| **Manual** | Human-executed test with structured steps | `Manual Steps` (step / data / expected per row) |
| **Cucumber** | BDD, automation-candidate | `Gherkin Definition` (Feature / Scenario Outline) |
| **Generic** | Automated test with a reference ID | `Generic Test Definition` (a free-form text that matches the test file's ATC ID) |

Use Cucumber for every automation-candidate (Gherkin quality per `jira-test-management.md` §7). Use Generic only when the automation framework already has its own test spec and the TMS needs just a pointer.

---

## 4. Status fields (IQL has two)

`tms-conventions.md` §IQL has the full treatment. In short:

- **Test Status** (workflow on the Test issue): `Draft` / `In Design` / `READY` / `MANUAL` / `In Review` / `Candidate` / `In Automation` / `Pull Request` / `AUTOMATED` / `DEPRECATED`. The exact names come from `.agents/jira-workflows.json` (`work_types.test_case`), the authoritative source. Long-lived lifecycle.
- **Execution Status** (per Test Run inside a Test Execution): `TODO` / `EXECUTING` / `PASS` / `FAIL` / `ABORTED` / `BLOCKED`. Per run; resets each execution.

They are different fields. `AUTOMATED` (Test Status) with `FAIL` (Execution Status of the last run) is a valid and common combination: the TC is live in CI and its last run failed.

### Test Plan roll-up: latest status wins

A Test Plan aggregates the latest status of each of its Tests across every Execution. `PROJ-101` passing in an earlier ATR and failing in a later STR reads FAIL on the Plan; a re-run flips it back. The Plan owns no Test Run of its own.

So results are never written into a Test Plan: its status is derived, not stored. The plan-altitude items (**FTP / STP / ATP / RTP**) carry the plan (description) and human observations (comments). The Execution-altitude items (**ATR / STR**) carry the results: the per-Story ATRs as the sprint runs, then the closing regression days before sprint close, which adds one more Execution over the plan's Tests, the STR. The STP's roll-up updates itself as they accumulate and nobody maintains it.

That is also why `STP_EXECUTION_KEY` (`.env` / CI) names the plan but must hold an Execution key: the **RTR** of a regression run, or the sprint-close **STR**, never the STP or RTP itself. `tests/utils/jiraSync.ts` reads the target's issue type and refuses a Test Plan outright.

---

## 5. Requirements Traceability Matrix (RTM)

Xray exposes bidirectional links between Requirements and Tests:

```
REQUIREMENT (Story/Epic)           TEST                     DEFECT
      |            "covers"         |       "is tested by"    |
      v                             v                         v
 +----------+                 +-----------+             +-----------+
 | STORY-1  | <-------------- | PROJ-101  | ----------> | BUG-456   |
 +----------+                 +-----------+             +-----------+

Forward:  "Does every requirement have test coverage?"
Backward: "Which requirement does this test verify?"
```

### Coverage status per requirement

| Status | Meaning |
|--------|---------|
| Covered & Passing | All linked tests' last run = PASS |
| Covered & Failing | At least one linked test's last run = FAIL |
| Covered & Not Executed | Tests exist but no runs yet (TODO) |
| Not Covered | No tests linked to this requirement |

Which link fills this panel (`xray-cli/SKILL.md` §Direction): only an `is tested by` edge from a **Test Set** (the Story's ATS) or a direct Test↔Story link counts as coverage. A Story linked `is tested by` to a Test Plan and a Test Execution, even ones holding all its Tests, shows UNCOVERED, 0 tests, because ATP/ATR links are administrative traceability and not coverage. That is why the per-Story ATS is mandatory: its ATS→Story link is the coverage anchor.

The QA completeness checklist in `tms-architecture.md` §Completeness criteria applies this view at the User Story level.

---

## 6. Data flow: Playwright, per-ATC results, Xray

```
PLAYWRIGHT TEST EXECUTION
   test('PROJ-100: login flow', async ({ fixture }) => {
     await fixture.api.auth.loginWithValidCredentials({...});   // @atc('PROJ-101')
   });
          |
          | KataReporter.onEnd() writes
          v
reports/atc_results.json   (one record per ATC execution, keyed by the @atc id)
   "PROJ-101": [{ status: "PASS", duration: 1234, ... }]
          |
          | bun run xray:payload  (CI)  /  bun run test:sync  (local)
          v
XRAY JSON  (POST /api/v2/import/execution)
   { testExecutionKey: "PROJ-400",
     tests: [{ testKey: "PROJ-101", status: "PASSED", comment: "..." }] }   // no testInfo
          |
          v
XRAY API PROCESSING
   MATCH testKey "PROJ-101" to the existing Test issue (unknown key = Xray error)
   UPDATE Test Runs with statuses in the existing Test Execution PROJ-400
          |
          v
XRAY ENTITIES UPDATED
   Test Execution PROJ-400:
     Test Plan: PROJ-300
     Environment: staging
     Test Runs:
       PROJ-101 -> PASS
       PROJ-102 -> FAIL "Timeout after 5000ms"
   Test Plan PROJ-300:
     Progress: 43/45 passing (95.5%)
```

Matching rules, i.e. how Xray finds which Test issue a result belongs to (Xray Cloud docs, "Taking advantage of JUnit XML reports" and "Using Xray JSON format to import execution results"):

1. **JUnit**: a `test_key` (or `test_id`) property on the testcase names the Test; a key that does not exist is an error. Without one, Xray matches a Generic Test by its Generic Test Definition (`classname` + `name`) and creates a new Generic Test when none matches. The test name is never matched against a Jira key.
2. **Xray JSON**: `testKey` names the Test (any test type). A Test is created only from a `testInfo` element.

The `@atc('PROJ-101')` id is the Test key, and a Playwright test can call several ATCs or none. So the KATA import is Xray JSON with one `testKey` entry per ATC and no `testInfo`: it writes runs onto existing Tests and cannot create one. `junit.xml` is not imported, and `[TMS_TOOL] import junit` refuses a testcase without a key. The `PROJ-100:` prefix in a test title is the story key, for humans and grep only. See `test-automation/references/atc-tracing.md`.

---

## 7. Environment variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `XRAY_CLIENT_ID` | API client ID (Cloud) | Cloud only |
| `XRAY_CLIENT_SECRET` | API client secret (Cloud) | Cloud only |
| _(site host)_ | `.agents/project.yaml` -> `issue_tracker.atlassian_url`, not an env var; read with `bun run --silent jira:url` | Always |
| `ATLASSIAN_EMAIL` | Atlassian account email | Always |
| `ATLASSIAN_API_TOKEN` | Atlassian API token | Always |
| `JIRA_PROJECT_KEY` | Default project key | Optional (fallback to `{{PROJECT_KEY}}`) |
| `XRAY_PROJECT_KEY` | Xray project key for local sync; referenced by no workflow | Optional (local only) |
| `STP_EXECUTION_KEY` | Target of the automated write-back: the **RTR** Test Execution (or the sprint-close **STR**), never a Test Plan's own key (`tests/utils/jiraSync.ts` reads the issue type and refuses a Test Plan; see §4). Unset, each run mints a new, unparented Execution. | Xray only; required for write-back |

Always read these from `.env`, never hardcode them. The `/xray-cli` skill reads them from the environment automatically.

---

## 8. API quick reference

Only the endpoints the skill needs. Full reference: [docs.getxray.app/display/XRAYCLOUD/REST+API](https://docs.getxray.app/display/XRAYCLOUD/REST+API).

| Operation | Endpoint (Cloud) | Endpoint (Server/DC) |
|-----------|------------------|----------------------|
| Authenticate | `POST /api/v2/authenticate` | n/a (basic auth or PAT header) |
| Import JUnit | `POST /api/v2/import/execution/junit` | `POST /rest/raven/2.0/import/execution/junit` |
| Import Cucumber | `POST /api/v2/import/execution/cucumber` | `POST /rest/raven/2.0/import/execution/cucumber` |
| Import Xray JSON | `POST /api/v2/import/execution` | `POST /rest/raven/2.0/import/execution` |
| Multipart import with test info | `POST /api/v2/import/execution/junit/multipart` | same pattern |

Cloud rate limit is about 10 req/s per user (plan-dependent). Batch imports over 100 tests should use the bulk or multipart variants.

---

## 9. CI/CD integration (reference pattern)

The live pattern is the `XrayImport` job in `.github/workflows/regression.yml`; the `/regression-testing` skill owns the CI lifecycle. The job does this, in order:

1. Skips with a notice when `AUTO_SYNC` is not `true` or `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET` are not set.
2. Skips with a warning when there is no target Test Execution: the `execution_key` dispatch input (the RTR) or the `STP_EXECUTION_KEY` secret. It does not import with only a project key, because that mints a new Execution that Xray's import API cannot parent to the QA Test Artifacts epic.
3. Builds the Xray JSON payload from each test job's `reports/atc_results.json` (one entry per ATC, `testKey` = the `@atc` id, no `testInfo`). An id that is not shaped like a Test key fails the job there, naming it, and nothing is sent.
4. Authenticates, then imports that payload into the execution: `[TMS_TOOL] import xray: file=<payload>` (load `/xray-cli` for the literal command). It does not import `junit.xml`, so it cannot create a Test.
5. Runs the import step `continue-on-error`, so an Xray outage does not turn a green suite red.

There is no `XRAY_TEST_PLAN_KEY` / `XRAY_ENVIRONMENT` variable: the target Execution already carries its Test Plan link and its Test Environment.

---

## 10. Dual reporting: Allure vs Xray

Automation reports (Allure, CI logs, screenshots) and TMS reports serve different audiences. Keep both.

| | Automation reports (Allure / CI) | TMS reports (Xray) |
|-|----------------------------------|--------------------|
| Where | Allure server / S3 / CI artifacts | Jira + Xray |
| What | All executions (smoke, sanity, regression) | Regression cycles + manual + automated, linked to requirements |
| Audience | Dev team, DevOps, QA automation | QA team, PMs, stakeholders, management |
| Question it answers | "Is the pipeline healthy? Where is the flake?" | "Is the product ready? Are the requirements verified?" |

Sync to the TMS only from CI, not from local runs. Feature-branch results are ephemeral; only main and staging results belong in the TMS.

---

## 11. Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Token expired or wrong credentials | Regenerate; verify `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET` |
| `404 Not Found` | Wrong project or Test Plan key | Verify the key exists in Jira via `[ISSUE_TRACKER_TOOL]` |
| `400 No valid tests` / test key not found | An imported `testKey` matches no Test issue | Every `@atc('<id>')` must be the key of an existing Test; a missing Test goes to `/test-documentation` (signed ROI), never created by the import |
| `403 Forbidden` | Xray project permissions | User needs "Edit Tests" + "Import Executions" in the Xray permission scheme |
| Test Type change rejected | Cannot convert Manual ↔ Cucumber | Delete the Test and recreate with the correct type |
| Test Execution never closes | Xray does not auto-close Executions | Transition manually via `[ISSUE_TRACKER_TOOL] Transition Issue` after import |

---

## 12. External resources

- Xray Cloud docs: `docs.getxray.app/display/XRAYCLOUD`
- Xray Server/DC docs: `docs.getxray.app/display/XRAY`
- Xray REST API: `docs.getxray.app/display/XRAYCLOUD/REST+API`
- Atlassian Jira REST API: `developer.atlassian.com/cloud/jira/platform/rest/v3/`
- Playwright Xray reporter: `github.com/inluxc/playwright-xray`
