# Tavily MCP

> **Type**: Web Search & Research
> **Roles**: TAE, QA
> **Priority**: High

---

## When to Use

- Search for solutions to technical problems
- Investigate specific errors (Stack Overflow, GitHub issues)
- Compare technologies/libraries
- Search for recent best practices
- Find forum discussions (Reddit, dev.to, etc.)
- Investigate known library bugs

---

## Usage Examples

### Troubleshooting

```
"Search for solutions to 'TimeoutError: waiting for selector'"
"What does Stack Overflow say about Playwright flaky tests?"
"Investigate if there are known issues with Playwright 1.42"
"Find GitHub issues related to this error"
```

### Research

```
"Search for best practices for E2E test structure"
"How do other projects handle test data management?"
"Compare page object patterns in Playwright"
```

### Technology Decisions

```
"Playwright vs Cypress comparison 2025"
"Best test reporting tools for Playwright"
"Compare Allure vs native Playwright reporting"
```

---

## DO NOT Use For

- ❌ Official library docs (use Context7)
- ❌ Your project code (read local files)
- ❌ Database queries (use DB MCP)

---

## Tavily vs Context7

| Scenario                    | Context7 | Tavily |
| --------------------------- | -------- | ------ |
| "How to use page.click()?"  | ✅       | ❌     |
| "Error timeout in tests"    | ❌       | ✅     |
| "Playwright API reference"  | ✅       | ❌     |
| "Best practices for tests"  | ❌       | ✅     |
| "Known bugs in Playwright"  | ❌       | ✅     |

**Rule**: Context7 for **"how to use"**, Tavily for **"how to solve"**.

---

## Search Tips

1. **Include Error Messages**: Copy the exact error text
2. **Add Context**: "Playwright + TypeScript + timeout error"
3. **Specify Source**: "site:stackoverflow.com" for Stack Overflow only
4. **Include Version**: "Playwright 1.42 + flaky tests"

---

## Unique Use Cases

- Search in library GitHub issues
- Find Reddit/dev.to discussions
- Locate technical blog posts
- Compare technology options
- Investigate version-specific problems
- Find workarounds for known issues

---

## Example Searches

```
# Error Investigation
"Playwright Error: page.goto: net::ERR_CONNECTION_REFUSED"
"Playwright test isolation cookies not cleared"
"TypeScript strict mode playwright types error"

# Best Practices
"E2E testing best practices 2025"
"Page object model anti-patterns"
"Test data management strategies playwright"

# Comparisons
"Playwright vs Selenium 2025 performance"
"Allure reporter vs html reporter playwright"
```

---

## Related Documentation

- `./context7.md` - For official documentation lookup
- `../TAE/KATA-AI-GUIDE.md` - Project-specific patterns

---

**Last Updated**: 2026-02
