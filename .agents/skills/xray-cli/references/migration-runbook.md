# Xray cross-site migration runbook (agnostic)

Procedure for moving a Jira site's **Xray app-data** (tests, preconditions, plans, sets, repository folders, run statuses) to another Jira Cloud site with `bun xray`. It works for any project and any site. Follow it end to end when the user names this runbook.

Placeholders: `<SOURCE_SITE>` and `<DEST_SITE>` (for example `your-org67` and `your-org69`), and `<PROJECT_KEY>`. Take the values from the user's input and never hard-code a project or site.

## What this does and does not do

- **Does**: re-import the Xray payload that a native Jira migration leaves behind: steps, gherkin and definitions, precondition definitions, plan and set membership at the Xray layer, repository folders, run statuses.
- **Does not**: migrate Jira issues (the user's native Jira migration, JCMA or CSV, runs first with keys preserved), recreate coverage links (the Jira migration carries them), or create Xray project **config** (Xray has no config-write API, see Step 3b).

A native Jira migration, observed on a real Test, leaves this:

| | Source | Destination before restore | After restore |
|---|---|---|---|
| Key, summary, labels, status | present | **present** | present |
| Test Type | `Cucumber` | **`Manual`** (silent default) | `Cucumber` |
| Gherkin / steps | full | **empty** | full |

The issue arrives looking healthy and only the Xray payload is missing, so nobody notices until someone opens a test and finds it blank.

## Mental model

- Xray GraphQL addresses everything by the **numeric issueId**, which each site re-assigns. A Jira migration preserves the **key**. Restore matches by key (`--sync`) and re-resolves the destination issueId through Jira REST.
- `~/.xray-cli/config.json` holds one site's credentials, so a session works on one site at a time. Switching sites means running `auth login` again. Run `auth status` before every export and every restore.
- Credentials resolve from `.env` by default (`XRAY_CLIENT_ID/SECRET`, `ATLASSIAN_EMAIL/API_TOKEN`). The Jira host comes from `.agents/project.yaml`, not from `.env`. Pass flags only to override, for a site whose credentials are not in `.env`.
- **Xray API keys belong to one Xray instance.** A pair generated on `<SOURCE_SITE>` does not authenticate against `<DEST_SITE>`. The user generates a new pair in the destination (Jira > Apps > Xray > Global Settings > API Keys, which needs Xray admin; the secret is shown once).

## Prerequisites (the user owns them, confirm first)

1. The Jira projects were migrated natively to `<DEST_SITE>` with **keys preserved** (same project key, no collision). Without that this is a create migration, see "Keys not preserved" at the end.
2. Xray is **installed** on `<DEST_SITE>` and each destination project is **configured** (Step 3b). Installed is not enough, and the difference stays invisible until you look for it.
3. You have Xray API keys (client id and secret) for both sites, plus a Jira API token and email for `<DEST_SITE>`.

Do not take these on trust. Steps 0 and 0b prove them.

---

## Procedure

### 0. Credential inventory and backup (do this first)

Finish this step before any `auth login`. After a site move the cached config and `.env` routinely point at different sites, and `auth login` overwrites the cached one. On a real migration the source Xray keys existed only in `~/.xray-cli/config.json`, while `.env` held stale keys from a third site. Logging in first would have destroyed all access to the source before anything was exported.

Inventory all three sources and report what each says:

```bash
jq -r '"cached  -> \(.jira_base_url)  client_id=\(if (.client_id // "") == "" then "unset" else "set" end)"' ~/.xray-cli/config.json
bun run --silent jira:url    # the host: .agents/project.yaml, not .env
bunx varlock load --agent --filter 'XRAY_*'   # which Xray keys .env holds, values redacted
# same keys in the cache and in .env? compared inside the loader, prints only same / different
bunx varlock run -- sh -c '[ "$(jq -r .client_id ~/.xray-cli/config.json)" = "$XRAY_CLIENT_ID" ] && echo same || echo different'
bun xray auth status
```

Then have the **user** back up the cached credentials:

```bash
cp ~/.xray-cli/config.json ~/.xray-cli/config.SOURCE-<site>.json.bak
```

Hand this command to the user. The Claude Code permission classifier blocks the agent from copying credential files, and the copy matters: it is the only on-disk record of the source Xray keys.

Clear or archive a stale `.backups/` from any previous migration. On a **case-insensitive volume (the macOS APFS default)** a new export writes into an existing file and keeps that file's original name, so `.backups/mym-backup.json` can hold a fresh `MYM` export. A project that fails to export also leaves the old backup in place, looking current. Build restore paths from `ls .backups/`, never from the project key.

### 0b. Prove the prerequisites

Three read-only checks, all against Jira REST (not Xray). Set both credential sets up front so the snippets are copy-pasteable. The source comes from the cached config and the destination by name from `.env`:

```bash
SRC_URL=$(jq -r .jira_base_url  ~/.xray-cli/config.json | sed 's:/*$::')
SRC_EMAIL=$(jq -r .jira_email   ~/.xray-cli/config.json)
SRC_TOKEN=$(jq -r .jira_api_token ~/.xray-cli/config.json)
# destination pair: $ATLASSIAN_EMAIL / $ATLASSIAN_API_TOKEN, used by name (see the note below)
DEST_URL=$(bun run --silent jira:url)
```

`DEST_URL` comes from `.agents/project.yaml` because the host is not a local variable. That matters most in a migration: a stale copy would still name the source site, and every destination check below would then pass by inspecting the site you are leaving.

> **Secret hygiene (Critical Rule #1)**: never `source .env` into the agent's shell and never `grep` it. The destination pair is not in the agent's environment (the harness opens bare), so run each destination check inside the loader, by name: `bunx varlock run -- sh -c 'curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" ...'`. Canon: `agentic-qa-core/references/secret-hygiene.md`.

Below, `$SITE`, `$EMAIL` and `$TOKEN` stand for one of those pairs. Run each check against both sites.

**1. Project key parity.** List projects on both sites and diff the keys:

```bash
curl -sS -u "$EMAIL:$TOKEN" "$SITE/rest/api/3/project/search?maxResults=100" \
  | jq -r '.values[] | "\(.key)\t\(.name)"'
```

Report source-only keys explicitly. A native Jira migration can leave a project behind without any message.

**2. Issue-count parity per shared project.** This is the real proof that keys were preserved, far stronger than eyeballing the key list:

```bash
curl -sS -u "$EMAIL:$TOKEN" -X POST "$SITE/rest/api/3/search/approximate-count" \
  -H "Content-Type: application/json" --data '{"jql":"project=<KEY>"}' | jq -r .count
```

Counts must match per project. A mismatch means the Jira migration is incomplete, so stop and fix that before touching Xray.

**3. Xray issue types present on the destination**:

```bash
curl -sS -u "$EMAIL:$TOKEN" "$DEST/rest/api/3/issuetype" | jq -r '[.[].name] | unique | join(", ")'
```

Look for `Test`, `Test Plan`, `Test Set`, `Test Execution`, `Precondition`. This proves the app is **installed**. It says nothing about whether any project is **configured** (Step 3b).

### 1. Authenticate to the source site

If `.env` already points at `<SOURCE_SITE>`:

```bash
bun xray auth login        # reads all creds from .env
bun xray auth status       # confirm Jira URL = <SOURCE_SITE>
```

Otherwise override with flags:

```bash
bun xray auth login --client-id <SRC_ID> --client-secret <SRC_SECRET>
```

Export needs only the Xray client id and secret, because it reads Xray GraphQL and not Jira.

Verify the site instead of assuming it. `auth status` shows the Jira URL, which is half the answer: the Xray keys are a separate credential and can belong to a different site than the Jira URL stored beside them. "Site discriminator" below has the reliable check.

### 2. Export every project that has Xray data

```bash
bun xray backup export --all --include-runs
```

- It enumerates all projects (Jira REST), probes each for Xray Tests, exports the ones with data into `.backups/<KEY>-backup.json`, and prints an **inventory table**. A project without coverage is retried automatically after a CloudFront 504.
- The inventory is your worklist for destination config. Note which projects carry data.
- If one project keeps returning 504, export it alone with `--no-coverage`.

**Reconcile the skip list against Jira.** A project is reported as `Skipped` both when it is empty and when its Tests exist only at the Jira layer, never registered with Xray. The second case is real user data that will not migrate, and the skip line does not tell the two apart:

```bash
# for each skipped project: does Jira disagree with Xray?
curl -sS -u "$EMAIL:$TOKEN" -X POST "$SITE/rest/api/3/search/approximate-count" \
  -H "Content-Type: application/json" \
  --data '{"jql":"project=<KEY> AND issuetype=Test"}' | jq -r .count
bun xray test list --project <KEY> --limit 1     # Xray's view
```

Nonzero in Jira and zero in Xray means those Tests were never registered with Xray on the source. They cannot be exported and no CLI command fixes it. `bun xray repair` does not apply: it reconciles the Jira-layer and Xray-layer *membership* of existing Test Executions and Test Plans, never standalone Test issues, and it only scans unless you pass `--apply`.

Try an Xray **re-index** on the source site first, since the same symptom on a destination project is cured by configure plus re-index (Step 3b). If the count still disagrees afterwards, record those Tests as a known loss, tell the user which project and how many, and let them decide whether to recreate them by hand. Do not report that project as migrated.

### 3. Authenticate to the destination site

```bash
bun xray auth login \
  --client-id <DEST_ID> --client-secret <DEST_SECRET> \
  --jira-url https://<DEST_SITE>.atlassian.net \
  --jira-email <DEST_EMAIL> --jira-token <DEST_TOKEN>
bun xray auth status        # confirm Jira URL = <DEST_SITE>
```

Destination restore (`--sync`) needs the destination Jira credentials to resolve each key to an issueId.

#### Site discriminator

Confirming which site the **Xray** keys resolve to is harder than it looks. Two obvious checks fail:

- Querying a project that exists on only one site. Xray returns `Tests (0 total, showing 0)` for a nonexistent project, the same as for an empty one.
- Comparing total test counts. After a successful Jira migration the destination reports the same totals as the source, so the number proves nothing.

What works is comparing ids, because numeric issueIds are reassigned per site. Take an id from the backup and compare it with the destination's id for the **same key**:

```bash
jq -r '.tests[0:3][] | "\(.originalKey)  id=\(.issueId)"' .backups/<KEY>-backup.json
curl -sS -u "$EMAIL:$TOKEN" -X POST "$DEST/rest/api/3/search/jql" \
  -H "Content-Type: application/json" \
  --data '{"jql":"project=<KEY> AND issuetype=Test","maxResults":2,"fields":["summary"]}' \
  | jq -r '.issues[] | "\(.key)  id=\(.id)"'
```

Disjoint id ranges mean different sites. The same key with a different id is what you want to see before a `--sync` restore.

### 3b. Human gate: configure Xray per destination project

Xray offers no API and no GraphQL mutation for this. It is manual UI work, once per project, and it blocks everything after it. Budget for it: the unit of effort is the project count from the Step 2 inventory.

In the destination, configure these per project:

- **Miscellaneous**
- **Test Coverage**
- **Defect Mapping**
- **Test Environments**

Then run an Xray **re-index** ("Xray needs to keep an updated index of Jira issues and Xray entities").

#### Signature of "installed but not configured"

This state is silent and easy to misread as data loss or wrong credentials:

```
bun xray test list --project <KEY>   ->  "Tests (114 total, showing 0)"   <- count, no rows
                                         + a WARN naming the two possible causes
bun xray test get <KEY>-123          ->  "Test not found: <KEY>-123"
bun xray backup preflight            ->  succeeds, resolves every project
```

A passing preflight does not rule this out, because preflight reads project config and does not exercise entity resolution.

The same count-without-rows signature appears when Test issues exist in Jira but were never registered with Xray (Step 2). The list commands cannot tell the two apart, which is why they warn about both. Compare the Jira `issuetype = Test` count with Xray's: equal counts point at project config, and a Jira-only surplus points at unregistered issues.

This is a hard stop before restore. A `--sync` restore that cannot resolve a key to an issueId falls back to CREATE, which duplicates every entity in the project.

### 4. Preflight: destination config gaps

```bash
bun xray backup preflight --dir .backups
```

Read-only. For each project it reports what exists in the source config but is **missing on the destination**: test types, run statuses (used and defined), test environments. Xray has no config-write API, so apply each reported gap by hand in the `<DEST_SITE>` Xray admin (Settings > Apps > Xray) before importing. The default test types (Manual, Generic, Cucumber) and statuses (PASSED, FAILED and so on) exist everywhere, so only custom ones show up here. Re-run until it reports `Preflight clean`.

### 4b. Re-verify the gate before writing anything

After the config work, confirm the Step 3b signature is gone. The gate is that `test list` returns **rows**, not just a nonzero total:

```bash
bun xray test list --project <KEY> --limit 3     # must print actual test rows
```

If it still prints a count with no rows, the project config or the re-index is incomplete. Stop here.

### 5. Dry-run per project, then verify counts

```bash
bun xray backup restore --file .backups/<FILE> --project <KEY> --sync --dry-run
```

`0 created` on every line is the signal that nothing will be duplicated. The dry-run resolves each key the way the real run does, so `Would sync <KEY>` means the entity will be updated in place, and `Would create <summary>` means that key did not resolve on the destination and the restore would duplicate it. Any `created` on a `--sync` run is a reason to stop.

Each entity costs a Jira REST lookup, so a dry-run of a large project takes a while. That is the price of a preview that tells the truth.

Then confirm the destination already holds the container issues, which is the independent check against duplicates:

```bash
bun xray exec list --project <KEY> --limit 100
bun xray set  list --project <KEY> --limit 100
bun xray plan list --project <KEY> --limit 100
```

The counts should match the backup, and then restore updates in place with no duplicates. Get the user's go-ahead before any real write.

### 6. Real restore (writes to the destination)

```bash
bun xray backup restore --file .backups/<FILE> --project <KEY> --sync
```

The order respects dependencies: preconditions, tests (with folder and precondition links), folders, sets, plans, executions (with run statuses). A key-mapping CSV lands in `.backups/` even when nothing was created, which is noise.

**Duration and interruption.** Run statuses dominate the runtime at one API call each, so time follows total runs, not test count. Run any project above roughly 50 runs in the background. An interrupted restore is safe to re-run: `--sync` resolves every entity by `originalKey` and updates in place, so a repeat converges and reports `0 created`. Re-run it, because stopping leaves the project half-migrated.

Expected benign output:

- `Nothing to sync for <KEY> (source has no steps/gherkin/definition)` means what it says. It is common at scale for Manual tests that keep their content in the description.
- `defect link skipped` means a run's defect references a bug key absent from the destination. The run status still applies.

### 7. Verify

Pass an explicit `--limit` above the expected count on every verification command. The list commands default to a small `--limit` (see `cli/xray`) and truncate silently while the header still shows the true total. After a restore that produces a convincing false data-loss alarm at the worst moment.

```bash
bun xray test list --project <KEY> --limit 300 | head -5
bun xray exec list --project <KEY> --limit 100
bun xray set  list --project <KEY> --limit 100
bun xray plan list --project <KEY> --limit 100
```

Read counts from the `(N total)` header instead of counting rows, and compare them with the backup:

```bash
jq -r '"tests=\(.tests|length) pre=\(.preconditions|length) sets=\(.testSets|length) plans=\(.testPlans|length) execs=\(.executions|length) runs=\([.executions[].testRuns//[]|length]|add // 0)"' .backups/<FILE>
```

Compare the **test-type distribution** too, since a Jira migration flattens it to Manual without saying so:

```bash
jq -r '[.tests[].testType] | group_by(.) | map("\(.[0]) x\(length)") | join(" / ")' .backups/<FILE>
bun xray test list --project <KEY> --limit 300 | grep -oE '\[(Manual|Cucumber|Generic)\]' | sort | uniq -c
```

#### Canary test (fastest end-to-end proof)

Before restoring, pick one **Cucumber** test per project and record its state. After restoring, read it again. One call proves the whole chain:

```bash
jq -r '.tests[] | select(.testType=="Cucumber") | .originalKey' .backups/<FILE> | head -1
bun xray test get <THAT_KEY>       # Type must flip Manual -> Cucumber, gherkin must appear
```

### 8. Repoint the repo (separate, required)

A site move also **reassigns Jira custom-field IDs**. The old id usually still exists on the new instance and points at a **different field**, so the failure is not a 404. It is a `200 OK` that writes your data into the wrong field, silently.

Run `/jira-administration instance-migration`. It repoints `.agents/project.yaml` (the only place the host is written; a stale `ATLASSIAN_URL` in `.env` is deleted, never updated) and the machine-global `acli` session, and it regenerates the `.agents/` catalogs the move invalidated. An operator who follows only this Xray runbook is left with poisoned catalogs and no error to warn them.

---

## With nobody at the keyboard

The gates in this runbook are: the credential backup (Step 0), the destination configuration (Step 3b), the go-ahead before the real restore (Step 5), and the decision about Tests lost at the source (Step 2). Decision rules: `agentic-qa-core/references/decision-protocol.md`.

| Who is running | What happens at each gate |
|---|---|
| A person is present | Run the steps as written. |
| A supervised worker | The conductor or launcher holds each gate. The worker stops at the gate, reports what it found, and continues when the launcher answers. |
| A routine with nobody | Do the reversible work, which is Steps 0b to 2, the preflight (Step 4), the gate re-check (Step 4b) and the dry-run (Step 5). An export only writes local files. Do not run `auth login` while the cached config is the sole copy of the source keys and nobody has backed it up (the agent cannot make that copy). Stop before Step 3b if the destination is not configured and before Step 6 unless the delegating brief names the project, both sites and approves the restore. Report the inventory, the counts, the dry-run summary and the gate that stopped you. |

## Gotchas (carry these into every run)

- **Re-auth between sites.** Skipping it means exporting or restoring against the wrong site. Run `auth status` before each phase, plus the site discriminator.
- **`--sync` needs destination Jira credentials.** Without them key-to-id resolution fails and restore falls back to CREATE, which duplicates. Confirm `auth status` shows the destination Jira URL.
- **List commands default to a small `--limit` (see `cli/xray`)** and truncate without warning. Pass `--limit` whenever you count or decide.
- **`0 created` is the signal** in the dry-run and in the real run. A nonzero `created` under `--sync` means those keys did not resolve and were duplicated.
- **Restore is idempotent under `--sync`.** Re-run interrupted runs.
- **504 on export** comes from the `coverableIssues` resolver. `--all` retries automatically. For a single project use `--no-coverage` (coverage is record-only and never restored).
- **Defect links**: a run whose defect references a bug key absent on the destination logs `defect link skipped`. The run status still applies.
- **Coverage (Test to Story)** is a Jira issue link, which the native Jira migration carries. Restore does not recreate it.
- **Empty tests or sets** in the backup reflect the source and are not a failure.
- **Backup objects key on `originalKey`**, not `key`. `jq '.tests[].key'` returns null and looks like a broken backup.
- **A stale `.backups/` lies.** Clear it before exporting, because on case-insensitive volumes an old file also keeps its old name.

## Keys not preserved (fallback)

If the destination uses a different project key, or issues were not migrated, drop `--sync`. `backup restore --file <f> --project <NEW_KEY>` creates fresh issues with new keys and writes a `key-mapping-*.csv` (old to new) for reconciling. Preflight still applies. Coverage and cross-references will not survive.

## Worked reference (a real migration)

Four projects, keys preserved, executed end to end:

| Project | Tests | Preconditions | Sets | Plans | Executions | Run statuses |
|---|---|---|---|---|---|---|
| A | 81 | 2 | 2 | 4 | 4 | 13 |
| B | 30 | 4 | 3 | 0 | 14 | 6 |
| C | 114 | 24 | 24 | 2 | 29 | 102 |
| D | 69 | 2 | 7 | 4 | 5 | 16 |

All four reported `0 created`: every entity resolved by key and updated in place. Only project C (102 run statuses) needed a background run. It hit a 10-minute command timeout on the first attempt and converged cleanly on re-run.
