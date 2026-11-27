"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

import { MovementForm } from "@/components/movement-form"
import { MOVEMENT_SHEET_CLASS } from "@/components/movement-form-dialog"
import { Segmented } from "@/components/segmented"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { IsoDate } from "@/lib/dates"
import { defaultQuickAddKind, QUICK_ADD_EVENT } from "@/lib/mobile-nav"
import type { CardOption, DescriptionSuggestion } from "@/server/card-queries"
import type { Category } from "@/server/queries"

export type QuickAddData = {
  expenseCategories: Category[]
  incomeCategories: Category[]
  cards: CardOption[]
  expenseSuggestions: DescriptionSuggestion[]
  incomeSuggestions: DescriptionSuggestion[]
  suggestedRate: number | null
  today: IsoDate
}

type Props = QuickAddData & {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function QuickAddSheet({
  expenseCategories,
  incomeCategories,
  cards,
  expenseSuggestions,
  incomeSuggestions,
  suggestedRate,
  today,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const pathname = usePathname()
  const [ownOpen, setOwnOpen] = useState(false)
  const [kind, setKind] = useState<"income" | "expense">(() => defaultQuickAddKind(pathname))

  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : ownOpen
  const setOpen = controlled ? (onOpenChange ?? (() => {})) : setOwnOpen

  useEffect(() => {
    if (controlled) return
    function handleOpen() {
      setKind(defaultQuickAddKind(pathname))
      setOwnOpen(true)
    }
    window.addEventListener(QUICK_ADD_EVENT, handleOpen)
    return () => window.removeEventListener(QUICK_ADD_EVENT, handleOpen)
  }, [controlled, pathname])

  const categories = kind === "income" ? incomeCategories : expenseCategories
  const suggestions = kind === "income" ? incomeSuggestions : expenseSuggestions

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={MOVEMENT_SHEET_CLASS}>
        <div className="shrink-0 px-5 pt-3 sm:px-6 sm:pt-5">
          <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/15 sm:hidden" />
          <DialogHeader className="gap-3">
            <DialogTitle className="text-[15px] font-medium text-paper">{kind === "income" ? "Nuevo ingreso" : "Nuevo egreso"}</DialogTitle>
            <Segmented
              label="Tipo de movimiento"
              value={kind}
              onChange={setKind}
              size="sm"
              options={[
                { value: "expense", label: "Egreso" },
                { value: "income", label: "Ingreso" },
              ]}
            />
          </DialogHeader>
        </div>
        <MovementForm
          key={kind}
          kind={kind}
          categories={categories}
          cards={kind === "expense" ? cards : []}
          suggestions={suggestions}
          suggestedRate={suggestedRate}
          today={today}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
