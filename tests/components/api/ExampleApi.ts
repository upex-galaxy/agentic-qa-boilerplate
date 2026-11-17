// Reference only: fictional endpoints; /api/example does not exist.

import type { APIResponse } from '@playwright/test';
import type { CreateExampleRequest, CreateExampleResponse, GetExampleResponse } from '@schemas/example.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';

export type { CreateExampleRequest, CreateExampleResponse, GetExampleResponse } from '@schemas/example.types';

export class ExampleApi extends ApiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  @atc('PROJ-121')
  async createResourceSuccessfully(
    payload: CreateExampleRequest,
  ): Promise<[APIResponse, CreateExampleResponse, CreateExampleRequest]> {
    const [response, body, sentPayload] = await this.apiPOST<CreateExampleResponse, CreateExampleRequest>(
      '/api/example',
      payload,
    );

    expect(response.status()).toBe(201);
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeDefined();

    if (body.token !== undefined && body.token !== '') {
      this.setAuthToken(body.token);
    }

    return [response, body, sentPayload];
  }

  @atc('PROJ-122')
  async createResourceWithInvalidData(
    payload: CreateExampleRequest,
  ): Promise<[APIResponse, Record<string, unknown>, CreateExampleRequest]> {
    const [response, body, sentPayload] = await this.apiPOST<
      Record<string, unknown>,
      CreateExampleRequest
    >('/api/example', payload);

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.ok()).toBe(false);

    return [response, body, sentPayload];
  }

  @step
  async getResourceSuccessfully(resourceId: string): Promise<[APIResponse, GetExampleResponse]> {
    const [response, body] = await this.apiGET<GetExampleResponse>(`/api/example/${resourceId}`);

    expect(response.status()).toBe(200);
    expect(body.user).toBeDefined();

    return [response, body];
  }
}
