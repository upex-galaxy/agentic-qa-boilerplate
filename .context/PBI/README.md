# Product Backlog Items (PBI)

This directory contains the User Stories and PBIs for the testing project.

## Structure

```
PBI/
├── README.md                  # This file
├── PROJ-1-feature-name.md     # User Story with project prefix
├── PROJ-2-another-feature.md
└── ...
```

## File Format

Each PBI should follow this format:

```markdown
# [PROJ-ID] User Story Title

## User Story
As a [role]
I want [action]
So that [benefit]

## Acceptance Criteria
- [ ] AC1: Criteria description
- [ ] AC2: Criteria description

## Test Scenarios
| ID | Scenario | Expected Result | Priority |
|----|----------|-----------------|----------|
| TS-001 | ... | ... | High |

## Notes
Additional information relevant for testing.
```

## Usage with AI

Files in this directory are used as context by the AI to:
- Generate test cases based on ACs
- Create page object components
- Design precondition flows
- Document test scenarios

## Conventions

- **Prefix**: Use the project prefix (e.g., `MYM-`, `UPEX-`, `PROJ-`)
- **Names**: Use kebab-case for file names
- **Status**: Mark ACs as `[x]` when covered by tests
