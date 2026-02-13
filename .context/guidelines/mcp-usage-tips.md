# MCP Usage Tips

> **For**: Stages 1-5 (QA workflow)
> **Purpose**: Know WHEN and HOW to use each MCP tool

---

## 🎯 General Principle

**Use MCPs for LIVE data, NOT for static documentation**.

```
Living Data (use MCP) vs Static Docs (read file)

✅ MCP: Current database schema
❌ Docs: Hardcoded schema (may be outdated)

✅ MCP: Current test status in Jira/Xray
❌ Docs: Static test list

✅ MCP: Official library documentation
❌ Docs: Copied tutorial that may be obsolete
```

---

## 🔧 Available MCPs and When to Use Them

### **DBHub MCP** (Database)

**When to use**:

- Need real database schema
- Want to see sample data
- Verify table relationships
- Execute read queries for validation

**Examples**:

```
Stage 1 (Planning):
"What columns does the users table have?"
"What is the relationship between users and orders?"

Stage 4 (Implementation):
"Give me an example row from the products table"
"Show me the foreign key constraints"
```

**DON'T use for**:

- ❌ Operations that modify data (read-only recommended)
- ❌ Complex queries with sensitive data

---

### **Xray CLI** (Test Management)

**When to use**:

- Sync test cases with Jira/Xray
- Create tests automatically
- Update test status
- Import test results from Playwright

**Examples**:

```
Stage 3 (Specification):
"Create a test case for this story"
bun xray test create --summary "Login test" --jiraKey PROJ-123

Stage 4 (Test Automation):
"Import test results to Xray"
bun xray results import --file results.json
```

**DON'T use for**:

- Tasks you can do directly in Jira web
- Complex data transformations

---

### **Context7 MCP**

**When to use**:

- Need OFFICIAL library documentation
- Want to see usage examples for a library
- Verify framework API (Next.js, React, etc.)

**Examples**:

```
Stage 1 (Planning):
"How to implement server actions in Next.js 14?"
"What is the React Hook Form API?"

Stage 4 (Implementation):
"Give me an example of using Playwright for E2E testing"
"How to use Zod for schema validation?"
```

**DON'T use for**:

- ❌ Questions about your specific code
- ❌ Debugging (use IDE diagnostics)
- ❌ Forum searches (use Tavily MCP)

---

### **Tavily MCP** 🔍

**When to use**:

- Search for solutions to technical problems
- Investigate specific errors (Stack Overflow, GitHub issues)
- Compare technologies/libraries
- Search for recent best practices
- Find forum discussions (Reddit, dev.to, etc.)
- Investigate known library bugs

**Difference from Context7**:

- **Context7**: Official library docs → "How to use React Hooks?"
- **Tavily**: General web search → "How to solve 'hydration mismatch' error in Next.js?"

**Examples**:

```
Stage 1 (Planning):
"Search best practices for folder structure in Next.js 15"
"How do other projects handle authentication?"

Stage 4 (Implementation):
"Search for solutions to 'Cannot read property of undefined'"
"What does Stack Overflow say about optimizing Playwright tests?"
"Investigate if there are known issues with React 19 and Zustand"

Stage 4 (Test Automation):
"Search for retry strategies in flaky E2E tests"
"How do other projects implement test data management?"
```

**Unique use cases**:

- Search GitHub issues for libraries
- Investigate discussions on Reddit/dev.to
- Find technical blog posts
- Search for technology comparisons
- Investigate version-specific problems

**DON'T use for**:

- ❌ Official docs (use Context7)
- ❌ Your project code (read local files)
- ❌ Your DB information (use DBHub MCP)

---

### **Playwright MCP**

**When to use**:

- Generate automated E2E tests
- Create Page Object Models
- Simulate user interactions

**Examples**:

```
Stage 4 (Test Automation):
"Generate an E2E test for the login flow"
"Create a Page Object for the checkout page"
"Simulate filling the registration form"
```

**DON'T use for**:

- ❌ Unit tests (use Jest/Vitest directly)
- ❌ Simple integration tests

---

### **Chrome DevTools MCP** 🔧

**When to use**:

- Debug failed E2E tests
- Inspect network requests during testing
- View console errors in tests
- Application performance profiling
- Analyze DOM behavior
- Capture test screenshots/videos

**Examples**:

```
Stage 4 (Test Automation):
"Inspect console errors during the login test"
"Capture network requests during the checkout flow"
"Analyze dashboard page performance"
"What resources are loading slowly?"
"Show DOM events during the test"
```

**Complements Playwright**:

- **Playwright**: Execute E2E tests
- **DevTools**: Debug when tests fail or are slow

**DON'T use for**:

- ❌ Unit testing (use Jest/Vitest)
- ❌ Production debugging (use Sentry MCP)
- ❌ API testing (use Postman MCP)

---

### **Postman MCP**

**When to use**:

- Test API endpoints
- Verify API responses
- Create request collections

**Examples**:

```
Stage 4 (Implementation):
"Test the POST /api/users endpoint"
"What does GET /api/products/123 respond?"

Stage 4 (Test Automation):
"Create a Postman collection for the auth API"
```

**DON'T use for**:

- ❌ UI testing (use Playwright)
- ❌ Load testing (use specific tool)

---

### **Sentry MCP** 🐛

**When to use**:

- Investigate production errors
- View stack traces of reported bugs
- Analyze error frequency
- Create tests to reproduce errors
- Monitor performance issues
- Verify if a bug was already reported

**Examples**:

```
Stage 4 (Implementation):
"What errors are being reported in production?"
"Give me the stack trace of the most frequent error"
"How many times has error SENTRY-ABC123 occurred?"

Stage 4 (Test Automation):
"Create a test to reproduce error SENTRY-XYZ"
"Which users are affected by this error?"
"Show the last 10 'TypeError' errors"
```

**Bug traceability**:

- View errors reported in real-time
- Analyze error patterns
- Prioritize fixes based on frequency
- Verify if a fix resolved the problem

**DON'T use for**:

- ❌ Local debugging (use DevTools)
- ❌ Test errors (use Playwright trace viewer)
- ❌ Build errors (use CI/CD logs)

---

### **GitHub MCP**

**When to use**:

- Create issues automatically
- Search related PRs
- Read code from other repos
- Verify commit history

**Examples**:

```
Stage 3 (Specification):
"Create an issue to implement dark mode"

Stage 4 (Code Review):
"Are there open PRs related to auth?"
"Search for issues similar to this bug"
```

---

### **Slack MCP**

**When to use**:

- Notify team of important changes
- Send test result reports
- Communicate deploys

**Examples**:

```
Stage 4 (Test Automation):
"Send test results report to #qa channel"

Stage 4 (Implementation):
"Notify #engineering that the feature is ready"
```

---

### **Memory MCP**

**When to use**:

- Remember context between sessions
- Save technical decisions
- Maintain project state

**Examples**:

```
Any stage:
"Remember we use Zod for validation"
"What decisions did we make about the auth schema?"
```

---

## 📋 Decision Tree: Which MCP to Use?

```
Do you need information about...?

├─ Database → DBHub MCP
│   └─ Schema, data, queries
│
├─ Official documentation → Context7 MCP
│   └─ Next.js, React, Playwright docs
│
├─ Web search / forums → Tavily MCP ⭐
│   └─ Stack Overflow, GitHub issues, Reddit, blogs
│
├─ Test Management → Xray CLI
│   └─ Test cases, results, status
│
├─ E2E testing → Playwright MCP
│   └─ User flows, interactions
│
├─ E2E debugging → DevTools MCP ⭐
│   └─ Console, network, performance
│
├─ API testing → Postman MCP
│   └─ Endpoints, responses
│
├─ Error monitoring → Sentry MCP ⭐
│   └─ Production errors, stack traces
│
├─ Repository → GitHub MCP
│   └─ Issues, PRs, code
│
├─ Team communication → Slack MCP
│   └─ Notifications, reports
│
└─ Session memory → Memory MCP
    └─ Cross-session context
```

---

## ⚡ Token Optimization

### Use MCPs Strategically

**"backend" profile** (loads 3 MCPs):

```bash
node scripts/mcp-builder.js backend
# Loads: dbhub + context7 + tavily

Use dbhub for schema
Use context7 for official lib docs
Use tavily to investigate technical problems
```

**"frontend" profile** (loads 3 MCPs):

```bash
node scripts/mcp-builder.js frontend
# Loads: context7 + tavily + playwright

Use context7 for React/Next.js docs
Use tavily to search for UI bug solutions
Use playwright for E2E tests (if needed)
```

**"testing" profile** (loads 4 MCPs):

```bash
node scripts/mcp-builder.js uitest
# Loads: playwright + devtools + context7 + tavily

Use playwright for E2E tests
Use devtools for debugging
Use context7 for testing docs
Use tavily for testing best practices
```

**"debugging" profile** (loads 4 MCPs):

```bash
node scripts/mcp-builder.js debug
# Loads: devtools + sentry + tavily + dbhub

Use devtools for E2E debugging
Use sentry for production errors
Use tavily to search for solutions
Use dbhub to see DB data
```

**See more**: `docs/mcp/builder-strategy.md`

---

## ⚠️ Common Mistakes

### ❌ DON'T do this

1. **Load all MCPs always**

   ```bash
   # ❌ BAD
   node scripts/mcp-builder.js full

   # ✅ GOOD
   node scripts/mcp-builder.js backend
   ```

2. **Use MCP for what you can do locally**

   ```
   ❌ "Use Context7 to read my local code"
   ✅ Read the file directly
   ```

3. **Don't change MCPs between tasks**

   ```
   ❌ Use "backend" profile for testing
   ✅ Switch to "uitest" profile when doing tests
   ```

---

## 🔄 Context7 vs Tavily: Which to Use?

| Scenario                                      | Context7            | Tavily            |
| --------------------------------------------- | ------------------- | ----------------- |
| "How to use useState in React?"               | ✅ Official docs    | ❌ Overkill       |
| "Error: hydration mismatch in Next.js"        | ❌ Doesn't index forums | ✅ Stack Overflow |
| "Does Playwright have automatic retry?"       | ✅ Official docs    | ❌ Unnecessary    |
| "Best practices for folder structure"         | ❌ Doesn't give opinions | ✅ Blogs + forums |
| "Are there known bugs with Zustand + React 19?"| ❌ Doesn't index issues | ✅ GitHub issues  |
| "Compare Zod vs Yup"                          | ❌ Only individual docs | ✅ Comparisons    |
| "How to configure Playwright?"                | ✅ Official docs    | ❌ Unnecessary    |
| "Why doesn't my auth work with SSR?"          | ❌ Specific problem | ✅ Reddit/GitHub  |

**Golden rule**: Context7 for **"how to use"**, Tavily for **"how to solve"**.

---

## 💡 Final Tips

1. **Switch profile according to task**:

   ```bash
   # Implementing backend
   node scripts/mcp-builder.js backend

   # Implementing frontend
   node scripts/mcp-builder.js frontend

   # Testing UI
   node scripts/mcp-builder.js uitest

   # Debugging issues
   node scripts/mcp-builder.js debug

   # API testing
   node scripts/mcp-builder.js apitest
   ```

2. **Use MCPs for dynamic data**:
   - DB Schema (DBHub)
   - Test status (Jira/Xray, GitHub)
   - Official docs (Context7)
   - Web searches (Tavily)
   - Production errors (Sentry)

3. **Recommended Context7 + Tavily workflow**:
   - First search in Context7 (official docs)
   - If not found, use Tavily (forums, GitHub issues)
   - Context7 for "how to use", Tavily for "how to solve"

4. **Read local files for static data**:
   - Guidelines
   - Implementation plans
   - Test cases

---

## 📊 Updated MCP Summary

**Total available MCPs**: 11

| MCP             | Type           | When to Use                   |
| --------------- | -------------- | ----------------------------- |
| DBHub           | Database       | Schema, data, queries         |
| Xray CLI        | Test Mgmt      | Tests, Results, Status        |
| Context7        | Official Docs  | React, Next.js, Playwright    |
| **Tavily** ⭐   | Web Search     | Stack Overflow, forums, blogs |
| Playwright      | E2E Testing    | User flows, interactions      |
| **DevTools** ⭐ | E2E Debug      | Console, network, performance |
| Postman         | API Testing    | Endpoints, responses          |
| **Sentry** ⭐   | Monitoring     | Production errors, traces     |
| GitHub          | Repository     | Issues, PRs, code             |
| Slack           | Communication  | Notifications, reports        |
| Memory          | Persistence    | Cross-session context         |

---

**Last Updated**: 2026-02-12
**See also**: `guidelines/MCP/README.md`
