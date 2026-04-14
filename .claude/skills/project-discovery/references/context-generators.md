# Context Generators — business-data-map, api-architecture, project-test-guide

> Read this when (re)generating any of the three canonical context files that the rest of the testing skills depend on. This is where most "regenerate X" user requests land.

---

## What these generators produce

| File | Role | Depends on |
|------|------|------------|
| `.context/business-data-map.md` | The "what the system does" map — entities, flows, state machines, triggers, webhooks, integrations. | Phase 1 (project connection) + DB/ORM access + source code. |
| `.context/api-architecture.md` | Every endpoint grouped by auth level, with request/response shape and test recipes. | Phase 1 + Phase 3 backend + OpenAPI (if available). |
| `.context/project-test-guide.md` | Conversational QA guide — what to test, why, in what order. | `business-data-map.md` (hard requirement — will not run otherwise). |

Generation order is fixed: `business-data-map.md` -> `api-architecture.md` -> `project-test-guide.md`. The test guide reads the other two.

Every output MUST include a `## Discovery Gaps` section for anything not verifiable from code/DB.

---

## Golden rules (apply to all three generators)

1. **Visual first.** ASCII diagrams for entity maps, state machines, integration flows. Diagrams beat paragraphs for onboarding.
2. **Synthesis, not extraction.** Do not dump `information_schema` into markdown. The DB MCP is live — use it to understand, then write the narrative.
3. **Explain the why, not just the what.** For every entity, flow, state, trigger: answer "why does this exist?" in one line.
4. **Stack-agnostic phrasing.** Detect the framework, then speak the right dialect. Do not assume Next.js, Supabase, or Postgres.
5. **CREATE vs UPDATE mode.**
   - If the output file does not exist: CREATE mode — generate from scratch.
   - If it exists: UPDATE mode — show a diff summary, require explicit user approval before overwriting. Never auto-overwrite.
6. **Never duplicate across the three files.** `business-data-map.md` owns business flows; `api-architecture.md` references them; `project-test-guide.md` reads both. If the same fact appears in two, keep it where it is load-bearing and cross-mention briefly in the other.
7. **Discovery Gaps are mandatory.** Every doc ends with one. Listing "I could not verify the payment reconciliation trigger from code" is strictly better than inventing a description.

---

## Generator 1 — `business-data-map.md`

### Phase 0: detect configuration

- Project system prompt file: `CLAUDE.md`, `GEMINI.md`, `CURSOR.md`, `COPILOT.md`, `.ai-instructions.md`.
- Project name + purpose: `package.json`, `README.md`, `pyproject.toml`.
- DB access: resolve `[DB_TOOL]` (DBHub / Supabase / raw SQL). Read-only queries only.
- Existing docs: `.context/PRD/`, `.context/SRS/`, `docs/`.
- Detect CREATE vs UPDATE mode based on `.context/business-data-map.md` presence.

### Phase 1: deep exploration

Explore, do not enumerate. For each of these, read code + DB + existing docs to build understanding.

- **Business entities.** What are the core domain concepts? What real-world concept does each entity represent? Why does it exist? How do entities relate, and why?
- **Business flows.** Each major feature. Trace end-to-end: User -> API -> Logic -> DB -> Response. Capture endpoints, services, tables, and business rules.
- **State machines.** Which entities have states? Valid transitions? Triggering events? Consequences per transition.
- **Automatic processes.** DB triggers, cron jobs, incoming webhooks. Why each exists.
- **External integrations.** Which services, how they impact data, which flows depend on them.

### Phase 2: document structure (in order)

1. **Visual header** — project name + short description in an ASCII box.
2. **Executive Summary** — 2-3 paragraphs on the business purpose, the problem, the value. Main actors in a 3-column ASCII diagram. Value proposition per actor.
3. **Entity Map** — ASCII diagram of entities + relationships. Table: `Entity | Business Role | Why it exists`. Narrative on key relationships.
4. **Business Flows** — one section per important flow. Each: ASCII flow diagram, narrative (numbered 1-N), business rules, code involved (file paths). Document ALL important flows — do NOT cap at 3.
5. **State Machines** — one sub-section per stateful entity. ASCII state diagram, transitions table (`From | To | Triggering Event | Effects`), business rules.
6. **Automatic Processes** — three tables: triggers, cron jobs, incoming webhooks. Columns include "why it exists".
7. **External Integrations** — one sub-section per service. ASCII call/webhook diagram. What it does, how it affects data, which flows depend on it.
8. **Discovery Gaps** — what could not be verified from code/DB.

### UPDATE mode diff format

```
Changes detected:

ENTITIES:
+ new_table (added)
~ profiles (new relationships with X)
- legacy_orders (removed)

FLOWS:
+ Payment flow (new)
~ Booking flow (modified step 3)

INTEGRATIONS:
+ Stripe webhook (new)

Apply these changes? (yes/no)
```

Only overwrite on explicit user confirmation.

---

## Generator 2 — `api-architecture.md`

### Phase 0: detect stack

Run this BEFORE exploration. Never ask the user "what stack is this?" — detect, then confirm.

| Stack signal | Endpoint pattern | Typical location |
|--------------|------------------|------------------|
| `next.config.*` + `src/app/api/` | `export async function GET/POST/PUT/PATCH/DELETE` | `src/app/api/<domain>/route.ts` |
| `next.config.*` + `pages/api/` | `export default handler` | `pages/api/<domain>.ts` |
| `express` dep | `router.get/post/put/patch/delete(...)` | `routes/*.js`, `src/routes/*.ts` |
| `fastapi` imports | `@app.get/post/put/patch/delete(...)` | `main.py`, `app/*.py` |
| `manage.py` + `urls.py` | `path()` patterns | `urls.py` + `views.py` |
| `nest-cli.json` | `@Get/Post/Put/Delete()` decorators | `*.controller.ts` |
| Gemfile + rails | `resources` blocks | `config/routes.rb` |
| No custom API, direct Supabase client | PostgREST auto-generated | N/A |

Also detect CREATE vs UPDATE mode, existing `.context/business-data-map.md`, and `.context/SRS/` docs.

### Phase 1: exploration

**1. Find all endpoints.** Per-stack recipes:

- Next.js App Router: find `route.ts` / `route.js` under `src/app/api/`; list exported methods.
- Next.js Pages: list `pages/api/**/*.ts`.
- Express: grep `router\.(get|post|put|patch|delete)` across `*.js`, `*.ts`.
- FastAPI: grep `@app\.(get|post|put|patch|delete)` across `*.py`.
- NestJS: grep `@Controller` + `@(Get|Post|Put|Patch|Delete)`.

For each endpoint: full path, HTTP method, path params, query params, request body schema, response schema, auth requirement.

**2. Analyze authentication.** Detect the auth system and classify every endpoint.

| Level | Description | Typical check |
|-------|-------------|---------------|
| Public | No auth | None |
| Protected | Authenticated user | `session?.user` / `getUser()` |
| Role-based / Admin | Specific role | `user.role === 'admin'` |
| Owner | Resource owner | `resource.user_id === user.id` |

**3. Identify external services.** Stripe, Resend, SendGrid, S3, Supabase Storage, Cloudinary, OpenAI, Anthropic, analytics. For each: which endpoints use it, received webhooks, data format.

**4. Map DB connections.** For each endpoint: which tables read, which tables write. If `business-data-map.md` exists, reference flows instead of re-documenting.

### Phase 2: document structure (in order)

1. **Visual header** — project name, detected stack, total endpoints.
2. **Executive Summary** — technology stack table, endpoint statistics (total / public / protected / admin), base URLs per environment (use `{{API_URL_LOCAL}}`, `{{API_URL_STAGING}}` placeholders).
3. **Complete Architecture** — one big ASCII diagram: client -> middleware -> handlers -> data layer (DB + external services).
4. **Endpoint Catalog** — one section per domain (Auth, Users, Orders, ...). Each section is a table: `Method | Endpoint | Auth | Description`. Legend: `Public / Protected / Admin / Owner`.
5. **Endpoint Details by Domain** — per endpoint: method+path, auth level, request (headers + body schema), response (200 + error cases), example using `curl` or `[API_TOOL]`.
6. **Authentication by Type** — one sub-section per auth level. List of endpoints at that level + how to test (get-token recipe for Protected, role check for Admin, ownership check for Owner).
7. **Testing Guide** — DevTools console, Postman (environment + collection + pre-request script for auto-auth), `curl` end-to-end flow (signup -> login -> use token), Playwright `request` fixture.
8. **Complex Data Flows** — for flows that span multiple services/tables, include an ASCII diagram and numbered narrative. Reference `business-data-map.md` for business context.
9. **QA Summary Table** — quick-reference: `# | Endpoint | Auth | Happy path | Error cases`. Plus a coverage-by-domain table.
10. **Discovery Gaps** — endpoints not verifiable from code (e.g., dynamic routes generated at runtime), auth checks whose source you could not read, undocumented query params.

### Base URL rule

`{{API_URL_LOCAL}}` and `{{API_URL_STAGING}}` already include protocol + host. Route prefixes (`/api/v1`) belong in the path. Do NOT concatenate them twice.

### UPDATE mode diff format

```
Changes detected in API Architecture:

ENDPOINTS:
+ POST /api/new-endpoint (added)
~ PUT /api/existing (modified: new param X)
- DELETE /api/removed (deleted)

DOMAINS:
+ Payments (new, 5 endpoints)

AUTHENTICATION:
~ /api/public/data is now Protected

Apply these changes? (yes/no)
```

---

## Generator 3 — `project-test-guide.md`

### Hard prerequisite

`.context/business-data-map.md` MUST exist. If it does not, STOP and run Generator 1 first. This generator reads flows from the business map; without it, the output is guesswork.

### Tone and scope

- **Conversational**, as if a senior QA were explaining to another tester what to validate.
- **WHAT, not HOW.** No test snippets, no exact payloads, no specific commands. The reader already has their test framework.
- Visual when helpful — ASCII flow dependency diagrams, state machines.

### Phase 0: read prior context

Read `business-data-map.md` and (if present) `api-architecture.md`. Understand:
- Business flows.
- State machines and transitions.
- Automatic processes (triggers, cron, webhooks).
- External integrations.
- Business rules.

### Phase 1: document structure (in order)

1. **Header** — project name + one-line charter ("What to validate and why it matters"). Reference back to `business-data-map.md`.
2. **Overview** — the most critical flows, in prioritized order with business reason. ASCII flow-dependency diagram showing which flows affect which ("if registration breaks, so does booking and review").
3. **What to Test by Flow** — one sub-section per major flow:
   - ASCII simplified flow diagram.
   - Why it's important (business impact).
   - Happy path narrative.
   - Scenarios that might break (edge cases, what-ifs).
   - Business rules to validate.
   - Side effects (notifications, cascading updates, automatic processes).
4. **Validating State Machines** — for each stateful entity:
   - ASCII state diagram.
   - Transitions to validate (conditions, side effects, time restrictions).
   - Transitions that SHOULD NOT be possible.
   - Terminal states.
5. **Testing Automatic Processes** — triggers (when they fire, when they should NOT), cron jobs (empty input, heavy load, mid-batch failures, idempotency), webhooks (duplicates, late arrival, malformed payload, retry contract).
6. **Testing Integrations** — for each external service: happy path, failure scenarios (no response, error response, slow response, missing webhook), integration diagram.
7. **Integration Scenarios** — chained flows (end-to-end multi-feature paths), concurrency (two users on the same action, process vs user on the same entity, unique-constraint guarantees).
8. **Edge Case Ideas** — per flow, plus generic data cases (very long/short, special chars, boundary values) and time cases (midnight, time zones, DST, session expiry).
9. **Final Considerations**:
   - Suggested prioritization (Critical / High / Medium / Low tiers).
   - Pre-release sanity checklist (main flows work, state transitions correct, automatic processes still running, external integrations reachable).
   - Related resources: pointer back to `business-data-map.md` and `api-architecture.md`.
10. **Discovery Gaps** — flows not yet documented, rules you could not verify, areas the senior QA would want a human to sign off on.

### Risk tiers (use for prioritization section)

| Tier | Criteria | Example |
|------|----------|---------|
| Critical | If it fails, the business stops | Checkout, login, payment webhook |
| High | Important flow, but a workaround exists | Password reset, profile edit |
| Medium | Secondary flow | Dashboard filters, notifications |
| Low | Nice to have | Analytics events, theming |

---

## Cross-cutting gotchas

- **Incomplete OpenAPI.** If the project exposes a spec at `/openapi.json` or `swagger.json` but it is partial, fall back to source-code scanning for missing endpoints. Record the discrepancy in Discovery Gaps ("spec lists 42 paths; source has 57 handlers"). Do not silently trust OpenAPI.
- **Route prefixes vs base URLs.** Do not concatenate `{{API_URL_LOCAL}}` (which includes host) with a route prefix that also includes the host. Normalize to path-only in the endpoint catalog.
- **Undocumented DB relations.** ORM models sometimes lack explicit relations even when the DB has foreign keys. Prefer the migration/schema dump over ORM definitions. If ORM and DB disagree, the DB wins — flag the drift.
- **RLS, row-level security, policies.** Do NOT dump RLS policies verbatim into `business-data-map.md` or `api-architecture.md`. Note that they exist and the high-level rule ("only the owner can read their rows"). Live policy enumeration belongs in `[DB_TOOL]` sessions, not static markdown.
- **Dynamic routes and catch-alls.** Next.js `[...slug]`, Express wildcards, FastAPI path converters — these expand at runtime. Document them explicitly with a `[...]` annotation and Discovery Gap note.
- **Monorepos with multiple backends.** One `api-architecture.md` per backend service, or one file with a top-level service index. Never flatten services from different packages into a single unlabeled catalog.
- **Auth flows with refresh tokens.** Document the refresh recipe separately — KATA adaptation will depend on it.
- **Stale schema drift.** If `business-data-map.md` claims an entity exists but the current DB does not have it (or vice versa), that is a Discovery Gap — not a licence to silently rewrite the map. Ask the user before overwriting.
- **Webhooks from sandbox-only services.** Stripe test keys, Resend dev tokens, etc. — webhooks only fire in specific environments. Document which env each integration works in.
- **Mixed auth schemes.** Some projects have JWT for mobile + session cookies for web + API keys for machine-to-machine. Treat each as its own auth level, not "Protected".
- **Pagination contracts differ per endpoint.** `page/limit` vs `cursor` vs `offset` vs `after/before`. Capture per endpoint; do not assume one convention.
- **Soft-deletes.** If the project uses `deleted_at` or similar, DELETE endpoints may not really delete. Note this in the happy path column of the QA summary.
- **Generator 3 prerequisite enforcement.** Users will ask "skip business-data-map, just generate the test guide". Refuse politely — the test guide's entire value is grounded in the business map. Offer to generate both in sequence.

---

## Deliverables checklist

Before reporting any generator complete:

### `business-data-map.md`

- [ ] Visual header.
- [ ] Executive summary with main actors + value proposition.
- [ ] Entity map with ASCII diagram + `Entity | Role | Why` table.
- [ ] All important flows documented (no arbitrary cap).
- [ ] State machines for every stateful entity.
- [ ] Automatic processes (triggers + cron + webhooks) with "why".
- [ ] External integrations with ASCII diagrams.
- [ ] Discovery Gaps section present.
- [ ] System prompt file updated with a "Business Data Map" pointer.

### `api-architecture.md`

- [ ] Visual header with stack + endpoint count.
- [ ] Executive summary with stats + base URLs.
- [ ] Architecture diagram (request flow).
- [ ] Endpoint catalog grouped by domain with Auth legend.
- [ ] Per-endpoint details (request, response, example).
- [ ] Authentication by type (Public / Protected / Admin / Owner) with test recipes.
- [ ] Testing guide (DevTools / Postman / curl / Playwright).
- [ ] Complex flows section for multi-service paths.
- [ ] QA summary table + coverage-by-domain table.
- [ ] Discovery Gaps section present.
- [ ] System prompt file updated with "API Architecture" pointer.

### `project-test-guide.md`

- [ ] Conversational tone, NO test snippets or payloads.
- [ ] Prerequisite check passed (`business-data-map.md` exists).
- [ ] Flow-dependency ASCII diagram.
- [ ] One section per flow with happy path + edge cases + rules + side effects.
- [ ] State-machine validation section.
- [ ] Automatic processes section.
- [ ] Integrations section with failure scenarios.
- [ ] Integration scenarios (chained flows + concurrency).
- [ ] Edge case ideas by flow + data cases + time cases.
- [ ] Prioritization (Critical/High/Medium/Low) + pre-release checklist.
- [ ] Discovery Gaps section present.
- [ ] System prompt file updated with "Testing Guide" pointer.

Emit a completion ping per file and wait for user approval before running the next generator.
