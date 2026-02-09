# MCP - Model Context Protocol Guidelines

> **For**: TAE, QA
> **Purpose**: Know WHEN and HOW to use each MCP for testing

---

## General Principle

**Use MCPs for LIVE data and interactive testing, NOT for automated test suites.**

| Use MCP For                     | Use KATA Framework For          |
| ------------------------------- | ------------------------------- |
| Exploratory testing             | Automated regression tests      |
| Quick data verification         | CI/CD test execution            |
| Interactive debugging           | Repeatable test scenarios       |
| Schema exploration              | Test reporting (Allure)         |

---

## Available MCPs

| MCP        | File            | Priority | When to Use                  |
| ---------- | --------------- | -------- | ---------------------------- |
| Atlassian  | `atlassian.md`  | Critical | Jira/Xray test management    |
| DBHub      | `dbhub.md`      | Critical | Database queries, validation |
| OpenAPI    | `openapi.md`    | Critical | API endpoint exploration     |
| Playwright | `playwright.md` | Critical | E2E testing, UI automation   |
| Postman    | `postman.md`    | High     | API collection testing       |
| Context7   | `context7.md`   | High     | Official documentation       |
| Tavily     | `tavily.md`     | High     | Web search, troubleshooting  |

---

## Decision Tree: Which MCP to Use?

```
What do you need to do?

├─ Test API endpoint → openapi.md
│   └─ Quick verification, contract testing
│
├─ Verify database data → dbhub.md
│   └─ Data validation, test setup
│
├─ Test UI flow → playwright.md
│   └─ E2E testing, screenshots
│
├─ Manage test cases → atlassian.md
│   └─ Jira/Xray integration
│
├─ Look up library docs → context7.md
│   └─ Official API reference
│
├─ Search for solutions → tavily.md
│   └─ Stack Overflow, GitHub issues
│
└─ Test API collections → postman.md
    └─ Request collections, environments
```

---

## MCPs by Testing Phase

### Test Planning

```
Primary: atlassian (Jira issues)
Secondary: context7 (framework docs)
```

### Test Data Setup

```
Primary: dbhub (database)
Secondary: openapi (API seeding)
```

### Test Execution

```
Primary: playwright (E2E), openapi (API)
Secondary: dbhub (verification)
```

### Test Debugging

```
Primary: playwright (UI), dbhub (data)
Secondary: tavily (error investigation)
```

---

## Quick Reference

### Context7 vs Tavily

| Question Type                  | Use      |
| ------------------------------ | -------- |
| "How to use page.click()?"     | Context7 |
| "Error timeout in Playwright"  | Tavily   |
| "Playwright locator API"       | Context7 |
| "Best practices for E2E tests" | Tavily   |

**Rule**: Context7 for **"how to use"**, Tavily for **"how to solve"**.

### OpenAPI vs DBHub

| Task                        | Use     |
| --------------------------- | ------- |
| Test API response           | OpenAPI |
| Verify data was saved       | DBHub   |
| Create test data            | DBHub   |
| Check API contract          | OpenAPI |
| Complex data relationships  | DBHub   |

---

## Setup Guides

For detailed configuration instructions:

- `docs/mcp/dbhub-mcp-setup.md` - Database connection
- `docs/mcp/openapi-mcp-setup.md` - API configuration
- `docs/mcp/mcp-testing.md` - Testing workflows

---

## Integration with KATA

MCPs complement the KATA test automation framework:

1. **Exploration** (MCP): Use MCPs to explore and understand the system
2. **Documentation** (MCP): Use Atlassian MCP for test case management
3. **Automation** (KATA): Write automated tests using KATA patterns
4. **Verification** (MCP): Use MCPs for quick data verification

See `../TAE/KATA-AI-GUIDE.md` for KATA framework details.

---

**Last Updated**: 2026-02
