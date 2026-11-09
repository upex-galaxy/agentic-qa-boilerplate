# AI Effort Checklist — sizing a Story and noting when it may need a split

> **Subagent context**: this file is the "Context docs" reference for the step that sets `{{jira.ai_effort}}` in Phase 3 (see `shift-left-testing/SKILL.md` §Phase 3 and `references/handoff-protocol.md` Step 2b). It reads the finished `shift-left-refinement.md` (Critical Analysis, refined ACs, coverage estimate) and produces ONE value, `low | medium | high`, plus, for `high`, a note in the handoff comment that the Story may be too large.

## What AI Effort is

`{{jira.ai_effort}}` is the categorical effort of the WHOLE work item in an agentic workflow: implementing it AND verifying it. It is not a time and it is not a token estimate (tokens are measured later, in `{{jira.development_token_usage}}` and `{{jira.quality_token_usage}}`). QA sets it in shift-left, before the sprint, because QA is the role that has just read the Story end to end for risk and coverage.

Option slugs come from `.agents/jira-required.yaml` (`{{jira.ai_effort.low}}`, `{{jira.ai_effort.medium}}`, `{{jira.ai_effort.high}}`). When the field is absent on the instance, post the value as a structured comment headed `## AI Effort` (the `fallback:` of the field in `.agents/jira-required.yaml`). Never block.

## Why this check exists

Three ideas from current agentic-delivery practice drive the checklist:

- The cost moved from building to verifying. An agent produces a change quickly; the scarce resource is a person (or a QA agent) confirming it is right.
- Small batches that can be verified win. A change that cannot be checked on its own accumulates unverified assumptions.
- A reliable size test for a change: it can be described in one sentence, it can be verified on its own, and it does not cross several architectural layers.

## The checklist

Answer in order, using the refined ACs, the Phase 1 critical analysis and the Phase 4 coverage estimate as evidence. Each answer is yes or no. Do not answer from the Story title.

| # | Question | Yes weighs toward | No weighs toward |
|---|----------|-------------------|------------------|
| 1 | Can the change be described in one sentence without "and"? | Low | High |
| 2 | Can it be verified on its own, with no other Story shipped first and no unfinished neighbor needed? | Low | High |
| 3 | Does it stay inside one layer (UI only, or API only, or DB only)? | Low | High |
| 4 | Does it touch auth, money, or data integrity (the veto list in `references/backlog-selection.md`)? | High | Low |
| 5 | Does it span more than one subsystem or module (several files in one subsystem is Medium; several subsystems is High)? | High | Medium |
| 6 | Does the coverage estimate need more than a few cases per Type (many Boundary or Integration outlines)? | Medium or High | Low |
| 7 | Does it depend on an open Critical Question for PO whose answer would change the scope? | High | no change |

## How to read the answers

Take the highest level that any question forces.

| Level | Meaning | Typical answers |
|-------|---------|-----------------|
| Low | Describable in one sentence, verifiable on its own, one layer. | 1, 2, 3 are yes; 4, 5, 7 are no; 6 is no |
| Medium | Several files or one subsystem, verified with a few cases. | At most one of 1-3 is no, 4, 5 and 7 are no, and 6 may be yes |
| High | Crosses layers (UI + API + DB), touches auth, money or data, cannot be verified in isolation, or cannot be described in one sentence. | Any of 4, 5 or 7 is yes, or two or more of 1-3 are no |

Rules of thumb:

- A Story that crosses UI + API + DB is High even when each layer is small, because the verification must follow the data across all three.
- Question 4 alone makes a Story High. A one-line change to a refund calculation is High.
- When two levels both fit, pick the higher one and say which question tipped it. Under-sizing hides the size warning; over-sizing costs one comment.

## When the result is High: the size note

High only WARNS, it never blocks. The handoff comment gets a note that the Story may be too large and may need splitting, and the Story still moves to Ready For Dev and the dev still works it. A PO may clone or split it and re-refine when shorter Stories are wanted, but that is optional and never a gate. The agent never splits a Story on its own, never creates the child Stories, and never holds the Story back because of the size.

To make the note useful, look for the cut lines, in this order:

1. By layer: an API slice that can be verified through the API alone, then the UI that consumes it.
2. By risk: the auth, money or data part separated from the plain part, so the risky part gets its own verification.
3. By AC: a group of ACs that already stands alone (one actor, one state, one rule).
4. By data variation: one entity type, role or payment method first, the rest after.

A suggested slice is worth listing only if it passes questions 1 to 3 of the checklist on its own. A slice that still scores High is cut again or reported as not splittable, with the reason.

The handoff comment for a High Story adds this note after the ATP pointer (the full comment template is in `references/handoff-protocol.md` Step 3):

```markdown
### AI Effort: High (may need splitting)
Tipped by: {question numbers and one-line reason, e.g. "3 (UI + API + DB), 4 (refund amount)"}.
Suggested slices (optional, nobody has to act on them):
1. {slice 1, one sentence} (verifiable on its own through {UI | API | DB})
2. {slice 2, one sentence}
Not splittable because: {only when no slicing passes questions 1-3, one line}
```

There is no separate field for the split verdict. The AI Effort value plus this comment is the record.

### Optional split labels

When someone does resolve the size note, they record the outcome as ONE label out of three. The label is optional, added by whoever resolves the split (a PO, a dev lead or QA); a Story without any of them is valid and nothing checks for them.

| Label | Meaning |
|-------|---------|
| `split-accepted` | The suggested split was taken as proposed. |
| `split-edited` | A split was made, with slices different from the suggestion. |
| `split-rejected` | The Story stays whole. |

## Worked example

Story: "As a customer I can request a partial refund on an order" with ACs covering the refund form, the amount validation, the payment-provider call, the refund record in the database and the confirmation email.

| # | Answer | Reason |
|---|--------|--------|
| 1 | No | Needs "and": form, provider call, record, email |
| 2 | No | The email and the record cannot be checked without the provider call |
| 3 | No | UI, API and DB |
| 4 | Yes | Money |
| 5 | Yes | Orders, payments and notifications |
| 6 | Yes | Many Boundary outlines on the amount |
| 7 | Yes | PO has not said whether the cap is a percentage or a fixed limit |

Result: High (questions 3, 4 and 7 each force it). Handoff comment block:

```markdown
### AI Effort: High (may need splitting)
Tipped by: 3 (UI + API + DB), 4 (refund amount), 7 (open cap policy question).
Suggested slices (optional):
1. Refund API: validates the amount against the cap and records the refund (verifiable on its own through the API and DB)
2. Provider call and failure handling on top of slice 1 (verifiable through the API with the provider sandbox)
3. Refund form and confirmation email consuming the API (verifiable through the UI)
Not splittable because: n/a
```

Slice 1 is one layer and verifiable alone, but it still touches money (question 4), so it stays High until the cap answer lands. The comment says so, because the cap answer is the prerequisite for the whole split. If someone splits the Story, the resulting Stories are re-refined and carry their own AI Effort; the Story is never held back meanwhile.
