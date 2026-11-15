---
id: ticket-work
title: 'AI behavior during testing'
load_when: 'testing a story or bug, test design, filing a defect, artifact lifecycle, environment selection, session close of a workflow skill'
triggers: ['\btest(ing)? (this|the|a) (story|ticket|bug)', '\bQA\b', '\bstory\b', '\bbug\b', '\bdefect', '\bimprovement\b', '\bATP\b', '\bATR\b', '\btest cases?\b']
paths: []
---

# Ticket work

## 8. AI BEHAVIOR DURING TESTING

Applies whenever a workflow skill tests a story or bug, files a defect or creates a QA artifact. Other files cite the items by number.

1. Once you understand the ticket, say in simple terms what the feature is, how it works and what you will test.
2. After an important explanation, wait for the person's reply before continuing (no person present: see the last section).
3. On a bug or unexpected behavior, describe what you observed, why it is a problem and its impact (severity, affected users, business risk).
4. Test design doctrine (binding). Verifying the ACs is the floor of testing. Coverage is AC conformance plus risk beyond the AC: one AC gets several cases by default (1:N), and only a written `trivially atomic` justification collapses it to one. Derive cases by technique trigger: EP always; BVA on ranges and limits; State-Transition on status fields; Decision Table on 2+ interacting conditions; Pairwise on 3+ factors. Completeness is never reported as "% of ACs verified". Canon: `agentic-qa-core/references/test-design-doctrine.md`.
5. Defect management doctrine (binding). Classify every quality issue as Bug, Defect or Improvement by the lifecycle stage of the FEATURE, not by where you found it: a Bug is a feature already live above Staging, a Defect is still pre-release, an Improvement is not a broken AC but an enhancement or an under-specified or unspecified AC that a test beyond the AC surfaced. On every work item (story, tech_story, tech_debt, bug, defect, improvement) set `qa_assignee` to yourself (read before writing: an existing owner stays). Components (the affected product module) are mandatory. Parent each quality issue to the QA process epic for its type, never a product or dev epic: "QA Defect Management" for bug, defect and improvement; "QA Test Repository" for Test issues; "QA Master Test Plan" for Test Plans (FTP, STP, ATP, RTP); "QA Test Artifacts" for Test Executions (STR, ATR, RTR), Preconditions and Test Sets. Each Story gets a mandatory `ATS: {US_ID}` Acceptance Test Set (components inherited from the Story); a feature-level `TS:` set is optional. They are real, parentable Jira issues, but their Test associations and set membership live inside Xray: read them with `bun xray test enrich`. Link the source Story with an issue-link, fill the mandatory field matrix and derive Priority from Severity. Canon: `agentic-qa-core/references/defect-management-doctrine.md`. (binding: `/sprint-testing`)
6. Artifact lifecycle (binding). Every artifact the harness creates has a declared lifecycle and must leave the status that Jira's `create` transition dropped it in. An ATP frozen at `Planning`, an ATS at `Designing`, an ATR at `ACTIVE` or a TC at `Draft` after its owning stage closed is a defect, since it tells the team the work never happened. Set `assignee` to yourself on every QA artifact at create time: Xray refuses membership edits on a Test Plan the caller does not own, so an unassigned Plan is a blocker waiting to happen. Ask before touching an artifact someone else owns. When the slug is missing for this project, run the unmapped-status fallback: list the live transitions, propose the closest synonym in one `AskUserQuestion`, fire the live id once the person agrees, then recommend `bun run jira:sync-workflows`. Skipping silently, guessing an id and hand-editing `.agents/jira-workflows.json` hide the gap instead. Every stage closes with the light stage verifier (artifacts, links, statuses, assignee, parent and components, fields written, progress checkpoint, session footer), each line answered YES or a stated N/A. Canon: `agentic-qa-core/references/artifact-lifecycle.md`. (binding: `/agentic-qa-core`)
7. Language follows §1 #14 "Language detection + mirroring".
8. Session close, for every workflow skill and without being asked. Surface the repo-relative path of every screenshot or bug annotation the moment it exists. End with a session-close footer listing the skills, MCPs and CLIs used and the testing-pyramid levels touched, with an explicit "none" for each untouched level. Print it in chat only, never in a Jira comment or the ATR. Contract and templates: `agentic-qa-core/references/session-footer-contract.md`.

## Environment selection

The canonical environment identifiers are `local`, `qa`, `staging` and `production`: lowercase, no abbreviations (`prod`, `stg` and `uat` are out unless a project adds its own). The default is **staging** unless the person names another. URLs come from `.agents/project.yaml` and credentials from `.env`. Ask when the environment is ambiguous.

## Context efficiency

The main conversation stays lean: subagents do the heavy reading, and a skill loads only the references its current phase needs.

## With nobody at the keyboard

A supervised worker sends the gates of items 2 and 6 and an ambiguous environment to its conductor or launcher. A routine takes the answer from its delegating brief, which is the approval source for any decision it covers. Without one, a routine keeps to reversible work and reports instead of asking: the explanation goes in the report, an unmapped status stays unchanged with the missing slug and proposed synonym named (no Jira write), an artifact someone else owns stays untouched, and the environment is `staging`, stated in the report. Whether a question reaches a person at all follows `agentic-qa-core/references/decision-protocol.md`.
