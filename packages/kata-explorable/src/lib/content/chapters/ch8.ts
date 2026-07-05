/**
 * Capítulo 8 — La maquinaria.
 *
 * Los 4 workflows de GitHub Actions y las reglas del veredicto vienen del
 * dossier (CONTENT-SOURCE.md §4), extraídos de `.github/workflows/` y de la
 * doctrina de `/regression-testing`.
 */

export interface WorkflowCard {
  id: string
  name: string
  icon: string
  trigger: string
  runs: string
  detail: string[]
}

export const WORKFLOWS: WorkflowCard[] = [
  {
    id: 'build',
    name: 'build',
    icon: '🔀',
    trigger: 'PR a main',
    runs: 'types + lint + --list (sin ejecutar tests)',
    detail: [
      'Es el portero: ningún cambio entra a main sin compilar y pasar el linter.',
      'El flag --list solo enumera los tests: valida que carguen, sin gastarse en correrlos.',
    ],
  },
  {
    id: 'regression',
    name: 'regression',
    icon: '🌙',
    trigger: 'cron diario 00:00 + manual',
    runs: 'integration → e2e → merge Allure → GitHub Pages',
    detail: [
      'La suite completa, cada medianoche: primero integración (API), después E2E (navegador).',
      'Los resultados de ambos jobs se fusionan en UN solo reporte Allure.',
      'El reporte se publica en GitHub Pages: todo el equipo lo abre con un link.',
    ],
  },
  {
    id: 'smoke',
    name: 'smoke',
    icon: '🔥',
    trigger: 'cron diario 02:00 + manual',
    runs: 'solo tests @critical',
    detail: [
      'Lo vital y nada más: los flujos que no pueden romperse (login, pagos, checkout).',
      'Corre dos horas después de regression: una segunda lectura, rápida, del estado del sistema.',
    ],
  },
  {
    id: 'sanity',
    name: 'sanity',
    icon: '👆',
    trigger: 'manual',
    runs: 'tests filtrados por grep / archivo',
    detail: [
      'Para verificar lo recién tocado: tú eliges qué correr con un filtro.',
      'Ideal después de un hotfix — respuesta en minutos sin esperar la suite completa.',
    ],
  },
];

/** Pasos del círculo de trazabilidad (cierre del explorable). */
export const FULL_CIRCLE: { icon: string, label: string }[] = [
  { icon: '🎫', label: 'ticket en Jira' },
  { icon: '🧩', label: 'ATC en código — @atc(\'PROJ-101\')' },
  { icon: '🌙', label: 'ejecución nocturna en CI' },
  { icon: '📊', label: 'resultado en Xray' },
  { icon: '🚦', label: 'veredicto de release' },
];
