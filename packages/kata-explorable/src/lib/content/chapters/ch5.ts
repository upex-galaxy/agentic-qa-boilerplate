/**
 * Capítulo 5 — El ensamblador.
 * Catálogo de piezas (ATCs reales del boilerplate, §6 del dossier) y el
 * generador del spec: dado el stack de piezas, produce el archivo de
 * prueba completo tal como se escribiría en KATA.
 */

export type FixtureKind = 'api' | 'ui' | 'test';

export interface PieceDef {
  id: string
  /** Nombre del método (para el ghost y los toasts). */
  method: string
  /** Firma mostrada en la tarjeta: método(args). */
  signature: string
  /** Chip de componente: api.auth, ui.login… */
  component: string
  kind: 'api' | 'ui'
  /** true = helper @step (no es ATC, no suma cobertura al TMS). */
  helper?: boolean
  /** Qué devuelve (para la tarjeta). */
  returns: string
  /** Una frase: qué hace la pieza. */
  blurb: string
  /** Datos que necesita; se declaran una sola vez por variable. */
  data?: {
    name: string
    needsConfig?: boolean
    lines: (root: string) => string[]
  }
  /** Línea(s) de la llamada dentro del test. */
  call: (root: string) => string[]
}

export const PIECES: PieceDef[] = [
  {
    id: 'auth-ok',
    method: 'authenticateSuccessfully',
    signature: 'authenticateSuccessfully(credentials)',
    component: 'api.auth',
    kind: 'api',
    returns: '[response, tokenData, payload]',
    blurb: 'Hace login por API, valida el 200 y guarda el token en la caja.',
    data: {
      name: 'credentials',
      needsConfig: true,
      lines: () => [
        'const credentials = {',
        '  email: config.testUser.email,',
        '  password: config.testUser.password,',
        '};',
      ],
    },
    call: root => [
      `const [response, tokenData] = await ${root}.auth.authenticateSuccessfully(credentials);`,
    ],
  },
  {
    id: 'auth-fail',
    method: 'loginWithInvalidCredentials',
    signature: 'loginWithInvalidCredentials(payload)',
    component: 'api.auth',
    kind: 'api',
    returns: '[response, errorBody, payload]',
    blurb: 'Intenta login con datos malos y valida el rechazo (4xx).',
    data: {
      name: 'invalidCredentials',
      lines: () => ['const invalidCredentials = { email: \'invalid-email\', password: \'123\' };'],
    },
    call: root => [
      `const [errorResponse, errorBody] = await ${root}.auth.loginWithInvalidCredentials(invalidCredentials);`,
    ],
  },
  {
    id: 'ui-login',
    method: 'loginSuccessfully',
    signature: 'loginSuccessfully(credentials)',
    component: 'ui.login',
    kind: 'ui',
    returns: 'void — termina en /dashboard',
    blurb: 'Hace login desde la pantalla y verifica que aterriza en /dashboard.',
    data: {
      name: 'credentials',
      needsConfig: true,
      lines: () => [
        'const credentials = {',
        '  email: config.testUser.email,',
        '  password: config.testUser.password,',
        '};',
      ],
    },
    call: root => [`await ${root}.login.loginSuccessfully(credentials);`],
  },
  {
    id: 'api-create',
    method: 'createResourceSuccessfully',
    signature: 'createResourceSuccessfully(payload)',
    component: 'api.example',
    kind: 'api',
    returns: '[response, body, payload]',
    blurb: 'Crea un recurso por API y valida el 201.',
    data: {
      name: 'payload',
      lines: root => [`const payload = ${root}.data.createCredentials();`],
    },
    call: root => [
      `const [creationResponse, resource] = await ${root}.example.createResourceSuccessfully(payload);`,
    ],
  },
  {
    id: 'ui-form',
    method: 'submitFormWithValidData',
    signature: 'submitFormWithValidData(data)',
    component: 'ui.example',
    kind: 'ui',
    returns: 'void',
    blurb: 'Envía el formulario en pantalla con datos válidos.',
    data: {
      name: 'formData',
      lines: root => [`const formData = ${root}.data.createCredentials();`],
    },
    call: root => [`await ${root}.example.submitFormWithValidData(formData);`],
  },
  {
    id: 'helper-me',
    method: 'getCurrentUser',
    signature: 'getCurrentUser()',
    component: 'api.auth',
    kind: 'api',
    helper: true,
    returns: '[response, userInfo]',
    blurb: 'Lee el usuario actual — solo consulta, no cambia nada.',
    call: root => [
      '// @step helper: read-only, adds no TMS coverage',
      `const [meResponse, userInfo] = await ${root}.auth.getCurrentUser();`,
    ],
  },
];

export function pieceById(id: string): PieceDef {
  const piece = PIECES.find(p => p.id === id);
  if (!piece) { throw new Error(`Pieza desconocida: ${id}`); }
  return piece;
}

export interface GeneratedSpec {
  code: string
  fixture: FixtureKind
  /** Lo que aparece entre paréntesis en el test. */
  fixtureParam: string
  /** Ruta sugerida del archivo (cambia con el fixture). */
  fileTitle: string
}

const IND = '    ';

function flowAssertion(stack: PieceDef[]): string[] {
  const has = (id: string) => stack.some(p => p.id === id);
  const header = '// ASSERT — flow assertion owned by the spec';
  if (has('auth-ok')) { return [header, 'expect(tokenData.access_token).toBeDefined();']; }
  if (has('api-create')) { return [header, 'expect(resource.user.id).toBeDefined();']; }
  if (has('helper-me')) { return [header, 'expect(userInfo.user).toBeDefined();']; }
  if (has('auth-fail')) { return [header, 'expect(errorResponse.ok()).toBe(false);']; }
  return ['// Fixed assertions already ran inside each UI ATC'];
}

export function generateSpec(stack: PieceDef[]): GeneratedSpec {
  const hasApi = stack.some(p => p.kind === 'api');
  const hasUi = stack.some(p => p.kind === 'ui');
  const fixture: FixtureKind = hasApi && hasUi ? 'test' : hasUi ? 'ui' : 'api';
  const fixtureParam
    = fixture === 'test' ? '{ test: fixture }' : fixture === 'ui' ? '{ ui }' : '{ api }';
  const rootFor = (p: PieceDef): string => {
    if (p.kind === 'api') { return fixture === 'test' ? 'fixture.api' : 'api'; }
    return fixture === 'test' ? 'fixture.ui' : 'ui';
  };

  const needsConfig = stack.some(p => p.data?.needsConfig);

  const lines: string[] = [];
  lines.push('import { expect, test } from \'@TestFixture\';');
  if (needsConfig) { lines.push('import { config } from \'@variables\';'); }
  lines.push('');
  lines.push('test.describe(\'UPEX-100: Assembled user flow\', () => {');
  lines.push(`  test('UPEX-100: should complete the assembled flow', async (${fixtureParam}) => {`);

  if (stack.length === 0) {
    lines.push(`${IND}// (vacío) añade piezas del catálogo — el spec se escribe solo`);
  }
  else {
    const declared = new Set<string>();
    const dataLines: string[] = [];
    for (const p of stack) {
      if (p.data && !declared.has(p.data.name)) {
        declared.add(p.data.name);
        dataLines.push(...p.data.lines(rootFor(p)).map(l => IND + l));
      }
    }
    if (dataLines.length > 0) {
      lines.push(`${IND}// ARRANGE — test data`);
      lines.push(...dataLines);
      lines.push('');
    }
    lines.push(`${IND}// ACT — chain the ATC pieces, one after another`);
    for (const p of stack) {
      lines.push(...p.call(rootFor(p)).map(l => IND + l));
    }
    lines.push('');
    lines.push(...flowAssertion(stack).map(l => IND + l));
  }

  lines.push('  });');
  lines.push('});');

  const fileTitle
    = fixture === 'api'
      ? 'tests/integration/assembledUserFlow.test.ts — generado en vivo'
      : 'tests/e2e/assembledUserFlow.test.ts — generado en vivo';

  return { code: lines.join('\n'), fixture, fixtureParam, fileTitle };
}

/** Por qué el destructuring cambió — el momento didáctico del fixture. */
export const fixtureExplanations: Record<FixtureKind, string> = {
  api: 'Todas tus piezas son API → el spec pide { api }. Nadie menciona la pantalla, así que Playwright ni siquiera abre el navegador: este flujo corre en milisegundos.',
  ui: 'Todas tus piezas son UI → basta { ui }: navegador encendido y componentes de página listos.',
  test:
    'Mezclaste piezas API y UI → el spec cambió solo a { test: fixture }: la caja completa. '
    + 'Navegador + peticiones HTTP compartiendo la misma sesión (fixture.api y fixture.ui).',
};

/** Guion del armado guiado (“🧭 Ármalo por mí”). */
export interface GuideStep {
  pieceId: string
  note: string
}

export const guideScript: GuideStep[] = [
  {
    pieceId: 'auth-ok',
    note: '1 · Primero autentica: consigue el token y lo deja guardado en la caja.',
  },
  {
    pieceId: 'api-create',
    note: '2 · Luego crea el recurso: reutiliza la MISMA sesión — nadie vuelve a loguearse.',
  },
  {
    pieceId: 'helper-me',
    note: '3 · Cierra verificando con el helper @step: lectura pura, sin sumar cobertura.',
  },
];
