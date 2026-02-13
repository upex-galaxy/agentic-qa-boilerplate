# Jira + Xray Platform Documentation

> **Purpose**: Complete reference for Jira/Xray integration in QA Automation (IQL-Aligned)
> **Last Updated**: February 2026
> **Methodology**: Integrated Quality Lifecycle (IQL) - see `test-management-system.md`
> **Related**: `cli/xray.ts` (CLI tool), `tests/utils/jiraSync.ts` (Sync utility)

---

## What is Xray?

Xray is a **native Test Management app for Jira** that extends Jira with testing capabilities. It uses Jira's native issue system, meaning all tests, executions, and plans are Jira issues with full access to workflows, custom fields, JQL, and the Jira REST API.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Project** | Jira project with Xray enabled |
| **Test** | Test case issue type |
| **Pre-Condition** | Reusable setup requirements |
| **Test Set** | Grouping of tests |
| **Test Execution** | Container for test runs |
| **Test Plan** | Strategic planning for version/sprint |
| **Test Run** | Individual test result within execution |
| **Requirement** | Story/Epic that tests cover |

---

## Why Xray for Test Management?

### Advantages

1. **Jira-Native**: Tests are Jira issues - use workflows, screens, JQL, permissions
2. **Full Traceability**: Link tests to requirements, defects, and executions
3. **Enterprise-Ready**: 10M+ testers, 10,000+ companies worldwide
4. **CI/CD Integration**: REST API for automation frameworks (JUnit, Playwright, etc.)
5. **BDD Support**: Native Cucumber/Gherkin integration
6. **Advanced Reporting**: Built-in reports, gadgets, and requirement coverage

### Limitations

1. **Jira Dependency**: Requires Jira Cloud or Data Center license
2. **Learning Curve**: Multiple issue types and custom fields to understand
3. **Cost**: Paid app on top of Jira license
4. **API Differences**: Cloud vs Server/DC APIs are different

---

## IQL-Aligned Issue Type Structure

> **Key Insight**: The Test Management System (TMS) follows IQL methodology which defines two distinct status concepts:
> - **Test Status** (Workflow): Tracks the Jira workflow status of the Test issue
> - **Execution Status** (Test Run): Tracks pass/fail from actual test runs

### Xray Issue Types Overview

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                     XRAY ISSUE TYPE STRUCTURE (IQL-ALIGNED)                                ║
║                              "Your Project Test Suite"                                     ║
╠═══════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                            ║
║  🧪 TEST (Issue Type)                                                                      ║
║  ┌──────────┬──────────────────────────────┬─────────────┬─────────────┬──────────────┐   ║
║  │ Key      │ Summary                      │ Test Type   │ Status      │ Test Repo    │   ║
║  │ (Auto)   │ (Text)                       │ (Select)    │ (Workflow)  │ (Folder)     │   ║
║  ├──────────┼──────────────────────────────┼─────────────┼─────────────┼──────────────┤   ║
║  │ PROJ-101 │ Login with valid credentials │ Generic     │ Automated   │ /Auth/Login  │   ║
║  │ PROJ-102 │ Password validation rules    │ Manual      │ Ready       │ /Auth/Login  │   ║
║  │ PROJ-103 │ Visual alignment check       │ Manual      │ Draft       │ /Auth/UI     │   ║
║  └──────────┴──────────────────────────────┴─────────────┴─────────────┴──────────────┘   ║
║                                                                                            ║
║  📁 TEST SET (Issue Type)                                                                  ║
║  ┌──────────┬────────────────────────────┬─────────────┬───────────────────────────┐      ║
║  │ Key      │ Summary                    │ Status      │ Tests (Link)              │      ║
║  ├──────────┼────────────────────────────┼─────────────┼───────────────────────────┤      ║
║  │ PROJ-200 │ Authentication Suite       │ Ready       │ PROJ-101, PROJ-102, ...   │      ║
║  │ PROJ-201 │ Bookings CRUD Suite        │ Ready       │ PROJ-110, PROJ-111, ...   │      ║
║  └──────────┴────────────────────────────┴─────────────┴───────────────────────────┘      ║
║                                                                                            ║
║  📋 TEST PLAN (Issue Type)                                                                 ║
║  ┌──────────┬────────────────────────────┬─────────────┬────────┬────────┬────────┐       ║
║  │ Key      │ Summary                    │ Fix Version │ Total  │ Passed │ Rate   │       ║
║  ├──────────┼────────────────────────────┼─────────────┼────────┼────────┼────────┤       ║
║  │ PROJ-300 │ Regression v2.0            │ 2.0.0       │ 45     │ 43     │ 95.5%  │       ║
║  └──────────┴────────────────────────────┴─────────────┴────────┴────────┴────────┘       ║
║                                                                                            ║
║  🔄 TEST EXECUTION (Issue Type)                                                            ║
║  ┌──────────┬────────────────────────────┬─────────────┬────────────┬──────────────┐      ║
║  │ Key      │ Summary                    │ Environment │ Status     │ Test Plan    │      ║
║  ├──────────┼────────────────────────────┼─────────────┼────────────┼──────────────┤      ║
║  │ PROJ-400 │ CI Run #142 - Staging      │ staging     │ Done       │ PROJ-300     │      ║
║  └──────────┴────────────────────────────┴─────────────┴────────────┴──────────────┘      ║
║                                                                                            ║
║  📊 TEST RUN (Not an Issue - Internal Entity)                                              ║
║  ┌───────────┬─────────┬───────────┬────────┬──────────┬─────────────────────────┐        ║
║  │ Test      │ Exec    │ Status    │ Time   │ Defects  │ Comment                 │        ║
║  ├───────────┼─────────┼───────────┼────────┼──────────┼─────────────────────────┤        ║
║  │ PROJ-101  │ PROJ-400│ PASS      │ 1.2s   │ -        │ -                       │        ║
║  │ PROJ-102  │ PROJ-400│ FAIL      │ 2.1s   │ PROJ-500 │ Timeout after 5000ms    │        ║
║  └───────────┴─────────┴───────────┴────────┴──────────┴─────────────────────────┘        ║
║                                                                                            ║
║  🔧 PRE-CONDITION (Issue Type)                                                             ║
║  ┌──────────┬────────────────────────────┬─────────────┬───────────────────────────┐      ║
║  │ Key      │ Summary                    │ Type        │ Associated Tests          │      ║
║  ├──────────┼────────────────────────────┼─────────────┼───────────────────────────┤      ║
║  │ PROJ-050 │ User logged in as Admin    │ Manual      │ PROJ-101, PROJ-102, ...   │      ║
║  └──────────┴────────────────────────────┴─────────────┴───────────────────────────┘      ║
║                                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

---

## Issue Type Schemas (Detailed)

### 1. Test Issue Type

The main issue type for test case documentation. Supports three test types.

| Field | Type | Description | Values |
|-------|------|-------------|--------|
| Key | Auto | Jira issue key | PROJ-101, PROJ-102, ... |
| Summary | Text | Test case title | Descriptive name |
| Description | Rich Text | Detailed description | Markdown/wiki supported |
| Test Type | Select | Category of test | Manual, Cucumber, Generic |
| Status | Workflow | Jira workflow status | Draft, Ready, Automated, Deprecated |
| Priority | Select | Business priority | Highest, High, Medium, Low, Lowest |
| Labels | Multi-select | Tags | regression, smoke, api, e2e |
| Component | Select | Feature area | Auth, Bookings, Invoices, etc. |
| Fix Version | Select | Target version | 1.0.0, 2.0.0, etc. |
| Linked Issues | Links | Traceability | covers Story, is blocked by Bug |
| Test Repository | Folder | Organization | /Module/Feature/Test |
| Manual Steps | Steps Editor | For Manual tests | Steps with Expected Results |
| Gherkin Definition | Text | For Cucumber tests | Feature/Scenario |
| Generic Definition | Text | For Generic/Automated | Automation ID reference |

#### Test Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Manual** | Traditional test case with steps | Human-executed tests |
| **Cucumber** | BDD with Gherkin syntax | Specification by example |
| **Generic** | Unstructured, automation reference | Automated tests (Playwright, etc.) |

#### Test Status Workflow (IQL Lifecycle)

```
TEST STATUS LIFECYCLE FLOW (Jira Workflow):

  ┌────────┐       ┌───────────┐       ┌─────────┐
  │ Draft  │──────▶│   Ready   │──────▶│ Approved│
  └────────┘       └───────────┘       └────┬────┘
                                            │
                        ┌───────────────────┼───────────────────┐
                        │                   │                   │
                        ▼                   ▼                   ▼
                   ┌────────┐         ┌───────────┐       ┌───────────┐
                   │ Manual │         │Automating │       │Deprecated │
                   └────────┘         └─────┬─────┘       └───────────┘
                        │                   │
                        │                   ▼
                        │            ┌──────────────┐
                        │            │  Automated   │
                        │            └──────────────┘
                        │                   │
                        └───────────────────┘
                              (both are final states)
```

**Status Descriptions:**

| Status | Description | IQL Stage | Who |
|--------|-------------|-----------|-----|
| **Draft** | Test case created, initial outline | TMLC Stage 4 | QA Analyst |
| **Ready** | Documented and ready for review | TMLC Stage 4 | QA Analyst |
| **Approved** | Reviewed and approved for execution | TMLC | QA Lead |
| **Manual** | Designated for manual execution only | TMLC | QA Analyst |
| **Automating** | Script being developed | TALC Stage 2 | QA Engineer |
| **Automated** | Script merged, part of regression suite | TALC Complete | QA Engineer |
| **Deprecated** | No longer applicable | Any | Any |

### 2. Test Execution Status Values

These are the statuses for **Test Runs** (not the Test issue itself):

| Status | Description | Color | Action |
|--------|-------------|-------|--------|
| 📝 **TODO** | Test not yet executed | Gray | Execute in next run |
| 🔄 **EXECUTING** | Currently running | Blue | In progress |
| ✅ **PASS** | Test passed | Green | Maintain in regression |
| ❌ **FAIL** | Test failed | Red | Investigate & fix |
| ⚠️ **ABORTED** | Execution stopped | Orange | Review and retry |
| 🚫 **BLOCKED** | Cannot execute (dependency) | Yellow | Resolve blocker |

### 3. Test Set Issue Type

Groups test cases by feature/module for organized execution.

| Field | Type | Description | Values |
|-------|------|-------------|--------|
| Key | Auto | Jira issue key | PROJ-200, PROJ-201, ... |
| Summary | Text | Test set name | "Authentication Suite" |
| Description | Rich Text | Suite purpose | Markdown supported |
| Status | Workflow | Jira status | Open, Ready, etc. |
| Tests | Association | Linked test cases | PROJ-101, PROJ-102, ... |
| Labels | Multi-select | Categorization | regression, smoke, sanity |

### 4. Test Plan Issue Type

Tracks test progress for a version or sprint.

| Field | Type | Description | Values |
|-------|------|-------------|--------|
| Key | Auto | Jira issue key | PROJ-300, PROJ-301, ... |
| Summary | Text | Plan name | "Regression v2.0" |
| Fix Version | Select | Target version | 2.0.0 |
| Status | Workflow | Jira status | Open, In Progress, Done |
| Tests | Association | Planned tests | From Test Sets or individual |
| Test Executions | Association | Linked executions | PROJ-400, PROJ-401, ... |
| Test Plan Status | Calculated | Overall progress | Progress bar |

### 5. Test Execution Issue Type

Container for test runs, represents a test cycle.

| Field | Type | Description | Values |
|-------|------|-------------|--------|
| Key | Auto | Jira issue key | PROJ-400, PROJ-401, ... |
| Summary | Text | Execution name | "CI Run #142 - Staging" |
| Test Plan | Link | Associated plan | PROJ-300 |
| Test Environments | Multi-select | Target environment | dev, staging, prod |
| Revision | Text | Build/version | v2.0.0-beta.1 |
| Begin Date | DateTime | Start time | Timestamp |
| End Date | DateTime | End time | Timestamp |
| Status | Workflow | Jira status | Open, In Progress, Done |
| Execution Status | Calculated | Overall status | Progress bar |

### 6. Pre-Condition Issue Type

Reusable setup requirements shared across tests.

| Field | Type | Description | Values |
|-------|------|-------------|--------|
| Key | Auto | Jira issue key | PROJ-050, PROJ-051, ... |
| Summary | Text | Pre-condition name | "User logged in as Admin" |
| Pre-Condition Type | Select | Matches test type | Manual, Cucumber, Generic |
| Definition | Text/Steps | Setup instructions | Depends on type |
| Associated Tests | Link | Tests using this | PROJ-101, PROJ-102, ... |

---

## Requirements Traceability Matrix (RTM)

Xray provides built-in traceability between requirements and tests.

### Coverage Relationships

```
REQUIREMENT (Story/Epic)          TEST                    DEFECT
        │                           │                        │
        │       "covers"            │     "is tested by"     │
        ▼                           ▼                        ▼
┌─────────────┐              ┌─────────────┐          ┌─────────────┐
│   US-123    │◄─────────────│  PROJ-101   │─────────▶│   BUG-456   │
│   Story     │   covers     │    Test     │  reveals │    Defect   │
└─────────────┘              └─────────────┘          └─────────────┘

FORWARD TRACEABILITY ──────────────────────────────────────────▶
Question: "Does every requirement have test coverage?"

◀────────────────────────────────────────── BACKWARD TRACEABILITY
Question: "What requirement does this test case verify?"
```

### Coverage Status

| Status | Icon | Description |
|--------|------|-------------|
| Covered & Passing | ✅ | All tests pass |
| Covered & Failing | ❌ | Some tests fail |
| Covered & Not Executed | ⏳ | Tests exist but not run |
| Not Covered | ⚠️ | No tests linked |

---

## Xray API Reference

### API Versions

| Version | Platform | Base URL |
|---------|----------|----------|
| REST v1 | Server/DC | `{jira-base-url}/rest/raven/1.0` |
| REST v2 | Server/DC | `{jira-base-url}/rest/raven/2.0` |
| REST v2 | Cloud | `https://xray.cloud.getxray.app/api/v2` |
| GraphQL | Cloud | `https://xray.cloud.getxray.app/api/v2/graphql` |

### Authentication

#### Cloud (API Key)

```bash
# 1. Get authentication token
curl -X POST \
  https://xray.cloud.getxray.app/api/v2/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "YOUR_CLIENT_ID", "client_secret": "YOUR_CLIENT_SECRET"}'

# Response: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 2. Use token in subsequent requests
curl -X GET \
  https://xray.cloud.getxray.app/api/v2/tests \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Server/DC (Basic Auth or PAT)

```bash
# Basic Auth
curl -u username:password \
  https://jira.example.com/rest/raven/2.0/api/test

# Personal Access Token (Jira 8.14+)
curl -H "Authorization: Bearer YOUR_PAT" \
  https://jira.example.com/rest/raven/2.0/api/test
```

### Key Endpoints

#### Import Execution Results

| Format | Endpoint (Cloud) | Endpoint (Server) |
|--------|------------------|-------------------|
| JUnit XML | `POST /api/v2/import/execution/junit` | `POST /rest/raven/2.0/import/execution/junit` |
| Cucumber JSON | `POST /api/v2/import/execution/cucumber` | `POST /rest/raven/2.0/import/execution/cucumber` |
| Robot Framework | `POST /api/v2/import/execution/robot` | `POST /rest/raven/2.0/import/execution/robot` |
| Xray JSON | `POST /api/v2/import/execution` | `POST /rest/raven/2.0/import/execution` |
| Multipart | `POST /api/v2/import/execution/junit/multipart` | `POST /rest/raven/2.0/import/execution/junit/multipart` |

#### Example: Import JUnit Results

```bash
# Cloud
curl -X POST \
  "https://xray.cloud.getxray.app/api/v2/import/execution/junit?projectKey=PROJ&testPlanKey=PROJ-300" \
  -H "Authorization: Bearer $XRAY_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @junit-results.xml

# Server/DC
curl -X POST \
  "https://jira.example.com/rest/raven/2.0/import/execution/junit?projectKey=PROJ&testPlanKey=PROJ-300" \
  -u admin:password \
  -H "Content-Type: application/xml" \
  --data-binary @junit-results.xml
```

#### Response

```json
{
  "id": "10200",
  "key": "PROJ-400",
  "self": "https://jira.example.com/rest/api/2/issue/10200"
}
```

### Rate Limits

| Platform | Limit |
|----------|-------|
| Cloud | 10 requests/second (varies by plan) |
| Server/DC | Depends on Jira configuration |

---

## CLI Quick Reference (IQL-Aligned)

### Authentication

```bash
bun xray auth login --client-id "xxx" --client-secret "xxx"  # Cloud
bun xray auth login --token "xxx" --base-url "https://..."   # Server/DC
bun xray auth status                                          # Verify connection
bun xray auth logout                                          # Clear credentials
```

### Test Operations

```bash
# List tests with filters
bun xray test list                                    # All tests
bun xray test list --status Automated                 # Filter by workflow status
bun xray test list --type Generic                     # Filter by test type
bun xray test list --label regression                 # Filter by label

# Get test details
bun xray test get PROJ-101                            # Single test

# Create new test (via Jira API)
bun xray test create \
  --summary "Verify login with valid credentials" \
  --type Generic \
  --project PROJ \
  --labels "e2e,auth"
```

### Test Execution

```bash
# List executions
bun xray execution list                               # All executions
bun xray execution list --test-plan PROJ-300          # For specific plan

# Create execution
bun xray execution create \
  --summary "CI Run #142" \
  --test-plan PROJ-300 \
  --environment staging
```

### Results Import

```bash
# Import from JUnit XML (Playwright default)
bun xray import junit.xml --project PROJ --test-plan PROJ-300

# Import with auto-execution creation
bun xray import junit.xml \
  --project PROJ \
  --test-plan PROJ-300 \
  --execution-summary "CI Run #142 - Staging" \
  --environment staging

# Import with test info (multipart)
bun xray import junit.xml \
  --project PROJ \
  --test-plan PROJ-300 \
  --test-info '{"fields":{"labels":["automated"]}}'
```

### Test Plans

```bash
bun xray plan list                                    # List all plans
bun xray plan get PROJ-300                            # Get plan details
bun xray plan add-tests PROJ-300 --tests PROJ-101,PROJ-102
```

---

## Data Flow: From Code to Xray

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                         DATA FLOW: PLAYWRIGHT → XRAY                                       ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                            PLAYWRIGHT TEST EXECUTION                                │
    │                                                                                     │
    │   test('PROJ-101 | login flow', async ({ fixture }) => {                            │
    │     await fixture.api.auth.loginWithValidCredentials({  ◄── Generic Test ID        │
    │       email: 'user@test.com',                                                       │
    │       password: 'Pass123!'                                                          │
    │     });                                                                             │
    │   });                                                                               │
    │                                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ Generates
                                              ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                            TEST RESULTS (JUnit XML)                                 │
    │                                                                                     │
    │   <testcase name="PROJ-101 | login flow" time="1.234">                              │
    │     <system-out>Passed</system-out>                                                 │
    │   </testcase>                                                                       │
    │                                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ bun xray import OR CI/CD
                                              ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                              XRAY API PROCESSING                                    │
    │                                                                                     │
    │   POST /api/v2/import/execution/junit?projectKey=PROJ&testPlanKey=PROJ-300          │
    │                                                                                     │
    │   [PARSE]  Reading junit.xml...                                                     │
    │   [MATCH]  Matching "PROJ-101" to existing Test issue...                            │
    │   [CREATE] Creating Test Execution PROJ-400...                                      │
    │   [UPDATE] Creating Test Runs with statuses...                                      │
    │   [DONE]   Results imported successfully                                            │
    │                                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ Jira Updated
                                              ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                               XRAY ENTITIES UPDATED                                 │
    │                                                                                     │
    │   Test Execution PROJ-400 created:                                                  │
    │   → Linked to Test Plan PROJ-300                                                    │
    │   → Environment: staging                                                            │
    │   → Contains Test Runs for matched tests                                            │
    │                                                                                     │
    │   Test Runs updated:                                                                │
    │   → PROJ-101: PASS (1.234s)                                                         │
    │   → PROJ-102: FAIL (2.1s) - "Timeout after 5000ms"                                  │
    │                                                                                     │
    │   Test Plan PROJ-300 status bar updated:                                            │
    │   → Progress: 43/45 tests passing (95.5%)                                           │
    │                                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Dual Reporting Architecture

The TMS works alongside the Automation Framework's reporting:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DUAL REPORTING ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │   AUTOMATION FRAMEWORK REPORTS  │  │      TMS REPORTS (XRAY)         │  │
│  │   (Allure / CI-Generated)       │  │      (Manual + Automated)       │  │
│  ├─────────────────────────────────┤  ├─────────────────────────────────┤  │
│  │                                 │  │                                 │  │
│  │  WHERE: Allure Server / S3     │  │  WHERE: Jira + Xray             │  │
│  │         (Dev team access)       │  │         (Full team access)      │  │
│  │                                 │  │                                 │  │
│  │  WHAT:                          │  │  WHAT:                          │  │
│  │  • Smoke executions             │  │  • Regression cycles only       │  │
│  │  • Sanity executions            │  │  • Manual + Automated tests     │  │
│  │  • Regression (automated only)  │  │  • Linked to requirements       │  │
│  │  • By environment               │  │  • Defect tracking              │  │
│  │  • Historical trends            │  │  • Coverage metrics             │  │
│  │                                 │  │  • Test lifecycle tracking      │  │
│  │  AUDIENCE:                      │  │                                 │  │
│  │  • Dev team (quick feedback)    │  │  AUDIENCE:                      │  │
│  │  • DevOps (pipeline health)     │  │  • QA team (full picture)       │  │
│  │  • QA (automation health)       │  │  • PMs/Stakeholders (status)    │  │
│  │                                 │  │  • Management (go/no-go)        │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `XRAY_CLIENT_ID` | API client ID (Cloud) | Yes (Cloud) |
| `XRAY_CLIENT_SECRET` | API client secret (Cloud) | Yes (Cloud) |
| `XRAY_TOKEN` | Personal Access Token (Server/DC) | Yes (Server) |
| `JIRA_BASE_URL` | Jira instance URL | Yes |
| `JIRA_PROJECT_KEY` | Default project key | Optional |
| `XRAY_TEST_PLAN_KEY` | Default test plan | Optional |
| `XRAY_ENVIRONMENT` | Default test environment | Optional |

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test and Report to Xray

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps

      - name: Run tests
        run: bun run test
        env:
          CI: true

      - name: Get Xray Token
        if: always()
        id: xray-auth
        run: |
          TOKEN=$(curl -s -X POST \
            https://xray.cloud.getxray.app/api/v2/authenticate \
            -H "Content-Type: application/json" \
            -d '{"client_id":"${{ secrets.XRAY_CLIENT_ID }}","client_secret":"${{ secrets.XRAY_CLIENT_SECRET }}"}' | tr -d '"')
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

### Playwright Reporter (playwright-xray)

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['playwright-xray', {
      cloud: true,
      client_id: process.env.XRAY_CLIENT_ID,
      client_secret: process.env.XRAY_CLIENT_SECRET,
      projectKey: 'PROJ',
      testPlan: 'PROJ-300',
    }],
  ],
});
```

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid or expired token | Regenerate API credentials |
| 404 Not Found | Wrong project/issue key | Verify keys exist in Jira |
| 400 No valid tests | Test IDs don't match | Ensure test names include Jira keys |
| 403 Forbidden | Insufficient permissions | Check Xray project permissions |

### Test Matching Strategies

For Xray to match test results to Test issues:

1. **By Jira Key in test name**: `PROJ-101 | test description`
2. **By Generic Test Definition**: Match `testKey` field
3. **By Test Summary**: Exact match (less reliable)

---

## Related Files

- `cli/xray.ts` - CLI tool for Xray operations
- `tests/utils/jiraSync.ts` - Sync utility for test results
- `config/variables.ts` - Environment configuration
- `.env` - Environment variables (XRAY_CLIENT_ID, etc.)
- `.context/test-management-system.md` - IQL methodology reference

---

## External Resources

- [Xray Documentation (Cloud)](https://docs.getxray.app/display/XRAYCLOUD)
- [Xray Documentation (Server/DC)](https://docs.getxray.app/display/XRAY)
- [Xray REST API](https://docs.getxray.app/display/XRAYCLOUD/REST+API)
- [Xray Academy](https://academy.getxray.app/)
- [Atlassian Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Playwright Xray Reporter](https://github.com/inluxc/playwright-xray)
- [IQL Methodology](https://upexgalaxy.com/metodologia)
