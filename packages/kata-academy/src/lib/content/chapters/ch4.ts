import type { CodeSample } from '$lib/content/types';

/**
 * Capítulo 4 — Inyección de dependencias.
 * Datos del panel de interruptores: qué se construye (y en qué orden)
 * cuando el test pide { api }, { ui } o { test }.
 *
 * Todo sale del código real de `tests/components/TestFixture.ts`.
 */

export type FixtureModeId = 'api' | 'ui' | 'test';

export interface CascadeStep {
  id: string
  /** Texto principal del nodo. */
  label: string
  /** Detalle corto bajo el label. */
  sub: string
  /** Etiqueta de capa (spec, L1…L4, navegador). */
  layer: string
  /** Este paso enciende el navegador. */
  browser?: boolean
}

export interface FixtureMode {
  id: FixtureModeId
  /** Lo que el test escribe entre paréntesis. */
  request: string
  /** ¿Este fixture llega a encender el navegador? */
  browser: boolean
  /** Frase que acompaña al diagrama cuando el armado termina. */
  outcome: string
  steps: CascadeStep[]
  /** Líneas a resaltar en el código de registro (1-based). */
  highlight: number[]
}

export const MODES: FixtureMode[] = [
  {
    id: 'api',
    request: '{ api }',
    browser: false,
    outcome:
      'ApiFixture entregada: api.auth y api.example listos — y el navegador jamás despertó.',
    highlight: [3, 12, 13, 14],
    steps: [
      {
        id: 'req',
        layer: 'spec',
        label: 'el test pide { api }',
        sub: 'Playwright lee la firma del test y sale a armar la caja',
      },
      {
        id: 'ctx',
        layer: 'L1',
        label: 'TestContext',
        sub: 'cimientos: entorno, config, datos falsos (faker)',
      },
      {
        id: 'base',
        layer: 'L2',
        label: 'ApiBase',
        sub: 'helpers HTTP tipados: apiGET, apiPOST y sus tuplas',
      },
      {
        id: 'domain',
        layer: 'L3',
        label: 'AuthApi · ExampleApi',
        sub: 'los componentes de dominio — aquí viven los ATCs de API',
      },
      {
        id: 'fixture',
        layer: 'L4',
        label: 'ApiFixture ensamblada',
        sub: 'la caja completa aterriza en tu test como “api”',
      },
    ],
  },
  {
    id: 'ui',
    request: '{ ui }',
    browser: true,
    outcome: 'UiFixture entregada: ui.login y ui.example listos, con el navegador encendido.',
    highlight: [4, 9, 10, 11],
    steps: [
      {
        id: 'req',
        layer: 'spec',
        label: 'el test pide { ui }',
        sub: 'la firma menciona ui → esta caja sí necesita pantalla',
      },
      {
        id: 'browser',
        layer: 'navegador',
        label: 'el navegador se enciende',
        sub: 'Playwright levanta page antes de construir la caja',
        browser: true,
      },
      {
        id: 'ctx',
        layer: 'L1',
        label: 'TestContext',
        sub: 'los mismos cimientos de siempre: entorno, config, faker',
      },
      {
        id: 'base',
        layer: 'L2',
        label: 'UiBase',
        sub: 'helpers de navegador: esperas, intercepción de red',
      },
      {
        id: 'domain',
        layer: 'L3',
        label: 'LoginPage · ExamplePage',
        sub: 'los componentes de página — aquí viven los ATCs de UI',
      },
      {
        id: 'fixture',
        layer: 'L4',
        label: 'UiFixture ensamblada',
        sub: 'la caja aterriza en tu test como “ui”',
      },
    ],
  },
  {
    id: 'test',
    request: '{ test }',
    browser: true,
    outcome:
      'TestFixture entregada: fixture.api + fixture.ui, todo compartiendo la misma sesión.',
    highlight: [2, 6, 7, 8],
    steps: [
      {
        id: 'req',
        layer: 'spec',
        label: 'el test pide { test }',
        sub: 'el flujo es híbrido: pantalla Y peticiones HTTP',
      },
      {
        id: 'browser',
        layer: 'navegador',
        label: 'el navegador se enciende',
        sub: 'hay parte UI, así que page también se levanta',
        browser: true,
      },
      {
        id: 'ctx',
        layer: 'L1',
        label: 'TestContext',
        sub: 'un solo contexto compartido para las dos mitades',
      },
      {
        id: 'base',
        layer: 'L2',
        label: 'ApiBase + UiBase',
        sub: 'helpers HTTP y helpers de navegador, en paralelo',
      },
      {
        id: 'domain',
        layer: 'L3',
        label: 'AuthApi · ExampleApi + LoginPage · ExamplePage',
        sub: 'todos los componentes de dominio, API y UI',
      },
      {
        id: 'fixture',
        layer: 'L4',
        label: 'TestFixture ensamblada',
        sub: 'las dos cajas dentro de una: fixture.api y fixture.ui',
      },
    ],
  },
];

export function modeById(id: FixtureModeId): FixtureMode {
  const mode = MODES.find(m => m.id === id);
  if (!mode) { throw new Error(`Modo de fixture desconocido: ${id}`); }
  return mode;
}

/** Registro real de fixtures en Playwright (§5.8 del dossier). */
export const registrationSample: CodeSample = {
  title: 'tests/components/TestFixture.ts — registro de fixtures',
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
});`,
};

/** El override que reparte el token a todos los hijos (§5.8). */
export const overrideSample: CodeSample = {
  title: 'tests/components/ApiFixture.ts — override setAuthToken',
  sourcePath: 'tests/components/ApiFixture.ts',
  code: `override setAuthToken(token: string) {
  super.setAuthToken(token);
  this.auth.setAuthToken(token);
  this.example.setAuthToken(token);
}`,
};

export interface CostRow {
  request: string
  browser: string
  browserOn: boolean
  cost: string
  use: string
}

export const costRows: CostRow[] = [
  {
    request: '{ api }',
    browser: 'nunca se abre',
    browserOn: false,
    cost: 'el más rápido',
    use: 'tests de integración / API',
  },
  {
    request: '{ ui }',
    browser: 'se abre',
    browserOn: true,
    cost: 'medio',
    use: 'flujos de pantalla',
  },
  {
    request: '{ test }',
    browser: 'se abre',
    browserOn: true,
    cost: 'completo',
    use: 'híbridos E2E (UI + API)',
  },
];

export interface TokenStage {
  /** Nodo que recibe el token en esta etapa. */
  node: 'root' | 'auth' | 'example'
  caption: string
  /** Líneas del overrideSample a resaltar. */
  highlight: number[]
}

export const tokenStages: TokenStage[] = [
  {
    node: 'root',
    caption: 'authenticateSuccessfully() guarda el token en ApiFixture…',
    highlight: [1, 2],
  },
  {
    node: 'auth',
    caption: '…el override lo reparte a auth…',
    highlight: [3],
  },
  {
    node: 'example',
    caption: '…y a example. Un solo login: todas las herramientas comparten la misma sesión.',
    highlight: [4],
  },
];
