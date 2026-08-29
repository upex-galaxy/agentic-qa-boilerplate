# Traceability Linking

> **Purpose**: Reflect QA traceability relationships — Story↔test-artifact coverage, Story→Bug causation, Story→Bug blocking — as real Jira issue links, not just local declarations inside `story.md` / test-spec files. Local declarations document author intent; Jira links are the operational source of truth that audit trails, coverage reports, and the `defect_reported → blocked` gate read. Without this phase, the traceability graph exists only in the methodology docs and any consumer that walks `issuelinks` walks an empty graph.
> **Use when**: Any time a QA workflow binds a Story to a test artifact, files a defect against a Story, or blocks a Story on an open defect. Concretely: shift-left Test Plan creation, sprint-testing bug filing + blocking, test-documentation Test / Test Execution creation, regression-testing re-coverage. Re-run whenever the coverage or defect graph changes mid-flight.
> **Companion references**:
>
> - `agentic-qa-core/references/acli-integration.md` — slug catalog, `{{jira.*}}` syntax, tool routing for the link-creation write operation (`[ISSUE_TRACKER_TOOL]` → `/acli`).
> - `acli/references/workitem.md` §link — the per-link-type directionality table, the empirical acli `--out` / `--in` INVERSION gotcha, and the mandatory post-create verification recipe. **Cited here, not duplicated.**
> - `xray-cli` skill — owns Xray-internal membership (`TC ∈ ATS` / `TC ∈ ATP` / `TC ∈ ATR`) which, in Modality `jira-xray`, is NOT a Jira issuelink. See §9 (including the jira-native carve-out).

---

## 1. Purpose + when to use

Traceability linking turns QA intent into a queryable graph in Jira. Five touchpoints invoke it:

| Touchpoint              | Moment                                                          | Link created                                  |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `shift-left-testing`    | Test Plan (ATP) authored ahead of dev for a Story / feature    | Story `is tested by` ATP (`test`)             |
| `test-documentation`    | ATP (Test Plan) + ATR (Test Execution) created for a Story (Modality `jira-xray`) | Story `is tested by` ATP and ATR (`test`)     |
| `test-documentation`    | Test Case created for a Story under an ATP / ATR (Modality `jira-xray`) | ATP `designs` TC (`test_design`); ATR `executes` TC (`test_execute`) — placement edges; coverage flows through the ATS→Story link (direct TC→Story stays a valid last-resort, §3). |
| `test-documentation`    | Test / Test Execution issue created for a Story (Modality `jira-native`) | Story `is tested by` Test / Test Exec (`test`)|
| `sprint-testing`        | ATS (per-Story Acceptance Test Set, `ATS: {US_ID}: {story title}`) created/updated for the Story — Stage 1, Set-first | Story `is tested by` ATS (`test`) — **the coverage-bearing edge** (§3) |
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

Resolution source is `.agents/jira-link-types.json` (workspace state), keyed by slug. Slug syntax follows `AGENTS.md` §7 / `agentic-qa-core/references/acli-integration.md` §Slug-catalog.

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
| `test`             | Coverage + administrative traceability — Story is tested by ATS / ATP / ATR | ATS (Test Set) / ATP (Test Plan) / ATR (Test Execution) / TC (last-resort) → Story | `tests`                | `is tested by`        | **REQUIRED**        | Canonical container→coverable link. **ATS→Story is the coverage-bearing edge** (live-verified: it is what fills the Story's coverage panel) and is MANDATORY per Story. **ATP→Story and ATR→Story are administrative traceability only** — live-verified to contribute ZERO coverage (a Story linked only to its Plan + Execution reads UNCOVERED). **TC→Story direct is a valid last-resort** (also coverage-bearing) when no ATS exists — the final rung of the resolution cascade below, not a defect. |
| `problem_incident` | Causation — Story causes a defect  | Story → Bug / Defect                                        | `causes`               | `is caused by`        | **REQUIRED**        | When a defect is filed against a Story under test (sprint-testing bug filing). Records that the Story's behaviour caused the defect. |
| `blocks`           | Blocking — Story is blocked by an open defect | Bug / Defect / Story / TechStory / TechDebt → Story | `blocks`               | `is blocked by`       | **REQUIRED**        | When QA blocks a Story on an open defect — the `defect_reported → blocked` gate. The defect (or blocking issue) `blocks` the Story; the Story `is blocked by` it. |
| `relates`          | Symmetric reference (fallback)     | Any ↔ Any (symmetric)                                       | `relates to`           | `relates to`          | Fallback            | Degradation target ONLY when a required type is absent from the workspace. **Direction is lost** — warn on degradation (§6). |
| `test_design`      | Placement — ATP designs a Test Case | ATP (Test Plan) → TC (Test)                                 | `designs`              | `is designed by`      | **REQUIRED** (jira-xray) / N-A (jira-native) | The prescribed ATP↔TC edge under Modality `jira-xray`. Created for each TC the ATP plans. Inside the ATP you read `designs TC-x`; inside the TC you read `is designed by ATP`. Placement/administrative — coverage does NOT flow through this edge (see the two-layer model below); it does not replace a last-resort direct TC→Story link. |
| `test_execute`     | Placement — ATR executes a Test Case | ATR (Test Execution) → TC (Test)                           | `executes`             | `is executed by`      | **REQUIRED** (jira-xray) / N-A (jira-native) | The prescribed ATR↔TC edge under Modality `jira-xray`. Created for each TC the ATR runs. Inside the ATR you read `executes TC-x`; inside the TC you read `is executed by ATR`. Placement/administrative — coverage does NOT flow through this edge (see the two-layer model below). |
| `test_automation`  | Xray refinement — automation covers a manual test | Automation → manual Test                          | `automation test for`  | `is automated by`     | Optional            | Xray-special refinement to bind an automated test to the manual Test it automates (test-automation Stage). |

> **Two-layer model (binding — never confuse the layers).** An ATS/ATP/ATR↔TC↔Story graph lives in TWO distinct layers:
>
> 1. **Jira layer — issue links** (container → coverable, `test` slug, inward `is tested by`): **ATS→Story** (MANDATORY, the coverage-bearing edge — live-verified as the link that fills the Story's coverage panel) · **ATP→Story** + **ATR→Story** (administrative traceability — live-verified to contribute ZERO coverage) · **TC→Story** direct (valid last-resort only).
> 2. **Xray layer — membership** (`TC ∈ ATS`, `TC ∈ ATP`, `TC ∈ ATR`): Xray-internal associations, **GraphQL-only** in Modality `jira-xray` (`addTestsToTestSet` / `getTestSet` / `getTestsEnrichment` etc.) — in that modality NEVER expressed as a Jira issue link (§9).
>
> **jira-native carve-out (explicit):** the "membership is never a Jira link" rule is **xray-modality-only**. In Modality `jira-native` there is no Xray layer, so membership IS expressed as **`TC→ATS` issue links** (slug-resolved per §2, never a literal) alongside the `ATS→Story` link. An instance without the Test Set work type has no ATS: fall back to direct `TC→Story` links — the cascade below still resolves (third rung).
>
> **Resolution cascade (doctrine — how a TC resolves to its Story):** `TC → ATS → Story` (primary, coverage) → `TC → ATP → Story` (secondary, **placement-only** — does NOT fill the coverage panel) → `TC → Story` direct (last resort) → nothing matches: **ORPHAN**. The container→TC hop is walked via Xray membership in Modality `jira-xray` and via the `TC→ATS` links in `jira-native`.
>
> **The ATS (Acceptance Test Set) — third canonical per-Story artifact.** Title `ATS: {US_ID}: {story title}`. **MANDATORY per Story**, even when it holds a single TC. Set-first: the ATP and ATR derive their test lists from the ATS membership. Parents to the **QA Test Artifacts** epic; **components INHERITED from the Story (mandatory)** — the components exemption applies only to feature-level `TS:` sets, never to the ATS. Feature-level `TS: {EPIC|module}: Validate {feature}` sets remain optional (smoke / regression / feature grouping), components optional.
>
> **Items-first (default by excellence):** in BOTH modalities the ATP and ATR are real Jira **items** — a **Test Plan** item (`ATP: {STORY-KEY}: {title}`) and a **Test Execution** item (`ATR: {STORY-KEY}: Story Testing`) — so the `test` / `test_design` / `test_execute` edges above apply uniformly. The **fallback** branch — ATP/ATR carried as Story custom fields with no separate issues — applies ONLY when the Test Plan / Test Execution work types are unavailable in the instance and the items therefore cannot be created; there `test_design` / `test_execute` are N-A and the Story is linked directly to each Test via the generic `test` edge instead (the cascade's last rung). `test_automation` stays an optional refinement in both cases.
>
> **QA-process Epic parenting (axis 1) + roll-up.** Independently of the coverage links above, every Plan and Run also parents to a QA-process Epic: every **Test Plan** item (ATP · FTP · STP) parents to the **QA Master Test Plan** epic; every **Test Execution** item (ATR · STR), **Test Set** (ATS and feature-level `TS:`), and **Precondition** parents to the **QA Test Artifacts** epic. Optional **roll-up** edges aggregate coverage up the ladder: ATP `is part of` FTP, and FTP `is part of` STP (`relates` family / `is part of`) — the parent Epic stays the QA-process Epic regardless of roll-up.
>
> **The RESULTS side has NO roll-up edge (binding).** The roll-up above is a **Plans-only** mechanism. There is no `ATR is part of STR` link type, and none is to be invented: the **STR is a sibling recap of the sprint, not an aggregate of the ATRs**. Nothing in Jira or Xray sums per-Story outcomes into it, so an STR's numbers are whatever its own Test Runs hold — never assume they roll up from the Stories. A reader who wants per-Story outcomes reads the ATRs **directly** (they hang off their own Stories via the administrative `ATR→Story` edge); the STR answers "how did the sprint's regression go", a different question. Same for the retired FTR rung: feature results are read from the per-Story ATRs, not aggregated anywhere.

---

## 4. Directionality + the acli `--out` / `--in` inversion + mandatory verification

Jira link types are asymmetric: each edge has an outward phrase (read from the source) and an inward phrase (read from the target). The API stores ONE edge; it renders bidirectionally with the matching phrase on each side.

**Do NOT trust the tool layer's flag naming.** `acli`'s `--out` / `--in` flags are EMPIRICALLY INVERTED relative to Jira's outward/inward semantics — `--out` takes the inward partner and `--in` takes the outward partner. The full per-link-type mapping (including the `Test` / `Test Design` / `Test Execute` / `Test Automation` / `Causes` / `Blocks` / `Relates` rows) and the reverse-mapping rule of thumb live in **`acli/references/workitem.md` §link → "Directionality — EMPIRICAL FLAG INVERSION"**. Read that section before any `link create` call. Do not re-derive it here.

**MANDATORY post-create verification** — every link-create MUST be followed by a direction check. The recipe (`[ISSUE_TRACKER_TOOL]` list-links for the issue → inspect `outwardIssueKey`) lives in `acli/references/workitem.md` §link → "Mandatory post-create verification". The methodology rule per QA edge:

- **`test`** — for "Story is tested by ATS/ATP/ATR (or last-resort TC)" → list the Story's links → confirm the Story is the INWARD party (`is tested by`) and the container/TC is the outward party (`tests` → Story). Live-verified: the coverage panel reads ONLY the inward `is tested by` on the coverable — an inverted edge silently contributes zero coverage. Mismatch → delete + recreate with swapped flags, re-verify.
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
        (Coverage does NOT flow through the ATP/ATR — it flows through the ATS→Story
         link (or last-resort TC→Story). The Xray attach creates NO Jira links; the
         design/execute edges are SEPARATE, explicit, and placement-only.)
        → (opt) automation automates Test      [test_automation]

test-documentation  (Modality jira-native)
  └─ Test / Test Execution created for Story
        → Story is tested by Test/TestExec    [test]
        → (opt) automation automates Test     [test_automation]

sprint-testing
  ├─ Stage 1 — Set-first: ATS created/updated for the Story (mandatory, even for 1 TC)
  │     → Story is tested by ATS               [test]  ← the coverage-bearing edge
  │     → TC ∈ ATS membership                  (jira-xray: xray-cli GraphQL, NO Jira link;
  │                                             jira-native: TC→ATS issue links — §9 carve-out)
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

- **ATS → tests → Story** created on **ATS creation** (sprint-testing Stage 1, Set-first) via `test`. THE coverage-bearing edge (live-verified) — mandatory per Story.
- **ATP/ATR → tests → Story** created on **ATP/ATR creation** (test-documentation, shift-left) via `test`. Administrative traceability only — contributes zero coverage (live-verified).
- **TC ∈ ATS/ATP/ATR membership** — Xray layer: GraphQL-only in Modality `jira-xray` (`/xray-cli`); expressed as `TC→ATS` issue links in `jira-native` (§9 carve-out).
- **ATP → designs → TC** and **ATR → executes → TC** created on **TC creation** (test-documentation, regression) via `test_design` / `test_execute`. Placement-only — coverage flows through the ATS→Story (or last-resort TC→Story) edge, never through these.
- **TC → tests → Story** direct — last-resort rung of the cascade (`TC → ATS → Story` → `TC → ATP → Story` placement-only → `TC → Story` → ORPHAN); valid, not a defect, when no ATS exists.
- **Story → causes → Bug** created on **bug filing** (sprint-testing) via `problem_incident`.
- **Story → blocked-by → Bug** created on **QA block** (sprint-testing `defect_reported → blocked` gate) via `blocks`.

---

## 9. Test Set / Xray-internal caveat (Modality `jira-xray`) + jira-native carve-out

**In Modality `jira-xray`, Test ↔ Test Set (ATS / `TS:`) membership is NOT a Jira issuelink.** Neither is Test ↔ Test Plan / Test Execution membership in an Xray-managed project. These are Xray-internal associations stored in Xray's own data model (`TC ∈ ATS`, `TC ∈ ATP`, `TC ∈ ATR`), not in Jira's `issuelinks`. They MUST be handled via **`/xray-cli`** (Xray GraphQL — `addTestsToTestSet` / `getTestSet` / enrichment), NEVER via `acli jira workitem link create`.

**Explicit warning (Modality `jira-xray`)**: do NOT attempt to create membership with the (currently buggy) `"is part of test set"` link-type literal. It is not a real Jira link type in this workspace catalog, it bypasses the slug resolver (violating §2), and the Xray membership it appears to imply will not register. Test Set / Test Plan membership goes through `/xray-cli` only. The `test` issuelink in §3 covers container→Story COVERAGE — in this modality it does not and cannot express Test-Set MEMBERSHIP.

**jira-native carve-out (explicit — the rule above is xray-modality-only).** In Modality `jira-native` there is NO Xray layer, so membership has no GraphQL home: there, membership IS expressed as Jira issue links — `TC→ATS` links bind each TC into the per-Story ATS, and the `ATS→Story` link carries coverage. An instance without the Test Set work type has no ATS at all; membership degrades to direct `TC→Story` links (the cascade's last rung, §3). The "never a Jira link" prohibition therefore applies ONLY where the Xray layer exists.

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
- NEVER treat an ATP→Story or ATR→Story link as coverage — administrative only (live-verified zero coverage); coverage = ATS→Story, or last-resort TC→Story (§3).
- NEVER skip the per-Story ATS — it is mandatory even for a single TC; the ATP/ATR derive their test lists from its membership (Set-first, §3).
- NEVER (Modality `jira-xray`) create Test ↔ Test Set / Test Plan membership via acli link, and NEVER use the `"is part of test set"` literal — route to `/xray-cli` (§9). In Modality `jira-native` membership IS `TC→ATS` issue links — the prohibition does not apply there (§9 carve-out).

---

## used_by

- `sprint-testing` — creates/updates the per-Story ATS and its coverage-bearing `ATS→Story` link (`test`) in Stage 1 (Set-first); files Bug (`problem_incident`) and blocks Story (`blocks`) during in-sprint QA.
- `shift-left-testing` — binds Story to ATP/Test Plan (`test`, administrative) during pre-dev refinement.
- `test-documentation` — binds Story to ATP + ATR (`test`, administrative); binds each TC to the ATP (`test_design`) and ATR (`test_execute`) as placement edges — direct `TC→Story` stays the cascade's last resort (Modality `jira-xray`). In Modality `jira-native` binds Story to Test / Test Execution (`test`, opt. `test_automation`).
- `regression-testing` — re-binds existing Tests via ATP (`test_design`) and ATR (`test_execute`) per regression cycle.
- `xray-cli` — owns Xray-internal `TC ∈ ATS/ATP/ATR` membership in Modality `jira-xray` (NOT a Jira issuelink there — §9; jira-native expresses it as `TC→ATS` links).
