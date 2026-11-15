# Evidence and Doctrine Lookup

> Read at Step 1 (before gathering the PR) and applied throughout Step 3 of `SKILL.md`.

## The rule

Every finding points at a line of code, points at a line of doctrine, or is labeled as opinion. "This is generally considered bad practice" with no citation is not a finding: find the citation or relabel it as your own opinion before it reaches the user.

## Citation format

- **Code evidence**: `path/to/file.ts:42`, quoting or closely paraphrasing the actual line. <!-- volatile-ok: placeholder citation format, not a real location --> If it comes from a PR diff you have no local checkout of, cite it as it appears in the diff (the `+` line, or the surrounding context when the line itself is unchanged).
- **Doctrine evidence**: `path/to/doctrine.md §Section` or `AGENTS.md §N`, quoting the specific sentence that backs the claim, not just "per our conventions". A reader should be able to open that file and find the exact line you mean.
- **Opinion, no doctrine backing**: say so in plain words: "this is general QA best-practice opinion, not something this repo's doctrine states." An opinion dressed up as a repo rule erodes trust in every other citation once the user catches one.

## Resolving which doctrine applies

### This repo

Load `AGENTS.md` and the sections its router names for what the PR touches (`.agents/instructions/*.md`). `AGENTS.md` alone is only the always-on layer, so check a `§N` citation against the section file the router lists for it. Then load the doctrine files under `agentic-qa-core/references/` and `test-automation/references/` that fit the PR. `SKILL.md` Dependencies has the default set for KATA and test-automation PRs. Widen it when the PR touches something else: `defect-management-doctrine.md` for a bug report, `adr-doctrine.md` for a hard-to-reverse test-architecture choice.

### External repo

An external repo may not mirror this one, even when it was visibly forked from the boilerplate. Folder names like `.context/guidelines/tae/kata-architecture.md` or `.books/fase-12-test-automation/` are a strong signal, not proof: the fork may have diverged, been partly updated, or never committed `AGENTS.md`. Probe before assuming:

```bash
# Does the repo have a AGENTS.md at root?
gh api "repos/<owner>/<repo>/contents/AGENTS.md" -q '.content' 2>/dev/null | base64 -d

# Does it have its own .agents/skills/ tree?
gh api "repos/<owner>/<repo>/contents/.agents/skills" -q '.[].name' 2>/dev/null

# Does it have .context/ doctrine (this boilerplate's typical KATA reference tree)?
gh api "repos/<owner>/<repo>/contents/.context/guidelines" -q '.[].name' 2>/dev/null
```

Any of these returning content (not a 404) means the target repo has its own doctrine. Read it and treat it as authoritative for this review, citing its paths. If a file you would expect (say `kata-architecture.md`) is missing while the repo clearly runs KATA-shaped tests, say so instead of silently substituting this repo's copy: "this repo's own `.context/guidelines/tae/` has no documented ATC-nesting rule, so I'm grading against `agentic-qa-boilerplate`'s version of that doctrine. Flag it if you'd rather I skip that check, since their repo doesn't state it."

If the external repo has no doctrine of any kind (no `AGENTS.md`, no `.agents/skills`, no `.context`), fall back to this repo's KATA doctrine as the reference standard and say so once, up front, in the Step 4 presentation, not in a footnote per finding.

## Reading the PR itself for evidence

Commands from a live external-repo review (adapt owner, repo and PR number):

```bash
# PR metadata, body, commit list
gh pr view <N> --repo <owner>/<repo> --json title,body,author,commits,files,additions,deletions,state,createdAt,url

# Full file list when the PR has more files than gh pr view's default page returns
gh api "repos/<owner>/<repo>/pulls/<N>/files?per_page=100" --paginate -q '.[].filename' | sort

# One file's patch
gh api "repos/<owner>/<repo>/pulls/<N>/files?per_page=100" --paginate \
  -q '.[] | select(.filename=="path/to/file.ts") | .patch'

# Whole-PR diff (works for smaller PRs; errors on very large PRs — "PullRequest.diff too_large")
gh pr diff <N> --repo <owner>/<repo> --patch

# Full file content at a specific commit (useful when the patch alone doesn't show enough context,
# e.g. checking what a fallback value actually resolves to)
gh api "repos/<owner>/<repo>/contents/<path>?ref=<commit-sha>" -q '.content' | base64 -d

# Base/head refs and SHAs (confirms stacked-PR relationships, base branch, etc.)
gh pr view <N> --repo <owner>/<repo> --json baseRefName,headRefName,baseRefOid,headRefOid
```

A claim in a commit message or PR description ("5 consecutive local runs: 30/30 green", "CI green") is a claim to note, not evidence you verified, unless you can point at the actual CI run or test output. A well-evidenced claim can still earn credit in the Positive bucket ("the author documented a concrete stability criterion, not just 'it passed'"). Do not present someone else's unverified claim as your own finding.
