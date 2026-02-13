# Supabase: Connection Setup

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** QA Engineers que trabajan con proyectos Supabase

---

## Overview

Supabase ofrece múltiples formas de conectarse a la base de datos PostgreSQL. Este documento explica cómo configurar conexiones para testing y uso con MCPs.

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPCIONES DE CONEXIÓN                          │
│                                                                  │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│   │   Direct    │      │  Session    │      │ Transaction │     │
│   │ Connection  │      │   Pooler    │      │   Pooler    │     │
│   └──────┬──────┘      └──────┬──────┘      └──────┬──────┘     │
│          │                    │                    │             │
│          ▼                    ▼                    ▼             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    PostgreSQL                            │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tipos de Connection String

Supabase proporciona tres tipos de connection strings. Los encuentras en:

**Dashboard → Project Settings → Database → Connection string**

### 1. Direct Connection

Conexión directa al servidor PostgreSQL:

```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

| Característica | Valor |
|---------------|-------|
| Puerto | `5432` |
| Conexiones máximas | Limitadas (~20-60 según plan) |
| Mejor para | Migraciones, admin tasks |

### 2. Session Pooler

Conexión a través del pooler con modo sesión:

```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?pgbouncer=true
```

| Característica | Valor |
|---------------|-------|
| Puerto | `5432` |
| Modo | Session (mantiene estado) |
| Mejor para | Aplicaciones con transacciones largas |

### 3. Transaction Pooler (Recomendado para Testing)

Conexión optimizada para muchas conexiones cortas:

```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

| Característica | Valor |
|---------------|-------|
| Puerto | **`6543`** (diferente!) |
| Modo | Transaction |
| Mejor para | **Tests, serverless, muchos clientes** |

---

## Componentes del Connection String

```
postgresql://postgres.czuusjchqpgvanvbdrnz:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
└────┬────┘ └─────────┬────────────────┘ └──┬──┘ └────────────┬────────────────────┘ └─┬─┘ └──┬───┘
  protocolo         user                  pass              host                    port    db
```

| Componente | Descripción | Ejemplo |
|------------|-------------|---------|
| **User** | `postgres.[PROJECT_REF]` | `postgres.czuusjchqpgvanvbdrnz` |
| **Password** | Tu database password | (establecido al crear proyecto) |
| **Host** | Pooler endpoint | `aws-0-us-east-1.pooler.supabase.com` |
| **Port** | 5432 (session) o 6543 (transaction) | `6543` |
| **Database** | Siempre `postgres` | `postgres` |

### Extraer el Project Reference

El **Project Reference** es el identificador único de tu proyecto Supabase:

```typescript
// Desde la URL del proyecto
const SUPABASE_URL = 'https://czuusjchqpgvanvbdrnz.supabase.co';
const PROJECT_REF = SUPABASE_URL.split('//')[1].split('.')[0];
// Result: 'czuusjchqpgvanvbdrnz'
```

---

## Configuración para DBHub MCP

El MCP de DBHub permite que tu AI assistant acceda a la base de datos. Se configura con un archivo TOML.

### Paso 1: Crear `dbhub.toml`

Crea un archivo `dbhub.toml` en el root de tu proyecto:

```toml
# dbhub.toml
[[sources]]
id = "supabase-staging"
type = "postgres"
host = "aws-0-us-east-1.pooler.supabase.com"
port = 6543
database = "postgres"
user = "postgres.czuusjchqpgvanvbdrnz"
password = "TuPasswordAqui"
sslmode = "require"
```

### Paso 2: Configurar MCP

#### Claude Code (`.mcp.json`)

```json
{
  "mcpServers": {
    "sql": {
      "command": "npx",
      "args": [
        "-y",
        "@bytebase/dbhub@latest",
        "--config",
        "dbhub.toml"
      ]
    }
  }
}
```

#### OpenCode (`opencode.json`)

```json
{
  "mcpServers": {
    "sql": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "@bytebase/dbhub@latest",
        "--config",
        "dbhub.toml"
      ],
      "enabled": true
    }
  }
}
```

### Paso 3: Verificar Conexión

Después de configurar, reinicia tu AI assistant y verifica que el MCP esté activo:

```
/mcp
```

Deberías ver el MCP de `sql` listado con sus herramientas disponibles.

---

## IPv4 vs IPv6

Supabase usa **IPv6** por defecto, pero algunos entornos solo soportan IPv4.

### Forzar IPv4

Agrega el parámetro `?options=pool_mode=transaction&options=force_ipv4=true`:

```
postgresql://user:pass@host:6543/postgres?options=-c%20search_path%3Dpublic
```

O usa el **IPv4 Add-on** en proyectos Pro (Dashboard → Project Settings → Add-ons).

### Verificar Soporte IPv6

```bash
# Verificar si tu máquina tiene IPv6
ping6 google.com

# Si falla, necesitas usar IPv4
```

---

## Roles y Permisos

Supabase tiene varios roles predefinidos:

| Rol | Descripción | Uso |
|-----|-------------|-----|
| `postgres` | Superuser | Admin tasks, migraciones |
| `anon` | Usuario anónimo | Public API (con RLS) |
| `authenticated` | Usuario logueado | API autenticada (con RLS) |
| `service_role` | Bypass RLS | Backend, admin APIs |

### Para Testing: Crear Usuario QA

```sql
-- Crear rol QA con permisos limitados
CREATE ROLE qa_tester WITH LOGIN PASSWORD 'QaPassword123!';

-- Dar permisos de lectura
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qa_tester;

-- Para staging, agregar permisos de escritura
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qa_tester;
```

Luego usa este usuario en tu `dbhub.toml`:

```toml
[[sources]]
id = "supabase-qa"
type = "postgres"
host = "aws-0-us-east-1.pooler.supabase.com"
port = 6543
database = "postgres"
user = "qa_tester.czuusjchqpgvanvbdrnz"
password = "QaPassword123!"
sslmode = "require"
```

---

## Múltiples Ambientes

Puedes configurar múltiples conexiones en el mismo `dbhub.toml`:

```toml
# dbhub.toml

# Desarrollo local
[[sources]]
id = "local"
type = "postgres"
host = "localhost"
port = 54322
database = "postgres"
user = "postgres"
password = "postgres"

# Staging
[[sources]]
id = "staging"
type = "postgres"
host = "aws-0-us-east-1.pooler.supabase.com"
port = 6543
database = "postgres"
user = "postgres.STAGING_PROJECT_REF"
password = "StagingPassword"
sslmode = "require"

# Production (solo lectura)
[[sources]]
id = "production"
type = "postgres"
host = "aws-0-us-east-1.pooler.supabase.com"
port = 6543
database = "postgres"
user = "qa_readonly.PROD_PROJECT_REF"
password = "ReadOnlyPassword"
sslmode = "require"
```

---

## Troubleshooting

### Error: Connection refused

```
FATAL: Connection refused
```

**Soluciones:**
1. Verificar que el host y puerto son correctos
2. Para transaction pooler, usar puerto `6543`
3. Verificar que no hay firewall bloqueando

### Error: Password authentication failed

```
FATAL: password authentication failed for user "postgres"
```

**Soluciones:**
1. Verificar password en Dashboard → Settings → Database
2. Asegurar que el formato del user es `postgres.[PROJECT_REF]`
3. Resetear password si es necesario

### Error: SSL required

```
FATAL: SSL connection is required
```

**Solución:** Agregar `sslmode = "require"` en la configuración.

### Error: Too many connections

```
FATAL: too many connections
```

**Soluciones:**
1. Usar Transaction Pooler (puerto 6543)
2. Cerrar conexiones después de usarlas
3. Reducir paralelismo de tests

---

## Próximos Pasos

1. **Auth Tokens:** [auth-tokens.md](./auth-tokens.md) - Autenticación con Supabase
2. **Troubleshooting:** [troubleshooting.md](./troubleshooting.md) - Problemas comunes
3. **Generic Connections:** [../../testing/database/connection-db.md](../../testing/database/connection-db.md) - Conceptos genéricos

---

## Referencias

- [Supabase Database Connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [DBHub MCP Documentation](https://github.com/bytebase/dbhub)
