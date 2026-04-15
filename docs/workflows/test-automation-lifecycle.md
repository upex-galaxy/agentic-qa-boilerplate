# Test Automation Lifecycle (TALC)

> **Idioma:** Español
> **Audiencia:** QA Automation Engineers y cualquiera que escriba o revise tests automatizados
> **Skills:** `/test-automation` (plan → code → review) · `/regression-testing` (ejecución + GO/NO-GO)

---

## ¿Qué es TALC?

El **Test Automation Lifecycle** es el flujo que va desde un Test Case marcado como **Candidate** (por `/test-documentation`) hasta que ese test vive en `main`, se ejecuta en CI/CD y participa de la decisión de release.

Dos skills cubren el ciclo:

- `/test-automation` — plan, código y review del test individual (Plan → Code → Review).
- `/regression-testing` — ejecución de la suite completa en CI/CD, clasificación de fallos, y veredicto GO / CAUTION / NO-GO.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TEST AUTOMATION LIFECYCLE                     │
│                                                                  │
│   /test-automation                       /regression-testing     │
│   ──────────────────────────────         ─────────────────────── │
│                                                                  │
│   Plan    →   Code    →   Review   →    CI Execution +          │
│   (spec)      (KATA)      (gates)       GO/NO-GO verdict         │
│                                                                  │
│   ┌───────┐   ┌───────┐   ┌───────┐     ┌───────┐               │
│   │ Plan  │ → │ Code  │ → │Review │  →  │  CI   │               │
│   │  +    │   │ KATA  │   │ gates │     │+report│               │
│   │ ATCs  │   │ tests │   │       │     │       │               │
│   └───────┘   └───────┘   └───────┘     └───────┘               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pre-requisito: handoff desde TMLC

Antes de invocar `/test-automation`, `/test-documentation` ya debe haber producido TCs marcados como **Candidate**:

```
┌─────────────────────────────────────────────────────────────────┐
│   TMLC (`/test-documentation`)      TALC (`/test-automation`)    │
│   ────────────────────────────      ──────────────────────────   │
│                                                                  │
│   Output: TCs en Jira/Xray          Input: mismos TCs            │
│   con veredicto "Candidate"         + PBI context                │
└─────────────────────────────────────────────────────────────────┘
```

**Qué necesita `/test-automation`:**

- Test Cases con pasos claros y datos de prueba definidos.
- Veredicto `Candidate` (del skill de documentación).
- Contexto del feature en `.context/PBI/{module}/{TICKET}/`.

---

## Test Automation (`/test-automation`)

El skill `/test-automation` corre el pipeline **Plan → Code → Review** dentro de una sola invocación. Nunca salta directo a código.

### Ejemplo de invocación

```
Automate the ATCs from UPEX-100.
Write an E2E test for the login flow.
Review this integration test.
```

### Pick the planning scope first

Toda sesión arranca eligiendo uno de tres alcances:

| Alcance | Input | Output | Cuándo usarlo |
|---------|-------|--------|----------------|
| **Module-driven** (macro) | Nombre del módulo + lista de TCs candidatos | Un spec de módulo + N ATC specs | Primera pasada sobre un área nueva, 10+ tests. |
| **Ticket-driven** (medium) | Un ticket / story ID con escenarios | Un implementation plan para ese ticket | Automatizar una user story completa. Default del sprint. |
| **Regression-driven** (micro) | Un TC específico (usualmente post-bug) | Un ATC implementation plan | Añadir un test regresivo tras un fix. |

En duda, el skill pregunta. Nunca asume "module" solo por ver varios TC IDs en el briefing.

---

### Fase 1 — Plan

El skill genera el plan bajo `.context/PBI/{module}/test-specs/{TICKET-ID}/`. El plan responde:

- ¿Qué escenarios se vuelven tests, cuáles ATCs, cuáles preconditions compartidas (Steps)?
- ¿Qué componentes ya existen en `tests/components/api/*Api.ts` / `tests/components/ui/*Page.ts` y cuáles faltan?
- ¿Qué test data se necesita? Clasificada como **Discover / Modify / Generate** (nunca asume que existe en staging).
- ¿Qué fixture usa el test: `{api}`, `{ui}`, `{test}`, `{steps}`?
- ¿Qué ATC IDs (del TMS) mapean a qué métodos de componente?

El skill **presenta el plan y espera aprobación** antes de codificar.

---

### Fase 2 — Code

El skill implementa en este orden:

1. **Types** al tope del archivo de componente (payloads, responses, DTOs).
2. **Componente** extendiendo `ApiBase` o `UiBase`. Helpers primero (sin decorator), ATCs después (`@atc('TICKET-ID')`).
3. **Registrar** el componente en `ApiFixture.ts` / `UiFixture.ts` / `StepsFixture.ts`.
4. **Test file** bajo `tests/e2e/{module}/` o `tests/integration/{module}/`, con la fixture correcta.
5. **Validar localmente** en este orden exacto — no se salta ninguna:

```bash
bun run test <path/to/new.test.ts>   # ¿pasa?
bun run type-check                   # tsc --noEmit, sin errores
bun run lint                         # ESLint, sin errores
```

Si cualquiera falla, el skill corrige antes de pasar a Review.

#### Fixture selection (inline — obligatorio)

| Tipo de test | Fixture | ¿Abre browser? | Cuándo |
|--------------|---------|-----------------|--------|
| API only (integration) | `{ api }` | No (lazy) | API pura, sin UI. |
| UI only | `{ ui }` | Sí | UI-focused, sin setup vía API. |
| Hybrid (UI + API setup) | `{ test }` | Sí | Setup vía API, flujo vía UI, verificación vía API. |
| Cadenas de precondition reusables | `{ steps }` | Depende | 3+ ATCs repetidos en 3+ archivos. |

Regla: nunca pedir `{ ui }` para un test que no toca la UI — abre un browser para nada.

#### Ejemplo de test E2E

```typescript
// tests/e2e/checkout/payment.test.ts
import { test, expect } from '@TestFixture';
import testCard from '@data/fixtures/cards.json';

test.describe('UPEX-123: Checkout Payment', () => {
  test('UPEX-123: should complete payment when credit card is valid', async ({ test: ctx }) => {
    // Setup vía API (rápido, determinista)
    const user = await ctx.api.auth.loginSuccessfully(credentials);
    await ctx.api.cart.addProductSuccessfully({ productId });

    // Flujo vía UI
    await ctx.ui.checkout.navigateToCheckout();
    await ctx.ui.checkout.payWithCardSuccessfully(testCard);

    // Verificación de outcome
    await expect(ctx.ui.checkout.successMessage).toBeVisible();
    await expect(ctx.ui.checkout.orderNumber).toHaveText(/ORD-\d+/);
  });
});
```

#### Reglas no-negociables (las que más se rechazan en review)

```
DO:
- Setup vía API, validación vía UI
- Tests independientes (sin orden implícito)
- Data única por ejecución (faker)
- Assertions específicas y claras
- Credenciales desde .env (LOCAL_USER_EMAIL / STAGING_USER_EMAIL)

DON'T:
- Hardcodear datos
- Depender del estado de otros tests
- Usar page.waitForTimeout (usar waitFor condicional)
- Tests flakey ("a veces pasa")
- Import relativo (../../); usar aliases @api/ @ui/ @utils/ @schemas/
```

---

### Fase 3 — Review

El skill corre el checklist de review sobre los archivos nuevos / modificados. Cada item fallado es un blocker. Revisión limpia = gate de merge.

```markdown
## Review checklist (resumen)

### KATA
- [ ] Sigue la arquitectura de capas (TestContext → ApiBase/UiBase → YourApi/YourPage → Fixture)
- [ ] ATC = caso de prueba completo, no un click individual
- [ ] TC Identity: Precondition + Action = 1 TC (asserts agrupados)
- [ ] ATCs atómicos (no llaman a otros ATCs; chains en Steps)
- [ ] Locators inline en ATCs (no `locators/*.ts`)
- [ ] Fixed assertions dentro del ATC; test-level assertions en test file

### TypeScript
- [ ] Max 2 parámetros posicionales; 3+ → object param
- [ ] Aliases `@api/` `@ui/` `@utils/` `@schemas/`; nada de relativos
- [ ] Types definidos al tope del archivo

### Calidad
- [ ] Tests pasan local, sin retries
- [ ] `bun run type-check` sin errores
- [ ] `bun run lint` sin errores
- [ ] Componente registrado en su Fixture
- [ ] `@atc('X')` linkea a un TC real del TMS
- [ ] Ticket ID prefix en cada `test('TICKET-ID: ...')`
```

El detalle completo vive en el skill (`references/review-checklists.md`) y se carga solo cuando se necesita.

---

### Plan → Code → Review en diagrama

```
Phase 1: Plan         →  Phase 2: Code             →  Phase 3: Review
(spec / plan)            (component + test file)       (KATA compliance)
        │                         │                             │
  .context/PBI/{module}/     tests/components/**         Review checklist
    test-specs/              tests/e2e/** or                (pass/fail)
    spec.md                  tests/integration/**
    implementation-plan.md
    atc/*.md                 Register in fixture
```

Cada fase tiene un gate. No arrancar Code antes de Plan aprobado. No cerrar el ticket hasta que Review pase.

---

## KATA Architecture (referencia rápida)

La arquitectura es estable y se documenta en profundidad dentro del skill (`references/kata-architecture.md`). Layers:

```
TestContext (Layer 1)  - Config, Faker, utilities
    │ extends
ApiBase / UiBase (Layer 2)  - HTTP / Playwright helpers
    │ extends
YourApi / YourPage (Layer 3)  - ATCs viven aquí
    │ usado por
TestFixture (Layer 4)  - Inyección de dependencias
    │ usado por
Test Files  - Orquestan ATCs
```

### Templates KATA (inline, load-bearing)

```typescript
// API component — Layer 3
export class UsersApi extends ApiBase {
  constructor(options: TestContextOptions) { super(options); }

  @step
  async getUserById(id: string): Promise<[APIResponse, UserResponse]> {
    return this.apiGET<UserResponse>(`/users/${id}`);
  }

  @atc('UPEX-123')
  async createUserSuccessfully(payload: UserPayload): Promise<[APIResponse, UserResponse, UserPayload]> {
    const [response, body, sent] = await this.apiPOST<UserResponse, UserPayload>('/users', payload);
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    return [response, body, sent];
  }
}
```

```typescript
// UI component — Layer 3
export class LoginPage extends UiBase {
  constructor(options: TestContextOptions) { super(options); }

  @atc('UPEX-123')
  async loginWithValidCredentials(data: LoginData): Promise<void> {
    await this.page.goto('/login');
    await this.page.locator('#email').fill(data.email);
    await this.page.locator('#password').fill(data.password);
    await this.page.locator('button[type="submit"]').click();
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

---

## Regression Testing (`/regression-testing`)

Una vez que los tests viven en `main`, el skill `/regression-testing` se encarga de ejecutar la suite completa y emitir veredicto de release.

### Ejemplo de invocación

```
Run the full regression and give me a GO/NO-GO.
Analyze the failures in the latest smoke run.
Trigger the regression workflow on staging and summarize the results.
```

### Qué hace el skill

1. **Ejecuta la suite** (regression / smoke / sanity) vía GitHub Actions o localmente.
2. **Clasifica fallos** en cinco categorías:
   - `REGRESSION` — bug real reintroducido.
   - `FLAKY` — pasa al rehacer, requiere investigación.
   - `KNOWN` — bug conocido con ticket abierto.
   - `ENVIRONMENT` — infra / datos / servicio externo.
   - `NEW TEST` — test recién agregado fallando.
3. **Computa métricas**: pass-rate actual vs. baseline, tendencia de flakiness.
4. **Emite veredicto** GO / CAUTION / NO-GO con justificación por ticket.
5. **Genera stakeholder report** para compartir con el equipo.

### Pipeline de CI (contexto)

```
┌─────────────────────────────────────────────────────────────────┐
│                         CI PIPELINE                              │
│                                                                  │
│   Push to       ┌──────────┐      ┌──────────┐      ┌────────┐  │
│   Branch    ──▶ │  Lint &  │ ──▶  │   Run    │ ──▶  │ Allure │  │
│                 │ TypeCheck│      │  Tests   │      │ Report │  │
│                 └──────────┘      └──────────┘      └────────┘  │
│                                        │                         │
│                                        ▼                         │
│                              ┌─────────────────┐                │
│                              │  /regression-    │                │
│                              │   testing parse  │                │
│                              │  & classify      │                │
│                              └─────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### Estrategias anti-flakiness

```
1. Retries = 0 por default. Si pasa en retry, el test es flaky.
2. Timeouts explícitos: expect.toBeVisible({ timeout: 10000 })
3. Waits por condición: waitForSelector / waitForResponse / waitForLoadState('networkidle')
4. Data única: faker.internet.email() en vez de "test@test.com"
5. Aislamiento: cada test crea y limpia su propio estado
```

---

## Flujo PR + merge (gates finales)

El skill `/test-automation` deja los tests listos; el merge es trabajo humano, pero estos son los gates:

```
┌─────────────────────────────────────────────────────────────────┐
│                         PR WORKFLOW                              │
│                                                                  │
│   1. gh pr create --base staging                                │
│         │                                                        │
│   2. Descripción PR:                                            │
│      - TCs automatizados (IDs + link a Jira)                    │
│      - Link al CI run y al Allure report                        │
│      - Checklist KATA cumplido                                  │
│         │                                                        │
│   3. Code Review (otro QA / Dev)                                │
│         │                                                        │
│   4. CI verde y estable                                         │
│         │                                                        │
│   5. Merge a staging → (luego) main                             │
│         │                                                        │
│   6. Update TMS: TC.status → Automated; link al PR              │
└─────────────────────────────────────────────────────────────────┘
```

### Template de descripción de PR

```markdown
## Summary
- Added E2E tests for checkout payment flow
- Covers UPEX-123 ATCs (TC-001, TC-002, TC-003)

## Test Cases Automated
| TC ID  | Description          | Type |
|--------|----------------------|------|
| TC-001 | Successful payment   | E2E  |
| TC-002 | Payment declined     | E2E  |
| TC-003 | Invalid card format  | E2E  |

## Test Results
- All tests passing in CI
- [Allure Report](link)
- [CI Run](link)

## Checklist
- [x] Tests pass locally (no retries)
- [x] Tests pass in CI
- [x] KATA review passed
- [x] TMS TCs linked (@atc decorators)
```

---

## Resumen del flujo TALC

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Handoff desde TMLC                                            │
│   (TCs con veredicto "Candidate" en /test-documentation)        │
│         │                                                        │
│         ▼   /test-automation                                    │
│   ┌─────────────┐                                               │
│   │    Plan     │  "¿Cuál es el scope y el plan?"               │
│   │   (spec)    │  → spec.md + implementation-plan.md + atc/    │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │    Code     │  "Escribir el test en KATA"                   │
│   │  (KATA)     │  → componentes + test + fixture registrada    │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │   Review    │  "¿Cumple los gates?"                         │
│   │  (gates)    │  → checklist verde (tests/types/lint)         │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼   PR + merge a staging / main                        │
│   ┌─────────────┐                                               │
│   │    CI       │  /regression-testing                          │
│   │  + verdict  │  → GO / CAUTION / NO-GO                       │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   Tests en main, corriendo en cada build, con veredicto claro   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Métricas de TALC

KPIs sugeridos para medir la salud del ciclo:

| Métrica | Target | Cómo medir |
|---------|--------|------------|
| **Assessment throughput** | 10 TCs/semana | TCs evaluados por `/test-documentation` |
| **Automation velocity** | 5 tests/semana | Tests mergeados por `/test-automation` |
| **CI pass rate** | > 95 % | Tests que pasan al primer intento |
| **Flakiness rate** | < 5 % | Tests con fallos intermitentes |
| **PR cycle time** | < 2 días | Tiempo desde PR creado hasta merge |

---

## Referencias

- [TMLC — Manual Lifecycle](test-manual-lifecycle.md)
- Skills: `.claude/skills/test-automation/`, `.claude/skills/regression-testing/`
- KATA architecture: `/test-automation` (carga `references/kata-architecture.md` bajo demanda)
- Boilerplate overview: `README.md` sección "How to Use Each Skill"
