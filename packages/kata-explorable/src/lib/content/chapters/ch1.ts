import type { CodeSample } from '$lib/content/types';

/**
 * Capítulo 1 — "El problema".
 * Contenido tipado del capítulo: el spec espagueti (ANTI-ejemplo,
 * el único código inventado que permite CONTENT-SOURCE §5.1),
 * sus puntos de dolor clicables, las tarjetas de costo y las
 * mini-tarjetas de specs que reutilizan la pieza de lego.
 */

export interface Hotspot {
  id: string
  /** Texto de la pastilla clicable. */
  label: string
  /** Líneas (1-based) que se resaltan en el CodePane al activarla. */
  lines: number[]
  /** Por qué duele — se muestra al activar la pastilla. */
  explain: string
}

export interface CostCard {
  stat: string
  title: string
  body: string
}

export interface MiniSpec {
  file: string
  suite: string
  call: string
}

/** ANTI-ejemplo: así se ve un spec sin arquitectura (inventado a propósito). */
export const spaghettiSpec: CodeSample = {
  title: 'checkout.spec.ts — el mundo sin arquitectura',
  sourcePath: '(anti-ejemplo: NO existe en el boilerplate, y ese es el punto)',
  code: `import { test, expect } from '@playwright/test';

test('test 1', async ({ page }) => {
  await page.goto('https://app.staging.example.com/login');
  await page.locator('input[name="email"]').fill('qa.user@example.com');
  await page.locator('input[name="password"]').fill('Sup3rS3cret!2024');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000); // "por si acaso el login tarda"
  await page.locator('#nav-shop').click();
  await page.locator('.product-card >> nth=0').click();
  await page.locator('#add-to-cart').click();
  await page.waitForTimeout(3000);
  await page.locator('#cart-icon').click();
  await page.locator('button[type="submit"]').click();
  expect(await page.locator('.cart-total').innerText()).toContain('$');
});

test('test 2', async ({ page }) => {
  // el mismo login, copiado y pegado otra vez
  await page.goto('https://app.staging.example.com/login');
  await page.locator('input[name="email"]').fill('qa.user@example.com');
  await page.locator('input[name="password"]').fill('Sup3rS3cret!2024');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  await page.locator('#cart-icon').click();
  await page.locator('#promo-input').fill('DESCUENTO10');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000); // otra espera a ciegas
  const total = await page.locator('.cart-total').innerText();
  expect(total).not.toBe('');
});

// TODO: test 3 del checkout... ¿copiamos el login una tercera vez?
`,
};

export const hotspots: Hotspot[] = [
  {
    id: 'selector-repetido',
    label: 'selector repetido 4 veces',
    lines: [7, 14, 23, 27],
    explain:
      'El mismo botón aparece escrito a mano en 4 lugares. El día que el equipo de frontend lo renombre, hay que cazarlo archivo por archivo.',
  },
  {
    id: 'espera-magica',
    label: 'espera mágica de 3s',
    lines: [8, 12, 24, 28],
    explain:
      'waitForTimeout(3000) no espera a que algo pase: espera 3 segundos a ciegas. Si el servidor tarda 3.1s, el test falla. Si tarda 0.2s, pierdes 2.8s. Siempre pierdes.',
  },
  {
    id: 'password-hardcodeada',
    label: 'contraseña hardcodeada',
    lines: [6, 22],
    explain:
      'Una credencial real pegada en el código, duplicada, y camino a quedar en el historial de git para siempre.',
  },
  {
    id: 'sin-identidad',
    label: '¿qué caso de prueba es este? nadie sabe',
    lines: [3, 18],
    explain:
      '\'test 1\' y \'test 2\' no apuntan a ningún ticket ni a ningún caso de prueba. Cuando fallen, nadie sabrá QUÉ requisito se rompió.',
  },
];

export const costCards: CostCard[] = [
  {
    stat: '×N archivos',
    title: 'El mantenimiento explota',
    body: 'Cada selector, cada credencial y cada flujo vive copiado en N specs. Un cambio pequeño en la app = editar N archivos y rezar.',
  },
  {
    stat: '0 piezas',
    title: 'Nada se reutiliza',
    body: 'El login se reescribe en cada test. No hay piezas: hay fotocopias. Y las fotocopias envejecen a ritmos distintos.',
  },
  {
    stat: '¿? tickets',
    title: 'Cero trazabilidad',
    body: 'Ningún test declara qué caso de prueba cubre. El reporte dice "test 2 falló" — y nadie puede responder qué significa eso para el negocio.',
  },
];

/** Mini-specs que reutilizan la MISMA pieza (la idea KATA). */
export const miniSpecs: MiniSpec[] = [
  {
    file: 'smoke.test.ts',
    suite: 'suite smoke · @critical',
    call: 'await ui.login.loginSuccessfully(user)',
  },
  {
    file: 'processCheckout.test.ts',
    suite: 'e2e · flujo de compra',
    call: 'await ui.login.loginSuccessfully(user)',
  },
  {
    file: 'regression.test.ts',
    suite: 'suite regression',
    call: 'await ui.login.loginSuccessfully(user)',
  },
];
