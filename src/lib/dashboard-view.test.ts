import { describe, expect, it } from "vitest"

import { buildDashboardView, type DashboardInput } from "@/lib/dashboard-view"

function cat(id: string, name: string, parentId: string | null = null) {
  return { id, name, parentId, archived: false, color: null }
}

function tortaArs(view: ReturnType<typeof buildDashboardView>) {
  return view.pie.ars.map(({ name, arsCents }) => ({ name, arsCents }))
}

const OFFICIAL_RATE = {
  compra: 1_500,
  venta: 1_550,
  fetchedAt: new Date("2026-08-10T15:00:00Z"),
  stale: false,
}

const BASE: DashboardInput = {
  today: "2026-08-10",
  settings: {
    initialBalanceArsCents: 100_000,
    initialBalanceUsdCents: 0,
    initialBalanceDate: "2026-08-05",
  },
  officialRate: OFFICIAL_RATE,
  paid: [],
  exchanges: [],
  pending: [],
  expenseCategories: [],
  horizonMonths: 6,
  historyMonths: 12,
}

describe("buildDashboardView", () => {
  it("no cuenta en el mes lo pagado antes del saldo inicial", () => {
    const view = buildDashboardView({
      ...BASE,
      paid: [
        { paidDate: "2026-08-01", amountCents: 50_000, currency: "ARS", kind: "income", categoryId: null },
        { paidDate: "2026-08-07", amountCents: 20_000, currency: "ARS", kind: "income", categoryId: null },
      ],
    })

    expect(view.monthIncomeArsCents).toBe(20_000)
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
          kind: "expense",
        },
      ],
    })

    expect(view.upcomingPayments.map((u) => u.status)).toEqual(["overdue", "overdue"])
  })

  it("separa los pagos impagos del mes actual y del mes siguiente por moneda", () => {
    const pending = [
      {
        id: "exp-overdue",
        number: 1,
        dueDate: "2026-07-31" as const,
        amountCents: 10_000,
        movementId: "mov-overdue",
        description: "Vencido",
        currency: "ARS",
        kind: "expense",
      },
      {
        id: "exp-current",
        number: 1,
        dueDate: "2026-08-31" as const,
        amountCents: 100_00,
        movementId: "mov-current",
        description: "Este mes en dólares",
        currency: "USD",
        kind: "expense",
      },
      {
        id: "exp-next",
        number: 1,
        dueDate: "2026-09-30" as const,
        amountCents: 30_000,
        movementId: "mov-next",
        description: "Mes siguiente",
        currency: "ARS",
        kind: "expense",
      },
      {
        id: "income-current",
        number: 1,
        dueDate: "2026-08-20" as const,
        amountCents: 40_000,
        movementId: "mov-income",
        description: "Cobro",
        currency: "ARS",
        kind: "income",
      },
    ]

    const view = buildDashboardView({ ...BASE, pending })

    expect(view.paymentsThisMonth).toEqual({
      arsCents: 10_000,
      usdCents: 100_00,
      count: 2,
      overdueCount: 1,
    })
    expect(view.paymentsNextMonth).toEqual({ arsCents: 30_000, usdCents: 0, count: 1 })
  })

  it("consolida el saldo en dólares al oficial comprador, igual que el flujo", () => {
    const view = buildDashboardView({
      ...BASE,
      settings: { ...BASE.settings, initialBalanceUsdCents: 10_000 },
    })

    expect(view.consolidatedArsCents).toBe(100_000 + 15_000_000)
    expect(view.projection?.[0].arsCents).toBe(100_000 + 15_000_000)
  })

  it("deja la proyección en null cuando hay dólares y no hay cotización oficial", () => {
    const view = buildDashboardView({
      ...BASE,
      settings: { ...BASE.settings, initialBalanceUsdCents: 10_000 },
      officialRate: null,
    })

    expect(view.projection).toBeNull()
    expect(view.consolidatedArsCents).toBeNull()
  })

  it("mantiene USD separados en torta, barras y totales del mes sin convertir", () => {
    const view = buildDashboardView({
      ...BASE,
      expenseCategories: [cat("cat-1", "Compras")],
      paid: [
        {
          paidDate: "2026-08-07",
          amountCents: 10_000,
          currency: "USD",
          kind: "expense",
          categoryId: "cat-1",
        },
      ],
    })

    expect(view.monthExpenseArsCents).toBe(0)
    expect(view.monthExpenseUsdCents).toBe(10_000)
    expect(view.pie.ars).toEqual([])
    expect(view.pie.usd.map(({ name, arsCents }) => ({ name, arsCents }))).toEqual([
      { name: "Compras", arsCents: 10_000 },
    ])
    expect(view.bars.usd.find((b) => b.month === "2026-08")?.expenseCents).toBe(10_000)
  })

  it("la torta y las barras suman cuotas pagadas por su fecha de pago", () => {
    const view = buildDashboardView({
      ...BASE,
      today: "2026-09-10",
      expenseCategories: [cat("cat-1", "Electro")],
      paid: [
        { paidDate: "2026-08-15", amountCents: 100_000, currency: "ARS", kind: "expense", categoryId: "cat-1" },
        { paidDate: "2026-09-02", amountCents: 100_000, currency: "ARS", kind: "expense", categoryId: "cat-1" },
        { paidDate: "2026-09-05", amountCents: 50_000, currency: "ARS", kind: "income", categoryId: null },
        { paidDate: "2026-09-06", amountCents: 7_000, currency: "ARS", kind: "expense", categoryId: null },
      ],
    })

    expect(tortaArs(view)).toEqual([
      { name: "Electro", arsCents: 100_000 },
      { name: "Sin categoría", arsCents: 7_000 },
    ])
    expect(view.bars.ars.find((b) => b.month === "2026-09")).toEqual({
      month: "2026-09",
      incomeCents: 50_000,
      expenseCents: 107_000,
    })
  })

  describe("cambios de divisa", () => {
    const COMPRA = { date: "2026-08-06", amountCents: 10_000, rate: "1450.5000" }

    it("una compra saca pesos y suma dólares, y el consolidado valúa al oficial comprador", () => {
      const view = buildDashboardView({
        ...BASE,
        exchanges: [{ ...COMPRA, direction: "buy" }],
      })

      expect(view.arsCents).toBe(100_000 - 14_505_000)
      expect(view.usdCents).toBe(10_000)
      expect(view.consolidatedArsCents).toBe(100_000 - 14_505_000 + 15_000_000)
    })

    it("revienta con un cambio sin dirección", () => {
      expect(() =>
        buildDashboardView({ ...BASE, exchanges: [{ ...COMPRA, direction: null }] }),
      ).toThrow(/direction inesperada/)
    })
  })

  it("agrupa las cuotas con tarjeta en un renglón por resumen", () => {
    const conTarjeta = (id: string, movementId: string, amountCents: number, currency = "ARS") => ({
      id,
      number: 1,
      dueDate: "2026-08-20",
      amountCents,
      movementId,
      description: movementId,
      currency,
      kind: "expense",
      statementId: "res-1",
      statementPeriod: "2026-07",
      cardId: "visa",
      cardName: "Visa",
    })
    const view = buildDashboardView({
      ...BASE,
      pending: [
        conTarjeta("i1", "Heladera", 30_000),
        conTarjeta("i2", "Zapatillas", 20_000),
        conTarjeta("i3", "Netflix", 1_000, "USD"),
        {
          id: "i4",
          number: 1,
          dueDate: "2026-08-15",
          amountCents: 5_000,
          movementId: "Luz",
          description: "Luz",
          currency: "ARS",
          kind: "expense",
        },
      ],
    })

    expect(view.upcomingPayments).toEqual([
      expect.objectContaining({ id: "i4", description: "Luz" }),
      {
        type: "statement",
        id: "res-1",
        cardId: "visa",
        cardName: "Visa",
        period: "2026-07",
        dueDate: "2026-08-20",
        arsCents: 50_000,
        usdCents: 1_000,
        kind: "expense",
        status: "pending",
      },
    ])
    expect(view.paymentsThisMonth).toEqual({
      arsCents: 5_000 + 50_000,
      usdCents: 1_000,
      count: 2,
      overdueCount: 0,
    })
  })
})
