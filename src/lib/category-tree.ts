import { resolveCategoryHue } from "@/lib/category-color"

/**
 * El árbol de categorías (Fase 2 del plan v2, §2), sin base ni React: lo usan
 * `/categorias`, el selector del formulario, los badges de los listados y la
 * torta del dashboard, y las reglas viven acá una sola vez.
 *
 * Dos niveles y no más, como en la base (trigger `category_two_levels`,
 * migración 0011): una categoría de primer nivel tiene `parentId = null`; una
 * subcategoría apunta a una de primer nivel.
 */

/** Lo que el árbol necesita de cada categoría. `Category` (@/server/queries) lo cumple. */
export type TreeCategory = {
  id: string
  name: string
  parentId: string | null
  archived: boolean
  color: string | null
}

export type CategoryNode<C extends TreeCategory> = C & { children: C[] }

/**
 * Las categorías de primer nivel, cada una con sus hijas, conservando el orden
 * de entrada (la consulta las trae por nombre).
 *
 * Una hija cuyo padre NO vino en la lista se muestra como de primer nivel en
 * vez de desaparecer. No debería pasar —archivar un padre archiva sus hijas y
 * desarchivar una hija desarchiva el padre, así que una lista sólo de activas
 * nunca trae una hija sin su padre—, pero perder una categoría de vista es
 * peor que mostrarla un nivel más arriba.
 */
export function buildCategoryTree<C extends TreeCategory>(categories: C[]): CategoryNode<C>[] {
  const ids = new Set(categories.map((c) => c.id))
  const children = new Map<string, C[]>()
  for (const c of categories) {
    if (c.parentId === null || !ids.has(c.parentId)) continue
    const list = children.get(c.parentId) ?? []
    list.push(c)
    children.set(c.parentId, list)
  }

  return categories
    .filter((c) => c.parentId === null || !ids.has(c.parentId))
    .map((c) => ({ ...c, children: children.get(c.id) ?? [] }))
}

/**
 * ¿Puede un movimiento apuntar a esta categoría? Sólo si no tiene hijas
 * (decisión 7.4 del plan). Cuentan TODAS las hijas, archivadas incluidas:
 * es la misma pregunta que hace el trigger `movement_category_is_leaf`, y si
 * la interfaz contestara distinto que la base, ofrecería una opción que
 * después falla al guardar.
 */
export function isLeafCategory(categories: TreeCategory[], id: string): boolean {
  return !categories.some((c) => c.parentId === id)
}

/** El tono de cada categoría por id, con la herencia del padre ya resuelta. */
export function categoryHues(categories: TreeCategory[]): Map<string, number> {
  const byId = new Map(categories.map((c) => [c.id, c]))
  return new Map(
    categories.map((c) => [
      c.id,
      resolveCategoryHue(c, c.parentId === null ? null : byId.get(c.parentId)),
    ]),
  )
}

/**
 * Lo que se muestra de una categoría en un badge: su nombre y, si es una
 * subcategoría, el de su padre. "General" sola no dice nada cuando hay una en
 * Hogar y otra en Comida.
 */
export type CategoryLabel = { name: string; parentName: string | null; hue: number }

export function categoryLabels(categories: TreeCategory[]): Map<string, CategoryLabel> {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const hues = categoryHues(categories)
  return new Map(
    categories.map((c) => [
      c.id,
      {
        name: c.name,
        parentName: c.parentId === null ? null : (byId.get(c.parentId)?.name ?? null),
        hue: hues.get(c.id)!,
      },
    ]),
  )
}

/** Minúsculas y sin tildes: "educacion" tiene que encontrar "Educación". */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
}

/**
 * Las opciones del selector de categoría del formulario, ya agrupadas:
 *
 * - una categoría de primer nivel SIN hijas es una opción suelta;
 * - una CON hijas es un encabezado, no una opción (§2.3), y debajo van sus
 *   hijas.
 *
 * Las archivadas no se ofrecen —para eso se archivan— salvo `keepId`, la que
 * el movimiento que se está editando ya tiene: sin ella, abrir el diálogo de
 * un movimiento viejo lo movería de categoría con sólo guardarlo.
 *
 * Un padre cuyas hijas están todas archivadas sigue sin ser hoja para la base
 * (ver `isLeafCategory`), así que no se ofrece y su grupo queda vacío: se
 * omite.
 *
 * `query` busca en el nombre de la opción y en el del padre: escribir "hogar"
 * trae todas las de Hogar.
 */
export type SelectorGroup<C extends TreeCategory> =
  | { type: "leaf"; category: C }
  | { type: "group"; parent: C; options: C[] }

export function selectorGroups<C extends TreeCategory>(
  categories: C[],
  { keepId, query = "" }: { keepId?: string | null; query?: string } = {},
): SelectorGroup<C>[] {
  const visible = (c: C) => !c.archived || c.id === keepId
  const q = normalizeSearch(query)
  const matches = (...names: string[]) =>
    q === "" || names.some((n) => normalizeSearch(n).includes(q))

  // Las filas originales y no los nodos del árbol, que llevan `children`:
  // quien consume el selector recibe las mismas categorías que pasó.
  const byId = new Map(categories.map((c) => [c.id, c]))
  const groups: SelectorGroup<C>[] = []
  for (const node of buildCategoryTree(categories)) {
    const category = byId.get(node.id)!
    if (isLeafCategory(categories, node.id)) {
      if (visible(category) && matches(category.name)) groups.push({ type: "leaf", category })
      continue
    }
    const options = node.children.filter((c) => visible(c) && matches(c.name, node.name))
    if (options.length > 0) groups.push({ type: "group", parent: category, options })
  }
  return groups
}

/** Las opciones del selector en el orden en que se recorren con las flechas. */
export function flattenSelectorGroups<C extends TreeCategory>(groups: SelectorGroup<C>[]): C[] {
  return groups.flatMap((g) => (g.type === "leaf" ? [g.category] : g.options))
}

/**
 * A qué padres se puede mover una categoría desde "Mover a…" en /categorias.
 *
 * - Sólo a categorías activas de primer nivel, distintas de ella misma: no hay
 *   tercer nivel.
 * - Una categoría que TIENE hijas no se puede mover abajo de nadie (quedaría
 *   un tercer nivel): para ella la lista es vacía y sólo queda "primer nivel",
 *   que ya es.
 * - Se asume que `categories` es de un solo tipo: la FK compuesta con `kind`
 *   no deja colgar una de egresos de una de ingresos.
 */
export function moveTargets<C extends TreeCategory>(categories: C[], id: string): C[] {
  if (!isLeafCategory(categories, id)) return []
  return categories.filter((c) => c.parentId === null && !c.archived && c.id !== id)
}

/**
 * Lo gastado por categoría PADRE, con el desglose por subcategoría (§2.3: "la
 * torta se muestra por padre, con desglose al expandir").
 *
 * Una categoría de primer nivel sin hijas es su propio grupo, sin desglose.
 * Un gasto sin categoría (o con una que no vino en la lista) va a "Sin
 * categoría", que no tiene id.
 *
 * Ordenado de mayor a menor, padres y también hijas.
 *
 * Se agrupa por NOMBRE, no por id, como hacía `spendByCategory` antes de la
 * Fase 2: el índice único de nombres sólo mira las activas, así que una
 * "Comida" archivada y una "Comida" activa nueva pueden convivir con ids
 * distintos, y en la torta son la misma porción. El id y el tono son los de la
 * primera que aparece.
 */
export type SpendGroup = {
  id: string | null
  name: string
  hue: number | null
  arsCents: number
  children: { id: string; name: string; hue: number; arsCents: number }[]
}

export function spendByParent(
  expenses: { categoryId: string | null; arsCents: number }[],
  categories: TreeCategory[],
): SpendGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const hues = categoryHues(categories)
  const groups = new Map<string, SpendGroup>()

  for (const expense of expenses) {
    const category = expense.categoryId ? byId.get(expense.categoryId) : undefined
    const parent =
      category && category.parentId !== null ? (byId.get(category.parentId) ?? category) : category

    const name = parent?.name ?? "Sin categoría"
    let group = groups.get(name)
    if (!group) {
      group = {
        id: parent?.id ?? null,
        name,
        hue: parent ? hues.get(parent.id)! : null,
        arsCents: 0,
        children: [],
      }
      groups.set(name, group)
    }
    group.arsCents += expense.arsCents

    if (category && parent && category.id !== parent.id) {
      let child = group.children.find((c) => c.name === category.name)
      if (!child) {
        child = { id: category.id, name: category.name, hue: hues.get(category.id)!, arsCents: 0 }
        group.children.push(child)
      }
      child.arsCents += expense.arsCents
    }
  }

  return [...groups.values()]
    .map((g) => ({ ...g, children: g.children.sort((a, b) => b.arsCents - a.arsCents) }))
    .sort((a, b) => b.arsCents - a.arsCents)
}

/**
 * Estado de selección de una categoría en el filtro múltiple (§4 del plan v2).
 *
 * Si el padre está guardado en `selected`, todas sus hijas también cuentan como
 * seleccionadas — así una URL `?categoryId=hogar` (o un link desde Informes)
 * marca al padre y a cada subcategoría. Si sólo algunas hijas están en
 * `selected`, el padre aparece en estado `"indeterminate"`.
 */
export type CategoryCheckState = boolean | "indeterminate"

export function categoryCheckState(
  selected: readonly string[],
  id: string,
  categories: readonly TreeCategory[],
): CategoryCheckState {
  const selectedSet = new Set(selected)
  const children = categories.filter((c) => c.parentId === id)
  if (children.length === 0) {
    if (selectedSet.has(id)) return true
    const cat = categories.find((c) => c.id === id)
    return cat?.parentId ? selectedSet.has(cat.parentId) : false
  }
  if (selectedSet.has(id)) return true
  const checkedChildren = children.filter((c) => selectedSet.has(c.id)).length
  if (checkedChildren === 0) return false
  return checkedChildren === children.length ? true : "indeterminate"
}

/**
 * Alterna una categoría en el filtro múltiple, respetando la regla de que
 * elegir un padre incluye a todas sus hijas (§4):
 *
 * - Tocar un padre lo prende o apaga entero y limpia las selecciones sueltas de
 *   sus hijas para que la URL no cargue ids redundantes.
 * - Tocar una hija cuando el padre entero estaba seleccionado desarma ese
 *   padre en las demás hijas menos la desmarcada.
 * - Si al marcar una hija quedan todas las hijas del mismo padre elegidas, se
 *   compactan de vuelta en el id del padre.
 */
export function toggleCategorySelection(
  selected: readonly string[],
  id: string,
  categories: readonly TreeCategory[],
): string[] {
  const next = new Set(selected)
  const children = categories.filter((c) => c.parentId === id)

  if (children.length > 0) {
    const state = categoryCheckState(selected, id, categories)
    for (const child of children) next.delete(child.id)
    if (state === true) {
      next.delete(id)
    } else {
      next.add(id)
    }
    return [...next]
  }

  const target = categories.find((c) => c.id === id)
  const parentId = target?.parentId ?? null
  if (parentId && next.has(parentId)) {
    next.delete(parentId)
    for (const sibling of categories) {
      if (sibling.parentId === parentId && sibling.id !== id) {
        next.add(sibling.id)
      }
    }
    return [...next]
  }

  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
    if (parentId) {
      const siblings = categories.filter((c) => c.parentId === parentId)
      if (siblings.length > 0 && siblings.every((s) => next.has(s.id))) {
        for (const s of siblings) next.delete(s.id)
        next.add(parentId)
      }
    }
  }
  return [...next]
}
