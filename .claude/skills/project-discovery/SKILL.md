---
name: project-discovery
description: "Onboard a project to this testing boilerplate and generate the context files that every QA and automation session depends on. Runs a 4-phase discovery (Constitution, Architecture, Infrastructure, Specification) that produces PRD, SRS, domain glossary, business-data-map, and test-ready fixtures. Use when the user says: set up this project, onboard this repo, connect to project, discover the architecture, generate business-data-map, or create PRD/SRS. Also use when .context/mapping/business-data-map.md is missing or stale. Do NOT use for writing tests (test-automation), documenting TCs (test-documentation), running suites (regression-testing), testing a ticket (sprint-testing), adapting the KATA architecture to the target stack (that is `/adapt-framework`), or syncing API endpoints (use `bun run api:sync` for technical sync; the `/business-api-map` command for the business angle)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
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
| **Fresh onboarding** (greenfield or unseen project) | Repo URL or local path(s), no existing context files | 1 -> 2 -> 3 -> 4 -> Context generators | Full. All docs generated. After discovery complete, run `/adapt-framework` to modify the boilerplate. |
| **Boilerplate adoption** (this repo adopted for a new project) | Target app repo(s), this repo as the test framework | 1 (project-connection) -> 3 -> Context generators | Skipping Phase 2 or Phase 4 is allowed **only** if every required input for `/adapt-framework` is already on disk: `.context/SRS/architecture.md`, `.context/mapping/business-data-map.md`, one of (`api/openapi-types.ts` non-stub / reachable OpenAPI spec URL / `.context/mapping/business-api-map.md`), plus `.context/infrastructure/{backend,frontend}.md`. If any is missing, fall back to the corresponding phase before invoking `/adapt-framework`. Do not skip phases on a hand-wave like "the docs exist elsewhere" — verify each file is on disk first. |
| **Brownfield** (project already documented, tests missing) | Existing `.context/` partially filled | 2 (gaps) -> 3 (gaps) -> Context generators | Targeted. Only regenerate what's missing/stale. |
| **Context refresh** | User says "regenerate business-data-map" | Context generators only | One-file refresh. Confirm diffs before overwriting. For the test plan, redirect to `/master-test-plan`. For API endpoints, redirect to `bun run api:sync` (technical) or `/business-api-map` (business angle). |

Default to "Fresh onboarding" when in doubt. Confirm the scope with the user before starting Phase 1.

---

## Workflow — the 4-phase pipeline

```
Phase 1: Constitution        -> Phase 2: Architecture       -> Phase 3: Infrastructure    -> Phase 4: Specification
(who/what/why)                 (PRD + SRS)                    (backend/frontend/infra)       (PBI mapping)
                |                      |                              |                              |
   .context/PRD/business/        .context/PRD/*.md           .context/infrastructure/*.md     .context/PBI/README.md
   business-model.md            .context/SRS/*.md                                             templates/*.md
   domain-glossary.md
   project-config.md

                                                 |
                                                 v
                                    Context Generators
                                    (.context/mapping/business-data-map.md)
                                    Test strategy (.context/master-test-plan.md) is
                                    produced by the /master-test-plan command.
                                    API context by `bun run api:sync` (technical) +
                                    `/business-api-map` (business angle).
```

> KATA adaptation is a separate command: `/adapt-framework`. It runs after discovery outputs exist and modifies this boilerplate's `tests/`, `api/schemas/`, and `config/` against the target stack.

Each phase has a **completion gate**: before moving on, the required output files must exist on disk with non-placeholder content. Ask the user to confirm after each phase; never auto-chain.

### Phase 1 — Constitution (who, what, why)

**Goal**: make the project legible. Outputs are read by every future session.

Four sub-steps, in order:

1. **Project Connection** -- repo paths, tech stack detection, environment URLs, credentials from `.env`, team contacts.
2. **Project Assessment** -- current testing maturity (frameworks in place, CI presence, lint/typecheck, coverage). Produces a risk profile.
3. **Business Model Discovery** -- problem statement, target users, value proposition, revenue model (if any). Business Model Canvas recommended.
4. **Domain Glossary** -- core entities, relationships, state machines, enumerations, UI-label vs code-identifier mapping.

**Completion gate**: `.context/PRD/business/business-model.md`, `.context/PRD/business/domain-glossary.md`, `.context/project-config.md` all exist and are non-empty. Plus a `## Project Assessment (Phase 1)` block in `AGENTS.md` (CLAUDE.md is a symlink to it). Sanity-check content — these are soft gates, surfaced to the human as warnings, not hard aborts:
- `domain-glossary.md` contains at least 5 core-entity subsections (grep `^### ` yields 5+ matches, ignoring top-level H3s from "Enumerations" etc. — aim for real entities).
- `business-model.md` cites at least one concrete source (`Source:` or `Found in:` literal appears 3+ times).
- `project-config.md` has a `## Tech Stack` section AND a `## Environments` section.

After the automated sanity check, show the human the output paths and wait for explicit "Phase 1 complete, continue" before moving on.

Read `references/phase-1-constitution.md` when running any Phase 1 sub-step. Contains the discovery process, stack-detection commands, required output sections, and quality checklists.

### Phase 2 — Architecture (PRD + SRS)

**Goal**: produce the Product and Software Requirements docs from code (not the other way round -- that is the "creation" direction, this is the "discovery" direction).

PRD sub-steps (run first, in parallel or sequentially — user choice):
1. **Executive Summary** -- problem, solution, success metrics, scope.
2. **User Personas** -- roles, permissions, primary/secondary users, role hierarchy.
3. **User Journeys** -- critical paths through the UI, route map, journey diagrams.

> **Feature catalog is post-discovery.** The full feature inventory (`.context/mapping/business-feature-map.md`) is produced by the `/business-feature-map` command after all four discovery phases complete. Do not attempt to invoke it from here — it is token-heavy and the user is advised to run it in a clean session (see "Next recommended steps" at the end of this skill).

SRS sub-steps (run after PRD, serially):
1. **Architecture Specs** -- C4 context and container diagrams, component structure, database schema, external services, security model.
2. **Functional Specs** -- FR-N entries with preconditions, business rules, validations, state machines.
3. **Non-Functional Specs** -- performance budgets, security posture, reliability (RTO/RPO), scalability, observability, compliance.

> **API contracts are NOT an SRS output.** The technical surface is owned by `bun run api:sync` (generates `api/openapi-types.ts` from the project's OpenAPI spec). The business angle is owned by the `/business-api-map` command (`.context/mapping/business-api-map.md`). Phase 2 SRS only records where the spec lives (or flags its absence as a Discovery Gap). See `references/phase-2-srs.md` §2.

**Completion gate**: `.context/PRD/executive-summary.md`, `user-personas.md`, `user-journeys.md`, `.context/SRS/architecture.md`, `functional-specs.md`, `non-functional-specs.md` all exist. API contract source (OpenAPI URL, `api/openapi-types.ts`, or "Discovery Gap — no spec") is recorded in `.context/project-config.md`. `business-feature-map.md` is produced post-discovery by `/business-feature-map` (see "Next recommended steps" after Phase 4). Soft content checks:
- `architecture.md` contains at least one ` ```mermaid` block AND one of (`## Data Flow`, `## Database Schema`, `## Component Structure`).
- `functional-specs.md` contains at least one `FR-` identifier and one `BR-` identifier.
- `user-personas.md` lists at least 2 role entries (`### ` or table rows with role names).

Show outputs to the human and wait for "Phase 2 complete, continue" before moving on.

Read `references/phase-2-prd.md` when working on any PRD doc. Read `references/phase-2-srs.md` when working on any SRS doc. They are independent -- do not load both unless you are straddling both sides.

### Phase 3 — Infrastructure

**Goal**: make the project runnable and deployable for the test environment.

Three sub-steps:
1. **Backend Discovery** -- language, framework, database, ORM, auth, dependency manager, run/test commands, migrations, env vars.
2. **Frontend Discovery** -- framework, bundler, routing, state management, design system, component library, test IDs strategy.
3. **Infrastructure Mapping** -- CI/CD providers, deployment targets, environments (dev/staging/prod), infra-as-code, monitoring, rollback procedure.

**Completion gate**: `.context/infrastructure/backend.md`, `frontend.md`, `infrastructure.md` all exist with the key facts (auth flow, test commands, deploy URLs) filled in. Soft content checks:
- `backend.md` AND `frontend.md` each contain a `## Runtime` (or `## Build Configuration`) section AND a commands block (`bash` fenced) covering install + run.
- `infrastructure.md` lists environments explicitly (`| Staging |` or `| Production |` table row).
- At least one auth-flow pointer exists in `backend.md` (e.g., mentions `/auth/login`, `session`, `JWT`, `cookie`, `OAuth`).

Show outputs to the human and wait for "Phase 3 complete, continue" before moving on.

Read `references/phase-3-infrastructure.md` when running any Phase 3 sub-step. Contains framework-detection heuristics, required sections per artifact, and common gotchas (SSR vs CSR, edge vs serverless, monorepo vs split repos).

### Phase 4 — Specification (Backlog mapping)

**Goal**: hook the testing framework into the team's issue tracker without duplicating content.

Two sub-steps:
1. **PBI Backlog Mapping** -- connect to `{{ISSUE_TRACKER}}` via `[ISSUE_TRACKER_TOOL]`, discover project key, map hierarchy (Epic/Story/Task/Bug), record queries used to fetch tickets.
2. **PBI Story Template** -- produce the local templates (`.context/PBI/templates/user-story.md`, `bug.md`, `test-plan.md`, `test-case.md`) that future `sprint-testing` runs will fill, one file per ticket.

**Completion gate**: `.context/PBI/README.md` exists with project key + auth recipe; `.context/PBI/templates/*.md` exist. Soft content checks:
- `PBI/README.md` contains the configured `{{PROJECT_KEY}}` literal AND a `## Common Queries` section (or JQL / WIQL snippet).
- `.context/PBI/templates/user-story.md`, `bug-report.md`, `test-plan.md`, `test-case.md` each exist and are non-empty.

Show outputs to the human and wait for "Phase 4 complete" before running the context generators / emitting the Next Recommended Steps block.

Read `references/phase-4-specification.md` when running Phase 4. Contains issue-tracker connection recipes, query conventions, and the full template set.

### Context Generators — the final deliverables

Two files, always generated last (they pull from every prior phase):

| File | Generator reference | What it contains |
|------|---------------------|------------------|
| `.context/mapping/business-data-map.md` | `context-generators.md` §Generator 1 | System flows, entities, triggers, cron jobs, webhooks, integration points. The canonical "what this system does" map. |

`.context/master-test-plan.md` is **not** produced by this skill — the `/master-test-plan` command owns it (reads `business-data-map.md` + optional `business-feature-map.md`). Run it after `business-data-map.md` exists.

Read `references/context-generators.md` when (re)generating `business-data-map.md`. This is where most "regenerate business-data-map" user requests land.

**API context is NOT a project-discovery output.** Endpoint sync is delegated to `bun run api:sync` (technical, OpenAPI -> TypeScript types) and the `/business-api-map` command (business angle: auth flows, critical paths, architecture behind the API). See `references/context-generators.md` §API context — deferred for the deferral note.

**See also:** After discovery outputs exist, run `/adapt-framework` to adapt this boilerplate's `tests/`, `api/schemas/`, and `config/` to the target stack.

---

## Next recommended steps (emit after Phase 4 completes)

Discovery populates PRD, SRS, glossary, and `business-data-map.md`. It does NOT invoke the business-context commands — they are standalone, token-heavy, and best run in a clean session so the AI has full budget.

When Phase 4 is confirmed complete, print this block to the user verbatim:

```
Discovery complete. `/project-discovery` has populated:
- .context/PRD/business/business-model.md, domain-glossary.md
- .context/project-config.md
- .context/PRD/executive-summary.md, user-personas.md, user-journeys.md
- .context/SRS/architecture.md, functional-specs.md, non-functional-specs.md
- .context/infrastructure/backend.md, frontend.md, infrastructure.md
- .context/PBI/README.md + templates/*.md
- .context/mapping/business-data-map.md

**Recommended next commands** (run each in order — ideally in a clean session; they are token-heavy):

1. `/business-feature-map` — catalog features, CRUD matrix, flags. Output: .context/mapping/business-feature-map.md
2. `/business-api-map`     — auth model, critical endpoints, architecture behind the API. Output: .context/mapping/business-api-map.md
3. `/master-test-plan`     — what to test and why, ranked by risk. Output: .context/master-test-plan.md

These are STANDALONE and can be re-run any time you want to refresh them.
`/project-discovery` itself is typically run once per project (or occasionally to refresh business model / glossary).

After running the three commands above, you are ready for `/adapt-framework`, which wires this boilerplate's KATA architecture against the target stack.
```

If the user asks to chain them automatically: decline politely. Each command consumes significant tokens and produces better output in its own session.

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
| No test framework deps | Greenfield test story. Phase 3 documents the absence as a Discovery Gap — do NOT install tooling in the target repo. `/adapt-framework` wires this boilerplate's own test stack; it never modifies the target. |

If multiple signals conflict (e.g., Next.js + Express), it is almost always a monorepo -- treat frontend and backend as separate discoveries.

---

## Gotchas

- **Discovery is read-only on the target repo.** `.context/` is the only write target. For modifications to this boilerplate's `tests/`, `api/schemas/`, and `config/`, use `/adapt-framework`.
- **Credentials never live in discovery docs.** Read them from `.env` (`LOCAL_USER_EMAIL`, `STAGING_USER_EMAIL`, etc.). If missing, ask the user to create `.env.example` or hand over secrets out-of-band -- do not paste them into markdown.
- **"Discovery Gaps" section is mandatory in every output.** If you could not verify something from the code (e.g., traffic volume, uptime targets), list it in a `## Discovery Gaps` section rather than inventing a number. This signals to future sessions what still needs human input.
- **PRD/SRS discovered from code is authoritative, not aspirational.** Describe what the system does, not what product wants it to do. If the user wants a "to-be" doc, that is PRD/SRS *creation* (out of scope for this skill); point them to their own product workflow.
- **Do not duplicate the backlog.** Jira/Linear/GitHub Issues is the source of truth for tickets. `.context/PBI/` holds local templates and working notes, never a copy of the full backlog.
- **Monorepos require scoped discovery.** Run Phase 1 once (project as a whole) but Phases 2-3 per package. Merge findings into a single `.context/infrastructure/` with sub-sections per package.
- **Database schemas over ORM models.** If both exist, prefer the migration files / schema dump over the ORM definitions -- ORM definitions can drift from the live schema.
- **API base URL vs route prefix.** `{{API_URL_LOCAL}}` includes the protocol+host; route prefixes (e.g., `/api/v1`) belong in the path. Do not concatenate them twice in any context file that documents endpoints (e.g., `business-api-map.md`).
- **Auth flow is the single most important input for downstream `/adapt-framework`.** Session tokens, cookies, JWT, OAuth redirects, CSRF -- every project does it differently. Capture the real login request (DevTools / curl) in `backend.md` so the adaptation phase has a concrete contract to code against.
- **Never generate from stale context.** If `.context/mapping/business-data-map.md` already exists but the user asks to "refresh" it, diff the current code against the existing file and ask whether to overwrite or merge. Auto-overwrite loses prior human edits.
- **Context generators need ALL prior phases.** If the user jumps to "regenerate business-data-map" on a fresh repo, do Phase 1 (at minimum project-connection) and Phase 3 (backend discovery) first -- the generator relies on them.
- **IQL framing is optional.** Mention it only if the user asks "why this structure?" -- do not lecture them on methodology when they just want a working `business-data-map.md`.
- **API requests get redirected.** "Regenerate api-architecture" / "I need an API map" / "document the endpoints" -> stop and explain the split: `bun run api:sync` for technical types, `/business-api-map` for the business angle. This skill does not generate API documentation directly anymore.

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
- **Generating `business-data-map.md`** -> read `references/context-generators.md`. For the test plan, run `/master-test-plan` (command, not skill).
- **API endpoint sync (technical) or business-API map** -> NOT this skill. Use `bun run api:sync` (technical types) or `/business-api-map` command (business angle).
- **User asks about IQL methodology** -> read `references/iql-methodology.md`.
- **Code exploration (grep, read files)** -> use built-in tools. If the user wants a browser-driven exploration instead (UI-first discovery), load `/playwright-cli` skill.
- **Issue-tracker operations (Phase 4)** -> resolve `[ISSUE_TRACKER_TOOL]` via CLAUDE.md Tool Resolution. For Jira, load `/acli` skill (primary) or fall back to the Atlassian MCP. If the project also uses Xray for TMS, load `/xray-cli` additionally.
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

# Context generators (final step)
# Output path:
#   .context/mapping/business-data-map.md
# Test strategy and API context are produced separately (NOT by this skill):
#   /master-test-plan               # test strategy (reads data-map + feature-map)
#   bun run api:sync                # API technical types from OpenAPI
#   /business-api-map               # API business angle: auth flows, critical paths

# Issue tracker (Phase 4) — example placeholder
# Prerequisite: Load /acli skill before executing the commands below.
[ISSUE_TRACKER_TOOL] Get Issue:
  key: {{PROJECT_KEY}}-1
[ISSUE_TRACKER_TOOL] Search Issues:
  project: {{PROJECT_KEY}}
  query: sprint in openSprints() AND assignee = currentUser()
```
