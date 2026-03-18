# Fundamentos de Test Automation

> **Idioma:** Español
> **Nivel:** Introductorio
> **Audiencia:** QA Engineers que inician en automatización de tests

---

## ¿Qué es Test Automation?

**Test Automation** es el uso de software para ejecutar tests de forma automática, verificar resultados y reportar hallazgos, sin intervención manual.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CICLO DE TESTING MANUAL                       │
│                                                                  │
│   Tester → Lee caso → Ejecuta pasos → Verifica → Reporta        │
│              ↑                                        │          │
│              └────────── Repetir ────────────────────┘          │
│                      (cada vez que hay cambios)                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    CICLO DE TESTING AUTOMATIZADO                 │
│                                                                  │
│   Tester → Escribe test (una vez)                               │
│                  ↓                                               │
│            CI/CD ejecuta automáticamente                         │
│                  ↓                                               │
│            Resultados + reportes                                 │
│                  ↓                                               │
│   (repetible infinitas veces sin intervención)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## ¿Cuándo Automatizar?

### Automatizar ✅

| Criterio | Ejemplo |
|----------|---------|
| **Tests repetitivos** | Smoke tests ejecutados en cada deploy |
| **Tests de regresión** | Verificar que lo que funcionaba sigue funcionando |
| **Tests con muchos datos** | Validar 100 combinaciones de inputs |
| **Tests críticos de negocio** | Login, checkout, pagos |
| **Tests de API** | Validación de contratos, respuestas |

### NO Automatizar ❌

| Criterio | Razón |
|----------|-------|
| **UX/Usabilidad** | Requiere criterio humano |
| **Testing exploratorio** | Creatividad y adaptación |
| **Features muy inestables** | El test se rompe constantemente |
| **Tests de un solo uso** | El ROI no justifica el esfuerzo |

### La Regla de Oro

> **Automatiza lo que es repetitivo, predecible y valioso.**
>
> Si vas a ejecutar el mismo test más de 3 veces, automatízalo.

---

## La Pirámide de Testing

```
                    ╱╲
                   ╱  ╲
                  ╱ E2E╲         Pocos tests
                 ╱──────╲        Más lentos
                ╱        ╲       Más frágiles
               ╱Integration╲     Costo medio
              ╱────────────╲
             ╱              ╲
            ╱      Unit      ╲   Muchos tests
           ╱──────────────────╲  Muy rápidos
                                 Muy estables
```

| Nivel | Qué prueba | Velocidad | Cantidad | Ejemplo |
|-------|------------|-----------|----------|---------|
| **Unit** | Una función/método aislado | ⚡ Milisegundos | Muchos | `calculateTotal()` retorna correctamente |
| **Integration** | Múltiples componentes juntos | ⏱️ Segundos | Moderados | API endpoint crea usuario en DB |
| **E2E** | Flujo completo como usuario | 🐢 Minutos | Pocos | Usuario se registra, hace compra, recibe email |

---

## Tipos de Tests Automatizados

### Unit Tests

Prueban una unidad de código en aislamiento:

```typescript
// Unit test
test('calculateDiscount applies 10% for premium users', () => {
  const result = calculateDiscount(100, { isPremium: true });
  expect(result).toBe(90);
});
```

**Características:**
- No tocan DB, API, ni UI
- Usan mocks/stubs para dependencias
- Muy rápidos (< 100ms)

### Integration Tests

Prueban que múltiples componentes funcionan juntos:

```typescript
// Integration test - API real
test('POST /users creates user in database', async () => {
  const response = await api.post('/users', { name: 'Test', email: 'test@x.com' });

  expect(response.status).toBe(201);

  const user = await db.query('SELECT * FROM users WHERE email = $1', ['test@x.com']);
  expect(user.rows).toHaveLength(1);
});
```

**Características:**
- Conectan a DB y/o APIs reales
- Verifican integración entre capas
- Velocidad media (1-10 segundos)

### E2E Tests (End-to-End)

Simulan un usuario real interactuando con la aplicación:

```typescript
// E2E test - Browser real
test('user can complete purchase flow', async ({ page }) => {
  await page.goto('/products');
  await page.click('[data-testid="add-to-cart"]');
  await page.click('[data-testid="checkout"]');
  await page.fill('#card-number', '4242424242424242');
  await page.click('[data-testid="pay"]');

  await expect(page.locator('.success-message')).toBeVisible();
});
```

**Características:**
- Usan un browser real (Chromium, Firefox, WebKit)
- Prueban flujos completos
- Más lentos pero más realistas

---

## Conceptos Clave

### Fixtures

Un **fixture** prepara el estado necesario antes del test y limpia después:

```typescript
// Fixture: crea un usuario antes del test
const testUser = test.extend({
  user: async ({}, use) => {
    // Setup: crear usuario
    const user = await createUser({ email: 'test@example.com' });

    await use(user);  // El test usa el usuario

    // Cleanup: eliminar usuario
    await deleteUser(user.id);
  },
});

testUser('user can update profile', async ({ user, page }) => {
  await page.goto(`/users/${user.id}/edit`);
  // ... el test tiene acceso a `user`
});
```

### Patrones de Abstracción de UI

Existen varios patrones para organizar la interacción con la UI en tests automatizados. A continuación los más comunes:

#### Page Objects (Patrón Tradicional)

Encapsulan la estructura de una página en un objeto reutilizable:

```typescript
// Sin Page Object ❌
test('login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');
});

// Con Page Object ✅
class LoginPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.goto('/login');
    await this.page.fill('#email', email);
    await this.page.fill('#password', password);
    await this.page.click('button[type="submit"]');
  }
}

test('login', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.login('test@example.com', 'password123');
});
```

#### Component-Based Architecture (KATA)

En lugar de agrupar locators en un objeto, los **componentes** agrupan acciones completas (ATCs) con assertions incluidas:

```typescript
// Component-based (KATA framework)
class LoginPage extends UiBase {
  @atc('PROJ-001')
  async loginSuccessfully(email: string, password: string) {
    await this.page.goto('/login');
    await this.page.fill('#email', email);
    await this.page.fill('#password', password);
    await this.page.click('button[type="submit"]');
    // Assertions included in the component
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

**Ventajas**: Cada método es un test case completo (acción + verificación), reutilizable, y con trazabilidad directa a tickets del TMS.

> **Nota**: Este boilerplate usa el enfoque Component-based (KATA). Para más detalles, ver `.context/guidelines/TAE/automation-standards.md`.

#### Screenplay Pattern

Modela las interacciones como tareas que realizan actores:

```typescript
// Screenplay pattern (conceptual)
await actor.attemptsTo(
  Navigate.to('/login'),
  Fill.field('#email', email),
  Click.on('button[type="submit"]'),
  Ensure.that(CurrentPage.url(), containsString('dashboard')),
);
```

**Ventajas**: Muy legible, desacopla "qué" de "cómo". Usado en frameworks como Serenity/JS.

---

### Assertions

Verifican que el resultado es el esperado:

```typescript
// Assertions comunes
expect(value).toBe(expected);           // Igualdad estricta
expect(value).toEqual(expected);        // Igualdad profunda
expect(array).toContain(item);          // Array contiene
expect(object).toHaveProperty('key');   // Objeto tiene propiedad
expect(fn).toThrow();                   // Función lanza error

// Assertions de Playwright (UI)
await expect(page.locator('.title')).toBeVisible();
await expect(page.locator('input')).toHaveValue('test');
await expect(page).toHaveURL('/dashboard');
```

---

## Anatomía de un Test

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature: User Registration', () => {

  test.beforeEach(async ({ page }) => {
    // Runs before each test
    await page.goto('/register');
  });

  test.afterEach(async ({ page }) => {
    // Runs after each test (cleanup)
  });

  test('should register with valid data', async ({ page }) => {
    // Arrange - Preparar
    const userData = {
      email: `test-${Date.now()}@example.com`,
      password: 'SecurePass123!',
    };

    // Act - Ejecutar
    await page.fill('#email', userData.email);
    await page.fill('#password', userData.password);
    await page.click('[data-testid="register-btn"]');

    // Assert - Verificar
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('.welcome')).toContainText('Welcome');
  });

  test('should show error for invalid email', async ({ page }) => {
    await page.fill('#email', 'not-an-email');
    await page.fill('#password', 'password');
    await page.click('[data-testid="register-btn"]');

    await expect(page.locator('.error')).toContainText('Invalid email');
  });
});
```

---

## Buenas Prácticas

### 1. Tests Independientes

Cada test debe poder ejecutarse solo:

```typescript
// ❌ Malo - depende del test anterior
test('test 1: create user', async () => { /* crea usuario */ });
test('test 2: edit user', async () => { /* asume que test 1 creó usuario */ });

// ✅ Bueno - cada test es autosuficiente
test('edit user', async () => {
  const user = await createTestUser();  // Crea su propio dato
  // ... edita usuario
});
```

### 2. Nombres Descriptivos

```typescript
// ❌ Malo
test('test1', async () => {});

// ✅ Bueno
test('user with expired subscription cannot access premium features', async () => {});
```

### 3. Una Cosa por Test

```typescript
// ❌ Malo - prueba muchas cosas
test('user flow', async () => {
  // login
  // create order
  // cancel order
  // logout
});

// ✅ Bueno - una verificación clara
test('logged in user can create order', async () => {});
test('user can cancel pending order', async () => {});
```

### 4. Evitar Sleeps Fijos

```typescript
// ❌ Malo - espera arbitraria
await page.click('button');
await page.waitForTimeout(3000);  // ¿Por qué 3 segundos?

// ✅ Bueno - espera condiciones
await page.click('button');
await expect(page.locator('.result')).toBeVisible();
```

### 5. Datos Únicos

```typescript
// ❌ Malo - puede colisionar
const email = 'test@example.com';

// ✅ Bueno - único por ejecución
const email = `test-${Date.now()}-${Math.random()}@example.com`;
// O con faker:
const email = faker.internet.email();
```

---

## Frameworks de Automatización

| Framework | Lenguaje | Tipo | Fortalezas |
|-----------|----------|------|------------|
| **Playwright** | TS/JS, Python, .NET | E2E + API | Cross-browser, auto-wait, traces |
| **Cypress** | JavaScript | E2E | Developer-friendly, time-travel |
| **Selenium** | Múltiples | E2E | El más maduro, amplio soporte |
| **Jest** | JavaScript | Unit + Integration | Popular en React |
| **Vitest** | TypeScript | Unit + Integration | Rápido, compatible con Jest |
| **Pytest** | Python | Todos | Muy flexible, fixtures potentes |

En este boilerplate usamos **Playwright** por su versatilidad (E2E + API) y excelente developer experience.

---

## Próximos Pasos

1. **Dependency Injection:** [dependency-injection.md](docs/testing/automation/dependency-injection.md) - Arquitectura de tests
2. **Playwright:** [playwright-framework.md](docs/testing/automation/playwright-framework.md) - Configurar el framework
3. **API Testing:** [playwright-api-testing.md](docs/testing/automation/playwright-api-testing.md) - Tests de API con Playwright
4. **Data-Driven:** [data-driven-testing.md](docs/testing/automation/data-driven-testing.md) - Parametrización de tests

---

## Referencias

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Test Pyramid - Martin Fowler](https://martinfowler.com/bliki/TestPyramid.html)
- [Page Object Pattern](https://martinfowler.com/bliki/PageObject.html)
