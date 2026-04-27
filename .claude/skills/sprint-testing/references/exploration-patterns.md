# Exploration Patterns (Stage 2)

> **Subagent context**: this file is part of the "Context docs" briefing component for the Stage 2 Execution subagent (see `sprint-testing/SKILL.md` §Subagent Dispatch Strategy and `sprint-orchestration.md` §"Briefing 3 — Stage 2 Execution subagent").

Stage 2 Execution playbook for in-sprint manual / exploratory QA: smoke test, then UI / API / DB exploration as applicable to the ticket. Session notes written into the ticket PBI folder; bugs filed via `reporting-templates.md`.

This reference is for IN-SPRINT manual execution RIGHT NOW. It does NOT cover:
- Stage 1 planning, Discover-Modify-Generate data classification, test-outline naming, or traceability checks (see `acceptance-test-planning.md`).
- Stage 5 automated-test coding patterns (see `test-automation`).
- Stage 6 CI regression-suite execution (see `regression-testing`).

---

## Triforce model

Every feature validates through up to three layers. Pick by feature type:

| Feature type | Order |
|--------------|-------|
| UI-focused | UI -> API -> DB |
| API-first | API -> DB -> UI (if any) |
| Data-focused | DB -> API -> UI (if any) |
| Full-stack | All three |

**Smoke test is mandatory FIRST. Do not enter UI/API/DB deep-dive until smoke passes.**

---

## §1. UI exploration

Deep-dive the UI on `{{WEB_URL}}` via `[AUTOMATION_TOOL]`. Goal: validate ACs, discover edge cases, capture evidence.

### 1.1 Capabilities

| Capability | Tag | Purpose |
|------------|-----|---------|
| Navigate | `[AUTOMATION_TOOL]` | Open page |
| Snapshot | `[AUTOMATION_TOOL]` | Inspect DOM / accessibility tree |
| Click / Type | `[AUTOMATION_TOOL]` | Interact |
| Screenshot | `[AUTOMATION_TOOL]` | Evidence |
| Console + Network | `[AUTOMATION_TOOL]` | Observe errors / requests |

Before any `[AUTOMATION_TOOL]` call, set `.playwright/cli.config.json` `outputDir` to `.context/PBI/{module}/{ticket}/evidence/`. Screenshots still need the full path in `--filename` because `outputDir` does not apply to `.png`.

### 1.2 Scenario loop (per AC)

For each AC in the Stage-1 outlines:

1. Navigate to the starting URL.
2. Snapshot the page structure.
3. Execute happy-path actions step by step.
4. Observe: expected outcome? unexpected UI state? console red? network 4xx / 5xx?
5. Snapshot again on key state transitions.
6. Capture a screenshot as `{{PROJECT_KEY}}-{number}-ac{N}-{short-desc}.png`.
7. Update the matching Stage-1 test outline status (PASSED / FAILED) in `test-session-memory.md`.

### 1.3 Edge-case checklist

Apply per input / interaction that accepts data or state changes:

| Category | Checks |
|----------|--------|
| Boundary | Empty, max length, numeric 0 / -1 / MAX_INT, special chars `<script>`, `'; DROP TABLE` |
| State | Refresh mid-flow, back button, duplicate tabs, timeout / idle |
| Data validation | Invalid email, weak password, duplicate submission, concurrent edit |
| Visual | Responsive breakpoints, loading states, broken layouts, overlapping elements |

### 1.4 DevTools observation rules

- Console: red = log; yellow warnings are acceptable.
- Network: red rows (4xx / 5xx) always worth noting even if UI appears fine — UI can mask API failure.
- Performance: flag anything > 5s page load as a Performance finding.
- Disable cache while testing to avoid stale assets.

### 1.5 When to escalate to §2 / §3

- UI renders but data looks wrong -> go to §3 DB to confirm what persisted.
- Button fires a request that returns non-2xx -> go to §2 API to replay.
- RLS / authorization suspicion (user sees unexpected rows) -> §2 API + §3 DB both.

---

## §2. API exploration

Exercise `{{API_URL}}` via `[API_TOOL]` (OpenAPI MCP, Postman, or curl). Goal: confirm contracts, auth, error handling and RLS.

### 2.1 Endpoint discovery (OpenAPI)

```
[API_TOOL] List endpoints / collections:
  - source: {OpenAPI spec or curated collection}

[API_TOOL] Inspect endpoint schema:
  - endpoint: {method + path}
```

Record endpoints relevant to the ticket into a compact table in `test-session-memory.md`:

| Method | Endpoint | Purpose | AC |
|--------|----------|---------|----|

### 2.2 Authenticated setup

Always pull credentials from `.env` — never hardcode. Acquire the access token once, reuse across requests:

```
[API_TOOL] POST /auth/v1/token
  body: { email: {{env.STAGING_USER_EMAIL}}, password: {{env.STAGING_USER_PASSWORD}} }
  store: access_token, refresh_token, user.id
```

**Token-propagation gotcha**: some backends scope tokens by workspace / tenant. If a request 200s for one user and 403s for another with the same role, propagation is the suspect — note it as a discovery rather than a bug until confirmed with the team.

### 2.3 Status-code matrix (per endpoint)

| Scenario | Expected | What it proves |
|----------|----------|----------------|
| Happy path | 200 / 201 | Contract + happy data |
| Missing required field | 400 | Validation live |
| Empty string in required | 400 | Not silently coerced |
| Over-length input | 400 or 413 | Size guard |
| Missing auth header | 401 | Auth required |
| Expired token | 401 | Token rotation works |
| Valid user, other tenant's resource | 403 or empty | RLS / tenant isolation |
| Non-existent resource | 200 + empty (PostgREST) or 404 | Not-found semantics |
| Duplicate unique | 409 | Conflict handling |
| Malformed body | 400 | Parser guards |

### 2.4 RLS / authorization probe

Critical for multi-tenant apps. Two users (A, B), same role:

1. A lists resources -> should return only A's rows.
2. A reads `resource?user_id=eq.B` -> empty array or 403.
3. A PATCH's B's row -> 0 rows affected or 403.

Record result as `VERIFIED` or `VULNERABLE`. Any `VULNERABLE` is Critical-severity bug territory.

### 2.5 Scenario record format

```
Endpoint: {METHOD} {path}
Request: {headers, body, query}
Expected: {status, key response fields}
Actual: {status, observed body snippet}
Assertions:
  [ ] status matches
  [ ] schema valid (no unexpected fields)
  [ ] data values correct
Outcome: PASSED | FAILED | OBSERVATION
```

### 2.6 Cross-layer handoff

After a successful POST / PATCH, go to §3 DB to confirm persistence and trigger execution; a 201 response does not prove the DB is correct (triggers can silently no-op).

---

## §3. DB exploration

Query `{{DB_MCP}}` via `[DB_TOOL]`. Goal: confirm data state, constraints, triggers and RLS at SQL level.

### 3.1 Schema discovery

```sql
-- list tables
SELECT table_name FROM information_schema.tables WHERE table_schema='public';

-- describe columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_name = '{table}';

-- constraints
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints WHERE table_name = '{table}';

-- foreign keys
SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS fk_table, ccu.column_name AS fk_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='{table}';
```

### 3.2 State verification (after API / UI action)

| Check | Query pattern |
|-------|---------------|
| Row exists | `SELECT * FROM {table} WHERE id = '{id}'` |
| Relationship | `JOIN` child to parent, compare expected count |
| Trigger executed | compare stored total vs `SUM(items)` |
| Timestamps sane | `created_at` recent, `updated_at >= created_at` |

### 3.3 Constraint probes (negative path)

These should ALL error. Success = constraint missing (bug).

| Constraint | Probe |
|------------|-------|
| FK | INSERT child with non-existent parent id |
| CHECK | UPDATE to invalid enum value |
| UNIQUE | INSERT duplicate of unique column |
| NOT NULL | INSERT with NULL in required column |

Wrap probes in transactions and ROLLBACK to avoid polluting staging.

### 3.4 Integrity sweeps

Run periodically for data-heavy features:

```sql
-- orphans
SELECT c.* FROM {child} c LEFT JOIN {parent} p ON c.{fk}=p.id WHERE p.id IS NULL;

-- calc mismatch
SELECT o.id, o.total, COALESCE(SUM(i.qty*i.unit_price),0) AS calc
FROM orders o LEFT JOIN order_items i ON o.id=i.order_id
GROUP BY o.id, o.total HAVING o.total != COALESCE(SUM(i.qty*i.unit_price),0);

-- invalid domain states
SELECT * FROM orders WHERE status='delivered' AND payment_status!='completed';
```

### 3.5 RLS at SQL level

`qa_team` role often bypasses RLS. For true RLS testing:

```sql
BEGIN;
SET LOCAL request.jwt.claim.sub = '{user-a-uuid}';
SELECT * FROM {table}; -- should only return A's rows
ROLLBACK;
```

If direct SQL bypasses, fall back to the §2.4 API probe.

### 3.6 Cleanup

After testing CRUD flows, verify cleanup cascades:

- DELETE parent -> children gone?
- Soft-delete flag set, row still present?

Record: `CLEANUP COMPLETE` / `INCOMPLETE`.

---

## §4. Smoke test (first action of Stage 2)

5-10 minute Go / No-Go on `{{WEB_URL}}`. NEVER run deep exploration until smoke passes.

### 4.1 Input

- Ticket happy path (from Stage-1 outlines or ACs).
- Staging URL, test credentials from `.env`.

### 4.2 Checklist (execute in order)

1. **Basic access** — app loads, no 500, assets render, console has no red errors (yellow warnings acceptable).
2. **Authentication** — login, session persists on refresh, logout works (skip if ticket is pre-auth).
3. **Happy path** — execute the ticket's primary flow end to end, 3-5 steps, tick each as it works.
4. **Backend integration** — DevTools Network tab during happy path, all `/api/*` calls 2xx, data persists after F5.

### 4.3 Verdict

| Result | Action |
|--------|--------|
| PASS | Record `Smoke: PASSED` in `test-session-memory.md`, continue §1 / §2 / §3 |
| FAIL | STOP. File a Critical bug via `reporting-templates.md`. Do NOT continue deep exploration. |

### 4.4 Restrictions

- Do NOT run edge cases or negative tests during smoke.
- Do NOT open minor-severity bugs during smoke — only blockers.
- Do NOT exceed 10 minutes.
- ALWAYS check the Network tab even if UI looks fine (UI can render cached / mock data).

---

## §5. Session notes / observation log

All execution output is written into the ticket's PBI folder. Two files are updated during Stage 2: `test-session-memory.md` (live log) and `evidence/` (screenshots).

### 5.1 PBI folder layout

```
.context/PBI/{module}/{{PROJECT_KEY}}-{number}-{brief-title}/
  context.md
  test-analysis.md        # Stage 1
  test-session-memory.md  # Stage 2 live log
  test-report.md          # Stage 3 (later)
  evidence/               # gitignored
    {{PROJECT_KEY}}-{number}-smoke-{desc}.png
    {{PROJECT_KEY}}-{number}-ac{N}-{desc}.png
```

### 5.2 `test-session-memory.md` stage 2 block

```markdown
## Stage 2 — Execution

**Env:** {Staging | Local}
**Started:** {timestamp}

### Smoke
- Result: PASSED | FAILED
- Evidence: evidence/{{PROJECT_KEY}}-{number}-smoke-home.png
- Notes: {console-clean / 1 warn / ...}

### UI Exploration
| AC | Scenario | Result | Evidence | Notes |
|----|----------|--------|----------|-------|
| AC1 | {short} | PASSED | evidence/...ac1-xxx.png | - |
| AC2 | {short} | FAILED | evidence/...ac2-yyy.png | Modal closes on Esc, should persist |

### API Exploration
| Endpoint | Scenario | Expected | Actual | Result |
|----------|----------|----------|--------|--------|
| POST /orders | happy | 201 | 201 | PASSED |
| POST /orders | missing qty | 400 | 500 | FAILED |

### DB Exploration
| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| order row exists | 1 | 1 | PASSED |
| trigger total | 150 | 140 | FAILED |

### Findings (carry to Stage 3)
- Bug 1: {one-line title} — severity Major
- Obs: {edge case worth documenting but not a bug}
```

### 5.3 Evidence naming rules

- Always start with `{{PROJECT_KEY}}-{number}-`.
- Smoke: `{{PROJECT_KEY}}-{number}-smoke-{area}.png`.
- AC-tied: `{{PROJECT_KEY}}-{number}-ac{N}-{short-desc}.png`.
- Bugs: `{{PROJECT_KEY}}-{number}-bug-{short-desc}.png`.
- Never commit screenshots — `evidence/` stays gitignored.
- Capture at the failing state, not during navigation to it.

### 5.4 Status propagation

At end of Stage 2, each Stage-1 test outline / TC must have PASSED or FAILED. No NOT RUN. If one remains NOT RUN, it is either out of scope (mark why in Notes) or incomplete (return to the loop).

### 5.5 Handoff to Stage 3

`test-session-memory.md` Stage-2 block is the input Stage 3 consumes. The Findings list feeds the bug-filing loop in `reporting-templates.md`; the pass/fail tables feed the ATR Test Cases section.

---

## §6. Pre-flight checklist

- [ ] Playwright / automation tool config `outputDir` set to `evidence/` folder BEFORE first action
- [ ] Credentials pulled from `.env` (no hardcoding)
- [ ] Smoke test ran FIRST and produced Go decision
- [ ] Triforce layers selected based on feature type (UI / API / DB)
- [ ] Every AC mapped to at least one scenario row in `test-session-memory.md`
- [ ] Evidence screenshots named per §5.3 and stored under the ticket's `evidence/` folder
- [ ] RLS / authorization probes run when multi-tenant or role-sensitive
- [ ] DB constraint probes wrapped in transactions and rolled back
- [ ] All TCs / outlines ended Stage 2 with PASSED or FAILED (no NOT RUN)
- [ ] Findings list populated for Stage 3 handoff
