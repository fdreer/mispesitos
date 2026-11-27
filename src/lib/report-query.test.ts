import { describe, expect, it } from "vitest"

import {
  buildReportHref,
  effectiveCashflowRange,
  effectivePnlRange,
  parseReportQuery,
  reportExtraParams,
} from "@/lib/report-query"

describe("parseReportQuery", () => {
  it("una URL vacía cae en Flujo de caja, ARS y mensual", () => {
    const q = parseReportQuery({})
    expect(q.tab).toBe("flujo")
    expect(q.currency).toBe("ARS")
    expect(q.granularity).toBe("mensual")
    expect(q.filters.currency).toBe("all")
    expect(q.filters.status).toBe("all")
  })

  it("un enlace viejo con moneda=todo cae en el default (ARS)", () => {
    expect(parseReportQuery({ moneda: "todo" }).currency).toBe("ARS")
  })

  it("lee tab, moneda y granularidad válidos, e ignora los inventados", () => {
    expect(
      parseReportQuery({ tab: "flujo", moneda: "USD", granularidad: "semanal" }),
    ).toMatchObject({
      tab: "flujo",
      currency: "USD",
      granularity: "semanal",
    })

    expect(
      parseReportQuery({ tab: "otra", moneda: "EUR", granularidad: "anual" }),
    ).toMatchObject({
      tab: "flujo",
      currency: "ARS",
      granularity: "mensual",
    })
  })

  it("en Flujo de caja descarta categoría, tarjeta, buscador e importe aunque vengan en la URL", () => {
    const q = parseReportQuery({
      tab: "flujo",
      categoryId: "hogar",
      cardId: "visa",
      search: "alquiler",
      min: "1000",
      from: "2026-09-01",
      to: "2027-03-31",
    })
    expect(q.filters.categoryIds).toEqual([])
    expect(q.filters.cardId).toBe("all")
    expect(q.filters.search).toBe("")
    expect(q.filters.minCents).toBeNull()
    expect(q.filters.from).toBe("2026-09-01")
    expect(q.filters.to).toBe("2027-03-31")
  })

  it("en Ingresos vs Gastos ignora granularidad=semanal", () => {
    expect(parseReportQuery({ tab: "ingresos-gastos", granularidad: "semanal" }).granularity).toBe(
      "mensual",
    )
  })
})

describe("buildReportHref y reportExtraParams", () => {
  it("omite los valores por defecto", () => {
    const base = parseReportQuery({})
    expect(reportExtraParams(base)).toEqual({
      tab: undefined,
      moneda: undefined,
      granularidad: undefined,
    })
    expect(buildReportHref(base)).toBe("/informes")
  })

  it("en Flujo no lleva moneda en la URL y limpia los filtros de P&L", () => {
    const pnl = parseReportQuery({
      tab: "ingresos-gastos",
      moneda: "USD",
      categoryId: "hogar",
      search: "luz",
      from: "2026-11-26",
      to: "2027-03-31",
    })

    expect(buildReportHref(pnl, { tab: "flujo" })).toBe(
      "/informes?from=2026-11-26&to=2027-03-31",
    )
  })

  it("Ingresos vs Gastos sí lleva la pestaña en la URL", () => {
    expect(buildReportHref(parseReportQuery({}), { tab: "ingresos-gastos" })).toBe(
      "/informes?tab=ingresos-gastos",
    )
  })
})

describe("rangos efectivos por defecto", () => {
  it("Ingresos vs Gastos usa los últimos 12 meses cuando no hay fechas", () => {
    expect(effectivePnlRange("", "", "2026-11-26")).toEqual({
      from: "2025-12-01",
      to: "2026-11-30",
      isDefault: true,
    })
  })

  it("Flujo de caja mensual arranca hoy y proyecta 6 meses", () => {
    expect(effectiveCashflowRange("", "", "mensual", "2026-11-26")).toEqual({
      from: "2026-11-26",
      to: "2027-05-31",
      isDefault: true,
    })
  })

  it("Flujo de caja mensual recorta a hoy si la URL pide una fecha pasada", () => {
    expect(effectiveCashflowRange("2026-01-01", "2027-02-28", "mensual", "2026-11-26")).toEqual({
      from: "2026-11-26",
      to: "2027-02-28",
      isDefault: false,
    })
  })

  it("Flujo de caja semanal fija los próximos 3 meses desde hoy", () => {
    expect(effectiveCashflowRange("2026-01-01", "2026-12-31", "semanal", "2026-11-26")).toEqual({
      from: "2026-11-26",
      to: "2027-02-26",
      isDefault: true,
    })
  })

  it("normaliza un rango invertido en la URL", () => {
    expect(effectivePnlRange("2026-10-01", "2026-05-01", "2026-11-26")).toEqual({
      from: "2026-05-01",
      to: "2026-10-01",
      isDefault: false,
    })
  })
})
