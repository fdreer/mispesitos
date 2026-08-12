"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarIcon } from "lucide-react"
import { es } from "date-fns/locale"

import type { ActionResult } from "@/server/actions/result"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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
import { createMovement } from "@/server/actions/movements"
import type { Category } from "@/server/queries"

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
            className="w-full justify-start font-normal"
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

export function MovementForm({ kind, categories, suggestedRate, today, onSaved }: Props) {
  const [state, action, pending] = useActionState(createMovement, null)
  const router = useRouter()

  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS")
  const [date, setDate] = useState(today)
  const [count, setCount] = useState(1)
  const [rows, setRows] = useState<Row[]>([{ amount: "", dueDate: today }])

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
  const planKey = totalCents > 0 ? `${totalCents}|${count}|${date}` : null
  const [appliedPlanKey, setAppliedPlanKey] = useState<string | null>(null)
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

  // Mismo patrón: limpiar el formulario es un ajuste de estado disparado por
  // el resultado de la Server Action, no un efecto sobre un sistema externo.
  const [handledState, setHandledState] = useState<ActionResult | null>(null)
  if (state?.ok && state !== handledState) {
    setHandledState(state)
    setAmount("")
    setCount(1)
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
    <form action={action} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="amountCents" value={amount} />
      {/*
       * Un solo campo `rate` a la vez: en ARS va oculto en "1", en USD es el
       * visible más abajo. Dos campos con el mismo `name` haría que
       * formData.get("rate") devuelva siempre el primero del DOM y descarte
       * en silencio lo que el usuario tipeó (o un campo vacío si dolarapi no
       * respondió).
       */}
      {currency === "ARS" && <input type="hidden" name="rate" value="1" />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="description">Descripción</Label>
          <Input id="description" name="description" required maxLength={200} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="categoryId">Categoría</Label>
          <Select name="categoryId" required defaultValue={categories[0]?.id}>
            <SelectTrigger id="categoryId" className="w-full">
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

        <div className="space-y-1">
          <Label htmlFor="date">Fecha</Label>
          <DateField
            id="date"
            hiddenName="date"
            value={date}
            onChange={setDate}
            ariaLabel={`Fecha: ${formatIsoForDisplay(date)}`}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="amount">Importe</Label>
          <div className="flex gap-2">
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v as "ARS" | "USD")}
            >
              <SelectTrigger className="w-24">
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

      {currency === "USD" && (
        <div className="space-y-1">
          <Label htmlFor="rateVisible">Tipo de cambio</Label>
          <Input
            id="rateVisible"
            name="rate"
            inputMode="decimal"
            defaultValue={suggestedRate ?? ""}
            required
          />
          <p className="text-muted-foreground text-xs">
            {suggestedRate
              ? "Sugerido de hoy. Cambialo si operaste a otro valor."
              : "No pudimos traer la cotización. Escribila a mano."}
          </p>
        </div>
      )}

      {kind === "expense" && (
        <div className="space-y-1">
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
            className="w-24"
          />
        </div>
      )}

      {totalCents > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Vencimientos</p>
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-muted-foreground w-8 text-sm tabular-nums">{index + 1}</span>
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
              />
              <DateField
                hiddenName="installmentDueDate"
                value={row.dueDate}
                onChange={(next) => updateRow(index, { dueDate: next })}
                ariaLabel={`Vencimiento de la cuota ${index + 1}: ${formatIsoForDisplay(row.dueDate)}`}
              />
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

      <Button type="submit" disabled={pending || !sumMatches || totalCents <= 0}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  )
}
