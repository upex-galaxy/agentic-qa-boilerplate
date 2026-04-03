# Utilities

> **Purpose**: Reusable helper prompts for common development tasks.
> **When to use**: As needed during development workflow.

## Overview

Utility prompts provide assistance for common tasks that can be executed multiple times during development. Unlike setup prompts (one-time) or discovery prompts (project onboarding), utilities are designed for repeated use.

This includes:

- **Context Generation**: Create test guides and documentation
- **Project Documentation**: Generate/update README and project memory files
- **Git Workflow**: Manage commits, push, PRs, and resolve conflicts

## Prompts in This Folder

| Prompt | Purpose | When to Use |
|--------|---------|-------------|
| **Context Generation** | | |
| `project-test-guide.md` | Guide on what to test | After discovery |
| **Documentation** | | |
| `context-engineering-setup.md` | Generate README + update CLAUDE.md | After discovery or adaptation |
| **Test Verification** | | |
| `test-execution-breakdown.md` | Human-readable breakdown of test execution | After implementing/reviewing tests |
| **Git Workflow** | | |
| `git-flow.md` | Manage commits, push, and PRs | During development cycle |
| `git-conflict-fix.md` | Resolve Git conflicts and errors | When Git problems occur |

---

## Context Generation

### `project-test-guide.md`

Generates a conversational guide on what to test:

- Scenarios for each business flow
- State machine validations
- Edge cases and integration scenarios
- Prioritization recommendations

**Prerequisite**: Discovery completed + `business-data-map.md`
**Output**: `.context/project-test-guide.md`

**Use when**:
- Discovery is complete
- Before QA planning
- Onboarding new testers

---

## Documentation

### `context-engineering-setup.md`

Generates professional project documentation:

- Creates/updates `README.md` with test automation info
- Creates/updates project memory file (`CLAUDE.md`, `GEMINI.md`, etc.)
- Documents test coverage, tech stack, and scripts
- Validates security (no secrets exposed)

**Use when**:
- Discovery phases are complete
- After KATA framework adaptation
- When project documentation needs refresh

---

## Test Verification

### `test-execution-breakdown.md`

Generates a human-readable pseudo-code breakdown of automated tests:

- Shows exactly what each test validates and which ATCs run
- Details assertions (positive and negative) per ATC
- Maps data flow between tests (shared setup, reused variables)
- Includes summary table and reused variables table

**Use when**:
- After writing or updating ATCs and test files
- Before creating a PR (include breakdown in PR description)
- When reviewing someone else's test implementation
- When onboarding someone to understand test suite coverage

---

## Git Workflow

### `git-flow.md`

Intelligent Git workflow assistant:

- Analyzes repository state
- Groups changes by context
- Proposes semantic commits
- Manages push and PR creation

**Use when**:
- Ready to commit changes
- Need to create a Pull Request
- Want guided Git workflow

### `git-conflict-fix.md`

Specialized Git troubleshooter:

- Diagnoses Git problems
- Resolves merge conflicts
- Handles rebase issues
- Fixes push rejections

**Use when**:
- Encountering Git errors
- Merge conflicts need resolution
- Understanding what went wrong

---

## Moved to Other Directories

Some prompts have been reorganized:

| Prompt | New Location | Reason |
|--------|--------------|--------|
| `kata-framework-setup.md` | `setup/kata-framework-adaptation.md` | Renamed + moved to setup (one-time) |
| `api-architecture.md` | `discovery/api-architecture.md` | Discovery prompt (one-time) |
| `business-data-map.md` | `discovery/business-data-map.md` | Discovery prompt (one-time) |

---

## Usage Pattern

```
Development Task
       │
       ▼
┌─────────────────────────────────┐
│ Is it documentation setup?      │
└──────────┬──────────────────────┘
           │
    YES ───┼─── NO
           │     │
           ▼     ▼
   context-       ┌──────────────────────────┐
   engineering-   │ Need testing guide?      │
   setup.md       └──────────┬───────────────┘
                             │
                      YES ───┼─── NO
                             │     │
                             ▼     ▼
                    project-test- ┌──────────────────────┐
                    guide.md      │ Is it Git related?   │
                                  └──────────┬───────────┘
                                             │
                                      YES ───┼
                                             │
                        ┌────────────────────┴──────────────┐
                        │                                   │
                 Normal workflow                     Problem/Error
                        │                                   │
                        ▼                                   ▼
                  git-flow.md                     git-conflict-fix.md
```

---

## Related Directories

| Directory | Purpose |
|-----------|---------|
| `setup/` | One-time setup prompts (KATA adaptation) |
| `discovery/` | Project onboarding prompts (phases 1-4, context generators) |
| `stage-1-planning/` | QA workflow - test planning |
| `stage-2-execution/` | QA workflow - test execution |
| `stage-3-reporting/` | QA workflow - test reporting + bugs |
| `stage-4-documentation/` | QA workflow - test documentation + prioritization |
| `stage-5-automation/` | QA workflow - test automation (KATA) |
| `stage-6-regression/` | QA workflow - regression execution |

---

**Last Updated**: 2026-04-03
