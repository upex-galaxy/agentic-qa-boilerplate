/**
 * KATA Framework - Data Factory
 *
 * Generador centralizado de datos de prueba.
 * Regla de oro: NUNCA datos estáticos, siempre dinámicos con Faker.
 *
 * Acceso:
 *   - Desde componentes: this.data.createUser()
 *   - Import directo: import { DataFactory } from '@DataFactory'
 */

import type { TestBooking, TestCredentials, TestHotel, TestUser } from './types';

import { faker } from '@faker-js/faker';

export class DataFactory {
  // ============================================
  // HELPERS PRIVADOS
  // ============================================

  private static uniqueId(): string {
    return `${Date.now()}-${faker.string.alphanumeric(6)}`;
  }

  private static testEmail(prefix = 'test'): string {
    const id = faker.string.alphanumeric(6).toLowerCase();
    const name = faker.person.firstName().toLowerCase();
    return `${prefix}.${name}.${id}@example.com`;
  }

  private static securePassword(): string {
    return `Test${faker.string.alphanumeric(8)}!`;
  }

  // ============================================
  // GENERADORES PRINCIPALES
  // ============================================

  /**
   * Genera un usuario completo para testing
   * @param overrides - Propiedades a sobreescribir
   */
  static createUser(overrides?: Partial<TestUser>): TestUser {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    return {
      email: this.testEmail(),
      password: this.securePassword(),
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      ...overrides,
    };
  }

  /**
   * Genera solo credenciales (email + password)
   * @param overrides - Propiedades a sobreescribir
   */
  static createCredentials(overrides?: Partial<TestCredentials>): TestCredentials {
    return {
      email: this.testEmail(),
      password: this.securePassword(),
      ...overrides,
    };
  }

  /**
   * Genera un ID único para identificar datos de test
   * Útil para cleanup y trazabilidad
   */
  static createTestId(prefix = 'test'): string {
    return `${prefix}-${this.uniqueId()}`;
  }

  // ============================================
  // PROJECT-SPECIFIC (example structure)
  // ============================================

  /**
   * Genera datos de Hotel para testing
   * TODO: Expandir cuando se necesite
   */
  static createHotel(overrides?: Partial<TestHotel>): TestHotel {
    return {
      name: `Test Hotel ${faker.location.city()}`,
      organizationId: faker.number.int({ min: 1, max: 100 }),
      invoiceCap: faker.number.int({ min: 1000, max: 50000 }),
      ...overrides,
    };
  }

  /**
   * Genera datos de Booking para testing
   * TODO: Expandir cuando se necesite
   */
  static createBooking(overrides?: Partial<TestBooking>): TestBooking {
    return {
      confirmationNumber: `CONF-${faker.string.alphanumeric(8).toUpperCase()}`,
      hotelId: faker.number.int({ min: 1, max: 1000 }),
      stayValue: faker.number.float({ min: 100, max: 5000, fractionDigits: 2 }),
      checkInDate: faker.date.future().toISOString().split('T')[0],
      emailHash: faker.string.alphanumeric(32),
      ...overrides,
    };
  }
}

export default DataFactory;
