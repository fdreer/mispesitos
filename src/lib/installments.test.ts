import { describe, it, expect } from "vitest"
import {
  splitAmount,
  buildInstallments,
  installmentsSumMatches,
} from "@/lib/installments"

describe("splitAmount", () => {
  it("divide exacto cuando no hay resto", () => {
    expect(splitAmount(12_000, 4)).toEqual([3_000, 3_000, 3_000, 3_000])
  })

  it("deja el resto en la última cuota", () => {
    // $100,00 en 3 => 33,33 / 33,33 / 33,34
    expect(splitAmount(10_000, 3)).toEqual([3_333, 3_333, 3_334])
  })

  it("la suma siempre cierra contra el total", () => {
    for (const total of [1, 7, 99, 10_000, 123_457, 999_999_99]) {
      for (const count of [1, 2, 3, 6, 12, 24]) {
        const parts = splitAmount(total, count)
        expect(parts).toHaveLength(count)
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })

  it("una sola cuota es el total entero", () => {
    expect(splitAmount(10_000, 1)).toEqual([10_000])
  })

  it("rechaza cantidades de cuota inválidas", () => {
    expect(() => splitAmount(10_000, 0)).toThrow()
    expect(() => splitAmount(10_000, -1)).toThrow()
  })

  it("rechaza totales negativos", () => {
    expect(() => splitAmount(-100, 2)).toThrow()
  })
})

describe("buildInstallments", () => {
  it("genera vencimientos mensuales numerados desde 1", () => {
    const result = buildInstallments(30_000, 3, "2026-08-10")
    expect(result).toEqual([
      { number: 1, amountCents: 10_000, dueDate: "2026-08-10" },
      { number: 2, amountCents: 10_000, dueDate: "2026-09-10" },
      { number: 3, amountCents: 10_000, dueDate: "2026-10-10" },
    ])
  })

  it("recorta el día cuando el mes destino es más corto", () => {
    const result = buildInstallments(20_000, 2, "2026-01-31")
    expect(result.map((i) => i.dueDate)).toEqual(["2026-01-31", "2026-02-28"])
  })

  it("un movimiento de contado es la cuota 1 de 1", () => {
    const result = buildInstallments(55_000, 1, "2026-08-09")
    expect(result).toEqual([
      { number: 1, amountCents: 55_000, dueDate: "2026-08-09" },
    ])
  })
})

describe("installmentsSumMatches", () => {
  it("acepta cuando la suma cierra", () => {
    expect(installmentsSumMatches(10_000, [3_333, 3_333, 3_334])).toBe(true)
  })

  it("rechaza cuando falta o sobra un centavo", () => {
    expect(installmentsSumMatches(10_000, [3_333, 3_333, 3_333])).toBe(false)
    expect(installmentsSumMatches(10_000, [3_334, 3_333, 3_334])).toBe(false)
  })

  it("rechaza una lista vacía", () => {
    expect(installmentsSumMatches(10_000, [])).toBe(false)
  })
})
