# SDET Integration-Trunk — Chained Test-Automation Suites

This file is the heavy runbook behind the `sdet` strategy (catalogue entry in `branching-strategies.md`, materialization row in `strategy-setup.md`). The strategy catalogue holds the WHAT; this file holds the per-suite, per-ticket HOW.

`sdet` is the strategy for automating a multi-ticket test suite (an entire module, or a chained ticket-driven scope from `/test-automation`) **without** one giant unreviewable PR, **without** one tiny PR per ticket fighting `main`'s rulesets, and **without** a polluted final diff. It is the standing operational mode for test-automation suites — not a large-change exception.

---

## TL;DR

- One **integration trunk** acts as the local surrogate-`main` for the whole suite (e.g. `test/monthly-statement-suite`). It is **ephemeral per suite**: created when the suite starts, deleted after the final PR merges.
- Each ticket is cut **from the trunk** (never stacked on the previous ticket branch), worked, validated locally on **both `local` and `staging`**, pushed, Sanity-CI'd, PR'd **into the trunk** (not `main`), reviewed, fixed, and merged with **`--no-ff`** (never squash).
- The next ticket is cut from the **updated trunk** after each merge.
- Adjacent non-test work (docs / tooling / fixes) is parked in **Plus Branches** inserted between tickets; they PR into the trunk like ticket branches.
- Before the final PR, a **sync gate** (`git merge origin/main`) runs on the trunk so the `trunk → main` diff shows only this suite's test work.
- A single, pre-reviewed PR goes **trunk → main** — the only PR that faces `main`'s rulesets.

The core insight: the integration trunk is a "`main` surrogate" for the suite. "Never go back to `main`" really means "return to the trunk instead, until the very end."

---

## Trunk naming convention

`<module>`, `<KEY>`, `<slug>` in this document are **placeholders** — substitute the real values. Do NOT copy the literal examples (`monthly-statement`, `BK-742`); they only illustrate the shape.

The trunk name derives from the **suite's scope** (the `/test-automation` planning scope that opened it):

| Scope (from `/test-automation`) | Trunk name pattern | Example |
| --- | --- | --- |
| **Module-driven** (Macro) — a whole module | `test/<module-slug>-suite` | `test/monthly-statement-suite` |
| **Ticket-driven** (Medium) — one user story split across several PRs | `test/<STORY-KEY>-<slug>-suite` | `test/BK-742-checkout-suite` |
| **Regression-driven** (Micro) — a single TC | usually **no trunk** — one `test/{KEY}-{slug}` branch straight to a normal PR; only spin up a trunk if the single TC genuinely fans into multiple chained PRs |

Rule of thumb: the trunk is named after **whatever the suite is about** — a module slug when automating a module, the story key+slug when chaining PRs under one story. The `-suite` suffix is deliberate and scope-neutral: a single trunk collects whatever the chained PRs are — E2E specs, integration specs, or a mix of UI and API ATCs — so `-suite` covers all of them without implying the work is only end-to-end. Keep it lowercase, hyphen-separated, ≤50 chars, and unique per live suite.

---

## The diagram

```
            main  (protected: rulesets + required checks)
              │
              │  ① integration trunk = local surrogate-main for the suite
              ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │   test/monthly-statement-suite        ←  INTEGRATION TRUNK (ephemeral)      │
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
   │   test/monthly-statement-suite   (now carries every ticket + plus history)  │
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

For each ticket `{KEY}` (the issue key from the TMS, e.g. `{{PROJECT_KEY}}-757`):

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

### Hard gates (do not skip)

| Gate | Why |
| --- | --- |
| Cut each ticket from the trunk, **after** the prior merge | Stacking ticket B on ticket A before A merges leaks A's diff into B's PR and breaks per-ticket review scoping. |
| Local PASS on **`local` AND `staging`** before push | Consistency across environments; `local` catches build/SPA divergence, `staging` catches data assumptions. This local double-pass IS Critical Rule #7 (tests → types → lint) — fully satisfied, never skipped. |
| **`--no-ff`** (merge commit), **never squash**, into the trunk | Preserves each ticket's commit detail so the consolidated history "reads like multiple branches merged." Squash here flattens the very history the suite wants to keep. |
| **Sync gate** (`git merge origin/main`) before the final PR | The only thing that guarantees a clean `trunk → main` diff. See below. |

---

## Reading the Sanity-CI gate (infra failures vs real test failures)

A red Sanity-CI job does **not** always mean the change is bad — the job goes red for any failed step, including infra ones unrelated to the tests. Before reacting, read the test **step**, not the job conclusion. Failure classification is owned by `/regression-testing` (REGRESSION / FLAKY / ENVIRONMENT / KNOWN / NEW-TEST).

- **Real test failure** — a `TC-xxx` FAIL / assertion error inside the test step → fix it (the fix → re-run loop). This is exactly what the gate exists for; a local pass that fails here is the gate earning its keep.
- **Infra / ENVIRONMENT failure** — auth/secrets drift, artifact-quota upload errors, missing browser, runner issues → not a code defect.

### CI-fallback clause (infra-red / known-flake) — integration merges ONLY

When the CI red is purely infra or a known pre-existing flake, **proven by both** of:

1. the change passing locally on **both** `local` and `staging`, AND
2. the same red being present independent of the change (nightly suite already red, or the failing line is in shared pre-existing code),

then:

- the local double-pass is the authoritative signal for merging **into the trunk** (never for the final `trunk → main` PR), and
- a separate infra/flake ticket is filed and referenced in the ticket PR.

This keeps the chain moving without lowering the bar for `main`. **The CI-fallback clause is NOT a skip of Critical Rule #7** — local tests/types/lint still all pass; it only governs whether a *remote* infra-red blocks a *trunk-internal* merge. The final `trunk → main` PR still requires a genuinely green test step (or the infra fixed first). See `/regression-testing` for the ENVIRONMENT-class classification this clause depends on.

---

## Plus Branches (adjacent non-test work)

While automating a suite, unrelated local changes accumulate — tooling tweaks, `.gitignore`, sprint docs, PBI folders for other tickets, scratch SQL. These must be committed somehow but must **not** ride inside a `test/*` ticket branch (they pollute the ticket's diff and the final suite diff).

A **Plus Branch** is inserted between the end of one ticket and the start of the next, carrying only that adjacent work. It flows through the chain exactly like a ticket branch — PR into the trunk, `--no-ff` merge.

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

**Rules for Plus Branches:**

- Prefix by content type per the repo branch convention: `docs/` (markdown, context, skills), `chore/` (tooling, config, deps), `fix/` (bugfixes). **Never `test/`** — that prefix is reserved for automation ticket branches.
- One Plus Branch may batch several unrelated adjacent changes as long as they share a content type by predominance. If two content types are large, split into two Plus Branches.
- **Working-tree carry-along caveat**: uncommitted changes follow you across `git checkout -b`. If you leave adjacent changes uncommitted while cutting a ticket branch, `git add .` discipline is required to avoid sweeping them into the ticket commit. When in doubt, `git stash` before cutting a ticket branch and pop onto a Plus Branch later.

> Owner-direct-to-`main` interaction: a project's standing "owner pushes docs directly to `main`" exception (if it has one) applies to adjacent work done **outside** an active suite. While a suite is in flight, adjacent work rides a Plus Branch into the trunk so the final `trunk → main` diff stays coherent.

---

## The sync gate (why the final diff stays clean)

GitHub computes a PR's "Files changed" as a three-dot diff from the merge base: `git diff $(git merge-base main <trunk>) <trunk>`. It shows everything the trunk added since the fork point and does **not** subtract what `main` did independently.

Consequences:

- Upstream PRs merged to `main` via **squash** get a new SHA. The trunk still carries the original commits → they reappear in the final diff.
- An upstream PR merged via **merge-commit / rebase** (preserving SHAs) enters `main`'s ancestry and cancels from the trunk diff.

**Mitigation (always applies, regardless of how upstream merged)** — right before opening the final PR, once every upstream PR is on `main`, run inside the trunk:

```bash
git checkout test/<module>-suite
git fetch origin
git merge origin/main          # merge, NOT rebase (forward-only; no force-push on a pushed branch)
```

Duplicated content is identical, so the 3-way merge auto-resolves with no net change. After this, `main` is fully contained in the trunk's ancestry, the merge base becomes `main`'s tip, and the diff collapses to only this suite's test work. Verify before the PR:

```bash
git diff origin/main...HEAD --stat     # should list ONLY tests/** + this suite's specs
```

---

## Final PR to main

This is the **only** PR that must satisfy `main`'s branch protection (required checks + rulesets). History preservation depends on `main`'s allowed merge method, configured on the repo:

- If `main` allows **merge-commit** → the per-ticket `--no-ff` structure survives; the merge "looks like multiple branches merged" — the intended outcome.
- If `main` forces **squash** → the whole suite collapses to one commit on `main`. The detailed chain still lives on the (pushed) trunk and its merged ticket PRs for traceability, but `main`'s first-parent history shows a single commit. **Confirm the repo's merge setting before relying on the multi-branch look on `main`.**

Title the final PR after the **suite**, not a single ticket (e.g. `test(monthly-statement): automate E2E suite {KEY1}…{KEYn}`), and list the contained tickets + their TC IDs in the body for TMS traceability. Use the `references/pr-test-automation.md` body structure.

After the final PR merges and CI is green on `main`, delete the trunk (`git push origin --delete test/<module>-suite`); the next suite starts a fresh trunk.

---

## TC / backlog lifecycle interaction

The TMS lifecycle runs **per ticket**, anchored to the ticket-branch PR — not to the final `trunk → main` PR. Status transitions are executed via `/test-documentation` + `[ISSUE_TRACKER_TOOL]` (`/acli`); never by this skill. Cross-check the exact status names against `.agents/jira-workflows.json` before transitioning.

| Moment | Action |
| --- | --- |
| Start of a ticket (`/test-automation` Phase 0) | Ticket → In Progress; TCs → In Automation (or reuse Candidate). |
| Ticket PR opened into the trunk (Phase 3) | TCs → In Review. |
| Ticket PR **merged into the trunk** | Do NOT flip to Automated. The code is not on `main` yet. Leave at In Review. |
| Final `trunk → main` PR merged + CI green on `main` | TCs → Automated; tickets → Done. |

> "Automated" means running in CI on `main`. Merging into the trunk is not that. The Automated / Done flips for every ticket happen after the final merge, in one post-merge pass. Test status (PASSED/FAILED) is never set manually — the CI reporter owns it.

---

## Resume — the Git Ledger in `progress.md`

A suite spans many ticket branches and multiple `/test-automation` invocations. A resuming session (different agent, new context, or after a compaction) must know **how the trunk was left** without re-deriving it from `git log`. That state is persisted append-only in the suite's `progress.md` `git:` field — the **Git Ledger** (schema in `agentic-qa-core/references/session-management.md` §7).

**Who writes it**: the orchestrator, at every branch action in the per-ticket loop — never a subagent, never by rewriting. Append a new phase entry with a fresh `git:` line; the latest one in the tail is the current truth.

**When to append a `git:` line** (each is one snapshot):

- Trunk created off `main` (suite start) → `trunk test/<module>-suite@<sha> | pending: <KEY..KEY> | sync-gate: no | final-PR: none`
- Ticket merged `--no-ff` into the trunk → `trunk …@<new-sha> | merged test/{KEY} --no-ff | pending: <remaining KEYs> | …`
- Plus Branch merged → `… | merged chore/<desc> --no-ff | …`
- Sync gate run (`git merge origin/main`) → `… | sync-gate: done | …`
- Final PR opened → `… | final-PR: #NN (open)`
- Final PR merged + trunk deleted → `… | final-PR: #NN merged | trunk deleted`

**Recommended line shape** (append-only — never edit a prior one):

```
- git: trunk test/monthly-statement-suite@a1b2c3d | merged test/BK-757 --no-ff | pending: BK-758..BK-761 | sync-gate: no | final-PR: none
```

**On resume (Phase 0)**: read the tail of `progress.md`, take the **last** `git:` line. It tells the resuming session: the trunk name + tip SHA, which tickets are already merged, which remain, whether the sync gate has run, and whether the final PR is open. From there, continue the per-ticket loop — cut the next pending ticket from the (updated) trunk. This is the reinforcement that keeps the SDET flow on track even if a later session has lost the strategy context.

---

## Setup checklist (one-time, per suite)

1. Pick the trunk name: `test/<module>-suite` (e.g. `test/monthly-statement-suite`).
2. Cut it off `main` and push it so ticket PRs have a target. (The Branch operation does this on demand — the trunk is NOT created by Strategy Setup.)
3. Confirm any prerequisite upstream PRs the trunk base already contains are queued to merge to `main` so the sync gate can later cancel them.
4. Park current adjacent uncommitted work for a later Plus Branch (or `git stash` it) — keep it out of ticket branches.

## Per-ticket checklist

- [ ] Pre-flight: Playwright browser installed (`bunx playwright install chromium`); API tokens fresh; CI secrets mirror `.env` (quotes stripped); local servers up if the `local` gate will run.
- [ ] Cut from the up-to-date trunk.
- [ ] Plan → Code → Review (KATA, `/test-automation`).
- [ ] Local PASS on `local` AND `staging`; `types:check`; `lint:check`.
- [ ] Push; Sanity CI — read the test step, not the job conclusion (apply the CI-fallback clause only if the red is infra/known-flake).
- [ ] PR into the trunk; review loop until quiet.
- [ ] Merge `--no-ff` into the trunk; cut the next ticket from the updated trunk.

## Suite-close checklist

- [ ] All tickets merged into the trunk.
- [ ] Sync gate: `git merge origin/main`; `git diff origin/main...HEAD --stat` shows only test work.
- [ ] Final PR `trunk → main`; satisfy rulesets / required checks (genuinely green — no CI-fallback here).
- [ ] Post-merge: TCs → Automated, parent tickets → Done, CI green on `main`; delete the trunk.

---

## Anti-patterns

- ❌ Stacking ticket B on ticket A's branch before A merges (leaks A's diff into B's PR).
- ❌ Squash-merging ticket branches into the trunk (flattens the history the suite wants to keep).
- ❌ Opening the final PR without the sync gate (noisy diff full of already-merged upstream content).
- ❌ Committing adjacent non-test work onto a `test/*` ticket branch instead of a Plus Branch.
- ❌ Flipping TCs to Automated when a ticket merges into the trunk (it is not on `main` yet).
- ❌ Using the CI-fallback clause for the final `trunk → main` PR (it is integration-only).
- ❌ `rebase` / force-push on the pushed trunk (use forward-only merges).
