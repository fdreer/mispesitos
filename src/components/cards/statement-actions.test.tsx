// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  PayStatementButton,
  StatementDatesButton,
  type StatementForActions,
} from "@/components/cards/statement-actions"

/**
 * Las mismas dos fronteras que `movement-form.test.tsx`: la Server Action
 * (que abre una conexión a Postgres al importarse) y el router de Next.
 */
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

function abrirPago(statement: StatementForActions, suggestedRate: number | null = null) {
  render(<PayStatementButton statement={statement} today="2026-12-01" suggestedRate={suggestedRate} />)
  fireEvent.click(screen.getByRole("button", { name: "Pagar resumen" }))
}

describe("PayStatementButton", () => {
  it("sin dólares no pregunta cómo se pagaron", () => {
    abrirPago(RESUMEN)
    expect(screen.queryByRole("radiogroup", { name: /dólares/ })).toBeNull()
    expect(screen.getByRole("button", { name: /^Fecha de pago: 01\/12\/2026$/ })).toBeTruthy()
  })

  it("con dólares, pagar con pesos pide el TC y muestra cuántos pesos son", () => {
    abrirPago({ ...RESUMEN, usdCents: 100_00 }, 1200)

    expect(screen.getByText("Salen de tu saldo en dólares.")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Con pesos" }))

    const tc = screen.getByLabelText<HTMLInputElement>("Tipo de cambio")
    expect(tc.value).toBe("1200")
    expect(screen.getByText(/son .*120\.000,00: salen de tu saldo en pesos/)).toBeTruthy()
  })

  it("manda el resumen, el modo y la fecha", async () => {
    abrirPago({ ...RESUMEN, usdCents: 100_00 }, 1200)
    fireEvent.click(screen.getByRole("radio", { name: "Con pesos" }))

    const form = screen.getByRole("button", { name: "Pagar resumen", hidden: false }).closest("form")
    const datos = new FormData(document.querySelector("form")!)
    expect(datos.get("statementId")).toBe(RESUMEN.id)
    expect(datos.get("mode")).toBe("ars")
    expect(datos.get("paidDate")).toBe("2026-12-01")
    expect(datos.get("usdPaidRate")).toBe("1200")
    expect(form).toBeTruthy()

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!)
    })
    expect(payStatement).toHaveBeenCalledTimes(1)
  })

  it("un resumen sin cuotas no se puede pagar", () => {
    render(
      <PayStatementButton statement={{ ...RESUMEN, count: 0 }} today="2026-12-01" suggestedRate={null} />,
    )
    expect(screen.getByRole("button", { name: "Pagar resumen" }).hasAttribute("disabled")).toBe(true)
  })

  it("un resumen que todavía no cerró no se puede pagar", () => {
    render(
      <PayStatementButton statement={{ ...RESUMEN, closingDate: "2026-12-20" }} today="2026-12-01" suggestedRate={null} />,
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
