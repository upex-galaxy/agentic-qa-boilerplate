# Exploration Patterns (Stage 2)

> **Subagent context**: this file belongs in the "Context docs" component of the Stage 2 Execution subagent's briefing (see `sprint-testing/SKILL.md` §Subagent Dispatch Strategy and `sprint-orchestration.md` §"Briefing 3 — Stage 2 Execution subagent").

The Stage 2 playbook for in-sprint manual and exploratory QA: a smoke test, then UI, API and DB exploration as the ticket needs. Session notes go into the ticket's PBI folder, and bugs are filed through `reporting-templates.md`. Look elsewhere for:
- Stage 1 planning, Discover-Modify-Generate data classification, test-outline naming and traceability checks: `acceptance-test-planning.md`.
- Stage 5 automated-test coding patterns: `test-automation`.
- Stage 6 CI regression-suite execution: `regression-testing`.

---

## Triforce model

Every feature validates through up to three layers. Pick by feature type:

| Feature type | Order |
|--------------|-------|
| UI-focused | UI -> API -> DB |
| API-first | API -> DB -> UI (if any) |
| Data-focused | DB -> API -> UI (if any) |
| Full-stack | All three |

Run the smoke test first (§4). The UI, API and DB deep dives start only after it passes.

---

## Finding triage: blocking vs non-blocking (graduated pause)

A FAIL found during deep exploration is neither automatically Critical nor automatically a reason to halt. Triage first. Pausing the pass on a cosmetic finding wastes the dispatch and loses coverage, while a genuine blocker has to stop it immediately.

| Finding class | Examples | Action |
|---------------|----------|--------|
| Blocking | smoke down, env down, data corruption / integrity loss, security-exploitable (auth bypass, cross-tenant read/write, RLS `VULNERABLE`) | Stop the pass immediately and surface it to the orchestrator or user. Deep exploration does not continue. |
| Non-blocking | cosmetic, minor validation gap, edge-case on a non-critical TC, a security/auth/framework-default finding pending recalibration | Log it and continue. Record it in `test-session-memory.md` Findings, mark the TC FAILED, finish the remaining TCs, and surface all non-blocking findings together at Stage 2 close. |

**Before a finding becomes a bug proposal**, a data-integrity, money or security finding (or any whose mechanism is still a hypothesis) runs the refute mandate of `../../agentic-qa-core/references/adversarial-verification.md`: a verifier tries to explain it away, the row's own invariant is checked, and the competing hypotheses are executed side by side.

Severity is assigned per `reporting-templates.md` §1.4, and security/auth/framework-default findings are recalibrated at Stage 3 per `reporting-templates.md` §5.0, so no Critical bug is filed from inside the pass.

**Visual and positional findings get annotated before filing.** When a confirmed finding is visual or positional (overlapping elements, misalignment, a wrong date or offset on a chart axis, anything a raw screenshot needs a paragraph to explain), load the `bug-screenshot-annotation` skill for a marked-up capture (circles, arrows, callouts, corner badge) before the Stage 3 filing loop. A purely textual finding (an error message, a wrong number in a field) reads clearly in the raw capture and skips it. The annotated PNG is the lead evidence in the bug report and the first defect image of its evidence pack, so it leads the evidence page the Evidence Handoff links.

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

Every capture gets an explicit destination path that resolves to the ticket's `evidence/` folder, and the shared `.playwright/cli.config.json` `outputDir` stays as it is (see `agentic-qa-core/references/evidence-conventions.md` §1 Bucket B and §5). Screenshots need the full path in `--filename` because `outputDir` does not apply to `.png`.

**Evidence pack.** When the ticket will get an evidence page, record each observed case in the evidence pack beside the screenshots as you go. Marks are placed from the element's real box (`getBoundingClientRect` through `eval`), not by eye: the `evidence-artifact` skill, `references/workflow.md` §2.

**Session and login.** Use one named in-memory session per ticket (`-s=<KEY>`). The app's login comes from the role's state file, not from a login typed inside the exploration session: `open`, then `state-load <repo>/.auth/<env>-<role>.json`, then `goto`. Two roles mean two sessions (`-s=<KEY>-admin`, `-s=<KEY>-member`). A missing file, or a login page after `goto`, means producing the file first (suite setup, or the one-off login recipe). Before the first session of the project, check `testing.browser.pair_mode` in `.agents/project.yaml` (`null` = ask once). `close` every session before reporting and prove it with `playwright-cli list`. Canon: `agentic-qa-core/references/browser-sessions.md`.

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
| Boundary (BVA) | Empty, `min-1·min·min+1`, `max-1·max·max+1`, numeric 0 / -1 / MAX_INT, special chars `<script>`, `'; DROP TABLE` |
| UI/session state | Refresh mid-flow, back button, duplicate tabs, timeout / idle |
| Lifecycle / state-transition | For any entity with a status (draft, submitted, approved; cart, paid, shipped): fire each *valid* transition, then fire a transition the current state should *reject* (e.g. approve an already-closed item) — invalid transitions are where defects hide |
| Data validation | Invalid email, weak password, duplicate submission, concurrent edit |
| Visual | Responsive breakpoints, loading states, broken layouts, overlapping elements |

> Exploration here executes the risk-beyond-AC outlines Stage 1 derived by technique (`agentic-qa-core/references/test-design-doctrine.md`). When it surfaces a partition, boundary or transition the Stage-1 ATP missed, add it back to the outline set. Coverage is the ACs as the floor plus this risk layer, and exploration supplements planning.

### 1.4 DevTools observation rules

- Console: log red entries; yellow warnings are acceptable.
- Network: note red rows (4xx / 5xx) even when the UI looks fine, since the UI can mask an API failure.
- Performance: flag any page load over 5s as a Performance finding.
- Disable cache while testing to avoid stale assets.

### 1.5 When to escalate to §2 / §3

- UI renders but data looks wrong: go to §3 DB to confirm what persisted.
- A button fires a request that returns non-2xx: go to §2 API to replay it.
- RLS / authorization suspicion (a user sees unexpected rows): go to §2 API and §3 DB both.

---

## §2. API exploration

Exercise the API with the three-tool maneuver: OpenAPI MCP for the schema (read-only), `bun run api:login` for the token, curl for authenticated execution. The goal is to confirm contracts, auth, error handling and RLS. Load the canonical doctrine, `agentic-qa-core/references/api-testing-doctrine.md`, before exercising any endpoint.

### 2.0 API Testing Maneuver (read first)

| Step | Tool | Job |
|------|------|-----|
| 1. Schema | OpenAPI MCP (`list-api-endpoints`, `get-api-endpoint-schema`) | Discover endpoints and read request/response schemas. Read only. |
| 2. Token | `bun run api:login [<env>] [--role <role>]` | Mint the token into `.auth/tokens.env` (`export API_TOKEN_<ROLE>_<ENV>='…'`) + `.auth/tokens.json`. |
| 3. Execute | `curl` | Run authenticated requests. |

The OpenAPI MCP only reads schemas and never executes authenticated requests. Every request goes through curl, with `source` and `curl` in the same Bash call, because shell env vars do not persist across the agent's separate calls and the file on disk is the source of truth:

```bash
source .auth/tokens.env && \
curl -s -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" "$API_BASE_URL/<path>"
```

`<ROLE>` defaults to `user`; uppercase role+env (e.g. `API_TOKEN_ADMIN_STAGING`).

**Schema drift.** The schema is typically dev/latest and the target env (e.g. `staging`) may lag, so on an unexpected 4xx or shape mismatch suspect drift before filing a bug. The doctrine has the token-freshness checks and anti-patterns.

### 2.1 Endpoint discovery (OpenAPI MCP, schema read-only)

```
OpenAPI MCP  list-api-endpoints
  - source: {OpenAPI spec — the full spec URL (commonly the localhost backend) or a file path relative to the repo root; never the endpoint route alone}

OpenAPI MCP  get-api-endpoint-schema
  - endpoint: {method + path}
```

Record endpoints relevant to the ticket into a compact table in `test-session-memory.md`:

| Method | Endpoint | Purpose | AC |
|--------|----------|---------|----|

### 2.2 Authenticated setup (token via api:login, execute via curl)

Credentials live in `.env` and are never hardcoded. Mint the token once per role and env, then reuse it across requests:

```bash
# 1. Mint (writes .auth/tokens.env + .auth/tokens.json; no restart needed)
bun run api:login staging                 # role=user  -> $API_TOKEN_USER_STAGING
bun run api:login staging --role admin    # role=admin -> $API_TOKEN_ADMIN_STAGING

# 2. Execute (source + curl in one Bash call)
source .auth/tokens.env && \
curl -s -H "Authorization: Bearer $API_TOKEN_USER_STAGING" "$API_BASE_URL/<path>"
```

**Token-propagation gotcha.** Some backends scope tokens by workspace or tenant. When a request returns 200 for one user and 403 for another with the same role, propagation is the suspect: note it as a discovery, not a bug, until the team confirms.

### 2.3 Status-code matrix (per endpoint)

| Scenario | Expected | What it proves |
|----------|----------|----------------|
| Happy path | 200 / 201 | Contract + happy data |
| Missing required field | 400 | Validation live |
| Empty string in required | 400 | Not silently coerced |
| Over-length input | 400 or 413 | Size guard |
| Missing auth header | 401 | Auth required |
| Expired token | 401 | Token rotation works (see "Time-dependent / TTL test cases" for exercising the expiry boundary) |
| Valid user, other tenant's resource | 403 or empty | RLS / tenant isolation |
| Non-existent resource | 200 + empty (PostgREST) or 404 | Not-found semantics |
| Duplicate unique | 409 | Conflict handling |
| Malformed body | 400 | Parser guards |

### 2.4 RLS / authorization probe

Needed for multi-tenant apps. Take two users (A, B) with the same role:

1. A lists resources: only A's rows come back.
2. A reads `resource?user_id=eq.B`: empty array or 403.
3. A PATCHes B's row: 0 rows affected or 403.

Record the result as `VERIFIED` or `VULNERABLE`. Any `VULNERABLE` is Critical-severity bug territory.

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

After a successful POST / PATCH, go to §3 DB to confirm persistence and trigger execution. A 201 response does not prove the DB is correct, because triggers can silently no-op.

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

Every probe should error. A probe that succeeds means the constraint is missing, which is a bug.

| Constraint | Probe |
|------------|-------|
| FK | INSERT child with non-existent parent id |
| CHECK | UPDATE to invalid enum value |
| UNIQUE | INSERT duplicate of unique column |
| NOT NULL | INSERT with NULL in required column |

Wrap probes in transactions and ROLLBACK so staging stays clean.

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

The `qa_team` role often bypasses RLS. For a true RLS test:

```sql
BEGIN;
SET LOCAL request.jwt.claim.sub = '{user-a-uuid}';
SELECT * FROM {table}; -- should only return A's rows
ROLLBACK;
```

If direct SQL bypasses RLS, fall back to the §2.4 API probe.

### 3.6 Cleanup

After testing CRUD flows, verify cleanup cascades:

- After DELETE on the parent, are the children gone?
- Is the soft-delete flag set with the row still present?

Record: `CLEANUP COMPLETE` / `INCOMPLETE`.

---

## §4. Smoke test (first action of Stage 2)

A 5-10 minute Go / No-Go on `{{WEB_URL}}`. Deep exploration waits until smoke passes.

### 4.1 Input

- Ticket happy path (from Stage-1 outlines or ACs).
- Staging URL, test credentials from `.env`.

### 4.2 Checklist (execute in order)

1. Basic access: the app loads, no 500, assets render, the console has no red errors (yellow warnings are acceptable).
2. Authentication: login works, the session persists on refresh, logout works (skip when the ticket is pre-auth).
3. Happy path: run the ticket's primary flow end to end, 3-5 steps, ticking each as it works.
4. Backend integration: with the DevTools Network tab open during the happy path, all `/api/*` calls return 2xx and data persists after F5.

### 4.3 Verdict

| Result | Action |
|--------|--------|
| PASS | Record `Smoke: PASSED` in `test-session-memory.md`, continue §1 / §2 / §3 |
| FAIL | Stop: a smoke failure is an env-level blocker. Triage first and assign severity per `reporting-templates.md` §1.4 (no automatic Critical bug). Surface it to the user and do not continue deep exploration. |

### 4.4 Restrictions

- Happy path only: edge cases and negative tests come later.
- Open bugs only for blockers, not minor-severity ones.
- Stay within 10 minutes.
- Check the Network tab even when the UI looks fine, since the UI can render cached or mock data.

---

## Time-dependent / TTL test cases (playbook)

TTL, expiry and rotation cases recur across auth (magic links, OTPs), tokens (access/refresh), sessions and caches. Example: a link clicked at 14:59 (within a 15-min TTL) succeeds, at 15:01 it fails, and an already-expired link fails. Clicking faster does not reach the boundary; you need a way to control or compress time. Pick the highest option the stack allows, so the TC never ends as a bare `BLOCKED`.

Options, in priority order:

1. Testability fixture or short-TTL env config. This is the best option because it exercises the real expiry code path. If the env exposes a configurable TTL (env var, feature flag, test-only config), set it to a few seconds so the boundary is reachable in real time, then test the 14:59/15:01 equivalents directly.
2. Clock-mock. If the stack supports injecting or freezing time (test hooks, a mockable clock, `sinon`-style fake timers on the backend, or a DB-side `now()` override in a transaction), advance the clock past the TTL and assert the expiry. Use it when option 1 is unavailable and the mock drives the production expiry logic, not a parallel test-only branch.
3. Explicit manual-defer with a written follow-up. This is the last resort. Document the boundary you could not exercise, why (no fixture, no clock-mock), and the concrete follow-up (e.g. "add a `MAGIC_LINK_TTL` test override" or "automate with fake timers in Stage 5"), and file it so the coverage gap stays visible.

**Rule.** While option 1 or 2 is still being tried, mark the TC `BLOCKED — needs time fixture` in `test-session-memory.md` with the option and a one-line rationale. Once option 3 is chosen it becomes `DEFERRED (execution) <date> by QA decision: <reason>; follow-up <KEY>`, and that is the line the results carry. A bare `BLOCKED` with no decision path loses coverage silently, so it is never recorded. The §5.4 observation rule applies: until a fixture or clock-mock lets the case be observed, the TC is NOT RUN. Option 3 is the ladder's QA deferral (`DEFERRED (execution)` with the follow-up named), and its reason goes into the Findings list for Stage 3.

---

## §5. Session notes / observation log

Stage 2 updates two places: `test-session-memory.md` (live log, in the SESSION dir) and `evidence/` (screenshots, in the PBI folder).

### 5.1 Layout

```
.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-{{PROJECT_KEY}}-{number}-{brief-title}/
  context.md                  # hand-authored (NON-Jira, local-only)
  acceptance-test-plan.md     # Stage 1 — Jira-synced read-only cache
  acceptance-test-results.md  # Stage 3 — Jira-synced read-only cache (later)
  evidence/                   # NON-Jira, local-only
    {{PROJECT_KEY}}-{number}-smoke-{desc}.png
    {{PROJECT_KEY}}-{number}-ac{N}-{desc}.png

.session/sprint-testing/<scope>/
  test-session-memory.md      # Stage 2 live log (hand-authored)
```

The PBI tree is a gitignored Jira cache (`.agents/instructions/agent-local-context-pbi.md`). The live log sits in `.session/` so a re-sync cannot clobber it mid-execution.

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

- Start every name with `{{PROJECT_KEY}}-{number}-`.
- Smoke: `{{PROJECT_KEY}}-{number}-smoke-{area}.png`.
- AC-tied: `{{PROJECT_KEY}}-{number}-ac{N}-{short-desc}.png`.
- Bugs: `{{PROJECT_KEY}}-{number}-bug-{short-desc}.png`.
- `evidence/` stays gitignored, so screenshots are not committed.
- Capture at the failing state, not during navigation to it.
- The shared bucket model (auto-logs / real evidence / annotation intermediates), the annotated-image suffix and the verify-on-disk discipline live in `../../agentic-qa-core/references/evidence-conventions.md`. Annotation working files (crops, overlay HTML) go to the session scratchpad, not to `evidence/`.

### 5.4 Status propagation

At the end of Stage 2, each Stage-1 test outline / TC is PASSED or FAILED only when it was observed in the environment its precondition names. Anything else is NOT RUN, whatever indirect evidence exists (a unit test, green CI, reading code, a local or lower environment). A NOT RUN case runs the blocking ladder (`../../agentic-qa-core/references/discovery-driven-doctrine.md` §5) and ends Stage 2 with its reason recorded: `BLOCKED` while the ladder is open, `DEFERRED (execution)` once QA deferred it with a follow-up. Out of scope stays a stated note in Notes.

### 5.5 Handoff to Stage 3

The Stage-2 block of `test-session-memory.md` is the input Stage 3 consumes. The Findings list feeds the bug-filing loop in `reporting-templates.md`; the pass/fail tables feed the ATR Test Cases section.

---

## §6. Pre-flight checklist

- [ ] Each capture has an explicit full destination path in the ticket's `evidence/` folder, and the shared `.playwright/cli.config.json` `outputDir` is untouched (§1.1)
- [ ] Credentials come from `.env`
- [ ] Smoke ran first and produced a Go decision
- [ ] Triforce layers chosen by feature type, and every AC mapped to at least one scenario row in `test-session-memory.md`
- [ ] RLS / authorization probes run when the feature is multi-tenant or role-sensitive; DB constraint probes wrapped in transactions and rolled back
- [ ] Evidence named per §5.3
- [ ] Every TC / outline ended Stage 2 PASSED or FAILED on observation in its precondition's environment, or NOT RUN with its ladder reason (`BLOCKED` / `DEFERRED (execution)`) recorded
- [ ] Findings list populated for the Stage 3 handoff

---

## With nobody at the keyboard

A blocking finding and a smoke FAIL both hand a decision to a person (`agentic-qa-core/references/decision-protocol.md`). With a person present, surface it and wait. A supervised worker reports the blocker to its conductor or launcher, which holds the gate. A routine with nobody stops deep exploration, records the blocker in Findings and reports, and files no bug, Jira comment or message unless a delegating brief covers it. For `testing.browser.pair_mode: null`, the routine assumes a single non-paired session and says so in the report.
