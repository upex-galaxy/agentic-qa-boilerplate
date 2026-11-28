# Unblock preflight: before a case is called BLOCKED or DEFERRED (execution)

> This is `sprint-testing/references/preflight-gate.md`, run per case during execution. It is not `agentic-qa-core/references/preflight-gate.md`, which checks session readiness before work starts. Cite both by full skill path.
> Entry: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.3 step 1. A `DEFER` verdict continues in `sprint-testing/references/shift-right-deferral.md`.

Run it on every case that is about to be written `BLOCKED` or `DEFERRED (execution)`, before either word is written. The steps run in order, and a step that settles the verdict ends the run.

## 0. Scope test

Read the acceptance criteria from the synced Jira body (`story.md`, `acceptance-criteria.md`) and the ATP (`acceptance-test-plan.md`).

| Finding | Result |
|---|---|
| The case traces to an in-scope AC, a business rule of the Story, or a risk the ATP records against the Story's own behaviour | continue with step 1 |
| It ties to none of them, or the Story declares the behaviour out of scope | `DROPPED`: it leaves the Story's run set and its totals, with one ATR line `{TC}: DROPPED, out of scope: {why}`. It is neither `NOT RUN` nor deferred |
| Unsure whether it is in scope | a product question for a person (`agentic-qa-core/references/decision-protocol.md`); the case stays `BLOCKED` until the answer |

With no Story, the scope is what bounds the run: the charter in ticket-free exploration, the bug's reproduction and stated fix in a retest.

## 1. False-block guard

Prove each line with an evidence pointer:

- **The change is deployed** on the environment the precondition names. Not deployed is a finding: report it, leave the case `BLOCKED` and end the run. Undeployed code is never deferred.
- **The setup is the right one**: environment, URL, credential name and tool. Check that a variable is set through the loader, never by reading its value.
- **A degraded tool is said and recorded** in chat and in the ATR. A substitute counts only when it still proves what the case asserts: the assertion is never narrowed to fit the tool.

## 2. Self-unblock

In this order, stopping at the first that lets the case run:

1. **Find existing data**, reading the database (`agentic-qa-core/references/db-testing-doctrine.md`) or the API.
2. **Create it** through the product's own path, the API, a fixture identity or a reset path (`agentic-qa-core/references/test-design-doctrine.md` §"Unreachable preconditions", outcomes 1 and 2).
3. **Write to the database** only inside the limits `db-testing-doctrine.md` sets. This preflight grants no new permission. Snapshot the rows first, restore them afterwards and record both.

In a fleet a worker seeds no fixture (`fleet-conductor.md` §2): it asks the conductor to seed, that request is the attempt, and there is no `DEFER` until it is answered.

A session is never minted to get past a block (`agentic-qa-core/references/browser-sessions.md` §4).

A case that becomes runnable is verdict `RUN`: execute it and record `PASSED` or `FAILED` as observed.

## 3. External test

A cause is external only when what is missing is outside QA's reach:

| Class | What is missing |
|---|---|
| Infrastructure | infrastructure, a job or a worker that QA cannot run or access |
| Third party | an account, credential or permission on an outside service that QA lacks and cannot create |
| Owed precondition | a precondition another person owes, requested before execution (the Stage 1 comment of `acceptance-test-planning.md` §"Request the preconditions other people owe", or another pointer), or already due by the Story, the ATP or the deploy notes (with a pointer), or requested late and past its needed-by date; and not delivered |

With neither a prior request nor a due pointer, post the request now (that same comment, read back, under its routine rules), with a needed-by date: the date this Story's execution must finish. The case stays `BLOCKED` until that date passes. Then the session running the Story reruns the preflight before Reporting is dispatched and may `DEFER`, the record saying it was requested late. A request that was not posted leaves the case `BLOCKED`.

Not external: anything QA can still do, QA's own broken setup, and a product behaviour that was observed wrong (that is `FAILED`).

Every attempt is recorded with its evidence pointer. **No evidence means not external**: the case stays `BLOCKED`.

## Record

One block per case:

```
PREFLIGHT {TC id} | {env} | {date}
  Scope:     {AC id} in {synced file} | out of scope: {why}
  Deployed:  yes [{evidence}] | no [{evidence}]
  Tried:     {attempt}: {result} [{evidence}]   (one line per attempt)
  Requested: {what, from whom, when, pointer} | already due by {pointer} | requested late {when, pointer, needed by} | n/a
  External:  {class}: {who owes what} | no
  Verdict:   DROPPED | RUN | DEFER | BLOCKED
```

Steps never reached are written `not reached`. The block goes under the case in `test-session-memory.md` (ticket-free exploration: the finding file). Reporting copies the `DEFER` blocks and the `DROPPED` lines into the ATR, because the session directory stays on one machine. Evidence carries no secret value.

## Verdicts

| Verdict | When | Next |
|---|---|---|
| `DROPPED` | step 0 finds it out of scope | one ATR line, no open run (below) |
| `RUN` | step 2 unblocked it | execute; `PASSED` or `FAILED` |
| `DEFER` | in scope, step 1 clean, step 2 exhausted, step 3 external with evidence | `sprint-testing/references/shift-right-deferral.md` |
| `BLOCKED` | everything else: open scope question, change not deployed, something QA can still do, missing evidence | the ladder stays open (`discovery-driven-doctrine.md` §5.3) |

A block that is not external and leaves QA nothing to try goes to the owner (ladder step 4), who names who owes it, and the preflight is rerun, or rules it out of scope (`DROPPED`).

A `DROPPED` case keeps its one ATR line and leaves no run open:

- **Modality jira-xray**: take it out of the Story's ATS (membership and link), and so out of the ATP and ATR lists derived from it. The `Test` issue is not deleted.
- **Modality jira-native**: remove it from the ATR run list.

## Unreachable preconditions

Outcomes 1 and 2 of `test-design-doctrine.md` §"Unreachable preconditions" are step 2 here. Outcome 3 (declared unobservable) reaches `DEFER` only through step 3: whoever must provide what it would take (a fixture account, a seed hook, a reset endpoint, a controllable clock) is named, under Owed precondition or Infrastructure. With nobody to name, the case stays `BLOCKED` and goes to the owner (`discovery-driven-doctrine.md` §5.3 step 4).
