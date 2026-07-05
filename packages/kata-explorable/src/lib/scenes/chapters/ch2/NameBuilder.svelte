<script lang="ts">
  import { badNames, nameSegments } from '$lib/content/chapters/ch2';

  /** Índice de la opción elegida por segmento (verbo/Recurso/Escenario). */
  let picks = $state<number[]>([0, 0, 0]);

  const composed = $derived(
    nameSegments.map((seg, s) => seg.options[picks[s] ?? 0]?.value ?? '').join(''),
  );
</script>

<div class="builder">
  <div class="segments">
    {#each nameSegments as seg, s (seg.key)}
      <div class="segment">
        <p class="seg-title">{seg.title}</p>
        <div class="options">
          {#each seg.options as opt, o (opt.label)}
            <button
              class="opt"
              class:picked={picks[s] === o}
              onclick={() => (picks[s] = o)}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="result">
    <code class="name">{composed}<span class="paren">(…)</span></code>
    <span class="tag ok">sigue la convención</span>
  </div>

  <div class="bad">
    <p class="kicker">los que NO</p>
    <ul class="blist">
      {#each badNames as bn (bn.name)}
        <li><code class="bad-name">{bn.name}</code> → {bn.reason}</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .builder {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .segments {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  @media (max-width: 760px) {
    .segments {
      grid-template-columns: 1fr;
    }
  }
  .segment {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
  }
  .seg-title {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--a1);
    margin-bottom: 10px;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .opt {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    text-align: left;
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 12px;
    color: var(--text-2);
    transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
  }
  .opt:hover {
    border-color: var(--border-strong);
    color: var(--text-1);
  }
  .opt.picked {
    border-color: var(--a1);
    background: rgba(255, 166, 87, 0.1);
    color: var(--text-1);
  }
  .opt:focus-visible {
    outline: 2px solid var(--a1);
    outline-offset: 2px;
  }

  .result {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    background: var(--terminal-body);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 18px;
  }
  .name {
    font-size: 1.05rem;
    color: var(--syn-function);
    font-weight: 700;
  }
  .paren {
    color: var(--text-3);
    font-weight: 400;
  }

  .bad-name {
    color: var(--bad);
    font-size: 0.85rem;
  }
  .bad .kicker {
    margin-bottom: 8px;
  }

  @media (max-width: 760px) {
    /* tokens mono largos (loginUserWithInvalidCredentials) no caben en 355px:
       se permite el corte intra-palabra en vez de desbordar el flujo */
    .result {
      min-width: 0;
    }
    .name,
    .bad-name,
    .opt {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .opt {
      transition: none;
    }
  }
</style>
