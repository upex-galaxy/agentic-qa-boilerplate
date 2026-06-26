# Traceability Linking

> **Purpose**: Reflect QA traceability relationships — Story↔test-artifact coverage, Story→Bug causation, Story→Bug blocking — as real Jira issue links, not just local declarations inside `story.md` / test-spec files. Local declarations document author intent; Jira links are the operational source of truth that audit trails, coverage reports, and the `defect_reported → blocked` gate read. Without this phase, the traceability graph exists only in the methodology docs and any consumer that walks `issuelinks` walks an empty graph.
> **Use when**: Any time a QA workflow binds a Story to a test artifact, files a defect against a Story, or blocks a Story on an open defect. Concretely: shift-left Test Plan creation, sprint-testing bug filing + blocking, test-documentation Test / Test Execution creation, regression-testing re-coverage. Re-run whenever the coverage or defect graph changes mid-flight.
> **Companion references**:
>
> - `agentic-qa-core/references/acli-integration.md` — slug catalog, `{{jira.*}}` syntax, tool routing for the link-creation write operation (`[ISSUE_TRACKER_TOOL]` → `/acli`).
> - `acli/references/workitem.md` §link — the per-link-type directionality table, the empirical acli `--out` / `--in` INVERSION gotcha, and the mandatory post-create verification recipe. **Cited here, not duplicated.**
> - `xray-cli` skill — owns Xray-internal membership (Test ↔ Test Set / Test Plan) which is NOT a Jira issuelink. See §9.

---

## 1. Purpose + when to use

Traceability linking turns QA intent into a queryable graph in Jira. Five touchpoints invoke it:

| Touchpoint              | Moment                                                          | Link created                                  |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `shift-left-testing`    | Test Plan (ATP) authored ahead of dev for a Story / feature    | Story `is tested by` ATP (`test`)             |
| `test-documentation`    | ATP (Test Plan) + ATR (Test Execution) created for a Story (Modality `jira-xray`) | Story `is tested by` ATP and ATR (`test`)     |
| `test-documentation`    | Test Case created for a Story under an ATP / ATR (Modality `jira-xray`) | ATP `designs` TC (`test_design`); ATR `executes` TC (`test_execute`). Story is **NOT** linked to the TC directly — coverage aggregates to the Story through the ATP/ATR. |
| `test-documentation`    | Test / Test Execution issue created for a Story (Modality `jira-native`) | Story `is tested by` Test / Test Exec (`test`)|
| `sprint-testing`        | Defect found during in-sprint QA of a Story                     | Story `causes` Bug (`problem_incident`)       |
| `sprint-testing`        | QA blocks a Story on an open defect (the `defect_reported → blocked` gate) | Story `is blocked by` Bug (`blocks`)          |
| `regression-testing`    | Existing Test re-bound to a Story for a regression cycle        | ATP `designs` Test (`test_design`); ATR `executes` Test (`test_execute`) |

Skip the phase only when there is genuinely no relationship to record (e.g. an exploratory session with no Story under test and no defect filed) — but still record `no_links: true` in the workflow output so the consumer knows the phase ran.

---

## 2. Slug-only resolution rule

Workspace link-type names are workspace-specific. NEVER hardcode the English literal (`"Test"`, `"Blocks"`, `"Problem/Incident"`, `"Relates"`). Always address a link type by its stable slug and resolve at runtime:

- `{{jira.link_types.<slug>}}.name` → the workspace link-type name (the `--type` argument value).
- `{{jira.link_types.<slug>}}.outward` → the outward phrase (read from the source issue).
- `{{jira.link_types.<slug>}}.inward` → the inward phrase (read from the target issue).

Resolution source is `.agents/jira-link-types.json` (workspace state), keyed by slug. Slug syntax follows `CLAUDE.md` §7 / `agentic-qa-core/references/acli-integration.md` §Slug-catalog.

**Hard-fail rule**: if a slug fails to resolve, or `exists_in_workspace` is `false` for that slug, STOP. Do not fall back to a literal name and do not guess the ID. Report the missing entry to the user and re-run:

```bash
bun run jira:sync-link-types
```

Then retry. This mirrors the catalog-or-die rule in `acli-integration.md` §Slug-catalog ("If a slug fails to resolve at runtime, STOP — do not fall back to a literal").

---

## 3. QA link catalog

All slugs below are present in the seeded `.agents/jira-link-types.json`. Resolve names via `{{jira.link_types.<slug>}}` — the literal column is illustrative only.

| Slug               | Semantic (illustrative)            | Source → Target                                              | Outward (illustrative) | Inward (illustrative) | Required / Optional | When to create                                                                 |
| ------------------ | ---------------------------------- | ----------------------------------------------------------- | ---------------------- | --------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `test`             | Coverage — Story is tested by ATP / ATR | Story → ATP (Test Plan) / ATR (Test Execution)         | `tests`                | `is tested by`        | **REQUIRED**        | Canonical Story↔coverage-container link. Created when the ATP (Test Plan) and ATR (Test Execution) are created for a Story. **Targets the ATP and ATR ONLY — NOT individual Test Cases.** From the Story you read `is tested by ATP` and `is tested by ATR`; TCs aggregate to the Story through the ATP/ATR, not via a direct Story↔TC edge. |
| `problem_incident` | Causation — Story causes a defect  | Story → Bug / Defect                                        | `causes`               | `is caused by`        | **REQUIRED**        | When a defect is filed against a Story under test (sprint-testing bug filing). Records that the Story's behaviour caused the defect. |
| `blocks`           | Blocking — Story is blocked by an open defect | Bug / Defect / Story / TechStory / TechDebt → Story | `blocks`               | `is blocked by`       | **REQUIRED**        | When QA blocks a Story on an open defect — the `defect_reported → blocked` gate. The defect (or blocking issue) `blocks` the Story; the Story `is blocked by` it. |
| `relates`          | Symmetric reference (fallback)     | Any ↔ Any (symmetric)                                       | `relates to`           | `relates to`          | Fallback            | Degradation target ONLY when a required type is absent from the workspace. **Direction is lost** — warn on degradation (§6). |
| `test_design`      | Coverage — ATP designs a Test Case | ATP (Test Plan) → TC (Test)                                 | `designs`              | `is designed by`      | **REQUIRED** (jira-xray) / N-A (jira-native) | The prescribed ATP↔TC edge under Modality `jira-xray`. Created for each TC the ATP plans. Inside the ATP you read `designs TC-x`; inside the TC you read `is designed by ATP`. Replaces any direct Story↔TC link. |
| `test_execute`     | Coverage — ATR executes a Test Case | ATR (Test Execution) → TC (Test)                           | `executes`             | `is executed by`      | **REQUIRED** (jira-xray) / N-A (jira-native) | The prescribed ATR↔TC edge under Modality `jira-xray`. Created for each TC the ATR runs. Inside the ATR you read `executes TC-x`; inside the TC you read `is executed by ATR`. Replaces any direct Story↔TC link. |
| `test_automation`  | Xray refinement — automation covers a manual test | Automation → manual Test                          | `automation test for`  | `is automated by`     | Optional            | Xray-special refinement to bind an automated test to the manual Test it automates (test-automation Stage). |

> **Coverage topology under Modality `jira-xray`**: the Story is linked ONLY to its ATP and ATR via `test`. Each Test Case is linked to the ATP via `test_design` (`designs` / `is designed by`) and to the ATR via `test_execute` (`executes` / `is executed by`). The Story is deliberately NOT linked to each TC — linking every TC to the Story creates noise; TCs aggregate to the Story THROUGH the ATP and ATR. The `test_*` design/execute edges are therefore the PRESCRIBED ATP↔TC and ATR↔TC links here, not optional refinements.
>
> **Items-first (default by excellence):** in BOTH modalities the ATP and ATR are real Jira **items** — a **Test Plan** item (`ATP: {STORY-KEY}: {title}`) and a **Test Execution** item (`ATR: {STORY-KEY}: Story Testing`) — so the `test` / `test_design` / `test_execute` edges above apply uniformly. The **fallback** branch — ATP/ATR carried as Story custom fields with no separate issues — applies ONLY when the Test Plan / Test Execution work types are unavailable in the instance and the items therefore cannot be created; there `test_design` / `test_execute` are N-A and the Story is linked directly to each Test via the generic `test` edge instead. `test_automation` stays an optional refinement in both cases.
>
> **QA-process Epic parenting (axis 1) + roll-up.** Independently of the coverage links above, every Plan and Run also parents to a QA-process Epic: every **Test Plan** item (ATP · FTP · STP) parents to the **QA Master Test Plan** epic; every **Test Execution** item (ATR · FTR · STR), **Test Set**, and **Precondition** parents to the **QA Test Artifacts** epic. Optional **roll-up** edges aggregate coverage up the ladder: ATP `is part of` FTP, and FTP `is part of` STP (`relates` family / `is part of`) — the parent Epic stays the QA-process Epic regardless of roll-up.

---

## 4. Directionality + the acli `--out` / `--in` inversion + mandatory verification

Jira link types are asymmetric: each edge has an outward phrase (read from the source) and an inward phrase (read from the target). The API stores ONE edge; it renders bidirectionally with the matching phrase on each side.

**Do NOT trust the tool layer's flag naming.** `acli`'s `--out` / `--in` flags are EMPIRICALLY INVERTED relative to Jira's outward/inward semantics — `--out` takes the inward partner and `--in` takes the outward partner. The full per-link-type mapping (including the `Test` / `Test Design` / `Test Execute` / `Test Automation` / `Causes` / `Blocks` / `Relates` rows) and the reverse-mapping rule of thumb live in **`acli/references/workitem.md` §link → "Directionality — EMPIRICAL FLAG INVERSION"**. Read that section before any `link create` call. Do not re-derive it here.

**MANDATORY post-create verification** — every link-create MUST be followed by a direction check. The recipe (`[ISSUE_TRACKER_TOOL]` list-links for the issue → inspect `outwardIssueKey`) lives in `acli/references/workitem.md` §link → "Mandatory post-create verification". The methodology rule per QA edge:

- **`test`** — for "Story is tested by Test" → list the Story's links → confirm the outward partner relationship reads `tests` toward the Test artifact (Story is the outward party; Story `tests` → Test). Mismatch → delete + recreate with swapped flags, re-verify.
- **`problem_incident`** — for "Story causes Bug" → list the Story's links → confirm the Story's outward partner is the Bug under `causes`.
- **`blocks`** — for "Story is blocked by Bug" → list the Story's links → the Story is the INWARD party (`is blocked by`); the Bug is the outward party (`blocks`). Confirm the Bug's outward partner is the Story, or equivalently the Story's inward partner is the Bug.
- **`relates`** and other symmetric types — direction CANNOT be verified; note this in the matrix (§7) and never use `relates` where direction carries meaning.

Mismatch on any asymmetric edge → flag, delete the link via `[ISSUE_TRACKER_TOOL]` (link delete by id), recreate with arguments adjusted per the gotcha catalog, re-verify before moving on.

---

## 5. One acli call per edge — never batch

Create exactly **one link per `[ISSUE_TRACKER_TOOL]` call**. Never collapse multiple edges into a single multi-link or CSV/JSON batch operation. The single-edge / dual-phrasing model combined with the acli flag inversion makes batched creation error-prone and unverifiable per-edge. The only safe pattern is: create one edge → verify its direction → move to the next. Batch creation defeats the mandatory round-trip check in §4.

---

## 6. Fallback degradation

When the workspace lacks a required link type (`test`, `problem_incident`, or `blocks` reports `exists_in_workspace: false`, or the slug is absent), degrade to `relates`:

1. Create the link using the `relates` slug.
2. Surface the degradation to the user VERBATIM — name the affected issues, the intended semantic, and the lost direction.
3. Record `link_degraded: <slug> → relates` in the workflow output and in the traceability matrix (§7) so any downstream consumer (coverage report, block gate) can either skip these edges or treat them as informational behind a warning.
4. Recommend the user create the canonical link type in the workspace and re-run `bun run jira:sync-link-types`, then re-run this phase.

`relates` is symmetric — both sides read the same phrase, so **direction is lost**. NEVER silently use `relates` for a `blocks` edge: a coverage/block consumer that reads only `blocks` will drop the edge, and the `defect_reported → blocked` gate will fail to detect the block. Degradation is always loud, never silent.

---

## 7. Traceability matrix output (audit trail)

After all links exist and each direction is verified, surface the traceability matrix to the user. The matrix is the audit trail — every edge is traceable back to its touchpoint and verified direction.

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

The "Verified direction" column is `no` only for symmetric types (`relates`) — every asymmetric edge must read `yes` before hand-off, or it has not passed §4.

---

## 8. Touchpoint map — which skill creates which link, when

```
shift-left-testing
  └─ Test Plan (ATP) authored for Story/feature
        → Story is tested by ATP              [test]

test-documentation  (Modality jira-xray)
  ├─ ATP (Test Plan) + ATR (Test Execution) created for Story
  │     → Story is tested by ATP              [test]   (acli — [ISSUE_TRACKER_TOOL])
  │     → Story is tested by ATR              [test]   (acli — [ISSUE_TRACKER_TOOL])
  └─ Test Case created under the ATP/ATR
        → Xray-internal attach (plan add-tests / exec add-tests)  (xray-cli — membership only, NO Jira link)
        → ATP designs TC                       [test_design]   (acli — [ISSUE_TRACKER_TOOL], create explicitly)
        → ATR executes TC                      [test_execute]  (acli — [ISSUE_TRACKER_TOOL], create explicitly)
        (Story is NOT linked to the TC — coverage aggregates via ATP/ATR.
         The Xray attach creates NO Jira links; the design/execute edges are SEPARATE and explicit.)
        → (opt) automation automates Test      [test_automation]

test-documentation  (Modality jira-native)
  └─ Test / Test Execution created for Story
        → Story is tested by Test/TestExec    [test]
        → (opt) automation automates Test     [test_automation]

sprint-testing
  ├─ defect found during QA of Story
  │     → Story causes Bug                     [problem_incident]
  └─ QA blocks Story on open defect (defect_reported → blocked gate)
        → Bug blocks Story                     [blocks]

regression-testing
  └─ existing Test re-bound for regression cycle
        → ATP designs Test                     [test_design]
        → ATR executes Test                    [test_execute]
```

Edge ownership in one line:

- **Story → tested_by → ATP/ATR** created on **ATP/ATR creation** (test-documentation, shift-left) via `test`. The Story is linked to the ATP and ATR only — never to individual TCs.
- **ATP → designs → TC** and **ATR → executes → TC** created on **TC creation** (test-documentation, regression) via `test_design` / `test_execute`. These are the coverage edges that bind TCs into the Story's graph (through the ATP/ATR), replacing any direct Story↔TC link.
- **Story → causes → Bug** created on **bug filing** (sprint-testing) via `problem_incident`.
- **Story → blocked-by → Bug** created on **QA block** (sprint-testing `defect_reported → blocked` gate) via `blocks`.

---

## 9. Test Set / Xray-internal caveat

**Test ↔ Test Set membership is NOT a Jira issuelink.** Neither is Test ↔ Test Plan membership in an Xray-managed project. These are Xray-internal associations stored in Xray's own data model, not in Jira's `issuelinks`. They MUST be handled via **`/xray-cli`** (Xray REST / GraphQL), NEVER via `acli jira workitem link create`.

**Explicit warning**: do NOT attempt to create membership with the (currently buggy) `"is part of test set"` link-type literal. It is not a real Jira link type in this workspace catalog, it bypasses the slug resolver (violating §2), and the Xray membership it appears to imply will not register. Test Set / Test Plan membership goes through `/xray-cli` only. The `test` issuelink in §3 covers Story↔test-artifact COVERAGE — it does not and cannot express Test-Set MEMBERSHIP.

### Jira-layer links vs Xray-internal membership for the `designs` / `executes` edges — CONFIRMED

The TARGET model (§3, §8) prescribes two distinct layers for an ATP/ATR↔TC relationship:

- **Jira layer** — the `test_design` (`designs` / `is designed by`) and `test_execute` (`executes` / `is executed by`) **issue links**, readable on the ATP / ATR / TC issue panels and walkable via `issuelinks`.
- **Xray layer** — the Test's membership of the Test Plan / Test Execution, stored in Xray's own data model (NOT in `issuelinks`), managed through `/xray-cli` (`plan add-tests` / `exec add-tests`).

**CONFIRMED (empirically verified against a live Xray Cloud + Jira instance):** attaching a Test to a Test Plan (`plan add-tests`) or Test Execution (`exec add-tests`) via Xray creates **ZERO Jira-layer issue links** — the membership is purely Xray-internal (visible only in Xray's own panels, never in Jira's "Linked issues" / `issuelinks` / REST). The Jira-layer `test_design` (`designs` / `is designed by`) and `test_execute` (`executes` / `is executed by`) links are therefore NOT a by-product of the Xray attach and MUST be created EXPLICITLY via `[ISSUE_TRACKER_TOOL]` (`/acli`) using the `test_design` / `test_execute` slug, then direction-verified per §4. The two operations are independent: the Xray-internal attach (`/xray-cli`) handles membership; the Jira coverage edges go through acli — `/xray-cli` does NOT and cannot create them.

---

## Hard rules — NEVER do these

- NEVER hardcode link-type names. Always resolve via `{{jira.link_types.<slug>}}` (§2).
- NEVER fall back to a literal name when a slug fails to resolve — STOP and re-run `bun run jira:sync-link-types` (§2).
- NEVER use `relates` for a direction-carrying edge (`blocks`, `problem_incident`, `test`) without loudly recording the degradation (§6).
- NEVER batch multiple links in one call — one call per edge, verify each (§5, §4).
- NEVER trust acli `--out` / `--in` naming — consult `acli/references/workitem.md` §link inversion gotcha first, then verify direction after every create (§4).
- NEVER skip the mandatory post-create direction check for an asymmetric edge (§4).
- NEVER create Test ↔ Test Set / Test Plan membership via acli link, and NEVER use the `"is part of test set"` literal — route to `/xray-cli` (§9).

---

## used_by

- `sprint-testing` — files Bug (`problem_incident`) and blocks Story (`blocks`) during in-sprint QA.
- `shift-left-testing` — binds Story to ATP/Test Plan (`test`) during pre-dev refinement.
- `test-documentation` — binds Story to ATP + ATR (`test`); binds each TC to the ATP (`test_design`) and ATR (`test_execute`), NOT to the Story directly (Modality `jira-xray`). In Modality `jira-native` binds Story to Test / Test Execution (`test`, opt. `test_automation`).
- `regression-testing` — re-binds existing Tests via ATP (`test_design`) and ATR (`test_execute`) per regression cycle.
- `xray-cli` — owns Xray-internal Test Set / Test Plan membership (NOT a Jira issuelink — §9).
