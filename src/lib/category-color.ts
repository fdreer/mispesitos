/**
 * Un color estable por categoría.
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

/** Color pleno: el texto del badge y la porción de la torta. */
export function categoryColor(name: string): string {
  return `oklch(${LIGHTNESS} ${CHROMA} ${categoryHue(name)})`
}

/** El mismo color al 16%: el fondo del badge. */
export function categoryTint(name: string): string {
  return `oklch(${LIGHTNESS} ${CHROMA} ${categoryHue(name)} / ${TINT_ALPHA})`
}
