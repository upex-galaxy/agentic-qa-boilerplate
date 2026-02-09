/**
 * KATA Framework - Data Factory Types
 *
 * Tipos internos para generación de datos de prueba.
 * Diseñados para ser compatibles con OpenAPI types cuando sea necesario.
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
// Auth Types
// ============================================

/**
 * Token response from authentication endpoints
 * Compatible with IdentityServer4 token response
 */
export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

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
