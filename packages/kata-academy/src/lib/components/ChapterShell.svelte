<script lang="ts">
  import type { ChapterMeta } from '$lib/content/types';
  import { nav } from '$lib/state/nav.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    meta: ChapterMeta;
    children: Snippet;
  }

  const { meta, children }: Props = $props();

  const accentVar = $derived(`var(--${meta.accent})`);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let bodyEl = $state<HTMLDivElement | null>(null);

  /* ------------------------------------------------------------------
     Modo presentación: las flechas recorren las secciones del capítulo
     (los h2 dentro de .body). Sin h2: avanza/retrocede ~80% de viewport.
  ------------------------------------------------------------------ */

  function sectionTops(el: HTMLDivElement): number[] {
    const bodyRect = el.getBoundingClientRect();
    return Array.from(el.querySelectorAll<HTMLElement>('h2')).map(
      (h) => h.getBoundingClientRect().top - bodyRect.top + el.scrollTop
    );
  }

  function stepSection(dir: 1 | -1) {
    const el = bodyEl;
    if (!el) return;
    const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth';
    const tops = sectionTops(el);
    if (tops.length === 0) {
      el.scrollBy({ top: dir * el.clientHeight * 0.8, behavior });
      return;
    }
    const EPS = 8;
    const cur = el.scrollTop;
    /** Pequeño aire por encima del heading al aterrizar. */
    const pad = 10;
    if (dir === 1) {
      const next = tops.find((t) => t - pad > cur + EPS);
      el.scrollTo({ top: next !== undefined ? Math.max(next - pad, 0) : el.scrollHeight, behavior });
    } else {
      const prev = [...tops].reverse().find((t) => t - pad < cur - EPS);
      el.scrollTo({ top: prev !== undefined ? Math.max(prev - pad, 0) : 0, behavior });
    }
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    return (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable
    );
  }

  function onKeydown(event: KeyboardEvent) {
    if (!nav.presentation) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepSection(1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      stepSection(-1);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<article class="chapter" style:--chapter-accent={accentVar}>
  <header>
    <button class="back" onclick={() => nav.goMap()} aria-label="Volver al mapa">
      <span class="arrow">←</span> mapa
    </button>
    <div class="heading">
      <p class="kicker">
        capítulo {meta.num} · {meta.kicker}
        <span class="mn-sep">·</span>
        <span class="mn-anchor">{meta.mnemonic.icon} {meta.mnemonic.anchor}</span>
      </p>
      <h1>{meta.title}</h1>
    </div>
    <div class="progress" title="Progreso de la exploración">
      <span class="bar" style:width={`${Math.round(nav.progress * 100)}%`}></span>
    </div>
  </header>

  <div class="body" bind:this={bodyEl}>
    {@render children()}
  </div>

  <footer>
    {#if nav.prevChapter}
      <button class="btn" onclick={() => nav.goChapter(nav.prevChapter!.id)}>
        ← {nav.prevChapter.title}
      </button>
    {:else}
      <span></span>
    {/if}
    {#if nav.nextChapter}
      <button class="btn primary" onclick={() => nav.goChapter(nav.nextChapter!.id)}>
        {nav.nextChapter.title} →
      </button>
    {:else}
      <button class="btn primary" onclick={() => nav.goMap()}>Volver al mapa 🗺</button>
    {/if}
  </footer>
</article>

<style>
  .chapter {
    height: 100%;
    display: flex;
    flex-direction: column;
    max-width: 1160px;
    margin: 0 auto;
    padding: 28px 48px 20px;
  }
  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 24px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--border);
  }
  .back {
    background: none;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-2);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    padding: 7px 16px;
    transition: border-color 0.15s ease, color 0.15s ease;
  }
  .back:hover {
    border-color: var(--chapter-accent);
    color: var(--text-1);
  }
  .arrow {
    color: var(--chapter-accent);
  }
  .mn-anchor {
    white-space: nowrap;
    color: var(--chapter-accent);
  }
  .heading h1 {
    font-size: 1.7rem;
    margin-top: 2px;
  }
  .progress {
    width: 130px;
    height: 5px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .progress .bar {
    display: block;
    height: 100%;
    background: var(--grad);
    border-radius: 999px;
    transition: width 0.4s ease;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 26px 6px 26px 0;
  }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }

  /* ---------- modo presentación: sin chrome, texto más grande ---------- */
  :global(main.presentation) .back,
  :global(main.presentation) .progress,
  :global(main.presentation) footer {
    display: none;
  }
  :global(main.presentation) header {
    grid-template-columns: 1fr;
  }
  :global(main.presentation) .chapter {
    font-size: 1.22em;
  }
  :global(main.presentation) .body {
    padding-bottom: 48px;
  }

  /* ---------- móvil ---------- */
  @media (max-width: 640px) {
    .chapter {
      padding: 14px 16px 12px;
    }
    header {
      grid-template-columns: auto 1fr;
      grid-template-areas:
        'back progress'
        'heading heading';
      gap: 12px 16px;
      padding-bottom: 12px;
    }
    .back {
      grid-area: back;
    }
    .progress {
      grid-area: progress;
      justify-self: end;
      width: 100px;
    }
    .heading {
      grid-area: heading;
    }
    .heading h1 {
      font-size: 1.25rem;
    }
    /* el anclaje mnemotécnico baja a su propia línea (sin el separador) */
    .mn-sep {
      display: none;
    }
    .mn-anchor {
      display: block;
    }
    .body {
      padding: 18px 2px 40px 0;
    }
    footer {
      flex-wrap: wrap;
      gap: 10px;
      padding-top: 10px;
    }
    footer .btn {
      font-size: 0.82rem;
      padding: 8px 14px;
    }
    :global(main.presentation) header {
      grid-template-areas: 'heading heading';
    }
  }
</style>
