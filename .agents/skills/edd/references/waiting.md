# Waiting and review

Waiting is part of delivery. A session that opened a PR owns that PR until it merges or closes, and it waits without spending model tokens: a shell watcher polls GitHub, and the session sleeps on a blocking `wake` call that returns only when something changed. Each session owns its own waits; no session watches another session's PR.

## The PR watcher

The watcher is bundled in this skill, so a clone, a CI runner and a cloud session have it with no install. It needs `bash` (3.2 or newer), `gh` and `jq`. State lives under `~/.edd-watch/` (override with `EDD_WATCH_HOME`), outside the repository.

```bash
W=.agents/skills/edd/scripts/pr-watch.sh
bash $W start pr-delivery <repo>-pr-<n> REPO=<owner/name> PR=<n>
bash $W wake <repo>-pr-<n>   # as a background shell call; it returns when something changed
```

State is machine-wide, so the watch name carries the repository as well as the PR number; `start` refuses a name already used with another `REPO` or `PR`. A watch that ended stays ended: a reopened PR gets a new name (`<repo>-pr-<n>-2`).

Arm it right after `gh pr merge --auto` (or right after opening the PR under `manual`). When `wake` returns, read the events, act, and arm `wake` again at once. A late re-arm loses nothing, because the watcher keeps logging while nobody waits.

| Event line | Means | Act |
|---|---|---|
| `CHECK <workflow>/<name> <conclusion> on <head>` | a check finished on that head commit | on a failure: fix, re-attest if the diff changed, push |
| `MERGE STATE <value>` | GitHub's mergeability moved (`BEHIND`, `DIRTY`, `BLOCKED`, `CLEAN`) | `DIRTY`: merge the base in |
| `AUTO-MERGE off` | auto-merge was disabled (a conflict, or a push by someone without permission) | `verify --merge`, then re-enable |
| `HEAD moved <sha>` | a new head commit, yours or someone else's | someone else's: read it first |
| `REVIEW <login> <state>`, `PR COMMENT`, `INLINE COMMENT` | a review or a comment, edits included, from anyone: bots, people, and your own login too, because the agent often shares the owner's account. `IGNORE=<login>` skips one login when the agent has its own | answer, or run the review-bot loop |
| `REVIEW DECISION <value>` | the PR's review decision changed | |
| `WATCH ENDED: ... MERGED ...` or `... CLOSED ...` | the last event: the watcher stopped itself | merged: confirm the merge commit is on the base, clear the tab label. Closed: report it |
| `WATCH STOPPED on request` | someone ran `stop`; the watch is ended and stays ended | nothing to re-arm |
| `WATCH WARNING`, `WATCH DEAD`, `WATCH STALE` | polling fails, or the watcher died or froze | `gh auth status`; `start` with the same name restarts it and reports what changed meanwhile |

`wake` exits 0 with events, 2 when a watcher is dead or stale, and 3 when every watch it was given has ended. Exit 3 means there is nothing to re-arm.

Other commands: `status [name]` (alive, last poll, events logged and consumed), `log <name> [n]` (read without consuming), `stop <name>` (end a watch before its PR does; the owner decides that, and the watch stays ended). After a resume, a handoff or any doubt, run `status` first: a watch from an earlier session may still be running, with events waiting.

Cost: three `gh` calls per poll. At the default 120 s that is about 90 calls an hour per PR, so ten PRs in parallel stay well under GitHub's 5000 an hour.

## Tab label

A person scanning terminals should see which session owns which PR. On arm, note the current tab title in your working notes and prefix it with `PR#<n>`; on the last event, set the noted title back.

| Where the session runs | Label | Unlabel |
|---|---|---|
| under Orca | `orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "PR#<n> <previous title>"`, plus `orca reference add <pr-url> --worktree current` so a coordinator finds the session by its PR | `orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<previous title>"`; without `--title` Orca resets to its auto-generated title, which drops a custom label |
| any other terminal | `printf '\033]0;%s\007' "PR#<n> <title>" > /dev/tty` when `/dev/tty` exists; a harness that captures the shell's output never shows a title written to stdout. Best effort: terminals differ | the same escape with the noted title |

The session labels itself; nothing needs an orchestrator. A label that fails is a warning, never a stop.

## The author never reviews its own evidence

| Rule | Enforced by |
|---|---|
| at depth `standard` or deeper, the agentic verdict comes from a session other than the author | the CI verifier compares each `verdict_by` with the `Session:` trailer of the code commits |
| the author reading its own evidence is not a review | it is never recorded as one |
| under `human-approves`, the approval is a person's | GitHub: an author cannot approve their own PR |

With no orchestrator, the author meets the first rule by dispatching a subagent as the tester: fresh context, the change and the contract only. A subagent inherits the parent's identity, so the tester declares a label of its own, such as `<author label>/tester`, and that label is what `bun run edd attest` records as `verdict_by`. It is self-declared: the check catches an honest mix-up, not a lie. Under an orchestrator, the tester can be another session.

## Optional reviewer session

A project that wants a second agent to read the evidence, with no person, has the author's launcher start a reviewer session (or a read-only subagent) with the PR URL and the record only. The reviewer reads the artifacts, may re-run a sample, and posts a PR comment that starts with `EDD-REVIEW: pass <digest>` or `EDD-REVIEW: fail <digest>`. It arms its own watcher only when it waits on something, such as a re-push. It posts with the same GitHub account as the author, so the host cannot tell them apart: its verdict is recorded, not enforced. The enforced independent reviewers are a review bot (`evidence.review.bot`) and a person.

## Waiting on a person

Some waits are for a human answer, not a PR event: a question to the tech lead, a confirmation from a teammate. Waiting must not depend on the owner watching the chat.

- The wait goes through the Slack connector (the MCP server the harness exposes, signed in as the owner), because only the owner's own account can read their direct messages. A bot cannot.
- A subagent on the harness's cheapest model polls the conversation through the connector and wakes the main session when the person answers, with the answer. The main session keeps working meanwhile. In Claude Code that is a background subagent with the smallest model; other harnesses have their own equivalent.
- A project that already runs a Slack bot may use `slack api` with the bot's token instead, for channels the bot can read.
- Each session owns its own waits, exactly as it owns its PR watcher.

## Messages to people

| Message | How it goes out |
|---|---|
| PR announcement (opened, merged) | posted automatically from the announcement template that the repo's git skill owns, through `notify.provider` in `.agents/project.yaml`; `none` posts nothing |
| anything else to a person: a question, a reply in a thread, a heads-up | written as a Slack draft through the connector's draft tool; the owner reviews, edits and sends it |

A draft shows up in Slack as pending, which doubles as the notice that something waits for the owner. The agent never sends those messages itself, because its wording may not be how the owner talks to that person.
