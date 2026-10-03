# Automations — Unattended Routines

> Loaded by: the conductor in AUTOMATION mode, and by whoever registers a routine.
> A scheduled automation runs a VERSIONED prompt on a cron-like trigger inside a workspace, with
> no human in the loop. It is a conductor that dispatches and does not produce.

---

## 1 · The boundary: the dispatcher never produces

The single rule that keeps an unattended routine from turning into an unreviewed author:

> You produce no artifact. Not a draft, not a plan, not a test case, not a report body. You create
> the worker that produces, and you close your session. If you catch yourself writing the deliverable,
> you have left your task.

It follows that an automation also: publishes nothing, approves nothing on the owner's behalf,
invents no work, commits nothing, and — when something is ambiguous — ASKS in the same sweep instead
of guessing. An automation that guesses is worse than one that skipped.

**Its report always states what the run cost in tokens**, especially when there was nothing to do.
That number is how the owner decides whether the cadence is still right.

What the routine may DECIDE on its own, and what it parks for a person, is
`agentic-qa-core/references/decision-protocol.md` §5 ("No person at the wheel"). This file does not
restate it.

---

## 2 · Run discipline: what every routine does before, during and after it dispatches

A scheduled routine runs while nobody is watching, so the failures it can cause are the quiet ones:
two runs working the same items, a run that opens more workers than anyone would have approved, a
run that dies and leaves workers nobody knows about. Five rules close those doors. They are written
into the routine's versioned prompt, and §6 checks that they are.

### 2.1 · One lock per routine, never a queue

A manual `orca automations run` fires right away, whether or not a scheduled run of the same routine
is still going, and the precheck gates scheduled runs only (`orca automations create --help`). Two
fires of one routine can therefore overlap, and both would read the same backlog and open a worker
for the same item. The lock lives in the routine's prompt, never in the precheck, because the
precheck does not see a manual fire.

The lock file is `<<PRIMARY_ROOT>>/.session/orchestration/automations/<routine>/lock.json`. It sits
in the primary checkout so a routine registered with a fresh worktree per run still finds the lock
of the previous fire.

```json
{
  "routine": "<routine slug, the folder name>",
  "automation_id": "<id from orca automations list>",
  "owner": "<ORCA_TERMINAL_HANDLE of this session> / <Run id, once created>",
  "started_at": "<ISO-8601 UTC>",
  "refreshed_at": "<ISO-8601 UTC, rewritten at every step boundary>",
  "stale_after_minutes": "<copied from the routine's prompt>"
}
```

Take it with an exclusive create (`set -o noclobber` before the redirect), so two fires racing for
the same file cannot both succeed, and then read it back: the lock is yours only when the file names
your handle (Rule #16). Then decide, in this order:

| What is on disk | What the run does |
|---|---|
| no lock | create it, read it back, continue |
| a lock refreshed less than `stale_after_minutes` ago | another fire owns this routine. Exit with a one-line report naming the owner and its start time. Do not wait, do not retry, do not run anyway: the next scheduled fire is the retry |
| a lock older than `stale_after_minutes` | the run that wrote it died. Reclaim it (remove, create no-clobber, read back) and record the reclamation in the run report: whose lock, how old, and the dead run's report path (§2.4). A silent reclaim erases the only evidence that a run died |
| a lock whose prompt declared no window | treat it as live and exit with the report above. A missing window fails closed |

Rewrite `refreshed_at` at every step boundary: after selection, after each worker opens, after each
worker closes. Delete the file as the last step of the run, including a run that parked everything
or stopped early. A lock belongs to a running session, never to an unfinished item.

This is a file lock on purpose, and it does not contradict `references/claims-protocol.md`, which
rejects file locks inside a fleet because a conductor is awake to arbitrate. Between two fires of a
routine there is no conductor awake: each fire IS one.

### 2.2 · A cap on the workers one run opens

An unattended run opens at most `orchestration.max_workers` workers in total
(`.agents/project.yaml`), in ONE round, unless the routine's prompt declares a lower cap. When more
items are eligible than the cap allows, the rest go in the report as deferred to the next fire, in
the order the next fire should take them. A second round inside the same run is what a person
approves, and there is no person.

### 2.3 · An empty run is a correct outcome

When nothing is eligible, the run says so and ends. The report lists what it considered and why
each item was dropped, plus the token cost (§1). Picking a marginal item so the report is not empty
is the failure this rule exists to prevent: it spends a worker on work nobody asked for.

### 2.4 · Write the run report as you go

The report is `<<PRIMARY_ROOT>>/.session/orchestration/automations/<routine>/report-<YYYY-MM-DD-HHMM>.md`,
next to the lock. It gets a line at every step boundary, the same moments that refresh the lock: the
items selected and dropped, each worker opened (item, terminal handle), each worker closed and its
outcome. Never only at the end. A run that dies mid-way leaves workers running, and the report is
the only place their handles are written down.

A run that reclaims a stale lock reads the dead run's report and lists, in its own report, every
worker that report opened and never closed. It does not close them: they may still be working, and
deciding that is the owner's call.

### 2.5 · The deployed environment is truth, the tracker is a hint

A status in the tracker says what someone moved, not what the environment runs. A Story can sit in
Ready for QA while the build on the target environment does not contain its merge yet. A routine
that selects Stories for TESTING runs the deploy check of
`sprint-testing/references/session-entry-points.md` (Step 1c) on each candidate before opening a
worker for it. A candidate whose verdict is NOT CONTAINED is a dropped item with both build ids in
the report, never a worker. UNVERIFIED goes to the worker, with the gap named in its brief.

The same rule reaches regression triage: the triage report names the build the run tested, so a
failure is classified against what was deployed, not against what the tracker says shipped.

---

## 3 · Recipes that fit this repo

| Routine | Cadence | Workspace | What it does |
|---|---|---|---|
| Nightly regression triage | daily, after CI | existing | read the latest run, classify failures into real clusters, open one worker per cluster, leave a GO / CAUTION / NO-GO verdict where the team reads it. WHAT: `/regression-testing` |
| Hydrate the tracker cache + coverage map | daily | existing | refresh the synced issue cache and regenerate the coverage map, publish the HTML |
| Shift-left sweep | sprint start | existing | query the stories in the backlog that carry no shift-left label, open one worker per story up to the cap (§2.2). WHAT: `/shift-left-testing` |
| Artifact-status guard | weekly | existing | run the artifact-lifecycle verifier over the sprint's artifacts (a plan frozen in its creation status, a test case still in draft) and produce a LIST. It touches nothing |

Each one is the full conductor cycle (`references/coordinator-playbook.md`), minus the owner: same
Run, same Tasks, same briefs, same closing. The difference is that nobody will answer a question, so
an ambiguous case becomes a reported item rather than a blocking `ask`.

---

## 4 · Registering one

```bash
orca automations list --json </dev/null
orca automations show <id> --json </dev/null
orca automations create --name "<name>" --trigger daily --provider <agent> \
  --prompt "$(cat <prompt-file>)" --workspace <selector> --json </dev/null
orca automations run <id> --json </dev/null      # manual fire, same workspace, right now
orca automations edit <id> --prompt "$(cat <prompt-file>)" --json </dev/null
```

The trigger accepts the preset words (`hourly`, `daily`, `weekdays`, `weekly`), a 5-field cron
expression, or an RRULE string. A bounded precheck command can gate a scheduled run: exit 0
continues, anything else records a skipped run — which is the cheap way to avoid paying for a
wake-up with nothing to do.

---

## 5 · The four gotchas

1. **The prompt is FROZEN at creation.** `--prompt "$(cat <file>)"` stores the TEXT, not a reference
   to the file. Editing the file afterwards does NOT update the automation. Re-sync is manual:

   ```bash
   orca automations edit <id> --prompt "$(cat <prompt-file>)" --json </dev/null
   orca automations show <id> --json </dev/null      # verify the stored length changed
   ```

   Worth automating later: a cheap check comparing the file's hash against the registered prompt and
   warning when they diverge. Not built.

2. **Use an existing workspace** whenever the routine reads or writes state that lives outside git.
   With a fresh workspace per run, that file does not exist, so the routine reprocesses everything,
   every day, forever. Pass the workspace selector at creation.

3. **Cost per wake-up is real and measurable.** An EMPTY run of an orchestrator routine (a sweep of
   the channels plus a drive, with nothing to do) still costs a full model turn, in money and in
   minutes. The figure behind this rule is in ADR-0006
   (`.context/ADR/ADR-0006-forensic-measurements-ledger.md`); the number to trust for a given
   routine is its own run log. Measure once per routine before choosing a cadence.

   The daily floor is a formula, not a table: **runs per day × the measured cost of one empty
   wake-up**. Hourly and ungated pays it every hour; a shell gate divides it by the wake-ups it
   skips; daily pays it once.

   The decision this repo took was to drop to daily and REMOVE the shell gate rather than tune
   it: with one run a day, the gate's only job (avoiding useless wake-ups) stops being worth its own
   complexity. The price paid is latency — up to a full cadence between an answer and the action.

4. **Session reuse is opt-in and only for existing-workspace routines.** Submitting later runs into
   the previous live session is available; a fresh session per run is the other choice. Pick
   deliberately: reuse keeps context (and its drift), fresh keeps determinism (and re-reads
   everything).

---

## 6 · Checklist before registering a routine

- [ ] The prompt lives in a versioned file, and the file is the source of truth; the registered copy
      is a snapshot that must be re-synced when the file changes (gotcha 1).
- [ ] The prompt contains the "dispatcher never produces" boundary, verbatim.
- [ ] It runs against an EXISTING workspace when it reads out-of-git state.
- [ ] Cadence is justified against the measured cost per wake-up.
- [ ] The report includes the token cost of the run.
- [ ] Ambiguity has a destination that is not "guess": one reported item, named in the prompt.
- [ ] The prompt takes the routine's lock before anything else and declares `stale_after_minutes`,
      sized above the longest run in the routine's own history (`orca automations runs --id <id>`)
      (§2.1).
- [ ] The prompt names its worker cap, or says it uses `orchestration.max_workers`, and says where
      deferred items go (§2.2).
- [ ] The prompt says that nothing eligible is a correct outcome, reported with what was
      considered (§2.3).
- [ ] The run report is written at every step boundary, at the path in §2.4, never only at the end.
- [ ] A routine that selects Stories for testing runs the deploy check before opening a worker
      (§2.5).
- [ ] The close-out path is explicit: every worker it opens gets released, every worktree it made
      gets the orphan audit before removal (`references/coordinator-playbook.md` §6). An unattended
      routine that leaks worktrees takes the runtime down while nobody is watching (gotcha G31).
- [ ] The routine was fired MANUALLY once and its output reviewed before the schedule was enabled.
