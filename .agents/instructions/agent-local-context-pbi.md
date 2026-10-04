---
id: local-context-pbi
title: 'Local context: the PBI cache of Jira'
load_when: 'Jira or Xray reads, the .context/PBI/ cache, sync, hydrate, ATP / ATR / TC files, a ticket folder'
triggers: ['\.context/PBI', '\bPBI\b', '\bjira\b', '\bxray\b', '\bsync', '\bhydrate\b', '\bepic\b', '\bATS\b', '\btest-specs\b', '\b[A-Z][A-Z0-9]+-\d+\b']
paths: ['.context/PBI/', 'scripts/sync-jira-issues.ts']
---

# Local context (PBI)

## 9. LOCAL CONTEXT (PBI)

> **`.context/PBI/` is a GITIGNORED CACHE of Jira, owned by `scripts/sync-jira-issues.ts`.** Module = Epic (1:1). Jira is the source of truth. NEVER hand-write a Jira-mirrored file: generate content, push it to the Jira field (or fallback), then run the sync. Rebuild the whole tree with `bun run context:hydrate`. (binding: `/sprint-testing`)

> **WHY IT IS NOT COMMITTED**: this content regenerates. Two sessions that re-sync at different times produce conflicting commits of the same generated text, and a 3-way merge over a full-file rewrite is meaningless. Jira already is the versioned, shared, cloud-hosted copy — committing it duplicates the database into git and buys nothing.

**THREE TIERS** — every path under `.context/PBI/` is exactly one of these. Check before creating any file:

| Tier | Source of truth | In git? | Recovered by |
|---|---|---|---|
| `[SYNC]` | Jira | No | `bun run context:hydrate` |
| `[COMMIT]` | This repo | **Yes** | `git checkout` |
| `[LOCAL]` | Nothing durable | No | Not recovered — disposable by design |

`[LOCAL]` files may be hand-written, but **nothing downstream may depend on one existing**: it lives only on the machine that made it. A skill that needs to read it on another machine must put the content in Jira instead. `test-session-memory.md` is NOT in this tree — it lives at `.session/sprint-testing/<scope>/` so a re-sync cannot clobber it.

**GITIGNORE LADDER** (git cannot re-include a file whose parent dir is excluded, so it descends level by level — collapsing this to a plain `.context/PBI/` silently drops `test-specs/` from version control):

The lines are in `.gitignore` (the `.context/` block): `.context/*` is ignored by default, the files this repo owns are re-included by name, and the PBI part descends one exclude and one re-include per level, down to `epics/*/test-specs/`.

Verify any change with `git check-ignore -v` on both a `test-specs/` file (must NOT be ignored) and a `stories/.../story.md` (must be ignored).

> **QA-process parenting (3-axis model).** In Jira, every `bug` / `defect` / `improvement` parents to the QA process epic **"QA Defect Management"** (every `Test` issue to **"QA Test Repository"**, every **Test Plan** FTP/STP/ATP/RTP to **"QA Master Test Plan"** (itself an Epic, not a Test Plan work type), and every **Test Execution** STR/ATR/RTR + Precondition + Test Set to **"QA Test Artifacts"** — incl. the mandatory per-Story `ATS: {US_ID}` Acceptance Test Set (components inherited from the Story; feature-level `TS:` optional)), NEVER a product/dev epic. Preconditions + Test Sets are real Jira issues (parentable via `acli`); their Test↔Precondition association and Test Set membership are Xray-internal — read via `bun xray test enrich`. Traceability to the source Story is carried by an **issue-link**, and the affected product area by **components**: three separate axes (parent = QA bucket · link = source Story · components = product module). Canon: `agentic-qa-core/references/defect-management-doctrine.md`. (binding: `/sprint-testing`)

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
  epics/_orphans/                                [SYNC - parentless Stories, plus tests/: orphan Tests with no issue-link to any coverable — a visible traceability worklist]
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

**`pull` scope is declared per work type via `work_types.*.sync` in `.agents/jira-required.yaml`** (shipped default: Epic + Story + Bug); `--types` / `JIRA_SYNC_TYPES` extend it. **Coverable** types (Story, Bug, Defect, Improvement, Tech Story, Tech Debt) each get their OWN folder: body md + `acceptance-test-plan.md` + `acceptance-test-results.md` + `test-executions/` (only when >1 Execution linked) + nested `defects/`. **ATP/ATR precedence** (items-first: a **Test Plan** item for ATP / **Test Execution** item for ATR by excellence; the Story custom field is fallback only): linked Xray Test Plan desc (ATP) / Test Execution / Re-Test Execution desc (ATR) OVERRIDE the Story custom-field copy → else issue field → else Jira comment (only `--include-comments`) → else silent. **The two tiebreaks are ASYMMETRIC — "newest wins" is the ATR rule only**: with several Executions linked the ATR is the one with the most recent `fields.updated`, but with several Test Plans linked the ATP is simply the FIRST in raw Jira link order (a warning names the chosen key). So re-linking a Story's Test Plans in a different order silently changes which ATP body becomes canonical — read that warning, do not assume recency decided it. Sync emits end-of-run **traceability WARNINGS** for ATP/ATR linked via the wrong link type, atypical Defect links, and orphan Defects with no coverable parent.

**HIGHER-ALTITUDE SWEEP**: FTP / STP / STR sit ABOVE a Story, so the coverage walk structurally cannot reach them — and the Story-altitude guard is right to keep skipping them there, because an FTP linked to a Story is not that Story's ATP. An unfiltered `pull` therefore ALSO sweeps the CHILDREN of the four QA-process Epics (resolved by the `QA-Artifact` label → cached `qa.qa_epics.*.key` → `QA ` name prefix; no new config), materializing the higher-altitude Plans and Runs plus Test Sets and Preconditions into the dirs above. Coverables, Tests and Story-altitude `ATP:` Plans are excluded: each already has a canonical home, and sweeping them would write a second copy of the same body. Skip with `--no-qa-artifacts`; a project with no QA-process Epics runs zero extra queries. Rationale: `.context/ADR/ADR-0001-artifact-ladder-local-cache.md`.

**`sync:` is a declaration, not a hint**: `default` = swept by a plain `pull` · `discovery` = materializes only on an explicit `get`/`jql`, through a link, or via the QA-epic sweep · `never` = the sync REFUSES to write it and names the declaration that stopped it.

**`[SYNC]` files = forbidden to hand-write** (overwritten on every sync: NO file is hard-protected; Jira is the source of truth). **Rule of thumb**: file mirrors a Jira/Xray field → read the synced copy, never author it locally. File holds info NOT in Jira → author it locally, then decide its tier: does another machine need it? `[COMMIT]`. Only this session? `[LOCAL]`.

**MODULE CONTEXT → EPIC DESCRIPTION.** No custom field: skills APPEND a `## Module Context (QA)` section to the Epic `description` (read-first, never overwrite the PO's text) and the sync splits that section out into `module-context.md`. `description` exists on every Jira instance, so this works on a project that provisions zero custom fields.

**TESTS APPEAR EXACTLY ONCE.** A `Test` reachable from a coverable issue materializes under that issue's `test-cases/`; placement resolves by the cascade `TC→ATS→Story` (primary) → `TC→ATP→Story` (placement-only) → direct `TC→Story` (last-resort) → else `epics/_orphans/tests/` (cascade implemented by the Session-B sync work; doctrine canon: traceability-linking). Orphans — Tests with no path to any coverable — are themselves a coverage smell worth seeing; re-linking one in Jira moves it under its Story on the next sync.

**ONE ATP PER STORY.** Field-first: `/shift-left-testing` authors the pre-sprint ATP ONLY into `{{jira.acceptance_test_plan}}` (no Test Plan item yet); `/sprint-testing` Stage 1 creates the Test Plan item FROM that field and refines the SAME field + item into the executable superset. No `(Shift-Left DRAFT)` title variant. The pre-sprint pass is marked by the `shift-left-reviewed` + `shift-left-{YYYY-MM-DD}` labels. Stage 1's short-circuit reads the SYNCED `acceptance-test-plan.md` — never a local scratch file, which would be missing on any other machine and would degrade the short-circuit silently.

**DETAILED READS via the script** (replaces `acli view` for custom fields):
- `bun run jira:sync-issues get <KEY> --include-comments` → one issue, ALL custom fields + comments → read the generated `.md`.
- `bun run jira:sync-issues jql "<query>"` → batch. `pull --epic <KEY>` / `--story <KEY>` → scoped. New flags: `--sprint <active|current|closed|>=N|7,8,10>` (sprint filter), `--types <csv>` (extra coverable types), `--no-defects` (skip defect discovery), `--no-qa-artifacts` (skip the QA-process-epic sweep), `--project <KEY>` (override key). Env defaults: `JIRA_SYNC_SPRINTS`, `JIRA_SYNC_TYPES` (flag > env > default).
- Traceability (link graph Story↔ATP↔ATR↔TC) + Xray run status STAY on `acli`/`xray-cli`: the script only mirrors field content.

**FALLBACK**: if a custom field a skill must fill is absent from the instance, the skill writes the content as a structured Jira comment (`## <label>`) per `.agents/jira-required.yaml` → `fallback:`. The sync then emits a pointer stub for that field's `.md`. Never block on a missing field.

**COLD CLONE**: a fresh checkout has an almost-empty `.context/PBI/` (this README, `templates/`, committed `test-specs/`). That is the intended state. `bun run context:hydrate` rebuilds the cache; it needs `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` in `.env` plus the host from `.agents/project.yaml` → `issue_tracker.atlassian_url` (§7 anchor; validate with `bun run jira:check`). Someone without Jira access keeps an empty cache and can still review `test-specs/`, run the suite, and work on framework code — but not per-ticket QA.

**ENTRY POINT**: invoke `/sprint-testing`: syncs the ticket (`jira:sync-issues get`), explains story, loads the synced PBI, explores code.

**RESUME SESSION**: invoke `/test-automation`. Skill reads `PROGRESS.md` + `ROADMAP.md` automatically, picks up where left off.

**Project-wide context** (Level 1, generated; the maps are read with `bun run context:map <slug>`, never raw). The Master Test Plan is NOT here: `project-context` mode `test-plan` writes it to the `QA Master Test Plan` Epic description, and the sync caches it at `.context/PBI/qa-artifacts/master-test-plan.md`.

```
.agents/skills/business-data-context/references/business-data-map.html   (project-context mode data)
.agents/skills/business-api-context/references/business-api-map.html     (project-context mode api)
.agents/skills/business-e2e-context/references/business-e2e-map.html     (project-context mode e2e)
.agents/skills/business-domain-context/references/business-domain-map.html (project-discovery Phase 1)
.agents/skills/infra-context/references/infra-map.html                   (project-discovery Phases 2-3)
api/schemas/                                 (bun run api:sync)
```
