# API Testing with DevTools

This guide explains how to intercept and analyze API requests using browser DevTools.

---

## Why Requests Look "Weird"

### The Problem You Notice

When you open DevTools > Network, you probably see:

```
# What you expected (traditional API):
POST /api/reviews          --> {"product_id": "abc", "rating": 5}
GET  /api/products/abc     --> {"name": "Product", "price": 99.99}

# What you see (Supabase PostgREST):
GET  /rest/v1/products?category=eq.electronics&select=id,name,price...
POST /rest/v1/reviews?select=*
GET  /rest/v1/orders?or=(user_id.eq.xxx,seller_id.eq.xxx)&order=created_at.desc
```

### Why It's Different

| Aspect              | Traditional API | Supabase PostgREST             |
| ------------------- | --------------- | ------------------------------ |
| **URL**             | `/api/products` | `/rest/v1/products`            |
| **Query Params**    | `?id=abc`       | `?id=eq.abc`                   |
| **Filters**         | In backend      | In URL (PostgREST syntax)      |
| **Field Selection** | Backend decides | `?select=id,name,price`        |
| **Ordering**        | Backend decides | `?order=created_at.desc`       |

---

## PostgREST Syntax (Cheatsheet)

```bash
# Equality
?column=eq.value              # column = 'value'

# Comparisons
?column=gt.5                  # column > 5
?column=gte.5                 # column >= 5
?column=lt.5                  # column < 5
?column=lte.5                 # column <= 5
?column=neq.value             # column != 'value'

# Null checks
?column=is.null               # column IS NULL
?column=not.is.null           # column IS NOT NULL

# Lists
?column=in.(a,b,c)            # column IN ('a', 'b', 'c')

# Text
?column=like.*pattern*        # column LIKE '%pattern%'
?column=ilike.*pattern*       # ILIKE (case insensitive)

# Logic
?or=(col1.eq.a,col2.eq.b)     # col1 = 'a' OR col2 = 'b'
?and=(col1.gt.5,col2.lt.10)   # col1 > 5 AND col2 < 10

# Field selection
?select=id,name,price         # Only those fields
?select=*                     # All fields
?select=*,reviews(*)          # With relation (JOIN)

# Ordering
?order=created_at.desc        # ORDER BY created_at DESC
?order=name.asc,id.desc       # Multiple columns

# Pagination
?limit=10&offset=20           # LIMIT 10 OFFSET 20
```

---

## Configure DevTools for API Testing

### Step 1: Open DevTools

1. Open the app in browser: `http://localhost:3000`
2. F12 or Cmd+Option+I (Mac) / Ctrl+Shift+I (Windows)
3. Go to **Network** tab

### Step 2: Filter by Type

Use these filters to see only relevant content:

| Filter      | Shows                         |
| ----------- | ----------------------------- |
| `Fetch/XHR` | API requests (AJAX)           |
| `Doc`       | Page navigations              |
| `WS`        | WebSocket (Supabase realtime) |

**Recommended:** Click on `Fetch/XHR` to see only API calls.

### Step 3: Filter by URL

In the search field:

```
# Only Supabase REST
rest/v1

# Only Next.js API Routes
/api/

# Specific endpoints
products
orders
users
```

---

## Intercept Authentication Requests

### Login Flow

1. Go to `/login`
2. Open DevTools > Network
3. Enter test credentials:
   - Email: `{{TEST_USER_EMAIL}}`
   - Password: `{{TEST_USER_PASSWORD}}`
   - Example: `test.user@myproject.com` / `TestPassword123!`
4. Click "Sign In"

### Request You'll See

```
POST {{SUPABASE_URL}}/auth/v1/token?grant_type=password
# Example: POST https://abcdefghijklmnop.supabase.co/auth/v1/token?grant_type=password
```

**Headers:**

```
apikey: eyJhbGciOiJIUzI1NiIs...  (anon key)
Content-Type: application/json
```

**Request Body:**

```json
{
  "email": "test.user@myproject.com",
  "password": "TestPassword123!"
}
```

**Response (200 OK):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzA...",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1703123456,
  "refresh_token": "abc123...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "test.user@myproject.com",
    "role": "authenticated",
    "user_metadata": {
      "name": "Test User",
      "role": "customer"
    }
  }
}
```

### Copy the Token

1. Right-click on the login request
2. Copy > Copy response
3. Extract the `access_token` - This is your JWT for other requests

---

## Analyze Authenticated Requests

### Example: View My Orders

After logging in, navigate to `/dashboard/orders`:

**Request:**

```
GET {{SUPABASE_URL}}/rest/v1/orders
    ?select=*,products:order_items(product:products(id,name,image_url))
    &user_id=eq.550e8400-e29b-41d4-a716-446655440000
    &order=created_at.desc

# Example:
# GET https://abcdefghijklmnop.supabase.co/rest/v1/orders?select=*,...
```

**Important Headers:**

```
apikey: eyJhbGciOiJIUzI1NiIs...           # Anon key (always)
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...  # Your JWT from login
```

**URL Breakdown:**

| Part                                 | Meaning                            |
| ------------------------------------ | ---------------------------------- |
| `/rest/v1/orders`                    | Orders table                       |
| `select=*,products:order_items(...)` | All fields + JOIN with products    |
| `user_id=eq.xxx`                     | Where I'm the user                 |
| `order=created_at.desc`              | Order by date descending           |

**Response (200 OK):**

```json
[
  {
    "id": "order-uuid-1",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "delivered",
    "total": 149.99,
    "created_at": "2025-01-29T15:00:00Z",
    "products": [
      {
        "product": {
          "id": "product-uuid",
          "name": "Laptop Stand",
          "image_url": "https://..."
        }
      }
    ]
  }
]
```

---

## Test RLS Policies in DevTools

### Experiment: Try to View Another User's Orders

1. You're logged in as user A
2. In DevTools > Console, execute:

```javascript
// Get the Supabase client
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(
  '{{SUPABASE_URL}}', // Example: 'https://abcdefghijklmnop.supabase.co'
  '{{SUPABASE_ANON_KEY}}'
);

// Try to view orders from ANOTHER user
const { data, error } = await supabase.from('orders').select('*').eq('user_id', 'other-user-id');

console.log('Data:', data); // [] - Empty array!
console.log('Error:', error); // null - No error, but no data
```

**Result:** RLS policy blocks access. You don't see an error, but no data either.

### See the Policy in Action

In Network tab, you'll see:

```
GET /rest/v1/orders?user_id=eq.other-user-id
Status: 200 OK
Response: []
```

The policy `"Users can view their own orders"` automatically filters:

```sql
-- Only returns rows where:
auth.uid() = user_id
```

---

## Validate Responses

### What to Validate in Each Request

| Aspect             | What to Check                              |
| ------------------ | ------------------------------------------ |
| **Status Code**    | 200 (OK), 201 (Created), 204 (No Content) |
| **Headers**        | `content-type: application/json`           |
| **Body Structure** | Expected fields present                    |
| **Data Types**     | Strings, numbers, dates correct            |
| **Relationships**  | JOINs include related data                 |
| **Pagination**     | `content-range` header if applicable       |

### Common Status Codes

| Code  | Meaning       | When                         |
| ----- | ------------- | ---------------------------- |
| `200` | OK            | Successful GET               |
| `201` | Created       | Successful POST              |
| `204` | No Content    | Successful DELETE            |
| `400` | Bad Request   | Incorrect syntax             |
| `401` | Unauthorized  | Missing JWT or expired       |
| `403` | Forbidden     | RLS blocked the operation    |
| `404` | Not Found     | Resource doesn't exist       |
| `409` | Conflict      | Unique constraint violation  |
| `422` | Unprocessable | Validation failed            |

### Example: Create Review (POST)

**Request:**

```
POST /rest/v1/reviews
Headers:
  apikey: ...
  Authorization: Bearer ...
  Content-Type: application/json
  Prefer: return=representation

Body:
{
  "product_id": "product-uuid",
  "user_id": "my-uuid",
  "rating": 5,
  "comment": "Excellent product!"
}
```

**Expected Response (201 Created):**

```json
[
  {
    "id": "new-review-uuid",
    "product_id": "product-uuid",
    "user_id": "my-uuid",
    "rating": 5,
    "comment": "Excellent product!",
    "created_at": "2025-01-29T10:30:00Z"
  }
]
```

**Validations:**

- [ ] Status: 201
- [ ] `id` automatically generated
- [ ] `created_at` has current timestamp
- [ ] All body fields are present

---

## Tips and Tricks

### 1. Preserve Log

Enable **"Preserve log"** to keep requests between navigations:

```
[x] Preserve log
```

### 2. Copy as cURL

To replicate a request in terminal or Postman:

1. Right-click on the request
2. Copy > Copy as cURL

```bash
curl '{{SUPABASE_URL}}/rest/v1/products?category=eq.electronics' \
  -H 'apikey: eyJ...' \
  -H 'Authorization: Bearer eyJ...'

# Example:
# curl 'https://abcdefghijklmnop.supabase.co/rest/v1/products?category=eq.electronics' \
#   -H 'apikey: eyJ...' \
#   -H 'Authorization: Bearer eyJ...'
```

### 3. Copy as Fetch

To replicate in JavaScript:

```javascript
fetch('{{SUPABASE_URL}}/rest/v1/products?category=eq.electronics', {
  headers: {
    apikey: 'eyJ...',
    Authorization: 'Bearer eyJ...',
  },
});

// Example:
// fetch("https://abcdefghijklmnop.supabase.co/rest/v1/products?category=eq.electronics", {...})
```

### 4. Throttling

Simulate slow connections for testing:

1. Network tab > Throttling dropdown
2. Select "Slow 3G" or "Offline"

### 5. Block Requests

Block endpoints to test error handling:

1. Right-click on a request
2. Block request URL
3. Reload the page - see how the app handles the failure

---

## Testing Checklist with DevTools

### For each feature:

- [ ] Identify all involved requests
- [ ] Verify correct headers (apikey, Authorization)
- [ ] Validate request body (POST/PATCH)
- [ ] Verify expected status code
- [ ] Validate response structure
- [ ] Test with user without permissions (RLS)
- [ ] Test with invalid data
- [ ] Verify UI error handling

---

## Next Step

If you want to create reusable and organized requests, continue with:
--> [postman-testing.md](./postman-testing.md)
