import { describe, expect, it } from "vitest"

import { computeBalances } from "@/lib/balance"
import { buildCashflowReport, type CashflowInput } from "@/lib/reports-cashflow"

const BASE: CashflowInput = {
  today: "2026-11-15",
  from: "2026-10-01",
  to: "2027-01-31",
  granularity: "mensual",
  currencyMode: "ARS",
  settings: {
    initialBalanceArsCents: 100_000,
    initialBalanceUsdCents: 10_000,
    initialBalanceUsdRate: "1000",
    initialBalanceDate: "2026-09-01",
  },
  paid: [],
  exchanges: [],
  pending: [],
}

describe("buildCashflowReport", () => {
  it("arranca cada mes con el saldo real acumulado previo e incluye compra/venta en cada moneda", () => {
    const paid = [
      // Septiembre (fuera del rango visible, pero mueve el saldo inicial de octubre):
      { paidDate: "2026-09-10" as const, amountCents: 50_000, currency: "ARS", kind: "income", rate: "1" },
      // Octubre (mes pasado real):
      { paidDate: "2026-10-05" as const, amountCents: 20_000, currency: "ARS", kind: "expense", rate: "1" },
      // Antes del saldo inicial: se ignora igual que computeBalances.
      { paidDate: "2026-08-20" as const, amountCents: 999_999, currency: "ARS", kind: "income", rate: "1" },
    ]
    const exchanges = [
      // Compra US$ 10 a $1.200 en octubre: salida de $12.000 en ARS y entrada de US$ 10 en USD.
      { date: "2026-10-20" as const, amountCents: 1_000, rate: "1200", direction: "buy" },
    ]

    const ars = buildCashflowReport({ ...BASE, paid, exchanges, currencyMode: "ARS" })
    const octArs = ars.rows.find((r) => r.key === "2026-10")!
    expect(octArs).toMatchObject({
      kind: "real",
      initialCents: 150_000, // 100.000 + 50.000 de septiembre
      inflowsCents: 0,
      outflowsCents: 20_000 + 1_200_000,
      closingCents: 150_000 - 20_000 - 1_200_000,
    })

    // Invariante contra computeBalances en ARS y USD sin cuotas pendientes:
    const balances = computeBalances(
      {
        initialArsCents: BASE.settings.initialBalanceArsCents,
        initialUsdCents: BASE.settings.initialBalanceUsdCents,
        initialDate: BASE.settings.initialBalanceDate,
      },
      paid.map((p) => ({
        paidDate: p.paidDate,
        currency: p.currency as "ARS" | "USD",
        kind: p.kind as "income" | "expense",
        amountCents: p.amountCents,
      })),
      exchanges.map((e) => ({
        date: e.date,
        direction: e.direction as "buy" | "sell",
        usdCents: e.amountCents,
        rate: Number(e.rate),
      })),
    )
    expect(ars.currentBalanceCents).toBe(balances.arsCents)
    expect(ars.rows.find((r) => r.key === "2026-11")?.closingCents).toBe(balances.arsCents)

    const usd = buildCashflowReport({ ...BASE, paid, exchanges, currencyMode: "USD" })
    expect(usd.currentBalanceCents).toBe(balances.usdCents)
    expect(usd.rows.find((r) => r.key === "2026-10")).toMatchObject({
      initialCents: 10_000,
      inflowsCents: 1_000,
      outflowsCents: 0,
      closingCents: 11_000,
    })

    // En "Todo en pesos", los cambios de divisa netean a 0 (no aparecen en entradas/salidas):
    const todo = buildCashflowReport({ ...BASE, paid, exchanges, currencyMode: "todo" })
    expect(todo.rows.find((r) => r.key === "2026-10")).toMatchObject({
      // 100_000 ARS + US$100 * 1000 = 10_100_000 + 50_000 de septiembre = 10_150_000
      initialCents: 10_150_000,
      inflowsCents: 0,
      outflowsCents: 20_000,
    })
  })

  it("separa Atrasado del mes actual, combina real + pendiente del resto del mes y avisa si queda negativo", () => {
    const view = buildCashflowReport({
      ...BASE,
      paid: [
        // Ya pagado en noviembre:
        { paidDate: "2026-11-05", amountCents: 20_000, currency: "ARS", kind: "income", rate: "1" },
      ],
      pending: [
        // Vencido impago (atrasado, < 2026-11-15): NO entra en noviembre, va a overdue:
        { id: "p1", dueDate: "2026-11-01", amountCents: 70_000, currency: "ARS", rate: "1", kind: "expense" },
        // Pendiente del resto de noviembre (>= 2026-11-15):
        { id: "p2", dueDate: "2026-11-25", amountCents: 40_000, currency: "ARS", rate: "1", kind: "expense" },
        // Diciembre (proyectado, resumen tarjeta incluido):
        { id: "p3", dueDate: "2026-12-10", amountCents: 30_000, currency: "ARS", rate: "1", kind: "expense" },
      ],
    })

    expect(view.overdue).toEqual({
      expenseCents: 70_000,
      incomeCents: 0,
      netCents: -70_000,
      expenseCount: 1,
      incomeCount: 0,
    })

    // Noviembre: inicial 100k + real 20k - pendiente resto del mes 40k = 80k (sin p1 adentro)
    const nov = view.rows.find((r) => r.key === "2026-11")!
    expect(nov).toMatchObject({
      kind: "mixed",
      initialCents: 100_000,
      inflowsCents: 20_000,
      outflowsCents: 40_000,
      netCents: -20_000,
      closingCents: 80_000,
    })

    // Diciembre: inicial 80k - 30k = 50k. Con los 70k atrasados -> -20k -> falta $200,00 en diciembre!
    const dec = view.rows.find((r) => r.key === "2026-12")!
    expect(dec).toMatchObject({
      kind: "projected",
      initialCents: 80_000,
      outflowsCents: 30_000,
      closingCents: 50_000,
    })

    expect(view.negativeAlert).toEqual({
      periodKey: "2026-12",
      periodLabel: "diciembre",
      shortageCents: 20_000,
      includesOverdue: true,
    })
  })

  it("arma ventanas semanales móviles de 7 días para los próximos 3 meses", () => {
    const view = buildCashflowReport({
      ...BASE,
      today: "2026-11-15",
      granularity: "semanal",
      pending: [
        { id: "p1", dueDate: "2026-11-15", amountCents: 30_000, currency: "ARS", rate: "1", kind: "expense" },
        { id: "p2", dueDate: "2026-11-23", amountCents: 150_000, currency: "ARS", rate: "1", kind: "expense" },
        // Fuera del horizonte de 3 meses (> 2027-02-15):
        { id: "p3", dueDate: "2027-02-20", amountCents: 999_000, currency: "ARS", rate: "1", kind: "expense" },
      ],
    })

    expect(view.rows[0]).toMatchObject({
      from: "2026-11-15",
      to: "2026-11-21",
      kind: "projected",
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

  it("deja en cero y marcados como previos los meses anteriores al saldo inicial", () => {
    const view = buildCashflowReport({
      ...BASE,
      from: "2026-08-01",
      to: "2026-10-31",
      paid: [
        { paidDate: "2026-08-15", amountCents: 50_000, currency: "ARS", kind: "expense", rate: "1" },
      ],
    })

    expect(view.rows[0]).toMatchObject({
      key: "2026-08",
      beforeInitialBalance: true,
      initialCents: 0,
      outflowsCents: 0,
      closingCents: 0,
    })
    expect(view.rows[1]).toMatchObject({
      key: "2026-09",
      beforeInitialBalance: false,
      initialCents: 100_000,
    })
  })

  it("ignora cambios de divisa con fecha futura de forma consistente con el saldo real", () => {
    const view = buildCashflowReport({
      ...BASE,
      exchanges: [
        { date: "2026-11-25", amountCents: 1_000, rate: "1200", direction: "buy" },
      ],
    })
    const nov = view.rows.find((r) => r.key === "2026-11")!
    expect(view.currentBalanceCents).toBe(100_000)
    expect(nov.outflowsCents).toBe(0)
    expect(nov.closingCents).toBe(100_000)
  })
})
