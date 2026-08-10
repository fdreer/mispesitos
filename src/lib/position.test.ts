import { describe, it, expect } from "vitest"
import { usdPosition, type PositionEvent } from "@/lib/position"

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
