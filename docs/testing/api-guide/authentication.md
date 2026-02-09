# Authentication - Unified Token Strategy

> How to use ONE SINGLE TOKEN to authenticate to both APIs (Supabase REST and Next.js API Routes).

---

## Key Concept

The Supabase JWT is **the same token** for everything. Only the transport method changes:

```
+-----------------------------------------------------------------------------+
|                      ONE TOKEN, TWO WAYS TO USE IT                          |
+-----------------------------------------------------------------------------+
|                                                                             |
|   SUPABASE REST API          |         NEXT.JS API ROUTES                  |
|   (/rest/v1/*)               |         (/api/*)                            |
|                              |                                             |
|   Header:                    |         Cookie:                             |
|   Authorization: Bearer JWT  |         sb-xxx-auth-token = base64(JWT)     |
|                              |                                             |
|   --------------------------------------------------------------------     |
|                              |                                             |
|               IT'S THE SAME JWT, ONLY THE TRANSPORT CHANGES                |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Step 1: Obtain the Token (Login via API)

### Request

```http
POST {{SUPABASE_URL}}/auth/v1/token?grant_type=password
# Example: POST https://abcdefghijklmnop.supabase.co/auth/v1/token?grant_type=password

Content-Type: application/json
apikey: {{SUPABASE_ANON_KEY}}
# Example: apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "email": "{{TEST_USER_EMAIL}}",
  "password": "{{TEST_USER_PASSWORD}}"
}
# Example:
# {
#   "email": "test.user@myproject.com",
#   "password": "TestPassword123!"
# }
```

### Response

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzAzMTIzNDU2LCJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InRlc3QudXNlckBtaXByb3llY3RvLmNvbSIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.xxx",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1703123456,
  "refresh_token": "abc123...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "test.user@myproject.com",
    "user_metadata": {
      "name": "Test User",
      "role": "customer"
    }
  }
}
```

**Save:**

- `access_token` --> To use in requests
- `user.id` --> For filters and validations
- `refresh_token` --> To renew the token when it expires

---

## Step 2: Use the Token in Supabase REST API

### Required Headers

```http
GET {{SUPABASE_URL}}/rest/v1/orders?user_id=eq.550e8400-e29b-41d4-a716-446655440000
# Example: GET https://abcdefghijklmnop.supabase.co/rest/v1/orders?user_id=eq.550e8400-...

apikey: {{SUPABASE_ANON_KEY}}           # <-- ANON KEY (always)
Authorization: Bearer {{ACCESS_TOKEN}}  # <-- ACCESS TOKEN from login
```

### cURL Example

```bash
curl -X GET \
  '{{SUPABASE_URL}}/rest/v1/orders?user_id=eq.550e8400-e29b-41d4-a716-446655440000' \
  -H 'apikey: {{SUPABASE_ANON_KEY}}' \
  -H 'Authorization: Bearer {{ACCESS_TOKEN}}'

# Real example:
# curl -X GET \
#   'https://abcdefghijklmnop.supabase.co/rest/v1/orders?user_id=eq.550e8400-...' \
#   -H 'apikey: eyJhbGciOiJIUzI1NiIs...' \
#   -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...'
```

### JavaScript Example

```javascript
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?user_id=eq.${userId}`, {
  headers: {
    apikey: ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  },
});
```

---

## Step 3: Use the Token in Next.js API Routes

Next.js endpoints (`/api/*`) expect the token in a **cookie**, not in a header.

### Cookie Structure

```
Name: sb-{{PROJECT_REF}}-auth-token
# Example: sb-abcdefghijklmnop-auth-token

Value:  base64(JSON with the token)
```

### JSON Content (before base64)

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "abc123...",
  "expires_at": 1703123456,
  "expires_in": 3600,
  "token_type": "bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "test.user@myproject.com"
  }
}
```

### Example: Create the Cookie Manually

```javascript
// 1. Build the token object
const tokenData = {
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: userId,
    email: userEmail,
  },
};

// 2. Encode in base64
const cookieValue = btoa(JSON.stringify(tokenData));

// 3. The cookie name (replace PROJECT_REF with your Supabase project ref)
const cookieName = 'sb-{{PROJECT_REF}}-auth-token';
// Example: 'sb-abcdefghijklmnop-auth-token'
```

### cURL Example with Cookie

```bash
# First, build the cookie value (base64 of the JSON)
TOKEN_JSON='{"access_token":"eyJ...","refresh_token":"abc...","expires_at":1703123456,"token_type":"bearer","user":{"id":"550e...","email":"test@..."}}'
COOKIE_VALUE=$(echo -n "$TOKEN_JSON" | base64)

# Then, make the request
curl -X GET \
  'http://localhost:3000/api/notifications/unread' \
  -H "Cookie: sb-{{PROJECT_REF}}-auth-token=$COOKIE_VALUE"

# Real example:
# curl -X GET \
#   'http://localhost:3000/api/notifications/unread' \
#   -H "Cookie: sb-abcdefghijklmnop-auth-token=$COOKIE_VALUE"
```

---

## Step 4: Use in Postman

### For Supabase REST API

1. In **Headers**, add:
   - `apikey`: `{{anon_key}}`
   - `Authorization`: `Bearer {{access_token}}`

2. Use the Login request to obtain and save the token automatically (see [04-testing-postman.md](./04-testing-postman.md))

### For Next.js API Routes

1. In **Headers**, add:
   - `Cookie`: `sb-{{PROJECT_REF}}-auth-token={{cookie_value}}`

2. Create a Pre-request Script to build the cookie:

```javascript
// Pre-request Script in Postman
const tokenData = {
  access_token: pm.environment.get('access_token'),
  refresh_token: pm.environment.get('refresh_token'),
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: pm.environment.get('user_id'),
    email: pm.environment.get('user_email'),
  },
};

const cookieValue = btoa(JSON.stringify(tokenData));
pm.environment.set('cookie_value', cookieValue);
```

---

## Step 5: Use in Playwright

### Concept

```
+-----------------------------------------------------------------------------+
|                   AUTHENTICATION FLOW IN PLAYWRIGHT                         |
+-----------------------------------------------------------------------------+
|                                                                             |
|   1. Login via API Request (request fixture)                               |
|      +-- Obtain access_token, refresh_token, user_id                       |
|                                                                             |
|   2. Inject Cookie in Browser Context                                      |
|      +-- page.context().addCookies([...])                                  |
|                                                                             |
|   3. Now you can:                                                           |
|      |-- Navigate in UI (cookies go automatically)                         |
|      |-- Make requests to /rest/v1/* (with Authorization header)           |
|      +-- Make requests to /api/* (cookies go automatically)                |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Steps in Code

```typescript
// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PROJECT_REF = SUPABASE_URL.split('//')[1].split('.')[0];
// Example: 'abcdefghijklmnop' from 'https://abcdefghijklmnop.supabase.co'

// 1. Login via API
const loginResponse = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  headers: { apikey: ANON_KEY },
  data: { email, password },
});
const { access_token, refresh_token, user } = await loginResponse.json();

// 2. Build cookie
const cookieData = {
  access_token,
  refresh_token,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: user.id, email: user.email },
};
const cookieValue = Buffer.from(JSON.stringify(cookieData)).toString('base64');

// 3. Inject in browser
await page.context().addCookies([
  {
    name: `sb-${PROJECT_REF}-auth-token`,
    value: cookieValue,
    domain: 'localhost',
    path: '/',
  },
]);

// 4. Now the browser is authenticated!
await page.goto('/dashboard'); // You're already logged in, without going through /login

// 5. For API requests in the same test:
//    - Supabase REST: use access_token in header
//    - Next.js API: cookies are already there, they go automatically via page.request
```

---

## Summary Table

| API                              | Auth Method | How to Send                              |
| -------------------------------- | ----------- | ---------------------------------------- |
| **Supabase REST** (`/rest/v1/*`) | Header      | `Authorization: Bearer <access_token>`   |
| **Next.js API** (`/api/*`)       | Cookie      | `sb-{{PROJECT_REF}}-auth-token=<base64>` |
| **Browser (UI)**                 | Cookie      | Same cookie, sent automatically          |

---

## Test Users (Example)

| Role         | Email                  | Password                  |
| ------------ | ---------------------- | ------------------------- |
| **Customer** | `{{TEST_USER_EMAIL}}`  | `{{TEST_USER_PASSWORD}}`  |
| **Admin**    | `{{TEST_ADMIN_EMAIL}}` | `{{TEST_ADMIN_PASSWORD}}` |

Example:

| Role         | Email                          | Password       |
| ------------ | ------------------------------ | -------------- |
| **Customer** | `test.customer@myproject.com` | `Customer123!` |
| **Admin**    | `test.admin@myproject.com`    | `Admin123!`    |

---

## Refresh Token (Renew Session)

When the `access_token` expires (1 hour by default), use the `refresh_token`:

```http
POST {{SUPABASE_URL}}/auth/v1/token?grant_type=refresh_token
# Example: POST https://abcdefghijklmnop.supabase.co/auth/v1/token?grant_type=refresh_token

Content-Type: application/json
apikey: {{SUPABASE_ANON_KEY}}

{
  "refresh_token": "abc123..."
}
```

Response: New `access_token` and `refresh_token`.

---

## Verify Token (Debug)

To see what a JWT contains, decode it at https://jwt.io or:

```javascript
// Decode JWT payload (without verifying signature)
const [header, payload, signature] = accessToken.split('.');
const decoded = JSON.parse(atob(payload));
console.log(decoded);
// { sub: "user-id", email: "...", exp: 1703123456, ... }
```

**Important JWT fields:**

- `sub`: User ID
- `email`: User email
- `exp`: Expiration timestamp
- `role`: Always "authenticated" for logged in users
- `user_metadata`: Additional user data

---

## Next Step

- For manual testing with UI: [03-testing-devtools.md](./03-testing-devtools.md)
- For testing with Postman: [04-testing-postman.md](./04-testing-postman.md)
- For automated testing: [06-testing-playwright.md](./06-testing-playwright.md)
