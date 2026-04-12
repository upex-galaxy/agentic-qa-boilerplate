/**
 * KATA Architecture - Test Data Types
 *
 * Types for test data generation and fixture state.
 * These are TEST-ONLY concepts — NOT API contract types.
 *
 * API contract types (request/response schemas) belong in:
 *   api/schemas/{domain}.types.ts → import from '@schemas/{domain}.types'
 */

// ============================================
// Generic Types
// ============================================

export interface TestUser {
  email: string
  password: string
  name: string
  firstName?: string
  lastName?: string
}

export interface TestCredentials {
  email: string
  password: string
}

// ============================================
// Project-Specific Types (example structure)
// ============================================

export interface TestHotel {
  name: string
  organizationId?: number
  invoiceCap?: number
}

export interface TestBooking {
  confirmationNumber: string
  hotelId: number
  stayValue: number
  checkInDate: string
  emailHash?: string
}

// ============================================
// Auth/Fixture State Types
// ============================================

/**
 * Stored API state for test fixtures
 * Used by setup files and TestFixture for token propagation
 */
export interface ApiState {
  token: string
  tokenType: string
  expiresIn: number
  refreshToken: string | null
  source: 'ui-login' | 'api-login'
  createdAt: string
}
