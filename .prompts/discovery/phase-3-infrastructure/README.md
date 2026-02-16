# Phase 3: Infrastructure Discovery

> **Purpose**: Document the existing infrastructure, deployment, and DevOps setup.
> **Adaptation**: Original prompts SETUP infrastructure. These DISCOVER existing infrastructure.

## Overview

Phase 3 focuses on understanding HOW the project is deployed and operated:

- Backend services and configuration
- Frontend build and hosting
- CI/CD pipelines
- Cloud infrastructure
- Environment management

## Prompts in This Phase

| Order | Prompt                      | Purpose                        | Output                           |
| ----- | --------------------------- | ------------------------------ | -------------------------------- |
| 1     | `backend-discovery.md`      | Document backend setup         | Updates `.context/SRS/`          |
| 2     | `frontend-discovery.md`     | Document frontend setup        | Updates `.context/SRS/`          |
| 3     | `infrastructure-mapping.md` | Map cloud/CI/CD infrastructure | `.context/SRS/infrastructure.md` |

> **Note:** After completing Phase 3, run `.prompts/utilities/context-engineering-setup.md` to generate project documentation.

## Prerequisites

- [ ] Phase 2 completed (`.context/SRS/` exists)
- [ ] Access to repository (CI/CD configs)
- [ ] (Optional) Access to cloud provider dashboards
- [ ] (Optional) Access to deployment logs

## Discovery Sources

### Backend Discovery

```
- package.json scripts
- Docker/docker-compose files
- Environment variable templates
- Database migration files
- Server configuration
```

### Frontend Discovery

```
- Build configuration (next.config.js, vite.config.ts)
- Bundle analysis
- Static asset handling
- Environment variables (NEXT_PUBLIC_*)
```

### Infrastructure Discovery

```
- .github/workflows/ (GitHub Actions)
- azure-pipelines.yml (Azure DevOps)
- Dockerfile, docker-compose.yml
- terraform/, serverless.yml (IaC)
- vercel.json, netlify.toml
```

## Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│              Phase 2 Complete                                │
│              .context/SRS/ populated                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  1. backend-discovery.md                                     │
│     - Analyze server setup                                   │
│     - Document dependencies                                  │
│     - Map environment requirements                           │
│     → Updates: .context/SRS/architecture-specs.md            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. frontend-discovery.md                                    │
│     - Analyze build configuration                            │
│     - Document static assets                                 │
│     - Map client environment                                 │
│     → Updates: .context/SRS/architecture-specs.md            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. infrastructure-mapping.md                                │
│     - Map CI/CD pipelines                                    │
│     - Document deployment process                            │
│     - Identify environments                                  │
│     → Creates: .context/SRS/infrastructure.md                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  (Optional) context-engineering-setup.md                     │
│  Located in: .prompts/utilities/context-engineering-setup.md │
│  → Generates: README.md + updates CLAUDE.md                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 READY FOR PHASE 4                            │
│           (Backlog Specification)                            │
└─────────────────────────────────────────────────────────────┘
```

## Key Differences from Setup Prompts

| Original (Setup)  | Adapted (Discovery)                  |
| ----------------- | ------------------------------------ |
| "Configure CI/CD" | "Map existing CI/CD pipelines"       |
| "Set up Docker"   | "Document existing containerization" |
| "Deploy to cloud" | "Identify deployment targets"        |

## When to Skip This Phase

You may abbreviate this phase if:

- Project is simple (single deployment target)
- No custom infrastructure (pure Vercel/Netlify)
- Infrastructure is well-documented elsewhere

In these cases, create a minimal `.context/SRS/infrastructure.md` with:

- Hosting provider
- Deployment method
- Environment URLs

---

**Previous Phase**: [Phase 2 - Architecture](.prompts/discovery/phase-2-architecture/README.md)
**Next Phase**: [Phase 4 - Specification](.prompts/discovery/phase-4-specification/README.md)
