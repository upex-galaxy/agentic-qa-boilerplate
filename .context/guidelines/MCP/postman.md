# Postman MCP

> **Type**: API Testing
> **Roles**: TAE, QA
> **Priority**: High

---

## When to Use

- Test API endpoints manually
- Verify API responses
- Create request collections
- Validate API contracts
- Debug API issues

---

## Usage Examples

### API Testing

```
"Test the POST /api/users endpoint"
"What does GET /api/products/123 respond?"
"Verify that the endpoint returns 401 without auth"
"Send a request with this payload and show the response"
```

### Collection Management

```
"Create a Postman collection for the auth API"
"Generate tests to validate the response schema"
"Run the integration tests collection"
"Export the collection for CI/CD"
```

### Debugging

```
"What headers does the endpoint return?"
"Does the endpoint accept this payload?"
"Compare the response with the expected schema"
```

---

## DO NOT Use For

- ❌ E2E UI testing (use Playwright)
- ❌ Load/performance testing (use k6 or Artillery)
- ❌ Tests that require browser context

---

## Postman vs KATA ApiBase

| Postman                    | KATA ApiBase                |
| -------------------------- | --------------------------- |
| Manual/exploratory testing | Automated tests             |
| Quick endpoint checks      | CI/CD integrated tests      |
| Collection sharing         | Code-based test definitions |
| Visual interface           | TypeScript + assertions     |

**Recommendation**: Use Postman for exploration, KATA ApiBase for automation.

---

## Tips

1. **Environments**: Use environment variables for URLs and auth tokens
2. **Automatic Tests**: Add assertions to each request
3. **Organized Collections**: Group by feature/domain
4. **Pre-request Scripts**: Set up authentication dynamically

---

## KATA Integration

For automated API tests in KATA:

```typescript
// tests/components/api/UsersApi.ts
import { ApiBase } from './ApiBase';

export class UsersApi extends ApiBase {
  async getUser(id: string) {
    return this.get(`/users/${id}`);
  }

  async createUser(data: CreateUserDto) {
    return this.post('/users', data);
  }
}
```

See:
- `../TAE/api-testing-patterns.md` - API testing patterns
- `../TAE/kata-architecture.md` - KATA architecture

---

## Related Documentation

- `../TAE/api-testing-patterns.md` - API testing patterns
- `../TAE/openapi-integration.md` - OpenAPI integration
- `./openapi.md` - OpenAPI MCP guide

---

**Last Updated**: 2026-02
