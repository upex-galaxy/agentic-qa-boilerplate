# Product Backlog Items (PBI)

This directory contains User Stories, module-level test planning, and automation tracking for the testing project.

## Structure

```
PBI/
├── README.md                           # This file
├── templates/                          # Templates for per-module structure
│   ├── module-context-template.md      # Module technical context
│   ├── ROADMAP-template.md             # Module roadmap with phases
│   ├── PROGRESS-template.md            # Cross-session progress tracker
│   └── SESSION-PROMPT-template.md      # @-loadable AI session starter (fill placeholders per module)
│
├── ── PER-STORY (simple) ────────────
├── {TICKET-ID}-feature-name.md         # User Story with ticket ID
│
├── ── PER-MODULE (complex) ──────────
├── {module-name}/                      # Module-level testing folder
│   ├── {module}-test-plan.md           # Master module test plan
│   ├── TK-{id}-{feature}/             # Per-ticket context
│   │   ├── context.md                  # AC summary, code locations, test data
│   │   └── evidence/                   # Screenshots, logs (gitignored)
│   └── test-specs/                     # Unified test specifications + implementation
│       ├── ROADMAP.md                  # Roadmap with phases + dependencies
│       ├── PROGRESS.md                 # Session-by-session progress tracker
│       ├── SESSION-PROMPT.md           # @-loadable session starter (load via @path)
│       └── {PREFIX}-T01-{name}/        # Ticket directory (one per functional area)
│           ├── spec.md                 # Business-level: TCs in Gherkin
│           ├── implementation-plan.md  # Technical-level: KATA components, fixtures
│           └── atc/                    # Individual ATC specs (for complex ATCs)
│               └── {TICKET-ID}-{name}.md
│
├── ── REAL EXAMPLE ──────────────────
└── auth/                               # Complete example: Auth module
    ├── auth-test-plan.md
    └── test-specs/
        ├── ROADMAP.md
        ├── PROGRESS.md
        ├── SESSION-PROMPT.md
        └── AUTH-T01-user-session-validation/
            ├── spec.md
            ├── implementation-plan.md
            └── atc/
                ├── UPEX-101-authenticate-successfully.md
                └── UPEX-105-login-successfully.md
```

## When to Use Each Structure

| Structure | When | Example |
|-----------|------|---------|
| **Per-Story** | Single story, few TCs, no cross-session tracking needed | Bug fix, small feature |
| **Per-Module** | Module with multiple tickets, many TCs, multi-session automation | Dashboard, checkout flow, admin panel |

## Templates

Templates are provided for the per-module structure. Use them as reference when generating your module folder contents.

| Template | Purpose | Copy To |
|----------|---------|---------|
| `module-context-template.md` | Technical context: routes, APIs, DB, business rules | `{module}/` |
| `ROADMAP-template.md` | Roadmap with phases, dependencies, TC counts | `{module}/test-specs/ROADMAP.md` |
| `PROGRESS-template.md` | Track progress across AI sessions | `{module}/test-specs/PROGRESS.md` |
| `SESSION-PROMPT-template.md` | Session starter -- fill placeholders, then load via `@` | `{module}/test-specs/SESSION-PROMPT.md` |

### Workflow

```
1. Create module folder: .context/PBI/{module-name}/
2. Copy templates into the folder structure above
3. Fill in module-context and roadmap
4. Load SESSION-PROMPT.md via @ at the start of each AI session
   (or load the /test-automation skill for full orchestration)
5. AI updates PROGRESS.md at end of each session
```

## Real Example: Auth Module

The `auth/` directory contains a complete, real example of the per-module structure applied to the authentication module. Use it as a reference for:

| Document | Path | Purpose |
|----------|------|---------|
| Master test plan | `auth/auth-test-plan.md` | How the module was analyzed |
| Business spec | `auth/test-specs/AUTH-T01-.../spec.md` | TC definitions in Gherkin |
| Implementation plan | `auth/test-specs/AUTH-T01-.../implementation-plan.md` | KATA components and architecture |
| ATC spec (API) | `auth/test-specs/AUTH-T01-.../atc/UPEX-101-*.md` | Individual ATC contract |
| ATC spec (UI) | `auth/test-specs/AUTH-T01-.../atc/UPEX-105-*.md` | Individual ATC contract |

## Test Specs: Unified Documentation

Each ticket directory in `test-specs/` contains **both** levels of documentation:

| File | Level | Created By | When |
|------|-------|------------|------|
| `spec.md` | Business (QUE testear) | Test-Manager Agent | During test planning |
| `implementation-plan.md` | Technical (COMO implementar) | Test-Automation Agent | Before coding |
| `atc/*.md` | ATC contract (method spec) | Test-Automation Agent | For complex ATCs only |

## Per-Story File Format

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
- Track automation progress across sessions
- Resume work without losing context

## Conventions

- **Prefix**: Use your Jira project key as prefix (e.g., `UPEX-`, `MYM-`, `QA-`)
- **Names**: Use kebab-case for file names
- **Status**: Mark ACs as `[x]` when covered by tests
- **Evidence**: Add `evidence/` to `.gitignore` (screenshots, logs are ephemeral)
