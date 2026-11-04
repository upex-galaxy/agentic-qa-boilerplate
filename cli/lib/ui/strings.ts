/**
 * @fileoverview The ONE string table of the page (owner answer Q1): Spanish and
 * English, picked from `LANG`, Spanish when unsure.
 *
 * The page receives the table of the run's language inlined into its HTML, so its
 * copy and the server's labels come from the same place. Event content (phase
 * titles, step titles, questions) is written by the core in the run's language;
 * this table covers the page chrome, the answer labels and the glossary.
 *
 * Glossary entries may use `<b>` and `<code>`; the page renders them through its
 * limited-markup filter, never as raw HTML.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import type { Lang } from './events.ts';

/** `es` when LC_ALL / LC_MESSAGES / LANG starts with `es`, `en` when it starts with `en`, else `es`. */
export function pickLang(env: Record<string, string | undefined>): Lang {
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'LANG'] as const) {
    const v = (env[key] ?? '').trim().toLowerCase();
    if (!v || v === 'c' || v === 'posix' || v.startsWith('c.')) { continue; }
    if (v.startsWith('en')) { return 'en'; }
    if (v.startsWith('es')) { return 'es'; }
    return 'es';
  }
  return 'es';
}

export interface GlossaryEntry { t: string, d: string }

const es = {
  docTitle: 'Agentic Setup',
  phasesHeading: 'Fases',
  phasesMeter: '{done} de {total} fases',
  stateRun: 'En curso',
  stateAsk: 'Te toca responder',
  stateFail: 'Necesita tu ayuda',
  stateReadonly: 'Solo lectura',
  stateDone: 'Terminado',
  statePending: 'Terminado con pendientes',
  stateFailed: 'Falló',
  stateAborted: 'Cancelado',
  stateOffline: 'Sin conexión',
  termBar: 'terminal · lo mismo que se imprime en tu consola',
  termHide: 'Ocultar',
  termShow: 'Mostrar',
  footLive: 'Página local: solo se ve en esta máquina.',
  footSaved: 'Copia guardada de una corrida terminada. Nada se ejecuta desde aquí.',
  footReplay: 'Reproducción de una corrida grabada. Nada se ejecuta desde aquí.',
  themeSystem: 'Sistema',
  themeLight: 'Claro',
  themeDark: 'Oscuro',
  eyebrowPhase: 'Fase {n}',
  eyebrowPre: 'Antes de empezar',
  eyebrowEnd: 'Cierre',
  question: 'Pregunta',
  answerLabel: 'Respuesta:',
  decisionLabel: 'Decisión:',
  answeredElsewhere: 'Ya se respondió en otra pestaña o en la terminal.',
  answerFailed: 'No se pudo enviar la respuesta. Revisa que la terminal siga abierta.',
  sending: 'Enviando…',
  continue: 'Continuar',
  enterToContinue: 'para continuar',
  yes: 'Sí',
  no: 'No',
  none: 'ninguna',
  all: 'Todos',
  noneBtn: 'Ninguno',
  empty: '(vacío)',
  required: 'Este dato es obligatorio.',
  pickOne: 'Elige al menos una opción.',
  showChanges: 'Ver cambios',
  hideChanges: 'Ocultar',
  filesSelected: '{n} de {total} archivos seleccionados',
  filesApplied: '{n} de {total} archivos se actualizan',
  deletionsSome: '{n} se borran, {keep} se conservan',
  deletionsNone: 'Se conservan los {total} (puedes borrarlos en otra pasada)',
  deletionsHint: 'Marca solo los que quieras borrar. Lo que no marques se queda tal cual.',
  deletedUpstream: 'Ya no existe arriba',
  yourVersion: 'Tu versión',
  newVersion: 'Versión nueva del boilerplate',
  secretPlaceholder: 'Pega el valor aquí',
  secretShow: 'Mostrar',
  secretHide: 'Ocultar',
  secretMissing: 'Pega el valor o elige otra opción.',
  secretNote: 'Este valor viaja directo de esta página al instalador y se escribe en <code>.env</code>. Nunca aparece en la terminal, en el registro ni en el resumen guardado.',
  secretSaved: '{var} guardado',
  whatIsThis: 'Qué es esto',
  failKicker: 'Este paso no pudo terminar',
  failWhat: 'Qué pasó',
  failHow: 'Cómo seguir',
  copy: 'Copiar',
  copied: 'Copiado',
  copyManual: 'Selecciona y copia',
  restarting: '<b>Reiniciando el actualizador…</b> La página se reconecta sola: no cierres esta pestaña.',
  reconnected: '<b>Reconectado.</b> El actualizador nuevo sigue desde aquí, sin repetir lo que ya hiciste.',
  offline: '<b>Se perdió la conexión con la terminal.</b> Reintentando…',
  readonlyKicker: 'Vista de solo lectura',
  readonlyTitle: 'Modo automático: nadie tiene que responder nada',
  readonlyBody: 'Lo que necesita una decisión tuya queda [[deferred|pendiente para después]] en el resumen.',
  background: 'En segundo plano',
  preflightKicker: 'Chequeo previo',
  verdictClear: '<b>Todo listo.</b> Nada bloquea.',
  verdictWarn: '<b>Nada bloquea.</b> Hay avisos: puedes seguir y arreglarlos después.',
  verdictBlock: '<b>Algo bloquea.</b> Arréglalo y vuelve a correr el comando.',
  warnPill: 'Aviso',
  blockPill: 'Bloquea',
  skipped: 'saltado',
  surfacesArea: 'Área',
  surfacesState: 'Estado',
  findingsHeading: 'Hallazgos de paridad',
  findingsFile: 'Archivo',
  findingsNow: 'Ahora',
  findingsEvidence: 'Qué difiere',
  findingsSuggested: 'Sugerido',
  blocking: 'bloquea',
  promptToggle: 'Ver el prompt de paridad completo',
  next: 'Siguiente',
  savedAt: '[[summary|Resumen guardado]] en {path}',
  endLine: 'Puedes cerrar esta pestaña; la terminal ya terminó.',
  restartTerm: '↻ reinicio: el actualizador nuevo sigue',
  termAsk: '(respóndelo en el navegador)',
  recommended: 'Recomendado',
} as const;

export type StringKey = keyof typeof es;
export type StringTable = Record<StringKey, string>;

const en: StringTable = {
  docTitle: 'Agentic Setup',
  phasesHeading: 'Phases',
  phasesMeter: '{done} of {total} phases',
  stateRun: 'Running',
  stateAsk: 'Your turn',
  stateFail: 'Needs your help',
  stateReadonly: 'Read only',
  stateDone: 'Done',
  statePending: 'Done, with pending items',
  stateFailed: 'Failed',
  stateAborted: 'Cancelled',
  stateOffline: 'Offline',
  termBar: 'terminal · the same output your console prints',
  termHide: 'Hide',
  termShow: 'Show',
  footLive: 'Local page: visible on this machine only.',
  footSaved: 'Saved copy of a finished run. Nothing runs from here.',
  footReplay: 'Replay of a recorded run. Nothing runs from here.',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  eyebrowPhase: 'Phase {n}',
  eyebrowPre: 'Before we start',
  eyebrowEnd: 'Wrap-up',
  question: 'Question',
  answerLabel: 'Answer:',
  decisionLabel: 'Decision:',
  answeredElsewhere: 'Already answered in another tab or in the terminal.',
  answerFailed: 'Could not send the answer. Check that the terminal is still open.',
  sending: 'Sending…',
  continue: 'Continue',
  enterToContinue: 'to continue',
  yes: 'Yes',
  no: 'No',
  none: 'none',
  all: 'All',
  noneBtn: 'None',
  empty: '(empty)',
  required: 'This value is required.',
  pickOne: 'Pick at least one option.',
  showChanges: 'Show changes',
  hideChanges: 'Hide',
  filesSelected: '{n} of {total} files selected',
  filesApplied: '{n} of {total} files will be updated',
  deletionsSome: '{n} deleted, {keep} kept',
  deletionsNone: 'All {total} kept (you can delete them in another pass)',
  deletionsHint: 'Tick only the ones you want deleted. Anything left unticked stays as it is.',
  deletedUpstream: 'Gone upstream',
  yourVersion: 'Your version',
  newVersion: 'New boilerplate version',
  secretPlaceholder: 'Paste the value here',
  secretShow: 'Show',
  secretHide: 'Hide',
  secretMissing: 'Paste the value or pick another option.',
  secretNote: 'This value goes straight from this page to the installer and is written to <code>.env</code>. It never shows up in the terminal, the log or the saved summary.',
  secretSaved: '{var} saved',
  whatIsThis: 'What is this',
  failKicker: 'This step could not finish',
  failWhat: 'What happened',
  failHow: 'How to continue',
  copy: 'Copy',
  copied: 'Copied',
  copyManual: 'Select and copy',
  restarting: '<b>Restarting the updater…</b> This page reconnects by itself: keep the tab open.',
  reconnected: '<b>Reconnected.</b> The new updater carries on from here without repeating what you did.',
  offline: '<b>Lost the connection to the terminal.</b> Retrying…',
  readonlyKicker: 'Read-only view',
  readonlyTitle: 'Automatic mode: nobody has to answer anything',
  readonlyBody: 'Anything that needs your decision is left [[deferred|pending for later]] in the summary.',
  background: 'In the background',
  preflightKicker: 'Preflight',
  verdictClear: '<b>All set.</b> Nothing blocks.',
  verdictWarn: '<b>Nothing blocks.</b> There are warnings: you can go on and fix them later.',
  verdictBlock: '<b>Something blocks.</b> Fix it and run the command again.',
  warnPill: 'Warning',
  blockPill: 'Blocks',
  skipped: 'skipped',
  surfacesArea: 'Area',
  surfacesState: 'State',
  findingsHeading: 'Parity findings',
  findingsFile: 'File',
  findingsNow: 'Now',
  findingsEvidence: 'What differs',
  findingsSuggested: 'Suggested',
  blocking: 'blocks',
  promptToggle: 'Show the full parity prompt',
  next: 'Next',
  savedAt: '[[summary|Summary saved]] at {path}',
  endLine: 'You can close this tab; the terminal is done.',
  restartTerm: '↻ restart: the new updater carries on',
  termAsk: '(answer it in the browser)',
  recommended: 'Recommended',
};

const glossaryEs: Record<string, GlossaryEntry> = {
  preflight: { t: 'Chequeo previo', d: 'Antes de tocar nada, el instalador revisa que tengas las herramientas, accesos y espacio que cada paso va a necesitar. Así no te quedas a mitad de camino por algo que se podía saber al principio.' },
  bloquea: { t: 'Bloquea vs. aviso', d: '<b>Bloquea</b>: sin esto el paso falla seguro, así que no empezamos. <b>Aviso</b>: un paso concreto lo va a necesitar; puedes seguir y arreglarlo cuando llegue, o saltar ese paso.' },
  harness: { t: 'Agente de IA (harness)', d: 'El programa donde trabaja la IA: Claude Code, OpenCode, Codex o Pi. El boilerplate trae instrucciones y skills para cada uno; eliges los que usa tu equipo y solo se configuran esos.' },
  skill: { t: 'Skill', d: 'Un paquete de instrucciones que la IA carga cuando la tarea lo pide: probar una historia, escribir un test, abrir un PR. Viven en <code>.agents/skills/</code> y se copian a cada agente que elijas.' },
  mcp: { t: 'MCP', d: 'Un conector que le da a la IA una herramienta extra: leer tu base de datos, llamar a tu API, consultar documentación. Algunos necesitan una credencial, por eso te la pedimos.' },
  env: { t: 'Archivo .env', d: 'Donde viven las credenciales de este proyecto en tu máquina. Está en <code>.gitignore</code>: nunca se sube al repositorio. La IA lee los nombres de las variables, nunca sus valores.' },
  token: { t: 'Token de API de Atlassian', d: 'Una contraseña que crea tu cuenta de Atlassian para que un programa lea y escriba en Jira por ti. Se crea en <code>id.atlassian.com</code>, en Seguridad, Tokens de API, y se puede revocar en cualquier momento.' },
  jira: { t: 'Jira', d: 'Donde viven las historias, bugs y casos de prueba. Las skills de testing leen la historia desde Jira y escriben ahí los resultados, por eso el instalador conecta este proyecto con tu sitio.' },
  xray: { t: 'Xray', d: 'El complemento de Jira que guarda los casos de prueba y sus ejecuciones. Si tu sitio no lo tiene, el boilerplate usa issues nativos de Jira y no te pide estas credenciales.' },
  gh: { t: 'GitHub CLI (gh)', d: 'La herramienta de línea de comandos de GitHub. La usan las skills para abrir PRs y leer revisiones. Necesita una sesión iniciada con <code>gh auth login</code>.' },
  playwright: { t: 'Navegadores de Playwright', d: 'Playwright necesita su propia copia de Chromium para correr los tests. Es una descarga de unos 150 MB que se hace una sola vez por máquina.' },
  secrets: { t: 'Dónde guardar secretos', d: '<b>Local</b>: en <code>.env</code> de esta máquina, lo más simple. <b>1Password</b>: el archivo solo guarda referencias y los valores se piden a tu bóveda al ejecutar; útil en equipos.' },
  headless: { t: '--headless', d: 'Corre todo en la terminal, sin abrir esta página. Es lo que pasa solo en CI, por SSH sin pantalla o cuando la terminal no es interactiva.' },
  upstream: { t: 'Upstream', d: 'El repositorio original del boilerplate, del que tu proyecto se creó. El actualizador trae de ahí lo nuevo sin pisar lo que es tuyo.' },
  scope: { t: 'Qué actualizar', d: 'El boilerplate se divide en áreas: instrucciones de la IA, skills, scripts, CLI, documentación. Puedes traer solo algunas en esta pasada.' },
  protected: { t: 'Archivo protegido', d: 'Un archivo que es de tu proyecto (por ejemplo tu configuración). El actualizador nunca lo sobrescribe: si arriba cambió, te muestra la diferencia para que decidas.' },
  divergence: { t: 'Cambio en los dos lados', d: 'Tú editaste este archivo y el boilerplate también lo cambió. Tomar uno de los dos perdería el otro cambio, así que te mostramos ambos lados y eliges.' },
  parity: { t: 'Reporte de paridad', d: 'La comprobación final: compara tu proyecto con el boilerplate y lista lo que quedó distinto y por qué (porque es tuyo, porque lo decidiste o porque falta algo).' },
  selfupdate: { t: 'El actualizador se actualiza primero', d: 'Si la versión nueva trae un actualizador mejor, se instala y se reinicia antes de seguir, para que el resto lo haga el código nuevo. Esta página se reconecta sola.' },
  auto: { t: 'sync --auto', d: 'Modo sin preguntas: trae todo lo nuevo, no borra nada y deja anotado lo que requiere una decisión tuya. Con pantalla, esta página lo muestra en solo lectura; en CI o por SSH queda solo en la terminal.' },
  dryrun: { t: '--dry-run', d: 'Una vista previa: el actualizador calcula todo lo que haría y lo muestra, pero no escribe ningún archivo de tu proyecto.' },
  deferred: { t: 'Pendiente para después', d: 'Algo que el modo automático no decide por ti (por ejemplo borrar un archivo). Queda anotado en el resumen y lo resuelves en la próxima pasada interactiva.' },
  summary: { t: 'Resumen guardado', d: 'Una copia de esta página en su estado final, en una carpeta ignorada por git. Sirve para revisar después qué cambió. No contiene ningún secreto.' },
  lane: { t: 'Pasos en paralelo', d: 'Algunos pasos largos, como las descargas, corren mientras respondes otras preguntas. Los ves arriba, en segundo plano, hasta que terminan.' },
  kata: { t: 'KATA', d: 'La arquitectura de los tests de este boilerplate: capas de contexto, componentes de API y UI, y fixtures. El manifiesto KATA lista lo que ya existe para no duplicarlo.' },
};

const glossaryEn: Record<string, GlossaryEntry> = {
  preflight: { t: 'Preflight', d: 'Before touching anything, the installer checks you have the tools, access and disk space every step will need, so you never get stuck halfway on something that could be known at the start.' },
  bloquea: { t: 'Blocks vs. warning', d: '<b>Blocks</b>: without it the step fails for sure, so we do not start. <b>Warning</b>: one specific step needs it; you can go on and fix it when that step arrives, or skip the step.' },
  harness: { t: 'AI agent (harness)', d: 'The program the AI works in: Claude Code, OpenCode, Codex or Pi. The boilerplate ships instructions and skills for each; you pick the ones your team uses and only those are configured.' },
  skill: { t: 'Skill', d: 'A package of instructions the AI loads when a task needs it: test a story, write a test, open a PR. They live in <code>.agents/skills/</code> and are copied to every agent you pick.' },
  mcp: { t: 'MCP', d: 'A connector that gives the AI an extra tool: read your database, call your API, look up documentation. Some need a credential, which is why we ask for it.' },
  env: { t: '.env file', d: 'Where this project keeps its credentials on your machine. It is in <code>.gitignore</code>, so it never reaches the repository. The AI reads variable names, never their values.' },
  token: { t: 'Atlassian API token', d: 'A password your Atlassian account creates so a program can read and write Jira for you. Create it at <code>id.atlassian.com</code>, under Security, API tokens; you can revoke it at any time.' },
  jira: { t: 'Jira', d: 'Where stories, bugs and test cases live. The testing skills read the story from Jira and write the results there, which is why the installer connects this project to your site.' },
  xray: { t: 'Xray', d: 'The Jira add-on that stores test cases and their executions. If your site does not have it, the boilerplate uses native Jira issues and does not ask for these credentials.' },
  gh: { t: 'GitHub CLI (gh)', d: 'GitHub\'s command-line tool. The skills use it to open PRs and read reviews. It needs a session started with <code>gh auth login</code>.' },
  playwright: { t: 'Playwright browsers', d: 'Playwright needs its own copy of Chromium to run tests. It is a download of about 150 MB, done once per machine.' },
  secrets: { t: 'Where secrets live', d: '<b>Local</b>: in this machine\'s <code>.env</code>, the simplest. <b>1Password</b>: the file holds references only and values come from your vault at run time; useful for teams.' },
  headless: { t: '--headless', d: 'Runs everything in the terminal without opening this page. That happens by itself in CI, over SSH without a display, or when the terminal is not interactive.' },
  upstream: { t: 'Upstream', d: 'The original boilerplate repository your project was created from. The updater brings what is new from there without overwriting what is yours.' },
  scope: { t: 'What to update', d: 'The boilerplate is split into areas: AI instructions, skills, scripts, CLI, documentation. You can bring only some of them in this pass.' },
  protected: { t: 'Protected file', d: 'A file that belongs to your project (your configuration, for example). The updater never overwrites it: if upstream changed it, you see the difference and decide.' },
  divergence: { t: 'Changed on both sides', d: 'You edited this file and the boilerplate changed it too. Taking only one side would lose the other change, so you see both and choose.' },
  parity: { t: 'Parity report', d: 'The final check: it compares your project with the boilerplate and lists what is still different and why (it is yours, you decided it, or something is missing).' },
  selfupdate: { t: 'The updater updates itself first', d: 'If the new version ships a better updater, it is installed and restarted before going on, so the new code does the rest. This page reconnects by itself.' },
  auto: { t: 'sync --auto', d: 'No-questions mode: brings everything new, deletes nothing, and notes whatever needs your decision. With a display this page shows it read-only; in CI or over SSH it stays in the terminal.' },
  dryrun: { t: '--dry-run', d: 'A preview: the updater works out everything it would do and shows it, but writes no file of your project.' },
  deferred: { t: 'Pending for later', d: 'Something automatic mode does not decide for you (deleting a file, for example). It is noted in the summary and you settle it in the next interactive pass.' },
  summary: { t: 'Saved summary', d: 'A copy of this page in its final state, in a folder git ignores. Use it to review later what changed. It holds no secret.' },
  lane: { t: 'Steps in parallel', d: 'Some long steps, such as downloads, run while you answer other questions. You see them at the top, in the background, until they finish.' },
  kata: { t: 'KATA', d: 'The test architecture of this boilerplate: context layers, API and UI components, and fixtures. The KATA manifest lists what already exists so nothing is duplicated.' },
};

export function strings(lang: Lang): StringTable {
  return lang === 'en' ? en : es;
}

export function glossary(lang: Lang): Record<string, GlossaryEntry> {
  return lang === 'en' ? glossaryEn : glossaryEs;
}

/** `{name}` placeholders. Missing keys stay as written, so a typo is visible, never blank. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Every key of the Spanish table, for the parity test against English. */
export const STRING_KEYS = Object.keys(es) as StringKey[];
export const GLOSSARY_KEYS = { es: Object.keys(glossaryEs), en: Object.keys(glossaryEn) };
