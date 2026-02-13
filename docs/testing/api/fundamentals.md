# Fundamentos de API Testing

> **Idioma:** Español
> **Nivel:** Introductorio
> **Audiencia:** QA Engineers que inician en API testing

---

## ¿Qué es una API?

**API** (Application Programming Interface) es un contrato que define cómo dos sistemas se comunican entre sí. En el contexto web, generalmente hablamos de **APIs REST** que usan HTTP como protocolo de transporte.

```
┌─────────────┐         HTTP Request          ┌─────────────┐
│             │  ─────────────────────────▶   │             │
│   Cliente   │                               │   Servidor  │
│  (Frontend) │  ◀─────────────────────────   │   (Backend) │
│             │         HTTP Response         │             │
└─────────────┘                               └─────────────┘
```

---

## Tipos de APIs Web

| Tipo | Características | Uso Común |
|------|-----------------|-----------|
| **REST** | Recursos como URLs, verbos HTTP, stateless | Mayoría de aplicaciones web |
| **GraphQL** | Un solo endpoint, queries flexibles | Apps con datos complejos |
| **gRPC** | Binario, muy rápido, contratos estrictos | Microservicios internos |
| **WebSocket** | Bidireccional, tiempo real | Chat, notificaciones en vivo |

En este boilerplate nos enfocamos principalmente en **REST APIs**.

---

## Fundamentos HTTP

### Métodos HTTP (Verbos)

| Método | Propósito | Idempotente | Body |
|--------|-----------|-------------|------|
| `GET` | Obtener datos | ✅ Sí | ❌ No |
| `POST` | Crear recurso | ❌ No | ✅ Sí |
| `PUT` | Reemplazar recurso completo | ✅ Sí | ✅ Sí |
| `PATCH` | Actualizar parcialmente | ❌ No* | ✅ Sí |
| `DELETE` | Eliminar recurso | ✅ Sí | ❌ No |

> **Idempotente** = Ejecutar la misma operación múltiples veces produce el mismo resultado.

### Códigos de Estado HTTP

```
2xx → Éxito
├── 200 OK              → Operación exitosa
├── 201 Created         → Recurso creado
├── 204 No Content      → Éxito sin body (común en DELETE)

3xx → Redirección
├── 301 Moved Permanently
├── 302 Found (redirect temporal)

4xx → Error del Cliente
├── 400 Bad Request     → Datos inválidos
├── 401 Unauthorized    → No autenticado
├── 403 Forbidden       → Autenticado pero sin permisos
├── 404 Not Found       → Recurso no existe
├── 422 Unprocessable   → Validación fallida

5xx → Error del Servidor
├── 500 Internal Error  → Bug en el servidor
├── 502 Bad Gateway     → Problema con servicio upstream
├── 503 Service Unavailable → Servidor sobrecargado
```

### Headers Comunes

```http
# Request Headers
Content-Type: application/json     # Formato del body enviado
Accept: application/json           # Formato esperado de respuesta
Authorization: Bearer <token>      # Autenticación

# Response Headers
Content-Type: application/json     # Formato del body recibido
X-Request-Id: abc-123              # ID para trazabilidad
Cache-Control: no-cache            # Instrucciones de caché
```

---

## Anatomía de una Request HTTP

```http
POST /api/users HTTP/1.1                    ← Línea de Request (método + path)
Host: api.example.com                        ← Headers
Content-Type: application/json               ↓
Authorization: Bearer eyJhbGciOiJI...        ↓
                                             ← Línea vacía (separador)
{                                            ← Body (opcional)
  "name": "Juan Pérez",
  "email": "juan@example.com"
}
```

## Anatomía de una Response HTTP

```http
HTTP/1.1 201 Created                         ← Línea de Status
Content-Type: application/json               ← Headers
X-Request-Id: req_abc123                     ↓
                                             ← Línea vacía
{                                            ← Body
  "id": "usr_123",
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "created_at": "2025-01-15T10:30:00Z"
}
```

---

## ¿Qué se Testea en una API?

### 1. Contrato (Contract Testing)

Verificar que la API cumple con su especificación:

- ✅ Endpoints existen y responden
- ✅ Métodos HTTP correctos
- ✅ Estructura de request/response
- ✅ Tipos de datos correctos
- ✅ Headers requeridos

### 2. Funcionalidad

Verificar que la lógica de negocio funciona:

- ✅ CRUD operations (Create, Read, Update, Delete)
- ✅ Filtros y búsquedas
- ✅ Paginación
- ✅ Ordenamiento
- ✅ Relaciones entre recursos

### 3. Autenticación y Autorización

- ✅ Endpoints protegidos rechazan requests sin token
- ✅ Tokens inválidos/expirados son rechazados
- ✅ Usuarios solo acceden a sus propios datos
- ✅ Roles tienen permisos correctos

### 4. Validaciones

- ✅ Campos requeridos son obligatorios
- ✅ Formatos (email, fecha, UUID) se validan
- ✅ Límites (longitud, rango) se respetan
- ✅ Mensajes de error son claros

### 5. Casos Edge

- ✅ Listas vacías devuelven `[]`, no error
- ✅ Recursos inexistentes devuelven 404
- ✅ Datos duplicados manejan conflictos
- ✅ Caracteres especiales en inputs

---

## Herramientas para API Testing

### Testing Manual / Exploratorio

| Herramienta | Ventajas | Uso |
|-------------|----------|-----|
| **Postman** | UI amigable, colecciones, environments | Testing manual, documentación |
| **Insomnia** | Más liviano que Postman | Testing rápido |
| **cURL** | Línea de comandos, scriptable | Automatización, CI/CD |
| **DevTools** | Ya está en el navegador | Debugging, inspección |

### Testing Automatizado

| Herramienta | Lenguaje | Notas |
|-------------|----------|-------|
| **Playwright** | TypeScript/JS | E2E + API en un solo framework |
| **Jest + Supertest** | JavaScript | Popular para Node.js |
| **Pytest + Requests** | Python | Muy usado en backend Python |
| **RestAssured** | Java | Estándar en el mundo Java |

### Documentación y Contratos

| Herramienta | Propósito |
|-------------|-----------|
| **OpenAPI/Swagger** | Especificación de API (YAML/JSON) |
| **Swagger UI** | Visualizar y probar endpoints |
| **Redoc** | Documentación estática |

---

## Patrones de API Testing

### Arrange-Act-Assert (AAA)

```typescript
test('should create a new user', async () => {
  // Arrange - Preparar datos
  const userData = {
    name: 'Test User',
    email: 'test@example.com'
  };

  // Act - Ejecutar la acción
  const response = await api.post('/users', userData);

  // Assert - Verificar resultados
  expect(response.status).toBe(201);
  expect(response.data).toMatchObject({
    name: 'Test User',
    email: 'test@example.com'
  });
});
```

### Given-When-Then (BDD)

```gherkin
Given un usuario autenticado como admin
When hace POST a /users con datos válidos
Then la respuesta es 201 Created
And el usuario aparece en GET /users
```

---

## Buenas Prácticas

### 1. Independencia de Tests

Cada test debe poder ejecutarse solo, sin depender de otros:

```typescript
// ❌ Malo - depende de test anterior
test('update user', async () => {
  await api.patch(`/users/${userId}`, { name: 'Updated' });
});

// ✅ Bueno - crea su propio dato
test('update user', async () => {
  const user = await createTestUser();
  await api.patch(`/users/${user.id}`, { name: 'Updated' });
});
```

### 2. Datos de Test Aislados

Usa datos únicos para evitar conflictos:

```typescript
// ❌ Malo - email fijo puede colisionar
const email = 'test@example.com';

// ✅ Bueno - email único por test
const email = `test-${Date.now()}@example.com`;
// o con faker:
const email = faker.internet.email();
```

### 3. Limpieza de Datos

Limpia los datos que creas:

```typescript
test('create and cleanup user', async () => {
  const user = await api.post('/users', userData);

  try {
    // ... assertions ...
  } finally {
    await api.delete(`/users/${user.id}`);
  }
});
```

### 4. Variables de Entorno

Nunca hardcodees URLs ni credenciales:

```typescript
// ❌ Malo
const API_URL = 'https://api.production.com';

// ✅ Bueno
const API_URL = process.env.API_BASE_URL;
```

---

## Próximos Pasos

1. **Autenticación:** [authentication.md](./authentication.md) - Cómo manejar tokens
2. **Contract Testing:** [contract-testing.md](./contract-testing.md) - Validar contratos de API
3. **Testing con OpenAPI:** [openapi-contract-testing.md](./openapi-contract-testing.md) - Usar specs para testing
4. **DevTools:** [devtools-testing.md](./devtools-testing.md) - Testing manual en el navegador
5. **Postman:** [postman-testing.md](./postman-testing.md) - Colecciones y environments

---

## Referencias

- [MDN - HTTP Overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview)
- [REST API Design Best Practices](https://restfulapi.net/)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
