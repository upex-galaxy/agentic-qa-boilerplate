# Test Framework Adaptation — Wire KATA to the target project

Adapt this boilerplate's 4-layer KATA test architecture (Config + Schemas + Components + Fixtures) **plus** every surface that ships with the example project (variables, env schema, auth, OpenAPI, CI workflows, MCP registry, Allure identity, AI memory) so the repo speaks to the project already reverse-engineered by `/project-discovery`. The goal is a repo that is **fully project-specific** — no example artifacts left — and **ready to start writing automated tests** under the KATA workflow.

You modify **this repo only**. The target repo is read-only from here on.

**Target**: $ARGUMENTS (leave blank to adapt the full framework; pass an entity name like `booking` to scope the first domain component)

---

## Idempotency contract

This command is **re-runnable**. The boilerplate ships an example project (hotel/booking domain, `PROJ-`/`UPEX-` ATC keys, `dojo.upexgalaxy.com` URLs, `Example*` components). On every invocation:

1. **Phase 0** detects what is still generic via concrete signals (see Phase 9 table) and shows the user a **GENERIC / ADAPTED** checklist.
2. If the repo is already fully adapted, the command reports that and exits — it does not re-do finished work.
3. If partially adapted, it plans and executes **only the remaining** items.

Phase 9 is the engine: the same detection signals that close the loop on a fresh run are the report on a re-run.

---

## When to use

| Use this command for | Use a different tool for |
|----------------------|--------------------------|
| Wiring `AuthApi` + `LoginPage` against real endpoints | Regenerating the discovery maps (domain, infra) → `/project-discovery` |
| Populating `.agents/project.yaml` + `.env` + `config/variables.ts` | Writing sprint-level feature tests → `/test-automation` |
| Creating the first `{Entity}Api` / `{Entity}Page` | Running regression suites → `/regression-testing` |
| Syncing OpenAPI and creating type facades | Documenting test cases in TMS → `/test-documentation` |
| Reconciling CI workflows + MCP registry to the target | Editing `docs/core/**` or `docs/assets/**` → never: the updater owns them (Phase 9.3) |
| Scrubbing example identity from project-owned docs (Phase 9.3) | Choosing a branching strategy → `/git-flow-master` Strategy Setup |

---

## Phase contract

```
┌─ NO WRITES ─────────────────────────────────────────────────────────────┐
│ Phase 0  Prereq + genericness gate     → block on missing context        │
│ Phase 1  Analysis + questionnaire       → resolve auth, OpenAPI, entity   │
│ Phase 2  Write plan                     → .context/reports/adapt-...md     │
│                                            Status: PENDING APPROVAL. WAIT. │
└──────────────────────────────────────────────────────────────────────────┘
                      ↓ (explicit user approval on the plan file)
┌─ WRITES ────────────────────────────────────────────────────────────────┐
│ Phase 3  Identity + variables           → project.yaml, .env, variables.ts│
│ Phase 4  OpenAPI + type facades         → api:sync, {entity}.types.ts     │
│ Phase 5  Auth wiring + verify           → AuthApi, LoginPage, setups       │
│ Phase 6  First entity + fixtures + smoke→ {Entity}Api/Page, delete examples│
│ Phase 7  CI + manifest + MCP            → workflows, kata-manifest, MCP dual│
│ Phase 8  Validation gate (fail-fast)    → repo:check, kata:manifest, smoke │
│ Phase 9  Genericness scan + close       → GENERIC/ADAPTED table, handoffs  │
└──────────────────────────────────────────────────────────────────────────┘
```

Never write before approval. Never skip the genericness scan.

---

## Phase 0 — Prereq + genericness gate (no writes)

### 0.1 Genericness pre-scan (idempotency entry point)

Run the Phase 9 detection signals **first**, before anything else. Build the GENERIC / ADAPTED table and show it to the user. This tells both you and the user exactly which subsystems still carry example content. Everything still `GENERIC` becomes this run's work-list; everything `ADAPTED` is skipped.

A plan from an earlier run is resumed, not rewritten: read `.context/reports/test-framework-adaptation-plan.md`, or `.context/reports/adapt-framework-plan.md` when only the file written under the skill's former name exists (rename it to the new name before Phase 2 touches it).

If **all** rows are ADAPTED, report "Framework already adapted to {{PROJECT_NAME}} — nothing to do" and stop.

### 0.2 Hard prerequisites — block Phase 1 if missing

Verify each by path. Treat a **placeholder/stub file as missing**. A context map is verified through its reader: `bun run context:map <slug> --list` must print sections; the placeholder notice (or a missing skill) counts as missing.

<!-- keep in sync with .agents/skills/project-discovery/SKILL.md §Pre-test-framework-adaptation checklist -->

- [ ] `business-domain-context` holds a generated map (`bun run context:map business-domain-context` prints sections, no placeholder notice)
- [ ] `infra-context` holds a generated map with its `backend` and `frontend` sections (`bun run context:map infra-context --list`)
- [ ] `.context/project-config.md`
- [ ] `business-data-context` holds a generated map (`bun run context:map business-data-context --list` prints sections)
- [ ] API contract source resolvable — one of: `api/openapi-types.ts` already generated and non-stub, OR a reachable OpenAPI spec URL/file (synced in Phase 4), OR a generated `business-api-context` map (business-angle fallback, accepted only if OpenAPI is unreachable)
- [ ] `.env.example` exists; `.env` either exists or will be created from it in Phase 3

If any hard prereq fails, stop and **enumerate each missing file mapped to the exact command that produces it**:

> `/test-framework-adaptation` needs the discovery context generated first. Missing:
> - the `business-domain-context` map (placeholder) → run `/project-discovery` (Phase 1 Constitution)
> - the `infra-context` map, or its `backend` / `frontend` sections → `/project-discovery` (Phases 2-3 Architecture + Infrastructure)
> - `.context/project-config.md` → `/project-discovery`
> - the `business-data-context` map (placeholder) → `project-context` mode `data`
>
> Run the listed command(s), then re-invoke `/test-framework-adaptation`.

### 0.3 Strong-recommended — pause and propose

These massively improve adaptation accuracy and are produced by token-heavy standalone commands better run in a clean session:

- [ ] the `business-e2e-context` map: journeys + feature catalog (`project-context` mode `e2e`)
- [ ] the `business-api-context` map (`project-context` mode `api`)
- [ ] Master Test Plan: `.context/PBI/qa-artifacts/master-test-plan.md` after `bun run context:hydrate` (`project-context` mode `test-plan` writes it to the MTP Epic)

If **any** is missing or a placeholder, do not proceed silently:

> Strongly recommend enriching context before adapting KATA. Missing/placeholder: `{list}`.
>
> Best practice: open a **clean session**, run `project-context` mode `refresh-all` (its fixed order is data → features → api → test-plan), then re-invoke `test-framework-adaptation`.
>
> Continue anyway, or pause to enrich context first? (yes-continue / pause)

If the user continues, log each gap in the plan's Discovery Gaps section. Do not scaffold KATA against guesses.

---

## Phase 1 — Analysis + questionnaire (no writes)

### 1.1 Read existing project context

In order: `bun run context:map infra-context --section architecture`; `api/openapi-types.ts` (if generated) or the OpenAPI spec source; `bun run context:map business-data-context`; `bun run context:map business-e2e-context`, `bun run context:map business-api-context`, `.context/PBI/qa-artifacts/master-test-plan.md` (if present); `bun run context:map infra-context --section backend` and `--section frontend` (auth flow, stacks, repo paths); `bun run context:map business-domain-context` (canonical entity names); `.env.example`; `.agents/project.yaml`; `config/variables.ts`.

### 1.2 Read KATA references

Load from `.agents/skills/test-automation/references/` (HOW-to lives here, not in this reference): the references `test-automation/SKILL.md` lists.

### 1.3 Inspect template surface (do not modify yet)

```
tests/components/{TestContext,TestFixture,ApiFixture,UiFixture}.ts
tests/components/api/{ApiBase,AuthApi,ExampleApi}.ts          ← AuthApi KEPT, ExampleApi DELETE
tests/components/ui/{UiBase,LoginPage,ExamplePage}.ts          ← LoginPage KEPT, ExamplePage DELETE
tests/components/steps/ExampleSteps.ts                         ← DELETE
tests/e2e/module-example/, tests/integration/module-example/   ← DELETE (example specs)
tests/data/{DataFactory,types}.ts + fixtures/example.json      ← strip hotel/booking
tests/setup/{global,api-auth,ui-auth}.setup.ts
api/schemas/{auth,example}.types.ts + index.ts                 ← example.types.ts DELETE
config/variables.ts · config/validateTestEnv.ts · playwright.config.ts
.agents/project.yaml · .env(.example) · .mcp.json · opencode.jsonc · dbhub.toml · allurerc.mjs
.github/workflows/*.yml · kata-manifest.json
```

> **NOTE:** `AuthApi.ts` and `LoginPage.ts` are KEPT but still carry placeholder decorators — the shipped example ids (read them from `kata-manifest.json`) — which get rewritten to `{{PROJECT_KEY}}` in Phase 5. Every id is DISTINCT on purpose: `kata:manifest:check` fails on a duplicate, because an id is the key the TMS and the teardown coverage report both group by. The boilerplate also ships instructional `UPEX-101` examples inside comments/JSDoc (the JSDoc example in `AuthApi.ts`, `tests/utils/decorators.ts`) — those are documentation, leave them.

### 1.4 Decide auth strategy (decision tree)

```
Does the target API issue a token or a cookie?
│
├── TOKEN (Bearer / JWT / API key)
│     ├── Token in response body
│     │     → api-auth.setup.ts → POST {loginEndpoint} → ApiBase.setAuthToken(token)
│     │     → storageState .auth/api-state.json
│     └── Token via UI-only flow (OAuth redirect)
│           → ui-auth.setup.ts runs full UI login → storageState .auth/user.json
│           → optionally extract token from storageState for API tests
│
├── COOKIE (session-based)
│     → storageState only; Playwright forwards cookies automatically
│
└── HYBRID (CSRF + cookie + bearer)
      → UI login → storageState → extract CSRF + bearer separately
      → add CSRF header on every API request inside ApiBase
```

Session reuse always has the same shape: `global.setup → ui-auth.setup + api-auth.setup → .auth/*.json → tests`.

> **Token refresh reality check:** `scripts/api-login.ts` **mints a fresh token per invocation** and writes `createdAt`/`expiresIn` to `.auth/api-state.json`. There is **NO auto-refresh-on-expiry** — `TestFixture` reads the token if the file exists, with no staleness check. Do not tell the user the suite auto-refreshes. Record the real strategy from the questionnaire: either (a) accept per-run minting (default — re-run setup when stale), or (b) implement a staleness check (compare `createdAt + expiresIn` vs now) if the target's TTL is short. Note the choice in the plan. The same `api:login` run also writes `.auth/tokens.env` + `.auth/tokens.json` (keyed `<ROLE>_<ENV>`) for the **agentic curl API-testing flow** — same per-run-mint / no-auto-refresh reality (re-run `api:login` on a curl 401).

### 1.5 Identify OpenAPI source

| Source | When | Plan action |
|--------|------|-------------|
| URL    | Backend serves a spec endpoint | `bun run api:sync --url <URL> -t` |
| GitHub | Spec committed in a repo file  | `bun run api:sync` (interactive → GitHub) |
| Local  | Spec file on disk              | `bun run api:sync --file <path> -t` |
| None   | No spec available              | Hand-write type facades; log in Discovery Gaps; **disable the `openapi` MCP server** in all three harness files (see Phase 7) |

### 1.6 Map entities to the first component

From the `business-domain-context` terms (`term-*` sections) + the `business-e2e-context` feature catalog, pick the **highest-traffic entity** per the Master Test Plan (`.context/PBI/qa-artifacts/master-test-plan.md`). Build that entity end-to-end in Phase 6; list the rest as follow-ups. Do not scaffold everything at once.

### 1.7 Upfront questionnaire

Ask only what context cannot reveal. Short, specific questions. Group and ask in one batch:

**Auth**
- Auth scheme: TOKEN / COOKIE / HYBRID? For TOKEN: exact login endpoint + method, request body field names (`email` vs `username`), response token field (`access_token` / `token` / `id_token`), and where the token lives (body / header / storage).
- Token TTL + refresh endpoint? Behaviour on expiry (per-run mint / refresh / staleness check)?
- User-info / verify endpoint (template uses `/auth/me`) and its response shape.
- Auth header format: standard `Authorization: Bearer <token>` or custom (`X-API-Key`, `Basic`)? Affects `ApiBase.buildHeaders()`.
- Login route, success indicator (URL pattern + a post-login element), `data-testid` coverage on the login form (or `getByRole` / `getByPlaceholder` fallback).
- Enforced obstacles in staging: email verification, 2FA/MFA, captcha, rate limits — and how to bypass each for CI (skip flag / TOTP seed from env / allowlisted IP). If any are enforced and no bypass exists, **STOP and request a staging bypass** rather than guessing.
- Multi-tenant? Tenancy scope (subdomain / header / path prefix) and how test users are provisioned per tenant.
- Test users + roles in staging (admin / member / guest) and credentials for the primary role.

**Identity + environments**
- `.agents/project.yaml`: `project_name`, `project_key` (replaces `PROJ-`/`UPEX-`), `webapp_domain`, backend/frontend stacks + repo paths, `db_type`, `issue_tracker` + `atlassian_url`.
- Environment list (local / staging / production / qa / uat?) and per env the real `web_url` + `api_url`. **These must match `config/variables.ts` `envDataMap` exactly** (see Phase 3 drift note).

**OpenAPI + entity**
- OpenAPI source (URL / GitHub / local / none).
- Highest-traffic domain entity to wire first (replaces hotel/booking) and its CRUD endpoints.

**Database + MCP**
- Does the target have a DB to validate against? `DBHUB_TYPE/HOST/PORT/DATABASE/USER/PASSWORD` per env (drives `dbhub.toml` + `.env`; without these every `[DB_TOOL]` MCP call 401s).
- For each env, what should `environments.<env>.db_mcp` / `api_mcp` resolve to? Default: the existing single `dbhub` / `openapi` servers. Advanced: per-env named servers must be added to **all three** harness files (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`).
- Which harness-level servers are connected on this machine (a claude.ai connector or a user-scope server)? Recommend, never commit: Exa and Tavily for web search (Exa first; near-mandatory for spikes and fix lookups), Context7 for official docs, Postman only if the team already keeps collections there. `bun run setup:doctor` reports which ones a user-level config declares.
- Which of Claude Code, OpenCode, and Codex will this project use? Every MCP edit must preserve semantic parity across `.mcp.json`, `opencode.jsonc`, and `.codex/config.toml`, using each harness's native environment syntax. Missing values remain a hard stop under `AGENTS.md` Rule #10.

**CI + reporting + docs**
- TMS modality + `AUTO_SYNC`: Xray / Jira-native / none, and which GitHub Secrets you can set (these live outside the repo).
- Allure report name (`allurerc.mjs`, shipped as `Agentic QA Boilerplate`).
- Is the `gh-pages` branch created and GitHub Pages enabled? (Workflows publish to `{owner}.github.io/{repo}/{env}/{type}/` — external repo config.) If not enabled and the user wants browsable reports, run the maneuver in `.agents/skills/regression-testing/references/github-pages-setup.md` (enable via `gh api`, first-build gotcha, history-squash job) during Phase 7.
- Scrub the example identity (`upexgalaxy` / `UPEX-` / `dojo`) from the project-owned docs in Phase 9.3 of this run, or leave it for a separate pass?

Fold answers into the plan §§2, 6, 9. Unanswered items → Discovery Gaps.

---

## Phase 2 — Write the plan (no writes to code)

Write `.context/reports/test-framework-adaptation-plan.md` (skill-owned report path — **not** `.context/PBI/`, which is the Jira-sync read-only cache). Sections:

1. **Project Summary** — stack, auth system, main entities, OpenAPI source, environments.
2. **Auth Strategy** — branch from §1.4, endpoints, token shape, **refresh rule (per-run mint vs staleness check)**, success indicator.
3. **OpenAPI Strategy** — source, sync command, facades to create (one row per domain), MCP `openapi` enable/disable decision.
4. **Identity + Variables** — `project.yaml` fields to fill (all env leaves), `.env` keys, `config/variables.ts` `envDataMap` + auth endpoints, env-enum reconciliation (the 4 sources below).
5. **Components to Create / Modify** — API table, UI table, Steps (if any), files deleted (Example*, module-example, example.json), ATC-key rewrite (`PROJ-`/`UPEX-` → `{{PROJECT_KEY}}`).
6. **Env Vars + Secrets** — `.env` keys to populate + GitHub repo Secrets the user must set externally.
7. **CI + MCP + Reporting** — workflow reconciliation (env options, secrets, smoke tag), three-harness MCP parity, `dbhub.toml`, `allurerc.mjs` name.
8. **Implementation Phases** — maps to Phases 3-8 below.
9. **AI Guidelines** — golden rules (inline locators, `@atc`, alias imports, `@schemas` facades, never `@openapi` from components).
10. **Questions Answered** — verbatim from §1.7.
11. **Discovery Gaps** — anything unverified (token refresh, multi-tenant, missing OpenAPI, no DB, etc.).
12. **Genericness Baseline** — the Phase 0 GENERIC/ADAPTED table snapshot (what this run will close).
13. **Approval Checklist** — checkboxes the user ticks before approving.

Header:

```markdown
> Generated: YYYY-MM-DD
> Project: {{PROJECT_NAME}}
> Status: PENDING APPROVAL
```

Close with:

> WAIT for explicit user approval before starting Phase 3. Do not write code yet.

---

## Phase 3 — Identity + variables (writes)

Only after approval. Re-read the approved plan first.

### 3.1 `.agents/project.yaml`

Populate every `null` field: `project.{project_name,project_key,webapp_domain}`, `backend.*`, `frontend.*`, `database.db_type`, `issue_tracker.*`, `testing.{default_env,tms_cli}`, and **every** `environments.<env>` leaf (`web_url`, `api_url`, `db_mcp`, `api_mcp`). Offer `bun run agents:setup` for an interactive walkthrough instead of hand-editing.

### 3.2 `.env`

Copy `.env.example` → `.env` if absent. Populate the **real key scheme** (no invented keys):

- `TEST_ENV` (the active env)
- `<ENV>_USER_EMAIL` / `<ENV>_USER_PASSWORD` per environment (`LOCAL_USER_*`, `STAGING_USER_*`, …) — **not** `TEST_USER_EMAIL`
- `API_BASE_URL` (base URL the agent uses for **curl execution** + the OpenAPI MCP request base), `OPENAPI_SPEC_PATH` (where the **schema-read-only** OpenAPI MCP reads the spec — a local file OR a live URL). The agentic API token is minted by `bun run api:login` into `.auth/tokens.env` (NOT `.env`, NOT the MCP)
- `ATLASSIAN_*`, `XRAY_*`, `AUTO_SYNC`, `TMS_PROVIDER` per the TMS modality
- `DBHUB_*` if the target has a database. Web search and Postman are harness-level MCP servers (not `.env` keys); `resend` logs in on its own. The test-user pair is a project-scope EXAMPLE: rename it to the project's own names in `config/variables.ts` too, or delete it when the app has no login (nothing requires it; `config.testUser` fails by name at the point of use)

> There is **NO** `BASE_URL` / `API_URL` env var. Per-environment web/api URLs are hardcoded in `config/variables.ts` `envDataMap`, NOT in `.env`.

### 3.2b Env schema (varlock)

The env schema is a pair. `.env.core.schema` is the framework half: generated from `cli/lib/variables-manifest.ts` by `bun run vars:schema` and synced, never edited. `.env.schema` is project-owned and imports it: declare there every variable the project adds or renames (the renamed test-user pair, an admin user, a tenant id), one decorator line each, scoped with `@required=forEnv(<env>)` so a variable is demanded only where it is used. Keep values out of both files; `.env.example` gets the same names with empty values.

### 3.3 `config/variables.ts`

`config/variables.ts` is project-owned; `config/variables.core.ts` is synced and never edited (resolver, TMS, browser and reporting blocks live there). Edit only these parts of the project half:

- `Environment` union.
- `userCredentialsMap` and `userCredentialVarNames`: a credential rename touches the `process.env` destructuring, both maps, `.env.schema`, `.env.example` and the workflow secret names together. An app with no login drops the pair from all of them.
- `envDataMap` per env: keys are **`base`** and **`api`** (not `baseUrl`/`apiUrl`). Replace `http://localhost:3000` and `https://dojo.upexgalaxy.com` with the real per-env URLs.
- `auth.loginEndpoint`, `auth.tokenEndpoint`, `auth.meEndpoint`, `auth.tokenLifetimeSeconds` (real TTL).

### 3.4 Env-enum reconciliation (multi-file drift)

The env list lives in several places that must agree (the list below). The boilerplate ships them disagreeing: `.agents/project.yaml` declares more environments than the code does. Settle the project's real list first, then make every one of them say it, deleting the `environments.<env>` blocks the project does not run:

1. `config/variables.ts` → `Environment` type + `envDataMap` keys + `userCredentialsMap` / `userCredentialVarNames` keys
2. `.agents/project.yaml` → `environments.<env>` + `testing.default_env`
3. `config/validateTestEnv.ts` → `VALID_TEST_ENVS` (the `Valid values:` error names it; no credential check lives there)
4. `scripts/api-login.project.ts` → `environments` (the positional environments `bun run api:login` accepts)
5. `.github/workflows/*.yml` → `workflow_dispatch.inputs.environment.options`

### 3.5 Validate

```bash
bun run vars:check        # lint-vars: {{VAR}} refs resolve against project.yaml
bun run vars:env:check    # check-vars: .env.example ↔ variables-manifest parity
bun run test:env:check    # validateTestEnv: TEST_ENV is a declared env (+ TMS pair when AUTO_SYNC=true)
bun run vars:schema:check # env schema pair is current and loads through varlock
bun run harness:env       # re-emit the per-harness credential files from .env
```

**Restart the agent session after `harness:env`.** A harness spawns its MCP servers at startup from files `harness:env` generates (`.claude/settings.local.json` for Claude Code, `.auth/opencode/<VAR>` for OpenCode; Codex reads the environment of the `bun run codex` wrapper). A `DBHUB_*`, `API_BASE_URL` or `OPENAPI_SPEC_PATH` written to `.env` mid-session reaches no running server: `[DB_TOOL]` and `[API_TOOL]` keep their empty values and fail with a 401 or a connection error, not a config error (Critical Rule #10). Tell the user to restart before Phase 4 needs the `openapi` server, and confirm with `bun run harness:env:check`.

---

## Phase 4 — OpenAPI + type facades (writes)

### 4.1 Sync

```bash
bun run api:sync -t                 # interactive (URL / GitHub / Local)
# or: bun run api:sync --url <URL> -t   /   --file <path> -t   /   -c -t (reuse saved config)
```

Outputs `api/openapi.json`, `api/openapi-types.ts`, `api/.openapi-config.json`. If no spec exists, skip and log in Discovery Gaps — all facades hand-written.

### 4.2 Facades (golden rule)

Pattern: `openapi-types.ts → {domain}.types.ts → components`. Components **must** import from `@schemas/{domain}.types`, **never** from `@openapi`. Only facades consume `@openapi`.

- Adapt `api/schemas/auth.types.ts` to the real login endpoint + token shape.
- Create `api/schemas/{entity}.types.ts` (copy `example.types.ts` as the pattern):

```typescript
import type { components, paths } from '@openapi';

export type {Entity} = components['schemas']['{Entity}Model'];

type Create{Entity}Path = paths['/api/{entities}']['post'];
export type Create{Entity}Request  = Create{Entity}Path['requestBody']['content']['application/json'];
export type Create{Entity}Response = Create{Entity}Path['responses']['201']['content']['application/json'];
```

- Update `api/schemas/index.ts`: add the new facade re-export. (check what `api/schemas/index.ts` re-exports — `example.types` is consumed by `ExampleApi.ts` directly, so there is nothing to drop there unless you added a re-export.)
- Without OpenAPI: `curl` the real endpoints first, then hand-write interfaces that mirror the contract.

---

## Phase 5 — Auth wiring + verify (writes)

### 5.1 Adapt kept components

- `tests/components/api/AuthApi.ts` — real `endpoints.login`, payload shape, types from `@schemas/auth.types`. **Replace `@atc('PROJ-101')` / `@atc('PROJ-102')` with `@atc('{{PROJECT_KEY}}-NNN')`** (leave the instructional `UPEX-101` comment example alone).
- `tests/components/ui/LoginPage.ts` — real locators (`getByTestId` / `getByRole`), tight assertions (URL change AND a post-login element). Replace its `PROJ-` ATC keys too.
- `tests/components/api/ApiBase.ts` — modify `buildHeaders()` only if the auth header is non-standard.
- **`scripts/api-login.project.ts` — the ONLY file to adapt for the agentic curl API-testing flow.** Adapt `buildAuthPayload()` (request body field names — `email` vs `username`, etc.) and `extractTokenFromResponse()` (response token field — `access_token` / `token` / `id_token`) to the target's login contract (same answers as §1.7 Auth), plus the optional `loginEndpoint` / `headers` / `environments` / `extraFlags` exports when the target needs them. The `authenticate` export is the last resort, for auth one POST cannot express (an OAuth redirect, an MFA step, a token the project already holds, several chained requests): it replaces the core's request phase, so the project stops receiving upstream fixes to it. Wire what the application under test needs to authenticate, and nothing it does not. Do NOT touch `scripts/api-login.ts` (the entry file) or `scripts/lib/api-login-core.ts` (the CLI: args, `--role`, `--profile`, token storage, `--help`): `scripts/lib/api-login-core.ts` is synced, so `bun run up` keeps delivering upstream improvements there. `scripts/api-login.ts` itself is delivered once and never overwritten after that, same as this adapter file — a repo scaffolded before the core/adapter split still has its whole pre-split CLI at that path, so the updater never silently replaces it. A pre-split repo adopts the split by hand: replace `scripts/api-login.ts` with the current `scripts/api-login.ts` entry from the boilerplate, then this adapter file is the only one left to adapt. This is a **separate code path** from the Playwright setups above: `bun run api:login` powers the schema-read-only-MCP + curl maneuver (`.auth/tokens.env` → `curl`), per `agentic-qa-core/references/api-testing-doctrine.md`. If the target returns a different token shape and this is not adapted, `.auth/tokens.env` stays empty and every authenticated curl 401s — while the Playwright setups still pass, hiding the break.

### 5.2 Adapt setups

- `tests/setup/api-auth.setup.ts` — parse the real token response shape; assert non-empty `.auth/api-state.json`.
- `tests/setup/ui-auth.setup.ts` — adapt token-endpoint intercept + LoginPage flow; add email-verification / 2FA handling **only** if enforced and a bypass exists; assert non-empty `.auth/user.json`.
- `tests/setup/global.setup.ts` — generic; verify the TMS provider matches the chosen modality, else unchanged.

### 5.3 Verify

```bash
bun run test --project=api-setup    # → non-empty .auth/api-state.json (Playwright session)
bun run test --project=ui-setup     # → non-empty .auth/user.json (Playwright session)
bun run api:login <env>             # → .auth/tokens.env has API_TOKEN_<ROLE>_<ENV>; .auth/tokens.json written
# smoke the agentic curl maneuver (<ENV> uppercase; pick any known endpoint):
source .auth/tokens.env && \
  curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $API_TOKEN_USER_<ENV>" "$API_BASE_URL/<a-known-endpoint>"
```

The first two prove the Playwright setups (session reuse). The last two prove the **agentic curl flow** (`api-login.ts` adapted → `.auth/tokens.env` → authenticated curl). A 2xx (or an app-level 4xx that is NOT 401) means the token minted by `api:login` authenticates; a `401` means `scripts/api-login.project.ts` (§5.1) or the creds are wrong. All must pass — the suite depends on session reuse AND the agentic API-testing maneuver depends on `api:login`.

---

## Phase 6 — First entity + fixtures + smoke (writes)

### 6.1 Create the real entity component(s)

`tests/components/api/{Entity}Api.ts` and/or `tests/components/ui/{Entity}Page.ts` following KATA. API shape:

```typescript
export class {Entity}Api extends ApiBase {
  private readonly endpoints = {
    list: '/api/{entities}',
    get: (id: string) => `/api/{entities}/${id}`,
    create: '/api/{entities}',
  };

  @atc('{{PROJECT_KEY}}-201')
  async get{Entity}Successfully(id: string): Promise<[APIResponse, {Entity}]> {
    const [response, body] = await this.apiGET<{Entity}>(this.endpoints.get(id));
    expect(response.status()).toBe(200);
    return [response, body];
  }
}
```

### 6.2 Wire fixtures

Register in `tests/components/ApiFixture.ts`, `UiFixture.ts`, and `TestFixture.ts`. Remove the `ExampleApi` / `ExamplePage` registrations + imports. Include `setAuthToken` / `clearAuthToken` wiring when the component needs auth. Use aliases (`@api/{Entity}Api`, `@ui/{Entity}Page`) — no relative imports.

### 6.3 Delete ALL example artifacts

```
# components
tests/components/api/ExampleApi.ts
tests/components/ui/ExamplePage.ts
tests/components/steps/ExampleSteps.ts
api/schemas/example.types.ts            (consumed by ExampleApi.ts; not re-exported in index.ts)
# spec directories (carry PROJ-/UPEX- keys + fictional /api/example endpoints)
tests/e2e/module-example/
tests/integration/module-example/
# example domain data (hotel/booking)
tests/data/fixtures/example.json
```

Edit `tests/data/DataFactory.ts` (drop `createHotel`/`createBooking`, add real factory methods, keep generic `createUser`/`createCredentials`) and `tests/data/types.ts` (drop `TestHotel`/`TestBooking`, add real domain types, keep `TestUser`/`TestCredentials`/`ApiState`).

After deleting `tests/{e2e,integration}/module-example/`, remove the now-dead `testIgnore: ['**/module-example/**']` line from `playwright.config.ts`.

### 6.4 First smoke test

Create `tests/e2e/{feature}/smoke.test.ts` (or `tests/integration/{feature}/` for API-only) tagged **`@critical`** — the repo-wide convention that the smoke projects in `playwright.config.ts` grep (`@critical`) and the workflows run. **Do NOT tag `@smoke`** — `test:smoke` would select zero tests. Uses the new component through the fixture; asserts ≥1 domain operation end-to-end. No mocks against real auth.

### 6.5 Reconsider existing reference specs

every shipped reference spec still carrying a `UPEX-` key (`grep -rn UPEX- tests/`): replace the `UPEX-` keys with `{{PROJECT_KEY}}` and keep if the endpoints resolve to the real API, else delete.

---

## Phase 7 — CI + manifest + MCP reconciliation (writes)

### 7.1 Regenerate the KATA manifest

Deleting `Example*` and adding the entity makes `kata-manifest.json` stale (it still lists the shipped example ids). `.husky/pre-commit` blocks commits on a stale manifest (Rule #12).

```bash
bun run kata:manifest          # regenerate
bun run kata:manifest:check    # must exit 0
```

### 7.2 Reconcile the GitHub workflows

Every suite workflow under `.github/workflows/`: the ones with a `workflow_dispatch.inputs.environment`. The rest (the build check, the docs Pages publisher and its history squash) carry no env list. Per suite workflow:

- `workflow_dispatch.inputs.environment.options` must equal the env list (§3.4).
- Secret names (`secrets.<ENV>_USER_EMAIL` / `_PASSWORD`) must match the env-prefixed credential scheme.
- The smoke filter must select `@critical` (matches the config grep).
- `AUTO_SYNC` / `XRAY_*` / `ATLASSIAN_*` secrets only if the TMS modality uses them.
- gh-pages `subfolder` / `destination_dir` / report URL paths track the env names.
- Reporting is dual-mode: GitHub Pages by default, or the private report portal when the `PORTAL_URL` secret is set. The private mode reads `PORTAL_*` and `R2_*` secrets; the protocol that creates them is `.agents/skills/regression-testing/references/private-hosting-setup.md`. Ask which mode the project wants before emitting the secrets block.

**Emit a copy-paste "GitHub repo Secrets to set" block** (these live outside the repo): `<ENV>_USER_EMAIL/_PASSWORD`, `AUTO_SYNC` (master switch — `'true'` to turn the TMS write-back on), `XRAY_CLIENT_ID/SECRET` + `ATLASSIAN_*` if `AUTO_SYNC=true`, `STP_EXECUTION_KEY`, optional `SLACK_WEBHOOK_URL`, and the `PORTAL_*` + `R2_*` set only in private-portal mode. `STP_EXECUTION_KEY` holds the key of the **STR** Test Execution linked to the sprint's STP (under the `QA Test Artifacts` epic), never the STP's own key — without it the first nightly run hits the workflow's refusal guard, skips with a warning annotation, and imports nothing. **Emit `TMS_PROVIDER` in a separate "repo Variables to set" line** (`xray` / `jira` / `none`, default `xray`): it must be a Variable, not a secret, because the `XrayImport` job gates on it in a job-level `if:`, and that context can read `vars` but never `secrets`. Note the manual external steps: create the `gh-pages` branch + enable GitHub Pages, and set `TMS_PROVIDER` under Settings → Secrets and variables → Actions → Variables.

**Offer to push the CI secrets from `.env` automatically** (opt-in — ask first, never push silently): when `gh auth status` is authenticated, the values already exist in `.env`, and the user approves, set each via `gh secret set <NAME>` (add `--env <env>` for environment-scoped secrets; `gh variable set <NAME>` for non-secret config). This is the low-friction alternative to the manual copy-paste block above — the regression-testing readiness gate probes these same secrets via `gh secret list`, so setting them here means the first CI run does not 401. Skip for any value not present in `.env` (surface it instead) and never echo a secret's value back to the user.

### 7.3 MCP registry — THREE-HARNESS sync (highest-risk surface)

`.mcp.json` (Claude Code), `opencode.jsonc` (OpenCode), and `.codex/config.toml` (Codex CLI/Desktop) ship the **same** server set (`.mcp.json` is canonical; `bun run agents:compat:check` proves the parity). **Every semantic change must land in all three** with native syntax. Per `AGENTS.md` Rule #10, a missing or empty MCP variable is a HARD SESSION STOP, not a soft CI failure.

The three project files carry **local stdio servers only**. A remote (HTTP) server never goes in them: web search (Exa first, Tavily second), Context7's hosted connector, Postman and Atlassian run at harness level, connected once per machine and resolved by capability (`agentic-qa-core/references/mcp-capabilities.md`; the servers moved out are listed in `cli/lib/harness-level-mcps.ts`). Recommend the user connects Exa, Tavily and Context7 (near-mandatory for spikes and official-doc checks) and Postman only as an option; the default API path stays the `openapi` server for schemas plus `curl` for execution.

- `project.yaml` `environments.<env>.db_mcp` / `api_mcp` resolve to MCP **server names**. Default: point them at the existing `dbhub` / `openapi` servers. If the target needs per-env DB/API servers, add those entries to all three harness configs.
- `openapi` server reads `API_BASE_URL` / `OPENAPI_SPEC_PATH` ONLY — it is **schema-read-only**, so do NOT inject `API_TOKEN` / `API_HEADERS` (authenticated requests run via curl using `.auth/tokens.env` from `bun run api:login`; canon: `agentic-qa-core/references/api-testing-doctrine.md`). If the target has **no API**, disable/remove the `openapi` entry in all three configs (else it spins against empty env and `[API_TOOL]` breaks).
- `dbhub` server reads `dbhub.toml`. Verify it stays consistent with `DBHUB_*`.
- Any `.env` value an MCP server reads changed in this phase → `bun run harness:env` and a session restart (§3.5).

### 7.4 `dbhub.toml`

If the target has a database, ensure `DBHUB_*` are set in `.env` (Phase 3) and `dbhub.toml` `[[sources]]` matches the engine. Add extra `[[sources]]` blocks for additional databases. If no DB, leave the `primary` source and disable the `dbhub` MCP entry.

### 7.5 `allurerc.mjs`

Rename `name: 'Agentic QA Boilerplate'` to the project's Allure report name (the questionnaire answer). It leaks into every generated report header + GitHub Pages output.

### 7.6 `playwright.config.ts` (only what changed)

baseURL/env mapping; smoke grep tag (stays `@critical`); removed `module-example` `testIgnore` (§6.3); Allure categories + `KataReporter` path only if relevant.

---

## Phase 8 — Validation gate (fail-fast)

Run in this exact order. Stop on the first failure; report with diagnostics; do not auto-fix without approval.

```bash
1. bun run types:check
2. bun run lint:check
3. bun run vars:check            # {{VAR}} resolution
4. bun run vars:env:check        # .env parity
5. bun run vars:schema:check     # env schema pair current + loads through varlock
6. bun run harness:env:check     # per-harness credential files match .env
7. bun run kata:manifest:check   # manifest matches disk
8. bun run test --project=api-setup
9. bun run test --project=ui-setup
10. bun run api:login <env>      # agentic curl flow → .auth/tokens.env has API_TOKEN_<ROLE>_<ENV>
11. bun run test:smoke           # first run on staging — ≥1 @critical test runs
12. bun run test:smoke           # second run — must reuse .auth/*, no re-login
13. bun run repo:check           # the whole repo gate (package.json lists what it chains)
```

If run #12 re-runs the auth setup, session reuse is broken — check `playwright.config.ts` project dependencies and `.auth/*` freshness. If run #11 reports **0 tests**, the smoke tag is wrong (must be `@critical`). If run #10 leaves `.auth/tokens.env` empty (no `API_TOKEN_<ROLE>_<ENV>` line), `scripts/api-login.project.ts` is not adapted to the target's login contract (§5.1) — the agentic curl maneuver will 401.

---

## Phase 9 — Genericness scan + close

### 9.1 Genericness scan (the idempotency engine)

Run every detection signal and print a per-subsystem **GENERIC / ADAPTED** table. On a re-invocation this is the report; on a fresh run it confirms closure.

| Subsystem | ADAPTED signal (else GENERIC) |
|-----------|-------------------------------|
| project.yaml | `bun run vars:check` exits 0 **AND** `grep -c 'null # TODO' .agents/project.yaml` == 0 (the `null`s with no TODO are legitimate: `qa.qa_epics.*.key` is cached at runtime, `git_strategy.branches` stays `null` under a strategy that has no such branch; env blocks the project does not run are deleted in §3.4, not left `null`) |
| ATC keys | `grep -rnE "^\s*@atc\('(PROJ\|UPEX)-" tests/components/` returns nothing (decorator lines only — excludes the JSDoc example in `AuthApi.ts` + `decorators.ts` JSDoc) |
| Example components | none of `ExampleApi.ts` / `ExamplePage.ts` / `ExampleSteps.ts` / `api/schemas/example.types.ts` exist |
| Example specs | `tests/e2e/module-example/` + `tests/integration/module-example/` do not exist; no `testIgnore` `module-example` line in `playwright.config.ts` |
| Example domain data | `grep -riE 'hotel\|booking' tests/data/` returns nothing **AND** `tests/data/fixtures/example.json` gone |
| OpenAPI types | `api/openapi-types.ts` shows real `components`/`paths` (not `= any`) **OR** Discovery Gaps records "no spec, hand-written facades" |
| Facade boundary | `grep -rn '@openapi' tests/components/` returns nothing; facades in `api/schemas/` are the only `@openapi` consumers |
| Auth URLs | `grep -rn 'dojo.upexgalaxy.com' config/variables.ts` returns nothing (unless target genuinely is that host) **AND** `envDataMap` URLs == `project.yaml` `environments` URLs (no drift) |
| .env values | `bun run vars:env:check` exits 0 **AND** no `.env` URL/credential still equals a known example (`localhost:3000` unless intended, `dojo.upexgalaxy.com`) |
| Smoke tag | `playwright.config.ts` smoke `grep` tag == tag on smoke tests == `smoke.yml` filter — all `@critical` |
| kata-manifest | `bun run kata:manifest:check` exits 0 **AND** `grep -c 'Example' kata-manifest.json` == 0 **AND** the new entity component is listed |
| Auth setups | `.auth/api-state.json` + `.auth/user.json` exist non-empty |
| Agentic curl auth | `bun run api:login <env>` populates `.auth/tokens.env` with an `API_TOKEN_<ROLE>_<ENV>` line (proves `scripts/api-login.project.ts` adapted for the curl maneuver) |
| Session reuse | second `test:smoke` does not execute api-setup/ui-setup (and ≥1 test actually ran) |
| Business context | `bun run context:map <slug>` prints no placeholder notice for any shipped context map skill (`CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`), and `.context/PBI/qa-artifacts/master-test-plan.md` exists after `bun run context:hydrate` |
| CI workflows | workflow `options:` == env union; secret names match scheme; smoke filter == config grep tag |
| MCP parity | `db_mcp`/`api_mcp` resolve to server names present in `.mcp.json`, `opencode.jsonc`, and `.codex/config.toml`; `bun run agents:compat:check` exits 0; `API_BASE_URL`/`OPENAPI_SPEC_PATH` set in `.env` (or `openapi` disabled in all three); `bun run harness:env:check` exits 0 |
| Env schema | `bun run vars:schema:check` exits 0 **AND** every variable the project added or renamed is declared in `.env.schema` |
| dbhub | `DBHUB_*` populated in `.env` if `db_type` set (else `dbhub` MCP disabled in all three harness configs) |
| allurerc | `allurerc.mjs` `name` != `Agentic QA Boilerplate` |
| AGENTS.md | resolved auth strategy / first entity / OpenAPI source present (not generic template wording); `CLAUDE.md` remains exactly `@AGENTS.md` |
| Project docs | `grep -rnE 'upexgalaxy\|dojo\.' README.md CONTEXT.md INSTALLER.md` returns only lines the project kept on purpose (§9.3) |
| Full gate | `bun run repo:check` exits 0 |

### 9.2 Update AGENTS.md

Edit `AGENTS.md` in place: record the resolved auth strategy, the first entity wired, the OpenAPI source, and any open Discovery Gaps. Never add operational prose to `CLAUDE.md`; it must remain exactly `@AGENTS.md` plus one newline.

The branching strategy is NOT recorded in `AGENTS.md`: it lives in the `git_strategy:` block of `.agents/project.yaml`, which the project owns and `bun run up` never overwrites. When `git_strategy.meta.strategy_source` still reads `inherited`, offer `/git-flow-master` Strategy Setup as the next step instead of writing a strategy here.

### 9.3 Project-owned docs

Scrub the example identity (`upexgalaxy` / `UPEX-` / `dojo` values, the example domain) from the docs the project owns, when §1.7 approved it for this run:

- `README.md`, `CONTEXT.md`, `INSTALLER.md`: patch facts in place (project name, key, URLs, the first entity, the auth strategy), keeping the structure.
- Any folder under `docs/` other than `docs/core/` and `docs/assets/`: the project's own pages.
- **Never** `docs/core/**`, `docs/assets/**`, `docs/index.html` or `docs/README.md`: the updater owns them and would offer the edit for overwrite on the next `bun run up`. Project-specific human documentation goes in a new folder under `docs/` (it appears in the portal sidebar on refresh).

Close with `bun run docs:check` (dead paths, page metadata, every repo skill in the `AGENTS.md` §5 router, every quoted `bun run` script declared in `package.json`). A skill the project added gets its §5 router row here.

### 9.4 Close

- Mark `.context/reports/test-framework-adaptation-plan.md` `Status: COMPLETED` and append a results block (files created/modified, tests passing, gaps remaining, GitHub Secrets the user still owes).
- Report to the user: entities wired, facades created, setups passing, smoke passing, session reuse verified, MCP synced, and the GENERIC/ADAPTED table.

---

## Completion gate

Done only when **every** box is true (all map to a Phase 9 signal):

- [ ] `bun run repo:check` exits 0 (the chain `package.json` declares)
- [ ] `bun run kata:manifest:check` exits 0 and the manifest has no `Example` entries
- [ ] `bun run test:smoke` runs ≥1 `@critical` test on staging and passes
- [ ] Second smoke run reuses `.auth/*` (no re-login)
- [ ] `bun run api:login` populates `.auth/tokens.env` (agentic curl API-testing maneuver works; `scripts/api-login.project.ts` adapted)
- [ ] No `PROJ-`/`UPEX-` ATC decorator remains in `tests/components/`
- [ ] No `Example*` component, `module-example/` spec, or hotel/booking data remains
- [ ] No component imports `@openapi`; only `api/schemas/` facades do
- [ ] `.agents/project.yaml` fully populated; `envDataMap` URLs == `project.yaml` env URLs
- [ ] MCP servers consistent across `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` (local stdio only); `harness:env` re-run and the session restarted after any MCP value changed; `allurerc.mjs` renamed
- [ ] Every variable the project added or renamed declared in `.env.schema`; `vars:schema:check` exits 0
- [ ] CI workflow env options + secret names + smoke tag reconciled; GitHub Secrets list emitted
- [ ] `AGENTS.md` updated, `CLAUDE.md` shim unchanged; branching strategy left to `git_strategy:` in `.agents/project.yaml`
- [ ] Project-owned docs scrubbed (§9.3) or the pass explicitly deferred; `docs/core/**` untouched
- [ ] `.context/reports/test-framework-adaptation-plan.md` marked `COMPLETED`

---

## Common adaptation points

| Point | Current (example) | Target (you adapt it) |
|-------|-------------------|------------------------|
| Login endpoint | `POST /auth/login` | Real path from `api/openapi-types.ts` or the `business-api-context` map |
| Token format | `Bearer <jwt>` in body | `access_token` / `id_token` / cookie / hybrid |
| api:login auth section | default `{email,password}` → `{access_token}` | `scripts/api-login.project.ts` `buildAuthPayload` / `extractTokenFromResponse` → target's login body + token field (powers the agentic curl maneuver); `authenticate` only when one POST cannot express the flow |
| Token refresh | per-run mint, NO auto-refresh | per-run mint or staleness check (decide in §1.4) |
| Success URL | `/dashboard/` | Project's post-login route |
| API base prefix | `/api` | `/api/v1`, `/v2`, subdomain, or none |
| Env URLs | `localhost:3000`, `dojo.upexgalaxy.com` | Real per-env URLs in `config/variables.ts` `envDataMap` + `project.yaml` |
| ATC keys | `@atc('PROJ-101')` | `@atc('{{PROJECT_KEY}}-NNN')` |
| Domain data | hotel / booking | Target entities in `DataFactory` + `types.ts` |
| Smoke tag | `@critical` (keep) | `@critical` (do not invent `@smoke`) |
| Allure name | `Agentic QA Boilerplate` | Project report name |
| MCP db/api | single `dbhub` / `openapi` | per-env servers if needed (all three harness files) |
| Credential pair | `LOCAL_USER_*` / `STAGING_USER_*` | Project names in `config/variables.ts` maps, `.env.schema`, `.env.example`, workflow secrets |
| Data-testid | `getByTestId('email')` | Whatever the frontend exposes — request `data-testid` if missing |
| Email verify / 2FA / tenant | not in example | Add to `ui-auth.setup.ts` only if enforced + bypass exists |

---

## References

- `.agents/skills/test-automation/references/` (the references `test-automation/SKILL.md` lists)
- `project-discovery` (generates the `business-domain-context` and `infra-context` maps plus `.context/project-config.md`), `project-context` (context enrichment), `/git-flow-master` (Strategy Setup)
- `agentic-qa-core/references/mcp-capabilities.md` (capability resolution for harness-level servers)

---

## Gotchas

- Auth is the most fragile part — always test against real staging, never mocks.
- Credentials live in `.env`. Hardcoding them is a hard stop.
- `api-login.ts` does **not** auto-refresh — it mints per run (writes `.auth/api-state.json` for Playwright AND `.auth/tokens.env` + `.auth/tokens.json` for the agentic curl maneuver). Don't document a refresh that doesn't exist. Adapt `scripts/api-login.project.ts` (`buildAuthPayload` / `extractTokenFromResponse`) to the target — a wrong token shape leaves `.auth/tokens.env` empty and every curl 401s. The CLI around it — `scripts/lib/api-login-core.ts` (synced) and `scripts/api-login.ts` (delivered once, never overwritten; adopt the split by hand if the repo pre-dates it) — is never adapted.
- Golden KATA rule: components import from `@schemas/*`, never `@openapi`. Keep `@openapi` scoped to facades.
- Steps (Layer 3.5) carry no `@atc` and no fixed assertions — they chain ATCs only.
- MCP edits preserve three-harness parity across `.mcp.json`, `opencode.jsonc`, and `.codex/config.toml`. Miss one and that harness loses the server or receives empty env → Rule #10 hard stop.
- Smoke tag is `@critical`, not `@smoke`. The config grep and the workflows agree on `@critical`; a `@smoke` test selects zero.
- `CLAUDE.md` is a regular one-line import shim, not a symlink or instruction body.
- The plan lives in `.context/reports/`, not `.context/PBI/` (Jira-owned cache).
- Session reuse: the second smoke run should be noticeably faster. If not, `auth.setup` is re-running.
- No OpenAPI spec → hand-write facades AND disable the `openapi` MCP server in all three harness files.
- A value written to `.env` does not reach a running MCP server: `bun run harness:env`, then restart the session.
- `config/variables.core.ts`, `.env.core.schema` and `docs/core/**` are synced: adapting them is lost on the next `bun run up`. Edit the project half.
