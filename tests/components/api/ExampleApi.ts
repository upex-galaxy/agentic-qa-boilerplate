/**
 * KATA Architecture - Layer 3: Example API Component
 *
 * ⚠️  REFERENCE ONLY - THIS COMPONENT USES FICTIONAL ENDPOINTS
 *
 * This file demonstrates the KATA pattern for API components.
 * Endpoints like '/api/example' don't exist - they are placeholders.
 * Use this as a structural guide, not as runnable code.
 *
 * To create your own functional component:
 * 1. Copy this file to tests/components/api/YourApi.ts
 * 2. Replace fictional endpoints with your real API endpoints
 * 3. Update types to match your API's request/response schemas
 * 4. Register in ApiFixture.ts
 * 5. Run: bun run kata:manifest
 *
 * KATA Principles Demonstrated:
 * - ATCs are COMPLETE test cases (mini-flows), NOT single API calls
 * - Each ATC has a UNIQUE expected output (Equivalence Partitioning)
 * - Tuple returns: [APIResponse, TBody, TPayload] for type-safe access
 * - Fixed assertions validate the ATC succeeded
 */

import type { APIResponse } from '@playwright/test';
import type { CreateExampleRequest, CreateExampleResponse, GetExampleResponse } from '@schemas/example.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';

// Re-export types for consumers that import from ExampleApi
export type { CreateExampleRequest, CreateExampleResponse, GetExampleResponse } from '@schemas/example.types';

// ============================================
// Example API Component
// ============================================

export class ExampleApi extends ApiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  /**
   * ATC: POST request with valid payload - expects success (200/201)
   *
   * Complete flow: POST data, validate response structure.
   * Returns the response tuple for test assertions.
   *
   * TODO: Replace 'PROJ' with your Jira project key (e.g., @atc('UPEX-101'))
   * TODO: Update endpoint path
   */
  @atc('PROJ-121')
  async createResourceSuccessfully(
    payload: CreateExampleRequest,
  ): Promise<[APIResponse, CreateExampleResponse, CreateExampleRequest]> {
    // TODO: Update endpoint
    const [response, body, sentPayload] = await this.apiPOST<CreateExampleResponse, CreateExampleRequest>(
      '/api/example',
      payload,
    );

    // Fixed assertions - validates the operation succeeded
    expect(response.status()).toBe(201);
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeDefined();

    // Optional: Store token for subsequent requests
    if (body.token !== undefined && body.token !== '') {
      this.setAuthToken(body.token);
    }

    return [response, body, sentPayload];
  }

  /**
   * ATC: POST request with invalid payload - expects error (400/401)
   *
   * Validates that invalid data returns appropriate error.
   *
   * TODO: Replace 'PROJ' with your Jira project key (e.g., @atc('UPEX-102'))
   * TODO: Update endpoint path
   */
  @atc('PROJ-122')
  async createResourceWithInvalidData(
    payload: CreateExampleRequest,
  ): Promise<[APIResponse, Record<string, unknown>, CreateExampleRequest]> {
    // TODO: Update endpoint
    const [response, body, sentPayload] = await this.apiPOST<
      Record<string, unknown>,
      CreateExampleRequest
    >('/api/example', payload);

    // Fixed assertions - validates error response
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.ok()).toBe(false);

    return [response, body, sentPayload];
  }

  /**
   * HELPER: read-only GET.
   *
   * NOT an ATC, and this is the whole point of the example. An ATC is a
   * complete mini-flow that CHANGES STATE (Precondition + Action +
   * Assertions); a bare read is a helper, decorated `@step` so it still shows
   * up in the trace and the Allure tree. `kata-architecture.md` §6 Rule 7
   * prints the opposite shape verbatim as WRONG.
   *
   * The fixed assertions stay: a helper may assert its own contract. What it
   * may not do is claim a TMS test-case id for an operation that tests nothing
   * a user can do.
   *
   * TODO: Update endpoint path
   */
  @step
  async getResourceSuccessfully(resourceId: string): Promise<[APIResponse, GetExampleResponse]> {
    // TODO: Update endpoint
    const [response, body] = await this.apiGET<GetExampleResponse>(`/api/example/${resourceId}`);

    // Fixed assertions
    expect(response.status()).toBe(200);
    expect(body.user).toBeDefined();

    return [response, body];
  }
}
