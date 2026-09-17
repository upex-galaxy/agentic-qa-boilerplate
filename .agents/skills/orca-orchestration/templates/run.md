# Run — <slug>

> Copy to `.session/orchestration/<slug>/run.md`. Owner: the conductor. Replace every `<…>`.
> This file is what a SECOND conductor binds to. Everything it needs to take over is here or is
> pointed at from here.

| Field | Value |
|---|---|
| Run id | `run_…` |
| Objective | <one sentence: what is being coordinated> |
| Coordinator handle | `…` |
| Created | <YYYY-MM-DD HH:MM> by <session label> |
| Primary checkout | <absolute path> |
| Base branch | <branch> |
| Topology | <same-checkout fleet \| worktree per worker \| worktree per cluster> (`references/topologies.md`) |
| Worker cap | <n> (source: `.agents/project.yaml` → `orchestration.max_workers`, or the user's explicit instruction for this run) |
| Agent / model / effort | <agent> / <full model id> / <effort> |
| Board status mapping | <todo=… · in-progress=… · in-review=… · completed=…> |
| Gate state at start | <C ready \| A no binary (fallback: human pastes launch.txt)> |

## Scope files

All absolute, in the primary checkout:

- `<ABS>/.session/orchestration/<slug>/roster.md`
- `<ABS>/.session/orchestration/<slug>/COMMON.md`
- `<ABS>/.session/orchestration/<slug>/launch.txt`
- `<ABS>/.session/orchestration/<slug>/claims.md`
- `<ABS>/.session/orchestration/<slug>/reports/`

## Rounds

| Round | Workers | Started | Closed | Notes |
|---|---|---|---|---|
| 1 | <labels> | <HH:MM> | <HH:MM> | |

Rounds are concurrency groups. If this wave belongs to a workflow that has status waves
(`sprint-testing`), number them inside the wave: "Wave 1, round 2".

## Conductor-only operations done for this Run

- [ ] tokens minted (<when>, profiles: <…>)
- [ ] schema sync run (<when>)
- [ ] tracker cache hydrated (<when>, scope: <…>)
- [ ] generated registries regenerated after integration (<which>)

## Open decisions for the owner

1. <decision, with the recommendation>

## Log

- <YYYY-MM-DD HH:MM> — <what happened, one line>
