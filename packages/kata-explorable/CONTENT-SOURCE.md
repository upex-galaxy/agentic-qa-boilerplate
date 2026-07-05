# CONTENT-SOURCE — Dossier canónico del Explorable KATA

> Fuente única para los agentes que escriben capítulos. Todo lo de aquí fue
> extraído del boilerplate real (`agentic-qa-boilerplate`) y de su doctrina
> (`.claude/skills/test-automation/references/*`). NO inventes reglas ni código:
> usa lo que está aquí.

## 0. Audiencia y estilo de escritura (OBLIGATORIO)

- **Audiencia**: persona con conocimientos básicos de programación y MUY poco
  de OOP. No sabe qué es inyección de dependencias, apenas entiende imports.
- **Idioma**: español. Términos técnicos quedan en inglés (ATC, fixture, spec,
  test runner, endpoint, locator).
- **Glosario contextual**: la primera aparición de un término técnico en cada
  capítulo se envuelve con `<Term t="fixture">fixture</Term>`
  (`$lib/components/Term.svelte`). Las claves disponibles están en
  `src/lib/content/glossary.ts` (NO edites ese archivo; si falta un término,
  repórtalo al orquestador).
- **Tono**: guía cercana, frases cortas, imagen mental antes que definición.
  Patrón pedagógico: **dolor → patrón → regla → recompensa**.
- **Analogías aprobadas** (de los decks del repo): pieza de lego (ATC),
  átomo (atomicidad), caja de herramientas que se arma sola (fixture/DI),
  registro civil / censo (kata-manifest), cajas etiquetadas (variables),
  recetas con nombre (funciones/métodos), red de seguridad (TypeScript),
  edificio de pisos (capas).
- **Código real, no pseudocódigo**: usa las muestras de §5. Cita la ruta de
  origen en el `title` del CodePane.

## 1. Qué es KATA (el corazón del mensaje)

KATA = **Component Action Test Architecture**. La idea central que TODO el
explorable debe transmitir:

> En vez de escribir los casos de prueba dentro de los archivos de prueba de
> Playwright, KATA los empaqueta como **métodos reutilizables dentro de
> componentes** (módulos no ejecutables). El caso de prueba se construye UNA
> vez —como una pieza de lego— y los archivos de prueba (los specs) se vuelven
> simples **orquestadores**: eligen piezas y las encadenan para formar flujos
> E2E o de integración.

- La pieza = **ATC (Acceptance Test Case)**: un caso de prueba completo
  (preparación + acción + verificación + aserciones fijas) con identidad
  propia: `@atc('PROJ-101')` — el ID de su ticket en el TMS.
- El spec (test file) casi no tiene lógica: destructura el fixture, llama
  ATCs, añade aserciones de flujo.
- Resultado: el repositorio de pruebas ES el catálogo de casos de prueba, con
  trazabilidad 1:1 a Jira/Xray, y cada E2E reporta el estado de CADA caso de
  prueba que contiene.

## 2. El modelo de capas (edificio)

```
tests/e2e/*.test.ts  ·  tests/integration/*.test.ts   ← specs: ORQUESTAN
────────────────────────────────────────────────────
L4  Fixtures (DI): TestFixture, ApiFixture, UiFixture  ← entregan la caja de herramientas
L3.5 Steps: AuthSteps… (cadenas de ATCs reutilizables, SIN @atc)
L3  Dominio: AuthApi, LoginPage, CheckoutPage          ← AQUÍ viven los ATCs
L2  Bases: ApiBase (HTTP), UiBase (Playwright)         ← helpers técnicos
L1  TestContext: config, faker, entorno                ← cimientos agnósticos
```

Regla: **una capa superior usa a la inferior, nunca al revés.** Cada capa de
dominio HEREDA de su base (AuthApi extends ApiBase extends TestContext).

Roles en una frase:
- **L1 TestContext**: qué entorno, qué credenciales, qué datos falsos — sin
  nada de Playwright ni HTTP.
- **L2 ApiBase**: métodos HTTP tipados que devuelven tuplas
  (`apiPOST → [respuesta, cuerpo, payloadEnviado]`). **UiBase**: helpers de
  navegador (intercepción de red, esperas por condición).
- **L3 Dominio**: la lógica de negocio de CADA recurso/página. Los ATCs viven
  aquí, decorados con `@atc('TICKET-ID')`. Helpers de solo-lectura usan
  `@step` (sin ID, no se reportan al TMS).
- **L3.5 Steps**: cadenas de ATCs para preparación reutilizable (3+ ATCs
  repetidos en 3+ tests). NO llevan `@atc`.
- **L4 Fixtures**: inyección de dependencias. El test pide `{ api }`, `{ ui }`
  o `{ test }` y Playwright construye SOLO lo necesario (lazy): `{ api }`
  jamás abre navegador.

## 3. Reglas de oro (las que enseña el explorable)

1. **Un ATC es un mini-flujo completo, atómico. NUNCA llama a otro ATC.**
   Un wrapper de un click NO es un ATC. Cadenas reutilizables → Steps.
2. **Identidad de un caso de prueba = precondición + acción.** Todos los
   resultados esperados de esa pareja son aserciones del MISMO caso.
3. **Partición de equivalencia**: mismos resultados esperados con datos
   distintos → UN solo ATC parametrizado (3 logins inválidos que dan 401 =
   1 ATC `loginWithInvalidCredentials(payload)`).
4. **Máximo 2 parámetros posicionales**; 3+ → un objeto con nombres.
5. **Locators inline** dentro del ATC. Se extraen a propiedad privada de la
   clase SOLO si se usan en 2+ ATCs. Prohibidos los archivos `locators/*.ts`.
6. **Aserciones fijas dentro del ATC; aserciones de flujo en el spec.**
7. **Helper vs ATC**: GET de solo lectura = helper (`@step`); acción que
   cambia estado = ATC (`@atc`).
8. **Fail-fast en público, silencio en privado**: métodos públicos lanzan
   error descriptivo; utilidades privadas devuelven `null`.
9. **Sin esperas mágicas** (`waitForTimeout` prohibido) y **sin retries**
   (`retries: 0`): un test que pasa al reintentar es un bug.
10. **Cada test genera sus propios datos** (faker) — nada de estado compartido.
11. **Imports con alias** (`@api/`, `@ui/`, `@TestFixture`) — nunca `../../..`.
12. **kata-manifest.json** = registro civil: antes de crear un componente o
    ATC se consulta; un pre-commit bloquea si está desactualizado.

Convención de nombres: ATC = `{verbo}{Recurso}{Escenario}` →
`createOrderSuccessfully`, `loginWithInvalidCredentials`,
`getUserWithNonExistentId`. Specs = `{verboDeUsuario}{Feature}.test.ts`
(`processCheckout.test.ts`, jamás `checkTest.test.ts`).
Jerarquía: carpeta = módulo → archivo = feature → `describe` = ticket →
`test` = escenario (`'UPEX-411: should apply percentage discount…'`).

## 4. La maquinaria de resultados (capítulos 6 y 8)

**LA pregunta que responde el simulador**: *si un E2E encadena varios casos de
prueba, ¿cómo sabemos cuáles pasaron?* Respuesta: la cobertura de casos está
**desacoplada** del conteo de tests de Playwright — el decorador `@atc` reporta
por EJECUCIÓN DE MÉTODO, no por `test()`.

Cadena completa (todo implementado en el repo):

```
test() llama ui.login.loginSuccessfully()
   └─ @atc('PROJ-101') envuelve el método:
        1. allure.label('testId','PROJ-101') + link a Jira /browse/PROJ-101
        2. test.step("ATC [PROJ-101]: loginSuccessfully(...)")  ← visible en reporte
        3. al terminar: APPEND 1 línea a reports/.atc_partial.ndjson
             {"testId":"PROJ-101","methodName":"loginSuccessfully",
              "className":"LoginPage","status":"PASS","error":null,
              "executedAt":"2026-03-27T19:34:58.470Z","duration":1835,"softFail":false}
   (¿por qué archivo y no memoria? Playwright corre cada proyecto en un
    proceso worker separado — la memoria no sobrevive; el archivo sí.)

KataReporter.onEnd() agrega el NDJSON → reports/atc_results.json
   · agrupa por testId; un mismo ATC ejecutado N veces = 1 entrada, N executions
   · estado CONSERVADOR: si CUALQUIER ejecución falló → el ATC queda FAILED
     (un solo contexto roto contamina el caso completo)

global.teardown.ts (si AUTO_SYNC=true; por defecto OFF)
   └─ syncToXray(): POST a xray.cloud/api/v2/import/execution
        { info:{...}, tests:[{ testKey:'PROJ-101', status:'PASSED', comment }] }
        → crea una Test Execution en Xray; cada Test Run se actualiza
   └─ (alternativa jira-native) syncToJiraDirect(): PUT al issue + comentario
```

Trazabilidad (modelo tres letras): Historia (US) ↔ ATP (plan) ↔ ATR
(resultados) ↔ TC (caso de prueba = issue en Jira/Xray) ↔ `@atc('TC-KEY')` en
código. El string del decorador ES la clave del issue — el único join key de
punta a punta.

CI (GitHub Actions, 4 workflows):
| Workflow | Disparo | Qué corre |
|---|---|---|
| build | PR a main | types + lint + `--list` (sin ejecutar tests) |
| regression | cron diario 00:00 + manual | integration → e2e → merge Allure → GitHub Pages |
| smoke | cron diario 02:00 + manual | solo tests `@critical` |
| sanity | manual | tests filtrados por grep/archivo |

El veredicto **GO / CAUTION / NO-GO** lo emite el agente de IA leyendo el
reporte (doctrina de `/regression-testing`), no un script: vetos duros = falla
cualquier `@critical`, regresión CRITICAL/HIGH, o pass-rate < 90%.

## 5. Muestras de código REAL (usar tal cual en CodePane)

### 5.1 El spec espagueti (para el capítulo 1 — ANTI-ejemplo, construidlo así)

Sin KATA: 40+ líneas por test, selectores repetidos en cada archivo, waits
mágicos, credenciales hardcodeadas, cero trazabilidad. (Este es el ÚNICO
código que se permite "inventar"; márcalo como anti-ejemplo.)

### 5.2 El mismo flujo con KATA — spec real
`tests/integration/auth/user-session.test.ts` (adaptado mínimo):

```ts
import { expect, test } from '@TestFixture';
import { config } from '@variables';

test.describe('UPEX-100: User session', () => {
  test('UPEX-100: should be able to re-authenticate', async ({ api }) => {
    api.clearAuthToken();

    const credentials = {
      email: config.testUser.email,
      password: config.testUser.password,
    };
    const [response, tokenData] = await api.auth.authenticateSuccessfully(credentials);

    expect(response.status()).toBe(200);
    expect(tokenData.access_token).toBeDefined();
  });
});
```

### 5.3 Un ATC de API completo — `tests/components/api/AuthApi.ts`

```ts
@atc('PROJ-101')
async authenticateSuccessfully(
  credentials: LoginPayload,
): Promise<[APIResponse, TokenResponse, LoginPayload]> {
  // ACTION: POST login credentials
  const [response, body, sentPayload] = await this.apiPOST<TokenResponse, LoginPayload>(
    this.config.auth.loginEndpoint,
    credentials,
  );

  // Fixed assertions - validates successful authentication
  expect(response.status()).toBe(200);
  expect(body.access_token).toBeDefined();
  expect(body.token_type).toBe('Bearer');
  expect(body.expires_in).toBeGreaterThan(0);

  // Store token for subsequent requests
  this.setAuthToken(body.access_token);

  // VERIFICATION: Confirm the session is valid via GET /auth/me
  const [meResponse, meBody] = await this.getCurrentUser();
  expect(meResponse.status()).toBe(200);
  expect(meBody.user.email).toBe(credentials.email);

  return [response, body, sentPayload];
}
```

Y su helper de solo lectura (contraste ATC vs helper):

```ts
@step
async getCurrentUser(): Promise<[APIResponse, UserInfoResponse]> {
  const [response, body] = await this.apiGET<UserInfoResponse>(this.config.auth.meEndpoint);
  return [response, body];
}
```

### 5.4 Un ATC de UI con locators inline — `tests/components/ui/ExamplePage.ts`

```ts
export class ExamplePage extends UiBase {
  private readonly emailInput = () =>
    this.page
      .getByTestId('email-input')
      .or(this.page.locator('#email'))
      .or(this.page.locator('input[name="email"]'));

  private readonly submitButton = () =>
    this.page.locator('button[type="submit"]').or(this.page.getByTestId('submit-button'));

  @atc('PROJ-101')
  async submitFormWithValidData(data: ExampleFormData) {
    await this.goto();

    await this.emailInput().first().fill(data.email);
    await this.passwordInput().first().fill(data.password);
    await this.submitButton().click();

    await this.page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

### 5.5 L1 — `tests/components/TestContext.ts` (clase completa)

```ts
export class TestContext {
  protected readonly _page?: Page;
  protected readonly _request?: APIRequestContext;
  readonly env: Environment;
  readonly config = config;
  static readonly data = DataFactory;

  constructor(options: TestContextOptions = {}) {
    this._page = options.page;
    this._request = options.request;
    this.env = options.environment ?? env.current;
  }

  get data(): typeof DataFactory {
    return TestContext.data;
  }
}
```

### 5.6 L2 — la tupla de `ApiBase.apiPOST` (fragmento)

```ts
async apiPOST<TBody, TPayload>(
  endpoint: string,
  data: TPayload,
  options: RequestOptions = {},
): Promise<[APIResponse, TBody, TPayload]> {
  const url = this.apiEndpoint(endpoint);
  const headers = this.buildHeaders(options.headers);

  const response = await this.request.post(url, { headers, data, params: options.params });
  const body = await this.getResponseJsonObject<TBody>(response);

  await attachRequestResponseToAllure({ url: endpoint, method: 'POST', responseBody: body, requestBody: data });

  return [response, body, data];
}
```

Contrato de tuplas: `GET/DELETE → [respuesta, cuerpo]`;
`POST/PUT/PATCH → [respuesta, cuerpo, payloadEnviado]`.

### 5.7 L2 — el guardián de UiBase (fail-fast)

```ts
get page(): Page {
  if (!this._page) {
    throw new Error(
      'Page is not available. UiBase requires a page instance. '
      + 'Make sure you are using a UI fixture (ui or test), not api.',
    );
  }
  return this._page;
}
```

### 5.8 L4 — el fixture como caja de herramientas — `tests/components/ApiFixture.ts`

```ts
export class ApiFixture extends ApiBase {
  readonly auth: AuthApi;
  readonly example: ExampleApi;

  constructor(options: TestContextOptions) {
    super(options);
    this.auth = new AuthApi(options);
    this.example = new ExampleApi(options);
  }

  override setAuthToken(token: string) {
    super.setAuthToken(token);
    this.auth.setAuthToken(token);
    this.example.setAuthToken(token);
  }
}
```

Y el registro en Playwright (lazy — `{ api }` no abre navegador):

```ts
export const test = base.extend<{
  test: TestFixture
  api: ApiFixture
  ui: UiFixture
}>({
  test: async ({ page, request }, use) => {
    await use(new TestFixture(page, request));
  },
  ui: async ({ page, request }, use) => {
    await use(new UiFixture({ page, request }));
  },
  api: async ({ request }, use) => {
    await use(new ApiFixture({ request }));
  },
});
```

### 5.9 Steps (L3.5) — cadena de ATCs SIN @atc (doctrina)

```ts
export class AuthSteps {
  constructor(private ui: UiFixture, private api: ApiFixture) {}

  async setupAuthenticatedUser(credentials: Credentials) {
    await this.ui.auth.loginWithValidCredentials(credentials);
    await this.ui.profile.completeOnboardingSuccessfully();
    await this.ui.settings.enableFeatureFlagSuccessfully();
  }
}
```

### 5.10 Anti-ejemplos oficiales (capítulos 2 y 7)

```ts
// ❌ NO es un ATC — una sola interacción
@atc('TICKET-ID') async clickLoginButton() { await this.page.click('#login'); }

// ❌ NUNCA: un ATC llamando a otro ATC
@atc('TICKET-ID')
async checkoutWithNewUser() {
  await this.signupSuccessfully(userData);   // ← prohibido
  await this.addToCartSuccessfully(product);
}

// ❌ 3 ATCs para el mismo resultado (401) — viola partición de equivalencia
@atc('T1') async loginWithWrongEmail() {}
@atc('T2') async loginWithWrongPassword() {}
@atc('T3') async loginWithEmptyFields() {}

// ✅ UNO parametrizado
@atc('T1') async loginWithInvalidCredentials(payload: LoginPayload) { /* 401 */ }
```

### 5.11 kata-manifest.json (extracto real)

```json
{
  "components": {
    "api": [
      {
        "name": "AuthApi",
        "relativePath": "tests/components/api/AuthApi.ts",
        "atcs": [
          { "id": "PROJ-101", "method": "authenticateSuccessfully", "line": 62 },
          { "id": "PROJ-102", "method": "loginWithInvalidCredentials", "line": 98 }
        ]
      }
    ],
    "ui": [
      {
        "name": "LoginPage",
        "relativePath": "tests/components/ui/LoginPage.ts",
        "atcs": [
          { "id": "PROJ-101", "method": "loginSuccessfully", "line": 41 },
          { "id": "PROJ-102", "method": "loginWithInvalidCredentials", "line": 73 }
        ]
      }
    ]
  },
  "summary": { "totalComponents": 4, "totalATCs": 9 }
}
```

## 6. Catálogo de piezas para el ENSAMBLADOR (cap. 5)

ATCs reales disponibles como piezas arrastrables (del manifest + doctrina):

| Pieza (ATC) | Componente | Tipo | Devuelve |
|---|---|---|---|
| `authenticateSuccessfully(credentials)` | `api.auth` | API | `[response, tokenData, payload]` |
| `loginWithInvalidCredentials(payload)` | `api.auth` | API | `[response, errorBody, payload]` |
| `loginSuccessfully(credentials)` | `ui.login` | UI | `void` (termina en /dashboard) |
| `createResourceSuccessfully(payload)` | `api.example` | API | `[response, body, payload]` |
| `submitFormWithValidData(data)` | `ui.example` | UI | `void` |
| helper: `getCurrentUser()` | `api.auth` | API (solo lectura, @step) | `[response, userInfo]` |

Reglas que el ensamblador debe hacer cumplir (con feedback visual):
- Arrastrar una pieza DENTRO de otra pieza → rebota: "Un ATC nunca llama a otro ATC".
- Usar una pieza UI con fixture `{ api }` → error: "El fixture api no abre navegador".
- El spec generado usa la jerarquía correcta: describe con ticket + test con ticket.

## 7. Notas de precisión (no equivocarse)

- ATC se expande **Acceptance Test Case** (nunca "Automated Test Case").
- El decorador exige string literal: `@atc('PROJ-101')` — nada de variables.
- `retries: 0`, `workers: 1` en el config del seed (conservador a propósito).
- La sync automática a TMS está **apagada por defecto** (`AUTO_SYNC=false`);
  el import de JUnit a Xray vía `bun xray import junit` existe pero es manual.
- Un mismo ID puede aparecer en 2 componentes (AuthApi y LoginPage comparten
  `PROJ-101` en el seed): son la variante API y UI del mismo caso de negocio.
- El boilerplate es una PLANTILLA: `PROJ` es placeholder del key real de Jira.

## 8. Contrato de ingeniería para agentes (OBLIGATORIO)

- Svelte 5 con **runes** (`$state`, `$derived`, `$effect`, `$props`). Nada de
  stores legacy ni `export let`.
- **Cero dependencias nuevas.** Animación: CSS + `svelte/transition` +
  `svelte/motion` (clase `Spring`).
- Imports con alias `$lib/...`. TypeScript estricto (pasa `bun run check`).
- Tokens de diseño de `src/app.css` (variables `--surface`, `--a1`…,
  primitivas `.kicker`, `.callout`, `.terminal`, `.tag`, `.blist`, `.btn`,
  `.grad`). No inventes paletas.
- Cada capítulo se renderiza DENTRO de `ChapterShell` (header/footer/scroll ya
  resueltos): tu componente solo entrega el cuerpo.
- Componentes auxiliares de un capítulo → subcarpeta propia:
  `src/lib/scenes/chapters/ch5/`. Datos/contenido del capítulo →
  `src/lib/content/chapters/ch5.ts` (tipado).
- **Archivos compartidos intocables**: `registry.ts`, `glossary.ts`,
  `nav.svelte.ts`, `App.svelte`, `app.css`, `KataMap.svelte` (salvo el agente
  asignado a él), `CodePane.svelte`, `Term.svelte`, `ChapterShell.svelte`.
- Verificación antes de reportar: `bun run check` y `bun run build` en verde.
- `prefers-reduced-motion`: las animaciones decorativas se desactivan.

## 9. Mnemotecnia oficial: la cocina profesional

El explorable se recuerda con UNA imagen: **KATA es una cocina profesional**.
Diccionario canónico de anclajes (aprobado — úsalos tal cual):

| KATA | La cocina |
|---|---|
| L1 TestContext | la despensa (e instalaciones) |
| L2 ApiBase / UiBase | las estaciones (parrilla / horno) |
| L3 componentes | los cocineros especializados |
| ATC | LA RECETA perfeccionada (precondición = mise en place · acción = cocción · verificación = prueba de sabor · `@atc('PROJ-101')` = el nombre del plato en la carta) |
| Steps | mise en place compartido |
| L4 Fixture | el pase: arma tu brigada justa |
| Spec | la comanda (encadena platos) |
| kata-manifest | el recetario maestro |
| reporter / NDJSON | comandas marcadas plato a plato |
| Xray / Jira | el libro de reservas y reseñas |
| CI nocturno | el servicio de cada noche |
| GO / NO-GO | la inspección antes de abrir |

**Regla**: todo contenido futuro (capítulos, Dojo de práctica) usa estos
anclajes; lego queda como textura secundaria del ensamblador.
