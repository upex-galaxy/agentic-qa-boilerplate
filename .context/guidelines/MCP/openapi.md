# OpenAPI MCP

> **Type**: API Testing
> **Roles**: TAE, QA
> **Priority**: Critical

---

## When to Use

- Explore API endpoints interactively
- Test API responses and payloads
- Verify API contracts
- Debug API integration issues
- Quick endpoint verification

---

## Usage Examples

### Endpoint Testing

```
"List all users from the API"
"Get the details of product abc123"
"Create a new order with this payload"
"What does the /api/health endpoint return?"
```

### Contract Verification

```
"Does the response match the expected schema?"
"What fields are returned by GET /users?"
"Is the pagination working correctly?"
"What error does the API return for invalid input?"
```

### Debugging

```
"Why is POST /orders returning 400?"
"What headers does the API expect?"
"Is the authentication working correctly?"
```

---

## DO NOT Use For

- ❌ Automated regression tests (use KATA ApiBase)
- ❌ Load/performance testing
- ❌ Tests requiring dynamic authentication
- ❌ Complex multi-step flows (use Playwright)

---

## How It Works

The OpenAPI MCP reads your API specification and generates tools dynamically:

```
OpenAPI Spec → MCP Server → Dynamic Tools
GET /users   →   mcp__api__get_users
POST /orders →   mcp__api__post_orders
```

---

## Generated Tools

| OpenAPI Endpoint    | Generated Tool              |
| ------------------- | --------------------------- |
| `GET /users`        | `mcp__api__get_users`       |
| `POST /users`       | `mcp__api__post_users`      |
| `GET /users/{id}`   | `mcp__api__get_users_by_id` |
| `PATCH /users/{id}` | `mcp__api__patch_users`     |
| `DELETE /users/{id}`| `mcp__api__delete_users`    |

---

## OpenAPI MCP vs KATA ApiBase

| Scenario                    | OpenAPI MCP | KATA ApiBase |
| --------------------------- | ----------- | ------------ |
| Quick endpoint exploration  | ✓           |              |
| Automated test suite        |             | ✓            |
| CI/CD integration           |             | ✓            |
| Manual verification         | ✓           |              |
| Contract testing            | ✓           | ✓            |

**Recommendation**: Use OpenAPI MCP for exploration, KATA ApiBase for automation.

---

## Tips

1. **Start with GET**: Test read operations before write operations
2. **Check Auth**: Verify authentication is configured correctly
3. **Validate Responses**: Compare responses with expected schema
4. **Use Filters**: Most GET endpoints support query parameters

---

## Configuration

See `docs/mcp/openapi-mcp-setup.md` for:
- Environment variable configuration
- Authentication setup (API keys, JWT, etc.)
- Multiple environment configuration
- Troubleshooting

---

## Related Documentation

- `docs/mcp/openapi-mcp-setup.md` - Full setup guide
- `docs/mcp/mcp-testing.md` - Testing workflows with MCPs
- `../TAE/api-testing-patterns.md` - API testing patterns
- `../TAE/openapi-integration.md` - OpenAPI in test automation

---

**Last Updated**: 2026-02
