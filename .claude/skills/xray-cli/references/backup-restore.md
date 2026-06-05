# Backup & Restore Operations

## Overview

`backup export` + `backup restore` move a project's **full Xray footprint** between projects or between Jira Cloud sites:

- **Tests** — Manual steps / Cucumber gherkin / Generic definition, plus each Test's Repository folder, Precondition links, and coverage keys.
- **Preconditions** — type + definition + folder.
- **Test Plans** + **Test Sets** — membership captured by Test key.
- **Test Repository folders** — derived from each Test's folder path.
- **Test Executions** + run statuses/comments/defects (with `--include-runs`).

Backup schema is **v2.0**. Old **v1.0** backups (tests + executions only) still restore — the new arrays default to empty.

> ### Cross-site reality (read before migrating between sites)
> Xray's GraphQL API addresses everything by the **numeric `issueId`**, which Jira Cloud **re-assigns per site**. A native Jira project migration preserves the **key** (`PROJ-123`), NOT the numeric id. So:
> - Restore matches by **key** (`--sync`) and re-resolves the destination `issueId` via Jira REST.
> - **Coverage links** (Test → Story) are Jira issue-links — they migrate **with** the Jira project, so restore does NOT recreate them (captured only as `coverageKeys` for reference).
> - The Xray **payload** (steps, gherkin, run history, repository folders, precondition definitions) is app-data that a Jira migration does **NOT** carry — that is exactly what restore re-imports.

> ### One site per session
> Auth config (`~/.xray-cli/config.json`) holds **one** `client_id`/`client_secret` at a time. To go site A → site B you must `auth login` with **A**'s creds, export, then `auth login` with **B**'s creds before restore. There are no profiles — verify `auth status` before each phase.

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
| `--no-coverage` | Drop the `coverableIssues` subquery (record-only — never used by restore). Use when export 504s on a project with heavy requirement coverage |

By default **all** entity types are exported (except executions, which stay behind `--include-runs`).

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

The CLI builds two maps as it goes: `originalKey → newKey` and `originalKey → new issueId`. Later phases (folders, sets, plans, runs) remap membership through them, so a Test created in phase 2 lands in the right folder/plan/set/run automatically.

### Mode 1 — Create (default)

Creates fresh issues with **new keys**. Run once (re-running duplicates). A `key-mapping-<project>-<timestamp>.csv` is written so you can reconcile old→new keys afterward.

```bash
bun xray backup restore --file backup.json --project NEW_PROJ --dry-run   # preview
bun xray backup restore --file backup.json --project NEW_PROJ              # execute
```

### Mode 2 — Sync-by-key (the migration path)

Use when the Jira project was already migrated to the target site **with keys preserved** (e.g. UPEXGALAXY67 → 69). The Test/Precondition/Plan/Set/Execution issues already exist; sync re-pushes the Xray payload onto them by resolving each key → destination `issueId` via Jira REST.

```bash
bun xray backup restore --file backup.json --project SAME_KEY --sync
```

Per entity in sync mode:
- **Precondition** → `updatePrecondition` (definition, folder, type).
- **Test** → adds steps / updates gherkin / updates definition; changes test type if needed; links preconditions.
- **Plan / Set / Execution** → resolves the existing issue and `addTests…` to attach members at the Xray layer (the layer a Jira migration leaves empty — same gap `xray repair` fixes).
- **Run statuses** → after tests are attached, each run's status/comment/defects are applied by matching destination Test key.

**Requires target-site Jira creds** (`ATLASSIAN_URL` / `EMAIL` / `API_TOKEN` in `.env`, or `--jira-*` on `auth login`). Without them, key→id resolution fails and sync falls back to create.

## Preflight — destination config gaps

```bash
bun xray backup preflight --dir .backups   # or --file <one-backup.json>
```

Read-only. Export captures the source project's Xray config (test types, run
statuses, test environments) into each backup. Run preflight **while authed to
the destination**: it reads the live destination config and reports what is
**missing** there. Xray has **no config-write API**, so the output is a manual
checklist — create the listed test types / run statuses / test environments in
the destination Xray admin before importing. `--project` overrides the
destination key (default: each backup's own key). `defectIssueTypes` are
captured but not diffed (numeric IDs differ per site).

## Full site-to-site migration runbook

> The complete agnostic, AI-runnable procedure lives in
> [migration-runbook.md](migration-runbook.md) — auth source → `export --all` →
> auth dest → `preflight` → fix config → `restore --sync`. The condensed version:

```bash
# 1. Point CLI at SOURCE site, export everything
bun xray auth login --client-id $A_ID --client-secret $A_SECRET   # site 67 Xray creds
bun xray backup export --project PROJ --output proj.json --include-runs

# 2. Migrate the Jira project 67 → 69 natively (JCMA / CSV), keys preserved.
#    Reinstall Xray on the destination; let it re-detect the migrated Test issues.

# 3. Point CLI at TARGET site (Xray creds + target Jira creds), then sync
bun xray auth login \
  --client-id $B_ID --client-secret $B_SECRET \
  --jira-url $B_URL --jira-email $B_EMAIL --jira-token $B_TOKEN   # site 69
bun xray backup restore --file proj.json --project PROJ --sync --dry-run
bun xray backup restore --file proj.json --project PROJ --sync

# 4. Verify
bun xray test list --project PROJ --limit 50
```

If keys were **not** preserved (different project key on destination), drop `--sync` and restore in create mode, then use the emitted `key-mapping-*.csv`.

## Known limitations

- **Coverage links** are not recreated (carried by the Jira migration; recorded only).
- **Evidence/attachments** on runs are not exported.
- **Step-level run statuses** are exported but only run-level status is re-applied.
- **Folder source** is each Test's folder path — empty folders (no tests) are not recreated.
- GraphQL `getPreconditions`/`getTests` page at **100/req**; the CLI paginates, but a single JQL returning >100 with no pagination support on a sub-field is capped at 100 (e.g. a Plan with >100 tests).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Sync creates duplicates instead of updating | Target Jira creds missing → key→id resolution returned null → fell back to create. Configure `--jira-*` / `.env`. |
| `Cannot resolve numeric projectId` during folders | Target project has zero Tests yet. Folders resolve `projectId` from an existing Test — restore tests first (same run does this) or seed one. |
| Run statuses not applied | Execution had no attached tests at the Xray layer, or destination Test keys didn't match. Confirm tests restored first; check the run-status count in the summary. |
| Restored against the wrong site | You forgot to re-`auth login`. Run `bun xray auth status` before export and before restore. |
| Large export times out | Lower `--limit` (e.g. `--limit 50`). |
| Export 504s (CloudFront) even at low `--limit` | The `coverableIssues` resolver is slow on heavy-coverage projects. Re-run with `--no-coverage` (coverage is record-only, never restored). |
| Run status applied but `No valid issues to add as defects` | A run's defect references a bug key that doesn't resolve on the destination. The status IS set; only the defect link is skipped (logged as a warning). |

## Official API references (verified)

- GraphQL schema: `https://us.xray.cloud.getxray.app/doc/graphql/index.html`
- `createPrecondition`, `updatePrecondition`, `addPreconditionsToTest`
- `createFolder`, `addTestsToFolder`, `getFolder` (Test Repository)
- `getPreconditions`, `Test.folder`, `Test.coverableIssues`
- `updateTestRun`, `updateTestRunStatus`, `addDefectsToTestRun`
