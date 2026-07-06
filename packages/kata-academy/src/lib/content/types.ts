/**
 * Modelo de contenido de KATA Academy.
 *
 * Los capítulos son escenas Svelte lazy-cargadas; sus metadatos viven
 * aquí para que el mapa, la navegación y la ruta guiada no necesiten
 * cargar el componente para pintarse.
 */

export type ChapterId
  = | 'problema'
    | 'atc'
    | 'capas'
    | 'di'
    | 'ensamblador'
    | 'simulador'
    | 'reglas'
    | 'maquinaria';

export type SceneId = 'intro' | 'map' | ChapterId;

/**
 * Zona del mapa en coordenadas de escena (el mapa vive en un lienzo
 * lógico de 1600×1000). La cámara usa estos rectángulos como objetivo
 * del zoom cinematográfico al entrar a un capítulo.
 */
export interface MapZone {
  x: number
  y: number
  w: number
  h: number
}

export interface ChapterMeta {
  id: ChapterId
  num: number
  /** Título corto para el mapa y la navegación. */
  title: string
  /** Kicker monoespaciado que acompaña al título dentro del capítulo. */
  kicker: string
  /** Una frase — qué aprende la persona aquí. */
  summary: string
  /**
   * Anclaje de la mnemotecnia oficial "la cocina profesional"
   * (CONTENT-SOURCE §9). El mapa lo muestra como etiqueta protagonista.
   */
  mnemonic: {
    /** Nombre del anclaje en la cocina (p.ej. "La receta"). */
    anchor: string
    /** Emoji que acompaña al anclaje. */
    icon: string
    /** Una frase — la imagen mental de la cocina. */
    line: string
  }
  zone: MapZone
  /** Acento visual del capítulo (var CSS ya definida en app.css). */
  accent: 'a1' | 'a2' | 'a3' | 'good'
}

export interface GlossaryEntry {
  /** Clave canónica en minúsculas (como se busca). */
  term: string
  /** Variantes con las que también se puede referenciar. */
  aliases?: string[]
  /** Definición corta para el popover (1-2 frases, lenguaje llano). */
  short: string
}

/** Muestra de código real del boilerplate, lista para CodePane. */
export interface CodeSample {
  title: string
  /** Ruta real en el boilerplate, para dar contexto de procedencia. */
  sourcePath: string
  code: string
}
