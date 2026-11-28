# ADR-0023 — The Sprint Board keeps one append-only log and one tracker read per sprint, and the Merge Line collector is TypeScript with the source's document contract

- **Status:** Accepted (by the conductor of the discovery-impl fleet, on the owner's decisions D15, D16 and D18 and the plan approval of the `e3-sprint-board` delivery, 2026-10-24)
- **Date:** 2026-10-24
- **Deciders:** framework owner (boilerplate maintainer), through the fleet conductor's plan approval for the `e3-sprint-board` delivery
- **Tags:** sprint-board, merge-line, storage, tracker-adapter, snapshots
- **Supersedes:** —
- **Superseded by:** ADR-0030, for §Decision points 1, 4 and 8 only, which it amends. Nothing in them is withdrawn.

---

## Context

The Sprint Board, its Merge Line view and the sentinel were built and iterated in another project, against a different tracker, and the owner asked for the same design here: copied, with only what belonged to that project changed (names, tracker coupling, keys, people). Three things in that design are hard to change once boards exist in consumer projects: where a board keeps its data, what the Merge Line view reads, and which fields a shared or published report may carry. The source kept its tracker cache under the tracker's name and ran its Merge Line collector as bash plus jq on macOS tools; this repo runs on Bun on every platform and reads trackers only through `cli/lib/sprint-source/` (ADR-0019).

## Decision

We will ship `cli/sprint-board/` with this storage and these contracts:

1. **Store.** `.session/sprint-board/` in the main checkout (resolved through the git common dir, so every worktree writes to one place; `SPRINT_BOARD_DIR` overrides it): per sprint `sprint.json` (meta), `events.ndjson` (THE log: every fact appended, never rewritten) and `source.json` (what the tracker said at the last `sync`, its only writer, guarded by `source.json.lock`), plus `archive/<slug>.html` and `.state.json` for a closed sprint. A failed tracker read writes nothing, so the last good `source.json` stays.
2. **Buckets, not names.** `source.json` stores each ticket's and bug's `status`, `statusKey` and `bucket` (`board.statuses`); every gate on the page, the lanes, the report counts, the arrivals and the sentinel read the bucket, never a status name.
3. **Merge Line.** The collector is `cli/sprint-board/merge-collect.ts` (gather) and the pure `merge-build.ts` (a line-by-line port of the source's jq program). They write the source's documents under `.session/gitflow-master/` (`docs/meta/*.json`, `docs/prs/<n>.json`, `collector.json`, `snapshot*.json`, `plan.json`), so the view reads them unchanged. GitHub is the only code host. A degraded run keeps the last good documents. The build was checked equal to the jq program on a recorded reading in every mode, except the documented changes (tracker parity by bucket, the repository on `meta/state`).
4. **Allowlists.** The share and report snapshots are built by allowlist (`toShareState`, `toReportState`) and refused by a tripwire when draft or inbox text, a local path or a worker name leaks. Evidence links must be on `board.evidence.allowed_hosts`.
5. **Board-linked bugs are read, never assumed open.** `sync` passes the bugs linked on the board (`bug <ticket> <bug>`) to the source (`SnapshotOptions.bugKeys`, an add-only field of `cli/lib/sprint-source/`, all three sources). Their status reaches `source.json` whatever the tracker links, they count in `searched.bugs`, and an id the tracker cannot find is returned in `missing.bugs`: `sync` prints it and the Bugs view names it as not found. This is how the source read every linked bug.
6. **One unknown status on an UNTRACKED sprint row does not fail `--discover`.** The row comes back with `bucket: null` and the reason, `sync` prints it and `arrivals` lists it as `UNCLASSIFIED`; it is never counted in test. This matches the source, whose discover listed every sprint row and simply did not treat an unknown status as an arrival. A TRACKED ticket in a status no bucket lists still fails the snapshot (ADR-0019): it is counted, so it must classify.
7. **An arrival is an entry into `in_test`.** A tracker status event carries the bucket it left (`fromBucket`), and only a move into `in_test` from another bucket counts as an arrival, the source's "moved into the test environment" rule; a move between two statuses of the bucket (Ready for QA -> In Test after the launch) does not wake the conductor.
8. **Browser bundle.** `model.ts`, `merge.ts` and `app/` run in the page and import only pure modules; a `node:` import in the bundle fails `build.test.ts`.

## Consequences

- **Positive:** the board renders the same for `jira-xray`, `jira-native` and a hand-edited `tickets.yaml`; a demo sprint (`cli/sprint-board/demo/`) runs with no tracker. The Merge Line costs no model tokens and needs no bash, jq or BSD tools.
- **Negative / trade-offs:** the Bugs view's second source (the sprint's own bug rows linked to nothing on the board or in the tracker) reads "not checked" until a source returns them; bugs linked on the board are read (decision 5). Tracker parity in Merge Line compares buckets, not a named "in review" status. The view's labels still say "main" for the mainline. The copied code follows this repo's lint rules (braces on every block), so a line diff against the source shows those mechanical changes.
- **Deferred:** ADR-0020 promised that the board would read `reports/test-outcomes.json` directly and show automated outcomes beside the TMS status. The source board never did that: its automated results reach it through the tracker's test status, written by the TMS sync, and that path exists here too. The owner's rule for this delivery is an identical design with no new UI, so the direct read is not built; it is left to the `/sprint-conductor` delivery.

## Alternatives considered

- **Keep the bash + jq collector.** One fewer port, but it pins macOS tools and a second language for one module, and consumer projects on Linux or Windows could not run it.
- **Store the tracker read per tracker (`jira.json`, `tickets.json`).** Leaks the source choice into the store; one `source.json` with the source named inside it keeps the fold source-agnostic.
- **Redesign the board generically.** Rejected by the owner: the design was iterated with real sprints, and a redesign would lose what that iteration measured.

## References

- `cli/sprint-board/README.md` (commands, views, counting rules), `.agents/skills/sprint-testing/references/sprint-board.md` (the conductor's side), `.agents/skills/git-flow-master/references/observer.md` (Merge Line).
- ADR-0019 (the `board:` block and the source adapter), ADR-0020 (test outcome classes), ADR-0021 (evidence pack and host seam).

## Amendment (2026-10-24): the Bugs view's second source is read

Added by the `e5-evidence-complete` delivery; the decision above is unchanged. The deferral under "Negative / trade-offs" is closed: `sync --discover` returns the sprint's own bug rows (`SourceSnapshot.discover.bugs`): every `bugs:` row of the `none` source's file, and for the Jira sources one more search, `board.bug_jql` or, when it is `null`, `board.jql` with its issuetype clause swapped for the bug work types (nothing is derived across an `OR`, a `NOT` or several clauses, and the view keeps saying "not checked"). A bug row in a status no bucket lists, or not of a bug type, follows point 6: it is stored in `discover.unclassifiedBugs`, named on the Bugs view's search line, and never counted as open.

## Amendment (2026-10-25): the board shows automated outcomes beside the TMS status

Added by the `e6-sprint-conductor` delivery, on the owner's yes relayed by the fleet conductor's plan approval; the decision above is unchanged. The "Deferred" point is closed: `buildState` (`cli/sprint-board/sources.ts`) reads `reports/test-outcomes.json` of the main checkout and `applyAutomated` (`cli/sprint-board/model.ts`, pure) attaches each TC's automated status, the worst of the records whose `atcIds` name it, through `countedOutcome()` unchanged. The ticket drawer shows it as an `automated` chip beside the TC's own pill, built only from existing classes; it is the one owner-approved addition to the source design. A file with another schema or an unreadable record is refused with one page warning; a run whose environment is not the board's is ignored; a closed board never reads it. The TC's status, the lanes, the at-risk rule, the metrics and the report counts are untouched, and the share and report snapshots copy TCs field by field, so the chip never reaches a share or report snapshot. Where it travels: the live page and `snapshot --mode full`, which freezes the owner's full state and so carries it (`cli/sprint-board/snapshot.ts`); `--mode share` and `--mode report` do not (`cli/sprint-board/automated.test.ts`).
