import { describe, expect, it } from "vitest"

import {
  HUE_BANDAS_RESERVADAS,
  HUE_GRADOS_LIBRES,
  categoryColor,
  categoryHue,
  categoryTint,
} from "@/lib/category-color"

/** Suficientes nombres para barrer los tonos libres varias veces. */
const NOMBRES = Array.from({ length: 5000 }, (_, i) => `categoría ${i}`)

describe("categoryColor", () => {
  it("el mismo nombre da siempre el mismo tono", () => {
    expect(categoryHue("Supermercado")).toBe(categoryHue("Supermercado"))
  })

  it("nombres distintos dan tonos distintos", () => {
    expect(categoryHue("Supermercado")).not.toBe(categoryHue("Alquiler"))
  })

  // El hash acumula en 32 bits y puede desbordar a negativo; sin el
  // `Math.abs` el resto quedaría negativo y saldría un `oklch(... -123)`, que
  // el navegador descarta entero y deja el badge sin color.
  it("ningún nombre produce un tono fuera de 0–359", () => {
    const nombres = [
      "",
      "a",
      "Supermercado",
      "Un nombre bastante largo que desborda el hash de 32 bits sin problema",
      "ñandú",
      "🙂",
    ]
    for (const n of nombres) {
      const hue = categoryHue(n)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
      expect(Number.isInteger(hue)).toBe(true)
    }
  })

  // Ninguna categoría puede caer en el rojo de "vencido", el naranja de
  // "pendiente" ni el verde de "pagado": son badges que conviven en la misma
  // fila de la misma tabla.
  it("ningún tono cae en las bandas de los colores de estado", () => {
    for (const nombre of NOMBRES) {
      const hue = categoryHue(nombre)
      for (const [desde, hasta] of HUE_BANDAS_RESERVADAS) {
        expect(hue < desde || hue >= hasta).toBe(true)
      }
    }
  })

  // Todos los grados libres tienen que ser alcanzables. La solución fácil para
  // esquivar las bandas ("si cae adentro, empujalo al borde") pasaría el test
  // de acá arriba igual, pero apilaría un montón de categorías en los dos
  // grados del borde y dejaría el resto del arco sin usar: las colisiones de
  // color dejarían de ser raras. Un mapeo que reparte parejo los toca todos.
  it("todos los grados libres son alcanzables", () => {
    const vistos = new Set(NOMBRES.map(categoryHue))
    expect(vistos.size).toBe(HUE_GRADOS_LIBRES)
  })

  it("el fondo es el mismo color del texto, con alfa", () => {
    expect(categoryColor("Ocio")).toBe("oklch(0.78 0.13 " + categoryHue("Ocio") + ")")
    expect(categoryTint("Ocio")).toBe("oklch(0.78 0.13 " + categoryHue("Ocio") + " / 0.16)")
  })
})
