# Context7 MCP

> **Type**: Official Documentation Lookup
> **Roles**: TAE, QA
> **Priority**: High

---

## When to Use

- Need **official** library documentation
- Want to see usage examples for a library
- Verify framework API (Playwright, React, etc.)
- Get correct syntax for a function/method

---

## Usage Examples

### Framework Documentation

```
"How to configure Playwright for multiple browsers?"
"What is the Playwright locator API?"
"How to use expect assertions in Playwright?"
```

### Library Reference

```
"How to use faker.js for test data?"
"What are the Allure reporter options?"
"How to configure TypeScript paths?"
```

### Test Patterns

```
"What is the syntax for expect in Playwright?"
"How to use test.step() in Playwright?"
"How to run tests in parallel?"
```

---

## DO NOT Use For

- ❌ Questions about your specific codebase
- ❌ Debugging your code (use IDE diagnostics)
- ❌ Forum/community searches (use Tavily)
- ❌ Version-specific bug investigations

---

## Context7 vs Tavily

| Question Type                       | Use      |
| ----------------------------------- | -------- |
| "How to use page.click()?"          | Context7 |
| "Error: timeout waiting for element"| Tavily   |
| "Does Playwright have auto-retry?"  | Context7 |
| "Best practices for test structure" | Tavily   |

**Rule**: Context7 for **"how to use"**, Tavily for **"how to solve"**.

---

## Tips

1. **Be Specific**: "Playwright page.waitForSelector options" > "wait for element"
2. **Include Version**: If syntax changed between versions, specify which
3. **Library First**: "Playwright expect matchers" not just "expect matchers"
4. **API Focus**: Best for method signatures, parameters, return types

---

## Common Queries for Test Automation

```
# Playwright
"Playwright locator strategies"
"Playwright test fixtures"
"Playwright page object model"
"Playwright API testing"

# TypeScript
"TypeScript type guards"
"TypeScript utility types"
"TypeScript generics"

# Testing Libraries
"Faker.js locales"
"Allure decorators"
"Dotenv configuration"
```

---

## Workflow Integration

1. **First**: Use Context7 to understand official API
2. **Then**: Check KATA guidelines for project patterns
3. **Finally**: Implement following KATA architecture

See `../TAE/kata-ai-index.md` for project-specific patterns.

---

## Related Documentation

- `./tavily.md` - For web searches and troubleshooting
- `../TAE/kata-ai-index.md` - AI entry point for KATA patterns

---

**Last Updated**: 2026-02-12
