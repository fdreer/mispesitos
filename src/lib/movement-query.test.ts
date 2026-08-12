import { describe, expect, it } from "vitest"

import {
  PAGE_SIZE,
  buildMovementHref,
  hayFiltrosActivos,
  movementFiltersFromQuery,
  paginate,
  parseMovementQuery,
} from "@/lib/movement-query"

describe("parseMovementQuery", () => {
  it("una URL pelada da todos los filtros vacíos y la página 1", () => {
    expect(parseMovementQuery({})).toEqual({
      search: "",
      categoryId: "all",
      status: "all",
      from: "",
      to: "",
      page: 1,
    })
  })

  it("lee los filtros que vienen bien", () => {
    expect(
      parseMovementQuery({
        search: "kiosco",
        categoryId: "cat-1",
        status: "overdue",
        from: "2026-01-01",
        to: "2026-12-31",
        page: "3",
      }),
    ).toEqual({
      search: "kiosco",
      categoryId: "cat-1",
      status: "overdue",
      from: "2026-01-01",
      to: "2026-12-31",
      page: 3,
    })
  })

  it("un estado inventado cae en 'all' en vez de filtrar por nada", () => {
    expect(parseMovementQuery({ status: "borracho" }).status).toBe("all")
  })

  it("una fecha que no es ISO se descarta", () => {
    expect(parseMovementQuery({ from: "ayer", to: "2026-13-45" })).toMatchObject({
      from: "",
      to: "",
    })
  })

  it("una página no numérica, cero o negativa cae en 1", () => {
    expect(parseMovementQuery({ page: "hola" }).page).toBe(1)
    expect(parseMovementQuery({ page: "0" }).page).toBe(1)
    expect(parseMovementQuery({ page: "-4" }).page).toBe(1)
  })

  it("recorta el buscador y lo limita al largo de la columna", () => {
    expect(parseMovementQuery({ search: "  kiosco  " }).search).toBe("kiosco")
    expect(parseMovementQuery({ search: "x".repeat(500) }).search).toHaveLength(200)
  })

  it("con el parámetro repetido se queda con el primero", () => {
    // Next entrega string[] cuando la URL trae ?status=paid&status=overdue.
    expect(parseMovementQuery({ status: ["paid", "overdue"] }).status).toBe("paid")
  })
})

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i)

  it("corta la página pedida", () => {
    expect(paginate(items, 1).items).toEqual(items.slice(0, 20))
    expect(paginate(items, 2).items).toEqual(items.slice(20, 40))
    expect(paginate(items, 3).items).toEqual(items.slice(40, 45))
  })

  it("cuenta las páginas contando la última incompleta", () => {
    expect(paginate(items, 1).totalPages).toBe(3)
    expect(paginate(Array.from({ length: PAGE_SIZE }, (_, i) => i), 1).totalPages).toBe(1)
    expect(paginate(Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i), 1).totalPages).toBe(2)
  })

  it("una lista vacía es una página vacía, no cero páginas", () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, totalPages: 1 })
  })

  it("una página que ya no existe muestra la última, no una tabla en blanco", () => {
    // Pasa siempre: se filtra estando en la página 7 y el resultado tiene 2.
    expect(paginate(items, 99)).toMatchObject({ page: 3 })
    expect(paginate(items, 99).items).toEqual(items.slice(40, 45))
  })
})

describe("hayFiltrosActivos", () => {
  it("una query pelada no tiene filtros activos", () => {
    expect(hayFiltrosActivos(parseMovementQuery({}))).toBe(false)
  })

  it("cualquiera de los cinco campos alcanza para contar como filtro activo", () => {
    expect(hayFiltrosActivos(parseMovementQuery({ search: "kiosco" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ categoryId: "cat-1" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ status: "paid" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ from: "2026-01-01" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ to: "2026-12-31" }))).toBe(true)
  })

  it("la página sola no cuenta como filtro activo", () => {
    expect(hayFiltrosActivos(parseMovementQuery({ page: "3" }))).toBe(false)
  })
})

describe("movementFiltersFromQuery", () => {
  it("una query pelada no manda ningún filtro a la consulta", () => {
    expect(movementFiltersFromQuery(parseMovementQuery({}))).toEqual({
      search: undefined,
      categoryId: undefined,
      from: undefined,
      to: undefined,
    })
  })

  it("manda los que están puestos, con el mismo nombre que espera la consulta", () => {
    const query = parseMovementQuery({
      search: "kiosco",
      categoryId: "cat-1",
      from: "2026-01-01",
      to: "2026-12-31",
    })

    expect(movementFiltersFromQuery(query)).toEqual({
      search: "kiosco",
      categoryId: "cat-1",
      from: "2026-01-01",
      to: "2026-12-31",
    })
  })

  it("el estado nunca viaja: no es una columna, se deriva de las cuotas", () => {
    const filtros = movementFiltersFromQuery(parseMovementQuery({ status: "paid" }))
    expect("status" in filtros).toBe(false)
  })
})

describe("buildMovementHref", () => {
  const vacia = parseMovementQuery({})

  it("sin filtros devuelve la ruta pelada", () => {
    expect(buildMovementHref("/ingresos", vacia)).toBe("/ingresos")
  })

  it("no escribe los valores que ya son el default", () => {
    expect(buildMovementHref("/ingresos", vacia, { categoryId: "all", status: "all" })).toBe(
      "/ingresos",
    )
  })

  it("escribe sólo los filtros puestos", () => {
    expect(buildMovementHref("/egresos", vacia, { status: "overdue" })).toBe(
      "/egresos?status=overdue",
    )
  })

  it("cambiar un filtro vuelve a la página 1", () => {
    const enPagina7 = parseMovementQuery({ status: "paid", page: "7" })

    expect(buildMovementHref("/ingresos", enPagina7, { status: "overdue" })).toBe(
      "/ingresos?status=overdue",
    )
  })

  it("cambiar sólo de página conserva los filtros", () => {
    const conFiltros = parseMovementQuery({ search: "kiosco", status: "paid" })

    expect(buildMovementHref("/ingresos", conFiltros, { page: 4 })).toBe(
      "/ingresos?search=kiosco&status=paid&page=4",
    )
  })

  it("codifica el buscador", () => {
    expect(buildMovementHref("/ingresos", vacia, { search: "café & co" })).toBe(
      "/ingresos?search=caf%C3%A9+%26+co",
    )
  })
})
