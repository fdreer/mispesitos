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
    render(
      <MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} today="2026-08-10" />,
    )

    // Con importe cargado, el plan de cuotas se genera en el render.
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    expect(screen.getByLabelText("Importe de la cuota 1")).toBeTruthy()

    // Un <input type="date"> devuelve "" mientras la fecha está incompleta.
    // Antes del guard, esto tiraba desde addMonthsClamped y se llevaba puesta
    // la pantalla entera.
    expect(() =>
      fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "" } }),
    ).not.toThrow()

    // Y el plan que ya estaba sigue en pantalla: no se pierde lo tipeado.
    expect(screen.getByLabelText("Importe de la cuota 1")).toBeTruthy()
  })

  it("regenera el plan cuando la fecha vuelve a ser válida", () => {
    render(
      <MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} today="2026-08-10" />,
    )

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "" } })
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-03-31" } })

    const vencimiento = screen.getByLabelText("Vencimiento de la cuota 1") as HTMLInputElement
    expect(vencimiento.value).toBe("2026-03-31")
  })

  // Las filas de cuota se MUESTRAN en pesos y se ENVÍAN en centavos: son dos
  // unidades para el mismo dato, y el único lugar donde se cruzan es este
  // componente. Si la conversión se rompe, el formulario sigue andando y
  // guarda importes cien veces más chicos o más grandes sin ningún error a la
  // vista, así que la cobertura va acá y no en el parser.
  it("las cuotas se muestran en pesos y viajan en centavos", () => {
    const { container } = render(
      <MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} today="2026-08-10" />,
    )

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("Cuotas"), { target: { value: "2" } })

    const visible1 = screen.getByLabelText<HTMLInputElement>("Importe de la cuota 1")
    const visible2 = screen.getByLabelText<HTMLInputElement>("Importe de la cuota 2")
    expect(visible1.value).toBe("500,00")
    expect(visible2.value).toBe("500,00")

    const enviados = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="installmentAmount"]'),
    ].map((i) => i.value)
    expect(enviados).toEqual(["50000", "50000"])
  })

  it("una cuota editada a mano se reenvía en centavos", () => {
    const { container } = render(
      <MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} today="2026-08-10" />,
    )

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    // El formato local, con coma decimal: es lo que la persona tipea.
    fireEvent.change(screen.getByLabelText("Importe de la cuota 1"), {
      target: { value: "1.000,50" },
    })

    const enviado = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="installmentAmount"]',
    )
    expect(enviado?.value).toBe("100050")
  })

  it("no genera más de 120 filas de cuota aunque se tipee un número enorme", () => {
    render(
      <MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} today="2026-08-10" />,
    )

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    // Usamos 5000 en lugar de 99999: lo suficientemente grande para ejercer el clamp,
    // lo suficientemente pequeño para que una regresión produzca 5000 filas—lento pero
    // acotado—y falle con un mensaje legible, en lugar de colgar el runner de vitest.
    fireEvent.change(screen.getByLabelText("Cuotas"), { target: { value: "5000" } })

    // El clamp es del estado, no del atributo `max` del input: `max` sólo
    // valida al hacer submit, y para entonces las 99.999 filas ya se pintaron.
    expect(screen.queryByLabelText("Importe de la cuota 121")).toBeNull()
    expect(screen.getByLabelText("Importe de la cuota 120")).toBeTruthy()
  })
})
