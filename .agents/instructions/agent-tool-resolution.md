---
id: tool-resolution
title: 'Tool resolution and CLI to skill mapping'
load_when: 'a [TAG_TOOL] in a skill, an MCP call, a TMS modality, or a mapped CLI (gh, acli, playwright-cli, bunx allure, resend, jq, bun xray, supabase, wrangler, vercel, orca)'
triggers: ['\[[A-Z_]+_TOOL\]', '\bacli\b', '\bxray\b', '\bplaywright-cli\b', '\ballure\b', '\bresend\b', '\bjq\b', '\bgh\b', '\borca\b', '\bsupabase\b', '\bwrangler\b', '\bvercel\b', '(?<![./\w])MCP\b', '\bmodality\b', '\bcontext7\b', '\bweb ?search\b']
paths: []
---

# Tool resolution

## 6. TOOL RESOLUTION ([TAG_TOOL] pseudocode)

Skills write `[TAG_TOOL]` pseudocode and this table resolves it. CLI tools come first because they cost fewer tokens; an MCP is the fallback.

| Tag | Domain | Primary | Fallback |
|---|---|---|---|
| `[ISSUE_TRACKER_TOOL]` | Jira Cloud (story / bug / epic) | `/acli` | MCP Atlassian (opt-in: `agentic-qa-core/references/mcp-atlassian-optin.md`) |
| `[TMS_TOOL]` | Test management | Modality jira-xray: `/xray-cli`. Modality jira-native: `/acli` | MCP Atlassian (opt-in: `agentic-qa-core/references/mcp-atlassian-optin.md`) |
| `[AUTOMATION_TOOL]` | Browser automation | `/playwright-cli` (the only path: no browser MCP) | none; with `/playwright-cli` missing, stop at the point of use |
| `[DB_TOOL]` | Database | DBHub MCP | Supabase MCP / raw SQL |
| `[API_TOOL]` | API testing | Schema read: OpenAPI MCP (read-only). Execute: `curl` (token via `bun run api:login` → `.auth/tokens.env`). Canon: `agentic-qa-core/references/api-testing-doctrine.md` | Postman (a harness-level MCP the user connects, never in the project MCP files) |
| `[DOCS_TOOL]` | Library / framework / SDK / API / CLI official docs | Capability `library-docs`: any MCP tool whose name ENDS in `resolve-library-id` → `query-docs`, whichever server exposes it (project `.mcp.json`: `mcp__context7__…`; a claude.ai connector: `mcp__claude_ai_<name>__…`) | built-in `WebSearch` / `WebFetch` only when the user chooses it after the point-of-use STOP |
| `[WEB_SEARCH_TOOL]` | General web search, community fixes, troubleshooting, non-doc research | Capability `web-search`, Exa first: any MCP tool whose name ENDS in `web_search_exa` / `web_fetch_exa`; Tavily second (`tavily_search` / `tavily_extract` / `tavily_research`) when no Exa tool is available or the user asks for Tavily; whichever server exposes it (a claude.ai connector: `mcp__claude_ai_<name>__…`; a user-scope server: `mcp__<its name>__…`). The server lives at harness level, never in the project MCP files (ADR-0005) | built-in `WebSearch` / `WebFetch` only when the user chooses it after the point-of-use STOP |
| `[ORCHESTRATION_TOOL]` | Multi-session orchestration: launch / supervise / message / close persistent workers, worktrees, runs, automations | `/agent-orchestration` (user level; owns when and what over the `orca` binary; gate = binary + reachable runtime) | one-shot subagents (§3) + the `launch.txt` lines pasted into terminals by hand (`agentic-qa-core/references/fleet-launch-seam.md`) |

A content read through the `[ISSUE_TRACKER_TOOL]` or `[TMS_TOOL]` row is the exception to that table. Those rows resolve to the write, transition, link and trivial-lookup tool, while detailed reads (custom fields, ACs, ATP and ATR, comments) go through `bun run jira:sync-issues get <KEY> --include-comments` or `jql "<query>"`, and you read the synced `.md` (`acli view` returns null for `customfield_*`). The link graph and Xray run status stay on `/acli` and `/xray-cli`. See §9 and `agentic-qa-core/references/acli-integration.md`.

Load the owning skill before invoking its tool. The skill says when and what; how (syntax, flags, auth, errors) lives in its `references/`. A tool-name prefix is a server name and the suffix is the capability, so resolve every MCP capability by suffix: `mcp__tavily__tavily_search`, `mcp__claude_ai_<name>__tavily_search` and a user-level server's `…__tavily_search` all provide `web-search`. Pi writes every non-alphanumeric character as `_`, so `resolve-library-id` arrives as `…__resolve_library_id`, found through its `tool_search`. When no available tool provides a capability, stop at the point of use per `agentic-qa-core/references/preflight-gate.md` §8 (canon: `agentic-qa-core/references/mcp-capabilities.md`).

- Before `[ISSUE_TRACKER_TOOL]`, load `/acli`.
- Before `[TMS_TOOL]` in modality jira-xray, load `/xray-cli`; in modality jira-native, load `/acli`.
- Before `[AUTOMATION_TOOL]`, load `/playwright-cli`, and read `agentic-qa-core/references/browser-sessions.md` before the first `open` (named session, whose login, pair mode).
- Before `[API_TOOL]`, load `agentic-qa-core/references/api-testing-doctrine.md`. The OpenAPI MCP only discovers endpoints and reads schemas; the maneuver is schema, then `bun run api:login`, then `curl`, and authenticated requests run with `curl`, never through the MCP. (binding: `/sprint-testing`)
- Before `[DOCS_TOOL]`, use the `library-docs` tools directly, under any prefix, with no skill load because the MCP documents itself. Library docs never come from `WebSearch` or `WebFetch`. (Rule #10)
- Before `[WEB_SEARCH_TOOL]`, use the `web-search` tools directly, under any prefix. Built-in `WebSearch` and `WebFetch` are not a substitute you pick yourself: with no provider, stop at the point of use and let the user choose. (Rule #10)
- Before `[ORCHESTRATION_TOOL]`, load `/agent-orchestration`, then this repo's `agentic-qa-core/references/fleet-project-profile.md`. Workflow skills write the pseudocode and never the literal command, and the verbs, flags, gate and cleanup live in that skill's references. When the gate fails, or the skill is not installed, do not mention or recommend it; run the documented fallback (`agentic-qa-core/references/fleet-launch-seam.md` §1).

**TMS modality fallback**, resolved by `test-documentation/SKILL.md` §Phase 0:

| Modality | `[TMS_TOOL]` resolves to | TMS entities |
|---|---|---|
| A: Xray on Jira | `/xray-cli` for Xray entities; `[ISSUE_TRACKER_TOOL]` for generic Jira | Test, Test Plan, Test Execution, Pre-Condition |
| B: Jira-native (no Xray) | not resolvable, falls through to `[ISSUE_TRACKER_TOOL]` (`/acli`) | ATP/ATR = native `Test Plan` / `Test Execution` items by excellence (the Story custom field + comment is the fallback only when that work type is absent); TCs = Jira `Test` issues. See `test-documentation/references/jira-setup.md` |

A skill using `[TMS_TOOL]` carries parallel pseudocode branches for both modalities, the second labeled "Modality jira-native". (binding: `/test-documentation`)

Pseudocode values come in four types: `Literal` (fixed domain), `{per convention}` (consult the skill ref), `{{PROJECT_VAR}}` (from `.agents/project.yaml`) and `{from analysis}` (derived at runtime).

## 6.5. CLI → SKILL AUTO-LOAD MAPPING

A Bash call that names one of these binaries loads the matching skill first, through the Skill tool. The skill holds when and what, the binary does the how, and skipping the load means guessing syntax, flags, auth and errors. This is a hard gate, not a suggestion.

| CLI invoked | Skill(s) to load BEFORE invoking |
|---|---|
| `gh` | `/git-flow-master` (in-repo, when command is git/PR-shaped) |
| `acli` | `/acli` (in-repo) |
| `playwright-cli` | `/playwright-cli` (community PROJECT) + `/playwright-best-practices` (community PROJECT) |
| `bunx allure` (run/agent/generate/open/watch) | `/regression-testing` (in-repo) + `/test-automation` (in-repo) |
| `resend` | `/resend-cli` (community PROJECT) |
| `jq` | `/acli` (primary consumer of jq pipelines) |
| `bun xray` | `/xray-cli` (in-repo). `test enrich` backfills the synced Test `.md` cache with the Xray-internal associations the REST sync cannot see: inlined Preconditions + Test Set membership |
| `supabase` / `wrangler` / `vercel` | `/regression-testing` (in-repo, private report hosting; protocol: `regression-testing/references/private-hosting-setup.md`) |
| `orca` | `/agent-orchestration` (community USER, installed by `cli/install.ts`) + `agentic-qa-core/references/fleet-project-profile.md` (in-repo). The skill holds WHEN/WHAT and loads the vendor guides by name; the deep topics stay served by the binary on demand, never copied into the repo. Not installed: the fallback of `fleet-launch-seam.md` §1 |
