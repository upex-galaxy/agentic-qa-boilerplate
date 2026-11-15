# Skill Resolver Protocol

> Cited by: `agentic-qa-core/references/briefing-template.md` and every workflow skill that dispatches subagents (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`).
> Companion script: `scripts/build-skill-registry.ts`. Cache file: `.agents/skills/REGISTRY.md`.

## Purpose

A subagent that re-reads every relevant `SKILL.md` before it acts burns tokens redundantly. The orchestrator already knows which skills are in scope, so it pre-extracts their must-do and must-not-do rules and inlines them into the briefing. That is the Skill Resolver protocol: build a registry once per session, paste compact rules per dispatch.

The effect:

- Subagents trust a short "Compact Rules" block instead of opening the full SKILL.md.
- Token cost per dispatch drops by an order of magnitude when several skills overlap.
- Orchestration stays auditable, because the rules pasted into a briefing are the same rules the orchestrator itself read.

The protocol also decides what reaches an executor at all. A subagent or worker reads its briefing and the files the briefing names, never a skill's `references/` on its own. So a rule meant to bind an executor is a compact rule (and a component-7 line), not only a reference paragraph: `AGENTS.md` §3 "RULE REACHABILITY", full text in `./orchestration-doctrine.md`. A subagent may still read the full SKILL.md when the compact rules are insufficient (see "Limits" below).

---

## The protocol

1. Read the registry.
   - `.agents/skills/REGISTRY.md` is committed. `bun run skills:registry` scans `.agents/skills/*/SKILL.md` (skipping skill folders git ignores, so the file depends only on committed skills), extracts compact rules per skill, and rewrites the file in full on every run.
   - `bun run skills:registry:check` reports when the committed registry is stale. Rebuild only when it does; otherwise read the file as it is.

2. Inject `## Project Standards (auto-resolved)` into every briefing.
   - For each subagent dispatch, pick the relevant skills (see "How the orchestrator picks relevant skills" below).
   - Copy the matching skills' compact-rule blocks from `.agents/skills/REGISTRY.md` into a new briefing section titled `## Project Standards (auto-resolved)`.
   - The section sits between `Context docs` and `Skills to load` in the 7-component briefing template.

3. The subagent trusts the compact rules.
   - It treats `## Project Standards (auto-resolved)` as authoritative for the listed conventions.
   - It does not re-read full SKILL.md files at runtime unless a "Read full SKILL.md when" trigger fires (debugging, a novel scenario, or the briefing says to load the full skill).

---

## Compact rule format

Per skill, the registry stores one block in this shape:

```markdown
## Skill: <slug>

**Purpose**: <1-line distilled from frontmatter description>

**Compact Rules**:

- DO: <imperative>
- DO NOT: <prohibition>
- WHEN <condition>: <action>
- WHEN <condition>: <action>
- (aim for 5 to 15 bullets; an authored section is carried whole, never truncated)

**Read full SKILL.md when**: <when full read is necessary>
```

### Example

```markdown
## Skill: unit-testing

**Purpose**: TDD workflow + test naming + mocking patterns + coverage strategy.

**Compact Rules**:

- DO: write the failing test before the production code (red-green-refactor).
- DO: use AAA (Arrange-Act-Assert) or Given-When-Then naming.
- DO: mock external I/O (HTTP, DB, fs) via injection — no module-level patching.
- DO NOT: assert on private fields. Test behavior through public API only.
- DO NOT: chain test cases — every test is independent.
- WHEN strict_tdd is true: refuse to add production code without a failing test first.
- WHEN testing a pure function: skip mocks; use direct input/output assertions.

**Read full SKILL.md when**: introducing a new mocking style not covered above, or when the user disputes a TDD verdict.
```

A block aims for at most about 20 lines including blank lines. An authored block (a `## Compact Rules` section, Strategy A, or a frontmatter `compact_rules:` field) is used whole, with no cap and no truncation, because every binding rule is put there on purpose (AGENTS.md §3 RULE REACHABILITY). A long one costs briefing tokens, never a rule. Only the blind Strategy B scrape is capped (see "Failure modes"), and a capped scrape means the subagent must read the full SKILL.md.

---

## How the orchestrator picks relevant skills

Apply this heuristic per dispatch, in priority order:

1. Explicit skill mentions in the briefing. If `Skills to load` lists `/unit-testing`, the registry block for `unit-testing` is included verbatim.
2. User-named slugs. A skill the user names for the task is included even if no skill is loaded.
3. Name match on the Goal and Context. Scan the dispatch's `Goal` and `Context docs` paths for known skill slugs, and include each match.
4. Context skills: only the aspect the dispatch touches. A `metadata.kind: context` skill (slug `<aspect>-context`) is injected when the dispatch's Goal, Context docs or touched files name its aspect, by testing level:
   - a task that seeds or asserts on data, writes SQL or reasons about an entity's lifecycle gets `business-data-context`;
   - one that writes API tests or reasons about endpoints, auth or status codes gets `business-api-context`;
   - one that writes UI / E2E tests, scopes a smoke or explores a user flow gets `business-e2e-context`;
   - one that names or labels domain concepts (authoring an ATP, naming test cases, refining ACs in business vocabulary) gets `business-domain-context`;
   - one that wires the framework to the stack, touches environments, CI or auth-in-tests, or sets performance / NFR budgets gets `infra-context`;
   - one that must explain or apply the methodology gets `iql-context`;
   - a project-owned `<aspect>-context` joins on its own aspect.

   For a context map skill (`CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) the briefing injects its read command (`bun run context:map <slug> --section <id>` when the dispatch touches one entity, journey, endpoint group, term or NFR), never the map file path, because the raw HTML is mostly SVG (`./business-context-maps.md` §3). Inject the aspects the dispatch touches and no others: the resolver exists to save tokens, and a subagent that touches one aspect pays for one. The relevance call is the orchestrator's, so a dispatch that names no aspect gets no context skill. When in doubt, name the aspect in the Goal.
5. Cap at 5 skills per briefing. Beyond five the briefing gets too noisy, so pick the top 5 by relevance and list the rest under "Other skills available — load on demand:".

Skills not matched are simply not pasted. The subagent can still load any skill at runtime if the registered rules are insufficient.

---

## Cache invalidation

Run `bun run skills:registry` when any of these is true:

- There is no registry file at `.agents/skills/REGISTRY.md`.
- `bun run skills:registry:check` reports it stale: a SKILL.md changed, a skill directory was added, or one was removed since the last build.
- The user asks for a rebuild.

The script is idempotent: re-running it on an unchanged repo produces a byte-identical file.

---

## Limits: what compact rules are not

Compact rules are deliberately incomplete. They cover the imperative skeleton (DO / DO NOT / WHEN) and nothing more. These stay out of them:

- Full instructions and step-by-step playbooks. Those live in the SKILL.md body and `references/*.md`.
- Troubleshooting and edge-case handling. Those live in `references/` files (e.g. `references/orchestration-doctrine.md` §Error protocol).
- Code examples and snippets. Compact rules name conventions and show no code.
- Tool syntax and CLI flags. Those live in the owning skill (e.g. `playwright-cli/SKILL.md`).
- Cross-skill workflows. A multi-stage flow like "plan → code → review → deploy" is the orchestrator's to compose. Compact rules describe per-skill conventions, not pipelines.
- Project-variable values. Things like `{{PROJECT_KEY}}` or `{{API_URL}}` are resolved by the project-variable system, not the registry.

When a subagent's task hits any of the above, the briefing must tell it explicitly to "load the full SKILL.md for `<slug>`". Without that, the compact rules govern.

---

## Failure modes and fallbacks

| Failure | Fallback |
| --- | --- |
| Registry file missing and build script not present | The orchestrator inlines the briefing without the auto-resolved section, and flags it as a degraded run. |
| Build script errors (e.g. malformed frontmatter) | The orchestrator continues with a stale registry if available; otherwise a degraded run as above. |
| Skill has no extractable rules (empty body, no bullets) | The registry emits a stub block: `**Compact Rules**: (none extracted — read full SKILL.md)`. The subagent reads the full file. |
| Strategy B scrape finds more than 15 bullets | The script keeps the first 15 and appends `(truncated — read full SKILL.md for the rest)`. An authored `## Compact Rules` section (Strategy A) or a frontmatter `compact_rules:` field is never truncated, whatever its length. |
| Subagent dispatched without `## Project Standards` | Acceptable if the dispatch is trivial (Anti-pattern: quick lookup). Required for any dispatch loading one or more skills. |

---

## Practical contract for skill authors

Frontmatter first (authoritative). A SKILL.md whose frontmatter carries a `compact_rules:` field owns its registry block outright. The build script uses those rules verbatim, with no extraction, no cap and no truncation, and stamps the entry `source: frontmatter`. Accepted shapes are a YAML list of strings (one rule per item) or a block scalar where each non-empty line is one rule (a leading `- ` is stripped). Use it when the compact block must differ from the body section (a skill whose body has no `## Compact Rules`, or whose binding rules are worded for briefings). The author then keeps the field in sync with the body, and `bun run skills:registry` picks changes up on the next rebuild (`skills:registry:check` flags staleness). Without the field, extraction applies as below.

To make a skill registry-friendly, authors should (but are not required to):

1. Add an explicit `## Compact Rules` (or `## Standards`) section near the top of the SKILL.md body. The build script's Strategy A picks it up verbatim; otherwise it falls back to bullet extraction (Strategy B), which is best-effort.
2. Aim for 5-15 bullets, one rule each, opening on the verb or the condition ("Read X before Y", "When X, do Y"). The section is carried whole, never truncated: every bullet in it reaches every briefing (AGENTS.md §3 RULE REACHABILITY), so a long section costs briefing tokens, not rules.
3. End the section with a single line `**Read full SKILL.md when**: ...` so the registry passes the trigger through verbatim.

Skills that skip this still work, because Strategy B extracts whatever bullets it finds. Strategy A is faster, cleaner and gives the author full control over what subagents see.
