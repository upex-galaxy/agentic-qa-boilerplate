# Refresh: keeping `business-data-map.html` honest

> Loaded by `business-data-context` when a session observes something the map contradicts, or when someone asks whether the map is stale. The generic procedure (anatomy, the five steps, the write scope) is synced doctrine in `agentic-qa-core/references/business-context-maps.md` §5-§6. This file holds only what is specific to the data aspect, and the project owns it.

## Staleness signals for this aspect

| Signal in `data-sources` | Stale when | Check |
|---|---|---|
| a backend path (`src/orders/`, a model, a service) | a commit touched it after `data-updated` | `git -C {{BACKEND_REPO}} log --since=<data-updated> --oneline -- <path>` |
| `db:<table>` | a migration since the date, or the live schema shows a column, constraint, enum value or trigger the section does not describe | the migrations folder's `git log`, then `[DB_TOOL]` read-only |
| `cron:<job>` / `webhook:<event>` | the scheduler or handler file changed | `git log` on the file named |
| a third-party integration | its client module or SDK version changed | `git log` on the client module, the dependency manifest |

A section with no declared sources is `unknown`, never fresh.

## Two paths, never mixed

Keep them apart, because one edits a single section and the other regenerates several.

| Situation | Who writes | How |
|---|---|---|
| one section contradicted by something a session observed | this skill, after approval | the five steps of `agentic-qa-core/references/business-context-maps.md` §6: locate, evidence, propose, apply on approval, verify |
| several sections stale, or a new entity / flow / group the map lacks | `project-context` mode `data` UPDATE | it regenerates only the stale sections and shows a section-level diff; hand the user that mode instead of rebuilding sections here |

## The proposal, in one message

```
business-data-context · proposed edit to section <id> (updated <date>)
evidence: <what was observed, how, where: query / request / file@commit / session label>
before: <the sentence or row as the map has it>
after:  <the replacement>
figure: <unchanged | redraw: why>
apply? (yes / no)
```

Verify the edit with `[DB_TOOL]` (capability `db`) before proposing it. Only `yes` applies it; silence is not approval.

Who answers `apply?` depends on who is running:

- A person is present: they answer.
- A supervised worker: send the proposal to the conductor, which holds the gate, and apply only on its yes.
- A routine with nobody: apply only when the delegating brief names this edit. Otherwise leave the proposal in the report and the map untouched until a person or conductor approves (`agentic-qa-core/references/decision-protocol.md`).

## Never

- Edit a file outside this skill's `references/`: the skill owns one map and nothing else.
- Rewrite a section that was not contradicted, or regenerate the whole map: that is `project-context` mode `data`.
- Change a section id: a renamed entity is a new section plus one line in `discovery-gaps` for one refresh.
