# Context Generators — business-data-map

> Read this when (re)generating `.context/mapping/business-data-map.md` — the canonical context file this skill owns. This is where most "regenerate business-data-map" user requests land.
>
> **Note**: API context (endpoint catalogs, auth flows, technical types) and the test-strategy layer (what to test, why) are **not** generated here anymore. See §API context — deferred to dedicated tools and §Master test plan — deferred to dedicated command below.

---

## What these generators produce

| File | Role | Depends on |
|------|------|------------|
| `.context/mapping/business-data-map.md` | The "what the system does" map — entities, flows, state machines, triggers, webhooks, integrations. | Phase 1 (project connection) + DB/ORM access + source code. |

**Test-strategy layer deferred**: `.context/master-test-plan.md` (what to test, why, in what order) used to live here as "Generator 3". It is now produced by the `/master-test-plan` command, which reads `business-data-map.md` and — when available — `business-feature-map.md`. Do not regenerate it from this skill.

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
6. **Never duplicate across files.** `business-data-map.md` owns business flows; the `/master-test-plan` command reads it. If the same fact would appear in both, keep it in the data map. For API endpoints — owned by `bun run api:sync` outputs and the `/business-api-map` command — link out, do not re-document.
7. **Discovery Gaps are mandatory.** Every doc ends with one. Listing "I could not verify the payment reconciliation trigger from code" is strictly better than inventing a description.

---

## Generator — `business-data-map.md`

### Phase 0: detect configuration

- AI memory file: `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `CURSOR.md`, `COPILOT.md`, `.ai-instructions.md`.
- Project name + purpose: `package.json`, `README.md`, `pyproject.toml`.
- DB access: resolve `[DB_TOOL]` (DBHub / Supabase / raw SQL). Read-only queries only.
- Existing docs: `.context/PRD/`, `.context/SRS/`, `docs/`.
- Detect CREATE vs UPDATE mode based on `.context/mapping/business-data-map.md` presence.

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

## API context — deferred to dedicated tools

`project-discovery` no longer generates `.context/api-architecture.md` end-to-end. The work is split across two tools that each own one angle:

- **Technical endpoint sync** — run `bun run api:sync` (script: `scripts/sync-openapi.ts`). It downloads an OpenAPI / Swagger spec from a URL, GitHub repo, or local file and generates TypeScript types under `api/schemas/`. Use this whenever you need exact request/response shapes for tests, components, or AI grounding. *If the project has no OpenAPI spec, surface that as a Discovery Gap and ask the user to expose one or skip technical sync.*

- **Business API angle** — auth flows, critical-path user journeys through the API, architecture behind the API, "how the business operates through the API". Owned by the `/business-api-map` command (sibling of `/business-data-map` and `/business-feature-map`). Output lives at `.context/mapping/business-api-map.md`. Use this — do NOT produce an API narrative inside `project-discovery`.

Do not attempt to regenerate `api-architecture.md` from scratch inside this skill. If the user explicitly asks for an "api-architecture" file, redirect them to one of the two tools above based on their intent (technical types vs. business map).

### Framework detection (used by `bun run api:sync` auto-config)

Kept here as a small reference because the same matrix helps `api:sync` decide where to look for the spec when one is not configured. It is also useful for project-discovery Phase 3 (Backend Discovery) when classifying the stack.

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

---

## Master test plan — deferred to dedicated command

`.context/master-test-plan.md` (the "what to test and why" document that used to live here as Generator 3) is now produced by the `/master-test-plan` command. It reads `business-data-map.md` (hard requirement) and `business-feature-map.md` (optional) and emits a business-derived test roadmap ranked by risk.

Do not regenerate that file from this skill. If the user asks to refresh it, redirect them to `/master-test-plan`.

---

## Cross-cutting gotchas

- **Incomplete OpenAPI.** If the project exposes a spec at `/openapi.json` or `swagger.json` but it is partial, fall back to source-code scanning for missing endpoints. Record the discrepancy in Discovery Gaps ("spec lists 42 paths; source has 57 handlers"). Do not silently trust OpenAPI.
- **Route prefixes vs base URLs.** Do not concatenate `{{environments.local.api_url}}` (which includes host) with a route prefix that also includes the host. Normalize to path-only in the endpoint catalog.
- **Undocumented DB relations.** ORM models sometimes lack explicit relations even when the DB has foreign keys. Prefer the migration/schema dump over ORM definitions. If ORM and DB disagree, the DB wins — flag the drift.
- **RLS, row-level security, policies.** Do NOT dump RLS policies verbatim into `business-data-map.md`. Note that they exist and the high-level rule ("only the owner can read their rows"). Live policy enumeration belongs in `[DB_TOOL]` sessions, not static markdown.
- **Dynamic routes and catch-alls.** Next.js `[...slug]`, Express wildcards, FastAPI path converters — these expand at runtime. Document them explicitly with a `[...]` annotation and Discovery Gap note.
- **Monorepos with multiple backends.** When the `/business-api-map` is run, scope it per backend service rather than flattening packages. Capture per-service auth, base URL, and ownership in `business-data-map.md`'s "External Integrations" section as a stop-gap.
- **Auth flows with refresh tokens.** Document the refresh recipe separately — `/adapt-framework` and `/business-api-map` will both depend on it.
- **Stale schema drift.** If `business-data-map.md` claims an entity exists but the current DB does not have it (or vice versa), that is a Discovery Gap — not a licence to silently rewrite the map. Ask the user before overwriting.
- **Webhooks from sandbox-only services.** Stripe test keys, Resend dev tokens, etc. — webhooks only fire in specific environments. Document which env each integration works in.
- **Mixed auth schemes.** Some projects have JWT for mobile + session cookies for web + API keys for machine-to-machine. Treat each as its own auth level, not "Protected".
- **Pagination contracts differ per endpoint.** `page/limit` vs `cursor` vs `offset` vs `after/before`. Capture per endpoint; do not assume one convention.
- **Soft-deletes.** If the project uses `deleted_at` or similar, DELETE endpoints may not really delete. Note this in the happy path column of the QA summary.
- **Data-map precedence.** Users may ask to "skip business-data-map" before running `/master-test-plan` or `/business-api-map`. Refuse politely — both commands ground their output in the data map. Offer to run `/business-data-map` first, then hand off.

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
- [ ] AI memory file updated with a "Business Data Map" pointer.

### `master-test-plan.md` — delegated

No checklist here. The deliverable contract lives in `.claude/commands/master-test-plan.md`. This skill's job is to produce `business-data-map.md` so the command has grounded input.

Emit a completion ping for `business-data-map.md`. If the user wants the test plan next, hand off to `/master-test-plan`.
