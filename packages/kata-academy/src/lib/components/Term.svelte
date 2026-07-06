<script lang="ts">
  import { lookupTerm } from '$lib/content/glossary';
  import type { Snippet } from 'svelte';

  interface Props {
    /** Clave del glosario (término o alias). */
    t: string;
    children?: Snippet;
  }

  const { t, children }: Props = $props();

  const entry = $derived(lookupTerm(t));
  let open = $state(false);

  let termEl = $state<HTMLElement | null>(null);
  let popEl = $state<HTMLElement | null>(null);

  /**
   * El popover usa position:fixed y se posiciona midiendo el término:
   * así escapa de cualquier ancestro con overflow hidden/auto y se
   * "clampa" a los bordes del viewport (nunca se recorta). La flecha
   * se desplaza para seguir apuntando a la palabra.
   */
  $effect(() => {
    if (!open || !popEl || !termEl) return;

    const MARGIN = 12;
    const GAP = 10;
    const termRect = termEl.getBoundingClientRect();
    const popRect = popEl.getBoundingClientRect();

    const idealLeft = termRect.left + termRect.width / 2 - popRect.width / 2;
    const left = Math.min(
      Math.max(idealLeft, MARGIN),
      window.innerWidth - popRect.width - MARGIN
    );

    let top = termRect.top - popRect.height - GAP;
    let below = false;
    if (top < MARGIN) {
      top = termRect.bottom + GAP;
      below = true;
    }

    // La flecha apunta al centro de la palabra (limitada a los bordes
    // redondeados del popover).
    const arrowX = Math.min(
      Math.max(termRect.left + termRect.width / 2 - left, 18),
      popRect.width - 18
    );

    popEl.style.left = `${left}px`;
    popEl.style.top = `${top}px`;
    popEl.style.setProperty('--arrow-x', `${arrowX}px`);
    popEl.classList.toggle('below', below);
    popEl.style.visibility = 'visible';

    // Si el contenedor hace scroll, la posición fija quedaría huérfana:
    // se cierra al primer scroll.
    const onScroll = () => (open = false);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  });
</script>

{#if entry}
  <span
    bind:this={termEl}
    class="term"
    role="button"
    tabindex="0"
    aria-expanded={open}
    onpointerenter={(e) => {
      if (e.pointerType === 'mouse') open = true;
    }}
    onpointerleave={(e) => {
      if (e.pointerType === 'mouse') open = false;
    }}
    onfocus={() => (open = true)}
    onblur={() => (open = false)}
    onclick={() => (open = true)}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open = !open;
      }
      if (e.key === 'Escape') open = false;
    }}
  >
    {#if children}{@render children()}{:else}{t}{/if}
  </span>
  {#if open}
    <span bind:this={popEl} class="pop" role="tooltip">
      <span class="pop-term">{entry.term}</span>
      {entry.short}
    </span>
  {/if}
{:else}
  <!-- término sin entrada: se muestra sin popover para no romper el texto -->
  {#if children}{@render children()}{:else}{t}{/if}
{/if}

<style>
  .term {
    cursor: help;
    color: var(--text-1);
    border-bottom: 1px dashed var(--a1);
    outline: none;
  }
  .term:focus-visible {
    border-radius: 3px;
    box-shadow: 0 0 0 2px rgba(255, 166, 87, 0.45);
  }
  .pop {
    position: fixed;
    /* fuera de pantalla hasta que el $effect mide y coloca */
    top: -9999px;
    left: -9999px;
    visibility: hidden;
    width: min(340px, calc(100vw - 24px));
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--text-2);
    box-shadow: var(--shadow-deep);
    z-index: 80;
    animation: pop-in 0.16s ease;
    cursor: default;
    pointer-events: none;
  }
  /* flecha: abajo del popover (apunta a la palabra) */
  .pop::after {
    content: '';
    position: absolute;
    top: 100%;
    left: var(--arrow-x, 50%);
    transform: translateX(-50%);
    border: 7px solid transparent;
    border-top-color: var(--border-strong);
  }
  /* variante: popover DEBAJO de la palabra → flecha arriba */
  .pop:global(.below)::after {
    top: auto;
    bottom: 100%;
    border-top-color: transparent;
    border-bottom-color: var(--border-strong);
  }
  .pop-term {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--a1);
    margin-bottom: 4px;
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pop {
      animation: none;
    }
  }
</style>
