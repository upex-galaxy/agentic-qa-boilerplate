# Product Backlog Items (PBI)

Per-epic and per-story QA workspace shared by `/shift-left-testing`, `/sprint-testing`, `/test-documentation`, and `/test-automation`.

> **This tree is OWNED by `scripts/sync-jira-issues.ts`.** Module = Epic (1:1). **Jira is the source of truth; every `[SYNC]` `.md` here is a read-only cache.** NEVER hand-write a Jira-mirrored file — generate the content, push it to the Jira field (or fallback comment), run the sync, then read the materialized file back. Authoritative tree + ownership rules live in `CLAUDE.md` §9.

## Layout (canonical, Epic-centric)

```
.context/PBI/
  epic-tree.md                                   [SYNC] master index
  epics/EPIC-<KEY>-<slug>/
    epic.md                                       [SYNC]
    feature-implementation-plan.md                [SYNC ← Jira field / stub]
    feature-test-plan.md                          [SYNC ← Jira field / stub]
    module-context.md                             [skill — non-Jira, OK]
    test-specs/                                   [skill — non-Jira, EPIC level]
      ROADMAP.md  PROGRESS.md
      <ID>/ spec.md  automation-plan.md  atc/*.md
    stories/STORY-<KEY>-<slug>/
      story.md                                    [SYNC]
      acceptance-criteria.md  business-rules.md  scope.md  out-of-scope.md
      workflow.md  mockup.md  implementation-plan.md        [SYNC ← Jira fields / stub]
      acceptance-test-plan.md  acceptance-test-results.md   [SYNC ← Jira fields / stub]
      comments.md                                 [SYNC, --include-comments]
      context.md  test-session-memory.md          [skill — non-Jira, OK]
      shift-left-refinement.md                    [skill — non-Jira, OK]
      test-cases/  evidence/                       [skill — non-Jira, OK]
      acceptance-test-plan.md  acceptance-test-results.md   [SYNC ← Xray Test Plan/Execution desc OVERRIDES Story field, else field, else stub]
      test-executions/                             [SYNC — only when >1 Execution linked]
      defects/<PREFIX>-<KEY>-<slug>/               [SYNC — linked defects nested as coverable folders]
  bugs/BUG-<KEY>-<slug>/                          [SYNC — coverable folder: bug.md + ATP + ATR + test-executions/ + defects/]
  improvements/IMPROVEMENT-<KEY>-<slug>/          [SYNC — coverable folder: improvement.md + ATP + ATR + …]
  tech-stories/TECHSTORY-<KEY>-<slug>/            [SYNC — coverable folder: tech-story.md + ATP + ATR + …]
  tech-debts/TECHDEBT-<KEY>-<slug>/               [SYNC — coverable folder: tech-debt.md + ATP + ATR + …]
  defects/ tests/                                 [SYNC — standalone defect / test issues]
  test-plans/ test-executions/ test-sets/ preconditions/   [SYNC — Xray container issues (jira-xray); description holds the ATP/ATR body]
  shift-left-sessions/<date>/batch-report.md      [skill — non-Jira, OK]
```

Folder naming follows Jira IDs verbatim — `<KEY>` is the Jira issue key, `<slug>` is `kebab-case` from the summary. Epic and Story folders are prefixed `EPIC-` / `STORY-`. Every Story lives under its Epic's `stories/` (Module = Epic, 1:1).

**Default `pull` scope = Epics + Stories + Bugs** (plus optional types via `--types` / `JIRA_SYNC_TYPES`). **Coverable** issues — Story, Bug, Defect, Improvement, Tech Story, Tech Debt — each get their OWN folder containing the issue body (`story.md` / `bug.md` / `improvement.md` / `tech-story.md` / `tech-debt.md` / `defect.md`), `acceptance-test-plan.md` (ATP), `acceptance-test-results.md` (ATR), a `test-executions/` subfolder (only when >1 execution is linked), and a `defects/` subfolder (linked defects nested as coverable folders). Standalone coverable folders live at `bugs/`, `improvements/`, `tech-stories/`, `tech-debts/`. **ATP/ATR source precedence:** a linked Xray Test Plan description (ATP) / Test Execution / Re-Test Execution description (ATR, newest wins) **OVERRIDES** the Story custom-field copy; absent that, the issue custom field; absent that, a Jira comment only with `--include-comments`; otherwise silent. The sync also emits end-of-run **traceability WARNINGS** for ATP/ATR linked via the wrong link type, atypical Defect links, and orphan Defects with no coverable parent.

## `[SYNC]` vs skill-authored

- **`[SYNC]` files = forbidden to hand-write.** They are overwritten on every sync — **NO file is hard-protected.** A file that mirrors a Jira/Xray field → read the synced copy, never author it locally.
- **Skill-authored, non-Jira files** (`module-context.md`, `test-specs/`, `context.md`, `test-session-memory.md`, `shift-left-refinement.md`, `test-cases/`, `evidence/`, `shift-left-sessions/`) hold info that is NOT in Jira → author them locally as usual.

## Jira-first generation contract

Every `[SYNC]` file's content originates in Jira. The flow is always **generate → push to Jira field (or fallback comment) → `jira:sync-issues` → read**:

1. `/shift-left-testing` refines ACs and the ATP DRAFT, writes them to the Story's custom fields (`{{jira.acceptance_criteria}}`, `{{jira.acceptance_test_plan}}`), then syncs.
2. `/sprint-testing` authors the ATP/ATR and pushes them to the Story fields (jira-native) or the Xray `Test Plan` / `Test Execution` description (jira-xray), then materializes the read-only cache per modality (story-folder `acceptance-test-*.md`, or `.context/PBI/test-plans/` / `test-executions/`).
3. If a custom field is absent on the instance, the skill writes the content as a structured Jira comment (`## <label>`, per `.agents/jira-required.yaml` → `fallback:`); the sync then emits a pointer stub for that field's `.md`. Never block on a missing field.

The **test-specs/** subtree (EPIC level) is `/test-automation`'s own non-Jira working area: `spec.md` (business-level TCs in Gherkin), `automation-plan.md` (KATA components, fixtures, architecture), and `atc/*.md` (per-ATC contracts for complex ATCs). These are authored locally — they are NOT Jira-mirrored.

## Detailed reads go through the sync

Custom-field content (ACs, ATP/ATR, scope, business rules, comments) is **only** read via the sync — `acli view` returns null for `customfield_*`:

- `bun run jira:sync-issues get <KEY> --include-comments` → one issue, ALL custom fields + comments → read the generated `.md`.
- `bun run jira:sync-issues jql "<query>"` → batch. `pull --epic <KEY>` / `--story <KEY>` → scoped. `pull --sprint <active|closed|>=N|7,8,10>` → sprint-scoped; `pull --types <csv>` → add optional coverable types; `pull --no-defects` → skip defect discovery; `pull --project <KEY>` → override project key.
- Traceability link-graph (Story↔ATP↔ATR↔TC) + Xray run status stay on `acli` / `xray-cli` — the script only mirrors field content.

## Conventions

- **Prefix**: Jira project key — `{{PROJECT_KEY}}-` (declared in `.agents/project.yaml`).
- **Names**: kebab-case for file names; `EPIC-` / `STORY-` / `DEFECT-` prefixes on folders per the canonical tree.
- **Evidence**: `evidence/` holds ephemeral screenshots/logs (gitignored).
