"use client"

import { useState } from "react"
import { ListFilter, Plus, XIcon } from "lucide-react"

import {
  clearRulePatch,
  isRuleActive,
  RULE_LABELS,
  RULE_OPERATORS,
  RuleValueControl,
  type RuleField,
} from "@/components/filters/filter-rules"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { MovementQuery } from "@/lib/movement-query"
import { cn } from "@/lib/utils"
import type { CardOption } from "@/server/card-queries"
import type { Category } from "@/server/queries"

/**
 * Botón "Filtrar (n)" que abre un panel de reglas del tipo
 * "Categoría · es · [Comida, Super]". Cada cambio se aplica en vivo.
 */
export function FilterPanel({
  fields,
  query,
  categories,
  cards,
  onChange,
  pending = false,
}: {
  /** Campos que esta pantalla permite filtrar, en orden. */
  fields: readonly RuleField[]
  query: MovementQuery
  categories: Category[]
  cards: CardOption[]
  onChange: (patch: Partial<MovementQuery>) => void
  pending?: boolean
}) {
  const [open, setOpen] = useState(false)
  // Reglas agregadas con "+ Agregar filtro" que todavía no tienen valor.
  const [drafts, setDrafts] = useState<RuleField[]>([])

  const active = fields.filter((f) => isRuleActive(f, query))
  const rows = fields.filter((f) => active.includes(f) || drafts.includes(f))
  const unused = fields.filter((f) => !rows.includes(f))

  function remove(field: RuleField) {
    setDrafts((d) => d.filter((x) => x !== field))
    if (isRuleActive(field, query)) onChange(clearRulePatch(field))
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setDrafts([])
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={active.length > 0 ? "secondary" : "ghost"}
          size="sm"
          className={cn("h-8 gap-1.5", active.length === 0 && "text-muted-foreground")}
        >
          <ListFilter />
          Filtrar
          {active.length > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary tabular-nums">
              {active.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Filtros"
        className={cn("w-[480px] p-3 transition-opacity", pending && "opacity-60")}
      >
        {rows.length === 0 ? (
          <p className="px-1 pb-2 text-sm text-muted-foreground">
            Sin filtros. Agregá uno para acotar la lista.
          </p>
        ) : (
          <ul className="space-y-2 pb-2">
            {rows.map((field, i) => (
              <li key={field} className="grid grid-cols-[3.25rem_7.5rem_3rem_1fr_auto] items-center gap-2">
                <span className="text-xs text-muted-foreground">{i === 0 ? "Donde" : "y"}</span>
                <span className="truncate text-sm">{RULE_LABELS[field]}</span>
                <span className="text-xs text-muted-foreground">{RULE_OPERATORS[field]}</span>
                <div className="min-w-0">
                  <RuleValueControl
                    field={field}
                    query={query}
                    categories={categories}
                    cards={cards}
                    onChange={onChange}
                    compact
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar filtro ${RULE_LABELS[field]}`}
                  onClick={() => remove(field)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between border-t pt-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={unused.length === 0}
                className="h-8 gap-1.5 text-muted-foreground"
              >
                <Plus />
                Agregar filtro
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {unused.map((f) => (
                <DropdownMenuItem key={f} onSelect={() => setDrafts((d) => [...d, f])}>
                  {RULE_LABELS[f]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {active.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={() => {
                setDrafts([])
                onChange(Object.assign({}, ...active.map(clearRulePatch)))
              }}
            >
              Borrar filtros
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
