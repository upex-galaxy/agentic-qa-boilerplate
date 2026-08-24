# Evidence and Doctrine Lookup

> Read at Step 1 (before gathering the PR) and applied throughout Step 3 of `SKILL.md`.

## The rule

Every finding either points at a line of code, points at a line of doctrine, or is explicitly labeled as opinion. There is no fourth option. "This is generally considered bad practice" with no citation is not a finding — either find the citation or relabel it as your own opinion before it reaches the user.

## Citation format

- **Code evidence**: `path/to/file.ts:42` — quote or closely paraphrase the actual line(s). If it's from a PR diff you don't have a local checkout of, cite it as it appears in the diff (`+`-prefixed line, or the surrounding context if the line itself is unchanged context).
- **Doctrine evidence**: `path/to/doctrine.md §Section` or `AGENTS.md §N` — quote the specific sentence that backs the claim, not just "per our conventions." A reader should be able to open that file and find the exact line you mean.
- **Opinion, no doctrine backing**: say so in plain words — "esto es una opinión general de buenas prácticas de QA, no está en la documentación de este repo" / "this is general QA best-practice opinion, not something this repo's doctrine states." Never dress an opinion up as a repo rule; it erodes trust in every other citation once the user catches one.

## Resolving which doctrine applies

### This repo

Load `AGENTS.md` in full (small enough to read directly), plus the specific doctrine files under `agentic-qa-core/references/` and `test-automation/references/` relevant to what the PR touches (see `SKILL.md` Dependencies for the default set on KATA/test-automation PRs — widen it if the PR touches something else, e.g. `defect-management-doctrine.md` if the PR includes a bug report, `adr-doctrine.md` if it touches a hard-to-reverse test-architecture choice).

### External repo

Never assume an external repo mirrors this one, even if it was visibly forked from the same boilerplate (folder names like `.context/guidelines/tae/kata-architecture.md` or `.books/fase-12-test-automation/` are a strong signal, not proof — the fork may have diverged, been partially updated, or never had `AGENTS.md` committed). Probe before assuming:

```bash
# Does the repo have a AGENTS.md at root?
gh api "repos/<owner>/<repo>/contents/AGENTS.md" -q '.content' 2>/dev/null | base64 -d

# Does it have its own .agents/skills/ tree?
gh api "repos/<owner>/<repo>/contents/.agents/skills" -q '.[].name' 2>/dev/null

# Does it have .context/ doctrine (this boilerplate's typical KATA reference tree)?
gh api "repos/<owner>/<repo>/contents/.context/guidelines" -q '.[].name' 2>/dev/null
```

Any of these returning content (not a 404) means the target repo has its own doctrine — read it and treat it as authoritative for this review, citing its paths, not this repo's. If a specific doctrine file you'd expect (e.g. `kata-architecture.md`) is missing but the repo clearly runs KATA-shaped tests, say so explicitly rather than silently substituting this repo's copy: "this repo's own `.context/guidelines/tae/` doesn't include a documented ATC-nesting rule, so I'm grading against `agentic-qa-boilerplate`'s version of that doctrine — flag if you'd rather I skip that check entirely since it's not something their repo states."

If the external repo has **no** doctrine of any kind (no `AGENTS.md`, no `.agents/skills`, no `.context`), fall back to this repo's KATA doctrine as the reference standard, and say so once, up front, in the findings presentation (Step 4) — not buried in a footnote per finding.

## Reading the PR itself for evidence

Real, concrete examples of the commands used in a live external-repo review (adapt the owner/repo/PR number):

```bash
# PR metadata, body, commit list
gh pr view <N> --repo <owner>/<repo> --json title,body,author,commits,files,additions,deletions,state,createdAt,url

# Full file list when the PR has more files than gh pr view's default page returns
gh api "repos/<owner>/<repo>/pulls/<N>/files?per_page=100" --paginate -q '.[].filename' | sort

# One file's patch
gh api "repos/<owner>/<repo>/pulls/<N>/files?per_page=100" --paginate \
  -q '.[] | select(.filename=="path/to/file.ts") | .patch'

# Whole-PR diff (works for smaller PRs; errors past ~20k lines — "PullRequest.diff too_large")
gh pr diff <N> --repo <owner>/<repo> --patch

# Full file content at a specific commit (useful when the patch alone doesn't show enough context,
# e.g. checking what a fallback value actually resolves to)
gh api "repos/<owner>/<repo>/contents/<path>?ref=<commit-sha>" -q '.content' | base64 -d

# Base/head refs and SHAs (confirms stacked-PR relationships, base branch, etc.)
gh pr view <N> --repo <owner>/<repo> --json baseRefName,headRefName,baseRefOid,headRefOid
```

When a commit message or PR description claims something ("5 corridas locales consecutivas: 30/30 en verde", "CI verde"), treat it as a claim to note, not evidence you verified yourself, unless you can point at the actual CI run or test output. It's fine to credit a well-evidenced claim in the Positive bucket ("author documented a concrete stability criterion, not just 'it passed'") — just don't present someone else's unverified claim as your own finding.
