# Product Backlog Items (PBI)

Per-epic and per-story QA workspace shared by `/shift-left-testing`, `/sprint-testing`, `/test-documentation`, and `/test-automation`.

> **This tree is a CACHE of Jira, and it is gitignored.** Jira is the source of truth. `bun run context:hydrate` rebuilds the whole thing from scratch, which is exactly why it is not committed: two sessions that re-sync at different times would otherwise produce conflicting commits of the same generated content. Authoritative ownership rules live in `CLAUDE.md` §9.

## Three tiers, three lifecycles

Everything under `.context/PBI/` is one of three things. Getting the tier wrong is the single most common mistake here, so check this table before creating any file.

| Tier | Source of truth | In git? | How it is produced | How it is recovered |
|---|---|---|---|---|
| **`[SYNC]`** | Jira | No | `scripts/sync-jira-issues.ts` writes it | `bun run context:hydrate` |
| **`[COMMIT]`** | This repo | **Yes** | A skill authors it; a human reviews it in a PR | `git checkout` |
| **`[LOCAL]`** | Nothing durable | No | A skill authors it during a session | Not recovered. It is disposable by design. |

`[SYNC]` files are **forbidden to hand-write** — every sync overwrites them and no file is protected. To set their content: author it, push it to the Jira field (or the fallback comment), run the sync, then read the materialized file back.

`[LOCAL]` files are safe to hand-write, but nothing downstream may *depend* on one being present: it exists only on the machine that created it. If another skill needs to read it on a different machine, it belongs in Jira instead.

## Layout (canonical, Epic-centric)

```
.context/PBI/
  README.md                                       [COMMIT] this file
  templates/                                      [COMMIT] skeletons; do not edit per-project
  epic-tree.md                                    [SYNC] master index
  epics/EPIC-<KEY>-<slug>/
    epic.md                                       [SYNC]
    module-context.md                             [SYNC ← '## Module Context (QA)' section of the Epic description]
    feature-implementation-plan.md                [SYNC ← Jira field / stub]
    feature-test-plan.md                          [SYNC ← Jira field / stub]
    test-specs/                                   [COMMIT] automation plans — versioned with the test code
      ROADMAP.md  PROGRESS.md
      <ID>/ spec.md  automation-plan.md  atc/*.md
    stories/STORY-<KEY>-<slug>/
      story.md                                    [SYNC]
      acceptance-criteria.md  business-rules.md  scope.md  out-of-scope.md
      workflow.md  mockup.md  implementation-plan.md        [SYNC ← Jira fields / stub]
      acceptance-test-plan.md  acceptance-test-results.md   [SYNC ← Xray Test Plan/Execution desc OVERRIDES Story field, else field, else stub]
      comments.md                                 [SYNC, --include-comments]
      test-cases/                                 [SYNC ← the Test issues linked to this Story]
      test-executions/                            [SYNC — only when >1 Execution linked]
      defects/<PREFIX>-<KEY>-<slug>/              [SYNC — linked defects nested as coverable folders]
      context.md                                  [LOCAL] session notes about the repo, not the ticket
      evidence/                                   [LOCAL] screenshots
      shift-left-refinement.md                    [LOCAL] staging buffer — see below
  epics/_orphans/                                 [SYNC — Stories with no parent Epic; its tests/ holds the ORPHAN Test issues]
  bugs/BUG-<KEY>-<slug>/                          [SYNC — coverable folder: bug.md + ATP + ATR + test-executions/ + defects/]
  improvements/IMPROVEMENT-<KEY>-<slug>/          [SYNC — coverable folder: improvement.md + ATP + ATR + …]
  tech-stories/TECHSTORY-<KEY>-<slug>/            [SYNC — coverable folder: tech-story.md + ATP + ATR + …]
  tech-debts/TECHDEBT-<KEY>-<slug>/               [SYNC — coverable folder: tech-debt.md + ATP + ATR + …]
  defects/                                        [SYNC — standalone defect issues]
  qa-artifacts/_index.md                          [SYNC — register of the QA-process Epics (QA buckets); no per-epic folders, their content is already distributed]
  test-plans/ test-executions/ test-sets/ preconditions/   [SYNC — Xray container issues (jira-xray); description holds the ATP/ATR body]
```

Folder naming follows Jira IDs verbatim — `<KEY>` is the Jira issue key, `<slug>` is `kebab-case` from the summary. Epic and Story folders are prefixed `EPIC-` / `STORY-`. Every Story lives under its Epic's `stories/` (Module = Epic, 1:1).

**Not in this tree**: `test-session-memory.md` lives in `.session/sprint-testing/<scope>/`, beside `plan.md` and `progress.md`. It used to sit in the Story folder, which was wrong: a re-sync rewrites this cache wholesale and that file is the payload every resume and every sub-agent reads.

## What the `.gitignore` actually does

The whole tree is excluded, then three things are negated back in. Git cannot re-include a file whose parent directory is excluded, so the rules walk down level by level:

```gitignore
.context/PBI/*
!.context/PBI/README.md
!.context/PBI/templates/
!.context/PBI/epics/
.context/PBI/epics/*
!.context/PBI/epics/*/
.context/PBI/epics/*/*
!.context/PBI/epics/*/test-specs/
```

Collapsing that ladder to a plain `.context/PBI/` silently drops `test-specs/` from version control. If you touch it, verify with `git check-ignore -v <path>` on both a `test-specs/` file (must NOT be ignored) and a `stories/.../story.md` (must be ignored).

## Why `test-specs/` is committed and everything around it is not

`spec.md`, `automation-plan.md` and `atc/*.md` describe the **test code**, not the ticket. Their real source of truth is `tests/components/**` plus `kata-manifest.json`, and their link to Jira already exists through the `@atc('PROJ-101')` decorators in the code. They must version in the same commit as the code they produce, or a reviewer cannot contrast plan against implementation.

The `{TICKET-ID}` in an `atc/` filename IS a Jira Test issue key, which makes the file look like it belongs to Jira. It does not. The Jira `Test` issue holds the **test case** (steps, data, expected result); the `atc/*.md` holds **how to implement it in KATA** (locators, helpers, EP/BVA partitions). Two documents, same ID, different owners.

Rule of thumb: if a PM could read it and have an opinion, it goes to Jira. If it talks about locators and fixtures, it goes to git.

## Jira-first generation contract

Every `[SYNC]` file's content originates in Jira. The flow is always **generate → push to Jira → `jira:sync-issues` → read**:

1. `/shift-left-testing` refines ACs and authors the ATP pre-sprint, writing them to the Story's custom fields (`{{jira.acceptance_criteria}}`, `{{jira.acceptance_test_plan}}`), then syncs. Its `shift-left-refinement.md` is a staging buffer between Phase 2 (writes local) and Phase 3 (publishes) — after the publish, Jira holds the canonical copy and `acceptance-test-plan.md` is the readable one.
2. `/sprint-testing` refines that SAME ATP in-sprint into the executable superset and authors the ATR, pushing to the Story fields (jira-native) or the Xray `Test Plan` / `Test Execution` description (jira-xray). There is one ATP per Story; the pre-sprint pass is marked by the `shift-left-reviewed` + `shift-left-{YYYY-MM-DD}` labels, not by a separate DRAFT artifact.
3. Module context is appended to the **Epic `description`** under a `## Module Context (QA)` heading (read-first, never overwrite) and the sync splits that section back out into `module-context.md`. It deliberately has no custom field: `description` exists on every Jira instance, so this works on a project that never provisions one.
4. If a custom field is absent on the instance, the skill writes the content as a structured Jira comment (`## <label>`, per `.agents/jira-required.yaml` → `fallback:`); the sync then emits a pointer stub for that field's `.md`. Never block on a missing field.

**Default `pull` scope = Epics + Stories + Bugs** (plus optional types via `--types` / `JIRA_SYNC_TYPES`). **Coverable** issues — Story, Bug, Defect, Improvement, Tech Story, Tech Debt — each get their OWN folder containing the issue body, ATP, ATR, a `test-executions/` subfolder (only when >1 execution is linked), a `test-cases/` subfolder (the linked `Test` issues), and a `defects/` subfolder. **ATP/ATR source precedence:** a linked Xray Test Plan description (ATP) / Test Execution / Re-Test Execution description (ATR, newest wins) **OVERRIDES** the custom-field copy; absent that, the issue custom field; absent that, a Jira comment only with `--include-comments`; otherwise silent. The sync emits end-of-run **traceability WARNINGS** for ATP/ATR linked via the wrong link type, atypical Defect links, and orphan Defects with no coverable parent.

**Tests appear exactly once.** A `Test` linked to a coverable issue is materialized under that issue's `test-cases/`. `epics/_orphans/tests/` holds only the orphans — Tests no Story, Bug or Improvement covers, which is itself a coverage smell worth seeing; re-linking one in Jira moves it under its Story on the next sync.

Two commands operate on this cache after a sync. `bun run tests:map` renders the whole tree as one self-contained HTML page (`.context/reports/test-map.html`), leading with the gaps — epics and stories without tests, orphan Tests, Tests without a component. It reads disk only, never Jira. `bun xray test enrich` backfills the synced Test `.md`s with inlined Preconditions and Test Set membership — Xray-internal associations the Jira REST sync structurally cannot see.

## Detailed reads go through the sync

Custom-field content (ACs, ATP/ATR, scope, business rules, comments) is **only** read via the sync — `acli view` returns null for `customfield_*`:

- `bun run jira:sync-issues get <KEY> --include-comments` → one issue, ALL custom fields + comments → read the generated `.md`.
- `bun run jira:sync-issues jql "<query>"` → batch. `pull --epic <KEY>` / `--story <KEY>` → scoped. `pull --sprint <active|current|closed|>=N|7,8,10>` → sprint-scoped; `pull --types <csv>` → add optional coverable types; `pull --no-defects` → skip defect discovery; `pull --project <KEY>` → override project key.
- Traceability link-graph (Story↔ATP↔ATR↔TC) + Xray run status stay on `acli` / `xray-cli` — the script only mirrors field content.

## Cold clone

A fresh clone has an almost-empty `.context/PBI/` — this README, `templates/`, and whatever `test-specs/` the team committed. That is the intended state, not a broken checkout.

```bash
bun run context:hydrate     # jira:sync-issues pull --include-comments
```

Requires `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` in `.env` (see `.env.example`); the Atlassian host comes from `.agents/project.yaml` → `issue_tracker.atlassian_url` (`ATLASSIAN_URL` is a last-resort fallback only). Validate the whole setup with `bun run jira:check`. Someone without Jira access cannot hydrate and will keep an empty cache: they can still read and review `test-specs/`, run the test suite, and work on framework code, but not per-ticket QA. That is a Jira permissions question, not a repo one.

## Conventions

- **Prefix**: Jira project key — `{{PROJECT_KEY}}-` (declared in `.agents/project.yaml`).
- **Names**: kebab-case for file names; `EPIC-` / `STORY-` / `DEFECT-` prefixes on folders per the canonical tree.
- **Evidence**: `evidence/` holds screenshots and logs. `[LOCAL]` — they are attached to the Jira bug when they are bug evidence, and otherwise disposable.
