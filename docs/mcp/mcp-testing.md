# AI-Assisted Testing with MCP

This guide explains how to use configured MCP servers to perform AI-assisted testing across different layers of your application.

---

## Available MCPs for Testing

| MCP          | Purpose                       | Best For                          |
| ------------ | ----------------------------- | --------------------------------- |
| `openapi`    | REST API via OpenAPI spec     | API exploration, endpoint testing |
| `dbhub`      | Direct SQL queries            | Data validation, test setup       |
| `playwright` | Browser automation            | E2E testing, UI exploration       |
| `postman`    | API collection testing        | Request collections, environments |

---

## MCP: OpenAPI (API Testing)

### Configuration

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "https://api.example.com/v1",
        "OPENAPI_SPEC_PATH": "https://api.example.com/v1/openapi.json",
        "API_HEADERS": "x-api-key:your-api-key"
      }
    }
  }
}
```

### Generated Tools

Tools are dynamically created from your OpenAPI spec:

| Tool                     | Description            |
| ------------------------ | ---------------------- |
| `mcp__api__get_users`    | GET /users             |
| `mcp__api__post_users`   | POST /users            |
| `mcp__api__get_products` | GET /products          |
| `mcp__api__post_orders`  | POST /orders           |
| ...                      | (one per endpoint)     |

### Use Cases

```
# Ask the AI:

"List all products in the electronics category"
→ AI uses mcp__api__get_products with category filter

"Show me the details for order abc123"
→ AI uses mcp__api__get_orders with id parameter

"Create a new user with email test@example.com"
→ AI uses mcp__api__post_users with body payload
```

### Limitations

- Only works with authentication configured in `API_HEADERS`
- Cannot simulate different user contexts without token refresh
- JWT tokens may expire during long sessions

**See:** [openapi-mcp-setup.md](./openapi-mcp-setup.md) for detailed configuration.

---

## MCP: DBHub (Database Testing)

### Configuration

```json
{
  "mcpServers": {
    "my-database": {
      "command": "bunx",
      "args": [
        "-y",
        "@bytebase/dbhub@latest",
        "--config",
        "/path/to/dbhub.toml"
      ]
    }
  }
}
```

### Available Tools

| Tool             | Description                         |
| ---------------- | ----------------------------------- |
| `execute_sql`    | Execute SELECT/INSERT/UPDATE/DELETE |
| `search_objects` | Explore schemas, tables, columns    |

### Use Cases

```
# Ask the AI:

"Show me all orders in the system"
→ SELECT * FROM orders ORDER BY created_at DESC LIMIT 20

"How many users are there by role?"
→ SELECT role, COUNT(*) FROM users GROUP BY role

"Verify that order abc123 has status 'paid'"
→ SELECT id, status FROM orders WHERE id = 'abc123'

"Insert a test user for automation"
→ INSERT INTO users (email, name, role) VALUES (...)
```

### Data Validation Examples

```sql
-- Verify referential integrity
SELECT o.id, o.user_id, u.name
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE u.id IS NULL;  -- Orders with invalid user_id

-- Verify business constraints
SELECT * FROM reviews
WHERE rating < 1 OR rating > 5;  -- Ratings out of range

-- Verify valid states
SELECT id, status FROM orders
WHERE status NOT IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled');
```

**See:** [dbhub-mcp-setup.md](./dbhub-mcp-setup.md) for detailed configuration.

---

## MCP: Playwright (E2E Testing)

### Configuration

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-playwright"]
    }
  }
}
```

### Available Tools

| Tool                      | Description              |
| ------------------------- | ------------------------ |
| `browser_navigate`        | Navigate to URL          |
| `browser_click`           | Click element            |
| `browser_type`            | Type into input          |
| `browser_snapshot`        | Get accessibility tree   |
| `browser_take_screenshot` | Capture screenshot       |
| `browser_evaluate`        | Execute JavaScript       |
| `browser_wait_for`        | Wait for element/text    |

### Use Cases

```
# Ask the AI:

"Navigate to the login page and fill in the credentials"
→ AI navigates, finds inputs, types values

"Take a screenshot of the dashboard"
→ AI navigates and captures screenshot

"Click the 'Add to Cart' button and verify the cart count"
→ AI clicks element, waits, verifies text

"Find all elements with data-testid on this page"
→ AI takes snapshot and lists testable elements
```

### Connect to Existing Browser (CDP)

For debugging with an existing session:

```bash
# Launch Chrome with remote debugging
google-chrome --remote-debugging-port=9222

# Get WebSocket URL
curl http://localhost:9222/json/version
```

Configure MCP:

```json
{
  "playwright": {
    "command": "npx",
    "args": [
      "@anthropic/mcp-playwright",
      "--cdp-url",
      "ws://localhost:9222/devtools/browser/..."
    ]
  }
}
```

**See:** [.context/guidelines/MCP/playwright.md](../../.context/guidelines/MCP/playwright.md) for more details.

---

## MCP: Postman (Collection Testing)

### Use Cases

```
# Ask the AI:

"Test the POST /api/users endpoint"
→ AI sends request and shows response

"What does GET /api/products/123 respond?"
→ AI fetches and displays response

"Verify that the endpoint returns 401 without auth"
→ AI sends unauthenticated request
```

### When to Use

| Scenario                       | Use Postman MCP |
| ------------------------------ | --------------- |
| Quick endpoint verification    | ✓               |
| Testing with custom headers    | ✓               |
| Debugging API responses        | ✓               |
| Automated regression tests     | Use KATA ApiBase instead |

**See:** [.context/guidelines/MCP/postman.md](../../.context/guidelines/MCP/postman.md) for more details.

---

## Testing Flows with AI

### Flow 1: Verify Test Data Exists

```
User: "Verify that test users exist in the database"

AI will execute (using DBHub):
SELECT id, email, name, role
FROM users
WHERE email LIKE '%test%'
ORDER BY created_at;

Result: Table showing test user accounts
```

### Flow 2: Create Test Scenario

```
User: "Create a complete test scenario with a user, product, and order"

AI will execute sequentially:
1. INSERT INTO users (...) → Creates test user
2. INSERT INTO products (...) → Creates test product
3. INSERT INTO orders (...) → Creates order
4. SELECT * FROM orders WHERE ... → Verifies creation
```

### Flow 3: E2E Verification

```
User: "Log in as the test user and verify the dashboard loads"

AI will execute (using Playwright):
1. Navigate to /login
2. Fill email and password
3. Click submit
4. Wait for /dashboard
5. Take screenshot
6. Report success/failure
```

### Flow 4: API + Database Validation

```
User: "Create an order via API and verify it's in the database"

AI will execute:
1. POST /orders via OpenAPI MCP → Get order ID
2. SELECT * FROM orders WHERE id = ... via DBHub → Verify data
3. Compare API response with database record
```

### Flow 5: Investigate Bugs

```
User: "User X reports they cannot see their orders. Investigate."

AI will execute:
1. SELECT * FROM users WHERE id = 'X' → Verify user exists
2. SELECT * FROM orders WHERE user_id = 'X' → Check their orders
3. Compare with API response → Identify discrepancy
4. Suggest root cause and solution
```

---

## Choosing the Right MCP

| Task                              | Recommended MCP     |
| --------------------------------- | ------------------- |
| Quick API endpoint test           | OpenAPI             |
| Complex query validation          | DBHub               |
| Full user flow testing            | Playwright          |
| API collection testing            | Postman             |
| Test data setup                   | DBHub               |
| Screenshot capture                | Playwright          |
| Schema/contract validation        | OpenAPI             |
| Performance investigation         | DBHub + Playwright  |

---

## Best Practices

### 1. Always Verify Before Modifying

```
User: "Delete order abc123"

AI (correct):
"First let me verify which order it is:
SELECT * FROM orders WHERE id = 'abc123'

This order is from User X, status 'delivered', total $99.99.
Do you confirm you want to delete it?"
```

### 2. Use Transactions for Multiple Operations

```sql
BEGIN;
  INSERT INTO orders (...) VALUES (...);
  INSERT INTO order_items (...) VALUES (...);
  -- Verify everything is OK
  SELECT * FROM orders WHERE ...;
COMMIT;
-- Or ROLLBACK if something went wrong
```

### 3. Document Changes

```
User: "Update status of order X to 'delivered'"

AI:
"Executing update...

Before: { id: 'X', status: 'shipped', ... }
After: { id: 'X', status: 'delivered', ... }

Change recorded. If you need to revert, execute:
UPDATE orders SET status = 'shipped' WHERE id = 'X'"
```

### 4. Combine MCPs for Complete Verification

```
1. Create data via API (OpenAPI MCP)
2. Verify in database (DBHub MCP)
3. Verify in UI (Playwright MCP)
4. Clean up via database (DBHub MCP)
```

---

## Recommended Testing Workflow

1. **Prepare data** (DBHub):
   - Create test users if they don't exist
   - Set up required reference data

2. **Execute tests** (OpenAPI / Playwright):
   - API tests for backend logic
   - E2E tests for user flows

3. **Verify results** (DBHub):
   - Confirm data was saved correctly
   - Verify side effects (triggers, etc.)

4. **Clean up** (DBHub):
   - Delete test data
   - Restore initial state if necessary

---

## Related Documentation

- [dbhub-mcp-setup.md](./dbhub-mcp-setup.md) - Database MCP configuration
- [openapi-mcp-setup.md](./openapi-mcp-setup.md) - API MCP configuration
- [.context/guidelines/MCP/](../../.context/guidelines/MCP/) - MCP usage guidelines

---

*Last updated: February 2026*
