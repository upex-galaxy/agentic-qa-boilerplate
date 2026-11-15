---
name: project-discovery
description: "Onboard a project by reverse-engineering its code into a domain map and an infra map. Use when setting up or onboarding a repo; connecting to a project; discovering architecture; creating a PRD or SRS from existing code. Not for incremental refresh (`project-context`)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [meta-skill]
metadata:
  kind: workflow
  requires_capabilities: [db, api-schema, diagrams]
---

# Project Discovery: Onboarding Orchestrator

Turn an unknown codebase into a testable project. Four phases, always in order, each gated on the one before. The output is the domain map and the infra map inside their context skills, plus `.context/project-config.md`: the knowledge the rest of the skills (`shift-left-testing`, `sprint-testing`, `test-automation`, `test-documentation`, `regression-testing`) rely on.

The discovery is conversational: you read the code, ask when something is ambiguous, and confirm before writing files. If you cannot verify a claim from the source, mark it as a Discovery Gap and move on.

The grounding methodology is IQL (Integrated Quality Lifecycle): QA is continuous from requirement to release, not a gate at the end. The stage contract every QA skill enforces lives in `agentic-qa-core/references/stage-gates.md`; the narrative is the official IQL site (https://upexgalaxy.com/metodologia in Spanish, https://upexgalaxy.com/en/methodology in English). Mention it only when the user asks why the discovery is structured this way, and then point to `iql-context`.

---

## Compact Rules

- Run the four phases in order (Constitution, Architecture, Infrastructure, Specification), each gated on the previous. Show the output paths and wait for an explicit "Phase N complete" before continuing, because each phase builds on facts the human has just confirmed. Never auto-chain.
- Discovery is read-only on the target repo. The write targets are `.context/project-config.md`, `.context/ADR/`, and the maps of `business-domain-context` and `infra-context` (their `references/<map>.html`), plus the Phase 1 `## Project Assessment (Phase 1)` block in `.agents/instructions/agent-project.md`. Nothing else. Modifying the boilerplate itself is `test-framework-adaptation`.
- You are the generator of those two maps, per `agentic-qa-core/references/business-context-maps.md` (anatomy §2, reading §3, CREATE/UPDATE §4, staleness §5). Map absent or placeholder: CREATE every section. Map generated: UPDATE only the stale sections (§5 staleness check), show a section-level diff and wait for approval. Never regenerate a whole generated map.
- Read a project's old `.context/business/`, `.context/SRS/` and `.context/infrastructure/` markdown files (the `legacy` list of `business-domain-context` and `infra-context` in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) as input when present. Cite them in `data-migrated-from` on the sections they seed, and leave them in place untouched.
- Before drawing a figure, run the point-of-use check for capability `diagrams` (`agentic-qa-core/references/business-context-maps.md` §7). Figures are optional where a table says it better: the glossary is tables, the architecture overview usually earns a figure.
- Describe what the system does, not what product wants it to do. Discovery is reverse-engineering; a to-be PRD or SRS is out of scope, so point the user at their own product workflow. Do not invent business entities, flows, requirements, or Jira and Xray field IDs and status names: anything you cannot verify goes in the map's `discovery-gaps` section (or the `## Discovery Gaps` block of `project-config.md`). Field IDs come from `bun run jira:sync-fields --force` and are referenced as `{{jira.<slug>}}` through the slug catalog in `.agents/jira-required.yaml`.
- Lock the target repo path(s) before Phase 1 and stop on ambiguity. A repo that is not cloned locally cannot be discovered from a URL, so ask for the clone first.
- Split sibling repos: run the Phase 1 sub-steps once per repo and merge into one `project-config.md`, never interleaved. Monorepo: Phase 1 once project-wide, Phases 2-3 per package.
- Do not fill the `business-data-context`, `business-api-context` or `business-e2e-context` maps, and do not write personas, journeys, the feature catalog or the master test plan here. Those are `project-context` modes, which own their diff and overwrite approval. Exact API types are `bun run api:sync`.
- Do not create per-ticket PBI content or copy the backlog. Phase 4 is a connection check and writes no file; the committed `README.md` and `templates/` under `.context/PBI/` stay untouched.
- Do not paste credentials or a detected secret into any discovery output. Reference the `.env` key or the file path only; a hardcoded-secret hit is recorded as a HIGH risk (path only) in the Phase 1 assessment.
- When Phase 2 or 3 settles a test-architecture decision that passes the three-gate test of `agentic-qa-core/references/adr-doctrine.md` (hard to reverse, surprising without context, a real trade-off), record it as an append-only ADR under `.context/ADR/`, drafted `Proposed` for the human to accept. In a brownfield repo the decision was discovered, not made here: write it `Proposed`, mark it discovered (where it was found), and have the human confirm it at that phase's completion checkpoint, which flips it to `Accepted`.
- Keep discovery sessions separate from `test-framework-adaptation` sessions, and do not use this skill for incremental refreshes of the other maps: the write boundaries differ.
- Do not skip Phase 1 or its domain glossary on a fresh start. Later phases assume the project's values and stack are fixed, and downstream skills load `business-domain-context` as a precondition for ATP authoring and TC naming.
- When a DB schema or migrations and ORM models both exist, prefer the schema or migrations: ORM definitions drift from the live schema.
- Before any step that uses a declared capability (`metadata.requires_capabilities`: `db`, `api-schema`, `diagrams`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: resolve by tool-name suffix, and when no available tool provides it, stop and name the capability and how to enable it. No silent fallback.

**Read full SKILL.md when**: running any phase's sub-steps, applying a completion gate's content checks, or resolving the pre-`test-framework-adaptation` prerequisite list.

---

## Inputs

The reading order when starting cold. Stop earlier when the scope is small enough that later inputs add no signal.

1. **Target project repo**: the path resolved at session start (see "Before starting: target repo location"). Code and any in-repo PRD are the primary source of truth.
2. **Target repo's `README.md` and existing onboarding docs**: the fastest path to project intent, stack signals and run commands.
3. **Prior discovery state**, if any: `bun run context:map business-domain-context --list` and `bun run context:map infra-context --list`, `.context/project-config.md`, and any legacy markdown under `.context/business/`, `.context/SRS/`, `.context/infrastructure/` (input only). It informs the Phase 0 resume decision and CREATE versus UPDATE.
4. **`.agents/project.yaml` and `.env.example`**: the variable patterns (`{{PROJECT_KEY}}`, env URLs, MCP names) every downstream context file references.
5. **`kata-manifest.json`**: the existing KATA Components and ATCs, so discovery records gaps against what the boilerplate already expects.
6. **`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md`**: the downstream handoffs (`project-context`, `test-framework-adaptation`, `sprint-testing`, `test-documentation`).
7. **Business and domain docs the user supplies** (Confluence, Notion exports, internal wikis): a secondary source for the business model and glossary when in-repo signal is thin.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is project-scope, so there is no `<scope>` segment: session state lives at `.session/project-discovery/{plan.md, progress.md}` (`session-management.md` §3 and §9). A run takes hours across four hard gates, so per-phase checkpoints pay off: if it stops between Phase 2 and Phase 3, resume reads `progress.md` and goes back to the first incomplete phase without re-asking for confirmed scope.

Dispatch depth per scope is in "Pick the scope first": fresh onboarding delegates each phase heavily, boilerplate adoption moderately, brownfield and context refresh stay in the main session.

---

## Phase 0 (session resume check, mandatory, inline)

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

## Waiting for a person

This skill stops for a person at several points: the Phase 0 resume offer, the scope confirmation, an ambiguous target repo, each "Phase N complete", a map UPDATE diff, an ADR confirmation, and a missing credential. `agentic-qa-core/references/decision-protocol.md` decides whether a given question reaches a human at all; these are the paths when it does.

| Who is running | What happens at each stop |
|---|---|
| A person is present | Ask and wait, as written in the phases. |
| A supervised worker | The conductor that launched it holds the gate. Send the question, the output paths and the read-back command to it, and wait for its answer. |
| A routine, nobody present | The delegating brief is the approval when it covers the decision. Without one, do the reversible work (read-only discovery, map sections in CREATE mode, `Proposed` ADRs), record it in `progress.md`, and stop at the gate with a report. Never chain into the next phase, never flip an ADR to `Accepted`, never apply a map UPDATE diff, never restart or archive an existing session (resume is the safe default), and never guess an ambiguous repo path or write a credential. |

Phase 4 only reads the tracker, so a routine can run the check; the `project-context` handoff is printed, never started.

---

## Before starting: target repo location

`/project-discovery` runs read-only against a project under test, the target repo, which is not this boilerplate. Lock down where the target lives before Phase 1 starts, and block Phase 1 if the path is ambiguous.

| Layout | What to declare | How to detect |
|--------|-----------------|---------------|
| **Monorepo** (single repo contains FE + BE) | Absolute or relative path from this repo | Check the candidate path for `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or a top-level `package.json` with no deps of its own |
| **Split sibling repos** (FE and BE cloned separately) | One path per repo (or a common parent dir) | Look at `../`-level siblings with plausible names (`*-backend`, `*-frontend`, `*-api`, `*-web`); confirm with the user |
| **Remote (not cloned yet)** | Repo URL + branch, then ask the user to clone locally before Phase 1 | `gh repo view` only returns metadata; real discovery needs local file access |

Record the resolved path(s) in `.context/project-config.md` §Repositories during Phase 1 sub-step 1 (Project Connection). Every `<target-repo>` reference in later phases resolves to the path declared here. Split sibling repos follow the Compact Rules: one pass per repo, one merged `project-config.md`.

---

## Pick the scope first

All projects go through the same four phases; depth varies. Pick once, then follow the common pipeline.

| Scenario | Input | Phases to run | Typical depth | Context weight & subagent hint |
|----------|-------|---------------|---------------|--------------------------------|
| **Fresh onboarding** (greenfield or unseen project) | Repo URL or local path(s), no existing context files | 1 -> 2 -> 3 -> 4, then `project-context refresh-all` | Full discovery. Business maps and test strategy are generated by their dedicated skill. After context completion, run `test-framework-adaptation`. | **Heavy.** Delegate each phase's code survey to a dedicated subagent. |
| **Boilerplate adoption** (this repo adopted for a new project) | Target app repo(s), this repo as the test framework | 1 -> 3, then `project-context` for missing maps | Phase 1 runs in full: the domain map is a `test-framework-adaptation` prerequisite. Skip Phase 2 or 4 only when their required artifacts already exist. Verify files on disk before `test-framework-adaptation`. | **Medium.** Delegate Phase 1 and Phase 3 per package for monorepos. |
| **Brownfield** (project already documented, tests missing) | Existing `.context/` partially filled | 2 (gaps) -> 3 (gaps) -> 4 (gaps), then `project-context` for stale maps | Fill discovery gaps here; refresh map artifacts in their owning skill. | **Light.** Main session unless gaps span many files. |
| **Context refresh** | User asks to regenerate a business map or master test plan | Redirect to the matching `project-context` mode | This skill does not refresh those artifacts. For the domain or infra map, re-run Phase 1 or Phases 2-3 in UPDATE mode (stale sections only). For a backlog connection change, re-run Phase 4. For exact OpenAPI types, use `bun run api:sync`. | **Minimal.** Handoff only. |

Default to fresh onboarding when in doubt, and confirm the scope with the user before starting Phase 1.

After scope confirmation, write `.session/project-discovery/plan.md` per `agentic-qa-core/references/session-management.md` §6. The phase breakdown ends at Phase 4; record `project-context refresh-all` as the post-discovery handoff, not as a discovery phase.

---

## Workflow: the 4-phase pipeline

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

KATA adaptation is a separate skill, `test-framework-adaptation`, which runs after discovery and context outputs exist.

Each phase has a completion gate: before moving on, the phase's sections must print through `bun run context:map` with real content, and the files it names must exist on disk. Ask the user to confirm after each phase.

### Phase 1: Constitution (who, what, why)

**Goal**: make the project legible. Every future session reads these outputs.

Four sub-steps, in order:

1. **Project Connection**: repo paths, tech stack detection, environment URLs, credentials from `.env`, team contacts. Output: `.context/project-config.md`.
2. **Project Assessment**: current testing maturity (frameworks in place, CI presence, lint and typecheck, coverage). Output: the `## Project Assessment (Phase 1)` block in `.agents/instructions/agent-project.md`. HIGH risks (a hardcoded-secret hit included, path only) are recorded there and carried to the handoff as seed input for `project-context` mode `test-plan` (the MTP). No separate risk file is written.
3. **Business Model Discovery**: problem statement, target users, value proposition, revenue model if any. Output: the `overview` and `business-model` sections of the `business-domain-context` map.
4. **Domain Glossary**: core entities and concepts, UI-label versus code-identifier mapping, enumerations. Output: one `term-<slug>` section per core entity or concept, plus `enumerations` and `discovery-gaps`, in the same map.

**Completion gate**: `bun run context:map business-domain-context --list` prints sections and no placeholder notice; `.context/project-config.md` exists and is non-empty; the `## Project Assessment (Phase 1)` block is in `.agents/instructions/agent-project.md`. Content checks are soft gates, shown to the human as warnings, not hard aborts:
- Several `term-` sections exist, one per real core entity from the schema (not one catch-all section, not only enumerations).
- `overview` and `business-model` carry `data-sources` (the reader's `--list` shows them).
- `project-config.md` has a `## Tech Stack` section AND a `## Environments` section.

After the sanity check, show the human the map index and the file path, and wait for an explicit "Phase 1 complete, continue".

Read `references/phase-1-constitution.md` when running any Phase 1 sub-step. It has the discovery process, stack-detection commands, the content of each domain map section, and quality checklists.

### Phase 2: Architecture

**Goal**: describe how the system is built, from code (the discovery direction, never the creation one).

Sub-steps, serially:
1. **Architecture**: system overview, component structure, database schema at the architecture level, data and auth flow, security model. Output: `infra-context` sections `overview` and `architecture`.
2. **External Services**: third-party dependencies and their integration points. Output: `external-services`.
3. **Non-Functional**: performance, security posture, reliability, scalability, observability, compliance. Output: one `nfr-<slug>` section per category that has evidence.

> Personas, user journeys and functional specs are not discovery outputs. `project-context` mode `e2e` builds them as the persona, journey and feature sections of `business-e2e-context`.

> API contracts are not a Phase 2 output. The technical surface is owned by `bun run api:sync`; the business angle is owned by `project-context` mode `api`. Phase 2 records only the spec location (in `.context/project-config.md`) or a discovery gap.

> **Test-architecture ADR seeding (Phase 2 and Phase 3).** When the Architecture or Infrastructure sub-steps settle a test-architecture decision (test runner or framework, isolation and parallelization model, fixture and test-data strategy, auth-in-tests, selector or `data-testid` contract, exploratory-versus-scripted boundary, CI sharding), apply the three-gate test of `agentic-qa-core/references/adr-doctrine.md`: hard to reverse, surprising without context, a real trade-off. Each decision that passes all three becomes a standalone `ADR-NNNN-<slug>.md` in `.context/ADR/`, cited in the `architecture` section of the infra map. Greenfield: you are encoding the decision. Brownfield: you are recording the one you found. The doctrine has detection and authoring, and `.context/ADR/README.md` has the template and lifecycle. The AI drafts `Proposed`; the human accepts. A brownfield ADR is written `Proposed` and marked discovered: its Context names the file, config or code where the decision was found and says nobody decided it in this session. The human confirms it at the phase's completion checkpoint ("Phase N complete"), and only that confirmation flips it to `Accepted`. The code shows what was built, not that anyone still endorses it, so a discovered decision is never written `Accepted` on the code's say-so.

**Completion gate**: `bun run context:map infra-context --list` shows an `architecture` section and at least one `nfr-` section. The API contract source is recorded in `.context/project-config.md`. Soft content checks:
- `architecture` carries a figure, or a `discovery-gaps` entry explaining why not.
- `external-services` exists, or `discovery-gaps` says none were found and where you looked.
- Every numeric NFR claim cites evidence in its section or sits in `discovery-gaps`.

Show the map index to the human and wait for "Phase 2 complete, continue".

Read `references/phase-2-srs.md` when running any Phase 2 sub-step.

### Phase 3: Infrastructure

**Goal**: make the project runnable and deployable for the test environment.

Three sub-steps:
1. **Backend Discovery**: language, framework, database, ORM, auth, dependency manager, run and test commands, migrations, env vars. Output: `infra-context` section `backend` (monorepo: `backend-<pkg>`).
2. **Frontend Discovery**: framework, bundler, routing, state management, design system, component library, test IDs strategy. Output: `frontend` (monorepo: `frontend-<pkg>`).
3. **Infrastructure Mapping**: CI/CD providers, deployment targets, environments (dev, staging, prod), infra-as-code, monitoring, rollback procedure. Output: `environments` and `ci-cd`.

**Completion gate**: `bun run context:map infra-context --list` shows `backend`, `frontend`, `environments` and `ci-cd` (or their per-package forms) with the key facts (auth flow, test commands, deploy URLs) filled in. Soft content checks:
- `backend` AND `frontend` each carry the commands to install and run (a `<pre><code>` block).
- `environments` holds an environments table (a Staging or Production row).
- `backend` points at the auth flow (for example `/auth/login`, `session`, `JWT`, `cookie`, `OAuth`).

Show the map index to the human and wait for "Phase 3 complete, continue".

Read `references/phase-3-infrastructure.md` when running any Phase 3 sub-step. It has framework-detection heuristics, the content of each infra map section, and common gotchas (SSR versus CSR, edge versus serverless, monorepo versus split repos).

### Phase 4: Specification (backlog connection)

**Goal**: prove the testing framework can reach the team's issue tracker, without duplicating content. Phase 4 writes no file.

One sub-step:
1. **Backlog connection check**: connect to `{{ISSUE_TRACKER}}` via `[ISSUE_TRACKER_TOOL]`, confirm the project key in `.agents/project.yaml`, run `bun run jira:check` (read `package.json` first to confirm the script), and confirm the hierarchy the sync will use is declared in `.agents/jira-required.yaml`. Do not write `.context/PBI/README.md` or the committed `templates/`: the access recipe lives in `.context/PBI/README.md` and `.agents/instructions/agent-local-context-pbi.md`.

> Per-ticket PBI is not generated by this skill. `/sprint-testing` materializes it later through `bun run jira:sync-issues get <KEY> --include-comments`, which writes the canonical synced tree `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (Module = Epic, 1:1). Those local `.md` files are a read-only cache of Jira, which stays the source of truth.

**Completion gate**: `bun run jira:check` green, or a recorded discovery gap (in `project-config.md` `## Discovery Gaps`) when the team has no tracker access yet. `.context/PBI/README.md` and `.context/PBI/templates/` untouched.

Show the check output to the human and wait for "Phase 4 complete" before emitting the `project-context` handoff.

Read `references/phase-4-specification.md` when running Phase 4.

### Business-context handoff

Business maps and the master test plan are not generated here. After Phase 4, open a clean session and invoke `project-context` mode `refresh-all`. It owns the sequence `data -> e2e -> api -> test-plan`, including every CREATE and UPDATE approval gate, and the maps land inside the business context skills. Exact OpenAPI types stay with `bun run api:sync`.

After those outputs exist, invoke `test-framework-adaptation` to wire this boilerplate to the target stack.

---

## Per-phase progress and archive

After each phase passes its completion gate and the user confirms "Phase N complete", append a phase entry to `.session/project-discovery/progress.md`. Entries end at Phase 4; the next action is the separate `project-context` skill.

After Phase 4 passes, archive the session per `agentic-qa-core/references/session-management.md` §8 and record the `project-context refresh-all` handoff. Context generation has its own lifecycle and does not keep this session open.

When the user rejects a phase or finds a Discovery Gap that blocks, archive does not run. The working directory stays so resume picks up at the failing gate.

---

## Next recommended steps (emit after Phase 4 completes)

Discovery populates the domain map, the infra map and `project-config.md`, and checks the backlog connection. It does not invoke `project-context`: that skill is token-heavy and runs best in a clean session, with its own budget and approval lifecycle. Do not auto-chain the handoff inside this session.

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

The judgment lines cover the context skills in `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`); the template names each slug only because it is a fill-in. Fill each proposal from what the phases found: a soft-delete convention, a derived field, an auth edge case, an environment-only behaviour. A proposal is one sentence naming the judgment, never a file: the facts go in the map, and a rule is born later, over an approved map, with its date. "No candidate yet" is a valid line.

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

Base stack detection (`package.json` means Node, `pyproject.toml` Python, `go.mod` Go, `next.config.*` Next.js) is baseline knowledge. This table lists only the actions to take on what is detected.

| Signal | Action for discovery |
|--------|----------------------|
| Monorepo (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or top-level `package.json` with no deps of its own) | Split backend/frontend per package. Run Phase 1 **once** (project-level), Phase 2-3 **per package**. Merge into the one infra map as per-package sections (`backend-<pkg>`, `frontend-<pkg>`). |
| Multiple coexisting signals in one repo (e.g., Next.js + Express) | Almost always a monorepo: treat frontend and backend as separate discoveries even if workspace config is missing, and do not merge them into one `backend` or `frontend` section. |
| `Dockerfile` + `docker-compose.yml` present | Read compose for the service inventory before scanning source: it is the authoritative runtime topology. Use source only to fill gaps. |
| No test framework deps detected | Greenfield test story. Phase 3 documents the absence as a Discovery Gap. Do not install tooling in the target repo: `test-framework-adaptation` wires this boilerplate's own test stack and never modifies the target. |
| `.github/workflows/*.yml` present | Extract the test job from CI for Phase 3 Infrastructure: usually the cleanest source for how CI runs tests. |
| API handlers found but no OpenAPI spec | Flag as a discovery gap in Phase 2 (infra map `discovery-gaps`). Do not hand-write an OpenAPI here; ask for a spec or defer the business angle to `project-context` mode `api`. |
| Hardcoded secrets detected (grep hits in source) | HIGH risk. Record it in the Phase 1 assessment's `### Identified Risks` table, path only, and carry it to the MTP seed in the handoff. Do not paste the secret into any discovery output. |

---

## Gotchas

- Credentials never live in discovery docs. Read them from `.env` (`LOCAL_USER_EMAIL`, `STAGING_USER_EMAIL`, etc.). If missing, ask the user to create `.env.example` or hand over secrets out-of-band, and do not paste them into markdown.
- Every output carries a discovery-gaps record. If you could not verify something from the code (traffic volume, uptime targets), list it in the map's `discovery-gaps` section (or `project-config.md` `## Discovery Gaps`) instead of inventing a number. It tells future sessions what still needs human input.
- Hard-to-reverse test decisions become ADRs, not buried prose. A test-runner, isolation, fixture or data, auth-in-tests or selector-contract decision that passes the three-gate test goes to `.context/ADR/ADR-NNNN-<slug>.md` (append-only) rather than staying only in the infra map's `architecture` section. See the ADR seeding note in Phase 2 and `agentic-qa-core/references/adr-doctrine.md`.
- The backlog is not copied. Jira, Linear or GitHub Issues is the source of truth for tickets; `.context/PBI/` never holds the full backlog, and per-ticket PBI is synced on demand by `/sprint-testing` (`bun run jira:sync-issues`) as a read-only cache.
- Refresh only your own maps here. The domain and infra maps are refreshed by re-running their phase in UPDATE mode (stale sections only, approval first). The data, API and E2E maps go to `project-context`.
- A business map requested on a fresh repo needs at least Phase 1 and Phase 3 complete before the handoff.
- API requests get redirected: `bun run api:sync` for technical types, `project-context` mode `api` for the business angle.
- `{{environments.local.api_url}}` includes protocol and host; route prefixes (for example `/api/v1`) belong in the path. Do not concatenate them twice in any context file that documents endpoints (the `business-api-context` map, for one).
- The auth flow is the most important input for `test-framework-adaptation`. Capture the real login request in the infra map's `backend` section so adaptation has a concrete contract.

---

## Templates (inline, small and load-bearing)

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

## Specific tasks: which reference to read

- Phase 1 (project connection, assessment, business model, glossary, `business-domain-context` map): `references/phase-1-constitution.md`.
- Phase 2 (architecture, external services, non-functional, `infra-context` map; API contract source): `references/phase-2-srs.md`.
- Phase 3 (backend, frontend, environments, CI/CD, `infra-context` map): `references/phase-3-infrastructure.md`.
- Map anatomy, reading, CREATE/UPDATE, staleness, diagrams: `agentic-qa-core/references/business-context-maps.md`.
- Recording a hard-to-reverse test-architecture decision (ADR): `agentic-qa-core/references/adr-doctrine.md` and `.context/ADR/README.md`.
- Phase 4 (backlog connection check): `references/phase-4-specification.md`.
- Personas, journeys, functional specs: not this skill, use `project-context` mode `e2e`.
- Generating or refreshing business maps and the master test plan: not this skill, invoke the matching `project-context` mode.
- API endpoint sync: `bun run api:sync` for technical types, `project-context` mode `api` for the business narrative.
- IQL methodology questions: `iql-context`, the methodology index. It cites the official site https://upexgalaxy.com/metodologia for the narrative and `agentic-qa-core/references/stage-gates.md` for the enforced per-stage contract. This skill carries no IQL reference of its own.
- Code exploration (grep, read files): use the built-in tools. For browser-driven, UI-first exploration, load the `/playwright-cli` skill.
- Issue-tracker operations (Phase 4): resolve `[ISSUE_TRACKER_TOOL]` via AGENTS.md Tool Resolution. For Jira, load `/acli` (primary) or fall back to the Atlassian MCP. If the project also uses Xray for TMS, load `/xray-cli` as well.
- Database inspection: resolve `[DB_TOOL]`; read-only queries only during discovery.
- Session contract (Phase 0 resume, plan.md and progress.md schemas, archive policy, Engram per-phase checkpoint): `../agentic-qa-core/references/session-management.md`. This skill produces `session/project-discovery/...` topic keys.

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
