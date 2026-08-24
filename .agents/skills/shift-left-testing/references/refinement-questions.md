# Refinement Question Catalog — Gap-Spotting Checklist by AC Archetype

> **Subagent context**: cited by the Phase 2 Refinement subagent (see `refinement-playbook.md` §Step 3 — Story Quality Analysis) as a checklist. Walk the archetype list(s) that match the Story; the catalog surfaces the questions in-sprint testers usually only discover when execution fails.

A Story usually maps to one or more **archetypes** (auth, money, search, state machine, list/table, integration, notification, permissions). For each archetype, this catalog provides a question set the refinement subagent must mentally walk through. Questions that have no answer in the Story description, ACs, or Team Discussion become PO / Dev open questions in the refinement output.

Use this catalog as a **rubric**, not a script. If the Story is already explicit on a topic, do not re-ask it.

---

## How to use

1. Read the Story title + description + ACs. Identify the archetype(s) involved (often 2-3 per Story).
2. For each matched archetype, walk the question list.
3. Any question without an explicit answer in the Story = candidate gap.
4. Classify the gap:
   - **Critical** -> blocks sprint planning (write into Phase 2 Critical Questions for PO)
   - **Important** -> blocks implementation (Technical Questions for Dev)
   - **Edge** -> testable but not blocking (Edge Cases not in Story, with NEEDS PO/DEV CONFIRMATION)
5. If a question's answer can be inferred from `.context/business/*` or module-context, cite the source and skip the PO ask.
6. **Map each archetype to the formal technique it implies, then derive outlines by that technique** (canon: `agentic-qa-core/references/test-design-doctrine.md` Part 2). A gap is not just a PO question — it is also a missing outline.

| Archetype | Formal technique it triggers | Outlines to derive |
|---|---|---|
| State Machine (order, subscription, KYC, dispute, document lifecycle) | **State-Transition** | one per valid transition + one per *invalid* transition (SM3 / SM10) |
| Money / Billing, Search/Filter ranges, List CRUD limits | **Boundary Value Analysis** | `min-1·min·min+1 … max-1·max·max+1`, zero / empty / null |
| Permissions / RBAC, Auth (role × state × flag) | **Decision Table** | one per surviving rule of the condition matrix |
| Integration / multi-factor configs (provider × locale × plan) | **Pairwise** | all-pairs set; log the reduction |
| Universal (U5 idempotency, U-series retries/concurrency) | **Error Guessing charter** | double-submit, retry, race, timeout, rollback |

---

## Universal questions (apply to every Story)

| # | Question | Common failure mode if unanswered |
|---|----------|-----------------------------------|
| U1 | What is the EXACT error message text + status code for each failure path? | QA writes "shows error" assertion that passes on the wrong error |
| U2 | Which user role / permission level is required? | Auth bypass discovered in production |
| U3 | What happens on success — UI redirect target, toast text, page reload? | Test passes on "no error" but UI never updated |
| U4 | What is the source of truth for state — server response, local state, URL param? | Race condition between FE state and BE state in production |
| U5 | Is the operation idempotent? What if it is triggered twice (double-click, retry)? | Duplicate charges / duplicate records |
| U6 | What is the audit / logging requirement (who, what, when)? | Compliance gap discovered post-release |
| U7 | What is the rollback behavior on partial failure (e.g. 3 of 5 records fail)? | Half-applied mutations leave the system inconsistent |
| U8 | What devices / browsers / viewports are in scope? | Mobile Safari breaks because nobody tested it |
| U9 | What is the expected behavior in offline / network-error state? | App hangs forever on flaky connection |
| U10 | Is there a "first-time" / empty / zero-data state distinct from steady state? | Onboarding flow shows scary empty table |

---

## Archetype: Authentication / Authorization / Session

| # | Question | Why critical |
|---|----------|--------------|
| A1 | Are there role / permission gates on each AC? Specify the role per AC. | Authorization escalation |
| A2 | What is the session timeout policy? How is timeout surfaced to the user? | Silent session loss |
| A3 | Are tokens short-lived (JWT) or session-based (cookie)? What is the refresh flow? | Refresh-token leaks / forced logouts |
| A4 | What is the password complexity / rotation / lockout policy? | Account takeover |
| A5 | Is 2FA / MFA in scope? Backup-code flow defined? | User locked out forever |
| A6 | What is the "logout" surface — does it clear server-side session + local state + 3rd-party cookies? | Stale session attacks |
| A7 | Are there concurrent-session rules (one device only, multi-device)? | Account-sharing abuse |
| A8 | What is the response on unauthenticated access — redirect, 401, 403, 404? | Information disclosure (403 vs 404 reveals existence) |
| A9 | Are there CSRF / CORS requirements specific to this endpoint? | CSRF vulnerability |
| A10 | What is the rate-limit + lockout threshold on failed attempts? | Credential stuffing |

---

## Archetype: Money / Billing / Payment

| # | Question | Why critical |
|---|----------|--------------|
| M1 | What is the currency, precision (cents? mills?), rounding rule? | Off-by-one cent across millions of transactions |
| M2 | Is partial refund supported? Maximum refundable amount? Time window? | Refund abuse / accounting drift |
| M3 | What is the failure mode when the payment provider times out — do we retry, surface error, queue? | Double charges or silent loss |
| M4 | What is the reconciliation / audit log requirement? Who can view it? | Compliance audit failure |
| M5 | Are taxes / fees / discounts applied before or after the displayed amount? Where is the rule defined? | Customer disputes over invoice math |
| M6 | What happens when the user's card is declined mid-flow — saved state, abandoned cart, retry path? | Lost revenue + customer rage |
| M7 | Currency conversion: which rate, which provider, locked at quote time or transaction time? | FX exposure |
| M8 | Refunds vs voids vs cancellations — semantics in this Story? | Wrong financial bucket |
| M9 | Subscription proration on plan change / cancellation? | Customer billed for entire month after downgrade |
| M10 | What is the chargeback / dispute flow downstream of this Story? | Disputed transactions never reach the right team |

---

## Archetype: Search / Filter / List / Table

| # | Question | Why critical |
|---|----------|--------------|
| S1 | What is the default sort? Is it user-overridable? Persisted across sessions? | Inconsistent default surprises users |
| S2 | Pagination model — offset, cursor, infinite scroll? What is the page size? | Skip / duplicate records on insert during pagination |
| S3 | Search semantics — exact match, fuzzy, full-text, prefix? Case-sensitive? | "User can't find anything they typed correctly" |
| S4 | What is the empty-state UI when 0 results — distinct from "still loading"? | Users assume "still loading" forever |
| S5 | Are search results filtered by user permissions? What if 0 of N records are visible to me? | Data leak via search OR confused user |
| S6 | Sorting on a nullable field — nulls first or last? | "My missing-date records disappeared" |
| S7 | Filter combinations — AND or OR? Per-field operator selectable? | Wrong record set returned |
| S8 | Bulk-select scope — current page only or entire result set? | Accidental bulk-delete of records the user never saw |
| S9 | Export / download scope — current view, all filtered, raw all? Format? Limits? | Large export crashes browser |
| S10 | Performance budget — max query time, max rows returned, server-side vs client-side filter? | Slow query crashes prod |

---

## Archetype: State Machine (order, subscription, KYC, dispute, document lifecycle)

| # | Question | Why critical |
|---|----------|--------------|
| SM1 | What are ALL the valid states + ALL valid transitions? Diagram / table reference? | Hidden state surfaces in production |
| SM2 | Which transitions are user-driven vs system-driven (cron, webhook, time-based)? | Race between user action and background job |
| SM3 | What is the behavior on attempted invalid transition (e.g. cancel a delivered order)? | Quiet 200 OK + no state change leaves user confused |
| SM4 | Are there terminal states (no further transitions)? Can users still view / search them? | Closed records vanish or remain mutable |
| SM5 | Is there a "rollback" / "reopen" transition? Auth gate? | Support unable to fix customer error |
| SM6 | What triggers each transition — explicit user action, API event, timer, external webhook? | Trigger source not testable in isolation |
| SM7 | What is the time-to-live in each state before auto-transition (timeout, escalation)? | Records orphaned in intermediate state |
| SM8 | Audit log per transition — actor, timestamp, reason? | Cannot reconstruct what happened |
| SM9 | Notifications fired per transition — to whom, via which channel? | User missed key state change |
| SM10 | Concurrent transitions — what if two actors transition simultaneously? Lock / queue / last-write-wins? | Data corruption under load |

---

## Archetype: External Integration (Stripe, Auth0, Salesforce, partner API)

| # | Question | Why critical |
|---|----------|--------------|
| I1 | Which integration SDK / version? Sandbox + production credentials in `.env`? | Wrong env credentials hit prod |
| I2 | What is the contract version pinned (OpenAPI spec, schema hash)? | Silent contract drift |
| I3 | Synchronous (request/response) or asynchronous (webhook / queue)? | Different failure modes per pattern |
| I4 | What is the timeout + retry policy? Backoff strategy? Max attempts? | Resilience or thundering herd |
| I5 | How is webhook signature verified? Replay-attack protection? | Webhook spoofing |
| I6 | Idempotency-key strategy — who generates, where stored, TTL? | Duplicate operations on retry |
| I7 | What happens if the partner is down — degraded mode, queue + retry, hard error to user? | Cascading outage |
| I8 | Rate limits on the partner side — current usage vs quota? | Hitting rate-limit blocks all users |
| I9 | PII / sensitive-data scope sent to the partner — is the contract minimized? | Data leak via 3rd party |
| I10 | Versioning + deprecation policy — how do we know the partner is breaking change? | Production breakage on partner upgrade |

---

## Archetype: List/Table CRUD (item create / update / delete)

| # | Question | Why critical |
|---|----------|--------------|
| C1 | Is delete soft (flag) or hard (row gone)? Permission to undelete? | Accidental data loss |
| C2 | Required vs optional fields — server-side validation enforced regardless of UI? | Bypass via API |
| C3 | Maximum field lengths + character set (unicode, emoji, RTL)? | Truncation / encoding bugs |
| C4 | Uniqueness constraints — case-sensitive? Trimmed whitespace? | Two users register with same email + space |
| C5 | Foreign-key cascading on delete (orphan children / null-out / block)? | Orphan rows OR cascading delete surprises |
| C6 | Audit history — every edit logged, viewable by whom? | Compliance gap |
| C7 | Optimistic concurrency — last-write-wins, version field, conflict UI? | Lost updates |
| C8 | Bulk operations — all-or-nothing or partial-success? | Half-applied bulk import |
| C9 | Import / export — CSV format, header row, encoding, max size? | Excel auto-converts ID to date |
| C10 | Visibility / sharing — who else sees this record? Default sharing? | Privacy leak |

---

## Archetype: Notification / Email / Push / In-app

| # | Question | Why critical |
|---|----------|--------------|
| N1 | Which channels for this notification — email, push, in-app, SMS? Per user preference? | User missed critical alert |
| N2 | Template language — i18n keys defined? Fallback locale? | English template sent to non-English user |
| N3 | Delivery guarantees — at-most-once, at-least-once, exactly-once? Dedupe key? | Inbox spam from retries |
| N4 | Rate limits per user (digest vs immediate)? | Notification fatigue |
| N5 | Unsubscribe / preference center scope — per category or all-or-nothing? | CAN-SPAM / GDPR violation |
| N6 | Failure handling — bounce, suppression list, retry queue? | Permanent bounces consume quota |
| N7 | Sender reputation / SPF / DKIM checks in scope? | Email lands in spam folder |
| N8 | Time-of-day rules / quiet hours by user timezone? | 3 AM push wakes the user up |
| N9 | Personalization fields — what data is interpolated? Validation of interpolation? | "Hi {{firstName}}" sent literally |
| N10 | Audit — was a notification sent? Who can see this log? | Customer disputes ("I never got that") |

---

## Archetype: Permissions / Roles / RBAC

| # | Question | Why critical |
|---|----------|--------------|
| P1 | Per-AC role matrix — who can see, who can edit, who can delete? | Privilege escalation |
| P2 | Owner-vs-other rules — can user only act on own records or any in scope? | Cross-tenant leak |
| P3 | Org / tenant boundary — is the action allowed across boundaries? | Multi-tenant data leak |
| P4 | Permission inheritance — does parent role inherit child permissions? | Forgotten permission grants |
| P5 | Default permission for new role? Migration path on role rename? | Production silently broken on role-system change |
| P6 | UI affordance vs server enforcement — both required? | Button hidden in UI but API allows |
| P7 | Permission change propagation — immediate or session-based? | Revoked user can act until logout |
| P8 | Audit of permission grant / revoke? | SOX / SOC2 finding |
| P9 | Service-account / API-key permissions distinct from user permissions? | Bot exceeds intended scope |
| P10 | Permission delegation / impersonation supported? Audit thereof? | Insider abuse |

---

## Archetype: Performance / Scale

| # | Question | Why critical |
|---|----------|--------------|
| PF1 | What is the expected p95 / p99 latency budget? | Slow tail kills UX |
| PF2 | What is the expected throughput (req/s, records/s)? | Load test scope missing |
| PF3 | What is the expected dataset size in production for this entity? | Test data is 100 rows; prod is 100M |
| PF4 | Caching strategy — server, CDN, browser? Invalidation rules? | Stale data shown forever |
| PF5 | Async / background jobs — queue used, retry, dead-letter? | Failed jobs disappear |
| PF6 | Database index implications on new query? | Sequential scan in prod |
| PF7 | N+1 query risk? Eager-load strategy? | Latency cliffs |
| PF8 | Memory / CPU budget per request? | OOM under load |
| PF9 | Cold-start vs warm budgets (serverless)? | First-request latency |
| PF10 | Observability — metrics + logs + traces emitted for this endpoint? | Cannot diagnose prod incident |

---

## Archetype: Accessibility / i18n

| # | Question | Why critical |
|---|----------|--------------|
| AX1 | WCAG level target — A / AA / AAA? Per-AC? | Compliance audit failure |
| AX2 | Keyboard-only navigation path defined per interactive element? | Keyboard users blocked |
| AX3 | Screen-reader labels + ARIA roles defined? | Blind users blocked |
| AX4 | Color contrast minimum (4.5:1 text, 3:1 large)? | WCAG failure |
| AX5 | Locale fallback chain (en-GB -> en -> default)? | Missing translation lands in wrong language |
| AX6 | RTL support? Layout mirroring? | Arabic / Hebrew users broken |
| AX7 | Date / number / currency format per locale? | "1,000.00" vs "1.000,00" confusion |
| AX8 | Timezone handling — server UTC, user local, both displayed? | Calendar conflicts |
| AX9 | Plural / gender / context-aware translation? | "1 item" / "2 items" / Polish 5-form plurals |
| AX10 | Translation length expansion handling (German +30%)? | UI overflow |

---

## Gotchas

1. **Archetype overlap is normal.** Most Stories touch 2-3 archetypes. Walk each; dedupe questions.
2. **Don't ask for project-wide answers.** If `business-data-map.md` already defines the currency / state machine, cite it. PO has finite patience.
3. **Critical vs Edge classification matters.** PO triages by criticality. Putting a U3 question (success path text) into "Critical Questions for PO" alongside an A1 (auth gate) signals lack of judgment.
4. **Universal questions are not auto-included.** Walk them ONLY when the Story doesn't already answer them. The Refinement file is high-signal, not exhaustive.
5. **This catalog is evergreen.** Add new archetypes when projects discover them (`/sync-ai-memory` workflow may surface candidates).
