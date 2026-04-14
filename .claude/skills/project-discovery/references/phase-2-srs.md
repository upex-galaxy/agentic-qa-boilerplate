# Phase 2 — SRS Discovery

> Read this when producing any of the four SRS artifacts: `architecture.md`, `api-contracts.md`, `functional-specs.md`, `non-functional-specs.md`. Phase 2 SRS runs after Phase 1 (project-config, domain-glossary) and in parallel with Phase 2 PRD.

---

## SRS output structure

All SRS outputs land under `.context/SRS/` and are overwritten on re-run (never appended):

| File | Purpose |
|------|---------|
| `.context/SRS/architecture.md` | System components, data flow, DB schema, external services. C4 + ER diagrams. |
| `.context/SRS/api-contracts.md` | Endpoint inventory with request/response shapes, auth requirements. |
| `.context/SRS/functional-specs.md` | FR-NNN entries derived from services/validators/state machines. |
| `.context/SRS/non-functional-specs.md` | NFR entries for performance, security, reliability, scalability, observability. |

Every artifact MUST include a `## Discovery Gaps` section listing unverified claims. Never invent numbers.

---

## 1. Architecture specs

### Discovery process

1. **Component inventory** — map the folder structure to architectural roles:
   - `ls -la <repo>/src/` then drill into `app/`, `pages/`, `components/`, `services/`, `controllers/`, `repositories/`, `modules/`, `features/`.
   - Identify pattern: MVC, Clean/Hexagonal, Feature-based, Modular monolith.
   - Trace imports with grep to confirm dependency direction.

2. **Database schema** — prefer live schema over ORM definitions (ORMs drift):
   - If `[DB_TOOL]` is configured: query `information_schema.tables` and `information_schema.columns` for the target schema (usually `public`).
   - Fallback: read `prisma/schema.prisma`, `src/entities/*.ts` (TypeORM), `src/db/schema.ts` (Drizzle), or raw `schema.sql` / `migrations/`.
   - Capture: tables, primary keys, foreign keys, enum columns, unique constraints, indexes.

3. **External services** — two signals:
   - `.env.example` keys that are NOT framework-owned (not `NODE_ENV`, `DATABASE_URL`, `NEXTAUTH_SECRET`).
   - `grep -r "process\.env\." src/` to see which env vars code actually reads.
   - Client instantiations: `grep -r "new .*Client\|createClient\|\.initialize" src/`.

4. **Security architecture** — auth method (session / JWT / OAuth), password storage (bcrypt/argon2), session lifetime, TLS posture, secret handling, data-at-rest encryption.

### Required sections in `.context/SRS/architecture.md`

- System Overview (pattern, tech stack table)
- C4 Context diagram (Mermaid)
- C4 Container diagram (Mermaid)
- Component Structure (directory layout + responsibility table)
- Database Schema (ER diagram + table detail table + indexes)
- Data Flow (request sequence + auth sequence)
- External Services (dependency table + integration points)
- Security Architecture (authN / authZ / data protection)
- Performance hooks (caching layers, rate limits discovered)
- Discovery Gaps
- QA Relevance (components to test, environment requirements)

### Diagram conventions

- Use `C4Context`, `C4Container`, `erDiagram`, `sequenceDiagram` from Mermaid.
- Keep C4 diagrams to one screenful; split by subsystem if the whole app won't fit.
- ER diagrams: show only FK relationships and primary columns; full column lists belong in the table detail section.

---

## 2. API contracts

### Discovery process

1. **Check for an OpenAPI source first** (authoritative, saves hours):
   - Files: `openapi.yaml`, `openapi.json`, `swagger.yaml`, `swagger.json`, `api-spec.*`.
   - Generator signals in `package.json`: `swagger-jsdoc`, `@nestjs/swagger`, `fastify-swagger`, `zod-to-openapi`, `drf-spectacular` (Python).
   - Runtime endpoint: try `/api/docs`, `/swagger`, `/openapi.json`, `/api-docs/openapi.json` via `[API_TOOL]`.
   - If present: parse it, then spot-check 3-5 endpoints against the code to confirm it is current.

2. **Endpoint inventory from code** (if no OpenAPI or the spec is stale):
   - Next.js App Router: `find src/app/api -name "route.ts"` then grep `export.*GET\|POST\|PUT\|DELETE\|PATCH`.
   - Next.js Pages Router: `src/pages/api/**/*.ts`, default export handles method via `req.method`.
   - Express/Fastify: grep `app\.\(get\|post\|put\|delete\|patch\)` or `router\.(...)` across `src/routes/`.
   - NestJS: grep `@Get\|@Post\|@Put\|@Delete\|@Patch` decorators plus controller `@Controller()` prefixes.
   - FastAPI: grep `@app\.\(get\|post\|...\)\|@router\.\(...\)`; collect path + function name.
   - Django REST: `urls.py` path entries + view classes.
   - Dynamic segments: `find src/app/api -type d -name "[[]*[]]"` for Next.js; `:param` for Express; `{param}` for FastAPI.

3. **Request schemas** — the validators ARE the spec:
   - Zod: `grep -r "z\.object\|z\.string\|z\.number" src/schemas/ src/validators/`.
   - Yup: `grep -r "yup\.\|Yup\." src/`.
   - Pydantic: `grep -r "BaseModel\|Field(" src/`.
   - class-validator (NestJS): DTO classes with `@IsString`, `@IsEmail`, etc.
   - Capture exact rule literals (min length, regex, enum values) — they become test data.

4. **Response schemas** — extract from return statements and TypeScript return types:
   - Next.js: `NextResponse.json(...)`, `Response.json(...)`.
   - Express: `res.json(...)`, `res.status(...).json(...)`.
   - NestJS: `@ApiResponse` decorators or return types of controller methods.
   - Error shape: every `throw new` / `catch` block reveals an error path and status code.

5. **Auth requirements per endpoint**:
   - Middleware: `middleware.ts` (Next.js), `app.use(...)` (Express), `@UseGuards(...)` (NestJS), route-level decorators.
   - Session source: `getServerSession`, `auth()`, `req.user`, `passport.authenticate(...)`.
   - Role gates: `grep -r "role ===\|hasRole\|isAdmin\|req\.user\.role"`.
   - Classify each endpoint: Public / Authenticated / Owner-only / Admin-only.

### Required sections in `.context/SRS/api-contracts.md`

- API Overview (base URLs per env, common headers, auth method)
- Endpoints by Resource — grouped by domain (`/api/auth/*`, `/api/users/*`, etc.)
- Per endpoint: method + path, auth requirement, path params, query params, request body + validation schema, response table (status / description / body), success example, error examples, evidence path (`src/app/api/...`).
- Common Types (User, Pagination, ErrorResponse, etc.)
- Error Codes table (code, HTTP status, description)
- Rate Limiting table (pattern, limit, window)
- Webhooks (if any) — endpoint, verification method, events handled
- Discovery Gaps
- QA Relevance (suggested contract tests, test-data requirements)

### Endpoint entry template

```markdown
#### [METHOD] `/api/[resource]/[path]`

[One-line description.]

**Authentication:** [None | Required | Role: admin]

**Path Parameters:** (if any)
| Param | Type | Description |
|-------|------|-------------|

**Query Parameters:** (if any)
| Param | Type | Default | Description |
|-------|------|---------|-------------|

**Request Body:**
```typescript
{ field: type; // constraints }
```

**Validation Schema:** (Zod/Yup/Pydantic snippet)

**Response:**
| Status | Description | Body |
|--------|-------------|------|
| 200    |             |      |
| 4xx    |             |      |

**Evidence:** `<path to source file>`
```

---

## 3. Functional specs

### Discovery process

1. **Service-layer analysis** — service methods are functional requirements:
   - Find services: `find src -name "*.service.ts" -o -name "*Service.ts"`, or `src/services/`, `src/lib/services/`.
   - Extract public methods: `grep -r "async \|export function\|public " --include="*.service.ts"`.
   - Map service -> API handler -> feature.

2. **Validation rules** — pull literal constraints from schemas:
   - Zod schemas: rule-per-line (`.min(8)`, `.regex(...)`, `.email()`, `.max(...)`).
   - Custom validators: `grep -r "validate\|isValid\|check" src/services/ src/lib/`.
   - DB constraints: `CHECK`, `UNIQUE`, `NOT NULL`, enum columns in migrations / schema.
   - Each constraint is a test case (boundary values + happy path + error path).

3. **State machines** — where workflows live:
   - Enum definitions: `grep -r "enum .*Status\|enum .*State\|type .*Status" src/types/`.
   - Transition logic: `grep -r "status\s*=\s*\|setState\|updateStatus\|transitionTo"` in service files.
   - DB-level: enum columns, trigger functions, check constraints on status transitions.
   - Diagram with `stateDiagram-v2` (Mermaid) — one diagram per entity with a non-trivial state machine.

4. **Edge cases** — every `throw` is a scenario:
   - `grep -r "throw new .*Error\|throw .*Error" src/services/`.
   - Conditional branches: `grep -r "if .*&&\|if .*||" src/services/ | head -30`.
   - Existing tests: `grep -r "it(\|test(\|describe(" src/` — test names reveal scenarios the team already cares about.

### Required sections in `.context/SRS/functional-specs.md`

- Specification Index (FR-NNN ID, feature, category, priority)
- Per FR: Overview table (feature, related PRD section, service/method, evidence path), Functional Requirement (one sentence), Input Specification (field table), Validation Rules (code snippet from schema), Processing Logic (numbered steps + code evidence), Output Specification (success + error responses), Business Rules (BR-NNN table), Edge Cases table
- State Machines section (Mermaid `stateDiagram-v2` per entity + transition table with From/To/Trigger/Guard/Side Effects)
- Business Rules Summary (cross-FR consolidation)
- Validation Rules Catalog (per entity: field / rules / error message)
- Discovery Gaps
- QA Relevance (test case derivation from each FR, boundary value analysis)

### FR numbering

- `FR-001`, `FR-002`, ... sequentially across the whole spec.
- `BR-001`, `BR-002`, ... for business rules (cross-referenced from FRs).
- Preserve IDs across regenerations if possible — downstream tests may reference them.

---

## 4. Non-functional specs

### Discovery process

1. **Performance**:
   - Caching: `grep -r "cache\|redis\|memo" src/`; Next.js `revalidate`, `cache:` options.
   - Timeouts/limits: `grep -r "timeout\|limit\|rateLimit" src/`.
   - DB query shape: `select`, `include`, `take`, `skip` patterns; pagination strategy; N+1 hot spots.
   - Connection pool size: check ORM config (`src/lib/db.ts`, Prisma `DATABASE_URL` pool params, `DATABASE_POOL_SIZE`).

2. **Security**:
   - Auth mechanism: see Architecture section.
   - Headers: `next.config.js` `headers()` function, Helmet config, CSP strings.
   - Input sanitization: `sanitize-html`, `xss`, `DOMPurify`, `validator` usage.
   - Secret handling: `.env` pattern, secret managers (Vercel env, AWS Secrets Manager, Doppler).
   - Package signals: grep `package.json` for `helmet`, `xss`, `csrf`, `bcrypt`, `argon2`.

3. **Reliability**:
   - Error boundaries: `error.tsx` (Next.js App Router), `ErrorBoundary` components.
   - Retry logic: `grep -r "retry\|Retry\|attempt" src/`; look for exponential backoff.
   - Health endpoints: `find src -name "*health*" -o -name "*ready*"`.
   - Logging stack: `winston`, `pino`, `bunyan`, console patterns.
   - External-call resilience: circuit breakers, timeouts around fetch/axios.

4. **Scalability**:
   - Stateless design: no in-memory state, sessions in Redis / JWT / DB.
   - Async processing: queues (`bullmq`, `pg-boss`, `celery`, `sidekiq`), workers, cron handlers.
   - DB scaling: connection pooling, read replicas, sharding (rare).
   - Deployment model: serverless (Vercel / Lambda) vs long-running (Node/Docker) affects scaling assumptions.

5. **Observability**:
   - APM: `@sentry/*`, `@datadog/*`, `newrelic`, `@opentelemetry/*`.
   - Metrics: `prom-client`, custom counters/gauges/histograms.
   - Tracing: OpenTelemetry spans, `trace`, `span` usage.
   - Log shipping: `pino-pretty`, log drains in hosting platform config.

### Required sections in `.context/SRS/non-functional-specs.md`

- NFR Summary (category / implemented / maturity)
- 1. Performance — NFR-PERF-NNN entries (response time, rate limiting, DB optimization, caching)
- 2. Security — NFR-SEC-NNN entries (authN, authZ, headers, input validation, data protection)
- 3. Reliability — NFR-REL-NNN entries (error handling, health checks, retry strategy, graceful degradation)
- 4. Scalability — NFR-SCALE-NNN entries (stateless, DB scaling, async processing, horizontal scaling)
- 5. Observability — NFR-OBS-NNN entries (logging, monitoring, metrics, alerting)
- Compliance (GDPR / SOC2 / HIPAA / PCI-DSS — mark as "Needs Review" if not verifiable)
- Discovery Gaps
- QA Relevance (which NFRs are testable, suggested tools: k6, Artillery, OWASP ZAP)

### NFR entry template

```markdown
### NFR-<CATEGORY>-NNN: <Title>

| Aspect | Value |
|--------|-------|
| **Target** | <measurable or inferred> |
| **Implementation** | <how it is done> |
| **Evidence** | <path:line-range> |

<Details, tables, code snippets as needed>
```

---

## Gotchas

- **Missing OpenAPI is common.** Most repos either lack a spec or have a stale one. Never trust OpenAPI without spot-checking 3-5 endpoints against code. If stale, flag it and generate api-contracts from code anyway.
- **Undocumented internal endpoints.** Admin-only routes, cron handlers, webhook receivers, feature-flag toggles often sit outside the public API surface. Search for `/admin/`, `/internal/`, `/webhook/`, `/cron/` path prefixes.
- **Auth patterns that resist automation.** OAuth with third-party redirects, CAPTCHA-gated login, device-fingerprint MFA — document these and flag them as "needs manual setup" rather than pretending they can be E2E-tested.
- **Validation drift.** Frontend may have its own Zod schemas that differ from backend schemas. Document both and treat the backend as canonical; note the drift.
- **State machines hidden in DB triggers.** Postgres row-level security policies and trigger functions can block state transitions that look legal in code. Check `pg_trigger` and `pg_policies` via `[DB_TOOL]` if the app uses them.
- **Rate limits you cannot verify.** If middleware config references an external service (Upstash, Redis), you may only see "rateLimit = true" without the actual numbers. Record what you can see and list the gap.
- **NFR numbers must be evidenced or flagged.** "P95 < 500ms" with no load test evidence is a Discovery Gap, not a spec. Prefer "Target: [unknown] — inferred from `timeout: 30000` config" over inventing a number.
- **Security posture is never "complete".** A codebase without Helmet is not a failing grade — it's "Helmet not present, CSP not configured — recommend security review". Avoid pass/fail framing.
- **Do not scrape secrets.** If you stumble onto hard-coded keys in the source, do NOT paste them into the SRS. Document "hard-coded secret detected at `<path>`" as a security finding.
- **Paginate entity lists.** For large schemas (50+ tables) split the ER diagram into subsystem-level diagrams. One giant diagram is unreadable.

---

## Deliverables checklist

Before the Phase 2 SRS completion gate, verify:

- [ ] `.context/SRS/architecture.md` exists with C4 context, C4 container, ER diagram, component table, external services table, security section, Discovery Gaps.
- [ ] `.context/SRS/api-contracts.md` exists with at least one endpoint per major resource, auth classification per endpoint, evidence paths, Discovery Gaps.
- [ ] `.context/SRS/functional-specs.md` exists with FR entries covering the top-5 critical flows, at least one state machine diagram, BR summary, Discovery Gaps.
- [ ] `.context/SRS/non-functional-specs.md` exists with all five NFR categories populated (even if several are "Not implemented — recommend adding"), Discovery Gaps.
- [ ] Every numerical claim (response time, cache TTL, rate limit) has an evidence path or appears under Discovery Gaps.
- [ ] No `.env` secrets, no hard-coded credentials, no AI-attribution lines in any file.
- [ ] User confirms "Phase 2 complete" before Phase 3 begins.
