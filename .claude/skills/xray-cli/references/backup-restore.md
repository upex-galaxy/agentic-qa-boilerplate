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
>
> **Back up that file before the first `auth login` of a migration.** After a site move it is routinely the ONLY on-disk copy of the source Xray keys (`.env` may hold keys for a different site entirely), and `auth login` overwrites it:
> ```bash
> cp ~/.xray-cli/config.json ~/.xray-cli/config.SOURCE-<site>.json.bak
> ```
> Xray API keys are **per Xray instance** — a pair generated on site A does not authenticate against site B. Generate the destination pair in Jira > Apps > Xray > Global Settings > API Keys (Xray admin required; the secret is shown once).

> ### `auth status` is only half the check
> It reports the configured **Jira** URL. The Xray keys are a separate credential and can point somewhere else. Neither test counts nor querying a site-exclusive project discriminate (Xray returns `0 total` for a nonexistent project, same as an empty one). Compare **numeric issueIds** instead — they are reassigned per site, so the same key carries a different id on each:
> ```bash
> jq -r '.tests[0:3][] | "\(.originalKey) id=\(.issueId)"' .backups/<KEY>-backup.json
> # vs the destination's id for the same key, via Jira REST /rest/api/3/search/jql
> ```

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

> **Clear `.backups/` before a fresh `--all` export.** A project whose export fails leaves the previous run's file in place, looking current. And on a **case-insensitive volume (macOS APFS default)** writing `MYM-backup.json` over an existing `mym-backup.json` replaces the content but keeps the old filename — so always build restore paths from `ls .backups/`, never from the project key.

> **`Skipped` conflates two very different things.** A project is skipped both when it is genuinely empty and when its Tests exist only at the Jira layer, never registered with Xray. The second case is real data that will NOT migrate. Reconcile the skip list: compare Jira's `project=<KEY> AND issuetype=Test` count against `bun xray test list --project <KEY>`. Nonzero in Jira with zero in Xray means those Tests were never registered with Xray and cannot be exported. **`bun xray repair` does not fix this** — it reconciles the membership of existing Test Executions and Test Plans, never standalone Test issues (and only writes with `--apply`). Try an Xray re-index on that site; if the counts still disagree, record them as a known loss rather than reporting the project as migrated.

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

#### Sync mode is idempotent — an interrupted restore is safe to re-run

Every entity is resolved by `originalKey` and updated in place, so a repeat run converges and reports `0 created`. This matters because restores are long: **run statuses dominate the runtime** (one API call each), so duration tracks total runs, not test count. Background anything above roughly 50 runs. If a restore is killed mid-flight, re-run it — stopping is what leaves the project half-migrated.

#### Reading a restore summary

Every entity reports `created / synced / failed` separately. **`0 created` is the anti-duplicate signal that matters**: it means every entity resolved by key and was updated in place. A nonzero `created` on a `--sync` run means key resolution failed for those entities and the restore duplicated them.

- `Nothing to sync for <KEY> (source has no steps/gherkin/definition)` is **normal output**, not a failure. It is common at scale for Manual tests whose content lives in the description.
- A `key-mapping-*.csv` is emitted into `.backups/` even when nothing was created. Noise, not a signal.

`--dry-run` resolves each key exactly as the real run does, so it distinguishes `Would sync <KEY>` from `Would create <summary>` for every entity type including executions, sets and plans. The cost is one Jira REST lookup per entity, which makes a dry-run of a large project noticeably slower than the summary alone would suggest.

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

> **Preflight passing does NOT mean the destination is ready.** It reads project
> *config*; it never exercises entity resolution. A project where Xray is
> installed but **not configured** passes preflight cleanly while every entity
> lookup fails. That state has its own signature:
>
> ```
> bun xray test list --project <KEY>   ->  "Tests (114 total, showing 0)"   <- count, no rows
>                                          + a WARN naming the two possible causes
> bun xray test get <KEY>-123          ->  "Test not found"
> ```
>
> Fix it in the destination UI per project (Miscellaneous, Test Coverage, Defect
> Mapping, Test Environments) followed by an Xray **re-index**. There is no API
> for any of it. The one other cause of the same signature is Test issues that
> were never registered with Xray — compare against the Jira `issuetype = Test`
> count to tell them apart. The gate before restoring is that `test list` returns **rows**,
> not merely a nonzero total — a `--sync` restore that cannot resolve key→issueId
> falls back to CREATE and duplicates the whole project.

## Full site-to-site migration runbook

> The complete agnostic, AI-runnable procedure lives in
> [migration-runbook.md](migration-runbook.md) — credential inventory + backup →
> prove prerequisites → auth source → `export --all` → auth dest → **configure
> Xray per project (manual UI gate)** → `preflight` → dry-run → `restore --sync`
> → verify → `/jira-instance-migration`. The condensed version:

```bash
# 0. BEFORE any auth login: inventory creds and have the USER back up the cached config
jq -r '.jira_base_url' ~/.xray-cli/config.json ; grep -E '^(ATLASSIAN_URL|XRAY_CLIENT_ID)' .env
cp ~/.xray-cli/config.json ~/.xray-cli/config.SOURCE-<site>.json.bak     # user runs this

# 1. Point CLI at SOURCE site, export everything
bun xray auth login --client-id $A_ID --client-secret $A_SECRET   # site A Xray creds
bun xray backup export --all --include-runs        # reconcile the Skipped list vs Jira

# 2. Migrate the Jira projects A → B natively (JCMA / CSV), keys preserved.
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

# 5. Verify — ALWAYS pass --limit above the expected count (lists truncate at 20)
bun xray test list --project PROJ --limit 300
bun xray exec list --project PROJ --limit 100

# 6. Repoint the repo: custom-field IDs were reassigned by the move
/jira-instance-migration
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
| `test list` prints `(N total, showing 0)`; `test get <KEY>` says `Test not found` | Xray is installed but the **project is not configured** on that site. Configure Miscellaneous / Test Coverage / Defect Mapping / Test Environments in the UI, then re-index. Preflight does NOT catch this. |
| Post-restore counts look lower than the backup | The list commands default to **20 rows** and truncate silently while the header shows the true total. Re-check with `--limit` above the expected count, and read the `(N total)` header. |
| Dry-run says `Would create ...` under `--sync` | Real signal: that key did not resolve on the destination, so the restore WOULD duplicate it. Check the key exists there and that `auth status` shows the destination Jira URL. |
| Restore was interrupted (timeout, Ctrl-C) | Safe to re-run. `--sync` resolves by `originalKey` and updates in place; the repeat converges with `0 created`. Background projects above ~50 runs. |
| `Nothing to sync for <KEY>` on many tests | Not a failure. Those source tests carry no steps/gherkin/definition. Verify with `jq '[.tests[] \| select((.steps//[])\|length > 0)] \| length'` on the backup. |
| `jq '.tests[].key'` returns null; backup looks empty | The field is `originalKey`, not `key`. |
| A project exported before is missing from a new `--all` run, but its file is still there | Stale `.backups/`. Clear it before exporting; on case-insensitive volumes old files also keep their original name. |
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
