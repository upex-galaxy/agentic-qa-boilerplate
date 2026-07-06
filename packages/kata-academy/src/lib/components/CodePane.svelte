<script lang="ts">
  interface Props {
    code: string;
    /** Ruta o título mostrado en la barra del terminal. */
    title?: string;
    /** Líneas (1-based) a resaltar con fondo cálido. */
    highlight?: number[];
    /** Muestra números de línea. */
    lineNumbers?: boolean;
  }

  const { code, title = '', highlight = [], lineNumbers = false }: Props = $props();

  const KEYWORDS = new Set([
    'const', 'let', 'var', 'function', 'return', 'async', 'await', 'class',
    'extends', 'implements', 'interface', 'type', 'import', 'from', 'export',
    'new', 'if', 'else', 'for', 'of', 'in', 'this', 'super', 'private',
    'public', 'protected', 'readonly', 'static', 'get', 'set', 'throw',
    'try', 'catch', 'null', 'undefined', 'true', 'false', 'default',
  ]);

  function escapeHtml(s: string): string {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  /**
   * Tokenizador TS mínimo en una sola pasada (suficiente para muestras
   * didácticas; no pretende ser un parser). Orden de alternativas:
   * comentario → string → decorador → palabra/identificador → número.
   */
  const TOKEN =
    /(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(@[A-Za-z_]\w*)|([A-Za-z_$][\w$]*)|(\b\d+(?:\.\d+)?\b)/g;

  function highlightLine(line: string): string {
    let out = '';
    let last = 0;
    TOKEN.lastIndex = 0;
    for (let m = TOKEN.exec(line); m !== null; m = TOKEN.exec(line)) {
      out += escapeHtml(line.slice(last, m.index));
      const [full, comment, str, deco, ident, num] = m;
      if (comment !== undefined) {
        out += `<span class="c">${escapeHtml(comment)}</span>`;
      } else if (str !== undefined) {
        out += `<span class="s">${escapeHtml(str)}</span>`;
      } else if (deco !== undefined) {
        out += `<span class="d">${escapeHtml(deco)}</span>`;
      } else if (ident !== undefined) {
        const rest = line.slice(m.index + full.length);
        if (KEYWORDS.has(ident)) {
          out += `<span class="k">${escapeHtml(ident)}</span>`;
        } else if (/^[A-Z]/.test(ident)) {
          out += `<span class="t">${escapeHtml(ident)}</span>`;
        } else if (/^\s*\(/.test(rest)) {
          out += `<span class="f">${escapeHtml(ident)}</span>`;
        } else {
          out += escapeHtml(ident);
        }
      } else if (num !== undefined) {
        out += `<span class="n">${escapeHtml(num)}</span>`;
      }
      last = m.index + full.length;
    }
    out += escapeHtml(line.slice(last));
    return out;
  }

  const lines = $derived(code.replace(/\n$/, '').split('\n'));
  const highlighted = $derived(new Set(highlight));
</script>

<figure class="terminal codepane">
  {#if title}
    <div class="terminal-bar">
      <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <span class="title">{title}</span>
    </div>
  {/if}
  <div class="scroll">
    <pre><code
        >{#each lines as line, i}<span
          class="line"
          class:hl={highlighted.has(i + 1)}
          >{#if lineNumbers}<span class="ln">{i + 1}</span>{/if}<span class="lc"
            >{@html highlightLine(line)}</span
          ></span
        >{/each}</code
      ></pre>
  </div>
</figure>

<style>
  .codepane {
    margin: 0;
    font-size: 0.82rem;
  }
  .scroll {
    position: relative;
  }
  /* Fundido en el borde derecho (todas las anchuras): señala que las líneas
     largas siguen hacia allá — en escritorio también se recortan. */
  .scroll::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 26px;
    pointer-events: none;
    background: linear-gradient(to left, rgba(1, 4, 9, 0.92), transparent);
  }
  pre {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px 0;
    line-height: 1.65;
    /* Barra horizontal fina pero visible (afordancia de scroll). */
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  pre::-webkit-scrollbar {
    height: 5px;
  }
  pre::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: 999px;
  }
  pre::-webkit-scrollbar-track {
    background: transparent;
  }
  code {
    display: block;
    min-width: max-content;
  }
  .line {
    display: block;
    padding: 0 18px;
  }
  .line.hl {
    background: rgba(255, 166, 87, 0.1);
    box-shadow: inset 3px 0 0 var(--a1);
  }
  .ln {
    display: inline-block;
    width: 2.2em;
    color: var(--text-3);
    opacity: 0.6;
    user-select: none;
  }
  .lc :global(.k) {
    color: var(--syn-keyword);
  }
  .lc :global(.f) {
    color: var(--syn-function);
  }
  .lc :global(.s) {
    color: var(--syn-string);
  }
  .lc :global(.c) {
    color: var(--syn-comment);
    font-style: italic;
  }
  .lc :global(.n) {
    color: var(--syn-number);
  }
  .lc :global(.d) {
    color: var(--syn-decorator);
    font-weight: 700;
  }
  .lc :global(.t) {
    color: var(--syn-type);
  }

  /* ---------- móvil: tipografía más compacta ---------- */
  @media (max-width: 640px) {
    .codepane {
      font-size: 0.72rem;
    }
    .line {
      padding: 0 14px;
    }
  }
</style>
