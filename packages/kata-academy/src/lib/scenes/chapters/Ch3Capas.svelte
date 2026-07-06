<script lang="ts">
  import CodePane from '$lib/components/CodePane.svelte';
  import Term from '$lib/components/Term.svelte';
  import { floors, inheritanceChain, type Floor, type FloorId } from '$lib/content/chapters/ch3';
  import { fade, fly } from 'svelte/transition';

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Duración segura: 0 si la persona prefiere menos movimiento. */
  const dur = (ms: number) => (reduceMotion ? 0 : ms);

  let activeId = $state<FloorId | null>(null);

  const activeFloor = $derived<Floor | null>(floors.find((f) => f.id === activeId) ?? null);

  /** Fachada del edificio: el entrepiso (steps) se pinta DENTRO del piso de dominio. */
  const facade = $derived(floors.filter((f) => f.id !== 'steps'));
  const mezzanine = $derived(floors.find((f) => f.id === 'steps')!);

  /** Columna de la habitación, para traerla a vista en pantallas angostas. */
  let roomCol = $state<HTMLDivElement | null>(null);

  function visit(id: FloorId) {
    activeId = activeId === id ? null : id;
  }

  // En layout apilado (una columna) la habitación se pinta DEBAJO del pliegue:
  // sin este scroll, tocar un piso parece no hacer nada.
  $effect(() => {
    if (!activeFloor || !roomCol) return;
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    roomCol.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  });
</script>

<div class="chapter-body">
  <!-- ==================== Intro ==================== -->
  <section class="intro" in:fly|global={{ y: 18, duration: dur(450) }}>
    <p class="kicker">¿por qué capas?</p>
    <h2>Un edificio donde cada piso tiene UN trabajo</h2>
    <p class="prose">
      KATA organiza el código de pruebas como un edificio. Cada piso es un
      <Term t="módulo">módulo</Term> con una sola responsabilidad, y la regla de circulación es
      estricta: un piso superior usa al de abajo — nunca al revés. Los cimientos no saben nada de
      los tests; los tests lo saben todo de los cimientos.
    </p>
    <p class="prose">
      El ascensor entre pisos es la <Term t="herencia">herencia</Term>: cada
      <Term t="clase">clase</Term> de dominio nace encima de su base y recibe gratis todos sus
      <Term t="método">métodos</Term> (<code>AuthApi extends ApiBase extends TestContext</code>).
      Y en la azotea, el <Term t="fixture">fixture</Term> entrega el edificio entero, ya armado, a
      cada test. Elige un piso para entrar a su habitación.
    </p>
  </section>

  <!-- ==================== El edificio + la habitación ==================== -->
  <section class="tour" in:fly|global={{ y: 18, duration: dur(450), delay: dur(140) }}>
    <div class="left">
      <!-- mini-diagrama persistente de herencia -->
      <div class="chain" aria-label="Cadena de herencia entre capas">
        <span class="chain-kicker">cadena de herencia</span>
        <div class="chain-row">
          <!-- la flecha viaja PEGADA al nodo que apunta: si la fila se parte,
               nunca queda un «─extends→» colgando a final de línea -->
          {#each inheritanceChain as node, i (node)}
            <span class="chain-unit">
              {#if i > 0}
                <span class="ext" aria-hidden="true">─extends→</span>
              {/if}
              <code class="node" class:lit={activeFloor?.chainNode === node}>{node}</code>
            </span>
          {/each}
        </div>
      </div>

      <!-- fachada del edificio -->
      <div class="building" role="group" aria-label="El edificio KATA, piso por piso">
        <div class="roof" aria-hidden="true"></div>
        {#each facade as floor, i (floor.id)}
          <div
            class="floor-slot"
            in:fly|global={{ y: -10, duration: dur(350), delay: dur(200 + i * 90) }}
          >
            <button
              class="floor"
              class:active={activeId === floor.id}
              aria-pressed={activeId === floor.id}
              onclick={() => visit(floor.id)}
            >
              <span class="level">{floor.level}</span>
              <span class="fname">{floor.name}</span>
              <span class="tenants">{floor.tenants}</span>
            </button>

            {#if floor.id === 'dominio'}
              <button
                class="floor mezzanine"
                class:active={activeId === 'steps'}
                aria-pressed={activeId === 'steps'}
                onclick={() => visit('steps')}
              >
                <span class="level">{mezzanine.level}</span>
                <span class="fname">{mezzanine.name}</span>
                <span class="tenants">{mezzanine.tenants}</span>
              </button>
            {/if}
          </div>
        {/each}
        <div class="ground" aria-hidden="true"></div>
      </div>
    </div>

    <!-- la habitación del piso activo -->
    <div class="room-col" aria-live="polite" bind:this={roomCol}>
      {#if activeFloor}
        {#key activeFloor.id}
          <article class="room" in:fly={{ x: 18, duration: dur(320) }}>
            <header>
              <span class="tag">{activeFloor.level}</span>
              <h3>{activeFloor.name}</h3>
            </header>
            <p class="role">{activeFloor.role}</p>
            <ul class="blist">
              {#each activeFloor.rules as rule (rule)}
                <li>{rule}</li>
              {/each}
            </ul>
            {#each activeFloor.samples as sample (sample.title)}
              <CodePane code={sample.code} title={sample.title} />
            {/each}
          </article>
        {/key}
      {:else}
        <div class="room-hint" transition:fade={{ duration: dur(200) }}>
          <span class="hint-arrow" aria-hidden="true">←</span>
          <span class="hint-tap" aria-hidden="true">pulsa un piso ↑</span>
          <p>
            Elige un piso del edificio para entrar. Cada habitación muestra su rol, sus reglas y el
            código REAL del boilerplate que vive ahí.
          </p>
        </div>
      {/if}
    </div>
  </section>

  <!-- ==================== Cierre ==================== -->
  <section in:fly|global={{ y: 18, duration: dur(450), delay: dur(260) }}>
    <div class="callout good">
      <strong>La regla de oro de dirección: una capa superior usa a la inferior, nunca al revés.</strong>
      TestContext no sabe qué es un test. ApiBase no sabe qué es AuthApi. Por eso, cambiar un piso
      de arriba jamás agrieta los cimientos.
    </div>
  </section>
</div>

<style>
  .chapter-body {
    max-width: 1000px;
    margin: 0 auto;
    display: grid;
    gap: 44px;
    padding-bottom: 24px;
  }

  section {
    display: grid;
    gap: 14px;
  }

  h2 {
    font-size: 1.45rem;
  }

  .prose {
    color: var(--text-2);
    max-width: 72ch;
  }
  .prose code {
    font-size: 0.85em;
    color: var(--syn-type);
  }

  /* ---------- tour: edificio + habitación ---------- */
  .tour {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 24px;
    align-items: start;
  }

  .left {
    display: grid;
    gap: 16px;
    position: sticky;
    top: 0;
    min-width: 0;
  }

  /* ---------- cadena de herencia ---------- */
  .chain {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    display: grid;
    gap: 6px;
  }
  .chain-kicker {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .chain-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  /* unidad indivisible flecha+nodo: los saltos de línea ocurren ENTRE unidades */
  .chain-unit {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .node {
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    color: var(--text-2);
    transition:
      color 0.2s ease,
      border-color 0.2s ease,
      background 0.2s ease;
  }
  .node.lit {
    color: var(--chapter-accent, var(--a3));
    border-color: var(--chapter-accent, var(--a3));
    background: rgba(210, 168, 255, 0.12);
  }
  .ext {
    color: var(--text-3);
    font-size: 0.66rem;
  }

  /* ---------- edificio ---------- */
  .building {
    display: grid;
    gap: 6px;
  }
  .roof {
    height: 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: 12px 12px 0 0;
    clip-path: polygon(6% 100%, 50% 0, 94% 100%, 100% 100%, 0 100%);
  }
  .ground {
    height: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    border-radius: 0 0 6px 6px;
  }

  .floor-slot {
    display: grid;
    gap: 6px;
  }

  .floor {
    width: 100%;
    text-align: left;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'level name'
      'level tenants';
    column-gap: 12px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }
  .floor:hover {
    border-color: var(--chapter-accent, var(--a3));
    transform: translateX(3px);
  }
  .floor.active {
    border-color: var(--chapter-accent, var(--a3));
    background: rgba(210, 168, 255, 0.08);
    box-shadow: inset 3px 0 0 var(--chapter-accent, var(--a3));
  }
  .floor .level {
    grid-area: level;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--chapter-accent, var(--a3));
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    padding: 3px 7px;
    align-self: center;
  }
  .floor .fname {
    grid-area: name;
    font-weight: 700;
    color: var(--text-1);
    font-size: 0.92rem;
  }
  .floor .tenants {
    grid-area: tenants;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: var(--text-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* entrepiso L3.5 dentro del piso de dominio */
  .floor.mezzanine {
    width: calc(100% - 26px);
    margin-left: 26px;
    padding: 8px 12px;
    border-style: dashed;
    background: var(--surface-2);
  }
  .floor.mezzanine .fname {
    font-size: 0.82rem;
  }

  /* ---------- habitación ---------- */
  .room-col {
    min-height: 320px;
    min-width: 0;
  }
  .room {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    display: grid;
    gap: 14px;
  }
  .room header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .room h3 {
    font-size: 1.15rem;
  }
  .room .role {
    color: var(--text-2);
    font-size: 0.95rem;
  }
  .room .blist {
    font-size: 0.88rem;
  }

  .room-hint {
    height: 100%;
    min-height: 320px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    text-align: center;
    color: var(--text-3);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    padding: 24px;
  }
  .hint-arrow {
    font-size: 1.6rem;
    color: var(--chapter-accent, var(--a3));
  }
  .hint-tap {
    display: none;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--chapter-accent, var(--a3));
  }
  @media (prefers-reduced-motion: no-preference) {
    .hint-arrow {
      animation: nudge 1.8s ease-in-out infinite;
    }
    @keyframes nudge {
      0%,
      100% {
        transform: translateX(0);
      }
      50% {
        transform: translateX(-6px);
      }
    }
  }
  .room-hint p {
    max-width: 34ch;
    font-size: 0.9rem;
  }

  /* ---------- responsive ---------- */
  @media (max-width: 900px) {
    .tour {
      grid-template-columns: 1fr;
    }
    .left {
      position: static;
    }
    /* apilado: el edificio queda ARRIBA del panel — la flecha «←» ya no
       apunta a nada; se reemplaza por una indicación textual */
    .hint-arrow {
      display: none;
    }
    .hint-tap {
      display: block;
    }
    /* sublabels de piso: mejor 2 líneas que «tests/i…» con elipsis */
    .floor .tenants {
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      overflow-wrap: anywhere;
    }
  }
</style>
