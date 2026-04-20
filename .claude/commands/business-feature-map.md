# Business Feature Map Generator

Generate or update `.context/mapping/business-feature-map.md` — a comprehensive inventory of every feature in the system under test.

**Target**: $ARGUMENTS (project path, module filter, or leave blank for full system)

---

## What this produces

A single document that catalogs **every feature** of the system with:
- Feature identification, status, and maturity
- CRUD matrix per entity
- API endpoint inventory grouped by domain
- UI component inventory (forms, views, actions)
- Third-party integrations and feature flags
- Feature test coverage matrix and risk assessment
- Discovery gaps (planned, WIP, undocumented features)

This is the **feature-centric** complement to `business-data-map.md` (which is data-centric). Together they provide a complete understanding of what the system does and how.

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
| Existing context | PRD, SRS, business-data-map, domain glossary | `.context/PRD/`, `.context/SRS/`, `.context/mapping/business-data-map.md`, `.context/PRD/business/` |
| Git history (recent) | Recently added or changed features | `git log --oneline -30` for activity patterns |

**Golden rule**: a feature is any **capability the system offers** — API endpoints, UI actions, background processes, integrations. If a user or system can DO it, it's a feature.

---

## Mode detection

```
Does .context/mapping/business-feature-map.md exist?
  → NO:  CREATE mode — generate from scratch
  → YES: UPDATE mode — generate new version, show diff summary, ask
         for confirmation before overwriting. NEVER auto-overwrite.
```

---

## Discovery phases

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

### Phase 5 — Cross-reference with business-data-map

If `.context/mapping/business-data-map.md` exists:
- Verify every entity in the data map has corresponding CRUD features
- Verify every business flow maps to at least one feature
- Flag entities without features (orphaned data?)
- Flag features without entities (missing persistence?)

---

## Output structure

Write `.context/mapping/business-feature-map.md` with:

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
```

### 3. CRUD matrix

```markdown
| Entity  | Create | Read | Update | Delete | Evidence     |
|---------|--------|------|--------|--------|--------------|
| User    | ✅     | ✅   | ✅     | ⚠️ Soft | api/users/  |
```

Legend: ✅ Full, ⚠️ Partial/conditional, ❌ Not available

### 4. API endpoint inventory

Grouped by domain. Each: `Method | Endpoint | Purpose | Auth`.

### 5. UI component inventory

Tables for: Forms, Dashboards/Views, Actions (modals, dialogs, confirmations).

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

- Cross-reference with `business-data-map.md` if it exists — note any mismatches.
- Update the AI memory file (`CLAUDE.md` / `AGENTS.md`) with a reference if not already present.
- In UPDATE mode: show diff summary, wait for confirmation.
- Report: total features, features by status, CRUD coverage, integrations found, discovery gaps.
