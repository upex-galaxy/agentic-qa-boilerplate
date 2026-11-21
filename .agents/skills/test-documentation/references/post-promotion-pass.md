# Post-promotion `merged` pass (mode `post-promotion`)

Load only for mode `post-promotion`. The pass moves a TC from `{{jira.status.test_case.pull_request}}` to
`{{jira.status.test_case.automated}}` once its test code is on the production branch, and does only that: no Analyze, no ROI, no new Test, no verdict change. Canon:
`../../agentic-qa-core/references/discovery-driven-doctrine.md` §6.

`/git-flow-master` calls it when a promotion into the production branch merges ("Promotion landed on
`<production>`: run the post-promotion `merged` pass"). Under a single-branch strategy the ticket PR merges straight into the production branch and nothing hands the pass off, so run it on request after the merge. The `/test-automation` light stage verifier is the backstop: it finds a TC left at `{{jira.status.test_case.pull_request}}` with its spec already on the production branch.

> Prerequisite: load `/acli` before any `[ISSUE_TRACKER_TOOL]` call below. This pass transitions and comments on Jira issues, and it needs no confirmation when a person, a launcher or a delegating brief asked for it; a routine with none of those stops before step 5 and reports.

## 1. Inputs

| Input | Read from |
|---|---|
| The production branch | `git_strategy.branches.production` in `.agents/project.yaml` |
| The TCs to check | every `test_case` at `{{jira.status.test_case.pull_request}}`; an argument after the mode (a Story, a coverage Tech Story or a module) narrows it |
| Where each TC's code lives | the `automation-plan.md` that names the TC, under the Epic's committed `test-specs/` tree, as it reads on the production branch |

## 2. Steps

0. (Optional) If step 4 would otherwise wait on the next scheduled suite run and the project ships a
   `sanity.yml` workflow, dispatch it now for the TC's spec and let it finish: `gh workflow run sanity.yml
   --ref <production> -f environment=staging -f test_type=e2e -f test_file=<spec path>`. Skip when no
   `sanity.yml` workflow exists, or when CI timing already works for this project.
1. `git fetch origin <production>`.
2. List the TCs: `[ISSUE_TRACKER_TOOL] Search` with JQL
   `project = {{PROJECT_KEY}} AND status = "{{jira.status.test_case.pull_request}}"`, restricted to the `test_case`
   work type.
3. For each TC, both checks on `origin/<production>`:
   - **The ATC**: `git show origin/<production>:kata-manifest.json` lists an ATC whose id is the TC key.
   - **The spec file**: `git grep -l <TC_KEY> origin/<production> -- '.context/PBI/epics/*/test-specs/'` finds the
     automation plan; the test file it names exists, `git cat-file -e origin/<production>:<spec path>`.
   Check presence by path and not by commit ancestry, because a squash promotion rewrites the commits.
4. CI is green on the production branch: the suite workflow's latest run on `<production>` at or after the
   commit that carries the spec concluded `success` (`gh run list --branch <production> --json databaseId,conclusion,headSha`).
   With no run found, or a red one, the TC stays at `{{jira.status.test_case.pull_request}}` and the report says why.
5. Both checks and CI pass: fire `{{jira.transition.test_case.merged}}`, set labels `+automated -automation-candidate`,
   and comment `Automated: <spec path> on origin/<production>@<short sha>, CI <run url>`. An unmapped slug runs
   the fallback in `../../agentic-qa-core/references/artifact-lifecycle.md` §4.
6. Read every transitioned TC back through `[ISSUE_TRACKER_TOOL]` (the sync never writes a Test: `test_case`
   declares `sync: never`) and confirm the status
   (Critical Rule #16). A successful transition call does not prove the status; the read-back does.

## 3. What this pass does not do

- It does not fire `merged` for a merge into an integration branch or a suite trunk (`branches.integration`,
  `branches.ephemeral_pattern`), because that TC is not automated yet.
- It does not touch a TC at any other status, change a verdict or edit a Test body.
- It runs no git writes: it reads `origin/<production>` and never commits, merges or pushes.

## 4. Report

Report one table, then the light stage verifier lines that apply (`../../agentic-qa-core/references/artifact-lifecycle.md` §5):

```
| TC | Spec path | On <production> | CI | Action |
|----|-----------|-----------------|----|--------|
| <TC_KEY> | tests/e2e/<module>/<file>.test.ts | yes | <run id> success | merged, read back automated |
| <TC_KEY> | (not found) | no | n/a | stays at pull_request |
```
