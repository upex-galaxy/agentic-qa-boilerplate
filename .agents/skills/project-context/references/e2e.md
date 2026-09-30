# Business E2E Map Generator (mode `e2e`, synonym `features`)

Generate or update the E2E map of `business-e2e-context`: `.agents/skills/business-e2e-context/references/business-e2e-map.html`, how people use the system under test end to end: **the user journeys first**, then the feature catalog those journeys cross. The file anatomy, the section contract and the incremental update are in `../../agentic-qa-core/references/business-context-maps.md` §2 and §4; this reference says WHAT goes in the sections. `features` and the old output name `business-feature-map` route here as synonyms.

**Target**: $ARGUMENTS (project path, module filter, or leave blank for full system)

---

## What this produces

A single map, journeys first:
- Personas: who uses the product and what each one is trying to get done
- User journeys: entry point, steps, branches, where money or data changes hands, where each one can fail
- Cross-feature flows that only make sense across several features

Then the catalog those journeys cross, with:
- Feature identification, status, and maturity
- Per feature, its testable rules: preconditions, business rules, validations, user-visible state transitions
- CRUD matrix per entity
- API endpoint inventory grouped by domain
- UI component inventory (forms, views, actions)
- Third-party integrations and feature flags
- Feature test coverage matrix and risk assessment
- Discovery gaps (planned, WIP, undocumented features)

This is the **journey-centric** complement to `business-data-context` (data-centric) and `business-api-context` (API-centric). Together they explain what the system does, for whom, and how.

---

## Sources (use ALL available)

Exhaust every source. Do not rely on code alone — cross-reference with DB, API, and existing docs.

| Source | What to extract | Tool |
|--------|----------------|------|
| API routes / endpoints | Features exposed via HTTP — each endpoint is a capability | Read route files or `api/openapi.json`; use `[API_TOOL]` if available |
| Frontend routes + pages | User-facing features — each page/form is a user operation | Read `{{FRONTEND_REPO}}/{{FRONTEND_ENTRY}}` — focus on routes, pages, forms, modals, dashboards |
| Database schema | Entities that back features — CRUD capabilities per entity | `[DB_TOOL]` — read-only queries for table structure and relationships |
| Backend services | Business logic, validation, processing | Read `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` — focus on services, controllers, handlers |
| Package dependencies | Third-party integrations (payments, email, auth, analytics) | Read `package.json`, `requirements.txt`, `Gemfile`, etc. |
| Feature flags / env vars | Disabled or experimental features | Grep for `FEATURE_`, `isEnabled`, `feature.*flag` in codebase and `.env.example` |
| Domain vocabulary | business terms, UI label ↔ code identifier, enumerations: persona, journey and feature names use these words | `bun run context:map business-domain-context` (a placeholder notice = no map yet: record a Discovery Gap) |
| Sibling maps | entities and flows; endpoint groups and auth | `bun run context:map business-data-context`, `bun run context:map business-api-context` |
| Legacy files (input only) | the `legacy` list of `business-e2e-context` in `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`): an old feature map, PRD personas and journeys, SRS functional specs, whichever a project still holds | Read each as input; cite it in `data-migrated-from` on the sections it seeded; never delete or rewrite it |
| Git history (recent) | Recently added or changed features | `git log --oneline -30` for activity patterns |

**Golden rule**: a journey is what a person DOES to reach an outcome; a feature is any **capability the system offers** (API endpoints, UI actions, background processes, integrations). Journeys come first because a story is tested inside the journey that reaches it.

---

## Mode detection

```
bun run context:map business-e2e-context --list
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

## Discovery phases

### Phase 0 — Personas and journeys (first, and the heart of the map)

**Personas are the roles the code recognizes**, not researched demographics. Document `admin`, `editor`, `viewer` with their real permissions, never an invented "Sarah the busy marketer". Two clean personas beat five speculative ones.

- Find the roles: role enums and types, the role column on the user model, auth guards and middleware (`requireRole`, `hasPermission`, `isAdmin`), role-conditional UI (`role === ...`, `isAdmin && ...`), role-specific route trees (`/admin`, `/dashboard`).
- One persona per distinct goal and permission level. Per persona: the system role value and its evidence path, goals inferred from the features it can reach, pain points inferred from the validation and error messages it can hit (quote the message), and the test-account key it needs (`<ENV>_<ROLE>_EMAIL` in `.env`; a role with no test user is flagged as needing one).
- Role hierarchy and a permission matrix (`Permission | Role1 | Role2 | ...`) go in `overview`; each `persona-<slug>` carries its own row of it.

**Journeys are traced through routes**: routes are steps, redirects are transitions, a form's submit handler reveals the next step.

- Build the route map first (public, protected with the role each requires, dynamic segments): route files or the router config, navigation components (conditional nav included), multi-step flows (`wizard`, `stepper`), `redirect(` / `router.push` calls. It lands in `ui-inventory` (§5).
- For each persona, which journeys reach its outcomes? Trace each from its entry point (landing, deep link, email, webhook) through every page and API call to the outcome. Every step cites a file; a step you cannot cite is a guess or a future feature, so it goes to `discovery-gaps`.
- Per journey: the branches (validation failure, payment declined, permission denied), the step where money or data changes hands, and the steps where it can fail silently. A journey with no error path is incomplete.
- A step that needs input the session cannot produce (OTP, 2FA, a third-party redirect, a CAPTCHA) is flagged as an external-dependency step, never traced as if it were automatable.
- Critical paths: the happy paths that must work (start, end, business impact) and the unhappy paths that must be handled (scenario, expected behavior, evidence). Aim for the few journeys that carry the product, not one per form.
- Rank journeys by business risk (revenue, security, core value, blast radius). The top ones get a figure.

Do NOT invent journeys: each one needs evidence (routes, pages, a legacy journey doc, a real session). Unverified steps go to `discovery-gaps`.

### Phase 1 — API-based feature discovery

For each API route/endpoint found:
- HTTP method + path + purpose
- Auth requirement (public, authenticated, admin)
- Request/response shape (brief — don't dump full schemas)
- Which entity/domain it belongs to

Group endpoints by domain (users, products, orders, payments, etc.).

### Phase 2 — UI feature discovery

For each page, form, modal, dashboard found:
- What user action does it enable?
- What data does it display or collect?
- Which API endpoints does it call?
- Which user roles can access it?

Look for: form components, modal/dialog components, dashboard widgets, table/list views, action buttons.

### Phase 3 — Integration discovery

For each third-party service found in dependencies:
- What feature does it enable? (payments, email, auth, storage, monitoring)
- Which endpoints/UI components use it?
- Is it active, disabled, or planned?

### Phase 4 — Feature flag and WIP discovery

Scan for:
- Environment variables with `FEATURE_`, `ENABLE_`, `BETA_` prefixes
- Code comments with `TODO`, `FIXME`, `WIP`, `HACK`
- Empty or stub route handlers (planned features)
- Disabled feature flags

### Phase 5 — Cross-reference with the data map

If `business-data-context` holds a generated map:
- Verify every entity in the data map has corresponding CRUD features
- Verify every business flow maps to at least one feature
- Flag entities without features (orphaned data?)
- Flag features without entities (missing persistence?)

---

## Output structure

Write the map as flat `<section>`s, in this order, each with a stable `id`, its `data-sources` and its `data-updated` date (anatomy: `business-context-maps.md` §2):

| Section id | Content | Figure (diagram-design type) |
|---|---|---|
| `overview` | who uses the product, role hierarchy and permission matrix, the top journeys in one paragraph each | one overview figure (user journey or swimlane) |
| `persona-<slug>` | one per persona: system role + evidence, goals, pain points, permissions, test-account key, the journeys it takes | none by default |
| `journey-<slug>` | one per journey: entry point, numbered steps, branches, failure points, the data and API behind each step as pointers to `business-data-context` / `business-api-context` section ids | user journey, swimlane or sequence, for the top-risk journeys |
| `cross-feature-<slug>` | a flow that spans several features | flowchart or swimlane when it clarifies handoffs |
| `inventory` | §1 below | none |
| `feature-<domain>` | §2 below, one section per domain | none by default |
| `crud-matrix`, `ui-inventory`, `integrations`, `flags-wip`, `qa-relevance` | §3 and §5-§8 below | none |
| `discovery-gaps` | §9 below, MANDATORY | none |

The API endpoint inventory (§4 below) stays a pointer section: endpoint groups live in `business-api-context`. Every fact a figure shows is also written in the section text: the AI reads the text only (`bun run context:map`). The tables below describe section CONTENT; render them as HTML tables.

### 1. Inventory summary

```markdown
| Category   | Features | Status         |
|------------|----------|----------------|
| Core       | [count]  | Stable         |
| Secondary  | [count]  | Stable         |
| Beta       | [count]  | Testing        |
| Planned    | [count]  | In Development |
```

### 2. Feature catalog (by domain)

One section per domain. Each feature:

```markdown
#### Feature: [Name]

| Aspect        | Value                      |
|---------------|----------------------------|
| **ID**        | FEAT-NNN                   |
| **Status**    | Stable / Beta / Planned    |
| **Endpoints** | [list]                     |
| **UI**        | [components/pages]         |
| **Users**     | [who can use it]           |
| **Dependencies** | [services, integrations] |
| **Evidence**  | [code path]                |

**Capabilities:**
- [x] Implemented capability
- [ ] Missing or planned capability

**Rules:**
| ID | Kind | Rule | Evidence |
|----|------|------|----------|
| BR-NNN | precondition / business rule / validation / transition | [one testable sentence] | [code path] |
```

The rules table is where functional specification lives, condensed. Derive it from the code, one row per testable statement:

- **Preconditions**: what must be true before the feature can run (role, prior state, a flag, an existing record).
- **Business rules**: service methods are requirements; every `throw` in a service is a scenario and every non-trivial branch a rule. Stable `BR-NNN` IDs across regenerations: downstream tests cite them.
- **Validations**: literal constraints from the schemas (`.min(8)`, `.email()`, `CHECK`, `UNIQUE`, `NOT NULL`, enum columns), each with the error message the user sees. Each one is a boundary to test. Frontend and backend schemas that disagree are both recorded; the backend is canonical and the drift is a gap.
- **Transitions**: the state changes the feature causes, as seen from the user (from, to, trigger, guard). The state machine itself lives in `business-data-context`: point to its section id, never redraw it here. Transitions blocked by DB triggers or row-level policies count, and they are invisible in the service code.

### 3. CRUD matrix

```markdown
| Entity  | Create | Read | Update | Delete | Evidence     |
|---------|--------|------|--------|--------|--------------|
| User    | ✅     | ✅   | ✅     | ⚠️ Soft | api/users/  |
```

Legend: ✅ Full, ⚠️ Partial/conditional, ❌ Not available

### 4. API endpoint inventory

A pointer per domain to the matching `business-api-context` section id. Do not restate endpoints here.

### 5. UI component inventory

Tables for: Routes (public `Route | Page | Purpose`, protected `Route | Page | Requires | Purpose`, dynamic `Pattern | Example | Purpose`), Forms, Dashboards/Views, Actions (modals, dialogs, confirmations).

### 6. Third-party integrations

Table: `Service | Purpose | Package | Status | Features using it`.

### 7. Feature flags and WIP

Table: `Flag | Description | Default | Environment`.
Table: `Planned feature | Evidence (TODOs, stubs) | Estimated status`.

### 8. QA relevance

**Feature test coverage matrix:**
```markdown
| Feature ID | Unit | Integration | E2E | Status      |
|------------|------|-------------|-----|-------------|
| FEAT-001   | ✅   | ✅          | ⚠️  | Needs E2E   |
```

**High-risk features** (prioritize testing):
```markdown
| Feature  | Risk   | Reason                    |
|----------|--------|---------------------------|
| Payments | HIGH   | Revenue impact             |
| Auth     | HIGH   | Security                   |
```

### 9. Discovery gaps

MANDATORY. List features that:
- Could not be verified from code
- Appear partially implemented
- Have unclear ownership or purpose
- Need team clarification

---

## After generation

- Cross-reference with the data and API maps when they are generated: note any mismatch in `discovery-gaps`.
- Verify: `bun run context:map business-e2e-context --list` prints every section, with the run's date on the ones written, and no placeholder notice.
- In UPDATE mode: show the section-level diff and wait for explicit confirmation before writing.
- Report: personas, journeys traced, features by status, CRUD coverage, integrations found, sections regenerated vs untouched, discovery gaps.
- The map just changed: review `business-e2e-context`'s `## Rules` and `references/gotchas.md` against it. A rule the new map contradicts is PROPOSED for the gotchas' "No longer true" section, never deleted.
