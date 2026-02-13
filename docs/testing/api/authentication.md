# Autenticación en API Testing

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** QA Engineers que necesitan autenticar requests en sus tests

---

## Overview

La mayoría de APIs requieren autenticación para acceder a recursos protegidos. Este documento cubre los patrones más comunes y cómo implementarlos en tus tests.

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE AUTENTICACIÓN                        │
│                                                                  │
│   1. Obtener credenciales (login, API key, etc.)                │
│                          ↓                                       │
│   2. Incluir credenciales en cada request                       │
│                          ↓                                       │
│   3. Servidor valida y responde                                 │
│                          ↓                                       │
│   4. Renovar si es necesario (refresh token)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Métodos de Autenticación

### 1. API Key

Una clave estática que identifica al cliente:

```http
GET /api/products
X-API-Key: sk_live_abc123xyz
```

**Características:**
- ✅ Simple de implementar
- ✅ No expira (generalmente)
- ❌ Si se filtra, acceso permanente
- ❌ No identifica usuarios individuales

**Uso común:** APIs públicas, servicios de terceros

### 2. Bearer Token (JWT)

Token temporal que contiene información del usuario:

```http
GET /api/orders
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Características:**
- ✅ Identifica al usuario
- ✅ Expira automáticamente
- ✅ Contiene claims (roles, permisos)
- ❌ Requiere flujo de login

**Uso común:** Aplicaciones web, móviles

### 3. Basic Auth

Usuario y contraseña codificados en base64:

```http
GET /api/data
Authorization: Basic dXNlcjpwYXNzd29yZA==
```

```bash
# El valor es base64(user:password)
echo -n "user:password" | base64
# dXNlcjpwYXNzd29yZA==
```

**Características:**
- ✅ Muy simple
- ❌ Credenciales en cada request
- ❌ Fácil de decodificar (no es encriptación)

**Uso común:** APIs internas, desarrollo

### 4. OAuth 2.0

Delegación de acceso a terceros:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │────▶│   App       │────▶│  Provider   │
│             │     │  (Client)   │     │ (Google,    │
│             │◀────│             │◀────│  GitHub)    │
└─────────────┘     └─────────────┘     └─────────────┘
     Grant              Token            Validate
```

**Uso común:** "Login con Google", "Login con GitHub"

### 5. Cookie-Based

Token almacenado en cookie del navegador:

```http
GET /api/profile
Cookie: session=abc123; auth_token=eyJhbG...
```

**Características:**
- ✅ Automático en browsers
- ✅ HttpOnly previene XSS
- ❌ Vulnerable a CSRF
- ❌ No funciona cross-domain fácilmente

**Uso común:** Aplicaciones web tradicionales

---

## JWT (JSON Web Token)

### Estructura

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJ
└──────────── Header ────────────┘.└────────── Payload ──────────────┘.└── Signature ──┘
```

### Decodificar (Debug)

```javascript
// En JavaScript
const token = 'eyJhbGciOiJIUzI1NiIs...';
const [header, payload, signature] = token.split('.');
const decoded = JSON.parse(atob(payload));
console.log(decoded);
// { sub: "user-123", email: "user@example.com", exp: 1703123456 }
```

O usa https://jwt.io para visualizar.

### Claims Comunes

| Claim | Descripción | Ejemplo |
|-------|-------------|---------|
| `sub` | Subject (user ID) | `"user-123"` |
| `email` | Email del usuario | `"user@example.com"` |
| `exp` | Expiration time | `1703123456` |
| `iat` | Issued at | `1703119856` |
| `role` | Rol del usuario | `"admin"` |

### Verificar Expiración

```javascript
function isTokenExpired(token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  const expiration = payload.exp * 1000; // convertir a ms
  return Date.now() > expiration;
}
```

---

## Flujo de Login Típico

### 1. Login con Credenciales

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### 2. Response con Tokens

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "abc123...",
  "expires_in": 3600,
  "token_type": "bearer",
  "user": {
    "id": "user-123",
    "email": "user@example.com"
  }
}
```

### 3. Usar el Token

```http
GET /api/protected-resource
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### 4. Renovar Cuando Expira

```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "abc123..."
}
```

---

## Implementación en Tests

### Playwright (TypeScript)

```typescript
import { test, expect } from '@playwright/test';

// Variables de entorno
const API_URL = process.env.API_BASE_URL!;
const TEST_EMAIL = process.env.TEST_USER_EMAIL!;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD!;

// Helper para login
async function getAuthToken(request: any): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });

  const data = await response.json();
  return data.access_token;
}

test('authenticated request', async ({ request }) => {
  // 1. Obtener token
  const token = await getAuthToken(request);

  // 2. Hacer request autenticado
  const response = await request.get(`${API_URL}/api/orders`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(response.ok()).toBeTruthy();
});
```

### Fixture Reutilizable

```typescript
// fixtures/auth.ts
import { test as base } from '@playwright/test';

type AuthFixtures = {
  authToken: string;
  authenticatedRequest: (url: string, options?: object) => Promise<any>;
};

export const test = base.extend<AuthFixtures>({
  authToken: async ({ request }, use) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const { access_token } = await response.json();
    await use(access_token);
  },

  authenticatedRequest: async ({ request, authToken }, use) => {
    const makeRequest = async (url: string, options: any = {}) => {
      return request.fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${authToken}`,
        },
      });
    };
    await use(makeRequest);
  },
});

// Uso en test
test('get my orders', async ({ authenticatedRequest }) => {
  const response = await authenticatedRequest(`${API_URL}/api/orders`);
  expect(response.ok()).toBeTruthy();
});
```

### Postman

**Variables de entorno:**
```
access_token: (vacío inicialmente)
test_email: user@example.com
test_password: securepassword
```

**Request de Login - Tests:**
```javascript
pm.test('Login successful', function () {
  pm.response.to.have.status(200);
  const response = pm.response.json();
  pm.environment.set('access_token', response.access_token);
});
```

**Requests autenticados - Headers:**
```
Authorization: Bearer {{access_token}}
```

---

## Testing de Autenticación

### Casos a Probar

| Escenario | Expected |
|-----------|----------|
| Sin token | 401 Unauthorized |
| Token inválido | 401 Unauthorized |
| Token expirado | 401 Unauthorized |
| Token de otro usuario | 403 Forbidden o datos vacíos |
| Token válido | 200 OK + datos |
| Refresh con token inválido | 401 Unauthorized |
| Refresh exitoso | Nuevo access_token |

### Ejemplo de Tests

```typescript
test.describe('Authentication', () => {
  test('rejects request without token', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/orders`);
    expect(response.status()).toBe(401);
  });

  test('rejects invalid token', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/orders`, {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(response.status()).toBe(401);
  });

  test('accepts valid token', async ({ request }) => {
    const token = await getAuthToken(request);
    const response = await request.get(`${API_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
  });
});
```

---

## Seguridad en Tests

### Variables de Entorno

```bash
# .env (nunca commitear)
TEST_USER_EMAIL=qa@example.com
TEST_USER_PASSWORD=SecureTestPassword123!
API_KEY=sk_test_abc123
```

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    baseURL: process.env.API_BASE_URL,
  },
});
```

### Usuarios de Test

Crea usuarios específicos para testing:

| Usuario | Propósito | Permisos |
|---------|-----------|----------|
| `qa.customer@test` | Tests de cliente | Lectura/escritura propios datos |
| `qa.admin@test` | Tests de admin | Todos los permisos |
| `qa.readonly@test` | Tests de lectura | Solo lectura |

### No Hardcodear Credenciales

```typescript
// ❌ Malo
const token = 'eyJhbGciOiJIUzI1NiIs...';

// ✅ Bueno
const token = process.env.TEST_AUTH_TOKEN;
// O mejor, obtener dinámicamente con login
```

---

## Próximos Pasos

### Genéricos
- [fundamentals.md](./fundamentals.md) - Conceptos básicos de API testing
- [contract-testing.md](./contract-testing.md) - Validación de contratos

### Específicos por Stack
- [../../architectures/supabase-nextjs/auth-tokens.md](../../architectures/supabase-nextjs/auth-tokens.md) - Tokens en Supabase

---

## Referencias

- [JWT.io](https://jwt.io/)
- [OAuth 2.0 Simplified](https://oauth.net/2/)
- [MDN - HTTP Authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication)
