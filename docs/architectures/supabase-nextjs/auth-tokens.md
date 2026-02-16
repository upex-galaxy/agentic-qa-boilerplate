# Supabase: Auth Tokens

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** QA Engineers que necesitan autenticar requests contra Supabase

---

## Overview

Supabase usa JWT (JSON Web Tokens) para autenticación. El mismo token funciona para:
- Supabase REST API (`/rest/v1/*`)
- Supabase Auth API (`/auth/v1/*`)
- Next.js API Routes (`/api/*`) - via cookie

```
┌─────────────────────────────────────────────────────────────────┐
│                  UN TOKEN, MÚLTIPLES USOS                        │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    JWT Token                             │   │
│   └──────────────┬─────────────────────┬────────────────────┘   │
│                  │                     │                         │
│          ┌───────▼───────┐     ┌───────▼───────┐                │
│          │ REST API      │     │ Next.js API   │                │
│          │ (Header)      │     │ (Cookie)      │                │
│          │               │     │               │                │
│          │ Authorization:│     │ sb-xxx-auth-  │                │
│          │ Bearer <JWT>  │     │ token=<base64>│                │
│          └───────────────┘     └───────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Keys de Supabase

Supabase proporciona dos tipos de API keys:

| Key | Nombre | Propósito |
|-----|--------|-----------|
| **Anon Key** | `SUPABASE_ANON_KEY` | Acceso público, respeta RLS |
| **Service Role** | `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS, solo backend |

Encuentras ambas en: **Dashboard → Project Settings → API**

### Anon Key (pública)

```javascript
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

- ✅ Segura para exponer en frontend
- ✅ Respeta RLS policies
- ⚠️ Solo ve datos que las policies permiten

### Service Role Key (secreta)

```javascript
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

- ❌ **NUNCA** exponer en frontend
- ❌ **NUNCA** commitear a Git
- ✅ Bypass completo de RLS
- ✅ Solo para backend/admin

---

## Obtener Access Token (Login)

### Via API (Recomendado para Testing)

```http
POST https://[PROJECT_REF].supabase.co/auth/v1/token?grant_type=password
Content-Type: application/json
apikey: [SUPABASE_ANON_KEY]

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Response

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1703123456,
  "refresh_token": "abc123...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "user_metadata": { "name": "Test User" }
  }
}
```

**Guardar:**
- `access_token` → Para requests autenticados
- `refresh_token` → Para renovar cuando expire
- `user.id` → Para filtros y validaciones

---

## Usar el Token en REST API

### Headers Requeridos

```http
GET https://[PROJECT_REF].supabase.co/rest/v1/orders
apikey: [SUPABASE_ANON_KEY]
Authorization: Bearer [ACCESS_TOKEN]
```

### cURL Ejemplo

```bash
curl -X GET \
  'https://czuusjchqpgvanvbdrnz.supabase.co/rest/v1/orders?user_id=eq.123' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIs...' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...'
```

### JavaScript Ejemplo

```javascript
const response = await fetch(
  `${SUPABASE_URL}/rest/v1/orders?user_id=eq.${userId}`,
  {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  }
);
```

---

## Usar el Token en Next.js API Routes

Next.js API routes esperan el token en una **cookie** con formato específico.

### Estructura de la Cookie

```
Nombre: sb-[PROJECT_REF]-auth-token
Valor:  base64(JSON con el token)
```

### Crear la Cookie Manualmente

```javascript
// 1. Datos del token
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

// 2. Codificar en base64
const cookieValue = btoa(JSON.stringify(tokenData));

// 3. Nombre de la cookie
const PROJECT_REF = 'czuusjchqpgvanvbdrnz';
const cookieName = `sb-${PROJECT_REF}-auth-token`;
```

### cURL con Cookie

```bash
# Crear el valor de la cookie
TOKEN_JSON='{"access_token":"eyJ...","refresh_token":"abc...","token_type":"bearer"}'
COOKIE_VALUE=$(echo -n "$TOKEN_JSON" | base64)

# Hacer request
curl -X GET \
  'http://localhost:3000/api/orders' \
  -H "Cookie: sb-czuusjchqpgvanvbdrnz-auth-token=$COOKIE_VALUE"
```

---

## Usar en Playwright Tests

### Setup Completo

```typescript
import { test, expect, Page } from '@playwright/test';

// Configuración
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PROJECT_REF = SUPABASE_URL.split('//')[1].split('.')[0];

interface AuthData {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

async function loginViaApi(request: any, email: string, password: string): Promise<AuthData> {
  const response = await request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: ANON_KEY },
      data: { email, password },
    }
  );

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user.id,
    email: data.user.email,
  };
}

async function injectAuthCookie(page: Page, auth: AuthData) {
  const cookieData = {
    access_token: auth.accessToken,
    refresh_token: auth.refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: auth.userId, email: auth.email },
  };

  const cookieValue = Buffer.from(JSON.stringify(cookieData)).toString('base64');

  await page.context().addCookies([
    {
      name: `sb-${PROJECT_REF}-auth-token`,
      value: cookieValue,
      domain: 'localhost',
      path: '/',
    },
  ]);
}

// Uso en test
test('authenticated user can access dashboard', async ({ page, request }) => {
  // 1. Login via API
  const auth = await loginViaApi(request, 'test@example.com', 'password123');

  // 2. Inyectar cookie
  await injectAuthCookie(page, auth);

  // 3. Navegar (ya autenticado)
  await page.goto('/dashboard');
  await expect(page.locator('.welcome')).toContainText('Welcome');
});
```

### Fixture Reutilizable

```typescript
// fixtures.ts
import { test as base } from '@playwright/test';

type AuthFixture = {
  authenticatedPage: Page;
  authData: AuthData;
};

export const test = base.extend<AuthFixture>({
  authenticatedPage: async ({ page, request }, use) => {
    const auth = await loginViaApi(request, 'test@example.com', 'password123');
    await injectAuthCookie(page, auth);
    await use(page);
  },
});

// Uso
test('test with authenticated page', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard');
  // Ya está autenticado
});
```

---

## Refresh Token

Cuando el `access_token` expira (1 hora por defecto), usa el `refresh_token`:

```http
POST https://[PROJECT_REF].supabase.co/auth/v1/token?grant_type=refresh_token
Content-Type: application/json
apikey: [SUPABASE_ANON_KEY]

{
  "refresh_token": "abc123..."
}
```

Response: Nuevos `access_token` y `refresh_token`.

---

## Decodificar JWT (Debug)

Para ver qué contiene un JWT:

### Opción 1: jwt.io

Visita https://jwt.io y pega el token.

### Opción 2: JavaScript

```javascript
const [header, payload, signature] = accessToken.split('.');
const decoded = JSON.parse(atob(payload));
console.log(decoded);
// {
//   sub: "550e8400-...",  // User ID
//   email: "user@example.com",
//   exp: 1703123456,      // Expiration
//   role: "authenticated"
// }
```

### Campos Importantes

| Campo | Descripción |
|-------|-------------|
| `sub` | User ID (UUID) |
| `email` | Email del usuario |
| `exp` | Timestamp de expiración |
| `role` | `authenticated` o `anon` |
| `user_metadata` | Datos adicionales del usuario |

---

## Test Users Recomendados

Crea usuarios de test en cada ambiente:

| Ambiente | Email | Password | Rol |
|----------|-------|----------|-----|
| Staging | `qa.customer@yourproject.test` | `QaCustomer123!` | Customer |
| Staging | `qa.admin@yourproject.test` | `QaAdmin123!` | Admin |
| Dev | `dev.test@localhost` | `DevTest123!` | Customer |

### Crear via SQL

```sql
-- En el SQL Editor de Supabase
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
VALUES (
  'qa.customer@yourproject.test',
  crypt('QaCustomer123!', gen_salt('bf')),
  NOW(),
  '{"name": "QA Customer", "role": "customer"}'::jsonb
);
```

---

## Resumen de Endpoints Auth

| Acción | Method | Endpoint |
|--------|--------|----------|
| **Login** | POST | `/auth/v1/token?grant_type=password` |
| **Refresh** | POST | `/auth/v1/token?grant_type=refresh_token` |
| **Logout** | POST | `/auth/v1/logout` |
| **User Info** | GET | `/auth/v1/user` |
| **Reset Password** | POST | `/auth/v1/recover` |

---

## Próximos Pasos

1. **Connection Setup:** [connection-setup.md](docs/architectures/supabase-nextjs/connection-setup.md) - Configurar conexión DB
2. **Troubleshooting:** [troubleshooting.md](docs/architectures/supabase-nextjs/troubleshooting.md) - Problemas comunes
3. **Generic Auth:** [docs/testing/api/authentication.md](docs/testing/api/authentication.md) - Conceptos genéricos

---

## Referencias

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [JWT.io](https://jwt.io/)
