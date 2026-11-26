// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ExchangeForm } from "@/components/exchange-form"

const createExchange = vi.fn()
const refresh = vi.fn()

vi.mock("@/server/actions/movements", () => ({
  createExchange: (...args: unknown[]) => createExchange(...args),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh }),
}))

Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

const campo = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name="${name}"]`)

function montar(buyRate: number | null = 1400, sellRate: number | null = 1450) {
  return render(<ExchangeForm buyRate={buyRate} sellRate={sellRate} today="2026-08-10" />)
}

beforeEach(() => {
  vi.clearAllMocks()
  createExchange.mockResolvedValue({ ok: true })
})

afterEach(cleanup)

describe("ExchangeForm", () => {
  it("arranca en compra, con el TC de compra precargado", () => {
    montar()

    expect(campo("direction")?.value).toBe("buy")
    expect(screen.getByLabelText("Tipo de cambio").getAttribute("value")).toBe("1400")
  })

  it("pasar a venta trae el TC de venta", () => {
    montar()

    fireEvent.click(screen.getByRole("radio", { name: "Vender dólares" }))

    expect(campo("direction")?.value).toBe("sell")
    expect(screen.getByLabelText("Tipo de cambio").getAttribute("value")).toBe("1450")
  })

  it("clickear el sentido ya activo no lo deja en ninguno", () => {
    montar()

    fireEvent.click(screen.getByRole("radio", { name: "Comprar dólares" }))

    expect(campo("direction")?.value).toBe("buy")
  })

  it("sin cotización avisa y deja el campo vacío para escribirla a mano", () => {
    montar(null, null)

    expect(screen.getByLabelText("Tipo de cambio").getAttribute("value")).toBe("")
    expect(screen.getByText("No pudimos traer la cotización. Escribila a mano.")).toBeTruthy()
  })

  it("la fecha sale del calendario y viaja en el campo oculto", () => {
    montar()

    expect(campo("date")?.value).toBe("2026-08-10")

    fireEvent.click(screen.getByRole("button", { name: /^Fecha:/ }))
    fireEvent.click(screen.getByRole("button", { name: "jueves, 20 de agosto de 2026" }))

    expect(campo("date")?.value).toBe("2026-08-20")
  })

  it("al guardar bien refresca la pantalla: las tres tarjetas de arriba cambian", async () => {
    montar()

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Registrar operación" }).closest("form")!)
    })

    expect(createExchange).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it("un error se muestra y no refresca", async () => {
    createExchange.mockResolvedValue({ ok: false, message: "Poné una cantidad mayor a cero." })
    montar()

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Registrar operación" }).closest("form")!)
    })

    expect(screen.getByText("Poné una cantidad mayor a cero.")).toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
  })
})
