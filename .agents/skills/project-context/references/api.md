# Business API Map Generator

Generate or update the API map of `business-api-context`: `.agents/skills/business-api-context/references/business-api-map.html`, a business-first map of how the system's API powers user journeys. The file anatomy, the section contract and the incremental update are in `../../agentic-qa-core/references/business-context-maps.md` §2 and §4; this reference says WHAT goes in the sections.

**Target**: $ARGUMENTS (project path, module filter, or leave blank for full system)

---

## What this produces

A single document that explains **how the business operates through the API**, covering:
- The permission & auth model (tiers, token flow, where enforcement lives)
- Critical business journeys traced as end-to-end API call chains
- The architecture that sits behind the API (services, persistence, boundaries)
- External integrations at the API boundary (payment, auth, email, webhooks)
- Cross-references to the entities of `business-data-context` and the journeys and features of `business-e2e-context`

This is the **narrative** complement to:
- `business-data-context` (data-centric)
- `business-e2e-context` (journey-centric, with the feature catalog)
- `bun run api:sync` output (technical types in `api/schemas/`)

**It is NOT an endpoint catalog.** See §What is NOT in this plan.

---

## Sources (use ALL available)

Exhaust every source. Prefer existing context files over re-deriving from code.

| Source | What to extract | Tool |
|--------|-----------------|------|
| OpenAPI spec | Endpoint inventory, auth tags, request/response shapes | `api/openapi.json`, output of `bun run api:sync`, or `[API_TOOL]` |
| `business-data-context` map | Entities, flows, state machines — journeys must align to these | `bun run context:map business-data-context` |
| `business-e2e-context` map | Journeys, features, CRUD, integrations — endpoints belong to features | `bun run context:map business-e2e-context` |
| Legacy map (input only) | a project's old `.context/business/business-api-map.md`, when present | Read it as input; cite it in `data-migrated-from` on the sections it seeded; never delete or rewrite it |
| Auth middleware | Where tokens are validated, how roles map, public-vs-protected boundaries | Read `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` — auth/, middleware/, guards/, decorators |
| Controllers / routes | Handler shapes and side effects behind each endpoint | Same backend entry — controllers, services |
| Package dependencies | External SDKs at the API boundary (Stripe, Auth0, Resend, S3, etc.) | Read `package.json`, `requirements.txt`, `Gemfile` |
| Env / config (examples only) | Auth provider config, integration endpoints, webhook URLs | Read `.env.example`, config files — NEVER read or dump real secrets |
| Existing docs | Hand-written API notes, onboarding guides | `docs/`, the project's own API notes |
| Architecture and auth | auth flow, external services, environments, NFR budgets at the API boundary (rate limits, timeouts) | `bun run context:map infra-context` |
| Domain vocabulary | business terms, so endpoint groups are named the way the business names them | `bun run context:map business-domain-context` |

**Golden rule**: This is a *narrative* document. If OpenAPI already expresses a fact as a schema, link to it — do NOT restate it in prose.

---

## Mode detection

```
bun run context:map business-api-context --list
  → skill folder missing:   STOP. The skill is delivered by `bun run up`
                            (or scaffolded from the boilerplate); never create it here.
  → placeholder notice:     CREATE mode — build every section from the sources.
  → a list of sections:     UPDATE mode — staleness check per section
                            (business-context-maps.md §5), regenerate ONLY the
                            stale ones, show a section-level diff, WAIT for
                            explicit approval. NEVER regenerate the whole map.
```

Before drawing the first figure, run the point-of-use check for capability `diagrams` (`../../agentic-qa-core/references/business-context-maps.md` §7).

---

## Dependency gates

Both context-file gates are **soft** — this mode produces value even in sparse repos; missing inputs become Discovery Gaps, not hard stops.

- **`business-data-context` map missing or placeholder** → warn the user ("journeys will be weaker without entity context"), proceed, log the limitation in §Discovery Gaps.
- **`business-e2e-context` map missing or placeholder** → warn the user ("journey selection will rely on code scan alone"), proceed, log the limitation in §Discovery Gaps.
- **No OpenAPI spec AND no route-scannable backend** → hard stop. Ask the user to expose a spec or run `bun run api:sync`; you cannot produce an API map without either.

---

## Discovery phases

### Phase 1 — Permission & auth model

Identify tiers and how a caller reaches each one.
- What authentication schemes exist? (JWT, session cookie, API key, OAuth — treat each as its own tier, not a generic "Protected")
- How does a user obtain a token? (login endpoint, SSO flow, refresh recipe)
- What roles/scopes/claims gate higher tiers? (admin, owner, tenant-scoped)
- Where does validation live? (middleware, guard, decorator, edge function)

**Outcome**: a taxonomy (Public / Authenticated / Role-based / Owner-scoped) anchored to concrete code paths. Do NOT list endpoints per tier here — that is feature-map's job.

### Phase 2 — Critical business journeys

Select **3–7 journeys** that matter most to the business. Prioritize by:
- Revenue impact (checkout, billing, subscription)
- Security (auth, password reset, permission changes, impersonation)
- Core user value (the primary product flow)
- High blast radius on failure (fund transfers, data exports, bulk operations)

For each selected journey, trace the chain: `Client → Auth → Handler → Services → DB / External → Response`. Reference feature-map FEAT-IDs and data-map entities where possible. Do NOT invent journeys — cross-reference with existing context first.

### Phase 3 — Architecture behind the API

One layer of depth, not exhaustive:
- What services sit behind the API? (monolith module, microservice, background worker)
- What persistence does it touch? (primary DB, cache, queue, object storage)
- What deployment shape? (serverless function, container, edge worker, lambda)

Purpose: orient a new QA on "what breaks if the API hangs here".

### Phase 4 — External integrations at the API boundary

For each third-party service reached from the API:
- What triggers the call? (endpoint, webhook inbound, webhook outbound, background job)
- What is the failure mode visible to the user? (timeout, silent failure, queued retry, hard error)
- Which critical journeys depend on it?

Pull from feature-map §Third-party integrations if available; enrich with the failure-mode column it omits.

### Phase 5 — Cross-reference with data-map and feature-map

Validate coherence, do not duplicate content:
- Every journey touches entities that exist in data-map — flag orphans.
- Every journey maps to features in feature-map — flag API-only paths not caught as features.
- Every integration listed in feature-map that reaches the API boundary appears here (and vice versa).

---

## Output structure

Write the map as flat `<section>`s with stable ids (`overview`, `auth-model`, `journey-<slug>`, `architecture`, `integrations`, `cross-references`, `discovery-gaps`), each with its `data-sources` and `data-updated` date (anatomy: `business-context-maps.md` §2). Figures are diagram-design SVG inside `<figure data-diagram>`: sequence for a journey, architecture for §4. Every fact a figure shows is also in the text. Their content, section by section:

### 1. Executive summary

2–3 paragraphs answering *what does this API let the business do?* Frame from the user's perspective — "authenticated buyers complete a purchase in four calls", not "the API exposes 47 endpoints". Avoid counts and endpoint lists.

### 2. Permission & auth model

- Tier table: `Tier | Who it applies to | How to acquire | Where enforced (code path)`.
- A sequence figure of the token flow for the primary auth scheme (login → token → subsequent call → refresh).
- If multiple schemes coexist (JWT + API key + session cookie), include one diagram per scheme.

No per-endpoint listings here.

### 3. Critical business journeys

One sub-section per journey. Each:
- Name + one-sentence business purpose.
- A sequence figure: `Client → Middleware → Handler → DB / External → Response`.
- Numbered narrative (1..N) with the *why* at each step.
- **Endpoints involved**: list of `METHOD /path` pointers (not full specs — link to OpenAPI).
- **Entities touched**: pointers to `business-data-context` section ids.
- **Feature IDs**: pointers to `business-e2e-context` feature section ids.

Cap at 7 journeys by default. If the system genuinely has more critical flows, document the cap decision in §Discovery Gaps rather than expanding silently.

### 4. Architecture behind the API

- One architecture figure: `Client → API Gateway / Edge → Handlers → Services → Persistence / External`.
- Table: `Component | Role | Persistence/Integrations touched | Why it matters for QA`.

One diagram total for the whole system, not one per journey.

### 5. External integrations

```markdown
| Service | Trigger | Direction | Failure mode (user-visible) | Journeys affected |
|---------|---------|-----------|-----------------------------|-------------------|
| Stripe  | POST /checkout | Outbound sync | 5xx → order stuck in `pending` | Checkout |
| Stripe  | webhook /stripe/events | Inbound async | missed event → order never finalizes | Checkout |
```

### 6. Cross-references

- Entities this API exposes → `business-data-context` section ids.
- Features this API backs → `business-e2e-context` section ids.
- OpenAPI spec location (file path or URL) for full endpoint specs.
- `bun run api:sync` output path (`api/schemas/`) for TypeScript types.

Purpose: make it obvious where each flavor of API info lives so nothing gets re-documented here.

### 7. Discovery gaps

MANDATORY. List anything you could not verify:
- Auth schemes observed in code but missing from middleware (or vice versa).
- Journeys that could not be traced end-to-end (dead branches, missing evidence).
- Integrations mentioned in env but with no code calls (planned, dead, or undocumented?).
- Monorepo shards not inspected.
- Webhooks configured in external dashboards but not discoverable from code.

---

## After generation

- Verify: `bun run context:map business-api-context --list` prints every section, with the run's date on the ones written, and no placeholder notice.
- If the data or e2e map was missing or a placeholder during generation, note the limitation in the summary you report back to the user.
- Every section built from the contract carries `openapi:<tag or path>` in `data-sources`: that is how a later run detects staleness per section.
- In UPDATE mode: show the section-level diff and wait for explicit confirmation before writing.
- Report: auth tiers documented, journeys traced, services behind the API, integrations mapped, sections regenerated vs untouched, discovery gaps.
- The map just changed: review `business-api-context`'s `## Rules` and `references/gotchas.md` against it. A rule the new map contradicts is PROPOSED for the gotchas' "No longer true" section, never deleted.

---

## What is NOT in this plan

This mode does one thing: narrate the **business-level API story**. Everything below is delegated — do not expand scope.

| Out of scope | Owner |
|--------------|-------|
| Exhaustive endpoint catalog (every route with request/response) | `bun run api:sync` + OpenAPI spec |
| TypeScript types for request/response shapes | `api/schemas/*.types.ts` via `bun run api:sync` |
| cURL / Postman / DevTools recipes | `/playwright-cli` + existing integration tests |
| Per-endpoint test case design (happy/error matrix) | `/test-documentation` (ATPs) |
| CRUD matrix per entity | `project-context` mode `e2e` |
| UI component inventory | `project-context` mode `e2e` |
| Entity schemas, state machines, business rules | `project-context` mode `data` |
| Risk-ranked test roadmap ("what to test and why") | `project-context` mode `test-plan` |
| Sprint-level test execution order | `/sprint-testing` |

If the user asks for any of the above inside the API map, decline politely and point to the owning tool. This document stays short, narrative, and business-first.
