# Guía de Configuración de DBHub MCP

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** QA Engineers configurando acceso a base de datos via MCP

---

Esta guía te ayuda a conectar Claude Code a una base de datos usando el servidor MCP de DBHub. Los ejemplos usan Azure SQL Server, pero los mismos principios aplican a otras bases de datos.

## Prerrequisitos

Antes de comenzar, asegúrate de tener:

- [ ] Node.js o Bun instalado
- [ ] Claude Code instalado y configurado
- [ ] Credenciales de acceso a la base de datos (usuario SQL)
- [ ] Tu dirección IP en la whitelist del firewall de la base de datos (si aplica)

---

## Bases de Datos Soportadas

DBHub soporta múltiples tipos de base de datos:

| Base de Datos | Valor de Tipo | Puerto Default | Notas |
|---------------|---------------|----------------|-------|
| PostgreSQL | `postgresql` | 5432 | Más común para web apps |
| MySQL | `mysql` | 3306 | Popular para proyectos PHP |
| SQL Server | `sqlserver` | 1433 | Común en enterprise/.NET |
| SQLite | `sqlite` | N/A | Basado en archivo, sin servidor |
| MariaDB | `mariadb` | 3306 | Compatible con MySQL |

---

## Inicio Rápido (Recomendado)

El método más confiable es usar un **archivo de configuración TOML**. El método DSN tiene problemas conocidos con los requisitos de encriptación de algunas bases de datos.

### 1. Crear Archivo de Configuración

Crea `dbhub.toml` en la raíz de tu proyecto:

#### SQL Server (Azure)

```toml
[[sources]]
id = "mi-base-de-datos"
type = "sqlserver"
host = "tu-servidor.database.windows.net"
port = 1433
database = "nombre-de-tu-base"
user = "tu_usuario_sql"
password = "tu_password"
sslmode = "require"
```

#### PostgreSQL

```toml
[[sources]]
id = "mi-base-de-datos"
type = "postgresql"
host = "localhost"
port = 5432
database = "tu_base_de_datos"
user = "postgres"
password = "tu_password"
sslmode = "disable"  # o "require" para producción
```

#### MySQL

```toml
[[sources]]
id = "mi-base-de-datos"
type = "mysql"
host = "localhost"
port = 3306
database = "tu_base_de_datos"
user = "root"
password = "tu_password"
```

#### SQLite

```toml
[[sources]]
id = "mi-base-de-datos"
type = "sqlite"
path = "./data/local.db"
```

### 2. Configurar MCP en Claude Code

Agrega a tu `.mcp.json`:

```json
{
  "mcpServers": {
    "mi-base-de-datos": {
      "command": "bunx",
      "args": [
        "-y",
        "@bytebase/dbhub@latest",
        "--config",
        "/ruta/absoluta/a/dbhub.toml"
      ]
    }
  }
}
```

### 3. Probar la Conexión

```bash
bunx @bytebase/dbhub@latest --config dbhub.toml
```

Deberías ver:
```
DBHub MCP Server running on stdio
```

---

## Crear Usuario SQL para DBHub

DBHub requiere **autenticación SQL** (usuario/contraseña). La autenticación Azure AD/Entra no está soportada.

### Opción 1: Usar un Usuario SQL Existente

Si tu equipo tiene un usuario SQL compartido, obtén las credenciales de:
- Variables de entorno
- Gestor de contraseñas del equipo
- Configuración del backend

### Opción 2: Crear un Usuario SQL Dedicado

#### Para SQL Server

```sql
-- Crear el usuario SQL
CREATE USER [qa_automation] WITH PASSWORD = 'TuPasswordSeguro123!';

-- Otorgar permisos de lectura
ALTER ROLE db_datareader ADD MEMBER [qa_automation];

-- Otorgar permisos de escritura (opcional, para setup de datos de prueba)
ALTER ROLE db_datawriter ADD MEMBER [qa_automation];
```

#### Para PostgreSQL

```sql
-- Crear el usuario
CREATE USER qa_automation WITH PASSWORD 'TuPasswordSeguro123!';

-- Otorgar permisos de lectura
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qa_automation;

-- Otorgar permisos de escritura (opcional)
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qa_automation;
```

#### Para MySQL

```sql
-- Crear el usuario
CREATE USER 'qa_automation'@'%' IDENTIFIED BY 'TuPasswordSeguro123!';

-- Otorgar permisos de lectura
GRANT SELECT ON tu_base_de_datos.* TO 'qa_automation'@'%';

-- Otorgar permisos de escritura (opcional)
GRANT INSERT, UPDATE, DELETE ON tu_base_de_datos.* TO 'qa_automation'@'%';

FLUSH PRIVILEGES;
```

---

## Alternativa: Método DSN

> **Advertencia:** El método DSN tiene problemas conocidos con los requisitos de encriptación de algunas bases de datos. Usa el método TOML cuando sea posible.

### Formato DSN por Tipo de Base de Datos

#### SQL Server
```
sqlserver://usuario:password@servidor.database.windows.net:1433/base_datos?encrypt=true
```

#### PostgreSQL
```
postgresql://usuario:password@localhost:5432/base_datos?sslmode=disable
```

#### MySQL
```
mysql://usuario:password@localhost:3306/base_datos
```

### Configuración DSN

```json
{
  "mcpServers": {
    "mi-base-de-datos": {
      "command": "bunx",
      "args": [
        "-y",
        "@bytebase/dbhub@latest",
        "--dsn",
        "postgresql://usuario:password@localhost:5432/base_datos"
      ]
    }
  }
}
```

---

## Probar la Conexión

### Probar via Terminal

```bash
bunx @bytebase/dbhub@latest --config dbhub.toml
```

### Probar con Interfaz Web

```bash
bunx @bytebase/dbhub@latest --config dbhub.toml --transport http --port 8080
```

Abre `http://localhost:8080` en tu navegador para acceder a la interfaz Workbench.

## Verificar en Claude Code

### Iniciar Claude Code

```bash
claude
```

### Verificar Estado de Conexión MCP

Escribe `/mcp` para ver la lista de servidores MCP conectados. Tu base de datos debería aparecer como **connected**.

### Probar con una Query

```
Mira la base de datos y dime cuántas tablas hay.
```

Si ves que se llama la herramienta MCP y devuelve resultados, tu conexión está funcionando correctamente.

---

## Solución de Problemas

### Error: Server requires encryption

```
ConnectionError: Server requires encryption, set 'encrypt' config option to true.
```

**Solución:** Usa el método de configuración TOML con `sslmode = "require"`.

### Error: Login failed

```
ConnectionError: Login failed for user '<username>'
```

**Posibles causas:**
- Usuario o contraseña incorrectos
- Password contiene caracteres especiales no soportados por tu terminal
- El usuario no tiene acceso a la base de datos especificada

> **Tip:** Si tienes problemas con caracteres especiales en la contraseña, usa un archivo de configuración TOML en lugar del string DSN.

### Error: Cannot connect to server

```
ConnectionError: Failed to connect to <server>:1433
```

**Posibles causas:**
- Tu IP no está en la whitelist del firewall de la base de datos
- El nombre del servidor es incorrecto
- Red/firewall bloqueando el puerto

**Solución:** Agrega tu IP a la whitelist en la configuración del firewall del servidor de base de datos.

### Error: Database not found

```
ConnectionError: Cannot open database "<database>" requested by the login
```

**Solución:** Verifica el nombre exacto de la base de datos. Los nombres de base de datos son case-sensitive en algunos sistemas.

---

## Herramientas MCP Disponibles

Una vez conectado, DBHub proporciona las siguientes herramientas a Claude:

| Herramienta | Descripción |
|-------------|-------------|
| `execute_sql` | Ejecutar queries SQL con soporte de transacciones |
| `search_objects` | Explorar schemas, tablas, columnas e índices |

---

## Recomendaciones de Seguridad

- [ ] Nunca commitees strings de conexión con credenciales al control de versiones
- [ ] Agrega `dbhub.toml` a tu `.gitignore`
- [ ] Usa variables de entorno para datos sensibles cuando sea posible
- [ ] Crea un usuario de base de datos dedicado con permisos mínimos requeridos
- [ ] Rota las contraseñas de base de datos regularmente
- [ ] Usa usuarios de solo lectura para acceso de consulta solamente

---

## Referencia Rápida

### Template de Configuración TOML

```toml
[[sources]]
id = "mi-base-de-datos"
type = "<postgresql|mysql|sqlserver|sqlite>"
host = "<hostname-del-servidor>"
port = <numero-de-puerto>
database = "<nombre-de-base>"
user = "<usuario-sql>"
password = "<password>"
sslmode = "<require|disable>"
```

### Template de Configuración MCP

```json
{
  "mcpServers": {
    "mi-base-de-datos": {
      "command": "bunx",
      "args": [
        "-y",
        "@bytebase/dbhub@latest",
        "--config",
        "/ruta/absoluta/a/dbhub.toml"
      ]
    }
  }
}
```

### Comandos Útiles

| Comando | Descripción |
|---------|-------------|
| `bunx @bytebase/dbhub@latest --help` | Mostrar ayuda de DBHub |
| `bunx @bytebase/dbhub@latest --config dbhub.toml` | Iniciar con config TOML |
| `bunx @bytebase/dbhub@latest --config dbhub.toml --transport http --port 8080` | Iniciar con interfaz web |

---

## Navegación

- [OpenAPI MCP](docs/setup/mcp-openapi.md) - Configuración de OpenAPI MCP
- [Testing de APIs](docs/testing/api/) - Guías de testing de APIs
