import type { CodeSample } from '$lib/content/types';

/**
 * Capítulo 6 — El simulador.
 *
 * Datos de la mini-suite que corre el simulador. Todo el shape del NDJSON,
 * la agregación conservadora y el payload a Xray vienen del dossier
 * (CONTENT-SOURCE.md §4) — extraídos del boilerplate real.
 */

export type SpecId = 'A' | 'B';
export type RunStatus = 'PASS' | 'FAIL';

export interface SimSpec {
  id: SpecId
  path: string
  kind: 'integration' | 'e2e'
  fixture: string
}

export interface SimExecution {
  /** Orden global de ejecución en la corrida (0-based). */
  order: number
  specId: SpecId
  /** Título del bloque test() que contiene esta llamada. */
  testTitle: string
  testId: string
  methodName: string
  className: string
  duration: number
  /** Duración cuando la ejecución falla (timeout). */
  failDuration: number
  executedAt: string
  failError: string
  /** true = el interruptor de fallo rompe ESTA ejecución. */
  breakable?: boolean
  /** Nota pedagógica que se muestra junto a la fila. */
  note?: string
}

export const SPECS: SimSpec[] = [
  {
    id: 'A',
    path: 'tests/integration/auth/user-session.test.ts',
    kind: 'integration',
    fixture: '{ api }',
  },
  {
    id: 'B',
    path: 'tests/e2e/auth/loginJourney.test.ts',
    kind: 'e2e',
    fixture: '{ ui }',
  },
];

export const EXECUTIONS: SimExecution[] = [
  {
    order: 0,
    specId: 'A',
    testTitle: 'UPEX-100: should be able to re-authenticate',
    testId: 'PROJ-101',
    methodName: 'authenticateSuccessfully',
    className: 'AuthApi',
    duration: 1835,
    failDuration: 1835,
    executedAt: '2026-03-27T19:34:58.470Z',
    failError: '',
  },
  {
    order: 1,
    specId: 'A',
    testTitle: 'UPEX-100: should create a resource with a fresh session',
    testId: 'PROJ-103',
    methodName: 'createResourceSuccessfully',
    className: 'ExampleApi',
    duration: 612,
    failDuration: 612,
    executedAt: '2026-03-27T19:35:00.291Z',
    failError: '',
  },
  {
    order: 2,
    specId: 'B',
    testTitle: 'UPEX-104: should land on dashboard after login',
    testId: 'PROJ-101',
    methodName: 'loginSuccessfully',
    className: 'LoginPage',
    duration: 2201,
    failDuration: 10004,
    executedAt: '2026-03-27T19:35:04.118Z',
    failError: 'Timed out 10000ms waiting for page.waitForURL(\'**/dashboard\')',
    breakable: true,
    note: '2ª ejecución de PROJ-101 — pieza reutilizada como precondición',
  },
  {
    order: 3,
    specId: 'B',
    testTitle: 'UPEX-104: should reject invalid credentials',
    testId: 'PROJ-102',
    methodName: 'loginWithInvalidCredentials',
    className: 'LoginPage',
    duration: 468,
    failDuration: 468,
    executedAt: '2026-03-27T19:35:07.902Z',
    failError: '',
  },
];

/** Línea NDJSON con el shape REAL que escribe el decorador @atc (dossier §4). */
export function ndjsonLine(e: SimExecution, failed: boolean): string {
  const status: RunStatus = failed ? 'FAIL' : 'PASS';
  const error = failed && e.failError !== '' ? JSON.stringify(e.failError) : 'null';
  const duration = failed ? e.failDuration : e.duration;
  return (
    `{"testId":"${e.testId}","methodName":"${e.methodName}",`
    + `"className":"${e.className}","status":"${status}","error":${error},`
    + `"executedAt":"${e.executedAt}","duration":${duration},"softFail":false}`
  );
}

/** Línea de terminal al estilo del runner. */
export function terminalLine(e: SimExecution, failed: boolean): string {
  const icon = failed ? '❌' : '✅';
  const status: RunStatus = failed ? 'FAIL' : 'PASS';
  const duration = failed ? e.failDuration : e.duration;
  return `${icon} [${e.testId}] ${e.methodName} - ${status} (${duration}ms)`;
}

export interface AggregatedResult {
  testId: string
  /** Métodos que reportaron este testId (puede haber variante API y UI). */
  methods: string[]
  /** Estado de cada ejecución, en orden. */
  statuses: RunStatus[]
  /** Estado agregado CONSERVADOR: una sola FAIL → FAILED. */
  status: 'PASSED' | 'FAILED'
}

/** Agrupa por testId como hace KataReporter.onEnd(): N ejecuciones → 1 entrada. */
export function aggregate(runs: { exec: SimExecution, failed: boolean }[]): AggregatedResult[] {
  const byId = new Map<string, AggregatedResult>();
  for (const { exec, failed } of runs) {
    const status: RunStatus = failed ? 'FAIL' : 'PASS';
    const entry = byId.get(exec.testId);
    if (entry) {
      entry.statuses.push(status);
      if (!entry.methods.includes(exec.methodName)) { entry.methods.push(exec.methodName); }
      if (status === 'FAIL') { entry.status = 'FAILED'; }
    }
    else {
      byId.set(exec.testId, {
        testId: exec.testId,
        methods: [exec.methodName],
        statuses: [status],
        status: status === 'FAIL' ? 'FAILED' : 'PASSED',
      });
    }
  }
  return [...byId.values()];
}

/** El ATC real del seed (dossier §5.3) — quien dispara toda la cadena. */
export const ATC_SAMPLE: CodeSample = {
  title: 'tests/components/api/AuthApi.ts',
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
}`,
};
