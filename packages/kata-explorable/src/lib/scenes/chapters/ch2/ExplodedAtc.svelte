<script lang="ts">
  import CodePane from '$lib/components/CodePane.svelte';
  import { atcParts, atcSample } from '$lib/content/chapters/ch2';

  /** Índice de la parte activa (hover/click/foco); null = nada iluminado. */
  let active = $state<number | null>(null);

  const activePart = $derived(active === null ? null : (atcParts[active] ?? null));
  const highlight = $derived(activePart?.lines ?? []);

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * En pantallas táctiles el navegador sintetiza mouseenter/mouseleave al
   * tocar Y al re-computar el hover tras un scroll: dejarían la selección
   * en null justo después de que el scroll lleve la línea a la vista.
   * Solo los punteros con hover real manejan el estado por ratón.
   */
  const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

  /** Contenedor del CodePane, para localizar las líneas iluminadas. */
  let codeSide = $state<HTMLDivElement | null>(null);

  // Al cambiar la parte activa, la primera línea iluminada entra en vista:
  // en móvil el panel de código puede quedar fuera de pantalla y la promesa
  // «pulsa una parte para verla en el código» se rompería sin este scroll.
  $effect(() => {
    if (active === null || !codeSide) return;
    const firstHl = codeSide.querySelector('.line.hl');
    firstHl?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  });
</script>

<div class="exploded">
  <div class="code-side" bind:this={codeSide}>
    <CodePane code={atcSample.code} title={atcSample.title} lineNumbers highlight={highlight} />
  </div>

  <div class="parts" aria-label="Las 5 partes de la pieza">
    <p class="hint" aria-hidden="true">
      {#if activePart === null}
        <span class="hint-hover">pasa el cursor por una parte para verla en el código →</span>
        <span class="hint-tap">pulsa una parte para verla en el código ↑</span>
      {:else}
        líneas {activePart.lines.at(0)}–{activePart.lines.at(-1)}
      {/if}
    </p>
    {#each atcParts as part, i (part.badge)}
      <button
        class="part"
        class:active={active === i}
        style:--i={i}
        onmouseenter={() => canHover && (active = i)}
        onmouseleave={() => canHover && (active = null)}
        onfocus={() => (active = i)}
        onblur={() => (active = null)}
        onclick={() => (active = i)}
      >
        <span class="studs" aria-hidden="true"><i></i><i></i></span>
        <span class="head">
          <span class="badge">{part.badge}</span>
          <span class="name">{part.name}</span>
        </span>
        {#if active === i}
          <span class="explain">{part.explain}</span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .exploded {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(240px, 1fr);
    gap: 28px;
    align-items: start;
  }
  .code-side {
    position: sticky;
    top: 0;
    min-width: 0;
  }

  @media (max-width: 900px) {
    .exploded {
      grid-template-columns: 1fr;
    }
    /* apilado: el código fluye como bloque normal — sticky lo dejaba pegado
       arriba y las partes se pintaban ENCIMA de las líneas de código */
    .code-side {
      position: static;
    }
  }

  .parts {
    display: flex;
    flex-direction: column;
    /* separación vertical generosa = vista «explotada» */
    gap: 26px;
    padding-top: 6px;
    min-width: 0;
  }
  .hint {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-3);
    min-height: 1.2em;
  }
  .hint-tap {
    display: none;
  }
  @media (max-width: 900px) {
    .hint-hover {
      display: none;
    }
    .hint-tap {
      display: inline;
    }
  }

  .part {
    position: relative;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px 12px;
    color: var(--text-2);
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease;
  }
  /* línea punteada que conecta las partes del despiece */
  .part:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    height: 26px;
    border-left: 2px dashed var(--border-strong);
  }
  .part:hover,
  .part.active {
    border-color: var(--a1);
    background: var(--surface-2);
    transform: translateX(-6px);
  }
  .part:focus-visible {
    outline: 2px solid var(--a1);
    outline-offset: 2px;
  }

  /* tetones de lego (pure CSS) — nacen 1px DENTRO del borde superior de la
     carta para leerse como parte del ladrillo, no como ruido flotante */
  .studs {
    position: absolute;
    top: -9px;
    left: 16px;
    display: flex;
    gap: 8px;
  }
  .studs i {
    display: block;
    width: 26px;
    height: 10px;
    border-radius: 5px 5px 0 0;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-bottom: none;
    transition: background 0.18s ease, border-color 0.18s ease;
  }
  .part:hover .studs i,
  .part.active .studs i {
    background: rgba(255, 166, 87, 0.25);
    border-color: var(--a1);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .badge {
    color: var(--a1);
    font-size: 1.05rem;
    line-height: 1;
  }
  .name {
    font-weight: 700;
    color: var(--text-1);
    font-size: 0.95rem;
  }
  .explain {
    display: block;
    margin-top: 8px;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-2);
  }

  /* overrides móviles: al final del bloque para ganar el empate de cascada
     contra las reglas base de arriba (misma especificidad) */
  @media (max-width: 900px) {
    /* conectores del despiece: sin sentido en columna única */
    .part:not(:last-child)::after {
      content: none;
    }
    .parts {
      gap: 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .part,
    .studs i {
      transition: none;
    }
    .part:hover,
    .part.active {
      transform: none;
    }
  }
</style>
