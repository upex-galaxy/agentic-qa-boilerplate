# Contract Testing: Conceptos

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** QA Engineers y Developers que trabajan con APIs

---

## ¿Qué es Contract Testing?

**Contract Testing** verifica que dos sistemas (generalmente un API y sus consumidores) pueden comunicarse correctamente según un **contrato** acordado.

```
┌─────────────────┐                    ┌─────────────────┐
│                 │    Contrato        │                 │
│    Consumer     │◄──────────────────►│    Provider     │
│   (Frontend)    │  "Este es el       │   (Backend)     │
│                 │   formato que      │                 │
│                 │   acordamos"       │                 │
└─────────────────┘                    └─────────────────┘
```

El **contrato** define:
- Qué endpoints existen
- Qué métodos HTTP aceptan
- Qué estructura tiene el request
- Qué estructura tiene el response
- Qué códigos de estado esperar

---

## ¿Por qué Contract Testing?

### El Problema: Integración Frágil

Sin contract testing, los problemas se descubren tarde:

```
1. Frontend desarrolla feature asumiendo formato X
2. Backend cambia el formato a Y
3. Se detecta en QA o peor... en producción
4. Blame game: "¿Quién cambió la API?"
```

### La Solución: Contrato como Verdad

```
1. Se define el contrato (ej: OpenAPI spec)
2. Frontend desarrolla contra el contrato
3. Backend implementa el contrato
4. Tests automatizados verifican ambos lados
5. Cambios al contrato requieren acuerdo de ambas partes
```

---

## Tipos de Contratos

### 1. OpenAPI / Swagger

El estándar de facto para APIs REST:

```yaml
# openapi.yaml
openapi: 3.0.0
paths:
  /users/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        200:
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  name:
                    type: string
                  email:
                    type: string
                    format: email
```

**Ventajas:**
- ✅ Estándar de la industria
- ✅ Genera documentación automática
- ✅ Muchas herramientas disponibles

**Ver:** [openapi-contract-testing.md](docs/testing/api/openapi-contract-testing.md)

### 2. JSON Schema

Schema para validar estructura JSON:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name", "email"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "name": { "type": "string", "minLength": 1 },
    "email": { "type": "string", "format": "email" }
  }
}
```

**Ventajas:**
- ✅ Simple y estándar
- ✅ Útil para validar payloads específicos

### 3. Zod (TypeScript)

Schemas con inferencia de tipos:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
});

// Inferir tipo TypeScript del schema
type User = z.infer<typeof UserSchema>;

// Validar en runtime
const result = UserSchema.safeParse(apiResponse);
if (!result.success) {
  console.error('Contract violation:', result.error);
}
```

**Ventajas:**
- ✅ TypeScript-first
- ✅ Inferencia de tipos automática
- ✅ Mensajes de error detallados

### 4. Pact (Consumer-Driven)

Framework específico para contract testing:

```typescript
// Consumer side
const interaction = {
  state: 'user exists',
  uponReceiving: 'a request for user',
  withRequest: {
    method: 'GET',
    path: '/users/123',
  },
  willRespondWith: {
    status: 200,
    body: { id: '123', name: 'Test User' },
  },
};
```

**Ventajas:**
- ✅ Consumer define lo que necesita
- ✅ Provider verifica que lo cumple
- ✅ Broker central para coordinar

---

## Enfoques de Contract Testing

### Provider-Driven (API-First)

El **Provider** (backend) define el contrato primero:

```
1. Backend crea OpenAPI spec
2. Frontend implementa basándose en spec
3. Tests verifican que Backend cumple su spec
```

```
┌──────────────┐
│   Provider   │──── Define contrato ────┐
│  (Backend)   │                         ▼
└──────────────┘                   ┌──────────┐
                                   │ Contrato │
┌──────────────┐                   │ (OpenAPI)│
│   Consumer   │◄── Implementa ────└──────────┘
│  (Frontend)  │
└──────────────┘
```

**Cuándo usar:**
- El backend lidera el diseño de la API
- APIs públicas o con múltiples consumidores
- Ya existe documentación OpenAPI

### Consumer-Driven (Pact)

El **Consumer** (frontend) define lo que necesita:

```
1. Frontend especifica qué datos necesita
2. Se genera "Pact" (contrato del consumidor)
3. Backend verifica que puede cumplirlo
```

```
┌──────────────┐
│   Consumer   │──── Define necesidades ──┐
│  (Frontend)  │                          ▼
└──────────────┘                    ┌──────────┐
                                    │   Pact   │
┌──────────────┐                    │(contrato)│
│   Provider   │◄── Verifica ───────└──────────┘
│  (Backend)   │    que cumple
└──────────────┘
```

**Cuándo usar:**
- Microservicios con contratos específicos
- Frontend tiene necesidades específicas
- Múltiples consumidores con necesidades diferentes

---

## ¿Qué Verificar en Contract Tests?

### Estructura del Response

```typescript
test('GET /users/:id returns correct structure', async () => {
  const response = await api.get('/users/123');

  // Verificar estructura
  expect(response.data).toMatchObject({
    id: expect.any(String),
    name: expect.any(String),
    email: expect.stringMatching(/@/),
    created_at: expect.any(String),
  });
});
```

### Tipos de Datos

```typescript
// Verificar tipos específicos
const UserContract = z.object({
  id: z.string().uuid(),           // Debe ser UUID
  age: z.number().int().positive(), // Entero positivo
  email: z.string().email(),        // Email válido
  created_at: z.string().datetime(), // ISO datetime
});
```

### Campos Requeridos vs Opcionales

```typescript
const UserContract = z.object({
  id: z.string(),           // Requerido
  name: z.string(),         // Requerido
  bio: z.string().optional(), // Opcional
  avatar: z.string().nullable(), // Puede ser null
});
```

### Enums y Valores Permitidos

```typescript
const OrderContract = z.object({
  status: z.enum(['pending', 'processing', 'shipped', 'delivered']),
  priority: z.literal('high').or(z.literal('normal')).or(z.literal('low')),
});
```

---

## Contract Testing vs Otros Tipos

| Tipo | Qué verifica | Ejemplo |
|------|--------------|---------|
| **Contract** | Estructura y tipos | "El response tiene campo `id` tipo string" |
| **Functional** | Lógica de negocio | "Crear usuario con email duplicado falla" |
| **Integration** | Componentes juntos | "API guarda correctamente en DB" |
| **E2E** | Flujo completo | "Usuario puede hacer checkout" |

```
Contract Testing NO verifica:
❌ Que el usuario se creó correctamente en la DB
❌ Que el email de bienvenida se envió
❌ Que las reglas de negocio se cumplieron

Contract Testing SÍ verifica:
✅ Que el response tiene la estructura esperada
✅ Que los tipos de datos son correctos
✅ Que campos requeridos están presentes
```

---

## Implementación Práctica

### Nivel 1: Validación Básica

```typescript
test('API returns expected fields', async () => {
  const response = await api.get('/users/123');

  expect(response.data).toHaveProperty('id');
  expect(response.data).toHaveProperty('name');
  expect(response.data).toHaveProperty('email');
});
```

### Nivel 2: Validación con Zod

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});

test('API response matches contract', async () => {
  const response = await api.get('/users/123');

  const result = UserSchema.safeParse(response.data);
  expect(result.success).toBe(true);
});
```

### Nivel 3: Validación con OpenAPI

```typescript
import { validateResponse } from './openapi-validator';

test('API response matches OpenAPI spec', async () => {
  const response = await api.get('/users/123');

  const validation = await validateResponse(
    'GET',
    '/users/{id}',
    200,
    response.data
  );

  expect(validation.errors).toHaveLength(0);
});
```

---

## Buenas Prácticas

### 1. Contrato como Código

```
my-project/
├── contracts/
│   ├── openapi.yaml      # Spec principal
│   └── schemas/
│       ├── user.json     # Schema de User
│       └── order.json    # Schema de Order
├── tests/
│   └── contract/         # Tests de contrato
```

### 2. Versionado del Contrato

```yaml
# openapi.yaml
openapi: 3.0.0
info:
  version: 2.1.0  # Versión semántica del API
```

### 3. Validación en CI/CD

```yaml
# .github/workflows/contract.yml
jobs:
  contract-tests:
    steps:
      - name: Validate OpenAPI spec
        run: npx @redocly/cli lint openapi.yaml

      - name: Run contract tests
        run: npm run test:contract
```

### 4. Breaking Changes

Cambios que **rompen** el contrato:
- ❌ Eliminar campo requerido
- ❌ Cambiar tipo de dato
- ❌ Renombrar campo
- ❌ Agregar campo requerido

Cambios **seguros**:
- ✅ Agregar campo opcional
- ✅ Hacer campo requerido opcional
- ✅ Agregar nuevo endpoint
- ✅ Agregar nuevo enum value

---

## Próximos Pasos

1. **OpenAPI + Zod:** [openapi-contract-testing.md](docs/testing/api/openapi-contract-testing.md) - Implementación con OpenAPI y Zod
2. **Fundamentos API:** [fundamentals.md](docs/testing/api/fundamentals.md) - Conceptos básicos de API testing
3. **Setup OpenAPI MCP:** [docs/setup/mcp-openapi.md](docs/setup/mcp-openapi.md) - Configurar MCP para OpenAPI

---

## Referencias

- [Pact - Consumer-Driven Contract Testing](https://pact.io/)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
- [Zod Documentation](https://zod.dev/)
- [Contract Testing by Martin Fowler](https://martinfowler.com/bliki/ContractTest.html)
