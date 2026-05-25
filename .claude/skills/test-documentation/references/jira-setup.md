# Jira TMS Setup Reference

Configuration checklist for Jira projects used by this boilerplate. Covers both modalities:

- **Modality jira-xray** — Xray install + project config. Primary content lives in this doc's §2.
- **Modality jira-native (no Xray)** — custom fields + Test issue type configuration so that ATP/ATR as Story customfields and Test issues work with the skills. Primary content in §3.

Which modality is active is resolved by `test-documentation/SKILL.md` §Phase 0. Run the applicable section(s) once per project as part of `/project-discovery` onboarding.

Skills that depend on this setup: `sprint-testing`, `test-documentation`, `regression-testing`, `fix-traceability`.

> **Before publishing rich-text bodies to Jira fields configured below** (ATP, ATR, Test Case body, Test Plan body), read `../../agentic-qa-core/references/jira-publishing-gotchas.md` — covers the two ADF conversion gotchas (`md-to-adf` mark collision + MCP batched custom-field rejection) that silently fail HTTP 400.

---

## 1. Pre-setup checklist (both modalities)

- [ ] Jira Cloud or DC instance
- [ ] Jira Administrator permissions (required for Issue Type Scheme, Screens, Workflows, Custom fields)
- [ ] Modules list known (e.g. Auth, Checkout, Billing)
- [ ] Regression Epic created (or let `test-documentation` create it on first run)
- [ ] `.env` populated with `ATLASSIAN_URL`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`, and `JIRA_PROJECT_KEY`
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

Project Settings → Apps → Xray Settings → Test Coverage. Select `Story` and `Epic` as coverable issue types. Optionally add `Bug`. Save.

Global: Settings → Apps → Xray → Issue Type Mapping → Requirement Issue Types = `Story, Epic`, Defect Issue Types = `Bug`.

### 2.4 Test workflow

Settings → Issues → Workflows → Add workflow: `Test Lifecycle Workflow`. States and transitions from `tms-conventions.md` §5 (workflow state machine). Assign via Workflow Scheme to Test issue type.

### 2.5 API credentials

Settings → Apps → Xray → API Keys → Create API Key. Save `Client ID` + `Client Secret` into `.env`:

```
XRAY_CLIENT_ID=...
XRAY_CLIENT_SECRET=...
ATLASSIAN_URL=https://your-site.atlassian.net
ATLASSIAN_EMAIL=you@example.com
ATLASSIAN_API_TOKEN=...
JIRA_PROJECT_KEY=PROJ
XRAY_TEST_PLAN_KEY=PROJ-300      # optional
XRAY_ENVIRONMENT=staging         # optional
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
| Components | Multi-select (default) | Optional | Module grouping |
| Epic Link | Epic picker | Yes | Points to the Regression Epic |
| Test Status | Select (custom) | Yes | `NOT RUN` / `PASSED` / `FAILED` / `BLOCKED` — the Execution Status per `tms-conventions.md` §IQL |
| Workflow Status | (workflow) | Yes | `Draft` / `In Design` / `Ready` / … / `Automated` / `Deprecated` |
| Automation Candidate | Checkbox (custom) | Yes | Boolean flag — redundant with labels but easier to filter |
| Linked Issues | Links (default) | Yes | "is tested by" → Story, "is blocked by" → Bug |

Create the two custom fields:

1. Settings → Issues → Custom fields → Add field → Select List (single choice) → Name `Test Status` → Options `NOT RUN`, `PASSED`, `FAILED`, `BLOCKED`. Associate with the Test issue type.
2. Add field → Checkbox → Name `Automation Candidate`. Associate with the Test issue type.

After creating the fields, run `bun run jira:sync-fields --force` so the numeric IDs Jira assigned are auto-discovered into `.agents/jira-fields.json` under their slug. Reference them from skills via `{{jira.<slug>}}` — never paste the raw `customfield_NNNNN` ID into a skill or doc (workspace-portability rule, CLAUDE.md §1.12).

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

Record the IDs in `.context/master-test-plan.md`:

```markdown
## TMS Modality: Jira-native

| Artifact | Custom field ID |
|----------|-----------------|
| ATP      | {{jira.acceptance_test_plan}}
| ATR      | {{jira.acceptance_test_results}}
| Test Status (on Test) | {{jira.test_status}}
| Automation Candidate (on Test) | {{jira.to_be_automated}}
```

### 3.4 Bug custom fields (UPEX reference, both modalities)

The `sprint-testing/references/reporting-templates.md` §1.10 table lists the UPEX Galaxy workspace defaults for bug custom fields (Severity, Root Cause, Error Type, etc.). Re-create the equivalent fields in the project, or accept the skill's graceful degradation (bugs land with missing fields and a warning).

### 3.5 Issue links

Add link types if missing: Settings → Issue linking → ensure `tests / is tested by` and `blocks / is blocked by` are present.

### 3.6 API access

`/acli` skill uses an API token. Obtain one from `id.atlassian.com/manage-profile/security/api-tokens`. Populate `.env`:

```
ATLASSIAN_URL=https://your-site.atlassian.net
ATLASSIAN_EMAIL=you@example.com
ATLASSIAN_API_TOKEN=...
JIRA_PROJECT_KEY=PROJ
```

Verify with `[ISSUE_TRACKER_TOOL] auth_status()` (load `/acli` skill — it owns the literal command shape).

### 3.7 Workflow

Same state machine as Modality jira-xray (`tms-conventions.md` §5). Build a Jira workflow with these states and attach it to the Test issue type via a Workflow Scheme.

---

## 4. Per-project configuration output

At the end of setup, `.context/master-test-plan.md` must contain a TMS section that answers these five questions unambiguously:

```markdown
## TMS

- Modality: Xray on Jira | Jira-native
- TMS CLI: bun xray | acli (only)
- Regression Epic: {KEY} — {title}
- Custom field IDs (Modality jira-native only):
    ATP: {{jira.acceptance_test_plan}}
    ATR: {{jira.acceptance_test_results}}
    Test Status: {{jira.test_status}}
    Automation Candidate: {{jira.to_be_automated}}
- Link types available: is tested by / tests, is blocked by / blocks
```

If any answer is missing, the skills fall back to the Phase 0 resolution probes (`CLAUDE.md` → `master-test-plan.md` → list issue types → ask the user). Making the answers explicit here is what saves every future session from re-asking.

---

## 5. Validation checklist

After setup, both modalities should pass:

- [ ] Can create a `Test` issue in the project (Modality jira-native) / all five Xray types appear (Modality jira-xray).
- [ ] `[ISSUE_TRACKER_TOOL] List issue types` shows `Test` + (if A) `Test Plan`, `Test Execution`, `Test Set`, `Pre-Condition`.
- [ ] Can update a Story's `{{jira.acceptance_test_plan}}` and `{{jira.acceptance_test_results}}` with a test string (Modality jira-native). Both fields persist and display.
- [ ] `is tested by` link can be created from a Test to a Story.
- [ ] Workflow transition `start design` is available on a Test in `Draft`.
- [ ] `/xray-cli` (A) or `/acli` (B) authenticates against the project key.
