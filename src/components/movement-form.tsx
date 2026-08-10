"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import type { ActionResult } from "@/server/actions/result"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { todayInAr } from "@/lib/dates"
import { buildInstallments } from "@/lib/installments"
import { formatMoney, parseAmountToCents } from "@/lib/money"
import { createMovement } from "@/server/actions/movements"
import type { Category } from "@/server/queries"

type Props = {
  kind: "income" | "expense"
  categories: Category[]
  /** Cotización sugerida. null cuando dolarapi no respondió: se tipea a mano. */
  suggestedRate: number | null
}

type Row = { amount: string; dueDate: string }

export function MovementForm({ kind, categories, suggestedRate }: Props) {
  const [state, action, pending] = useActionState(createMovement, null)
  const router = useRouter()

  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS")
  const [date, setDate] = useState(todayInAr())
  const [count, setCount] = useState(1)
  const [rows, setRows] = useState<Row[]>([{ amount: "", dueDate: todayInAr() }])

  const totalCents = parseAmountToCents(amount) ?? 0

  /**
   * Regenera el plan de cuotas cuando cambia el total, la cantidad de cuotas
   * o la fecha. Ajustar el estado durante el render (comparando contra la
   * última clave aplicada) en vez de en un `useEffect`: es el patrón que
   * recomienda React para "resetear estado cuando cambia una entrada" y
   * evita el render en cascada de recalcular después de pintar.
   * https://react.dev/learn/you-might-not-need-an-effect
   */
  const planKey = totalCents > 0 ? `${totalCents}|${count}|${date}` : null
  const [appliedPlanKey, setAppliedPlanKey] = useState<string | null>(null)
  if (planKey !== null && planKey !== appliedPlanKey) {
    setAppliedPlanKey(planKey)
    const planned = buildInstallments(totalCents, count, date)
    setRows(planned.map((p) => ({ amount: String(p.amountCents), dueDate: p.dueDate })))
  }

  const rowsSum = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0),
    [rows],
  )
  const sumMatches = rowsSum === totalCents

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
    }
  }, [state, router])

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
          <select
            id="categoryId"
            name="categoryId"
            required
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="date">Fecha</Label>
          <Input
            id="date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
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
            max={120}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            className="w-24"
          />
        </div>
      )}

      {totalCents > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Vencimientos</p>
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-muted-foreground w-8 text-sm">{index + 1}</span>
              <Input
                name="installmentAmount"
                inputMode="numeric"
                value={row.amount}
                onChange={(e) => updateRow(index, { amount: e.target.value })}
                aria-label={`Importe de la cuota ${index + 1} en centavos`}
              />
              <Input
                name="installmentDueDate"
                type="date"
                value={row.dueDate}
                onChange={(e) => updateRow(index, { dueDate: e.target.value })}
                aria-label={`Vencimiento de la cuota ${index + 1}`}
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
