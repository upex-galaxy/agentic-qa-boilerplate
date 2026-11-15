# SDET integration trunk: chained test-automation suites

This is the runbook behind the `sdet` strategy. The catalogue entry is in `branching-strategies.md` and the materialization row in `strategy-setup.md`; the catalogue holds the what, this file holds the per-suite and per-ticket how.

`sdet` automates a multi-ticket test suite (a whole module, or a chained ticket-driven scope from `/test-automation`) without one giant unreviewable PR, without a tiny PR per ticket fighting `main`'s rulesets, and without a polluted final diff. It is the standing mode for test-automation suites, not a large-change exception.

---

## TL;DR

- One integration trunk acts as the local stand-in for `main` for the whole suite (for example `test/checkout-suite`). It is ephemeral per suite: created when the suite starts, deleted after the final PR merges.
- Each ticket is cut from the trunk (never stacked on the previous ticket branch), worked, validated locally on both `local` and `staging`, pushed, run through Sanity CI, PR'd into the trunk (not `main`), reviewed, fixed, and merged with `--no-ff` (never squash).
- The next ticket is cut from the updated trunk after each merge.
- Adjacent non-test work (docs, tooling, fixes) goes on Plus Branches inserted between tickets; they PR into the trunk like ticket branches.
- Before the final PR, a sync gate (`git merge origin/main`) runs on the trunk so the `trunk → main` diff shows only this suite's test work.
- A single pre-reviewed PR goes from the trunk to `main`, the only PR that faces `main`'s rulesets.

The idea to hold onto: the trunk is the suite's `main`. Staying off `main` until the very end means returning to the trunk after every ticket.

---

## Trunk naming convention

`<module>`, `<KEY>` and `<slug>` in this document are placeholders. Substitute the real values; the examples (`checkout`, `BK-742`) only show the shape.

The trunk name comes from the suite's scope, the `/test-automation` planning scope that opened it:

| Scope (from `/test-automation`) | Trunk name pattern | Example |
| --- | --- | --- |
| **Module-driven** (Macro): a whole module | `test/<module-slug>-suite` | `test/checkout-suite` |
| **Ticket-driven** (Medium): one user story split across several PRs | `test/<STORY-KEY>-<slug>-suite` | `test/BK-742-checkout-suite` |
| **Discovery-driven**: a module's gaps (Macro) or one gap (Medium) | `test/<module-slug>-suite`, or `test/<TECHSTORY-KEY>-<slug>-suite` | `test/checkout-suite` |
| **Bug-driven** (Micro): a single TC | usually no trunk: one `test/{KEY}-{slug}` branch straight to a normal PR; spin up a trunk only if the single TC fans into several chained PRs |

Name the trunk after whatever the suite is about: a module slug when automating a module, the story key and slug when chaining PRs under one story. The `-suite` suffix is scope-neutral on purpose, because one trunk collects whatever the chained PRs are (E2E specs, integration specs, a mix of UI and API ATCs). Keep it lowercase, hyphen-separated, 50 characters or fewer, and unique per live suite.

---

## The diagram

```
            main  (protected: rulesets + required checks)
              │
              │  ① integration trunk = local surrogate-main for the suite
              ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │   test/checkout-suite        ←  INTEGRATION TRUNK (ephemeral)      │
   │   created off main + pushed immediately so ticket PRs have a target       │
   └────────────────────────────────────────────────────────────────────────┘
        │
        │ ② cut ─►  test/{KEY}-{slug}    (one ticket)
        │            • Plan → Code → Review (KATA, /test-automation)
        │            • LOCAL PASS on `local` AND `staging`   ← gate before push
        │            • push → Sanity CI on the branch (workflow_dispatch)
        │            • PR  ➜  trunk  (NOT main)
        │            • review loop → fix → re-run Sanity
        │   merge ◄──┘  --no-ff  (preserves the ticket's commits + a merge commit)
        │
        │ ③ cut from the UPDATED trunk (not from the previous ticket)
        │   ─►  test/{KEY}-{slug}   …same loop…   merge ◄──┘ --no-ff
        │
        │ ◇ (optional) PLUS BRANCH between tickets — docs/chore/fix → PR ➜ trunk
        │
        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │   test/checkout-suite   (now carries every ticket + plus history)  │
   └────────────────────────────────────────────────────────────────────────┘
              │
              │  ④ SYNC GATE: git merge origin/main   (after every upstream PR is on main)
              │       cancels duplicated/squashed upstream content → clean final diff
              │
              │  ⑤ ONE final PR  ➜  main   ← the only PR that faces rulesets
              ▼
            main      → trunk deleted after merge
```

---

## The per-ticket loop (the unit of work)

For each ticket `{KEY}` (the issue key from the TMS, for example `{{PROJECT_KEY}}-757`):

```bash
# 0. Start from a clean, up-to-date trunk
git checkout test/<module>-suite
git pull --ff-only                       # the trunk moves forward only

# 1. Cut the ticket branch FROM the trunk (never from the previous ticket branch)
git checkout -b test/{KEY}-{slug}

# 2. Plan → Code → Review  (/test-automation: Phase 0..3)

# 3. LOCAL VALIDATION GATE — must PASS on both environments before push
#    (catches env-coupled flakiness: local build/SPA divergence + staging data assumptions)
bun run test <path/to/new.spec.ts>       # against `local`  (active_env = local)
bun run test <path/to/new.spec.ts>       # against `staging` (active_env = staging)
bun run types:check
bun run lint:check

# 4. Push + Sanity CI on the branch
git push -u origin test/{KEY}-{slug}
#    trigger the Sanity/smoke suite via GitHub Actions (/regression-testing, workflow_dispatch)

# 5. PR INTO the trunk (NOT main)
gh pr create --base test/<module>-suite --head test/{KEY}-{slug}

# 6. Review loop
#    - address Critical + High; triage Low; re-run Sanity after fixes
#    - optional adversarial gate: /judgment-day on a large or scaffolding-touching diff
#    - iterate until review is quiet (max 2 revision rounds per /test-automation rule)

# 7. Merge into the trunk preserving history
gh pr merge --merge   # merge commit (--no-ff equivalent); NEVER squash here

# 8. Next ticket → back to step 0 (cut from the now-updated trunk)
```

### Hard gates

| Gate | Why |
| --- | --- |
| Cut each ticket from the trunk, after the prior merge | Stacking ticket B on ticket A before A merges leaks A's diff into B's PR and breaks per-ticket review scoping. |
| Local PASS on `local` and `staging` before push | `local` catches build and SPA divergence, `staging` catches data assumptions. The double pass is Critical Rule #7 (tests, then types, then lint), fully satisfied and never skipped. |
| `--no-ff` (merge commit), never squash, into the trunk | Keeps each ticket's commit detail so the consolidated history reads like several branches merged. Squash here flattens the history the suite exists to keep. |
| Sync gate (`git merge origin/main`) before the final PR | The only thing that guarantees a clean `trunk → main` diff. See below. |
| Forward-only on the pushed trunk | Merge, never rebase or force-push (Critical Rule #6). |

### Several workers on one suite

The loop above is written for one session walking the chain, and that stays the default. When a fleet works a batch (`.agents/skills/test-automation/references/batch-fleet.md`), the shape changes in exactly three places:

- Ticket branches are cut from the trunk in parallel: each worker in its own worktree, each branch off the trunk's then-current tip. Still never off another ticket branch.
- The trunk has one writer. Only the conductor merges into it, one PR at a time, in an order it decides; a worker opens its PR and stops. Step 0 ("start from a clean, up-to-date trunk") becomes the conductor's job between merges, and a worker whose branch is now behind re-merges the trunk into its branch instead of waiting.
- After each merge the conductor regenerates `kata-manifest.json` and re-runs the suite on the merged state, because two green branches can be red together.

The sync gate, the final PR, `--no-ff` and the local double-env gate are unchanged. The double-env gate runs in each worker's own worktree.

---

## Reading the Sanity-CI gate (infra failures vs real test failures)

A red Sanity-CI job does not always mean the change is bad: the job goes red for any failed step, including infra steps unrelated to the tests. Read the test step, not the job conclusion. `/regression-testing` owns failure classification (REGRESSION / FLAKY / ENVIRONMENT / KNOWN / NEW-TEST).

- Real test failure: a `TC-xxx` FAIL or assertion error inside the test step. Fix it and re-run. This is what the gate exists for; a local pass that fails here is the gate doing its job.
- Infra or ENVIRONMENT failure: auth or secrets drift, artifact-quota upload errors, a missing browser, runner issues. Not a code defect.

### CI-fallback clause (infra-red or known flake): integration merges only

When the CI red is purely infra or a known pre-existing flake, proven by both of:

1. the change passing locally on both `local` and `staging`, and
2. the same red being present independent of the change (the nightly suite is already red, or the failing line is in shared pre-existing code),

then:

- the local double-pass is the authoritative signal for merging into the trunk (never for the final `trunk → main` PR), and
- a separate infra or flake ticket is filed and referenced in the ticket PR.

This keeps the chain moving without lowering the bar for `main`. It does not skip Critical Rule #7: local tests, types and lint all still pass, and the clause only governs whether a remote infra-red blocks a trunk-internal merge. The final `trunk → main` PR still needs a genuinely green test step, or the infra fixed first. `/regression-testing` has the ENVIRONMENT-class classification the clause depends on.

---

## Plus Branches (adjacent non-test work)

While a suite is automated, unrelated local changes pile up: tooling tweaks, `.gitignore`, sprint docs, PBI folders for other tickets, scratch SQL. They need a commit, and they must stay out of the `test/*` ticket branches, where they would pollute the ticket's diff and the final suite diff.

A Plus Branch is inserted between the end of one ticket and the start of the next, carrying only that adjacent work. It flows through the chain like a ticket branch: PR into the trunk, `--no-ff` merge.

```bash
# After finishing a ticket, before cutting the next:
git checkout test/<module>-suite
git pull --ff-only
git checkout -b chore/<batch-descriptor>     # or docs/<...>, fix/<...>
git add <only the adjacent files>            # be surgical — never `git add .`
git commit -m "chore: <what>"
git push -u origin chore/<batch-descriptor>
gh pr create --base test/<module>-suite ...    # PR into the trunk like the rest
gh pr merge --merge
```

Rules for Plus Branches:

- Prefix by content type per the repo branch convention: `docs/` (markdown, context, skills), `chore/` (tooling, config, deps), `fix/` (bugfixes). The `test/` prefix is reserved for automation ticket branches.
- One Plus Branch may batch several unrelated adjacent changes when they share a content type by predominance. If two content types are large, split into two Plus Branches.
- Uncommitted changes follow you across `git checkout -b`. If adjacent changes are still uncommitted when you cut a ticket branch, stage with explicit paths (`git add <path>`) so they do not sweep into the ticket commit. When in doubt, stash only your own paths (`git stash push -- <paths>`) before cutting the ticket branch and pop them onto a Plus Branch later. An untargeted `git stash` is off the table (Critical Rule #15).

> A project's standing "owner pushes docs directly to `main`" exception, if it has one, applies to adjacent work done outside an active suite. While a suite is in flight, adjacent work rides a Plus Branch into the trunk so the final `trunk → main` diff stays coherent.

---

## The sync gate (why the final diff stays clean)

GitHub computes a PR's "Files changed" as a three-dot diff from the merge base: `git diff $(git merge-base main <trunk>) <trunk>`. It shows everything the trunk added since the fork point and does not subtract what `main` did independently.

So:

- Upstream PRs merged to `main` by squash get a new SHA. The trunk still carries the original commits, and they reappear in the final diff.
- An upstream PR merged by merge-commit or rebase (SHAs preserved) enters `main`'s ancestry and cancels from the trunk diff.

The mitigation applies however upstream merged. Right before opening the final PR, once every upstream PR is on `main`, run inside the trunk:

```bash
git checkout test/<module>-suite
git fetch origin
git merge origin/main          # merge, NOT rebase (forward-only; no force-push on a pushed branch)
```

Duplicated content is identical, so the 3-way merge auto-resolves with no net change. Afterwards `main` is fully contained in the trunk's ancestry, the merge base becomes `main`'s tip, and the diff collapses to this suite's test work. Verify before the PR:

```bash
git diff origin/main...HEAD --stat     # should list ONLY tests/** + this suite's specs
```

---

## Final PR to main

This is the only PR that must satisfy `main`'s branch protection (required checks and rulesets). How much history survives depends on the merge method the repo allows on `main`:

- If `main` allows merge-commit, the per-ticket `--no-ff` structure survives and the merge looks like several branches merged. That is the intended outcome.
- If `main` forces squash, the whole suite collapses to one commit on `main`. The detailed chain still lives on the pushed trunk and its merged ticket PRs for traceability, but `main`'s first-parent history shows one commit. Confirm the repo's merge setting before counting on the multi-branch look.

Title the final PR after the suite, not a single ticket (for example `test(checkout): automate E2E suite {KEY1}…{KEYn}`), and list the contained tickets and their TC IDs in the body for TMS traceability. Use the body structure in `references/pr-test-automation.md`.

After the final PR merges and CI is green on `main`, delete the trunk (`git push origin --delete test/<module>-suite`); the next suite starts a fresh trunk.

---

## TC / backlog lifecycle interaction

The TMS lifecycle runs per ticket, anchored to the ticket-branch PR, not to the final `trunk → main` PR. Status transitions go through `/test-documentation` and `[ISSUE_TRACKER_TOOL]` (`/acli`); this skill does not make them. Check the exact status names against `.agents/jira-workflows.json` before transitioning.

| Moment | Action |
| --- | --- |
| Start of a ticket (`/test-automation` Phase 0) | Ticket → In Progress; TCs → In Automation (or reuse Candidate). |
| Ticket PR opened into the trunk (Phase 3) | TCs → Pull Request (`create_pr`). |
| Ticket PR merged into the trunk | Leave at Pull Request. The code is not on `main` yet, so it is not Automated. |
| Final `trunk → main` PR merged + CI green on `main` | TCs → Automated; tickets → Done. |

> "Automated" means running in CI on `main`. Merging into the trunk is not that, so the Automated and Done flips for every ticket happen after the final merge, in one post-merge pass. The CI reporter owns test status (PASSED/FAILED); nobody sets it by hand.

---

## Resume: the Git Ledger in `progress.md`

A suite spans many ticket branches and several `/test-automation` invocations. A resuming session (another agent, new context, after a compaction) has to know how the trunk was left without re-deriving it from `git log`. That state is persisted append-only in the suite's `progress.md` `git:` field, the Git Ledger (schema in `agentic-qa-core/references/session-management.md` §7).

Who writes it: the orchestrator, at every branch action in the per-ticket loop, never a subagent and never by rewriting. Append a new phase entry with a fresh `git:` line; the latest one in the tail is the current truth.

Append a `git:` line (one snapshot each) when:

- the trunk is created off `main` (suite start): `trunk test/<module>-suite@<sha> | pending: <KEY..KEY> | sync-gate: no | final-PR: none`
- a ticket merges `--no-ff` into the trunk: `trunk …@<new-sha> | merged test/{KEY} --no-ff | pending: <remaining KEYs> | …`
- a Plus Branch merges: `… | merged chore/<desc> --no-ff | …`
- the sync gate runs (`git merge origin/main`): `… | sync-gate: done | …`
- the final PR opens: `… | final-PR: #NN (open)`
- the final PR merges and the trunk is deleted: `… | final-PR: #NN merged | trunk deleted`

Recommended line shape (append-only; a prior line is never edited):

```
- git: trunk test/checkout-suite@a1b2c3d | merged test/BK-757 --no-ff | pending: BK-758..BK-761 | sync-gate: no | final-PR: none
```

On resume (Phase 0), read the tail of `progress.md` and take the last `git:` line. It gives the trunk name and tip SHA, which tickets are merged, which remain, whether the sync gate has run and whether the final PR is open. Continue the per-ticket loop from there by cutting the next pending ticket from the updated trunk. This keeps the SDET flow on track even when a later session has lost the strategy context.

---

## With nobody at the keyboard

Three points in this runbook wait for judgment. The rule for each, for the cases a person is not the one deciding (the person-present path is unchanged):

| Point | Supervised worker | Routine or no one present |
| --- | --- | --- |
| Review loop (step 6) | The conductor reviews and holds the gate; a worker opens its PR and stops. | Do the local gate and the push of the ticket branch only if the delegating brief covers pushes; otherwise stop with the branch committed locally and report. |
| CI-fallback clause | The conductor decides whether the red is ENVIRONMENT-class. | Merge into the trunk only when the brief authorizes it and both proofs hold; otherwise leave the PR open and report the red. |
| Final `trunk → main` PR and trunk deletion | The conductor opens and merges it. | An outward and irreversible action: do the sync gate and the diff check, then stop and report. Open the PR only when the brief names it. |

`agentic-qa-core/references/decision-protocol.md` has the general rule for what reaches a person.

---

## Setup checklist (one-time, per suite)

1. Pick the trunk name: `test/<module>-suite` (for example `test/checkout-suite`).
2. Cut it off `main` and push it so ticket PRs have a target. The Branch operation does this on demand; Strategy Setup does not create the trunk.
3. Confirm any prerequisite upstream PRs the trunk base already contains are queued to merge to `main`, so the sync gate can later cancel them.
4. Park current adjacent uncommitted work for a later Plus Branch (or `git stash push -- <paths>` it) to keep it out of ticket branches.

## Per-ticket checklist

- [ ] Pre-flight: Playwright browser installed (`bunx playwright install chromium`); API tokens fresh; CI secrets mirror `.env` (quotes stripped); local servers up if the `local` gate will run.
- [ ] Cut from the up-to-date trunk.
- [ ] Plan → Code → Review (KATA, `/test-automation`).
- [ ] Local PASS on `local` AND `staging`; `types:check`; `lint:check`.
- [ ] Push; Sanity CI, reading the test step and not the job conclusion (apply the CI-fallback clause only if the red is infra or a known flake).
- [ ] PR into the trunk; review loop until quiet.
- [ ] Merge `--no-ff` into the trunk; cut the next ticket from the updated trunk.

## Suite-close checklist

- [ ] All tickets merged into the trunk.
- [ ] Sync gate: `git merge origin/main`; `git diff origin/main...HEAD --stat` shows only test work.
- [ ] Final PR `trunk → main`; rulesets and required checks satisfied (genuinely green, no CI-fallback here).
- [ ] Post-merge: TCs → Automated, parent tickets → Done, CI green on `main`; delete the trunk.
