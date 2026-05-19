# Skill Resolver Protocol

> Cited by: `agentic-qa-core/references/briefing-template.md` and every workflow skill that dispatches subagents (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`).
> Companion script: `scripts/build-skill-registry.ts`. Cache file: `.claude/skills/REGISTRY.md`.

## Purpose

Subagents that re-read every relevant `SKILL.md` before they act burn tokens redundantly. The orchestrator already knows which skills are in scope — it just needs to pre-extract the must-do / must-not-do rules and inline them into the briefing. This is the **Skill Resolver** protocol: build a registry once per session, paste compact rules per dispatch.

Net effect:

- Subagents trust a 5-15-line "Compact Rules" block instead of opening the full SKILL.md.
- Token cost per dispatch drops by an order of magnitude when multiple skills overlap.
- Orchestration stays auditable — the rules pasted into a briefing are the same rules the orchestrator itself read.

This is a token-saving protocol, not a behavioral one. Subagents are still allowed to read the full SKILL.md when the compact rules are insufficient (see "Limits" below).

---

## The protocol

1. **Build (or read) the registry, once per session.**
   - At the first significant subagent dispatch (i.e. the first dispatch where `Skills to load` is non-empty), the orchestrator runs `bun scripts/build-skill-registry.ts`.
   - The script scans `.claude/skills/*/SKILL.md`, extracts compact rules per skill, and writes `.claude/skills/REGISTRY.md`.
   - If `.claude/skills/REGISTRY.md` already exists AND every `SKILL.md` mtime is older than the registry's mtime, the orchestrator skips the rebuild and reads the cached file directly.

2. **Inject `## Project Standards (auto-resolved)` into every briefing.**
   - For each subagent dispatch, the orchestrator picks the relevant skills (see "How orchestrator picks relevant skills" below).
   - The orchestrator copies the matching skills' compact-rule blocks from `.claude/skills/REGISTRY.md` into a new briefing section titled `## Project Standards (auto-resolved)`.
   - This section sits between `Context docs` and `Exact instructions` in the 6-component briefing template.

3. **Subagent trusts the compact rules.**
   - The subagent treats `## Project Standards (auto-resolved)` as authoritative for the listed conventions.
   - The subagent does NOT re-read full SKILL.md files at runtime unless one of the "Read full SKILL.md when" triggers fires (debugging, novel scenario, or the briefing explicitly says to load the full skill).

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
- (5 to 15 bullets total — no more)

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

The block is at most ~20 lines including blank lines. Anything longer means the orchestrator should consider that skill "too rich for compact" and the subagent must read the full SKILL.md.

---

## How the orchestrator picks relevant skills

Heuristic, applied per dispatch in order of priority:

1. **Explicit skill mentions in the briefing.** If `Skills to load` lists `/unit-testing`, the registry block for `unit-testing` is included verbatim.
2. **User-named slugs.** If the user says "use sprint-development for this", the orchestrator includes `sprint-development` even if no skill is loaded.
3. **Name-match heuristic on the Goal + Context.** The orchestrator scans the dispatch's `Goal` and `Context docs` paths for known skill slugs. Match → include. (E.g. a goal that says "scaffold the bootstrap" includes `project-bootstrap`.)
4. **Phase-match.** Each SKILL.md frontmatter declares `phase:` (`bootstrap`, `foundation`, `implementation`, etc.). If the orchestrator's current workflow phase matches the briefing's intent, include skills with that phase.
5. **Cap at 5 skills per briefing.** Beyond five, the briefing becomes too noisy. The orchestrator picks the top 5 by relevance and lists the rest under "Other skills available — load on demand:".

Skills NOT matched are simply not pasted. The subagent can still load any skill at runtime if the registered rules are insufficient.

---

## Cache invalidation

The registry is regenerated when any of these is true:

- **No registry file** at `.claude/skills/REGISTRY.md`.
- **A SKILL.md is newer than the registry.** The script compares mtimes; any skill with `mtime > registry.mtime` triggers a full rebuild.
- **A new skill directory exists under `.claude/skills/`** that the registry does not list.
- **A skill directory was removed.** The registry still references a skill that no longer has a SKILL.md → rebuild and drop the orphan.
- **The user runs `bun scripts/build-skill-registry.ts`** explicitly. Manual override always rebuilds.
- **Session start.** A fresh session always re-checks invalidation conditions before reusing the cache.

The script is idempotent — re-running it on an unchanged repo produces a byte-identical file.

---

## Limits — what compact rules are NOT

The compact rules are deliberately incomplete. They cover the imperative skeleton (DO / DO NOT / WHEN), nothing more. Out of scope for compact rules:

- **Full instructions / step-by-step playbooks.** Those live in the SKILL.md body and `references/*.md`.
- **Troubleshooting and edge-case handling.** Those live in `references/` files (e.g. `references/orchestration-doctrine.md` §Error protocol).
- **Code examples and snippets.** Compact rules name conventions; they don't show code.
- **Tool syntax / CLI flags.** Those live in the owning skill (e.g. `playwright-cli/SKILL.md`).
- **Cross-skill workflows.** A multi-stage flow like "plan → code → review → deploy" is the orchestrator's job to compose. Compact rules describe per-skill conventions, not pipelines.
- **Project-variable values.** Things like `{{PROJECT_KEY}}` or `{{API_URL}}` are resolved by the project-variable system, not the registry.

When a subagent's task hits any of the above, the briefing must explicitly tell the subagent to "load the full SKILL.md for `<slug>`" — otherwise the compact rules govern.

---

## Failure modes and fallbacks

| Failure                                                 | Fallback                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Registry file missing AND build script not present      | Orchestrator inlines the briefing without the auto-resolved section, but flags it as a degraded run.               |
| Build script errors (e.g. malformed frontmatter)        | Orchestrator continues with stale registry if available; otherwise degraded run as above.                          |
| Skill has no extractable rules (empty body, no bullets) | Registry emits a stub block: `**Compact Rules**: (none extracted — read full SKILL.md)`. Subagent reads full file. |
| Compact rule block exceeds 15 bullets                   | Script truncates to 15 + appends `(truncated — read full SKILL.md for the rest)`.                                  |
| Subagent dispatched without `## Project Standards`      | Acceptable if the dispatch is trivial (Anti-pattern: quick lookup). Required for any dispatch loading >=1 skill.   |

---

## Practical contract for skill authors

To make a skill registry-friendly, authors SHOULD (but are not required to):

1. Add an explicit `## Compact Rules` (or `## Standards`) section near the top of the SKILL.md body. The build script's Strategy A picks this up verbatim; otherwise it falls back to bullet extraction (Strategy B), which is best-effort.
2. Keep that section to 5-15 bullets, each starting with `DO:`, `DO NOT:`, or `WHEN <cond>:`.
3. End the section with a single line `**Read full SKILL.md when**: ...` so the registry passes the trigger through verbatim.

Skills that don't follow this still work — Strategy B extracts whatever bullets it finds. But Strategy A is faster, cleaner, and gives the author full control over what subagents see.
