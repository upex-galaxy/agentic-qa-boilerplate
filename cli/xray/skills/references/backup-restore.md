# Backup & Restore Operations

## Overview

The backup/restore feature allows you to:
- Export all Xray test data from a project
- Migrate tests between projects
- Sync test definitions after project migrations
- Create backups before major changes

## Export Command

```bash
bun xray backup export --project <key> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--project <key>` | Project key (required) |
| `--output <file>` | Output file path (default: `xray-backup-<project>-<timestamp>.json`) |
| `--include-runs` | Include test execution runs and their statuses |
| `--only-with-data` | Only export tests that have Xray data (steps, gherkin, definition) |
| `--limit <n>` | Batch size for fetching (default: 100) |

### Export Examples

```bash
# Basic export
bun xray backup export --project DEMO

# Export with execution history
bun xray backup export --project DEMO --include-runs

# Export only tests with actual test data (skip empty tests)
bun xray backup export --project DEMO --only-with-data

# Complete backup with all data
bun xray backup export --project DEMO --output full-backup.json --include-runs --only-with-data
```

### Backup File Structure

```json
{
  "version": "2.0.0",
  "exportDate": "2025-02-23T10:30:00.000Z",
  "project": "DEMO",
  "tests": [
    {
      "key": "DEMO-123",
      "summary": "Verify login functionality",
      "testType": "Manual",
      "steps": [
        {
          "action": "Navigate to login page",
          "data": "",
          "result": "Login form displayed"
        }
      ],
      "precondition": null,
      "labels": ["smoke", "critical"],
      "status": "Open"
    }
  ],
  "executions": [
    {
      "key": "DEMO-200",
      "summary": "Sprint 5 Execution",
      "runs": [
        {
          "testKey": "DEMO-123",
          "status": "PASSED",
          "comment": "All steps verified"
        }
      ]
    }
  ],
  "testSets": [...],
  "testPlans": [...]
}
```

## Restore Command

```bash
bun xray backup restore --file <path> --project <key> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--file <path>` | Backup file path (required) |
| `--project <key>` | Target project key (required) |
| `--dry-run` | Preview changes without making them |
| `--sync` | Update existing tests instead of creating duplicates |
| `--map-keys <file>` | CSV file with old_key,new_key mappings |

### Restore Modes

#### 1. Dry Run (Preview)

```bash
bun xray backup restore --file backup.json --project NEW_PROJ --dry-run
```

Shows what would be created/updated without making changes:
- Number of tests to create
- Test types breakdown
- Any issues detected

#### 2. Create Mode (Default)

```bash
bun xray backup restore --file backup.json --project NEW_PROJ
```

- Creates new tests in target project
- Preserves all test data (steps, definitions, gherkin)
- Does NOT update existing tests (creates duplicates if run twice)

#### 3. Sync Mode

```bash
bun xray backup restore --file backup.json --project NEW_PROJ --sync
```

Intelligent update behavior:
- Matches tests by summary (title)
- Updates test type if different
- Syncs test steps (adds missing, preserves existing)
- Updates definitions and gherkin content
- Creates tests that don't exist
- Requires `--jira-url`, `--jira-email`, `--jira-token` in auth config

### Key Mapping

For migrations where issue keys changed:

```csv
# mappings.csv
OLD-123,NEW-456
OLD-124,NEW-457
OLD-125,NEW-458
```

```bash
bun xray backup restore --file backup.json --project NEW --map-keys mappings.csv
```

## Migration Workflow

### Step 1: Export Source Project

```bash
# Full backup with all data
bun xray backup export \
  --project OLD_PROJ \
  --output migration-backup.json \
  --include-runs \
  --only-with-data
```

### Step 2: Preview Restore

```bash
bun xray backup restore \
  --file migration-backup.json \
  --project NEW_PROJ \
  --dry-run
```

### Step 3: Execute Restore

```bash
# If creating fresh tests
bun xray backup restore \
  --file migration-backup.json \
  --project NEW_PROJ

# If syncing existing tests (after manual migration)
bun xray backup restore \
  --file migration-backup.json \
  --project NEW_PROJ \
  --sync
```

### Step 4: Verify

```bash
bun xray test list --project NEW_PROJ --limit 50
```

## Sync Mode Details

Sync mode is designed for scenarios where:
- Tests were manually migrated between Jira instances
- Test keys changed but summaries remained the same
- You need to update test definitions without creating duplicates

### How Sync Works

1. **Match by Summary**: Finds existing tests with matching summary text
2. **Update Type**: If test type differs, updates via GraphQL mutation
3. **Sync Steps**: For Manual tests, adds any missing steps
4. **Update Definition**: For Generic tests, updates the definition field
5. **Update Gherkin**: For Cucumber tests, updates the gherkin field

### Requirements for Sync

```bash
# Must have Jira credentials configured for issue lookups
bun xray auth login \
  --client-id $XRAY_CLIENT_ID \
  --client-secret $XRAY_CLIENT_SECRET \
  --jira-url https://your-instance.atlassian.net \
  --jira-email your@email.com \
  --jira-token $JIRA_API_TOKEN
```

## Troubleshooting

### "Test not found" during sync

The backup file references a test key that doesn't exist in the target project. Either:
- The test was deleted
- The key mapping is incorrect
- Use `--map-keys` to provide correct mappings

### "Failed to update test type"

The GraphQL mutation for updating test type failed. This can happen if:
- The target test type doesn't exist in the project
- The test is in a locked state
- Permission issues with the API credentials

### Large Exports Timing Out

Use `--limit` to reduce batch size:
```bash
bun xray backup export --project HUGE_PROJ --limit 50
```
