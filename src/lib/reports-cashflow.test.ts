import { describe, expect, it } from "vitest"

import { buildCashflowReport, type CashflowInput } from "@/lib/reports-cashflow"

const OFFICIAL_RATE = {
  compra: 1100,
  venta: 1150,
  fetchedAt: new Date("2026-11-15T17:30:00Z"),
  stale: false,
}

const BASE: CashflowInput = {
  today: "2026-11-15",
  from: "2026-11-15",
  to: "2027-01-31",
  granularity: "mensual",
  balances: { arsCents: 100_000, usdCents: 10_00 },
  pending: [],
  officialRate: OFFICIAL_RATE,
}

describe("buildCashflowReport", () => {
  it("arranca desde hoy con saldo $ + saldo US$ × compra, e ingresos USD × compra / egresos USD × venta", () => {
    const view = buildCashflowReport({
      ...BASE,
      pending: [
        // Ingreso USD en noviembre (después de hoy): 20 × 1100 = 22.000
        { id: "i1", dueDate: "2026-11-20", amountCents: 20_00, currency: "USD", kind: "income" },
        // Egreso USD en noviembre (tarjeta): 10 × 1150 = 11.500
        {
          id: "e1",
          dueDate: "2026-11-25",
          amountCents: 10_00,
          currency: "USD",
          kind: "expense",
          statementId: "st1",
          statementPeriod: "2026-11",
          cardId: "c1",
          cardName: "Visa",
        },
        // Egreso ARS en diciembre
        { id: "e2", dueDate: "2026-12-10", amountCents: 50_000, currency: "ARS", kind: "expense" },
      ],
    })

    // Punto de partida: 100.000 + 10_00 * 1100 = 1.200.000
    expect(view.usdBalanceInArsCents).toBe(1_100_000)
    expect(view.currentBalanceCents).toBe(1_200_000)
    expect(view.missingRateForUsd).toBe(false)

    const nov = view.rows.find((r) => r.key === "2026-11")!
    expect(nov).toMatchObject({
      from: "2026-11-15",
      to: "2026-11-30",
      initialCents: 1_200_000,
      inflowsCents: 2_200_000,
      outflowsCents: 1_150_000,
      netCents: 1_050_000,
      closingCents: 2_250_000,
    })

    const dec = view.rows.find((r) => r.key === "2026-12")!
    expect(dec).toMatchObject({
      initialCents: 2_250_000,
      outflowsCents: 50_000,
      closingCents: 2_200_000,
    })

    expect(view.upcomingCards).toEqual([
      {
        id: "st1",
        cardId: "c1",
        cardName: "Visa",
        period: "2026-11",
        dueDate: "2026-11-25",
        arsCents: 0,
        usdCents: 10_00,
        usdInArsCents: 1_150_000,
      },
    ])
  })

  it("separa Atrasado del mes actual y avisa si queda negativo contando lo atrasado", () => {
    const view = buildCashflowReport({
      ...BASE,
      balances: { arsCents: 100_000, usdCents: 0 },
      pending: [
        { id: "p1", dueDate: "2026-11-01", amountCents: 70_000, currency: "ARS", kind: "expense" },
        { id: "p2", dueDate: "2026-11-25", amountCents: 40_000, currency: "ARS", kind: "expense" },
        { id: "p3", dueDate: "2026-12-10", amountCents: 30_000, currency: "ARS", kind: "expense" },
      ],
    })

    expect(view.overdue).toMatchObject({
      expenseCents: 70_000,
      incomeCents: 0,
      netCents: -70_000,
      expenseCount: 1,
      incomeCount: 0,
    })

    expect(view.rows.find((r) => r.key === "2026-11")).toMatchObject({
      initialCents: 100_000,
      outflowsCents: 40_000,
      closingCents: 60_000,
    })

    expect(view.negativeAlert).toEqual({
      periodKey: "2026-11",
      periodLabel: "noviembre",
      shortageCents: 10_000,
      includesOverdue: true,
    })
  })

  it("arma ventanas semanales móviles de 7 días para los próximos 3 meses", () => {
    const view = buildCashflowReport({
      ...BASE,
      balances: { arsCents: 100_000, usdCents: 0 },
      granularity: "semanal",
      pending: [
        { id: "p1", dueDate: "2026-11-15", amountCents: 30_000, currency: "ARS", kind: "expense" },
        { id: "p2", dueDate: "2026-11-23", amountCents: 150_000, currency: "ARS", kind: "expense" },
        { id: "p3", dueDate: "2027-02-20", amountCents: 999_000, currency: "ARS", kind: "expense" },
      ],
    })

    expect(view.rows[0]).toMatchObject({
      from: "2026-11-15",
      to: "2026-11-21",
      initialCents: 100_000,
      outflowsCents: 30_000,
      closingCents: 70_000,
    })
    expect(view.rows[1]).toMatchObject({
      from: "2026-11-22",
      to: "2026-11-28",
      initialCents: 70_000,
      outflowsCents: 150_000,
      closingCents: -80_000,
    })
    expect(view.rows.at(-1)?.to).toBe("2027-02-15")
    expect(view.negativeAlert).toEqual({
      periodKey: "2026-11-22",
      periodLabel: "la semana del 22/11",
      shortageCents: 80_000,
      includesOverdue: false,
    })
  })

  it("sin cotización oficial no convierte los dólares y marca missingRateForUsd", () => {
    const view = buildCashflowReport({
      ...BASE,
      officialRate: null,
      pending: [
        { id: "u1", dueDate: "2026-11-20", amountCents: 50_00, currency: "USD", kind: "expense" },
        { id: "a1", dueDate: "2026-11-20", amountCents: 20_000, currency: "ARS", kind: "expense" },
      ],
    })

    expect(view.missingRateForUsd).toBe(true)
    expect(view.usdBalanceInArsCents).toBeNull()
    expect(view.currentBalanceCents).toBe(100_000)
    expect(view.rows[0].outflowsCents).toBe(20_000)
  })
})
