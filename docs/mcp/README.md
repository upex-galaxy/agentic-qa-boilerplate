# MCP Configuration Templates

This directory contains **pre-configured MCP server templates** for different AI CLI tools, the syntax reference for each host's env-var expansion, plus the canonical reference for the opt-in Atlassian MCP server.

## Runtime configs committed in this repo

The boilerplate runs on three harnesses from one source (`AGENTS.md` + `.agents/skills/`, see `AGENTS.md` §4.5). The MCP inventory is the one surface that genuinely differs per host, so it exists once per format, committed, with the same server set on every host: whatever `.mcp.json` declares (`context7`, `tavily`, `playwright`, `dbhub`, `openapi`, `postman` out of the box):

| Harness             | Committed config     | Env-var syntax                                        | Launcher (loads `.env` first) |
| ------------------- | -------------------- | ----------------------------------------------------- | ----------------------------- |
| Claude Code         | `.mcp.json`          | `${VAR}` inside args / env values / headers           | `bun run claude`              |
| OpenCode            | `opencode.jsonc`     | `{env:VAR}` inside command / environment / headers    | `bun run opencode`            |
| Codex CLI + Desktop | `.codex/config.toml` | `env_vars = ["VAR"]` / `bearer_token_env_var` by name | `bun run codex`               |

`bun run agents:compat:check` normalizes the three files into one shape (transport, command, args, url, `.env` dependencies, literal env, enabled) and compares them. The canonical set is whatever `.mcp.json` declares: a server missing from another host, present in one host only, or depending on a different set of `.env` variables, fails the check (it runs inside `repo:check` and the pre-push hook). The six ids the boilerplate ships additionally get a strict per-host shape check when the project declares them; a project that declares a different set (say `supabase` instead of `postman`) passes on the generic check alone. `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` are project-owned: `bun run up` never overwrites them, it only reports drift from upstream in its parity prompt. Gemini CLI and Cursor have no runtime adapter: they stay template-only below. `.codex/config.toml` is read only in a repository Codex trusts; `bun run setup:doctor` warns about that.

## Available Templates

| File                     | For Tool    | Format | Description                                                                                        |
| ------------------------ | ----------- | ------ | -------------------------------------------------------------------------------------------------- |
| `claude.template.json`   | Claude Code | JSON   | `.mcp.json` in project root                                                                        |
| `opencode.template.json` | OpenCode    | JSON   | `opencode.jsonc` in project root                                                                   |
| `codex.template.toml`    | Codex CLI   | TOML   | Derived from the committed `.codex/config.toml` (same server set) plus opt-in extras with `{{VAR}}` |
| `gemini.template.json`   | Gemini CLI  | JSON   | `~/.gemini/settings.json` (template only, no runtime adapter in this repo)                         |

## Atlassian MCP (opt-in)

The Atlassian MCP server is **not enabled by default**. By default this boilerplate uses `acli` (Atlassian CLI) for all Jira / Confluence / TMS work — including both Modality jira-xray and Modality jira-native test-management flows. If you need MCP-level access to Atlassian (e.g. for tools acli does not expose), enable it manually:

1. Open the matching template under this directory:
   - Claude Code: `claude.template.json`
   - OpenCode: `opencode.template.json`
   - Gemini CLI: `gemini.template.json`
   - Codex CLI: `codex.template.toml`
2. Copy the `atlassian` block into your active config (`.mcp.json` for Claude Code, `opencode.jsonc` for OpenCode, etc.).
3. Confirm `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` are set in `.env` (the installer collects both during `bun run setup`).
4. Replace `{{ATLASSIAN_URL}}` in the block you pasted with the literal site host — print it with `bun run --silent jira:url`. It is not read from `.env`: an MCP config cannot invoke a command, so this one value is pasted rather than referenced. After a site migration, update `.agents/project.yaml` first, then re-paste here; `bun run setup:doctor` cannot see a stale value inside an MCP config.
4. Restart your agent so the new MCP server is picked up.

## Variable Format

Templates use tool-native env-var expansion (and `{{VARIABLE}}` placeholders for values the tool cannot interpolate). Two strategies:

| Strategy                           | Replace with                         | Then                                              | Use when                         |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------- | -------------------------------- |
| **A. Literal value** (legacy)      | The real secret directly             | Add the config file to `.gitignore`               | Personal-only config             |
| **B. Native env-var expansion**    | Tool-native syntax (see table below) | Store the real value in `.env`, commit the config | Team-shared config (recommended) |

### Native env-var syntax (for strategy B)

| Tool        | Syntax                       | Example           | Missing-var behavior                 |
| ----------- | ---------------------------- | ----------------- | ------------------------------------ |
| Claude Code | `${VAR}` / `${VAR:-default}` | `${API_TOKEN}`    | Fails to parse the config (safe)     |
| OpenCode    | `{env:VAR}`                  | `{env:API_TOKEN}` | Substitutes empty string (footgun)   |
| Codex CLI   | `env_vars = ["VAR"]` (stdio) / `bearer_token_env_var = "VAR"` (HTTP), by name | `env_vars = ["API_TOKEN"]` | Variable is not forwarded; the server fails at auth (401/403) |
| Gemini CLI  | `$VAR` / `${VAR}`            | `$API_TOKEN`      | Depends on field                     |

Codex never expands `${VAR}` inside `args` or `env` values, so a placeholder there is passed to the server as literal text. The committed `.codex/config.toml` therefore forwards every secret by name: `tavily` and `postman` (HTTP) carry `bearer_token_env_var`, `openapi` (stdio) lists `API_BASE_URL` and `OPENAPI_SPEC_PATH` in `env_vars`. `[mcp_servers.X.env]` tables hold literal settings only; `agents:compat:check` rejects a placeholder there. Details in [`mcp-configuration-guide.md`](./mcp-configuration-guide.md) § Codex CLI.

For strategy B, also need a `.env` loader so the agent process has the vars at spawn time:

- Cross-platform: `bun run claude` / `bun run opencode` / `bun run codex` (`dotenv -o -e .env` wrappers in `package.json`; `-o` makes `.env` win over an inherited shell variable)
- macOS/Linux optional: a `.envrc` with `dotenv_if_exists .env` + `direnv allow`

**Working example**: see `.mcp.json`, `opencode.jsonc`, `.codex/config.toml`, and `.env.example` in this repo's root.

## MCP Servers Included (what `.mcp.json` declares out of the box, mirrored in `opencode.jsonc` / `.codex/config.toml`)

| Server         | Type   | Description                                  |
| -------------- | ------ | -------------------------------------------- |
| **context7**   | stdio  | Developer documentation lookup               |
| **tavily**     | remote | Web search                                   |
| **playwright** | stdio  | E2E browser testing with vision/PDF/tracing  |
| **dbhub**      | stdio  | Database testing via DBHub                   |
| **openapi**    | stdio  | API schema/contract reads (endpoint discovery; execution = curl) |
| **postman**    | remote | API collections & testing                    |

## MCP Servers Available via Template (opt-in)

| Server         | Type   | Description                                  | How to enable                                                  |
| -------------- | ------ | -------------------------------------------- | -------------------------------------------------------------- |
| **atlassian**  | stdio  | Jira/Confluence                              | Copy the `atlassian` block from the matching template (above)  |

## Quick Start

### 1. Copy Template

**For Claude Code**:

```bash
cp docs/mcp/claude.template.json .mcp.json
```

**For OpenCode**:

```bash
cp docs/mcp/opencode.template.json opencode.jsonc
```

**For Codex CLI**:

```bash
mkdir -p ~/.codex
cp docs/mcp/codex.template.toml ~/.codex/config.toml
```

**For Gemini CLI**:

```bash
mkdir -p ~/.gemini
cp docs/mcp/gemini.template.json ~/.gemini/settings.json
```

### 2. Fill Variables in `.env`

The installer (`bun run setup`) prompts for every required key and writes them to `.env`. To do it manually, copy `.env.example` to `.env` and fill in `TAVILY_API_KEY`, `ATLASSIAN_*`, `API_BASE_URL`, `OPENAPI_SPEC_PATH`, `POSTMAN_API_KEY`. (The API auth token is NOT set in `.env` — it is minted into `.auth/tokens.env` by `bun run api:login` and used by curl.)

### 3. Verify Setup

Run your agent and verify with:

```
/mcp
```

## Key Differences by Tool

| Feature        | Claude         | OpenCode         | Codex          | Gemini       |
| -------------- | -------------- | ---------------- | -------------- | ------------ |
| Root key       | `mcpServers`   | `mcp`            | `mcp_servers`  | `mcpServers` |
| Command        | string         | array            | string         | string       |
| Env vars       | `env`          | `environment`    | `[server.env]` | `env`        |
| Remote type    | `type: "http"` | `type: "remote"` | `url`          | `httpUrl`    |
| Enable/disable | N/A            | `enabled`        | `enabled`      | N/A          |

## Security

- **Templates** (this folder) = safe for git, uses `${VAR}` / `{env:VAR}` / `{{VAR}}` placeholders
- **Active configs** (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`) = committed but only reference env vars by placeholder or by name; secrets live in `.env` (gitignored)

## Documentation

For complete setup guide, see: [`mcp-configuration-guide.md`](./mcp-configuration-guide.md)
