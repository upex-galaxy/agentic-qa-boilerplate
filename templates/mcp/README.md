# MCP Configuration Templates

Per-agent MCP templates consumed by `cli/install.ts` (i.e. `bun run setup`). They are NOT
the same as `.mcp.example.json` at the repo root, even though they overlap in content.

## Two parallel files, two audiences

| File                          | Audience                          | Placeholder syntax | Read by                          |
| ----------------------------- | --------------------------------- | ------------------ | -------------------------------- |
| `.mcp.example.json` (repo root)| Human reading the README          | `${VAR}` (shell)   | The user, manually               |
| `templates/mcp/*.template.json`| `cli/install.ts` (the installer)  | `{{VAR}}` (curly)  | The installer, programmatically  |

`.mcp.example.json` documents how to wire MCPs by hand: copy it to `.mcp.json`, replace
`${VAR}` with real values, optionally use `direnv` / dotenv to expand at runtime.

The templates here are **installer fuel**. The installer reads them, prompts the user for
each `{{VAR}}` placeholder, and writes the resulting JSON to `.mcp.json` (Claude Code) or
`opencode.json` (OpenCode). Values entered are hardcoded into the output (the installer
does not preserve `${VAR}` runtime expansion). `.mcp.json` and `opencode.json` are
gitignored.

## Available templates

| File                     | For agent     | Format | Output path             |
| ------------------------ | ------------- | ------ | ----------------------- |
| `claude.template.json`   | Claude Code   | JSON   | `.mcp.json`             |
| `opencode.template.json` | OpenCode      | JSON   | `opencode.json`         |

Codex and Gemini templates are NOT shipped here — `cli/install.ts` only wires Claude Code
and OpenCode for now. To support more agents, add a template in this directory and a
matching `configureMcpFor<Agent>` branch in the installer.

## Servers included (7 — same set as `.mcp.example.json`)

| Server     | Purpose for QA                                       | Secret prompts            |
| ---------- | ---------------------------------------------------- | ------------------------- |
| context7   | Official library docs (Playwright, Allure, etc.)     | none                      |
| tavily     | Web search / community Q&A                           | `TAVILY_API_KEY`          |
| playwright | Live browser interactions for exploratory QA         | none                      |
| atlassian  | Jira / Confluence read + write                       | URL, email, API token × 2 |
| dbhub      | Database queries (uses separate `dbhub.toml`)        | none                      |
| openapi    | API endpoint exploration via OpenAPI spec            | base URL, spec, bearer    |
| postman    | Saved request collections                            | `POSTMAN_API_KEY`         |

## Re-running the installer

The installer is idempotent. On re-run it offers to keep the existing `.mcp.json` /
`opencode.json` or overwrite. For partial fills (some placeholders still present), the
recommended flow is to delete the file and re-run, or edit the file by hand. A future
iteration may add a `--re-prompt-placeholders-only` mode.

## Adding or removing servers

1. Edit both `claude.template.json` and `opencode.template.json` (keep them in sync —
   different wire format, same logical set).
2. If the new server has secrets, add a discovery rule in `cli/install.ts`
   (`PLACEHOLDER_PATTERN`). The installer auto-prompts for any `{{VAR}}` it finds.
3. Update `.mcp.example.json` for the manual-wiring audience.
4. Update the table above.

## Security

- **Templates here** (`templates/mcp/*.template.json`) — safe for git. Contain only
  `{{VAR}}` placeholders, no real secrets.
- **Installer output** (`.mcp.json`, `opencode.json`) — gitignored. Contains real values
  the installer wrote in. Never commit these.
- **DBHub config** (`dbhub.toml`) — gitignored. Contains DB connection strings.
- The installer never reads `.env` directly; it reads MCP secrets from `process.env`
  (in non-interactive mode) or from interactive prompts. Match the env var names listed
  in the table above when running `--non-interactive`.
