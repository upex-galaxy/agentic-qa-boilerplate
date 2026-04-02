# Auth - Test Plan

> **Module**: Authentication (`/auth/*`)
> **Total Tickets**: 1
> **Total Items**: 4 TCs (2 API + 2 UI)
> **Created**: 2026-03-19

---

## 1. Executive Summary

The authentication module is the gateway to the entire application. Every user flow depends on a valid session, making auth the highest-priority module for test coverage.

**Key Risks:**
- Invalid credentials silently creating sessions (security breach)
- Token expiration not enforced (stale sessions)
- Protected endpoints accessible without auth (authorization bypass)

---

## 2. Module Overview

| Aspect | Value |
|--------|-------|
| **Domain** | Authentication & Session Management |
| **Primary Actors** | All users (login is universal) |
| **API Endpoints** | `POST /api/auth/login`, `GET /api/auth/me` |
| **UI Pages** | `/login` (public form) |

---

## 3. Data Flow & API Endpoints

```
Login Flow (API):
POST /api/auth/login { email, password }
  → 200: { access_token, token_type, expires_in }
  → 401: { error }

Session Verification:
GET /api/auth/me (requires Bearer token)
  → 200: { user: { id, email, name } }
  → 401: unauthorized
```

```
Login Flow (UI):
/login page → fill form → submit
  → Success: redirect away from /login
  → Failure: error message, stay on /login
```

---

## 4. Test Data Strategy

| Data | Source | Notes |
|------|--------|-------|
| Valid credentials | `config.testUser` from `.env` | Pre-existing test user |
| Invalid credentials | Inline in test | Hardcoded bad values |
| Auth token | `api-state.json` from setup project | Auto-loaded by ApiFixture |

---

## 5. Key Selectors Reference

| Element | Selector | Page |
|---------|----------|------|
| Email input | `[data-testid="login-email-input"]` | `/login` |
| Password input | `[data-testid="login-password-input"]` | `/login` |
| Submit button | `[data-testid="login-submit-button"]` | `/login` |

---

## See Also

- Test specs: `test-specs/` directory in this folder
- Component (API): `tests/components/api/AuthApi.ts`
- Component (UI): `tests/components/ui/LoginPage.ts`
- Test file (integration): `tests/integration/auth/user-session.test.ts`
- Test file (e2e): `tests/e2e/dashboard/dashboard.test.ts`
