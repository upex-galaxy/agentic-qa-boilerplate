# The observer: Merge Line

> Loaded by: anyone reading, operating, repairing or changing Merge Line. The collector and the view
> live in `cli/sprint-board/` (`merge-collect.ts`, `merge-build.ts`, `merge.ts`, `merge-read.ts`,
> `app/merge-view.ts`); the board around them is owned by `sprint-testing/references/sprint-board.md`.

## 1 · What it is

**Merge Line** is the `#merge` view of the Sprint Board (`bun run board:up`, then key `9`). It shows
every pull request headed for the mainline (`git_strategy.branches.production`) or for an
integration trunk, which session owns each one, and what each one is waiting for, in the board's own
pieces: a bottom line, four tiles (Needs you, Waiting on others, Blocked, Ready to merge), lanes of PR
cards, the interlocking strip, a drawer per PR, and a rail with the suggested order, the interference
between PRs and what merged into the mainline since the day began.

The **collector** is the part that reads: `cli/sprint-board/merge-collect.ts`, which the board
server runs every 90 seconds. It is plain code, so a reading costs zero model tokens, and a GitHub
`304` costs no REST quota. GitHub is the only code host it reads.

## 2 · The observer rule

It never acts on GitHub: no merge, approval, review comment, label, assignment, close, reopen, push
or webhook. It reads only (`gh api` GET, `git ls-remote`, `git fetch`, `git merge-tree`, the
orchestrator's `worktree list` / `terminal list`, the board's own `source.json`) and writes only
`.session/gitflow-master/`. It never switches a branch, stages or commits, which is why it can run
against the primary checkout while other sessions work there. Tracker drift is shown, never fixed:
the PR's drawer names who fixes it. The interactive work of this skill (merges and pushes, with the
owner's yes) is a different persona.

## 3 · How it works

```
bun run board:up  ->  board server (127.0.0.1:4477)
                        every 90 s: merge-collect.ts  (one at a time, 5 min cap)
                          git ls-remote; git fetch only when refs moved; gh api with ETags;
                          git merge-tree per pair; orchestrator worktree/terminal list; the board's source.json
                          merge-build.ts (pure) -> .session/gitflow-master/docs/meta/*.json, docs/prs/<n>.json
                          -> .session/gitflow-master/collector.json  (the loop's own status)
                        /api/merge  -> merge-read.ts reads those files
                        SSE "changed" when they change -> the page re-renders the view
page: merge.ts derives lanes, the why, the order and the freshness (pure, tested)
```

**Lanes** (`laneOf`, first match wins): Blocked (checks failing, changes requested, a textual
conflict with its base); Needs you (your review requested, review findings unanswered, nobody asked
to review a PR into the mainline, no session holds it); Waiting (checks or review running, a reviewer
asked, not reviewed at this commit); Ready (all three signals green; a conflict with another open PR
is named on the card). **Order** (`suggestOrder`): Ready, then Waiting, then Needs you, then
Blocked; within a lane, more signals cleared first, then the one that conflicts with more PRs, then
the smaller. Feeders (PRs into a trunk) are listed but not ordered into the mainline.

**Approval** is computed from people (requested reviewers, reviews, `review_requested` events),
never from GitHub's `reviewDecision`, against `git_strategy.policy.require_pr_reviews`.

**Tracker parity**: a ticket named in a PR's branch or title (by `board.ticket_key_pattern`) is
looked up in the board's last tracker read, so the collector makes no tracker call every 90 s. An
open PR into the mainline is out of step when its ticket sits in the `tested` or `dropped` bucket
(code still landing on a ticket QA closed). A ticket only mentioned in the description is listed
without an expectation, because a trunk PR's description names every ticket it carries.

**Freshness** is known, not guessed: the server writes `collector.json` after each run. The view
shows `GitHub read 40s ago` (green), `GitHub read late` (amber, two missed runs), or `Not updating`
with the collector's last line and the command that fixes it.

**Judgment on demand.** The rules above replace the model. When the owner wants a written note on a
PR (why it is stuck, a deadline found in a comment), any session writes
`.session/gitflow-master/notes/<n>.json` as `{"held": {"en": "...", "es": "..."}, "deadline":
{"date", "by", "url", "quote"} | null, "at": "<iso>"}`. The drawer shows it; deleting the file
removes it.

## 4 · The collector

| Invocation | Writes |
|---|---|
| `bun cli/sprint-board/merge-collect.ts --preflight` | nothing: checks `gh` (one account, the repository readable), the orchestrator, the board config, the state directory |
| `bun cli/sprint-board/merge-collect.ts [--boot\|--close] --reason <text>` | `docs/**`, `snapshot.json`, `plan.json`; last line `COLLECT ok\|degraded <src>\|fail <why>` (exit 0, 3, 2). A degraded run keeps the last good `docs/**` and `snapshot.json`, refreshes only `meta/state` and writes its reading to `snapshot.degraded.json` |
| `--record <dir>` | also the raw reading into `<dir>/reading.json` |
| `MERGE_FIXTURE_DIR=<dir>` | builds offline from `<dir>/reading.json` (`MERGE_FIXTURE_DEGRADED=<src>` replays it as degraded, tests only) |

The server passes `--boot` on the first run of a new day (it resets the day's list of merges). The
repository comes from `origin`, the mainline, approvals, timezone and ticket key from
`.agents/project.yaml`, the orchestrator from `orchestration.orchestrator_cli` (empty = owners come
from worktrees and PR authors only).

## 5 · State: `.session/gitflow-master/`

`docs/` (the documents the view reads), `notes/` (optional judgment), `collector.json` (the loop),
`snapshot.json` and `snapshot.prev.json` (for carry-over: owner `since`, alert `since`),
`plan.json`, `raw/` (the last reading), `cache/` (ETags, file lists by head SHA, the viewer's GitHub
login for a day), `collect.log`. Gitignored like all of `.session/`.

## 6 · Operating it

- **See it**: `bun run board:up`, then `#merge` or key `9`. `serve --merge-every <s>` changes the
  cadence; `0` turns the loop off.
- **Force a reading**: `bun cli/sprint-board/merge-collect.ts --reason owner`. The page updates
  within a second.
- **Check it without touching anything real**: in the boilerplate's own checkout, the
  sprint-board merge unit tests replay a recorded reading (no network).
- **When it says Not updating**: read the collector line it shows. `COLLECT fail ...` names what
  failed; `degraded github` or `git` means the network or GitHub; no line at all means the board
  server is not running.

## 7 · Why it is not a hosted page

A page that only a model session can keep current costs money every day just to stay fresh, works
with one harness only, and depends on that session staying alive, while the same facts read locally
cost nothing and refresh every 90 seconds. If a phone view is ever needed, a snapshot of this view
published as an artifact is the path, as the Sprint Board already does with `snapshot --mode report`.

## 8 · Gotchas

- Exactly one `gh` account should be visible, or the active one can drift between runs; pin it with
  `GH_CONFIG_DIR` when several are logged in. The preflight warns.
- `gh pr view --json files` stops at 100 files. File lists come from
  `gh api .../pulls/<n>/files --paginate`, cached by head SHA.
- `reviewDecision` is not a gate: it can read empty or `REVIEW_REQUIRED` against what the reviews
  say. Approval is computed from people (§3).
- A ticket counts for tracker parity only when the branch or the title names it (§3).
- Terminal handles change across restarts. A session is identified by its worktree; a shared
  checkout lists many terminals, so the card names only those whose title names the PR, or the first
  two.
- A worktree moves on from a branch while its terminal keeps the old name. Hence the owner join:
  checkout, then terminal title, then the last owner seen (7 days), then bot or none.
- The board server runs the collector from its own checkout, so that checkout must be on a branch
  that has `cli/sprint-board/merge-collect.ts`. When it does not, the loop never starts and the view
  says no collector loop is running.
