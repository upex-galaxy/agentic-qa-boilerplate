# API Testing Guide - Supabase + Next.js

This guide covers all API Testing strategies for projects using **Supabase** (PostgreSQL + PostgREST) and **Next.js** (API Routes), including manual, automated, and AI-assisted testing.

---

## Project Setup

Before using this guide, configure the following environment variables in your project:

```bash
# .env.local or .env.test

# Supabase
NEXT_PUBLIC_SUPABASE_URL={{SUPABASE_URL}}
# Example: https://abcdefghijklmnop.supabase.co

NEXT_PUBLIC_SUPABASE_ANON_KEY={{SUPABASE_ANON_KEY}}
# Example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIs...

# Test users (create in Supabase Auth)
TEST_USER_EMAIL={{TEST_USER_EMAIL}}
# Example: test.user@yourproject.com

TEST_USER_PASSWORD={{TEST_USER_PASSWORD}}
# Example: TestPassword123!

TEST_ADMIN_EMAIL={{TEST_ADMIN_EMAIL}}
# Example: test.admin@yourproject.com

TEST_ADMIN_PASSWORD={{TEST_ADMIN_PASSWORD}}
# Example: AdminPassword123!
```

---

## Table of Contents

| Document                                      | Description                                          | Level        |
| --------------------------------------------- | ---------------------------------------------------- | ------------ |
| [Architecture](./architecture.md)             | Overview of the 2 APIs (Supabase REST + Next.js)    | Fundamental  |
| [Authentication](./authentication.md)         | How to use ONE token for both APIs                   | Fundamental  |
| [DevTools Testing](./devtools-testing.md)     | Manual testing by intercepting requests in browser   | Basic        |
| [Postman Testing](./postman-testing.md)       | Manual testing with collections and environments     | Intermediate |
| [MCP Testing](./mcp-testing.md)               | AI-assisted testing using MCP tools                  | Intermediate |
| [Playwright Testing](./playwright-testing.md) | Automated testing with KATA architecture             | Advanced     |

---

## API Architecture

This type of project uses **two types of APIs**:

### 1. Supabase REST API (PostgREST)

```
Client --> PostgREST --> PostgreSQL + RLS Policies
```

- **Base URL:** `{{SUPABASE_URL}}/rest/v1/`
  - Example: `https://abcdefghijklmnop.supabase.co/rest/v1/`
- **Endpoints:** Auto-generated from DB schema
- **Authentication:** `apikey` header + `Authorization: Bearer <jwt>` for authenticated operations
- **Security:** Row Level Security (RLS) policies in PostgreSQL

**Typical table examples:**

| Endpoint    | Description        |
| ----------- | ------------------ |
| `/users`    | User profiles      |
| `/products` | Product catalog    |
| `/orders`   | Orders/purchases   |
| `/reviews`  | Product reviews    |
| `/payments` | Payment transactions |

### 2. Next.js API Routes (Custom)

```
Client --> Next.js API --> Business Logic --> Supabase/Stripe/Email
```

- **Base URL:** `http://localhost:3000/api/` (dev) or `https://[domain]/api/` (prod)
- **Endpoints:** Manually defined for complex logic

**Typical custom endpoint examples:**

| Method | Endpoint                          | Description             |
| ------ | --------------------------------- | ----------------------- |
| POST   | `/api/checkout/session`           | Create payment session  |
| POST   | `/api/orders/[id]/cancel`         | Cancel an order         |
| GET    | `/api/orders/[id]/tracking`       | Get shipping status     |
| GET    | `/api/products/[id]/availability` | Check stock             |
| POST   | `/api/webhooks/stripe`            | Stripe webhook          |
| POST   | `/api/webhooks/shipping`          | Shipping webhook        |

---

## Authentication and Tokens

### Key Concepts

| Concept              | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| **anon key**         | Public key for anonymous access. Limited by RLS.               |
| **service_role key** | Private key that bypasses RLS. BACKEND only.                   |
| **User JWT**         | Authenticated user token. Contains `user_id` and `role`.       |
| **RLS Policies**     | Rules in PostgreSQL that control access per user.              |

### Authentication Flow

```bash
# 1. Login - Get user JWT
POST {{SUPABASE_URL}}/auth/v1/token?grant_type=password
# Example: POST https://abcdefghijklmnop.supabase.co/auth/v1/token?grant_type=password

Content-Type: application/json
apikey: {{SUPABASE_ANON_KEY}}

{
  "email": "user@example.com",
  "password": "password123"
}

# Response:
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",  # <-- This is the JWT
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    ...
  }
}
```

```bash
# 2. Use the JWT in authenticated requests
GET {{SUPABASE_URL}}/rest/v1/orders
# Example: GET https://abcdefghijklmnop.supabase.co/rest/v1/orders

apikey: {{SUPABASE_ANON_KEY}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# RLS applies: you will only see YOUR orders (where user_id = your user_id)
```

### Required Headers

| Header          | Value                   | When                                      |
| --------------- | ----------------------- | ----------------------------------------- |
| `apikey`        | `{{SUPABASE_ANON_KEY}}` | Always (Supabase REST)                    |
| `Authorization` | `Bearer <JWT>`          | Authenticated operations                  |
| `Content-Type`  | `application/json`      | POST/PATCH requests                       |
| `Prefer`        | `return=representation` | To receive the created/updated object     |

---

## Quick Reference: Request Structure

### Anonymous Request (public read)

```bash
GET /rest/v1/products?category=eq.electronics&select=id,name,price,image_url
Headers:
  apikey: {{SUPABASE_ANON_KEY}}
```

### Authenticated Request (as user)

```bash
POST /rest/v1/reviews
Headers:
  apikey: {{SUPABASE_ANON_KEY}}
  Authorization: Bearer <USER_JWT>
  Content-Type: application/json
  Prefer: return=representation
Body:
  {"product_id": "...", "rating": 5, "comment": "Excellent product!"}
```

### API Route Request (Next.js)

```bash
POST /api/orders/abc123/cancel
Headers:
  Content-Type: application/json
  Cookie: <session_cookies>  # Handled by browser
Body:
  {"reason": "Changed my mind"}
```

---

## Environments

| Environment | Web URL                                  | API URL                     |
| ----------- | ---------------------------------------- | --------------------------- |
| Development | `http://localhost:3000`                  | `http://localhost:3000/api` |
| Staging     | `https://{{PROJECT}}-staging.vercel.app` | Same + `/api`               |
| Production  | `https://{{PROJECT}}.vercel.app`         | Same + `/api`               |

---

## Next Step

Choose the guide that best fits your needs:

- **Understand the architecture?** --> [architecture.md](./architecture.md)
- **Understand authentication?** --> [authentication.md](./authentication.md)
- **Debugging in the browser?** --> [devtools-testing.md](./devtools-testing.md)
- **Create reusable collections?** --> [postman-testing.md](./postman-testing.md)
- **Testing with AI/Claude?** --> [mcp-testing.md](./mcp-testing.md)
- **Automation with code?** --> [playwright-testing.md](./playwright-testing.md)
