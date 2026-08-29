# reports/ — generated output

Everything in this directory is **generated**. Six different commands write here, each owning its own filenames. Nothing here is a source of truth: the command that produced a file rebuilds it.

## Tier

`[LOCAL]` for every file, this README excepted.

```gitignore
.context/reports/*
!.context/reports/README.md
```

Verify with `git check-ignore -v .context/reports/<file>`.

**Why nothing here is committed.** Every file is rebuilt by the command that owns it, so committing them only produces conflicts between sessions that ran at different times. A three-way merge over a full-file rewrite means nothing. The corollary matters: a file here exists **only on the machine that generated it**. Nothing downstream may depend on one being present, and no skill may call a file in this directory "the committed deliverable" — it is not, and cannot be.

## Who writes what

| File | Producer | What it is |
|---|---|---|
| `SPRINT-{N}-TESTING.md` | `/sprint-testing` batch mode, Session Start §0.5 | Sprint orchestration tracker |
| `regression-{env}-{date}.md` | `/regression-testing` | Suite run report + GO / CAUTION / NO-GO verdict |
| `adapt-framework-plan.md` | `/adapt-framework` | Adaptation plan, written before the approval gate |
| `jira-components-plan.json` | `/jira-administration` mode `components` | Component sync plan, written before the approval gate |
| `test-map.html` | `bun run tests:map` | Coverage map rendered from the synced `.context/PBI/` tree |
| coverage matrix | `/test-documentation` | **No filename convention defined yet** — see the gap below |

Adding a seventh writer means adding a row here. A file in this directory whose producer is not listed is orphaned output.

## `SPRINT-{N}-TESTING.md` is not the STP

Worth stating plainly, because the names invite the confusion. It is **neither the Sprint Test Plan nor the Sprint Test Results**: it is a third thing, a local orchestration tracker whose declared purpose is *"track QA testing progress; provide AI context for resuming sessions"*. Its Status column is what the orchestrator scans to pick the next ticket. That is a work queue.

The STP and the STR are Jira items (`Test Plan` and `Test Execution`, parented to the QA process epics) and are **never materialized on disk** — the sync skips them by title prefix. The same `/sprint-testing` run creates the tracker at Session Start §0.5 and the STP at §0.7, and updates both from the same post-ticket step. Two artifacts, one loop.

Naming convention: `{N}` is the sprint number. Examples: `SPRINT-9-TESTING.md`, `SPRINT-10-TESTING.md`.

## Known gap

`/test-documentation` writes a coverage matrix here with no agreed filename, and both `test-documentation/SKILL.md` and `regression-testing/SKILL.md` describe their output in this directory as "the committed deliverable" — false, per the gitignore above. Tracked as GitHub issue #12.

## Related

- Ticket-level artifacts (ATP, ATS, ATR, Tests, evidence) → `.context/PBI/`, a gitignored cache of Jira
- Project-wide test strategy → `.context/master-test-plan.md`, which **is** committed
- Test-architecture decisions → `.context/ADR/`, append-only and committed
