<script lang="ts">
  import CodePane from '$lib/components/CodePane.svelte';
  import Term from '$lib/components/Term.svelte';
  import { fade, fly } from 'svelte/transition';
  import {
    ATC_SAMPLE,
    EXECUTIONS,
    SPECS,
    aggregate,
    ndjsonLine,
    terminalLine,
    type SimExecution,
  } from '$lib/content/chapters/ch6';

  /* ---------- motor de pasos ---------- */

  const reduced =
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Pasos: por cada ejecución hay 2 (correr → apuntar en NDJSON),
  // luego reporter → resultados agregados → sync → chips en Xray.
  const REPORTER = EXECUTIONS.length * 2; // 8
  const RESULTS = REPORTER + 1;
  const SYNC = REPORTER + 2;
  const SYNCED = REPORTER + 3;

  let stepIdx = $state(-1);
  let running = $state(false);
  let speed = $state(1);
  let failSecond = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const started = $derived(stepIdx >= 0);
  const finished = $derived(stepIdx >= SYNCED);
  const reporterOn = $derived(stepIdx >= REPORTER);
  const resultsOn = $derived(stepIdx >= RESULTS);
  const syncOn = $derived(stepIdx >= SYNC);
  const syncedOn = $derived(stepIdx >= SYNCED);

  const dur = reduced ? 0 : 420;

  function isFailed(e: SimExecution): boolean {
    return failSecond && e.breakable === true;
  }

  const results = $derived(aggregate(EXECUTIONS.map((e) => ({ exec: e, failed: isFailed(e) }))));
  const testCount = $derived(new Set(EXECUTIONS.map((e) => `${e.specId}·${e.testTitle}`)).size);
  const caseCount = $derived(results.length);
  const failedRuns = $derived(EXECUTIONS.filter((e) => isFailed(e)).length);

  function stepDuration(idx: number): number {
    if (idx < REPORTER) return idx % 2 === 0 ? 1350 : 800;
    if (idx === REPORTER) return 950;
    if (idx === RESULTS) return 1500;
    if (idx === SYNC) return 1000;
    return 0;
  }

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function scheduleNext() {
    clearTimer();
    if (reduced) return; // en modo sin animación se avanza a mano
    if (stepIdx >= SYNCED) {
      running = false;
      return;
    }
    timer = setTimeout(() => {
      stepIdx += 1;
      scheduleNext();
    }, stepDuration(stepIdx) / speed);
  }

  function play() {
    clearTimer();
    stepIdx = 0;
    running = true;
    scheduleNext();
  }

  function nextStep() {
    if (stepIdx < SYNCED) stepIdx += 1;
    if (stepIdx >= SYNCED) running = false;
  }

  function reset() {
    clearTimer();
    stepIdx = -1;
    running = false;
  }

  function setSpeed(s: number) {
    speed = s;
    if (running && !reduced) scheduleNext();
  }

  /* ---------- auto-scroll del pipeline ---------- */

  let execRowEl = $state<HTMLElement>();
  let reporterEl = $state<HTMLElement>();
  let syncEl = $state<HTMLElement>();

  $effect(() => {
    if (stepIdx < 0) return;
    const target = stepIdx >= SYNC ? syncEl : stepIdx >= REPORTER ? reporterEl : execRowEl;
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  });

  $effect(() => () => clearTimer());

  /* ---------- estado visual por fila ---------- */

  function rowState(e: SimExecution): 'pending' | 'running' | 'pass' | 'fail' {
    if (stepIdx < e.order * 2) return 'pending';
    if (stepIdx === e.order * 2) return 'running';
    return isFailed(e) ? 'fail' : 'pass';
  }
</script>

<div class="ch6" in:fade={{ duration: dur }}>
  <!-- ················ el dolor ················ -->
  <section class="prose">
    <p>
      Ya sabes armar un flujo encadenando piezas. Ahora viene la pregunta que rompe a casi
      todos los frameworks de prueba:
    </p>
    <div class="callout">
      <strong>Si un E2E encadena varios casos de prueba y Playwright solo imprime
      “passed”… ¿cómo sabemos cuáles casos pasaron?</strong>
    </div>
    <p>
      Playwright cuenta <em>tests</em>. Tu <Term t="tms">TMS</Term> cuenta <em>casos de
      prueba</em>. No son lo mismo. KATA construye un puente entre ambos mundos — y aquí
      vas a verlo funcionando por dentro, pieza por pieza.
    </p>
    <p>
      La suite del simulador: dos <Term t="spec">specs</Term>, cuatro tests. Fíjate en
      <strong>PROJ-101</strong>: se ejecuta <strong>dos veces</strong> — una como caso del
      spec de integración y otra como precondición reutilizada dentro del E2E. Es a
      propósito: al final verás qué hace KATA con ese duplicado.
    </p>
  </section>

  <!-- ················ controles ················ -->
  <div class="controls">
    {#if reduced}
      {#if !started || finished}
        <button class="btn primary" onclick={play}>▶ RUN</button>
      {:else}
        <button class="btn primary" onclick={nextStep}>Siguiente paso →</button>
      {/if}
      <span class="reduced-note">modo sin animación: avanza paso a paso</span>
    {:else}
      <button class="btn primary" onclick={play} disabled={running}>▶ RUN</button>
      <div class="speed" role="group" aria-label="Velocidad de la simulación">
        <button class="spd" class:sel={speed === 1} onclick={() => setSpeed(1)}>1×</button>
        <button class="spd" class:sel={speed === 2} onclick={() => setSpeed(2)}>2×</button>
      </div>
    {/if}
    <button class="btn" onclick={reset} disabled={!started}>↺ Reiniciar</button>
    <label class="switch">
      <input type="checkbox" bind:checked={failSecond} onchange={reset} />
      <span class="track"><span class="thumb"></span></span>
      <span>haz fallar la 2ª ejecución de <code>PROJ-101</code></span>
    </label>
  </div>

  <!-- ················ etapa 1 + 2: correr y apuntar ················ -->
  <div class="pipeline">
    <div class="stage-row" bind:this={execRowEl}>
      <section
        class="stage"
        class:on={started}
        class:current={started && stepIdx < REPORTER}
      >
        <header class="stage-head">
          <span class="stage-num">1</span>
          <h3>Los specs corren, ATC por ATC</h3>
        </header>

        <div class="specs">
          {#each SPECS as spec (spec.id)}
            <div class="spec-card">
              <div class="spec-head">
                <span class="spec-path">{spec.path}</span>
                <span class="tag">{spec.kind}</span>
                <span class="tag">{spec.fixture}</span>
              </div>
              {#each EXECUTIONS.filter((e) => e.specId === spec.id) as e (e.order)}
                <div class="trow" class:running={rowState(e) === 'running'}>
                  <span
                    class="tstatus"
                    class:ok={rowState(e) === 'pass'}
                    class:bad={rowState(e) === 'fail'}
                    class:spin={rowState(e) === 'running'}
                  >
                    {rowState(e) === 'pass' ? '✓' : rowState(e) === 'fail' ? '✕' : rowState(e) === 'running' ? '◌' : '·'}
                  </span>
                  <span class="tinfo">
                    <span class="ttitle">{e.testTitle}</span>
                    <span class="tchip">@atc('{e.testId}') · {e.methodName}()</span>
                    {#if e.note}<span class="tnote">↺ {e.note}</span>{/if}
                  </span>
                </div>
              {/each}
            </div>
          {/each}
        </div>

        <figure class="terminal run-term">
          <div class="terminal-bar">
            <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
            <span class="title">bunx playwright test</span>
          </div>
          <div class="term-body">
            {#if !started}
              <span class="muted">pulsa ▶ RUN para arrancar la corrida…</span>
            {/if}
            {#each EXECUTIONS.filter((e) => stepIdx >= e.order * 2) as e (e.order)}
              <div class="tline" class:bad={isFailed(e)} in:fly={{ y: 8, duration: dur }}>
                {terminalLine(e, isFailed(e))}
              </div>
            {/each}
            {#if finished}
              <div class="tline sum" in:fade={{ duration: dur }}>
                {failedRuns > 0
                  ? `${testCount - failedRuns} passed · ${failedRuns} failed`
                  : `${testCount} passed`} — pero esto solo cuenta tests, no casos…
              </div>
            {/if}
          </div>
        </figure>
      </section>

      <div class="conn horiz" class:on={stepIdx >= 1} aria-hidden="true">
        <span class="pulse">➜</span>
      </div>

      <section class="stage" class:on={stepIdx >= 1} class:current={stepIdx >= 1 && stepIdx < REPORTER}>
        <header class="stage-head">
          <span class="stage-num">2</span>
          <h3>Cada ejecución se apunta en un archivo</h3>
        </header>

        <figure class="terminal file-box">
          <div class="terminal-bar">
            <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
            <span class="title">reports/.atc_partial.ndjson</span>
          </div>
          <div class="file-body">
            {#if stepIdx < 1}
              <span class="muted">vacío — todavía no corre nada</span>
            {/if}
            {#each EXECUTIONS.filter((e) => stepIdx >= e.order * 2 + 1) as e (e.order)}
              <div
                class="nline"
                class:bad={isFailed(e)}
                in:fly={{ y: -26, x: -40, duration: reduced ? 0 : 550 }}
              >
                {ndjsonLine(e, isFailed(e))}
              </div>
            {/each}
          </div>
        </figure>

        <div class="callout">
          <strong>¿Por qué un archivo y no la memoria?</strong> Playwright corre cada
          proyecto en un proceso <em>worker</em> separado. La memoria de un proceso muere
          con él; el archivo sobrevive. Por eso el decorador hace APPEND de una línea
          <Term t="ndjson">NDJSON</Term> por cada ejecución de método — un cuaderno de
          apuntes compartido entre procesos.
        </div>
      </section>
    </div>

    <div class="conn vert" class:on={reporterOn} aria-hidden="true">
      <span class="pulse">↓</span>
    </div>

    <!-- ················ etapa 3: el reporter agrega ················ -->
    <section class="stage" bind:this={reporterEl} class:on={reporterOn} class:current={reporterOn && stepIdx < SYNC}>
      <header class="stage-head">
        <span class="stage-num">3</span>
        <h3><code>KataReporter.onEnd()</code> — de apuntes sueltos a veredicto por caso</h3>
      </header>

      <p class="stage-sub">
        Al terminar la corrida, el reporter lee el NDJSON y <strong>agrupa por
        testId</strong>: un mismo ATC ejecutado N veces se convierte en UNA entrada.
      </p>

      <figure class="terminal file-box">
        <div class="terminal-bar">
          <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
          <span class="title">reports/atc_results.json</span>
        </div>
        <div class="res-body">
          {#if !resultsOn}
            <span class="muted">
              {reporterOn ? 'agrupando por testId…' : 'esperando el final de la corrida…'}
            </span>
          {:else}
            {#each results as r, i (r.testId)}
              <div
                class="res-card"
                class:failed={r.status === 'FAILED'}
                in:fly={{ y: 12, duration: dur, delay: reduced ? 0 : i * 130 }}
              >
                <div class="res-top">
                  <span class="res-id">{r.testId}</span>
                  <span class="res-n">
                    {r.statuses.length}
                    {r.statuses.length === 1 ? 'ejecución' : 'ejecuciones'} → 1 entrada
                  </span>
                </div>
                <div class="res-line">
                  {#each r.statuses as s, j (j)}
                    <span class="mini" class:ok={s === 'PASS'} class:no={s === 'FAIL'}>{s}</span>
                  {/each}
                  <span class="res-arrow">⇒</span>
                  <span class="tag" class:ok={r.status === 'PASSED'} class:no={r.status === 'FAILED'}>
                    {r.status}
                  </span>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </figure>

      {#if resultsOn}
        {#if failSecond}
          <div class="callout bad" in:fade={{ duration: dur }}>
            <strong>La regla conservadora.</strong> PROJ-101 tuvo una ejecución en verde y
            una en rojo… y aún así queda <strong>FAILED</strong>. Una sola ejecución rota
            contamina el caso completo — mejor un falso rojo que un falso verde.
          </div>
        {:else}
          <div class="callout" in:fade={{ duration: dur }}>
            <strong>PROJ-101 corrió dos veces y quedó como UNA entrada.</strong> Ahora
            activa el interruptor de fallo y vuelve a correr: verás la regla conservadora
            en acción.
          </div>
        {/if}

        <div class="counts" in:fade={{ duration: dur }}>
          <div class="count">
            <b>{testCount}</b><span>tests de Playwright</span>
          </div>
          <div class="count">
            <b>{caseCount}</b><span>casos de prueba</span>
          </div>
          <div class="count">
            <b>{EXECUTIONS.length}</b><span>ejecuciones de ATC</span>
          </div>
        </div>
        <p class="stage-sub" in:fade={{ duration: dur }}>
          Ese es el desacople: la cobertura de casos <strong>no depende</strong> de cuántos
          <code>test()</code> escribas. El decorador reporta por <em>ejecución de
          método</em>, no por test.
        </p>
      {/if}
    </section>

    <div class="conn vert" class:on={syncOn} aria-hidden="true">
      <span class="pulse">↓</span>
    </div>

    <!-- ················ etapa 4: sync al TMS ················ -->
    <section class="stage" bind:this={syncEl} class:on={syncOn} class:current={syncOn && !syncedOn}>
      <header class="stage-head">
        <span class="stage-num">4</span>
        <h3><code>global.teardown</code> — los resultados viajan a <Term t="xray">Xray</Term></h3>
        <span class="tag warn">AUTO_SYNC apagado por defecto en el seed</span>
      </header>

      <p class="stage-sub">
        <code>syncToXray()</code> hace POST a
        <code>xray.cloud/api/v2/import/execution</code> con un <code>testKey</code> y un
        estado por cada caso. En Jira aparece una Test Execution nueva:
      </p>

      <div class="xray-panel">
        <div class="xray-head">
          <span class="xray-logo">◆</span>
          <span>Test Execution — “Nightly regression · 2026-03-27”</span>
        </div>
        {#each results as r (r.testId)}
          <div class="xray-row">
            <span class="xray-key">{r.testId}</span>
            <span class="xray-name">{r.methods.join(' / ')}</span>
            {#if syncedOn}
              <span
                class="tag"
                class:ok={r.status === 'PASSED'}
                class:no={r.status === 'FAILED'}
                in:fade={{ duration: dur }}
              >
                {r.status}
              </span>
            {:else}
              <span class="tag">{syncOn ? 'sincronizando…' : 'TO DO'}</span>
            {/if}
          </div>
        {/each}
      </div>

      <div class="callout warn">
        <strong>Honestidad del seed:</strong> esta sync automática existe pero viene
        apagada (<code>AUTO_SYNC=false</code>). La corrida siempre deja
        <code>atc_results.json</code>; subirlo a Xray puede hacerse a mano
        (<code>bun xray import junit</code>) o vía <code>syncToJiraDirect()</code> en
        proyectos jira-native.
      </div>
    </section>
  </div>

  <!-- ················ la pieza que dispara todo ················ -->
  <section class="prose">
    <h2>¿Quién escribe esos apuntes? El decorador</h2>
    <p>
      Nadie llama al reporter a mano. La magia vive en la primera línea del ATC: el
      decorador <code>@atc('PROJ-101')</code> envuelve al método y, en cada ejecución,
      etiqueta el reporte de <Term t="allure">Allure</Term> con el testId, agrega el link
      al ticket de Jira y apunta la línea NDJSON al terminar. El ATC no sabe nada de todo
      esto — su código es negocio puro:
    </p>
  </section>

  <CodePane code={ATC_SAMPLE.code} title={ATC_SAMPLE.title} highlight={[1]} lineNumbers />

  <section class="prose">
    <div class="callout good">
      <strong>La recompensa.</strong> Escribes el caso una vez, lo reutilizas en cuantos
      flujos quieras… y cada ticket de Jira recibe su propio veredicto, sin que ningún
      humano copie resultados a mano.
    </div>
    <h2>¿Y quién aprieta ▶ RUN cada noche?</h2>
    <p>
      Nadie. Y ese es exactamente el siguiente capítulo: toda esta cadena corre sola, por
      horario, dentro de un robot de CI — y termina en una decisión de release.
    </p>
  </section>
</div>

<style>
  .ch6 {
    display: grid;
    gap: 26px;
    max-width: 1080px;
  }

  /* ---------- prosa ---------- */
  .prose {
    display: grid;
    gap: 14px;
    max-width: 820px;
  }
  .prose p {
    color: var(--text-2);
  }
  .prose strong {
    color: var(--text-1);
  }
  .prose h2 {
    font-size: 1.25rem;
    margin-top: 6px;
  }
  .prose code,
  .stage-sub code,
  .switch code {
    font-size: 0.85em;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
  }

  /* ---------- controles ---------- */
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 16px;
  }
  .reduced-note {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-3);
  }
  .speed {
    display: inline-flex;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    overflow: hidden;
  }
  .spd {
    background: none;
    border: none;
    color: var(--text-2);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    padding: 7px 12px;
  }
  .spd.sel {
    background: var(--surface-2);
    color: var(--a1);
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--text-2);
    font-size: 0.88rem;
    cursor: pointer;
    margin-left: auto;
  }
  .switch input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .switch .track {
    width: 38px;
    height: 20px;
    border-radius: 999px;
    background: var(--surface-2);
    /* apagado pero vivo: borde más claro para no parecer disabled */
    border: 1px solid var(--text-3);
    position: relative;
    transition: background 0.2s ease, border-color 0.2s ease;
    flex-shrink: 0;
  }
  .switch:hover .track {
    border-color: var(--text-2);
  }
  .switch .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text-1);
    transition: transform 0.2s ease, background 0.2s ease;
  }
  .switch input:checked + .track {
    background: rgba(248, 81, 73, 0.25);
    border-color: var(--bad);
  }
  .switch input:checked + .track .thumb {
    transform: translateX(18px);
    background: var(--bad);
  }
  .switch input:focus-visible + .track {
    box-shadow: 0 0 0 2px rgba(255, 166, 87, 0.45);
  }

  /* ---------- pipeline ---------- */
  .pipeline {
    display: grid;
    gap: 4px;
  }
  .stage-row {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) auto minmax(0, 1fr);
    gap: 10px;
    align-items: stretch;
  }
  @media (max-width: 900px) {
    .stage-row {
      /* 1fr a secas = minmax(auto, 1fr): el min-content de la etapa
         ensancharía toda la página. minmax(0, …) obliga a encoger. */
      grid-template-columns: minmax(0, 1fr);
    }
    .conn.horiz .pulse {
      display: inline-block;
      transform: rotate(90deg);
    }
    /* nada dentro del capítulo puede ensanchar la columna en móvil */
    .ch6 > :global(*),
    .pipeline > :global(*),
    .stage > :global(*) {
      min-width: 0;
    }
    /* la etiqueta larga de la etapa 4 se parte en líneas en vez de desbordar */
    .stage-head :global(.tag) {
      white-space: normal;
      border-radius: 10px;
    }
    /* rutas/URLs mono largas pueden partirse en cualquier punto */
    .stage-sub code,
    .prose code,
    .switch code,
    .callout code {
      overflow-wrap: anywhere;
    }
  }
  .stage {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
    display: grid;
    gap: 14px;
    align-content: start;
    opacity: 0.45;
    transition: opacity 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  }
  .stage.on {
    opacity: 1;
  }
  .stage.current {
    border-color: var(--a2);
    box-shadow: 0 0 0 1px rgba(255, 123, 114, 0.25);
  }
  .stage-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .stage-head h3 {
    font-size: 0.98rem;
    font-weight: 700;
  }
  .stage-head code {
    font-size: 0.9em;
  }
  .stage-num {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--a1);
    flex-shrink: 0;
  }
  .stage-sub {
    color: var(--text-2);
    font-size: 0.9rem;
  }

  .conn {
    display: grid;
    place-items: center;
    color: var(--text-3);
    font-size: 1.1rem;
    opacity: 0.4;
    transition: opacity 0.3s ease, color 0.3s ease;
    padding: 2px 0;
  }
  .conn.on {
    opacity: 1;
    color: var(--a1);
  }
  .conn.on .pulse {
    animation: conn-pulse 1.1s ease-in-out infinite;
  }
  @keyframes conn-pulse {
    0%, 100% { transform: translateY(0); opacity: 1; }
    50% { transform: translateY(4px); opacity: 0.55; }
  }
  @media (prefers-reduced-motion: reduce) {
    .conn.on .pulse {
      animation: none;
    }
  }

  /* ---------- spec cards ---------- */
  .specs {
    display: grid;
    gap: 10px;
  }
  .spec-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
    padding: 10px 12px;
    display: grid;
    gap: 8px;
  }
  .spec-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .spec-path {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--text-1);
    word-break: break-all;
  }
  .trow {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: background 0.25s ease, border-color 0.25s ease;
  }
  .trow.running {
    background: rgba(255, 166, 87, 0.08);
    border-color: rgba(255, 166, 87, 0.4);
  }
  .tstatus {
    font-family: var(--font-mono);
    color: var(--text-3);
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }
  .tstatus.ok {
    color: var(--good);
  }
  .tstatus.bad {
    color: var(--bad);
  }
  .tstatus.spin {
    color: var(--a1);
  }
  .trow.running .tstatus.spin {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .trow.running .tstatus.spin {
      animation: none;
    }
  }
  .tinfo {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .ttitle {
    font-size: 0.8rem;
    color: var(--text-2);
  }
  .tchip {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--syn-decorator);
  }
  .tnote {
    font-size: 0.7rem;
    color: var(--a3);
  }

  /* ---------- terminales ---------- */
  .run-term .term-body,
  .file-body,
  .res-body {
    padding: 12px 14px;
    font-family: var(--font-mono);
    font-size: 0.74rem;
    display: grid;
    gap: 6px;
    min-height: 64px;
    align-content: start;
  }
  .muted {
    color: var(--text-3);
    font-style: italic;
  }
  .tline {
    color: var(--good);
    white-space: nowrap;
    overflow-x: auto;
  }
  .tline.bad {
    color: var(--bad);
  }
  .tline.sum {
    color: var(--text-2);
    border-top: 1px dashed var(--border);
    padding-top: 6px;
    white-space: normal;
  }
  /* el contenido oculto a la derecha se señala: fade estático en el borde… */
  .file-body {
    position: relative;
  }
  .file-body::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 34px;
    background: linear-gradient(to right, rgba(1, 4, 9, 0), var(--terminal-body) 90%);
    pointer-events: none;
  }
  .file-body .nline {
    color: var(--syn-string);
    white-space: nowrap;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  /* …y scrollbar fina siempre visible en las líneas desplazables */
  .nline::-webkit-scrollbar,
  .tline::-webkit-scrollbar {
    height: 4px;
  }
  .nline::-webkit-scrollbar-thumb,
  .tline::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: 999px;
  }
  .nline::-webkit-scrollbar-track,
  .tline::-webkit-scrollbar-track {
    background: transparent;
  }
  .file-body .nline.bad {
    color: var(--bad);
  }

  /* ---------- resultados agregados ---------- */
  .res-body {
    gap: 10px;
  }
  .res-card {
    border: 1px solid var(--border);
    border-left: 3px solid var(--good);
    border-radius: 8px;
    background: var(--surface);
    padding: 8px 12px;
    display: grid;
    gap: 6px;
  }
  .res-card.failed {
    border-left-color: var(--bad);
  }
  .res-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .res-id {
    color: var(--text-1);
    font-weight: 700;
  }
  .res-n {
    color: var(--text-3);
    font-size: 0.68rem;
  }
  .res-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .mini {
    font-size: 0.66rem;
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    color: var(--text-2);
  }
  .mini.ok {
    color: var(--good);
    border-color: rgba(63, 185, 80, 0.5);
  }
  .mini.no {
    color: var(--bad);
    border-color: rgba(248, 81, 73, 0.5);
  }
  .res-arrow {
    color: var(--text-3);
  }

  /* ---------- contadores del desacople ---------- */
  .counts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  @media (max-width: 700px) {
    .counts {
      grid-template-columns: 1fr;
    }
  }
  .count {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    text-align: center;
    display: grid;
    gap: 2px;
  }
  .count b {
    font-size: 1.6rem;
    background: var(--grad);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .count span {
    font-size: 0.78rem;
    color: var(--text-2);
  }

  /* ---------- panel estilo Jira/Xray ---------- */
  .xray-panel {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface-2);
  }
  .xray-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 0.85rem;
    color: var(--text-1);
    font-weight: 600;
  }
  .xray-logo {
    color: var(--a3);
  }
  .xray-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 0.82rem;
  }
  .xray-row:last-child {
    border-bottom: none;
  }
  .xray-key {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--a1);
    min-width: 78px;
  }
  .xray-name {
    color: var(--text-2);
    flex: 1;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
