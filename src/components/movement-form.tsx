"use client"

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Minus, Plus } from "lucide-react"

import type { ActionResult } from "@/server/actions/result"

import {
  CategoryPicker,
  initialCategoryId,
  readLastCategory,
  rememberCategory,
} from "@/components/category-picker"
import { DateField } from "@/components/date-field"
import { PaymentMethodPills } from "@/components/payment-method-pills"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { assignStatements, formatPeriod, type StatementDates } from "@/lib/cards"
import { isLeafCategory } from "@/lib/category-tree"
import { formatIsoForDisplay, type IsoDate } from "@/lib/dates"
import { buildInstallments, formatShortDate, MAX_INSTALLMENTS } from "@/lib/installments"
import { formatAmountInput, formatMoney, parseAmountToCents } from "@/lib/money"
import { assertCurrency } from "@/lib/movement-asserts"
import { cn } from "@/lib/utils"
import { createMovement, updateMovement } from "@/server/actions/movements"
import type { CardOption, DescriptionSuggestion } from "@/server/card-queries"
import type { Category, MovementWithInstallments } from "@/server/queries"

type Props = {
  kind: "income" | "expense"
  categories: Category[]
  today: IsoDate
  movement?: MovementWithInstallments
  cards?: CardOption[]
  suggestions?: DescriptionSuggestion[]
  onSaved?: () => void
}

type Row = { amount: string; dueDate: string }

function centsToInput(cents: number): string {
  return formatAmountInput((cents / 100).toFixed(2).replace(".", ","))
}

function planKeyOf(totalCents: number, count: number, date: IsoDate, cardId: string): string {
  return `${totalCents}|${count}|${date}|${cardId}`
}

/** Campos del formulario: algo más altos que el default de la app. */
const FIELD = "h-10"

/** Los atajos de cantidad de cuotas (§5.2 del plan v2). */
const COUNT_SHORTCUTS = [1, 3, 6, 12] as const

/**
 * "12 cuotas de $100.000 desde 15/12", el resumen del plan colapsado (§5.2).
 * Si las cuotas no son todas iguales —porque se editaron a mano o porque la
 * última absorbe el redondeo—, dice el importe de la primera y "…" en vez de
 * prometer un número que no es el de todas.
 */
function planSummary(
  amounts: (number | null)[],
  dueDates: string[],
  currency: "ARS" | "USD",
  today: IsoDate,
): string {
  const first = amounts[0]
  const from = dueDates[0] ? formatShortDate(dueDates[0], today) : ""
  if (amounts.length <= 1) return `Vence el ${from}`
  const allEqual = amounts.every((a) => a === first)
  const each = first === null ? "" : ` de ${formatMoney(first, currency)}${allEqual ? "" : "…"}`
  return `${amounts.length} cuotas${each} desde ${from}`
}

export function MovementForm({
  kind,
  categories,
  today,
  movement,
  cards = [],
  suggestions = [],
  onSaved,
}: Props) {
  const [state, action, pending] = useActionState(
    movement ? updateMovement : createMovement,
    null,
  )
  const ids = useId()
  const amountRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  // "Guardar y cargar otro" (§5.2): el botón lo marca antes de enviar, y el
  // efecto del resultado lo lee para no cerrar el diálogo.
  const keepOpen = useRef(false)

  const [amount, setAmount] = useState(movement ? centsToInput(movement.amountCents) : "")
  const [currency, setCurrency] = useState<"ARS" | "USD">(
    movement ? assertCurrency(movement.currency) : "ARS",
  )
  const [description, setDescription] = useState(movement?.description ?? "")
  const [date, setDate] = useState(movement?.date ?? today)
  // Al dar de alta arranca en la última categoría usada en este dispositivo
  // (§2.3 del plan v2). El formulario vive adentro de un diálogo que se monta
  // al abrirse, siempre en el navegador, así que leer localStorage acá no
  // desarma la hidratación.
  const [categoryId, setCategoryId] = useState(
    () => movement?.categoryId ?? initialCategoryId(categories, readLastCategory(kind)),
  )
  // Medio de pago: "" es efectivo/débito. Sólo los egresos pueden ir con
  // tarjeta (CHECK `movement_credit_card_only_expense`, migración 0012).
  const [cardId, setCardId] = useState(movement?.creditCardId ?? "")
  const [settled, setSettled] = useState(true)
  const [countInput, setCountInput] = useState(String(movement?.installments.length ?? 1))
  const [planOpen, setPlanOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>(
    movement
      ? movement.installments.map((i) => ({
          amount: centsToInput(i.amountCents),
          dueDate: i.dueDate,
        }))
      : [{ amount: "", dueDate: today }],
  )

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {}
  const hasFieldErrors = Object.keys(errors).length > 0

  // Las tarjetas que se ofrecen: las activas, más la que el movimiento ya
  // tiene aunque esté archivada (editar no puede cambiarle el medio de pago
  // en silencio, mismo criterio que la categoría archivada).
  const cardChoices = cards.filter((c) => !c.archived || c.id === movement?.creditCardId)
  const card = kind === "expense" ? cards.find((c) => c.id === cardId) : undefined
  const isCard = card !== undefined
  // §1.3: una compra con tarjeta nunca es "ya pagada" al cargarla.
  const canSettle = !movement && !isCard
  // Con fecha futura no hay "ya pagado": la plata todavía no se movió (misma
  // regla que `resolvePaidDate` y que valida `createMovement`).
  const isFutureDate = date > today
  const isSettled = canSettle && settled && !isFutureDate

  // Los centavos de cada fila, derivados de lo tipeado. `null` cuando el texto
  // todavía no es un número: eso hace que la suma no cierre y el botón quede
  // deshabilitado, que es exactamente lo que tiene que pasar mientras una
  // fila está a medio escribir.
  const installmentCents = rows.map((r) => parseAmountToCents(r.amount))

  const totalCents = parseAmountToCents(amount) ?? 0
  const parsedCount = Number(countInput)
  const countValid =
    /^\d+$/.test(countInput) &&
    Number.isInteger(parsedCount) &&
    parsedCount >= 1 &&
    parsedCount <= MAX_INSTALLMENTS
  const count = countValid ? parsedCount : 1

  /*
   * Con tarjeta, cada cuota vence cuando vence el resumen en el que cae, y
   * eso lo decide la misma función que usa la Server Action
   * (`assignStatements` en @/lib/cards), con los resúmenes reales que ya
   * existen. Así lo que se ve acá es lo que se guarda.
   */
  // Editando con la misma tarjeta y la misma fecha, la primera cuota se
  // queda en su resumen (el mismo ancla que usa `planCardInstallments`).
  const anchorPeriod =
    movement && card && movement.creditCardId === card.id && movement.date === date
      ? (movement.installments.find((i) => i.number === 1)?.statementPeriod ?? null)
      : null
  const statementPlan: StatementDates[] | null = useMemo(
    () => (card ? assignStatements(card, date, count, card.statements, anchorPeriod) : null),
    [card, date, count, anchorPeriod],
  )
  const paidStatementHit =
    !movement && card && statementPlan
      ? statementPlan.findIndex((s) =>
          card.statements.some((k) => k.period === s.period && k.paid),
        )
      : -1

  /**
   * Regenera el plan de cuotas cuando cambia el total, la cantidad de cuotas,
   * la fecha o el medio de pago. Ajustar el estado durante el render
   * (comparando contra la última clave aplicada) en vez de en un `useEffect`:
   * es el patrón que recomienda React para "resetear estado cuando cambia una
   * entrada" y evita el render en cascada de recalcular después de pintar.
   * https://react.dev/learn/you-might-not-need-an-effect
   */
  // `date` sale siempre de `DateField` —nunca de tipeo libre—, así que
  // siempre es un día real.
  const planKey =
    totalCents > 0 && countValid ? planKeyOf(totalCents, count, date, isCard ? cardId : "") : null
  // Sembrado con el plan que ya está guardado cuando se edita: sin esto el
  // primer render vería `null !== planKey` y regeneraría las cuotas con
  // `buildInstallments`, pisando los vencimientos e importes reales —incluidos
  // los de las cuotas ya pagas— antes de que nadie tocara nada.
  const [appliedPlanKey, setAppliedPlanKey] = useState<string | null>(
    movement
      ? planKeyOf(
          movement.amountCents,
          movement.installments.length,
          movement.date,
          movement.creditCardId ?? "",
        )
      : null,
  )
  if (planKey !== null && planKey !== appliedPlanKey) {
    setAppliedPlanKey(planKey)
    const planned = buildInstallments(totalCents, count, date)
    setRows(
      planned.map((p, i) => ({
        amount: centsToInput(p.amountCents),
        dueDate: statementPlan?.[i]?.dueDate ?? p.dueDate,
      })),
    )
  }

  const rowsSum = useMemo(
    () => installmentCents.reduce((acc: number, c) => acc + (c ?? 0), 0),
    // `installmentCents` se deriva de `rows` en cada render, así que depender
    // de `rows` —el estado del que sale— es lo que mantiene el memo honesto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  )
  // Una fila a medio tipear (`null`) invalida la suma aunque el total dé:
  // sin esto, borrar el importe de una cuota y que otra tuviera el sobrante
  // dejaba enviar un plan con una cuota sin número.
  const sumMatches =
    countValid &&
    rows.length === count &&
    rowsSum === totalCents &&
    installmentCents.every((c) => c !== null)
  // Un plan que no cierra no se puede quedar escondido: se despliega solo
  // para que se vea qué cuota falla.
  const showRows = planOpen || (totalCents > 0 && countValid && !sumMatches)

  // Mismo patrón: limpiar el formulario es un ajuste de estado disparado por
  // el resultado de la Server Action, no un efecto sobre un sistema externo.
  const [handledState, setHandledState] = useState<ActionResult | null>(null)
  if (state?.ok && state !== handledState) {
    setHandledState(state)
    // Sólo al dar de alta: vaciar el formulario deja listo el próximo. Editando
    // no hay próximo —el diálogo se cierra— y borrarlo se vería como que los
    // datos se perdieron si algo dejara el diálogo abierto.
    //
    // Fecha, categoría, moneda y medio de pago quedan: "cargar otro" casi
    // siempre es otro gasto del mismo día y del mismo tipo.
    if (!movement) {
      setAmount("")
      setDescription("")
      setCountInput("1")
      setPlanOpen(false)
      setSettled(true)
    }
  }

  // El toast y el aviso a quien abrió el diálogo son efectos: no actualizan
  // estado de React del formulario. No hace falta `router.refresh()`: la
  // acción ya llamó a `revalidatePath` y el árbol nuevo llega en su respuesta.
  //
  // Todo va UNA vez por resultado (la marca `toastedState`): `onSaved` llega
  // como flecha nueva en cada render, y sin la marca cada re-render apilaba
  // otro "Egreso cargado" —y, con "Guardar y cargar otro", cerraba el diálogo
  // que había que dejar abierto.
  const toastedState = useRef<ActionResult | null>(null)
  useEffect(() => {
    if (!state?.ok || toastedState.current === state) return
    toastedState.current = state
    if (!movement) rememberCategory(kind, categoryId)
    toast.success(
      movement ? "Cambios guardados" : kind === "income" ? "Ingreso cargado" : "Egreso cargado",
    )
    if (keepOpen.current) {
      keepOpen.current = false
      amountRef.current?.focus()
    } else {
      onSaved?.()
    }
  }, [state, onSaved, movement, kind, categoryId])

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const suggestionCategoryByDescription = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of suggestions) {
      if (!s.categoryId) continue
      const key = s.description.toLocaleLowerCase()
      if (map.has(key)) continue
      if (
        categories.some((c) => c.id === s.categoryId && !c.archived) &&
        isLeafCategory(categories, s.categoryId)
      ) {
        map.set(key, s.categoryId)
      }
    }
    return map
  }, [suggestions, categories])

  /**
   * Autocompletar (§5.2): al elegir —o terminar de tipear— una descripción ya
   * usada, se propone la categoría de la última vez. Sólo al dar de alta, y
   * sólo si esa categoría todavía se puede elegir: activa y hoja (decisión
   * 7.4). Editando no: cambiarle la categoría a un movimiento por retocar su
   * descripción sería una sorpresa.
   */
  function changeDescription(next: string) {
    setDescription(next)
    if (movement) return
    const target = suggestionCategoryByDescription.get(next.trim().toLocaleLowerCase())
    if (target) setCategoryId(target)
  }

  function setCount(next: number) {
    setCountInput(String(Math.min(Math.max(next, 1), MAX_INSTALLMENTS)))
  }

  const dueDatesForSummary = rows.map((r) => r.dueDate)
  const datalistId = `${ids}-descripciones`
  const rowsId = `${ids}-cuotas`
  const settledId = `${ids}-settled`
  const amountId = `${ids}-amount`
  const descriptionId = `${ids}-description`
  const categoryFieldId = `${ids}-category`
  const dateId = `${ids}-date`
  const countId = `${ids}-count`

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pt-4 pb-5 sm:px-6">
      {/* Sólo editando. `updateMovement` lo valida como UUID y filtra además
          por usuario, igual que borrar: que el id viaje por el formulario no
          lo hace más confiable que cualquier otro campo. */}
      {movement && <input type="hidden" name="id" value={movement.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="amountCents" value={amount} />
      <input type="hidden" name="creditCardId" value={isCard ? cardId : ""} />
      {!movement && <input type="hidden" name="settled" value={isSettled ? "true" : "false"} />}

      {/* El error general arriba (§5.2). Si la acción marcó campos, cada uno
          lleva el suyo al lado y acá sólo se avisa que hay que mirarlos. */}
      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {hasFieldErrors ? "Revisá los campos marcados." : state.message}
        </p>
      )}

      {/* Importe primero (§5.2) y como protagonista: es lo único que siempre
          hay que escribir, y con el foco puesto el diálogo arranca listo para
          tipear. Sin caja: una línea de base que se enciende con el foco. */}
      <div className="space-y-1.5">
        <Label htmlFor={amountId} className="sr-only">
          Importe
        </Label>
        <div
          className={cn(
            "flex items-center gap-3 border-b pb-2 transition-colors",
            errors.amountCents
              ? "border-destructive/70"
              : "border-white/10 focus-within:border-primary/70",
          )}
        >
          <span className="shrink-0 text-2xl font-medium text-muted-foreground tabular-nums">
            {currency === "USD" ? "US$" : "$"}
          </span>
          <input
            ref={amountRef}
            id={amountId}
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="0"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                descriptionRef.current?.focus()
              }
            }}
            // Sin autoFocus editando: el diálogo se abre para cambiar
            // cualquier cosa, y el teclado del teléfono tapando media
            // pantalla no ayuda.
            autoFocus={!movement}
            value={amount}
            onChange={(e) => setAmount(formatAmountInput(e.target.value, amount))}
            required
            aria-invalid={errors.amountCents !== undefined}
            className="h-12 w-full min-w-0 flex-1 bg-transparent text-[2rem] leading-none font-semibold tracking-tight text-paper tabular-nums outline-none placeholder:text-smoke"
          />
          <Segmented
            label="Moneda"
            size="sm"
            value={currency}
            onChange={setCurrency}
            options={[
              { value: "ARS", label: "ARS" },
              { value: "USD", label: "USD" },
            ]}
            className="w-auto shrink-0"
          />
        </div>
        {errors.amountCents && <p className="text-destructive text-xs">{errors.amountCents[0]}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={descriptionId}>Descripción</Label>
          <Input
            ref={descriptionRef}
            id={descriptionId}
            name="description"
            required
            maxLength={200}
            autoComplete="off"
            enterKeyHint="next"
            placeholder={kind === "income" ? "Ej. Sueldo" : "Ej. Supermercado"}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                document.getElementById(categoryFieldId)?.focus()
              }
            }}
            list={suggestions.length > 0 ? datalistId : undefined}
            value={description}
            onChange={(e) => changeDescription(e.target.value)}
            aria-invalid={errors.description !== undefined}
            className={FIELD}
          />
          {suggestions.length > 0 && (
            <datalist id={datalistId}>
              {suggestions.map((s) => (
                <option key={s.description} value={s.description} />
              ))}
            </datalist>
          )}
          {errors.description && <p className="text-destructive text-xs">{errors.description[0]}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={categoryFieldId}>Categoría</Label>
          {/* Editando arranca en la del movimiento, que puede ser una archivada:
              el selector la sigue ofreciendo (`keepId`). Sin eso, abrir el
              diálogo de un movimiento viejo lo movía de categoría con sólo
              guardarlo. */}
          <CategoryPicker
            id={categoryFieldId}
            name="categoryId"
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            invalid={errors.categoryId !== undefined}
          />
          {errors.categoryId && <p className="text-destructive text-xs">{errors.categoryId[0]}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={dateId}>{isCard ? "Fecha de la compra" : "Fecha"}</Label>
          <DateField
            id={dateId}
            hiddenName="date"
            value={date}
            onChange={setDate}
            ariaLabel={`Fecha: ${formatIsoForDisplay(date)}`}
            className={cn(FIELD, "w-full cursor-pointer justify-start gap-2 font-normal tabular-nums")}
          />
          {errors.date && <p className="text-destructive text-xs">{errors.date[0]}</p>}
        </div>
      </div>

      {/* Medio de pago (§1.4 del plan v2). Sin tarjetas cargadas no aparece:
          sería una pregunta con una sola respuesta. */}
      {kind === "expense" && cardChoices.length > 0 && (
        <div className="space-y-2">
          <p aria-hidden className="text-xs text-muted-foreground">
            Medio de pago
          </p>
          <PaymentMethodPills value={cardId} onChange={setCardId} cards={cardChoices} />
          {/* Con tarjeta, a qué resumen va la compra: se ve apenas se elige,
              sin esperar a cargar el importe. Sale de `assignStatements`, lo
              mismo que guarda la acción. */}
          {card && statementPlan?.[0] && (
            <p className="text-muted-foreground text-xs" aria-live="polite">
              {count > 1 ? "Primer resumen" : "Resumen"} {formatPeriod(statementPlan[0].period)} ·
              cierra el {formatShortDate(statementPlan[0].closingDate, today)} · vence el{" "}
              {formatShortDate(statementPlan[0].dueDate, today)}
            </p>
          )}
          {errors.creditCardId && (
            <p className="text-destructive text-xs">{errors.creditCardId[0]}</p>
          )}
        </div>
      )}

      {/* "Pagado / Cobrado" activado por defecto: la mayoría de los
          movimientos en efectivo/débito ya están pagos al cargarlos. Con
          tarjeta no se ofrece: se paga con el resumen (§1.3). */}
      {canSettle && (
        <label
          htmlFor={settledId}
          className="flex cursor-pointer items-center gap-3 rounded-lg bg-white/[0.03] px-3.5 py-3 transition-colors hover:bg-white/[0.05]"
        >
          <div className="min-w-0 flex-1">
            <span className="block text-sm text-foreground">
              {kind === "income" ? "Ya está cobrado" : "Ya está pagado"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {isFutureDate
                ? kind === "income"
                  ? "Con fecha futura queda pendiente de cobro"
                  : "Con fecha futura queda pendiente de pago"
                : isSettled
                ? `En la fecha del movimiento${totalCents > 0 ? `, por ${formatMoney(totalCents, currency)}` : ""}`
                : kind === "income"
                  ? "Queda pendiente de cobro"
                  : "Queda pendiente · podés dividirlo en cuotas"}
            </span>
          </div>
          <Switch
            id={settledId}
            aria-label={kind === "income" ? "Cobrado" : "Pagado"}
            checked={isSettled}
            disabled={isFutureDate}
            onCheckedChange={setSettled}
          />
        </label>
      )}

      {totalCents > 0 && isSettled && (
        <>
          <input type="hidden" name="installmentAmount" value={totalCents} />
          <input type="hidden" name="installmentDueDate" value={date} />
        </>
      )}

      {kind === "expense" && !isSettled && (
        <div className="space-y-1.5">
          <Label htmlFor={countId}>Cuotas</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 items-center rounded-lg bg-white/[0.04] p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                aria-label="Una cuota menos"
                disabled={!countValid || count <= 1}
                onClick={() => setCount(count - 1)}
              >
                <Minus className="size-3.5" />
              </Button>
              <Input
                id={countId}
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={countInput}
                aria-invalid={!countValid}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setCountInput(e.target.value)}
                className="h-8 w-10 border-transparent bg-transparent px-1 text-center text-sm font-medium tabular-nums dark:bg-transparent"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                aria-label="Una cuota más"
                disabled={!countValid || count >= MAX_INSTALLMENTS}
                onClick={() => setCount(count + 1)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Cantidades frecuentes">
              {COUNT_SHORTCUTS.map((n) => {
                const on = countValid && count === n
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    aria-label={n === 1 ? "1 cuota" : `${n} cuotas`}
                    onClick={() => setCount(n)}
                    className={cn(
                      "h-8 min-w-9 cursor-pointer rounded-full px-3 text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      on
                        ? "bg-paper text-void"
                        : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                    )}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
          {!countValid && (
            <p className="text-destructive text-xs" role="alert">
              Ingresá un número entero entre 1 y {MAX_INSTALLMENTS}.
            </p>
          )}
        </div>
      )}

      {totalCents > 0 && !isSettled && (
        <div className="space-y-3 rounded-lg bg-white/[0.03] px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground" aria-live="polite">
                {planSummary(installmentCents, dueDatesForSummary, currency, today)}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-paper focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-expanded={showRows}
              aria-controls={rowsId}
              onClick={() => setPlanOpen((o) => !o)}
            >
              {showRows ? "Ocultar cuotas" : "Editar cuotas"}
            </button>
          </div>

          {paidStatementHit >= 0 && statementPlan && (
            <p className="text-destructive text-xs" role="alert">
              La cuota {paidStatementHit + 1} cae en el resumen de{" "}
              {formatPeriod(statementPlan[paidStatementHit].period)}, que ya está pagado.
            </p>
          )}

          {/* Las filas viajan siempre en el FormData, se vean o no: el plan
              colapsado sigue siendo el plan que se guarda. Cuando está colapsado
              sólo se montan los `<input type="hidden">` para evitar montar
              decenas de `<Input>` y `<DateField>` con Popover de Radix. */}
          {showRows ? (
            <div
              id={rowsId}
              // Sin scroll propio: el cuerpo del modal ya scrollea, y dos
              // barras anidadas se pelean por la rueda.
              className="space-y-1.5 border-t border-white/[0.06] pt-3"
            >
              {rows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-5 shrink-0 text-center text-xs tabular-nums">
                    {index + 1}
                  </span>
                  {/* El que viaja: centavos, el formato que espera la acción. Vacío
                      si la fila todavía no es un número — así el servidor rechaza
                      con su propio mensaje en vez de recibir texto suelto. */}
                  <input
                    type="hidden"
                    name="installmentAmount"
                    value={installmentCents[index] ?? ""}
                  />
                  <div className="relative min-w-0 flex-1">
                    <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs">
                      {currency === "USD" ? "US$" : "$"}
                    </span>
                    <Input
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) => updateRow(index, { amount: formatAmountInput(e.target.value, row.amount) })}
                      aria-label={`Importe de la cuota ${index + 1}`}
                      aria-invalid={row.amount !== "" && installmentCents[index] === null}
                      className={cn(FIELD, "h-9 text-sm tabular-nums", currency === "USD" ? "pl-10" : "pl-6")}
                    />
                  </div>
                  <div className="w-[122px] shrink-0 sm:w-[132px]">
                    {card && statementPlan?.[index] ? (
                      // Con tarjeta el vencimiento no se elige: es el del
                      // resumen. Se corrige desde /tarjetas, para todas las
                      // cuotas de ese resumen a la vez.
                      <>
                        <input type="hidden" name="installmentDueDate" value={row.dueDate} />
                        <p className="text-muted-foreground flex h-9 flex-col justify-center text-right text-xs leading-tight">
                          <span className="whitespace-nowrap text-foreground/85 tabular-nums">
                            {formatIsoForDisplay(row.dueDate)}
                          </span>
                          <span className="text-[11px] whitespace-nowrap">
                            res. {formatPeriod(statementPlan[index].period)}
                          </span>
                        </p>
                      </>
                    ) : (
                      <DateField
                        size="sm"
                        hiddenName="installmentDueDate"
                        value={row.dueDate}
                        onChange={(next) => updateRow(index, { dueDate: next })}
                        ariaLabel={`Vencimiento de la cuota ${index + 1}: ${formatIsoForDisplay(row.dueDate)}`}
                        className={cn(FIELD, "h-9 w-full cursor-pointer justify-start gap-1.5 px-2.5 text-sm font-normal tabular-nums")}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div id={rowsId} hidden>
              {rows.map((row, index) => (
                <div key={index}>
                  <input
                    type="hidden"
                    name="installmentAmount"
                    value={installmentCents[index] ?? ""}
                  />
                  <input type="hidden" name="installmentDueDate" value={row.dueDate} />
                </div>
              ))}
            </div>
          )}
          {countValid && (showRows || !sumMatches) && (
            <p className={sumMatches ? "text-muted-foreground text-xs" : "text-destructive text-xs font-medium"}>
              Suma de cuotas: {formatMoney(rowsSum, currency)} de{" "}
              {formatMoney(totalCents, currency)}
              {!sumMatches && ` — faltan ${formatMoney(totalCents - rowsSum, currency)}`}
            </p>
          )}
          {errors.installments && (
            <p className="text-destructive text-xs">{errors.installments[0]}</p>
          )}
        </div>
      )}

      </div>

      {/* Fijo abajo en el modal: header y botones quedan siempre accesibles
          aunque el plan de cuotas tenga muchas filas. */}
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-white/[0.06] px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row-reverse sm:items-center sm:px-6 sm:py-4">
        <Button
          type="submit"
          className="h-10 rounded-lg px-5 font-semibold sm:min-w-32"
          disabled={pending || !sumMatches || totalCents <= 0}
          onClick={() => {
            keepOpen.current = false
          }}
        >
          {pending ? "Guardando…" : movement ? "Guardar cambios" : "Guardar"}
        </Button>
        {!movement && (
          <Button
            type="submit"
            variant="ghost"
            className="h-10 rounded-lg px-4 text-muted-foreground hover:text-foreground"
            disabled={pending || !sumMatches || totalCents <= 0}
            onClick={() => {
              keepOpen.current = true
            }}
          >
            Guardar y cargar otro
          </Button>
        )}
      </div>
    </form>
  )
}
