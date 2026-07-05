# HANDOFF — KATA Explorable → siguiente sesión

> **Cómo usar**: adjunta este archivo en una sesión nueva de Claude Code (repo
> `agentic-qa-boilerplate`). Contiene el estado, las decisiones cerradas, los
> gotchas técnicos y la cola de trabajo priorizada. La memoria engram del
> proyecto tiene el detalle histórico (`mem_search "kata explorable"`).

---

## 1. Qué es esto

**KATA Explorable** (`kata-explorable/`, hoy UNTRACKED en la raíz del repo):
mini-app Svelte 5 + Vite + TS estricto que enseña la arquitectura KATA como
"super mega documentación interactiva". Español, audiencia con OOP mínimo.

- **Estructura**: Intro cinemática (spec espagueti que falla) → Mapa hub
  zoomable (desktop ≥1000px) / lista vertical (<1000px) → 8 capítulos lazy.
- **Interacciones firma**: vista explotada del ATC (cap 2), edificio de capas
  (cap 3), panel DI `{api}/{ui}/{test}` (cap 4), ensamblador drag-drop de
  specs con ATCs reales (cap 5), simulador del pipeline `@atc`→NDJSON→
  `atc_results.json`→Xray con toggle de fallo (cap 6), juego "¿ATC o no?"
  (cap 7), maquinaria CI + widget GO/NO-GO (cap 8).
- **Mnemotecnia oficial**: LA COCINA PROFESIONAL (diccionario completo en
  `CONTENT-SOURCE.md` §9 — VINCULANTE para todo contenido nuevo). Lego =
  textura secundaria del ensamblador solamente.
- **Modo presentación**: tecla P (chrome oculto, texto ×1.22, flechas
  recorren secciones h2). Para videos de YouTube del usuario.
- **Glosario contextual**: `<Term t="...">` → popover fixed clampeado al
  viewport (`src/lib/components/Term.svelte`).

**Estado de calidad**: `bun run check` 0 errores (272 archivos) · build verde
(~30KB gzip main + capítulos code-split) · auditoría responsive (390/768/1440)
y auditoría UX de 19 hallazgos COMPLETAS y corregidas · 0 errores de consola.

**Comandos** (desde `kata-explorable/`): `bun install` · `bun run dev`
(localhost:4173) · `bun run check` · `bun run build`.

---

## 2. Decisiones cerradas (NO reabrir)

1. **Anchura fija**: columna de capítulo `max-width: 1160px`. El usuario
   RECHAZÓ explícitamente el sistema "measure + breakout". No proponer de nuevo.
2. **Mnemotecnia = cocina profesional** (no kata marcial, no acróstico).
3. **Stack**: Svelte 5 + Vite, cero dependencias extra (animación con
   `svelte/motion` Spring + `svelte/transition`).
4. **Idioma**: contenido en español, términos técnicos en inglés. ATC se
   expande "Acceptance Test Case" (nunca "Automated").
5. **Registro caveman**: activo por defecto en conversación; el usuario es
   hispanohablante.

---

## 3. COLA DE TRABAJO (en este orden)

### ✅ P0 — Empaquetar + publicar (COMPLETADO 2026-07-05)

Ejecutado y verificado (build + type-check + smoke HTTP + screenshots):

1. **Movido** a `packages/kata-explorable/` (con `.gitignore` interno
   `node_modules/` + `dist/`). Root `package.json` NO declara workspaces →
   paquete independiente con su propio `bun install`.
2. **`base: './'`** en `vite.config.ts`. Verificado: assets relativos en
   `dist/index.html`, lazy chunks cargan bajo `/kata/` (mapa + capítulos,
   0 errores de consola).
3. **Homepage dashboard**: `packages/pages-home/index.html` — estático,
   tokens tpl-howto, branding **"Agentic QA — UPEX Galaxy"** (decisión
   usuario). Hero CTA → `./kata/` + 3 secciones de decks (Workflows EN/ES ·
   Currículum 01-08 · Oficio QA) + strip Allure → `./staging/regression/`.
   TODOS los 26 decks publicados (decisión usuario; repo ya es público).
4. **Workflow** `.github/workflows/pages.yml`: build + type-check explorable →
   ensambla `_site/` (homepage raíz + `kata/` + `decks/<skill>/` +
   `.nojekyll`) → deploy peaceiris a `gh-pages` con `keep_files: true`
   (protege `<env>/regression/` de Allure — hoy solo existe `staging/`).
   Trigger: push a main (paths del paquete + homepage + decks) +
   `workflow_dispatch`.
5. **Pendiente del usuario**: rewrite en su Next.js personal
   `rewrites: [{ source: '/kata/:path*', destination: 'https://upex-galaxy.github.io/agentic-qa-boilerplate/kata/:path*' }]`
   (multi-zone), o copiar `dist/` a `public/kata/`. Decisión suya al montarlo.

Gotcha nuevo: `keep_files: true` nunca borra — si un deck se renombra, el
HTML viejo queda huérfano en `gh-pages` (limpieza manual si importa).

### P1 — Deep-links por hash

`/kata#simulador`, `#la-receta`, etc. Necesario para que el dashboard y el
Next.js puedan enlazar capítulos directos (y compartir links en videos).
- Implementar en `src/lib/state/nav.svelte.ts`: sincronizar `location.hash`
  ↔ `nav.scene` (leer al boot — saltando la intro si hay hash — y escribir en
  cada cambio de escena). IDs sugeridos = `ChapterId` del registry
  (`problema`, `atc`, `capas`, `di`, `ensamblador`, `simulador`, `reglas`,
  `maquinaria`) + `mapa`.
- Sigue siendo 100% estático (hash no requiere servidor).

### P2 — "El Dojo de práctica" (playground)

Aprobado por el usuario. Nuevo capítulo/modo: recorrer el ciclo completo como
alumno de cocina — crear tu componente → entrenar tu receta (ATC guiado) →
registrarla en el pase (fixture) → armar tu comanda (spec, reusa el
ensamblador) → el servicio la ejecuta (reusa el simulador) → la inspección da
el veredicto y ganas "estrellas/cinturón". OBLIGATORIO: anclajes de la cocina
(§9 de CONTENT-SOURCE.md). Progresión persistida en localStorage. Registrarlo
en el mapa (decidir zona) y en el registry.

---

## 4. Gotchas técnicos (aprendidos a golpes — no re-descubrir)

1. **Bun resuelve imports desde el directorio DEL SCRIPT, no del cwd**: los
   scripts Playwright de verificación deben COPIARSE a la raíz del repo padre
   (`.algo.tmp.ts`, borrar después) — el repo padre tiene `@playwright/test`
   1.60 con browsers instalados; el caché global de bun trae versiones sin
   browsers.
2. **`mouseleave` sintético de Chrome**: tras un tap Y tras un scroll
   programático, Chrome dispara mouseleave fantasma. Mata popovers y
   selecciones. Patrón: gatear handlers hover con `e.pointerType === 'mouse'`
   o `matchMedia('(hover: hover)')`.
3. **`:hover` obsoleto con transforms**: la cámara del mapa mueve elementos
   bajo el cursor quieto; Chrome no recalcula hover → un piso queda
   "resaltado" en screenshots. Se autocorrige al mover el mouse. NO es bug.
4. **Overflow móvil**: el patrón raíz fue hijos max-content en grids con
   tracks implícitos → SIEMPRE `grid-template-columns: minmax(0,1fr)` +
   `min-width: 0` en hijos. Medir overflow en `.body` (el scroll container
   interno), NO en documentElement. Re-testear a 340px (un shell más ancho
   enmascara drivers).
5. **`min-height: auto` de flex** impide scroll interno de diálogos
   (`min-height: 0` en el hijo scrolleable).
6. **Los rects de zona del registry son también targets de zoom de cámara**:
   redimensionar el edificio exige realinear las zonas `atc`/`di` a los pisos.
7. **Verificación visual ≠ métricas**: las auditorías DEBEN incluir pasada de
   "ojos de diseñador" ejercitando cada interacción y MIRANDO screenshots
   (lección que costó reclamos del usuario). Los subagentes deben recibir esa
   instrucción explícita + mirar las capturas con Read.

## 5. Mapa de archivos clave

```
packages/kata-explorable/
├── CONTENT-SOURCE.md            ← dossier canónico (doctrina + código real + §8 contrato ingeniería + §9 mnemotecnia)
├── HANDOFF.md                   ← este archivo
├── vite.config.ts               ← base: './' (NO quitar — el build vive bajo /kata/)
├── src/App.svelte               ← escenas + tecla P + toast/badge presentación
├── src/app.css                  ← design tokens tpl-howto + primitivas
├── src/lib/state/nav.svelte.ts  ← navegación (aquí van los deep-links P1)
├── src/lib/content/chapters/registry.ts ← metas + mnemónicos + zonas del mapa
├── src/lib/content/glossary.ts  ← ~30 términos del glosario
├── src/lib/components/          ← ChapterShell (1160px, NO tocar ancho) · CodePane · Term
├── src/lib/scenes/              ← Intro · KataMap (dual: espacial/lista) · chapters/Ch1..Ch8 + ch2/ ch7/
Repo padre:
├── packages/pages-home/index.html ← homepage dashboard del sitio Pages
├── packages/create-agentic-qa/  ← paquete vecino
├── .github/workflows/pages.yml  ← build + deploy del hub (keep_files: true)
├── .github/workflows/regression.yml ← YA publica Allure a gh-pages (keep_files!)
└── .claude/skills/*/*.html      ← decks publicados en /decks/<skill>/
```
