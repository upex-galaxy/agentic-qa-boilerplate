# API testing maneuver: doctrine (canonical)

> Cited by: `sprint-testing` (Stage 2, the API exploration leg of the trifuerza). Also relevant to `test-automation` (plan-time schema reads) and `test-documentation` (endpoint contracts).
> Load before exercising any API endpoint at the agentic-testing level (manual or exploratory QA, not KATA test code).

Agentic API testing uses three tools, each with one job. Mixing them is the most common source of confusion, so the split below is binding:

```
+------------------------+------------------------------+-----------------------------------+
| STEP 1: SCHEMA         | STEP 2: TOKEN                | STEP 3: EXECUTE                   |
| (read only)            | (obtain only)                | (authenticated requests)          |
+------------------------+------------------------------+-----------------------------------+
| OpenAPI MCP            | bun run api:login            | curl  (native everywhere)         |
|  list-api-endpoints    |   [<env>] [--role <role>]    |  source .auth/tokens.env && \     |
|  get-api-endpoint-     | -> .auth/tokens.env          |  curl -H "Authorization:          |
|   schema               | -> .auth/tokens.json         |    Bearer $API_TOKEN_<R>_<E>" \    |
| NEVER invoke-api-      | -> .auth/api-state.json      |    "$API_BASE_URL/<path>"          |
|  endpoint to execute   |   (Playwright, untouched)    |                                   |
+------------------------+------------------------------+-----------------------------------+
```

> The STEP 3 recipe above is the POSIX one. `source` is a shell builtin that neither `cmd` nor PowerShell has, and `.auth/tokens.env` is written as `export VAR='...'`, which PowerShell cannot read either. On Windows outside a POSIX shell, read the token from `.auth/tokens.json` instead and call `curl.exe` by its full name: in Windows PowerShell 5.1 a bare `curl` is an alias for `Invoke-WebRequest`, which does not understand `-H` and fails in a way that looks like an auth problem rather than a shell one. The token itself is identical on every platform; only the way you hand it to the request changes. `bun run api:login` prints the correct next step for the platform it ran on.

The hard rule: the OpenAPI MCP is schema-read-only. It discovers endpoints and reads request and response schemas, and it does not execute authenticated requests. Every authenticated request runs through curl, with a token minted by `bun run api:login`. There are no exceptions.

---

## Why the MCP does not execute

The OpenAPI MCP (`@ivotoby/openapi-mcp-server`) is intentionally not used for execution:

- It has no schema-only mode (every `--tools` mode ships an `invoke-api-endpoint` tool). The guard is that no credential is injected into the MCP, so any execution attempt hits the API unauthenticated and fails with a 401. That failure is the signal to use curl.
- Static `API_HEADERS` bearer injection does not refresh, so an expiring token 401s mid-session.
- If the spec declares an `Authorization` header parameter, it collides with an injected auth header and the call throws `Cannot override authentication header`.
- Keeping the token out of the MCP also removes the spawn-time restart requirement (AGENTS.md Critical Rule #10 no longer bites for API auth): a changed token is picked up by the next curl immediately.

---

## Step 1: schema discovery (OpenAPI MCP, read-only)

Use the MCP's dynamic meta-tools to learn the contract before sending anything:

- `list-api-endpoints` enumerates the available endpoints.
- `get-api-endpoint-schema` reads the request body, params and expected response for one endpoint.

Record the endpoints relevant to the ticket in the `test-session-memory.md` API table (Method | Endpoint | Purpose | AC).

Spec source (adaptable per project). `OPENAPI_SPEC_PATH` points the MCP at the schema: the full spec URL, or a file path relative to the repo root, never the endpoint route alone.

- A full URL is the most natural case. When QA clones the project under test and raises the backend locally, the backend serves its OpenAPI route (e.g. `http://localhost:3000/api/openapi`, a Swagger JSON, etc.) and the MCP fetches it directly.
- A local file relative to the repo root (e.g. `./api/openapi.json`, synced by `bun run api:sync`) resolves against the directory the server starts in, so start the harness from the repo root.

The server fetches only values that start with `http://` or `https://` and reads anything else as a file: `/api/openapi` alone fails with `ENOENT` and the MCP exits before its handshake. Prefix the origin of `API_BASE_URL`. `bun run setup:doctor` flags all three cases (a route alone, a missing file, a URL that does not answer).

Schema-drift caveat. The schema you read is typically the dev or latest version, and the environment you are testing (e.g. `staging`, `qa`) may lag behind dev. An endpoint or field present in the schema may not yet exist on the target server. On an unexpected `4xx`, a missing field or a response shape that does not match the schema, suspect drift first and verify against the actual target before filing a bug.

---

## Step 2: obtain the token (`bun run api:login`)

`api:login` gets the token and nothing else. Test requests run through curl.

```bash
bun run api:login                       # active env (TEST_ENV), role=user
bun run api:login staging               # explicit env
bun run api:login staging --role admin  # logs in AS admin: STAGING_ADMIN_EMAIL / _PASSWORD
bun run api:login staging --profile W1  # isolated token set -> .auth/profiles/W1/
bun run api:login --profile W1          # flags may also precede the env (active env)
bun run api:login --help                # options, storage paths, required .env vars
```

The default role (`user`) logs in with `config.testUser` and is the only one that also writes `.auth/api-state.json` for the suite. Any other role reads its own pair, `<ENV>_<ROLE>_EMAIL` + `<ENV>_<ROLE>_PASSWORD`, and fails by name when either half is missing. The browser side of the same role uses the same pair (`browser-sessions.md` §4).

Flag order does not matter, and a flag value is never read as the environment (`--profile W1` mints for the active env, it does not look for an env called `W1`). Both `--flag value` and `--flag=value` work. An unrecognized flag is an error, never a silent environment guess.

It authenticates the env and role's credentials (from `.env`) and writes:

| File | Purpose |
|---|---|
| `.auth/tokens.env`  | Sourceable. One upserted line per role+env: `export API_TOKEN_<ROLE>_<ENV>='<token>'` (others preserved). |
| `.auth/tokens.json` | Metadata keyed by `<ROLE>_<ENV>`: `token`, `tokenType`, `expiresIn`, `createdAt`, for freshness checks. |
| `.auth/api-state.json` | Unchanged. Consumed by the Playwright API fixture. Never profiled. |

Naming: the token env var is `API_TOKEN_<ROLE>_<ENV>`, uppercase (e.g. `API_TOKEN_ADMIN_STAGING`, `API_TOKEN_USER_LOCAL`). The default role is `user`, and multiple roles and envs coexist in the same files.

`--profile <name>` writes `tokens.env` and `tokens.json` under `.auth/profiles/<name>/` instead of `.auth/` directly, an isolated token set that never overwrites the default one. An orchestration conductor uses it to mint one credential set per worker or session (see `agent-orchestration`), and a worker then sources its own `.auth/profiles/<name>/tokens.env` instead of the shared file.

Nothing is written to `.env`, and no credential enters any MCP, so there is no restart after login.

`api:login` is also the only way an agentic session gets a token: it authenticates through the application's own login endpoint, as the role whose credentials it read. A token obtained any other way (a service-role or admin key, an admin user-management call, a locally signed JWT, a session row read out of the database) tests a user nobody can be. The full list, and what stays allowed (seeding data through the API, the auth story exercised through a real inbox), is `browser-sessions.md` §4 "Only the real login produces a session".

---

## Step 3: execute with curl (authenticated)

`$API_TOKEN_<ROLE>_<ENV>` is not a persistent shell variable. Each of your Bash calls is a fresh shell, so an `export` from a previous call is gone. The token lives on disk in `.auth/tokens.env`; re-`source` it inside the same Bash call as the curl:

```bash
source .auth/tokens.env && \
curl -s -H "Authorization: Bearer $API_TOKEN_ADMIN_STAGING" \
  "$API_BASE_URL/products"
```

Set `API_BASE_URL` in the same call if `.env` does not already export it. The value is the active environment's `{{API_URL}}` (`.agents/project.yaml` → `environments.<env>.api_url`), resolved before the command runs:

```bash
source .auth/tokens.env && API_BASE_URL="{{API_URL}}" && \
curl -s -X POST -H "Authorization: Bearer $API_TOKEN_USER_STAGING" \
  -H "Content-Type: application/json" \
  -d '{"name":"X"}' "$API_BASE_URL/products"
```

Multi-role probes (RLS, tenant isolation) reference different vars in the same file: `$API_TOKEN_ADMIN_STAGING` vs `$API_TOKEN_USER_STAGING`.

---

## Token freshness (check before reuse)

Before reusing a token, confirm it has not expired using `.auth/tokens.json`:

```bash
jq -r '.ADMIN_STAGING | (.createdAt + " +" + (.expiresIn|tostring) + "s")' .auth/tokens.json
```

If `createdAt + expiresIn` is in the past, or a request returns `401`, re-mint with `bun run api:login <env> --role <role>` and retry. A `401` from an expired token is not a bug.

---

## Types in automated tests: compile-time only

Response and payload types come from the spec at build time: `bun run api:sync` runs `openapi-typescript` and writes `api/openapi-types.ts`, and the facades under `api/schemas/` re-export from it. Types are compile-time only, so do not assume a runtime validator. A type catches a test that reads a field the contract does not have, not an API that returns the wrong shape. Assert the shape you care about explicitly in the ATC. A doc or skill that says otherwise is stale.

The OpenAPI MCP (its `--tools` mode is pinned in `.mcp.json`) exposes `list-api-endpoints`, `get-api-endpoint-schema` and `invoke-api-endpoint`. Only the first two are used (Step 1).

---

## Anti-patterns

- Execute authenticated test requests with curl. The OpenAPI MCP's `invoke-api-endpoint` (or any MCP) is for schema reads only, never for execution.
- Re-`source .auth/tokens.env` in the same Bash call as the curl. `$API_TOKEN_...` does not survive across separate Bash calls.
- Keep the token in `.auth/` (gitignored). Never hardcode or paste a raw token into a command, artifact, commit or chat.
- Never write the token back into `.env` or inject it into an MCP.
- Never obtain a token around the login: no service-role or admin key, no admin user-management API, no locally signed JWT, no token copied from a database session table. Seeding test data through the API is fine; the identity is not seeded (`browser-sessions.md` §4).
- Never "fix" an expired JWT by editing `.mcp.json` (or `opencode.jsonc`, `.codex/config.toml`, `.pi/mcp.json`). The MCP holds no credential by design. `bun run api:login` refreshes a stale token into `.auth/tokens.env`, and nothing else does.
- Check for dev/target schema drift before reporting a schema-vs-target mismatch as a bug.

---

## Cheat sheet

```
Discover : OpenAPI MCP  -> list-api-endpoints / get-api-endpoint-schema   (read only)
Mint     : bun run api:login <env> [--role <role>] [--profile <name>]     (-> .auth/tokens.env)
Execute  : source .auth/tokens.env && curl -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" "$API_BASE_URL/<path>"
Refresh  : 401 or stale createdAt+expiresIn (.auth/tokens.json) -> re-run api:login
```
