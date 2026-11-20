# Skill composition strategy

> Purpose: how this QA boilerplate's orchestrator composes project-owned skills with vendored and community skills without duplication, conflicts or false negatives. It also holds the anti-leak contract that keeps SDD-* skills from chaining outside `framework-development` for users who install the SDD bundle by hand.
>
> A meta-doctrine consumed by all T1 skills, sibling to `briefing-template.md`, `dispatch-patterns.md` and `orchestration-doctrine.md`.
>
> Companion files: `AGENTS.md` (always-on memory and router), `.agents/instructions/agent-skills-and-mcps.md` (the skill router table: tiers and skill mentions; a project's own skills route from the `## Project context skills` table of `.agents/instructions/agent-project.md`), `.agents/skills/*/SKILL.md` (per-skill instructions; cite this doc as `agentic-qa-core/references/skill-composition-strategy.md`), `cli/install.ts` (the installer and source of truth for T2/T3/T4 names), the sibling references `{briefing-template,dispatch-patterns,orchestration-doctrine}.md`, and `.agents/skills/framework-development/references/kata-invariants.md` (the allowed and forbidden paths §4 relies on).

---

## 1. Problem statement

The repo ships the T1 and T2 skills `.agents/skills/REGISTRY.md` lists (`.agents/skills/`). The installer (`cli/install.ts`) also installs:

- Engram only (user-level, wired per agent with `engram setup`): the persistent-memory MCP server. Nothing from gentle-ai's workflow layer (SDD, orchestrator, foundation skills) is installed or recommended.
- The vendored T2 skill `judgment-day` (Apache-2.0, attribution preserved in frontmatter), committed under `.agents/skills/judgment-day/`. It has no upstream dependency.
- Community skills at project level: the `PROJECT_LEVEL_SKILLS` array in `cli/install.ts` (`skill-creator` among them, the builder of every skill this repo scaffolds).
- Community skills at user level: the `USER_LEVEL_SKILLS` array in `cli/install.ts`.

The strategy closes three gaps:

1. Authors deprecate, replace and rename community user-level skills, so naming them in the skill router is fragile.
2. SDD-* skills double the cost of `test-automation` when applied per ticket, since it already has Plan → Code → Review. Without a gate, orchestrators chain SDD into per-ticket flows, inflate token spend and write per-test specs that should not exist.
3. Nothing said when a project-owned skill may borrow capabilities from a community skill, or when the foreign SDD bundle may fire at all.

---

## 2. Skill tier model

Four tiers, each with its own discovery and load rules.

| Tier | Location | Examples | Discovery | Load behavior |
|--|--|--|--|--|
| T1: Project-owned | `.agents/skills/` (committed) | every committed skill `.agents/skills/REGISTRY.md` lists as T1 | Named in the skill router table (`agent-skills-and-mcps.md`; a project's own skills in `agent-project.md`) | Silent (load on trigger, no ask) |
| T2: Vendored | `.agents/skills/` (committed, upstream attribution in frontmatter) | `judgment-day` (gentle-ai, Apache-2.0) | Named in the skill router table | Silent on explicit user trigger (`/judgment-day`) or when cited by a host orchestrator (`test-automation` Phase 3, `git-flow-master` pre-PR) |
| T2-opt: Optional SDD bundle (user-installed outside this repo) | `~/.claude/skills/sdd-*` (only if present on the machine, for example left by an older gentle-ai release) | any `sdd-*` skill (its upstream owns the bundle) | `bun setup` does not install it. It is discovered at runtime from the system-reminder skill list when present | Silent inside `framework-development` only (§4 anti-leak contract). Never silent inside `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation` or `regression-testing` |
| T3: Community project-level | `.agents/skills/` (installed by `install.ts` `PROJECT_LEVEL_SKILLS`, not committed) | `PROJECT_LEVEL_SKILLS` in `cli/install.ts` | Named by category in the skill router, not by skill name. Discovered at runtime by the §3.1 scan (session skill list plus `.agents/skills/` on disk), never from `REGISTRY.md` | Silent if matched by category (for example the user writes a Playwright test, so load `playwright-best-practices`) |
| T4: Community user-level | `~/.claude/skills/` (installed by `install.ts` `USER_LEVEL_SKILLS`) | `USER_LEVEL_SKILLS` in `cli/install.ts` | Not named in the skill router. Discovered at runtime from the session skill list (§3.1). Matched by task domain, or named as the instrument for a moment by a committed doctrine or the operator's standing instructions (the named loaders: `agentic-qa-onboard/SKILL.md` §"Community skills installed at user level") | Named loader: load at that moment without asking, and a missing install follows the naming doctrine's own gate. Matched only by domain: ask the user before loading (it may not be installed, or the user may not want it for this task) |

The tier decision rule is in §6. Where each tier's names live: T2 is `judgment-day` (frontmatter `metadata.vendored_from` points at upstream), T2-opt is any `sdd-*` skill (its upstream owns the bundle and its names), T3 is `PROJECT_LEVEL_SKILLS` and T4 is `USER_LEVEL_SKILLS`, both in `cli/install.ts`. `skill-creator` sits in T3 (promoted from T4 with the context-skills layer) because it is always the builder when this repo scaffolds a skill, per `skill-scaffold.md`.

Orchestration vendor stubs are T4 but not in `USER_LEVEL_SKILLS`. `orca-cli` and `orchestration` are guides bundled with the orchestration binary, which installs them at user level itself. They are optional and never required. T4 `agent-orchestration` (a user-level skill in `USER_LEVEL_SKILLS`) loads these guides by name, the `orchestration` guide for a worker and both for a conductor, and requests only deep topics from the binary on demand. The availability gate is therefore the binary plus a reachable runtime, never an installed stub. Do not add them to `install.ts`; per-machine setup lives in `/agent-orchestration` machine setup.

---

## 2b. Purpose axis (`metadata.kind`)

A skill carries three independent labels. Each answers one question, is declared in one place and has one gate. Keep them apart: `acli` is T1 and utility, `judgment-day` is T2 and workflow, `playwright-cli` is T3 and utility.

| Axis | Question it answers | Where declared | Gate |
|---|---|---|---|
| Ownership (T1 / T2 / T3 / T4, §2) | Who owns it, where it is installed, whether to ask before loading | `.agents/skills/` dir walk + `PROJECT_LEVEL_SKILLS` / `USER_LEVEL_SKILLS` in `cli/install.ts` + `metadata.vendored_from` | the tier checks in `scripts/lint-skills.ts` (`TIER-MISMATCH`, `DUPLICATE-TIER`, the `cli/install.ts` array scan) |
| Purpose (`metadata.kind`) | What the skill is: knowledge, a procedure, a tool index, or a doctrine parent | `SKILL.md` frontmatter, nested under `metadata:` | the `KIND-MISSING`, `KIND-VOCAB` and `KIND-SUFFIX` checks in `scripts/lint-skills.ts` |
| Domain (`complementary_categories`, §5) | Which community skills a T1 skill may borrow, by category and not by name | `SKILL.md` frontmatter, top level | the category check in `scripts/lint-skills.ts` (`KNOWN_CATEGORIES`) |

### The four kinds

| Kind | Classifying test | Slug suffix |
|---|---|---|
| context | Loading it changes what the agent knows, not what it does next. No stages, drives no tool. Cites `.context/` caches and never restates them. May hold its own generated map and keep it honest (the write-scope amendment below) | `-context` (mandatory) |
| workflow | A procedure with stages the agent runs end to end: an IQL stage (shift-left, sprint, documentation, automation, regression) or an operating flow around one (git, fleet, handoff, onboarding, review) | none |
| utility | Owns one tool's grammar (a binary in `allowed-tools`, or an `.agents/instructions/agent-tool-resolution.md` §6.5 CLI row) and has no stages of its own | `-cli` / `-tool` / `-app` (mandatory for new skills) |
| core | Parent of other skills: they cite its `references/`, and it has no write path of its own | none |

### Rules

- `kind` lives under `metadata`, never at top level. The Agent Skills frontmatter spec allows only `allowed-tools, compatibility, description, license, metadata, name` at the top level. Declare `metadata:` plus `  kind: <value>` (one kind per skill; `judgment-day` adds it inside its existing `metadata` block).
- The suffix rule binds both ways. A slug ending `-context` declares `context` and a `context` skill ends `-context`. A slug ending `-cli` / `-tool` / `-app` declares `utility` and a `utility` skill carries one of them. `workflow` and `core` have no suffix rule.
- Grandfathering is by name, visibly. `KIND_SUFFIX_EXEMPT` in `scripts/lint-skills.ts` lists the slugs that predate the rule (a utility without a suffix, workflows whose slug ends `-context`). A new skill picks a slug that matches its kind.
- To see which skill is which, read `.agents/skills/REGISTRY.md` (generated by `bun run skills:registry`; the Source line prints `kind:`).
- A context skill may write, but only its own `references/`. A context skill that holds a generated map (the context map skills, `./business-context-maps.md`) declares `metadata.writes: [references/]` and carries `references/refresh.md`. When a session contradicts one section, the skill proposes the edit and applies it on approval. It never runs a stage, touches Jira or edits another skill. `CONTEXT-WRITES` in `scripts/lint-skills.ts` gates all four halves.
- T3 and T4 bodies are not linted for kind. A community skill committed in the store keeps its `cli/install.ts` tier, and the project does not author its frontmatter (check 7's own rule).

---

## 3. Skill composition protocol

### 3.1 Pre-flight (every task)

Before a non-trivial task, the orchestrator (and each invoked skill) does this:

1. Scan the skills actually installed, from two sources read together:
   - the skill list the harness injects at session start (the `system-reminder` list in Claude Code, the equivalent list in Codex, OpenCode and Pi). It already carries the user-level skills and the project-level ones the harness discovers through `.agents/skills/` (Claude Code through the generated `.claude/skills` alias);
   - the project store on disk: every `.agents/skills/*/SKILL.md`, git-ignored community folders included (`ls .agents/skills/*/SKILL.md`, then the frontmatter `description` of any folder the session list did not show).

   `.agents/skills/REGISTRY.md` is not this scan. `scripts/build-skill-registry.ts` skips git-ignored folders on purpose, so the file is identical on every clone and a community (T3) skill never appears in it. The registry feeds the resolver's T1 compact rules (`skill-resolver.md`) and is not an inventory of this machine.
2. Match by domain category (vocabulary in §5), not by literal skill name.
3. Resolve the tier per match:
   - T1 / T2 / T3: load silently when the task domain matches and every anti-leak rule from §4 is satisfied.
   - T4 named for this moment by a committed doctrine or the operator's standing instructions: load without asking (§3.2).
   - T4 matched only by domain: ask the user one short question before loading: `"Detected X skill (T4). Apply it? Y/N"`.
4. Cache the load decisions for the session and do not ask about the same skill twice.

### 3.2 Threshold rule (silent vs ask)

The "Load behavior" column of the §2 table is the threshold: T1 always loads silently and never asks. T2 loads on an explicit user trigger or a host orchestrator's citation, and is never auto-invoked without one. T2-opt loads silently inside `framework-development` only and is rejected, with a redirect to `framework-development`, inside any other workflow skill. T3 loads when the task domain matches the category and asks when it only weakly matches. T4 loads silently only when named, and asks when matched by task domain alone.

The named-loader rule. A T4 skill is never silent by default, and a naming is what makes a load silent, never a domain match. The naming source is either a committed doctrine (`AGENTS.md`, a T1 `SKILL.md` or a reference it cites) or a standing instruction of the operator (a user-level `CLAUDE.md` or `AGENTS.md`), which `decision-protocol.md` already treats as binding. A domain match alone still asks. The loaders this repo commits are the "Loaded by / when" table in `agentic-qa-onboard/SKILL.md` §"Community skills installed at user level": every slug in `USER_LEVEL_SKILLS` (`cli/install.ts`) has a row there naming its loader or saying "user-invoked only", and `bun run skills:check` (`T4-LOADER`) fails when one is missing. A new doctrine that names a T4 skill updates that row in the same change.

With nobody to answer the T4 question (a routine, or a worker whose conductor does not field it), the answer is no: skip the skill, do the work inline per §3.4, and list the skill in the report as available but not applied. A supervised worker raises the question to its conductor, which holds the gate (`decision-protocol.md`).

### 3.3 Sub-agent skill propagation

When the orchestrator delegates to a sub-agent through the `Agent` tool, the sub-agent receives its own `system-reminder` skill list. The resolved skills travel in the 7-component briefing (`briefing-template.md`): their compact rules in component 3 (Project Standards) and their triggers in component 4 (Skills to load).

- The sub-agent reads its own skill list, finds those names and loads them.
- If it does not find a skill it was told to use, it takes the skill-not-found path (§3.4): typically it does the work inline and flags the missing capability in the result envelope.

### 3.4 Skill not found path

When a referenced skill is not in the available list (deprecated, uninstalled, version mismatch):

1. Continue with a project-owned alternative if one exists.
2. If none exists, do the work inline with degraded capability.
3. Flag it in the result envelope: `skill_resolution: "fallback-inline" + missing: [list]`.
4. Suggest a reinstall via `bun setup` or `bunx skills add <name>` in the user-facing summary.

---

## 4. framework-development ↔ SDD anti-leak contract

> `framework-development` does not chain SDD by default: its native Plan → Code → Verify → Archive pipeline is self-contained and needs nothing outside the repo. §4 applies when an SDD bundle is present on the machine and the user explicitly asks for the SDD ceremony for an architectural change.

This is the most-overlapping pair on the QA side. SDD-* skills are powerful and tempting, and applied to per-ticket QA they harm the workflow, because `test-automation` already has Plan → Code → Review and `sprint-testing` already has Stage 1 → 2 → 3. The contract gates SDD-* behind a single legitimate caller.

### 4.1 Hard rules

| Rule | Enforcement |
|--|--|
| SDD-* invocation forbidden from `/shift-left-testing` | shift-left-testing SKILL.md must not name any sdd-* skill in its dispatch table or composable list |
| SDD-* invocation forbidden from `/sprint-testing` | sprint-testing SKILL.md must not name any sdd-* skill in its dispatch table or composable list |
| SDD-* invocation forbidden from `/test-automation` | test-automation Plan → Code → Review pipeline owns its own planning artifact (`spec.md` / `automation-plan.md`); SDD spec/design/tasks would duplicate it |
| SDD-* invocation forbidden from `/regression-testing` | regression suites are pre-existing tests; SDD planning has no surface to act on |
| SDD-* invocation forbidden from `/test-documentation` | TC documentation is owned by the TMS (Jira/Xray); SDD specs would compete with the ATP/ATR contract |
| SDD-* invocation allowed only from `/framework-development` | The Phase 0 path self-check inside framework-development is the gate |
| Stand-alone direct invocation of `/sdd-explore`, `/sdd-propose`, etc. | Allowed for the user, but only when the change is to framework surface (paths in §4.3 ALLOWED). The orchestrator verifies this before chaining the rest of SDD |

### 4.2 Why this matters

Without the gate, an orchestrator handed "QA this user story `UPEX-277`" sees SDD skills in its registry and chains `sdd-propose → sdd-spec → sdd-design → sdd-tasks` for what is a 30-minute exploratory test session. Token spend triples, spec artifacts land in engram and confuse the next QA session, and the AI rewrites `tests/components/UsersPage.ts` "to follow the SDD design" and breaks the KATA architecture. The failure is silent, which is why the gate exists.

### 4.3 ALLOWED paths (framework-development scope)

The list lives in `framework-development/references/kata-invariants.md` §10.1 (the policy table). This file keeps no copy.

### 4.4 FORBIDDEN paths (anything outside §4.3; full table in `framework-development/references/kata-invariants.md` §10.2)

Forbidden surface always routes to a non-SDD skill:

- `tests/e2e/`, `tests/integration/`, `tests/components/{module}/` → `/test-automation`
- `.context/PBI/` → `/sprint-testing`
- the Master Test Plan (the `QA Master Test Plan` Epic description; cache `.context/PBI/qa-artifacts/master-test-plan.md`) → `project-context` mode `test-plan`
- the context maps (`.agents/skills/<slug>/references/<map>.html` for every entry of `CONTEXT_MAP_SKILLS`) → each entry's `generator` (`project-context` modes `data` / `e2e` / `api` for the business maps, `project-discovery` for the domain and infra maps)
- `.env`, credentials → manual edit only

### 4.5 Clean delegation points (4)

When `framework-development` delegates to SDD, this is the data contract:

| framework-development phase | Delegate to | Trigger condition | Data IN | Data OUT |
|--|--|--|--|--|
| After Phase 0 path-check passes | `sdd-explore` | Always when the change is non-trivial (>1 file or any base-class touch) | request, kata-invariants reference, ALLOWED/FORBIDDEN tables | exploration with approach options |
| After exploration approved | `sdd-propose` → `sdd-spec` → `sdd-design` → `sdd-tasks` | New public framework API, or a multi-file refactor | exploration, ALLOWED/FORBIDDEN tables, kata-invariants | proposal + delta spec + design + task breakdown w/ Review Workload Forecast |
| After tasks approved | `sdd-apply` | Always | tasks + design + spec, strict TDD flag, delivery strategy | apply-progress (merged across batches) |
| After apply complete | `sdd-verify` → `sdd-archive` | Always | spec + apply-progress | verify report + archived change folder |

Per-ticket QA, test writing, regression runs, TMS authoring, Jira transitions and PR work never go to SDD: they belong to `sprint-testing`, `test-automation`, `regression-testing`, `test-documentation`, `acli` and `git-flow-master` respectively.

### 4.6 Orchestrator pre-flight (before chaining any SDD skill)

```
1. Identify the trigger:
   - Is the request from /framework-development? → proceed to step 2.
   - Is the request from /sprint-testing, /test-automation, /test-documentation, /regression-testing?
       → REJECT SDD chain. Use the host skill's own pipeline.
   - Is the request a direct /sdd-* user invocation?
       → ASK: "Is this change to framework surface (cli/, scripts/, tests/components base classes, fixtures)? If not, you probably want /test-automation or /sprint-testing instead."

2. Inside framework-development, run Phase 0 path self-check:
   - List target paths.
   - For each path: ALLOWED → continue. FORBIDDEN → abort + redirect.
   - If a single change spans both: split into framework slice (this skill) and consumer slice (test-automation).

3. Cache the strict_tdd flag from sdd-init for the session.
4. Inject ALLOWED + FORBIDDEN tables verbatim into every SDD subagent briefing.
```

The ASK in step 1 has an autonomous path. A direct `/sdd-*` invocation inside a worker or routine, with no person to answer, is treated as unconfirmed framework surface: check the target paths against §4.3 and §4.4 yourself, proceed only when every path is allowed, and otherwise stop and report the redirect.

---

## 5. Category vocabulary (for community skill auto-match)

Project-owned and project-dependency skills are named explicitly. Community skills (T3, T4) are matched by category, not by name, and each project-owned skill declares which categories it can borrow from.

### 5.1 Category list (v1, QA-scoped)

| Category | Examples of skills that fit (T3/T4) | Used by (T1) |
|--|--|--|
| `testing-e2e` | `playwright-cli`, `playwright-best-practices` | `test-automation`, `sprint-testing` (manual exploration), `regression-testing` |
| `testing-api` | `playwright-best-practices` (request fixture patterns) | `test-automation` (API/integration suites) |
| `testing-component` | `playwright-best-practices` (component testing section) | `test-automation` (rare: when the project has component tests) |
| `accessibility` | `playwright-best-practices` (axe-core section) | `test-automation` (a11y suites), `sprint-testing` (manual a11y checks) |
| `vcs` | (no T3/T4: `git-flow-master` is T1 and covers `gh` CLI usage natively) | `git-flow-master`, `regression-testing` (CI run inspection) |
| `automation-cli` | (no T3/T4: runtime and library docs come from Context7, `[DOCS_TOOL]`) | `framework-development`, `test-automation` (script / bundler tweaks) |
| `issue-tracker` | (acli is T1) | `sprint-testing`, `test-documentation` |
| `tms` | (xray-cli is T1; acli covers Modality jira-native) | `test-documentation`, `sprint-testing` |
| `meta-skill` | `skill-creator` (T3), `find-skills` | `skill-creator` is loaded silently by `framework-development` (the change is a skill) and by `project-context` mode `context-skill`; `find-skills` only as the §11.2 last resort; also `session-handoff` (session continuity) |
| `ci-cd` | `github-actions-docs` | `regression-testing`, `framework-development` (CI workflow evolution) |
| `framework-evolution` | (no T3/T4: concept-only category) | `framework-development` (self-tag) |
| `orchestration` | (the binary's own guides: optional to have, loaded alongside `/agent-orchestration` when present, and never a gate) | `fleet-launch-seam.md` (the boilerplate side of `agent-orchestration`); `session-handoff` (successor launch rides the same terminal layer, but a handoff is an ownership transfer, not a Run/Task/Dispatch); cited as the transport by `sprint-testing`, `test-automation`, `shift-left-testing`, `framework-development`, `regression-testing` |

The dev sister doc has categories QA leaves out (`frontend-ui`, `frontend-framework`, `forms-validation`, `backend-db`, `language`, `seo`, `deploy`, `creativity`, `doc-generation`, `prose-polishing`, `presentation`), because QA does not author UI, deploy or write production code. A category needed later is added to §5.1.

### 5.2 Matching rule

Each T1 SKILL.md declares its category list in frontmatter:

```yaml
---
name: test-automation
complementary_categories:
  - testing-e2e
  - testing-api
  - testing-component
  - accessibility
---
```

At runtime the skill (or orchestrator) scans the available skill list, matches each available skill against its category, and applies the threshold rule from §3.2.

### 5.3 Why categories, not names

Community skills get renamed and replaced, users have different installs, and a category match degrades to "no extra capability" instead of a dead reference (§8).

---

## 6. Tier assignment decision rule (per skill)

The rule applies when a skill is added, when it moves between tiers, and when §2 needs to place one. An unknown community skill defaults to T4.

```
IF the skill is authored by us AND lives in this repo's .agents/skills/         → T1
ELIF the skill is vendored upstream into .agents/skills/ (license + attrib)     → T2
ELIF the skill is an opt-in user install (sdd-*, foundation skills)             → T2-opt
ELIF the skill is a community skill that EVERY clone of this repo needs         → T3 (PROJECT_LEVEL_SKILLS in install.ts)
ELIF the skill is a community skill useful across many of the user's projects   → T4 (USER_LEVEL_SKILLS in install.ts)
```

Promotion path (T4 → T3): a user-level skill turns out to be load-bearing for this repo's QA work and no clone should run without it. Move it from `USER_LEVEL_SKILLS` to `PROJECT_LEVEL_SKILLS` in `install.ts` and add a brief note in `.agents/instructions/agent-skills-and-mcps.md`.

Demotion path (T3 → T4): a project-level skill turns out to be useful elsewhere and is no longer load-bearing here. Move it and remove it from `.agents/instructions/agent-skills-and-mcps.md`.

---

## 7. Examples (concrete QA scenarios)

Each row is a request, the skill it triggers (a T1 silent load), what it composes, and why SDD stays out.

| Request | Trigger and composition | SDD |
|---|---|---|
| "QA the Ready-For-QA story `UPEX-277`" | `/sprint-testing`; `testing-e2e` (manual exploration may use `/playwright-cli`) and `issue-tracker` (acli for ticket fetch). Outputs: PBI folder, ATP, ATR, QA comment, ticket transition | Not loaded: the §4.1 `/sprint-testing` row fires and the Stage 1 → 2 → 3 pipeline runs without a spec artifact |
| "Automate test case `UPEX-300-TC-04` for the orders module" | `/test-automation`; `testing-e2e`, `testing-api`, and T3 `playwright-best-practices` by category match. Outputs: a KATA-compliant test under `tests/e2e/orders/` or `tests/integration/orders/`, fixture registration, ATC results | Not loaded: the §4.1 `/test-automation` row fires, and test-automation owns its `spec.md` and `automation-plan.md` |
| "Add a new `{ admin }` fixture to TestFixture so admin tests get pre-authenticated" | `/framework-development`; Phase 0 path-check finds `tests/components/TestFixture.ts` and the new `tests/components/AdminFixture.ts` both ALLOWED. Outputs: new fixture, registration, delta spec, archive | Allowed: `sdd-explore` runs first and reads `references/kata-invariants.md` (Section 7 extension points covers fixture additions), then the SDD phases run in sequence with the ALLOWED/FORBIDDEN tables injected into each subagent briefing |
| "Run the nightly smoke suite and tell me if we ship" | `/regression-testing`; `vcs` (`gh` CLI through `/git-flow-master`) and `ci-cd` (`github-actions-docs` if workflow YAML needs reading). Outputs: a classified failure list and a GO/CAUTION/NO-GO verdict | Not loaded: the §4.1 `/regression-testing` row fires |

---

## 8. Why differentiation matters

- T1 vs T2-opt: T1 is our doctrine and T2-opt is a third-party planning bundle. Mixing them lets an upstream SDD release rewrite our QA workflows silently, so SDD fires only where §4 authorizes it.
- T2 vs T3: T2 is vendored and committed (`judgment-day`), and T3 is community-managed through `bunx skills add`. They differ in install path, upgrade cadence and breakage mode.
- T3 vs T4: T3 ships with every clone and T4 may be missing. Asking before T4 use prevents "I cleared my `~/.claude/skills/` and now QA is broken" tickets, and a named loader (§3.2) does not bring them back because the naming doctrine states the absent case.
- Categories vs names: a repo that hardcodes `playwright-best-practices` breaks the day the author republishes it as `playwright-patterns`. Categories survive renames.

---

## 9. Validation (`bun run skills:check`)

The validation script is `scripts/lint-skills.ts`, wired in `package.json` as `bun run skills:check`. ERROR fails CI, and WARN and INFO are reported without failing. The script's header comment is the contract: one entry per named check with its severity (the tier checks over `cli/install.ts` and `.agents/instructions/agent-skills-and-mcps.md`, the category cross-checks against §5.1, the `sdd-*` anti-leak audit of every T1 SKILL.md not named `framework-development`, `STALE-PATH`, `DUPLICATE-TIER`, the `KIND-*` purpose checks, the `CAPABILITY-*` checks, the `SESSION-*` checks). Add a new check there, name it in the doctrine that motivates it (this file, `mcp-capabilities.md`, `session-management.md`) and cite it by name, never by index. This file keeps no second copy of the list. CI runs the script alongside `bun run vars:check`.

---

## 10. What lives where

This doc is authoritative for the tier model, the composition protocol, the category vocabulary and the anti-leak contract. The other two places only point here:

- The skill router (`agent-skills-and-mcps.md`) gives a brief mention and a link for each of those, and names T1 skills (§5 registry table), the T2 skill `judgment-day`, the T2-opt SDD bundle (with the anti-leak note and a manual-install pointer) and the T3 skills `playwright-cli` and `playwright-best-practices` (a small list, low fragility). It does not name T4 skills, which are discovered at runtime per this doc.
- Each SKILL.md carries its own `complementary_categories` frontmatter and load behavior. Each affected skill (sprint-testing, test-automation, test-documentation, regression-testing) notes that the SDD chain must not be invoked from it. A host skill that uses `judgment-day` references it in its review steps (required-verifier option or optional gate: §11 decision 3), and framework-development names SDD skills at its delegation points. The doctrine that names a T4 skill as its loader holds that reference (§3.2).
- T4 names live in the installer, and their loaders live in the `agentic-qa-onboard` table (`T4-LOADER`).

---

## 11. Resolved decisions

1. Skill discovery mechanism. The installed-skill scan (§3.1) is canonical, and no machine-local registry is generated for community skills: the session list is already live, a generated file would go stale the moment `bunx skills add` runs, and a machine-dependent section would break the committed file's determinism.

2. The `find-skills` meta-skill runs automatically, but only as a last resort. This decision is `find-skills`'s named loader in the §3.2 sense: when step 3 fires it loads without asking, and anything it would install still asks. Invocation order:
   1. Scan T1 + T2 (always available).
   2. Scan T3 + T4 already installed (the §3.1 scan: session skill list + `.agents/skills/` on disk).
   3. If a task domain has no match in steps 1-2 and the task would benefit significantly from a specialized skill, invoke `find-skills` automatically to suggest installable skills. Ask the user before installing. With nobody to ask, do not install: name the suggestion in the report.

3. `judgment-day` adoption. It is a vendored T2 skill, available on demand. It lives committed under `.agents/skills/judgment-day/` (Apache-2.0, attribution preserved) and is not auto-invoked. The user invokes `/judgment-day` explicitly, or a host orchestrator cites it: `test-automation` Phase 3 names it as one of the two options for the required separate verifier (the other is `/pr-review-lead`; `agentic-qa-core/references/stage-gates.md`), and `git-flow-master` offers it as an optional pre-PR gate.

4. Gentle-ai scope: none. Engram is wired directly with `engram setup`, with no SDD-* skills, no gentle-ai foundation skills and no gentle-ai orchestrator instructions. Our workflow skills already cover Plan → Code → Verify, and gentle-ai's orchestrator layer competes with this repo's own orchestration doctrine (`AGENTS.md` §3).

5. Category vocabulary maintainer: no automated maintainer. `bun run skills:check` rejects a category outside §5.1 (the category cross-checks in `scripts/lint-skills.ts`), and a human adds the new category here in the same PR that first needs it (an additive change). Removing unused categories stays a manual review.

6. Sub-agent skill list inspection. The contract in §3.4 is authoritative: a sub-agent that cannot find a named skill in its own list emits `skill_resolution: "fallback-inline" + missing: [list]` in its result envelope. On receiving a fallback, the orchestrator re-resolves and may retry with explicit injection.

7. Per-skill frontmatter migration is required for every T1 SKILL.md. For backward compatibility, a skill without `complementary_categories` gets an empty list (no community matching).

8. SDD anti-leak enforcement is mechanical, through `bun run skills:check`. Manual reviews catch most cases, and the programmatic check (the `sdd-*` anti-leak audit, §9) ensures no later SKILL.md edit silently re-introduces an SDD invocation in a non-framework-development skill.

---

## 13. Non-goals

This doc does not:

- Replace any skill's internal workflow. Each skill stays in charge of its own steps.
- Rewrite SDD. Any SDD bundle a user installed is foreign upstream code.
- Define the dev-side composition. Dev workflows are out of scope here and follow their own composition strategy.
- Cover Modality jira-native TMS tier nuances, which belong in `test-documentation/references/jira-setup.md`.
