# OpenAPI MCP Configuration for API Testing

## What is @ivotoby/openapi-mcp-server?

This MCP converts any OpenAPI/Swagger specification into MCP tools. It reads an API schema and converts each endpoint into a tool that Claude can use directly.

---

## Prerequisites

- **Node.js 18+** installed
- Access to an API with OpenAPI specification (in this case, Supabase)
- API Key for authentication

---

## How it works with Supabase

Supabase uses **PostgREST**, which automatically exposes a **Swagger 2.0** schema of your database.

### Supabase OpenAPI schema URL

```
https://<PROJECT_REF>.supabase.co/rest/v1/?apikey=<ANON_KEY>
```

**Example:**

```
https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1...
```

### Verify that the schema exists

Execute this in your terminal:

```bash
curl "https://<PROJECT_REF>.supabase.co/rest/v1/?apikey=<YOUR_ANON_KEY>"
```

You should see a JSON with Swagger 2.0 format listing all your tables.

---

## Get Supabase credentials

1. Go to your project in **Supabase Dashboard**
2. Go to **Project Settings** → **API**
3. Copy:
   - **Project URL:** `https://<project-ref>.supabase.co`
   - **anon public key:** The public API key

---

## MCP Configuration

### Claude Code (CLI)

```bash
claude mcp add-json "supabase-api" '{
  "command": "npx",
  "args": ["-y", "@ivotoby/openapi-mcp-server"],
  "env": {
    "API_BASE_URL": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1",
    "OPENAPI_SPEC_PATH": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1/?apikey=YOUR_ANON_KEY",
    "API_HEADERS": "apikey:YOUR_ANON_KEY,Authorization:Bearer YOUR_ANON_KEY"
  }
}'
```

### Claude Desktop / Cursor / VS Code

```json
{
  "mcpServers": {
    "supabase-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server"],
      "env": {
        "API_BASE_URL": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1",
        "OPENAPI_SPEC_PATH": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1/?apikey=YOUR_ANON_KEY",
        "API_HEADERS": "apikey:YOUR_ANON_KEY,Authorization:Bearer YOUR_ANON_KEY"
      }
    }
  }
}
```

---

## Explained environment variables

| Variable            | Description                                  | Example                                       |
| ------------------- | -------------------------------------------- | --------------------------------------------- |
| `API_BASE_URL`      | Base URL for requests                        | `https://xxx.supabase.co/rest/v1`             |
| `OPENAPI_SPEC_PATH` | OpenAPI schema URL (with apikey)             | `https://xxx.supabase.co/rest/v1/?apikey=...` |
| `API_HEADERS`       | Headers for authentication (comma-separated) | `apikey:xxx,Authorization:Bearer xxx`         |

---

## Advanced options

The MCP supports command-line arguments for additional configuration:

### Tool modes

| Mode               | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `--tools all`      | Load all endpoints as tools (default)                |
| `--tools dynamic`  | Expose meta-tools to discover endpoints              |
| `--tools explicit` | Only load specific tools                             |

### Operation filtering

| Argument           | Description                  |
| ------------------ | ---------------------------- |
| `--operation get`  | Only GET operations (read)   |
| `--operation post` | Only POST operations         |
| `--tag <tag>`      | Filter by OpenAPI tag        |

### Example: Read-only

```json
{
  "mcpServers": {
    "supabase-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--operation", "get"],
      "env": {
        "API_BASE_URL": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1",
        "OPENAPI_SPEC_PATH": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1/?apikey=YOUR_ANON_KEY",
        "API_HEADERS": "apikey:YOUR_ANON_KEY,Authorization:Bearer YOUR_ANON_KEY"
      }
    }
  }
}
```

### Example: Dynamic mode (recommended for exploration)

```json
{
  "mcpServers": {
    "supabase-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1",
        "OPENAPI_SPEC_PATH": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1/?apikey=YOUR_ANON_KEY",
        "API_HEADERS": "apikey:YOUR_ANON_KEY,Authorization:Bearer YOUR_ANON_KEY"
      }
    }
  }
}
```

With `--tools dynamic`, the MCP exposes 3 meta-tools:

- `list-api-endpoints`: View all available endpoints
- `get-api-endpoint-schema`: View the schema of a specific endpoint
- `invoke-api-endpoint`: Execute any endpoint

This avoids saturating the context with dozens of tools.

---

## Generated tools

Depending on the mode, you'll have access to tools that represent each endpoint of your API.

### Example: If you have a `users` table

The MCP will generate tools like:

- `GET /users` → List users
- `POST /users` → Create user
- `PATCH /users` → Update user
- `DELETE /users` → Delete user

### Examples of use in conversation:

- _"List all products from the products table"_
- _"Create a new user with email test@example.com"_
- _"Get the user with id 123"_
- _"What endpoints are available in the API?"_

---

## Comparison: DBHub vs OpenAPI MCP

| Aspect                 | DBHub (SQL)          | OpenAPI MCP (API)          |
| ---------------------- | -------------------- | -------------------------- |
| **What it does**       | Executes direct SQL  | Calls REST endpoints       |
| **Access**             | DB connection string | API Key + URL              |
| **Operations**         | SQL queries          | GET, POST, PATCH, DELETE   |
| **Complex JOINs**      | ✅ Yes               | ❌ Limited to foreign keys |
| **Goes through RLS**   | ❌ No                | ✅ Yes                     |
| **API validations**    | ❌ No                | ✅ Yes                     |

**Recommendation:** Use both together for complete testing.

---

## Complete configuration: API + SQL

```json
{
  "mcpServers": {
    "supabase-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server"],
      "env": {
        "API_BASE_URL": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1",
        "OPENAPI_SPEC_PATH": "https://ionevzckjyxtpmyenbxc.supabase.co/rest/v1/?apikey=YOUR_ANON_KEY",
        "API_HEADERS": "apikey:YOUR_ANON_KEY,Authorization:Bearer YOUR_ANON_KEY"
      }
    },
    "supabase-db": {
      "command": "npx",
      "args": ["-y", "@bytebase/dbhub", "--transport", "stdio"],
      "env": {
        "DB_TYPE": "postgres",
        "DB_HOST": "aws-0-us-east-1.pooler.supabase.com",
        "DB_PORT": "6543",
        "DB_USER": "qa_team.ionevzckjyxtpmyenbxc",
        "DB_PASSWORD": "YOUR_PASSWORD",
        "DB_NAME": "postgres"
      }
    }
  }
}
```

With this you have:

- **`supabase-api`**: For REST API testing (goes through RLS and validations)
- **`supabase-db`**: For database testing with SQL (direct access)

---

## Related Workflows

This document covers **Workflow C: MCP for testing with AI**. The OpenAPI spec can come from different sources:

| Spec Source            | When to use it                       | Document                                                                        |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| **Supabase auto-spec** | Supabase projects (this doc)         | This document                                                                   |
| **sync-openapi.ts**    | External backend has the spec        | [sync-openapi-guide.md](../../workflows/sync-openapi-guide.md)                  |
| **Zod-to-OpenAPI**     | You define schemas with Zod          | [openapi-zod-contract-testing.md](../api-guide/openapi-zod-contract-testing.md) |

---

## References

- [@ivotoby/openapi-mcp-server on npm](https://www.npmjs.com/package/@ivotoby/openapi-mcp-server)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
- [Supabase API Documentation](https://supabase.com/docs/guides/api)
- [PostgREST Documentation](https://postgrest.org/en/stable/)
