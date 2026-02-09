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
type Booking = components['schemas']['BookingListModel'];
type Invoice = components['schemas']['InvoiceModel'];
type Hotel = components['schemas']['HotelModel'];

// Use in API classes
export class BookingsApi extends ApiBase {
  async getBookings(hotelId: number): Promise<Booking[]> {
    return this.apiGET<Booking[]>(`/bookings?hotelId=${hotelId}`);
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
type Booking = components['schemas']['BookingListModel'];

// Access endpoint types
type GetBookingsResponse =
  paths['/api/bookings']['get']['responses']['200']['content']['application/json'];
type CreateBookingBody =
  paths['/api/bookings']['post']['requestBody']['content']['application/json'];
```

---

## Troubleshooting

| Issue                    | Solution                                           |
| ------------------------ | -------------------------------------------------- |
| Connection refused       | Ensure backend is running on localhost:64422       |
| Types not generating     | Check openapi.json is valid JSON                   |
| Import error for @api/\* | Verify tsconfig.json has the path alias configured |

---

## Best Practices

1. **Sync before writing tests** - Run `bun run api:sync` to get latest types
2. **Commit types.ts** - The generated types file should be committed
3. **Use type aliases** - Create readable aliases for complex schema paths

---

## References

- [openapi-typescript](https://openapi-ts.dev/) - Type generator
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
