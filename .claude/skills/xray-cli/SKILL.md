---
name: xray-cli
description: "Xray Cloud test management via `bun xray` CLI: create/list tests, manage test executions and plans, import JUnit/Cucumber/Xray JSON results, update run statuses, back up and restore projects, link defects. Triggers on: create a test in Xray, import test results to Xray, list Xray executions, update run status, backup Xray project, restore Xray tests, link defect to run, sync tests, Xray auth login. Do NOT use for: writing automated tests (test-automation); documenting test cases or ROI analysis (test-documentation); running CI regression suites (regression-testing); browser automation (playwright-cli)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
allowed-tools: Bash(bun xray:*)
complementary_categories: [tms]
---

# Xray CLI - Test Management

## Modality check (critical)

This skill owns `[TMS_TOOL]` **only in Modality jira-xray** (Jira Cloud + Xray plugin installed). Before invoking any command from this skill:

1. Confirm the project is in Modality jira-xray. Resolution logic lives in `test-documentation/SKILL.md` §Phase 0.
2. If the project is in Modality jira-native (no Xray plugin) -> **do not use this skill**. Instead, load `/acli` — TMS operations map to native Jira issues (see `test-documentation/references/jira-setup.md`).

Agents arriving here from a `[TMS_TOOL] ...` pseudocode block without having resolved modality first should pause and consult the modality resolver before proceeding.

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

## Issue references: Jira keys vs numeric IDs

Every flag that takes an issue reference (`--execution`, `--plan`, `--set`, `--tests`, plus the positional argument of `exec get` / `set get`) accepts **both forms** interchangeably:

- **Jira key**: `{{PROJECT_KEY}}-194` — resolved via Jira REST in-process. Requires Jira credentials configured (`auth login --jira-url --jira-email --jira-token` or the `JIRA_*` env vars).
- **Numeric Xray issueId**: `1042389` — used as-is, no resolution call.

If only Xray credentials are configured (no Jira creds) and you pass a Jira key, the CLI fails with a guiding error pointing at the missing flags. Test Run identifiers (`run get`, `run status --id`, etc.) are GraphQL run ids — these are NOT Jira keys and resolution does not apply to them.

```bash
# Both forms work identically
bun xray exec get {{PROJECT_KEY}}-194
bun xray exec get 1042389
bun xray exec add-tests --execution {{PROJECT_KEY}}-194 --tests {{PROJECT_KEY}}-100,{{PROJECT_KEY}}-101,{{PROJECT_KEY}}-102
bun xray exec add-tests --execution 1042389 --tests 1041000,1041001,1041002
```

## Commands

### Authentication

`auth login` reads every credential from `.env` by default
(`XRAY_CLIENT_ID/SECRET`, `ATLASSIAN_URL/EMAIL/API_TOKEN`); bun auto-loads `.env`.
Pass a flag ONLY to override the environment — e.g. switching to another site
mid-migration. With a populated `.env`, `bun xray auth login` (no args) is enough.
Login prints which source (env/flag/unset) each credential resolved from.

```bash
bun xray auth login                                    # all creds from .env
bun xray auth login --client-id <id> --client-secret <secret>   # override XRAY creds (other site)
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

# Enrich an EXISTING test (e.g. Stage-4 regression promotion: add rich Gherkin to a sprint test)
bun xray test update-gherkin --test <issueId> --gherkin "Feature: Login..."
bun xray test update-definition --test <issueId> --definition "curl http://api.test"
bun xray test update-type --test <issueId> --type Cucumber
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

# Add comment to a specific step (overwrites the previous step comment)
bun xray run step-comment --run <runId> --step <stepId> --comment "Reproduced on 2026-04-29 build 4172"

# Add comment
bun xray run comment --id <runId> --comment "Test completed successfully"

# Link defects
bun xray run defect --id <runId> --issues DEMO-456,DEMO-789

# Attach evidence files (PNG/JPG/PDF/log/JSON/...) to a run
bun xray run evidence --id <runId> --file ./screenshots/error.png
bun xray run evidence --id <runId> --file a.png --file b.png --file c.png
bun xray run evidence --id <runId> --dir ./.context/PBI/epics/EPIC-{{PROJECT_KEY}}-100-<epic-slug>/stories/STORY-{{PROJECT_KEY}}-8-<slug>/evidence/

# Attach evidence to a specific step within a run
bun xray run step-evidence --run <runId> --step <stepId> --file step3.png

# Inspect what is already attached
bun xray run evidence-list --id <runId>

# Remove an attachment (by id or by filename)
bun xray run evidence-rm --id <runId> --evidence <evidenceId>
bun xray run evidence-rm --id <runId> --filename error.png
```

> **Body size limit**: Xray Cloud rejects requests larger than 20 MB. The CLI auto-chunks large `--dir` uploads into batches under that limit (using ~15 MB per batch to leave headroom for the GraphQL envelope), so a folder of 14 PNGs at 600 KB each ships in a single round trip while a folder with one 30 MB recording would be rejected — split or compress those before uploading.

### Test Plans

```bash
# Create plan
bun xray plan create --project DEMO --summary "Q1 2025 Test Plan"
bun xray plan create --project DEMO --summary "Release 2.0" --tests <id1>,<id2>

# List plans
bun xray plan list --project DEMO

# Manage tests in plan
bun xray plan add-tests --plan {{PROJECT_KEY}}-110 --tests {{PROJECT_KEY}}-100,{{PROJECT_KEY}}-101
bun xray plan remove-tests --plan {{PROJECT_KEY}}-110 --tests {{PROJECT_KEY}}-100
```

### Sync & Repair (Jira-layer ↔ Xray-layer reconciliation)

When a Test Execution or Test Plan is created through a Jira fallback path
without authenticated Xray, the Jira layer (issuelinks, custom fields)
accepts the issue but the Xray layer never registers the test attachment —
runs come back empty and statuses cannot be set. Use these commands to
detect and repair the drift.

```bash
# Diff a single Test Execution (dry-run by default)
bun xray exec sync --execution {{PROJECT_KEY}}-194
bun xray exec sync --execution {{PROJECT_KEY}}-194 --apply       # re-attach missing tests at the Xray layer

# Same for a Test Plan
bun xray plan sync --plan {{PROJECT_KEY}}-110
bun xray plan sync --plan {{PROJECT_KEY}}-110 --apply

# Bulk scan every Test Execution + Test Plan in a project
bun xray repair --project {{PROJECT_KEY}}                        # report only
bun xray repair --project {{PROJECT_KEY}} --apply                # re-attach every drift detected
bun xray repair --project {{PROJECT_KEY}} --apply --limit 200    # scan up to 200 of each type
```

**What sync reports**

- *Missing at Xray layer*: tests linked at the Jira layer but not registered with Xray. `--apply` re-attaches them.
- *Missing at Jira layer*: tests registered with Xray but without a Jira issuelink. Reported only — sync never auto-deletes.

**Requirements**: both Xray AND Jira credentials must be configured (`auth login --jira-url --jira-email --jira-token`); the Jira-layer view comes from Jira REST, separate from the Xray GraphQL API.

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

Backup schema **v2.0** captures the full footprint: tests, preconditions, test
plans, test sets, repository folders, and (opt-in) executions + run statuses.
v1.0 backups (tests + executions only) still restore. Full detail +
cross-site/migration runbook → [references/backup-restore.md](references/backup-restore.md).

```bash
# Export the full footprint (everything except executions)
bun xray backup export --project DEMO --output demo-backup.json

# Export EVERY project on the site that has Xray data -> .backups/<KEY>-backup.json
# (lists projects via Jira, prints an inventory, 504-resilient). One login per SITE.
bun xray backup export --all --include-runs

# Add executions + run statuses (heavier)
bun xray backup export --project DEMO --output demo-backup.json --include-runs

# Legacy v1.0 shape (tests only) / skip a specific entity
bun xray backup export --project DEMO --tests-only
bun xray backup export --project DEMO --no-preconditions --no-folders

# Dry run restore (preview changes)
bun xray backup restore --file demo-backup.json --project NEW_PROJ --dry-run

# Full restore (creates new issues; emits key-mapping CSV)
bun xray backup restore --file demo-backup.json --project NEW_PROJ

# Sync mode — match existing issues by KEY (needs target Jira creds).
# Use this for site->site migration where keys were preserved.
bun xray backup restore --file demo-backup.json --project {{PROJECT_KEY}} --sync

# Restore with explicit key mapping (when keys changed)
bun xray backup restore --file demo-backup.json --project {{PROJECT_KEY}} --map-keys mappings.csv

# Preflight: report destination config gaps before importing (read-only, authed to dest)
bun xray backup preflight --dir .backups
```

> **Full cross-site migration**: follow the agnostic runbook in
> [references/migration-runbook.md](references/migration-runbook.md) — auth source →
> `export --all` → auth dest → `preflight` → fix config → `restore --sync`.

> **Cross-site gotcha**: Xray's GraphQL addresses by numeric `issueId` (re-assigned
> per Jira site); a project migration preserves the **key**, not the id. Always use
> `--sync` for site→site moves so restore re-resolves ids by key. Auth config holds
> **one** site at a time — re-run `auth login` to switch sites between export and
> restore, and confirm with `auth status`.

## Environment Variables

```bash
# Xray Cloud API (required for xray-cli auth)
XRAY_CLIENT_ID      # Xray API Client ID
XRAY_CLIENT_SECRET  # Xray API Client Secret

# Atlassian credentials — single source of truth, no overrides
ATLASSIAN_URL       # Atlassian site URL (e.g. https://your-org.atlassian.net)
ATLASSIAN_EMAIL     # Atlassian account email
ATLASSIAN_API_TOKEN # Atlassian API token
```

Pass these to `bun xray auth login` via `--jira-url` / `--jira-email` / `--jira-token` when you want explicit flags, or just let the binary pick them up from the environment.

## Config Files

- `~/.xray-cli/config.json` - Stored credentials and default project
- `~/.xray-cli/token.json` - Cached auth token (24h validity)

## Fallback: Atlassian MCP

If `xray` CLI is not installed or authenticated, fall back to the Atlassian MCP server for Xray-compatible operations that the MCP exposes (coverage is partial — MCP surfaces basic Xray entities but lacks bulk import/export).

**When to prefer MCP over xray-cli**:
- `xray` binary is not installed in the environment.
- Auth cannot be completed in the current session.
- Operation is simple (single test status update, small query).

**When to prefer xray-cli over MCP**:
- Bulk test import (JUnit/Cucumber/Xray JSON).
- Backup / restore / large sync operations.
- Anything involving Test Plans or Test Executions at scale (xray-cli is far more complete).

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

## Example: Project / Site Migration

```bash
# 1. Point CLI at SOURCE site, export the full footprint
bun xray auth login --client-id $A_ID --client-secret $A_SECRET   # source Xray creds
bun xray backup export --project PROJ --output backup.json --include-runs

# 2. (Site->site only) migrate the Jira project natively (JCMA/CSV), keys preserved.
#    Reinstall Xray on the destination so it re-detects the migrated Test issues.

# 3. Point CLI at TARGET site (Xray + target Jira creds), preview, then restore
bun xray auth login \
  --client-id $B_ID --client-secret $B_SECRET \
  --jira-url $B_URL --jira-email $B_EMAIL --jira-token $B_TOKEN   # target site
bun xray backup restore --file backup.json --project PROJ --sync --dry-run

# 4a. Keys preserved (same project key)  -> sync by key
bun xray backup restore --file backup.json --project PROJ --sync
# 4b. Keys changed (different project)    -> create fresh, then reconcile via emitted CSV
bun xray backup restore --file backup.json --project NEW_PROJ
```

## Anti-patterns — NEVER do these

- **X1.** NEVER call `bun xray ...` directly from workflow skills (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`). Workflow skills use `[TMS_TOOL]` pseudo-code and load `/xray-cli` — only this skill owns the literal CLI syntax.
- **X2.** NEVER cache Xray bearer tokens beyond their 24h TTL. Stale tokens produce silent 401s mid-import that look like network blips; re-auth via `bun xray auth login` instead of catching the error.
- **X3.** NEVER batch-import test results without first verifying the Test Plan / Test Execution keys exist in the target project. Orphan results get rejected and the whole import aborts — pre-check with `exec get` / `plan get`.
- **X4.** NEVER hand-craft Xray JSON payloads (`testInfo`, `iterations`, `evidences`) outside `bun xray`. The CLI owns the canonical shape; drift from it breaks future schema migrations and silently mis-attributes evidence to the wrong run.
- **X5.** NEVER run `bun xray import` or `bun xray backup restore` against production without `--dry-run` first. These commands write irreversibly across hundreds of TCs and runs — preview the diff before applying.
- **X6.** NEVER mix Modality jira-xray and Modality jira-native workflows in the same skill phase. Modality is resolved once in `/test-documentation` Phase 0; downstream phases inherit and never re-decide mid-flow.
- **X7.** NEVER push Xray run results for TCs flagged `to_be_automated=no` in the ROI verdict. Those are terminal Manual cases — pushing automated runs against them creates audit noise and breaks the Candidate / Manual / Deferred reporting.

## Specific tasks

* **Backup & Restore operations** [references/backup-restore.md](references/backup-restore.md)
* **GraphQL API reference** [references/graphql-api.md](references/graphql-api.md)
* **Test type management** [references/test-types.md](references/test-types.md)
