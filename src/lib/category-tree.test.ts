import { describe, expect, it } from "vitest"

import { categoryHue, paletteHue } from "@/lib/category-color"
import {
  buildCategoryTree,
  categoryLabels,
  flattenSelectorGroups,
  isLeafCategory,
  moveTargets,
  normalizeSearch,
  selectorGroups,
  spendByParent,
  type TreeCategory,
} from "@/lib/category-tree"

function cat(
  id: string,
  name: string,
  parentId: string | null = null,
  extra: Partial<TreeCategory> = {},
): TreeCategory {
  return { id, name, parentId, archived: false, color: null, ...extra }
}

/** Un set chico con las dos formas: un padre con hijas y una suelta. */
const HOGAR = cat("hogar", "Hogar", null, { color: "azul" })
const ALQUILER = cat("alquiler", "Alquiler", "hogar")
const EXPENSAS = cat("expensas", "Expensas", "hogar")
const OCIO = cat("ocio", "Ocio")
const TODAS = [ALQUILER, EXPENSAS, HOGAR, OCIO]

describe("buildCategoryTree", () => {
  it("cuelga cada hija de su padre y deja arriba sólo las de primer nivel", () => {
    const tree = buildCategoryTree(TODAS)
    expect(tree.map((n) => n.id)).toEqual(["hogar", "ocio"])
    expect(tree[0].children.map((c) => c.id)).toEqual(["alquiler", "expensas"])
    expect(tree[1].children).toEqual([])
  })

  it("una hija cuyo padre no vino en la lista se muestra arriba en vez de perderse", () => {
    const tree = buildCategoryTree([ALQUILER, OCIO])
    expect(tree.map((n) => n.id)).toEqual(["alquiler", "ocio"])
  })
})

describe("isLeafCategory", () => {
  it("un padre con hijas no es hoja; una hija y una suelta sí", () => {
    expect(isLeafCategory(TODAS, "hogar")).toBe(false)
    expect(isLeafCategory(TODAS, "alquiler")).toBe(true)
    expect(isLeafCategory(TODAS, "ocio")).toBe(true)
  })

  // La misma respuesta que el trigger de la base: si la interfaz contara sólo
  // las activas, ofrecería un padre que después falla al guardar.
  it("las hijas archivadas también cuentan", () => {
    const soloArchivadas = [HOGAR, { ...ALQUILER, archived: true }]
    expect(isLeafCategory(soloArchivadas, "hogar")).toBe(false)
  })
})

describe("categoryLabels", () => {
  it("una subcategoría lleva el nombre del padre y hereda su color", () => {
    const labels = categoryLabels(TODAS)
    expect(labels.get("alquiler")).toEqual({
      name: "Alquiler",
      parentName: "Hogar",
      hue: paletteHue("azul"),
    })
  })

  it("una de primer nivel no lleva padre y sin color elegido usa el hash", () => {
    expect(categoryLabels(TODAS).get("ocio")).toEqual({
      name: "Ocio",
      parentName: null,
      hue: categoryHue("Ocio"),
    })
  })
})

describe("normalizeSearch", () => {
  it("ignora mayúsculas, tildes y espacios de los bordes", () => {
    expect(normalizeSearch("  Educación ")).toBe("educacion")
  })
})

describe("selectorGroups", () => {
  it("un padre con hijas es encabezado y no opción; una suelta es opción", () => {
    const groups = selectorGroups(TODAS)
    expect(groups).toEqual([
      { type: "group", parent: HOGAR, options: [ALQUILER, EXPENSAS] },
      { type: "leaf", category: OCIO },
    ])
    expect(flattenSelectorGroups(groups).map((c) => c.id)).toEqual([
      "alquiler",
      "expensas",
      "ocio",
    ])
  })

  it("no ofrece archivadas, salvo la que el movimiento ya tiene", () => {
    const conArchivada = [{ ...ALQUILER, archived: true }, EXPENSAS, HOGAR, OCIO]
    expect(flattenSelectorGroups(selectorGroups(conArchivada)).map((c) => c.id)).toEqual([
      "expensas",
      "ocio",
    ])
    expect(
      flattenSelectorGroups(selectorGroups(conArchivada, { keepId: "alquiler" })).map((c) => c.id),
    ).toEqual(["alquiler", "expensas", "ocio"])
  })

  it("un padre con todas sus hijas archivadas no aparece, ni como opción", () => {
    const groups = selectorGroups([{ ...ALQUILER, archived: true }, HOGAR, OCIO])
    expect(flattenSelectorGroups(groups).map((c) => c.id)).toEqual(["ocio"])
  })

  it("busca sin tildes en el nombre de la opción", () => {
    const groups = selectorGroups([...TODAS, cat("edu", "Educación")], { query: "educa" })
    expect(flattenSelectorGroups(groups).map((c) => c.id)).toEqual(["edu"])
  })

  it("buscar el nombre del padre trae todas sus hijas", () => {
    const groups = selectorGroups(TODAS, { query: "hog" })
    expect(flattenSelectorGroups(groups).map((c) => c.id)).toEqual(["alquiler", "expensas"])
  })
})

describe("moveTargets", () => {
  it("una hoja se puede mover abajo de cualquier activa de primer nivel menos ella misma", () => {
    expect(moveTargets(TODAS, "ocio").map((c) => c.id)).toEqual(["hogar"])
    expect(moveTargets(TODAS, "alquiler").map((c) => c.id)).toEqual(["hogar", "ocio"])
  })

  it("una categoría con hijas no se puede mover abajo de nadie: sería un tercer nivel", () => {
    expect(moveTargets(TODAS, "hogar")).toEqual([])
  })

  it("no ofrece padres archivados ni subcategorías", () => {
    const lista = [...TODAS, cat("viejo", "Viejo", null, { archived: true })]
    expect(moveTargets(lista, "ocio").map((c) => c.id)).toEqual(["hogar"])
  })
})

describe("spendByParent", () => {
  it("suma por padre con el desglose por hija, todo de mayor a menor", () => {
    const result = spendByParent(
      [
        { categoryId: "expensas", arsCents: 3_000 },
        { categoryId: "ocio", arsCents: 20_000 },
        { categoryId: "alquiler", arsCents: 50_000 },
        { categoryId: "expensas", arsCents: 1_000 },
      ],
      TODAS,
    )

    expect(result).toEqual([
      {
        id: "hogar",
        name: "Hogar",
        hue: paletteHue("azul"),
        arsCents: 54_000,
        children: [
          { id: "alquiler", name: "Alquiler", hue: paletteHue("azul"), arsCents: 50_000 },
          { id: "expensas", name: "Expensas", hue: paletteHue("azul"), arsCents: 4_000 },
        ],
      },
      { id: "ocio", name: "Ocio", hue: categoryHue("Ocio"), arsCents: 20_000, children: [] },
    ])
  })

  it("lo que no tiene categoría, o tiene una que no vino en la lista, va a Sin categoría", () => {
    // Pasa si la lista viniera sólo con las activas y el gasto fuera de una
    // archivada: sin esto la torta mostraría "undefined" como nombre.
    const result = spendByParent(
      [
        { categoryId: null, arsCents: 700 },
        { categoryId: "fantasma", arsCents: 300 },
      ],
      [],
    )
    expect(result).toEqual([
      { id: null, name: "Sin categoría", hue: null, arsCents: 1_000, children: [] },
    ])
  })

  it("con la lista vacía, devuelve una lista vacía", () => {
    expect(spendByParent([], [])).toEqual([])
  })

  it("suma junto lo de dos categorías con ids distintos que comparten nombre", () => {
    // Puede pasar de verdad: el índice único de nombres sólo mira las activas,
    // así que una archivada y una activa nueva pueden llamarse igual.
    const result = spendByParent(
      [
        { categoryId: "activa", arsCents: 1_000 },
        { categoryId: "archivada", arsCents: 2_000 },
      ],
      [cat("activa", "Comida"), cat("archivada", "Comida", null, { archived: true })],
    )
    expect(result.map(({ name, arsCents }) => ({ name, arsCents }))).toEqual([
      { name: "Comida", arsCents: 3_000 },
    ])
  })
})
