import { describe, expect, it } from "vitest"

import { buildDashboardView, type DashboardInput } from "@/lib/dashboard-view"

const BASE: DashboardInput = {
  today: "2026-08-10",
  settings: {
    initialBalanceArsCents: 100_000,
    initialBalanceUsdCents: 0,
    initialBalanceDate: "2026-08-05",
  },
  todayRate: 1_500,
  paid: [],
  exchanges: [],
  pending: [],
  movements: [],
  expenseCategories: [],
  horizonMonths: 6,
  historyMonths: 12,
}

describe("buildDashboardView", () => {
  it("no cuenta en el mes lo pagado antes del saldo inicial", () => {
    const view = buildDashboardView({
      ...BASE,
      paid: [
        // Anterior al saldo inicial: ya está adentro de esos $1.000, contarlo
        // acá lo contaría dos veces.
        { paidDate: "2026-08-01", amountCents: 50_000, currency: "ARS", kind: "income", rate: "1" },
        // Posterior: sí cuenta.
        { paidDate: "2026-08-07", amountCents: 20_000, currency: "ARS", kind: "income", rate: "1" },
      ],
    })

    expect(view.monthIncomeArsCents).toBe(20_000)
    // Y coincide con lo que el saldo hizo con las mismas dos filas.
    expect(view.arsCents).toBe(100_000 + 20_000)
  })

  it("marca vencido el movimiento entero, no sólo la cuota que venció", () => {
    const view = buildDashboardView({
      ...BASE,
      pending: [
        {
          id: "ins-1",
          number: 1,
          dueDate: "2026-08-01",
          amountCents: 10_000,
          movementId: "mov-1",
          description: "Televisor",
          currency: "ARS",
          rate: "1",
          kind: "expense",
        },
        {
          id: "ins-2",
          number: 2,
          dueDate: "2026-09-01",
          amountCents: 10_000,
          movementId: "mov-1",
          description: "Televisor",
          currency: "ARS",
          rate: "1",
          kind: "expense",
        },
      ],
    })

    // La cuota 2 todavía no venció, pero su movimiento sí: el enlace tiene que
    // llevar a la lista donde el movimiento aparece, o deja al usuario en una
    // lista vacía.
    expect(view.upcoming.map((u) => u.status)).toEqual(["overdue", "overdue"])
  })

  it("consolida la tenencia en dólares al TC de venta", () => {
    const view = buildDashboardView({
      ...BASE,
      settings: { ...BASE.settings, initialBalanceUsdCents: 10_000 },
      todayRate: 1_500,
    })

    // 100 dólares a 1500 son 150.000 pesos, más los 1.000 de saldo en pesos.
    expect(view.consolidatedArsCents).toBe(100_000 + 15_000_000)
  })

  it("deja la proyección en null cuando hay dólares y no hay cotización", () => {
    const view = buildDashboardView({
      ...BASE,
      settings: { ...BASE.settings, initialBalanceUsdCents: 10_000 },
      todayRate: null,
    })

    expect(view.projection).toBeNull()
    expect(view.consolidatedArsCents).toBeNull()
  })
})
