# Git Worktrees — Isolated Parallel Work (manual + Claude Code harness)

A **worktree** is a second working directory wired to the **same `.git`**. Git normally
gives you one working tree; with worktrees you get several — each with its **own
checked-out branch, its own files, and its own index** — while they all share one object
database (commits, blobs, refs).

```
~/proj/                       <- primary worktree   (branch A — e.g. feature-in-progress)
   .git/  <------ one shared object store ------+
   src/ ...                                     |
                                                |
~/proj-hotfix/                <- linked worktree (branch B — e.g. hotfix)   ---+
   src/ ...                                                                    |
                                                                              -+
```

Committing in one worktree never touches another worktree's files. A branch can be
checked out in **only one** worktree at a time (git enforces this), which is exactly what
makes worktrees safe for **parallel sessions** — including multiple AI agents working
locally at once.

---

## When to use a worktree

- **Parallel AI sessions** — two agents (or an agent + a human) working the repo at once,
  each on its own branch, without stepping on each other's files.
- **Isolate risky / unrelated WIP** — you have important uncommitted work on branch A and
  want to build something unrelated (branch B) without polluting A's working tree or
  risking an accidental `git add` mixing the two.
- **Hotfix while a feature is open** — patch `main` in a clean tree without stashing or
  disturbing the half-done feature.
- **Review a PR branch** — check out someone's branch in a separate tree without
  disrupting your own.

### When NOT to bother

- A simple branch switch on a clean tree → just `git switch`/`git checkout -b`.
- One short linear task → a normal branch is enough; a worktree is overhead.

---

## Approach A — Manual git (portable, works with any tool or agent)

This is plain git. It works the same in any terminal, any editor, any coding agent.

```bash
# inspect
git worktree list                                   # show every worktree + its branch

# create: new directory + NEW branch, based on a ref
git worktree add ../proj-feature -b feat/x main     # branch feat/x from main, in ../proj-feature
git worktree add ../proj-hotfix hotfix/y            # check out an EXISTING branch hotfix/y

# work — both directories live simultaneously
cd ../proj-feature
#   ...edit / commit normally...
git add -p && git commit -m "feat: x"
git push -u origin feat/x
cd ../proj                                          # hop back to the primary tree any time

# clean up after the branch is merged
git worktree remove ../proj-feature                 # delete the dir (refuses if uncommitted; --force overrides)
git branch -d feat/x                                # delete the branch once merged
git worktree prune                                  # drop stale registrations (if a dir was rm'd by hand)

# extras
git worktree lock ../proj-feature "reason"          # protect from prune (e.g. dir on external/removable disk)
git worktree unlock ../proj-feature
git worktree move ../proj-feature ../proj-feature2  # relocate a worktree
```

**Golden rules**

- Same branch in two worktrees → **git blocks it**. Give every worktree its own branch.
- `git worktree remove` **refuses** when there are uncommitted changes → commit (or
  `--force` to discard).
- Deleting a worktree directory with `rm -rf` leaves a stale registration → run
  `git worktree prune` afterward.
- A worktree's `HEAD`, index, and stash-vs-tree are independent; **the stash list and
  config are shared** (see Multi-session safety).

---

## Approach B — Claude Code harness (`EnterWorktree` / `ExitWorktree`)

> **Claude-Code-specific.** `EnterWorktree`/`ExitWorktree` are native **Claude Code**
> tools that orchestrate `git worktree` *and move the agent's session into it*. Other
> coding agents (Cursor, Copilot, Codex, Aider, …) do **not** have these — there, use
> **Approach A** (manual git) or that tool's own equivalent. The underlying git mechanics
> are identical regardless.

**`EnterWorktree`** — creates a worktree under `.claude/worktrees/<name>/` on a new
branch and switches the session's working directory into it.

- Base ref is governed by the `worktree.baseRef` setting:
  - `fresh` (default) → branch from `origin/<default-branch>` (clean, independent of local WIP).
  - `head` → branch from your current local `HEAD` (carries your current branch's commits).
- Params: `name` (create a new worktree) **or** `path` (enter an existing one already made
  with `git worktree add`).

**`ExitWorktree`** — returns the session to the original directory.

- `action: "keep"` — leave the worktree + branch on disk (come back later / preserve work).
- `action: "remove"` — delete the worktree dir **and** its branch. With uncommitted files
  or unmerged commits it **refuses** unless `discard_changes: true`.
- Only operates on worktrees **this session** created via `EnterWorktree` — it will not
  touch one you made by hand (`git worktree add`).

**Subagents** — the `Agent` tool (and workflow agents) accept `isolation: "worktree"`,
which runs each subagent in its own temporary, auto-cleaned worktree. Use that only when
parallel subagents mutate files and would otherwise collide — not to isolate a whole
session.

### Manual vs harness at a glance

| | `git worktree` (manual) | `EnterWorktree` (Claude Code) |
| --- | --- | --- |
| Portability | any tool / agent | Claude Code only |
| Directory location | anywhere you choose (`../dir`) | fixed under `.claude/worktrees/` |
| Base ref | whatever you pass | setting: `fresh`=origin/default or `head` |
| Moves the agent's session | no (you `cd`) | yes, automatically |
| Cleanup | manual (`remove`/`prune`) | `ExitWorktree remove` |
| Branch naming | you choose | derived from the name (rename with `git branch -m`) |

---

## The untracked-files gotcha (applies to BOTH approaches)

A brand-new worktree starts with **only the tracked files of its base ref**. Files that
are **untracked** in your current tree (new, never `git add`ed) live physically in the
*current* directory — they **do not teleport** into the new worktree.

To bring untracked WIP into a fresh worktree, **move it**:

```bash
mv ./cli/new-feature  ../proj-feature/cli/new-feature   # untracked files: just move them
# or: commit them on a branch first, then create the worktree from that branch
```

**Do not move a tracked path by accident.** If you `mv` a directory that contains
tracked files, git sees them as deleted in the source tree. Restore with:

```bash
git checkout -- path/to/tracked-file        # bring a tracked file back into the source tree
```

---

## Multi-session safety (no collisions between parallel agents)

Rule of thumb: **one session = one worktree = one branch.**

| Shared across worktrees (safe) | Isolated per worktree |
| --- | --- |
| `.git/objects` (commits/blobs — append-only, no overwrite) | working directory (files) |
| refs, config, hooks, **stash list** | index / staging area |
| | checked-out branch (duplicate checkout blocked by git) |

- Two sessions never edit the same physical file or the same branch → they cannot clobber
  each other's work.
- **Stash is global to the repo.** Do not rely on `git stash` to hand work between
  sessions — commit to your branch instead.
- **Runtime, not git:** if both sessions run a local server / dev process, give each a
  **distinct port** (or rely on port auto-fallback). Git isolation does not isolate
  network ports, temp files, or databases.
- **Worktree nested inside the repo** (e.g. Claude Code's `.claude/worktrees/`): the parent
  repo may show it as untracked. Hide it **locally** without a tracked commit by adding the
  path to the shared exclude file:

  ```bash
  echo '.claude/worktrees/' >> "$(git rev-parse --git-common-dir)/info/exclude"
  ```

  `info/exclude` lives in the shared git-common dir (one copy for all worktrees) and is
  never committed — so it cannot leak into another branch's history.

---

## Cleanup checklist

- [ ] Branch's work is committed and pushed (or deliberately discarded).
- [ ] `git worktree remove <path>` (or `ExitWorktree remove`) — succeeds only when clean.
- [ ] `git branch -d <branch>` once the branch is merged.
- [ ] `git worktree prune` if any directory was removed by hand.
- [ ] Local `info/exclude` entries cleaned up if the worktree path is gone for good.

---

## Decision guide

| Situation | Do this |
| --- | --- |
| Clean tree, one linear task | Just a branch (`git switch -c`) — no worktree |
| Risky WIP on current branch, need to build something unrelated | Worktree on a new branch |
| Two AI sessions in parallel | One worktree + one branch **each** |
| Claude Code, want the session moved for you | `EnterWorktree` (base `fresh` for independence) |
| Any other agent / portable script | `git worktree add … -b …` (Approach A) |
| Parallel subagents mutating files | `Agent`/workflow `isolation: "worktree"` |

---

## AI working pattern (this repo)

When an AI session needs isolation from in-progress work on another branch:

1. Prefer `EnterWorktree` (Claude Code) with base `fresh` so the new branch is independent
   of the current branch's local WIP; rename the branch to convention (`git branch -m feat/<slug>`).
2. **Move** any untracked WIP into the worktree (it will not be there automatically).
3. Keep the primary repo's `git status` **clean** — verify with `git -C <primary> status`.
4. Hide the nested worktree from the primary tree via local `info/exclude`.
5. Do all further work (edits, verifies, commits) in the worktree; the other branch stays
   untouched.
6. On completion, commit on the worktree's branch → open its own PR → `ExitWorktree`
   (`keep` to preserve, `remove` when merged/abandoned).
