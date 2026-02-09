# Database Testing with MCPs

This folder contains guides for performing **API** and **Database** testing using MCPs (Model Context Protocol) with AI tools like Claude.

## Who is this for?

QA Engineers and Test Automation Engineers who want to learn to:

- Test REST APIs using OpenAPI specifications
- Execute SQL queries to validate data
- Integrate AI tools into their testing workflow

---

## Documents

| File                                       | Description                                                     |
| ------------------------------------------ | --------------------------------------------------------------- |
| [concepts.md](./concepts.md)               | Theory about API vs Database testing, when to use each          |
| [mcp-dbhub.md](./mcp-dbhub.md)             | Guide to configure DBHub (direct SQL access)                    |
| [mcp-openapi.md](./mcp-openapi.md)         | Guide to configure OpenAPI MCP (REST API access)                |
| [troubleshooting.md](./troubleshooting.md) | Solutions to common problems (Windows, IPv6, permissions, etc.) |

---

## MCPs Used

| MCP                                                                                      | Purpose               | Installation                         |
| ---------------------------------------------------------------------------------------- | --------------------- | ------------------------------------ |
| [@bytebase/dbhub](https://www.npmjs.com/package/@bytebase/dbhub)                         | Execute direct SQL    | `npx -y @bytebase/dbhub`             |
| [@ivotoby/openapi-mcp-server](https://www.npmjs.com/package/@ivotoby/openapi-mcp-server) | Consume APIs via OpenAPI | `npx -y @ivotoby/openapi-mcp-server` |

---

## Recommended Reading Order

1. **Start with the concepts** → [concepts.md](./concepts.md)
2. **Configure database access** → [mcp-dbhub.md](./mcp-dbhub.md)
3. **Configure API access** → [mcp-openapi.md](./mcp-openapi.md)
4. **Consult if you have problems** → [troubleshooting.md](./troubleshooting.md)

---

## Complete Configuration Example

```json
{
  "mcpServers": {
    "api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server"],
      "env": {
        "API_BASE_URL": "https://YOUR_PROJECT.supabase.co/rest/v1",
        "OPENAPI_SPEC_PATH": "https://YOUR_PROJECT.supabase.co/rest/v1/?apikey=YOUR_ANON_KEY",
        "API_HEADERS": "apikey:YOUR_ANON_KEY,Authorization:Bearer YOUR_ANON_KEY"
      }
    },
    "database": {
      "command": "npx",
      "args": ["-y", "@bytebase/dbhub", "--transport", "stdio"],
      "env": {
        "DB_TYPE": "postgres",
        "DB_HOST": "aws-0-us-east-1.pooler.supabase.com",
        "DB_PORT": "6543",
        "DB_USER": "qa_team.YOUR_PROJECT",
        "DB_PASSWORD": "YOUR_PASSWORD",
        "DB_NAME": "postgres"
      }
    }
  }
}
```

---

## Verification

These documents were verified with real configurations on:

- Linux (Ubuntu)
- macOS
- Windows (PowerShell, Git Bash, WSL)

The problems documented in troubleshooting are real errors found during configuration.

---

## See Also

- [API Testing Guide](../api-guide/README.md) - API testing with multiple tools
- [MCP General](../../mcp/README.md) - General MCP concepts
