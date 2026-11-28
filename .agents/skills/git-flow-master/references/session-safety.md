# Session safety in a shared checkout

Several sessions can run in one checkout at once: the owner in an editor, an author session, a tester subagent, a worker. Git keeps one HEAD and one index per checkout, and every session that runs git there writes to both. This file covers the three habits that keep one session from committing, rewinding or misreading another session's work. A linked worktree per session (`worktrees.md`) removes most of the risk; these habits still apply inside a worktree that more than one session uses.

## 1. Four commands that stage or rewrite more than they seem to

| Command | What it really touches | Habit |
|---|---|---|
| `git commit --amend`, `git rebase` | HEAD, which is whoever committed last in this checkout, not necessarily your commit | before either, compare `git rev-parse HEAD` with the sha your own commit printed. A pushed commit is never amended or rebased (human gate 2 in `.agents/skills/edd/references/human-gates.md`) |
| `git rm`, `git mv` | the index: the deletion or rename stays staged until the next commit, which may be anyone's | commit it in the same step, with a pathspec |
| `git add <path>` | the whole file at that path. An explicit path keeps foreign files out, never a foreign edit inside a file two sessions share | before staging a shared file (`AGENTS.md`, `package.json`, a skill), read `git diff -- <path>` and confirm every hunk is yours |
| the pre-commit hook | `lint-staged` (the `lint-staged` block in `package.json`) rewrites staged files with its fixers and may use `git stash` while it runs | stage and commit back to back, so no other session's work sits staged when the hook runs |

The rule that covers all four: stage explicit paths only, and commit with a pathspec right after staging.

```bash
git add -- <path> <path>
git commit -F <message-file> -- <path> <path>
```

`git commit -- <paths>` commits exactly those paths, even when another session left something else staged. Stage with explicit paths every time: `git add .`, `git add -A` and `git commit -a` take every session's work.

## 2. Cut a branch from the remote base, without switching first

```bash
git fetch origin --prune                   # updates origin/<base>; touches no file
git switch -c <prefix>/<slug> origin/<base>
```

The base comes from the strategy table in `SKILL.md` §3.1 ("Source branch by strategy"); the name from `git_strategy.branch_prefixes` in `.agents/project.yaml`.

Switching to the local base first (`git switch <base>`, `git pull`, then `git switch -c`) costs two full tree movements when the local base is stale: the first rewinds the working tree to the old commit, and the pull replays every commit since. Every session in the checkout sees its files change under it twice. Naming `origin/<base>` makes the local base irrelevant.

Uncommitted work travels with the switch: tracked edits and untracked files live in the working tree, not in a branch. When git cannot carry a change because the target commit has a different version of that file, it aborts with "Your local changes would be overwritten" and changes nothing. It never overwrites silently, so an abort is a collision to resolve, never a reason to discard.

The same rule holds for a new worktree: `git worktree add <path> origin/<base>`, because without a ref it starts from the current HEAD.

## 3. One gh account, checked before the first gh call

Before the first `gh` call of the session (push, `pr create`, `pr view`, `api`, anything), list the accounts `gh` holds for the host:

```bash
gh auth status --hostname github.com 2>&1 | grep 'Logged in to'   # one line per account
```

Exactly one logged-in account should be able to see the repo. With more, switch to the right one and re-check before trusting any not-found: the active account can change between calls (another session, or the harness, runs `gh auth switch`), and then a 404, or "Could not resolve to a Repository with the name", means the wrong account is active, not that the PR or branch is missing.

1. `gh auth switch --hostname github.com --user <account>`, with the account that can see the repo.
2. Re-check: `gh repo view <owner/name> --json name` succeeds.
3. Retry the call that failed.

Run the same check before you conclude that any PR, branch or run is missing. A not-found that survives the switch and the re-check is a real result; one reported before it is a guess.
