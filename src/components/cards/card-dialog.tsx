"use client"

import { useActionState, useState } from "react"
import { toast } from "sonner"
import { Pencil, Plus } from "lucide-react"

import { ColorSwatchField } from "@/components/color-swatch-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActionSuccess } from "@/hooks/use-action-success"
import { centsToAmountInput, formatAmountInput } from "@/lib/money"
import { createCard, updateCard } from "@/server/actions/cards"
import type { ActionResult } from "@/server/actions/result"

export type EditableCard = {
  id: string
  name: string
  closingDay: number
  dueDay: number
  creditLimitCents: number | null
  color: string | null
}

export function CardDialog({ card }: { card?: EditableCard }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {card ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil />
          Editar tarjeta
        </Button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus />
          Nueva tarjeta
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {open && <CardForm card={card} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function CardForm({ card, onClose }: { card?: EditableCard; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    card ? updateCard : createCard,
    null,
  )
  const [limit, setLimit] = useState(centsToAmountInput(card?.creditLimitCents ?? null))
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {}

  useActionSuccess(state, () => {
    toast.success(card ? "Tarjeta guardada" : "Tarjeta creada")
    onClose()
  })

  return (
    <form action={action} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{card ? "Editar tarjeta" : "Nueva tarjeta"}</DialogTitle>
        <DialogDescription>
          El cierre y el vencimiento habituales. Cada resumen los propone, y los podés corregir
          cuando llega el resumen real.
        </DialogDescription>
      </DialogHeader>

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      {card && <input type="hidden" name="id" value={card.id} />}

      <div className="space-y-2">
        <Label htmlFor="card-name">Nombre</Label>
        <Input
          id="card-name"
          name="name"
          required
          maxLength={60}
          defaultValue={card?.name ?? ""}
          placeholder="Visa Galicia"
          autoFocus
          aria-invalid={errors.name !== undefined}
          className="h-10"
        />
        {errors.name && <p className="text-destructive text-xs">{errors.name[0]}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="card-closing">Día de cierre</Label>
          <Input
            id="card-closing"
            name="closingDay"
            inputMode="numeric"
            required
            maxLength={2}
            defaultValue={card?.closingDay ?? ""}
            aria-invalid={errors.closingDay !== undefined}
            className="h-10"
          />
          {errors.closingDay && <p className="text-destructive text-xs">{errors.closingDay[0]}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="card-due">Día de vencimiento</Label>
          <Input
            id="card-due"
            name="dueDay"
            inputMode="numeric"
            required
            maxLength={2}
            defaultValue={card?.dueDay ?? ""}
            aria-invalid={errors.dueDay !== undefined}
            className="h-10"
          />
          {errors.dueDay && <p className="text-destructive text-xs">{errors.dueDay[0]}</p>}
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Si el vencimiento es un día menor que el cierre, vence el mes siguiente.
      </p>

      <div className="space-y-2">
        <Label htmlFor="card-limit">Límite (opcional)</Label>
        <div className="relative">
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
            $
          </span>
          <Input
            id="card-limit"
            name="creditLimit"
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(formatAmountInput(e.target.value, limit))}
            aria-invalid={errors.creditLimitCents !== undefined}
            className="h-10 pl-7"
          />
        </div>
        {errors.creditLimitCents ? (
          <p className="text-destructive text-xs">{errors.creditLimitCents[0]}</p>
        ) : (
          <p className="text-muted-foreground text-xs">Sólo para mostrarte cuánto te queda disponible.</p>
        )}
      </div>

      <ColorSwatchField defaultValue={card?.color ?? null} />

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : card ? "Guardar" : "Crear tarjeta"}
        </Button>
      </DialogFooter>
    </form>
  )
}
