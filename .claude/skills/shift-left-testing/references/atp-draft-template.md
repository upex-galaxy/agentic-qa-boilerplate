# ATP DRAFT Template — Skeleton for `shift-left-refinement.md`

> **Subagent context**: this file is the "Context docs" template the Phase 2 Refinement subagent writes into the Story's PBI folder (see `shift-left-testing/SKILL.md` §Phase 2 and `refinement-playbook.md`).

This is the **DRAFT** ATP body used during pre-sprint Shift-Left. Different from sprint-testing's full ATP (`acceptance-test-planning.md`) — see §Differences from sprint-testing's ATP below.

The skeleton below is the canonical body for `shift-left-refinement.md`. The same body is mirrored byte-for-byte in Jira during Phase 3 (custom field `{{jira.acceptance_test_plan}}` + Story description QA Refinements section + comment mirror).

> **Before Phase 3 publishes ATP DRAFT body to Jira rich-text fields**, read `../../agentic-qa-core/references/jira-publishing-gotchas.md` — covers the two ADF conversion gotchas (`md-to-adf` mark collision + MCP batched custom-field rejection) that silently fail HTTP 400.

---

## Skeleton

```markdown
# Shift-Left Refinement: {{PROJECT_KEY}}-{n} — {Title}

**Status**: Refined — Awaiting PO Estimation
**Mode**: Shift-Left (pre-sprint, batch grooming)
**Refined on**: {{YYYY-MM-DD}}
**Refined by**: QA — Shift-Left batch session
**Modality**: {Xray | Jira-native}

---

## Phase 1 — Critical Analysis

### Business context
- **Primary persona affected**: ...
- **Secondary personas (if any)**: ...
- **Business value proposition**: ...
- **KPI(s) influenced**: ...
- **User journey position**: which step / which flow

### Technical context
- **Frontend**: components, pages / routes, state management (if any)
- **Backend**: endpoints (cite `business-api-map.md`), services, DB tables
- **External services**: ...
- **Integration points specific to this Story**: ...

### Story complexity
| Axis | Rating | Why |
|------|--------|-----|
| Business logic | Low / Medium / High | ... |
| Integration | Low / Medium / High | ... |
| Data validation | Low / Medium / High | ... |
| UI | Low / Medium / High | ... |

**Estimated test effort**: ... (informs PO estimation)

### Epic-level inheritance (if applicable)
- Risks restated at Story level: ...
- Integration points inherited: ...
- PO/Dev answers already given at epic level: ... (reused, NOT re-asked)
- Test strategy inherited: ...

---

## Phase 2 — Story Quality Analysis

### Ambiguities
| # | Location in Story | Question for PO/Dev | Impact on testing | Suggested clarification |
|---|-------------------|---------------------|-------------------|------------------------|
| 1 | AC2 line "user can ..." | What does "successful" mean — HTTP 200 or rendered toast? | Cannot design assertion | Specify expected feedback channel |

### Gaps (missing info)
| # | Type | Why critical | What to add | Risk if omitted |
|---|------|--------------|-------------|-----------------|
| 1 | AC | No error path defined for invalid input | Add Negative AC covering 400 / validation message | False positive in QA + production defect |

### Edge cases not in Story
| # | Scenario | Expected behavior (best guess) | Criticality | Action |
|---|----------|-------------------------------|-------------|--------|
| 1 | User submits OTP after session expires | Show "Session expired — restart" | High | Add to AC (NEEDS PO/DEV CONFIRMATION) |

### Contradictions
{Any disagreement between description, ACs, comments, designs — surface explicitly. If none: "No contradictions found."}

### Testability validation
**Verdict**: Yes / Partial / No

If Partial / No, list issues:
- Vague AC ("works fast" — no metric)
- Missing error messages
- No test-data examples
- Missing performance criteria
- Cannot isolate (depends on parallel feature)

---

## Phase 3 — Refined Acceptance Criteria

### Original AC1 — {summary}

#### Scenario 1.1: Should {behavior} {condition} (Type: Positive, Priority: High)
- **Given**: ...
- **When**: ... (exact input values)
- **Then**: ...
  - UI: ...
  - API: status + body shape
  - DB: table / record / fields changed
  - System state: ...

#### Scenario 1.2: Should {behavior} {condition} (Type: Negative, Priority: High)
- **Given**: ...
- **When**: ...
- **Then**: error message verbatim + status code + no DB change

(...repeat per AC...)

### New scenarios surfaced from Phase 2 edge cases — NEEDS PO/DEV CONFIRMATION

#### Scenario E1: Should {behavior} {condition} (Type: Edge, Priority: ?)
- **NEEDS PO/DEV CONFIRMATION**: behavior inferred — confirm before sprint planning
- **Given**: ...
- **When**: ...
- **Then**: ...

---

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate
| Type | Count | Notes |
|------|-------|-------|
| Positive | X | Happy path variants |
| Negative | Y | Invalid inputs, unauthorized, missing fields |
| Boundary | Z | Min / max / empty / null / unicode |
| Integration | W | Per integration point |
| API | V | Per endpoint touched |
| **Total** | **N** | (drives PO estimation) |

**Rationale**: 2-3 sentences explaining why this count given the complexity axes from Phase 1.

### Outline list (NAMES ONLY — preconditions in 1 line, expected in 1 line)

#### Positive
- **Should login successfully with valid OTP** — Pre: user requested OTP <5 min ago. Expected: redirect to /dashboard + 200 + session cookie set.
- ...

#### Negative
- **Should reject login when OTP is incorrect** — Pre: user with active OTP. Expected: 401 + "Invalid code" + no session.
- ...

#### Boundary
- **Should reject OTP entered exactly at 5-minute expiry boundary** — Pre: OTP issued 5:00 ago. Expected: 401 + "Code expired".
- ...

#### Integration
- **Should validate Auth0-issued OTP via /verify endpoint** — Pre: Auth0 sandbox configured. Expected: 200 from Auth0 + 200 from app.
- ...

> **NOT included here** (deferred to in-sprint planning by `/sprint-testing` Stage 1): parametrization tables, per-outline test-data JSON, numbered test steps, Faker generation strategies. Coverage estimate IS included because PO uses it for estimation.

---

## Phase 5 — Edge Cases (DRAFT)

| # | Edge case | In original Story? | Criticality | Action |
|---|-----------|-------------------|-------------|--------|
| 1 | OTP submitted after session expiry | No | High | Add to AC (PO confirm) |
| 2 | OTP entered with leading whitespace | No | Medium | Test only — don't add AC |

> Test-data generation strategy + Faker recipes are NOT defined here. They land in `/sprint-testing` Stage 1 when the feature exists.

---

## Story Quality Assessment

**Verdict**: Good / Needs Improvement / Significant Issues

**Key findings** (1-3 bullets):
- ...
- ...

---

## Critical Questions for PO

> These BLOCK sprint planning until answered.

1. **{Question}**
   - **Context**: ...
   - **Impact if unanswered**: ...
   - **Suggested answer (if you have one)**: ...

---

## Technical Questions for Dev

> These do not block PO but block implementation.

1. **{Question}** — context + testing impact.

---

## Suggested Story Improvements

| # | Current state | Suggested change | Benefit |
|---|---------------|------------------|---------|
| 1 | "User can ..." | "User can ... within 2 seconds" | Adds performance bar → measurable AC |

---

## Data feasibility flags

{If Phase 1 Selection marked DATA-FEASIBILITY-RISK, restate concretely. If none: "No data feasibility risks identified."}

- **Entity / fixture missing**: ...
- **API contract gap**: ...
- **Required pre-work**: ...

---

## Recommended testing strategy

### Pre-implementation
- ...

### During implementation
- ...

### Post-implementation (in-sprint by /sprint-testing)
- ...

---

## Risks & mitigation

| # | Risk | Likelihood | Impact | Mitigated by which outlines |
|---|------|-----------|--------|-----------------------------|
| 1 | ... | Low / Med / High | Low / Med / High | Outlines #X, #Y |

---

## Next steps

- [ ] PO answers Critical Questions before sprint planning
- [ ] Dev answers Technical Questions before estimation
- [ ] Story enters sprint at status `{{jira.status.story.ready_for_dev}}` once estimated
- [ ] When Story reaches `{{jira.status.story.ready_for_qa}}`, `/sprint-testing` will short-circuit refinement (label `shift-left-reviewed` detected)
```

---

## Differences from sprint-testing's full ATP

| Section | Sprint-testing's `test-analysis.md` (full ATP) | Shift-Left's `shift-left-refinement.md` (DRAFT) |
|---------|----------------------------------------------|-------------------------------------------------|
| Phase 4 parametrization tables | YES | NO |
| Phase 4 per-outline test-data JSON | YES | NO |
| Phase 4 numbered test steps | YES | NO (titles + 1-line precondition + 1-line expected only) |
| Phase 5 test-data generation strategy | YES | NO |
| Phase 5 Faker recipes | YES | NO |
| TC creation in Xray (Modality jira-xray) | YES (Phase 6) | NO — TCs created in Stage 4 `/test-documentation` |
| Commit on `test/{KEY}/...` branch | YES | NO — Jira is canonical |
| Bug variant section | YES | NO — bugs out of scope |
| Status flag at top | "Test Analysis — Ready for Execution" | "Refined — Awaiting PO Estimation" |

When `/sprint-testing` later runs Stage 1 on a Story with `shift-left-reviewed` label fresh (<30 days), it reads `shift-left-refinement.md` from the same PBI folder and:

1. Validates Refined ACs still match the (possibly updated) Story description.
2. Skips Phases 1-3 of `acceptance-test-planning.md` (already done).
3. Adds the deferred sections: parametrization, test-data JSON, Faker recipes, numbered steps.
4. Writes `test-analysis.md` as a SUPERSET of `shift-left-refinement.md`.

Both files coexist in the PBI folder. `shift-left-refinement.md` is the historical record of pre-sprint analysis; `test-analysis.md` is the in-sprint authoritative test plan.

---

## Gotchas

1. **The skeleton above is canonical.** Do not reorder sections. Section names map 1:1 to the Jira description block PO sees during planning.
2. **NEEDS PO/DEV CONFIRMATION** marker is verbatim — never paraphrased. Tooling later greps for this string.
3. **Empty sections stay**, just with "None identified." — easier for the reviewer to verify completeness than to discover an absent section.
4. **Coverage estimate table** must show 0 for empty Types. Hidden zeros bias PO estimation.
5. **Mirror discipline**: the local file is the source of truth for what gets pushed to Jira in Phase 3. Diff = error.
