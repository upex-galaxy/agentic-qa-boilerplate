# API Testing with Postman

This guide explains how to configure Postman for API testing in Supabase + Next.js projects, including automatic authentication.

---

## Initial Setup

### Step 1: Create Workspace

1. Open Postman
2. Create Workspace > "{{PROJECT_NAME}} API"
   - Example: "My Project API"
3. Type: Personal or Team

### Step 2: Create Environment

Go to Environments > Create Environment > "{{PROJECT_NAME}} - Development"

**Variables:**

| Variable              | Initial Value             | Current Value                |
| --------------------- | ------------------------- | ---------------------------- |
| `base_url`            | `{{SUPABASE_URL}}`        | (your Supabase URL)          |
| `api_url`             | `{{base_url}}/rest/v1`    | (same)                       |
| `auth_url`            | `{{base_url}}/auth/v1`    | (same)                       |
| `anon_key`            | `{{SUPABASE_ANON_KEY}}`   | (your anon key)              |
| `access_token`        | _(empty)_                 | _(automatically filled)_     |
| `user_id`             | _(empty)_                 | _(automatically filled)_     |
| `test_user_email`     | `{{TEST_USER_EMAIL}}`     | (your test email)            |
| `test_user_password`  | `{{TEST_USER_PASSWORD}}`  | (your test password)         |
| `test_admin_email`    | `{{TEST_ADMIN_EMAIL}}`    | (admin test email)           |
| `test_admin_password` | `{{TEST_ADMIN_PASSWORD}}` | (admin test password)        |

**Example of real values:**

| Variable             | Example                                   |
| -------------------- | ----------------------------------------- |
| `base_url`           | `https://abcdefghijklmnop.supabase.co`    |
| `anon_key`           | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `test_user_email`    | `test.customer@myproject.com`             |
| `test_user_password` | `Customer123!`                            |

---

## Collection: Authentication

### Request: Login as User

**Create request:**

- Name: `Login - User`
- Method: `POST`
- URL: `{{auth_url}}/token?grant_type=password`

**Headers:**

```
apikey: {{anon_key}}
Content-Type: application/json
```

**Body (raw JSON):**

```json
{
  "email": "{{test_user_email}}",
  "password": "{{test_user_password}}"
}
```

**Tests (JavaScript):**

```javascript
// Save token automatically
pm.test('Login successful', function () {
  pm.response.to.have.status(200);
});

pm.test('Token received', function () {
  const response = pm.response.json();

  // Save access_token to use in other requests
  pm.environment.set('access_token', response.access_token);

  // Save user_id
  pm.environment.set('user_id', response.user.id);

  // Save refresh_token (optional)
  pm.environment.set('refresh_token', response.refresh_token);

  // Save email for reference
  pm.environment.set('user_email', response.user.email);

  console.log('✅ Token saved for user:', response.user.email);
});
```

### Request: Login as Admin

Duplicate the previous request and change:

- Name: `Login - Admin`
- Body:

```json
{
  "email": "{{test_admin_email}}",
  "password": "{{test_admin_password}}"
}
```

### Request: Refresh Token

**Create request:**

- Name: `Refresh Token`
- Method: `POST`
- URL: `{{auth_url}}/token?grant_type=refresh_token`

**Headers:**

```
apikey: {{anon_key}}
Content-Type: application/json
```

**Body:**

```json
{
  "refresh_token": "{{refresh_token}}"
}
```

**Tests:**

```javascript
pm.test('Token refreshed', function () {
  pm.response.to.have.status(200);
  const response = pm.response.json();
  pm.environment.set('access_token', response.access_token);
  pm.environment.set('refresh_token', response.refresh_token);
});
```

---

## Collection: Users/Profiles

### Request: List Users (Public)

- Name: `Get Users`
- Method: `GET`
- URL: `{{api_url}}/users?role=eq.seller&select=id,name,email,avatar_url,rating`

**Headers:**

```
apikey: {{anon_key}}
```

_(No Authorization needed for public read)_

**Tests:**

```javascript
pm.test('Status 200', function () {
  pm.response.to.have.status(200);
});

pm.test('Is an array', function () {
  const response = pm.response.json();
  pm.expect(response).to.be.an('array');
});

pm.test('Users have required fields', function () {
  const users = pm.response.json();
  if (users.length > 0) {
    const user = users[0];
    pm.expect(user).to.have.property('id');
    pm.expect(user).to.have.property('name');
  }
});
```

### Request: Get My Profile

- Name: `Get My Profile`
- Method: `GET`
- URL: `{{api_url}}/users?id=eq.{{user_id}}&select=*`

**Headers:**

```
apikey: {{anon_key}}
Authorization: Bearer {{access_token}}
```

**Tests:**

```javascript
pm.test('Status 200', function () {
  pm.response.to.have.status(200);
});

pm.test('Profile found', function () {
  const profiles = pm.response.json();
  pm.expect(profiles).to.have.lengthOf(1);
  pm.expect(profiles[0].id).to.equal(pm.environment.get('user_id'));
});
```

### Request: Update My Profile

- Name: `Update My Profile`
- Method: `PATCH`
- URL: `{{api_url}}/users?id=eq.{{user_id}}`

**Headers:**

```
apikey: {{anon_key}}
Authorization: Bearer {{access_token}}
Content-Type: application/json
Prefer: return=representation
```

**Body:**

```json
{
  "bio": "Updated from Postman - {{$timestamp}}"
}
```

**Tests:**

```javascript
pm.test('Status 200', function () {
  pm.response.to.have.status(200);
});

pm.test('Bio updated', function () {
  const users = pm.response.json();
  pm.expect(users[0].bio).to.include('Updated from Postman');
});
```

---

## Collection: Products

### Request: List Products

- Name: `Get Products`
- Method: `GET`
- URL: `{{api_url}}/products?select=id,name,price,category,image_url&order=created_at.desc&limit=20`

**Headers:**

```
apikey: {{anon_key}}
```

**Tests:**

```javascript
pm.test('Status 200', function () {
  pm.response.to.have.status(200);
});

pm.test('Products have required fields', function () {
  const products = pm.response.json();
  if (products.length > 0) {
    const product = products[0];
    pm.expect(product).to.have.property('id');
    pm.expect(product).to.have.property('name');
    pm.expect(product).to.have.property('price');

    // Save first product for other tests
    pm.environment.set('product_id', product.id);
  }
});
```

### Request: Create Product (Admin)

- Name: `Create Product`
- Method: `POST`
- URL: `{{api_url}}/products`

**Headers:**

```
apikey: {{anon_key}}
Authorization: Bearer {{access_token}}
Content-Type: application/json
Prefer: return=representation
```

**Body:**

```json
{
  "name": "Test Product - {{$timestamp}}",
  "price": 99.99,
  "category": "electronics",
  "description": "Product created from Postman for testing",
  "stock": 100
}
```

**Tests:**

```javascript
pm.test('Status 201 Created', function () {
  pm.response.to.have.status(201);
});

pm.test('Product created correctly', function () {
  const products = pm.response.json();
  pm.expect(products).to.have.lengthOf(1);
  pm.expect(products[0]).to.have.property('id');
  pm.expect(products[0].price).to.equal(99.99);

  // Save for cleanup
  pm.environment.set('new_product_id', products[0].id);
});
```

---

## Collection: Orders

### Request: My Orders

- Name: `Get My Orders`
- Method: `GET`
- URL: `{{api_url}}/orders?user_id=eq.{{user_id}}&select=*,items:order_items(quantity,product:products(name,price))&order=created_at.desc`

**Headers:**

```
apikey: {{anon_key}}
Authorization: Bearer {{access_token}}
```

**Tests:**

```javascript
pm.test('Status 200', function () {
  pm.response.to.have.status(200);
});

pm.test('Orders are mine', function () {
  const orders = pm.response.json();
  const userId = pm.environment.get('user_id');

  orders.forEach(order => {
    pm.expect(order.user_id).to.equal(userId);
  });
});

// Save first order for other tests
const orders = pm.response.json();
if (orders.length > 0) {
  pm.environment.set('order_id', orders[0].id);
}
```

### Request: Create Order

- Name: `Create Order`
- Method: `POST`
- URL: `{{api_url}}/orders`

**Headers:**

```
apikey: {{anon_key}}
Authorization: Bearer {{access_token}}
Content-Type: application/json
Prefer: return=representation
```

**Body:**

```json
{
  "user_id": "{{user_id}}",
  "status": "pending",
  "total": 99.99,
  "shipping_address": {
    "street": "123 Test Street",
    "city": "Test City",
    "zip": "12345"
  }
}
```

**Pre-request Script:**

```javascript
// Verify that we have user_id
if (!pm.environment.get('user_id')) {
  console.warn("⚠️ user_id not defined. Run 'Login' first.");
}
```

**Tests:**

```javascript
pm.test('Status 201 Created', function () {
  pm.response.to.have.status(201);
});

pm.test('Order created correctly', function () {
  const orders = pm.response.json();
  pm.expect(orders).to.have.lengthOf(1);
  pm.expect(orders[0]).to.have.property('id');
  pm.expect(orders[0].status).to.equal('pending');

  // Save for other tests
  pm.environment.set('new_order_id', orders[0].id);
});
```

---

## Collection: Reviews

### Request: Product Reviews

- Name: `Get Product Reviews`
- Method: `GET`
- URL: `{{api_url}}/reviews?product_id=eq.{{product_id}}&select=*,user:users(name,avatar_url)&order=created_at.desc`

**Headers:**

```
apikey: {{anon_key}}
```

### Request: Create Review

- Name: `Create Review`
- Method: `POST`
- URL: `{{api_url}}/reviews`

**Headers:**

```
apikey: {{anon_key}}
Authorization: Bearer {{access_token}}
Content-Type: application/json
Prefer: return=representation
```

**Body:**

```json
{
  "product_id": "{{product_id}}",
  "user_id": "{{user_id}}",
  "rating": 5,
  "comment": "Excellent product! Highly recommended."
}
```

---

## Testing RLS Policies

### Test: Cannot see other users' orders

1. Login as User A
2. Execute this request:

- Name: `RLS Test - Other User Orders`
- Method: `GET`
- URL: `{{api_url}}/orders?user_id=eq.00000000-0000-0000-0000-000000000000`

**Tests:**

```javascript
pm.test('Status 200 but empty array', function () {
  pm.response.to.have.status(200);
  const orders = pm.response.json();
  pm.expect(orders).to.be.an('array');
  pm.expect(orders).to.have.lengthOf(0);
});

console.log('✅ RLS Policy working: Cannot see other users orders');
```

### Test: Cannot update another user's profile

- Name: `RLS Test - Update Other Profile`
- Method: `PATCH`
- URL: `{{api_url}}/users?id=eq.00000000-0000-0000-0000-000000000000`

**Body:**

```json
{
  "name": "Hacked!"
}
```

**Tests:**

```javascript
pm.test('No records updated', function () {
  // PostgREST returns empty array if RLS blocks
  const result = pm.response.json();
  pm.expect(result).to.have.lengthOf(0);
});

console.log('✅ RLS Policy working: Cannot update other users profiles');
```

---

## Global Pre-request Script

In the collection, you can add a script that runs before each request:

**Collection > Pre-request Script:**

```javascript
// Verify that we have valid token
const token = pm.environment.get('access_token');

if (!token && pm.request.headers.has('Authorization')) {
  console.warn('⚠️ No access_token. Run Login first.');
}

// Optional: Verify token expiration
if (token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // convert to ms
    const now = Date.now();

    if (now > exp) {
      console.warn('⚠️ Token expired. Run Login or Refresh Token.');
    }
  } catch (e) {
    // Malformed token
  }
}
```

---

## Collection Runner

To execute all tests in a collection:

1. Click on "..." on the collection
2. Run collection
3. Select the environment
4. Configure:
   - Delay: 100ms (avoid rate limiting)
   - Iterations: 1
5. Run

### Recommended Execution Order

1. `Login - User`
2. `Get My Profile`
3. `Get Products` (saves `product_id`)
4. `Get My Orders`
5. `Get Product Reviews`
6. RLS Tests

---

## Export and Import

### Export Collection

1. Right-click on the collection
2. Export
3. Format: Collection v2.1
4. Save as: `{{project}}-api.postman_collection.json`

### Export Environment

1. Click on the eye icon next to the environment
2. Export
3. Save as: `{{project}}-dev.postman_environment.json`

### Import on Another Machine

1. Import > Upload Files
2. Select the JSON files
3. Adjust environment variables (passwords, keys)

---

## Advanced Tips

### 1. Use Dynamic Variables

```javascript
// In Body
{
  "created_at": "{{$isoTimestamp}}",
  "unique_id": "{{$guid}}",
  "random_number": "{{$randomInt}}"
}
```

### 2. Request Chaining

```javascript
// In Tests of request A, save data
pm.environment.set('product_id', pm.response.json()[0].id);

// In request B, use it
// URL: ?product_id=eq.{{product_id}}
```

### 3. Visualize Responses

```javascript
// In Tests tab
const template = `
<table>
    <tr><th>ID</th><th>Name</th><th>Price</th></tr>
    {{#each response}}
    <tr>
        <td>{{id}}</td>
        <td>{{name}}</td>
        <td>{{price}}</td>
    </tr>
    {{/each}}
</table>
`;

pm.visualizer.set(template, { response: pm.response.json() });
```

---

## Next Step

For testing with AI using MCP:
--> [mcp-testing.md](./mcp-testing.md)
