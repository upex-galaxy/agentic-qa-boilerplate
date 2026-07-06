# GitHub Pages Setup — publish Allure reports for THIS project

> One-time setup that makes the Allure reports your CI already pushes to
> `gh-pages` actually reachable in a browser. The regression / smoke / sanity
> workflows shipped with this boilerplate publish to the `gh-pages` branch out
> of the box via `scripts/ci/publish-allure-pages.ts` (Allure 3, same
> `allurerc.mjs` as local runs: the Awesome report served directly with its
> Report | Graphs | Timeline modes, trend history per env/suite, latest-run
> redirect, last-10-runs retention) — but GitHub does NOT serve that branch
> until Pages is explicitly enabled on the repo. This reference is the full
> maneuver, learned the hard way on the boilerplate repo itself.

## When to run this

- User asks any variant of: "set up GitHub Pages", "publish the Allure
  reports", "why is the report URL 404", "enable the reports site".
- `/adapt-framework` finished wiring CI and the project wants browsable
  reports.
- The `Post Report URL` step of a suite run prints a URL that returns 404.

## Step 0 — Allure version-currency check (MANDATORY)

Before touching Pages, run the **§Allure version-currency check** from
`SKILL.md` §Local reporting: the boilerplate's pinned `allure` /
`allure-playwright` / `allure-js-commons` versions are usually behind upstream
by the time a scaffolded project reaches this setup. Summarize the news to the
user, offer the same-major `bun update`, never cross a major silently, and
re-generate one report to confirm the root `index.html` still opens the
Awesome report directly (Report | Graphs | Timeline). The published site
inherits whatever version generates in CI, so an outdated local pin means an
outdated public report.

## Preconditions (probe, don't assume)

| Check | Command | Blocker if |
| --- | --- | --- |
| gh CLI authenticated | `gh auth status` | fails → stop, ask user to `gh auth login` |
| gh-pages branch exists on origin | `git ls-remote --heads origin gh-pages` | empty → run a suite first (any Allure deploy creates it) |
| Repo visibility | `gh repo view --json visibility` | `PRIVATE` + free plan → Pages requires a paid plan; surface to user |
| Pages state | `gh api repos/{owner}/{repo}/pages` | `404` means NOT enabled → proceed with setup |

## Step 1 — Enable Pages serving the gh-pages branch

```bash
gh api -X POST repos/{owner}/{repo}/pages \
  -f "source[branch]=gh-pages" -f "source[path]=/"
```

Success returns `"html_url": "https://{owner}.github.io/{repo}/"`. If it
returns `409 Conflict`, Pages is already enabled — check its source with
`gh api repos/{owner}/{repo}/pages` and fix the branch if it points elsewhere
(`gh api -X PUT ... -f "source[branch]=gh-pages"`).

## Step 2 — Verify the first build (KNOWN GOTCHA: it can silently fail)

The first build after enablement — on a branch that already has content — can
error with a generic "Page build failed." or hang in `building` for a long
time. Do NOT push commits to "wake it up"; request a rebuild instead:

```bash
# status of the latest build
gh api repos/{owner}/{repo}/pages/builds/latest --jq '{status, error: .error.message}'

# if status is "errored" (or stuck "building" for >10 min): force a rebuild
gh api -X POST repos/{owner}/{repo}/pages/builds
```

Then poll `builds/latest` until `status: built` and confirm with curl:

```bash
curl -s -o /dev/null -w "%{http_code}" https://{owner}.github.io/{repo}/{env}/regression/
```

`{env}` is the project's active environment (e.g. `staging`). Expect `200`.

## Step 3 — Long-term storage hygiene (prevent unbounded branch growth)

Two independent growth vectors, two controls:

1. **Working tree** — already controlled: `scripts/ci/publish-allure-pages.ts`
   prunes to the last 10 run dirs per env/suite (`--keep`, adjustable in each
   workflow). Screenshots/videos live inside each report and rotate with it;
   `history.jsonl` (trend data) persists independently and stays small.
2. **Git history** — NOT controlled by run pruning: every deploy commit keeps
   its blobs in history forever, so the branch grows on every run even though
   the served site does not. Fix: a scheduled squash job that rewrites
   `gh-pages` to a single orphan commit holding the current content. This is
   the ONLY sanctioned force-push in the project — `gh-pages` is 100%
   workflow-generated, nobody develops on it. Template (adapt repo name; runs
   monthly + on demand): see `.github/workflows/pages-squash.yml` in the
   boilerplate source repo (upex-galaxy/agentic-qa-boilerplate) — copy it
   verbatim; it is repo-agnostic.

## Report to the user

- Site URL + the per-suite report URLs (`/{env}/regression/`, `/{env}/smoke/`,
  `/{env}/sanity/` — whichever workflows the project runs).
- Whether the squash job was installed (recommended: yes).
- Reminder: on public repos the reports are public — screenshots may leak
  UI/data of the app under test; confirm the team is OK with that or keep the
  repo private (Pages on private repos needs a paid plan).

## Scope guard

This reference sets up ALLURE report publishing for consumer projects. The
boilerplate's own `pages.yml` (docs hub: KATA Academy + decks + homepage)
is boilerplate-EXCLUSIVE — never replicate it in a consumer project; the
scaffolder deliberately excludes it.
