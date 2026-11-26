// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const mocks = vi.hoisted(() => ({ setInstallmentPaid: vi.fn() }))

vi.mock("@/server/actions/movements", () => ({
  setInstallmentPaid: mocks.setInstallmentPaid,
}))

import { InstallmentPaidButton } from "@/components/installment-paid-button"

type Resultado = { ok: true } | { ok: false; message: string }

function diferida() {
  let resolver: (value: Resultado) => void = () => {}
  const promesa = new Promise<Resultado>((r) => {
    resolver = r
  })
  return { promesa, resolver }
}

const BASE = { today: "2026-11-26", number: 3, description: "Televisor" }

afterEach(() => {
  cleanup()
  mocks.setInstallmentPaid.mockReset()
})

describe("InstallmentPaidButton", () => {
  it("marca la cuota con el estado contrario al que tiene", async () => {
    const { promesa, resolver } = diferida()
    mocks.setInstallmentPaid.mockReturnValue(promesa)

    render(<InstallmentPaidButton id="ins-1" paid={false} {...BASE} />)
    fireEvent.click(screen.getByRole("button", { name: "Marcar pagada" }))

    expect(mocks.setInstallmentPaid).toHaveBeenCalledWith("ins-1", true, undefined)

    await act(async () => {
      resolver({ ok: true })
    })
  })

  it("una cuota pagada se desmarca, pero sólo después de confirmar", async () => {
    const { promesa, resolver } = diferida()
    mocks.setInstallmentPaid.mockReturnValue(promesa)

    render(<InstallmentPaidButton id="ins-1" paid paidDate="2026-11-20" {...BASE} />)
    fireEvent.click(screen.getByRole("button", { name: "Pagada · 20/11" }))

    expect(mocks.setInstallmentPaid).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog").textContent).toContain("Desmarcar la cuota 3")

    fireEvent.click(screen.getByRole("button", { name: "Desmarcar" }))
    expect(mocks.setInstallmentPaid).toHaveBeenCalledWith("ins-1", false)

    await act(async () => {
      resolver({ ok: true })
    })
  })

  it("mientras una cuota viaja, las otras siguen clickeables", async () => {
    const primera = diferida()
    mocks.setInstallmentPaid.mockReturnValueOnce(primera.promesa)

    render(
      <>
        <InstallmentPaidButton id="ins-1" paid={false} {...BASE} />
        <InstallmentPaidButton id="ins-2" paid={false} {...BASE} />
      </>,
    )

    const [uno, dos] = screen.getAllByRole("button", { name: "Marcar pagada" })
    fireEvent.click(uno)

    expect(uno).toHaveProperty("disabled", true)
    expect(dos).toHaveProperty("disabled", false)

    const segunda = diferida()
    mocks.setInstallmentPaid.mockReturnValueOnce(segunda.promesa)
    fireEvent.click(dos)

    expect(mocks.setInstallmentPaid).toHaveBeenCalledTimes(2)
    expect(mocks.setInstallmentPaid).toHaveBeenLastCalledWith("ins-2", true, undefined)

    await act(async () => {
      primera.resolver({ ok: true })
      segunda.resolver({ ok: true })
    })
  })

  it("muestra el mensaje cuando la acción falla, y el botón vuelve a servir", async () => {
    const { promesa, resolver } = diferida()
    mocks.setInstallmentPaid.mockReturnValue(promesa)

    render(<InstallmentPaidButton id="ins-1" paid={false} {...BASE} />)
    const boton = screen.getByRole("button", { name: "Marcar pagada" })
    fireEvent.click(boton)

    await act(async () => {
      resolver({ ok: false, message: "No pudimos actualizar la cuota." })
    })

    expect(screen.getByText("No pudimos actualizar la cuota.")).toBeTruthy()
    expect(boton).toHaveProperty("disabled", false)
  })

  it("el error de un intento no sobrevive al siguiente", async () => {
    const falla = diferida()
    mocks.setInstallmentPaid.mockReturnValueOnce(falla.promesa)

    render(<InstallmentPaidButton id="ins-1" paid={false} {...BASE} />)
    const boton = screen.getByRole("button", { name: "Marcar pagada" })
    fireEvent.click(boton)

    await act(async () => {
      falla.resolver({ ok: false, message: "No pudimos actualizar la cuota." })
    })
    expect(screen.queryByText("No pudimos actualizar la cuota.")).not.toBeNull()

    const exito = diferida()
    mocks.setInstallmentPaid.mockReturnValueOnce(exito.promesa)
    fireEvent.click(boton)

    await act(async () => {
      exito.resolver({ ok: true })
    })
    expect(screen.queryByText("No pudimos actualizar la cuota.")).toBeNull()
  })

  it("deja elegir la fecha de pago, nunca una posterior a hoy", async () => {
    const { promesa, resolver } = diferida()
    mocks.setInstallmentPaid.mockReturnValue(promesa)

    render(<InstallmentPaidButton id="ins-1" paid={false} {...BASE} />)
    fireEvent.click(screen.getByRole("button", { name: "Elegir fecha de pago de la cuota 3" }))

    const manana = screen.getByRole("button", { name: /27 de noviembre/ })
    expect(manana).toHaveProperty("disabled", true)

    fireEvent.click(screen.getByRole("button", { name: /20 de noviembre/ }))
    expect(mocks.setInstallmentPaid).toHaveBeenCalledWith("ins-1", true, "2026-11-20")

    await act(async () => {
      resolver({ ok: true })
    })
  })

  it("en un ingreso habla de cobrar, no de pagar", () => {
    render(<InstallmentPaidButton id="ins-1" paid={false} kind="income" {...BASE} />)
    expect(screen.getByRole("button", { name: "Marcar cobrada" })).toBeTruthy()
  })
})
