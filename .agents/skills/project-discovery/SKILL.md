---
name: project-discovery
description: "Onboard a project through four discovery phases: Constitution, Architecture, Infrastructure, and Specification. Produces the domain map (business model + glossary) inside `business-domain-context` and the infra map (architecture, NFRs, backend, frontend, environments, CI/CD) inside `infra-context`, plus `.context/project-config.md` and a backlog connection check, then hands the business maps and the master test plan to `project-context`. Use for set up this project, onboard this repo, connect to project, discover architecture, or create PRD/SRS. Do NOT use for incremental context refresh (`project-context`), writing tests, TMS documentation, running suites, adapting KATA (`test-framework-adaptation`), or technical OpenAPI sync (`bun run api:sync`)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [meta-skill]
metadata:
  kind: workflow
  requires_capabilities: [db, api-schema, diagrams]
---

# Project Discovery — Onboarding Orchestrator

Turn an unknown codebase into a testable project. Four phases, always in order, gated on completion of the previous one. The output is the domain map and the infra map inside their context skills, plus `.context/project-config.md`: the knowledge the rest of the skills (`shift-left-testing`, `sprint-testing`, `test-automation`, `test-documentation`, `regression-testing`) rely on.

The discovery is **conversational**: you read the code, ask when ambiguous, confirm before writing files. Never fabricate -- if you cannot verify a claim from the source, mark it as a "Discovery Gap" and move on.

Grounding methodology: **IQL (Integrated Quality Lifecycle)** — QA is continuous from requirement to release, not a gate at the end. The stage contract every QA skill enforces lives in `agentic-qa-core/references/stage-gates.md`; the methodology narrative is the official IQL site: https://upexgalaxy.com/metodologia (ES) / https://upexgalaxy.com/en/methodology (EN). This skill does not depend on reading it — only point the user there if they ask why the discovery is structured this way.

---

## Compact Rules

- DO: run the four phases in order (Constitution → Architecture → Infrastructure → Specification), each gated on the previous. Show the output paths and wait for an explicit "Phase N complete" before continuing — never auto-chain.
- DO NOT: write anything into the target repo. Discovery is read-only on it. The write targets are `.context/project-config.md`, `.context/ADR/`, and the maps of `business-domain-context` and `infra-context` (their `references/<map>.html`), nothing else (plus the Phase 1 `## Project Assessment (Phase 1)` block in `AGENTS.md`); modifying the boilerplate itself is `test-framework-adaptation`.
- DO: act as the GENERATOR of those two maps, per `agentic-qa-core/references/business-context-maps.md` (anatomy §2, reading §3, CREATE/UPDATE §4, staleness §5). Map absent or placeholder → CREATE every section. Map generated → UPDATE only the stale sections (§5 staleness check), show a section-level diff, WAIT for approval. Never regenerate a whole generated map.
- DO: read a project's old `.context/business/`, `.context/SRS/` and `.context/infrastructure/` markdown files (the `legacy` list of `business-domain-context` and `infra-context` in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) as INPUT when present, cite them in `data-migrated-from` on the sections they seed, and never delete or rewrite them.
- DO: before drawing a figure, run the point-of-use check for capability `diagrams` (`agentic-qa-core/references/business-context-maps.md` §7). Figures are optional where a table says it better: the glossary is tables; the architecture overview usually earns a figure.
- DO NOT: invent business entities, flows, requirements, or Jira/Xray field IDs and status names. Anything not verifiable from the source goes in the map's `discovery-gaps` section (or the `## Discovery Gaps` block of `project-config.md`).
- DO: describe what the system DOES, not what product wants it to do. Discovery is reverse-engineering; a "to-be" PRD/SRS is out of scope — point the user at their own product workflow.
- DO: lock the target repo path(s) before Phase 1 and block on ambiguity. A repo that is not cloned locally cannot be discovered from a URL — ask for the clone first.
- WHEN the layout is split sibling repos: run the Phase 1 sub-steps once per repo and merge into ONE `project-config.md`, never interleaved. WHEN it is a monorepo: Phase 1 once project-wide, Phases 2-3 per package.
- DO NOT: fill the `business-data-context`, `business-api-context` or `business-e2e-context` maps, and do not write personas, journeys, the feature catalog or the master test plan here. Those are `project-context` modes, which own their diff and overwrite approval. Exact API types are `bun run api:sync`.
- DO NOT: create per-ticket PBI content or copy the backlog. Phase 4 is a connection check and writes no file; the committed `README.md` and `templates/` under `.context/PBI/` stay untouched.
- DO NOT: paste credentials or a detected secret into any discovery output. Reference the `.env` key or the file path only; a hardcoded-secret hit is recorded as a HIGH risk (path only) in the Phase 1 assessment.
- WHEN Phase 2 or 3 settles a test-architecture decision that is architectural AND hard to reverse (runner, isolation/parallelization, fixture and test-data strategy, auth-in-tests, selector contract, CI sharding): record it as an append-only ADR under `.context/ADR/`, drafted `Proposed` for the human to accept. In a brownfield repo the decision was DISCOVERED, not made here: write it `Proposed`, mark it discovered (where it was found), and have the human confirm it at that phase's completion checkpoint, which flips it to `Accepted`.
- DO NOT: mix a discovery session with `test-framework-adaptation`, and do not use this skill for incremental map refreshes — the write boundaries differ.
- DO NOT: skip Phase 1 or its domain glossary on a fresh start. Downstream skills load `business-domain-context` as a precondition for ATP authoring and TC naming.
- WHEN both a DB schema/migrations and ORM models exist: prefer the schema or migrations. ORM definitions drift from the live schema.
- DO: mention the IQL methodology only if the user asks why the discovery is structured this way — never lecture someone who just wants the artifact.
- DO: before any step that uses a declared capability (`metadata.requires_capabilities`: `db`, `api-schema`, `diagrams`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: resolve by tool-name suffix, and when no available tool provides it STOP and name the capability + how to enable it, never a silent fallback.

**Read full SKILL.md when**: running any phase's sub-steps, applying a completion gate's content checks, or resolving the pre-`test-framework-adaptation` prerequisite list.

---

## Inputs

Canonical reading order when starting cold on a discovery run. Read in order; stop earlier when the scope is small enough that later inputs add no signal.

1. **Target project repo** — path resolved at session start (see "Before starting: target repo location" below). Read code and any in-repo PRD. This is the primary source of truth — discovery is reverse-engineering, never aspirational design.
2. **Target repo's `README.md` and existing onboarding docs** — fastest path to project intent, stack signals, and run commands before deep code reads.
3. **Prior discovery state** (if any): `bun run context:map business-domain-context --list` and `bun run context:map infra-context --list`, `.context/project-config.md`, and any legacy markdown a project kept under `.context/business/`, `.context/SRS/`, `.context/infrastructure/` (input only). Informs Phase 0 resume decisions and CREATE vs UPDATE, and prevents redundant work.
4. **`.agents/project.yaml` and `.env.example`** — variable resolution patterns (`{{PROJECT_KEY}}`, env URLs, MCP names) that every downstream context file references.
5. **`kata-manifest.json`** — registry of existing KATA Components + ATCs. Anchors what test surface the boilerplate already expects so discovery records gaps coherently.
6. **`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md`** — workflow context for downstream handoffs (`project-context`, `test-framework-adaptation`, `sprint-testing`, `test-documentation`).
7. **Business / domain docs supplied by the user** (Confluence, Notion exports, internal wikis) — secondary source for business model and glossary when in-repo signal is thin.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is **project-scope**: no `<scope>` segment. Session state lives directly at `.session/project-discovery/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. This skill runs long (hours, four hard-gate phases) and benefits most from per-phase checkpoints: if interrupted between Phase 2 (Architecture) and Phase 3 (Infrastructure), resume reads `progress.md` and skips back to the first incomplete phase without re-prompting the user for already-confirmed scope.

This skill is compliant with the doctrine in `AGENTS.md` §3 (Orchestration Mode) and the session contract in `.agents/skills/agentic-qa-core/references/session-management.md`. Per-phase dispatch decisions live in `Pick the scope first` below: Fresh = heavy subagent delegation per phase; Boilerplate adoption = medium; Brownfield + Context refresh = main session only.

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

Resume is high-value here: Fresh onboarding (hours) crossing a session boundary without resume re-runs Phase 1 from scratch, re-prompting target paths the user already confirmed.

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
| **Fresh onboarding** (greenfield or unseen project) | Repo URL or local path(s), no existing context files | 1 -> 2 -> 3 -> 4, then `project-context refresh-all` | Full discovery. Business maps and test strategy are generated by their dedicated skill. After context completion, run `test-framework-adaptation`. | **Heavy.** Delegate each phase's code survey to a dedicated subagent. |
| **Boilerplate adoption** (this repo adopted for a new project) | Target app repo(s), this repo as the test framework | 1 -> 3, then `project-context` for missing maps | Phase 1 runs in full: the domain map is a `test-framework-adaptation` prerequisite. Skip Phase 2 or 4 only when their required artifacts already exist. Verify files on disk before `test-framework-adaptation`. | **Medium.** Delegate Phase 1 and Phase 3 per package for monorepos. |
| **Brownfield** (project already documented, tests missing) | Existing `.context/` partially filled | 2 (gaps) -> 3 (gaps) -> 4 (gaps), then `project-context` for stale maps | Fill discovery gaps here; refresh map artifacts in their owning skill. | **Light.** Main session unless gaps span many files. |
| **Context refresh** | User asks to regenerate a business map or master test plan | Redirect to the matching `project-context` mode | This skill does not refresh those artifacts. For the domain or infra map, re-run Phase 1 or Phases 2-3 in UPDATE mode (stale sections only). For a backlog connection change, re-run Phase 4. For exact OpenAPI types, use `bun run api:sync`. | **Minimal.** Handoff only. |

Default to "Fresh onboarding" when in doubt. Confirm the scope with the user before starting Phase 1.

After scope confirmation, **write `.session/project-discovery/plan.md`** per `agentic-qa-core/references/session-management.md` §6. The phase breakdown ends at Phase 4; record `project-context refresh-all` as the post-discovery handoff, not as a discovery phase.

---

## Workflow — the 4-phase pipeline

```
Phase 1: Constitution          -> Phase 2: Architecture        -> Phase 3: Infrastructure      -> Phase 4: Specification
(who/what/why)                    (architecture + NFRs)           (backend/frontend/envs/CI)      (backlog connection check)
        |                                 |                               |                               |
 .context/project-config.md       infra-context map:              infra-context map:              no file written
 AGENTS.md assessment block       overview, architecture,         backend, frontend,              `bun run jira:check`
 business-domain-context map:     external-services, nfr-<slug>   environments, ci-cd
 overview, business-model,
 term-<slug>, enumerations

                                                 |
                                                 v
                                    project-context (separate skill)
                                    data -> e2e -> api -> test-plan
                                    `bun run api:sync` remains the technical
                                    OpenAPI type pipeline.
```

Both maps close with a `discovery-gaps` section. Read them back with `bun run context:map <slug>` (or `--list` for the section index), never as raw HTML.

> KATA adaptation is a separate skill: `test-framework-adaptation`. It runs after discovery and context outputs exist.

Each phase has a **completion gate**: before moving on, the phase's sections must print through `bun run context:map` with real content (and the files it names must exist on disk). Ask the user to confirm after each phase; never auto-chain.

### Phase 1 — Constitution (who, what, why)

**Goal**: make the project legible. Outputs are read by every future session.

Four sub-steps, in order:

1. **Project Connection** -- repo paths, tech stack detection, environment URLs, credentials from `.env`, team contacts. Output: `.context/project-config.md`.
2. **Project Assessment** -- current testing maturity (frameworks in place, CI presence, lint/typecheck, coverage). Output: the `## Project Assessment (Phase 1)` block in `.agents/instructions/agent-project.md`. HIGH risks (a hardcoded-secret hit included, path only) are recorded there and carried to the handoff as seed input for `project-context` mode `test-plan` (the MTP). No separate risk file is written.
3. **Business Model Discovery** -- problem statement, target users, value proposition, revenue model (if any). Output: the `overview` and `business-model` sections of the `business-domain-context` map.
4. **Domain Glossary** -- core entities and concepts, UI-label vs code-identifier mapping, enumerations. Output: one `term-<slug>` section per core entity or concept, plus `enumerations` and `discovery-gaps`, in the same map.

**Completion gate**: `bun run context:map business-domain-context --list` prints sections and no placeholder notice; `.context/project-config.md` exists and is non-empty; the `## Project Assessment (Phase 1)` block is in `.agents/instructions/agent-project.md`. Sanity-check content (soft gates, surfaced to the human as warnings, not hard aborts):
- Several `term-` sections exist, one per real core entity from the schema (not one catch-all section, not only enumerations).
- `overview` and `business-model` carry `data-sources` (the reader's `--list` shows them).
- `project-config.md` has a `## Tech Stack` section AND a `## Environments` section.

After the automated sanity check, show the human the map index and the file path, and wait for explicit "Phase 1 complete, continue" before moving on.

Read `references/phase-1-constitution.md` when running any Phase 1 sub-step. Contains the discovery process, stack-detection commands, the content of each domain map section, and quality checklists.

### Phase 2 — Architecture

**Goal**: describe how the system is built, from code (the "discovery" direction, never the "creation" one).

Sub-steps, serially:
1. **Architecture** -- system overview, component structure, database schema at the architecture level, data and auth flow, security model. Output: `infra-context` sections `overview` and `architecture`.
2. **External Services** -- third-party dependencies and their integration points. Output: `external-services`.
3. **Non-Functional** -- performance, security posture, reliability, scalability, observability, compliance. Output: one `nfr-<slug>` section per category that has evidence.

> **Personas, user journeys and functional specs are not discovery outputs.** `project-context` mode `e2e` builds them as the persona, journey and feature sections of `business-e2e-context`.

> **API contracts are NOT a Phase 2 output.** The technical surface is owned by `bun run api:sync`; the business angle is owned by `project-context` mode `api`. Phase 2 records only the spec location (in `.context/project-config.md`) or a discovery gap.

> **Test-architecture ADR seeding (Phase 2 + Phase 3).** When the Architecture / Infrastructure sub-steps settle a hard-to-reverse **test**-architecture decision — test runner/framework, isolation & parallelization model, fixture/test-data strategy, auth-in-tests, selector/`data-testid` contract, exploratory-vs-scripted boundary, CI sharding — promote each one that passes the two-gate test (architectural AND hard to reverse) to a standalone `ADR-NNNN-<slug>.md` in `.context/ADR/`, and cite it in the `architecture` section of the infra map. Greenfield: you are ENCODING the decision; brownfield: you are RECORDING the one you discovered. Follow `agentic-qa-core/references/adr-doctrine.md` (detection + authoring) and `.context/ADR/README.md` (template + lifecycle). AI drafts `Proposed`; the human accepts. A brownfield ADR is written `Proposed` and marked discovered (its Context names the file, config or code where the decision was found, and says nobody decided it in this session); the human confirms it at the phase's completion checkpoint ("Phase N complete"), and only that confirmation flips it to `Accepted`. Never write a discovered decision `Accepted` because the code already does it: the code shows what was built, not that anyone still endorses it.

**Completion gate**: `bun run context:map infra-context --list` shows an `architecture` section and at least one `nfr-` section. The API contract source is recorded in `.context/project-config.md`. Soft content checks:
- `architecture` carries a figure, or a `discovery-gaps` entry explaining why not.
- `external-services` exists, or `discovery-gaps` says none were found and where you looked.
- Every numeric NFR claim cites evidence in its section or sits in `discovery-gaps`.

Show the map index to the human and wait for "Phase 2 complete, continue" before moving on.

Read `references/phase-2-srs.md` when running any Phase 2 sub-step.

### Phase 3 — Infrastructure

**Goal**: make the project runnable and deployable for the test environment.

Three sub-steps:
1. **Backend Discovery** -- language, framework, database, ORM, auth, dependency manager, run/test commands, migrations, env vars. Output: `infra-context` section `backend` (monorepo: `backend-<pkg>`).
2. **Frontend Discovery** -- framework, bundler, routing, state management, design system, component library, test IDs strategy. Output: `frontend` (monorepo: `frontend-<pkg>`).
3. **Infrastructure Mapping** -- CI/CD providers, deployment targets, environments (dev/staging/prod), infra-as-code, monitoring, rollback procedure. Output: `environments` and `ci-cd`.

**Completion gate**: `bun run context:map infra-context --list` shows `backend`, `frontend`, `environments` and `ci-cd` (or their per-package forms) with the key facts (auth flow, test commands, deploy URLs) filled in. Soft content checks:
- `backend` AND `frontend` each carry the commands to install and run (a `<pre><code>` block).
- `environments` holds an environments table (a Staging or Production row).
- `backend` points at the auth flow (e.g., `/auth/login`, `session`, `JWT`, `cookie`, `OAuth`).

Show the map index to the human and wait for "Phase 3 complete, continue" before moving on.

Read `references/phase-3-infrastructure.md` when running any Phase 3 sub-step. Contains framework-detection heuristics, the content of each infra map section, and common gotchas (SSR vs CSR, edge vs serverless, monorepo vs split repos).

### Phase 4 — Specification (backlog connection)

**Goal**: prove the testing framework can reach the team's issue tracker, without duplicating content. Phase 4 writes no file.

One sub-step:
1. **Backlog connection check** -- connect to `{{ISSUE_TRACKER}}` via `[ISSUE_TRACKER_TOOL]`, confirm the project key in `.agents/project.yaml`, run `bun run jira:check` (read `package.json` first to confirm the script), and confirm the hierarchy the sync will use is declared in `.agents/jira-required.yaml`. NEVER write `.context/PBI/README.md` or the committed `templates/`: the access recipe lives in `.context/PBI/README.md` and `.agents/instructions/agent-local-context-pbi.md`.

> **Per-ticket PBI is NOT generated by this skill.** It is materialized later by `/sprint-testing` via `bun run jira:sync-issues get <KEY> --include-comments`, which writes the canonical synced tree `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (Module = Epic, 1:1). Those local `.md` files are a READ-ONLY cache of Jira (Jira = source of truth). This skill does NOT create per-ticket `story.md`.

**Completion gate**: `bun run jira:check` green, or a recorded discovery gap (in `project-config.md` `## Discovery Gaps`) when the team has no tracker access yet. `.context/PBI/README.md` and `.context/PBI/templates/` untouched.

Show the check output to the human and wait for "Phase 4 complete" before emitting the `project-context` handoff.

Read `references/phase-4-specification.md` when running Phase 4.

### Business-context handoff

Business maps and the master test plan are not generated here. After Phase 4, open a clean session and invoke `project-context` mode `refresh-all`. It owns the deterministic sequence `data -> e2e -> api -> test-plan`, including every CREATE/UPDATE approval gate; the maps land inside the business context skills. Exact OpenAPI types remain owned by `bun run api:sync`.

After those outputs exist, invoke `test-framework-adaptation` to wire this boilerplate to the target stack.

---

## Per-phase progress + Archive

After each phase passes its completion gate AND the user confirms "Phase N complete", append a phase entry to `.session/project-discovery/progress.md`. Entries end at Phase 4; the next action is the separate `project-context` skill.

After Phase 4 passes, archive the project-discovery session per `agentic-qa-core/references/session-management.md` §8 and record the `project-context refresh-all` handoff. Context generation has its own lifecycle and does not keep this session open.

On Phase-gate REJECT (user marks a phase incomplete or finds a Discovery Gap that blocks), archive does NOT run. The working directory stays so resume picks up at the failing gate.

---

## Next recommended steps (emit after Phase 4 completes)

Discovery populates the domain map, the infra map and `project-config.md`, and checks the backlog connection. It does not invoke `project-context`, which is token-heavy and best run in a clean session.

When Phase 4 is confirmed complete, print this block to the user verbatim:

```
Discovery complete. `/project-discovery` has populated:
- `business-domain-context` map (business model + glossary): `bun run context:map business-domain-context`
- `infra-context` map (architecture, NFRs, backend, frontend, environments, CI/CD): `bun run context:map infra-context`
- .context/project-config.md
- Backlog connection check: `bun run jira:check` <green | discovery gap: why>

**Recommended next skill** (run in a clean session):

`project-context` mode `refresh-all`

It runs data -> e2e -> api -> test-plan in dependency order, writes the maps inside `business-data-context`, `business-e2e-context` and `business-api-context`, and can be re-run whenever project context becomes stale (UPDATE regenerates only stale sections).

**Seed input for the master test plan** (`project-context` mode `test-plan`): the HIGH risks from the Phase 1 assessment:
- <risk, severity, evidence path> (or "none recorded")

After it completes, invoke `test-framework-adaptation` to wire KATA against the target stack.

**Judgment the context skills could start with** (proposed, not written: each becomes a dated rule in that skill's `## Rules` after its map is generated and the user approves):
- `business-domain-context`: <one line: a term the team and the code name differently, or "no candidate yet">
- `infra-context`: <one line: an environment-only behaviour, or "no candidate yet">
- `business-data-context`: <one line: the judgment a session needs to read the data right, or "no candidate yet">
- `business-api-context`: <one line, or "no candidate yet">
- `business-e2e-context`: <one line, or "no candidate yet">

**Other context skills this project could carry** (proposed, not created: `project-context` mode `context-skill <aspect>` creates each one through `skill-creator`, once what it sits over exists):
- <any other aspect the discovery surfaced>: <one line>
```

The judgment lines cover the context skills in `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`); the template names each slug only because it is a fill-in. Fill each proposal line from what the phases actually found: a soft-delete convention, a derived field, an auth edge case, an environment-only behaviour. A proposal is one sentence naming the judgment, never a file: the facts go in the map, and a rule is born later, over an approved map, with its date. "No candidate yet" is a valid line.

Do not auto-chain the handoff inside this session. Context generation needs its own token budget and approval lifecycle.

### Pre-test-framework-adaptation checklist

<!-- keep in sync with .agents/skills/test-framework-adaptation/references/adaptation-workflow.md §Hard prerequisites -->

Before the user invokes `test-framework-adaptation`, verify every item below. A missing domain or infra map routes back to the matching discovery phase; a missing business map routes to the matching `project-context` mode.

- [ ] `business-domain-context` holds a generated map (`bun run context:map business-domain-context` prints sections, no placeholder notice)
- [ ] `infra-context` holds a generated map with its `backend` and `frontend` sections (`bun run context:map infra-context --list`)
- [ ] `.context/project-config.md`
- [ ] `business-data-context` holds a generated map (`bun run context:map business-data-context` prints sections, no placeholder notice)
- [ ] API contract source: one of `api/openapi-types.ts` (non-stub) OR reachable OpenAPI spec URL OR a generated `business-api-context` map (business-angle fallback)
- [ ] `.env.example` (and `.env` either present or created during `test-framework-adaptation`)

Handoff line to print to the user:

> Discovery handoff complete. Run `project-context refresh-all`, then invoke `test-framework-adaptation` when every prerequisite above is present.

---

## Stack-specific discovery rules

Base stack detection (package.json → Node, pyproject.toml → Python, go.mod → Go, `next.config.*` → Next.js, etc.) is a baseline skill any AI has. This section only lists **actions the skill should take based on what is detected** — rules that are not obvious from general programming knowledge.

| Signal | Action for discovery |
|--------|----------------------|
| Monorepo (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or top-level `package.json` with no deps of its own) | Split backend/frontend per package. Run Phase 1 **once** (project-level), Phase 2-3 **per package**. Merge into the one infra map as per-package sections (`backend-<pkg>`, `frontend-<pkg>`). |
| Multiple coexisting signals in one repo (e.g., Next.js + Express) | Almost always a monorepo — treat frontend and backend as separate discoveries even if workspace config is missing. Do NOT merge them into one `backend` / `frontend` section. |
| `Dockerfile` + `docker-compose.yml` present | Read compose for service inventory **before** scanning source — it is the authoritative runtime topology. Use source only to fill gaps. |
| No test framework deps detected | Greenfield test story. Phase 3 documents the absence as a Discovery Gap. **Do NOT install tooling in the target repo.** `test-framework-adaptation` wires this boilerplate's own test stack; it never modifies the target. |
| `.github/workflows/*.yml` present | Extract the test job from CI for Phase 3 Infrastructure — usually the cleanest source for "how CI runs tests". |
| API handlers found but no OpenAPI spec | Flag as a discovery gap in Phase 2 (infra map `discovery-gaps`). Do NOT hand-write an OpenAPI inside project-discovery; ask for a spec or defer the business angle to `project-context` mode `api`. |
| Hardcoded secrets detected (grep hits in source) | HIGH risk. Record it in the Phase 1 assessment's `### Identified Risks` table, path only, and carry it to the MTP seed in the handoff. Do NOT paste the secret into any discovery output. |

---

## Gotchas

- **Discovery is read-only on the target repo.** It writes only `.context/project-config.md`, `.context/ADR/` and the domain and infra maps (see Compact Rules). For modifications to this boilerplate, use `test-framework-adaptation`.
- **Hard-to-reverse test decisions become ADRs, not buried prose.** When Phase 2/3 settles a test-runner, isolation, fixture/data, auth-in-tests, or selector-contract decision that is architectural AND hard to reverse, record it as `.context/ADR/ADR-NNNN-<slug>.md` (append-only) instead of leaving it only inside the infra map's `architecture` section. Draft `Proposed`; the human approves. A brownfield ADR is also marked discovered and confirmed at the phase's completion checkpoint. See `agentic-qa-core/references/adr-doctrine.md`.
- **Credentials never live in discovery docs.** Read them from `.env` (`LOCAL_USER_EMAIL`, `STAGING_USER_EMAIL`, etc.). If missing, ask the user to create `.env.example` or hand over secrets out-of-band -- do not paste them into markdown.
- **A discovery-gaps record is mandatory in every output.** If you could not verify something from the code (e.g., traffic volume, uptime targets), list it in the map's `discovery-gaps` section (or `project-config.md` `## Discovery Gaps`) rather than inventing a number. This signals to future sessions what still needs human input.
- **What discovery writes from code is authoritative, not aspirational.** Describe what the system does, not what product wants it to do. If the user wants a "to-be" PRD/SRS, that is *creation* (out of scope for this skill); point them to their own product workflow.
- **Do not duplicate the backlog.** Jira/Linear/GitHub Issues is the source of truth for tickets. `.context/PBI/` never holds a copy of the full backlog. Per-ticket PBI is synced on demand from Jira by `/sprint-testing` (`bun run jira:sync-issues`) as a read-only cache; this skill does not create it.
- **Monorepos require scoped discovery.** Run Phase 1 once (project as a whole) but Phases 2-3 per package. Merge findings into the one infra map as per-package sections (`backend-<pkg>`, `frontend-<pkg>`).
- **Database schemas over ORM models.** If both exist, prefer the migration files / schema dump over the ORM definitions -- ORM definitions can drift from the live schema.
- **API base URL vs route prefix.** `{{environments.local.api_url}}` includes the protocol+host; route prefixes (e.g., `/api/v1`) belong in the path. Do not concatenate them twice in any context file that documents endpoints (e.g., the `business-api-context` map).
- **Auth flow is the single most important input for downstream `test-framework-adaptation`.** Capture the real login request in the infra map's `backend` section so adaptation has a concrete contract.
- **Refresh only your own maps here.** The domain and infra maps are refreshed by re-running their phase in UPDATE mode (stale sections only, approval first). Route the data, API and E2E maps to `project-context`, which owns their diff and overwrite approval.
- **Context modes need grounded discovery.** If the user requests a business map on a fresh repo, complete at least Phase 1 and Phase 3 before handing off.
- **IQL framing is optional.** Mention it only if the user asks "why this structure?" -- do not lecture them on methodology when they just want a working data map.
- **API requests get redirected.** Use `bun run api:sync` for technical types and `project-context` mode `api` for the business angle.

---

## Templates (inline -- small, load-bearing)

### Discovery gaps (every output)

In `project-config.md`, a markdown block; in a map, the closing `<section id="discovery-gaps">` carries the same list as a `<ul>`.

```markdown
## Discovery Gaps

The following items could not be verified from code and require human confirmation:

- [ ] <Gap>: <what is missing, where you looked, suggested source of truth>
- [ ] ...
```

### Phase completion ping (used after each phase)

```
Phase N complete.
Written:
- <file path, or `<slug>` map sections: <id>, <id>, ...>
Read back: bun run context:map <slug> --list
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

The content of each domain and infra map section lives in the phase references; the map anatomy lives in `agentic-qa-core/references/business-context-maps.md` §2; the business map structure lives in `project-context`.

---

## Specific tasks -- which reference to read

- **Phase 1 (project connection, assessment, business model, glossary → `business-domain-context` map)** -> read `references/phase-1-constitution.md`.
- **Phase 2 (architecture, external services, non-functional → `infra-context` map; API contract source)** -> read `references/phase-2-srs.md`.
- **Phase 3 (backend, frontend, environments, CI/CD → `infra-context` map)** -> read `references/phase-3-infrastructure.md`.
- **Map anatomy, reading, CREATE/UPDATE, staleness, diagrams** -> read `agentic-qa-core/references/business-context-maps.md`.
- **Recording a hard-to-reverse test-architecture decision (ADR)** -> read `agentic-qa-core/references/adr-doctrine.md` + `.context/ADR/README.md`.
- **Phase 4 (backlog connection check)** -> read `references/phase-4-specification.md`.
- **Personas, journeys, functional specs** -> NOT this skill. `project-context` mode `e2e`.
- **Generating or refreshing business maps and master test plan** -> NOT this skill. Invoke the matching `project-context` mode.
- **API endpoint sync** -> `bun run api:sync` for technical types; `project-context` mode `api` for business narrative.
- **User asks about IQL methodology** -> `iql-context` (the methodology index: it cites the official site https://upexgalaxy.com/metodologia for the narrative and `agentic-qa-core/references/stage-gates.md` for the enforced per-stage contract). This skill carries no IQL reference of its own.
- **Code exploration (grep, read files)** -> use built-in tools. If the user wants a browser-driven exploration instead (UI-first discovery), load `/playwright-cli` skill.
- **Issue-tracker operations (Phase 4)** -> resolve `[ISSUE_TRACKER_TOOL]` via AGENTS.md Tool Resolution. For Jira, load `/acli` skill (primary) or fall back to the Atlassian MCP. If the project also uses Xray for TMS, load `/xray-cli` additionally.
- **Database inspection** -> resolve `[DB_TOOL]`; read-only queries only during discovery.
- **Session contract (Phase 0 resume, plan.md/progress.md schemas, archive policy, Engram per-phase checkpoint)** -> read `../agentic-qa-core/references/session-management.md`. This skill is a producer of `session/project-discovery/...` topic keys.

---

## Anti-patterns — NEVER do these

- **P1.** NEVER invent business entities, flows, or requirements not present in the target repo code or PRD. Discovery is reverse-engineering, not aspirational design — unverified items go in a `discovery-gaps` section, never inline.
- **P2.** NEVER skip Phase 1 (Constitution) when starting fresh. Downstream phases (architecture, infrastructure, backlog connection) assume the project values and stack are fixed first; skipping leaves later artifacts ungrounded.
- **P3.** NEVER fill the data, API or E2E maps (the HTML inside `business-data-context`, `business-api-context`, `business-e2e-context`) from this skill. `project-context` re-reads evidence and owns those artifacts. This skill generates only the `business-domain-context` and `infra-context` maps.
- **P4.** NEVER mix `project-discovery` with `test-framework-adaptation` in the same session. Their write boundaries differ.
- **P5.** NEVER use `project-discovery` for incremental updates of the data, API or E2E maps. Use `project-context`. Its own two maps are updated section by section, never regenerated whole.
- **P6.** NEVER skip the domain glossary in Phase 1. It lives in `business-domain-context`, and downstream skills load that skill as a precondition when its map is generated: `sprint-testing` lists it in its Stage 1 planning inputs (ATP, refined ACs, TC outlines) and `test-documentation` uses it as the vocabulary reference for TC naming and bodies.
- **P7.** NEVER fabricate Jira / Xray field IDs or status names in the Master Test Plan or any PBI template. Run `bun run jira:sync-fields --force` and reference `{{jira.<slug>}}` via the slug catalog in `.agents/jira-required.yaml`.

---

## Quick reference

```bash
# Phase 1 — Project Connection (detection commands)
ls -la <target-repo>                      # repo root
cat <target-repo>/package.json | jq .     # JS/TS stack
cat <target-repo>/pyproject.toml          # Python stack
ls <target-repo>/.github/workflows        # CI presence
find <target-repo> -maxdepth 2 -name "docker-compose*.yml" -o -name "Dockerfile"

# Phase 2 — Architecture source-of-truth order
# 1. Read routes (frontend app/ or pages/ or router.ts)
# 2. Read API handlers (src/controllers/ or src/routes/ or src/api/)
# 3. Read DB schema (prisma/schema.prisma, migrations/, schema.sql)
# 4. Read auth config (middleware.ts, auth.config.ts, passport config)

# Phase 3 — Infrastructure
cat <target-repo>/.env.example             # env var contract
grep -r "process.env\." <target-repo>/src  # env vars actually read
cat <target-repo>/.github/workflows/*.yml  # CI/CD pipeline

# Post-discovery context handoff (separate skill):
#   project-context refresh-all     # data -> e2e -> api -> test-plan
#   bun run api:sync                # exact API types from OpenAPI

# Read back the two maps discovery generates
bun run context:map business-domain-context --list
bun run context:map infra-context --list

# Issue tracker (Phase 4): connection check, writes no file
# Prerequisite: Load /acli skill before executing the commands below.
bun run jira:check
[ISSUE_TRACKER_TOOL] Get Issue:
  key: {{PROJECT_KEY}}-1
```
