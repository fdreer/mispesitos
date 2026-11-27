"use client"

import { useOptimistic, useRef, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { es } from "date-fns/locale"
import { CalendarIcon, Check, CreditCard, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { CategoryBadge } from "@/components/category-badge"
import { InstallmentPaidButton } from "@/components/installment-paid-button"
import { markInstallmentPaid, paidWord } from "@/components/installment-toasts"
import { StatusBadge } from "@/components/status-badge"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatPeriod } from "@/lib/cards"
import { selectorGroups, type CategoryLabel } from "@/lib/category-tree"
import { dateToIso, formatIsoForDisplay, isoToDate, type IsoDate } from "@/lib/dates"
import { formatShortDate } from "@/lib/installments"
import { formatAmountInput, formatMoney, parseAmountToCents } from "@/lib/money"
import { assertCurrency } from "@/lib/movement-asserts"
import type { ColumnId } from "@/lib/movement-columns"
import { pluralize } from "@/lib/movement-list-view"
import { summarizeMovementStatus } from "@/lib/movement-status"
import { cn } from "@/lib/utils"
import {
  patchMovement,
  setInstallmentPaid,
  type MovementPatch,
} from "@/server/actions/movements"
import type { Category, MovementWithInstallments } from "@/server/queries"

const VARIAS_CUOTAS_HINT = "Editá desde el detalle para recalcular cuotas"

const EDITABLE_TRIGGER =
  "-mx-1.5 inline-flex max-w-full min-w-0 cursor-pointer items-center rounded-md px-1.5 py-0.5 transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-white/[0.06] disabled:cursor-default disabled:opacity-60"

export function MovementStatusBadge({
  status,
  pendingCount,
  overdueCount,
}: ReturnType<typeof summarizeMovementStatus>) {
  if (status === "overdue") {
    return (
      <StatusBadge status="overdue">
        {pluralize(overdueCount, "vencida", "vencidas")}
      </StatusBadge>
    )
  }
  if (status === "pending") {
    return (
      <StatusBadge status="pending">
        {pluralize(pendingCount, "pendiente", "pendientes")}
      </StatusBadge>
    )
  }
  return <StatusBadge status="paid">Pagado</StatusBadge>
}

function CardLabel({ name }: { name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <CreditCard className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  )
}

/**
 * Corta el click y el teclado para que editar una celda no despliegue la
 * fila. Lo que se abre en un portal (popover, menú) es hijo de React de este
 * span, así que también queda cubierto.
 */
function StopRowToggle({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex max-w-full min-w-0"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  )
}

/**
 * Guarda un cambio de un campo con `patchMovement` y ofrece "Deshacer" en el
 * toast, con el valor previo. Mismo patrón que `installment-toasts`.
 */
async function savePatch(
  movement: MovementWithInstallments,
  patch: MovementPatch,
  undo: MovementPatch,
  label: string,
): Promise<boolean> {
  const result = await patchMovement(movement.id, patch)
  if (!result.ok) {
    toast.error(result.message)
    return false
  }
  toast.success(label, {
    description: movement.description,
    action: {
      label: "Deshacer",
      onClick: () =>
        void patchMovement(movement.id, undo).then((r) =>
          r.ok ? toast("Cambio deshecho") : toast.error(r.message),
        ),
    },
  })
  return true
}

// --- Categoría ---------------------------------------------------------------

function CategoryCell({
  movement,
  categories,
  categoryLabel,
}: {
  movement: MovementWithInstallments
  categories: Category[]
  categoryLabel: Map<string, CategoryLabel>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [pending, startTransition] = useTransition()
  const [categoryId, setOptimistic] = useOptimistic(movement.categoryId)
  const label = categoryId ? categoryLabel.get(categoryId) : undefined
  const groups = selectorGroups(categories, { keepId: movement.categoryId, query })

  function choose(id: string) {
    setOpen(false)
    setQuery("")
    if (id === movement.categoryId) return
    const previous = movement.categoryId
    startTransition(async () => {
      setOptimistic(id)
      await savePatch(
        movement,
        { categoryId: id },
        previous ? { categoryId: previous } : { categoryId: id },
        "Categoría cambiada",
      )
    })
  }

  function option(c: Category, nested: boolean) {
    const l = categoryLabel.get(c.id)
    const selected = c.id === categoryId
    return (
      <button
        key={c.id}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => choose(c.id)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md py-1.5 pr-1.5 text-left text-sm hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
          nested ? "pl-5" : "pl-1.5",
        )}
      >
        <CategoryBadge name={c.name} hue={l?.hue} />
        {selected && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
      </button>
    )
  }

  return (
    <StopRowToggle>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setQuery("")
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Cambiar categoría de ${movement.description}`}
            className={EDITABLE_TRIGGER}
          >
            {label ? <CategoryBadge {...label} /> : <span className="text-muted-foreground">—</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                const first = groups.flatMap((g) => (g.type === "leaf" ? [g.category] : g.options))[0]
                if (first) choose(first.id)
              }
            }}
            placeholder="Buscar categoría..."
            aria-label="Buscar categoría"
            className="mb-2 h-8"
          />
          <div role="listbox" aria-label="Categorías" className="max-h-64 space-y-0.5 overflow-y-auto">
            {groups.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Sin categorías.</p>
            )}
            {groups.map((g) =>
              g.type === "leaf" ? (
                option(g.category, false)
              ) : (
                <div key={g.parent.id} role="group" aria-label={g.parent.name}>
                  <p className="px-1.5 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {g.parent.name}
                  </p>
                  {g.options.map((c) => option(c, true))}
                </div>
              ),
            )}
          </div>
        </PopoverContent>
      </Popover>
    </StopRowToggle>
  )
}

// --- Fecha -------------------------------------------------------------------

function DateCell({ movement }: { movement: MovementWithInstallments }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [date, setOptimistic] = useOptimistic(movement.date)
  const editable = movement.installments.length === 1

  if (!editable) {
    return <span title={VARIAS_CUOTAS_HINT}>{formatIsoForDisplay(date)}</span>
  }

  function choose(d: Date | undefined) {
    if (!d) return
    setOpen(false)
    const next = dateToIso(d)
    if (next === movement.date) return
    const previous = movement.date
    startTransition(async () => {
      setOptimistic(next)
      await savePatch(movement, { date: next }, { date: previous }, "Fecha cambiada")
    })
  }

  return (
    <StopRowToggle>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Cambiar fecha de ${movement.description}`}
            className={cn(EDITABLE_TRIGGER, "tabular-nums")}
          >
            {formatIsoForDisplay(date)}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={es}
            selected={isoToDate(date)}
            defaultMonth={isoToDate(date)}
            onSelect={choose}
          />
        </PopoverContent>
      </Popover>
    </StopRowToggle>
  )
}

// --- Importe -----------------------------------------------------------------

function centsToInput(cents: number): string {
  return formatAmountInput((cents / 100).toFixed(2).replace(".", ","))
}

function AmountCell({ movement }: { movement: MovementWithInstallments }) {
  const currency = assertCurrency(movement.currency)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()
  const [amount, setOptimistic] = useOptimistic(movement.amountCents)
  const done = useRef(false)
  const editable = movement.installments.length === 1

  if (!editable) {
    return <span title={VARIAS_CUOTAS_HINT}>{formatMoney(amount, currency)}</span>
  }

  function start() {
    done.current = false
    setText(centsToInput(movement.amountCents))
    setError(false)
    setEditing(true)
  }

  function commit() {
    if (done.current) return
    const cents = parseAmountToCents(text)
    if (cents === null || cents <= 0) {
      setError(true)
      return
    }
    done.current = true
    setEditing(false)
    if (cents === movement.amountCents) return
    const previous = movement.amountCents
    startTransition(async () => {
      setOptimistic(cents)
      await savePatch(movement, { amountCents: cents }, { amountCents: previous }, "Importe cambiado")
    })
  }

  function cancel() {
    done.current = true
    setEditing(false)
  }

  if (editing) {
    return (
      <StopRowToggle>
        <Input
          autoFocus
          inputMode="decimal"
          aria-label={`Importe de ${movement.description}`}
          aria-invalid={error || undefined}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setError(false)
            setText((prev) => formatAmountInput(e.target.value, prev))
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              cancel()
            }
          }}
          onBlur={() => {
            if (!done.current) {
              const cents = parseAmountToCents(text)
              if (cents === null || cents <= 0) cancel()
              else commit()
            }
          }}
          className="h-7 w-32 text-right tabular-nums"
        />
      </StopRowToggle>
    )
  }

  return (
    <StopRowToggle>
      <button
        type="button"
        disabled={pending}
        onClick={start}
        aria-label={`Cambiar importe de ${movement.description}`}
        className={cn(EDITABLE_TRIGGER, "tabular-nums")}
      >
        {formatMoney(amount, currency)}
      </button>
    </StopRowToggle>
  )
}

// --- Estado ------------------------------------------------------------------

function MenuButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:text-muted-foreground"
    >
      {children}
    </button>
  )
}

function StatusCell({
  movement,
  kind,
  today,
}: {
  movement: MovementWithInstallments
  kind: "income" | "expense"
  today: IsoDate
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<"menu" | "calendar">("menu")
  const [pending, startTransition] = useTransition()
  const summary = summarizeMovementStatus(movement.installments, today)
  const currency = assertCurrency(movement.currency)
  const word = paidWord(kind)
  const single = movement.installments.length === 1 ? movement.installments[0] : null

  function close() {
    setOpen(false)
    setView("menu")
  }

  function mark(date?: IsoDate) {
    if (!single) return
    close()
    startTransition(async () => {
      const r = await markInstallmentPaid({
        id: single.id,
        kind,
        description: movement.description,
        paidDate: date,
      })
      if (!r.ok) toast.error(r.message)
    })
  }

  function unmark() {
    if (!single) return
    const previousDate = single.paidDate ?? undefined
    close()
    startTransition(async () => {
      const r = await setInstallmentPaid(single.id, false)
      if (!r.ok) {
        toast.error(r.message)
        return
      }
      toast(kind === "income" ? "Marcada como no cobrada" : "Marcada como no pagada", {
        description: movement.description,
        action: {
          label: "Deshacer",
          onClick: () =>
            void setInstallmentPaid(single.id, true, previousDate).then((res) =>
              res.ok ? toast("Cambio deshecho") : toast.error(res.message),
            ),
        },
      })
    })
  }

  let content: ReactNode
  if (movement.creditCardId) {
    const periods = [
      ...new Set(
        movement.installments
          .filter((i) => i.statementPeriod)
          .map((i) => i.statementPeriod as string),
      ),
    ]
    content = (
      <div className="space-y-0.5">
        <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
          Las cuotas de tarjeta se pagan con el resumen.
        </p>
        {periods.map((p) => (
          <Link
            key={p}
            href={`/tarjetas/${movement.creditCardId}?periodo=${p}`}
            onClick={close}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
          >
            <CreditCard className="size-3.5 text-muted-foreground" aria-hidden />
            Resumen {formatPeriod(p)}
          </Link>
        ))}
      </div>
    )
  } else if (single) {
    content =
      view === "calendar" ? (
        <div>
          <p className="px-3 pt-3 text-xs text-muted-foreground">
            ¿Qué día {kind === "income" ? "la cobraste" : "la pagaste"}?
          </p>
          <Calendar
            mode="single"
            locale={es}
            defaultMonth={isoToDate(today)}
            disabled={{ after: isoToDate(today) }}
            onSelect={(d) => d && mark(dateToIso(d))}
          />
        </div>
      ) : single.paid ? (
        <div className="space-y-0.5">
          <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
            {word}
            {single.paidDate && ` · ${formatShortDate(single.paidDate, today)}`}
          </p>
          <MenuButton onClick={unmark} disabled={pending}>
            <Undo2 aria-hidden />
            Desmarcar
          </MenuButton>
        </div>
      ) : (
        <div className="space-y-0.5">
          <MenuButton onClick={() => mark()} disabled={pending}>
            <Check aria-hidden />
            {kind === "income" ? "Marcar cobrada hoy" : "Marcar pagada hoy"}
          </MenuButton>
          <MenuButton onClick={() => setView("calendar")} disabled={pending}>
            <CalendarIcon aria-hidden />
            Elegir fecha…
          </MenuButton>
        </div>
      )
  } else {
    content = (
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {movement.installments.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm">
            <span className="min-w-0">
              <span className="block">Cuota {i.number}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {formatIsoForDisplay(i.dueDate)} · {formatMoney(i.amountCents, currency)}
              </span>
            </span>
            <InstallmentPaidButton
              id={i.id}
              paid={i.paid}
              paidDate={i.paidDate}
              today={today}
              number={i.number}
              description={movement.description}
              kind={kind}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <StopRowToggle>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setView("menu")
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Estado de ${movement.description}`}
            className={cn(EDITABLE_TRIGGER, "-mx-1 px-1")}
          >
            <MovementStatusBadge {...summary} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn("p-1.5", view === "calendar" ? "w-auto p-0" : single || movement.creditCardId ? "w-56" : "w-80")}
        >
          {content}
        </PopoverContent>
      </Popover>
    </StopRowToggle>
  )
}

// --- Celda -------------------------------------------------------------------

export type MovementCellContext = {
  movement: MovementWithInstallments
  kind: "income" | "expense"
  today: IsoDate
  categories: Category[]
  categoryLabel: Map<string, CategoryLabel>
  cardName?: string
  nextText: string | null
  /** Columnas ocultas: su dato vuelve como subtítulo de la descripción. */
  hidden: Set<ColumnId>
}

export function MovementCell({ column, ...ctx }: { column: ColumnId } & MovementCellContext) {
  const m = ctx.movement
  const total = m.installments.length

  switch (column) {
    case "date":
      return <DateCell movement={m} />

    case "description":
      return (
        <>
          {m.description}
          {total > 1 && ctx.hidden.has("installments") && (
            <span className="text-muted-foreground"> · {total} cuotas</span>
          )}
          {ctx.nextText && ctx.hidden.has("nextDue") && (
            <span className="block text-xs text-muted-foreground">{ctx.nextText}</span>
          )}
          {ctx.cardName && (ctx.kind === "income" || ctx.hidden.has("paymentMethod")) && (
            <span className="block">
              <CardLabel name={ctx.cardName} />
            </span>
          )}
        </>
      )

    case "category":
      return (
        <CategoryCell movement={m} categories={ctx.categories} categoryLabel={ctx.categoryLabel} />
      )

    case "paymentMethod":
      return ctx.cardName ? (
        <CardLabel name={ctx.cardName} />
      ) : (
        <span className="text-xs text-muted-foreground">Efectivo / débito</span>
      )

    case "installments": {
      if (total <= 1) return <span className="text-muted-foreground">—</span>
      const paid = m.installments.filter((i) => i.paid).length
      return (
        <span className="tabular-nums" title={`${paid} de ${total} cuotas pagas`}>
          {paid}/{total}
        </span>
      )
    }

    case "nextDue":
      return ctx.nextText ? (
        <span className="text-xs">{ctx.nextText}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )

    case "amount":
      return <AmountCell movement={m} />

    case "status":
      return <StatusCell movement={m} kind={ctx.kind} today={ctx.today} />
  }
}
