# Xray Cross-Site Migration Runbook (agnostic)

Project- and site-agnostic procedure for moving a Jira site's **Xray app-data**
(tests, preconditions, plans, sets, repository folders, run statuses) to another
Jira Cloud site with `bun xray`. The AI should follow this end-to-end when the
user names this runbook.

Placeholders: `<SOURCE_SITE>` / `<DEST_SITE>` (e.g. `your-org67` /
`your-org69`), `<PROJECT_KEY>`. Substitute from the user's input — never
hard-code a project or site.

## What this does and does NOT do

- **Does**: re-import the Xray payload a native Jira migration leaves behind
  (steps, gherkin/definitions, precondition definitions, plan/set membership at
  the Xray layer, repository folders, run statuses).
- **Does NOT**: migrate Jira issues (that is the user's native Jira migration —
  JCMA/CSV — done first, keys preserved), recreate coverage links (carried by
  the Jira migration), or create Xray project **config** (Xray has no
  config-write API — see Preflight).

## Mental model (state before you act)

- Xray GraphQL addresses everything by the **numeric issueId**, re-assigned per
  site. A Jira migration preserves the **key**. → Restore matches by key
  (`--sync`) and re-resolves the destination issueId via Jira REST.
- **One site per session**: `~/.xray-cli/config.json` holds one site's creds.
  Switching sites = re-run `auth login`. Confirm with `auth status` before
  every export and every restore.
- Credentials resolve from `.env` (`XRAY_CLIENT_ID/SECRET`,
  `ATLASSIAN_URL/EMAIL/API_TOKEN`) by default; pass flags only to OVERRIDE for a
  site whose creds are not in `.env`.

## Prerequisites (user-owned, confirm first)

1. The Jira projects were migrated natively to `<DEST_SITE>` with **keys
   preserved** (same project key, no collision). Otherwise this is a create
   migration, not a sync — see "Keys not preserved" at the end.
2. Xray is **installed** on `<DEST_SITE>` and each destination project has Xray
   **enabled**.
3. You have Xray API keys (client id/secret) for BOTH sites and Jira API token +
   email for `<DEST_SITE>`.

## Procedure

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

### 2. Export every project that has Xray data

```bash
bun xray backup export --all --include-runs
```
- Enumerates all projects (Jira REST), probes each for Xray Tests, exports the
  ones with data into `.backups/<KEY>-backup.json`, and prints an **inventory
  table**. Auto-retries a project without coverage on a CloudFront 504.
- The inventory IS your destination-config worklist — note which projects carry
  data.
- If one project 504s repeatedly, export it alone with `--no-coverage`.

### 3. Authenticate to the DESTINATION site

```bash
bun xray auth login \
  --client-id <DEST_ID> --client-secret <DEST_SECRET> \
  --jira-url https://<DEST_SITE>.atlassian.net \
  --jira-email <DEST_EMAIL> --jira-token <DEST_TOKEN>
bun xray auth status        # confirm Jira URL = <DEST_SITE>
```
Destination restore (`--sync`) REQUIRES the destination Jira creds to resolve
key→issueId.

### 4. Preflight — destination config gaps

```bash
bun xray backup preflight --dir .backups
```
Read-only. Reports per project what exists in source config but is **missing on
destination**: test types, run statuses (used + defined), test environments.
Xray has **no config-write API**, so apply each reported gap **manually** in
`<DEST_SITE>` Xray admin (Settings → Apps → Xray) before importing. Default
test types (Manual/Generic/Cucumber) and statuses (PASSED/FAILED/…) exist
everywhere; only customs surface here. Re-run until clean.

### 5. Dry-run restore per project, then verify counts

For each `<PROJECT_KEY>` in `.backups/`:
```bash
bun xray backup restore --file .backups/<PROJECT_KEY>-backup.json \
  --project <PROJECT_KEY> --sync --dry-run
```
Then confirm the destination already holds the issues (anti-duplicate check —
counts should match the backup):
```bash
bun xray exec list --project <PROJECT_KEY>
bun xray set  list --project <PROJECT_KEY>
bun xray plan list --project <PROJECT_KEY>
```
If counts match, restore will UPDATE in place (zero duplicates). Get the user's
GO before any real write.

### 6. Real restore (writes to destination)

```bash
bun xray backup restore --file .backups/<PROJECT_KEY>-backup.json \
  --project <PROJECT_KEY> --sync
```
Order is dependency-safe: preconditions → tests (+folder +precondition links) →
folders → sets → plans → executions (+run statuses). A key-mapping CSV is
written to `.backups/`.

### 7. Verify

```bash
bun xray test list --project <PROJECT_KEY> --limit 50
bun xray exec get <EXEC_KEY>     # spot-check run statuses
```
Compare against the backup counts and the restore summary.

## Gotchas (carry these into every run)

- **Re-auth between sites.** Forgetting = exporting/restoring against the wrong
  site. `auth status` before each phase.
- **504 on export** = the `coverableIssues` resolver. `--all` retries
  automatically; manually use `--no-coverage` (coverage is record-only, never
  restored).
- **Defect links**: a run whose defect references a bug key not on the
  destination logs `defect link skipped` — the run status still applies. Not an
  error.
- **Coverage (Test→Story)** is a Jira issue-link; the native Jira migration
  carries it. Restore does not recreate it.
- **Empty tests/sets** in the backup reflect the source — they are not failures.
- **`--sync` needs destination Jira creds.** Without them, key→id resolution
  fails and restore falls back to CREATE (duplicates). Always check `auth
  status` shows the destination Jira URL.

## Keys NOT preserved (fallback)

If the destination uses a different project key (or issues were not migrated),
drop `--sync`: `backup restore --file <f> --project <NEW_KEY>` creates fresh
issues with NEW keys and emits a `key-mapping-*.csv` (old→new) to reconcile.
Preflight still applies. Coverage and cross-references will not survive.
