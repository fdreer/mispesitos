import { describe, it, expect } from "vitest"

import {
  assertCurrency,
  assertExchangeDirection,
  assertInstallmentMovementKind,
  assertPaidDate,
} from "@/lib/movement-asserts"

describe("assertExchangeDirection", () => {
  it("deja pasar las dos direcciones posibles", () => {
    expect(assertExchangeDirection("buy")).toBe("buy")
    expect(assertExchangeDirection("sell")).toBe("sell")
  })

  it("revienta con direction nula en vez de devolver algo", () => {
    expect(() => assertExchangeDirection(null)).toThrow(/direction inesperada/)
  })

  it("revienta con cualquier otro valor, incluidos los parecidos", () => {
    for (const raro of ["", "BUY", "Buy", "compra", "venta", "sold"]) {
      expect(() => assertExchangeDirection(raro)).toThrow(/direction inesperada/)
    }
  })

  it("el mensaje dice qué valor llegó, para poder ir a buscar la fila", () => {
    expect(() => assertExchangeDirection(null)).toThrow(/null/)
    expect(() => assertExchangeDirection("compra")).toThrow(/"compra"/)
  })
})

describe("assertInstallmentMovementKind", () => {
  it("deja pasar ingreso y egreso", () => {
    expect(assertInstallmentMovementKind("income")).toBe("income")
    expect(assertInstallmentMovementKind("expense")).toBe("expense")
  })

  it("revienta con exchange, que es el kind que nunca tiene cuotas", () => {
    expect(assertInstallmentMovementKind.bind(null, "exchange")).toThrow(/kind inesperado/)
  })

  it("revienta con cualquier otro valor", () => {
    for (const raro of ["", "INCOME", "Income", "ingreso", "gasto"]) {
      expect(() => assertInstallmentMovementKind(raro)).toThrow(/kind inesperado/)
    }
  })

  it("el mensaje dice qué valor llegó", () => {
    expect(() => assertInstallmentMovementKind("exchange")).toThrow(/"exchange"/)
  })
})

describe("assertCurrency", () => {
  it("deja pasar las dos monedas posibles", () => {
    expect(assertCurrency("ARS")).toBe("ARS")
    expect(assertCurrency("USD")).toBe("USD")
  })

  it("revienta con cualquier otra, incluidas las parecidas", () => {
    for (const rara of ["", "ars", "usd", "Ars", "EUR", "AR$", "U$S", "peso"]) {
      expect(() => assertCurrency(rara)).toThrow(/currency inesperada/)
    }
  })

  it("el mensaje dice qué valor llegó, para poder ir a buscar la fila", () => {
    expect(() => assertCurrency("EUR")).toThrow(/"EUR"/)
    expect(() => assertCurrency("")).toThrow(/""/)
  })
})

describe("assertPaidDate", () => {
  it("deja pasar una fecha", () => {
    expect(assertPaidDate("2026-08-10")).toBe("2026-08-10")
  })

  it("revienta con null en vez de devolverlo", () => {
    expect(() => assertPaidDate(null)).toThrow(/sin paidDate/)
  })

  it("el mensaje dice qué llegó, para poder ir a buscar la fila", () => {
    expect(() => assertPaidDate(null)).toThrow(/null/)
  })

  it("no se mete con el formato: la columna date ya lo garantiza", () => {
    expect(assertPaidDate("")).toBe("")
  })
})
