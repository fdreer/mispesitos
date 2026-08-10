import { describe, it, expect } from "vitest"
import {
  computeBalances,
  type BalanceSettings,
  type PaidInstallment,
  type ExchangeMovement,
} from "@/lib/balance"

const settings: BalanceSettings = {
  initialArsCents: 100_000_00,
  initialUsdCents: 500_00,
  initialDate: "2026-01-01",
}

describe("computeBalances", () => {
  it("sin movimientos, devuelve el saldo inicial", () => {
    expect(computeBalances(settings, [], [])).toEqual({
      arsCents: 100_000_00,
      usdCents: 500_00,
    })
  })

  it("un ingreso cobrado suma", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-02-05", currency: "ARS", kind: "income", amountCents: 50_000_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(150_000_00)
  })

  it("un egreso pagado resta", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-02-05", currency: "ARS", kind: "expense", amountCents: 30_000_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(70_000_00)
  })

  it("ignora lo anterior a la fecha del saldo inicial", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2025-12-31", currency: "ARS", kind: "income", amountCents: 999_999_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(100_000_00)
  })

  it("incluye lo pagado exactamente en la fecha del saldo inicial", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-01-01", currency: "ARS", kind: "income", amountCents: 1_000_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(101_000_00)
  })

  it("separa las monedas", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-02-05", currency: "USD", kind: "income", amountCents: 100_00 },
      { paidDate: "2026-02-06", currency: "USD", kind: "expense", amountCents: 40_00 },
      { paidDate: "2026-02-07", currency: "ARS", kind: "expense", amountCents: 10_000_00 },
    ]
    expect(computeBalances(settings, paid, [])).toEqual({
      arsCents: 90_000_00,
      usdCents: 560_00,
    })
  })

  it("una compra de dólares resta pesos y suma dólares", () => {
    const exchanges: ExchangeMovement[] = [
      { date: "2026-03-01", direction: "buy", usdCents: 50_00, rate: 1_450 },
    ]
    // 50 USD * 1450 = $72.500
    expect(computeBalances(settings, [], exchanges)).toEqual({
      arsCents: 100_000_00 - 72_500_00,
      usdCents: 550_00,
    })
  })

  it("una venta de dólares suma pesos y resta dólares", () => {
    const exchanges: ExchangeMovement[] = [
      { date: "2026-03-01", direction: "sell", usdCents: 100_00, rate: 1_500 },
    ]
    expect(computeBalances(settings, [], exchanges)).toEqual({
      arsCents: 100_000_00 + 150_000_00,
      usdCents: 400_00,
    })
  })

  it("ignora los cambios anteriores a la fecha del saldo inicial", () => {
    const exchanges: ExchangeMovement[] = [
      { date: "2025-11-20", direction: "buy", usdCents: 999_00, rate: 1_000 },
    ]
    expect(computeBalances(settings, [], exchanges)).toEqual({
      arsCents: 100_000_00,
      usdCents: 500_00,
    })
  })

  it("el saldo puede quedar negativo si se gastó de más", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-02-05", currency: "ARS", kind: "expense", amountCents: 150_000_00 },
    ]
    expect(computeBalances(settings, paid, []).arsCents).toBe(-50_000_00)
  })

  it("incluye el cambio hecho exactamente en la fecha del saldo inicial", () => {
    // El otro lado del borde que ya prueba "ignora los cambios anteriores".
    // Un `<` que se vuelva `<=` deja afuera todo lo del día del saldo inicial.
    const exchanges: ExchangeMovement[] = [
      { date: "2026-01-01", direction: "buy", usdCents: 100_00, rate: 1_000 },
    ]
    expect(computeBalances(settings, [], exchanges)).toEqual({
      arsCents: 100_000_00 - 100_000_00,
      usdCents: 600_00,
    })
  })

  it("una cuota en dólares no toca los pesos y una en pesos no toca los dólares", () => {
    // Las dos monedas se llevan por separado: no hay conversión en el saldo.
    // Un movimiento en USD que sumara pesos inventaría plata que no existe.
    const soloUsd = computeBalances(
      settings,
      [{ paidDate: "2026-02-05", currency: "USD", kind: "income", amountCents: 1_000_00 }],
      [],
    )
    expect(soloUsd.arsCents).toBe(settings.initialArsCents)
    expect(soloUsd.usdCents).toBe(1_500_00)

    const soloArs = computeBalances(
      settings,
      [{ paidDate: "2026-02-05", currency: "ARS", kind: "expense", amountCents: 1_000_00 }],
      [],
    )
    expect(soloArs.usdCents).toBe(settings.initialUsdCents)
    expect(soloArs.arsCents).toBe(99_000_00)
  })

  it("la pata en pesos de un cambio se redondea al centavo", () => {
    // US$1,23 a 1450,5678 son 1.784,1983… centavos de peso: 1.784.
    const exchanges: ExchangeMovement[] = [
      { date: "2026-03-01", direction: "buy", usdCents: 123, rate: 1450.5678 },
    ]
    const result = computeBalances(settings, [], exchanges)

    expect(result.arsCents).toBe(100_000_00 - 178_420)
    expect(Number.isInteger(result.arsCents)).toBe(true)
  })

  it("comprar y vender los mismos dólares al mismo TC deja todo como estaba", () => {
    // Si las dos patas no usaran el mismo redondeo, ida y vuelta dejaría
    // centavos colgados en el saldo en pesos.
    const exchanges: ExchangeMovement[] = [
      { date: "2026-03-01", direction: "buy", usdCents: 777, rate: 1450.5678 },
      { date: "2026-03-02", direction: "sell", usdCents: 777, rate: 1450.5678 },
    ]
    expect(computeBalances(settings, [], exchanges)).toEqual({
      arsCents: settings.initialArsCents,
      usdCents: settings.initialUsdCents,
    })
  })

  it("el orden de las listas no cambia el saldo", () => {
    const paid: PaidInstallment[] = [
      { paidDate: "2026-02-05", currency: "ARS", kind: "income", amountCents: 50_000_00 },
      { paidDate: "2026-01-05", currency: "USD", kind: "expense", amountCents: 100_00 },
      { paidDate: "2025-12-05", currency: "ARS", kind: "income", amountCents: 999_00 },
    ]
    const exchanges: ExchangeMovement[] = [
      { date: "2026-04-01", direction: "sell", usdCents: 50_00, rate: 1_500 },
      { date: "2026-02-01", direction: "buy", usdCents: 20_00, rate: 1_400 },
    ]

    expect(computeBalances(settings, [...paid].reverse(), [...exchanges].reverse())).toEqual(
      computeBalances(settings, paid, exchanges),
    )
  })
})
