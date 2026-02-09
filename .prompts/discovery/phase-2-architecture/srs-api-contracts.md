# SRS: API Contracts Discovery

> **Phase**: 2 - Architecture
> **Objective**: Extract and document API contracts from existing endpoints

---

## 📥 Input Required

### From Previous Prompts:

- `.context/PRD/feature-inventory.md` (endpoint list)
- `.context/SRS/architecture-specs.md` (tech stack)

### From Discovery Sources:

| Information       | Primary Source       | Fallback          |
| ----------------- | -------------------- | ----------------- |
| Endpoints         | Route files, OpenAPI | Code analysis     |
| Request schema    | Zod/Yup validators   | TypeScript types  |
| Response schema   | Return types         | Response examples |
| Auth requirements | Middleware, guards   | Route analysis    |

---

## 🎯 Objective

Document API contracts by extracting:

1. Endpoint definitions (method, path)
2. Request schemas (body, query, params)
3. Response schemas (success, error)
4. Authentication requirements

---

## 🔍 Discovery Process

### Step 1: Endpoint Discovery

**Actions:**

1. List all API routes:

   ```bash
   # Next.js App Router
   find src/app/api -name "route.ts" -exec echo "=== {} ===" \; -exec head -30 {} \;

   # Get exported methods
   grep -r "export.*GET\|export.*POST\|export.*PUT\|export.*DELETE\|export.*PATCH" src/app/api/
   ```

2. Check for OpenAPI spec:

   ```bash
   # Look for existing API docs
   cat openapi.yaml openapi.json swagger.yaml swagger.json api-spec.* 2>/dev/null

   # Check for generation tools
   grep -r "openapi\|swagger" package.json
   ```

3. Extract route parameters:
   ```bash
   # Dynamic routes
   find src/app/api -type d -name "\[*\]"
   ```

**Output:**

- Complete endpoint list
- HTTP methods per endpoint
- URL parameters

### Step 2: Request Schema Discovery

**Actions:**

1. Find validation schemas:

   ```bash
   # Zod schemas
   grep -r "z\.\|zod" --include="*.ts" src/app/api/ src/schemas/ src/validators/ 2>/dev/null

   # Yup schemas
   grep -r "yup\.\|Yup" --include="*.ts" src/
   ```

2. Extract body types:

   ```bash
   # Request body parsing
   grep -r "request.json()\|req.body" --include="*.ts" src/app/api/
   ```

3. Find query parameter usage:
   ```bash
   # URL search params
   grep -r "searchParams\|query\." --include="*.ts" src/app/api/
   ```

**Output:**

- Request body schemas
- Query parameter definitions
- Path parameter types

### Step 3: Response Schema Discovery

**Actions:**

1. Analyze return statements:

   ```bash
   # NextResponse returns
   grep -r "NextResponse.json\|Response.json\|return.*json" --include="*.ts" src/app/api/
   ```

2. Find response types:

   ```bash
   # TypeScript return types
   grep -r "Promise<.*Response>\|: Response" --include="*.ts" src/app/api/
   ```

3. Extract error responses:
   ```bash
   # Error handling
   grep -r "status.*4\|status.*5\|error" --include="*.ts" src/app/api/ | head -30
   ```

**Output:**

- Success response structures
- Error response formats
- Status codes used

### Step 4: Auth Requirements Discovery

**Actions:**

1. Check for auth middleware:

   ```bash
   # Auth checks in routes
   grep -r "getServerSession\|auth()\|requireAuth\|withAuth" --include="*.ts" src/app/api/
   ```

2. Identify protected routes:

   ```bash
   # Middleware config
   cat middleware.ts src/middleware.ts 2>/dev/null
   ```

3. Map role requirements:
   ```bash
   # Role checks
   grep -r "role.*===\|hasRole\|isAdmin" --include="*.ts" src/app/api/
   ```

**Output:**

- Auth requirements per endpoint
- Role restrictions
- Public vs protected endpoints

---

## 📤 Output Generated

### Primary Output: `.context/SRS/api-contracts.md`

```markdown
# API Contracts - [Product Name]

> **Discovered from**: Route files, validation schemas, response handlers
> **Discovery Date**: [Date]
> **Total Endpoints**: [Count]
> **API Version**: [If versioned]

---

## API Overview

### Base URL
```

Development: http://localhost:3000/api
Staging: https://staging.example.com/api
Production: https://api.example.com

````

### Common Headers

| Header | Value | Required |
|--------|-------|----------|
| `Content-Type` | `application/json` | Yes (POST/PUT) |
| `Authorization` | `Bearer {token}` | Protected routes |
| `X-Request-ID` | UUID | Optional |

### Authentication

| Method | Implementation |
|--------|----------------|
| Type | [Session / JWT / API Key] |
| Header | `Authorization: Bearer {token}` |
| Cookie | `session-token` |

---

## Endpoints by Resource

### Authentication (`/api/auth/`)

#### POST `/api/auth/register`
Create a new user account.

**Authentication:** None (public)

**Request:**
```typescript
// Body
{
  email: string;      // Required, valid email format
  password: string;   // Required, min 8 chars, 1 uppercase, 1 number
  name?: string;      // Optional
}
````

**Validation Schema (Zod):**

```typescript
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  name: z.string().optional(),
});
```

**Response:**

| Status | Description      | Body                                            |
| ------ | ---------------- | ----------------------------------------------- |
| 201    | Created          | `{ user: User, token: string }`                 |
| 400    | Validation error | `{ error: string, details: ValidationError[] }` |
| 409    | Email exists     | `{ error: "Email already registered" }`         |

**Success Response (201):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "token": "jwt-token-here"
}
```

**Error Response (400):**

```json
{
  "error": "Validation failed",
  "details": [{ "field": "password", "message": "Must contain uppercase letter" }]
}
```

**Evidence:** `src/app/api/auth/register/route.ts`

---

#### POST `/api/auth/login`

Authenticate an existing user.

**Authentication:** None (public)

**Request:**

```typescript
{
  email: string;
  password: string;
  rememberMe?: boolean;
}
```

**Response:**

| Status | Description         | Body                                            |
| ------ | ------------------- | ----------------------------------------------- |
| 200    | Success             | `{ user: User, token: string }`                 |
| 401    | Invalid credentials | `{ error: "Invalid email or password" }`        |
| 429    | Too many attempts   | `{ error: "Rate limited", retryAfter: number }` |

**Evidence:** `src/app/api/auth/login/route.ts`

---

### Users (`/api/users/`)

#### GET `/api/users`

List all users (admin only).

**Authentication:** Required (admin role)

**Query Parameters:**

| Param    | Type   | Default | Description          |
| -------- | ------ | ------- | -------------------- |
| `page`   | number | 1       | Page number          |
| `limit`  | number | 20      | Items per page       |
| `search` | string | -       | Search by name/email |
| `role`   | enum   | -       | Filter by role       |

**Response:**

| Status | Description  | Body                                        |
| ------ | ------------ | ------------------------------------------- |
| 200    | Success      | `{ users: User[], pagination: Pagination }` |
| 401    | Unauthorized | `{ error: "Authentication required" }`      |
| 403    | Forbidden    | `{ error: "Admin access required" }`        |

**Success Response (200):**

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

**Evidence:** `src/app/api/users/route.ts`

---

#### GET `/api/users/:id`

Get a specific user.

**Authentication:** Required (self or admin)

**Path Parameters:**

| Param | Type | Description |
| ----- | ---- | ----------- |
| `id`  | UUID | User ID     |

**Response:**

| Status | Description | Body                          |
| ------ | ----------- | ----------------------------- |
| 200    | Success     | `{ user: User }`              |
| 404    | Not found   | `{ error: "User not found" }` |

**Evidence:** `src/app/api/users/[id]/route.ts`

---

### [Resource Name] (`/api/[resource]/`)

#### [METHOD] `/api/[resource]/[endpoint]`

[Description]

**Authentication:** [Required/Optional/None] ([role if applicable])

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| [param] | [type] | [description] |

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| [param] | [type] | [default] | [description] |

**Request Body:**

```typescript
{
  [field]: [type]; // [description]
}
```

**Response:**
| Status | Description | Body |
|--------|-------------|------|
| [code] | [description] | [body type] |

**Evidence:** `[file path]`

---

## Common Types

### User

```typescript
interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin' | 'super_admin';
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

### Pagination

```typescript
interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
```

### Error Response

```typescript
interface ErrorResponse {
  error: string;
  details?: ValidationError[];
  code?: string;
}

interface ValidationError {
  field: string;
  message: string;
}
```

---

## Error Codes

| Code               | HTTP Status | Description               |
| ------------------ | ----------- | ------------------------- |
| `AUTH_REQUIRED`    | 401         | Authentication required   |
| `FORBIDDEN`        | 403         | Insufficient permissions  |
| `NOT_FOUND`        | 404         | Resource not found        |
| `VALIDATION_ERROR` | 400         | Request validation failed |
| `CONFLICT`         | 409         | Resource already exists   |
| `RATE_LIMITED`     | 429         | Too many requests         |
| `SERVER_ERROR`     | 500         | Internal server error     |

---

## Rate Limiting

| Endpoint Pattern           | Limit        | Window   |
| -------------------------- | ------------ | -------- |
| `/api/auth/*`              | 10 requests  | 1 minute |
| `/api/*` (authenticated)   | 100 requests | 1 minute |
| `/api/*` (unauthenticated) | 20 requests  | 1 minute |

**Evidence:** `middleware.ts` or rate limit config

---

## Webhooks (if applicable)

### Stripe Webhook

**Endpoint:** `POST /api/webhooks/stripe`
**Verification:** Stripe signature validation
**Events Handled:**

- `checkout.session.completed`
- `invoice.payment_succeeded`
- `customer.subscription.updated`

**Evidence:** `src/app/api/webhooks/stripe/route.ts`

---

## Discovery Gaps

| Gap                    | Impact           | How to Resolve         |
| ---------------------- | ---------------- | ---------------------- |
| Undocumented endpoints | Missing coverage | Review all route files |
| Response examples      | Test data needs  | Run manual tests       |
| Rate limits            | Test planning    | Check middleware       |

---

## QA Relevance

### API Test Coverage

| Endpoint            | Unit     | Integration | Contract |
| ------------------- | -------- | ----------- | -------- |
| POST /auth/register | ✅       | ✅          | ⚠️       |
| POST /auth/login    | ✅       | ✅          | ⚠️       |
| GET /users          | [status] | [status]    | [status] |

### Test Data Requirements

| Endpoint            | Test User    | Data Setup        |
| ------------------- | ------------ | ----------------- |
| Admin endpoints     | Admin role   | Create admin user |
| Protected endpoints | Regular user | Auth token        |
| Public endpoints    | None         | None              |

### Suggested Contract Tests

Based on discovered schemas:

1. Validate request schema matches Zod definitions
2. Verify error response format consistency
3. Test auth requirements per endpoint

````

### Update CLAUDE.md:

```markdown
## Phase 2 Progress - SRS
- [x] srs-architecture-specs.md ✅
- [x] srs-api-contracts.md ✅
  - Endpoints: [count]
  - Auth patterns: [list]
````

---

## 🔗 Next Prompt

| Condition            | Next Prompt               |
| -------------------- | ------------------------- |
| Contracts documented | `srs-functional-specs.md` |
| Missing schemas      | Check validators folder   |
| Need live testing    | Use Postman/REST client   |

---

## Tips

1. **Zod/Yup schemas are gold** - They define exact contracts
2. **Return types reveal responses** - TypeScript types = API shape
3. **Middleware shows auth rules** - Check what protects routes
4. **Error handling reveals edge cases** - Every catch block is a scenario
