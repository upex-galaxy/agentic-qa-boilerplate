# Traceability Fix

Repair broken TMS traceability between User Story, ATS, ATP, ATR, and Test Cases by rebuilding the canonical coverage cascade.

**Input:** $ARGUMENTS
(Ticket ID to fix, e.g. `UPEX-123`.)

---

## When to Use

- Story shows UNCOVERED in the coverage panel despite having TCs
- Story has no ATS, or the ATS is missing its `is tested by` link / its TC membership
- TCs reachable only through ATP membership or through direct links that should ride the ATS
- ATP/ATR not linked to the User Story
- TC names do not follow the `{US_ID}: TC#: should ...` convention
- Traceability audit shows broken or missing links

## Traceability Model — the Cascade

Coverage resolves through an ordered cascade. Each TC must be reachable from its Story by AT LEAST one rung; the mode verifies rungs in order and repairs toward rung ①, never by mass direct links.

```
① TC ∈ ATS  ->  ATS --is tested by--> Story     (primary: fills the coverage panel)
② TC ∈ ATP  ->  ATP --link--> Story             (placement-only: does NOT fill the panel)
③ TC --link--> Story (direct)                   (last-resort, VALID)
④ no path                                       (ORPHAN -> repair by building the ATS path)
```

Two layers, never confused:

- **Jira layer (issue links)**: container→coverable via the `Test` link type (inward `is tested by`; resolve the slug from `.agents/jira-required.yaml`, never hardcode the literal). `ATS→Story` is MANDATORY — it is what fills the coverage panel. `ATP→Story` / `ATR→Story` are administrative traceability only (verified: they contribute ZERO coverage). Direct `TC→Story` is a valid last-resort, not a defect — the defect is having NO path.
- **Membership layer** (modality-dependent):
  - **Both modalities**: `TC ∈ ATS` IS a `TC→ATS` issue link (`test` slug) — one traceability rule, so IQL and the TMS never disagree (`../../agentic-qa-core/references/traceability-linking.md` §9). Instance without a Test Set work type → no ATS; direct `TC→Story` links are the fallback (the cascade still resolves at rung ③).
  - **jira-xray, in addition**: `TC ∈ ATS/ATP/ATR` is also Xray-internal (GraphQL via `/xray-cli`: `addTestsToTestSet` / `getTestSet` etc.); `TC ∈ ATP/ATR` has no membership link.

Rung ② finding: TCs reachable via ATP alone are placed but NOT covered — flag that the coverage panel still needs the ATS path.

## Naming Conventions

| Artifact | Format |
|----------|--------|
| ATS | `ATS: {US_ID}: {story title}` |
| ATP | `ATP: {TICKET-ID}: {story title}` |
| ATR | `ATR: {TICKET-ID}: Story Testing` |
| TC | `{US_ID}: TC#: should ...` |

Title grammar canon: `sprint-testing/references/acceptance-test-planning.md`.

---

## Workflow

> **Prerequisite**: Load `/acli` skill (for `[ISSUE_TRACKER_TOOL]` commands). If the project is in TMS Modality jira-xray, additionally load `/xray-cli` (for `[TMS_TOOL]` commands — membership reads/writes go through GraphQL). In Modality jira-native, `/acli` alone covers both (membership = issue links).

### Step 1: Fetch Ticket and Current Artifacts

```
[ISSUE_TRACKER_TOOL] Get Issue:
  - issueId: {from $ARGUMENTS}
```

Extract the ticket's full title and current issue links (ATS, ATP, ATR, direct TCs).

```
[TMS_TOOL] List Tests:
  - issue: {from $ARGUMENTS}
```

List all TCs, the ATS, ATPs, and ATRs associated with this ticket. Both modalities: read the `TC→ATS` issue links. Modality jira-xray: ALSO read ATS/ATP membership via GraphQL (`getTestSet` / plan tests) and compare the ATS membership against the links.

### Step 2: Audit the Cascade

Walk the cascade in order and classify every TC by its highest rung:

| # | Check | Expected |
|---|-------|----------|
| ① | ATS exists, named `ATS: {US_ID}: {story title}`, linked to Story via `is tested by` | Yes (primary) |
| ① | Every TC is a member of the ATS | Yes |
| ② | TCs reachable ONLY via ATP membership | Flag: placed but not covered — panel needs the ATS |
| ③ | TCs with only a direct `TC→Story` link | Valid last-resort; note as ATS-membership candidates |
| ④ | TCs with no path at all | ORPHAN — repair required |
| — | ATP exists and is linked to Story (administrative) | Yes |
| — | ATR exists and is linked to ATP (administrative) | Yes |
| — | Names match conventions (table above) | Yes |

Report all issues found before making any changes.

### Step 3: Present Fix Plan

List each issue and the proposed fix. Wait for user confirmation before proceeding.

Repairs build the ATS path — create the missing ATS / link / membership. NEVER repair by mass-creating direct `TC→Story` links (that is the last-resort rung, not the target state).

Common fixes:

| Issue | Fix |
|-------|-----|
| No ATS for the Story | Create `ATS: {US_ID}: {story title}` (parent: "QA Test Artifacts" epic; components inherited from the Story), link to Story via `is tested by`, add all TCs as members |
| ATS exists but not linked to Story | Add the `is tested by` link ATS→Story |
| TC not a member of the ATS | Add membership: the `TC→ATS` issue link (both modalities) + GraphQL `addTestsToTestSet` (jira-xray) |
| ATS links and Xray membership disagree (jira-xray) | Add the missing side: a member with no `TC→ATS` link gets the link; a linked TC missing from the Xray membership gets `addTestsToTestSet` |
| TC covered only via ATP (rung ②) | Add the TC to the ATS — ATP placement alone leaves the panel uncovered |
| TC orphan (rung ④) | Add the TC to the ATS (create the ATS first if missing) |
| ATP not linked to Story | Add Story link to ATP (administrative) |
| ATP not linked to ATR | Add ATR link to ATP (administrative) |
| Name does not follow convention | Rename the artifact |

### Step 4: Apply Fixes

Execute each fix using the TMS tool:

```
[TMS_TOOL] Update Test / Add To Test Set:
  - testId: {tc-id}
  - target: { ATS membership, links, name as needed }
```

Modality jira-xray: membership mutations via `/xray-cli` GraphQL; issue links via `[ISSUE_TRACKER_TOOL]`. Modality jira-native: everything via `[ISSUE_TRACKER_TOOL]` issue links.

### Step 5: Verify

Re-run the audit from Step 2 to confirm every TC now resolves at rung ① (or has an explicitly accepted rung-③ direct link) and the Story's coverage panel is filled.

### Step 6: Report

Output a summary:

```markdown
## Traceability Fixed: {TICKET-ID}

### Issues Found
- {issue 1}
- {issue 2}

### Fixes Applied
- {fix 1}
- {fix 2}

### Current State
| Artifact | ID | Name | Cascade rung / Links OK |
|----------|----|------|-------------------------|
| ATS | {id} | ATS: {US_ID}: {story title} | ① is tested by -> Story |
| ATP | {id} | ATP: {TICKET-ID}: {story title} | administrative link OK |
| ATR | {id} | ATR: {TICKET-ID}: Story Testing | administrative link OK |
| TC | {id} | {US_ID}: TC1: should ... | ① member of ATS |
```

## Rules

- Always audit before fixing -- never assume what is broken
- Present the fix plan and wait for confirmation before modifying any TMS artifact
- Repair toward the ATS path (rung ①); never mass-create direct TC→Story links
- Resolve the `is tested by` link-type slug from `.agents/jira-required.yaml`, never hardcode it
- Verify all links + membership after applying fixes
- Tool references (`[TMS_TOOL]`, `[ISSUE_TRACKER_TOOL]`) resolve via the Tool Resolution table in `AGENTS.md`
