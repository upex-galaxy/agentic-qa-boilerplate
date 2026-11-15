# ATP Outline Template: skeleton for `shift-left-refinement.md`

The Phase 2 Refinement subagent writes this body into the Story's PBI folder (see `shift-left-testing/SKILL.md` §Phase 2 and `refinement-playbook.md`).

It is the pre-sprint ATP at outline maturity, and the Story's single, real ATP. Before the sprint it lives in the `{{jira.acceptance_test_plan}}` field. `/sprint-testing` Stage 1 later creates the Test Plan issue from that field content and refines the same ATP into the executable superset (see `acceptance-test-planning.md` for that stage's full body). Between the two passes the scope changes, and so does the home (field, then item), but the ATP stays the same one.

The skeleton below is the canonical body for `shift-left-refinement.md`, the `[LOCAL]` staging buffer. Phase 3 publishes it to Jira (custom field `{{jira.acceptance_test_plan}}` plus the Story description QA Refinements section). The Phase 3 comment is a pointer to the field. The full body goes into a comment only in fallback mode, when the field is absent (see `handoff-protocol.md`).

The `# Shift-Left Refinement: ...` heading below is only the local file heading. Phase 3 publishes to the `{{jira.acceptance_test_plan}}` field, and Shift-Left creates no Test Plan issue. The real Test Plan item, titled `ATP: {STORY-KEY}: {story title}` and parented to the QA Master Test Plan epic, is created by `/sprint-testing` Stage 1 from the field content. Use that exact title and make no second ATP.

Before Phase 3 publishes the ATP body to Jira rich-text fields, read `../../agentic-qa-core/references/jira-publishing-gotchas.md`. It covers the two ADF conversion gotchas (`md-to-adf` mark collision and MCP batched custom-field rejection) that fail silently with HTTP 400.

---

## Skeleton

```markdown
# Shift-Left Refinement: {{PROJECT_KEY}}-{n} — {Title}

**Status**: Refined — Ready For Dev
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
- **Backend**: endpoints (cite the `business-api-context` section id), services, DB tables
- **External services**: ...
- **Integration points specific to this Story**: ...

### Story complexity
| Axis | Rating | Why |
|------|--------|-----|
| Business logic | Low / Medium / High | ... |
| Integration | Low / Medium / High | ... |
| Data validation | Low / Medium / High | ... |
| UI | Low / Medium / High | ... |

**Estimated test effort**: ... (feeds the AI Effort call)
**AI Effort**: Low / Medium / High (checklist: `references/ai-effort-checklist.md`; High adds a size note in the handoff comment)

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

## Phase 4 — Test Outlines (outline names only)

### Coverage estimate
| Type | Count | Notes |
|------|-------|-------|
| Positive | X | Happy path variants |
| Negative | Y | Invalid inputs, unauthorized, missing fields |
| Boundary | Z | Min / max / empty / null / unicode |
| Integration | W | Per integration point |
| API | V | Per endpoint touched |
| **Total** | **N** | (feeds the AI Effort call) |

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

> **NOT included here** (deferred to in-sprint planning by `/sprint-testing` Stage 1): parametrization tables, per-outline test-data JSON, numbered test steps, Faker generation strategies. Coverage estimate IS included because it feeds the AI Effort call and the split decision.

---

## Phase 5 — Edge Cases (outline)

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
- [ ] Dev answers Technical Questions before the Story is pulled into a sprint
- [ ] If AI Effort is High, the handoff comment carries the size note (a warning: a split is optional and never a gate)
- [ ] Story enters sprint from status `{{jira.status.story.ready_for_dev}}`
- [ ] When Story reaches `{{jira.status.story.ready_for_qa}}`, `/sprint-testing` will short-circuit refinement on this published ATP body plus the fresh `shift-left-*` labels (never on the label alone)
```

---

## Differences from sprint-testing's full ATP

| Section | In-sprint ATP (sprint-testing Stage 1) | Pre-sprint ATP (this skill, Phase 2) |
|---------|----------------------------------------------|-------------------------------------------------|
| Phase 4 parametrization tables | YES | NO |
| Phase 4 per-outline test-data JSON | YES | NO |
| Phase 4 numbered test steps | YES | NO (titles + 1-line precondition + 1-line expected only) |
| Phase 5 test-data generation strategy | YES | NO |
| Phase 5 Faker recipes | YES | NO |
| TC creation in Xray (Modality jira-xray) | YES: sprint `Test` issues in Stage 1 | NO: no TC work items pre-sprint |
| Bug variant section | YES | NO: bugs out of scope |
| Status flag at top | "Test Analysis — Ready for Execution" | "Refined — Ready For Dev" |

When `/sprint-testing` later runs Stage 1 on a Story with a fresh `shift-left-reviewed` label (under 30 days), it syncs and reads `acceptance-test-plan.md`, which by then holds this body as published to Jira in Phase 3. Then it:

1. Validates that the Refined ACs still match the (possibly updated) Story description.
2. Skips Phases 1-3 of `acceptance-test-planning.md`, which are already done.
3. Adds the deferred sections: parametrization, test-data JSON, Faker recipes, numbered steps.
4. Creates the Test Plan issue (`ATP: {STORY-KEY}: {story title}`, parented to the QA Master Test Plan epic, linked to the Story) from the field content, then writes the full ATP back to the same Jira `acceptance_test_plan` field (or fallback comment) and into that Test Plan issue, as a superset of the pre-sprint body.

There is one ATP per Story. `shift-left-refinement.md` is a local staging buffer between Phase 2 and Phase 3, not a durable artifact: once Phase 3 publishes, Jira holds the canonical copy and the synced `acceptance-test-plan.md` is the readable one. The in-sprint short-circuit must not depend on the staging file being on disk, because it lives under a gitignored path and is missing on any other machine.

---

## Gotchas

1. The skeleton above is canonical. Keep the section order: the section names map 1:1 to the Jira description block the PO sees during planning.
2. `NEEDS PO/DEV CONFIRMATION` is a verbatim marker, never paraphrased. The Stage 0 DoD (`agentic-qa-core/references/stage-gates.md`) checks for it.
3. Empty sections stay, with "None identified." A reviewer verifies completeness faster than they discover an absent section.
4. The coverage estimate table shows 0 for empty Types. Hidden zeros bias the AI Effort call.
5. The local file is the source of truth for what Phase 3 pushes to Jira. Any diff between them is an error.
