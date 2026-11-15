# Conventional Commits reference

This is the commit-message contract for git-flow-master: the standard [Conventional Commits](https://www.conventionalcommits.org/) grammar, narrowed to the project's type vocabulary, plus three project rules (issue keys, mixed-changes precedence, no AI attribution).


## Grammar

```
<type>(<optional-scope>)!: <description>

[optional body]

[optional BREAKING CHANGE: footer]
[optional Refs / Closes / Co-authored-by footers, never a Claude one]
```

Regex the message must match:

```
^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9._-]+\))?!?: .+
```

Description rules:

- Imperative mood ("add", not "added" / "adds").
- Lowercase first word, no trailing period.
- Under 72 characters for the subject line.
- Body wraps at 72 characters; blank line between subject and body.


## Type vocabulary

| Type       | When to use                                                    | PR label hint         |
| ---------- | -------------------------------------------------------------- | --------------------- |
| `feat`     | New feature or user-visible capability                         | `feature`             |
| `fix`      | Bug fix                                                        | `bugfix`              |
| `docs`     | Documentation only (README, AGENTS.md, code comments)          | `docs`                |
| `style`    | Formatting, whitespace, lint fixes; no behaviour change | `chore`               |
| `refactor` | Code change without behaviour change                           | `chore`               |
| `perf`     | Performance improvement (with measurable rationale in body)    | `feature` or `perf`   |
| `test`     | Adding or updating automated tests with no product code change | `chore`               |
| `chore`    | Tooling, deps, config, housekeeping                            | `chore`               |
| `build`    | Build system / external deps (Webpack, Vite, Bundler, Docker)  | `chore`               |
| `ci`       | CI configuration (GitHub Actions, GitLab CI)                   | `chore`               |
| `revert`   | Reverts a previous commit (Git auto-generates the format)      | matches reverted type |


## Issue keys

When the work is tied to a tracker (Jira, Linear, GitHub Issues), the key goes in the scope position:

```
feat(UPEX-123): add bulk-assign action
fix({{PROJECT_KEY}}-45): handle empty response in reservation list
docs(UPEX-200): clarify branch prefix vocabulary
```

Without an issue key:

```
feat: add bulk-assign action
docs: clarify branch prefix vocabulary
```

The skill extracts the key in this order:

1. Current branch name regex: `(?:feat|feature|fix|test|docs|refactor|chore)/([A-Z]+-\d+)-`.
2. `$ARGUMENTS` for `[A-Z]+-\d+`.
3. Ask the user once, and accept "no key". With nobody present, commit without a key and say so in the report.


## Scope (without an issue key)

Scope is optional. Add it when it sharpens the message:

```
feat(auth): add JWT token refresh
fix(api): handle 429 from upstream
chore(deps): bump bubbletea to v0.26
refactor(parser): extract tokenizer
```

Lowercase, with hyphen, underscore or dot allowed and no spaces: `^[a-z0-9._-]+$`.


## Mixed changes: precedence rule

A single commit may span several types (a feature ships its own tests). Pick the dominant type by this precedence:

```
feat > fix > refactor > test > docs > chore
```

Examples:

- Feature code + its tests → `feat:` (tests are part of the feature).
- Bug fix + its regression test → `fix:` (the test is part of the fix).
- Refactor + updated docs explaining the new internals → `refactor:` (docs are derivative).
- Pure docs (README updated, no code) → `docs:`.
- Pure test additions for existing untested code → `test:`.

The same precedence picks a branch prefix: a `feat/UPEX-123-foo` branch is fine even when it ships tests.


## Breaking changes

Append `!` after the type/scope and add a `BREAKING CHANGE:` footer with migration notes:

```
feat(api)!: rename POST /users/create to POST /users

BREAKING CHANGE: the legacy endpoint POST /users/create now returns 410.
Migrate clients to POST /users which keeps the same payload contract.
```

The `!` flags the breaking change to changelog tooling, and the footer documents the migration path.

PR label hint: `breaking-change`.


## Atomic commit checklist (before staging)

- [ ] One commit = one responsibility. If you can describe the commit with the word "and", split it.
- [ ] The repo still makes sense after applying only this commit (no half-implementations).
- [ ] Tests / docs for this unit are included in the same commit.
- [ ] Rollback is reasonable without reverting unrelated work.
- [ ] The message explains the outcome, not the file list.
- [ ] Subject line ≤ 72 chars. Body wraps at 72.
- [ ] Each file path is staged explicitly (no `git add -A` or `git add .`).


## Hard rules

1. No AI attribution (Critical Rule #3 in `AGENTS.md`). A commit carries no `Generated with Claude Code` line, no `Co-Authored-By: Claude <…>` and no equivalent, so it reads as human-authored.
2. Stage exact paths, never `git add -A` or `git add .`, so secrets (`.env`, credentials) and unrelated work stay out.
3. Never `--amend` after a hook rejected the commit. The rejected commit does not exist, so `--amend` would rewrite the previous one. Fix the cause and create a new commit.
4. Never `--amend` a published commit: once pushed it is shared history. Add a forward commit (`fix:`, `revert:`).
5. Never `--no-verify` unless the user explicitly authorises bypassing hooks.
6. Forensic trailers close every message. The last two lines are `Worktree: <name|primary>` then `Session: <label>` (SKILL.md §3.2). `.husky/commit-msg` runs `scripts/check-commit-trailers.ts` through `framework_gates_commit_msg` in `.husky/framework-gates.sh`: it warns, and does not block, when the pair is missing or not last, or when a harness-branded trailer (`Claude-Session:` and kin), an AI `Co-Authored-By:` or a "Generated with <tool>" line is present. A warning there means the commit landed wrong: fix the next one, and leave a pushed one unamended.


## Examples

```
feat(UPEX-123): add bulk-assign action
fix(UPEX-200): handle empty response in reservation list
docs: clarify branch prefix vocabulary
refactor(parser): extract tokenizer
chore(deps): bump zod to v4
perf(api): cache OS detection result
test(installer): add coverage for catalog step execution
build: update goreleaser config for arm64
ci: split unit and e2e test jobs
revert: undo model picker redesign
style: fix linter warnings in catalog package
feat(cli)!: change default config path

BREAKING CHANGE: --config is now --config-file. The legacy flag prints a
warning and continues to work for one minor release; it will be removed
in the next major.
```
