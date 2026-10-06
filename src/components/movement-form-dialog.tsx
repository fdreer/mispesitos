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
   * cambia el disparador y el título.
   */
  movement?: MovementWithInstallments
}

export function MovementFormDialog({
  kind,
  categories,
  suggestedRate,
  today,
  movement,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {movement ? (
          // Ghost y `size="sm"`, como el de borrar: los dos viven en la fila
          // de cierre de las cuotas y son acciones del movimiento, no la
          // acción principal de la pantalla.
          <Button type="button" variant="ghost" size="sm">
            Editar
          </Button>
        ) : (
          <Button type="button">
            <Plus />
            Nuevo
          </Button>
        )}
      </DialogTrigger>
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
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
