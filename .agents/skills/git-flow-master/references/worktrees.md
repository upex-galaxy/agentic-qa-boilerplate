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

## Approach C — Orchestrated worktree (managed by the orchestration layer)

When several agent sessions are being coordinated — a conductor plus N workers — the worktrees are created and destroyed by the orchestration layer instead of by hand, one per worker, outside the repo. The mechanics (create, provision, launch a session into it, remove) belong to `orca-orchestration/SKILL.md`; from git's point of view it is still an ordinary linked worktree, so everything else in this file applies unchanged. Write the calls as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode and load that skill for the HOW. Topology choice per activity: `orca-orchestration/references/topologies.md`.

The distinction that matters here: an orchestrated worktree is **visible to the owner** (board card, managed terminal, phone) and outlives the session that made it, while a harness worktree lives inside the repo and is invisible outside the session that created it.

Launching a session into that worktree can go through the native path (supervised — the orchestrator recognizes the session and can address it directly) or the custom-argv path (never supervised, the default fallback); from git's point of view the worktree itself is identical either way.

### Manual vs harness vs orchestrated at a glance

| | `git worktree` (manual) | `EnterWorktree` (Claude Code) | Orchestrated (Approach C) |
| --- | --- | --- | --- |
| Portability | any tool / agent | Claude Code only | any agent, but needs the orchestration app + binary on the machine |
| Directory location | anywhere you choose (`../dir`) | fixed under `.claude/worktrees/` | the orchestrator's own workspace dir, outside the repo |
| Base ref | whatever you pass | setting: `fresh`=origin/default or `head` | the base you pass at create time — **verify the new HEAD against `origin/<base>`**, it resolves local refs |
| Moves the agent's session | no (you `cd`) | yes, automatically | no — it creates the tree, then a session is launched INTO it |
| Cleanup | manual (`remove`/`prune`) | `ExitWorktree remove` | orchestrated removal + `git worktree prune`, always after the orphan audit below |
| Branch naming | you choose | derived from the name (rename with `git branch -m`) | you choose at create time |
| Owner can see it (board / phone) | no | no | yes |

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

## Provisioning: what a fresh worktree does NOT have (all approaches)

Untracked files are only half of it. Everything **gitignored** is missing too, and that half fails in ways that point at the wrong cause: no `.env` means the MCP servers do not parse (they reference `${VAR}`) and any login script has no credentials; no `node_modules/` reports `Cannot find module`; a missing `.claude/skills` alias makes every Claude Code skill invocation an `Unknown skill`; a missing `.context/PBI/` cache fails **silently** — the session simply cannot see the synced ticket.

```bash
bun run worktree:provision          # in the new worktree: .env, deps, the skills alias, community skills, .auth/
bun run context:hydrate             # rebuild the Jira cache (needs credentials, so run it after the above)
```

`.session/` is deliberately NOT provisioned: a plan, brief, or roster written inside a worktree dies with it. Keep those in the primary checkout and cite them by **absolute** path. Full gap table and how to wire provisioning as an orchestration setup hook: `orca-orchestration/references/provisioning.md`.

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

## Orphan audit — run BEFORE removing any worktree

Removing a worktree deletes its directory, and **gitignored files are not in git**: `.env`, `.auth/`, captured evidence and screenshots, local reports, anything under `.session/`. A clean `git status` says nothing about them — it is exactly the state in which they look safe to delete.

```bash
git -C <worktree> status --porcelain            # tracked work: must be committed AND pushed
git -C <worktree> log --oneline origin/<base>.. # commits that exist only here
git -C <worktree> status --porcelain --ignored   # THE audit: every ignored/untracked file about to die
```

For each survivor in that last list, decide once: **copy it out** to the primary checkout (evidence, reports, anything a Jira comment or an ATR already references), or accept the loss deliberately (`node_modules/`, caches, a `.env` that is just a copy). A durable document belongs in the primary checkout or in the tracker, never only in a worktree. Only then remove the worktree.

---

## Cleanup checklist

- [ ] Orphan audit ran (`--ignored`) and every file worth keeping was copied to the primary checkout.
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
| A coordinated fleet of worker sessions the owner wants to watch and steer | Orchestrated worktree per worker (Approach C) — `orca-orchestration/SKILL.md` |
| Several sessions that only read code and write to the tracker (manual QA, AC refinement) | **No worktree** — same checkout. The isolation they need is a browser profile and a session dir, not a second tree |

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
