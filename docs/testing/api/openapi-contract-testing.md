# OpenAPI with Zod: Complete Guide for API Contract Testing

> A didactic guide on OpenAPI, zod-to-openapi, and how to use them for API testing in TypeScript/Next.js projects.

---

## Table of Contents

1. [What is OpenAPI?](#what-is-openapi)
2. [Why Zod + OpenAPI?](#why-zod--openapi)
3. [Solution Architecture](#solution-architecture)
4. [TypeScript Types for Testing](#typescript-types-for-testing)
5. [Testing in Separate Repositories](#testing-in-separate-repositories)
6. [Recommended Workflow](#recommended-workflow)
7. [Frequently Asked Questions](#frequently-asked-questions)

---

## What is OpenAPI?

OpenAPI (formerly known as Swagger) is a **standard specification** for describing REST APIs in a machine and human-readable way.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WHAT IS OPENAPI?                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   OpenAPI is like a "contract" that describes your API:                     │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      openapi.json                                   │   │
│   │                                                                     │   │
│   │   • Available endpoints (/api/checkout/session, etc.)              │   │
│   │   • HTTP methods (GET, POST, PATCH, DELETE)                        │   │
│   │   • Required and optional parameters                               │   │
│   │   • Request body structure                                         │   │
│   │   • Response body structure                                        │   │
│   │   • Possible error codes                                           │   │
│   │   • Required authentication                                        │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   BENEFITS:                                                                 │
│   ✅ Always up-to-date documentation                                        │
│   ✅ Automatic client (SDKs) generation                                     │
│   ✅ Request/response validation                                            │
│   ✅ Automated testing based on spec                                        │
│   ✅ Interoperability with tools (Postman, MCP, etc.)                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### OpenAPI Spec Example

```yaml
openapi: 3.0.3
info:
  title: My API
  version: 1.0.0

paths:
  /api/checkout/session:
    post:
      summary: Create checkout session
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                booking_id:
                  type: string
                  format: uuid
              required: [booking_id]
      responses:
        200:
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  checkout_url:
                    type: string
                  session_id:
                    type: string
```

---

## Why Zod + OpenAPI?

The traditional problem is that API documentation gets out of sync with code:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROBLEM: MANUAL DOCUMENTATION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   TRADITIONAL FLOW (❌ Error-prone):                                        │
│                                                                             │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐  │
│   │   Code       │      │  Manually    │      │   openapi.yaml           │  │
│   │   route.ts   │ ──── │  write       │ ───► │   (gets outdated!)       │  │
│   └──────────────┘      └──────────────┘      └──────────────────────────┘  │
│                                                                             │
│   • Developer changes code                                                  │
│   • Forgets to update documentation                                        │
│   • QA tests with incorrect spec                                           │
│   • Production errors 💥                                                    │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   FLOW WITH ZOD-TO-OPENAPI (✅ Always synchronized):                        │
│                                                                             │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐  │
│   │  Zod Schema  │      │  Automatic   │      │   OpenAPI Spec           │  │
│   │  (code)      │ ───► │  generation  │ ───► │   (always correct!)      │  │
│   └──────────────┘      └──────────────┘      └──────────────────────────┘  │
│         │                                                                   │
│         │                                                                   │
│         ▼                                                                   │
│   ┌──────────────┐                                                          │
│   │  TypeScript  │  ← Same schema generates TYPES and DOCUMENTATION        │
│   │  Types       │                                                          │
│   └──────────────┘                                                          │
│                                                                             │
│   • Change the Zod schema                                                   │
│   • TypeScript types update automatically                                  │
│   • OpenAPI spec regenerates automatically                                 │
│   • QA always has correct documentation ✓                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Single Source of Truth

```typescript
// ✅ This Zod schema is the ONLY source of truth
const CreateCheckoutSessionSchema = z
  .object({
    booking_id: z.string().uuid(),
  })
  .openapi('CreateCheckoutSessionRequest');

// Automatically generates:
// 1. TypeScript type: type CreateCheckoutSessionRequest = { booking_id: string }
// 2. OpenAPI Schema: { type: 'object', properties: { booking_id: { type: 'string', format: 'uuid' } } }
// 3. Runtime validation: schema.parse(requestBody)
```

---

## Solution Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ZOD-TO-OPENAPI ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   src/lib/openapi/                                                          │
│   │                                                                         │
│   ├── registry.ts          ← Central OpenAPI configuration                 │
│   │   • Security (cookieAuth, apiKeyAuth)                                  │
│   │   • Metadata (title, version, description)                             │
│   │   • generateOpenAPIDocument() function                                 │
│   │                                                                         │
│   ├── schemas/                                                              │
│   │   ├── common.ts        ← Reusable types                                │
│   │   │   • UUIDSchema, TimestampSchema, ErrorResponseSchema               │
│   │   │                                                                     │
│   │   ├── checkout.ts      ← Schemas for /api/checkout/*                   │
│   │   │   • CreateCheckoutSessionRequestSchema                             │
│   │   │   • CreateCheckoutSessionResponseSchema                            │
│   │   │   • registry.registerPath(...)  ← Registers the endpoint           │
│   │   │                                                                     │
│   │   ├── bookings.ts      ← Schemas for /api/bookings/*                   │
│   │   ├── stripe.ts        ← Schemas for /api/stripe/*                     │
│   │   ├── mentors.ts       ← Schemas for /api/mentors/*                    │
│   │   ├── messages.ts      ← Schemas for /api/messages/*                   │
│   │   ├── users.ts         ← Schemas for /api/users/*                      │
│   │   ├── system.ts        ← Schemas for /api/cron/*, /api/email/*         │
│   │   │                                                                     │
│   │   └── index.ts         ← Exports all schemas                           │
│   │                                                                         │
│   └── index.ts             ← Main entry point                              │
│       • Imports all schemas                                                │
│       • Exports generateOpenAPIDocument()                                  │
│       • Exports all types                                                  │
│                                                                             │
│   src/app/api/openapi/                                                      │
│   │                                                                         │
│   └── route.ts             ← GET /api/openapi                              │
│       • Generates spec dynamically                                         │
│       • Returns JSON with CORS headers                                     │
│                                                                             │
│   src/app/api-docu/                                                         │
│   │                                                                         │
│   ├── page.tsx             ← Documentation page                            │
│   ├── redoc-viewer.tsx     ← Redoc component                               │
│   └── api-doc-selector.tsx ← Next.js / Supabase selector                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GENERATION FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. DEFINITION                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │  const Schema = z.object({                                         │    │
│   │    booking_id: z.string().uuid()                                   │    │
│   │  }).openapi('CreateCheckoutSessionRequest')                        │    │
│   │                                                                    │    │
│   │  registry.registerPath({                                           │    │
│   │    method: 'post',                                                 │    │
│   │    path: '/checkout/session',                                      │    │
│   │    request: { body: { schema: Schema } },                          │    │
│   │    responses: { 200: { schema: ResponseSchema } }                  │    │
│   │  })                                                                │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│   2. GENERATION (at /api/openapi)                                          │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │  const document = generateOpenAPIDocument()                        │    │
│   │  // Returns complete OpenAPI 3.0 object                            │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│   3. CONSUMPTION                                                            │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │  • Redoc UI (/api-docu) → Interactive documentation               │    │
│   │  • Postman → Import collection automatically                       │    │
│   │  • MCP OpenAPI Server → Expose endpoints as tools                 │    │
│   │  • openapi-typescript → Generate types for testing                │    │
│   │  • Playwright → Validate responses against schema                 │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## TypeScript Types for Testing

This is one of the most important questions: **How to get TypeScript types for automated testing?**

### Option 1: Import Types Directly (Same Repository)

When testing code is in the same repository as the application:

```typescript
// tests/integration/checkout.spec.ts

// Import types directly from schemas
import type { CreateCheckoutSessionRequest, CreateCheckoutSessionResponse } from '@/lib/openapi';

test('Create checkout session', async ({ request }) => {
  // TypeScript knows the exact request structure
  const requestBody: CreateCheckoutSessionRequest = {
    booking_id: '550e8400-e29b-41d4-a716-446655440000',
  };

  const response = await request.post('/api/checkout/session', {
    data: requestBody,
  });

  // TypeScript knows the exact response structure
  const data: CreateCheckoutSessionResponse = await response.json();

  // Autocomplete works perfectly
  expect(data.checkout_url).toContain('stripe.com');
  expect(data.session_id).toBeDefined();
});
```

### Option 2: Generate Types from OpenAPI (Separate Repository)

When testing code is in a different repository, you can generate types from the OpenAPI spec.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 TYPE GENERATION FROM OPENAPI                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Tool: openapi-typescript                                                  │
│   Installation: npm install -D openapi-typescript                          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  # Generate types from spec URL                                     │   │
│   │  npx openapi-typescript http://localhost:3000/api/openapi \         │   │
│   │    --output ./src/types/api.d.ts                                    │   │
│   │                                                                     │   │
│   │  # Or from local file                                               │   │
│   │  npx openapi-typescript ./openapi.json --output ./src/types/api.d.ts│   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   Result: src/types/api.d.ts                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  export interface paths {                                           │   │
│   │    "/checkout/session": {                                           │   │
│   │      post: {                                                        │   │
│   │        requestBody: {                                               │   │
│   │          content: {                                                 │   │
│   │            "application/json": {                                    │   │
│   │              booking_id: string;                                    │   │
│   │            }                                                        │   │
│   │          }                                                          │   │
│   │        };                                                           │   │
│   │        responses: {                                                 │   │
│   │          200: {                                                     │   │
│   │            content: {                                               │   │
│   │              "application/json": {                                  │   │
│   │                checkout_url: string;                                │   │
│   │                session_id: string;                                  │   │
│   │              }                                                      │   │
│   │            }                                                        │   │
│   │          }                                                          │   │
│   │        }                                                            │   │
│   │      }                                                              │   │
│   │    }                                                                │   │
│   │  }                                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Using Generated Types in Tests

```typescript
// tests/api/checkout.spec.ts

import type { paths } from '@/types/api';

// Extract specific types
type CreateCheckoutRequest =
  paths['/checkout/session']['post']['requestBody']['content']['application/json'];

type CreateCheckoutResponse =
  paths['/checkout/session']['post']['responses']['200']['content']['application/json'];

test('Create checkout session', async ({ request }) => {
  const body: CreateCheckoutRequest = {
    booking_id: '550e8400-e29b-41d4-a716-446655440000',
  };

  const response = await request.post('/api/checkout/session', { data: body });
  const data: CreateCheckoutResponse = await response.json();

  // TypeScript validates that you're accessing correct properties
  expect(data.checkout_url).toBeDefined();
});
```

---

## Testing in Separate Repositories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  SCENARIO: SEPARATE REPOSITORIES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────┐          ┌─────────────────────┐                  │
│   │   REPO: app         │          │   REPO: qa-tests    │                  │
│   │   (development)     │          │   (automation)      │                  │
│   │                     │          │                     │                  │
│   │   • Next.js app     │          │   • Playwright      │                  │
│   │   • Zod schemas     │          │   • API tests       │                  │
│   │   • OpenAPI spec    │          │   • E2E tests       │                  │
│   │                     │          │                     │                  │
│   │   GET /api/openapi  │◀─────────│   How to get        │                  │
│   │   (endpoint)        │          │   the types?        │                  │
│   └─────────────────────┘          └─────────────────────┘                  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   SOLUTION: Type Generation Pipeline                                        │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │                                                                   │     │
│   │   1. CI/CD from app repo publishes OpenAPI spec                  │     │
│   │      → Artifact in GitHub Release                                 │     │
│   │      → Or public endpoint /api/openapi                            │     │
│   │                                                                   │     │
│   │   2. qa-tests repo has sync script                               │     │
│   │      ┌─────────────────────────────────────────────────────────┐  │     │
│   │      │  # package.json                                         │  │     │
│   │      │  {                                                      │  │     │
│   │      │    "scripts": {                                         │  │     │
│   │      │      "sync-types": "npx openapi-typescript              │  │     │
│   │      │        https://staging.myapp.com/api/openapi            │  │     │
│   │      │        --output ./src/types/api.d.ts"                   │  │     │
│   │      │    }                                                    │  │     │
│   │      │  }                                                      │  │     │
│   │      └─────────────────────────────────────────────────────────┘  │     │
│   │                                                                   │     │
│   │   3. Run before tests                                             │     │
│   │      ┌─────────────────────────────────────────────────────────┐  │     │
│   │      │  # CI pipeline                                          │  │     │
│   │      │  - run: npm run sync-types                              │  │     │
│   │      │  - run: npm run test                                    │  │     │
│   │      └─────────────────────────────────────────────────────────┘  │     │
│   │                                                                   │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Synchronization Strategies

#### Strategy 1: Dynamic Fetch (Recommended)

```typescript
// scripts/sync-api-types.ts
import { execSync } from 'child_process';

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Generate types from spec
execSync(`npx openapi-typescript ${API_URL}/api/openapi --output ./src/types/api.d.ts`, {
  stdio: 'inherit',
});

console.log('✅ API types synchronized');
```

#### Strategy 2: Git Submodule

```bash
# QA repo includes spec as submodule
git submodule add https://github.com/org/app.git specs/app

# Script that generates types from local spec
npx openapi-typescript ./specs/app/public/openapi.json --output ./src/types/api.d.ts
```

#### Strategy 3: NPM Package

```bash
# Development repo publishes package with types
npm publish @myorg/api-types

# QA repo installs it
npm install @myorg/api-types

# Usage
import type { CreateCheckoutRequest } from '@myorg/api-types'
```

---

## Recommended Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT FLOW WITH OPENAPI                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   PHASE 1: Development                                                      │
│   ────────────────────                                                      │
│                                                                             │
│   ┌───────────────┐      ┌───────────────┐      ┌───────────────┐          │
│   │  1. Design    │      │  2. Create    │      │  3. Implement │          │
│   │     endpoint  │ ───► │     Zod       │ ───► │     route.ts  │          │
│   │     (spec)    │      │     schema    │      │               │          │
│   └───────────────┘      └───────────────┘      └───────────────┘          │
│                                                                             │
│   PHASE 2: Documentation (automatic)                                        │
│   ──────────────────────────────────                                        │
│                                                                             │
│   ┌───────────────┐      ┌───────────────┐      ┌───────────────┐          │
│   │  4. Commit    │      │  5. OpenAPI   │      │  6. TypeScript│          │
│   │     code      │ ───► │     generates │ ───► │     types     │          │
│   │               │      │     automatic │      │     exported  │          │
│   └───────────────┘      └───────────────┘      └───────────────┘          │
│                                                                             │
│   PHASE 3: Testing                                                          │
│   ───────────────                                                           │
│                                                                             │
│   ┌───────────────┐      ┌───────────────┐      ┌───────────────┐          │
│   │  7. QA uses   │      │  8. Typed     │      │  9. CI/CD     │          │
│   │     generated │ ───► │     Playwright│ ───► │     validates │          │
│   │     types     │      │     tests     │      │     all       │          │
│   └───────────────┘      └───────────────┘      └───────────────┘          │
│                                                                             │
│   BENEFITS:                                                                 │
│   ✅ Types always synchronized with code                                    │
│   ✅ Errors detected at compile time, not runtime                           │
│   ✅ IDE autocomplete for requests and responses                            │
│   ✅ Always up-to-date documentation                                        │
│   ✅ More robust and maintainable tests                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Frequently Asked Questions

### 1. What happens if a developer changes the schema?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│   SCENARIO: Developer adds required field                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   BEFORE:                                                                   │
│   const Schema = z.object({ booking_id: z.string() })                      │
│                                                                             │
│   AFTER:                                                                    │
│   const Schema = z.object({                                                 │
│     booking_id: z.string(),                                                 │
│     user_email: z.string().email()  ← NEW required field                   │
│   })                                                                        │
│                                                                             │
│   WHAT HAPPENS?                                                             │
│                                                                             │
│   1. OpenAPI spec updates automatically                                     │
│   2. If using generated types (openapi-typescript):                         │
│      - On regeneration, type changes                                       │
│      - TypeScript marks ERROR in tests that don't include user_email       │
│      - ✅ YOU DETECT THE PROBLEM BEFORE RUNNING TESTS                      │
│                                                                             │
│   3. If using imported types from same repo:                                │
│      - Type already changed in same commit                                 │
│      - TypeScript marks ERROR immediately                                  │
│      - ✅ YOU DETECT THE PROBLEM IN THE SAME PR                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. How to validate that real response matches schema?

```typescript
// You can use Zod to validate at runtime
import { CreateCheckoutSessionResponseSchema } from '@/lib/openapi';

test('Response matches schema', async ({ request }) => {
  const response = await request.post('/api/checkout/session', {
    data: { booking_id: 'uuid' },
  });

  const data = await response.json();

  // Zod validates that response matches schema
  const result = CreateCheckoutSessionResponseSchema.safeParse(data);

  if (!result.success) {
    console.error('Schema validation failed:', result.error.format());
  }

  expect(result.success).toBe(true);
});
```

### 3. How to handle API versions?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        API VERSIONING                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   OPTION 1: Version in URL                                                  │
│   /api/v1/checkout/session                                                  │
│   /api/v2/checkout/session                                                  │
│                                                                             │
│   OPTION 2: Version in Header                                               │
│   X-API-Version: 2025-01-29                                                 │
│                                                                             │
│   OPTION 3: Semantic Versioning in OpenAPI                                  │
│   openapi: 3.0.3                                                            │
│   info:                                                                     │
│     version: 2.1.0  ← MAJOR.MINOR.PATCH                                    │
│                                                                             │
│   RECOMMENDATION:                                                           │
│   • For breaking changes: increment MAJOR version                          │
│   • Maintain backward compatibility when possible                          │
│   • Document changes in CHANGELOG                                          │
│   • Generate types for each version if needed                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4. How to integrate with MCP for AI testing?

```json
{
  "mcpServers": {
    "nextjs-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "http://localhost:3000/api",
        "OPENAPI_SPEC_PATH": "http://localhost:3000/api/openapi",
        "API_HEADERS": "X-API-Key:dev-api-key"
      }
    }
  }
}
```

AI can now:

- See all available endpoints
- Know required parameters
- Execute correctly formatted requests
- Understand expected responses

### 5. What tools can I use with the OpenAPI spec?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPENAPI ECOSYSTEM                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   DOCUMENTATION                                                             │
│   ├── Redoc          → Elegant static documentation                        │
│   ├── Swagger UI     → Interactive documentation with "Try it"             │
│   └── Stoplight      → Collaborative documentation                         │
│                                                                             │
│   TESTING                                                                   │
│   ├── Postman        → Import collection from spec                         │
│   ├── Insomnia       → Import collection from spec                         │
│   ├── Dredd          → Automatic contract testing                          │
│   └── Prism          → Mock server from spec                               │
│                                                                             │
│   CODE GENERATION                                                           │
│   ├── openapi-typescript     → TypeScript types                            │
│   ├── openapi-generator      → SDKs in multiple languages                 │
│   └── orval                  → React Query/Axios client                    │
│                                                                             │
│   AI/AUTOMATION                                                             │
│   ├── MCP OpenAPI Server     → Expose endpoints as tools                  │
│   └── LangChain              → Tools for agents                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KEY POINTS                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. ZOD IS THE SOURCE OF TRUTH                                             │
│      • Define schemas once                                                  │
│      • Generates TypeScript types automatically                             │
│      • Generates OpenAPI spec automatically                                 │
│      • Validates requests at runtime                                        │
│                                                                             │
│   2. OPENAPI ENABLES THE ENTIRE ECOSYSTEM                                   │
│      • Always up-to-date documentation                                      │
│      • Import into Postman/Insomnia                                         │
│      • Testing with MCP/AI                                                  │
│      • Type generation for separate repos                                   │
│                                                                             │
│   3. TYPES = EARLY ERROR DETECTION                                          │
│      • TypeScript detects breaking changes                                  │
│      • Errors at compile time, not runtime                                  │
│      • More robust and maintainable tests                                   │
│                                                                             │
│   4. RECOMMENDED FLOW                                                       │
│      • Same repo: import types directly                                     │
│      • Separate repos: generate types from spec                             │
│      • CI/CD: regenerate types before tests                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Related Flows

This document covers **Flow B: Generate OpenAPI from Zod**. Other flows exist for working with OpenAPI:

| Flow                | When to use it                            | Document                                                       |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| **sync-openapi.ts** | External backend has the spec (other repo)| See `cli/sync-openapi.ts`                                      |
| **Zod-to-OpenAPI**  | You define schemas with Zod (this doc)    | This document                                                  |
| **MCP OpenAPI**     | AI testing using any spec                 | [mcp-openapi.md](docs/setup/mcp-openapi.md)                   |

---

## Additional Resources

- [zod-to-openapi GitHub](https://github.com/asteasolutions/zod-to-openapi)
- [openapi-typescript GitHub](https://github.com/drwpow/openapi-typescript)
- [OpenAPI Specification](https://spec.openapis.org/oas/v3.0.3)
- [Redoc Documentation](https://redocly.com/docs/redoc/)
- [Zod Documentation](https://zod.dev/)
