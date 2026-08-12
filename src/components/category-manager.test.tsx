// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { CategoryManager } from "@/components/category-manager"
import type { Category } from "@/server/queries"

/** Las dos fronteras de siempre: las Server Actions y el router de Next. */
const createCategory = vi.fn()
const archiveCategory = vi.fn()
const unarchiveCategory = vi.fn()
const refresh = vi.fn()

vi.mock("@/server/actions/categories", () => ({
  createCategory: (...args: unknown[]) => createCategory(...args),
  archiveCategory: (...args: unknown[]) => archiveCategory(...args),
  unarchiveCategory: (...args: unknown[]) => unarchiveCategory(...args),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh }),
}))

const categoria = (id: string, name: string, archived = false): Category => ({
  id,
  userId: "u",
  name,
  kind: "expense",
  archived,
})

function montar(categories: Category[]) {
  return render(<CategoryManager kind="expense" categories={categories} />)
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
    // Un solo botón "Archivar": el de la activa.
    expect(screen.getAllByRole("button", { name: "Archivar" })).toHaveLength(1)
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

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archivar" }))
    })

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

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Archivar" })[0])
    })

    expect(screen.getAllByText("No pudimos archivarla.")).toHaveLength(1)
    // En la fila de "Supermercado", no en la de "Alquiler".
    const filas = container.querySelectorAll("li")
    expect(filas[0].textContent).toContain("No pudimos archivarla.")
    expect(filas[1].textContent).not.toContain("No pudimos archivarla.")
  })

  it("el error de un intento no sobrevive al siguiente", async () => {
    archiveCategory.mockResolvedValue({ ok: false, message: "No pudimos archivarla." })
    montar([categoria("c1", "Supermercado")])

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archivar" }))
    })
    expect(screen.getByText("No pudimos archivarla.")).toBeTruthy()

    archiveCategory.mockResolvedValue({ ok: true })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archivar" }))
    })

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
})
