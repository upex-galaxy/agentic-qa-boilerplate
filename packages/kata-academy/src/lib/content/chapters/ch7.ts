/**
 * Capítulo 7 — «Reglas de oro».
 * Datos tipados del juego «¿Es un ATC válido?» (cartas del dossier
 * §5.10 + reglas §3) y la lista de referencia de las 12 reglas.
 */

/** Una carta del juego. */
export interface RuleCard {
  id: number
  /** Título corto de la carta (qué se muestra antes de juzgar). */
  title: string
  /** Snippet para CodePane (si la carta enseña código). */
  snippet?: { title: string, code: string }
  /** Escenario descrito en prosa (si no hay snippet). */
  scenario?: string
  /** ¿Respeta las reglas de oro? */
  valid: boolean
  /** Número de la regla de oro implicada (1-12). */
  ruleNum: number
  /** Enunciado corto de la regla implicada. */
  ruleLabel: string
  /** Por qué, en una línea. */
  why: string
}

export const ruleCards: RuleCard[] = [
  {
    id: 1,
    title: 'Un método que hace un click',
    snippet: {
      title: 'LoginPage.ts',
      code: `@atc('PROJ-201')
async clickLoginButton() {
  await this.page.click('#login');
}`,
    },
    valid: false,
    ruleNum: 1,
    ruleLabel: 'Un ATC es un mini-flujo completo y atómico',
    why: 'Un wrapper de un click no prepara nada, no asevera nada y no verifica nada: no es un caso de prueba.',
  },
  {
    id: 2,
    title: 'Un ATC que encadena otros ATCs',
    snippet: {
      title: 'CheckoutPage.ts',
      code: `@atc('PROJ-305')
async checkoutWithNewUser() {
  await this.signupSuccessfully(userData);
  await this.addToCartSuccessfully(product);
  await this.payWithCardSuccessfully(card);
}`,
    },
    valid: false,
    ruleNum: 1,
    ruleLabel: 'Un ATC NUNCA llama a otro ATC',
    why: 'Las cadenas reutilizables van a un módulo de Steps (sin @atc); un ATC dentro de otro rompe la atomicidad y duplica reportes.',
  },
  {
    id: 3,
    title: 'Tres ATCs para el mismo 401',
    snippet: {
      title: 'AuthApi.ts',
      code: `@atc('T1') async loginWithWrongEmail() { /* espera 401 */ }
@atc('T2') async loginWithWrongPassword() { /* espera 401 */ }
@atc('T3') async loginWithEmptyFields() { /* espera 401 */ }`,
    },
    valid: false,
    ruleNum: 3,
    ruleLabel: 'Partición de equivalencia',
    why: 'Mismos resultados esperados (401) con datos distintos = UN solo ATC parametrizado, no tres.',
  },
  {
    id: 4,
    title: 'Login exitoso, versión compacta',
    snippet: {
      title: 'AuthApi.ts',
      code: `@atc('PROJ-101')
async authenticateSuccessfully(credentials: LoginPayload) {
  const [response, body] = await this.apiPOST(this.config.auth.loginEndpoint, credentials);
  expect(response.status()).toBe(200);
  expect(body.access_token).toBeDefined();
  this.setAuthToken(body.access_token);
  const [meResponse] = await this.getCurrentUser();
  expect(meResponse.status()).toBe(200);
}`,
    },
    valid: true,
    ruleNum: 2,
    ruleLabel: 'Identidad = precondición + acción',
    why: 'Mini-flujo completo con identidad propia: acción + aserciones fijas + verificación final. Así se empaqueta un caso.',
  },
  {
    id: 5,
    title: 'Una espera «por si acaso»',
    snippet: {
      title: 'OrderPage.ts',
      code: `@atc('PROJ-410')
async submitOrderSuccessfully(order: OrderPayload) {
  await this.fillOrderForm(order);
  await this.page.waitForTimeout(5000); // "por si acaso"
  await this.submitButton().click();
}`,
    },
    valid: false,
    ruleNum: 9,
    ruleLabel: 'Sin esperas mágicas ni retries',
    why: 'waitForTimeout esconde condiciones de carrera: se espera por condición observable, nunca por reloj.',
  },
  {
    id: 6,
    title: 'Un archivo central de locators',
    snippet: {
      title: 'tests/locators/login.locators.ts',
      code: `export const LOGIN_LOCATORS = {
  email: '#email',
  password: '#password',
  submit: 'button[type="submit"]',
};`,
    },
    valid: false,
    ruleNum: 5,
    ruleLabel: 'Locators inline dentro del ATC',
    why: 'La dirección del botón vive DENTRO de la pieza; los archivos locators/*.ts están prohibidos.',
  },
  {
    id: 7,
    title: 'Un GET de solo lectura con @atc',
    snippet: {
      title: 'AuthApi.ts',
      code: `@atc('PROJ-520')
async getCurrentUser(): Promise<[APIResponse, UserInfoResponse]> {
  const [response, body] = await this.apiGET(this.config.auth.meEndpoint);
  return [response, body];
}`,
    },
    valid: false,
    ruleNum: 7,
    ruleLabel: 'Helper vs ATC',
    why: 'Solo lectura = helper con @step: sin ID de ticket y sin reporte al TMS. El @atc se reserva para acciones que cambian estado.',
  },
  {
    id: 8,
    title: 'Login inválido parametrizado',
    snippet: {
      title: 'AuthApi.ts',
      code: `@atc('PROJ-102')
async loginWithInvalidCredentials(payload: LoginPayload) {
  const [response, body] = await this.apiPOST(this.config.auth.loginEndpoint, payload);
  expect(response.status()).toBe(401);
  expect(body.error).toBeDefined();
}`,
    },
    valid: true,
    ruleNum: 3,
    ruleLabel: 'Partición de equivalencia',
    why: 'UN caso parametrizado cubre toda la partición: cualquier credencial inválida produce el mismo 401.',
  },
  {
    id: 9,
    title: 'Cinco parámetros posicionales',
    snippet: {
      title: 'OrderApi.ts',
      code: `@atc('PROJ-610')
async createOrderSuccessfully(
  sku: string, qty: number, coupon: string,
  address: string, giftWrap: boolean,
) { /* ... */ }`,
    },
    valid: false,
    ruleNum: 4,
    ruleLabel: 'Máximo 2 parámetros posicionales',
    why: 'Con 3+ datos se pasa un objeto con nombres: createOrderSuccessfully({ sku, qty, coupon, address, giftWrap }).',
  },
  {
    id: 10,
    title: 'Un spec que encadena dos ATCs',
    snippet: {
      title: 'tests/e2e/checkout/processCheckout.test.ts',
      code: `test('UPEX-210: checkout after login', async ({ api }) => {
  const [, tokenData] = await api.auth.authenticateSuccessfully(credentials);
  const [, order] = await api.orders.createOrderSuccessfully(payload);

  // aserción de FLUJO: el pedido pertenece al usuario logueado
  expect(order.ownerId).toBe(tokenData.userId);
});`,
    },
    valid: true,
    ruleNum: 6,
    ruleLabel: 'Aserciones fijas en el ATC; de flujo en el spec',
    why: 'Así se orquesta: el spec elige piezas, las encadena y solo añade aserciones que cruzan piezas.',
  },
];

/** Las 12 reglas de oro (dossier §3), una línea cada una. */
export const goldenRules: string[] = [
  'Un ATC es un mini-flujo completo y atómico — NUNCA llama a otro ATC; cadenas reutilizables → Steps.',
  'Identidad de un caso = precondición + acción; sus resultados esperados son aserciones del MISMO caso.',
  'Partición de equivalencia: mismos resultados con datos distintos → UN solo ATC parametrizado.',
  'Máximo 2 parámetros posicionales; con 3+ se pasa un objeto con nombres.',
  'Locators inline dentro del ATC (a propiedad privada solo si se usan en 2+ ATCs); prohibidos los archivos locators/*.ts.',
  'Aserciones fijas dentro del ATC; aserciones de flujo en el spec.',
  'GET de solo lectura = helper (@step); acción que cambia estado = ATC (@atc).',
  'Fail-fast en público (error descriptivo); silencio en privado (las utilidades devuelven null).',
  'Sin esperas mágicas (waitForTimeout prohibido) y sin retries (retries: 0).',
  'Cada test genera sus propios datos con faker — nada de estado compartido.',
  'Imports con alias (@api/, @ui/, @TestFixture) — nunca ../../.. relativos.',
  'kata-manifest.json = registro civil: consúltalo antes de crear; el pre-commit bloquea si está desactualizado.',
];
