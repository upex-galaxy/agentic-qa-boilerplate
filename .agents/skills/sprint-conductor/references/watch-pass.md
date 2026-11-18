# The watch pass: one pass per sentinel wake

> Loaded by: the conductor, on every sentinel wake (and on every scheduled pass on a harness without
> background tasks). Parameters, never fixed values: `<N>`, `<slug>`, `<run>`, `<cap>`, `<env>`.
> The wake reasons and what each one asks: `sprint-testing/references/sprint-board.md` §7. The board
> commands: `cli/sprint-board/README.md`.

During working hours the conductor watches the sprint instead of waiting to be asked: when a ticket
reaches the test environment it checks that the change is really deployed, prepares and launches its
worker, and keeps the board and the sprint record current, so the team gets QA feedback early.

One pass is the steps below, then stop. A pass with nothing to do prints ONE line and ends. A step that
fails is logged and the pass moves on, so a pass never blocks. Every decision is recorded with
`bun run board arrival <KEY> launched|held|skipped "<why>"`, which makes passes idempotent: a missed pass
costs nothing, and the ticket shows up on the next one. After §6, re-arm the sentinel in the same turn
(`sprint-board.md` §7).

---

## 1. Guard and the first pass of the day

- The CURRENT board must be `<slug>` (`bun run board sprints`). If it is not, say so once and stop.
- On a scheduled pass (the fallback), outside working hours: do nothing, say nothing. The sentinel does
  not wake then.
- First pass of the day: check what died overnight and report it in one line instead of restarting it
  on your own: the board page answers, the orchestration runtime is reachable, the mailbox read returns
  `ok`, and `bun run board status` shows a recent "Last watch pass". The restart path is
  `/sprint-conductor --resume` (`references/boot-and-resume.md` §4). The one exception is the board server,
  whose working-hours lifecycle the sentinel owns.

## 2. Detect

```bash
bun run board arrivals --sync      # sync --discover, then NEW / RECHECK / UNTRACKED with denominators
```

For each `UNTRACKED <KEY> <status> QA:<name|blank> <title>` line (a sprint ticket in the test environment
that is not on the board):

- QA owner blank and it fits this QA: assign it in the tracker, `bun run board add <KEY>`, re-run
  `arrivals`. Measured on the source board: three tickets sat in the test environment with no QA owner,
  and only a manual tracker query caught them.
- Another QA owns it: skip it and mention it once in the pass line.
- `UNCLASSIFIED <KEY> <status>`: a status no bucket lists; tell the owner in one line to add it to
  `board.statuses` (`bun run board:check` names it), and leave it out of every count.
- `untracked: not checked`: the untracked search did not run, so its silence proves nothing. Query the
  tracker for the sprint's tickets in the test environment (`[ISSUE_TRACKER_TOOL]`, the `board.jql`
  scope) before concluding nothing arrived.

Nothing NEW or RECHECK: go straight to §5.

## 3. Triage each NEW and RECHECK ticket

1. Scope: read the ticket (`bun run jira:sync-issues get <KEY>` refreshes its synced copy). Is it in the
   sprint test plan? A ticket that is not goes on the sprint-record update list (§4 step 7).
2. The deploy check always runs. A tracker status is a hint, the deployed build is the truth. The
   mechanics are `sprint-testing/references/session-entry-points.md` Step 1c: the change's merge commit
   contained in the build the environment runs. The source fleet paid for these additions:
   - Read the change's files. A part of the system the pipeline does not deploy (a background job, a
     worker deployed by hand, a scheduled sync) is not proven by a green deployment: prove it from that
     part's own output, or hold. Measured on the source fleet: three of four arrivals had their change in the
     environment's build while the background part was not deployed.
   - A part deployed on a schedule proves itself only after its next run: the deploy AND a run
     after it. Hold until both, and recheck after the scheduled run.
   - A ticket key in a commit message is not code. A key found by grepping the deployed branch's
     history can belong to a docs or roadmap commit only. Limit the search to code paths and to non-merge
     commits (`git log <deployed-ref> --no-merges --grep=<KEY> -- <code dirs>`), and for a soft result
     (zero hits for a change you believe shipped, or hits only in shared files) read the route or page the
     change adds in the deployed build before deciding. Measured on a downstream trial: ten Ready-for-Dev
     tickets matched only docs commits, and one deployed feature matched no commit by key at all.
   - Name the feature gate, not a page flag. A flag that only shows a page proves nothing about the
     behaviour behind it; the brief names the setting that actually turns the behaviour on, and the data
     that puts it in scope.
   - Not deployed: `bun run board arrival <KEY> held "<what is missing>"` plus
     `bun run board hold <KEY> --reason deploy --on <developer> "<what>"`. Next ticket. A held ticket comes
     back as RECHECK on every pass, and on the `recheck-sweep` wake.
3. Module: the ticket's module (its Epic) decides which synced `module-context.md` and which recorded
   fixtures its brief carries.
4. Skip what is not worth a worker (no ACs at all, pure configuration with nothing observable, a
   duplicate): `arrival <KEY> skipped "<why>"`, and say it in the pass line.
5. Fixture gaps, asked now: `references/boot-and-resume.md` §2.5, so a worker never discovers them.
6. Cap: at most `<cap>` live workers, counting every one (an ad-hoc retest included). Full:
   `arrival <KEY> held "fleet full"`; it returns as RECHECK on the next pass.
7. Collision with a live worker: the same `entity:id` with `write` on either side
   (`fleet-conductor.md` §8, runtime half: `write` conflicts with everything on the same `entity:id`)
   holds the ticket the same way. Compare against the claims ledger
   and the live briefs, not against the round plan.

## 4. Prepare and launch (the generate path with N=1)

1. Pre-flight before this launch (`references/boot-and-resume.md` §2): tokens and states fresh, the
   drift result current, the schema decision for this ticket.
2. The brief (`fleet-conductor.md` §4), with three lines this path adds:
   - the deploy-state line: the build per repository recorded in `kickoff.md`, so the worker knows which
     build it tests;
   - the recorded fixtures this ticket's cases can use (`bun run board fixtures --module <module>`), each
     with the ticket that found it; a developer-supplied fixture the conductor did not check is marked
     `UNVERIFIED`. Measured on the source board: one worker found the exact data pair another ticket
     needed, and it reached that worker only because the conductor relayed it by hand;
   - the board block (`sprint-board.md` §2) and the Run id when the worker is launched without a
     supervised dispatch.
3. `launch.txt` regenerated whole (`fleet-conductor.md` §5), the new line under an `## Arrivals`
   group; every line syntax-checked.
4. Launch natively and confirm on screen (`/agent-orchestration`, conductor cycle §2 and §3): the tab renamed to `<KEY>--<handle>` and read back with the session name, the agent footer within a short wait, credentials loaded, the prompt delivered. A harness
   error on screen is reported, not retried blindly.
5. Board: `bun run board start <KEY> --worker <handle> --by conductor` and
   `bun run board arrival <KEY> launched "<one line>"`.
6. The roster row (`fleet-conductor.md` §1) with the handle and the dispatch.
7. Sprint-record scope: a launched ticket that is not in the sprint test plan goes on
   `.session/sprint-board/staged/<test plan key>-updates.md` (one line: ticket, date, why it joined; staged
   artifacts rule `sprint-board.md` §8). The round close applies it. Measured on the source board: two
   launched arrivals were missing from the sprint test plan at close.
8. Optional: one push notification to the owner, "<KEY> reached the test environment, worker launched"
   (or "held: <why>"), when the harness offers one.

## 5. Every pass: owner, mailbox, waited-on developers, finished and silent workers, redeploys

1. Owner answers on the board: `bun run board inbox` plus the bounded `listen --since <last pass>`
   replay (`sprint-board.md` §3). Act on anything newer than the last pass, relay it to its worker
   (mailbox reply plus a terminal pointer; the worker echoes the decision back), then `resolve`. Measured
   on the source board: four owner answers sat unread 15 to 60 minutes before this read became part of
   every pass.
2. The Run mailbox: the runtime pushes a notice when messages wait; read and ack them per
   `references/boot-and-resume.md` §3 step 3, then answer each worker by replying to one of its messages.
3. A waited-on developer (optional, only when a read-only chat tool is configured for this project):
   for each open `wait` on the board, read the owner's conversation with that person for a reply since the
   wait opened. A reply: tell the owner, `unwait`. Do not write there.
4. Finished workers: `references/round-close.md`. The conductor reads back the final ticket status
   itself; a report is never the proof.
5. A live worker silent for two or three passes: read its screen (`agent-orchestration` liveness
   sweep). A harness error on screen (an access or quota message) stops a worker that cannot send
   anything; a `continue` nudge once the error clears resumes it. A worker that reports a dead tool: query
   the same resource from the conductor first. When it answers there, the worker's own tool process died,
   and the conductor can reconnect it by driving that worker's terminal
   (`/agent-orchestration` gotchas G76). When it fails there too, the resource is down and
   reconnecting the worker changes nothing.
6. A redeploy while workers are live: compare each repository's deployed build with `kickoff.md`.
   Same build: nothing. Changed with no live worker: update `kickoff.md`. Changed with at least one live
   worker:
   - fetch only (never fast-forward a sibling repository while a worker is live), then list the files that
     changed between the two builds;
   - tell EVERY live worker once (mailbox plus a terminal pointer): the repository, the old and new short
     commit, the finish time, and whether any file of its own change moved ("your change's files moved:
     re-run the affected cases" / "unchanged: carry on and name the new build in the ATR");
   - update `kickoff.md` and record the pass with `bun run board watch-pass "redeploy <repo> <old>..<new>,
     told <KEY>, <KEY>"`.

   Measured on the source fleet: the environment redeployed while four workers ran, and only one noticed,
   on its own.

Owner decisions go to the board and the chat (`sprint-board.md` §3). Setting `DEFERRED` is the worker's
QA call once a case cannot be recreated in the environment, not the pass's
(`agentic-qa-core/references/discovery-driven-doctrine.md` §5).

## 6. What a pass reports

Empty: one line, for example `watch 10:24 (recheck-sweep): 0 new, 2 recheck still held (deploy), mailbox
empty`. Otherwise a count, not a narrative (`agent-orchestration` hard rule 23): ticket, decision, reason,
who it waits on. Name the wake reason in the line, append the line to `passes.md`
(`.session/sprint-conductor/sprint-<N>/`), then re-arm the sentinel in the same turn.

## Hard rules of a pass

No git commits. Credentials by name only, never printed. Message a developer only on the owner's explicit
order. Workers do not run a bulk tracker sync; the conductor does. A dead process is reported, not
restarted from a pass (the board server's working-hours lifecycle is the sentinel's, the one exception).
