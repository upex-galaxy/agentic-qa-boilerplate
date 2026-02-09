# DBHub MCP Configuration for Database Testing

## What is DBHub?

**@bytebase/dbhub** is an MCP (Model Context Protocol) that allows connecting AI tools like Claude to PostgreSQL, MySQL, SQLite, and other databases. With this, you can ask Claude to execute SQL queries directly.

---

## Prerequisites

- **Node.js 18+** installed
- Access to a PostgreSQL database (in this case, Supabase)
- Connection credentials

---

## Step 1: Get the Supabase Connection String

### ⚠️ Important: IPv4 vs IPv6

Supabase has two types of connection:

| Type                  | Port | Compatibility                                 |
| --------------------- | ---- | --------------------------------------------- |
| **Direct Connection** | 5432 | May use IPv6 (fails on some networks)         |
| **Shared Pooler**     | 6543 | Uses IPv4 ✅ (works on all networks)          |

**Recommendation:** Always use the **Shared Pooler** to avoid connectivity issues.

### How to get the correct connection string

1. Go to your project in **Supabase Dashboard**
2. Go to **Project Settings** → **Database**
3. In the **Connection string** section, change the **Method** to **Transaction** or **Session**
4. Copy the connection string from the **Shared Pooler**

The format will be:

```
postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
```

**Real example:**

```
postgresql://postgres.ionevzckjyxtpmyenbxc:YourPassword123@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

---

## Step 2: Create a user with limited permissions (Recommended)

Instead of using the `postgres` user (which has full access), create a specific user for testing.

### Option A: Read-only user (SELECT)

Execute this in the Supabase **SQL Editor**:

```sql
-- Create read-only user
CREATE USER qa_readonly WITH PASSWORD 'Secure_Password_123';

-- Allow connection
GRANT CONNECT ON DATABASE postgres TO qa_readonly;

-- Read permissions on public schema
GRANT USAGE ON SCHEMA public TO qa_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qa_readonly;

-- For future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT ON TABLES TO qa_readonly;
```

### Option B: User with DML permissions (SELECT, INSERT, UPDATE, DELETE)

```sql
-- Create user with DML permissions (cannot modify structure)
CREATE USER qa_team WITH PASSWORD 'Secure_Password_123';

-- Allow connection
GRANT CONNECT ON DATABASE postgres TO qa_team;

-- DML permissions on public schema
GRANT USAGE ON SCHEMA public TO qa_team;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qa_team;

-- For future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qa_team;

-- Allow use of sequences (necessary for INSERT with auto-incremental IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO qa_team;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO qa_team;
```

### The connection string with your custom user

**Format in Shared Pooler:** The user must have the format `user.project`

```
postgresql://qa_team.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
```

**Example:**

```
postgresql://qa_team.ionevzckjyxtpmyenbxc:Secure_Password_123@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

---

## Step 3: Verify the connection

Before configuring the MCP, verify that the connection string works.

### On Linux/macOS (Bash):

```bash
# Use SINGLE quotes to avoid problems with special characters
npx -y @bytebase/dbhub --transport stdio --dsn 'postgresql://qa_team.ionevzckjyxtpmyenbxc:Secure_Password_123@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
```

### On Windows (PowerShell):

```powershell
# Use DOUBLE quotes in PowerShell
npx -y @bytebase/dbhub --transport stdio --dsn "postgresql://qa_team.ionevzckjyxtpmyenbxc:Secure_Password_123@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

**If it connects successfully, you'll see:**

```
Configuration source: command line argument
Connecting to 1 database source(s)...
  - default: postgresql://qa_team:*******@aws-0-us-east-1.pooler.supabase.com:6543/postgres
Connected successfully!
DBHub MCP Server running on stdio
```

---

## Step 4: Configure the MCP

### Claude Code (CLI)

```bash
claude mcp add-json "database" '{"command":"npx","args":["-y","@bytebase/dbhub","--transport","stdio","--dsn","postgresql://qa_team.ionevzckjyxtpmyenbxc:Secure_Password_123@aws-0-us-east-1.pooler.supabase.com:6543/postgres"]}'
```

### Claude Desktop

Configuration file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": [
        "-y",
        "@bytebase/dbhub",
        "--transport",
        "stdio",
        "--dsn",
        "postgresql://qa_team.ionevzckjyxtpmyenbxc:Secure_Password_123@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
      ]
    }
  }
}
```

### Cursor IDE

File: `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project)

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": [
        "-y",
        "@bytebase/dbhub",
        "--transport",
        "stdio",
        "--dsn",
        "postgresql://qa_team.ionevzckjyxtpmyenbxc:Secure_Password_123@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
      ]
    }
  }
}
```

### VS Code (GitHub Copilot)

File: `.vscode/mcp.json`

```json
{
  "servers": {
    "database": {
      "command": "npx",
      "args": [
        "-y",
        "@bytebase/dbhub",
        "--transport",
        "stdio",
        "--dsn",
        "postgresql://qa_team.ionevzckjyxtpmyenbxc:Secure_Password_123@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
      ]
    }
  }
}
```

---

## Step 5: Configuration with environment variables (more secure)

If your password has special characters (`!`, `@`, `#`, etc.), use environment variables:

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["-y", "@bytebase/dbhub", "--transport", "stdio"],
      "env": {
        "DB_TYPE": "postgres",
        "DB_HOST": "aws-0-us-east-1.pooler.supabase.com",
        "DB_PORT": "6543",
        "DB_USER": "qa_team.ionevzckjyxtpmyenbxc",
        "DB_PASSWORD": "Password_With_Characters!@#",
        "DB_NAME": "postgres"
      }
    }
  }
}
```

---

## Additional DBHub options

| Parameter           | Description                                     |
| ------------------- | ----------------------------------------------- |
| `--readonly`        | Only allows SELECT. Blocks INSERT/UPDATE/DELETE |
| `--max-rows 1000`   | Limits the number of rows returned              |
| `--transport stdio` | Standard communication (required)               |

### Example with read-only mode and row limit:

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": [
        "-y",
        "@bytebase/dbhub",
        "--transport",
        "stdio",
        "--readonly",
        "--max-rows",
        "500",
        "--dsn",
        "postgresql://qa_team.ionevzckjyxtpmyenbxc:Password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
      ]
    }
  }
}
```

---

## Available MCP tools

Once configured, you'll have access to these tools:

| Tool             | Function                                       |
| ---------------- | ---------------------------------------------- |
| `execute_sql`    | Execute SQL queries                            |
| `search_objects` | Explore schemas, tables, columns, indexes      |

### Examples of use in conversation:

- _"Show me all the tables in the database"_
- _"Execute a SELECT of the last 10 registered users"_
- _"Describe the structure of the orders table"_
- _"How many records are there in the products table?"_

---

## Layered protections

| Layer                  | What it protects | How                                           |
| ---------------------- | ---------------- | --------------------------------------------- |
| **Postgres User**      | Schema (DDL)     | `qa_team` cannot CREATE/ALTER/DROP tables     |
| **DBHub `--readonly`** | Data (DML)       | Blocks INSERT/UPDATE/DELETE (optional)        |
| **DBHub `--max-rows`** | Performance      | Avoids queries that return millions of rows   |

---

## Verify that the MCP works

### In Claude Code:

```bash
claude mcp list          # View configured servers
claude mcp get database  # View server details
```

### In Cursor:

Go to **Settings** → **Tools & Integrations** → **MCP** and verify that "database" appears with active status.

---

## References

- [DBHub on npm](https://www.npmjs.com/package/@bytebase/dbhub)
- [DBHub on GitHub](https://github.com/bytebase/dbhub)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
