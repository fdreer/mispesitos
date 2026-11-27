"use client"

import { useState } from "react"
import { ChevronDown, CreditCard } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import {
  cardLabel,
  CategoryChecklist,
  categoryChipText,
  centsToInputValue,
  formatAmountRangeLabel,
} from "@/components/filters/filter-shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { categoryLabels, toggleCategorySelection } from "@/lib/category-tree"
import { formatAmountInput, parseAmountToCents } from "@/lib/money"
import {
  CARD_FILTER_CASH,
  CURRENCY_VALUES,
  type MovementQuery,
  type QueryCurrency,
} from "@/lib/movement-query"
import { cn } from "@/lib/utils"
import type { CardOption } from "@/server/card-queries"
import type { Category } from "@/server/queries"

/** Campos que se filtran como reglas del panel "Filtrar" (estilo ClickUp). */
export type RuleField = "category" | "paymentMethod" | "currency" | "amount"

export const RULE_FIELDS: readonly RuleField[] = ["category", "paymentMethod", "currency", "amount"]

export const RULE_LABELS: Record<RuleField, string> = {
  category: "Categoría",
  paymentMethod: "Medio de pago",
  currency: "Moneda",
  amount: "Importe",
}

export const RULE_OPERATORS: Record<RuleField, string> = {
  category: "es",
  paymentMethod: "es",
  currency: "es",
  amount: "entre",
}

export function isRuleActive(field: RuleField, query: MovementQuery): boolean {
  switch (field) {
    case "category":
      return query.categoryIds.length > 0
    case "paymentMethod":
      return query.cardId !== "all"
    case "currency":
      return query.currency !== "all"
    case "amount":
      return query.minCents !== null || query.maxCents !== null
  }
}

export function clearRulePatch(field: RuleField): Partial<MovementQuery> {
  switch (field) {
    case "category":
      return { categoryIds: [] }
    case "paymentMethod":
      return { cardId: "all" }
    case "currency":
      return { currency: "all" }
    case "amount":
      return { minCents: null, maxCents: null }
  }
}

/** El valor de la regla tal como va en el chip: "Comida +2", "Visa", "USD"… */
export function ruleValueText(
  field: RuleField,
  query: MovementQuery,
  categories: Category[],
  cards: CardOption[],
): string {
  switch (field) {
    case "category":
      return categoryChipText(query.categoryIds, categories)
    case "paymentMethod":
      return query.cardId === "all" ? "Todos" : cardLabel(query.cardId, cards)
    case "currency":
      return query.currency === "all" ? "Todas" : query.currency
    case "amount":
      return formatAmountRangeLabel(query.minCents, query.maxCents)
  }
}

type EditorProps = {
  field: RuleField
  query: MovementQuery
  categories: Category[]
  cards: CardOption[]
  onChange: (patch: Partial<MovementQuery>) => void
  /** En una fila del panel: un disparador compacto. En un chip: el editor a la vista. */
  compact?: boolean
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60",
        active && "bg-accent text-paper",
      )}
    >
      {children}
    </button>
  )
}

function CategoryEditor({ query, categories, onChange }: EditorProps) {
  const [search, setSearch] = useState("")
  return (
    <div className="w-72">
      <Input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar categoría..."
        aria-label="Buscar categoría"
        className="mb-2 h-8"
      />
      <div className="max-h-64 overflow-y-auto">
        <CategoryChecklist
          categories={categories}
          selectedIds={query.categoryIds}
          searchTerm={search}
          onToggle={(id) =>
            onChange({ categoryIds: toggleCategorySelection(query.categoryIds, id, categories) })
          }
        />
      </div>
    </div>
  )
}

function PaymentEditor({ query, cards, onChange }: EditorProps) {
  const options = cards.filter((c) => !c.archived || c.id === query.cardId)
  return (
    <div role="listbox" aria-label="Medio de pago" className="w-56 space-y-0.5">
      <OptionButton active={query.cardId === CARD_FILTER_CASH} onClick={() => onChange({ cardId: CARD_FILTER_CASH })}>
        Efectivo / débito
      </OptionButton>
      {options.map((c) => (
        <OptionButton key={c.id} active={query.cardId === c.id} onClick={() => onChange({ cardId: c.id })}>
          <CreditCard className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{c.archived ? `${c.name} (archivada)` : c.name}</span>
        </OptionButton>
      ))}
    </div>
  )
}

function CurrencyEditor({ query, onChange }: EditorProps) {
  return (
    <div role="listbox" aria-label="Moneda" className="w-40 space-y-0.5">
      {CURRENCY_VALUES.map((c) => (
        <OptionButton
          key={c}
          active={query.currency === c}
          onClick={() => onChange({ currency: c as QueryCurrency })}
        >
          {c}
        </OptionButton>
      ))}
    </div>
  )
}

function AmountEditor({ query, onChange }: EditorProps) {
  const [min, setMin] = useState(() => centsToInputValue(query.minCents))
  const [max, setMax] = useState(() => centsToInputValue(query.maxCents))

  function apply(e?: React.FormEvent) {
    e?.preventDefault()
    const minCents = min.trim() ? parseAmountToCents(min) : null
    const maxCents = max.trim() ? parseAmountToCents(max) : null
    const next = {
      minCents: minCents !== null && minCents >= 0 ? minCents : null,
      maxCents: maxCents !== null && maxCents >= 0 ? maxCents : null,
    }
    if (next.minCents === query.minCents && next.maxCents === query.maxCents) return
    onChange(next)
  }

  return (
    <form onSubmit={apply} className="flex w-60 items-center gap-1.5">
      <Input
        aria-label="Importe mínimo"
        inputMode="decimal"
        placeholder="Mín."
        value={min}
        onChange={(e) => setMin((prev) => formatAmountInput(e.target.value, prev))}
        onBlur={() => apply()}
        className="h-8 tabular-nums"
      />
      <span className="text-muted-foreground text-xs">y</span>
      <Input
        aria-label="Importe máximo"
        inputMode="decimal"
        placeholder="Máx."
        value={max}
        onChange={(e) => setMax((prev) => formatAmountInput(e.target.value, prev))}
        onBlur={() => apply()}
        className="h-8 tabular-nums"
      />
      <button type="submit" hidden />
    </form>
  )
}

const EDITORS: Record<RuleField, (p: EditorProps) => React.ReactNode> = {
  category: CategoryEditor,
  paymentMethod: PaymentEditor,
  currency: CurrencyEditor,
  amount: AmountEditor,
}

/** El editor del valor de una regla, a la vista (adentro de un chip). */
export function RuleValueEditor(props: EditorProps) {
  const Editor = EDITORS[props.field]
  return <Editor {...props} />
}

/**
 * El valor de una regla en una fila del panel: un botón que abre su editor.
 * El importe va en línea porque son dos campos chicos.
 */
export function RuleValueControl(props: EditorProps) {
  const { field, query, categories, cards } = props
  const [open, setOpen] = useState(false)
  if (field === "amount") return <AmountEditor {...props} />

  const active = isRuleActive(field, query)
  const labels = categoryLabels(categories)
  const single =
    field === "category" && query.categoryIds.length === 1
      ? labels.get(query.categoryIds[0])
      : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${RULE_LABELS[field]}: ${ruleValueText(field, query, categories, cards)}`}
          className={cn("h-8 w-full justify-between font-normal", !active && "text-muted-foreground")}
        >
          <span className="truncate">
            {single ? (
              <CategoryBadge {...single} />
            ) : active ? (
              ruleValueText(field, query, categories, cards)
            ) : (
              "Elegí…"
            )}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <RuleValueEditor
          {...props}
          onChange={(patch) => {
            props.onChange(patch)
            if (field !== "category") setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
