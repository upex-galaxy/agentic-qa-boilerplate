/**
 * The guided tour. It swaps the page to the demo sprint, walks a spotlight
 * across the real UI, plays scripted moves through the same fold as live data,
 * and says WHY each piece is built the way it is. Esc leaves and restores the
 * real board; real updates that arrived meanwhile are counted, not lost.
 */
import { getLang } from './i18n.ts';
import { $, esc } from './util.ts';

export interface TourHost {
  enterDemo: () => void
  exitDemo: () => void
  go: (view: string) => void
  move: (name: 'fail' | 'answer' | 'start') => void
  openTicket: (id: string) => void
  closeDrawer: () => void
}

interface Step {
  view?: string
  target?: string
  open?: string
  move?: 'fail' | 'answer' | 'start'
  en: [title: string, body: string, why: string]
  es: [title: string, body: string, why: string]
}

const STEPS: Step[] = [
  {
    en: ['A sprint you can read in ten seconds', 'This is a demo sprint with invented tickets (DEMO-7901 and up). Everything you see runs through the same code as your real board.', 'The board reads what already exists: the tracker for statuses and test cases, each worker\'s Live Progress file, and a small event log for the things the tracker does not hold (your decisions, messages, holds). Workers do not have to change how they work for it to stay current.'],
    es: ['Un sprint que se lee en diez segundos', 'Este es un sprint de demo con tickets inventados (DEMO-7901 en adelante). Todo lo que ves corre con el mismo código que tu tablero real.', 'El tablero lee lo que ya existe: el tracker para estados y casos, el archivo Live Progress de cada worker, y un pequeño log de eventos para lo que el tracker no guarda (tus decisiones, mensajes, bloqueos). Los workers no tienen que cambiar su forma de trabajar para que esto esté al día.'],
  },
  {
    view: 'now',
    target: '.bottomline',
    en: ['The bottom line first', 'One sentence built from a fixed template: verdicts, what needs you, open bugs, risk, and any worker that went quiet.', 'You read the conclusion before the evidence. A template (not AI prose) means the sentence can never sound better than the numbers.'],
    es: ['Primero la conclusión', 'Una frase armada con una plantilla fija: veredictos, lo que te necesita, bugs abiertos, riesgo y cualquier worker que se quedó callado.', 'Lees la conclusión antes que la evidencia. Una plantilla (no prosa de IA) hace que la frase nunca suene mejor que los números.'],
  },
  {
    view: 'now',
    target: '.kpis',
    en: ['Four numbers, no more', 'Verdicts, pass rate with its denominator, open bugs, and what is waiting on you.', 'These four change what you do in the next hour. The other metrics wait one click away in Metrics, so this strip never turns into noise.'],
    es: ['Cuatro números, no más', 'Veredictos, pass rate con su denominador, bugs abiertos y lo que te espera a ti.', 'Estos cuatro cambian lo que haces en la próxima hora. Las demás métricas están a un clic en Metrics, para que esta franja nunca se vuelva ruido.'],
  },
  {
    view: 'now',
    target: '[data-tour="board"]',
    en: ['Four lanes, in the order you act', 'Needs you, Running, Failed, Passed. Left is where you act first.', 'You asked for three or four columns. A lane is never written by anyone: it is computed from facts (case results, verdicts, questions), so two workers can never disagree about where a ticket sits. Failed and Needs you are separate because the action differs: a dev fixes a failure, you answer a question.'],
    es: ['Cuatro carriles, en el orden en que actúas', 'Needs you, Running, Failed, Passed. A la izquierda está lo que atiendes primero.', 'Pediste tres o cuatro columnas. Nadie escribe el carril: se calcula a partir de hechos (resultados de casos, veredictos, preguntas), así dos workers nunca pueden discrepar sobre dónde está un ticket. Failed y Needs you van separados porque la acción es distinta: un dev arregla una falla, tú respondes una pregunta.'],
  },
  {
    view: 'now',
    target: '[data-card="DEMO-7903"]',
    move: 'fail',
    en: ['Watch: a worker just found a bug', 'DEMO-7903 was Running. Its worker recorded TC-7022 FAILED and filed DEMO-7991, so the card moved to Failed by itself.', 'Cards only move when something real changed, so movement means news. On your machine this happens within a second of the worker writing, with no refresh.'],
    es: ['Mira: un worker acaba de encontrar un bug', 'DEMO-7903 estaba en Running. Su worker registró TC-7022 FAILED y reportó DEMO-7991, así que la tarjeta se movió sola a Failed.', 'Las tarjetas solo se mueven cuando algo cambió de verdad, así que movimiento significa noticia. En tu máquina esto pasa un segundo después de que el worker escribe, sin refrescar.'],
  },
  {
    view: 'now',
    target: '[data-card="DEMO-7902"]',
    en: ['What a card tells you, and what it hides', 'Id, title, priority only when High or Critical, the case bar with PASSED of total, the dev, time in lane, and one line that depends on the lane. This one has a dashed border: its worker went quiet.', 'The tracker status is hidden on purpose and only shows up when it contradicts the lane. "Quiet" and not "dead": workers do not send heartbeats, so the board watches their own file. Silence for 20 minutes is worth a look, not an alarm.'],
    es: ['Lo que dice una tarjeta, y lo que esconde', 'Id, título, prioridad solo si es High o Critical, la barra de casos con PASSED sobre el total, el dev, el tiempo en el carril y una línea que depende del carril. Esta tiene borde punteado: su worker se quedó callado.', 'El estado del tracker está escondido a propósito y solo aparece cuando contradice al carril. "Callado" y no "muerto": los workers no mandan heartbeats, así que el tablero mira su propio archivo. 20 minutos de silencio merecen una mirada, no una alarma.'],
  },
  {
    view: 'now',
    open: 'DEMO-7904',
    target: '#drawer .need-box',
    en: ['Needs you: answer right here', 'Click any card for everything about it. When a worker asks you something, you can pick an option or write the answer, and the worker reads it back with one command.', 'It is the only lane where the sprint waits on you, so it is leftmost and amber. Amber, not red: it is a call to act, not a failure.'],
    es: ['Needs you: responde aquí mismo', 'Haz clic en cualquier tarjeta para ver todo sobre ella. Cuando un worker te pregunta algo, eliges una opción o escribes la respuesta, y el worker la lee con un comando.', 'Es el único carril donde el sprint te espera a ti, por eso va a la izquierda y en ámbar. Ámbar y no rojo: es un llamado a actuar, no una falla.'],
  },
  {
    view: 'now',
    target: '[data-card="DEMO-7904"]',
    move: 'answer',
    en: ['Your answer moves the board', 'You answered DEMO-7904, the worker finished, and the card went to Passed.', 'Your response time is a metric too. It is usually the slowest step of a parallel sprint, and now you can see it.'],
    es: ['Tu respuesta mueve el tablero', 'Respondiste DEMO-7904, el worker terminó, y la tarjeta pasó a Passed.', 'Tu tiempo de respuesta también es una métrica. Suele ser el paso más lento de un sprint en paralelo, y ahora lo puedes ver.'],
  },
  {
    view: 'now',
    target: '[data-tour="tray"]',
    move: 'start',
    en: ['Held and Up next live in a tray, not in lanes', 'Held means waiting on something that is nobody\'s decision: a deploy, data, access. Up next is not started. DEMO-7907 just left the tray because its worker started.', 'A queued card carries no information, and waiting on a deploy is not your call. Keeping both out of the lanes keeps the lanes about action.'],
    es: ['Held y Up next van en una bandeja, no en carriles', 'Held es esperar algo que no es decisión de nadie: un deploy, datos, accesos. Up next es lo que no empezó. DEMO-7907 acaba de salir de la bandeja porque su worker arrancó.', 'Una tarjeta en cola no dice nada, y esperar un deploy no es decisión tuya. Dejar ambos fuera de los carriles mantiene los carriles enfocados en actuar.'],
  },
  {
    view: 'now',
    target: '[data-tour="rail"]',
    en: ['Your next steps, ordered', 'Decisions owed, messages not sent, shipped-at-risk tickets, quiet workers, people to nudge, and tracker drift.', 'This is the list you used to ask me for at the end of every update. Now it rebuilds itself every time something changes.'],
    es: ['Tus próximos pasos, en orden', 'Decisiones pendientes, mensajes sin enviar, tickets que salieron con riesgo, workers callados, gente a quien recordarle y desfases con el tracker.', 'Es la lista que me pedías al final de cada actualización. Ahora se rearma sola cada vez que algo cambia.'],
  },
  {
    view: 'people',
    target: '.draft',
    en: ['Messages to developers: you send them', 'One card per person: what we wait on from them, their tickets, and each message in their language with its state and history. Copy puts the message on your clipboard, and you paste it wherever you talk to them. Each evidence image has its own copy button.', 'An AI writing to a developer directly reads badly and is a security risk, so you own the relationship. Mark sent starts the wait clock, and an unsent message is flagged when its ticket changed after it was written.'],
    es: ['Mensajes a desarrolladores: los mandas tú', 'Una tarjeta por persona: lo que esperamos de ella, sus tickets y cada mensaje en su idioma, con su estado e historial. Copiar deja el mensaje en tu portapapeles y tú lo pegas donde hablas con esa persona. Cada imagen de evidencia tiene su propio botón de copiar.', 'Que una IA le escriba directo a un dev se ve mal y es un riesgo de seguridad, así que la relación es tuya. Marcar enviado arranca el reloj de espera, y un mensaje sin enviar se marca cuando su ticket cambió después de escribirlo.'],
  },
  {
    view: 'metrics',
    target: '[data-tour="m-cases"]',
    en: ['Metrics that cannot flatter', 'Eight metrics. The case chart always shows NOT RUN, and the pass rate names its denominator.', 'A case that never ran did not pass. A tracker can show 100% on a night where half the cases never executed; this page will not.'],
    es: ['Métricas que no pueden maquillar', 'Ocho métricas. El gráfico de casos siempre muestra NOT RUN, y el pass rate dice cuál es su denominador.', 'Un caso que no corrió no pasó. Un tracker puede mostrar 100% una noche en que la mitad de los casos no se ejecutó; esta página no.'],
  },
  {
    view: 'metrics',
    target: '[data-tour="m-risk"]',
    en: ['Shipped at risk', 'A ticket past the QA gate in the tracker while a case is still FAILED, NOT RUN or BLOCKED, with nobody accepting it in writing.', 'A ticket shipped exactly like this in an earlier sprint. The board flags it on the card too, and it stays flagged until someone accepts the risk on record.'],
    es: ['Salió con riesgo', 'Un ticket que pasó el gate de QA en el tracker con un caso aún FAILED, NOT RUN o BLOCKED, sin que nadie lo acepte por escrito.', 'Un ticket salió exactamente así en un sprint anterior. El tablero también lo marca en la tarjeta, y queda marcado hasta que alguien acepte el riesgo por escrito.'],
  },
  {
    view: 'history',
    target: '.foot',
    en: ['History, sharing and language', 'Every sprint keeps its own folder, and closing one writes a frozen HTML copy next to it. A share version leaves out drafts, waits and your answers. EN · ES at the bottom switches the prose only.', 'Ids, titles, lanes and statuses never translate, so they always match the tracker and Slack. The share copy is built from a list of allowed fields, so a private draft cannot leak by accident. Press Esc to go back to your real board.'],
    es: ['Historial, compartir e idioma', 'Cada sprint guarda su carpeta, y al cerrarlo se escribe una copia HTML congelada al lado. La versión para compartir deja fuera borradores, esperas y tus respuestas. EN · ES abajo cambia solo la prosa.', 'Ids, títulos, carriles y estados nunca se traducen, así siempre coinciden con el tracker y Slack. La copia para compartir se arma con una lista de campos permitidos, así un borrador privado no se filtra por accidente. Presiona Esc para volver a tu tablero real.'],
  },
];

export function startTour(host: TourHost): void {
  let i = 0;
  host.enterDemo();
  const spot = document.createElement('div');
  spot.className = 'tour-spot';
  const card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  document.body.append(spot, card);
  const played = new Set<number>();

  const place = () => {
    const step = STEPS[i];
    const el = step.target ? $(step.target) : null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const r = el.getBoundingClientRect();
      const pad = 6;
      Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, display: 'block' });
      const below = r.bottom + 14 + 260 < innerHeight;
      const top = below ? r.bottom + 14 : Math.max(12, r.top - 14 - card.offsetHeight);
      const left = Math.min(Math.max(12, r.left), innerWidth - card.offsetWidth - 12);
      Object.assign(card.style, { top: `${Math.max(12, Math.min(top, innerHeight - card.offsetHeight - 12))}px`, left: `${left}px` });
    }
    else {
      Object.assign(spot.style, { left: '50%', top: '40%', width: '0px', height: '0px' });
      Object.assign(card.style, { top: `${Math.max(20, innerHeight / 2 - 160)}px`, left: `${Math.max(12, innerWidth / 2 - card.offsetWidth / 2)}px` });
    }
  };

  const show = () => {
    const step = STEPS[i];
    const [title, body, why] = step[getLang()];
    host.closeDrawer();
    if (step.view) { host.go(step.view); }
    if (step.open) { host.openTicket(step.open); }
    card.innerHTML = `<span class="lbl">${getLang() === 'es' ? 'Paso' : 'Step'} ${i + 1} / ${STEPS.length}</span><h3>${esc(title)}</h3><p style="margin:0">${esc(body)}</p>
      <div class="why"><b>${getLang() === 'es' ? 'Por qué así' : 'Why it is built this way'}</b>${esc(why)}</div>
      <div class="tour-nav"><span class="tour-dots">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
      <button class="btn ghost" type="button" data-t="exit">${getLang() === 'es' ? 'Salir' : 'Exit'}</button>
      ${i ? `<button class="btn" type="button" data-t="back">${getLang() === 'es' ? 'Atrás' : 'Back'}</button>` : ''}
      <button class="btn primary" type="button" data-t="next">${i === STEPS.length - 1 ? (getLang() === 'es' ? 'Volver a mi tablero' : 'Back to my board') : getLang() === 'es' ? 'Siguiente' : 'Next'}</button></div>`;
    requestAnimationFrame(() => requestAnimationFrame(place));
    setTimeout(place, 420);
    if (step.move && !played.has(i)) {
      played.add(i);
      setTimeout(() => { host.move(step.move!); setTimeout(place, 650); }, 700);
    }
  };

  // Function declarations (hoisted): end, key and next reference each other.
  function end() {
    removeEventListener('resize', place);
    removeEventListener('keydown', key, true);
    spot.remove();
    card.remove();
    host.closeDrawer();
    host.exitDemo();
  }
  function next() {
    if (i === STEPS.length - 1) { end(); }
    else { i++; show(); }
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); end(); }
    if (e.key === 'ArrowRight') { e.stopPropagation(); next(); }
    if (e.key === 'ArrowLeft' && i) { e.stopPropagation(); i--; show(); }
  }

  card.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
    if (t === 'exit') { end(); }
    if (t === 'back') { i--; show(); }
    if (t === 'next') { next(); }
  });
  addEventListener('resize', place);
  addEventListener('keydown', key, true);
  show();
}
