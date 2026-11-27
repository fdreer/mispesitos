import { describe, it, expect } from "vitest"
import { monthlyTotals } from "@/lib/dashboard"

describe("monthlyTotals", () => {
  it("devuelve un punto por mes en orden cronológico", () => {
    const result = monthlyTotals(
      [
        { date: "2026-07-15", kind: "income", arsCents: 100_00 },
        { date: "2026-08-01", kind: "expense", arsCents: 40_00 },
        { date: "2026-08-20", kind: "expense", arsCents: 10_00 },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-06", incomeArsCents: 0, expenseArsCents: 0 },
      { month: "2026-07", incomeArsCents: 100_00, expenseArsCents: 0 },
      { month: "2026-08", incomeArsCents: 0, expenseArsCents: 50_00 },
    ])
  })

  it("ignora un movimiento fuera de la ventana de meses, tanto anterior como posterior", () => {
    const result = monthlyTotals(
      [
        { date: "2026-05-15", kind: "income", arsCents: 999_00 },
        { date: "2026-09-01", kind: "expense", arsCents: 888_00 },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-06", incomeArsCents: 0, expenseArsCents: 0 },
      { month: "2026-07", incomeArsCents: 0, expenseArsCents: 0 },
      { month: "2026-08", incomeArsCents: 0, expenseArsCents: 0 },
    ])
  })

  it("cuenta los movimientos del primer y del último mes de la ventana", () => {
    const result = monthlyTotals(
      [
        { date: "2026-06-01", kind: "income", arsCents: 100_00 },
        { date: "2026-08-31", kind: "expense", arsCents: 200_00 },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-06", incomeArsCents: 100_00, expenseArsCents: 0 },
      { month: "2026-07", incomeArsCents: 0, expenseArsCents: 0 },
      { month: "2026-08", incomeArsCents: 0, expenseArsCents: 200_00 },
    ])
  })

  it("la ventana termina en el mes de hoy y arranca months-1 meses atrás", () => {
    expect(monthlyTotals([], 6, "2026-01-31").map((m) => m.month)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ])
  })

  it("con hoy en un 31, la ventana hacia atrás no repite ni saltea ningún mes", () => {
    for (const hoy of ["2026-01-31", "2026-03-31", "2026-05-31", "2028-02-29"]) {
      const meses = monthlyTotals([], 12, hoy).map((m) => m.month)

      expect(meses).toHaveLength(12)
      expect(new Set(meses).size).toBe(12)
      expect([...meses].sort()).toEqual(meses)
      expect(meses.at(-1)).toBe(hoy.slice(0, 7))
    }
  })
})
