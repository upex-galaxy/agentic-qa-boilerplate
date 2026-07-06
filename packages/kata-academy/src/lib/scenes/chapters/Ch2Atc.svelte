<script lang="ts">
  import CodePane from '$lib/components/CodePane.svelte';
  import Term from '$lib/components/Term.svelte';
  import { helperSample, uiSample } from '$lib/content/chapters/ch2';
  import ExplodedAtc from './ch2/ExplodedAtc.svelte';
  import NameBuilder from './ch2/NameBuilder.svelte';
  import { fly } from 'svelte/transition';

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Transición de entrada escalonada; se anula con reduced-motion. */
  const enter = (i: number) =>
    reduced ? { duration: 0 } : { y: 18, duration: 420, delay: 90 * i };
</script>

<div class="ch2">
  <section in:fly={enter(0)}>
    <p class="kicker">la unidad mínima de KATA</p>
    <p>
      <Term t="atc">ATC</Term> significa <strong>Acceptance Test Case</strong> — caso de
      prueba de aceptación. Ojo: <em>no</em> «Automated Test Case». La diferencia importa,
      porque define qué cabe dentro de la pieza:
    </p>
    <blockquote class="callout">
      <strong>Un ATC no es un click; es un caso de prueba completo empaquetado como
      <Term t="método">método</Term>.</strong> Preparación, acción, verificación y
      aserciones fijas — todo viaja junto, como una pieza de lego que se fabrica una
      vez y se encaja mil veces.
    </blockquote>
  </section>

  <section in:fly={enter(1)}>
    <p class="kicker">despiece de la pieza</p>
    <h2>La anatomía, explotada</h2>
    <p>
      Este es un ATC real del boilerplate: el login exitoso por API. Explora cada parte del
      despiece y mira qué líneas ocupa dentro del código. El
      <Term t="decorador">decorador</Term> de arriba es su identidad; todo lo demás es el
      caso de prueba en sí.
    </p>
    <ExplodedAtc />
  </section>

  <section in:fly={enter(2)}>
    <p class="kicker">contraste</p>
    <h2>ATC vs helper</h2>
    <p>
      No todo método merece identidad. Un GET que <em>solo lee</em> — como consultar quién
      está logueado — no cambia nada en el sistema: es un <strong>helper</strong>. Se marca
      con <code>@step</code>, sin ID de ticket, y no se reporta al TMS.
    </p>
    <div class="contrast">
      <div class="contrast-col">
        <span class="tag ok">ATC — cambia estado</span>
        <p class="mini">
          Hace login (crea una sesión). Lleva <code>@atc('PROJ-101')</code> y cada
          ejecución reporta su resultado.
        </p>
      </div>
      <div class="contrast-col">
        <span class="tag">helper — solo lectura</span>
        <CodePane code={helperSample.code} title={helperSample.title} />
        <p class="mini">Solo pregunta. Sin ID, sin reporte: existe para servir a los ATCs.</p>
      </div>
    </div>
  </section>

  <section in:fly={enter(3)}>
    <p class="kicker">la variante de pantalla</p>
    <h2>El mismo patrón en UI</h2>
    <p>
      En una página, la pieza incluye también sus <strong>locators inline</strong>: la
      dirección del botón vive DENTRO de la pieza, no en un archivo aparte. Si mañana
      cambia el botón, se arregla en un solo lugar.
    </p>
    <CodePane code={uiSample.code} title={uiSample.title} />
    <p class="callout" style="margin-top: 14px">
      Fíjate: los locators son propiedades privadas de la clase porque se usan en 2+
      ATCs. Si un locator se usa en uno solo, se escribe directamente dentro del ATC.
      Los archivos <code>locators/*.ts</code> están prohibidos.
    </p>
  </section>

  <section in:fly={enter(4)}>
    <p class="kicker">bautizar la pieza</p>
    <h2>El nombre lo dice todo</h2>
    <p>
      Un ATC se nombra <code>{'{verbo}{Recurso}{Escenario}'}</code>: quién recibe el
      <Term t="payload">payload</Term> y qué se espera que pase. Arma un nombre válido
      combinando segmentos — y mira los que nunca pasarían revisión. Cada
      <Term t="aserción">aserción</Term> del caso queda anunciada desde el nombre:
      «Successfully» promete 200; «WithInvalidCredentials» promete 401.
    </p>
    <NameBuilder />
  </section>
</div>

<style>
  .ch2 {
    display: flex;
    flex-direction: column;
    gap: 44px;
    max-width: 1080px;
  }
  section > p {
    color: var(--text-2);
    max-width: 72ch;
    margin: 6px 0 14px;
  }
  h2 {
    font-size: 1.25rem;
    margin: 4px 0 2px;
  }
  blockquote.callout {
    margin: 12px 0 0;
  }
  code {
    font-size: 0.85em;
    color: var(--syn-string);
  }

  .contrast {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 20px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .contrast {
      grid-template-columns: 1fr;
    }
  }
  .contrast-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .contrast-col .tag {
    align-self: flex-start;
  }
  .mini {
    font-size: 0.85rem;
    color: var(--text-3);
    margin: 0;
  }
</style>
