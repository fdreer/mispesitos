import { describe, expect, it } from "vitest"

import {
  detectDatePreset,
  formatPeriodLabel,
  presetRange,
  shiftPeriod,
} from "@/lib/date-presets"

const HOY = "2026-11-26"

describe("presetRange", () => {
  it("calcula cada atajo desde today", () => {
    expect(presetRange("this_month", HOY)).toEqual({ from: "2026-11-01", to: "2026-11-30" })
    expect(presetRange("last_month", HOY)).toEqual({ from: "2026-10-01", to: "2026-10-31" })
    expect(presetRange("next_30_days", HOY)).toEqual({ from: "2026-11-26", to: "2026-12-26" })
    expect(presetRange("last_3_months", HOY)).toEqual({ from: "2026-09-01", to: "2026-11-30" })
    expect(presetRange("last_6_months", HOY)).toEqual({ from: "2026-06-01", to: "2026-11-30" })
    expect(presetRange("last_12_months", HOY)).toEqual({ from: "2025-12-01", to: "2026-11-30" })
    expect(presetRange("this_year", HOY)).toEqual({ from: "2026-01-01", to: "2026-12-31" })
  })
})

describe("detectDatePreset / formatPeriodLabel", () => {
  it("reconoce los atajos y cae en Personalizado o Elegir un período", () => {
    expect(detectDatePreset("", "", HOY)).toBeNull()
    expect(detectDatePreset("2026-11-01", "2026-11-30", HOY)).toBe("this_month")
    expect(formatPeriodLabel("2026-11-01", "2026-11-30", HOY)).toBe("Este mes")
    expect(detectDatePreset("2026-11-05", "2026-11-20", HOY)).toBe("custom")
    expect(formatPeriodLabel("2026-11-05", "2026-11-20", HOY)).toBe("05/11/2026 – 20/11/2026")
    expect(formatPeriodLabel("", "", HOY)).toBe("Elegir un período")
  })
})

describe("shiftPeriod", () => {
  it("corre meses calendario completos respetando el último día de cada mes", () => {
    expect(shiftPeriod("2026-02-01", "2026-02-28", 1)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    })
    expect(shiftPeriod("2026-03-01", "2026-03-31", -1)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    })
    // Trimestre entero -> trimestre anterior/siguiente.
    expect(shiftPeriod("2026-09-01", "2026-11-30", -1)).toEqual({
      from: "2026-06-01",
      to: "2026-08-31",
    })
    // Año entero -> año anterior.
    expect(shiftPeriod("2026-01-01", "2026-12-31", -1)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    })
  })

  it("corre un rango arbitrario por su cantidad de días", () => {
    // 10 días (1 al 10): el siguiente es 11 al 20.
    expect(shiftPeriod("2026-11-01", "2026-11-10", 1)).toEqual({
      from: "2026-11-11",
      to: "2026-11-20",
    })
    expect(shiftPeriod("2026-11-11", "2026-11-20", -1)).toEqual({
      from: "2026-11-01",
      to: "2026-11-10",
    })
  })

  it("devuelve null cuando el rango está vacío o abierto de un solo lado", () => {
    expect(shiftPeriod("", "", 1)).toBeNull()
    expect(shiftPeriod("2026-11-01", "", 1)).toBeNull()
    expect(shiftPeriod("", "2026-11-30", -1)).toBeNull()
  })
})
