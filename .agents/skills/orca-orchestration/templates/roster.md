# Roster — <slug>

> Copy to `.session/orchestration/<slug>/roster.md`. Owner: the conductor, sole writer.
> Update a row the MOMENT a value is issued, never at the end of the round: this table is what
> resolves "the one on BK-123" into something addressable, and what recovers a session after a
> crash. A missing dispatch id makes a supervised worker unaddressable; a missing terminal handle
> makes any worker unsteerable; a missing name or resume command makes it unresumable.
> **In a same-checkout fleet this file IS the recovery record**: the board card is per-worktree
> there, so it can only point here (`references/coordinator-playbook.md` §3).

| Label | Key | Name | Task | Dispatch | Terminal | Worktree | Agent | Model | Mode | Resume | Cost | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| W1 | <KEY> | `<label>--term_…` | `task_…` | `dispatch_…` | `term_…` | primary | claude | <full model id> | bypass | `<harness resume command>` | <out tok / ctx at close> | in-flight |
| W2 | <KEY> | `<label>--term_…` | `task_…` | — | `term_…` | <wt name> | claude | <full model id> | bypass | `<harness resume command>` | — | waiting on claim |
| W3 | <KEY> | `<label>--term_…` (roster only: OpenCode v1) | `task_…` | `dispatch_…` | `term_…` | <wt name> | opencode | <provider/model> | bypass | `<harness resume command>` | <out tok / ctx> | done, released |

`Name` is the worker's one name, `<label>--<handle>` (`<label>` = `[<KEY>-]<slug>`, the token its
prompt opens with; `<handle>` = the `Terminal` column, read from `worker-list` `agentTerminalHandle`
after a native launch, gotcha G78). It is the session name, the tab title and the `Session:` trailer.
Where the harness cannot be renamed (OpenCode v1), the row is the only place the name exists: mark
it `(roster only)`, the worker's trailer carries it, and the run report says so once. `Label` is the
owner's short alias (W1). `Mode` is the permission mode verified on the worker's screen or argv at
readiness, against `orchestration.permission_modes.worker`.

`Cost` is filled from the worker's own status footer, read with a screen read **before** closing it:
no command reports a session's usage and the number dies with the terminal (gotcha G54).

Status vocabulary, and nothing outside it: `queued` · `provisioning` · `launched` · `in-flight` ·
`waiting on claim` · `waiting on answer` · `blocked` · `done` · `done, released` · `abandoned`.

## Notes per worker

- **W1** — <anything the table cannot hold: the alternative it took after a denied claim, the
  scope correction the conductor approved, the reason it is retained instead of released>

## Handle hygiene

If the runtime restarts, every terminal handle in this table is stale while every session is still
alive (gotcha G22), and every tab title still carries the old handle. Re-discover with
`orca terminal list --worktree <selector> --json </dev/null`, match each terminal on its label (the
part of the title before the last `--term_`), rewrite the `Terminal` column, and re-issue each tab
rename with the new handle before steering anyone. Then rename each resumed SESSION too, with the
harness rename verb, on every harness (`references/coordinator-playbook.md` §5 step 6), rewrite the
`Name` column, and keep the old name in `## Notes per worker`: the commits made before the restart
carry it in their trailer.
