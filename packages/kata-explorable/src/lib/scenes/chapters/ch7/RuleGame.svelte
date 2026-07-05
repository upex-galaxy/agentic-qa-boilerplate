<script lang="ts">
  import CodePane from '$lib/components/CodePane.svelte';
  import { goldenRules, ruleCards } from '$lib/content/chapters/ch7';
  import { tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const total = ruleCards.length;

  /** Índice de la carta en juego. */
  let current = $state(0);
  /** Respuesta del usuario por carta (true = «ATC válido»); null = sin responder. */
  let answers = $state<(boolean | null)[]>(Array.from({ length: total }, () => null));
  let finished = $state(false);

  const card = $derived(ruleCards[current] ?? ruleCards[0]!);
  const answered = $derived(answers[current] !== null && answers[current] !== undefined);
  const hits = $derived(
    answers.reduce<number>(
      (acc, a, i) => acc + (a !== null && a === ruleCards[i]?.valid ? 1 : 0),
      0,
    ),
  );
  const answeredCount = $derived(answers.filter((a) => a !== null).length);
  const isCorrect = $derived(answered && answers[current] === card.valid);

  /** Bloque de veredicto de la carta actual (para traerlo a la vista). */
  let revealEl = $state<HTMLElement>();

  async function answer(saysValid: boolean) {
    if (answers[current] !== null) return;
    answers[current] = saysValid;
    // El veredicto + «Siguiente carta» aparecen bajo el pliegue: los acercamos.
    await tick();
    revealEl?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }

  function next() {
    if (current < total - 1) {
      current += 1;
    } else {
      finished = true;
    }
  }

  function restart() {
    answers = Array.from({ length: total }, () => null);
    current = 0;
    finished = false;
  }
</script>

<div class="game">
  <div class="scoreboard">
    <span class="tag">carta {Math.min(current + 1, total)}/{total}</span>
    <span class="tag" class:ok={hits > 0}>aciertos {hits}/{answeredCount}</span>
  </div>

  {#if !finished}
    {#key current}
      <div
        class="card"
        class:verdict-ok={answered && card.valid}
        class:verdict-no={answered && !card.valid}
        in:fly={reduced ? { duration: 0 } : { y: 16, duration: 320 }}
      >
        <h3>{card.title}</h3>

        {#if card.snippet}
          <CodePane code={card.snippet.code} title={card.snippet.title} />
        {:else if card.scenario}
          <p class="scenario">{card.scenario}</p>
        {/if}

        {#if !answered}
          <div class="actions">
            <button class="btn" onclick={() => answer(true)}>✔ ATC válido</button>
            <button class="btn" onclick={() => answer(false)}>✘ Viola una regla</button>
          </div>
        {:else}
          <div
            class="reveal"
            bind:this={revealEl}
            in:fade={reduced ? { duration: 0 } : { duration: 260 }}
          >
            <p class="result" class:hit={isCorrect} class:miss={!isCorrect}>
              {isCorrect ? '¡Acierto!' : 'Casi —'}
              {#if card.valid}
                <span class="tag ok">✔ ATC válido</span>
              {:else}
                <span class="tag no">✘ viola la regla {card.ruleNum}</span>
              {/if}
            </p>
            <p class="rule">
              <strong>Regla {card.ruleNum} — {card.ruleLabel}.</strong>
              {card.why}
            </p>
            <button class="btn primary" onclick={next}>
              {current < total - 1 ? 'Siguiente carta →' : 'Ver mi resultado'}
            </button>
          </div>
        {/if}
      </div>
    {/key}
  {:else}
    <div class="end" in:fly={reduced ? { duration: 0 } : { y: 16, duration: 360 }}>
      <p class="kicker">resultado</p>
      <h3>
        {hits}/{total} aciertos —
        {#if hits === total}
          criterio de arquitecto. Nada se te escapa.
        {:else if hits >= total * 0.7}
          buen ojo. Las que fallaste son justo las trampas clásicas.
        {:else}
          las reglas se aprenden jugando: revísalas abajo y vuelve a intentar.
        {/if}
      </h3>
      <button class="btn" onclick={restart}>↻ Jugar otra vez</button>
    </div>
  {/if}

  <!-- referencia permanente: visible durante el juego y tras reiniciar -->
  <div class="rules-ref">
    <p class="kicker">las 12 reglas de oro, para consulta</p>
    <ol class="blist">
      {#each goldenRules as rule, i (i)}
        <li><strong>{i + 1}.</strong> {rule}</li>
      {/each}
    </ol>
  </div>
</div>

<style>
  .game {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 860px;
  }
  .scoreboard {
    display: flex;
    gap: 10px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: border-color 0.25s ease;
  }
  .card.verdict-ok {
    border-color: rgba(63, 185, 80, 0.55);
  }
  .card.verdict-no {
    border-color: rgba(248, 81, 73, 0.55);
  }
  .card h3 {
    font-size: 1.05rem;
  }
  .scenario {
    color: var(--text-2);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .reveal {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px dashed var(--border-strong);
    padding-top: 14px;
  }
  .result {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
  }
  .result.hit {
    color: var(--good);
  }
  .result.miss {
    color: var(--warn);
  }
  .rule {
    color: var(--text-2);
    font-size: 0.92rem;
    max-width: 70ch;
  }
  .rule strong {
    color: var(--text-1);
  }
  .reveal .btn {
    align-self: flex-start;
  }

  .end {
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 22px 24px;
  }
  .end h3 {
    font-size: 1.15rem;
    max-width: 46ch;
  }
  .end > .btn {
    align-self: flex-start;
  }
  .rules-ref {
    margin-top: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 22px;
  }
  .rules-ref .kicker {
    margin-bottom: 10px;
  }
  .rules-ref li {
    font-size: 0.88rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      transition: none;
    }
  }
</style>
