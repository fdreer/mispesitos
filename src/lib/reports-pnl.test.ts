import { describe, expect, it } from "vitest"

import { FILTER_DEFAULTS } from "@/lib/movement-query"
import {
  buildPnlCellHref,
  buildPnlReport,
  computeVariationPct,
  monthsInRange,
  type ReportCategory,
} from "@/lib/reports-pnl"

function cat(
  id: string,
  name: string,
  kind: "income" | "expense",
  parentId: string | null = null,
): ReportCategory {
  return { id, name, kind, parentId, archived: false, color: null }
}

const CATS: ReportCategory[] = [
  cat("sueldo", "Sueldo", "income"),
  cat("freelance", "Freelance", "income"),
  cat("hogar", "Hogar", "expense"),
  cat("alquiler", "Alquiler", "expense", "hogar"),
  cat("expensas", "Expensas", "expense", "hogar"),
  cat("comida", "Comida", "expense"),
]

describe("monthsInRange", () => {
  it("devuelve todos los meses YYYY-MM del rango", () => {
    expect(monthsInRange("2026-10-15", "2027-01-05")).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ])
  })

  it("topa el máximo de meses desde el final hacia atrás", () => {
    const months = monthsInRange("2020-01-01", "2026-12-31", 12)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe("2026-01")
    expect(months[11]).toBe("2026-12")
  })

  it("no se cuelga ni falla con rangos extremos hasta el año 9999", () => {
    const months = monthsInRange("0001-01-01", "9999-12-31", 12)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe("9999-01")
    expect(months[11]).toBe("9999-12")
  })
})

describe("computeVariationPct", () => {
  it("calcula suba, baja y devuelve null cuando no hay base", () => {
    expect(computeVariationPct(120, 100)).toBeCloseTo(20)
    expect(computeVariationPct(80, 100)).toBeCloseTo(-20)
    expect(computeVariationPct(100, 0)).toBeNull()
    expect(computeVariationPct(50, -100, true)).toBeCloseTo(150)
  })
})

describe("buildPnlReport", () => {
  it("agrupa por categoría padre e hijas en pesos y dólares lado a lado sin convertir", () => {
    const view = buildPnlReport({
      from: "2026-10-01",
      to: "2026-11-30",
      categories: CATS,
      paidInstallments: [
        { paidDate: "2026-09-10", amountCents: 100_000_00, currency: "ARS", kind: "income", categoryId: "sueldo" },
        { paidDate: "2026-09-15", amountCents: 40_000_00, currency: "ARS", kind: "expense", categoryId: "alquiler" },
        { paidDate: "2026-10-05", amountCents: 150_000_00, currency: "ARS", kind: "income", categoryId: "sueldo" },
        { paidDate: "2026-10-10", amountCents: 50_000_00, currency: "ARS", kind: "expense", categoryId: "alquiler" },
        { paidDate: "2026-10-12", amountCents: 10_000_00, currency: "ARS", kind: "expense", categoryId: "expensas" },
        { paidDate: "2026-11-05", amountCents: 150_000_00, currency: "ARS", kind: "income", categoryId: "sueldo" },
        { paidDate: "2026-11-10", amountCents: 100_00, currency: "USD", kind: "expense", categoryId: "comida" },
      ],
    })

    expect(view.months).toEqual(["2026-10", "2026-11"])
    expect(view.summary.ars).toEqual({
      incomeCents: 300_000_00,
      expenseCents: 60_000_00,
      netCents: 240_000_00,
      savingsRatePct: 80,
    })
    expect(view.summary.usd).toEqual({
      incomeCents: 0,
      expenseCents: 100_00,
      netCents: -100_00,
      savingsRatePct: null,
    })

    expect(view.incomeRows).toHaveLength(1)
    expect(view.incomeRows[0].name).toBe("Sueldo")
    expect(view.incomeRows[0].cells[0]).toMatchObject({ month: "2026-10", arsCents: 150_000_00, usdCents: 0 })
    expect(view.incomeRows[0].cells[0].arsVariationPct).toBeCloseTo(50)
    expect(view.incomeRows[0].cells[1].arsVariationPct).toBeCloseTo(0)

    expect(view.expenseRows.map((r) => [r.name, r.totalArsCents, r.totalUsdCents])).toEqual([
      ["Hogar", 60_000_00, 0],
      ["Comida", 0, 100_00],
    ])
    expect(view.expenseRows[0].children.map((c) => [c.name, c.totalArsCents])).toEqual([
      ["Alquiler", 50_000_00],
      ["Expensas", 10_000_00],
    ])
    expect(view.chart.ars).toEqual([
      { month: "2026-10", label: "oct 26", incomeCents: 150_000_00, expenseCents: 60_000_00, netCents: 90_000_00 },
      { month: "2026-11", label: "nov 26", incomeCents: 150_000_00, expenseCents: 0, netCents: 150_000_00 },
    ])
    expect(view.chart.usd).toEqual([
      { month: "2026-10", label: "oct 26", incomeCents: 0, expenseCents: 0, netCents: 0 },
      { month: "2026-11", label: "nov 26", incomeCents: 0, expenseCents: 100_00, netCents: -100_00 },
    ])
  })
})

describe("buildPnlCellHref", () => {
  it("arma el enlace al listado con categoría, mes acotado y por=pago", () => {
    expect(
      buildPnlCellHref({
        kind: "expense",
        categoryIds: ["hogar"],
        month: "2026-10",
        effectiveFrom: "2026-10-10",
        effectiveTo: "2026-11-30",
        filters: FILTER_DEFAULTS,
      }),
    ).toBe("/egresos?categoryId=hogar&from=2026-10-10&to=2026-10-31&por=pago")

    expect(
      buildPnlCellHref({
        kind: "income",
        categoryIds: ["sueldo"],
        month: null,
        effectiveFrom: "2026-10-01",
        effectiveTo: "2026-11-30",
        currency: "USD",
        filters: { ...FILTER_DEFAULTS, cardId: "visa", search: "bono" },
      }),
    ).toBe("/ingresos?search=bono&categoryId=sueldo&currency=USD&from=2026-10-01&to=2026-11-30&por=pago")
  })
})
