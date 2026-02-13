# Test Automation Engineering (TAE)

**KATA Framework** - Komponent Action Test Architecture

---

## AI Entry Point

**For AI agents**: Start here → **`kata-ai-index.md`**

Quick orientation, critical rules, and task-based navigation.

**For implementing ATCs**: See **`.prompts/stage-4-automation/`**

---

## Directory Contents

### Reference Documentation

| File                      | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `kata-ai-index.md`        | **AI Entry Point** - Quick reference for AI agents |
| `kata-architecture.md`    | Architecture layers (TypeScript implementation)    |
| `automation-standards.md` | Code standards, naming, anti-patterns              |
| `typescript-patterns.md`  | TypeScript coding patterns and DRY principles      |
| `openapi-integration.md`  | OpenAPI integration and MCP setup                  |
| `test-data-management.md` | Test data strategies                               |
| `tms-integration.md`      | Jira/Xray integration                              |
| `ci-cd-integration.md`    | GitHub Actions pipelines                           |
| `data-testid-usage.md`    | How to USE data-testid in tests                    |

### Conceptual Deep Dives

| File                                            | Purpose                                    |
| ----------------------------------------------- | ------------------------------------------ |
| `docs/methodology/kata-fundamentals.md`         | KATA philosophy and conceptual foundations |
| `docs/testing/automation/dependency-injection.md` | DI architecture, Playwright lazy loading   |

### Auto-Generated

| File                        | Purpose                   |
| --------------------------- | ------------------------- |
| `kata-manifest.json` (root) | Component and ATC catalog |

Generate with: `bun run kata:manifest`

---

## Quick Reference

### For AI Agents

1. Read `kata-ai-index.md` for orientation
2. Follow `.prompts/stage-4-automation/` prompts for implementation
3. Run `bun run kata:manifest` to see existing components

### For QA Engineers

1. Read `kata-architecture.md` to understand KATA
2. Read `automation-standards.md` for coding rules
3. Follow `.prompts/stage-4-automation/` prompts to create components
4. Reference `tms-integration.md` for Jira/Xray setup
5. Reference `ci-cd-integration.md` for CI/CD

---

## References

- **AI Guide**: `kata-ai-index.md`
- **AI Workflow**: `.prompts/stage-4-automation/`
- **Framework Adaptation**: `.prompts/setup/kata-framework-adaptation.md`
- **Fundamentals**: `docs/methodology/kata-fundamentals.md` (conceptual reference only)
- **DI Strategy**: `docs/testing/automation/dependency-injection.md` (Playwright lazy loading)
- **Component Catalog**: `kata-manifest.json` (run `bun run kata:manifest`)
