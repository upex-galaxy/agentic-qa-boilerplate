# Playwright MCP

> **Type**: E2E Testing & Browser Automation
> **Roles**: TAE, QA
> **Priority**: Critical

---

## When to Use

- Generate automated E2E tests
- Create Page Object Models
- Simulate user interactions
- Explore the application in an automated way
- Debug test failures interactively

---

## Usage Examples

### Test Automation

```
"Generate an E2E test for the login flow"
"Create a Page Object for the checkout page"
"Simulate filling out the registration form"
"Click the submit button and verify the success message"
```

### Exploratory Testing

```
"Navigate to the products page and list the elements"
"Verify that the submit button is visible"
"Capture screenshot of the error page"
"Find all elements with data-testid on this page"
```

### Debugging

```
"Run the test and show the trace"
"What elements have data-testid on this page?"
"Check the console for errors"
```

---

## DO NOT Use For

- ❌ Unit tests (use Jest/Vitest directly)
- ❌ Simple API integration tests (use APIRequestContext)
- ❌ Tests that don't involve UI

---

## MCP Extension: Connect to Existing Browser

The Playwright MCP supports connecting to an **existing browser session** instead of launching a new one. This is useful for:

- Debugging a specific browser state
- Testing logged-in sessions without re-authenticating
- Inspecting real user scenarios

### How to Connect via CDP Token

1. **Launch Chrome with remote debugging**:
   ```bash
   # Linux/macOS
   google-chrome --remote-debugging-port=9222

   # Windows
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

   # macOS (alternative)
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```

2. **Get the WebSocket endpoint**:
   ```bash
   curl http://localhost:9222/json/version
   # Returns: { "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/..." }
   ```

3. **Configure MCP to use existing browser**:
   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "npx",
         "args": ["@anthropic/mcp-playwright", "--cdp-url", "ws://localhost:9222/devtools/browser/..."]
       }
     }
   }
   ```

### Benefits

| New Browser                    | Existing Browser (CDP)        |
| ------------------------------ | ----------------------------- |
| Fresh state each time          | Preserves cookies/session     |
| Slower (browser launch)        | Instant connection            |
| Isolated environment           | Real user context             |
| Good for CI/CD                 | Good for debugging            |

---

## KATA Integration

The Playwright MCP integrates with the KATA framework:

- **UiBase**: All Playwright helpers live here
- **Page Objects**: Component-based architecture
- **Test Fixtures**: Dependency injection for pages

See `../TAE/kata-architecture.md` for architecture details.

---

## Tips

1. **data-testid First**: Always use `data-testid` for selectors
2. **Explicit Waits**: Use `waitFor` instead of arbitrary delays
3. **Clear Assertions**: One expect per concept
4. **Snapshot First**: Use `browser_snapshot` to understand page structure before acting

---

## Browser Actions (MCP Commands)

| Action           | MCP Tool                      | Notes                     |
| ---------------- | ----------------------------- | ------------------------- |
| Navigate         | `browser_navigate`            | Go to URL                 |
| Click            | `browser_click`               | Click element by ref      |
| Type             | `browser_type`                | Fill input field          |
| Screenshot       | `browser_take_screenshot`     | Capture visual state      |
| Snapshot         | `browser_snapshot`            | Get accessibility tree    |
| Evaluate         | `browser_evaluate`            | Run JavaScript            |
| Wait             | `browser_wait_for`            | Wait for text/element     |

---

## Related Documentation

- `../TAE/kata-architecture.md` - KATA framework architecture
- `../TAE/e2e-testing-patterns.md` - E2E testing patterns
- `../TAE/data-testid-usage.md` - data-testid conventions

---

**Last Updated**: 2026-02
