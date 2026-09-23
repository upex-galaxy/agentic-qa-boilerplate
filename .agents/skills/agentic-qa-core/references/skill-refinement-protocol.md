# Skill Refinement Protocol — how a session proposes a lesson for a skill

> Cited by: the session-close step of every workflow skill (`shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development`) and by `skill-scaffold.md` (the context-skill template).
> Companion to `session-management.md` §3 (the companion file this protocol writes lives INSIDE the running skill's scope) and `upstream-feedback.md` (the path a refinement takes when the target skill is upstream-owned).

A session that learns something mid-flight writes a **proposal**, never the skill. The live `SKILL.md` and its `references/` change only through a human OK, per entry, because a skill is not a note: it is committed, loaded into every future session by trigger, projected into every subagent briefing through `REGISTRY.md`, and, for an upstream skill, propagated to every consumer by `bun run up`. A wrong lesson in Engram is a bad recollection. A wrong lesson in a skill is a shipped regression.

---

## 1 · Skill edit vs Engram vs `.context/` — the four criteria

A lesson earns a skill edit only when **all four** hold. Otherwise it is an Engram save (session memory) or a `.context/` fact (regenerable from a source).

| # | Criterion | Fails when |
|---|---|---|
| 1 | **Stable**: true next sprint too | it is about this ticket, this build, this week's outage |
| 2 | **Not regenerable**: no command produces it from a source of truth (code, OpenAPI, Jira, a live DB, a CI log) | it is a fact: an endpoint, an entity, a status name → `.context/` (`bun run context:hydrate`, `bun run api:sync`, `project-context`) |
| 3 | **Changes what the agent DOES next time**: a rule, an order, a gotcha with a fix | it is narrative ("we struggled with X") |
| 4 | **Paid for**: a date, a session label, and what was measured | it is a hunch, an opinion, or something read in a blog |

Entry genre already in the repo: `orca-orchestration/references/gotchas.md` rows carry `Measured` and `Verified against` columns and a section for rows that stopped being true; `acli/references/gotchas.md` and `jira-publishing-gotchas.md` are the same shape. A refinement targets that genre by default.

## 2 · What the session writes, and when

| Moment | Write | Owner |
|---|---|---|
| A lesson is noticed | Append ONE block (§3) to `.session/<active-workflow-slug>/<scope>/refinements.md` — a companion file inside the running skill's OWN scope (`session-management.md` §3 permits companions; nothing else under `.session/` is allowed) | the session, unprompted |
| Same moment | `mem_save` with `topic_key: skill-refinement/<target-slug>` so the proposal survives a wiped `.session/` | the session |
| Session close | The session footer (`session-footer-contract.md` Part 2) gains one line: `Refinements proposed: N → <path>` (`0` and no path when none) | the session |
| Review | The owner reads the file and answers **apply / drop per entry**. Never auto-applied. An entry without a measurement is dropped at review | human |

A fleet has the same mechanism at conductor altitude: `.session/orchestration/<slug>/skill-improvements.md` (`orca-orchestration/references/coordinator-playbook.md` §9). Both use the block schema below so a harvest can merge them.

## 3 · The block schema (one per lesson, append-only)

```markdown
## R-<NN> · <target-slug> · <YYYY-MM-DD>
- target_file: references/gotchas.md            # default; a compact rule ONLY when the rule itself is wrong
- kind: <context|workflow|utility|core>          # the target skill's metadata.kind
- proposed_text: |
    <the row or paragraph exactly as it would land in the target file>
- evidence: <date · session label · what was measured, one line>
- confidence: high | medium | low
- criteria: stable=yes|no · regenerable=no|yes · changes_behavior=yes|no · paid_for=yes|no
- upstream: local | upstream (<slug> is synced by `bun run up`; see upstream-feedback.md)
```

Every field is mandatory. `criteria` with any wrong value means the entry is Engram material, not a refinement: still record it there, and say so in the line.

## 4 · Apply matrix (after the human OK)

| Target skill is | Apply path |
|---|---|
| Project-owned (a `-context` skill, or any skill the project authored) | Surgical append to `target_file`, then `bun run skills:check`, `bun run skills:registry`, commit |
| Boilerplate-owned, and this checkout IS the boilerplate | `/framework-development` (its Phase 3 already runs `skills:check`) |
| Boilerplate-owned, inside a consumer repo | Do NOT edit it here: the next `bun run up` overwrites the file (parity row `overwritten`, backup named). The refinement becomes an upstream issue per `upstream-feedback.md`. `updater.protected_paths` remains the escape hatch for a deliberate private fork, at the stated cost of losing upstream fixes for that file |

## 5 · What stops a wrong lesson from being burned in

1. The human gate, per entry.
2. `evidence` and the date are mandatory; no measurement, no entry.
3. Gotcha files are append-only with a "no longer true" section; a row is moved there, never rewritten into something else.
4. `bun run skills:check` and `bun run skills:registry:check` on every commit.
5. A compact-rule change is a briefing change for every subagent, so it takes the optional `/judgment-day` gate the repo already cites for review-grade edits.
