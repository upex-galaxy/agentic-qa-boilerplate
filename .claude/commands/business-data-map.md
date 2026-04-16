# Business Data Map Generator

Generate or update `.context/business-data-map.md` — a visual and narrative map of the system under test.

**Target**: $ARGUMENTS (project path, or leave blank for current repo)

---

## What this produces

A single document that explains **how the system works** through:
- Business entities and their relationships (WHY they exist)
- Business flows for every important feature (end-to-end trace)
- State machines and their transitions
- Automatic processes (triggers, cron jobs, webhooks)
- External integrations and their data impact

This is the **most valuable context file** in the boilerplate — every other QA skill depends on it.

---

## Sources (use ALL available)

Exhaust every source before writing. Do not rely on a single one.

| Source | What to extract | Tool |
|--------|----------------|------|
| Database schema | Tables, columns, relationships, constraints, enums | `[DB_TOOL]` — run read-only queries against `{{DB_MCP_STAGING}}` or `{{DB_MCP_LOCAL}}` |
| API endpoints | Routes, methods, payloads, auth levels | `[API_TOOL]` or read `api/openapi.json` if it exists; otherwise read route files directly |
| Backend codebase | Services, business logic, validation rules, triggers | Read `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` — focus on services, controllers, models |
| Frontend codebase | Pages, forms, user flows, state management | Read `{{FRONTEND_REPO}}/{{FRONTEND_ENTRY}}` — focus on routes, pages, forms |
| Existing context | PRD, SRS, domain glossary | `.context/PRD/`, `.context/SRS/`, `.context/PRD/business/` |
| Package dependencies | External integrations (Stripe, SendGrid, Auth0, etc.) | Read `package.json`, `requirements.txt`, `Gemfile`, etc. |

**Golden rule**: Synthesize, don't extract. The DB MCP is live — use it to UNDERSTAND the system, not to dump `information_schema` into markdown.

---

## Mode detection

```
Does .context/business-data-map.md exist?
  → NO:  CREATE mode — generate from scratch
  → YES: UPDATE mode — generate new version, show diff summary, ask
         for confirmation before overwriting. NEVER auto-overwrite.
```

---

## Exploration phases

### Phase 1 — Business entities

For each entity discovered via DB + code:
- What real-world concept does it represent?
- Why does it exist? What problem does it solve?
- How does it relate to other entities, and why?

**Do NOT list columns.** The DB MCP provides schema on demand. Document the business meaning.

### Phase 2 — Business flows

For each major feature of the system:
- Trace the complete journey: `User → API → Logic → DB → Response`
- What endpoints, services, and tables participate?
- What business rules apply?
- What side effects occur (emails, webhooks, state changes)?

**Document ALL important flows.** Do not cap at 3.

### Phase 3 — State machines

For entities with lifecycle states (pending, active, completed, cancelled...):
- Valid transitions and triggering events
- Consequences of each transition
- Business rules constraining transitions

### Phase 4 — Automatic processes

- **DB triggers**: what fires automatically on INSERT/UPDATE/DELETE?
- **Cron jobs**: what runs on a schedule?
- **Webhooks**: what external events trigger actions?

For each: why does it exist? What problem does it solve?

### Phase 5 — External integrations

For each third-party service:
- How data flows in/out
- Which business flows depend on it
- Failure behavior (what breaks if the service is down?)

---

## Output structure

Write `.context/business-data-map.md` with this structure:

1. **Visual header** — project name + short description in ASCII box
2. **Executive summary** — 2-3 paragraphs on business purpose, actors (ASCII diagram), value proposition
3. **Entity map** — ASCII relationship diagram + table (`Entity | Business Role | Why it exists`) + narrative on key relationships
4. **Business flows** — one section per flow with: ASCII flow diagram, numbered narrative, business rules, code paths involved
5. **State machines** — one section per stateful entity with: ASCII state diagram, transitions table (`From | To | Event | Effects`), business rules
6. **Automatic processes** — three tables (triggers, cron jobs, webhooks) each with "why it exists" column
7. **External integrations** — one section per service with ASCII call diagram, data impact, dependent flows
8. **Discovery gaps** — MANDATORY. List anything you could not verify from code/DB. "I could not verify X" is better than inventing an answer.

**Visual first**: use ASCII diagrams extensively. Diagrams beat paragraphs.

---

## After generation

- Update the project system prompt (`CLAUDE.md` / `AGENTS.md`) with a reference to the generated file if not already present.
- In UPDATE mode: show the diff summary and wait for explicit confirmation.
- Report: entities documented, flows traced, state machines found, integrations mapped, discovery gaps.
