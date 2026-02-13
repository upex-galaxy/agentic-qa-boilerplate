# API and Database Testing: Conceptual Guide

## Introduction

In modern software development, a QA Engineer needs to understand how to test both the API layer and the database directly. This guide explains the fundamental concepts so you can perform effective testing at both layers.

---

## How is an API documented in the industry?

In mature teams, **you shouldn't need to ask the Tech Lead** how to use the API. The expectation is that accessible dynamic documentation exists, generally at a URL like `/docs`, `/swagger`, or `/api-docs`.

If you find yourself asking the team or reading code directly to understand the API, that's a symptom of **technical debt**.

### The current standard: OpenAPI

**OpenAPI Specification (OAS)** is the de facto standard for describing REST APIs. It used to be called Swagger, and many people still use both terms interchangeably.

It's a YAML or JSON file that describes:

- All available endpoints
- HTTP methods (GET, POST, PUT, DELETE...)
- Request parameters and bodies
- Possible responses with their types
- Authentication schemes

### How is documentation generated?

There are two main approaches:

**Code-first**: The code is the source of truth. You use decorators or annotations in your framework, and documentation is generated automatically.

Examples of frameworks that support it:

- **FastAPI** (Python): generates OpenAPI without extra configuration
- **NestJS** (Node): with decorators `@ApiProperty()`, `@ApiResponse()`
- **Spring Boot** (Java): with springdoc-openapi

**Design-first**: You write the OpenAPI specification first, and then generate code or mocks from it. Useful when there are contracts between teams.

### Visualization tools

Once you have the OpenAPI file, you render it with:

- **Swagger UI**: interactive interface where you can test endpoints directly
- **Redoc**: cleaner documentation, reference style
- **Stoplight**: complete API design platform

---

## Authentication: The current standard

**JWT with Bearer tokens** is the dominant standard for private APIs.

The typical flow:

1. You login to `/auth/login` with credentials
2. You receive a JWT token
3. You send that token in the `Authorization: Bearer <token>` header in each request

OAuth 2.0 is used when you need to delegate access (for example, "Sign in with Google").

---

## Specific case: Supabase

### What is PostgREST?

Supabase uses **PostgREST** internally. This service automatically generates a REST API based on your PostgreSQL database structure.

**What you get without doing anything:**

- Complete REST API for all your tables
- Auto-generated documentation accessible from the Supabase dashboard ("API Docs" section)
- TypeScript type generation with `supabase gen types`

### Automatically generated endpoints

For each table in your `public` schema, you automatically have:

| Operation      | HTTP Method | Endpoint                          |
| -------------- | ----------- | --------------------------------- |
| Read all       | `GET`       | `/rest/v1/table`                  |
| Read filtered  | `GET`       | `/rest/v1/table?column=eq.value`  |
| Insert         | `POST`      | `/rest/v1/table`                  |
| Update         | `PATCH`     | `/rest/v1/table?id=eq.123`        |
| Delete         | `DELETE`    | `/rest/v1/table?id=eq.123`        |

### Authentication in Supabase

```
Required headers:
  apikey: <SUPABASE_ANON_KEY>
  Authorization: Bearer <JWT_TOKEN>  // optional, for authenticated users
```

The `anon key` gives basic access, but RLS (Row Level Security) policies determine what data each role can see/modify.

### OpenAPI in Supabase

**PostgREST serves the OpenAPI specification (Swagger 2.0) automatically.**

```
GET https://<project-ref>.supabase.co/rest/v1/?apikey=<SUPABASE_ANON_KEY>
```

This returns a JSON with the complete specification: all tables, columns, types, relationships.

The specification **is generated dynamically** based on:

- The tables exposed in the `public` schema
- The permissions of the role making the request (anon or authenticated)
- The SQL comments you've put on tables/columns

### Relationships (JOINs) in the API

Something many people don't know: PostgREST uses "embedding" to do automatic JOINs based on foreign keys:

```bash
# Get orders WITH customer data (equivalent to a JOIN)
GET /rest/v1/orders?select=id,total,customers(name,email)

# Roughly equivalent to:
SELECT orders.id, orders.total, customers.name, customers.email
FROM orders
JOIN customers ON orders.customer_id = customers.id
```

**API limitations:**

- You can't do arbitrary JOINs (only those defined by foreign keys)
- You can't do complex aggregations (`GROUP BY`, `HAVING`, subqueries)
- You can't do `UNION`, CTEs, window functions, etc.

For that you need **RPC functions** (SQL functions you expose as endpoints) or **direct SQL access**.

---

## Difference between API vs Database Testing

### Is the API "disguised" SQL?

Yes and no. PostgREST translates HTTP requests to SQL queries, but with limitations and some extra capabilities.

### The system layers

```
┌─────────────────────────────────────────┐
│           Frontend (UI)                  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         API Layer (PostgREST)            │  ← API Testing
│  • JWT Authentication                    │
│  • Row Level Security (RLS)              │
│  • Input validations                     │
│  • Response transformation               │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Database (Postgres)              │  ← DB Testing
│  • Constraints (FK, UNIQUE, CHECK)       │
│  • Triggers                              │
│  • "Raw" data                            │
└─────────────────────────────────────────┘
```

### Direct comparison

| Aspect                       | Testing via API                                   | Testing via direct SQL |
| ---------------------------- | ------------------------------------------------- | ---------------------- |
| **What you test**            | The API contract (endpoints, auth, validations)   | The data itself        |
| **Access layer**             | Goes through RLS, validations, middleware         | Direct to the DB       |
| **Authentication**           | JWT tokens, API keys                              | Connection string      |
| **Permissions**              | User's RLS policies                               | Postgres role permissions |
| **Response format**          | Structured JSON                                   | Rows/columns           |
| **Complex joins**            | Limited to foreign keys                           | Any query              |
| **Business validations**     | Applied (triggers, constraints via API)           | Depends on how you insert |

---

## When to use each type of testing?

### API testing is better for:

**Validating the API contract:**

```
POST /rest/v1/users with invalid email
→ Should return 400 Bad Request
→ The error message should be clear
```

**Validating authorization:**

```
GET /rest/v1/orders (without token)
→ Should return 401

GET /rest/v1/orders (with user A token)
→ Should only see user A's orders (RLS)
```

**Validating that the response has the expected format:**

```
GET /rest/v1/products?select=id,name,price
→ The JSON should have exactly those fields
→ The types should be correct
```

### SQL testing is better for:

**Verifying data integrity after an operation:**

```sql
-- The frontend did a checkout, I verify all entities were created
SELECT COUNT(*) FROM orders WHERE user_id = 'X' AND created_at > NOW() - INTERVAL '1 minute';
SELECT COUNT(*) FROM order_items WHERE order_id = (SELECT id FROM orders WHERE...);
SELECT balance FROM wallets WHERE user_id = 'X'; -- Was it deducted correctly?
```

**Validation queries that the API doesn't expose:**

```sql
-- Are there orphaned orders (without user)?
SELECT * FROM orders WHERE user_id NOT IN (SELECT id FROM users);

-- Do the totals match?
SELECT o.id, o.total, SUM(oi.price * oi.quantity) as calculated
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, o.total
HAVING o.total != SUM(oi.price * oi.quantity);
```

**Verifying side effects (triggers, cascades):**

```sql
-- If I deleted a user, were their related data deleted?
SELECT * FROM orders WHERE user_id = 'deleted_user';
SELECT * FROM sessions WHERE user_id = 'deleted_user';
```

### The combined approach (the most powerful)

```
1. I perform an action via UI or API
2. I verify with SQL that the data is correct
3. I verify with API that the response is correct
```

**Concrete example:**

```javascript
// Test: Create purchase order
test('checkout creates order with correct items', async () => {
  // 1. Action via API (simulates what the frontend would do)
  const response = await api.post('/checkout', {
    items: [{ product_id: 1, quantity: 2 }],
  });

  expect(response.status).toBe(201);
  const orderId = response.data.id;

  // 2. Verification via API (what the user would see)
  const orderResponse = await api.get(`/orders/${orderId}`);
  expect(orderResponse.data.status).toBe('pending');

  // 3. Verification via SQL (what's actually in the DB)
  const dbResult = await sql`
    SELECT
      o.total,
      COUNT(oi.id) as item_count,
      SUM(oi.quantity) as total_quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.id = ${orderId}
    GROUP BY o.id
  `;

  expect(dbResult[0].item_count).toBe(1);
  expect(dbResult[0].total_quantity).toBe(2);
});
```

---

## Bugs detected by each type of testing

### Only detectable with SQL:

- Orphaned data due to misconfigured cascades
- Incorrect timestamps due to timezone issues
- Fields the API doesn't expose but are wrong
- Inconsistencies between related tables

### Only detectable with API:

- Responses with incorrect format
- RLS policies that filter data incorrectly
- Input validations that don't work
- Incorrect cache headers

---

## Security: DDL vs DML

There's a key distinction to understand permissions:

| Level            | What it controls                                 | How it's configured                            |
| ---------------- | ------------------------------------------------ | ---------------------------------------------- |
| **DDL** (schema) | Create/modify/delete tables, columns, types      | Postgres roles (`postgres`, `service_role`)    |
| **DML** (data)   | SELECT, INSERT, UPDATE, DELETE on rows           | RLS policies + roles `anon`/`authenticated`    |

**Important point:** Supabase's `anon key` and `service_role key` **CANNOT modify the schema**. Only the `postgres` role (direct DB access) can do DDL.

When you use the REST API with the `anon key`, **you can only do DML operations** (read, insert, update, delete data). You can't touch columns or types.

---

## Summary

| Question                      | Answer                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| Is the API disguised SQL?     | Partially. It translates HTTP to SQL but with limitations  |
| Does Supabase do JOINs?       | Yes, via "embedding" based on foreign keys                 |
| Is testing API vs DB the same?| No. You test different layers with different concerns      |
| Which to use for QA?          | **Both**, because each detects different types of bugs     |

The combination of both types of testing is what makes a complete QA Engineer: not just verifying that "it works" but that the data is **correct, consistent, and complete**.
