const LIGHTNESS = 0.78
const CHROMA = 0.13

const TINT_ALPHA = 0.16

export const HUE_BANDAS_RESERVADAS: readonly (readonly [number, number])[] = [
  [10, 80],
  [125, 180],
]

const GRADOS_RESERVADOS = HUE_BANDAS_RESERVADAS.reduce(
  (n, [desde, hasta]) => n + (hasta - desde),
  0,
)

export const HUE_GRADOS_LIBRES = 360 - GRADOS_RESERVADOS

function hash(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function categoryHue(name: string): number {
  let hue = hash(name) % HUE_GRADOS_LIBRES
  for (const [desde, hasta] of HUE_BANDAS_RESERVADAS) {
    if (hue >= desde) hue += hasta - desde
  }
  return hue
}

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

export function paletteHue(key: string | null | undefined): number | undefined {
  return CATEGORY_PALETTE.find((c) => c.key === key)?.hue
}

export type ColorSource = { name: string; color: string | null }

export function resolveCategoryHue(category: ColorSource, parent?: ColorSource | null): number {
  const own = paletteHue(category.color)
  if (own !== undefined) return own
  if (parent) return paletteHue(parent.color) ?? categoryHue(parent.name)
  return categoryHue(category.name)
}

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
