import { describe, it, expect } from "vitest"
import {
  usdPosition,
  buildUsdPositionEvents,
  type PositionEvent,
  type UsdInitialBalanceRow,
  type UsdExchangeRow,
  type UsdPaidInstallmentRow,
} from "@/lib/position"
import { computeBalances, type BalanceSettings, type PaidInstallment, type ExchangeMovement } from "@/lib/balance"

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

  it("convierte el rate, que llega como numeric (string), a number con decimales", () => {
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

/**
 * La regla "sembrar el saldo inicial en dólares y contar sólo desde
 * initialBalanceDate" está escrita DOS veces: acá (buildUsdPositionEvents) y
 * en computeBalances (@/lib/balance). Nada más las ata entre sí. Si alguien
 * toca el corte de fecha de una función sin tocar la otra, este test es el
 * único que se entera — y sin él, el usuario ve dos saldos en dólares
 * distintos en /cambios y en el dashboard, sin ningún error a la vista.
 *
 * OJO con lo que este test NO cubre: el corte de fecha también existe en SQL
 * (el gte de listUsdPositionEvents, en @/server/queries), y esa copia no tiene
 * test. Cambiar ese gte por gt saca del cálculo los movimientos del día del
 * saldo inicial y deja esta suite en verde. Verde acá no significa "no pueden
 * discrepar": significa "las dos funciones puras están de acuerdo".
 *
 * La igualdad exacta que probamos:
 *
 *   usdPosition(buildUsdPositionEvents(datos)).usdCents - oversoldUsdCents
 *     === computeBalances(los mismos datos).usdCents
 *
 * (la resta de oversoldUsdCents no es cosmética: usdPosition clampea la
 * tenencia en cero cuando se vendió de más, computeBalances no — ver el
 * último caso, "en sobreventa".)
 */
describe("la posición en dólares coincide con el saldo en dólares", () => {
  type Datos = {
    initial: UsdInitialBalanceRow
    exchanges: UsdExchangeRow[]
    installments: UsdPaidInstallmentRow[]
  }

  function calcular(datos: Datos) {
    const events = buildUsdPositionEvents(datos.initial, datos.exchanges, datos.installments)
    const position = usdPosition(events)

    const settings: BalanceSettings = {
      initialArsCents: 0,
      initialUsdCents: datos.initial.usdCents,
      initialDate: datos.initial.date,
    }
    const paid: PaidInstallment[] = datos.installments.map((i) => ({
      paidDate: i.date,
      currency: "USD",
      kind: i.kind,
      amountCents: i.usdCents,
    }))
    const exchanges: ExchangeMovement[] = datos.exchanges.map((e) => ({
      date: e.date,
      direction: e.direction,
      usdCents: e.usdCents,
      rate: Number(e.rate),
    }))
    const balances = computeBalances(settings, paid, exchanges)

    return { position, balances }
  }

  function esperarInvariante(datos: Datos) {
    const { position, balances } = calcular(datos)
    expect(position.usdCents - position.oversoldUsdCents).toBe(balances.usdCents)
  }

  it("eventos exactamente en initialBalanceDate cuentan y eventos anteriores se ignoran, igual en las dos funciones", () => {
    // El caso que realmente ata el corte de fecha: si buildUsdPositionEvents
    // o computeBalances cambian su "<" por "<=" (o al revés) en cualquiera de
    // los dos filtros, esto se rompe.
    esperarInvariante({
      initial: { usdCents: 40_000, rate: "1000", date: "2026-02-01" },
      exchanges: [
        // anterior al saldo inicial: las dos funciones lo tienen que ignorar
        { date: "2026-01-31", usdCents: 99_900, rate: "1000", direction: "buy" },
        // misma fecha que el saldo inicial: las dos funciones lo tienen que contar
        { date: "2026-02-01", usdCents: 5_000, rate: "1300", direction: "buy" },
      ],
      installments: [
        { date: "2026-01-31", usdCents: 50_000, rate: "1000", kind: "income" },
        { date: "2026-02-01", usdCents: 1_000, rate: "1200", kind: "expense" },
      ],
    })
  })

  it("sólo saldo inicial, sin movimientos", () => {
    esperarInvariante({
      initial: { usdCents: 40_000, rate: "1000", date: "2026-01-01" },
      exchanges: [],
      installments: [],
    })
  })

  it("saldo inicial más compras y ventas de divisa", () => {
    esperarInvariante({
      initial: { usdCents: 40_000, rate: "1000", date: "2026-01-01" },
      exchanges: [
        { date: "2026-02-01", usdCents: 10_000, rate: "1200", direction: "buy" },
        { date: "2026-03-01", usdCents: 5_000, rate: "1500", direction: "sell" },
      ],
      installments: [],
    })
  })

  it("saldo inicial más cuotas cobradas y pagadas en USD", () => {
    esperarInvariante({
      initial: { usdCents: 40_000, rate: "1000", date: "2026-01-01" },
      exchanges: [],
      installments: [
        { date: "2026-02-01", usdCents: 3_000, rate: "1100", kind: "income" },
        { date: "2026-02-15", usdCents: 2_000, rate: "1300", kind: "expense" },
      ],
    })
  })

  it("saldo inicial, compras y ventas de divisa, y cuotas cobradas y pagadas en USD, todo mezclado", () => {
    esperarInvariante({
      initial: { usdCents: 40_000, rate: "1000", date: "2026-01-01" },
      exchanges: [
        { date: "2026-02-01", usdCents: 10_000, rate: "1200", direction: "buy" },
        { date: "2026-03-01", usdCents: 5_000, rate: "1500", direction: "sell" },
      ],
      installments: [
        { date: "2026-02-10", usdCents: 3_000, rate: "1100", kind: "income" },
        { date: "2026-02-20", usdCents: 2_000, rate: "1300", kind: "expense" },
      ],
    })
  })

  it("en sobreventa, restar oversoldUsdCents es lo que hace que la igualdad se cumpla (y sin eso, no se cumple)", () => {
    const datos: Datos = {
      initial: { usdCents: 40_000, rate: "1000", date: "2026-01-01" },
      // vende US$1000 de una tenencia que sólo tiene US$400: sobreventa de US$600.
      exchanges: [{ date: "2026-06-01", usdCents: 100_000, rate: "1500", direction: "sell" }],
      installments: [],
    }
    const { position, balances } = calcular(datos)

    expect(position.oversoldUsdCents).toBeGreaterThan(0)
    // Sin la resta, la igualdad no se sostiene: usdPosition clampea la
    // tenencia en cero (nunca negativa) mientras computeBalances deja el
    // saldo irse a negativo — son las dos caras de la sección 5.5 del spec.
    expect(position.usdCents).not.toBe(balances.usdCents)
    expect(position.usdCents - position.oversoldUsdCents).toBe(balances.usdCents)
  })
})
