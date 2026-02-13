# DBHub MCP Setup Guide

This guide walks you through connecting Claude Code to a database using the DBHub MCP server. Examples use Azure SQL Server, but the same principles apply to other databases.

## Prerequisites

Before starting, ensure you have:

- [ ] Node.js or Bun installed
- [ ] Claude Code installed and configured
- [ ] Access credentials for the database (SQL authentication user)
- [ ] Your IP address whitelisted in the database firewall (if applicable)

## Supported Databases

DBHub supports multiple database types:

| Database   | Type Value   | Default Port | Notes                          |
| ---------- | ------------ | ------------ | ------------------------------ |
| PostgreSQL | `postgresql` | 5432         | Most common for web apps       |
| MySQL      | `mysql`      | 3306         | Popular for PHP projects       |
| SQL Server | `sqlserver`  | 1433         | Common in enterprise/.NET      |
| SQLite     | `sqlite`     | N/A          | File-based, no server needed   |
| MariaDB    | `mariadb`    | 3306         | MySQL-compatible               |

## Quick Start (Recommended)

The most reliable method is using a **TOML configuration file**. The DSN method has known issues with some databases' encryption requirements.

### 1. Create a config file

Create `dbhub.toml` in your project root:

#### SQL Server (Azure)

```toml
[[sources]]
id = "my-database"
type = "sqlserver"
host = "your-server.database.windows.net"
port = 1433
database = "your-database-name"
user = "your_sql_user"
password = "your_password"
sslmode = "require"
```

#### PostgreSQL

```toml
[[sources]]
id = "my-database"
type = "postgresql"
host = "localhost"
port = 5432
database = "your_database"
user = "postgres"
password = "your_password"
sslmode = "disable"  # or "require" for production
```

#### MySQL

```toml
[[sources]]
id = "my-database"
type = "mysql"
host = "localhost"
port = 3306
database = "your_database"
user = "root"
password = "your_password"
```

#### SQLite

```toml
[[sources]]
id = "my-database"
type = "sqlite"
path = "./data/local.db"
```

### 2. Configure MCP in Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "my-database": {
      "command": "bunx",
      "args": [
        "-y",
        "@bytebase/dbhub@latest",
        "--config",
        "/absolute/path/to/dbhub.toml"
      ]
    }
  }
}
```

### 3. Test the connection

```bash
bunx @bytebase/dbhub@latest --config dbhub.toml
```

You should see:
```
DBHub MCP Server running on stdio
```

---

## Creating a SQL User for DBHub

DBHub requires **SQL authentication** (username/password). Azure AD/Entra authentication is not supported.

### Option 1: Use an existing SQL user

If your team has a shared SQL user, get the credentials from:
- Environment variables
- Team password manager
- Backend configuration

### Option 2: Create a dedicated SQL user

#### For SQL Server

```sql
-- Create the SQL user
CREATE USER [qa_automation] WITH PASSWORD = 'YourSecurePassword123!';

-- Grant read permissions
ALTER ROLE db_datareader ADD MEMBER [qa_automation];

-- Grant write permissions (optional, for test data setup)
ALTER ROLE db_datawriter ADD MEMBER [qa_automation];
```

#### For PostgreSQL

```sql
-- Create the user
CREATE USER qa_automation WITH PASSWORD 'YourSecurePassword123!';

-- Grant read permissions
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qa_automation;

-- Grant write permissions (optional)
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qa_automation;
```

#### For MySQL

```sql
-- Create the user
CREATE USER 'qa_automation'@'%' IDENTIFIED BY 'YourSecurePassword123!';

-- Grant read permissions
GRANT SELECT ON your_database.* TO 'qa_automation'@'%';

-- Grant write permissions (optional)
GRANT INSERT, UPDATE, DELETE ON your_database.* TO 'qa_automation'@'%';

FLUSH PRIVILEGES;
```

---

## Alternative: DSN Method

> **Warning:** The DSN method has known issues with some databases' encryption requirements. Use the TOML method above instead when possible.

### DSN Format by Database Type

#### SQL Server
```
sqlserver://username:password@server.database.windows.net:1433/database?encrypt=true
```

#### PostgreSQL
```
postgresql://username:password@localhost:5432/database?sslmode=disable
```

#### MySQL
```
mysql://username:password@localhost:3306/database
```

### DSN Configuration

```json
{
  "mcpServers": {
    "my-database": {
      "command": "bunx",
      "args": [
        "-y",
        "@bytebase/dbhub@latest",
        "--dsn",
        "postgresql://username:password@localhost:5432/database"
      ]
    }
  }
}
```

---

## Testing the Connection

### Test via terminal

```bash
bunx @bytebase/dbhub@latest --config dbhub.toml
```

### Test with web interface

```bash
bunx @bytebase/dbhub@latest --config dbhub.toml --transport http --port 8080
```

Open `http://localhost:8080` in your browser to access the Workbench interface.

## Verify in Claude Code

### Start Claude Code

```bash
claude
```

### Check MCP Connection Status

Type `/mcp` to see the list of connected MCP servers. Your database should appear as **connected**.

### Test with a Query

```
Look at the database and tell me how many tables there are.
```

If you see the MCP tool being called and returning results, your connection is working correctly.

## Troubleshooting

### Error: Server requires encryption

```
ConnectionError: Server requires encryption, set 'encrypt' config option to true.
```

**Solution:** Use the TOML configuration method with `sslmode = "require"`.

### Error: Login failed

```
ConnectionError: Login failed for user '<username>'
```

**Possible causes:**
- Incorrect username or password
- Password contains special characters not supported by your terminal
- User doesn't have access to the specified database

> **Tip:** If you have issues with special characters in the password, use a TOML configuration file instead of the DSN string.

### Error: Cannot connect to server

```
ConnectionError: Failed to connect to <server>:1433
```

**Possible causes:**
- Your IP is not whitelisted in the database firewall
- Server name is incorrect
- Network/firewall blocking the port

**Solution:** Whitelist your IP in the database server's firewall settings.

### Error: Database not found

```
ConnectionError: Cannot open database "<database>" requested by the login
```

**Solution:** Verify the exact database name. Database names are case-sensitive in some systems.

## Available MCP Tools

Once connected, DBHub provides the following tools to Claude:

| Tool             | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `execute_sql`    | Execute SQL queries with transaction support           |
| `search_objects` | Explore database schemas, tables, columns, and indexes |

## Security Recommendations

- [ ] Never commit connection strings with credentials to version control
- [ ] Add `dbhub.toml` to your `.gitignore`
- [ ] Use environment variables for sensitive data when possible
- [ ] Create a dedicated database user with minimal required permissions
- [ ] Regularly rotate database passwords
- [ ] Use read-only users for query-only access

## Quick Reference

### TOML Configuration Template

```toml
[[sources]]
id = "my-database"
type = "<postgresql|mysql|sqlserver|sqlite>"
host = "<server-hostname>"
port = <port-number>
database = "<database-name>"
user = "<sql-user>"
password = "<password>"
sslmode = "<require|disable>"
```

### MCP Configuration Template

```json
{
  "mcpServers": {
    "my-database": {
      "command": "bunx",
      "args": [
        "-y",
        "@bytebase/dbhub@latest",
        "--config",
        "/absolute/path/to/dbhub.toml"
      ]
    }
  }
}
```

### Useful Commands

| Command                                                                   | Description              |
| ------------------------------------------------------------------------- | ------------------------ |
| `bunx @bytebase/dbhub@latest --help`                                      | Show DBHub help          |
| `bunx @bytebase/dbhub@latest --config dbhub.toml`                         | Start with TOML config   |
| `bunx @bytebase/dbhub@latest --config dbhub.toml --transport http --port 8080` | Start with web interface |

---

*Last updated: February 2026*
