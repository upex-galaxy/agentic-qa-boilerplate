# Git Flow Assistant

Guided git workflow: analyze changes, create atomic commits, push, and optionally open a PR.

**Input:** $ARGUMENTS
(Optional context: branch name, target base branch, or description of what you worked on.)

---

## Step 1: Detect Current State

Run these commands and analyze the output:

```bash
git status
git branch --show-current
git diff --stat
git log --oneline -5
```

Determine:
- Current branch (is it `main`, `staging`, `feature/*`?)
- Uncommitted changes (staged, unstaged, untracked)
- Unpushed commits
- Last commit message

Present a concise summary to the user:
- Branch name
- Number of modified / new / deleted files
- Recent local commits
- Push status relative to remote

## Step 2: Protected Branch Guard

If on `main` or `staging` and there are uncommitted changes, warn:

> You are on a protected branch. Do you want to create a feature branch first?

If yes, ask for a branch name and create it: `git checkout -b feature/{name}`.

## Step 3: Group Changes and Propose Commits

Analyze modified files and group by context:
1. **Source code** -- components, services, pages, APIs
2. **Tests** -- test files, fixtures, test data
3. **Config** -- env, build, CI/CD configuration
4. **Docs** -- README, markdown, comments

For each group with changes, propose a commit with:
- Semantic prefix (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
- Clear, concise description
- List of files included

Present the proposed commits and wait for user confirmation (accept / modify / reject).

## Step 4: Execute Commits

For each accepted group:
```bash
git add {files}
git commit -m "{type}: {description}"
```

Rules:
- One commit = one responsibility
- Never include AI attribution in commit messages
- Show confirmation after each commit

## Step 5: Push Decision

After committing, ask the user:
1. **Push to remote** -- upload changes to GitHub
2. **Continue working** -- keep changes local
3. **View diff first** -- show `git diff origin/{branch}..HEAD` before deciding

If pushing:
```bash
git push origin {current-branch}
```

If the branch has no upstream yet:
```bash
git push -u origin {current-branch}
```

## Step 6: Pull Request (Optional)

If the user is on a `feature/*` or `fix/*` branch and has pushed, ask if they want to create a PR.

If yes:
1. Analyze all commits since divergence from the base branch
2. Generate a PR title (semantic prefix, under 70 characters) and body with a summary and test plan
3. Create the PR:
   ```bash
   gh pr create --title "{title}" --body "{body}" --base {target-branch}
   ```
4. Return the PR URL

**Default base branch:** `main` (override if user specifies a different target in `$ARGUMENTS`).

## Rules

- Always analyze before acting -- never assume repo state
- Atomic commits: one commit = one responsibility
- Never force push or rewrite pushed history
- Never push to `main` without explicit user confirmation
- Clear semantic commit messages
- Show each action before executing and wait for confirmation on destructive steps
