# Xray Cloud GraphQL API Reference

## API Endpoints

| Endpoint | URL |
|----------|-----|
| Authentication | `https://xray.cloud.getxray.app/api/v2/authenticate` |
| GraphQL | `https://xray.cloud.getxray.app/api/v2/graphql` |
| REST Import | `https://xray.cloud.getxray.app/api/v2/import/execution/*` |

## Authentication

### Get Token

```bash
curl -X POST https://xray.cloud.getxray.app/api/v2/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "YOUR_CLIENT_ID", "client_secret": "YOUR_CLIENT_SECRET"}'
```

Response: JWT token string (valid for 24 hours)

### Use Token

```bash
curl https://xray.cloud.getxray.app/api/v2/graphql \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query": "..."}'
```

## Key Queries

### Get Test (single)

There is no `getTest(issueId:)` in the CLI — a single test is fetched through
`getTests` with a `key = X` JQL and `limit: 1` (`QUERIES.getTest`):

```graphql
query GetTest($jql: String!) {
  getTests(jql: $jql, limit: 1) {
    results {
      issueId
      projectId
      testType { name }
      steps { id action data result }
      gherkin
      unstructured
      preconditions(limit: 10) { results { issueId jira(fields: ["key", "summary"]) } }
      jira(fields: ["key", "summary", "description", "status", "labels"])
    }
  }
}
```

### Get Test By Id

Same projection, addressed by numeric `issueId` instead of JQL
(`QUERIES.getTestById`). issueIds are the only stable handle during a
cross-site migration, where the same key resolves to a different id per site:

```graphql
query GetTestById($issueIds: [String]) {
  getTests(issueIds: $issueIds, limit: 1) {
    results {
      issueId
      projectId
      testType { name }
      steps { id action data result }
      gherkin
      unstructured
      preconditions(limit: 10) { results { issueId jira(fields: ["key", "summary"]) } }
      jira(fields: ["key", "summary", "description", "status", "labels"])
    }
  }
}
```

### Get Tests (List)

```graphql
query GetTests($jql: String, $limit: Int!) {
  getTests(jql: $jql, limit: $limit) {
    total
    results {
      issueId
      jira(fields: ["key", "summary", "status"])
      testType { name }
    }
  }
}
```

### Get Test Execution

```graphql
query GetTestExecution($issueId: String!) {
  getTestExecution(issueId: $issueId) {
    issueId
    jira(fields: ["key", "summary", "status"])
    testRuns(limit: 100) {
      total
      results {
        id
        status { name }
        test { issueId jira(fields: ["key", "summary"]) }
      }
    }
  }
}
```

### Get Test Run

The run query is `getTestRunById(id:)` — NOT `getTestRun` (`QUERIES.getTestRunById`):

```graphql
query GetTestRunById($id: String!) {
  getTestRunById(id: $id) {
    id
    status { name color description }
    comment
    startedOn
    finishedOn
    defects
    evidence { id filename }
    steps {
      id
      action
      data
      result
      comment
      status { name color }
    }
    test { issueId jira(fields: ["key", "summary"]) }
    testExecution { issueId jira(fields: ["key"]) }
  }
}
```

## Key Mutations

### Create Test

The test type is passed as an `UpdateTestTypeInput!` object (e.g.
`{ name: "Manual" }`), the project key travels inside `jira.fields.project`,
and inline `steps` are accepted by the schema but silently dropped by Xray
Cloud — see the Manual-steps gotcha in SKILL.md (always `addTestStep` after):

```graphql
mutation CreateTest(
  $testType: UpdateTestTypeInput!,
  $steps: [CreateStepInput],
  $unstructured: String,
  $gherkin: String,
  $projectKey: String!,
  $summary: String!,
  $description: String,
  $labels: [String],
  $folderPath: String
) {
  createTest(
    testType: $testType,
    steps: $steps,
    unstructured: $unstructured,
    gherkin: $gherkin,
    folderPath: $folderPath,
    jira: {
      fields: {
        summary: $summary,
        description: $description,
        labels: $labels,
        project: { key: $projectKey }
      }
    }
  ) {
    test {
      issueId
      testType { name }
      jira(fields: ["key", "summary"])
    }
    warnings
  }
}
```

### Add Test Step

```graphql
mutation AddTestStep($issueId: String!, $step: CreateStepInput!) {
  addTestStep(issueId: $issueId, step: $step) {
    id
    action
    data
    result
  }
}
```

### Update Test Step

Backs `bun xray test update-step <test> --step <stepId>` — partial update, only
the fields present in the input change.

```graphql
mutation UpdateTestStep($stepId: String!, $step: UpdateStepInput!) {
  updateTestStep(stepId: $stepId, step: $step) {
    id
    action
    data
    result
  }
}
```

### Delete Test Step

Backs `bun xray test remove-step --test <id> --step <stepId>`.

```graphql
mutation DeleteTestStep($issueId: String!, $stepId: String!) {
  deleteTestStep(issueId: $issueId, stepId: $stepId)
}
```

### Update Test Type

The type is an `UpdateTestTypeInput!` object (`{ name: "Cucumber" }`), not a
bare id string:

```graphql
mutation UpdateTestType($issueId: String!, $testType: UpdateTestTypeInput!) {
  updateTestType(issueId: $issueId, testType: $testType) {
    issueId
    testType {
      name
      kind
    }
  }
}
```

### Preconditions

These mutations have dedicated CLI commands (`bun xray precondition create` /
`add-to-test` / `update` / `remove-from-test`; reads via `precondition list` /
`get`) — no need to drop to raw GraphQL. The type input is
`UpdatePreconditionTypeInput!` (e.g. `{ name: "Manual" }`) and the project key
travels inside `jira.fields.project`:

```graphql
mutation CreatePrecondition(
  $preconditionType: UpdatePreconditionTypeInput!,
  $definition: String,
  $projectKey: String!,
  $summary: String!,
  $description: String,
  $labels: [String],
  $folderPath: String
) {
  createPrecondition(
    preconditionType: $preconditionType,
    definition: $definition,
    folderPath: $folderPath,
    jira: {
      fields: {
        summary: $summary,
        description: $description,
        labels: $labels,
        project: { key: $projectKey }
      }
    }
  ) {
    precondition {
      issueId
      preconditionType { name }
      jira(fields: ["key", "summary"])
    }
    warnings
  }
}

mutation AddPreconditionsToTest($issueId: String!, $preconditionIssueIds: [String]!) {
  addPreconditionsToTest(issueId: $issueId, preconditionIssueIds: $preconditionIssueIds) {
    addedPreconditions
    warning
  }
}

mutation RemovePreconditionsFromTest($issueId: String!, $preconditionIssueIds: [String]!) {
  removePreconditionsFromTest(issueId: $issueId, preconditionIssueIds: $preconditionIssueIds)
}

mutation UpdatePrecondition($issueId: String!, $data: UpdatePreconditionInput!) {
  updatePrecondition(issueId: $issueId, data: $data) {
    issueId
    definition
  }
}
```

### Add Test Environments To Test Execution

Backs `bun xray exec create --environment <e>` and `bun xray exec set-environment`.
Pinning an execution to a Test Environment makes results congruent and comparable
across environments (e.g. a `staging` run is never blindly compared with a `production`
run).

```graphql
mutation AddTestEnvironmentsToTestExecution(
  $issueId: String!
  $testEnvironments: [String]!
) {
  addTestEnvironmentsToTestExecution(issueId: $issueId, testEnvironments: $testEnvironments) {
    associatedTestEnvironments
    warning
  }
}
```

### Update Test Run Status

```graphql
mutation UpdateTestRunStatus($id: String!, $status: String!) {
  updateTestRunStatus(id: $id, status: $status) {
    testRun { id status { name } }
  }
}
```

### Create Test Execution

```graphql
mutation CreateTestExecution(
  $projectKey: String!
  $summary: String!
  $testIssueIds: [String]
  $testEnvironments: [String]
) {
  createTestExecution(
    projectKey: $projectKey
    testIssueIds: $testIssueIds
    testEnvironments: $testEnvironments
    jira: { fields: { summary: $summary } }
  ) {
    testExecution {
      issueId
      jira(fields: ["key", "summary"])
    }
  }
}
```

> `testEnvironments` is supplied by `bun xray exec create --environment <e>` (repeatable
> or comma-separated). For an existing execution use `bun xray exec set-environment`
> (backed by `addTestEnvironmentsToTestExecution`, below).

### Test Plan ↔ Test Execution Association

Backs `bun xray plan add-executions <plan> --executions <keys>`. This is the
Xray-internal Plan↔Execution association (the Execution shows up under the
Plan's board) — distinct from any Jira issue link.

```graphql
mutation AddTestExecutionsToTestPlan($issueId: String!, $testExecIssueIds: [String]!) {
  addTestExecutionsToTestPlan(issueId: $issueId, testExecIssueIds: $testExecIssueIds) {
    addedTestExecutions
    warning
  }
}

mutation RemoveTestExecutionsFromTestPlan($issueId: String!, $testExecIssueIds: [String]!) {
  removeTestExecutionsFromTestPlan(issueId: $issueId, testExecIssueIds: $testExecIssueIds)
}
```

### Add Evidence To Test Run

Attaches one or more files (screenshots, PDFs, logs, ...) to a Test Run. Each
attachment is sent as base64-encoded data inside the GraphQL variables — there
is no multipart endpoint. Xray Cloud caps the request body at **20 MB**, so
the CLI auto-chunks large batches at ~15 MB of base64 to keep headroom for
the GraphQL envelope.

```graphql
mutation AddEvidenceToTestRun(
  $id: String!
  $evidence: [AttachmentDataInput!]!
) {
  addEvidenceToTestRun(id: $id, evidence: $evidence) {
    addedEvidence
    warnings
  }
}
```

`AttachmentDataInput` shape:

```jsonc
{
  "filename":  "login-error.png",
  "mimeType":  "image/png",
  "data":      "iVBORw0KGgoAAAANSUhEUgAA...truncated-base64..."
}
```

Helper used by the CLI (`cli/xray/lib/evidence.ts`):

```typescript
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const buf = readFileSync('./screenshots/login-error.png');
const attachment: AttachmentDataInput = {
  filename: basename('./screenshots/login-error.png'),
  mimeType: 'image/png',
  data: buf.toString('base64'),
};
```

### Add Evidence To Test Run Step

Same payload shape, scoped to a single step within a run.

```graphql
mutation AddEvidenceToTestRunStep(
  $testRunId: String!
  $stepId: String!
  $evidence: [AttachmentDataInput!]!
) {
  addEvidenceToTestRunStep(
    testRunId: $testRunId
    stepId: $stepId
    evidence: $evidence
  ) {
    addedEvidence
    warnings
  }
}
```

### Remove Evidence From Test Run

Either pass `evidenceIds` (returned by `getTestRunById { evidence { id } }`)
or `evidenceFilenames` — the CLI exposes both via `--evidence` and `--filename`.

```graphql
mutation RemoveEvidenceFromTestRun(
  $id: String!
  $evidenceFilenames: [String!]
  $evidenceIds: [String!]
) {
  removeEvidenceFromTestRun(
    id: $id
    evidenceFilenames: $evidenceFilenames
    evidenceIds: $evidenceIds
  ) {
    removedEvidence
    warnings
  }
}
```

### Evidence upload patterns: GraphQL vs REST import

| Pattern | When to use | How |
|---|---|---|
| GraphQL `addEvidenceToTestRun` | Adding evidence to an existing run after manual or post-hoc execution | `bun xray run evidence` |
| GraphQL `addEvidenceToTestRunStep` | Step-level screenshots/logs | `bun xray run step-evidence` |
| REST `/api/v2/import/execution` with embedded `evidence[]` | Bulk-importing JUnit/Cucumber/Xray-JSON results that already contain attachments | `bun xray import xray --file ...` |

For the REST path, the `evidence` array is part of each test object inside the JSON body and uses the same `{ data, filename, contentType }` triplet (note: `contentType` instead of `mimeType` in the REST schema).

## Verified API limits (schema introspection, 2026-08)

Two hard boundaries of the Xray Cloud GraphQL schema, verified by introspection —
do not go looking for mutations that do not exist:

- **No coverage mutation.** Requirement coverage ("this Story is covered") is not
  an Xray GraphQL concept at write time — it is the **Jira issue link** whose
  inward description is `is tested by` (link-type slug `test` in
  `.agents/jira-required.yaml`). Write it via `bun xray link create <FROM> <TO>
  --type test` (Jira REST `POST /rest/api/3/issueLink`), never via GraphQL.
  GraphQL only *reads* coverage (`coverableIssues` on a Test).
- **Datasets/parametrization are READ-only.** The schema exposes `getDataset` /
  `getDatasets` queries and **zero** dataset mutations, so parameter values and
  shared Parameter Lists cannot be created or edited by any API client — they
  are UI-managed. Parametrizing Manual tests is therefore a **documented
  convention** (Gherkin `Scenario Outline` + `Examples` via `--gherkin`, or
  Manual step `data` fields), not a CLI feature. See "Parametrized Tests" in
  SKILL.md.

## Test Types

| Type | ID | Use Case |
|------|----|---------|
| Manual | `Manual` | Step-by-step test cases |
| Generic | `Generic` | Automated tests with definition |
| Cucumber | `Cucumber` | BDD tests with Gherkin |

## Test Run Statuses

| Status | Description |
|--------|-------------|
| `TODO` | Not started |
| `EXECUTING` | In progress |
| `PASSED` | Test passed |
| `FAILED` | Test failed |
| `ABORTED` | Test aborted |
| `BLOCKED` | Test blocked by dependency |

## GraphQL Schema Explorer

Full schema documentation available at:
`https://us.xray.cloud.getxray.app/doc/graphql/index.html`

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid or expired token | Re-authenticate |
| `400 Bad Request` | Invalid GraphQL query | Check query syntax |
| `403 Forbidden` | Insufficient permissions | Check API credentials |

### Rate Limits

Xray Cloud has rate limits. For bulk operations:
- Use batch sizes of 100 or less
- Add delays between requests if hitting limits
- The CLI handles batching automatically

## CLI Implementation

The Xray CLI wraps these APIs in `cli/xray/lib/graphql.ts`:

```typescript
// Authenticate and get valid token
const token = await getValidToken();

// Execute GraphQL query (single test = getTests with a key JQL, limit 1)
const result = await graphql<ResponseType>(QUERIES.getTest, { jql: `key = ${key}` });

// Execute GraphQL mutation (test type is an UpdateTestTypeInput object)
const result = await graphql<ResponseType>(MUTATIONS.createTest, {
  projectKey,
  summary,
  testType: { name: 'Manual' },
});
```

## REST API for Imports

### JUnit Import

```bash
POST /api/v2/import/execution/junit?projectKey=DEMO
Content-Type: application/xml

<testsuites>...</testsuites>
```

### Cucumber Import

```bash
POST /api/v2/import/execution/cucumber?projectKey=DEMO
Content-Type: application/json

[{"keyword": "Feature", ...}]
```

### Xray JSON Import

```bash
POST /api/v2/import/execution
Content-Type: application/json

{"testExecutionKey": "DEMO-100", "tests": [...]}
```
