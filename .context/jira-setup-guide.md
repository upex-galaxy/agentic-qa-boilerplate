# Jira + Xray TMS Setup Guide

> **Purpose**: Step-by-step guide to configure Jira with Xray as a Test Management System (TMS) aligned with IQL methodology.
> **Prerequisite**: Read `jira-platform.md` and `test-management-system.md` first.
> **Time Estimate**: 2-4 hours for complete setup.

---

## Table of Contents

1. [Pre-Setup Checklist](#1-pre-setup-checklist)
2. [Install Xray](#2-install-xray)
3. [Configure Project](#3-configure-project)
4. [Set Up Issue Types](#4-set-up-issue-types)
5. [Configure Custom Fields](#5-configure-custom-fields)
6. [Create Workflows](#6-create-workflows)
7. [Set Up Test Repository](#7-set-up-test-repository)
8. [Configure API Access](#8-configure-api-access)
9. [Create Test Plan](#9-create-test-plan)
10. [Final Validation](#10-final-validation)

---

## 1. Pre-Setup Checklist

Before starting, ensure you have:

- [ ] Jira Cloud or Jira Data Center instance
- [ ] Jira Administrator permissions
- [ ] Xray license (trial or paid)
- [ ] Defined your modules/features list
- [ ] Understood Test Type vs Test Run Status distinction (see `jira-platform.md`)

### Key Concepts to Remember

| Concept | Purpose | Example Values |
|---------|---------|----------------|
| **Test Type** | Classification of test | Manual, Cucumber, Generic |
| **Test Status** | Jira workflow status | Draft, Ready, Automated |
| **Test Run Status** | Execution result | TODO, PASS, FAIL, BLOCKED |
| **Requirement** | Coverable issue type | Story, Epic, Bug |

---

## 2. Install Xray

### Step 2.1: Install from Marketplace

**For Jira Cloud:**
1. Go to **Settings** (gear icon) > **Apps** > **Find new apps**
2. Search for "Xray Test Management"
3. Click **Get app** > **Get it now**
4. Wait for installation to complete
5. Click **Get started** to begin configuration

**For Jira Data Center:**
1. Go to **Settings** > **Manage apps** > **Find new apps**
2. Search for "Xray Test Management for Jira"
3. Click **Install** and accept the license agreement
4. Wait for installation to complete

### Step 2.2: Activate License

1. Go to **Settings** > **Manage apps** > **Xray**
2. Enter your license key or start a trial
3. Click **Update**

### Step 2.3: Verify Installation

After installation, you should see:
- New issue types: Test, Pre-Condition, Test Set, Test Execution, Test Plan
- Xray section in **Settings** > **Apps**
- Xray panels in issue views

---

## 3. Configure Project

### Step 3.1: Add Xray Issue Types to Project

1. Go to **Project Settings** > **Issue types**
2. Click **Actions** > **Add Xray Issue Types**
3. Select all Xray issue types:
   - [ ] Test
   - [ ] Pre-Condition
   - [ ] Test Set
   - [ ] Test Execution
   - [ ] Test Plan
4. Click **Add**

### Step 3.2: Configure Requirement Coverage

1. Go to **Project Settings** > **Apps** > **Xray Settings**
2. Click **Test Coverage**
3. Select which issue types can be "covered" by tests:
   - [ ] Story
   - [ ] Epic
   - [ ] Bug (optional)
   - [ ] Task (optional)
4. Click **Save**

### Step 3.3: Configure Issue Type Mapping (Global)

1. Go to **Settings** > **Apps** > **Xray** > **Issue Type Mapping**
2. Configure:
   - **Requirement Issue Types**: Story, Epic
   - **Defect Issue Types**: Bug
3. Click **Save**

---

## 4. Set Up Issue Types

### Step 4.1: Configure Test Issue Type

1. Go to **Settings** > **Issues** > **Issue types**
2. Find **Test** issue type
3. Configure screens and fields (see Step 5)

### Step 4.2: Test Types Configuration

Xray supports three test types out of the box:

| Test Type | Description | When to Use |
|-----------|-------------|-------------|
| **Manual** | Step-by-step test case | Human-executed tests |
| **Cucumber** | BDD/Gherkin syntax | Specification by example |
| **Generic** | Unstructured, ID reference | Automated tests (Playwright, Jest) |

**To configure test types:**
1. Go to **Settings** > **Apps** > **Xray** > **Test Types**
2. Review default types (Manual, Cucumber, Generic)
3. Optionally add custom types if needed

### Step 4.3: Create Test Statuses (Workflow States)

Create these workflow statuses for Test issues:

| Status | Category | Description | IQL Stage |
|--------|----------|-------------|-----------|
| Draft | To Do | Initial state, being written | TMLC |
| Ready | To Do | Ready for review | TMLC |
| Approved | In Progress | Reviewed and approved | TMLC |
| Manual | Done | Will remain manual | TMLC |
| Automating | In Progress | Being automated | TALC |
| Automated | Done | Fully automated | TALC |
| Deprecated | Done | No longer valid | Any |

---

## 5. Configure Custom Fields

### Step 5.1: Review Xray Custom Fields

Xray automatically creates these custom fields:

| Field | Type | Issue Types | Purpose |
|-------|------|-------------|---------|
| Test Type | Select | Test | Manual/Cucumber/Generic |
| Manual Test Steps | Steps Editor | Test | Test steps definition |
| Cucumber Test Type | Select | Test | Feature/Scenario |
| Generic Test Definition | Text | Test | Automation reference |
| Test Environments | Multi-select | Test Execution | Target environments |
| Revision | Text | Test Execution | Build/version info |
| Begin Date | DateTime | Test Execution | Start time |
| End Date | DateTime | Test Execution | End time |
| Test Execution Status | Progress | Test Execution | Overall progress |
| Test Plan Status | Progress | Test Plan | Overall progress |
| Requirement Status | Status | Story/Epic | Coverage status |

### Step 5.2: Add Custom Fields to Screens

1. Go to **Settings** > **Issues** > **Screens**
2. Find **Default Test Screen** or create a new one
3. Add these fields:
   - [ ] Test Type
   - [ ] Manual Test Steps
   - [ ] Generic Test Definition
   - [ ] Labels
   - [ ] Components
   - [ ] Priority
   - [ ] Fix Version

### Step 5.3: Create Project-Specific Fields (Optional)

You can add custom fields for your project:

**Module/Feature Field:**
1. Go to **Settings** > **Issues** > **Custom fields**
2. Click **Create custom field**
3. Select **Select List (single choice)**
4. Name: `Module`
5. Add options: Auth, Bookings, Invoices, Reconciliation, etc.
6. Associate with Test issue type

---

## 6. Create Workflows

### Step 6.1: Create Test Workflow

1. Go to **Settings** > **Issues** > **Workflows**
2. Click **Add workflow**
3. Name: `Test Lifecycle Workflow`
4. Add statuses and transitions:

```
TEST WORKFLOW:

┌─────────┐        ┌─────────┐        ┌──────────┐
│  Draft  │───────▶│  Ready  │───────▶│ Approved │
└─────────┘ Submit └─────────┘ Approve └────┬─────┘
                                            │
              ┌─────────────────────────────┼─────────────────────┐
              │                             │                     │
              ▼                             ▼                     ▼
        ┌──────────┐               ┌─────────────┐        ┌────────────┐
        │  Manual  │               │ Automating  │        │ Deprecated │
        └──────────┘               └──────┬──────┘        └────────────┘
                                          │
                                          ▼
                                   ┌───────────┐
                                   │ Automated │
                                   └───────────┘
```

### Step 6.2: Define Transitions

| From | To | Transition Name | Conditions |
|------|-----|-----------------|------------|
| Draft | Ready | Submit | Summary not empty |
| Ready | Approved | Approve | - |
| Ready | Draft | Reject | - |
| Approved | Manual | Mark as Manual | - |
| Approved | Automating | Start Automation | - |
| Approved | Deprecated | Deprecate | - |
| Automating | Automated | Complete Automation | - |
| Automating | Approved | Cancel Automation | - |
| Manual | Automated | Automate | - |
| Any | Deprecated | Deprecate | - |

### Step 6.3: Assign Workflow to Project

1. Go to **Settings** > **Issues** > **Workflow schemes**
2. Create new scheme or edit existing
3. Associate `Test Lifecycle Workflow` with **Test** issue type
4. Assign scheme to your project

---

## 7. Set Up Test Repository

The Test Repository is Xray's folder structure for organizing tests.

### Step 7.1: Access Test Repository

1. Go to your project
2. Click **Tests** in the left sidebar
3. Click **Test Repository** tab

### Step 7.2: Create Folder Structure

Create a folder structure that matches your application modules:

```
Test Repository
├── Auth
│   ├── Login
│   ├── Logout
│   └── Password Reset
├── Bookings
│   ├── Create Booking
│   ├── Edit Booking
│   └── Cancel Booking
├── Invoices
│   ├── Generate Invoice
│   └── Export Invoice
├── Reconciliation
│   └── Monthly Close
└── Smoke Tests
    └── Critical Paths
```

**To create folders:**
1. Right-click on the repository root
2. Select **Create folder**
3. Enter folder name
4. Repeat for subfolders

### Step 7.3: Organize Existing Tests

1. Select tests from the list
2. Drag and drop into appropriate folders
3. Or use bulk actions to move multiple tests

---

## 8. Configure API Access

### Step 8.1: Create API Credentials (Cloud)

1. Go to **Settings** > **Apps** > **Xray** > **API Keys**
2. Click **Create API Key**
3. Enter a descriptive name: `QA Automation - CI/CD`
4. Click **Generate**
5. **Save both values securely:**
   ```
   Client ID: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   Client Secret: YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
   ```

### Step 8.2: Create Personal Access Token (Server/DC)

1. Click your profile avatar > **Profile**
2. Go to **Personal Access Tokens**
3. Click **Create token**
4. Enter name: `QA Automation`
5. Set expiration (or no expiry for CI)
6. Copy and save the token

### Step 8.3: Test API Connection

**Cloud:**
```bash
# Get authentication token
curl -X POST \
  https://xray.cloud.getxray.app/api/v2/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "YOUR_CLIENT_ID", "client_secret": "YOUR_CLIENT_SECRET"}'

# Should return a JWT token
```

**Server/DC:**
```bash
# Test with PAT
curl -H "Authorization: Bearer YOUR_PAT" \
  https://your-jira.com/rest/raven/2.0/api/test

# Should return test data
```

### Step 8.4: Configure Environment Variables

Create or update your `.env` file:

```bash
# Jira + Xray Configuration
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_PROJECT_KEY=PROJ

# Cloud Authentication
XRAY_CLIENT_ID=your_client_id
XRAY_CLIENT_SECRET=your_client_secret

# Server/DC Authentication (alternative)
# XRAY_TOKEN=your_personal_access_token

# Optional: Default values
XRAY_TEST_PLAN_KEY=PROJ-300
XRAY_ENVIRONMENT=staging
```

---

## 9. Create Test Plan

### Step 9.1: Create Your First Test Plan

1. Click **Create** (+ button)
2. Select **Test Plan** issue type
3. Fill in details:
   - **Summary**: `Regression v2.0`
   - **Fix Version**: Select target version
   - **Description**: Add plan objectives
4. Click **Create**

### Step 9.2: Add Tests to Plan

1. Open the Test Plan
2. Go to **Tests** section
3. Click **Add Tests**
4. Choose method:
   - **Search**: Find individual tests
   - **Test Set**: Add all tests from a set
   - **Folder**: Add all tests from a repository folder
5. Select tests and click **Add**

### Step 9.3: Create Test Execution

1. Open the Test Plan
2. Click **Create Test Execution**
3. Fill in details:
   - **Summary**: `Regression Staging Sprint 5`
   - **Test Environments**: Select `staging`
   - **Revision**: Enter build version
4. Tests are automatically added from the plan
5. Click **Create**

### Step 9.4: Configure Test Environments

1. Go to **Settings** > **Apps** > **Xray** > **Test Environments**
2. Add environments:
   - `local`
   - `dev`
   - `staging`
   - `production`
3. Click **Save**

---

## 10. Final Validation

### Step 10.1: Validate Issue Type Configuration

Run these checks:

- [ ] Test issue type has all required fields
- [ ] Test Types are configured (Manual, Cucumber, Generic)
- [ ] Workflow is assigned to Test issue type
- [ ] Test Repository is accessible
- [ ] Requirement coverage is enabled for Story/Epic

### Step 10.2: Validate API Connection

```bash
# Set up authentication
export XRAY_CLIENT_ID="your_client_id"
export XRAY_CLIENT_SECRET="your_client_secret"

# Test CLI connection
bun xray auth status

# List tests (should return data)
bun xray test list

# Create a test case
bun xray test create \
  --summary "Verify login flow" \
  --type Generic \
  --project PROJ

# Import sample results
bun xray import sample-results.xml \
  --project PROJ \
  --test-plan PROJ-300
```

### Step 10.3: Test Full Workflow

1. **Create Test**: Create a Generic test with ID pattern
2. **Add to Plan**: Add test to a Test Plan
3. **Run Playwright**: Execute with JUnit reporter
4. **Import Results**: Use API or CLI to import
5. **Verify in Xray**: Check Test Execution shows results

### Step 10.4: Document Your Configuration

After setup, save your specific values:

```yaml
# Xray Configuration Reference
jira:
  base_url: https://your-company.atlassian.net
  project_key: PROJ

xray:
  api_type: cloud  # or server
  client_id: (stored in .env)
  client_secret: (stored in .env)

issue_types:
  test: 10001
  pre_condition: 10002
  test_set: 10003
  test_execution: 10004
  test_plan: 10005

environments:
  - local
  - dev
  - staging
  - production

test_plan_naming: "Regression [Environment] [Sprint/Version]"
test_execution_naming: "CI Run #[number] - [Environment]"
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Xray panels not showing | Check issue type scheme includes Xray types |
| Cannot add tests to plan | Verify tests exist and user has permissions |
| API returns 401 | Regenerate API credentials |
| API returns 404 | Verify project key and issue keys exist |
| Tests not matching on import | Ensure test names include Jira keys (e.g., `PROJ-101 \| test name`) |
| Coverage not showing | Enable requirement coverage in project settings |

### Useful JQL Queries

```jql
# Find all automated tests
project = PROJ AND issuetype = Test AND status = Automated

# Find tests without coverage
project = PROJ AND issuetype = Test AND "Requirement Status" is EMPTY

# Find failed test runs
project = PROJ AND issuetype = "Test Execution" AND "Test Execution Status" = FAIL

# Find tests in specific folder
project = PROJ AND issuetype = Test AND "Test Repository Path" ~ "Auth/Login"

# Find tests by label
project = PROJ AND issuetype = Test AND labels in (regression, smoke)
```

---

## Next Steps

After completing this setup:

1. **Create Tests**: Start creating test cases for your application
2. **Organize Repository**: Structure tests by module/feature
3. **Link to Requirements**: Associate tests with Stories/Epics
4. **Configure CI/CD**: Set up automated result import
5. **Train Team**: Share this guide with team members

---

## Sources & References

- [Xray Cloud Documentation](https://docs.getxray.app/display/XRAYCLOUD)
- [Xray Server/DC Documentation](https://docs.getxray.app/display/XRAY)
- [Xray Academy - Essentials Course](https://academy.getxray.app/)
- [Xray REST API Reference](https://docs.getxray.app/display/XRAYCLOUD/REST+API)
- [Atlassian Jira Administration](https://support.atlassian.com/jira-cloud-administration/)
- [Playwright Xray Integration](https://github.com/inluxc/playwright-xray)

---

**Document Created**: 2026-02-09
**IQL Version**: 2.0
**Compatible With**: jira-platform.md v1.0, cli/xray.ts v1.0.0
