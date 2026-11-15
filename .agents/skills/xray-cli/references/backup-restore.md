# Backup and restore operations

Command reference for `backup export`, `backup restore` and `backup preflight`. They move a project's **full Xray footprint** between projects or between Jira Cloud sites. The step-by-step site-to-site procedure, with its gates and checks, is [migration-runbook.md](migration-runbook.md). This file holds the options, the file format and the troubleshooting table.

## Overview

The backup holds:

- **Tests**: Manual steps, Cucumber gherkin or Generic definition, plus each Test's Repository folder, Precondition links and coverage keys.
- **Preconditions**: type, definition and folder.
- **Test Plans** and **Test Sets**: membership captured by Test key.
- **Test Repository folders**, derived from each Test's folder path.
- **Test Executions** with run statuses, comments and defects (with `--include-runs`).

The backup schema is **v2.0**. Old **v1.0** backups (tests and executions only) still restore, and the new arrays default to empty.

> ### Cross-site reality
> Xray's GraphQL API addresses everything by the **numeric `issueId`**, which Jira Cloud **re-assigns per site**. A native Jira project migration preserves the **key** (`PROJ-123`) and not the numeric id. So:
> - Restore matches by **key** (`--sync`) and re-resolves the destination `issueId` through Jira REST.
> - **Coverage links** (Test to Story) are Jira issue links. They migrate with the Jira project, so restore does not recreate them (they are captured as `coverageKeys` for reference only).
> - The Xray **payload** (steps, gherkin, run history, repository folders, precondition definitions) is app-data that a Jira migration does not carry. Restore re-imports exactly that.

> ### One site per session
> Auth config (`~/.xray-cli/config.json`) holds one `client_id` and `client_secret` at a time. To go from site A to site B, run `auth login` with A's credentials, export, then run `auth login` with B's credentials before restore. There are no profiles, so check `auth status` before each phase.
>
> Back up that file before the first `auth login` of a migration. After a site move it is routinely the only on-disk copy of the source Xray keys (`.env` may hold keys for a different site), and `auth login` overwrites it:
> ```bash
> cp ~/.xray-cli/config.json ~/.xray-cli/config.SOURCE-<site>.json.bak
> ```
> Xray API keys belong to one Xray instance, so a pair generated on site A does not authenticate against site B. Generate the destination pair in Jira > Apps > Xray > Global Settings > API Keys (Xray admin required; the secret is shown once).

> ### `auth status` is half the check
> It reports the configured **Jira** URL, while the Xray keys are a separate credential that can point elsewhere. Test counts and site-exclusive projects do not discriminate either. Compare numeric issueIds for the same key on both sites: "Site discriminator" in the runbook has the commands.

## Export Command

```bash
bun xray backup export --project <key> [options]
```

| Option | Description |
|--------|-------------|
| `--project <key>` | Project key (required unless `--all`) |
| `--all` | Export EVERY project on the site with Xray data into `.backups/<KEY>-backup.json`. Lists projects via Jira REST, probes each, prints an inventory, auto-retries a project without coverage on a 504. One login per **site** instead of per project. |
| `--output <file>` | Output path, single-project mode (default: `xray-backup-<project>-<timestamp>.json`) |
| `--include-runs` | Also export Test Executions + run statuses (heavier) |
| `--only-with-data` | Skip tests that have no Xray data (steps/gherkin/definition) |
| `--limit <n>` | Fetch batch size (default: 100) |
| `--tests-only` | v1.0-style: tests only, skip preconditions/plans/sets/folders |
| `--no-preconditions` | Skip preconditions |
| `--no-plans` | Skip test plans |
| `--no-sets` | Skip test sets |
| `--no-folders` | Skip repository folders |
| `--no-coverage` | Drop the `coverableIssues` subquery (record-only, never used by restore). Use when export 504s on a project with heavy requirement coverage |

By default **all** entity types are exported (except executions, which stay behind `--include-runs`).

> **Clear `.backups/` before a fresh `--all` export.** A project whose export fails leaves the previous run's file in place, looking current. On a **case-insensitive volume (the macOS APFS default)**, writing `MYM-backup.json` over an existing `mym-backup.json` replaces the content but keeps the old filename. Build restore paths from `ls .backups/`, never from the project key.

> **`Skipped` covers two different cases.** A project is skipped when it is empty and also when its Tests exist only at the Jira layer, never registered with Xray. The second case is real data that will not migrate, and `bun xray repair` does not fix it (it reconciles the membership of existing Test Executions and Test Plans and writes only with `--apply`). Compare Jira's `issuetype = Test` count with `bun xray test list --project <KEY>` for every skipped project. The runbook's Step 2 has the commands and what to do with a mismatch.

```bash
# Full backup of everything, including run history
bun xray backup export --project DEMO --output full-backup.json --include-runs

# Just the test definitions (legacy v1.0 shape)
bun xray backup export --project DEMO --tests-only
```

### Backup File Structure (v2.0)

```json
{
  "version": "2.0",
  "exportedAt": "2026-06-03T10:30:00.000Z",
  "project": "DEMO",
  "testsCount": 1, "preconditionsCount": 1, "testPlansCount": 1,
  "testSetsCount": 1, "foldersCount": 1, "executionsCount": 1,
  "tests": [
    {
      "originalKey": "DEMO-123", "issueId": "10123",
      "summary": "Verify login", "testType": "Manual",
      "steps": [{ "action": "Open login", "result": "Form shown" }],
      "labels": ["smoke"],
      "folderPath": "/Regression/Login",
      "preconditionKeys": ["DEMO-50"],
      "coverageKeys": ["DEMO-7"]
    }
  ],
  "preconditions": [
    { "originalKey": "DEMO-50", "issueId": "10050", "summary": "User exists",
      "preconditionType": "Manual", "definition": "A user is seeded",
      "folderPath": "/Regression" }
  ],
  "testPlans": [
    { "originalKey": "DEMO-300", "summary": "Release 1.0", "testKeys": ["DEMO-123"] }
  ],
  "testSets": [
    { "originalKey": "DEMO-400", "summary": "Smoke", "testKeys": ["DEMO-123"] }
  ],
  "folders": [
    { "path": "/Regression/Login", "testKeys": ["DEMO-123"] }
  ],
  "executions": [
    { "originalKey": "DEMO-200", "summary": "Sprint 5",
      "testRuns": [{ "testKey": "DEMO-123", "status": "PASSED", "comment": "OK" }] }
  ]
}
```

## Restore Command

```bash
bun xray backup restore --file <path> --project <key> [options]
```

| Option | Description |
|--------|-------------|
| `--file <path>` | Backup file (required) |
| `--project <key>` | Target project key (required) |
| `--dry-run` | Preview only, no writes |
| `--sync` | Match existing issues by key (needs target Jira creds) instead of creating duplicates |
| `--map-keys <file>` | CSV `old_key,new_key` for pre-known mappings |

### Restore order (dependency-safe)

```
1. Preconditions   (create | sync-by-key → updatePrecondition)
2. Tests           (create | sync-by-key) + link Preconditions
3. Folders         (createFolder ancestors → addTestsToFolder)
4. Test Sets       (create | sync → add tests)
5. Test Plans      (create | sync → add tests)
6. Executions      (create | sync → attach tests → set run status/comment/defects)
```

The CLI builds two maps as it goes, from `originalKey` to the new key and from `originalKey` to the new issueId. Later phases (folders, sets, plans, runs) remap membership through them, so a Test created in phase 2 lands in the right folder, plan, set and run on its own.

### Mode 1: Create (default)

Creates fresh issues with **new keys**. Run it once, because a second run duplicates. A `key-mapping-<project>-<timestamp>.csv` is written so you can reconcile old and new keys afterward.

```bash
bun xray backup restore --file backup.json --project NEW_PROJ --dry-run   # preview
bun xray backup restore --file backup.json --project NEW_PROJ              # execute
```

### Mode 2: Sync-by-key (the migration path)

Use it when the Jira project was already migrated to the target site **with keys preserved** (for example `<SITE>67` to `<SITE>69`). The Test, Precondition, Plan, Set and Execution issues already exist, and sync re-pushes the Xray payload onto them by resolving each key to its destination `issueId` through Jira REST.

```bash
bun xray backup restore --file backup.json --project SAME_KEY --sync
```

Per entity in sync mode:
- A Precondition goes through `updatePrecondition` (definition, folder, type).
- A Test gets its steps added, its gherkin or definition updated, its test type changed if needed, and its preconditions linked.
- A Plan, Set or Execution is resolved to the existing issue, and `addTests…` attaches the members at the Xray layer. A Jira migration leaves that layer empty, which is the same gap `xray repair` fixes.
- Run statuses are applied after the tests are attached: each run's status, comment and defects go to the destination Test with the matching key.

Sync needs the **target-site Jira credentials** (`ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` in `.env`, plus the host from `.agents/project.yaml`, or `--jira-*` on `auth login`). Without them key-to-id resolution fails and sync falls back to create.

#### Sync mode is idempotent, so an interrupted restore is safe to re-run

Every entity is resolved by `originalKey` and updated in place, so a repeat run converges and reports `0 created`. That matters because restores are long: **run statuses dominate the runtime** at one API call each, so duration follows total runs and not test count. Run anything above roughly 50 runs in the background. If a restore is killed mid-flight, re-run it, because stopping is what leaves the project half-migrated.

#### Reading a restore summary

Every entity reports `created / synced / failed` separately. **`0 created` is the signal that nothing was duplicated**: every entity resolved by key and was updated in place. A nonzero `created` on a `--sync` run means key resolution failed for those entities and the restore duplicated them.

- `Nothing to sync for <KEY> (source has no steps/gherkin/definition)` is normal output. It is common at scale for Manual tests whose content lives in the description.
- A `key-mapping-*.csv` is written into `.backups/` even when nothing was created. It is noise.

`--dry-run` resolves each key exactly as the real run does, so it separates `Would sync <KEY>` from `Would create <summary>` for every entity type, executions, sets and plans included. It costs one Jira REST lookup per entity, so a dry-run of a large project is slow.

## Preflight: destination config gaps

```bash
bun xray backup preflight --dir .backups   # or --file <one-backup.json>
```

Read-only. Export captures the source project's Xray config (test types, run statuses, test environments) into each backup. Run preflight **while authed to the destination**: it reads the live destination config and reports what is **missing** there. Xray has no config-write API, so the output is a manual checklist. Create the listed test types, run statuses and test environments in the destination Xray admin before importing. `--project` overrides the destination key (default: each backup's own key). `defectIssueTypes` are captured but not diffed, because their numeric IDs differ per site.

> **A passing preflight does not mean the destination is ready.** It reads project *config* and never exercises entity resolution. A project where Xray is installed but **not configured** passes preflight while every entity lookup fails, and `test list` prints `Tests (114 total, showing 0)`. The signature, the fix (configure per project in the UI, then re-index) and the other cause (Tests never registered with Xray) are under "Signature of installed but not configured" in the runbook's Step 3b. Before restoring, `test list` must return **rows**, not just a nonzero total. A `--sync` restore that cannot resolve key to issueId falls back to CREATE and duplicates the whole project.

## Full site-to-site migration runbook

> The complete agnostic procedure is [migration-runbook.md](migration-runbook.md). Its sequence is: credential inventory and backup, prove the prerequisites, auth to the source, `export --all`, auth to the destination, **configure Xray per project (manual UI gate)**, `preflight`, dry-run, `restore --sync`, verify, then `/jira-administration instance-migration`. The condensed version:

```bash
# 0. Before any auth login: inventory creds and have the USER back up the cached config
jq -r '.jira_base_url' ~/.xray-cli/config.json ; bun run --silent jira:url ; bunx varlock load --agent --filter 'XRAY_*'   # redacted, never grep .env
cp ~/.xray-cli/config.json ~/.xray-cli/config.SOURCE-<site>.json.bak     # user runs this

# 1. Point CLI at SOURCE site, export everything
bun xray auth login --client-id $A_ID --client-secret $A_SECRET   # site A Xray creds
bun xray backup export --all --include-runs        # reconcile the Skipped list vs Jira

# 2. Migrate the Jira projects from A to B natively (JCMA / CSV), keys preserved.
#    Install Xray on the destination AND configure it per project + re-index.

# 3. Point CLI at TARGET site (Xray creds + target Jira creds)
bun xray auth login \
  --client-id $B_ID --client-secret $B_SECRET \
  --jira-url $B_URL --jira-email $B_EMAIL --jira-token $B_TOKEN   # site B
bun xray backup preflight --dir .backups           # until "Preflight clean"
bun xray test list --project PROJ --limit 3        # GATE: must print ROWS, not just a total

# 4. Dry-run, then sync
bun xray backup restore --file .backups/<FILE> --project PROJ --sync --dry-run
bun xray backup restore --file .backups/<FILE> --project PROJ --sync

# 5. Verify: always pass --limit above the expected count (lists truncate at 20)
bun xray test list --project PROJ --limit 300
bun xray exec list --project PROJ --limit 100

# 6. Repoint the repo: custom-field IDs were reassigned by the move
/jira-administration instance-migration
```

If keys were not preserved (a different project key on the destination), drop `--sync`, restore in create mode and use the emitted `key-mapping-*.csv`.

A restore writes to the destination site. When nobody is at the keyboard, run the dry-run and stop there unless the delegating brief approves the real restore. "With nobody at the keyboard" in the runbook has the full split.

## Known limitations

- **Coverage links** are not recreated. The Jira migration carries them, and the backup only records them.
- **Evidence and attachments** on runs are not exported.
- **Step-level run statuses** are exported, but only the run-level status is re-applied.
- **Folder source** is each Test's folder path, so empty folders (no tests) are not recreated.
- GraphQL `getPreconditions` and `getTests` page at **100 per request**. The CLI paginates, but a sub-field without pagination support is capped at 100 (for example a Plan with more than 100 tests).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Sync creates duplicates instead of updating | Target Jira creds are missing, so key-to-id resolution returned null and fell back to create. Configure `--jira-*` or `.env`. |
| `test list` prints `(N total, showing 0)`; `test get <KEY>` says `Test not found` | Xray is installed but the **project is not configured** on that site. Configure Miscellaneous, Test Coverage, Defect Mapping and Test Environments in the UI, then re-index. Preflight does not catch this. |
| Post-restore counts look lower than the backup | The list commands default to a small `--limit` (see `cli/xray`) and truncate silently while the header shows the true total. Re-check with `--limit` above the expected count and read the `(N total)` header. |
| Dry-run says `Would create ...` under `--sync` | A real signal: that key did not resolve on the destination, so the restore would duplicate it. Check the key exists there and that `auth status` shows the destination Jira URL. |
| Restore was interrupted (timeout, Ctrl-C) | Safe to re-run. `--sync` resolves by `originalKey` and updates in place, so the repeat converges with `0 created`. Run projects above about 50 runs in the background. |
| `Nothing to sync for <KEY>` on many tests | Not a failure: those source tests carry no steps, gherkin or definition. Verify with `jq '[.tests[] \| select((.steps//[])\|length > 0)] \| length'` on the backup. |
| `jq '.tests[].key'` returns null; backup looks empty | The field is `originalKey`, not `key`. |
| A project exported before is missing from a new `--all` run, but its file is still there | Stale `.backups/`. Clear it before exporting, because on case-insensitive volumes old files also keep their original name. |
| `Cannot resolve numeric projectId` during folders | The target project has no Tests yet. Folders resolve `projectId` from an existing Test, so restore tests first (the same run does this) or seed one. |
| Run statuses not applied | The execution had no attached tests at the Xray layer, or the destination Test keys did not match. Confirm the tests restored first and check the run-status count in the summary. |
| Restored against the wrong site | `auth login` was not repeated for the second site. Run `bun xray auth status` before export and before restore. |
| Large export times out | Lower `--limit` (e.g. `--limit 50`). |
| Export 504s (CloudFront) even at low `--limit` | The `coverableIssues` resolver is slow on heavy-coverage projects. Re-run with `--no-coverage` (coverage is record-only and never restored). |
| Run status applied but `No valid issues to add as defects` | A run's defect references a bug key that does not resolve on the destination. The status is set and only the defect link is skipped (logged as a warning). |

## Official API references

- GraphQL schema: `https://us.xray.cloud.getxray.app/doc/graphql/index.html`
- `createPrecondition`, `updatePrecondition`, `addPreconditionsToTest`
- `createFolder`, `addTestsToFolder`, `getFolder` (Test Repository)
- `getPreconditions`, `Test.folder`, `Test.coverableIssues`
- `updateTestRun`, `updateTestRunStatus`, `addDefectsToTestRun`
