# Traceability fix

Repairs broken TMS traceability between User Story, ATS, ATP, ATR and Test Cases by rebuilding the canonical coverage cascade.

**Input:** $ARGUMENTS
(Ticket ID to fix, e.g. `UPEX-123`.)

---

## When to use

- Story shows UNCOVERED in the coverage panel despite having TCs
- Story has no ATS, or the ATS is missing its `is tested by` link / its TC membership
- TCs reachable only through ATP membership or through direct links that should ride the ATS
- ATP/ATR not linked to the User Story
- TC names do not follow the `{US_ID}: TC#: should ...` convention
- Traceability audit shows broken or missing links

## Traceability model: the cascade

Coverage resolves through an ordered cascade. Each TC must be reachable from its Story by at least one rung. The mode checks the rungs in order and repairs toward rung ①, not with mass direct links.

```
① TC ∈ ATS  ->  ATS --is tested by--> Story     (primary: fills the coverage panel)
② TC ∈ ATP  ->  ATP --link--> Story             (placement-only: does NOT fill the panel)
③ TC --link--> Story (direct)                   (last-resort, VALID)
④ no path                                       (ORPHAN -> repair by building the ATS path)
```

Two layers, kept apart:

- Jira layer (issue links). Container to coverable goes through the `Test` link type (inward `is tested by`; resolve the slug from `.agents/jira-required.yaml`, never hardcode the literal). `ATS→Story` is mandatory because it fills the coverage panel. A coverage Tech Story (`../../agentic-qa-core/references/discovery-driven-doctrine.md` §3) is a coverable: its ATS is checked like a Story's, and a Test reaching it is not an orphan. `ATP→Story` and `ATR→Story` are administrative traceability only (verified: they contribute zero coverage). A direct `TC→Story` link is a valid last resort and not a defect. The defect is having no path.
- Membership layer (depends on the modality):
  - Both modalities: `TC ∈ ATS` is a `TC→ATS` issue link (`test` slug), one traceability rule so IQL and the TMS agree (`../../agentic-qa-core/references/traceability-linking.md` §9). An instance without a Test Set work type has no ATS, and direct `TC→Story` links are the fallback (the cascade still resolves at rung ③).
  - jira-xray, in addition: `TC ∈ ATS/ATP/ATR` is also Xray-internal (GraphQL via `/xray-cli`: `addTestsToTestSet` / `getTestSet` etc.). `TC ∈ ATP/ATR` has no membership link.

Rung ② finding: TCs reachable through ATP alone are placed but not covered. Flag that the coverage panel still needs the ATS path.

## Naming conventions

| Artifact | Format |
|----------|--------|
| ATS | `ATS: {US_ID}: {story title}` |
| ATP | `ATP: {TICKET-ID}: {story title}` |
| ATR | `ATR: {TICKET-ID}: Story Testing` |
| TC | `{US_ID}: TC#: should ...` |

Title grammar canon: `sprint-testing/references/acceptance-test-planning.md`.

---

## Workflow

> Prerequisite: load `/acli` (for `[ISSUE_TRACKER_TOOL]` commands). In Modality jira-xray, also load `/xray-cli` (for `[TMS_TOOL]` commands; membership reads and writes go through GraphQL). In Modality jira-native, `/acli` alone covers both, because membership is issue links.

### Step 1: Fetch the ticket and current artifacts

```
[ISSUE_TRACKER_TOOL] Get Issue:
  - issueId: {from $ARGUMENTS}
```

Extract the ticket's full title and current issue links (ATS, ATP, ATR, direct TCs).

```
[TMS_TOOL] List Tests:
  - issue: {from $ARGUMENTS}
```

List all TCs, the ATS, ATPs and ATRs associated with this ticket. In both modalities, read the `TC→ATS` issue links. In Modality jira-xray, also read ATS/ATP membership via GraphQL (`getTestSet` / plan tests) and compare the ATS membership with the links.

### Step 2: Audit the cascade

Walk the cascade in order and classify every TC by its highest rung:

| # | Check | Expected |
|---|-------|----------|
| ① | ATS exists, named `ATS: {US_ID}: {story title}`, linked to Story via `is tested by` | Yes (primary) |
| ① | Every TC is a member of the ATS | Yes |
| ② | TCs reachable only via ATP membership | Flag: placed but not covered, the panel needs the ATS |
| ③ | TCs with only a direct `TC→Story` link | Valid last-resort; note as ATS-membership candidates |
| ④ | TCs with no path at all | ORPHAN, repair required |
| — | ATP exists and is linked to Story (administrative) | Yes |
| — | ATR exists and is linked to ATP (administrative) | Yes |
| — | Names match conventions (table above) | Yes |

Report every issue found before changing anything.

### Step 3: Present the fix plan

List each issue and the proposed fix, then wait for the person's confirmation before changing any TMS artifact. Without a person (supervised worker, routine), follow `agentic-qa-core/references/decision-protocol.md`: the launcher holds the gate, or a delegating brief that covers the repair approves it. With neither, stop here and report the audit and the plan, because the fixes write to Jira.

Repairs build the ATS path: create the missing ATS, link or membership. Do not repair by mass-creating direct `TC→Story` links, which is the last-resort rung and not the target state.

Common fixes:

| Issue | Fix |
|-------|-----|
| No ATS for the Story | Create `ATS: {US_ID}: {story title}` (parent: "QA Test Artifacts" epic; components inherited from the Story), link it to the Story via `is tested by`, add all TCs as members |
| ATS exists but not linked to Story | Add the `is tested by` link ATS→Story |
| TC not a member of the ATS | Add membership: the `TC→ATS` issue link (both modalities) + GraphQL `addTestsToTestSet` (jira-xray) |
| ATS links and Xray membership disagree (jira-xray) | Add the missing side: a member with no `TC→ATS` link gets the link; a linked TC missing from the Xray membership gets `addTestsToTestSet` |
| TC covered only via ATP (rung ②) | Add the TC to the ATS, because ATP placement alone leaves the panel uncovered |
| TC orphan (rung ④) | Add the TC to the ATS (create the ATS first if missing) |
| ATP not linked to Story | Add Story link to ATP (administrative) |
| ATP not linked to ATR | Add ATR link to ATP (administrative) |
| Name does not follow convention | Rename the artifact |

### Step 4: Apply the fixes

Execute each fix with the TMS tool:

```
[TMS_TOOL] Update Test / Add To Test Set:
  - testId: {tc-id}
  - target: { ATS membership, links, name as needed }
```

In Modality jira-xray, membership mutations go through `/xray-cli` GraphQL and issue links through `[ISSUE_TRACKER_TOOL]`. In Modality jira-native, everything goes through `[ISSUE_TRACKER_TOOL]` issue links.

### Step 5: Verify

Re-run the audit from Step 2 and read the result back from Jira. Done when every TC resolves at rung ① (or has an explicitly accepted rung-③ direct link) and the Story's coverage panel is filled.

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

- Audit before fixing, because what looks broken is often not.
- Get the fix plan confirmed (Step 3) before modifying any TMS artifact.
- Repair toward the ATS path (rung ①) and never mass-create direct TC→Story links.
- Resolve the `is tested by` link-type slug from `.agents/jira-required.yaml`; do not hardcode it.
- Verify all links and membership after applying fixes.
- Tool references (`[TMS_TOOL]`, `[ISSUE_TRACKER_TOOL]`) resolve through the Tool Resolution table in `AGENTS.md`.
