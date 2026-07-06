<script lang="ts">
  import Term from '$lib/components/Term.svelte';
  import RuleGame from './ch7/RuleGame.svelte';
  import { fly } from 'svelte/transition';

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const enter = (i: number) =>
    reduced ? { duration: 0 } : { y: 18, duration: 420, delay: 90 * i };
</script>

<div class="ch7">
  <section in:fly={enter(0)}>
    <p class="kicker">por qué hay reglas</p>
    <p>
      Las reglas de oro no son burocracia: <strong>protegen la reutilización</strong>.
      Una pieza mal cortada — un click disfrazado de caso, un ATC que llama a otro, tres
      piezas para el mismo resultado — deja de encajar, y todo el que la usa hereda el
      problema. Las cadenas reutilizables van a <Term t="steps">Steps</Term>; la caja de
      herramientas la entrega el <Term t="fixture">fixture</Term>; y cada pieza guarda su
      forma. El criterio se entrena juzgando casos, así que… a jugar.
    </p>
    <div class="callout">
      <strong>¿Es un ATC válido?</strong> Te mostramos una carta con código real (o casi).
      Tú decides si respeta las reglas de oro — y la carta te revela el veredicto y la
      regla implicada.
    </div>
  </section>

  <section in:fly={enter(1)}>
    <RuleGame />
  </section>
</div>

<style>
  .ch7 {
    display: flex;
    flex-direction: column;
    gap: 34px;
    max-width: 1080px;
  }
  section > p {
    color: var(--text-2);
    max-width: 74ch;
    margin: 6px 0 14px;
  }
</style>
