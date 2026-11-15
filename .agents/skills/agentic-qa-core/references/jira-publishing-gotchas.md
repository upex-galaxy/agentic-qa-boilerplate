# Jira Publishing Gotchas

> **Purpose**: QA workflows write Markdown to Jira rich-text fields (description, AC, ATP body, ATR body, bug evidence, scope, business rules, workflow narrative, story comments), and Jira stores them as ADF (Atlassian Document Format). Two converter and API edges cost real cycles; this file lets a workflow avoid both.
> **Use when**: a QA workflow is about to publish to a Jira rich-text field (Story, Bug or Test issue body, or a custom field), or an HTTP 400 surfaces during a publish.
> **Companion references (QA-side)**: `sprint-testing/references/reporting-templates.md`, `sprint-testing/references/acceptance-test-planning.md`, `test-documentation/references/jira-setup.md`, `test-documentation/references/jira-test-management.md`, `test-documentation/references/tms-architecture.md`, `shift-left-testing/references/atp-outline-template.md`, and `acli/references/gotchas.md` (acli CLI usage gotchas, a different surface).
> **Scope boundary**: this file covers what breaks at publish (HTTP 400 edges). For what reads well (when a table, panel or nested list makes ATP, ATR or TC content scannable, including the supported GFM tables) see `../../acli/references/adf-authoring-style.md`.

---

## Background

Jira rich-text fields take ADF, a structured JSON document, and not Markdown. The CLI path of `[ISSUE_TRACKER_TOOL]` (`acli`) never converts Markdown for you: you convert the body with `.agents/skills/acli/scripts/md-to-adf.ts` and publish the resulting ADF JSON. The opt-in MCP variant converts only the top-level `description` (Gotcha 2). The conversion has known edges and the API has surprise rejection paths. Both gotchas below reproduce reliably and stay silent until the publish fails.

---

## Gotcha 1: `md-to-adf.ts` combines `code` + `strong` marks

- **Symptom**: HTTP 400 `INVALID_INPUT` from the Jira REST endpoint (or from the CLI wrapper) when publishing a rich-text field. The error body points to no node, only a top-level "invalid document".
- **Cause**: the Markdown to ADF converter at `.agents/skills/acli/scripts/md-to-adf.ts` emits one text node carrying both `code` and `strong` marks when the source nests `` `inline_code` `` inside `**bold**` (or italics). Jira rejects that mark combination at document validation, with no node-level diagnostic.
- **Permanent fix**: the converter at `acli/scripts/md-to-adf.ts` strips `strong` and `em` marks when an inline `code` mark sits on the same text node, so Jira REST `POST /rest/api/3/issue` accepts documents that would otherwise return HTTP 400 `INVALID_INPUT`. The fix lives inside the `acli` skill; do not duplicate the patch here.
- **Authoring habit (still recommended)**: keep inline code spans outside bold and italic spans in markdown headed for Jira. The strip transform makes nested marks safe to publish, but flat authoring renders cleaner in Jira and survives a future converter regression. Even one nested span rejects the whole document when the transform is missing.
  - Preferred: `**run** \`bun install\` **first**`
  - Tolerated (the transform handles it): `**run \`bun install\` first**`
  - The same applies to italics, strikethrough and any future mark the converter learns to combine with `code`.

---

## Gotcha 2: MCP rejects batched ADF custom fields

- **Symptom**: the error `Operation value must be an Atlassian Document (see the Atlassian Document Format)` from `[ISSUE_TRACKER_TOOL]` when one call updates several rich-text custom fields (for example `{{jira.acceptance_criteria}}` + `{{jira.scope}}` + `{{jira.business_rules_specification}}` together).
- **Cause**: the MCP variant of `[ISSUE_TRACKER_TOOL]` converts Markdown to ADF only for the top-level `description` field. Custom fields inside an `additional_fields` payload go through as-is, so the Jira API receives raw Markdown where it expects ADF JSON and rejects the whole update. There is no "first one works, the rest fail" case: the whole call is rejected, and partial state can result if the API committed any side effect before the rejection.
- **Workaround A, split the update**: one update call per ADF custom field. Slower but simple and resilient.
- **Workaround B, pre-convert each value**: run each Markdown value through `.agents/skills/acli/scripts/md-to-adf.ts` and pass the ADF JSON directly inside `additional_fields`. Faster, but it couples the workflow to converter internals. Check that the converter version matches the project's checked-in converter first, because a stale local copy produces ADF the live API rejects.
- **Default**: when touching 2 or more rich-text custom fields, use Workaround A, one field per call, and do not batch. The latency is negligible next to a failed publish that leaves the issue half-updated.

---

## Detection checklist

Quick triage when a publish fails:

- HTTP 400 with no node-level error pointer: suspect Gotcha 1. Grep the authoring markdown for `` ` `` inside `**…**` or `_…_` and fix it at the markdown layer.
- Error reads `Operation value must be an Atlassian Document`: Gotcha 2. Move the update path to one field per call, or pre-convert each value.
- Any other 400: not covered here. Surface the raw error to the user. A retry without a fix fails identically, so do not retry silently, and do not swallow the 400. When nobody is present, report it to the launcher or in the run report, with the specific fix named.

---

## Cross-references

Cited from `sprint-testing/references/reporting-templates.md` (ATR and bug evidence rich-text writes), `sprint-testing/references/acceptance-test-planning.md` (ATP body publish to Story), `test-documentation/references/jira-setup.md` (custom-field configuration and initial body writes), `test-documentation/references/jira-test-management.md` (Modality jira-native Test issue body writes), `test-documentation/references/tms-architecture.md` (Test, TestPlan and TestExecution body writes), and `shift-left-testing/references/atp-outline-template.md` (pre-sprint ATP body publish during refinement). A workflow that publishes rich-text content to Jira links here for the two gotchas before its first write.

For acli CLI usage gotchas (pagination, transitions, custom-field payload shape, OAuth, rate limits, REST fallback) see `acli/references/gotchas.md`, which covers CLI tool behavior, where this file covers ADF rich-text publishing.
