# Xray Platform Reference (Modality A)

Dense reference for Xray on Jira — issue types, traceability matrix, data flow, environment vars, and CI integration. Use when the project is in **Modality A** (per `SKILL.md` §Phase 0). For CLI syntax, load `/xray-cli` skill. For Jira-native fallback, see `jira-setup.md`.

This document describes *what Xray is*; it does not describe *how to write tests* — that is `test-automation`'s job.

---

## 1. What Xray adds to Jira

Xray is a native Test Management app for Jira. Tests, executions, and plans are **Jira issues** with full access to workflows, screens, JQL, custom fields, and REST API. Coverage links between tests and requirements are built-in.

Trade-offs:

| | Advantage | Cost |
|-|-----------|------|
| Jira-native | Use Jira workflows, permissions, JQL | Requires Jira Cloud or DC license |
| Built-in traceability | Links from Test → Story → Bug are first-class | Extra issue types to learn |
| CI/CD support | JUnit, Cucumber, Xray-JSON importers + REST API | Cloud and Server/DC have different APIs |
| BDD support | Native Cucumber Gherkin field | Test Type is fixed at creation (cannot convert Manual → Cucumber) |

---

## 2. Issue types (six)

Every TMS artifact becomes one of these:

| Issue type | Purpose | Notes |
|------------|---------|-------|
| **Test** | Individual test case (Manual / Cucumber / Generic) | Child of Regression Epic; linked to Story. |
| **Test Set** | Groups tests by criteria (smoke / regression / domain) | Reusable across sprints; `TS_ID` can become TC prefix. |
| **Test Plan** | Strategic planning for a release / sprint | Planning-level container; one per release cadence. Maps to **ATP**. |
| **Test Execution** | One execution cycle; holds Test Runs | Maps to **ATR**. Carries Environment, Begin/End Date. Target of CI result import. |
| **Pre-Condition** | Reusable prerequisites | Linked to Tests that share setup (e.g. "User logged in as Admin"). |
| **Test Run** | *Not a Jira issue* — internal entity inside a Test Execution | One per Test per Execution. Carries PASS/FAIL/TODO/BLOCKED/ABORTED/EXECUTING. |

Typical hierarchy:

```
Regression Epic
  +-- Test Plan: {{PROJECT_KEY}}-{n}               (= ATP)
  |      +-- Test Set: Sanity: core auth           (optional grouping)
  |      |       +-- Test (TC1, TC2, ...)
  |      +-- Test Set: Regression: checkout v2
  |              +-- Test (TC3, TC4, ...)
  +-- Test Execution: {{PROJECT_KEY}}-{n}          (= ATR)
         +-- Test Run per Test (PASS / FAIL / TODO)
```

---

## 3. Test types (three)

The `Test Type` field is set at creation and **cannot be changed** afterwards without delete + recreate.

| Type | Use when | Steps field |
|------|----------|-------------|
| **Manual** | Human-executed test with structured steps | `Manual Steps` (step / data / expected per row) |
| **Cucumber** | BDD, automation-candidate | `Gherkin Definition` (Feature / Scenario Outline) |
| **Generic** | Automated test with a reference ID | `Generic Test Definition` (a free-form text that matches the test file's ATC ID) |

Rule of thumb: use **Cucumber** for all automation-candidates (high-quality Gherkin per `jira-test-management.md` §7). Use **Generic** only when the automation framework already has its own test spec and you just need a TMS pointer.

---

## 4. Status fields (IQL: two of them)

See `tms-conventions.md` §IQL for the full treatment. One-liner here:

- **Test Status** (Workflow on the Test issue): `Draft` / `In Design` / `Ready` / `Manual` / `In Review` / `Candidate` / `In Automation` / `Pull Request` / `Automated` / `Deprecated`. Long-lived lifecycle.
- **Execution Status** (per Test Run inside a Test Execution): `TODO` / `EXECUTING` / `PASS` / `FAIL` / `ABORTED` / `BLOCKED`. Per-run, resets each execution.

These are different fields. `Automated` (Test Status) + `FAIL` (Execution Status of last run) is a valid, common combination — the TC is live in CI, and it failed today.

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

### Coverage Status per requirement

| Status | Meaning |
|--------|---------|
| Covered & Passing | All linked tests' last run = PASS |
| Covered & Failing | At least one linked test's last run = FAIL |
| Covered & Not Executed | Tests exist but no runs yet (TODO) |
| Not Covered | No tests linked to this requirement |

The QA completeness checklist in `tms-architecture.md` §Completeness criteria is the application of this view at the User Story level.

---

## 6. Data flow: Playwright → JUnit → Xray

```
PLAYWRIGHT TEST EXECUTION
   test('PROJ-101 | login flow', async ({ fixture }) => {
     await fixture.api.auth.loginWithValidCredentials({...});
   });
          |
          | generates
          v
JUNIT XML (or Cucumber JSON)
   <testcase name="PROJ-101 | login flow" time="1.234">
     <system-out>Passed</system-out>
   </testcase>
          |
          | [TMS_TOOL] Import Results
          |   OR CI step (curl POST /api/v2/import/execution/junit)
          v
XRAY API PROCESSING
   PARSE junit.xml
   MATCH "PROJ-101" to existing Test issue
   CREATE Test Execution PROJ-400 (if not pre-existing)
   UPDATE Test Runs with statuses
          |
          v
XRAY ENTITIES UPDATED
   Test Execution PROJ-400:
     Test Plan: PROJ-300
     Environment: staging
     Test Runs:
       PROJ-101 -> PASS (1.234s)
       PROJ-102 -> FAIL (2.1s) "Timeout after 5000ms"
   Test Plan PROJ-300:
     Progress: 43/45 passing (95.5%)
```

Matching rules (how Xray finds which Test issue a result belongs to):

1. **By Jira key in test name**: `test('PROJ-101 | ...', ...)` — most reliable.
2. **By Generic Test Definition**: match on `testKey` field — for Generic tests.
3. **By Test Summary**: exact match — least reliable, avoid.

The KATA convention `@atc('PROJ-101')` + `test('PROJ-101: should ...', ...)` ensures rule 1 always applies. See `test-automation/references/atc-tracing.md`.

---

## 7. Environment variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `XRAY_CLIENT_ID` | API client ID (Cloud) | Cloud only |
| `XRAY_CLIENT_SECRET` | API client secret (Cloud) | Cloud only |
| `XRAY_TOKEN` | Personal Access Token (Server/DC) | Server only |
| `JIRA_BASE_URL` | Jira instance URL | Always |
| `JIRA_PROJECT_KEY` | Default project key | Optional (fallback to `{{PROJECT_KEY}}`) |
| `XRAY_TEST_PLAN_KEY` | Default Test Plan for imports | Optional |
| `XRAY_ENVIRONMENT` | Default test environment label | Optional |

Never hardcode these — always from `.env`. The `/xray-cli` skill reads them from the environment automatically.

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

Cloud rate limit: ~10 req/s per user (plan-dependent). Batch imports > 100 tests should use bulk or multipart variants.

---

## 9. CI/CD integration (reference pattern)

GitHub Actions snippet — adapt the secret names to the project. The `/regression-testing` skill handles the full CI lifecycle.

```yaml
- name: Run tests
  run: bun run test
  env:
    CI: true

- name: Get Xray token
  if: always()
  id: xray-auth
  run: |
    TOKEN=$(curl -s -X POST \
      https://xray.cloud.getxray.app/api/v2/authenticate \
      -H "Content-Type: application/json" \
      -d "{\"client_id\":\"${XRAY_CLIENT_ID}\",\"client_secret\":\"${XRAY_CLIENT_SECRET}\"}" \
      | tr -d '"')
    echo "token=$TOKEN" >> $GITHUB_OUTPUT

- name: Import results to Xray
  if: always()
  run: |
    curl -X POST \
      "https://xray.cloud.getxray.app/api/v2/import/execution/junit?projectKey=${{ vars.JIRA_PROJECT_KEY }}&testPlanKey=${{ vars.XRAY_TEST_PLAN_KEY }}" \
      -H "Authorization: Bearer ${{ steps.xray-auth.outputs.token }}" \
      -H "Content-Type: application/xml" \
      --data-binary @test-results/junit.xml
```

Alternative: Playwright reporter `playwright-xray` posts results directly, no curl step. Use whichever the project already has configured.

---

## 10. Dual reporting: Allure vs Xray

Automation reports (Allure, CI logs, screenshots) and the TMS reports serve different audiences. Keep both; do not collapse into one.

| | Automation reports (Allure / CI) | TMS reports (Xray) |
|-|----------------------------------|--------------------|
| Where | Allure server / S3 / CI artifacts | Jira + Xray |
| What | All executions (smoke, sanity, regression) | Regression cycles + manual + automated, linked to requirements |
| Audience | Dev team, DevOps, QA automation | QA team, PMs, stakeholders, management |
| Question it answers | "Is the pipeline healthy? Where is the flake?" | "Is the product ready? Are the requirements verified?" |

Rule: sync only from CI to the TMS (never from local runs). Feature branch results are ephemeral; only main/staging results belong in the TMS.

---

## 11. Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Token expired or wrong credentials | Regenerate; verify `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET` |
| `404 Not Found` | Wrong project or Test Plan key | Verify the key exists in Jira via `[ISSUE_TRACKER_TOOL]` |
| `400 No valid tests` | Test IDs in JUnit don't match any Test issue | Make sure test names include the Jira key (`@atc('PROJ-101')`) |
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
