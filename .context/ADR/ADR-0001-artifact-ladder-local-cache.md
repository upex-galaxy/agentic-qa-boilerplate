# ADR-0001 — The local cache mirrors the artifact ladder's title grammar

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** QA architect (framework owner)
- **Tags:** traceability, tms, sync, artifact-ladder, cache
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The QA planning ladder was ratified on 2026-06-26 and amended on 2026-08-21 (`docs/qa-standard/planning-ladder-proposal.md`). It defines four planning altitudes, each with a plan and, above the Master rung, a runner:

| Altitude | Plan | Runner |
| --- | --- | --- |
| Master | MTP (an Epic, never a Test Plan work type) | — |
| Feature | FTP | — (FTR deliberately cut) |
| Sprint | STP | STR |
| Story | ATP + ATS | ATR |

The ratified title grammar is `{ACRONYM}: {scope}: {desc}`, chosen so a reader or a JQL query can tell a plan's altitude from its first token. Before that grammar, the same Jira `Test Plan` work type was titled three incompatible ways and altitude was unreadable.

An audit on 2026-08-29 found the ladder's top three rungs are invisible in the local cache. `scripts/sync-jira-issues.ts` carries a `HIGHER_ALTITUDE_PREFIX` guard that skips any `FTP:` / `STP:` / `STR:` / `MTP:` titled issue with an info line, and `.agents/jira-required.yaml` documents them as "never materialized". That guard exists for a good reason: when the sync resolves a *Story's* ATP and ATR by walking its issue links, an FTP that happens to be linked to that Story must not be mistaken for the Story's own plan. But the guard was doing double duty — correctly preventing misattribution, and incidentally preventing materialization altogether.

The consequence is asymmetric visibility. A QA engineer working offline, or an AI session reading the cache, sees every Story-tier artifact on disk and nothing above it. The Feature and Sprint rungs exist only in Jira, so any local reasoning about them is blind. The audit also found that the FTP's own documentation instructs a local-cache command that cannot work, because `epic:` is declared `container` and the coverage walk never reaches the Test Plan item.

Two further facts shape the decision. `.context/PBI/` is a gitignored, regenerable cache of Jira, so changing filenames inside it costs nothing and breaks no history. And the four QA-process Epics (`QA Master Test Plan`, `QA Test Repository`, `QA Test Artifacts`, `QA Defect Management`) already parent every QA artifact by work type, which means an index of the higher altitudes already exists in Jira and needs no new configuration to find.

## Decision

**We will materialize every ladder artifact into `.context/PBI/`, and the on-disk filename will carry the same altitude acronym the Jira title carries.**

Three parts, and all three are load-bearing together:

1. **Filenames mirror the title grammar.** A Test Plan or Test Execution is written under a prefix derived from its title's acronym, not from its work-type slug:

   ```
   .context/PBI/test-plans/       FTP-<KEY>-<slug>.md · STP-<KEY>-<slug>.md · ATP-<KEY>-<slug>.md
   .context/PBI/test-executions/  STR-<KEY>-<slug>.md · ATR-<KEY>-<slug>.md · RETEST-<KEY>-<slug>.md
   ```

   A title that does not conform to the grammar falls back to today's slug-derived prefix (`TESTPLAN-`, `TESTEXEC-`, `RETESTEXEC-`), so a project that has not adopted the grammar still syncs and simply gets less legible names.

2. **Discovery runs through the four QA-process Epics.** Higher-altitude artifacts are not reachable from a Story — they sit above it, so no coverage walk starting at a Story can ever find them. `pull` sweeps the children of the QA-process Epics, resolved through the `QA-Artifact` label and the cached `qa.qa_epics.*.key` values in `.agents/project.yaml`. The Epics are the index; no new configuration is introduced.

3. **The Story-level guard stays exactly as it is.** `HIGHER_ALTITUDE_PREFIX` continues to skip higher altitudes when the sync resolves a *Story's* ATP and ATR. Materialization is a separate path that runs from the Epic sweep. This keeps the fix non-breaking for the Story tier, which the audit found to be the one tier that already works end to end.

**The invariant this establishes:** every artifact the ladder defines has exactly one canonical local path, and that path names its altitude. A reader who runs `ls .context/PBI/test-plans/` learns the state of the ladder without opening a file or querying Jira.

Two corrections ride along, because leaving them would contradict the invariant. The `MTP:` entry is removed from the higher-altitude guard, since doctrine is explicit that the MTP is an Epic and never a Test Plan work type — the guard was defending against a shape the doctrine already forbids. The `FTR:` entry stays, with a comment saying why: it is a legacy guard so a pull of pre-migration data never mistakes a retired FTR for a Story's ATR.

## Consequences

**Positive.**

- The ladder becomes readable offline and by an AI session with no Jira access. Altitude is legible from a directory listing, which is the same property the title grammar was ratified to give Jira.
- The FTP's local-cache instruction becomes true instead of aspirational.
- The four QA-process Epics acquire a second job they were already shaped for: they are now the sync's index, not only Jira's filing cabinet. That is a reuse of existing structure rather than a new mechanism.
- `sync: never` starts meaning what it says. Auditing the guard surfaced that `syncStandaloneIssue` gated on `container` and never consulted `sync:`, so two work types declared `never` were in fact written by an explicit `get`. Declaration and behaviour now agree.

**Negative / trade-offs.**

- `pull` does more work. The Epic sweep is an extra set of queries on every full hydrate, which costs wall-clock time on a large project. Mitigated by a skip flag in the style of the existing `--no-defects`, but the default path is slower than it was.
- Two prefix vocabularies now coexist on disk: the acronym-derived one and the slug-derived fallback. A project mid-migration will see both, which is briefly confusing. The alternative — forcing conformance — would break sync for any project that has not adopted the grammar, which is worse.
- Renaming `TESTPLAN-` to `ATP-` invalidates every existing local cache. Cheap here because the cache is gitignored and `bun run context:hydrate` rebuilds it, but anyone with a stale tree sees duplicate-looking files until they re-hydrate.

**Neutral / follow-ups.**

- The MTP needs no cache file. It is an Epic whose real body already lives in the committed `.context/master-test-plan.md`; the Jira Epic is its anchor, not its source of truth.
- This ADR says nothing about the RESULTS side rolling up. There is no `ATR is part of STR` link type, and the STR is a sibling recap rather than an aggregate. That remains true after this change and is documented in `traceability-linking.md`.
- The write-back direction — automated results reaching Jira — is a separate problem with a separate fix, and is not in scope here.

## Alternatives considered

- **Leave the higher altitudes unmaterialized (the status quo).** Rejected: it makes three of the four rungs invisible to any offline or AI reader, and it leaves the FTP's own documented workflow pointing at a command that cannot produce the file it promises. The original rationale — that these artifacts are Jira-owned and need no local copy — applies equally to the Story tier, which is cached anyway.

- **Keep slug-derived prefixes and disambiguate altitude inside the file body.** Rejected: it hides in a file's contents the single fact the ratified grammar went out of its way to put in the first token of a title. The whole point of `{ACRONYM}:` is that altitude is legible before you open anything.

- **Give each altitude its own directory** (`test-plans/feature/`, `test-plans/sprint/`, `test-plans/story/`). Rejected: it splits one work type across three paths for no gain, complicates the sync's write path, and makes the common question — "what plans exist for this project?" — require three listings instead of one.

- **Discover higher altitudes with a dedicated JQL query configured per project.** Rejected: it introduces configuration that would drift, to find something the QA-process Epics already index. Reusing the Epics keeps one source of truth for "where do QA artifacts live".

- **Force title conformance and fail the sync on a non-conforming title.** Rejected: it would break every project that has not yet adopted the grammar, to buy consistency the fallback prefix already provides more gently.

## References

- `docs/qa-standard/planning-ladder-proposal.md` — the ratified ladder and title grammar (§3), the four QA-process Epics (§1), items-over-fields (§4)
- `AGENTS.md` §9 — the `.context/PBI/` tree, the three tiers, the ATP/ATR precedence cascade
- `.agents/skills/agentic-qa-core/references/traceability-linking.md` — the coverage cascade and the three-axis model
- `.context/reports/artifact-ladder-audit.html` — the 2026-08-29 audit that surfaced the gap (generated, gitignored)
- `scripts/sync-jira-issues.ts` — `HIGHER_ALTITUDE_PREFIX`, `FOLDER_PREFIX`, `syncStandaloneIssue`
