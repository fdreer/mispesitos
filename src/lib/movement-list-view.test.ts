import { describe, expect, it } from "vitest"

import {
  groupModeFor,
  groupMovements,
  pluralize,
  sortMovements,
  summarizeMovementCounts,
  summarizeMovementTotals,
  type MovementForList,
} from "@/lib/movement-list-view"

const HOY = "2026-11-05"

function mov(id: string, overrides: Partial<MovementForList> = {}): MovementForList {
  return {
    id,
    date: "2026-11-01",
    amountCents: 100_00,
    currency: "ARS",
    rate: "1",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    installments: [{ amountCents: 100_00, dueDate: "2026-11-01", paid: false }],
    ...overrides,
  }
}

describe("summarizeMovementCounts", () => {
  it("cuenta todos, vencidos, pendientes y pagados", () => {
    const lista = [
      mov("v1", { installments: [{ amountCents: 100, dueDate: "2026-11-01", paid: false }] }),
      mov("p1", { installments: [{ amountCents: 100, dueDate: "2026-11-05", paid: false }] }),
      mov("p2", { installments: [{ amountCents: 100, dueDate: "2026-12-10", paid: false }] }),
      mov("ok", { installments: [{ amountCents: 100, dueDate: "2026-11-01", paid: true }] }),
    ]
    expect(summarizeMovementCounts(lista, HOY)).toEqual({
      all: 4,
      overdue: 1,
      pending: 2,
      paid: 1,
    })
  })
})

describe("summarizeMovementTotals", () => {
  it("reparte cuotas pagadas, vencidas y pendientes por moneda", () => {
    const mixto = mov("m1", {
      currency: "ARS",
      installments: [
        { amountCents: 10_000, dueDate: "2026-11-01", paid: true },
        { amountCents: 20_000, dueDate: "2026-11-03", paid: false },
        { amountCents: 30_000, dueDate: "2026-12-20", paid: false },
      ],
    })
    const enUsd = mov("m2", {
      currency: "USD",
      rate: "1200",
      installments: [{ amountCents: 50_00, dueDate: "2026-11-08", paid: false }],
    })
    expect(summarizeMovementTotals([mixto, enUsd], HOY)).toEqual({
      paid: { arsCents: 10_000, usdCents: 0 },
      overdue: { arsCents: 20_000, usdCents: 0 },
      pending: { arsCents: 30_000, usdCents: 50_00 },
    })
  })
})

describe("sortMovements", () => {
  const a = mov("a", {
    date: "2026-11-01",
    amountCents: 50_000,
    installments: [{ amountCents: 50_000, dueDate: "2026-12-10", paid: false }],
  })
  const b = mov("b", {
    date: "2026-11-15",
    amountCents: 100_00,
    currency: "USD",
    rate: "1000",
    installments: [{ amountCents: 100_00, dueDate: "2026-11-20", paid: false }],
  })
  const c = mov("c", {
    date: "2026-11-25",
    amountCents: 20_000,
    installments: [{ amountCents: 20_000, dueDate: "2026-11-05", paid: true }],
  })

  it("por vencimiento deja primero los impagos ordenados ascendente y al final los pagados", () => {
    expect(sortMovements([a, b, c], "due").map((m) => m.id)).toEqual(["b", "a", "c"])
  })

  it("por fecha ordena de más nuevo a más viejo", () => {
    expect(sortMovements([a, b, c], "date").map((m) => m.id)).toEqual(["c", "b", "a"])
  })

  it("por importe consolida a pesos para comparar ARS y USD juntos", () => {
    expect(sortMovements([a, b, c], "amount").map((m) => m.id)).toEqual(["b", "a", "c"])
  })
})

describe("groupMovements", () => {
  it("agrupa egresos en Vencidos, Esta semana, Este mes, Más adelante y Pagados", () => {
    const items = [
      mov("vencido", { installments: [{ amountCents: 1, dueDate: "2026-11-04", paid: false }] }),
      mov("semana", { installments: [{ amountCents: 1, dueDate: "2026-11-09", paid: false }] }),
      mov("mes", { installments: [{ amountCents: 1, dueDate: "2026-11-25", paid: false }] }),
      mov("adelante", { installments: [{ amountCents: 1, dueDate: "2026-12-15", paid: false }] }),
      mov("pago", { installments: [{ amountCents: 1, dueDate: "2026-11-01", paid: true }] }),
    ]

    const groups = groupMovements(items, "due", HOY, "Pagados")
    expect(groups.map((g) => ({ label: g.label, ids: g.items.map((i) => i.id) }))).toEqual([
      { label: "Vencidos", ids: ["vencido"] },
      { label: "Esta semana", ids: ["semana"] },
      { label: "Este mes", ids: ["mes"] },
      { label: "Más adelante", ids: ["adelante"] },
      { label: "Pagados", ids: ["pago"] },
    ])
  })

  it("agrupa ingresos por mes", () => {
    const items = [
      mov("nov1", { date: "2026-11-20" }),
      mov("nov2", { date: "2026-11-02" }),
      mov("oct1", { date: "2026-10-15" }),
    ]

    const groups = groupMovements(items, "month", HOY)
    expect(groups.map((g) => ({ label: g.label, ids: g.items.map((i) => i.id) }))).toEqual([
      { label: "Noviembre 2026", ids: ["nov1", "nov2"] },
      { label: "Octubre 2026", ids: ["oct1"] },
    ])
  })

  it("elige el modo según pantalla y orden", () => {
    expect(groupModeFor("expense", "due")).toBe("due")
    expect(groupModeFor("income", "date")).toBe("month")
    expect(groupModeFor("expense", "amount")).toBe("none")
  })
})

describe("pluralize", () => {
  it("usa singular sólo para 1", () => {
    expect(pluralize(1, "pendiente", "pendientes")).toBe("1 pendiente")
    expect(pluralize(0, "pendiente", "pendientes")).toBe("0 pendientes")
    expect(pluralize(2, "vencida", "vencidas")).toBe("2 vencidas")
  })
})
