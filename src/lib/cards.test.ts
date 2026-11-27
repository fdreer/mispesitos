import { describe, expect, it } from "vitest"

import {
  addPeriods,
  allocateProportional,
  assignStatements,
  availableCredit,
  cardOverview,
  dayInPeriod,
  effectiveStatementRate,
  firstStatementPeriod,
  formatPeriod,
  isValidPeriod,
  paidStatementConflict,
  perceivedPayments,
  proposeStatementDates,
  resolveStatementPayment,
  statementTotals,
  type StatementSummary,
} from "@/lib/cards"

const VISA = { closingDay: 25, dueDay: 5 }
const MASTER = { closingDay: 3, dueDay: 15 }

describe("períodos", () => {
  it("corre períodos hacia adelante y hacia atrás, cruzando el año", () => {
    expect(addPeriods("2026-11", 1)).toBe("2026-12")
    expect(addPeriods("2026-12", 1)).toBe("2027-01")
    expect(addPeriods("2027-01", -1)).toBe("2026-12")
    expect(addPeriods("2026-11", 12)).toBe("2027-11")
  })

  it("valida el formato YYYY-MM", () => {
    expect(isValidPeriod("2026-11")).toBe(true)
    expect(isValidPeriod("2026-13")).toBe(false)
    expect(isValidPeriod("2026-1")).toBe(false)
  })

  it("recorta el día al último del mes", () => {
    expect(dayInPeriod("2026-11", 31)).toBe("2026-11-30")
    expect(dayInPeriod("2027-02", 30)).toBe("2027-02-28")
    expect(dayInPeriod("2028-02", 31)).toBe("2028-02-29")
    expect(dayInPeriod("2026-11", 5)).toBe("2026-11-05")
  })

  it("nombra el período en castellano", () => {
    expect(formatPeriod("2026-11")).toMatch(/^nov/)
    expect(formatPeriod("2026-11")).toMatch(/2026$/)
  })
})

describe("proposeStatementDates", () => {
  it("con el vencimiento antes del cierre, vence el mes siguiente", () => {
    expect(proposeStatementDates(VISA, "2026-11")).toEqual({
      period: "2026-11",
      closingDate: "2026-11-25",
      dueDate: "2026-12-05",
    })
  })

  it("con el vencimiento después del cierre, vence el mismo mes", () => {
    expect(proposeStatementDates(MASTER, "2026-11")).toEqual({
      period: "2026-11",
      closingDate: "2026-11-03",
      dueDate: "2026-11-15",
    })
  })

  it("el resumen de diciembre vence en enero del año siguiente", () => {
    expect(proposeStatementDates(VISA, "2026-12").dueDate).toBe("2027-01-05")
  })

  it("una tarjeta que cierra el 31 cierra el último día de los meses cortos", () => {
    expect(proposeStatementDates({ closingDay: 31, dueDay: 10 }, "2027-02").closingDate).toBe(
      "2027-02-28",
    )
  })
})

describe("firstStatementPeriod", () => {
  it("una compra antes del cierre entra en el resumen de su mes", () => {
    expect(firstStatementPeriod(VISA, "2026-11-10", [])).toBe("2026-11")
  })

  it("una compra el mismo día del cierre entra en ese resumen", () => {
    expect(firstStatementPeriod(VISA, "2026-11-25", [])).toBe("2026-11")
  })

  it("una compra después del cierre va al resumen siguiente", () => {
    expect(firstStatementPeriod(VISA, "2026-11-26", [])).toBe("2026-12")
    expect(firstStatementPeriod(VISA, "2026-12-28", [])).toBe("2027-01")
  })

  it("usa el cierre corregido del resumen, no el propuesto", () => {
    const corrido = { period: "2026-11", closingDate: "2026-11-27", dueDate: "2026-12-07" }
    expect(firstStatementPeriod(VISA, "2026-11-26", [corrido])).toBe("2026-11")
  })

  it("si el banco corrió el cierre al mes siguiente, la compra es del resumen anterior", () => {
    const corrido = { period: "2026-11", closingDate: "2026-12-02", dueDate: "2026-12-12" }
    expect(firstStatementPeriod(VISA, "2026-12-01", [corrido])).toBe("2026-11")
    expect(firstStatementPeriod(VISA, "2026-12-03", [corrido])).toBe("2026-12")
  })

  it("si el resumen siguiente cerró antes de la compra, va al otro", () => {
    const adelantado = { period: "2026-12", closingDate: "2026-11-25", dueDate: "2026-12-02" }
    expect(firstStatementPeriod(VISA, "2026-11-26", [adelantado])).toBe("2027-01")
    expect(firstStatementPeriod(VISA, "2026-11-24", [adelantado])).toBe("2026-11")
  })
})

describe("assignStatements", () => {
  it("la cuota k va al resumen k − 1 meses después del primero", () => {
    const plan = assignStatements(VISA, "2026-11-26", 3, [])
    expect(plan.map((s) => s.period)).toEqual(["2026-12", "2027-01", "2027-02"])
    expect(plan.map((s) => s.dueDate)).toEqual(["2027-01-05", "2027-02-05", "2027-03-05"])
  })

  it("con un primer resumen fijo, no lo recalcula aunque su cierre se haya corregido", () => {
    const diciembre = { period: "2026-12", closingDate: "2026-11-25", dueDate: "2026-12-02" }
    const plan = assignStatements(VISA, "2026-11-26", 2, [diciembre], "2026-12")
    expect(plan.map((s) => s.period)).toEqual(["2026-12", "2027-01"])
    expect(plan[0]).toEqual(diciembre)
  })

  it("los resúmenes que ya existen ponen sus fechas reales", () => {
    const enero = { period: "2027-01", closingDate: "2027-01-22", dueDate: "2027-02-03" }
    const plan = assignStatements(VISA, "2026-11-26", 3, [enero])
    expect(plan[1]).toEqual(enero)
    expect(plan[2].dueDate).toBe("2027-03-05")
  })
})

describe("paidStatementConflict", () => {
  const pagado = new Set(["s-nov"])

  it("sin resúmenes pagados no hay conflicto", () => {
    expect(
      paidStatementConflict([{ number: 1, statementId: "s-dic", amountCents: 100 }], [], pagado),
    ).toBeNull()
  })

  it("una compra nueva no puede caer en un resumen pagado", () => {
    expect(
      paidStatementConflict([{ number: 1, statementId: "s-nov", amountCents: 100 }], [], pagado),
    ).toBe(1)
  })

  it("editar sin tocar la cuota del resumen pagado está permitido", () => {
    const cuota = { number: 1, statementId: "s-nov", amountCents: 100 }
    expect(paidStatementConflict([cuota], [cuota], pagado)).toBeNull()
  })

  it("cambiar el importe de una cuota de un resumen pagado no", () => {
    expect(
      paidStatementConflict(
        [{ number: 1, statementId: "s-nov", amountCents: 150 }],
        [{ number: 1, statementId: "s-nov", amountCents: 100 }],
        pagado,
      ),
    ).toBe(1)
  })

  it("sacar una cuota de un resumen pagado tampoco", () => {
    expect(
      paidStatementConflict(
        [{ number: 1, statementId: null, amountCents: 100 }],
        [{ number: 1, statementId: "s-nov", amountCents: 100 }],
        pagado,
      ),
    ).toBe(1)
  })
})

describe("statementTotals", () => {
  it("suma por moneda, sin mezclar pesos con dólares", () => {
    expect(
      statementTotals([
        { amountCents: 100_00, currency: "ARS" },
        { amountCents: 50_00, currency: "USD" },
        { amountCents: 20_00, currency: "ARS" },
      ]),
    ).toEqual({ arsCents: 120_00, usdCents: 50_00, count: 3 })
  })
})

describe("resolveStatementPayment", () => {
  const base = {
    closingDate: "2026-11-25",
    totals: { arsCents: 1000, usdCents: 0, count: 2 },
    requestedDate: undefined,
    today: "2026-12-01",
    mode: "usd" as const,
    usdPaidArsCents: null,
  }

  it("sin fecha paga hoy", () => {
    expect(resolveStatementPayment(base)).toEqual({
      ok: true,
      paidDate: "2026-12-01",
      usdPaidArsCents: null,
    })
  })

  it("rechaza una fecha futura", () => {
    expect(resolveStatementPayment({ ...base, requestedDate: "2026-12-02" })).toMatchObject({
      ok: false,
      field: "paidDate",
    })
  })

  it("rechaza una fecha anterior al cierre", () => {
    expect(resolveStatementPayment({ ...base, requestedDate: "2026-11-20" })).toMatchObject({
      ok: false,
      field: "paidDate",
    })
  })

  it("el día del cierre se puede pagar", () => {
    expect(resolveStatementPayment({ ...base, requestedDate: "2026-11-25" })).toMatchObject({
      ok: true,
      paidDate: "2026-11-25",
    })
  })

  it("un resumen sin cuotas no se paga", () => {
    expect(
      resolveStatementPayment({ ...base, totals: { arsCents: 0, usdCents: 0, count: 0 } }),
    ).toMatchObject({ ok: false })
  })

  it("los dólares pagados con dólares no guardan monto en pesos", () => {
    const totals = { arsCents: 0, usdCents: 50_00, count: 1 }
    expect(
      resolveStatementPayment({ ...base, totals, usdPaidArsCents: 60_000_00 }),
    ).toMatchObject({
      ok: true,
      usdPaidArsCents: null,
    })
  })

  it("los dólares pagados con pesos exigen el total en pesos positivo", () => {
    const totals = { arsCents: 0, usdCents: 50_00, count: 1 }
    expect(resolveStatementPayment({ ...base, totals, mode: "ars" })).toMatchObject({
      ok: false,
      field: "usdPaidArs",
    })
    expect(
      resolveStatementPayment({ ...base, totals, mode: "ars", usdPaidArsCents: 60_000_00 }),
    ).toMatchObject({ ok: true, usdPaidArsCents: 60_000_00 })
  })

  it("sin dólares en el resumen no guarda monto en pesos aunque llegue", () => {
    expect(
      resolveStatementPayment({ ...base, mode: "ars", usdPaidArsCents: 60_000_00 }),
    ).toMatchObject({
      ok: true,
      usdPaidArsCents: null,
    })
  })
})

describe("allocateProportional", () => {
  it("reparte con resto mayor para que la suma cierre al centavo", () => {
    expect(allocateProportional(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocateProportional(101, [1, 1, 1])).toEqual([34, 34, 33])
    expect(allocateProportional(100_00, [30_00, 70_00])).toEqual([30_00, 70_00])
  })
})

describe("effectiveStatementRate", () => {
  it("calcula el TC efectivo a partir de los centavos", () => {
    expect(effectiveStatementRate(150_000_00, 100_00)).toBe(1500)
    expect(effectiveStatementRate(0, 100_00)).toBeNull()
    expect(effectiveStatementRate(150_000_00, 0)).toBeNull()
  })
})

describe("perceivedPayments", () => {
  it("reparte usdPaidArsCents entre las cuotas USD del resumen con resto mayor", () => {
    const rows = [
      { id: "a", statementId: "st1", currency: "USD", amountCents: 10_00, usdPaidArsCents: 100 },
      { id: "b", statementId: "st1", currency: "USD", amountCents: 10_00, usdPaidArsCents: 100 },
      { id: "c", statementId: "st1", currency: "USD", amountCents: 10_00, usdPaidArsCents: 100 },
    ]
    const result = perceivedPayments(rows)
    expect(result.map((r) => ({ id: r.id, currency: r.currency, amountCents: r.amountCents }))).toEqual([
      { id: "a", currency: "ARS", amountCents: 34 },
      { id: "b", currency: "ARS", amountCents: 33 },
      { id: "c", currency: "ARS", amountCents: 33 },
    ])
    expect(result.reduce((s, r) => s + r.amountCents, 0)).toBe(100)
  })

  it("en un subconjunto filtrado respeta el total USD del resumen", () => {
    const rows = [
      {
        id: "a",
        statementId: "st1",
        currency: "USD",
        amountCents: 25_00,
        usdPaidArsCents: 100_000_00,
        statementUsdCents: 100_00,
      },
    ]
    const [r] = perceivedPayments(rows)
    expect(r.currency).toBe("ARS")
    expect(r.amountCents).toBe(25_000_00)
  })

  it("pagada con dólares o en pesos no cambia", () => {
    const rows = [
      { id: "u", statementId: "st1", currency: "USD", amountCents: 10_00, usdPaidArsCents: null },
      { id: "p", statementId: "st1", currency: "ARS", amountCents: 50_00, usdPaidArsCents: 100_00 },
    ]
    expect(perceivedPayments(rows)).toEqual([
      { id: "u", statementId: "st1", currency: "USD", amountCents: 10_00 },
      { id: "p", statementId: "st1", currency: "ARS", amountCents: 50_00 },
    ])
  })
})

describe("availableCredit", () => {
  it("sin límite no hay disponible", () => {
    expect(availableCredit(null, [], 1200)).toBeNull()
  })

  it("descuenta lo impago convirtiendo USD al oficial vendedor", () => {
    expect(
      availableCredit(
        1_000_000_00,
        [
          { amountCents: 100_000_00, currency: "ARS" },
          { amountCents: 100_00, currency: "USD" },
        ],
        1200,
      ),
    ).toEqual({ arsCents: 780_000_00, unconvertedUsdCents: 0 })
  })

  it("sin cotización oficial informa los USD aparte", () => {
    expect(
      availableCredit(
        1_000_000_00,
        [
          { amountCents: 100_000_00, currency: "ARS" },
          { amountCents: 100_00, currency: "USD" },
        ],
        null,
      ),
    ).toEqual({ arsCents: 900_000_00, unconvertedUsdCents: 100_00 })
  })
})

describe("cardOverview", () => {
  const resumen = (period: string, count: number, paidDate: string | null = null) =>
    ({
      ...proposeStatementDates(VISA, period),
      id: `s-${period}`,
      paidDate,
      totals: { arsCents: count * 100, usdCents: 0, count },
    }) satisfies StatementSummary

  it("el abierto es el que recibiría una compra de hoy, y el actual el último cerrado", () => {
    const { open, current } = cardOverview(
      VISA,
      [resumen("2026-10", 1, "2026-11-04"), resumen("2026-11", 2), resumen("2026-12", 3)],
      "2026-11-26",
    )
    expect(open.period).toBe("2026-12")
    expect(current?.period).toBe("2026-11")
  })

  it("si el abierto todavía no existe, lo propone en cero", () => {
    const { open, current } = cardOverview(VISA, [], "2026-11-10")
    expect(open).toMatchObject({ period: "2026-11", id: null, totals: { count: 0 } })
    expect(current).toBeNull()
  })
})
