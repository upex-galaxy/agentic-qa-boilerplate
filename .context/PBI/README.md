# Product Backlog Items (PBI)

This directory contains the User Stories and PBIs for the testing project.

## Structure

```
PBI/
├── README.md                  # This file
├── {TICKET-ID}-feature-name.md # User Story with ticket ID (e.g., UPEX-101-login-flow.md)
├── tests/                     # Test implementation plans and ATC specs
│   ├── integration/           # Integration test plans
│   │   └── {TICKET-ID}-{brief-title}/
│   │       └── test-implementation-plan.md
│   ├── e2e/                   # E2E test plans
│   │   └── {TICKET-ID}-{brief-title}/
│   │       └── test-implementation-plan.md
│   └── atc/                   # ATC specification documents
│       └── {module-name}/
│           └── {TICKET-ID}-{brief-title}.md
└── ...
```

### Gold Standard References

The `tests/` subdirectory contains gold standard examples of completed plans:

| Document | Path | Purpose |
|----------|------|---------|
| Integration test plan | `tests/integration/UPEX-100-user-session-validation/test-implementation-plan.md` | Reference for test implementation plans |
| ATC spec (API) | `tests/atc/auth/UPEX-101-authenticate-successfully.md` | Reference for API ATC specifications |
| ATC spec (UI) | `tests/atc/auth/UPEX-105-login-successfully.md` | Reference for UI ATC specifications |

## File Format

Each PBI should follow this format:

```markdown
# {TICKET-ID} User Story Title

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

- **Prefix**: Use your Jira project key as prefix (e.g., `UPEX-`, `MYM-`, `QA-`)
- **Names**: Use kebab-case for file names
- **Status**: Mark ACs as `[x]` when covered by tests
