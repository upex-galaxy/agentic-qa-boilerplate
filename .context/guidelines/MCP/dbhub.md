# DBHub MCP

> **Type**: Database Access
> **Roles**: TAE, QA
> **Priority**: Critical

---

## When to Use

- Validate test data in the database
- Create test data setup
- Verify database state after API/UI operations
- Explore database schema and relationships
- Debug data-related issues

---

## Usage Examples

### Data Validation

```
"Verify that user abc123 exists in the database"
"Check if the order was saved with correct status"
"How many records are in the products table?"
"Show me all orders from the last 24 hours"
```

### Test Data Setup

```
"Create a test user with email test@example.com"
"Insert a product with price $99.99"
"Set up an order with 3 items for testing"
"Clean up all test data created today"
```

### Schema Exploration

```
"What tables exist in the database?"
"Show me the columns in the users table"
"What foreign keys reference the orders table?"
"List all indexes on the products table"
```

---

## DO NOT Use For

- ❌ Production database modifications
- ❌ Bulk data operations without verification
- ❌ Schema migrations (use proper migration tools)
- ❌ Sensitive data extraction

---

## Available MCP Tools

| Tool             | Description                                      |
| ---------------- | ------------------------------------------------ |
| `execute_sql`    | Execute SQL queries (SELECT, INSERT, UPDATE, DELETE) |
| `search_objects` | Explore schemas, tables, columns, indexes        |

---

## Common Queries for Testing

```sql
-- Verify record exists
SELECT * FROM users WHERE email = 'test@example.com';

-- Count records
SELECT COUNT(*) FROM orders WHERE status = 'pending';

-- Check referential integrity
SELECT o.id, o.user_id
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE u.id IS NULL;

-- Verify business rules
SELECT * FROM orders WHERE total < 0;
```

---

## Integration with Test Workflow

1. **Before Test**: Use DBHub to verify preconditions
2. **After API Call**: Use DBHub to verify data was saved
3. **After E2E Test**: Use DBHub to verify side effects
4. **Cleanup**: Use DBHub to remove test data

---

## Tips

1. **Always Verify First**: Before DELETE/UPDATE, run a SELECT to confirm target
2. **Use Transactions**: For multiple changes, wrap in BEGIN/COMMIT
3. **Minimal Permissions**: Use read-only access when possible
4. **Test Isolation**: Use unique identifiers for test data

---

## Configuration

See `docs/setup/mcp-dbhub.md` for:
- TOML configuration for different databases
- DSN connection strings
- Creating database users
- Troubleshooting connection issues

---

## Related Documentation

- `docs/setup/mcp-dbhub.md` - Full setup guide
- `../TAE/test-data-management.md` - Test data strategies

---

**Last Updated**: 2026-02-12
