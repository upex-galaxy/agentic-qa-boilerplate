# DB Testing Maneuver — Doctrine (canonical)

> Loaded by any skill that validates data in the database: the DB leg of the `/sprint-testing`
> trifuerza (UI / API / DB), test-data lookups, and bug evidence that needs a row, not a
> screenshot. Sibling of `api-testing-doctrine.md`.

```
 SCHEMA + QUERY               CONFIG                       CREDENTIALS
 --------------               ------                       -----------
 DBHub MCP  [DB_TOOL]         dbhub.toml (committed)       .env  DBHUB_* (six vars)
  search_objects_primary       [[sources]] id = "primary"   -> declared on the MCP layer
  execute_sql_primary          ${DBHUB_*} interpolation        of all three hosts
```

## The tool: DBHub MCP

`[DB_TOOL]` resolves to the DBHub MCP (AGENTS.md §6); Supabase MCP or raw SQL are the fallback.
DBHub names its tools `{tool}_{source_id}`. `dbhub.toml` ships one source with `id = "primary"`,
so the tools are:

| Tool | Use |
|---|---|
| `search_objects_primary` | discover schemas, tables, columns before writing a query |
| `execute_sql_primary` | run the query |

A project that adds a second `[[sources]]` block with `id = "reporting"` gets
`execute_sql_reporting` alongside; the suffix is the only thing that tells two databases apart.

## Configuration and credentials

- **`dbhub.toml` is committed and holds no secret.** Every connection value is a `${DBHUB_*}`
  placeholder. Never put a literal password in it and never gitignore it: the file is shared
  config, the values are not.
- **`dbhub` itself does the interpolation**, from the environment of the process it was spawned
  in, so the six variables (`DBHUB_TYPE`, `DBHUB_HOST`, `DBHUB_PORT`, `DBHUB_DATABASE`,
  `DBHUB_USER`, `DBHUB_PASSWORD`) must reach that process. That is why all three hosts declare
  them on the MCP layer: `env` in `.mcp.json`, `environment` with `{file:.auth/opencode/VAR}`
  in `opencode.jsonc`, `env_vars` in `.codex/config.toml`. Parity is checked
  (`mcp-atlassian-optin.md`, MCP parity contract).
- **It fails late and quietly.** A missing variable does not stop startup: `dbhub` substitutes
  the literal `${DBHUB_HOST}` and the connection fails on the first query, which reads like a
  database problem. Check the `DBHUB_*` values in `.env` first, run `bun run harness:env`, then
  RESTART the agent session (spawn-time env, Critical Rule #10).
- **Read-only user by default.** Validation needs `SELECT`; ask for write grants only on a
  non-production environment and only when a test must seed data directly.

## Validation cookbook

Queries are Postgres-flavoured. Dialect notes: `NOW() - INTERVAL '1 minute'` is
`DATEADD(minute, -1, SYSDATETIME())` on SQL Server and `NOW() - INTERVAL 1 MINUTE` on MySQL;
`LIMIT n` is `TOP n` on SQL Server; placeholders are `$1` (Postgres), `@p1` (SQL Server),
`?` (MySQL). `DBHUB_TYPE` tells you which one you are on.

### Five things to validate

| Kind | Question | Expected |
|---|---|---|
| Existence | did the row get created? | `SELECT COUNT(*) FROM users WHERE email = $1` → 1 |
| Values | is the stored value right? | stored total = `SUM(price * quantity)` of its items |
| Integrity | do the relations hold? | zero orphans (below) |
| Timestamps | are the times plausible? | `created_at` within the last minute; `updated_at >= created_at` |
| Side effects | did triggers / cascades run? | after deleting a user, zero rows in its dependent tables |

### Orphans (broken foreign keys)

```sql
SELECT oi.*
FROM order_items oi
LEFT JOIN orders o ON oi.order_id = o.id
WHERE o.id IS NULL;
```

Prefer `LEFT JOIN ... IS NULL` over `NOT IN (SELECT ...)`: `NOT IN` returns no rows at all when
the subquery contains a `NULL`.

### Duplicates

```sql
SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;

-- same user, same day, same total
SELECT user_id, CAST(created_at AS DATE), total, COUNT(*)
FROM orders
GROUP BY user_id, CAST(created_at AS DATE), total
HAVING COUNT(*) > 1;
```

### Numeric mismatch

```sql
SELECT o.id, o.total, SUM(oi.price * oi.quantity) AS calculated
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, o.total
HAVING o.total <> SUM(oi.price * oi.quantity);
```

Money in floating-point columns will not compare exactly; compare with a tolerance or cast to
the column's decimal type.

### Timestamp windows

```sql
SELECT * FROM users WHERE created_at > NOW();          -- in the future
SELECT * FROM products WHERE updated_at < created_at;  -- updated before created
SELECT * FROM orders WHERE created_at IS NULL;         -- missing where required
```

Server and database clocks can disagree by seconds; widen a "last minute" window before calling
a miss a bug.

### Four strategies

1. **Snapshot before / after.** Read the value, perform the action through UI or API, read it
   again, assert the delta (stock went down by the ordered quantity).
2. **Compare against the source of truth.** Recompute what the row should hold (sum of items,
   subtotal minus discount) and compare with what was stored.
3. **Business constraints.** Query for rows that must not exist (`balance < 0`, an active order
   with no items); the expected count is zero.
4. **Cross-table.** Validate that several tables agree after one action (order, items,
   inventory, notification).

### By test level

- **Integration (API):** the API stored what it returned; side effects ran; a failed call rolled
  back.
- **E2E (UI):** the whole flow left the expected rows in every table it touches.
- **DB-level:** triggers fire, constraints reject bad data, defaults are set.

### Checklist

```
[ ] Rows exist in the right tables
[ ] Numeric values correct (totals, quantities)
[ ] Foreign keys valid, no orphans
[ ] No unexpected duplicates
[ ] Timestamps plausible
[ ] Business constraints hold
[ ] Side effects (triggers, cascades) ran
[ ] Transactions committed or rolled back as expected
```

## Connection troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| `Connection refused` | database not running, wrong port, firewall | `DBHUB_HOST` / `DBHUB_PORT`; `pg_isready -h <host> -p <port>` on Postgres |
| `password authentication failed` / login failed | wrong password or user, or a literal `${DBHUB_PASSWORD}` reached the server | the `DBHUB_*` values in `.env`, then `bun run harness:env` and restart |
| `too many connections` | parallel sessions not closing connections | fewer parallel workers; a pooler |
| `SSL connection is required` / SSL errors | server and `sslmode` disagree | `dbhub.toml` ships `sslmode = "require"`; a local database without TLS needs that line changed in the project's copy |

## Anti-patterns (NEVER)

- **NEVER** run `UPDATE` / `DELETE` against a shared environment to "fix" test data without the
  owner's OK. Seed through the API or a fixture instead.
- **NEVER** paste a connection string with a password into a command, artifact or chat.
- **NEVER** report a data mismatch as a bug before ruling out replication lag or a clock skew.
