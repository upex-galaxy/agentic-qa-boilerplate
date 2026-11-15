# Readiness preflight gate: shared doctrine

> Cited by every skill marked `metadata.stage_owner: true` in its frontmatter. It loads on demand at the very start of a skill, before the session-resume check and before any real work.
> Siblings: `./session-management.md` (the resume contract, which runs right after this gate), `./orchestration-doctrine.md`, `./acli-integration.md`, `./mcp-capabilities.md` (capability vocabulary and the enable table for the §8 point-of-use check), `./decision-protocol.md` (who may answer a question; §9 below depends on it).

## 1. Purpose

A testing run that finds a missing tool, a dead MCP, an expired token or an unset credential half-way through has wasted the most: an ATP authored against a dead environment, a Stage 2 API exploration that returns 401, a regression trigger that fails `gh auth`. This gate moves every such surprise to t=0. It probes each capability the skill needs, surfaces one checklist, and either fixes the gap (with an explanation and approval) or stops with the exact remedy, before the skill does anything else.

The gate is a clause, not a phase rewrite. It runs, it clears, and the skill then proceeds through its own Phase 0 (resume) and pipeline.

## 2. The two laws

**Law 1, args as answers.** Treat the invocation like a CLI call: whatever the user already said in natural language is a provided argument, so do not ask it again. "QA UPEX-123 on staging" answers environment and scope. "Test the login API" answers the surface. Ask only the gaps. When every answer is present and every probe is GREEN, ask nothing: announce the green checklist in one line and continue.

**Law 2, probe, never assume.** "Configured in `.mcp.json`" does not mean valid. A capability is GREEN only when it was exercised: DBHub lists a schema, the OpenAPI token is unexpired, `gh` reports authenticated, the browser binary exists, the env root returns 2xx or 3xx. An env var that is set is necessary but not sufficient.

## 3. Gate sequence (run in order)

1. **Resolve the environment.** Take it from the invocation arg; else default to **staging** (`.agents/instructions/agent-ticket-work.md`); ask only when it is genuinely ambiguous. Persist it as `<<ACTIVE_ENV>>` for the session.
2. **Assemble the required-capability set.** Each skill ships its own matrix (§"Required capabilities" in its SKILL.md) plus the MCP capabilities its frontmatter declares (`metadata.requires_capabilities`, vocabulary in `./mcp-capabilities.md`). Those MCP capabilities are verified at the point of use (§8), not here. Drop what the resolved scope makes irrelevant (no DB surface in this ticket means DBHub is optional).
3. **Probe every required capability** (§4 table) and build a GREEN / RED list.
4. **Branch.** All required GREEN: emit a one-line green summary and continue to the resume check. Any RED: go to §5.
5. **Resolve the REDs** per §5, then re-probe the ones fixed in-session. Variables an MCP reads at spawn time (§6) cannot be re-probed without an agent restart, so stop after writing them.

On **resume** (the skill's Phase 0 finds prior `.session/` state), re-run the fast probes (env reachable, token unexpired, `gh` auth) and skip the questions already answered in the prior `plan.md`. Tokens and env health expire; answers do not.

## 3.1 Generic baseline vs skill-specific delta

These hold for every testing skill and are owned here, so a skill does not restate them:

- The two laws (§2).
- Environment resolution (§3 step 1): arg first, default staging, ask only if genuinely ambiguous.
- Secret and token handling and the spawn-time RESTART rule (§6).
- The single-checklist `AskUserQuestion` behavior (§5) and the output contract (§7).
- Surfaces and test types are never a user question (§5). They are a planning-phase decision.
- **The gate probes artifacts and never runs heavy setup commands itself.** A missing adapted state, missing discovery output (no `.context/project-config.md`, or the `business-domain-context` / `infra-context` maps still placeholders), or any other heavy-setup gap stops the gate with the command for the user to run (`/project-discovery`, `/test-framework-adaptation`). Those commands are write-gated, interactive and token-heavy, and the user drives them in a clean session. The gate checks their output.

Each skill declares only its specific capability delta: the REQUIRED, scope-conditional and optional rows from §4 that its work needs.

## 4. Capability probe table

Probe only what the skill's matrix lists. `[TAG_TOOL]` resolves per `.agents/instructions/agent-tool-resolution.md`.

| Capability | GREEN probe | Typical RED remedy |
|---|---|---|
| **Framework adapted (artifacts present, not a generic boilerplate)** | The output that `/test-framework-adaptation` produces is in place. Probe its Phase 9 ADAPTED signals, read-only: `bun run vars:check` exits 0 AND `.agents/project.yaml` has zero `null #` lines; none of `ExampleApi.ts` / `ExamplePage.ts` / `ExampleSteps.ts` / `api/schemas/example.types.ts` exist; no `module-example` spec dirs remain under `tests/e2e/` / `tests/integration/`. | Still generic: stop and hand the user the commands to run themselves: `/project-discovery` (if `.context/project-config.md` is missing or `bun run context:map infra-context` prints a placeholder notice), then `/test-framework-adaptation`. The gate verifies their artifacts and never runs them. |
| **Active env reachable** | HTTP HEAD/GET on `{{WEB_URL}}` and `{{API_URL}}` root returns 2xx/3xx (a login redirect counts). | 404/410/5xx, refused, or a dead-deploy page: stop; offer a session env override (a URL the user supplies). |
| **Test-user credentials** | The credentials `config/variables.ts` declares for `<<ACTIVE_ENV>>` are present in `.env` (the shipped names are `LOCAL_USER_*` / `STAGING_USER_*`; an adapted project may have renamed them). Nothing requires them up front: `config.testUser` fails by name the moment a test reads an empty pair, so this skill-time ask is the point of use for a session about to log in. | Empty: the user fills `.env` (template in `.env.example`). Never hardcode them, never echo the value back. |
| **User roles** | The project's role count is known and each role has creds in `.env`. When the SUT publishes a `/qa` testability page (`project-discovery/references/phase-3-infrastructure.md`), its demo users give the role count and its credentials button points at the credentials artifact (a Jira Epic by default, readable through the synced cache with `bun run jira:sync-issues get <KEY>`). The user copies those values into `.env`; none of them is quoted back or written to a committed file. | Multi-role project with one cred set: ask how many roles; have the user add per-role creds as `<ENV>_<ROLE>_EMAIL` / `<ENV>_<ROLE>_PASSWORD` (role `user` is the existing pair). Browser state per role: `browser-sessions.md` §4. `bun run api:login [<env>] --role <role> [--profile <name>]` mints one token per role into `.auth/tokens.env` (var `API_TOKEN_<ROLE>_<ENV>`); `--profile <name>` isolates it under `.auth/profiles/<name>/` instead. Every role signs in through the app's own login, never a minted session (`browser-sessions.md` §4), and in `production` each role is a dedicated synthetic QA account: never a real customer's, a staff member's or the owner's. |
| **OpenAPI MCP (schema read-only)** | `openapi` server present in `.mcp.json`; `OPENAPI_SPEC_PATH` set (the full spec URL, or a file path relative to the repo root; never the endpoint route alone); a `list-api-endpoints` / `get-api-endpoint-schema` call returns the spec. No token is needed: the MCP does not execute. | Spec path unset or endpoints generic: the project never ran `/test-framework-adaptation`; hand off there. Authenticated execution is curl's job (§6 and `api-testing-doctrine.md`). |
| **DBHub MCP (data validation)** | `dbhub` server present; `DBHUB_*` set in `.env`; a probe query lists tables or returns the schema. | Unset vars or auth failure: the user fills the `.env` DBHUB_* block, then RESTARTS (spawn-time, §6). |
| **Issue-tracker (`[ISSUE_TRACKER_TOOL]`)** | `/acli` loaded; the auth check per `/acli` references passes (`bun run jira:check` validates the Jira field and workflow setup). | Not authenticated or token missing: tell the user the exact var (`ATLASSIAN_*`) and `.env`, ask them to fix it and RESTART. |
| **TMS (`[TMS_TOOL]`)** | Modality resolved (jira-xray vs jira-native, per `test-documentation/SKILL.md` §Phase 0). Modality jira-xray: `/xray-cli` loaded and `XRAY_*` creds set. | Xray creds missing: the user fills `.env` `XRAY_*`. Modality unresolved: run the modality probe in `test-documentation/SKILL.md` §Phase 0; ask only if all auto-checks fail. |
| **GitHub CLI** | `gh auth status` reports authenticated; repo and workflows visible. | Not authed: the user runs `gh auth login` themselves (suggest the `!` prefix); do not proceed. |
| **Playwright browsers** | `bunx playwright --version` resolves; chromium installed. | Missing browser: offer to run `bun run pw:install` (explain that it downloads chromium), then proceed. |
| **Email (`resend`)** | The `resend` binary is present and logged in (`resend login`, keychain-backed; load `/resend-cli`). The mailbox can receive, not just send, for magic-link and token flows. | Send-only or not logged in: stop for email-dependent tickets; surface it before authoring anything. |
| **Web search / docs** (`web-search` / `library-docs`) | At least one available tool provides the capability by suffix (`web_search_exa` or `tavily_search` / `resolve-library-id`, any prefix: `mcp-capabilities.md` §2; on Pi every other character in a tool name becomes `_`, so it arrives as `resolve_library_id`). Web search is a harness-level server (a connector or a user-scope MCP), never a project `.env` key. | No provider: the §8 point-of-use STOP (name the capability and how to enable it per host, `mcp-capabilities.md` §5). Built-in `WebSearch` / `WebFetch` are never a fallback the agent picks; the user may choose them explicitly. |
| **Dev toolchain** | `bun run test` / `types:check` / `lint:check` resolve; `kata-manifest.json` present and `bun run kata:manifest:check` clean. | Stale manifest: `bun run kata:manifest`. Missing dep: `bun install`. |
| **GitHub Actions Secrets/Variables** | For CI-driven skills only: the runner holds the env-prefixed creds and tokens as Repository or Environment Secrets. `gh secret list` / `gh variable list` (add `--env <env>` for environment-scoped) shows them. | Missing: set from `.env` with `gh secret set <NAME>` / `gh variable set <NAME>` (`--env <env>` for environment scope). `/test-framework-adaptation` §7.2 emits the copy-paste list and offers the opt-in `gh secret set` push, which avoids a runner that 401s mid-suite. |

## 5. Classify each RED, then surface one checklist

Split the REDs into three classes:

- **Self-fixable in-session** (no restart): `bun run pw:install`, `bun run kata:manifest`, loading a tool skill, `bun run jira:check`. Offer to do it, explain what it does, get approval, then do it.
- **User-action** (a secret you must not invent, or an interactive login): a missing `.env` value, `gh auth login`. Tell the user the exact var, the file and why, and ask them to fix it.
- **MCP-spawn-time** (§6): `OPENAPI_SPEC_PATH` and any `DBHUB_*`. Even when you can write the value, the running MCP will not see it until restart. Write it, then stop and ask for a restart. The API token is not in this class: it never enters an MCP, and curl reads `.auth/tokens.env` live.

Surface them as one batched checklist with one `AskUserQuestion` call (multi-select where natural). Compose questions only for real gaps and REDs, never to pad the checklist (`AGENTS.md` Critical Rule #4, Shift-Left). One question per real decision: the environment (only if no arg resolved it), the intent for each missing secret, and a confirm for each self-fixable remedy.

Which test types or surfaces to run is never a question here. It is the skill's own decision, derived from story analysis, veto and risk scoring in its planning phase (for example `sprint-testing` Stage 1). The gate probes and reports which surface tools are ready; planning reads that report and picks trifuerza (UI/API/DB), a single surface or code-review-only. If a surface that planning later selects has a RED tool, surface that remedy then, and do not front-load a surface menu at the gate.

When one question round cannot hold the gaps and the user would benefit from seeing the full readiness table while answering, prefer the `mkd` decision deck over several terminal rounds. The threshold, what a deck owes the reader, the gate when `mkd` is absent and how to read the returned contract are canon in `agentic-qa-core/references/decision-elicitation-doctrine.md`.

GREEN items are reported, not asked.

## 6. Secret and token handling (read every time)

- Secrets live in `.env` only. Never hardcode one, and never paste one into a skill artifact, a Jira field, a commit or the chat. Report status as "set", "unset" or "expired", never the value.
- Every MCP server that needs a secret starts through the `.env` loader on every host (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`, `.pi/mcp.json`: `varlock run ... --filter <its vars> -- <server>`), which reads `.env` from the project root at MCP-server spawn time. There is no mid-session refresh (`AGENTS.md` Critical Rule #10). So any write to `.env` that an MCP depends on (any var in an MCP server's `--filter`) needs the user to restart the agent (`bun claude` / `bun opencode`) before it takes effect. End such a remedy with that instruction and stop. The API token is exempt: it never enters an MCP.

### The API testing maneuver (canonical: schema read, token, curl)

The OpenAPI MCP is schema-read-only, and authenticated requests run through curl. Canon: `agentic-qa-core/references/api-testing-doctrine.md`.

1. **Schema (read-only).** Use the `openapi` MCP's `list-api-endpoints` and `get-api-endpoint-schema` to learn the contract. `OPENAPI_SPEC_PATH` is the full spec URL (commonly the localhost backend) or a file path relative to the repo root, never the endpoint route alone. No token needed.
2. **Precondition for execution.** `scripts/api-login.project.ts` is project-adapted (auth endpoint and payload shape wired by `/test-framework-adaptation`; the CLI around it, `scripts/lib/api-login-core.ts` (synced) and `scripts/api-login.ts` (delivered once, never overwritten; a pre-split repo adopts the split by hand, copying in the current `scripts/api-login.ts` entry from the boilerplate), is never adapted), and `<<ACTIVE_ENV>>`-scoped creds exist in `.env`. Still generic: hand off to `/test-framework-adaptation` and do not improvise an auth call.
3. **Mint the token.** Run `bun run api:login [<env>] [--role <role>] [--profile <name>]` (flag order is free; a flag value is never taken as the env). It authenticates the env and role creds and writes `.auth/tokens.env` (`export API_TOKEN_<ROLE>_<ENV>='…'`), `.auth/tokens.json` (metadata) and `.auth/api-state.json` (Playwright; default role only, never profiled). `--profile <name>` redirects the first two into `.auth/profiles/<name>/`, an isolated set (for example per orchestration worker) that never overwrites the default. The AI never pastes the raw token.
4. **Execute (curl).** `source .auth/tokens.env && curl -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" "$API_BASE_URL/<path>"`, with `source` and `curl` in the same Bash call. No restart, because the token never enters an MCP. Several roles and envs coexist in the same files.

## 7. Output contract

Before any other skill output, the gate produces:

```
Readiness — <skill> — env: <<ACTIVE_ENV>>
  GREEN: <capability, …>
  RED:   <capability — remedy class>
  Action: <none | questions asked | fix applied | RESTART required>
```

All GREEN: continue to the resume check. Any blocking RED unresolved: stop at the gate. A skill never starts its real work with a required capability RED.

## 8. Point-of-use capability check (MCP capabilities)

A disabled MCP is not a gate finding: nothing reports it at session start, because people disable servers to save tokens. The check runs immediately before the step that uses the capability, for every capability the skill declares in `metadata.requires_capabilities` (vocabulary and enable table: `./mcp-capabilities.md`).

1. **Look at the tools available in this session.** A tool provides a capability when its name, after the `mcp__<server>__` prefix, matches one of the capability's tool names (`web_search_exa`, `tavily_search`, `resolve-library-id`, `execute_sql_<source>`, `list-api-endpoints`, ...). The prefix does not matter: the project server, a user-level server and a claude.ai connector all qualify. The one skill-provided capability, `diagrams`, resolves the same way against the skills this session can load: any skill named `diagram-design`, whatever its source (project install, user install, harness plugin).
2. **At least one provider:** use it and continue, with no question and no note.
3. **No provider:** stop before the step. Send one message with three facts: the missing capability, the server that normally provides it, and the enable path for the running host (`/mcp` in Claude Code, `opencode.jsonc` on OpenCode, `.codex/config.toml` on Codex, `.pi/mcp.json` or `pi mcp add` on Pi, or connecting the claude.ai connector, which does not exist on Pi; an untrusted project folder on Pi loads no MCP at all, so check trust first). Then wait.
4. **Substitutes need the user's word.** Built-in `WebSearch` / `WebFetch` for `web-search` or `library-docs`, reading route files for `api-schema`, a guess for `db`: none is a silent fallback. The user's explicit "use X instead" unblocks a substitute, and the report then names it.
5. **The tool answers but fails on its first call (401/403, mystery error):** that is the credential case, `AGENTS.md` Critical Rule #10 (exact env var, `.env`, RESTART).

A user prompt that clearly needs a capability ("search the web for X", "look up the docs of Y", "query the staging DB") gets the same one-message stop when no tool provides it, instead of a substitute.

## 9. With nobody at the keyboard

The gate asks in three places: the environment when it is ambiguous (§3 step 1), the batched checklist (§5), and the §8 stop. Each has a path for the run where no person is typing. The rule behind all three is `./decision-protocol.md` §5 (no person at the wheel) and `./decision-elicitation-doctrine.md` §0 (only the session the human types into asks the human).

| Run | What the gate does |
|---|---|
| A person is present | §3 to §8 as written. |
| A supervised worker (launched by a conductor) | Probes run as usual. The worker never asks the user: every question of §5 and the §8 message go to its launcher in the report or the ask channel, and the launcher answers. A RED the launcher has not cleared stops the worker at the gate. |
| A routine with nobody | Probes are read-only and always run. Environment: the delegating brief names it; with none, `staging`, said in the report as an assumption. `production` is never assumed. Self-fixable REDs that are local and reversible (`bun run kata:manifest`, `bun install`, `bun run pw:install`) are fixed and listed in the report. A user-action RED, a spawn-time RED, a RED that needs an outward step (a Jira write, a push, a message) or a missing secret value is not fixed and is not asked: the run records it as an open item with the exact remedy of §5 and stops at the gate. A routine that stops here with nothing changed is a correct outcome. |

The §7 readiness block is the report in every case. In a routine, its `Action:` line says `blocked: <open items>` when the gate stopped. A §8 stop in a routine is the same message written into the report, with the step skipped and no substitute used.
