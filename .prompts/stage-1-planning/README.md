# Stage 1: Shift-Left Testing

## Purpose

Design the testing strategy **BEFORE** writing code. Analyze Epics and Stories from a QA perspective to identify test scenarios, risks, and refined acceptance criteria.

**Why this stage exists:**

- Shift-left testing = earlier feedback = fewer bugs
- Identifies requirement ambiguities before implementation
- Defines testable acceptance criteria
- Creates foundation for test automation later (Stage 4)

---

## Prerequisites

- Previous phases completed:
  - Product Backlog in Jira
  - `.context/PBI/` structure with Epics and Stories
- Business context:
  - `.context/idea/business-model.md`
  - `.context/PRD/*.md`
- Technical context:
  - `.context/SRS/*.md`
- Atlassian MCP available

---

## Prompts in This Stage

| Order | Prompt                    | Level | Purpose                                        |
| ----- | ------------------------- | ----- | ---------------------------------------------- |
| 1     | `feature-test-plan.md`    | Epic  | Test strategy at feature level                 |
| 2     | `acceptance-test-plan.md` | Story | Acceptance test plan with test cases per story |

---

## Execution Flow

```
Epic in Jira + Local
        ↓
┌───────────────────────────────────────┐
│  [1] Feature Test Plan (Epic)          │
├───────────────────────────────────────┤
│                                        │
│  Input:                                │
│  - Local epic path                     │
│  - Business context (PRD)              │
│  - Technical context (SRS)             │
│                                        │
│  Analysis:                             │
│  - Feature risks                       │
│  - Critical scenarios                  │
│  - Technical dependencies              │
│  - Success criteria                    │
│                                        │
│  Output:                               │
│  - feature-test-plan.md (local)        │
│  - Comment in Epic (Jira)              │
│  - Epic updated with findings          │
│                                        │
└───────────────────────────────────────┘
        ↓
┌───────────────────────────────────────┐
│  [2] Acceptance Test Plan (Story)      │
├───────────────────────────────────────┤
│                                        │
│  Input:                                │
│  - Local story path                    │
│  - Feature test plan (parent Epic)     │
│  - Story Acceptance Criteria           │
│                                        │
│  Analysis:                             │
│  - Positive cases (happy path)         │
│  - Negative cases (edge cases)         │
│  - Input validations                   │
│  - Error states                        │
│                                        │
│  Output:                               │
│  - acceptance-test-plan.md (local)     │
│  - Comment in Story (Jira)             │
│  - Story refined with testable ACs     │
│                                        │
└───────────────────────────────────────┘
```

---

## Testing Levels (IQL Hierarchy)

```
┌─────────────────────────────────────────────────────────────┐
│                    SHIFT-LEFT TESTING                        │
│                    Step 1: Requirements Analysis             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   [1a] EPIC LEVEL (First)          [1b] STORY LEVEL (After) │
│   ────────────────────────         ─────────────────────────│
│                                                              │
│   FTP (Feature Test Plan)          ATP (Acceptance Test Plan)│
│   - Risks                          - Scenarios per AC        │
│   - Critical scenarios             - Happy path              │
│   - Dependencies                   - Edge cases              │
│   - Success criteria               - Error states            │
│                                                              │
│   feature-test-plan.md             acceptance-test-plan.md   │
│   (1 per Epic)                     (1 per Story)             │
│   Provides CONTEXT for →           ← Informed by FTP         │
│                                                              │
│                                        ↓                     │
│                              ATCs (Mid-Game Step 6)          │
│                              Documented in Jira              │
│                                        ↓                     │
│                              KATA Automation (Steps 8-10)    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

> **Important order:** FTP is created FIRST (macro context), ATP is created AFTER (informed by FTP). Both occur BEFORE sprint during refinement.

**Full traceability:** FTP (Epic) → ATP (Story) → ATCs (Jira) → KATA (Automation)

---

## Generated File Structure

```
.context/PBI/epics/
└── EPIC-{KEY}-{NUM}-{name}/
    ├── epic.md
    ├── feature-test-plan.md          # ← Generated by feature-test-plan.md
    └── stories/
        └── STORY-{KEY}-{NUM}-{name}/
            ├── story.md
            └── acceptance-test-plan.md  # ← Generated by acceptance-test-plan.md
```

---

## Jira-First Workflow

```
┌─────────────────────────────────────────────────────────────┐
│               JIRA-FIRST → LOCAL MIRROR                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Read local Epic/Story (get Jira Key)                    │
│  2. Read current Epic/Story from Jira (MCP)                 │
│  3. Analyze with PRD + SRS context                          │
│  4. Update Epic/Story in Jira with findings (MCP)           │
│  5. Add comment with test plan/cases (MCP)                  │
│  6. Generate local file (mirror)                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## AI Roles Assumed

| Prompt                    | Role                            |
| ------------------------- | ------------------------------- |
| `feature-test-plan.md`    | QA Lead, Test Strategy Expert   |
| `acceptance-test-plan.md` | QA Engineer, Test Case Designer |

---

## Required Tools

| Tool          | Purpose                        |
| ------------- | ------------------------------ |
| Atlassian MCP | Read/update Epics and Stories  |
| Filesystem    | Read context, write test plans |

---

## Output from This Stage

- **Per Epic:** `feature-test-plan.md` with testing strategy
- **Per Story:** `acceptance-test-plan.md` with acceptance test cases
- **In Jira:** Comments with test strategy and cases
- **Refinement:** More specific and testable ACs
- **Foundation for:** Stage 4 (Test Automation)

---

## Connection with Mid-Game Testing

The artifacts from this stage directly feed into **Mid-Game Testing (Steps 6-10)**:

| Stage 1 Artifact    | → Mid-Game        | Purpose                            |
| ------------------- | ----------------- | ---------------------------------- |
| ATP (Story-level)   | → ATCs (Step 6)   | Scenarios are formalized in Jira   |
| Critical scenarios  | → Candidates      | Prioritized for automation         |
| Acceptance Criteria | → KATA decorators | Traceability `@atc('PROJECT-XXX')` |

**See:** `docs/testing/test-architecture/mid-game-testing.md`

---

## Next Stage

With test plans and cases defined:

- Proceed to **Stage 2: Exploratory Testing**
- Execute manual validation
- Discover additional edge cases

---

## FAQ

**Q: Should I run this for ALL stories?**
A: Recommended for critical stories. Trivial stories can be skipped or have simplified test cases.

**Q: Are test cases executed in this stage?**
A: No. This stage is design only. Execution happens in Stage 2 (Exploratory) and Stage 4 (Automation).

**Q: What if requirements change?**
A: Re-run the prompt with updated context. Files will be overwritten.

---

## Related Documentation

- **Product Backlog:** `.context/PBI/`
- **Main README:** `.prompts/README.md`
- **Stage 2:** `.prompts/stage-2-execution/README.md`
- **Stage 3:** `.prompts/stage-3-reporting/README.md`
- **Stage 4:** `.prompts/stage-4-documentation/README.md`
- **Stage 5:** `.prompts/stage-5-automation/README.md`
- **Stage 6:** `.prompts/stage-6-regression/README.md`
