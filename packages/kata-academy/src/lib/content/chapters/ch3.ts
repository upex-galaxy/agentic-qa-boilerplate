import type { CodeSample } from '$lib/content/types';

/**
 * Capítulo 3 — "Las 4 capas".
 * El edificio KATA piso por piso. Roles y reglas vienen de
 * CONTENT-SOURCE §2/§3; el código es REAL (§5.2, §5.3, §5.5–§5.9).
 */

export type FloorId = 'tests' | 'fixtures' | 'dominio' | 'steps' | 'bases' | 'contexto';

/** Nodo de la cadena de herencia que ilumina cada piso (si aplica). */
export type ChainNode = 'AuthApi' | 'ApiBase' | 'TestContext';

export interface Floor {
  id: FloorId
  /** Etiqueta de nivel: "specs", "L4", "L3.5", "L3", "L2", "L1". */
  level: string
  name: string
  /** Habitantes del piso, para pintarlos en la fachada. */
  tenants: string
  /** El rol del piso en una frase (dossier §2). */
  role: string
  /** 1-2 reglas clave. */
  rules: string[]
  samples: CodeSample[]
  chainNode?: ChainNode
}

export const floors: Floor[] = [
  {
    id: 'tests',
    level: 'specs',
    name: 'Tests',
    tenants: 'tests/e2e/*.test.ts · tests/integration/*.test.ts',
    role: 'Los specs ORQUESTAN: destructuran el fixture, llaman ATCs y añaden aserciones de flujo. Casi no tienen lógica propia.',
    rules: [
      'Jerarquía: carpeta = módulo → archivo = feature → describe = ticket → test = escenario.',
      'Las aserciones fijas viven dentro del ATC; el spec solo añade las de flujo.',
    ],
    samples: [
      {
        title: 'tests/integration/auth/user-session.test.ts',
        sourcePath: 'tests/integration/auth/user-session.test.ts',
        code: `import { expect, test } from '@TestFixture';
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
`,
      },
    ],
  },
  {
    id: 'fixtures',
    level: 'L4',
    name: 'Fixtures',
    tenants: 'TestFixture · ApiFixture · UiFixture',
    role: 'Inyección de dependencias: entregan la caja de herramientas ya armada. El test pide { api }, { ui } o { test } y Playwright construye SOLO lo necesario.',
    rules: [
      'Construcción lazy: { api } jamás abre navegador.',
      'El fixture conecta los componentes entre sí (ej. propaga el token a todos).',
    ],
    samples: [
      {
        title: 'tests/components/ApiFixture.ts',
        sourcePath: 'tests/components/ApiFixture.ts',
        code: `export class ApiFixture extends ApiBase {
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
`,
      },
      {
        title: 'registro en Playwright (lazy — { api } no abre navegador)',
        sourcePath: 'tests/components/TestFixture.ts',
        code: `export const test = base.extend<{
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
`,
      },
    ],
  },
  {
    id: 'dominio',
    level: 'L3',
    name: 'Dominio',
    tenants: 'AuthApi · LoginPage · CheckoutPage',
    role: 'La lógica de negocio de CADA recurso o página. AQUÍ viven los ATCs, decorados con @atc(\'TICKET-ID\').',
    rules: [
      'Acción que cambia estado = ATC (@atc); helper de solo lectura = @step (sin ID, no se reporta al TMS).',
      'Locators inline dentro del ATC; se extraen solo si se usan en 2+ ATCs.',
    ],
    chainNode: 'AuthApi',
    samples: [
      {
        title: 'tests/components/api/AuthApi.ts — un ATC completo',
        sourcePath: 'tests/components/api/AuthApi.ts',
        code: `@atc('PROJ-101')
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
`,
      },
    ],
  },
  {
    id: 'steps',
    level: 'L3.5',
    name: 'Steps (entrepiso)',
    tenants: 'AuthSteps…',
    role: 'Cadenas de ATCs para preparación reutilizable (cuando 3+ ATCs se repiten en 3+ tests). No lleva @atc: no se reporta al TMS.',
    rules: [
      'Un ATC NUNCA llama a otro ATC — las cadenas viven aquí, en Steps.',
      'Sin @atc: los Steps preparan escenarios, no declaran casos de prueba.',
    ],
    samples: [
      {
        title: 'AuthSteps — cadena de ATCs SIN @atc (doctrina)',
        sourcePath: '.agents/skills/test-automation/references/kata-architecture.md',
        code: `export class AuthSteps {
  constructor(private ui: UiFixture, private api: ApiFixture) {}

  async setupAuthenticatedUser(credentials: Credentials) {
    await this.ui.auth.loginWithValidCredentials(credentials);
    await this.ui.profile.completeOnboardingSuccessfully();
    await this.ui.settings.enableFeatureFlagSuccessfully();
  }
}
`,
      },
    ],
  },
  {
    id: 'bases',
    level: 'L2',
    name: 'Bases',
    tenants: 'ApiBase (HTTP) · UiBase (Playwright)',
    role: 'Helpers técnicos: ApiBase ofrece métodos HTTP tipados que devuelven tuplas; UiBase, helpers de navegador (intercepción de red, esperas por condición).',
    rules: [
      'Contrato de tuplas: GET/DELETE → [respuesta, cuerpo]; POST/PUT/PATCH → [respuesta, cuerpo, payloadEnviado].',
      'Fail-fast en público: si pides page sin fixture UI, UiBase lanza un error descriptivo.',
    ],
    chainNode: 'ApiBase',
    samples: [
      {
        title: 'tests/components/ApiBase.ts — apiPOST (fragmento)',
        sourcePath: 'tests/components/ApiBase.ts',
        code: `async apiPOST<TBody, TPayload>(
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
`,
      },
      {
        title: 'tests/components/UiBase.ts — el guardián fail-fast',
        sourcePath: 'tests/components/UiBase.ts',
        code: `get page(): Page {
  if (!this._page) {
    throw new Error(
      'Page is not available. UiBase requires a page instance. '
      + 'Make sure you are using a UI fixture (ui or test), not api.',
    );
  }
  return this._page;
}
`,
      },
    ],
  },
  {
    id: 'contexto',
    level: 'L1',
    name: 'TestContext',
    tenants: 'config · faker · entorno',
    role: 'Los cimientos agnósticos: qué entorno, qué credenciales, qué datos falsos — sin nada de Playwright ni HTTP.',
    rules: [
      'Agnóstico total: si mencionara Playwright o HTTP, ya no sería el cimiento.',
      'Cada test genera sus propios datos (faker) — nada de estado compartido.',
    ],
    chainNode: 'TestContext',
    samples: [
      {
        title: 'tests/components/TestContext.ts — la clase completa',
        sourcePath: 'tests/components/TestContext.ts',
        code: `export class TestContext {
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
`,
      },
    ],
  },
];

/** Cadena de herencia que pinta el mini-diagrama persistente. */
export const inheritanceChain: ChainNode[] = ['AuthApi', 'ApiBase', 'TestContext'];

export function floorById(id: FloorId): Floor {
  const floor = floors.find(f => f.id === id);
  if (!floor) { throw new Error(`Piso desconocido: ${id}`); }
  return floor;
}
