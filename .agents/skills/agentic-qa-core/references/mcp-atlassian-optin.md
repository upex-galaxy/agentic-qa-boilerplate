# Atlassian MCP (opt-in) and the MCP parity contract

> Loaded when someone wants MCP-level Jira / Confluence access, or when an MCP change fails
> `bun run agents:compat:check`. The default tools for every Jira, Confluence and TMS action are
> `/acli`, `/xray-cli` and `bun run jira:sync-issues` (AGENTS.md §6). This MCP is a fallback the
> repo never enables on its own.

## When to enable it

Only when a task needs something `acli` does not expose and the owner accepts one more
long-running server per session. Nothing in the skills requires it: `[ISSUE_TRACKER_TOOL]` and
`[TMS_TOOL]` resolve to the CLIs first, and the MCP is named only as their fallback.

## The server

`mcp-atlassian` is a Python package run through `uvx` (install `uv` first). Pin the version, the
same way the committed configs pin every `bunx` package; `0.23.1` is the release current on
2026-09-24, bump it deliberately.

| Variable the server reads | Where the value comes from |
|---|---|
| `JIRA_URL` | the site host in `.agents/project.yaml` → `issue_tracker.atlassian_url`. Print it with `bun run --silent jira:url` and paste the LITERAL value. It is not an env var and never a `{{ATLASSIAN_URL}}` token: an MCP config cannot run a command, and a second env copy of the host is exactly what goes stale (AGENTS.md §7). |
| `JIRA_USERNAME` | `ATLASSIAN_EMAIL` in `.env` |
| `JIRA_API_TOKEN` | `ATLASSIAN_API_TOKEN` in `.env` |

After a site migration: update `.agents/project.yaml` first, then re-paste `JIRA_URL` in all
three configs. `bun run setup:doctor` cannot see a stale value inside an MCP config.

## Enable it on ALL THREE hosts, in one change

The parity check (below) fails when a server exists in one host only, so the block goes into
`.mcp.json`, `opencode.jsonc` and `.codex/config.toml` together. Replace
`https://your-site.atlassian.net` with the output of `bun run --silent jira:url`.

**Claude Code** (`.mcp.json`, inside `mcpServers`). `${VAR}` resolves from the process
environment, which `bun run harness:env` feeds through the `env` block of
`.claude/settings.local.json`:

```json
"atlassian": {
  "command": "uvx",
  "args": ["mcp-atlassian@0.23.1"],
  "env": {
    "JIRA_URL": "https://your-site.atlassian.net",
    "JIRA_USERNAME": "${ATLASSIAN_EMAIL}",
    "JIRA_API_TOKEN": "${ATLASSIAN_API_TOKEN}"
  }
}
```

**OpenCode** (`opencode.jsonc`, inside `mcp`). Secrets are `{file:}` pointers into
`.auth/opencode/`, never `{env:VAR}`: `{env:}` only resolves when OpenCode was launched from a
shell that had the variable, `{file:}` works however it was started. A `{file:}` target that does
not exist invalidates the WHOLE config, so run `bun run harness:env` right after pasting; it
writes a value file for every variable an MCP config references.

```jsonc
"atlassian": {
  "type": "local",
  "command": ["uvx", "mcp-atlassian@0.23.1"],
  "enabled": true,
  "environment": {
    "JIRA_URL": "https://your-site.atlassian.net",
    "JIRA_USERNAME": "{file:.auth/opencode/ATLASSIAN_EMAIL}",
    "JIRA_API_TOKEN": "{file:.auth/opencode/ATLASSIAN_API_TOKEN}"
  }
}
```

**Codex CLI + Desktop** (`.codex/config.toml`). Codex never expands placeholders: secrets travel
by NAME through `env_vars`, and `[mcp_servers.X.env]` holds literal settings only, which is
where the host goes. `env_vars` forwards a variable under its OWN name and Codex has no rename,
while the server reads `JIRA_USERNAME` / `JIRA_API_TOKEN`; so the command is a one-line `sh`
wrapper that renames at launch. `$VAR` without braces inside `args` is expanded by `sh`, not by
Codex, and the parity check does not treat it as a placeholder. The values come from the Codex
process environment (`bun run codex`, or direnv).

```toml
[mcp_servers.atlassian]
command = "sh"
enabled = true
args = [
  "-c",
  "JIRA_USERNAME=\"$ATLASSIAN_EMAIL\" JIRA_API_TOKEN=\"$ATLASSIAN_API_TOKEN\" exec uvx mcp-atlassian@0.23.1",
]
env_vars = [
  "ATLASSIAN_EMAIL",
  "ATLASSIAN_API_TOKEN",
]

[mcp_servers.atlassian.env]
JIRA_URL = "https://your-site.atlassian.net"
```

On Windows, where Codex has no `sh`, set `JIRA_USERNAME` / `JIRA_API_TOKEN` in the user
environment and use `command = "uvx"` with those two names in `env_vars`; the parity check will
then report the different `.env` dependency, which is the honest state of that machine.

**Gemini CLI**: unsupported harness. This repo ships no Gemini adapter and the parity check
does not know it.

Then restart the agent session: MCP servers read their environment at spawn time (Critical
Rule #10). Verify with `bun run agents:compat:check` and `bun run harness:env --check`.

## MCP parity contract

`bun run agents:compat:check` (in `repo:check` and pre-push) normalises `.mcp.json`,
`opencode.jsonc` and `.codex/config.toml` into one shape (transport, command, args, url, `.env`
dependencies, literal env, enabled) and compares them. The canonical server set is whatever
`.mcp.json` declares; a server missing from another host, or present in one host only, fails
naming the server and the host.

- **It compares `.env` dependencies, not argument spelling.** The three hosts cannot write a
  secret the same way: `${VAR}` in Claude, `{file:.auth/opencode/VAR}` in OpenCode, a name in
  `env_vars` / `bearer_token_env_var` in Codex. What must match is the SET of `.env` variables
  each host depends on, plus the literal settings. So a remote server carrying its key as an
  HTTP header in Claude and as `bearer_token_env_var` in Codex is parity, not drift.
- **Why Codex never gets `${VAR}`.** Codex passes placeholders inside `args` or
  `[mcp_servers.X.env]` to the server as literal text; a `${DBHUB_HOST}` there reaches dbhub as
  the string `${DBHUB_HOST}` and fails on connect like a bad credential. The only way in is by
  name, so the check rejects a placeholder inside a Codex `env` table.
- **The shipped servers get a stricter shape check** (the ids in `KNOWN_MCP_IDS`,
  `cli/lib/agent-compatibility-contracts.ts`) when declared. Any other server, `atlassian`
  included, gets the generic comparison only, so a project may add or drop servers freely.
- **Failure is silent on three hosts** (AGENTS.md Critical Rule #10): an unset variable becomes
  a literal or an empty string and the server dies on its first authenticated call. A 401/403
  from `atlassian` means check `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` in `.env`, run
  `bun run harness:env`, restart.
