# API Architecture Generator

Act as a **Solutions Architect** and **API Documentation Specialist**.

---

## MISSION

Your objective is to **FULLY DOCUMENT** the project's API architecture and generate a **visual and technical map** that explains:

- All available endpoints (REST API + Custom Routes)
- Authentication and authorization structure
- How to test each endpoint manually
- Complex data flows between services
- Summary table for QA testing

**Philosophy:**

- **Visual first:** Use ASCII diagrams for easy comprehension
- **Stack agnostic:** Detect any framework (Next.js, Express, FastAPI, Django, NestJS)
- **Testing oriented:** Each endpoint with examples of how to test it
- **Don't duplicate:** If `business-data-map.md` exists, reference business flows
- **Maintainable:** CREATE/UPDATE pattern to keep synchronized

**Output:** `.context/api-architecture.md`

---

## PHASE 0: DISCOVERY

### 0.1 Detect Configuration

**Automatically identify:**

1. **Project system prompt:**
   - Search for: `CLAUDE.md`, `GEMINI.md`, `CURSOR.md`, `COPILOT.md`, `.ai-instructions.md`
   - Save name for later update

2. **Project name and purpose:**
   - Read: `package.json`, `README.md`, `pyproject.toml`, `setup.py`
   - Extract system description

3. **Database MCP available:**
   - Detect what tools you have to explore the DB
   - Use to understand schema if needed

4. **Existing documentation:**
   - Search for: `.context/business-data-map.md` (business flows)
   - Search for: `.context/SRS/` (technical specifications)
   - Search for: `.context/api-auth.md` (existing auth documentation)

### 0.2 Detect Stack Type

**Analyze the project to determine the framework:**

| Stack                    | Detection                            | Endpoint Pattern                                                    | Typical Location                  |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------- | --------------------------------- |
| **Next.js App Router**   | `next.config.*` + `src/app/api/`     | `export async function GET\|POST\|PUT\|PATCH\|DELETE` in `route.ts` | `src/app/api/[domain]/route.ts`   |
| **Next.js Pages Router** | `pages/api/`                         | `export default handler`                                            | `pages/api/[domain].ts`           |
| **Express**              | `express` in package.json            | `router.get\|post\|put\|delete(...)`                                | `routes/*.js` or `src/routes/*.ts` |
| **FastAPI**              | `fastapi` imports in `.py`           | `@app.get\|post\|put\|patch\|delete(...)`                           | `main.py` or `app/*.py`            |
| **Django**               | `manage.py` + `urls.py`              | `path()` patterns                                                   | `urls.py` + `views.py`            |
| **NestJS**               | `nest-cli.json`                      | `@Get\|Post\|Put\|Delete()` decorators                              | `*.controller.ts`                 |
| **Supabase Only**        | No custom API, only Supabase client  | Auto-generated REST API                                             | N/A (PostgREST)                   |

**Execute detection:**

```
1. Search for configuration files (next.config.*, nest-cli.json, manage.py)
2. Search for patterns in package.json (express, fastapi, @nestjs)
3. Search for API folders (src/app/api, pages/api, routes)
4. Determine if there's a custom API or only Supabase REST
```

### 0.3 Detect Mode

```
Does .context/api-architecture.md exist?
  → YES: UPDATE mode (show diff, ask for confirmation)
  → NO: CREATE mode (generate from scratch)
```

---

## PHASE 1: EXPLORATION

### 1.1 Find All Endpoints

**For each detected stack:**

#### Next.js App Router:

```bash
# Find all API routes
find src/app/api -name "route.ts" -o -name "route.js"

# Analyze each file to find exported methods
# GET, POST, PUT, PATCH, DELETE
```

#### Next.js Pages Router:

```bash
# Find all API routes
find pages/api -name "*.ts" -o -name "*.js"
```

#### Express:

```bash
# Find route definitions
grep -r "router\.\(get\|post\|put\|patch\|delete\)" --include="*.js" --include="*.ts"
```

#### FastAPI:

```bash
# Find endpoint decorators
grep -r "@app\.\(get\|post\|put\|patch\|delete\)" --include="*.py"
```

**For each endpoint found, extract:**

- Full path (e.g., `/api/users/[id]`)
- HTTP method (GET, POST, PUT, PATCH, DELETE)
- Path parameters (e.g., `[id]`, `[slug]`)
- Query params if any
- Request body schema (if applicable)
- Expected response schema
- Required authentication (detect middleware, guards)

---

### 1.2 Analyze Authentication

**Detect auth system:**

1. **Supabase Auth:**
   - Search for: `createClient`, `supabase.auth`, `getUser()`
   - Middleware: Verify `supabase.auth.getUser()` before operations

2. **NextAuth.js:**
   - Search for: `getServerSession`, `useSession`, `authOptions`
   - Middleware: `middleware.ts` with `withAuth`

3. **JWT Custom:**
   - Search for: `jsonwebtoken`, `jwt.verify`, `Authorization: Bearer`

4. **API Keys:**
   - Search for: Custom headers (`x-api-key`, etc.)

**Classify endpoints by access level:**

| Level          | Description         | Example Verification         |
| -------------- | ------------------- | ---------------------------- |
| **Public**     | No authentication   | No verification              |
| **Protected**  | Authenticated user  | `session?.user` exists       |
| **Role-Based** | Specific role       | `user.role === 'admin'`      |
| **Owner**      | Resource owner      | `resource.user_id === user.id` |

---

### 1.3 Identify External Services

**Search for integrations:**

- **Payments:** Stripe, MercadoPago, PayPal
- **Email:** Resend, SendGrid, Postmark
- **Storage:** Supabase Storage, AWS S3, Cloudinary
- **AI:** OpenAI, Anthropic, Replicate
- **Analytics:** Mixpanel, Amplitude, PostHog

**For each service, document:**

- Which endpoints use it
- Received webhooks
- Data format exchanged

---

### 1.4 Map DB Connections

**Identify:**

- Which endpoints read from which tables?
- Which endpoints write to which tables?
- Are there operations that cross multiple tables?

**If `.context/business-data-map.md` exists, reference** instead of duplicating.

---

## PHASE 2: DOCUMENT GENERATION

### Generate: `.context/api-architecture.md`

The document should be **VISUAL** and **TESTING-oriented**. Use ASCII diagrams extensively.

---

### OUTPUT STRUCTURE

```markdown
# API Architecture: [Project Name]

╔══════════════════════════════════════════════════════════════════════════════╗
║ [NAME] - API ARCHITECTURE MAP                                                 ║
║ Stack: [Detected stack] | Endpoints: [N total]                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

#### 1. EXECUTIVE SUMMARY

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📋 EXECUTIVE SUMMARY                                                          │
└──────────────────────────────────────────────────────────────────────────────┘

## Technology Stack

| Component  | Technology                            |
| ---------- | ------------------------------------- |
| Framework  | [Next.js App Router / Express / etc.] |
| Database   | [Supabase / PostgreSQL / etc.]        |
| Auth       | [Supabase Auth / NextAuth / etc.]     |
| Hosting    | [Vercel / Railway / etc.]             |

## Endpoint Statistics

| Category        | Count |
| --------------- | ----- |
| Total Endpoints | N     |
| Public          | N     |
| Protected       | N     |
| Admin Only      | N     |

## Base URLs

| Environment | URL                               |
| ----------- | --------------------------------- |
| Local       | `http://localhost:3000/api`       |
| Staging     | `https://staging.example.com/api` |
| Production  | `https://example.com/api`         |
```

---

#### 2. COMPLETE ARCHITECTURE

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🏗️ COMPLETE ARCHITECTURE                                                      │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ REQUEST FLOW                                                                 │
│─────────────────────────────────────────────────────────────────────────────│
│                                                                              │
│ ┌──────────┐ Request  ┌────────────────────────────────────────────┐        │
│ │ Client   │ ─────────► │ API LAYER                                │        │
│ │ (Browser)│           │ ┌────────────────────────────────────────┐ │        │
│ └──────────┘           │ │ Middleware (Auth, Validation, CORS)   │ │        │
│      ▲                 │ └───────────────────┬────────────────────┘ │        │
│      │                 │                     │                      │        │
│      │                 │ ┌───────────────────▼────────────────────┐ │        │
│      │                 │ │ Route Handlers                         │ │        │
│      │                 │ │ ┌─────────┐ ┌─────────┐ ┌─────────┐   │ │        │
│      │    Response     │ │ │/api/auth│ │/api/user│ │/api/... │   │ │        │
│      │                 │ │ └────┬────┘ └────┬────┘ └────┬────┘   │ │        │
│      │                 │ └──────┼───────────┼───────────┼────────┘ │        │
│      │                 └────────┼───────────┼───────────┼──────────┘        │
│      │                          │           │           │                    │
│      │                          ▼           ▼           ▼                    │
│      │                 ┌────────────────────────────────────────────┐       │
│      │                 │ DATA LAYER                                  │       │
│      │                 │ ┌──────────────┐ ┌───────────────────┐     │       │
│      │                 │ │ Supabase     │ │ External Services │     │       │
│      │                 │ │ (PostgreSQL) │ │ (Stripe, Resend)  │     │       │
│      └─────────────────│ └──────────────┘ └───────────────────┘     │       │
│                        └────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

#### 3. ENDPOINT CATALOG

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📡 ENDPOINT CATALOG                                                           │
└──────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
DOMAIN: [Domain Name] (e.g., Authentication)
═══════════════════════════════════════════════════════════════════════════════

┌────────┬────────────────────────┬──────────────────┬─────────────────────────┐
│ Method │ Endpoint               │ Auth             │ Description             │
├────────┼────────────────────────┼──────────────────┼─────────────────────────┤
│ POST   │ /api/auth/signup       │ 🔓 Public        │ User registration       │
│ POST   │ /api/auth/login        │ 🔓 Public        │ Sign in                 │
│ POST   │ /api/auth/logout       │ 🔐 Protected     │ Sign out                │
│ GET    │ /api/auth/me           │ 🔐 Protected     │ Get current user        │
│ POST   │ /api/auth/refresh      │ 🔐 Protected     │ Refresh token           │
└────────┴────────────────────────┴──────────────────┴─────────────────────────┘

**Legend:**

- 🔓 Public: No authentication required
- 🔐 Protected: Authenticated user required
- 👑 Admin: Admin role required
- 👤 Owner: Resource owner required

═══════════════════════════════════════════════════════════════════════════════
DOMAIN: [Another Domain]
═══════════════════════════════════════════════════════════════════════════════

[Repeat structure for each domain...]
```

---

#### 4. ENDPOINT DETAILS BY DOMAIN

For each domain, document each endpoint with:

````markdown
### [DOMAIN]: [Endpoint Name]

**Endpoint:** `[METHOD] /api/[path]`

**Authentication:** [Public | Protected | Admin | Owner]

**Request:**

```[json/typescript]
// Headers
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}

// Body (if applicable)
{
  "field1": "value",
  "field2": "value"
}
```
````

**Response:**

```[json]
// 200 OK
{
  "data": { ... },
  "message": "Success"
}

// 400 Bad Request
{
  "error": "Validation error",
  "details": [...]
}

// 401 Unauthorized
{
  "error": "Unauthorized"
}
```

**cURL Example:**

```bash
curl -X [METHOD] \
  'http://localhost:3000/api/[path]' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "field1": "value"
  }'
```

````

---

#### 5. AUTHENTICATION BY TYPE

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔐 AUTHENTICATION BY TYPE                                                     │
└──────────────────────────────────────────────────────────────────────────────┘

## 🔓 PUBLIC ENDPOINTS (no auth)

These endpoints don't require authentication:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/signup` | New user registration |
| `POST /api/auth/login` | Sign in |
| `GET /api/public/[...]` | Public data |

**How to test:**
```bash
# No auth headers required
curl 'http://localhost:3000/api/auth/signup' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"Test123!"}'
````

---

## 🔐 PROTECTED ENDPOINTS (authenticated user)

These endpoints require an authenticated user:

| Endpoint              | Purpose                 |
| --------------------- | ----------------------- |
| `GET /api/auth/me`    | Get current user data   |
| `PUT /api/profile`    | Update profile          |
| `GET /api/[resource]` | List user's resources   |

**How to get token:**

```bash
# 1. Login to get token
TOKEN=$(curl -s 'http://localhost:3000/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"Test123!"}' \
  | jq -r '.token')

# 2. Use token in requests
curl 'http://localhost:3000/api/auth/me' \
  -H "Authorization: Bearer $TOKEN"
```

---

## 👑 ADMIN ENDPOINTS (admin role)

These endpoints require administrator role:

| Endpoint                       | Purpose          |
| ------------------------------ | ---------------- |
| `GET /api/admin/users`         | List all users   |
| `DELETE /api/admin/users/[id]` | Delete user      |

**Role verification:**

```typescript
// The endpoint verifies:
if (user.role !== 'admin') {
  return { error: 'Forbidden', status: 403 };
}
```

---

## 👤 OWNER ENDPOINTS (resource owner)

These endpoints verify resource ownership:

| Endpoint                 | Verification               |
| ------------------------ | -------------------------- |
| `PUT /api/posts/[id]`    | `post.user_id === user.id` |
| `DELETE /api/posts/[id]` | `post.user_id === user.id` |

**Ownership verification:**

```typescript
// The endpoint verifies:
const post = await getPost(id);
if (post.user_id !== user.id) {
  return { error: 'Forbidden', status: 403 };
}
```

````

---

#### 6. TESTING GUIDE

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🧪 TESTING GUIDE                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

## 1. Testing with Browser DevTools

### Get Session Token

1. Open DevTools (F12)
2. Go to **Application** → **Cookies** or **Local Storage**
3. Look for: `sb-access-token` (Supabase) or `next-auth.session-token` (NextAuth)

### Make Request from Console

```javascript
// GET request with auth
fetch('/api/resource', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('sb-access-token')}`
  }
}).then(r => r.json()).then(console.log)

// POST request with body
fetch('/api/resource', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('sb-access-token')}`
  },
  body: JSON.stringify({ field: 'value' })
}).then(r => r.json()).then(console.log)
````

---

## 2. Testing with Postman

### Environment Setup

```json
{
  "name": "[Project] Local",
  "values": [
    { "key": "base_url", "value": "http://localhost:3000" },
    { "key": "token", "value": "" }
  ]
}
```

### Recommended Collection

```
📁 [Project] API
├── 📁 Auth
│   ├── POST Signup
│   ├── POST Login (saves token to variable)
│   ├── GET Me
│   └── POST Logout
├── 📁 [Domain 1]
│   ├── GET List
│   ├── GET By ID
│   ├── POST Create
│   ├── PUT Update
│   └── DELETE Remove
└── 📁 [Domain 2]
    └── ...
```

### Pre-request Script (Auto Auth)

```javascript
// In the collection, "Pre-request Script" tab
if (pm.environment.get('token')) {
  pm.request.headers.add({
    key: 'Authorization',
    value: 'Bearer ' + pm.environment.get('token'),
  });
}
```

---

## 3. Testing with cURL

### Complete Testing Flow

```bash
# Environment variables
export BASE_URL="http://localhost:3000"
export EMAIL="test@example.com"
export PASSWORD="Test123!"

# 1. Signup (if user doesn't exist)
curl -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

# 2. Login and save token
export TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -r '.access_token')

# 3. Verify authentication
curl "$BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN"

# 4. Use in any protected endpoint
curl "$BASE_URL/api/[resource]" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 4. Testing with Playwright (E2E)

```typescript
import { test, expect } from '@playwright/test';

// Authentication helper
async function getAuthToken(email: string, password: string) {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  return data.access_token;
}

test.describe('API Tests', () => {
  let token: string;

  test.beforeAll(async () => {
    token = await getAuthToken('test@test.com', 'Test123!');
  });

  test('GET /api/resource returns data', async ({ request }) => {
    const response = await request.get('/api/resource', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('items');
  });
});
```

````

---

#### 7. COMPLEX DATA FLOWS

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔄 COMPLEX DATA FLOWS                                                         │
└──────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
FLOW: [Flow Name] (e.g., Checkout Process)
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  1. Client          2. API              3. DB            4. External        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ┌──────────┐  POST /api/xxx  ┌──────────┐                                  │
│  │  Client  │ ────────────────►│  Handler │                                  │
│  └──────────┘                 └────┬─────┘                                  │
│                                    │                                         │
│                                    ▼                                         │
│                              ┌──────────┐     INSERT      ┌──────────┐      │
│                              │ Validate │ ────────────────►│  Table A │      │
│                              └────┬─────┘                 └──────────┘      │
│                                   │                                         │
│                                   ▼                                         │
│                              ┌──────────┐     API Call    ┌──────────┐      │
│                              │ Service  │ ────────────────►│  Stripe  │      │
│                              └────┬─────┘                 └──────────┘      │
│                                   │                                         │
│                                   ▼                                         │
│  ┌──────────┐     Response   ┌──────────┐                                  │
│  │  Client  │◄───────────────│  Return  │                                  │
│  └──────────┘                └──────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

**Flow steps:**

1. **Initial request:** Client sends `POST /api/xxx` with payload
2. **Validation:** Handler validates request body with Zod/Yup
3. **Persistence:** Saves to `table_a` with initial state
4. **External service:** Calls Stripe API to process payment
5. **State update:** Updates `table_a` with result
6. **Response:** Returns result to client

**Tables involved:** `table_a`, `table_b`
**External services:** Stripe

**Main endpoint:** `POST /api/xxx`
**Related endpoints:** `GET /api/xxx/[id]/status`
````

---

#### 8. QA SUMMARY TABLE

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ ✅ QA SUMMARY TABLE                                                           │
└──────────────────────────────────────────────────────────────────────────────┘

## Quick Reference Card

| #   | Endpoint                | Auth | Happy Path                      | Error Cases              |
| --- | ----------------------- | ---- | ------------------------------- | ------------------------ |
| 1   | `POST /api/auth/signup` | 🔓   | Valid email → 201               | Duplicate email → 409    |
| 2   | `POST /api/auth/login`  | 🔓   | Correct credentials → 200+token | Wrong credentials → 401  |
| 3   | `GET /api/auth/me`      | 🔐   | Valid token → 200+user          | No token → 401           |
| ... | ...                     | ...  | ...                             | ...                      |

## Suggested Test Cases

### Authentication

- [ ] Signup with new email → 201 Created
- [ ] Signup with existing email → 409 Conflict
- [ ] Login with valid credentials → 200 + token
- [ ] Login with invalid credentials → 401 Unauthorized
- [ ] Protected request without token → 401 Unauthorized
- [ ] Protected request with expired token → 401 Unauthorized
- [ ] Admin request without admin role → 403 Forbidden

### CRUD Operations

- [ ] GET list without filters → 200 + array
- [ ] GET list with pagination → 200 + limited items
- [ ] GET by existing ID → 200 + object
- [ ] GET by non-existing ID → 404 Not Found
- [ ] POST create valid resource → 201 Created
- [ ] POST with invalid body → 400 Bad Request
- [ ] PUT update own resource → 200 Updated
- [ ] PUT update someone else's resource → 403 Forbidden
- [ ] DELETE own resource → 204 No Content
- [ ] DELETE someone else's resource → 403 Forbidden

## Coverage by Domain

| Domain    | Endpoints | Happy Cases | Error Cases | Coverage |
| --------- | --------- | ----------- | ----------- | -------- |
| Auth      | N         | N           | N           | 0%       |
| [Domain]  | N         | N           | N           | 0%       |
| **TOTAL** | **N**     | **N**       | **N**       | **0%**   |
```

---

## PHASE 3: INTEGRATION

### 3.1 Update System Prompt

Search in the system prompt file (CLAUDE.md or similar) if an "API Architecture" or "Endpoints" section exists.

**If it DOESN'T exist, add:**

```markdown
## API Architecture

See `.context/api-architecture.md` for comprehensive API documentation including:

- Complete endpoint catalog grouped by domain
- Authentication requirements per endpoint
- Testing guides (DevTools, Postman, cURL, Playwright)
- Complex data flow diagrams
- QA testing checklist

**Stack:** [Detected framework]
**Total Endpoints:** [N]
**Last updated:** [date]
```

**If it exists, update** with relevant information.

### 3.2 UPDATE Mode

If UPDATE mode was detected:

1. Generate the new document
2. Compare with the previous version
3. Show summary of changes:

```
📊 Changes detected in API Architecture:

ENDPOINTS:
+ POST /api/new-endpoint (added)
~ PUT /api/existing (modified: new param)
- DELETE /api/removed (deleted)

DOMAINS:
+ Payments (new domain with 5 endpoints)

AUTHENTICATION:
~ /api/public/data is now Protected

Do you want to apply these changes? (yes/no)
```

4. Only overwrite if user confirms

---

## FINAL CHECKLIST

Before saving, verify:

- [ ] Visual header with project name and stack
- [ ] Executive summary with statistics
- [ ] Complete architecture with ASCII diagram
- [ ] Catalog of ALL endpoints found
- [ ] Detail of each endpoint with request/response
- [ ] Authentication classified (Public/Protected/Admin/Owner)
- [ ] Testing guide with examples for each method
- [ ] Complex flows documented with diagrams
- [ ] QA summary table with test cases
- [ ] System prompt updated with reference

---

## FINAL REPORT

When finished, show:

```markdown
# ✅ API Architecture Map Generated

## File Created:

`.context/api-architecture.md`

## System Documented:

[Project name] - [Detected stack]

## Content:

- **Detected stack:** [Framework]
- **Total endpoints:** N
- **Public endpoints:** N
- **Protected endpoints:** N
- **Admin endpoints:** N
- **Domains documented:** N
- **Complex flows:** N

## System Prompt Updated:

`[file]` - "API Architecture" section added/updated

## Related Documents:

- `.context/business-data-map.md` - Business flows
- `.context/api-auth.md` - Detailed auth documentation

## Next Steps:

For automated testing, run:

- `.prompts/stage-2-exploratory/api-exploration.md`
- `.prompts/stage-4-automation/coding/integration-test-coding.md`
```

---

## PHILOSOPHY OF THIS PROMPT

- **Visual first:** ASCII diagrams are easier to understand than text
- **Testing oriented:** Each endpoint with practical examples of how to test it
- **Stack agnostic:** Detects any common backend framework
- **Don't duplicate:** References business-data-map.md for business flows
- **Maintainable:** CREATE/UPDATE pattern to keep synchronized
- **For QA:** Summary table and checklist ready to use

**Use the tools you have available** (MCPs, file search, code reading) to freely explore the system and fully document the API.
