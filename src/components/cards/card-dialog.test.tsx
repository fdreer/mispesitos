// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { CardDialog } from "@/components/cards/card-dialog"

const createCard = vi.fn(
  async (): Promise<
    { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string[]> }
  > => ({ ok: true }),
)
const updateCard = vi.fn(async () => ({ ok: true }))

vi.mock("@/server/actions/cards", () => ({
  createCard: (...args: unknown[]) => createCard(...(args as [])),
  updateCard: (...args: unknown[]) => updateCard(...(args as [])),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

afterEach(cleanup)

describe("CardDialog", () => {
  it("da de alta con nombre, días, límite y color", async () => {
    render(<CardDialog />)
    fireEvent.click(screen.getByRole("button", { name: "Nueva tarjeta" }))

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Visa Galicia" } })
    fireEvent.change(screen.getByLabelText("Día de cierre"), { target: { value: "25" } })
    fireEvent.change(screen.getByLabelText("Día de vencimiento"), { target: { value: "5" } })
    const limite = screen.getByLabelText<HTMLInputElement>("Límite (opcional)")
    fireEvent.change(limite, { target: { value: "2000000" } })
    expect(limite.value).toBe("2.000.000")
    fireEvent.click(screen.getByRole("radio", { name: "Azul" }))

    const datos = new FormData(document.querySelector("form")!)
    expect(datos.get("name")).toBe("Visa Galicia")
    expect(datos.get("closingDay")).toBe("25")
    expect(datos.get("creditLimit")).toBe("2.000.000")
    expect(datos.get("color")).toBe("azul")

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!)
    })
    expect(createCard).toHaveBeenCalledTimes(1)
  })

  it("muestra el error de cada campo junto al campo", async () => {
    createCard.mockResolvedValueOnce({
      ok: false,
      message: "Elegí un día entre 1 y 31.",
      fieldErrors: { closingDay: ["Elegí un día entre 1 y 31."] },
    })
    render(<CardDialog />)
    fireEvent.click(screen.getByRole("button", { name: "Nueva tarjeta" }))
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!)
    })
    expect(screen.getByLabelText("Día de cierre").getAttribute("aria-invalid")).toBe("true")
  })

  it("editando precarga la tarjeta y manda su id", () => {
    render(
      <CardDialog
        card={{
          id: "22222222-2222-4222-8222-222222222222",
          name: "Visa",
          closingDay: 25,
          dueDay: 5,
          creditLimitCents: 150_000_000,
          color: "violeta",
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Editar tarjeta" }))
    expect(screen.getByLabelText<HTMLInputElement>("Límite (opcional)").value).toBe("1.500.000")
    const datos = new FormData(document.querySelector("form")!)
    expect(datos.get("id")).toBe("22222222-2222-4222-8222-222222222222")
    expect(datos.get("color")).toBe("violeta")
  })
})
