# Exploratory Testing Guidelines

> **For**: QA Engineers
> **Stage**: 2 (Exploratory Testing)
> **Purpose**: Standards for performing effective exploratory testing

---

## Central Principle

Exploratory Testing validates functionality **BEFORE** investing in automation. It is an active exploration process where the QA:

1. **Explores** the functionality with a critical eye
2. **Documents** findings in real-time
3. **Decides** if the functionality is ready for production

---

## Trifuerza Testing

Complete feature validation requires testing across **three layers**:

```
┌─────────────────────────────────────────────────────────────┐
│                    TRIFUERZA TESTING                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │     UI      │  │     API     │  │     DB      │         │
│  │  Testing    │  │  Testing    │  │  Testing    │         │
│  │             │  │             │  │             │         │
│  │ Playwright  │  │  Postman/   │  │   DBHub     │         │
│  │    CLI      │  │ OpenAPI MCP │  │    MCP      │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┴────────────────┘                 │
│                          │                                  │
│                 Data Flows Through All Layers               │
└─────────────────────────────────────────────────────────────┘
```

### When to Use Each Layer

| Feature Type  | Recommended Testing     | Tools                          |
| ------------- | ----------------------- | ------------------------------ |
| UI-focused    | UI → API → DB           | playwright-cli → API MCP → DB  |
| API-first     | API → DB → UI (if any)  | API MCP → DB MCP → UI         |
| Data-focused  | DB → API → UI (if any)  | DB MCP → API MCP → UI         |
| Full-stack    | All (full Trifuerza)    | All three in sequence          |

### Verification Flow

```
1. UI Testing    → Validates user experience
2. API Testing   → Validates backend logic and contracts
3. DB Testing    → Validates data integrity and constraints
```

**Each layer can discover defects the others cannot:**

- **UI** finds UX problems, visual validations, navigation flows
- **API** finds contract issues, auth problems, RLS policies, error handling
- **DB** finds integrity issues, triggers, constraints, orphan data

---

## When to Perform Exploratory Testing

| Trigger                      | Scope                  | Objective                 |
| ---------------------------- | ---------------------- | ------------------------- |
| User Story in "Ready for QA" | Individual story       | Validate ACs              |
| Feature deployed to staging  | Epic/Complete feature  | Comprehensive validation  |
| Hotfix deployed              | Affected area          | Quick regression          |
| Release candidate            | Complete application   | Smoke + Sanity            |

---

## Prerequisites

Before starting an exploratory testing session:

**General:**

- [ ] Feature deployed in staging
- [ ] Access to staging URL
- [ ] Acceptance Criteria or Test Cases available
- [ ] Jira/Atlassian MCP connected (for creating bugs)

**Per layer:**

| Layer | Required Tools                    |
| ----- | --------------------------------- |
| UI    | `playwright-cli` (Claude Skill)   |
| API   | `postman` and/or `openapi` MCP    |
| DB    | `dbhub` MCP                       |
| Full  | All of the above (Trifuerza)      |

---

## Tools

The Trifuerza uses different tools depending on the testing layer:

| Tool            | Type          | Layer    | Purpose                            |
| --------------- | ------------- | -------- | ---------------------------------- |
| `playwright-cli`| Claude Skill  | UI       | Visual exploration, interactions   |
| `postman`       | MCP Server    | API      | Collections, auth flows            |
| `openapi` (api) | MCP Server    | API      | Direct requests via spec           |
| `dbhub` (sql)   | MCP Server    | DB       | SQL queries, data verification     |
| `atlassian`     | MCP Server    | Workflow | Create bugs, transition stories    |

---

### Playwright CLI Skill (UI Testing)

The official method for frontend exploratory testing. The `playwright-cli` skill provides browser automation via CLI commands:

| Command                          | Use                              |
| -------------------------------- | -------------------------------- |
| `playwright-cli open <url>`      | Open browser and navigate        |
| `playwright-cli snapshot`        | Capture page structure (a11y)    |
| `playwright-cli click <ref>`     | Interact with elements           |
| `playwright-cli fill <ref> "x"`  | Fill form fields                 |
| `playwright-cli screenshot`      | Capture visual evidence          |
| `playwright-cli console`         | View console logs                |
| `playwright-cli network`         | View network requests            |

**Typical flow:**

```
1. playwright-cli open <staging-url>  → Open the page
2. playwright-cli snapshot            → Understand structure via refs
3. playwright-cli click / fill        → Execute actions using refs
4. playwright-cli screenshot          → Capture evidence
5. playwright-cli console / network   → Check for hidden errors
6. Repeat for each scenario
7. playwright-cli close               → Close the browser
```

**Advanced capabilities:**

- **Tabs**: `tab-new`, `tab-list`, `tab-select` for multi-tab flows
- **Storage**: `state-save`, `state-load` for auth state reuse
- **Cookies**: `cookie-list`, `cookie-get`, `cookie-set` for session inspection
- **DevTools**: `tracing-start`, `tracing-stop` for detailed debugging
- **Network mocking**: `route` for intercepting requests

See `.claude/skills/playwright-cli/SKILL.md` for full command reference.

---

### Postman / OpenAPI MCP (API Testing)

Validate endpoints, contracts, and authentication:

| Tool (Postman)            | Use                           |
| ------------------------- | ----------------------------- |
| `getCollections`          | List test collections         |
| `runCollection`           | Execute test suite            |
| `getEnvironments`         | View configured environments  |
| `createCollectionRequest` | Create new requests           |

| Tool (OpenAPI)                | Use                      |
| ----------------------------- | ------------------------ |
| `mcp__openapi__get-[table]`   | GET request to endpoint  |
| `mcp__openapi__post-[table]`  | POST request to endpoint |
| `mcp__openapi__patch-[table]` | PATCH request to endpoint|

**Typical API Testing flow:**

```
1. Authenticate (get JWT)
2. Execute requests per endpoint
3. Validate response schemas
4. Verify RLS policies
5. Test edge cases and errors
```

---

### DBHub MCP (Database Testing)

Verify data, constraints, and triggers:

| Tool                   | Use                           |
| ---------------------- | ----------------------------- |
| `mcp__dbhub__query`    | Execute SELECT queries        |
| `mcp__dbhub__execute`  | Execute INSERT/UPDATE/DELETE  |
| `mcp__dbhub__describe` | Describe tables and schemas   |

**Typical DB Testing flow:**

```
1. Explore schema (tables, constraints)
2. Verify data created by API/UI
3. Validate constraints (FK, UNIQUE, CHECK)
4. Verify triggers and calculations
5. Look for integrity issues
```

---

## Exploratory Testing Flow

```
┌─────────────────────────────────────────┐
│     STAGE 2: EXPLORATORY TESTING        │
├─────────────────────────────────────────┤
│ 1. Smoke Test (quick validation)        │
│    └── Do the basics work?              │
│                                         │
│ 2. Guided Exploration                   │
│    └── Follow ACs or Test Cases         │
│    └── Document findings                │
│                                         │
│ 3. Edge Cases Exploration               │
│    └── Empty inputs, limits             │
│    └── Alternative flows                │
│                                         │
│ 4. Bug Reporting (if any)               │
│    └── Confirm reproducibility          │
│    └── Create in Jira                   │
│                                         │
│ 5. Final Decision                       │
│    └── PASSED → QA Approved             │
│    └── FAILED → Wait for fixes          │
└─────────────────────────────────────────┘
```

---

## Exploration Techniques

### 1. Happy Path Testing

Validate the main flows according to Acceptance Criteria:

```markdown
Scenario: Successful login

1. Navigate to /login
2. Enter valid email
3. Enter valid password
4. Click Submit
   ✓ Result: Redirect to dashboard
```

### 2. Boundary Testing

Test limits and extreme conditions:

| Input       | Values to Test                            |
| ----------- | ----------------------------------------- |
| Text fields | Empty, 1 char, maximum, > maximum         |
| Numbers     | 0, -1, MAX_INT, decimals                  |
| Dates       | Past, today, future, invalid              |
| Emails      | Valid format, invalid, with special chars  |

### 3. Negative Testing

Test how the application handles errors:

```markdown
Negative scenarios:

- Login with invalid credentials
- Submit form without required fields
- Access protected pages without auth
- Operations with non-existent data
```

### 4. State Testing

Test behavior in different states:

- Page refresh in the middle of flow
- Browser "Back" button
- Multiple tabs with same session
- Session timeout

### 5. Security Quick Checks

Basic security validations:

- SQL Injection: `'; DROP TABLE users; --`
- XSS: `<script>alert('xss')</script>`
- Direct access to protected URLs
- Sensitive data exposure in console

---

## Session Documentation

During exploration, document in real-time:

```markdown
## Session Notes - [Feature/Story]

**Date:** YYYY-MM-DD
**Duration:** X minutes
**URL:** [staging URL]

### Scenarios Tested

#### 1. [Scenario name] - ✅ PASSED

- Action: [what I did]
- Result: [what happened]
- Notes: [observations]

#### 2. [Scenario name] - ❌ FAILED

- Action: [what I did]
- Expected: [what should have happened]
- Actual: [what happened]
- Evidence: [screenshot]

### Issues Found

1. **[Bug title]**
   - Severity: Critical/High/Medium/Low
   - Steps: [reproduction]
   - Evidence: [screenshot]

### General Observations

- [What worked well]
- [Areas of concern]
- [Improvement suggestions]
```

---

## Decision Criteria

### PASSED (QA Approved)

- ✅ All Acceptance Criteria validated
- ✅ No critical or high bugs
- ✅ UX is acceptable
- ✅ Performance is acceptable

### PASSED with Issues

- ✅ Core functionality works
- ⚠️ Minor bugs found
- → Create bugs in Jira
- → Continue to documentation

### FAILED

- ❌ Critical bugs found
- ❌ ACs not met
- → Report and wait for fixes
- → DO NOT continue to documentation

---

## Best Practices

### DO

- ✅ **Explore, don't just execute** - Look for unexpected behaviors
- ✅ **Document in real-time** - Don't wait until the end
- ✅ **Take screenshots** - Visual evidence is invaluable
- ✅ **Review console/network** - Hidden errors appear there
- ✅ **Think like a user** - What would confuse a real user?
- ✅ **Time-box exploration** - Don't spend infinite time on one area

### DON'T

- ❌ **Don't automate before exploring** - Validate first
- ❌ **Don't ignore edge cases** - That's where bugs live
- ❌ **Don't assume it "works"** - Verify everything
- ❌ **Don't create bugs without reproducing** - Confirm before reporting

---

## Integration with QA Flow

Exploratory Testing is the **first step** of the QA flow:

```
Stage 2: Exploratory Testing
    ↓
    (PASSED)
    ↓
Stage 3: Test Documentation
    ↓
Stage 4: Test Automation
```

**See also:**

- `.claude/skills/playwright-cli/SKILL.md` - Playwright CLI skill reference
- `.context/guidelines/mcp-usage-tips.md` - MCP usage patterns

---

## Stage Output

After completing exploratory testing:

1. **Session Notes** with all findings
2. **Bugs reported** in Jira (if any)
3. **Clear decision**: PASSED / FAILED
4. **State transition** in Jira (if PASSED)
5. **Candidate list** for documentation and automation

---

**Last Updated**: 2026-03-18
