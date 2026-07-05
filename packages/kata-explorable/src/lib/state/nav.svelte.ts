import type { ChapterId, SceneId } from '$lib/content/types';
import { chapterMetas } from '$lib/content/chapters/registry';

const STORAGE_KEY = 'kata-explorable:visited';

function loadVisited(): ChapterId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChapterId[]) : [];
  }
  catch {
    return [];
  }
}

/**
 * Estado global de navegación.
 *
 * `scene` decide qué se renderiza (intro, mapa o un capítulo).
 * `zoomTarget` lo consume KataMap para animar la cámara hacia la zona
 * del capítulo antes de hacer el crossfade a la escena del capítulo.
 */
class NavState {
  scene = $state<SceneId>('intro');
  /** Capítulo hacia el que la cámara del mapa está haciendo zoom. */
  zoomTarget = $state<ChapterId | null>(null);
  visited = $state<ChapterId[]>(loadVisited());
  /**
   * Modo presentación (para grabar pantalla): oculta el chrome de
   * navegación y agranda el texto. Se alterna con la tecla P.
   * NO se persiste: cada sesión arranca en modo normal.
   */
  presentation = $state(false);

  get currentChapter() {
    return chapterMetas.find(m => m.id === this.scene) ?? null;
  }

  get progress(): number {
    return this.visited.length / chapterMetas.length;
  }

  togglePresentation() {
    this.presentation = !this.presentation;
  }

  goIntro() {
    this.scene = 'intro';
    this.zoomTarget = null;
  }

  goMap() {
    this.scene = 'map';
    this.zoomTarget = null;
  }

  /**
   * Entra a un capítulo. Si venimos del mapa, primero se marca
   * `zoomTarget` para que la cámara viaje; KataMap llama a
   * `commitChapter()` cuando el zoom asienta.
   */
  goChapter(id: ChapterId) {
    if (this.scene === 'map') {
      this.zoomTarget = id;
    }
    else {
      this.commitChapter(id);
    }
  }

  commitChapter(id: ChapterId) {
    this.scene = id;
    this.zoomTarget = null;
    if (!this.visited.includes(id)) {
      this.visited = [...this.visited, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.visited));
      }
      catch {
        /* almacenamiento no disponible: el progreso solo vive en la sesión */
      }
    }
  }

  /** Capítulo siguiente en orden pedagógico, o null si es el último. */
  get nextChapter() {
    const cur = this.currentChapter;
    if (!cur) { return null; }
    return chapterMetas.find(m => m.num === cur.num + 1) ?? null;
  }

  get prevChapter() {
    const cur = this.currentChapter;
    if (!cur) { return null; }
    return chapterMetas.find(m => m.num === cur.num - 1) ?? null;
  }
}

export const nav = new NavState();
