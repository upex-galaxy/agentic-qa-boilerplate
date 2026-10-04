---
id: tool-resolution
title: 'Tool resolution and CLI to skill mapping'
load_when: 'a [TAG_TOOL] in a skill, an MCP call, a TMS modality, or a mapped CLI (gh, acli, playwright-cli, bunx allure, resend, jq, bun xray, supabase, wrangler, vercel, orca)'
triggers: ['\[[A-Z_]+_TOOL\]', '\bacli\b', '\bxray\b', '\bplaywright-cli\b', '\ballure\b', '\bresend\b', '\bjq\b', '\bgh\b', '\borca\b', '\bsupabase\b', '\bwrangler\b', '\bvercel\b', '(?<![.\w])MCP\b', '\bmodality\b', '\bcontext7\b', '\bweb ?search\b']
paths: []
---

# Tool resolution

## 6. TOOL RESOLUTION ([TAG_TOOL] pseudocode)

> Skills use `[TAG_TOOL]` pseudocode. Resolve via this table. **PRIORITY**: CLI tools first (fewer tokens). MCP = fallback only.

| Tag | Domain | Primary | Fallback |
|---|---|---|---|
| `[ISSUE_TRACKER_TOOL]` | Jira Cloud (story / bug / epic) | `/acli` | MCP Atlassian (opt-in: `agentic-qa-core/references/mcp-atlassian-optin.md`) |
| `[TMS_TOOL]` | Test management | Modality jira-xray: `/xray-cli`. Modality jira-native: `/acli` | MCP Atlassian (opt-in: `agentic-qa-core/references/mcp-atlassian-optin.md`) |
| `[AUTOMATION_TOOL]` | Browser automation | `/playwright-cli` (the only path: no browser MCP) | none: `/playwright-cli` missing → point-of-use STOP |
| `[DB_TOOL]` | Database | DBHub MCP | Supabase MCP / raw SQL |
| `[API_TOOL]` | API testing | **Schema read**: OpenAPI MCP (read-only). **Execute**: `curl` (token via `bun run api:login` → `.auth/tokens.env`). Canon: `agentic-qa-core/references/api-testing-doctrine.md` | Postman (a harness-level MCP the user connects; never in the project MCP files) |
| `[DOCS_TOOL]` | Library / framework / SDK / API / CLI official docs | Capability `library-docs`: any MCP tool whose name ENDS in `resolve-library-id` → `query-docs`, whichever server exposes it (project `.mcp.json` → `mcp__context7__…`; a claude.ai connector → `mcp__claude_ai_<name>__…`) | built-in `WebSearch` / `WebFetch` ONLY when the user chooses it after the point-of-use STOP |
| `[WEB_SEARCH_TOOL]` | General web search, community fixes, troubleshooting, non-doc research | Capability `web-search`, Exa FIRST: any MCP tool whose name ENDS in `web_search_exa` / `web_fetch_exa`; Tavily SECOND (`tavily_search` / `tavily_extract` / `tavily_research`) when no Exa tool is available or the user asks for Tavily; whichever server exposes it (a claude.ai connector → `mcp__claude_ai_<name>__…`; a user-scope server → `mcp__<its name>__…`). The server lives at HARNESS level, never in the project MCP files (ADR-0005) | built-in `WebSearch` / `WebFetch` ONLY when the user chooses it after the point-of-use STOP |
| `[ORCHESTRATION_TOOL]` | Multi-session orchestration: launch / supervise / message / close persistent workers, worktrees, runs, automations | `/orca-orchestration` (owns the `orca` binary grammar; gate = binary + reachable runtime) | one-shot subagents (§3) + the skill's `launch.txt` lines pasted into terminals by hand |

> **Reads-vs-writes carve-out**: the `[ISSUE_TRACKER_TOOL]` / `[TMS_TOOL]` rows resolve to the WRITE / transition / link / trivial-lookup tool. DETAILED CONTENT reads (custom fields, ACs, ATP/ATR, comments) instead route through `bun run jira:sync-issues get <KEY> --include-comments` / `jql "<query>"`: read the synced `.md` (`acli view` returns null for `customfield_*`). Traceability link-graph + Xray run status stay on `/acli` / `/xray-cli`. See §9 and `agentic-qa-core/references/acli-integration.md`.

**MANDATORY**: LOAD owning skill BEFORE invoking its tool. Skills = WHEN/WHAT. HOW (syntax, flags, auth, errors) lives in skill's `references/`. A tool-name PREFIX is a server name, the SUFFIX is the capability: resolve every MCP capability by suffix, never by prefix (`mcp__tavily__tavily_search`, `mcp__claude_ai_<name>__tavily_search` and a user-level server's `…__tavily_search` all provide `web-search`); no available tool provides it → STOP at the point of use per `agentic-qa-core/references/preflight-gate.md` §8, canon `agentic-qa-core/references/mcp-capabilities.md`.

- Before any `[ISSUE_TRACKER_TOOL] ...` → load `/acli`
- Before any `[TMS_TOOL] ...` Modality jira-xray → load `/xray-cli`
- Before any `[TMS_TOOL] ...` Modality jira-native → load `/acli`
- Before any `[AUTOMATION_TOOL] ...` → load `/playwright-cli`, and read `agentic-qa-core/references/browser-sessions.md` before the first `open` (named session, whose login, pair mode)
- Before any `[API_TOOL] ...` → the OpenAPI MCP is **schema-read-only** (discover endpoints + read schemas); load `agentic-qa-core/references/api-testing-doctrine.md` for the schema → `bun run api:login` → `curl` maneuver. Execute authenticated requests with curl, NEVER via the MCP. (binding: `/sprint-testing`)
- Before any `[DOCS_TOOL] ...` → use the `library-docs` tools directly, any prefix (no skill load: MCP self-documents). NEVER substitute with `WebSearch` / `WebFetch` for library docs. (Rule #10)
- Before any `[WEB_SEARCH_TOOL] ...` → use the `web-search` tools directly (any prefix). NEVER substitute with built-in `WebSearch` / `WebFetch` on your own: no provider → point-of-use STOP, the user chooses. (Rule #10)
- Before any `[ORCHESTRATION_TOOL] ...` → load `/orca-orchestration`. Workflow skills write the pseudocode and NEVER the literal command; the HOW (verbs, flags, gate, cleanup) lives in that skill's `references/`. Gate fails → no mention, no recommendation: run the documented fallback. (binding: `/orca-orchestration`)

**TMS modality fallback** (resolved by `test-documentation/SKILL.md` §Phase 0):

| Modality | `[TMS_TOOL]` resolves to | TMS entities |
|---|---|---|
| A: Xray on Jira | `/xray-cli` for Xray entities; `[ISSUE_TRACKER_TOOL]` for generic Jira | Test, Test Plan, Test Execution, Pre-Condition |
| B: Jira-native (no Xray) | NOT resolvable → falls through to `[ISSUE_TRACKER_TOOL]` (`/acli`) | ATP/ATR = Story custom fields + comments; TCs = Jira `Test` issues. See `test-documentation/references/jira-setup.md` |

Skills using `[TMS_TOOL]` MUST include parallel pseudocode branches for both modalities (labeled "Modality jira-native"). (binding: `/test-documentation`)

**Pseudocode value types**: `Literal` (fixed domain) · `{per convention}` (consult skill ref) · `{{PROJECT_VAR}}` (from `.agents/project.yaml`) · `{from analysis}` (runtime-derived).

## 6.5. CLI → SKILL AUTO-LOAD MAPPING

> Bash invokes these binaries → LOAD matching skill BEFORE running. Skill holds WHEN/WHAT; binary executes HOW. Missing load = flying blind on syntax, flags, auth, errors.

| CLI invoked | Skill(s) to load BEFORE invoking |
|---|---|
| `gh` | `/git-flow-master` (in-repo, when command is git/PR-shaped) |
| `acli` | `/acli` (in-repo) |
| `playwright-cli` | `/playwright-cli` (community PROJECT) + `/playwright-best-practices` (community PROJECT) |
| `bunx allure` (run/agent/generate/open/watch) | `/regression-testing` (in-repo) + `/test-automation` (in-repo) |
| `resend` | `/resend-cli` (community PROJECT) |
| `jq` | `/acli` (primary consumer of jq pipelines) |
| `bun` | `/bun` (community USER) |
| `bun xray` | `/xray-cli` (in-repo). `test enrich` backfills the synced Test `.md` cache with the Xray-internal associations the REST sync cannot see: inlined Preconditions + Test Set membership |
| `supabase` / `wrangler` / `vercel` | `/regression-testing` (in-repo — private report hosting; protocol: `regression-testing/references/private-hosting-setup.md`) |
| `orca` | `/orca-orchestration` (in-repo). That skill holds WHEN/WHAT; the stubs in `orchestration.orchestrator_skills` load ALONGSIDE it (they are small), and the DEEP topics stay served by the binary on demand, never copied into the repo |

**RULE**: Before any Bash call naming these binaries, check matching skill loaded. If not → load via Skill tool first. Hard gate, not suggestion.
