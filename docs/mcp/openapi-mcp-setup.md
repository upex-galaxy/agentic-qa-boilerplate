# OpenAPI MCP Setup Guide

This guide walks you through connecting Claude Code to your API using the OpenAPI MCP server. This allows AI-assisted API testing by dynamically generating tools from your OpenAPI/Swagger specification.

## Prerequisites

Before starting, ensure you have:

- [ ] Node.js or Bun installed
- [ ] Claude Code installed and configured
- [ ] An OpenAPI/Swagger specification (v2 or v3)
- [ ] API base URL accessible
- [ ] API authentication credentials (if required)

## How It Works

The OpenAPI MCP server reads your API specification and dynamically creates tools for each endpoint:

```
OpenAPI Spec → MCP Server → Dynamic Tools → Claude
     ↓              ↓              ↓
GET /users   →   api_get_users   →   "List all users"
POST /users  →   api_post_users  →   "Create a user"
```

## Quick Start

### 1. Identify Your OpenAPI Specification

Your spec can be:
- A local file: `./openapi.json` or `./swagger.yaml`
- A remote URL: `https://api.example.com/openapi.json`
- A dynamic endpoint: `https://api.example.com/docs/spec`

### 2. Configure MCP in Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.example.com",
        "OPENAPI_SPEC_PATH": "https://api.example.com/openapi.json"
      }
    }
  }
}
```

### 3. Test the Connection

Start Claude Code and ask:

```
What API endpoints are available?
```

You should see Claude use the MCP tools to list available operations.

---

## Configuration Options

### Environment Variables

| Variable          | Required | Description                                      |
| ----------------- | -------- | ------------------------------------------------ |
| `API_BASE_URL`    | Yes      | Base URL for API requests                        |
| `OPENAPI_SPEC_PATH` | Yes    | Path or URL to OpenAPI spec                      |
| `API_HEADERS`     | No       | Custom headers (format: `key:value,key2:value2`) |

### Command Arguments

| Argument    | Default   | Description                           |
| ----------- | --------- | ------------------------------------- |
| `--tools`   | `dynamic` | Tool generation mode                  |
| `--verbose` | `false`   | Enable verbose logging                |

---

## Configuration Examples

### Public API (No Auth)

```json
{
  "mcpServers": {
    "public-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.example.com/v1",
        "OPENAPI_SPEC_PATH": "https://api.example.com/v1/openapi.json"
      }
    }
  }
}
```

### API with API Key

```json
{
  "mcpServers": {
    "api-with-key": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.example.com/v1",
        "OPENAPI_SPEC_PATH": "https://api.example.com/v1/openapi.json",
        "API_HEADERS": "x-api-key:your-api-key-here"
      }
    }
  }
}
```

### API with Bearer Token

```json
{
  "mcpServers": {
    "api-with-bearer": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.example.com/v1",
        "OPENAPI_SPEC_PATH": "https://api.example.com/v1/openapi.json",
        "API_HEADERS": "Authorization:Bearer your-jwt-token"
      }
    }
  }
}
```

### API with Multiple Headers

```json
{
  "mcpServers": {
    "api-multi-headers": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.example.com/v1",
        "OPENAPI_SPEC_PATH": "https://api.example.com/v1/openapi.json",
        "API_HEADERS": "apikey:your-anon-key,Authorization:Bearer your-jwt,Content-Type:application/json"
      }
    }
  }
}
```

### Local OpenAPI File

```json
{
  "mcpServers": {
    "local-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "http://localhost:3000/api",
        "OPENAPI_SPEC_PATH": "/absolute/path/to/openapi.json"
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
        "API_BASE_URL": "https://your-project.supabase.co/rest/v1",
        "OPENAPI_SPEC_PATH": "https://your-project.supabase.co/rest/v1/?apikey=your-anon-key",
        "API_HEADERS": "apikey:your-anon-key"
      }
    }
  }
}
```

---

## Generated Tools

The MCP dynamically creates tools based on your OpenAPI schema:

| OpenAPI Endpoint          | Generated Tool              | Description               |
| ------------------------- | --------------------------- | ------------------------- |
| `GET /users`              | `mcp__api__get_users`       | List all users            |
| `POST /users`             | `mcp__api__post_users`      | Create a new user         |
| `GET /users/{id}`         | `mcp__api__get_users_by_id` | Get user by ID            |
| `PATCH /users/{id}`       | `mcp__api__patch_users`     | Update user               |
| `DELETE /users/{id}`      | `mcp__api__delete_users`    | Delete user               |
| `GET /products`           | `mcp__api__get_products`    | List products             |
| `POST /orders`            | `mcp__api__post_orders`     | Create order              |

---

## Usage Examples

### List Resources

```
User: "Show me all products in the database"

AI uses: mcp__api__get_products
Response: [{ id: 1, name: "Laptop", price: 999 }, ...]
```

### Get Single Resource

```
User: "Get details for user with ID abc123"

AI uses: mcp__api__get_users_by_id with id="abc123"
Response: { id: "abc123", name: "John Doe", email: "john@example.com" }
```

### Create Resource

```
User: "Create a new product called 'Keyboard' priced at $79"

AI uses: mcp__api__post_products with body={ name: "Keyboard", price: 79 }
Response: { id: "xyz789", name: "Keyboard", price: 79, created_at: "..." }
```

### Filter Resources

```
User: "List all orders with status 'pending'"

AI uses: mcp__api__get_orders with query params status=pending
Response: [{ id: 1, status: "pending", ... }, ...]
```

---

## Authentication Considerations

### Static Token (Simple)

Best for:
- API keys that don't expire
- Development/testing environments
- Personal projects

### JWT Tokens (Complex)

**Limitation:** JWT tokens typically expire (1 hour by default). You'll need to:

1. **Manually refresh**: Update the token in `.mcp.json` when it expires
2. **Use a refresh script**: Create a script that gets a fresh token and updates the config
3. **Use long-lived tokens**: If your API supports it (not recommended for production)

For authenticated user testing, consider using:
- **DBHub MCP** with a QA user that bypasses authentication
- **Postman** for manual authenticated requests
- **Playwright MCP** for full E2E flows with login

---

## Troubleshooting

### Error: Cannot fetch OpenAPI spec

```
Error: Failed to fetch OpenAPI specification from URL
```

**Possible causes:**
- Incorrect spec URL
- Spec requires authentication
- Network/firewall blocking the request

**Solution:** Try accessing the spec URL in your browser first to verify it works.

### Error: Invalid OpenAPI specification

```
Error: Invalid OpenAPI specification format
```

**Possible causes:**
- Spec is not valid JSON/YAML
- Spec is OpenAPI v1 (not supported)
- Spec has validation errors

**Solution:** Validate your spec at [editor.swagger.io](https://editor.swagger.io/)

### Error: 401 Unauthorized

```
Error: Request failed with status 401
```

**Possible causes:**
- Missing or invalid API key
- Token expired
- Wrong header format

**Solution:** Verify your `API_HEADERS` configuration matches what the API expects.

### Error: No tools generated

```
No MCP tools available
```

**Possible causes:**
- Empty OpenAPI spec
- Spec has no operations defined
- MCP failed to parse the spec

**Solution:** Check that your spec has actual endpoint definitions with operations.

---

## Best Practices

### 1. Start with Read-Only Operations

Test GET endpoints first before trying POST/PUT/DELETE:

```
"List all users" ✓ (safe)
"Delete user X" ✗ (verify first!)
```

### 2. Verify Before Modifying

Ask Claude to show what it will do before executing:

```
User: "Delete order abc123"

AI (correct approach):
"First let me verify this order exists:
GET /orders/abc123 → { id: 'abc123', status: 'pending', total: 99.99 }

This order is pending with a total of $99.99.
Do you want me to proceed with deletion?"
```

### 3. Use Meaningful Names

Name your MCP server descriptively:

```json
// Good
"my-api-dev": { ... }
"my-api-staging": { ... }

// Less clear
"api": { ... }
"mcp1": { ... }
```

### 4. Separate Environments

Configure different MCP servers for different environments:

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
        "API_BASE_URL": "https://staging.example.com/api",
        ...
      }
    }
  }
}
```

---

## Integration with KATA Framework

For automated API tests, use the KATA framework's `ApiBase` instead of the MCP:

| Use Case                    | Tool                  |
| --------------------------- | --------------------- |
| Exploratory testing         | OpenAPI MCP           |
| Manual verification         | OpenAPI MCP           |
| Automated test suite        | KATA ApiBase          |
| CI/CD integration           | KATA ApiBase          |

See `../guidelines/TAE/api-testing-patterns.md` for KATA API testing patterns.

---

## Quick Reference

### MCP Configuration Template

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "<base-url>",
        "OPENAPI_SPEC_PATH": "<spec-path-or-url>",
        "API_HEADERS": "<header1>:<value1>,<header2>:<value2>"
      }
    }
  }
}
```

### Common Header Formats

| Auth Type    | Header Format                              |
| ------------ | ------------------------------------------ |
| API Key      | `x-api-key:your-key`                       |
| Bearer Token | `Authorization:Bearer your-token`          |
| Basic Auth   | `Authorization:Basic base64-credentials`   |
| Custom       | `X-Custom-Header:value`                    |

---

*Last updated: February 2026*
