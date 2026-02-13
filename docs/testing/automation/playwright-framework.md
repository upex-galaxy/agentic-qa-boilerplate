# Playwright Projects - Complete Guide

> This document explains how Playwright projects work, their configuration, and how to use them effectively in the KATA Framework.

---

## What are Projects?

Projects are **independent test configurations** within a single Playwright setup. Each project can have:

- Its own `testMatch` (which files to run)
- Its own `testDir` (where to look for tests)
- Its own `dependencies` (what must run before)
- Its own `teardown` (what runs after this project and all its dependents finish)
- Its own `use` configuration (browser, viewport, auth state, etc.)

Think of projects as **named configurations** that can be chained together.

---

## Our Project Structure

```
┌─────────────────────────────────────┐
│  global-setup                       │  Runs FIRST - creates directories, validates env
│  (teardown: 'global-teardown')      │  ← Links to teardown project
└────────────────┬────────────────────┘
                 │
            ┌────┴────┐
            ▼         ▼
      ┌────────┐ ┌─────────┐
      │ui-setup│ │api-setup│  Auth setup - saves session/token
      └────┬───┘ └────┬────┘
           │         │
           ▼         ▼
      ┌────────┐ ┌───────────┐
      │  e2e   │ │integration│  Actual tests
      └────────┘ └───────────┘
                 │
                 ▼ (after ALL dependents complete)
         ┌──────────────┐
         │global-teardown│  Runs LAST - cleanup, TMS sync
         └──────────────┘
```

**Important:** The teardown runs automatically after `global-setup` AND all projects that depend on it (directly or transitively) have completed.

---

## Project Configuration

### Global Setup Project
```typescript
{
  name: 'global-setup',
  testMatch: /global\.setup\.ts/,
  testDir: './tests/setup',
  teardown: 'global-teardown',  // ← Activates teardown after all dependents finish
}
```
- No dependencies - runs first
- Creates required directories
- Validates environment configuration
- **`teardown` property**: Links to the teardown project that runs after completion

### Global Teardown Project
```typescript
{
  name: 'global-teardown',
  testMatch: /global\.teardown\.ts/,
  testDir: './tests/teardown',
  // NO dependencies needed - activated by `teardown` property on global-setup
}
```
- Activated by `teardown` property on `global-setup`
- Runs after `global-setup` AND all its dependents complete
- Generates reports, syncs to TMS, cleanup

### Auth Setup Projects
```typescript
{
  name: 'ui-setup',
  testMatch: /ui-auth\.setup\.ts/,
  testDir: './tests/setup',
  dependencies: ['global-setup'],
}
```
- Depends on `global-setup`
- Performs login and saves session state
- Session reused by E2E tests

### Test Projects
```typescript
{
  name: 'e2e',
  testMatch: '**/e2e/**/*.test.ts',
  dependencies: ['ui-setup'],
  use: {
    storageState: config.auth.storageStatePath,
  },
}
```
- Depends on auth setup
- Uses saved session state
- Matches all `.test.ts` files in `tests/e2e/`

---

## How Dependencies Work

When you run a project, Playwright automatically resolves and runs its dependencies:

```bash
# Running e2e project
bun run test --project=e2e

# Playwright executes in order:
# 1. global-setup (dependency of ui-setup)
# 2. ui-setup (dependency of e2e)
# 3. e2e (the requested project)
# 4. global-teardown (teardown of global-setup, runs after all dependents)
```

**Key points:**
- Dependencies are resolved recursively (upstream)
- Each dependency runs only once (even if multiple projects depend on it)
- If a dependency fails, dependent projects are skipped
- **Teardown runs after the setup project AND all its dependents complete**

---

## Dependencies vs Teardown

These are **different concepts** that work in opposite directions:

| Property | Direction | Purpose | When it runs |
|----------|-----------|---------|--------------|
| `dependencies` | Upstream | "Wait for these before I start" | Before the project |
| `teardown` | Downstream | "Run this after I and all my dependents finish" | After all dependents |

### Common Mistake

```typescript
// ❌ WRONG - This does NOT activate teardown automatically
{
  name: 'global-teardown',
  dependencies: ['e2e', 'integration'],  // Only means "wait for these"
}

// ✅ CORRECT - Use teardown property on the setup project
{
  name: 'global-setup',
  teardown: 'global-teardown',  // Activates teardown after all dependents
}
```

**Why `dependencies` doesn't work for teardown:**
- `dependencies` only means "don't start until these finish"
- It does NOT mean "run this project automatically"
- When you run `--project=e2e`, Playwright only runs projects in the dependency chain *going up*
- The teardown project is not in that chain, so it never runs

---

## Running Tests

### Terminal Commands

#### Run by project
```bash
bun run test --project=e2e           # Only e2e (with dependencies)
bun run test --project=integration   # Only integration (with dependencies)
bun run test --project=e2e --project=integration  # Both
```

#### Run specific file or folder
```bash
# Single file - Playwright auto-detects the matching project
bun run test tests/integration/auth/auth.test.ts

# All tests in a folder
bun run test tests/e2e/dashboard/

# Multiple files
bun run test tests/e2e/login.test.ts tests/e2e/logout.test.ts
```

#### Run by test name (grep)
```bash
# Run tests matching a pattern
bun run test --grep "should login"

# Run tests NOT matching a pattern
bun run test --grep-invert "skip"
```

#### Run all tests
```bash
bun run test  # Runs all projects with their dependencies
```

---

## VS Code Extension

### Installation

Install the official Playwright extension: `ms-playwright.playwright`

```
Extensions (Ctrl+Shift+X) → Search "Playwright" → Install "Playwright Test for VSCode"
```

### Sidebar Panel

The extension adds a **Testing** icon in the sidebar with:

| Section | Description |
|---------|-------------|
| **Projects** | Checkboxes to enable/disable projects |
| **Test Explorer** | Tree view of all test files and cases |
| **Settings** | Show browser, headed mode, etc. |

### Project Checkboxes

| State | Behavior |
|-------|----------|
| Checked | Project active, tests can run |
| Unchecked | Project disabled, tests won't run |

**Tip:** Uncheck `global-teardown` during development to skip cleanup after each run.

### Running Tests

| Action | How |
|--------|-----|
| Run single test | Click green play button next to test |
| Run file | Click play button next to file name |
| Run folder | Right-click folder → "Run Tests" |
| Run all | Click play button at top of explorer |

### Settings (Gear Icon)

- **Show browser**: Run tests in headed mode (visible browser)
- **Pick locator**: Interactive element selector
- **Record new**: Record actions to generate test code
- **Record at cursor**: Insert recorded actions at cursor position

---

## File Matching

### How Playwright Finds Tests

1. **Global `testMatch`** in config root applies to all projects
2. **Project `testMatch`** overrides or filters further
3. **Project `testDir`** limits where to search

### Our Configuration

```typescript
// Global (applies to all)
testMatch: /.*\.test\.ts/

// Project-specific
{
  name: 'e2e',
  testMatch: '**/e2e/**/*.test.ts',  // Only e2e folder
}
{
  name: 'integration',
  testMatch: '**/integration/**/*.test.ts',  // Only integration folder
}
```

### Automatic Project Detection

When you run a specific file:
```bash
bun run test tests/integration/auth/auth.test.ts
```

Playwright:
1. Checks which projects' `testMatch` patterns match the file
2. Runs the matching project(s) with their dependencies
3. If multiple projects match, runs the file in each project

---

## Common Scenarios

### Scenario 1: Run E2E Tests
```bash
bun run test:e2e
# Equivalent to: bun run test --project=e2e
```
Execution order:
1. `global-setup`
2. `ui-setup`
3. `e2e` tests
4. `global-teardown` (because global-setup has `teardown: 'global-teardown'`)

### Scenario 2: Run Integration Tests
```bash
bun run test:integration
# Equivalent to: bun run test --project=integration
```
Execution order:
1. `global-setup`
2. `api-setup`
3. `integration` tests
4. `global-teardown`

### Scenario 3: Run All Tests
```bash
bun run test
```
Execution order:
1. `global-setup`
2. `ui-setup` and `api-setup` (can run in parallel if workers > 1)
3. `e2e` and `integration` tests
4. `global-teardown` (runs once after ALL tests complete)

### Scenario 4: Run Single Test File
```bash
bun run test tests/e2e/dashboard/dashboard.test.ts
```
Playwright detects this matches `e2e` project and runs:
1. `global-setup`
2. `ui-setup`
3. Only `dashboard.test.ts`
4. `global-teardown`

---

## Extension vs Terminal

| Feature | Terminal | VS Code Extension |
|---------|----------|-------------------|
| Select project | `--project=name` | Checkbox |
| Multiple projects | Multiple `--project` flags | Multiple checkboxes |
| Disable project | Don't pass flag | Uncheck box |
| Dependencies | Auto-resolved | Auto-resolved |
| Run specific file | Pass file path | Click play button |
| Debug mode | `--debug` flag | Right-click > Debug |

---

## Debugging

### Method 1: VS Code Breakpoints (Recommended)

1. Set breakpoints in your test file (click left margin)
2. Right-click test → **"Debug Test"**
3. Execution pauses at breakpoints
4. Use Debug toolbar: Step Over, Step Into, Continue

**Tip:** Works with the extension's "Show browser" option to see the UI while debugging.

### Method 2: page.pause()

Insert `await page.pause()` in your test to open Playwright Inspector:

```typescript
test('debug example', async ({ page }) => {
  await page.goto('/dashboard');
  await page.pause();  // Opens Inspector here
  await page.click('#submit');
});
```

The Inspector allows:
- Step through actions one by one
- Pick locators interactively
- View console and network
- Resume or record new actions

### Method 3: Traces

Traces capture a complete record of test execution for post-mortem debugging.

**Enable in config** (already configured):
```typescript
trace: 'retain-on-failure'  // Saves trace only on failures
```

**View traces:**
```bash
# Open trace viewer
bunx playwright show-trace test-results/path-to/trace.zip

# Or via HTML report - click on failed test → "Traces" tab
```

**Force trace for a specific run:**
```bash
bun run test --trace on
```

### Method 4: UI Mode

Interactive mode with time-travel debugging:
```bash
bun run test --ui
```

Features:
- Watch mode (re-runs on file changes)
- Step through each action visually
- DOM snapshots at each step
- Network and console logs

### Debug Flags Summary

```bash
--debug          # Runs with Playwright Inspector
--ui             # Opens interactive UI mode
--headed         # Shows browser window
--trace on       # Forces trace recording
--slow-mo=1000   # Slows down actions by 1 second
```

---

## Best Practices

### 1. Keep Setup Projects Lightweight
Setup projects should be fast. Heavy operations slow down every test run.

### 2. Use Descriptive Project Names
```typescript
// Good
name: 'e2e'
name: 'integration'
name: 'ui-setup'

// Bad
name: 'project1'
name: 'tests'
```

### 3. Match Files by Directory
Use directory-based matching for clear separation:
```typescript
testMatch: '**/e2e/**/*.test.ts'      // All e2e tests
testMatch: '**/integration/**/*.test.ts'  // All API tests
```

### 4. Single Test File Suffix
Use `.test.ts` for all test files. The directory structure handles separation:
```
tests/
├── e2e/
│   └── dashboard/
│       └── dashboard.test.ts
└── integration/
    └── auth/
        └── auth.test.ts
```

### 5. Don't Skip Dependencies
If you need to skip setup, create a separate project without dependencies for debugging purposes only.

---

## Troubleshooting

### Tests Not Running

**Symptom:** Test file exists but doesn't run.

**Check:**
1. Does the file match `testMatch` pattern?
2. Is the correct project checked/selected?
3. Is the file in `testIgnore`?

### Dependencies Not Running

**Symptom:** Setup doesn't run before tests.

**Check:**
1. Is `dependencies` array correctly configured?
2. Are dependency project names spelled correctly?
3. Does the dependency project exist?

### Teardown Not Running

**Symptom:** Teardown project never executes.

**Check:**
1. Does the setup project have `teardown: 'project-name'` property?
2. Is the teardown project name spelled correctly?
3. Are you using `dependencies` on the teardown project? (This is wrong - use `teardown` on setup instead)

### Wrong Project Runs

**Symptom:** File runs in unexpected project.

**Check:**
1. Does the file path match multiple projects' `testMatch`?
2. Use `--project=name` to force specific project.

---

## Related Documentation

- [Playwright Projects](https://playwright.dev/docs/test-projects)
- [Test Configuration](https://playwright.dev/docs/test-configuration)
- [VS Code Extension](https://playwright.dev/docs/getting-started-vscode)
- [Debugging Tests](https://playwright.dev/docs/debug)
- [Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [UI Mode](https://playwright.dev/docs/test-ui-mode)
