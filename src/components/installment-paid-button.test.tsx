// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

/**
 * Toda la lógica de concurrencia de las cuotas vive acá: cada botón tiene su
 * propio `useTransition`, y de eso depende que marcar una cuota no deje muertos
 * los botones de las otras ni se coma el error cuando la Server Action falla.
 * Es lo que antes hacía un `Set` de ids en vuelo adentro de `InstallmentRows`.
 *
 * El doble se resuelve a voluntad —no devuelve una promesa ya cumplida— porque
 * si no, no existe el instante "en vuelo" que es justo lo que hay que mirar.
 */
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

/** Lo que el botón necesita además del id y el estado. */
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

    // Desmarcar saca plata de lo percibido: el toque solo no alcanza.
    expect(mocks.setInstallmentPaid).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog").textContent).toContain("Desmarcar la cuota 3")

    fireEvent.click(screen.getByRole("button", { name: "Desmarcar" }))
    expect(mocks.setInstallmentPaid).toHaveBeenCalledWith("ins-1", false)

    await act(async () => {
      resolver({ ok: true })
    })
  })

  /**
   * El motivo de que el estado viva adentro de cada botón: con una sola marca
   * de "en vuelo" compartida, marcar una cuota deshabilitaba las tres.
   */
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

    // Y la segunda se puede marcar sin esperar a la primera.
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

  /**
   * El resultado de la Server Action se mira, nunca se descarta: si marcar
   * falla, la persona tiene que enterarse en vez de ver la cuota igual que
   * antes sin ninguna explicación.
   */
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
    // Que la fila se libere es la mitad del arreglo: un error que deja el
    // botón muerto obliga a recargar la página para reintentar.
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

    // El 27 de noviembre es mañana: no se puede elegir.
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
