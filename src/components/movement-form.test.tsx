// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { MovementForm } from "@/components/movement-form"

/**
 * Las dos fronteras del framework que no existen fuera del servidor de Next,
 * y nada más. Mismo criterio que `src/server/actions/actions.db.test.ts`:
 * la Server Action importa `@/db/client`, que abre una conexión a Postgres
 * apenas se lo importa; y `useRouter` necesita el router de Next.
 */
vi.mock("@/server/actions/movements", () => ({
  createMovement: async () => ({ ok: true }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

/**
 * Radix (el Select de shadcn) usa dos APIs de puntero que jsdom no implementa.
 * No es un doble de nada nuestro: es rellenar un hueco del entorno.
 */
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

const CATEGORIAS = [
  { id: "cat-1", userId: "u", name: "Supermercado", kind: "expense", archived: false },
]

afterEach(cleanup)

describe("MovementForm", () => {
  it("no revienta cuando se borra la fecha con un importe ya cargado", () => {
    render(<MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} />)

    // Con importe cargado, el plan de cuotas se genera en el render.
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    expect(screen.getByLabelText("Importe de la cuota 1 en centavos")).toBeTruthy()

    // Un <input type="date"> devuelve "" mientras la fecha está incompleta.
    // Antes del guard, esto tiraba desde addMonthsClamped y se llevaba puesta
    // la pantalla entera.
    expect(() =>
      fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "" } }),
    ).not.toThrow()

    // Y el plan que ya estaba sigue en pantalla: no se pierde lo tipeado.
    expect(screen.getByLabelText("Importe de la cuota 1 en centavos")).toBeTruthy()
  })

  it("regenera el plan cuando la fecha vuelve a ser válida", () => {
    render(<MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} />)

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "" } })
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-03-31" } })

    const vencimiento = screen.getByLabelText("Vencimiento de la cuota 1") as HTMLInputElement
    expect(vencimiento.value).toBe("2026-03-31")
  })
})
