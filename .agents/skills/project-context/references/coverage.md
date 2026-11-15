# Coverage Inventory

Cross what the product does (the business maps) with what is tested (the KATA manifest, the TMS test
repository, the regression repository) and put every behaviour in exactly one bucket: `automated`,
`manual-only`, `weak`, `uncovered`. The gaps (`weak` and `uncovered`) are ordered by the Master Test Plan's
risk and become coverage Tech Stories once a person approves them. This is the `inventory` step of the
discovery-driven flow (`../../agentic-qa-core/references/discovery-driven-doctrine.md` §1).

**Target**: $ARGUMENTS (a module filter, `--tms none`, or blank for the whole product)

Until a person approves a tracker write, this mode edits no test, writes no map, stays out of `refresh-all`
and writes only its own session files (below).

---

## The three steps

The join from behaviour to test is not deterministic (a map row and a Test share no key), so the work is split:

| Step | Who | Does | Writes |
|---|---|---|---|
| `bun run context:coverage collect` | script | reads the maps' sections and their `BR-NNN` / `FEAT-NNN` rows (the seed), the KATA manifest at the production branch, every TMS Test with its cascade coverables (direct link, ATS, and under jira-xray the Test Plans it belongs to) and regression membership, and the existing coverage Tech Stories. With no generated map it reads no TMS at all | `collect.json` |
| judge | agent | decides which behaviours count, which test covers each one, whether its assertions exercise it, and its MTP risk | `judgments.json` |
| `bun run context:coverage classify` | script | validates the judgments against `collect.json`, buckets, orders, flags stale judgments, diffs against the previous run | `gap-list.json`, `gap-list.md`, `runs/<run-id>.json` |

Two sessions with the same judgments get the same gap list, so the run is recomputable and progress is
measurable. Judgments carry over by stable id from run to run.

## Files

`<<PRIMARY_ROOT>>/.session/project-context/coverage/` (the script resolves the primary checkout, so a run
from a worktree lands where the next run looks). `project-context` opts out of the session Phase 0
(`../../agentic-qa-core/references/session-management.md` §"Skills that opt out"): these are companion
files, not a resumable session.

```
collect.json      last collect: sources, seed, test inventory, anchors, warnings
judgments.json    the agent's judgments, carried run to run (the only file the agent writes)
gap-list.json     last classify (schema below), read by other skills
gap-list.md       the same, for a person
runs/<id>.json    every classify, kept: the progress history
proposals/        dry-run Tech Story payloads, one .json + .md each
```

## Step 0: before collecting

1. Maps: `bun run context:map <slug> --list` for `business-e2e-context`, `business-api-context`,
   `business-data-context`. All placeholders: `collect` exits 2 with the stated note; stop and name
   `project-context e2e` (then `data`, `api`). An empty gap list reads as "no gaps", so none is written.
2. TMS: the project has one when `.agents/project.yaml` sets `project.project_key` and
   `issue_tracker.atlassian_url`. Check credentials by name with the repo's redacted presence check
   (Critical Rule #1). If they are missing, or `collect` reports `TMS not read: <reason>` on a project that
   has a TMS, stop and ask before continuing manifest-only (Critical Rule #10 posture): a manifest-only run
   reports `manual-only` as `unknown` and is not comparable with a TMS run.
3. MTP cache: `.context/PBI/qa-artifacts/master-test-plan.md`. Missing is soft: every gap is `unranked` and
   the report says "run `project-context test-plan`, then `bun run jira:sync-issues get <MTP-KEY>`".

## Step 2: judging (the agent's part)

Read the maps through `bun run context:map <slug> --section <id>`; the raw HTML carries markup the AI should not parse. Start from
`collect.json` `seed`; previous `judgments.json` rows carry over, and the stale ones are re-judged first.

**Granularity.** Every `BR-NNN` and `FEAT-NNN` in the seed is a behaviour: judge it, or leave it in the
report's unjudged list so it stays visible. A section of the api or data map with no rule ids is one
behaviour per testable statement you can name; give it a kebab local id once (`api#orders-endpoints/refund-window`)
and keep it. Section-level rows (`e2e#feature-billing`) are for maps with no finer structure.

**Ids.** `<map>#<section-id>[/<LOCAL-ID>]`, `<map>` in `e2e|api|data`. The id is the gap id and never changes.

**Covered by.** One row per test that claims the behaviour: the TMS key or ATC id from `collect.json`
`tests`, a `verdict`, and ONE evidence line. Find candidates through the test's linked coverables,
components and title; a title match alone is not enough to claim a behaviour.

| Verdict | When | Evidence is |
|---|---|---|
| `exercises` | an assertion (ATC) or an expected result (manual step) fails if the behaviour breaks | that assertion or step, quoted or named |
| `weak` | the test runs through the behaviour but nothing it checks would fail if it broke | what the test checks instead |

Assertions come from the existing readers, not a new one: the breakdown of `/test-automation` mode
`explain` when one exists, else the ATC method at the manifest's file and line; for a manual Test, its steps
and expected results. The verdict is an agent judgment: `classify` marks every row `judged_by: agent`.

**Risk.** `{ level, flow }`: the MTP's own level (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and the name of the
MTP flow it was read from, spelled as the MTP spells it. `classify` looks the flow up as a whole cell of a
table row (and then uses that row's level when it disagrees with yours, with a warning) or inside a heading;
a flow named only in prose is not ranked, so it drops to `unranked`. Risk orders; ROI still decides per Test
later in `test-documentation` (doctrine §7).

**Copy the fingerprints.** Set `seed_hash` from `seed[].hash` (for a free kebab local id, which has no seed
row of its own, the hash of its section's row: its map text is the section's) and each row's
`test_fingerprint` from `tests[].fingerprint`. That is how the next run knows the judgment went stale; a
judgment without them gets a warning saying stale detection is off for it. An ATC's fingerprint is its file,
line and method; a manual Test's is the TMS `updated` stamp, which also moves on a comment or a new link, so
expect some stale noise there, never a wrong bucket.

```json
{ "schema_version": 1, "behaviours": [
  { "id": "e2e#feature-billing/BR-002", "title": "...", "module": "Billing", "seed_hash": "...",
    "risk": { "level": "CRITICAL", "flow": "Checkout and payment" },
    "covered_by": [{ "test": "PROJ-13", "verdict": "weak", "evidence": "...", "test_fingerprint": "..." }],
    "tech_story": null } ] }
```

## Buckets

| Rows that count | Bucket |
|---|---|
| none | `uncovered` |
| only `weak` rows | `weak` |
| at least one `exercises` row on an ATC in the production manifest | `automated` |
| at least one `exercises` row, all manual TMS Tests | `manual-only` |

The gate fails closed: a row does not count (it stays in the report with the reason) when it has no evidence, when its
Test is `deprecated`, when its Test is still in design (the statuses the `create` and `start_design`
transitions of `test_case` lead to in `.agents/jira-workflows.json`: not an approved Test yet), or when its key
cannot be verified because the TMS was not read (`not verified: TMS not read`). When the TMS WAS read, a key
the inventory does not hold is an error instead; so are a section the map does not have, a rule id the seed
does not hold and a bad level: `classify` fails with every error listed. `automated` means the ATC is in
`kata-manifest.json` on `git_strategy.branches.production` (doctrine §6); a TMS status `automated` with no
such ATC is a warning and counts as manual. A manual Test outside the regression repository (not in an `RTP:`
Test Plan under jira-xray, no `regression` / `regression-candidate` label) still counts and is flagged
`outside_regression`. Without the TMS only ATCs in the manifest can count, so the gap total is an upper bound
(`denominators.gaps_upper_bound`), and `gap-list.md` and `propose` say so.

Gaps are ordered: risk (CRITICAL first, `unranked` last), then `uncovered` before `weak`, then module, then id.

## Step 4: report and approval

Show `gap-list.md` (sources, totals with their denominators, gaps by risk, stale judgments, the run-over-run
diff, `## Discovery Gaps`). A bucket the run could not measure prints `unknown`; 0 would claim a measurement. While seed rows are
not judged, the Gaps section opens with how many: an empty or partial judgment never reads as "no gaps".

Creating Tech Stories is an outward write a person signs (`../../agentic-qa-core/references/decision-protocol.md`).
The channel follows the weight of the decision, not the count (`AGENTS.md` §2): a batch with real
choices per item (the grain, which gaps become Tech Stories) goes to the `mkd` decision deck; a single
yes/no on one proposal goes through the question tool. With nobody at the keyboard the run ends at
`proposals/`: the launcher or the brief holds this approval (`../SKILL.md`, `## With nobody at the keyboard`).

## Step 5: coverage Tech Stories

1. `bun run context:coverage propose --grain gap|module` (the grain the person picked). It is a dry run: it writes
   `proposals/` and never calls a tracker. A gap already named by a `coverage-gap` Tech Story is skipped
   with its key. A null parent means `qa.qa_epics.test_repository_epic.key` is unset: resolve the QA Test
   Repository epic by name (find-or-create, asking first) before creating anything.
2. Each proposal follows doctrine §3: work type `tech_story`, parent QA Test Repository, label
   `coverage-gap`, title `Coverage: {module}: {gap}` (at grain `module` the `{gap}` part reads "behaviours
   without regression coverage", and the description lists each gap), components = the module. Its description carries the
   gap ids (one `coverage-gap-id:` line each, the dedupe key), source, bucket, risk, the weak rows with
   their evidence, and the `oracle: observed` line (doctrine §4).
3. On approval: load `/acli` before any `[ISSUE_TRACKER_TOOL]` call. Convert the description with
   `acli/scripts/md-to-adf.ts`, create from the payload, then set components through the REST path `/acli`
   documents (the create payload has no components key).
4. Read each one back: `bun run jira:sync-issues get <KEY> --types tech_story` (Critical Rule #16;
   `tech_story` is not a default sync type). Then write the key into that behaviour's `tech_story` in
   `judgments.json` and classify again.

## Degradation (always a stated note)

| Situation | Behaviour |
|---|---|
| every map a placeholder or missing | `collect` and `classify` exit 2 with the note naming `project-context e2e`; no gap list |
| some maps missing | proceeds; each missing map is a Discovery Gap |
| no TMS (`--tms none`, no project key, credentials, host, or an unreachable instance) | manifest only; `TMS not read: <reason>`; `manual-only` is `unknown`; manual claims do not count, so gaps are an upper bound; Step 0.2 decides whether to go on |
| Jira read, Xray not (jira-xray) | the inventory is kept; Test Plan membership is unknown, so no Test without a regression label is flagged `outside_regression`, and the Test Plan leg of the cascade is skipped; warning names the Xray error |
| judgments empty or partial | the Gaps section opens with the number of behaviours not judged yet |
| a judgment without `seed_hash` / `test_fingerprint` | warning: stale detection is off for it |
| no manifest | `automated` is `unknown` |
| no MTP cache | every gap `unranked`, stated |
| manifest not on the production branch | read from the working tree, with a warning naming the branch |
| previous run read the TMS differently | warning: the diff compares verified with unverified coverage |

## `gap-list.json` (schema 1, for the skills that read it)

`schema_version`, `run_id`, `generated_at`, `sources` (each map's state, TMS modality + state + reason,
manifest state + ref, MTP cache), `denominators` (behaviours, seed, unjudged, tests by kind, every bucket
including zeros, gaps, `gaps_upper_bound`), `behaviours[]` sorted by id (`id`, `title`, `module`, `source`, `risk`, `bucket`,
`covered_by[]` with `test`, `kind`, `verdict`, `evidence`, `judged_by`, `counted`, `reason`,
`outside_regression`, `stale`, `verified`; `stale`, `tech_story`), `gaps` (ids in priority order), `tests[]`
(`key`, `kind`, `covers[]` of `{ id, verdict }`: the inverse view, counted rows only, for deduping new
scenarios against existing tests; a `weak` cover is NOT coverage and must never dedupe a scenario away),
`unjudged_seed`, `warnings`, `diff` (`previous_run`, `closed`, `regressed`, `changed`, `added`,
`removed`). Every list is sorted by UTF-16 code units, so it reads the same on every machine. The types are
in `cli/lib/behaviour-coverage/types.ts`; renaming a key is a schema version bump.

## Report (chat)

Headline: gaps by risk level and the change since the previous run. Then one bullet per CRITICAL or HIGH gap,
the stale judgments, the unmeasured buckets, and the proposals waiting for approval.
