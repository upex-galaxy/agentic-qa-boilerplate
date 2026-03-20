# Test Automation Lifecycle (TALC)

> **Idioma:** Español
> **Fase IQL:** Mid-Game (Steps 6-9)
> **Audiencia:** QA Automation Engineers que ejecutan el ciclo de automatización

---

## ¿Qué es TALC?

El **Test Automation Lifecycle** es el flujo de trabajo que sigue un QA Automation Engineer desde que recibe test cases documentados hasta que los tests automatizados están integrados en CI/CD.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TEST AUTOMATION LIFECYCLE                     │
│                                                                  │
│   Stage 1          Stage 2          Stage 3          Stage 4    │
│   ────────         ────────         ────────         ────────   │
│                                                                  │
│   Assessment   →   Automation   →   CI Verify   →   PR Review   │
│   de Candidatos    de Tests         en Pipeline      y Merge    │
│                                                                  │
│   ┌───────┐       ┌───────┐       ┌───────┐       ┌───────┐    │
│   │ Eval  │   →   │ Code  │   →   │ CI/CD │   →   │  PR   │    │
│   │Feasib │       │ Tests │       │ Green │       │Merged │    │
│   └───────┘       └───────┘       └───────┘       └───────┘    │
│                                                                  │
│   IQL Step 6      IQL Step 7      IQL Step 8      IQL Step 9   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pre-requisito: Handoff desde TMLC

Antes de empezar TALC, el QA Analyst debe haber completado TMLC:

```
┌─────────────────────────────────────────────────────────────────┐
│   TMLC (QA Analyst)                TALC (QA Automation)         │
│   ─────────────────                ────────────────────          │
│                                                                  │
│   Stage 4: Test Case               Stage 1: Assessment          │
│   Documentation                    de Candidatos                 │
│         │                                │                       │
│         │  Test Cases con label:         │                       │
│         │  "automation-candidate"        │                       │
│         └───────────────────────────────▶│                       │
│                                                                  │
│   Output: TCs formales             Input: TCs con label         │
│   en Jira/Xray                     "automation-candidate"       │
└─────────────────────────────────────────────────────────────────┘
```

**¿Qué necesitas del QA Analyst?**
- Test Cases documentados con pasos claros
- Datos de prueba definidos
- Label `automation-candidate` en los TCs prioritarios
- Contexto del feature (US vinculada)

---

## Stage 1: Assessment de Candidatos

> **IQL Step 6** · TALC 1st Stage
> **Output:** TCs clasificados como "Candidate" o "Manual Only"

### ¿Qué hago en esta etapa?

Cuando recibes test cases con label `automation-candidate`, tu primera tarea es **evaluar si realmente conviene automatizarlos**.

### Criterios de Evaluación

| Criterio | Preguntas | Si es NO... |
|----------|-----------|-------------|
| **Estabilidad del Feature** | ¿El feature está estable o cambiará pronto? | Esperar a que estabilice |
| **Frecuencia de Ejecución** | ¿Se ejecutará en cada build/nightly? | Quizás no vale la inversión |
| **Complejidad Técnica** | ¿Es factible automatizarlo con las herramientas actuales? | Evaluar alternativas |
| **ROI** | ¿El tiempo de automatizar vs ejecutar manual vale la pena? | Mantener manual |
| **Dependencias** | ¿Hay APIs/servicios disponibles para setup? | Resolver dependencias primero |

### Matriz de Decisión

```
                    Alta Frecuencia de Ejecución
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         │    AUTOMATIZAR     │    AUTOMATIZAR     │
         │    (Prioridad      │    (Prioridad      │
         │     Media)         │     Alta)          │
         │                    │                    │
   Baja  ├────────────────────┼────────────────────┤ Alta
 Complejidad                  │                    Complejidad
         │                    │                    │
         │    EVALUAR         │    MANUAL          │
         │    (Caso por       │    (Por ahora)     │
         │     caso)          │                    │
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                    Baja Frecuencia de Ejecución
```

### Pasos

1. **Revisa el backlog de automation-candidates**
   - Filtra en Jira por label `automation-candidate`
   - Ordena por prioridad (del Analyst)

2. **Para cada TC, evalúa factibilidad**
   - ¿Hay acceso al ambiente?
   - ¿Los datos de prueba están disponibles?
   - ¿El feature tiene APIs que puedes usar para setup?

3. **Clasifica el TC**
   - ✅ `Candidate` → Listo para automatizar
   - ⏳ `Pending` → Necesita algo antes (acceso, APIs, etc.)
   - ❌ `Manual Only` → No conviene automatizar

4. **Actualiza el estado en Jira**
   - Cambia status a "In Review" → "Candidate" o "Manual"
   - Agrega notas de por qué

### Ejemplo de Evaluación

```markdown
## Evaluación: TC-001 - Checkout con tarjeta de crédito

### Análisis:
- ✅ Feature estable (en producción hace 3 meses)
- ✅ Se ejecutará en cada PR (crítico para negocio)
- ✅ API de pagos disponible para mock
- ⚠️ Necesita sandbox de Stripe configurado

### Decisión: ✅ CANDIDATE
### Dependencia: Configurar variables de Stripe en CI

### Notas para automatización:
- Usar API para crear usuario y carrito (no UI)
- Solo el checkout necesita ser E2E
- Mock de Stripe para evitar flakiness
```

### Herramientas

- **Jira/Xray**: Gestión de TCs y estados
- **Slack**: Comunicación con Analyst si hay dudas
- **Documentación del proyecto**: Entender contexto técnico

---

## Stage 2: Automatización de Tests

> **IQL Step 7** · TALC 2nd Stage · Modelo TAUS
> **Output:** Tests automatizados en una branch de feature

### ¿Qué hago en esta etapa?

Con los TCs marcados como "Candidate", es hora de **escribir el código de los tests automatizados**.

### El Modelo TAUS

TAUS = Test Automation User Story

```
┌─────────────────────────────────────────────────────────────────┐
│                         MODELO TAUS                              │
│                                                                  │
│   1. Crear branch           feature/TAUS-123-checkout-test      │
│                                      │                           │
│   2. Analizar TC            Entender pasos, datos, expected     │
│                                      │                           │
│   3. Identificar            ¿Qué componentes necesito?          │
│      componentes            ¿Page Objects? ¿API clients?        │
│                                      │                           │
│   4. Implementar            Escribir el test siguiendo KATA     │
│      tests                                                       │
│                                      │                           │
│   5. Ejecutar local         Verificar que pasa consistentemente │
│                                      │                           │
│   6. Push & CI              Verificar en pipeline               │
└─────────────────────────────────────────────────────────────────┘
```

### Pasos

1. **Crea una branch de feature**
   ```bash
   git checkout -b feature/TAUS-123-checkout-test
   ```

2. **Analiza el Test Case**
   - Lee los pasos detallados
   - Identifica precondiciones
   - Entiende los datos de prueba
   - Clarifica el resultado esperado

3. **Diseña la estructura del test**
   - ¿E2E o Integration?
   - ¿Qué Page Objects/API Clients necesitas?
   - ¿Existe código reutilizable?

4. **Implementa siguiendo KATA**
   - Carga las guidelines: `.context/guidelines/TAE/KATA-AI-GUIDE.md`
   - Sigue la arquitectura de capas
   - Usa ATCs (Atomic Test Components)

5. **Ejecuta localmente múltiples veces**
   ```bash
   # Ejecutar 5 veces para verificar estabilidad
   for i in {1..5}; do bun run test:e2e -- checkout.spec.ts; done
   ```

6. **Commit y push**
   ```bash
   git add .
   git commit -m "test: add checkout payment test TAUS-123"
   git push -u origin feature/TAUS-123-checkout-test
   ```

### Estructura de un Test E2E

```typescript
// tests/e2e/checkout/payment.spec.ts

import { test, expect } from '@playwright/test';
import { TestFixture } from '../../components/TestFixture';

test.describe('Checkout Payment', () => {
  let fixture: TestFixture;

  test.beforeEach(async ({ page }) => {
    fixture = new TestFixture(page);
    // Setup: crear usuario y carrito via API
    await fixture.api.auth.login(testUser);
    await fixture.api.cart.addProduct(productId);
  });

  test('TC-001: successful payment with credit card', async () => {
    // Arrange
    await fixture.ui.checkout.navigate();

    // Act
    await fixture.ui.checkout.fillCardDetails(testCard);
    await fixture.ui.checkout.submitPayment();

    // Assert
    await expect(fixture.ui.checkout.successMessage).toBeVisible();
    await expect(fixture.ui.checkout.orderNumber).toHaveText(/ORD-\d+/);
  });
});
```

### Buenas Prácticas

```
✅ DO:
- Setup via API, validación via UI
- Tests independientes (no dependen de orden)
- Datos únicos por ejecución (Faker)
- Assertions específicas y claras
- Cleanup después de cada test

❌ DON'T:
- Hardcodear datos
- Depender de estado de otros tests
- Sleeps fijos (usar waitFor)
- Tests que fallan intermitentemente (flaky)
- Ignorar failures "porque a veces pasa"
```

### Herramientas

- **IDE**: VS Code / Cursor con extensiones de Playwright
- **AI Assistant**: Claude Code para generar código
- **Terminal**: Ejecución local de tests
- **Git**: Control de versiones

---

## Stage 3: Verificación en CI

> **IQL Step 8** · TALC 3rd Stage
> **Output:** Tests pasando consistentemente en CI/CD

### ¿Qué hago en esta etapa?

Después de push, los tests deben **ejecutarse en el pipeline de CI** y pasar consistentemente.

### Flujo de CI

```
┌─────────────────────────────────────────────────────────────────┐
│                         CI PIPELINE                              │
│                                                                  │
│   Push to       ┌──────────┐      ┌──────────┐      ┌────────┐  │
│   Branch    ──▶ │  Lint &  │ ──▶  │   Run    │ ──▶  │ Report │  │
│                 │ TypeCheck│      │  Tests   │      │ Allure │  │
│                 └──────────┘      └──────────┘      └────────┘  │
│                                        │                         │
│                                        ▼                         │
│                              ┌─────────────────┐                │
│                              │   ✅ All Pass   │                │
│                              │   ❌ Failures   │                │
│                              └─────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### Pasos

1. **Verifica que CI se dispara**
   - Ve a GitHub Actions / tu CI
   - Confirma que el workflow inició

2. **Monitorea la ejecución**
   - Observa los logs en tiempo real
   - Identifica si hay fallos tempranos

3. **Si los tests pasan** ✅
   - Verifica que pasaron en todos los browsers configurados
   - Revisa el reporte de Allure
   - Procede a Stage 4 (PR)

4. **Si los tests fallan** ❌
   - Descarga los artifacts (screenshots, videos, traces)
   - Analiza la causa raíz
   - Fix y re-push

### Análisis de Fallos

```markdown
## Checklist de Debugging

### 1. ¿Es un fallo real o flaky?
- [ ] Ejecutar localmente 5+ veces
- [ ] Verificar si es consistente

### 2. ¿Es problema de ambiente?
- [ ] ¿Variables de entorno correctas?
- [ ] ¿Servicios disponibles en CI?
- [ ] ¿Timeouts suficientes?

### 3. ¿Es problema del test?
- [ ] ¿Selectores correctos?
- [ ] ¿Race conditions?
- [ ] ¿Dependencias de estado?

### 4. ¿Es bug real de la app?
- [ ] Reproducir manualmente
- [ ] Si es bug → Reportar al Dev
```

### Estrategias Anti-Flakiness

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESTRATEGIAS ANTI-FLAKY                        │
│                                                                  │
│   1. Retries automáticos                                        │
│      playwright.config.ts → retries: 2                          │
│                                                                  │
│   2. Timeouts apropiados                                        │
│      expect.toBeVisible({ timeout: 10000 })                     │
│                                                                  │
│   3. Waits explícitos                                           │
│      await page.waitForLoadState('networkidle')                 │
│                                                                  │
│   4. Datos únicos                                               │
│      faker.internet.email() en lugar de "test@test.com"         │
│                                                                  │
│   5. Isolación                                                  │
│      Cada test crea su propio estado                            │
└─────────────────────────────────────────────────────────────────┘
```

### Herramientas

- **GitHub Actions**: Visualizar workflows
- **Allure Report**: Análisis detallado de resultados
- **Playwright Trace Viewer**: Debugging visual
- **Slack**: Notificaciones de CI

---

## Stage 4: Code Review y Merge

> **IQL Step 9** · TALC 4th Stage
> **Output:** PR aprobado y mergeado a main

### ¿Qué hago en esta etapa?

Con los tests pasando en CI, creas un **Pull Request para revisión** por otro miembro del equipo.

### Flujo de PR

```
┌─────────────────────────────────────────────────────────────────┐
│                         PR WORKFLOW                              │
│                                                                  │
│   1. Crear PR         gh pr create --title "..."                │
│         │                                                        │
│         ▼                                                        │
│   2. Descripción      - Qué tests se agregan                    │
│      detallada        - Link a TC en Jira                       │
│                       - Screenshots/evidencia                    │
│         │                                                        │
│         ▼                                                        │
│   3. Code Review      - Otro QA/Dev revisa                      │
│                       - Comentarios y fixes                      │
│         │                                                        │
│         ▼                                                        │
│   4. Approval         - Aprobación del reviewer                 │
│         │                                                        │
│         ▼                                                        │
│   5. Merge            - Squash and merge a main                 │
│         │                                                        │
│         ▼                                                        │
│   6. Update Jira      - TC status → "Automated"                 │
└─────────────────────────────────────────────────────────────────┘
```

### Pasos

1. **Crea el Pull Request**
   ```bash
   gh pr create --title "test: add checkout payment tests" --body "..."
   ```

2. **Escribe una descripción completa**
   ```markdown
   ## Summary
   - Added E2E tests for checkout payment flow
   - Covers TC-001, TC-002, TC-003 from TAUS-123

   ## Test Cases Automated
   | TC ID | Description | Type |
   |-------|-------------|------|
   | TC-001 | Successful payment | E2E |
   | TC-002 | Payment declined | E2E |
   | TC-003 | Invalid card format | E2E |

   ## Test Results
   ✅ All tests passing in CI
   - [Allure Report](link-to-report)
   - [CI Run](link-to-workflow)

   ## Checklist
   - [x] Tests pass locally
   - [x] Tests pass in CI
   - [x] No flaky tests
   - [x] Follows KATA patterns
   - [x] Jira tickets linked
   ```

3. **Solicita review**
   - Asigna a un reviewer (otro QA o Dev)
   - Usa labels apropiados (`test`, `automation`)

4. **Responde a comentarios**
   - Discute sugerencias
   - Implementa fixes si es necesario
   - Re-push y espera CI verde

5. **Merge cuando esté aprobado**
   ```bash
   gh pr merge --squash
   ```

6. **Actualiza Jira**
   - Cambia status de TCs a "Automated"
   - Vincula el PR al ticket
   - Cierra la TAUS

### Checklist de Code Review

```markdown
## Para el Reviewer

### Estructura y Patrones
- [ ] ¿Sigue la arquitectura KATA?
- [ ] ¿ATCs son atómicos?
- [ ] ¿Page Objects bien organizados?

### Calidad del Test
- [ ] ¿Test es independiente?
- [ ] ¿Assertions claras y específicas?
- [ ] ¿Datos no hardcodeados?

### Mantenibilidad
- [ ] ¿Selectores robustos (data-testid)?
- [ ] ¿Sin sleeps fijos?
- [ ] ¿Código DRY pero no sobre-abstraído?

### CI/CD
- [ ] ¿Tests pasan consistentemente?
- [ ] ¿Tiempo de ejecución razonable?
- [ ] ¿Reporte Allure correcto?
```

### Herramientas

- **GitHub**: PRs y code review
- **Jira/Xray**: Actualizar estados
- **Slack**: Coordinar con reviewer

---

## Resumen del Flujo TALC

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Handoff desde TMLC                                            │
│   (TCs con label automation-candidate)                          │
│         │                                                        │
│         ▼                                                        │
│   ┌─────────────┐                                               │
│   │  Stage 1    │  "¿Vale la pena automatizar?"                 │
│   │  Assessment │  → TCs clasificados                           │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │  Stage 2    │  "Escribir los tests"                         │
│   │  Automation │  → Tests en branch                            │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │  Stage 3    │  "¿Funcionan en CI?"                          │
│   │  CI Verify  │  → Tests verdes en pipeline                   │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │  Stage 4    │  "Review y merge"                             │
│   │  PR Review  │  → PR mergeado, TCs "Automated"               │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   Tests en main, ejecutándose en cada build                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prompts Relacionados

Para ejecutar cada stage con ayuda de AI:

| Stage | Prompt |
|-------|--------|
| Stage 1 | `.prompts/stage-4-automation/planning/test-implementation-plan.md` |
| Stage 2 | `.prompts/stage-4-automation/coding/e2e-test-coding.md` |
| Stage 3 | Verificación manual en CI |
| Stage 4 | `.prompts/stage-4-automation/review/e2e-test-review.md` |

---

## Métricas de TALC

### KPIs a Monitorear

| Métrica | Target | Cómo Medir |
|---------|--------|------------|
| **Assessment Throughput** | 10 TCs/semana | TCs evaluados por semana |
| **Automation Velocity** | 5 tests/semana | Tests automatizados por semana |
| **CI Pass Rate** | >95% | Tests que pasan en primer intento |
| **Flakiness Rate** | <5% | Tests que fallan intermitentemente |
| **PR Cycle Time** | <2 días | Tiempo desde PR hasta merge |

### Dashboard Sugerido

```
┌─────────────────────────────────────────────────────────────────┐
│                    TALC DASHBOARD                                │
│                                                                  │
│   Automation Backlog        CI Health          PR Status        │
│   ─────────────────         ─────────          ─────────        │
│   📋 Candidates: 15         ✅ Pass: 98%       🔄 Open: 3       │
│   🔄 In Progress: 3         ⚠️ Flaky: 2%      ✅ Merged: 12     │
│   ✅ Automated: 45          ❌ Fail: 0%       ⏱️ Avg: 1.5 días  │
│                                                                  │
│   ───────────────────────────────────────────────────────────   │
│   This Week: +5 tests automated | CI runs: 47 | All green ✅    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Referencias

- [IQL Methodology](docs/methodology/IQL-methodology.md)
- [Mid-Game Testing](docs/methodology/mid-game-testing.md)
- [TMLC - Manual Lifecycle](docs/workflows/test-manual-lifecycle.md)
- [KATA Architecture](.context/guidelines/TAE/kata-architecture.md)
