import { resolveCategoryHue } from "@/lib/category-color"

export type TreeCategory = {
  id: string
  name: string
  parentId: string | null
  archived: boolean
  color: string | null
}

export type CategoryNode<C extends TreeCategory> = C & { children: C[] }

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

export function isLeafCategory(categories: TreeCategory[], id: string): boolean {
  return !categories.some((c) => c.parentId === id)
}

export function categoryHues(categories: TreeCategory[]): Map<string, number> {
  const byId = new Map(categories.map((c) => [c.id, c]))
  return new Map(
    categories.map((c) => [
      c.id,
      resolveCategoryHue(c, c.parentId === null ? null : byId.get(c.parentId)),
    ]),
  )
}

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

export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
}

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

export function flattenSelectorGroups<C extends TreeCategory>(groups: SelectorGroup<C>[]): C[] {
  return groups.flatMap((g) => (g.type === "leaf" ? [g.category] : g.options))
}

export function moveTargets<C extends TreeCategory>(categories: C[], id: string): C[] {
  if (!isLeafCategory(categories, id)) return []
  return categories.filter((c) => c.parentId === null && !c.archived && c.id !== id)
}

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
