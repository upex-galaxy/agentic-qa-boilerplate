# Phase 4 — Specification (Backlog Mapping + PBI Templates)

> Read this when running Phase 4 sub-steps: PBI Backlog Mapping or PBI Story Template. Phase 4 runs after Phase 3 is complete. Do NOT duplicate backlog content into the repo — document HOW to access it.

---

## Phase 4 outputs

| File | Purpose |
|------|---------|
| `.context/PBI/README.md` | Backlog location, access methods, project structure, common queries. |
| `.context/PBI/templates/user-story.md` | Canonical story format (role / action / benefit + AC). |
| `.context/PBI/templates/bug-report.md` | Canonical defect report with severity guide and evidence block. |
| `.context/PBI/templates/test-plan.md` | Story-scoped test plan (ACs -> TCs, scope, data, risks). |
| `.context/PBI/templates/test-case.md` | Single TC layout with steps/expected/execution log. |

Every output MUST include a `## Discovery Gaps` section if a field could not be verified (e.g., workflow states are assumed, no access to create-meta).

---

## Golden rules

1. **Do NOT copy the backlog.** The issue tracker is the source of truth for tickets. `.context/PBI/` holds only templates and per-sprint working notes.
2. **Cleanup rule:** per-sprint folders (`.context/PBI/<sprint-name>/<TICKET-ID>/`) are temporary. Delete after the sprint ends — story details can always be re-fetched.
3. **Tracker credentials in `.env` only.** `JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_URL` — never paste in markdown. If the user pastes a token in chat, scrub it and redirect them to `.env`. See SKILL.md §Gotchas for the general credential policy.
4. **Tool resolution.** When you see `[ISSUE_TRACKER_TOOL]` in this document, resolve via the project's CLAUDE.md Tool Resolution table. Priority order: CLI (fewer tokens) -> MCP (fallback) -> REST API -> manual. For Jira, that means load `/acli` skill first; only fall back to Atlassian MCP if acli is unavailable.

---

## Step 1 — PM Tool Identification

### Detection

| Source | What to look for |
|--------|------------------|
| `.context/project-config.md` | Existing `jira` / `azure-devops` / `clickup` / `linear` / `asana` mention |
| `package.json`, `.github/workflows/**` | Integrations, webhooks, bot tokens |
| Commit footers, PR templates | `PROJ-123` style refs -> Jira; `#123` -> GitHub; `AB#123` -> Azure Boards |
| `.gitlab-ci.yml` / `.circleci/config.yml` | Tracker hooks |

If nothing is detectable, ask once:

```
What tool manages your backlog? (Jira Cloud, Jira DC, Azure DevOps, Linear, ClickUp, GitHub Issues)
What is the project key or board name?
```

### Output of this step

- PM tool name + instance URL
- Project key / board name
- Whether the team uses sprints (Scrum), continuous flow (Kanban), or hybrid

> **Tooling coverage by tracker**: Jira uses `/acli` (primary skill); GitHub Issues uses `gh issue` CLI. Azure DevOps / Linear / ClickUp have no dedicated skill in this ecosystem — fall back to MCP (if available) or document REST API + token in `.context/PBI/README.md`. Flag the absence of a proprietary skill as a Discovery Gap so future adopters know what's unsupported.

---

## Step 2 — Project Structure Mapping

> **Prerequisite**: Load `/acli` skill before executing the commands below.

### Jira

```
[ISSUE_TRACKER_TOOL] List Projects:
  filter: {{PROJECT_KEY}}

[ISSUE_TRACKER_TOOL] List Boards:
  project: {{PROJECT_KEY}}

[ISSUE_TRACKER_TOOL] Get Create Meta:
  project: {{PROJECT_KEY}}
```

### Azure DevOps

```
[ISSUE_TRACKER_TOOL] List Projects
[ISSUE_TRACKER_TOOL] List Iterations:
  project: {{PROJECT_KEY}}
[ISSUE_TRACKER_TOOL] List Work Item Types:
  project: {{PROJECT_KEY}}
```

### Capture

- Issue types in use (Epic / Story / Task / Bug / Sub-task / custom)
- Workflow states and transitions (paste into a Mermaid state diagram)
- Sprint cadence (length, current sprint, next sprint)
- Required custom fields (if any)

If tool access is unavailable, ask the user for project key + board type and flag the rest as a Discovery Gap.

---

## Step 3 — Access Method Priority

| Rank | Method | When it fits |
|------|--------|--------------|
| 1 | MCP (e.g., Atlassian MCP) | Preferred — rich integration, live queries, schema-aware |
| 2 | CLI (e.g., `acli` for Jira, `gh issue` for GitHub, `az boards` for Azure DevOps) | Scriptable, no MCP available |
| 3 | REST API + token | Fallback, document `curl` recipe |
| 4 | Manual (Web UI) | Last resort; note in Discovery Gaps |

Record the chosen method and fallback in `.context/PBI/README.md`.

### Required env keys (emit to user)

```
JIRA_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
```

---

## Step 4 — Query Patterns

Document the four canonical QA queries. Resolve to the tracker's query language.

| Need | Jira JQL | Azure DevOps WIQL |
|------|----------|-------------------|
| Current sprint ready for QA | `project = {{PROJECT_KEY}} AND sprint in openSprints() AND status = "Ready for QA"` | `State = 'Ready for Test' AND [System.IterationPath] = @CurrentIteration` |
| All open bugs | `project = {{PROJECT_KEY}} AND type = Bug AND resolution = Unresolved ORDER BY priority DESC` | `Work Item Type = 'Bug' AND State <> 'Closed'` |
| My testing tasks | `project = {{PROJECT_KEY}} AND status = Testing AND assignee = currentUser()` | `State = 'Testing' AND [System.AssignedTo] = @Me` |
| Recently updated | `project = {{PROJECT_KEY}} AND updated >= -1d ORDER BY updated DESC` | `[Changed Date] > @Today - 1` |

Also record the `[ISSUE_TRACKER_TOOL]` pseudocode equivalents so other skills can reuse them.

---

## `.context/PBI/README.md` structure

Produce with these sections, in order:

1. **Header** — PM tool, project key, board, access method, last updated.
2. **Backlog Location** — URL, project key, board name + type.
3. **Access Configuration** — primary method (MCP/CLI/API), setup steps, fallback method, required env vars.
4. **Project Structure** — issue types table, workflow state diagram (Mermaid), sprint cadence.
5. **Common Queries** — the four canonical queries above, plus any project-specific ones.
6. **Integration with KATA** — when to fetch (during sprint-testing, bug triage, documentation, automation handoff), local storage rules.
7. **Credentials** — which env vars must be set; never paste secrets (see SKILL.md §Gotchas).
8. **Discovery Gaps** — anything not verifiable from code or tracker access.

### Local storage layout

```
.context/PBI/
|-- README.md                 # permanent
|-- templates/                # permanent
|   |-- user-story.md
|   |-- bug-report.md
|   |-- test-plan.md
|   `-- test-case.md
`-- <sprint-name>/            # temporary — delete after sprint ends
    `-- {{PROJECT_KEY}}-123/
        |-- story.md
        |-- test-plan.md
        `-- test-cases.md
```

---

## Template outputs

### user-story.md (essentials)

- Role / action / benefit: `As a <persona> I want to <action> so that <benefit>`.
- Acceptance Criteria as Given/When/Then, one per AC, numbered (AC1, AC2, ...).
- Technical Notes checklist (API / DB / UI changes, dependencies).
- Out of Scope section.
- Design/Mockups link, Related Stories (blocked-by, related-to).

**AC checklist to enforce:**
- [ ] Specific and measurable
- [ ] Testable (can be automated)
- [ ] Independent (doesn't assume other ACs)
- [ ] Business-focused (not implementation detail)

### bug-report.md (essentials)

- One-line bug summary.
- Environment table: environment, browser, OS, user type, date/time.
- Steps to Reproduce (numbered).
- Expected vs Actual.
- Evidence block: screenshots, console logs, network requests, video.
- Impact: severity, users affected, workaround, frequency.
- Regression flag: worked before / never worked / unknown.
- Related issues.

**Severity guide:**

| Severity | Criteria | Example |
|----------|----------|---------|
| Critical | System down, data loss, security breach | Cannot login, payment fails |
| High | Major feature broken, no workaround | Cannot create orders |
| Medium | Feature impaired, workaround exists | Filter broken, search works |
| Low | Cosmetic, minor | Typo, alignment |

### test-plan.md (essentials)

- Header: story key, title, sprint.
- AC -> TC mapping table.
- In-scope / Out-of-scope lists.
- Test types table (Functional / UI / API / Perf / Security / A11y) with Required + Reason.
- Test environments (local / staging / prod-smoke).
- Test data requirements.
- Test cases (TC-001, TC-002, ...) with priority, type, AC ref, automatable flag.
- Edge cases and negative tests.
- Dependencies / blockers / risks.
- Execution checklist + sign-off.

### test-case.md (essentials)

- Metadata: ID, title, story, AC ref, priority (P0-P3), type (Functional/UI/API/E2E), automation status, author, date.
- Description.
- Preconditions.
- Test data table.
- Steps table (#, action, expected).
- Expected results.
- Execution log (date, tester, pass/fail, notes).
- Evidence section.
- Bug reference (if failed).

---

## Gotchas

- **Undocumented tickets.** Teams frequently open stories with "TBD" ACs or empty descriptions. When mapping, record the prevalence ("~30% of recent stories lack ACs") as a Discovery Gap — this becomes the shift-left opportunity for the QA role.
- **Missing ACs.** Do NOT invent ACs to fill a template. If the source ticket has none, the generated `story.md` in the sprint folder should copy the emptiness and add `## Discovery Gaps: Acceptance Criteria missing — request from PO`.
- **Orphaned stories.** Stories with no Epic, or Epics with no parent theme, are common. Document the orphan count but do not attempt to re-parent from the skill.
- **Custom workflow states.** Every team renames states (`Ready for QA` vs `In QA` vs `Testing`). Capture the real state names in the workflow diagram; do not force a generic template.
- **Workflow drift.** The create-meta endpoint may list states that the current board does not actually use. When in doubt, read recent tickets to see which states appear in practice.
- **Permission gaps.** The QA user may not have permission to transition tickets. Test a state transition manually before committing a workflow diagram to the README.
- **Sprint naming inconsistency.** Sprints named `Sprint 42`, `S42`, `2026-W15`, `Hawking` all coexist in mature teams. Record the naming convention in use, do not normalize it.
- **Required custom fields.** `Story Points`, `Epic Link`, `Acceptance Criteria` (as a field, not description), `Components`. Fetch these from create-meta and include in the template; missing required fields will block ticket creation from CLI.
- **Two states named "Done".** Jira commonly has both `Done` and `Closed`; some workflows have `Resolved` in between. Capture all terminal states.
- **Do not hardcode issue types.** A project may not use `Sub-task`; another may have `Spike`, `Chore`, or `Incident`. Enumerate what the project actually uses.
- **Template placeholders must be explicit.** Use `[persona]`, `[action]`, `[benefit]` in templates — never leave them as blank inputs. The tokens help future sprint-testing runs fill them deterministically.
- **Do not embed secrets in examples.** CLI invocations must use env-var interpolation (`$JIRA_API_TOKEN`), not literal tokens.

---

## When to re-run Phase 4

| Trigger | Action |
|---------|--------|
| New PM tool adopted | Re-run Step 1-3; rewrite `.context/PBI/README.md`. |
| Workflow states changed | Re-run Step 2; update state diagram only. |
| New required custom fields | Update `user-story.md` + `bug-report.md` templates. |
| Team switches Scrum <-> Kanban | Update Project Structure section and queries. |
| Tracker URL migration (e.g., Jira Cloud move) | Update env keys and setup instructions. |

---

## Completion checklist

Before reporting Phase 4 complete:

- [ ] `.context/PBI/README.md` exists with project key + access recipe + four common queries.
- [ ] `.context/PBI/templates/user-story.md` exists with role/action/benefit + AC skeleton + AC checklist.
- [ ] `.context/PBI/templates/bug-report.md` exists with severity guide + evidence block.
- [ ] `.context/PBI/templates/test-plan.md` exists with AC->TC mapping table.
- [ ] `.context/PBI/templates/test-case.md` exists with execution log layout.
- [ ] All outputs include a `## Discovery Gaps` section (can be empty, but must be present).
- [ ] No credentials pasted in markdown; env-var references only.
- [ ] Sprint folder convention documented; cleanup rule stated.
- [ ] User has confirmed the workflow diagram matches reality (manual transition test or recent ticket review).

Emit the phase completion ping and wait for user confirmation before moving to the context generators. KATA adaptation is out of scope for this skill — it is owned by the `/adapt-framework` command and runs after discovery outputs exist.
