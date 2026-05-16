# Data-Driven Testing (Parametrización)

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** QA Engineers que quieren crear tests más mantenibles y escalables

---

## ¿Qué es Data-Driven Testing?

**Data-Driven Testing** es una técnica donde los datos de prueba se separan de la lógica del test. El mismo test se ejecuta múltiples veces con diferentes conjuntos de datos.

```
┌─────────────────────────────────────────────────────────────────┐
│                     SIN DATA-DRIVEN                              │
│                                                                  │
│   test('login admin')    { ... }                                 │
│   test('login customer') { ... }   ← Lógica duplicada           │
│   test('login guest')    { ... }                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     CON DATA-DRIVEN                              │
│                                                                  │
│   testData = [admin, customer, guest]                           │
│                     ↓                                            │
│   for (const user of testData) {                                │
│     test(`login ${user.role}`) { ... }  ← Una sola vez          │
│   }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## ¿Por qué Usar Data-Driven Testing?

| Beneficio | Descripción |
|-----------|-------------|
| **DRY** | No repites la misma lógica de test |
| **Escalabilidad** | Agregar casos es agregar una línea de datos |
| **Mantenibilidad** | Cambias la lógica en un solo lugar |
| **Cobertura** | Fácil probar múltiples combinaciones |
| **Legibilidad** | Los datos documentan los casos |

---

## Enfoques de Parametrización

### 1. Datos Inline

Los datos están directamente en el archivo de test:

```typescript
import { test, expect } from '@playwright/test';

const loginCases = [
  { role: 'admin', email: 'admin@test.com', expectedPage: '/admin' },
  { role: 'customer', email: 'user@test.com', expectedPage: '/dashboard' },
  { role: 'guest', email: 'guest@test.com', expectedPage: '/browse' },
];

for (const { role, email, expectedPage } of loginCases) {
  test(`login as ${role} redirects to ${expectedPage}`, async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(expectedPage);
  });
}
```

**Cuándo usar:** Pocos casos, datos simples.

### 2. Datos en Archivo Externo (JSON)

```json
// tests/data/login-cases.json
[
  {
    "role": "admin",
    "email": "admin@test.com",
    "password": "AdminPass123!",
    "expectedPage": "/admin",
    "permissions": ["read", "write", "delete"]
  },
  {
    "role": "customer",
    "email": "customer@test.com",
    "password": "CustomerPass123!",
    "expectedPage": "/dashboard",
    "permissions": ["read"]
  }
]
```

```typescript
import loginCases from './data/login-cases.json';

for (const testCase of loginCases) {
  test(`${testCase.role} has correct permissions`, async ({ page }) => {
    // ... test logic
  });
}
```

**Cuándo usar:** Muchos casos, datos compartidos entre tests.

### 3. Generación Dinámica con Faker

```typescript
import { faker } from '@faker-js/faker';

function generateUserData() {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      zip: faker.location.zipCode(),
    },
  };
}

test('user registration with dynamic data', async ({ page }) => {
  const userData = generateUserData();

  await page.goto('/register');
  await page.fill('#name', userData.name);
  await page.fill('#email', userData.email);
  // ...
});
```

**Cuándo usar:** Tests que necesitan datos únicos, evitar colisiones.

---

## Playwright: Métodos de Parametrización

### `test.describe.configure({ mode: 'parallel' })`

Ejecutar casos en paralelo:

```typescript
test.describe('Login tests', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const role of ['admin', 'user', 'guest']) {
    test(`login as ${role}`, async ({ page }) => {
      // Cada test corre en paralelo
    });
  }
});
```

### Fixtures Parametrizados

```typescript
// fixtures.ts
import { test as base } from '@playwright/test';

type UserRole = 'admin' | 'customer' | 'guest';

export const test = base.extend<{ userRole: UserRole }>({
  userRole: ['customer', { option: true }],
});

// test.spec.ts
import { test } from './fixtures';

test.use({ userRole: 'admin' });

test('admin can delete users', async ({ page, userRole }) => {
  console.log(`Testing as: ${userRole}`);
});
```

### Proyectos en `playwright.config.ts`

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    {
      name: 'admin-tests',
      use: { userRole: 'admin' },
      testMatch: '**/admin/**',
    },
    {
      name: 'customer-tests',
      use: { userRole: 'customer' },
      testMatch: '**/customer/**',
    },
  ],
});
```

---

## Patrones de Organización de Datos

### Patrón 1: Test Data Builders

```typescript
// builders/UserBuilder.ts
export class UserBuilder {
  private data = {
    name: 'Default User',
    email: 'default@test.com',
    role: 'customer',
  };

  withName(name: string) {
    this.data.name = name;
    return this;
  }

  withEmail(email: string) {
    this.data.email = email;
    return this;
  }

  asAdmin() {
    this.data.role = 'admin';
    return this;
  }

  build() {
    return { ...this.data };
  }
}

// Uso en test
const adminUser = new UserBuilder()
  .withName('Admin User')
  .asAdmin()
  .build();
```

### Patrón 2: Fixtures por Escenario

```
tests/
├── data/
│   ├── fixtures/
│   │   ├── users.json
│   │   ├── products.json
│   │   └── orders.json
│   └── scenarios/
│       ├── checkout-happy-path.json
│       ├── checkout-payment-failure.json
│       └── checkout-out-of-stock.json
```

```typescript
// checkout-happy-path.json
{
  "name": "Happy Path Checkout",
  "user": { "type": "customer", "hasPaymentMethod": true },
  "cart": [
    { "product": "widget", "quantity": 2 }
  ],
  "expected": {
    "orderStatus": "confirmed",
    "emailSent": true
  }
}
```

### Patrón 3: Factory Functions

```typescript
// factories/index.ts
import { faker } from '@faker-js/faker';

export const factories = {
  user: (overrides = {}) => ({
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    createdAt: faker.date.past(),
    ...overrides,
  }),

  product: (overrides = {}) => ({
    id: faker.string.uuid(),
    name: faker.commerce.productName(),
    price: parseFloat(faker.commerce.price()),
    stock: faker.number.int({ min: 0, max: 100 }),
    ...overrides,
  }),

  order: (user, products) => ({
    id: faker.string.uuid(),
    userId: user.id,
    items: products.map(p => ({
      productId: p.id,
      quantity: faker.number.int({ min: 1, max: 5 }),
      price: p.price,
    })),
    status: 'pending',
  }),
};

// Uso
const user = factories.user({ role: 'admin' });
const products = [factories.product(), factories.product()];
const order = factories.order(user, products);
```

---

## Casos de Uso Comunes

### Validación de Formularios

```typescript
const invalidEmails = [
  { input: '', error: 'Email is required' },
  { input: 'notanemail', error: 'Invalid email format' },
  { input: 'missing@domain', error: 'Invalid email format' },
  { input: '@nodomain.com', error: 'Invalid email format' },
];

for (const { input, error } of invalidEmails) {
  test(`shows error for invalid email: "${input}"`, async ({ page }) => {
    await page.fill('#email', input);
    await page.click('button[type="submit"]');
    await expect(page.locator('.error')).toContainText(error);
  });
}
```

### Testing de Permisos

```typescript
const permissionMatrix = [
  { role: 'admin', canDelete: true, canEdit: true, canView: true },
  { role: 'editor', canDelete: false, canEdit: true, canView: true },
  { role: 'viewer', canDelete: false, canEdit: false, canView: true },
];

for (const { role, canDelete, canEdit, canView } of permissionMatrix) {
  test.describe(`${role} permissions`, () => {
    test.use({ userRole: role });

    test(`can${canView ? '' : 'not'} view content`, async ({ page }) => {
      // ...
    });

    test(`can${canEdit ? '' : 'not'} edit content`, async ({ page }) => {
      // ...
    });

    test(`can${canDelete ? '' : 'not'} delete content`, async ({ page }) => {
      // ...
    });
  });
}
```

### Testing Multi-Browser

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
  ],
});
```

### Testing de Localización

```typescript
const locales = [
  { lang: 'en', greeting: 'Hello', currency: '$' },
  { lang: 'es', greeting: 'Hola', currency: '€' },
  { lang: 'ja', greeting: 'こんにちは', currency: '¥' },
];

for (const { lang, greeting, currency } of locales) {
  test(`displays correctly in ${lang}`, async ({ page }) => {
    await page.goto(`/?lang=${lang}`);
    await expect(page.locator('.greeting')).toContainText(greeting);
    await expect(page.locator('.price')).toContainText(currency);
  });
}
```

---

## Buenas Prácticas

### 1. Nombres Descriptivos

```typescript
// ❌ Malo
test('test case 1', ...);
test('test case 2', ...);

// ✅ Bueno
test(`login as ${role} with ${status} account`, ...);
test(`checkout with ${paymentMethod} and ${shippingOption}`, ...);
```

### 2. Datos Independientes

```typescript
// ❌ Malo - datos compartidos que pueden colisionar
const sharedEmail = 'test@example.com';

// ✅ Bueno - datos únicos por ejecución
const uniqueEmail = `test-${Date.now()}@example.com`;
```

### 3. Limpieza de Datos

```typescript
test.afterEach(async () => {
  // Limpiar datos creados durante el test
  await cleanupTestData();
});
```

### 4. Evitar Explosión Combinatoria

```typescript
// ❌ Malo - demasiadas combinaciones (3 x 3 x 3 = 27 tests)
for (const browser of browsers) {
  for (const viewport of viewports) {
    for (const locale of locales) {
      test(`...`, ...);
    }
  }
}

// ✅ Bueno - combinaciones representativas
const representativeCases = [
  { browser: 'chrome', viewport: 'desktop', locale: 'en' },
  { browser: 'safari', viewport: 'mobile', locale: 'es' },
  { browser: 'firefox', viewport: 'tablet', locale: 'ja' },
];
```

---

## Estructura Recomendada

```
tests/
├── data/
│   ├── fixtures/           # Datos estáticos JSON
│   │   ├── users.json
│   │   └── products.json
│   ├── factories/          # Generadores dinámicos
│   │   ├── user.factory.ts
│   │   └── product.factory.ts
│   └── builders/           # Test data builders
│       └── OrderBuilder.ts
├── e2e/
│   └── checkout/
│       ├── checkout.spec.ts
│       └── checkout.data.ts  # Datos específicos del test
└── utils/
    └── test-data.ts        # Helpers compartidos
```

---

## Próximos Pasos

1. **Fundamentos:** [fundamentals.md](./fundamentals.md) - Conceptos base de automatización
2. **Playwright:** [playwright-framework.md](./playwright-framework.md) - Configurar el framework
3. **Dependency Injection:** [dependency-injection.md](./dependency-injection.md) - Arquitectura avanzada

---

## Referencias

- [Playwright Test Parameterization](https://playwright.dev/docs/test-parameterize)
- [Faker.js Documentation](https://fakerjs.dev/)
- [Test Data Management Patterns](https://www.guru99.com/test-data-generation-tools.html)
