# System Architecture - APIs & Endpoints

> Technical documentation of the API architecture for Supabase + Next.js projects.
> This document is key for the QA team to understand how to test each type of endpoint.

---

## The Two Project APIs

```
+-----------------------------------------------------------------------------+
|                          BROWSER / CLIENT                                   |
+-------------------------------------+---------------------------------------+
                                      |
                  +-------------------+-------------------+
                  |                                       |
                  v                                       v
+-------------------------------------+   +---------------------------------------+
|                                     |   |                                       |
|    SUPABASE REST API (PostgREST)    |   |     NEXT.JS API ROUTES (Custom)       |
|                                     |   |                                       |
|  Base: {{SUPABASE_URL}}/rest/v1/    |   |  Base: localhost:3000/api (or Vercel) |
|  Ex: abc123.supabase.co/rest/v1/    |   |                                       |
|                                     |   |                                       |
|  +-------------------------------+  |   |  +-------------------------------+    |
|  | Authentication:               |  |   |  | Authentication:               |    |
|  |                               |  |   |  |                               |    |
|  | - Header: apikey (always)     |  |   |  | - Cookie: sb-xxx-auth-token   |    |
|  | - Header: Authorization Bearer|  |   |  |   (handled automatically)     |    |
|  |   (user JWT)                  |  |   |  | - Or Header: X-API-Key (cron) |    |
|  +-------------------------------+  |   |  +-------------------------------+    |
|                                     |   |                                       |
|  Endpoints (auto-generated):        |   |  Endpoints (manual):                  |
|  - GET/POST/PATCH/DELETE /users     |   |  - POST /api/checkout/session         |
|  - GET/POST/PATCH/DELETE /products  |   |  - POST /api/orders/[id]/cancel       |
|  - GET/POST/PATCH/DELETE /orders    |   |  - GET  /api/orders/[id]/tracking     |
|  - GET/POST/PATCH/DELETE /reviews   |   |  - POST /api/webhooks/stripe          |
|  - GET /payments                    |   |  - POST /api/cron/process-payouts     |
|  - ... (all tables)                 |   |  - ... (custom endpoints)             |
|                                     |   |                                       |
|  Security: RLS Policies             |   |  Security: Server code                |
|  (PostgreSQL DB level)              |   |  (validations in each route.ts)       |
|                                     |   |                                       |
+-------------------------------------+   +---------------------------------------+
                  |                                       |
                  |                                       |
                  v                                       v
+-----------------------------------------------------------------------------+
|                                                                             |
|                            SUPABASE (PostgreSQL)                            |
|                                                                             |
|   +---------------------------------------------------------------------+   |
|   |                              TABLES                                 |   |
|   |  users | products | orders | reviews | payments | categories | ...  |   |
|   +---------------------------------------------------------------------+   |
|                                                                             |
|   +---------------------------------------------------------------------+   |
|   |                           RLS POLICIES                              |   |
|   |  "Users can view their own orders"                                  |   |
|   |  "Admins can update any product"                                    |   |
|   |  "QA team full access" (for testing)                                |   |
|   +---------------------------------------------------------------------+   |
|                                                                             |
+-----------------------------------------------------------------------------+
                  |                                       |
                  v                                       v
+-------------------------------------+   +---------------------------------------+
|         EXTERNAL SERVICES           |   |            VERCEL CRON                |
|                                     |   |                                       |
|  - Stripe (payments)                |   |  Executes periodically:               |
|  - Resend/SendGrid (emails)         |   |  POST /api/cron/process-payouts       |
|  - Shipping API (shipments)         |   |  POST /api/cron/cleanup-expired       |
|                                     |   |                                       |
+-------------------------------------+   +---------------------------------------+
```

---

## Typical Next.js Custom Endpoints

```
+-----------------------------------------------------------------------------+
|                      CUSTOM ENDPOINTS (Next.js API Routes)                  |
+-----------------------------------------------------------------------------+
|                                                                             |
|  PAYMENTS & CHECKOUT                                                        |
|  |-- POST   /api/checkout/session           --> Create payment session     |
|  |-- POST   /api/stripe/connect/onboard     --> Seller onboarding          |
|  |-- GET    /api/stripe/connect/status      --> Seller account status      |
|  +-- POST   /api/webhooks/stripe            --> Stripe webhooks            |
|                                                                             |
|  ORDERS (Complex logic)                                                     |
|  |-- POST   /api/orders/[id]/cancel         --> Cancel + refund            |
|  |-- PATCH  /api/orders/[id]/status         --> Update status              |
|  +-- GET    /api/orders/[id]/tracking       --> Get shipping tracking      |
|                                                                             |
|  PRODUCTS & INVENTORY                                                       |
|  |-- GET    /api/products/[id]/availability --> Check stock                |
|  +-- POST   /api/products/bulk-update       --> Bulk update                |
|                                                                             |
|  NOTIFICATIONS & EMAIL                                                      |
|  |-- POST   /api/email/order-confirmation   --> Send confirmation email    |
|  +-- GET    /api/notifications/unread       --> Unread notifications count |
|                                                                             |
|  SYSTEM & CRON                                                              |
|  |-- POST   /api/cron/process-payouts       --> Job: process payments      |
|  |-- POST   /api/cron/cleanup-expired       --> Job: cleanup expired       |
|  +-- POST   /api/testing/seed-data          --> QA: seed test data         |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Where Each Type is Documented

```
+-----------------------------------------------------------------------------+
|                        WHERE IS IT DOCUMENTED?                              |
+-----------------------------------------------------------------------------+
|                                                                             |
|  SUPABASE REST API (PostgREST)                                              |
|  +-- Automatically documented at:                                           |
|      - /api-docu (Redoc) if configured in project                          |
|      - Supabase Dashboard > API Docs                                        |
|      - {{SUPABASE_URL}}/rest/v1/?apikey={{ANON_KEY}}                       |
|        Example: https://abc123.supabase.co/rest/v1/?apikey=eyJ...          |
|                                                                             |
|  NEXT.JS API ROUTES (Custom)                                                |
|  +-- NO auto-generated documentation                                        |
|  +-- Documented in:                                                         |
|      - Source code (JSDoc in route.ts)                                     |
|      - Manual OpenAPI spec (if you create it)                              |
|      - This testing guide                                                  |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Key Difference: Authentication by Type

```
+-----------------------------------------------------------------------------+
|                         AUTHENTICATION BY TYPE                              |
+-----------------------------------------------------------------------------+
|                                                                             |
|  SUPABASE REST (/rest/v1/*)                                                 |
|  +-----------------------------------------------------------------------+  |
|  |  Headers:                                                             |  |
|  |    apikey: eyJhbGciOiJIUzI1NiIs...  (anon key - ALWAYS)              |  |
|  |    Authorization: Bearer eyJ...      (user JWT - if authenticated)   |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  NEXT.JS API (/api/*)                                                       |
|  +-----------------------------------------------------------------------+  |
|  |  Authentication via COOKIES (automatic from browser)                  |  |
|  |                                                                       |  |
|  |  Cookie: sb-{{PROJECT_REF}}-auth-token=base64...                      |  |
|  |  Example: sb-abcdefghijklmnop-auth-token=eyJhY2Nlc3...                |  |
|  |                                                                       |  |
|  |  Or for special endpoints:                                            |  |
|  |    X-API-Key: {{API_KEY}} (for /api/email/*, /api/testing/*)          |  |
|  |    Authorization: Bearer {{CRON_SECRET}} (for /api/cron/*)            |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Requirements Table by Endpoint (Example)

| Endpoint                        | Method | Auth             | Special Requirements         |
| ------------------------------- | ------ | ---------------- | ---------------------------- |
| /api/checkout/session           | POST   | Cookie           | Body: { order_id }           |
| /api/orders/[id]/cancel         | POST   | Cookie           | User must be owner           |
| /api/orders/[id]/status         | PATCH  | Cookie           | Only admin can change        |
| /api/orders/[id]/tracking       | GET    | Cookie           | Within time window           |
| /api/stripe/connect/onboard     | POST   | Cookie           | User must be seller          |
| /api/stripe/connect/status      | GET    | Cookie           | User must be seller          |
| /api/webhooks/stripe            | POST   | Stripe-Signature | Only Stripe can call         |
| /api/products/[id]/availability | GET    | None             | Public                       |
| /api/notifications/unread       | GET    | Cookie           | -                            |
| /api/email/order-confirmation   | POST   | X-API-Key        | Internal key                 |
| /api/cron/process-payouts       | POST   | Authorization    | CRON_SECRET                  |
| /api/testing/seed-data          | POST   | X-API-Key        | Only in dev/staging          |

---

## Flow Diagram: Complete Purchase Example

```
+-----------------------------------------------------------------------------+
|                     COMPLETE FLOW: USER MAKES A PURCHASE                    |
+-----------------------------------------------------------------------------+

  USER                     NEXT.JS                  SUPABASE              STRIPE
      |                          |                         |                    |
      |  1. View products        |                         |                    |
      |------------------------->|                         |                    |
      |   GET /rest/v1/products  |   (direct to Supabase)  |                    |
      |   + apikey               |-----------------+------>|                    |
      |<-------------------------|<----------------+-------|                    |
      |   available products     |                         |                    |
      |                          |                         |                    |
      |  2. Add to cart          |                         |                    |
      |------------------------->|                         |                    |
      |  POST /rest/v1/cart_items|   (direct to Supabase)  |                    |
      |  + apikey + JWT          |-----------------+------>|                    |
      |<-------------------------|<----------------+-------|                    |
      |   item added             |                         |                    |
      |                          |                         |                    |
      |  3. Create order         |                         |                    |
      |------------------------->|                         |                    |
      |  POST /rest/v1/orders    |   (direct to Supabase)  |                    |
      |  + apikey + JWT          |-----------------+------>|                    |
      |<-------------------------|<----------------+-------|                    |
      |   order created (pending)|                         |                    |
      |                          |                         |                    |
      |  4. Start payment        |                         |                    |
      |------------------------->|                         |                    |
      |  POST /api/checkout/     |   5. Validate order     |                    |
      |       session            |------------------------>|                    |
      |  + Cookie session        |<------------------------|                    |
      |                          |   6. Create Checkout    |                    |
      |                          |------------------------------------------>|
      |                          |<------------------------------------------|
      |<-------------------------|   checkout URL          |                    |
      |   redirect to Stripe     |                         |                    |
      |                          |                         |                    |
      |  7. Payment completed    |                         |                    |
      |   (redirect back)        |                         |                    |
      |                          |                         |                    |
      |                          |   8. Webhook            |                    |
      |                          |<------------------------------------------|
      |                          |  POST /api/webhooks/stripe                  |
      |                          |                         |                    |
      |                          |   9. Update order       |                    |
      |                          |------------------------>|                    |
      |                          |   status='paid'         |                    |
      |                          |   + create payment      |                    |
      |                          |                         |                    |
      |                          |   10. Send email        |                    |
      |                          |----> Resend/SendGrid    |                    |
      |<---------------------------------------------------------|              |
      |   Confirmation email     |                         |                    |
      |                          |                         |                    |
```

---

## Summary for QA

```
+-----------------------------------------------------------------------------+
|                              SUMMARY FOR QA                                 |
+-----------------------------------------------------------------------------+
|                                                                             |
|  There are TWO different APIs:                                              |
|                                                                             |
|  1. SUPABASE REST (/rest/v1/*)                                              |
|      - Auto-generated, documented in Supabase API Docs                      |
|      - Direct CRUD to DB                                                    |
|      - Auth: apikey + JWT in headers                                        |
|      - Testing: Postman, MCP api, DevTools                                  |
|                                                                             |
|  2. NEXT.JS API (/api/*)                                                    |
|      - Custom endpoints with business logic                                 |
|      - NOT automatically documented                                         |
|      - Auth: Session cookies (automatic in browser)                         |
|      - Testing: DevTools (easy), Postman (copy cookies)                     |
|                                                                             |
|  For complete testing:                                                      |
|      - Login to the app (get cookies)                                       |
|      - DevTools: see requests automatically                                 |
|      - Postman: copy cookies from browser                                   |
|      - Playwright: use page.context() which handles cookies                 |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Next Step

- To understand authentication flow: [02-authentication.md](./02-authentication.md)
- To start manual testing: [03-testing-devtools.md](./03-testing-devtools.md)
