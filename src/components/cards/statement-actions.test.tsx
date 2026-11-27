// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  PayStatementButton,
  StatementDatesButton,
  type StatementForActions,
} from "@/components/cards/statement-actions"

const payStatement = vi.fn(
  async (): Promise<
    { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string[]> }
  > => ({ ok: true }),
)

vi.mock("@/server/actions/cards", () => ({
  payStatement: (...args: unknown[]) => payStatement(...(args as [])),
  unpayStatement: vi.fn(),
  updateStatementDates: vi.fn(async () => ({ ok: true })),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

global.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(cleanup)

const RESUMEN: StatementForActions = {
  id: "44444444-4444-4444-8444-444444444444",
  cardId: "22222222-2222-4222-8222-222222222222",
  cardName: "Visa",
  period: "2026-11",
  closingDate: "2026-11-25",
  dueDate: "2026-12-05",
  paidDate: null,
  arsCents: 480_000_00,
  usdCents: 0,
  count: 3,
}

function abrirPago(
  statement: StatementForActions,
  opts: {
    officialSellRate?: number | null
    suggestedBuyRate?: number | null
    usdBalanceCents?: number
  } = {},
) {
  render(
    <PayStatementButton
      statement={statement}
      today="2026-12-01"
      officialSellRate={opts.officialSellRate ?? null}
      suggestedBuyRate={opts.suggestedBuyRate ?? null}
      usdBalanceCents={opts.usdBalanceCents ?? 0}
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: "Pagar resumen" }))
}

describe("PayStatementButton", () => {
  it("sin dólares no pregunta cómo se pagaron", () => {
    abrirPago(RESUMEN)
    expect(screen.queryByRole("radiogroup", { name: /dólares/ })).toBeNull()
    expect(screen.getByRole("button", { name: /^Fecha de pago: 01\/12\/2026$/ })).toBeTruthy()
  })

  it("con dólares, pagar con pesos precarga la estimación oficial y muestra el TC efectivo", () => {
    abrirPago(
      { ...RESUMEN, usdCents: 100_00 },
      { officialSellRate: 1200, usdBalanceCents: 200_00 },
    )

    expect(screen.getByText(/Saldo en dólares disponible/)).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Con pesos" }))

    const total = screen.getByLabelText<HTMLInputElement>(/Total en pesos debitado/)
    expect(total.value).toBe("120.000")
    expect(screen.getByText(/TC efectivo: .*1\.200,00 por dólar/)).toBeTruthy()
  })

  it("con dólares y saldo insuficiente avisa y abre el bloque de compra de dólares", () => {
    abrirPago(
      { ...RESUMEN, usdCents: 100_00 },
      { suggestedBuyRate: 1450, usdBalanceCents: 40_00 },
    )

    expect(screen.getByRole("alert").textContent).toContain("faltan")
    expect(screen.getByLabelText<HTMLInputElement>("Dólares a comprar").value).toBe("60")
    expect(screen.getByLabelText<HTMLInputElement>("Tipo de cambio").value).toBe("1450")

    const datos = new FormData(document.querySelector("form")!)
    expect(datos.get("registerExchange")).toBe("true")
    expect(datos.get("exchangeUsd")).toBe("60")
    expect(datos.get("exchangeRate")).toBe("1450")
  })

  it("manda el resumen, el modo, la fecha y el total en pesos", async () => {
    abrirPago(
      { ...RESUMEN, usdCents: 100_00 },
      { officialSellRate: 1200, usdBalanceCents: 200_00 },
    )
    fireEvent.click(screen.getByRole("radio", { name: "Con pesos" }))

    const datos = new FormData(document.querySelector("form")!)
    expect(datos.get("statementId")).toBe(RESUMEN.id)
    expect(datos.get("mode")).toBe("ars")
    expect(datos.get("paidDate")).toBe("2026-12-01")
    expect(datos.get("usdPaidArs")).toBe("120.000")

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!)
    })
    expect(payStatement).toHaveBeenCalledTimes(1)
  })

  it("un resumen sin cuotas no se puede pagar", () => {
    render(
      <PayStatementButton
        statement={{ ...RESUMEN, count: 0 }}
        today="2026-12-01"
        officialSellRate={null}
        suggestedBuyRate={null}
        usdBalanceCents={0}
      />,
    )
    expect(screen.getByRole("button", { name: "Pagar resumen" }).hasAttribute("disabled")).toBe(true)
  })

  it("un resumen que todavía no cerró no se puede pagar", () => {
    render(
      <PayStatementButton
        statement={{ ...RESUMEN, closingDate: "2026-12-20" }}
        today="2026-12-01"
        officialSellRate={null}
        suggestedBuyRate={null}
        usdBalanceCents={0}
      />,
    )
    const boton = screen.getByRole("button", { name: "Pagar resumen" })
    expect(boton.hasAttribute("disabled")).toBe(true)
    expect(boton.getAttribute("title")).toBe("Se paga cuando cierre, el 20/12/2026.")
  })

  it("el error de fecha de la acción va junto al campo", async () => {
    payStatement.mockResolvedValueOnce({
      ok: false,
      message: "El resumen todavía no había cerrado en esa fecha.",
      fieldErrors: { paidDate: ["El resumen todavía no había cerrado en esa fecha."] },
    })
    abrirPago(RESUMEN)
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!)
    })
    expect(screen.getAllByText("El resumen todavía no había cerrado en esa fecha.").length).toBe(2)
  })
})

describe("StatementDatesButton", () => {
  it("con el resumen pagado no deja corregir fechas", () => {
    render(<StatementDatesButton statement={{ ...RESUMEN, paidDate: "2026-12-01" }} />)
    expect(screen.getByRole("button", { name: "Corregir fechas" }).hasAttribute("disabled")).toBe(true)
  })

  it("impago, abre el diálogo con las fechas del resumen", () => {
    render(<StatementDatesButton statement={RESUMEN} />)
    fireEvent.click(screen.getByRole("button", { name: "Corregir fechas" }))
    expect(screen.getByRole("button", { name: "Cierre: 25/11/2026" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Vencimiento: 05/12/2026" })).toBeTruthy()
    const datos = new FormData(document.querySelector("form")!)
    expect(datos.get("period")).toBe("2026-11")
    expect(datos.get("cardId")).toBe(RESUMEN.cardId)
  })
})
