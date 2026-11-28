# Sprint Board in a conductor run

> Loaded by the conductor of a sprint-wide fleet run (`fleet-conductor.md`). A worker does not load it:
> it gets one block in its brief (§2) and nothing else. A single-ticket `/sprint-testing` run loads
> none of this.

The Sprint Board (`cli/sprint-board/`, live page at `http://127.0.0.1:4477`) is the owner's surface
for a sprint run: what needs the owner, what runs, what failed, passed or is held, the messages the
owner sends and the Decision dock, metrics and evidence. The tracker stays the system of record. The
board reads it through `cli/lib/sprint-source/` (`sync` is read-only) and adds what the tracker does
not hold: questions, holds, waits, asks, dock items and the inbox between the owner and Claude. Its
vocabulary is the `board:` block of
`.agents/project.yaml` (statuses in buckets, people, evidence hosts, brand), checked by
`bun run board:check`. Data lives in `.session/sprint-board/` (gitignored, resolved through the git
common dir, so a worktree writes to the main checkout). Command reference: `cli/sprint-board/README.md`,
or `bun run board help`.

The same server also shows Merge Line (`#merge`, key `9`): every pull request headed for the
mainline or a trunk, fed by the collector every 90 s at zero tokens. It is repo-wide, not part of a
sprint. The conductor reads it before a sync gate or a release PR and does not write it. Its doctrine
is `git-flow-master/references/observer.md`.

All commands below are `bun run board <command>`. Every closed-set value is validated and every
ticket must already be on the board, or the command stops and says why. Pass `--id <need-id>` to
`answer` and `resolve` every time: without it `resolve` refuses when the ticket has more than one
open question. A command that records what someone said or decided requires `--by`, and no command
signs as `owner`, which only the page does (`cli/sprint-board/README.md` §Authors). An answer on the
board proves it did not come through the CLI, not who typed it: a process on the same machine can
still call the page's routes or edit the log.

---

## 1. The board at every stage

| Stage | Command | Who |
|---|---|---|
| 0 boot | `sprints` (which boards exist, `*` = CURRENT). New sprint: `new --sprint <n> --started <iso> --stp <test plan key> --goal "<goal>"`. Existing: `use sprint-<n>` | conductor |
| 0 boot | people come from `board.people`; add anyone else with `sprint --person "<Full Name>=<role>,<lang>,<alias>;<alias>"` | conductor |
| 0 boot | `sync --discover` (adds every sprint row whose QA owner is the board's QA), then `add <KEY>` for anything assigned after the sync and `sync --ticket <KEY>` | conductor |
| 0 boot | `bun run board:up` (serve, open the browser, `sync --discover` every 10 min). One server serves every board; keep the previous sprint's board open until its carryovers close. Once the sentinel is armed it starts the server each working morning and stops it in the evening | conductor |
| 1 triage | `hold <KEY> --reason deploy\|no-data\|no-access\|no-permission\|defect\|other --on <person> "<what>"`; `needs-you <KEY> "<question>" --by conductor` with the decision-card flags (§5) for anything only the owner decides; `fixtures --module <m>` when seeding (§6); `wait <KEY> --on <person> --what "<what>"` | conductor |
| 2-3 launch | `start <KEY> --worker <terminal handle> --by conductor` right after the worker's terminal opens; `arrival <KEY> launched\|held\|skipped "<why>" --by conductor` for a test-environment watch decision | conductor |
| 3 run | `tc`, `bug`, `needs-you`, `evidence`, `fixture`, `verdict`, `worker <KEY> --stage plan\|execute\|report\|close`, all `--by worker`; at Stage 3 `evidence-artifact <KEY> <url> [--bug <BUG>]` right after publishing the evidence page (§6) | worker (§2) |
| 3 run | `evidence-artifact <KEY> <url> [--bug <BUG>] --by conductor` when the worker could not publish or record it (§6) | conductor |
| 3 run | `inbox` (what the owner wrote that Claude owes), `listen --since <last id seen>` under Monitor (§3), `say`, `say --reply <msg-id>`, `answer <KEY> "<text>" --id <need-id> --by conductor`, `resolve <KEY> --id <need-id> --by conductor`, `unhold`, `unwait <KEY> --on <person> --by conductor` | conductor |
| 3 run | `ask --to <person> --ticket <KEY> --kind blocker\|bug\|decision --file <draft.txt> --by conductor` (a message the owner sends); the owner moves it on the page (sent, answered, closed, dropped). What the conductor saw itself it records with `ask-state <ask-id> <state> --by conductor --expect <current state>` (§4) | conductor, owner |
| 4 round close | `verdict ... --by conductor` reconciled with the tracker, `worker <KEY> --state done`, `snapshot --mode share` when the team should see it (allowlist copy: no asks, waits, questions, dock items, inbox or evidence); the full close of a worker and a round: `sprint-conductor/references/round-close.md` | conductor |
| sprint close | `snapshot --mode report --fragment --stp-url <test plan url>` (the sprint QA report: allowlist state, counted by bucket); publish the fragment as a private claude.ai artifact and link it from the sprint test plan; then `archive` (freezes the board) | conductor |
| any | `sentinel --baseline .session/sprint-board/sprints/<slug>/sentinel-baseline.json` as a background task, armed at session start and after every wake (§7) | conductor |
| any | the Decision dock (§3): `sweep add --question "<question>" [--ticket <KEY>] [--option "<label> \| <cost>"] [--recommend a] --by conductor` for a small decision that blocks nothing (`--option` 2 to 4 times, or none for a free-text question); `sweep read --unconsumed --json` then `sweep consume <batch or note id> --by conductor` for what the owner sent; `sweep list` and `sweep close <item-id> --why "<why>" --by conductor` | conductor |
| any | `watcher register <name> --pid <n> [--match=<text>]` for a long-running process the conductor starts besides the sentinel; `watcher clear <name>` for one it retires on purpose; `watcher list` (§7) | conductor |
| any | `arrivals [--sync] [--json]`: tickets in the `in_test` bucket still needing a conductor decision, with denominators, plus `UNTRACKED` sprint tickets in test that are not on the board; `--sync` waits for the server's sync lock; `watch-pass ["note"]` for a pass that did not sync | conductor |

The board never blocks a worker or a pass. A board command that fails is logged and ignored, and the
tracker sync plus each worker's `## Live Progress` still move the page.

---

## 2. The block in a worker's brief

A worker learns the board from its brief (`fleet-conductor.md` §4), the one sanctioned channel to it.
The board part is a single block, pasted as is with `<repo>` and `<KEY>` filled in. Every worker
command carries `--by worker`:

```
Sprint Board: the owner watches http://127.0.0.1:4477, not terminals. Run from <repo>, each with --by worker:
after each TC `bun run board tc <KEY> <TC> <PASSED|FAILED|NOT RUN|BLOCKED> --by worker` (BLOCKED or DEFERRED only after the unblock preflight, sprint-testing/references/preflight-gate.md; DEFERRED needs an external cause and --reason "QA decision <date>: <why it cannot be recreated>", per agentic-qa-core/references/discovery-driven-doctrine.md §5, and the Story moves on it only with the owner's own OK, shift-right-deferral.md §3);
on a bug filed `bun run board bug <KEY> <BUG> --title "<title>" --severity <Critical|High|Medium|Low> --evidence-embedded --by worker` (drop --evidence-embedded only if no image went into the Description);
on an owner question `bun run board needs-you <KEY> "<question>" --blocked "<what cannot run>" --why "<plain-language reason>" --option "a: <action> | cost: <time/risk/who acts>" --option "b: ..." --recommend a --decider "<person>" --by worker` (IN ADDITION to the mailbox question; leave out --decider when unsure who decides);
for each screenshot that proves a case `bun run board evidence <KEY> <image> --caption "<what it shows>" --tc <TC> --outcome passed|failed|blocked --by worker`;
at Stage 3, right after publishing the ticket's evidence page `bun run board evidence-artifact <KEY> <url> --by worker`, and after each bug's page `bun run board evidence-artifact <KEY> <url> --bug <BUG> --by worker` (the `bug` line first); when you cannot publish, say so in the mailbox and the conductor records it;
on reusable data found (a store, user or combination another ticket could use) `bun run board fixture <KEY> "<data found>" --module <module> --by worker` (the ticket's module);
at stage changes `bun run board worker <KEY> --stage plan|execute|report|close --by worker`;
at the end `bun run board verdict <KEY> <PASSED|FAILED|BLOCKED> --note "<one line>" --by worker` (PENDING is rejected: it is the board's own "no verdict yet"; an owner or developer wait is BLOCKED plus `hold --reason no-data|other --on <who>`).
Never `say`, `ask`, `ask-state`, `answer` or `sweep`: those are the conductor's and the owner's. A board error never stops the run.
```

Measured on the board this was ported from: workers wrote their events from this block alone and
none asked how to use the CLI. Keep the block to these lines, since the rest of the board is the
conductor's.

---

## 3. Four channels

```
OWNER  -- board (Needs you, inbox, dock, asks) + chat --------------+
  |                                                                  |
CONDUCTOR -- Run mailbox (record) + terminal pointer (nudge) -- WORKERS
  |                                                                  |
  +-- Slack: only on the owner's order -------------> developers      +-- board CLI (--by worker)
```

| # | Channel | Carries | Rule |
|---|---|---|---|
| 1 | Run mailbox | the worker record: status, question, escalation, done | byte-intact, the channel of record between workers and the conductor (`/agent-orchestration` channel discipline) |
| 2 | Board | the owner surface: Needs you, the inbox, the Decision dock, drafts, holds, waits | everything the owner must decide reaches the board and the chat, so the owner never has to read a terminal |
| 3 | Owner chat | answers when the owner cannot open the board | relay it, then mirror it under the conductor's name: `say --reply <msg-id> "answered by chat: <text>"` for an inbox thread, `answer <KEY> "<text>" --id <need-id> --by conductor` for a Needs-you. The mirror is not the owner's board answer: `listen` does not print it, and the question stays open on the page. A question that gates nothing is then closed with `resolve <KEY> --id <need-id> --by conductor`. A question that gates something (a deferral OK, a transition, any step the owner signs) is not resolved by an agent before the owner's own record exists, on the board (their answer on the page, which `listen` prints) or in the tracker (their own comment) |
| 4 | Slack | messages to developers | only on the owner's order. The board holds proposed messages (`ask`) and copies tables ("Copy for Slack") and sends nothing |

To relay an owner answer to a worker, send a mailbox reply (the record) plus a one-line terminal
pointer (the nudge, because mail does not reach a busy worker). The worker echoes the decision back
before acting. A worker question that only the owner can answer goes to the board as `needs-you` and
to the chat in the same pass.

The Decision dock (`cli/sprint-board/README.md` §Decision dock) lets the owner answer several things
in one send: the open needs-you cards, which need nothing extra from anyone, and the items the
conductor posts with `sweep add`. A dock item is a small decision that blocks nothing (an A or B, a
default to confirm); it moves no lane, so a question that blocks a ticket or gates a step the owner
signs is a `needs-you` card. A card answered from the dock is the owner's own board answer, recorded
like one given on the card. `sweep read --unconsumed --json` hands over the batches and the dock notes;
act on each, relay a card answer to its worker as below, then `sweep consume <id> --by conductor`
(only the conductor can, and a `say --reply` does not mark a note read).
An item whose question no longer holds is retired with `sweep close`, and posted again if something
is still to decide.

Reading the owner takes care. A bare `listen` starts at the end of the log, so an answer given while
it was not running never prints, and `inbox` lists inbox threads only, not Needs-you answers. After
the first time, arm `listen` with a starting point:

- To re-arm, run `bun run board listen --since <id>` (under Monitor), where `<id>` is the last msg,
  need, ask or event id the previous listener printed, or an ISO time. It replays every owner
  action after that point, then streams.
- On a watch pass or at session start with no listener armed, run `bun run board inbox` for inbox
  threads, plus a bounded replay for Needs-you answers, ask moves and dock sends:
  `listen --since <time of the last pass>` under a short timeout, which prints the replayed actions
  and `replayed N owner action(s) since ...` before the timeout ends it.

---

## 4. Drafts and the team-decision message

- Draft first, on the board. Draft with `ask` only when something is blocked on that person. A pass,
  a closed ticket or a thanks is not a reason to write. The `good-news` and `fyi` draft kinds exist
  for the record and are not sent unprompted.
- An ask moves through one locked writer (`cli/sprint-board/README.md` §Asks). `ask-state` needs
  `--by conductor` and refuses `--by owner`. A move recorded as `owner` came from the page, so it
  counts as the owner's word. A move the owner only mentions in chat is recorded with
  `--by conductor`, and so is a reply:
  `ask-state <ask-id> answered --reply "<their words>" --by conductor`. An ask still in `draft` cannot go
  straight to `answered`: record `sent` first, then `answered`. Pass `--expect` so a stale view is
  refused, and read a refusal before retrying, because it says who moved the ask and when.
- No messenger is configured unless the board's code provides one. Then there is nothing to approve:
  the owner copies the message, sends it and marks it sent.
- The conductor does not message a developer on its own initiative, a watch pass included.
- A precondition request and a deferral notice are Story comments, tracker writes of the stage and not team
  messages. Chat or Slack, a wired provider included, stays on the owner's order, one staged message per wave.
- The sprint progress table (the board's "Copy for Slack") is the owner's team status. It is built
  when the owner asks for it and put on the clipboard, and the conductor does not post it.
- One team-decision message per wave. Every case that genuinely needs a developer or product
  answer (an access, a credential, a behaviour decision that changes the expected result: the last
  rung of the blocking ladder in `agentic-qa-core/references/discovery-driven-doctrine.md` §5) goes
  into one message per wave, not one per ticket, staged in `.session/sprint-board/staged/` (§8) until
  the owner sends it. A QA deferral is not one of them: QA takes it on its own once the unblock preflight
  (`preflight-gate.md`) finds the case cannot be recreated in the test environment for an external cause.
  The Story's move on a deferral still needs the owner's OK (`shift-right-deferral.md` §3). When the answer is to defer and the case's preflight record says
  `DEFER`, record it with `tc <KEY> <TC> DEFERRED --approval "<who>, <where>" --by conductor`; a deferral QA took on its
  own is recorded with `--reason "QA decision <date>: <external cause>"` and `--by` instead. Neither is the Story's deferral OK.

---

## 5. Decision cards: what a Needs-you must carry

The owner decides from the card, without asking back. `needs-you` takes optional flags, and the page
renders a structured card when they are present. Each `--option` needs a distinct `<key>: ` prefix,
`--recommend` must match one of those keys, and `--decider` must be a person on the board (full name,
first name or alias; an unknown name is refused with the list):

```bash
bun run board needs-you <KEY> "<the question>" \
  --blocked "<what cannot run: TC ids and the part of the AC they cover>" \
  --why "<plain-language reason, with the real data fact>" \
  --option "a: <action> | cost: <time/risk/who acts>" \
  --option "b: <action> | cost: <time/risk/who acts>" \
  --recommend a --decider "<person who must answer>" --by conductor
```

The conductor enriches a worker's card before the owner sees it. A card missing `--blocked`,
`--why`, a cost on every option, `--recommend` or `--decider` is terse, and the conductor:

1. Takes the missing facts from the worker and not from its own investigation: the worker's mailbox
   question, its `test-session-memory.md`, or a mailbox reply asking for them. The conductor itself
   adds only `--decider` (who in the team owns the call) and the cost of the options in time and
   who acts.
2. Posts the full card with `--by conductor`, then closes the terse one with
   `resolve <KEY> --id <need-id> "superseded by the enriched card" --by conductor`.
3. Says the same thing in chat (§3). A card whose decider is a developer or product, not the owner,
   also goes into the wave's team-decision message (§4).

---

## 6. Evidence, evidence pages, bugs and fixtures

- Evidence: `evidence <KEY> <image> --caption "..." --tc <TC> --outcome passed|failed|blocked`.
  The evidence panel shows every image's file name, groups by test case and splits passed from
  failed or blocked. An image without `--tc` lands ungrouped; the wave close checks the panel and asks
  the worker for the missing ids rather than guessing them.
- Evidence pages: at Stage 3 each worker publishes its ticket's evidence page (and one per bug it
  filed) and records it with `evidence-artifact <KEY> <url> [--bug <BUG>] --by worker` (§2). The host
  must be in `board.evidence.allowed_hosts` (a claude.ai artifact by default). When a worker could not
  publish or record it, the conductor builds the page from the worker's evidence pack, publishes it
  and records it with `--by conductor`. At wave close it checks that every tested ticket and every bug
  filed has one. The newest page per ticket or bug wins and shows in the ticket drawer, the Evidence
  view, the Bugs view and both "Copy for Slack" outputs.
- Verify the artifacts, not the report (wave close): any bug filed has its evidence page linked
  AND its ONE thumbnail embedded in the Description per `evidence-artifact/references/workflow.md` §4
  (`bun run evidence attach`, read back; where the Description cannot be edited, in the `Evidence`
  comment `attach` fell back to, which the report names). Measured on the source board: three
  conductor-briefed bugs went out without it because the brief cited a plain-text precedent. Every
  bug-filing brief names that step and tells the filer to run `bug ... --evidence-embedded` once the
  image is in. A `bug` call that printed the evidence reminder without that flag is a bug still
  missing its image.
- Bugs view: every bug linked with `bug`, every bug the tracker links to a tracked ticket, and
  the sprint's own bug rows created inside the sprint (read by `sync --discover`), grouped blocking a ticket / open not blocking / resolved or closed, with the denominators printed.
  Its "Copy for Slack" follows §4 like the progress table: the owner posts it, not the conductor. Full rule: `cli/sprint-board/README.md` §Bugs view.
- Fixtures: `fixture <KEY> "<data found>" [--module <module>]` records reusable test data a
  worker found. `fixtures [--module <m>] [--json]` lists them. The conductor reads
  `fixtures --module <m>` when seeding every ticket of that module and copies the usable ones into the
  brief with the ticket that found them. A fixture goes in a brief as found data; verifying it still
  holds stays a one-query conductor check.

---

## 7. Sentinel: the trigger of every watch pass

A scheduled model pass every few minutes re-reads the whole session context, and almost every pass
finds nothing. The sentinel moves the detection into code: `bun run board sentinel`
(`cli/sprint-board/README.md` §Sentinel) costs no tokens while quiet and ends, waking the conductor,
only when there is something to do. Most changes are found on its tick inside working hours; an owner
answer (Needs-you or inbox), a Decision dock send or note, or an ask the owner moved on the page wakes
it within seconds, at any hour (`cli/sprint-board/README.md` §Sentinel).

The conductor arms it at the start of its session and again after every wake, as a background task
of the harness:

```bash
bun run board sentinel --baseline .session/sprint-board/sprints/<slug>/sentinel-baseline.json
```

The harness notifies the conductor when the process exits; its output is the wake. Background tasks
die with the session, so a resumed or handed-off conductor re-arms it
(`/agent-orchestration`, conductor cycle). Run one sentinel per board: before arming,
make sure this session has none running. The `--baseline` file is what lets a re-arm skip what the
last wake already reported while still catching what arrived during the pass.

What a pass does after a wake (guard, detect, triage with the deploy check, launch, the every-pass reads, one report line) is in `sprint-conductor/references/watch-pass.md`.

The wake's first line `SENTINEL WAKE <reason>`, then one JSON line with the details and a
`rearm` command. What each reason means and what the conductor does:

| Reason | Means | Conductor |
|---|---|---|
| `change (arrivals, untracked, owner-answer, worker-need, ask-approved, ask-sent, ask-changed, sweep-answered, dock-note, dock-recheck)` | something new against the baseline: a NEW or returning ticket in test, an UNTRACKED sprint ticket in test, a new owner answer (Needs-you or inbox), a worker's unanswered Needs-you, or an ask someone other than the conductor or the sentinel moved: marked sent and expecting a reply (`ask-sent`), any other move (`ask-changed`), or approved and not yet drafted (`ask-approved`, only with a messenger), a dock batch the owner sent (`sweep-answered`) or a dock note (`dock-note`), or an open dock item whose ticket moved to another bucket (`dock-recheck`). With `owner-answer`, an ask part, `sweep-answered` or `dock-note` it can arrive outside working hours | one pass, then re-arm. Act on the owner answer and `resolve` its need or reply in its thread (`say --reply`): a sentinel started without a saved baseline wakes again for one left open. For the ask and dock parts, follow `sprint-conductor/references/watch-pass.md` §5 |
| `recheck-sweep` | the recheck interval passed while a RECHECK or held ticket exists; its blocker (a deploy) may be gone | one pass (the deploy check on each RECHECK), then re-arm |
| `sync-stale` | `source.json` older than the stale limit in working hours: the board server's sync stalled | read `.session/sprint-board/board-server.log`, run the pass with `arrivals --sync` (it syncs itself), tell the owner in one line if the server keeps failing; re-arm |
| `board-down` | two starts of the board server in a row did not listen | report it to the owner with the log path; run the pass anyway (`arrivals --sync` needs no server); re-arm |
| `sentinel-error` | three cycles in a row failed; the JSON carries the message | fix what the message names (a missing `source.json`, a closed board), or report it; re-arm. It does not mean "nothing changed" |

Without waking anyone, it starts the board server at the start of working hours
when nothing listens on the port (detached, log in `.session/sprint-board/board-server.log`) and stops
only that process at `--stop-at` on working days (no board process overnight or on weekends). When a
wake ended it before that stop, the re-arm with the same `--baseline` file stops the board as soon as it
starts, as long as it is still the same working day; so re-arm the same day, or stop the server yourself.
It appends one `watch.pass` per quiet cycle, so the "Last watch pass" chip on the page stays green while
it lives and turns red when it dies.

It reads and writes nothing in the tracker (it reads the `source.json` the server syncs every
10 min with `--discover`), launches nothing, records no `arrival` or `hold`, sends no Slack, and does
not poll the mailbox, because the orchestrator already pushes new messages to the conductor. Every
decision stays in the pass.

To check it by hand, `bun run board sentinel --once --baseline <same file>` prints the current
signature and `wouldWake`, read-only.

On a harness without background tasks, run a scheduled pass every 30 minutes in working
hours instead, the first one of the day starting `bun run board:up` when nothing listens and a last one
stopping it. The "Last watch pass" chip turns red between such passes, because it is tuned for the
sentinel's 10-minute heartbeat.

In both modes, every `arrivals --sync` and every quiet sentinel cycle record a
`watch.pass` event, and a pass that does not sync records one with `watch-pass "<note>"`.
`bun run board status` and the page topbar show "Last watch pass HH:MM", red when none ran in the
last 25 minutes of working hours.

### Watchers: a dead process shows on the board

The sentinel registers its process on the board and marks its exit before the wake. The live page names
every registered process that stopped, and `bun run board status` prints it as
`! <name> not running` with `no clean exit` or the time it exited cleanly: at once after a crash or a
kill, after a short grace period following a clean exit, so a pass that runs long shows the sentinel
flagged until the re-arm. How the check works: `cli/sprint-board/README.md` §Watchers.

- A flagged sentinel: re-arm it. Any other flagged process: start it again and register the new pid.
- Another long-running process the conductor starts (a mailbox or inbox waiter, say) is registered
  with `watcher register <name> --pid <n> --match=<text of its command line>` (the `=` form, so a text
  that starts with `--` is accepted). It marks no exit of its own, so it is flagged as soon as it ends.
- A process retired on purpose, the sentinel included (a boot or resume without the watch, the end of
  the conductor's run), is cleared with `watcher clear <name>`. Without that the board keeps flagging it.

---

## 8. Staged artifacts live in `.session/sprint-board/staged/`

Anything written but not yet applied because it waits on an owner decision or a locked page (a test
plan section, a team-decision draft, a report) is saved in `.session/sprint-board/staged/`, with the
target and the date in its file name and a first line saying what it is for and what it waits on.
Do not use the session scratchpad for this: a temporary directory the operating system may clear on
restart loses it. Once applied, the wave close deletes the staged file or says why it stays.
