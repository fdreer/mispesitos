"use client"

import { CategoryBadge } from "@/components/category-badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  buildCategoryTree,
  categoryCheckState,
  categoryLabels,
  normalizeSearch,
} from "@/lib/category-tree"
import { formatAmountInput, formatMoney } from "@/lib/money"
import { CARD_FILTER_CASH, CURRENCY_VALUES, type QueryCurrency } from "@/lib/movement-query"
import type { CardOption } from "@/server/card-queries"
import type { Category } from "@/server/queries"

/** Piezas compartidas entre la barra clásica, el panel de reglas y los chips. */

export const CURRENCY_OPTIONS: (QueryCurrency | "all")[] = ["all", ...CURRENCY_VALUES]

export const TODAS = <span className="text-muted-foreground">Todas</span>
export const TODOS = <span className="text-muted-foreground">Todos</span>

export function centsToInputValue(cents: number | null): string {
  if (cents === null) return ""
  return formatAmountInput((cents / 100).toFixed(2).replace(".", ","))
}

export function formatAmountRangeLabel(minCents: number | null, maxCents: number | null): string {
  if (minCents !== null && maxCents !== null) {
    return `${formatMoney(minCents, "ARS", minCents % 100 === 0 ? 0 : 2)} – ${formatMoney(maxCents, "ARS", maxCents % 100 === 0 ? 0 : 2)}`
  }
  if (minCents !== null) {
    return `Desde ${formatMoney(minCents, "ARS", minCents % 100 === 0 ? 0 : 2)}`
  }
  if (maxCents !== null) {
    return `Hasta ${formatMoney(maxCents, "ARS", maxCents % 100 === 0 ? 0 : 2)}`
  }
  return "Importe"
}

export function cardLabel(cardId: string, cards: CardOption[]): string {
  if (cardId === CARD_FILTER_CASH) return "Efectivo / débito"
  const found = cards.find((c) => c.id === cardId)
  if (!found) return cardId
  return found.archived ? `${found.name} (archivada)` : found.name
}

export function categorySummaryText(categoryIds: string[], categories: Category[]): string {
  if (categoryIds.length === 0) return "Todas"
  if (categoryIds.length === 1) {
    const label = categoryLabels(categories).get(categoryIds[0])
    if (!label) return "1 categoría"
    return label.parentName ? `${label.parentName} › ${label.name}` : label.name
  }
  return `${categoryIds.length} categorías`
}

/** Árbol de categorías con checkboxes para multiselección (§4). */
export function CategoryChecklist({
  categories,
  selectedIds,
  onToggle,
  searchTerm,
}: {
  categories: Category[]
  selectedIds: string[]
  onToggle: (id: string) => void
  searchTerm: string
}) {
  const labels = categoryLabels(categories)
  const tree = buildCategoryTree(categories)
  const q = normalizeSearch(searchTerm)

  const filteredTree = tree
    .map((node) => {
      if (!q) return node
      const parentMatches = normalizeSearch(node.name).includes(q)
      if (parentMatches) return node
      const matchingChildren = node.children.filter((c) => normalizeSearch(c.name).includes(q))
      if (matchingChildren.length === 0) return null
      return { ...node, children: matchingChildren }
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)

  if (filteredTree.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-xs">Sin categorías.</p>
  }

  return (
    <div className="space-y-1">
      {filteredTree.map((node) => {
        const nodeState = categoryCheckState(selectedIds, node.id, categories)
        const nodeLabel = labels.get(node.id)
        return (
          <div key={node.id} className="space-y-0.5">
            <label className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm">
              <Checkbox
                checked={nodeState}
                onCheckedChange={() => onToggle(node.id)}
                aria-label={node.name}
              />
              <CategoryBadge name={node.name} hue={nodeLabel?.hue} />
              {node.archived && (
                <span className="text-muted-foreground text-xs">(archivada)</span>
              )}
            </label>
            {node.children.map((child) => {
              const childChecked = categoryCheckState(selectedIds, child.id, categories) === true
              const childLabel = labels.get(child.id)
              return (
                <label
                  key={child.id}
                  className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-1.5 pl-7 text-sm"
                >
                  <Checkbox
                    checked={childChecked}
                    onCheckedChange={() => onToggle(child.id)}
                    aria-label={`${node.name} › ${child.name}`}
                  />
                  <CategoryBadge name={child.name} hue={childLabel?.hue} />
                  {child.archived && (
                    <span className="text-muted-foreground text-xs">(archivada)</span>
                  )}
                </label>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}


/** "Comida", "Comida +2" o "Hogar › Alquiler": el texto corto de un chip. */
export function categoryChipText(categoryIds: string[], categories: Category[]): string {
  if (categoryIds.length === 0) return "Todas"
  const label = categoryLabels(categories).get(categoryIds[0])
  const first = label ? (label.parentName ? `${label.parentName} › ${label.name}` : label.name) : "1 categoría"
  return categoryIds.length > 1 ? `${first} +${categoryIds.length - 1}` : first
}
