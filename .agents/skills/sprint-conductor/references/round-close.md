# Closing a worker and a round

> Loaded by: the conductor when a worker reports done, and when every issue of a round has closed.
> Vocabulary: a **round** is a concurrency group inside a wave (`sprint-testing/references/fleet-conductor.md`
> §1). The source this procedure was ported from called it "wave close"; here a wave is a tracker-status
> bucket, so this closes a round.

A worker's done-report is a claim about its checklist, not the checklist. On the source fleet a worker had
the whole testing skill in context and still skipped two checklist rows: it paraphrased the checklist into
a subagent briefing, the paraphrase dropped the quiet, conditional rows, and it accepted the subagent's
report as proof. The conductor does not supervise the worker; it checks the half of the checklist that
leaves a trace it can read without asking anyone.

---

## 1. The conductor reads back the final status itself

The rule and its measurement are in `sprint-testing/references/fleet-conductor.md` §10 "Sprint-altitude
record stays with the conductor" (the report is a claim; Critical Rule #16). The procedure here: read the
ticket's tracker status from this session, with a bounded poll for the value the worker reported
(`[ISSUE_TRACKER_TOOL]`, the synced copy refreshed with `bun run jira:sync-issues get <KEY>`). When the
poll ends without that value, the worker's transition did not land: say so, and re-run the transition only
after the round-close subagent confirms the gate below.

## 2. The round-close subagent (one per finished worker)

Dispatch ONE subagent with the 7-component briefing (`agentic-qa-core/references/briefing-template.md`).
It works sequentially and returns a count table. Component 7 carries: credentials by name only, no
tracker write outside the steps below, no message to any developer, stop on the first failed write and
report its output, and the Epic it may publish to in Step 2 is the one the conductor named, with no other
close of that Epic running.

Closes that touch the same Epic run one after another. Two workers of one Epic that finish in the same
pass get their round-close subagents in sequence: the second is dispatched only after the first returned,
so it reads the `## Module Context (QA)` section the first one published. Closes of different Epics may
run side by side. This is how "one writer per module" (`fleet-conductor.md` §10 "Module learnings")
holds when several closes are due at once.

### Step 1: verify the artifacts, not the report

| Checklist row | What can be observed, cheaply |
|---|---|
| every TC executed or deferred with its reason | each Test's status in the TMS; every `DEFERRED` carries its reason line (`agentic-qa-core/references/discovery-driven-doctrine.md` §5); the board's `tc` records agree (`bun run board status`) |
| the ATR complete | the Test Execution item and its Test Environment, per the Reporting DoD (`agentic-qa-core/references/stage-gates.md`) |
| traceability complete | the link graph Story ↔ ATP ↔ ATS ↔ TC ↔ ATR in the direction the doctrine fixes (`agentic-qa-core/references/traceability-linking.md`), read with `[TMS_TOOL]` / `[ISSUE_TRACKER_TOOL]` |
| evidence captured | the ticket's evidence folder on disk, and its evidence page recorded on the board (`sprint-board.md` §6) |
| every bug filed carries its evidence | its evidence page linked AND its ONE thumbnail embedded in the Description (`evidence-artifact/references/workflow.md` §4); a board `bug` record without `--evidence-embedded` is a bug still missing its image |
| module learnings staged | a `## Module Learnings (candidate)` heading in the worker's `test-session-memory.md`; absent on a ticket that clearly touched module behaviour is a flag, not proof of nothing |
| the brief's flags acted on | every flag the conductor put in the brief (an `UNVERIFIED` fixture, a schema skip, a drift warning) is mentioned in the ATR where it changed the result |

A row that fails is reported with its evidence and left unfixed by the subagent: the conductor asks the
worker (mailbox) or, if the worker is closed, decides with the owner.

### Step 2: module learnings, published once per module

In a fleet the worker does not write its Epic's `## Module Context (QA)` section; it stages candidates under
`## Module Learnings (candidate)` in its own `test-session-memory.md` (`fleet-conductor.md` §3). Merge them
into the Epic once per module touched, per `fleet-conductor.md` §10 "Module learnings" (read the section
live, deduplicate, keep every line that exists only in the Epic, publish that section only, re-sync and
read it back). Only one close of an Epic runs at a time (§2 above), so the live read always sees the
previous close's publish.

### Step 3: the sprint record

The conductor is the sprint record's only writer (`fleet-conductor.md` §2, §10). For the closed issue:
the sprint `progress.md` entry, the STP comment, the queue row off `PENDING`, the issue sub-scope archived
(`sprint-testing/references/sprint-orchestration.md` STEP 4). Then apply the staged
sprint-record update list (`.session/sprint-board/staged/<test plan key>-updates.md`,
`references/watch-pass.md` §4 step 7): every ticket on it joins the sprint test plan, and the list is
cleared. A pending owner answer keeps the section staged (`sprint-board.md` §8), in that folder and not a
temporary directory.

### Step 4: the board

`bun run board verdict <KEY> <PASSED|FAILED|BLOCKED> --note "<one line>" --by conductor` reconciled with
the tracker, and `bun run board worker <KEY> --state done --by conductor`.

### What it returns

```
<KEY> · status read back: <value> (poll <n>s) · TCs <passed>/<total> (<deferred> deferred, <failed> failed)
artifacts: ATR ok | missing <what> · traceability ok | <gap> · evidence page ok | missing · bugs <n>, images <n>/<n>
module learnings: merged into <Epic> | none staged | flagged
sprint record: written | staged (<why>)
board: verdict <value> · worker done
```

## 3. Close the worker

After the subagent returns: read the worker's cost footer off its screen, then close it and, when it ran in
its own worktree, remove the worktree after the orphan audit
(`/agent-orchestration`, conductor cycle §6). Release its claims (`fleet-conductor.md` §8).
Keep a worker open while its artifacts fail Step 1, until it answers.

## 4. The round is complete

When every issue of the round is closed, the status screen says "round <n> complete" with its count table,
and the next round forms (`fleet-conductor.md` §6). Anything that needs a developer or product answer goes in one team-decision message per round (`sprint-board.md` §4, whose "wave" is this round).
