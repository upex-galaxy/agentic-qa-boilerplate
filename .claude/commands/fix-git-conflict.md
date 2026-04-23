# Git Conflict & Error Resolver

Diagnose and resolve any Git problem with clear explanations and safe resolution options.

**Input:** $ARGUMENTS
(Describe the problem, or paste the error message. If omitted, the tool will diagnose automatically.)

---

## Phase 1: Diagnosis

### Gather Information

Run these commands and analyze:

```bash
git status
git branch -vv
git log --oneline -5
git stash list
git diff --check
```

### Classify the Problem

| Symptom | Problem Type |
|---------|-------------|
| `both modified:` | Merge conflict |
| `REBASE in progress` | Rebase conflict |
| `MERGING` | Incomplete merge |
| `HEAD detached` | Detached HEAD |
| `diverged` | Branch divergence |
| `rejected` (push) | Push rejected |
| `CONFLICT (rename/delete)` | Structural conflict |
| `cannot pull with rebase` | Stash needed |
| `error: pathspec` | File/branch not found |

### Present Diagnosis

Explain to the user:
1. **What happened** -- the root cause
2. **Why it happened** -- technical context in simple terms
3. **Current state** -- branch, files affected, local/remote status

---

## Phase 2: Resolution

Based on the classified problem, apply the matching resolution strategy below.

### Merge Conflicts

1. List files in conflict: `git diff --name-only --diff-filter=U`
2. For each file, show the conflicting sections with context
3. Ask the user which version to keep (theirs, ours, or a manual combination)
4. After resolving each file: `git add {file}`
5. Complete the merge: `git commit -m "fix: resolve merge conflicts in {files}"`

### Rebase Conflicts

1. Show current patch: `git rebase --show-current-patch`
2. Offer options: resolve and continue (`git rebase --continue`), skip commit (`git rebase --skip`), or abort (`git rebase --abort`)
3. If aborting, suggest merge as a safer alternative

### Push Rejected

1. Fetch remote: `git fetch origin`
2. Show divergence: commits the remote has vs. local commits
3. Offer options: `git pull` (merge), `git pull --rebase` (linear history), or view differences first
4. Never suggest force push unless the user explicitly requests it

### Detached HEAD

1. Show current commit and available branches
2. Offer: return to existing branch, create new branch from here, or go back (`git checkout -`)

### Branch Divergence

1. Show local-only and remote-only commits
2. Offer: merge (`git pull`), rebase (`git pull --rebase`), or view differences first
3. Warn about force push -- only if user explicitly asks

### Stash Conflicts

1. Show files in conflict after `git stash pop`
2. Offer: resolve conflicts manually, or abort and keep stash (`git checkout -- .`)
3. After resolution: `git stash drop` to clean up

### Other Common Errors

- **"pathspec did not match"**: Run `git fetch --all` and `git branch -a` to find the correct name
- **"unrelated histories"**: Explain the cause; if user confirms, use `--allow-unrelated-histories`
- **"unstaged changes block pull"**: Offer stash-pull-pop or commit-then-pull

---

## Phase 3: Verification

After any resolution:

```bash
git status
git log --oneline -3
```

Confirm to the user:
- The problem is resolved (or what remains)
- Summary of steps taken
- One prevention tip to avoid the same issue in the future

## Rules

- Never assume -- always diagnose first
- Never force push or rewrite history without explicit user request
- Always explain what each command does before running it
- Offer multiple resolution options and let the user choose
- Verify the fix after applying it
