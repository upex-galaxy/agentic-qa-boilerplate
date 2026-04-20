# Master Test Plan Generator

Generate or update `.context/master-test-plan.md` — a business-derived test roadmap that answers one question: **what to test in this application, and why does it matter?**

**Target**: $ARGUMENTS (project path, module filter, or leave blank for full system)

---

## What this produces

A conversational, senior-QA-voice document that sits **on top of** `business-data-map.md` and `business-feature-map.md` and converts them into a ranked testing strategy.

The output contains:
- Executive risk map (top critical flows, ranked)
- Per-flow testing rationale (what breaks the business, what breaks user trust)
- State machines that matter (financial / legal / operational impact only)
- Silent killers — automated processes that fail without visible feedback
- External-integration failure points and acceptable degradations
- Dependency cascade between flows
- Developer-forgotten edge cases
- Priority-ordered pre-release checklist
- Explicit out-of-scope section (to stop scope creep)

This is **NOT** a flow description (→ `business-data-map.md`), a feature inventory (→ `business-feature-map.md`), nor a test case list (→ TMS via `/test-documentation`). It is the **test-strategy layer** above those maps.

---

## Sources (use ALL available)

| Source | Status | What to extract | Tool |
|--------|--------|----------------|------|
| `.context/mapping/business-data-map.md` | **HARD REQUIREMENT** | Critical flows, state machines, automatic processes, integrations, business rules | Read file |
| `.context/mapping/business-feature-map.md` | Optional — warn if missing | Feature catalog, CRUD matrix, feature flags, high-risk tags, QA relevance matrix | Read file |
| Existing context | If available | PRD, SRS, domain glossary | `.context/PRD/`, `.context/SRS/` |
| Git history | If signals needed | Recently changed modules (breakage-likelihood indicator) | `git log --oneline -90 --stat` |
| Incident / bug tracker | If helpful | Historical pain points that feed "why it matters" per flow | `[ISSUE_TRACKER_TOOL]` |

**Golden rule**: ground every priority claim in evidence from the maps. "This flow is high-risk because…" must cite either a data-map flow, a feature-map QA-relevance row, or a named external dependency. No hand-wave prioritization.

---

## Mode detection

```
Does .context/master-test-plan.md exist?
  → NO:  CREATE mode — generate from scratch.
  → YES: UPDATE mode — generate new version, show diff summary, ask
         for confirmation before overwriting. NEVER auto-overwrite.
```

---

## Discovery phases

### Phase 1 — Validation gate

#### 1.1 `business-data-map.md` check (HARD)

If `.context/mapping/business-data-map.md` does NOT exist → **STOP** with:

> This command needs `.context/mapping/business-data-map.md` to reason about risk. Run `/business-data-map` first, then re-invoke `/master-test-plan`.

Do not proceed with assumptions.

#### 1.2 `business-feature-map.md` check (SOFT)

If `.context/mapping/business-feature-map.md` does NOT exist → **WARN and proceed**. Log in §10 Discovery Gaps:

> The feature-map was not available at generation time. This plan reflects `business-data-map.md` only. Angles missed: CRUD-coverage gaps, feature-flag risk, per-feature QA-relevance tagging. Run `/business-feature-map` and re-run `/master-test-plan` for the complete picture.

#### 1.3 Read and extract

From the data-map: flows, state machines, automatic processes, external integrations, business rules.
From the feature-map (if present): high-risk features, CRUD gaps (⚠️ / ❌), feature flags, QA-coverage deficits, third-party dependencies.

### Phase 2 — Risk scoring

Apply this rubric to every flow / feature / automatic process. The rubric is **internal** — the output document shows conclusions, not the scoring table.

| Factor | H (3) | M (2) | L (1) |
|--------|-------|-------|-------|
| **Business Impact** | Revenue, legal, security, compliance | User trust, operational efficiency | Convenience, polish |
| **Breakage Likelihood** | Recent changes, complex logic, external deps, flaky history | Moderate complexity, stable integration | Simple CRUD, rarely changes |
| **Blast Radius** | Affects all users / other flows break / hard to roll back | Affects a segment / isolated | One user action, easy rollback |

Composite score = product of the three. Map:
- `≥ 18` → **CRITICAL**
- `8–17` → **HIGH**
- `3–7` → **MEDIUM**
- `< 3` → **LOW**

### Phase 3 — Dependency mapping

For every CRITICAL and HIGH item, trace which downstream flows break if it fails. This feeds §6 (cascade graph) in the output.

### Phase 4 — Silent-killer detection

Identify automatic processes (crons, webhooks, DB triggers) with **no UI feedback path**. Score their likelihood separately — even LOW-frequency silent failures are CRITICAL because they rot unnoticed.

---

## Output structure

Write `.context/master-test-plan.md` with this structure.

**Tone**: conversational, senior-QA voice, second person ("you'll want to verify…"). Assume the reader is a QA engineer onboarding to the project — guide them, don't lecture. Use the same flow names as the data-map.

**What NOT to include**: flow diagrams (live in data-map), feature catalogs (live in feature-map), test case definitions (live in TMS), payload / fixture snippets.

### 1. Visual header

ASCII box with project name + one-line intent ("What to test in this system, and why").

### 2. Executive risk map

Narrative paragraph (3–5 sentences) framing the system's most fragile areas, followed by:

```markdown
| Priority  | Flow                       | Why it matters                   | Depends on / Affects         |
|-----------|----------------------------|----------------------------------|------------------------------|
| CRITICAL  | Checkout & payment         | Revenue / fraud exposure         | Inventory, notifications     |
| HIGH      | Auth & session management  | Security, locks out every flow   | Everything gated by login    |
```

Cap at 7–10 rows. Anything below HIGH goes to §8 as a short list.

### 3. What to test first and why

One subsection per CRITICAL / HIGH flow. For each:
- **Why it matters** — business impact + what happens if it breaks (customer-facing wording, not technical)
- **What commonly breaks** — specific scenarios that historically fail or feel fragile
- **Dependencies** — flows that feed into it or consume its output
- **What an experienced QA would check** — 3–5 prose bullets, not a TC list

Prose, not code. No payloads, no fixtures.

### 4. State machines that matter

Only the state machines with financial, legal, or operational impact. Skip cosmetic states. Per machine:
- Why the transitions matter (business consequence of an illegal transition)
- Transitions most likely to be broken
- Terminal / forbidden states to guard
- How corruption would be detected — or NOT, if invisible

### 5. Silent killers — automated processes

Crons, webhooks, DB triggers that fail without visible UI feedback. Per process:
- What it does and which flow depends on it
- What breaks if it misses a run, runs twice, or runs out of order
- How failure is detected today (logs? alerts? none?)
- Recommended QA strategy (synthetic probe, log assertion, scheduled audit)

This section is usually the most undertested area of a system.

### 6. External integrations — failure points

Per third-party service (Stripe, SendGrid, Auth0, etc.):
- Which business flow stops if the service is down
- Critical timeouts and retry boundaries
- Acceptable degradation (what still works, what is hard-fail)
- Known quirks (rate limits, eventual consistency, sandbox vs prod drift)

### 7. Dependency cascade between flows

ASCII cascade graph plus narrative of the 2–3 most critical chains:

```
Checkout ──► Payment ──► Inventory ──► Notifications ──► ERP sync
    │           │            │              │               │
    └ fails here = no revenue, no stock decrement, no email, no ERP sync
```

Point is: testing flow A in isolation hides breakage that only surfaces in `A → B → C`.

### 8. Edge cases developers commonly forget

Grouped by theme, not by flow: concurrency, data limits, timezone / DST, permission boundaries, orphaned states, idempotency. For each theme, name the specific project flow most at risk.

### 9. Pre-release checklist (priority-ordered)

Short, action-oriented. No more than 15 items. Ordered CRITICAL first, then HIGH. Each line is one check phrased as "Verify X does Y under Z". No TC IDs (those live in the TMS).

### 10. What is NOT in this plan

Explicit delegation to stop scope creep:

```markdown
- Flow-level diagrams and state-machine transition tables → `.context/mapping/business-data-map.md`
- Feature catalog, CRUD matrix, feature flags → `.context/mapping/business-feature-map.md`
- API endpoint inventory / contracts → `bun run api:sync` + `/business-api-map` (when available)
- Detailed test case definitions and traceability → TMS (see `/test-documentation`)
- Sprint-level execution order → `.context/PBI/SPRINT-{N}-TESTING.md` (see `/sprint-testing`)
```

### 11. Discovery gaps

MANDATORY. List anything you could not ground in evidence:
- Flows mentioned in the data-map with no clear business owner
- Integrations without documented SLAs or failure modes
- State machines where transitions are implied by code but not documented
- If §1.2 triggered the feature-map warning, restate the limitation here

"I could not verify X" is better than inventing an answer.

---

## After generation

- Update `CLAUDE.md` / `AGENTS.md` Context System section to reference `.context/master-test-plan.md` if not present.
- In UPDATE mode: show diff summary, wait for explicit confirmation before overwriting.
- Report:
  - CRITICAL flows identified: N
  - HIGH flows identified: N
  - Silent killers flagged: N
  - Integration failure points mapped: N
  - Discovery gaps open: N
- If §1.2 warned, remind the user to run `/business-feature-map` and re-run this command.
