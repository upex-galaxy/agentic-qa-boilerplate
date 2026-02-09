# Utilities

> **Purpose**: Helper prompts for common development tasks.
> **When to use**: As needed during development workflow.

## Overview

Utility prompts provide assistance for common tasks that aren't part of the main QA workflow but are frequently needed during development.

## Prompts in This Folder

| Prompt                     | Purpose                              | When to Use                   |
| -------------------------- | ------------------------------------ | ----------------------------- |
| `kata-framework-setup.md`  | Setup KATA test automation framework | New projects or reconstruction|
| `framework-doc-setup.md`   | Generate README + update CLAUDE.md   | After discovery complete      |
| `git-flow.md`              | Manage commits, push, and PRs        | During development cycle      |
| `git-conflict-fix.md`      | Resolve Git conflicts and errors     | When Git problems occur       |

## Prompt Categories

### Framework Setup

**`kata-framework-setup.md`**

Sets up the complete KATA (Komponent Action Test Architecture) framework:

- Downloads core files from template repository
- Creates directory structure
- Installs dependencies
- Configures code quality tools (Prettier, Husky, lint-staged)
- Generates domain-specific components

**Use when:**
- Starting test automation in a new project
- Reconstructing KATA framework after cloning

### Documentation

**`framework-doc-setup.md`**

Generates professional project documentation:

- Creates/updates README.md with test automation info
- Updates CLAUDE.md with project-specific context
- Documents test coverage, tech stack, and scripts

**Use when:**
- Discovery phases (1-3) are complete
- KATA framework is configured
- Ready to formalize project documentation

### Git Workflow

**`git-flow.md`**

Intelligent Git workflow assistant:

- Analyzes repository state
- Groups changes by context
- Proposes semantic commits
- Manages push and PR creation

**Use when:**
- Ready to commit changes
- Need to create a Pull Request
- Want guided Git workflow

**`git-conflict-fix.md`**

Specialized Git troubleshooter:

- Diagnoses Git problems
- Resolves merge conflicts
- Handles rebase issues
- Fixes push rejections

**Use when:**
- Encountering Git errors
- Merge conflicts need resolution
- Understanding what went wrong

## Usage Pattern

```
Development Task
       │
       ▼
┌──────────────────────┐
│ Is it framework      │
│ setup?               │
└──────────┬───────────┘
           │
    YES ───┼─── NO
           │     │
           ▼     ▼
     kata-       ┌──────────────────────┐
     framework   │ Is it documentation? │
     -setup.md   └──────────┬───────────┘
                            │
                     YES ───┼─── NO
                            │     │
                            ▼     ▼
                      framework-  ┌──────────────────────┐
                      doc-        │ Is it Git related?   │
                      setup.md    └──────────┬───────────┘
                                             │
                                      YES ───┼
                                             │
                            ┌────────────────┴────────────────┐
                            │                                 │
                     Normal workflow                   Problem/Error
                            │                                 │
                            ▼                                 ▼
                      git-flow.md                   git-conflict-fix.md
```

## Best Practices

1. **kata-framework-setup.md**: Run once per project, don't overwrite existing files
2. **framework-doc-setup.md**: Run after discovery is complete for accurate documentation
3. **git-flow.md**: Use for organized, semantic commits
4. **git-conflict-fix.md**: Read explanations to learn and prevent future issues

---

**Related**: [Context Generators](../context-generators/) | [Discovery Phases](../discovery/)
