<script lang="ts">
  import CodePane from '$lib/components/CodePane.svelte';
  import Term from '$lib/components/Term.svelte';
  import { costCards, hotspots, miniSpecs, spaghettiSpec } from '$lib/content/chapters/ch1';
  import { fade, fly } from 'svelte/transition';

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Duración segura: 0 si la persona prefiere menos movimiento. */
  const dur = (ms: number) => (reduceMotion ? 0 : ms);

  let activeHotspot = $state<string | null>(null);

  const active = $derived(hotspots.find((h) => h.id === activeHotspot) ?? null);
  const highlightLines = $derived(active?.lines ?? []);

  function toggleHotspot(id: string) {
    activeHotspot = activeHotspot === id ? null : id;
  }
</script>

<div class="chapter-body">
  <!-- ==================== Sección 1 · El dolor ==================== -->
  <section in:fly|global={{ y: 18, duration: dur(450) }}>
    <p class="kicker">sección 1 · el dolor</p>
    <h2>Así se ve un test sin arquitectura</h2>
    <p class="prose">
      Este es un <Term t="spec">spec</Term> real en espíritu: 33 líneas para dos tests de checkout.
      Funciona… hoy. Pero está enfermo, y los síntomas ya se ven a simple vista. Toca cada pastilla
      para iluminar el problema en el código.
    </p>

    <div class="hotspot-row" role="group" aria-label="Síntomas del spec espagueti">
      {#each hotspots as h (h.id)}
        <button
          class="pill"
          class:on={activeHotspot === h.id}
          aria-pressed={activeHotspot === h.id}
          onclick={() => toggleHotspot(h.id)}
        >
          {h.label}
        </button>
      {/each}
    </div>

    {#if active}
      <div class="callout bad diagnosis" transition:fade={{ duration: dur(180) }}>
        <strong>{active.label}.</strong>
        {active.explain}
      </div>
    {/if}

    <CodePane
      code={spaghettiSpec.code}
      title={spaghettiSpec.title}
      highlight={highlightLines}
      lineNumbers
    />
    <p class="src-note">{spaghettiSpec.sourcePath}</p>
  </section>

  <!-- ==================== Sección 2 · El costo ==================== -->
  <section in:fly|global={{ y: 18, duration: dur(450), delay: dur(120) }}>
    <p class="kicker">sección 2 · el costo</p>
    <h2>El precio se paga después</h2>
    <p class="prose">
      Un spec espagueti no falla el día que lo escribes. Falla tres meses después, cuando la app
      cambia y cada <Term t="locator">locator</Term> copiado, cada espera a ciegas y cada
      <Term t="aserción">aserción</Term> sin dueño cobran su factura al mismo tiempo.
    </p>

    <div class="cards">
      {#each costCards as card, i (card.title)}
        <article
          class="cost-card"
          in:fly|global={{ y: 14, duration: dur(400), delay: dur(200 + i * 110) }}
        >
          <span class="stat">{card.stat}</span>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
        </article>
      {/each}
    </div>
  </section>

  <!-- ==================== Sección 3 · La idea KATA ==================== -->
  <section in:fly|global={{ y: 18, duration: dur(450), delay: dur(240) }}>
    <p class="kicker">sección 3 · la idea kata</p>
    <h2>¿Y si el caso de prueba fuera una pieza de lego?</h2>
    <p class="prose">
      KATA da vuelta el problema: en vez de escribir los casos de prueba <em>dentro</em> de los
      archivos de prueba, los empaqueta como piezas reutilizables con identidad propia. La pieza se
      construye UNA vez — y cualquier spec la toma del estante.
    </p>

    <div class="lego-stage">
      <div class="lego-piece" aria-label="Pieza de lego: el caso de prueba empaquetado">
        <div class="studs" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        <code class="piece-name">loginSuccessfully</code>
        <span class="piece-id">@atc('PROJ-101')</span>
      </div>

      <div class="connectors" aria-hidden="true">
        <span class="drop">↓</span><span class="drop">↓</span><span class="drop">↓</span>
      </div>

      <div class="reusers">
        {#each miniSpecs as spec (spec.file)}
          <article class="mini-spec">
            <header>
              <span class="dotf" aria-hidden="true"></span>
              <code>{spec.file}</code>
            </header>
            <span class="tag">{spec.suite}</span>
            <code class="call">{spec.call}</code>
          </article>
        {/each}
      </div>
    </div>

    <div class="callout good closing">
      <strong>El caso de prueba se escribe UNA vez. Los specs solo eligen piezas.</strong>
      Ese es el corazón de KATA — y el resto de la academia es aprender a tallar la pieza.
    </div>
  </section>
</div>

<style>
  .chapter-body {
    max-width: 940px;
    margin: 0 auto;
    display: grid;
    gap: 56px;
    padding-bottom: 24px;
  }

  section {
    display: grid;
    gap: 16px;
  }

  h2 {
    font-size: 1.45rem;
  }

  .prose {
    color: var(--text-2);
    max-width: 68ch;
  }

  /* ---------- pastillas de dolor ---------- */
  .hotspot-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .pill {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text-2);
    transition:
      border-color 0.15s ease,
      color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }
  .pill:hover {
    border-color: var(--bad);
    color: var(--text-1);
    transform: translateY(-1px);
  }
  .pill.on {
    background: rgba(248, 81, 73, 0.14);
    border-color: var(--bad);
    color: var(--bad);
  }

  .diagnosis {
    font-size: 0.92rem;
  }

  .src-note {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-3);
  }

  /* ---------- tarjetas de costo ---------- */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 16px;
  }
  .cost-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    display: grid;
    gap: 8px;
    align-content: start;
  }
  .cost-card .stat {
    font-family: var(--font-mono);
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--a2);
    letter-spacing: -0.02em;
  }
  .cost-card h3 {
    font-size: 1rem;
  }
  .cost-card p {
    font-size: 0.88rem;
    color: var(--text-2);
  }

  /* ---------- escenario lego ---------- */
  .lego-stage {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 28px 18px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .lego-piece {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 2px;
    background: linear-gradient(160deg, rgba(255, 166, 87, 0.22), rgba(255, 123, 114, 0.16));
    border: 1.5px solid var(--a1);
    border-radius: 10px;
    padding: 22px 28px 14px;
    margin-top: 12px;
    box-shadow: 0 10px 30px rgba(255, 166, 87, 0.12);
  }
  .studs {
    position: absolute;
    top: -11px;
    display: flex;
    gap: 10px;
  }
  .studs span {
    width: 22px;
    height: 11px;
    border-radius: 6px 6px 0 0;
    background: var(--a1);
    opacity: 0.85;
  }
  .piece-name {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--text-1);
    font-size: 0.95rem;
  }
  .piece-id {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--syn-decorator);
  }

  .connectors {
    display: flex;
    gap: clamp(48px, 14vw, 150px);
    color: var(--text-3);
    font-size: 1.1rem;
    line-height: 1;
    padding: 6px 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    .drop {
      animation: drop-hint 2.4s ease-in-out infinite;
    }
    .drop:nth-child(2) {
      animation-delay: 0.3s;
    }
    .drop:nth-child(3) {
      animation-delay: 0.6s;
    }
    @keyframes drop-hint {
      0%,
      100% {
        transform: translateY(0);
        opacity: 0.55;
      }
      50% {
        transform: translateY(4px);
        opacity: 1;
      }
    }
  }

  .reusers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 14px;
    width: 100%;
  }
  .mini-spec {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    display: grid;
    gap: 8px;
    align-content: start;
  }
  .mini-spec header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mini-spec .dotf {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--good);
    flex-shrink: 0;
  }
  .mini-spec header code {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-1);
  }
  .mini-spec .tag {
    justify-self: start;
  }
  .mini-spec .call {
    font-size: 0.72rem;
    color: var(--syn-string);
    background: var(--terminal-body);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    overflow-x: auto;
    white-space: nowrap;
  }

  .closing {
    font-size: 0.95rem;
  }
</style>
