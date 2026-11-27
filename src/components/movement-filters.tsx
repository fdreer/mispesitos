"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  SearchIcon,
  SlidersHorizontal,
  XIcon,
} from "lucide-react"
import { es } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

import { CategoryBadge } from "@/components/category-badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  buildCategoryTree,
  categoryCheckState,
  categoryLabels,
  normalizeSearch,
  toggleCategorySelection,
} from "@/lib/category-tree"
import {
  DATE_PRESETS,
  detectDatePreset,
  formatPeriodLabel,
  presetRange,
  shiftPeriod,
} from "@/lib/date-presets"
import { dateToIso, isoToDate, type IsoDate } from "@/lib/dates"
import { formatAmountInput, formatMoney, parseAmountToCents } from "@/lib/money"
import type { MovementSort } from "@/lib/movement-list-view"
import {
  activeFilterCount,
  buildMovementHref,
  CARD_FILTER_CASH,
  CURRENCY_VALUES,
  FILTER_DEFAULTS,
  hayFiltrosActivos,
  parseMovementQuery,
  rawParamsFromSearchParams,
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
  amount: "Importe",
}

const CURRENCY_OPTIONS: (QueryCurrency | "all")[] = ["all", ...CURRENCY_VALUES]

const LABEL_CLASS = "text-xs font-normal text-muted-foreground"
const BAR_CLASS = "flex flex-wrap items-end gap-x-2 gap-y-3"

const DEBOUNCE_MS = 400

const CALENDAR_YEARS_MARGIN = 10
const CALENDAR_START_MONTH = new Date(new Date().getFullYear() - CALENDAR_YEARS_MARGIN, 0, 1)
const CALENDAR_END_MONTH = new Date(new Date().getFullYear() + CALENDAR_YEARS_MARGIN, 11, 1)

const TODAS = <span className="text-muted-foreground">Todas</span>
const TODOS = <span className="text-muted-foreground">Todos</span>

function centsToInputValue(cents: number | null): string {
  if (cents === null) return ""
  return formatAmountInput((cents / 100).toFixed(2).replace(".", ","))
}

function formatAmountRangeLabel(minCents: number | null, maxCents: number | null): string {
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

function rangeFromQuery(query: Pick<MovementQuery, "from" | "to">): DateRange | undefined {
  return query.from || query.to
    ? {
        from: query.from ? isoToDate(query.from) : undefined,
        to: query.to ? isoToDate(query.to) : undefined,
      }
    : undefined
}

function rangeToPatch(range: DateRange | undefined): Pick<MovementQuery, "from" | "to"> {
  return {
    from: range?.from ? dateToIso(range.from) : "",
    to: range?.to ? dateToIso(range.to) : "",
  }
}

function hrefToQuery(href: string, defaultSort: MovementSort): MovementQuery {
  const qs = href.split("?")[1] ?? ""
  return parseMovementQuery(rawParamsFromSearchParams(new URLSearchParams(qs)), defaultSort)
}

function cardLabel(cardId: string, cards: CardOption[]): string {
  if (cardId === CARD_FILTER_CASH) return "Efectivo / débito"
  const found = cards.find((c) => c.id === cardId)
  if (!found) return cardId
  return found.archived ? `${found.name} (archivada)` : found.name
}

function categorySummaryText(categoryIds: string[], categories: Category[]): string {
  if (categoryIds.length === 0) return "Todas"
  if (categoryIds.length === 1) {
    const label = categoryLabels(categories).get(categoryIds[0])
    if (!label) return "1 categoría"
    return label.parentName ? `${label.parentName} › ${label.name}` : label.name
  }
  return `${categoryIds.length} categorías`
}

/** Árbol de categorías con checkboxes para multiselección (§4). */
function CategoryChecklist({
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
}: Props) {
  const { push } = useRouter()
  const [search, setSearch] = useState(query.search)
  const [lastQuerySearch, setLastQuerySearch] = useState(query.search)
  if (query.search !== lastQuerySearch) {
    setLastQuerySearch(query.search)
    setSearch(query.search)
  }

  const [pending, startTransition] = useTransition()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobileDraft, setMobileDraft] = useState<MovementQuery>(query)
  const [mobileMinInput, setMobileMinInput] = useState("")
  const [mobileMaxInput, setMobileMaxInput] = useState("")
  const [mobileShowCalendar, setMobileShowCalendar] = useState(false)
  const [mobileCatSearch, setMobileCatSearch] = useState("")

  const [categorySearch, setCategorySearch] = useState("")
  const [amountOpen, setAmountOpen] = useState(false)
  const [minInput, setMinInput] = useState("")
  const [maxInput, setMaxInput] = useState("")

  const [draft, setDraft] = useState<DateRange | undefined>(undefined)
  const [periodoAbierto, setPeriodoAbierto] = useState(false)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queryRef = useRef(query)

  useEffect(() => {
    if (
      periodoAbierto &&
      (query.from !== queryRef.current.from || query.to !== queryRef.current.to)
    ) {
      setDraft(rangeFromQuery(query))
    }
    queryRef.current = query
  }, [query, periodoAbierto])

  useEffect(() => () => clearTimeout(searchTimeout.current), [])

  function pushHref(href: string) {
    queryRef.current = hrefToQuery(href, defaultSort)
    startTransition(() => {
      push(href)
    })
  }

  function go(patch: Partial<MovementQuery>) {
    clearTimeout(searchTimeout.current)
    const href = buildMovementHref(
      basePath,
      queryRef.current,
      patch,
      defaultSort,
      extraParams,
    )
    pushHref(href)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      const href = buildMovementHref(
        basePath,
        queryRef.current,
        { search: value },
        defaultSort,
        extraParams,
      )
      pushHref(href)
    }, DEBOUNCE_MS)
  }

  function limpiar() {
    clearTimeout(searchTimeout.current)
    setSearch("")
    const emptyHref = buildMovementHref(
      basePath,
      queryRef.current,
      { ...FILTER_DEFAULTS, page: 1 },
      defaultSort,
      extraParams,
    )
    pushHref(emptyHref)
  }

  function handleCalendarSelect(range: DateRange | undefined, triggerDate: Date) {
    if (!draft?.from) {
      setDraft({ from: triggerDate, to: undefined })
      return
    }
    setDraft(range)
  }

  function handlePeriodoOpenChange(open: boolean) {
    setPeriodoAbierto(open)
    if (open) {
      setDraft(rangeFromQuery(query))
      return
    }
    const patch = rangeToPatch(draft)
    setDraft(undefined)
    if (patch.from === queryRef.current.from && patch.to === queryRef.current.to) return
    go(patch)
  }

  function handlePresetClick(presetId: (typeof DATE_PRESETS)[number]["id"]) {
    const range = presetRange(presetId, today)
    setDraft(undefined)
    setPeriodoAbierto(false)
    go(range)
  }

  function handleAmountOpenChange(open: boolean) {
    setAmountOpen(open)
    if (open) {
      setMinInput(centsToInputValue(query.minCents))
      setMaxInput(centsToInputValue(query.maxCents))
    }
  }

  function applyAmountPopover(e?: React.FormEvent) {
    e?.preventDefault()
    const minCents = minInput.trim() ? parseAmountToCents(minInput) : null
    const maxCents = maxInput.trim() ? parseAmountToCents(maxInput) : null
    setAmountOpen(false)
    go({
      minCents: minCents !== null && minCents >= 0 ? minCents : null,
      maxCents: maxCents !== null && maxCents >= 0 ? maxCents : null,
    })
  }

  function handleMobileSheetOpenChange(open: boolean) {
    setMobileFiltersOpen(open)
    if (open) {
      const current = queryRef.current
      setMobileDraft(current)
      setMobileMinInput(centsToInputValue(current.minCents))
      setMobileMaxInput(centsToInputValue(current.maxCents))
      setMobileShowCalendar(detectDatePreset(current.from, current.to, today) === "custom")
      setMobileCatSearch("")
    }
  }

  function applyMobileSheet() {
    const minCents = mobileMinInput.trim() ? parseAmountToCents(mobileMinInput) : null
    const maxCents = mobileMaxInput.trim() ? parseAmountToCents(mobileMaxInput) : null
    setMobileFiltersOpen(false)
    go({
      ...mobileDraft,
      minCents: minCents !== null && minCents >= 0 ? minCents : null,
      maxCents: maxCents !== null && maxCents >= 0 ? maxCents : null,
    })
  }

  const prevShift = shiftPeriod(query.from, query.to, -1)
  const nextShift = shiftPeriod(query.from, query.to, 1)
  const activePreset = detectDatePreset(query.from, query.to, today)
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
        className={cn(BAR_CLASS, "transition-opacity", pending && "opacity-60")}
        aria-busy={pending}
      >
        {showSearch && (
          <div className="w-full space-y-1.5 sm:w-52 md:w-52">
            <Label htmlFor="filtro-buscar" className={LABEL_CLASS}>
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
        )}

        {/* Fila móvil: botón de Filtros (n) con hoja inferior y botón Aplicar (§4). */}
        {showMobileRow && (
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
              onClick={() => prevShift && go(prevShift)}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 min-w-0 flex-1 justify-start truncate px-2.5 text-xs font-normal"
              onClick={() => handleMobileSheetOpenChange(true)}
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
              onClick={() => nextShift && go(nextShift)}
            >
              <ChevronRight />
            </Button>
          </div>
          )}

          <Sheet open={mobileFiltersOpen} onOpenChange={handleMobileSheetOpenChange}>
            <Button
              type="button"
              variant="outline"
              className="ml-auto h-10 shrink-0"
              onClick={() => handleMobileSheetOpenChange(true)}
            >
              <SlidersHorizontal />
              Filtros ({activeFilterCount(query)})
            </Button>
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
                        const active = mobileDraft.status === st
                        return (
                          <Button
                            key={st}
                            type="button"
                            variant="outline"
                            className={cn(
                              "h-10 justify-start text-xs",
                              active && "border-mist/40 bg-accent text-paper",
                            )}
                            onClick={() => setMobileDraft((d) => ({ ...d, status: st }))}
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
                    {(mobileDraft.from || mobileDraft.to) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setMobileDraft((d) => ({ ...d, from: "", to: "", dateField: "date" }))
                          setMobileShowCalendar(false)
                        }}
                      >
                        Quitar fechas
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DATE_PRESETS.map((preset) => {
                      const range = presetRange(preset.id, today)
                      const active =
                        mobileDraft.from === range.from && mobileDraft.to === range.to
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
                            setMobileDraft((d) => ({ ...d, ...range }))
                            setMobileShowCalendar(false)
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
                        mobileShowCalendar && "border-mist/40 bg-accent text-paper",
                      )}
                      onClick={() => setMobileShowCalendar((v) => !v)}
                    >
                      Personalizado
                    </Button>
                  </div>
                  {mobileShowCalendar && (
                    <div className="flex justify-center rounded-lg bg-white/[0.03] p-1">
                      <Calendar
                        mode="range"
                        locale={es}
                        captionLayout="dropdown"
                        startMonth={CALENDAR_START_MONTH}
                        endMonth={CALENDAR_END_MONTH}
                        defaultMonth={
                          rangeFromQuery(mobileDraft)?.from ?? rangeFromQuery(mobileDraft)?.to
                        }
                        selected={rangeFromQuery(mobileDraft)}
                        onSelect={(range, triggerDate) => {
                          if (!mobileDraft.from) {
                            setMobileDraft((d) => ({ ...d, from: dateToIso(triggerDate), to: "" }))
                            return
                          }
                          setMobileDraft((d) => ({ ...d, ...rangeToPatch(range) }))
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
                    value={mobileCatSearch}
                    onChange={(e) => setMobileCatSearch(e.target.value)}
                    placeholder="Buscar categoría..."
                    className="h-9"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-lg bg-white/[0.03] p-1.5">
                    <CategoryChecklist
                      categories={categories}
                      selectedIds={mobileDraft.categoryIds}
                      searchTerm={mobileCatSearch}
                      onToggle={(id) =>
                        setMobileDraft((d) => ({
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
                      value={mobileDraft.cardId}
                      onValueChange={(v) => setMobileDraft((d) => ({ ...d, cardId: v }))}
                    >
                      <SelectTrigger id="filtro-mobile-tarjeta" className="h-10 w-full">
                        <SelectValue>
                          {mobileDraft.cardId === "all"
                            ? TODOS
                            : cardLabel(mobileDraft.cardId, cards)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{TODOS}</SelectItem>
                        <SelectItem value={CARD_FILTER_CASH}>Efectivo / débito</SelectItem>
                        {cards
                          .filter((c) => !c.archived || c.id === mobileDraft.cardId)
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
                        value={mobileDraft.currency}
                        onValueChange={(v) =>
                          setMobileDraft((d) => ({ ...d, currency: v as QueryCurrency | "all" }))
                        }
                      >
                        <SelectTrigger id="filtro-mobile-moneda" className="h-10 w-full">
                          <SelectValue>
                            {mobileDraft.currency === "all" ? TODAS : mobileDraft.currency}
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
                        value={mobileDraft.sort}
                        onValueChange={(v) =>
                          setMobileDraft((d) => ({ ...d, sort: v as MovementSort }))
                        }
                      >
                        <SelectTrigger id="filtro-mobile-orden" className="h-10 w-full">
                          <SelectValue>{SORT_LABELS[mobileDraft.sort]}</SelectValue>
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
                      value={mobileMinInput}
                      onChange={(e) =>
                        setMobileMinInput((prev) => formatAmountInput(e.target.value, prev))
                      }
                      className="h-10 tabular-nums"
                    />
                    <Input
                      aria-label="Importe máximo"
                      inputMode="decimal"
                      placeholder="Máximo"
                      value={mobileMaxInput}
                      onChange={(e) =>
                        setMobileMaxInput((prev) => formatAmountInput(e.target.value, prev))
                      }
                      className="h-10 tabular-nums"
                    />
                  </div>
                </div>
                )}
              </div>
              <SheetFooter className="flex-row justify-end border-t">
                {(hayFiltrosActivos(query) || hayFiltrosActivos(mobileDraft)) && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10"
                    onClick={() => {
                      limpiar()
                      setMobileFiltersOpen(false)
                    }}
                  >
                    Limpiar todo
                  </Button>
                )}
                <Button type="button" className="h-10" onClick={applyMobileSheet}>
                  Aplicar
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
        )}

        {/* Categoría multiselección (escritorio) */}
        {showCategory && (
        <div className="hidden w-40 space-y-1.5 md:block">
          <Label id="filtro-categoria-label" htmlFor="filtro-categoria" className={LABEL_CLASS}>
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
                    go({ categoryIds: toggleCategorySelection(query.categoryIds, id, categories) })
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

        {/* Medio de pago / tarjeta (escritorio, cuando hay tarjetas) */}
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

        {/* Moneda (escritorio) */}
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
                  <SelectValue>{query.currency === "all" ? TODAS : query.currency}</SelectValue>
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

        {/* Importe mínimo y máximo (escritorio) */}
        {showAmount && (
        <div className="hidden w-32 space-y-1.5 md:block">
          <Label id="filtro-importe-label" htmlFor="filtro-importe" className={LABEL_CLASS}>
            Importe
          </Label>
          <Popover open={amountOpen} onOpenChange={handleAmountOpenChange}>
            <PopoverTrigger asChild>
              <Button
                id="filtro-importe"
                type="button"
                variant="outline"
                aria-label={`Importe: ${amountLabel}`}
                className={cn(
                  "w-full justify-start truncate font-normal",
                  query.minCents === null && query.maxCents === null && "text-muted-foreground",
                )}
              >
                <span className="truncate">{amountLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-3"
              aria-labelledby="filtro-importe-label"
              align="start"
            >
              <form onSubmit={applyAmountPopover} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="filtro-min" className={LABEL_CLASS}>
                      Mínimo
                    </Label>
                    <Input
                      id="filtro-min"
                      inputMode="decimal"
                      placeholder="0"
                      value={minInput}
                      onChange={(e) =>
                        setMinInput((prev) => formatAmountInput(e.target.value, prev))
                      }
                      className="h-8 tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="filtro-max" className={LABEL_CLASS}>
                      Máximo
                    </Label>
                    <Input
                      id="filtro-max"
                      inputMode="decimal"
                      placeholder="Sin tope"
                      value={maxInput}
                      onChange={(e) =>
                        setMaxInput((prev) => formatAmountInput(e.target.value, prev))
                      }
                      className="h-8 tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  {(query.minCents !== null || query.maxCents !== null) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setAmountOpen(false)
                        go({ minCents: null, maxCents: null })
                      }}
                    >
                      Borrar
                    </Button>
                  )}
                  <Button type="submit" size="xs">
                    Aplicar
                  </Button>
                </div>
              </form>
            </PopoverContent>
          </Popover>
        </div>
        )}

        {/* Período con atajos + flechas ‹ › (escritorio) */}
        {showPeriod && (
        <div className="hidden space-y-1.5 md:block">
          <Label id="filtro-periodo-label" htmlFor="filtro-periodo" className={LABEL_CLASS}>
            Período
          </Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Período anterior"
              disabled={!prevShift}
              onClick={() => prevShift && go(prevShift)}
            >
              <ChevronLeft />
            </Button>
            <Popover open={periodoAbierto} onOpenChange={handlePeriodoOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  id="filtro-periodo"
                  type="button"
                  variant="outline"
                  aria-label={`Período: ${periodLabel}`}
                  className={cn(
                    "w-44 justify-start font-normal",
                    !query.from && !query.to && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon />
                  <span className="truncate">{periodLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className={cn("w-auto p-0 transition-opacity", pending && "opacity-60")}
                aria-busy={pending}
                aria-labelledby="filtro-periodo-label"
                align="start"
              >
                <div className="flex flex-col sm:flex-row">
                  <div className="flex flex-col gap-0.5 border-b p-2 sm:w-44 sm:border-r sm:border-b-0">
                    {DATE_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "justify-start font-normal",
                          activePreset === preset.id && "bg-accent text-paper font-medium",
                        )}
                        onClick={() => handlePresetClick(preset.id)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                    <span
                      className={cn(
                        "mt-1 rounded-md px-2.5 py-1 text-xs",
                        activePreset === "custom"
                          ? "bg-accent text-paper font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      Personalizado
                    </span>
                  </div>
                  <div>
                    <Calendar
                      mode="range"
                      locale={es}
                      captionLayout="dropdown"
                      startMonth={CALENDAR_START_MONTH}
                      endMonth={CALENDAR_END_MONTH}
                      defaultMonth={draft?.from ?? draft?.to}
                      selected={draft}
                      onSelect={handleCalendarSelect}
                    />
                    {(draft?.from || draft?.to) && (
                      <div className="flex justify-end border-t p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDraft(undefined)
                            go({ ...rangeToPatch(undefined), dateField: "date" })
                          }}
                        >
                          Borrar rango
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Período siguiente"
              disabled={!nextShift}
              onClick={() => nextShift && go(nextShift)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        )}

        {/* Orden (escritorio) */}
        {showSort && (
          <div className="hidden w-32 space-y-1.5 md:block">
            <Label htmlFor="filtro-orden" className={LABEL_CLASS}>
              Orden
            </Label>
            <div>
              <Select
                value={query.sort}
                onValueChange={(v) => go({ sort: v as MovementSort })}
              >
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

      {/* Chips de filtros activos con × y "Limpiar todo" (§4). */}
      {chips.length > 0 && (
        <div
          aria-label="Filtros activos"
          className="flex flex-wrap items-center gap-1.5"
        >
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
}: {
  showPaymentMethod?: boolean
  showSort?: boolean
  showCurrency?: boolean
  showSearch?: boolean
  showCategory?: boolean
  showAmount?: boolean
  showPeriod?: boolean
}) {
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
