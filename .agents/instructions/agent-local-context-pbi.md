---
id: local-context-pbi
title: 'Local context: the PBI cache of Jira'
load_when: 'Jira or Xray reads, the .context/PBI/ cache, sync, hydrate, ATP / ATR / TC files, a ticket folder'
triggers: ['\.context/PBI', '\bPBI\b', '\bjira\b', '\bxray\b', '\bsync', '\bhydrate\b', '\bepic\b', '\bATS\b', '\btest-specs\b', '\b[A-Z][A-Z0-9]+-\d+\b']
paths: ['.context/PBI/', 'scripts/sync-jira-issues.ts']
---

# Local context (PBI)

## 9. LOCAL CONTEXT (PBI)

`.context/PBI/` is a gitignored cache of Jira, owned by `scripts/sync-jira-issues.ts`. Jira is the source of truth and a module is an Epic (1:1). When a file mirrors Jira, generate the content, push it to the Jira field (or the fallback below), then run the sync; a hand-written copy is overwritten on the next sync. `bun run context:hydrate` rebuilds the whole tree. (binding: `/sprint-testing`)

The cache is not committed because it regenerates. Two sessions re-syncing at different times would produce conflicting commits of the same generated text, and Jira is already the versioned, shared copy.

**Three tiers.** Every path under `.context/PBI/` is exactly one of these, so check before creating a file:

| Tier | Source of truth | In git? | Recovered by |
|---|---|---|---|
| `[SYNC]` | Jira | No | `bun run context:hydrate` |
| `[COMMIT]` | This repo | Yes | `git checkout` |
| `[LOCAL]` | Nothing durable | No | Not recovered, disposable by design |

A `[LOCAL]` file may be hand-written, but nothing downstream may depend on it existing, because it lives only on the machine that made it. A skill that needs the content on another machine puts it in Jira. `test-session-memory.md` is not in this tree: it lives at `.session/sprint-testing/<scope>/` so a re-sync cannot clobber it.

**Gitignore ladder.** Git cannot re-include a file whose parent directory is excluded, so the ignore rules descend one level at a time: `.context/*` is ignored by default, the files this repo owns are re-included by name, and the PBI part has one exclude and one re-include per level down to `epics/*/test-specs/`. The lines are in the `.context/` block of `.gitignore`. Collapsing them into a plain `.context/PBI/` silently drops `test-specs/` from version control. After any change, run `git check-ignore -v` on a `test-specs/` file (must not be ignored) and on a `stories/.../story.md` (must be ignored).

**QA-process parenting (three axes).** In Jira every `bug`, `defect` and `improvement` parents to the QA process epic "QA Defect Management", and never to a product or dev epic. The other QA artifacts follow the same rule:

| Artifact | Parent epic |
|---|---|
| `Test` issue | "QA Test Repository" |
| Test Plan (FTP, STP, ATP, RTP) | "QA Master Test Plan" (an Epic itself, not a Test Plan work type) |
| Test Execution (STR, ATR, RTR), Precondition, Test Set | "QA Test Artifacts", including the per-Story `ATS: {US_ID}` Acceptance Test Set (components inherited from the Story; a feature-level `TS:` is optional) |

Preconditions and Test Sets are real Jira issues, parentable through `acli`; their Test to Precondition association and Test Set membership are Xray-internal and are read with `bun xray test enrich`. Traceability to the source Story is an issue link, and the affected product area is a component, so the three axes are separate: parent is the QA bucket, link is the source Story, components are the product module. Canon: `agentic-qa-core/references/defect-management-doctrine.md`. (binding: `/sprint-testing`)

**Canonical tree** (Epic-centric; `<KEY>` = Jira key, `<slug>` from summary):

```
.context/PBI/
  README.md                                      [COMMIT] tier rules + gitignore ladder
  templates/                                     [COMMIT] skeletons
  epic-tree.md                                   [SYNC] master index
  epics/EPIC-<KEY>-<slug>/
    epic.md                                      [SYNC]
    module-context.md                            [SYNC ← '## Module Context (QA)' section of the Epic description]
    feature-implementation-plan.md               [SYNC ← Jira field / stub]
    feature-test-plan.md                         [SYNC ← Jira field / stub]
    test-specs/                                  [COMMIT] automation plans, versioned with the test code
      ROADMAP.md  PROGRESS.md
      <ID>/ spec.md  automation-plan.md  atc/*.md
    stories/STORY-<KEY>-<slug>/
      story.md                                   [SYNC]
      acceptance-criteria.md  business-rules.md  scope.md  out-of-scope.md
      workflow.md  mockup.md  implementation-plan.md
      acceptance-test-plan.md  acceptance-test-results.md   [SYNC ← Jira fields / stub]
      comments.md                                [SYNC, --include-comments]
      test-cases/                                [SYNC ← the Test issues linked to this Story]
      test-executions/{ATR|STR|RTR|RETEST}-<KEY>-<slug>.md   [SYNC - only when >1 Execution linked; non-conforming titles keep TESTEXEC-/RETESTEXEC-]
      defects/DEFECT-<KEY>-<slug>.md             [SYNC - one md file per linked defect]
      context.md                                 [LOCAL] notes about the repo, not the ticket
      evidence/                                  [LOCAL] screenshots
      shift-left-refinement.md                   [LOCAL] staging buffer for the shift-left publish
  epics/_orphans/                                [SYNC - parentless Stories, plus tests/: orphan Tests with no issue-link to any coverable, a visible traceability worklist]
  qa-artifacts/_index.md                         [SYNC - register of the QA-bucket Epics (label `QA-Artifact`): bucket name → key; no per-epic folders. Their content is distributed: coverables + Tests under what they cover, higher-altitude Plans/Runs into test-plans/ + test-executions/ below]
  qa-artifacts/master-test-plan.md               [SYNC ← '## Master Test Plan' section of the QA Master Test Plan Epic description: the MTP itself, mastered in Jira (ADR-0007)]
  bugs/BUG-<KEY>-<slug>/                         [SYNC - coverable folder: bug.md + ATP + ATR + test-executions/ + defects/]
  improvements/IMPROVEMENT-<KEY>-<slug>/         [SYNC - coverable folder: improvement.md + ATP + ATR + …]
  tech-stories/TECHSTORY-<KEY>-<slug>/           [SYNC - coverable folder: tech-story.md + ATP + ATR + …]
  tech-debts/TECHDEBT-<KEY>-<slug>/              [SYNC - coverable folder: tech-debt.md + ATP + ATR + …]
  defects/                                       [SYNC - standalone defect issues]
  test-plans/{FTP|STP|RTP|ATP}-<KEY>-<slug>.md             [SYNC - filename mirrors the title acronym; non-conforming titles keep TESTPLAN-]
  test-executions/{STR|ATR|RTR|RETEST}-<KEY>-<slug>.md     [SYNC - same rule; non-conforming titles keep TESTEXEC-/RETESTEXEC-]
  test-sets/ preconditions/                                [SYNC - TESTSET-/PRECONDITION-<KEY>-<slug>.md]
  ^ all four: Xray container issues (jira-xray); description holds the ATP/ATR body. Higher altitudes arrive via the QA-process-epic sweep, NOT the Story walk. Test↔Precondition association + the Xray side of Test Set membership are Xray-internal (GraphQL only), invisible to the REST sync: read via `bun xray test enrich`. Membership of the Story's ATS is ALSO a `TC→ATS` issue link in both modalities, which the sync reads (`agentic-qa-core/references/traceability-linking.md` §9)
```

**Pull scope.** Each work type declares its sync scope in `work_types.*.sync` of `.agents/jira-required.yaml` (the shipped default is Epic, Story and Bug); `--types` or `JIRA_SYNC_TYPES` extend it. The value is a declaration the sync obeys:

| `sync:` value | Effect |
|---|---|
| `default` | a plain `pull` sweeps it |
| `discovery` | it materializes only on an explicit `get` or `jql`, through a link, or via the QA-epic sweep |
| `never` | the sync refuses to write it and names the declaration that stopped it |

**Coverable types** (Story, Bug, Defect, Improvement, Tech Story, Tech Debt) each get their own folder: the body md, `acceptance-test-plan.md`, `acceptance-test-results.md`, `test-executions/` (only when more than one Execution is linked) and a nested `defects/`.

**ATP and ATR precedence.** Items come first: a Test Plan item is the ATP and a Test Execution item is the ATR, and the Story custom field is only a fallback. The order is the linked Xray Test Plan description (ATP) or Test Execution / Re-Test Execution description (ATR), then the issue field, then a Jira comment (only with `--include-comments`), then nothing. The two tiebreaks are asymmetric. With several Executions linked, the ATR is the one with the most recent `fields.updated`. With several Test Plans linked, the ATP is the first in raw Jira link order and a warning names the chosen key, so re-linking Test Plans in a different order silently changes which ATP body is canonical. Read that warning instead of assuming recency decided it. The sync also ends its run with traceability warnings for an ATP or ATR linked by the wrong link type, atypical Defect links, and orphan Defects with no coverable parent.

**Higher-altitude sweep.** FTP, STP and STR sit above a Story, so the coverage walk cannot reach them, and the Story-altitude guard rightly keeps skipping them there (an FTP linked to a Story is not that Story's ATP). An unfiltered `pull` therefore also sweeps the children of the four QA-process Epics, resolved by the `QA-Artifact` label, then the cached `qa.qa_epics.*.key`, then the `QA ` name prefix. That materializes the higher-altitude Plans and Runs plus Test Sets and Preconditions into the directories above. Coverables, Tests and Story-altitude `ATP:` Plans are left out, since each already has a home and sweeping them would write a second copy. `--no-qa-artifacts` skips the sweep, and a project with no QA-process Epics runs zero extra queries. Rationale: `.context/ADR/ADR-0001-artifact-ladder-local-cache.md`.

**What not to hand-write.** No `[SYNC]` file is protected, since each is overwritten on every sync. If a file mirrors a Jira or Xray field, read the synced copy. If it holds information Jira does not, author it locally and then pick its tier: `[COMMIT]` when another machine needs it, `[LOCAL]` when only this session does.

**Module context.** There is no custom field for it. Skills append a `## Module Context (QA)` section to the Epic `description`, reading first and never overwriting the PO's text, and the sync splits that section out into `module-context.md`. `description` exists on every Jira instance, so this works on a project with zero provisioned custom fields.

**Tests appear exactly once.** A `Test` reachable from a coverable issue materializes under that issue's `test-cases/`. Placement follows a cascade: `TC→ATS→Story` first, `TC→ATP→Story` as placement-only, a direct `TC→Story` link as the last resort, and otherwise `epics/_orphans/tests/` (doctrine canon: `agentic-qa-core/references/traceability-linking.md`). An orphan Test, with no path to any coverable, is a coverage smell worth seeing, and re-linking it in Jira moves it under its Story on the next sync.

**One ATP per Story.** The pre-sprint ATP is authored by `/shift-left-testing` only into `{{jira.acceptance_test_plan}}`, with no Test Plan item yet. `/sprint-testing` Stage 1 creates the Test Plan item from that field and refines the same field and item into the executable superset, so there is no `(Shift-Left DRAFT)` title variant. The pre-sprint pass is marked by the `shift-left-reviewed` and `shift-left-{YYYY-MM-DD}` labels. Stage 1's short-circuit reads the synced `acceptance-test-plan.md`, never a local scratch file, which would be missing on another machine and would degrade the short-circuit silently.

**Detailed reads go through the script**, which replaces `acli view` for custom fields because `acli view` returns null for `customfield_*`:

- `bun run jira:sync-issues get <KEY> --include-comments` fetches one issue with all custom fields and comments; read the generated `.md`.
- `bun run jira:sync-issues jql "<query>"` fetches a batch. `pull --epic <KEY>` and `--story <KEY>` scope a pull.
- Other flags: `--sprint <active|current|closed|>=N|7,8,10>`, `--types <csv>`, `--no-defects`, `--no-qa-artifacts`, `--project <KEY>`. Env defaults are `JIRA_SYNC_SPRINTS` and `JIRA_SYNC_TYPES` (flag beats env beats default).
- The link graph (Story, ATP, ATR, TC) and Xray run status stay on `acli` and `xray-cli`; the script mirrors field content only.

**Fallback.** When a custom field a skill must fill is absent from the instance, the skill writes the content as a structured Jira comment (`## <label>`) per `fallback:` in `.agents/jira-required.yaml`, and the sync emits a pointer stub for that field's `.md`. A missing field never blocks the work.

**Cold clone.** A fresh checkout has an almost empty `.context/PBI/` (the README, `templates/`, the committed `test-specs/`), which is the intended state. `bun run context:hydrate` rebuilds the cache. It needs `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` in `.env` plus the host from `issue_tracker.atlassian_url` in `.agents/project.yaml` (§7 anchor; validate with `bun run jira:check`). Someone without Jira access keeps an empty cache and can still review `test-specs/`, run the suite and work on framework code, but cannot do per-ticket QA.

**Entry points.** `/sprint-testing` syncs the ticket (`jira:sync-issues get`), explains the story, loads the synced PBI and explores the code. To resume, `/test-automation` reads `PROGRESS.md` and `ROADMAP.md`, re-runs its TC source gate, and picks up where it stopped.

**Project-wide context** (Level 1, generated) is read with `bun run context:map <slug>`, never raw. The Master Test Plan is not here: `project-context` mode `test-plan` writes it to the `QA Master Test Plan` Epic description, and the sync caches it at `.context/PBI/qa-artifacts/master-test-plan.md`.

```
.agents/skills/business-data-context/references/business-data-map.html   (project-context mode data)
.agents/skills/business-api-context/references/business-api-map.html     (project-context mode api)
.agents/skills/business-e2e-context/references/business-e2e-map.html     (project-context mode e2e)
.agents/skills/business-domain-context/references/business-domain-map.html (project-discovery Phase 1)
.agents/skills/infra-context/references/infra-map.html                   (project-discovery Phases 2-3)
api/schemas/                                 (bun run api:sync)
```
