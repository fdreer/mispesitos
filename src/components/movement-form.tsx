"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarIcon } from "lucide-react"
import { es } from "date-fns/locale"

import type { ActionResult } from "@/server/actions/result"

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
import { dateToIso, formatIsoForDisplay, isoToDate, type IsoDate } from "@/lib/dates"
import { buildInstallments, MAX_INSTALLMENTS } from "@/lib/installments"
import { formatMoney, parseAmountToCents } from "@/lib/money"
import { assertCurrency } from "@/lib/movement-asserts"
import { createMovement, updateMovement } from "@/server/actions/movements"
import type { Category, MovementWithInstallments } from "@/server/queries"

/**
 * Un solo picker para la fecha principal y cada vencimiento de cuota: mismo
 * Popover + Calendar que exchange-form.tsx y settings-form.tsx, no el
 * `<input type="date">` nativo (calendario del sistema operativo, no respeta
 * el tema oscuro). El estado de apertura vive ACÁ, por instancia: con hasta
 * MAX_INSTALLMENTS filas de vencimiento en pantalla, cada una necesita poder
 * abrirse y cerrarse sola.
 *
 * `ariaLabel` viaja completo desde el llamador (no sólo un título): reproduce
 * el mismo hallazgo D que ya resolvieron exchange-form.tsx y
 * movement-filters.tsx —un <label htmlFor> que apunte a este botón le gana la
 * resolución de nombre accesible al contenido y corta ahí sin leer la fecha—
 * así que acá también hace falta el mismo `aria-label` con el valor adentro.
 */
function DateField({
  id,
  value,
  onChange,
  ariaLabel,
  hiddenName,
}: {
  id?: string
  value: IsoDate
  onChange: (next: IsoDate) => void
  ariaLabel: string
  hiddenName?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {hiddenName && <input type="hidden" name={hiddenName} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={ariaLabel}
            className="h-11 w-full justify-start font-normal"
          >
            <CalendarIcon />
            {formatIsoForDisplay(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={es}
            required
            selected={isoToDate(value)}
            defaultMonth={isoToDate(value)}
            onSelect={(d) => {
              onChange(dateToIso(d))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </>
  )
}

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

/** Centavos -> el texto que se muestra en la fila, en formato local. */
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",")
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
 */
function planKeyOf(totalCents: number, count: number, date: IsoDate): string {
  return `${totalCents}|${count}|${date}`
}

export function MovementForm({
  kind,
  categories,
  suggestedRate,
  today,
  movement,
  onSaved,
}: Props) {
  const [state, action, pending] = useActionState(
    movement ? updateMovement : createMovement,
    null,
  )
  const router = useRouter()

  const [amount, setAmount] = useState(movement ? centsToInput(movement.amountCents) : "")
  const [currency, setCurrency] = useState<"ARS" | "USD">(
    movement ? assertCurrency(movement.currency) : "ARS",
  )
  const [date, setDate] = useState(movement?.date ?? today)
  const [settled, setSettled] = useState(false)
  const [count, setCount] = useState(movement?.installments.length ?? 1)
  const [rows, setRows] = useState<Row[]>(
    movement
      ? movement.installments.map((i) => ({
          amount: centsToInput(i.amountCents),
          dueDate: i.dueDate,
        }))
      : [{ amount: "", dueDate: today }],
  )

  // Los centavos de cada fila, derivados de lo tipeado. `null` cuando el texto
  // todavía no es un número: eso hace que la suma no cierre y el botón quede
  // deshabilitado, que es exactamente lo que tiene que pasar mientras una
  // fila está a medio escribir.
  const installmentCents = rows.map((r) => parseAmountToCents(r.amount))

  const totalCents = parseAmountToCents(amount) ?? 0

  /**
   * Regenera el plan de cuotas cuando cambia el total, la cantidad de cuotas
   * o la fecha. Ajustar el estado durante el render (comparando contra la
   * última clave aplicada) en vez de en un `useEffect`: es el patrón que
   * recomienda React para "resetear estado cuando cambia una entrada" y
   * evita el render en cascada de recalcular después de pintar.
   * https://react.dev/learn/you-might-not-need-an-effect
   */
  // `date` sale siempre de `DateField` —nunca de tipeo libre—, así que
  // siempre es un día real: a diferencia del viejo `<input type="date">`, acá
  // no hay estado intermedio a medio completar que proteger.
  const planKey = totalCents > 0 ? planKeyOf(totalCents, count, date) : null
  // Sembrado con el plan que ya está guardado cuando se edita: sin esto el
  // primer render vería `null !== planKey` y regeneraría las cuotas con
  // `buildInstallments`, pisando los vencimientos e importes reales —incluidos
  // los de las cuotas ya pagas— antes de que nadie tocara nada.
  const [appliedPlanKey, setAppliedPlanKey] = useState<string | null>(
    movement
      ? planKeyOf(movement.amountCents, movement.installments.length, movement.date)
      : null,
  )
  if (planKey !== null && planKey !== appliedPlanKey) {
    setAppliedPlanKey(planKey)
    const planned = buildInstallments(totalCents, count, date)
    setRows(planned.map((p) => ({ amount: centsToInput(p.amountCents), dueDate: p.dueDate })))
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
  const sumMatches = rowsSum === totalCents && installmentCents.every((c) => c !== null)
  const settledLabel = kind === "income" ? "Cobrado" : "Pagado"

  // Mismo patrón: limpiar el formulario es un ajuste de estado disparado por
  // el resultado de la Server Action, no un efecto sobre un sistema externo.
  const [handledState, setHandledState] = useState<ActionResult | null>(null)
  if (state?.ok && state !== handledState) {
    setHandledState(state)
    // Sólo al dar de alta: vaciar el formulario deja listo el próximo. Editando
    // no hay próximo —el diálogo se cierra— y borrarlo se vería como que los
    // datos se perdieron si algo dejara el diálogo abierto.
    if (!movement) {
      setAmount("")
      setCount(1)
    }
  }

  // `router.refresh()` sí es un efecto legítimo: notifica al router, no
  // actualiza estado de React, así que no dispara la regla anterior.
  useEffect(() => {
    if (state?.ok) {
      router.refresh()
      onSaved?.()
    }
  }, [state, router, onSaved])

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5">
      {/* Sólo editando. `updateMovement` lo valida como UUID y filtra además
          por usuario, igual que borrar: que el id viaje por el formulario no
          lo hace más confiable que cualquier otro campo. */}
      {movement && <input type="hidden" name="id" value={movement.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="amountCents" value={amount} />
      {!movement && <input type="hidden" name="settled" value={settled ? "true" : "false"} />}
      {/*
       * Un solo campo `rate` a la vez: en ARS va oculto en "1", en USD es el
       * visible más abajo. Dos campos con el mismo `name` haría que
       * formData.get("rate") devuelva siempre el primero del DOM y descarte
       * en silencio lo que el usuario tipeó (o un campo vacío si dolarapi no
       * respondió).
       */}
      {currency === "ARS" && <input type="hidden" name="rate" value="1" />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Input
            id="description"
            name="description"
            required
            maxLength={200}
            defaultValue={movement?.description ?? ""}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoría</Label>
          {/* Editando arranca en la del movimiento, que puede ser una archivada:
              la lista que llega en ese caso las incluye (ver `MovementList`).
              Sin eso, abrir el diálogo de un movimiento viejo lo movía de
              categoría con sólo guardarlo. */}
          <Select
            name="categoryId"
            required
            defaultValue={movement?.categoryId ?? categories[0]?.id}
          >
            <SelectTrigger id="categoryId" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Fecha</Label>
          <DateField
            id="date"
            hiddenName="date"
            value={date}
            onChange={setDate}
            ariaLabel={`Fecha: ${formatIsoForDisplay(date)}`}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Importe</Label>
          <div className="flex gap-2">
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="h-11"
            />
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v as "ARS" | "USD")}
            >
              <SelectTrigger className="h-11 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ARS">ARS</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!movement && (
        <div className="flex min-h-11 items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
          <Checkbox
            id="settled"
            aria-label={settledLabel}
            checked={settled}
            onCheckedChange={(checked) => setSettled(checked === true)}
          />
          <Label htmlFor="settled" className="cursor-pointer items-start gap-1.5 leading-snug">
            <span className="font-medium">{settledLabel}</span>
          </Label>
        </div>
      )}

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
            className="h-11"
          />
          {!movement && (
            <p className="text-muted-foreground text-xs">
              {suggestedRate
                ? "Sugerido de hoy. Cambialo si operaste a otro valor."
                : "No pudimos traer la cotización. Escribila a mano."}
            </p>
          )}
        </div>
      )}

      {kind === "expense" && !settled && (
        <div className="space-y-2">
          <Label htmlFor="count">Cuotas</Label>
          <Input
            id="count"
            type="number"
            min={1}
            max={MAX_INSTALLMENTS}
            value={count}
            // El clamp va en el estado, no sólo en el atributo `max`: `max`
            // valida al hacer submit, y las filas se generan al tipear. Sin
            // esto, escribir 99999 pinta 99.999 filas y cuelga la pestaña
            // antes de que haya un submit que validar.
            onChange={(e) =>
              setCount(Math.min(MAX_INSTALLMENTS, Math.max(1, Number(e.target.value) || 1)))
            }
            className="h-11 w-24"
          />
        </div>
      )}

      {totalCents > 0 && settled && (
        <>
          <input type="hidden" name="installmentAmount" value={totalCents} />
          <input type="hidden" name="installmentDueDate" value={date} />
          <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-primary">
            {settledLabel} por {formatMoney(totalCents, currency)} en la fecha del movimiento.
          </p>
        </>
      )}

      {totalCents > 0 && !settled && (
        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:p-4">
          <p className="text-sm font-medium">Vencimientos</p>
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
                onChange={(e) => updateRow(index, { amount: e.target.value })}
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
                <DateField
                  hiddenName="installmentDueDate"
                  value={row.dueDate}
                  onChange={(next) => updateRow(index, { dueDate: next })}
                  ariaLabel={`Vencimiento de la cuota ${index + 1}: ${formatIsoForDisplay(row.dueDate)}`}
                />
              </div>
            </div>
          ))}
          <p className={sumMatches ? "text-muted-foreground text-xs" : "text-destructive text-xs"}>
            Suma de cuotas: {formatMoney(rowsSum, currency)} de{" "}
            {formatMoney(totalCents, currency)}
            {!sumMatches && ` — faltan ${formatMoney(totalCents - rowsSum, currency)}`}
          </p>
        </div>
      )}

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <Button type="submit" className="h-11 w-full" disabled={pending || !sumMatches || totalCents <= 0}>
        {pending ? "Guardando…" : movement ? "Guardar cambios" : "Guardar"}
      </Button>
    </form>
  )
}
