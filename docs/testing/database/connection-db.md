# Conexiones a Base de Datos

> **Idioma:** Español
> **Nivel:** Introductorio a Intermedio
> **Audiencia:** QA Engineers que necesitan conectarse a bases de datos para testing

---

## ¿Por qué conectarse directamente a la DB?

Mientras que el API testing verifica el contrato y comportamiento de la API, hay escenarios donde necesitas acceso directo a la base de datos:

| Escenario | Por qué necesitas DB directa |
|-----------|------------------------------|
| **Validar datos** | Verificar que los datos se guardaron correctamente |
| **Setup de tests** | Crear datos de prueba rápidamente |
| **Cleanup** | Limpiar datos después de los tests |
| **Debugging** | Investigar bugs revisando el estado de los datos |
| **Testing de triggers** | Verificar side-effects que no expone la API |

---

## Anatomía de un Connection String

Un **connection string** (o DSN - Data Source Name) contiene toda la información para conectarse a una base de datos:

```
postgresql://usuario:password@host:puerto/database?opciones
└────┬────┘  └──┬──┘ └──┬──┘ └─┬─┘ └─┬─┘ └──┬───┘ └──┬───┘
  protocolo  user   pass   host  port   db    params
```

### Ejemplo PostgreSQL

```
postgresql://qa_user:SecurePass123@db.example.com:5432/myapp_staging?sslmode=require
```

| Componente | Valor | Descripción |
|------------|-------|-------------|
| Protocolo | `postgresql://` | Tipo de base de datos |
| Usuario | `qa_user` | Usuario de la DB |
| Password | `SecurePass123` | Contraseña |
| Host | `db.example.com` | Servidor de la DB |
| Puerto | `5432` | Puerto (5432 es default para PostgreSQL) |
| Database | `myapp_staging` | Nombre de la base de datos |
| Parámetros | `sslmode=require` | Opciones adicionales |

### Ejemplos por Base de Datos

```bash
# PostgreSQL
postgresql://user:pass@localhost:5432/mydb

# MySQL
mysql://user:pass@localhost:3306/mydb

# SQLite (archivo local)
sqlite:///path/to/database.db

# SQL Server
mssql://user:pass@localhost:1433/mydb

# MongoDB
mongodb://user:pass@localhost:27017/mydb
```

---

## Tipos de Conexión

### Conexión Directa

```
┌─────────────┐                    ┌─────────────┐
│   Cliente   │ ──────────────────▶│   Database  │
│  (tu test)  │                    │   Server    │
└─────────────┘                    └─────────────┘
```

- ✅ Simple de configurar
- ✅ Conexión rápida para una sola operación
- ❌ No escala bien con muchos tests paralelos
- ❌ Puede agotar conexiones disponibles

### Conexión con Pooler

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Cliente   │ ────▶│   Pooler    │ ────▶│   Database  │
│  (tu test)  │      │ (PgBouncer) │      │   Server    │
└─────────────┘      └─────────────┘      └─────────────┘
```

Un **connection pooler** mantiene un "pool" de conexiones abiertas y las reutiliza:

- ✅ Mejor rendimiento con muchos clientes
- ✅ Maneja límites de conexiones automáticamente
- ✅ Reconexión automática si la DB se reinicia
- ❌ Configuración adicional

**Poolers comunes:**
- **PgBouncer** (PostgreSQL)
- **PgCat** (PostgreSQL, más moderno)
- **ProxySQL** (MySQL)

---

## Parámetros de Conexión Importantes

### SSL/TLS Mode

```bash
# PostgreSQL
?sslmode=disable    # Sin SSL (solo desarrollo local)
?sslmode=require    # SSL requerido (producción)
?sslmode=verify-ca  # Verificar certificado CA
?sslmode=verify-full # Verificar CA + hostname
```

### Connection Timeout

```bash
# Timeout de conexión en segundos
?connect_timeout=10
```

### Pool Size (para librerías que manejan pool)

```bash
# Tamaño mínimo y máximo del pool
?pool_min=1&pool_max=10
```

---

## Conexión desde diferentes herramientas

### Usando MCP (DBHub)

El MCP de DBHub permite que tu AI assistant acceda a la base de datos. Se configura con un archivo `.toml`:

```toml
# dbhub.toml
[[sources]]
id = "my-database"
type = "postgres"           # postgres, mysql, sqlite, etc.
host = "db.example.com"
port = 5432
database = "myapp_staging"
user = "qa_user"
password = "SecurePass123"
sslmode = "require"
```

Luego se referencia desde tu configuración de MCP:

```json
{
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
```

> Ver [mcp-dbhub.md](docs/setup/mcp-dbhub.md) para configuración completa.

### Usando Playwright (en tests)

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

test('verify user was created', async () => {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    ['test@example.com']
  );

  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].name).toBe('Test User');
});
```

### Usando CLI (psql, mysql)

```bash
# PostgreSQL
psql "postgresql://user:pass@host:5432/mydb"

# MySQL
mysql -h host -P 3306 -u user -p mydb

# SQLite
sqlite3 /path/to/database.db
```

---

## Seguridad en Conexiones

### Nunca en código

```typescript
// ❌ NUNCA hagas esto
const connectionString = 'postgresql://admin:SuperSecret@prod.db.com:5432/production';

// ✅ Usa variables de entorno
const connectionString = process.env.DATABASE_URL;
```

### Variables de Entorno

```bash
# .env (nunca commiteado)
DATABASE_URL=postgresql://user:pass@host:5432/mydb
```

### Diferentes credenciales por entorno

```bash
# .env.local (desarrollo)
DATABASE_URL=postgresql://dev:dev@localhost:5432/myapp_dev

# .env.staging (staging)
DATABASE_URL=postgresql://qa:StagePass@staging.db.com:5432/myapp_staging

# .env.production (producción - solo lectura para QA!)
DATABASE_URL=postgresql://qa_readonly:ReadOnly@prod.db.com:5432/myapp_prod
```

### Permisos mínimos

Para testing, tu usuario de DB debería tener **permisos mínimos necesarios**:

| Ambiente | Permisos Recomendados |
|----------|----------------------|
| **Desarrollo** | SELECT, INSERT, UPDATE, DELETE |
| **Staging** | SELECT, INSERT, UPDATE, DELETE |
| **Producción** | SELECT solamente (readonly) |

```sql
-- Crear usuario de QA con permisos limitados
CREATE USER qa_user WITH PASSWORD 'SecurePass';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qa_user;
-- Para staging, agregar:
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qa_user;
```

---

## Troubleshooting Común

### Error: Connection refused

```
FATAL: Connection refused
```

**Causas:**
- DB no está corriendo
- Puerto incorrecto
- Firewall bloqueando

**Solución:**
```bash
# Verificar que la DB está corriendo
pg_isready -h localhost -p 5432
```

### Error: Authentication failed

```
FATAL: password authentication failed for user "qa_user"
```

**Causas:**
- Password incorrecto
- Usuario no existe
- Método de auth incorrecto en pg_hba.conf

### Error: Too many connections

```
FATAL: too many connections for role "qa_user"
```

**Causas:**
- Ejecutando muchos tests en paralelo
- Conexiones no se están cerrando

**Solución:**
- Usar un connection pooler
- Reducir paralelismo de tests
- Asegurar que los tests cierran conexiones

### Error: SSL required

```
FATAL: SSL connection is required
```

**Solución:**
```bash
# Agregar sslmode al connection string
?sslmode=require
```

---

## Próximos Pasos

1. **Configurar MCP:** [mcp-dbhub.md](docs/setup/mcp-dbhub.md) - Setup de DBHub MCP
2. **Validar datos:** [data-validation-testing.md](docs/testing/database/data-validation-testing.md) - Estrategias de validación
3. **API vs DB Testing:** [fundamentals.md](docs/testing/database/fundamentals.md) - Cuándo usar cada approach

---

## Referencias

- [PostgreSQL Connection Strings](https://www.postgresql.org/docs/current/libpq-connect.html)
- [PgBouncer](https://www.pgbouncer.org/)
- [DBHub MCP](https://github.com/bytebase/dbhub)
