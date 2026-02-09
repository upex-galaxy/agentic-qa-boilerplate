# Guidelines - Reference Material

> **Purpose**: Guidelines that the AI must read before working
> **Principle**: Each folder corresponds to a specific ROLE

---

## Structure

```
guidelines/
├── README.md               # This file (index)
├── code-standards.md       # DRY, KISS, naming, TypeScript
├── mcp-usage-tips.md       # When/how to use MCP tools
│
├── TAE/                    # Test Automation Engineering
│   ├── README.md           # TAE index
│   ├── KATA-AI-GUIDE.md    # AI entry point (START HERE)
│   ├── kata-architecture.md    # KATA layer architecture
│   ├── automation-standards.md # ATC rules and patterns
│   ├── typescript-patterns.md  # TypeScript conventions
│   ├── e2e-testing-patterns.md # E2E test patterns
│   ├── api-testing-patterns.md # API test patterns
│   ├── test-data-management.md # Faker and test data
│   ├── data-testid-usage.md    # How to USE data-testid in tests
│   ├── openapi-integration.md  # API type generation
│   ├── tms-integration.md      # Jira/Xray TMS sync
│   └── ci-cd-integration.md    # GitHub Actions CI/CD
│
├── QA/                     # Quality Engineering (Reference)
│   ├── README.md           # QA index
│   ├── spec-driven-testing.md  # Spec-driven testing principle
│   ├── exploratory-testing.md  # Manual exploratory testing
│   └── jira-test-management.md # Test case documentation in Jira
│
└── MCP/                    # MCP Server Guides
    ├── README.md           # MCP index and overview
    ├── atlassian.md        # Jira/Confluence integration
    ├── dbhub.md            # Database connection
    ├── openapi.md          # API endpoints context
    ├── playwright.md       # Browser automation
    ├── postman.md          # API testing with Postman
    ├── context7.md         # Documentation lookup
    └── tavily.md           # Web research
```

---

## Usage by Role

### QA Automation Engineer (TAE) - Primary

```
Read BEFORE writing tests:
1. TAE/KATA-AI-GUIDE.md      ← Start here (AI entry point)
2. TAE/kata-architecture.md  ← Understand layers
3. TAE/automation-standards.md ← ATC rules
4. code-standards.md         ← General coding standards
```

### QA Engineer (Manual Testing) - Reference

```
Read for context:
├── QA/spec-driven-testing.md
├── QA/exploratory-testing.md
└── QA/jira-test-management.md
```

**Note**: The QA folder is maintained as reference material. The primary focus of this repository is test automation (TAE).

### MCP Server Guides

```
Available MCP guides:
├── MCP/atlassian.md   ← Jira/Confluence for test management
├── MCP/dbhub.md       ← Database queries for validation
├── MCP/openapi.md     ← API endpoint discovery
├── MCP/playwright.md  ← Browser automation
├── MCP/postman.md     ← API testing
├── MCP/context7.md    ← Documentation lookup
└── MCP/tavily.md      ← Web research
```

---

## Key Concepts

### 1. TAE Focus

This is a **Test Automation Engineering** repository. All guidelines prioritize:

- **KATA Framework**: 4-layer architecture for test automation
- **Playwright**: E2E and API testing
- **TypeScript**: Strict patterns for maintainability

### 2. Shared Principles

- **Spec-Driven**: Tests come from specifications
- **Quality First**: Quality from the start
- **Traceability**: Tests map to requirements via `@atc` decorator

### 3. MCP Tools

See `mcp-usage-tips.md` for usage patterns and `MCP/` folder for detailed guides:

| MCP         | Purpose                          | Guide              |
| ----------- | -------------------------------- | ------------------ |
| Atlassian   | Jira/Confluence integration      | `MCP/atlassian.md` |
| DBHub       | Database queries and validation  | `MCP/dbhub.md`     |
| OpenAPI     | API endpoint discovery           | `MCP/openapi.md`   |
| Playwright  | Browser automation               | `MCP/playwright.md`|
| Postman     | API testing                      | `MCP/postman.md`   |
| Context7    | Documentation lookup             | `MCP/context7.md`  |
| Tavily      | Web research                     | `MCP/tavily.md`    |

---

## Workflows

Guidelines are **constant principles**. For step-by-step workflows, see:

- `.prompts/stage-4-automation/` - Test automation prompts
- `.prompts/us-qa-workflow.md` - Complete QA workflow

---

## See Also

- `CLAUDE.md` (project root) - Project memory and quick start
- `TAE/KATA-AI-GUIDE.md` - AI implementation guide

---

**Last Updated**: 2026-02-09
