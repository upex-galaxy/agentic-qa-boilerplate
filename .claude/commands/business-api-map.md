# Business API Map Generator

Generate or update `.context/mapping/business-api-map.md` — a business-first map of how the system's API powers user journeys.

**Target**: $ARGUMENTS (project path, module filter, or leave blank for full system)

---

## What this produces

A single document that explains **how the business operates through the API**, covering:
- The permission & auth model (tiers, token flow, where enforcement lives)
- Critical business journeys traced as end-to-end API call chains
- The architecture that sits behind the API (services, persistence, boundaries)
- External integrations at the API boundary (payment, auth, email, webhooks)
- Cross-references to `business-data-map.md` entities and `business-feature-map.md` features

This is the **narrative** complement to:
- `business-data-map.md` (data-centric)
- `business-feature-map.md` (capability-centric)
- `bun run api:sync` output (technical types in `api/schemas/`)

**It is NOT an endpoint catalog.** See §What is NOT in this plan.

---

## Sources (use ALL available)

Exhaust every source. Prefer existing context files over re-deriving from code.

| Source | What to extract | Tool |
|--------|-----------------|------|
| OpenAPI spec | Endpoint inventory, auth tags, request/response shapes | `api/openapi.json`, output of `bun run api:sync`, or `[API_TOOL]` |
| `.context/mapping/business-data-map.md` | Entities, flows, state machines — journeys must align to these | Read directly |
| `.context/mapping/business-feature-map.md` | Features, CRUD, integrations — endpoints belong to features | Read directly |
| Auth middleware | Where tokens are validated, how roles map, public-vs-protected boundaries | Read `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` — auth/, middleware/, guards/, decorators |
| Controllers / routes | Handler shapes and side effects behind each endpoint | Same backend entry — controllers, services |
| Package dependencies | External SDKs at the API boundary (Stripe, Auth0, Resend, S3, etc.) | Read `package.json`, `requirements.txt`, `Gemfile` |
| Env / config (examples only) | Auth provider config, integration endpoints, webhook URLs | Read `.env.example`, config files — NEVER read or dump real secrets |
| Existing docs | Hand-written API notes, onboarding guides | `.context/PRD/`, `.context/SRS/`, `docs/` |

**Golden rule**: This is a *narrative* document. If OpenAPI already expresses a fact as a schema, link to it — do NOT restate it in prose.

---

## Mode detection

```
Does .context/mapping/business-api-map.md exist?
  → NO:  CREATE mode — generate from scratch
  → YES: UPDATE mode — generate new version, show diff summary, ask
         for confirmation before overwriting. NEVER auto-overwrite.
```

---

## Dependency gates

Both context-file gates are **soft** — this command produces value even in sparse repos; missing inputs become Discovery Gaps, not hard stops.

- **`business-data-map.md` missing** → warn the user ("journeys will be weaker without entity context"), proceed, log the limitation in §Discovery Gaps.
- **`business-feature-map.md` missing** → warn the user ("journey selection will rely on code scan alone"), proceed, log the limitation in §Discovery Gaps.
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

Write `.context/mapping/business-api-map.md` with these 7 sections:

### 1. Executive summary

2–3 paragraphs answering *what does this API let the business do?* Frame from the user's perspective — "authenticated buyers complete a purchase in four calls", not "the API exposes 47 endpoints". Avoid counts and endpoint lists.

### 2. Permission & auth model

- Tier table: `Tier | Who it applies to | How to acquire | Where enforced (code path)`.
- ASCII diagram of the token flow for the primary auth scheme (login → token → subsequent call → refresh).
- If multiple schemes coexist (JWT + API key + session cookie), include one diagram per scheme.

No per-endpoint listings here.

### 3. Critical business journeys

One sub-section per journey. Each:
- Name + one-sentence business purpose.
- ASCII sequence diagram: `Client → Middleware → Handler → DB / External → Response`.
- Numbered narrative (1..N) with the *why* at each step.
- **Endpoints involved**: list of `METHOD /path` pointers (not full specs — link to OpenAPI).
- **Entities touched**: pointers to data-map entities.
- **Feature IDs**: pointers to feature-map FEAT-NNNs.

Cap at 7 journeys by default. If the system genuinely has more critical flows, document the cap decision in §Discovery Gaps rather than expanding silently.

### 4. Architecture behind the API

- One ASCII layered diagram: `Client → API Gateway / Edge → Handlers → Services → Persistence / External`.
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

- Data-map entities this API exposes → pointers to `.context/mapping/business-data-map.md` anchors.
- Feature-map features this API backs → pointers to `.context/mapping/business-feature-map.md` anchors.
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

- Update the AI memory file (`CLAUDE.md` / `AGENTS.md`) §Context System with a pointer to `.context/mapping/business-api-map.md` if not already present.
- If `business-data-map.md` or `business-feature-map.md` were missing during generation, note the limitation in the summary you report back to the user.
- Add a `> Last verified against OpenAPI on YYYY-MM-DD` line at the top of the output so future runs detect staleness at a glance.
- In UPDATE mode: show the diff summary and wait for explicit confirmation.
- Report: auth tiers documented, journeys traced, services behind the API, integrations mapped, discovery gaps.

---

## What is NOT in this plan

This command does one thing: narrate the **business-level API story**. Everything below is delegated — do not expand scope.

| Out of scope | Owner |
|--------------|-------|
| Exhaustive endpoint catalog (every route with request/response) | `bun run api:sync` + OpenAPI spec |
| TypeScript types for request/response shapes | `api/schemas/*.types.ts` via `bun run api:sync` |
| cURL / Postman / DevTools recipes | `/playwright-cli` + existing integration tests |
| Per-endpoint test case design (happy/error matrix) | `/test-documentation` (ATPs) |
| CRUD matrix per entity | `/business-feature-map` |
| UI component inventory | `/business-feature-map` |
| Entity schemas, state machines, business rules | `/business-data-map` |
| Risk-ranked test roadmap ("what to test and why") | `/master-test-plan` |
| Sprint-level test execution order | `/sprint-testing` |

If the user asks for any of the above inside `business-api-map.md`, decline politely and point to the owning tool. This document stays short, narrative, and business-first.
