import type { TestBooking, TestCredentials, TestHotel, TestUser } from '@data/types';

import { faker } from '@faker-js/faker';

export class DataFactory {
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

  static createCredentials(overrides?: Partial<TestCredentials>): TestCredentials {
    return {
      email: this.testEmail(),
      password: this.securePassword(),
      ...overrides,
    };
  }

  static createTestId(prefix = 'test'): string {
    return `${prefix}-${this.uniqueId()}`;
  }

  static createHotel(overrides?: Partial<TestHotel>): TestHotel {
    return {
      name: `Test Hotel ${faker.location.city()}`,
      organizationId: faker.number.int({ min: 1, max: 100 }),
      invoiceCap: faker.number.int({ min: 1000, max: 50000 }),
      ...overrides,
    };
  }

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
