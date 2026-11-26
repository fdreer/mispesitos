/**
 * Un color estable por categoría.
 *
 * Desde la Fase 2 del plan v2 el color se puede ELEGIR (ver `CATEGORY_PALETTE`
 * y `resolveCategoryHue`, al final del archivo). Lo que sigue explica el
 * color por defecto, el de las categorías sin elección.
 *
 * Se deriva del NOMBRE, no del id, por dos motivos. Uno: la torta del
 * dashboard sólo recibe `{ name, arsCents }` (ver `buildDashboardView`), así
 * que hashear el id obligaría a arrastrar ids hasta ahí para que la torta y
 * los badges de la tabla no se contradigan. Dos: el color es una ayuda para
 * reconocer la categoría de un vistazo, y lo que se reconoce es el nombre —
 * si alguien la renombra, que cambie de color es coherente, no un bug.
 *
 * El tono sale de un hash del nombre en vez de un índice en una lista de
 * colores fijos: con una lista de N colores, la categoría N+1 repite, y en
 * una app donde la persona se arma sus propias categorías esa lista se agota
 * enseguida. Con 360 tonos, dos categorías chocan sólo si sus hashes caen
 * cerca — y aun así el nombre está escrito adentro del badge, así que el
 * color nunca es el único portador del dato (regla de accesibilidad: no
 * apoyarse sólo en el color).
 *
 * OKLCH y no HSL: en HSL, `hsl(240 65% 62%)` (un azul) es MUCHO más oscuro
 * que `hsl(60 65% 62%)` (un amarillo) aunque los dos digan "62% de
 * luminosidad", así que con tonos al azar algunos badges quedarían ilegibles
 * sobre el fondo oscuro. OKLCH es perceptualmente uniforme: fijando L, los
 * 360 tonos tienen el mismo contraste contra el fondo. Con L = 0.78 sobre
 * Void (#08090a) da alrededor de 11:1, muy por encima del 4.5:1 que pide WCAG
 * AA para texto chico, para cualquier tono.
 */
const LIGHTNESS = 0.78
const CHROMA = 0.13

/** Cuánto del color se usa como fondo del badge. */
const TINT_ALPHA = 0.16

/**
 * Los dos arcos de tono que las categorías NO pueden usar, porque ahí viven
 * los colores con significado fijo del sistema:
 *
 * - 10–80: el coral de "vencido" (tono ≈25) y el naranja de "pendiente" (≈55).
 * - 125–180: el verde de "pagado" (≈145).
 *
 * Las bandas son más anchas que los tres tonos que protegen, a propósito: lo
 * que hay que evitar no es el color exacto sino el parecido. Sin esto, una
 * categoría llamada "Otros" salía de un rojo casi idéntico al badge de
 * vencido en la misma fila de la misma tabla, y "Sueldo" de un verde a un
 * paso del de pagado. El color de categoría es decorativo y el de estado
 * significa algo: que se puedan confundir es el único choque que importa acá.
 *
 * Exportadas porque son el contrato que verifica el test, no un detalle
 * interno: si alguien mueve una banda, el test tiene que moverse con ella y no
 * quedar comprobando los bordes viejos.
 */
export const HUE_BANDAS_RESERVADAS: readonly (readonly [number, number])[] = [
  [10, 80],
  [125, 180],
]

const GRADOS_RESERVADOS = HUE_BANDAS_RESERVADAS.reduce(
  (n, [desde, hasta]) => n + (hasta - desde),
  0,
)

/** Cuántos tonos distintos quedan disponibles para las categorías. */
export const HUE_GRADOS_LIBRES = 360 - GRADOS_RESERVADOS

/**
 * Hash de string clásico (base 31, el mismo de `String.hashCode` de Java).
 * No necesita ser criptográfico: sólo tiene que ser determinístico y repartir
 * parejo. `| 0` lo mantiene en 32 bits en cada vuelta para que no se vaya al
 * rango donde los enteros de JavaScript dejan de ser exactos.
 */
function hash(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * El tono OKLCH que le toca a esta categoría, ya fuera de las bandas
 * reservadas.
 *
 * El hash se reparte sobre los grados LIBRES (265 de los 360) y después se
 * corre hacia arriba por cada banda que le quede por debajo. Es una biyección:
 * cada valor del hash cae en un tono permitido distinto, sin apilar dos tonos
 * en el borde de una banda —que es lo que pasaría con la solución obvia de
 * "si cae adentro, empujalo al borde"—.
 */
export function categoryHue(name: string): number {
  let hue = hash(name) % HUE_GRADOS_LIBRES
  for (const [desde, hasta] of HUE_BANDAS_RESERVADAS) {
    if (hue >= desde) hue += hasta - desde
  }
  return hue
}

/**
 * La paleta que se puede ELEGIR por categoría (Fase 2 del plan v2, §2.1).
 *
 * Una lista fija de tonos y no un selector de color libre, por las mismas dos
 * razones que sostienen el hash de arriba: con la luminosidad y el croma
 * fijos, cualquier tono de la lista tiene el mismo contraste contra el fondo;
 * y ninguno cae adentro de las bandas reservadas para los colores de estado
 * (lo verifica el test). Un color libre podía ser un verde idéntico al de
 * "pagado", o un azul oscuro ilegible sobre Void.
 *
 * Lo que se guarda en `category.color` es la `key`, no el tono: si un día se
 * retoca un tono, se retoca para todas las categorías que lo eligieron, sin
 * migrar datos. Una clave que ya no está en la lista se ignora y la categoría
 * cae al color heredado o al hash, en vez de romper.
 *
 * El amarillo está en 90 y no más arriba a propósito: de ahí en adelante se
 * acerca al lima ácido de la acción principal (tono ≈ 115).
 */
export const CATEGORY_PALETTE = [
  { key: "amarillo", label: "Amarillo", hue: 90 },
  { key: "turquesa", label: "Turquesa", hue: 190 },
  { key: "celeste", label: "Celeste", hue: 220 },
  { key: "azul", label: "Azul", hue: 250 },
  { key: "indigo", label: "Índigo", hue: 272 },
  { key: "violeta", label: "Violeta", hue: 295 },
  { key: "magenta", label: "Magenta", hue: 320 },
  { key: "rosa", label: "Rosa", hue: 348 },
] as const

export type CategoryColorKey = (typeof CATEGORY_PALETTE)[number]["key"]

export const CATEGORY_COLOR_KEYS = CATEGORY_PALETTE.map((c) => c.key) as [
  CategoryColorKey,
  ...CategoryColorKey[],
]

/** El tono de una clave de la paleta, o undefined si no es una clave conocida. */
export function paletteHue(key: string | null | undefined): number | undefined {
  return CATEGORY_PALETTE.find((c) => c.key === key)?.hue
}

/** Lo mínimo de una categoría que hace falta para saber su color. */
export type ColorSource = { name: string; color: string | null }

/**
 * El tono que se pinta, en este orden (§2.1 del plan: "la subcategoría hereda
 * el color del padre si no tiene propio"):
 *
 * 1. el color elegido para la propia categoría;
 * 2. si es una subcategoría, el color del padre — el elegido, o si tampoco lo
 *    tiene, el hash del nombre DEL PADRE: así "Hogar › Alquiler" y
 *    "Hogar › Expensas" salen del mismo color que "Hogar" en la torta aunque
 *    nadie haya elegido nada;
 * 3. el hash del propio nombre, que es como se pintaba todo antes de la 0011.
 */
export function resolveCategoryHue(category: ColorSource, parent?: ColorSource | null): number {
  const own = paletteHue(category.color)
  if (own !== undefined) return own
  if (parent) return paletteHue(parent.color) ?? categoryHue(parent.name)
  return categoryHue(category.name)
}

/** Color pleno de un tono: el texto del badge y la porción de la torta. */
export function hueColor(hue: number): string {
  return `oklch(${LIGHTNESS} ${CHROMA} ${hue})`
}

/** El mismo tono al 16%: el fondo del badge. */
export function hueTint(hue: number): string {
  return `oklch(${LIGHTNESS} ${CHROMA} ${hue} / ${TINT_ALPHA})`
}

/** Color pleno derivado sólo del nombre, para lo que no tiene categoría guardada. */
export function categoryColor(name: string): string {
  return hueColor(categoryHue(name))
}

/** El fondo derivado sólo del nombre. */
export function categoryTint(name: string): string {
  return hueTint(categoryHue(name))
}
