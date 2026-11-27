"use client"

import { XIcon } from "lucide-react"

import {
  clearRulePatch,
  isRuleActive,
  RULE_LABELS,
  RuleValueEditor,
  ruleValueText,
  type RuleField,
} from "@/components/filters/filter-rules"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { MovementQuery } from "@/lib/movement-query"
import type { CardOption } from "@/server/card-queries"
import type { Category } from "@/server/queries"

/**
 * Chips de las reglas activas debajo de la barra: "Categoría: Comida +2".
 * Click en el chip abre el editor de esa regla anclado a él; × la quita.
 */
export function FilterChips({
  fields,
  query,
  categories,
  cards,
  onChange,
  onClearAll,
  showClearAll,
}: {
  fields: readonly RuleField[]
  query: MovementQuery
  categories: Category[]
  cards: CardOption[]
  onChange: (patch: Partial<MovementQuery>) => void
  onClearAll: () => void
  showClearAll: boolean
}) {
  const active = fields.filter((f) => isRuleActive(f, query))
  if (active.length === 0 && !showClearAll) return null

  return (
    <div aria-label="Filtros activos" className="flex flex-wrap items-center gap-1.5">
      {active.map((field) => {
        const value = ruleValueText(field, query, categories, cards)
        const label = `${RULE_LABELS[field]}: ${value}`
        return (
          <span
            key={field}
            className="inline-flex h-7 items-center rounded-full bg-white/[0.06] text-xs text-foreground transition-colors hover:bg-white/[0.09]"
          >
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Editar filtro ${label}`}
                  className="inline-flex h-full cursor-pointer items-center gap-1 rounded-l-full pr-1 pl-2.5 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="text-muted-foreground">{RULE_LABELS[field]}:</span>
                  <span className="max-w-48 truncate">{value}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <RuleValueEditor
                  field={field}
                  query={query}
                  categories={categories}
                  cards={cards}
                  onChange={onChange}
                />
              </PopoverContent>
            </Popover>
            <button
              type="button"
              aria-label={`Quitar filtro ${label}`}
              onClick={() => onChange(clearRulePatch(field))}
              className="mr-1.5 inline-flex size-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-paper"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        )
      })}
      {showClearAll && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onClearAll}
          className="text-muted-foreground"
        >
          Limpiar todo
        </Button>
      )}
    </div>
  )
}
