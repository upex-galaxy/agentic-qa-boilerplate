# Shift-right deferral: an in-scope case blocked from outside moves on, marked and planned

> Entry: a `DEFER` verdict from `sprint-testing/references/preflight-gate.md`. Ladder and record format: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.3-5.4. Gates: `agentic-qa-core/references/stage-gates.md`.

A **shift-right deferral** is `DEFERRED (execution)` on an in-scope case with an external cause. It differs from Shift-Right production observation (`iql-context/references/approaches.md`): this case is still owed and runs when its precondition arrives.

The Story moves on without waiting, under a contract the team can read: what is untested, who owes what, and when it gets tested. **Story** below also means a Tech Story or Tech Debt: its sign-off is `{{jira.transition.tech_story.test_finished}}` or `{{jira.transition.tech_debt.test_finished}}` where a Story's is `{{jira.transition.story.qa_sign_off}}`, and while it is held it stays in its in-review status where a Story stays `{{jira.status.story.in_test}}`. Steps 2 to 6 apply to a Story, Tech Story or Tech Debt QA signs off. A bug retest never closes on a deferral, and a ticket-free deferral stops at step 1 (§5.4 and §5.3 of the doctrine).

## 1. Record

Write the `DEFERRED (execution)` line and open the follow-up exactly as `discovery-driven-doctrine.md` §5.3 step 2 says.

## 2. Notice and contract

Post one comment on the Story through `[ISSUE_TRACKER_TOOL]`, from `reporting-templates.md` §3.6, and read it back: what is untested, why the cause is external, what was tried, who owes what, what moving on means and what happens when the precondition arrives. This notice, like the precondition request, is a Story comment: a tracker write of the stage, not a team message.

A chat notice is an interface with no provider behind it. Its inputs are a channel id, a text file and an optional attachment. Skip it and say it was skipped. Chat or Slack, a wired provider included, goes out only on the owner's order, one staged message per wave. The Jira comment is required either way.

## 3. The owner's OK

Before the transition, the owner gives an explicit final OK on the list of deferred cases. The **owner** is the person who signs the transition (`stage-gates.md` §"Contract table"): the person who launched the session, or whom the brief names. The OK is evidence the agent cannot mint, given after the notice and covering those case ids. It counts in one of two forms. With the owner at the keyboard of the session that runs the stage: their own answer there, typed in its chat or picked in the harness's structured-question tool on a question that lists the case ids. With nobody at that keyboard (a fleet worker, a conductor relaying, a routine): a pointer that can be opened, the owner's comment on the Story or their answer on the Sprint Board.

| Who runs | How the OK is obtained |
|---|---|
| The owner is at the keyboard of the session running the stage | ask with the case ids listed, in chat or with the structured-question tool; record their answer in the ATR with its timestamp and the words `owner OK given in session`. A pointer counts here too |
| Someone else is at that keyboard | they only carry a pointer to the owner's comment or board answer |
| A supervised worker | escalate to the conductor or launcher, which asks the owner and returns the pointer. It never answers the question itself |
| A subagent | report to the session that dispatched it, which follows its own row here |
| A routine with nobody | only an OK it can open through a pointer its brief carries; otherwise stop and report |

- **Not an OK**: a blanket advance approval, anything older than the notice, any wording by the agent, the conductor or the launcher session (a brief included: it never stands in for the owner's own words, a quote of them neither), a default or timed-out prompt, an answer another session relays without the pointer, and a comment an agent session posted, even from the owner's account.
- The ATR cites the pointer and what was read behind it, or the in-session record.
- **Limit of the in-session form**: the agent writes the record and no verifier can open it. What guarantees it is the owner's presence, not a pointer.
- The OK covers the cases listed. A case deferred afterwards needs its own.
- When every case is deferred and none was observed, the rule of `discovery-driven-doctrine.md` §5.4 holds: the owner decides.

### Checking the OK and the record

An in-session OK is checked by the session that received it: the owner typed or picked it there, after the notice, naming or accepting the listed case ids, and the ATR carries its timestamp and `owner OK given in session`. For a pointer, the Stage 3 session before the sign-off, and in a fleet the round-close verifier again, open it and record what they read:

| Pointer | Read and record |
|---|---|
| Jira comment | its id, author and timestamp, read back from Jira: the author is the owner, the time is after the notice, the text covers the case ids, and no session of the run posted it |
| Board answer | the `need.answer` event in the board's `events.ndjson`: its text, time and `by`. Only `owner`, which the board page writes, counts; an answer recorded with `--by`, a conductor's included, does not |

A board answer is accepted evidence with a stated limit: it proves the record did not come through the board CLI, not who typed it, because a local process can still post to the page. The Story comment read back from Jira is the stronger pointer and is preferred when both exist.

They also open each deferred case's preflight record: it names what was tried, each attempt with an evidence pointer that opens, the external class and who owes it, verdict `DEFER`.

Neither form, a pointer that does not open, or a preflight record short of that, is the closed value: no `PASSED WITH DEFERRALS` and no sign-off. When the agents write under the owner's own account, the read-back cannot prove who typed: say so beside the record.

### Waiting for the owner OK

A pending OK is one state, **waiting for owner OK**:

- The Story stays at `{{jira.status.story.in_test}}`, with no label and no pass result comment.
- The ATR stays `active`, and no closing step touches the ATP or the ATS.
- The sprint queue row and the report read `waiting for owner OK`.
- On the Sprint Board: `needs-you` with the case ids and `--by <writer>`, `verdict` `BLOCKED` with `--by <writer>`, and `hold --reason other --on` the owner (`sprint-board.md` §2; `<writer>` is `conductor`, `sentinel` or `worker`). Never `PASSED`.
- The worker may be closed, and the round and the sprint may close with the Story listed.

A late OK resumes at §4, then §5.

### A refused OK

A refusal means the deferral is not accepted, and it counts however it arrives. It is not a pending OK:

- The listed cases return to `BLOCKED`, each with the owner's answer recorded.
- The Story stays in test, with no label, no pass result comment and no plan row; the ATR stays `active`.
- The session keeps waiting on the precondition as with any block, and asks for an OK on those cases again only when something changed.

## 4. Mark and sign off

In order:

1. Add the label named by `qa.deferral.label` in `.agents/project.yaml` to the Story, keeping its other labels. With the key absent or `null`, ask once, together with the OK; never invent a label.
2. Read the Story back and confirm the label.
3. Set the result to `PASSED WITH DEFERRALS`, write the OK citation into the ATR, complete the ATR and post the QA comment. On a Sprint Board, also record the OK you observed with `bun run board deferral-ok <KEY> --cases <ids> --pointer "<pointer>" --by conductor|worker`, which only moves the lane and never stands in for opening the pointer here and at round close (§3).
4. Fire the sign-off: `{{jira.transition.story.qa_sign_off}}`, or the tech type's `test_finished`.

QA moves the Story no further than `{{jira.status.story.qa_approved}}` (a tech item: `automated`) and deploys nothing.

## 5. The shift-right test plan

After the transition, write the rows. One issue per sprint collects the deferred cases (a project with no sprint: one per release or per month). Find it by the title `Shift-Right Test Plan: {sprint}`, else create it. Every mode does this, single-issue included.

| Property | Value |
|---|---|
| Work type | a plain task-type issue at the standard level (never a subtask), resolved from `.agents/jira-required.yaml` and the instance's own types. Never the Test Plan work type, and no ladder acronym. With no such type, ask which one holds the plan |
| Parent | `qa.qa_epics.test_artifacts_epic` |
| Label | `qa.qa_artifact_label` |
| Assignee | self |
| Links | `{{jira.link_types.relates.name}}` to each Story it lists |

The sync does not materialize a work type that `.agents/jira-required.yaml` leaves undeclared or marks `sync: never`, so read the plan description through `[ISSUE_TRACKER_TOOL]`.

The description is rewritten wholesale, so read it first and change only your Story's rows. In a fleet the conductor is its one writer: a worker sends it the rows.

```
Cases signed off without being observed. Each runs when its precondition arrives.

| Story | Case | Missing precondition | Who owes | Follow-up | Owner OK | State |
|-------|------|----------------------|----------|-----------|----------|-------|
| {KEY} | {TC} | {what} | {person or team} | {KEY} | {who, date, link} | WAITING |
```

`State` is `WAITING`, `FAILED ({issue key})`, `PASSED` or `WITHDRAWN ({who, date, link})`. `WITHDRAWN` needs the owner's explicit approval, cited.

## 6. Run when the precondition arrives

Triggers: the follow-up is resolved, someone says the precondition is there, or a check of the open rows at the next session on that Story and, at sprint close, of every open plan whatever its sprint.

1. Rerun the preflight on the case.
2. Execute it in the environment its precondition names (`discovery-driven-doctrine.md` §5.2).
3. Record it in a new Test Execution titled `ReTest: {STORY-KEY}: {summary}`, the retest naming of `reporting-templates.md` §2.3: parent `qa.qa_epics.test_artifacts_epic`, Test Environment set, assignee self, linked to the Story as the ATR is, closed once its runs are recorded. Its body names the ATR it follows; the closed ATR is not reopened. The synced `acceptance-test-results.md` then shows the most recently updated Execution, and the earlier ones stay under the Story's `test-executions/`. Modality jira-native: a comment on the Story instead.
4. Update the row in the plan.

| Outcome | Then |
|---|---|
| All of a Story's rows `PASSED` | remove the label, read the Story back, close the follow-ups, comment on the Story |
| A case `WITHDRAWN` | the row cites the approval; the label stays on that Story |
| A case `FAILED` | file it per `agentic-qa-core/references/defect-management-doctrine.md`; the label stays and the row reads `FAILED ({issue key})` until the case passes |

The plan stays open past sprint close until every row is `PASSED` or `WITHDRAWN`. Then close it through the unmapped-status fallback (`agentic-qa-core/references/artifact-lifecycle.md` §4). Unattended runs follow the routine rules of `stage-gates.md` for every Jira write.
