// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { CategoryManager } from "@/components/category-manager"
import type { Category } from "@/server/queries"

const createCategory = vi.fn()
const updateCategory = vi.fn()
const moveCategory = vi.fn()
const archiveCategory = vi.fn()
const unarchiveCategory = vi.fn()
const refresh = vi.fn()

vi.mock("@/server/actions/categories", () => ({
  createCategory: (...args: unknown[]) => createCategory(...args),
  updateCategory: (...args: unknown[]) => updateCategory(...args),
  moveCategory: (...args: unknown[]) => moveCategory(...args),
  archiveCategory: (...args: unknown[]) => archiveCategory(...args),
  unarchiveCategory: (...args: unknown[]) => unarchiveCategory(...args),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh }),
}))

const categoria = (
  id: string,
  name: string,
  archived = false,
  parentId: string | null = null,
): Category => ({
  id,
  userId: "u",
  name,
  kind: "expense",
  archived,
  parentId,
  color: null,
  icon: null,
})

function montar(categories: Category[], movementCounts: Record<string, number> = {}) {
  return render(
    <CategoryManager kind="expense" categories={categories} movementCounts={movementCounts} />,
  )
}

async function elegirDelMenu(nombre: string, accion: string | RegExp) {
  fireEvent.keyDown(screen.getByRole("button", { name: `Acciones de ${nombre}` }), { key: "Enter" })
  // El clic sí adentro de un `act` async: puede disparar una Server Action.
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: accion }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  createCategory.mockResolvedValue({ ok: true })
  archiveCategory.mockResolvedValue({ ok: true })
  unarchiveCategory.mockResolvedValue({ ok: true })
})

afterEach(cleanup)

describe("CategoryManager", () => {
  it("separa activas de archivadas, y las archivadas no ofrecen archivar", () => {
    montar([categoria("c1", "Supermercado"), categoria("c2", "Nafta", true)])

    expect(screen.getByText("Supermercado")).toBeTruthy()
    expect(screen.getByText("Nafta")).toBeTruthy()
    // Un solo menú de acciones —que es donde está "Archivar"—: el de la activa.
    expect(screen.getAllByRole("button", { name: /^Acciones de/ })).toHaveLength(1)
    expect(screen.getByText("Archivada")).toBeTruthy()
  })

  it("sin activas lo dice, en vez de dejar la lista en blanco", () => {
    montar([categoria("c2", "Nafta", true)])

    expect(screen.getByText("No tenés categorías activas de este tipo.")).toBeTruthy()
  })

  it("sin archivadas no aparece la aclaración sobre ellas", () => {
    montar([categoria("c1", "Supermercado")])

    expect(screen.queryByText(/Las archivadas no aparecen al cargar/)).toBeNull()
  })

  it("archivar bien refresca la pantalla", async () => {
    montar([categoria("c1", "Supermercado")])

    await elegirDelMenu("Supermercado", "Archivar")

    expect(archiveCategory).toHaveBeenCalledWith("c1")
  })

  /*
   * El motivo por el que `handleArchive` mira el resultado en vez de
   * descartarlo: si archivar falla, la fila se queda donde estaba y sin este
   * mensaje eso se lee como que el botón no hace nada.
   */
  it("un error de archivado se muestra en la fila que falló, y sólo en ésa", async () => {
    archiveCategory.mockResolvedValue({ ok: false, message: "No pudimos archivarla." })
    const { container } = montar([
      categoria("c1", "Supermercado"),
      categoria("c2", "Alquiler"),
    ])

    await elegirDelMenu("Supermercado", "Archivar")

    expect(screen.getAllByText("No pudimos archivarla.")).toHaveLength(1)
    // En la fila de "Supermercado", no en la de "Alquiler".
    const filas = container.querySelectorAll("li")
    expect(filas[0].textContent).toContain("Supermercado")
    expect(filas[0].textContent).toContain("No pudimos archivarla.")
    expect(filas[1].textContent).not.toContain("No pudimos archivarla.")
  })

  it("el error de un intento no sobrevive al siguiente", async () => {
    archiveCategory.mockResolvedValue({ ok: false, message: "No pudimos archivarla." })
    montar([categoria("c1", "Supermercado")])

    await elegirDelMenu("Supermercado", "Archivar")
    expect(screen.getByText("No pudimos archivarla.")).toBeTruthy()

    archiveCategory.mockResolvedValue({ ok: true })
    await elegirDelMenu("Supermercado", "Archivar")

    expect(screen.queryByText("No pudimos archivarla.")).toBeNull()
  })

  /*
   * Archivar era irreversible desde la interfaz (§1.2 de PENDIENTES): la
   * columna y el índice único parcial ya lo permitían, faltaba el camino de
   * vuelta.
   */
  it("una archivada ofrece desarchivar, y una activa no", () => {
    montar([categoria("c1", "Supermercado"), categoria("c2", "Nafta", true)])

    expect(screen.getAllByRole("button", { name: "Desarchivar" })).toHaveLength(1)
  })

  it("desarchivar manda el id de esa categoría", async () => {
    montar([categoria("c2", "Nafta", true)])

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Desarchivar" }))
    })

    expect(unarchiveCategory).toHaveBeenCalledWith("c2")
  })

  /*
   * El único error que desarchivar puede dar y archivar no: mientras estaba
   * archivada se pudo crear otra activa con el mismo nombre y tipo (para eso
   * el índice único es parcial). La base lo rechaza y el mensaje tiene que
   * caer en la fila que se intentó desarchivar.
   */
  it("el choque de nombre al desarchivar se muestra en esa fila", async () => {
    unarchiveCategory.mockResolvedValue({
      ok: false,
      message: "Ya tenés una categoría activa con ese nombre.",
    })
    montar([categoria("c2", "Nafta", true), categoria("c3", "Peaje", true)])

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Desarchivar" })[0])
    })

    expect(screen.getAllByText("Ya tenés una categoría activa con ese nombre.")).toHaveLength(1)
  })

  it("el error de crear una categoría se muestra", async () => {
    createCategory.mockResolvedValue({ ok: false, message: "Ya tenés una categoría con ese nombre." })
    montar([categoria("c1", "Supermercado")])

    fireEvent.change(screen.getByPlaceholderText("Nombre de la categoría"), {
      target: { value: "Supermercado" },
    })
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Agregar" }).closest("form")!)
    })

    expect(screen.getByText("Ya tenés una categoría con ese nombre.")).toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("crear bien refresca la pantalla: la lista sale de la base, no del estado local", async () => {
    montar([categoria("c1", "Supermercado")])

    fireEvent.change(screen.getByPlaceholderText("Nombre de la categoría"), {
      target: { value: "Farmacia" },
    })
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Agregar" }).closest("form")!)
    })

    expect(refresh).toHaveBeenCalled()
  })

  describe("el árbol", () => {
    const HOGAR = categoria("h", "Hogar")
    const ALQUILER = categoria("a", "Alquiler", false, "h")
    const OCIO = categoria("o", "Ocio")

    it("cuelga las subcategorías de su padre, y se pliegan", () => {
      montar([ALQUILER, HOGAR, OCIO])

      const hijas = screen.getByRole("list", { name: "Subcategorías de Hogar" })
      expect(within(hijas).getByText("Alquiler")).toBeTruthy()

      const plegar = screen.getByRole("button", { name: "Ocultar subcategorías de Hogar" })
      expect(plegar.getAttribute("aria-expanded")).toBe("true")
      fireEvent.click(plegar)

      expect(screen.queryByRole("list", { name: "Subcategorías de Hogar" })).toBeNull()
      expect(screen.getByText("1 subcategoría")).toBeTruthy()
      // Una sin hijas no tiene nada que plegar.
      expect(screen.queryByRole("button", { name: /subcategorías de Ocio/ })).toBeNull()
    })

    it("sólo un padre ofrece agregar subcategoría: no hay tercer nivel", () => {
      montar([ALQUILER, HOGAR])

      fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de Alquiler" }), { key: "Enter" })
      expect(screen.queryByRole("menuitem", { name: "Agregar subcategoría" })).toBeNull()
    })

    it("archivar un padre avisa que se lleva a sus subcategorías", () => {
      montar([ALQUILER, HOGAR])

      fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de Hogar" }), { key: "Enter" })
      expect(screen.getByRole("menuitem", { name: "Archivar con sus subcategorías" })).toBeTruthy()
    })

    it("una subcategoría archivada se lista con su padre adelante", () => {
      montar([{ ...ALQUILER, archived: true }, HOGAR])

      expect(screen.getByText("Hogar ›")).toBeTruthy()
      expect(screen.getAllByRole("button", { name: "Desarchivar" })).toHaveLength(1)
    })

    /*
     * §2.1 del plan: la primera subcategoría de una categoría con movimientos
     * pregunta a dónde pasan, por defecto a una "General" nueva.
     */
    it("la primera subcategoría de una categoría con movimientos pregunta a dónde van", async () => {
      montar([OCIO], { o: 3 })

      await elegirDelMenu("Ocio", "Agregar subcategoría")

      expect(screen.getByText("Ocio tiene 3 movimientos")).toBeTruthy()
      const general = screen.getByRole("radio", { name: /nueva “General”/ }) as HTMLInputElement
      expect(general.checked).toBe(true)
    })

    it("si ya tiene subcategorías no pregunta nada, aunque el padre tenga movimientos", async () => {
      montar([ALQUILER, HOGAR, OCIO], { h: 2 })

      await elegirDelMenu("Hogar", "Agregar subcategoría")
      expect(screen.queryByText(/tiene \d+ movimiento/)).toBeNull()
    })

    it("crear una subcategoría manda el padre, el color y el icono elegidos", async () => {
      montar([HOGAR])

      await elegirDelMenu("Hogar", "Agregar subcategoría")
      const dialogo = within(screen.getByRole("dialog"))
      fireEvent.change(dialogo.getByLabelText("Nombre"), { target: { value: "Luz" } })
      fireEvent.click(dialogo.getByRole("radio", { name: "Violeta" }))
      fireEvent.click(dialogo.getByRole("radio", { name: "Servicios" }))
      await act(async () => {
        fireEvent.submit(dialogo.getByRole("button", { name: "Crear" }).closest("form")!)
      })

      const datos = createCategory.mock.calls.at(-1)![1] as FormData
      expect(datos.get("parentId")).toBe("h")
      expect(datos.get("name")).toBe("Luz")
      expect(datos.get("color")).toBe("violeta")
      expect(datos.get("icon")).toBe("servicios")
      expect(datos.get("kind")).toBe("expense")
    })

    it("mover a… sólo ofrece padres de primer nivel, y nunca a sí misma", async () => {
      montar([ALQUILER, HOGAR, OCIO])

      await elegirDelMenu("Ocio", "Mover a…")
      const destino = within(screen.getByRole("dialog")).getByLabelText("Mover a")
      const opciones = within(destino).getAllByRole("option").map((o) => o.textContent)
      expect(opciones).toEqual(["Primer nivel (sin categoría padre)", "Hogar"])
    })

    it("un padre con subcategorías no se puede mover abajo de otro", async () => {
      montar([ALQUILER, HOGAR, OCIO])

      await elegirDelMenu("Hogar", "Mover a…")
      const dialogo = within(screen.getByRole("dialog"))
      expect(dialogo.getAllByRole("option")).toHaveLength(1)
      expect(dialogo.getByText(/sólo puede estar en el primer nivel/)).toBeTruthy()
    })
  })
})
