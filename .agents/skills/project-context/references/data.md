# Business Data Map Generator

Generate or update the data map of `business-data-context`: `.agents/skills/business-data-context/references/business-data-map.html`, a visual and narrative map of the system under test. The file anatomy, the section contract and the incremental update are in `../../agentic-qa-core/references/business-context-maps.md` §2 and §4; this reference says WHAT goes in the sections.

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
| Database schema | Tables, columns, relationships, constraints, enums | `[DB_TOOL]` — run read-only queries against `{{DB_MCP}}` (the active env's DB MCP) |
| API endpoints | Routes, methods, payloads, auth levels | `[API_TOOL]` or read `api/openapi.json` if it exists; otherwise read route files directly |
| Backend codebase | Services, business logic, validation rules, triggers | Read `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` — focus on services, controllers, models |
| Frontend codebase | Pages, forms, user flows, state management | Read `{{FRONTEND_REPO}}/{{FRONTEND_ENTRY}}` — focus on routes, pages, forms |
| Domain vocabulary | business model, domain terms, UI label ↔ code identifier, enumerations: entity and flow names use these words | `bun run context:map business-domain-context` |
| Architecture | external services, async processing, auth flow | `bun run context:map infra-context` |
| Legacy map (input only) | a project's old `.context/business/business-data-map.md`, when present | Read it as input; cite it in `data-migrated-from` on the sections it seeded; never delete or rewrite it |
| Package dependencies | External integrations (Stripe, SendGrid, Auth0, etc.) | Read `package.json`, `requirements.txt`, `Gemfile`, etc. |

**Golden rule**: Synthesize, don't extract. The DB MCP is live — use it to UNDERSTAND the system, not to dump `information_schema` into markdown.

---

## Mode detection

```
bun run context:map business-data-context --list
  → skill folder missing:   STOP. The skill is delivered by `bun run up`
                            (or scaffolded from the boilerplate); never create it here.
  → placeholder notice:     CREATE mode — build every section from the sources.
  → a list of sections:     UPDATE mode — staleness check per section
                            (business-context-maps.md §5), regenerate ONLY the
                            stale ones, show a section-level diff, WAIT for
                            explicit approval. NEVER regenerate the whole map.
```

Before drawing the first figure, run the point-of-use check for capability `diagrams` (`../../agentic-qa-core/references/business-context-maps.md` §7).

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

Write the map as flat `<section>`s, in this order, each with a stable `id`, its `data-sources` and its `data-updated` date (anatomy: `business-context-maps.md` §2):

| Section id | Content | Figure (diagram-design type) |
|---|---|---|
| `overview` | executive summary: business purpose, actors, value proposition | one overview figure for the whole map (architecture or ER) |
| `entities` | table `Entity \| Business role \| Why it exists` + the key relationships in prose | ER / data model (split above the type's budget) |
| `entity-<slug>` | one per entity whose meaning is not obvious from the table: soft deletes, derived fields, ownership | only when a picture carries the mechanism |
| `flow-<slug>` | one per business flow: numbered narrative, business rules, code paths involved | flowchart or sequence |
| `state-<entity>` | one per stateful entity: transitions table `From \| To \| Event \| Effects`, rules | state machine |
| `automatic-processes` | three tables (DB triggers, cron jobs, webhooks), each with a "why it exists" column | none by default |
| `integration-<service>` | one per external service: data impact, dependent flows, failure behaviour | data flow when it clarifies direction |
| `discovery-gaps` | MANDATORY: everything you could not verify. "I could not verify X" beats an invented answer | none |

Every fact a figure shows is also written in the section text: the AI reads the text only (`bun run context:map`). Ids are slugs of the source name and never change after CREATE.

---

## After generation

- Verify: `bun run context:map business-data-context --list` prints every section, with the run's date on the ones written, and no placeholder notice.
- In UPDATE mode: show the section-level diff and wait for explicit confirmation before writing.
- Report: entities documented, flows traced, state machines found, integrations mapped, sections regenerated vs untouched, discovery gaps.
- The map just changed: review `business-data-context`'s `## Rules` and `references/gotchas.md` against it. A rule the new map contradicts is PROPOSED for the gotchas' "No longer true" section, never deleted.
