<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';
  import CodePane from '$lib/components/CodePane.svelte';
  import Term from '$lib/components/Term.svelte';
  import {
    fixtureExplanations,
    generateSpec,
    guideScript,
    pieceById,
    PIECES,
    type FixtureKind,
    type PieceDef,
  } from '$lib/content/chapters/ch5';

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = (ms: number) => (reducedMotion ? 0 : ms);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ---------- estado del ensamblador ----------
  let stack = $state<PieceDef[]>([]);
  const spec = $derived(generateSpec(stack));
  const used = $derived(new Set(stack.map((p) => p.id)));

  // ---------- resaltado de líneas nuevas (per-piece reveal) ----------
  let prevLines: string[] = generateSpec([]).code.split('\n');
  let highlight = $state<number[]>([]);

  function diffNewLines(oldLines: string[], newLines: string[]): number[] {
    const pool = new Map<string, number>();
    for (const l of oldLines) pool.set(l, (pool.get(l) ?? 0) + 1);
    const changed: number[] = [];
    newLines.forEach((l, i) => {
      const left = pool.get(l) ?? 0;
      if (left > 0) pool.set(l, left - 1);
      else if (l.trim() !== '') changed.push(i + 1);
    });
    return changed;
  }

  $effect(() => {
    const next = spec.code.split('\n');
    highlight = diffNewLines(prevLines, next);
    prevLines = next;
  });

  // ---------- momento didáctico: el fixture cambió ----------
  let fixtureFlash = $state(false);
  let prevFixture: FixtureKind = 'api';
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (spec.fixture !== prevFixture) {
      prevFixture = spec.fixture;
      fixtureFlash = true;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => (fixtureFlash = false), 1400);
    }
  });

  // ---------- toasts ----------
  let toast = $state<{ msg: string; kind: 'bad' | 'info' } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function showToast(msg: string, kind: 'bad' | 'info' = 'info') {
    toast = { msg, kind };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3200);
  }

  // ---------- rebote (regla: un ATC nunca llama a otro ATC) ----------
  let bounceUid = $state<string | null>(null);
  let bounceTimer: ReturnType<typeof setTimeout> | undefined;

  function violateNesting(uid: string) {
    bounceUid = null;
    requestAnimationFrame(() => (bounceUid = uid));
    clearTimeout(bounceTimer);
    bounceTimer = setTimeout(() => (bounceUid = null), 600);
    showToast('🚫 Un ATC nunca llama a otro ATC — las piezas se encadenan, no se anidan', 'bad');
  }

  $effect(() => () => {
    clearTimeout(toastTimer);
    clearTimeout(bounceTimer);
    clearTimeout(flashTimer);
  });

  // ---------- mutaciones del stack ----------
  function addPiece(piece: PieceDef, index = stack.length) {
    if (used.has(piece.id)) {
      showToast('Esa pieza ya está en el spec — cada const se declara una sola vez');
      return;
    }
    const next = stack.slice();
    next.splice(index, 0, piece);
    stack = next;
    if (piece.helper) {
      showToast('Permitido — es un helper @step: útil en el flujo, pero no suma cobertura al TMS');
    }
  }

  function removeAt(index: number) {
    stack = stack.filter((_, i) => i !== index);
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= stack.length) return;
    const next = stack.slice();
    const [piece] = next.splice(index, 1);
    if (!piece) return;
    next.splice(target, 0, piece);
    stack = next;
  }

  function clearStack() {
    stack = [];
  }

  // ---------- drag & drop con pointer events ----------
  interface DragState {
    piece: PieceDef;
    from: 'catalog' | 'stack';
    x: number;
    y: number;
    startX: number;
    startY: number;
    active: boolean;
  }

  let drag = $state<DragState | null>(null);
  let hoverSlot = $state<number | null>(null);
  let hoverCard = $state<string | null>(null);
  let suppressClick = false;

  type DropTarget =
    | { type: 'slot'; index: number }
    | { type: 'card'; uid: string }
    | { type: 'zone' }
    | null;

  function dropTargetAt(x: number, y: number): DropTarget {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const slot = el.closest<HTMLElement>('[data-slot]');
    if (slot) return { type: 'slot', index: Number(slot.dataset.slot) };
    const card = el.closest<HTMLElement>('[data-stack-card]');
    if (card) return { type: 'card', uid: card.dataset.stackCard ?? '' };
    if (el.closest('[data-dropzone]')) return { type: 'zone' };
    return null;
  }

  function pointerDown(e: PointerEvent, piece: PieceDef, from: 'catalog' | 'stack') {
    if (guiding) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = {
      piece,
      from,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  }

  function pointerMove(e: PointerEvent) {
    if (!drag) return;
    if (!drag.active) {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (moved < 6) return;
      drag.active = true;
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
    const target = dropTargetAt(e.clientX, e.clientY);
    hoverSlot = target?.type === 'slot' ? target.index : null;
    hoverCard = target?.type === 'card' && target.uid !== drag.piece.id ? target.uid : null;
  }

  function pointerUp(e: PointerEvent) {
    if (!drag) return;
    const d = drag;
    drag = null;
    hoverSlot = null;
    hoverCard = null;
    if (!d.active) return; // fue un clic simple: lo maneja onclick
    suppressClick = true;

    const target = dropTargetAt(e.clientX, e.clientY);
    if (!target) return;
    if (target.type === 'card') {
      if (target.uid !== d.piece.id) violateNesting(target.uid);
      return;
    }
    const index = target.type === 'slot' ? target.index : stack.length;
    if (d.from === 'catalog') {
      addPiece(d.piece, index);
      return;
    }
    // reordenar una pieza que ya estaba en el stack
    const current = stack.findIndex((p) => p.id === d.piece.id);
    if (current < 0) return;
    const next = stack.slice();
    next.splice(current, 1);
    next.splice(index > current ? index - 1 : index, 0, d.piece);
    stack = next;
  }

  function pointerCancel() {
    drag = null;
    hoverSlot = null;
    hoverCard = null;
  }

  function catalogClick(piece: PieceDef) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (guiding) return;
    addPiece(piece);
  }

  // ---------- armado guiado ----------
  let guiding = $state(false);
  let guideNote = $state('');

  async function guidedBuild() {
    if (guiding) return;
    guiding = true;
    stack = [];
    guideNote = '';
    if (!reducedMotion) await sleep(350);
    for (const step of guideScript) {
      addPiece(pieceById(step.pieceId));
      guideNote = step.note;
      if (!reducedMotion) await sleep(1700);
    }
    guideNote = '✓ Listo: tres piezas encadenadas = un flujo completo. Cero código escrito a mano.';
    guiding = false;
  }
</script>

<div class="ch5">
  <!-- ================= intro ================= -->
  <section class="intro">
    <p class="lead">
      En el capítulo 2 fabricaste la pieza — el <Term t="atc">ATC</Term>. Ahora viene lo divertido:
      <strong>armar</strong>. A la izquierda tienes el catálogo de piezas reales del boilerplate; en
      el centro, un <code>test()</code> vacío. Arrastra piezas (o púlsalas para añadirlas) y mira
      cómo el código del <Term t="e2e">E2E</Term> se escribe solo, abajo.
    </p>
    <div class="callout" style="margin-top: 14px">
      <strong>Dos reglas del taller</strong>
      <ul class="blist" style="margin-top: 8px">
        <li>Las piezas se <strong>encadenan</strong> una tras otra — nunca una dentro de otra.</li>
        <li>La tarjeta punteada es un helper <code>@step</code>: se permite, pero no suma cobertura al TMS.</li>
      </ul>
    </div>
    <div class="toolbar">
      <button class="btn primary" onclick={guidedBuild} disabled={guiding}>
        🧭 Ármalo por mí
      </button>
      <button class="btn" onclick={clearStack} disabled={guiding || stack.length === 0}>
        vaciar el spec
      </button>
      <span class="counter">
        piezas: {stack.length} · fixture: <code>{spec.fixtureParam}</code>
      </span>
    </div>
    {#if guideNote}
      <p class="guide-note" transition:fade={{ duration: dur(200) }}>{guideNote}</p>
    {/if}
  </section>

  <!-- ================= mesa de trabajo ================= -->
  <div class="workbench">
    <!-- catálogo -->
    <aside class="catalog" aria-label="Catálogo de piezas">
      <h3 class="col-title">Catálogo de piezas</h3>
      {#each PIECES as piece (piece.id)}
        <button
          class="piece"
          class:helper={piece.helper}
          class:ui={piece.kind === 'ui'}
          class:used={used.has(piece.id)}
          disabled={used.has(piece.id) || guiding}
          aria-label={`Añadir ${piece.method} al spec`}
          title={piece.blurb}
          onclick={() => catalogClick(piece)}
          onpointerdown={(e) => pointerDown(e, piece, 'catalog')}
          onpointermove={pointerMove}
          onpointerup={pointerUp}
          onpointercancel={pointerCancel}
        >
          <span class="studs" aria-hidden="true"></span>
          <span class="piece-name">{piece.signature}</span>
          <span class="piece-chips">
            <span class="chip comp">{piece.component}</span>
            <span class="chip kind" class:ui={piece.kind === 'ui'}>
              {piece.kind === 'api' ? 'API' : 'UI'}
            </span>
            {#if piece.helper}<span class="chip step">@step</span>{/if}
            {#if used.has(piece.id)}<span class="chip inspec">en el spec ✓</span>{/if}
          </span>
          <span class="piece-returns">→ {piece.returns}</span>
          {#if !used.has(piece.id)}
            <span class="add-hint" aria-hidden="true">+ añadir</span>
          {/if}
        </button>
      {/each}
    </aside>

    <!-- el spec como zona de armado -->
    <div class="speczone">
      <h3 class="col-title">El spec</h3>
      <div class="spec-frame">
        <p class="spec-line">test('UPEX-100: …', async (<span
            class="fx"
            class:flash={fixtureFlash}>{spec.fixtureParam}</span>) =&gt; &#123;</p>

        <div
          class="dropzone"
          class:dragging={drag?.active}
          data-dropzone
          role="list"
          aria-label="Piezas del spec, en orden de ejecución"
        >
          {#if stack.length === 0}
            <p class="empty" transition:fade={{ duration: dur(150) }}>
              Suelta aquí tu primera pieza<br />— o pulsa una tarjeta del catálogo —
            </p>
          {/if}
          <div class="slot" class:hot={hoverSlot === 0} data-slot="0" aria-hidden="true"></div>
          {#each stack as piece, i (piece.id)}
            <div
              class="row"
              animate:flip={{ duration: dur(240) }}
              in:fly={{ y: 12, duration: dur(200) }}
              out:fade={{ duration: dur(140) }}
            >
              <article
                class="stack-card"
                class:helper={piece.helper}
                class:ui={piece.kind === 'ui'}
                class:bounced={bounceUid === piece.id}
                class:target={hoverCard === piece.id}
                data-stack-card={piece.id}
                role="listitem"
              >
                <button
                  class="grip"
                  aria-label={`Arrastrar ${piece.method} para reordenar`}
                  disabled={guiding}
                  onpointerdown={(e) => pointerDown(e, piece, 'stack')}
                  onpointermove={pointerMove}
                  onpointerup={pointerUp}
                  onpointercancel={pointerCancel}
                >⠿</button>
                <span class="order">{i + 1}</span>
                <span class="stack-body">
                  <span class="stack-name">{piece.method}()</span>
                  <span class="stack-chips">
                    <span class="chip comp">{piece.component}</span>
                    <span class="chip kind" class:ui={piece.kind === 'ui'}>
                      {piece.kind === 'api' ? 'API' : 'UI'}
                    </span>
                    {#if piece.helper}<span class="chip step">@step · sin cobertura TMS</span>{/if}
                  </span>
                </span>
                <span class="controls">
                  <button aria-label="Subir" disabled={i === 0 || guiding} onclick={() => move(i, -1)}>▲</button>
                  <button aria-label="Bajar" disabled={i === stack.length - 1 || guiding} onclick={() => move(i, 1)}>▼</button>
                  <button class="rm" aria-label={`Quitar ${piece.method}`} disabled={guiding} onclick={() => removeAt(i)}>✕</button>
                </span>
              </article>
              <div class="slot" class:hot={hoverSlot === i + 1} data-slot={i + 1} aria-hidden="true"></div>
            </div>
          {/each}
        </div>

        <p class="spec-line">&#125;);</p>
      </div>

      <div class="callout good fx-note" class:flash={fixtureFlash}>
        <strong>¿Por qué <code>{spec.fixtureParam}</code>?</strong>
        {fixtureExplanations[spec.fixture]}
      </div>
    </div>
  </div>

  <!-- ================= código generado en vivo ================= -->
  <section class="livecode">
    <h2>El código que acabas de escribir (sin escribirlo)</h2>
    <p>
      Cada pieza que añades reescribe el archivo. Las líneas resaltadas son las del último cambio —
      incluida la del <Term t="fixture">fixture</Term> cuando cambia sola:
    </p>
    <CodePane code={spec.code} title={spec.fileTitle} {highlight} lineNumbers />
  </section>

  <!-- ================= cierre ================= -->
  <section class="closing">
    <h2>Orquestar, no programar</h2>
    <p>
      Acabas de escribir un E2E <strong>sin escribir código</strong>: elegiste piezas, las
      ordenaste, y el archivo salió solo. Eso es exactamente lo que hace el
      <Term t="spec">spec</Term> en KATA — no contiene la lógica de las pruebas, la
      <strong>orquesta</strong>. La preparación, la acción y las verificaciones viven dentro de
      cada ATC; el spec solo decide qué piezas van y en qué orden, y remata con su aserción de
      flujo.
    </p>
    <p>
      Y si una misma cadena de piezas se repite en 3+ tests, tampoco se copia y pega: se guarda
      como módulo de <Term t="steps">Steps</Term>. Siguiente parada: ver qué pasa cuando este test
      <strong>corre de verdad</strong>.
    </p>
  </section>
</div>

<!-- ghost que sigue al puntero -->
{#if drag?.active}
  <div class="ghost" style:left={`${drag.x}px`} style:top={`${drag.y}px`} aria-hidden="true">
    <span class="studs"></span>
    {drag.piece.method}()
  </div>
{/if}

<!-- toast de reglas -->
{#if toast}
  <div
    class="toast"
    class:bad={toast.kind === 'bad'}
    role="status"
    transition:fly={{ y: 16, duration: dur(180) }}
  >
    {toast.msg}
  </div>
{/if}

<style>
  .ch5 {
    display: grid;
    gap: 36px;
  }
  h2 {
    font-size: 1.25rem;
    margin-bottom: 10px;
  }
  .lead {
    font-size: 1.05rem;
    color: var(--text-1);
    max-width: 70ch;
  }
  code {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
    font-size: 0.85em;
    /* chips cortos ({ api }, test()…): nunca se parten a mitad de token */
    white-space: nowrap;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    flex-wrap: wrap;
  }
  .counter {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text-3);
  }
  .guide-note {
    margin-top: 12px;
    color: var(--a1);
    font-weight: 600;
    font-size: 0.95rem;
  }

  /* ---------- mesa de trabajo ---------- */
  .workbench {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 22px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .workbench {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .col-title {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-3);
    margin-bottom: 12px;
    font-weight: 500;
  }

  /* ---------- catálogo (tarjetas lego) ---------- */
  .catalog {
    display: grid;
    gap: 12px;
  }
  .piece {
    position: relative;
    display: grid;
    gap: 6px;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-left: 4px solid var(--a1);
    border-radius: 10px;
    padding: 16px 14px 12px;
    color: var(--text-1);
    touch-action: none;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      opacity 0.15s ease;
  }
  .piece.ui {
    border-left-color: var(--a3);
  }
  .piece.helper {
    border-style: dashed;
    border-left-style: dashed;
    border-left-color: var(--text-3);
    background: var(--surface-2);
  }
  .piece:not(:disabled):hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    border-color: var(--a1);
    cursor: grab;
  }
  .piece.ui:not(:disabled):hover {
    border-color: var(--a3);
  }
  .piece.used {
    opacity: 0.45;
    cursor: default;
  }
  .studs {
    position: absolute;
    top: 5px;
    left: 12px;
    right: 12px;
    height: 5px;
    background: radial-gradient(circle at 4px 2.5px, var(--border-strong) 2.4px, transparent 2.6px);
    background-size: 16px 5px;
    background-repeat: repeat-x;
    opacity: 0.8;
    pointer-events: none;
  }
  .piece-name {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    word-break: break-word;
  }
  .piece-chips,
  .stack-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    color: var(--text-2);
    white-space: nowrap;
  }
  .chip.comp {
    color: var(--syn-string);
    border-color: rgba(165, 214, 255, 0.35);
  }
  .chip.kind {
    color: var(--good);
    border-color: rgba(63, 185, 80, 0.5);
  }
  .chip.kind.ui {
    color: var(--a3);
    border-color: rgba(210, 168, 255, 0.5);
  }
  .chip.step {
    color: var(--warn);
    border-color: rgba(210, 153, 34, 0.5);
    border-style: dashed;
  }
  .piece-returns {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-3);
  }
  /* estado "ya está en el spec": chip en la fila de chips —
     nunca superpuesto al nombre de la pieza */
  .chip.inspec {
    color: var(--good);
    border-color: rgba(63, 185, 80, 0.5);
    background: rgba(63, 185, 80, 0.08);
  }
  /* pista táctil: solo visible en pantallas angostas (ver media query) */
  .add-hint {
    display: none;
    position: absolute;
    top: 3px;
    right: 10px;
    padding: 0 5px;
    border-radius: 6px;
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: var(--a1);
    opacity: 0.9;
  }

  /* ---------- speczone ---------- */
  .spec-frame {
    background: var(--terminal-body);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    box-shadow: var(--shadow-deep);
  }
  .spec-line {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--text-3);
    white-space: nowrap;
    overflow-x: auto;
  }
  .fx {
    color: var(--a1);
    font-weight: 700;
    border-radius: 6px;
    padding: 1px 4px;
    transition: background 0.3s ease;
  }
  .fx.flash {
    background: rgba(255, 166, 87, 0.25);
  }
  .dropzone {
    position: relative;
    margin: 8px 0 8px 18px;
    min-height: 150px;
    border: 1.5px dashed var(--border);
    border-radius: 10px;
    padding: 8px 10px;
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .dropzone.dragging {
    border-color: var(--a1);
    background: rgba(255, 166, 87, 0.04);
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    text-align: center;
    color: var(--text-3);
    font-size: 0.85rem;
    pointer-events: none;
  }
  .slot {
    height: 8px;
    border-radius: 6px;
    margin: 2px 0;
    transition: height 0.15s ease, background 0.15s ease;
  }
  .dropzone.dragging .slot {
    height: 14px;
    background: rgba(255, 166, 87, 0.08);
    outline: 1px dashed rgba(255, 166, 87, 0.35);
    outline-offset: -1px;
  }
  .dropzone.dragging .slot.hot {
    height: 26px;
    background: rgba(255, 166, 87, 0.22);
  }

  .stack-card {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 10px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-left: 4px solid var(--a1);
    border-radius: 10px;
    padding: 10px 12px;
    transition: border-color 0.2s ease;
  }
  .stack-card.ui {
    border-left-color: var(--a3);
  }
  .stack-card.helper {
    border-style: dashed;
    border-left-style: dashed;
    border-left-color: var(--text-3);
  }
  .stack-card.target {
    border-color: var(--bad);
  }
  .stack-card.bounced {
    border-color: var(--bad);
    animation: bounce 0.45s ease;
  }
  @keyframes bounce {
    0% { transform: translateX(0); }
    25% { transform: translateX(-8px); }
    50% { transform: translateX(7px); }
    75% { transform: translateX(-4px); }
    100% { transform: translateX(0); }
  }
  .grip {
    background: none;
    border: none;
    color: var(--text-3);
    font-size: 1rem;
    padding: 4px 2px;
    cursor: grab;
    touch-action: none;
  }
  .grip:disabled {
    cursor: default;
    opacity: 0.4;
  }
  .order {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--a1);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
  }
  .stack-body {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .stack-name {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-1);
    word-break: break-word;
  }
  .controls {
    display: flex;
    gap: 4px;
  }
  .controls button {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-2);
    font-size: 0.68rem;
    width: 26px;
    height: 24px;
    display: grid;
    place-items: center;
    transition: border-color 0.15s ease, color 0.15s ease;
  }
  .controls button:not(:disabled):hover {
    border-color: var(--a1);
    color: var(--text-1);
  }
  .controls button:disabled {
    opacity: 0.35;
  }
  .controls .rm:not(:disabled):hover {
    border-color: var(--bad);
    color: var(--bad);
  }

  .fx-note {
    margin-top: 14px;
    transition: box-shadow 0.3s ease;
  }
  .fx-note.flash {
    box-shadow: 0 0 0 1px var(--a1), 0 0 28px rgba(255, 166, 87, 0.18);
  }

  /* ---------- código en vivo + cierre ---------- */
  .livecode p,
  .closing p {
    color: var(--text-2);
    margin-bottom: 12px;
    max-width: 75ch;
  }
  .closing p + p {
    margin-top: 4px;
  }

  /* ---------- ghost + toast ---------- */
  .ghost {
    position: fixed;
    z-index: 90;
    transform: translate(-50%, -60%);
    pointer-events: none;
    background: var(--surface-2);
    border: 1px solid var(--a1);
    border-radius: 10px;
    padding: 14px 16px 10px;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-1);
    box-shadow: var(--shadow-deep);
    opacity: 0.95;
  }
  .ghost .studs {
    top: 4px;
  }
  .toast {
    position: fixed;
    /* despega del footer del shell (botones ← / →): nunca lo cubre */
    bottom: 110px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 95;
    max-width: min(560px, 88vw);
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    border-left: 3px solid var(--a1);
    border-radius: 10px;
    padding: 12px 18px;
    font-size: 0.9rem;
    color: var(--text-1);
    box-shadow: var(--shadow-deep);
    text-align: center;
  }
  .toast.bad {
    border-left-color: var(--bad);
  }

  /* ---------- móvil ---------- */
  @media (max-width: 860px) {
    /* Ningún hijo max-content (CodePane, spec-line, tarjetas) puede
       inflar la columna: pista clavada al ancho del contenedor y todos
       los hijos pueden encogerse (min-width: 0). */
    .ch5 {
      grid-template-columns: minmax(0, 1fr);
    }
    .ch5 > section,
    .ch5 > .workbench,
    .catalog,
    .speczone,
    .spec-frame,
    .piece,
    .stack-card {
      min-width: 0;
      max-width: 100%;
    }
    /* en táctil/angosto el clic es la vía principal: hazlo obvio */
    .add-hint {
      display: inline;
    }
  }
  @media (max-width: 640px) {
    /* la línea mono del frame envuelve en vez de desbordar */
    .spec-line {
      white-space: normal;
      word-break: break-word;
      overflow-x: visible;
    }
    .dropzone {
      margin-left: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .piece,
    .stack-card,
    .slot,
    .dropzone,
    .fx,
    .fx-note {
      transition: none;
    }
    .stack-card.bounced {
      animation: none;
    }
    .piece:not(:disabled):hover {
      transform: none;
    }
  }
</style>
