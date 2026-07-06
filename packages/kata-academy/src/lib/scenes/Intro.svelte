<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fade, scale } from 'svelte/transition';
  import { nav } from '$lib/state/nav.svelte';

  /* ------------------------------------------------------------------
     Escena de apertura — cinemática en 3 beats:
       1. una terminal teclea un spec "espagueti" (anti-ejemplo)
       2. se ejecuta y falla (rojo, flaky, shake)
       3. el caos se disuelve en la portada KATA
     Saltable siempre; auto-avanza si nadie interactúa (< ~15 s).
     Con prefers-reduced-motion: paneles estáticos, sin typewriter.
  ------------------------------------------------------------------ */

  type Beat = 'typing' | 'ready' | 'running' | 'failed' | 'title';

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Anti-example: invented on purpose (CONTENT-SOURCE §5.1) — the ONLY
     code the academy is allowed to make up. Every smell is deliberate:
     repeated selectors, waitForTimeout, hardcoded credentials, the login
     block copy-pasted twice, zero structure, zero traceability. */
  const SPAGHETTI: string[] = [
    '// login-checkout-final-v3.spec.ts (nobody remembers v1 or v2)',
    "import { test, expect } from '@playwright/test';",
    '',
    "test('test1', async ({ page }) => {",
    "  await page.goto('https://staging.shop.example/login');",
    '  await page.waitForTimeout(3000);',
    "  await page.fill('#email', 'admin@shop.example');",
    "  await page.fill('#password', 'Sup3rS3cret!2024');",
    '  await page.click(\'button[type="submit"]\');',
    '  await page.waitForTimeout(3000);',
    "  await page.click('.product-card:nth-child(2) > div > button');",
    '  await page.waitForTimeout(2000);',
    "  await page.click('#cart-icon');",
    "  await page.click('.checkout-btn');",
    '  await page.waitForTimeout(5000);',
    "  expect(page.url()).toContain('/success');",
    '});',
    '',
    "test('test2 copy of test1', async ({ page }) => {",
    '  // TODO: refactor someday',
    "  await page.goto('https://staging.shop.example/login');",
    '  await page.waitForTimeout(3000);',
    "  await page.fill('#email', 'admin@shop.example');",
    "  await page.fill('#password', 'Sup3rS3cret!2024');",
    '  await page.click(\'button[type="submit"]\');',
    '  await page.waitForTimeout(3000);',
    "  await page.click('#profile-menu > ul > li:nth-child(4) > a');",
    '  await page.waitForTimeout(2000);',
    "  expect(await page.textContent('.user-name')).toBe('Admin');",
    '});',
  ];

  const RUN_OUTPUT: string[] = [
    '$ npx playwright test login-checkout-final-v3.spec.ts',
    'Running 2 tests using 1 worker',
    '  ✓  test1 (18.4s)',
    '  ✘  test2 copy of test1 (31.2s)',
    '     TimeoutError: page.click: Timeout 30000ms exceeded.',
    '     waiting for selector "#profile-menu > ul > li:nth-child(4) > a"',
    '  1 failed, 1 passed (49.8s)',
  ];

  let beat = $state<Beat>(reducedMotion ? 'failed' : 'typing');
  let typedLines = $state<string[]>(reducedMotion ? [...SPAGHETTI] : []);
  let currentLine = $state('');
  let outputLines = $state<string[]>(reducedMotion ? [...RUN_OUTPUT] : []);
  let bodyEl = $state<HTMLDivElement | null>(null);

  /* ---------- beat 1: typewriter ---------- */
  $effect(() => {
    if (beat !== 'typing') return;
    let lineIdx = 0;
    let charIdx = 0;
    const id = setInterval(() => {
      const line = SPAGHETTI[lineIdx];
      if (line === undefined) {
        clearInterval(id);
        beat = 'ready';
        return;
      }
      charIdx += 3;
      if (charIdx >= line.length) {
        typedLines = [...typedLines, line];
        currentLine = '';
        lineIdx += 1;
        charIdx = 0;
      } else {
        currentLine = line.slice(0, charIdx);
      }
    }, 14);
    return () => clearInterval(id);
  });

  /* ---------- beat 2: run output ---------- */
  $effect(() => {
    if (beat !== 'running') return;
    let i = 0;
    const id = setInterval(() => {
      const line = RUN_OUTPUT[i];
      if (line === undefined) {
        clearInterval(id);
        beat = 'failed';
        return;
      }
      outputLines = [...outputLines, line];
      i += 1;
    }, 360);
    return () => clearInterval(id);
  });

  /* ---------- auto-advance (only with motion enabled) ---------- */
  $effect(() => {
    if (reducedMotion) return;
    if (beat === 'ready') {
      const t = setTimeout(() => (beat = 'running'), 1200);
      return () => clearTimeout(t);
    }
    if (beat === 'failed') {
      const t = setTimeout(() => (beat = 'title'), 2800);
      return () => clearTimeout(t);
    }
  });

  /* ---------- auto-scroll of the terminal body ---------- */
  $effect(() => {
    void typedLines.length;
    void currentLine;
    void outputLines.length;
    if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
  });

  function run() {
    if (beat === 'ready') beat = 'running';
  }

  function skipToTitle() {
    beat = 'title';
  }

  /* ---------- tiny per-line tokenizer (completed lines only) ---------- */
  interface Tok {
    text: string;
    cls: string;
  }

  function tokenize(line: string): Tok[] {
    if (line.trimStart().startsWith('//')) return [{ text: line, cls: 'tok-comment' }];
    const re = /('[^']*')|\b(waitForTimeout)\b|\b(await|async|const|import|from)\b|\b(test|expect|page)\b/g;
    const toks: Tok[] = [];
    let last = 0;
    for (let m = re.exec(line); m !== null; m = re.exec(line)) {
      if (m.index > last) toks.push({ text: line.slice(last, m.index), cls: '' });
      const cls = m[1] ? 'tok-string' : m[2] ? 'tok-smell' : m[3] ? 'tok-keyword' : 'tok-fn';
      toks.push({ text: m[0], cls });
      last = m.index + m[0].length;
    }
    if (last < line.length) toks.push({ text: line.slice(last), cls: '' });
    return toks;
  }

  function outCls(line: string): string {
    if (line.startsWith('$')) return 'out-cmd';
    if (line.includes('✓')) return 'out-ok';
    if (line.includes('✘') || line.includes('failed')) return 'out-bad';
    if (line.includes('TimeoutError') || line.includes('waiting for')) return 'out-err';
    return 'out-dim';
  }
</script>

<section class="intro">
  {#if beat !== 'title'}
    <button class="skip" onclick={skipToTitle}>saltar intro ↦</button>

    <div
      class="chaos"
      out:scale={{ duration: reducedMotion ? 0 : 550, start: 1.05, easing: cubicOut }}
    >
      <p class="kicker">así se ve la automatización sin arquitectura</p>

      <div class="terminal" class:failed={beat === 'failed'}>
        <div class="terminal-bar">
          <span class="dot r"></span>
          <span class="dot y"></span>
          <span class="dot g"></span>
          <span class="title">login-checkout-final-v3.spec.ts</span>
          <button
            class="run"
            class:armed={beat === 'ready'}
            disabled={beat !== 'ready'}
            onclick={run}
          >
            ▶ RUN
          </button>
        </div>

        <div class="body" bind:this={bodyEl}>
          {#each typedLines as line, i (i)}
            <div class="code-line">
              {#each tokenize(line) as tok, j (j)}<span class={tok.cls}>{tok.text}</span>{/each}
            </div>
          {/each}
          {#if beat === 'typing'}
            <div class="code-line">{currentLine}<span class="cursor"></span></div>
          {/if}

          {#if outputLines.length > 0}
            <div class="out-sep"></div>
            {#each outputLines as line, i (i)}
              <div class="code-line {outCls(line)}">{line}</div>
            {/each}
          {/if}
        </div>
      </div>

      {#if beat === 'failed'}
        <div class="fail-note" in:fade={{ duration: reducedMotion ? 0 : 250 }}>
          <p>
            Flaky: ayer pasó, hoy no. Selectores repetidos, esperas mágicas,
            credenciales a la vista — y cero trazabilidad.
          </p>
          <button class="btn" onclick={skipToTitle}>Continuar →</button>
        </div>
      {/if}
    </div>
  {:else}
    <div
      class="title-beat"
      in:fade={{ duration: reducedMotion ? 0 : 450, delay: reducedMotion ? 0 : 250 }}
    >
      <p class="kicker">una arquitectura de pruebas automatizadas</p>
      <h1><span class="grad">KATA</span></h1>
      <p class="tagline">
        Casos de prueba como recetas de un restaurante:<br />
        se perfeccionan una vez, se sirven en cualquier menú.
      </p>
      <button class="btn primary" onclick={() => nav.goMap()}>▶ Entrar al mapa</button>
    </div>
  {/if}
</section>

<style>
  .intro {
    position: relative;
    height: 100%;
    overflow: hidden;
    background:
      radial-gradient(55% 45% at 50% 30%, rgba(255, 166, 87, 0.08), transparent 65%),
      var(--bg);
  }

  .skip {
    position: absolute;
    top: 22px;
    right: 26px;
    z-index: 3;
    background: none;
    border: none;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: var(--text-3);
    transition: color 0.15s ease;
  }
  .skip:hover {
    color: var(--a1);
  }

  .chaos,
  .title-beat {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    text-align: center;
    padding: 24px;
  }

  /* ---------- beats 1-2: la terminal del caos ---------- */
  .terminal {
    width: min(780px, 94vw);
    text-align: left;
    transition: border-color 0.25s ease;
  }
  .terminal.failed {
    border-color: rgba(248, 81, 73, 0.55);
    box-shadow:
      var(--shadow-deep),
      0 0 36px rgba(248, 81, 73, 0.14);
    animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97);
  }
  @keyframes shake {
    10%,
    90% {
      transform: translateX(-2px);
    }
    20%,
    80% {
      transform: translateX(4px);
    }
    30%,
    50%,
    70% {
      transform: translateX(-6px);
    }
    40%,
    60% {
      transform: translateX(6px);
    }
  }

  .terminal-bar .run {
    margin-left: auto;
    flex-shrink: 0;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--good);
    background: transparent;
    border: 1px solid rgba(63, 185, 80, 0.45);
    border-radius: 6px;
    padding: 2px 10px;
    opacity: 0.35;
    transition:
      opacity 0.2s ease,
      background 0.2s ease;
  }
  .terminal-bar .run.armed {
    opacity: 1;
    animation: run-pulse 1.1s ease-in-out infinite;
    cursor: pointer;
  }
  .terminal-bar .run.armed:hover {
    background: rgba(63, 185, 80, 0.14);
  }
  /* mientras no está armado, el chip es decorativo: apagado, gris y sin
     cursor de acción para que no parezca tocable */
  .terminal-bar .run:disabled {
    cursor: default;
    pointer-events: none;
    color: var(--text-3);
    border-color: var(--border);
  }
  @keyframes run-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(63, 185, 80, 0.35);
    }
    50% {
      box-shadow: 0 0 0 5px rgba(63, 185, 80, 0);
    }
  }

  .body {
    max-height: min(52vh, 460px);
    overflow-y: auto;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px 18px;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    line-height: 1.55;
  }
  .code-line {
    white-space: pre;
    min-height: 1.55em;
    color: var(--text-2);
  }
  .tok-comment {
    color: var(--syn-comment);
    font-style: italic;
  }
  .tok-string {
    color: var(--syn-string);
  }
  .tok-keyword {
    color: var(--syn-keyword);
  }
  .tok-fn {
    color: var(--syn-function);
  }
  .tok-smell {
    color: var(--bad);
    text-decoration: underline wavy rgba(248, 81, 73, 0.55);
    text-underline-offset: 3px;
  }

  .cursor {
    display: inline-block;
    width: 7px;
    height: 1.05em;
    margin-left: 2px;
    vertical-align: text-bottom;
    background: var(--a1);
    animation: blink 0.9s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .out-sep {
    height: 1px;
    margin: 10px 0;
    background: var(--border);
  }
  .out-cmd {
    color: var(--text-1);
  }
  .out-ok {
    color: var(--good);
  }
  .out-bad {
    color: var(--bad);
    font-weight: 700;
  }
  .out-err {
    color: rgba(248, 81, 73, 0.75);
  }
  .out-dim {
    color: var(--text-3);
  }

  .fail-note {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 620px;
  }
  .fail-note p {
    color: var(--text-2);
    font-size: 0.9rem;
  }

  /* ---------- beat 3: portada ---------- */
  .title-beat h1 {
    font-size: clamp(4rem, 12vw, 8rem);
    letter-spacing: -0.04em;
  }
  .tagline {
    color: var(--text-2);
    font-size: 1.05rem;
    line-height: 1.7;
  }
  .title-beat .btn {
    margin-top: 14px;
  }
  .title-beat > * {
    animation: rise-in 0.6s cubic-bezier(0.22, 0.9, 0.35, 1) both;
  }
  .title-beat > :nth-child(2) {
    animation-delay: 0.1s;
  }
  .title-beat > :nth-child(3) {
    animation-delay: 0.22s;
  }
  .title-beat > :nth-child(4) {
    animation-delay: 0.34s;
  }
  @keyframes rise-in {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  /* ---------- móvil ---------- */
  @media (max-width: 640px) {
    .chaos,
    .title-beat {
      padding: 20px 12px;
    }
    .terminal {
      width: 100%;
    }
    .body {
      font-size: 0.66rem;
      padding: 12px 12px;
    }
    /* zonas táctiles más generosas */
    .skip {
      top: 12px;
      right: 10px;
      padding: 10px 12px;
    }
    .terminal-bar .run {
      padding: 6px 12px;
    }
    /* el nombre del spec cabe en una línea (más pequeño y con elipsis) */
    .terminal-bar .title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      font-size: 0.66rem;
    }
    .fail-note p {
      font-size: 0.85rem;
    }
    .tagline {
      font-size: 0.95rem;
    }
  }

  /* ---------- reduced motion: paneles estáticos ---------- */
  @media (prefers-reduced-motion: reduce) {
    .terminal.failed {
      animation: none;
    }
    .cursor,
    .terminal-bar .run.armed {
      animation: none;
    }
    .title-beat > * {
      animation: none;
    }
  }
</style>
