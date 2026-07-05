import type { GlossaryEntry } from '$lib/content/types';

/**
 * Glosario contextual — la audiencia sabe lo básico de programación y
 * muy poco de OOP, así que cada término técnico se explica la primera
 * vez con lenguaje llano y una imagen mental.
 *
 * Los capítulos referencian términos con <Term t="fixture">fixture</Term>.
 */
export const glossary: GlossaryEntry[] = [
  {
    term: 'clase',
    short:
      'Un molde para crear objetos: define qué datos guarda y qué acciones sabe hacer. Como la receta de una galleta — de una receta salen muchas galletas.',
  },
  {
    term: 'herencia',
    aliases: ['extends', 'hereda'],
    short:
      'Cuando una clase se construye encima de otra y recibe gratis todo lo que la clase base ya sabe hacer. “LoginPage extiende UiBase” = LoginPage nace sabiendo todo lo de UiBase.',
  },
  {
    term: 'módulo',
    aliases: ['modulo'],
    short:
      'Un archivo de código que exporta cosas (clases, funciones) para que otros archivos las usen. Piensa en cajones etiquetados: cada cajón guarda una herramienta.',
  },
  {
    term: 'import',
    aliases: ['importar', 'imports'],
    short:
      'La instrucción para traer a este archivo algo que vive en otro. “import { LoginPage }” = “tráeme la herramienta LoginPage de su cajón”.',
  },
  {
    term: 'método',
    aliases: ['metodo', 'métodos'],
    short:
      'Una acción que una clase sabe hacer. Si la clase es el molde, el método es un botón: lo llamas y ejecuta esa acción.',
  },
  {
    term: 'inyección de dependencias',
    aliases: ['dependency injection', 'di', 'inyeccion de dependencias'],
    short:
      'En vez de que tu código construya sus herramientas, alguien se las entrega ya listas. Tú pides “{ api }” y el framework arma y te pasa la caja de herramientas completa.',
  },
  {
    term: 'fixture',
    aliases: ['fixtures'],
    short:
      'La caja de herramientas que Playwright arma y entrega a cada test. Pides { api }, { ui } o { test } y recibes los componentes ya conectados y listos para usar.',
  },
  {
    term: 'atc',
    aliases: ['atcs', 'acceptance test case'],
    short:
      'Acceptance Test Case: UN caso de prueba completo (preparación + acción + verificación) empaquetado como método reutilizable. La pieza de lego de KATA.',
  },
  {
    term: 'spec',
    aliases: ['spec file', 'archivo de prueba', 'specs'],
    short:
      'El archivo *.test.ts que Playwright ejecuta. En KATA casi no tiene lógica: solo orquesta ATCs, como quien arma un lego siguiendo el manual.',
  },
  {
    term: 'aserción',
    aliases: ['asercion', 'assert', 'expect', 'aserciones'],
    short:
      'Una comprobación que hace fallar el test si no se cumple. “expect(status).toBe(200)” = “si el status no es 200, este test falla aquí”.',
  },
  {
    term: 'decorador',
    aliases: ['decorator', '@atc', 'decoradores'],
    short:
      'Una etiqueta que se pone encima de un método (@atc(\'PROJ-101\')) y le agrega superpoderes sin tocar su código: aquí, reportar su resultado con su ID de ticket.',
  },
  {
    term: 'endpoint',
    aliases: ['endpoints'],
    short:
      'Una “puerta” del servidor a la que se le puede pedir o enviar algo. POST /auth/login es la puerta para iniciar sesión.',
  },
  {
    term: 'api',
    short:
      'La forma de hablar con una aplicación sin usar su pantalla: se mandan peticiones (GET, POST…) y responde con datos. Los tests de API prueban el motor sin abrir el navegador.',
  },
  {
    term: 'e2e',
    aliases: ['end to end', 'end-to-end'],
    short:
      'Prueba “de punta a punta”: recorre un flujo completo como lo haría una persona real — navegador incluido.',
  },
  {
    term: 'playwright',
    short:
      'La herramienta de Microsoft que automatiza el navegador y las peticiones HTTP. KATA está construida encima de Playwright.',
  },
  {
    term: 'typescript',
    short:
      'JavaScript con red de seguridad: le declaras los tipos de datos y te avisa de errores antes de ejecutar nada.',
  },
  {
    term: 'ndjson',
    short:
      'Un archivo donde cada línea es un JSON independiente. Perfecto para “apuntar resultados” uno por uno mientras los tests corren en procesos separados.',
  },
  {
    term: 'ci',
    aliases: ['integración continua', 'integracion continua', 'ci/cd'],
    short:
      'Integración continua: un robot (GitHub Actions) que ejecuta las suites de prueba solo, por horario o en cada cambio, y publica los resultados.',
  },
  {
    term: 'tms',
    short:
      'Test Management System: donde viven los casos de prueba como tickets (aquí, Jira con Xray). Cada ATC apunta a su ticket con el ID del decorador.',
  },
  {
    term: 'locator',
    aliases: ['locators', 'selector'],
    short:
      'La “dirección” de un elemento en la pantalla para que Playwright lo encuentre: un botón, un campo de texto. En KATA se escriben dentro del propio ATC.',
  },
  {
    term: 'jira',
    short:
      'El gestor de tickets del equipo: historias, bugs y casos de prueba viven ahí con un ID único (UPEX-123).',
  },
  {
    term: 'xray',
    short:
      'La extensión de Jira para gestión de pruebas: guarda los casos de prueba y recibe los resultados de cada ejecución.',
  },
  {
    term: 'allure',
    short:
      'El generador de reportes visuales: convierte los resultados crudos de los tests en un informe navegable con pasos, capturas y tiempos.',
  },
  {
    term: 'suite',
    aliases: ['suites'],
    short:
      'Un conjunto de tests que se ejecutan juntos con un propósito: smoke (lo vital), regression (todo), sanity (lo recién tocado).',
  },
  {
    term: 'faker',
    short:
      'Una librería que inventa datos realistas (nombres, correos, teléfonos) para que cada test use datos frescos y no choque con otros.',
  },
  {
    term: 'steps',
    aliases: ['steps module', 'módulo de steps'],
    short:
      'Un módulo que encadena varios ATCs como preparación reutilizable (ej. “deja un usuario logueado y con onboarding completo”). No es un ATC: no se reporta al TMS.',
  },
  {
    term: 'helper',
    aliases: ['@step', 'step', 'helpers'],
    short:
      'Un método de apoyo de solo lectura (consultar, no cambiar): no es un caso de prueba, no lleva @atc ni ID de ticket. Se marca con @step solo para verse en el reporte.',
  },
  {
    term: 'lazy',
    aliases: ['perezoso', 'lazy loading'],
    short:
      'Construir algo solo cuando de verdad se pide. Los fixtures son lazy: si tu test pide { api }, el navegador ni siquiera se enciende.',
  },
  {
    term: 'payload',
    short: 'Los datos que se envían en una petición: el “paquete” del envío. En un login, el email y la contraseña.',
  },
  {
    term: 'token',
    aliases: ['access token'],
    short:
      'La credencial temporal que el servidor entrega al iniciar sesión; las siguientes peticiones la presentan como pase de acceso.',
  },
];

const index = new Map<string, GlossaryEntry>();
for (const entry of glossary) {
  index.set(entry.term.toLowerCase(), entry);
  for (const alias of entry.aliases ?? []) {
    index.set(alias.toLowerCase(), entry);
  }
}

export function lookupTerm(term: string): GlossaryEntry | undefined {
  return index.get(term.toLowerCase());
}
