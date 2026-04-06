# Exploratory Database Testing Session

> AI-guided exploratory testing at the database layer using DBHub MCP for data integrity verification.

---

## Purpose

Execute exploratory testing directly on the database to verify data integrity, validate constraints and triggers, confirm business rules at the data level, and discover issues that API/UI testing might miss.

> **TCs as Guides**: If Test Cases exist from Stage 1 planning, use them as a guide but explore freely. Update TC statuses (PASSED/FAILED) as you validate. Discovering new scenarios beyond the TCs is expected and encouraged.

**This prompt is executed:**

- AFTER API testing (to verify data was stored correctly)
- AFTER UI testing (to verify complete data flow)
- OR independently for data-focused features (reports, migrations, bulk operations)

**When to use Database Exploratory Testing:**

- Verifying data created/modified by API or UI operations
- Testing database constraints (FK, UNIQUE, CHECK)
- Validating triggers and computed columns
- Testing RLS policies at SQL level
- Verifying data migrations
- Testing batch/bulk operations
- Validating complex queries and aggregations

---

## Prerequisites

**MCPs Required:**

| MCP                | Purpose                         | Required |
| ------------------ | ------------------------------- | -------- |
| `dbhub` (sql)      | Execute SQL queries directly    | Yes      |
| `openapi` (api)    | Execute API calls for setup     | Optional |
| `postman`          | Execute authenticated API flows | Optional |
| `mcp__atlassian__` | Bug creation                    | Optional |

**Database Access:**

- Connection to staging/test database
- User with appropriate permissions (`qa_team` role recommended)
- Understanding of the database schema

---

## Input Required

### Option 1: Post-API/UI Verification

After completing API or UI testing:

```
Provide:
- Actions performed via API/UI (what was created/modified)
- Expected data state
- Tables/entities involved
```

### Option 2: Shift-Left Test Cases

If test cases specify data validations:

```
Provide:
- Path to acceptance-test-plan.md file
- Data validation requirements from test cases
```

### Option 3: Data-Focused Feature

For features that are primarily about data:

```
Provide:
- User Story ID with data requirements
- Expected data transformations
- Business rules to validate
```

---

## Workflow

### Phase 1: Context Gathering

**Actions:**

1. **Understand the data model:**
   - Which tables are involved?
   - What are the relationships (FKs)?
   - What constraints exist?
   - Are there triggers or computed columns?

2. **Identify verification points:**
   - What data should exist after the operation?
   - What data should NOT exist?
   - What values should be calculated/derived?

3. **Plan exploration queries:**
   - SELECT queries to verify state
   - Aggregation queries for consistency checks
   - JOIN queries for relationship validation

**Output to user:**

```markdown
## Database Exploration Plan

**Feature:** [Feature name]
**Scope:** [US/Epic being tested]
**Database:** [Database name/environment]

### Tables Involved:

| Table       | Role in Feature   | Key Columns                |
| ----------- | ----------------- | -------------------------- |
| orders      | Main entity       | id, user_id, total, status |
| order_items | Order details     | order_id, product_id, qty  |
| products    | Referenced entity | id, name, price, stock     |
| users       | Owner of orders   | id, email, role            |

### Verification Points:

1. [Data created correctly]
2. [Relationships intact]
3. [Triggers executed]
4. [Constraints enforced]

Shall I proceed with the database exploration?
```

---

### Phase 2: Schema Exploration

**Using `dbhub` MCP:**

```sql
-- List all tables in public schema
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';

-- Describe a specific table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'orders';

-- View constraints on a table
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'orders';

-- View foreign keys
SELECT
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'orders';
```

**Document schema understanding:**

```markdown
### Schema Analysis: orders

**Columns:**
| Column | Type | Nullable | Default |
| --------- | --------- | -------- | ---------- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| total | numeric | NO | 0 |
| status | text | NO | 'pending' |
| created_at| timestamp | NO | now() |

**Constraints:**

- PK: orders_pkey (id)
- FK: orders_user_id_fkey → users(id)
- CHECK: orders_status_check (status IN ('pending','paid','shipped','delivered','cancelled'))

**Triggers:**

- calculate_order_total: Updates total from order_items
```

---

### Phase 3: Data State Verification

**After API/UI operations, verify the data:**

#### 3.1 Existence Verification

```markdown
### Verification: Order was created

**Context:** User created an order via API/UI

**Query:**

SELECT id, user_id, status, total, created_at
FROM orders
WHERE id = 'order-uuid-here';

**Expected:**

- Row exists
- status = 'pending'
- user_id matches authenticated user
- created_at is recent

**Actual:** [Document result]
**Status:** [VERIFIED / NOT FOUND / INCORRECT]
```

#### 3.2 Relationship Verification

```markdown
### Verification: Order items linked correctly

**Query:**

SELECT
    oi.id,
    oi.order_id,
    oi.product_id,
    oi.quantity,
    oi.unit_price,
    p.name as product_name
FROM order_items oi
JOIN products p ON oi.product_id = p.id
WHERE oi.order_id = 'order-uuid-here';

**Expected:**

- 2 order items
- Each linked to valid product
- Quantities match what was ordered

**Actual:** [Document result]
**Status:** [VERIFIED / DISCREPANCY]
```

#### 3.3 Trigger Verification

```markdown
### Verification: Order total calculated by trigger

**Query:**

-- Check if total matches sum of items
SELECT
    o.id,
    o.total as stored_total,
    SUM(oi.quantity * oi.unit_price) as calculated_total
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
WHERE o.id = 'order-uuid-here'
GROUP BY o.id, o.total;

**Expected:** stored_total = calculated_total
**Actual:** [Document result]
**Status:** [TRIGGER WORKING / TRIGGER FAILED]
```

---

### Phase 4: Constraint Testing

**Test that database constraints are enforced:**

#### 4.1 Foreign Key Constraints

```markdown
### Constraint Test: FK prevents orphan records

**Test:** Try to insert order_item with invalid product_id

-- This should FAIL
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES ('valid-order-id', 'non-existent-product-id', 1, 10.00);

**Expected:** Error - foreign key violation
**Actual:** [Document result]
**Status:** [CONSTRAINT ENFORCED / VULNERABLE]
```

#### 4.2 CHECK Constraints

```markdown
### Constraint Test: Status must be valid

**Test:** Try to set invalid status

-- This should FAIL
UPDATE orders SET status = 'invalid_status' WHERE id = 'order-id';

**Expected:** Error - check constraint violation
**Actual:** [Document result]
**Status:** [CONSTRAINT ENFORCED / VULNERABLE]
```

#### 4.3 UNIQUE Constraints

```markdown
### Constraint Test: Unique email

**Test:** Try to insert duplicate email

-- This should FAIL if email is unique
INSERT INTO users (email, name) VALUES ('existing@email.com', 'Duplicate');

**Expected:** Error - unique violation
**Actual:** [Document result]
**Status:** [CONSTRAINT ENFORCED / VULNERABLE]
```

#### 4.4 NOT NULL Constraints

```markdown
### Constraint Test: Required fields

**Test:** Try to insert with NULL required field

-- This should FAIL
INSERT INTO orders (user_id, total) VALUES (NULL, 100);

**Expected:** Error - not null violation
**Actual:** [Document result]
**Status:** [CONSTRAINT ENFORCED / VULNERABLE]
```

---

### Phase 5: Data Integrity Checks

**Queries to find data problems:**

#### 5.1 Orphan Records

```sql
-- Find orders without users (should be 0)
SELECT o.*
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE u.id IS NULL;

-- Find order_items without orders
SELECT oi.*
FROM order_items oi
LEFT JOIN orders o ON oi.order_id = o.id
WHERE o.id IS NULL;
```

#### 5.2 Calculation Mismatches

```sql
-- Find orders where total doesn't match items
SELECT
    o.id,
    o.total as stored_total,
    COALESCE(SUM(oi.quantity * oi.unit_price), 0) as calculated_total
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, o.total
HAVING o.total != COALESCE(SUM(oi.quantity * oi.unit_price), 0);
```

#### 5.3 Invalid States

```sql
-- Find delivered orders without payment
SELECT * FROM orders
WHERE status = 'delivered'
AND payment_status != 'completed';

-- Find negative quantities
SELECT * FROM order_items WHERE quantity <= 0;

-- Find products with negative stock
SELECT * FROM products WHERE stock < 0;
```

**Document findings:**

```markdown
### Data Integrity Check Results

| Check                | Expected | Found | Status |
| -------------------- | -------- | ----- | ------ |
| Orphan orders        | 0        | 0     | PASSED |
| Orphan order_items   | 0        | 0     | PASSED |
| Total mismatches     | 0        | 2     | FAILED |
| Invalid order states | 0        | 0     | PASSED |
| Negative quantities  | 0        | 0     | PASSED |

**Issues Found:** 2 orders have incorrect totals (IDs: xxx, yyy)
```

---

### Phase 6: RLS Policy Testing at SQL Level

**Test Row Level Security policies directly:**

```markdown
### RLS Test: Policy enforcement at SQL level

**Setup:**
Using connection with role that simulates authenticated user.

**Test 1: Can query own data**

-- Set session to simulate user
SET LOCAL request.jwt.claim.sub = 'user-a-uuid';
SELECT * FROM orders; -- Should only see User A's orders

Result: [Document]

**Test 2: Cannot see other user's data**

SET LOCAL request.jwt.claim.sub = 'user-a-uuid';
SELECT * FROM orders WHERE user_id = 'user-b-uuid';
-- Should return empty (RLS filters)

Result: [Document]

**Note:** Direct SQL with qa_team role bypasses RLS.
For true RLS testing, use API layer or set session variables.
```

---

### Phase 7: Cleanup Verification

**After test data is cleaned up:**

```markdown
### Cleanup Verification

**Deleted via API/UI:** Order abc123

**Verify cascade deletes:**

-- Order should not exist
SELECT * FROM orders WHERE id = 'abc123';

-- Order items should be gone too
SELECT * FROM order_items WHERE order_id = 'abc123';

**Results:**

- Order deleted: [YES/NO]
- Order items cascaded: [YES/NO]

**Cleanup Status:** [COMPLETE / INCOMPLETE]
```

---

### Phase 8: Session Summary

**Generate comprehensive database testing notes:**

```markdown
# Database Exploratory Testing Session Notes

**Date:** [Date]
**Feature:** [Feature/US being tested]
**Database:** [Environment/Connection]
**Duration:** [Time spent]

---

## Executive Summary

- **Overall Status:** [PASSED / ISSUES FOUND / BLOCKED]
- **Tables Tested:** [List]
- **Constraints Verified:** [X of Y]
- **Triggers Verified:** [X of Y]
- **Data Integrity Issues:** [Number]

---

## Schema Verification

| Table        | Constraints OK | Triggers OK | Notes           |
| ------------ | -------------- | ----------- | --------------- |
| orders       | YES            | YES         | -               |
| order_items  | YES            | YES         | -               |
| products     | YES            | N/A         | -               |

---

## Data State Verification

### After: [Operation tested]

| Verification Point        | Expected | Actual | Status  |
| ------------------------- | -------- | ------ | ------- |
| Order created             | 1 row    | 1 row  | PASSED  |
| Order items created       | 2 rows   | 2 rows | PASSED  |
| Total calculated          | $150.00  | $150.00| PASSED  |
| Stock decremented         | -2       | -2     | PASSED  |

---

## Constraint Testing

| Constraint Type | Tested | Working | Notes              |
| --------------- | ------ | ------- | ------------------ |
| Foreign Keys    | 3      | 3       | All enforced       |
| CHECK           | 2      | 2       | Status validation  |
| UNIQUE          | 1      | 1       | Email uniqueness   |
| NOT NULL        | 5      | 5       | Required fields    |

---

## Data Integrity Checks

| Check                    | Issues Found | Severity |
| ------------------------ | ------------ | -------- |
| Orphan records           | 0            | -        |
| Calculation mismatches   | 2            | Medium   |
| Invalid states           | 0            | -        |

---

## Issues Found

### Issue 1: [Title]

- **Severity:** [Critical/High/Medium/Low]
- **Table(s):** [Affected tables]
- **Query to reproduce:**

[Query that shows the issue]

- **Expected:** [What should be]
- **Actual:** [What is]
- **Impact:** [Business impact]

---

## Observations & Recommendations

### Positive Findings:

- [What worked well]

### Areas of Concern:

- [Potential data issues to monitor]

### Recommendations:

- [Missing constraints to add]
- [Triggers to review]
- [Indexes to add for performance]

---

## Next Steps

- [ ] Report data integrity issues
- [ ] Coordinate with dev on constraint fixes
- [ ] Document for Test Documentation phase
- [ ] Proceed to UI testing (if applicable)
```

---

## Decision Point

After database exploration, decide:

| Result                  | Action                                       |
| ----------------------- | -------------------------------------------- |
| **DATA VERIFIED**       | Proceed to next testing layer or document    |
| **INTEGRITY ISSUES**    | Report as bug, investigate root cause        |
| **CONSTRAINT MISSING**  | Report as improvement, medium priority       |
| **TRIGGER FAILING**     | Report as bug, may affect all data           |

---

## MCP Tools Reference

### dbhub MCP

| Tool                  | Use Case                          |
| --------------------- | --------------------------------- |
| `mcp__dbhub__query`   | Execute SELECT queries            |
| `mcp__dbhub__execute` | Execute INSERT/UPDATE/DELETE      |
| `mcp__dbhub__describe`| Explore schema, tables, columns   |

### Common Query Patterns

```sql
-- Count records
SELECT COUNT(*) FROM table_name WHERE condition;

-- Check existence
SELECT EXISTS(SELECT 1 FROM table_name WHERE id = 'xxx');

-- Aggregate verification
SELECT SUM(column), AVG(column), MIN(column), MAX(column) FROM table;

-- Join verification
SELECT a.*, b.* FROM table_a a JOIN table_b b ON a.id = b.a_id;

-- Date-based queries
SELECT * FROM table WHERE created_at >= CURRENT_DATE;
```

---

## Best Practices

1. **Read before write** - Always SELECT before UPDATE/DELETE
2. **Use transactions for tests** - BEGIN; ...test...; ROLLBACK;
3. **Verify cascades** - Check that related data is handled correctly
4. **Test constraints, don't assume** - Constraints might be missing
5. **Check for NULLs** - NULL handling is a common source of bugs
6. **Verify calculations** - Don't trust that triggers ran correctly
7. **Document exact queries** - Makes issues reproducible

---

## Integration with Triforce Testing

Database testing completes the verification triangle:

```
┌─────────────────────────────────────────────────────────────┐
│                    TRIFORCE TESTING                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │     UI      │  │     API     │  │     DB      │         │
│  │  Testing    │  │  Testing    │  │  Testing    │         │
│  │             │  │             │  │   (THIS)    │         │
│  │ Playwright  │  │  Postman/   │  │   DBHub     │         │
│  │    MCP      │  │ OpenAPI MCP │  │    MCP      │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┴────────────────┘                 │
│                          │                                  │
│                 Data Flows Through All Layers               │
└─────────────────────────────────────────────────────────────┘
```

**Complete verification flow:**

1. **UI creates data** → API receives it → **DB stores it** (verify here)
2. **API modifies data** → **DB updates** (verify here) → UI reflects change
3. **Trigger fires** → **DB calculates** (verify here) → API returns result

---

## Output

- Database testing session notes with all findings
- Constraint verification results
- Data integrity check results
- List of issues (if any) ready for bug reporting
- Recommendations for schema improvements
