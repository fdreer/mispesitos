import { describe, it, expect } from "vitest"
import { projectBalance, spendByCategory, monthlyTotals } from "@/lib/dashboard"

describe("projectBalance", () => {
  it("arranca del saldo de hoy y aplica los pendientes por vencimiento", () => {
    const result = projectBalance(
      100_000_00,
      [
        { dueDate: "2026-09-10", arsCents: 30_000_00, kind: "expense" },
        { dueDate: "2026-10-05", arsCents: 50_000_00, kind: "income" },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-08", arsCents: 100_000_00 },
      { month: "2026-09", arsCents: 70_000_00 },
      { month: "2026-10", arsCents: 120_000_00 },
    ])
  })

  it("ignora los vencimientos posteriores al horizonte", () => {
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2027-05-01", arsCents: 999_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    expect(result.at(-1)!.arsCents).toBe(10_000_00)
  })

  it("acumula los vencimientos atrasados en el mes actual", () => {
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2026-07-01", arsCents: 4_000_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    expect(result[0].arsCents).toBe(6_000_00)
  })

  it("con la lista de pendientes vacía, repite el saldo de hoy en todos los meses", () => {
    const result = projectBalance(50_000_00, [], 3, "2026-08-09")

    expect(result).toEqual([
      { month: "2026-08", arsCents: 50_000_00 },
      { month: "2026-09", arsCents: 50_000_00 },
      { month: "2026-10", arsCents: 50_000_00 },
    ])
  })

  it("un vencimiento exactamente en el último mes del horizonte queda incluido", () => {
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2026-09-20", arsCents: 1_000_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    // Horizonte de 2 meses desde agosto: el último mes es septiembre. Un
    // vencimiento del 20/09 cae justo en ese mes (no > lastMonth) y pesa ahí.
    expect(result).toEqual([
      { month: "2026-08", arsCents: 10_000_00 },
      { month: "2026-09", arsCents: 9_000_00 },
    ])
  })
})

describe("spendByCategory", () => {
  it("suma los egresos por categoría y los ordena de mayor a menor", () => {
    const result = spendByCategory(
      [
        { categoryId: "a", arsCents: 1_000 },
        { categoryId: "b", arsCents: 5_000 },
        { categoryId: "a", arsCents: 2_000 },
      ],
      [
        { id: "a", name: "Comida" },
        { id: "b", name: "Alquiler" },
      ],
    )

    expect(result).toEqual([
      { name: "Alquiler", arsCents: 5_000 },
      { name: "Comida", arsCents: 3_000 },
    ])
  })

  it("agrupa como Sin categoría lo que no tiene", () => {
    const result = spendByCategory([{ categoryId: null, arsCents: 700 }], [])
    expect(result).toEqual([{ name: "Sin categoría", arsCents: 700 }])
  })

  it("con la lista vacía, devuelve una lista vacía", () => {
    expect(spendByCategory([], [])).toEqual([])
  })

  it("suma junto lo de dos categorías con ids distintos que comparten nombre", () => {
    // Puede pasar de verdad: el índice único de `category` es por
    // (userId, name, kind) y sólo entre las activas (Task 16), así que una
    // categoría archivada y una activa nueva pueden compartir nombre con ids
    // distintos. El gráfico agrupa por nombre, así que tienen que sumarse juntas.
    const result = spendByCategory(
      [
        { categoryId: "activa-1", arsCents: 1_000 },
        { categoryId: "archivada-1", arsCents: 2_000 },
      ],
      [
        { id: "activa-1", name: "Comida" },
        { id: "archivada-1", name: "Comida" },
      ],
    )

    expect(result).toEqual([{ name: "Comida", arsCents: 3_000 }])
  })
})

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
})
