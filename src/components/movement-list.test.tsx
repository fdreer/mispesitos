// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { MovementList } from "@/components/movement-list"
import { parseMovementQuery } from "@/lib/movement-query"
import type { MovementWithInstallments } from "@/server/queries"

/**
 * Las Server Actions que cuelgan de los botones de cada fila: importarlas de
 * verdad abre una conexión a Postgres apenas se las importa. Mismo criterio
 * que `movement-form.test.tsx`.
 */
const mocks = vi.hoisted(() => ({
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
  // Las dos del formulario de edición, que ahora cuelga de la misma fila.
  createMovement: async () => ({ ok: true }),
  updateMovement: async () => ({ ok: true }),
}))

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

/** Radix (el Select y el Dialog de shadcn) usa dos APIs que jsdom no trae. */
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

afterEach(() => {
  cleanup()
  mocks.setInstallmentPaid.mockClear()
  mocks.fetchMovementListPage.mockClear()
})

const CATEGORIAS = [
  { id: "cat-1", userId: "u", name: "Freelance", kind: "income" as const, archived: false, parentId: null, color: null, icon: null },
]

/** Las dos marcas de tiempo que trae toda fila de la base y que esta tabla no
 * muestra: van fijas para que el fixture no dependa del reloj. */
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

/**
 * El texto de cada celda de una fila, en orden de columna. El espacio duro
 * (U+00A0) que `Intl.NumberFormat` mete después del símbolo de moneda se
 * normaliza a uno común: si no, "$ 2.000,00" no coincide con "$ 2.000,00" y
 * la diferencia es invisible al leer el error.
 */
function celdas(fila: Element): string[] {
  return [...fila.children].map((c) => (c.textContent ?? "").replace(/ /g, " ").trim())
}

describe("MovementList", () => {
  /*
   * La razón de ser de este archivo: las cuotas se desplegaban adentro de una
   * celda con `colSpan`, así que su fecha, su importe y su botón no caían bajo
   * ninguna de las columnas de la tabla. Ahora cada cuota es una fila de la
   * MISMA grilla, y esto es lo que impide que vuelva a desalinearse.
   *
   * Los índices son las columnas declaradas en `COLUMNS` más la del chevron:
   * 0 chevron · 1 Fecha · 2 Descripción · 3 Categoría · 4 Importe · 5 Estado.
   */
  it("las cuotas caen en las mismas columnas que el movimiento", () => {
    const { container } = render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
      />,
    )

    // Desplegar: la fila del movimiento es la que abre las cuotas.
    fireEvent.click(within(container.querySelector("table")!).getByText("Proyecto"))

    const filas = [...container.querySelectorAll("tbody tr")]
    // Movimiento + dos cuotas. Editar y Borrar viven en el menú ⋯ de la fila.
    expect(filas).toHaveLength(3)

    // Todas las filas tienen las mismas siete columnas: es lo que garantiza
    // que las celdas de una cuota se apilen bajo las del movimiento.
    for (const fila of filas) {
      const ancho = [...fila.children].reduce(
        (acc, c) => acc + Number((c as HTMLTableCellElement).colSpan || 1),
        0,
      )
      expect(ancho).toBe(7)
    }

    const movimiento = celdas(filas[0])
    expect(movimiento[1]).toBe("11/08/2026")
    expect(movimiento[2]).toContain("Proyecto")
    // La próxima cuota impaga, con fecha relativa debajo de la descripción.
    expect(movimiento[2]).toContain("Cuota 1/2 · vence hoy")
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
    expect(celdas(filas[1])[2]).toBe("Cuota 1 · vencida")
    // La que ya está pagada no se marca, aunque su vencimiento también pasó.
    expect(celdas(filas[2])[2]).toBe("Cuota 2")
  })

  /*
   * Editar y Borrar viven en el menú ⋯ de cada fila (§5.3 del plan v2), a la
   * vista sin desplegar nada. Los diálogos se abren por estado, fuera del
   * menú: si colgaran del ítem, cerrar el menú los desmontaría.
   */
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
    // Abrir el menú no desplegó la fila.
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

  /*
   * Pagar en un toque (§5.1): marca la PRÓXIMA impaga —la de número más bajo—
   * con la fecha de hoy, sin desplegar la fila ni pedir confirmación.
   */
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
    // La tarjeta también muestra la próxima cuota y se cobra sin desplegar.
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
})
