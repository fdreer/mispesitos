// @vitest-environment jsdom

import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import {
  CategoryPicker,
  initialCategoryId,
  readLastCategory,
  rememberCategory,
} from "@/components/category-picker"

const cat = (id: string, name: string, parentId: string | null = null, archived = false) => ({
  id,
  name,
  parentId,
  archived,
  color: null,
  icon: null,
})

const HOGAR = cat("h", "Hogar")
const ALQUILER = cat("a", "Alquiler", "h")
const EXPENSAS = cat("e", "Expensas", "h")
const EDUCACION = cat("ed", "Educación")
const TODAS = [ALQUILER, EDUCACION, EXPENSAS, HOGAR]

function Montado({ inicial = "a", onSubmit }: { inicial?: string; onSubmit?: () => void }) {
  const [value, setValue] = useState(inicial)
  return (
    <form
      data-testid="form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
    >
      <CategoryPicker id="cat" name="categoryId" categories={TODAS} value={value} onChange={setValue} />
    </form>
  )
}

const valorEnviado = () =>
  new FormData(screen.getByTestId("form") as HTMLFormElement).get("categoryId")

beforeEach(() => {
  const datos = new Map<string, string>()
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
    },
  })
})

afterEach(cleanup)

describe("CategoryPicker", () => {
  it("muestra la elegida con su padre adelante, y es lo que viaja en el formulario", () => {
    render(<Montado />)
    const boton = screen.getByRole("button", { name: /Alquiler/ })
    expect(boton.textContent).toContain("Hogar ›")
    expect(valorEnviado()).toBe("a")
  })

  it("los padres con hijas son encabezados, no opciones", () => {
    render(<Montado />)
    fireEvent.click(screen.getByRole("button", { name: /Alquiler/ }))

    const lista = screen.getByRole("listbox")
    const opciones = within(lista).getAllByRole("option").map((o) => o.textContent)
    expect(opciones).toEqual(["Educación", "Alquiler", "Expensas"])
    expect(within(lista).getByRole("group", { name: "Hogar" })).toBeTruthy()
  })

  it("busca sin tildes y elige con el teclado; Enter no manda el formulario", () => {
    const onSubmit = vi.fn()
    render(<Montado onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole("button", { name: /Alquiler/ }))

    const buscador = screen.getByRole("combobox", { name: "Buscar categoría" })
    fireEvent.change(buscador, { target: { value: "educa" } })
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Educación"])

    fireEvent.keyDown(buscador, { key: "Enter" })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(valorEnviado()).toBe("ed")
  })

  it("las flechas recorren las opciones salteando los encabezados", () => {
    render(<Montado />)
    fireEvent.click(screen.getByRole("button", { name: /Alquiler/ }))
    const buscador = screen.getByRole("combobox", { name: "Buscar categoría" })

    const activa = () => document.getElementById(buscador.getAttribute("aria-activedescendant")!)
    expect(activa()?.textContent).toBe("Alquiler")
    fireEvent.keyDown(buscador, { key: "ArrowUp" })
    expect(activa()?.textContent).toBe("Educación")
    fireEvent.keyDown(buscador, { key: "ArrowDown" })
    fireEvent.keyDown(buscador, { key: "ArrowDown" })
    expect(activa()?.textContent).toBe("Expensas")
  })

  it("sin coincidencias lo dice", () => {
    render(<Montado />)
    fireEvent.click(screen.getByRole("button", { name: /Alquiler/ }))
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } })
    expect(screen.getByText("Ninguna categoría coincide.")).toBeTruthy()
  })
})

describe("initialCategoryId", () => {
  it("arranca en la última usada si todavía se puede elegir", () => {
    expect(initialCategoryId(TODAS, "e")).toBe("e")
  })

  it("si la última dejó de ser hoja o no existe, arranca en la primera opción", () => {
    expect(initialCategoryId(TODAS, "h")).toBe("ed")
    expect(initialCategoryId(TODAS, "borrada")).toBe("ed")
    expect(initialCategoryId(TODAS, null)).toBe("ed")
  })

  it("una archivada no se recuerda", () => {
    expect(initialCategoryId([...TODAS, cat("x", "Vieja", null, true)], "x")).toBe("ed")
  })
})

describe("la última usada", () => {
  it("se recuerda por tipo", () => {
    rememberCategory("expense", "e")
    expect(readLastCategory("expense")).toBe("e")
    expect(readLastCategory("income")).toBeNull()
  })

  it("si el almacenamiento tira, no rompe", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("bloqueado")
      },
    })
    expect(readLastCategory("expense")).toBeNull()
    expect(() => rememberCategory("expense", "e")).not.toThrow()
  })
})
