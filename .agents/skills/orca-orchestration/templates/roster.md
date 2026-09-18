# Roster — <slug>

> Copy to `.session/orchestration/<slug>/roster.md`. Owner: the conductor, sole writer.
> Update a row the MOMENT a value is issued, never at the end of the round: this table is what
> resolves "the one on BK-123" into something addressable, and what recovers a session after a
> crash. A missing dispatch id makes a supervised worker unaddressable; a missing terminal handle
> makes any worker unsteerable; a missing session label or resume command makes it unresumable.
> **In a same-checkout fleet this file IS the recovery record**: the board card is per-worktree
> there, so it can only point here (`references/coordinator-playbook.md` §3).

| Label | Key | Task | Dispatch | Terminal | Worktree | Agent | Model | Session label | Resume | Cost | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| W1 | <KEY> | `task_…` | `dispatch_…` | `term_…` | primary | claude | <full model id> | <KEY>-<slug> | `<harness resume command>` | <out tok / ctx at close> | in-flight |
| W2 | <KEY> | `task_…` | — | `term_…` | <wt name> | claude | <full model id> | <KEY>-<slug> | `<harness resume command>` | — | waiting on claim |
| W3 | <KEY> | `task_…` | `dispatch_…` | `term_…` | <wt name> | opencode | <provider/model> | <KEY>-<slug> | `<harness resume command>` | <out tok / ctx> | done, released |

`Cost` is filled from the worker's own status footer, read with a screen read **before** closing it:
no command reports a session's usage and the number dies with the terminal (gotcha G54).

Status vocabulary, and nothing outside it: `queued` · `provisioning` · `launched` · `in-flight` ·
`waiting on claim` · `waiting on answer` · `blocked` · `done` · `done, released` · `abandoned`.

## Notes per worker

- **W1** — <anything the table cannot hold: the alternative it took after a denied claim, the
  scope correction the conductor approved, the reason it is retained instead of released>

## Handle hygiene

If the runtime restarts, every terminal handle in this table is stale while every session is still
alive (gotcha G22). Re-discover with `orca terminal list --worktree <selector> --json </dev/null`
and rewrite the column before steering anyone.
