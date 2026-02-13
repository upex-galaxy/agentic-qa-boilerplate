# Simplified GitFlow - AI-Driven Project

## Flow philosophy

This project uses an adapted GitFlow for working with artificial intelligence. The AI generates code and commits it intelligently, but **you maintain control** at key points.

## Branch structure

### main

Production code. Only receives merges from `staging` through approved pull requests.

### staging

Integration and testing branch. Here the AI commits grouped changes while you work. Represents your QA/pre-production environment.

### feature/task-name

One branch per specific functionality. The AI creates these branches when you start a new task.

**Naming examples:**

- `feature/login-validation`
- `feature/dashboard-analytics`
- `feature/payment-integration`

## Typical work cycle

### 1. Start new task

```bash
# From staging
git checkout staging
git pull origin staging
git checkout -b feature/task-name
```

### 2. Development with AI

- You give instructions to the AI about what to build
- The AI generates code and groups it into semantic commits
- Each commit is small, functional, and independent

### 3. Grouped commits

The AI analyzes changes and proposes separate commits:

**feat:** New functionality

```
feat: add email validation in form
```

**fix:** Bug fixes

```
fix: correct discount calculation in checkout
```

**refactor:** Existing code improvements

```
refactor: optimize database queries
```

**test:** New or modified tests

```
test: add test cases for login
```

**docs:** Documentation

```
docs: update README with new environment variables
```

### 4. Optional push

After each group of commits, you decide:

- **Push now:** Upload changes to remote repo
- **Continue local:** Keep iterating without push

### 5. Pull Request

When the feature is complete:

- You do final push of the branch
- Create PR from `feature/name` to `staging` or `main`
- Review changes in GitHub
- Approve and merge

## Advantages of this system

**Clean history:** Each commit tells a clear story of what problem it solved.

**Reversibility:** You can revert specific changes without destroying all work.

**Human control:** The AI executes, but you decide when and what gets uploaded.

**Fast iteration:** Work locally without "polluting" the repo until satisfied.

## Visual flow

```
main ─────────────●─────────────●─────────────●
                   ↑             ↑             ↑
                   PR            PR            PR
                   │             │             │
staging ───●───●───●───●───●─────●───●───●─────●
            ↑   ↑       ↑   ↑
            │   │       │   │
feature/x ──●───●       │   │
                        │   │
feature/y ──────────────●───●
```

## Useful commands

### View current status

```bash
git status
git log --oneline -10
```

### View differences before commit

```bash
git diff
git diff --stat
```

### Revert last commit (keeps changes)

```bash
git reset HEAD~1
```

### View branch history

```bash
git log --graph --oneline --all
```

## Best practices

1. **One commit = one responsibility:** Don't mix fix with features
2. **Clear messages:** Someone should understand what it does without seeing the code
3. **Frequent push on long features:** Don't accumulate days of work without backup
4. **Small PRs:** Easier to review and approve
5. **Tests before merge:** Ensure nothing breaks

## GitHub integration

This flow is enhanced with GitHub MCP, which allows the AI to:

- View existing pull requests
- Create new PRs with automatic description
- List issues and link them to commits
- Check status of automatic checks

Without configured GitHub MCP, the flow works but you lose automation in the PR part.

---

**Note about environments:** The `staging` branch represents your testing and QA environment. To better understand the relationship between Git branches and development environments, see the `ambientes.md` document.
