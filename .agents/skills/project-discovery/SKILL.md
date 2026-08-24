---
name: project-discovery
description: "Onboard a project through four discovery phases: Constitution, Architecture, Infrastructure, and Specification. Produces PRD, SRS, domain glossary, infrastructure context, and backlog access, then hands business maps and the master test plan to `project-context`. Use for set up this project, onboard this repo, connect to project, discover architecture, or create PRD/SRS. Do NOT use for incremental context refresh (`project-context`), writing tests, TMS documentation, running suites, adapting KATA (`adapt-framework`), or technical OpenAPI sync (`bun run api:sync`)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [meta-skill]
---

# Project Discovery — Onboarding Orchestrator

Turn an unknown codebase into a testable project. Four phases, always in order, gated on completion of the previous one. The output is a set of context files the rest of the skills (`shift-left-testing`, `sprint-testing`, `test-automation`, `test-documentation`, `regression-testing`) rely on.

The discovery is **conversational**: you read the code, ask when ambiguous, confirm before writing files. Never fabricate -- if you cannot verify a claim from the source, mark it as a "Discovery Gap" and move on.

Grounding methodology: **IQL (Integrated Quality Lifecycle)** — QA is continuous from requirement to release, not a gate at the end. The full rationale and step breakdown live in `docs/methodology/IQL-methodology.md` (shared across all QA skills). This skill does not depend on reading it — only point the user there if they ask why the discovery is structured this way.

---

## Inputs

Canonical reading order when starting cold on a discovery run. Read in order; stop earlier when the scope is small enough that later inputs add no signal.

1. **Target project repo** — path resolved at session start (see "Before starting: target repo location" below). Read code and any in-repo PRD. This is the primary source of truth — discovery is reverse-engineering, never aspirational design.
2. **Target repo's `README.md` and existing onboarding docs** — fastest path to project intent, stack signals, and run commands before deep code reads.
3. **`.context/` directory** (if partial state exists from a prior discovery run) — informs Phase 0 resume decisions and prevents redundant work. Diff against current code before overwriting.
4. **`.agents/project.yaml` and `.env.example`** — variable resolution patterns (`{{PROJECT_KEY}}`, env URLs, MCP names) that every downstream context file references.
5. **`kata-manifest.json`** — registry of existing KATA Components + ATCs. Anchors what test surface the boilerplate already expects so discovery records gaps coherently.
6. **`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md`** — workflow context for downstream handoffs (`project-context`, `adapt-framework`, `sprint-testing`, `test-documentation`).
7. **Business / domain docs supplied by the user** (Confluence, Notion exports, internal wikis) — secondary source for business model and glossary when in-repo signal is thin.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is **project-scope**: no `<scope>` segment. Session state lives directly at `.session/project-discovery/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. This is the longest skill in the QA repo (1.5–4 hours, 4 hard-gate phases) and benefits most from per-phase checkpoints: if interrupted between Phase 2 (PRD/SRS) and Phase 3 (Infrastructure), resume reads `progress.md` and skips back to the first incomplete phase without re-prompting the user for already-confirmed scope.

This skill is compliant with the doctrine in `AGENTS.md` §"Orchestration Mode (Subagent Strategy)" and the session contract in `.agents/skills/agentic-qa-core/references/session-management.md`. Per-phase dispatch decisions live in `Pick the scope first` below: Fresh = heavy subagent delegation per phase; Boilerplate adoption = medium; Brownfield + Context refresh = main session only.

---

## Phase 0 — Session resume check (MANDATORY, inline)

Before scope selection or any target-repo discovery, run the resume contract from `agentic-qa-core/references/session-management.md` §4:

1. Check `.session/project-discovery/progress.md`.
2. If it does NOT exist → proceed to "Before starting: target repo location" below, then "Pick the scope first" (which writes `plan.md`).
3. If it DOES exist:
   - Read `plan.md` (chosen scope, target repo path, phase plan).
   - Read tail of `progress.md` (last completed phase + next planned phase).
   - Surface to the user: scope chosen, target repo, last completed phase, next phase, any open Discovery Gaps from the last entry.
   - Offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-project-discovery-aborted/` before proceeding.

Resume is high-value here: Fresh onboarding (1.5–4h) crossing a session boundary without resume re-runs Phase 1 from scratch, re-prompting target paths the user already confirmed.

---

## Before starting: target repo location

`/project-discovery` runs **read-only** against a project under test — the **target repo** — that is NOT this boilerplate. Before Phase 1 starts, lock down where the target lives. Block Phase 1 if the target path is ambiguous.

| Layout | What to declare | How to detect |
|--------|-----------------|---------------|
| **Monorepo** (single repo contains FE + BE) | Absolute or relative path from this repo | Check the candidate path for `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or a top-level `package.json` with no deps of its own |
| **Split sibling repos** (FE and BE cloned separately) | One path per repo (or a common parent dir) | Look at `../`-level siblings with plausible names (`*-backend`, `*-frontend`, `*-api`, `*-web`); confirm with the user |
| **Remote (not cloned yet)** | Repo URL + branch, then ask the user to clone locally before Phase 1 | `gh repo view` only returns metadata; real discovery needs local file access — do not try to discover from a URL |

Record the resolved path(s) in `.context/project-config.md` §Repositories during Phase 1 sub-step 1 (Project Connection). Every `<target-repo>` reference in later phases resolves to the path declared here.

If the layout is "split sibling repos", run Phase 1 sub-steps once per repo and merge findings into a single `project-config.md`; do not interleave.

---

## Pick the scope first

All projects go through the same 4 phases, but depth varies. Pick once, then follow the common pipeline.

| Scenario | Input | Phases to run | Typical depth | Context weight & subagent hint |
|----------|-------|---------------|---------------|--------------------------------|
| **Fresh onboarding** (greenfield or unseen project) | Repo URL or local path(s), no existing context files | 1 -> 2 -> 3 -> 4, then `project-context refresh-all` | Full discovery. Business maps and test strategy are generated by their dedicated skill. After context completion, run `adapt-framework`. | **Heavy.** Delegate each phase's code survey to a dedicated subagent. |
| **Boilerplate adoption** (this repo adopted for a new project) | Target app repo(s), this repo as the test framework | 1 (project-connection) -> 3, then `project-context` for missing maps | Skip Phase 2 or 4 only when their required artifacts already exist. Verify files on disk before `adapt-framework`. | **Medium.** Delegate Phase 1 and Phase 3 per package for monorepos. |
| **Brownfield** (project already documented, tests missing) | Existing `.context/` partially filled | 2 (gaps) -> 3 (gaps) -> 4 (gaps), then `project-context` for stale maps | Fill discovery gaps here; refresh map artifacts in their owning skill. | **Light.** Main session unless gaps span many files. |
| **Context refresh** | User asks to regenerate a business map or master test plan | Redirect to the matching `project-context` mode | This skill does not refresh those artifacts. For PBI access changes, re-run Phase 4. For exact OpenAPI types, use `bun run api:sync`. | **Minimal.** Handoff only. |

Default to "Fresh onboarding" when in doubt. Confirm the scope with the user before starting Phase 1.

After scope confirmation, **write `.session/project-discovery/plan.md`** per `agentic-qa-core/references/session-management.md` §6. The phase breakdown ends at Phase 4; record `project-context refresh-all` as the post-discovery handoff, not as a discovery phase.

---

## Workflow — the 4-phase pipeline

```
Phase 1: Constitution        -> Phase 2: Architecture       -> Phase 3: Infrastructure    -> Phase 4: Specification
(who/what/why)                 (PRD + SRS)                    (backend/frontend/infra)       (PBI mapping)
                |                      |                              |                              |
   .context/business/            .context/PRD/*.md           .context/infrastructure/*.md     .context/PBI/ACCESS.md
   business-model.md            .context/SRS/*.md
   domain-glossary.md
   project-config.md

                                                 |
                                                 v
                                    project-context (separate skill)
                                    data -> features -> api -> test-plan
                                    `bun run api:sync` remains the technical
                                    OpenAPI type pipeline.
```

> KATA adaptation is a separate skill: `adapt-framework`. It runs after discovery and context outputs exist.

Each phase has a **completion gate**: before moving on, the required output files must exist on disk with non-placeholder content. Ask the user to confirm after each phase; never auto-chain.

### Phase 1 — Constitution (who, what, why)

**Goal**: make the project legible. Outputs are read by every future session.

Four sub-steps, in order:

1. **Project Connection** -- repo paths, tech stack detection, environment URLs, credentials from `.env`, team contacts.
2. **Project Assessment** -- current testing maturity (frameworks in place, CI presence, lint/typecheck, coverage). Produces a risk profile.
3. **Business Model Discovery** -- problem statement, target users, value proposition, revenue model (if any). Business Model Canvas recommended.
4. **Domain Glossary** -- core entities, relationships, state machines, enumerations, UI-label vs code-identifier mapping.

**Completion gate**: `.context/business/business-model.md`, `.context/business/domain-glossary.md`, `.context/project-config.md` all exist and are non-empty. Plus a `## Project Assessment (Phase 1)` block in canonical `AGENTS.md`. Sanity-check content — these are soft gates, surfaced to the human as warnings, not hard aborts:
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

> **Feature catalog is post-discovery.** `project-context` mode `features` owns `.context/business/business-feature-map.md`. Do not generate it here.

SRS sub-steps (run after PRD, serially):
1. **Architecture Specs** -- C4 context and container diagrams, component structure, database schema, external services, security model.
2. **Functional Specs** -- FR-N entries with preconditions, business rules, validations, state machines.
3. **Non-Functional Specs** -- performance budgets, security posture, reliability (RTO/RPO), scalability, observability, compliance.

> **API contracts are NOT an SRS output.** The technical surface is owned by `bun run api:sync`; the business angle is owned by `project-context` mode `api`. Phase 2 records only the spec location or a Discovery Gap.

> **Test-architecture ADR seeding (Phase 2 SRS + Phase 3).** When the Architecture Specs / Infrastructure sub-steps settle a hard-to-reverse **test**-architecture decision — test runner/framework, isolation & parallelization model, fixture/test-data strategy, auth-in-tests, selector/`data-testid` contract, exploratory-vs-scripted boundary, CI sharding — promote each one that passes the two-gate test (architectural AND hard to reverse) to a standalone `ADR-NNNN-<slug>.md` in `.context/ADR/`, and reference it from `architecture.md` / `infrastructure/`. Greenfield: you are ENCODING the decision; brownfield: you are RECORDING the one you discovered. Follow `agentic-qa-core/references/adr-doctrine.md` (detection + authoring) and `.context/ADR/README.md` (template + lifecycle). AI drafts `Proposed`; the human accepts.

**Completion gate**: `.context/PRD/executive-summary.md`, `user-personas.md`, `user-journeys.md`, `.context/SRS/architecture.md`, `functional-specs.md`, `non-functional-specs.md` all exist. API contract source is recorded in `.context/project-config.md`. `business-feature-map.md` remains a post-discovery `project-context` output. Soft content checks:
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

One sub-step:
1. **PBI Backlog Mapping** -- connect to `{{ISSUE_TRACKER}}` via `[ISSUE_TRACKER_TOOL]`, discover project key, map hierarchy (Epic/Story/Task/Bug), record queries used to fetch tickets. Output: `.context/PBI/ACCESS.md` (backlog access recipe). NEVER write `.context/PBI/README.md` — it is a committed framework document (tier doctrine + gitignore ladder), not a discovery output; same for the committed `templates/` skeletons.

> **Per-ticket PBI is NOT generated by this skill.** It is materialized later by `/sprint-testing` via `bun run jira:sync-issues get <KEY> --include-comments`, which writes the canonical synced tree `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (Module = Epic, 1:1). Those local `.md` files are a READ-ONLY cache of Jira (Jira = source of truth). This skill does NOT create per-ticket `story.md` — it only sets up the backlog access recipe (`ACCESS.md`).

**Completion gate**: `.context/PBI/ACCESS.md` exists with project key + auth recipe. Soft content checks:
- `PBI/ACCESS.md` contains the configured `{{PROJECT_KEY}}` literal AND a `## Common Queries` section (or JQL / WIQL snippet).
- `.context/PBI/README.md` and `.context/PBI/templates/` untouched (framework-owned, committed).

Show outputs to the human and wait for "Phase 4 complete" before emitting the `project-context` handoff.

Read `references/phase-4-specification.md` when running Phase 4. Contains issue-tracker connection recipes, query conventions, and the `ACCESS.md` structure.

### Business-context handoff

Business maps and the master test plan are not generated here. After Phase 4, open a clean session and invoke `project-context` mode `refresh-all`. It owns the deterministic sequence `data -> features -> api -> test-plan`, including every CREATE/UPDATE approval gate. Exact OpenAPI types remain owned by `bun run api:sync`.

After those outputs exist, invoke `adapt-framework` to wire this boilerplate to the target stack.

---

## Per-phase progress + Archive

After each phase passes its completion gate AND the user confirms "Phase N complete", append a phase entry to `.session/project-discovery/progress.md`. Entries end at Phase 4; the next action is the separate `project-context` skill.

After Phase 4 passes, archive the project-discovery session per `agentic-qa-core/references/session-management.md` §8 and record the `project-context refresh-all` handoff. Context generation has its own lifecycle and does not keep this session open.

On Phase-gate REJECT (user marks a phase incomplete or finds a Discovery Gap that blocks), archive does NOT run. The working directory stays so resume picks up at the failing gate.

---

## Next recommended steps (emit after Phase 4 completes)

Discovery populates PRD, SRS, glossary, infrastructure, and backlog access. It does not invoke `project-context`, which is token-heavy and best run in a clean session.

When Phase 4 is confirmed complete, print this block to the user verbatim:

```
Discovery complete. `/project-discovery` has populated:
- .context/business/business-model.md, domain-glossary.md
- .context/project-config.md
- .context/PRD/executive-summary.md, user-personas.md, user-journeys.md
- .context/SRS/architecture.md, functional-specs.md, non-functional-specs.md
- .context/infrastructure/backend.md, frontend.md, infrastructure.md
- .context/PBI/ACCESS.md

**Recommended next skill** (run in a clean session):

`project-context` mode `refresh-all`

It runs data -> features -> api -> test-plan in dependency order and can be re-run whenever project context becomes stale.

After it completes, invoke `adapt-framework` to wire KATA against the target stack.
```

Do not auto-chain the handoff inside this session. Context generation needs its own token budget and approval lifecycle.

### Pre-adapt-framework checklist

<!-- keep in sync with .agents/skills/adapt-framework/references/adaptation-workflow.md §Hard prerequisites -->

Before the user invokes `adapt-framework`, verify every file below is on disk. Missing business maps route to the matching `project-context` mode.

- [ ] `.context/PRD/` populated (at least `README.md`) AND `.context/business/business-model.md` or `domain-glossary.md` present
- [ ] `.context/SRS/architecture.md`
- [ ] `.context/infrastructure/backend.md` and `.context/infrastructure/frontend.md`
- [ ] `.context/business/business-data-map.md`
- [ ] API contract source: one of `api/openapi-types.ts` (non-stub) OR reachable OpenAPI spec URL OR `.context/business/business-api-map.md` (business-angle fallback)
- [ ] `.env.example` (and `.env` either present or created during `adapt-framework`)

Handoff line to print to the user:

> Discovery handoff complete. Run `project-context refresh-all`, then invoke `adapt-framework` when the six prerequisites are present.

---

## Stack-specific discovery rules

Base stack detection (package.json → Node, pyproject.toml → Python, go.mod → Go, `next.config.*` → Next.js, etc.) is a baseline skill any AI has. This section only lists **actions the skill should take based on what is detected** — rules that are not obvious from general programming knowledge.

| Signal | Action for discovery |
|--------|----------------------|
| Monorepo (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or top-level `package.json` with no deps of its own) | Split backend/frontend per package. Run Phase 1 **once** (project-level), Phase 2-3 **per package**. Merge outputs under `.context/infrastructure/` with sub-sections per package. |
| Multiple coexisting signals in one repo (e.g., Next.js + Express) | Almost always a monorepo — treat frontend and backend as separate discoveries even if workspace config is missing. Do NOT produce a merged SRS. |
| `Dockerfile` + `docker-compose.yml` present | Read compose for service inventory **before** scanning source — it is the authoritative runtime topology. Use source only to fill gaps. |
| No test framework deps detected | Greenfield test story. Phase 3 documents the absence as a Discovery Gap. **Do NOT install tooling in the target repo.** `adapt-framework` wires this boilerplate's own test stack; it never modifies the target. |
| `.github/workflows/*.yml` present | Extract the test job from CI for Phase 3 Infrastructure — usually the cleanest source for "how CI runs tests". |
| API handlers found but no OpenAPI spec | Flag as Discovery Gap in Phase 2 SRS. Do NOT hand-write an OpenAPI inside project-discovery; ask for a spec or defer the business angle to `project-context` mode `api`. |
| Hardcoded secrets detected (grep hits in source) | HIGH risk. Record path in `.context/risk-assessment.md` §Phase 1 Project Assessment. Do NOT paste the secret into any discovery doc — reference path only. |

---

## Gotchas

- **Discovery is read-only on the target repo.** `.context/` is the only write target. For modifications to this boilerplate, use `adapt-framework`.
- **Hard-to-reverse test decisions become ADRs, not buried prose.** When Phase 2/3 settles a test-runner, isolation, fixture/data, auth-in-tests, or selector-contract decision that is architectural AND hard to reverse, record it as `.context/ADR/ADR-NNNN-<slug>.md` (append-only) instead of leaving it only inside `architecture.md`. Draft `Proposed`; the human approves. See `agentic-qa-core/references/adr-doctrine.md`.
- **Credentials never live in discovery docs.** Read them from `.env` (`LOCAL_USER_EMAIL`, `STAGING_USER_EMAIL`, etc.). If missing, ask the user to create `.env.example` or hand over secrets out-of-band -- do not paste them into markdown.
- **"Discovery Gaps" section is mandatory in every output.** If you could not verify something from the code (e.g., traffic volume, uptime targets), list it in a `## Discovery Gaps` section rather than inventing a number. This signals to future sessions what still needs human input.
- **PRD/SRS discovered from code is authoritative, not aspirational.** Describe what the system does, not what product wants it to do. If the user wants a "to-be" doc, that is PRD/SRS *creation* (out of scope for this skill); point them to their own product workflow.
- **Do not duplicate the backlog.** Jira/Linear/GitHub Issues is the source of truth for tickets. `.context/PBI/` holds the backlog access recipe (`README.md`) and format-reference guides (`templates/`), never a copy of the full backlog. Per-ticket PBI is synced on demand from Jira by `/sprint-testing` (`bun run jira:sync-issues`) as a read-only cache — this skill does not create it.
- **Monorepos require scoped discovery.** Run Phase 1 once (project as a whole) but Phases 2-3 per package. Merge findings into a single `.context/infrastructure/` with sub-sections per package.
- **Database schemas over ORM models.** If both exist, prefer the migration files / schema dump over the ORM definitions -- ORM definitions can drift from the live schema.
- **API base URL vs route prefix.** `{{environments.local.api_url}}` includes the protocol+host; route prefixes (e.g., `/api/v1`) belong in the path. Do not concatenate them twice in any context file that documents endpoints (e.g., `business-api-map.md`).
- **Auth flow is the single most important input for downstream `adapt-framework`.** Capture the real login request in `backend.md` so adaptation has a concrete contract.
- **Never refresh maps here.** Route existing-map refreshes to `project-context`, which owns diff and overwrite approval.
- **Context modes need grounded discovery.** If the user requests a business map on a fresh repo, complete at least Phase 1 and Phase 3 before handing off.
- **IQL framing is optional.** Mention it only if the user asks "why this structure?" -- do not lecture them on methodology when they just want a working `business-data-map.md`.
- **API requests get redirected.** Use `bun run api:sync` for technical types and `project-context` mode `api` for the business angle.

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
# Application URLs (per-environment — match the env names you declared
# under `environments:` in `.agents/project.yaml`; consumed by
# `bun run agents:setup --non-interactive` via the `<KEY>_<ENV>` pattern)
WEB_URL_LOCAL=
WEB_URL_STAGING=
API_URL_LOCAL=
API_URL_STAGING=

# Test User Credentials
LOCAL_USER_EMAIL=
LOCAL_USER_PASSWORD=
STAGING_USER_EMAIL=
STAGING_USER_PASSWORD=

# Atlassian / TMS credentials (used by MCP, acli, xray-cli, sync scripts, and
# the Jira-Direct TMS provider — no overrides)
# NOTE: the Atlassian site HOST is not a .env variable. It lives in
# .agents/project.yaml -> issue_tracker.atlassian_url (`bun run agents:setup`).
ATLASSIAN_EMAIL=
ATLASSIAN_API_TOKEN=
```

Larger templates (full PRD sections, KATA component skeletons, `.context/infrastructure/backend.md` layout, `business-data-map.md` structure) live in the references.

---

## Specific tasks -- which reference to read

- **Phase 1 (project connection, assessment, business model, glossary)** -> read `references/phase-1-constitution.md`.
- **Phase 2 PRD (executive summary, personas, journeys, features)** -> read `references/phase-2-prd.md`.
- **Phase 2 SRS (architecture, API contracts, functional, non-functional)** -> read `references/phase-2-srs.md`.
- **Phase 3 (backend, frontend, infrastructure)** -> read `references/phase-3-infrastructure.md`.
- **Recording a hard-to-reverse test-architecture decision (ADR)** -> read `agentic-qa-core/references/adr-doctrine.md` + `.context/ADR/README.md`.
- **Phase 4 (backlog mapping, templates)** -> read `references/phase-4-specification.md`.
- **Generating or refreshing business maps and master test plan** -> NOT this skill. Invoke the matching `project-context` mode.
- **API endpoint sync** -> `bun run api:sync` for technical types; `project-context` mode `api` for business narrative.
- **User asks about IQL methodology** -> point them to `docs/methodology/IQL-methodology.md` (shared across QA skills). This skill no longer carries its own IQL reference.
- **Code exploration (grep, read files)** -> use built-in tools. If the user wants a browser-driven exploration instead (UI-first discovery), load `/playwright-cli` skill.
- **Issue-tracker operations (Phase 4)** -> resolve `[ISSUE_TRACKER_TOOL]` via AGENTS.md Tool Resolution. For Jira, load `/acli` skill (primary) or fall back to the Atlassian MCP. If the project also uses Xray for TMS, load `/xray-cli` additionally.
- **Database inspection** -> resolve `[DB_TOOL]`; read-only queries only during discovery.
- **Session contract (Phase 0 resume, plan.md/progress.md schemas, archive policy, Engram per-phase checkpoint)** -> read `../agentic-qa-core/references/session-management.md`. This skill is a producer of `session/project-discovery/...` topic keys.

---

## Anti-patterns — NEVER do these

- **P1.** NEVER invent business entities, flows, or requirements not present in the target repo code or PRD. Discovery is reverse-engineering, not aspirational design — unverified items go in a `## Discovery Gaps` block, never inline.
- **P2.** NEVER skip Phase 1 (Constitution) when starting fresh. Downstream phases (PRD/SRS, infrastructure, PBI mapping) assume the project values and stack are fixed first; skipping leaves later artifacts ungrounded.
- **P3.** NEVER fill `.context/business/business-data-map.md` from this skill. `project-context` re-reads evidence and owns the artifact.
- **P4.** NEVER mix `project-discovery` with `adapt-framework` in the same session. Their write boundaries differ.
- **P5.** NEVER use `project-discovery` for incremental map updates. Use `project-context`.
- **P6.** NEVER skip the domain glossary in Phase 1. Downstream skills read it as a precondition when present: `sprint-testing` lists it in its Stage 1 planning inputs (ATP, refined ACs, TC outlines) and `test-documentation` uses it as the vocabulary reference for TC naming and bodies.
- **P7.** NEVER fabricate Jira / Xray field IDs or status names in `.context/master-test-plan.md` or any PBI template. Run `bun run jira:sync-fields --force` and reference `{{jira.<slug>}}` via the slug catalog in `.agents/jira-required.yaml`.

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

# Post-discovery context handoff (separate skill):
#   project-context refresh-all     # data -> features -> api -> test-plan
#   bun run api:sync                # exact API types from OpenAPI

# Issue tracker (Phase 4) — example placeholder
# Prerequisite: Load /acli skill before executing the commands below.
[ISSUE_TRACKER_TOOL] Get Issue:
  key: {{PROJECT_KEY}}-1
[ISSUE_TRACKER_TOOL] Search Issues:
  project: {{PROJECT_KEY}}
  query: sprint in openSprints() AND assignee = currentUser()
```
