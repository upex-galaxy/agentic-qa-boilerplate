# Phase 2: Architecture (PRD & SRS Discovery)

> **Purpose**: Discover and document the product requirements and technical specifications of an existing project.
> **Adaptation**: Original prompts DESIGN architecture. These DISCOVER existing architecture.

## Overview

Phase 2 is the most comprehensive discovery phase, producing two key document sets:

1. **PRD (Product Requirements Document)** → `.context/PRD/`
   - What the product does (user-facing)
   - Who uses it
   - How users interact with it

2. **SRS (Software Requirements Specification)** → `.context/SRS/`
   - How it's built (technical)
   - API contracts
   - Architecture patterns

## Prompts in This Phase

### PRD Prompts (User-Facing)

| Order | Prompt                     | Purpose                        | Output                              |
| ----- | -------------------------- | ------------------------------ | ----------------------------------- |
| 1     | `prd-executive-summary.md` | Product overview and purpose   | `.context/PRD/executive-summary.md` |
| 2     | `prd-user-personas.md`     | User types and characteristics | `.context/PRD/user-personas.md`     |
| 3     | `prd-user-journeys.md`     | Key user flows                 | `.context/PRD/user-journeys.md`     |
| 4     | `prd-feature-inventory.md` | Existing features catalog      | `.context/PRD/feature-inventory.md` |

### SRS Prompts (Technical)

| Order | Prompt                        | Purpose                      | Output                                 |
| ----- | ----------------------------- | ---------------------------- | -------------------------------------- |
| 5     | `srs-architecture-specs.md`   | System architecture          | `.context/SRS/architecture-specs.md`   |
| 6     | `srs-api-contracts.md`        | API endpoints and contracts  | `.context/SRS/api-contracts.md`        |
| 7     | `srs-functional-specs.md`     | Feature specifications       | `.context/SRS/functional-specs.md`     |
| 8     | `srs-non-functional-specs.md` | NFRs (performance, security) | `.context/SRS/non-functional-specs.md` |

## Prerequisites

- [ ] Phase 1 completed (`.context/idea/` populated)
- [ ] Access to source code (frontend & backend)
- [ ] (Optional) Access to database schema
- [ ] (Optional) Access to OpenAPI/Swagger specs

## Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│              Phase 1 Complete                                │
│              .context/idea/ populated                        │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌───────────────────────┐       ┌───────────────────────┐
│   PRD DISCOVERY       │       │   SRS DISCOVERY       │
│   (can run parallel)  │       │   (can run parallel)  │
├───────────────────────┤       ├───────────────────────┤
│ 1. executive-summary  │       │ 5. architecture-specs │
│ 2. user-personas      │       │ 6. api-contracts      │
│ 3. user-journeys      │       │ 7. functional-specs   │
│ 4. feature-inventory  │       │ 8. non-functional     │
└───────────────────────┘       └───────────────────────┘
            │                               │
            └───────────────┬───────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 READY FOR PHASE 3                            │
│           (Infrastructure Discovery)                         │
└─────────────────────────────────────────────────────────────┘
```

## Discovery Sources by Prompt

### PRD Sources

| Prompt            | Primary Sources                             |
| ----------------- | ------------------------------------------- |
| Executive Summary | README, landing page, marketing             |
| User Personas     | Auth code (roles), UI variations, analytics |
| User Journeys     | Route definitions, UI flows, navigation     |
| Feature Inventory | API endpoints, UI components, feature flags |

### SRS Sources

| Prompt           | Primary Sources                           |
| ---------------- | ----------------------------------------- |
| Architecture     | Folder structure, dependencies, configs   |
| API Contracts    | OpenAPI spec, route handlers, controllers |
| Functional Specs | Service logic, validators, tests          |
| Non-Functional   | Load tests, security configs, monitoring  |

## Key Differences from Creation Prompts

| Original (Create)      | Adapted (Discover)                          |
| ---------------------- | ------------------------------------------- |
| "Design user personas" | "Identify user types from code/UI"          |
| "Plan user journeys"   | "Map existing flows from routes/components" |
| "Define API contracts" | "Extract contracts from existing endpoints" |
| "Specify NFRs"         | "Identify implemented NFRs from configs"    |

## Parallel Execution

PRD and SRS prompts can be executed in parallel since they discover different aspects:

```
Recommended parallel execution:
├── Stream 1: PRD prompts (1 → 2 → 3 → 4)
└── Stream 2: SRS prompts (5 → 6 → 7 → 8)
```

## Output Quality Checklist

### PRD Documents Should:

- [ ] Be understandable by non-technical stakeholders
- [ ] Focus on WHAT, not HOW
- [ ] Include evidence of where info was discovered
- [ ] Highlight gaps needing user clarification

### SRS Documents Should:

- [ ] Be precise and technical
- [ ] Include code references (file:line)
- [ ] Use diagrams where helpful (Mermaid)
- [ ] Map to PRD features

---

**Previous Phase**: [Phase 1 - Constitution](.prompts/discovery/phase-1-constitution/)
**Next Phase**: [Phase 3 - Infrastructure](.prompts/discovery/phase-3-infrastructure/)
