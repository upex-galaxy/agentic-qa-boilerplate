# Phase 2 — PRD Discovery

Produce the Product Requirements Documents by reading the code, not by interviewing stakeholders. Four docs, produced in order. Each one builds on the previous.

```
1. Executive Summary     -> .context/PRD/executive-summary.md
2. User Personas         -> .context/PRD/user-personas.md
3. User Journeys         -> .context/PRD/user-journeys.md
4. Feature Inventory     -> .context/PRD/feature-inventory.md
```

Prereqs (from Phase 1): `.context/idea/business-model.md` and `.context/idea/domain-glossary.md` must exist. Personas link to roles already identified in the glossary; journeys link to features already identified in the business model.

**Mindset**: product discovery, not product creation. Every claim cites a code or doc source. Aspirational language ("will eventually support") belongs in Discovery Gaps, not in the doc body.

---

## 1. Executive Summary

Entry point for anyone learning the product. Must fit in one read.

### Discovery commands

```bash
# Problem + solution
head -80 <repo-root>/README.md
grep -rE "hero|tagline|headline" --include="*.tsx" <repo-root>/src | head -20
cat <repo-root>/src/app/page.tsx <repo-root>/src/pages/index.tsx 2>/dev/null | head -100

# Core features -- navigation + API surface
grep -rE "path\s*:\s*['\"]|href=" --include="*.tsx" <repo-root>/src/components/nav* <repo-root>/src/app/layout* 2>/dev/null
ls <repo-root>/src/app/api <repo-root>/src/pages/api <repo-root>/src/routes 2>/dev/null

# Metrics -- analytics + monitoring
grep -rE "analytics|track|event|metric" --include="*.ts" --include="*.tsx" <repo-root>/src | head -20
grep -E "sentry|datadog|newrelic|prometheus|posthog|amplitude|mixpanel" <repo-root>/package.json

# Target users (feed from Phase 1 glossary + auth code)
grep -rE "role|userType|permission" --include="*.ts" <repo-root>/src/auth <repo-root>/src/middleware 2>/dev/null
```

### Required sections in `.context/PRD/executive-summary.md`

1. **Problem Statement** -- The Challenge (2-3 paragraphs with source quotes) + Current Alternatives (if discoverable).
2. **Solution Overview**
   - Product Vision (one sentence)
   - Core Capabilities table: `# | Feature | Problem Addressed | Evidence (route or component)`
   - Key Differentiators
3. **Success Metrics**
   - Tracked Metrics: `Metric | Type (Adoption/Engagement/Revenue) | Implementation | Source`
   - Inferred KPIs (from features, not real tracking)
   - Unknown Metrics (gaps)
4. **Target Users** -- brief for each persona: System Role + Need + Evidence. Detailed personas go in the next doc.
5. **Product Scope**
   - What's Included (current capabilities)
   - What's Not Included (known limitations)
   - Future Indicators (TODO comments, feature flags, roadmap files)
6. **Discovery Gaps** -- table `Gap | Impact | Suggested Source`.
7. **QA Relevance** -- Critical Testing Areas + Risk Areas.
8. **Document References** -- list of sibling PRD/SRS docs with status.

### Quality rules

- 5 core features max. More than that and the summary becomes useless.
- Tracked Metrics must show the real `track()` / `analytics.event()` call site -- if you only found the SDK import but no usage, it goes under Inferred KPIs.
- Key Differentiators requires real marketing copy or an obvious code mechanism (e.g., "only product that serves X format"). Inventing a differentiator disqualifies the doc.

---

## 2. User Personas

### Mindset

**In existing products, personas are defined by the code, not by research.** The users you document are the roles the system already recognizes. Do not invent demographic personas; extract system roles and map them to goals that match the permissions they have.

### Discovery commands

```bash
# Role definitions
grep -rE "enum\s+\w*Role|type\s+\w*Role|const\s+[A-Z_]*ROLE" --include="*.ts" <repo-root>/src
grep -rE "hasPermission|canAccess|isAdmin|isOwner|requireAuth" --include="*.ts" <repo-root>/src

# DB role column
grep -A20 "model User" <repo-root>/prisma/schema.prisma 2>/dev/null
grep -rE "role|userType|accountType" <repo-root>/prisma/schema.prisma <repo-root>/drizzle/schema.ts 2>/dev/null

# Middleware / guards
grep -rE "middleware|guard|protect|requireRole" --include="*.ts" <repo-root>/src/middleware <repo-root>/src/guards 2>/dev/null

# Role-based UI rendering
grep -rE "role\s*===|isAdmin|canEdit|hasAccess" --include="*.tsx" <repo-root>/src/components

# Role-specific pages
ls <repo-root>/src/app/admin <repo-root>/src/app/dashboard <repo-root>/src/pages/admin 2>/dev/null

# User profile fields (for attribute discovery)
grep -rE "profile|account|UserProfile|AccountInfo" --include="*.tsx" <repo-root>/src/components | head -20
grep -rE "signup|register" --include="*.tsx" <repo-root>/src | head -20
```

### Required sections in `.context/PRD/user-personas.md`

1. **Persona Discovery Summary** -- single overview table: `Persona | System Role | Access Level | Primary Goal`.
2. **Persona N** (one subsection each; 2-4 personas is typical; do not force a fifth):
   - Identity: System Role (`role_value`) + Evidence file + Access Level + Estimated % of Users.
   - Goals (Inferred from Features): `Goal | Supporting Feature | Route/Component`.
   - Pain Points (Inferred from Validation/Errors): `Pain Point | Evidence` (quote the exact error message).
   - Feature Access: `Feature | Access (Full/Limited/None) | Evidence`.
   - User Journey Summary (one-line ASCII flow).
   - Profile Attributes (from User model schema).
   - Representative Quote (inferred, flagged as such).
3. **Role Hierarchy** -- Mermaid `graph TD` if hierarchy exists.
4. **Permission Matrix** -- `Permission | Role1 | Role2 | Role3 | Role4` with check/cross per cell.
5. **Discovery Gaps** -- `Gap | Why It Matters | Question to Ask`.
6. **QA Relevance**
   - Test Account Requirements: `Persona | Test Account | Permissions Needed`.
   - Critical Persona Flows to Test.
   - Edge Cases by Persona.

### Quality rules

- Fewer is better. Two clean personas beat five speculative ones.
- "Representative Quote" is always flagged "(inferred)" -- it is an illustration, not a datapoint.
- Test Account Requirements must map to `.env` keys (`LOCAL_<ROLE>_EMAIL` / `STAGING_<ROLE>_EMAIL`) when such users exist. If not, flag them as needing creation.

---

## 3. User Journeys

### Mindset

Routes are journey steps. Redirects are transitions. Form submit handlers reveal the next step. Map what the user can actually do, then overlay the personas on each journey.

### Discovery commands

```bash
# Route structure
# Next.js App Router:
find <repo-root>/src/app -name "page.tsx" -o -name "page.ts" | sort
find <repo-root>/src/app -name "layout.tsx"
find <repo-root>/src/app -type d -name "\[*\]"       # dynamic segments

# Next.js Pages Router:
find <repo-root>/src/pages -name "*.tsx" -o -name "*.ts" | grep -v "_app\|_document\|api" | sort

# React Router:
grep -rE "<Route\b" --include="*.tsx" <repo-root>/src

# Navigation components
find <repo-root>/src/components -iname "*nav*" -o -iname "*menu*" -o -iname "*sidebar*"
grep -rE "href=|to=" --include="*.tsx" <repo-root>/src/components/layout <repo-root>/src/components/header 2>/dev/null | head -40

# Conditional nav (role-based)
grep -rE "role.*&&|isAdmin.*&&|can.*&&" --include="*.tsx" <repo-root>/src/components

# Multi-step flows
grep -rE "step|wizard|stepper|progress" --include="*.tsx" <repo-root>/src/components
grep -rE "onSubmit.*next|handleNext" --include="*.tsx" <repo-root>/src

# Redirect patterns
grep -rE "redirect\(|router\.(push|replace)" --include="*.ts" --include="*.tsx" <repo-root>/src | head -40
```

### Required sections in `.context/PRD/user-journeys.md`

1. **Route Map** -- three tables:
   - Public Routes (Unauthenticated): `Route | Page | Purpose`.
   - Protected Routes (Authenticated): `Route | Page | Requires (role) | Purpose`.
   - Dynamic Routes: `Pattern | Example | Purpose`.
2. **Journey N** (one per critical flow; 3-5 journeys is ideal):
   - Persona + Goal + Discovered From.
   - Flow Diagram (Mermaid `journey` or `flowchart LR`).
   - Step-by-Step Flow: `Step | Page | Action | Next | Evidence (file:line)`.
   - Error Paths: `Error | Handling | Evidence`.
   - Success Criteria checklist.
3. **Navigation Structure** -- Mermaid `graph LR` grouping Public / Authenticated / Admin subgraphs.
4. **Breadcrumb Patterns** -- `Path | Breadcrumb`.
5. **Critical Paths**
   - Happy Paths (Must Work): `Journey | Start | End | Business Impact`.
   - Unhappy Paths (Must Handle): `Scenario | Expected Behavior | Evidence`.
6. **Discovery Gaps** -- `Flow | Unknown | Question`.
7. **QA Relevance**
   - Critical E2E Test Scenarios: `Priority (P0/P1/P2) | Scenario | Journey Reference`.
   - Suggested Test Data: `Journey | Test User | Prerequisites`.

### Quality rules

- 3-5 journeys is the right number. Fewer means low coverage; more means you are listing every form, not every journey.
- Always include error paths. Happy paths without their unhappy counterparts are incomplete.
- "Evidence" column is required in Step-by-Step Flow. If you cannot cite a file, the step is a guess.
- Do not map journey steps that require user input you have not received (e.g., OTP or 2FA) without flagging them as external-dependency steps.

---

## 4. Feature Inventory

Comprehensive catalog. Later consumed by `test-documentation` for coverage mapping and by `test-automation` for scope selection.

### Discovery commands

```bash
# API endpoints (feature per endpoint)
find <repo-root>/src/app/api -name "route.ts" | sort        # Next.js App Router
find <repo-root>/src/pages/api -name "*.ts" | sort           # Next.js Pages Router
grep -rE "@(Get|Post|Put|Patch|Delete)\(|app\.(get|post|put|patch|delete)\(|router\.(get|post|put|patch|delete)\(" --include="*.ts" <repo-root>/src
cat <repo-root>/openapi.yaml <repo-root>/swagger.json 2>/dev/null

# Group by resource
find <repo-root>/src/app/api -name "route.ts" -exec dirname {} \; | sort -u

# UI feature components
ls <repo-root>/src/components/features <repo-root>/src/features 2>/dev/null
find <repo-root>/src -iname "*Form*.tsx" | head -30
find <repo-root>/src -iname "*Modal*.tsx" -o -iname "*Dialog*.tsx" | head -30

# Feature flags
grep -rE "FEATURE_|featureFlag|isEnabled\(|useFeature" --include="*.ts" <repo-root>/src | head -30
grep -rE "process\.env\.(NEXT_PUBLIC_)?FEATURE_" --include="*.ts" <repo-root>/src | head -20

# Integrations (from deps)
cat <repo-root>/package.json | jq '.dependencies + .devDependencies | keys[]' | grep -E "stripe|twilio|sendgrid|mailgun|auth0|firebase|aws-sdk|@aws|supabase|clerk|algolia"
```

### Required sections in `.context/PRD/feature-inventory.md`

1. **Inventory Summary** -- `Category | Features (count) | Status (Stable/Beta/Planned)`.
2. **Feature Catalog** grouped by Category (use the domain areas from the glossary). Each feature:
   - ID (`FEAT-NNN`), Status (Stable / Beta / Planned), Endpoints, UI Components, User Types, Dependencies, Evidence (code path).
   - Capabilities checklist (done / partial / not-implemented).
3. **CRUD Matrix** -- one row per entity, columns Create / Read / Update / Delete. Use `Full / Partial / None` markers. Soft-delete is Partial.
4. **API Endpoint Inventory** -- one table per resource path, columns `Method | Endpoint | Purpose | Auth Required`.
5. **UI Component Inventory** -- two tables:
   - Forms: `Component | Purpose | Route | Features`.
   - Dashboards/Views: `Component | Purpose | Route | Data Source`.
6. **Third-Party Integrations** -- summary table (`Service | Purpose | Package | Status`) and then one subsection per active integration with aspects + endpoints used.
7. **Feature Flags** -- `Flag | Description | Default | Environment`.
8. **Planned/WIP Features** -- `Feature | Evidence (TODO comment, disabled flag, empty handler) | Estimated Status`.
9. **Discovery Gaps**.
10. **QA Relevance**
    - Feature Test Coverage Matrix: `Feature ID | Unit | Integration | E2E | Status`.
    - High-Risk Features (Prioritize Testing): `Feature | Risk Factor | Reason`.

### Quality rules

- Feature IDs are stable (`FEAT-NNN`). Once assigned, do not renumber in future regenerations -- consumers depend on them.
- CRUD Matrix entries must match real endpoints. `DELETE /users/:id` returning 403 for non-admins is still `Full` if admins can do it; add a note.
- Third-Party Integrations: require a real call site, not just a dependency import. `@sentry/nextjs` in `package.json` alone does not prove Sentry is integrated -- look for `Sentry.init(...)`.
- "Beta" vs "Stable" comes from: explicit feature flag + staging-only default = Beta; shipped-by-default = Stable.

---

## Phase 2 — PRD exit gate

Before moving to the SRS half of Phase 2:

- [ ] `.context/PRD/executive-summary.md` exists, 5-or-fewer core capabilities, every row has evidence.
- [ ] `.context/PRD/user-personas.md` exists, 2-4 personas, Permission Matrix filled in, test-account mapping to `.env` complete.
- [ ] `.context/PRD/user-journeys.md` exists, Route Map has all three tables filled in, 3-5 journeys each with Evidence column populated, error paths included.
- [ ] `.context/PRD/feature-inventory.md` exists, CRUD matrix complete for every core entity in the glossary, FEAT-NNN IDs assigned.
- [ ] All four docs include a Discovery Gaps section.
- [ ] `## Phase 2 Progress - PRD` block present in `CLAUDE.md`, checkmarks on all four PRD files.

Proceed to `phase-2-srs.md` once the gate is met.

---

## Phase 2 — PRD gotchas

- **PRDs are discovery, not creation.** Do not re-scope the product. Describe what it does today; aspirational content goes in Discovery Gaps.
- **Personas = roles.** In existing systems, personas are the roles the authorization code recognizes. Do not invent "Sarah the busy marketer" -- document "admin", "editor", "viewer" with their actual permissions.
- **Journeys need step-level evidence.** Every step row needs a file path. If you cannot cite a file for a step, the step does not exist in the code; it is either a guess or a future feature -- flag accordingly.
- **Feature IDs are load-bearing.** Once assigned (`FEAT-001`, `FEAT-002`, ...), they are referenced from test plans, test cases, and bug reports downstream. Never renumber on regeneration.
- **CRUD matrix checks schema-level, not endpoint-level.** If only admins can DELETE, it is still Full (admin role exists). But if there is no DELETE handler at all, it is None. A soft-delete column (`deletedAt`) plus no DELETE endpoint = Partial.
- **Third-party integration requires a call site.** Presence in `package.json` is necessary but not sufficient; find `.init()`, `new Client()`, or a real service wrapper.
- **Feature flags must declare their default.** A flag with no default in config is an unresolved risk and belongs in Discovery Gaps.
- **Happy paths without error paths are incomplete.** Refuse to ship a journey doc that lists only the success flow. Error handling is half the behavior.
- **Breadcrumb patterns reveal hierarchy.** If a project uses breadcrumbs, their patterns are the canonical nesting model -- prefer them over navigation group names.
