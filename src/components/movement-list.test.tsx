// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { MovementList } from "@/components/movement-list"
import { parseMovementQuery } from "@/lib/movement-query"
import type { MovementWithInstallments } from "@/server/queries"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  patchMovement: vi.fn(async () => ({ ok: true })),
  setInstallmentPaid: vi.fn(async () => ({ ok: true })),
  fetchMovementListPage: vi.fn(async () => ({
    items: [] as MovementWithInstallments[],
    page: 2,
    totalPages: 2,
    totalCount: 2,
  })),
}))

vi.mock("@/server/actions/movements", () => ({
  setInstallmentPaid: mocks.setInstallmentPaid,
  fetchMovementListPage: mocks.fetchMovementListPage,
  deleteMovement: async () => ({ ok: true }),
  createMovement: async () => ({ ok: true }),
  updateMovement: async () => ({ ok: true }),
  patchMovement: mocks.patchMovement,
}))

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: mocks.push }),
}))

Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

afterEach(() => {
  cleanup()
  mocks.patchMovement.mockClear()
  window.localStorage.clear()
  mocks.push.mockClear()
  mocks.setInstallmentPaid.mockClear()
  mocks.fetchMovementListPage.mockClear()
})

const CATEGORIAS = [
  { id: "cat-1", userId: "u", name: "Freelance", kind: "income" as const, archived: false, parentId: null, color: null, icon: null },
]

const SELLOS = { createdAt: new Date(0), updatedAt: new Date(0) }

const MOVIMIENTO: MovementWithInstallments = {
  id: "mov-1",
  userId: "u",
  kind: "income",
  description: "Proyecto",
  categoryId: "cat-1",
  date: "2026-08-11",
  currency: "ARS",
  amountCents: 200000,
  rate: "1",
  direction: null,
  creditCardId: null,
  ...SELLOS,
  installments: [
    {
      id: "cuo-1",
      movementId: "mov-1",
      userId: "u",
      number: 1,
      dueDate: "2026-08-11",
      amountCents: 100000,
      paid: false,
      paidDate: null,
      statementId: null,
      statementPeriod: null,
      ...SELLOS,
    },
    {
      id: "cuo-2",
      movementId: "mov-1",
      userId: "u",
      number: 2,
      dueDate: "2026-09-11",
      amountCents: 100000,
      paid: true,
      paidDate: "2026-09-11",
      statementId: null,
      statementPeriod: null,
    },
  ],
}

function celdas(fila: Element): string[] {
  return [...fila.children].map((c) => (c.textContent ?? "").replace(/ /g, " ").trim())
}

describe("MovementList", () => {
  it("las cuotas caen en las mismas columnas que el movimiento", () => {
    const { container } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
      />,
    )

    fireEvent.click(within(container.querySelector("table")!).getByText("Proyecto"))

    const filas = [...container.querySelectorAll("tbody tr")]
    expect(filas).toHaveLength(3)

    for (const fila of filas) {
      const ancho = [...fila.children].reduce(
        (acc, c) => acc + Number((c as HTMLTableCellElement).colSpan || 1),
        0,
      )
      expect(ancho).toBe(7)
    }

    const movimiento = celdas(filas[0])
    expect(movimiento[1]).toBe("11/08/2026")
    expect(movimiento[2]).toBe("Proyecto")
    expect(movimiento[3]).toBe("Freelance")
    expect(movimiento[4]).toBe("$ 2.000,00")

    const cuota1 = celdas(filas[1])
    expect(cuota1[1]).toBe("11/08/2026")
    expect(cuota1[2]).toBe("Cuota 1")
    expect(cuota1[4]).toBe("$ 1.000,00")
    expect(cuota1[5]).toBe("Marcar cobrada")

    const cuota2 = celdas(filas[2])
    expect(cuota2[1]).toBe("11/09/2026")
    expect(cuota2[2]).toBe("Cuota 2")
    expect(cuota2[4]).toBe("$ 1.000,00")
    expect(cuota2[5]).toBe("Cobrada · 11/09")
  })

  it("una cuota impaga con vencimiento pasado se marca como vencida", () => {
    const { container } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-12-01"
        emptyMessage="vacío"
      />,
    )

    fireEvent.click(within(container.querySelector("table")!).getByText("Proyecto"))

    const filas = [...container.querySelectorAll("tbody tr")]
    expect(celdas(filas[1])[2]).toBe("Cuota 1 vencida")
    expect(celdas(filas[2])[2]).toBe("Cuota 2")
  })

  it("editar, desde el menú ⋯, abre el formulario con el movimiento ya cargado", () => {
    const { container } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
      />,
    )

    const tabla = within(container.querySelector("table")!)
    fireEvent.keyDown(tabla.getByRole("button", { name: "Acciones de Proyecto" }), { key: "Enter" })

    const borrar = screen.getByRole("menuitem", { name: "Borrar" })
    expect(borrar.getAttribute("data-variant")).toBe("destructive")

    fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }))

    expect(screen.getByRole("dialog").textContent).toContain("Editar ingreso")
    expect(screen.getByLabelText<HTMLInputElement>("Descripción").value).toBe("Proyecto")
    expect(screen.getByLabelText<HTMLInputElement>("Importe").value).toBe("2.000")
    expect(tabla.getByText("Proyecto").closest("tr")?.getAttribute("aria-expanded")).toBe("false")
  })

  it("borrar, desde el menú ⋯, pide confirmación", () => {
    const { container } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
      />,
    )

    const tabla = within(container.querySelector("table")!)
    fireEvent.keyDown(tabla.getByRole("button", { name: "Acciones de Proyecto" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar" }))

    expect(screen.getByRole("alertdialog").textContent).toContain("¿Borrar “Proyecto”?")
  })

  it("cobrar desde la fila marca la próxima cuota impaga y no despliega nada", async () => {
    const { container } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
      />,
    )

    const tabla = within(container.querySelector("table")!)
    const cobrar = tabla.getByRole("button", { name: "Cobrar cuota 1/2 de Proyecto" })
    expect(cobrar.textContent).toBe("Cobrar")

    await act(async () => {
      fireEvent.click(cobrar)
    })

    expect(mocks.setInstallmentPaid).toHaveBeenCalledWith("cuo-1", true, undefined)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
  })

  it("un movimiento todo pago no ofrece pagar", () => {
    const pagado = {
      ...MOVIMIENTO,
      installments: MOVIMIENTO.installments.map((i) => ({ ...i, paid: true, paidDate: "2026-08-11" })),
    }
    render(
      <MovementList movements={[pagado]} categories={CATEGORIAS} today="2026-08-11" emptyMessage="vacío" />,
    )

    expect(screen.queryByRole("button", { name: /^Cobrar/ })).toBeNull()
  })

  it("en móvil resume el movimiento en una tarjeta y despliega sus cuotas", () => {
    render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
      />,
    )

    const tarjeta = screen.getByRole("article", { name: "Proyecto" })
    expect((tarjeta.textContent ?? "").replace(/ /g, " ")).toContain("$ 2.000,00")
    expect(tarjeta.textContent).toContain("11/08/2026")
    expect(tarjeta.textContent).toContain("Freelance")
    expect(tarjeta.textContent).toContain("2 cuotas")
    expect(tarjeta.textContent).toContain("Cuota 1/2 · vence hoy")
    expect(within(tarjeta).getByRole("button", { name: "Cobrar cuota 1/2 de Proyecto" })).toBeTruthy()
    expect(within(tarjeta).getByRole("button", { name: "Acciones de Proyecto" })).toBeTruthy()

    const desplegar = screen.getByRole("button", { name: "Ver cuotas de Proyecto" })
    expect(desplegar.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(desplegar)

    expect(desplegar.getAttribute("aria-expanded")).toBe("true")
    const detalle = within(document.getElementById("cuotas-mov-1")!)
    expect(detalle.getByText(/Cuota\s+1/)).toBeTruthy()
    expect(detalle.getByRole("button", { name: "Marcar cobrada" })).toBeTruthy()
  })

  it("usa plurales correctos en los badges de estado e incluye un icono", () => {
    const { container } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
      />,
    )
    const tabla = within(container.querySelector("table")!)
    const badge = tabla.getByText("1 pendiente").closest("[data-slot='badge']")!
    expect(badge.querySelector("svg")).toBeTruthy()

    cleanup()

    const dosVencidas: MovementWithInstallments = {
      ...MOVIMIENTO,
      installments: MOVIMIENTO.installments.map((i) => ({ ...i, paid: false, paidDate: null })),
    }
    const { container: c2 } = render(
      <MovementList
        movements={[dosVencidas]}
        categories={CATEGORIAS}
        today="2026-12-01"
        emptyMessage="vacío"
      />,
    )
    expect(within(c2.querySelector("table")!).getByText("2 vencidas")).toBeTruthy()
  })

  it("agrupa por vencimiento en egresos y por mes en ingresos", () => {
    const vencido: MovementWithInstallments = {
      ...MOVIMIENTO,
      id: "m-v",
      kind: "expense",
      description: "Luz",
      installments: [
        { ...MOVIMIENTO.installments[0], id: "i-v", movementId: "m-v", dueDate: "2026-08-01", paid: false },
      ],
    }
    const semana: MovementWithInstallments = {
      ...MOVIMIENTO,
      id: "m-s",
      kind: "expense",
      description: "Gas",
      installments: [
        { ...MOVIMIENTO.installments[0], id: "i-s", movementId: "m-s", dueDate: "2026-08-14", paid: false },
      ],
    }

    const { container } = render(
      <MovementList
        movements={[vencido, semana]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
        kind="expense"
        groupBy="due"
      />,
    )

    const tabla = within(container.querySelector("table")!)
    expect(tabla.getByText("Vencidos · 1")).toBeTruthy()
    expect(tabla.getByText("Esta semana · 1")).toBeTruthy()

    cleanup()

    const { container: cIng } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
        kind="income"
        groupBy="month"
      />,
    )
    expect(within(cIng.querySelector("table")!).getByText("Agosto 2026 · 1")).toBeTruthy()
  })

  it("en estado vacío ofrece 'Limpiar filtros' o 'Cargar primer egreso'", () => {
    render(
      <MovementList
        movements={[]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="Ningún movimiento entra en el filtro."
        hasActiveFilters
        basePath="/egresos"
      />,
    )
    expect(screen.getByRole("link", { name: "Limpiar filtros" }).getAttribute("href")).toBe(
      "/egresos",
    )

    cleanup()

    render(
      <MovementList
        movements={[]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="Todavía no cargaste ningún egreso."
        hasActiveFilters={false}
        kind="expense"
      />,
    )
    expect(screen.getByRole("button", { name: "Cargar primer egreso" })).toBeTruthy()
  })

  it("en móvil 'Cargar más' trae la página siguiente y la agrega a la lista", async () => {
    const segundo: MovementWithInstallments = {
      ...MOVIMIENTO,
      id: "mov-2",
      description: "Segundo cobro",
    }
    mocks.fetchMovementListPage.mockResolvedValueOnce({
      items: [segundo],
      page: 2,
      totalPages: 2,
      totalCount: 2,
    })

    render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
        kind="income"
        query={parseMovementQuery({})}
        page={1}
        totalPages={2}
        totalCount={2}
      />,
    )

    expect(screen.getByText("Mostrando 1 de 2")).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cargar más" }))
    })

    expect(mocks.fetchMovementListPage).toHaveBeenCalledWith("income", parseMovementQuery({}), 2)
    expect(screen.getByRole("article", { name: "Segundo cobro" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull()
  })

  it("las columnas ocultas en las preferencias no se dibujan y las filas ajustan su ancho", () => {
    window.localStorage.setItem(
      "mispesitos.table.income.v1",
      JSON.stringify({ hidden: ["category", "installments", "nextDue"] }),
    )
    const { container } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
        kind="income"
        groupBy="month"
      />,
    )
    const tabla = container.querySelector("table")!
    expect(within(tabla).queryByRole("columnheader", { name: /Categoría/ })).toBeNull()

    fireEvent.click(within(tabla).getByText("Proyecto"))
    for (const fila of tabla.querySelectorAll("tbody tr")) {
      const ancho = [...fila.children].reduce(
        (acc, c) => acc + Number((c as HTMLTableCellElement).colSpan || 1),
        0,
      )
      expect(ancho).toBe(6)
    }
  })

  it("las columnas visibles 'Cuotas' y 'Próx. vencimiento' sacan el subtítulo de la descripción", () => {
    window.localStorage.setItem("mispesitos.table.income.v1", JSON.stringify({ hidden: [] }))
    const { container } = render(
      <MovementList movements={[MOVIMIENTO]} categories={CATEGORIAS} today="2026-08-11" emptyMessage="vacío" kind="income" />,
    )
    const fila = container.querySelector("tbody tr")!
    const desc = fila.querySelector('[data-col="description"]')!
    expect(desc.textContent).toBe("Proyecto")
    expect(fila.querySelector('[data-col="installments"]')!.textContent).toBe("1/2")
    expect(fila.querySelector('[data-col="nextDue"]')!.textContent).toBe("Cuota 1/2 · vence hoy")
  })

  it("clickear un encabezado ordena por esa columna y el segundo click invierte", () => {
    const query = parseMovementQuery({}, "date")
    const { container, rerender } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
        kind="income"
        basePath="/ingresos"
        query={query}
        defaultSort="date"
      />,
    )
    const tabla = within(container.querySelector("table")!)
    expect(tabla.getByRole("columnheader", { name: /Fecha/ }).getAttribute("aria-sort")).toBe(
      "descending",
    )

    fireEvent.click(tabla.getByRole("button", { name: "Importe" }))
    expect(mocks.push).toHaveBeenLastCalledWith("/ingresos?sort=amount")

    rerender(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
        kind="income"
        basePath="/ingresos"
        query={parseMovementQuery({ sort: "amount" }, "date")}
        defaultSort="date"
      />,
    )
    fireEvent.click(tabla.getByRole("button", { name: "Importe" }))
    expect(mocks.push).toHaveBeenLastCalledWith("/ingresos?sort=amount&dir=asc")
  })

  describe("edición inline", () => {
    const UNA_CUOTA: MovementWithInstallments = {
      ...MOVIMIENTO,
      id: "11111111-1111-4111-8111-111111111111",
      description: "Una cuota",
      installments: [{ ...MOVIMIENTO.installments[0], movementId: "11111111-1111-4111-8111-111111111111" }],
    }
    const CATS = [
      ...CATEGORIAS,
      { ...CATEGORIAS[0], id: "cat-2", name: "Sueldo" },
    ]

    function renderTabla(m: MovementWithInstallments) {
      const r = render(
        <MovementList movements={[m]} categories={CATS} today="2026-08-11" emptyMessage="vacío" kind="income" />,
      )
      return within(r.container.querySelector("table")!)
    }

    it("el importe se edita con Enter y no despliega la fila", async () => {
      const tabla = renderTabla(UNA_CUOTA)
      fireEvent.click(tabla.getByRole("button", { name: "Cambiar importe de Una cuota" }))
      const input = tabla.getByRole("textbox", { name: "Importe de Una cuota" })
      fireEvent.change(input, { target: { value: "1.500" } })
      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" })
      })
      expect(mocks.patchMovement).toHaveBeenCalledWith(UNA_CUOTA.id, { amountCents: 150000 })
      expect(tabla.getByText("Una cuota").closest("tr")?.getAttribute("aria-expanded")).toBe("false")
    })

    it("Esc cancela la edición del importe sin guardar", () => {
      const tabla = renderTabla(UNA_CUOTA)
      fireEvent.click(tabla.getByRole("button", { name: "Cambiar importe de Una cuota" }))
      const input = tabla.getByRole("textbox", { name: "Importe de Una cuota" })
      fireEvent.change(input, { target: { value: "9" } })
      fireEvent.keyDown(input, { key: "Escape" })
      expect(mocks.patchMovement).not.toHaveBeenCalled()
      expect(tabla.getByRole("button", { name: "Cambiar importe de Una cuota" })).toBeTruthy()
    })

    it("con varias cuotas fecha e importe no se editan desde la tabla", () => {
      const tabla = renderTabla(MOVIMIENTO)
      expect(tabla.queryByRole("button", { name: /Cambiar importe/ })).toBeNull()
      expect(tabla.queryByRole("button", { name: /Cambiar fecha/ })).toBeNull()
      expect(tabla.getByText("11/08/2026").getAttribute("title")).toContain("recalcular cuotas")
    })

    it("la categoría se cambia desde un buscador", async () => {
      const tabla = renderTabla(UNA_CUOTA)
      fireEvent.click(tabla.getByRole("button", { name: "Cambiar categoría de Una cuota" }))
      await act(async () => {
        fireEvent.click(screen.getByRole("option", { name: "Sueldo" }))
      })
      expect(mocks.patchMovement).toHaveBeenCalledWith(UNA_CUOTA.id, { categoryId: "cat-2" })
    })

    it("el estado de una sola cuota ofrece marcarla hoy", async () => {
      const tabla = renderTabla(UNA_CUOTA)
      fireEvent.click(tabla.getByRole("button", { name: "Estado de Una cuota" }))
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Marcar cobrada hoy" }))
      })
      expect(mocks.setInstallmentPaid).toHaveBeenCalledWith("cuo-1", true, undefined)
    })
  })
})
