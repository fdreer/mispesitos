import { describe, expect, it } from "vitest"

import {
  PAGE_SIZE,
  activeFilterCount,
  buildMovementHref,
  defaultSortForKind,
  hayFiltrosActivos,
  movementFiltersFromQuery,
  paginate,
  parseMovementQuery,
} from "@/lib/movement-query"

describe("parseMovementQuery", () => {
  it("una URL pelada da todos los filtros vacíos y la página 1", () => {
    expect(parseMovementQuery({})).toEqual({
      search: "",
      categoryIds: [],
      cardId: "all",
      currency: "all",
      status: "all",
      from: "",
      to: "",
      dateField: "date",
      minCents: null,
      maxCents: null,
      sort: "date",
      page: 1,
    })
  })

  it("usa vencimiento por defecto en egresos y fecha en ingresos", () => {
    expect(parseMovementQuery({}, defaultSortForKind("expense")).sort).toBe("due")
    expect(parseMovementQuery({}, defaultSortForKind("income")).sort).toBe("date")
  })

  it("lee los filtros que vienen bien, incluyendo múltiples categorías, tarjeta, importes y orden", () => {
    expect(
      parseMovementQuery({
        search: "kiosco",
        categoryId: "cat-1,cat-2",
        cardId: "card-1",
        currency: "USD",
        status: "overdue",
        from: "2026-01-01",
        to: "2026-12-31",
        min: "1000",
        max: "2500.5",
        sort: "amount",
        page: "3",
      }),
    ).toEqual({
      search: "kiosco",
      categoryIds: ["cat-1", "cat-2"],
      cardId: "card-1",
      currency: "USD",
      status: "overdue",
      from: "2026-01-01",
      to: "2026-12-31",
      dateField: "date",
      minCents: 100_000,
      maxCents: 250_050,
      sort: "amount",
      page: 3,
    })
  })

  it("acepta categoryId repetido como array y descarta 'all' o duplicados", () => {
    expect(parseMovementQuery({ categoryId: ["cat-1", "cat-2", "cat-1", "all"] }).categoryIds).toEqual([
      "cat-1",
      "cat-2",
    ])
  })

  it("un estado, moneda u orden inventado cae en su default", () => {
    expect(parseMovementQuery({ status: "borracho" }).status).toBe("all")
    expect(parseMovementQuery({ currency: "EUR" }).currency).toBe("all")
    expect(parseMovementQuery({ currency: "ars" }).currency).toBe("all")
    expect(parseMovementQuery({ sort: "color" }, "due").sort).toBe("due")
  })

  it("importes negativos o inválidos se descartan", () => {
    expect(parseMovementQuery({ min: "-100", max: "abc" })).toMatchObject({
      minCents: null,
      maxCents: null,
    })
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

  it("con el parámetro repetido se queda con el primero (salvo categoryId)", () => {
    expect(parseMovementQuery({ status: ["paid", "overdue"] }).status).toBe("paid")
  })
})

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i)

  it("corta la página pedida y devuelve totalCount", () => {
    expect(paginate(items, 1)).toMatchObject({ items: items.slice(0, 20), totalCount: 45 })
    expect(paginate(items, 2)).toMatchObject({ items: items.slice(20, 40), totalCount: 45 })
    expect(paginate(items, 3)).toMatchObject({ items: items.slice(40, 45), totalCount: 45 })
  })

  it("cuenta las páginas contando la última incompleta", () => {
    expect(paginate(items, 1).totalPages).toBe(3)
    expect(paginate(Array.from({ length: PAGE_SIZE }, (_, i) => i), 1).totalPages).toBe(1)
    expect(paginate(Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i), 1).totalPages).toBe(2)
  })

  it("una lista vacía es una página vacía con totalCount 0", () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, totalPages: 1, totalCount: 0 })
  })

  it("una página que ya no existe muestra la última, no una tabla en blanco", () => {
    expect(paginate(items, 99)).toMatchObject({ page: 3 })
    expect(paginate(items, 99).items).toEqual(items.slice(40, 45))
  })
})

describe("hayFiltrosActivos / activeFilterCount", () => {
  it("una query pelada no tiene filtros activos", () => {
    expect(hayFiltrosActivos(parseMovementQuery({}))).toBe(false)
    expect(activeFilterCount(parseMovementQuery({}))).toBe(0)
  })

  it("cualquier filtro activo cuenta y activeFilterCount incluye el estado", () => {
    expect(hayFiltrosActivos(parseMovementQuery({ search: "kiosco" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ categoryId: "cat-1" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ cardId: "cash" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ currency: "USD" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ status: "paid" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ from: "2026-01-01" }))).toBe(true)
    expect(hayFiltrosActivos(parseMovementQuery({ min: "500" }))).toBe(true)

    expect(
      activeFilterCount(
        parseMovementQuery({
          status: "overdue",
          categoryId: "c1,c2",
          min: "100",
          max: "500",
        }),
      ),
    ).toBe(3)
  })

  it("la página y el orden solos no cuentan como filtros activos", () => {
    expect(hayFiltrosActivos(parseMovementQuery({ page: "3", sort: "amount" }))).toBe(false)
  })
})

describe("movementFiltersFromQuery", () => {
  it("una query pelada no manda ningún filtro a la consulta", () => {
    expect(movementFiltersFromQuery(parseMovementQuery({}))).toEqual({
      search: undefined,
      categoryIds: undefined,
      cardId: undefined,
      currency: undefined,
      from: undefined,
      to: undefined,
      dateField: undefined,
      minCents: undefined,
      maxCents: undefined,
    })
  })

  it("manda los que están puestos", () => {
    const query = parseMovementQuery({
      search: "kiosco",
      categoryId: "cat-1,cat-2",
      cardId: "card-1",
      currency: "USD",
      from: "2026-01-01",
      to: "2026-12-31",
      por: "pago",
      min: "100",
      max: "500",
    })

    expect(movementFiltersFromQuery(query)).toEqual({
      search: "kiosco",
      categoryIds: ["cat-1", "cat-2"],
      cardId: "card-1",
      currency: "USD",
      from: "2026-01-01",
      to: "2026-12-31",
      dateField: "paid",
      minCents: 10_000,
      maxCents: 50_000,
    })
  })

  it("el estado nunca viaja: no es una columna, se deriva de las cuotas", () => {
    const filtros = movementFiltersFromQuery(parseMovementQuery({ status: "paid" }))
    expect("status" in filtros).toBe(false)
  })
})

describe("buildMovementHref", () => {
  const vacia = parseMovementQuery({}, "due")

  it("sin filtros devuelve la ruta pelada sin escribir el orden por defecto", () => {
    expect(buildMovementHref("/egresos", vacia, {}, "due")).toBe("/egresos")
  })

  it("no escribe los valores que ya son el default", () => {
    expect(buildMovementHref("/egresos", vacia, { categoryIds: [], status: "all" }, "due")).toBe(
      "/egresos",
    )
  })

  it("escribe sólo los filtros puestos", () => {
    expect(buildMovementHref("/egresos", vacia, { status: "overdue" }, "due")).toBe(
      "/egresos?status=overdue",
    )
    expect(
      buildMovementHref(
        "/egresos",
        vacia,
        { categoryIds: ["c1", "c2"], cardId: "cash", minCents: 100_000, sort: "amount" },
        "due",
      ),
    ).toBe("/egresos?categoryId=c1%2Cc2&cardId=cash&min=1000&sort=amount")
  })

  it("cambiar un filtro vuelve a la página 1", () => {
    const enPagina7 = parseMovementQuery({ status: "paid", page: "7" }, "due")

    expect(buildMovementHref("/egresos", enPagina7, { status: "overdue" }, "due")).toBe(
      "/egresos?status=overdue",
    )
  })

  it("cambiar sólo de página conserva los filtros", () => {
    const conFiltros = parseMovementQuery({ search: "kiosco", status: "paid" }, "due")

    expect(buildMovementHref("/egresos", conFiltros, { page: 4 }, "due")).toBe(
      "/egresos?search=kiosco&status=paid&page=4",
    )
  })

  it("codifica el buscador", () => {
    expect(buildMovementHref("/ingresos", parseMovementQuery({}), { search: "café & co" })).toBe(
      "/ingresos?search=caf%C3%A9+%26+co",
    )
  })

  it("serializa por=pago sólo cuando hay fechas y conserva parámetros extra", () => {
    expect(
      buildMovementHref("/egresos", vacia, { from: "2026-10-01", to: "2026-10-31", dateField: "paid" }, "due"),
    ).toBe("/egresos?from=2026-10-01&to=2026-10-31&por=pago")

    expect(buildMovementHref("/egresos", vacia, { dateField: "paid" }, "due")).toBe("/egresos")
    expect(parseMovementQuery({ por: "pago" }).dateField).toBe("date")

    expect(
      buildMovementHref(
        "/informes",
        parseMovementQuery({}),
        { from: "2026-11-01", to: "2026-11-30" },
        "date",
        { tab: "flujo", moneda: "USD" },
      ),
    ).toBe("/informes?tab=flujo&moneda=USD&from=2026-11-01&to=2026-11-30")
  })
})
