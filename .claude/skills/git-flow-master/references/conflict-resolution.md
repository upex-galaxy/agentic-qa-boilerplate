# Conflict Resolution — Per-Type Playbooks

Conflicts are diagnosed before they are resolved. The user is rarely in a hurry; a wrong fix here costs hours of recovery. The shape of every playbook is the same:

1. **Explain** what happened (root cause, in the user's language).
2. **Present options** ranked by safety. Never pick destructive options silently.
3. **Guide** the resolution step by step.
4. **Verify** (`git status`, `git log --oneline -3`, working tree clean).
5. **Teach prevention** (one short note on how to avoid it next time).

When in doubt, **abort** (`git merge --abort`, `git rebase --abort`, `git cherry-pick --abort`) rather than push forward. Aborting always wins over guessing.

---

## Table of contents

1. [Diagnosis — gather information first](#diagnosis)
2. [Merge conflict (content)](#merge-conflict-content)
3. [Merge conflict (rename / delete)](#merge-conflict-rename--delete)
4. [Rebase conflict](#rebase-conflict)
5. [Push rejected (diverged)](#push-rejected)
6. [Detached HEAD](#detached-head)
7. [Stash apply conflict](#stash-apply-conflict)
8. [Unrelated histories](#unrelated-histories)
9. [Pre-commit hook rejected the commit](#pre-commit-hook-rejected)
10. [Emergency commands (last resort)](#emergency-commands)

---

## Diagnosis

Run silently and read the output before deciding which playbook applies:

```bash
git status
git branch -vv
git log --oneline -5
git stash list
git diff --check
ls -la .git | grep -E 'MERGE_HEAD|REBASE|CHERRY_PICK|BISECT'
```

Classify by `git status` output and any state files in `.git/`:

| Symptom                                                                          | State file                                      | Probable problem                           |
| -------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `both modified:`                                                                 | `MERGE_HEAD`                                    | Merge conflict (content)                   |
| `deleted by us:` / `deleted by them:`                                            | `MERGE_HEAD`                                    | Merge conflict (rename/delete)             |
| `interactive rebase in progress` / `REBASE_HEAD`                                 | `REBASE_HEAD`, `rebase-apply/`, `rebase-merge/` | Rebase conflict                            |
| `MERGING` (no `both modified`)                                                   | `MERGE_HEAD`                                    | Incomplete merge — finish or abort         |
| `HEAD detached at <sha>`                                                         | none                                            | Detached HEAD                              |
| `Your branch and 'origin/X' have diverged`                                       | none                                            | Branch divergence                          |
| `! [rejected]` from push                                                         | none                                            | Push rejected                              |
| `error: Your local changes to the following files would be overwritten by merge` | none                                            | Stash needed before pull/merge             |
| `CONFLICT (cherry-pick)`                                                         | `CHERRY_PICK_HEAD`                              | Cherry-pick conflict (use rebase playbook) |

If the user provided context, use it. If not, ask:

> _"What were you trying to do when this happened? — pull/fetch, push, merge, rebase, checkout, stash apply, or something else?"_

---

## Merge conflict (content)

**Explanation** (use the user's language):

> _Two branches edited the same lines of the same file. Git can't decide which version is right, so it asks you to choose. The conflicting file has markers like `<<<<<<<`, `=======`, `>>>>>>>`._

**Steps**:

1. List the conflicted files:

   ```bash
   git diff --name-only --diff-filter=U
   ```

2. For each file, show the conflict block(s) and ask which side to keep:

   ```
   📄 src/auth/login.ts (lines 45-52)

   <<<<<<< HEAD (your branch)
   const timeout = 5000;
   =======
   const timeout = 10000;
   >>>>>>> feature/performance

   Choose: [1] keep yours (5000) [2] use theirs (10000) [3] combine
   [4] view more context
   ```

3. Apply the resolution. For "keep ours" / "keep theirs" Git has shortcuts:

   ```bash
   git checkout --ours <file>     # keep your branch's version
   git checkout --theirs <file>   # keep the incoming branch's version
   # then:
   git add <file>
   ```

   For "combine", edit the file manually, remove all conflict markers, then `git add <file>`.

4. After all files are resolved:

   ```bash
   git status                                # should show "all conflicts fixed"
   git commit                                 # uses the prepared merge message
   # OR explicit:
   git commit -m "merge: integrate {branch} into {current}"
   ```

5. Verify clean state and a sensible log:
   ```bash
   git status
   git log --oneline -5
   ```

**Prevention**: pull the upstream branch frequently; keep branches short-lived; coordinate on long-running shared files.

---

## Merge conflict (rename / delete)

**Explanation**:

> _One branch deleted (or renamed) a file the other branch modified. Git doesn't know if the modification should follow the rename, be reapplied to a new path, or be discarded._

**Steps**:

1. Identify the file(s):

   ```bash
   git status                                # look for "deleted by us/them"
   git log --diff-filter=D --name-only -1    # find the deletion commit
   ```

2. Decide:
   - **Keep the deletion** (the file is gone, modifications discarded):
     ```bash
     git rm <file>
     ```
   - **Restore the file** with the modifications:
     ```bash
     git checkout HEAD -- <file>            # if deleted by them
     git checkout MERGE_HEAD -- <file>      # if deleted by us
     git add <file>
     ```
   - **Migrate modifications** to the renamed path (if a rename was the cause): manually copy the changes to the new path, `git add` it, `git rm` the old one.

3. Commit and verify (same as content conflict).

**Prevention**: when renaming files, do it in its own commit (no behaviour change in the same commit). Reviewers catch rename conflicts early.

---

## Rebase conflict

**Explanation**:

> _Rebase reapplies your commits one by one on top of a different base. If a commit doesn't apply cleanly, the rebase pauses and asks you to fix the conflict before continuing._

**Steps**:

1. See which commit is being applied:

   ```bash
   git status                          # shows current commit being rebased
   git rebase --show-current-patch     # full diff of the failing commit
   ```

2. Present options:
   - **Resolve and continue**: edit the conflicted files, `git add`, then `git rebase --continue`.
   - **Skip this commit**: `git rebase --skip` (the commit is dropped — confirm with user; this is destructive).
   - **Abort the rebase**: `git rebase --abort` (returns to pre-rebase state; safe).

3. If resolving: same content-conflict flow as above (`git checkout --ours/--theirs` or manual edit, then `git add`, then `git rebase --continue`).

4. After all commits land, verify:
   ```bash
   git log --oneline -10
   git status
   ```

**Prevention**: rebase early and often (rebase a 1-day branch, not a 3-week branch); never rebase a branch others are working on.

**Critical rule**: never rebase a branch that has been pushed AND is shared. Rewriting public history is forbidden.

---

## Push rejected

**Explanation**:

> _The remote has commits you don't have locally. Pushing now would overwrite those commits and lose work. Git refuses to do that._

**Steps**:

1. Diagnose:

   ```bash
   git fetch origin
   git log HEAD..origin/{branch} --oneline    # commits on remote you don't have
   git log origin/{branch}..HEAD --oneline    # commits you have that aren't on remote
   ```

2. Present options ranked by safety:

   **[1] Pull with merge** (safest, creates a merge commit):

   ```bash
   git pull origin {branch}
   git push
   ```

   History shows the divergence as a merge commit. Recommended when the branch is shared.

   **[2] Pull with rebase** (linear history, more conflict risk):

   ```bash
   git pull --rebase origin {branch}
   git push
   ```

   Reapplies your commits on top of the remote. Linear history. Safe **only** if the branch is yours alone (the rebase rewrites your local commits — fine if no one else has them).

   **[3] Force push** (DANGEROUS — only with explicit user opt-in AND only on unshared branches):

   ```bash
   # Never run silently. Confirm the branch is unshared.
   git push --force-with-lease
   ```

   `--force-with-lease` is safer than `--force`; it refuses if the remote moved since your last fetch. Still destructive — never on `main` or shared branches.

3. After pushing, verify:
   ```bash
   git status
   git log --oneline -5
   ```

**Prevention**: `git fetch` before starting work; pull frequently on long-running branches.

---

## Detached HEAD

**Explanation**:

> _Normally HEAD points to a branch. "Detached" means HEAD points directly at a commit (no branch). Any commits you make here are easy to lose because no branch tracks them._

**Steps**:

1. Diagnose:

   ```bash
   git log --oneline -1                    # what commit you're on
   git branch -a                           # branches available
   ```

2. Decide:

   **[1] Just looking — go back**:

   ```bash
   git checkout -                          # go back to the previous branch
   ```

   **[2] Made changes I want to keep — create a branch from here**:

   ```bash
   git checkout -b {prefix}/{slug}
   ```

   (Use the branch-creation runbook in `SKILL.md` § 3.1 for naming.)

   **[3] Discard any changes and switch to a known branch**:

   ```bash
   git checkout main                        # or whichever branch you want
   ```

3. Verify:
   ```bash
   git status
   git branch --show-current
   ```

**Prevention**: when checking out a tag or specific commit for inspection, use `git switch --detach <ref>` (Git 2.23+) so the detachment is intentional. Create a branch immediately if you plan to commit.

---

## Stash apply conflict

**Explanation**:

> _A stash is uncommitted work saved temporarily. Applying (or popping) the stash conflicts with files that have changed since you saved it._

**Steps**:

1. Identify which files conflict:

   ```bash
   git status                          # shows "both modified" entries
   git stash list                      # list of stashes
   ```

2. Options:

   **[1] Resolve manually**: edit conflicting files (same content-conflict flow), then:

   ```bash
   git add <files>
   git stash drop                      # remove the stash if you used `git stash apply`
   ```

   `git stash pop` removes the stash automatically after a clean apply; if the apply conflicts, the stash is **kept** so you can retry. Drop it explicitly when done.

   **[2] Abort and keep the stash**:

   ```bash
   git stash show --name-only          # list ONLY the paths the stash touches
   git checkout -- <paths-from-stash>  # discard ONLY those paths, never `.`
   git reset HEAD <paths-from-stash>   # unstage anything that got staged
   ```

   > ⚠️ Never `git checkout -- .` here — other agent sessions may hold uncommitted work in the same working tree (Anti-pattern G9, Critical Rule #15). Discard only the paths the stash apply touched.

   The stash is still in `git stash list`. Apply again later when the working tree is in a different state.

3. Verify:
   ```bash
   git status
   git stash list
   ```

**Prevention**: prefer commits over stashes for anything you might leave for more than a few hours. Stashes are easy to forget and easy to lose.

---

## Unrelated histories

**Explanation**:

> _Git refuses to merge two branches that don't share any common commit. This usually happens when you initialised separate repos and tried to merge them, or cloned with `--depth` and history is missing._

**Steps**:

1. Confirm the situation:

   ```bash
   git log --oneline -5
   git fetch --unshallow                # if it was a shallow clone
   ```

2. If you intentionally want to merge unrelated histories:

   ```bash
   git pull origin main --allow-unrelated-histories
   # or:
   git merge --allow-unrelated-histories <branch>
   ```

   Then resolve any content conflicts that arise (same content-conflict flow).

3. If you did NOT intend to merge unrelated histories, **stop** and figure out why the histories are unrelated. The flag suppresses a safety check; using it on the wrong repo bonds two unrelated codebases together.

**Prevention**: clone with full history (`git clone <url>`, no `--depth`) when you plan to merge.

---

## Pre-commit hook rejected

**Explanation**:

> _A pre-commit hook (lint, format, test) returned non-zero, so the commit was NOT created. The hook is the gatekeeper; respecting it keeps the repo healthy._

**Steps**:

1. Read the hook output. It almost always says exactly what failed.

2. Fix the underlying issue:
   - Lint failures: run the auto-fixer (`bun run lint:fix` / `pnpm lint --fix` / `eslint --fix`).
   - Format failures: run the formatter (`bun run format:fix` / `prettier --write`).
   - Test failures: actually fix the test or the code under test.
   - Type failures: fix the types.

3. Re-stage the fixed files and create a **NEW** commit:

   ```bash
   git add <fixed-files>
   git commit -m "{type}({key}): {description}"
   ```

4. **Never** `git commit --amend` here. The hook rejected the commit — it does not exist. `--amend` would mutate the _previous_ commit, which destroys context. Forward commits only. (Critical Reminder #7 in `CLAUDE.md`.)

5. **Never** `git commit --no-verify` to bypass the hook unless the user explicitly authorises it. Hooks exist for a reason.

**Prevention**: run the hooks' commands locally before committing (`bun run lint:check`, `tsc --noEmit`, etc.). Faster than discovering the failure at commit time.

---

## Emergency commands

For when everything is broken and you need to recover. These commands can lose work — use them only with explicit user consent and only when the alternatives have been tried.

```bash
# Show every reference HEAD has pointed to (including "lost" commits)
git reflog

# Recover a "lost" commit by sha
git checkout -b recovery <sha>

# Reset to a specific reflog entry (DESTRUCTIVE — current changes lost).
# Requires explicit user OK AND a working tree with no other session's
# uncommitted work (Anti-pattern G9, Critical Rule #15).
git reset --hard HEAD@{N}

# Clean up an aborted operation safely
git merge --abort
git rebase --abort
git cherry-pick --abort

# Last resort: clone fresh
cd ..
git clone {url} {dir}-fresh
# Then move uncommitted work over manually
```

**Reflog is the safety net.** A commit only truly disappears after `git gc` runs (default: 90 days for unreferenced commits). Until then, reflog can recover anything that was once committed.
