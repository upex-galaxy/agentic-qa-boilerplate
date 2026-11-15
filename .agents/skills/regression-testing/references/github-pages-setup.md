# GitHub Pages Setup: publish Allure reports for this project

> One-time setup that makes the Allure reports your CI already pushes to
> `gh-pages` reachable in a browser. The regression, smoke and sanity
> workflows shipped with this boilerplate publish to the `gh-pages` branch out
> of the box through `scripts/ci/publish-allure-pages.ts` (same `allurerc.mjs`
> as local runs: the Awesome report served directly with its Report | Graphs |
> Timeline modes, trend history per env/suite, latest-run redirect, `--keep`
> retention). GitHub does not serve that branch until Pages is enabled on the
> repo, and the first build has a known failure mode, so this is the full
> maneuver.

## When to run this

- The user asks to set up GitHub Pages, publish the Allure reports, enable the reports site, or asks why the report URL returns 404.
- `/test-framework-adaptation` finished wiring CI and the project wants browsable reports.
- The `Post Report URL` step of a suite run prints a URL that returns 404.

## Step 0: Allure version-currency check

Do this first. The site inherits whatever Allure version generates in CI, so an outdated local pin becomes an outdated public report. Run the **§Allure version-currency check** from `SKILL.md` §Local reporting: the pinned `allure` / `allure-playwright` / `allure-js-commons` versions are usually behind upstream by the time a scaffolded project reaches this setup. Summarize the news to the user, offer the same-major `bun update` (a major bump needs the user's explicit go-ahead), and regenerate one report to confirm the root `index.html` still opens the Awesome report directly (Report | Graphs | Timeline).

## Preconditions

Probe each one, do not assume it.

| Check | Command | Blocker if |
| --- | --- | --- |
| gh CLI authenticated | `gh auth status` | fails: stop, ask the user to `gh auth login` |
| gh-pages branch exists on origin | `git ls-remote --heads origin gh-pages` | empty: run a suite first (any Allure deploy creates it) |
| Repo visibility | `gh repo view --json visibility` | `PRIVATE`: check GitHub's current Pages plan rules and surface them to the user |
| Pages state | `gh api repos/{owner}/{repo}/pages` | `404` means not enabled: proceed with setup |

## Step 1: Enable Pages serving the gh-pages branch

```bash
gh api -X POST repos/{owner}/{repo}/pages \
  -f "source[branch]=gh-pages" -f "source[path]=/"
```

Success returns `"html_url": "https://{owner}.github.io/{repo}/"`. A `409 Conflict` means Pages is already enabled: check its source with `gh api repos/{owner}/{repo}/pages` and fix the branch if it points elsewhere (`gh api -X PUT ... -f "source[branch]=gh-pages"`).

## Step 2: Verify the first build

The first build after enablement, on a branch that already has content, can fail silently: a generic "Page build failed." or a long hang in `building`. Pushing commits to wake it up does not help; request a rebuild instead.

```bash
# status of the latest build
gh api repos/{owner}/{repo}/pages/builds/latest --jq '{status, error: .error.message}'

# if status is "errored" (or stuck "building" for >10 min): force a rebuild
gh api -X POST repos/{owner}/{repo}/pages/builds
```

Poll `builds/latest` until `status: built`, then confirm with curl:

```bash
curl -s -o /dev/null -w "%{http_code}" https://{owner}.github.io/{repo}/{env}/regression/
```

`{env}` is the project's active environment (for example `staging`). Expect `200`.

## Step 3: Long-term storage hygiene

The branch grows two ways, and each has its own control.

1. Working tree. `scripts/ci/publish-allure-pages.ts` prunes run dirs per env/suite to the `--keep` default it declares (adjustable in each workflow). Screenshots and videos live inside each report and rotate with it; `history.jsonl` (trend data) persists independently and stays small.
2. Git history. Run pruning does not touch it: every deploy commit keeps its blobs forever, so the branch grows on every run even though the served site does not. The fix is a scheduled squash job that rewrites `gh-pages` to a single orphan commit holding the current content. This is the only sanctioned force-push in the project, because `gh-pages` is entirely workflow-generated and nobody develops on it. The template runs monthly and on demand: copy `.github/workflows/pages-squash.yml` verbatim from the boilerplate source repo (upex-galaxy/agentic-qa-boilerplate); it is repo-agnostic.

## Report to the user

- The site URL and the per-suite report URLs (`/{env}/regression/`, `/{env}/smoke/`, `/{env}/sanity/`, whichever workflows the project runs).
- Whether the squash job was installed (recommended: yes).
- On public repos the reports are public, and screenshots can leak UI or data of the app under test. Ask whether the team accepts that or wants the repo private (check GitHub's current Pages plan rules).
- If the team needs reports behind a login, switch to the private Test Report Portal mode: `references/private-hosting-setup.md`. The suite workflows are already dual-mode, so only secrets get wired.

## Who holds the gates

The stops in this file are the `gh auth login` request, the version-bump go-ahead in Step 0, the private-repo Pages-plan question, and the public-exposure question in the report. Decision rules: `agentic-qa-core/references/decision-protocol.md`.

- A person is present: ask them as written.
- A supervised worker: the conductor or launcher answers, and the worker reports the question instead of guessing.
- A routine with nobody: the delegating brief is the approval source when it covers the decision. Without one, do the reversible work (probes, regenerating a report), skip the same-major update, the Pages enablement on a private repo and the squash-job install, and report what is waiting.

## Scope guard

This reference sets up Allure report publishing for consumer projects. The boilerplate's own `pages.yml` (docs hub: KATA Academy, decks, homepage) belongs to the boilerplate alone. Do not replicate it in a consumer project; the scaffolder excludes it on purpose.
