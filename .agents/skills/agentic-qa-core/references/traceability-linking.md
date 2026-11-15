# Traceability Linking

> **Purpose**: Record QA traceability (Story to test artifact coverage, Story to Bug causation, Story to Bug blocking) as real Jira issue links, not only as local declarations in `story.md` or test-spec files. Local declarations document what the author intended. Jira links are the operational source of truth: audit trails, coverage reports and the `defect_reported → blocked` gate read them. Without this phase the traceability graph exists only in the methodology docs, and any consumer that walks `issuelinks` walks an empty graph.
> **Use when**: a QA workflow binds a Story to a test artifact, files a defect against a Story, or blocks a Story on an open defect. Concretely: sprint-testing Set-first (the ATS, then the ATP item born from the field), bug filing and blocking, test-documentation Test and Test Execution creation, regression-testing re-coverage. Re-run it whenever the coverage or defect graph changes mid-flight.
> **Companion references**:
>
> - `agentic-qa-core/references/acli-integration.md`: slug catalog, `{{jira.*}}` syntax, and tool routing for the link-creation write (`[ISSUE_TRACKER_TOOL]` → `/acli`).
> - `acli/references/workitem.md` §link: the per-link-type directionality table, the empirical acli `--out` / `--in` inversion gotcha, and the post-create verification recipe. Cited here, not duplicated.
> - `xray-cli` skill: owns Xray-internal membership (`TC ∈ ATS` / `TC ∈ ATP` / `TC ∈ ATR`) in Modality `jira-xray`. `TC ∈ ATS` is also a `TC→ATS` issue link in both modalities, so IQL and the TMS read the same graph. See §9.

---

## 1. Purpose + when to use

Traceability linking turns QA intent into a queryable graph in Jira. These touchpoints invoke it:

| Touchpoint              | Moment                                                          | Link created                                  |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `test-documentation`    | ATP (Test Plan) + ATR (Test Execution) created for a Story (Modality `jira-xray`) | Story `is tested by` ATP and ATR (`test`)     |
| `test-documentation`    | Test Case created for a Story under an ATP / ATR (Modality `jira-xray`) | ATP `designs` TC (`test_design`); ATR `executes` TC (`test_execute`). These are placement edges; coverage flows through the ATS→Story link (direct TC→Story stays a valid last resort, §3). |
| `test-documentation`    | Test / Test Execution issue created for a Story (Modality `jira-native`) | Story `is tested by` Test / Test Exec (`test`)|
| `sprint-testing`        | ATS (per-Story Acceptance Test Set, `ATS: {US_ID}: {story title}`) created/updated for the Story, Stage 1, Set-first | Story `is tested by` ATS (`test`), **the coverage-bearing edge** (§3) |
| `sprint-testing`        | ATP item find-or-created FROM the `{{jira.acceptance_test_plan}}` field, Stage 1, Set-first step 2 | Story `is tested by` ATP (`test`, administrative) |
| `sprint-testing`        | Defect found during in-sprint QA of a Story                     | Story `causes` Bug (`problem_incident`)       |
| `test-documentation`    | Test documented for a discovery-driven gap (no Story)           | coverage Tech Story `is tested by` its ATS (`test`), the same coverage-bearing edge a Story takes (`discovery-driven-doctrine.md` §3) |
| `sprint-testing`        | QA blocks a Story on an open defect (the `defect_reported → blocked` gate) | Story `is blocked by` Bug (`blocks`)          |
| `regression-testing`    | Existing Test re-bound to a Story for a regression cycle        | ATP `designs` Test (`test_design`); ATR `executes` Test (`test_execute`) |

`shift-left-testing` creates no link: the pre-sprint ATP lives in the `{{jira.acceptance_test_plan}}` field, never as a Test Plan item (`artifact-lifecycle.md` §1).

Skip the phase only when there is no relationship to record (an exploratory session with no Story under test and no defect filed), and still record `no_links: true` in the workflow output so the consumer knows the phase ran.

---

## 2. Slug-only resolution rule

Workspace link-type names differ per workspace, so never hardcode the English literal (`"Test"`, `"Blocks"`, `"Problem/Incident"`, `"Relates"`). Address a link type by its stable slug and resolve it at runtime:

- `{{jira.link_types.<slug>}}.name` is the workspace link-type name (the `--type` argument value).
- `{{jira.link_types.<slug>}}.outward` is the outward phrase (read from the source issue).
- `{{jira.link_types.<slug>}}.inward` is the inward phrase (read from the target issue).

Resolution source is `.agents/jira-link-types.json` (workspace state), keyed by slug. Slug syntax follows `.agents/instructions/agent-project-variables.md` and `agentic-qa-core/references/acli-integration.md` §Slug-catalog.

**Hard-fail rule**: if a slug fails to resolve, or `exists_in_workspace` is `false` for it, stop. Do not fall back to a literal name and do not guess the ID. Report the missing entry to the user and re-run:

```bash
bun run jira:sync-link-types
```

Then retry. This mirrors the catalog-or-die rule in `acli-integration.md` §Slug-catalog ("If a slug fails to resolve at runtime, STOP — do not fall back to a literal").

---

## 3. QA link catalog

Resolve every slug via `{{jira.link_types.<slug>}}`; an absent slug stops the phase (§2). The literal columns are illustrative only.

| Slug               | Semantic (illustrative)            | Source → Target                                              | Outward (illustrative) | Inward (illustrative) | Required / Optional | When to create                                                                 |
| ------------------ | ---------------------------------- | ----------------------------------------------------------- | ---------------------- | --------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `test`             | Coverage + administrative traceability: Story is tested by ATS / ATP / ATR | ATS (Test Set) / ATP (Test Plan) / ATR (Test Execution) / TC (last resort) → Story | `tests`                | `is tested by`        | **REQUIRED**        | The canonical container-to-coverable link. **ATS→Story is the coverage-bearing edge** (live-verified: it fills the Story's coverage panel) and is mandatory per Story. **ATP→Story and ATR→Story are administrative traceability only**: live-verified to contribute zero coverage (a Story linked only to its Plan and Execution reads UNCOVERED). **TC→Story direct is a valid last resort** (also coverage-bearing) when no ATS exists; it is the final rung of the resolution cascade below, not a defect. **TC→ATS** (the ATS `is tested by` each member TC) is the membership edge, created in both modalities (§9). |
| `problem_incident` | Causation: Story causes a defect   | Story → Bug / Defect                                        | `causes`               | `is caused by`        | **REQUIRED**        | When a defect is filed against a Story under test (sprint-testing bug filing). Records that the Story's behaviour caused the defect. |
| `blocks`           | Blocking: Story is blocked by an open defect | Bug / Defect / Story / TechStory / TechDebt → Story | `blocks`               | `is blocked by`       | **REQUIRED**        | When QA blocks a Story on an open defect (the `defect_reported → blocked` gate). The defect (or blocking issue) `blocks` the Story; the Story `is blocked by` it. |
| `relates`          | Symmetric reference (fallback)     | Any ↔ Any (symmetric)                                       | `relates to`           | `relates to`          | Fallback            | Degradation target only when a required type is absent from the workspace. **Direction is lost**, so warn on degradation (§6). |
| `test_design`      | Placement: ATP designs a Test Case | ATP (Test Plan) → TC (Test)                                 | `designs`              | `is designed by`      | **REQUIRED** (jira-xray) / N-A (jira-native) | The prescribed ATP↔TC edge under Modality `jira-xray`, created for each TC the ATP plans. Inside the ATP you read `designs TC-x`; inside the TC you read `is designed by ATP`. Placement only: coverage does not flow through this edge (see the two-layer model below), and it does not replace a last-resort direct TC→Story link. |
| `test_execute`     | Placement: ATR executes a Test Case | ATR (Test Execution) → TC (Test)                           | `executes`             | `is executed by`      | **REQUIRED** (jira-xray) / N-A (jira-native) | The prescribed ATR↔TC edge under Modality `jira-xray`, created for each TC the ATR runs. Inside the ATR you read `executes TC-x`; inside the TC you read `is executed by ATR`. Placement only: coverage does not flow through this edge (see the two-layer model below). |
| `test_automation`  | Xray refinement: automation covers a manual test | Automation → manual Test                          | `automation test for`  | `is automated by`     | Optional            | Catalog entry only; no skill creates it. `@atc('<TC_KEY>')` makes the TC itself the automated test and run results land on it (`test-automation` step 6), so there is no separate automation issue to bind. |

> **Two-layer model (binding).** The ATS/ATP/ATR↔TC↔Story graph lives in two distinct layers, and they are not interchangeable:
>
> 1. **Jira layer, issue links** (`test` slug, inward `is tested by`): **ATS→Story** (mandatory, the coverage-bearing edge, live-verified as the link that fills the Story's coverage panel); **ATP→Story** and **ATR→Story** (administrative traceability, live-verified to contribute zero coverage); **TC→ATS** (the membership edge, mandatory per member TC in both modalities, §9); **TC→Story** direct (valid last resort only).
> 2. **Xray layer, membership** (`TC ∈ ATS`, `TC ∈ ATP`, `TC ∈ ATR`): Xray-internal associations, GraphQL only, present only in Modality `jira-xray` (`addTestsToTestSet` / `getTestSet` / `getTestsEnrichment` and similar). `TC ∈ ATS` is written here in addition to its `TC→ATS` link; `TC ∈ ATP` and `TC ∈ ATR` have no membership link (their Jira-layer edges are `test_design` and `test_execute`).
>
> **One traceability rule, both modalities (binding).** `TC ∈ ATS` is always a `TC→ATS` issue link (slug-resolved per §2, never a literal), in `jira-xray` and `jira-native` alike, so the graph IQL describes and the graph the TMS holds are the same graph. Modality `jira-xray` adds the Xray-internal membership on top, never instead. An instance without the Test Set work type has no ATS: fall back to direct `TC→Story` links, which is the third rung of the cascade below.
>
> **Resolution cascade (doctrine: how a TC resolves to its Story).** `TC → ATS → Story` (primary, coverage), then `TC → ATP → Story` (secondary, placement-only, does not fill the coverage panel), then `TC → Story` direct (last resort), and if nothing matches the TC is an **ORPHAN**. The container-to-TC hop is walked via the `TC→ATS` links in both modalities; in Modality `jira-xray` the Xray membership is read as well, and the ATP hop is Xray membership only.
>
> **The ATS (Acceptance Test Set), the third canonical per-Story artifact.** Title `ATS: {US_ID}: {story title}`. Mandatory per Story, even when it holds a single TC. Set-first: the ATP and ATR derive their test lists from the ATS membership. It parents to the **QA Test Artifacts** epic and inherits the Story's components (mandatory; the components exemption applies only to feature-level `TS:` sets, never to the ATS). Feature-level `TS: {EPIC|module}: Validate {feature}` sets stay optional (smoke / regression / feature grouping), with optional components.
>
> **Items-first (default by excellence).** In both modalities the ATP and ATR are real Jira items: a **Test Plan** item (`ATP: {STORY-KEY}: {title}`) and a **Test Execution** item (`ATR: {STORY-KEY}: Story Testing`), so the `test` / `test_design` / `test_execute` edges above apply uniformly. The fallback, with ATP/ATR carried as Story custom fields and no separate issues, applies only when the Test Plan / Test Execution work types are unavailable in the instance and the items cannot be created. There `test_design` and `test_execute` are N-A and the Story links directly to each Test through the generic `test` edge (the cascade's last rung). `test_automation` stays a catalog entry that no skill creates, in both cases.
>
> **QA-process Epic parenting (axis 1) and roll-up.** Independently of the coverage links, every Plan and Run parents to a QA-process Epic. Every **Test Plan** item (ATP, FTP, STP, RTP) parents to the **QA Master Test Plan** epic. Every **Test Execution** item (ATR, STR, RTR), **Test Set** (ATS and feature-level `TS:`) and **Precondition** parents to the **QA Test Artifacts** epic. Optional **roll-up** edges aggregate coverage up the ladder: ATP `is part of` FTP, and FTP `is part of` STP (`relates` family / `is part of`). The parent Epic stays the QA-process Epic whatever the roll-up.
>
> **The results side has no roll-up edge (binding).** The roll-up above is a Plans-only mechanism. There is no `ATR is part of STR` link type, and none is to be invented: the **STR is a sibling recap of the sprint, not an aggregate of the ATRs**. Nothing in Jira or Xray sums per-Story outcomes into it, so an STR's numbers are whatever its own Test Runs hold, and they never roll up from the Stories. A reader who wants per-Story outcomes reads the ATRs directly (they hang off their own Stories via the administrative `ATR→Story` edge). The STR answers "how did the sprint's regression go", a different question. The same holds for the retired FTR rung: feature results are read from the per-Story ATRs, not aggregated anywhere. The rule extends upward unchanged: there is no `STR is part of RTR` and no `RTR is part of anything`. The **RTR** (Regression Test Results, one Test Execution per regression verdict) answers "is this build releasable"; the STR answers "how did the sprint go". Each Execution's numbers are its own Test Runs, at every altitude.
>
> **`testPlan` is an Xray field, not a link type, and there is no `STP → RTP` edge.** The Execution-to-Plan binding (STR → STP, STR → RTP at sprint close, RTR → RTP) rides the Xray `testPlan` field on the Execution. It is not a Jira issue link, it is absent from `.agents/jira-link-types.json` by design, and it never needs a slug: do not look for one and do not degrade it to `relates`. On the plans side the roll-up stops at the STP. The RTP is a curated per-TC subset (Candidate and Manual verdicts are promoted into it, Deferred never), so a sprint plan is not "part of" it. Regression membership is expressed per Test, through Test Plan membership plus the `regression-candidate` label, never by chaining sprint plans into the RTP. The `test_execute` edge from an RTR to its Tests follows the same rule as the ATR's (§9).

---

## 4. Directionality + the acli `--out` / `--in` inversion + mandatory verification

Jira link types are asymmetric: each edge has an outward phrase (read from the source) and an inward phrase (read from the target). The API stores one edge and renders it both ways, with the matching phrase on each side.

**Do not trust the tool layer's flag naming.** `acli`'s `--out` / `--in` flags are empirically inverted relative to Jira's outward/inward semantics: `--out` takes the inward partner and `--in` takes the outward partner. The full per-link-type mapping (the `Test` / `Test Design` / `Test Execute` / `Test Automation` / `Causes` / `Blocks` / `Relates` rows) and the reverse-mapping rule of thumb live in **`acli/references/workitem.md` §link → "Directionality: the empirical flag inversion"**. Read that section before any `link create` call; do not re-derive it here.

**Every link-create is followed by a direction check**, and the read differs by edge. For `problem_incident` and `blocks`, the recipe (`[ISSUE_TRACKER_TOOL]` list-links for the issue, then inspect `outwardIssueKey`) lives in `acli/references/workitem.md` §link → "Mandatory post-create verification". For `test`, that acli recipe does not reach the field this check needs: `acli`'s list-links returns only the flattened `outwardIssueKey`, never the nested `issuelinks[].inwardIssue` shape below. Use `[TMS_TOOL] trace: {STORY_KEY}` instead (Modality `jira-xray`; `/xray-cli` owns the syntax), which reads that raw field from Xray's own coverage query. The check per QA edge:

- **`test`**: for "Story is tested by ATS/ATP/ATR (or last-resort TC)", run `[TMS_TOOL] trace: {STORY_KEY}` (`/xray-cli`) and confirm **the artifact appears under `inwardIssue` in the Story's `issuelinks` entry**. State and check it as that raw field, never as the outward/inward phrase: the phrases can be read in either direction, and on one measured project three agents read the same sentence oppositely, one of them rewiring live coverage links on the strength of it. The field name cannot be read two ways. This was live-verified against Xray's own coverage query, not against Jira link semantics: one Story carrying both shapes over two disjoint sets of ten Tests returned the ten under `inwardIssue` and none of the ten under `outwardIssue`; project-wide, 21 Stories wired the other way read UNCOVERED against as many as 69 attached Tests. An inverted edge exists, reads as a link, and contributes zero coverage. On a mismatch, delete first and then recreate (see the dedupe note below), and re-verify.
- **`problem_incident`**: for "Story causes Bug", list the Story's links and confirm the Story's outward partner is the Bug under `causes`.
- **`blocks`**: for "Story is blocked by Bug", list the Story's links. The Story is the inward party (`is blocked by`) and the Bug is the outward party (`blocks`). Confirm the Bug's outward partner is the Story, or equivalently the Story's inward partner is the Bug.
- **`relates`** and other symmetric types: direction cannot be verified. Note that in the matrix (§7), and do not use `relates` where direction carries meaning.

A mismatch on any asymmetric edge is flagged. Delete the link via `[ISSUE_TRACKER_TOOL]` (link delete by id), recreate it with arguments adjusted per the gotcha catalog, and re-verify before moving on.

**Delete before recreating: adding the corrected link is a silent no-op.** Jira dedupes a link between the same pair and the same type regardless of direction, so the second create returns success, writes nothing and leaves the wrong edge in place (measured while repairing coverage links on a live instance). The repair is always four steps, in this order: read the link id, delete that id, create the edge the right way round, verify. Never a two-step "just add the right one".

**A per-edge check cannot see the failure that matters.** An inverted coverage link is invisible on one Story: the link is present, the coverage panel is merely empty, and nothing reports it. It shows up only in aggregate, which is why the sweep in §10 exists and why it runs at least once per engagement, not only per Story under test.

---

## 5. One acli call per edge, never batched

Create exactly one link per `[ISSUE_TRACKER_TOOL]` call. Do not collapse several edges into one multi-link or CSV/JSON batch operation. The single-edge, dual-phrasing model combined with the acli flag inversion makes batched creation error-prone and unverifiable per edge, and a batch defeats the round-trip check in §4. The safe pattern is: create one edge, verify its direction, move to the next.

---

## 6. Fallback degradation

When the workspace lacks a required link type (`test`, `problem_incident` or `blocks` reports `exists_in_workspace: false`, or the slug is absent), degrade to `relates`:

1. Create the link using the `relates` slug.
2. Tell the user about the degradation verbatim: name the affected issues, the intended semantic and the lost direction.
3. Record `link_degraded: <slug> → relates` in the workflow output and in the traceability matrix (§7), so any downstream consumer (coverage report, block gate) can skip these edges or treat them as informational behind a warning.
4. Recommend that the user create the canonical link type in the workspace and re-run `bun run jira:sync-link-types`, then re-run this phase.

`relates` is symmetric, so both sides read the same phrase and **direction is lost**. Never use `relates` silently for a `blocks` edge: a coverage or block consumer that reads only `blocks` drops the edge, and the `defect_reported → blocked` gate fails to detect the block. Degradation is always loud.

---

## 7. Traceability matrix output (audit trail)

After all links exist and each direction is verified, show the traceability matrix to the user. It is the audit trail: every edge traces back to its touchpoint and verified direction.

```markdown
## Traceability matrix — {{story_or_epic_key}}

| From         | To           | Link type                                       | Verified direction | Source touchpoint                                   |
| ------------ | ------------ | ----------------------------------------------- | ------------------ | --------------------------------------------------- |
| {{story}}    | {{test}}     | `{{jira.link_types.test.name}}`                 | yes                | test-documentation — Test created for Story         |
| {{story}}    | {{bug}}      | `{{jira.link_types.problem_incident.name}}`     | yes                | sprint-testing — defect filed against Story         |
| {{bug}}      | {{story}}    | `{{jira.link_types.blocks.name}}`               | yes                | sprint-testing — QA block on open defect            |
| ...          | ...          | ...                                             | ...                | ...                                                 |

### Degradations (if any)
- {{none | story_x → bug_y degraded from `blocks` to `relates` — direction lost; block gate cannot read this edge}}
```

The "Verified direction" column is `no` only for symmetric types (`relates`). Every asymmetric edge must read `yes` before hand-off, or it has not passed §4.

---

## 8. Touchpoint map: which skill creates which link, when

```
test-documentation  (Modality jira-xray)
  ├─ ATP (Test Plan) + ATR (Test Execution) created for Story
  │     → Story is tested by ATP              [test]   (acli — [ISSUE_TRACKER_TOOL])
  │     → Story is tested by ATR              [test]   (acli — [ISSUE_TRACKER_TOOL])
  └─ Test Case created under the ATP/ATR
        → TC tests ATS                          [test]  (acli — the membership edge, §9)
        → Xray-internal attach (set / plan / exec add-tests)  (xray-cli — membership only, creates NO Jira link)
        → ATP designs TC                       [test_design]   (acli — [ISSUE_TRACKER_TOOL], create explicitly)
        → ATR executes TC                      [test_execute]  (acli — [ISSUE_TRACKER_TOOL], create explicitly)
        (Coverage does NOT flow through the ATP/ATR — it flows through the ATS→Story
         link (or last-resort TC→Story). The Xray attach creates NO Jira links; the
         design/execute edges are SEPARATE, explicit, and placement-only.)
        (No automation link: @atc('<TC_KEY>') makes the TC the automated test, test-automation step 6.)
        (A discovery-driven Test anchors to a coverage Tech Story instead of a Story:
         its ATS → Tech Story `test` edge is the coverage one, `discovery-driven-doctrine.md` §3.)

test-documentation  (Modality jira-native)
  └─ Test / Test Execution created for Story
        → Story is tested by Test/TestExec    [test]
        (No automation link: @atc('<TC_KEY>') makes the TC the automated test.)

sprint-testing
  ├─ Stage 1 — Set-first: ATS created/updated for the Story (mandatory, even for 1 TC)
  │     → Story is tested by ATS               [test]  ← the coverage-bearing edge
  ├─ Stage 1 — Set-first step 2: ATP item find-or-created FROM the field
  │     → Story is tested by ATP               [test]  (administrative)
  │     → TC tests ATS                         [test]  ← membership edge, BOTH modalities (§9)
  │       + jira-xray: TC ∈ ATS Xray membership (xray-cli GraphQL, in addition)
  ├─ defect found during QA of Story
  │     → Story causes Bug                     [problem_incident]
  └─ QA blocks Story on open defect (defect_reported → blocked gate)
        → Bug blocks Story                     [blocks]

regression-testing
  └─ existing Test re-bound for regression cycle
        → ATP designs Test                     [test_design]
        → ATR executes Test                    [test_execute]
```

Edges are created when their artifact is created: ATS→Story on ATS creation, ATP/ATR→Story on ATP/ATR creation, TC→ATS and the `test_design` / `test_execute` edges on TC creation, Story→Bug on bug filing, and the `blocks` edge on the QA block. The coverage and placement distinctions are in §3, and the membership writes are in §9.

---

## 9. Test Set membership: one rule, both modalities

**`TC ∈ ATS` is always a Jira issue link, in both modalities.** Each member TC carries a `TC→ATS` link with slug `test` (the ATS `is tested by` the TC; checked as the raw field: the TC appears under `inwardIssue` in the ATS's `issuelinks` entry, the same shape as the coverage edge). It is created through `[ISSUE_TRACKER_TOOL]`, one edge per call, and direction-verified (§4, §5). This is the membership every reader walks: the IQL doctrine, the PBI sync (`jira:sync-issues` cascade rung 1 and its orphan check read the Set's links in both modalities), and any consumer of `issuelinks`. One graph means IQL and the TMS never disagree about which Tests belong to a Story.

**Modality `jira-xray` also writes the Xray membership.** Xray keeps Test ↔ Test Set membership in its own data model (`addTestsToTestSet` / `getTestSet` / enrichment, through **`/xray-cli`**), and Xray's panels, the Set-first derivation of the ATP and ATR test lists, and the `trace` list parity read it there. In that modality a membership is therefore written twice: the Xray attach (`/xray-cli`) and the `TC→ATS` link (`/acli`). The two writes are independent: Xray membership is invisible to Jira's `issuelinks` (the CONFIRMED note below measures it for Plan and Execution attaches), and a Jira link registers nothing in Xray. Neither write can be skipped, and both copies must list the same TCs.

**What stays Xray-internal.** Test ↔ Test Plan / Test Execution membership (`TC ∈ ATP`, `TC ∈ ATR`), membership of a feature-level `TS:` Set (grouping, not traceability) and Test ↔ Precondition associations have no membership link: `/xray-cli` only. Their Jira-layer counterparts are the `test_design` / `test_execute` placement edges below, never a membership link.

**Do not create membership with the `"is part of test set"` link-type literal.** It is not a real Jira link type in this workspace catalog, it bypasses the slug resolver (§2), and the Xray membership it appears to imply does not register. The membership link is the `test` slug; the Xray membership is `/xray-cli`.

**No Test Set work type.** An instance without it has no ATS at all: membership degrades to direct `TC→Story` links (the cascade's last rung, §3), in either modality.

### Jira-layer links vs Xray-internal membership for the `designs` / `executes` edges: CONFIRMED

The target model (§3, §8) prescribes two distinct layers for an ATP/ATR↔TC relationship:

- **Jira layer**: the `test_design` (`designs` / `is designed by`) and `test_execute` (`executes` / `is executed by`) **issue links**, readable on the ATP / ATR / TC issue panels and walkable via `issuelinks`.
- **Xray layer**: the Test's membership of the Test Plan / Test Execution, stored in Xray's own data model (not in `issuelinks`) and managed through `/xray-cli` (`plan add-tests` / `exec add-tests`).

**CONFIRMED (empirically verified against a live Xray Cloud + Jira instance):** attaching a Test to a Test Plan (`plan add-tests`) or Test Execution (`exec add-tests`) via Xray creates **zero Jira-layer issue links**. The membership is purely Xray-internal, visible only in Xray's own panels and never in Jira's "Linked issues", `issuelinks` or REST. The Jira-layer `test_design` and `test_execute` links are therefore not a by-product of the Xray attach: create them explicitly via `[ISSUE_TRACKER_TOOL]` (`/acli`) using the `test_design` / `test_execute` slug, then direction-verify per §4. The two operations are independent. The Xray-internal attach (`/xray-cli`) handles membership, the Jira edges go through acli, and `/xray-cli` does not and cannot create them.

---

## 10. Traceability verification: the three-edge check

Consumers that wrote `[TMS_TOOL] trace {TICKET}` were in practice checking one edge and logging "traceability verified" for all three. In Modality `jira-xray` the one-call form is **`[TMS_TOOL] trace: {STORY_KEY}`** (`/xray-cli` owns the syntax). It performs all four reads and exits non-zero unless every edge passes. Where it is unavailable, verification is explicit and consists of these calls:

```
[ISSUE_TRACKER_TOOL] Link List: {STORY_KEY}   # expect: ATS "tests" Story   (coverage edge — the only one Xray counts)
[ISSUE_TRACKER_TOOL] Link List: {ATP_KEY}     # expect: ATP "tests" Story   (administrative edge)
[ISSUE_TRACKER_TOOL] Link List: {ATR_KEY}     # expect: ATR "tests" Story   (administrative edge)
[TMS_TOOL] plan get: {ATP_KEY} · exec get: {ATR_KEY}   # expect: Plan + Execution test lists == ATS membership
[ISSUE_TRACKER_TOOL] Link List: {ATS_KEY}     # expect: one TC "tests" ATS link per member (§9), same TCs as the Xray membership
```

The three link reads are the `/acli` link-list read (§4's direction check: the artifact must appear under `inwardIssue` in the Story's entry). The list comparison is the `/xray-cli` plan/execution read against the ATS membership (the `/xray-cli` test-enrich read), because that membership is Xray-internal and invisible to the link reads (§9). The last read compares the `TC→ATS` links (§9) against that same membership. The one-call form does not cover it, so run it explicitly. Exact command syntax lives in those two skills, not here.

**The rule.** Traceability is verified only when all three edges are present and the lists match. A missing administrative edge is a **FAIL** of this check, not a warning. Do not log "traceability verified" from the coverage edge alone: the ATS→Story edge carries the coverage, but a Story whose ATP or ATR is unlinked has an incomplete audit trail, and the next consumer walking `issuelinks` from the Plan or the Run finds nothing.

**One-call form.** `[TMS_TOOL] trace: {STORY_KEY}` performs all four reads, reports per-edge PASS/FAIL with the exact remediation command for each failure, and exits 0 only when all four hold. Prefer it over the block above, which stays as the manual equivalent. A failing coverage edge also reports the offending **link id**, so the repair is addressable instead of a hunt: the remediation is never a bare "delete the inverted link".

**Project-wide sweep (run it once per engagement).** The same one-call form accepts several Story keys or a JQL query and closes with a repair worklist: `[TMS_TOOL] trace: {KEY} {KEY} …` or `[TMS_TOOL] trace --jql: {JQL}` (`/xray-cli` owns the syntax). A per-Story gate structurally cannot see an inconsistency that exists only in aggregate. On the one project where the sweep was run first, 21 of 43 linked Stories were wired the wrong way and one had lost a fully populated 69-Test Test Set. Whoever inherits a project whose links were created before this direction was measured should assume the mix is there until a sweep says otherwise. The sweep keeps going past a Story it cannot read, so one permission error does not hide the rest of the worklist.

**Modality `jira-native`.** There is no Xray layer and no one-call form. Verification is that the Story's `{{jira.acceptance_test_plan}}` field is populated (or its `## Acceptance Test Plan (ATP)` fallback comment exists, per the §6 degradation rules), plus the `TC→ATS` and `ATS→Story` issue links per §9 (the same links `jira-xray` carries). An instance with no Test Set work type verifies the last-resort direct `TC→Story` links instead.

---

## Hard rules

Each one is stated with its reason in the section it points to.

- Resolve link types through `{{jira.link_types.<slug>}}`, never a hardcoded name, and when a slug fails to resolve, stop and re-run `bun run jira:sync-link-types` instead of falling back to a literal (§2).
- Use `relates` for a direction-carrying edge (`blocks`, `problem_incident`, `test`) only with the degradation loudly recorded (§6).
- Create one link per call and verify each (§5, §4). Check direction after every create of an asymmetric edge, and consult the `acli/references/workitem.md` §link inversion gotcha first, because the `--out` / `--in` naming cannot be trusted (§4).
- State and verify the coverage direction as the raw field (the artifact under `inwardIssue` in the Story's entry), never as an outward/inward phrase (§4).
- Repair a wrong direction by deleting the offending link id first. Adding the corrected link is a silent no-op because Jira dedupes the pair and type regardless of direction (§4).
- Do not conclude a project's traceability is sound from per-Story checks alone: run the aggregate sweep at least once (§10).
- ATP→Story and ATR→Story are administrative only (live-verified zero coverage). Coverage is ATS→Story, or the last-resort TC→Story (§3).
- Create the per-Story ATS even for a single TC, because the ATP and ATR derive their test lists from its membership (Set-first, §3).
- Run the three-edge check before logging "traceability verified": one call in Modality `jira-xray`, the four explicit reads otherwise. A missing administrative edge is a FAIL (§10).
- Record `TC ∈ ATS` in both places: the `TC→ATS` link (`test`) in both modalities, plus the Xray membership via `/xray-cli` in Modality `jira-xray` (§9). Do not express `TC ∈ ATP` or `TC ∈ ATR` as a membership link, and do not use the `"is part of test set"` literal (§9).
