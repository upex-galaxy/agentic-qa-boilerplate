# SRS: Non-Functional Specs Discovery

> **Phase**: 2 - Architecture
> **Objective**: Identify and document non-functional requirements from existing implementation

---

## 📥 Input Required

### From Previous Prompts:

- `.context/SRS/architecture-specs.md` (infrastructure)
- `.context/project-config.md` (tech stack)

### From Discovery Sources:

| Information | Primary Source          | Fallback              |
| ----------- | ----------------------- | --------------------- |
| Performance | Load tests, configs     | Timeouts, caching     |
| Security    | Auth, middleware        | Env vars, headers     |
| Reliability | Error handling, retries | Logging, monitoring   |
| Scalability | Infrastructure config   | Architecture patterns |

---

## 🎯 Objective

Document non-functional requirements by identifying:

1. Performance characteristics (implemented)
2. Security measures (in place)
3. Reliability patterns (used)
4. Scalability approach (designed)
5. Observability setup (configured)

---

## 🔍 Discovery Process

### Step 1: Performance Discovery

**Actions:**

1. Find caching implementations:

   ```bash
   # Caching patterns
   grep -r "cache\|Cache\|redis\|memo" --include="*.ts" src/

   # Next.js caching
   grep -r "revalidate\|cache:" --include="*.ts" src/app/
   ```

2. Check timeouts and limits:

   ```bash
   # Timeout configurations
   grep -r "timeout\|Timeout\|limit\|Limit" --include="*.ts" src/

   # Rate limiting
   grep -r "rate.*limit\|rateLimit" --include="*.ts" src/middleware/
   ```

3. Analyze database queries:
   ```bash
   # Query optimization hints
   grep -r "select\|include\|take\|skip" --include="*.ts" src/services/
   ```

**Output:**

- Caching strategy
- Timeout values
- Rate limits
- Query patterns

### Step 2: Security Discovery

**Actions:**

1. Authentication mechanisms:

   ```bash
   # Auth implementation
   grep -r "auth\|Auth\|session\|Session\|token\|Token" --include="*.ts" src/lib/ src/middleware/
   ```

2. Security headers:

   ```bash
   # Headers configuration
   cat next.config.js next.config.mjs 2>/dev/null | grep -A20 "headers"

   # CSP, CORS
   grep -r "Content-Security-Policy\|cors\|CORS" --include="*.ts" src/
   ```

3. Input validation:

   ```bash
   # Sanitization
   grep -r "sanitize\|escape\|encode" --include="*.ts" src/
   ```

4. Check for security packages:
   ```bash
   grep -E "helmet|xss|csrf|sanitize|bcrypt|argon" package.json
   ```

**Output:**

- Auth mechanisms
- Security headers
- Input handling
- Encryption used

### Step 3: Reliability Discovery

**Actions:**

1. Error handling patterns:

   ```bash
   # Error boundaries, handlers
   grep -r "ErrorBoundary\|catch\|finally" --include="*.tsx" --include="*.ts" src/

   # Retry logic
   grep -r "retry\|Retry\|attempt" --include="*.ts" src/
   ```

2. Health checks:

   ```bash
   # Health endpoints
   find src/app/api -name "*health*" -o -name "*ready*"
   ```

3. Logging setup:
   ```bash
   # Logging
   grep -r "console\.\|logger\|log\." --include="*.ts" src/ | head -20
   ```

**Output:**

- Error handling strategy
- Retry mechanisms
- Health check endpoints
- Logging approach

### Step 4: Scalability Discovery

**Actions:**

1. Architecture patterns:

   ```bash
   # Stateless patterns
   grep -r "stateless\|session.*store\|redis" --include="*.ts" src/

   # Async processing
   grep -r "queue\|Queue\|job\|Job\|worker\|Worker" --include="*.ts" src/
   ```

2. Database scaling:

   ```bash
   # Connection pooling
   grep -r "pool\|Pool\|connection" --include="*.ts" src/lib/

   # Read replicas
   grep -r "replica\|Replica\|read.*connection" --include="*.ts" src/
   ```

**Output:**

- Stateless design
- Async processing
- Database scaling
- Horizontal scaling support

### Step 5: Observability Discovery

**Actions:**

1. Monitoring integration:

   ```bash
   # APM tools
   grep -r "sentry\|datadog\|newrelic\|prometheus" --include="*.ts" src/
   grep -E "sentry|datadog|newrelic|prom-client" package.json
   ```

2. Metrics collection:

   ```bash
   # Custom metrics
   grep -r "metric\|Metric\|counter\|gauge\|histogram" --include="*.ts" src/
   ```

3. Tracing:
   ```bash
   # Distributed tracing
   grep -r "trace\|Trace\|span\|Span\|opentelemetry" --include="*.ts" src/
   ```

**Output:**

- Monitoring tools
- Metrics collected
- Tracing setup
- Alerting configuration

---

## 📤 Output Generated

### Primary Output: `.context/SRS/non-functional-specs.md`

````markdown
# Non-Functional Specifications - [Product Name]

> **Discovered from**: Configs, middleware, infrastructure
> **Discovery Date**: [Date]
> **NFR Categories**: Performance, Security, Reliability, Scalability, Observability

---

## NFR Summary

| Category      | Implemented                   | Maturity |
| ------------- | ----------------------------- | -------- |
| Performance   | Caching, rate limiting        | Medium   |
| Security      | Auth, validation, headers     | High     |
| Reliability   | Error handling, health checks | Medium   |
| Scalability   | Stateless design              | Basic    |
| Observability | Logging, Sentry               | Medium   |

---

## 1. Performance

### NFR-PERF-001: Response Time

| Aspect             | Discovered Value         |
| ------------------ | ------------------------ |
| **Target**         | [Inferred from timeouts] |
| **Implementation** | [Caching, optimization]  |
| **Evidence**       | [Config file]            |

**Caching Strategy:**

| Cache Type  | Implementation | TTL  | Evidence           |
| ----------- | -------------- | ---- | ------------------ |
| Page cache  | Next.js ISR    | 60s  | `revalidate: 60`   |
| API cache   | Redis          | 5min | `src/lib/cache.ts` |
| Query cache | Prisma         | N/A  | Default            |
| CDN cache   | Vercel         | Auto | Headers config     |

**Code Evidence:**

```typescript
// src/app/products/page.tsx
export const revalidate = 60; // ISR: regenerate every 60s
```
````

### NFR-PERF-002: Rate Limiting

| Aspect             | Value                 |
| ------------------ | --------------------- |
| **Implementation** | [Library/Custom]      |
| **Limits**         | [Requests per window] |
| **Evidence**       | [Middleware file]     |

**Configuration:**

| Endpoint Pattern | Limit   | Window | Action       |
| ---------------- | ------- | ------ | ------------ |
| `/api/auth/*`    | 10 req  | 1 min  | 429 response |
| `/api/*`         | 100 req | 1 min  | 429 response |
| Public           | 20 req  | 1 min  | 429 response |

**Evidence:** `src/middleware.ts:45-67`

### NFR-PERF-003: Database Optimization

| Technique          | Implementation  | Evidence               |
| ------------------ | --------------- | ---------------------- |
| Indexing           | [Indexes found] | `prisma/schema.prisma` |
| Connection pool    | [Pool size]     | `src/lib/db.ts`        |
| Query optimization | [Patterns]      | Service files          |

---

## 2. Security

### NFR-SEC-001: Authentication

| Aspect               | Implementation        |
| -------------------- | --------------------- |
| **Method**           | [Session-based / JWT] |
| **Provider**         | [NextAuth / Custom]   |
| **Password Storage** | bcrypt (12 rounds)    |
| **Session Duration** | [Value]               |

**Configuration:**

```typescript
// src/lib/auth.ts
export const authOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }, // 30 days
  // ...
};
```

### NFR-SEC-002: Authorization

| Level | Implementation | Evidence        |
| ----- | -------------- | --------------- |
| Route | Middleware     | `middleware.ts` |
| API   | Role checks    | Route handlers  |
| Data  | [RLS/Custom]   | [Evidence]      |

**Role Matrix:**

| Role  | Create | Read      | Update | Delete |
| ----- | ------ | --------- | ------ | ------ |
| admin | ✅ All | ✅ All    | ✅ All | ✅ All |
| user  | ✅ Own | ✅ Own    | ✅ Own | ✅ Own |
| guest | ❌     | ✅ Public | ❌     | ❌     |

### NFR-SEC-003: Security Headers

| Header                      | Value   | Evidence         |
| --------------------------- | ------- | ---------------- |
| `Content-Security-Policy`   | [Value] | `next.config.js` |
| `X-Frame-Options`           | DENY    | `next.config.js` |
| `X-Content-Type-Options`    | nosniff | `next.config.js` |
| `Strict-Transport-Security` | [Value] | `next.config.js` |

### NFR-SEC-004: Input Validation

| Layer    | Implementation | Evidence        |
| -------- | -------------- | --------------- |
| Client   | Zod schemas    | Form components |
| Server   | Zod validation | API routes      |
| Database | Constraints    | Prisma schema   |

### NFR-SEC-005: Data Protection

| Data Type | Protection          | Evidence             |
| --------- | ------------------- | -------------------- |
| Passwords | bcrypt hash         | `auth.service.ts`    |
| Tokens    | Secure random       | `crypto.randomBytes` |
| PII       | [Encryption status] | [Evidence]           |
| Secrets   | Env variables       | `.env` pattern       |

---

## 3. Reliability

### NFR-REL-001: Error Handling

| Level          | Implementation     | Evidence      |
| -------------- | ------------------ | ------------- |
| Global         | Error boundary     | `error.tsx`   |
| API            | Try-catch handlers | Route files   |
| External calls | Retry logic        | Service files |

**Error Boundary:**

```typescript
// src/app/error.tsx
export default function Error({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  // ...
}
```

### NFR-REL-002: Health Checks

| Endpoint            | Checks         | Response              |
| ------------------- | -------------- | --------------------- |
| `/api/health`       | App running    | `{ status: "ok" }`    |
| `/api/health/ready` | DB connection  | `{ db: "connected" }` |
| `/api/health/live`  | Basic liveness | `200 OK`              |

### NFR-REL-003: Retry Strategy

| Operation          | Retries | Backoff     | Evidence            |
| ------------------ | ------- | ----------- | ------------------- |
| External API calls | 3       | Exponential | `src/lib/fetch.ts`  |
| Email sending      | 2       | Fixed       | `email.service.ts`  |
| Payment processing | 0       | N/A         | Critical - no retry |

### NFR-REL-004: Graceful Degradation

| Feature         | Fallback      | Evidence            |
| --------------- | ------------- | ------------------- |
| Analytics       | Skip silently | Try-catch           |
| External images | Placeholder   | `onError` handler   |
| Cache miss      | Direct query  | Cache-aside pattern |

---

## 4. Scalability

### NFR-SCALE-001: Stateless Design

| Component    | Stateless | Evidence           |
| ------------ | --------- | ------------------ |
| API routes   | ✅ Yes    | No in-memory state |
| Sessions     | ✅ Yes    | JWT / Redis        |
| File uploads | ✅ Yes    | S3/R2 storage      |

### NFR-SCALE-002: Database Scaling

| Technique          | Implemented | Evidence      |
| ------------------ | ----------- | ------------- |
| Connection pooling | ✅ Yes      | Prisma config |
| Read replicas      | [Status]    | [Evidence]    |
| Sharding           | ❌ No       | N/A           |

### NFR-SCALE-003: Async Processing

| Task Type         | Implementation | Evidence   |
| ----------------- | -------------- | ---------- |
| Email sending     | [Sync/Async]   | [Evidence] |
| Heavy computation | [Queue/Sync]   | [Evidence] |
| File processing   | [Queue/Sync]   | [Evidence] |

### NFR-SCALE-004: Horizontal Scaling

| Aspect          | Ready    | Limitation       |
| --------------- | -------- | ---------------- |
| API servers     | ✅ Yes   | Stateless design |
| Background jobs | [Status] | [Limitation]     |
| Database        | [Status] | [Limitation]     |

---

## 5. Observability

### NFR-OBS-001: Logging

| Level       | Implementation   | Evidence            |
| ----------- | ---------------- | ------------------- |
| Application | [Logger used]    | `src/lib/logger.ts` |
| Request     | [Middleware]     | Access logs         |
| Error       | [Error tracking] | Sentry integration  |

**Log Levels:**

| Level | Usage       | Example           |
| ----- | ----------- | ----------------- |
| ERROR | Exceptions  | Failed operations |
| WARN  | Anomalies   | Rate limit near   |
| INFO  | Events      | User actions      |
| DEBUG | Development | Query details     |

### NFR-OBS-002: Monitoring

| Tool          | Purpose        | Evidence         |
| ------------- | -------------- | ---------------- |
| Sentry        | Error tracking | `@sentry/nextjs` |
| [APM tool]    | Performance    | [Package]        |
| [Uptime tool] | Availability   | [Config]         |

**Sentry Configuration:**

```typescript
// sentry.client.config.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // ...
});
```

### NFR-OBS-003: Metrics

| Metric        | Type      | Collection |
| ------------- | --------- | ---------- |
| Request count | Counter   | [Method]   |
| Response time | Histogram | [Method]   |
| Error rate    | Gauge     | [Method]   |
| Active users  | Gauge     | [Method]   |

### NFR-OBS-004: Alerting

| Alert        | Condition         | Channel       |
| ------------ | ----------------- | ------------- |
| Error spike  | >10 errors/min    | [Slack/Email] |
| High latency | P95 >2s           | [Slack/Email] |
| Downtime     | Health check fail | [PagerDuty]   |

---

## Compliance Considerations

| Requirement | Status   | Evidence           |
| ----------- | -------- | ------------------ |
| GDPR        | [Status] | [Features]         |
| SOC2        | [Status] | [Features]         |
| HIPAA       | [Status] | [Features]         |
| PCI-DSS     | [Status] | [Payment handling] |

---

## Discovery Gaps

| Gap                   | Impact                  | Resolution       |
| --------------------- | ----------------------- | ---------------- |
| Performance baselines | No benchmark            | Run load tests   |
| Full security audit   | Unknown vulnerabilities | Security review  |
| SLA definitions       | Unclear expectations    | Define with team |

---

## QA Relevance

### NFR Test Types

| Category    | Test Type           | Tools               |
| ----------- | ------------------- | ------------------- |
| Performance | Load testing        | k6, Artillery       |
| Security    | Penetration testing | OWASP ZAP           |
| Reliability | Chaos testing       | Manual/Chaos Monkey |
| Scalability | Stress testing      | k6                  |

### NFR Test Scenarios

| NFR      | Scenario             | Expected        |
| -------- | -------------------- | --------------- |
| PERF-001 | 100 concurrent users | Response <500ms |
| PERF-002 | Exceed rate limit    | 429 response    |
| SEC-001  | SQL injection        | Blocked         |
| SEC-003  | Missing auth header  | 401 response    |
| REL-001  | DB connection lost   | Graceful error  |

### Monitoring Checklist for Testing

- [ ] Verify error tracking works (Sentry)
- [ ] Confirm logs are generated
- [ ] Check health endpoints
- [ ] Validate rate limiting
- [ ] Test auth flows under load

````

### Update CLAUDE.md:

```markdown
## Phase 2 Progress - SRS
- [x] srs-architecture-specs.md ✅
- [x] srs-api-contracts.md ✅
- [x] srs-functional-specs.md ✅
- [x] srs-non-functional-specs.md ✅
  - NFR categories: 5
  - Security measures: [count]
  - Monitoring: [tools]
````

---

## 🔗 Next Prompt

| Condition          | Next Prompt                       |
| ------------------ | --------------------------------- |
| NFRs documented    | `discovery/phase-3-infrastructure/README.md` |
| Missing monitoring | Recommend setup                   |
| Security gaps      | Flag for review                   |

---

## Tips

1. **Configs reveal NFRs** - next.config.js, middleware have the answers
2. **Package.json shows tools** - Security and monitoring packages
3. **Error handling = Reliability** - How errors are caught matters
4. **Environment vars = Secrets handling** - Check .env.example
