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
      <DialogContent className="top-auto bottom-0 left-0 flex max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-2xl rounded-b-none border-t border-white/[0.08] p-0 shadow-2xl shadow-black/60 ring-0 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[480px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-white/[0.08]">
        <div className="shrink-0 px-5 pt-3 sm:px-6 sm:pt-5">
          <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/15 sm:hidden" />
          <DialogHeader>
            <DialogTitle className="text-[15px] font-medium text-paper">
              {(movement ? EDIT_TITLES : TITLES)[kind]}
            </DialogTitle>
          </DialogHeader>
        </div>
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
