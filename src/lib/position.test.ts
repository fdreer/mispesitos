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
import { convertToArs } from "@/lib/money"

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

  it("las 720 permutaciones de los mismos eventos dan exactamente el mismo resultado", () => {
    // La base devuelve las filas en el orden que se le antoja y el orden puede
    // cambiar entre recargas. El usuario tiene que ver siempre el mismo número.
    // Seis eventos elegidos para pisar todos los desempates a la vez: misma
    // fecha con entrada y salida, dos salidas del mismo día de distinto monto,
    // dos del mismo monto a distinto TC, y la posición en descubierto —el caso
    // en el que el orden sí cambiaría el resultado si no hubiera desempate.
    const eventos = [
      buy("2026-01-10", 50, 1000),
      buy("2026-06-10", 30, 1300),
      sell("2026-06-10", 60, 1500),
      sell("2026-06-10", 40, 1200),
      sell("2026-06-10", 40, 1700),
      sell("2026-07-01", 25, 1600),
    ]
    const esperado = usdPosition(eventos)

    const permutaciones = (lista: PositionEvent[]): PositionEvent[][] =>
      lista.length <= 1
        ? [lista]
        : lista.flatMap((evento, i) =>
            permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [
              evento,
              ...resto,
            ]),
          )

    const todas = permutaciones(eventos)
    expect(todas).toHaveLength(720)

    const distintas = todas.filter(
      (orden) => JSON.stringify(usdPosition(orden)) !== JSON.stringify(esperado),
    )
    expect(distintas).toEqual([])
  })

  it("no reordena el array que le pasan", () => {
    // usdPosition ordena para calcular. Si ordenara sobre el array original,
    // el llamador se quedaría con sus eventos movidos de lugar sin pedirlo.
    const eventos = [sell("2026-06-10", 100, 1500), buy("2026-01-10", 100, 1000)]
    const comoLlegó = JSON.parse(JSON.stringify(eventos)) as PositionEvent[]

    usdPosition(eventos)

    expect(eventos).toEqual(comoLlegó)
  })

  it("al liquidar toda la tenencia, el resultado es exactamente lo cobrado menos lo gastado", () => {
    // La cuenta que el usuario puede hacer con una calculadora: vendí todo a
    // tanto, lo había comprado a tanto, la diferencia es esto. Con TC de cuatro
    // decimales, que es lo que permite la columna `numeric(12,4)`.
    const casos = [
      { compras: [[10_000, 1234.5678]], venta: [10_000, 1500.9999] },
      { compras: [[333, 1000.3333], [777, 1450.7777]], venta: [1_110, 1601.1111] },
      { compras: [[1, 1234.5678]], venta: [1, 1000.0001] },
    ] as const

    for (const caso of casos) {
      const eventos: PositionEvent[] = caso.compras.map(([usdCents, rate], i) => ({
        date: `2026-0${i + 1}-10`,
        usdCents,
        rate,
        direction: "in",
      }))
      const [usdVendidos, tcVenta] = caso.venta
      eventos.push({ date: "2026-09-10", usdCents: usdVendidos, rate: tcVenta, direction: "out" })

      const gastado = caso.compras.reduce((a, [c, r]) => a + convertToArs(c, r), 0)
      const cobrado = convertToArs(usdVendidos, tcVenta)

      const p = usdPosition(eventos)
      expect(p.usdCents).toBe(0)
      expect(p.costArsCents).toBe(0)
      expect(p.averageRate).toBe(0)
      expect(p.realizedArsCents).toBe(cobrado - gastado)
    }
  })

  it("la diferencia de cambio de una venta parcial se redondea al centavo", () => {
    // Compra de US$3,33 a 1000,3333 => 333 * 1000,3333 = 333.110,9889 centavos
    // de peso, que redondean a 333.111. El promedio queda en 333.111 / 333 =
    // 1000,33333… Vender US$1 a 1500,5 realiza 100 * (1500,5 - 1000,33333…) =
    // 50.016,6666… centavos, que redondean a 50.017.
    //
    // Y la descarga de costo va por su propio redondeo: 100 * 1000,33333… =
    // 100.033,33… => 100.033, así que quedan 333.111 - 100.033 = 233.078.
    const p = usdPosition([
      { date: "2026-01-10", usdCents: 333, rate: 1000.3333, direction: "in" },
      { date: "2026-06-10", usdCents: 100, rate: 1500.5, direction: "out" },
    ])

    expect(p.usdCents).toBe(233)
    expect(p.realizedArsCents).toBe(50_017)
    expect(p.costArsCents).toBe(233_078)
    expect(Number.isInteger(p.realizedArsCents)).toBe(true)
    expect(Number.isInteger(p.costArsCents)).toBe(true)
  })

  it("la sobreventa se acumula y no se borra con una compra posterior", () => {
    // Una vez que se dispuso de dólares que no estaban cargados, el aviso
    // queda: comprar después no explica de dónde salieron los de antes.
    const p = usdPosition([
      sell("2026-01-10", 100, 1500),
      buy("2026-02-10", 200, 1000),
      sell("2026-03-10", 300, 1600),
    ])

    expect(p.oversoldUsdCents).toBe(20_000) // 100 de la primera + 100 de la última
    expect(p.usdCents).toBe(0)
    expect(p.costArsCents).toBe(0)
  })

  it("una salida de cero dólares no toca nada", () => {
    const antes = usdPosition([buy("2026-01-10", 100, 1000)])
    const después = usdPosition([
      buy("2026-01-10", 100, 1000),
      sell("2026-06-10", 0, 1500),
    ])

    expect(después).toEqual(antes)
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
