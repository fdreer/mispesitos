import { describe, it, expect } from "vitest"
import { todayInAr, addMonthsClamped, monthKey, isOverdue } from "@/lib/dates"

describe("todayInAr", () => {
  it("devuelve una fecha en formato YYYY-MM-DD", () => {
    expect(todayInAr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("addMonthsClamped", () => {
  it("suma meses manteniendo el día", () => {
    expect(addMonthsClamped("2026-01-15", 1)).toBe("2026-02-15")
    expect(addMonthsClamped("2026-01-15", 12)).toBe("2027-01-15")
  })

  it("recorta al último día cuando el día no existe en el mes destino", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonthsClamped("2026-08-31", 1)).toBe("2026-09-30")
  })

  it("respeta los años bisiestos", () => {
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29")
  })

  it("cruza el año correctamente", () => {
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28")
  })

  it("acepta cero meses", () => {
    expect(addMonthsClamped("2026-05-10", 0)).toBe("2026-05-10")
  })
})

describe("monthKey", () => {
  it("extrae el año y mes", () => {
    expect(monthKey("2026-08-09")).toBe("2026-08")
  })
})

describe("isOverdue", () => {
  it("es vencido si la fecha ya pasó", () => {
    expect(isOverdue("2026-08-08", "2026-08-09")).toBe(true)
  })

  it("no es vencido si vence hoy", () => {
    expect(isOverdue("2026-08-09", "2026-08-09")).toBe(false)
  })

  it("no es vencido si vence en el futuro", () => {
    expect(isOverdue("2026-09-01", "2026-08-09")).toBe(false)
  })
})
