# Shift-right deferral: an in-scope case blocked from outside moves on, marked and planned

> Entry: a `DEFER` verdict from `sprint-testing/references/preflight-gate.md`. Ladder and record format: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.3-5.4. Gates: `agentic-qa-core/references/stage-gates.md`.

A **shift-right deferral** is `DEFERRED (execution)` on an in-scope case with an external cause. It differs from Shift-Right production observation (`iql-context/references/approaches.md`): this case is still owed and runs when its precondition arrives.

The Story moves on without waiting, under a contract the team can read: what is untested, who owes what, and when it gets tested. Steps 2 to 6 apply to a Story QA signs off. A bug retest never closes on a deferral, and a ticket-free deferral stops at step 1 (§5.4 and §5.3 of the doctrine).

## 1. Record

Write the `DEFERRED (execution)` line and open the follow-up exactly as `discovery-driven-doctrine.md` §5.3 step 2 says.

## 2. Notice and contract

Post one comment on the Story through `[ISSUE_TRACKER_TOOL]`, from `reporting-templates.md` §3.6, and read it back: what is untested, why the cause is external, what was tried, who owes what, what moving on means and what happens when the precondition arrives. This notice, like the precondition request, is a Story comment: a tracker write of the stage, not a team message.

A chat notice is an interface with no provider behind it. Its inputs are a channel id, a text file and an optional attachment. Skip it and say it was skipped. Chat or Slack, a wired provider included, goes out only on the owner's order, one staged message per wave. The Jira comment is required either way.

## 3. The owner's OK

Before the transition, the owner gives an explicit final OK on the list of deferred cases. The **owner** is the person who signs the transition (`stage-gates.md` §"Contract table"): the person who launched the session, or whom the brief names. The OK is evidence the agent cannot mint. It counts as the owner's comment on the Story, own message, or answer to a question that lists the case ids, given after the notice and covering those ids.

| Who runs | How the OK is obtained |
|---|---|
| A person is present | ask the owner with the case ids listed; a person who is not the owner only relays the answer, quoted, with its pointer |
| A supervised worker or a subagent | escalate to the conductor or launcher, which asks the owner and relays the message quoted, with its pointer. It never answers the question itself |
| A routine with nobody | only a delegating brief that quotes such an OK for those case ids, with its pointer; otherwise stop and report |

- **Not an OK**: a blanket advance approval, anything older than the notice, any wording by the agent, the conductor or the launcher session, and a comment an agent session posted, even from the owner's account.
- The ATR cites who gave it, when and where.
- The OK covers the cases listed. A case deferred afterwards needs its own.
- When every case is deferred and none was observed, the rule of `discovery-driven-doctrine.md` §5.4 holds: the owner decides.

### Waiting for the owner OK

A pending or refused OK is one state, **waiting for owner OK**:

- The Story stays at `{{jira.status.story.in_test}}`, with no label and no pass result comment.
- The ATR stays `active`, and no closing step touches the ATP or the ATS.
- The sprint queue row and the report read `waiting for owner OK`.
- On the Sprint Board: `needs-you` with the case ids, `verdict` `BLOCKED` and `hold --reason other --on` the owner (`sprint-board.md` §2). Never `PASSED`.
- The worker may be closed, and the round and the sprint may close with the Story listed.

A late OK resumes at §4, then §5.

## 4. Mark and sign off

In order:

1. Add the label named by `qa.deferral.label` in `.agents/project.yaml` to the Story, keeping its other labels. With the key absent or `null`, ask once, together with the OK; never invent a label.
2. Read the Story back and confirm the label.
3. Set the result to `PASSED WITH DEFERRALS`, write the OK citation into the ATR, complete the ATR and post the QA comment.
4. Fire `{{jira.transition.story.qa_sign_off}}`.

QA moves the Story no further than `{{jira.status.story.qa_approved}}` and deploys nothing.

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
