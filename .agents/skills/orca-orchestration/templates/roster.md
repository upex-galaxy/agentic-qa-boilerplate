# Roster: <slug>

> Copy to `.session/orchestration/<slug>/roster.md`. Owner: the conductor, sole writer.
> Update a row the moment a value is issued, not at the end of the round. This table resolves "the
> one on BK-123" into something addressable and recovers a session after a crash: without a dispatch
> id a supervised worker cannot be addressed, without a terminal handle nobody can steer it, and
> without a name or resume command it cannot be resumed.
> In a same-checkout fleet this file is the recovery record: the board card is per-worktree there,
> so it can only point here (`references/coordinator-playbook.md` §3).

| Label | Key | Name | Task | Dispatch | Terminal | Worktree | Agent | Model | Mode | Resume | Cost | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| W1 | <KEY> | `<label>--term_…` | `task_…` | `dispatch_…` | `term_…` | primary | claude | <full model id> | bypass | `<harness resume command>` | <out tok / ctx at close> | in-flight |
| W2 | <KEY> | `<label>--term_…` | `task_…` | - | `term_…` | <wt name> | claude | <full model id> | bypass | `<harness resume command>` | - | waiting on claim |
| W3 | <KEY> | `<label>--term_…` (roster only: an OpenCode whose `/rename` takes no argument) | `task_…` | `dispatch_…` | `term_…` | <wt name> | opencode | <provider/model> | bypass | `<harness resume command>` | <out tok / ctx> | done, released |

`Name` is the worker's one name, `<label>--<handle>`. `<label>` is `[<KEY>-]<slug>`, the token the
worker's prompt opens with; `<handle>` is the `Terminal` column, read from `worker-list`
`agentTerminalHandle` after a native launch (gotcha G78). It is the session name, the tab title and
the `Session:` trailer. Where the harness cannot be renamed (an OpenCode whose `/rename` takes no argument), this row is the only place
the name exists: mark it `(roster only)`, the worker's trailer carries it, and the run report says so
once. `Label` is the owner's short alias (W1). `Mode` is the permission mode verified on the worker's
screen or argv at readiness, against `orchestration.permission_modes.worker`.

Fill `Cost` from the worker's own status footer, read with a screen read before you close it. No
command reports a session's usage and the number dies with the terminal (gotcha G54).

Status vocabulary, and nothing outside it: `queued` · `provisioning` · `launched` · `in-flight` ·
`waiting on claim` · `waiting on answer` · `blocked` · `done` · `done, released` · `abandoned`.

## Notes per worker

- **W1**: <anything the table cannot hold: the alternative it took after a denied claim, the scope
  correction the conductor approved, the reason it is retained instead of released>

## Handle hygiene

If the runtime restarts, every terminal handle in this table goes stale while every session stays
alive (gotcha G22), and every tab title still carries the old handle. Re-discover with
`orca terminal list --worktree <selector> --json </dev/null`, match each terminal on its label (the
part of the title before the last `--term_`), rewrite the `Terminal` column, and re-issue each tab
rename with the new handle before steering anyone. Then rename each resumed session too, with the
harness rename verb, on every harness (`references/coordinator-playbook.md` §5 step 6), rewrite the
`Name` column, and keep the old name in `## Notes per worker`: the commits made before the restart
carry it in their trailer.
