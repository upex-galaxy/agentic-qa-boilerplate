# Test Data Management

Guía para gestión de datos de prueba en KATA framework con TypeScript + Playwright.

---

## 1. Filosofía

### Regla de Oro

**NUNCA usar datos estáticos** (excepto credenciales de login). Siempre generar datos dinámicos con Faker.

### Principios

| Principio        | Descripción                                 |
| ---------------- | ------------------------------------------- |
| **Dinámico**     | Datos generados en runtime, no hardcodeados |
| **Aislamiento**  | Cada test crea sus propios datos            |
| **Unicidad**     | UUIDs/timestamps para prevenir conflictos   |
| **Realismo**     | Datos que simulan escenarios de producción  |
| **Trazabilidad** | Prefijos identificables para cleanup        |

---

## 2. Arquitectura

### DataFactory

Clase estática centralizada en `tests/data/DataFactory.ts`.

```
tests/data/
├── DataFactory.ts      # Generador centralizado
├── types.ts            # Tipos internos
├── fixtures/           # Datos estáticos de referencia
│   └── example.json
├── uploads/            # Archivos para tests de upload
└── downloads/          # Destino de archivos descargados
```

### Acceso

DataFactory se propaga a través de TestContext:

```typescript
// Desde componentes (heredan de TestContext)
const user = this.data.createUser();

// Desde tests (via fixtures)
const user = ui.data.createUser();
const user = api.data.createUser();

// Import directo (cuando no hay contexto)
import { DataFactory } from '@DataFactory';
const user = DataFactory.createUser();
```

---

## 3. DataFactory API

### Métodos Disponibles

| Método                          | Retorna           | Descripción                                |
| ------------------------------- | ----------------- | ------------------------------------------ |
| `createUser(overrides?)`        | `TestUser`        | Usuario completo con email, password, name |
| `createCredentials(overrides?)` | `TestCredentials` | Solo email + password                      |
| `createTestId(prefix?)`         | `string`          | ID único para tracking                     |
| `createProduct(overrides?)`     | `TestProduct`     | Datos de producto (ejemplo)                |
| `createOrder(overrides?)`       | `TestOrder`       | Datos de pedido (ejemplo)                  |

### Tipos

```typescript
// tests/data/types.ts

interface TestUser {
  email: string;
  password: string;
  name: string;
  firstName?: string;
  lastName?: string;
}

interface TestCredentials {
  email: string;
  password: string;
}

interface TestHotel {
  name: string;
  organizationId?: number;
  invoiceCap?: number;
}

interface TestBooking {
  confirmationNumber: string;
  hotelId: number;
  stayValue: number;
  checkInDate: string;
  emailHash?: string;
}
```

---

## 4. Patrones de Uso

### 4.1 Objeto Completo

```typescript
// Genera todos los campos con Faker
const user = this.data.createUser();
// → { email: 'test.john.x7k2m9@example.com', password: 'TestAb3kL9mN!', name: 'John Doe', ... }
```

### 4.2 Con Overrides

```typescript
// Genera todo pero sobreescribe campos específicos
const admin = this.data.createUser({
  email: 'admin@example.com',
  name: 'Admin User',
});
// → { email: 'admin@example.com', password: 'TestAb3kL9mN!', name: 'Admin User', ... }
```

### 4.3 Solo Credenciales

```typescript
// Cuando solo necesitas email + password
const creds = this.data.createCredentials();
await this.loginPage.login(creds.email, creds.password);
```

### 4.4 ID para Tracking

```typescript
// Genera ID único para identificar datos de test
const testId = this.data.createTestId('booking');
// → 'booking-1707312000000-x7k2m9'
```

---

## 5. Uso en Componentes

### En ATCs (Layer 3)

```typescript
// tests/components/api/BookingsApi.ts
import { ApiBase } from './ApiBase';

export class BookingsApi extends ApiBase {
  @atc('BOOK-API-001')
  async createBookingSuccessfully(overrides?: Partial<TestBooking>) {
    // Genera datos dinámicos
    const booking = this.data.createBooking(overrides);

    const response = await this.post('/api/bookings', { data: booking });
    expect(response.status()).toBe(201);

    return [response, await response.json(), booking] as const;
  }
}
```

### En UI Components

```typescript
// tests/components/ui/RegistrationPage.ts
import { UiBase } from './UiBase';

export class RegistrationPage extends UiBase {
  @atc('REG-UI-001')
  async registerNewUser(overrides?: Partial<TestUser>) {
    const user = this.data.createUser(overrides);

    await this.page.fill('[data-testid="email"]', user.email);
    await this.page.fill('[data-testid="password"]', user.password);
    await this.page.fill('[data-testid="name"]', user.name);
    await this.page.click('[data-testid="submit"]');

    await expect(this.page).toHaveURL(/.*dashboard.*/);
    return user;
  }
}
```

---

## 6. Uso en Tests

### E2E Tests

```typescript
// tests/e2e/registration/registration.test.ts
import { test, expect } from '@TestFixture';

test.describe('User Registration', () => {
  test('should register new user successfully', async ({ ui }) => {
    // ARRANGE - DataFactory genera datos dinámicos
    const user = ui.data.createUser();

    // ACT - ATC usa los datos
    await ui.registration.registerNewUser(user);

    // ASSERT
    await expect(ui.page.locator('[data-testid="welcome"]')).toContainText(user.name);
  });

  test('should register user with specific email', async ({ ui }) => {
    // Override específico para este test
    const user = ui.data.createUser({
      email: 'vip@example.com',
    });

    await ui.registration.registerNewUser(user);
  });
});
```

### Integration Tests

```typescript
// tests/integration/bookings/bookings.test.ts
import { test, expect } from '@TestFixture';

test.describe('Bookings API', () => {
  test('should create booking with generated data', async ({ api }) => {
    // ARRANGE
    const booking = api.data.createBooking({
      hotelId: 123, // Hotel específico
      stayValue: 500, // Valor fijo para validar
    });

    // ACT
    const [response, body] = await api.bookings.createBookingSuccessfully(booking);

    // ASSERT
    expect(body.stayValue).toBe(500);
    expect(body.confirmationNumber).toMatch(/^CONF-[A-Z0-9]{8}$/);
  });
});
```

---

## 7. Extender DataFactory

### Agregar Nuevos Generadores

```typescript
// tests/data/DataFactory.ts

export class DataFactory {
  // ... métodos existentes ...

  /**
   * Genera datos de Newsletter para testing
   */
  static createNewsletter(overrides?: Partial<TestNewsletter>): TestNewsletter {
    return {
      name: `Newsletter ${faker.date.month()} ${faker.date.year()}`,
      hotelId: faker.number.int({ min: 1, max: 1000 }),
      sentDate: faker.date.recent().toISOString(),
      recipientCount: faker.number.int({ min: 100, max: 10000 }),
      ...overrides,
    };
  }
}
```

### Agregar Nuevos Tipos

```typescript
// tests/data/types.ts

export interface TestNewsletter {
  name: string;
  hotelId: number;
  sentDate: string;
  recipientCount: number;
}
```

---

## 8. Fixtures Estáticos

Para datos de referencia que no cambian, usar `tests/data/fixtures/`.

### Cuándo Usar Fixtures

| Usar Fixtures Para      | Usar DataFactory Para       |
| ----------------------- | --------------------------- |
| Roles/permisos fijos    | Usuarios de test            |
| Catálogos de referencia | Datos transaccionales       |
| Respuestas mock de API  | Payloads de request         |
| Configuraciones         | Datos con lógica de negocio |

### Ejemplo de Fixture

```json
// tests/data/fixtures/roles.json
{
  "admin": {
    "name": "Administrator",
    "permissions": ["read", "write", "delete", "admin"]
  },
  "hotel_manager": {
    "name": "Hotel Manager",
    "permissions": ["read", "write", "reconcile"]
  },
  "viewer": {
    "name": "Viewer",
    "permissions": ["read"]
  }
}
```

### Uso de Fixtures

```typescript
import roles from '@data/fixtures/roles.json';

test('admin can delete', async ({ api }) => {
  const user = api.data.createUser();
  // Usar rol fijo del fixture
  await api.users.assignRole(user.id, roles.admin);
});
```

---

## 9. Aislamiento de Datos

### Identificadores Únicos

DataFactory genera identificadores únicos automáticamente:

```typescript
// Email único: test.john.x7k2m9@example.com
// Patrón: {prefix}.{nombre}.{6-chars-random}@example.com

// TestId único: test-1707312000000-x7k2m9
// Patrón: {prefix}-{timestamp}-{6-chars-random}
```

### Ejecución Paralela

Para tests en paralelo, los datos generados son automáticamente únicos por timestamp + random string.

```typescript
// playwright.config.ts
export default defineConfig({
  workers: 4, // 4 tests en paralelo
});

// Cada worker genera datos únicos automáticamente
// No hay colisiones gracias a timestamp + random
```

---

## 10. Credenciales y Datos Sensibles

### Credenciales de Login

**Excepción a la regla**: Credenciales de usuarios existentes vienen de variables de entorno.

```typescript
// config/variables.ts
export const config = {
  testUser: {
    email: process.env.LOCAL_USER_EMAIL!,
    password: process.env.LOCAL_USER_PASSWORD!,
  },
};

// Uso en tests
const { email, password } = api.config.testUser;
await api.auth.loginSuccessfully({ email, password });
```

### Variables de Entorno

```env
# .env (no commitear)
LOCAL_USER_EMAIL=test@example.com
LOCAL_USER_PASSWORD=SecurePassword123!
DEVSTAGE_USER_EMAIL=staging@example.com
DEVSTAGE_USER_PASSWORD=StagingPassword123!
```

---

## 11. Best Practices

### DO

- Usar `this.data.createX()` en componentes
- Usar `ui.data.createX()` o `api.data.createX()` en tests
- Pasar overrides solo cuando sea necesario
- Generar datos nuevos para cada test
- Usar prefijos identificables (`test.`, `CONF-`)

### DON'T

- Hardcodear emails, nombres, o valores
- Compartir datos entre tests
- Usar datos de producción en tests
- Crear generadores sin tipos TypeScript
- Importar faker directamente (usar DataFactory)

---

## 12. Referencia Rápida

```typescript
// Acceso desde componentes
this.data.createUser();
this.data.createCredentials();
this.data.createTestId('prefix');
this.data.createHotel();
this.data.createBooking();

// Acceso desde tests
ui.data.createUser();
api.data.createUser();

// Import directo
import { DataFactory } from '@DataFactory';
DataFactory.createUser();

// Con overrides
this.data.createUser({ email: 'fixed@test.com' });
this.data.createBooking({ hotelId: 123, stayValue: 500 });
```

---

## 13. Recursos

- **Faker Documentation**: https://fakerjs.dev/
- **Playwright Test Fixtures**: https://playwright.dev/docs/test-fixtures
- **Test Data Patterns**: https://martinfowler.com/bliki/TestDataBuilder.html
