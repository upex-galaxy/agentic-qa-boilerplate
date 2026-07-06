<script lang="ts">
  import { fade } from 'svelte/transition';
  import ChapterShell from '$lib/components/ChapterShell.svelte';
  import { chapterLoaders, chapterMeta } from '$lib/content/chapters/registry';
  import type { ChapterId } from '$lib/content/types';
  import Intro from '$lib/scenes/Intro.svelte';
  import KataMap from '$lib/scenes/KataMap.svelte';
  import { nav } from '$lib/state/nav.svelte';

  const isChapter = $derived(nav.scene !== 'intro' && nav.scene !== 'map');

  /* ---------- modo presentación (tecla P) ---------- */

  /**
   * Toast de ayuda: solo la PRIMERA vez que el modo está activo CON un
   * capítulo en pantalla (en intro/mapa las flechas no hacen nada, así que
   * mostrarlo ahí quemaba la única oportunidad del aviso).
   */
  let toastVisible = $state(false);
  let toastShown = false;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!nav.presentation || !isChapter || toastShown) return;
    toastShown = true;
    toastVisible = true;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastVisible = false), 2500);
  });

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
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== 'p' && event.key !== 'P') return;
    if (isTypingTarget(event.target)) return;
    nav.togglePresentation();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<main class:presentation={nav.presentation}>
  {#if nav.scene === 'intro'}
    <div class="scene" transition:fade={{ duration: 300 }}>
      <Intro />
    </div>
  {:else if nav.scene === 'map'}
    <div class="scene" transition:fade={{ duration: 350 }}>
      <KataMap />
    </div>
  {:else if isChapter}
    {@const id = nav.scene as ChapterId}
    {#key id}
      <div class="scene" transition:fade={{ duration: 350 }}>
        {#await chapterLoaders[id]()}
          <div class="loading" aria-busy="true">
            <span class="kicker">cargando capítulo…</span>
          </div>
        {:then mod}
          {@const Scene = mod.default}
          <ChapterShell meta={chapterMeta(id)}>
            <Scene />
          </ChapterShell>
        {/await}
      </div>
    {/key}
  {/if}

  {#if nav.presentation}
    <div class="rec-badge" transition:fade={{ duration: 200 }}>
      <span class="rec-dot">●</span> REC · modo presentación (P para salir)
    </div>
  {/if}
  {#if toastVisible}
    <div class="rec-toast" transition:fade={{ duration: 300 }}>
      <strong>Modo presentación</strong> — P: salir · ↓ → / ↑ ←: recorrer las secciones del capítulo
    </div>
  {/if}
</main>

<style>
  main {
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  .scene {
    position: absolute;
    inset: 0;
  }
  .loading {
    height: 100%;
    display: grid;
    place-items: center;
  }

  /* ---------- modo presentación: badge + toast ---------- */
  .rec-badge {
    position: fixed;
    right: 14px;
    bottom: 12px;
    z-index: 60;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    color: var(--text-3);
    opacity: 0.55;
    pointer-events: none;
    user-select: none;
  }
  .rec-dot {
    color: var(--bad);
  }
  .rec-toast {
    position: fixed;
    left: 50%;
    bottom: 48px;
    transform: translateX(-50%);
    z-index: 61;
    max-width: min(92vw, 560px);
    padding: 10px 18px;
    background: rgba(13, 17, 23, 0.88);
    border: 1px solid var(--border);
    border-radius: 999px;
    backdrop-filter: blur(6px);
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--text-2);
    text-align: center;
    pointer-events: none;
  }
  .rec-toast strong {
    color: var(--text-1);
  }
</style>
