import { describe, it, expect } from "vitest"

import { computeBalances } from "@/lib/balance"
import {
  assertExchangeDirection,
  assertInstallmentMovementKind,
} from "@/lib/movement-asserts"

/**
 * Estos asserts existen para que un dato imposible sea RUIDOSO. La tentación
 * es reemplazarlos por un `as`, que afirma lo mismo y no comprueba nada: el
 * dashboard lo había hecho, y por eso la misma fila mala hacía dos cosas
 * opuestas según qué pantalla la leyera.
 *
 * NO BORRAR NI RELAJAR. Si alguno se pone en rojo, la pregunta es por qué
 * llegó un valor inesperado, no cómo hacer que el assert lo acepte.
 */
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

  /**
   * El motivo concreto de todo esto, escrito como test: un cambio de divisa
   * con `direction` nulo, leído con un `as`, cae en el `else` de
   * computeBalances y se contabiliza EN SILENCIO como una venta —suma pesos y
   * resta dólares—, que es lo contrario de lo que pasó si en realidad era una
   * compra. Con el assert, esa fila no llega nunca al cálculo.
   */
  it("una fila con direction nula no puede llegar a computeBalances como venta", () => {
    const settings = { initialArsCents: 0, initialUsdCents: 0, initialDate: "2026-01-01" }
    const cambioRoto = { date: "2026-02-01", usdCents: 100_00, rate: 1000 }

    // Lo que hacía el `as`: la fila entra y se clasifica sola como venta.
    const conElAs = computeBalances({ ...settings }, [], [
      { ...cambioRoto, direction: null as unknown as "buy" | "sell" },
    ])
    expect(conElAs).toEqual({ arsCents: 100_000_00, usdCents: -100_00 })

    // Lo que hace el assert: no hay resultado, hay una excepción.
    expect(() =>
      computeBalances({ ...settings }, [], [
        { ...cambioRoto, direction: assertExchangeDirection(null) },
      ]),
    ).toThrow(/direction inesperada/)
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
