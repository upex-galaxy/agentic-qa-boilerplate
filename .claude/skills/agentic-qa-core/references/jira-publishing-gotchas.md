# Jira Publishing Gotchas

> **Purpose**: When QA methodology workflows write to Jira rich-text fields (description, AC, ATP body, ATR body, bug evidence, scope, business rules, workflow narrative, story comments), they pass through Markdown → ADF (Atlassian Document Format) conversion. Two converter / API bugs cost real cycles. Pre-empt both so future workflows do not hit the same wall.
> **Use when**: Any QA workflow is about to publish to a Jira rich-text field (Story / Bug / Test issue body or custom field), or when an HTTP 400 surfaces during publish.
> **Companion references (QA-side)**: `sprint-testing/references/reporting-templates.md`, `sprint-testing/references/acceptance-test-planning.md`, `test-documentation/references/jira-setup.md`, `test-documentation/references/jira-test-management.md`, `test-documentation/references/tms-architecture.md`, `shift-left-testing/references/atp-draft-template.md`, `acli/references/gotchas.md` (covers acli CLI usage gotchas — different surface).
> **Scope boundary**: this file is **what BREAKS** at publish (HTTP 400 edges). For **what READS WELL** — when to use a table / panel / nested list so ATP / ATR / TC content is scannable instead of flat prose, including the now-supported GFM tables — see `../../acli/references/adf-authoring-style.md`.

---

## Background

Jira rich-text fields require ADF (a structured JSON document, not Markdown). The `[ISSUE_TRACKER_TOOL]` ecosystem auto-converts Markdown → ADF for most operations, but the conversion has known edges and the API has surprise rejection paths. Both gotchas below are reproducible and silent until they fail at publish time.

---

## Gotcha 1 — `md-to-adf.ts` combines `code` + `strong` marks

- **Symptom**: HTTP 400 `INVALID_INPUT` from the Jira REST endpoint (or from the CLI wrapper) when publishing a rich-text field. The error body does not point to a node — just a top-level "invalid document".
- **Cause**: The Markdown → ADF converter at `.claude/skills/acli/scripts/md-to-adf.ts` emits a single text node carrying both `code` and `strong` marks when the source markdown nests `` `inline_code` `` inside `**bold**` (or italics). Jira rejects that mark combination at the document-validation layer, with no node-level diagnostic.
- **Permanent fix (landed)**: commit `4afd4f8` patched the converter at `acli/lib/md-to-adf.ts` to strip `strong` / `em` marks when an inline `code` mark co-occurs on the same text node. Jira REST `POST /rest/api/3/issue` now accepts documents that previously triggered HTTP 400 `INVALID_INPUT`. Fix lives inside the `acli` skill — do not duplicate the patch here.
- **Defensive authoring habit (still recommended)**: keep inline code spans OUTSIDE bold / italic spans when writing markdown destined for Jira. The strip transform makes nested marks safe to publish, but authoring them flat gives cleaner Jira render and avoids relying on the transform if a future converter regression slips through.
  - Preferred: `**run** \`bun install\` **first**`
  - Tolerated (transform handles it): `**run \`bun install\` first**`
  - Same rule applies for italics, strikethrough, and any future mark the converter learns to combine with `code`.

---

## Gotcha 2 — MCP rejects batched ADF custom fields

- **Symptom**: The error message `Operation value must be an Atlassian Document (see the Atlassian Document Format)` returned from `[ISSUE_TRACKER_TOOL]` when updating multiple rich-text custom fields in a single call (e.g. `{{jira.acceptance_criteria}}` + `{{jira.scope}}` + `{{jira.business_rules_specification}}` together).
- **Cause**: The MCP variant of `[ISSUE_TRACKER_TOOL]` auto-converts Markdown → ADF only for the top-level `description` field. Custom fields passed inside an `additional_fields` payload are forwarded as-is, so the Jira API receives raw Markdown strings where it expects ADF JSON and rejects the whole update.
- **Workaround A — split the update**: issue one update call per ADF custom field. Slower but simple and resilient. Default to this when touching 2+ rich-text custom fields.
- **Workaround B — pre-convert each value**: run each Markdown value through the converter at `.claude/skills/acli/scripts/md-to-adf.ts` and pass the resulting ADF JSON directly inside `additional_fields`. Faster but couples the workflow to converter internals.
- **Best practice**: when touching multiple rich-text fields, default to per-field-per-call (Workaround A). Do not batch. The latency cost is negligible compared to the cost of a failed publish that leaves the issue in a half-updated state.

---

## Detection checklist

Quick triage when a publish fails:

- HTTP 400 with no node-level error pointer → suspect Gotcha 1. Grep the authoring markdown for `` ` `` appearing inside `**…**` or `_…_`. Fix at the markdown layer.
- Error reads `Operation value must be an Atlassian Document` → Gotcha 2. Refactor the update path to per-field-per-call, or pre-convert each value.
- Any other 400 → not covered here. Surface the raw error to the user; do not silently retry.

---

## Anti-patterns

- NEVER nest `` `inline_code` `` inside `**bold**` or `_italic_` in markdown destined for an ADF field. Even one nested span will reject the whole document.
- NEVER batch multiple ADF custom fields in a single MCP update call. The "first one works, the rest silently fail" failure mode does not exist — the whole call is rejected, and partial state can result if the API committed any side effects before the rejection.
- NEVER swallow HTTP 400 or "Operation value must be an Atlassian Document" silently. Surface the diagnostic to the user with the specific fix (Gotcha 1 or Gotcha 2). A retry without the fix will fail identically.
- NEVER apply Workaround B (pre-convert) without verifying the converter version matches the project's checked-in converter — a stale local copy will produce ADF the live API rejects.

---

## Cross-references

This file is cited from `sprint-testing/references/reporting-templates.md` (ATR + bug evidence rich-text writes), `sprint-testing/references/acceptance-test-planning.md` (ATP body publish to Story), `test-documentation/references/jira-setup.md` (custom-field configuration + initial body writes), `test-documentation/references/jira-test-management.md` (Modality jira-native Test issue body writes), `test-documentation/references/tms-architecture.md` (Test / TestPlan / TestExecution body writes), and `shift-left-testing/references/atp-draft-template.md` (ATP DRAFT body publish during pre-sprint refinement). Any workflow that publishes rich-text content to Jira must link here for the two gotchas above before issuing its first write.

For acli CLI usage gotchas (pagination, transitions, custom-field payload shape, OAuth, rate limits, REST fallback) see `acli/references/gotchas.md` — that doc covers a different surface (CLI tool behavior) than this one (ADF rich-text publishing).
