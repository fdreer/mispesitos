"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, Plus } from "lucide-react"

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
import { CATEGORY_PALETTE, hueColor } from "@/lib/category-color"
import { formatAmountInput } from "@/lib/money"
import { cn } from "@/lib/utils"
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

function centsToInput(cents: number | null): string {
  if (cents === null) return ""
  return formatAmountInput((cents / 100).toFixed(2).replace(".", ","))
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
  const router = useRouter()
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    card ? updateCard : createCard,
    null,
  )
  const [limit, setLimit] = useState(centsToInput(card?.creditLimitCents ?? null))
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {}

  const handled = useRef<ActionResult | null>(null)
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state
      toast.success(card ? "Tarjeta guardada" : "Tarjeta creada")
      router.refresh()
      onClose()
    }
  }, [state, card, router, onClose])

  const currentColor = CATEGORY_PALETTE.some((c) => c.key === card?.color) ? card!.color : ""

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
          className="h-11"
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
            className="h-11"
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
            className="h-11"
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
            className="h-11 pl-7"
          />
        </div>
        {errors.creditLimitCents ? (
          <p className="text-destructive text-xs">{errors.creditLimitCents[0]}</p>
        ) : (
          <p className="text-muted-foreground text-xs">Sólo para mostrarte cuánto te queda disponible.</p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {[{ key: "", label: "Automático", hue: null }, ...CATEGORY_PALETTE].map((o) => (
            <label key={o.key || "auto"} className="cursor-pointer" title={o.label}>
              <input
                type="radio"
                name="color"
                value={o.key}
                defaultChecked={o.key === currentColor}
                aria-label={o.label}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border-2 border-transparent text-[10px] font-semibold",
                  "peer-checked:border-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                  o.hue === null && "border-border bg-muted",
                )}
                style={o.hue === null ? undefined : { backgroundColor: hueColor(o.hue) }}
              >
                {o.hue === null && "A"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

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
