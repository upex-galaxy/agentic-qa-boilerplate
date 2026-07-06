<script lang="ts">
  import { Spring } from 'svelte/motion';
  import { fade } from 'svelte/transition';
  import { chapterMetas } from '$lib/content/chapters/registry';
  import type { ChapterMeta } from '$lib/content/types';
  import { nav } from '$lib/state/nav.svelte';

  /** Lienzo lógico del mapa (las zonas del registry usan este espacio). */
  const WORLD_W = 1600;
  const WORLD_H = 1000;

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let viewportW = $state(1);
  let viewportH = $state(1);

  /**
   * Bajo este ancho el mundo espacial escala a tamaños ilegibles (en tablet
   * vertical ~768px las etiquetas caen a ~8px con bandas muertas enormes),
   * así que se sustituye por una lista vertical con scroll normal.
   */
  const MOBILE_BREAKPOINT = 1000;
  let windowW = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = $derived(windowW < MOBILE_BREAKPOINT);

  /** Cámara: centro (x, y) en coordenadas de mundo + escala. */
  const camera = new Spring(
    { x: WORLD_W / 2, y: WORLD_H / 2, s: 0.5 },
    { stiffness: 0.07, damping: 0.6 }
  );

  /** Encaje con ~48px de aire vertical para que el título no quede cortado. */
  const fitScale = $derived(
    Math.min(viewportW / WORLD_W, Math.max(viewportH - 96, 1) / WORLD_H) * 0.94
  );

  /** Encuadre general: todo el mapa visible y centrado. */
  $effect(() => {
    if (nav.zoomTarget === null) {
      camera.target = { x: WORLD_W / 2, y: WORLD_H / 2, s: fitScale };
    }
  });

  /** Zoom cinematográfico hacia la zona del capítulo elegido. */
  $effect(() => {
    const target = nav.zoomTarget;
    if (target === null) return;
    const meta = chapterMetas.find((m) => m.id === target);
    if (!meta) return;
    const { x, y, w, h } = meta.zone;
    const s = Math.min(viewportW / w, viewportH / h) * 1.15;
    camera.target = { x: x + w / 2, y: y + h / 2, s };
    const timer = setTimeout(() => nav.commitChapter(target), 620);
    return () => clearTimeout(timer);
  });

  const transform = $derived(
    `translate(${viewportW / 2 - camera.current.x * camera.current.s}px, ` +
      `${viewportH / 2 - camera.current.y * camera.current.s}px) ` +
      `scale(${camera.current.s})`
  );

  function zoneStyle(meta: ChapterMeta): string {
    const { x, y, w, h } = meta.zone;
    return `left:${x}px; top:${y}px; width:${w}px; height:${h}px; --zone-accent: var(--${meta.accent});`;
  }

  /** Zonas laterales (el edificio central se dibuja aparte). */
  const sideChapters = $derived(
    chapterMetas.filter((m) => !['capas', 'atc', 'di'].includes(m.id))
  );

  /** Pisos del edificio central (zona del capítulo "capas"). */
  interface Floor {
    label: string;
    sub: string;
    target: ChapterMeta['id'];
    accent: string;
    /** Acentos lego en el piso donde viven los ATCs (las "piezas"). */
    studs?: boolean;
  }
  const floors: Floor[] = [
    { label: 'Tests · las comandas', sub: 'los specs orquestan', target: 'capas', accent: 'var(--text-2)' },
    { label: 'L4 · Fixtures · el pase', sub: 'inyección de dependencias', target: 'di', accent: 'var(--good)' },
    { label: 'L3 · Dominio · los cocineros 🍳', sub: 'aquí viven los ATCs ⚛', target: 'atc', accent: 'var(--a1)', studs: true },
    { label: 'L2 · Bases · las estaciones', sub: 'ApiBase · UiBase', target: 'capas', accent: 'var(--a3)' },
    { label: 'L1 · TestContext · la despensa', sub: 'config · datos · entorno', target: 'capas', accent: 'var(--a2)' },
  ];

  const capasZone = chapterMetas.find((m) => m.id === 'capas')!.zone;

  /* ---------- mnemotecnia oficial: la cocina profesional ---------- */

  /** Panel "¿Por qué una cocina?" con el diccionario completo (§9). */
  let whyOpen = $state(false);

  const mnemonicDictionary: Array<[kata: string, cocina: string]> = [
    ['L1 TestContext', 'la despensa (e instalaciones)'],
    ['L2 ApiBase / UiBase', 'las estaciones (parrilla / horno)'],
    ['L3 componentes', 'los cocineros especializados'],
    [
      'ATC',
      "LA RECETA perfeccionada (precondición = mise en place · acción = cocción · verificación = prueba de sabor · @atc('PROJ-101') = el nombre del plato en la carta)",
    ],
    ['Steps', 'mise en place compartido'],
    ['L4 Fixture', 'el pase: arma tu brigada justa'],
    ['Spec', 'la comanda (encadena platos)'],
    ['kata-manifest', 'el recetario maestro'],
    ['reporter / NDJSON', 'comandas marcadas plato a plato'],
    ['Xray / Jira', 'el libro de reservas y reseñas'],
    ['CI nocturno', 'el servicio de cada noche'],
    ['GO / NO-GO', 'la inspección antes de abrir'],
  ];

  /* ---------- vida ambiental + entrada escalonada ---------- */

  /** Tras la animación de entrada, se quitan las clases para no pisar los hovers. */
  let settled = $state(reducedMotion);
  $effect(() => {
    if (settled) return;
    const t = setTimeout(() => (settled = true), 1400);
    return () => clearTimeout(t);
  });

  /** Ruta guiada: primer capítulo (por orden pedagógico) aún no visitado. */
  const firstUnvisited = $derived(
    chapterMetas.find((m) => !nav.visited.includes(m.id)) ?? chapterMetas[0]!
  );

  /**
   * En móvil no hay zoom cinematográfico: se entra directo al capítulo
   * (commitChapter) para no depender de la cámara del mundo espacial.
   */
  function enterChapter(id: ChapterMeta['id']) {
    if (isMobile) nav.commitChapter(id);
    else nav.goChapter(id);
  }

  /** Teclas 1-8 saltan al capítulo. Escape cierra el panel de mnemotecnia. */
  function onKeydown(event: KeyboardEvent) {
    if (whyOpen) {
      if (event.key === 'Escape') whyOpen = false;
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (nav.zoomTarget !== null) return;
    const num = Number.parseInt(event.key, 10);
    if (Number.isNaN(num)) return;
    const meta = chapterMetas.find((m) => m.num === num);
    if (meta) enterChapter(meta.id);
  }
</script>

<svelte:window onkeydown={onKeydown} bind:innerWidth={windowW} />

{#if isMobile}
  <!-- Móvil: lista vertical con scroll normal (el mundo espacial es ilegible aquí). -->
  <div class="m-map">
    <header class="m-head">
      <p class="kicker">el mapa</p>
      <h1><span class="grad">KATA</span> por dentro</h1>
      <p class="m-sub">Una cocina profesional: recetas, comandas y servicio. Toca una zona para adentrarte.</p>
      <button class="why" onclick={() => (whyOpen = true)}>¿Por qué una cocina?</button>
    </header>

    <nav class="m-list" aria-label="Capítulos">
      {#each chapterMetas as meta (meta.id)}
        {#if meta.id === 'capas'}
          <!-- El edificio central, compactado como grupo apilado. -->
          <section class="m-building" aria-label="Edificio de capas KATA">
            <button class="m-frame" onclick={() => enterChapter('capas')}>
              <span class="m-num">cap. {meta.num} · {meta.title}</span>
              <span class="m-card-title">{meta.mnemonic.icon} {meta.mnemonic.anchor}</span>
              <span class="m-card-summary">{meta.mnemonic.line}</span>
              {#if nav.visited.includes(meta.id)}
                <span class="m-visited" title="Visitado">✓</span>
              {/if}
            </button>
            {#each floors as floor (floor.label)}
              <button
                class="m-floor"
                style:--floor-accent={floor.accent}
                onclick={() => enterChapter(floor.target)}
              >
                <span class="m-floor-label">{floor.label}</span>
                <span class="m-floor-sub">{floor.sub}</span>
              </button>
            {/each}
          </section>
        {:else}
          <button
            class="m-card"
            style:--zone-accent={`var(--${meta.accent})`}
            onclick={() => enterChapter(meta.id)}
          >
            <span class="m-num">cap. {meta.num} · {meta.title}</span>
            <span class="m-card-title">{meta.mnemonic.icon} {meta.mnemonic.anchor}</span>
            <span class="m-card-summary">{meta.mnemonic.line}</span>
            {#if nav.visited.includes(meta.id)}
              <span class="m-visited" title="Visitado">✓</span>
            {/if}
          </button>
        {/if}
      {/each}
    </nav>

    <footer class="m-footer">
      <button class="guided m-guided" onclick={() => enterChapter(firstUnvisited.id)}>
        ▶ Ruta guiada
      </button>
      <span class="m-hint">✓ = visitado</span>
    </footer>
  </div>
{:else}
<div
  class="viewport"
  bind:clientWidth={viewportW}
  bind:clientHeight={viewportH}
  class:zooming={nav.zoomTarget !== null}
>
  <div class="world" style:transform>
    <!-- fondo con brillo ambiental -->
    <div class="ambient"></div>

    <header class="map-title" class:enter={!settled} style:--i={0}>
      <p class="kicker">el mapa</p>
      <h1><span class="grad">KATA</span> por dentro</h1>
      <p class="sub">Una cocina profesional: recetas, comandas y servicio. Haz clic en una zona para adentrarte.</p>
    </header>

    <!-- edificio central: las 4 capas -->
    <section
      class="building"
      style={`left:${capasZone.x}px; top:${capasZone.y}px; width:${capasZone.w}px; height:${capasZone.h}px;`}
      aria-label="Edificio de capas KATA"
    >
      <button
        class="building-frame"
        class:enter={!settled}
        style:--i={1}
        onclick={() => nav.goChapter('capas')}
      >
        <span class="frame-label">cap. 3 · 🏗️ la cocina por dentro</span>
      </button>

      <!-- pulsos: el edificio respira — datos que bajan y suben por las capas -->
      <div class="pulse-track" aria-hidden="true">
        <span class="pulse-dot" style:--d="0s" style:--px="26%"></span>
        <span class="pulse-dot" style:--d="2.6s" style:--px="52%"></span>
        <span class="pulse-dot" style:--d="5.2s" style:--px="76%"></span>
      </div>

      {#each floors as floor, i (floor.label)}
        <button
          class="floor"
          class:enter={!settled}
          style:--floor-accent={floor.accent}
          style:--i={2 + i}
          onclick={() => nav.goChapter(floor.target)}
        >
          <span class="floor-label">{floor.label}</span>
          <span class="floor-sub">{floor.sub}</span>
          {#if floor.target !== 'capas'}
            {@const target = chapterMetas.find((m) => m.id === floor.target)!}
            <span class="floor-cap">cap. {target.num} · {target.mnemonic.anchor} →</span>
          {/if}
          {#if floor.studs}
            <span class="studs" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          {/if}
        </button>
      {/each}
    </section>

    <!-- zonas laterales -->
    {#each sideChapters as meta, i (meta.id)}
      <button
        class="zone"
        class:enter={!settled}
        class:wide={meta.zone.w > 1000}
        style={zoneStyle(meta)}
        style:--i={7 + i}
        onclick={() => nav.goChapter(meta.id)}
      >
        <span class="zone-icon" aria-hidden="true">{meta.mnemonic.icon}</span>
        <span class="zone-num">cap. {meta.num} · {meta.title}</span>
        <span class="zone-title">{meta.mnemonic.anchor}</span>
        <span class="zone-summary">{meta.mnemonic.line}</span>
        {#if nav.visited.includes(meta.id)}
          <span class="visited" title="Visitado">✓</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- leyenda + ruta guiada (overlay, fuera del mundo escalado) -->
  <footer class="map-footer" class:faded={nav.zoomTarget !== null}>
    <span class="hint">clic para adentrarte · ✓ = visitado · teclas 1–8</span>
    <button class="why" onclick={() => (whyOpen = true)}>¿Por qué una cocina?</button>
    <button class="guided" onclick={() => nav.goChapter(firstUnvisited.id)}>
      ▶ Ruta guiada
    </button>
  </footer>
</div>
{/if}

<!-- panel de mnemotecnia (compartido por ambos layouts) -->
{#if whyOpen}
  <div class="mn-overlay" transition:fade={{ duration: reducedMotion ? 0 : 150 }}>
    <button class="mn-backdrop" aria-label="Cerrar el panel" onclick={() => (whyOpen = false)}></button>
    <div class="mn-panel" role="dialog" aria-modal="true" aria-label="Mnemotecnia: la cocina profesional">
      <header class="mn-head">
        <div>
          <p class="kicker">mnemotecnia oficial</p>
          <h2>KATA es una cocina profesional</h2>
        </div>
        <button class="mn-close" onclick={() => (whyOpen = false)} aria-label="Cerrar">✕</button>
      </header>
      <p class="mn-lede">
        Cada pieza técnica tiene su anclaje en la cocina — una sola imagen para recordarlo todo.
      </p>
      <div class="mn-table-wrap">
        <table class="mn-table">
          <thead>
            <tr><th>KATA</th><th>La cocina</th></tr>
          </thead>
          <tbody>
            {#each mnemonicDictionary as [kata, cocina] (kata)}
              <tr><td>{kata}</td><td>{cocina}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}

<style>
  .viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background:
      radial-gradient(60% 50% at 80% 10%, rgba(255, 123, 114, 0.07), transparent 60%),
      radial-gradient(50% 45% at 15% 85%, rgba(255, 166, 87, 0.06), transparent 60%),
      var(--bg);
  }
  .viewport.zooming {
    pointer-events: none;
  }
  .world {
    position: absolute;
    width: 1600px;
    height: 1000px;
    transform-origin: 0 0;
    will-change: transform;
  }
  .ambient {
    position: absolute;
    inset: -100px;
    background: radial-gradient(40% 40% at 50% 50%, rgba(210, 168, 255, 0.05), transparent 70%);
    pointer-events: none;
  }
  .map-title {
    position: absolute;
    left: 80px;
    top: -52px;
    max-width: 460px;
  }
  .map-title h1 {
    font-size: 2rem;
  }
  .map-title .sub {
    color: var(--text-3);
    font-size: 0.88rem;
  }

  /* ---------- entrada escalonada ---------- */
  .enter {
    animation: rise 0.5s cubic-bezier(0.22, 0.9, 0.35, 1) both;
    animation-delay: calc(var(--i) * 40ms);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ---------- edificio ---------- */
  .building {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 52px 26px 26px;
  }
  .building-frame {
    position: absolute;
    inset: 0;
    background: rgba(22, 27, 34, 0.55);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    transition: border-color 0.2s ease;
  }
  .building-frame:hover {
    border-color: var(--a3);
  }
  .frame-label {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-3);
  }

  /* pulsos que recorren las capas (el edificio respira) */
  .pulse-track {
    position: absolute;
    inset: 52px 26px 26px;
    pointer-events: none;
    /* debajo de los pisos: los pulsos solo asoman en los huecos entre
       tarjetas — encima parecían píxeles sueltos sobre el contenido */
    z-index: 0;
  }
  .pulse-dot {
    position: absolute;
    left: var(--px);
    top: 2%;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--a1);
    box-shadow: 0 0 10px var(--a1);
    opacity: 0;
    animation: pulse-travel 7.8s linear infinite;
    animation-delay: var(--d);
  }
  @keyframes pulse-travel {
    0% {
      top: 2%;
      opacity: 0;
    }
    6% {
      opacity: 0.4;
    }
    46% {
      top: 96%;
      opacity: 0.4;
    }
    52% {
      top: 96%;
      opacity: 0.28;
    }
    94% {
      top: 2%;
      opacity: 0.28;
    }
    100% {
      top: 2%;
      opacity: 0;
    }
  }

  .floor {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    padding: 0 22px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--floor-accent);
    border-radius: var(--radius);
    text-align: left;
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
  }
  .floor:hover {
    transform: translateX(3px);
    border-color: var(--floor-accent);
    background: var(--surface-2);
    box-shadow: 0 0 22px color-mix(in srgb, var(--floor-accent) 18%, transparent);
  }
  /* chip que hace visible el capítulo al que lleva el piso (caps 2 y 4
     no tienen tarjeta lateral propia: se entra por aquí) */
  .floor-cap {
    position: absolute;
    top: 50%;
    right: 16px;
    transform: translateY(-50%);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    color: var(--floor-accent);
    border: 1px solid color-mix(in srgb, var(--floor-accent) 50%, transparent);
    border-radius: 999px;
    padding: 3px 12px;
    background: color-mix(in srgb, var(--floor-accent) 8%, transparent);
    white-space: nowrap;
  }
  .floor-label {
    font-weight: 700;
    color: var(--text-1);
    font-size: 1.05rem;
  }
  .floor-sub {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-3);
  }

  /* acentos lego en L3: las piezas viven aquí — studs pegados al borde
     superior de la tarjeta, creciendo desde él como en un brick real */
  .studs {
    position: absolute;
    right: 18px;
    top: -8px;
    display: flex;
    gap: 8px;
  }
  .studs i {
    width: 16px;
    height: 8px;
    border-radius: 4px 4px 0 0;
    background: color-mix(in srgb, var(--a1) 38%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--a1) 60%, transparent);
    border-bottom: none;
    box-shadow: inset 0 2px 2px color-mix(in srgb, var(--a1) 22%, transparent);
  }

  /* ---------- zonas laterales ---------- */
  .zone {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 6px;
    padding: 22px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    text-align: left;
    overflow: hidden;
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }
  .zone::before {
    content: '';
    position: absolute;
    inset: 0;
    /* doble halo: uno tras el icono y otro que llena la franja media vacía
       para que la tarjeta no se lea como espacio sin cargar */
    background:
      radial-gradient(80% 60% at 20% 0%, color-mix(in srgb, var(--zone-accent) 16%, transparent), transparent 70%),
      radial-gradient(95% 85% at 70% 42%, color-mix(in srgb, var(--zone-accent) 7%, transparent), transparent 78%);
    pointer-events: none;
  }
  .zone:hover {
    transform: translateY(-4px);
    border-color: var(--zone-accent);
    box-shadow: 0 0 28px color-mix(in srgb, var(--zone-accent) 22%, transparent);
  }
  /* icono mnemotécnico grande: llena el espacio superior de la tarjeta
     para que no se lea como un vacío sin cargar */
  .zone-icon {
    position: absolute;
    top: 18px;
    left: 20px;
    font-size: 44px;
    line-height: 1;
    opacity: 0.85;
    filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.45)) saturate(0.9);
    pointer-events: none;
  }
  /* el banner ancho del cap. 8 tiene mucho más lienzo: icono algo mayor */
  .zone.wide .zone-icon {
    font-size: 58px;
  }
  .zone-num {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--zone-accent);
  }
  .zone-title {
    font-size: 1.25rem;
    font-weight: 800;
    color: #fff;
  }
  .zone-summary {
    font-size: 0.82rem;
    color: var(--text-2);
    line-height: 1.45;
  }
  .visited {
    position: absolute;
    top: 14px;
    right: 16px;
    color: var(--good);
    font-weight: 700;
  }

  /* ---------- leyenda + ruta guiada ---------- */
  .map-footer {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 7px 16px;
    background: rgba(13, 17, 23, 0.72);
    border: 1px solid var(--border);
    border-radius: 999px;
    backdrop-filter: blur(6px);
    transition: opacity 0.25s ease;
  }
  .map-footer.faded {
    opacity: 0;
    pointer-events: none;
  }
  .hint {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-3);
    white-space: nowrap;
  }
  .guided {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--a1);
    background: transparent;
    border: 1px solid rgba(255, 166, 87, 0.45);
    border-radius: 999px;
    padding: 4px 14px;
    white-space: nowrap;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }
  .guided:hover {
    background: rgba(255, 166, 87, 0.12);
    border-color: var(--a1);
  }
  .why {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--a3);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--a3) 45%, transparent);
    border-radius: 999px;
    padding: 4px 14px;
    white-space: nowrap;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }
  .why:hover {
    background: color-mix(in srgb, var(--a3) 12%, transparent);
    border-color: var(--a3);
  }

  /* ---------- modo presentación: sin píldora de leyenda ---------- */
  :global(main.presentation) .map-footer,
  :global(main.presentation) .m-footer {
    display: none;
  }

  /* ---------- panel de mnemotecnia ---------- */
  .mn-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .mn-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(5, 8, 12, 0.68);
    border: none;
    backdrop-filter: blur(3px);
  }
  .mn-panel {
    position: relative;
    z-index: 1;
    width: min(680px, 100%);
    max-height: min(84vh, 720px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 22px 24px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-deep, 0 24px 60px rgba(0, 0, 0, 0.5));
    /* red de seguridad: si cabecera + lede superan el alto disponible,
       el panel entero puede desplazarse (el caso normal lo cubre
       .mn-table-wrap, que scrollea dejando la cabecera visible) */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .mn-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .mn-head h2 {
    font-size: 1.25rem;
    margin-top: 2px;
  }
  .mn-close {
    background: none;
    border: 1px solid var(--border);
    border-radius: 999px;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    color: var(--text-2);
    font-size: 0.85rem;
    line-height: 1;
    transition: border-color 0.15s ease, color 0.15s ease;
  }
  .mn-close:hover {
    border-color: var(--a3);
    color: var(--text-1);
  }
  .mn-lede {
    color: var(--text-2);
    font-size: 0.88rem;
  }
  .mn-table-wrap {
    /* min-height: 0 permite que este hijo flex encoja y scrollee dentro del
       max-height del panel (sin esto, en móvil el diccionario desbordaba la
       pantalla y las últimas filas quedaban inalcanzables) */
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .mn-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  .mn-table th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-3);
    text-align: left;
    padding: 8px 14px;
  }
  .mn-table td {
    padding: 7px 14px;
    border-top: 1px solid var(--border);
    color: var(--text-2);
    line-height: 1.45;
    vertical-align: top;
  }
  .mn-table td:first-child {
    font-family: var(--font-mono);
    font-size: 0.76rem;
    color: var(--text-1);
    white-space: nowrap;
  }

  /* ---------- móvil: lista vertical con scroll normal ---------- */
  .m-map {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 24px 16px 104px;
    background:
      radial-gradient(60% 30% at 80% 0%, rgba(255, 123, 114, 0.07), transparent 60%),
      radial-gradient(50% 30% at 15% 100%, rgba(255, 166, 87, 0.06), transparent 60%),
      var(--bg);
  }
  .m-head h1 {
    font-size: 1.65rem;
    margin-top: 2px;
  }
  .m-sub {
    color: var(--text-3);
    font-size: 0.85rem;
    margin-top: 4px;
  }
  .m-head .why {
    margin-top: 10px;
  }
  .m-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 20px;
  }
  .m-card,
  .m-frame {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
    min-height: 48px;
    padding: 14px 34px 14px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--zone-accent, var(--border-strong));
    border-radius: var(--radius);
    text-align: left;
  }
  .m-num {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--zone-accent, var(--a3));
  }
  .m-card-title {
    font-size: 1.05rem;
    font-weight: 800;
    color: #fff;
  }
  .m-card-summary {
    font-size: 0.82rem;
    color: var(--text-2);
    line-height: 1.45;
  }
  .m-visited {
    position: absolute;
    top: 12px;
    right: 14px;
    color: var(--good);
    font-weight: 700;
  }
  .m-building {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: rgba(22, 27, 34, 0.55);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    --zone-accent: var(--a3);
  }
  .m-frame {
    background: transparent;
    border: none;
    border-left: none;
    padding: 8px 30px 6px 10px;
  }
  .m-floor {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    width: 100%;
    min-height: 48px;
    padding: 8px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--floor-accent);
    border-radius: var(--radius);
    text-align: left;
  }
  .m-floor-label {
    font-weight: 700;
    color: var(--text-1);
    font-size: 0.92rem;
  }
  .m-floor-sub {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--text-3);
  }
  .m-footer {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 14px;
    padding: 8px 14px;
    background: rgba(13, 17, 23, 0.82);
    border: 1px solid var(--border);
    border-radius: 999px;
    backdrop-filter: blur(6px);
  }
  .m-guided {
    flex: 1;
    min-height: 40px;
    padding: 8px 14px;
    white-space: normal;
  }
  .m-hint {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-3);
  }

  /* ---------- reduced motion: sin pulsos ni stagger ---------- */
  @media (prefers-reduced-motion: reduce) {
    .enter {
      animation: none;
    }
    .pulse-dot {
      animation: none;
      opacity: 0;
    }
  }
</style>
