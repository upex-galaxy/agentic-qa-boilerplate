# Batch Fleet: one automation batch, N parallel workers

By default a batch runs in this session, one Work Package at a time. This file covers the second executor: a **conductor** session partitions the batch and hands each part to a **worker**, a persistent session of its own in its own worktree that runs `/test-automation` on its slice.

It is a scoping and integration contract. The transport (how a worker is launched, supervised, asked a question and closed) belongs to `/agent-orchestration` and is written here as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode. Load that skill before firing any of it.

A fleet is optional. It is faster when the batch really is parallel and strictly worse when it is not, and the failure is not a slow suite: it is two sessions rewriting the same fixture file.

---

## 0 · Is a fleet the right executor?

| Batch shape | Executor |
|---|---|
| 1 Work Package | this session. No conductor, no worker, no launch file |
| 2 WPs, same module | this session, sequentially. They share components, so parallelism buys nothing and costs a merge |
| 3+ WPs over **disjoint** modules | fleet is available. Offer it; do not enter it unasked |
| 3+ WPs, all in one module | this session, sequentially. Partitioning is impossible (see §2) |
| User asked for parallel sessions | fleet, whatever the shape. Say which WPs will serialize inside a worker and why |

A fleet needs a conductor that stays alive for the whole batch. If the session that partitions the work is going to close, do not launch workers: write the launch file, hand it over, and let the next session adopt the run.

Offering the fleet is a question to the person. When nobody is present (a routine) or the launcher holds the gate, the delegating brief decides: a brief that asks for a fleet or names the workers is the approval, and without one the batch runs sequentially in this session, which is always safe. Decision protocol: `agentic-qa-core/references/decision-protocol.md`.

---

## 1 · The unit of delivery: a Work Package

A **Work Package (WP)** is one delivery unit, which is one `test-specs/<ID>/` spec: the `spec.md`, `automation-plan.md` and `atc/*.md` under `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<ID>/`. One WP is one Plan, Code and Review pass and one reviewable branch.

| WP origin | What `<ID>` is | Where its TC list comes from |
|---|---|---|
| **Sprint** | the Story key + slug | the Story's `Candidate` verdicts from `/test-documentation` (Stage 4). `Manual` and `Deferred` never enter a WP |
| **Discovery** | the Tech Story key + slug, or the module slug | the signed `Candidate` verdicts of the Tests on a coverage Tech Story (`../../agentic-qa-core/references/discovery-driven-doctrine.md` §3), scope `discovery-driven`, from `/test-documentation`. A bare gap is not a TC list: it goes to `/test-documentation` first |

Rules:

- A batch is a list of WPs, not a list of files or TCs. A TC outside a WP is outside the batch.
- A WP whose TC list fails the TC source gate (`../SKILL.md` §"TC source gate": every TC in the TMS with a signed `Candidate` verdict) is not ready to dispatch. The conductor runs the gate before partitioning and routes the failures to `/test-documentation`. A worker never routes, creates or scores a TC.
- A WP without a `spec.md` is not ready to dispatch either. Planning (Phase 1) belongs to the conductor or the worker, but it happens before the WP counts as assignable, because the partition in §2 is computed from the plan's component list.
- One WP never spans two modules. If its plan touches two, split it before partitioning: a cross-module WP pins two modules to one worker and serializes the rest of the batch behind it.

---

## 2 · Partition: component ownership by module

Partition by module, not by ticket. A worker owns a module's components (every `Api`, `Page` and `Steps` class of that module, plus its spec directories) for the whole batch. Every WP touching that module goes to that worker and runs sequentially inside it.

```
batch = [WP-1 … WP-n]
for each WP: modules(WP) = modules of the components its automation-plan.md creates or edits
group WPs by module  ->  one worker per module group
  |
  +- a worker's WPs run one after another, Plan -> Code -> Review each
  +- two workers never share a module, not in the same round and not in different worktrees
  +- a WP that spans two modules goes to ONE worker, which then owns both
  +- a module group larger than the rest of the batch is the batch's critical path: say so up front
```

Two workers on one module collide in exactly the files with the least merge tolerance, because same-module WPs share Pages, Apis, fixtures and locators:

| Shared surface | Why it collides | Rule |
|---|---|---|
| `tests/components/api/*Api.ts`, `tests/components/ui/*Page.ts` | two workers add methods to the same class; both diffs are correct and the merge is a manual reconstruction | module ownership. One worker, one module |
| `tests/components/steps/*Steps.ts` | a Steps chain is shared across modules by design | the conductor owns cross-module Steps edits, or one named worker does and the others declare a claim (§8) |
| `tests/components/ApiFixture.ts`, `tests/components/UiFixture.ts` | every new component registers itself here, so every worker edits these two files | expect a conflict at integration and resolve it additively: keep both registrations, alphabetical, never "theirs" |
| `kata-manifest.json` | generated; two workers regenerate different truths | not hand-merged. The conductor regenerates it per integration (§6) |
| `api/schemas/` | generated by `bun run api:sync` | conductor-only (§4). A worker that needs a fresh schema asks for it |
| `.env`, `.auth/` | one writer, many readers | conductor-only (§4). That includes the browser state files (`.auth/<env>-<role>.json`): the conductor produces them, a worker only `state-load`s one into its own named session (`agentic-qa-core/references/browser-sessions.md` §7) |

---

## 3 · Topology: one worktree per worker

This skill writes code, so each worker gets its own worktree. Two sessions in one checkout contend on the single git index even when their files are disjoint, and the loser sees `index.lock` or a partially staged commit.

- The conductor creates the worktree and provisions it before launching the worker: a fresh worktree has the tracked files of its base and nothing else. `bun run worktree:provision` covers the gap (`.env`, dependencies, the harness skill alias, community skills, `.auth/`); the Jira cache is rebuilt separately with `bun run context:hydrate`. Full gap table: `agentic-qa-core/references/fleet-provisioning.md`.
- Check the new worktree's HEAD against the remote base before handing it over. A worktree cut from a stale local ref is born behind, and the worker's first push becomes a surprise merge.
- `.session/` is not in a worktree. Briefs, the roster and the launch file live in the primary checkout and are cited to the worker by absolute path.
- Creating, provisioning, launching and delivering the brief are one operation. A launched worker with no brief idles, and idle looks identical to working.

---

## 4 · Conductor-only operations

These surfaces have one writer. A worker that runs them races every sibling:

| Operation | Why conductor-only |
|---|---|
| `bun run api:login` (token mint) | the default token file is shared, and concurrent writers interleave. The conductor mints once and workers only read it. When a worker genuinely needs its own credential, the conductor mints an isolated set for it (`bun run api:login <env> --profile <label>`); a second concurrent login against the default path is the failure |
| `bun run api:sync` (OpenAPI types) | regenerates `api/schemas/` for everyone |
| issue-tracker / TMS **writes** (TC transitions, labels) | rate limits, and two sessions transitioning the same TC produce a contradictory history |
| `bun run kata:manifest` at integration time | see §6 |
| worktree creation and removal | includes the orphan audit before removal (`.agents/skills/git-flow-master/references/worktrees.md`) |

A worker that needs one of these asks for it. Workers still run their own local gate (`bun run test` / `types:check` / `lint:check`) inside their own worktree, which is not shared state.

---

## 5 · The per-worker brief

The brief is the 7-component briefing from `agentic-qa-core/references/briefing-template.md` plus the fleet fields. Write it to a file in the primary checkout and give the worker its absolute path, because a long brief pasted into a message gets truncated. Fleet fields and the reporting protocol: `/agent-orchestration` brief template and `/agent-orchestration` worker contract.

A `/test-automation` worker's brief nails down these points beyond the generic seven:

1. **Its WPs, in order**, each with the path of its `spec.md` / `automation-plan.md`. One WP at a time, no reordering, no scope growth. A WP that turns out to touch another worker's module means stop and report; the worker does not take it.
2. **File ownership**: the module's components it owns, and the explicit list of files it must not touch (`kata-manifest.json`, `api/schemas/`, another module's components).
3. **Fixture registration is expected to conflict.** Register the component normally in `ApiFixture.ts` / `UiFixture.ts`; do not try to avoid the edit and do not reformat the file.
4. **Git**: branch name, base, whether it pushes and opens its own PR (§7).
5. **Scope-correction licence**: a plan that turns out wrong during Code is a legitimate finding. The worker records it in the WP's `spec.md`, reports it and waits, because re-planning a different scope silently hides the finding. The conductor (or the launcher) answers; with nobody to answer, the worker finishes the part that is unaffected and reports.
6. **Rules (component 7) include the TC source gate**: the worker automates only the TCs its WP lists, all of which passed the gate (a `Verdict signed:` comment whose Jira `created` and `updated` predate the run's start). A TC that turns out missing or unsigned mid-WP means stop and report. The worker never creates it in the TMS, never writes or edits a signature and never waits for one inside the run.
7. **Local gate before reporting**: `bun run test <paths>`, then `bun run types:check`, then `bun run lint:check`, in that order and green, plus the Phase 3 review checklist. A worker reports a red gate as a failure, not as "done, with notes".
8. **Reporting**: one completion message with an explicit success or failure outcome, the list of files it changed and the path of its long report. Then it stops: it does not close its own session and does not start the next WP unless the brief listed it.

---

## 6 · Integration

The conductor integrates one branch at a time, in a fixed order decided up front (biggest module group first, since its critical path is the batch's), and treats each integration as a small review:

1. Confirm the worker's local gate was green and its branch is pushed.
2. Merge or PR the branch per §7. Resolve `ApiFixture.ts` / `UiFixture.ts` conflicts additively.
3. Regenerate the manifest instead of merging it: `bun run kata:manifest`, stage it so the freshness gate passes, then `bun run kata:manifest:check`. A conflicted `kata-manifest.json` is discarded and regenerated; a hand-resolved one describes a tree that does not exist.
4. Re-run the suite for the merged state (`bun run test`) plus `types:check` and `lint:check`. Two individually green branches can be red together: a duplicated `@atc` ID or a fixture name collision only exists after the merge.
5. Only then fire the TC lifecycle transitions for that WP (conductor-only, §4) and record the integration in the session ledger per `agentic-qa-core/references/session-management.md` §7.
6. Close the worker and remove its worktree after the orphan audit, because gitignored files die with the worktree.

A red merged state stops the integration queue. Merging more branches onto a broken tree to "finish the batch" buries the cause.

---

## 7 · Git rules per strategy

Resolve `git_strategy` from `.agents/project.yaml` first; `/git-flow-master` owns every command.

| Strategy | Worker | Conductor |
|---|---|---|
| `sdet` | cuts `test/{KEY}-{slug}` **from the integration trunk**, runs the per-ticket loop, opens its PR into the trunk | creates and owns the trunk, merges each ticket PR `--no-ff` in integration order, runs the sync gate, opens the single final PR. Full runbook: `.agents/skills/git-flow-master/references/sdet-integration-trunk.md` |
| `solo-main` | commits on its own `test/*` branch in its own worktree, pushes it | merges each branch (or PRs it) in integration order. Direct push to a protected branch still resolves `git_strategy.policy.direct_push_to_protected` |
| anything else | own branch, own PR, base per strategy | merge order + the manifest regeneration of §6 |

Three invariants hold under every strategy: never rebase or force-push a branch a worker pushed, never `git add -A`, and every commit carries the forensic trailers from `/git-flow-master` §3.2 and no AI attribution.

---

## 8 · Shared test data and fixtures

Two workers in two worktrees still hit one environment and one database. Component ownership does not isolate a seeded account, a tenant or a fixture row.

Declare the intent at partition time (which WP reads which entity, which one writes it) and route the runtime arbitration through the claims protocol: `/agent-orchestration` claims protocol. Two WPs that write the same entity either go to the same worker or serialize behind a claim. `test-data-management.md` still governs how each WP generates its own data, and the cheapest fix for a contested fixture is a WP that generates its own.

---

## 9 · The launch file and the silence rule

The conductor always writes the launch file, one self-contained line per worker, whether or not any orchestration binary exists on the machine. Supervised launch is the native path (`agent-orchestration`'s `worker-start --agent`). `launch.txt` is the payload for the human-paste fallback when nothing can launch it, and for the unsupervised custom-argv path in between. Identical payloads keep the paths from drifting; a paraphrased line is the failure this rule prevents. Shape, validation and the three gated lines: `agentic-qa-core/references/fleet-launch-seam.md`.

A missing orchestration binary costs nothing and is not reported: not in the preflight gate, not in the plan, not in the review, and not to the user from this skill.

---

## 10 · Gotchas

| # | Gotcha | Symptom | Fix |
|---|---|---|---|
| 1 | Two workers on one module | `*Api.ts` / `*Page.ts` conflicts that cannot be merged mechanically | partition by module (§2); same-module WPs serialize in one worker |
| 2 | `kata-manifest.json` merged by hand | the freshness gate passes on a manifest that describes no real tree; duplicate ATC IDs survive | regenerate per integration (§6) |
| 3 | Fixture-registration conflict resolved with "theirs" | a component silently disappears from the fixture; tests fail with an undefined property | additive resolution only |
| 4 | Worktree launched before provisioning | dependency errors, missing MCP servers, no credentials, all with the wrong error message | provision first (§3) |
| 5 | Worker pushes nothing for 10 minutes | it never received the brief | check its worktree's `git status --porcelain`; re-deliver the brief |
| 6 | Each worker mints its own token | interleaved writes to the shared token file; one worker 401s mid-suite | conductor mints once (§4) |
| 7 | Worktree removed before the orphan audit | evidence, local reports and `.env` gone with it | audit, copy out, then remove (`.agents/skills/git-flow-master/references/worktrees.md`) |
| 8 | Both individually-green branches red together | duplicate `@atc` ID or colliding component name | re-run the suite on the merged state, per integration (§6) |
| 9 | Browser sessions left open per worker | orphan Chromium processes eating GBs | every worker closes its browser sessions before reporting |

---

## 11 · Degraded path (no conductor available)

A batch with no live conductor is still a batch. Run it in this session, WP by WP, in the order §2 would have produced (largest module group first). The partition is not wasted work: that order minimizes rework, sequential or not.
