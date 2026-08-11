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

  it("convierte USD al TC del propio movimiento, no al TC del día", () => {
    const view = buildDashboardView({
      ...BASE,
      // Distinto del rate de la fila (1200) a propósito: si `toArs` usara
      // este valor en vez del rate del movimiento, el resultado sería
      // 15.000.000 en vez de 12.000.000.
      todayRate: 1_500,
      expenseCategories: [{ id: "cat-1", name: "Compras" }],
      paid: [
        {
          paidDate: "2026-08-07",
          amountCents: 10_000,
          currency: "USD",
          kind: "expense",
          rate: "1200",
        },
      ],
      movements: [
        {
          id: "mov-usd",
          date: "2026-08-07",
          kind: "expense",
          categoryId: "cat-1",
          currency: "USD",
          amountCents: 10_000,
          rate: "1200",
        },
      ],
    })

    // 10.000 centavos de dólar (100 USD) al 1200 son 12.000.000 centavos de
    // peso ($120.000). Con currency "ARS" en todos lados, como venía el test
    // net, este cálculo nunca se ejecutaba: el string del rate podía pasar
    // sin convertir, o el rate equivocado, y los cuatro tests seguían verdes.
    const expectedArsCents = 12_000_000

    expect(view.monthExpenseArsCents).toBe(expectedArsCents)
    expect(view.pie).toEqual([{ name: "Compras", arsCents: expectedArsCents }])
    expect(view.bars.find((b) => b.month === "2026-08")?.expenseArsCents).toBe(expectedArsCents)
  })

  it("cuenta en el mes lo pagado el mismo día del saldo inicial (el borde del >=)", () => {
    const view = buildDashboardView({
      ...BASE,
      paid: [
        // Exactamente initialBalanceDate, no un día después: es el borde que
        // separa "ya está adentro del saldo inicial" de "es de este mes".
        // `computeBalances` también lo incluye (su corte es `paidDate <
        // initialDate`, así que el mismo día no cae). Si acá se usara `>` en
        // vez de `>=`, esta fila saldría de la tarjeta pero seguiría adentro
        // del saldo, y las dos volverían a desincronizarse — el defecto que
        // esta tarea vino a arreglar.
        { paidDate: "2026-08-05", amountCents: 5_000, currency: "ARS", kind: "income", rate: "1" },
      ],
    })

    expect(view.monthIncomeArsCents).toBe(5_000)
    expect(view.arsCents).toBe(100_000 + 5_000)
  })

  it("la torta sólo cuenta gastos del mes actual; las barras excluyen los cambios de divisa", () => {
    const view = buildDashboardView({
      ...BASE,
      expenseCategories: [{ id: "cat-1", name: "Comida" }],
      movements: [
        // Gasto de este mes: cuenta en la torta y en la barra de agosto.
        {
          id: "exp-this",
          date: "2026-08-07",
          kind: "expense",
          categoryId: "cat-1",
          currency: "ARS",
          amountCents: 10_000,
          rate: "1",
        },
        // Ingreso de este mes: no es gasto, no entra en la torta, pero sí en
        // la barra de ingresos de agosto.
        {
          id: "inc-this",
          date: "2026-08-07",
          kind: "income",
          categoryId: null,
          currency: "ARS",
          amountCents: 20_000,
          rate: "1",
        },
        // Gasto de julio: no entra en la torta (que sólo mira el mes
        // actual), pero sí en la barra de julio.
        {
          id: "exp-prev",
          date: "2026-07-07",
          kind: "expense",
          categoryId: "cat-1",
          currency: "ARS",
          amountCents: 99_000,
          rate: "1",
        },
        // Cambio de divisa: si las barras no lo excluyeran, `bars` llamaría
        // `assertInstallmentMovementKind("exchange")` y reventaría, porque
        // no es "income" ni "expense".
        {
          id: "exch",
          date: "2026-08-08",
          kind: "exchange",
          categoryId: null,
          currency: "USD",
          amountCents: 5_000,
          rate: "1",
        },
      ],
    })

    expect(view.pie).toEqual([{ name: "Comida", arsCents: 10_000 }])

    expect(view.bars.find((b) => b.month === "2026-08")).toEqual({
      month: "2026-08",
      incomeArsCents: 20_000,
      expenseArsCents: 10_000,
    })
    expect(view.bars.find((b) => b.month === "2026-07")).toEqual({
      month: "2026-07",
      incomeArsCents: 0,
      expenseArsCents: 99_000,
    })
  })

  it("no deja pasar más de MAX_UPCOMING vencimientos, ni uno que vence después del horizonte", () => {
    const withinLimit = Array.from({ length: 25 }, (_, i) => ({
      id: `ins-${i}`,
      number: i + 1,
      dueDate: "2026-08-15",
      amountCents: 1_000,
      movementId: `mov-${i}`,
      description: `Cuota ${i}`,
      currency: "ARS",
      rate: "1",
      kind: "expense",
    }))

    const view = buildDashboardView({
      ...BASE,
      pending: [
        // Primera en la lista a propósito: si el `.slice()` corriera antes
        // que el `.filter()`, ésta entraría en los primeros 20 y recién
        // después la sacaría el filtro, dejando la lista en 19 en vez de 20.
        {
          id: "ins-far",
          number: 1,
          dueDate: "2026-09-11", // un día después del límite (2026-09-10).
          amountCents: 1_000,
          movementId: "mov-far",
          description: "Cuota lejana",
          currency: "ARS",
          rate: "1",
          kind: "expense",
        },
        ...withinLimit,
      ],
    })

    expect(view.upcoming).toHaveLength(20)
    expect(view.upcoming.some((u) => u.id === "ins-far")).toBe(false)
  })
})
