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

---

## 2 · Recipes that fit this repo

| Routine | Cadence | Workspace | What it does |
|---|---|---|---|
| Nightly regression triage | daily, after CI | existing | read the latest run, classify failures into real clusters, open one worker per cluster, leave a GO / CAUTION / NO-GO verdict where the team reads it. WHAT: `/regression-testing` |
| Hydrate the tracker cache + coverage map | daily | existing | refresh the synced issue cache and regenerate the coverage map, publish the HTML |
| Shift-left sweep | sprint start | existing | query the stories in the backlog that carry no shift-left label, open one worker per story. WHAT: `/shift-left-testing` |
| Artifact-status guard | weekly | existing | run the artifact-lifecycle verifier over the sprint's artifacts (a plan frozen in its creation status, a test case still in draft) and produce a LIST. It touches nothing |

Each one is the full conductor cycle (`references/coordinator-playbook.md`), minus the owner: same
Run, same Tasks, same briefs, same closing. The difference is that nobody will answer a question, so
an ambiguous case becomes a reported item rather than a blocking `ask`.

---

## 3 · Registering one

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

## 4 · The four gotchas

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
   five channels plus a drive, with nothing to do) cost **USD 1.33 and 115 seconds** on a top-tier
   model on 2026-09-13: ~5.5k output tokens, ~101k cache creation, ~353k cache reads, 14 turns.

   | Cadence | Runs/day | Daily floor |
   |---|---|---|
   | hourly, ungated | 24 | ~USD 32 |
   | hourly with a 3 h gate | 8 | ~USD 10.6 |
   | **daily** | **1** | **~USD 1.33** |

   The decision taken on 2026-09-13 was to drop to daily and REMOVE the shell gate rather than tune
   it: with one run a day, the gate's only job (avoiding useless wake-ups) stops being worth its own
   complexity. The price paid is latency — up to a full cadence between an answer and the action.

4. **Session reuse is opt-in and only for existing-workspace routines.** Submitting later runs into
   the previous live session is available; a fresh session per run is the other choice. Pick
   deliberately: reuse keeps context (and its drift), fresh keeps determinism (and re-reads
   everything).

---

## 5 · Checklist before registering a routine

- [ ] The prompt lives in a versioned file, and the file is the source of truth; the registered copy
      is a snapshot that must be re-synced when the file changes (gotcha 1).
- [ ] The prompt contains the "dispatcher never produces" boundary, verbatim.
- [ ] It runs against an EXISTING workspace when it reads out-of-git state.
- [ ] Cadence is justified against the measured cost per wake-up.
- [ ] The report includes the token cost of the run.
- [ ] Ambiguity has a destination that is not "guess": one reported item, named in the prompt.
- [ ] The close-out path is explicit: every worker it opens gets released, every worktree it made
      gets the orphan audit before removal (`references/coordinator-playbook.md` §6). An unattended
      routine that leaks worktrees takes the runtime down while nobody is watching (gotcha G31).
- [ ] The routine was fired MANUALLY once and its output reviewed before the schedule was enabled.
