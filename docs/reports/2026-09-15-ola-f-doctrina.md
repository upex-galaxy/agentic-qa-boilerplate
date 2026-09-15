# Ola F · Deudas de doctrina del boilerplate + runner de evals

Worker de la Ola F del refactor del IQL (`agentic-qa-boilerplate`, worktree `iql-ola-f-boilerplate`,
rama `saiotest/iql-ola-f-boilerplate`, base `main` @ `9be1309`). Fuente: `.claude/briefs/F7-boilerplate.md`.
Coordinador: sesión `IQL-090-ola-f` (repo webapp).

## 7.1 · Las cinco deudas de doctrina

### Deuda 1 — verificador del stage Automation: opt-in vs requerido

**Antes:**
- `test-automation/SKILL.md:271` (Phase 3 — Review): *"Optional adversarial gate — for
  high-risk changes... Not invoked automatically — user opts in per ticket."*
- `stage-gates.md` contract table, fila **Automation**, columna "Separate verifier": ya decía
  **required** — `/pr-review-lead` o `/judgment-day`, en contexto limpio.
- La DoD checklist de Automation (bloque `Review:`) no tenía ítem de verificador — el gate
  requerido en la tabla de contrato no tenía correlato ejecutable en la lista de salida.

**Ahora:**
- `test-automation/SKILL.md`: la línea pasó de "Optional adversarial gate" a **"Required separate
  verifier"**. Ya no depende de "high-risk changes" ni de opt-in del usuario; corre siempre antes
  del merge, en contexto limpio, citando el principio `verifier-not-executor` y la fila de
  `stage-gates.md`.
- `stage-gates.md`: se agregó el ítem `[ ] Separate verifier run in a clean context (/pr-review-lead
  or /judgment-day) — REQUIRED, not opt-in` al bloque `Review:` de la DoD de Automation.
- La fila del contrato table no cambió — ya decía `required`, era la fuente correcta.

**Por qué:** es el contrato del IQL firmado por el dueño (`verifier-not-executor`): Automation es
la única stage con autonomía 3, y por diseño es la única que paga esa soga extra con un verificador
separado obligatorio. El SKILL.md estaba desalineado con su propio stage-gates.

**Archivos:** `.agents/skills/test-automation/SKILL.md`, `.agents/skills/agentic-qa-core/references/stage-gates.md`

---

### Deuda 2 — FLAKY: piso 5 vs ventana 10 (DOS cifras, no una)

**Antes:**
- `stage-gates.md:102` (contract table, fila **Regression**, columna "Evidence"): *"≥5 runs of
  history before the word FLAKY is allowed"* — este ya era el piso correcto.
- `regression-testing/SKILL.md:290`: *"Failure rate > 20% over last **10** runs? → FLAKY"* — la
  ventana correcta.
- `regression-testing/SKILL.md:506`: *"Flakiness needs **10** runs of history minimum."* — **este
  era el archivo atrasado**: mezclaba piso y ventana en una sola cifra equivocada (10 en vez de 5
  para el piso), contradiciendo a su propio `references/failure-classification.md` (líneas 57, 169
  y 288, que usan 5 como piso — `N < 5` → `INSUFFICIENT HISTORY` — y 10 como ventana,
  `N = min(10, available)`, línea 52). El syllabus de la webapp (`syllabus-edition-4.json:337` y
  `:723`) también sostiene 5 como piso.

**Primer intento (revertido) — colapsé mal la deuda:** leí "5 vs 10" como una contradicción entre
dos cifras que medían lo mismo y elegí una sola (10), editando `stage-gates.md` — el archivo que
en realidad ya estaba bien — y dejando sin tocar `SKILL.md:506`, que era el que tenía el error real.
Mandé `PREGUNTA:` al coordinador con esa lectura equivocada y seguí con el resto de las deudas
mientras esperaba respuesta. El coordinador verificó la rama pusheada y marcó la deuda 2 como no
resuelta.

**Corrección aplicada:** piso y ventana son dos medidas distintas, ambas correctas, y hay que
nombrarlas las dos — no colapsar a una:
- **Piso = 5**: el mínimo de historial antes de poder usar la palabra FLAKY en absoluto; por debajo,
  `INSUFFICIENT HISTORY`, nunca FLAKY.
- **Ventana = 10**: cuántas corridas entran en el cálculo del failure-rate, `N = min(10, available)`.

**Ahora:**
- `stage-gates.md:102` revertido a su forma correcta original y precisado: *"Allure report; ≥5 runs
  of history before the word FLAKY is allowed (below that: INSUFFICIENT HISTORY); rate computed
  over the last N = min(10, available); STR → STP"*.
- `regression-testing/SKILL.md:506` corregido (era el atrasado): de "needs 10 runs of history
  minimum" a "needs 5 runs of history minimum before you can call it at all... The failure-rate
  itself is computed over a wider window: the last N = min(10, available) runs... 5 is the floor to
  have any signal; 10 is the window the percentage is actually computed over."
- `SKILL.md:290` y `failure-classification.md` no cambiaron: ya usaban las dos cifras correctamente,
  cada una en su rol.

**No se tocó** el syllabus/deck de la webapp — es otro repo, ya está alineado, y está fuera de lo
que este worker puede editar.

**Archivos:** `.agents/skills/agentic-qa-core/references/stage-gates.md`,
`.agents/skills/regression-testing/SKILL.md`

---

### Deuda 3 — Sprint close sin fila en la tabla de contrato

**Antes:** `stage-gates.md` tiene un bloque de DoD completo para "Sprint close" (batch boundary,
no es una stage) pero la tabla de contrato (agent / human / evidence / autonomy / verifier) saltaba
de Reporting a Documentation sin fila para Sprint close.

**Ahora:** se agregó la fila, con los valores derivados literalmente de su propia DoD (nada
inventado):

| Stage | The agent does | The person signs | Evidence that must survive | Autonomy | Separate verifier |
|---|---|---|---|---|---|
| **Sprint close** | Creates or completes the sprint STR (first-to-arrive creates it, the other completes it), sets its Test Environment, links STR → STP via the `testPlan` edge | The STP's closure — its final scope/progress and the transition to its terminal state | STR as a Test Execution item carrying its Test Environment, STR → STP link resolved, STP at its terminal state | **2** | **none** |

**Por qué esos valores:**
- **Autonomy 2**: la DoD describe un patrón "first-to-arrive creates it, the other completes it" —
  supervisado por lote, sin lenguaje condicional de "decide dentro de límites y escala" (eso sería
  nivel 3, como Execution/Regression). Coincide con Reporting y Planning, sus vecinas más cercanas
  en el ciclo.
- **Verifier none**: la DoD de Sprint close no menciona un segundo agente que revise nada — ausencia
  literal de ese requisito, igual que Planning/Execution/Reporting/Regression.
- No se inventó autonomía ni verificador: ambos valores salen de leer la DoD tal cual está escrita,
  no de una analogía nueva.

**Archivo:** `.agents/skills/agentic-qa-core/references/stage-gates.md`

---

### Deuda 4 — `defect-management-doctrine.md` Part 8: lenguaje temporal

**Antes** (Part 8, anti-patrones):
```
[x] Filing "Bug" for a pre-release failure                    -> it is a Defect (Part 1)
[x] Filing "Defect" for a production-live failure             -> it is a Bug (Part 1)
```
Esta redacción empuja a leer "pre-release failure" / "production-live failure" como *cuándo se
encontró la falla*, contradiciendo a Part 1, cuyo criterio explícito y correcto es la **etapa del
ciclo de vida de la FEATURE**, no el momento/lugar del hallazgo (`"Classification follows the
lifecycle stage of the FEATURE, not the environment where you happened to find the problem"`).

**Ahora:**
```
[x] Filing "Bug" for a feature still pre-release (not yet live above Staging),
    based on when/where you found it rather than the feature's own lifecycle
    stage                                                      -> it is a Defect (Part 1)
[x] Filing "Defect" for a feature already live above Staging, based on when/
    where you found it rather than the feature's own lifecycle stage
                                                                 -> it is a Bug (Part 1)
```
Ahora el anti-patrón nombrado es explícitamente "clasificar por cuándo/dónde lo encontraste" — el
error real que Part 1 ya prohibía — y no "encontrar una falla antes/después del release", que es
un hecho neutro y no un anti-patrón en sí mismo.

Se revisó el resto del archivo (`grep` de "pre-release failure", "production-live failure", "found
it", "when...found") — Part 9 (Filing gate) ya estaba correctamente redactado (*"Classified Bug vs
Defect vs Improvement by feature lifecycle, not by where it was found?"*), no necesitó cambios.

**Archivo:** `.agents/skills/agentic-qa-core/references/defect-management-doctrine.md`

---

### Deuda 5 — `kata-academy`: `sourcePath` rotos

**Pasada completa** sobre los 14 usos de `sourcePath` bajo `packages/kata-academy` (chapters
ch1/ch3/ch4/ch6 + `types.ts` + un uso de UI en `Ch1Problema.svelte` que solo lee el campo, no lo
declara). Resultado: **2 rotos**, no `AuthSteps` como sospechaba el caso conocido del brief —
`AuthSteps` en sí resultó correcto (`ch3.ts:177` cita `.agents/skills/test-automation/references/kata-architecture.md`,
que sí existe y sí contiene el ejemplo de `AuthSteps` citado; el comentario `// tests/components/steps/AuthSteps.ts`
dentro del snippet es parte del ejemplo doctrinal, no una promesa de que ese archivo existe en el repo real).

| sourcePath roto | Apuntaba a | Corregido a | Verificado |
|---|---|---|---|
| `tests/components/ApiBase.ts` | (no existe) | `tests/components/api/ApiBase.ts` | Contiene el método `apiPOST` citado en el snippet |
| `tests/components/UiBase.ts` | (no existe) | `tests/components/ui/UiBase.ts` | Contiene el getter `page()` fail-fast citado en el snippet |

Los otros 12 `sourcePath` resolvían correctamente a un archivo real:

```
tests/integration/auth/user-session.test.ts        OK
tests/components/ApiFixture.ts                      OK
tests/components/TestFixture.ts (x2, ch3+ch4)       OK
tests/components/api/AuthApi.ts (x2, ch3+ch6)       OK
.agents/skills/test-automation/references/kata-architecture.md   OK
tests/components/TestContext.ts                     OK
'(anti-ejemplo: NO existe en el boilerplate...)'    OK (intencional, ch1 — no es una ruta real)
```

**Archivo:** `packages/kata-academy/src/lib/content/chapters/ch3.ts`

---

## KATA — sin re-discusión

No se tocó la fórmula canónica (cuatro capas, una dirección de dependencia, Steps opcional,
grafía Komponent Action Test Architecture). Los cambios de esta sesión no introducen "tres capas",
"5/6 capas", "Test files" como capa, ni "Component/Components" con C dentro de KATA.

---

## 7.2 · El runner de evals

**Antes:** 9 `evals/evals.json` bajo `.agents/skills/**` (acli, agentic-qa-onboard, git-flow-master,
project-discovery, regression-testing, sprint-testing, test-automation, test-documentation,
xray-cli) — 66 casos de activación en total, sin nada que los descubriera ni corriera.

**Descubrimiento previo al diseño:** los 9 archivos NO comparten un único schema. Tres formas
distintas conviven:

1. `{ name, prompt, expected_behavior, category: positive|negative }` (+ `expected_skill` opcional)
   — 7 de los 9 archivos.
2. `{ id, prompt, expected_output, should_trigger: boolean, files }` — solo `git-flow-master`.
3. `{ id, prompt, expected_output, files, expectations: string[] }` (sin polaridad explícita) —
   solo `regression-testing`.

**Decisión de alcance (por qué no es un "framework"):** son evals de *activación* — la pregunta
real ("¿el skill se dispara con este prompt?") solo se responde invocando un modelo de verdad y
juzgando la transcripción, que es exactamente lo que hace `claude plugin eval` sobre
`case.yaml`/`graders/*.md` (mecanismo que ya existe en Claude Code, pero con un schema distinto al
de estos `evals.json`). Migrar los 9 archivos a ese schema, o levantar un juez propio con llamadas
reales a un modelo, es construir el framework que el brief pide explícitamente NO construir — y
además necesitaría credenciales de API que este worktree no tiene provisionadas (`.env` no trae
`ANTHROPIC_API_KEY`; correr esto en CI sin ese secreto es imposible).

**Lo que sí se construyó — `scripts/run-skill-evals.ts`:** descubre los 9 archivos, normaliza las
3 formas a un caso común, y valida estructuralmente cada uno, determinístico y sin red:

- JSON parseable, `evals` no vacío
- `prompt` y `expected_behavior`/`expected_output` no vacíos
- polaridad válida (`category` ∈ {positive, negative} o `should_trigger` booleano)
- `name`/`id` único dentro del archivo
- `expected_skill` (cuando existe) resuelve a un directorio real bajo `.agents/skills/`
- `skill_name` (cuando existe en el archivo) coincide con el directorio que lo contiene
- `expectations` (shape 3), cuando existe, es un array no vacío

Un caso con señal débil (ej. un prompt positivo sin ningún parecido léxico con la descripción del
skill) se reporta como **warning**, nunca como fallo — ese heurístico es demasiado ruidoso para
usarlo como gate.

**Corrida real (este worktree, `bun run skills:evals`):**

```
Files: 9 · Cases: 66 · Passed: 66 · Warned: 0 · Failed: 0
```

Los 9 archivos, 66 casos, todos verdes. Probé también el camino de fallo (categoría inválida,
prompt vacío, id duplicado sobre una copia temporal de `acli/evals/evals.json`, restaurada después)
— el runner detectó los 3 defectos inyectados y salió con código 1; restaurado y vuelto a correr en
verde antes de tocar nada más.

**CI:** paso nuevo `Skill Activation Evals Check` (`bun run skills:evals`) en
`.github/workflows/build.yml`, en la misma pipeline estática que ya corre `types:check` y
`lint:check` sobre cada PR contra `main`. No se creó un workflow nuevo — encaja en el gate estático
que ya existe y no tiene costo de red ni de créditos de modelo.

**package.json:** nuevo script `skills:evals` : `bun scripts/run-skill-evals.ts`, junto a
`skills:check` / `skills:registry`.

---

## Verificación corrida en este worktree

| Gate | Resultado |
|---|---|
| `bun run types:check` | ✅ limpio |
| `bun run lint:check` | ✅ limpio |
| `bun test scripts/` (unit tests existentes) | ✅ 64/64 |
| `bun run skills:check` | ✅ 14/14 checks |
| `bun run skills:registry` (regenerado tras tocar `test-automation/SKILL.md`) | ✅ (solo cambió el timestamp `Generated:`) |
| `bun run skills:registry:check` | ✅ up to date |
| `bun run kata:manifest:check` | ✅ up to date |
| `bun run skills:evals` (el runner nuevo, sobre los 9 reales) | ✅ 66/66 |
| `bun run format:check` | ✅ |
| `bun run vars:check` / `vars:env:check` | ✅ |
| `bun run agents:compat:check` | ✅ (reparé el alias `.claude/skills` faltante del worktree con `bun run agents:compat` — gap de provisioning, artefacto generado/gitignoreado, no de doctrina) |
| `bun run git:policy verify` | ✅ (1 divergencia aceptada, ya documentada en `.agents/project.yaml`, sin drift) |
| `bun run repo:check` (completo) | ✅ exit 0 |

No corrí `bun run test` (suite Playwright completa) ni ningún build pesado — fuera de alcance por
instrucción explícita del brief.

---

## Qué no se tocó

- `packages/decks/**`: sin cambios.
- `kata-academy` fuera de los 2 `sourcePath` corregidos: sin cambios.
- El repo de la webapp: no se clonó, no se leyó.

## Qué queda abierto

- **Deuda 2 (FLAKY): cerrada.** Piso 5 / ventana 10, las dos cifras nombradas donde corresponde
  (`stage-gates.md:102`, `regression-testing/SKILL.md:506`), confirmado por el coordinador contra
  `failure-classification.md` y el syllabus de la webapp. Ver el detalle del primer intento fallido
  en la sección de la Deuda 2 arriba — quedó documentado a propósito, no se reescribió la historia.

- **PENDIENTE — el runner de evals valida ESTRUCTURA, no activación real.**
  `scripts/run-skill-evals.ts` confirma que los 66 casos están bien formados (prompt no vacío,
  polaridad válida, `expected_skill` resuelve a un skill real, sin duplicados) — eso es lo que
  corre hoy en CI y lo que da 66/66 verde. Lo que **no** hace, y que el nombre "activation eval"
  promete: invocar un modelo de verdad con cada `prompt` y verificar que el skill correcto se
  dispare (o no se dispare, en los casos negativos). Verificar eso necesita una llamada real a un
  modelo y un juez sobre la transcripción — es exactamente lo que `claude plugin eval` hace para
  su propio formato (`case.yaml` + `graders/*.md`), pero estos 9 `evals.json` no están en ese
  formato, y este worktree no tiene `ANTHROPIC_API_KEY` provisionada para correrlo en CI. Migrar los
  9 archivos a ese formato u operar un juez propio es trabajo aparte, explícitamente fuera de
  alcance de esta tarea ("no construyas un framework"). Anotado acá porque este repo no tiene un
  registro de pendientes dedicado — el punto de verdad hoy es este informe y el comentario de
  cabecera de `scripts/run-skill-evals.ts`, que dice lo mismo.
