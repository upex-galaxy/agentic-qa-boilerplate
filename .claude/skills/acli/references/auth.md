# Authentication

`acli` has **four auth namespaces**, each scoped independently. Logging in to one does **not** authenticate the others — every scope keeps its own session.

## Auth namespaces at a glance

| Namespace             | Command path                  | Credential                    | What it authenticates                                |
| --------------------- | ----------------------------- | ----------------------------- | ---------------------------------------------------- |
| Jira                  | `acli jira auth login`        | Atlassian account API token   | All `acli jira *` commands                           |
| Confluence            | `acli confluence auth login`  | Atlassian account API token   | All `acli confluence *` commands                     |
| Org admin             | `acli admin auth login`       | Org admin API key             | `acli admin user *` (directory ops)                  |
| Global OAuth          | `acli auth login`             | Browser redirect (interactive)| Cross-product OAuth — newer, top-level surface       |

Three credential mechanics are available depending on the namespace:

| Mechanic  | Use                                              | Where                                            |
| --------- | ------------------------------------------------ | ------------------------------------------------ |
| API token | Scripts, CI, anywhere non-interactive            | `jira auth login` · `confluence auth login`      |
| OAuth     | Human at a terminal, multi-site exploration      | `jira auth login --web` · `acli auth login`      |
| API key   | Org-level admin commands                         | `admin auth login`                               |

## API token (the scriptable path)

Generate the token at https://id.atlassian.com/manage-profile/security/api-tokens.

```bash
# Read token from stdin (most portable)
echo "$ATLASSIAN_API_TOKEN" | acli jira auth login \
  --site "mysite.atlassian.net" \
  --email "you@example.com" \
  --token

# Read from a file
acli jira auth login \
  --site "mysite.atlassian.net" \
  --email "you@example.com" \
  --token < token.txt

# Windows PowerShell
Get-Content token.txt | .\acli.exe jira auth login `
  --site "mysite.atlassian.net" `
  --email "you@example.com" `
  --token
```

`--token` has no argument form — it always reads from stdin. Any of pipe, redirect, or here-string works.

## OAuth (interactive only)

```bash
acli jira auth login --web
```

Opens a browser. The user picks the target site in the browser, then picks it again in the terminal — both must match. Two pieces to know:

- **You cannot pre-select a site for `--web`.** Atlassian confirmed the site list is populated dynamically from the logged-in user's memberships. OAuth is therefore **unsuitable for CI**.
- **On WSL / remote shells, the callback can hang** because the browser launches on the host and the localhost callback cannot reach the WSL process. Fall back to API token.

## API key (org admin)

Generate at `admin.atlassian.com → Settings → API Keys`.

```bash
echo "$ATLASSIAN_ADMIN_API_KEY" | acli admin auth login \
  --email "admin@example.com" \
  --token
```

The API key path is independent of `jira auth`. A session authenticated as a Jira user cannot run `admin user activate`.

## Confluence (`acli confluence auth`)

Same shape as `jira auth` — same flag set, same credentials (Atlassian account API token). Maintains a session independent of `jira auth`.

```bash
echo "$ATLASSIAN_API_TOKEN" | acli confluence auth login \
  --site "mysite.atlassian.net" \
  --email "you@example.com" \
  --token

acli confluence auth status
acli confluence auth switch --site mysite.atlassian.net --email you@example.com
acli confluence auth logout
```

The token is the same one you'd use for Jira (Atlassian-account-scoped, generated at https://id.atlassian.com/manage-profile/security/api-tokens). You typically log in to both `jira` and `confluence` separately, even with the same credentials, because the sessions are stored independently.

## Global OAuth (`acli auth`)

Newer top-level surface that does an OAuth login covering multiple products at once. Distinct from per-product `jira auth` / `confluence auth` / `admin auth`.

```bash
acli auth login           # interactive OAuth — opens a browser
acli auth status
acli auth switch
acli auth logout
```

When to use which:

- **`acli auth login`** (global): interactive multi-product setup at a desk. After this, both `jira` and `confluence` operations work without per-product `auth login` calls — handy for ad-hoc human use.
- **Per-product `<product> auth login --token`**: scripted / CI use. Token-based auth is per-product on purpose so a leaked Jira token can't also touch Confluence.

If both global and per-product sessions exist, the per-product session takes precedence for that product's commands.

## Status / switch / logout

```bash
acli jira auth status                    # show current Jira account
acli admin auth status                   # show current admin account
acli jira auth switch                    # interactive: choose from stored sessions
acli jira auth switch --site mysite.atlassian.net --email you@example.com
acli jira auth logout
```

Sessions are persisted across shells — once logged in, new terminals reuse the session. The storage location is internal (typically `~/.config/acli/` on Linux, the system keyring on macOS) and **there is no supported way to retrieve the stored token back for reuse in another tool**. If your workflow also needs raw REST, keep a separate basic-auth token.

## Multi-site workflows

Users with access to multiple Atlassian sites can store several sessions and switch between them:

```bash
# Login to site A
echo "$TOKEN_A" | acli jira auth login --site a.atlassian.net --email you@example.com --token
# Login to site B (does not replace A)
echo "$TOKEN_B" | acli jira auth login --site b.atlassian.net --email you@example.com --token

# Show the active session
acli jira auth status

# Switch
acli jira auth switch --site b.atlassian.net
```

If the same email is registered on multiple sites, always pass **both** `--site` and `--email` to `switch` — otherwise the CLI prompts interactively.

## CI patterns

Three rules for CI:

1. **Use API-token auth only.** OAuth cannot be automated.
2. **Inject the token via a secret variable**, never commit it.
3. **Use a bot account**, not a human account, so rotations do not break pipelines.

### GitHub Actions

```yaml
- name: Install acli
  run: |
    curl -LO "https://acli.atlassian.com/linux/1.3.13/acli_linux_amd64/acli"
    chmod +x ./acli
    sudo mv ./acli /usr/local/bin/acli

- name: Authenticate to Jira
  env:
    ATLASSIAN_BOT_EMAIL: ${{ vars.ATLASSIAN_BOT_EMAIL }}
    ATLASSIAN_BOT_TOKEN: ${{ secrets.ATLASSIAN_BOT_TOKEN }}
    ATLASSIAN_SITE: ${{ vars.ATLASSIAN_SITE }}
  run: |
    echo "$ATLASSIAN_BOT_TOKEN" | acli jira auth login \
      --site "$ATLASSIAN_SITE" \
      --email "$ATLASSIAN_BOT_EMAIL" \
      --token
```

Pin the version in the URL (`1.3.13/` instead of `latest/`) — unpinned installs have caused same-day mass failures in the past.

### Bitbucket Pipelines (Atlassian's own sample)

```yaml
image: atlassian/default-image:3
pipelines:
  default:
    - step:
        name: Authenticate & run
        script:
          - bash install-acli.sh
          - echo "$BOT_API_TOKEN" | ./acli jira auth login --email "$BOT_EMAIL" --site "$SITE" --token
          - ./acli jira workitem search --jql "project = $PROJECT AND updated > -1d" --paginate --csv > changes.csv
```

### GitLab CI

Same pattern — inject token via `CI_VARIABLES`, call the install script first, then authenticate via stdin.

## Common auth failures

| Error                                                   | Most likely cause                                         | Fix                                                            |
| ------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `unauthorized: use acli jira auth login to authenticate` | Session expired, wrong product, or missing login.       | Re-run `acli jira auth login`. Check you authenticated the correct product. |
| `--web` never completes after "Accept"                   | Callback blocked (WSL / remote shell / firewall).        | Switch to `--token` path.                                      |
| `forbidden` on an admin command                          | You authenticated `jira`, not `admin`.                   | Run `acli admin auth login` with an API key.                   |
| Token rejected after rotation                            | Cached credential points at the old token.                | `acli jira auth logout` then log in again.                     |
