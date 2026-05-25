# Skill Composition Strategy

> **Purpose**: Contract for how this QA boilerplate's AI orchestrator composes project-owned skills with vendored skills and community skills without duplication, conflicts, or false negatives. Also encodes the **anti-leak contract** that gates SDD-* skill chaining behind `framework-development` for users who manually install the SDD bundle.
>
> **Home**: `.claude/skills/agentic-qa-core/references/skill-composition-strategy.md` — meta-doctrine consumed by all T1 skills, sibling to `briefing-template.md`, `dispatch-patterns.md`, `orchestration-doctrine.md`.
>
> **Status**: v1.1 — `bun run setup` now uses `gentle-ai install --preset minimal` (engram only). SDD-* skills are no longer auto-installed; the anti-leak contract still applies when users manually opt in. `judgment-day` is now vendored into the repo as a T2 skill.
>
> **Companion files**:
> - `CLAUDE.md` (project memory — top-level rules and skill mentions)
> - `.claude/skills/*/SKILL.md` (per-skill instructions; reference this doc relatively as `agentic-qa-core/references/skill-composition-strategy.md`)
> - `cli/install.ts` (installer — declares project-level vs user-level skill installs; source-of-truth for T2/T3/T4 names)
> - `.claude/skills/agentic-qa-core/references/{briefing-template,dispatch-patterns,orchestration-doctrine}.md` (sibling meta-doctrine references)
> - `.claude/skills/framework-development/references/kata-invariants.md` (load-bearing reference cited by §4 anti-leak rules)
>
> **Last updated**: 2026-05-13

---

## 1. Problem Statement

The repo ships with **11 project-owned workflow skills** + **1 vendored skill** (`.claude/skills/`). The installer (`cli/install.ts`) also installs:

- **Engram only** (user-level via gentle-ai minimal preset): persistent memory binary + MCP adapter. No SDD-* skills, no foundation skills. Users who want the full SDD suite for `/framework-development` work install it manually: `gentle-ai install --components engram,sdd --agent <a>`.
- **Vendored T2 skill**: `judgment-day` (Apache-2.0, attribution preserved in frontmatter) lives committed under `.claude/skills/judgment-day/`. No upstream dependency.
- **3 community skills (project-level)**: `playwright-cli` (Microsoft), `playwright-best-practices` (currents-dev), `resend-cli` (resend).
- **6 community skills (user-level / global)**: `skill-creator`, `find-skills`, `github-actions-docs`, `brainstorming`, `html-ppt`, `bun`.

Current state (CLAUDE.md): T1 skills named explicitly in §5; T2/T3/T4 mentioned by category. Auto-discovery: zero mechanism. Cross-skill composition: only project-owned sister calls (`sprint-testing` → `test-documentation`, `git-flow-master`).

Gaps the strategy resolves:

1. Community user-level skills get deprecated / replaced / renamed by their authors. Naming them in CLAUDE.md is fragile.
2. SDD-* skills are seductively useful, but applied per-ticket they double the cost of `test-automation` (which already has Plan → Code → Review). Without a gate, AI orchestrators chain SDD into per-ticket flows, inflating token spend and rewriting per-test specs that should not exist.
3. No formal contract for when a project-owned skill should "borrow" capabilities from a sister skill (project-level community or user-level community).
4. SDD bundle is project-dependency level (installed by `install.ts`) but treated as foreign code with no clear ownership of WHEN it may legitimately fire.

---

## 2. Skill Tier Model

Four tiers. Different discovery and load rules per tier.

| Tier | Location | Examples | Discovery | Load behavior |
|--|--|--|--|--|
| **T1 — Project-owned** | `.claude/skills/` (committed) | `agentic-qa-core`, `agentic-qa-onboard`, `acli`, `xray-cli`, `git-flow-master`, `project-discovery`, `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development` | Named in CLAUDE.md "Skills" registry | Silent (load on trigger, no ask) |
| **T2 — Vendored** | `.claude/skills/` (committed, upstream attribution in frontmatter) | `judgment-day` (gentle-ai, Apache-2.0) | Named in CLAUDE.md | Silent on explicit user trigger (`/judgment-day`, `juzgar`) or when cited by host orchestrator (`test-automation` Phase 3, `git-flow-master` pre-PR) |
| **T2-opt — Optional gentle-ai SDD bundle (user-installed)** | `~/.claude/skills/sdd-*` (only if user runs `gentle-ai install --components engram,sdd`) | `sdd-init`, `sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive`, `sdd-onboard` | NOT installed by `bun run setup` (minimal preset = engram only). Discovered at runtime from system-reminder skill list when present | Silent **inside** `framework-development` only — see §4 anti-leak contract. NEVER silent inside `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing` |
| **T3 — Community project-level** | `.claude/skills/` (installed by `install.ts` PROJECT_LEVEL_SKILLS, not committed) | `playwright-cli`, `playwright-best-practices`, `resend-cli` | Named **by category** in CLAUDE.md (not by skill name). Discovered at runtime from system-reminder skill list | Silent if matched by category (e.g. user writes a Playwright test → load `playwright-best-practices`) |
| **T4 — Community user-level** | `~/.claude/skills/` (installed by `install.ts` USER_LEVEL_SKILLS) | `skill-creator`, `find-skills`, `github-actions-docs`, `brainstorming`, `html-ppt`, `bun` | **NOT named in CLAUDE.md**. Discovered at runtime from system-reminder skill list. Auto-match by task domain | **ASK user before load** (may not be installed, or user may not want it for this task) |

### Tier decision rule

```
IF skill is committed in .claude/skills/ AND authored by us            → T1
ELIF skill is committed in .claude/skills/ AND has vendored_from meta  → T2
ELIF skill matches sdd-* in user-global .claude/skills/                → T2-opt
ELIF skill is in install.ts PROJECT_LEVEL_SKILLS                       → T3
ELIF skill is in install.ts USER_LEVEL_SKILLS                          → T4
ELSE → T4 (unknown community)
```

T2 vendored list: `judgment-day` (frontmatter `metadata.vendored_from` points at upstream).

T2-opt SDD bundle (only when user manually installed): `sdd-init`, `sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive`, `sdd-onboard`.

T3 list (`PROJECT_LEVEL_SKILLS` in `cli/install.ts`):
`playwright-cli` (microsoft), `playwright-best-practices` (currents-dev), `resend-cli` (resend).

T4 list (`USER_LEVEL_SKILLS` in `cli/install.ts`):
`skill-creator`, `find-skills`, `github-actions-docs`, `brainstorming`, `html-ppt`, `bun`.

---

## 3. Skill Composition Protocol

### 3.1 Pre-flight (every task)

Before starting any non-trivial task, the orchestrator (and each invoked skill) MUST:

1. **Scan available skills** — read the `system-reminder` skill list that ships at session start.
2. **Match by domain category** (see vocabulary §5) — not by literal skill name.
3. **Resolve tier per match**:
   - T1 / T2 / T3 → load silently when task domain matches AND any anti-leak rule from §4 is satisfied.
   - T4 → ask user one short question before loading: `"Detected X skill (T4). Apply it? Y/N"`.
4. **Cache the load decisions** for the session — do not re-ask the same skill twice.

### 3.2 Threshold rule (silent vs ask)

| Tier | Silent load condition | Ask condition |
|--|--|--|
| T1 | always | never |
| T2 (`judgment-day`) | on explicit user trigger OR when cited by host orchestrator (`test-automation` Phase 3, `git-flow-master` pre-PR) | never auto-invoked without trigger |
| T2-opt (SDD-*, only if user manually installed) | inside `framework-development` only (see §4) | inside any other workflow skill — REJECT, redirect to `framework-development` |
| T3 | task domain matches category | task domain only weakly matches |
| T4 | never silent | always ask before load |

### 3.3 Sub-agent skill propagation

When the orchestrator delegates to a sub-agent via the `Agent` tool, the sub-agent receives **its own** `system-reminder` skill list. The orchestrator cannot directly pass "use these skills". To bridge this:

- Orchestrator MUST inject a `## Composable Skills` block into the sub-agent prompt naming the resolved skills (e.g. `"For this task, consider invoking: /test-automation, /playwright-best-practices. Strict TDD: off. Delivery strategy: ask-on-risk."`).
- Sub-agent reads its own skill list, finds those names, loads them.
- If the sub-agent does NOT find a skill it was told to use → it falls back to the skill not found path (typically: do the work inline + flag the missing capability in the result envelope).

### 3.4 Skill not found path

When a referenced skill is not in the available list (deprecated, uninstalled, version mismatch):

1. Continue with project-owned alternative if exists.
2. If no alternative, do the work inline with degraded capability.
3. Flag in result envelope: `skill_resolution: "fallback-inline" + missing: [list]`.
4. Suggest reinstall via `bun run setup` or `bunx skills add <name>` in the user-facing summary.

---

## 4. framework-development ↔ SDD Anti-Leak Contract

> **Note (2026-05-18 refactor)**: `framework-development` no longer chains SDD by default — its native Plan → Code → Verify → Archive pipeline ships self-contained and runs under `gentle-ai install --preset minimal`. §4 below still applies to users who manually install the SDD bundle (`gentle-ai install --components engram,sdd`) and explicitly request the SDD ceremony for an architectural change.

This is the most-overlapping pair on the QA side. SDD-* skills are powerful and tempting; applied to per-ticket QA they actively harm the workflow because `test-automation` already has Plan → Code → Review and `sprint-testing` already has Stage 1 → 2 → 3. The contract below resolves the conflict by gating SDD-* behind a single legitimate caller.

### 4.1 Hard rules

| Rule | Enforcement |
|--|--|
| SDD-* invocation FORBIDDEN from `/shift-left-testing` | shift-left-testing SKILL.md MUST NOT name any sdd-* skill in its dispatch table or composable list |
| SDD-* invocation FORBIDDEN from `/sprint-testing` | sprint-testing SKILL.md MUST NOT name any sdd-* skill in its dispatch table or composable list |
| SDD-* invocation FORBIDDEN from `/test-automation` | test-automation Plan → Code → Review pipeline owns its own planning artifact (`spec.md` / `implementation-plan.md`); SDD spec/design/tasks would duplicate it |
| SDD-* invocation FORBIDDEN from `/regression-testing` | regression suites are pre-existing tests; SDD planning has no surface to act on |
| SDD-* invocation FORBIDDEN from `/test-documentation` | TC documentation is owned by the TMS (Jira/Xray); SDD specs would compete with the ATP/ATR contract |
| SDD-* invocation ALLOWED only from `/framework-development` | The Phase 0 path self-check inside framework-development is the gate |
| Stand-alone direct invocation of `/sdd-explore`, `/sdd-propose`, etc. | Allowed for the user, but only when the change is to FRAMEWORK surface (paths in §4.3 ALLOWED). Orchestrator MUST verify before chaining the rest of SDD. |

### 4.2 Why this matters

Without the gate, an AI orchestrator handed "QA this user story `UPEX-277`" will see SDD skills in its registry, infer they are useful for "any structured work", and chain `sdd-propose → sdd-spec → sdd-design → sdd-tasks` for what is a 30-minute exploratory test session. Token spend triples. Spec artifacts land in engram and confuse the next QA session. Worse, the AI rewrites `tests/components/UsersPage.ts` "to follow the SDD design" and breaks the KATA architecture. The gate exists because the failure mode is real and silent.

### 4.3 ALLOWED paths (framework-development scope, quoted from `framework-development/SKILL.md`)

- `cli/`
- `scripts/`
- `.agents/` (structure changes only — not `project.yaml` values)
- `tests/utils/` (utility evolution, not test specs)
- `tests/components/` (Layer 2 + 3 base classes + fixtures; NOT per-module ATCs)
- `tests/fixtures/` (fixture registry evolution)
- `api/schemas/sync-openapi.ts` and the sync pipeline (NOT generated `types.ts`)
- `package.json` deps + scripts
- `.claude/skills/agentic-qa-core/references/`
- `.claude/skills/framework-development/`
- `.claude/commands/` (slash-command source)

### 4.4 FORBIDDEN paths (anything outside §4.3 — full table in `framework-development/SKILL.md`)

Forbidden surface ALWAYS routes to a non-SDD skill:

- `tests/e2e/`, `tests/integration/`, `tests/components/{module}/` → `/test-automation`
- `.context/PBI/` → `/sprint-testing`
- `.context/master-test-plan.md` → `/master-test-plan` command
- `.context/business/**` → `/business-*-map` commands
- `.env`, credentials → manual edit only

### 4.5 Clean delegation points (4)

When `framework-development` delegates to SDD, exact data contract:

| framework-development phase | Delegate to | Trigger condition | Data IN | Data OUT |
|--|--|--|--|--|
| After Phase 0 path-check passes | `sdd-explore` | Always when the change is non-trivial (>1 file or any base-class touch) | request, kata-invariants reference, ALLOWED/FORBIDDEN tables | exploration with approach options |
| After exploration approved | `sdd-propose` → `sdd-spec` → `sdd-design` → `sdd-tasks` | New public framework API OR multi-file refactor | exploration, ALLOWED/FORBIDDEN tables, kata-invariants | proposal + delta spec + design + task breakdown w/ Review Workload Forecast |
| After tasks approved | `sdd-apply` | Always | tasks + design + spec, strict TDD flag, delivery strategy | apply-progress (merged across batches) |
| After apply complete | `sdd-verify` → `sdd-archive` | Always | spec + apply-progress | verify report + archived change folder |

**Never delegate to SDD**:

- Per-ticket QA work (always sprint-testing)
- Per-ticket test writing (always test-automation)
- Regression suite execution (always regression-testing)
- TMS test case authoring (always test-documentation)
- Jira lifecycle transitions (always sprint-testing or acli direct)
- PR open / merge (always git-flow-master)

### 4.6 Orchestrator pre-flight (mandatory, before chaining any SDD skill)

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

---

## 5. Category Vocabulary (for community skill auto-match)

Project-owned and project-dependency skills are named explicitly. Community skills (T3, T4) are matched by **category**, not by name. Each project-owned skill declares which categories it can borrow from.

### 5.1 Category list (v1, QA-scoped)

| Category | Examples of skills that fit (T3/T4) | Used by (T1) |
|--|--|--|
| `testing-e2e` | `playwright-cli`, `playwright-best-practices` | `test-automation`, `sprint-testing` (manual exploration), `regression-testing` |
| `testing-api` | `playwright-best-practices` (request fixture patterns) | `test-automation` (API/integration suites) |
| `testing-component` | `playwright-best-practices` (component testing section) | `test-automation` (rare — when the project has component tests) |
| `accessibility` | `playwright-best-practices` (axe-core section) | `test-automation` (a11y suites), `sprint-testing` (manual a11y checks) |
| `vcs` | (no T3/T4 — `git-flow-master` is T1 and covers `gh` CLI usage natively) | `git-flow-master`, `regression-testing` (CI run inspection) |
| `runtime` | `bun` | `framework-development`, `test-automation` (script / bundler tweaks) |
| `issue-tracker` | (acli is T1) | `sprint-testing`, `test-documentation` |
| `tms` | (xray-cli is T1; acli covers Modality jira-native) | `test-documentation`, `sprint-testing` |
| `meta-skill` | `skill-creator`, `find-skills` | only on user request (find-skills auto-invoked per §8.2 as last-resort); also `framework-development` (skill evolution) |
| `ci-cd` | `github-actions-docs` | `regression-testing`, `framework-development` (CI workflow evolution) |
| `framework-evolution` | (no T3/T4 — concept-only category) | `framework-development` (self-tag) |

Categories deliberately omitted from the QA scope (present in the dev sister doc, not relevant here): `frontend-ui`, `frontend-framework`, `forms-validation`, `backend-db`, `language`, `seo`, `deploy`, `creativity`, `doc-generation`, `prose-polishing`, `presentation`. QA does not author UI, deploy, or write production code; if a category appears legitimately needed in the future, add it via §5.1 (additive change).

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

At runtime, the skill (or orchestrator) scans the available skill list, matches each available skill against its category, and applies the threshold rule from §3.2.

### 5.3 Why categories not names

- Community skills get renamed, deprecated, replaced. Naming creates dead refs.
- Different users have different installs. Category match degrades gracefully (skill missing → no false negative, just no extra capability).
- Project-owned skills stay portable across community ecosystems.

---

## 6. Tier Assignment Decision Rule (per skill)

When a new skill is added (or an existing one moved between tiers), apply:

```
IF the skill is authored by us AND lives in this repo's .claude/skills/         → T1
ELIF the skill is vendored upstream into .claude/skills/ (license + attrib)     → T2
ELIF the skill is an opt-in user install (sdd-*, foundation skills)             → T2-opt
ELIF the skill is a community skill that EVERY clone of this repo needs         → T3 (PROJECT_LEVEL_SKILLS in install.ts)
ELIF the skill is a community skill useful across many of the user's projects   → T4 (USER_LEVEL_SKILLS in install.ts)
```

Promotion path (T4 → T3): when a user-level skill turns out to be load-bearing for THIS repo's QA work and no clone should run without it. Move from `USER_LEVEL_SKILLS` to `PROJECT_LEVEL_SKILLS` in `install.ts` and add a brief note in CLAUDE.md §5.

Demotion path (T3 → T4): when a project-level skill turns out to be useful elsewhere AND no longer load-bearing here. Move and remove from CLAUDE.md.

---

## 7. Examples (concrete QA scenarios)

### 7.1 User: "QA the Ready-For-QA story `UPEX-277`"

- Trigger: `/sprint-testing`. T1 silent load.
- Composable categories: `testing-e2e` (manual exploration may use `/playwright-cli`), `issue-tracker` (acli for ticket fetch).
- SDD-*: NOT loaded. Anti-leak rule §4.1 row 1 fires. The Stage 1 → 2 → 3 pipeline runs; no SDD planning, no spec artifact.
- Outputs: PBI folder, ATP, ATR, QA comment, ticket transition.

### 7.2 User: "Automate test case `UPEX-300-TC-04` for the orders module"

- Trigger: `/test-automation`. T1 silent load.
- Composable categories: `testing-e2e`, `testing-api`. T3 `playwright-best-practices` silent load (category match).
- SDD-*: NOT loaded. Anti-leak rule §4.1 row 2 fires. test-automation owns its `spec.md` + `implementation-plan.md`.
- Outputs: KATA-compliant test under `tests/e2e/orders/` or `tests/integration/orders/`, fixture registration, ATC results.

### 7.3 User: "Add a new `{ admin }` fixture to TestFixture so admin tests get pre-authenticated"

- Trigger: `/framework-development`. T1 silent load.
- Phase 0 path-check: target paths = `tests/components/TestFixture.ts`, `tests/components/AdminFixture.ts` (new) → ALLOWED. Proceed.
- SDD chain ALLOWED. `sdd-explore` runs first; reads `references/kata-invariants.md` (Section 7 extension points covers Fixture additions).
- SDD-* phases run sequentially with ALLOWED/FORBIDDEN tables injected into each subagent briefing.
- Outputs: new fixture + registration + delta spec + archive.

### 7.4 User: "Run the nightly smoke suite and tell me if we ship"

- Trigger: `/regression-testing`. T1 silent load.
- Composable categories: `vcs` (`gh` CLI invoked via `/git-flow-master`), `ci-cd` (`github-actions-docs` if workflow YAML needs reading).
- SDD-*: NOT loaded. Anti-leak rule §4.1 row 3 fires.
- Outputs: classified failure list, GO/CAUTION/NO-GO verdict.

---

## 8. Why Differentiation Matters

The four-tier model is not bureaucracy. Each tier solves a real failure:

- **T1 vs T2**: T1 is our doctrine. T2 is a third-party planning bundle. Mixing them means our QA workflows could be silently rewritten by an upstream SDD release. The gate (§4) means SDD only fires where we explicitly authorized it.
- **T2 vs T3**: T2 is project-dependency-managed by gentle-ai (install via `gentle-ai install --skill ...`). T3 is community-managed via `bunx skills add`. Different install paths, different upgrade cadences, different breakage modes. CLAUDE.md must NOT pretend they are equivalent.
- **T3 vs T4**: T3 ships with every clone of this repo. T4 may or may not be installed. Asking before T4 use is what prevents "I cleared my `~/.claude/skills/` and now QA is broken" support tickets.
- **Categories vs names**: Community skill authors rename and abandon things. A QA repo that hardcodes `playwright-best-practices` by exact name breaks the day the author republishes as `playwright-patterns`. Categories survive renames.

---

## 9. Validation (`bun run skills:check`)

The validation script `scripts/lint-skills.ts` (implemented at `scripts/lint-skills.ts`, wired in `package.json` as `bun run skills:check`). Severity model: ERROR fails CI; WARN and INFO are reported but do not fail. The script MUST:

1. **Scan T1 SKILL.md frontmatter** for `complementary_categories` field. Warn on T1 skills without one (fragile — won't get auto-matched community skills).
2. **Scan `cli/install.ts`** for the tier arrays (`PROJECT_LEVEL_SKILLS`, `USER_LEVEL_SKILLS`). Cross-check every skill mentioned in CLAUDE.md against its declared tier. The minimal-preset gentle-ai install ships only `engram` — no `SKILL_SLUGS` array to validate.
3. **Cross-check §5.1 categories** against T1 frontmatter declarations. Warn on:
   - Orphan categories: declared in §5.1 but no T1 skill cites them.
   - Stale citations: T1 skill cites a category not in §5.1.
4. **Anti-leak audit**: scan every T1 SKILL.md NOT named `framework-development`. If any of them name `sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive`, `sdd-onboard`, or `sdd-init` in their dispatch table or instructions → ERROR. The anti-leak rule from §4 is violated.
5. **Tier mismatch audit**: any skill mentioned in CLAUDE.md by name but missing from the matching `cli/install.ts` array → WARN. Suggests the user removed an install but forgot to update CLAUDE.md.
6. **Single-skill fragility**: any §5.1 category whose only T3/T4 example is one skill → INFO-level note (not blocking). Suggests adding fallback options when feasible.
7. **TIER-MISMATCH audit** (WARN): skill named in CLAUDE.md §5 but absent from `cli/install.ts` matching tier array, or present in `cli/install.ts` but absent from CLAUDE.md §5. **T1 + T4 skills exempt** — T1 lives in `.claude/skills/` (surfaced via dir walk, not install.ts); T4 (`USER_LEVEL_SKILLS`) is auto-discovered at runtime and MUST NOT appear in CLAUDE.md §5 by doctrine (see §10 "What Lives Where"). If CLAUDE.md §5 table parsing yields 0 rows (format drift), emits a script-self WARN and skips this check (no false positives).
8. **STALE-PATH audit** (ERROR): path-like literals in inline backtick spans of T1 SKILL.md bodies (outside fenced code blocks) must resolve to existing files relative to repo root. Prefix-anchored: only paths starting with `.claude/skills/`, `scripts/`, `cli/`, `.agents/`, `tests/`, or `api/` are checked.
9. **EMPTY-CATS discrimination** (INFO sub-case of rule 1): `complementary_categories: []` (key present but empty list) emits INFO instead of ERROR; field entirely absent still emits ERROR. Suggests declaring at least one category from the §5.1 vocabulary.
10. **DUPLICATE-TIER audit** (ERROR): a skill slug appearing in more than one of `PROJECT_LEVEL_SKILLS`, `USER_LEVEL_SKILLS` in `cli/install.ts` is an install conflict. Violation message names the slug and all conflicting tier arrays.

Output format: human-readable summary (counts of ERROR / WARN / INFO). Exit code: non-zero on ERROR, zero on WARN/INFO only.

The script is wired in `package.json` as `"skills:check": "bun run scripts/lint-skills.ts"`. CI invocation: `bun run skills:check` as part of the standard validation gate alongside `bun run vars:check`.

---

## 10. What Lives Where

| Rule | CLAUDE.md | SKILL.md (per-skill) | This doc (`skill-composition-strategy.md`) |
|--|--|--|--|
| Skill tier model | Brief mention + link here | — | Authoritative |
| Skill Composition Protocol | Summary + link | Per-skill `complementary_categories` frontmatter + load behavior | Authoritative full protocol |
| Category vocabulary | — | — | Authoritative |
| framework-development ↔ SDD anti-leak contract | Brief mention + link | Each affected skill (sprint-testing, test-automation, test-documentation, regression-testing) gets a "SDD chain MUST NOT be invoked from this skill" note | Authoritative |
| Glue layer responsibilities | Brief mention + link | — | Authoritative |
| T1 skill names | §5 Skills registry table | — | Reference only |
| T2 vendored skill names (`judgment-day`) | §5 (named, with citation context) | host skill SKILL.md references it in optional review steps | Reference only |
| T2-opt SDD bundle names | §5 (named, with anti-leak note + manual-install pointer) | framework-development SKILL.md references SDD skills by name in delegation points | Reference only |
| T3 skill names (community project-level) | §5 (mention `playwright-cli`, `playwright-best-practices` by name; small list, low fragility) | — | Reference only |
| T4 skill names (community user-level) | NOT named in CLAUDE.md. Auto-discovered at runtime per this doc | — | Reference only — name list only in installer |

---

## 11. Resolved Decisions

1. **Skill discovery mechanism**: ✅ **System-reminder scan is canonical.** With `gentle-ai install --preset minimal` we no longer ship `skill-registry`. Project-owned skills and orchestrator read the system-reminder skill list directly. Users who want richer registry tooling can install it manually.

2. **find-skills meta-skill**: ✅ **Automatic, but only as last resort.** Invocation order:
   1. Scan T1 + T2 (always available).
   2. Scan T3 + T4 already installed (via system-reminder list).
   3. If a task domain has no match in steps 1-2 AND the task would benefit significantly from a specialized skill → invoke `find-skills` automatically to suggest installable skills. Ask user before installing.

3. **judgment-day adoption**: ✅ **Vendored T2; available on demand.** Lives committed under `.claude/skills/judgment-day/` (Apache-2.0, attribution preserved). Not auto-invoked. User invokes `/judgment-day` explicitly OR host orchestrators (`test-automation` Phase 3, `git-flow-master` pre-PR) cite it as an optional gate.

4. **Gentle-ai bundle scope**: ✅ **Minimal preset (engram only).** No SDD-* skills auto-installed. No foundation skills (`skill-registry`, `branch-pr`, `issue-creation`, `cognitive-doc-design`, `comment-writer`). Rationale: our workflow skills already cover Plan → Code → Verify natively; SDD ceremony does not apply to test authoring. Users who want SDD for framework evolution work install it manually: `gentle-ai install --components engram,sdd --agent <a>`.

5. **Category vocabulary maintainer**: ✅ **`/sync-ai-memory` auto-maintains §5.1.** On invocation, sync-ai-memory scans T1 SKILL.md frontmatter + installed T3/T4 skills (via `skill-registry`), detects category gaps, writes additions to §5.1 of this doc. No human approval required (categories are additive, not destructive). Removal of unused categories: deferred to manual review.

6. **Sub-agent skill list inspection**: ✅ **Contract drafted in §3.4 is authoritative.** Sub-agents that cannot find a named skill in their own list MUST emit `skill_resolution: "fallback-inline" + missing: [list]` in their result envelope. Orchestrator on receiving fallback re-resolves and may retry with explicit injection.

7. **Per-skill frontmatter migration**: ✅ **Required for every T1 SKILL.md.** Backward-compat default: skills without `complementary_categories` get an empty list (no community matching). Migration is part of §12 checklist.

8. **SDD anti-leak enforcement**: ✅ **Mechanical via `bun run skills:check`.** Manual reviews catch most cases, but a programmatic check (§9 rule 4) ensures no future SKILL.md edit silently re-introduces an SDD invocation in a non-framework-development skill.

---

## 12. Implementation Checklist

- [x] Create `framework-development` skill (`.claude/skills/framework-development/SKILL.md`) with Phase 0 path self-check + ALLOWED/FORBIDDEN tables + SDD chain orchestration + Subagent Dispatch Strategy section.
- [x] Create `references/kata-invariants.md` under framework-development with INVARIANT vs EXTENSIBLE rules.
- [x] Create this doc (`agentic-qa-core/references/skill-composition-strategy.md`).
- [x] Patch `CLAUDE.md`:
  - [x] Add §5 entry for `framework-development` skill.
  - [x] Add brief "Skill Composition Protocol" pointer to this doc.
  - [x] Add "SDD-* are framework-only" note to the Skills registry table.
- [x] Patch each T1 SKILL.md (sprint-testing, test-automation, test-documentation, regression-testing, agentic-qa-onboard, agentic-qa-core, project-discovery, git-flow-master, acli, xray-cli):
  - [x] Add frontmatter `complementary_categories`.
  - [x] Add anti-leak note: "SDD-* skills MUST NOT be invoked from this skill. Framework changes go through `/framework-development`."
- [ ] Update `cli/install.ts` if any skill-tier movement is needed.
- [x] Create `scripts/lint-skills.ts` per §9 contract.
- [x] Wire `bun run skills:check` in `package.json`.
- [ ] (Optional, deferred) Wire `/sync-ai-memory` to auto-maintain §5.1 (per §11 resolution 5).

---

## 13. Non-Goals

This doc does NOT:

- Replace any skill's internal workflow. Each skill stays in charge of its own steps.
- Rewrite SDD. The gentle-ai bundle is treated as a stable upstream dependency.
- Define the dev-side composition. Dev workflows are out of scope here and follow their own composition strategy.
- Specify exact prompt text for the `## Composable Skills` injection block. That belongs in the orchestrator template, drafted later.
- Cover Modality jira-native TMS tier nuances. That belongs in `test-documentation/references/jira-setup.md`.
