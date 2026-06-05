---
name: adapt-framework
description: Adapt this boilerplate's KATA test architecture (tests/, api/schemas/, config/, CI, MCP) to a project already reverse-engineered by `/project-discovery`, so the repo is fully project-specific and ready to write automated tests. Triggers on "adapt KATA to this project", "set up test framework for this project", "implement the test fixtures", "connect boilerplate to target stack", "wire auth for the framework". Idempotent: re-running reports what is still generic vs project-adapted. Strict gate — Phases 0-2 (no writes) → user approval → Phases 3-9 (writes). Modifies THIS repo only, never the target repo. Prerequisites: `.context/` populated by `/project-discovery`. Do NOT use for writing feature tests (`/test-automation`), running suites (`/regression-testing`), or regenerating context (`/project-discovery`).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Adapt Framework — Wire KATA to the target project

Adapt this boilerplate's 4-layer KATA test architecture (Config + Schemas + Components + Fixtures) **plus** every surface that ships with the example project (variables, auth, OpenAPI, CI workflows, MCP registry, Allure identity, AI memory) so the repo speaks to the project already reverse-engineered by `/project-discovery`. The goal is a repo that is **fully project-specific** — no example artifacts left — and **ready to start writing automated tests** under the KATA workflow.

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
| Wiring `AuthApi` + `LoginPage` against real endpoints | Regenerating `.context/` files → `/project-discovery` |
| Populating `.agents/project.yaml` + `.env` + `config/variables.ts` | Writing sprint-level feature tests → `/test-automation` |
| Creating the first `{Entity}Api` / `{Entity}Page` | Running regression suites → `/regression-testing` |
| Syncing OpenAPI and creating type facades | Documenting test cases in TMS → `/test-documentation` |
| Reconciling CI workflows + MCP registry to the target | Scrubbing README/CONTEXT/INSTALLER/docs → handoff to `/sync-ai-memory` (Phase 9) |

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

If **all** rows are ADAPTED, report "Framework already adapted to {{PROJECT_NAME}} — nothing to do" and stop.

### 0.2 Hard prerequisites — block Phase 1 if missing

Verify each by path. Treat a **placeholder/stub file as missing** (grep for `placeholder` or `Run \`/business-`).

- [ ] `.context/PRD/` populated (≥ `README.md`) AND `.context/business/business-model.md` or `domain-glossary.md` present (non-stub)
- [ ] `.context/SRS/architecture.md` present (non-stub)
- [ ] `.context/infrastructure/backend.md` and `.context/infrastructure/frontend.md` present (non-stub)
- [ ] `.context/business/business-data-map.md` present **and not** a `Run /business-data-map` placeholder
- [ ] API contract source resolvable — one of: `api/openapi-types.ts` already generated and non-stub, OR a reachable OpenAPI spec URL/file (synced in Phase 4), OR `.context/business/business-api-map.md` (business-angle fallback, accepted only if OpenAPI is unreachable)
- [ ] `.env.example` exists; `.env` either exists or will be created from it in Phase 3

If any hard prereq fails, stop and **enumerate each missing file mapped to the exact command that produces it**:

> `/adapt-framework` needs `.context/` populated by `/project-discovery`. Missing:
> - `.context/SRS/architecture.md` → run `/project-discovery` (Phase 2 Architecture)
> - `.context/infrastructure/backend.md`, `frontend.md` → `/project-discovery` (Phase 3 Infrastructure)
> - `.context/business/business-data-map.md` → `/business-data-map`
>
> Run the listed command(s), then re-invoke `/adapt-framework`.

### 0.3 Strong-recommended — pause and propose

These massively improve adaptation accuracy and are produced by token-heavy standalone commands better run in a clean session:

- [ ] `.context/business/business-feature-map.md` (`/business-feature-map`)
- [ ] `.context/business/business-api-map.md` (`/business-api-map`)
- [ ] `.context/master-test-plan.md` (`/master-test-plan`)

If **any** is missing or a placeholder, do not proceed silently:

> Strongly recommend enriching context before adapting KATA. Missing/placeholder: `{list}`.
>
> Best practice: open a **clean session**, run `/business-feature-map` → `/business-api-map` → `/master-test-plan` (in that order), then re-invoke `/adapt-framework`.
>
> Continue anyway, or pause to enrich context first? (yes-continue / pause)

If the user continues, log each gap in the plan's Discovery Gaps section. Do not scaffold KATA against guesses.

---

## Phase 1 — Analysis + questionnaire (no writes)

### 1.1 Read existing project context

In order: `.context/SRS/architecture.md`; `api/openapi-types.ts` (if generated) or the OpenAPI spec source; `.context/business/business-data-map.md`; `business-feature-map.md`, `business-api-map.md`, `master-test-plan.md` (if present); `.context/infrastructure/backend.md`, `frontend.md`; `.context/business/domain-glossary.md` (if present); `.env.example`; `.agents/project.yaml`; `config/variables.ts`.

### 1.2 Read KATA references

Load from `.claude/skills/test-automation/references/` (HOW-to lives here, not in this command): `kata-architecture.md`, `automation-standards.md`, `api-patterns.md`, `e2e-patterns.md`, `data-testid-strategy.md`, `typescript-patterns.md`, `ci-integration.md`.

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
.github/workflows/{regression,sanity,smoke,build}.yml · kata-manifest.json
```

> **NOTE:** `AuthApi.ts` and `LoginPage.ts` are KEPT but still carry placeholder `@atc('PROJ-101')` / `@atc('PROJ-102')` decorators — these get rewritten to `{{PROJECT_KEY}}` in Phase 5. The boilerplate also ships instructional `UPEX-101` examples inside comments/JSDoc (`AuthApi.ts:10`, `tests/utils/decorators.ts`) — those are documentation, leave them.

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

> **Token refresh reality check:** `scripts/api-login.ts` **mints a fresh token per invocation** and writes `createdAt`/`expiresIn` to `.auth/api-state.json`. There is **NO auto-refresh-on-expiry** today — `TestFixture` reads the token if the file exists, with no staleness check. Do not tell the user the suite auto-refreshes. Record the real strategy from the questionnaire: either (a) accept per-run minting (default — re-run setup when stale), or (b) implement a staleness check (compare `createdAt + expiresIn` vs now) if the target's TTL is short. Note the choice in the plan.

### 1.5 Identify OpenAPI source

| Source | When | Plan action |
|--------|------|-------------|
| URL    | Backend serves a spec endpoint | `bun run api:sync --url <URL> -t` |
| GitHub | Spec committed in a repo file  | `bun run api:sync` (interactive → GitHub) |
| Local  | Spec file on disk              | `bun run api:sync --file <path> -t` |
| None   | No spec available              | Hand-write type facades; log in Discovery Gaps; **disable the `openapi` MCP server** in both registry files (see Phase 7) |

### 1.6 Map entities to the first component

From `domain-glossary.md` + `business-feature-map.md`, pick the **highest-traffic entity** per `master-test-plan.md`. Build that entity end-to-end in Phase 6; list the rest as follow-ups. Do not scaffold everything at once.

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
- For each env, what should `environments.<env>.db_mcp` / `api_mcp` resolve to? Default: the existing single `dbhub` / `openapi` servers. Advanced: per-env named servers must be added to **both** `.mcp.json` and `opencode.jsonc`.
- Do you use OpenCode / Cursor / Codex / Copilot in addition to Claude Code? (If OpenCode is in play, every `.mcp.json` edit must mirror to `opencode.jsonc` with `{env:VAR}` syntax, or MCP auth silently empties — CLAUDE.md Rule #10.)

**CI + reporting + docs**
- TMS modality + `AUTO_SYNC`: Xray / Jira-native / none, and which GitHub Secrets you can set (these live outside the repo).
- Allure report name (`allurerc.mjs`, currently `Agentic QA Boilerplate`).
- Is the `gh-pages` branch created and GitHub Pages enabled? (Workflows publish to `{owner}.github.io/{repo}/{env}/{type}/` — external repo config.)
- After adaptation, hand off to `/sync-ai-memory` to scrub `upexgalaxy`/`UPEX`/`dojo` from README/CONTEXT/INSTALLER/docs, or leave for a separate pass?

Fold answers into the plan §§2, 6, 9. Unanswered items → Discovery Gaps.

---

## Phase 2 — Write the plan (no writes to code)

Write `.context/reports/adapt-framework-plan.md` (skill-owned report path — **not** `.context/PBI/`, which is the Jira-sync read-only cache). Sections:

1. **Project Summary** — stack, auth system, main entities, OpenAPI source, environments.
2. **Auth Strategy** — branch from §1.4, endpoints, token shape, **refresh rule (per-run mint vs staleness check)**, success indicator.
3. **OpenAPI Strategy** — source, sync command, facades to create (one row per domain), MCP `openapi` enable/disable decision.
4. **Identity + Variables** — `project.yaml` fields to fill (all env leaves), `.env` keys, `config/variables.ts` `envDataMap` + auth endpoints, env-enum reconciliation (the 4 sources below).
5. **Components to Create / Modify** — API table, UI table, Steps (if any), files deleted (Example*, module-example, example.json), ATC-key rewrite (`PROJ-`/`UPEX-` → `{{PROJECT_KEY}}`).
6. **Env Vars + Secrets** — `.env` keys to populate + GitHub repo Secrets the user must set externally.
7. **CI + MCP + Reporting** — workflow reconciliation (env options, secrets, smoke tag), MCP dual-file sync, `dbhub.toml`, `allurerc.mjs` name.
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
- `API_BASE_URL`, `OPENAPI_SPEC_PATH` (OpenAPI MCP server); `API_TOKEN` is auto-populated by `bun run api:login` — leave blank
- `ATLASSIAN_*`, `XRAY_*`, `AUTO_SYNC`, `TMS_PROVIDER` per the TMS modality
- `DBHUB_*` if the target has a database; `TAVILY_API_KEY`, `RESEND_API_KEY`, `POSTMAN_API_KEY` as needed

> There is **NO** `BASE_URL` / `API_URL` env var. Per-environment web/api URLs are hardcoded in `config/variables.ts` `envDataMap`, NOT in `.env`.

### 3.3 `config/variables.ts`

- `envDataMap` per env: keys are **`base`** and **`api`** (not `baseUrl`/`apiUrl`). Replace `http://localhost:3000` and `https://dojo.upexgalaxy.com` with the real per-env URLs.
- `auth.loginEndpoint`, `auth.tokenEndpoint`, `auth.meEndpoint`, `auth.tokenLifetimeSeconds` (real TTL).
- If new environments are added, extend the `Environment` union type.

### 3.4 Env-enum reconciliation (4-way drift)

`local | staging` lives in **four** places that must agree. When the env list changes, update all four:

1. `config/variables.ts` → `Environment` type + `envDataMap` keys
2. `.agents/project.yaml` → `environments.<env>` + `testing.default_env`
3. `config/validateTestEnv.ts` → the hardcoded `local`/`staging` checks + the `Valid values:` error strings
4. `.github/workflows/*.yml` → `workflow_dispatch.inputs.environment.options`

### 3.5 Validate

```bash
bun run vars:check        # lint-vars: {{VAR}} refs resolve against project.yaml
bun run vars:env:check    # check-vars: .env.example ↔ variables-manifest parity
bun run test:env:check    # validateTestEnv: current TEST_ENV creds present
```

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

- Update `api/schemas/index.ts`: add the new facade re-export. (`index.ts` re-exports only `auth.types` by default — `example.types` is consumed by `ExampleApi.ts`, not re-exported here, so there is nothing to drop unless you added one.)
- Without OpenAPI: `curl` the real endpoints first, then hand-write interfaces that mirror the contract.

---

## Phase 5 — Auth wiring + verify (writes)

### 5.1 Adapt kept components

- `tests/components/api/AuthApi.ts` — real `endpoints.login`, payload shape, types from `@schemas/auth.types`. **Replace `@atc('PROJ-101')` / `@atc('PROJ-102')` with `@atc('{{PROJECT_KEY}}-NNN')`** (leave the instructional `UPEX-101` comment example alone).
- `tests/components/ui/LoginPage.ts` — real locators (`getByTestId` / `getByRole`), tight assertions (URL change AND a post-login element). Replace its `PROJ-` ATC keys too.
- `tests/components/api/ApiBase.ts` — modify `buildHeaders()` only if the auth header is non-standard.

### 5.2 Adapt setups

- `tests/setup/api-auth.setup.ts` — parse the real token response shape; assert non-empty `.auth/api-state.json`.
- `tests/setup/ui-auth.setup.ts` — adapt token-endpoint intercept + LoginPage flow; add email-verification / 2FA handling **only** if enforced and a bypass exists; assert non-empty `.auth/user.json`.
- `tests/setup/global.setup.ts` — generic; verify the TMS provider matches the chosen modality, else unchanged.

### 5.3 Verify

```bash
bun run test --project=api-setup    # → non-empty .auth/api-state.json
bun run test --project=ui-setup     # → non-empty .auth/user.json
```

Both must pass before continuing — the suite depends on session reuse.

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

Create `tests/e2e/{feature}/smoke.test.ts` (or `tests/integration/{feature}/` for API-only) tagged **`@critical`** — the repo-wide convention that `playwright.config.ts` smoke project greps (`grep: /@critical/`) and the workflows run. **Do NOT tag `@smoke`** — `test:smoke` would select zero tests. Uses the new component through the fixture; asserts ≥1 domain operation end-to-end. No mocks against real auth.

### 6.5 Reconsider existing reference specs

`tests/e2e/dashboard/dashboard.test.ts` (`UPEX-200`, `/api/auth/me`) and `tests/integration/auth/user-session.test.ts` (`UPEX-100`): replace the `UPEX-` keys with `{{PROJECT_KEY}}` and keep if the endpoints resolve to the real API, else delete.

---

## Phase 7 — CI + manifest + MCP reconciliation (writes)

### 7.1 Regenerate the KATA manifest

Deleting `Example*` and adding the entity makes `kata-manifest.json` stale (it still lists `PROJ-101/102/103`). `.husky/pre-commit` blocks commits on a stale manifest (Rule #12).

```bash
bun run kata:manifest          # regenerate
bun run kata:manifest:check    # must exit 0
```

### 7.2 Reconcile the 4 GitHub workflows

`.github/workflows/{regression,sanity,smoke,build}.yml`. Per workflow:

- `workflow_dispatch.inputs.environment.options` must equal the env list (§3.4).
- Secret names (`secrets.<ENV>_USER_EMAIL` / `_PASSWORD`) must match the env-prefixed credential scheme.
- The smoke filter must select `@critical` (matches the config grep).
- `AUTO_SYNC` / `XRAY_*` / `ATLASSIAN_*` secrets only if the TMS modality uses them.
- gh-pages `subfolder` / `destination_dir` / report URL paths track the env names.

**Emit a copy-paste "GitHub repo Secrets to set" block** (these live outside the repo): `<ENV>_USER_EMAIL/_PASSWORD`, `XRAY_CLIENT_ID/SECRET` + `ATLASSIAN_*` if `AUTO_SYNC=true`, optional `SLACK_WEBHOOK_URL`. Note the manual external steps: create the `gh-pages` branch + enable GitHub Pages.

**Offer to push the CI secrets from `.env` automatically** (opt-in — ask first, never push silently): when `gh auth status` is authenticated, the values already exist in `.env`, and the user approves, set each via `gh secret set <NAME>` (add `--env <env>` for environment-scoped secrets; `gh variable set <NAME>` for non-secret config). This is the low-friction alternative to the manual copy-paste block above — the regression-testing readiness gate probes these same secrets via `gh secret list`, so setting them here means the first CI run does not 401. Skip for any value not present in `.env` (surface it instead) and never echo a secret's value back to the user.

### 7.3 MCP registry — DUAL-FILE sync (highest-risk surface)

`.mcp.json` (Claude Code: `mcpServers`, `env`, `${VAR}`) and `opencode.jsonc` (OpenCode: `mcp`, `environment`, `{env:VAR}`) ship the **same** servers (`context7`, `tavily`, `playwright`, `dbhub`, `openapi`, `postman`). **Every change must land in BOTH** with the right syntax — a single-file edit half-breaks the other agent. Per CLAUDE.md Rule #10, a missing/empty MCP var is a HARD SESSION STOP, not a soft CI failure.

- `project.yaml` `environments.<env>.db_mcp` / `api_mcp` resolve to MCP **server names**. Default: point them at the existing `dbhub` / `openapi` servers. If the target needs per-env DB/API servers, add those entries to **both** files.
- `openapi` server reads `API_BASE_URL` / `OPENAPI_SPEC_PATH` / `API_TOKEN` (via `API_HEADERS`). If the target has **no API**, disable/remove the `openapi` entry in both files (else it spins against empty env and `[API_TOOL]` breaks).
- `dbhub` server reads `dbhub.toml`. Verify it stays consistent with `DBHUB_*`.

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
5. bun run kata:manifest:check   # manifest matches disk
6. bun run test --project=api-setup
7. bun run test --project=ui-setup
8. bun run test:smoke            # first run on staging — ≥1 @critical test runs
9. bun run test:smoke            # second run — must reuse .auth/*, no re-login
10. bun run repo:check           # format + lint + types + vars + skills + registry + env
```

If run #9 re-runs the auth setup, session reuse is broken — check `playwright.config.ts` project dependencies and `.auth/*` freshness. If run #8 reports **0 tests**, the smoke tag is wrong (must be `@critical`).

---

## Phase 9 — Genericness scan + close

### 9.1 Genericness scan (the idempotency engine)

Run every detection signal and print a per-subsystem **GENERIC / ADAPTED** table. On a re-invocation this is the report; on a fresh run it confirms closure.

| Subsystem | ADAPTED signal (else GENERIC) |
|-----------|-------------------------------|
| project.yaml | `bun run vars:check` exits 0 **AND** `grep -c 'null #' .agents/project.yaml` == 0 |
| ATC keys | `grep -rnE "^\s*@atc\('(PROJ\|UPEX)-" tests/components/` returns nothing (decorator lines only — excludes the `AuthApi.ts:10` comment + `decorators.ts` JSDoc) |
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
| Session reuse | second `test:smoke` does not execute api-setup/ui-setup (and ≥1 test actually ran) |
| Business context | `grep -l 'placeholder\|Run \`/business-' .context/business/*.md .context/master-test-plan.md` returns nothing |
| CI workflows | workflow `options:` == env union; secret names match scheme; smoke filter == config grep tag |
| MCP dual-file | `db_mcp`/`api_mcp` resolve to server names present in **both** `.mcp.json` and `opencode.jsonc`; `API_BASE_URL`/`OPENAPI_SPEC_PATH` set in `.env` (or `openapi` server disabled in both) |
| dbhub | `DBHUB_*` populated in `.env` if `db_type` set (else `dbhub` MCP disabled in both files) |
| allurerc | `allurerc.mjs` `name` != `Agentic QA Boilerplate` |
| CLAUDE.md | resolved auth strategy / first entity / OpenAPI source present (not the generic template wording) |
| Full gate | `bun run repo:check` exits 0 |

### 9.2 Update CLAUDE.md

`CLAUDE.md` is a **regular file** (not a symlink). Edit in place: record the resolved auth strategy, the first entity wired, the OpenAPI source, the Git strategy, and any open Discovery Gaps.

### 9.3 Doc-sync handoff

`README.md`, `CONTEXT.md`, `INSTALLER.md`, and `docs/**` carry `upexgalaxy` / `UPEX-` / `dojo` example values and are **owned by `/sync-ai-memory`**, not this command. Do not scrub them here. Recommend (or, if the user approved inline timing in §1.7, invoke) `/sync-ai-memory` to reconcile them against the adapted repo.

### 9.4 Close

- Mark `.context/reports/adapt-framework-plan.md` `Status: COMPLETED` and append a results block (files created/modified, tests passing, gaps remaining, GitHub Secrets the user still owes).
- Report to the user: entities wired, facades created, setups passing, smoke passing, session reuse verified, MCP synced, and the GENERIC/ADAPTED table.

---

## Completion gate

Done only when **every** box is true (all map to a Phase 9 signal):

- [ ] `bun run repo:check` exits 0 (covers format + lint + types + vars + vars:env + skills + registry)
- [ ] `bun run kata:manifest:check` exits 0 and the manifest has no `Example` entries
- [ ] `bun run test:smoke` runs ≥1 `@critical` test on staging and passes
- [ ] Second smoke run reuses `.auth/*` (no re-login)
- [ ] No `PROJ-`/`UPEX-` ATC decorator remains in `tests/components/`
- [ ] No `Example*` component, `module-example/` spec, or hotel/booking data remains
- [ ] No component imports `@openapi`; only `api/schemas/` facades do
- [ ] `.agents/project.yaml` fully populated; `envDataMap` URLs == `project.yaml` env URLs
- [ ] MCP servers consistent across `.mcp.json` + `opencode.jsonc`; `allurerc.mjs` renamed
- [ ] CI workflow env options + secret names + smoke tag reconciled; GitHub Secrets list emitted
- [ ] `CLAUDE.md` updated; `/sync-ai-memory` handoff done or recommended
- [ ] `.context/reports/adapt-framework-plan.md` marked `COMPLETED`

---

## Common adaptation points

| Point | Current (example) | Target (you adapt it) |
|-------|-------------------|------------------------|
| Login endpoint | `POST /auth/login` | Real path from `api/openapi-types.ts` or `business-api-map.md` |
| Token format | `Bearer <jwt>` in body | `access_token` / `id_token` / cookie / hybrid |
| Token refresh | per-run mint, NO auto-refresh | per-run mint or staleness check (decide in §1.4) |
| Success URL | `/dashboard/` | Project's post-login route |
| API base prefix | `/api` | `/api/v1`, `/v2`, subdomain, or none |
| Env URLs | `localhost:3000`, `dojo.upexgalaxy.com` | Real per-env URLs in `config/variables.ts` `envDataMap` + `project.yaml` |
| ATC keys | `@atc('PROJ-101')` | `@atc('{{PROJECT_KEY}}-NNN')` |
| Domain data | hotel / booking | Target entities in `DataFactory` + `types.ts` |
| Smoke tag | `@critical` (keep) | `@critical` (do not invent `@smoke`) |
| Allure name | `Agentic QA Boilerplate` | Project report name |
| MCP db/api | single `dbhub` / `openapi` | per-env servers if needed (both registry files) |
| Data-testid | `getByTestId('email')` | Whatever the frontend exposes — request `data-testid` if missing |
| Email verify / 2FA / tenant | not in example | Add to `ui-auth.setup.ts` only if enforced + bypass exists |

---

## References

- `.claude/skills/test-automation/references/{kata-architecture,automation-standards,api-patterns,e2e-patterns,data-testid-strategy,typescript-patterns,ci-integration}.md`
- `/project-discovery` (produces `.context/`), `/business-*-map`, `/master-test-plan` (context enrichment), `/sync-ai-memory` (README/CONTEXT/INSTALLER/docs scrub)

---

## Gotchas

- Auth is the most fragile part — always test against real staging, never mocks.
- Credentials live in `.env`. Hardcoding them is a hard stop.
- `api-login.ts` does **not** auto-refresh — it mints per run. Don't document a refresh that doesn't exist.
- Golden KATA rule: components import from `@schemas/*`, never `@openapi`. Keep `@openapi` scoped to facades.
- Steps (Layer 3.5) carry no `@atc` and no fixed assertions — they chain ATCs only.
- MCP edits are dual-file: `.mcp.json` (`${VAR}`) **and** `opencode.jsonc` (`{env:VAR}`). Miss one and the other agent silently gets empty env → Rule #10 hard stop.
- Smoke tag is `@critical`, not `@smoke`. The config grep and the workflows agree on `@critical`; a `@smoke` test selects zero.
- `CLAUDE.md` is a regular file, not a symlink.
- The plan lives in `.context/reports/`, not `.context/PBI/` (Jira-owned cache).
- Session reuse: the second smoke run should be noticeably faster. If not, `auth.setup` is re-running.
- No OpenAPI spec → hand-write facades AND disable the `openapi` MCP server in both registry files.
