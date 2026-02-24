---
name: xray-cli
description: Xray Cloud test management CLI for creating tests, managing executions, importing results, and backup/restore operations. Use when the user needs to interact with Xray Cloud API for test case management.
allowed-tools: Bash(bun xray:*)
---

# Xray CLI - Test Management

## Quick start

```bash
# Check authentication status
bun xray auth status
# Login with credentials
bun xray auth login --client-id ABC123 --client-secret xyz789
# List tests in a project
bun xray test list --project DEMO
# Create a test execution
bun xray exec create --project DEMO --summary "Sprint 1 Tests"
# Import JUnit results
bun xray import junit --file results.xml --project DEMO
```

## Commands

### Authentication

```bash
bun xray auth login --client-id <id> --client-secret <secret>
bun xray auth login --client-id <id> --client-secret <secret> --project DEMO
bun xray auth login --jira-url https://your-instance.atlassian.net --jira-email user@email.com --jira-token <token>
bun xray auth logout
bun xray auth status
```

### Test Management

```bash
# Create tests
bun xray test create --project DEMO --summary "Verify login"
bun xray test create --project DEMO --summary "Verify login" --type Manual
bun xray test create --project DEMO --summary "API check" --type Generic --definition "curl http://api.test"
bun xray test create --project DEMO --summary "Login flow" --type Cucumber --gherkin "Feature: Login..."

# Manual test with steps
bun xray test create --project DEMO --summary "Verify login" \
  --step "Open app|Login form is displayed" \
  --step "Enter credentials|user@test.com|Success message"

# Get test details
bun xray test get DEMO-123
bun xray test get --id <issueId>

# List tests
bun xray test list --project DEMO
bun xray test list --project DEMO --limit 50
bun xray test list --jql "project = DEMO AND labels = critical"

# Add step to existing test
bun xray test add-step --test <issueId> --action "Click button" --result "Form submits"
```

### Test Executions

```bash
# Create execution
bun xray exec create --project DEMO --summary "Sprint 1 Regression"
bun xray exec create --project DEMO --summary "Sprint 1" --tests <id1>,<id2>,<id3>

# Get execution details
bun xray exec get <issueId>

# List executions
bun xray exec list --project DEMO

# Manage tests in execution
bun xray exec add-tests --execution <id> --tests <id1>,<id2>
bun xray exec remove-tests --execution <id> --tests <id1>,<id2>
```

### Test Runs

```bash
# Get run details
bun xray run get <runId>

# List runs from execution
bun xray run list --execution <issueId>

# Update run status
bun xray run status --id <runId> --status PASSED
bun xray run status --id <runId> --status FAILED
bun xray run status --id <runId> --status TODO
bun xray run status --id <runId> --status EXECUTING
bun xray run status --id <runId> --status ABORTED
bun xray run status --id <runId> --status BLOCKED

# Update step status
bun xray run step-status --run <runId> --step <stepId> --status PASSED

# Add comment
bun xray run comment --id <runId> --comment "Test completed successfully"

# Link defects
bun xray run defect --id <runId> --issues DEMO-456,DEMO-789
```

### Test Plans

```bash
# Create plan
bun xray plan create --project DEMO --summary "Q1 2025 Test Plan"
bun xray plan create --project DEMO --summary "Release 2.0" --tests <id1>,<id2>

# List plans
bun xray plan list --project DEMO
```

### Test Sets

```bash
# Create set
bun xray set create --project DEMO --summary "Smoke Tests"
bun xray set create --project DEMO --summary "Regression" --tests <id1>,<id2>

# Get set details
bun xray set get <issueId>

# List sets
bun xray set list --project DEMO

# Manage tests in set
bun xray set add-tests --set <id> --tests <id1>,<id2>
bun xray set remove-tests --set <id> --tests <id1>,<id2>
```

### Import Results

```bash
# Import JUnit XML
bun xray import junit --file results.xml
bun xray import junit --file results.xml --project DEMO
bun xray import junit --file results.xml --plan DEMO-100
bun xray import junit --file results.xml --execution DEMO-200

# Import Cucumber JSON
bun xray import cucumber --file cucumber-report.json
bun xray import cucumber --file cucumber-report.json --project DEMO

# Import Xray JSON format
bun xray import xray --file xray-results.json
```

### Backup & Restore

```bash
# Export all tests from project
bun xray backup export --project DEMO --output demo-backup.json

# Export with test execution runs
bun xray backup export --project DEMO --output demo-backup.json --include-runs

# Export only tests with Xray data (excludes empty tests)
bun xray backup export --project DEMO --output demo-backup.json --only-with-data

# Dry run restore (preview changes)
bun xray backup restore --file demo-backup.json --project NEW_PROJ --dry-run

# Full restore (creates new tests)
bun xray backup restore --file demo-backup.json --project NEW_PROJ

# Sync mode (updates existing tests instead of creating duplicates)
bun xray backup restore --file demo-backup.json --project PROJ --sync

# Restore with key mapping
bun xray backup restore --file demo-backup.json --project PROJ --map-keys mappings.csv
```

## Environment Variables

```bash
XRAY_CLIENT_ID      # Xray API Client ID
XRAY_CLIENT_SECRET  # Xray API Client Secret
JIRA_BASE_URL       # Jira instance URL (for sync features)
JIRA_EMAIL          # Jira account email
JIRA_API_TOKEN      # Jira API token
```

## Config Files

- `~/.xray-cli/config.json` - Stored credentials and default project
- `~/.xray-cli/token.json` - Cached auth token (24h validity)

## Example: Complete Test Workflow

```bash
# 1. Login
bun xray auth login --client-id $XRAY_CLIENT_ID --client-secret $XRAY_CLIENT_SECRET --project DEMO

# 2. Create a manual test with steps
bun xray test create --project DEMO --summary "Verify user registration" \
  --step "Navigate to signup page|Signup form displayed" \
  --step "Fill required fields|Fields accept input" \
  --step "Submit form|Success message shown"

# 3. Create a test execution
bun xray exec create --project DEMO --summary "Registration Tests - Sprint 5"

# 4. Run automated tests and import results
bun xray import junit --file test-results/junit.xml --project DEMO

# 5. Check execution status
bun xray exec list --project DEMO --limit 5
```

## Example: Project Migration

```bash
# 1. Export from source project
bun xray backup export --project OLD_PROJ --output backup.json --include-runs --only-with-data

# 2. Preview what will be restored
bun xray backup restore --file backup.json --project NEW_PROJ --dry-run

# 3. Restore to target project
bun xray backup restore --file backup.json --project NEW_PROJ

# 4. If tests already exist, use sync mode
bun xray backup restore --file backup.json --project NEW_PROJ --sync
```

## Specific tasks

* **Backup & Restore operations** [references/backup-restore.md](references/backup-restore.md)
* **GraphQL API reference** [references/graphql-api.md](references/graphql-api.md)
* **Test type management** [references/test-types.md](references/test-types.md)
