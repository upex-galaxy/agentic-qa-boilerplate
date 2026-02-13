PANORAMA DEL CÓDIGO DE PRUEBA

1. Arquitectura de Capas (KATA Framework)

┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: FIXTURES (Entry Points) │
├─────────────────────────────────────────────────────────────────────────────┤
│ TestFixture.ts │
│ ├── test: TestFixture (page + request → UI + API) │
│ ├── ui: UiFixture (page only) │
│ └── api: ApiFixture (request only, NO browser) │
│ │
│ ApiFixture.ts UiFixture.ts │
│ ├── auth: AuthApi ├── login: LoginPage │
│ └── example: ExampleApi └── example: ExamplePage │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: DOMAIN COMPONENTS (ATCs) │
├─────────────────────────────────────────────────────────────────────────────┤
│ AuthApi.ts LoginPage.ts │
│ ├── @atc authenticateSuccessfully() ├── @atc loginSuccessfully() │
│ ├── @atc loginWithInvalidCreds() ├── @atc loginWithInvalidCredentials() │
│ ├── @atc getCurrentUserOK() └── goto() [llamar ANTES del ATC] │
│ └── @atc getCurrentUserUnauth() │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: BASE COMPONENTS (Helpers) │
├─────────────────────────────────────────────────────────────────────────────┤
│ ApiBase.ts UiBase.ts │
│ ├── apiGET/POST/PUT/PATCH/DELETE ├── page (getter) │
│ ├── setAuthToken/clearAuthToken ├── buildUrl() │
│ ├── buildHeaders() ├── interceptResponse() │
│ └── apiEndpoint() └── waitForApiResponse() │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: TEST CONTEXT (Foundation) │
├─────────────────────────────────────────────────────────────────────────────┤
│ TestContext.ts │
│ ├── \_page: Page (protected) │
│ ├── \_request: APIRequestContext (protected) │
│ ├── env: Environment │
│ ├── config: Config object │
│ └── data: DataFactory (static) │
└─────────────────────────────────────────────────────────────────────────────┘

---

2. Flujo de Inyección de Dependencias

2.1 Test → Fixture → Component

// Test file usa Playwright fixtures
test('example', async ({ test }) => { // ← Playwright inyecta `test`
await test.ui.login.loginSuccessfully(creds); // test → ui → login → método
await test.api.auth.getCurrentUserSuccessfully(); // test → api → auth → método
});

2.2 Cadena de Creación

Playwright creates:
page: Page
request: APIRequestContext
│
▼
TestFixture.ts (Layer 4):
test: async ({ page, request }, use) => {
const fixture = new TestFixture(page, request); // ← Crea fixture
await use(fixture);
}
│
▼
TestFixture (constructor):
super({ page, request, environment }); // ← Pasa a TestContext
this.api = new ApiFixture(options); // ← Crea ApiFixture con mismas options
this.ui = new UiFixture(options); // ← Crea UiFixture con mismas options
│
▼
ApiFixture (constructor):
super(options); // ← Hereda de ApiBase
this.auth = new AuthApi(options); // ← Crea AuthApi con mismas options
this.example = new ExampleApi(options);
│
▼
AuthApi (constructor):
super(options); // ← Hereda de ApiBase → TestContext

2.3 Diagrama Visual

┌──────────────────────────────────────────────────────────────────┐
│ PLAYWRIGHT TEST RUNNER │
│ Provides: { page, request } │
└──────────────────────────────────────────────────────────────────┘
│
▼
┌──────────────────────────────────────────────────────────────────┐
│ test fixture │
│ TestFixture { page, request } │
│ ├── api: ApiFixture { request } │
│ │ ├── auth: AuthApi { request } │
│ │ └── example: ExampleApi { request } │
│ └── ui: UiFixture { page, request } │
│ ├── login: LoginPage { page } │
│ └── example: ExamplePage { page } │
└──────────────────────────────────────────────────────────────────┘

---

3. Configuración de Playwright Projects

3.1 Estructura de Projects

┌─────────────────────────────────────────────────────────────────┐
│ global-setup (teardown: 'global-teardown') │
│ └─ tests/setup/global.setup.ts │
│ • Crea directorios │
│ • Valida environment │
└────────────────────────┬────────────────────────────────────────┘
│
┌────────────┴────────────┐
▼ ▼
┌───────────────────┐ ┌───────────────────┐
│ ui-setup │ │ api-setup │
│ (depends: global)│ │ (depends: global)│
│ ui-auth.setup.ts │ │ api-auth.setup.ts│
│ • Login via UI │ │ • Login via API │
│ • Guarda token │ │ • Guarda token │
│ • storageState │ │ • api-state.json │
└─────────┬─────────┘ └─────────┬─────────┘
│ │
▼ ▼
┌───────────────────┐ ┌───────────────────┐
│ e2e │ │ integration │
│ (depends: ui-setup)│ │(depends: api-setup)│
│ tests/e2e/**/\*.ts │ │tests/integration/**│
│ storageState used │ │ │
└───────────────────┘ └───────────────────┘
│ │
└────────────┬──────────────┘
▼
┌─────────────────────────────────────────────────────────────────┐
│ global-teardown │
│ └─ tests/teardown/global.teardown.ts │
│ • Genera ATC report │
│ • Sync to TMS (si AUTO_SYNC=true) │
└─────────────────────────────────────────────────────────────────┘

3.2 Archivos de Autenticación Generados

.auth/
├── user.json ← storageState (cookies, localStorage) para E2E
└── api-state.json ← Token JWT para API tests

---

4. Token Propagation (RESUELTO ✅)

4.1 Flujo Actual (FUNCIONANDO)

Setup Files (ui-auth.setup.ts / api-auth.setup.ts): 1. Usan fixtures KATA (importan test de @TestFixture) 2. Llaman ATCs: ui.login.loginSuccessfully() / api.auth.authenticateSuccessfully() 3. Guardan token en .auth/api-state.json ✅ 4. Para UI: También guardan storageState en .auth/user.json ✅

Tests E2E/Integration: 1. TestFixture.constructor() llama loadTokenFromFile() ✅ 2. Lee .auth/api-state.json y extrae token ✅ 3. Llama api.setAuthToken(token) → propaga a todos los componentes ✅ 4. Todos los apiGET/POST/PUT/DELETE incluyen Authorization header ✅

4.2 Métodos de Token Propagation

// Automático: Al crear el fixture
const fixture = new TestFixture(page, request);
// → loadTokenFromFile() se llama en constructor

// Manual: En runtime (para cambiar usuario, re-login, etc.)
test.setAuthToken(nuevoToken); // Actualiza token
test.clearAuthToken(); // Limpia para probar sin auth

4.3 Código Clave

// TestFixture.ts
private loadTokenFromFile(): void {
const apiStatePath = config.auth.apiStatePath;
if (existsSync(apiStatePath)) {
const apiState: ApiState = JSON.parse(readFileSync(apiStatePath, 'utf-8'));
if (apiState.token) {
this.api.setAuthToken(apiState.token);
}
}
}

---

5. Análisis de ATCs y Assertions

5.1 ATCs Implementados

| Component | Test ID       | Method                      | Assertions                                        |
| --------- | ------------- | --------------------------- | ------------------------------------------------- |
| AuthApi   | CUR-AUTH-001  | authenticateSuccessfully    | status=200, token defined, type=Bearer, expires>0 |
| AuthApi   | CUR-AUTH-002  | loginWithInvalidCredentials | status=400, ok=false, error defined               |
| AuthApi   | CUR-AUTH-003  | getCurrentUserSuccessfully  | status=200, userId defined, email defined         |
| AuthApi   | CUR-AUTH-004  | getCurrentUserUnauthorized  | status=401, ok=false                              |
| LoginPage | CUR-LOGIN-001 | loginSuccessfully           | URL not contains /login (requiere goto() previo)  |
| LoginPage | CUR-LOGIN-002 | loginWithInvalidCredentials | error visible, URL contains /login                |

5.2 Patrón de Assertions (Fixed vs Flexible)

Los ATCs tienen assertions fijas (hardcoded en el método):

// AuthApi.ts - getCurrentUserSuccessfully
@atc('CUR-AUTH-003')
async getCurrentUserSuccessfully(): Promise<[APIResponse, UserInfoResponse]> {
const [response, body] = await this.apiGET<UserInfoResponse>('/auth/me');

    // Fixed assertions - SIEMPRE se ejecutan
    expect(response.status()).toBe(200);      // ← No configurable
    expect(body.userId).toBeDefined();        // ← No configurable
    expect(body.email).toBeDefined();         // ← No configurable

    return [response, body];

}

Problema potencial: Si un test quiere verificar algo diferente (ej: que NO exista userId), no puede usar este ATC.

5.3 Retorno de ATCs

| Tipo     | Patrón de Retorno              | Ejemplo                        |
| -------- | ------------------------------ | ------------------------------ |
| API GET  | [APIResponse, TBody]           | [response, userInfo]           |
| API POST | [APIResponse, TBody, TPayload] | [response, token, credentials] |
| UI       | void (assertions inside)       | N/A                            |

---

6. Decoradores y Tracking

6.1 @atc Decorator

@atc('CUR-AUTH-001', { severity: 'critical', softFail: false })
async loginSuccessfully(credentials) { ... }

Funcionalidad:

- Wraps método en allure.step()
- Captura duración y resultado
- Console logs: ✅ [CUR-AUTH-001] loginSuccessfully - PASS (234ms)
- Almacena en atcResults Map para report final
- Soporta softFail: true para continuar en error

  6.2 Report Generation

// En global.teardown.ts
await generateAtcReport('reports/atc_results.json');
// Output:
{
"generatedAt": "2026-02-08T...",
"summary": { "total": 5, "passed": 4, "failed": 1, "skipped": 0 },
"results": { "CUR-AUTH-001": [...], ... }
}

---

7. Data Factory

// Acceso desde componentes
this.data.createUser() // TestUser con email, password, name
this.data.createCredentials() // Solo email + password
this.data.createHotel() // Hotel con name, orgId, invoiceCap
this.data.createBooking() // Booking con confirmation#, stayValue, etc.

Principio: Datos siempre dinámicos via Faker, nunca estáticos.

---

8. Archivos de Soporte

| Archivo                   | Propósito                                      |
| ------------------------- | ---------------------------------------------- |
| config/variables.ts       | SINGLE SOURCE para env vars, URLs, credentials |
| tests/utils/decorators.ts | @atc decorator y result tracking               |
| tests/utils/allure.ts     | Helpers para attachments a Allure              |
| tests/KataReporter.ts     | Custom reporter con output colorido            |
| tests/data/DataFactory.ts | Generación de datos con Faker                  |
| tests/data/types.ts       | Interfaces para datos de prueba                |

---

9. Estado de Problemas Detectados

| #   | Problema                           | Severidad | Estado       | Notas                                    |
| --- | ---------------------------------- | --------- | ------------ | ---------------------------------------- |
| 1   | Token no propagado en E2E          | CRÍTICO   | ✅ RESUELTO  | TestFixture.loadTokenFromFile()          |
| 2   | Assertions fijas en ATCs           | MEDIO     | ✅ ACLARADO  | Es intencional: ATCs = casos específicos |
| 3   | Flows solo de ejemplo              | BAJO      | ⏳ PENDIENTE | ExampleFlows.ts es template              |
| 4   | No hay tests de Integration reales | BAJO      | ✅ RESUELTO  | tests/integration/auth/user-session.test |

---

10. Cambios Implementados (2026-02-08)

    10.1 Token Propagation

- TestFixture.loadTokenFromFile(): Carga automática del token desde .auth/api-state.json
- TestFixture.setAuthToken()/clearAuthToken(): Métodos públicos para runtime
- ApiFixture también carga token en su fixture de Playwright

  10.2 Setup Files Refactorizados

- Ahora usan fixtures KATA (importan test de @TestFixture)
- ui-auth.setup.ts: Usa ui.login.goto() + ui.login.loginSuccessfully()
- api-auth.setup.ts: Usa api.auth.authenticateSuccessfully()

  10.3 LoginPage Refactorizado

- goto() sacado de los ATCs (llamar antes del ATC)
- Helper privado fillAndSubmitLoginForm() (combina fill + submit)
- ATCs más atómicos: solo acción + assertions

  10.4 AuthApi Renombrado

- loginSuccessfully() → authenticateSuccessfully() (diferenciar de UI)

  10.5 Estructura Renombrada

- tests/components/preconditions/ → tests/components/flows/
- Alias @preconditions/_ → @flows/_

  10.6 Tipos Compartidos

- TokenResponse y ApiState en tests/data/types.ts
- AuthApi re-exporta TokenResponse para consumidores

---

11. Próximos Pasos Recomendados

1. Crear más flows reales: BookingFlows, ReconciliationFlows
1. Crear tests E2E reales: Dashboard, Bookings, etc.
1. Agregar más componentes API: BookingsApi, InvoicesApi
1. Agregar más componentes UI: DashboardPage, BookingsPage
