# Guía de Configuración de OpenAPI MCP

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** QA Engineers configurando testing de APIs via MCP

---

Esta guía te ayuda a conectar Claude Code a tu API usando el servidor MCP de OpenAPI. Esto permite testing de APIs asistido por AI generando herramientas dinámicamente desde tu especificación OpenAPI/Swagger.

## Prerrequisitos

Antes de comenzar, asegúrate de tener:

- [ ] Node.js o Bun instalado
- [ ] Claude Code instalado y configurado
- [ ] Una especificación OpenAPI/Swagger (v2 o v3)
- [ ] URL base de la API accesible
- [ ] Credenciales de autenticación de API (si se requieren)

---

## Cómo Funciona

El servidor MCP de OpenAPI lee tu especificación de API y crea herramientas dinámicamente para cada endpoint:

```
Spec OpenAPI → Servidor MCP → Herramientas Dinámicas → Claude
     ↓              ↓                   ↓
GET /users   →   api_get_users   →   "Listar todos los usuarios"
POST /users  →   api_post_users  →   "Crear un usuario"
```

---

## Inicio Rápido

### 1. Identificar Tu Especificación OpenAPI

Tu spec puede ser:
- Un archivo local: `./openapi.json` o `./swagger.yaml`
- Una URL remota: `https://api.ejemplo.com/openapi.json`
- Un endpoint dinámico: `https://api.ejemplo.com/docs/spec`

### 2. Configurar MCP en Claude Code

Agrega a tu `.mcp.json`:

```json
{
  "mcpServers": {
    "mi-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.ejemplo.com",
        "OPENAPI_SPEC_PATH": "https://api.ejemplo.com/openapi.json"
      }
    }
  }
}
```

### 3. Probar la Conexión

Inicia Claude Code y pregunta:

```
¿Qué endpoints de API están disponibles?
```

Deberías ver a Claude usar las herramientas MCP para listar las operaciones disponibles.

---

## Opciones de Configuración

### Variables de Entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `API_BASE_URL` | Sí | URL base para requests de API |
| `OPENAPI_SPEC_PATH` | Sí | Ruta o URL a la spec OpenAPI |
| `API_HEADERS` | No | Headers personalizados (formato: `clave:valor,clave2:valor2`) |

### Argumentos de Comando

| Argumento | Default | Descripción |
|-----------|---------|-------------|
| `--tools` | `dynamic` | Modo de generación de herramientas |
| `--verbose` | `false` | Habilitar logging verbose |

---

## Ejemplos de Configuración

### API Pública (Sin Auth)

```json
{
  "mcpServers": {
    "api-publica": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.ejemplo.com/v1",
        "OPENAPI_SPEC_PATH": "https://api.ejemplo.com/v1/openapi.json"
      }
    }
  }
}
```

### API con API Key

```json
{
  "mcpServers": {
    "api-con-key": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.ejemplo.com/v1",
        "OPENAPI_SPEC_PATH": "https://api.ejemplo.com/v1/openapi.json",
        "API_HEADERS": "x-api-key:tu-api-key-aqui"
      }
    }
  }
}
```

### API con Bearer Token

```json
{
  "mcpServers": {
    "api-con-bearer": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.ejemplo.com/v1",
        "OPENAPI_SPEC_PATH": "https://api.ejemplo.com/v1/openapi.json",
        "API_HEADERS": "Authorization:Bearer tu-jwt-token"
      }
    }
  }
}
```

### API con Múltiples Headers

```json
{
  "mcpServers": {
    "api-multi-headers": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.ejemplo.com/v1",
        "OPENAPI_SPEC_PATH": "https://api.ejemplo.com/v1/openapi.json",
        "API_HEADERS": "apikey:tu-anon-key,Authorization:Bearer tu-jwt,Content-Type:application/json"
      }
    }
  }
}
```

### Archivo OpenAPI Local

```json
{
  "mcpServers": {
    "api-local": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "http://localhost:3000/api",
        "OPENAPI_SPEC_PATH": "/ruta/absoluta/a/openapi.json"
      }
    }
  }
}
```

### Supabase REST API

```json
{
  "mcpServers": {
    "supabase-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://tu-proyecto.supabase.co/rest/v1",
        "OPENAPI_SPEC_PATH": "https://tu-proyecto.supabase.co/rest/v1/?apikey=tu-anon-key",
        "API_HEADERS": "apikey:tu-anon-key"
      }
    }
  }
}
```

---

## Herramientas Generadas

El MCP crea herramientas dinámicamente basándose en tu schema OpenAPI:

| Endpoint OpenAPI | Herramienta Generada | Descripción |
|------------------|---------------------|-------------|
| `GET /users` | `mcp__api__get_users` | Listar todos los usuarios |
| `POST /users` | `mcp__api__post_users` | Crear un nuevo usuario |
| `GET /users/{id}` | `mcp__api__get_users_by_id` | Obtener usuario por ID |
| `PATCH /users/{id}` | `mcp__api__patch_users` | Actualizar usuario |
| `DELETE /users/{id}` | `mcp__api__delete_users` | Eliminar usuario |
| `GET /products` | `mcp__api__get_products` | Listar productos |
| `POST /orders` | `mcp__api__post_orders` | Crear orden |

---

## Ejemplos de Uso

### Listar Recursos

```
Usuario: "Muéstrame todos los productos en la base de datos"

AI usa: mcp__api__get_products
Respuesta: [{ id: 1, name: "Laptop", price: 999 }, ...]
```

### Obtener Recurso Individual

```
Usuario: "Dame los detalles del usuario con ID abc123"

AI usa: mcp__api__get_users_by_id con id="abc123"
Respuesta: { id: "abc123", name: "John Doe", email: "john@ejemplo.com" }
```

### Crear Recurso

```
Usuario: "Crea un nuevo producto llamado 'Teclado' con precio $79"

AI usa: mcp__api__post_products con body={ name: "Teclado", price: 79 }
Respuesta: { id: "xyz789", name: "Teclado", price: 79, created_at: "..." }
```

### Filtrar Recursos

```
Usuario: "Lista todas las órdenes con estado 'pendiente'"

AI usa: mcp__api__get_orders con query params status=pending
Respuesta: [{ id: 1, status: "pending", ... }, ...]
```

---

## Consideraciones de Autenticación

### Token Estático (Simple)

Mejor para:
- API keys que no expiran
- Ambientes de desarrollo/testing
- Proyectos personales

### Tokens JWT (Complejo)

**Limitación:** Los tokens JWT típicamente expiran (1 hora por defecto). Necesitarás:

1. **Refrescar manualmente**: Actualizar el token en `.mcp.json` cuando expire
2. **Usar un script de refresh**: Crear un script que obtenga un token fresco y actualice la config
3. **Usar tokens de larga duración**: Si tu API lo soporta (no recomendado para producción)

Para testing de usuarios autenticados, considera usar:
- **DBHub MCP** con un usuario QA que bypasee autenticación
- **Postman** para requests autenticados manuales
- **Playwright MCP** para flujos E2E completos con login

---

## Solución de Problemas

### Error: Cannot fetch OpenAPI spec

```
Error: Failed to fetch OpenAPI specification from URL
```

**Posibles causas:**
- URL de spec incorrecta
- Spec requiere autenticación
- Red/firewall bloqueando el request

**Solución:** Intenta acceder a la URL de la spec en tu navegador primero para verificar que funciona.

### Error: Invalid OpenAPI specification

```
Error: Invalid OpenAPI specification format
```

**Posibles causas:**
- Spec no es JSON/YAML válido
- Spec es OpenAPI v1 (no soportado)
- Spec tiene errores de validación

**Solución:** Valida tu spec en [editor.swagger.io](https://editor.swagger.io/)

### Error: 401 Unauthorized

```
Error: Request failed with status 401
```

**Posibles causas:**
- API key faltante o inválida
- Token expirado
- Formato de header incorrecto

**Solución:** Verifica que tu configuración `API_HEADERS` coincida con lo que la API espera.

### Error: No tools generated

```
No MCP tools available
```

**Posibles causas:**
- Spec OpenAPI vacía
- Spec no tiene operaciones definidas
- MCP falló al parsear la spec

**Solución:** Verifica que tu spec tenga definiciones de endpoints reales con operaciones.

---

## Buenas Prácticas

### 1. Empezar con Operaciones de Solo Lectura

Prueba endpoints GET primero antes de intentar POST/PUT/DELETE:

```
"Listar todos los usuarios" ✓ (seguro)
"Eliminar usuario X" ✗ (verifica primero!)
```

### 2. Verificar Antes de Modificar

Pídele a Claude que muestre qué va a hacer antes de ejecutar:

```
Usuario: "Eliminar orden abc123"

AI (enfoque correcto):
"Primero déjame verificar que esta orden existe:
GET /orders/abc123 → { id: 'abc123', status: 'pending', total: 99.99 }

Esta orden está pendiente con un total de $99.99.
¿Quieres que proceda con la eliminación?"
```

### 3. Usar Nombres Significativos

Nombra tu servidor MCP descriptivamente:

```json
// Bueno
"mi-api-dev": { ... }
"mi-api-staging": { ... }

// Menos claro
"api": { ... }
"mcp1": { ... }
```

### 4. Separar Ambientes

Configura diferentes servidores MCP para diferentes ambientes:

```json
{
  "mcpServers": {
    "api-dev": {
      "env": {
        "API_BASE_URL": "http://localhost:3000/api",
        ...
      }
    },
    "api-staging": {
      "env": {
        "API_BASE_URL": "https://staging.ejemplo.com/api",
        ...
      }
    }
  }
}
```

---

## Integración con Framework KATA

Para tests de API automatizados, usa el `ApiBase` del framework KATA en lugar del MCP:

| Caso de Uso | Herramienta |
|-------------|-------------|
| Testing exploratorio | OpenAPI MCP |
| Verificación manual | OpenAPI MCP |
| Suite de tests automatizados | KATA ApiBase |
| Integración CI/CD | KATA ApiBase |

Ver `docs/testing/automation/playwright-api-testing.md` para patrones de API testing con KATA.

---

## Referencia Rápida

### Template de Configuración MCP

```json
{
  "mcpServers": {
    "mi-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "<url-base>",
        "OPENAPI_SPEC_PATH": "<ruta-o-url-spec>",
        "API_HEADERS": "<header1>:<valor1>,<header2>:<valor2>"
      }
    }
  }
}
```

### Formatos de Header Comunes

| Tipo de Auth | Formato de Header |
|--------------|-------------------|
| API Key | `x-api-key:tu-key` |
| Bearer Token | `Authorization:Bearer tu-token` |
| Basic Auth | `Authorization:Basic credenciales-base64` |
| Custom | `X-Custom-Header:valor` |

---

## Navegación

- [DBHub MCP](docs/setup/mcp-dbhub.md) - Configuración de DBHub MCP
- [Testing de APIs](docs/testing/api/) - Guías de testing de APIs
