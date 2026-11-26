import { describe, expect, it } from "vitest"

import {
  addPeriods,
  assignStatements,
  availableCredit,
  cardOverview,
  dayInPeriod,
  firstStatementPeriod,
  formatPeriod,
  isValidPeriod,
  paidStatementConflict,
  perceivedPayment,
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
    usdRate: null,
  }

  it("sin fecha paga hoy", () => {
    expect(resolveStatementPayment(base)).toEqual({
      ok: true,
      paidDate: "2026-12-01",
      usdPaidRate: null,
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

  it("los dólares pagados con dólares no guardan TC", () => {
    const totals = { arsCents: 0, usdCents: 50_00, count: 1 }
    expect(resolveStatementPayment({ ...base, totals, usdRate: 1200 })).toMatchObject({
      ok: true,
      usdPaidRate: null,
    })
  })

  it("los dólares pagados con pesos exigen el TC", () => {
    const totals = { arsCents: 0, usdCents: 50_00, count: 1 }
    expect(resolveStatementPayment({ ...base, totals, mode: "ars" })).toMatchObject({
      ok: false,
      field: "usdPaidRate",
    })
    expect(resolveStatementPayment({ ...base, totals, mode: "ars", usdRate: 1200 })).toMatchObject(
      { ok: true, usdPaidRate: 1200 },
    )
  })

  it("sin dólares en el resumen no guarda TC aunque llegue", () => {
    expect(resolveStatementPayment({ ...base, mode: "ars", usdRate: 1200 })).toMatchObject({
      ok: true,
      usdPaidRate: null,
    })
  })
})

describe("perceivedPayment", () => {
  const cuota = { paidDate: "2026-12-01", currency: "USD", amountCents: 10_00, rate: "1000" }

  it("una cuota en dólares pagada con pesos cuenta como pesos al TC del pago", () => {
    expect(perceivedPayment({ ...cuota, usdPaidRate: "1250.5000" })).toEqual({
      paidDate: "2026-12-01",
      currency: "ARS",
      amountCents: 12_505_00,
      rate: "1",
    })
  })

  it("pagada con dólares sigue siendo en dólares", () => {
    expect(perceivedPayment({ ...cuota, usdPaidRate: null })).toEqual(cuota)
  })

  it("una cuota en pesos no cambia", () => {
    const pesos = { ...cuota, currency: "ARS", rate: "1" }
    expect(perceivedPayment({ ...pesos, usdPaidRate: "1250" })).toEqual(pesos)
  })
})

describe("availableCredit", () => {
  it("sin límite no hay disponible", () => {
    expect(availableCredit(null, [])).toBeNull()
  })

  it("descuenta lo impago, con los dólares al TC de la compra", () => {
    expect(
      availableCredit(1_000_000_00, [
        { amountCents: 100_000_00, currency: "ARS", rate: "1" },
        { amountCents: 100_00, currency: "USD", rate: "1000" },
      ]),
    ).toBe(800_000_00)
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
