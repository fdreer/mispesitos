"use client"

import { useMemo, useState } from "react"
import { ChevronDown, CreditCard, SearchIcon, XIcon } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import { AmountFilterPopover } from "@/components/filters/amount-filter-popover"
import { FilterChips } from "@/components/filters/filter-chips"
import { FilterPanel } from "@/components/filters/filter-panel"
import { RULE_FIELDS } from "@/components/filters/filter-rules"
import {
  cardLabel,
  CategoryChecklist,
  categorySummaryText,
  CURRENCY_OPTIONS,
  formatAmountRangeLabel,
  TODAS,
  TODOS,
} from "@/components/filters/filter-shared"
import { MobileFiltersSheet } from "@/components/filters/mobile-filters-sheet"
import { PeriodFilterPopover } from "@/components/filters/period-filter-popover"
import { useMovementFiltersNavigation } from "@/components/filters/use-movement-filters-navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { categoryLabels, toggleCategorySelection } from "@/lib/category-tree"
import { formatPeriodLabel } from "@/lib/date-presets"
import type { IsoDate } from "@/lib/dates"
import type { MovementSort } from "@/lib/movement-list-view"
import {
  CARD_FILTER_CASH,
  hayFiltrosActivos,
  SEARCH_MAX,
  type MovementQuery,
  type QueryCurrency,
} from "@/lib/movement-query"
import type { MovementStatus } from "@/lib/movement-status"
import { cn } from "@/lib/utils"
import type { CardOption } from "@/server/card-queries"
import type { Category } from "@/server/queries"

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

const LABEL_CLASS = "text-xs font-normal text-muted-foreground"
const BAR_CLASS = "flex flex-wrap items-end gap-x-2 gap-y-3"
const CALENDAR_YEARS_MARGIN = 10

type Props = {
  /** Ruta de la pantalla actual ("/ingresos", "/egresos" o "/informes"), sin query. */
  basePath: string
  query: MovementQuery
  /** Orden por defecto de esta pantalla ("due" en egresos, "date" en ingresos). */
  defaultSort?: MovementSort
  /** Hoy según el reloj de Buenos Aires, calculado en el servidor. */
  today: IsoDate
  categories: Category[]
  cards?: CardOption[]
  /** Si mostrar el filtro de medio de pago / tarjeta. Por defecto true si hay tarjetas. */
  showPaymentMethod?: boolean
  /** Si mostrar el selector de orden. Por defecto true (false en Informes). */
  showSort?: boolean
  /** Si mostrar el estado en la hoja móvil. Por defecto true (false en Informes). */
  showStatus?: boolean
  /** Si mostrar el selector de moneda. Por defecto true (Informes tiene el propio). */
  showCurrency?: boolean
  /** Si mostrar el buscador. Por defecto true. */
  showSearch?: boolean
  /** Si mostrar el filtro de categoría. Por defecto true (false en Flujo de caja). */
  showCategory?: boolean
  /** Si mostrar el rango de importe. Por defecto true (false en Flujo de caja). */
  showAmount?: boolean
  /** Si mostrar el selector de período. Por defecto true (false en Flujo semanal). */
  showPeriod?: boolean
  /** Etiqueta del botón de período cuando no hay rango explícito en la URL. */
  periodPlaceholder?: string
  /** Parámetros extra de la URL (p. ej. tab y moneda en /informes) a conservar al filtrar. */
  extraParams?: Record<string, string | undefined>
  /**
   * "classic": un control por filtro (Informes). "toolbar": estilo ClickUp, con
   * Buscar y Período a la vista y el resto en el panel "Filtrar" y sus chips.
   */
  layout?: "classic" | "toolbar"
  /** Lo que va a la derecha de la barra "toolbar" en escritorio (Columnas, Nuevo). */
  trailing?: React.ReactNode
  /** Acción principal junto al buscador en móvil (p. ej. botón Nuevo). */
  mobileAction?: React.ReactNode
}

/**
 * Barra de filtros unificada (§4 del plan v2): comparte el mismo modelo URL
 * para /ingresos, /egresos y /informes.
 */
export function MovementFilters({
  basePath,
  query,
  defaultSort = "date",
  today,
  categories,
  cards = [],
  showPaymentMethod = cards.length > 0,
  showSort = true,
  showStatus = true,
  showCurrency = true,
  showSearch = true,
  showCategory = true,
  showAmount = true,
  showPeriod = true,
  periodPlaceholder = "Elegir un período",
  extraParams,
  layout = "classic",
  trailing,
  mobileAction,
}: Props) {
  const isToolbar = layout === "toolbar"
  const { search, setSearch, pending, go, handleSearchChange, limpiar } =
    useMovementFiltersNavigation({ basePath, query, defaultSort, extraParams })
  const [categorySearch, setCategorySearch] = useState("")

  // El rango del calendario sale de `today` (lo manda el servidor) y no del
  // reloj al cargar el módulo: un proceso que pasa de un año al otro sin
  // reiniciar dejaba el rango congelado y distinto del que calcula el cliente.
  const calendarYear = Number(today.slice(0, 4))
  const calendarStartMonth = useMemo(
    () => new Date(calendarYear - CALENDAR_YEARS_MARGIN, 0, 1),
    [calendarYear],
  )
  const calendarEndMonth = useMemo(
    () => new Date(calendarYear + CALENDAR_YEARS_MARGIN, 11, 1),
    [calendarYear],
  )

  const periodLabel =
    !query.from && !query.to
      ? periodPlaceholder
      : formatPeriodLabel(query.from, query.to, today)
  const labels = categoryLabels(categories)
  const catSummary = categorySummaryText(query.categoryIds, categories)
  const amountLabel = formatAmountRangeLabel(query.minCents, query.maxCents)
  const cardOptions = cards.filter((c) => !c.archived || c.id === query.cardId)

  const chips: {
    key: string
    label: string
    patch: Partial<MovementQuery>
    clearSearch?: boolean
  }[] = []
  if (showSearch && query.search) {
    chips.push({
      key: "search",
      label: `Buscar: "${query.search}"`,
      patch: { search: "" },
      clearSearch: true,
    })
  }
  if (showCategory) {
    for (const catId of query.categoryIds) {
      const cat = labels.get(catId)
      const name = cat ? (cat.parentName ? `${cat.parentName} › ${cat.name}` : cat.name) : catId
      chips.push({
        key: `cat-${catId}`,
        label: `Categoría: ${name}`,
        patch: { categoryIds: query.categoryIds.filter((id) => id !== catId) },
      })
    }
  }
  if (showPaymentMethod && query.cardId !== "all") {
    chips.push({
      key: "card",
      label:
        query.cardId === CARD_FILTER_CASH
          ? "Medio: Efectivo / débito"
          : `Tarjeta: ${cardLabel(query.cardId, cards)}`,
      patch: { cardId: "all" },
    })
  }
  if (showCurrency && query.currency !== "all") {
    chips.push({
      key: "currency",
      label: `Moneda: ${query.currency}`,
      patch: { currency: "all" },
    })
  }
  if (showAmount && (query.minCents !== null || query.maxCents !== null)) {
    chips.push({
      key: "amount",
      label: `Importe: ${amountLabel}`,
      patch: { minCents: null, maxCents: null },
    })
  }
  if (showPeriod && (query.from || query.to)) {
    chips.push({
      key: "period",
      label:
        query.dateField === "paid"
          ? `Pagado: ${periodLabel}`
          : `Período: ${periodLabel}`,
      patch: { from: "", to: "", dateField: "date" },
    })
  }
  if (showStatus && query.status !== "all") {
    chips.push({
      key: "status",
      label: `Estado: ${STATUS_LABELS[query.status]}`,
      patch: { status: "all" },
    })
  }

  const ruleFields = RULE_FIELDS.filter((f) =>
    f === "category"
      ? showCategory
      : f === "paymentMethod"
        ? showPaymentMethod && cards.length > 0
        : f === "currency"
          ? showCurrency
          : showAmount,
  )

  const showMobileRow =
    showPeriod ||
    showCategory ||
    showAmount ||
    (showPaymentMethod && cards.length > 0) ||
    showCurrency ||
    showSort ||
    showStatus

  return (
    <div className="space-y-2.5">
      <div
        className={cn(
          isToolbar ? "flex flex-wrap items-center gap-2" : BAR_CLASS,
          "transition-opacity",
          pending && "opacity-60",
        )}
        aria-busy={pending}
      >
        {showSearch && (
          <div
            className={cn(
              "flex w-full items-center gap-2",
              isToolbar ? "md:w-56" : "sm:w-52 md:w-52",
            )}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="filtro-buscar" className={cn(LABEL_CLASS, isToolbar && "sr-only")}>
                Buscar
              </Label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="filtro-buscar"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Texto, categoría o $"
                  maxLength={SEARCH_MAX}
                  className="h-10 pl-8 md:h-8"
                />
              </div>
            </div>
            {isToolbar && mobileAction && (
              <div className="shrink-0 md:hidden">{mobileAction}</div>
            )}
          </div>
        )}

        {showMobileRow && (
          <MobileFiltersSheet
            query={query}
            today={today}
            periodLabel={periodLabel}
            calendarStartMonth={calendarStartMonth}
            calendarEndMonth={calendarEndMonth}
            categories={categories}
            cards={cards}
            showPeriod={showPeriod}
            showStatus={showStatus}
            showCategory={showCategory}
            showPaymentMethod={showPaymentMethod}
            showCurrency={showCurrency}
            showSort={showSort}
            showAmount={showAmount}
            onChange={go}
            onClearAll={limpiar}
          />
        )}

        {/* Barra clásica (Informes): un control por filtro. La barra "toolbar"
            de Ingresos/Egresos los agrupa en el panel "Filtrar". */}
        {!isToolbar && (
          <>
            {showCategory && (
              <div className="hidden w-40 space-y-1.5 md:block">
                <Label
                  id="filtro-categoria-label"
                  htmlFor="filtro-categoria"
                  className={LABEL_CLASS}
                >
                  Categoría
                </Label>
                <Popover
                  onOpenChange={(open) => {
                    if (!open) setCategorySearch("")
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      id="filtro-categoria"
                      type="button"
                      variant="outline"
                      aria-label={`Categoría: ${catSummary}`}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {query.categoryIds.length === 0 ? (
                          TODAS
                        ) : query.categoryIds.length === 1 && labels.get(query.categoryIds[0]) ? (
                          <CategoryBadge {...labels.get(query.categoryIds[0])!} />
                        ) : (
                          catSummary
                        )}
                      </span>
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className={cn("w-72 p-2.5", pending && "opacity-60")}
                    aria-labelledby="filtro-categoria-label"
                    align="start"
                  >
                    <Input
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      placeholder="Buscar categoría..."
                      aria-label="Buscar categoría"
                      className="mb-2 h-8"
                    />
                    <div className="max-h-64 overflow-y-auto">
                      <CategoryChecklist
                        categories={categories}
                        selectedIds={query.categoryIds}
                        searchTerm={categorySearch}
                        onToggle={(id) =>
                          go({
                            categoryIds: toggleCategorySelection(query.categoryIds, id, categories),
                          })
                        }
                      />
                    </div>
                    {query.categoryIds.length > 0 && (
                      <div className="mt-2 flex justify-end border-t pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => go({ categoryIds: [] })}
                        >
                          Limpiar selección
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {showPaymentMethod && cards.length > 0 && (
              <div className="hidden w-36 space-y-1.5 md:block">
                <Label htmlFor="filtro-tarjeta" className={LABEL_CLASS}>
                  Medio de pago
                </Label>
                <div>
                  <Select value={query.cardId} onValueChange={(v) => go({ cardId: v })}>
                    <SelectTrigger id="filtro-tarjeta" className="w-full">
                      <SelectValue>
                        {query.cardId === "all" ? (
                          TODOS
                        ) : (
                          <span className="inline-flex items-center gap-1.5 truncate">
                            {query.cardId !== CARD_FILTER_CASH && (
                              <CreditCard className="size-3.5 shrink-0" aria-hidden />
                            )}
                            <span className="truncate">{cardLabel(query.cardId, cards)}</span>
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{TODOS}</SelectItem>
                      <SelectItem value={CARD_FILTER_CASH}>Efectivo / débito</SelectItem>
                      {cardOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.archived ? `${c.name} (archivada)` : c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {showCurrency && (
              <div className="hidden w-24 space-y-1.5 md:block">
                <Label htmlFor="filtro-moneda" className={LABEL_CLASS}>
                  Moneda
                </Label>
                <div>
                  <Select
                    value={query.currency}
                    onValueChange={(v) => go({ currency: v as QueryCurrency | "all" })}
                  >
                    <SelectTrigger id="filtro-moneda" className="w-full">
                      <SelectValue>
                        {query.currency === "all" ? TODAS : query.currency}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o === "all" ? TODAS : o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {showAmount && (
              <AmountFilterPopover
                minCents={query.minCents}
                maxCents={query.maxCents}
                onChange={go}
              />
            )}
          </>
        )}

        {showPeriod && (
          <PeriodFilterPopover
            from={query.from}
            to={query.to}
            today={today}
            periodLabel={periodLabel}
            calendarStartMonth={calendarStartMonth}
            calendarEndMonth={calendarEndMonth}
            isToolbar={isToolbar}
            pending={pending}
            onChange={go}
          />
        )}

        {isToolbar && ruleFields.length > 0 && (
          <div className="hidden md:block">
            <FilterPanel
              fields={ruleFields}
              query={query}
              categories={categories}
              cards={cards}
              onChange={go}
              pending={pending}
            />
          </div>
        )}

        {isToolbar && trailing && (
          <div className="hidden items-center gap-1.5 md:ml-auto md:flex">{trailing}</div>
        )}

        {showSort && !isToolbar && (
          <div className="hidden w-32 space-y-1.5 md:block">
            <Label htmlFor="filtro-orden" className={LABEL_CLASS}>
              Orden
            </Label>
            <div>
              <Select value={query.sort} onValueChange={(v) => go({ sort: v as MovementSort })}>
                <SelectTrigger id="filtro-orden" className="w-full">
                  <SelectValue>{SORT_LABELS[query.sort]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["due", "date", "amount"] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SORT_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {isToolbar ? (
        <FilterChips
          fields={ruleFields}
          query={query}
          categories={categories}
          cards={cards}
          onChange={go}
          onClearAll={limpiar}
          showClearAll={hayFiltrosActivos(query)}
        />
      ) : (
        chips.length > 0 && (
          <div aria-label="Filtros activos" className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-white/[0.06] pr-1.5 pl-2.5 text-xs text-foreground"
              >
                <span>{chip.label}</span>
                <button
                  type="button"
                  aria-label={`Quitar filtro ${chip.label}`}
                  onClick={() => {
                    if (chip.clearSearch) setSearch("")
                    go(chip.patch)
                  }}
                  className="inline-flex size-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-paper"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={limpiar}
              className="text-muted-foreground"
            >
              Limpiar todo
            </Button>
          </div>
        )
      )}
    </div>
  )
}

export function MovementFiltersSkeleton({
  showPaymentMethod = false,
  showSort = true,
  showCurrency = true,
  showSearch = true,
  showCategory = true,
  showAmount = true,
  showPeriod = true,
  layout = "classic",
}: {
  showPaymentMethod?: boolean
  showSort?: boolean
  showCurrency?: boolean
  showSearch?: boolean
  showCategory?: boolean
  showAmount?: boolean
  showPeriod?: boolean
  layout?: "classic" | "toolbar"
}) {
  if (layout === "toolbar") {
    return (
      <div className="flex flex-wrap items-center gap-2" aria-hidden>
        <div className="h-10 w-full animate-pulse rounded-lg bg-white/[0.03] md:h-8 md:w-56" />
        <div className="hidden h-8 w-[248px] animate-pulse rounded-lg bg-white/[0.03] md:block" />
        <div className="hidden h-8 w-20 animate-pulse rounded-lg bg-white/[0.03] md:block" />
        <div className="hidden h-8 w-48 animate-pulse rounded-lg bg-white/[0.03] md:ml-auto md:block" />
      </div>
    )
  }
  const fields: { label: string; width: string }[] = []
  if (showSearch) fields.push({ label: "Buscar", width: "w-full sm:w-52" })
  if (showCategory) fields.push({ label: "Categoría", width: "hidden w-40 md:block" })
  if (showPaymentMethod) fields.push({ label: "Medio de pago", width: "hidden w-36 md:block" })
  if (showCurrency) fields.push({ label: "Moneda", width: "hidden w-24 md:block" })
  if (showAmount) fields.push({ label: "Importe", width: "hidden w-32 md:block" })
  if (showPeriod) fields.push({ label: "Período", width: "hidden w-[248px] md:block" })
  if (showSort) fields.push({ label: "Orden", width: "hidden w-32 md:block" })

  return (
    <div className={BAR_CLASS} aria-hidden>
      {fields.map((f) => (
        <div key={f.label} className={cn(f.width, "space-y-1.5")}>
          <Label className={LABEL_CLASS}>{f.label}</Label>
          <div className="h-8 w-full animate-pulse rounded-lg bg-white/[0.03]" />
        </div>
      ))}
    </div>
  )
}
