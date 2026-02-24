# Xray Test Types

## Overview

Xray supports three test types, each designed for different testing approaches:

| Type | ID | Purpose | Data Field |
|------|----|---------|------------|
| Manual | `Manual` | Step-by-step human execution | `steps[]` |
| Generic | `Generic` | Automated tests (any framework) | `unstructured` (definition) |
| Cucumber | `Cucumber` | BDD tests with Gherkin syntax | `gherkin` |

## Manual Tests

Manual tests contain structured steps that a tester follows.

### Structure

```json
{
  "testType": "Manual",
  "steps": [
    {
      "id": "step-1",
      "action": "Navigate to login page",
      "data": "https://app.example.com/login",
      "result": "Login form is displayed"
    },
    {
      "id": "step-2",
      "action": "Enter valid credentials",
      "data": "user@test.com / P@ssw0rd",
      "result": "Credentials accepted"
    }
  ]
}
```

### Creating Manual Tests

```bash
# With steps inline
bun xray test create --project DEMO --summary "Verify login" --type Manual \
  --step "Open app|Login form displayed" \
  --step "Enter credentials|user@test.com|Success"

# Create empty, add steps later
bun xray test create --project DEMO --summary "Verify login" --type Manual
bun xray test add-step --test <issueId> --action "Open app" --result "Form displayed"
```

### Step Format

The `--step` flag accepts these formats:
- `action|result` - Action and expected result
- `action|data|result` - Action, test data, and expected result

## Generic Tests

Generic tests store a definition (usually automation code reference or command).

### Structure

```json
{
  "testType": "Generic",
  "unstructured": "tests/e2e/login.spec.ts::should login successfully"
}
```

### Creating Generic Tests

```bash
bun xray test create --project DEMO --summary "API health check" --type Generic \
  --definition "curl -s https://api.example.com/health | jq '.status'"

bun xray test create --project DEMO --summary "Login E2E" --type Generic \
  --definition "tests/e2e/login.spec.ts::should login with valid credentials"
```

### Use Cases

- Link to automated test files
- Store CLI commands for execution
- Reference external test suites
- Store test automation identifiers

## Cucumber Tests

Cucumber tests contain Gherkin feature syntax for BDD.

### Structure

```json
{
  "testType": "Cucumber",
  "gherkin": "Feature: User Login\n  Scenario: Valid login\n    Given I am on the login page\n    When I enter valid credentials\n    Then I should see the dashboard"
}
```

### Creating Cucumber Tests

```bash
bun xray test create --project DEMO --summary "Login Feature" --type Cucumber \
  --gherkin "Feature: Login
  Scenario: Valid credentials
    Given I am on the login page
    When I enter 'user@test.com' and 'password'
    Then I should see the dashboard"
```

### Multi-line Gherkin

For complex features, use a heredoc:

```bash
bun xray test create --project DEMO --summary "Complete Login Feature" --type Cucumber \
  --gherkin "$(cat <<'EOF'
Feature: User Authentication

  Background:
    Given the application is running

  Scenario: Successful login
    Given I am on the login page
    When I enter valid credentials
    And I click the login button
    Then I should be redirected to dashboard

  Scenario: Invalid password
    Given I am on the login page
    When I enter an invalid password
    Then I should see an error message
EOF
)"
```

## Type Conversion

### Changing Test Type

When restoring backups with `--sync` mode, the CLI can update test types:

```bash
# If a test exists as Manual but backup has it as Cucumber
bun xray backup restore --file backup.json --project DEMO --sync
# The test type will be updated via GraphQL mutation
```

### GraphQL Mutation

```graphql
mutation UpdateTestType($issueId: String!, $testTypeId: String!) {
  updateTestType(issueId: $issueId, testType: { id: $testTypeId }) {
    test {
      issueId
      testType { name }
    }
  }
}
```

## Best Practices

### When to Use Each Type

| Scenario | Recommended Type |
|----------|-----------------|
| Exploratory testing | Manual |
| Regression test suites (automated) | Generic |
| BDD/ATDD workflows | Cucumber |
| Step-by-step verification | Manual |
| CI/CD integration | Generic |
| Living documentation | Cucumber |

### Naming Conventions

```
Manual: "Verify [feature] [scenario]"
  Example: "Verify login with valid credentials"

Generic: "[Module] - [Test Name]"
  Example: "Auth - should authenticate user with JWT"

Cucumber: "[Feature Name]"
  Example: "User Authentication"
```

### Step Guidelines (Manual)

1. **Action**: What the tester does (imperative verb)
2. **Data**: Input values or test data needed
3. **Result**: Expected observable outcome

```
Good:
  Action: Click the "Submit" button
  Result: Form is submitted and success message appears

Bad:
  Action: Submit
  Result: Works
```

## CLI Examples

### List Tests by Type

```bash
# All Manual tests
bun xray test list --jql "project = DEMO AND 'Test Type' = Manual"

# All Cucumber tests
bun xray test list --jql "project = DEMO AND 'Test Type' = Cucumber"

# All Generic tests
bun xray test list --jql "project = DEMO AND 'Test Type' = Generic"
```

### Export by Type

```bash
# Export only tests with actual Xray data
bun xray backup export --project DEMO --only-with-data
# This filters out tests that have no steps/definition/gherkin
```
