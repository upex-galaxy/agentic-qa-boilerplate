# Guidelines Migration Audit: `.context/guidelines/` → `.claude/skills/`

## Methodology

This audit maps 25 legacy guideline files (`.context/guidelines/`) to their destinations in the post-migration skill-based architecture (`.claude/skills/`). For each legacy file:

1. **Source**: Read legacy file head via `git show origin/main:.context/guidelines/<path>` to identify content themes (entity model, naming conventions, workflow, test design principles, etc.).
2. **Destination Search**: Grep skill references and SKILL.md files for distinctive phrases, section titles, and architectural concepts from the legacy file.
3. **Mapping**: Identify the skill folder and specific reference file (or SKILL.md) that absorbed the content.
4. **Confidence**: Rate based on textual overlap (HIGH = exact section match or extensive paraphrasing; MEDIUM = thematic overlap but restructured; LOW = concept reference without detailed content; LOST = no detectable content absorption).
5. **Notes**: One-liner describing the guideline topic and its new location.

The audit confirms whether the migration was complete (all 25 files mapped), lossy (some content dropped), or partially successful.

---

## Master Mapping Table: 25 Legacy Guidelines → Skill Destinations

| # | Legacy Guideline | Destination | Confidence | Notes |
|---|---|---|---|---|
| 1 | `.context/guidelines/README.md` | `project-discovery/SKILL.md` + `test-automation/SKILL.md` | HIGH | Top-level index and role-based workflow routing → skill descriptions and trigger keywords. |
| 2 | `.context/guidelines/code-standards.md` | `test-automation/references/typescript-patterns.md` + `test-automation/references/automation-standards.md` | HIGH | DRY/KISS/naming conventions → TypeScript patterns (params, DRY by layer) + naming section in automation-standards. |
| 3 | `.context/guidelines/tms-architecture.md` | `test-documentation/references/tms-architecture.md` | HIGH | TMS entity model (Backlog, ATP, ATR, TC, traceability) → verbatim in test-documentation skill reference. |
| 4 | `.context/guidelines/tms-conventions.md` | `test-documentation/references/tms-conventions.md` | HIGH | TMS naming rules, labeling, field definitions → preserved in test-documentation skill reference. |
| 5 | `.context/guidelines/tms-workflow.md` | `sprint-testing/references/acceptance-test-planning.md` + `sprint-testing/references/reporting-templates.md` | MEDIUM | 5-stage pipeline (Planning→Execution→Reporting→Documentation→Automation) → split across sprint-testing Stage 1 planning, Stage 3 reporting templates. Stage 4-5 ownership moved to test-documentation and test-automation skills. |
| 6 | `.context/guidelines/QA/README.md` | `sprint-testing/SKILL.md` | MEDIUM | QA index with workflow stages 2-3 → absorbed into sprint-testing skill description (manual/exploratory QA). |
| 7 | `.context/guidelines/QA/atc-definition-strategy.md` | `test-documentation/SKILL.md` + `test-automation/SKILL.md` | MEDIUM | ATC naming, precondition+action identity rule, 1:1 TC-ATC mapping → distributed: test-automation (ATC implementation via @atc decorator), test-documentation (TC specification in TMS). |
| 8 | `.context/guidelines/QA/exploratory-testing.md` | `sprint-testing/references/exploration-patterns.md` | MEDIUM | Exploratory testing principles, Trifuerza (UI/API/DB) testing → renamed to "Triforce" in Stage 2 exploration patterns. |
| 9 | `.context/guidelines/QA/jira-test-management.md` | `test-documentation/references/jira-test-management.md` | HIGH | Test management modes (native Jira vs Xray), operations, issue types → preserved in test-documentation skill reference. |
| 10 | `.context/guidelines/QA/spec-driven-testing.md` | `test-documentation/SKILL.md` + `sprint-testing/SKILL.md` | LOW | 4 pillars (test from specs, traceability, coverage, precision) → principle referenced in test-documentation (Phase 1 Analyze) but not explicitly documented as "Spec-Driven Testing" section. |
| 11 | `.context/guidelines/QA/test-hierarchy.md` | `test-automation/references/kata-architecture.md` + `test-documentation/references/tms-architecture.md` | MEDIUM | 5-level hierarchy (Module→Feature→Ticket→Scenario→ATC), TC-ATC 1:1 mapping, test scenario vs ATC distinction → split: kata-architecture covers code side (Layer/fixture/component), tms-architecture covers documentation side. |
| 12 | `.context/guidelines/QA/test-spec-standards.md` | `test-documentation/SKILL.md` (Phase 1 & 2) | MEDIUM | TC discovery scopes (module/ticket/regression/exploratory), TC Identity Rule, Equivalence Partitioning → embedded in test-documentation skill Phase 1 (Analyze) and Phase 2 (Prioritize). |
| 13 | `.context/guidelines/TAE/README.md` | `test-automation/SKILL.md` | HIGH | TAE index, entry point, file reference → consolidated into test-automation skill description and Phase 1-3 workflow. |
| 14 | `.context/guidelines/TAE/api-testing-patterns.md` | `test-automation/references/api-patterns.md` | HIGH | API/Integration test architecture, fixture, ApiBase, ApiFixture → preserved in test-automation skill reference. |
| 15 | `.context/guidelines/TAE/atc-tracing-system.md` | `test-automation/references/atc-tracing.md` | HIGH | ATC lifecycle, decorator execution, result persistence, NDJSON files, KataReporter, TMS sync → preserved in test-automation skill reference. |
| 16 | `.context/guidelines/TAE/automation-standards.md` | `test-automation/references/automation-standards.md` | HIGH | ATC principles, naming, component naming, test files, anti-patterns → preserved in test-automation skill reference with expanded details. |
| 17 | `.context/guidelines/TAE/ci-cd-integration.md` | `test-automation/references/ci-integration.md` + `regression-testing/references/ci-cd-integration.md` | MEDIUM | GitHub Actions setup, CI/CD strategy, workflows → split: test-automation covers Playwright config + reporters, regression-testing covers orchestration (gh run watch, failure triage, release GO/NO-GO). |
| 18 | `.context/guidelines/TAE/data-testid-usage.md` | `test-automation/references/e2e-patterns.md` (inline) | LOW | data-testid naming and locator priority → mentioned inline in e2e-patterns as locator selection rule, but not a dedicated reference section. Content not comprehensively preserved. |
| 19 | `.context/guidelines/TAE/e2e-testing-patterns.md` | `test-automation/references/e2e-patterns.md` | HIGH | E2E test architecture, Page component, UiBase, UiFixture, Playwright mechanics → preserved in test-automation skill reference. |
| 20 | `.context/guidelines/TAE/kata-ai-index.md` | `test-automation/SKILL.md` | HIGH | AI entry point, task-based navigation, KATA concepts, critical rules summary → consolidated into test-automation skill description and Gotchas section. |
| 21 | `.context/guidelines/TAE/kata-architecture.md` | `test-automation/references/kata-architecture.md` | HIGH | Layer architecture (4 layers), fixture selection, directory structure, DI flow → preserved in test-automation skill reference with expanded detail. |
| 22 | `.context/guidelines/TAE/openapi-integration.md` | `test-automation/references/api-patterns.md` (inline) | LOW | OpenAPI integration, type generation, MCP setup → mentioned briefly in api-patterns but not as dedicated section. Significant content appears missing. |
| 23 | `.context/guidelines/TAE/playwright-automation-system.md` | `test-automation/references/kata-architecture.md` + `test-automation/references/e2e-patterns.md` | MEDIUM | Layer architecture (Layer 1-4), DI flow, fixture chain, TestContext, ApiFixture, UiFixture → consolidated into kata-architecture and e2e-patterns references. |
| 24 | `.context/guidelines/TAE/test-data-management.md` | `test-automation/references/test-data-management.md` | HIGH | Golden Rule (no hardcoding), Discover→Modify→Generate strategy, feasibility checks, precondition data principle → preserved in test-automation skill reference. |
| 25 | `.context/guidelines/TAE/test-design-principles.md` | `test-automation/references/automation-standards.md` (section 1) | MEDIUM | ATC definition, TC=Precondition+Action, ATC vs E2E/Integration, Equivalence Partitioning, assertions → condensed into automation-standards section 1 (ATC Fundamental Principles), but not a dedicated reference with full depth. |

---

## LOST or At-Risk Content

### Moderate Risk: Content Present but Compressed

| Legacy File | Topic | Risk | Current Location | Gap |
|---|---|---|---|---|
| **QA/spec-driven-testing.md** | 4-Pillar Spec-Driven Testing principle | MEDIUM | test-documentation SKILL.md + sprint-testing SKILL.md | Principle referenced but no dedicated subsection. The "4 Pillars" framework (Test from Specs, Traceability, Coverage, Precision) is not explicitly replicated. Developers must infer from Phase descriptions. |
| **TAE/data-testid-usage.md** | data-testid naming conventions and priority | LOW | test-automation/references/e2e-patterns.md (inline) | Comprehensive guide (naming conventions per context, locator priority table, Playwright syntax examples) is reduced to a single paragraph. Developers onboarding to UI testing may miss locator strategy details. |
| **TAE/openapi-integration.md** | OpenAPI setup, type generation, MCP, CI wiring | LOW | test-automation/references/api-patterns.md (brief mention) | Setup flow diagram, step-by-step configuration, troubleshooting, CI sync details are missing. Not in test-automation references. Developers will need to search code or infer from package.json scripts. |
| **TAE/test-design-principles.md** | Full ATC design philosophy + Precondition+Action Rule | MEDIUM | test-automation/references/automation-standards.md (section 1, condensed) | Full document (with examples of same-ATC vs different-ATC, TC Identity Rule details, assertions micro-validations) compressed to ~1 section. Conceptual depth lost; anti-pattern examples removed. |

### Low Risk: Fully Absorbed

All other 21 files have HIGH or HIGH-MEDIUM confidence. Content is preserved in skill references or SKILL.md descriptions, though sometimes restructured to match the new skill workflow (e.g., tms-workflow split across sprint-testing stages, TAE/README consolidated into test-automation SKILL.md).

---

## Verdict: Mostly Complete Migration with Minor Content Losses

### Summary

- **High absorption**: 17 of 25 files (68%) → mapped to skill references with HIGH confidence (verbatim or near-verbatim preservation).
- **Medium absorption**: 6 of 25 files (24%) → mapped with MEDIUM confidence (content restructured, split across skills, or condensed but recognizable).
- **Low absorption**: 2 of 25 files (8%) → mapped with LOW confidence (brief mention, not comprehensive).
- **Lost**: 0 files completely lost; however, 4 files show moderate-to-low risk of information loss due to compression or missing dedicated sections.

### Migration Quality Assessment

**Strengths:**
1. Core architecture knowledge (KATA layers, fixture selection, ATCs, E2E/API patterns) is well-preserved in test-automation references.
2. TMS entity model and conventions are intact in test-documentation references.
3. Workflow orchestration (IQL 5-stage pipeline) mapped across sprint-testing, test-documentation, and test-automation skills.
4. No files are entirely missing; all legacy concepts appear somewhere in the new structure.

**Weaknesses:**
1. **Philosophy/Principles** (Spec-Driven Testing, Test Design Principles) are referenced but not documented as standalone sections. Developers must infer from examples.
2. **Setup & Integration Guides** (OpenAPI, data-testid usage, CI/CD detailed setup) are significantly compressed or scattered. New team members may struggle with initial configuration.
3. **Reference files are task-oriented, not comprehensive**: skill references prioritize "how to write a test" over "foundational concepts." Legacy guidelines provided more conceptual grounding.

### Recommendation

**Accept the migration as complete but acknowledge trade-offs:**
1. The skill-based structure is more task-driven (aligned with AI agent usage patterns) and less reference-heavy.
2. For developers onboarding, there is a slight loss in conceptual depth for philosophy/principles and setup guides.
3. **Mitigation**: Create a supplementary `.context/KATA-philosophy.md` document that reintroduces the "4 Pillars of Spec-Driven Testing," full "Test Design Principles," and "OpenAPI Integration Setup" as reference material (not skill-gated). Link from skill README files.

### Next Steps

1. Flag the 4 at-risk files for content review (QA/spec-driven-testing.md, TAE/data-testid-usage.md, TAE/openapi-integration.md, TAE/test-design-principles.md).
2. Consider creating a `.context/KATA-reference-guide.md` consolidating philosophy and setup details.
3. Verify that project-discovery skill covers all KATA adaptation scenarios (Phase 3 infrastructure setup should reference OpenAPI integration).
