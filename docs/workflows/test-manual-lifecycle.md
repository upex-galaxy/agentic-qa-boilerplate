# Test Manual Lifecycle (TMLC)

> **Idioma:** Español
> **Audiencia:** QA Analysts que ejecutan el ciclo de testing manual in-sprint
> **Skills:** `/sprint-testing` (planificación, ejecución, reporte) · `/test-documentation` (TMS + priorización)

---

## ¿Qué es TMLC?

El **Test Manual Lifecycle** es el flujo de trabajo manual que sigue un QA Analyst desde que recibe una User Story hasta que los casos de prueba quedan documentados en el TMS y listos para handoff a automatización.

El trabajo se reparte en dos skills complementarios:

- `/sprint-testing` cubre el ciclo in-sprint por ticket: planificar, ejecutar, reportar.
- `/test-documentation` toma los resultados y produce documentación formal + priorización por ROI.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TEST MANUAL LIFECYCLE                         │
│                                                                  │
│   /sprint-testing                           /test-documentation  │
│   ────────────────────────────────────      ──────────────────── │
│                                                                  │
│   Planning  →  Execution  →  Reporting  →   Documentation +     │
│   (ATP)        (Smoke +      (ATR + QA      Priorización ROI    │
│                 UI/API/DB)    comment)       (TMS artifacts)     │
│                                                                  │
│   ┌───────┐    ┌───────┐     ┌───────┐      ┌───────┐           │
│   │  ATP  │ →  │  FTX  │  →  │  ATR  │   →  │  TMS  │           │
│   │ Plan  │    │Execute│     │Report │      │ + ROI │           │
│   └───────┘    └───────┘     └───────┘      └───────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Sprint Testing (`/sprint-testing`)

El skill `/sprint-testing` orquesta el ciclo completo por ticket: planning, ejecución y reporte. Invócalo con una frase natural o con su slash trigger.

### Ejemplo de invocación

```
Test the user story UPEX-123.
Verify the fix for bug UPEX-456.
Run QA on this sprint's tickets.
```

El skill crea el PBI folder (`.context/PBI/{module}/{TICKET}/`) con `context.md`, `test-session-memory.md` y `evidence/`, explica la historia y **espera tu confirmación** antes de continuar.

---

### Planning — del AC al ATP

Cuando llega una User Story al sprint, la primera tarea es **entender completamente qué se va a construir** antes de que Development empiece (shift-left).

**Qué hace el skill:**

1. **Lee la User Story completa**: título, descripción, criterios de aceptación, mockups si existen.
2. **Identifica ambigüedades**: AC poco claros, edge cases faltantes, comportamientos no especificados.
3. **Registra preguntas al PO/BA/Dev** dentro del PBI folder (no las asume).
4. **Genera el Acceptance Test Plan (ATP)** en el TMS: escenarios prioritizados, dependencias, datos de prueba necesarios.

**Ejemplo de escenarios en el ATP:**

```markdown
## ATP: UPEX-123 — Checkout con múltiples métodos de pago

### Escenarios a probar:
1. Happy path: Pago con tarjeta válida
2. Pago con tarjeta rechazada
3. Pago con PayPal
4. Cambiar método de pago después de seleccionar
5. Checkout con carrito vacío (edge case)
6. Timeout de la pasarela de pago (verificar con Dev)

### Dependencias:
- Credenciales de sandbox de Stripe
- Cuenta de prueba PayPal
```

**Herramientas:** `[ISSUE_TRACKER_TOOL]` para fetch del ticket, `[TMS_TOOL]` para crear el ATP y los TCs con traceability completa.

---

### Execution — Exploratory Testing

Una vez que Development despliega la US en staging, el skill ejecuta **testing exploratorio** validando la funcionalidad.

**Qué hace el skill:**

1. **Verifica ambiente**: deploy presente, acceso a staging, datos de prueba disponibles.
2. **Smoke test primero** (Go / No-Go). Si falla, detiene el flujo.
3. **Ejecuta el ATP** usando `trifuerza` (UI / API / DB) según qué haya cambiado.
4. **Registra evidencia** en `.context/PBI/{module}/{TICKET}/evidence/`.
5. **Documenta hallazgos**: bugs se crean inmediatamente vía `[ISSUE_TRACKER_TOOL]`.

**Técnicas aplicadas:**

```
Session-Based Testing:
   - Timeboxed (30-60 min)
   - Enfocado en un área
   - Documenta hallazgos al final

Tour-Based Testing:
   - Tour del dinero (flujo de transacciones)
   - Tour del principiante (usuario nuevo)
   - Tour del hacker (intenta romper cosas)

Heurísticas:
   - CRUD: Create, Read, Update, Delete
   - Boundaries: límites, valores extremos
   - Interruptions: ¿qué pasa si cancelo a mitad?
```

**Template de bug (el skill lo emite automáticamente):**

```markdown
## BUG: Checkout falla con tarjetas American Express

**Pasos para reproducir:**
1. Agregar producto al carrito
2. Ir a checkout
3. Seleccionar "Pagar con tarjeta"
4. Ingresar número de tarjeta Amex: 3782 8224 6310 005
5. Completar formulario y hacer clic en "Pagar"

**Resultado actual:**
Error genérico "Payment failed" sin más detalle

**Resultado esperado:**
- Si Amex no está soportada: mensaje claro
- Si está soportada: pago procesado

**Ambiente:** Staging
**Browser:** Chrome 120
**Screenshots:** [adjuntos]
```

**Herramientas:** `[AUTOMATION_TOOL]` (playwright-cli) para screenshots/trazas, `[API_TOOL]` para probar endpoints, `[DB_TOOL]` para validar data integrity.

---

### Reporting — del ATR al QA comment

Cerrar el ciclo con un reporte formal y traceabilidad completa.

**Qué hace el skill:**

1. **Completa el Acceptance Test Report (ATR)** en el TMS con resultados por TC.
2. **Emite el QA comment** en la ticket (Template PASSED / FAILED) vía `[ISSUE_TRACKER_TOOL]`.
3. **Transiciona el ticket** (`Tested`, `Ready for Release`, etc.).
4. **Mirror local** del reporte en `test-report.md` dentro del PBI folder.

Tras Reporting, el skill identifica el handoff: para documentación formal + ROI, carga `/test-documentation`.

---

## Test Documentation (`/test-documentation`)

El skill `/test-documentation` toma los outputs de `/sprint-testing` y produce documentación estable en el TMS, priorizando qué casos merecen automatización.

### Ejemplo de invocación

```
Document test cases for ticket UPEX-200 in Xray.
Score these tests by ROI to decide automation priority.
Create the ATP for UPEX-300 in Xray and link it to the story.
```

### Priorización por riesgo

El skill evalúa cada escenario contra criterios estándar y emite un veredicto por test: **Candidate**, **Manual**, o **Deferred**.

| Criterio | Preguntas | Si es alto... |
|----------|-----------|---------------|
| **Impacto de negocio** | ¿Afecta revenue? ¿Usuarios críticos? | Documentar + Candidate |
| **Frecuencia de uso** | ¿Cuántos usuarios lo ejecutan? | Documentar |
| **Complejidad técnica** | ¿Muchos componentes involucrados? | Documentar |
| **Historial de bugs** | ¿Ha fallado antes? | Documentar + Candidate |
| **Cambios frecuentes** | ¿El código cambia seguido? | Candidate |

### Matriz de decisión

```
                    Alta Probabilidad de Fallo
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         │    DOCUMENTAR      │    CANDIDATE       │
         │    + MONITOREAR    │    (a automatizar) │
         │                    │                    │
   Bajo  ├────────────────────┼────────────────────┤ Alto
 Impacto │                    │                    │ Impacto
         │    DEFERRED        │    MANUAL          │
         │    (exploratory)   │    (documentar)    │
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                    Baja Probabilidad de Fallo
```

### Output: lista priorizada

```markdown
## Priorización — UPEX-123 Checkout

### Candidate (documentar + handoff a /test-automation)
1. Happy path pago con tarjeta
2. Pago rechazado muestra error correcto
3. Validación de campos obligatorios

### Manual (documentar, no automatizar)
4. Cambio de método de pago
5. Aplicar código de descuento
6. Checkout con múltiples productos

### Deferred (solo exploratorio)
7. Checkout con carrito de un solo item
8. UI en diferentes resoluciones
```

### Estructura de un Test Case (el skill lo genera)

```markdown
## TC-001: Checkout — Pago exitoso con tarjeta de crédito

**Precondiciones:**
- Usuario logueado
- Al menos 1 producto en el carrito
- Cuenta con tarjeta de prueba válida

**Datos de prueba:**
- Tarjeta: 4242 4242 4242 4242
- Fecha: 12/25
- CVV: 123

**Pasos:**
1. Navegar a /checkout
2. Verificar que el resumen del carrito es correcto
3. Seleccionar "Pagar con tarjeta"
4. Ingresar datos de la tarjeta de prueba
5. Hacer clic en "Confirmar pago"
6. Esperar confirmación

**Resultado esperado:**
- Mensaje de éxito "¡Gracias por tu compra!"
- Email de confirmación enviado
- Order creada en estado "paid"
- Inventario actualizado

**Etiquetas:** regression, checkout, payments, automation-candidate
```

### Cuándo NO documentar

- Escenarios triviales ya cubiertos (login básico si existe)
- Tests one-time (migración de datos)
- Casos que cambian constantemente
- Escenarios cubiertos por otros TCs

**Herramientas:** `[TMS_TOOL]` (xray-cli) para crear / actualizar / linkear artifacts.

---

## Resumen del flujo TMLC

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   US llega al sprint                                            │
│         │                                                        │
│         ▼  /sprint-testing                                      │
│   ┌─────────────┐                                               │
│   │  Planning   │  "¿Qué vamos a probar?"                       │
│   │  (ATP)      │  → ATP + TCs + traceability                   │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼  (Dev implementa, deploya a staging)                 │
│   ┌─────────────┐                                               │
│   │  Execution  │  "¿Funciona correctamente?"                   │
│   │  (smoke +   │  → Bugs reportados, US validada              │
│   │   UI/API/DB)│                                               │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │  Reporting  │  "Cerrar y comunicar"                         │
│   │  (ATR)      │  → ATR + QA comment + ticket transitioned   │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼  /test-documentation                                 │
│   ┌─────────────┐                                               │
│   │  TMS Docs   │  "¿Qué merece automatización?"                │
│   │  + ROI      │  → Candidate / Manual / Deferred              │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   Handoff a TALC (/test-automation)                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Qué viene después

Para los TCs marcados como **Candidate**, carga el Test Automation Lifecycle:

- `/test-automation` — Plan → Code → Review (ver `docs/workflows/test-automation-lifecycle.md`).
- `/regression-testing` — ejecución de suites regresivas y decisión GO / NO-GO cuando haya un release candidate.

---

## Referencias

- [TALC — Automation Lifecycle](test-automation-lifecycle.md)
- Skills: `.claude/skills/sprint-testing/`, `.claude/skills/test-documentation/`
- Boilerplate overview: `README.md` sección "How to Use Each Skill"
