# OpenAPI Integration Guide

> Configuring OpenAPI integration for type-safe API testing in KATA.

---

## Overview

KATA uses **OpenAPI/Swagger specifications** to generate TypeScript types for API testing. This enables:

- **Type-safe testing** - Generated TypeScript types from OpenAPI
- **Contract testing** - Validate responses against actual API schemas
- **IDE autocomplete** - Full IntelliSense for request/response types

```
┌─────────────────────────────────────────────────────────────────┐
│                    API TYPE GENERATION FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Backend (running)               Test Repo (KATA)                │
│  ┌──────────────┐               ┌──────────────────────────┐    │
│  │ /swagger/v1/ │──── fetch ───▶│ /api/openapi.json        │    │
│  │ swagger.json │               │        ↓                 │    │
│  └──────────────┘               │ /api/types.ts (generated)│    │
│                                 └────────────┬─────────────┘    │
│                                              │                   │
│                                              ▼                   │
│                                 ┌──────────────────────────┐    │
│                                 │   Test Code              │    │
│                                 │   import { components }  │    │
│                                 │     from '@api/types'    │    │
│                                 └──────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Setup

### Prerequisite: Backend Running

The backend must be running and exposing Swagger at:

```
http://localhost:64422/swagger/v1/swagger.json
```

> Consult your backend documentation for how to start the API server.

### Sync OpenAPI and Generate Types

From the qa-automation directory:

```bash
bun run api:sync
```

This single command:

1. Downloads `openapi.json` from the backend
2. Generates `api/openapi-types.ts` with TypeScript interfaces

### Use Types in Tests

```typescript
import type { components } from '@api/openapi-types';

// Extract types from schemas
type Order = components['schemas']['OrderListModel'];
type Product = components['schemas']['ProductModel'];
type Customer = components['schemas']['CustomerModel'];

// Use in API classes
export class OrdersApi extends ApiBase {
  async getOrders(customerId: number): Promise<Order[]> {
    return this.apiGET<Order[]>(`/orders?customerId=${customerId}`);
  }
}
```

---

## Commands

| Command                        | Description                                 |
| ------------------------------ | ------------------------------------------- |
| `bun run api:sync`             | Download spec + generate types (default)    |
| `bun run api:sync --url <url>` | Download from specific URL                  |
| `bun run api:sync --no-types`  | Only download, skip type generation         |
| `bun run api:sync --help`      | Show help                                   |
| `bun run api:types`            | Regenerate types from existing openapi.json |

---

## Directory Structure

```
/api
├── openapi.json          # Downloaded spec (gitignored)
├── openapi-types.ts      # Generated types (committed)
└── .openapi-config.json  # Last sync info (gitignored)

/cli
└── sync-openapi.ts       # Sync script
```

---

## Type Navigation

The generated `openapi-types.ts` file provides full type access:

```typescript
import type { components, paths } from '@api/openapi-types';

// Access schemas directly
type Order = components['schemas']['OrderListModel'];

// Access endpoint types
type GetOrdersResponse =
  paths['/api/orders']['get']['responses']['200']['content']['application/json'];
type CreateOrderBody =
  paths['/api/orders']['post']['requestBody']['content']['application/json'];
```

---

## Troubleshooting

| Issue                    | Solution                                           |
| ------------------------ | -------------------------------------------------- |
| Connection refused       | Ensure backend is running on localhost:64422       |
| Types not generating     | Check openapi.json is valid JSON                   |
| Import error for @api/\* | Verify tsconfig.json has the path alias configured |

---

## Type Facade Pattern

### Problem

Importing directly from `openapi-types.ts` in every component leads to verbose, fragile code:

```typescript
// ❌ AVOID - Direct @openapi imports scattered across components
import type { components, paths } from '@openapi';
type LoginBody = paths['/api/auth/login']['post']['requestBody']['content']['application/json'];
```

### Solution: Domain Type Facades

Create **one facade file per domain** in `api/schemas/` that re-exports OpenAPI types with readable names:

```
api/openapi-types.ts          ← Auto-generated (NEVER hand-edit)
        ↓ import type
api/schemas/{domain}.types.ts  ← Hand-written facades (readable aliases)
        ↓ import type
tests/components/api/{Domain}Api.ts  ← Components consume facades
```

**Rule:** Only facade files import from `@openapi`. Components import from `@schemas/*`.

### Facade File Structure

Each `{domain}.types.ts` has up to 3 sections:

```typescript
import type { components, paths } from '@openapi';

// ============================================================================
// Schema Types (domain models from components.schemas)
// ============================================================================
export type Order = components['schemas']['OrderListModel'];
export type Product = components['schemas']['ProductModel'];

// ============================================================================
// Endpoint Types - POST /api/orders
// ============================================================================
type CreateOrderPath = paths['/api/orders']['post'];
export type CreateOrderRequest = CreateOrderPath['requestBody']['content']['application/json'];
export type CreateOrderResponse = CreateOrderPath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - GET /api/orders/{id}
// ============================================================================
type GetOrderPath = paths['/api/orders/{id}']['get'];
export type GetOrderParams = GetOrderPath['parameters']['path'];
export type GetOrderResponse = GetOrderPath['responses']['200']['content']['application/json'];

// ============================================================================
// Custom Types (not in OpenAPI spec)
// ============================================================================
export interface OrderErrorResponse {
  error: string
  statusCode?: number
}
```

### Section Rules

| Section | Source | When to Use |
|---------|--------|-------------|
| **Schema Types** | `components['schemas']` | Domain models/entities |
| **Endpoint Types** | `paths[...][method]` | Request/response per endpoint |
| **Custom Types** | Plain interfaces | Types not in spec (errors, test helpers) |

**Endpoint Types pattern:** Use a private `type XPath = paths[...][method]` helper, then export the specific parts:

```typescript
type CreateOrderPath = paths['/api/orders']['post'];  // private helper
export type CreateOrderRequest = CreateOrderPath['requestBody']['content']['application/json'];
export type CreateOrderResponse = CreateOrderPath['responses']['201']['content']['application/json'];
```

### Type Placement Decision

| Type Origin | Location | Import From |
|-------------|----------|-------------|
| OpenAPI schema | `api/schemas/{domain}.types.ts` | `@schemas/{domain}.types` |
| OpenAPI endpoint | `api/schemas/{domain}.types.ts` | `@schemas/{domain}.types` |
| Not in spec, domain-specific | `api/schemas/{domain}.types.ts` § Custom | `@schemas/{domain}.types` |
| Test data generation | `tests/data/types.ts` | `@data/types` |

### Import Examples

```typescript
// In API component (single domain)
import type { LoginPayload, TokenResponse } from '@schemas/auth.types';

// In test file (cross-domain)
import type { LoginPayload } from '@schemas/auth.types';
import type { Order } from '@schemas/orders.types';

// Or via barrel (cross-domain shorthand)
import type { LoginPayload, Order } from '@schemas';
```

### Creating a New Facade

1. Copy `api/schemas/example.types.ts` to `api/schemas/{domain}.types.ts`
2. Replace placeholder schemas with real names from `api/openapi-types.ts`
3. Add re-export to `api/schemas/index.ts`: `export type * from './{domain}.types'`
4. Import in your component: `import type { X } from '@schemas/{domain}.types'`

### Directory Structure

```
api/
├── openapi.json              # Downloaded spec (gitignored)
├── openapi-types.ts          # Auto-generated types (committed)
├── .openapi-config.json      # Sync metadata (gitignored)
└── schemas/                  # Type facade files
    ├── index.ts              # Barrel re-export
    ├── auth.types.ts         # Auth domain types
    ├── orders.types.ts       # Orders domain types
    └── example.types.ts      # Template/reference
```

---

## Best Practices

1. **Sync before writing tests** - Run `bun run api:sync` to get latest types
2. **Commit types.ts** - The generated types file should be committed
3. **Use type facades** - Create `api/schemas/{domain}.types.ts` for readable type aliases
4. **One facade per domain** - Matches the API component it serves (e.g., `auth.types.ts` → `AuthApi.ts`)
5. **Only facades import @openapi** - Components never import directly from `@openapi`

---

## References

- [openapi-typescript](https://openapi-ts.dev/) - Type generator
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
