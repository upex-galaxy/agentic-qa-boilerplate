# Xray Cross-Site Migration Runbook (agnostic)

Project- and site-agnostic procedure for moving a Jira site's **Xray app-data**
(tests, preconditions, plans, sets, repository folders, run statuses) to another
Jira Cloud site with `bun xray`. The AI should follow this end-to-end when the
user names this runbook.

Placeholders: `<SOURCE_SITE>` / `<DEST_SITE>` (e.g. `your-org67` /
`your-org69`), `<PROJECT_KEY>`. Substitute from the user's input, never
hard-code a project or site.

## What this does and does NOT do

- **Does**: re-import the Xray payload a native Jira migration leaves behind
  (steps, gherkin/definitions, precondition definitions, plan/set membership at
  the Xray layer, repository folders, run statuses).
- **Does NOT**: migrate Jira issues (that is the user's native Jira migration,
  JCMA/CSV, done first, keys preserved), recreate coverage links (carried by
  the Jira migration), or create Xray project **config** (Xray has no
  config-write API, see Step 4).

What a native Jira migration actually leaves behind, observed on a real Test:

| | Source | Destination before restore | After restore |
|---|---|---|---|
| Key, summary, labels, status | present | **present** | present |
| Test Type | `Cucumber` | **`Manual`** (silent default) | `Cucumber` |
| Gherkin / steps | full | **empty** | full |

The issue arrives looking healthy. Only the Xray payload is missing, which is why
nobody notices until someone opens a test and finds it blank.

## Mental model (state before you act)

- Xray GraphQL addresses everything by the **numeric issueId**, re-assigned per
  site. A Jira migration preserves the **key**. Restore matches by key
  (`--sync`) and re-resolves the destination issueId via Jira REST.
- **One site per session**: `~/.xray-cli/config.json` holds one site's creds.
  Switching sites means re-running `auth login`. Confirm with `auth status`
  before every export and every restore.
- Credentials resolve from `.env` (`XRAY_CLIENT_ID/SECRET`,
  `ATLASSIAN_URL/EMAIL/API_TOKEN`) by default; pass flags only to OVERRIDE for a
  site whose creds are not in `.env`.
- **Xray API keys are per Xray instance.** A key pair generated on
  `<SOURCE_SITE>` does not authenticate against `<DEST_SITE>`. The user must
  generate a new pair in the destination (Jira > Apps > Xray > Global Settings >
  API Keys, requires Xray admin; the secret is shown once).

## Prerequisites (user-owned, confirm first)

1. The Jira projects were migrated natively to `<DEST_SITE>` with **keys
   preserved** (same project key, no collision). Otherwise this is a create
   migration, not a sync, see "Keys not preserved" at the end.
2. Xray is **installed** on `<DEST_SITE>` AND each destination project is
   **configured** (Step 3b). Installed is not enough and the difference is
   invisible until you look for it.
3. You have Xray API keys (client id/secret) for BOTH sites and Jira API token +
   email for `<DEST_SITE>`.

Do not take these on trust. Steps 0 and 0b prove them.

---

## Procedure

### 0. Credential inventory and backup (ALWAYS FIRST)

**Do not run `auth login` before finishing this step.** After a site move the
cached config and `.env` routinely point at different sites, and `auth login`
overwrites the cached one. On a real migration the SOURCE Xray keys existed
**only** in `~/.xray-cli/config.json` while `.env` held stale keys from a third
site; following the old runbook's "just log in" would have destroyed all access
to the source before anything was exported.

Inventory all three sources and report what each one says:

```bash
jq -r '"cached  -> \(.jira_base_url)  client=\(.client_id[0:8])..."' ~/.xray-cli/config.json
grep -E '^(ATLASSIAN_URL|XRAY_CLIENT_ID)' .env
bun xray auth status
```

Then have the **user** back up the cached credentials:

```bash
cp ~/.xray-cli/config.json ~/.xray-cli/config.SOURCE-<site>.json.bak
```

> **AI note**: hand this command to the user. The Claude Code permission
> classifier blocks the agent from copying credential files, and the copy is not
> optional: it is the only on-disk record of the source Xray keys.

Also clear or archive a stale `.backups/` from any previous migration. On a
**case-insensitive volume (macOS APFS default)** a new export writes into an
existing file and keeps that file's original name, so `.backups/mym-backup.json`
can hold a fresh `MYM` export. Worse, a project that fails to export leaves the
old backup in place looking current. Always build restore paths from
`ls .backups/`, never from the project key.

### 0b. Prove the prerequisites

Three checks, all read-only, all against Jira REST (not Xray). Set both credential
sets up front so the snippets below are copy-pasteable — source from the cached
config, destination from `.env`:

```bash
SRC_URL=$(jq -r .jira_base_url  ~/.xray-cli/config.json | sed 's:/*$::')
SRC_EMAIL=$(jq -r .jira_email   ~/.xray-cli/config.json)
SRC_TOKEN=$(jq -r .jira_api_token ~/.xray-cli/config.json)
set -a; source .env; set +a          # ATLASSIAN_URL / _EMAIL / _API_TOKEN
DEST_URL="${ATLASSIAN_URL%/}"
```

Below, `$SITE` / `$EMAIL` / `$TOKEN` stand for one of those pairs; run each check
against both sites.

**1. Project key parity** — list projects on both sites and diff the keys:

```bash
curl -sS -u "$EMAIL:$TOKEN" "$SITE/rest/api/3/project/search?maxResults=100" \
  | jq -r '.values[] | "\(.key)\t\(.name)"'
```

Report source-only keys explicitly. A native Jira migration can silently leave a
project behind, and nobody notices until someone goes looking for it.

**2. Issue-count parity per shared project** — the real proof that keys were
preserved, far stronger than eyeballing the key list:

```bash
curl -sS -u "$EMAIL:$TOKEN" -X POST "$SITE/rest/api/3/search/approximate-count" \
  -H "Content-Type: application/json" --data '{"jql":"project=<KEY>"}' | jq -r .count
```

Counts must match per project. A mismatch means the Jira migration is incomplete;
stop and fix that before touching Xray.

**3. Xray issue types present on the destination**:

```bash
curl -sS -u "$EMAIL:$TOKEN" "$DEST/rest/api/3/issuetype" | jq -r '[.[].name] | unique | join(", ")'
```

Look for `Test`, `Test Plan`, `Test Set`, `Test Execution`, `Precondition`. This
proves the app is **installed**. It does NOT prove any project is **configured**
(Step 3b).

### 1. Authenticate to the SOURCE site

If `.env` already points at `<SOURCE_SITE>`:

```bash
bun xray auth login        # reads all creds from .env
bun xray auth status       # confirm Jira URL = <SOURCE_SITE>
```

Otherwise override via flags:

```bash
bun xray auth login --client-id <SRC_ID> --client-secret <SRC_SECRET>
```

Export needs only the Xray client id/secret (it reads Xray GraphQL, not Jira).

**Verify the site, do not assume.** `auth status` shows the Jira URL, which is
only half the answer: the Xray keys are a separate credential and can belong to a
different site than the Jira URL configured alongside them. See "Site
discriminator" below for the reliable check.

### 2. Export every project that has Xray data

```bash
bun xray backup export --all --include-runs
```

- Enumerates all projects (Jira REST), probes each for Xray Tests, exports the
  ones with data into `.backups/<KEY>-backup.json`, and prints an **inventory
  table**. Auto-retries a project without coverage on a CloudFront 504.
- The inventory IS your destination-config worklist. Note which projects carry
  data.
- If one project 504s repeatedly, export it alone with `--no-coverage`.

**Reconcile the skip list against Jira.** A project is reported as `Skipped` both
when it is genuinely empty and when its Tests exist only at the Jira layer,
never registered with Xray. The second case is real user data that will NOT
migrate, and the skip line does not distinguish it:

```bash
# for each skipped project: does Jira disagree with Xray?
curl -sS -u "$EMAIL:$TOKEN" -X POST "$SITE/rest/api/3/search/approximate-count" \
  -H "Content-Type: application/json" \
  --data '{"jql":"project=<KEY> AND issuetype=Test"}' | jq -r .count
bun xray test list --project <KEY> --limit 1     # Xray's view
```

Nonzero in Jira and zero in Xray means those Tests were never registered with
Xray on the source. They cannot be exported, and no CLI command fixes it:
**`bun xray repair` does NOT apply here** — it reconciles Jira-layer vs
Xray-layer *membership* of existing Test Executions and Test Plans, and never
touches standalone Test issues (it is also a read-only scan unless you pass
`--apply`).

Try an Xray **re-index** on the source site first, since the same symptom on a
destination project is cured by configure + re-index (Step 3b). If the count
still disagrees afterwards, record those Tests as a known loss, tell the user
explicitly which project and how many, and let them decide whether to recreate
them by hand. Do not report the project as migrated.

### 3. Authenticate to the DESTINATION site

```bash
bun xray auth login \
  --client-id <DEST_ID> --client-secret <DEST_SECRET> \
  --jira-url https://<DEST_SITE>.atlassian.net \
  --jira-email <DEST_EMAIL> --jira-token <DEST_TOKEN>
bun xray auth status        # confirm Jira URL = <DEST_SITE>
```

Destination restore (`--sync`) REQUIRES the destination Jira creds to resolve
key to issueId.

#### Site discriminator (use this, not the obvious checks)

Confirming which site the **Xray** keys resolve to is harder than it looks.

What does NOT work:

- Querying a project that exists on only one site. Xray returns
  `Tests (0 total, showing 0)` for a nonexistent project, identical to an empty
  one.
- Comparing total test counts. After a successful Jira migration the destination
  reports the same totals as the source, so the number proves nothing.

What DOES work: numeric issueIds are reassigned per site, so compare an id from
the backup against the destination's id for the **same key**:

```bash
jq -r '.tests[0:3][] | "\(.originalKey)  id=\(.issueId)"' .backups/<KEY>-backup.json
curl -sS -u "$EMAIL:$TOKEN" -X POST "$DEST/rest/api/3/search/jql" \
  -H "Content-Type: application/json" \
  --data '{"jql":"project=<KEY> AND issuetype=Test","maxResults":2,"fields":["summary"]}' \
  | jq -r '.issues[] | "\(.key)  id=\(.id)"'
```

Disjoint id ranges mean different sites. Same key with a different id is exactly
what you want to see before a `--sync` restore.

### 3b. HUMAN GATE: configure Xray per destination project

**There is no API and no GraphQL mutation for this.** It is manual UI work, once
per project, and it blocks everything downstream. Budget it explicitly: the unit
of effort is the project count from the Step 2 inventory.

In the destination, per project, configure:

- **Miscellaneous**
- **Test Coverage**
- **Defect Mapping**
- **Test Environments**

then run an Xray **re-index** ("Xray needs to keep an updated index of Jira
issues and Xray entities").

#### Signature of "installed but not configured"

This state is silent and easy to misread as data loss or as wrong credentials:

```
bun xray test list --project <KEY>   ->  "Tests (114 total, showing 0)"   <- count, no rows
                                         + a WARN naming the two possible causes
bun xray test get <KEY>-123          ->  "Test not found: <KEY>-123"
bun xray backup preflight            ->  succeeds, resolves every project
```

Note that **preflight passing does NOT rule this out**. Preflight reads project
config; it does not exercise entity resolution.

The same count-without-rows signature also appears when Test issues exist in Jira
but were never registered with Xray (Step 2). The list commands cannot tell the
two apart, which is why they warn about both. Compare the Jira `issuetype = Test`
count against Xray's to decide which one you are in: equal counts point at
project config, a Jira-only surplus points at unregistered issues.

**Why this is a hard STOP before restore**: a `--sync` restore that cannot resolve
key to issueId falls back to CREATE, which duplicates every entity in the project.

### 4. Preflight: destination config gaps

```bash
bun xray backup preflight --dir .backups
```

Read-only. Reports per project what exists in source config but is **missing on
destination**: test types, run statuses (used + defined), test environments.
Xray has **no config-write API**, so apply each reported gap **manually** in
`<DEST_SITE>` Xray admin (Settings > Apps > Xray) before importing. Default
test types (Manual/Generic/Cucumber) and statuses (PASSED/FAILED/...) exist
everywhere; only customs surface here. Re-run until it reports
`Preflight clean`.

### 4b. Re-verify the gate before writing anything

After the config work, confirm the Step 3b signature is gone. The gate is that
`test list` returns **rows**, not merely a nonzero total:

```bash
bun xray test list --project <KEY> --limit 3     # must print actual test rows
```

If it still prints a count with no rows, the project config or the re-index is
incomplete. Do not proceed.

### 5. Dry-run per project, then verify counts

```bash
bun xray backup restore --file .backups/<FILE> --project <KEY> --sync --dry-run
```

**`0 created` on every line is the anti-duplicate signal.** The dry-run resolves
each key exactly as the real run does, so `Would sync <KEY>` means the entity
will be updated in place, while `Would create <summary>` means that key did not
resolve on the destination and the restore WOULD duplicate it. Any `created` on a
`--sync` run is a stop signal, not a detail.

Because each entity costs a Jira REST lookup, a dry-run of a large project takes
a while. That is the price of a preview that tells the truth.

Then confirm the destination already holds the container issues, which is the
independent anti-duplicate check:

```bash
bun xray exec list --project <KEY> --limit 100
bun xray set  list --project <KEY> --limit 100
bun xray plan list --project <KEY> --limit 100
```

Counts should match the backup. If they do, restore will UPDATE in place with
zero duplicates. Get the user's GO before any real write.

### 6. Real restore (writes to destination)

```bash
bun xray backup restore --file .backups/<FILE> --project <KEY> --sync
```

Order is dependency-safe: preconditions, tests (+folder +precondition links),
folders, sets, plans, executions (+run statuses). A key-mapping CSV is written to
`.backups/` even when nothing was created, which is noise, not a signal.

**Duration and interruption.** Run statuses dominate the runtime, one API call
each, so time scales with total runs rather than test count. Background any
project above roughly 50 runs. If a restore is interrupted mid-flight, **it is
safe to re-run**: `--sync` resolves every entity by `originalKey` and updates in
place, so a repeat run converges and reports `0 created`. Do not let a killed
restore talk you into stopping; stopping leaves the project half-migrated.

Expected benign output:

- `Nothing to sync for <KEY> (source has no steps/gherkin/definition)` — exactly
  what it says. Common at scale for Manual tests that carry their content in the
  description. Not a failure.
- `defect link skipped` — a run's defect references a bug key absent from the
  destination. The run status still applies.

### 7. Verify

**Every verification command needs an explicit `--limit` above the expected
count.** The list commands default to **20 rows** and truncate silently while the
header still shows the true total. During a post-restore check this manufactures
a convincing false data-loss alarm at the worst possible moment.

```bash
bun xray test list --project <KEY> --limit 300 | head -5
bun xray exec list --project <KEY> --limit 100
bun xray set  list --project <KEY> --limit 100
bun xray plan list --project <KEY> --limit 100
```

Read counts from the `(N total)` header rather than by counting rows. Compare
against the backup:

```bash
jq -r '"tests=\(.tests|length) pre=\(.preconditions|length) sets=\(.testSets|length) plans=\(.testPlans|length) execs=\(.executions|length) runs=\([.executions[].testRuns//[]|length]|add // 0)"' .backups/<FILE>
```

Also compare the **test-type distribution**, which is what a Jira migration
silently flattens to Manual:

```bash
jq -r '[.tests[].testType] | group_by(.) | map("\(.[0]) x\(length)") | join(" / ")' .backups/<FILE>
bun xray test list --project <KEY> --limit 300 | grep -oE '\[(Manual|Cucumber|Generic)\]' | sort | uniq -c
```

#### Canary test (fastest end-to-end proof)

Before restoring, pick one **Cucumber** test per project and record its state.
After restoring, re-read it. This proves the whole chain in one call:

```bash
jq -r '.tests[] | select(.testType=="Cucumber") | .originalKey' .backups/<FILE> | head -1
bun xray test get <THAT_KEY>       # Type must flip Manual -> Cucumber, gherkin must appear
```

### 8. Repoint the repo (separate, mandatory)

A site move also **reassigns Jira custom-field IDs**. The old id usually still
exists on the new instance pointing at a **different field**, so the failure mode
is not a 404 but a `200 OK` writing your data into the wrong field, silently.

Run `/jira-instance-migration` to repoint `.env`, `.agents/project.yaml` and the
machine-global `acli` session, and to regenerate the `.agents/` catalogs the move
invalidated. An operator who follows only this Xray runbook is left with poisoned
catalogs and no error to warn them.

---

## Gotchas (carry these into every run)

- **Re-auth between sites.** Forgetting means exporting or restoring against the
  wrong site. `auth status` before each phase, plus the site discriminator.
- **`--sync` needs destination Jira creds.** Without them, key to id resolution
  fails and restore falls back to CREATE (duplicates). Confirm `auth status`
  shows the destination Jira URL.
- **List commands default to 20 rows** and truncate without warning. Always pass
  `--limit` when counting or deciding.
- **`0 created` is the signal to look for** in both the dry-run and the real run.
  A nonzero `created` under `--sync` means those keys did not resolve and were
  duplicated.
- **Restore is idempotent under `--sync`.** Interrupted runs should be re-run.
- **504 on export** is the `coverableIssues` resolver. `--all` retries
  automatically; manually use `--no-coverage` (coverage is record-only, never
  restored).
- **Defect links**: a run whose defect references a bug key absent on the
  destination logs `defect link skipped`. The run status still applies.
- **Coverage (Test to Story)** is a Jira issue-link; the native Jira migration
  carries it. Restore does not recreate it.
- **Empty tests/sets** in the backup reflect the source, not a failure.
- **Backup objects key on `originalKey`**, not `key`. `jq '.tests[].key'` returns
  null and looks like a broken backup.
- **A stale `.backups/` lies.** Clear it before exporting; on case-insensitive
  volumes an old file also keeps its old name.

## Keys NOT preserved (fallback)

If the destination uses a different project key (or issues were not migrated),
drop `--sync`: `backup restore --file <f> --project <NEW_KEY>` creates fresh
issues with NEW keys and emits a `key-mapping-*.csv` (old to new) to reconcile.
Preflight still applies. Coverage and cross-references will not survive.

## Worked reference (a real migration)

Four projects, keys preserved, executed end to end:

| Project | Tests | Preconditions | Sets | Plans | Executions | Run statuses |
|---|---|---|---|---|---|---|
| A | 81 | 2 | 2 | 4 | 4 | 13 |
| B | 30 | 4 | 3 | 0 | 14 | 6 |
| C | 114 | 24 | 24 | 2 | 29 | 102 |
| D | 69 | 2 | 7 | 4 | 5 | 16 |

All four reported `0 created` — every entity resolved by key and updated in
place. The only project needing a background run was C (102 run statuses); it hit
a 10-minute command timeout on the first attempt and converged cleanly on re-run.
