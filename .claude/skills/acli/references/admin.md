# Admin (`acli admin`)

Org-level operations. Authenticated by an API key, not a user API token.

Subcommands: `auth`, `user`.

## auth

Parallel to `acli jira auth` but requires an **organization API key** instead of an Atlassian account API token.

```bash
# Login — reads API key from stdin
echo "$ATLASSIAN_ADMIN_API_KEY" | acli admin auth login --email admin@example.com --token

# Status / switch / logout
acli admin auth status
acli admin auth switch
acli admin auth logout
```

Create the API key at `admin.atlassian.com → Settings → API Keys`. It is organization-wide and carries directory-manager permissions — treat it with more care than a personal API token.

A session authenticated via `acli jira auth login` does not permit `admin user activate` and vice versa. Each product keeps a separate credential.

## user

Manage directory users at the org level. Subcommands: `activate`, `deactivate`, `delete`, `cancel-delete`.

### activate

```bash
# By email (comma-separated)
acli admin user activate --email alice@example.com,bob@example.com

# By Atlassian account ID
acli admin user activate --id 5b10ac8d82e05b22cc7d4ef5,5c10ac8d82e05b22cc7d4ef6

# From a file (one email per line or comma-separated)
acli admin user activate --from-file users.txt --ignore-errors --json
```

Flags:

| Flag              | Meaning                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `-e, --email`     | Comma-separated emails                                                   |
| `--id`            | Comma-separated Atlassian account IDs                                    |
| `-f, --from-file` | File containing emails or IDs                                            |
| `--ignore-errors` | Continue past per-user failures                                          |
| `--json`          | JSON output                                                              |

### deactivate

Identical flag shape to `activate`. Deactivation is reversible via `activate`.

```bash
acli admin user deactivate --email former@example.com
acli admin user deactivate --from-file leavers.txt --ignore-errors --json
```

### delete / cancel-delete

`delete` schedules a user for permanent removal (with a grace period). `cancel-delete` reverses the request while it is still pending.

```bash
acli admin user delete --email gone@example.com --yes
acli admin user cancel-delete --email gone@example.com
```

Use `--yes` in CI or the command hangs on the confirmation prompt.

## Common patterns

### Bulk onboarding from a CSV

```bash
# Extract email column with awk, feed into activate
awk -F',' 'NR > 1 {print $2}' new-hires.csv > emails.txt
acli admin user activate --from-file emails.txt --json > activation.json

# Capture failures by diffing the input against the success list
jq -r '.succeeded[].email' activation.json | sort > succeeded.txt
sort emails.txt > expected.txt
comm -23 expected.txt succeeded.txt > failed.txt
```

### Offboarding sweep

```bash
acli admin user deactivate --from-file departed.txt --ignore-errors --json > deactivation.log
```

`--ignore-errors` is essential — a single already-deactivated user should not abort the whole batch.
