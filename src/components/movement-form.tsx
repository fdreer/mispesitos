"use client"

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
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
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  /** Cotización sugerida. null cuando dolarapi no respondió: se tipea a mano. */
  suggestedRate: number | null
  /** Hoy según el reloj de Buenos Aires, calculado en el servidor. */
  today: IsoDate
  /**
   * El movimiento que se está editando, con sus cuotas. Ausente = alta.
   *
   * Es lo único que distingue los dos modos: de acá salen los valores
   * iniciales, el campo oculto con el id, y a cuál de las dos Server Actions
   * va el formulario.
   */
  movement?: MovementWithInstallments
  /**
   * Las tarjetas para el campo "Medio de pago" (§1.4 del plan v2), con sus
   * resúmenes. Sólo los egresos las usan; sin tarjetas, el campo no aparece.
   */
  cards?: CardOption[]
  /** Descripciones anteriores para autocompletar (§5.2 del plan v2). */
  suggestions?: DescriptionSuggestion[]
  /** Se dispara junto con `router.refresh()` al guardar. El modal la usa para cerrarse solo. */
  onSaved?: () => void
}

/**
 * `amount` es lo que la persona ve y tipea: PESOS (o dólares), en el mismo
 * formato que el campo "Importe" de más arriba. Antes esta fila mostraba
 * centavos crudos —un gasto de $1.500,50 se editaba como "150050"— así que el
 * mismo formulario pedía dos unidades distintas y la única señal de cuál era
 * cuál estaba en un `aria-label` que nadie ve.
 *
 * Al servidor sigue viajando en centavos, por un campo oculto: el contrato de
 * `createMovement` y el esquema de Zod no cambian, sólo cambia lo que se
 * muestra. Ver `installmentCents` más abajo.
 */
type Row = { amount: string; dueDate: string }

/** Centavos -> el texto que se muestra, en formato local con miles. */
function centsToInput(cents: number): string {
  return formatAmountInput((cents / 100).toFixed(2).replace(".", ","))
}

/**
 * El `numeric(12,4)` que devuelve Postgres ("1450.0000") al texto que va en el
 * campo del tipo de cambio.
 *
 * La coma no es cosmética: `parseDecimalInput` (@/lib/money) lee un punto
 * solitario seguido de exactamente tres dígitos como separador de MILES, así
 * que un TC de 1.234 puesto con punto volvería como 1234. Con coma decimal no
 * hay ninguna lectura ambigua, y es además cómo escribe decimales el resto del
 * formulario (ver `centsToInput`).
 */
function rateToInput(rate: string): string {
  return String(Number(rate)).replace(".", ",")
}

/**
 * La clave que decide si hay que regenerar el plan de cuotas. Sale de acá y no
 * de una plantilla escrita dos veces porque el modo edición la necesita ANTES
 * del primer render —para sembrar `appliedPlanKey` con el plan que ya está
 * guardado— y si las dos formas se separaran, editar un movimiento pisaría sus
 * vencimientos reales con un plan recién generado en el primer render.
 *
 * El medio de pago entra en la clave desde la Fase 3: pasar de efectivo a una
 * tarjeta cambia todos los vencimientos (los pone el resumen).
 */
function planKeyOf(totalCents: number, count: number, date: IsoDate, cardId: string): string {
  return `${totalCents}|${count}|${date}|${cardId}`
}

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
  suggestedRate,
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
  const router = useRouter()
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
  const [settled, setSettled] = useState(false)
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
  const isSettled = canSettle && settled

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
      setSettled(false)
    }
  }

  // `router.refresh()` sí es un efecto legítimo: notifica al router, no
  // actualiza estado de React, así que no dispara la regla anterior.
  //
  // Todo va UNA vez por resultado (la marca `toastedState`): `onSaved` llega
  // como flecha nueva en cada render, y sin la marca cada re-render apilaba
  // otro "Egreso cargado" —y, con "Guardar y cargar otro", cerraba el diálogo
  // que había que dejar abierto.
  const toastedState = useRef<ActionResult | null>(null)
  useEffect(() => {
    if (!state?.ok || toastedState.current === state) return
    toastedState.current = state
    router.refresh()
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
  }, [state, router, onSaved, movement, kind, categoryId])

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

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
    const match = suggestions.find(
      (s) => s.description.toLocaleLowerCase() === next.trim().toLocaleLowerCase(),
    )
    const target = match?.categoryId
    if (
      target &&
      categories.some((c) => c.id === target && !c.archived) &&
      isLeafCategory(categories, target)
    ) {
      setCategoryId(target)
    }
  }

  function setCount(next: number) {
    setCountInput(String(Math.min(Math.max(next, 1), MAX_INSTALLMENTS)))
  }

  const dueDatesForSummary = rows.map((r) => r.dueDate)
  const datalistId = `${ids}-descripciones`
  const rowsId = `${ids}-cuotas`

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5">
      {/* Sólo editando. `updateMovement` lo valida como UUID y filtra además
          por usuario, igual que borrar: que el id viaje por el formulario no
          lo hace más confiable que cualquier otro campo. */}
      {movement && <input type="hidden" name="id" value={movement.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="amountCents" value={amount} />
      <input type="hidden" name="creditCardId" value={isCard ? cardId : ""} />
      {!movement && <input type="hidden" name="settled" value={isSettled ? "true" : "false"} />}
      {/*
       * Un solo campo `rate` a la vez: en ARS va oculto en "1", en USD es el
       * visible más abajo. Dos campos con el mismo `name` haría que
       * formData.get("rate") devuelva siempre el primero del DOM y descarte
       * en silencio lo que el usuario tipeó (o un campo vacío si dolarapi no
       * respondió).
       */}
      {currency === "ARS" && <input type="hidden" name="rate" value="1" />}

      {/* El error general arriba (§5.2). Si la acción marcó campos, cada uno
          lleva el suyo al lado y acá sólo se avisa que hay que mirarlos. */}
      {state && !state.ok && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {hasFieldErrors ? "Revisá los campos marcados." : state.message}
        </p>
      )}

      {/* Importe primero (§5.2): es lo único que siempre hay que escribir, y
          con el foco puesto el diálogo arranca listo para tipear. */}
      <div className="space-y-2">
        <Label htmlFor="amount">Importe</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg">
              {currency === "USD" ? "US$" : "$"}
            </span>
            <Input
              ref={amountRef}
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
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
              className={cn("h-12 text-lg tabular-nums", currency === "USD" ? "pl-14" : "pl-8")}
            />
          </div>
          <Segmented
            label="Moneda"
            value={currency}
            onChange={setCurrency}
            options={[
              { value: "ARS", label: "ARS" },
              { value: "USD", label: "USD" },
            ]}
            className="sm:w-36"
          />
        </div>
        {errors.amountCents && <p className="text-destructive text-xs">{errors.amountCents[0]}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Input
            ref={descriptionRef}
            id="description"
            name="description"
            required
            maxLength={200}
            autoComplete="off"
            enterKeyHint="next"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                document.getElementById("categoryId")?.focus()
              }
            }}
            list={suggestions.length > 0 ? datalistId : undefined}
            value={description}
            onChange={(e) => changeDescription(e.target.value)}
            aria-invalid={errors.description !== undefined}
            className="h-11"
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

        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoría</Label>
          {/* Editando arranca en la del movimiento, que puede ser una archivada:
              el selector la sigue ofreciendo (`keepId`). Sin eso, abrir el
              diálogo de un movimiento viejo lo movía de categoría con sólo
              guardarlo. */}
          <CategoryPicker
            id="categoryId"
            name="categoryId"
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            invalid={errors.categoryId !== undefined}
          />
          {errors.categoryId && <p className="text-destructive text-xs">{errors.categoryId[0]}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">{isCard ? "Fecha de la compra" : "Fecha"}</Label>
          <DateField
            id="date"
            hiddenName="date"
            value={date}
            onChange={setDate}
            ariaLabel={`Fecha: ${formatIsoForDisplay(date)}`}
          />
          {errors.date && <p className="text-destructive text-xs">{errors.date[0]}</p>}
        </div>

        {currency === "USD" && (
          <div className="space-y-2">
            <Label htmlFor="rateVisible">Tipo de cambio</Label>
            {/* Editando gana el TC con el que se guardó: es el del día de la
                operación, y el sugerido de hoy no tiene nada que ver con ella.
                Sólo si el movimiento estaba en pesos y se lo pasa a dólares acá
                mismo no hay TC anterior, y ahí sí vale el sugerido. */}
            <Input
              id="rateVisible"
              name="rate"
              inputMode="decimal"
              defaultValue={
                movement && movement.currency === "USD"
                  ? rateToInput(movement.rate)
                  : (suggestedRate ?? "")
              }
              required
              aria-invalid={errors.rate !== undefined}
              className="h-11"
            />
            {errors.rate ? (
              <p className="text-destructive text-xs">{errors.rate[0]}</p>
            ) : (
              !movement && (
                <p className="text-muted-foreground text-xs">
                  {suggestedRate
                    ? "Sugerido de hoy. Cambialo si operaste a otro valor."
                    : "No pudimos traer la cotización. Escribila a mano."}
                </p>
              )
            )}
          </div>
        )}
      </div>

      {/* Medio de pago (§1.4 del plan v2). Sin tarjetas cargadas no aparece:
          sería una pregunta con una sola respuesta. */}
      {kind === "expense" && cardChoices.length > 0 && (
        <div className="space-y-2">
          <p aria-hidden className="text-sm font-medium">
            Medio de pago
          </p>
          <Segmented
            label="Medio de pago"
            value={cardId}
            onChange={setCardId}
            wrap
            options={[
              { value: "", label: "Efectivo / débito" },
              ...cardChoices.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          {errors.creditCardId && (
            <p className="text-destructive text-xs">{errors.creditCardId[0]}</p>
          )}
        </div>
      )}

      {/* "Ya lo pagué / Lo voy a pagar" (§5.2) en lugar del checkbox. Con
          tarjeta no se ofrece: se paga con el resumen (§1.3). */}
      {canSettle && (
        <Segmented
          label={kind === "income" ? "Estado del cobro" : "Estado del pago"}
          value={settled ? "yes" : "no"}
          onChange={(v) => setSettled(v === "yes")}
          options={
            kind === "income"
              ? [
                  { value: "yes", label: "Ya lo cobré" },
                  { value: "no", label: "Lo voy a cobrar" },
                ]
              : [
                  { value: "yes", label: "Ya lo pagué" },
                  { value: "no", label: "Lo voy a pagar" },
                ]
          }
        />
      )}

      {kind === "expense" && !isSettled && (
        <div className="space-y-2">
          <Label htmlFor="count">Cuotas</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 rounded-r-none"
                aria-label="Una cuota menos"
                disabled={!countValid || count <= 1}
                onClick={() => setCount(count - 1)}
              >
                <Minus />
              </Button>
              <Input
                id="count"
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={countInput}
                aria-invalid={!countValid}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setCountInput(e.target.value)}
                className="h-11 w-16 rounded-none border-x-0 text-center tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 rounded-l-none"
                aria-label="Una cuota más"
                disabled={!countValid || count >= MAX_INSTALLMENTS}
                onClick={() => setCount(count + 1)}
              >
                <Plus />
              </Button>
            </div>
            <div className="flex gap-1" role="group" aria-label="Cantidades frecuentes">
              {COUNT_SHORTCUTS.map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={countValid && count === n ? "secondary" : "ghost"}
                  aria-pressed={countValid && count === n}
                  aria-label={n === 1 ? "1 cuota" : `${n} cuotas`}
                  onClick={() => setCount(n)}
                  className="h-9 min-w-9"
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>
          {!countValid && (
            <p className="text-destructive text-xs" role="alert">
              Ingresá un número entero entre 1 y {MAX_INSTALLMENTS}.
            </p>
          )}
        </div>
      )}

      {totalCents > 0 && isSettled && (
        <>
          <input type="hidden" name="installmentAmount" value={totalCents} />
          <input type="hidden" name="installmentDueDate" value={date} />
          <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-primary">
            {kind === "income" ? "Cobrado" : "Pagado"} por {formatMoney(totalCents, currency)} en la
            fecha del movimiento.
          </p>
        </>
      )}

      {totalCents > 0 && !isSettled && (
        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 text-sm">
              <p className="font-medium" aria-live="polite">
                {planSummary(installmentCents, dueDatesForSummary, currency, today)}
              </p>
              {card && statementPlan?.[0] && (
                <p className="text-muted-foreground text-xs">
                  {card.name} · {count > 1 ? "primer resumen" : "resumen"}{" "}
                  {formatPeriod(statementPlan[0].period)}, cierra el{" "}
                  {formatShortDate(statementPlan[0].closingDate, today)}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={showRows}
              aria-controls={rowsId}
              onClick={() => setPlanOpen((o) => !o)}
            >
              {showRows ? "Ocultar cuotas" : "Editar cuotas"}
            </Button>
          </div>

          {paidStatementHit >= 0 && statementPlan && (
            <p className="text-destructive text-xs" role="alert">
              La cuota {paidStatementHit + 1} cae en el resumen de{" "}
              {formatPeriod(statementPlan[paidStatementHit].period)}, que ya está pagado.
            </p>
          )}

          {/* Las filas viajan siempre en el FormData, se vean o no: el plan
              colapsado sigue siendo el plan que se guarda. */}
          <div id={rowsId} className={cn("space-y-3", !showRows && "hidden")}>
            {rows.map((row, index) => (
              <div key={index} className="flex flex-wrap items-center gap-3">
                <span className="text-muted-foreground w-8 shrink-0 text-sm tabular-nums">
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
                <Input
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => updateRow(index, { amount: formatAmountInput(e.target.value, row.amount) })}
                  aria-label={`Importe de la cuota ${index + 1}`}
                  aria-invalid={row.amount !== "" && installmentCents[index] === null}
                  className="h-11 min-w-0 flex-1 basis-24"
                />
                {/* Ancho propio (no el `w-full` del botón sin envolver): en la
                    fila `flex-wrap`, sin este div el botón competía por el mismo
                    espacio que el importe y desbordaba el formulario en mobile.
                    Acá abajo del ancho de `sm` pasa a su propia línea completa;
                    de `sm` para arriba comparte fila con margen de sobra. */}
                <div className="w-full sm:w-auto sm:flex-1">
                  {card && statementPlan?.[index] ? (
                    // Con tarjeta el vencimiento no se elige: es el del
                    // resumen. Se corrige desde /tarjetas, para todas las
                    // cuotas de ese resumen a la vez.
                    <>
                      <input type="hidden" name="installmentDueDate" value={row.dueDate} />
                      {/* Dos renglones que no se cortan: en una sola línea, al
                          lado del importe y en un diálogo angosto, la fecha y
                          el resumen se partían en cuatro pedazos. */}
                      <p className="text-muted-foreground flex min-h-11 flex-col justify-center text-sm leading-tight">
                        <span className="whitespace-nowrap">
                          Vence {formatIsoForDisplay(row.dueDate)}
                        </span>
                        <span className="text-xs whitespace-nowrap">
                          resumen {formatPeriod(statementPlan[index].period)}
                        </span>
                      </p>
                    </>
                  ) : (
                    <DateField
                      hiddenName="installmentDueDate"
                      value={row.dueDate}
                      onChange={(next) => updateRow(index, { dueDate: next })}
                      ariaLabel={`Vencimiento de la cuota ${index + 1}: ${formatIsoForDisplay(row.dueDate)}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          {countValid && (showRows || !sumMatches) && (
            <p className={sumMatches ? "text-muted-foreground text-xs" : "text-destructive text-xs"}>
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

      {/* Fijo abajo en el teléfono (§5.2): con el plan de cuotas desplegado
          el botón quedaba varias pantallas más abajo. */}
      <div className="sticky -bottom-4 z-10 -mx-4 flex flex-col gap-2 border-t border-border/70 bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:flex-row-reverse sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button
          type="submit"
          className="h-11 sm:flex-1"
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
            variant="outline"
            className="h-11 sm:flex-1"
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
