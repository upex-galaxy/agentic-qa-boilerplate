# MCP Capabilities: Declare by Capability, Resolve by Suffix

> Cited by `AGENTS.md` Critical Rule #10, §5 (MCP table) and §6 (tool resolution), by `./preflight-gate.md` §8 (the point-of-use check), and by every skill whose frontmatter declares `metadata.requires_capabilities`. The vocabulary below is mirrored in `scripts/lint-skills.ts` (`KNOWN_CAPABILITIES`, check 18): change both or the gate fails by name.

## 1. Why capabilities, not servers

A tool name has two halves: `mcp__<server>__<tool>`. The **prefix** is the server the host registered; the **suffix** is what the tool does. The same Tavily tool arrives as `mcp__tavily__tavily_search` from the project `.mcp.json`, as `mcp__claude_ai_<connector>__tavily_search` from a claude.ai connector, and under yet another prefix from a user-level server. A worker once concluded "no Tavily" because it matched the prefix. So:

- Skills declare the **capability** they need, never a server name.
- The AI resolves a capability by looking for **any available tool whose name ends in (or, for DBHub, starts with) one of the suffixes below**, whatever its prefix.
- Nothing alarms at session start when a server is disabled (people disable MCPs to save tokens). The only alarm is the point-of-use STOP in §4.

## 2. Vocabulary

| Capability | Tool names that provide it (after the `mcp__<server>__` prefix) | Committed server (`.mcp.json`) | Used for |
|---|---|---|---|
| `web-search` | `tavily_search`, `tavily_extract`, `tavily_research` | `tavily` (needs `TAVILY_API_KEY`) | `[WEB_SEARCH_TOOL]`: community fixes, error lookups, non-doc research |
| `library-docs` | `resolve-library-id`, `query-docs` | `context7` (no key) | `[DOCS_TOOL]`: official library / framework / SDK / CLI docs |
| `db` | `execute_sql_<source_id>`, `search_objects_<source_id>` (DBHub appends the `dbhub.toml` source id, e.g. `execute_sql_primary`) | `dbhub` (needs `DBHUB_*`) | `[DB_TOOL]`: data validation, schema discovery (`./db-testing-doctrine.md`) |
| `api-schema` | `list-api-endpoints`, `get-api-endpoint-schema` (the server also ships `invoke-api-endpoint`; never use it, execution is curl's job) | `openapi` (needs `OPENAPI_SPEC_PATH`, `API_BASE_URL`) | `[API_TOOL]` schema-read leg only (`./api-testing-doctrine.md`) |
| `browser` | `browser_*` (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_take_screenshot`, ...) | `playwright` (no key) | `[AUTOMATION_TOOL]` fallback when `/playwright-cli` is not the right instrument |

`postman` is committed in `.mcp.json` but no skill instructs its use, so it has no capability name yet. Add one here AND in `KNOWN_CAPABILITIES` the day a skill needs it; the lint rejects an undeclared name on purpose.

## 3. Declaring a requirement (skill authors)

The Agent Skills frontmatter spec allows extra keys only inside `metadata`, so the declaration lives there, next to `kind`:

```yaml
metadata:
  kind: workflow
  requires_capabilities: [db, api-schema, browser]
```

**Correspondence rule.** A skill declares a capability when its `SKILL.md` or a reference INSTRUCTS the AI to use it (a `[DB_TOOL]` / `[API_TOOL]` / `[AUTOMATION_TOOL]` / `[DOCS_TOOL]` / `[WEB_SEARCH_TOOL]` step, or the tool names above). Naming a server in a table, an env-var checklist or an "N/A here" sentence is not use. Nothing declared goes unused; nothing used goes undeclared. `scripts/lint-skills.ts` check 18 (`CAPABILITY-VOCAB`, ERROR) rejects a name outside §2; check 19 (`CAPABILITY-UNDECLARED`, WARN) flags a `SKILL.md` body that carries one of the five resolution tags without declaring the matching capability. That heuristic reads the `SKILL.md` body only (not `references/`), so a tag in a legend table trips it: treat the WARN as "declare it or drop the row", never as noise to silence in the script.

Each declaring skill cites the point-of-use procedure with one line in its Compact Rules or its preflight section; the procedure itself lives ONLY in `./preflight-gate.md` §8.

## 4. Point-of-use STOP (summary; procedure in `./preflight-gate.md` §8)

Before the step that uses a declared capability, check that at least one available tool provides it (by suffix). None → STOP and tell the user, in one message: which capability is missing, which server normally provides it (§2), and how to enable it (§5). Never degrade to another tool on your own: built-in `WebSearch` / `WebFetch` are NOT a silent fallback for `web-search` or `library-docs`, and reading route files is not a silent fallback for `api-schema`. The user decides; their explicit "use X instead" is the only thing that unblocks a substitute.

**User prompts follow the same rule.** "Search the web for X", "look up the Prisma docs", "query the staging DB" each clearly need one capability; when no tool provides it, answer with the same one-message STOP instead of a substitute.

## 5. Enabling a missing capability

| Host | Where the server lives | How to enable |
|---|---|---|
| Claude Code | `.mcp.json` (project), `~/.claude.json` (user), or a claude.ai connector | `/mcp` inside the session lists every server and lets you enable, authenticate or reconnect one without leaving the session. Launch with `bun run claude` so `.env` feeds the `${VAR}` references. A claude.ai connector is connected from claude.ai settings and its tools appear under `mcp__claude_ai_<connector>__`. |
| OpenCode | `opencode.jsonc` → `mcp.<server>` | Set `enabled: true`; secrets resolve through `{file:.auth/opencode/VAR}` (placeholder files created by `bun install`, an empty one yields an empty string). Restart the session. |
| Codex CLI / Desktop | `.codex/config.toml` → `[mcp_servers.<server>]` | Present in a TRUSTED repository; a missing `bearer_token_env_var` fails loudly naming the server. Restart the session. |

Server enabled but the first call returns 401/403 or a mystery failure → that is the credential case of `AGENTS.md` Critical Rule #10: name the env var, point to `.env` / `.env.example`, ask for the fix and a RESTART (values are read at MCP spawn time).
