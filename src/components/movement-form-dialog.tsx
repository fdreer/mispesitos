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
  movement?: MovementWithInstallments
  cards?: CardOption[]
  suggestions?: DescriptionSuggestion[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
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
      <DialogContent className="top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto overscroll-contain rounded-t-2xl rounded-b-none border-t border-graphite pb-[calc(1rem+env(safe-area-inset-bottom))] sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border-0 sm:pb-4">
        <div aria-hidden className="mx-auto -mt-1 mb-1 h-1 w-10 rounded-full bg-smoke sm:hidden" />
        <DialogHeader>
          <DialogTitle>{(movement ? EDIT_TITLES : TITLES)[kind]}</DialogTitle>
        </DialogHeader>
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
