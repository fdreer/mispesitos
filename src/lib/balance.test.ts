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
})
