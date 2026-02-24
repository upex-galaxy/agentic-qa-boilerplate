/**
 * Xray CLI - GraphQL Module
 *
 * GraphQL client, queries, and mutations for Xray Cloud API.
 */

import type { GraphQLResponse } from '../types/index.js';
import { XRAY_AUTH_URL, XRAY_GRAPHQL_URL } from '../types/index.js';
import { loadConfig, loadToken, saveToken } from './config.js';
import { log } from './logger.js';

// ============================================================================
// AUTHENTICATION
// ============================================================================

export async function authenticate(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(XRAY_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Authentication failed: ${response.status} - ${text}`);
  }

  const token = await response.text();
  return token.replace(/"/g, '');
}

export async function getValidToken(): Promise<string> {
  const cached = loadToken();
  if (cached) {
    return cached.token;
  }

  const config = loadConfig();
  if (!config) {
    throw new Error('Not logged in. Run: xray auth login');
  }

  log.dim('Token expired, refreshing...');
  const token = await authenticate(config.client_id, config.client_secret);
  saveToken(token);
  return token;
}

// ============================================================================
// GRAPHQL CLIENT
// ============================================================================

export async function graphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await getValidToken();

  const response = await fetch(XRAY_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL request failed: ${response.status} - ${text}`);
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors && result.errors.length > 0) {
    const errorMessages = result.errors.map(e => e.message).join('\n');
    throw new Error(`GraphQL errors:\n${errorMessages}`);
  }

  return result.data as T;
}

// ============================================================================
// QUERIES
// ============================================================================

export const QUERIES = {
  getTest: `
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
  `,

  getTests: `
    query GetTests($jql: String, $limit: Int!) {
      getTests(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          testType { name }
          jira(fields: ["key", "summary", "status"])
        }
      }
    }
  `,

  getTestExecution: `
    query GetTestExecution($issueId: String!) {
      getTestExecution(issueId: $issueId) {
        issueId
        jira(fields: ["key", "summary", "status"])
        tests(limit: 100) {
          total
          results {
            issueId
            testType { name }
            jira(fields: ["key", "summary"])
          }
        }
        testRuns(limit: 100) {
          total
          results {
            id
            status { name color }
            startedOn
            finishedOn
            test { issueId jira(fields: ["key"]) }
          }
        }
      }
    }
  `,

  getTestRunById: `
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
  `,

  getTestExecutions: `
    query GetTestExecutions($jql: String, $limit: Int!) {
      getTestExecutions(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          jira(fields: ["key", "summary", "status"])
        }
      }
    }
  `,

  getTestPlans: `
    query GetTestPlans($jql: String, $limit: Int!) {
      getTestPlans(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          jira(fields: ["key", "summary", "status"])
        }
      }
    }
  `,

  getTestSets: `
    query GetTestSets($jql: String, $limit: Int!) {
      getTestSets(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          jira(fields: ["key", "summary", "status"])
        }
      }
    }
  `,

  getTestSet: `
    query GetTestSet($issueId: String!) {
      getTestSet(issueId: $issueId) {
        issueId
        jira(fields: ["key", "summary", "status", "description"])
        tests(limit: 100) {
          total
          results {
            issueId
            testType { name }
            jira(fields: ["key", "summary"])
          }
        }
      }
    }
  `,

  getTestsFullData: `
    query GetTestsFullData($jql: String, $limit: Int!, $start: Int!) {
      getTests(jql: $jql, limit: $limit, start: $start) {
        total
        start
        limit
        results {
          issueId
          projectId
          testType { name kind }
          steps { id action data result }
          gherkin
          unstructured
          jira(fields: ["key", "summary", "description", "labels"])
        }
      }
    }
  `,

  getExecutionsFullData: `
    query GetExecutionsFullData($jql: String, $limit: Int!) {
      getTestExecutions(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          jira(fields: ["key", "summary"])
          testRuns(limit: 100) {
            total
            results {
              id
              status { name }
              comment
              defects
              startedOn
              finishedOn
              test { issueId jira(fields: ["key"]) }
              steps {
                id
                status { name }
                comment
              }
            }
          }
        }
      }
    }
  `,
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const MUTATIONS = {
  createTest: `
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
  `,

  addTestStep: `
    mutation AddTestStep($issueId: String!, $step: CreateStepInput!) {
      addTestStep(issueId: $issueId, step: $step) {
        id
        action
        data
        result
      }
    }
  `,

  updateTestStep: `
    mutation UpdateTestStep($stepId: String!, $step: UpdateStepInput!) {
      updateTestStep(stepId: $stepId, step: $step) {
        id
        action
        data
        result
      }
    }
  `,

  deleteTestStep: `
    mutation DeleteTestStep($issueId: String!, $stepId: String!) {
      deleteTestStep(issueId: $issueId, stepId: $stepId)
    }
  `,

  updateGherkinTestDefinition: `
    mutation UpdateGherkinTestDefinition($issueId: String!, $gherkin: String!) {
      updateGherkinTestDefinition(issueId: $issueId, gherkin: $gherkin) {
        issueId
        gherkin
      }
    }
  `,

  updateUnstructuredTestDefinition: `
    mutation UpdateUnstructuredTestDefinition($issueId: String!, $unstructured: String!) {
      updateUnstructuredTestDefinition(issueId: $issueId, unstructured: $unstructured) {
        issueId
        unstructured
      }
    }
  `,

  updateTestType: `
    mutation UpdateTestType($issueId: String!, $testType: UpdateTestTypeInput!) {
      updateTestType(issueId: $issueId, testType: $testType) {
        issueId
        testType {
          name
          kind
        }
      }
    }
  `,

  createTestExecution: `
    mutation CreateTestExecution(
      $projectKey: String!,
      $summary: String!,
      $description: String,
      $testIssueIds: [String]
    ) {
      createTestExecution(
        testIssueIds: $testIssueIds,
        jira: {
          fields: {
            summary: $summary,
            description: $description,
            project: { key: $projectKey }
          }
        }
      ) {
        testExecution {
          issueId
          jira(fields: ["key", "summary"])
        }
        warnings
      }
    }
  `,

  createTestPlan: `
    mutation CreateTestPlan(
      $projectKey: String!,
      $summary: String!,
      $description: String,
      $testIssueIds: [String]
    ) {
      createTestPlan(
        testIssueIds: $testIssueIds,
        jira: {
          fields: {
            summary: $summary,
            description: $description,
            project: { key: $projectKey }
          }
        }
      ) {
        testPlan {
          issueId
          jira(fields: ["key", "summary"])
        }
        warnings
      }
    }
  `,

  updateTestRunStatus: `
    mutation UpdateTestRunStatus($id: String!, $status: String!) {
      updateTestRunStatus(id: $id, status: $status)
    }
  `,

  updateTestRunComment: `
    mutation UpdateTestRunComment($id: String!, $comment: String!) {
      updateTestRunComment(id: $id, comment: $comment)
    }
  `,

  updateTestRunStepStatus: `
    mutation UpdateTestRunStepStatus($testRunId: String!, $stepId: String!, $status: String!) {
      updateTestRunStepStatus(testRunId: $testRunId, stepId: $stepId, status: $status) {
        warnings
      }
    }
  `,

  addDefectsToTestRun: `
    mutation AddDefectsToTestRun($id: String!, $issues: [String!]!) {
      addDefectsToTestRun(id: $id, issues: $issues) {
        addedDefects
        warnings
      }
    }
  `,

  addTestsToTestExecution: `
    mutation AddTestsToTestExecution($issueId: String!, $testIssueIds: [String!]!) {
      addTestsToTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) {
        addedTests
        warning
      }
    }
  `,

  removeTestsFromTestExecution: `
    mutation RemoveTestsFromTestExecution($issueId: String!, $testIssueIds: [String!]!) {
      removeTestsFromTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) {
        removedTests
        warning
      }
    }
  `,

  createTestSet: `
    mutation CreateTestSet(
      $projectKey: String!,
      $summary: String!,
      $description: String,
      $testIssueIds: [String]
    ) {
      createTestSet(
        testIssueIds: $testIssueIds,
        jira: {
          fields: {
            summary: $summary,
            description: $description,
            project: { key: $projectKey }
          }
        }
      ) {
        testSet {
          issueId
          jira(fields: ["key", "summary"])
        }
        warnings
      }
    }
  `,

  addTestsToTestSet: `
    mutation AddTestsToTestSet($issueId: String!, $testIssueIds: [String!]!) {
      addTestsToTestSet(issueId: $issueId, testIssueIds: $testIssueIds) {
        addedTests
        warning
      }
    }
  `,

  removeTestsFromTestSet: `
    mutation RemoveTestsFromTestSet($issueId: String!, $testIssueIds: [String!]!) {
      removeTestsFromTestSet(issueId: $issueId, testIssueIds: $testIssueIds) {
        removedTests
        warning
      }
    }
  `,
};
