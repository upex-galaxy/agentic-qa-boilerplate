# reports/ — generated output

Everything in this directory is **generated**. Five different commands write here, each owning its own filenames. Nothing here is a source of truth: the command that produced a file rebuilds it.

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
| `regression-{env}-{date}.md` | `/regression-testing` | Suite run report + GO / CAUTION / NO-GO verdict |
| `adapt-framework-plan.md` | `/adapt-framework` | Adaptation plan, written before the approval gate |
| `jira-components-plan.json` | `/jira-administration` mode `components` | Component sync plan, written before the approval gate |
| `test-map.html` | `bun run tests:map` | Coverage map rendered from the synced `.context/PBI/` tree |
| coverage matrix | `/test-documentation` | **No filename convention defined yet** — see the gap below |

Adding a sixth writer means adding a row here. A file in this directory whose producer is not listed is orphaned output.

## The sprint tracker that used to live here

`SPRINT-{N}-TESTING.md` was a local orchestration tracker written by `/sprint-testing` in what was then called batch mode. It is **retired**. It followed none of the session doctrine every other long-running skill follows — no frontmatter, no append-only rule, no archive policy — and it was regenerated wholesale after 24 hours behind a "warn + confirm overwrite" prompt, which quietly put hand-written wave notes at risk.

Its content moved to where each half belongs:

| What it held | Where it lives now |
|---|---|
| The queue: which issues, in what order, who took each | `.session/sprint-testing/sprint-<N>/plan.md` (session-management §6) |
| What happened, per closed issue | `.session/sprint-testing/sprint-<N>/progress.md` (append-only, §7) |
| Anything the TEAM needs, not just this machine | the **STP** in Jira — `plan.md` mirrors its description, `progress.md` its comments |

The STP and the STR are Jira items (`Test Plan` and `Test Execution`, parented to the QA process epics), and they **do** materialize on disk: an unfiltered `bun run jira:sync-issues pull` sweeps the four QA-process Epics and writes them as `.context/PBI/test-plans/STP-<KEY>-<slug>.md` and `.context/PBI/test-executions/STR-<KEY>-<slug>.md` (ADR-0001). What lands there is a **regenerable cache, not a deliverable** — gitignored, rebuilt by `bun run context:hydrate`, and present only on the machine that ran the sync. So the point still holds: anything the team has to share lives in Jira, and the local file is a read-only mirror of it.

## Known gap

`/test-documentation` writes a coverage matrix here with no agreed filename, and both `test-documentation/SKILL.md` and `regression-testing/SKILL.md` describe their output in this directory as "the committed deliverable" — false, per the gitignore above. Tracked as GitHub issue #12.

## Related

- Ticket-level artifacts (ATP, ATS, ATR, Tests, evidence) → `.context/PBI/`, a gitignored cache of Jira
- Project-wide test strategy → `.context/master-test-plan.md`, which **is** committed
- Test-architecture decisions → `.context/ADR/`, append-only and committed
