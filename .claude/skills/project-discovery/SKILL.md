---
name: project-discovery
description: Onboard a project to this testing boilerplate, generate the context files that every QA and automation session depends on, and adapt the KATA test architecture to the target stack. Runs a 4-phase discovery (Constitution, Architecture, Infrastructure, Specification) that produces PRD, SRS, domain glossary, business-data-map, api-architecture, and test-ready fixtures. Use when the user says "set up this project", "onboard this repo", "connect to project", "discover the architecture", "generate business-data-map", "regenerate api-architecture", "create PRD/SRS", "adapt KATA to this project", or "set up testing framework". Also use when .context/business-data-map.md or .context/api-architecture.md is missing or stale. Do NOT use for writing tests (test-automation), documenting TCs (test-documentation), running suites (regression-testing), or testing a ticket (sprint-testing).
license: MIT
compatibility: claude-code, copilot, cursor, codex, opencode
---

# Project Discovery — Onboarding Orchestrator

Turn an unknown codebase into a testable project. Four phases, always in order, gated on completion of the previous one. The output is a set of context files the rest of the skills (`sprint-testing`, `test-automation`, `test-documentation`, `regression-testing`) rely on.

The discovery is **conversational**: you read the code, ask when ambiguous, confirm before writing files. Never fabricate -- if you cannot verify a claim from the source, mark it as a "Discovery Gap" and move on.

Grounding methodology: **IQL (Integrated Quality Lifecycle)** -- QA is continuous from requirement to release, not a gate at the end. Phase 1-2 outputs correspond to IQL Steps 1-4 (Early Game), Phase 3-4 to Steps 5-10 (Mid Game). Read `references/iql-methodology.md` only if the user asks what IQL is or why the discovery is structured this way.

---

## Pick the scope first

All projects go through the same 4 phases, but depth varies. Pick once, then follow the common pipeline.

| Scenario | Input | Phases to run | Typical depth |
|----------|-------|---------------|---------------|
| **Fresh onboarding** (greenfield or unseen project) | Repo URL or local path(s), no existing context files | 1 -> 2 -> 3 -> 4 -> Setup | Full. All docs generated. |
| **Boilerplate adoption** (this repo adopted for a new project) | Target app repo(s), this repo as the test framework | 1 (project-connection) -> 3 -> Setup -> Context generators | Skip 2+4 if PRD/SRS already exist upstream; always run Setup to adapt KATA. |
| **Brownfield** (project already documented, tests missing) | Existing `.context/` partially filled | 2 (gaps) -> 3 (gaps) -> Setup -> Context generators | Targeted. Only regenerate what's missing/stale. |
| **Context refresh** | User says "regenerate business-data-map" or "api-architecture is outdated" | Context generators only | One-file refresh. Confirm diffs before overwriting. |
| **KATA adaptation only** | Stack changed (new auth, new API framework) | Setup only | Read current `tests/` + new source, update KATA components. |

Default to "Fresh onboarding" when in doubt. Confirm the scope with the user before starting Phase 1.

---

## Workflow — the 4-phase pipeline

```
Phase 1: Constitution        -> Phase 2: Architecture       -> Phase 3: Infrastructure    -> Phase 4: Specification
(who/what/why)                 (PRD + SRS)                    (backend/frontend/infra)       (PBI mapping)
                |                      |                              |                              |
   .context/PRD/business/        .context/PRD/*.md           .context/infrastructure/*.md     .context/PBI/backlog.md
   business-model.md            .context/SRS/*.md                                             templates/*.md
   domain-glossary.md
   project-config.md

                                                 |
                                                 v
                                    Setup: KATA Adaptation + Context Generators
                                    (.context/business-data-map.md, api-architecture.md,
                                     project-test-guide.md, tests/components/**)
```

Each phase has a **completion gate**: before moving on, the required output files must exist on disk with non-placeholder content. Ask the user to confirm after each phase; never auto-chain.

### Phase 1 — Constitution (who, what, why)

**Goal**: make the project legible. Outputs are read by every future session.

Four sub-steps, in order:

1. **Project Connection** -- repo paths, tech stack detection, environment URLs, credentials from `.env`, team contacts.
2. **Project Assessment** -- current testing maturity (frameworks in place, CI presence, lint/typecheck, coverage). Produces a risk profile.
3. **Business Model Discovery** -- problem statement, target users, value proposition, revenue model (if any). Business Model Canvas recommended.
4. **Domain Glossary** -- core entities, relationships, state machines, enumerations, UI-label vs code-identifier mapping.

**Completion gate**: `.context/PRD/business/business-model.md`, `.context/PRD/business/domain-glossary.md`, `.context/project-config.md` all exist and are non-empty.

Read `references/phase-1-constitution.md` when running any Phase 1 sub-step. Contains the discovery process, stack-detection commands, required output sections, and quality checklists.

### Phase 2 — Architecture (PRD + SRS)

**Goal**: produce the Product and Software Requirements docs from code (not the other way round -- that is the "creation" direction, this is the "discovery" direction).

PRD sub-steps (can run in parallel):
1. **Executive Summary** -- problem, solution, success metrics, scope.
2. **User Personas** -- roles, permissions, primary/secondary users, role hierarchy.
3. **User Journeys** -- critical paths through the UI, route map, journey diagrams.
4. **Feature Inventory** -- every feature with a description, route, state (shipped/in-progress), and owner.

SRS sub-steps (can run in parallel after PRD):
1. **Architecture Specs** -- C4 context and container diagrams, component structure, database schema, external services, security model.
2. **API Contracts** -- endpoints grouped by auth level (Public / Protected / Admin / Owner), request/response shapes, auth flow.
3. **Functional Specs** -- FR-N entries with preconditions, business rules, validations, state machines.
4. **Non-Functional Specs** -- performance budgets, security posture, reliability (RTO/RPO), scalability, observability, compliance.

**Completion gate**: `.context/PRD/executive-summary.md`, `user-personas.md`, `user-journeys.md`, `feature-inventory.md`, `.context/SRS/architecture.md`, `api-contracts.md`, `functional-specs.md`, `non-functional-specs.md` all exist.

Read `references/phase-2-prd.md` when working on any PRD doc. Read `references/phase-2-srs.md` when working on any SRS doc. They are independent -- do not load both unless you are straddling both sides.

### Phase 3 — Infrastructure

**Goal**: make the project runnable and deployable for the test environment.

Three sub-steps:
1. **Backend Discovery** -- language, framework, database, ORM, auth, dependency manager, run/test commands, migrations, env vars.
2. **Frontend Discovery** -- framework, bundler, routing, state management, design system, component library, test IDs strategy.
3. **Infrastructure Mapping** -- CI/CD providers, deployment targets, environments (dev/staging/prod), infra-as-code, monitoring, rollback procedure.

**Completion gate**: `.context/infrastructure/backend.md`, `frontend.md`, `infrastructure.md` all exist with the key facts (auth flow, test commands, deploy URLs) filled in.

Read `references/phase-3-infrastructure.md` when running any Phase 3 sub-step. Contains framework-detection heuristics, required sections per artifact, and common gotchas (SSR vs CSR, edge vs serverless, monorepo vs split repos).

### Phase 4 — Specification (Backlog mapping)

**Goal**: hook the testing framework into the team's issue tracker without duplicating content.

Two sub-steps:
1. **PBI Backlog Mapping** -- connect to `{{ISSUE_TRACKER}}` via `[ISSUE_TRACKER_TOOL]`, discover project key, map hierarchy (Epic/Story/Task/Bug), record queries used to fetch tickets.
2. **PBI Story Template** -- produce the local templates (`.context/PBI/templates/user-story.md`, `bug.md`, `test-plan.md`, `test-case.md`) that future `sprint-testing` runs will fill, one file per ticket.

**Completion gate**: `.context/PBI/backlog.md` exists with project key + auth recipe; `.context/PBI/templates/*.md` exist.

Read `references/phase-4-specification.md` when running Phase 4. Contains issue-tracker connection recipes, query conventions, and the full template set.

### Setup — KATA Adaptation

Runs after Phase 3 is complete. Adapts this repo's KATA layers (TestContext, ApiBase, UiBase, TestFixture) to the target project's stack.

Two sub-phases, in strict order:
1. **Analysis + Plan** -- read `tests/components/**`, read target auth flow, decide OpenAPI source (URL vs file), decide which components to create, write the adaptation plan; ask the user to approve before writing code.
2. **Implementation** -- execute the approved plan: write `.env`, run `bun run api:sync` (or equivalent), create/modify components, run tests, fix failures.

**Completion gate**: `bun run test:smoke` passes on at least one test against staging, AND `bun run typecheck` passes.

Read `references/kata-adaptation.md` during Setup. Contains the component templates, auth-strategy decision tree, OpenAPI integration recipe, validation checklist.

### Context Generators — the final deliverables

Three files, always generated last (they pull from every prior phase):

| File | Generator reference | What it contains |
|------|---------------------|------------------|
| `.context/business-data-map.md` | `context-generators.md` §Business Data Map | System flows, entities, triggers, cron jobs, webhooks, integration points. The canonical "what this system does" map. |
| `.context/api-architecture.md` | `context-generators.md` §API Architecture | Every endpoint grouped by auth level, with method, path, request/response shape, auth model, examples. |
| `.context/project-test-guide.md` | `context-generators.md` §Project Test Guide | The most critical flows to test, flow dependency diagram, entity states, prioritization, pre-release checklist. |

Read `references/context-generators.md` when (re)generating any of the three files. This is where 90% of "regenerate X" user requests land.

---

## Stack detection rules (inline -- load-bearing every invocation)

Most discovery starts with "what stack is this?" Do NOT ask the user -- detect, then confirm.

| Signal | Likely stack |
|--------|--------------|
| `package.json` with `next` dep | Next.js (SSR/SSG). Assume `app/` or `pages/` router; check which. |
| `package.json` with `react` + `vite` | Vite + React SPA. Tests usually in `src/`. |
| `package.json` with `@angular/core` | Angular. Tests co-located (`*.spec.ts`) or in `e2e/`. |
| `package.json` with `vue` + (`nuxt` or `vite`) | Nuxt or Vue-Vite. |
| `package.json` with `express`/`fastify`/`@nestjs/core` | Node backend. Check `src/` for controllers/routes. |
| `pyproject.toml` + `django` | Django. `urls.py` is the route map. |
| `pyproject.toml` + `fastapi` | FastAPI. `@app.get`/`@app.post` decorators = routes. |
| `composer.json` + `laravel/framework` | Laravel. `routes/*.php` = routes. |
| `Gemfile` + `rails` | Rails. `config/routes.rb` = routes. |
| `go.mod` + `gin`/`echo`/`fiber` | Go web framework. Grep `GET`/`POST` handler registrations. |
| Monorepo signals (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`) | Split backend/frontend by package. Run Phase 3 per package. |
| Dockerfile + `docker-compose.yml` | Prefer reading compose for service inventory over scanning source. |
| `.github/workflows/*.yml` | GitHub Actions. Extract test job for Phase 3 Infrastructure. |
| No test framework deps | Greenfield test story. Setup phase will install everything. |

If multiple signals conflict (e.g., Next.js + Express), it is almost always a monorepo -- treat frontend and backend as separate discoveries.

---

## Gotchas

- **Discovery is read-only until the user approves writes.** Phase 1-4 read code and ask questions. Only the Setup phase (KATA adaptation) modifies the target repo, and only after the user approves the plan.
- **Credentials never live in discovery docs.** Read them from `.env` (`LOCAL_USER_EMAIL`, `STAGING_USER_EMAIL`, etc.). If missing, ask the user to create `.env.example` or hand over secrets out-of-band -- do not paste them into markdown.
- **"Discovery Gaps" section is mandatory in every output.** If you could not verify something from the code (e.g., traffic volume, uptime targets), list it in a `## Discovery Gaps` section rather than inventing a number. This signals to future sessions what still needs human input.
- **PRD/SRS discovered from code is authoritative, not aspirational.** Describe what the system does, not what product wants it to do. If the user wants a "to-be" doc, that is PRD/SRS *creation* (out of scope for this skill); point them to their own product workflow.
- **Do not duplicate the backlog.** Jira/Linear/GitHub Issues is the source of truth for tickets. `.context/PBI/` holds local templates and working notes, never a copy of the full backlog.
- **Monorepos require scoped discovery.** Run Phase 1 once (project as a whole) but Phases 2-3 per package. Merge findings into a single `.context/infrastructure/` with sub-sections per package.
- **Database schemas over ORM models.** If both exist, prefer the migration files / schema dump over the ORM definitions -- ORM definitions can drift from the live schema.
- **API base URL vs route prefix.** `{{API_URL_LOCAL}}` includes the protocol+host; route prefixes (e.g., `/api/v1`) belong in the path. Do not concatenate them twice in `api-architecture.md`.
- **Auth flow is the single most error-prone part of KATA adaptation.** Session tokens, cookies, JWT, OAuth redirects, CSRF -- every project does it differently. Read the real login request in DevTools before writing the `LoginApi` / auth fixture.
- **Never generate from stale context.** If `.context/business-data-map.md` already exists but the user asks to "refresh" it, diff the current code against the existing file and ask whether to overwrite or merge. Auto-overwrite loses prior human edits.
- **Context generators need ALL prior phases.** If the user jumps to "regenerate api-architecture" on a fresh repo, do Phase 1 (at minimum project-connection) and Phase 3 (backend discovery) first -- the generator relies on them.
- **IQL framing is optional.** Mention it only if the user asks "why this structure?" -- do not lecture them on methodology when they just want a working `api-architecture.md`.

---

## Templates (inline -- small, load-bearing)

### Discovery Gaps section (every output)

```markdown
## Discovery Gaps

The following items could not be verified from code and require human confirmation:

- [ ] <Gap>: <what is missing, where you looked, suggested source of truth>
- [ ] ...
```

### Phase completion ping (used after each phase)

```
Phase N complete.
Generated files:
- <path1>
- <path2>
Next: Phase N+1 (<phase name>). Confirm to continue, or say "pause" to stop here.
```

### `.env` key list emitted after Phase 1

```
# Application URLs
SPA_URL_LOCAL=
SPA_URL_STAGING=
API_URL_LOCAL=
API_URL_STAGING=

# Test User Credentials
LOCAL_USER_EMAIL=
LOCAL_USER_PASSWORD=
STAGING_USER_EMAIL=
STAGING_USER_PASSWORD=

# TMS (optional)
JIRA_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
```

Larger templates (full PRD sections, KATA component skeletons, `.context/infrastructure/backend.md` layout, `business-data-map.md` structure) live in the references.

---

## Specific tasks -- which reference to read

- **Phase 1 (project connection, assessment, business model, glossary)** -> read `references/phase-1-constitution.md`.
- **Phase 2 PRD (executive summary, personas, journeys, features)** -> read `references/phase-2-prd.md`.
- **Phase 2 SRS (architecture, API contracts, functional, non-functional)** -> read `references/phase-2-srs.md`.
- **Phase 3 (backend, frontend, infrastructure)** -> read `references/phase-3-infrastructure.md`.
- **Phase 4 (backlog mapping, templates)** -> read `references/phase-4-specification.md`.
- **KATA adaptation (Setup)** -> read `references/kata-adaptation.md`.
- **Generating `business-data-map.md`, `api-architecture.md`, or `project-test-guide.md`** -> read `references/context-generators.md`.
- **User asks about IQL methodology** -> read `references/iql-methodology.md`.
- **Code exploration (grep, read files)** -> use built-in tools. If the user wants a browser-driven exploration instead (UI-first discovery), load `/playwright-cli` skill.
- **Issue-tracker operations (Phase 4)** -> resolve `[ISSUE_TRACKER_TOOL]` via CLAUDE.md Tool Resolution. For Jira/Xray, load `/xray-cli` skill if present.
- **Database inspection** -> resolve `[DB_TOOL]`; read-only queries only during discovery.

---

## Quick reference

```bash
# Phase 1 — Project Connection (detection commands)
ls -la <target-repo>                      # repo root
cat <target-repo>/package.json | jq .     # JS/TS stack
cat <target-repo>/pyproject.toml          # Python stack
ls <target-repo>/.github/workflows        # CI presence
find <target-repo> -maxdepth 2 -name "docker-compose*.yml" -o -name "Dockerfile"

# Phase 2 — PRD/SRS source-of-truth order
# 1. Read routes (frontend app/ or pages/ or router.ts)
# 2. Read API handlers (src/controllers/ or src/routes/ or src/api/)
# 3. Read DB schema (prisma/schema.prisma, migrations/, schema.sql)
# 4. Read auth config (middleware.ts, auth.config.ts, passport config)

# Phase 3 — Infrastructure
cat <target-repo>/.env.example             # env var contract
grep -r "process.env\." <target-repo>/src  # env vars actually read
cat <target-repo>/.github/workflows/*.yml  # CI/CD pipeline

# Setup — KATA adaptation
cp .env.example .env                       # populate with project values
bun run api:sync                           # sync OpenAPI + regenerate types
bun run test:smoke                         # validate login + one flow
bun run typecheck                          # no type errors

# Context generators (final step)
# Output paths:
#   .context/business-data-map.md
#   .context/api-architecture.md
#   .context/project-test-guide.md

# Issue tracker (Phase 4) — example placeholder
[ISSUE_TRACKER_TOOL] Get Issue:
  key: {{PROJECT_KEY}}-1
[ISSUE_TRACKER_TOOL] Search Issues:
  project: {{PROJECT_KEY}}
  query: sprint in openSprints() AND assignee = currentUser()
```
