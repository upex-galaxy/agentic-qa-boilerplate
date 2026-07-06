<script lang="ts">
  import { fade } from 'svelte/transition';
  import CodePane from '$lib/components/CodePane.svelte';
  import Term from '$lib/components/Term.svelte';
  import {
    costRows,
    MODES,
    modeById,
    overrideSample,
    registrationSample,
    tokenStages,
    type FixtureModeId,
  } from '$lib/content/chapters/ch4';

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = (ms: number) => (reducedMotion ? 0 : ms);

  // ---------- panel de interruptores ----------
  let modeId = $state<FixtureModeId>('api');
  const mode = $derived(modeById(modeId));

  /** Cuántos pasos de la cascada ya se “construyeron”. */
  let built = $state(0);
  let buildTimer: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    // Se re-ejecuta al cambiar de modo: reinicia la cascada.
    const total = mode.steps.length;
    clearInterval(buildTimer);
    if (reducedMotion) {
      built = total;
      return;
    }
    built = 0;
    buildTimer = setInterval(() => {
      built += 1;
      if (built >= total) clearInterval(buildTimer);
    }, 460);
    return () => clearInterval(buildTimer);
  });

  const browserStepIdx = $derived(mode.steps.findIndex((s) => s.browser));
  const browserOn = $derived(browserStepIdx >= 0 && built > browserStepIdx);
  const buildDone = $derived(built >= mode.steps.length);

  // ---------- micro-demo del token ----------
  let tokenStage = $state(0); // 0 = sin login; 1..3 = etapas
  let tokenTimer: ReturnType<typeof setInterval> | undefined;

  function playToken() {
    clearInterval(tokenTimer);
    if (reducedMotion) {
      tokenStage = 3;
      return;
    }
    tokenStage = 1;
    tokenTimer = setInterval(() => {
      tokenStage += 1;
      if (tokenStage >= 3) clearInterval(tokenTimer);
    }, 850);
  }

  $effect(() => () => clearInterval(tokenTimer));

  const tokenCaption = $derived(tokenStages[tokenStage - 1]?.caption ?? '');
  const tokenHighlight = $derived(tokenStages[tokenStage - 1]?.highlight ?? []);
  const hasKey = (node: 'root' | 'auth' | 'example') =>
    tokenStage >= tokenStages.findIndex((s) => s.node === node) + 1;
</script>

<div class="ch4">
  <!-- ================= hook ================= -->
  <section class="hook">
    <p class="lead">
      Tu test escribe <code>async (&#123; api &#125;) =&gt; …</code> y recibe una caja de
      herramientas completa: <code>api.auth</code>, <code>api.example</code>, sesión, datos falsos.
      <strong>¿Quién la armó?</strong>
    </p>
    <p>
      No te lo vamos a definir todavía. Mejor <strong>míralo pasar</strong>: abajo hay un panel con
      los tres interruptores que un test puede pedir. Enciende uno y observa qué construye
      <Term t="playwright">Playwright</Term> — y qué no.
    </p>
  </section>

  <!-- ================= panel de interruptores ================= -->
  <section class="panel">
    <h2>El panel de interruptores</h2>
    <div class="switches" role="group" aria-label="Elige qué fixture pide el test">
      {#each MODES as m (m.id)}
        <button
          class="switch"
          class:active={modeId === m.id}
          aria-pressed={modeId === m.id}
          onclick={() => (modeId = m.id)}
        >
          <code>{m.request}</code>
        </button>
      {/each}
    </div>

    <div class="diagram">
      <!-- el navegador, a un lado: oscuro salvo que alguien lo necesite -->
      <div class="browser" class:on={browserOn}>
        <div class="chrome" aria-hidden="true">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
        <div class="screen" aria-hidden="true">
          {#if browserOn}
            <span class="screen-label lit">● encendido</span>
          {:else}
            <span class="screen-label">apagado</span>
          {/if}
        </div>
        <p class="browser-note">
          {#if !mode.browser}
            con <code>&#123; api &#125;</code> el navegador <strong>nunca se enciende</strong>
          {:else if browserOn}
            este fixture sí lo necesita: Playwright lo levantó
          {:else}
            …esperando la cascada
          {/if}
        </p>
      </div>

      <!-- la cascada de construcción -->
      <ol class="cascade" aria-label="Cascada de construcción del fixture">
        {#each mode.steps as step, i (mode.id + '-' + step.id)}
          <li class="node" class:lit={built > i} class:is-browser={step.browser}>
            <span class="layer">{step.layer}</span>
            <span class="node-body">
              <span class="node-label">{step.label}</span>
              <span class="node-sub">{step.sub}</span>
            </span>
          </li>
        {/each}
      </ol>
    </div>

    {#if buildDone}
      <p class="outcome" transition:fade={{ duration: dur(250) }}>✓ {mode.outcome}</p>
    {/if}

    <p class="code-intro">
      Esto no es un dibujo: es exactamente lo que declara el registro de fixtures del boilerplate.
      Las líneas resaltadas son las del interruptor que elegiste:
    </p>
    <CodePane
      code={registrationSample.code}
      title={registrationSample.title}
      highlight={mode.highlight}
      lineNumbers
    />
    <div class="callout" style="margin-top: 14px">
      <strong>Mira la línea de <code>api</code></strong>: recibe solo <code>&#123; request &#125;</code>
      — ahí no aparece <code>page</code> por ningún lado. Por eso pedir <code>&#123; api &#125;</code>
      jamás abre una ventana.
    </div>
  </section>

  <!-- ================= lazy + tabla de costos ================= -->
  <section>
    <h2>Playwright solo construye lo que pides</h2>
    <p>
      A esto se le llama construcción <em>lazy</em> (perezosa): nada existe hasta que un test lo
      menciona en su firma. Pedir poco es gratis; pedir de más, se paga en segundos:
    </p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>pides</th><th>navegador</th><th>costo</th><th>úsalo para</th></tr>
        </thead>
        <tbody>
          {#each costRows as row (row.request)}
            <tr>
              <td data-label="pides"><code>{row.request}</code></td>
              <td data-label="navegador">
                <span class="tag" class:ok={!row.browserOn} class:warn={row.browserOn}>
                  {row.browserOn ? '✓' : '✗'} {row.browser}
                </span>
              </td>
              <td data-label="costo">{row.cost}</td>
              <td data-label="úsalo para">{row.use}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- ================= micro-demo: token compartido ================= -->
  <section>
    <h2>Una sesión para toda la caja</h2>
    <p>
      La caja no solo trae herramientas: las mantiene <strong>sincronizadas</strong>. Cuando un ATC
      hace login, guarda el <Term t="token">token</Term> en la caja… y la caja lo reparte a todos
      sus hijos. Pruébalo:
    </p>
    <button class="btn primary" onclick={playToken}>
      ▶ {tokenStage >= 3 ? 'simular login otra vez' : 'simular login'}
    </button>

    <div class="token-tree" aria-label="Propagación del token dentro del fixture">
      <div class="token-node root" class:keyed={hasKey('root')}>
        <span class="node-label">ApiFixture</span>
        <span class="node-sub">la caja</span>
        {#if hasKey('root')}<span class="key" transition:fade={{ duration: dur(200) }}>🔑</span>{/if}
      </div>
      <div class="token-branches">
        <div class="token-node" class:keyed={hasKey('auth')}>
          <span class="node-label">auth</span>
          <span class="node-sub">AuthApi</span>
          {#if hasKey('auth')}<span class="key" transition:fade={{ duration: dur(200) }}>🔑</span>{/if}
        </div>
        <div class="token-node" class:keyed={hasKey('example')}>
          <span class="node-label">example</span>
          <span class="node-sub">ExampleApi</span>
          {#if hasKey('example')}<span class="key" transition:fade={{ duration: dur(200) }}>🔑</span>{/if}
        </div>
      </div>
    </div>

    {#if tokenCaption}
      <p class="token-caption" transition:fade={{ duration: dur(200) }}>{tokenCaption}</p>
    {/if}

    <CodePane
      code={overrideSample.code}
      title={overrideSample.title}
      highlight={tokenHighlight}
      lineNumbers
    />
  </section>

  <!-- ================= regla de selección ================= -->
  <section>
    <h2>¿Qué interruptor pido?</h2>
    <div class="callout good">
      <strong>Regla de selección de <Term t="fixture">fixture</Term></strong>
      <ul class="blist" style="margin-top: 8px">
        <li>Solo <Term t="api">API</Term> → <code>&#123; api &#125;</code> (sin navegador: rápido).</li>
        <li>Solo pantalla → <code>&#123; ui &#125;</code>.</li>
        <li>Híbrido (pantalla + peticiones) → <code>&#123; test &#125;</code>.</li>
      </ul>
    </div>
  </section>

  <!-- ================= nombrar el patrón ================= -->
  <section class="closing">
    <h2>Ahora sí: el nombre</h2>
    <p>
      Lo que acabas de ver — tu test <em>pide</em> herramientas en su firma y alguien más las
      construye, conecta y entrega listas — tiene nombre: se llama
      <Term t="inyección de dependencias">inyección de dependencias</Term>.
    </p>
    <p>
      Tu test nunca escribe <code>new AuthApi(…)</code>, nunca decide cuándo abrir el navegador,
      nunca cablea el token entre componentes. Solo declara qué necesita. La recompensa: specs de
      tres líneas, tests de API que corren en milisegundos, y una sesión que se comparte sola. En
      el próximo capítulo vas a usar esa caja para <strong>armar un E2E completo</strong>.
    </p>
  </section>
</div>

<style>
  .ch4 {
    display: grid;
    gap: 40px;
    max-width: 880px;
  }
  section h2 {
    font-size: 1.25rem;
    margin-bottom: 10px;
  }
  .lead {
    font-size: 1.08rem;
    color: var(--text-1);
  }
  .hook p + p {
    margin-top: 10px;
    color: var(--text-2);
  }
  code {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
    font-size: 0.85em;
    /* chips cortos ({ api }, { request }…): nunca se parten a mitad de token */
    white-space: nowrap;
  }

  /* ---------- interruptores ---------- */
  .switches {
    display: flex;
    gap: 10px;
    margin: 12px 0 20px;
    flex-wrap: wrap;
  }
  .switch {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    padding: 10px 20px;
    font-size: 1rem;
    color: var(--text-2);
    transition:
      border-color 0.15s ease,
      color 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }
  .switch code {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.95rem;
  }
  .switch:hover {
    transform: translateY(-1px);
    border-color: var(--a1);
  }
  .switch.active {
    color: var(--text-1);
    border-color: var(--a1);
    box-shadow:
      0 0 0 1px var(--a1),
      0 0 24px rgba(255, 166, 87, 0.18);
  }
  .switch.active code {
    color: var(--a1);
  }

  /* ---------- diagrama ---------- */
  .diagram {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 22px;
    align-items: start;
  }
  @media (max-width: 720px) {
    .diagram {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .browser {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }
  .browser.on {
    border-color: rgba(63, 185, 80, 0.6);
    box-shadow: 0 0 28px rgba(63, 185, 80, 0.14);
  }
  .chrome {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--terminal-bar);
  }
  .chrome .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--surface-2);
  }
  .browser.on .chrome .dot:nth-child(1) {
    background: #ff5f57;
  }
  .browser.on .chrome .dot:nth-child(2) {
    background: #febc2e;
  }
  .browser.on .chrome .dot:nth-child(3) {
    background: #28c840;
  }
  .screen {
    height: 110px;
    display: grid;
    place-items: center;
    background: var(--terminal-body);
    transition: background 0.4s ease;
  }
  .browser.on .screen {
    background:
      radial-gradient(ellipse at center, rgba(63, 185, 80, 0.16), transparent 70%),
      var(--terminal-body);
  }
  .screen-label {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-3);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .screen-label.lit {
    color: var(--good);
  }
  .browser-note {
    padding: 10px 12px;
    font-size: 0.8rem;
    color: var(--text-2);
    line-height: 1.45;
  }
  .browser-note code {
    font-size: 0.78rem;
  }

  .cascade {
    list-style: none;
    display: grid;
    gap: 4px;
  }
  .node {
    display: grid;
    grid-template-columns: 86px 1fr;
    gap: 12px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    opacity: 0.28;
    transform: translateY(6px);
    transition:
      opacity 0.35s ease,
      transform 0.35s ease,
      border-color 0.35s ease;
    position: relative;
  }
  .node + .node {
    margin-top: 14px;
  }
  .node + .node::before {
    content: '↓';
    position: absolute;
    top: -17px;
    left: 40px;
    color: var(--text-3);
    font-size: 0.8rem;
  }
  .node.lit {
    opacity: 1;
    transform: translateY(0);
    border-color: var(--border-strong);
  }
  .node.lit.is-browser {
    border-color: rgba(63, 185, 80, 0.6);
  }
  .node .layer {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--a1);
  }
  .node.is-browser .layer {
    color: var(--good);
  }
  .node-body {
    display: grid;
  }
  .node-label {
    font-weight: 700;
    color: var(--text-1);
    font-size: 0.92rem;
  }
  .node-sub {
    font-size: 0.8rem;
    color: var(--text-2);
  }
  .outcome {
    margin-top: 16px;
    color: var(--good);
    font-weight: 600;
  }
  .code-intro {
    margin: 18px 0 12px;
    color: var(--text-2);
  }

  /* ---------- tabla de costos ---------- */
  .table-wrap {
    overflow-x: auto;
    margin-top: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    font-size: 0.9rem;
  }
  th,
  td {
    text-align: left;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    color: var(--text-2);
    white-space: nowrap;
  }
  th {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  td:last-child {
    white-space: normal;
  }
  /* En pantallas angostas la tabla se apila: una tarjeta por fixture,
     con pares etiqueta:valor — la columna “úsalo para” nunca queda fuera. */
  @media (max-width: 700px) {
    table,
    tbody {
      display: block;
      background: none;
      border: none;
    }
    thead {
      display: none;
    }
    tbody tr {
      display: grid;
      gap: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
    }
    tbody tr + tr {
      margin-top: 10px;
    }
    td {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 0;
      border-bottom: none;
      white-space: normal;
    }
    td::before {
      content: attr(data-label);
      flex: 0 0 88px;
      font-family: var(--font-mono);
      font-size: 0.68rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-3);
    }
  }

  /* ---------- token demo ---------- */
  .token-tree {
    margin: 22px 0 8px;
    display: grid;
    justify-items: center;
    gap: 26px;
  }
  .token-branches {
    --branch-gap: 40px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--branch-gap);
    position: relative;
  }
  /* Conector en T (líneas de 1px, sin caja):
     tronco vertical desde la caja madre… */
  .token-branches::after {
    content: '';
    position: absolute;
    top: -26px;
    left: 50%;
    width: 1px;
    height: 13px;
    background: var(--border-strong);
  }
  /* …bajante vertical hasta cada hijo… */
  .token-branches > .token-node::before {
    content: '';
    position: absolute;
    top: -13px;
    left: 50%;
    width: 1px;
    height: 13px;
    background: var(--border-strong);
  }
  /* …y barra horizontal que une tronco y bajantes
     (dos medios tramos que se encuentran en el centro del gap). */
  .token-branches > .token-node::after {
    content: '';
    position: absolute;
    top: -13px;
    height: 1px;
    background: var(--border-strong);
  }
  .token-branches > .token-node:first-child::after {
    left: 50%;
    right: calc(-0.5 * var(--branch-gap));
  }
  .token-branches > .token-node:last-child::after {
    left: calc(-0.5 * var(--branch-gap));
    right: 50%;
  }
  .token-node {
    position: relative;
    display: grid;
    justify-items: center;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    padding: 12px 26px;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }
  .token-node.keyed {
    border-color: var(--a1);
    box-shadow: 0 0 22px rgba(255, 166, 87, 0.16);
  }
  .token-node .key {
    position: absolute;
    top: -12px;
    right: -10px;
    font-size: 1.1rem;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
  }
  .token-caption {
    margin: 6px 0 14px;
    color: var(--text-2);
    font-size: 0.92rem;
  }
  section .btn {
    margin: 4px 0 6px;
  }

  /* ---------- cierre ---------- */
  .closing p + p {
    margin-top: 10px;
    color: var(--text-2);
  }

  /* ---------- móvil ---------- */
  @media (max-width: 860px) {
    /* Un hijo max-content (tabla, CodePane) no puede inflar la columna:
       la pista queda clavada al ancho del contenedor y cada sección
       puede encogerse (min-width: 0). La tabla scrollea en su wrapper. */
    .ch4 {
      grid-template-columns: minmax(0, 1fr);
    }
    .ch4 > section,
    .diagram,
    .browser,
    .cascade,
    .node-body,
    .table-wrap,
    .token-tree {
      min-width: 0;
      max-width: 100%;
    }
  }
  @media (max-width: 640px) {
    .token-branches {
      --branch-gap: 18px;
    }
    .token-node {
      padding: 10px 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .node,
    .browser,
    .screen,
    .switch,
    .token-node {
      transition: none;
    }
  }
</style>
