# Test Execution Breakdown

Generate a plain-English breakdown of what automated tests do: which ATCs run, what assertions fire, and how data flows.

**Input:** $ARGUMENTS
(Scope: a file path, ATC ID, ticket ID, or module name. Examples: `tests/e2e/login.test.ts`, `AUTH-003`, `AUTH-T01`, `all auth tests`.)

---

## Step 1: Identify Scope

Parse `$ARGUMENTS` to determine the scope:

| Input looks like | Scope | Action |
|-----------------|-------|--------|
| File path (`.test.ts`) | Single test file | Read that file |
| ATC ID (e.g. `AUTH-003`) | Single ATC | Find the ATC method in `tests/components/` |
| Ticket ID (e.g. `AUTH-T01`) | Ticket tests | Find all test files referencing that ticket |
| Module name (e.g. `auth`) | Full module | Find all test files under that module folder |

Read the actual source code for the identified scope. Never guess what assertions exist.

## Step 2: Trace the Code

For each test file in scope:

1. **Read the test file** to identify test blocks (`test()`, `test.describe()`)
2. **Read each ATC** referenced by the tests (the component methods in `tests/components/`)
3. **Read any Steps** used as preconditions
4. **Note fixture usage** (`{ api }`, `{ ui }`, `{ test }`)

## Step 3: Generate the Breakdown

### Setup Section (if applicable)

Show shared setup (beforeAll, beforeEach, discovery, fixtures):

```
SETUP: {description}
+-- {what it does}
|   +-- {how it does it}
+-- RESULT:
|   +-- variable1 = { discovered/computed value }
|   +-- variable2 = { discovered/computed value }
+-- Reused in: {list of tests}
```

### Per-Test Section

For each test:

```
TEST: "{test name}"

GUARD: {skip condition, if any}

FIXTURE: { api | ui | test }

ATC {ID}: {methodName}({ parameters })
|
+-- ACTION:
|   +-- {step 1}
|   +-- {step 2}
|
+-- POSITIVE ASSERTIONS (must be true):
|   +-- {assertion 1}
|   +-- {assertion 2}
|
+-- NEGATIVE ASSERTIONS (must NOT be true):
    +-- {assertion 1}
    +-- {assertion 2}

VALIDATES: {one sentence -- business value of this test}
```

For multi-ATC tests, show each ATC as a separate numbered step.
For parameterized tests, show the data table and which partition each row covers.

### Summary Table

| Test | ATC(s) | Assertions | What It Validates |
|------|--------|------------|-------------------|
| ... | ... | {count} | {business description} |

### Reused Variables Table (if setup discovered data)

| Variable | Source | Used In |
|----------|--------|---------|
| ... | ... | ... |

## Rules

1. Read the actual code before generating -- never invent assertions
2. Count assertions accurately per ATC and per test
3. Group assertions by category (positive, negative, structural)
4. Explain in business terms what each test validates
5. Keep the output in English, formatted for documentation or PR descriptions
