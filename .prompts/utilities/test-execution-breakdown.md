# Test Execution Breakdown

> **Purpose**: Generate a human-readable pseudo-code breakdown of automated tests showing exactly what each test validates, which ATCs run, what assertions fire, and how data flows between tests.
> **When to use**: After implementing or reviewing tests, to verify correctness and communicate coverage to stakeholders.
> **Output language**: English (for documentation/PRs).

---

## When to Use This Prompt

- After writing or updating ATCs and test files
- Before creating a PR (include the breakdown in the PR description)
- When reviewing someone else's test implementation
- When onboarding someone to understand what a test suite validates
- When verifying that consolidated TCs have all their assertions implemented

## How to Invoke

Ask the AI to generate a "test execution breakdown" for a specific scope:

| Scope | Example Request |
|-------|-----------------|
| **Single test** | "Give me a test execution breakdown of the AUTH-003 ATC" |
| **Test ticket** | "Test execution breakdown for AUTH-T01" |
| **Test file** | "Test execution breakdown for login.test.ts" |
| **Full module** | "Test execution breakdown for all auth tests" |

## Output Format

The breakdown must follow this structure:

### 1. Setup Section (if applicable)

Show shared setup (beforeAll, discovery, fixtures) as a tree:

```
SETUP: {description}
├── {what it does}
│   └── {how it does it}
├── RESULT:
│   ├── variable1 = { discovered/computed value }
│   └── variable2 = { discovered/computed value }
└── These variables are reused in: {list of tests}
```

### 2. Per-Test Section

Each test gets its own block:

```
TEST: "{test name}"

GUARD: {skip condition, if any}

NAVIGATION: {where the test starts}

ATC {ID}: {methodName}({ parameters })
│
├── ACTION:
│   ├── {step 1}
│   └── {step 2}
│
├── POSITIVE ASSERTIONS (what MUST be visible/true):
│   ├── {assertion 1} -> visible
│   └── {assertion 2} -> visible
│
└── NEGATIVE ASSERTIONS (what must NOT be visible):
    ├── {assertion 1} -> NOT visible
    └── {assertion 2} -> NOT visible
```

**What validates**: {one sentence explaining the business value of this test}

### 3. Summary Table

| Test | ATC(s) | Assertions | What It Tests |
|------|--------|------------|---------------|
| ... | ... | ... | ... |

### 4. Reused Variables Table

| Variable | Discovered Value | Used In |
|----------|-----------------|---------|
| ... | ... | ... |

## Rules

1. **Read the actual code** before generating the breakdown. Never guess what assertions exist.
2. **Show real values** from the last test run when available.
3. **Count assertions accurately** per ATC and per test.
4. **Group assertions by category** (structure, positive, negative, sub-elements).
5. **Explain in business terms** what each test validates (the "What validates" line).
6. **For multi-ATC tests**, show each ATC as a separate step with its own assertion tree.
7. **For parameterized tests**, show the data table and which partition each row covers.

## Example

After running a test ticket, the breakdown shows:
- Setup: API discovery finding resources in different states
- N tests using M ATCs with a total of X assertions
- Variables discovered once, reused across all tests
- Composite tests using multiple ATCs to validate state transitions

---

**Related**: [Automation Standards](../../.context/guidelines/TAE/automation-standards.md) | [Test Design Principles](../../.context/guidelines/TAE/test-design-principles.md)
