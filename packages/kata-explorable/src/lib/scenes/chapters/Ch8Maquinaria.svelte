<script lang="ts">
  import Term from '$lib/components/Term.svelte';
  import { fade, slide } from 'svelte/transition';
  import { FULL_CIRCLE, WORKFLOWS } from '$lib/content/chapters/ch8';

  const reduced =
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dur = reduced ? 0 : 260;

  /* ---------- visual 1: workflows ---------- */
  let openId = $state<string | null>('regression');

  function toggle(id: string) {
    openId = openId === id ? null : id;
  }

  /* ---------- visual 3: veredicto GO / CAUTION / NO-GO ---------- */
  let passRate = $state(97);
  let criticalFail = $state(false);
  let highRegression = $state(false);

  const verdict = $derived(
    criticalFail || highRegression || passRate < 90
      ? 'NO-GO'
      : passRate >= 95
        ? 'GO'
        : 'CAUTION',
  );

  const reasons = $derived.by(() => {
    const out: string[] = [];
    if (criticalFail) out.push('Veto duro: falló un test @critical → NO-GO automático, sin importar el resto.');
    if (highRegression) out.push('Veto duro: hay una regresión HIGH/CRITICAL → NO-GO.');
    if (passRate < 90) out.push('Veto duro: pass-rate por debajo del 90% → NO-GO.');
    if (out.length === 0) {
      out.push(
        passRate >= 95
          ? `Sin vetos y pass-rate ${passRate}% ≥ 95% → GO: release aprobado.`
          : `Sin vetos, pero pass-rate ${passRate}% entre 90% y 95% → CAUTION: revisión humana y riesgos documentados.`,
      );
    }
    return out;
  });
</script>

<div class="ch8" in:fade={{ duration: dur }}>
  <!-- ················ el zoom out ················ -->
  <section class="prose">
    <p>
      Todo lo que viste en el simulador — correr specs, apuntar ejecuciones, agregar
      resultados, avisar al TMS — <strong>pasa solo, cada noche, sin humanos</strong>.
      Ese robot se llama <Term t="ci">CI</Term>: GitHub Actions ejecuta las
      <Term t="suite">suites</Term> por horario y publica los resultados antes de que el
      equipo despierte.
    </p>
    <p>
      La maquinaria tiene cuatro engranajes. Pulsa cada uno para ver qué hace:
    </p>
  </section>

  <!-- ················ visual 1: los 4 workflows ················ -->
  <div class="rail">
    {#each WORKFLOWS as w (w.id)}
      <div class="wf" class:open={openId === w.id}>
        <button
          class="wf-head"
          onclick={() => toggle(w.id)}
          aria-expanded={openId === w.id}
          aria-controls={openId === w.id ? `wf-panel-${w.id}` : undefined}
        >
          <span class="wf-icon" aria-hidden="true">{w.icon}</span>
          <span class="wf-name">{w.name}.yml</span>
          <span class="wf-trigger">{w.trigger}</span>
          <span class="wf-runs">{w.runs}</span>
          <span class="wf-chev" aria-hidden="true">▾</span>
        </button>
      </div>
      <!-- El detalle abre en una fila completa propia: la rejilla de tarjetas
           queda pareja (grid-auto-flow: dense recoloca las tarjetas siguientes). -->
      {#if openId === w.id}
        <div class="wf-panel" id={`wf-panel-${w.id}`} transition:slide={{ duration: dur }}>
          <p class="wf-panel-head">
            <span aria-hidden="true">{w.icon}</span>
            <span>{w.name}.yml</span>
          </p>
          <ul class="wf-detail">
            {#each w.detail as line, i (i)}
              <li>{line}</li>
            {/each}
          </ul>
        </div>
      {/if}
    {/each}
  </div>

  <!-- ················ visual 2: el flujo de artefactos ················ -->
  <section class="prose">
    <h2>Dos jobs, un solo reporte</h2>
    <p>
      El workflow nocturno corre integración y E2E como jobs separados. Cada uno deja su
      carpeta <code>allure-results/</code>; un paso final las fusiona y
      <Term t="allure">Allure</Term> genera un único reporte navegable:
    </p>
  </section>

  <div class="flow" aria-label="Flujo de artefactos: dos jobs se fusionan en un reporte">
    <div class="flow-jobs">
      <div class="node job">
        <span class="node-title">job: integration</span>
        <span class="node-sub">allure-results/</span>
      </div>
      <div class="node job">
        <span class="node-title">job: e2e</span>
        <span class="node-sub">allure-results/</span>
      </div>
    </div>
    <div class="flow-arrow" aria-hidden="true">⟶</div>
    <div class="node merge">
      <span class="node-title">merge</span>
      <span class="node-sub">allure generate</span>
    </div>
    <div class="flow-arrow" aria-hidden="true">⟶</div>
    <div class="allure-mock">
      <div class="am-bar">
        <span class="am-dot"></span>
        <span>Allure Report · regression · 00:00 → GitHub Pages</span>
      </div>
      <div class="am-body">
        <div class="am-rate">
          <b>96.4%</b>
          <span>pass-rate</span>
        </div>
        <div class="am-stats">
          <span class="tag ok">53 passed</span>
          <span class="tag no">2 failed</span>
          <span class="tag">1 skipped</span>
          <span class="am-time">duración: 14m 12s</span>
        </div>
        <div class="am-track" aria-hidden="true">
          <span class="am-fill" style:width="96.4%"></span>
        </div>
      </div>
    </div>
  </div>

  <!-- ················ visual 3: GO / CAUTION / NO-GO ················ -->
  <section class="prose">
    <h2>La decisión: ¿se libera o no?</h2>
    <p>
      El reporte no decide nada — alguien tiene que leerlo y emitir un veredicto. Juega
      con las tres variables y mira cómo cambia la decisión:
    </p>
  </section>

  <div class="verdict-widget">
    <div class="vw-controls">
      <label class="vw-slider">
        <span class="vw-label">pass-rate: <b>{passRate}%</b></span>
        <input type="range" min="80" max="100" step="1" bind:value={passRate} />
      </label>
      <label class="switch">
        <input type="checkbox" bind:checked={criticalFail} />
        <span class="track"><span class="thumb"></span></span>
        <span>¿falló algún test <code>@critical</code>?</span>
      </label>
      <label class="switch">
        <input type="checkbox" bind:checked={highRegression} />
        <span class="track"><span class="thumb"></span></span>
        <span>¿hay una regresión HIGH/CRITICAL?</span>
      </label>
    </div>
    <div class="vw-result">
      <span
        class="verdict"
        class:go={verdict === 'GO'}
        class:caution={verdict === 'CAUTION'}
        class:nogo={verdict === 'NO-GO'}
      >
        {verdict}
      </span>
      <ul class="vw-why">
        {#each reasons as r (r)}
          <li in:fade={{ duration: dur }}>{r}</li>
        {/each}
      </ul>
    </div>
  </div>

  <div class="callout warn">
    <strong>Nota honesta:</strong> el veredicto lo emite el agente de IA leyendo el
    reporte — es doctrina de <code>/regression-testing</code>, no un script. Los vetos
    duros de arriba son la parte no negociable de esa doctrina.
  </div>

  <!-- ················ el círculo completo ················ -->
  <section class="prose">
    <h2>El círculo se cierra</h2>
    <p>
      Mira el viaje completo de un caso de prueba — el mismo string
      <code>'PROJ-101'</code> lo acompaña de punta a punta:
    </p>
  </section>

  <div class="circle" role="list">
    {#each FULL_CIRCLE as step, i (step.label)}
      <!-- flecha + chip viajan juntos: los saltos de línea caen ENTRE unidades
           y ninguna flecha queda colgando al final de una línea -->
      <span class="c-unit" role="listitem">
        {#if i > 0}
          <span class="c-arrow" aria-hidden="true">→</span>
        {/if}
        <span class="c-chip">
          <span class="c-icon" aria-hidden="true">{step.icon}</span>
          <span>{step.label}</span>
        </span>
      </span>
    {/each}
    <div class="c-return">↩ …y el veredicto alimenta los tickets del siguiente ciclo</div>
  </div>

  <div class="callout good">
    <strong>La trazabilidad es un círculo, no una línea.</strong> El ticket engendra el
    ATC, el ATC corre cada noche, su resultado vuelve al ticket, y el veredicto de
    release decide qué se trabaja después. Ningún eslabón se copia a mano — por eso no
    se rompe.
  </div>
</div>

<style>
  .ch8 {
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
  .callout code,
  .switch code {
    font-size: 0.85em;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
  }

  /* ---------- visual 1: rail de workflows ---------- */
  .rail {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    grid-auto-flow: dense;
    gap: 12px;
    align-items: stretch;
  }
  .wf {
    display: grid;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  }
  .wf:hover {
    border-color: var(--a1);
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  }
  .wf.open {
    border-color: var(--a1);
  }
  @media (prefers-reduced-motion: reduce) {
    .wf,
    .wf:hover {
      transition: none;
      transform: none;
    }
  }
  .wf-head {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      'icon name chev'
      'icon trigger chev'
      'runs runs runs';
    grid-template-rows: auto auto 1fr;
    align-items: center;
    column-gap: 10px;
    row-gap: 4px;
    background: none;
    border: none;
    color: var(--text-1);
    text-align: left;
    padding: 14px;
    cursor: pointer;
  }
  .wf-icon {
    grid-area: icon;
    font-size: 1.3rem;
  }
  .wf-name {
    grid-area: name;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    font-weight: 700;
  }
  .wf-trigger {
    grid-area: trigger;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--a1);
  }
  .wf-runs {
    grid-area: runs;
    align-self: end;
    font-size: 0.78rem;
    color: var(--text-2);
    padding-top: 6px;
    border-top: 1px dashed var(--border);
  }
  .wf-chev {
    grid-area: chev;
    color: var(--text-2);
    font-size: 1.2rem;
    line-height: 1;
    transition: transform 0.2s ease, color 0.2s ease;
  }
  .wf:hover .wf-chev {
    color: var(--a1);
  }
  .wf.open .wf-chev {
    transform: rotate(180deg);
    color: var(--a1);
  }
  @media (prefers-reduced-motion: reduce) {
    .wf-chev {
      transition: none;
    }
  }
  .wf-panel {
    grid-column: 1 / -1;
    background: var(--surface);
    border: 1px solid rgba(255, 166, 87, 0.45);
    border-radius: var(--radius);
    padding: 14px 16px;
    display: grid;
    gap: 10px;
  }
  .wf-panel-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--a1);
  }
  .wf-detail {
    list-style: none;
    display: grid;
    gap: 6px;
  }
  .wf-detail li {
    position: relative;
    padding-left: 1.2em;
    font-size: 0.78rem;
    color: var(--text-2);
  }
  .wf-detail li::before {
    content: '▸';
    position: absolute;
    left: 0;
    color: var(--a1);
  }

  /* ---------- visual 2: flujo de artefactos ---------- */
  .flow {
    display: grid;
    grid-template-columns: auto auto auto auto minmax(0, 1fr);
    gap: 14px;
    align-items: center;
  }
  @media (max-width: 860px) {
    .flow {
      grid-template-columns: 1fr;
      justify-items: center;
    }
    .flow-arrow {
      transform: rotate(90deg);
    }
  }
  .flow-jobs {
    display: grid;
    gap: 10px;
  }
  .node {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    padding: 10px 16px;
    display: grid;
    gap: 2px;
    text-align: center;
  }
  .node-title {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text-1);
    font-weight: 600;
  }
  .node-sub {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--text-3);
  }
  .node.merge {
    border-color: var(--a3);
  }
  .flow-arrow {
    color: var(--a1);
    font-size: 1.2rem;
  }

  .allure-mock {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--terminal-body);
    box-shadow: var(--shadow-deep);
    min-width: 0;
    width: 100%;
  }
  .am-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    background: var(--terminal-bar);
    border-bottom: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-3);
  }
  .am-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--good);
  }
  .am-body {
    padding: 14px 16px;
    display: grid;
    gap: 10px;
  }
  .am-rate {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .am-rate b {
    font-size: 1.7rem;
    background: var(--grad);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .am-rate span {
    font-size: 0.78rem;
    color: var(--text-3);
  }
  .am-stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .am-time {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-3);
  }
  .am-track {
    height: 6px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .am-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--good);
  }

  /* ---------- visual 3: widget de veredicto ---------- */
  .verdict-widget {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 18px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
  }
  @media (max-width: 780px) {
    .verdict-widget {
      grid-template-columns: 1fr;
    }
  }
  .vw-controls {
    display: grid;
    gap: 16px;
    align-content: start;
  }
  .vw-slider {
    display: grid;
    gap: 8px;
    color: var(--text-2);
    font-size: 0.88rem;
  }
  .vw-label b {
    color: var(--text-1);
    font-family: var(--font-mono);
  }
  .vw-slider input[type='range'] {
    width: 100%;
    accent-color: var(--a1);
  }
  .vw-result {
    display: grid;
    gap: 12px;
    align-content: start;
    border-left: 1px solid var(--border);
    padding-left: 18px;
  }
  @media (max-width: 780px) {
    .vw-result {
      border-left: none;
      padding-left: 0;
      border-top: 1px solid var(--border);
      padding-top: 14px;
    }
  }
  .verdict {
    justify-self: start;
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: 1.35rem;
    letter-spacing: 0.06em;
    padding: 8px 22px;
    border-radius: 12px;
    border: 1px solid;
    transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }
  .verdict.go {
    color: var(--good);
    border-color: rgba(63, 185, 80, 0.55);
    background: rgba(63, 185, 80, 0.1);
  }
  .verdict.caution {
    color: var(--warn);
    border-color: rgba(210, 153, 34, 0.55);
    background: rgba(210, 153, 34, 0.1);
  }
  .verdict.nogo {
    color: var(--bad);
    border-color: rgba(248, 81, 73, 0.55);
    background: rgba(248, 81, 73, 0.1);
  }
  .vw-why {
    list-style: none;
    display: grid;
    gap: 6px;
  }
  .vw-why li {
    position: relative;
    padding-left: 1.2em;
    font-size: 0.82rem;
    color: var(--text-2);
  }
  .vw-why li::before {
    content: '▸';
    position: absolute;
    left: 0;
    color: var(--a1);
  }

  /* ---------- switches (mismo lenguaje visual que el cap. 6) ---------- */
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--text-2);
    font-size: 0.88rem;
    cursor: pointer;
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

  /* ---------- círculo de trazabilidad ---------- */
  .circle {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
  }
  .c-unit {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
  }
  @media (max-width: 420px) {
    /* en pantallas muy angostas el texto del chip puede partirse
       (la flecha sigue pegada a su chip: son flex items de la unidad) */
    .c-unit {
      white-space: normal;
    }
  }
  .c-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    padding: 7px 14px;
    font-size: 0.8rem;
    color: var(--text-1);
  }
  .c-icon {
    font-size: 0.95rem;
  }
  .c-arrow {
    color: var(--a1);
  }
  .c-return {
    flex-basis: 100%;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--a3);
    border-top: 1px dashed var(--border);
    padding-top: 12px;
    margin-top: 6px;
  }
</style>
