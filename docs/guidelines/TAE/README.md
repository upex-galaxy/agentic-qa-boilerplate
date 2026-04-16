# Test Automation Engineering (TAE)

**KATA Architecture** - Component Action Test Architecture

---

## AI Entry Point

**For AI agents**: Start here → **`kata-ai-index.md`**

Quick orientation, critical rules, and task-based navigation.

**For implementing ATCs**: See the project's prompts directory

---

## Directory Contents

### Reference Documentation

| File                      | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `kata-ai-index.md`        | **AI Entry Point** - Quick reference for AI agents |
| `kata-architecture.md`    | Architecture layers (TypeScript implementation)    |
| `test-design-principles.md` | **Source of truth** for ATC rules and test design |
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
3. Run `bun run kata:manifest` to see existing components

### For QA Engineers

1. Read `kata-architecture.md` to understand KATA
2. Read `automation-standards.md` for coding rules
4. Reference `tms-integration.md` for Jira/Xray setup
5. Reference `ci-cd-integration.md` for CI/CD

---

## From QA to TAE

The bridge between QA test documentation and KATA automation:

```
QA (Stage 3: Test Documentation)          TAE (Stage 4: Automation)
─────────────────────────────             ──────────────────────────
Test Cases in Jira (TK-XXX)     ───►      @atc('TK-XXX') in Components
  └── Acceptance criteria                    └── Action + Verification + Assertions

E2E/Integration tickets (TK-YYY) ───►    test('TK-YYY: should...') in Test Files
  └── Complete user flow                     └── Combines multiple ATCs
```

- QA creates **Acceptance Test Cases** in Jira during exploratory testing and test documentation
- TAE implements those test cases as **ATCs** in KATA components via `@atc('TK-XXX')`
- E2E and Integration tests combine multiple ATCs into complete flows
- Results sync back to Jira/Xray via TMS integration

**Related files:**
- **ATC Definition Strategy** (the bridge document): `docs/guidelines/QA/atc-definition-strategy.md`
- QA test documentation: `docs/guidelines/QA/jira-test-management.md`
- TMS integration: `tms-integration.md`
- Test design principles: `test-design-principles.md`
- IQL Methodology: `docs/methodology/IQL-methodology.md`

---

## References

- **AI Guide**: `kata-ai-index.md`
- **Fundamentals**: `docs/methodology/kata-fundamentals.md` (conceptual reference only)
- **DI Strategy**: `docs/testing/automation/dependency-injection.md` (Playwright lazy loading)
- **Component Catalog**: `kata-manifest.json` (run `bun run kata:manifest`)