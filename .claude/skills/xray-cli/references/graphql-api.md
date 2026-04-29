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

### Get Test

```graphql
query GetTest($issueId: String!) {
  getTest(issueId: $issueId) {
    issueId
    jira(fields: ["key", "summary", "status", "labels"])
    testType { name }
    steps { id action data result }
    gherkin
    unstructured
    precondition { issueId jira(fields: ["key"]) }
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

```graphql
query GetTestRun($id: String!) {
  getTestRun(id: $id) {
    id
    status { name }
    comment
    defects
    startedOn
    finishedOn
    steps {
      id
      action
      data
      result
      status { name }
      comment
    }
  }
}
```

## Key Mutations

### Create Test

```graphql
mutation CreateTest(
  $projectKey: String!
  $summary: String!
  $description: String
  $testTypeId: String!
) {
  createTest(
    projectKey: $projectKey
    testType: { id: $testTypeId }
    jira: { fields: { summary: $summary, description: $description } }
  ) {
    test {
      issueId
      jira(fields: ["key", "summary"])
    }
  }
}
```

### Add Test Step

```graphql
mutation AddTestStep(
  $testIssueId: String!
  $action: String!
  $data: String
  $result: String
) {
  addTestStep(
    testIssueId: $testIssueId
    step: { action: $action, data: $data, result: $result }
  ) {
    addedStep { id action data result }
  }
}
```

### Update Test Type

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
) {
  createTestExecution(
    projectKey: $projectKey
    testIssueIds: $testIssueIds
    jira: { fields: { summary: $summary } }
  ) {
    testExecution {
      issueId
      jira(fields: ["key", "summary"])
    }
  }
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

// Execute GraphQL query
const result = await graphql<ResponseType>(QUERIES.getTest, { issueId });

// Execute GraphQL mutation
const result = await graphql<ResponseType>(MUTATIONS.createTest, {
  projectKey,
  summary,
  testTypeId: 'Manual'
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
