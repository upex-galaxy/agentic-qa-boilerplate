# Measured Gotchas

> Loaded by: the conductor, when something behaves strangely — and read once in full before the
> first fleet on a new machine.
> Every row was PAID FOR in a real session, in one of three repos, on the date given. None of it
> is in any vendor guide. The `verified against` column is the app version the behaviour was last
> confirmed on; re-confirm with `orca agent-context --json` after an upgrade, and move a row to
> §3 when it stops being true.

---

## 1 · Runtime and mailbox

| # | Gotcha | Symptom | Fix | Measured | Verified against |
|---|---|---|---|---|---|
| G1 | **An unacknowledged batch replays forever** and hides everything queued behind it. Delivery is FIFO and a bound Run replays the same batch until it is acked | a `check` returns a message you recognize from 20 minutes ago | ack in the SAME command that re-arms the wait: `check --ack <id> --wait --types … --timeout-ms …`. Leave no window in which the ack can be forgotten | 2026-09-04, curacity, Sprint 20: a wave-1 status reappeared at the head of the queue while wave 2 was already launched, and wave 2's first reports were invisible | 1.4.190 |
| G2 | **An unacked batch also kills the notice.** The runtime notifies only on empty → non-empty, so once mail is unread it never notifies again | four messages accumulate for hours and the conductor believes the mailbox is quiet | verify every ack (`acknowledged` equals the id requested, pending count drops) and NEVER put it in a compound command whose exit code gets swallowed | 2026-09-14, upexgalaxy: an ack inside a compound command exited 1, nobody checked | 1.4.190 |
| G3 | **A Run admits exactly ONE actionable waiter**, and an orphaned one blocks the mailbox. A waiter started with a shell `&` holds the slot with nobody listening | `check` returns a failure naming an existing waiter instead of a batch. A quiet mailbox and a blocked one look identical | arm the waiter as a tracked foreground/background TASK, never with `&`. Recover by locating and killing the stale `orchestration check` process, then re-arm | 2026-09-04, curacity | 1.4.190 |
| G4 | **Every scripted call needs `</dev/null`.** The binary reads stdin when stdin is attached, and inside a loop or a background shell that read never returns | the command hangs with no output, indistinguishable from slow work | `</dev/null` on EVERY subcommand, not just the orchestration ones | 2026-09-04, curacity: a loop creating 18 tasks blocked on the FIRST call for 3+ minutes; with `</dev/null` all 18 finished in seconds | 1.4.190 |
| G5 | **`check --wait` writes keepalive JSON to stderr every 15 s** (`_keepalive`), unrelated to heartbeat messages | a merged stream looks like it is receiving messages that are not there | filter with `jq 'select(._keepalive|not)'` when merging streams | 2026-09-17, schema notes | 1.4.190 |
| G6 | **Do not build a monitor.** The runtime injects the notice itself; a homemade poller competes with it and can null it, and it triggers on ECHOES — the conductor's own messages are visible on the worker's screen, so a grep for a completion token reads them back as a report | a "report" that is actually the conductor's own instruction, or a notice that never fires | no monitor. Wait inside the turn with one waiter | 2026-09-13, upexgalaxy | 1.4.190 |
| G7 | **A reply body can arrive empty on the worker side** | the worker receives a bare `Re:` and asks the same question again | duplicate a substantive reply with `terminal send` and say in the body that you did | 2026-09, upexgalaxy | 1.4.190 (not re-measured) |
| G8 | **`task-create --deps <json_array>` has an undocumented element shape** — strings with ids, or objects? No example anywhere, and the schema's notes are empty | a dependency graph that silently does not constrain anything | do not use `--deps` yet. Order rounds by hand in `roster.md` | 2026-09-17, schema read | 1.4.190 |
| G9 | **A task reaches `dispatched` only through a real Dispatch.** A manual status update to `dispatched` is rejected | the ledger says `ready` while the worker is clearly working | adopt the terminal (`worker-start --terminal`) — that both creates the Dispatch and moves the task in one step | 2026-09, curacity | 1.4.190 |
| G10 | **The permission classifier can block the dispatch call itself**, independently of the terminal running fine | the task stays `ready` instead of `dispatched` | **cosmetic, not functional**: the worker already has its full command. Do not retry around the block; note the gap, continue, and square the ledger with a task status update when the worker finishes | 2026-09-06, curacity | 1.4.190 |

---

## 2 · Terminals, worktrees and launch

| # | Gotcha | Symptom | Fix | Measured | Verified against |
|---|---|---|---|---|---|
| G11 | **`terminal create --command` succeeds when the text is DELIVERED, not when it runs.** A line that dies in the shell (quoting error, missing script) reports success and leaves a bare prompt that looks launched | "the fleet is up" and nobody is working | read the screen (`terminal read --screen`) before telling the user the fleet is up, and look for the AGENT's status footer (model, effort, session name), not merely some output | 2026-09, curacity | 1.4.190 |
| G12 | **Recovering a failed launch needs no new terminal.** The tab, the title and the dispatch binding all survive a shell-level failure | recreating the terminal orphans the dispatch rows that point at the old handles | `terminal send --terminal <handle> --text '<corrected line>' --enter` | 2026-09, curacity | 1.4.190 |
| G13 | **`terminal read` needs `--screen` for a repainting TUI.** The default returns accumulated output with escapes stripped | a `clear` typed key by key reads back as `cclclecleaclear`, and spaces a prompt drew by moving the cursor are simply absent | `--screen` returns the rendered frame. The result reports `source`: `stream`, `screen`, or `screen-unavailable` | 2026-09, curacity | 1.4.190 |
| G14 | **The text arrives in `result.terminal.tail`**, an array of lines — NOT `result.lines` | a parser looking for `lines` returns empty forever, silently | read `tail`; siblings are `oldestCursor`, `nextCursor`, `latestCursor`, `returnedLineCount`, `source`, `status` | 2026-09, upexgalaxy | 1.4.190 |
| G15 | **The TUI status bar uses non-breaking spaces** | a grep that includes a space after a label never matches | grep the bare token, never a label plus space | 2026-09, upexgalaxy | 1.4.190 |
| G16 | **`--screen` and `--cursor` are mutually exclusive** — a screen read is the current frame and has no history to page | an error instead of a read | incremental reads = default stream mode + `--cursor <nextCursor>` | 2026-09-17, schema | 1.4.190 |
| G17 | **`tui-idle` is a READINESS signal, not completion.** It means the TUI stopped repainting, which happens the moment the session is ready for input | treating it as "worker finished" reports every ticket complete seconds after launch | completion is `worker_done`, plus the workflow's own artifacts | 2026-09, curacity | 1.4.190 |
| G18 | **`terminal stop` has worktree radius** — it stops the terminals of a whole worktree | a stop meant for one worker kills sibling sessions in the same checkout. Nearly killed three unrelated sessions in another repo | count first; to close ONE, `terminal close --terminal <handle> --tab` | 2026-09, upexgalaxy | 1.4.190 |
| G19 | **A context-only injection leaves the worker UNSUPERVISED on purpose**: no dispatch row, so the stop / release / abandon verbs do not close it, and it is reported as unsupervised | cleanup falls back to the worktree-wide stop, with its extra radius | supervise by adopting the terminal into the Task (`worker-start --terminal`). Keep the injection path only for a terminal you intend to close by hand | 2026-09, upexgalaxy (error #9) | 1.4.190 |
| G20 | **A base-ref flag resolves LOCAL refs.** A worktree can be born behind the remote base | the worker builds on a stale base and its merge looks like someone else's regression | `fetch`, then verify the SHA against `origin/<base>`. Never `\|\| true` | 2026-09-05 and again 2026-09-07 (three worktrees), upexgalaxy | 1.4.190 |
| G21 | **A worktree created early is born stale.** With a moving base, a worktree made half an hour before launch starts behind | same as G20, but with nobody to blame | create the worktree JUST before launching | 2026-09, upexgalaxy | 1.4.190 |
| G22 | **Handles change if the runtime restarts**; the sessions survive as separate processes | every handle in the roster is dead while every worker is alive | re-discover with `terminal list --worktree <sel>` and update the roster | 2026-09, upexgalaxy | 1.4.190 |
| G23 | **`result.terminal.status == exited` is usually the conductor** having closed that terminal itself | a false "the worker crashed" | correlate with the release you performed before concluding anything | 2026-09, upexgalaxy | 1.4.190 |
| G24 | **The setup-hook setting is UI-only.** The CLI does not expose it and desktop automation is blocked by OS permissions on macOS | an automation plan that assumes it can be scripted | change it once per machine in the app. `references/orca-machine-setup.md` | 2026-09, upexgalaxy | 1.4.190 |
| G25 | **The gate flag is NESTED** (`.result.runtime.reachable`), not a flat field | fails closed and silently on a perfectly capable machine | read the nested path, and test any gate edit by running BOTH branches | 2026-09, curacity | 1.4.190 |
| G26 | **Runs from other repos coexist on one machine** | a conductor that picks a Run from a listing binds to another repo's fleet | never guess: the Run id lives in `run.md`; `run-current` says what this terminal is bound to | 2026-09-17 | 1.4.190 |

---

## 3 · Lies in the vendor guide (verified by hand, not read)

| The guide says | Reality | Checked |
|---|---|---|
| use `check --unread --inject`, recommended twice | **`--inject` does not exist on `check`.** The runtime answers with an unknown-flag error; `--inject` lives only on `dispatch` | 2026-09-17, v1.4.190 |
| `coordinator-start` / `coordinator-stop` appear in `--help` with all their flags | **retired**: both are no-ops that return a recovery action and perform no effect. The schema now says so in its own notes | 2026-09-17, v1.4.190 |
| `skills get --reference` / `--references` | **rejected.** Valid flags are `--full`, `--json`, `--topic` (plus the global ones) | 2026-09-17, v1.4.190 |
| `task-create --deps <json_array>` | the flag exists; the ELEMENT shape is documented nowhere and the schema's notes are empty (G8) | 2026-09-17, v1.4.190 |

---

## 4 · Repo and harness traps that bite a fleet

| # | Gotcha | Symptom | Fix | Measured |
|---|---|---|---|---|
| G27 | **Launching in an edits-only permission mode.** It covers file edits, not COMMANDS, so every script call waits on a human who is not watching | a worker that leaves every tracker mutation computed and unexecuted | launch with an auto permission mode | 2026-09, upexgalaxy (error #6) |
| G28 | **An effort flag that does not validate.** An invalid effort level starts the session on the default with nobody told; the permission-mode flag DOES reject an invalid value | a fleet silently running at default effort | pin the full model id and a known effort level, and confirm both in the agent's status footer on screen | 2026-09-02, upexgalaxy |
| G29 | **A model alias moves on its own.** An alias means "the latest", so a fleet pinned to an alias changes model under you between rounds | irreproducible results across rounds | pin the FULL provider model id | 2026-09-02, upexgalaxy |
| G30 | **A quoting character in the prompt kills the line.** A double quote or an angle bracket inside the prompt breaks the shell parse | five launch lines died at once and the environment variables never exported; the terminals looked fine | no `"` and no `<` / `>` inside the prompt; validate every line with a shell syntax check before launching | 2026-09-04, curacity |
| G31 | **Ten live worktrees took the runtime down twice** in one session | runtime timeouts, a fleet that stops responding | close a finished worker in the SAME turn, not at the end of the wave | 2026-09, upexgalaxy (error #4) |
| G32 | **Creating the terminal and not sending the brief**, twice in one day | a worker idle for FIVE hours | create + launch + brief is one indivisible operation; verify with a working-tree status check within minutes | 2026-09-02, upexgalaxy (error #7) |
| G33 | **Four tasks in one message** | the worker executed one | one message, one task | 2026-09, upexgalaxy (error #5) |
| G34 | **Periodic heartbeats wake the conductor to read "alive"**, and the injected preamble asks for them | the conductor interrupted every few minutes per worker | the brief prohibits them explicitly, with the reason | 2026-09-14, owner decision |
| G35 | **The harness's agent-messaging tool does not reach the conductor** from an isolated worktree | on 2026-09-13 five workers reported this way: two to an unrelated session, three left typed and unsent; the conductor found out by reading screens up to 35 minutes late | the mailbox is the channel; the brief prohibits the alternative | 2026-09-13, upexgalaxy |
| G36 | **A user-question prompt from a worker is seen by nobody** | one question waited 7.5 hours | a blocking `ask` to the conductor, or a message plus continuing on what does not depend on it | 2026-09, upexgalaxy (error #8) |
| G37 | **Orphaned browser sessions.** Ten headless browsers, ~2.7 GB, running for hours | machine slowdown the owner noticed before the fleet did | close every browser-automation session before reporting, including subagents' | 2026-08-30, upexgalaxy |
| G38 | **Two dev servers on one checkout fight over the same build directory.** Splitting PORTS does not help | 404s with missing-file errors from the build cache | one dev server per worktree | 2026-09, upexgalaxy (error #7 of the hard rules) |
| G39 | **A full disk makes a worker MUTE, not failed.** Writing the output fails, not the command, and the message command is also a shell process; file writes keep working | a worker that works and reports nothing | check free disk before a long round; each worker can leave hundreds of MB of build cache | 2026-09, upexgalaxy |
| G40 | **A brief that cites an uncommitted path in the conductor's own scope is invisible to a worker in a worktree** | the worker proceeds without its context, silently | cite ABSOLUTE paths into the primary checkout | 2026-09, upexgalaxy |
| G41 | **A skill can exist only in the primary checkout** (gitignored T3 install) | `Unknown skill` in the worktree | provision it (`references/provisioning.md`); verify with `git check-ignore` before assuming it travels | 2026-09, upexgalaxy |
| G42 | **A declared MCP server is not an enabled one.** A server disabled for the project leaves the session without tools AND without an error | a worker that quietly skips the database or API leg of its exploration | the worker's domain skill keeps its own non-bypassable tool probe; never route that probe through the orchestrator | 2026-09, upexgalaxy |
| G43 | **A git index collision in a same-checkout fleet**, even between workers editing disjoint files | a failed commit, or a commit that picked up a sibling's staged file | stage explicit paths, commit with a pathspec, retry on `index.lock` | 2026-09-15, THIS repo (4 workers, 24 commits, 1 collision) |

---

## 5 · Two laws worth more than any single row

1. **An exclusion declared by SELECTOR only excludes where someone already looked; one declared by
   MECHANISM excludes where nobody has looked yet.** Three separate incidents shared this shape (a
   forbidden trailer matched by exact string instead of by rule, a contrast check that stopped at the
   first background image, a rename sweep that missed prose). Prefer the mechanism.

2. **Beware a tool whose radius exceeds the intention.** The worktree-wide terminal stop, a repo-wide
   git discard, an untargeted stash: each does more than the sentence that called it. Count, scope,
   or pick the narrower verb.
