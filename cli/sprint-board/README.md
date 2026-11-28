# Sprint Board

A live, local dashboard for a sprint-testing run with one conductor and several workers. One page
shows where every ticket is, what needs the QA owner, the sprint's metrics, the Slack drafts the
owner sends to each developer, the timeline and the evidence. The tracker stays the system of
record; the board is a faster read of it.

Configured by the `board:` block of `.agents/project.yaml` (ADR-0019, checked by `bun run
board:check`); the store, the Merge Line collector and the snapshot allowlists are ADR-0023. The
conductor's side lives in `.agents/skills/sprint-testing/references/sprint-board.md`.

## How it gets its data

```
the tracker (read-only `sync`)      -> source.json      statuses and buckets, titles, devs, TCs, linked bugs
each worker's own files             -> read in place    ## Live Progress, evidence/ images
this CLI (conductor, owner, worker) -> events.ndjson    verdicts, questions, holds, waits, drafts
                     fold() -> lanes, metrics, next steps -> the page
```

`sync` reads through `cli/lib/sprint-source/`: `jira-xray`, `jira-native` or `none` (a
`tickets.yaml` the owner edits), as `board.source` says. Every gate on the page reads the status
**bucket** from `board.statuses` (`not_ready`, `in_test`, `tested`, `blocked`, `dropped`; bugs
`open`, `fixed`, `resolved`, `discarded`), never the status text, so a tracker with other status
names counts the same. A status no bucket lists fails the sync and the last good `source.json`
stays.

Workers do not have to change anything for the board to move: the tracker sync and their Live
Progress lines are enough. The CLI adds what the tracker does not hold.

Data lives in `.session/sprint-board/` (gitignored, resolved through
`git rev-parse --git-common-dir`, so a worktree writes to the main checkout). A worker's Live
Progress is read from `.session/sprint-testing/[sprint-<n>/]<KEY>/test-session-memory.md`, its
images from the ticket's `.context/PBI/epics/<epic>/stories/STORY-<KEY>-<slug>/evidence/`.

## Try it with the demo sprint

`cli/sprint-board/demo/` holds an invented shop on the `none` source (its own `project.yaml` and
`tickets.yaml`), so the board renders with no tracker and without touching this checkout's data:

```bash
export SPRINT_BOARD_DIR="$PWD/.session/sprint-board-demo" SPRINT_BOARD_PROJECT_YAML=cli/sprint-board/demo/project.yaml
bun run board new --sprint 7 --started 2026-01-12T09:00:00Z
bun run board sync --discover          # the demo QA's tickets join the board
bun run board serve --open             # http://127.0.0.1:4477
```

The page's Tour button runs a scripted demo sprint in the browser with no data at all.

## Commands

Shortcuts in `package.json`: `bun run board:up` (serve, open the browser, `sync --discover` every 10 min)
and `bun run board <command>` for everything below. Ticket ids follow `board.ticket_key_pattern`
(`PROJ-7123` below).

```
B() { bun cli/sprint-board/index.ts "$@"; }   # a function, not B="...": zsh does not word-split $B

# sprint lifecycle
$B new --sprint 23 [--started <iso>] [--stp <key>] [--goal "..."] [--qa "<name>"] [--env <env>]
                                            start a board, make it CURRENT. People come from board.people,
                                            the env from testing.default_env, the QA from the person with role qa
                                            (--reuse on an existing board only makes it CURRENT, rewrites nothing)
$B sync [--discover] [--ticket PROJ-1,PROJ-2] [--lock-wait <s>] [--source none --tickets <file>]
                                            read the tracker; --discover adds every sprint row whose QA owner is the
                                            board's QA. --source/--tickets read another source for one run.
                                            Refused on a closed board; one sync at a time (source.json.lock): a CLI sync
                                            waits up to --lock-wait seconds (default 240) for the server's sync to end
$B serve [--open] [--port 4477] [--sync-every 10] [--discover] [--merge-every 90]   live page at http://127.0.0.1:4477; one server shows
                                            every board, ?sprint=sprint-22 views a past one, and the page writes to the
                                            board it shows. --discover makes each periodic sync a sync --discover
$B status                                   lanes in the terminal
$B snapshot [--mode full|share|report] [--embed-evidence] [--fragment] [--stp-url <url>]   one self-contained HTML
                                            report = the sprint QA report (see Sprint QA report); --stp-url only with it
$B archive                                  freeze archive/<slug>.html + state.json (live evidence included), then close
$B sprints | use sprint-22                  list boards / switch CURRENT

# scope and people
$B add PROJ-1,PROJ-2 [--out-of-scope]       $B remove PROJ-1 <why>
$B sprint --person "Dana Dev=Product,en,Dana;D. Dev"   name=role,lang,aliases

# what a worker (or the conductor for it) reports
$B start PROJ-7340 [--worker w-340]        running; a second start after a verdict opens attempt n+1
$B worker PROJ-7340 --stage execute         plan | execute | report | close
$B tc PROJ-7340 PROJ-7320 PASSED            DEFERRED needs --reason "QA decision <date>: <why>" (or --approval "<who>, <where>")
$B bug PROJ-7340 PROJ-7410 --title "..." --severity Medium [--evidence-embedded]   reminds you to embed a screenshot
$B evidence PROJ-7340 <image> --caption "..." [--tc PROJ-7320] [--outcome passed|failed|blocked]
$B evidence-artifact PROJ-7340 https://claude.ai/artifact/<id> --by worker|conductor|owner [--bug PROJ-7410] [--title "..."]
                                            the published evidence page of the ticket (a claude.ai artifact by
                                            default, `bun run evidence`), or with --bug of one bug; the newest per
                                            ticket or bug wins, history kept
$B fixture PROJ-7340 "store 42 has no orders in 7 days" [--module checkout]   reusable test data found
$B verdict PROJ-7340 FAILED --note "5/7, bug PROJ-7410"
$B hold PROJ-7330 --reason deploy "sync worker not on staging" [--on Tom]   / unhold
$B needs-you PROJ-7340 "Defer case b or fix AC5?" --option "a: ..." --option "b: ..."
$B needs-you PROJ-7340 "Defer TC-3?" --blocked "TC-3 cannot run" --why "the worker is not on staging"
    --option "a: wait for the deploy | cost: 1 day, Tom redeploys" --option "b: recreate on staging | cost: 20 min, one DB write restored after"
    --recommend a --decider Dana            the structured decision card (every new flag optional)

# owner side
$B answer PROJ-7340 "b, Dana approved" [--id need-x]   owner, or the conductor for them (or from the page);
                                            --id must be an unanswered question on that ticket
$B resolve PROJ-7340 [--id need-x]          close a question; --id is required when the ticket has more than one
$B wait PROJ-7390 --on Lee --what "..."     / unwait
$B ask --to Dana --ticket PROJ-7340 --kind decision --file draft.txt [--attach img]   a Slack draft for you to send
$B ask-state <ask-id> sent|answered|dropped (or from the page; dropped = no longer needed, kept on record)
$B accept-risk PROJ-7390 --by "Dana, Slack 10-08"   clears "shipped at risk"
$B log [PROJ-1] "text" | release "label" --at <iso> --ref <sha>
$B fixtures [--module checkout] [--json]    recorded test data, newest first, for the next seeds

# the inbox: owner <-> Claude, outside any ticket
$B say "Create board 23?" --option "Yes" --option "No" [--ticket PROJ-1] [--reply <msg-id>] [--ask]   Claude writes
$B inbox [--all]                            what the owner wrote that Claude has not answered (all open boards)
$B listen [--since <iso|id>]                one line per owner action, live; run it under Monitor.
                                            --since replays what the owner did after that point first

# test-environment watch (the sentinel wakes the conductor, the conductor runs one pass)
$B sentinel [--baseline <file>] [--every 10] [--hours 9-18] [--days 1-5] [--stop-at 18:07]
           [--recheck-every 120] [--stale-after 30] [--port 4477] [--once] [--dry-run]
                                            long-running, run as a background task: silent while nothing changes,
                                            exits 0 printing "SENTINEL WAKE <reason>" and one JSON line when the
                                            conductor must act; also starts and stops the board server (see Sentinel)
$B arrivals [--sync] [--lock-wait <s>] [--json]   tickets that reached the test environment (bucket in_test) and
                                            still need a conductor decision, plus UNTRACKED sprint tickets in test that
                                            are not on the board
$B arrival PROJ-1 launched|held|skipped "why"   record that decision (held comes back as RECHECK every pass)
$B watch-pass ["note"]                      record a pass that did not run arrivals --sync
$B watcher register <name> --pid <n> [--match=<text>]   a background process the board flags when it stops running
$B watcher clear <name> | list              forget a retired one | each registration, running or NOT running
```

Every value from a closed set is checked (`--state`, `--stage`, statuses,
`--blocker`, `--reason` on `hold`, `--severity`, `--kind`, `--outcome`, `--module`, `--by` on
`evidence-artifact`, the evidence page URL), every
ticket must already be on the board, and a person (`--to`, `--on`, `--decider`)
must resolve to exactly one name, or the command stops and says why. A time (`--at`, `--started`,
`--closed`) is stored as ISO and an unparseable one is refused. Boolean flags (`--ask`, `--all`,
`--json`, `--sync`, `--reuse`, ...) never take the next word, so `say --ask "text"` keeps its text.
A test case id is a tracker key (`PROJ-7320`) or a file's own id (`DEMO-7101-T1`, `TC-7012`).

## Worker protocol

The board block a worker receives lives in `.agents/skills/sprint-testing/references/sprint-board.md`
§2 (its owner). Owner answers reach a worker through the conductor's mailbox relay.

If a worker never calls it, the board still moves from the tracker sync and the worker's Live
Progress file; it is just less precise in between syncs.

## Decision cards

A bare question made the owner reconstruct the decision before answering it (measured on the
board this was ported from, a full wave). `needs-you` takes five optional flags that turn the
question into a card with labelled rows: What cannot run (`--blocked`), Why (`--why`, plain
language), Options with cost (`--option`, repeatable), QA recommends (`--recommend`) and Who
decides (`--decider`).

An option reads `"<key>: <action> | cost: <time, risk, who acts>"`. The key is up to three
letters or digits; an option without one takes its position letter (a, b, c). `| cost:` is
optional, but when present it must carry text. `--recommend` must name one of the keys, and
`--decider` resolves against the sprint's people like `--to` and `--on`; anything else stops the
command. The recommended option is marked on the card, and its pick button fills `key: action`
into the answer box. A need recorded without any of these flags renders as a plain question,
exactly as before. The two needs the board raises itself (a DEFERRED case with no reason, a
worker that stopped without a verdict) carry a plain Why.

## Automated outcomes

The board reads `reports/test-outcomes.json` from the main checkout (written by `tests/KataReporter.ts`,
schema `test-outcomes/1.0`, ADR-0020) each time it builds the page, and the page refreshes when the
file changes. In the ticket drawer's Test cases table, a TC that an automated record names (its `@atc`
id in `atcIds`) gets an `automated` chip and the run's status BESIDE its own status pill, with one line
under the heading naming the run's time and environment. Several records naming one TC show the worst
of them (FAILED, then a not-run reason, then PASSED).

The chip never changes anything else: the TC's own status, the lanes, "shipped at risk", the metrics,
the report counts and the Copy-for-Slack tables stay what the tracker and the board say. It is shown
only for a run in the board's environment (`new --env`, from `testing.default_env`), never on a closed
board, and never in a share or report snapshot. A file with another schema, a record the board cannot
read or invalid JSON is ignored with one warning line on the page.

## Evidence panel

`evidence --tc <tc> --outcome passed|failed|blocked` ties an image to a test case and says what
it shows. The ticket drawer splits images into Passed and Failed / blocked (a third "No outcome
recorded" group holds the rest), and groups each split by TC with untied images last. Every image
shows its file name with its caption. An image given `--tc` but no `--outcome` takes the outcome of
that TC's status. Images found only in the ticket's `evidence/` folder appear untied, with their file
name. A second `evidence` on the same image refines it: a flag left out keeps its old value. The
share snapshot still carries no evidence.

**The Evidence view** is one accordion per ticket, closed by default, and inside it one accordion
per test case (TC order) plus "Not tied to a TC" last. Each header carries the counts: the ticket's
lane, images per outcome, how many TCs and images, and the ticket's evidence page link; a TC header
carries its tracker status. Thumbnails render only once a case is opened, so the page stays short and
loads no image the owner did not ask for. The toolbar filters by ticket, by what the image shows
(passed, failed, blocked, no outcome) and to tickets with a defect (a linked bug, a failed image or
the Failed lane), and has Expand all / Collapse all. Which accordions are open survives the live
refresh but not a page reload.

## Evidence pages

At Stage 3 a worker publishes the ticket's evidence page (and one per bug it filed), then records
it: `evidence-artifact <ticket> <url> --by worker`, or with `--bug <bug>` for a bug's page. The
alias `evidence-page` still works, and the log's older `evidence.page` events are still read (new
ones are written as `evidence.artifact`). The URL must be https on one of
`board.evidence.allowed_hosts`; on claude.ai only `https://claude.ai/artifact/<id>` or
`https://claude.ai/code/artifact/<uuid>` (one trailing slash is dropped; a query, a fragment, a user
name, another host or `http` stops the command). `--bug` must name a bug the Bugs view knows (linked
with `bug`, or linked to a tracked ticket in the tracker), so `bug` comes first. `--by` is required.
A second page for the same ticket or bug replaces it on the page and the command says so; the older
ones stay in the log and in the link's tooltip count.

The link shows in four places: the ticket drawer, as an "Open evidence page" button in the verdict
row (and an "Evidence" link on each bug row; a ticket with a verdict or screenshots but no page shows
a dashed "No evidence page" there instead, so a missing page never looks hidden); the ticket's header in the Evidence view; the bug's
row in the Bugs view; and both "Copy for Slack" outputs (the ticket table ends the Status cell with
`, evidence page`, linked; the bug summary ends the bug's line the same way). The screenshots stay
exactly as they are; the page is an extra link. Pages never reach the share snapshot or its timeline.

## Bugs view

Every bug of the sprint, from two sources, with what was searched printed under the counts:

1. **Linked on this board** with `bug <ticket> <bug>`, or **linked to a tracked ticket in the
   tracker**, whatever sprint the tracker files it under. `sync` reads every board-linked bug from the
   tracker (`bugKeys`); one the tracker cannot find is printed and named on the search line as not
   found, never shown as open.
2. **The sprint's own bug rows**, created inside the sprint (start to close, or now), when the
   source returns them: `sync --discover` reads them (the `none` source: every row under `bugs:` of
   `tickets.yaml`; the jira sources: `board.bug_jql`, else `board.jql` with its issuetype clause
   swapped for the bug types, printed by `board:check`). Until a discover read, or when no bug query
   can be derived, this part reads "not checked", never zero. A bug row in a status no bug bucket
   lists (or not of a bug type) is left out and never counted as open: `sync` prints it, the store
   keeps it, and the search line names it ("N Bug rows not counted").

A bug filed into another sprint (or none) and linked to nothing tracked is not found, and the
search line says so.

Each bug shows its id (linked to the tracker), title, severity (the worker's `--severity`, else the
tracker Priority), its bucket in three classes (open = `open` and `fixed`, because QA has not
retested a fixed bug; resolved = `resolved`; closed = `discarded`), developer, QA, module and
platform, the tickets it was filed against with "still blocked" when that ticket is in QA scope and
not Passed, its age in days (open: to now; resolved or closed: to its last tracker update, since no
resolved date is read), and its evidence page. Groups: **Blocking a ticket** (open and filed against
a ticket still blocked), **Open, not blocking**, **Resolved or closed**. The four tiles at the top
filter to one group; under them the counts by severity, status class and module, and how many were
opened and resolved or closed during the sprint. The nav badge counts the blocking ones.

**Copy for Slack** on this view copies a team summary only of bugs: a header line with the counts,
then Resolved, Still blocking, Open not blocking, one line per bug with the tracker-linked id, a short
title (no `[Bug]` prefix, cut near 80 characters), severity, developer, module, the ticket it blocks
and the evidence page. Same clipboard mechanism as the ticket table (rich HTML plus a plain twin), no
quotes and no long dashes. The Metrics view's "4 · Bugs filed" adds the bugs linked on in-scope
tickets by status class and by module (a bug without a module in the tracker takes its ticket's). The
Bugs view stays off the share snapshot.

## Sprint QA report

`snapshot --mode report [--fragment] [--stp-url <url>]` writes `<slug>-report.html` (or
`<slug>-report-fragment.html`): the standard human-facing report of a sprint, for a PM or tech lead.
Same bundle, design and theme switch as the board, landing on a **Report** view; the nav carries only
Report, Tickets, Bugs and Timeline, and every other view (Now, Metrics, People, Evidence, History)
falls back to Report, a typed hash included. No Copy for Slack, no tour, no owner controls; the page
title is `<Sprint name> QA Report`. At sprint close the conductor publishes the fragment as a private
claude.ai artifact and links it from the sprint test plan
(`.agents/skills/sprint-testing/references/sprint-board.md` §1).

The Report view, summary before detail: a header (sprint, dates, env, a verdict sentence), four KPI
tiles with a good / watch / action-needed stripe (Tickets signed off, Pass rate, Execution coverage,
Bugs filed), three panels (the burn-up of tickets signed off per day against scope, Bugs by priority
split fixed vs open, Coverage by priority), the tested tickets (tracker link, priority, developer, a
case bar, result, evidence page; a ticket that was also a bug found and fixed in the sprint carries
`bug fixed`), the bugs in two groups (fixed and retested in the sprint / open, carried to the
backlog), the deferred cases, what was not tested, and a footer with the generated time and the STP
link.

`toReportState` builds the state by **allowlist**, like `toShareState`: sprint meta, the report
tickets with their TCs, the report bugs, the counted numbers (`report`), tracker links, the
already-validated evidence page URLs, the verdict / bug / release / tracker timeline lines of
report tickets and `generatedAt`. Never: drafts, the inbox, answers, waits, holds, needs, worker
names, fixtures, local paths, screenshots or captions. The write is refused when the state still
holds a draft's or an inbox message's text, a local path, or a worker name of three or more characters as a whole value (the tripwire; the allowlist is the guarantee). Every
tracker value reaches the page escaped; a link becomes an anchor only when it is https, and
`--stp-url` must be https on the tracker host (`issue_tracker.atlassian_url`) or an evidence host.

Counting rules:

- **Report ticket**: on the board, in QA scope, and its tracker Sprint is this board's sprint (a ticket
  with no tracker Sprint counts while in scope). A ticket filed under another sprint is named under the
  Tickets table, never counted.
- **Tested**: a report ticket with at least one TC or a PASSED/FAILED verdict. **Signed off**: tested and
  in the `tested` bucket.
- **Not tested** (0 TCs and no verdict): *Never reached the test environment* (bucket `not_ready`,
  `dropped` or not synced) or *Not counted* (it got to `in_test`, `blocked` or `tested` and has nothing
  on record).
- **Cases**, over tested tickets: PASSED / FAILED / DEFERRED / NOT RUN / BLOCKED. Pass rate =
  PASSED / (PASSED + FAILED); execution coverage = PASSED / all TCs.
- **Bugs**: the Bugs view's list (`sprintBugs`) minus a bug row that is itself a report ticket and
  was never linked with `bug` (sprint work under test, not a bug QA found; the page names it). Its
  priority is the tracker Priority, and the worker's `--severity` only when the tracker has none: the
  live board's Bugs and Metrics views still show the `--severity`. **Fixed in sprint** = bug bucket
  `resolved`; the rest are open.

## Fixtures (test data found)

`fixture <ticket> "<data found>"` records reusable test data, such as a store, an invoice or a date
range that holds (or lacks) exactly what a case needs, so the next worker on that module does not
search for it again. `--module` must be a module a ticket on this board carries (its tracker module
or component); without it the fixture takes its ticket's module.
`fixtures [--module m]` lists them newest first (time, ticket, module, text) and says how many
it searched; `--json` is the shape the conductor pastes into a worker's seed. The ticket drawer
shows the ticket's own fixtures and then other tickets' fixtures in the same module. The Now
view's rail shows a "Test data found" list, narrowed to the module of the ticket open in the
drawer. Fixtures stay off the share snapshot.

## The inbox (Claude <-> owner)

The Now view's right rail opens with a "Claude <-> you" panel. Claude posts questions with
`say` (with `--option` they render as buttons) and replies with `say --reply <msg-id>`; the owner
types in the box or clicks an option, which the page sends as `POST /api/msg`. Each thread is
`needs-owner` (Claude asked, no answer yet: it also appears first in "Your next steps"),
`needs-claude` (the owner wrote last) or `done` (Claude answered without asking anything).

Messages are `msg` events in the same `events.ndjson`, so nothing is lost when no session is
listening: `inbox` lists what is still owed. `listen` is the live path, one stdout line per owner
action (`msg`, `need.answer`, `ask.state`), meant for the Monitor tool. Inbox messages never reach
the share snapshot.

`listen` starts at the end of the log, so an answer the owner gave while no listener ran (Monitor
expired, session resumed) would never print. Re-arm it with `listen --since <point>` and it first
replays every owner action after that point, then streams live as usual. The point is an ISO time
(local unless it carries `Z` or an offset) or an id: a message (`msg-...`), a need, a draft or an
event id, which resolves to that event's time. The replay ends with one line saying how many
actions it found and how many events it searched; an id that matches nothing on any open board
stops the command (measured on the source board: an owner answer given one minute before `listen`
was re-armed surfaced only because the owner mentioned it in chat).

## Test-environment watch

`arrivals --sync` refreshes the tracker (`sync --discover`) and lists every ticket on the board in the
`in_test` bucket that nobody has dealt with yet. An arrival is a move INTO the bucket from another
one: a move between two statuses of the bucket (Ready for QA -> In Test after a launch) is not new.
Dealt with = a worker started, a verdict
landed, or `arrival launched|skipped`. `arrival held` (or a `hold`) keeps it coming back as
`RECHECK` on every pass, so a ticket waiting on a deploy is re-examined without anyone
remembering it. A later tracker move back into `in_test` (a fix for a retest) makes a tested ticket
`NEW` again. Every run prints how many tickets it searched and how many sit in test, so
"0 new" is never ambiguous. The conductor runs it on each sentinel wake (below); the triage it
does with each arrival lives in the conductor's doctrine, not here.

The same `--discover` read also lists the sprint's tickets in test that are NOT on the board (QA
owner blank or another QA). `arrivals` prints them as
`UNTRACKED PROJ-n <status> QA:<name|blank> <title>`, after a line with the denominator ("2 of 41
sprint rows"); no extra tracker call is made. Without any `--discover` on the board it says "not
checked" instead of "0". A sprint row in a status `board.statuses` does not list is printed as
`UNCLASSIFIED PROJ-n <status>` (add the status to a bucket) and never counted in test; the discover
read does not fail for it. Each run filters that list again against the board as it is now, so a
ticket `add`ed after the discover drops out (the count line says how many). Why the list exists:
`.agents/skills/sprint-testing/references/sprint-board.md` §Sentinel.

`board:up` syncs at start and holds `source.json.lock`; a pass launched right after it used to fail
with "another sync is running" (measured on the source board). `sync` and `arrivals --sync` now wait
for the lock (default 240 s, polling every 2 s, one "waiting" line), and fail only when it is still
held. The first sync of the morning can hold it for over two minutes, which is why the default is not
120 s (`SOURCE_LOCK_WAIT_MS` in `store.ts`). The server's own periodic sync never waits: it skips that
tick.

**Watch liveness.** Every `arrivals --sync` and every quiet `sentinel` cycle append one small
`watch.pass` event (the counts found); a pass that did not go through either records itself with
`watch-pass`. The page topbar
then shows "Last watch pass HH:MM" in local time, and `status` prints the same line. It turns red
when no pass ran in the last 25 minutes of working hours (Mon-Fri, 09:00-18:00 local); the clock
starts at the later of the newest pass and today's 09:00, so last night's pass does not go red at
09:01. Outside working hours it stays neutral, and a board where no pass ever ran shows nothing.
Passes stay off the timeline. Measured on the source board: a scheduled pass was still listed after
an overnight process exit, yet no pass ran for hours and nothing told the owner.

## Sentinel

`sentinel` replaces the conductor's every-10-minutes model pass with a process that costs no tokens
while nothing happens. The conductor starts it as a background Bash task; the harness tells the
conductor when it exits, and its stdout is the reason. Why, and what the conductor does on each
reason: `.agents/skills/sprint-testing/references/sprint-board.md` §Sentinel.

Every `--every` minutes on the wall-clock grid (:00, :10, ...) inside `--hours` on `--days` (local
time), it reads `source.json` and `events.ndjson` (never the tracker) and builds a signature: the
arrivals list (NEW and RECHECK, by ticket), the UNTRACKED tickets (filtered against the board as
`arrivals` does), the newest owner answer (`need.answer` or an inbox `msg` by the owner) and every
open needs-you a worker raised that nobody answered. It wakes only on an ADDITION against its
baseline: an item that left the list was dealt with, and a NEW that became RECHECK is the conductor's
own hold; a ticket that turns NEW again does wake. A quiet cycle appends one `watch.pass` event
(`by: sentinel`), which keeps the "Last watch pass" chip green; a red chip means the sentinel died.

| Wake line | When | JSON details |
|---|---|---|
| `SENTINEL WAKE change (<parts>)` | an addition; parts: `arrivals`, `untracked`, `owner-answer`, `worker-need` | `parts`, `arrivals`, `untracked`, `ownerAnswer`, `workerNeeds` (only the new items) |
| `SENTINEL WAKE recheck-sweep` | `--recheck-every` minutes since the last wake while a RECHECK or held ticket exists (its blocker may be gone) | `recheck`, `held`, `minutesSinceLastWake` |
| `SENTINEL WAKE sync-stale` | `source.json` older than `--stale-after` minutes in hours, counted from the latest of its sync, the start of hours and a server start; once per stale `syncedAt` | `syncedAt`, `ageMin`, `staleAfterMin`, `boardPids` |
| `SENTINEL WAKE board-down` | two server starts in a row did not listen within 30 s | `port`, `attempts`, `log` |
| `SENTINEL WAKE sentinel-error` | three cycles in a row failed (each failure is logged to stderr and retried next cycle) | `failures`, `message` |

Every JSON line also carries `reason`, `at`, `slug` and `rearm` (the command to start it again).

**Baseline.** Without `--baseline` it compares against what it saw at start. With
`--baseline <file>` (convention: `.session/sprint-board/sprints/<slug>/sentinel-baseline.json`) it
saves the signature, the sweep clock, the last stale `syncedAt`, the day it last stopped the board and
when it last started it there after every change, and a
restart loads it, so a re-arm after a wake does not wake again for the same item, and anything that
arrived while the conductor was busy still wakes it. A file of another board is refused.

**Board lifecycle.** Inside hours, if nothing listens on `--port`, it starts `bun run board:up`
detached (output to `.session/sprint-board/board-server.log`) and carries on without
waking. On a working day, on the first tick in `[--stop-at, --stop-at + --every)`, it stops only the
board server listening on the port (a listener whose command line is not `cli/sprint-board/index.ts
serve` is logged and left running), then sleeps through the night without waking. `--stop-at` inside
`--hours` is refused. `--dry-run` prints those two actions to stderr instead and writes no
`watch.pass`; the baseline file is still written.

**`--once`** evaluates once, read-only (no lifecycle, no heartbeat, no baseline write), and prints
the signature as JSON, plus `wouldWake` and `additions` when `--baseline` names an existing file.

It does not poll the orchestration mailbox (the orchestrator already pushes new messages to the
conductor), never writes the tracker and never launches a worker. The board server's sync must run
with `--discover` (as `board:up` does) for the UNTRACKED part to move between passes.

## Watchers (a background process that died)

The "Last watch pass" chip needs a quiet stretch before it turns red. A registered process is checked
directly: the live page's topbar shows "<name> not running" in red, and `status` prints
`! <name> not running (pid <n>, exited cleanly HH:MM)`, or `no clean exit` in place of the time after a
crash or a kill.

A registration is `sprints/<slug>/watchers/<name>.json`: name, pid, start time, the optional match
text and, after a clean exit, `exitedAt`. `sentinel` registers itself as `sentinel` and marks its exit
before it prints the wake; `--once` and `--dry-run` register nothing. Any other long-running process
is registered with `watcher register <name> --pid <n>`, for instance a waiter on an inbox. A name is
lower case: a letter first, then letters, digits or hyphens, 31 characters at most. Registering a
name again replaces the record, and only the process on record can mark its own exit. A file whose
fields have other types than these is not a registration and is ignored.

Write the match text as `--match=<text>` when it starts with `--`. A bare `--match`, or one followed by
another `--` word, is refused.

A process counts as running when its pid answers, `ps` does not report it as a zombie and, with
`--match`, its command line contains that text, so a recycled pid is not taken for the watcher. Where
`ps` cannot be used, the pid answering is the whole check.

| State | Flagged |
|---|---|
| running | no |
| stopped with no exit mark (crash, kill) | at once |
| clean exit | after `WATCHER_GRACE_MIN` minutes (`model.ts`), the time to start it again |
| stopped, with an exit time that cannot be read or lies in the future | at once |
| cleared, or never registered | no |

There is no working-hours condition: a watcher retired on purpose is removed with
`watcher clear <name>`. The server rechecks the processes every few seconds and refreshes the page; a
watchers folder it cannot read becomes a warning on the page.
Only the live page of an open board carries watchers; snapshots (full, share, report) and archives
do not.

## Bug evidence reminder

`bug <ticket> <bug>` records the link, then looks in the evidence folder of both tickets (their PBI
story folders). If it holds images, it prints one reminder line to embed the bug's thumbnail (rendered
by the `evidence-artifact` skill, `bun run evidence build --thumb`) in the bug's Description with
`bun run evidence attach` (`evidence-artifact/references/workflow.md` §4). It is a reminder, never an
error: the link is already saved. Pass `--evidence-embedded` once the image is in the Description (the
`attach` read-back passed), and the line goes away. Measured on the source board: three
conductor-filed bugs went out with no image.

## Layout

**Left nav**: each view has an icon and a number key (1-8). `Ctrl+B` / `Cmd+B` or the button beside
the title collapses it to an icon rail (the label shows as a tooltip on hover and keyboard focus);
the choice is saved per browser under `sprint-board-nav`. At phone width the nav is an overlay
opened from the menu button in the topbar (or the same shortcut) and closed with Esc, the scrim or a
view pick.

**Brand**: the header shows `board.brand.logo` (an SVG is inlined so both themes can color it, a PNG
as an image) or, with no logo, `board.brand.name` (default `project.project_name`) as text; the rail
shows the logo's mark or the name's first letter.

**Ticket panel**: drag its left edge to resize it (420 px to 95% of the window), or focus the edge
and use the arrow keys (Shift for bigger steps, Home and End for the limits); double-click or Enter
resets it to 560 px. The width is saved per browser under `sprint-board-drawer-w`. At phone width
the panel is full width and the edge is hidden.

Every saved choice is read and written inside try/catch: blocked storage only means the default.

## Theme

The topbar's Auto / Light / Dark switch sets `data-theme` on `<html>` (Auto removes it and follows
the OS). The choice is saved per browser under `sprint-board-theme` and applied by a tiny inline
script in `index.html` before first paint; snapshots carry the same switch and fall back to Auto
when storage is blocked. Light is tuned for a bright room: near-black ink, signal colors dark
enough to read as text on their tints.

## Lanes

Computed, never written (`laneOf` in `model.ts`, tests in `model.test.ts`):

| Order | Lane | When |
|---|---|---|
| 1 | Needs you | an unanswered question, a DEFERRED with no recorded reason, or a worker that stopped without a verdict |
| 2 | Running | the worker is running (a retest outranks old failures) |
| 3 | Failed | verdict FAILED or any TC FAILED |
| 4 | Passed | verdict PASSED, or the tracker in the `tested` bucket with every case PASSED/DEFERRED |
| tray | Held | waiting on a deploy, data or access, or a TC BLOCKED |
| tray | Up next | not started |

"Shipped at risk": the tracker has the ticket in the `tested` bucket while a case is FAILED, NOT
RUN or BLOCKED, and nobody ran `accept-risk`.

## Merge Line

`#merge` (key `9`) shows every pull request headed for the mainline (`git_strategy.branches.production`)
or a trunk: a bottom line, four tiles (Needs you, Waiting on others, Blocked, Ready to merge), lanes of
PR cards with three signal dots (checks, review, approval), the interlocking strip, a drawer per PR
(signals, owning session, tracker parity, interference, size) and a rail with the suggested order, the
pairs of PRs that touch the same files, and what merged into the mainline today. It is repo-wide, so
it renders with or without a sprint board. GitHub only.

`serve` runs the collector (`cli/sprint-board/merge-collect.ts`, built by the pure `merge-build.ts`)
every `--merge-every` seconds (default 90, `0` turns it off), one run at a time, and records the
loop's status in `.session/gitflow-master/collector.json`; the page reads it through `/api/merge` and
re-renders on the same SSE `changed`. The collector is plain code, so the view costs no model tokens.
The view's freshness pill reads from that status: `GitHub read 40s ago`, `late`, or `Not updating`
with the collector's last line and the command to fix it. Lane, order and freshness rules are
`merge.ts` (pure, tested in `merge.test.ts`); their doctrine is
`.agents/skills/git-flow-master/references/observer.md`. Snapshots (full, share, report) never carry
the view: it is live only, and the share and report copies route `#merge` back to their landing view.

Tracker parity reads the board's own last tracker read (no tracker call every 90 s): a ticket named in
an open PR's branch or title into the mainline is out of step when its bucket is `tested` or
`dropped` (code still landing on a ticket QA closed). A ticket only mentioned in the description is
listed without an expectation.

## Files

`model.ts` pure fold, lanes, metrics, share and report allowlists, Slack table ·
`sentinel.ts` the sentinel's pure decisions · `sentinel-run.ts` its loop, port probe and server lifecycle ·
`watchers.ts` registered background processes and their pid check ·
`store.ts` files and the event log · `sources.ts` Live Progress + evidence + the automated outcomes file ·
`sync.ts` the tracker read through `cli/lib/sprint-source/` · `server.ts` local server + SSE ·
`build.ts` page bundle · `brand.ts` the header's brand slot · `snapshot.ts` frozen HTML ·
`merge.ts` Merge Line lanes, order and freshness (pure) · `merge-read.ts` reads the collector's
documents · `merge-collect.ts` + `merge-build.ts` the collector · `app/` the page (views,
merge-view, charts, tour, demo, i18n) · `demo/` the demo sprint · `fixtures/` recorded readings.

`model.ts`, `merge.ts` and `app/` are bundled for the browser: they import only pure modules
(`cli/lib/sprint-source/types.ts`, `cli/lib/evidence-page/statuses.ts`), never a file that touches
`node:*` (`build.test.ts` fails on one).

Tests: `bun test cli/sprint-board` (`views.test.ts` renders the views to a string; `automated.test.ts` covers the automated chip).
