# Git worktrees: isolated parallel work (manual and Claude Code harness)

A **worktree** is a second working directory wired to the same `.git`. Each worktree has its own checked-out branch, its own files and its own index, and all of them share one object database (commits, blobs, refs).

```
~/proj/                       <- primary worktree   (branch A — e.g. feature-in-progress)
   .git/  <------ one shared object store ------+
   src/ ...                                     |
                                                |
~/proj-hotfix/                <- linked worktree (branch B — e.g. hotfix)   ---+
   src/ ...                                                                    |
                                                                              -+
```

Committing in one worktree never touches another worktree's files. Git allows a branch in only one worktree at a time, which is what makes worktrees safe for parallel sessions, including several AI agents working locally at once.

---

## When to use a worktree

- Parallel AI sessions: two agents, or an agent and a human, work the repo at once, each on its own branch.
- Risky or unrelated work in progress: you have uncommitted work on branch A and want to build something unrelated (branch B) without an accidental `git add` mixing the two.
- A hotfix while a feature is open: patch `main` in a clean tree without stashing or disturbing the half-done feature.
- Reviewing a PR branch: check out someone's branch in a separate tree and keep your own undisturbed.

A simple branch switch on a clean tree needs only `git switch` or `git checkout -b`. One short linear task needs only a normal branch, because a worktree is overhead there.

---

## Approach A: manual git (portable, works with any tool or agent)

Plain git behaves the same in any terminal, editor or coding agent.

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

Golden rules:

- Git blocks the same branch in two worktrees, so give every worktree its own branch.
- `git worktree remove` refuses when there are uncommitted changes. Commit first; `--force` discards them.
- Deleting a worktree directory with `rm -rf` leaves a stale registration, so run `git worktree prune` afterward.
- A worktree's `HEAD` and index are independent. The stash list and config are shared (see Multi-session safety).

---

## Approach B: Claude Code harness (`EnterWorktree` / `ExitWorktree`)

`EnterWorktree` and `ExitWorktree` are native Claude Code tools that run `git worktree` and move the agent's session into it. Other coding agents (Cursor, Copilot, Codex, Aider and so on) do not have them. There, use Approach A or that tool's own equivalent. The git mechanics underneath are the same.

**`EnterWorktree`** creates a worktree under `.claude/worktrees/<name>/` on a new branch and switches the session's working directory into it.

- The `worktree.baseRef` setting picks the base ref:
  - `fresh` (default) branches from `origin/<default-branch>`, clean and independent of local WIP.
  - `head` branches from your current local `HEAD` and carries your current branch's commits.
- Params: `name` creates a new worktree, `path` enters an existing one made with `git worktree add`.

**`ExitWorktree`** returns the session to the original directory.

- `action: "keep"` leaves the worktree and branch on disk, to come back later or preserve work.
- `action: "remove"` deletes the worktree dir and its branch. With uncommitted files or unmerged commits it refuses unless `discard_changes: true`.
- It works only on worktrees this session created with `EnterWorktree`, and leaves one you made by hand (`git worktree add`) alone.

**Subagents.** The `Agent` tool and workflow agents accept `isolation: "worktree"`, which runs each subagent in its own temporary, auto-cleaned worktree. Use it when parallel subagents mutate files and would otherwise collide, and use another approach to isolate a whole session.

## Approach C: orchestrated worktree (managed by the orchestration layer)

When several agent sessions are coordinated (a conductor plus N workers), the orchestration layer creates and destroys the worktrees, one per worker, outside the repo. The mechanics (create, provision, launch a session into it, remove) belong to `/agent-orchestration`. To git it is an ordinary linked worktree, so everything else in this file applies unchanged. Write the calls as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode and load that skill for the how. Topology choice per activity: `agentic-qa-core/references/fleet-launch-seam.md` §5.

An orchestrated worktree is visible to the owner (board card, managed terminal, phone) and outlives the session that made it. A harness worktree lives inside the repo and is invisible outside the session that created it.

A session can be launched into that worktree through the native path (supervised: the orchestrator recognizes the session and can address it directly) or through the custom-argv path (never supervised, the default fallback). The worktree is the same either way.

### Manual vs harness vs orchestrated at a glance

| | `git worktree` (manual) | `EnterWorktree` (Claude Code) | Orchestrated (Approach C) |
| --- | --- | --- | --- |
| Portability | any tool / agent | Claude Code only | any agent, but needs the orchestration app + binary on the machine |
| Directory location | anywhere you choose (`../dir`) | fixed under `.claude/worktrees/` | the orchestrator's own workspace dir, outside the repo |
| Base ref | whatever you pass | setting: `fresh`=origin/default or `head` | the base you pass at create time — **verify the new HEAD against `origin/<base>`**, it resolves local refs |
| Moves the agent's session | no (you `cd`) | yes, automatically | no — it creates the tree, then a session is launched INTO it |
| Cleanup | `bun run worktree:audit` then `remove`/`prune` | `bun run worktree:audit` then `ExitWorktree remove` | orchestrated removal (the committed `orca.yaml` archive hook runs the audit) + `git worktree prune` |
| Branch naming | you choose | derived from the name (rename with `git branch -m`) | you choose at create time |
| Owner can see it (board / phone) | no | no | yes |

---

## The untracked-files gotcha (applies to every approach)

A new worktree starts with only the tracked files of its base ref. Files that are untracked in your current tree (new, never `git add`ed) live in the current directory and do not follow you into the new worktree.

To bring untracked work in progress into a fresh worktree, move it:

```bash
mv ./cli/new-feature  ../proj-feature/cli/new-feature   # untracked files: just move them
# or: commit them on a branch first, then create the worktree from that branch
```

Moving a directory that contains tracked files makes git see them as deleted in the source tree. Move only untracked paths, and if a tracked file went along, restore it:

```bash
git checkout -- path/to/tracked-file        # bring a tracked file back into the source tree
```

---

## Provisioning: what a fresh worktree does NOT have (all approaches)

Untracked files are half of it. Everything gitignored is missing too, and that half fails in ways that point at the wrong cause:

- No `.env`: every MCP server's `.env` loader finds nothing to hand over, so the server starts with empty values and dies on its first authenticated call, with an error that reads like a broken tool (AGENTS.md Critical Rule #10). Any login script has no credentials.
- No `node_modules/`: `Cannot find module`.
- No `.claude/skills` alias: every Claude Code skill invocation is an `Unknown skill`.
- No `.context/PBI/` cache: it fails silently, and the session cannot see the synced ticket.

```bash
bun run worktree:provision          # in the new worktree: .env, deps, the skills alias, community skills, .auth/
bun run context:hydrate             # rebuild the Jira cache (needs credentials, so run it after the above)
```

Worktrees the harness creates (Claude Code `--worktree`, subagent and desktop worktrees; Codex-managed worktrees in the Codex app) copy the gitignored inputs listed in the committed `.worktreeinclude` by themselves: `.env` and its local overrides, Claude Code's local settings, `.auth/` minus the retired plaintext MCP credential copies, the OpenAPI config and synced spec, local MCP overrides and the installer state. That is the same list `worktree:provision` copies. They do not get dependencies, the `.husky/_` hook shims or the skills alias, and without `.husky/_` every git hook is skipped and commits pass no gate. The Codex app runs `bun run worktree:provision` itself through the committed `.codex/environments/environment.toml`. In a Claude Code worktree, the prompt hook prints one `WORKTREE:` warning line until you run it. A worktree made with plain `git worktree add` or by an orchestration layer reads no `.worktreeinclude`, so `worktree:provision` is the whole story there (Orca runs it from the committed `orca.yaml`).

`.session/` is deliberately not provisioned, because a plan, brief or roster written inside a worktree dies with it. Keep those in the primary checkout and cite them by absolute path. The full gap table and how to wire provisioning as an orchestration setup hook: `agentic-qa-core/references/fleet-provisioning.md`.

---

## Multi-session safety (no collisions between parallel agents)

One session, one worktree, one branch.

| Shared across worktrees (safe) | Isolated per worktree |
| --- | --- |
| `.git/objects` (commits/blobs — append-only, no overwrite) | working directory (files) |
| refs, config, hooks, **stash list** | index / staging area |
| | checked-out branch (duplicate checkout blocked by git) |

- Two sessions never edit the same physical file or the same branch, so they cannot clobber each other's work.
- The stash is global to the repo. Hand work between sessions by committing to your branch, because `git stash` is visible to every session.
- Git isolation does not isolate runtime. If both sessions run a local server or dev process, give each a distinct port (or rely on port auto-fallback); network ports, temp files and databases are shared.
- A worktree nested inside the repo (Claude Code's `.claude/worktrees/`) may show as untracked in the parent repo. Hide it locally, without a tracked commit, by adding the path to the shared exclude file:

  ```bash
  echo '.claude/worktrees/' >> "$(git rev-parse --git-common-dir)/info/exclude"
  ```

  `info/exclude` lives in the shared git-common dir (one copy for all worktrees) and is never committed, so it cannot leak into another branch's history.

---

## Orphan audit: run before removing any worktree

Removing a worktree deletes its directory, and gitignored files are not in git: `.env`, `.auth/`, captured evidence and screenshots, local reports, anything under `.session/`. A clean `git status` says nothing about them, and it is exactly the state in which they look safe to delete.

```bash
git -C <worktree> status --porcelain            # tracked work: must be committed AND pushed
git -C <worktree> log --oneline origin/<base>.. # commits that exist only here
bun run worktree:audit <worktree>               # THE audit: every gitignored file about to die, classified
bun run worktree:audit <worktree> --rescue      # copy the STATE class into the primary, never overwriting
```

`worktree:audit` sorts every gitignored path into one of four classes:

- STATE belongs in the primary checkout: `.session/`, `.scratch/`, PBI evidence and `[LOCAL]` notes, `.context/reports/`, updater state.
- CACHE comes back with a command the audit names.
- DISPOSABLE is test output, editor litter, and the test-run outputs the owner accepted losing: Allure history, `reports/`, refreshed `.auth/` tokens.
- UNKNOWN means no rule matched.

It exits 1 while STATE or UNKNOWN exists only in the worktree. `--rescue` copies STATE to the same path under the primary. A file the primary already holds with different bytes is a CONFLICT left for you, and every UNKNOWN entry is decided by hand. A durable document belongs in the primary checkout or in the tracker, never only in a worktree. Remove the worktree only on exit 0. The classification table and class definitions: `agentic-qa-core/references/fleet-provisioning.md` §5.

Three removal paths skip the audit on their own: `git worktree remove` without `--force` exits 0 and deletes ignored files without a word; Claude Code removes a worktree it judges clean, and ignored files do not count against clean; and a subagent `isolation: "worktree"` tree is cleaned automatically, so nothing can be audited there. A subagent that must leave durable output writes it straight to the primary checkout by absolute path.

---

## Cleanup checklist

- [ ] `bun run worktree:audit <path>` exits 0 (after `--rescue` and any hand-resolved conflict).
- [ ] The branch's work is committed and pushed, or deliberately discarded.
- [ ] `git worktree remove <path>` (or `ExitWorktree remove`) succeeds, which it does only when clean.
- [ ] `git branch -d <branch>` once the branch is merged.
- [ ] `git worktree prune` if any directory was removed by hand.
- [ ] Local `info/exclude` entries are cleaned up if the worktree path is gone for good.

---

## Decision guide

| Situation | Do this |
| --- | --- |
| Clean tree, one linear task | Just a branch (`git switch -c`), no worktree |
| Risky WIP on current branch, need to build something unrelated | Worktree on a new branch |
| Two AI sessions in parallel | One worktree + one branch **each** |
| Claude Code, want the session moved for you | `EnterWorktree` (base `fresh` for independence) |
| Any other agent / portable script | `git worktree add … -b …` (Approach A) |
| Parallel subagents mutating files | `Agent`/workflow `isolation: "worktree"` |
| A coordinated fleet of worker sessions the owner wants to watch and steer | Orchestrated worktree per worker (Approach C), `/agent-orchestration` |
| Several sessions that only read code and write to the tracker (manual QA, AC refinement) | **No worktree**, same checkout. The isolation they need is a browser profile and a session dir, not a second tree |

---

## AI working pattern (this repo)

When an AI session needs isolation from in-progress work on another branch:

1. Prefer `EnterWorktree` (Claude Code) with base `fresh`, so the new branch is independent of the current branch's local WIP. Rename the branch to convention (`git branch -m feat/<slug>`).
2. Move any untracked WIP into the worktree, because it will not be there automatically.
3. Keep the primary repo's `git status` clean, and check it with `git -C <primary> status`.
4. Hide the nested worktree from the primary tree through the local `info/exclude`.
5. Do all further work (edits, verifies, commits) in the worktree. The other branch stays untouched.
6. On completion, commit on the worktree's branch, open its own PR, run `bun run worktree:audit --rescue` from the worktree, then `ExitWorktree` (`keep` to preserve, `remove` when merged or abandoned, and only once the audit exits 0).

---

## With nobody at the keyboard

The waits here are the choice of worktree, the discard confirmation (`--force`, `discard_changes: true`) and the audit's UNKNOWN and CONFLICT entries. Which of them reach a person is set by `agentic-qa-core/references/decision-protocol.md`.

| Who runs it | The gate |
| --- | --- |
| A person is present | Unchanged. |
| A supervised worker | The conductor or launcher holds the removal gate. The worker audits, rescues and reports, and does not remove. |
| A routine with nobody | The delegating brief is the approval source when it covers removal. Without one, create and provision worktrees (reversible), run the audit and `--rescue`, and stop before removal or any discard; list the UNKNOWN and CONFLICT entries in the report. |
