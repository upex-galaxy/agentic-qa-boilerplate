import type { ChapterId, ChapterMeta } from '$lib/content/types';
import type { Component } from 'svelte';

/**
 * Registro de capítulos: metadatos (para el mapa y la navegación) +
 * carga perezosa del componente de escena.
 *
 * Las zonas usan el lienzo lógico del mapa (1600×1000):
 * el edificio KATA ocupa el centro; reglas y maquinaria flanquean.
 */
export const chapterMetas: ChapterMeta[] = [
  {
    id: 'problema',
    num: 1,
    title: 'El problema',
    kicker: 'antes de KATA',
    summary: 'Por qué los tests “espagueti” colapsan — y la idea que lo arregla.',
    mnemonic: {
      anchor: 'La cocina caótica',
      icon: '🔥',
      line: 'un restaurante sin recetas: cada plato se improvisa desde cero',
    },
    zone: { x: 80, y: 60, w: 420, h: 260 },
    accent: 'a2',
  },
  {
    id: 'atc',
    num: 2,
    title: 'La pieza: el ATC',
    kicker: 'anatomía',
    summary: 'El Acceptance Test Case: un caso de prueba completo como pieza reutilizable.',
    mnemonic: {
      anchor: 'La receta',
      icon: '🍳',
      line: 'mise en place → cocción → prueba de sabor — con su nombre en la carta',
    },
    zone: { x: 580, y: 358, w: 440, h: 100 },
    accent: 'a1',
  },
  {
    id: 'capas',
    num: 3,
    title: 'Las 4 capas',
    kicker: 'arquitectura',
    summary: 'El edificio KATA: de los cimientos (TestContext) a los tests.',
    mnemonic: {
      anchor: 'La cocina por dentro',
      icon: '🏗️',
      line: 'despensa, estaciones, cocineros y el pase — cada área con UN oficio',
    },
    zone: { x: 540, y: 120, w: 520, h: 550 },
    accent: 'a3',
  },
  {
    id: 'di',
    num: 4,
    title: 'Inyección de dependencias',
    kicker: 'la magia del fixture',
    summary: 'Pides { api } y la caja de herramientas se arma sola — sin abrir el navegador.',
    mnemonic: {
      anchor: 'El pase',
      icon: '🛎️',
      line: 'pides tu brigada y se arma sola, sin encender fogones de más',
    },
    zone: { x: 580, y: 253, w: 440, h: 110 },
    accent: 'good',
  },
  {
    id: 'ensamblador',
    num: 5,
    title: 'El ensamblador',
    kicker: 'manos a la obra',
    summary: 'Arma un test E2E real juntando ATCs como piezas de lego.',
    mnemonic: {
      anchor: 'La comanda',
      icon: '📋',
      line: 'elige platos de la carta y encadénalos en un menú completo',
    },
    zone: { x: 1120, y: 60, w: 400, h: 300 },
    accent: 'a1',
  },
  {
    id: 'simulador',
    num: 6,
    title: 'El simulador',
    kicker: 'la ejecución por dentro',
    summary: 'Corre el test y mira cada resultado viajar hasta Jira/Xray.',
    mnemonic: {
      anchor: 'El servicio',
      icon: '🍽️',
      line: 'cada plato se marca servido o devuelto, comanda por comanda',
    },
    zone: { x: 1120, y: 400, w: 400, h: 300 },
    accent: 'a2',
  },
  {
    id: 'reglas',
    num: 7,
    title: 'Reglas de oro',
    kicker: 'el criterio',
    summary: '¿Es un ATC o no? Juega y aprende las reglas que protegen la arquitectura.',
    mnemonic: {
      anchor: 'El código del chef',
      icon: '📜',
      line: 'las reglas que mantienen la cocina impecable',
    },
    zone: { x: 80, y: 380, w: 420, h: 280 },
    accent: 'a3',
  },
  {
    id: 'maquinaria',
    num: 8,
    title: 'La maquinaria',
    kicker: 'CI y el veredicto',
    summary: 'Suites nocturnas, reportes Allure y la decisión GO / NO-GO.',
    mnemonic: {
      anchor: 'El servicio nocturno',
      icon: '🌙',
      line: 'la cocina corre sola y la inspección decide si abrimos',
    },
    zone: { x: 80, y: 700, w: 1440, h: 240 },
    accent: 'good',
  },
];

export const chapterLoaders: Record<ChapterId, () => Promise<{ default: Component }>> = {
  problema: async () => import('$lib/scenes/chapters/Ch1Problema.svelte'),
  atc: async () => import('$lib/scenes/chapters/Ch2Atc.svelte'),
  capas: async () => import('$lib/scenes/chapters/Ch3Capas.svelte'),
  di: async () => import('$lib/scenes/chapters/Ch4Di.svelte'),
  ensamblador: async () => import('$lib/scenes/chapters/Ch5Ensamblador.svelte'),
  simulador: async () => import('$lib/scenes/chapters/Ch6Simulador.svelte'),
  reglas: async () => import('$lib/scenes/chapters/Ch7Reglas.svelte'),
  maquinaria: async () => import('$lib/scenes/chapters/Ch8Maquinaria.svelte'),
};

export function chapterMeta(id: ChapterId): ChapterMeta {
  const meta = chapterMetas.find(m => m.id === id);
  if (!meta) { throw new Error(`Capítulo desconocido: ${id}`); }
  return meta;
}
