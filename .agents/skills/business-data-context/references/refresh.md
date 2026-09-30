# Refresh — keeping `business-data-map.html` honest

> Loaded by `business-data-context` when a session observes something the map contradicts, or when someone asks whether the map is stale. The generic procedure (anatomy, the five steps, the write scope) is SYNCED doctrine in `agentic-qa-core/references/business-context-maps.md` §5-§6; this file holds only what is specific to this aspect, and it is the project's own.

## Staleness signals for this aspect

| Signal in `data-sources` | Stale when | Check |
|---|---|---|
| a backend path (`src/orders/`, a model, a service) | a commit touched it after `data-updated` | `git -C {{BACKEND_REPO}} log --since=<data-updated> --oneline -- <path>` |
| `db:<table>` | a migration since the date, or the live schema shows a column, constraint, enum value or trigger the section does not describe | the migrations folder's `git log`, then `[DB_TOOL]` read-only |
| `cron:<job>` / `webhook:<event>` | the scheduler or handler file changed | `git log` on the file named |
| a third-party integration | its client module or SDK version changed | `git log` on the client module, the dependency manifest |

A section with no declared sources is `unknown`, never fresh.

## Two paths, never mixed

| Situation | Who writes | How |
|---|---|---|
| one section contradicted by something a session observed | this skill, after approval | the five steps of `agentic-qa-core/references/business-context-maps.md` §6: locate, evidence, PROPOSE, apply on approval, verify |
| several sections stale, or a new entity / flow / group the map lacks | `project-context` mode `data` UPDATE | it regenerates only the stale sections and shows a section-level diff; hand the user that mode, do not rebuild sections here |

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

## Never

- Edit a file outside this skill's `references/`.
- Rewrite a section that was not contradicted, or regenerate the whole map.
- Change a section id: a renamed entity is a new section plus one line in `discovery-gaps` for one refresh.
