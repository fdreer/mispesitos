import { describe, it, expect } from "vitest"
import {
  usdPosition,
  buildUsdPositionEvents,
  type PositionEvent,
  type UsdInitialBalanceRow,
  type UsdExchangeRow,
  type UsdPaidInstallmentRow,
} from "@/lib/position"

const buy = (date: string, usd: number, rate: number): PositionEvent => ({
  date,
  usdCents: usd * 100,
  rate,
  direction: "in",
})

const sell = (date: string, usd: number, rate: number): PositionEvent => ({
  date,
  usdCents: usd * 100,
  rate,
  direction: "out",
})

describe("usdPosition", () => {
  it("sin eventos, la posición está vacía", () => {
    const p = usdPosition([])
    expect(p.usdCents).toBe(0)
    expect(p.costArsCents).toBe(0)
    expect(p.averageRate).toBe(0)
    expect(p.realizedArsCents).toBe(0)
    expect(p.oversoldUsdCents).toBe(0)
  })

  it("una compra suma cantidad y costo, sin resultado", () => {
    const p = usdPosition([buy("2026-01-10", 100, 1000)])
    expect(p.usdCents).toBe(10_000)
    expect(p.costArsCents).toBe(10_000_000) // $100.000,00
    expect(p.averageRate).toBe(1000)
    expect(p.realizedArsCents).toBe(0)
  })

  it("promedia el costo de dos compras a distinto TC", () => {
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      buy("2026-02-10", 100, 1400),
    ])
    expect(p.usdCents).toBe(20_000)
    expect(p.averageRate).toBe(1200)
  })

  it("una venta con el dólar más alto realiza ganancia", () => {
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      sell("2026-06-10", 100, 1500),
    ])
    expect(p.usdCents).toBe(0)
    expect(p.costArsCents).toBe(0)
    expect(p.realizedArsCents).toBe(5_000_000) // $50.000,00 de ganancia
  })

  it("una venta con el dólar más bajo realiza pérdida", () => {
    const p = usdPosition([
      buy("2026-01-10", 100, 1500),
      sell("2026-06-10", 100, 1000),
    ])
    expect(p.realizedArsCents).toBe(-5_000_000)
  })

  it("una venta parcial deja el resto al costo promedio", () => {
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      sell("2026-06-10", 40, 1500),
    ])
    expect(p.usdCents).toBe(6_000)
    expect(p.averageRate).toBe(1000)
    expect(p.realizedArsCents).toBe(2_000_000) // 40 * (1500-1000) = $20.000,00
  })

  it("un ingreso en dólares entra a la posición a su TC", () => {
    // Un sueldo cobrado en USD entra igual que una compra.
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      { date: "2026-02-10", usdCents: 10_000, rate: 1400, direction: "in" },
    ])
    expect(p.usdCents).toBe(20_000)
    expect(p.averageRate).toBe(1200)
  })

  it("un egreso pagado en dólares realiza resultado igual que una venta", () => {
    // Sección 5.5: toda salida de dólares realiza, se venda o se gaste.
    const p = usdPosition([
      buy("2026-01-10", 100, 1000),
      { date: "2026-06-10", usdCents: 10_000, rate: 1500, direction: "out" },
    ])
    expect(p.usdCents).toBe(0)
    expect(p.realizedArsCents).toBe(5_000_000)
  })

  it("procesa los eventos por fecha aunque lleguen desordenados", () => {
    const ordenado = usdPosition([
      buy("2026-01-10", 100, 1000),
      sell("2026-06-10", 100, 1500),
    ])
    const desordenado = usdPosition([
      sell("2026-06-10", 100, 1500),
      buy("2026-01-10", 100, 1000),
    ])
    expect(desordenado).toEqual(ordenado)
  })

  it("si se dispone de más de lo registrado, no queda posición negativa", () => {
    const p = usdPosition([
      buy("2026-01-10", 50, 1000),
      sell("2026-06-10", 100, 1500),
    ])
    expect(p.usdCents).toBe(0)
    expect(p.costArsCents).toBe(0)
    expect(p.oversoldUsdCents).toBe(5_000) // 50 dólares que no estaban cargados
    expect(p.realizedArsCents).toBe(2_500_000) // sólo los 50 que sí tenía
  })

  it("vender sin tener nada cargado no rompe ni divide por cero", () => {
    const p = usdPosition([sell("2026-06-10", 100, 1500)])
    expect(p.usdCents).toBe(0)
    expect(p.averageRate).toBe(0)
    expect(p.realizedArsCents).toBe(0)
    expect(p.oversoldUsdCents).toBe(10_000)
  })

  it("en el mismo día procesa primero la compra, venga como venga del array", () => {
    // Comprar y vender 100 dólares el mismo día: se puede, y realiza $50.000.
    // Si la venta se procesara primero, informaría sobreventa y cero resultado.
    const compraPrimero = usdPosition([
      buy("2026-06-10", 100, 1000),
      sell("2026-06-10", 100, 1500),
    ])
    const ventaPrimero = usdPosition([
      sell("2026-06-10", 100, 1500),
      buy("2026-06-10", 100, 1000),
    ])

    expect(compraPrimero).toEqual(ventaPrimero)
    expect(compraPrimero.realizedArsCents).toBe(5_000_000)
    expect(compraPrimero.oversoldUsdCents).toBe(0)
  })

  it("dos salidas del mismo día dan el mismo resultado en cualquier orden", () => {
    // Con la posición en descubierto, cuál de las dos salidas consume los
    // dólares disponibles cambia el resultado. El desempate lo fija.
    const eventos = [
      buy("2026-01-10", 50, 1000),
      sell("2026-06-10", 60, 1500),
      sell("2026-06-10", 40, 1200),
    ]
    const alRevés = [eventos[0], eventos[2], eventos[1]]

    expect(usdPosition(alRevés)).toEqual(usdPosition(eventos))
  })
})

describe("buildUsdPositionEvents", () => {
  const sinSaldoInicial: UsdInitialBalanceRow = {
    usdCents: 0,
    rate: "0",
    date: "2026-01-01",
  }

  it("con saldo inicial en dólares mayor a cero, siembra un evento de entrada con cantidad, TC y fecha correctos", () => {
    const inicial: UsdInitialBalanceRow = { usdCents: 40_000, rate: "1000", date: "2026-01-05" }
    const events = buildUsdPositionEvents(inicial, [], [])
    expect(events).toEqual([
      { date: "2026-01-05", usdCents: 40_000, rate: 1000, direction: "in" },
    ])
  })

  it("con saldo inicial en cero, no siembra ningún evento", () => {
    const events = buildUsdPositionEvents(sinSaldoInicial, [], [])
    expect(events).toEqual([])
  })

  it("un cambio anterior a la fecha del saldo inicial no entra", () => {
    const inicial: UsdInitialBalanceRow = { usdCents: 0, rate: "0", date: "2026-02-01" }
    const anterior: UsdExchangeRow = {
      date: "2026-01-31",
      usdCents: 10_000,
      rate: "1000",
      direction: "buy",
    }
    expect(buildUsdPositionEvents(inicial, [anterior], [])).toEqual([])
  })

  it("un cambio en la misma fecha del saldo inicial sí entra (el borde incluye)", () => {
    const inicial: UsdInitialBalanceRow = { usdCents: 0, rate: "0", date: "2026-02-01" }
    const mismaFecha: UsdExchangeRow = {
      date: "2026-02-01",
      usdCents: 10_000,
      rate: "1000",
      direction: "buy",
    }
    expect(buildUsdPositionEvents(inicial, [mismaFecha], [])).toEqual([
      { date: "2026-02-01", usdCents: 10_000, rate: 1000, direction: "in" },
    ])
  })

  it("una cuota pagada anterior a la fecha del saldo inicial no entra, y en la misma fecha sí", () => {
    const inicial: UsdInitialBalanceRow = { usdCents: 0, rate: "0", date: "2026-03-10" }
    const anterior: UsdPaidInstallmentRow = {
      date: "2026-03-09",
      usdCents: 5_000,
      rate: "1200",
      kind: "income",
    }
    const mismaFecha: UsdPaidInstallmentRow = {
      date: "2026-03-10",
      usdCents: 5_000,
      rate: "1200",
      kind: "income",
    }
    expect(buildUsdPositionEvents(inicial, [], [anterior])).toEqual([])
    expect(buildUsdPositionEvents(inicial, [], [mismaFecha])).toEqual([
      { date: "2026-03-10", usdCents: 5_000, rate: 1200, direction: "in" },
    ])
  })

  it("una compra de divisa produce una entrada y una venta produce una salida", () => {
    const inicial: UsdInitialBalanceRow = { usdCents: 0, rate: "0", date: "2026-01-01" }
    const compra: UsdExchangeRow = {
      date: "2026-02-01",
      usdCents: 10_000,
      rate: "1000",
      direction: "buy",
    }
    const venta: UsdExchangeRow = {
      date: "2026-02-02",
      usdCents: 5_000,
      rate: "1500",
      direction: "sell",
    }
    const events = buildUsdPositionEvents(inicial, [compra, venta], [])
    expect(events).toEqual([
      { date: "2026-02-01", usdCents: 10_000, rate: 1000, direction: "in" },
      { date: "2026-02-02", usdCents: 5_000, rate: 1500, direction: "out" },
    ])
  })

  it("una cuota cobrada en USD produce una entrada y una pagada en USD produce una salida", () => {
    const inicial: UsdInitialBalanceRow = { usdCents: 0, rate: "0", date: "2026-01-01" }
    const cobrada: UsdPaidInstallmentRow = {
      date: "2026-02-01",
      usdCents: 3_000,
      rate: "1100",
      kind: "income",
    }
    const pagada: UsdPaidInstallmentRow = {
      date: "2026-02-02",
      usdCents: 2_000,
      rate: "1300",
      kind: "expense",
    }
    const events = buildUsdPositionEvents(inicial, [], [cobrada, pagada])
    expect(events).toEqual([
      { date: "2026-02-01", usdCents: 3_000, rate: 1100, direction: "in" },
      { date: "2026-02-02", usdCents: 2_000, rate: 1300, direction: "out" },
    ])
  })

  it("convierte el numeric que llega como string a número una sola vez y bien", () => {
    const inicial: UsdInitialBalanceRow = {
      usdCents: 1_000,
      rate: "1234.5678",
      date: "2026-01-01",
    }
    const events = buildUsdPositionEvents(inicial, [], [])
    expect(events[0].rate).toBe(1234.5678)
    expect(typeof events[0].rate).toBe("number")
  })

  it("extremo a extremo: US$400 iniciales y una venta de US$100 dan tenencia US$300 y cero sobreventa", () => {
    // Este es el test que se pone rojo si alguien saca el sembrado del saldo
    // inicial: sin él, la venta de US$100 se dispararía sobre una posición
    // vacía y usdPosition() informaría oversoldUsdCents = 10.000 en vez de 0.
    const inicial: UsdInitialBalanceRow = { usdCents: 40_000, rate: "1000", date: "2026-01-01" }
    const venta: UsdExchangeRow = {
      date: "2026-06-01",
      usdCents: 10_000,
      rate: "1500",
      direction: "sell",
    }
    const events = buildUsdPositionEvents(inicial, [venta], [])
    const position = usdPosition(events)
    expect(position.usdCents).toBe(30_000)
    expect(position.oversoldUsdCents).toBe(0)
  })
})
