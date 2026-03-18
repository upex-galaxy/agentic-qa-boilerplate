# QA - Quality Engineering Guidelines

> **For**: QA Engineers (Manual/Exploratory Testing)
> **Stages**: 2 (Exploratory Testing), 3 (Test Documentation)

---

## Purpose

This folder contains the guidelines for **general Quality Engineering**, focused on:

- Exploratory Testing
- Test management in Jira
- Bug reporting
- Test documentation

**Note**: For Test Automation, see the `TAE/` folder.

---

## QA vs TAE

| Aspect           | QA (this folder)         | TAE                        |
| ---------------- | ------------------------ | -------------------------- |
| **Focus**        | Manual Testing           | Automated Testing          |
| **Stages**       | 2, 3                     | 4                          |
| **Activities**   | Exploratory, bugs, docs  | E2E, Integration, CI/CD    |
| **Tools**        | Jira, manual browser     | Playwright, KATA framework |

---

## Contents

| File                      | Purpose                                |
| ------------------------- | -------------------------------------- |
| `exploratory-testing.md`    | Exploratory testing principles                          |
| `jira-test-management.md`  | Test management in Jira                                 |
| `spec-driven-testing.md`   | Spec-driven testing principle                           |
| `atc-definition-strategy.md` | **How to define, name, and document ATCs** (QA↔TAE bridge) |

**Note**: For `data-testid` usage in automation, see `TAE/data-testid-usage.md`.

---

## Core Principle: Spec-Driven Testing

Testing in this project follows the **Spec-Driven Testing** principle:

1. **Test from Specs**: All tests come from a specification
2. **User Story = Test Source**: The story defines what to test
3. **AC = Test Criteria**: Acceptance criteria are the test criteria
4. **Traceability**: Each test maps to a specification

---

## When to Read These Guidelines

The AI MUST read these guidelines **BEFORE**:

- Performing exploratory testing
- Reporting bugs
- Documenting tests in Jira
- Prioritizing tests for automation

---

## QA Workflow

See the project's prompts directory for workflow guides.

---

**Last Updated**: 2026-02-12
