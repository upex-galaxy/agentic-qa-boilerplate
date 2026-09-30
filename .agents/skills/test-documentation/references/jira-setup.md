# Jira TMS Setup Reference

Configuration checklist for Jira projects used by this boilerplate. Covers both modalities:

- **Modality jira-xray** — Xray install + project config. Primary content lives in this doc's §2.
- **Modality jira-native (no Xray)** — custom fields + Test issue type configuration so that ATP/ATR as Story customfields and Test issues work with the skills. Primary content in §3.

Which modality is active is resolved by `test-documentation/SKILL.md` §Phase 0. Run the applicable section(s) once per project as part of `/project-discovery` onboarding.

Skills that depend on this setup: `sprint-testing`, `test-documentation` (including mode `repair-traceability`), `regression-testing`.

> **Before publishing rich-text bodies to Jira fields configured below** (ATP, ATR, Test Case body, Test Plan body), read `../../agentic-qa-core/references/jira-publishing-gotchas.md` — covers the two ADF conversion gotchas (`md-to-adf` mark collision + MCP batched custom-field rejection) that silently fail HTTP 400.

---

## 1. Pre-setup checklist (both modalities)

- [ ] Jira Cloud or DC instance
- [ ] Jira Administrator permissions (required for Issue Type Scheme, Screens, Workflows, Custom fields)
- [ ] Modules list known (e.g. Auth, Checkout, Billing)
- [ ] Regression Epic created (or let `test-documentation` create it on first run)
- [ ] `.env` populated with `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`, and `JIRA_PROJECT_KEY`
- [ ] `.agents/project.yaml` -> `issue_tracker.atlassian_url` set (the site host is NOT in `.env`; verify with `bun run --silent jira:url`)
- [ ] `/acli` skill loaded (primary) or Atlassian MCP available (fallback)

---

## 2. Modality jira-xray — Xray setup (only if Xray is licensed)

### 2.1 Install Xray

**Jira Cloud**: Settings (gear) → Apps → Find new apps → "Xray Test Management" → Get it now.
**Jira DC**: Settings → Manage apps → Find new apps → "Xray Test Management for Jira" → Install.

Activate license. Verify new issue types appear: `Test`, `Test Set`, `Test Plan`, `Test Execution`, `Pre-Condition`.

### 2.2 Add Xray issue types to the project

Project Settings → Issue types → Actions → Add Xray Issue Types. Select all five.

### 2.3 Configure Requirement Coverage

The coverable issue types are declared once: every work type `.agents/jira-required.yaml` marks `coverable: true` under `work_types`, by its `jira_issue_type` name. Configure Xray from that list, not from memory, so Xray's coverage and the PBI sync agree on which issues a Test can cover.

Project Settings → Apps → Xray Settings → Test Coverage. Select every coverable issue type. Save.

Global: Settings → Apps → Xray → Issue Type Mapping:

- Requirement Issue Types = the same coverable issue types.
- Defect Issue Types = `Bug, Defect`: the two broken-AC classes of `../../agentic-qa-core/references/defect-management-doctrine.md` Part 1, so a Defect filed pre-release can be attached to a Test Run exactly like a Bug. An Improvement is not a broken AC and stays out of this mapping.

### 2.4 Test workflow

Settings → Issues → Workflows → Add workflow: `Test Lifecycle Workflow`. States and transitions from `tms-conventions.md` §5 (workflow state machine). Assign via Workflow Scheme to Test issue type.

### 2.5 API credentials

Settings → Apps → Xray → API Keys → Create API Key. Save `Client ID` + `Client Secret` into `.env`:

```
XRAY_CLIENT_ID=...
XRAY_CLIENT_SECRET=...
# NOTE: the Atlassian site HOST is not a .env variable. It lives in
# .agents/project.yaml -> issue_tracker.atlassian_url (`bun run agents:setup`).
ATLASSIAN_EMAIL=you@example.com
ATLASSIAN_API_TOKEN=...
JIRA_PROJECT_KEY=PROJ
XRAY_PROJECT_KEY=PROJ            # optional, local sync only
STP_EXECUTION_KEY=PROJ-194       # target Test Execution (RTR or sprint STR) for the write-back; never a Plan key
```

Verify with `[TMS_TOOL] auth_status()` (load `/xray-cli` skill — it owns the literal command shape).

Full reference: `xray-platform.md`.

---

## 3. Modality jira-native — setup (no Xray)

Jira-native mode puts ATP/ATR on the Story itself via custom fields, and represents TCs as a custom `Test` issue type. The skills need three things configured before they can run: the `Test` issue type, an ATP customfield, and an ATR customfield.

### 3.1 Create a custom `Test` issue type

Settings → Issues → Issue types → Add issue type. Name: `Test`. Description: "Manual or automated test case".

Add it to the project's Issue Type Scheme: Project Settings → Issue types → Add existing → `Test`.

### 3.2 Configure fields on the Test issue type

The skill writes into these fields when creating TCs. Add them to the Test issue type's **Create / Edit / View** screens via a Screen Scheme.

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| Summary | Text (default) | Yes | TC title per naming convention |
| Description | Rich text (default) | Yes | Full TC template (Gherkin or steps + metadata) |
| Priority | Select (default) | Yes | Critical / High / Medium / Low |
| Labels | Multi-select (default) | Yes | `regression`, `smoke`, `e2e`, `automation-candidate`, etc. |
| Components | Multi-select (default) | Yes | Affected product module — mandatory on every Test (defect-management doctrine Part 3) |
| Epic Link | Epic picker | Yes | Points to the Regression Epic |
| Test Status | Select (custom) | Yes | the options `test_status.options` in `.agents/jira-required.yaml` declares — the Execution Status per `tms-conventions.md` §IQL |
| Workflow Status | (workflow) | Yes | `Draft` / `In Design` / `READY` / … / `AUTOMATED` / `DEPRECATED` |
| Automation Candidate | Checkbox (custom) | Yes | Boolean flag — redundant with labels but easier to filter |
| Linked Issues | Links (default) | Yes | "is tested by" → Story, "is blocked by" → Bug |

Create the two custom fields:

1. Settings → Issues → Custom fields → Add field → Select List (single choice) → Name `Test Status` → Options as `test_status.options` in `.agents/jira-required.yaml` declares them. Associate with the Test issue type.
2. Add field → Checkbox → Name `Automation Candidate`. Associate with the Test issue type.

After creating the fields, run `bun run jira:sync-fields --force` so the numeric IDs Jira assigned are auto-discovered into `.agents/jira-fields.json` under their slug. Reference them from skills via `{{jira.<slug>}}` — never paste the raw `customfield_NNNNN` ID into a skill or doc (workspace-portability rule, AGENTS.md §1.12).

### 3.3 Configure ATP and ATR custom fields on the Story issue type

These fields hold the Test Analysis and Test Report bodies for every Story.

| Field | Type | On issue types | Purpose |
|-------|------|----------------|---------|
| Acceptance Test Plan | Long text (multi-line) | Story, Epic | Holds the full Test Analysis body written in Stage 1 Planning |
| Acceptance Test Results | Long text (multi-line) | Story, Epic | Holds the full Test Report body written in Stage 3 Reporting |

Steps:

1. Settings → Issues → Custom fields → Add field → **Paragraph (supports rich text)** → Name `Acceptance Test Plan` → Associate with the Story (and Epic if the project uses epic-level ATPs).
2. Add field → **Paragraph** → Name `Acceptance Test Results` → same associations.
3. After running `bun run jira:sync-fields`, IDs are auto-discovered into `.agents/jira-fields.json` (slugs `acceptance_test_plan` for ATP and `acceptance_test_results` for ATR). Both are referenced via `{{jira.<slug>}}` from the skills.
4. Add both fields to the Story's **View Screen** (Settings → Issues → Screens). Leave them off the Create screen (the skill populates them later, not the PM).
5. Optionally add them to the Story's Edit Screen so PO/Dev can see them inline.

Nothing to record by hand: `.agents/jira-fields.json` is the one place the IDs live, and the skills resolve `{{jira.<slug>}}` from it.

### 3.4 Bug custom fields (UPEX reference, both modalities)

The `sprint-testing/references/reporting-templates.md` §1.10 table lists the shipped bug custom fields (`.agents/jira-required.yaml`) (Severity, Root Cause, Error Type, etc.). Re-create the equivalent fields in the project, or accept the skill's graceful degradation (bugs land with missing fields and a warning).

### 3.5 Issue links

Add link types if missing: Settings → Issue linking → ensure `tests / is tested by` and `blocks / is blocked by` are present.

### 3.6 API access

`/acli` skill uses an API token. Obtain one from `id.atlassian.com/manage-profile/security/api-tokens`. Populate `.env`:

```
# NOTE: the Atlassian site HOST is not a .env variable. It lives in
# .agents/project.yaml -> issue_tracker.atlassian_url (`bun run agents:setup`).
ATLASSIAN_EMAIL=you@example.com
ATLASSIAN_API_TOKEN=...
JIRA_PROJECT_KEY=PROJ
```

Verify with `[ISSUE_TRACKER_TOOL] auth_status()` (load `/acli` skill — it owns the literal command shape).

### 3.7 Workflow

Same state machine as Modality jira-xray (`tms-conventions.md` §5). Build a Jira workflow with these states and attach it to the Test issue type via a Workflow Scheme.

---

## 4. Per-project configuration output

At the end of setup, five questions must have an unambiguous answer. Each already has one owner, so setup fills those owners and writes no summary anywhere else (the Master Test Plan is strategy, not configuration):

| Question | Owner |
|----------|-------|
| Modality (Xray on Jira or Jira-native) and TMS CLI | `.agents/project.yaml` → `testing.tms_cli` (`bun xray` = jira-xray; unset or `acli` = jira-native) |
| Regression Epic | `.agents/project.yaml` → `qa.qa_epics.test_repository_epic` (name, key cached on first discovery) |
| Custom field IDs (Modality jira-native only) | `.agents/jira-fields.json`, filled by `bun run jira:sync-fields` |
| Link types available | `.agents/jira-link-types.json`, filled by `bun run jira:sync-link-types` |

If an owner is empty, the skills fall back to the Phase 0 resolution probes (`.agents/project.yaml` → list issue types → ask the user). Filling the owners is what saves every future session from re-asking.

---

## 5. Validation checklist

After setup, both modalities should pass:

- [ ] Can create a `Test` issue in the project (Modality jira-native) / all five Xray types appear (Modality jira-xray).
- [ ] `[ISSUE_TRACKER_TOOL] List issue types` shows `Test` + (if A) `Test Plan`, `Test Execution`, `Test Set`, `Pre-Condition`.
- [ ] Can update a Story's `{{jira.acceptance_test_plan}}` and `{{jira.acceptance_test_results}}` with a test string (Modality jira-native). Both fields persist and display.
- [ ] `is tested by` link can be created from a Test to a Story.
- [ ] Workflow transition `start design` is available on a Test in `Draft`.
- [ ] `/xray-cli` (A) or `/acli` (B) authenticates against the project key.
