# Upstream Feedback — filing a skill problem against the boilerplate

> Cited by: the failure / blocker path of every workflow skill, and by `skill-refinement-protocol.md` §4 (a refinement whose target skill is synced from upstream).
> The session DRAFTS; the owner FILES. Filing is an outward-facing write on a public repository and the one moment a consumer's data can leak, so it is never autonomous.

---

## 1 · Which repository (never hardcoded in a skill)

Resolve in this order, the same order the updater uses:

| # | Source | Meaning |
|---|---|---|
| 1 | `UPEX_TEMPLATE_REPO` env var (`cli/update-boilerplate.ts`) | a project following a fork files against the fork it pulls from |
| 2 | `template` field of `.template/installer.lock.json` | the template this repo was scaffolded from (every scaffolded repo has it) |
| 3 | neither | this checkout IS the boilerplate: fix locally via `/framework-development`, no issue |

## 2 · The draft

Write `.session/<workflow-slug>/<scope>/upstream-issue-NN.md` (a companion file inside the running skill's scope) with:

- **skill** + its `metadata.kind`
- **upstream cursor**: the content hash in `.template/upstream-sha/<slug>.sha` when present (written by `cli/lib/updater-drift.ts`), else the `cliVersion` from `.template/installer.lock.json`
- **stage / step** where it broke
- **expected** vs **observed**
- **proposed fix**: a diff against the upstream file, or prose
- **evidence**: date, session label, what was measured

## 3 · Redaction gate (applied BEFORE the draft is shown)

| Rule | How |
|---|---|
| Jira keys | replace every `{{PROJECT_KEY}}-\d+` with `PROJ-NNN` |
| Hosts | strip every host from `.agents/project.yaml` (`issue_tracker.atlassian_url`, every `environments.*.web_url` / `api_url`) |
| Never quoted | `.context/PBI/**` (a Jira mirror), `.env`, git author identity, customer data |
| Quoted verbatim | only paths under `.agents/skills/<slug>/`, `scripts/`, `cli/` |

Line-by-line test the session applies: **every literal in the draft either exists in the upstream repo or is a placeholder.**

## 4 · Show, ask, file, verify

1. Show the redacted draft. Ask for an explicit OK through the harness prompt (one question). No OK, no filing.
2. On OK:

```bash
gh issue create --repo <upstream> \
  --title "[skill-feedback] <slug>: <one line>" \
  --body-file .session/<workflow-slug>/<scope>/upstream-issue-NN.md \
  --label skill-feedback --label "skill:<slug>" --label "kind:<kind>"
```

3. **Verify at the destination** (Critical Rule #16): `gh issue view <url>` must print the title and the three labels. The URL returned by `create` is a receipt, the `view` is the proof.
4. Record the URL in the matching `refinements.md` block (`skill-refinement-protocol.md` §3).
5. No `gh` auth or no network: print the draft path and `https://github.com/<upstream>/issues/new?template=skill-feedback.yml` for manual filing. Never block the workflow on it.

## 5 · Upstream side, once

The issue form `.github/ISSUE_TEMPLATE/skill-feedback.yml` pre-applies `skill-feedback`; the CLI adds `skill:<slug>` and `kind:<kind>`. The three label families are created once by the repository owner (`gh label create`), never by a session.
