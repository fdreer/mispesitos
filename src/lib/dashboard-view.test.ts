import { describe, expect, it } from "vitest"

import { buildDashboardView, type DashboardInput } from "@/lib/dashboard-view"

/** Una categoría de egresos, de primer nivel salvo que se diga otra cosa. */
function cat(id: string, name: string, parentId: string | null = null) {
  return { id, name, parentId, archived: false, color: null }
}

/** La torta sin ids, tonos ni desglose: lo que se compara en la mayoría de los casos. */
function torta(view: ReturnType<typeof buildDashboardView>) {
  return view.pie.map(({ name, arsCents }) => ({ name, arsCents }))
}

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
        { paidDate: "2026-08-01", amountCents: 50_000, currency: "ARS", kind: "income", categoryId: null, rate: "1" },
        // Posterior: sí cuenta.
        { paidDate: "2026-08-07", amountCents: 20_000, currency: "ARS", kind: "income", categoryId: null, rate: "1" },
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
    expect(view.upcomingPayments.map((u) => u.status)).toEqual(["overdue", "overdue"])
  })

  it("separa los pagos impagos del mes actual y del mes siguiente", () => {
    const pending = [
      {
        id: "exp-overdue",
        number: 1,
        dueDate: "2026-07-31" as const,
        amountCents: 10_000,
        movementId: "mov-overdue",
        description: "Vencido",
        currency: "ARS",
        rate: "1",
        kind: "expense",
      },
      {
        id: "exp-current",
        number: 1,
        dueDate: "2026-08-31" as const,
        amountCents: 100,
        movementId: "mov-current",
        description: "Este mes en dólares",
        currency: "USD",
        rate: "1200",
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
        rate: "1",
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
        rate: "1",
        kind: "income",
      },
    ]

    const view = buildDashboardView({ ...BASE, pending })

    expect(view.paymentsThisMonth).toEqual({ arsCents: 130_000, count: 2, overdueCount: 1 })
    expect(view.paymentsNextMonth).toEqual({ arsCents: 30_000, count: 1 })
  })

  it("separa vencimientos a pagar y a cobrar hasta el fin del mes siguiente", () => {
    const row = {
      number: 1,
      amountCents: 10_000,
      currency: "ARS",
      rate: "1",
    }
    const view = buildDashboardView({
      ...BASE,
      pending: [
        {
          ...row,
          id: "expense-next",
          dueDate: "2026-09-30",
          movementId: "mov-expense",
          description: "A pagar",
          kind: "expense",
        },
        {
          ...row,
          id: "income-current",
          dueDate: "2026-08-20",
          movementId: "mov-income",
          description: "A cobrar",
          kind: "income",
        },
        {
          ...row,
          id: "outside-window",
          dueDate: "2026-10-01",
          movementId: "mov-later",
          description: "Más adelante",
          kind: "expense",
        },
      ],
    })

    expect(view.upcomingPayments.map((item) => item.id)).toEqual(["expense-next"])
    expect(view.upcomingReceivables.map((item) => item.id)).toEqual(["income-current"])
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
      expenseCategories: [cat("cat-1", "Compras")],
      paid: [
        {
          paidDate: "2026-08-07",
          amountCents: 10_000,
          currency: "USD",
          kind: "expense",
          categoryId: "cat-1",
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
    expect(torta(view)).toEqual([{ name: "Compras", arsCents: expectedArsCents }])
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
        { paidDate: "2026-08-05", amountCents: 5_000, currency: "ARS", kind: "income", categoryId: null, rate: "1" },
      ],
    })

    expect(view.monthIncomeArsCents).toBe(5_000)
    expect(view.arsCents).toBe(100_000 + 5_000)
  })

  it("la torta y las barras suman cuotas pagadas por su fecha de pago, no el movimiento entero", () => {
    const view = buildDashboardView({
      ...BASE,
      today: "2026-09-10",
      expenseCategories: [cat("cat-1", "Electro")],
      paid: [
        // Televisor en 12 cuotas cargado en agosto: sólo cuentan las dos
        // cuotas pagadas, cada una en su mes de pago, y no el $1.200.000.
        { paidDate: "2026-08-15", amountCents: 100_000, currency: "ARS", kind: "expense", categoryId: "cat-1", rate: "1" },
        { paidDate: "2026-09-02", amountCents: 100_000, currency: "ARS", kind: "expense", categoryId: "cat-1", rate: "1" },
        // Ingreso cobrado en septiembre: barra de ingresos, no torta.
        { paidDate: "2026-09-05", amountCents: 50_000, currency: "ARS", kind: "income", categoryId: null, rate: "1" },
        // Gasto sin categoría pagado este mes.
        { paidDate: "2026-09-06", amountCents: 7_000, currency: "ARS", kind: "expense", categoryId: null, rate: "1" },
      ],
      // Lo impago no es percibido: no entra ni en la torta ni en las barras.
      pending: [
        {
          id: "ins-3",
          number: 3,
          dueDate: "2026-09-15",
          amountCents: 100_000,
          movementId: "mov-tv",
          description: "Televisor",
          currency: "ARS",
          rate: "1",
          kind: "expense",
        },
      ],
    })

    expect(torta(view)).toEqual([
      { name: "Electro", arsCents: 100_000 },
      { name: "Sin categoría", arsCents: 7_000 },
    ])
    expect(view.bars.find((b) => b.month === "2026-09")).toEqual({
      month: "2026-09",
      incomeArsCents: 50_000,
      expenseArsCents: 107_000,
    })
    expect(view.bars.find((b) => b.month === "2026-08")).toEqual({
      month: "2026-08",
      incomeArsCents: 0,
      expenseArsCents: 100_000,
    })
  })

  it("la torta y la barra del mes suman lo mismo que la tarjeta, con el corte del saldo inicial", () => {
    const view = buildDashboardView({
      ...BASE,
      expenseCategories: [cat("cat-1", "Comida")],
      paid: [
        // Antes del saldo inicial (2026-08-05): ya está adentro del saldo.
        { paidDate: "2026-08-01", amountCents: 30_000, currency: "ARS", kind: "expense", categoryId: "cat-1", rate: "1" },
        { paidDate: "2026-07-20", amountCents: 9_000, currency: "ARS", kind: "expense", categoryId: "cat-1", rate: "1" },
        // Después: cuenta en los tres bloques.
        { paidDate: "2026-08-07", amountCents: 10_000, currency: "ARS", kind: "expense", categoryId: "cat-1", rate: "1" },
      ],
    })

    expect(view.monthExpenseArsCents).toBe(10_000)
    expect(torta(view)).toEqual([{ name: "Comida", arsCents: 10_000 }])
    expect(view.bars.find((b) => b.month === "2026-08")?.expenseArsCents).toBe(10_000)
    expect(view.bars.find((b) => b.month === "2026-07")?.expenseArsCents).toBe(0)
  })

  it("no deja pasar más de MAX_UPCOMING vencimientos, ni uno que vence después del horizonte", () => {
    const withinLimit = Array.from({ length: 25 }, (_, i) => ({
      id: `ins-${i}`,
      number: i + 1,
      dueDate: "2026-09-30",
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
          dueDate: "2026-10-01", // primer día fuera del mes siguiente.
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

    expect(view.upcomingPayments).toHaveLength(20)
    expect(view.upcomingPayments.some((u) => u.id === "ins-far")).toBe(false)
  })

  it("arma los vencimientos aunque el movimiento no esté en la lista de movimientos", () => {
    // El caso que habilita el corte de fecha de la página: un plan viejo con
    // cuotas que todavía vencen. Su movimiento quedó fuera de los últimos 12
    // meses, y el enlace de la cuota tiene que seguir saliendo bien.
    const view = buildDashboardView({
      ...BASE,
      pending: [
        {
          id: "ins-1",
          number: 30,
          dueDate: "2026-08-20",
          amountCents: 10_000,
          movementId: "mov-viejo",
          description: "Plan de 2023",
          currency: "ARS",
          rate: "1",
          kind: "expense",
        },
      ],
    })

    expect(view.upcomingPayments).toHaveLength(1)
    expect(view.upcomingPayments[0].status).toBe("pending")
  })

  /**
   * El brazo de los cambios de divisa. Era el único tramo del borde de la plata
   * de este archivo sin una sola prueba: todos los demás casos pasan
   * `exchanges: []`, así que ni el `assertExchangeDirection` ni el
   * `Number(e.rate)` de acá tenían nada que los fijara.
   */
  describe("cambios de divisa", () => {
    // El TC llega como el `numeric` de Postgres, o sea STRING con sus cuatro
    // decimales. Es lo que hace imprescindible el `Number(e.rate)`: sin él la
    // multiplicación de `convertToArs` opera sobre texto.
    const COMPRA = { date: "2026-08-06", amountCents: 10_000, rate: "1450.5000" }

    it("una compra saca pesos y suma dólares, con el TC leído como número", () => {
      const view = buildDashboardView({
        ...BASE,
        exchanges: [{ ...COMPRA, direction: "buy" }],
      })

      // 100 dólares a 1450,50 son $145.050: el saldo en pesos queda en rojo
      // porque el saldo inicial de la base es de $1.000.
      expect(view.arsCents).toBe(100_000 - 14_505_000)
      expect(view.usdCents).toBe(10_000)
      // Y el consolidado los valúa al TC de hoy (1500), no al de la compra.
      expect(view.consolidatedArsCents).toBe(100_000 - 14_505_000 + 15_000_000)
    })

    it("una venta hace exactamente lo contrario", () => {
      const view = buildDashboardView({
        ...BASE,
        exchanges: [{ ...COMPRA, direction: "sell" }],
      })

      expect(view.arsCents).toBe(100_000 + 14_505_000)
      expect(view.usdCents).toBe(-10_000)
    })

    /**
     * El motivo del assert, escrito como test: con un `as`, un cambio sin
     * dirección cae en el `else` de `computeBalances` y se cuenta EN SILENCIO
     * como una venta —suma pesos, resta dólares—, o sea lo contrario de lo que
     * pasó si era una compra. Acá no hay resultado, hay una excepción.
     */
    it("revienta con un cambio sin dirección en vez de contarlo como venta", () => {
      expect(() =>
        buildDashboardView({ ...BASE, exchanges: [{ ...COMPRA, direction: null }] }),
      ).toThrow(/direction inesperada/)
    })

    it("revienta con una dirección que no es ninguna de las dos", () => {
      expect(() =>
        buildDashboardView({ ...BASE, exchanges: [{ ...COMPRA, direction: "compra" }] }),
      ).toThrow(/direction inesperada/)
    })
  })

  it("la torta agrupa por categoría padre, con el desglose por subcategoría", () => {
    const view = buildDashboardView({
      ...BASE,
      expenseCategories: [
        cat("hogar", "Hogar"),
        cat("alquiler", "Alquiler", "hogar"),
        cat("expensas", "Expensas", "hogar"),
        cat("ocio", "Ocio"),
      ],
      paid: [
        { paidDate: "2026-08-06", amountCents: 3_000, currency: "ARS", kind: "expense", categoryId: "expensas", rate: "1" },
        { paidDate: "2026-08-07", amountCents: 50_000, currency: "ARS", kind: "expense", categoryId: "alquiler", rate: "1" },
        { paidDate: "2026-08-08", amountCents: 20_000, currency: "ARS", kind: "expense", categoryId: "ocio", rate: "1" },
      ],
    })

    expect(torta(view)).toEqual([
      { name: "Hogar", arsCents: 53_000 },
      { name: "Ocio", arsCents: 20_000 },
    ])
    expect(view.pie[0].children.map(({ name, arsCents }) => ({ name, arsCents }))).toEqual([
      { name: "Alquiler", arsCents: 50_000 },
      { name: "Expensas", arsCents: 3_000 },
    ])
    expect(view.pie[1].children).toEqual([])
  })
})
