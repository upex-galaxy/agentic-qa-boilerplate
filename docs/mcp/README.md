# MCP Configuration Templates

This directory contains **pre-configured MCP server templates** for different AI CLI tools, plus the canonical reference for the opt-in Atlassian MCP server.

## Available Templates

| File                     | For Tool    | Format | Description                         |
| ------------------------ | ----------- | ------ | ----------------------------------- |
| `claude.template.json`   | Claude Code | JSON   | `.mcp.json` in project root         |
| `opencode.template.json` | OpenCode    | JSON   | `opencode.jsonc` in project root    |
| `codex.template.toml`    | Codex CLI   | TOML   | `~/.codex/config.toml` or `.codex/` |
| `gemini.template.json`   | Gemini CLI  | JSON   | `~/.gemini/settings.json`           |

## Atlassian MCP (opt-in)

The Atlassian MCP server is **not enabled by default**. By default this boilerplate uses `acli` (Atlassian CLI) for all Jira / Confluence / TMS work — including both Modality jira-xray and Modality jira-native test-management flows. If you need MCP-level access to Atlassian (e.g. for tools acli does not expose), enable it manually:

1. Open the matching template under this directory:
   - Claude Code: `claude.template.json`
   - OpenCode: `opencode.template.json`
   - Gemini CLI: `gemini.template.json`
   - Codex CLI: `codex.template.toml`
2. Copy the `atlassian` block into your active config (`.mcp.json` for Claude Code, `opencode.jsonc` for OpenCode, etc.).
3. Confirm `ATLASSIAN_URL`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` are set in `.env` (the installer collects these during `bun run setup`).
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
| Codex CLI   | `${VAR}`                     | `${API_TOKEN}`    | Depends on field                     |
| Gemini CLI  | `$VAR` / `${VAR}`            | `$API_TOKEN`      | Depends on field                     |

For strategy B, also need a `.env` loader so the agent process has the vars at spawn time:

- Cross-platform: `bun claude` / `bun opencode` (`dotenv-cli` wrapper in `package.json`)
- macOS/Linux optional: a `.envrc` with `dotenv_if_exists .env` + `direnv allow`

**Working example**: see `.mcp.json`, `opencode.jsonc`, and `.env.example` in this repo's root.

## MCP Servers Included (default — committed in `.mcp.json` / `opencode.jsonc`)

| Server         | Type   | Description                                  |
| -------------- | ------ | -------------------------------------------- |
| **context7**   | stdio  | Developer documentation lookup               |
| **tavily**     | remote | Web search                                   |
| **playwright** | stdio  | E2E browser testing with vision/PDF/tracing  |
| **dbhub**      | stdio  | Database testing via DBHub                   |
| **openapi**    | stdio  | REST API testing via OpenAPI spec            |
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

The installer (`bun run setup`) prompts for every required key and writes them to `.env`. To do it manually, copy `.env.example` to `.env` and fill in `TAVILY_API_KEY`, `ATLASSIAN_*`, `API_BASE_URL`, `OPENAPI_SPEC_PATH`, `API_TOKEN`, `POSTMAN_API_KEY`.

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
- **Active configs** (`.mcp.json`, `opencode.jsonc`) = committed but only reference env vars; secrets live in `.env` (gitignored)

## Documentation

For complete setup guide, see: [`mcp-configuration-guide.md`](./mcp-configuration-guide.md)
