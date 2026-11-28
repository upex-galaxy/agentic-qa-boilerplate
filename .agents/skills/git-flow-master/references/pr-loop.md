# PR loop: from open to merged

This file runs a PR from the moment `gh pr create` returns until the PR merges or closes. The doctrine (what each policy value means, which waits exist, what still asks a person) lives in `.agents/skills/edd/`: `SKILL.md`, `references/flows.md` (Flow 2 and Flow 3), `references/waiting.md` and `references/human-gates.md`. This file is the operations side and cites them instead of restating them. Before the first `gh` call of the session, run the account guard in `session-safety.md`.

The loop has no approval step. Every step below is the agent's call, made and reported. The only stops are the items on the closed list in `.agents/skills/edd/references/human-gates.md`, and each one is named where it can occur.

## 1. Metadata before review

Set the metadata right after `gh pr create`, before anyone is asked to look and before auto-merge is enabled. A PR without an assignee or labels is not waiting on anyone.

```bash
gh label list --limit 200                     # the labels this repo actually has
gh pr edit <n> --add-label "<label>,<label>"  # only names from that list
gh pr edit <n> --add-assignee <owner>         # the owner of the work
gh pr edit <n> --add-reviewer <login>         # only under merge_mode human-approves
```

| Field | Rule |
|---|---|
| labels | map the dominant commit type with the table in `pr-templating.md`, then keep only names `gh label list` returned. `--add-label` drops a missing label without an error, so a label you invent is never applied. A mapped label the repo lacks is skipped and named in the ready block, never created |
| assignee | the owner of the work: the person the brief names, else the authenticated `gh` user (`gh api user --jq .login`) |
| reviewer | only when `git_strategy.policy.merge_mode` in `.agents/project.yaml` is `human-approves`: the owners `CODEOWNERS` matches for the changed paths. When nobody can be resolved (no `CODEOWNERS`, no match, only the author matches), request nobody and name the gap in the ready block. Under `auto` and `manual`, request no reviewer |

None of these is asked. A missing label or reviewer is reported, not a reason to wait.

## 2. Merge enable

Read `git_strategy.policy.merge_mode` in `.agents/project.yaml`. A missing or null value reads as `auto`.

| `merge_mode` | Action |
|---|---|
| `auto`, `human-approves` | `bun run git:policy verify --merge <base>`, then on exit 0 `gh pr merge <n> --auto --<method>` |
| `manual` | no merge call. A person merges (human gate 7). Go to section 3 |

The method:

| `git_strategy.decisions.feature_merge` | Flag |
|---|---|
| `merge-commit`, `n/a`, missing | `--merge` |
| `squash` | `--squash` |
| `rebase-merge` | `--rebase` |

An `sdet` PR into its integration trunk always uses `--merge`, whatever `feature_merge` says (`SKILL.md` §3.4 and `sdet-integration-trunk.md`). A squash folds the evidence commit into a message body and loses its signature, so a repo that declares `squash` accepts that loss for every PR.

When `verify --merge` fails:

- **Protected base** (listed in `git_strategy.protected`, or carrying a ruleset): stop and tell the person what `verify --merge` reported. No `--auto` (human gate 10). The PR stays open and the watcher still runs.
- **Base with no ruleset** (a stacked PR on another feature branch, an unprotected trunk): skip `--auto`. Arm the watcher and wait for the `edd/evidence` check from the "EDD Evidence" workflow on the current head (the watcher prints `CHECK EDD Evidence/edd/evidence success on <head>`), then run `gh pr merge <n> --<method>`. This is the auto-merge trap in `.agents/skills/edd/references/flows.md`: on a base that requires no check, `--auto` merges at once, red or not. A green check catches mistakes and drift, not a deliberately forged check (`.agents/skills/edd/SKILL.md` "What the evidence proves").

A draft PR gets no merge call until it is marked ready (`gh pr ready <n>`), then this section runs.

## 3. Arm and wait

Arm the bundled watcher right after the merge call (under `manual`, right after section 1):

```bash
W=.agents/skills/edd/scripts/pr-watch.sh
bash $W start pr-delivery <repo>-pr-<n> REPO=<owner/name> PR=<n>
bash $W wake <repo>-pr-<n>      # a background shell call; it returns when something changed
```

Then label the terminal tab so a person scanning terminals sees which session owns the PR. Note the current title first.

- Under Orca: `orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "PR#<n> <previous title>"`.
- Elsewhere: the OSC title escape written to `/dev/tty`, as `.agents/skills/edd/references/waiting.md` "Tab label" shows.

A label that fails is a warning, never a stop. End the turn: the session waits on `wake` and spends no tokens.

On each wake, read the events and act on each line per the event table in `.agents/skills/edd/references/waiting.md`, and handle a PR that changed under you per `.agents/skills/edd/references/flows.md` "When a PR changes under you". Then arm `wake` again at once. Exit 3 from `wake` means every watch ended and there is nothing to re-arm. After a resume or a handoff, run `bash $W status` before arming anything: an earlier watch may still be running with events waiting.

## 4. Review-bot loop

Run this only when `evidence.review.bot` in `.agents/project.yaml` is a login. When it is null, skip the section; comments from people still get an answer per the waiting table.

A round is one bot pass over one head commit. Note the round's start time (the push that triggered it) as `<since>`.

1. **Wait for the bot's pass.** When the bot runs as an Actions workflow, find its run for the PR's head commit with `gh run list --commit <head-sha> --json databaseId,name,status,conclusion` and wait with `gh run watch <id> --exit-status`. Otherwise the watcher's `CHECK` or `REVIEW <bot> ...` event marks the pass. Match by the run's name or the bot login; never hardcode a workflow file name.
2. **Read all three surfaces.** A finding can land on any of them:
   - inline comments: `gh api repos/{o}/{r}/pulls/{n}/comments --paginate`
   - review summaries: `gh api repos/{o}/{r}/pulls/{n}/reviews --paginate`
   - plain PR comments: `gh api repos/{o}/{r}/issues/{n}/comments --paginate`, filtered to `user.login` equal to the bot login and `created_at` at or after `<since>`

   When the bot says its inline tooling was unavailable, its plain comment is the only copy of those findings, never a duplicate of the other two. Empty on all three surfaces is a clean round.
3. **Settle each finding, one at a time.**
   - Cross-check it against this repo's conventions and code, not only the comment's own framing. Decide CONFIRMED or REFUTED.
   - CONFIRMED: fix it, one commit per distinct fix.
   - Reply with the verdict and what changed. Inline comment: `gh api repos/{o}/{r}/pulls/{n}/comments/{id}/replies -f body="..."`. A plain comment has no reply endpoint, and a review summary (from `/pulls/{n}/reviews`) has neither a reply nor a reaction endpoint: answer both with `gh pr comment <n> --body "..."`, quoting the original so the verdict traces to it.
   - Resolve the thread through GraphQL, because REST has no resolve endpoint. List the threads with `gh api graphql -f query='query{repository(owner:"<o>",name:"<r>"){pullRequest(number:<n>){reviewThreads(first:100){nodes{id isResolved comments(first:1){nodes{databaseId}}}}}}}'`, match `databaseId` to the comment, then `gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:"<id>"}){thread{isResolved}}}'`. A plain comment has no thread.
   - React `+1` to every inline or plain comment you answered: `gh api repos/{o}/{r}/pulls/comments/{id}/reactions -f content=+1` for an inline one, `gh api repos/{o}/{r}/issues/comments/{id}/reactions -f content=+1` for a plain one. A review summary takes no reaction; the quoting reply is its answer. A resolved thread with no reaction reads as ignored.
4. **Push the round as one push.** When the fixes changed the PR's patch-id, re-attest first: re-run the agentic check the depth asks for, then `bun run edd attest` (`.agents/skills/edd/references/record-and-signature.md`). The push starts the next round.
5. **Repeat** until a round returns zero new findings on all three surfaces, capped at `evidence.review.max_rounds` rounds. After the cap, a finding you refute goes to a person with your reasoning (human gate 8), and the ready block says the loop was capped.

Every thread gets a verdict reply before it is resolved.

## 5. The ready block

Two things say whether a PR is ready, and they do different jobs.

- **The machine status** is the record's `Ready:` line (`scripts/lib/edd/record.ts`): open threads, the bot review, the assignee, the tracker link, and whether the title is conventional and under 70 characters. It is a snapshot of the run that wrote the record and changes no verdict; the ruleset enforces thread resolution. Read it in the CI verifier's PR comment, or in the body's rendered block (`pr-templating.md`).
- **The ready block** is the agent's checklist: the preconditions the agent makes true before it announces the PR as ready. It sits in the `## Evidence` section of the PR body, under the pasted record when the body has one. Its heading is "Ready for approval" under `human-approves` and "Ready to merge" under `auto` and `manual`. Regenerate it whenever a precondition changes, with `gh pr edit <n> --body-file <file>`; when the body cannot be edited, keep it in one PR comment you update in place.

```markdown
### Ready to merge

- [x] Required checks green, `edd/evidence` included
- [x] Review bot: 2 rounds, last round clean
- [x] Every comment answered, resolved and reacted
- [x] Labels set
- [x] Assignee set
- [ ] Reviewer requested: nobody matched in CODEOWNERS
- [x] Tracker link in the body
- [x] Title conventional, under 70 characters
```

| Precondition | Met when |
|---|---|
| required checks | every required check on the head is green, `edd/evidence` from the "EDD Evidence" workflow among them |
| review bot | the last round was clean, or the loop hit `evidence.review.max_rounds` (say "capped" and name what went to a person); "not configured" when `evidence.review.bot` is null |
| comments | each one has a verdict reply, its thread resolved where it has one, and a `+1` where the surface takes a reaction |
| labels | only names `gh label list` returned; a mapped label the repo lacks is named on this line |
| assignee | the owner of the work is assigned |
| reviewer | only under `human-approves`: the `CODEOWNERS` owners are requested, or the gap is named. Under `auto` and `manual` the line is left out |
| tracker link | when the work has an issue key, the body links `{{ATLASSIAN_URL}}/browse/<ISSUE-KEY>`; with no key the line is left out |
| title | a conventional-commit title under 70 characters (`conventional-commits.md`) |

Name every unmet precondition in its own line. "Ready except X" tells the reader what is left. "Ready" with X open is false.

## 6. PR announcement

git-flow-master owns the announcement template. It posts automatically, once, when the PR opens (after sections 1 to 3), and once more as a reply in the same thread when the PR merges. Before the open post, search for an existing post with this PR's URL: when one exists, reply in its thread instead of posting a second top-level message.

```text
*<one-line title>*
<PR URL>
Ticket: {{ATLASSIAN_URL}}/browse/<ISSUE-KEY>
Evidence: <verdict> at depth <depth>
Reviewers: <@mentions>
```

| Line | When |
|---|---|
| title, PR URL | always |
| ticket | only when the work has an issue key |
| evidence | always: the verdict and depth from the record (`bun run edd render --pr`, or the CI verifier's PR comment) |
| reviewers | only under `human-approves`, the logins from section 1 resolved to messenger handles |
| merge reply | `Merged into <base> as <short merge sha>` |

The post goes where `notify.provider` in `.agents/project.yaml` points; `none` posts nothing. A provider with no sender of its own in this repo sends through the Slack connector the harness exposes, signed in as the owner. The message reads as the owner's own post, with no "sent by AI" line or any other attribution.

Every other message to a person (a question, a reply in a thread, a heads-up) is a Slack draft the owner reviews and sends: `.agents/skills/edd/references/waiting.md` "Messages to people".

## 7. Close-out

On `WATCH ENDED: ... MERGED ...`:

```bash
gh pr view <n> --json state,mergeCommit,baseRefName
git fetch origin --prune
git merge-base --is-ancestor <mergeCommit.oid> origin/<baseRefName>   # exit 0: the merge is on the base
```

- A non-zero exit is a discrepancy: report it with both shas.
- Restore the tab title you noted in section 3 (under Orca, pass `--title` with the noted title, because omitting it resets to the auto-generated one).
- Post the merge reply of section 6.
- Leave the user's local branch where it is: the checkout may be shared (`session-safety.md`).
- Delete the merged local branch with `git branch -d <branch>` only when `git worktree list --porcelain` shows it checked out nowhere. Never delete the remote branch here (human gate 2).

On `WATCH ENDED: ... CLOSED ...`: report that the PR closed unmerged, restore the tab title, and do nothing else.

A promotion PR into the production branch hands off to `/test-documentation` for the post-promotion pass after the merge: see `SKILL.md` "Hand-offs to other skills".

## With nobody at the keyboard

A worker, a routine or a cloud session runs this loop exactly as an attended session does. An item on the human-gates list goes to the launcher as a question with options and a recommendation, and only that PR waits; other work continues.
