# Business API Map Generator

Generate or update the API map of `business-api-context`: `.agents/skills/business-api-context/references/business-api-map.html`, a business-first map of how the system's API powers user journeys. The file anatomy, the section contract and the incremental update are in `../../agentic-qa-core/references/business-context-maps.md` §2 and §4; this reference says what goes in the sections.

**Target**: $ARGUMENTS (project path, module filter, or leave blank for full system)

---

## What this produces

A single document that explains how the business operates through the API:
- The permission and auth model (tiers, token flow, where enforcement lives)
- Critical business journeys traced as end-to-end API call chains
- The architecture that sits behind the API (services, persistence, boundaries)
- External integrations at the API boundary (payment, auth, email, webhooks)
- Cross-references to the entities of `business-data-context` and the journeys and features of `business-e2e-context`

It complements `business-data-context`, `business-e2e-context` and the `bun run api:sync` output (`api/schemas/`), and is not an endpoint catalog: see `## What is NOT in this plan`.

---

## Sources (use all available)

Exhaust every source. Prefer existing context files over re-deriving from code.

| Source | What to extract | Tool |
|--------|-----------------|------|
| OpenAPI spec | Endpoint inventory, auth tags, request/response shapes | `api/openapi.json`, output of `bun run api:sync`, or `[API_TOOL]` |
| `business-data-context` map | Entities, flows, state machines: journeys must align to these | `bun run context:map business-data-context` |
| `business-e2e-context` map | Journeys, features, CRUD, integrations: endpoints belong to features | `bun run context:map business-e2e-context` |
| Legacy map (input only) | a project's old `.context/business/business-api-map.md`, when present | Read it as input; cite it in `data-migrated-from` on the sections it seeded; leave it in place |
| Auth middleware | Where tokens are validated, how roles map, public-vs-protected boundaries | Read `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}`: auth/, middleware/, guards/, decorators |
| Controllers / routes | Handler shapes and side effects behind each endpoint | Same backend entry: controllers, services |
| Package dependencies | External SDKs at the API boundary (Stripe, Auth0, Resend, S3, etc.) | Read `package.json`, `requirements.txt`, `Gemfile` |
| Env / config (examples only) | Auth provider config, integration endpoints, webhook URLs | Read `.env.example` and config files; real secrets stay unread and undumped |
| Existing docs | Hand-written API notes, onboarding guides | `docs/`, the project's own API notes |
| Architecture and auth | auth flow, external services, environments, NFR budgets at the API boundary (rate limits, timeouts) | `bun run context:map infra-context` |
| Domain vocabulary | business terms, so endpoint groups are named the way the business names them | `bun run context:map business-domain-context` |

**Golden rule**: this is a narrative document. When OpenAPI already expresses a fact as a schema, link to it instead of restating it in prose.

---

## Mode detection

```
bun run context:map business-api-context --list
  → skill folder missing:   STOP. The skill is delivered by `bun sync`
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

Both context-file gates are soft: this mode produces value even in sparse repos, and missing inputs become Discovery Gaps.

- `business-data-context` map missing or placeholder: warn the user ("journeys will be weaker without entity context"), proceed, log the limitation in §Discovery Gaps.
- `business-e2e-context` map missing or placeholder: warn the user ("journey selection will rely on code scan alone"), proceed, log the limitation in §Discovery Gaps.
- No OpenAPI spec and no route-scannable backend: hard stop. Ask the user to expose a spec or run `bun run api:sync`; an API map needs one of the two.

---

## Discovery phases

### Phase 1: Permission and auth model

Identify tiers and how a caller reaches each one.
- What authentication schemes exist? (JWT, session cookie, API key, OAuth: each is its own tier, not a generic "Protected")
- How does a user obtain a token? (login endpoint, SSO flow, refresh recipe)
- What roles, scopes or claims gate higher tiers? (admin, owner, tenant-scoped)
- Where does validation live? (middleware, guard, decorator, edge function)

**Outcome**: a taxonomy (Public / Authenticated / Role-based / Owner-scoped) anchored to concrete code paths. Endpoints per tier belong to the feature map, not here.

### Phase 2: Critical business journeys

Select 3 to 7 journeys that matter most to the business. Prioritize by:
- Revenue impact (checkout, billing, subscription)
- Security (auth, password reset, permission changes, impersonation)
- Core user value (the primary product flow)
- High blast radius on failure (fund transfers, data exports, bulk operations)

For each selected journey, trace the chain: `Client → Auth → Handler → Services → DB / External → Response`. Reference feature-map FEAT-IDs and data-map entities where possible. Take journeys from the existing context first; an invented one has no source.

### Phase 3: Architecture behind the API

One layer of depth, not exhaustive:
- What services sit behind the API? (monolith module, microservice, background worker)
- What persistence does it touch? (primary DB, cache, queue, object storage)
- What deployment shape? (serverless function, container, edge worker, lambda)

### Phase 4: External integrations at the API boundary

For each third-party service reached from the API:
- What triggers the call? (endpoint, webhook inbound, webhook outbound, background job)
- What is the failure mode visible to the user? (timeout, silent failure, queued retry, hard error)
- Which critical journeys depend on it?

Pull from feature-map §Third-party integrations if available; enrich with the failure-mode column it omits.

### Phase 5: Cross-reference with data-map and feature-map

Validate coherence without duplicating content:
- Every journey touches entities that exist in data-map: flag orphans.
- Every journey maps to features in feature-map: flag API-only paths not caught as features.
- Every integration listed in feature-map that reaches the API boundary appears here, and the reverse.

---

## Output structure

Write the map as flat `<section>`s with stable ids (`overview`, `auth-model`, `journey-<slug>`, `architecture`, `integrations`, `cross-references`, `discovery-gaps`), each with its `data-sources` and `data-updated` date (anatomy: `business-context-maps.md` §2). Figures are diagram-design SVG inside `<figure data-diagram>`: sequence for a journey, architecture for §4. Every fact a figure shows is also in the text. Content, section by section:

### 1. Executive summary

2 to 3 paragraphs answering what this API lets the business do. Frame it from the user's perspective ("authenticated buyers complete a purchase in four calls", not "the API exposes 47 endpoints"), with no counts and no endpoint lists.

### 2. Permission and auth model

- Tier table: `Tier | Who it applies to | How to acquire | Where enforced (code path)`.
- A sequence figure of the token flow for the primary auth scheme (login, token, subsequent call, refresh).
- If multiple schemes coexist (JWT + API key + session cookie), one diagram per scheme.

Per-endpoint listings stay out of this section.

### 3. Critical business journeys

One sub-section per journey:
- Name and one-sentence business purpose.
- A sequence figure: `Client → Middleware → Handler → DB / External → Response`.
- Numbered narrative (1..N) with the why at each step.
- **Endpoints involved**: list of `METHOD /path` pointers (not full specs: link to OpenAPI).
- **Entities touched**: pointers to `business-data-context` section ids.
- **Feature IDs**: pointers to `business-e2e-context` feature section ids.

Cap at 7 journeys by default. If the system has more critical flows, record the cap decision in §Discovery Gaps instead of expanding silently.

### 4. Architecture behind the API

- One architecture figure: `Client → API Gateway / Edge → Handlers → Services → Persistence / External`.
- Table: `Component | Role | Persistence/Integrations touched | Why it matters for QA`.

One diagram for the whole system, not one per journey.

### 5. External integrations

```markdown
| Service | Trigger | Direction | Failure mode (user-visible) | Journeys affected |
|---------|---------|-----------|-----------------------------|-------------------|
| Stripe  | POST /checkout | Outbound sync | 5xx → order stuck in `pending` | Checkout |
| Stripe  | webhook /stripe/events | Inbound async | missed event → order never finalizes | Checkout |
```

### 6. Cross-references

- Entities this API exposes: `business-data-context` section ids.
- Features this API backs: `business-e2e-context` section ids.
- OpenAPI spec location (file path or URL) for full endpoint specs.
- `bun run api:sync` output path (`api/schemas/`) for TypeScript types.

### 7. Discovery gaps

Mandatory. List anything you could not verify:
- Auth schemes observed in code but missing from middleware (or the reverse).
- Journeys that could not be traced end-to-end (dead branches, missing evidence).
- Integrations mentioned in env but with no code calls (planned, dead, or undocumented?).
- Monorepo shards not inspected.
- Webhooks configured in external dashboards but not discoverable from code.

---

## After generation

- Verify: `bun run context:map business-api-context --list` prints every section, with the run's date on the ones written, and no placeholder notice.
- If the data or e2e map was missing or a placeholder during generation, note the limitation in the summary you report back to the user.
- Every section built from the contract carries `openapi:<tag or path>` in `data-sources`: that is how a later run detects staleness per section.
- In UPDATE mode: show the section-level diff and wait for explicit confirmation before writing (nobody present: `../SKILL.md`, `## With nobody at the keyboard`).
- Report: auth tiers documented, journeys traced, services behind the API, integrations mapped, sections regenerated vs untouched, discovery gaps.
- The map just changed: review `business-api-context`'s `## Rules` and `references/gotchas.md` against it. A rule the new map contradicts is proposed for the gotchas' "No longer true" section, never deleted.

---

## What is NOT in this plan

This mode narrates the business-level API story. Everything below has an owner; if the user asks for it inside the API map, point to the owner and keep the map short, narrative and business-first.

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
