"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { MovementForm } from "@/components/movement-form"
import type { IsoDate } from "@/lib/dates"
import type { CardOption, DescriptionSuggestion } from "@/server/card-queries"
import type { Category, MovementWithInstallments } from "@/server/queries"

const TITLES: Record<"income" | "expense", string> = {
  income: "Nuevo ingreso",
  expense: "Nuevo egreso",
}

const EDIT_TITLES: Record<"income" | "expense", string> = {
  income: "Editar ingreso",
  expense: "Editar egreso",
}

type Props = {
  kind: "income" | "expense"
  categories: Category[]
  suggestedRate: number | null
  today: IsoDate
  /**
   * Presente = editar ese movimiento; ausente = dar de alta uno nuevo. Es la
   * misma prop que distingue los dos modos de `MovementForm`, y acá además
   * cambia el título.
   */
  movement?: MovementWithInstallments
  /** Para el medio de pago y el autocompletado (ver `MovementForm`). */
  cards?: CardOption[]
  suggestions?: DescriptionSuggestion[]
  /**
   * Abierto desde afuera, sin disparador propio: es como lo usa el menú ⋯ de
   * cada fila (`MovementRowActions`), donde "Editar" es un ítem del menú y no
   * un botón suelto.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Texto del botón disparador cuando no es controlado ("Nuevo" por defecto). */
  triggerLabel?: string
}

export function MovementFormDialog({
  kind,
  categories,
  suggestedRate,
  today,
  movement,
  cards,
  suggestions,
  open: controlledOpen,
  onOpenChange,
  triggerLabel = "Nuevo",
}: Props) {
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : ownOpen
  const setOpen = controlled ? (onOpenChange ?? (() => {})) : setOwnOpen

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button type="button">
            <Plus />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{(movement ? EDIT_TITLES : TITLES)[kind]}</DialogTitle>
        </DialogHeader>
        {/* Cada apertura arranca del movimiento tal como está guardado: el
            portal de Radix desmonta este contenido al cerrar, así que el
            estado del formulario no sobrevive de una apertura a la otra. */}
        <MovementForm
          kind={kind}
          categories={categories}
          suggestedRate={suggestedRate}
          today={today}
          movement={movement}
          cards={cards}
          suggestions={suggestions}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
