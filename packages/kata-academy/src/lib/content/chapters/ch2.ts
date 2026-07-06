/**
 * Capítulo 2 — «La pieza: el ATC».
 * Datos tipados: muestra real del ATC (dossier §5.3), las 5 partes del
 * despiece, el contraste helper, la muestra UI (§5.4) y el constructor
 * de nombres. Código extraído del boilerplate real — no editar a mano
 * sin contrastar con CONTENT-SOURCE.md.
 */

/** Una de las 5 partes del despiece de la pieza de lego. */
export interface AtcPart {
  /** Numeral visual ① ② ③… */
  badge: string
  name: string
  /** Líneas (1-based) del CodePane que ilumina esta parte. */
  lines: number[]
  /** Explicación de 1-2 frases, lenguaje llano. */
  explain: string
}

/** ATC real de API — tests/components/api/AuthApi.ts (dossier §5.3). */
export const atcSample = {
  title: 'tests/components/api/AuthApi.ts',
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
}`,
};

export const atcParts: AtcPart[] = [
  {
    badge: '①',
    name: 'Identidad',
    lines: [1],
    explain:
      '@atc(\'PROJ-101\') es el carnet de la pieza: el ID de su ticket en el TMS. Cada vez que el método corre, su resultado se reporta con ese ID.',
  },
  {
    badge: '②',
    name: 'Precondición',
    lines: [2, 3, 4],
    explain:
      'El estado inicial no se fabrica dentro: llega por parámetros. Aquí, las credenciales definen QUÉ caso estamos probando.',
  },
  {
    badge: '③',
    name: 'Acción',
    lines: [5, 6, 7, 8, 9],
    explain:
      'El acto central del caso: un POST al endpoint de login con las credenciales recibidas. Una pieza = una acción de negocio.',
  },
  {
    badge: '④',
    name: 'Aserciones fijas',
    lines: [11, 12, 13, 14, 15],
    explain:
      'Los resultados que SIEMPRE deben cumplirse para esta pareja precondición + acción. Viven dentro de la pieza, no en el spec.',
  },
  {
    badge: '⑤',
    name: 'Verificación',
    lines: [20, 21, 22, 23],
    explain:
      'La prueba de fuego: un GET /auth/me confirma que la sesión quedó activa de verdad. No basta con que el POST devolviera 200.',
  },
];

/** El helper de solo lectura que contrasta con el ATC (dossier §5.3). */
export const helperSample = {
  title: 'tests/components/api/AuthApi.ts',
  code: `@step
async getCurrentUser(): Promise<[APIResponse, UserInfoResponse]> {
  const [response, body] = await this.apiGET<UserInfoResponse>(this.config.auth.meEndpoint);
  return [response, body];
}`,
};

/** ATC de UI con locators inline (dossier §5.4). */
export const uiSample = {
  title: 'tests/components/ui/ExamplePage.ts',
  code: `export class ExamplePage extends UiBase {
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
}`,
};

/** Opción de un segmento del constructor de nombres. */
export interface NameOption {
  /** Texto del botón. */
  label: string
  /** Fragmento que aporta al nombre compuesto ('' = implícito). */
  value: string
}

/** Convención de nombres: {verbo}{Recurso}{Escenario}. */
export const nameSegments: { key: string, title: string, options: NameOption[] }[] = [
  {
    key: 'verbo',
    title: '{verbo}',
    options: [
      { label: 'create', value: 'create' },
      { label: 'login', value: 'login' },
      { label: 'get', value: 'get' },
    ],
  },
  {
    key: 'recurso',
    title: '{Recurso}',
    options: [
      { label: 'Order', value: 'Order' },
      { label: 'User', value: 'User' },
      { label: '— (implícito)', value: '' },
    ],
  },
  {
    key: 'escenario',
    title: '{Escenario}',
    options: [
      { label: 'Successfully', value: 'Successfully' },
      { label: 'WithInvalidCredentials', value: 'WithInvalidCredentials' },
      { label: 'WithNonExistentId', value: 'WithNonExistentId' },
    ],
  },
];

/** Anti-nombres: los que NO dicen qué caso prueban. */
export const badNames: { name: string, reason: string }[] = [
  { name: 'clickLoginButton', reason: 'eso es un click, no un caso de prueba' },
  { name: 'checkTest', reason: 'ni verbo de negocio, ni recurso, ni escenario' },
  { name: 'testLogin2', reason: '¿éxito?, ¿error?, ¿qué prueba? — sin escenario no se sabe' },
];
