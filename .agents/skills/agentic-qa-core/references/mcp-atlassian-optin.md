# Atlassian MCP (opt-in) and the MCP parity contract

> Loaded when someone wants MCP-level Jira / Confluence access, or when an MCP change fails
> `bun run agents:compat:check`. The default tools for every Jira, Confluence and TMS action are
> `/acli`, `/xray-cli` and `bun run jira:sync-issues` (`.agents/instructions/agent-tool-resolution.md`). This MCP is a fallback the
> repo never enables on its own.

## When to enable it

Only when a task needs something `acli` does not expose and the owner accepts one more
long-running server per session. Nothing in the skills requires it: `[ISSUE_TRACKER_TOOL]` and
`[TMS_TOOL]` resolve to the CLIs first, and the MCP is named only as their fallback.

## The server

`mcp-atlassian` is a Python package run through `uvx` (install `uv` first). Pin the version, the
same way the committed configs pin every `bunx` package: pin the version you install
(`uvx mcp-atlassian@<version>`; check PyPI for the release) and bump it deliberately.

| Variable the server reads | Where the value comes from |
|---|---|
| `JIRA_URL` | the site host in `.agents/project.yaml` → `issue_tracker.atlassian_url`. Print it with `bun run --silent jira:url` and paste the LITERAL value. It is not an env var and never a `{{ATLASSIAN_URL}}` token: an MCP config cannot run a command, and a second env copy of the host is exactly what goes stale (`.agents/instructions/agent-project-variables.md`). |
| `JIRA_USERNAME` | `ATLASSIAN_EMAIL` in `.env` |
| `JIRA_API_TOKEN` | `ATLASSIAN_API_TOKEN` in `.env` |

After a site migration: update `.agents/project.yaml` first, then re-paste `JIRA_URL` in all
three configs. `bun run setup:doctor` cannot see a stale value inside an MCP config.

## Enable it on ALL THREE hosts, in one change

The parity check (below) fails when a server exists in one host only, so the block goes into
`.mcp.json`, `opencode.jsonc` and `.codex/config.toml` together. Replace
`https://your-site.atlassian.net` with the output of `bun run --silent jira:url`.

Every host starts the server through the same `.env` loader the shipped servers use
(`MCP_ENV_LOADER_*` in `cli/lib/agent-compatibility-contracts.ts`): `varlock run` reads the
schema plus `.env` / `.env.local` (or the secret manager) from the project root at spawn time,
however the harness was launched, and hands the server only the names in its `--filter`. No
`${VAR}`, `{env:}`, `{file:}` or `env_vars` beside it. `.env` holds `ATLASSIAN_EMAIL` /
`ATLASSIAN_API_TOKEN` while the server reads `JIRA_USERNAME` / `JIRA_API_TOKEN`, and the loader
has no rename, so the inner command is a one-line `sh` wrapper that renames at launch. `$VAR`
without braces inside `args` is expanded by `sh`, not by the host, and the parity check does not
treat it as a placeholder. The host value is a literal setting, so it goes in the host's `env`
table.

**Claude Code** (`.mcp.json`, inside `mcpServers`):

```json
"atlassian": {
  "command": "bunx",
  "args": [
    "-p", "varlock@1.20.0", "varlock", "run", "--no-redact-stdout", "--inject", "vars",
    "--filter", "ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN", "--",
    "sh", "-c",
    "JIRA_USERNAME=\"$ATLASSIAN_EMAIL\" JIRA_API_TOKEN=\"$ATLASSIAN_API_TOKEN\" exec uvx mcp-atlassian@0.23.1"
  ],
  "env": {
    "JIRA_URL": "https://your-site.atlassian.net"
  }
}
```

**OpenCode** (`opencode.jsonc`, inside `mcp`):

```jsonc
"atlassian": {
  "type": "local",
  "command": [
    "bunx", "-p", "varlock@1.20.0", "varlock", "run", "--no-redact-stdout", "--inject", "vars",
    "--filter", "ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN", "--",
    "sh", "-c",
    "JIRA_USERNAME=\"$ATLASSIAN_EMAIL\" JIRA_API_TOKEN=\"$ATLASSIAN_API_TOKEN\" exec uvx mcp-atlassian@0.23.1"
  ],
  "enabled": true,
  "environment": {
    "JIRA_URL": "https://your-site.atlassian.net"
  }
}
```

**Codex CLI + Desktop** (`.codex/config.toml`). Same launch; `startup_timeout_sec` gives a cold
`uvx` fetch plus the loader hop the same budget the shipped servers get.

```toml
[mcp_servers.atlassian]
command = "bunx"
enabled = true
startup_timeout_sec = 30
args = [
  "-p", "varlock@1.20.0", "varlock", "run", "--no-redact-stdout", "--inject", "vars",
  "--filter", "ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN", "--",
  "sh", "-c",
  "JIRA_USERNAME=\"$ATLASSIAN_EMAIL\" JIRA_API_TOKEN=\"$ATLASSIAN_API_TOKEN\" exec uvx mcp-atlassian@0.23.1",
]

[mcp_servers.atlassian.env]
JIRA_URL = "https://your-site.atlassian.net"
```

Copy the `varlock@<pin>` from the shipped servers in the same file rather than from this page: it
tracks the `varlock` devDependency. On Windows, where there is no `sh`, add `JIRA_USERNAME` /
`JIRA_API_TOKEN` to the schema and `.env` under those names and filter on them with
`uvx mcp-atlassian@<version>` as the inner command; the parity check will then report the
different `.env` dependency, which is the honest state of that machine.

**Gemini CLI**: unsupported harness. This repo ships no Gemini adapter and the parity check
does not know it.

Then restart the agent session: MCP servers read `.env` when the harness spawns them (Critical
Rule #10). Verify with `bun run agents:compat:check`.

## MCP parity contract

`bun run agents:compat:check` (in `repo:check` and pre-push) normalises `.mcp.json`,
`opencode.jsonc` and `.codex/config.toml` into one shape (transport, command, args, url, `.env`
dependencies, literal env, enabled) and compares them. The canonical server set is whatever
`.mcp.json` declares; a server missing from another host, or present in one host only, fails
naming the server and the host.

- **It compares `.env` dependencies, not argument spelling.** A server behind the loader
  declares its dependencies as the `--filter` list; that list is what must match across the
  three hosts, plus the literal settings. A remote server that carries its key from the host
  (an HTTP header in Claude, `bearer_token_env_var` in Codex) is compared on the same SET of
  names, so different spellings of one name are parity, not drift.
- **A stdio server that needs `.env` values launches through the loader on every host, and
  only through it.** A host-side reference beside the loader (`${VAR}`, `{env:}`, `{file:}`,
  `env_vars`) is reported: an unset `${VAR}` breaks a desktop launch, and an EMPTY inherited
  value shadows `.env`. Codex passes placeholders inside `args` or `[mcp_servers.X.env]` as
  literal text, so a `${DBHUB_HOST}` there would reach dbhub as that string; the check rejects a
  placeholder inside a Codex `env` table. ERROR in the boilerplate, WARNING downstream that names
  the exact launch to write, because the three configs are never overwritten by a sync.
- **The shipped servers get a stricter shape check** (the ids in `KNOWN_MCP_IDS`,
  `cli/lib/agent-compatibility-contracts.ts`) when declared. Any other server, `atlassian`
  included, gets the generic comparison only, so a project may add or drop servers freely.
- **Failure is silent on every host** (AGENTS.md Critical Rule #10): an unset optional variable
  reaches the server as absent or empty and the server dies on its first authenticated call. A
  401/403 from `atlassian` means `bunx varlock load --agent` (redacted) to see whether
  `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` are set; the human fixes `.env`; restart the session.
