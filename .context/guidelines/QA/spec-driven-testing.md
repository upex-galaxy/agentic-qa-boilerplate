# Spec-Driven Testing

> **For**: QA Engineers
> **Principle**: Specify first, then test

---

## The Principle

**Spec-Driven Testing** is the complement to Spec-Driven Development. Just as development is guided by specifications, testing is too:

- **User Story** → Defines WHAT to test
- **Acceptance Criteria** → Defines the SUCCESS criteria
- **Test Cases** → Defines HOW to test

---

## The 4 Pillars

### 1. Test from Specs

```
❌ BAD: "I'm going to test the login and see what I find"
✅ GOOD: "I'm going to verify that STORY-XXX meets its acceptance criteria"
```

Before testing:

- Read the complete **story**
- Understand the **acceptance criteria**
- Review the documented **test cases**

### 2. Traceability

```
❌ BAD: Bug: "The button doesn't work"
✅ GOOD: Bug: "AC-3 of STORY-XXX fails: The submit button doesn't respond"
```

Every bug must:

- Reference the related story
- Indicate which acceptance criteria fails
- Have clear reproduction steps

### 3. Coverage from Requirements

```
❌ BAD: "I tested everything I could think of"
✅ GOOD: "I verified each AC and its documented edge cases"
```

Coverage is measured by:

- % of acceptance criteria verified
- % of test cases executed
- Edge cases covered

### 4. Exploratory with Purpose

```
❌ BAD: Random clicking through the application
✅ GOOD: Focused exploration on the story's risk areas
```

Exploratory testing must:

- Start from the story and its ACs
- Look for undocumented edge cases
- Document findings with traceability

---

## Spec-Driven Testing Workflow

```
Specification              Testing                    Feedback
     │                         │                          │
     ▼                         ▼                          ▼
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Story  │ → │  Test   │ → │ Execute │ → │ Report  │
│   +AC   │    │  Cases  │    │ & Find  │    │ & Doc   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
  Phase 4        Phase 5        Stage 2       Stage 3
```

**Testing DOES NOT invent what to test** - the specification already defines it.

---

## Relationship with Spec-Driven Development

| Development (SDD)           | Testing (SDT)          |
| --------------------------- | ---------------------- |
| Story → Implementation Plan | Story → Test Cases     |
| AC → Code                   | AC → Test Criteria     |
| Plan → Code                 | Test Cases → Execution |
| Code Review                 | Test Review            |

**They are two sides of the same coin**: Specification first.

---

## Benefits

| Aspect           | Without SDT         | With SDT              |
| ---------------- | ------------------- | --------------------- |
| **Focus**        | "What do I test?"   | Clear Story + AC      |
| **Coverage**     | Subjective          | Measurable by AC      |
| **Bugs**         | "Something's wrong" | Traceable to spec     |
| **Prioritization** | By intuition      | By impact on AC       |

---

## Anti-Patterns

### ❌ Random Testing

```
"I'm going to click around and see what happens"
```

**Problem**: No focus, no measurable coverage, no traceability.

### ❌ Test Without Spec

```
"I didn't read the story but I'll test anyway"
```

**Problem**: How do you know if something is a bug or expected behavior?

### ❌ Bug Without Context

```
"Bug: The button doesn't work"
```

**Problem**: Without reference to story/AC, the dev doesn't know what it should do.

---

## SDT Checklist

Before testing:

- [ ] Read the complete story
- [ ] Understand all acceptance criteria
- [ ] Reviewed the documented test cases
- [ ] Have staging environment ready

During testing:

- [ ] Verify each AC systematically
- [ ] Document findings with reference to specs
- [ ] Look for edge cases beyond those documented
- [ ] Capture evidence (screenshots, videos)

After testing:

- [ ] All ACs verified ✓/✗
- [ ] Bugs reported with traceability
- [ ] Tests documented for automation
- [ ] Test prioritization for TAE

---

## See Also

- `exploratory-testing.md` - Exploratory testing techniques
- `jira-test-management.md` - Jira test management
- `.context/guidelines/TAE/data-testid-usage.md` - data-testid usage

---

**Last Updated**: 2026-02-12
