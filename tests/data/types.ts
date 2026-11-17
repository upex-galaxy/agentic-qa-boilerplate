// Test-only types; API contract types live in api/schemas/{domain}.types.ts.

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

export interface ApiState {
  token: string
  tokenType: string
  expiresIn: number
  refreshToken: string | null
  source: 'ui-login' | 'api-login'
  createdAt: string
}
