# API Testing Maneuver — Doctrine (canonical)

> **Cited by:** `sprint-testing` (Stage 2 — API exploration leg of the trifuerza). Also relevant to `test-automation` (plan-time schema reads) and `test-documentation` (endpoint contracts).
> **Load BEFORE** exercising any API endpoint at the agentic-testing level (manual / exploratory QA — NOT KATA test code).

Agentic API testing has THREE distinct tools, each with ONE job. Mixing them is the #1 source of confusion. This is the binding split:

```
+------------------------+------------------------------+-----------------------------------+
| PASO 1 — SCHEMA        | PASO 2 — TOKEN               | PASO 3 — EXECUTE                  |
| (read only)            | (obtain only)               | (authenticated requests)          |
+------------------------+------------------------------+-----------------------------------+
| OpenAPI MCP            | bun run api:login            | curl  (native everywhere)         |
|  list-api-endpoints    |   [<env>] [--role <role>]    |  source .auth/tokens.env && \     |
|  get-api-endpoint-     | -> .auth/tokens.env          |  curl -H "Authorization:          |
|   schema               | -> .auth/tokens.json         |    Bearer $API_TOKEN_<R>_<E>" \    |
| NEVER invoke-api-      | -> .auth/api-state.json      |    "$API_BASE_URL/<path>"          |
|  endpoint to execute   |   (Playwright, untouched)    |                                   |
+------------------------+------------------------------+-----------------------------------+
```

**THE HARD RULE:** the OpenAPI MCP is **schema-read-only**. It discovers endpoints and reads request/response schemas — it does **NOT** execute authenticated requests. Every authenticated request runs through **curl**, with a token minted by `bun run api:login`. No exceptions.

---

## Why (do not relitigate this)

The OpenAPI MCP (`@ivotoby/openapi-mcp-server`) is intentionally **not** used for execution:

- It has **no schema-only mode** (`--tools` = `all | dynamic | explicit`; `dynamic` still ships an `invoke-api-endpoint` tool). The guard is that **no credential is injected into the MCP** — so any execution attempt hits the API unauthenticated and fails (401). That failure is the signal to use curl.
- Static `API_HEADERS` bearer injection **does not refresh** — an expiring token 401s mid-session.
- If the spec declares an `Authorization` header parameter, it **collides** with an injected auth header and the call throws `Cannot override authentication header`.
- Keeping the token out of the MCP also **removes the spawn-time restart requirement** (AGENTS.md Critical Rule #10 no longer bites for API auth — changing the token is picked up by the next curl immediately).

---

## Step 1 — Schema discovery (OpenAPI MCP, read-only)

Use the MCP's dynamic meta-tools to learn the contract before sending anything:

- `list-api-endpoints` — enumerate available endpoints.
- `get-api-endpoint-schema` — read the request body, params, and expected response for one endpoint.

Record the endpoints relevant to the ticket into the `test-session-memory.md` API table (Method | Endpoint | Purpose | AC).

**Spec source (adaptable per project).** `OPENAPI_SPEC_PATH` points the MCP at the schema, and accepts **either**:
- a **local file** (e.g. `./api/openapi.json`, synced by `bun run api:sync`), or
- a **live URL** — the most natural case: when QA clones the project-under-test and raises the backend locally, the backend serves its OpenAPI route (e.g. `http://localhost:3000/api/openapi`, a Swagger JSON, etc.). The MCP reads it directly.

The MCP handles both; there is no loss either way.

> **⚠ Schema-drift caveat (always keep in mind).** The schema you read is typically the **dev / latest** version. The environment you are *testing* (e.g. `staging`, `devstage`) may lag behind dev. So an endpoint or field present in the schema may not yet exist on the target server. On an unexpected `4xx`, a missing field, or a response shape that does not match the schema → **suspect drift first**, and verify against the actual target before filing a bug.

---

## Step 2 — Obtain the token (`bun run api:login`)

`api:login` is for **getting the token only** — never for executing test requests.

```bash
bun run api:login                       # active env (TEST_ENV), role=user
bun run api:login staging               # explicit env
bun run api:login staging --role admin  # named role
```

It authenticates the env+role's credentials (from `.env`) and writes:

| File | Purpose |
|---|---|
| `.auth/tokens.env`  | **Sourceable.** One upserted line per role+env: `export API_TOKEN_<ROLE>_<ENV>='<token>'` (others preserved). |
| `.auth/tokens.json` | Metadata keyed by `<ROLE>_<ENV>`: `token`, `tokenType`, `expiresIn`, `createdAt` — for freshness checks. |
| `.auth/api-state.json` | Unchanged — consumed by the Playwright API fixture. |

**Naming:** the token env var is `API_TOKEN_<ROLE>_<ENV>`, uppercase (e.g. `API_TOKEN_ADMIN_STAGING`, `API_TOKEN_USER_LOCAL`). Default role = `user`. Multiple roles/envs coexist in the same files.

Nothing is written to `.env`, and **no credential enters any MCP** — so there is **no restart** after login.

---

## Step 3 — Execute with curl (authenticated)

`$API_TOKEN_<ROLE>_<ENV>` is **not** a persistent shell variable — each of the agent's Bash calls is a fresh shell, so an `export` from a previous call is gone. The token lives **on disk** in `.auth/tokens.env`; re-`source` it **inside the same Bash call** as the curl:

```bash
source .auth/tokens.env && \
curl -s -H "Authorization: Bearer $API_TOKEN_ADMIN_STAGING" \
  "$API_BASE_URL/products"
```

Set `API_BASE_URL` in the same call if it is not already exported (it comes from `.env`):

```bash
source .auth/tokens.env && API_BASE_URL="https://dojo.upexgalaxy.com/api" && \
curl -s -X POST -H "Authorization: Bearer $API_TOKEN_USER_STAGING" \
  -H "Content-Type: application/json" \
  -d '{"name":"X"}' "$API_BASE_URL/products"
```

Multi-role probes (RLS / tenant isolation) just reference different vars in the same file:
`$API_TOKEN_ADMIN_STAGING` vs `$API_TOKEN_USER_STAGING`.

---

## Token freshness (check before reuse)

Before reusing a token, confirm it has not expired using `.auth/tokens.json`:

```bash
jq -r '.ADMIN_STAGING | (.createdAt + " +" + (.expiresIn|tostring) + "s")' .auth/tokens.json
```

If `createdAt + expiresIn` is in the past (or a request returns `401`), re-mint with `bun run api:login <env> --role <role>` and retry. Do **not** treat a `401` from an expired token as a bug.

---

## Anti-patterns (NEVER)

- **NEVER** use the OpenAPI MCP's `invoke-api-endpoint` (or any MCP) to execute an authenticated test request. Schema reads only.
- **NEVER** expect `$API_TOKEN_...` to survive across separate Bash calls — always `source .auth/tokens.env` in the same call as the curl.
- **NEVER** hardcode or paste a raw token into a command, artifact, commit, or chat. It lives only in `.auth/` (gitignored).
- **NEVER** write the token back into `.env` or inject it into an MCP.
- **NEVER** report a schema-vs-target mismatch as a bug without first checking for dev/target schema drift.

---

## Cheat sheet

```
Discover : OpenAPI MCP  -> list-api-endpoints / get-api-endpoint-schema   (read only)
Mint     : bun run api:login <env> [--role <role>]                        (-> .auth/tokens.env)
Execute  : source .auth/tokens.env && curl -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" "$API_BASE_URL/<path>"
Refresh  : 401 or stale createdAt+expiresIn (.auth/tokens.json) -> re-run api:login
```
