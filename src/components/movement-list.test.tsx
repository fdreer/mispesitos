// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { MovementList } from "@/components/movement-list"
import type { MovementWithInstallments } from "@/server/queries"

/**
 * Las Server Actions que cuelgan de los botones de cada fila: importarlas de
 * verdad abre una conexión a Postgres apenas se las importa. Mismo criterio
 * que `movement-form.test.tsx`.
 */
vi.mock("@/server/actions/movements", () => ({
  setInstallmentPaid: async () => ({ ok: true }),
  deleteMovement: async () => ({ ok: true }),
  // Las dos del formulario de edición, que ahora cuelga de la misma fila.
  createMovement: async () => ({ ok: true }),
  updateMovement: async () => ({ ok: true }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

/** Radix (el Select y el Dialog de shadcn) usa dos APIs que jsdom no trae. */
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

afterEach(cleanup)

const CATEGORIAS = [
  { id: "cat-1", userId: "u", name: "Freelance", kind: "income" as const, archived: false },
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
    fireEvent.click(screen.getByText("Proyecto"))

    const filas = [...container.querySelectorAll("tbody tr")]
    // Movimiento + dos cuotas + la fila de "Borrar".
    expect(filas).toHaveLength(4)

    // Todas las filas tienen las mismas seis columnas: es lo que garantiza
    // que las celdas de una cuota se apilen bajo las del movimiento.
    for (const fila of filas) {
      const ancho = [...fila.children].reduce(
        (acc, c) => acc + Number((c as HTMLTableCellElement).colSpan || 1),
        0,
      )
      expect(ancho).toBe(6)
    }

    const movimiento = celdas(filas[0])
    expect(movimiento[1]).toBe("11/08/2026")
    expect(movimiento[2]).toContain("Proyecto")
    expect(movimiento[3]).toBe("Freelance")
    expect(movimiento[4]).toBe("$ 2.000,00")

    const cuota1 = celdas(filas[1])
    expect(cuota1[1]).toBe("11/08/2026")
    expect(cuota1[2]).toBe("Cuota 1")
    expect(cuota1[4]).toBe("$ 1.000,00")
    expect(cuota1[5]).toBe("Marcar pagada")

    const cuota2 = celdas(filas[2])
    expect(cuota2[1]).toBe("11/09/2026")
    expect(cuota2[2]).toBe("Cuota 2")
    expect(cuota2[4]).toBe("$ 1.000,00")
    expect(cuota2[5]).toBe("Pagada")
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

    fireEvent.click(screen.getByText("Proyecto"))

    const filas = [...container.querySelectorAll("tbody tr")]
    expect(celdas(filas[1])[2]).toBe("Cuota 1 · vencida")
    // La que ya está pagada no se marca, aunque su vencimiento también pasó.
    expect(celdas(filas[2])[2]).toBe("Cuota 2")
  })

  /*
   * Editar vive en la misma fila de cierre que borrar, y sólo aparece con las
   * cuotas desplegadas: es una acción del movimiento, no de la tabla.
   */
  it("editar abre el formulario con el movimiento ya cargado", () => {
    render(
      <MovementList
        movements={[MOVIMIENTO]}
        categories={CATEGORIAS}
        today="2026-08-11"
        emptyMessage="vacío"
      />,
    )

    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull()

    fireEvent.click(screen.getByText("Proyecto"))
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))

    expect(screen.getByRole("dialog").textContent).toContain("Editar ingreso")
    expect(screen.getByLabelText<HTMLInputElement>("Descripción").value).toBe("Proyecto")
    expect(screen.getByLabelText<HTMLInputElement>("Importe").value).toBe("2000,00")
  })
})
