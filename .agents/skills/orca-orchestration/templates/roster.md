# Roster — <slug>

> Copy to `.session/orchestration/<slug>/roster.md`. Owner: the conductor, sole writer.
> Update a row the MOMENT a value is issued, never at the end of the round: this table is what
> resolves "the one on BK-123" into something addressable, and what recovers a session after a
> crash. A missing dispatch id makes a supervised worker unaddressable; a missing terminal handle
> makes an unsupervised one unsteerable; a missing session label makes it unresumable.

| Label | Key | Task | Dispatch | Terminal | Worktree | Agent | Model | Session label | Status |
|---|---|---|---|---|---|---|---|---|---|
| W1 | <KEY> | `task_…` | `dispatch_…` | `term_…` | primary | claude | <full model id> | <KEY>-<slug> | in-flight |
| W2 | <KEY> | `task_…` | — | `term_…` | <wt name> | claude | <full model id> | <KEY>-<slug> | waiting on claim |
| W3 | <KEY> | `task_…` | `dispatch_…` | `term_…` | <wt name> | opencode | <provider/model> | <KEY>-<slug> | done, released |

Status vocabulary, and nothing outside it: `queued` · `provisioning` · `launched` · `in-flight` ·
`waiting on claim` · `waiting on answer` · `blocked` · `done` · `done, released` · `abandoned`.

## Notes per worker

- **W1** — <anything the table cannot hold: the alternative it took after a denied claim, the
  scope correction the conductor approved, the reason it is retained instead of released>

## Handle hygiene

If the runtime restarts, every terminal handle in this table is stale while every session is still
alive (gotcha G22). Re-discover with `orca terminal list --worktree <selector> --json </dev/null`
and rewrite the column before steering anyone.
