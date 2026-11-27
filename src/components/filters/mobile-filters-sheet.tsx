"use client"

import { useState } from "react"
import { CalendarIcon, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"
import { es } from "date-fns/locale"

import {
  cardLabel,
  CategoryChecklist,
  centsToInputValue,
  CURRENCY_OPTIONS,
  TODAS,
  TODOS,
} from "@/components/filters/filter-shared"
import { rangeFromQuery, rangeToPatch } from "@/components/filters/period-filter-popover"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { toggleCategorySelection } from "@/lib/category-tree"
import { DATE_PRESETS, detectDatePreset, presetRange, shiftPeriod } from "@/lib/date-presets"
import { dateToIso, type IsoDate } from "@/lib/dates"
import { formatAmountInput, parseAmountToCents } from "@/lib/money"
import { naturalDir, type MovementSort } from "@/lib/movement-list-view"
import {
  activeFilterCount,
  CARD_FILTER_CASH,
  hayFiltrosActivos,
  type MovementQuery,
  type QueryCurrency,
} from "@/lib/movement-query"
import type { MovementStatus } from "@/lib/movement-status"
import { cn } from "@/lib/utils"
import type { CardOption } from "@/server/card-queries"
import type { Category } from "@/server/queries"

const LABEL_CLASS = "text-xs font-normal text-muted-foreground"

const STATUS_LABELS: Record<MovementStatus, string> = {
  pending: "Pendientes",
  paid: "Pagados",
  overdue: "Vencidos",
}

const SORT_LABELS: Record<MovementSort, string> = {
  due: "Vencimiento",
  date: "Fecha",
  description: "Descripción",
  category: "Categoría",
  amount: "Importe",
}

export function MobileFiltersSheet({
  query,
  today,
  periodLabel,
  calendarStartMonth,
  calendarEndMonth,
  categories,
  cards,
  showPeriod,
  showStatus,
  showCategory,
  showPaymentMethod,
  showCurrency,
  showSort,
  showAmount,
  onChange,
  onClearAll,
}: {
  query: MovementQuery
  today: IsoDate
  periodLabel: string
  calendarStartMonth: Date
  calendarEndMonth: Date
  categories: Category[]
  cards: CardOption[]
  showPeriod: boolean
  showStatus: boolean
  showCategory: boolean
  showPaymentMethod: boolean
  showCurrency: boolean
  showSort: boolean
  showAmount: boolean
  onChange: (patch: Partial<MovementQuery>) => void
  onClearAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<MovementQuery>(query)
  const [minInput, setMinInput] = useState("")
  const [maxInput, setMaxInput] = useState("")
  const [showCalendar, setShowCalendar] = useState(false)
  const [catSearch, setCatSearch] = useState("")

  const prevShift = shiftPeriod(query.from, query.to, -1)
  const nextShift = shiftPeriod(query.from, query.to, 1)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setDraft(query)
      setMinInput(centsToInputValue(query.minCents))
      setMaxInput(centsToInputValue(query.maxCents))
      setShowCalendar(detectDatePreset(query.from, query.to, today) === "custom")
      setCatSearch("")
    }
  }

  function apply() {
    const minCents = minInput.trim() ? parseAmountToCents(minInput) : null
    const maxCents = maxInput.trim() ? parseAmountToCents(maxInput) : null
    setOpen(false)
    onChange({
      ...draft,
      minCents: minCents !== null && minCents >= 0 ? minCents : null,
      maxCents: maxCents !== null && maxCents >= 0 ? maxCents : null,
    })
  }

  return (
    <div className="flex w-full items-center gap-2 md:hidden">
      {showPeriod && (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 shrink-0"
            aria-label="Período anterior"
            disabled={!prevShift}
            onClick={() => prevShift && onChange(prevShift)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-0 flex-1 justify-start truncate px-2.5 text-xs font-normal"
            onClick={() => handleOpenChange(true)}
          >
            <CalendarIcon className="size-3.5 shrink-0" />
            <span className="truncate">{periodLabel}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 shrink-0"
            aria-label="Período siguiente"
            disabled={!nextShift}
            onClick={() => nextShift && onChange(nextShift)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <Button
          type="button"
          variant="outline"
          className="ml-auto h-10 shrink-0"
          onClick={() => handleOpenChange(true)}
        >
          <SlidersHorizontal />
          Filtros ({activeFilterCount(query)})
        </Button>
        {open && (
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-4">
              {showStatus && (
                <div className="space-y-1.5">
                  <Label className={LABEL_CLASS}>Estado</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["all", "overdue", "pending", "paid"] as const).map((st) => {
                      const active = draft.status === st
                      return (
                        <Button
                          key={st}
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-10 justify-start text-xs",
                            active && "border-mist/40 bg-accent text-paper",
                          )}
                          onClick={() => setDraft((d) => ({ ...d, status: st }))}
                        >
                          {st === "all" ? "Todos" : STATUS_LABELS[st]}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}

              {showPeriod && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className={LABEL_CLASS}>Período</Label>
                    {(draft.from || draft.to) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setDraft((d) => ({ ...d, from: "", to: "", dateField: "date" }))
                          setShowCalendar(false)
                        }}
                      >
                        Quitar fechas
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DATE_PRESETS.map((preset) => {
                      const range = presetRange(preset.id, today)
                      const active = draft.from === range.from && draft.to === range.to
                      return (
                        <Button
                          key={preset.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-8 text-xs",
                            active && "border-mist/40 bg-accent text-paper",
                          )}
                          onClick={() => {
                            setDraft((d) => ({ ...d, ...range }))
                            setShowCalendar(false)
                          }}
                        >
                          {preset.label}
                        </Button>
                      )
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 text-xs",
                        showCalendar && "border-mist/40 bg-accent text-paper",
                      )}
                      onClick={() => setShowCalendar((v) => !v)}
                    >
                      Personalizado
                    </Button>
                  </div>
                  {showCalendar && (
                    <div className="flex justify-center rounded-lg bg-white/[0.03] p-1">
                      <Calendar
                        mode="range"
                        locale={es}
                        captionLayout="dropdown"
                        startMonth={calendarStartMonth}
                        endMonth={calendarEndMonth}
                        defaultMonth={rangeFromQuery(draft)?.from ?? rangeFromQuery(draft)?.to}
                        selected={rangeFromQuery(draft)}
                        onSelect={(range, triggerDate) => {
                          if (!draft.from) {
                            setDraft((d) => ({ ...d, from: dateToIso(triggerDate), to: "" }))
                            return
                          }
                          setDraft((d) => ({ ...d, ...rangeToPatch(range) }))
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {showCategory && (
                <div className="space-y-1.5">
                  <Label className={LABEL_CLASS}>Categoría</Label>
                  <Input
                    value={catSearch}
                    onChange={(e) => setCatSearch(e.target.value)}
                    placeholder="Buscar categoría..."
                    className="h-9"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-lg bg-white/[0.03] p-1.5">
                    <CategoryChecklist
                      categories={categories}
                      selectedIds={draft.categoryIds}
                      searchTerm={catSearch}
                      onToggle={(id) =>
                        setDraft((d) => ({
                          ...d,
                          categoryIds: toggleCategorySelection(d.categoryIds, id, categories),
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              {showPaymentMethod && cards.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="filtro-mobile-tarjeta" className={LABEL_CLASS}>
                    Medio de pago
                  </Label>
                  <Select
                    value={draft.cardId}
                    onValueChange={(v) => setDraft((d) => ({ ...d, cardId: v }))}
                  >
                    <SelectTrigger id="filtro-mobile-tarjeta" className="h-10 w-full">
                      <SelectValue>
                        {draft.cardId === "all" ? TODOS : cardLabel(draft.cardId, cards)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{TODOS}</SelectItem>
                      <SelectItem value={CARD_FILTER_CASH}>Efectivo / débito</SelectItem>
                      {cards
                        .filter((c) => !c.archived || c.id === draft.cardId)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.archived ? `${c.name} (archivada)` : c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(showCurrency || showSort) && (
                <div className="grid grid-cols-2 gap-3">
                  {showCurrency && (
                    <div className="space-y-1.5">
                      <Label htmlFor="filtro-mobile-moneda" className={LABEL_CLASS}>
                        Moneda
                      </Label>
                      <Select
                        value={draft.currency}
                        onValueChange={(v) =>
                          setDraft((d) => ({ ...d, currency: v as QueryCurrency | "all" }))
                        }
                      >
                        <SelectTrigger id="filtro-mobile-moneda" className="h-10 w-full">
                          <SelectValue>
                            {draft.currency === "all" ? TODAS : draft.currency}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option === "all" ? TODAS : option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {showSort && (
                    <div className="space-y-1.5">
                      <Label htmlFor="filtro-mobile-orden" className={LABEL_CLASS}>
                        Orden
                      </Label>
                      <Select
                        value={draft.sort}
                        onValueChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            sort: v as MovementSort,
                            dir: naturalDir(v as MovementSort),
                          }))
                        }
                      >
                        <SelectTrigger id="filtro-mobile-orden" className="h-10 w-full">
                          <SelectValue>{SORT_LABELS[draft.sort]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(["due", "date", "amount", "description", "category"] as const).map(
                            (s) => (
                              <SelectItem key={s} value={s}>
                                {SORT_LABELS[s]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {showAmount && (
                <div className="space-y-1.5">
                  <Label className={LABEL_CLASS}>Importe</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      aria-label="Importe mínimo"
                      inputMode="decimal"
                      placeholder="Mínimo"
                      value={minInput}
                      onChange={(e) =>
                        setMinInput((prev) => formatAmountInput(e.target.value, prev))
                      }
                      className="h-10 tabular-nums"
                    />
                    <Input
                      aria-label="Importe máximo"
                      inputMode="decimal"
                      placeholder="Máximo"
                      value={maxInput}
                      onChange={(e) =>
                        setMaxInput((prev) => formatAmountInput(e.target.value, prev))
                      }
                      className="h-10 tabular-nums"
                    />
                  </div>
                </div>
              )}
            </div>
            <SheetFooter className="flex-row justify-end border-t">
              {(hayFiltrosActivos(query) || hayFiltrosActivos(draft)) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10"
                  onClick={() => {
                    onClearAll()
                    setOpen(false)
                  }}
                >
                  Limpiar todo
                </Button>
              )}
              <Button type="button" className="h-10" onClick={apply}>
                Aplicar
              </Button>
            </SheetFooter>
          </SheetContent>
        )}
      </Sheet>
    </div>
  )
}
