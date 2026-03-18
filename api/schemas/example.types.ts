/**
 * KATA Framework - Type Facade: Example Domain
 *
 * ⚠️  REFERENCE ONLY — THIS FILE USES FICTIONAL SCHEMA NAMES
 *
 * This file demonstrates the Type Facade Pattern for organizing OpenAPI types.
 * Schema names like 'ExampleModel' don't exist — they are placeholders.
 * Use this as a structural guide when creating your own domain type facades.
 *
 * To create a new type facade:
 * 1. Copy this file to api/schemas/{domain}.types.ts
 * 2. Replace fictional schemas with your real OpenAPI schema names
 * 3. Add re-export to api/schemas/index.ts
 * 4. Import in your component: import type { X } from '@schemas/{domain}.types'
 *
 * Prerequisites:
 * - Run `bun run api:sync` to generate api/openapi-types.ts
 * - Check available schemas: open api/openapi-types.ts and search for 'schemas'
 *
 * Sections:
 * 1. Schema Types — domain models from components['schemas']
 * 2. Endpoint Types — request/response types from paths[...], grouped by endpoint
 * 3. Custom Types — types NOT in the spec (error shapes, test helpers, etc.)
 */

import type { components, paths } from '@openapi';

// ============================================================================
// Schema Types (from components.schemas)
// ============================================================================

/** TODO: Replace with your actual schema name from openapi-types.ts */
export type ExampleModel = components['schemas']['ExampleModel'];

/** TODO: Replace with your actual schema name */
export type ExampleListModel = components['schemas']['ExampleListModel'];

// ============================================================================
// Endpoint Types - POST /api/example
// ============================================================================

/** Private helper: extracts the POST operation type for cleaner access */
type CreateExamplePath = paths['/api/example']['post'];

/** Request body for creating an example resource */
export type CreateExampleRequest = CreateExamplePath['requestBody']['content']['application/json'];

/** Successful response (201) */
export type CreateExampleResponse = CreateExamplePath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - GET /api/example/{id}
// ============================================================================

type GetExamplePath = paths['/api/example/{id}']['get'];

/** Path parameters (e.g., { id: string }) */
export type GetExampleParams = GetExamplePath['parameters']['path'];

/** Successful response (200) */
export type GetExampleResponse = GetExamplePath['responses']['200']['content']['application/json'];

// ============================================================================
// Endpoint Types - PUT /api/example/{id}
// ============================================================================

type UpdateExamplePath = paths['/api/example/{id}']['put'];

export type UpdateExampleRequest = UpdateExamplePath['requestBody']['content']['application/json'];
export type UpdateExampleResponse = UpdateExamplePath['responses']['200']['content']['application/json'];

// ============================================================================
// Custom Types (not in OpenAPI spec)
// ============================================================================

/**
 * Types that are NOT in the OpenAPI spec go here.
 * Common cases: error response shapes not documented, test helpers,
 * or types for endpoints that lack schema definitions.
 */
export interface ExampleErrorResponse {
  error: string
  message?: string
  statusCode?: number
}
