// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { MovementForm } from "@/components/movement-form"

const updateMovement = vi.fn(async () => ({ ok: true }))
const createMovement = vi.fn(
  async (): Promise<
    { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string[]> }
  > => ({ ok: true }),
)

vi.mock("@/server/actions/movements", () => ({
  createMovement: (...args: unknown[]) => createMovement(...(args as [])),
  updateMovement: (...args: unknown[]) => updateMovement(...(args as [])),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}
global.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const CATEGORIAS = [
  { id: "cat-1", userId: "u", name: "Supermercado", kind: "expense", archived: false, parentId: null, color: null, icon: null },
]

afterEach(cleanup)

describe("MovementForm", () => {

  it("regenera el plan cuando la fecha cambia", () => {
    const { container } = render(
      <MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} today="2026-08-10" />,
    )

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    expect(screen.getByLabelText("Importe de la cuota 1")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /^Fecha:/ }))
    fireEvent.click(screen.getByRole("button", { name: "jueves, 20 de agosto de 2026" }))

    const vencimiento = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="installmentDueDate"]',
    )
    expect(vencimiento?.value).toBe("2026-08-20")
  })

  it.each([
    { kind: "income" as const, label: "Ya lo cobré" },
    { kind: "expense" as const, label: "Ya lo pagué" },
  ])("permite marcar un $kind inmediato y oculta las cuotas", ({ kind, label }) => {
    const { container } = render(
      <MovementForm kind={kind} categories={CATEGORIAS} suggestedRate={null} today="2026-08-10" />,
    )

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    const estado = screen.getByRole("radio", { name: label })

    fireEvent.click(estado)

    expect(screen.queryByLabelText("Importe de la cuota 1")).toBeNull()
    expect(screen.queryByLabelText("Cuotas")).toBeNull()
    expect(container.querySelector<HTMLInputElement>('input[name="settled"]')?.value).toBe("true")
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input[name="installmentAmount"]')].map(
        (input) => input.value,
      ),
    ).toEqual(["100000"])
  })

  it("las cuotas se muestran en pesos y viajan en centavos", () => {
    const { container } = render(
      <MovementForm kind="expense" categories={CATEGORIAS} suggestedRate={null} today="2026-08-10" />,
    )

    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("Cuotas"), { target: { value: "2" } })

    const visible1 = screen.getByLabelText<HTMLInputElement>("Importe de la cuota 1")
    const visible2 = screen.getByLabelText<HTMLInputElement>("Importe de la cuota 2")
    expect(visible1.value).toBe("500")
    expect(visible2.value).toBe("500")

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
    fireEvent.change(screen.getByLabelText("Cuotas"), { target: { value: "5000" } })

    expect(screen.queryByLabelText("Importe de la cuota 121")).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("120")
  })
})

const MOVIMIENTO = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "u",
  kind: "expense",
  description: "Heladera",
  categoryId: "cat-1",
  date: "2026-05-03",
  currency: "ARS",
  amountCents: 120_000,
  rate: "1.0000",
  direction: null,
  creditCardId: null,
  createdAt: new Date("2026-05-03T12:00:00Z"),
  updatedAt: new Date("2026-05-03T12:00:00Z"),
  installments: [
    {
      id: "i1",
      movementId: "11111111-1111-4111-8111-111111111111",
      userId: "u",
      number: 1,
      amountCents: 40_000,
      dueDate: "2026-05-03",
      paid: true,
      paidDate: "2026-05-04",
      statementId: null,
      statementPeriod: null,
    },
    {
      id: "i2",
      movementId: "11111111-1111-4111-8111-111111111111",
      userId: "u",
      number: 2,
      amountCents: 40_000,
      dueDate: "2026-06-15",
      paid: false,
      paidDate: null,
      statementId: null,
      statementPeriod: null,
    },
    {
      id: "i3",
      movementId: "11111111-1111-4111-8111-111111111111",
      userId: "u",
      number: 3,
      amountCents: 40_000,
      dueDate: "2026-07-20",
      paid: false,
      paidDate: null,
      statementId: null,
      statementPeriod: null,
    },
  ],
}

function editar() {
  return render(
    <MovementForm
      kind="expense"
      categories={CATEGORIAS}
      suggestedRate={null}
      today="2026-08-10"
      movement={MOVIMIENTO}
    />,
  )
}

describe("MovementForm editando", () => {
  it("precarga los campos del movimiento, no los de un alta", () => {
    editar()

    expect(screen.getByLabelText<HTMLInputElement>("Descripción").value).toBe("Heladera")
    expect(screen.getByLabelText<HTMLInputElement>("Importe").value).toBe("1.200")
    expect(screen.getByLabelText<HTMLInputElement>("Cuotas").value).toBe("3")
    expect(screen.getByRole("button", { name: /^Fecha:/ }).textContent).toContain("03/05/2026")
  })

  it("no regenera el plan al abrirse: los vencimientos guardados sobreviven", () => {
    const { container } = editar()

    const vencimientos = [
      ...container.querySelectorAll<HTMLInputElement>(
        'input[type="hidden"][name="installmentDueDate"]',
      ),
    ].map((i) => i.value)

    expect(vencimientos).toEqual(["2026-05-03", "2026-06-15", "2026-07-20"])
  })

  it("cambiar la cantidad de cuotas sí regenera el plan", () => {
    const { container } = editar()

    fireEvent.change(screen.getByLabelText("Cuotas"), { target: { value: "2" } })

    const importes = [
      ...container.querySelectorAll<HTMLInputElement>(
        'input[type="hidden"][name="installmentAmount"]',
      ),
    ].map((i) => i.value)

    expect(importes).toEqual(["60000", "60000"])
  })

  it("manda el id del movimiento, que es lo que updateMovement necesita", () => {
    const { container } = editar()

    const id = container.querySelector<HTMLInputElement>('input[type="hidden"][name="id"]')
    expect(id?.value).toBe(MOVIMIENTO.id)
  })

  it("guarda por updateMovement y no por createMovement", async () => {
    const { container } = editar()

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!)
    })

    expect(updateMovement).toHaveBeenCalledTimes(1)
  })

  it("el botón dice que guarda cambios, no que da de alta", () => {
    editar()

    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy()
  })

  describe("la categoría", () => {
    const CON_SUBCATEGORIAS = [
      { id: "a", userId: "u", name: "Alquiler", kind: "expense", archived: false, parentId: "h", color: null, icon: null },
      { id: "h", userId: "u", name: "Hogar", kind: "expense", archived: false, parentId: null, color: null, icon: null },
    ]

    it("al dar de alta, nunca arranca en un padre: arranca en su primera subcategoría", () => {
      const { container } = render(
        <MovementForm kind="expense" categories={CON_SUBCATEGORIAS} suggestedRate={null} today="2026-08-10" />,
      )
      const campo = container.querySelector<HTMLInputElement>('input[name="categoryId"]')
      expect(campo?.value).toBe("a")
    })

    it("el error de categoría de la acción se muestra junto al campo", async () => {
      const mensaje = "Esa categoría tiene subcategorías: elegí una de ellas."
      createMovement.mockResolvedValueOnce({
        ok: false,
        message: mensaje,
        fieldErrors: { categoryId: [mensaje] },
      })
      const { container } = render(
        <MovementForm kind="expense" categories={CON_SUBCATEGORIAS} suggestedRate={null} today="2026-08-10" />,
      )

      await act(async () => {
        fireEvent.submit(container.querySelector("form")!)
      })

      expect(screen.getAllByText(mensaje).length).toBeGreaterThanOrEqual(1)
      expect(
        screen.getByRole("button", { name: /Alquiler/ }).getAttribute("data-invalid"),
      ).toBe("true")
    })
  })
})

const VISA = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Visa",
  closingDay: 25,
  dueDay: 5,
  color: null,
  archived: false,
  statements: [],
}

function alta(props: Partial<React.ComponentProps<typeof MovementForm>> = {}) {
  return render(
    <MovementForm
      kind="expense"
      categories={CATEGORIAS}
      suggestedRate={null}
      today="2026-08-10"
      {...props}
    />,
  )
}

const valores = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)].map(
    (i) => i.value,
  )

describe("MovementForm, el formulario de carga", () => {
  it("separa los miles del importe mientras se escribe", () => {
    alta()
    const importe = screen.getByLabelText<HTMLInputElement>("Importe")
    fireEvent.change(importe, { target: { value: "1500000" } })
    expect(importe.value).toBe("1.500.000")
  })

  it("la moneda es un segmentado y cambia el prefijo", () => {
    alta()
    expect(screen.getByRole("radiogroup", { name: "Moneda" })).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "USD" }))
    expect(screen.getByText("US$")).toBeTruthy()
    expect(screen.getByLabelText("Tipo de cambio")).toBeTruthy()
  })

  it("los atajos y el stepper cambian la cantidad de cuotas", () => {
    alta()
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1200" } })

    fireEvent.click(screen.getByRole("button", { name: "12 cuotas" }))
    expect(screen.getByLabelText<HTMLInputElement>("Cuotas").value).toBe("12")

    fireEvent.click(screen.getByRole("button", { name: "Una cuota más" }))
    expect(screen.getByLabelText<HTMLInputElement>("Cuotas").value).toBe("13")

    fireEvent.click(screen.getByRole("button", { name: "Una cuota menos" }))
    fireEvent.click(screen.getByRole("button", { name: "Una cuota menos" }))
    expect(screen.getByLabelText<HTMLInputElement>("Cuotas").value).toBe("11")
  })

  it("el plan arranca colapsado, con un resumen, y se despliega con Editar cuotas", () => {
    alta()
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1200" } })
    fireEvent.click(screen.getByRole("button", { name: "12 cuotas" }))

    expect(screen.getByText(/^12 cuotas de .*100,00 desde 10\/08$/)).toBeTruthy()
    const editar = screen.getByRole("button", { name: "Editar cuotas" })
    expect(editar.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(editar)
    expect(
      screen.getByRole("button", { name: "Ocultar cuotas" }).getAttribute("aria-expanded"),
    ).toBe("true")
  })

  it("sin tarjetas no pregunta el medio de pago", () => {
    alta()
    expect(screen.queryByRole("radiogroup", { name: "Medio de pago" })).toBeNull()
  })

  it("con tarjeta, oculta Ya lo pagué y los vencimientos salen de los resúmenes", () => {
    const { container } = alta({ cards: [VISA] })
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "300" } })
    fireEvent.click(screen.getByRole("radio", { name: "Visa" }))
    fireEvent.click(screen.getByRole("button", { name: "3 cuotas" }))

    expect(screen.queryByRole("radio", { name: "Ya lo pagué" })).toBeNull()
    expect(valores(container, "creditCardId")).toEqual([VISA.id])
    expect(valores(container, "installmentDueDate")).toEqual([
      "2026-09-05",
      "2026-10-05",
      "2026-11-05",
    ])
    expect(screen.getByText(/primer resumen ago 2026/)).toBeTruthy()
  })

  it("editando con la misma tarjeta y fecha, la compra se queda en su resumen", () => {
    const corregida = {
      ...VISA,
      statements: [
        { id: "s1", period: "2026-08", closingDate: "2026-08-05", dueDate: "2026-08-15", paid: false },
      ],
    }
    const conTarjeta = {
      ...MOVIMIENTO,
      date: "2026-08-10",
      amountCents: 300_00,
      creditCardId: VISA.id,
      installments: [
        {
          ...MOVIMIENTO.installments[1],
          number: 1,
          amountCents: 300_00,
          dueDate: "2026-08-15",
          statementId: "s1",
          statementPeriod: "2026-08",
        },
      ],
    }
    const { container } = alta({ cards: [corregida], movement: conTarjeta })
    expect(valores(container, "installmentDueDate")).toEqual(["2026-08-15"])
    expect(screen.getByText(/^Visa · resumen ago 2026/)).toBeTruthy()
  })

  it("con tarjeta, usa las fechas corregidas de un resumen que ya existe", () => {
    const corregida = {
      ...VISA,
      statements: [
        { id: "s1", period: "2026-08", closingDate: "2026-08-27", dueDate: "2026-09-08", paid: false },
      ],
    }
    const { container } = alta({ cards: [corregida] })
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "300" } })
    fireEvent.click(screen.getByRole("radio", { name: "Visa" }))
    expect(valores(container, "installmentDueDate")).toEqual(["2026-09-08"])
  })

  it("avisa si la compra cae en un resumen ya pagado", () => {
    const pagada = {
      ...VISA,
      statements: [
        { id: "s1", period: "2026-08", closingDate: "2026-08-25", dueDate: "2026-09-05", paid: true },
      ],
    }
    alta({ cards: [pagada] })
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "300" } })
    fireEvent.click(screen.getByRole("radio", { name: "Visa" }))
    expect(
      screen.getByText(/La cuota 1 cae en el resumen de ago 2026, que ya está pagado/),
    ).toBeTruthy()
  })

  it("una tarjeta archivada no se ofrece al dar de alta", () => {
    alta({
      cards: [VISA, { ...VISA, id: "33333333-3333-4333-8333-333333333333", name: "Vieja", archived: true }],
    })
    expect(screen.getByRole("radio", { name: "Visa" })).toBeTruthy()
    expect(screen.queryByRole("radio", { name: "Vieja" })).toBeNull()
  })

  it("autocompleta la descripción y sugiere la categoría de la última vez", () => {
    const categorias = [
      ...CATEGORIAS,
      { id: "cat-2", userId: "u", name: "Delivery", kind: "expense", archived: false, parentId: null, color: null, icon: null },
    ]
    const { container } = alta({
      categories: categorias,
      suggestions: [{ description: "Pedidos Ya", categoryId: "cat-2" }],
    })
    expect(container.querySelector('datalist option[value="Pedidos Ya"]')).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "pedidos ya" } })
    expect(container.querySelector<HTMLInputElement>('input[name="categoryId"]')?.value).toBe(
      "cat-2",
    )
  })

  it("los errores de la acción van junto a cada campo, y arriba un aviso general", async () => {
    createMovement.mockResolvedValueOnce({
      ok: false,
      message: "Poné una descripción.",
      fieldErrors: { description: ["Poné una descripción."] },
    })
    const { container } = alta()
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!)
    })
    expect(screen.getByText("Poné una descripción.")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toBe("Revisá los campos marcados.")
    expect(screen.getByLabelText("Descripción").getAttribute("aria-invalid")).toBe("true")
  })

  it("Guardar y cargar otro guarda, limpia el formulario y no lo cierra", async () => {
    const onSaved = vi.fn()
    alta({ onSaved })
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Café" } })
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1500" } })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar y cargar otro" }))
    })

    expect(createMovement).toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText<HTMLInputElement>("Descripción").value).toBe("")
    expect(screen.getByLabelText<HTMLInputElement>("Importe").value).toBe("")
  })

  it("Guardar cierra el diálogo", async () => {
    const onSaved = vi.fn()
    alta({ onSaved })
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Café" } })
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "1500" } })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    })

    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})
