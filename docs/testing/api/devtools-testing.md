# Testing de APIs con DevTools

> **Idioma:** Español
> **Nivel:** Introductorio
> **Audiencia:** QA Engineers que hacen testing manual/exploratorio de APIs

---

## ¿Por qué DevTools?

Los DevTools del navegador son tu primera herramienta para:
- **Explorar** cómo la aplicación se comunica con el backend
- **Debuguear** problemas de red y autenticación
- **Capturar** requests para replicar en Postman o tests
- **Validar** responses sin escribir código

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE TESTING CON DEVTOOLS                 │
│                                                                  │
│   1. Abrir DevTools > Network                                   │
│   2. Interactuar con la aplicación                              │
│   3. Observar requests que se generan                           │
│   4. Analizar headers, body, response                           │
│   5. Copiar como cURL para replicar                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configurar DevTools

### Abrir DevTools

| Browser | Shortcut |
|---------|----------|
| Chrome/Edge | `F12` o `Ctrl+Shift+I` (Win) / `Cmd+Option+I` (Mac) |
| Firefox | `F12` o `Ctrl+Shift+I` |
| Safari | `Cmd+Option+I` (activar primero en Preferencias > Avanzado) |

### Tab Network

1. Abre DevTools
2. Ve a la pestaña **Network**
3. Recarga la página para capturar requests

### Filtros Útiles

| Filtro | Muestra |
|--------|---------|
| `Fetch/XHR` | Solo requests AJAX (APIs) |
| `Doc` | Navegaciones de página |
| `WS` | WebSockets (tiempo real) |
| `JS` | Archivos JavaScript |

**Recomendado:** Activa solo `Fetch/XHR` para ver las llamadas a API.

### Filtrar por URL

En el campo de búsqueda:

```
/api/            → Solo requests a /api/
products         → Requests que contengan "products"
-analytics       → Excluir requests con "analytics"
```

---

## Anatomía de un Request en DevTools

Al hacer clic en un request, verás varias pestañas:

### Headers

```
General:
  Request URL: https://api.example.com/api/orders
  Request Method: GET
  Status Code: 200 OK

Request Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
  Content-Type: application/json
  Accept: application/json

Response Headers:
  Content-Type: application/json
  X-Request-Id: req_abc123
```

### Payload (Request Body)

Para POST/PUT/PATCH, verás el body enviado:

```json
{
  "name": "Test Product",
  "price": 99.99,
  "category": "electronics"
}
```

### Response

El body de la respuesta:

```json
{
  "id": "prod_123",
  "name": "Test Product",
  "price": 99.99,
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Timing

Desglose del tiempo:

```
Queueing:     0.5 ms
DNS Lookup:   12 ms
Connection:   45 ms
TLS:          30 ms
Request:      1 ms
Waiting:      150 ms  ← Tiempo del servidor
Download:     5 ms
────────────────────
Total:        243.5 ms
```

---

## Interceptar Flujo de Login

### Pasos

1. Abre DevTools > Network
2. Activa `Preserve log` (para mantener requests entre navegaciones)
3. Ve a la página de login
4. Ingresa credenciales y haz login
5. Observa el request de autenticación

### Qué Buscar

**Request de Login:**
```
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "********"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "abc123...",
  "user": {
    "id": "user_123",
    "email": "user@example.com"
  }
}
```

### Copiar el Token

1. Click derecho en el request de login
2. Copy > Copy response
3. Extrae el `access_token` para usar en otros requests

---

## Validar Responses

### Checklist por Request

| Aspecto | Qué Verificar |
|---------|---------------|
| **Status** | 200, 201, 204 según operación |
| **Headers** | `content-type: application/json` |
| **Estructura** | Campos esperados presentes |
| **Tipos** | Strings, numbers, dates correctos |
| **Datos** | Valores tienen sentido |

### Códigos de Status Comunes

```
2xx - Éxito
├── 200 OK           → GET exitoso
├── 201 Created      → POST exitoso (recurso creado)
├── 204 No Content   → DELETE exitoso

4xx - Error del Cliente
├── 400 Bad Request  → Datos inválidos
├── 401 Unauthorized → Sin autenticación
├── 403 Forbidden    → Sin permisos
├── 404 Not Found    → Recurso no existe
├── 422 Unprocessable→ Validación fallida

5xx - Error del Servidor
├── 500 Internal     → Bug en el servidor
├── 502 Bad Gateway  → Servicio upstream falló
├── 503 Unavailable  → Servidor sobrecargado
```

---

## Copiar Requests para Reusar

### Copy as cURL

Click derecho en request > Copy > Copy as cURL

```bash
curl 'https://api.example.com/api/orders' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...' \
  -H 'Content-Type: application/json'
```

Puedes pegar esto en:
- Terminal
- Postman (Import > Raw text)
- Scripts de test

### Copy as Fetch

Para usar en JavaScript:

```javascript
fetch("https://api.example.com/api/orders", {
  headers: {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs...",
    "Content-Type": "application/json"
  }
});
```

---

## Testing de Autenticación

### Test: Request sin Token

1. Abre una nueva pestaña incógnito
2. Intenta acceder a un endpoint protegido directamente
3. Debería devolver 401 Unauthorized

### Test: Token de Otro Usuario

1. Login como Usuario A
2. Copia un ID de recurso de Usuario B
3. Intenta acceder via URL directa
4. Debería devolver 403 o array vacío

### Usar Console para Tests Rápidos

En la Console de DevTools:

```javascript
// Test rápido de un endpoint
const response = await fetch('/api/orders', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
});
const data = await response.json();
console.log(data);
```

---

## Simular Condiciones

### Throttling (Conexión Lenta)

1. Network > Throttling dropdown
2. Selecciona "Slow 3G" o "Offline"
3. Observa cómo maneja la app la conexión lenta

### Bloquear Requests

Para probar manejo de errores:

1. Click derecho en un request
2. "Block request URL"
3. Recarga - la app debería manejar el error gracefully

### Offline Mode

1. Network > Offline checkbox
2. Interactúa con la app
3. Verifica que muestra estados de error apropiados

---

## Tips y Trucos

### 1. Preserve Log

Activa `Preserve log` para mantener requests entre navegaciones:
```
[x] Preserve log
```

### 2. Disable Cache

Para ver siempre requests frescos:
```
[x] Disable cache
```

### 3. Filtrar por Status

```
status-code:404    → Solo errores 404
status-code:500    → Solo errores 500
status-code:2*     → Solo exitosos (2xx)
```

### 4. Ver Request Iniciador

La columna "Initiator" muestra qué código disparó el request. Útil para debugging.

### 5. Replay Request

Click derecho > Replay XHR para reejecutar un request sin recargar la página.

---

## Checklist de Testing Manual

### Para cada feature:

```
[ ] Identificar todos los requests involucrados
[ ] Verificar headers correctos (Authorization, Content-Type)
[ ] Validar body del request (POST/PATCH)
[ ] Verificar status code esperado
[ ] Validar estructura del response
[ ] Probar sin autenticación (401 esperado)
[ ] Probar con datos inválidos (400/422 esperado)
[ ] Verificar manejo de errores en la UI
```

---

## Próximos Pasos

- [postman-testing.md](./postman-testing.md) - Organizar requests en colecciones
- [authentication.md](./authentication.md) - Patrones de autenticación
- [fundamentals.md](./fundamentals.md) - Conceptos de API testing

---

## Referencias

- [Chrome DevTools Network Reference](https://developer.chrome.com/docs/devtools/network/)
- [Firefox Network Monitor](https://firefox-source-docs.mozilla.org/devtools-user/network_monitor/)
