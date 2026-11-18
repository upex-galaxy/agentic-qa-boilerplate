# Boot and resume

> Loaded by: the conductor at boot Steps 3-4 (`SKILL.md` §Boot) and on `--resume`. Never by a worker.
> Parameters, never fixed values: `<N>` the sprint, `<slug>` the board (`sprint-<N>`), `<run>` the Run
> id, `<cap>` the worker cap, `<env>` the environment (`testing.default_env`).

---

## 1. Why the conductor owns the pre-flight

Every item below mutates or measures shared state that has exactly one correct value. N workers doing it
would race each other, and a worker in fleet mode reads its brief and trusts it, so a wrong sentence in
the pre-flight is wrong in every brief at once, silently. The conductor-only operations table is
`sprint-testing/references/fleet-conductor.md` §2; this file is the procedure.

---

## 2. The pre-flight (boot Step 3, and again before EVERY launch)

It runs at boot and again before every launch, a watch-pass launch included. Each item is cheap when
nothing is stale and catches what went stale since the last launch.

### 2.1 Tokens and browser states

- Mint API tokens for every role the next round needs, from this terminal, before the launch
  (`fleet-conductor.md` §7: environment named positionally, one profile per worker when isolation is
  needed). A worker never logs in.
- Token and browser-state freshness before every launch, and the API login before any browser login with
  its three-attempt stop: `fleet-conductor.md` §7 owns the rule and its measurement. The state files are
  `.auth/<env>-<role>.json` (`agentic-qa-core/references/browser-sessions.md` §4).
- When the API login fails, compare what the owner says works against the stored value by name only,
  without printing either, then ask. Three roles rejected at once looked like a reset identity store on
  the source fleet; it was one stale password plus two accounts missing from that environment.
- The paths are stable, so regenerating a state file in place keeps every brief and launch line valid.
  Seed the whole round while a login waits; only the launch waits.

### 2.2 Sibling repositories: two comparisons, and the fetch is a gate

Workers read the product's code from the repositories named in `.agents/project.yaml`
(`backend.backend_repo`, `frontend.frontend_repo`) and do not re-check whether that code is what the
environment runs. The conductor measures it once per round and writes the result into every brief.

```bash
git -C <repo> fetch origin <deployed-branch> <integration-branch>   # no --quiet: read any error
echo $?                                                              # non-zero = STOP, see below
git -C <repo> rev-list --count origin/<deployed-branch>..origin/<integration-branch>   # remote vs remote
git -C <repo> rev-list --count HEAD..origin/<deployed-branch>                          # LOCAL TREE vs deployed
git -C <repo> rev-parse --abbrev-ref HEAD                                              # which branch
```

- Remote against remote says nothing about the working tree a worker reads: both remote branches can be
  level while the local checkout sits weeks behind. On the source fleet only that comparison ran, read 0,
  and every brief called local code deployed truth while the checkouts were 41 and 27 commits behind.
- The fetch is a gate. `rev-list` does not know a fetch failed: it compares whatever the refs on disk
  point at, so a failed fetch prints the counts that mean "safe". Believe the counts only after a fetch
  that exited 0 in this session. On the source fleet a credential prompt killed the fetch, both counts
  read 0 against frozen refs, and the ticket's merge commit was not in the local object store at all.
- A failed fetch is escalated. It usually needs an interactive credential the conductor must not
  synthesize, so ask the owner, in one line, to run the fetch in a terminal where they can answer the
  prompt, and say what is blocked: no brief gets a drift statement until it passes. Where the project's CI
  exposes its deployed commit through a separately authenticated CLI, that is an independent oracle
  meanwhile: it proves the refs are stale, it does not refresh them.
- The result goes into every brief. 0 on both comparisons after a good fetch reads "local code reads as
  the deployed truth for <repo>". `HEAD..deployed > 0` means pull before seeding, or name the commit the
  workers read and tell them to check containment of a specific commit before citing a file from that repo
  (`sprint-testing/references/session-entry-points.md` Step 1c gives the containment check).
- Fast-forward a sibling only when no worker is live; with workers live, fetch only.
- A localhost fleet uses one worktree per worker per touched sibling repo and a distinct port pair per
  worker (`fleet-conductor.md` §11). In a deployed environment nothing is checked out and every worker
  shares the sibling repos read-only.

### 2.3 The API schema: sync from a current tree, or log the skip

`bun run api:sync` is conductor-only (`fleet-conductor.md` §2). A stale schema is worse than none: it
answers confidently about endpoints that moved, and never errors. On the source fleet a spec six months
old was missing about a quarter of the API.

- Sync this session when any ticket of the round needs the API schema. The sync reads the schema of
  whatever code the local backend runs, so a sync from a stale tree (§2.2 drift > 0, or an unverified
  fetch) overwrites a current schema with an older one, and the generated types are committed. Pull first,
  then sync; syncing "to be safe" from a stale tree does harm.
- The skip is legal in exactly two cases and is always logged: no ticket of the round needs the schema
  (decided at triage from the ACs, not mid-launch), or the sibling tree is stale or unverified (the skip
  is then required). The log goes into `kickoff.md` and every brief of the round: which case applied, the
  date the schema was actually last synced (read it from the sync's own config, not "fresh" or "old"), and
  the instruction that endpoint shapes come from the live API or the source this round, never from the
  schema. The worker carries it into the ATR's environment block.

### 2.4 The deployed build, the baseline every pass compares

Record, per repository, the build the environment runs (its commit and finish time) in `kickoff.md`.
Where it comes from is the deploy check's source (`session-entry-points.md` Step 1c: a version endpoint,
the CI deploy job, the hosting platform's deployment). Each watch pass compares against it
(`references/watch-pass.md` §5, item 6), and every brief's deploy-state line names it, so a worker knows which
build it tests.

### 2.5 Fixture gaps, before launch

For every ticket of the round, ask whether any case needs a user, an organization or data that does not
exist in `<env>`. Ask the owner now, on the board (`needs-you`) and in chat, before a worker finds it: on the source fleet two workers found a missing role user mid-run and
waited about four hours. Verifying a fixture a developer supplied is
conductor work, one query each; anything not verified goes into the brief marked `UNVERIFIED`.

---

## 3. The Run (boot Step 4)

1. Look for the sprint's Run id in `kickoff.md`, the roster (`fleet-conductor.md` §1) or the board
   timeline. Found: re-bind to it (`/agent-orchestration`, conductor cycle §8). None: create
   it with the sprint as its objective, and write its id into `kickoff.md` and the roster.
2. Probe the reply direction once, before any worker depends on it: one `send` with a throwaway
   subject and one `check` that returns it. A conductor that was itself started by a dispatch can READ its
   fleet's mailbox and still be refused when it WRITES to it, because a dispatch scopes a terminal's sends
   to its own Run (`/agent-orchestration` gotchas G74). If the probe fails: say so in every brief
   (answers arrive through the brief file and a terminal pointer), or ask an unbound session to post into
   the Run.
3. Mailbox reads follow `agent-orchestration`: end the turn and let Orca wake the conductor, handle each
   `check` batch whole (no ack), and the coordinator's own read without a terminal selector, checking the call's `ok` before reading anything
   (`/agent-orchestration` gotchas G75).

---

## 4. Resume after a reboot or a session resume (`--resume`)

A reboot kills the board server, the agent sessions, the sentinel and any listener. The orchestrator
reopens the worker terminals and their sessions resume, but a resumed worker has lost whatever its shell
had loaded and may come back at a lower effort than it was launched with. On the source fleet every worker
resumed from one message each without repeating a tracker write, but one first drove another worker's
browser session, because a browser call without the named session falls back to the shared default.

1. Find the workers by the label in their title, not by an old handle: handles change when the
   runtime restarts (`/agent-orchestration` gotchas G22), and each tab title is the worker
   name `<KEY>--<old handle>` (`/agent-orchestration` session identity §1). Match on the
   part before the last `--term_` (the ticket key, the roster label), not on the stale handle after
   it. Update the roster and the board (`bun run board worker <KEY> --name <new handle> --by conductor`),
   re-issue each tab rename as `<KEY>--<new handle>` ([ORCHESTRATION_TOOL] terminal rename), and
   re-bind every replaced terminal's dispatch (G68). Read each screen's footer for the model and effort; a
   worker below its launch effort goes in the status line, relaunching it is the owner's call.
   Rename each resumed session too. The tab rename leaves the harness session name on the old handle, and
   on Claude Code the identity hook cannot fix it, because it names a session only from a prompt carrying
   the fleet token and a resumed session receives none. Once each worker's screen shows it ready, type the
   harness rename verb into it, Claude Code included
   (`[ORCHESTRATION_TOOL] terminal send --enter --text '/rename <KEY>--<new handle>'`; Pi
   `/name <KEY>--<new handle>`), then read it back on the status bar as a bare token
   (`/agent-orchestration` session identity §4 and §5). On Claude Code this makes the name human-set,
   so the hook leaves it alone from then on, which is what a resume wants. An OpenCode whose `/rename` opens a dialog, or a harness that
   cannot be renamed: mark the roster row `(roster only)` as at launch. Write the new name into the
   roster's `Name` column and keep the old one in its `## Notes per worker`; every `Session:` trailer made
   after the resume carries the new name (commits made before keep the old one). All of this lands before
   the step 6 message.
2. Board server: when the page does not answer inside working hours, start `bun run board:up` in the
   background (the sentinel would at its next tick; doing it now lets the resume read the page).
3. Sentinel: re-arm it with the SAME `--baseline` file (`sprint-board.md` §7). On a harness without
   background tasks, list the scheduled passes first: present, leave it; missing, arm it, and never add a duplicate.
4. Owner actions missed while down: `bun run board inbox` plus the bounded
   `bun run board listen --since <last pass or last id seen>` replay (`sprint-board.md` §3).
5. Mailbox: read it per §3 step 3.
6. One message per live worker, through the mailbox with a terminal pointer as the nudge
   (`/agent-orchestration` channel discipline), with `<KEY>` filled in:

   ```
   Resume after a machine reboot. Pass your named browser session (-s=<KEY>) on EVERY browser call and load
   your state file again before navigating. Read your test-session-memory.md Live Progress and the ticket's
   tracker artifacts (TCs, ATP, ATR, comments) for what already landed. Re-run from the last VERIFIED step;
   never repeat a tracker write that is already there. Re-dispatch any subagent that never reported. Reply
   with the step you resume from. Your name is now <KEY>--<new handle>: use it in the Session: trailer of
   every commit from here on.
   ```

7. No new launch until every live worker answered. Then the next pass runs as usual, and boot Step 7
   (the status screen) reports the resume.

---

## 5. What a boot writes

`kickoff.md` in `.session/sprint-conductor/sprint-<N>/`, rewritten whole at boot and resume:

```markdown
# Kickoff — sprint <N>
board: <slug> · url: http://127.0.0.1:4477 · Run: <run> · cap: <cap> · watch: armed (<task id>) | off
pre-flight <ISO time>: tokens <roles> · states <roles regenerated> · schema <synced | skipped: <case>, last sync <date>>
drift: <repo> <0/0 after a good fetch | n behind, workers told to check containment>
deployed build: <repo> <sha> <finish time> (one line per repo)
deviations: <each one, or none>
live workers: <KEY> <handle> <stage> (one line each)
next decision for the owner: <one line, or none>
```
